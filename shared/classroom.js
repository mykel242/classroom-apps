/* Shared classes, rooms and seating charts for all classroom apps.
   Everything lives in this browser on the tablet (localStorage).

   Data shape (schema 2):
     classes:  { classId: { name, students: [ {id, name} ] } }
     rooms:    { roomId:  { name, type:'grid'|'pods'|'list', ... } }
     charts:   { 'classId|roomId': { seatId: studentId } }
   Students are tracked by a permanent id, so renaming never breaks seats or past marks,
   and two students can share a name. */
(function(){
  const KEY='classroom.v1', SCHEMA=2, LAPS='lapTracker.v3:';
  const DEFAULT={
    schema:SCHEMA,
    classes:{'601':{name:'601',students:[]},'803':{name:'803',students:[]}},
    rooms:{
      math:{name:'Math room',type:'grid',rows:5,cols:5},
      ela:{name:'ELA room',type:'pods',pods:5,size:5},
      r803:{name:'803 room',type:'list'}
    },
    defaultRoom:{'601':'math','803':'r803'},
    charts:{}
  };
  const clone=o=>JSON.parse(JSON.stringify(o));
  const newStudentId=()=>'s'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);

  function load(){
    let d=null;
    try{d=JSON.parse(localStorage.getItem(KEY))}catch(e){}
    if(!d){
      d=clone(DEFAULT);
      try{const old=JSON.parse(localStorage.getItem('lapTracker.chart.v1'));
        if(old&&Object.keys(old).length){d.schema=1; d.charts['601|math']=old;}}catch(e){}
    }
    d.defaultRoom=d.defaultRoom||{}; d.charts=d.charts||{};
    if((d.schema||1)<SCHEMA){ upgrade(d); d.schema=SCHEMA; }
    if(!localStorage.getItem(KEY)||d._dirty){ delete d._dirty; save(d); }
    return d;
  }
  function save(d){try{localStorage.setItem(KEY,JSON.stringify(d))}catch(e){}}

  // One-time move from names to permanent ids: rosters, seating charts and saved laps.
  function upgrade(d){
    // keep a copy of the old data, just in case
    try{localStorage.setItem(KEY+'.before-ids',JSON.stringify(d))}catch(e){}
    Object.keys(d.classes).forEach(c=>{
      const cl=d.classes[c], byName=new Map(), list=[];
      const idFor=n=>{const k=String(n).trim(); if(!k) return ''; const key=k.toLowerCase();
        if(!byName.has(key)){const s={id:newStudentId(),name:k}; byName.set(key,s.id); list.push(s);} return byName.get(key);};
      (cl.students||[]).forEach(s=>idFor(typeof s==='string'?s:(s&&s.name)||''));
      // seating charts: names become ids (names not on the roster are added to it)
      Object.keys(d.charts).forEach(k=>{if(!k.startsWith(c+'|')) return; const ch=d.charts[k];
        Object.keys(ch).forEach(seat=>{const id=idFor(ch[seat]); if(id) ch[seat]=id; else delete ch[seat];});});
      // saved laps for this class: list-room seats and today-only swaps
      try{
        const pre=LAPS+c+'|', keys=[];
        for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i); if(k&&k.startsWith(pre)) keys.push(k);}
        keys.forEach(k=>{const s=JSON.parse(localStorage.getItem(k)); if(!s) return;
          const mvKey=o=>{if(!o) return o; const out={}; Object.keys(o).forEach(x=>{out[x.startsWith('S:')?'S:'+idFor(x.slice(2)):x]=o[x];}); return out;};
          (s.laps||[]).forEach(l=>{l.marks=mvKey(l.marks);});
          s.off=mvKey(s.off);
          const over={}; Object.keys(s.over||{}).forEach(x=>{const nk=x.startsWith('S:')?'S:'+idFor(x.slice(2)):x; over[nk]=s.over[x]?idFor(s.over[x]):'';});
          s.over=over; localStorage.setItem(k,JSON.stringify(s));});
      }catch(e){}
      cl.students=list;
    });
    d._dirty=true;
  }

  const rowLetter=i=>String.fromCharCode(65+i);
  function student(d,classId,sid){const c=d.classes[classId]; return c&&(c.students||[]).find(s=>s.id===sid)||null;}
  const nameOf=(d,classId,sid)=>{const s=sid&&student(d,classId,sid); return s?s.name:'';};

  // Returns {layout, cols, groups:[{name, seats:[{id,label,sid,student}]}]}  (student = display name)
  function seats(d,roomId,classId){
    const r=d.rooms[roomId]; const chart=d.charts[classId+'|'+roomId]||{};
    const at=id=>({sid:chart[id]&&student(d,classId,chart[id])?chart[id]:'', student:nameOf(d,classId,chart[id])});
    if(!r) return {layout:'list',groups:[]};
    if(r.type==='grid'){
      const s=[];
      for(let i=0;i<r.rows;i++)for(let j=0;j<r.cols;j++){const id=rowLetter(i)+(j+1);s.push(Object.assign({id,label:id},at(id)))}
      return {layout:'grid',cols:r.cols,groups:[{name:'',seats:s}]};
    }
    if(r.type==='pods'){
      const groups=[];
      for(let p=1;p<=r.pods;p++){const s=[];
        for(let k=1;k<=r.size;k++){const id='P'+p+'-'+k;s.push(Object.assign({id,label:p+'·'+k},at(id)))}
        groups.push({name:'Pod '+p,seats:s});}
      return {layout:'pods',groups};
    }
    // list rooms: roster order, so sorting the roster in Setup sets the order here
    const c=d.classes[classId];
    return {layout:'list',groups:[{name:'',seats:(c?c.students:[]).map(s=>({id:'S:'+s.id,label:'',sid:s.id,student:s.name}))}]};
  }

  // Builds seat buttons into container. Returns [{seat, el}] for later updates.
  function render(container,info){
    container.innerHTML=''; container.className='seats-'+info.layout;
    if(info.layout==='grid') container.style.gridTemplateColumns='repeat('+info.cols+',1fr)';
    else container.style.gridTemplateColumns='';
    const out=[];
    const mk=seat=>{
      const b=document.createElement('button');
      b.className='seat'; b.type='button'; b.dataset.id=seat.id;
      b.innerHTML='<span class="id"></span><span class="name"></span><span class="mark"></span><span class="word"></span>';
      b.querySelector('.id').textContent=seat.label;
      out.push({seat,el:b}); return b;
    };
    info.groups.forEach(g=>{
      if(info.layout==='pods'){
        const pod=document.createElement('div'); pod.className='pod';
        const h=document.createElement('h3'); h.textContent=g.name; pod.appendChild(h);
        const inner=document.createElement('div'); inner.className='in'; pod.appendChild(inner);
        g.seats.forEach(s=>inner.appendChild(mk(s))); container.appendChild(pod);
      } else g.seats.forEach(s=>container.appendChild(mk(s)));
    });
    return out;
  }

  function roomFor(d,classId,prefs){
    return (prefs&&prefs['room:'+classId]&&d.rooms[prefs['room:'+classId]])?prefs['room:'+classId]
      :(d.defaultRoom[classId]&&d.rooms[d.defaultRoom[classId]])?d.defaultRoom[classId]:Object.keys(d.rooms)[0];
  }

  // Ask the browser not to clear this app's data when the tablet runs low on space.
  async function protectStorage(){
    try{ if(!navigator.storage||!navigator.storage.persist) return 'unsupported';
      if(await navigator.storage.persisted()) return 'protected';
      return (await navigator.storage.persist())?'protected':'not-protected';
    }catch(e){ return 'unsupported'; }
  }

  window.Classroom={load,save,seats,render,roomFor,student,nameOf,newStudentId,protectStorage,LAPS,SCHEMA};
})();
