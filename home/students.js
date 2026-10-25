/* Classroom Home: student profiles, IEP goals, measuring, planning, and the goal bank. */

// ================= STUDENTS =================
function renderStudents(){
  if(profileSid){ if(classOf(profileSid)) return renderProfile(profileSid); profileSid=null; }
  let h=`<div class="seg" id="stView" style="align-self:flex-start"><button type="button" data-v="profiles" aria-pressed="${studView==='profiles'}">Profiles</button><button type="button" data-v="accom" aria-pressed="${studView==='accom'}">Accommodations overview</button></div>`;
  if(studView==='accom'){ $('view').innerHTML=h+'<div id="accWrap" style="display:flex;flex-direction:column;gap:12px"></div>'; wireStView(); renderAccomOverview($('accWrap')); return; }
  const ids=classIds(); const t=today();
  const due=new Map(), st=schoolToday(); bal().forEach(x=>{if(x.day<=st) due.set(x.sid,(due.get(x.sid)||0)+1);});
  ids.forEach(c=>{const cl=D.classes[c], r=(cl&&cl.students)||[];
    if(ids.length>1&&!r.length) return;
    if(ids.length>1) h+=`<div class="clshead">${esc(cl.name)}</div>`;
    if(!r.length){h+=`<div class="empty">No students in ${esc(cl.name)}. Add them in <a href="../setup/">Classroom setup</a>.</div>`;return;}
    r.forEach(s=>{const gs=Object.values(I.goals).filter(g=>g.sid===s.id&&g.status!=='closed'), ac=(C.students[s.id]||[]).length, dn=due.get(s.id)||0;
      h+=`<button type="button" class="rowbtn" data-prof="${esc(s.id)}"><span class="grow"><b>${esc(s.name)}</b><br><span class="meta">${plural(gs.length,'goal')} · ${plural(ac,'accommodation')}</span></span>${dn?`<span class="tag due">${dn} due</span>`:''}</button>`;});
  });
  $('view').innerHTML=h; wireStView();
  $('view').onclick=e=>{const b=e.target.closest('[data-prof]'); if(b){profileSid=b.dataset.prof; renderProfile(profileSid); window.scrollTo(0,0);}};
}
function wireStView(){$('stView').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(b){studView=b.dataset.v;renderStudents();}});}

function resultChips(gid,n){
  const pts=I.data.filter(p=>p.goal===gid).sort((a,b)=>a.date<b.date?-1:1).slice(-(n||8));
  if(!pts.length) return '';
  const g=I.goals[gid], target=(g.criteria&&+g.criteria.pct)||80;
  return '<div class="res">'+pts.map(p=>`<span class="${p.pct>=target?'y':'n'}" title="${esc(short(p.date))}">${p.pct}%</span>`).join('')+'</div>';
}
function nextText(g){
  if(g.status==='met') return {cls:'ok',txt:'Met'+(g.metDate?' '+short(g.metDate):'')};
  if(g.status==='paused') return {cls:'',txt:'Paused'};
  if(g.status==='closed') return {cls:'',txt:'Closed'};
  const t=today(), st=schoolToday(), sc=IEP.schedule(g,I.data,cal(),addDays(t,120),t), n=sc.next, b=nextFor(g.id);
  if(!n) return {cls:'',txt:'No more measurements scheduled'};
  const missed=sc.slots.filter(s=>s.state==='missed').length;
  if(b){ const when=b.day===t?'today':b.day===st?wkday(b.day):wkday(b.day)+' '+short(b.day);
    const txt=(b.planned?'Planned ':b.overdue?'Overdue · ':'')+(b.planned?when:'Measure '+when)+(b.slot.end>b.day?' · due by '+short(b.slot.end):'');
    return {cls:b.overdue||b.overCap?'over':b.day<=st?'due':'',txt,label:n.label,missed}; }
  return {cls:'',txt:'Next: '+short(n.target),label:n.label,missed};
}
function renderProfile(sid){
  const c=classOf(sid), nm=nameAny(sid), pr=I.profiles[sid]||{}, t=today();
  const gs=Object.values(I.goals).filter(g=>g.sid===sid).sort((a,b)=>(a.status==='closed')-(b.status==='closed')||String(a.area).localeCompare(String(b.area)));
  const acc=C.students[sid]||[];
  const acts=A.entries.filter(e=>(e.sids||[]).includes(sid)).sort((a,b)=>a.date<b.date?1:-1);
  let h=`<div class="bar"><button class="plain" id="backP" style="padding:0">‹ Students</button><span class="grow"></span><button class="ghost" id="printP" style="min-height:40px">Print progress</button></div>
    <div class="prof-h"><div class="grow"><h2>${esc(nm)}</h2><div class="facts"><span>${esc((D.classes[c]||{}).name||'')}</span>
      <span>IEP date <b>${pr.iepDate?esc(short(pr.iepDate)):'—'}</b></span>${pr.day?`<span>Measuring day <b>${['','Mon','Tue','Wed','Thu','Fri'][pr.day]}</b></span>`:''}<span>Annual review <b>${pr.reviewDate?esc(short(pr.reviewDate)):'—'}</b>${pr.reviewDate&&pr.reviewDate>=t&&pr.reviewDate<=addDays(t,30)?' <span class="tag due">soon</span>':''}</span></div></div>
      <button class="ghost" id="editIep" style="min-height:40px">IEP & schedule</button></div>`;
  // goals
  h+=`<div class="sec"><h2>Goals</h2><button class="primary" id="addGoal" style="min-height:42px">+ Add goal</button></div>`;
  if(!gs.length) h+=`<div class="card" style="align-items:center;text-align:center"><div class="meta">No goals yet. Add one from the goal bank or write a new one.</div></div>`;
  gs.forEach(g=>{const nx=nextText(g), cr=IEP.criteria(g,I.data);
    h+=`<div class="card goal"><div class="bar">${g.area?`<span class="tag area">${esc(g.area)}</span>`:''}<span class="grow"></span><span class="tag ${nx.cls}">${esc(nx.txt)}</span></div>
      <div class="stmt">${esc(IEP.fill(g.text,nm))}</div>
      <div class="meta">${esc(IEP.critText(g.criteria))} · ${esc(IEP.schedText(g.sched))}${nx.label?' · now: '+esc(nx.label):''}</div>
      ${g.iep?`<div class="meta">IEP: ${esc([g.iep.crit,g.iep.meth,g.iep.sched].filter(Boolean).join(' · '))}</div>`:''}
      <div class="meta"><b style="color:${cr.met?'var(--got)':'var(--fg)'}">${esc(cr.text)}</b>${cr.met&&g.status==='active'?' · criteria met, mark as Met?':''}${nx.missed?` · <span style="color:var(--not)">${plural(nx.missed,'missed measurement')}</span>`:''}</div>
      ${resultChips(g.id)}
      <div class="btnrow">${g.status==='active'?`<button class="primary" data-measure="${esc(g.id)}">Measure</button><button class="ghost" data-plan="${esc(g.id)}">Plan</button>`:''}<button class="ghost" data-hist="${esc(g.id)}">History</button><span class="grow"></span><button class="plain" data-edit="${esc(g.id)}">Edit</button></div></div>`;});
  // accommodations
  h+=`<div class="sec"><h2>Accommodations</h2><button class="ghost" id="editAcc" style="min-height:42px">Edit</button></div>
    <div class="card">${acc.length?`<div class="acc">${acc.map(a=>`<span>${esc(a.text)}${a.note?' <small>· '+esc(a.note)+'</small>':''}</span>`).join('')}</div>`:'<div class="meta">None listed.</div>'}</div>`;
  // activity
  h+=`<div class="sec"><h2>Activity</h2><button class="ghost" id="newAct" style="min-height:42px">+ New entry</button></div><div class="card">`+
    (acts.length?acts.slice(0,5).map(e=>`<button type="button" class="it" data-act="${esc(e.id)}"><span class="k">${esc(short(e.date))}</span><span class="v"><small>${esc(TSHORT[e.type])}${e.method?' · '+esc(e.method):''}</small> ${esc((e.summary||'').slice(0,100))}${e.fu&&!e.fu.done?` <span class="tag ${e.fu.date<t?'over':'due'}">follow up ${esc(short(e.fu.date))}</span>`:''}</span></button>`).join('')+(acts.length>5?`<button class="plain" id="allAct" style="align-self:flex-start;padding:0">See all ${acts.length}</button>`:'')
      :'<div class="meta">No entries yet.</div>')+`</div>`;
  // notes from the IEP
  h+=`<div class="sec"><h2>Notes</h2><span class="meta" id="noteSaved"></span></div>
    <textarea class="notes" id="iepNotes" placeholder="Anything from the IEP or elsewhere worth keeping handy: present levels, strengths, services, contacts…">${esc(pr.notes||'')}</textarea>`;
  $('view').innerHTML=h;
  const fresh=()=>renderProfile(sid);
  $('backP').addEventListener('click',()=>{profileSid=null;renderStudents();});
  $('printP').addEventListener('click',()=>printProgress(sid));
  $('editIep').addEventListener('click',()=>iepSheet(sid,fresh));
  $('addGoal').addEventListener('click',()=>addGoalSheet(sid,fresh));
  $('editAcc').addEventListener('click',()=>editAccom(sid,fresh));
  $('newAct').addEventListener('click',()=>editEntry(null,[sid],fresh));
  if($('allAct')) $('allAct').addEventListener('click',()=>{tab='activity';actStudent=sid;actFilter='all';savePrefs();render();});
  const notes=$('iepNotes'); let nT;
  const saveNotes=()=>{I=loadI(); const p=I.profiles[sid]=I.profiles[sid]||{}; if((p.notes||'')===notes.value) return; p.notes=notes.value; p.updated=Date.now(); saveI(); $('noteSaved').textContent='Saved';};
  notes.addEventListener('input',()=>{$('noteSaved').textContent=''; clearTimeout(nT); nT=setTimeout(saveNotes,800);});
  notes.addEventListener('blur',saveNotes);
  $('view').onclick=e=>{const b=e.target.closest('[data-measure],[data-plan],[data-hist],[data-edit],[data-act]'); if(!b) return;
    const d=b.dataset;
    if(d.measure) measureSheet([I.goals[d.measure]],fresh);
    else if(d.plan) planSheet(I.goals[d.plan],fresh);
    else if(d.hist) historySheet(I.goals[d.hist],fresh);
    else if(d.edit) goalEditor(I.goals[d.edit],{sid},fresh);
    else if(d.act) editEntry(A.entries.find(x=>x.id===d.act),null,fresh);};
}

function iepSheet(sid,after){
  const pr=I.profiles[sid]||{};
  openSheet(`<h2>${esc(nameAny(sid))} · IEP dates</h2>
    <div class="field"><label for="ipD">IEP date</label><input id="ipD" type="date" value="${esc(pr.iepDate||'')}" style="width:200px"></div>
    <div class="field"><label for="ipR">Annual review</label><input id="ipR" type="date" value="${esc(pr.reviewDate||'')}" style="width:200px"></div>
    <div class="field"><span class="lbl">Measuring day (optional)</span><div class="seg" id="ipDay">${['Any','Mon','Tue','Wed','Thu','Fri'].map((n,i)=>`<button type="button" data-d="${i}" aria-pressed="${(+pr.day||0)===i}">${n}</button>`).join('')}</div></div>
    <p class="hint" style="padding:0 6px">New goals for this student end on the annual review date unless you set another end.</p>
    <div class="sticky-actions"><button class="ghost" id="ipC">Cancel</button><button class="primary" id="ipS">Save</button></div>`,
  el=>{let day=+pr.day||0;
    el.querySelector('#ipDay').addEventListener('click',e=>{const b=e.target.closest('[data-d]'); if(!b) return; day=+b.dataset.d; el.querySelectorAll('#ipDay button').forEach(x=>x.setAttribute('aria-pressed',x===b));});
    el.querySelector('#ipC').addEventListener('click',closeSheet);
    el.querySelector('#ipS').addEventListener('click',()=>{I=loadI(); const p=I.profiles[sid]=I.profiles[sid]||{}; p.iepDate=el.querySelector('#ipD').value; p.reviewDate=el.querySelector('#ipR').value; if(day) p.day=day; else delete p.day; p.updated=Date.now(); saveI(); closeSheet(); toast('Saved'); after();});});
}

// names a student goes by: roster name, plus the name used in their IEP if different
function stuNames(sid){ const n=[nameAny(sid)], k=((I.profiles||{})[sid]||{}).iepName; if(k&&k!==n[0]) n.push(k); return n; }
// ---------- goal editor: a student's goal ({sid}) or a goal bank entry ({bank:true})
function goalEditor(g,opt,after){
  const isBank=!!opt.bank, isNew=!g, sid=opt.sid, pr=sid?(I.profiles[sid]||{}):{};
  const d=g?JSON.parse(JSON.stringify(g)):Object.assign({id:uid(isBank?'b':'g'),area:'',text:'',criteria:{pct:80,x:4,y:5},methods:[],sched:{n:1,per:'month'}},
    isBank?{}:{sid,cls:classOf(sid),bank:null,start:today(),end:pr.reviewDate||(cal()&&cal().end)||'',status:'active',plan:''},opt.from||{});
  const copies=isBank&&!isNew?Object.values(I.goals).filter(x=>x.bank===d.id):[];
  const areas=[...new Set([...AREAS,...Object.values(I.goals).map(x=>x.area),...Object.values(I.bank).map(x=>x.area)].filter(Boolean))];
  const methods=[...new Set([...METHODS,...d.methods,...Object.values(I.bank).flatMap(x=>x.methods||[]),...Object.values(I.goals).flatMap(x=>x.methods||[])])];
  openSheet(`<h2>${isNew?(isBank?'New goal for the bank':'New goal'):(isBank?'Edit bank goal':'Edit goal')}${sid?' · '+esc(nameAny(sid)):''}</h2>
    <div class="field"><span class="lbl">Area</span><div class="chips" id="gArea">${areas.map(a=>`<button type="button" data-a="${esc(a)}" aria-pressed="${d.area===a}">${esc(a)}</button>`).join('')}<button type="button" class="sug" data-a="__new">Other…</button></div></div>
    <div class="field"><label for="gText">Goal</label><textarea id="gText" placeholder="Paste or type the goal. Use {{student}} where the name goes.">${esc(d.text)}</textarea>
      <div class="bar" style="gap:8px"><button type="button" class="ghost" id="insStu" style="min-height:40px">Insert student</button><span class="hint grow">Adds {{student}}, shown as each student's name. Typing the name works too; it's swapped when you save.</span></div></div>
    <div class="field"><span class="lbl">Criteria</span><div class="nums"><input id="cP" type="number" min="1" max="100" value="${esc(d.criteria.pct)}" aria-label="Percent">% accuracy
        <label class="bar" style="gap:6px"><input type="checkbox" id="cT" ${d.criteria.trials===false?'':'checked'} style="width:22px;height:22px"> in</label>
        <span id="cTW" class="nums"><input id="cX" type="number" min="1" max="20" value="${esc(d.criteria.x||4)}" aria-label="Trials needed"> out of <input id="cY" type="number" min="1" max="20" value="${esc(d.criteria.y||5)}" aria-label="Trials considered"> trials</span></div>
      <span class="hint" id="cTH"></span></div>
    <div class="field"><span class="lbl">Measure</span><div class="nums"><input id="sN" type="number" min="1" max="20" value="${esc(d.sched.n)}" aria-label="How many times"> time(s) per <select id="sPer">${Object.keys(IEP.PER).map(k=>`<option value="${k}">${IEP.PER[k]}</option>`).join('')}</select></div></div>
    <div class="field"><span class="lbl">Methods</span><div class="chips" id="gMeth">${methods.map(m=>`<button type="button" data-m="${esc(m)}" aria-pressed="${d.methods.includes(m)}">${esc(m)}</button>`).join('')}<button type="button" class="sug" data-m="__new">Other…</button></div></div>
    ${isBank?'':`<div class="field"><span class="lbl">Dates</span><div class="bar"><input id="gS" type="date" value="${esc(d.start||'')}" aria-label="Start"><span class="hint">to</span><input id="gE" type="date" value="${esc(d.end||'')}" aria-label="End"></div></div>
      <div class="field"><span class="lbl">Status</span><div class="seg" id="gStat">${['active','met','paused','closed'].map(s=>`<button type="button" data-s="${s}" aria-pressed="${d.status===s}">${s[0].toUpperCase()+s.slice(1)}</button>`).join('')}</div>
      <div id="metW" class="bar"><span class="hint">Met on</span><input id="gMet" type="date" value="${esc(d.metDate||today())}" max="${today()}"></div></div>
      ${isNew&&!d.bank?`<label class="bar" style="gap:8px;padding:0 6px;font-size:16px"><input type="checkbox" id="toBank" checked style="width:22px;height:22px"> Also save to the goal bank</label>`:''}`}
    ${copies.length?`<label class="bar" style="gap:8px;padding:0 6px;font-size:16px"><input type="checkbox" id="upd" checked style="width:22px;height:22px"> Also update ${plural(copies.length,'student')} using this goal</label>`:''}
    <div id="gErr" class="note bad" hidden style="margin:0 6px"></div>
    ${isNew?'':`<div class="bar" style="padding:6px"><button class="plain" id="gDel" style="color:var(--not)">Delete${isBank?' from bank':' goal'}…</button></div>
      <div class="note" id="gDelC" hidden style="margin:0 6px">${isBank?'Remove this from the goal bank? Students keep their own copies.':`Delete this goal and its ${plural(I.data.filter(p=>p.goal===d.id).length,'measurement')}? Setting it to Closed keeps the history instead.`}<div class="bar" style="margin-top:8px"><button class="danger" id="gDelY">Delete</button><button class="ghost" id="gDelN">Keep</button></div></div>`}
    <div class="sticky-actions"><button class="ghost" id="gC">Cancel</button><button class="primary" id="gSave">${isNew?'Add':'Save'}</button></div>`,
  el=>{
    el.querySelector('#insStu').addEventListener('pointerdown',e=>e.preventDefault()); // keep the keyboard and cursor
    el.querySelector('#insStu').addEventListener('click',()=>{const ta=el.querySelector('#gText'), a=ta.selectionStart??ta.value.length, b=ta.selectionEnd??a, v=ta.value;
      const pre=a>0&&!/\s$/.test(v.slice(0,a))?' ':'', ins=pre+'{{student}} ';
      ta.value=v.slice(0,a)+ins+v.slice(b).replace(/^\s+/,''); ta.focus(); ta.selectionStart=ta.selectionEnd=a+ins.length;});
    el.querySelector('#sPer').value=d.sched.per;
    const trialsUI=()=>{const on=el.querySelector('#cT').checked; el.querySelector('#cTW').style.opacity=on?1:.35; el.querySelectorAll('#cTW input').forEach(i=>i.disabled=!on);
      el.querySelector('#cTH').textContent=on?'':'Without trials, the goal counts as meeting criteria when the latest measurement reaches the percent.';};
    trialsUI(); el.querySelector('#cT').addEventListener('change',trialsUI);
    const pick=(id,attr,multi)=>el.querySelector(id).addEventListener('click',e=>{const b=e.target.closest(`[data-${attr}]`); if(!b) return; const v=b.dataset[attr];
      if(v==='__new'){const inp=document.createElement('input');inp.type='text';inp.placeholder='Type it';inp.enterKeyHint='done';inp.style.minWidth='170px';b.replaceWith(inp);inp.focus();
        inp.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();inp.blur();}});
        inp.addEventListener('blur',()=>{const t=inp.value.trim(); const nb=document.createElement('button'); nb.type='button';
          if(t){nb.dataset[attr]=t; nb.textContent=t; nb.setAttribute('aria-pressed','true'); if(multi) d.methods.push(t); else {d.area=t; el.querySelectorAll(id+' [aria-pressed]').forEach(x=>x.setAttribute('aria-pressed','false')); nb.setAttribute('aria-pressed','true');}
            inp.replaceWith(nb); const more=document.createElement('button'); more.type='button'; more.className='sug'; more.dataset[attr]='__new'; more.textContent='Other…'; nb.after(more);}
          else{nb.className='sug'; nb.dataset[attr]='__new'; nb.textContent='Other…'; inp.replaceWith(nb);}},{once:true}); return;}
      if(multi){const i=d.methods.indexOf(v); if(i<0) d.methods.push(v); else d.methods.splice(i,1); b.setAttribute('aria-pressed',i<0);}
      else{d.area=d.area===v?'':v; el.querySelectorAll(id+' [data-a]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.a===d.area));}});
    pick('#gArea','a',false); pick('#gMeth','m',true);
    if(!isBank){const stUI=()=>{el.querySelectorAll('#gStat button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.s===d.status)); el.querySelector('#metW').hidden=d.status!=='met';};
      stUI(); el.querySelector('#gStat').addEventListener('click',e=>{const b=e.target.closest('[data-s]'); if(b){d.status=b.dataset.s; stUI();}});}
    el.querySelector('#gC').addEventListener('click',closeSheet);
    el.querySelector('#gSave').addEventListener('click',()=>{
      const err=m=>{const x=el.querySelector('#gErr');x.textContent=m;x.hidden=false;};
      const num=(id,lo,hi,def)=>{const v=Math.round(+el.querySelector(id).value); return v>=lo&&v<=hi?v:def;};
      d.text=el.querySelector('#gText').value.trim();
      if(!isBank&&d.sid) d.text=stuNames(d.sid).reduce((t,n)=>IEPParse.unname(t,n),d.text);
      d.criteria={pct:num('#cP',1,100,80),x:num('#cX',1,20,4),y:num('#cY',1,20,5)};
      if(!el.querySelector('#cT').checked) d.criteria.trials=false;
      else if(d.criteria.x>d.criteria.y) return err('The number of trials needed can\'t be more than the trials considered.');
      d.sched={n:num('#sN',1,20,1),per:el.querySelector('#sPer').value};
      if(!d.text) return err('Add the goal wording.');
      if(!isBank){d.start=el.querySelector('#gS').value||today(); d.end=el.querySelector('#gE').value||''; if(d.end&&d.end<d.start) return err('The end date is before the start date.');
        if(d.status==='met') d.metDate=el.querySelector('#gMet').value||today(); else delete d.metDate;}
      d.updated=Date.now();
      I=loadI();
      if(isBank){I.bank[d.id]=d;
        const upd=el.querySelector('#upd'); if(upd&&upd.checked) Object.values(I.goals).filter(x=>x.bank===d.id).forEach(x=>{x.area=d.area;x.text=d.text;x.criteria=Object.assign({},d.criteria);x.methods=d.methods.slice();x.sched=Object.assign({},d.sched);x.updated=Date.now();});}
      else{const tb=el.querySelector('#toBank');
        if(tb&&tb.checked){const b={id:uid('b'),area:d.area,text:d.text,criteria:Object.assign({},d.criteria),methods:d.methods.slice(),sched:Object.assign({},d.sched),updated:Date.now()}; I.bank[b.id]=b; d.bank=b.id;}
        if(!I.goals[d.id]&&!d.created) d.created=Date.now(); I.goals[d.id]=d;}
      saveI(); closeSheet(); toast(isNew?'Added':'Saved'); after();});
    if(!isNew){
      el.querySelector('#gDel').addEventListener('click',()=>el.querySelector('#gDelC').hidden=false);
      el.querySelector('#gDelN').addEventListener('click',()=>el.querySelector('#gDelC').hidden=true);
      el.querySelector('#gDelY').addEventListener('click',()=>{I=loadI();
        if(isBank){delete I.bank[d.id]; Object.values(I.goals).forEach(x=>{if(x.bank===d.id) x.bank=null;});}
        else{delete I.goals[d.id]; I.data=I.data.filter(p=>p.goal!==d.id);}
        saveI(); closeSheet(); toast('Deleted'); after();});}
  });
}

// add a goal to a student: pick from the bank, or write a new one
function addGoalSheet(sid,after){
  const have=new Set(Object.values(I.goals).filter(g=>g.sid===sid).map(g=>g.bank).filter(Boolean));
  const bank=Object.values(I.bank).sort((a,b)=>String(a.area).localeCompare(String(b.area))||a.text.localeCompare(b.text));
  openSheet(`<h2>Add a goal · ${esc(nameAny(sid))}</h2>
    <div class="bar" style="padding:0 6px"><button class="primary" id="agNew">Write a new goal</button><button class="ghost" id="agPaste">Paste from IEP</button></div>
    ${bank.length?`<div class="lbl" style="padding:0 6px">From the goal bank</div>`+bank.map(b=>`<button type="button" class="item col" data-b="${esc(b.id)}" ${have.has(b.id)?'disabled':''}>
      <span>${b.area?`<span class="tag area">${esc(b.area)}</span> `:''}${have.has(b.id)?'<span class="tag ok">already added</span>':''}</span><span style="white-space:normal">${esc(IEP.fill(b.text,nameAny(sid)))}</span><small>${esc(IEP.critText(b.criteria))} · ${esc(IEP.schedText(b.sched))}</small></button>`).join('')
      :'<p class="hint" style="padding:0 6px">The goal bank is empty. Goals you write are saved there so you can reuse the wording.</p>'}
    <div class="sticky-actions"><button class="ghost" id="agC">Cancel</button></div>`,
  el=>{el.querySelector('#agC').addEventListener('click',closeSheet);
    el.querySelector('#agNew').addEventListener('click',()=>goalEditor(null,{sid},after));
    el.querySelector('#agPaste').addEventListener('click',()=>pasteSheet(sid,after));
    el.addEventListener('click',e=>{const b=e.target.closest('[data-b]'); if(!b||b.disabled) return; const bk=I.bank[b.dataset.b];
      goalEditor(null,{sid,from:{bank:bk.id,area:bk.area,text:bk.text,criteria:Object.assign({},bk.criteria),methods:(bk.methods||[]).slice(),sched:Object.assign({},bk.sched)}},after);});});
}

// ---------- measure one or many goals in one sitting
function measureSheet(goals,after){
  goals=goals.filter(Boolean);
  const rows=goals.map(g=>({g,correct:null,total:Math.max(1,(g.criteria&&+g.criteria.y)||5),pctIn:'',mode:'count',method:(P.method&&P.method[g.id])||((g.methods||[]).length===1?g.methods[0]:''),note:''}));
  openSheet(`<h2>Measure</h2>
    <div class="field"><label for="mDate">Date</label><input id="mDate" type="date" value="${today()}" max="${today()}" style="width:190px"></div>
    <div id="mRows" style="display:flex;flex-direction:column;gap:8px"></div>
    <div id="mErr" class="note bad" hidden style="margin:0 6px"></div>
    <div class="sticky-actions"><button class="ghost" id="mC">Cancel</button><button class="primary" id="mS">Save</button></div>`,
  el=>{
    const draw=()=>{el.querySelector('#mRows').innerHTML=rows.map((r,i)=>{const g=r.g, tgt=(g.criteria&&+g.criteria.pct)||80;
      const pct=r.mode==='count'?(r.correct==null?null:Math.round(100*r.correct/r.total)):(r.pctIn===''?null:Math.max(0,Math.min(100,Math.round(+r.pctIn))));
      return `<div class="mrow" data-i="${i}"><div><div class="nm">${esc(nameAny(g.sid))}</div><div class="gt">${esc(goalShort(g))}</div></div>
        <div class="top"><div class="seg"><button type="button" data-mode="count" aria-pressed="${r.mode==='count'}">Correct of</button><button type="button" data-mode="pct" aria-pressed="${r.mode==='pct'}">Percent</button></div>
        ${r.mode==='count'?`<span class="step"><button type="button" data-a="c-">−</button><output>${r.correct==null?'–':r.correct}</output><button type="button" data-a="c+">+</button></span><span class="hint">of</span><span class="step"><button type="button" data-a="t-">−</button><output>${r.total}</output><button type="button" data-a="t+">+</button></span>`
          :`<input type="number" min="0" max="100" data-pct="${i}" value="${esc(r.pctIn)}" style="width:100px" aria-label="Percent"> %`}
        <span class="grow"></span><span class="pct ${pct!=null&&pct>=tgt?'hit':''}">${pct==null?'':pct+'%'}</span></div>
        ${(g.methods||[]).length?`<div class="chips">${g.methods.map(m=>`<button type="button" data-meth="${esc(m)}" aria-pressed="${r.method===m}">${esc(m)}</button>`).join('')}</div>`:''}
        <input type="text" data-note="${i}" value="${esc(r.note)}" placeholder="Note (optional)" enterkeyhint="done"></div>`;}).join('');};
    draw();
    const box=el.querySelector('#mRows');
    box.addEventListener('click',e=>{const row=e.target.closest('[data-i]'); if(!row) return; const r=rows[+row.dataset.i], b=e.target.closest('button'); if(!b) return;
      if(b.dataset.mode) r.mode=b.dataset.mode;
      if(b.dataset.a){const a=b.dataset.a;
        if(a==='c+') r.correct=Math.min(r.total,(r.correct==null?0:r.correct)+1);
        if(a==='c-') r.correct=r.correct==null?0:Math.max(0,r.correct-1);
        if(a==='t+') r.total=Math.min(100,r.total+1);
        if(a==='t-'){r.total=Math.max(1,r.total-1); if(r.correct!=null) r.correct=Math.min(r.correct,r.total);}}
      if(b.dataset.meth) r.method=r.method===b.dataset.meth?'':b.dataset.meth;
      draw();});
    box.addEventListener('input',e=>{const t=e.target; if(t.dataset.note!=null) rows[+t.dataset.note].note=t.value;
      if(t.dataset.pct!=null){rows[+t.dataset.pct].pctIn=t.value; const r=rows[+t.dataset.pct], p=t.closest('.mrow').querySelector('.pct'), v=t.value===''?null:Math.max(0,Math.min(100,Math.round(+t.value)));
        p.textContent=v==null?'':v+'%'; p.classList.toggle('hit',v!=null&&v>=((r.g.criteria&&+r.g.criteria.pct)||80));}});
    box.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName==='INPUT'){e.preventDefault();e.target.blur();}});
    el.querySelector('#mC').addEventListener('click',closeSheet);
    el.querySelector('#mS').addEventListener('click',()=>{
      const date=el.querySelector('#mDate').value||today(); let n=0; I=loadI(); P.method=P.method||{};
      rows.forEach(r=>{let pt=null;
        if(r.mode==='count'&&r.correct!=null) pt={pct:Math.round(100*r.correct/r.total),correct:r.correct,total:r.total};
        if(r.mode==='pct'&&r.pctIn!=='') pt={pct:Math.max(0,Math.min(100,Math.round(+r.pctIn)))};
        if(!pt) return;
        I.data.push(Object.assign({id:uid('m'),goal:r.g.id,sid:r.g.sid,date,t:Date.now(),method:r.method,note:r.note.trim()},pt)); n++;
        const g=I.goals[r.g.id]; if(g&&g.plan&&g.plan<=addDays(date,30)) g.plan='';
        if(r.method) P.method[r.g.id]=r.method;});
      if(!n){const x=el.querySelector('#mErr'); x.textContent='Enter a score for at least one goal.'; x.hidden=false; return;}
      saveI(); savePrefs(); closeSheet(); toast(plural(n,'measurement')+' saved'); after();});
  });
}

// ---------- plan the next measurement for a specific day
function planSheet(g,after){
  const t=today(), sc=IEP.schedule(g,I.data,cal(),addDays(t,120),t), n=sc.next;
  const opts=[]; let d=t; while(opts.length<10){const w=parseDay(d).getDay(); if(w&&w<6) opts.push(d); d=addDays(d,1);}
  openSheet(`<h2>Plan · ${esc(nameAny(g.sid))}</h2><div class="hint" style="padding:0 6px">${esc(goalShort(g))}</div>
    ${n?`<p class="meta" style="padding:0 6px">Next measurement: ${esc(n.label)} · aim for ${esc(short(n.target))}, due by ${esc(short(n.end))}.</p>`:''}
    <div class="field"><span class="lbl">Measure on</span><div class="chips" id="plD">${opts.map(o=>`<button type="button" data-d="${o}" aria-pressed="${g.plan===o}">${o===t?'Today':o===addDays(t,1)?'Tomorrow':esc(wkday(o)+' '+short(o))}</button>`).join('')}</div></div>
    <div class="field"><label for="plOther">Or pick a date</label><input id="plOther" type="date" min="${t}" value="${esc(g.plan&&!opts.includes(g.plan)?g.plan:'')}" style="width:190px"></div>
    <div class="sticky-actions">${g.plan?'<button class="ghost" id="plClear">Clear plan</button>':'<button class="ghost" id="plCancel">Cancel</button>'}</div>`,
  el=>{const set=v=>{I=loadI(); I.goals[g.id].plan=v; I.goals[g.id].updated=Date.now(); saveI(); closeSheet(); toast(v?'Planned for '+wkday(v)+' '+short(v):'Plan cleared'); after();};
    el.querySelector('#plD').addEventListener('click',e=>{const b=e.target.closest('[data-d]'); if(b) set(b.dataset.d);});
    el.querySelector('#plOther').addEventListener('change',e=>{if(e.target.value) set(e.target.value);});
    const c=el.querySelector('#plClear'); if(c) c.addEventListener('click',()=>set(''));
    const x=el.querySelector('#plCancel'); if(x) x.addEventListener('click',closeSheet);});
}

// ---------- history of one goal
function historySheet(g,after){
  const draw=el=>{const pts=I.data.filter(p=>p.goal===g.id).sort((a,b)=>a.date<b.date?1:-1), tgt=(g.criteria&&+g.criteria.pct)||80;
    el.querySelector('#hList').innerHTML=pts.length?pts.map(p=>`<div class="h"><span class="d">${esc(short(p.date))}</span><span class="r" style="color:${p.pct>=tgt?'var(--got)':'var(--not)'}">${p.pct}%${p.total?' <small style="color:var(--muted)">'+p.correct+'/'+p.total+'</small>':''}</span><span class="t">${p.method?'<span class="tag" style="margin-right:6px">'+esc(p.method)+'</span>':''}${esc(p.note||'')}</span><button type="button" class="x" data-del="${esc(p.id)}">Delete</button></div>`).join('')
      :'<div class="empty">No measurements yet.</div>';};
  const sc=IEP.schedule(g,I.data,cal(),today(),today());
  openSheet(`<h2>${esc(nameAny(g.sid))}</h2><div class="hint" style="padding:0 6px">${esc(goalShort(g))}</div>
    <p class="meta" style="padding:0 6px">${esc(IEP.criteria(g,I.data).text)} · ${plural(sc.slots.filter(s=>s.state==='done').length,'scheduled measurement')} done, ${sc.slots.filter(s=>s.state==='missed').length} missed so far</p>
    <div class="hist" id="hList"></div>
    <div class="sticky-actions"><button class="ghost" id="hC">Close</button>${g.status==='active'?'<button class="primary" id="hM">Measure</button>':''}</div>`,
  el=>{draw(el);
    el.querySelector('#hList').addEventListener('click',e=>{const b=e.target.closest('[data-del]'); if(b) confirmTap(b,'Tap to delete',()=>{I=loadI(); I.data=I.data.filter(p=>p.id!==b.dataset.del); saveI(); draw(el);});});
    el.querySelector('#hC').addEventListener('click',()=>{closeSheet(); after();});
    const m=el.querySelector('#hM'); if(m) m.addEventListener('click',()=>measureSheet([I.goals[g.id]],after));});
}

// ---------- printable progress summary for one student, by grading period
function printProgress(sid){
  const nm=nameAny(sid), pr=I.profiles[sid]||{}, gp=(cal()&&cal().periods)||[];
  const gs=Object.values(I.goals).filter(g=>g.sid===sid&&g.status!=='closed');
  let h=`<h1>${esc(nm)} · IEP goal progress</h1><p>${esc((D.classes[classOf(sid)]||{}).name||'')} · IEP date ${esc(pr.iepDate?short(pr.iepDate):'—')} · Annual review ${esc(pr.reviewDate?short(pr.reviewDate):'—')} · Printed ${esc(short(today()))}</p>`;
  gs.forEach((g,i)=>{const pts=I.data.filter(p=>p.goal===g.id).sort((a,b)=>a.date<b.date?-1:1), cr=IEP.criteria(g,I.data);
    h+=`<h2>${i+1}. ${g.area?esc(g.area)+': ':''}${esc(IEP.fill(g.text,nm))}</h2><p>Criteria: ${esc(IEP.critText(g.criteria))} · Measured ${esc(IEP.schedText(g.sched))}${g.methods&&g.methods.length?' · Methods: '+esc(g.methods.join(', ')):''}</p><p>Status: ${esc(g.status)} · ${esc(cr.text)}</p>`;
    const periods=gp.length?gp:[{name:'All dates',start:'0000-00-00',end:'9999-99-99'}];
    h+=`<table><thead><tr><th>Period</th><th>Measurements</th><th>Average</th><th>Scores</th></tr></thead><tbody>`+periods.map(p=>{const inP=pts.filter(x=>x.date>=p.start&&x.date<=p.end);
      return `<tr><td>${esc(p.name)}</td><td>${inP.length}</td><td>${inP.length?Math.round(inP.reduce((a,x)=>a+x.pct,0)/inP.length)+'%':'—'}</td><td>${inP.map(x=>esc(short(x.date))+': '+x.pct+'%').join(', ')||'—'}</td></tr>`;}).join('')+`</tbody></table>`;});
  if(!gs.length) h+='<p>No goals.</p>';
  const acc=C.students[sid]||[]; h+=`<h2>Accommodations</h2><p>${acc.map(a=>esc(a.text)+(a.note?' ('+esc(a.note)+')':'')).join('; ')||'None listed.'}</p>`;
  $('printout').innerHTML=h; setTimeout(()=>window.print(),50);
}

// ================= GOAL BANK =================
function renderBank(){
  const bank=Object.values(I.bank).sort((a,b)=>String(a.area).localeCompare(String(b.area))||a.text.localeCompare(b.text));
  let h=`<div class="bar"><button class="primary" id="bNew">+ New goal</button><span class="grow"></span></div>
    <p class="hint">Write a goal's wording once, then add it to any student. Each student gets their own copy you can adjust.</p>`;
  if(!bank.length) h+=`<div class="empty">No goals in the bank yet.</div>`;
  let area=null;
  bank.forEach(b=>{if(b.area!==area){area=b.area; h+=`<div class="clshead">${esc(area||'No area')}</div>`;}
    const users=Object.values(I.goals).filter(g=>g.bank===b.id&&sidInScope(g.sid)&&g.status!=='closed');
    const ids=new Set(users.map(g=>g.id)), dueN=bal().filter(x=>ids.has(x.goal.id)&&x.day<=schoolToday()).length;
    h+=`<button type="button" class="stu" data-b="${esc(b.id)}"><div class="stmt">${esc(b.text)}</div><div class="meta">${esc(IEP.critText(b.criteria))} · ${esc(IEP.schedText(b.sched))}</div>
      <div class="bar"><span class="meta grow">${users.length?esc(users.map(g=>nameAny(g.sid)).join(', ')):'No students yet'}</span>${dueN?`<span class="tag due">${dueN} due</span>`:''}</div></button>`;});
  $('view').innerHTML=h;
  $('bNew').addEventListener('click',()=>goalEditor(null,{bank:true},renderBank));
  $('view').onclick=e=>{const b=e.target.closest('[data-b]'); if(b) bankSheet(I.bank[b.dataset.b]);};
}
function bankSheet(b){
  const users=()=>Object.values(I.goals).filter(g=>g.bank===b.id);
  const draw=el=>{const us=users(), t=today();
    el.querySelector('#bUsers').innerHTML=us.length?us.map(g=>{const nx=nextText(g); return `<button type="button" class="item" data-prof="${esc(g.sid)}" style="gap:8px"><span class="grow">${esc(nameAny(g.sid))}</span><span class="tag ${nx.cls}">${esc(nx.txt)}</span></button>`;}).join(''):'<p class="hint" style="padding:0 6px">No students have this goal yet.</p>';
    const act=us.filter(g=>g.status==='active'), due=act.filter(g=>['due','over'].includes(nextText(g).cls));
    const m=el.querySelector('#bMeasure'); m.hidden=!act.length; m.textContent=due.length?'Measure ('+due.length+' due)':'Measure students';};
  openSheet(`<h2>${b.area?esc(b.area)+' · ':''}Bank goal</h2><div class="crit" style="margin:0 6px;white-space:pre-wrap">${esc(b.text)}</div>
    <p class="meta" style="padding:0 6px">${esc(IEP.critText(b.criteria))} · ${esc(IEP.schedText(b.sched))}${(b.methods||[]).length?' · '+esc(b.methods.join(', ')):''}</p>
    <div class="bar" style="padding:0 6px"><button class="primary" id="bAdd">Add to students…</button><button class="ghost" id="bMeasure" hidden></button><button class="plain" id="bEdit">Edit wording & settings</button></div>
    <div class="lbl" style="padding:0 6px">Students with this goal</div><div id="bUsers"></div>
    <div class="sticky-actions"><button class="ghost" id="bC">Close</button></div>`,
  el=>{draw(el);
    el.querySelector('#bC').addEventListener('click',()=>{closeSheet();renderBank();});
    el.querySelector('#bEdit').addEventListener('click',()=>goalEditor(b,{bank:true},renderBank));
    el.querySelector('#bUsers').addEventListener('click',e=>{const p=e.target.closest('[data-prof]'); if(p){closeSheet(); goProfile(p.dataset.prof);}});
    // everyone active on this goal, due ones first; rows left blank aren't saved
    el.querySelector('#bMeasure').addEventListener('click',()=>{const act=users().filter(g=>g.status==='active'&&sidInScope(g.sid)), rank=g=>({over:0,due:1}[nextText(g).cls]??2);
      measureSheet(act.sort((a,b)=>rank(a)-rank(b)||nameAny(a.sid).localeCompare(nameAny(b.sid))),()=>{renderBank();bankSheet(I.bank[b.id]);});});
    el.querySelector('#bAdd').addEventListener('click',()=>applySheet(b));});
}
function applySheet(b){
  const have=new Set(Object.values(I.goals).filter(g=>g.bank===b.id).map(g=>g.sid)), sel=[];
  const ids=classIds();
  openSheet(`<h2>Add to students</h2><div class="hint" style="padding:0 6px">${esc(b.text.slice(0,120))}</div>
    ${ids.map(c=>{const r=(D.classes[c]&&D.classes[c].students)||[]; if(!r.length) return '';
      return `<div class="field"><span class="lbl">${esc(D.classes[c].name)}</span><div class="chips">${r.map(s=>`<button type="button" data-sid="${esc(s.id)}" ${have.has(s.id)?'disabled':''} aria-pressed="false">${esc(s.name)}${have.has(s.id)?' ✓':''}</button>`).join('')}</div></div>`;}).join('')}
    <p class="hint" style="padding:0 6px">Each student's copy starts today and ends on their annual review date (or the end of the school year). You can change either on their profile.</p>
    <div class="sticky-actions"><button class="ghost" id="apC">Cancel</button><button class="primary" id="apS">Add</button></div>`,
  el=>{el.addEventListener('click',e=>{const x=e.target.closest('[data-sid]'); if(!x||x.disabled) return; const i=sel.indexOf(x.dataset.sid); if(i<0) sel.push(x.dataset.sid); else sel.splice(i,1); x.setAttribute('aria-pressed',i<0);});
    el.querySelector('#apC').addEventListener('click',()=>bankSheet(b));
    el.querySelector('#apS').addEventListener('click',()=>{if(!sel.length){toast('Pick at least one student');return;}
      I=loadI(); sel.forEach(sid=>{const pr=I.profiles[sid]||{}; const g={id:uid('g'),sid,cls:classOf(sid),bank:b.id,area:b.area,text:b.text,criteria:Object.assign({},b.criteria),methods:(b.methods||[]).slice(),sched:Object.assign({},b.sched),
        start:today(),end:pr.reviewDate||(cal()&&cal().end)||'',status:'active',plan:'',created:Date.now(),updated:Date.now()}; I.goals[g.id]=g;});
      saveI(); toast('Added to '+plural(sel.length,'student')); bankSheet(I.bank[b.id]);});});
}
