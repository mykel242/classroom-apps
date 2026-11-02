/* Version footer + update button, shared by every app */
(function(){
  const v=window.APP_VERSION||{n:'?',built:''};
  // one app: every part (planner/, home/, lap/, setup/) lives one folder below the site root
  const root=new URL('../',location.href).href;
  const f=document.createElement('footer');
  f.className='appver';
  const when=v.built?new Date(v.built.replace(' ','T')).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
  f.innerHTML='<span>Version '+v.n+(when?' · '+when:'')+'</span><span id="netstate"></span><button type="button" class="ghost" id="updnow">Check for update</button>';
  (document.getElementById('appver-slot')||document.querySelector('main')||document.body).appendChild(f);
  const net=()=>{document.getElementById('netstate').textContent=navigator.onLine?'':'Offline copy'};
  addEventListener('online',net); addEventListener('offline',net); net();
  document.getElementById('updnow').addEventListener('click',async()=>{
    const b=document.getElementById('updnow'); b.textContent='Checking…';
    try{const r=await navigator.serviceWorker.getRegistration(); if(r) await r.update();}catch(e){}
    location.reload();
  });
  // show any script error on screen, so problems on the tablet can be reported
  const showErr=msg=>{let b=document.getElementById('apperr');
    if(!b){b=document.createElement('div');b.id='apperr';
      b.style.cssText='position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:99;background:#b3322e;color:#fff;padding:10px 12px;border-radius:12px;font:14px system-ui,sans-serif';
      b.addEventListener('click',()=>b.remove()); document.body.appendChild(b);}
    b.textContent='Something went wrong: '+msg+' (version '+v.n+'). Tap to dismiss.';};
  addEventListener('error',e=>showErr(e.message||'unknown error'));
  addEventListener('unhandledrejection',e=>showErr((e.reason&&(e.reason.message||e.reason.name))||'unknown error'));
  // bottom bar shared by every part of the app
  const here=location.pathname.split('/').filter(Boolean).slice(-1)[0]||'';
  const NAV=[['planner','Planner','🗓'],['lap','Laps','✓'],['home','Students','👥'],['setup','Setup','⚙']];
  const nav=document.createElement('nav'); nav.className='appnav'; nav.setAttribute('aria-label','Sections');
  nav.innerHTML=NAV.map(([k,l,i])=>`<a href="${root}${k}/" ${location.pathname.indexOf('/'+k+'/')>=0?'aria-current="page"':''}><span>${i}</span>${l}</a>`).join('')+'<button type="button" id="navBackup"><span>⇪</span><em>Backup</em></button>';
  document.body.appendChild(nav); document.body.classList.add('has-nav');
  nav.querySelector('#navBackup').addEventListener('click',()=>{if(window.ClassroomBackup) ClassroomBackup.open();});
  // ask Chrome not to clear this app's data when space runs low
  if(window.Classroom&&Classroom.protectStorage) Classroom.protectStorage();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register(root+'sw.js',{scope:root}).catch(()=>{});
    // retire the service workers each part used to register on its own
    navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>{if(r.scope!==root) r.unregister();})).catch(()=>{});
    // when a new version takes over, reload once so the screen shows it
    let had=!!navigator.serviceWorker.controller, done=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had&&!done){done=true;location.reload();}had=true;});
  }
})();
