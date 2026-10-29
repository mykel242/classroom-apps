/* Prep for a day's measurements: skip one to the next school day, print a data sheet, copy goals for Gemini (no names). */

function dayItems(d){ return bal().filter(x=>x.day===d&&sidInScope(x.sid)); }
function bySid(items){ const m=new Map(); items.forEach(x=>{if(!m.has(x.sid)) m.set(x.sid,[]); m.get(x.sid).push(x);}); return m; }

// ---------- day packet: page 1 is the day sheet (bell schedule, who to conference each period, follow-ups),
// then one data-sheet section per student with full goal text and trial boxes
const subjOf=t=>/math/i.test(t||'')?'math':/\b(ela|reading|writing|english|literacy|speech|language)\b/i.test(t||'')?'ela':'';
// a goal's subject: from its area, else from math words in its text; anything else is "any time"
const goalSubj=g=>subjOf(g.area)||(/\b(fractions?|equations?|operations?|products?|quotients?|multipl\w*|divi\w*|addition|subtraction|numbers?|integers?|decimals?)\b/i.test(g.text||'')?'math':'');
const hm=t=>{if(!t) return ''; const [h,m]=t.split(':').map(Number); return ((h+11)%12+1)+':'+String(m).padStart(2,'0');};
const boxes=g=>{const c=g.criteria||{}; return c.trials!==false&&c.y?Array.from({length:c.y},(_,k)=>`${k+1}☐`).join(' '):'___ / ___ = ___%';};
function periodsOn(d){
  const wd=IEP.parse(d).getDay(), byName={}; Object.keys(D.classes).forEach(c=>byName[String(D.classes[c].name).toLowerCase()]=c);
  const mins=t=>{const m=/^(\d{1,2}):(\d{2})/.exec(t||''); if(!m) return 9999; const h=+m[1]<6?+m[1]+12:+m[1]; return h*60+ +m[2];};
  return ((D.bell&&D.bell.periods)||[]).slice().sort((a,b)=>mins(a.start)-mins(b.start)).map(p=>{const label=(p.days||{})[wd]||''; const tok=label.toLowerCase().split(/[\s,·\-–\/]+/);
    const cls=tok.map(x=>byName[x]).find(Boolean)||null; return {p,label,cls,subj:subjOf(label)};});
}
function daySheetHtml(d){
  const items=dayItems(d), per=periodsOn(d), placed=new Map();
  items.forEach(x=>{const s=goalSubj(x.goal); const hit=s?per.find(q=>q.cls&&q.cls===x.cls&&q.subj===s):null;
    const k=hit?hit.p.id:'any'; if(!placed.has(k)) placed.set(k,[]); placed.get(k).push(x);});
  const list=xs=>{const m=bySid(xs); let h='<ul class="conf">'; m.forEach((l,sid)=>{h+=`<li><b>${esc(nameAny(sid))}</b>`+l.map(x=>`<div class="cg"><span>${esc(goalShort(x.goal))}</span><span class="cr">${esc(IEP.critText(x.goal.criteria||{}))}</span><span class="bx">${boxes(x.goal)}</span></div>`).join('')+'</li>';}); return h+'</ul>';};
  let h=`<section class="dsheet"><h1>${esc(dayName(d))}</h1>`;
  if(per.length){ per.forEach(q=>{const xs=placed.get(q.p.id)||[];
    h+=`<div class="per"><div class="ph"><span class="pt">${esc(hm(q.p.start))}${q.p.end?'–'+esc(hm(q.p.end)):''}</span><b>${esc(q.p.name)}</b><span>${esc(q.label||'—')}</span>${xs.length?`<span class="pc">Conference: ${plural(xs.length,'measurement')}</span>`:''}</div>${xs.length?list(xs):''}</div>`;}); }
  else h+=`<p>No bell schedule yet. Add it in Classroom setup → Calendar to sort measurements by period.</p>`;
  const any=placed.get('any')||[];
  if(any.length) h+=`<h2>Any time today</h2>`+list(any);
  if(!items.length) h+=`<p>No measurements scheduled.</p>`;
  const fus=A.entries.filter(e=>inScope(e.cls)&&e.fu&&e.fu.date&&!e.fu.done&&e.fu.date<=d);
  h+=`<h2>Follow-ups and calls</h2>`+(fus.length?'<ul class="fu">'+fus.map(e=>`<li>☐ <b>${esc(e.fu.text||'Follow up')}</b> · ${esc(names(e.sids))}${e.fu.date<d?' · from '+esc(short(e.fu.date)):''}</li>`).join('')+'</ul>':'<p>None due.</p>');
  h+=`<h2>Notes</h2><div class="lines"></div></section>`;
  return h;
}
function dataSheetsHtml(d){
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
  return h;
}
function printDay(d){
  D=Classroom.load(); A=loadA(); C=loadC();
  const ds=dataSheetsHtml(d);
  $('printout').innerHTML=daySheetHtml(d)+(ds?`<div class="pbreak"></div>`+ds:'');
  setTimeout(()=>window.print(),50);
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

// ---------- move one measurement, or all of a student's for a day, to any school day (earlier or later)
function moveSheet(items,day){
  if(!items.length) return;
  const t=today(), cap=dailyCap(), B=bal(), ids=new Set(items.map(x=>x.goal.id)), sid=items[0].sid, one=items.length===1;
  const last=items.reduce((a,x)=>x.deadline<a?x.deadline:a,'9999-12-31');
  const opts=[]; let d=IEP.nextSchool(t); while(opts.length<12){ if(d!==day) opts.push(d); d=IEP.nextSchool(IEP.add(d,1)); }
  const load=o=>B.filter(x=>x.day===o&&!ids.has(x.goal.id)).length;
  // where this student's class meets the goal's subject that day (from the bell schedule)
  const meets=o=>{ if(!D.bell||!(D.bell.periods||[]).length) return ''; const subs=new Set(items.map(x=>goalSubj(x.goal)).filter(Boolean)); if(!subs.size) return '';
    const hits=periodsOn(o).filter(q=>q.cls===items[0].cls&&subs.has(q.subj)).map(q=>q.p.name); return hits.length?hits.join(', '):'no class'; };
  const anyPlanned=items.some(x=>x.planned);
  openSheet(`<h2>Move · ${esc(nameAny(sid))}</h2>
    <p class="hint" style="padding:0 6px">${one?esc(goalShort(items[0].goal)):plural(items.length,'measurement')} · now ${esc(dayName(day))}${last<'9999'?' · due by '+esc(short(last)):''}</p>
    ${opts.map(o=>{const late=o>last, n=load(o), m=meets(o);
      return `<button class="item" data-to="${o}"><span>${o===t?'Today · ':''}${esc(dayName(o))}</span><small>${late?'<span style="color:var(--not)">past deadline</span> · ':''}${m==='no class'?'no class · ':m?esc(m)+' · ':''}${cap?`${n} / ${cap}`:plural(n,'measurement')}</small></button>`;}).join('')}
    <div class="field" style="padding:0 6px"><label for="mvOther">Or pick a date</label><input id="mvOther" type="date" min="${t}" style="width:190px"></div>
    <div class="sticky-actions"><button class="ghost" id="mvC">Cancel</button>${anyPlanned?'<button class="ghost" id="mvAuto">Let the app choose</button>':''}</div>`,
  el=>{const set=to=>{ I=loadI(); items.forEach(x=>{const g=I.goals[x.goal.id]; if(g){g.plan=to; g.updated=Date.now();}}); saveI(); closeSheet();
      toast(to?(one?'Moved to ':nameAny(sid)+' moved to ')+wkday(to)+' '+short(to):'Back to automatic'); render(); };
    el.querySelectorAll('[data-to]').forEach(b=>b.addEventListener('click',()=>set(b.dataset.to)));
    el.querySelector('#mvOther').addEventListener('change',e=>{const v=e.target.value; if(!v) return; const w=IEP.parse(v).getDay(); if(w===0||w===6){toast('That\'s a weekend');return;} set(v);});
    el.querySelector('#mvC').addEventListener('click',closeSheet);
    const au=el.querySelector('#mvAuto'); if(au) au.addEventListener('click',()=>set(''));});
}
