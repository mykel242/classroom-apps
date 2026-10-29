// Network first: always use the newest files when online, fall back to the saved copy offline.
const BUILD='39';
const NAME='setup-'+BUILD;
const FILES=['./','index.html','manifest.webmanifest','../lap/icon.svg','../lap/icon-512.png','../shared/classroom.css','../shared/classroom.js','../shared/app.js','../shared/version.js','../shared/backup.js','../shared/iepcore.js'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(NAME).then(c=>Promise.all(FILES.map(f=>fetch(new Request(f,{cache:'reload'})).then(r=>r.ok&&c.put(f,r)).catch(()=>{})))));
  self.skipWaiting();
});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('setup-')&&x!==NAME).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET'||new URL(req.url).origin!==location.origin) return;
  const fromNet=fetch(req,{cache:'no-store'}).then(r=>{if(r.ok){const c=r.clone();caches.open(NAME).then(x=>x.put(req,c));}return r;});
  const fromCache=()=>caches.match(req,{ignoreSearch:true}).then(r=>r||caches.match('./',{ignoreSearch:true}));
  // slow school Wi-Fi: use the saved copy if the network takes more than 3 seconds
  const timeout=new Promise(res=>setTimeout(()=>fromCache().then(r=>r&&res(r)),3000));
  e.respondWith(Promise.race([fromNet.catch(()=>fromCache()),timeout]));
});
