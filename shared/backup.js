/* Export / import of classroom setup (classes, rosters, rooms, seating charts).
   Import never trusts the file: it repairs what it can, skips what it can't,
   and shows a preview of every change before anything is saved. */
(function(root){
  const FORMAT=1;
  const lc=s=>String(s).trim().toLowerCase();
  const str=v=>typeof v==='string'?v.trim():(typeof v==='number'?String(v):'');
  const clampInt=(v,lo,hi,def)=>{const n=Math.round(Number(v));return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):def;};
  const rowLetter=i=>String.fromCharCode(65+i);

  function seatIds(room){
    if(!room) return new Set();
    if(room.type==='grid'){const s=new Set();for(let i=0;i<room.rows;i++)for(let j=0;j<room.cols;j++)s.add(rowLetter(i)+(j+1));return s;}
    if(room.type==='pods'){const s=new Set();for(let p=1;p<=room.pods;p++)for(let k=1;k<=room.size;k++)s.add('P'+p+'-'+k);return s;}
    return new Set();
  }
  const describeRoom=r=>r.type==='grid'?`${r.rows}×${r.cols} grid`:r.type==='pods'?`${r.pods} pods of ${r.size}`:'list';

  function exportDoc(d,build){
    return {app:'classroom-setup',format:FORMAT,exported:new Date().toISOString(),build:build||null,
      data:{classes:d.classes,rooms:d.rooms,defaultRoom:d.defaultRoom||{},charts:d.charts||{}}};
  }

  // ---- parse + repair -------------------------------------------------
  function parse(text){
    const warnings=[];
    if(typeof text!=='string'||!text.trim()) return {ok:false,error:'The file is empty.'};
    let t=text.replace(/^﻿/,'').trim(), raw;
    try{raw=JSON.parse(t);}catch(e){
      // tolerate stray text around the JSON (e.g. pasted from an email)
      const a=t.indexOf('{'), b=t.lastIndexOf('}');
      if(a>=0&&b>a){try{raw=JSON.parse(t.slice(a,b+1));warnings.push('Extra text around the backup was ignored.');}catch(e2){}}
      if(!raw) return {ok:false,error:"This file isn't a readable classroom backup. It may be cut off or damaged. Nothing was changed."};
    }
    const src=raw&&raw.data&&typeof raw.data==='object'?raw.data:raw;
    if(!src||typeof src!=='object'||(!src.classes&&!src.rooms)) return {ok:false,error:"This file doesn't contain classes or rooms. Nothing was changed."};
    if(raw.format&&raw.format>FORMAT) warnings.push('This backup was made by a newer version. Parts it does not understand were skipped.');
    const data=sanitize(src,warnings);
    return {ok:true,data,warnings,meta:{exported:raw.exported||null,build:raw.build||null}};
  }

  function sanitize(src,warnings){
    const out={classes:{},rooms:{},defaultRoom:{},charts:{}};
    // classes: accept an object keyed by id, or an array
    const cin=Array.isArray(src.classes)?Object.fromEntries(src.classes.map((c,i)=>[str(c&&c.id)||('c'+i),c])):(src.classes||{});
    let skipped=0;
    Object.keys(cin).forEach(id=>{
      const c=cin[id]; if(!c||typeof c!=='object'){skipped++;return;}
      const name=str(c.name)||str(id); if(!name){skipped++;return;}
      const seen=new Set(), students=[];
      (Array.isArray(c.students)?c.students:[]).forEach(s=>{const v=typeof s==='object'&&s?s.name:s; const n=typeof v==='string'?v.trim():''; if(!n){skipped++;return;} if(n&&!seen.has(lc(n))){seen.add(lc(n));students.push(n);} else if(n) warnings.push(`${name}: duplicate "${n}" removed.`);});
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
    if(skipped) warnings.push(`${skipped} damaged or unknown item${skipped>1?'s were':' was'} skipped.`);
    return out;
  }
  // keep only real seats, real students, and each student in one seat
  function cleanChart(ch,room,cls,warnings,label){
    const ok=seatIds(room), roster=new Map(cls.students.map(n=>[lc(n),n])), used=new Set(), out={};
    let dropped=0;
    Object.keys(ch).forEach(seat=>{
      const n=roster.get(lc(str(ch[seat])));
      if(!ok.has(seat)||!n||used.has(lc(n))){dropped++;return;}
      out[seat]=n; used.add(lc(n));
    });
    if(dropped&&warnings) warnings.push(`${label}: ${dropped} seat${dropped>1?'s':''} skipped (seat no longer exists, student not on roster, or listed twice).`);
    return out;
  }

  // ---- reconcile ------------------------------------------------------
  // Match file items to tablet items by id, then by name. Returns the new setup and a readable summary.
  function plan(cur,inc,mode){
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
    const cmap=matcher(cur.classes,inc.classes), rmap=matcher(cur.rooms,inc.rooms);

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

    // classes and rosters
    if(merge) Object.assign(res.classes,JSON.parse(JSON.stringify(cur.classes)));
    const incClsTargets=new Set(Object.values(cmap));
    Object.keys(inc.classes).forEach(id=>{
      const to=cmap[id], c=inc.classes[id], old=cur.classes[to], lines=[];
      if(!old){res.classes[to]={name:c.name,students:c.students.slice()}; lines.push(`New class with ${c.students.length} student${c.students.length===1?'':'s'}`);}
      else{
        if(old.name!==c.name) lines.push(`Renamed from ${old.name}`);
        const have=new Set(old.students.map(lc)), inFile=new Set(c.students.map(lc));
        const added=c.students.filter(n=>!have.has(lc(n))), onlyHere=old.students.filter(n=>!inFile.has(lc(n)));
        let students;
        if(merge){students=old.students.concat(added);}
        else students=c.students.slice();
        if(added.length) lines.push(`Adds ${added.length}: ${added.join(', ')}`);
        if(onlyHere.length) lines.push(`${merge?'Keeps':'Removes'} ${onlyHere.length} only on this tablet: ${onlyHere.join(', ')}`);
        if(!added.length&&!onlyHere.length&&old.name===c.name) lines.push('Roster already matches');
        res.classes[to]={name:c.name,students};
      }
      sum.push({title:'Class '+c.name,lines});
    });
    const goneCls=Object.keys(cur.classes).filter(k=>!incClsTargets.has(k));
    if(goneCls.length) sum.push({title:merge?'Kept (not in file)':'Removed classes',lines:goneCls.map(k=>`${cur.classes[k].name}${merge?'':' (its saved laps are kept)'}`)});
    if(!Object.keys(res.classes).length){res.classes=JSON.parse(JSON.stringify(cur.classes));warn.push('The file has no classes, so your classes were kept.');}
    if(!Object.keys(res.rooms).length){res.rooms=JSON.parse(JSON.stringify(cur.rooms));warn.push('The file has no rooms, so your rooms were kept.');}

    // usual rooms
    if(merge) Object.assign(res.defaultRoom,cur.defaultRoom||{});
    Object.keys(inc.defaultRoom).forEach(c=>{res.defaultRoom[cmap[c]]=rmap[inc.defaultRoom[c]];});

    // seating charts
    const clines=[];
    if(merge) Object.keys(cur.charts||{}).forEach(k=>{res.charts[k]=Object.assign({},cur.charts[k]);});
    Object.keys(inc.charts).forEach(k=>{
      const [c,r]=k.split('|'), to=cmap[c]+'|'+rmap[r], incCh=inc.charts[k], before=(cur.charts||{})[to]||{};
      let next;
      if(merge){next=Object.assign({},before);
        const placed=new Set(Object.values(incCh).map(lc));
        Object.keys(next).forEach(s=>{if(placed.has(lc(next[s]))) delete next[s];});   // a student moves, not duplicates
        Object.assign(next,incCh);}
      else next=Object.assign({},incCh);
      const changed=new Set([...Object.keys(before),...Object.keys(next)].filter(s=>before[s]!==next[s])).size;
      res.charts[to]=next;
      if(changed) clines.push(`${inc.classes[c].name} · ${inc.rooms[r].name}: ${changed} seat${changed>1?'s':''} change`);
    });
    // final check: every chart fits its room and roster
    Object.keys(res.charts).forEach(k=>{const [c,r]=k.split('|');
      if(!res.classes[c]||!res.rooms[r]){delete res.charts[k];return;}
      res.charts[k]=cleanChart(res.charts[k],res.rooms[r],res.classes[c],warn,`${res.classes[c].name} · ${res.rooms[r].name}`);
      if(!Object.keys(res.charts[k]).length) delete res.charts[k];});
    Object.keys(res.defaultRoom).forEach(c=>{if(!res.classes[c]||!res.rooms[res.defaultRoom[c]]) delete res.defaultRoom[c];});
    sum.push({title:'Seating charts',lines:clines.length?clines:['No seat changes']});
    return {result:res,summary:sum,warnings:warn};
  }

  const api={exportDoc,parse,plan,FORMAT};
  if(typeof module!=='undefined') module.exports=api; else root.SetupBackup=api;
})(this);
