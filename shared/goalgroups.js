/* Find IEP goals across students that one shared probe could measure.
   Similarity = cosine of weighted keywords (boilerplate removed, simple stemming), only within the same subject.
   Groups = goals linked by similarity above a threshold (one goal per student per group). */
(function(root){
  const STOP=new Set(('a an the and or of to in on for by with from as at is are be been will would can could able within one year years iep during '+
    'student students their they them his her he she given when using use uses used provided provide including include e g eg ex etc such '+
    'accuracy trials trial out consecutive measured measure percent teacher made materials class activities activity independently correctly '+
    'least at more than no less two three four five six seven eight nine ten each all any that this these those which who into through grade level').split(' '));
  const stem=w=>w.replace(/(ing|ed|es|s|ly)$/,'').replace(/(ation|ion)$/,'');
  function terms(text){ return String(text||'').toLowerCase().replace(/\{\{student\}\}/g,' ').replace(/[^a-z\s-]/g,' ').split(/[\s-]+/)
    .filter(w=>w.length>2&&!STOP.has(w)).map(stem).filter(w=>w.length>2&&!STOP.has(w)); }
  function vectors(goals){
    const docs=goals.map(g=>terms(g.text)), df={};
    docs.forEach(d=>new Set(d).forEach(w=>df[w]=(df[w]||0)+1));
    const N=docs.length;
    return docs.map(d=>{const v={}; d.forEach(w=>v[w]=(v[w]||0)+1); let n=0;
      Object.keys(v).forEach(w=>{v[w]=v[w]*Math.log(1+N/df[w]); n+=v[w]*v[w];}); n=Math.sqrt(n)||1; Object.keys(v).forEach(w=>v[w]/=n); return v;});
  }
  const cos=(a,b)=>{let s=0; for(const k in a) if(b[k]) s+=a[k]*b[k]; return s;};
  // goals: [{id,sid,subj,text}] -> [{ids:[...], score, words:[...]}]
  function suggest(goals,threshold){
    const th=threshold||0.3, V=vectors(goals), n=goals.length, pairs=[];
    for(let i=0;i<n;i++) for(let j=i+1;j<n;j++){
      if(goals[i].sid===goals[j].sid) continue;
      if((goals[i].subj||'')!==(goals[j].subj||'')) continue;
      const s=cos(V[i],V[j]); if(s>=th) pairs.push([s,i,j]); }
    pairs.sort((a,b)=>b[0]-a[0]);
    // greedy merge: strongest links first, never two goals of the same student in a group
    const grp=goals.map((g,i)=>({m:[i],sids:new Set([g.sid])})), of=goals.map((g,i)=>i);
    pairs.forEach(([s,i,j])=>{const a=of[i], b=of[j]; if(a===b) return; const A=grp[a], B=grp[b];
      if([...B.sids].some(x=>A.sids.has(x))) return;
      // average link: the two groups must be similar on the whole, not through one bridging goal
      let t=0; A.m.forEach(x=>B.m.forEach(y=>{t+=cos(V[x],V[y]);})); if(t/(A.m.length*B.m.length)<th) return;
      B.m.forEach(k=>{A.m.push(k); of[k]=a;}); B.sids.forEach(x=>A.sids.add(x)); grp[b]=null;});
    return grp.filter(g=>g&&g.m.length>1).map(g=>{
      const vs=g.m.map(i=>V[i]), common={};
      vs.forEach(v=>Object.keys(v).forEach(w=>common[w]=(common[w]||0)+v[w]));
      const shared=Object.keys(common).filter(w=>vs.filter(v=>v[w]).length>=Math.max(2,Math.ceil(vs.length*0.6))).sort((a,b)=>common[b]-common[a]);
      let sc=0,c=0; for(let x=0;x<g.m.length;x++) for(let y=x+1;y<g.m.length;y++){sc+=cos(vs[x],vs[y]);c++;}
      const first=terms(goals[g.m[0]].text), top=shared.slice(0,4).sort((a,b)=>first.indexOf(a)-first.indexOf(b));
      return {ids:g.m.map(i=>goals[i].id),score:c?sc/c:0,words:top};
    }).sort((a,b)=>b.ids.length-a.ids.length||b.score-a.score);
  }
  const api={suggest,terms};
  if(typeof module!=='undefined') module.exports=api; else root.GoalGroups=api;
})(typeof window!=='undefined'?window:globalThis);
