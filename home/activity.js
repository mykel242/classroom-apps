/* Classroom Home: activity log (parent contacts, student conferences, behavior notes) and accommodations. */
const TYPES={parent:'Parent / guardian',student:'Student conference',behavior:'Behavior note'};
const TSHORT={parent:'Parent',student:'Student',behavior:'Behavior'};
const CONTACT=['Call','Text','Email','Meeting','In person','Note home'];

// ================= ACTIVITY =================
function renderActivity(){
  const t=today();
  let list=A.entries.filter(e=>inScope(e.cls));
  if(actStudent) list=list.filter(e=>(e.sids||[]).includes(actStudent));
  const nFu=list.filter(e=>e.fu&&e.fu.date&&!e.fu.done).length;
  if(actFilter==='fu') list=list.filter(e=>e.fu&&e.fu.date&&!e.fu.done).sort((a,b)=>a.fu.date<b.fu.date?-1:1);
  else{ if(actFilter!=='all') list=list.filter(e=>e.type===actFilter); list.sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:(b.updated||0)-(a.updated||0)); }
  const studs=classIds().flatMap(c=>((D.classes[c]||{}).students||[]).map(s=>({id:s.id,name:s.name,c})));
  let h=`<div class="bar"><button class="primary" id="newE">+ New entry</button><span class="grow"></span>
    <select id="stuF" aria-label="Student" style="max-width:55%"><option value="">All students</option>${studs.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}${cls==='all'?' ('+esc(D.classes[s.c].name)+')':''}</option>`).join('')}</select></div>
    <div class="filters" id="aF">${[['all','All'],['parent','Parent'],['student','Student'],['behavior','Behavior'],['fu','Follow-ups'+(nFu?' ('+nFu+')':'')]].map(([k,l])=>`<button type="button" data-f="${k}" aria-pressed="${actFilter===k}">${l}</button>`).join('')}</div>`;
  if(!list.length) h+=`<div class="empty">${actFilter==='fu'?'No open follow-ups.':'No entries yet. Tap + New entry to log a contact, conference or note.'}</div>`;
  let lastD='';
  list.forEach(e=>{
    const hd=actFilter==='fu'?'':e.date;
    if(hd&&hd!==lastD){h+=`<div class="datehead">${hd===t?'Today':esc(dayName(hd))}</div>`; lastD=hd;}
    const fu=e.fu&&e.fu.date?`<div class="fu">${e.fu.done?'<span class="tag ok">Done</span>':`<span class="tag ${e.fu.date<t?'over':e.fu.date===t?'due':''}">Follow up ${esc(short(e.fu.date))}</span>`} ${esc(e.fu.text||'')}</div>`:'';
    h+=`<button type="button" class="entry" data-e="${esc(e.id)}"><div class="top"><span class="tag ${e.type}">${esc(TSHORT[e.type]||'Note')}${e.method?' · '+esc(e.method):''}</span><span class="whos">${esc(names(e.sids))}${e.with?' <span class="meta">with '+esc(e.with)+'</span>':''}</span>${actFilter==='fu'?`<span class="meta">${esc(short(e.date))}</span>`:''}</div>
      ${e.summary?`<div class="sum">${esc(e.summary)}</div>`:''}${fu}</button>`;
  });
  $('view').innerHTML=h;
  $('stuF').value=actStudent;
  $('stuF').addEventListener('change',e=>{actStudent=e.target.value;renderActivity();});
  $('aF').addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(b){actFilter=b.dataset.f;renderActivity();}});
  $('newE').addEventListener('click',()=>editEntry(null,actStudent?[actStudent]:null,renderActivity));
  $('view').onclick=e=>{const b=e.target.closest('[data-e]'); if(b) editEntry(A.entries.find(x=>x.id===b.dataset.e),null,renderActivity);};
}

function editEntry(en,preSids,after){
  const isNew=!en;
  const ec=en?en.cls:(preSids&&preSids[0]&&classOf(preSids[0]))||(cls!=='all'?cls:Object.keys(D.classes)[0]);
  const d=en?JSON.parse(JSON.stringify(en)):{id:uid('a'),cls:ec,type:'parent',method:'Call',with:'',sids:(preSids||[]).slice(),date:today(),summary:'',outcome:'',fu:null};
  const fu=d.fu||{date:'',text:'',done:false};
  openSheet(`<h2>${isNew?'New entry':'Edit entry'}</h2>
    <div class="field"><span class="lbl">Type</span><div class="seg" id="eType">${Object.keys(TYPES).map(k=>`<button type="button" data-k="${k}" aria-pressed="${d.type===k}">${TYPES[k]}</button>`).join('')}</div></div>
    ${Object.keys(D.classes).length>1?`<div class="field"><label for="eCls">Class</label><select id="eCls">${Object.keys(D.classes).map(c=>`<option value="${esc(c)}">${esc(D.classes[c].name)}</option>`).join('')}</select></div>`:''}
    <div class="field"><span class="lbl">Students</span><div class="chips" id="eStu"></div></div>
    <div class="field" id="eMethW"><span class="lbl">How</span><div class="chips" id="eMeth">${CONTACT.map(m=>`<button type="button" data-m="${m}" aria-pressed="${d.method===m}">${m}</button>`).join('')}</div></div>
    <div class="field" id="eWithW"><label for="eWith">With</label><input id="eWith" type="text" value="${esc(d.with||'')}" placeholder="e.g. Mom, grandfather, guardian" enterkeyhint="next"></div>
    <div class="field"><label for="eDate">Date</label><input id="eDate" type="date" value="${esc(d.date)}" max="${today()}" style="width:190px"></div>
    <div class="field"><label for="eSum" id="eSumL">What was discussed</label><textarea id="eSum">${esc(d.summary)}</textarea></div>
    <div class="field"><label for="eOut">Outcome / next steps (optional)</label><textarea id="eOut" style="min-height:60px">${esc(d.outcome||'')}</textarea></div>
    <div class="field"><span class="lbl">Follow-up reminder (optional)</span>
      <div class="bar"><input id="fDate" type="date" value="${esc(fu.date||'')}" aria-label="Follow-up date" style="width:190px"><input id="fText" type="text" class="grow" value="${esc(fu.text||'')}" placeholder="e.g. Call back about the plan" enterkeyhint="done"></div>
      ${fu.date?`<label class="bar" style="gap:8px;font-size:16px"><input type="checkbox" id="fDone" ${fu.done?'checked':''} style="width:22px;height:22px"> Follow-up done</label>`:''}</div>
    <div id="eErr" class="note bad" hidden style="margin:0 6px"></div>
    ${isNew?'':`<div class="bar" style="padding:6px"><button class="plain" id="eDel" style="color:var(--not)">Delete entry…</button></div><div class="note" id="eDelC" hidden style="margin:0 6px">Delete this entry?<div class="bar" style="margin-top:8px"><button class="danger" id="eDelY">Delete</button><button class="ghost" id="eDelN">Keep</button></div></div>`}
    <div class="sticky-actions"><button class="ghost" id="eCancel">Cancel</button><button class="primary" id="eSave">${isNew?'Add entry':'Save'}</button></div>`,
  el=>{
    const sel=d.sids.slice();
    const drawStu=()=>{const r=(D.classes[d.cls]||{}).students||[];
      el.querySelector('#eStu').innerHTML=r.length?r.map(s=>`<button type="button" data-sid="${esc(s.id)}" aria-pressed="${sel.includes(s.id)}">${esc(s.name)}</button>`).join(''):'<span class="hint">This class has no students yet.</span>';};
    const typeUI=()=>{el.querySelectorAll('#eType button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.k===d.type));
      el.querySelector('#eMethW').hidden=d.type!=='parent'; el.querySelector('#eWithW').hidden=d.type!=='parent';
      el.querySelector('#eSumL').textContent=d.type==='behavior'?'What happened (brief and factual)':d.type==='student'?'What you talked about':'What was discussed';};
    drawStu(); typeUI();
    if(el.querySelector('#eCls')){el.querySelector('#eCls').value=d.cls; el.querySelector('#eCls').addEventListener('change',e=>{d.cls=e.target.value; sel.length=0; drawStu();});}
    el.querySelector('#eType').addEventListener('click',e=>{const b=e.target.closest('[data-k]');if(b){d.type=b.dataset.k;typeUI();}});
    el.querySelector('#eStu').addEventListener('click',e=>{const b=e.target.closest('[data-sid]');if(!b)return;const i=sel.indexOf(b.dataset.sid);if(i<0)sel.push(b.dataset.sid);else sel.splice(i,1);b.setAttribute('aria-pressed',i<0);});
    el.querySelector('#eMeth').addEventListener('click',e=>{const b=e.target.closest('[data-m]');if(!b)return;d.method=b.dataset.m;el.querySelectorAll('#eMeth button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.m===d.method));});
    el.querySelectorAll('input[type=text]').forEach(i=>i.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();i.blur();}}));
    el.querySelector('#eCancel').addEventListener('click',closeSheet);
    el.querySelector('#eSave').addEventListener('click',()=>{
      const err=m=>{const x=el.querySelector('#eErr');x.textContent=m;x.hidden=false;};
      d.sids=sel.slice(); d.date=el.querySelector('#eDate').value||today(); d.summary=el.querySelector('#eSum').value.trim(); d.outcome=el.querySelector('#eOut').value.trim();
      if(d.type==='parent'){d.with=el.querySelector('#eWith').value.trim(); if(!d.method) d.method='Call';} else {delete d.method; delete d.with;}
      const fd=el.querySelector('#fDate').value, ft=el.querySelector('#fText').value.trim(), fdn=el.querySelector('#fDone');
      if(fd||ft){ if(!fd) return err('Pick a date for the follow-up, or clear its text.');
        d.fu={date:fd,text:ft,done:fdn?fdn.checked:false}; if(d.fu.done) d.fu.doneDate=(en&&en.fu&&en.fu.doneDate)||today(); }
      else d.fu=null;
      if(!d.sids.length) return err('Pick at least one student.');
      if(!d.summary) return err('Add a short summary.');
      d.updated=Date.now();
      A=loadA(); const i=A.entries.findIndex(x=>x.id===d.id); if(i<0) A.entries.push(d); else A.entries[i]=d;
      saveA(); closeSheet(); toast(isNew?'Entry added':'Saved'); (after||render)();
    });
    if(!isNew){
      el.querySelector('#eDel').addEventListener('click',()=>el.querySelector('#eDelC').hidden=false);
      el.querySelector('#eDelN').addEventListener('click',()=>el.querySelector('#eDelC').hidden=true);
      el.querySelector('#eDelY').addEventListener('click',()=>{A=loadA();A.entries=A.entries.filter(x=>x.id!==d.id);saveA();closeSheet();toast('Deleted');(after||render)();});
    }
  });
}

// ================= ACCOMMODATIONS =================
const accOf=sid=>C.students[sid]||[];
function library(){const m=new Map(); Object.values(C.students).forEach(list=>list.forEach(a=>{const k=a.text.trim().toLowerCase(); if(!m.has(k)) m.set(k,{text:a.text,n:0}); m.get(k).n++;}));
  return [...m.values()].sort((a,b)=>b.n-a.n||a.text.localeCompare(b.text));}
function renderAccomOverview(box){
  let h=`<div class="bar"><div class="seg" id="accV"><button type="button" data-v="student" aria-pressed="${accView==='student'}">By student</button><button type="button" data-v="acc" aria-pressed="${accView==='acc'}">By accommodation</button></div><span class="grow"></span><button class="ghost" id="accPrint">Print</button></div>`;
  const ids=classIds();
  ids.forEach(c=>{const cl=D.classes[c], r=(cl&&cl.students)||[];
    if(ids.length>1&&!r.length) return;
    if(ids.length>1) h+=`<div class="clshead">${esc(cl.name)}</div>`;
    if(!r.length){h+=`<div class="empty">No students in ${esc(cl.name)}.</div>`;return;}
    if(accView==='student'){
      r.forEach(s=>{const list=accOf(s.id);
        h+=`<button type="button" class="stu" data-s="${esc(s.id)}"><b>${esc(s.name)}</b>${list.length?`<div class="acc">${list.map(a=>`<span>${esc(a.text)}${a.note?' <small>· '+esc(a.note)+'</small>':''}</span>`).join('')}</div>`:'<span class="meta">None listed · tap to add</span>'}</button>`;});
    } else {
      const m=new Map(); r.forEach(s=>accOf(s.id).forEach(a=>{const k=a.text.trim().toLowerCase(); if(!m.has(k)) m.set(k,{text:a.text,who:[]}); m.get(k).who.push(s);}));
      const items=[...m.values()].sort((a,b)=>b.who.length-a.who.length||a.text.localeCompare(b.text));
      if(!items.length) h+=`<div class="empty">No accommodations listed for ${esc(cl.name)} yet.</div>`;
      items.forEach(x=>{h+=`<button type="button" class="stu" data-a="${esc(x.text)}" data-c="${esc(c)}"><b>${esc(x.text)} <span class="meta" style="font-weight:500">· ${x.who.length} of ${r.length}</span></b><div class="acc">${x.who.map(s=>`<span>${esc(s.name)}</span>`).join('')}</div></button>`;});
    }
  });
  box.innerHTML=h;
  box.querySelector('#accV').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(b){accView=b.dataset.v;renderAccomOverview(box);}});
  box.querySelector('#accPrint').addEventListener('click',printAccom);
  box.onclick=e=>{const s=e.target.closest('[data-s]'), a=e.target.closest('[data-a]');
    if(s) editAccom(s.dataset.s,()=>renderAccomOverview(box)); if(a) whoHas(a.dataset.a,a.dataset.c,()=>renderAccomOverview(box));};
}
function editAccom(sid,after){
  const list=JSON.parse(JSON.stringify(accOf(sid)));
  openSheet(`<h2>${esc(nameAny(sid))} · Accommodations</h2>
    <div class="items" id="accList"></div>
    <div class="field"><label for="accNew">Add an accommodation</label><div class="bar"><input id="accNew" type="text" class="grow" placeholder="Type one, then tap Add" enterkeyhint="done"><button class="primary" id="accAdd">Add</button></div></div>
    <div class="field" id="sugW"><span class="lbl">Used for other students · tap to add</span><div class="chips" id="sug"></div></div>
    <div class="sticky-actions"><button class="ghost" id="accCancel">Cancel</button><button class="primary" id="accSave">Save</button></div>`,
  el=>{
    const draw=()=>{
      el.querySelector('#accList').innerHTML=list.length?list.map((a,i)=>`<div class="row"><div class="t"><b>${esc(a.text)}</b><input type="text" data-note="${i}" value="${esc(a.note||'')}" placeholder="Note (optional), e.g. math only" enterkeyhint="done"></div><button type="button" class="x" data-rm="${i}">Remove</button></div>`).join(''):'<div class="row"><span class="meta">None listed yet.</span></div>';
      const have=new Set(list.map(a=>a.text.trim().toLowerCase())), sug=library().filter(x=>!have.has(x.text.trim().toLowerCase()));
      el.querySelector('#sugW').hidden=!sug.length;
      el.querySelector('#sug').innerHTML=sug.map(x=>`<button type="button" class="sug" data-t="${esc(x.text)}">+ ${esc(x.text)}</button>`).join('');
    };
    draw();
    const add=t=>{t=t.trim(); if(!t) return; if(list.some(a=>a.text.trim().toLowerCase()===t.toLowerCase())){toast('Already listed');return;} list.push({id:uid('c'),text:t,note:''}); draw();};
    el.querySelector('#accAdd').addEventListener('click',()=>{add(el.querySelector('#accNew').value); el.querySelector('#accNew').value='';});
    el.querySelector('#accNew').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();el.querySelector('#accAdd').click();}});
    el.querySelector('#sug').addEventListener('click',e=>{const b=e.target.closest('[data-t]'); if(b) add(b.dataset.t);});
    el.querySelector('#accList').addEventListener('input',e=>{const i=e.target.dataset.note; if(i!=null) list[+i].note=e.target.value;});
    el.querySelector('#accList').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName==='INPUT'){e.preventDefault();e.target.blur();}});
    el.querySelector('#accList').addEventListener('click',e=>{const b=e.target.closest('[data-rm]'); if(b) confirmTap(b,'Tap to remove',()=>{list.splice(+b.dataset.rm,1); draw();});});
    el.querySelector('#accCancel').addEventListener('click',closeSheet);
    el.querySelector('#accSave').addEventListener('click',()=>{const pending=el.querySelector('#accNew').value; if(pending.trim()) add(pending);
      C=loadC(); list.forEach(a=>{a.note=(a.note||'').trim();}); if(list.length) C.students[sid]=list; else delete C.students[sid];
      C.updated=Date.now(); saveC(); closeSheet(); toast('Saved'); after();});
  });
}
function whoHas(text,c,after){
  const r=(D.classes[c]||{}).students||[], k=text.trim().toLowerCase();
  const sel=r.filter(s=>accOf(s.id).some(a=>a.text.trim().toLowerCase()===k)).map(s=>s.id);
  openSheet(`<h2>${esc(text)}</h2><div class="hint" style="padding:0 6px">${esc((D.classes[c]||{}).name)} · tap students to add or remove</div>
    <div class="field"><label for="wRen">Wording (changes it for everyone in this class)</label><input id="wRen" type="text" value="${esc(text)}" enterkeyhint="done"></div>
    <div class="field"><div class="chips" id="wStu">${r.map(s=>`<button type="button" data-sid="${esc(s.id)}" aria-pressed="${sel.includes(s.id)}">${esc(s.name)}</button>`).join('')}</div></div>
    <div class="sticky-actions"><button class="ghost" id="wCancel">Cancel</button><button class="primary" id="wSave">Save</button></div>`,
  el=>{
    el.querySelector('#wStu').addEventListener('click',e=>{const b=e.target.closest('[data-sid]');if(!b)return;const i=sel.indexOf(b.dataset.sid);if(i<0)sel.push(b.dataset.sid);else sel.splice(i,1);b.setAttribute('aria-pressed',i<0);});
    el.querySelector('#wRen').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.target.blur();}});
    el.querySelector('#wCancel').addEventListener('click',closeSheet);
    el.querySelector('#wSave').addEventListener('click',()=>{
      const nt=el.querySelector('#wRen').value.trim()||text; C=loadC();
      r.forEach(s=>{const list=C.students[s.id]||[]; const i=list.findIndex(a=>a.text.trim().toLowerCase()===k);
        if(sel.includes(s.id)){ if(i<0) list.push({id:uid('c'),text:nt,note:''}); else list[i].text=nt; }
        else if(i>=0) list.splice(i,1);
        if(list.length) C.students[s.id]=list; else delete C.students[s.id];});
      C.updated=Date.now(); saveC(); closeSheet(); toast('Saved'); after();});
  });
}
function printAccom(){
  let h=''; classIds().forEach(c=>{const cl=D.classes[c]; if(!cl||!(cl.students||[]).length) return;
    h+=`<h1>Accommodations · ${esc(cl.name)}</h1><table><thead><tr><th style="width:28%">Student</th><th>Accommodations</th></tr></thead><tbody>`+
      cl.students.map(s=>`<tr><td>${esc(s.name)}</td><td>${accOf(s.id).map(a=>esc(a.text)+(a.note?' ('+esc(a.note)+')':'')).join('; ')||'—'}</td></tr>`).join('')+'</tbody></table>';});
  $('printout').innerHTML=h||'<p>No students.</p>'; setTimeout(()=>window.print(),50);
}
