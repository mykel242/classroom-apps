/* Day: the teacher's day as a hub.
   Reads rosters, bell schedule and calendar (classroom.v1), IEP goals and measurements (iep.v1),
   activity log (activity.v1) and accommodations (accom.v1). Its own data lives in day.v1:
     lessons: {id: {id, cls, subj, title, link, notes, updated}}
     periods: {'YYYY-MM-DD|periodId': {lesson, continued, did, didLink, probes:[goalId], skip:[goalId], updated}}
     todos:   [{id, text, date, done, doneOn, updated}]
     days:    {date: {type:'off'|'remote', note}}
     absent:  {date: [studentId]}
     notes:   {date: text}
     links:   {classId: activity-app url}
   IEP probes are suggested per period, never scheduled: a goal is suggested while its current window
   (month, quarter, grading period...) has no measurement; nothing carries forward when skipped. */
const $=id=>document.getElementById(id);
const esc=t=>String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const {today,add,parse,diff}=IEP;
const short=s=>parse(s).toLocaleDateString(undefined,{month:'short',day:'numeric'});
const wkday=s=>parse(s).toLocaleDateString(undefined,{weekday:'short'});
const dayName=s=>parse(s).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const plural=(n,w,ws)=>n+' '+(n===1?w:(ws||w+'s'));
let toastT; const toast=m=>{const t=$('toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,2200);};
const wdOf=d=>parse(d).getDay();

// ---------- data
const YK='day.v1', AK='activity.v1', CK='accom.v1';
const loadJ=(k,def)=>{try{const v=JSON.parse(localStorage.getItem(k)); return v&&typeof v==='object'?v:def;}catch(e){return def;}};
function loadY(){const y=loadJ(YK,{}); ['lessons','periods','days','absent','notes','links'].forEach(k=>{if(!y[k]||typeof y[k]!=='object') y[k]={};}); if(!Array.isArray(y.todos)) y.todos=[]; return y;}
let D, I, A, C, Y, _sug={};
function loadAll(){ D=Classroom.load(); I=IEP.load(); A=loadJ(AK,{}); A.entries=Array.isArray(A.entries)?A.entries:[]; C=loadJ(CK,{}); C.students=C.students||{}; Y=loadY(); _sug={}; }
const saveY=()=>{_sug={}; try{localStorage.setItem(YK,JSON.stringify(Y))}catch(e){toast("Couldn't save. The tablet may be out of space.");}};
const saveI=()=>{_sug={}; try{IEP.save(I)}catch(e){toast("Couldn't save.");}};
const saveA=()=>{try{localStorage.setItem(AK,JSON.stringify(A))}catch(e){}};
loadAll();

// ---------- people and goals
const classOf=sid=>Object.keys(D.classes).find(c=>(D.classes[c].students||[]).some(s=>s.id===sid))||null;
const nameAny=sid=>{const c=classOf(sid); return c?Classroom.nameOf(D,c,sid):'(removed)';};
const subjOf=t=>/math/i.test(t||'')?'math':/\b(ela|reading|writing|english|literacy|speech|language)\b/i.test(t||'')?'ela':'';
const goalSubj=g=>subjOf(g.area)||(/\b(fractions?|equations?|operations?|products?|quotients?|multipl\w*|divi\w*|addition|subtraction|numbers?|integers?|decimals?)\b/i.test(g.text||'')?'math':'');
const goalShort=(g,n)=>{const t=IEP.fill(g.text,'').replace(/^\s*(within (?:one|a|1) year,?\s*)?(the student\s*)?(will\s*)?/i,''); const m=n||80; return (g.area?g.area+': ':'')+(t.length>m?t.slice(0,m-2).replace(/\s+\S*$/,'')+'…':t);};
const groupList=()=>Object.values(I.groups||{}).filter(g=>g&&Array.isArray(g.goals));
const groupOf=gid=>groupList().find(x=>x.goals.includes(gid))||null;
const calX=()=>{const c=D.calendar||null, tf=I.settings&&I.settings.trackFrom; return tf?Object.assign({start:'',end:'',periods:[]},c||{},{trackFrom:tf}):c;};
const recorded=(gid,d)=>I.data.some(p=>p.goal===gid&&p.date===d);

// ---------- calendar and bell schedule
const isWeekend=d=>{const w=wdOf(d); return w===0||w===6;};
const dayType=d=>isWeekend(d)?'off':((Y.days[d]||{}).type||'school');
const monday=d=>add(d,-((wdOf(d)+6)%7));
const mins=t=>{const m=/^(\d{1,2}):(\d{2})/.exec(t||''); if(!m) return 9999; const h=+m[1]<6?+m[1]+12:+m[1]; return h*60+ +m[2];};
const hm=t=>{if(!t) return ''; const v=mins(t); return ((Math.floor(v/60)+11)%12+1)+':'+String(v%60).padStart(2,'0');};
function periodsOn(d){
  const wd=wdOf(d), byName={}; Object.keys(D.classes).forEach(c=>byName[String(D.classes[c].name).toLowerCase()]=c);
  return ((D.bell&&D.bell.periods)||[]).slice().sort((a,b)=>mins(a.start)-mins(b.start)).map(p=>{const label=(p.days||{})[wd]||'';
    const cls=label.toLowerCase().split(/[\s,·\-–\/]+/).map(x=>byName[x]).find(Boolean)||null; return {p,label,cls,subj:subjOf(label),key:d+'|'+p.id};});
}
const perRec=key=>Y.periods[key]||{};
const absentOn=d=>new Set(Y.absent[d]||[]);

// ---------- probe suggestions: goals whose current window has no measurement yet
function slotNow(g,d){ const sc=IEP.schedule(g,I.data,calX(),add(d,1),d); return sc.slots.find(s=>s.start<=d&&s.end>=d)||null; }
function suggestions(d){
  if(_sug[d]) return _sug[d];
  const out={}, used=new Set(), away=absentOn(d), t0=today();
  // goals already planned for another day that hasn't passed aren't suggested again (a missed plan from a past day is)
  Object.keys(Y.periods).forEach(k=>{const dd=k.split('|')[0]; if(dd!==d&&dd>=t0) (Y.periods[k].probes||[]).forEach(id=>{if(!recorded(id,dd)) used.add(id);});});
  if(dayType(d)==='off'){ return _sug[d]=out; }
  periodsOn(d).filter(q=>q.cls).forEach(q=>{
    const r=perRec(q.key), skip=new Set(r.skip||[]);
    const kept=(r.probes||[]).filter(id=>I.goals[id]); kept.forEach(id=>used.add(id));
    const cand=Object.values(I.goals).filter(g=>g.status==='active'&&classOf(g.sid)===q.cls&&!away.has(g.sid)&&!used.has(g.id)&&!skip.has(g.id)&&(!q.subj||!goalSubj(g)||goalSubj(g)===q.subj))
      .map(g=>{const s=slotNow(g,d); if(!s||s.filled) return null; const len=Math.max(1,diff(s.start,s.end)); return {g,s,urg:diff(s.start,d)/len-(goalSubj(g)?0:0.2)};}).filter(Boolean);
    // groups become one unit
    const units=[], seen=new Set();
    cand.forEach(c=>{ if(seen.has(c.g.id)) return; const gr=groupOf(c.g.id);
      if(gr){ const mem=cand.filter(x=>gr.goals.includes(x.g.id)); mem.forEach(x=>seen.add(x.g.id)); units.push({group:gr,items:mem,urg:Math.max(...mem.map(x=>x.urg))+0.25+mem.length*0.05}); }
      else { seen.add(c.g.id); units.push({items:[c],urg:c.urg}); } });
    units.sort((a,b)=>b.urg-a.urg);
    const pick=units.slice(0,2); pick.forEach(u=>u.items.forEach(x=>used.add(x.g.id)));
    out[q.key]={kept,sug:pick};
  });
  return _sug[d]=out;
}

// ---------- sheets
function openSheet(html,wire){$('sheet').innerHTML=html;$('sheetWrap').hidden=false;$('sheet').scrollTop=0;if(wire)wire($('sheet'));}
function closeSheet(){$('sheetWrap').hidden=true;$('sheet').innerHTML='';}
$('sheetWrap').addEventListener('click',e=>{if(e.target===$('sheetWrap'))closeSheet();});
function confirmTap(b,label,fn){ if(b.classList.contains('sure')){fn();return;} const old=b.textContent; b.classList.add('sure'); b.textContent=label; setTimeout(()=>{if(b.isConnected){b.classList.remove('sure');b.textContent=old;}},3000);}

// ---------- the hub
let sel=(()=>{let d=today(); while(isWeekend(d)) d=add(d,1); return d;})();
function render(){ renderWeek(); renderDay(); }
function renderWeek(){
  const mon=monday(sel), t=today();
  const cells=[0,1,2,3,4].map(i=>{const d=add(mon,i), ty=dayType(d), s=ty==='off'?null:suggestions(d);
    const n=s?Object.values(s).reduce((a,x)=>a+x.kept.length+x.sug.reduce((b,u)=>b+u.items.length,0),0):0;
    return `<button type="button" class="wd${d===t?' today':''}${ty==='off'?' off':''}" data-d="${d}" aria-pressed="${d===sel}"><small>${esc(wkday(d))}</small><b>${parse(d).getDate()}</b><i>${ty==='off'?'No school':ty==='remote'?'Remote':n?plural(n,'probe'):''}</i></button>`;}).join('');
  $('week').innerHTML=`<button type="button" class="nav" id="wPrev" aria-label="Previous week">‹</button>${cells}<button type="button" class="nav" id="wNext" aria-label="Next week">›</button><button type="button" class="iconbtn" id="menuBtn" aria-label="More">⋯</button>`;
}
$('week').addEventListener('click',e=>{const b=e.target.closest('button'); if(!b) return;
  if(b.id==='wPrev'){sel=add(monday(sel),-7);} else if(b.id==='wNext'){sel=add(monday(sel),7);} else if(b.id==='menuBtn'){menu();return;} else if(b.dataset.d){sel=b.dataset.d;} else return;
  render();});

function renderDay(){
  const d=sel, t=today(), ty=dayType(d), per=periodsOn(d), sug=suggestions(d), away=absentOn(d);
  const nowM=d===t&&ty!=='off'?new Date().getHours()*60+new Date().getMinutes():-1; let nowDrawn=false;
  const nowLine=txt=>`<div class="nowline"><span>Now ${esc(hm(String(Math.floor(nowM/60)).padStart(2,'0')+':'+String(nowM%60).padStart(2,'0')))} · ${esc(txt)}</span></div>`;
  let h=`<div class="dayh"><h1>${d===t?'Today · ':''}${esc(dayName(d))}</h1>
    ${isWeekend(d)?'':`<div class="seg" id="dType">${[['school','School'],['remote','Remote'],['off','No school']].map(([k,l])=>`<button type="button" data-ty="${k}" aria-pressed="${ty===k}">${l}</button>`).join('')}</div>`}
    ${d!==t?'<button class="ghost" id="goToday" style="min-height:38px">Today</button>':''}<button class="ghost" id="print" style="min-height:38px">Print</button></div>`;
  if(ty==='off'){ h+=`<div class="card off-card">${isWeekend(d)?'Weekend':'No school'}${(Y.days[d]||{}).note?' · '+esc(Y.days[d].note):''}</div>`; }
  else if(!per.length){ h+=`<div class="card"><b>No bell schedule yet.</b><span class="meta">Add your periods in <a class="lnk" href="../setup/">Classroom setup → Calendar</a> to plan each period here.</span></div>`; }
  else per.forEach((q,i)=>{
    // a "now" line before the period in progress, or between periods during passing time
    if(nowM>=0&&!nowDrawn){ const st=mins(q.p.start), en=mins(q.p.end||'23:59');
      if(nowM<en){ nowDrawn=true; h+=nowLine(nowM>=st?`${q.label||q.p.name} until ${hm(q.p.end)}`:`next: ${q.label||q.p.name} at ${hm(q.p.start)}`); } }
    if(!q.cls){ h+=`<div class="per quiet"><span class="tm">${esc(hm(q.p.start))}</span><span class="bd"><span class="ttl"><b>${esc(q.label||q.p.name)}</b><span>${q.label?esc(q.p.name):''}</span></span></span></div>`; return; }
    const r=perRec(q.key), les=r.lesson&&Y.lessons[r.lesson], s=sug[q.key]||{kept:[],sug:[]}, laps=lapCount(q.cls,d);
    const isNow=nowM>=mins(q.p.start)&&nowM<mins(q.p.end||'23:59');
    const chips=s.kept.map(id=>{const g=I.goals[id]; return `<span class="chip ${recorded(id,d)?'done':'keep'}">${recorded(id,d)?'✓ ':''}${esc(nameAny(g.sid))}</span>`;})
      .concat(s.sug.map(u=>`<span class="chip sug">${u.group?esc(u.group.name)+' · '+u.items.length:esc(nameAny(u.items[0].g.sid))}</span>`));
    h+=`<button type="button" class="per${isNow?' now':''}" data-k="${esc(q.key)}"><span class="tm">${esc(hm(q.p.start))}<small>${esc(q.p.name)}</small></span><span class="bd">
      <span class="ttl"><b>${esc(q.label)}</b>${ty==='remote'?'<span>remote</span>':''}</span>
      <span class="les${les?'':' none'}">${les?esc(les.title):'Plan lesson…'}${les&&les.files&&les.files.length?` <span class="chip">📎 ${les.files.length}</span>`:''}${r.continued?' <span class="chip cont">continued</span>':''}${r.did?' <span class="chip done">✓ notes</span>':''}</span>
      ${chips.length||laps?`<span class="row">${chips.join('')}${laps?`<span class="chip">${plural(laps,'lap')}</span>`:''}</span>`:''}</span></button>`;
  });
  if(nowM>=0&&!nowDrawn&&per.length) h+=nowLine('school day is over');
  // tiles
  const todos=Y.todos.filter(x=>!x.done&&x.date<=d), fus=A.entries.filter(e=>e.fu&&e.fu.date&&!e.fu.done&&e.fu.date<=d);
  const note=Y.notes[d]||'';
  h+=`<div class="tiles">
    <button type="button" class="tile" id="tAbs"><b>${away.size}</b><span>absent</span></button>
    <button type="button" class="tile" id="tTodo"><b>${todos.length}</b><span>to-dos</span></button>
    <button type="button" class="tile ${fus.some(e=>e.fu.date<d)?'alert':''}" id="tFu"><b>${fus.length}</b><span>follow-ups</span></button>
    <button type="button" class="tile" id="tNote"><b>${note?'✎':'+'}</b><span>${note?esc(note.slice(0,40)):'day notes'}</span></button></div>`;
  $('view').innerHTML=h;
  const dt=$('dType'); if(dt) dt.addEventListener('click',e=>{const b=e.target.closest('[data-ty]'); if(!b) return; Y=loadY(); if(b.dataset.ty==='school') delete Y.days[d]; else Y.days[d]=Object.assign({},Y.days[d]||{},{type:b.dataset.ty}); saveY(); render();});
  const gt=$('goToday'); if(gt) gt.addEventListener('click',()=>{sel=today(); while(isWeekend(sel)) sel=add(sel,1); render();});
  $('print').addEventListener('click',()=>printDay(d));
  $('tAbs').addEventListener('click',()=>absentSheet(d)); $('tTodo').addEventListener('click',()=>todoSheet(d));
  $('tFu').addEventListener('click',()=>fuSheet(d)); $('tNote').addEventListener('click',()=>noteSheet(d));
  $('view').querySelectorAll('.per[data-k]').forEach(b=>b.addEventListener('click',()=>periodSheet(b.dataset.k)));
}

// laps saved by the Lap Tracker for this class on this day (any room)
function lapCount(cls,d){ let n=0; const pre=Classroom.LAPS+cls+'|';
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i); if(!k||!k.startsWith(pre)||!k.endsWith('|'+d)) continue;
    const s=JSON.parse(localStorage.getItem(k)); n+=s&&s.laps?s.laps.filter(l=>l.q||Object.keys(l.marks||{}).length).length:0;}}catch(e){}
  return n; }

// ---------- period: lesson plan, what happened, probes, laps
function periodSheet(key){
  const [d,pid]=key.split('|'), q=periodsOn(d).find(x=>x.key===key); if(!q) return;
  Y=loadY(); const r=Object.assign({probes:[],skip:[]},Y.periods[key]||{});
  // this class+subject's lessons, most recently used first (the last one is the likely "continued")
  const lastUse={}; Object.keys(Y.periods).forEach(k=>{const p=Y.periods[k]; if(p.lesson){const dd=k.split('|')[0]; if(dd<=d&&(!lastUse[p.lesson]||lastUse[p.lesson]<dd)) lastUse[p.lesson]=dd;}});
  const lessons=Object.values(Y.lessons).filter(l=>l.cls===q.cls&&(l.subj||'')===(q.subj||'')).sort((a,b)=>(lastUse[b.id]||'')<(lastUse[a.id]||'')?-1:(lastUse[b.id]||'')>(lastUse[a.id]||'')?1:(b.updated||0)-(a.updated||0)).slice(0,8);
  if(r.lesson&&Y.lessons[r.lesson]&&!lessons.some(l=>l.id===r.lesson)) lessons.unshift(Y.lessons[r.lesson]);
  const prev=lessons.find(l=>lastUse[l.id]&&lastUse[l.id]<d);
  let choice=r.lesson||'';
  const s=suggestions(d)[key]||{kept:[],sug:[]};
  const laps=lapCount(q.cls,d), link=Y.links[q.cls]||'';
  openSheet(`<h2>${esc(q.label)} · ${esc(q.p.name)}</h2><p class="meta" style="margin:0 6px">${esc(dayName(d))} · ${esc(hm(q.p.start))}${q.p.end?'–'+esc(hm(q.p.end)):''}</p>
    <div class="field"><span class="lbl">Plan</span><div id="lesList"></div>
      <label class="lesopt"><input type="checkbox" id="cont" ${r.continued?'checked':''}><span>Continued from last time</span></label></div>
    <div class="field" id="lesEdit"></div>
    <div class="field"><span class="lbl">What happened</span><textarea id="did" placeholder="What we actually got through, what's next">${esc(r.did||'')}</textarea>
      <input type="url" id="didLink" placeholder="Link to materials actually used (optional)" value="${esc(r.didLink||'')}"></div>
    <div class="field"><span class="lbl">IEP probes</span><div id="probes"></div></div>
    <div class="field"><span class="lbl">Laps &amp; activity</span>
      <div class="bar"><span class="grow meta">${laps?plural(laps,'lap')+' today':'No laps yet today'}</span><button class="ghost" id="openLaps" style="min-height:40px">Lap Tracker</button></div>
      <div class="bar"><input type="url" id="actLink" placeholder="Class activity app link (saved for ${esc((D.classes[q.cls]||{}).name||'')})" value="${esc(link)}" class="grow">${link?`<a class="btn ghost" href="${esc(link)}" target="_blank" rel="noopener" style="min-height:40px">Open</a>`:''}</div></div>
    <div class="sticky-actions"><button class="primary" id="pDone">Done</button></div>`,
  el=>{
    const drawLes=()=>{
      el.querySelector('#lesList').innerHTML=`<label class="lesopt"><input type="radio" name="les" value="" ${!choice?'checked':''}><span>No lesson set</span></label>`+
        lessons.map(l=>`<label class="lesopt"><input type="radio" name="les" value="${esc(l.id)}" ${choice===l.id?'checked':''}><span>${esc(l.title)}${l===prev?' <small>· last time</small>':lastUse[l.id]?' <small>· '+esc(short(lastUse[l.id]))+'</small>':''}</span></label>`).join('')+
        `<label class="lesopt"><input type="radio" name="les" value="__new" ${choice==='__new'?'checked':''}><span>New lesson…</span></label>`;
      const l=choice&&choice!=='__new'?Y.lessons[choice]:null;
      el.querySelector('#lesEdit').innerHTML=choice?`<input type="text" id="lTitle" placeholder="Lesson title, e.g. IM 6.3.4 Ratios" value="${esc(l?l.title:'')}">
        <input type="url" id="lLink" placeholder="Link to lesson plan / materials (Drive)" value="${esc(l?l.link||'':'')}">${l&&l.link?`<a class="lnk" href="${esc(l.link)}" target="_blank" rel="noopener">Open plan ↗</a>`:''}
        <span class="lbl" style="margin-top:4px">Scaffolds &amp; files</span><div id="lFiles"></div><button type="button" class="ghost" id="addFile" style="align-self:flex-start;min-height:38px">+ Add a file</button>
        <textarea id="lNotes" placeholder="Plan notes">${esc(l?l.notes||'':'')}</textarea>`:'';
      if(choice){ files=(l&&Array.isArray(l.files)?l.files:[]).map(f=>Object.assign({},f)); drawFiles(); }
    };
    // scaffold / material links on the lesson: any number, each a name and a link
    let files=[];
    function drawFiles(){ const box=el.querySelector('#lFiles'); if(!box) return;
      box.innerHTML=files.map((f,i)=>`<div class="bar" data-f="${i}" style="flex-wrap:nowrap"><input type="text" data-k="name" placeholder="Name (e.g. Scaffold: sentence frames)" value="${esc(f.name||'')}" style="flex:1;min-width:0"><input type="url" data-k="url" placeholder="Link" value="${esc(f.url||'')}" style="flex:1.3;min-width:0">${f.url?`<a class="lnk" href="${esc(f.url)}" target="_blank" rel="noopener" aria-label="Open">↗</a>`:''}<button type="button" class="plain" data-x="${i}" aria-label="Remove" style="min-height:36px;padding:0 6px;color:var(--not)">✕</button></div>`).join('')||'<span class="meta">None</span>';}
    el.addEventListener('input',e=>{const r=e.target.closest('#lFiles [data-f]'); if(!r) return; files[+r.dataset.f][e.target.dataset.k]=e.target.value;});
    el.addEventListener('click',e=>{ if(e.target.id==='addFile'){ files.push({name:'',url:''}); drawFiles(); const ins=el.querySelectorAll('#lFiles input[data-k=name]'); if(ins.length) ins[ins.length-1].focus(); }
      const x=e.target.closest('#lFiles [data-x]'); if(x){ files.splice(+x.dataset.x,1); drawFiles(); } });
    drawLes();
    el.querySelector('#lesList').addEventListener('change',e=>{if(e.target.name!=='les') return; choice=e.target.value; drawLes();
      if(choice&&choice!=='__new'&&prev&&choice===prev.id) el.querySelector('#cont').checked=true; });
    const drawProbes=()=>{ const rr=Y.periods[key]||r, ss=suggestions(d)[key]||{kept:[],sug:[]};
      const row=(g,kind)=>`<div class="pr"><span class="t"><b>${esc(nameAny(g.sid))}</b> ${esc(goalShort(g,70))}<small>${esc(IEP.critText(g.criteria||{}))}${recorded(g.id,d)?' · ✓ recorded today':''}</small></span>${kind==='keep'?`<button class="ghost" data-rm="${esc(g.id)}">Remove</button>`:''}</div>`;
      let ph=ss.kept.length?`<div class="meta">Planned</div>`+ss.kept.map(id=>row(I.goals[id],'keep')).join(''):'';
      ss.sug.forEach(u=>{ph+=`<div class="pr" style="border-top:1px dashed var(--line)"><span class="t"><b>${u.group?esc(u.group.name)+' (group)':'Suggested'}</b><small>${u.items.map(x=>esc(nameAny(x.g.sid))+' · '+esc(goalShort(x.g,50))+' · due by '+esc(short(x.s.end))).join('<br>')}</small></span>
        <button class="primary" data-keep="${esc(u.items.map(x=>x.g.id).join(','))}">Plan</button><button class="ghost" data-skip="${esc(u.items.map(x=>x.g.id).join(','))}">Skip</button></div>`;});
      if(!ph) ph='<div class="meta">Nothing due for this class and subject right now.</div>';
      if(ss.kept.length) ph+=`<div class="bar" style="margin-top:6px"><button class="primary" id="rec">Record scores</button><button class="ghost" id="pPrint">Print probes</button></div>`;
      el.querySelector('#probes').innerHTML=ph;
      const rc=el.querySelector('#rec'); if(rc) rc.addEventListener('click',()=>{save(); measureSheet(ss.kept.map(id=>I.goals[id]),d,()=>periodSheet(key));});
      const pp=el.querySelector('#pPrint'); if(pp) pp.addEventListener('click',()=>{save(); printProbes(d,ss.kept.map(id=>I.goals[id]),q);});
    };
    const editP=fn=>{Y=loadY(); const p=Object.assign({probes:[],skip:[]},Y.periods[key]||{}); fn(p); p.updated=Date.now(); Y.periods[key]=p; saveY(); drawProbes();};
    el.querySelector('#probes').addEventListener('click',e=>{const k=e.target.closest('[data-keep]'), sk=e.target.closest('[data-skip]'), rm=e.target.closest('[data-rm]');
      if(k) editP(p=>{k.dataset.keep.split(',').forEach(id=>{if(!p.probes.includes(id)) p.probes.push(id);});});
      if(sk) editP(p=>{sk.dataset.skip.split(',').forEach(id=>{if(!p.skip.includes(id)) p.skip.push(id);});});
      if(rm) editP(p=>{p.probes=p.probes.filter(id=>id!==rm.dataset.rm);});});
    drawProbes();
    const cleanFiles=()=>files.map(f=>({name:(f.name||'').trim().slice(0,100),url:(f.url||'').trim()})).filter(f=>f.url||f.name);
    const save=()=>{ Y=loadY(); const p=Object.assign({probes:[],skip:[]},Y.periods[key]||{});
      if(choice==='__new'){ const t=(el.querySelector('#lTitle')||{}).value; if(t&&t.trim()){ const id=uid('l'); Y.lessons[id]={id,cls:q.cls,subj:q.subj||'',title:t.trim().slice(0,120),link:(el.querySelector('#lLink').value||'').trim(),files:cleanFiles(),notes:el.querySelector('#lNotes').value.trim(),updated:Date.now()}; p.lesson=id; choice=id; } else p.lesson=''; }
      else if(choice){ const l=Y.lessons[choice]; if(l){ const t=el.querySelector('#lTitle').value.trim(); if(t) l.title=t.slice(0,120); l.link=el.querySelector('#lLink').value.trim(); l.files=cleanFiles(); l.notes=el.querySelector('#lNotes').value.trim(); l.updated=Date.now(); } p.lesson=choice; }
      else p.lesson='';
      p.continued=el.querySelector('#cont').checked&&!!p.lesson; p.did=el.querySelector('#did').value.trim(); p.didLink=el.querySelector('#didLink').value.trim(); p.updated=Date.now();
      Y.periods[key]=p; const al=el.querySelector('#actLink').value.trim(); if(al) Y.links[q.cls]=al; else delete Y.links[q.cls]; saveY(); };
    el.querySelector('#pDone').addEventListener('click',()=>{save(); closeSheet(); render();});
    el.querySelector('#openLaps').addEventListener('click',()=>{save(); let P={}; try{P=JSON.parse(localStorage.getItem('classroom.prefs'))||{}}catch(e){} P.cls=q.cls; try{localStorage.setItem('classroom.prefs',JSON.stringify(P))}catch(e){} location.href='../lap/';});
  });
}

// ---------- record scores (same measurement format as Home)
function measureSheet(goals,d,after){
  goals=goals.filter(Boolean); if(!goals.length) return;
  const rows=goals.map(g=>{const c=g.criteria||{}, tri=c.trials!==false; return {g,tri,total:Math.max(1,+c.y||5),correct:null,pct:''};});
  openSheet(`<h2>Record scores</h2><p class="meta" style="margin:0 6px">${esc(dayName(d))}</p><div id="mRows"></div>
    <div class="sticky-actions"><button class="ghost" id="mC">Cancel</button><button class="primary" id="mS">Save</button></div>`,
  el=>{const draw=()=>{el.querySelector('#mRows').innerHTML=rows.map((r,i)=>`<div class="mrow" data-i="${i}"><b>${esc(nameAny(r.g.sid))}</b><span class="meta">${esc(goalShort(r.g,90))} · ${esc(IEP.critText(r.g.criteria||{}))}</span>
      <div class="nums">${r.tri?`<span class="step"><button type="button" data-a="-">−</button><output>${r.correct==null?'–':r.correct}</output><button type="button" data-a="+">+</button></span> correct of
        <span class="step"><button type="button" data-a="t-">−</button><output>${r.total}</output><button type="button" data-a="t+">+</button></span>${r.correct!=null?' = '+Math.round(100*r.correct/r.total)+'%':''}`
        :`<input type="number" min="0" max="100" inputmode="numeric" data-a="pct" value="${esc(r.pct)}" style="width:100px"> %`}</div></div>`).join('');};
    draw();
    el.querySelector('#mRows').addEventListener('click',e=>{const b=e.target.closest('button[data-a]'); if(!b) return; const r=rows[+b.closest('[data-i]').dataset.i], a=b.dataset.a;
      if(a==='+') r.correct=Math.min(r.total,(r.correct==null?-1:r.correct)+1); if(a==='-') r.correct=Math.max(0,(r.correct==null?1:r.correct)-1);
      if(a==='t+') r.total=Math.min(20,r.total+1); if(a==='t-'){ r.total=Math.max(1,r.total-1); if(r.correct!=null) r.correct=Math.min(r.correct,r.total);} draw();});
    el.querySelector('#mRows').addEventListener('input',e=>{if(e.target.dataset.a==='pct') rows[+e.target.closest('[data-i]').dataset.i].pct=e.target.value;});
    el.querySelector('#mC').addEventListener('click',()=>{closeSheet(); if(after) after();});
    el.querySelector('#mS').addEventListener('click',()=>{ I=IEP.load(); let n=0;
      rows.forEach(r=>{let pt=null; if(r.tri&&r.correct!=null) pt={pct:Math.round(100*r.correct/r.total),correct:r.correct,total:r.total}; if(!r.tri&&r.pct!=='') pt={pct:Math.max(0,Math.min(100,Math.round(+r.pct)))};
        if(!pt) return; I.data.push(Object.assign({id:uid('m'),goal:r.g.id,sid:r.g.sid,date:d,t:Date.now(),method:(r.g.methods||[])[0]||'',note:''},pt)); n++;});
      saveI(); closeSheet(); toast(n?'Saved '+plural(n,'score'):'Nothing to save'); if(after) after(); render();});});
}

// ---------- tiles' detail sheets
function absentSheet(d){
  const away=absentOn(d);
  openSheet(`<h2>Absent · ${esc(short(d))}</h2><p class="hint" style="margin:0 6px">Absent students are left out of that day's probe suggestions.</p>
    ${Object.keys(D.classes).map(c=>`<div class="field"><span class="lbl">${esc(D.classes[c].name)}</span><div class="studs">${(D.classes[c].students||[]).map(s=>`<button type="button" data-s="${esc(s.id)}" aria-pressed="${away.has(s.id)}">${esc(s.name)}</button>`).join('')||'<span class="meta">No students</span>'}</div></div>`).join('')}
    <div class="sticky-actions"><button class="primary" id="aDone">Done</button></div>`,
  el=>{el.addEventListener('click',e=>{const b=e.target.closest('[data-s]'); if(!b) return; Y=loadY(); const l=new Set(Y.absent[d]||[]); if(l.has(b.dataset.s)) l.delete(b.dataset.s); else l.add(b.dataset.s);
      if(l.size) Y.absent[d]=[...l]; else delete Y.absent[d]; saveY(); b.setAttribute('aria-pressed',l.has(b.dataset.s));});
    el.querySelector('#aDone').addEventListener('click',()=>{closeSheet(); render();});});
}
function todoSheet(d){
  const draw=el=>{ Y=loadY(); const open=Y.todos.filter(x=>!x.done&&x.date<=d), done=Y.todos.filter(x=>x.done&&x.doneOn===d), later=Y.todos.filter(x=>!x.done&&x.date>d);
    const row=x=>`<label class="todo${x.done?' done':''}"><input type="checkbox" data-t="${esc(x.id)}" ${x.done?'checked':''}><span>${esc(x.text)}</span>${x.date<d&&!x.done?`<small>since ${esc(short(x.date))}</small>`:x.date>d?`<small>${esc(short(x.date))}</small>`:''}<button type="button" class="plain" data-del="${esc(x.id)}" aria-label="Delete" style="min-height:32px;padding:0 6px">✕</button></label>`;
    el.querySelector('#tList').innerHTML=(open.map(row).join('')||'<div class="meta" style="padding:6px">Nothing open.</div>')+(done.length?'<div class="meta" style="margin-top:6px">Done</div>'+done.map(row).join(''):'')+(later.length?'<div class="meta" style="margin-top:6px">Later</div>'+later.map(row).join(''):'');};
  openSheet(`<h2>To-dos · ${esc(short(d))}</h2>
    <div class="bar"><input type="text" id="tNew" class="grow" placeholder="Add a to-do (make copies, email…)" enterkeyhint="done"><button class="primary" id="tAdd">Add</button></div>
    <p class="hint" style="margin:0 6px">Open to-dos carry forward each day until you check them off.</p><div id="tList"></div>
    <div class="sticky-actions"><button class="primary" id="tDone">Done</button></div>`,
  el=>{draw(el);
    const addT=()=>{const v=el.querySelector('#tNew').value.trim(); if(!v) return; Y=loadY(); Y.todos.push({id:uid('t'),text:v.slice(0,200),date:d,done:false,updated:Date.now()}); saveY(); el.querySelector('#tNew').value=''; draw(el);};
    el.querySelector('#tAdd').addEventListener('click',addT);
    el.querySelector('#tNew').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault(); addT();}});
    el.querySelector('#tList').addEventListener('click',e=>{const x=e.target.closest('[data-del]'); if(!x) return; e.preventDefault(); Y=loadY(); Y.todos=Y.todos.filter(t=>t.id!==x.dataset.del); saveY(); draw(el);});
    el.querySelector('#tList').addEventListener('change',e=>{const c=e.target.closest('[data-t]'); if(!c) return; Y=loadY(); const t=Y.todos.find(x=>x.id===c.dataset.t); if(t){t.done=c.checked; t.doneOn=c.checked?d:''; t.updated=Date.now(); saveY();} draw(el);});
    el.querySelector('#tDone').addEventListener('click',()=>{closeSheet(); render();});});
}
function fuSheet(d){
  const names=s=>(s||[]).map(nameAny).join(', ');
  const draw=el=>{ A=loadJ(AK,{}); A.entries=Array.isArray(A.entries)?A.entries:[];
    const due=A.entries.filter(e=>e.fu&&e.fu.date&&!e.fu.done&&e.fu.date<=d).sort((a,b)=>a.fu.date<b.fu.date?-1:1);
    el.querySelector('#fList').innerHTML=due.map(e=>`<label class="todo"><input type="checkbox" data-e="${esc(e.id)}"><span>${esc(e.fu.text||'Follow up')}<br><small>${esc(names(e.sids))} · from ${esc(short(e.date))}${e.summary?' · '+esc(e.summary.slice(0,80)):''}</small></span>${e.fu.date<d?`<small style="color:var(--not)">due ${esc(short(e.fu.date))}</small>`:''}</label>`).join('')||'<div class="meta" style="padding:6px">No follow-ups due.</div>';};
  openSheet(`<h2>Follow-ups &amp; parent outreach</h2><div id="fList"></div>
    <p class="hint" style="margin:6px">Log a call, email or meeting in <a class="lnk" href="../home/">Home → Activity</a>.</p>
    <div class="sticky-actions"><button class="primary" id="fDone">Done</button></div>`,
  el=>{draw(el);
    el.querySelector('#fList').addEventListener('change',e=>{const c=e.target.closest('[data-e]'); if(!c||!c.checked) return; A=loadJ(AK,{}); const x=(A.entries||[]).find(v=>v.id===c.dataset.e); if(x&&x.fu){x.fu.done=true; x.updated=Date.now(); saveA(); toast('Marked done');} draw(el);});
    el.querySelector('#fDone').addEventListener('click',()=>{closeSheet(); render();});});
}
function noteSheet(d){
  openSheet(`<h2>Day notes · ${esc(short(d))}</h2><textarea id="nT" style="min-height:200px" placeholder="Anything about today: schedule changes, what to remember tomorrow…">${esc(Y.notes[d]||'')}</textarea>
    ${dayType(d)==='off'&&!isWeekend(d)?`<input type="text" id="nOff" placeholder="Why no school (e.g. Election Day)" value="${esc((Y.days[d]||{}).note||'')}">`:''}
    <div class="sticky-actions"><button class="primary" id="nDone">Done</button></div>`,
  el=>{el.querySelector('#nDone').addEventListener('click',()=>{Y=loadY(); const v=el.querySelector('#nT').value.trim(); if(v) Y.notes[d]=v; else delete Y.notes[d];
      const o=el.querySelector('#nOff'); if(o&&Y.days[d]) Y.days[d].note=o.value.trim(); saveY(); closeSheet(); render();});});
}

// ---------- print: the day on one page, then each planned probe with trial boxes
const boxes=g=>{const c=g.criteria||{}; return c.trials!==false&&c.y?Array.from({length:c.y},(_,k)=>`${k+1}☐`).join(' '):'___ / ___ = ___%';};
function printDay(d){
  loadAll(); const per=periodsOn(d), sug=suggestions(d), ty=dayType(d), away=[...absentOn(d)].map(nameAny);
  let h=`<h1>${esc(dayName(d))}${ty==='remote'?' · Remote':ty==='off'?' · No school':''}</h1>`;
  if(away.length) h+=`<p><b>Absent:</b> ${esc(away.join(', '))}</p>`;
  per.forEach(q=>{ const r=perRec(q.key), l=r.lesson&&Y.lessons[r.lesson], s=sug[q.key]||{kept:[],sug:[]};
    h+=`<div class="pp"><span class="tm">${esc(hm(q.p.start))}${q.p.end?'–'+esc(hm(q.p.end)):''}<br>${esc(q.p.name)}</span><span><b>${esc(q.label||'—')}</b>`;
    if(q.cls){ h+=`${l?' · '+esc(l.title)+(r.continued?' (continued)':''):''}`; if(l&&l.files&&l.files.length) h+=`<div class="pg"><span>Files: ${esc(l.files.map(f=>f.name||f.url).join(' · '))}</span></div>`;
      const items=s.kept.map(id=>({g:I.goals[id],tag:''})).concat(s.sug.flatMap(u=>u.items.map(x=>({g:x.g,tag:'(suggested) '}))));
      items.forEach(x=>{h+=`<div class="pg"><span>${esc(x.tag)}<b>${esc(nameAny(x.g.sid))}</b> ${esc(goalShort(x.g,70))} · ${esc(IEP.critText(x.g.criteria||{}))}</span><span class="bx">${boxes(x.g)}</span></div>`;});
      h+=`<div class="lines"></div>`; }
    h+=`</span></div>`; });
  const todos=Y.todos.filter(x=>!x.done&&x.date<=d), fus=A.entries.filter(e=>e.fu&&e.fu.date&&!e.fu.done&&e.fu.date<=d);
  h+=`<h2>To-dos</h2>`+(todos.length?'<ul>'+todos.map(x=>`<li>☐ ${esc(x.text)}</li>`).join('')+'</ul>':'<p>None.</p>');
  h+=`<h2>Follow-ups</h2>`+(fus.length?'<ul>'+fus.map(e=>`<li>☐ ${esc(e.fu.text||'Follow up')} · ${esc((e.sids||[]).map(nameAny).join(', '))}</li>`).join('')+'</ul>':'<p>None.</p>');
  h+=`<h2>Notes</h2>${Y.notes[d]?'<p>'+esc(Y.notes[d])+'</p>':''}<div class="big"></div>`;
  $('printout').innerHTML=h; setTimeout(()=>window.print(),50);
}
function printProbes(d,goals,q){
  let h=`<h1>${esc(q.label)} · ${esc(q.p.name)} · ${esc(dayName(d))}</h1>`;
  goals.filter(Boolean).forEach(g=>{const nm=nameAny(g.sid), acc=(C.students[g.sid]||[]).map(a=>a.text);
    h+=`<h2>${esc(nm)}${g.area?' · '+esc(g.area):''}</h2><p>${esc(IEP.fill(g.text,nm))}</p><p>Criteria: ${esc(IEP.critText(g.criteria||{}))}${acc.length?' · Accommodations: '+esc(acc.join('; ')):''}</p><p class="bx">${boxes(g)}</p><div class="lines"></div>`;});
  $('printout').innerHTML=h; setTimeout(()=>window.print(),50);
}

// ---------- menu, backup of day data
function menu(){
  openSheet(`<button class="item" id="mExp">Export day data</button><button class="item" id="mImp">Import day data…</button><input type="file" id="mFile" accept=".json,.txt,application/json,text/plain" hidden>
    <hr><a class="item btn" href="../home/">Home: students, goals, activity</a><a class="item btn" href="../lap/">Lap Tracker</a><a class="item btn" href="../setup/">Classroom setup</a>
    <p class="hint" style="padding:0 6px">Day data (lessons, period notes, to-dos, days off, absences) is separate from the Home and Setup backups. Export it too.</p>`,
  el=>{el.querySelector('#mExp').addEventListener('click',async()=>{ const txt=JSON.stringify({app:'classroom-day',format:1,exported:new Date().toISOString(),day:loadY()},null,2);
      const name='classroom-day-'+today()+'.txt', file=new File([txt],name,{type:'text/plain'});
      try{ if(navigator.canShare&&navigator.canShare({files:[file]})){ await navigator.share({files:[file],title:name}); toast('Shared'); return; } }catch(e){ if(e&&e.name==='AbortError') return; }
      const a=document.createElement('a'); a.href=URL.createObjectURL(file); a.download=name; document.body.appendChild(a); a.click(); a.remove(); toast('Saved to Downloads');});
    el.querySelector('#mImp').addEventListener('click',()=>el.querySelector('#mFile').click());
    el.querySelector('#mFile').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0]; if(!f) return; const rd=new FileReader();
      rd.onload=()=>{ let raw; try{raw=JSON.parse(String(rd.result));}catch(x){toast('That file isn\'t a day backup'); return;} const inc=raw&&raw.day; if(!inc||raw.app!=='classroom-day'){toast('That file isn\'t a day backup'); return;}
        Y=loadY(); let n=0; const newer=(a,b)=>!a||(b&&(b.updated||0)>(a.updated||0));
        ['lessons','periods'].forEach(k=>Object.keys(inc[k]||{}).forEach(id=>{if(newer(Y[k][id],inc[k][id])){Y[k][id]=inc[k][id]; n++;}}));
        (inc.todos||[]).forEach(t=>{const i=Y.todos.findIndex(x=>x.id===t.id); if(i<0){Y.todos.push(t); n++;} else if(newer(Y.todos[i],t)){Y.todos[i]=t; n++;}});
        ['days','absent','notes','links'].forEach(k=>Object.keys(inc[k]||{}).forEach(id=>{if(Y[k][id]===undefined){Y[k][id]=inc[k][id]; n++;}}));
        saveY(); closeSheet(); toast('Imported '+plural(n,'change')); render(); };
      rd.readAsText(f);});});
}

addEventListener('storage',()=>{loadAll(); render();});
addEventListener('pageshow',e=>{if(e.persisted){loadAll(); render();}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){loadAll(); render();}});
render();
// keep the now line current
setInterval(()=>{ if(sel===today()&&$('sheetWrap').hidden) renderDay(); },60000);
