/* Prep for a day's measurements: skip one to the next school day, print a data sheet, copy goals for Gemini (no names). */

// move one measurement to the next school day after `day`
function skipMeasure(gid,day){
  I=loadI(); const g=I.goals[gid]; if(!g) return;
  const to=IEP.nextSchool(IEP.add(day,1));
  g.plan=to; g.updated=Date.now(); saveI(); toast('Moved to '+wkday(to)+' '+short(to)); render();
}
function dayItems(d){ return bal().filter(x=>x.day===d&&sidInScope(x.sid)); }
function bySid(items){ const m=new Map(); items.forEach(x=>{if(!m.has(x.sid)) m.set(x.sid,[]); m.get(x.sid).push(x);}); return m; }

// ---------- printable data sheet: one block per student, trial boxes to fill in by hand
function printDay(d){
  const m=bySid(dayItems(d)); let h='';
  m.forEach((list,sid)=>{
    const nm=nameAny(sid), acc=(C.students[sid]||[]).map(a=>a.text+(a.note?' ('+a.note+')':''));
    h+=`<section class="ds"><h1>${esc(nm)} <span style="font-weight:400">· ${esc((D.classes[classOf(sid)]||{}).name||'')} · ${esc(dayName(d))}</span></h1>`;
    if(acc.length) h+=`<p><b>Accommodations:</b> ${esc(acc.join('; '))}</p>`;
    list.forEach((x,i)=>{const g=x.goal, c=g.criteria||{}, trials=c.trials!==false&&c.y;
      h+=`<div class="dg"><h2>${i+1}. ${g.area?esc(g.area)+': ':''}${esc(IEP.fill(g.text,nm))}</h2>
        <p>Criteria: ${esc(IEP.critText(c))}${g.methods&&g.methods.length?' · Method: '+esc(g.methods.join(', ')):''}</p>`;
      h+=trials?`<p class="boxes">Trials: ${Array.from({length:c.y},(_,k)=>`<span>${k+1} ☐</span>`).join('')} &nbsp; Correct ____ / ${c.y}</p>`
               :`<p class="boxes">Score: ______ / ______ = ______ %</p>`;
      h+=`<p class="ln">Notes:</p></div>`;});
    h+=`</section>`;});
  if(!h) h='<p>Nothing scheduled.</p>';
  $('printout').innerHTML=h; setTimeout(()=>window.print(),50);
}

// ---------- copy for Gemini: student codes instead of names, names scrubbed from goal text
function geminiText(d){
  const m=bySid(dayItems(d));
  const all=Object.keys(D.classes).flatMap(c=>D.classes[c].students||[]).flatMap(st=>{const k=(I.profiles[st.id]||{}).iepName; return k?[st,{id:st.id,name:k}]:[st];}).sort((a,b)=>b.name.length-a.name.length);
  const scrub=t=>{let s=IEP.fill(t,'the student'); all.forEach(st=>[st.name,...st.name.split(/\s+/).filter(p=>p.length>=2)].forEach(p=>{
      s=s.replace(new RegExp('(^|[^\\p{L}])'+p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^\\p{L}])','giu'),'$1the student');})); return s;};
  const grade=c=>{const n=((D.classes[c]||{}).name||c||'').match(/^\d/); return n?'grade '+n[0]:'middle school';};
  let t=`I'm a special education teacher. For each student below, write a short probe I can print and use to measure each IEP goal. For each goal: give exactly the number of items in the criteria (default 5), at the grade level shown, plus an answer key. Keep each probe on its own section, labeled with the student code and goal number. Do not add names.\n`;
  m.forEach((list,sid)=>{t+=`\n${codeFor(sid)} (${grade(classOf(sid))})\n`;
    list.forEach((x,i)=>{const g=x.goal; t+=`  Goal ${i+1}${g.area?' ('+g.area+')':''}: ${scrub(g.text)}\n    Criteria: ${IEP.critText(g.criteria||{})}${g.methods&&g.methods.length?'; method: '+g.methods.join(', '):''}\n`;});});
  return t;
}
function geminiSheet(d){
  const txt=geminiText(d);
  openSheet(`<h2>Copy for Gemini · ${esc(dayName(d))}</h2>
    <p class="hint">Students appear as codes, and names are removed from goal text. Check it before you paste.</p>
    <textarea id="gT" rows="14" style="width:100%;font-size:14px">${esc(txt)}</textarea>
    <div class="sticky-actions"><button class="ghost" id="gC">Close</button><button class="primary" id="gCopy">Copy</button></div>`,
  el=>{el.querySelector('#gC').addEventListener('click',closeSheet);
    el.querySelector('#gCopy').addEventListener('click',()=>{const ta=el.querySelector('#gT'), ok=()=>{closeSheet();toast('Copied. Paste into Gemini.');};
      if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(ok).catch(()=>{ta.select();document.execCommand('copy');ok();});
      else{ta.select();document.execCommand('copy');ok();}});});
}

// ---------- move all of one student's measurements on `day` to another school day (before the earliest deadline)
function reschedSheet(sid,day){
  const items=dayItems(day).filter(x=>x.sid===sid); if(!items.length) return;
  const last=items.reduce((a,x)=>x.deadline<a?x.deadline:a,'9999-12-31'), cap=dailyCap(), B=bal();
  const opts=[]; let d=IEP.nextSchool(IEP.add(day,1));
  while(opts.length<5){ opts.push(d); d=IEP.nextSchool(IEP.add(d,1)); }
  const load=d=>B.filter(x=>x.day===d&&x.sid!==sid).length;
  openSheet(`<h2>Reschedule ${esc(nameAny(sid))}</h2>
    <p class="hint">${plural(items.length,'measurement')} from ${esc(dayName(day))}. Move to:</p>
    ${opts.map(o=>{const late=o>last; return `<button class="item" data-to="${o}">${esc(dayName(o))}<small>${late?'past a deadline':(cap?load(o)+' / '+cap+' scheduled':'')}</small></button>`;}).join('')}
    <div class="sticky-actions"><button class="ghost" id="rsC">Cancel</button></div>`,
  el=>{el.querySelector('#rsC').addEventListener('click',closeSheet);
    el.querySelectorAll('[data-to]').forEach(b=>b.addEventListener('click',()=>{
      I=loadI(); const to=b.dataset.to; items.forEach(x=>{const g=I.goals[x.goal.id]; if(g){g.plan=to; g.updated=Date.now();}});
      saveI(); closeSheet(); toast(nameAny(sid)+' moved to '+wkday(to)+' '+short(to)); render();}));});
}
