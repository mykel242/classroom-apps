/* Version footer + update button, shared by every app */
(function(){
  const v=window.APP_VERSION||{n:'?',built:''};
  const f=document.createElement('footer');
  f.className='appver';
  const when=v.built?new Date(v.built.replace(' ','T')).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
  f.innerHTML='<span>Version '+v.n+(when?' · '+when:'')+'</span><span id="netstate"></span><button type="button" class="ghost" id="updnow">Check for update</button>';
  (document.querySelector('main')||document.body).appendChild(f);
  const net=()=>{document.getElementById('netstate').textContent=navigator.onLine?'':'Offline copy'};
  addEventListener('online',net); addEventListener('offline',net); net();
  document.getElementById('updnow').addEventListener('click',async()=>{
    const b=document.getElementById('updnow'); b.textContent='Checking…';
    try{const r=await navigator.serviceWorker.getRegistration(); if(r) await r.update();}catch(e){}
    location.reload();
  });
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
    // when a new version takes over, reload once so the screen shows it
    let had=!!navigator.serviceWorker.controller, done=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had&&!done){done=true;location.reload();}had=true;});
  }
})();
