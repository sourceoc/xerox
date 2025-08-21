// ====== Config & util ======
const el = s => document.querySelector(s);
const els = s => Array.from(document.querySelectorAll(s));
const FIXED_CFG = { owner:'sourceoc', repo:'xerox', path:'xerox_data_agosto.json', branch:'main' };
const AUTO_SAVE = true, AUTO_SAVE_DELAY = 1200;

const $ = {
  tokenBtn: el('#tokenBtn'), tokenModal: el('#tokenModal'),
  tokenInput: el('#tokenInput'), rememberToken: el('#rememberToken'), saveToken: el('#saveToken'),
  loadBtn: el('#loadBtn'), saveBtn: el('#saveBtn'), search: el('#search'), disciplineFilter: el('#disciplineFilter'),
  clearFilters: el('#clearFilters'),
  month: el('#month'), used: el('#usedCopies'), total: el('#totalCopies'), usedBar: el('#usedBar'),
  tbody: el('#profTbody'), rowTpl: el('#rowTemplate'), addRow: el('#addRow'), recalc: el('#recalcTotals'), exportJson: el('#exportJson')
};

const state = { sha:null, data:null, filtered:[], token:null, autosaveTimer:null, saving:false, pendingSave:false };

function apiHeaders(){ const h={'Accept':'application/vnd.github+json'}; if(state.token) h.Authorization=`Bearer ${state.token}`; return h; }
function ghGet(){ const {owner,repo,path,branch}=FIXED_CFG; return `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`; }
function ghPut(){ const {owner,repo,path}=FIXED_CFG; return `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`; }

function loadToken(){ try{ const t=localStorage.getItem('xerox-token'); if(t) state.token=t; }catch(e){} }
function toBase64Utf8(str){ return btoa(unescape(encodeURIComponent(str))); } // garante UTF-8 puro

// ====== GitHub ======
async function loadFromGitHub(){
  $.saveBtn.disabled = true;
  const res = await fetch(ghGet(), { headers: apiHeaders() });
  if(!res.ok){ const msg=await res.text(); throw new Error(`Falha ao carregar: ${res.status} ${msg}`); }
  const json = await res.json(); state.sha = json.sha;
  const decoded = atob(json.content.replace(/\n/g,''));
  try{ state.data = JSON.parse(decoded); }catch(e){ alert('JSON inválido no repositório. Corrija o arquivo e recarregue.'); throw e; }
  renderAll(); $.saveBtn.disabled = false;
}

async function saveToGitHub(manual=false){
  if(!state.data || !state.token) return;
  state.saving = true;
  const content = JSON.stringify(state.data, null, 2); // formatado e UTF-8 seguro
  const body = { message:`atualiza ${FIXED_CFG.path} [`+(manual?'manual':'auto')+`]`, content: toBase64Utf8(content), sha: state.sha, branch: FIXED_CFG.branch };
  const res = await fetch(ghPut(), { method:'PUT', headers:{...apiHeaders(),'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if(!res.ok){ const msg=await res.text(); alert(`Falha ao salvar: ${res.status} ${msg}`); }
  else { const out = await res.json(); state.sha = out.content.sha; }
  state.saving=false; if(state.pendingSave){ state.pendingSave=false; scheduleSave(true); }
}

function scheduleSave(force=false){
  if(!AUTO_SAVE) return;
  if(force){ clearTimeout(state.autosaveTimer); return saveToGitHub(false); }
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(()=>{ if(state.saving){ state.pendingSave=true; return; } saveToGitHub(false); }, AUTO_SAVE_DELAY);
}

// ====== Render ======
function renderAll(){
  const d = state.data; if(!d) return;
  $.month.textContent = capitalize(d.month||'—');
  const total = (d.totalCopies ?? calcTotalAll(d));
  const used = (d.usedCopies ?? calcUsedAll(d));
  $.total.textContent = Number(total).toLocaleString('pt-BR');
  $.used.textContent = Number(used).toLocaleString('pt-BR');
  $.usedBar.style.width = safePct(used,total)+'%';
  const set = new Set((d.professors||[]).map(p=>p.discipline).filter(Boolean));
  $.disciplineFilter.innerHTML = '<option value=\"\">Todas as disciplinas</option>' + Array.from(set).sort().map(s=>`<option>${escapeHtml(s)}</option>`).join('');
  state.filtered = (d.professors||[]).slice(); applyFilters();
}

function applyFilters(){
  const q=$.search.value.trim().toLowerCase(), df=$.disciplineFilter.value;
  renderTable(state.filtered.filter(p=>!q||`${p.name} ${p.discipline}`.toLowerCase().includes(q)).filter(p=>!df||p.discipline===df));
}

function renderTable(rows){ $.tbody.innerHTML=''; rows.forEach(p=>addRow(p)); }

function addRow(p={ name:'', discipline:'', quota:0, used:0, discount:0, id:Date.now() }){
  const tr = $.rowTpl.content.firstElementChild.cloneNode(true);
  const [nameI, discI, quotaI] = tr.querySelectorAll('input.cell');
  const usedWrap = tr.querySelector('.used-wrap'); const usedI = usedWrap.querySelector('input.used');
  const discntI = tr.querySelector('input.discount'); const effEl = tr.querySelector('.effective'); const remEl = tr.querySelector('.remaining');
  nameI.value=p.name||''; discI.value=p.discipline||''; quotaI.value=Number(p.quota||0); usedI.value=Number(p.used||0); discntI.value=Number(p.discount||0);
  function recalc(){ const quota=toNum(quotaI.value), used=toNum(usedI.value), discount=toNum(discntI.value);
    const effective=Math.max(0,used-discount), remaining=Math.max(0,quota-effective); effEl.textContent=effective; remEl.textContent=remaining;
    tr.className = remaining<=quota*0.1?'low':(remaining<=quota*0.25?'mid':'ok'); }
  usedWrap.querySelector('.inc').onclick=()=>{ usedI.value=toNum(usedI.value)+1; recalc(); aggregateAndUpdate(); scheduleSave(); };
  usedWrap.querySelector('.dec').onclick=()=>{ usedI.value=Math.max(0,toNum(usedI.value)-1); recalc(); aggregateAndUpdate(); scheduleSave(); };
  tr.querySelector('.copy10').onclick=()=>{ usedI.value=toNum(usedI.value)+10; recalc(); aggregateAndUpdate(); scheduleSave(); };
  tr.querySelector('.copy50').onclick=()=>{ usedI.value=toNum(usedI.value)+50; recalc(); aggregateAndUpdate(); scheduleSave(); };
  tr.querySelector('.copy100').onclick=()=>{ usedI.value=toNum(usedI.value)+100; recalc(); aggregateAndUpdate(); scheduleSave(); };
  tr.querySelector('.remove').onclick=()=>{ tr.remove(); removeFromState(); aggregateAndUpdate(); scheduleSave(); };
  nameI.oninput=()=>{ p.name=nameI.value; scheduleSave(); };
  discI.oninput=()=>{ p.discipline=discI.value; scheduleSave(); };
  quotaI.oninput=()=>{ p.quota=toNum(quotaI.value); recalc(); aggregateAndUpdate(); scheduleSave(); };
  usedI.oninput=()=>{ p.used=toNum(usedI.value); recalc(); aggregateAndUpdate(); scheduleSave(); };
  discntI.oninput=()=>{ p.discount=toNum(discntI.value); recalc(); aggregateAndUpdate(); scheduleSave(); };
  function removeFromState(){ const arr=state.data.professors; const idx=arr.indexOf(p); if(idx>=0) arr.splice(idx,1); }
  $.tbody.appendChild(tr); if(!state.data.professors.includes(p)) state.data.professors.push(p); recalc();
}

function aggregateAndUpdate(){
  const d=state.data; if(!d) return; const rows=els('#profTable tbody tr'); let totalQuota=0,sumEffective=0;
  rows.forEach(tr=>{ const quota=toNum(tr.querySelector('.quota').value), used=toNum(tr.querySelector('.used').value), disc=toNum(tr.querySelector('.discount').value);
    const effective=Math.max(0,used-disc); totalQuota+=quota; sumEffective+=effective; });
  d.totalCopies=totalQuota; d.usedCopies=sumEffective; d.lastModified=new Date().toISOString();
  $.total.textContent=d.totalCopies.toLocaleString('pt-BR'); $.used.textContent=d.usedCopies.toLocaleString('pt-BR'); $.usedBar.style.width=safePct(d.usedCopies,d.totalCopies)+'%';
}

function calcTotalAll(d){ return (d.professors||[]).reduce((a,p)=>a+Number(p.quota||0),0); }
function calcUsedAll(d){ return (d.professors||[]).reduce((a,p)=>a+Math.max(0,Number(p.used||0)-Number(p.discount||0)),0); }
function toNum(v){ return Number(String(v).replace(/[^\d.-]/g,'')||0); }
function safePct(used,total){ return total>0? Math.min(100, Math.round(used/total*100)) : 0; }
function escapeHtml(s){ return String(s).replace(/[&<>\"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }
function capitalize(s){ try{return s.charAt(0).toUpperCase()+s.slice(1);}catch(e){return s;} }
function toast(msg){ const t=document.createElement('div'); t.className='toast'; Object.assign(t.style,{position:'fixed',bottom:'16px',right:'16px',background:'#162143',color:'#e9eef9',padding:'10px 14px',borderRadius:'12px',border:'1px solid rgba(255,255,255,.08)',zIndex:9999}); t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2000); }

// ====== UI events ======
el('#tokenBtn').onclick=()=> $.tokenModal.showModal();
el('#saveToken').onclick=()=>{ state.token = el('#tokenInput').value.trim(); if(el('#rememberToken').checked) localStorage.setItem('xerox-token', state.token); toast('Token atualizado.'); };
el('#loadBtn').onclick=()=> loadFromGitHub().catch(e=>alert(e.message));
el('#saveBtn').onclick=()=> saveToGitHub(true).catch(e=>alert(e.message));
el('#addRow').onclick=()=>{ if(!state.data){ state.data={month:'', totalCopies:0, usedCopies:0, lastModified:'', professors:[]}; } addRow(); aggregateAndUpdate(); scheduleSave(); };
el('#recalcTotals').onclick=()=>{ aggregateAndUpdate(); scheduleSave(true); toast('Totais recalculados e salvos.'); };
el('#exportJson').onclick=()=>{ if(!state.data) return; const blob=new Blob([JSON.stringify(state.data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=FIXED_CFG.path; a.click(); };
el('#search').oninput=applyFilters; el('#disciplineFilter').onchange=applyFilters; el('#clearFilters').onclick=()=>{ el('#search').value=''; el('#disciplineFilter').value=''; applyFilters(); };

// ====== Boot ======
loadToken(); if(!state.token){ setTimeout(()=>$.tokenModal.showModal(), 500); }
