/* Classroom Home: shared state, header, sheets, and the Today tab.
   Data on this tablet: IEP goals (iep.v1), activity log (activity.v1), accommodations (accom.v1).
   Rosters and the school calendar come from Classroom setup (classroom.v1). */
const $=id=>document.getElementById(id);
const esc=t=>String(t==null?'':t).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const {today,add:addDays,parse:parseDay,ymd}=IEP;
const short=s=>s?parseDay(s).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'';
const dayName=s=>parseDay(s).toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
const wkday=s=>parseDay(s).toLocaleDateString(undefined,{weekday:'short'});
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
let toastT; const toast=m=>{const t=$('toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,2400);};
const plural=(n,w,ws)=>n+' '+(n===1?w:(ws||w+'s'));

const AK='activity.v1', CK='accom.v1', PK='home.prefs';
function loadA(){let a=null;try{a=JSON.parse(localStorage.getItem(AK))}catch(e){} a=a&&typeof a==='object'?a:{}; a.entries=Array.isArray(a.entries)?a.entries:[]; return a;}
function loadC(){let c=null;try{c=JSON.parse(localStorage.getItem(CK))}catch(e){} c=c&&typeof c==='object'?c:{}; c.students=c.students&&typeof c.students==='object'?c.students:{}; return c;}
const loadI=()=>IEP.load();
let A=loadA(), C=loadC(), I=loadI(), D=Classroom.load();
const failSave=()=>toast("Couldn't save. The tablet may be out of space.");
const saveA=()=>{try{localStorage.setItem(AK,JSON.stringify(A))}catch(e){failSave();}};
const saveC=()=>{try{localStorage.setItem(CK,JSON.stringify(C))}catch(e){failSave();}};
const saveI=()=>{try{IEP.save(I)}catch(e){failSave();}};
const cal=()=>D.calendar||null;

let P={}; try{P=JSON.parse(localStorage.getItem(PK))||{}}catch(e){}
let cls=P.cls==='all'||(P.cls&&D.classes[P.cls])?P.cls:'all';
let tab=['today','students','bank','activity'].includes(P.tab)?P.tab:'today';
let weekOff=0, profileSid=null, studView='profiles', actFilter='all', actStudent='', accView='student';
const savePrefs=()=>{P.cls=cls;P.tab=tab;try{localStorage.setItem(PK,JSON.stringify(P))}catch(e){}};
const classIds=()=>cls==='all'?Object.keys(D.classes):[cls];
const inScope=c=>cls==='all'||c===cls;
function classOf(sid){return Object.keys(D.classes).find(c=>(D.classes[c].students||[]).some(s=>s.id===sid))||null;}
function nameAny(sid){const c=classOf(sid); return c?Classroom.nameOf(D,c,sid):'(removed student)';}
const names=sids=>(sids||[]).map(nameAny).join(', ');
const sidInScope=sid=>{const c=classOf(sid); return c?inScope(c):cls==='all';};
const AREAS=['Reading','Writing','Math','Behavior','Social-emotional','Communication','Other'];
const METHODS=['Teacher Made Materials','Standardized Test','Class Activities','Portfolios','Teacher/Provider Observation','Assessment Task'];

// ---------- header and sheets
function renderHead(){
  $('clsBtn').innerHTML=`<span>${cls==='all'?'All classes':esc((D.classes[cls]||{}).name)}</span><i>▾</i>`;
  document.querySelectorAll('#tabs button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===tab));
}
$('tabs').addEventListener('click',e=>{const b=e.target.closest('button[data-t]');if(!b)return;
  if(b.dataset.t==='students'&&tab==='students') profileSid=null;
  tab=b.dataset.t;savePrefs();render();window.scrollTo(0,0);});
$('clsBtn').addEventListener('click',()=>openSheet(`<h2>Show</h2><button type="button" class="item" data-c="all" aria-current="${cls==='all'}">All classes</button>`+
  Object.keys(D.classes).map(c=>`<button type="button" class="item" data-c="${esc(c)}" aria-current="${c===cls}">${esc(D.classes[c].name)}</button>`).join(''),
  el=>el.addEventListener('click',e=>{const b=e.target.closest('button[data-c]');if(!b)return;cls=b.dataset.c;actStudent='';profileSid=null;savePrefs();closeSheet();render();})));
function openSheet(html,wire){$('sheet').innerHTML=html;$('sheetWrap').hidden=false;$('sheet').scrollTop=0;if(wire)wire($('sheet'));}
function closeSheet(){$('sheetWrap').hidden=true;$('sheet').innerHTML='';}
$('sheetWrap').addEventListener('click',e=>{if(e.target===$('sheetWrap'))closeSheet();});
document.addEventListener('pointerdown',e=>{const a=document.activeElement;
  if(a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA')&&!e.target.closest('input,select,textarea,button,label')) a.blur();},true);
// two taps to confirm a destructive button
function confirmTap(b,label,fn){ if(b.classList.contains('sure')){fn();return;}
  const old=b.textContent; b.classList.add('sure'); b.textContent=label||'Tap again'; setTimeout(()=>{if(b.isConnected){b.classList.remove('sure');b.textContent=old;}},3000);}

function render(){
  D=Classroom.load(); I=loadI(); A=loadA(); C=loadC();
  if(cls!=='all'&&!D.classes[cls]) cls='all';
  renderHead();
  ({today:renderToday,students:renderStudents,bank:renderBank,activity:renderActivity})[tab]();
}
function goProfile(sid){tab='students';profileSid=sid;savePrefs();render();window.scrollTo(0,0);}

// ================= TODAY =================
const isWeekend=()=>{const w=new Date().getDay();return w===0||w===6;};
function monday(off){const d=new Date(); d.setHours(12); const w=(d.getDay()+6)%7; d.setDate(d.getDate()-w+7*(off+(isWeekend()?1:0))); return ymd(d);}
function lapDays(){
  const out={}, pre=Classroom.LAPS;
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i); if(!k||!k.startsWith(pre)) continue;
    const [c,r,day]=k.slice(pre.length).split('|'); if(!inScope(c)) continue;
    const s=JSON.parse(localStorage.getItem(k)); const n=s&&s.laps?s.laps.filter(l=>l.q||Object.keys(l.marks||{}).length).length:0;
    if(n)(out[day]=out[day]||[]).push({cls:c,room:r,laps:n});}}catch(e){}
  return out;
}
const goalShort=g=>{const t=IEP.fill(g.text,'').replace(/^\s*(within one year,?\s*)?(the student\s*)?(will\s*)?/i,''); return (g.area?g.area+': ':'')+(t.length>90?t.slice(0,88).replace(/\s+\S*$/,'')+'…':t);};
// one day's measurements grouped by student
function whoBlock(items){
  const bySid=new Map(); items.forEach(x=>{if(!bySid.has(x.sid)) bySid.set(x.sid,[]); bySid.get(x.sid).push(x);});
  return [...bySid.entries()].map(([sid,list])=>`<div class="who"><button type="button" class="nm" data-prof="${esc(sid)}">${esc(nameAny(sid))} ›</button>
    ${list.map(x=>`<button type="button" class="gl" data-measure="${esc(x.goal.id)}"><span class="t">${esc(goalShort(x.goal))}</span>${x.overdue?'<span class="tag over">overdue</span>':''}${x.slot.planned?'<span class="tag">planned</span>':''}<span class="tag due">Measure</span></button>`).join('')}</div>`).join('');
}
function renderToday(){
  const t=today(), mon=monday(weekOff), days=[0,1,2,3,4].map(i=>addDays(mon,i)), fri=days[4], thisWeek=weekOff===0;
  const scoped=x=>sidInScope(x.sid);
  const ag=IEP.agenda(I,cal(),addDays(fri,21),t).filter(scoped);
  const up=IEP.upcoming(I,cal(),mon,fri,t).filter(scoped);
  const fus=A.entries.filter(e=>inScope(e.cls)&&e.fu&&e.fu.date&&!e.fu.done);
  const laps=lapDays();
  const dueNow=ag.filter(x=>x.day<=t), overdue=dueNow.filter(x=>x.overdue), fuNow=fus.filter(e=>e.fu.date<=t);
  let h=`<div class="weekbar"><button class="ghost" id="wPrev" aria-label="Previous week">‹</button><h2>${thisWeek?(isWeekend()?'Coming week':'This week'):'Week of '+short(mon)} <span class="meta" style="font-weight:500">${short(mon)}–${short(fri)}</span></h2>${thisWeek?'':'<button class="ghost" id="wNow">Today</button>'}<button class="ghost" id="wNext" aria-label="Next week">›</button></div>`;
  if(thisWeek) h+=`<div class="tiles">
    <button type="button" class="tile ${overdue.length?'alert':''}" id="tDue"><b>${dueNow.length}</b><span>${dueNow.length===1?'measurement':'measurements'} due${overdue.length?' · '+overdue.length+' overdue':''}</span></button>
    <button type="button" class="tile ${fuNow.some(e=>e.fu.date<t)?'alert':''}" id="tFu"><b>${fuNow.length}</b><span>follow-ups due</span></button>
    <a class="tile" href="../lap/"><b>${(laps[t]||[]).reduce((a,x)=>a+x.laps,0)}</b><span>laps today</span></a></div>`;
  if(!Object.keys(I.goals).length) h+=`<div class="card"><h3>No IEP goals yet</h3><div class="meta">Open a student's profile to add goals, or start in the Goal bank.</div><div class="btnrow"><button class="primary" id="goStudents">Students</button><button class="ghost" id="goBank">Goal bank</button></div></div>`;
  // a weekend "today" card so due items are never hidden
  if(thisWeek&&isWeekend()&&dueNow.length) h+=dayCard(t,dueNow,fuNow,laps,true);
  days.forEach(d=>{
    const isT=d===t;
    let items;
    if(isT) items=dueNow;
    else if(d>t) items=up.filter(x=>x.day===d&&!x.overdue);
    else items=[];
    const df=isT?fuNow:(d>t?fus.filter(e=>e.fu.date===d):[]);
    h+=dayCard(d,items,df,laps,isT);
  });
  // coming up after this week
  const after=addDays(fri,1), until=addDays(fri,14);
  const later=IEP.upcoming(I,cal(),after,until,t).filter(scoped);
  const firstEach=new Map(); later.forEach(x=>{const k=x.goal.id; if(!firstEach.has(k)) firstEach.set(k,x);});
  const lines=[...firstEach.values()].map(x=>({d:x.day,k:'Measure',v:`<b>${esc(nameAny(x.sid))}</b> · ${esc(goalShort(x.goal))}`,sid:x.sid}))
    .concat(fus.filter(e=>e.fu.date>=after&&e.fu.date<=until).map(e=>({d:e.fu.date,k:'Follow up',v:`<b>${esc(e.fu.text||'Follow up')}</b> · ${esc(names(e.sids))}`,act:e.id})))
    .concat(Object.keys(I.profiles).filter(s=>sidInScope(s)&&I.profiles[s].reviewDate&&I.profiles[s].reviewDate>=t&&I.profiles[s].reviewDate<=addDays(t,30)).map(s=>({d:I.profiles[s].reviewDate,k:'IEP review',v:`<b>${esc(nameAny(s))}</b>`,sid:s})))
    .sort((a,b)=>a.d<b.d?-1:1);
  h+=`<div class="card"><h3>Coming up</h3>${lines.length?lines.slice(0,30).map(x=>`<button type="button" class="it" ${x.act?`data-act="${esc(x.act)}"`:`data-prof="${esc(x.sid)}"`}><span class="k">${esc(short(x.d))}</span><span class="v"><small>${esc(x.k)}</small> ${x.v}</span></button>`).join(''):'<div class="done">Nothing scheduled in the next two weeks.</div>'}</div>`;
  // recent activity
  const since=addDays(t,-7), feed=[];
  A.entries.filter(e=>inScope(e.cls)&&e.date>=since&&e.date<=t).forEach(e=>feed.push({d:e.date,ts:e.updated||0,k:TSHORT[e.type]||'Note',v:`<b>${esc(names(e.sids))}</b> ${esc((e.summary||'').slice(0,90))}`,act:e.id}));
  I.data.filter(p=>p.date>=since&&p.date<=t&&sidInScope(p.sid)).forEach(p=>{const g=I.goals[p.goal]; if(!g) return;
    feed.push({d:p.date,ts:p.t||0,k:'Measured',v:`<b>${esc(nameAny(p.sid))}</b> ${esc(goalShort(g))} · ${p.pct}%`,sid:p.sid});});
  Object.keys(laps).filter(d=>d>=since&&d<=t).forEach(d=>laps[d].forEach(x=>feed.push({d,ts:0,k:'Laps',v:`${plural(x.laps,'lap')} · ${esc((D.classes[x.cls]||{}).name||'')} ${esc((D.rooms[x.room]||{}).name||'')}`})));
  feed.sort((a,b)=>a.d<b.d?1:a.d>b.d?-1:b.ts-a.ts);
  h+=`<div class="card"><h3>Recent · last 7 days</h3>${feed.length?feed.slice(0,20).map(x=>`<button type="button" class="it" ${x.act?`data-act="${esc(x.act)}"`:x.sid?`data-prof="${esc(x.sid)}"`:''}><span class="k">${esc(short(x.d))}</span><span class="v"><small>${esc(x.k)}</small> ${x.v}</span></button>`).join(''):'<div class="done">Nothing in the last week.</div>'}</div>`;
  if(!cal()||!(cal().periods||[]).length) h+=`<p class="hint">Tip: set your school year and grading periods in <a href="../setup/">Classroom setup → Calendar</a> so "per grading period" and "per quarter" schedules use your dates.</p>`;
  $('view').innerHTML=h;
  $('wPrev').addEventListener('click',()=>{weekOff--;renderToday();});
  $('wNext').addEventListener('click',()=>{weekOff++;renderToday();});
  if($('wNow')) $('wNow').addEventListener('click',()=>{weekOff=0;renderToday();});
  if($('tFu')) $('tFu').addEventListener('click',()=>{tab='activity';actFilter='fu';savePrefs();render();});
  if($('tDue')) $('tDue').addEventListener('click',()=>{const c=document.querySelector('.day.today'); if(c) c.scrollIntoView({behavior:'smooth',block:'start'});});
  if($('goStudents')) $('goStudents').addEventListener('click',()=>{tab='students';render();});
  if($('goBank')) $('goBank').addEventListener('click',()=>{tab='bank';render();});
  $('view').onclick=e=>{
    const m=e.target.closest('[data-measure]'), p=e.target.closest('[data-prof]'), a=e.target.closest('[data-act]');
    if(m){const g=I.goals[m.dataset.measure]; measureSheet([g],renderToday);}
    else if(p) goProfile(p.dataset.prof);
    else if(a) editEntry(A.entries.find(x=>x.id===a.dataset.act),null,renderToday);};
}
function dayCard(d,items,fus,laps,isT){
  const t=today(), past=d<t;
  const logged=I.data.filter(p=>p.date===d&&sidInScope(p.sid));
  const acts=A.entries.filter(e=>e.date===d&&inScope(e.cls));
  const ld=laps[d]||[];
  const bits=[];
  if(logged.length) bits.push(plural(logged.length,'measurement')+' logged');
  ld.forEach(x=>bits.push(plural(x.laps,'lap')+' ('+esc((D.classes[x.cls]||{}).name||'')+')'));
  acts.forEach(e=>bits.push(esc(TSHORT[e.type]||'Note')+': '+esc(names(e.sids))));
  let h=`<div class="card day ${isT?'today':''}"><div class="dayhead"><h3>${isT?'Today · ':''}${esc(dayName(d))}</h3>${items.length?`<span class="tag ${items.some(x=>x.overdue)?'over':'due'}">${plural(items.length,'measurement')}</span>`:''}</div>`;
  if(items.length) h+=whoBlock(items);
  fus.forEach(e=>{h+=`<button type="button" class="it" data-act="${esc(e.id)}"><span class="k">Follow up</span><span class="v"><b>${esc(e.fu.text||'Follow up')}</b>${e.fu.date<t?' <span class="tag over">overdue</span>':''}<br><small>${esc(names(e.sids))} · from ${esc(short(e.date))}</small></span></button>`;});
  if(!items.length&&!fus.length&&!bits.length) h+=`<div class="done">${past?'Nothing recorded.':'Nothing scheduled.'}</div>`;
  if(bits.length) h+=`<div class="done">✓ ${bits.join(' · ')}</div>`;
  return h+`</div>`;
}

// ---------- menu
$('menuBtn').addEventListener('click',()=>openSheet(`<button class="item" id="mExport">Export backup</button>
  <button class="item" id="mImport">Import backup…</button>
  <button class="item" id="mCsvM">Copy measurements as CSV</button>
  <button class="item" id="mCsv">Copy activity log as CSV</button>
  <hr><a class="item btn" href="../lap/">Lap Tracker</a><a class="item btn" href="../setup/">Classroom setup</a>`,
  el=>{el.querySelector('#mExport').addEventListener('click',()=>HomeBackup.exportSheet());
    el.querySelector('#mImport').addEventListener('click',()=>HomeBackup.importSheet());
    el.querySelector('#mCsvM').addEventListener('click',()=>HomeBackup.copyMeasureCsv());
    el.querySelector('#mCsv').addEventListener('click',()=>HomeBackup.copyCsv());}));

addEventListener('storage',e=>{if([AK,CK,IEP.KEY,'classroom.v1'].includes(e.key)) render();});
addEventListener('pageshow',e=>{if(e.persisted) render();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&$('sheetWrap').hidden) render();});
