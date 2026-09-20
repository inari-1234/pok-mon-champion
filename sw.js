const VERSION='0.8.4-poc.1';
const CACHE='champion-coach-v8.4-screenshot-poc1';
const CORE=[
  './',
  './index.html',
  `./styles.css?v=${VERSION}`,
  `./pokemon-data.js?v=${VERSION}`,
  `./competitive-data.js?v=${VERSION}`,
  `./single-competitive-data.js?v=${VERSION}`,
  `./core.js?v=${VERSION}`,
  `./screenshot-recognition.js?v=${VERSION}`,
  `./app.js?v=${VERSION}`,
  `./manifest.webmanifest?v=${VERSION}`,
  './version.json',
  './latest.json'
];

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

async function networkFirst(request){
  try{
    const response=await fetch(request);
    if(response && response.ok){
      const cache=await caches.open(CACHE);
      await cache.put(request,response.clone());
    }
    return response;
  }catch(_){
    const cached=await caches.match(request);
    if(cached) return cached;
    if(request.mode==='navigate') return (await caches.match('./index.html')) || Response.error();
    return Response.error();
  }
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;
  event.respondWith(networkFirst(event.request));
});
