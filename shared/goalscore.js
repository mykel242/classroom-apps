/* Read-only view of Student Goals data for other apps (Home dashboard).
   Same scheduling rules as the Goals app: per-student settings fall back to the goal,
   next check = last log + frequency (moved off weekends), first check = start date. */
(function(){
  const CAD={daily:1,twice:3,weekly:7,biweekly:14,monthly:28};
  const pad=n=>String(n).padStart(2,'0');
  const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  const parseDay=s=>new Date(s+'T12:00:00');
  const addDays=(s,n)=>{const d=parseDay(s);d.setDate(d.getDate()+n);return ymd(d);};
  const today=()=>ymd(new Date());

  function load(){let g=null;try{g=JSON.parse(localStorage.getItem('goals.v1'))}catch(e){}
    g=g&&typeof g==='object'?g:{}; g.goals=g.goals||{}; g.groups=g.groups||{}; g.logs=Array.isArray(g.logs)?g.logs:[]; return g;}
  function eff(g,sid){const o=(g.per&&g.per[sid])||{};
    return {cadence:o.cadence||g.cadence, start:o.start||g.start||'', end:o.end||g.end||'', status:o.status||'active', metDate:o.metDate||''};}
  function lastLog(G,gid,sid){let last=null; G.logs.forEach(l=>{if(l.goal===gid&&l.sid===sid&&(!last||l.date>last))last=l.date;}); return last;}
  function nextDue(G,g,sid){
    const e=eff(g,sid), last=lastLog(G,g.id,sid);
    let d=last?addDays(last,CAD[e.cadence]||7):(e.start||today());
    const wd=parseDay(d).getDay(); if(wd===6) d=addDays(d,2); else if(wd===0) d=addDays(d,1);
    return {date:d,last};
  }
  // every open goal check: {goal, sid, cls, date, overdue}
  function checks(G){
    const out=[], t=today();
    Object.values(G.goals).forEach(g=>{ if(g.archived) return;
      (g.students||[]).forEach(sid=>{const e=eff(g,sid);
        if(e.status!=='active') return;
        if(e.end&&t>e.end) return;
        const n=nextDue(G,g,sid); if(e.end&&n.date>e.end) return;
        out.push({goal:g,sid,cls:g.cls,date:n.date,overdue:n.date<t,never:!n.last});});});
    return out;
  }
  const offWeekend=d=>{const wd=parseDay(d).getDay(); return wd===6?addDays(d,2):wd===0?addDays(d,1):d;};
  // future checks repeated at each student's frequency up to a date (overdue ones count from today)
  function project(G,to){
    const out=[], t=today();
    checks(G).forEach(c=>{const e=eff(c.goal,c.sid), step=CAD[e.cadence]||7;
      let d=c.date<t?t:c.date, i=0;
      while(d<=to&&i<80){ if(e.end&&d>e.end) break; out.push(Object.assign({},c,{date:d,overdue:c.date<t&&d===t})); d=offWeekend(addDays(d,step)); i++; }});
    return out;
  }
  window.GoalsCore={load,eff,nextDue,checks,project,addDays,ymd,today,parseDay};
})();
