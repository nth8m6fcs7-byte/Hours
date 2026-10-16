/* Notifications only: this worker deliberately does not cache application pages. */
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 event.waitUntil(self.registration.showNotification('HOURS · 8 horas trabalhadas',{
  body:'Já completaste 8 horas, descontando as pausas. Confirma a tua saída.',
  icon:'/Hours/icons/orbital-192-v3.png',badge:'/Hours/icons/clock-192-v2.png',
  tag:typeof data.tag==='string'?data.tag.slice(0,100):'hours-eight',
  data:{url:'/Hours/'},renotify:false
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const window of windows){if(new URL(window.url).pathname.startsWith('/Hours/'))return window.focus()}
  return self.clients.openWindow('/Hours/');
 })());
});
