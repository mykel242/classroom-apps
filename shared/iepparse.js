/* Read IEP goals pasted from a NYC IEP PDF ("Measurable Annual Goals" table).
   PDF copy jumbles the table: goal text, criteria, method and schedule come out as separate runs,
   sometimes glued together or split across pages. Each kind stays in order, so we collect each
   kind as a list and pair them up by position. Everything is shown for review before saving. */
(function(root){
  const SCHED=/^(\d+|one|two|three|four|five|once|twice)\s*(?:times?|x)?\s*(?:per|a|each|every)\s*(quarter|month|week|day|year|semester|term|marking period|grading period)\.?$/i;
  const SCHED_END=/^(.*\S)\s+((?:\d+|once|twice)\s*(?:times?)?\s*(?:per|a|each)\s*(?:quarter|month|week|day|year|semester|term|marking period|grading period))$/i;
  const CRIT=/^(\d+\s*%\s*accuracy|\d+\s*out\s*of\s*\d+\s*trials)/i;
  const METH=/^(teacher|provider|observations?\b|class\s*activit|materials\b|portfolio|standardized|assessment|student\s*work|work\s*samples?|rubric|checklist|data\s*collection|running\s*record|anecdotal|progress\s*monitoring)/i;
  const WORDN={one:1,two:2,three:3,four:4,five:5,once:1,twice:2};

  function lines(raw){
    let t=String(raw||'').replace(/\r/g,'').replace(/([a-z])#([a-z])/g,'$1ff$2');
    // pieces glued together where PDF columns met
    t=t.replace(/((?:per|a|each)\s+(?:quarter|month|week|day|year|semester|term|marking period|grading period)|Observations|[Mm]aterials|[Aa]ctivities\.?)(?=[A-Za-z])/g,'$1\n');
    return t.split('\n').map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);
  }
  const isHeader=l=>/[A-Z]/.test(l)&&!/[a-z]/.test(l)&&l.length>2&&!/^\d/.test(l);
  const join=(a,b)=>!a?b:(/-$/.test(a)&&/^[a-z0-9]/.test(b)?a+b:a+' '+b);

  function collect(raw){
    const goals=[], crits=[], meths=[], scheds=[];
    let hdr=new Set(), block=null, cur=null, goalInBlock=false;
    // a full header row (goal + other columns) means a goal row follows, with its other columns inline
    const startBlock=()=>{ const g=hdr.has('goal'); block={goal:g,crit:!g&&hdr.has('crit'),meth:!g&&hdr.has('meth'),sched:!g&&hdr.has('sched')}; hdr=new Set(); cur=null; goalInBlock=false; };
    const addGoalText=l=>{ if(block.goal&&!goalInBlock){ goals.push(l); goalInBlock=true; } else if(goals.length) goals[goals.length-1]=join(goals[goals.length-1],l); else goals.push(l); cur='goal'; };
    let prevHdr='';
    lines(raw).forEach(l=>{
      if(isHeader(l)){ const u=l.toUpperCase();
        if(/IEP IS IN EFFECT/.test(u)) hdr.add('goal');
        else if(/^ACHIEVED/.test(u)) hdr.add('crit');
        else if(/WILL BE MEASURED/.test(u)) hdr.add(/HOW/.test(prevHdr)?'meth':/WHEN/.test(prevHdr)?'sched':'meth');
        prevHdr=u; block=null; return; }
      prevHdr=''; if(!block) startBlock();
      if(SCHED.test(l)){ scheds.push(l); cur=null; return; }
      if(block.goal||cur==='goal'){ const m=SCHED_END.exec(l); if(m&&!CRIT.test(l)){ addGoalText(m[1]); scheds.push(m[2]); cur=null; return; } }
      if(CRIT.test(l)){ const m=/^(.*?\btrials\b\.?)\s*(.*)$/i.exec(l);
        if(m&&m[2]&&METH.test(m[2])){ crits.push(m[1]); meths.push(m[2]); cur='meth'; } else { crits.push(l); cur='crit'; } return; }
      if((cur==='crit'||cur==='meth'||block.meth||(block.crit&&cur!=='goal'))&&METH.test(l)){
        if(cur==='meth') meths[meths.length-1]=join(meths[meths.length-1],l); else meths.push(l); cur='meth'; return; }
      if(cur==='crit'&&(block.crit||/^[a-z0-9(]/.test(l))){ crits[crits.length-1]=join(crits[crits.length-1],l); return; }
      if(block.crit&&!cur){ crits.push(l); cur='crit'; return; }
      addGoalText(l);
    });
    return {goals,crits,meths,scheds};
  }

  function parseCrit(s){ const t=String(s||''), p=/(\d+)\s*%/.exec(t), o=/(\d+)\s*out\s*of\s*(\d+)/i.exec(t), flags=[];
    let c;
    if(o&&+o[1]<=+o[2]) c={pct:p?+p[1]:80,x:+o[1],y:+o[2]}; else if(p) c={pct:+p[1],trials:false}; else { c={pct:80,x:4,y:5}; flags.push('criteria'); }
    if(o&&!p) flags.push('no %');
    if(o&&!/trials?/i.test(t)) flags.push('not trials');
    return {criteria:c,flags}; }
  function parseSched(s){ const m=SCHED.exec(String(s||'').trim());
    if(!m) return {sched:{n:1,per:'month'},flags:['schedule']};
    const n=WORDN[m[1].toLowerCase()]||+m[1]||1, u=m[2].toLowerCase();
    if(u==='day') return {sched:{n:1,per:'week'},flags:['daily']};  // daily observation goals: weekly here, change if needed
    const per={quarter:'quarter',month:'month',week:'week',year:'year',semester:'period',term:'period','marking period':'period','grading period':'period'}[u]||'month';
    return {sched:{n:Math.min(20,n),per},flags:[]}; }
  function parseMeth(s){ const t=String(s||''), out=[];
    const add=m=>{if(!out.includes(m)) out.push(m);};
    if(/teacher[\s-]*made/i.test(t)) add('Teacher Made Materials');
    if(/class\s*activit/i.test(t)) add('Class Activities');
    if(/provider/i.test(t)) add('Teacher/Provider Observation');
    else if(/observ/i.test(t)) add('Teacher Observation');
    if(/portfolio/i.test(t)) add('Portfolios');
    if(/standardized/i.test(t)) add('Standardized Test');
    if(/assessment task/i.test(t)) add('Assessment Task');
    if(!out.length&&t) add(t.replace(/\.$/,'').slice(0,60));
    return out; }
  function splitArea(text){ const m=/^([A-Z][A-Za-z &\/]{1,40}):\s*(.*)$/.exec(text);
    if(!m) return {area:'',text};
    let a=m[1].trim(); a=a.replace(/^Classroom\s+(?=\S)/,''); return {area:a,text:m[2]}; }
  // swap the student's name in goal text for the {{student}} placeholder
  function unname(text,name){ let s=text; const n=String(name||'').trim(); if(!n) return s;
    const esc=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    [n,...n.split(/\s+/).filter(p=>p.length>=2)].forEach(p=>{ s=s.replace(new RegExp('(^|[^\\p{L}])'+esc(p)+'(?:\\s+'+n.split(/\s+/).slice(1).map(esc).join('\\s+')+')?(?=$|[^\\p{L}])','gu'),'$1{{student}}'); });
    return s.replace(/\{\{student\}\}(\s+\{\{student\}\})+/g,'{{student}}'); }

  function parse(raw,name){
    const c=collect(raw), n=c.goals.length;
    const mismatch=!(c.crits.length===n&&c.meths.length===n&&c.scheds.length===n);
    return {counts:{goals:n,criteria:c.crits.length,methods:c.meths.length,schedules:c.scheds.length},mismatch,
      goals:c.goals.map((g,i)=>{ const a=splitArea(g.trim()), pc=parseCrit(c.crits[i]), ps=parseSched(c.scheds[i]);
        const flags=[...pc.flags,...ps.flags]; if(!a.area) flags.push('area'); if(mismatch) flags.push('pairing');
        return {area:a.area,text:[].concat(name||[]).reduce((t,n)=>unname(t,n),a.text),criteria:pc.criteria,methods:parseMeth(c.meths[i]),sched:ps.sched,
          iep:{crit:c.crits[i]||'',meth:c.meths[i]||'',sched:c.scheds[i]||''},flags}; })};
  }
  const api={parse,collect,parseCrit,parseSched,parseMeth,unname};
  if(typeof module!=='undefined') module.exports=api; else root.IEPParse=api;
})(typeof window!=='undefined'?window:globalThis);
