/* One backup for everything: classes, rooms, seating, calendar, bell schedule and laps (Setup); IEP goals,
   measurements, profiles, groups, activity log and accommodations (Home); lessons, period notes, to-dos,
   days off and absences (Planner).
   File name: classroom-YYYY-MM-DD-HHMM-<device>-<fingerprint>.txt. The fingerprint is a short hash of the contents,
   so two backups never share a name unless they hold exactly the same data.
   Restore merges: classes and rosters through Setup's matcher; everything else by id, newest edit wins;
   nothing on this tablet is deleted. The tablet's previous state is kept so the restore can be undone. */
(function(){
  const KEYS=['classroom.v1','iep.v1','activity.v1','accom.v1','day.v1'];
  const LAST='backup.last', DEV='backup.device', UNDO='backup.undo', NAG_DAYS=7;
  const getJ=k=>{try{return JSON.parse(localStorage.getItem(k));}catch(e){return null;}};
  const setJ=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const pad=n=>String(n).padStart(2,'0');
  const stamp=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'-'+pad(d.getHours())+pad(d.getMinutes());
  const device=()=>{try{return localStorage.getItem(DEV)||'tablet';}catch(e){return 'tablet';}};
  const slug=s=>String(s||'tablet').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,20)||'tablet';
  function lapsAll(){ const out={}, pre=(window.Classroom&&Classroom.LAPS)||'lapTracker.v3:';
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i); if(k&&k.startsWith(pre)){const v=getJ(k); if(v) out[k.slice(pre.length)]=v;}} return out; }
  async function fingerprint(text){
    try{ const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)); return [...new Uint8Array(b)].slice(0,3).map(x=>x.toString(16).padStart(2,'0')).join(''); }
    catch(e){ let h=5381; for(let i=0;i<text.length;i++) h=((h<<5)+h+text.charCodeAt(i))>>>0; return h.toString(16).slice(0,6); } }
  function snapshot(){ const data={}; KEYS.forEach(k=>{data[k]=getJ(k);}); return {data,laps:lapsAll()}; }

  async function makeFile(){
    const s=snapshot(), body=JSON.stringify(s);
    const fp=await fingerprint(body);
    const doc={app:'classroom-backup',format:1,exported:new Date().toISOString(),build:(window.APP_VERSION||{}).n||null,device:device(),fingerprint:fp,data:s.data,laps:s.laps};
    const name='classroom-'+stamp(new Date())+'-'+slug(device())+'-'+fp+'.txt';
    return {file:new File([JSON.stringify(doc,null,1)],name,{type:'text/plain'}),name};
  }
  async function backupNow(){
    const {file,name}=await makeFile();
    // Android can't share .json; .txt goes to Drive fine and restores the same
    try{ if(navigator.canShare&&navigator.canShare({files:[file]})){ await navigator.share({files:[file],title:name}); done(name); return; } }
    catch(e){ if(e&&e.name==='AbortError') return; }
    const a=document.createElement('a'); a.href=URL.createObjectURL(file); a.download=name; document.body.appendChild(a); a.click(); a.remove(); done(name,true);
  }
  function done(name,dl){ try{localStorage.setItem(LAST,String(Date.now()));}catch(e){} note((dl?'Saved to Downloads: ':'Backed up: ')+name); nag(); }

  // ---- restore
  const newer=(a,b)=>!a||((b&&b.updated)||0)>((a&&a.updated)||0);
  function mergeHome(cur,inc,sum){
    const I=cur['iep.v1']||{}, J=inc['iep.v1']||{}; let n=0;
    ['bank','goals','groups'].forEach(k=>{I[k]=I[k]||{}; Object.values(J[k]||{}).forEach(x=>{if(x&&x.id&&newer(I[k][x.id],x)){I[k][x.id]=x;n++;}});});
    I.data=Array.isArray(I.data)?I.data:[]; const have=new Set(I.data.map(p=>p.id)); (J.data||[]).forEach(p=>{if(p&&p.id&&!have.has(p.id)){I.data.push(p);have.add(p.id);n++;}});
    I.profiles=I.profiles||{}; Object.keys(J.profiles||{}).forEach(s=>{if(newer(I.profiles[s],J.profiles[s])){I.profiles[s]=J.profiles[s];n++;}});
    I.codes=Object.assign({},J.codes||{},I.codes||{}); I.settings=Object.assign({},J.settings||{},I.settings||{});
    I.groupsHide=[...new Set([...(I.groupsHide||[]),...(J.groupsHide||[])])];
    cur['iep.v1']=I; if(n) sum.push(plural(n,'goal, measurement or profile change'));
    const A=cur['activity.v1']||{entries:[]}, B=inc['activity.v1']||{}; A.entries=Array.isArray(A.entries)?A.entries:[]; let m=0;
    (B.entries||[]).forEach(e=>{const i=A.entries.findIndex(x=>x.id===e.id); if(i<0){A.entries.push(e);m++;} else if(newer(A.entries[i],e)){A.entries[i]=e;m++;}});
    cur['activity.v1']=A; if(m) sum.push(plural(m,'activity log entry','activity log entries'));
    const C=cur['accom.v1']||{students:{}}, E=inc['accom.v1']||{}; C.students=C.students||{}; let a=0;
    Object.keys(E.students||{}).forEach(s=>{const l=C.students[s]||[]; (E.students[s]||[]).forEach(x=>{if(!l.some(y=>String(y.text).toLowerCase()===String(x.text).toLowerCase())){l.push(x);a++;}}); C.students[s]=l;});
    cur['accom.v1']=C; if(a) sum.push(plural(a,'accommodation'));
  }
  function mergeDay(cur,inc,sum){
    const Y=cur['day.v1']||{}, Z=inc['day.v1']||{}; let n=0;
    ['lessons','periods','days','absent','notes','links'].forEach(k=>{Y[k]=Y[k]||{};});
    ['lessons','periods'].forEach(k=>Object.keys(Z[k]||{}).forEach(id=>{if(newer(Y[k][id],Z[k][id])){Y[k][id]=Z[k][id];n++;}}));
    Y.todos=Array.isArray(Y.todos)?Y.todos:[]; (Z.todos||[]).forEach(t=>{const i=Y.todos.findIndex(x=>x.id===t.id); if(i<0){Y.todos.push(t);n++;} else if(newer(Y.todos[i],t)){Y.todos[i]=t;n++;}});
    ['days','absent','notes','links'].forEach(k=>Object.keys(Z[k]||{}).forEach(id=>{if(Y[k][id]===undefined){Y[k][id]=Z[k][id];n++;}}));
    cur['day.v1']=Y; if(n) sum.push(plural(n,'planner change'));
  }
  // returns {ok, apply(), summary[]} without changing anything until apply() runs
  async function prepare(text){
    let raw; try{raw=JSON.parse(String(text).replace(/^﻿/,'').trim());}catch(e){return {ok:false,error:"This file isn't a readable backup. Nothing was changed."};}
    if(!raw||raw.app!=='classroom-backup'||!raw.data) return {ok:false,error:"This isn't a full backup. Older single-app backups are restored inside each app."};
    const cur=snapshot(), next=JSON.parse(JSON.stringify(cur.data)), sum=[]; let lapWrites={};
    if(raw.data['classroom.v1']&&window.SetupBackup){
      const doc=SetupBackup.exportDoc(raw.data['classroom.v1'],raw.build,raw.laps||{});
      const p=SetupBackup.parse(JSON.stringify(doc));
      if(p.ok){ const D=window.Classroom?Classroom.load():(cur.data['classroom.v1']||{});
        const pl=SetupBackup.plan(D,p.data,'merge',p.laps,cur.laps);
        next['classroom.v1']=Object.assign({},D,pl.result); lapWrites=pl.lapWrites;
        // only report setup sections that actually change something
        pl.summary.forEach(s=>{const l=s.lines.filter(x=>!/already match|No seat changes|Nothing to add|this tablet's copy is kept|Kept this tablet/i.test(x)); if(l.length) sum.push(s.title+': '+l.join('; '));});}
      else sum.push('Classes and rooms could not be read: '+p.error);
    }
    mergeHome(next,raw.data,sum); mergeDay(next,raw.data,sum);
    return {ok:true,meta:{exported:raw.exported,device:raw.device},summary:sum,apply(){
      try{setJ(UNDO,{at:Date.now(),data:cur.data,laps:Object.fromEntries(Object.keys(lapWrites).map(k=>[k,cur.laps[k]||null]))});}catch(e){}
      KEYS.forEach(k=>{if(next[k]!=null) setJ(k,next[k]);});
      const pre=(window.Classroom&&Classroom.LAPS)||'lapTracker.v3:';
      Object.keys(lapWrites).forEach(k=>{try{setJ(pre+k,lapWrites[k]);}catch(e){}});
    }};
  }
  function undo(){ const u=getJ(UNDO); if(!u) return false; const pre=(window.Classroom&&Classroom.LAPS)||'lapTracker.v3:';
    KEYS.forEach(k=>{if(u.data[k]==null) localStorage.removeItem(k); else setJ(k,u.data[k]);});
    Object.keys(u.laps||{}).forEach(k=>{if(u.laps[k]==null) localStorage.removeItem(pre+k); else setJ(pre+k,u.laps[k]);});
    localStorage.removeItem(UNDO); return true; }
  const plural=(n,w,ws)=>n+' '+(n===1?w:(ws||w+'s'));
  const esc=t=>String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  // ---- small self-contained UI (works on any page)
  function note(msg){ let t=document.getElementById('bkToast'); if(!t){t=document.createElement('div'); t.id='bkToast';
      t.style.cssText='position:fixed;left:50%;transform:translateX(-50%);top:calc(14px + env(safe-area-inset-top,0px));z-index:60;background:var(--fg);color:var(--bg);padding:10px 16px;border-radius:12px;font:600 15px var(--sans);max-width:92vw';
      document.body.appendChild(t);} t.textContent=msg; t.hidden=false; clearTimeout(t._h); t._h=setTimeout(()=>t.hidden=true,3500); }
  function sheet(html,wire){ let w=document.getElementById('bkWrap'); if(!w){w=document.createElement('div'); w.id='bkWrap'; w.className='scrim'; w.innerHTML='<div class="sheet" role="dialog"></div>';
      w.addEventListener('click',e=>{if(e.target===w) w.hidden=true;}); document.body.appendChild(w);}
    w.hidden=false; const s=w.firstChild; s.innerHTML=html; s.scrollTop=0; wire(s,()=>{w.hidden=true;}); }
  const lastAt=()=>{try{return +localStorage.getItem(LAST)||0;}catch(e){return 0;}};
  const ago=t=>{if(!t) return 'never'; const d=Math.floor((Date.now()-t)/864e5); return d<1?'today':d===1?'yesterday':d+' days ago';};
  function open(){
    sheet(`<h2 style="margin:0 6px">Backup</h2>
      <p class="hint" style="margin:0 6px">One file with everything: classes, rosters, seating, calendar, laps, IEP goals and scores, activity log, accommodations and the planner. Last backup: <b>${ago(lastAt())}</b>.</p>
      <button class="primary" id="bkNow" style="margin:6px">Back up now</button>
      <p class="hint" style="margin:0 6px">Then tap <b>Drive</b> and your backup folder. The name includes the date, time, device and a fingerprint of the contents, so backups never overwrite each other.</p>
      <div class="bar" style="padding:0 6px"><label for="bkDev" class="hint">This device</label><input type="text" id="bkDev" value="${esc(device())}" style="width:160px" enterkeyhint="done"></div>
      <hr><button class="item" id="bkRes">Restore from a backup…</button><input type="file" id="bkFile" accept=".txt,.json,text/plain,application/json" hidden>
      <div id="bkPrev" hidden style="padding:0 6px"></div>
      ${getJ(UNDO)?'<button class="item" id="bkUndo">Undo the last restore</button>':''}
      <div class="sticky-actions" style="position:sticky;bottom:0;background:var(--card);padding-top:8px"><button class="ghost" id="bkClose" style="flex:1">Close</button></div>`,
    (el,close)=>{
      el.querySelector('#bkClose').addEventListener('click',close);
      el.querySelector('#bkNow').addEventListener('click',()=>{close(); backupNow();});
      el.querySelector('#bkDev').addEventListener('change',e=>{try{localStorage.setItem(DEV,e.target.value.trim()||'tablet');}catch(x){}});
      el.querySelector('#bkRes').addEventListener('click',()=>el.querySelector('#bkFile').click());
      const u=el.querySelector('#bkUndo'); if(u) u.addEventListener('click',()=>{ if(undo()){ note('Restore undone'); setTimeout(()=>location.reload(),600);} });
      el.querySelector('#bkFile').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0]; if(!f) return; const rd=new FileReader();
        rd.onload=async()=>{ const box=el.querySelector('#bkPrev'); box.hidden=false; const r=await prepare(String(rd.result));
          if(!r.ok){ box.innerHTML=`<p class="note bad">${esc(r.error)}</p>`; return; }
          box.innerHTML=`<p><b>Backup from ${esc(r.meta.exported?new Date(r.meta.exported).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'?')}</b>${r.meta.device?' · '+esc(r.meta.device):''}</p>
            <ul class="hint" style="margin:0;padding-left:18px">${r.summary.map(s=>`<li>${esc(s)}</li>`).join('')||'<li>Nothing new: this tablet already has everything in the file.</li>'}</ul>
            <p class="hint">Nothing on this tablet is deleted. You can undo this afterwards.</p><button class="primary" id="bkApply" ${r.summary.length?'':'disabled'}>Restore</button>`;
          box.querySelector('#bkApply').addEventListener('click',()=>{ r.apply(); note('Restore finished'); setTimeout(()=>location.reload(),600); }); };
        rd.readAsText(f);});
    });
  }
  // nudge when the last full backup is older than a week
  function nag(){ const old=Date.now()-lastAt()>NAG_DAYS*864e5, anything=KEYS.some(k=>localStorage.getItem(k));
    const nb=document.getElementById('navBackup'); if(!nb) return;
    nb.classList.toggle('due',old&&anything); nb.title=old&&anything?'Last backup: '+ago(lastAt()):'';
    const l=nb.querySelector('em'); if(l) l.textContent=old&&anything?(lastAt()?ago(lastAt()):'Back up!'):'Backup'; }
  window.ClassroomBackup={open,backupNow,prepare,undo,nag};
  // the bottom bar is added by app.js, which loads after this file
  addEventListener('load',nag);
})();
