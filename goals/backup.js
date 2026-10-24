/* Goals backup: export, careful import (merge with preview and undo), and CSV of logs.
   Import never trusts the file: it keeps what it can read, skips the rest, and shows what will change. */
(function(){
  const FORMAT=1, UNDO='goals.undo';
  const KINDS=new Set(['trials','yesno','note']), CADS=new Set(['daily','twice','weekly','biweekly','monthly']);
  const DAY=/^\d{4}-\d{2}-\d{2}$/;
  const lc=s=>String(s).trim().toLowerCase();
  const str=(v,max)=>typeof v==='string'?v.trim().slice(0,max||500):'';
  const stamp=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes());};

  function exportText(){
    G=loadG(); D=Classroom.load();
    // include class and student names so a tablet with different ids can still line things up
    const names={}; Object.keys(D.classes).forEach(c=>{names[c]={name:D.classes[c].name,students:Object.fromEntries((D.classes[c].students||[]).map(s=>[s.id,s.name]))};});
    return JSON.stringify({app:'classroom-goals',format:FORMAT,exported:new Date().toISOString(),build:(window.APP_VERSION||{}).n||null,
      names,goals:G.goals,groups:G.groups,logs:G.logs},null,2);
  }
  const fileOf=(ext,type)=>new File([exportText()],'classroom-goals-'+stamp()+'.'+ext,{type});

  window.exportSheet=function(){
    const nG=Object.keys(G.goals).length, nL=G.logs.length;
    let canShare=false; try{canShare=!!(navigator.canShare&&navigator.canShare({files:[fileOf('txt','text/plain')]}));}catch(e){}
    openSheet(`<h2>Export goals</h2><p class="hint" style="padding:0 6px">${nG} goal${nG===1?'':'s'}, ${Object.keys(G.groups).length} groups and ${nL} log entr${nL===1?'y':'ies'}, for every class.</p>
      <div class="bar" style="padding:0 6px">${canShare?'<button class="primary" id="xShare">Share… (Drive, email)</button>':''}<button class="${canShare?'ghost':'primary'}" id="xSave">Save file</button><button class="plain" id="xCopy">Copy as text</button></div>
      <p class="hint" id="xMsg" style="padding:0 6px"></p><textarea id="xText" rows="5" readonly hidden style="margin:0 6px;font:12px var(--mono)"></textarea>
      <div class="sticky-actions"><button class="ghost" id="xClose">Close</button></div>`,
    el=>{const msg=m=>el.querySelector('#xMsg').textContent=m;
      if(canShare) el.querySelector('#xShare').addEventListener('click',async()=>{const f=fileOf('txt','text/plain');
        try{await navigator.share({files:[f],title:'Classroom goals backup'});msg('Shared '+f.name+'.');}
        catch(e){msg(e&&e.name==='AbortError'?'Share cancelled.':"Sharing didn't work here. Use Save file, then upload it from the Drive app.");}});
      el.querySelector('#xSave').addEventListener('click',()=>{const f=fileOf('json','application/json'),u=URL.createObjectURL(f),a=document.createElement('a');
        a.href=u;a.download=f.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);msg('Saving '+f.name+' to your Downloads.');});
      el.querySelector('#xCopy').addEventListener('click',()=>{const t=el.querySelector('#xText');t.value=exportText();
        const ok=()=>msg('Copied.');if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t.value).then(ok).catch(()=>{t.hidden=false;t.select();});else{t.hidden=false;t.select();}});
      el.querySelector('#xClose').addEventListener('click',closeSheet);});
  };

  // ---- parse and repair
  function parse(text){
    const warn=[]; if(typeof text!=='string'||!text.trim()) return {ok:false,error:'The file is empty.'};
    let t=text.replace(/^﻿/,'').trim(), raw;
    try{raw=JSON.parse(t);}catch(e){const a=t.indexOf('{'),b=t.lastIndexOf('}');
      if(a>=0&&b>a){try{raw=JSON.parse(t.slice(a,b+1));warn.push('Extra text around the backup was ignored.');}catch(e2){}}}
    if(!raw||typeof raw!=='object') return {ok:false,error:"This file isn't a readable goals backup. It may be cut off or damaged. Nothing was changed."};
    if(raw.app==='classroom-setup') return {ok:false,error:'This is a Classroom setup backup. Import it from Classroom setup → Backup instead.'};
    if(!raw.goals&&!raw.logs) return {ok:false,error:"This file doesn't contain any goals. Nothing was changed."};
    if(raw.format&&raw.format>FORMAT) warn.push('This backup was made by a newer version. Parts it does not understand were skipped.');
    let bad=0; const goals={}, groups={}, logs=[];
    Object.values(raw.goals||{}).forEach(g=>{
      if(!g||typeof g!=='object'||!str(g.id)||!str(g.title)||!str(g.cls)){bad++;return;}
      goals[g.id]={id:str(g.id),cls:str(g.cls),title:str(g.title,200),criteria:str(g.criteria,2000),kind:KINDS.has(g.kind)?g.kind:'note',
        defTotal:Math.max(1,Math.min(50,Math.round(+g.defTotal)||5)),cadence:CADS.has(g.cadence)?g.cadence:'weekly',
        start:DAY.test(g.start||'')?g.start:'',end:DAY.test(g.end||'')?g.end:'',
        students:Array.isArray(g.students)?[...new Set(g.students.filter(s=>typeof s==='string'&&s))]:[],archived:!!g.archived,updated:+g.updated||0};
      // per-student settings: keep only values that make sense
      const pr={}; if(g.per&&typeof g.per==='object') Object.keys(g.per).forEach(sid=>{const o=g.per[sid]; if(!o||typeof o!=='object') return; const n={};
        if(CADS.has(o.cadence)) n.cadence=o.cadence; if(Math.round(+o.defTotal)>0) n.defTotal=Math.min(50,Math.round(+o.defTotal));
        if(DAY.test(o.start||'')) n.start=o.start; if(DAY.test(o.end||'')) n.end=o.end;
        if(o.status==='met'||o.status==='paused') n.status=o.status; if(n.status==='met'&&DAY.test(o.metDate||'')) n.metDate=o.metDate;
        if(Object.keys(n).length) pr[sid]=n;});
      if(Object.keys(pr).length) goals[g.id].per=pr;
    });
    Object.values(raw.groups||{}).forEach(g=>{
      if(!g||typeof g!=='object'||!str(g.id)||!str(g.name)||!str(g.cls)){bad++;return;}
      groups[g.id]={id:str(g.id),cls:str(g.cls),name:str(g.name,100),students:Array.isArray(g.students)?[...new Set(g.students.filter(s=>typeof s==='string'&&s))]:[],updated:+g.updated||0};
    });
    (Array.isArray(raw.logs)?raw.logs:[]).forEach(l=>{
      if(!l||typeof l!=='object'||!str(l.id)||!goals[l.goal]&&!G.goals[l.goal]||!str(l.sid)||!DAY.test(l.date||'')||!KINDS.has(l.kind)){bad++;return;}
      const o={id:str(l.id),goal:str(l.goal),sid:str(l.sid),date:l.date,t:+l.t||0,kind:l.kind,note:str(l.note,1000)}; if(str(l.where,80)) o.where=str(l.where,80);
      if(l.kind==='trials'){const tot=Math.round(+l.total),c=Math.round(+l.correct); if(!(tot>0&&c>=0&&c<=tot)){bad++;return;} o.total=tot;o.correct=c;}
      if(l.kind==='yesno'){if(typeof l.yes!=='boolean'){bad++;return;} o.yes=l.yes;}
      logs.push(o);
    });
    if(bad) warn.push(`${bad} damaged item${bad>1?'s were':' was'} skipped.`);
    return {ok:true,goals,groups,logs,names:raw.names||{},warn,exported:raw.exported||null};
  }

  // ---- line the file up with this tablet: classes and students by id, then by name
  function plan(f){
    D=Classroom.load(); G=loadG();
    const warn=f.warn.slice(), cmap={}, smap={};
    const fileCls=new Set([...Object.values(f.goals).map(g=>g.cls),...Object.values(f.groups).map(g=>g.cls)]);
    fileCls.forEach(c=>{
      let to=D.classes[c]?c:null;
      if(!to&&f.names[c]){const n=lc(f.names[c].name); to=Object.keys(D.classes).find(k=>lc(D.classes[k].name)===n)||null;}
      cmap[c]=to; if(!to) warn.push(`Class "${(f.names[c]||{}).name||c}" isn't on this tablet, so its goals were skipped. Add the class in Classroom setup first.`);
      const roster=to?(D.classes[to].students||[]):[], byId=new Set(roster.map(s=>s.id));
      const names=(f.names[c]||{}).students||{}; smap[c]={}; let lost=0;
      const seen=new Set([...Object.values(f.goals).filter(g=>g.cls===c).flatMap(g=>g.students),...Object.values(f.groups).filter(g=>g.cls===c).flatMap(g=>g.students),...f.logs.filter(l=>(f.goals[l.goal]||{}).cls===c).map(l=>l.sid)]);
      seen.forEach(sid=>{if(byId.has(sid)){smap[c][sid]=sid;return;}
        const nm=names[sid], m=nm&&roster.find(s=>lc(s.name)===lc(nm)); if(m) smap[c][sid]=m.id; else{smap[c][sid]=sid; lost++;}});
      if(to&&lost) warn.push(`${lost} student${lost>1?'s':''} in the file ${lost>1?'are':'is'}n't on this tablet's ${D.classes[to].name} roster. Their entries are kept and show as "removed student".`);
    });
    const ms=(c,list)=>list.map(s=>(smap[c]||{})[s]||s);
    const res={goals:Object.assign({},G.goals),groups:Object.assign({},G.groups),logs:G.logs.slice()};
    let gNew=0,gUpd=0,gSame=0,pNew=0,pUpd=0,lNew=0,lSame=0;
    Object.values(f.goals).forEach(g=>{const to=cmap[g.cls]; if(!to) return;
      const n=Object.assign({},g,{cls:to,students:ms(g.cls,g.students)}), cur=res.goals[g.id];
      if(g.per){n.per={}; Object.keys(g.per).forEach(s=>{n.per[(smap[g.cls]||{})[s]||s]=g.per[s];});}
      if(!cur){res.goals[g.id]=n;gNew++;}
      else if(JSON.stringify(cur)===JSON.stringify(n)) gSame++;
      else if((n.updated||0)>(cur.updated||0)){res.goals[g.id]=n;gUpd++;} else gSame++;});
    Object.values(f.groups).forEach(g=>{const to=cmap[g.cls]; if(!to) return;
      const n=Object.assign({},g,{cls:to,students:ms(g.cls,g.students)}), cur=res.groups[g.id];
      if(!cur){res.groups[g.id]=n;pNew++;} else if((n.updated||0)>(cur.updated||0)&&JSON.stringify(cur)!==JSON.stringify(n)){res.groups[g.id]=n;pUpd++;}});
    const have=new Set(res.logs.map(l=>l.id));
    f.logs.forEach(l=>{const g=f.goals[l.goal]||G.goals[l.goal]; if(!g||!res.goals[l.goal]) return; const c=f.goals[l.goal]?f.goals[l.goal].cls:g.cls;
      if(have.has(l.id)){lSame++;return;} res.logs.push(Object.assign({},l,{sid:(smap[c]||{})[l.sid]||l.sid})); have.add(l.id); lNew++;});
    const lines=[];
    lines.push(gNew||gUpd?`Goals: ${gNew} new${gUpd?', '+gUpd+' updated (the file had newer edits)':''}`:'Goals: nothing new');
    if(gSame) lines.push(`${gSame} goal${gSame>1?'s':''} already up to date`);
    lines.push(`Log entries: ${lNew} new${lSame?', '+lSame+' already here':''}`);
    if(pNew||pUpd) lines.push(`Groups: ${pNew} new${pUpd?', '+pUpd+' updated':''}`);
    return {res,lines,warn,changes:gNew+gUpd+lNew+pNew+pUpd};
  }

  window.importSheet=function(){
    openSheet(`<h2>Import goals</h2><p class="hint" style="padding:0 6px">Adds goals and log entries from a backup. Nothing on this tablet is deleted, and you'll see the changes before saving.</p>
      <div class="bar" style="padding:0 6px"><label class="btn primary" for="iFile">Choose file…</label><input type="file" id="iFile" accept=".json,.txt,application/json,text/plain" hidden><button class="plain" id="iPasteB">Paste instead…</button></div>
      <div class="field" id="iPaste" hidden><textarea id="iText" rows="6" style="font:13px var(--mono)"></textarea><button class="ghost" id="iRead">Check this backup</button></div>
      <div id="iErr" class="note bad" hidden style="margin:0 6px"></div>
      <div id="iPrev" hidden class="sumlist"></div>
      <div id="iUndo" class="note" hidden style="margin:0 6px"></div>
      <div class="sticky-actions"><button class="ghost" id="iClose">Close</button><button class="primary" id="iApply" hidden>Import</button></div>`,
    el=>{
      let pl=null;
      const showUndo=()=>{let u=null;try{u=JSON.parse(localStorage.getItem(UNDO));}catch(e){}
        const b=el.querySelector('#iUndo'); b.hidden=!u; if(!u) return;
        b.innerHTML=`Last import: ${esc(new Date(u.at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}. <button class="ghost" id="iUndoB" style="margin-left:8px">Undo it</button>`;
        b.querySelector('#iUndoB').addEventListener('click',()=>{G=u.data;saveG();try{localStorage.removeItem(UNDO);}catch(e){}closeSheet();toast('Import undone');render();});};
      showUndo();
      const check=text=>{const err=el.querySelector('#iErr'), prev=el.querySelector('#iPrev'); err.hidden=true; prev.hidden=true; el.querySelector('#iApply').hidden=true;
        const f=parse(text); if(!f.ok){err.textContent=f.error;err.hidden=false;return;}
        pl=plan(f); el.querySelector('#iPaste').hidden=true;
        prev.innerHTML=(f.exported?`<div class="hint">Backup from ${esc(new Date(f.exported).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}))}.</div>`:'')+
          `<div class="note"><ul style="margin:0;padding-left:18px">${pl.lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul></div>`+
          (pl.warn.length?`<div class="note" style="border:1.5px solid var(--part);background:transparent"><b>Fixed or skipped</b><ul style="margin:4px 0 0;padding-left:18px">${pl.warn.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>`:'');
        prev.hidden=false; el.querySelector('#iApply').hidden=!pl.changes;};
      el.querySelector('#iFile').addEventListener('change',e=>{const file=e.target.files&&e.target.files[0]; if(!file) return;
        if(file.size>8e6){const x=el.querySelector('#iErr');x.textContent='That file is too large to be a goals backup.';x.hidden=false;return;}
        const rd=new FileReader(); rd.onload=()=>check(String(rd.result)); rd.readAsText(file);});
      el.querySelector('#iPasteB').addEventListener('click',()=>{el.querySelector('#iPaste').hidden=false;el.querySelector('#iText').focus();});
      el.querySelector('#iRead').addEventListener('click',()=>check(el.querySelector('#iText').value));
      el.querySelector('#iClose').addEventListener('click',closeSheet);
      el.querySelector('#iApply').addEventListener('click',()=>{if(!pl) return;
        try{localStorage.setItem(UNDO,JSON.stringify({at:Date.now(),data:loadG()}));}catch(e){}
        G=Object.assign(loadG(),pl.res); saveG(); closeSheet(); toast('Import finished'); render();});
    });
  };

  // ---- CSV of every log entry, for Google Sheets
  window.copyCsv=function(){
    G=loadG(); D=Classroom.load();
    const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const rows=[['date','class','student','goal','log type','result','correct','total','percent','met','where','note'].join(',')];
    G.logs.slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:a.t-b.t).forEach(l=>{const g=G.goals[l.goal]; if(!g) return;
      const c=D.classes[g.cls]||{}, nm=Classroom.nameOf(D,g.cls,l.sid)||'(removed student)';
      const res=l.kind==='trials'?l.correct+'/'+l.total:l.kind==='yesno'?(l.yes?'met':'not met'):'';
      rows.push([l.date,q(c.name||''),q(nm),q(g.title),l.kind,q(res),l.kind==='trials'?l.correct:'',l.kind==='trials'?l.total:'',
        l.kind==='trials'&&l.total?Math.round(100*l.correct/l.total):'',l.kind==='yesno'?(l.yes?'yes':'no'):'',q(l.where||''),q(l.note||'')].join(','));});
    const text=rows.join('\n');
    const done=()=>{closeSheet();toast('Copied '+(rows.length-1)+' entries. Paste into a Google Sheet.');};
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(()=>showText(text)); else showText(text);
  };
  function showText(text){openSheet(`<h2>Logs as CSV</h2><p class="hint" style="padding:0 6px">Select all and copy, then paste into a Google Sheet.</p><textarea id="cT" rows="10" readonly style="margin:0 6px;font:12px var(--mono)">${esc(text)}</textarea><div class="sticky-actions"><button class="ghost" id="cC">Close</button></div>`,
    el=>{el.querySelector('#cT').select();el.querySelector('#cC').addEventListener('click',closeSheet);});}
})();
