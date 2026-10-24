/* Backup for Classroom Home: activity log and accommodations.
   Export to a file; import only adds or updates (nothing is deleted), with a preview and undo. CSV of the activity log. */
(function(){
  const FORMAT=1, UNDO='home.undo';
  const TYPES=new Set(['parent','student','behavior']);
  const DAY=/^\d{4}-\d{2}-\d{2}$/;
  const lc=s=>String(s).trim().toLowerCase();
  const str=(v,max)=>typeof v==='string'?v.trim().slice(0,max||2000):'';
  const stamp=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes());};

  function exportText(){
    A=loadA(); C=loadC(); D=Classroom.load();
    const names={}; Object.keys(D.classes).forEach(c=>{names[c]={name:D.classes[c].name,students:Object.fromEntries((D.classes[c].students||[]).map(s=>[s.id,s.name]))};});
    return JSON.stringify({app:'classroom-home',format:FORMAT,exported:new Date().toISOString(),build:(window.APP_VERSION||{}).n||null,names,activity:A.entries,accommodations:C.students},null,2);
  }
  const fileOf=(ext,type)=>new File([exportText()],'classroom-home-'+stamp()+'.'+ext,{type});

  function exportSheet(){
    let canShare=false; try{canShare=!!(navigator.canShare&&navigator.canShare({files:[fileOf('txt','text/plain')]}));}catch(e){}
    openSheet(`<h2>Export</h2><p class="hint" style="padding:0 6px">${A.entries.length} activity entr${A.entries.length===1?'y':'ies'} and accommodations for ${Object.keys(C.students).length} students, all classes.</p>
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

  function parse(text){
    const warn=[]; if(typeof text!=='string'||!text.trim()) return {ok:false,error:'The file is empty.'};
    let t=text.replace(/^﻿/,'').trim(), raw;
    try{raw=JSON.parse(t);}catch(e){const a=t.indexOf('{'),b=t.lastIndexOf('}');
      if(a>=0&&b>a){try{raw=JSON.parse(t.slice(a,b+1));warn.push('Extra text around the backup was ignored.');}catch(e2){}}}
    if(!raw||typeof raw!=='object') return {ok:false,error:"This file isn't a readable backup. It may be cut off or damaged. Nothing was changed."};
    if(raw.app==='classroom-setup') return {ok:false,error:'This is a Classroom setup backup. Import it from Classroom setup → Backup.'};
    if(raw.app==='classroom-goals') return {ok:false,error:'This is a Student goals backup. Import it from the Goals app.'};
    if(!raw.activity&&!raw.accommodations) return {ok:false,error:"This file doesn't contain an activity log or accommodations. Nothing was changed."};
    let bad=0; const entries=[], acc={};
    (Array.isArray(raw.activity)?raw.activity:[]).forEach(e=>{
      if(!e||typeof e!=='object'||!str(e.id)||!str(e.cls)||!TYPES.has(e.type)||!DAY.test(e.date||'')||!Array.isArray(e.sids)){bad++;return;}
      const o={id:str(e.id),cls:str(e.cls),type:e.type,sids:[...new Set(e.sids.filter(s=>typeof s==='string'&&s))],date:e.date,summary:str(e.summary),outcome:str(e.outcome),updated:+e.updated||0};
      if(!o.sids.length){bad++;return;}
      if(e.type==='parent'){o.method=str(e.method,30)||'Call'; o.with=str(e.with,100);}
      if(e.fu&&typeof e.fu==='object'&&DAY.test(e.fu.date||'')) o.fu={date:e.fu.date,text:str(e.fu.text,300),done:!!e.fu.done,...(DAY.test(e.fu.doneDate||'')?{doneDate:e.fu.doneDate}:{})};
      entries.push(o);
    });
    Object.keys(raw.accommodations||{}).forEach(sid=>{const l=raw.accommodations[sid]; if(!Array.isArray(l)){bad++;return;}
      const seen=new Set(), out=[]; l.forEach(a=>{const tx=str(a&&a.text,200); if(!tx||seen.has(lc(tx))) return; seen.add(lc(tx)); out.push({id:str(a.id)||('c'+Math.random().toString(36).slice(2,9)),text:tx,note:str(a.note,200)});});
      if(out.length) acc[sid]=out;});
    if(bad) warn.push(`${bad} damaged item${bad>1?'s were':' was'} skipped.`);
    return {ok:true,entries,acc,names:raw.names||{},warn,exported:raw.exported||null};
  }

  // line up classes and students with this tablet: by id, then by name
  function plan(f){
    D=Classroom.load(); A=loadA(); C=loadC();
    const warn=f.warn.slice(), cmap={}, smap={};
    const classOfSid={}; Object.keys(f.names).forEach(c=>Object.keys(f.names[c].students||{}).forEach(s=>{classOfSid[s]=c;}));
    const fileCls=new Set([...f.entries.map(e=>e.cls),...Object.keys(f.acc).map(s=>classOfSid[s]).filter(Boolean)]);
    fileCls.forEach(c=>{let to=D.classes[c]?c:null;
      if(!to&&f.names[c]){const n=lc(f.names[c].name); to=Object.keys(D.classes).find(k=>lc(D.classes[k].name)===n)||null;}
      cmap[c]=to; if(!to) warn.push(`Class "${(f.names[c]||{}).name||c}" isn't on this tablet, so its entries were skipped.`);});
    const mapSid=(c,sid)=>{const to=cmap[c]; if(!to) return null; const r=D.classes[to].students||[];
      if(r.some(s=>s.id===sid)) return sid; const nm=((f.names[c]||{}).students||{})[sid]; const m=nm&&r.find(s=>lc(s.name)===lc(nm)); return m?m.id:sid;};
    const entries=A.entries.slice(); const byId=new Map(entries.map((e,i)=>[e.id,i]));
    let eNew=0,eUpd=0,eSame=0,aStu=0,aAdd=0,lost=0;
    f.entries.forEach(e=>{const to=cmap[e.cls]; if(!to) return;
      const n=Object.assign({},e,{cls:to,sids:e.sids.map(s=>mapSid(e.cls,s))});
      if(!byId.has(e.id)){entries.push(n);eNew++;}
      else{const cur=entries[byId.get(e.id)]; if(JSON.stringify(cur)===JSON.stringify(n)) eSame++; else if((n.updated||0)>(cur.updated||0)){entries[byId.get(e.id)]=n;eUpd++;} else eSame++;}});
    const students=JSON.parse(JSON.stringify(C.students));
    Object.keys(f.acc).forEach(sid=>{const c=classOfSid[sid]; const to=c?mapSid(c,sid):(Object.keys(D.classes).some(k=>(D.classes[k].students||[]).some(s=>s.id===sid))?sid:null);
      if(!to){lost++;return;}
      const list=students[to]||[]; let added=0;
      f.acc[sid].forEach(a=>{if(!list.some(x=>lc(x.text)===lc(a.text))){list.push(a);added++;}});
      if(added){students[to]=list;aStu++;aAdd+=added;}});
    if(lost) warn.push(`Accommodations for ${lost} student${lost>1?'s':''} not on this tablet were skipped.`);
    const lines=[`Activity log: ${eNew} new${eUpd?', '+eUpd+' updated (the file had newer edits)':''}${eSame?', '+eSame+' already here':''}`,
      aAdd?`Accommodations: ${aAdd} added for ${aStu} student${aStu===1?'':'s'}`:'Accommodations: nothing new'];
    return {res:{entries,students},lines,warn,changes:eNew+eUpd+aAdd};
  }

  function importSheet(){
    openSheet(`<h2>Import</h2><p class="hint" style="padding:0 6px">Adds activity entries and accommodations from a backup. Nothing on this tablet is deleted, and you'll see the changes before saving.</p>
      <div class="bar" style="padding:0 6px"><label class="btn primary" for="iFile">Choose file…</label><input type="file" id="iFile" accept=".json,.txt,application/json,text/plain" hidden><button class="plain" id="iPasteB">Paste instead…</button></div>
      <div class="field" id="iPaste" hidden><textarea id="iText" rows="6" style="font:13px var(--mono)"></textarea><button class="ghost" id="iRead">Check this backup</button></div>
      <div id="iErr" class="note bad" hidden style="margin:0 6px"></div><div id="iPrev" hidden style="display:flex;flex-direction:column;gap:6px;padding:0 6px"></div>
      <div id="iUndo" class="note" hidden style="margin:0 6px"></div>
      <div class="sticky-actions"><button class="ghost" id="iClose">Close</button><button class="primary" id="iApply" hidden>Import</button></div>`,
    el=>{let pl=null;
      let u=null; try{u=JSON.parse(localStorage.getItem(UNDO));}catch(e){}
      if(u){const b=el.querySelector('#iUndo'); b.hidden=false;
        b.innerHTML=`Last import: ${esc(new Date(u.at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}. <button class="ghost" id="iUndoB" style="margin-left:8px">Undo it</button>`;
        b.querySelector('#iUndoB').addEventListener('click',()=>{A=u.a;C=u.c;saveA();saveC();try{localStorage.removeItem(UNDO);}catch(e){}closeSheet();toast('Import undone');render();});}
      const check=text=>{const err=el.querySelector('#iErr'),prev=el.querySelector('#iPrev'); err.hidden=true; prev.hidden=true; el.querySelector('#iApply').hidden=true;
        const f=parse(text); if(!f.ok){err.textContent=f.error;err.hidden=false;return;}
        pl=plan(f); el.querySelector('#iPaste').hidden=true;
        prev.innerHTML=(f.exported?`<div class="hint">Backup from ${esc(new Date(f.exported).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}))}.</div>`:'')+
          `<div class="note"><ul style="margin:0;padding-left:18px">${pl.lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul></div>`+
          (pl.warn.length?`<div class="note" style="border:1.5px solid var(--part);background:transparent"><b>Fixed or skipped</b><ul style="margin:4px 0 0;padding-left:18px">${pl.warn.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>`:'');
        prev.hidden=false; el.querySelector('#iApply').hidden=!pl.changes;};
      el.querySelector('#iFile').addEventListener('change',e=>{const file=e.target.files&&e.target.files[0]; if(!file) return;
        if(file.size>8e6){const x=el.querySelector('#iErr');x.textContent='That file is too large to be a backup.';x.hidden=false;return;}
        const rd=new FileReader(); rd.onload=()=>check(String(rd.result)); rd.readAsText(file);});
      el.querySelector('#iPasteB').addEventListener('click',()=>{el.querySelector('#iPaste').hidden=false;el.querySelector('#iText').focus();});
      el.querySelector('#iRead').addEventListener('click',()=>check(el.querySelector('#iText').value));
      el.querySelector('#iClose').addEventListener('click',closeSheet);
      el.querySelector('#iApply').addEventListener('click',()=>{if(!pl) return;
        try{localStorage.setItem(UNDO,JSON.stringify({at:Date.now(),a:loadA(),c:loadC()}));}catch(e){}
        A=loadA(); A.entries=pl.res.entries; C=loadC(); C.students=pl.res.students; saveA(); saveC(); closeSheet(); toast('Import finished'); render();});
    });
  }

  function copyCsv(){
    A=loadA(); D=Classroom.load();
    const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const nm=sid=>{for(const c of Object.keys(D.classes)){const n=Classroom.nameOf(D,c,sid); if(n) return n;} return '(removed student)';};
    const rows=[['date','class','type','students','how','with','summary','outcome','follow-up date','follow-up','follow-up done'].join(',')];
    A.entries.slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.updated||0)-(b.updated||0)).forEach(e=>{
      rows.push([e.date,q((D.classes[e.cls]||{}).name||''),e.type,q((e.sids||[]).map(nm).join('; ')),q(e.method||''),q(e.with||''),q(e.summary||''),q(e.outcome||''),
        e.fu?e.fu.date:'',q(e.fu?e.fu.text:''),e.fu?(e.fu.done?'yes':'no'):''].join(','));});
    const text=rows.join('\n');
    const done=()=>{closeSheet();toast('Copied '+(rows.length-1)+' entries. Paste into a Google Sheet.');};
    const show=()=>openSheet(`<h2>Activity log as CSV</h2><textarea id="cT" rows="10" readonly style="margin:0 6px;font:12px var(--mono)">${esc(text)}</textarea><div class="sticky-actions"><button class="ghost" id="cC">Close</button></div>`,
      el=>{el.querySelector('#cT').select();el.querySelector('#cC').addEventListener('click',closeSheet);});
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(show); else show();
  }
  window.HomeBackup={exportSheet,importSheet,copyCsv,parse,plan};
})();
