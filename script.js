// ====== Config & util ======
const el = s => document.querySelector(s);
const els = s => Array.from(document.querySelectorAll(s));

const FIXED_CFG = { owner:'sourceoc', repo:'xerox', path:'xerox_data_agosto.json', branch:'main' };
const AUTO_SAVE = true, AUTO_SAVE_DELAY = 1200, MAX_RETRY_409 = 1;

const $ = {
  tokenBtn: el('#tokenBtn'), tokenModal: el('#tokenModal'),
  tokenInput: el('#tokenInput'), rememberToken: el('#rememberToken'), saveToken: el('#saveToken'),
  tokenStatus: el('#tokenStatus'), shaStatus: el('#shaStatus'),
  loadBtn: el('#loadBtn'), saveBtn: el('#saveBtn'), refreshShaBtn: el('#refreshShaBtn'),
  diagBtn: el('#diagBtn'), diagModal: el('#diagModal'), diagOutput: el('#diagOutput'),
  repairBtn: el('#repairBtn'),
  search: el('#search'), disciplineFilter: el('#disciplineFilter'), clearFilters: el('#clearFilters'),
  month: el('#month'), used: el('#usedCopies'), total: el('#totalCopies'), usedBar: el('#usedBar'),
  tbody: el('#profTbody'), rowTpl: el('#rowTemplate'), addRow: el('#addRow'), recalc: el('#recalcTotals'), exportJson: el('#exportJson')
};

const state = {
  sha: null, data: null, filtered: [], token: null,
  saving: false, autosaveTimer: null, pendingSave: false,
  lastShaAt: null, lastSaveAt: null,
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

function updateBadges(){
  $.tokenStatus.textContent = 'Token: ' + (state.token ? 'Config.' : '—');
  $.shaStatus.textContent = 'SHA: ' + (state.sha ? ('ok ('+timeAgo(state.lastShaAt)+' atrás)') : '—');
}

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
  try{
    decoded = stripBOM(fromBase64Utf8(j.content.replace(/\n/g,'')));
  }catch(e){
    decoded = atob(j.content.replace(/\n/g,'')); // fallback
  }
  try{
    state.data = JSON.parse(decoded);
  }catch(e){
    $.repairBtn.style.display = 'inline-block';
    alert('JSON inválido no repositório. Use "Reparar JSON" para recriar um modelo válido.');
    throw e;
  }
  updateBadges();
}

async function loadFromGitHub(){
  $.saveBtn.disabled = true;
  await refreshSha();
  renderAll();
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
    // SHA desatualizado → refaz GET e tenta de novo
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

// ====== Diagnóstico ======
async function diagnose(){
  const lines = [];
  if(!state.token){
    lines.push('⚠️ Sem token configurado.');
  }else{
    lines.push('Token presente.');
  }
  // /user
  try{
    const r = await fetch('https://api.github.com/user', { headers: apiHeaders() });
    if(r.ok){ const u = await r.json(); lines.push(`Auth como: ${u.login}`); }
    else { lines.push(`GET /user → ${r.status}`); }
  }catch(e){ lines.push('Erro /user: '+e.message); }

  // /repos/{owner}/{repo}
  try{
    const r = await fetch(`https://api.github.com/repos/${FIXED_CFG.owner}/${FIXED_CFG.repo}`, { headers: apiHeaders() });
    if(r.ok){
      const repo = await r.json();
      const p = repo.permissions || {};
      lines.push(`Repo ok. Permissões: admin=${p.admin}, push=${p.push}, pull=${p.pull}`);
      lines.push(`Default branch: ${repo.default_branch}`);
    }else{
      lines.push(`GET repo → ${r.status}`);
    }
  }catch(e){ lines.push('Erro repo: '+e.message); }

  // contents (read)
  try{
    const r = await fetch(ghGet(), { headers: apiHeaders() });
    lines.push(`GET contents ${r.ok?'ok':'erro'} (${r.status})`);
  }catch(e){ lines.push('Erro contents: '+e.message); }

  $.diagOutput.textContent = lines.join('\n');
  $.diagModal.showModal();
}

// ====== Render ======
function renderAll(){
  const d = state.data; if(!d) return;
  // resumo
  $.month.textContent = capitalize(d.month||'—');
  const total = (d.totalCopies ?? calcTotalAll(d));
  const used = (d.usedCopies ?? calcUsedAll(d));
  $.total.textContent = Number(total).toLocaleString('pt-BR');
  $.used.textContent = Number(used).toLocaleString('pt-BR');
  $.usedBar.style.width = safePct(used, total) + '%';

  // filtro de disciplina
  const set = new Set((d.professors||[]).map(p=>p.discipline).filter(Boolean));
  $.disciplineFilter.innerHTML = '<option value=\"\">Todas as disciplinas</option>' +
    Array.from(set).sort().map(s=>`<option>${escapeHtml(s)}</option>`).join('');

  // tabela
  const rows = (d.professors||[]).slice();
  renderTable(rows);
}

function renderTable(rows){
  $.tbody.innerHTML = '';
  rows.forEach(p => addRow(p));
}

function addRow(p={ name:'', discipline:'', quota:0, used:0, discount:0, id:Date.now() }){
  const tr = $.rowTpl.content.firstElementChild.cloneNode(true);
  const [nameI, discI, quotaI] = tr.querySelectorAll('input.cell');
  const usedWrap = tr.querySelector('.used-wrap');
  const usedI = usedWrap.querySelector('input.used');
  const discntI = tr.querySelector('input.discount');
  const effEl = tr.querySelector('.effective');
  const remEl = tr.querySelector('.remaining');

  nameI.value = p.name||''; discI.value = p.discipline||'';
  quotaI.value = Number(p.quota||0); usedI.value = Number(p.used||0); discntI.value = Number(p.discount||0);

  function recalc(){
    const quota = toNum(quotaI.value), used = toNum(usedI.value), discount = toNum(discntI.value);
    const effective = Math.max(0, used - discount);
    const remaining = Math.max(0, quota - effective);
    effEl.textContent = effective;
    remEl.textContent = remaining;
    if(remaining <= quota*0.1) tr.className = 'low';
    else if(remaining <= quota*0.25) tr.className = 'mid';
    else tr.className = 'ok';
  }

  usedWrap.querySelector('.inc').onclick = ()=>{
    usedI.value = toNum(usedI.value)+1;
    p.used = toNum(usedI.value); // <-- mantém state.data atualizado
    recalc(); aggregateAndUpdate(); scheduleSave();
  };
  usedWrap.querySelector('.dec').onclick = ()=>{
    usedI.value = Math.max(0,toNum(usedI.value)-1);
    p.used = toNum(usedI.value);
    recalc(); aggregateAndUpdate(); scheduleSave();
  };
  tr.querySelector('.copy10').onclick = ()=>{
    usedI.value = toNum(usedI.value)+10;
    p.used = toNum(usedI.value);
    recalc(); aggregateAndUpdate(); scheduleSave();
  };
  tr.querySelector('.copy50').onclick = ()=>{
    usedI.value = toNum(usedI.value)+50;
    p.used = toNum(usedI.value);
    recalc(); aggregateAndUpdate(); scheduleSave();
  };
  tr.querySelector('.copy100').onclick = ()=>{
    usedI.value = toNum(usedI.value)+100;
    p.used = toNum(usedI.value);
    recalc(); aggregateAndUpdate(); scheduleSave();
  };
  tr.querySelector('.remove').onclick = ()=>{ tr.remove(); removeFromState(); aggregateAndUpdate(); scheduleSave(true); };

  nameI.oninput = ()=>{ p.name = nameI.value; scheduleSave(); };
  discI.oninput = ()=>{ p.discipline = discI.value; scheduleSave(); };
  quotaI.oninput = ()=>{ p.quota = toNum(quotaI.value); recalc(); aggregateAndUpdate(); scheduleSave(); };
  usedI.oninput = ()=>{ p.used = toNum(usedI.value); recalc(); aggregateAndUpdate(); scheduleSave(); };
  discntI.oninput = ()=>{ p.discount = toNum(discntI.value); recalc(); aggregateAndUpdate(); scheduleSave(); };

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
  const d = state.data; if(!d) return;
  const rows = els('#profTable tbody tr');
  let totalQuota = 0, sumEffective = 0;
  rows.forEach(tr => {
    const quota = toNum(tr.querySelector('.quota').value);
    const used = toNum(tr.querySelector('.used').value);
    const disc = toNum(tr.querySelector('.discount').value);
    const effective = Math.max(0, used - disc);
    totalQuota += quota;
    sumEffective += effective;
  });
  d.totalCopies = totalQuota;
  d.usedCopies = sumEffective;
  d.lastModified = nowIso();
  $.total.textContent = d.totalCopies.toLocaleString('pt-BR');
  $.used.textContent = d.usedCopies.toLocaleString('pt-BR');
  $.usedBar.style.width = safePct(d.usedCopies, d.totalCopies) + '%';
}

function calcTotalAll(d){ return (d.professors||[]).reduce((a,p)=>a + Number(p.quota||0), 0); }
function calcUsedAll(d){ return (d.professors||[]).reduce((a,p)=>a + Math.max(0, Number(p.used||0) - Number(p.discount||0)), 0); }

// ====== Reparar/Inicializar JSON ======
function defaultData(){
  return { month:'agosto', totalCopies:0, usedCopies:0, lastModified:'', professors:[] };
}
async function repairJson(){
  if(!state.token){ alert('Configure o token para criar o arquivo.'); return; }
  if(!confirm('Isto vai sobrescrever o conteúdo inválido com um JSON padrão. Continuar?')) return;
  state.data = defaultData();
  state.sha = null; // criar arquivo novo
  const res = await fetch(ghPut(), {
    method:'PUT',
    headers:{...apiHeaders(),'Content-Type':'application/json'},
    body: JSON.stringify({
      message: `cria ${FIXED_CFG.path} [repair ${nowIso()}]`,
      content: toBase64Utf8(JSON.stringify(state.data, null, 2)),
      branch: FIXED_CFG.branch
    })
  });
  if(!res.ok){ alert(`Falha ao reparar: ${res.status} ${await res.text()}`); return; }
  const out = await res.json();
  state.sha = out.content.sha; state.lastShaAt = Date.now();
  $.repairBtn.style.display = 'none';
  toast('JSON criado/reparado ✅');
  renderAll();
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

// ====== Eventos UI ======
$.tokenBtn.onclick = ()=> $.tokenModal.showModal();
$.saveToken.onclick = ()=>{ state.token = $.tokenInput.value.trim(); if($.rememberToken.checked) localStorage.setItem('xerox-token', state.token); updateBadges(); };

$.loadBtn.onclick = ()=> loadFromGitHub().catch(e=>alert(e.message));
$.saveBtn.onclick = ()=> saveToGitHub(true).catch(e=>alert(e.message));
$.refreshShaBtn.onclick = ()=> refreshSha().then(()=>toast('SHA atualizado')).catch(e=>alert(e.message));
$.diagBtn.onclick = ()=> diagnose();
$.repairBtn.onclick = ()=> repairJson();

$.addRow?.addEventListener('click', ()=>{ if(!state.data){ state.data = defaultData(); } addRow(); aggregateAndUpdate(); scheduleSave(); });
$.recalc?.addEventListener('click', ()=>{ aggregateAndUpdate(); scheduleSave(true); toast('Totais recalculados e salvos.'); });
$.exportJson?.addEventListener('click', ()=>{
  if(!state.data) return;
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = FIXED_CFG.path;
  a.click();
});
$.search.oninput = applyFilters;
$.disciplineFilter.onchange = applyFilters;
$.clearFilters.onclick = ()=>{ $.search.value=''; $.disciplineFilter.value=''; applyFilters(); };

// ====== Boot ======
(function boot(){
  try{ const t = localStorage.getItem('xerox-token'); if(t) state.token = t; }catch{}
  updateBadges();
  // Atualiza badge do SHA periodicamente
  setInterval(updateBadges, 1000);
  // Opcional: abrir modal se não houver token
  if(!state.token){ setTimeout(()=>$.tokenModal.showModal(), 600); }
})();