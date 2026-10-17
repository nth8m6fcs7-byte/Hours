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
  await editSettings(page);assert.equal(await page.locator('[data-edit="one"]').count(),0);assert.equal(await page.locator('[data-del="one"]').count(),1);
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
  await editSettings(page);assert.equal(await page.locator('[data-edit]').count(),0);assert.equal(await page.locator('[data-del]').count(),6);
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

test('entry persists, locks, resumes after reopening and completes an overnight shift',async()=>{
 await withDays(async page=>{
  await page.clock.setFixedTime(new Date('2026-10-06T22:00:00'));
  await page.fill('#date','2026-10-06');await page.fill('#start','22:00');
  await page.click('#save');await saved(page);
  assert.equal(await page.isDisabled('#start'),true);
  assert.equal(await page.isDisabled('#date'),true);
  assert.equal(await page.textContent('#save'),'Parar');
  assert.match(await page.textContent('#list'),/Em curso/);
  const record=await page.evaluate(()=>window.records.find(r=>r.work_date==='2026-10-06'));
  assert.equal(record.end_time,null);
  assert.equal(await page.textContent('#tips-total'),'8h00');
  await page.click('#entry-summary');await page.fill('#start','21:30');await page.click('#save');await saved(page);
  assert.equal(await page.isDisabled('#start'),true);
  const persisted=await page.evaluate(()=>window.records);
  await page.unroute('https://hours.test/**');
  await page.route('https://hours.test/**',route=>route.fulfill({contentType:'text/html',body:html.replace(/^import .*;$/m,()=>stub+'\nwindow.session={user:{id:"user"}};window.records='+JSON.stringify(persisted)+';')}));
  await page.reload();await page.waitForFunction(()=>document.getElementById('start').disabled);
  assert.equal(await page.inputValue('#start'),'21:30');assert.equal(await page.inputValue('#date'),'2026-10-06');
  await page.clock.setFixedTime(new Date('2026-10-07T02:00:00'));await page.click('#save');
  await page.waitForFunction(()=>!document.getElementById('start').disabled&&document.getElementById('sync').textContent==='Sincronizado');
  assert.equal(await page.textContent('#tips-total'),'12h30');
  assert.doesNotMatch(await page.textContent('#list'),/Em curso/);
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:844});
   const a=await page.locator('#start').boundingBox(),b=await page.locator('#end').boundingBox();
   assert.equal(a.height,44);assert.ok(a.width<=180);assert.equal(a.y,b.y);
  }
 });
});

test('failed entry save keeps the draft unlocked and failed completion keeps the stored entry',async()=>{
 await withDays(async page=>{
  await page.clock.setFixedTime(new Date('2026-10-06T09:00:00'));
  await page.fill('#date','2026-10-06');await page.fill('#start','09:00');
  await page.evaluate(()=>window.saveError='Falha de rede');await page.click('#save');
  await page.waitForFunction(()=>!document.getElementById('save').disabled);
  assert.equal(await page.isDisabled('#start'),false);assert.equal(await page.inputValue('#start'),'09:00');
  await page.evaluate(()=>window.saveError=null);await page.click('#save');await saved(page);
  await page.clock.setFixedTime(new Date('2026-10-06T17:00:00'));await page.evaluate(()=>window.saveError='Falha de rede');
  await page.click('#save');await page.waitForFunction(()=>!document.getElementById('save').disabled);
  assert.equal(await page.isDisabled('#start'),true);assert.equal(await page.textContent('#save'),'Parar');
 });
});

test('unconfirmed entry survives reload and remains visibly unconfirmed',async()=>{
 await withDays(async page=>{
  await page.fill('#date','2026-10-16');await page.fill('#start','08:30');
  await page.reload();await page.waitForFunction(()=>document.getElementById('start').value==='08:30');
  assert.equal(await page.inputValue('#date'),'2026-10-16');
  assert.equal(await page.isDisabled('#start'),false);
  assert.match(await page.textContent('#shift-lock'),/por confirmar/);
  assert.equal(await page.locator('#active-shift').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.calls.some(c=>c[0]==='upsert')),false);
 });
});

test('timer recalculates overnight elapsed time, turns red at eight hours and resumes the saved entry',async()=>{
 await withDays(async page=>{
  await page.clock.setFixedTime(new Date('2026-10-17T05:59:59'));
  await page.evaluate(()=>{window.records=[{id:'open-timer',user_id:'user',work_date:'2026-10-16',start_time:'22:00:00',end_time:null,duration_minutes:null}];window.authEvent('SIGNED_IN')});
  await page.waitForFunction(()=>document.getElementById('shift-timer').textContent==='07:59:59');
  assert.equal(await page.locator('#active-shift').evaluate(e=>e.classList.contains('over-limit')),false);
  await page.clock.setFixedTime(new Date('2026-10-17T06:00:00'));
  await page.waitForFunction(()=>document.getElementById('active-shift').classList.contains('over-limit'));
  assert.match(await page.textContent('#timer-alert'),/8 horas/);
  await page.click('#toggle-shift');await page.click('#settings-open');await page.click('#resume-active');
  assert.equal(await page.inputValue('#date'),'2026-10-16');assert.equal(await page.isDisabled('#start'),true);
  await page.click('#settings-open');await page.locator('.settings-calendar summary').click();const downloadPromise=page.waitForEvent('download');await page.click('#calendar-alert');const download=await downloadPromise;await page.getByRole('button',{name:'Fechar definições'}).click();
  assert.equal(download.suggestedFilename(),'hours-lembrete-8h.ics');
  const calendar=fs.readFileSync(await download.path(),'utf8');assert.match(calendar,/BEGIN:VALARM/);assert.match(calendar,/DTSTART:20261017T060000Z/);
  await page.click('#save');
  await page.waitForFunction(()=>document.getElementById('active-shift').classList.contains('hidden'));
  assert.equal(await page.textContent('#tips-total'),'8h00');
 });
});

test('pauses freeze worked time, survive reopening, shift the eight-hour target and reduce final totals',async()=>{
 await withDays(async page=>{
  await page.clock.setFixedTime(new Date('2026-10-16T10:30:00'));
  await page.fill('#date','2026-10-16');await page.fill('#start','10:30');await page.click('#save');await saved(page);
  await page.clock.setFixedTime(new Date('2026-10-16T12:30:00'));
  await page.click('#pause-toggle');await page.waitForFunction(()=>document.getElementById('timer-title').textContent==='Em pausa');
  await page.clock.setFixedTime(new Date('2026-10-16T13:00:00'));
  await page.waitForFunction(()=>document.getElementById('shift-timer').textContent==='02:00:00');
  assert.equal(await page.isDisabled('#calendar-alert'),true);
  const persisted=await page.evaluate(()=>window.records);
  await page.unroute('https://hours.test/**');
  await page.route('https://hours.test/**',route=>route.fulfill({contentType:'text/html',body:html.replace(/^import .*;$/m,()=>stub+'\nwindow.session={user:{id:"user"}};window.records='+JSON.stringify(persisted)+';')}));
  await page.reload();await page.waitForFunction(()=>document.getElementById('timer-title').textContent==='Em pausa');
  assert.equal(await page.textContent('#shift-timer'),'02:00:00');
  await page.click('#pause-toggle');await page.waitForFunction(()=>document.getElementById('timer-title').textContent==='Turno em curso');
  await page.clock.setFixedTime(new Date('2026-10-16T18:30:00'));
  await page.waitForFunction(()=>document.getElementById('shift-timer').textContent==='07:30:00');
  assert.equal(await page.locator('#active-shift').evaluate(e=>e.classList.contains('over-limit')),false);
  await page.click('#settings-open');await page.locator('.settings-calendar summary').click();const downloadPromise=page.waitForEvent('download');await page.click('#calendar-alert');const download=await downloadPromise;await page.getByRole('button',{name:'Fechar definições'}).click();
  assert.match(fs.readFileSync(await download.path(),'utf8'),/DTSTART:20261016T190000Z/);
  await page.clock.setFixedTime(new Date('2026-10-16T19:00:00'));
  await page.waitForFunction(()=>document.getElementById('active-shift').classList.contains('over-limit'));
  await page.click('#save');await page.waitForFunction(()=>document.getElementById('active-shift').classList.contains('hidden'));
  const row=await page.evaluate(()=>window.records.find(r=>r.work_date==='2026-10-16'));
  assert.equal(row.break_seconds,1800);assert.equal(row.paused_at,null);
  assert.equal(await page.textContent('#tips-total'),'8h00');
 });
});

test('failed pause write does not stop the timer; finishing during a pause deducts its duration',async()=>{
 await withDays(async page=>{
  await page.clock.setFixedTime(new Date('2026-10-16T10:00:00'));
  await page.fill('#date','2026-10-16');await page.fill('#start','10:00');await page.click('#save');await saved(page);
  await page.clock.setFixedTime(new Date('2026-10-16T12:00:00'));
  await page.evaluate(()=>window.saveError='Sem rede');await page.click('#pause-toggle');
  await page.waitForFunction(()=>document.getElementById('pause-msg').textContent==='Sem rede');
  assert.equal(await page.textContent('#pause-toggle'),'Fazer pausa');
  await page.evaluate(()=>window.saveError=null);await page.click('#pause-toggle');
  await page.waitForFunction(()=>document.getElementById('timer-title').textContent==='Em pausa');
  await page.clock.setFixedTime(new Date('2026-10-16T12:30:00'));
  await page.click('#save');
  await page.waitForFunction(()=>document.getElementById('active-shift').classList.contains('hidden'));
  assert.equal(await page.textContent('#tips-total'),'2h00');
 });
});

async function editSettings(page){if(!await page.locator('#hours-settings').isVisible())await page.click('#settings-open');await page.click('#edit-records')}
async function openAccount(page){if(!await page.locator('#hours-settings').isVisible())await page.click('#settings-open');if(!await page.locator('#account').evaluate(e=>e.open))await page.click('#account summary')}


test('starting an empty form records the current local time and locks entry without manual input',async()=>{
 await withDays(async page=>{
  await page.clock.setFixedTime(new Date('2026-10-16T17:42:00'));
  await page.fill('#date','2026-10-01');
  assert.equal(await page.inputValue('#start'),'');
  await page.click('#save');await saved(page);
  assert.equal(await page.inputValue('#start'),'17:42');
  assert.equal(await page.inputValue('#date'),'2026-10-16');
  assert.equal(await page.isDisabled('#start'),true);
  const record=await page.evaluate(()=>window.records.find(r=>r.work_date==='2026-10-16'));
  assert.equal(record.start_time,'17:42');assert.equal(record.end_time,null);
  await page.click('#entry-summary');await page.fill('#start','17:30');await page.click('#save');await saved(page);
  assert.equal(await page.isDisabled('#start'),true);
  await page.clock.setFixedTime(new Date('2026-10-16T18:00:00'));
  await page.click('#save');await page.waitForFunction(()=>document.getElementById('active-shift').classList.contains('hidden'));
  assert.equal(await page.textContent('#tips-total'),'0h30');
 });
});

test('pause correction and timer adjustment persist the final worked total',async()=>{
 await withDays(async page=>{
  await page.clock.setFixedTime(new Date('2026-10-17T10:00:00'));
  await page.click('#save');await saved(page);
  await page.clock.setFixedTime(new Date('2026-10-17T12:00:00'));await page.click('#pause-toggle');
  await page.waitForFunction(()=>document.getElementById('timer-title').textContent==='Em pausa');
  await page.clock.setFixedTime(new Date('2026-10-17T14:00:00'));
  await page.click('#pause-summary');await page.fill('[data-pause-end="0"]','13:00');await page.click('#pause-save');
  await page.waitForFunction(()=>document.getElementById('shift-timer').textContent==='03:00:00');
  assert.equal(await page.textContent('#pause-toggle'),'Fazer pausa');
  for(const [mode,value,expected] of [['total','03:30','03:30:00'],['total','03:15','03:15:00'],['total','08:00','08:00:00'],['total','04:00','04:00:00']]){
   await page.click('#shift-timer');await page.fill('#adjust-hours',value.split(':')[0]);await page.fill('#adjust-minutes',value.split(':')[1]);await page.fill('#adjust-seconds','00');await page.click('#adjust-save');
   await page.waitForFunction(value=>document.getElementById('shift-timer').textContent===value,expected);
   assert.equal(await page.locator('#active-shift').evaluate(e=>e.classList.contains('over-limit')),expected==='08:00:00');
  }
  const persisted=await page.evaluate(()=>window.records);
  await page.unroute('https://hours.test/**');
  await page.route('https://hours.test/**',route=>route.fulfill({contentType:'text/html',body:html.replace(/^import .*;$/m,()=>stub+'\nwindow.session={user:{id:"user"}};window.records='+JSON.stringify(persisted)+';')}));
  await page.reload();await page.waitForFunction(()=>document.getElementById('shift-timer').textContent==='04:00:00');
  await page.clock.setFixedTime(new Date('2026-10-17T14:30:00'));await page.click('#save');
  await page.waitForFunction(()=>document.getElementById('active-shift').classList.contains('hidden'));
  assert.equal(await page.textContent('#tips-total'),'4h30');
 });
});

test('invalid and failed timer corrections preserve the running shift',async()=>{
 await withDays(async page=>{
  await page.clock.setFixedTime(new Date('2026-10-17T10:00:00'));await page.click('#save');await saved(page);
  await page.clock.setFixedTime(new Date('2026-10-17T11:00:00'));
  await page.click('#shift-timer');await page.fill('#adjust-hours','25');await page.click('#adjust-save');
  await page.waitForFunction(()=>document.getElementById('adjust-msg').textContent.includes('entre 00:00'));
  assert.equal(await page.locator('#timer-editor').isVisible(),true);
  await page.fill('#adjust-hours','01');await page.fill('#adjust-minutes','30');await page.fill('#adjust-seconds','00');await page.evaluate(()=>window.saveError='Sem rede');await page.click('#adjust-save');
  await page.waitForFunction(()=>document.getElementById('adjust-msg').textContent==='Sem rede');
  await page.waitForFunction(()=>document.getElementById('shift-timer').textContent==='01:00:00');
  await page.getByRole('button',{name:'Cancelar ajuste'}).click();
  assert.equal(await page.textContent('#save'),'Parar');
 });
});

test('pause intervals edit inline, resume forgotten pauses and persist across reopening',async()=>{
 await withDays(async page=>{
  await page.clock.setFixedTime(new Date('2026-10-17T10:00:00'));await page.click('#save');await saved(page);
  await page.clock.setFixedTime(new Date('2026-10-17T12:00:00'));await page.click('#pause-toggle');
  await page.waitForFunction(()=>document.getElementById('timer-title').textContent==='Em pausa');
  await page.clock.setFixedTime(new Date('2026-10-17T14:00:00'));await page.click('#pause-toggle');
  await page.waitForFunction(()=>document.getElementById('timer-title').textContent==='Turno em curso');
  await page.click('#return-summary');
  await page.fill('[data-pause-start="0"]','12:15');await page.fill('[data-pause-end="0"]','13:00');await page.click('#pause-save');
  await page.waitForFunction(()=>document.getElementById('shift-timer').textContent==='03:15:00');
  assert.equal(await page.textContent('#pause-summary'),'Pausas · 0h45');
  const persisted=await page.evaluate(()=>window.records);
  await page.unroute('https://hours.test/**');
  await page.route('https://hours.test/**',route=>route.fulfill({contentType:'text/html',body:html.replace(/^import .*;$/m,()=>stub+'\nwindow.session={user:{id:"user"}};window.records='+JSON.stringify(persisted)+';')}));
  await page.reload();await page.waitForFunction(()=>document.getElementById('shift-timer').textContent==='03:15:00');
  await page.click('#pause-summary');assert.equal(await page.inputValue('[data-pause-start="0"]'),'12:15');assert.equal(await page.inputValue('[data-pause-end="0"]'),'13:00');
  await page.fill('[data-pause-end="0"]','15:00');await page.click('#pause-save');await page.waitForFunction(()=>document.getElementById('pause-error').textContent.includes('futuras'));
  assert.equal(await page.evaluate(()=>window.records.find(r=>r.work_date==='2026-10-17').break_seconds),2700);
  await page.fill('[data-pause-end="0"]','13:15');await page.evaluate(()=>window.saveError='Sem rede');await page.click('#pause-save');
  await page.waitForFunction(()=>document.getElementById('pause-error').textContent==='Sem rede');
  await page.evaluate(()=>window.saveError=null);await page.click('#pause-save');await page.waitForFunction(()=>document.getElementById('shift-timer').textContent==='03:00:00');
  await page.click('#pause-toggle');await page.waitForFunction(()=>document.getElementById('timer-title').textContent==='Em pausa');
  await page.clock.setFixedTime(new Date('2026-10-17T14:30:00'));await page.click('#pause-toggle');await page.waitForFunction(()=>document.getElementById('timer-title').textContent==='Turno em curso');
  await page.click('#pause-summary');assert.equal(await page.locator('.pause-interval').count(),2);
  await page.fill('[data-pause-start="1"]','13:00');await page.click('#pause-save');await page.waitForFunction(()=>document.getElementById('pause-error').textContent.includes('sobreposição'));
  await page.click('#pause-cancel');await page.click('#save');await page.waitForFunction(()=>document.getElementById('active-shift').classList.contains('hidden'));
  const row=await page.evaluate(()=>window.records.find(r=>r.work_date==='2026-10-17'));assert.equal(row.duration_minutes,180);assert.equal(row.pause_intervals.length,2);
 });
});
test('pause interval correction handles midnight',async()=>{
 await withDays(async page=>{
  await page.clock.setFixedTime(new Date('2026-10-17T22:00:00'));await page.click('#save');await saved(page);
  await page.clock.setFixedTime(new Date('2026-10-17T23:45:00'));await page.click('#pause-toggle');await page.waitForFunction(()=>document.getElementById('timer-title').textContent==='Em pausa');
  await page.clock.setFixedTime(new Date('2026-10-18T01:00:00'));await page.click('#pause-summary');await page.fill('[data-pause-end="0"]','00:15');await page.click('#pause-save');
  await page.waitForFunction(()=>document.getElementById('shift-timer').textContent==='02:30:00');
  const row=await page.evaluate(()=>window.records.find(r=>r.work_date==='2026-10-17'));assert.equal(row.break_seconds,1800);
 });
});
