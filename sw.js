const CACHE='champion-coach-v8.2-flow1';
const CORE=['./','./index.html','./styles.css','./pokemon-data.js','./competitive-data.js','./single-competitive-data.js','./core.js','./app.js','./manifest.webmanifest','./version.json','./latest.json'];
const NETWORK_FIRST=new Set(['./','./index.html','./manifest.webmanifest','./version.json']);

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

function relativeKey(request){
  const url=new URL(request.url);
  const scope=new URL(self.registration.scope);
  if(url.origin!==scope.origin || !url.pathname.startsWith(scope.pathname)) return null;
  const path=url.pathname.slice(scope.pathname.length);
  return './'+path;
}

async function networkFirst(request){
  try{
    const response=await fetch(request);
    if(response && response.ok){
      const cache=await caches.open(CACHE);
      cache.put(request,response.clone());
    }
    return response;
  }catch(_){
    return (await caches.match(request)) || (await caches.match('./index.html'));
  }
}

async function cacheFirstWithRefresh(request){
  const cached=await caches.match(request);
  const refresh=fetch(request).then(async response=>{
    if(response && response.ok){
      const cache=await caches.open(CACHE);
      await cache.put(request,response.clone());
    }
    return response;
  }).catch(()=>null);
  return cached || (await refresh) || (await caches.match('./index.html'));
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;
  const key=relativeKey(event.request);
  const isNavigation=event.request.mode==='navigate';
  event.respondWith((isNavigation || (key && NETWORK_FIRST.has(key))) ? networkFirst(event.request) : cacheFirstWithRefresh(event.request));
});
