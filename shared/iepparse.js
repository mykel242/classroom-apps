/* Read IEP goals pasted from a NYC IEP PDF ("Measurable Annual Goals" table).
   PDF copy jumbles the table: goal text, criteria, method and schedule come out as separate runs,
   sometimes glued together or split across pages. Each kind stays in order, so we collect each
   kind as a list and pair them up by position. Everything is shown for review before saving. */
(function(root){
  const SCHED=/^(\d+|one|two|three|four|five|once|twice)\s*(?:times?|x)?\s*(?:per|a|each|every)\s*(quarter|month|week|day|year|semester|term|marking period|grading period)\.?$/i;
  const SCHED_END=/^(.*\S)\s+((?:\d+|once|twice)\s*(?:times?)?\s*(?:per|a|each)\s*(?:quarter|month|week|day|year|semester|term|marking period|grading period))$/i;
  const CRIT=/^(\d+\s*%|\d+\s*out\s*of\s*\d+\s*(?:consecutive\s*)?trials|\d+\s*consecutive)/i;
  const METH=/^(teacher|provider|recorded\s*observ|observations?\b|class\s*activit|materials\b|portfolio|standardized|assessment|student\s*work|work\s*samples?|rubric|checklist|data\s*collection|running\s*record|anecdotal|progress\s*monitoring)/i;
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
    const cs=!o&&/(\d+)\s*consecutive/i.exec(t);
    if(o&&+o[1]<=+o[2]) c={pct:p?+p[1]:80,x:+o[1],y:+o[2]}; else if(cs) c={pct:p?+p[1]:80,x:+cs[1],y:+cs[1]}; else if(p) c={pct:+p[1],trials:false}; else { c={pct:80,x:4,y:5}; flags.push('criteria'); }
    if(o&&!p) flags.push('no %');
    if(o&&!/trials?/i.test(t)) flags.push('not trials');
    if(cs&&!p) flags.push('no %');
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
  function splitArea(text){ const m=/^([A-Z][A-Za-z &\/]{1,40}?)\s*(?::|\s-|-(?=\s)|–|—)\s*(.*)$/.exec(text);
    if(!m) return {area:'',text};
    let a=m[1].trim().replace(/^Classroom\s+(?=\S)/,'').replace(/\s*\/\s*(SETSS|ICT|SC|Resource)\b/gi,'').replace(/^(SETSS|ICT)\s*\/\s*/i,'');
    return {area:a,text:m[2]}; }
  // pieces of other columns that ended up stuck to the end of a goal's text
  const TAIL_METH=/\s+((?:(?:teacher\s*\/\s*provider\s*)?recorded\s+observations?|teacher\s*\/\s*provider\s+observations?|class\s+activities|teacher[\s-]*made\s+materials|observations?)\.?(?:\s+|$))+$/i;
  function untangle(g){ let text=g.text, crit=g.crit||'', meth=g.meth||'';
    const tm=TAIL_METH.exec(text); if(tm){ meth=(meth?meth+' ':'')+tm[0].trim(); text=text.slice(0,tm.index); }
    if(!crit){ const cm=/\s(\d+\s*%.*)$/.exec(text); if(cm){ crit=cm[1].trim(); text=text.slice(0,cm.index); } }
    return {text:text.trim(),crit,meth}; }
  // swap the student's name in goal text for the {{student}} placeholder
  function unname(text,name){ let s=text; const n=String(name||'').trim(); if(!n) return s;
    const esc=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    [n,...n.split(/\s+/).filter(p=>p.length>=2)].forEach(p=>{ s=s.replace(new RegExp('(^|[^\\p{L}])'+esc(p)+'(?:\\s+'+n.split(/\s+/).slice(1).map(esc).join('\\s+')+')?(?=$|[^\\p{L}])','gu'),'$1{{student}}'); });
    return s.replace(/\{\{student\}\}(\s+\{\{student\}\})+/g,'{{student}}'); }

  // ---- gender-neutral pronouns (he/she/him/her/his/hers/himself/herself -> they/them/their/theirs/themselves)
  const keepCase=(from,to)=>from[0]===from[0].toUpperCase()?to[0].toUpperCase()+to.slice(1):to;
  const VERB_FIX={is:'are',was:'were',has:'have',does:'do',"isn't":"aren't","wasn't":"weren't","doesn't":"don't","hasn't":"haven't"};
  const NOT_VERB=new Set(['will','can','could','would','should','may','might','must','did','also','then','and','or','will,','to']);
  function agree(w){ const l=w.toLowerCase(); if(VERB_FIX[l]) return keepCase(w,VERB_FIX[l]); if(NOT_VERB.has(l)) return w;
    if(/ies$/.test(l)&&l.length>4) return w.slice(0,-3)+'y';
    if(/(ss|sh|ch|x|o)es$/.test(l)) return w.slice(0,-2);
    if(/[^su]s$/.test(l)&&l.length>3) return w.slice(0,-1);
    return w; }
  // "her" is "them" after a verb that takes a person (help her, prompt her) or before a non-noun (to her, with her and),
  // otherwise "their" (her level, her notes, to her notes)
  const OBJ_VERB=/\b(help|helps|helping|give|gives|given|giving|provide|provides|provided|prompt|prompts|prompted|ask|asks|asked|allow|allows|allowed|support|supports|supporting|assist|assists|assisting|encourage|encourages|remind|reminds|show|shows|teach|teaches|tell|tells|let|lets|letting|have|make|makes|motivate|praise|redirect|redirects|cue|cues|cueing|offer|offers|offered|read|reads|model|models|guide|guides|engage|engages|call|calls|seat|seats)\s*$/i;
  const NOUNISH=/^(own|ability|abilities|work|writing|reading|thinking|answers?|peers?|teachers?|level|notes?|best|ideas?|responses?|name|hand|seat|materials?|goals?|class|classmates|understanding|behaviou?r|attention|time|turn|voice)$/i;
  const NOT_NOUN=/^(and|or|but|so|to|with|in|on|at|for|by|from|as|the|a|an|that|when|if|during|before|after|until|about|into|through|over|under|while|because|is|was|will|can|to)$/i;
  function neutral(text,mark){ const M=mark?(w=>'\u0001'+w+'\u0002'):(w=>w);
    let s=String(text||'');
    s=s.replace(/\b(he|she)\b(\s+(?:\w+ly\s+)?)([A-Za-z']+)/gi,(m,p,gap,v)=>M(keepCase(p,'they'))+gap+(agree(v)!==v?M(agree(v)):v));
    s=s.replace(/\b(he|she)\b/gi,p=>M(keepCase(p,'they')));
    s=s.replace(/\b(himself|herself)\b/gi,p=>M(keepCase(p,'themselves')));
    s=s.replace(/\bhers\b/gi,p=>M(keepCase(p,'theirs')));
    s=s.replace(/\bhim\b/gi,p=>M(keepCase(p,'them')));
    s=s.replace(/\bhis\b/gi,p=>M(keepCase(p,'their')));
    s=s.replace(/\bher\b(?=(\s*)([A-Za-z]*))/gi,(p,sp,next,off,all)=>{ const before=all.slice(0,off);
      const obj=!next||NOT_NOUN.test(next)||(OBJ_VERB.test(before)&&!NOUNISH.test(next));
      return M(keepCase(p,obj?'them':'their')); });
    return s; }

  // ---- capitalized words mid-sentence that may be a name left behind
  const OK_CAPS=new Set(('Within Given When With Using Speech Language Classroom Math Mathematics ELA English Spanish Science Social Studies Reading Writing '+
    'Teacher Made Provider Observations Observation Materials Assessment Task Tasks Standardized Test Portfolios Class Activities Common Core State Standards CCLS NYS New York IEP Student I January February March April May June July August September October November December '+
    'Monday Tuesday Wednesday Thursday Friday Mr Mrs Ms Dr WH The A An In On By For As If To During After Before Once Twice Then And Or But Illustrative Lexile Fountas Pinnell Wilson Fundations SETSS ICT Google Chromebook iReady Zearn Grade Unit').split(' '));
  function suspects(text){ const out=new Set(); const t=String(text||'').replace(/\{\{student\}\}/g,'');
    t.replace(/(?<=[^.!?:\n]\s)([A-Z](?:[a-z]+(?:[-'][A-Z]?[a-z]+)?|['’][A-Z][a-z]+))/g,(m,w)=>{ if(!OK_CAPS.has(w)&&!OK_CAPS.has(w.replace(/s$/,''))) out.add(w); return m; });
    return [...out]; }

  // ---- the cleaned format the laptop page produces and the tablet reads back
  function format(goals){ return goals.map((g,i)=>[`GOAL ${i+1}`,`Area: ${g.area||''}`,`Goal: ${g.text}`,`Criteria: ${g.iep.crit||''}`,`Method: ${g.iep.meth||''}`,`Schedule: ${g.iep.sched||''}`].join('\n')).join('\n\n')+'\n'; }
  const tidy=raw=>String(raw||'').replace(/\r/g,'').replace(/\u00a0/g,' ').split('\n').map(l=>l.replace(/^[\s•\-*]+(?=[A-Za-z])/,'').trimEnd()).join('\n');
  const isClean=raw=>{const t=tidy(raw); return /^GOAL\s*\d+\s*:?\s*$/mi.test(t)&&/^Goal\s*:/m.test(t);};
  function parseClean(raw){
    const blocks=tidy(raw).split(/^GOAL\s*\d+\s*:?\s*$/mi).slice(1);
    const goals=blocks.map(b=>{const f={}; let k=null; b.split('\n').forEach(l=>{const m=/^(Area|Goal|Criteria|Method|Schedule)\s*:\s?(.*)$/i.exec(l); if(m){k=m[1].toLowerCase(); f[k]=m[2].trim();} else if(k&&l.trim()) f[k]+=' '+l.trim();}); return f;});
    return {counts:{goals:goals.length,criteria:goals.length,methods:goals.length,schedules:goals.length},mismatch:false,clean:true,
      goals:goals.map(f=>{ if(!f.area){const a=splitArea(f.goal||''); f.area=a.area; f.goal=a.text;}
        const u=untangle({text:f.goal||'',crit:f.criteria,meth:f.method}); f.goal=u.text; f.criteria=u.crit; f.method=u.meth;
        const pc=parseCrit(f.criteria), ps=parseSched(f.schedule), flags=[...pc.flags,...ps.flags]; if(!f.area) flags.push('area');
        return {area:f.area||'',text:f.goal||'',criteria:pc.criteria,methods:parseMeth(f.method),sched:ps.sched,iep:{crit:f.criteria||'',meth:f.method||'',sched:f.schedule||''},flags}; })}; }

  function parse(raw,name){
    if(isClean(raw)){ const r=parseClean(raw); r.goals.forEach(g=>{g.text=[].concat(name||[]).reduce((t,n)=>unname(t,n),g.text);}); return r; }
    const c=collect(raw), n=c.goals.length;
    const mismatch=!(c.crits.length===n&&c.meths.length===n&&c.scheds.length===n);
    return {counts:{goals:n,criteria:c.crits.length,methods:c.meths.length,schedules:c.scheds.length},mismatch,
      goals:c.goals.map((g,i)=>{ const a0=splitArea(g.trim()), u=untangle({text:a0.text,crit:c.crits[i],meth:c.meths[i]}), a={area:a0.area,text:u.text};
        c.crits[i]=u.crit; c.meths[i]=u.meth; const pc=parseCrit(c.crits[i]), ps=parseSched(c.scheds[i]);
        const flags=[...pc.flags,...ps.flags]; if(!a.area) flags.push('area'); if(mismatch) flags.push('pairing');
        return {area:a.area,text:[].concat(name||[]).reduce((t,n)=>unname(t,n),a.text),criteria:pc.criteria,methods:parseMeth(c.meths[i]),sched:ps.sched,
          iep:{crit:c.crits[i]||'',meth:c.meths[i]||'',sched:c.scheds[i]||''},flags}; })};
  }
  const api={parse,collect,parseCrit,parseSched,parseMeth,unname,neutral,suspects,format,isClean,parseClean};
  if(typeof module!=='undefined') module.exports=api; else root.IEPParse=api;
})(typeof window!=='undefined'?window:globalThis);
