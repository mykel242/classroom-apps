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
  const row=g=>{const nx=nextFor(g.id); return `<div class="gm"><b>${esc(nameAny(g.sid))}</b><span class="t">${esc(goalShort(g))}</span><small>${esc(cadence(g))}${nx?' · next '+esc(wkday(nx.day)+' '+short(nx.day)):''}</small></div>`;};
  const singles=active.filter(g=>!grouped.has(g.id)).sort((a,b)=>nameAny(a.sid).localeCompare(nameAny(b.sid)));
  const needRule=mine.filter(gr=>!gr.rule&&liveGoals(gr).length).length+singles.filter(g=>!g.rule).length;
  let h=`<div class="bar"><h2 class="grow">Probe groups</h2><button class="ghost" id="grNew">+ New group</button><button class="ghost" id="grRebuild">Rebuild schedule</button></div>
    <p class="hint">Goals from different students that one probe can measure. Give each group a day and period that repeats; the scheduler fills in the dates.</p>
    ${needRule?`<div class="note bar"><span class="grow">${plural(needRule,'group or probe')} without a schedule.</span><button class="primary" id="grAll" style="min-height:40px">Accept all suggestions</button></div>`:''}`;
  h+=mine.length?mine.map(gr=>{const gs=liveGoals(gr); return `<div class="card grp" data-g="${esc(gr.id)}"><div class="bar"><h3 class="grow">${esc(gr.name)}</h3><span class="tag">${plural(gs.length,'student')}</span></div>
      ${gs.map(row).join('')||'<div class="meta">No active goals left in this group.</div>'}
      ${gs.length?schedLine('group',gr.id,gs,gr.rule,gr.name):''}
      <div class="btnrow"><button class="primary" data-gact="measure">Measure</button><button class="ghost" data-gact="plan">Plan together</button><button class="ghost" data-gact="gem">Copy for Gemini</button><span class="grow"></span><button class="plain" data-gact="edit">Edit</button></div></div>`;}).join('')
    :'<div class="card"><div class="meta">No saved groups yet. Save a suggestion below or make your own.</div></div>';
  h+=`<div class="sec"><h2>Suggested</h2><div class="seg" id="grM">${['close','medium','loose'].map(m=>`<button type="button" data-m="${m}" aria-pressed="${m===match}">${titleCase(m)}</button>`).join('')}</div></div>`;
  h+=sug.length?sug.map(s=>{const gs=s.ids.map(id=>I.goals[id]); return `<div class="card grp sug" data-ids="${esc(s.ids.join(','))}" data-name="${esc(titleCase(s.words.slice(0,3).join(' · ')))}">
      <div class="bar"><h3 class="grow">${esc(titleCase(s.words.slice(0,3).join(' · '))||'Similar goals')}</h3><span class="tag">${esc(goalSubj(gs[0])==='math'?'Math':goalSubj(gs[0])==='ela'?'ELA':'Other')}</span></div>
      ${gs.map(row).join('')}
      <div class="btnrow"><button class="primary" data-sact="save">Save group</button><button class="ghost" data-sact="no">Not a match</button></div></div>`;}).join('')
    :`<div class="card"><div class="meta">No similar goals found${match!=='loose'?'. Try "Loose" for wider matches.':'.'}</div></div>`;
  h+=`<div class="sec"><h2>Single probes</h2></div><p class="hint">Goals not in a group. Each can have its own day and period.</p>`;
  h+=singles.length?`<div class="card grp">`+singles.map(g=>`<div class="single">${row(g)}${schedLine('goal',g.id,[g],g.rule,nameAny(g.sid))}</div>`).join('')+`</div>`:'<div class="card"><div class="meta">Every active goal is in a group.</div></div>';
  $('view').innerHTML=h;
  $('grRebuild').addEventListener('click',rebuildSheet);
  if($('grAll')) $('grAll').addEventListener('click',()=>{ let n=0;
    mine.filter(gr=>!gr.rule&&liveGoals(gr).length).forEach(gr=>{saveRule('group',gr.id,suggestRule(liveGoals(gr))); _bal=null; n++;});
    singles.filter(g=>!g.rule).forEach(g=>{saveRule('goal',g.id,suggestRule([I.goals[g.id]])); _bal=null; n++;});
    toast('Accepted '+plural(n,'schedule')); renderGroups();});
  $('grM').addEventListener('click',e=>{const b=e.target.closest('[data-m]'); if(!b) return; P.match=b.dataset.m; savePrefs(); renderGroups();});
  $('grNew').addEventListener('click',()=>groupEditor(null,[]));
  $('view').onclick=e=>{
    const sa=e.target.closest('[data-sact]'), ga=e.target.closest('[data-gact]'), ac=e.target.closest('[data-accept]'), ru=e.target.closest('[data-rule]');
    if(ac){const [k,id]=ac.dataset.accept.split('|'); saveRule(k,id,JSON.parse(ac.dataset.r)); toast('Schedule saved'); renderGroups(); return;}
    if(ru){const [k,id]=ru.dataset.rule.split('|'); const o=k==='group'?I.groups[id]:I.goals[id]; const gs=k==='group'?liveGoals(o):[o];
      ruleSheet(k,id,gs,o.rule,k==='group'?o.name:nameAny(o.sid)); return;}
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

// ================= recurring schedules for groups and single probes =================
const WDN=['','Mon','Tue','Wed','Thu','Fri'], WDL=['','Mondays','Tuesdays','Wednesdays','Thursdays','Fridays'];
const cadence=g=>{const s=g.sched||{}; return `${s.n||1}×/${({week:'week',month:'month',period:'grading period',quarter:'quarter',year:'year'})[s.per||'month']}`;};
// weeks between measurements a goal needs (its slot length), from its schedule and the school calendar
function slotWeeks(g){ const s=g.sched||{}, n=Math.max(1,+s.n||1), c=cal()||{};
  const per=c.periods&&c.periods.length?c.periods.reduce((a,p)=>a+IEP.diff(p.start,p.end),0)/c.periods.length/7:13;
  const yr=c.start&&c.end?IEP.diff(c.start,c.end)/7:40;
  return ({week:1,month:4.3,quarter:yr/4,period:per,year:yr})[s.per||'month']/n; }
const everyFor=goals=>Math.max(1,Math.min(6,Math.floor(Math.min(...goals.map(slotWeeks)))));
function periodById(pid){ return ((D.bell&&D.bell.periods)||[]).find(p=>p.id===pid)||null; }
function ruleText(r){ if(!r) return ''; const p=periodById(r.pid);
  return `${r.every>1?'Every '+r.every+' weeks':'Every week'} · ${WDL[r.wd]}${p?' · '+p.name+(p.start?' ('+hm(p.start)+')':''):''}`; }
// first day anything can be scheduled: the later of today and the Start tracking from date
const firstDay=()=>{const t=today(), tf=I.settings&&I.settings.trackFrom; return IEP.nextSchool(tf&&tf>t?tf:t);};
const ruleNext=(r,n)=>IEP.ruleDays(r,firstDay(),addDays(firstDay(),7*(r.every||1)*n+7)).slice(0,n);
// periods on weekday wd where these goals' class meets their subject (any of the class's periods if no subject)
function periodsFor(goals,wd){ const cls=new Set(goals.map(g=>g.cls)), subj=goalSubj(goals[0]);
  const mon=IEP.add(IEP.nextSchool(today()),0); let d=mon; while(IEP.parse(d).getDay()!==wd) d=addDays(d,1);
  return periodsOn(d).filter(q=>q.cls&&cls.has(q.cls)&&(!subj||q.subj===subj)).map(q=>q.p); }
function suggestRule(goals,skipIds){
  const every=everyFor(goals), rules=goalRules(), ids=new Set(goals.map(g=>g.id)), sids=new Set(goals.map(g=>g.sid));
  const f0=firstDay(), end=addDays(f0,7*12), cap=dailyCap()||99, size=1;
  // how many probes the accepted schedules already put on each date over the next 12 weeks
  // (probes, so a scheduled group counts once per date)
  const occ={}, mine={}, gm=groupMap(), seenK={};
  Object.keys(rules).forEach(id=>{const g=I.goals[id]; if(ids.has(id)||(skipIds&&skipIds.has(id))||!g||g.status!=='active') return;
    IEP.ruleDays(rules[id],f0,end).forEach(d=>{const k=d+'|'+(gm[id]||id); if(!seenK[k]){seenK[k]=1; occ[d]=(occ[d]||0)+1;} if(sids.has(g.sid)) mine[d]=1;});});
  const hasBell=D.bell&&(D.bell.periods||[]).length, cands=[];
  for(let wd=1;wd<=5;wd++){ const ps=hasBell?periodsFor(goals,wd):[]; if(hasBell&&!ps.length) continue;
    let first=f0; while(IEP.parse(first).getDay()!==wd) first=addDays(first,1);
    // try each starting week so schedules that repeat every few weeks take turns
    for(let k=0;k<every;k++){ const anchor=addDays(first,7*k), r={wd,every,anchor}, ds=IEP.ruleDays(r,f0,end); if(!ds.length) continue;
      const peak=Math.max(...ds.map(d=>(occ[d]||0)+size)), avg=ds.reduce((t,d)=>t+(occ[d]||0),0)/ds.length, with_=ds.filter(d=>mine[d]).length/ds.length;
      const score=(peak>cap?100+peak:peak)+avg*0.2-with_*0.8+k*0.01;
      (ps.length?ps:[null]).forEach(p=>cands.push({wd,pid:p?p.id:null,anchor,score}));}}
  if(!cands.length){ let a=f0; cands.push({wd:IEP.parse(a).getDay(),pid:null,anchor:a,score:0}); }
  cands.sort((a,b)=>a.score-b.score||a.wd-b.wd);
  const c=cands[0]; return {wd:c.wd,pid:c.pid,every,anchor:c.anchor};
}
function saveRule(kind,id,rule){ I=loadI();
  const o=kind==='group'?(I.groups||{})[id]:I.goals[id]; if(!o) return;
  if(rule) o.rule=rule; else delete o.rule; o.updated=Date.now(); saveI(); }

// pick weekday, period and how often; shows the next dates and how busy they are
function ruleSheet(kind,id,goals,cur,title){
  let r=Object.assign({},cur||suggestRule(goals));
  const B=bal(), ids=new Set(goals.map(g=>g.id));
  const draw=el=>{
    let anchor=firstDay(); while(IEP.parse(anchor).getDay()!==r.wd) anchor=addDays(anchor,1); if(!(r.anchor&&IEP.parse(r.anchor).getDay()===r.wd&&r.anchor>=firstDay())) r.anchor=anchor;
    const ps=(D.bell&&(D.bell.periods||[]).length)?periodsFor(goals,r.wd):[];
    if(r.pid&&!ps.some(p=>p.id===r.pid)) r.pid=ps.length?ps[0].id:null; if(!r.pid&&ps.length) r.pid=ps[0].id;
    el.querySelector('#rsWd').innerHTML=[1,2,3,4,5].map(w=>`<button type="button" data-w="${w}" aria-pressed="${w===r.wd}">${WDN[w]}</button>`).join('');
    el.querySelector('#rsP').innerHTML=ps.length?ps.map(p=>`<button type="button" data-p="${esc(p.id)}" aria-pressed="${p.id===r.pid}">${esc(p.name)}${p.start?' · '+esc(hm(p.start)):''}</button>`).join('')
      :`<span class="hint">${D.bell&&(D.bell.periods||[]).length?'This class doesn\'t have that subject on '+WDL[r.wd]+'.':'Add your bell schedule in Classroom setup to pick a period.'}</span>`;
    el.querySelector('#rsE').textContent=r.every>1?'every '+r.every+' weeks':'every week';
    const next=ruleNext(r,4), cap=dailyCap();
    el.querySelector('#rsN').innerHTML=next.map(d=>{const n=B.filter(x=>x.day===d&&!ids.has(x.goal.id)).length; return `<li>${esc(dayName(d))} <small>· ${n}${cap?' / '+cap:''} already</small></li>`;}).join('');
    el.querySelector('#rsW').textContent=r.every>Math.floor(Math.min(...goals.map(slotWeeks)))?'Some goals need measuring more often than this; they\'ll be spread automatically in between.':'';
  };
  openSheet(`<h2>Schedule · ${esc(title)}</h2>
    <p class="hint" style="padding:0 6px">${goals.map(g=>esc(nameAny(g.sid))+' '+cadence(g)).join(' · ')}</p>
    <div class="field"><span class="lbl">Day</span><div class="seg" id="rsWd"></div></div>
    <div class="field"><span class="lbl">Period</span><div class="chips" id="rsP"></div></div>
    <div class="field"><span class="lbl">How often</span><div class="nums"><span class="step"><button type="button" id="rsM">−</button><output id="rsE"></output><button type="button" id="rsPl">+</button></span></div>
      <span class="hint">Suggested: every ${everyFor(goals)} week${everyFor(goals)>1?'s':''}, the longest gap that still meets every goal's cadence.</span><span class="hint" id="rsW" style="color:var(--part)"></span></div>
    <div class="field"><span class="lbl">Next dates</span><ul id="rsN" class="hint" style="margin:0;padding-left:18px"></ul></div>
    <div class="sticky-actions">${cur?'<button class="ghost" id="rsX">Remove schedule</button>':'<button class="ghost" id="rsC">Cancel</button>'}<button class="primary" id="rsS">Save</button></div>`,
  el=>{draw(el);
    el.querySelector('#rsWd').addEventListener('click',e=>{const b=e.target.closest('[data-w]'); if(!b) return; r.wd=+b.dataset.w; r.pid=null; draw(el);});
    el.querySelector('#rsP').addEventListener('click',e=>{const b=e.target.closest('[data-p]'); if(!b) return; r.pid=b.dataset.p; draw(el);});
    el.querySelector('#rsM').addEventListener('click',()=>{r.every=Math.max(1,r.every-1); draw(el);});
    el.querySelector('#rsPl').addEventListener('click',()=>{r.every=Math.min(6,r.every+1); draw(el);});
    el.querySelector('#rsS').addEventListener('click',()=>{saveRule(kind,id,{wd:r.wd,pid:r.pid||null,every:r.every,anchor:r.anchor}); closeSheet(); toast('Schedule saved'); render();});
    const c=el.querySelector('#rsC'); if(c) c.addEventListener('click',closeSheet);
    const x=el.querySelector('#rsX'); if(x) x.addEventListener('click',()=>{saveRule(kind,id,null); closeSheet(); toast('Schedule removed'); render();});});
}

// the schedule line on a group card or single-probe row
function schedLine(kind,id,goals,rule,title){
  if(rule) return `<div class="sched"><span>📅 <b>${esc(ruleText(rule))}</b> · next ${ruleNext(rule,2).map(d=>esc(wkday(d)+' '+short(d))).join(', ')}</span><button class="plain" data-rule="${kind}|${esc(id)}">Change</button></div>`;
  const s=suggestRule(goals);
  return `<div class="sched sug"><span>Suggested: ${esc(ruleText(s))} · next ${ruleNext(s,2).map(d=>esc(wkday(d)+' '+short(d))).join(', ')}</span><button class="primary" data-accept="${kind}|${esc(id)}" data-r="${esc(JSON.stringify(s))}">Accept</button><button class="plain" data-rule="${kind}|${esc(id)}">Other…</button></div>`;
}

// clear manual Move/Plan dates so the whole schedule is laid out fresh from the accepted schedules
function rebuildSheet(){
  const act=Object.values(I.goals).filter(g=>g.status==='active'), rules=goalRules(), ruled=act.filter(g=>rules[g.id]).length;
  let mon=IEP.nextSchool(addDays(today(),1)); while(IEP.parse(mon).getDay()!==1) mon=addDays(mon,1);
  const tf=(I.settings&&I.settings.trackFrom)||mon;
  openSheet(`<h2>Rebuild schedule</h2>
    <p>Recorded measurements and your groups are always kept.</p>
    <div class="field" style="padding:0 6px"><span class="lbl">Start fresh</span>
      <div class="bar"><label for="rbDate">Start on</label><input type="date" id="rbDate" value="${esc(tf)}" style="width:190px"></div>
      <span class="hint">Clears every Move/Plan date and every accepted schedule, forgives anything due before this date, then suggests new schedules for all groups and single probes.</span>
      <button class="primary" id="rbFresh" style="align-self:flex-start">Start fresh</button></div>
    <hr>
    <button class="item col" id="rbKeep"><b>Keep my schedules</b><small>Only clear Move/Plan dates and lay out the ${plural(ruled,'goal')} with schedules again.</small></button>
    <div class="sticky-actions"><button class="ghost" id="rbC">Cancel</button></div>`,
  el=>{el.querySelector('#rbC').addEventListener('click',closeSheet);
    const clearPlans=()=>{I=loadI(); Object.values(I.goals).forEach(g=>{if(g.plan){g.plan=''; g.updated=Date.now();}}); saveI();};
    el.querySelector('#rbKeep').addEventListener('click',()=>{clearPlans(); closeSheet(); toast('Schedule rebuilt'); render();});
    el.querySelector('#rbFresh').addEventListener('click',e=>confirmTap(e.currentTarget,'Tap again to start fresh',()=>{
      const from=el.querySelector('#rbDate').value;
      clearPlans(); I=loadI(); I.settings=I.settings||{}; if(from) I.settings.trackFrom=from;
      Object.values(I.groups||{}).forEach(gr=>{delete gr.rule;}); Object.values(I.goals).forEach(g=>{if(g.rule){delete g.rule; g.updated=Date.now();}}); saveI();
      // suggest one at a time, groups first, so each suggestion sees the ones before it
      let n=0;
      groupList().forEach(gr=>{const gs=liveGoals(gr); if(gs.length){saveRule('group',gr.id,suggestRule(gs)); n++;}});
      const grouped=new Set(groupList().flatMap(x=>x.goals));
      Object.values(I.goals).filter(g=>g.status==='active'&&!grouped.has(g.id)).forEach(g=>{saveRule('goal',g.id,suggestRule([I.goals[g.id]])); n++;});
      closeSheet(); toast('Fresh start from '+short(from||today())+': '+plural(n,'schedule')); render();}));});
}
