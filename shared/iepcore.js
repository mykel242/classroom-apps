/* IEP goals: data store and measurement scheduling, shared by the Home app and others.

   Store (localStorage 'iep.v1'):
     bank:     { id: {id, area, text, criteria:{pct,x,y}, methods:[], sched:{n,per}, updated} }   reusable wording
     goals:    { id: {id, sid, cls, bank, area, text, criteria, methods, sched, start, end,
                      status:'active'|'met'|'paused'|'closed', metDate, plan, updated} }         one student's goal
     data:     [ {id, goal, sid, date, pct, correct?, total?, method, note, t} ]                 measurements
     profiles: { sid: {iepDate, reviewDate, notes, updated} }

   Schedule = n measurements per period (week, month, grading period, quarter, school year).
   Each period is split into n equal slots; a slot is due from its midpoint and overdue after it ends.
   Measurements in a period fill its slots in order. A plan date moves the next open slot to that day. */
(function(root){
  const KEY='iep.v1';
  const PER={week:'week',month:'month',period:'grading period',quarter:'quarter',year:'school year'};
  const pad=n=>String(n).padStart(2,'0');
  const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  const parse=s=>new Date(s+'T12:00:00');
  const add=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return ymd(d);};
  const diff=(a,b)=>Math.round((parse(b)-parse(a))/864e5);
  const today=()=>ymd(new Date());
  const wd=s=>parse(s).getDay();

  function load(){let x=null;try{x=JSON.parse(root.localStorage.getItem(KEY))}catch(e){}
    x=x&&typeof x==='object'?x:{}; x.bank=x.bank||{}; x.goals=x.goals||{}; x.data=Array.isArray(x.data)?x.data:[]; x.profiles=x.profiles||{}; return x;}
  function save(x){root.localStorage.setItem(KEY,JSON.stringify(x));}

  // school year split into four equal parts
  function quarters(cal){
    if(!cal||!cal.start||!cal.end||cal.end<=cal.start) return [];
    const a=parse(cal.start), b=parse(cal.end), span=(b-a)/4, out=[];
    for(let i=0;i<4;i++){const s=new Date(+a+span*i), e=i===3?b:new Date(+a+span*(i+1)-864e5); out.push({name:'Q'+(i+1),start:ymd(s),end:ymd(e)});}
    return out;
  }
  // periods of one kind overlapping [from,to]
  function windows(per,cal,from,to){
    const out=[];
    if(per==='week'){let s=add(from,-((wd(from)+6)%7)); while(s<=to){out.push({start:s,end:add(s,6),label:'Week of '+s});s=add(s,7);}}
    else if(per==='month'){const d=parse(from); d.setDate(1); while(ymd(d)<=to){const s=ymd(d); const e=new Date(d.getFullYear(),d.getMonth()+1,0,12); out.push({start:s,end:ymd(e),label:d.toLocaleDateString(undefined,{month:'long'})}); d.setMonth(d.getMonth()+1);}}
    else if(per==='period'){((cal&&cal.periods)||[]).forEach(p=>{if(p.start&&p.end&&p.end>=from&&p.start<=to) out.push({start:p.start,end:p.end,label:p.name});});}
    else if(per==='quarter'){let q=quarters(cal);
      if(!q.length){q=[];const y0=parse(from).getFullYear(); for(let y=y0;y<=parse(to).getFullYear();y++) for(let i=0;i<4;i++){const s=new Date(y,i*3,1,12),e=new Date(y,i*3+3,0,12); q.push({name:'Q'+(i+1),start:ymd(s),end:ymd(e)});}}
      q.forEach(p=>{if(p.end>=from&&p.start<=to) out.push({start:p.start,end:p.end,label:p.name});});}
    else if(per==='year'){if(cal&&cal.start&&cal.end) out.push({start:cal.start,end:cal.end,label:'School year'}); else out.push({start:from,end:to,label:'Year'});}
    return out;
  }
  const offWeekendWithin=(d,lo,hi)=>{ // move a target off Sat/Sun, staying inside the slot
    const w=wd(d); if(w===6){const f=add(d,-1); if(f>=lo) return f; const m=add(d,2); return m<=hi?m:d;}
    if(w===0){const m=add(d,1); if(m<=hi) return m; const f=add(d,-2); return f>=lo?f:d;} return d;};
  const span=g=>({start:g.start||today(), end:g.end||add(g.start||today(),365)});

  // slots for one goal from its start up to `until` (default: 8 weeks ahead)
  function schedule(g,data,cal,until,now){
    const t=now||today(), sp=span(g), n=Math.max(1,Math.min(20,(g.sched&&g.sched.n)||1)), per=(g.sched&&g.sched.per)||'month';
    const to=until&&until<sp.end?until:sp.end;
    const pts=data.filter(d=>d.goal===g.id).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.t||0)-(b.t||0));
    const slots=[];
    windows(per,cal,sp.start,to).forEach(w=>{
      const ws=w.start<sp.start?sp.start:w.start, we=w.end>sp.end?sp.end:w.end; if(we<ws) return;
      const len=diff(ws,we)+1, inW=pts.filter(p=>p.date>=w.start&&p.date<=w.end);
      for(let k=0;k<n;k++){
        const s=add(ws,Math.floor(len*k/n)), e=add(ws,Math.max(0,Math.floor(len*(k+1)/n)-1));
        const se=e<s?s:e, target=offWeekendWithin(add(s,Math.floor(diff(s,se)/2)),s,se);
        const filled=inW[k]||null;
        let state;
        if(filled) state='done';
        else if(se<t) state=we<t?'missed':'overdue';
        else if(s<=t) state=target<=t?'due':'open';
        else state='upcoming';
        slots.push({start:s,end:se,target,window:w,label:w.label+(n>1?` · ${k+1} of ${n}`:''),filled,state});
      }
      // extra measurements beyond n in a period are kept as data; they don't create slots
    });
    // a plan date moves the next open slot
    const next=slots.find(s=>s.state==='overdue'||s.state==='due'||s.state==='open'||s.state==='upcoming')||null;
    if(next&&g.plan&&g.plan>=t) next.planned=g.plan;
    return {slots,next,points:pts};
  }
  // when this goal next needs a measurement: the day it shows on lists
  const showDate=(slot,t)=>slot.planned||(slot.state==='overdue'||slot.state==='due'?t:slot.target);

  // every active goal's next measurement, with the day it belongs on
  function agenda(I,cal,until,now){
    const t=now||today(), out=[];
    Object.values(I.goals).forEach(g=>{ if(g.status&&g.status!=='active') return;
      const sc=schedule(g,I.data,cal,until,t); const nx=sc.next; if(!nx) return;
      out.push({goal:g,sid:g.sid,cls:g.cls,slot:nx,day:showDate(nx,t),overdue:nx.state==='overdue',missed:sc.slots.filter(s=>s.state==='missed').length});
    });
    return out.sort((a,b)=>a.day<b.day?-1:a.day>b.day?1:0);
  }
  // all future open slots up to a date (for week views)
  function upcoming(I,cal,from,to,now){
    const t=now||today(), out=[];
    Object.values(I.goals).forEach(g=>{ if(g.status&&g.status!=='active') return;
      const sc=schedule(g,I.data,cal,to,t);
      sc.slots.forEach(s=>{ if(s.state==='done'||s.state==='missed') return; const d=showDate(s,t); if(d>=from&&d<=to) out.push({goal:g,sid:g.sid,cls:g.cls,slot:s,day:d,overdue:s.state==='overdue'}); });
    });
    return out;
  }
  // criteria such as "80% accuracy in 4 out of 5 trials", or just "80% accuracy" (judged on the latest measurement)
  const hasTrials=c=>!c||c.trials!==false;
  function criteria(g,data){
    const c=g.criteria||{}; const pct=+c.pct||80, x=+c.x||4, y=+c.y||5;
    const all=data.filter(d=>d.goal===g.id&&typeof d.pct==='number').sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.t||0)-(b.t||0));
    if(!hasTrials(c)){const l=all[all.length-1];
      return {pct,trials:false,n:all.length,met:!!l&&l.pct>=pct,text:l?`Latest ${l.pct}% (target ${pct}%)`:'No measurements yet'};}
    const last=all.slice(-y), hits=last.filter(d=>d.pct>=pct).length;
    return {pct,x,y,trials:true,n:last.length,hits,met:hits>=x,text:last.length?`${hits} of last ${last.length} at ${pct}%+ (needs ${x} of ${y})`:'No measurements yet'};
  }
  const critText=c=>hasTrials(c)?`${c&&c.pct||80}% accuracy in ${c&&c.x||4} out of ${c&&c.y||5} trials`:`${c&&c.pct||80}% accuracy`;

  /* Spread measurements so no school day is overloaded.
     Each open slot gets an ideal day: a plan date if set; otherwise the student's measuring day
     (first one inside the slot), else today when due/overdue, else the slot's target.
     Days are filled in order up to `cap` measurements; a student's measurements on the same day stay
     together. Anything that would slip past its deadline stays put and is flagged over the limit.
     opts: {cap, days:{sid:1..5}} where 1 = Monday. */
  const isSchool=d=>{const w=wd(d); return w>0&&w<6;};
  const nextSchool=d=>{while(!isSchool(d)) d=add(d,1); return d;};
  function balance(I,cal,to,now,opts){
    const t=now||today(), start=nextSchool(t), cap=Math.max(0,+(opts&&opts.cap)||0), days=(opts&&opts.days)||{};
    const items=[];
    Object.values(I.goals).forEach(g=>{ if(g.status&&g.status!=='active') return;
      const sc=schedule(g,I.data,cal,to,t);
      sc.slots.forEach(s=>{ if(s.state==='done'||s.state==='missed') return;
        const late=s.state==='overdue'||s.state==='due';
        let ideal;
        if(s.planned) ideal=s.planned;
        else{
          const md=+days[g.sid]||0;
          if(md){ let d=s.start>start?s.start:start; while(d<=s.end&&wd(d)!==md) d=add(d,1); ideal=d<=s.end?d:null; }
          if(!ideal) ideal=late?start:(s.target<start?start:s.target);
        }
        ideal=s.planned?ideal:nextSchool(ideal);
        if(ideal>to) return;
        items.push({goal:g,sid:g.sid,cls:g.cls,slot:s,ideal,deadline:s.end<start?start:s.end,overdue:s.state==='overdue',planned:!!s.planned});
      });
    });
    if(!cap){ items.forEach(x=>x.day=x.ideal); return items.sort((a,b)=>a.day<b.day?-1:a.day>b.day?1:0); }
    // bundle each student's items that want the same day
    const bundles=new Map();
    items.forEach(x=>{const k=x.ideal+'|'+x.sid; if(!bundles.has(k)) bundles.set(k,{day:x.ideal,sid:x.sid,items:[]}); bundles.get(k).items.push(x);});
    const queue=[...bundles.values()].sort((a,b)=>a.day<b.day?-1:a.day>b.day?1:Math.min(...a.items.map(i=>i.deadline))<Math.min(...b.items.map(i=>i.deadline))?-1:1);
    const load={}, out=[];
    const place=(x,d,over)=>{x.day=d; x.overCap=!!over; load[d]=(load[d]||0)+1; out.push(x);};
    // planned measurements are fixed and count toward the limit first
    queue.forEach(b=>b.items.filter(i=>i.planned).forEach(i=>place(i,i.ideal,false)));
    queue.forEach(b=>{
      let rest=b.items.filter(i=>!i.planned).sort((x,y)=>x.deadline<y.deadline?-1:x.deadline>y.deadline?1:0), d=b.day;
      while(rest.length){
        const next=nextSchool(add(d,1));
        if(cap-(load[d]||0)>=rest.length){ rest.forEach(i=>place(i,d,false)); rest=[]; break; }
        // items that can't move past this day's slot deadline stay here, even over the limit
        rest.filter(i=>i.deadline<next).forEach(i=>place(i,d,(load[d]||0)>=cap)); rest=rest.filter(i=>i.deadline>=next);
        // a student with more goals than the limit is split: fill today's room, earliest deadline first
        const room=cap-(load[d]||0);
        if(rest.length>cap&&room>0){ rest.splice(0,room).forEach(i=>place(i,d,false)); }
        if(!rest.length) break;
        if(next>to){ rest.forEach(i=>{i.day=next; i.beyond=true; out.push(i);}); rest=[]; break; }
        d=next;
      }
    });
    return out.sort((a,b)=>a.day<b.day?-1:a.day>b.day?1:0);
  }
  const schedText=s=>`${(s&&s.n)||1} time${((s&&s.n)||1)>1?'s':''} per ${PER[(s&&s.per)||'month']}`;
  const fill=(text,name)=>String(text||'').replace(/\{\{\s*student(\s*name)?\s*\}\}/gi,name||'the student');

  const api={KEY,PER,load,save,quarters,windows,schedule,agenda,upcoming,balance,criteria,critText,schedText,fill,ymd,add,diff,today,parse,isSchool,nextSchool};
  if(typeof module!=='undefined') module.exports=api; else root.IEP=api;
})(typeof window!=='undefined'?window:globalThis);
