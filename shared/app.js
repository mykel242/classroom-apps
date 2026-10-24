/* Version footer + update button, shared by every app */
(function(){
  const v=window.APP_VERSION||{n:'?',built:''};
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
  // ask Chrome not to clear this app's data when space runs low
  if(window.Classroom&&Classroom.protectStorage) Classroom.protectStorage();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
    // when a new version takes over, reload once so the screen shows it
    let had=!!navigator.serviceWorker.controller, done=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had&&!done){done=true;location.reload();}had=true;});
  }
})();
