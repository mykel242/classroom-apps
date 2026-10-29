/* Probe groups: IEP goals from different students that one shared probe can measure.
   Stored in iep.v1 as groups: { id: {id, name, goals:[goalId], updated} } and groupsHide: [suggestion keys].
   Suggestions come from shared/goalgroups.js (keyword similarity within the same subject). */
const MATCH={close:0.35,medium:0.25,loose:0.18};
const groupList=()=>Object.values(I.groups||{}).filter(g=>g&&Array.isArray(g.goals));
function groupOf(gid){ return groupList().find(x=>x.goals.includes(gid))||null; }
const liveGoals=gr=>gr.goals.map(id=>I.goals[id]).filter(g=>g&&g.status==='active');
const titleCase=s=>s.replace(/\b\w/g,c=>c.toUpperCase());

function renderGroups(){
  const match=P.match&&MATCH[P.match]?P.match:'medium';
  const active=Object.values(I.goals).filter(g=>g.status==='active'&&sidInScope(g.sid));
  const grouped=new Set(groupList().flatMap(x=>x.goals)), hide=new Set(I.groupsHide||[]);
  const sug=GoalGroups.suggest(active.filter(g=>!grouped.has(g.id)).map(g=>({id:g.id,sid:g.sid,subj:goalSubj(g),text:g.text})),MATCH[match])
    .filter(s=>!hide.has(s.ids.slice().sort().join('|')));
  const mine=groupList().filter(gr=>gr.goals.some(id=>I.goals[id]&&sidInScope(I.goals[id].sid)));
  const row=g=>{const nx=nextFor(g.id); return `<div class="gm"><b>${esc(nameAny(g.sid))}</b><span class="t">${esc(goalShort(g))}</span><small>${esc(IEP.critText(g.criteria||{}))}${nx?' · '+esc(wkday(nx.day)+' '+short(nx.day)):''}</small></div>`;};
  let h=`<div class="bar"><h2 class="grow">Probe groups</h2><button class="ghost" id="grNew">+ New group</button></div>
    <p class="hint">Goals from different students that one probe can measure. Save a group to plan, measure and print it together.</p>`;
  h+=mine.length?mine.map(gr=>{const gs=liveGoals(gr); return `<div class="card grp" data-g="${esc(gr.id)}"><div class="bar"><h3 class="grow">${esc(gr.name)}</h3><span class="tag">${plural(gs.length,'student')}</span></div>
      ${gs.map(row).join('')||'<div class="meta">No active goals left in this group.</div>'}
      <div class="btnrow"><button class="primary" data-gact="measure">Measure</button><button class="ghost" data-gact="plan">Plan together</button><button class="ghost" data-gact="gem">Copy for Gemini</button><span class="grow"></span><button class="plain" data-gact="edit">Edit</button></div></div>`;}).join('')
    :'<div class="card"><div class="meta">No saved groups yet. Save a suggestion below or make your own.</div></div>';
  h+=`<div class="sec"><h2>Suggested</h2><div class="seg" id="grM">${['close','medium','loose'].map(m=>`<button type="button" data-m="${m}" aria-pressed="${m===match}">${titleCase(m)}</button>`).join('')}</div></div>`;
  h+=sug.length?sug.map(s=>{const gs=s.ids.map(id=>I.goals[id]); return `<div class="card grp sug" data-ids="${esc(s.ids.join(','))}" data-name="${esc(titleCase(s.words.slice(0,3).join(' · ')))}">
      <div class="bar"><h3 class="grow">${esc(titleCase(s.words.slice(0,3).join(' · '))||'Similar goals')}</h3><span class="tag">${esc(goalSubj(gs[0])==='math'?'Math':goalSubj(gs[0])==='ela'?'ELA':'Other')}</span></div>
      ${gs.map(row).join('')}
      <div class="btnrow"><button class="primary" data-sact="save">Save group</button><button class="ghost" data-sact="no">Not a match</button></div></div>`;}).join('')
    :`<div class="card"><div class="meta">No similar goals found${match!=='loose'?'. Try "Loose" for wider matches.':'.'}</div></div>`;
  $('view').innerHTML=h;
  $('grM').addEventListener('click',e=>{const b=e.target.closest('[data-m]'); if(!b) return; P.match=b.dataset.m; savePrefs(); renderGroups();});
  $('grNew').addEventListener('click',()=>groupEditor(null,[]));
  $('view').onclick=e=>{
    const sa=e.target.closest('[data-sact]'), ga=e.target.closest('[data-gact]');
    if(sa){const c=sa.closest('[data-ids]'), ids=c.dataset.ids.split(',');
      if(sa.dataset.sact==='save') groupEditor(null,ids,c.dataset.name);
      else{ I=loadI(); I.groupsHide=(I.groupsHide||[]).concat(ids.slice().sort().join('|')).slice(-300); saveI(); renderGroups(); }}
    else if(ga){const gr=(I.groups||{})[ga.closest('[data-g]').dataset.g]; if(!gr) return; const gs=liveGoals(gr);
      if(ga.dataset.gact==='measure') measureSheet(gs,renderGroups);
      else if(ga.dataset.gact==='plan') planGroup(gr);
      else if(ga.dataset.gact==='gem') groupGemini(gr);
      else groupEditor(gr,gr.goals);}};
}

// pick goals and a name; one goal per student
function groupEditor(gr,ids,name){
  const sel=new Set(ids), active=Object.values(I.goals).filter(g=>g.status==='active'&&sidInScope(g.sid)), other=new Set(groupList().filter(x=>!gr||x.id!==gr.id).flatMap(x=>x.goals));
  const by={math:[],ela:[],'':[]}; active.forEach(g=>by[goalSubj(g)].push(g));
  const sec=(k,l)=>by[k].length?`<div class="lbl" style="padding:0 6px">${l}</div>`+by[k].sort((a,b)=>nameAny(a.sid).localeCompare(nameAny(b.sid))).map(g=>`<label class="pick"><input type="checkbox" value="${esc(g.id)}" ${sel.has(g.id)?'checked':''} ${other.has(g.id)&&!sel.has(g.id)?'disabled':''}>
      <span><b>${esc(nameAny(g.sid))}</b> ${esc(goalShort(g))}${other.has(g.id)&&!sel.has(g.id)?' <small>(in another group)</small>':''}</span></label>`).join(''):'';
  openSheet(`<h2>${gr?'Edit group':'New group'}</h2>
    <div class="field"><label for="grName">Name</label><input type="text" id="grName" value="${esc(gr?gr.name:(name||''))}" placeholder="e.g. Main idea + details"></div>
    <div id="grPick">${sec('ela','ELA')}${sec('math','Math')}${sec('','Other')}</div>
    <div id="grErr" class="note bad" hidden></div>
    <div class="sticky-actions">${gr?'<button class="ghost" id="grDel">Delete</button>':'<button class="ghost" id="grC">Cancel</button>'}<button class="primary" id="grS">Save</button></div>`,
  el=>{const err=m=>{const x=el.querySelector('#grErr'); x.textContent=m; x.hidden=false;};
    el.querySelector('#grS').addEventListener('click',()=>{
      const goals=[...el.querySelectorAll('#grPick input:checked')].map(x=>x.value), nm=el.querySelector('#grName').value.trim();
      if(goals.length<2) return err('Pick at least two goals.');
      const sids=goals.map(id=>I.goals[id].sid); if(new Set(sids).size<sids.length) return err('Pick one goal per student.');
      I=loadI(); I.groups=I.groups||{}; const id=gr?gr.id:uid('gr');
      I.groups[id]={id,name:nm||'Group',goals,updated:Date.now()}; saveI(); closeSheet(); toast('Group saved'); renderGroups();});
    const c=el.querySelector('#grC'); if(c) c.addEventListener('click',closeSheet);
    const d=el.querySelector('#grDel'); if(d) d.addEventListener('click',()=>confirmTap(d,'Tap to delete',()=>{I=loadI(); delete I.groups[gr.id]; saveI(); closeSheet(); toast('Group deleted'); renderGroups();}));});
}

// plan every goal in the group for the same day
function planGroup(gr){
  const gs=liveGoals(gr); if(!gs.length) return;
  const items=gs.map(g=>nextFor(g.id)).filter(Boolean);
  if(!items.length){toast('Nothing scheduled for these goals'); return;}
  moveSheet(items,null,gr.name);
}

function groupGemini(gr){
  const gs=liveGoals(gr); D=Classroom.load();
  const all=Object.keys(D.classes).flatMap(c=>D.classes[c].students||[]).flatMap(st=>{const k=(I.profiles[st.id]||{}).iepName; return k?[st,{id:st.id,name:k}]:[st];}).sort((a,b)=>b.name.length-a.name.length);
  const scrub=t=>{let s=IEP.fill(t,'the student'); all.forEach(st=>[st.name,...st.name.split(/\s+/).filter(p=>p.length>=2)].forEach(p=>{
      s=s.replace(new RegExp('(^|[^\\p{L}])'+p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^\\p{L}])','giu'),'$1the student');})); return s;};
  const n=Math.max(...gs.map(g=>(g.criteria&&+g.criteria.y)||5));
  let t=`I'm a special education teacher. Write ONE short probe I can use with a small group to measure all of the IEP goals below at once. Give ${n} items, at a level every student in the group can access, plus an answer key. After the key, add a short note for each student code on which items or parts show progress on their goal. Do not add names.\n\nGroup: ${gr.name}\n`;
  gs.forEach(g=>{const c=classOf(g.sid), gr6=((D.classes[c]||{}).name||'').match(/^\d/); t+=`\n${codeFor(g.sid)} (${gr6?'grade '+gr6[0]:'middle school'}): ${scrub(g.text)}\n  Criteria: ${IEP.critText(g.criteria||{})}\n`;});
  openSheet(`<h2>Copy for Gemini · ${esc(gr.name)}</h2>
    <p class="hint">One shared probe for the group. Students appear as codes, and names are removed. Check it before you paste.</p>
    <textarea id="gT" rows="14" style="width:100%;font-size:14px">${esc(t)}</textarea>
    <div class="sticky-actions"><button class="ghost" id="gC">Close</button><button class="primary" id="gCopy">Copy</button></div>`,
  el=>{el.querySelector('#gC').addEventListener('click',closeSheet);
    el.querySelector('#gCopy').addEventListener('click',()=>{const ta=el.querySelector('#gT'), ok=()=>{closeSheet();toast('Copied. Paste into Gemini.');};
      if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(ok).catch(()=>{ta.select();document.execCommand('copy');ok();});
      else{ta.select();document.execCommand('copy');ok();}});});
}
