/* Shared classes, rooms and seating charts for all classroom apps.
   Everything lives in this browser on the tablet (localStorage). */
(function(){
  const KEY='classroom.v1';
  const DEFAULT={
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

  function load(){
    let d=null;
    try{d=JSON.parse(localStorage.getItem(KEY))}catch(e){}
    if(!d){
      d=clone(DEFAULT);
      // bring over the seating chart from the first lap tracker version
      try{const old=JSON.parse(localStorage.getItem('lapTracker.chart.v1'));
        if(old&&Object.keys(old).length) d.charts['601|math']=old;}catch(e){}
      save(d);
    }
    d.defaultRoom=d.defaultRoom||{};
    return d;
  }
  function save(d){try{localStorage.setItem(KEY,JSON.stringify(d))}catch(e){}}

  const rowLetter=i=>String.fromCharCode(65+i);

  // Returns {layout, cols, groups:[{name, seats:[{id,label,student}]}]}
  function seats(d,roomId,classId){
    const r=d.rooms[roomId]; const chart=d.charts[classId+'|'+roomId]||{};
    if(!r) return {layout:'list',groups:[]};
    if(r.type==='grid'){
      const s=[];
      for(let i=0;i<r.rows;i++)for(let j=0;j<r.cols;j++){const id=rowLetter(i)+(j+1);s.push({id,label:id,student:chart[id]||''})}
      return {layout:'grid',cols:r.cols,groups:[{name:'',seats:s}]};
    }
    if(r.type==='pods'){
      const groups=[];
      for(let p=1;p<=r.pods;p++){const s=[];
        for(let k=1;k<=r.size;k++){const id='P'+p+'-'+k;s.push({id,label:p+'·'+k,student:chart[id]||''})}
        groups.push({name:'Pod '+p,seats:s});}
      return {layout:'pods',groups};
    }
    const c=d.classes[classId];
    // roster order, so sorting the roster in Setup (by first or last name) sets the order here
    const names=(c?c.students:[]).slice();
    return {layout:'list',groups:[{name:'',seats:names.map(n=>({id:'S:'+n,label:'',student:n}))}]};
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

  window.Classroom={load,save,seats,render,roomFor};
})();
