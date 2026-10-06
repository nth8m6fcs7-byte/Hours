const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const stub=fs.readFileSync(path.join(__dirname,'auth.cjs'),'utf8').match(/const stub=`([\s\S]*?)`;/)[1];

async function withDays(run){
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://hours.test/**',route=>route.fulfill({contentType:'text/html',body:html.replace(/^import .*;$/m,stub+"\nwindow.session={user:{id:'user'}};window.records.forEach(r=>r.user_id='user');")}));
  await page.goto('https://hours.test/');
  await page.waitForFunction(()=>document.getElementById('sync').textContent==='Sincronizado');
  await run(page);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
}
const saved=page=>page.waitForFunction(()=>document.getElementById('form-msg').className==='ok');
test('Folga confirms replacement, cancels safely, clears hours and supports deletion and normal work',async()=>{
 await withDays(async page=>{
  await page.fill('#date','2026-10-05');
  page.once('dialog',async dialog=>{assert.match(dialog.message(),/Substituir por Folga/);await dialog.dismiss()});
  await page.click('#day-off');await page.waitForFunction(()=>!document.getElementById('day-off').disabled);
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c[0]==='upsert').length),0);
  page.once('dialog',dialog=>dialog.accept());await page.click('#day-off');await saved(page);
  const row=await page.evaluate(()=>window.records.find(r=>r.id==='one'));
  assert.equal(row.day_type,'day_off');for(const key of ['start_time','end_time','duration_minutes'])assert.equal(row[key],null);
  assert.match(await page.locator('#list .shift').first().innerText(),/Folga.*0h00/s);
  assert.equal(await page.textContent('#tips-total'),'0h00');assert.equal(await page.textContent('#mine-total'),'9h00');
  await page.click('#edit-records');assert.equal(await page.locator('[data-edit="one"]').count(),0);assert.equal(await page.locator('[data-del="one"]').count(),1);
  await page.fill('#date','2026-10-05');await page.fill('#start','09:00');await page.fill('#end','17:00');await page.click('#save');
  await page.waitForFunction(()=>window.records.find(r=>r.id==='one').day_type==='work'&&document.getElementById('sync').textContent==='Sincronizado');
  await page.click('[data-edit="one"]');await page.click('#save');
  await page.waitForFunction(()=>window.calls.some(c=>c[0]==='edit'));
  assert.equal(await page.evaluate(()=>window.calls.find(c=>c[0]==='edit')[2].day_type),'work');
  await page.fill('#date','2026-10-06');await page.click('#day-off');await saved(page);
  const id=await page.evaluate(()=>window.records.find(r=>r.work_date==='2026-10-06').id);
  page.once('dialog',dialog=>dialog.accept());await page.click(`[data-del="${id}"]`);
  await page.waitForFunction(()=>!window.records.some(r=>r.work_date==='2026-10-06'));
 });
});
test('Férias validates dates, confirms all conflicts and saves inclusively across months with zero totals',async()=>{
 await withDays(async page=>{
  await page.click('#vacation-toggle');assert.equal(await page.getAttribute('#vacation-toggle','aria-expanded'),'true');
  await page.fill('#vacation-start','2026-10-05');await page.fill('#vacation-end','2026-10-01');await page.click('#vacation-save');
  assert.match(await page.textContent('#form-msg'),/posterior/);assert.equal(await page.evaluate(()=>window.calls.length),0);
  await page.fill('#vacation-start','2026-09-30');await page.fill('#vacation-end','2026-10-05');
  page.once('dialog',async dialog=>{assert.match(dialog.message(),/3 dias/);await dialog.dismiss()});await page.click('#vacation-save');
  await page.waitForFunction(()=>!document.getElementById('vacation-save').disabled);assert.equal(await page.evaluate(()=>window.calls.length),0);
  page.once('dialog',dialog=>dialog.accept());await page.click('#vacation-save');await saved(page);
  const writes=await page.evaluate(()=>window.calls.filter(c=>c[0]==='upsert'));
  assert.equal(writes.length,1);assert.equal(writes[0][2].length,6);assert.equal(writes[0][3].onConflict,'user_id,work_date');
  for(const row of writes[0][2]){assert.equal(row.day_type,'vacation');assert.equal(row.start_time,null);assert.equal(row.end_time,null);assert.equal(row.duration_minutes,null)}
  assert.equal(await page.inputValue('#month-filter'),'2026-09');
  await page.selectOption('#month-filter','');assert.equal(await page.locator('#list .shift').count(),6);
  assert.equal(await page.textContent('#history-total'),'0h00');assert.equal(await page.textContent('#tips-total'),'0h00');assert.equal(await page.textContent('#mine-total'),'0h00');
  await page.click('#edit-records');assert.equal(await page.locator('[data-edit]').count(),0);assert.equal(await page.locator('[data-del]').count(),6);
  await page.click('#vacation-toggle');
  for(const width of [320,375,390,430,780]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
  if(process.env.DAYS_PREVIEW_PATH){await page.setViewportSize({width:390,height:844});await page.screenshot({path:process.env.DAYS_PREVIEW_PATH,fullPage:true})}
 });
});
test('Férias includes leap day and leaves records untouched after a failed check or save',async()=>{
 await withDays(async page=>{
  await page.click('#vacation-toggle');await page.fill('#vacation-start','2028-02-28');await page.fill('#vacation-end','2028-03-01');
  await page.evaluate(()=>window.recordErrorAt=0);await page.click('#vacation-save');await page.waitForFunction(()=>!document.getElementById('vacation-save').disabled);
  assert.match(await page.textContent('#form-msg'),/History unavailable/);assert.equal(await page.evaluate(()=>window.calls.length),0);
  await page.evaluate(()=>{window.recordErrorAt=null;window.saveError='Não foi possível guardar'});await page.click('#vacation-save');
  await page.waitForFunction(()=>!document.getElementById('vacation-save').disabled);assert.equal(await page.evaluate(()=>window.records.length),3);
  await page.evaluate(()=>window.saveError=null);await page.click('#vacation-save');await saved(page);
  assert.deepEqual(await page.evaluate(()=>window.records.filter(r=>r.day_type==='vacation').map(r=>r.work_date)),['2028-02-28','2028-02-29','2028-03-01']);
 });
});
test('non-work ignores stale hours, retains notes and verifies conflicts outside cached history',async()=>{
 await withDays(async page=>{
  await page.evaluate(()=>{Object.assign(window.records[0],{day_type:'day_off',duration_minutes:480,notes:'Nota preservada'});window.authEvent('SIGNED_IN')});
  await page.waitForFunction(()=>document.querySelector('#list .shift-main strong').textContent==='Folga');
  assert.equal(await page.textContent('#tips-total'),'0h00');
  await page.fill('#date','2026-10-05');await page.click('#vacation-toggle');await page.click('#vacation-save');await saved(page);
  assert.equal(await page.evaluate(()=>window.records[0].notes),'Nota preservada');
  assert.equal(await page.evaluate(()=>window.records[0].duration_minutes),null);
  await page.evaluate(()=>window.records.push({id:'fresh',user_id:'user',work_date:'2026-10-06',start_time:'09:00',end_time:'17:00',day_type:'work'}));
  await page.fill('#date','2026-10-06');
  page.once('dialog',async dialog=>{assert.match(dialog.message(),/Substituir por Folga/);await dialog.dismiss()});await page.click('#day-off');
  await page.waitForFunction(()=>!document.getElementById('day-off').disabled);
  assert.equal(await page.evaluate(()=>window.records.find(r=>r.id==='fresh').day_type),'work');
 });
});
