// One service worker for the whole Classroom app. Network first: newest files when online, saved copy offline.
const BUILD='54';
const NAME='classroom-'+BUILD;
const FILES=["./", "index.html", "app.webmanifest", "planner/", "planner/day.js", "planner/icon-512.png", "planner/icon.svg", "planner/index.html", "home/", "home/activity.js", "home/backup.js", "home/groups.js", "home/icon-512.png", "home/icon.svg", "home/index.html", "home/main.js", "home/paste.js", "home/prep.js", "home/report.js", "home/students.js", "lap/", "lap/icon-512.png", "lap/icon.svg", "lap/index.html", "setup/", "setup/index.html", "shared/app.js", "shared/backup.js", "shared/bundle.js", "shared/classroom.css", "shared/classroom.js", "shared/goalgroups.js", "shared/iepcore.js", "shared/iepparse.js", "shared/version.js"];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(NAME).then(c=>Promise.all(FILES.map(f=>fetch(new Request(f,{cache:'reload'})).then(r=>r.ok&&c.put(f,r)).catch(()=>{})))));
  self.skipWaiting();
});
// drop older caches, including the ones each app used to keep on its own
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==NAME).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET'||new URL(req.url).origin!==location.origin) return;
  const fromNet=fetch(req,{cache:'no-store'}).then(r=>{if(r.ok){const c=r.clone();caches.open(NAME).then(x=>x.put(req,c));}return r;});
  e.respondWith(fromNet.catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||caches.match(new URL('index.html',req.url).href))));
});
