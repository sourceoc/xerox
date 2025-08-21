// ====== Config & util ======
const el = s => document.querySelector(s);
const els = s => Array.from(document.querySelectorAll(s));

const FIXED_CFG = { owner:'sourceoc', repo:'xerox', path:'xerox_data_agosto.json', branch:'main' };
const AUTO_SAVE = true, AUTO_SAVE_DELAY = 1200, MAX_RETRY_409 = 1;

const $ = {
  tokenBtn: el('#tokenBtn'), tokenModal: el('#tokenModal'),
  tokenInput: el('#tokenInput'), rememberToken: el('#rememberToken'), saveToken: el('#saveToken'),
  tokenStatus: el('#tokenStatus'), shaStatus: el('#shaStatus'), dirtyStatus: el('#dirtyStatus'),
  loadBtn: el('#loadBtn'), saveBtn: el('#saveBtn'), refreshShaBtn: el('#refreshShaBtn'),
  diagBtn: el('#diagBtn'), diagModal: el('#diagModal'), diagOutput: el('#diagOutput'),
  repairBtn: el('#repairBtn'),
  undoBtn: el('#undoBtn'),
  importBtn: el('#importBtn'), importFile: el('#importFile'),
  search: el('#search'), disciplineFilter: el('#disciplineFilter'), clearFilters: el('#clearFilters'),
  month: el('#month'), used: el('#usedCopies'), total: el('#totalCopies'), usedBar: el('#usedBar'),
  tbody: el('#profTbody'), rowTpl: el('#rowTemplate'), addRow: el('#addRow'), recalc: el('#recalcTotals'), exportJson: el('#exportJson'), exportCsv: el('#exportCsv')
};

const state = {
  sha: null, data: null, filtered: [], token: null,
  saving: false, autosaveTimer: null, pendingSave: false,
  lastShaAt: null, lastSaveAt: null, dirty:false,
  undoStack: [], maxUndo: 25, confirmRemove: true
};

function apiHeaders(){ const h={'Accept':'application/vnd.github+json'}; if(state.token) h.Authorization=`Bearer ${state.token}`; return h; }
const ghGet = () => `https://api.github.com/repos/${FIXED_CFG.owner}/${FIXED_CFG.repo}/contents/${encodeURIComponent(FIXED_CFG.path)}?ref=${encodeURIComponent(FIXED_CFG.branch)}`;
const ghPut = () => `https://api.github.com/repos/${FIXED_CFG.owner}/${FIXED_CFG.repo}/contents/${encodeURIComponent(FIXED_CFG.path)}`;

function toBase64Utf8(str){ return btoa(unescape(encodeURIComponent(str))); } // UTF-8 puro
function fromBase64Utf8(b64){ return decodeURIComponent(escape(atob(b64))); } // tenta recodificar corretamente
function stripBOM(s){ return s.replace(/^\uFEFF/, ''); }
function nowIso(){ return new Date().toISOString(); }
function timeAgo(ms){ if(!ms) return '—'; const s=Math.floor((Date.now()-ms)/1000); if(s<60) return s+'s'; const m=Math.floor(s/60); if(m<60) return m+'m'; const h=Math.floor(m/60); return h+'h'; }
function toast(msg){ const t=document.createElement('div'); t.className='toast'; Object.assign(t.style,{position:'fixed',bottom:'16px',right:'16px',background:'#162143',color:'#e9eef9',padding:'10px 14px',borderRadius:'12px',border:'1px solid rgba(255,255,255,.08)',zIndex:9999}); t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), 2200); }
function capitalize(s){ try{ return s.charAt(0).toUpperCase()+s.slice(1); }catch{ return s; } }
function toNum(v){ return Number(String(v).replace(/[^\d.-]/g,'')||0); }
function safePct(used,total){ return total>0? Math.min(100, Math.round(used/total*100)) : 0; }
function escapeHtml(s){ return String(s).replace(/[&<>\"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }
function clone(obj){ return JSON.parse(JSON.stringify(obj||{})); }

function updateBadges(){
  $.tokenStatus.textContent = 'Token: ' + (state.token ? 'Config.' : '—');
  $.shaStatus.textContent = 'SHA: ' + (state.sha ? ('ok ('+timeAgo(state.lastShaAt)+' atrás)') : '—');
  $.dirtyStatus.textContent = 'Estado: ' + (state.dirty ? 'alterações' : 'salvo');
}

function markDirty(v=true){ state.dirty = v; updateBadges(); if(v){ saveDraftLocal(); } }

// ====== Draft local e proteção de saída ======
function saveDraftLocal(){ try{ localStorage.setItem('xerox-draft', JSON.stringify({ts:Date.now(), data: state.data})); }catch{} }
function getDraftLocal(){ try{ const j = localStorage.getItem('xerox-draft'); return j? JSON.parse(j):null; }catch{ return null; } }
window.addEventListener('beforeunload', (e)=>{ if(state.dirty){ e.preventDefault(); e.returnValue=''; } });

// ====== GitHub ======
async function refreshSha(){
  const res = await fetch(ghGet(), { headers: apiHeaders() });
  if(!res.ok){
    if(res.status===404){
      $.repairBtn.style.display = 'inline-block';
      throw new Error('Arquivo não existe no repositório (404). Use "Reparar JSON" para criar.');
    }
    throw new Error(`Falha ao obter SHA: ${res.status} ${await res.text()}`);
  }
  const j = await res.json();
  state.sha = j.sha;
  state.lastShaAt = Date.now();

  // decode + parse
  let decoded;
  try{ decoded = stripBOM(fromBase64Utf8(j.content.replace(/\\n/g,''))); }
  catch(e){ decoded = atob(j.content.replace(/\\n/g,'')); }
  try{ state.data = JSON.parse(decoded); }
  catch(e){ $.repairBtn.style.display = 'inline-block'; alert('JSON inválido no repositório. Use "Reparar JSON".'); throw e; }

  // Checar draft local
  const draft = getDraftLocal();
  if(draft && draft.data && JSON.stringify(draft.data)!==JSON.stringify(state.data)){
    if(confirm('Existe um rascunho local mais recente. Deseja restaurar?')){
      pushUndo(); state.data = draft.data; renderAll(); markDirty(true); return;
    }
  }
  updateBadges();
}

async function loadFromGitHub(){
  $.saveBtn.disabled = true;
  await refreshSha();
  renderAll();
  markDirty(false);
  $.saveBtn.disabled = false;
}

async function saveToGitHub(manual=false){
  if(!state.token){ alert('Configure o token (botão no topo).'); return; }
  if(!state.data){ alert('Nada para salvar. Carregue o JSON primeiro.'); return; }
  state.saving = true;
  const content = JSON.stringify(state.data, null, 2);
  const body = () => ({
    message: `atualiza ${FIXED_CFG.path} [`+(manual?'manual':'auto')+`] ${nowIso()}`,
    content: toBase64Utf8(content),
    sha: state.sha,
    branch: FIXED_CFG.branch
  });

  let res = await fetch(ghPut(), { method:'PUT', headers:{...apiHeaders(),'Content-Type':'application/json'}, body: JSON.stringify(body()) });
  let retried = 0;
  while(res.status===409 && retried < MAX_RETRY_409){
    await refreshSha();
    res = await fetch(ghPut(), { method:'PUT', headers:{...apiHeaders(),'Content-Type':'application/json'}, body: JSON.stringify(body()) });
    retried++;
  }

  if(!res.ok){
    const txt = await res.text();
    alert(`Falha ao salvar: ${res.status} ${txt}`);
  }else{
    const out = await res.json();
    state.sha = out.content.sha;
    state.lastSaveAt = Date.now();
    markDirty(false);
    toast('Salvo no GitHub ✅');
  }
  state.saving = false;
  if(state.pendingSave){ state.pendingSave=false; scheduleSave(true); }
}

function scheduleSave(force=false){
  if(!AUTO_SAVE) return;
  if(force){ clearTimeout(state.autosaveTimer); return saveToGitHub(false); }
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(()=>{
    if(state.saving){ state.pendingSave = true; return; }
    saveToGitHub(false);
  }, AUTO_SAVE_DELAY);
}

// ====== Undo ======
function pushUndo(){ const snap = clone(state.data); state.undoStack.push(snap); if(state.undoStack.length>state.maxUndo) state.undoStack.shift(); }
function undo(){ if(!state.undoStack.length) return toast('Nada para desfazer'); const prev = state.undoStack.pop(); state.data = prev; renderAll(); markDirty(true); toast('Desfeito'); }

// ====== Diagnóstico ======
async function diagnose(){
  const lines = [];
  if(!state.token){ lines.push('⚠️ Sem token configurado.'); } else { lines.push('Token presente.'); }
  try{ const r=await fetch('https://api.github.com/user',{headers:apiHeaders()}); if(r.ok){ const u=await r.json(); lines.push(`Auth como: ${u.login}`);} else {lines.push(`GET /user → ${r.status}`);} }catch(e){ lines.push('Erro /user: '+e.message); }
  try{ const r=await fetch(`https://api.github.com/repos/${FIXED_CFG.owner}/${FIXED_CFG.repo}`,{headers:apiHeaders()}); if(r.ok){ const repo=await r.json(); const p=repo.permissions||{}; lines.push(`Permissões: admin=${p.admin}, push=${p.push}, pull=${p.pull}`); } else {lines.push(`GET repo → ${r.status}`);} }catch(e){ lines.push('Erro repo: '+e.message); }
  try{ const r=await fetch(ghGet(),{headers:apiHeaders()}); lines.push(`GET contents ${r.ok?'ok':'erro'} (${r.status})`);}catch(e){ lines.push('Erro contents: '+e.message); }
  $.diagOutput.textContent = lines.join('\\n'); $.diagModal.showModal();
}

// ====== Render ======
function renderAll(){
  const d = state.data || {month:'',professors:[]};
  // resumo
  el('#month').textContent = capitalize(d.month||'—');
  const total = (d.totalCopies ?? calcTotalAll(d));
  const used = (d.usedCopies ?? calcUsedAll(d));
  el('#totalCopies').textContent = Number(total).toLocaleString('pt-BR');
  el('#usedCopies').textContent  = Number(used).toLocaleString('pt-BR');
  el('#usedBar').style.width = safePct(used, total) + '%';

  // filtro de disciplina
  const set = new Set((d.professors||[]).map(p=>p.discipline).filter(Boolean));
  $.disciplineFilter.innerHTML = '<option value=\"\">Todas as disciplinas</option>' +
    Array.from(set).sort().map(s=>`<option>${escapeHtml(s)}</option>`).join('');

  renderTable((d.professors||[]).slice());
}

function renderTable(rows){
  $.tbody.innerHTML = '';
  rows.forEach(p => addRow(p));
}

function addRow(p={ name:'', discipline:'', quota:0, used:0, discount:0, id:Date.now() }){
  const tr = $.rowTpl.content.firstElementChild.cloneNode(true);
  const [nameI, discI, quotaI] = tr.querySelectorAll('input.cell');
  const usedWrap = tr.querySelector('.used-wrap'); const usedI = usedWrap.querySelector('input.used');
  const discntI = tr.querySelector('input.discount'); const effEl = tr.querySelector('.effective'); const remEl = tr.querySelector('.remaining');

  // set values
  nameI.value=p.name||''; discI.value=p.discipline||'';
  quotaI.value=Number(p.quota||0); usedI.value=Number(p.used||0); discntI.value=Number(p.discount||0);

  function recalc(){
    const quota=Math.max(0,toNum(quotaI.value));
    const used =Math.max(0,toNum(usedI.value));
    const disc =Math.max(0,toNum(discntI.value));
    // Validações
    if(disc>used){ discntI.value=used; p.discount=used; }
    const effective=Math.max(0,used-disc);
    const remaining=Math.max(0,quota-effective);
    effEl.textContent=effective; remEl.textContent=remaining;
    tr.className = remaining<=quota*0.1?'low':(remaining<=quota*0.25?'mid':'ok');
  }

  const syncQuota = ()=>{ p.quota = Math.max(0,toNum(quotaI.value)); };
  const syncUsed  = ()=>{ p.used  = Math.max(0,toNum(usedI.value));  };
  const syncDisc  = ()=>{ p.discount = Math.max(0,toNum(discntI.value)); };

  // Botões -> atualizar objeto e salvar
  usedWrap.querySelector('.inc').onclick = ()=>{ pushUndo(); usedI.value = toNum(usedI.value)+1; syncUsed(); recalc(); aggregateAndUpdate(); markDirty(true); scheduleSave(); };
  usedWrap.querySelector('.dec').onclick = ()=>{ pushUndo(); usedI.value = Math.max(0,toNum(usedI.value)-1); syncUsed(); recalc(); aggregateAndUpdate(); markDirty(true); scheduleSave(); };
  tr.querySelector('.copy10').onclick   = ()=>{ pushUndo(); usedI.value = toNum(usedI.value)+10; syncUsed(); recalc(); aggregateAndUpdate(); markDirty(true); scheduleSave(); };
  tr.querySelector('.copy50').onclick   = ()=>{ pushUndo(); usedI.value = toNum(usedI.value)+50; syncUsed(); recalc(); aggregateAndUpdate(); markDirty(true); scheduleSave(); };
  tr.querySelector('.copy100').onclick  = ()=>{ pushUndo(); usedI.value = toNum(usedI.value)+100; syncUsed(); recalc(); aggregateAndUpdate(); markDirty(true); scheduleSave(); };

  // Remover
  tr.querySelector('.remove').onclick = ()=>{
    if(state.confirmRemove){
      const ask = confirm('Remover este professor?');
      if(!ask) return;
    }
    pushUndo();
    tr.remove();
    removeFromState();
    aggregateAndUpdate();
    markDirty(true);
    scheduleSave(true);
  };

  // Inputs
  nameI.oninput = ()=>{ p.name = nameI.value; markDirty(true); };
  discI.oninput = ()=>{ p.discipline = discI.value; markDirty(true); };
  quotaI.oninput = ()=>{ syncQuota(); recalc(); aggregateAndUpdate(); markDirty(true); scheduleSave(); };
  usedI.oninput  = ()=>{ syncUsed();  recalc(); aggregateAndUpdate(); markDirty(true); scheduleSave(); };
  discntI.oninput= ()=>{ syncDisc();  recalc(); aggregateAndUpdate(); markDirty(true); scheduleSave(); };

  // Teclas rápidas quando focado no "usado"
  usedI.addEventListener('keydown', (e)=>{
    if(e.key==='+'){ e.preventDefault(); usedWrap.querySelector('.inc').click(); }
    if(e.key==='-'){ e.preventDefault(); usedWrap.querySelector('.dec').click(); }
  });

  function removeFromState(){
    const arr = state.data.professors;
    const idx = arr.indexOf(p);
    if(idx>=0) arr.splice(idx,1);
  }

  $.tbody.appendChild(tr);
  if(!state.data.professors.includes(p)) state.data.professors.push(p);
  recalc();
}

function aggregateAndUpdate(){
  const d=state.data; if(!d) return; const rows=els('#profTable tbody tr'); let totalQuota=0,sumEffective=0;
  rows.forEach(tr=>{
    const quota=Math.max(0,toNum(tr.querySelector('.quota').value));
    const used =Math.max(0,toNum(tr.querySelector('.used').value));
    const disc =Math.max(0,toNum(tr.querySelector('.discount').value));
    const effective=Math.max(0,used-disc);
    totalQuota+=quota; sumEffective+=effective;
  });
  d.totalCopies=totalQuota; d.usedCopies=sumEffective; d.lastModified=nowIso();
  el('#totalCopies').textContent=d.totalCopies.toLocaleString('pt-BR');
  el('#usedCopies').textContent=d.usedCopies.toLocaleString('pt-BR');
  el('#usedBar').style.width=safePct(d.usedCopies,d.totalCopies)+'%';
}

function calcTotalAll(d){ return (d.professors||[]).reduce((a,p)=>a+Number(p.quota||0),0); }
function calcUsedAll(d){ return (d.professors||[]).reduce((a,p)=>a+Math.max(0,Number(p.used||0)-Number(p.discount||0)),0); }

// ====== Reparar/Inicializar JSON ======
function defaultData(){ return { month:'agosto', totalCopies:0, usedCopies:0, lastModified:'', professors:[] }; }
async function repairJson(){
  if(!state.token){ alert('Configure o token para criar o arquivo.'); return; }
  if(!confirm('Isto vai sobrescrever o conteúdo inválido com um JSON padrão. Continuar?')) return;
  state.data = defaultData();
  state.sha = null; // criar arquivo novo
  const res = await fetch(ghPut(), {
    method:'PUT', headers:{...apiHeaders(),'Content-Type':'application/json'},
    body: JSON.stringify({ message: `cria ${FIXED_CFG.path} [repair ${nowIso()}]`, content: toBase64Utf8(JSON.stringify(state.data, null, 2)), branch: FIXED_CFG.branch })
  });
  if(!res.ok){ alert(`Falha ao reparar: ${res.status} ${await res.text()}`); return; }
  const out = await res.json();
  state.sha = out.content.sha; state.lastShaAt = Date.now();
  $.repairBtn.style.display = 'none'; toast('JSON criado/reparado ✅'); renderAll(); markDirty(true);
}

// ====== Filtros ======
function applyFilters(){
  const q = $.search.value.trim().toLowerCase();
  const df = $.disciplineFilter.value;
  const base = (state.data?.professors||[]).slice();
  const rows = base.filter(p => !q || `${p.name} ${p.discipline}`.toLowerCase().includes(q))
                   .filter(p => !df || p.discipline === df);
  renderTable(rows);
}

// ====== Import/Export ======
function exportCSV(){
  const d = state.data||{professors:[]};
  const cols = ['name','discipline','quota','used','discount'];
  const lines = [cols.join(',')].concat((d.professors||[]).map(p=>cols.map(c=>`"${String(p[c]??'').replace(/"/g,'""')}"`).join(',')));
  const blob = new Blob([lines.join('\\n')], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'xerox_export.csv'; a.click();
}
function importData(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      let imported = [];
      if(file.name.toLowerCase().endswith('.json')){
        const obj = JSON.parse(reader.result);
        if(Array.isArray(obj)) imported = obj; else if(obj.professors) imported = obj.professors;
      }else{
        // CSV simples
        const lines = reader.result.split(/\\r?\\n/).filter(Boolean);
        const headers = lines.shift().split(',').map(s=>s.replace(/^"|"$/g,'').trim().toLowerCase());
        lines.forEach(line=>{
          const parts = line.match(/("([^"]|"")*"|[^,]+)/g) || [];
          const vals = parts.map(v=>v.replace(/^"|"$/g,'').replace(/""/g,'"'));
          const row = {}; headers.forEach((h,i)=> row[h]=vals[i]);
          imported.push({
            name: row.name||'', discipline: row.discipline||'', quota: Number(row.quota||0),
            used: Number(row.used||0), discount: Number(row.discount||0), id: Date.now()+Math.random()
          });
        });
      }
      if(!state.data) state.data = defaultData();
      pushUndo();
      // Mesclar por (name+discipline)
      const key = p => (p.name||'').trim().toLowerCase()+'|'+(p.discipline||'').trim().toLowerCase();
      const map = new Map((state.data.professors||[]).map(p=>[key(p),p]));
      imported.forEach(p=>{
        const k = key(p);
        if(map.has(k)){ Object.assign(map.get(k), p); }
        else { state.data.professors.push(p); map.set(k,p); }
      });
      renderAll(); aggregateAndUpdate(); markDirty(true); scheduleSave();
      toast(`Importado(s): ${imported.length}`);
    }catch(e){ alert('Falha ao importar: '+e.message); }
  };
  reader.readAsText(file);
}

// ====== Eventos UI ======
$.tokenBtn.onclick = ()=> $.tokenModal.showModal();
$.saveToken.onclick = ()=>{ state.token = $.tokenInput.value.trim(); if($.rememberToken.checked) localStorage.setItem('xerox-token', state.token); updateBadges(); };

$.loadBtn.onclick = ()=> loadFromGitHub().catch(e=>alert(e.message));
$.saveBtn.onclick = ()=> saveToGitHub(true).catch(e=>alert(e.message));
$.refreshShaBtn.onclick = ()=> refreshSha().then(()=>toast('SHA atualizado')).catch(e=>alert(e.message));
$.diagBtn.onclick = ()=> diagnose();
$.repairBtn.onclick = ()=> repairJson();
$.undoBtn.onclick = ()=> undo();
$.importBtn.onclick = ()=> $.importFile.click();
$.importFile.onchange = (e)=>{ const f=e.target.files[0]; if(f) importData(f); e.target.value=''; };

$.addRow?.addEventListener('click', ()=>{ if(!state.data){ state.data = defaultData(); } pushUndo(); state.data.professors.push({ name:'', discipline:'', quota:0, used:0, discount:0, id:Date.now() }); renderAll(); aggregateAndUpdate(); markDirty(true); scheduleSave(); });
$.recalc?.addEventListener('click', ()=>{ aggregateAndUpdate(); markDirty(true); scheduleSave(true); toast('Totais recalculados e salvos.'); });
$.exportJson?.addEventListener('click', ()=>{ if(!state.data) return; const blob=new Blob([JSON.stringify(state.data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=FIXED_CFG.path; a.click(); });
$.exportCsv?.addEventListener('click', exportCSV);
$.search.oninput = applyFilters;
$.disciplineFilter.onchange = applyFilters;
$.clearFilters.onclick = ()=>{ $.search.value=''; $.disciplineFilter.value=''; applyFilters(); };

// Atalhos: Ctrl+S e Ctrl+Z
document.addEventListener('keydown', (e)=>{
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='s'){ e.preventDefault(); $.saveBtn.click(); }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){ e.preventDefault(); $.undoBtn.click(); }
});

// ====== Boot ======
(function boot(){
  try{ const t = localStorage.getItem('xerox-token'); if(t) state.token = t; }catch{}
  updateBadges();
  setInterval(updateBadges, 1000);
})();