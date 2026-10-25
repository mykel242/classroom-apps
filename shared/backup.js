/* Export / import of classroom setup (classes, rosters, rooms, seating charts) and, optionally, saved laps.
   Import never trusts the file: it repairs what it can, skips what it can't,
   and shows a preview of every change before anything is saved.
   Format 2 tracks students by permanent id; format 1 (names only) still imports. */
(function(root){
  const FORMAT=2;
  const lc=s=>String(s).trim().toLowerCase();
  const str=v=>typeof v==='string'?v.trim():(typeof v==='number'?String(v):'');
  const clampInt=(v,lo,hi,def)=>{const n=Math.round(Number(v));return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):def;};
  const rowLetter=i=>String.fromCharCode(65+i);
  const genId=()=>'s'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  const MARKS=new Set(['got','part','not']);
  const DAY=/^\d{4}-\d{2}-\d{2}$/;

  function seatIds(room){
    if(!room) return new Set();
    if(room.type==='grid'){const s=new Set();for(let i=0;i<room.rows;i++)for(let j=0;j<room.cols;j++)s.add(rowLetter(i)+(j+1));return s;}
    if(room.type==='pods'){const s=new Set();for(let p=1;p<=room.pods;p++)for(let k=1;k<=room.size;k++)s.add('P'+p+'-'+k);return s;}
    return new Set();
  }
  const describeRoom=r=>r.type==='grid'?`${r.rows}×${r.cols} grid`:r.type==='pods'?`${r.pods} pods of ${r.size}`:'list';
  const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;

  // laps: {'class|room|YYYY-MM-DD': session}
  function exportDoc(d,build,laps){
    const doc={app:'classroom-setup',format:FORMAT,exported:new Date().toISOString(),build:build||null,
      data:{classes:d.classes,rooms:d.rooms,defaultRoom:d.defaultRoom||{},charts:d.charts||{},calendar:d.calendar||null}};
    if(laps&&Object.keys(laps).length) doc.laps=laps;
    return doc;
  }

  // ---- parse + repair -------------------------------------------------
  function parse(text){
    const warnings=[];
    if(typeof text!=='string'||!text.trim()) return {ok:false,error:'The file is empty.'};
    let t=text.replace(/^﻿/,'').trim(), raw;
    try{raw=JSON.parse(t);}catch(e){
      const a=t.indexOf('{'), b=t.lastIndexOf('}');
      if(a>=0&&b>a){try{raw=JSON.parse(t.slice(a,b+1));warnings.push('Extra text around the backup was ignored.');}catch(e2){}}
      if(!raw) return {ok:false,error:"This file isn't a readable classroom backup. It may be cut off or damaged. Nothing was changed."};
    }
    const src=raw&&raw.data&&typeof raw.data==='object'?raw.data:raw;
    if(!src||typeof src!=='object'||(!src.classes&&!src.rooms)) return {ok:false,error:"This file doesn't contain classes or rooms. Nothing was changed."};
    if(raw.format&&raw.format>FORMAT) warnings.push('This backup was made by a newer version. Parts it does not understand were skipped.');
    const data=sanitize(src,warnings);
    const laps=raw.laps?sanitizeLaps(raw.laps,data,warnings):{};
    return {ok:true,data,laps,warnings,meta:{exported:raw.exported||null,build:raw.build||null}};
  }

  function sanitize(src,warnings){
    const out={classes:{},rooms:{},defaultRoom:{},charts:{}};
    const cin=Array.isArray(src.classes)?Object.fromEntries(src.classes.map((c,i)=>[str(c&&c.id)||('c'+i),c])):(src.classes||{});
    let skipped=0;
    Object.keys(cin).forEach(id=>{
      const c=cin[id]; if(!c||typeof c!=='object'){skipped++;return;}
      const name=str(c.name)||str(id); if(!name){skipped++;return;}
      const ids=new Set(), students=[];
      (Array.isArray(c.students)?c.students:[]).forEach(s=>{
        const n=typeof s==='string'?s.trim():(s&&typeof s.name==='string'?s.name.trim():'');
        if(!n){skipped++;return;}
        let sid=s&&typeof s==='object'&&typeof s.id==='string'&&s.id.trim()?s.id.trim():'';
        if(!sid&&students.some(x=>lc(x.name)===lc(n))){warnings.push(`${name}: duplicate "${n}" removed.`);return;}  // names-only files: same name = same student
        if(!sid||ids.has(sid)) sid=genId();
        ids.add(sid); students.push({id:sid,name:n});
      });
      out.classes[str(id)]={name,students};
    });
    const rin=Array.isArray(src.rooms)?Object.fromEntries(src.rooms.map((r,i)=>[str(r&&r.id)||('r'+i),r])):(src.rooms||{});
    Object.keys(rin).forEach(id=>{
      const r=rin[id]; if(!r||typeof r!=='object'){skipped++;return;}
      const name=str(r.name)||str(id);
      const type=['grid','pods','list'].includes(r.type)?r.type:null;
      if(!type){skipped++;warnings.push(`Room "${name}" has an unknown layout and was skipped.`);return;}
      out.rooms[str(id)]=type==='grid'?{name,type,rows:clampInt(r.rows,1,10,5),cols:clampInt(r.cols,1,10,5)}
        :type==='pods'?{name,type,pods:clampInt(r.pods,1,10,5),size:clampInt(r.size,1,8,5)}:{name,type:'list'};
    });
    Object.keys(src.defaultRoom||{}).forEach(c=>{const r=str(src.defaultRoom[c]); if(out.classes[c]&&out.rooms[r]) out.defaultRoom[c]=r;});
    Object.keys(src.charts||{}).forEach(k=>{
      const [c,r]=k.split('|'); const ch=src.charts[k];
      if(!out.classes[c]||!out.rooms[r]||!ch||typeof ch!=='object'){skipped++;return;}
      out.charts[k]=cleanChart(ch,out.rooms[r],out.classes[c],warnings,`${out.classes[c].name} · ${out.rooms[r].name}`);
    });
    // school calendar: year dates and grading periods
    const cal=src.calendar, okDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
    if(cal&&typeof cal==='object'){
      const periods=(Array.isArray(cal.periods)?cal.periods:[]).filter(p=>p&&okDay(p.start)&&okDay(p.end)&&p.start<=p.end)
        .map((p,i)=>({id:str(p.id)||('gp'+i),name:str(p.name)||('Period '+(i+1)),start:p.start,end:p.end})).sort((a,b)=>a.start<b.start?-1:1);
      if(okDay(cal.start)&&okDay(cal.end)&&cal.start<cal.end) out.calendar={start:cal.start,end:cal.end,periods};
      else if(periods.length) out.calendar={start:periods[0].start,end:periods[periods.length-1].end,periods};
    }
    if(skipped) warnings.push(`${skipped} damaged or unknown item${skipped>1?'s were':' was'} skipped.`);
    return out;
  }
  // a chart value may be a student id or (older files) a name; keep real seats, real students, one seat each
  function cleanChart(ch,room,cls,warnings,label){
    const ok=seatIds(room), byId=new Map(cls.students.map(s=>[s.id,s.id])), byName=new Map();
    cls.students.forEach(s=>{if(!byName.has(lc(s.name))) byName.set(lc(s.name),s.id);});
    const used=new Set(), out={}; let dropped=0;
    Object.keys(ch).forEach(seat=>{
      const v=str(ch[seat]); const sid=byId.get(v)||byName.get(lc(v));
      if(!ok.has(seat)||!sid||used.has(sid)){dropped++;return;}
      out[seat]=sid; used.add(sid);
    });
    if(dropped&&warnings) warnings.push(`${label}: ${plural(dropped,'seat')} skipped (seat no longer exists, student not on roster, or listed twice).`);
    return out;
  }
  function sanitizeLaps(src,data,warnings){
    const out={}; let bad=0;
    if(!src||typeof src!=='object') return out;
    Object.keys(src).forEach(k=>{
      const [c,r,day]=k.split('|'), s=src[k];
      if(!data.classes[c]||!data.rooms[r]||!DAY.test(day||'')||!s||!Array.isArray(s.laps)){bad++;return;}
      const sids=new Set(data.classes[c].students.map(x=>x.id));
      const seatOk=x=>typeof x==='string'&&(x.startsWith('S:')?sids.has(x.slice(2)):x.length<12);
      const laps=s.laps.filter(l=>l&&typeof l==='object').map(l=>{const marks={};
        Object.keys(l.marks||{}).forEach(x=>{if(seatOk(x)&&MARKS.has(l.marks[x])) marks[x]=l.marks[x];});
        return {q:typeof l.q==='string'?l.q.slice(0,300):'',t:Number(l.t)||Date.parse(day+'T12:00:00'),marks};});
      if(!laps.length){bad++;return;}
      const off={}; Object.keys(s.off||{}).forEach(x=>{if(seatOk(x)&&s.off[x]) off[x]=true;});
      const over={}; Object.keys(s.over||{}).forEach(x=>{const v=s.over[x]; if(seatOk(x)&&(v===''||sids.has(v))) over[x]=v;});
      out[k]={laps,off,over,dirty:false};
    });
    if(bad) warnings.push(`${plural(bad,'saved day')} of laps couldn't be read and ${bad===1?'was':'were'} skipped.`);
    return out;
  }

  // ---- reconcile ------------------------------------------------------
  // Match file items to tablet items by id, then by name. Returns the new setup, lap writes, and a readable summary.
  function plan(cur,inc,mode,incLaps,curLaps){
    const res={classes:{},rooms:{},defaultRoom:{},charts:{}}, sum=[], warn=[];
    const merge=mode!=='replace';
    const matcher=(curObj,incObj)=>{
      const map={}, taken=new Set(), byName=new Map(Object.keys(curObj).map(k=>[lc(curObj[k].name),k]));
      Object.keys(incObj).forEach(id=>{
        let m=curObj[id]&&!taken.has(id)?id:null;
        if(!m){const n=byName.get(lc(incObj[id].name)); if(n&&!taken.has(n)&&!incObj[n]) m=n;}
        if(!m){m=curObj[id]||taken.has(id)?id+'_'+Math.random().toString(36).slice(2,6):id;}
        map[id]=m; taken.add(m);
      });
      return map;
    };
    const cmap=matcher(cur.classes,inc.classes), rmap=matcher(cur.rooms,inc.rooms), smaps={};

    // rooms
    const rlines=[];
    if(merge) Object.assign(res.rooms,JSON.parse(JSON.stringify(cur.rooms)));
    Object.keys(inc.rooms).forEach(id=>{
      const to=rmap[id], r=inc.rooms[id], old=cur.rooms[to];
      if(!old) rlines.push(`New room: ${r.name} (${describeRoom(r)})`);
      else{
        if(old.name!==r.name) rlines.push(`Renamed: ${old.name} → ${r.name}`);
        if(describeRoom(old)!==describeRoom(r)) rlines.push(`${r.name}: layout ${describeRoom(old)} → ${describeRoom(r)}`);
      }
      res.rooms[to]=JSON.parse(JSON.stringify(r));
    });
    const incRoomTargets=new Set(Object.values(rmap));
    Object.keys(cur.rooms).filter(k=>!incRoomTargets.has(k)).forEach(k=>rlines.push(merge?`Kept (not in file): ${cur.rooms[k].name}`:`Removed: ${cur.rooms[k].name}`));
    if(rlines.length) sum.push({title:'Rooms',lines:rlines});

    // classes and rosters (students matched by id, then by name)
    if(merge) Object.assign(res.classes,JSON.parse(JSON.stringify(cur.classes)));
    const incClsTargets=new Set(Object.values(cmap));
    Object.keys(inc.classes).forEach(id=>{
      const to=cmap[id], c=inc.classes[id], old=cur.classes[to], lines=[], smap=smaps[id]={};
      const oldList=old?old.students:[], byId=new Map(oldList.map(s=>[s.id,s])), used=new Set();
      c.students.forEach(s=>{
        let m=byId.has(s.id)&&!used.has(s.id)?s.id:null;
        if(!m){const n=oldList.find(o=>!used.has(o.id)&&lc(o.name)===lc(s.name)&&!c.students.some(x=>x.id===o.id)); if(n) m=n.id;}
        if(!m) m=byId.has(s.id)||used.has(s.id)?genId():s.id;
        smap[s.id]=m; used.add(m);
      });
      const added=c.students.filter(s=>!byId.has(smap[s.id]));
      const renamed=c.students.filter(s=>byId.has(smap[s.id])&&byId.get(smap[s.id]).name!==s.name);
      const onlyHere=oldList.filter(o=>!used.has(o.id));
      const fromFile=c.students.map(s=>({id:smap[s.id],name:s.name}));
      let students;
      if(merge){const fileById=new Map(fromFile.map(s=>[s.id,s]));
        students=oldList.map(o=>fileById.get(o.id)||o).concat(fromFile.filter(s=>!byId.has(s.id)));}
      else students=fromFile;
      if(!old) lines.push(`New class with ${plural(c.students.length,'student')}`);
      else{
        if(old.name!==c.name) lines.push(`Renamed from ${old.name}`);
        if(added.length) lines.push(`Adds ${added.length}: ${added.map(s=>s.name).join(', ')}`);
        if(renamed.length) lines.push(`Renames: ${renamed.map(s=>byId.get(smap[s.id]).name+' → '+s.name).join(', ')}`);
        if(onlyHere.length) lines.push(`${merge?'Keeps':'Removes'} ${onlyHere.length} only on this tablet: ${onlyHere.map(s=>s.name).join(', ')}`);
        if(!added.length&&!renamed.length&&!onlyHere.length&&old.name===c.name) lines.push('Roster already matches');
      }
      res.classes[to]={name:c.name,students};
      sum.push({title:'Class '+c.name,lines});
    });
    const goneCls=Object.keys(cur.classes).filter(k=>!incClsTargets.has(k));
    if(goneCls.length) sum.push({title:merge?'Kept (not in file)':'Removed classes',lines:goneCls.map(k=>`${cur.classes[k].name}${merge?'':' (its saved laps are kept)'}`)});
    if(!Object.keys(res.classes).length){res.classes=JSON.parse(JSON.stringify(cur.classes));warn.push('The file has no classes, so your classes were kept.');}
    if(!Object.keys(res.rooms).length){res.rooms=JSON.parse(JSON.stringify(cur.rooms));warn.push('The file has no rooms, so your rooms were kept.');}

    // usual rooms
    if(merge) Object.assign(res.defaultRoom,cur.defaultRoom||{});
    Object.keys(inc.defaultRoom).forEach(c=>{res.defaultRoom[cmap[c]]=rmap[inc.defaultRoom[c]];});

    // seating charts (values are student ids)
    const clines=[];
    if(merge) Object.keys(cur.charts||{}).forEach(k=>{res.charts[k]=Object.assign({},cur.charts[k]);});
    Object.keys(inc.charts).forEach(k=>{
      const [c,r]=k.split('|'), to=cmap[c]+'|'+rmap[r], before=(cur.charts||{})[to]||{};
      const incCh={}; Object.keys(inc.charts[k]).forEach(s=>{incCh[s]=smaps[c][inc.charts[k][s]];});
      let next;
      if(merge){next=Object.assign({},before);
        const placed=new Set(Object.values(incCh));
        Object.keys(next).forEach(s=>{if(placed.has(next[s])) delete next[s];});   // a student moves, not duplicates
        Object.assign(next,incCh);}
      else next=incCh;
      const changed=new Set([...Object.keys(before),...Object.keys(next)].filter(s=>before[s]!==next[s])).size;
      res.charts[to]=next;
      if(changed) clines.push(`${inc.classes[c].name} · ${inc.rooms[r].name}: ${plural(changed,'seat')} change`);
    });
    Object.keys(res.charts).forEach(k=>{const [c,r]=k.split('|');
      if(!res.classes[c]||!res.rooms[r]){delete res.charts[k];return;}
      res.charts[k]=cleanChart(res.charts[k],res.rooms[r],res.classes[c],warn,`${res.classes[c].name} · ${res.rooms[r].name}`);
      if(!Object.keys(res.charts[k]).length) delete res.charts[k];});
    Object.keys(res.defaultRoom).forEach(c=>{if(!res.classes[c]||!res.rooms[res.defaultRoom[c]]) delete res.defaultRoom[c];});
    sum.push({title:'Seating charts',lines:clines.length?clines:['No seat changes']});

    // saved laps: added when the tablet doesn't have that day; differing days follow the mode
    const lapWrites={};
    if(incLaps&&Object.keys(incLaps).length){
      let add=0, same=0, keep=0, over=0;
      Object.keys(incLaps).forEach(k=>{
        const [c,r,day]=k.split('|'), smap=smaps[c]||{}, s=JSON.parse(JSON.stringify(incLaps[k]));
        const mv=o=>{const out={}; Object.keys(o||{}).forEach(x=>{out[x.startsWith('S:')?'S:'+(smap[x.slice(2)]||x.slice(2)):x]=o[x];}); return out;};
        s.laps.forEach(l=>{l.marks=mv(l.marks);}); s.off=mv(s.off); s.over=mv(s.over);
        Object.keys(s.over).forEach(x=>{if(s.over[x]) s.over[x]=smap[s.over[x]]||s.over[x];});
        const to=cmap[c]+'|'+rmap[r]+'|'+day, mine=curLaps&&curLaps[to];
        if(!mine){lapWrites[to]=s; add++;}
        else if(JSON.stringify(mine.laps)===JSON.stringify(s.laps)) same++;
        else if(merge) keep++;
        else{lapWrites[to]=s; over++;}
      });
      const l=[];
      if(add) l.push(`Adds ${plural(add,'day')} of laps`);
      if(same) l.push(`${plural(same,'day')} already match`);
      if(keep) l.push(`${plural(keep,'day')} differ; this tablet's copy is kept`);
      if(over) l.push(`${plural(over,'day')} differ; replaced with the file's copy`);
      sum.push({title:'Saved laps',lines:l.length?l:['Nothing to add']});
    }
    // school calendar: Replace takes the file's; Merge keeps this tablet's unless it has none
    const descCal=c=>c?`${c.start} to ${c.end}, ${c.periods.length} grading period${c.periods.length===1?'':'s'}`:'none';
    if(inc.calendar||cur.calendar){
      const useFile=inc.calendar&&(!merge||!cur.calendar);
      res.calendar=useFile?JSON.parse(JSON.stringify(inc.calendar)):(cur.calendar||null);
      if(useFile&&JSON.stringify(inc.calendar)!==JSON.stringify(cur.calendar||null)) sum.push({title:'School calendar',lines:[`Set to ${descCal(inc.calendar)}`]});
      else if(inc.calendar&&JSON.stringify(inc.calendar)!==JSON.stringify(cur.calendar)) sum.push({title:'School calendar',lines:['Kept this tablet\'s calendar (the file has a different one)']});
    }
    return {result:res,lapWrites,summary:sum,warnings:warn};
  }

  const api={exportDoc,parse,plan,FORMAT};
  if(typeof module!=='undefined') module.exports=api; else root.SetupBackup=api;
})(this);
