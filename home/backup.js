/* Backup for Classroom Home: IEP goals and measurements, goal bank, student profiles, activity log, accommodations.
   Export to a file; import only adds or updates (nothing is deleted), with a preview and undo. CSVs for Sheets. */
(function(){
  const FORMAT=2, UNDO='home.undo';
  const TYPESET=new Set(['parent','student','behavior']), PERS=new Set(['week','month','period','quarter','year']), STAT=new Set(['active','met','paused','closed']);
  const DAY=/^\d{4}-\d{2}-\d{2}$/;
  const lc=s=>String(s).trim().toLowerCase();
  const str=(v,max)=>typeof v==='string'?v.trim().slice(0,max||4000):'';
  const int=(v,lo,hi,def)=>{const n=Math.round(+v);return Number.isFinite(n)&&n>=lo&&n<=hi?n:def;};
  const stamp=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes());};

  function exportText(){
    A=loadA(); C=loadC(); I=loadI(); D=Classroom.load();
    const names={}; Object.keys(D.classes).forEach(c=>{names[c]={name:D.classes[c].name,students:Object.fromEntries((D.classes[c].students||[]).map(s=>[s.id,s.name]))};});
    return JSON.stringify({app:'classroom-home',format:FORMAT,exported:new Date().toISOString(),build:(window.APP_VERSION||{}).n||null,names,
      iep:{bank:I.bank,goals:I.goals,data:I.data,profiles:I.profiles,codes:I.codes||{},settings:I.settings||{}},activity:A.entries,accommodations:C.students},null,2);
  }
  const fileOf=(ext,type)=>new File([exportText()],'classroom-home-'+stamp()+'.'+ext,{type});

  function exportSheet(){
    let canShare=false; try{canShare=!!(navigator.canShare&&navigator.canShare({files:[fileOf('txt','text/plain')]}));}catch(e){}
    const nG=Object.keys(I.goals).length;
    openSheet(`<h2>Export</h2><p class="hint" style="padding:0 6px">${plural(nG,'goal')}, ${plural(I.data.length,'measurement')}, ${plural(Object.keys(I.bank).length,'bank goal')}, ${plural(A.entries.length,'activity entry','activity entries')} and accommodations for ${plural(Object.keys(C.students).length,'student')}. All classes.</p>
      <div class="bar" style="padding:0 6px">${canShare?'<button class="primary" id="xShare">Share… (Drive, email)</button>':''}<button class="${canShare?'ghost':'primary'}" id="xSave">Save file</button><button class="plain" id="xCopy">Copy as text</button></div>
      <p class="hint" id="xMsg" style="padding:0 6px"></p><textarea id="xText" rows="5" readonly hidden style="margin:0 6px;font:12px var(--mono)"></textarea>
      <div class="sticky-actions"><button class="ghost" id="xClose">Close</button></div>`,
    el=>{const msg=m=>el.querySelector('#xMsg').textContent=m;
      if(canShare) el.querySelector('#xShare').addEventListener('click',async()=>{const f=fileOf('txt','text/plain');
        try{await navigator.share({files:[f],title:'Classroom Home backup'});msg('Shared '+f.name+'.');}
        catch(e){msg(e&&e.name==='AbortError'?'Share cancelled.':"Sharing didn't work here. Use Save file, then upload it from the Drive app.");}});
      el.querySelector('#xSave').addEventListener('click',()=>{const f=fileOf('json','application/json'),u=URL.createObjectURL(f),a=document.createElement('a');
        a.href=u;a.download=f.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);msg('Saving '+f.name+' to your Downloads.');});
      el.querySelector('#xCopy').addEventListener('click',()=>{const t=el.querySelector('#xText');t.value=exportText();
        const ok=()=>msg('Copied.');if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t.value).then(ok).catch(()=>{t.hidden=false;t.select();});else{t.hidden=false;t.select();}});
      el.querySelector('#xClose').addEventListener('click',closeSheet);});
  }

  // ---- read and repair a file
  const cleanCrit=c=>Object.assign({pct:int(c&&c.pct,1,100,80),x:int(c&&c.x,1,20,4),y:int(c&&c.y,1,20,5)},c&&c.trials===false?{trials:false}:{});
  const cleanSched=s=>({n:int(s&&s.n,1,20,1),per:PERS.has(s&&s.per)?s.per:'month'});
  const cleanMeth=m=>Array.isArray(m)?[...new Set(m.map(x=>str(x,80)).filter(Boolean))]:[];
  function parse(text){
    const warn=[]; if(typeof text!=='string'||!text.trim()) return {ok:false,error:'The file is empty.'};
    let t=text.replace(/^﻿/,'').trim(), raw;
    try{raw=JSON.parse(t);}catch(e){const a=t.indexOf('{'),b=t.lastIndexOf('}');
      if(a>=0&&b>a){try{raw=JSON.parse(t.slice(a,b+1));warn.push('Extra text around the backup was ignored.');}catch(e2){}}}
    if(!raw||typeof raw!=='object') return {ok:false,error:"This file isn't a readable backup. It may be cut off or damaged. Nothing was changed."};
    if(raw.app==='classroom-setup') return {ok:false,error:'This is a Classroom setup backup. Import it from Classroom setup → Backup.'};
    if(raw.app==='classroom-goals') return {ok:false,error:'This is a backup from the old Student goals app, which has been replaced. Its goals use a different format and can\'t be imported here.'};
    if(!raw.activity&&!raw.accommodations&&!raw.iep) return {ok:false,error:"This file doesn't contain anything Home can import. Nothing was changed."};
    if(raw.format&&raw.format>FORMAT) warn.push('This backup was made by a newer version. Parts it does not understand were skipped.');
    let bad=0; const entries=[], acc={}, bank={}, goals={}, data=[], profiles={};
    (Array.isArray(raw.activity)?raw.activity:[]).forEach(e=>{
      if(!e||typeof e!=='object'||!str(e.id)||!str(e.cls)||!TYPESET.has(e.type)||!DAY.test(e.date||'')||!Array.isArray(e.sids)){bad++;return;}
      const o={id:str(e.id),cls:str(e.cls),type:e.type,sids:[...new Set(e.sids.filter(s=>typeof s==='string'&&s))],date:e.date,summary:str(e.summary),outcome:str(e.outcome),updated:+e.updated||0};
      if(!o.sids.length){bad++;return;}
      if(e.type==='parent'){o.method=str(e.method,30)||'Call'; o.with=str(e.with,100);}
      if(e.fu&&typeof e.fu==='object'&&DAY.test(e.fu.date||'')) o.fu=Object.assign({date:e.fu.date,text:str(e.fu.text,300),done:!!e.fu.done},DAY.test(e.fu.doneDate||'')?{doneDate:e.fu.doneDate}:{});
      entries.push(o);});
    Object.keys(raw.accommodations||{}).forEach(sid=>{const l=raw.accommodations[sid]; if(!Array.isArray(l)){bad++;return;}
      const seen=new Set(), out=[]; l.forEach(a=>{const tx=str(a&&a.text,200); if(!tx||seen.has(lc(tx))) return; seen.add(lc(tx)); out.push({id:str(a.id)||('c'+Math.random().toString(36).slice(2,9)),text:tx,note:str(a.note,200)});});
      if(out.length) acc[sid]=out;});
    const ip=raw.iep||{};
    Object.values(ip.bank||{}).forEach(b=>{if(!b||!str(b.id)||!str(b.text)){bad++;return;}
      bank[b.id]={id:str(b.id),area:str(b.area,60),text:str(b.text),criteria:cleanCrit(b.criteria),methods:cleanMeth(b.methods),sched:cleanSched(b.sched),updated:+b.updated||0};});
    Object.values(ip.goals||{}).forEach(g=>{if(!g||!str(g.id)||!str(g.sid)||!str(g.text)){bad++;return;}
      goals[g.id]={id:str(g.id),sid:str(g.sid),cls:str(g.cls),bank:str(g.bank)||null,area:str(g.area,60),text:str(g.text),criteria:cleanCrit(g.criteria),methods:cleanMeth(g.methods),sched:cleanSched(g.sched),
        start:DAY.test(g.start||'')?g.start:'',end:DAY.test(g.end||'')?g.end:'',status:STAT.has(g.status)?g.status:'active',plan:DAY.test(g.plan||'')?g.plan:'',updated:+g.updated||0};
      if(+g.created>0) goals[g.id].created=+g.created;
      if(g.status==='met'&&DAY.test(g.metDate||'')) goals[g.id].metDate=g.metDate;});
    (Array.isArray(ip.data)?ip.data:[]).forEach(p=>{if(!p||!str(p.id)||!str(p.goal)||!DAY.test(p.date||'')||!(+p.pct>=0&&+p.pct<=100)||(!goals[p.goal]&&!I.goals[p.goal])){bad++;return;}
      const o={id:str(p.id),goal:str(p.goal),sid:str(p.sid),date:p.date,pct:Math.round(+p.pct),method:str(p.method,80),note:str(p.note,1000),t:+p.t||0};
      if(int(p.total,1,100,0)&&int(p.correct,0,+p.total,-1)>=0){o.total=+p.total;o.correct=+p.correct;}
      data.push(o);});
    Object.keys(ip.profiles||{}).forEach(sid=>{const p=ip.profiles[sid]; if(!p||typeof p!=='object') return;
      profiles[sid]=Object.assign({iepDate:DAY.test(p.iepDate||'')?p.iepDate:'',reviewDate:DAY.test(p.reviewDate||'')?p.reviewDate:'',notes:str(p.notes,20000),updated:+p.updated||0},int(p.day,1,5,0)?{day:+p.day}:{});});
    const codes={}; Object.keys(ip.codes||{}).forEach(sid=>{const c=str(ip.codes[sid],6); if(/^[A-Z]{1,4}$/.test(c)) codes[sid]=c;});
    if(bad) warn.push(`${plural(bad,'damaged item')} ${bad===1?'was':'were'} skipped.`);
    const settings={}; const st=(ip.settings||{}); if(int(st.cap,0,50,-1)>=0) settings.cap=+st.cap;
    return {ok:true,settings,codes,entries,acc,bank,goals,data,profiles,names:raw.names||{},warn,exported:raw.exported||null};
  }

  // ---- line up classes and students with this tablet: by id, then by name
  function plan(f){
    D=Classroom.load(); A=loadA(); C=loadC(); I=loadI();
    const warn=f.warn.slice(), cmap={};
    const classOfSid={}; Object.keys(f.names).forEach(c=>Object.keys(f.names[c].students||{}).forEach(s=>{classOfSid[s]=c;}));
    const needCls=new Set([...f.entries.map(e=>e.cls),...Object.keys(f.acc).map(s=>classOfSid[s]),...Object.values(f.goals).map(g=>g.cls||classOfSid[g.sid]),...Object.keys(f.profiles).map(s=>classOfSid[s])].filter(Boolean));
    needCls.forEach(c=>{let to=D.classes[c]?c:null;
      if(!to&&f.names[c]){const n=lc(f.names[c].name); to=Object.keys(D.classes).find(k=>lc(D.classes[k].name)===n)||null;}
      cmap[c]=to; if(!to) warn.push(`Class "${(f.names[c]||{}).name||c}" isn't on this tablet, so its students' data was skipped. Add the class in Classroom setup first.`);});
    const mapSid=(c,sid)=>{c=c||classOfSid[sid]; const to=c&&cmap[c];
      if(!to){return Object.keys(D.classes).some(k=>(D.classes[k].students||[]).some(s=>s.id===sid))?sid:null;}
      const r=D.classes[to].students||[]; if(r.some(s=>s.id===sid)) return sid;
      const nm=((f.names[c]||{}).students||{})[sid]; const m=nm&&r.find(s=>lc(s.name)===lc(nm)); return m?m.id:null;};
    let lost=new Set();
    const pick=(curObj,id,n)=>{const cur=curObj[id]; if(!cur) return 'new'; if(JSON.stringify(cur)===JSON.stringify(n)) return 'same'; return (n.updated||0)>(cur.updated||0)?'upd':'same';};
    const res={entries:A.entries.slice(),students:JSON.parse(JSON.stringify(C.students)),bank:Object.assign({},I.bank),goals:Object.assign({},I.goals),data:I.data.slice(),profiles:Object.assign({},I.profiles)};
    const cnt={eN:0,eU:0,bN:0,bU:0,gN:0,gU:0,dN:0,pN:0,aN:0,aS:0};
    // activity
    const byId=new Map(res.entries.map((e,i)=>[e.id,i]));
    f.entries.forEach(e=>{const to=cmap[e.cls]; if(!to) return; const sids=e.sids.map(s=>mapSid(e.cls,s)).filter(Boolean); if(!sids.length) return;
      const n=Object.assign({},e,{cls:to,sids});
      if(!byId.has(e.id)){res.entries.push(n);cnt.eN++;} else{const i=byId.get(e.id); if(pick({x:res.entries[i]},'x',n)==='upd'){res.entries[i]=n;cnt.eU++;}}});
    // bank
    Object.values(f.bank).forEach(b=>{const k=pick(res.bank,b.id,b); if(k==='new'){res.bank[b.id]=b;cnt.bN++;} else if(k==='upd'){res.bank[b.id]=b;cnt.bU++;}});
    // goals and measurements
    const gmap={};
    Object.values(f.goals).forEach(g=>{const sid=mapSid(g.cls,g.sid); if(!sid){lost.add(g.sid);return;}
      const n=Object.assign({},g,{sid,cls:Object.keys(D.classes).find(k=>(D.classes[k].students||[]).some(s=>s.id===sid))||g.cls}); gmap[g.id]=n;
      const k=pick(res.goals,g.id,n); if(k==='new'){res.goals[g.id]=n;cnt.gN++;} else if(k==='upd'){res.goals[g.id]=n;cnt.gU++;}});
    const haveD=new Set(res.data.map(p=>p.id));
    f.data.forEach(p=>{const g=gmap[p.goal]||res.goals[p.goal]; if(!g||haveD.has(p.id)) return; res.data.push(Object.assign({},p,{sid:g.sid})); haveD.add(p.id); cnt.dN++;});
    // profiles: newer edit wins
    Object.keys(f.profiles).forEach(s=>{const sid=mapSid(null,s); if(!sid){lost.add(s);return;} const n=f.profiles[s], cur=res.profiles[sid];
      if(!cur||((n.updated||0)>(cur.updated||0)&&JSON.stringify(cur)!==JSON.stringify(n))){res.profiles[sid]=n;cnt.pN++;}});
    // accommodations: add any not already listed
    Object.keys(f.acc).forEach(s=>{const sid=mapSid(null,s); if(!sid){lost.add(s);return;} const list=res.students[sid]||[]; let added=0;
      f.acc[s].forEach(a=>{if(!list.some(x=>lc(x.text)===lc(a.text))){list.push(a);added++;}}); if(added){res.students[sid]=list;cnt.aS++;cnt.aN+=added;}});
    // report codes: keep this tablet's; take the file's for students who have none, unless that code is taken
    res.codes=Object.assign({},I.codes||{}); const usedC=new Set(Object.values(res.codes));
    Object.keys(f.codes||{}).forEach(s=>{const sid=mapSid(null,s); if(sid&&!res.codes[sid]&&!usedC.has(f.codes[s])){res.codes[sid]=f.codes[s]; usedC.add(f.codes[s]);}});
    // settings: keep this tablet's daily limit; take the file's only if none is set here
    res.settings=Object.assign({},f.settings||{},I.settings||{});
    if(lost.size) warn.push(`Data for ${plural(lost.size,'student')} not on this tablet's rosters was skipped.`);
    const L=[];
    if(cnt.gN||cnt.gU) L.push(`Goals: ${cnt.gN} new${cnt.gU?', '+cnt.gU+' updated':''}`);
    if(cnt.dN) L.push(`Measurements: ${cnt.dN} new`);
    if(cnt.bN||cnt.bU) L.push(`Goal bank: ${cnt.bN} new${cnt.bU?', '+cnt.bU+' updated':''}`);
    if(cnt.pN) L.push(`Profiles (IEP dates, notes): ${cnt.pN} updated`);
    if(cnt.eN||cnt.eU) L.push(`Activity log: ${cnt.eN} new${cnt.eU?', '+cnt.eU+' updated':''}`);
    if(cnt.aN) L.push(`Accommodations: ${cnt.aN} added for ${plural(cnt.aS,'student')}`);
    if(!L.length) L.push('Everything in this file is already on this tablet.');
    return {res,lines:L,warn,changes:cnt.gN+cnt.gU+cnt.dN+cnt.bN+cnt.bU+cnt.pN+cnt.eN+cnt.eU+cnt.aN};
  }

  function importSheet(){
    openSheet(`<h2>Import</h2><p class="hint" style="padding:0 6px">Adds goals, measurements, activity and accommodations from a backup. Nothing on this tablet is deleted, and you'll see the changes before saving.</p>
      <div class="bar" style="padding:0 6px"><label class="btn primary" for="iFile">Choose file…</label><input type="file" id="iFile" accept=".json,.txt,application/json,text/plain" hidden><button class="plain" id="iPasteB">Paste instead…</button></div>
      <div class="field" id="iPaste" hidden><textarea id="iText" rows="6" style="font:13px var(--mono)"></textarea><button class="ghost" id="iRead">Check this backup</button></div>
      <div id="iErr" class="note bad" hidden style="margin:0 6px"></div><div id="iPrev" hidden style="display:flex;flex-direction:column;gap:6px;padding:0 6px"></div>
      <div id="iUndo" class="note" hidden style="margin:0 6px"></div>
      <div class="sticky-actions"><button class="ghost" id="iClose">Close</button><button class="primary" id="iApply" hidden>Import</button></div>`,
    el=>{let pl=null, u=null;
      try{u=JSON.parse(localStorage.getItem(UNDO));}catch(e){}
      if(u&&u.i){const b=el.querySelector('#iUndo'); b.hidden=false;
        b.innerHTML=`Last import: ${esc(new Date(u.at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}. <button class="ghost" id="iUndoB" style="margin-left:8px">Undo it</button>`;
        b.querySelector('#iUndoB').addEventListener('click',()=>{A=u.a;C=u.c;I=u.i;saveA();saveC();saveI();try{localStorage.removeItem(UNDO);}catch(e){}closeSheet();toast('Import undone');render();});}
      const check=text=>{const err=el.querySelector('#iErr'),prev=el.querySelector('#iPrev'); err.hidden=true; prev.hidden=true; el.querySelector('#iApply').hidden=true;
        const f=parse(text); if(!f.ok){err.textContent=f.error;err.hidden=false;return;}
        pl=plan(f); el.querySelector('#iPaste').hidden=true;
        prev.innerHTML=(f.exported?`<div class="hint">Backup from ${esc(new Date(f.exported).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}))}.</div>`:'')+
          `<div class="note"><ul style="margin:0;padding-left:18px">${pl.lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul></div>`+
          (pl.warn.length?`<div class="note" style="border:1.5px solid var(--part);background:transparent"><b>Fixed or skipped</b><ul style="margin:4px 0 0;padding-left:18px">${pl.warn.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>`:'');
        prev.hidden=false; el.querySelector('#iApply').hidden=!pl.changes;};
      el.querySelector('#iFile').addEventListener('change',e=>{const file=e.target.files&&e.target.files[0]; if(!file) return;
        if(file.size>15e6){const x=el.querySelector('#iErr');x.textContent='That file is too large to be a backup.';x.hidden=false;return;}
        const rd=new FileReader(); rd.onload=()=>check(String(rd.result)); rd.readAsText(file);});
      el.querySelector('#iPasteB').addEventListener('click',()=>{el.querySelector('#iPaste').hidden=false;el.querySelector('#iText').focus();});
      el.querySelector('#iRead').addEventListener('click',()=>check(el.querySelector('#iText').value));
      el.querySelector('#iClose').addEventListener('click',closeSheet);
      el.querySelector('#iApply').addEventListener('click',()=>{if(!pl) return;
        try{localStorage.setItem(UNDO,JSON.stringify({at:Date.now(),a:loadA(),c:loadC(),i:loadI()}));}catch(e){}
        A=loadA(); A.entries=pl.res.entries; C=loadC(); C.students=pl.res.students;
        I=loadI(); I.bank=pl.res.bank; I.goals=pl.res.goals; I.data=pl.res.data; I.profiles=pl.res.profiles; I.codes=pl.res.codes; I.settings=pl.res.settings;
        saveA(); saveC(); saveI(); closeSheet(); toast('Import finished'); render();});
    });
  }

  function csvOut(rows,title,count){
    const text=rows.join('\n');
    const done=()=>{closeSheet();toast('Copied '+plural(count,'row')+'. Paste into a Google Sheet.');};
    const show=()=>openSheet(`<h2>${esc(title)}</h2><textarea id="cT" rows="10" readonly style="margin:0 6px;font:12px var(--mono)">${esc(text)}</textarea><div class="sticky-actions"><button class="ghost" id="cC">Close</button></div>`,
      el=>{el.querySelector('#cT').select();el.querySelector('#cC').addEventListener('click',closeSheet);});
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(show); else show();
  }
  const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  function copyCsv(){
    A=loadA(); D=Classroom.load();
    const rows=[['date','class','type','students','how','with','summary','outcome','follow-up date','follow-up','follow-up done'].join(',')];
    A.entries.slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.updated||0)-(b.updated||0)).forEach(e=>{
      rows.push([e.date,q((D.classes[e.cls]||{}).name||''),e.type,q(names(e.sids).replace(/, /g,'; ')),q(e.method||''),q(e.with||''),q(e.summary||''),q(e.outcome||''),
        e.fu?e.fu.date:'',q(e.fu?e.fu.text:''),e.fu?(e.fu.done?'yes':'no'):''].join(','));});
    csvOut(rows,'Activity log as CSV',rows.length-1);
  }
  function copyMeasureCsv(){
    I=loadI(); D=Classroom.load();
    const rows=[['date','class','student','area','goal','score %','correct','total','met target','method','note'].join(',')];
    I.data.slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.t||0)-(b.t||0)).forEach(p=>{const g=I.goals[p.goal]; if(!g) return; const nm=nameAny(g.sid);
      rows.push([p.date,q((D.classes[classOf(g.sid)]||{}).name||''),q(nm),q(g.area||''),q(IEP.fill(g.text,nm)),p.pct,p.total!=null?p.correct:'',p.total!=null?p.total:'',p.pct>=((g.criteria&&g.criteria.pct)||80)?'yes':'no',q(p.method||''),q(p.note||'')].join(','));});
    csvOut(rows,'Measurements as CSV',rows.length-1);
  }
  window.HomeBackup={exportSheet,importSheet,copyCsv,copyMeasureCsv,parse,plan};
})();
