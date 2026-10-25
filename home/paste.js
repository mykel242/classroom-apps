/* Paste goals from an IEP PDF: read, review, add. Parsing lives in shared/iepparse.js. */
const FLAG={'no %':'No % in IEP, using 80%','not trials':'Not "trials": check criteria','daily':'IEP says per day: set to once a week',
  'area':'No area','pairing':'Check criteria, method and schedule','criteria':'Criteria not found','schedule':'Schedule not found'};

function pasteSheet(sid,after,prev){
  openSheet(`<h2>Paste goals · ${esc(nameAny(sid))}</h2>
    <p class="hint">Copy the Measurable Annual Goals pages from the IEP PDF and paste them here. You'll check every goal before anything is saved.</p>
    <textarea id="pT" rows="12" style="width:100%;font-size:14px" placeholder="Paste here">${esc(prev||'')}</textarea>
    <div class="sticky-actions"><button class="ghost" id="pC">Cancel</button><button class="primary" id="pR">Read goals</button></div>`,
  el=>{el.querySelector('#pC').addEventListener('click',closeSheet);
    el.querySelector('#pR').addEventListener('click',()=>{const raw=el.querySelector('#pT').value;
      const r=IEPParse.parse(raw,nameAny(sid)); if(!r.goals.length){toast('No goals found in that text');return;}
      reviewPaste(sid,r,raw,after);});});
}

function reviewPaste(sid,r,raw,after){
  const nm=nameAny(sid), have=new Set(Object.values(I.goals).filter(g=>g.sid===sid).map(g=>g.text.replace(/\s+/g,' ').trim()));
  const areas=[...new Set(Object.values(I.goals).map(g=>g.area).concat(r.goals.map(g=>g.area)).filter(Boolean))];
  const c=r.counts;
  openSheet(`<h2>${plural(r.goals.length,'goal')} found · ${esc(nm)}</h2>
    ${r.mismatch?`<div class="note bad">The pieces didn't line up: ${c.goals} goals, ${c.criteria} criteria, ${c.methods} methods, ${c.schedules} schedules. Check each one.</div>`:'<p class="hint">Check each goal. Amber notes need a look. You can edit any goal after adding it.</p>'}
    <datalist id="pAreas">${areas.map(a=>`<option value="${esc(a)}">`).join('')}</datalist>
    ${r.goals.map((g,i)=>{const dup=have.has(g.text.replace(/\s+/g,' ').trim());
      return `<div class="pg" data-i="${i}">
        <label class="pgh"><input type="checkbox" ${dup?'':'checked'}> <b>Goal ${i+1}</b>${dup?' <span class="tag ok">already added</span>':''}
          <input type="text" class="pa" list="pAreas" value="${esc(g.area)}" placeholder="Area"></label>
        <div class="pgt">${esc(IEP.fill(g.text,nm))}</div>
        <div class="meta"><b>${esc(IEP.critText(g.criteria))} · ${esc(IEP.schedText(g.sched))}</b>${g.methods.length?' · '+esc(g.methods.join(', ')):''}</div>
        <div class="meta">IEP: ${esc([g.iep.crit,g.iep.meth,g.iep.sched].filter(Boolean).join(' · ')||'—')}</div>
        ${g.flags.length?`<div class="flags">${g.flags.map(f=>`<span class="tag due">${esc(FLAG[f]||f)}</span>`).join('')}</div>`:''}</div>`;}).join('')}
    <div class="sticky-actions"><button class="ghost" id="rvB">Back</button><button class="primary" id="rvA">Add</button></div>`,
  el=>{const cnt=()=>{const n=el.querySelectorAll('.pg input[type=checkbox]:checked').length; el.querySelector('#rvA').textContent=n?'Add '+plural(n,'goal'):'Add'; el.querySelector('#rvA').disabled=!n;};
    cnt(); el.querySelectorAll('.pg input[type=checkbox]').forEach(x=>x.addEventListener('change',cnt));
    el.querySelector('#rvB').addEventListener('click',()=>pasteSheet(sid,after,raw));
    el.querySelector('#rvA').addEventListener('click',()=>{
      I=loadI(); const pr=I.profiles[sid]||{}; let n=0;
      el.querySelectorAll('.pg').forEach(box=>{ if(!box.querySelector('input[type=checkbox]').checked) return; const g=r.goals[+box.dataset.i];
        const id=uid('g'); I.goals[id]={id,sid,cls:classOf(sid),bank:null,area:box.querySelector('.pa').value.trim().slice(0,60),text:g.text,
          criteria:Object.assign({},g.criteria),methods:g.methods.slice(),sched:Object.assign({},g.sched),iep:Object.assign({},g.iep),
          start:today(),end:pr.reviewDate||(cal()&&cal().end)||'',status:'active',plan:'',created:Date.now(),updated:Date.now()}; n++;});
      saveI(); closeSheet(); toast('Added '+plural(n,'goal')); after();});});
}
