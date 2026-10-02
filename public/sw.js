const CACHE='rummi-shell-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/']))));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.pathname.startsWith('/socket.io')||url.pathname.startsWith('/api'))return;
  event.respondWith(fetch(event.request).then(response=>{
    const copy=response.clone();
    caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{});
    return response;
  }).catch(()=>caches.match(event.request)));
});
