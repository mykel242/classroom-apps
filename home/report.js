/* Classroom Home: weekly status report.
   Two versions: "For me" uses names; "For mentor & portfolio" uses a permanent code per student
   (Student A, B, …, kept in iep.v1 so it stays the same all year and travels with backups).
   The report compiles what was recorded. Reflection sections are left blank for the teacher. */

// permanent student codes for de-identified reports
function codeFor(sid){
  I=loadI(); I.codes=I.codes||{};
  if(!I.codes[sid]){
    const used=new Set(Object.values(I.codes)); let n=0, c;
    const label=k=>{let s=''; k++; while(k>0){const r=(k-1)%26; s=String.fromCharCode(65+r)+s; k=Math.floor((k-1)/26);} return s;};
    do{c=label(n++);}while(used.has(c));
    I.codes[sid]=c; saveI();
  }
  return 'Student '+I.codes[sid];
}

function reportSheet(){
  // default: the current Monday–Sunday week (on a weekend, that's the school week just finished)
  let mon=(()=>{const d=new Date(); d.setHours(12); d.setDate(d.getDate()-(d.getDay()+6)%7); return ymd(d);})();
  let ver=P.reportVer||'mentor', withText=!!P.reportText;
  const draw=el=>{const fri=addDays(mon,4);
    el.querySelector('#rWeek').textContent=`${short(mon)} – ${short(fri)}`;
    el.querySelectorAll('#rVer button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===ver));
    el.querySelector('#rTextW').querySelector('span').textContent=ver==='mentor'?'Include note text (student names are replaced with codes; review before sharing)':'Include note text';
    el.querySelector('#rPrev').innerHTML=buildReport(mon,ver,withText);};
  openSheet(`<h2>Weekly report</h2>
    <div class="bar" style="padding:0 6px"><button class="ghost" id="rP" aria-label="Previous week">‹</button><b id="rWeek" class="grow" style="text-align:center"></b><button class="ghost" id="rN" aria-label="Next week">›</button></div>
    <div class="field"><span class="lbl">Version</span><div class="seg" id="rVer"><button type="button" data-v="me">For me (names)</button><button type="button" data-v="mentor">For mentor & portfolio (codes)</button></div></div>
    <label class="bar" id="rTextW" style="gap:8px;padding:0 6px;font-size:15px"><input type="checkbox" id="rText" ${withText?'checked':''} style="width:22px;height:22px"><span></span></label>
    <div class="field"><label for="rName">Your name on the report (optional)</label><input id="rName" type="text" value="${esc(P.reportName||'')}" enterkeyhint="done"></div>
    <div id="rPrev" style="margin:4px 6px;border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--bg);font-size:14px"></div>
    <div class="sticky-actions"><button class="ghost" id="rC">Close</button><button class="primary" id="rPrint">Print or save as PDF</button></div>`,
  el=>{
    el.querySelector('#rP').addEventListener('click',()=>{mon=addDays(mon,-7);draw(el);});
    el.querySelector('#rN').addEventListener('click',()=>{mon=addDays(mon,7);draw(el);});
    el.querySelector('#rVer').addEventListener('click',e=>{const b=e.target.closest('[data-v]'); if(b){ver=b.dataset.v; P.reportVer=ver; savePrefs(); draw(el);}});
    el.querySelector('#rText').addEventListener('change',e=>{withText=e.target.checked; P.reportText=withText; savePrefs(); draw(el);});
    el.querySelector('#rName').addEventListener('change',e=>{P.reportName=e.target.value.trim(); savePrefs(); draw(el);});
    el.querySelector('#rName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.target.blur();}});
    el.querySelector('#rC').addEventListener('click',closeSheet);
    el.querySelector('#rPrint').addEventListener('click',()=>{$('printout').innerHTML=buildReport(mon,ver,withText); setTimeout(()=>window.print(),50);});
    draw(el);});
}

function buildReport(mon,ver,withText){
  D=Classroom.load(); I=loadI(); A=loadA();
  const fri=addDays(mon,4), sun=addDays(mon,6), t=today(), anon=ver==='mentor';
  const inWeek=d=>d>=mon&&d<=sun;
  const who=sid=>anon?codeFor(sid):nameAny(sid);
  // replace student names in free text with codes for the mentor version
  const allStudents=Object.keys(D.classes).flatMap(c=>(D.classes[c].students||[]));
  const scrub=txt=>{ if(!anon) return txt; let s=String(txt||'');
    allStudents.slice().sort((a,b)=>b.name.length-a.name.length).forEach(st=>{
      const parts=[st.name,...st.name.split(/\s+/).filter(p=>p.length>=2)];
      parts.forEach(p=>{const re=new RegExp('(^|[^\\p{L}])'+p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^\\p{L}])','giu'); s=s.replace(re,'$1'+codeFor(st.id));});});
    return s;};
  const classNames=classIds().map(c=>(D.classes[c]||{}).name).filter(Boolean).join(', ');
  const T=s=>esc(s);

  // ---- IEP measurements
  const goals=Object.values(I.goals).filter(g=>sidInScope(g.sid)&&g.status!=='closed');
  const pts=I.data.filter(p=>inWeek(p.date)&&I.goals[p.goal]&&sidInScope(p.sid));
  let sched=0, schedDone=0; const overdueEnd=[];
  goals.filter(g=>g.status==='active').forEach(g=>{const sc=IEP.schedule(g,I.data,cal(),sun,sun>t?t:sun);
    sc.slots.forEach(s=>{ if(s.target>=mon&&s.target<=fri){sched++; if(s.state==='done') schedDone++;} });
    const late=sc.slots.filter(s=>s.state==='overdue'||(s.state==='missed'&&s.end>=mon&&s.end<=sun)); if(late.length) overdueEnd.push({g,n:late.length});});
  const measuredSids=new Set(pts.map(p=>p.sid));
  const meeting=goals.filter(g=>IEP.criteria(g,I.data).met).length;
  // ---- contacts
  const acts=A.entries.filter(e=>inScope(e.cls)&&inWeek(e.date)).sort((a,b)=>a.date<b.date?-1:1);
  const byType=k=>acts.filter(e=>e.type===k);
  const methods={}; byType('parent').forEach(e=>{methods[e.method||'Other']=(methods[e.method||'Other']||0)+1;});
  const fuOpened=acts.filter(e=>e.fu&&e.fu.date).length;
  const fuClosed=A.entries.filter(e=>inScope(e.cls)&&e.fu&&e.fu.done&&e.fu.doneDate&&inWeek(e.fu.doneDate)).length;
  const fuOpenLate=A.entries.filter(e=>inScope(e.cls)&&e.fu&&!e.fu.done&&e.fu.date<=sun).length;
  // ---- checks for understanding (lap tracker)
  const lapRows=[]; const pre=Classroom.LAPS;
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i); if(!k||!k.startsWith(pre)) continue;
    const [c,r,day]=k.slice(pre.length).split('|'); if(!inScope(c)||!inWeek(day)) continue;
    const s=JSON.parse(localStorage.getItem(k)); if(!s||!s.laps) continue;
    s.laps.forEach(l=>{const m=Object.values(l.marks||{}); if(!m.length&&!l.q) return;
      lapRows.push({day,cls:c,room:r,q:l.q||'',got:m.filter(x=>x==='got').length,part:m.filter(x=>x==='part').length,not:m.filter(x=>x==='not').length});});}}catch(e){}
  lapRows.sort((a,b)=>a.day<b.day?-1:1);
  const lapCls={}; lapRows.forEach(r=>{const k=r.cls; lapCls[k]=lapCls[k]||{laps:0,got:0,part:0,not:0}; const o=lapCls[k]; o.laps++; o.got+=r.got; o.part+=r.part; o.not+=r.not;});
  const pct=(a,b)=>b?Math.round(100*a/b)+'%':'—';

  let h=`<h1>Weekly status report</h1><p><b>Week of ${T(short(mon))} – ${T(short(fri))}, ${parseDay(mon).getFullYear()}</b> · ${T(classNames||'All classes')}${P.reportName?' · '+T(P.reportName):''}</p>
    <p style="color:#555">${anon?'Students are identified by code (the same code all year). ':''}Prepared ${T(short(t))} from records kept in Classroom Home.</p>`;
  h+=`<h2>At a glance</h2><table><tbody>
    <tr><th>IEP measurements taken</th><td>${pts.length}${sched?` (${schedDone} of ${sched} scheduled this week)`:''} · ${plural(measuredSids.size,'student')}</td></tr>
    <tr><th>Goals meeting criteria</th><td>${meeting} of ${goals.length}</td></tr>
    <tr><th>Measurements overdue at week's end</th><td>${overdueEnd.reduce((a,x)=>a+x.n,0)}</td></tr>
    <tr><th>Family contacts</th><td>${byType('parent').length}${Object.keys(methods).length?' ('+Object.entries(methods).map(([m,n])=>T(m)+' '+n).join(', ')+')':''}</td></tr>
    <tr><th>Student conferences</th><td>${byType('student').length}</td></tr>
    <tr><th>Behavior notes</th><td>${byType('behavior').length}</td></tr>
    <tr><th>Follow-ups</th><td>${fuOpened} opened · ${fuClosed} completed · ${fuOpenLate} open and due</td></tr>
    <tr><th>Checks for understanding (laps)</th><td>${lapRows.length}${lapRows.length?' · got it '+pct(lapRows.reduce((a,r)=>a+r.got,0),lapRows.reduce((a,r)=>a+r.got+r.part+r.not,0)):''}</td></tr>
  </tbody></table>`;

  // IEP progress by student
  h+=`<h2>IEP goal progress</h2>`;
  const sids=[...new Set(goals.map(g=>g.sid))].sort((a,b)=>who(a).localeCompare(who(b)));
  if(!sids.length) h+='<p>No IEP goals recorded.</p>';
  else h+=`<table><thead><tr><th>Student</th><th>Goal</th><th>This week</th><th>Toward criteria</th><th>Status today</th></tr></thead><tbody>`+
    sids.map(sid=>goals.filter(g=>g.sid===sid).map((g,i)=>{const wk=pts.filter(p=>p.goal===g.id), cr=IEP.criteria(g,I.data), nx=nextText(g);
      const gtxt=(g.area?g.area+': ':'')+scrub(IEP.fill(g.text,who(sid)));
      return `<tr><td>${i===0?T(who(sid)):''}</td><td>${T(gtxt)}<br><small>${T(IEP.critText(g.criteria))}</small></td><td>${wk.length?wk.map(p=>p.pct+'%').join(', '):'—'}</td><td>${T(cr.text)}${cr.met?' ✓':''}</td><td>${T(nx.txt)}</td></tr>`;}).join('')).join('')+`</tbody></table>`;

  // contacts
  h+=`<h2>Family and student contacts</h2>`;
  if(!acts.length) h+='<p>None recorded this week.</p>';
  else h+=`<table><thead><tr><th>Date</th><th>Type</th><th>Student(s)</th><th>How</th>${withText?'<th>Summary</th>':''}<th>Follow-up</th></tr></thead><tbody>`+
    acts.map(e=>`<tr><td>${T(short(e.date))}</td><td>${T(TSHORT[e.type])}</td><td>${T((e.sids||[]).map(who).join(', '))}</td><td>${T(e.type==='parent'?(e.method||'')+(e.with?' · '+e.with:''):'')}</td>${withText?`<td>${T(scrub(e.summary))}${e.outcome?'<br><i>'+T(scrub(e.outcome))+'</i>':''}</td>`:''}<td>${e.fu&&e.fu.date?T((e.fu.done?'Done':'Due '+short(e.fu.date))+(withText&&e.fu.text?': '+scrub(e.fu.text):'')):'—'}</td></tr>`).join('')+`</tbody></table>`;

  // checks for understanding
  h+=`<h2>Checks for understanding</h2>`;
  if(!lapRows.length) h+='<p>No laps recorded this week.</p>';
  else{
    h+=`<table><thead><tr><th>Class</th><th>Laps</th><th>Got it</th><th>Partial</th><th>Not yet</th></tr></thead><tbody>`+
      Object.keys(lapCls).map(c=>{const o=lapCls[c], n=o.got+o.part+o.not; return `<tr><td>${T((D.classes[c]||{}).name||c)}</td><td>${o.laps}</td><td>${pct(o.got,n)}</td><td>${pct(o.part,n)}</td><td>${pct(o.not,n)}</td></tr>`;}).join('')+`</tbody></table>`;
    if(withText) h+=`<table><thead><tr><th>Day</th><th>Class</th><th>Question</th><th>Got it / partial / not yet</th></tr></thead><tbody>`+
      lapRows.map(r=>`<tr><td>${T(wkday(r.day))}</td><td>${T((D.classes[r.cls]||{}).name||'')}</td><td>${T(scrub(r.q)||'—')}</td><td>${r.got} / ${r.part} / ${r.not}</td></tr>`).join('')+`</tbody></table>`;
  }

  // reflection (left blank on purpose)
  const prompts=['What went well this week','Students to watch and why','Priorities for next week',anon?'Questions for my mentor':'Notes',...(anon?['Mentor comments']:[])];
  h+=`<h2>Reflection</h2>`+prompts.map(p=>`<p><b>${T(p)}</b></p><div style="border-bottom:1px solid #999;height:22px"></div><div style="border-bottom:1px solid #999;height:22px"></div><div style="border-bottom:1px solid #999;height:22px;margin-bottom:8px"></div>`).join('');
  return h;
}
