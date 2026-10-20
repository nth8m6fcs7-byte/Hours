const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const vm=require('vm');const path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const stub=fs.readFileSync(path.join(__dirname,'auth.cjs'),'utf8').match(/const stub=`([\s\S]*?)`;/)[1];
test('push permission, subscription persistence and disable work without changing shifts',async()=>{
 const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();await page.addInitScript(()=>{
  window.PushManager=function(){};window.permission='granted';window.savedSub=null;
  Object.defineProperty(window,'Notification',{value:{requestPermission:async()=>window.permission},configurable:true});
  const reg={pushManager:{getSubscription:async()=>window.savedSub,subscribe:async()=>window.savedSub={endpoint:'https://fcm.googleapis.com/fcm/send/test',toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'key',auth:'auth'}}),unsubscribe:async()=>{window.savedSub=null;return true}}}};
  Object.defineProperty(navigator,'serviceWorker',{value:{getRegistration:async()=>reg,register:async()=>reg,ready:Promise.resolve(reg)},configurable:true});
 });
 const mock=stub.replace("upsert:async(input,options)=>{", "upsert:async(input,options)=>{if(table==='hours_push_subscriptions'){window.calls.push(['push-subscribe',input]);return {error:null}};")
 .replace("delete:()=>({eq:async(...filter)=>{", "delete:()=>({eq:async(...filter)=>{if(table==='hours_push_subscriptions'){window.calls.push(['push-delete',filter]);return {error:null}};");
 await page.route('https://hours.test/**',r=>r.fulfill({contentType:'text/html',body:html.replace(/^import .*;$/m,()=>mock+'\nwindow.session={user:{id:"user"}};window.records[0].end_time=null;')}));
 await page.route('https://ecxbujytmufnkevddohv.supabase.co/functions/v1/hours-push',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({publicKey:'B'.repeat(87)})}));
 await page.goto('https://hours.test/');await page.waitForFunction(()=>document.getElementById('sync').textContent==='Sincronizado');
 // Reveal the controls in this fixture without creating a shift.
 await page.locator('#active-shift').evaluate(e=>e.classList.remove('hidden'));
 assert.equal(await page.locator('#hours-settings').isVisible(),false);
 await page.click('#settings-open');await page.click('#push-enable');await page.waitForFunction(()=>window.calls.some(c=>c[0]==='push-subscribe'));
 const sub=await page.evaluate(()=>window.calls.find(c=>c[0]==='push-subscribe')[1]);assert.equal(sub.user_id,'user');assert.ok(sub.time_zone);
 assert.match(await page.textContent('#push-status'),/ativadas/);
 await page.click('#push-disable');assert.equal(await page.evaluate(()=>window.savedSub),null);
 await page.evaluate(()=>window.permission='denied');await page.click('#push-enable');
 assert.match(await page.textContent('#push-status'),/Permissão não concedida/);
 assert.equal(await page.evaluate(()=>window.records.length),3);
 }finally{await browser.close()}
});
test('service worker displays a fixed OTTO notification and opens only its own app',async()=>{
 const handlers={};let shown,opened;const self={addEventListener:(type,fn)=>handlers[type]=fn,registration:{showNotification:async(title,options)=>{shown={title,options}}},clients:{matchAll:async()=>[],openWindow:async url=>opened=url}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../push-sw.js'),'utf8'),{self,URL});
 let task;handlers.push({data:{json:()=>({tag:'hours-eight-id',url:'https://evil.example'})},waitUntil:p=>task=p});await task;
 assert.match(shown.title,/8 horas/);assert.equal(shown.options.tag,'hours-eight-id');
 handlers.notificationclick({notification:{close(){}},waitUntil:p=>task=p});await task;assert.equal(opened,'/Hours/');
});
