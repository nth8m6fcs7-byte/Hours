// Run with: node tests/history.cjs (requires Playwright and Chromium).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const authSource=fs.readFileSync(path.join(__dirname,'auth.cjs'),'utf8');
const stub=authSource.match(/const stub=`([\s\S]*?)`;/)[1];
const records=[
 {id:'jan-night',work_date:'2026-01-08',start_time:'22:00',end_time:'02:00'},
 {id:'jan-day',work_date:'2026-01-05',start_time:'09:00',end_time:'17:00'},
 {id:'dec-day',work_date:'2025-12-31',start_time:'08:00',end_time:'16:00'},
 {id:'oct-day',work_date:'2025-10-01',start_time:'10:00',end_time:'15:00'}
];

async function withHistory(fixture,run,{cap=500}={}){
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-02-05T12:00:00Z'));
  await page.route('https://hours.test/**',route=>route.fulfill({contentType:'text/html',body:html.replace(/^import .*;$/m,stub+`\nwindow.session={user:{id:'user'}};window.records=${JSON.stringify(fixture)};window.pageCap=${cap};`)}));
  await page.goto('https://hours.test/');
  await page.waitForFunction(()=>document.getElementById('sync').textContent==='Sincronizado');
  await run(page);
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
}

test('history browses across years, empty months and all months without changing weekly totals',async()=>{
 await withHistory(records,async page=>{
  assert.equal(await page.inputValue('#month-filter'),'2026-01');
  assert.equal(await page.textContent('#history-total'),'12h00');
  assert.match(await page.textContent('#history-count'),/2 turnos/);
  assert.match(await page.textContent('#record-count'),/2/);
  const coverage=await page.textContent('#history-coverage');
  assert.match(coverage,/4 turnos/);assert.match(coverage,/01\/10\/2025/);assert.match(coverage,/08\/01\/2026/);
  assert.equal(await page.locator('#list .shift').count(),2);
  assert.equal(await page.textContent('#tips-total'),'12h00');
  assert.equal(await page.textContent('#mine-total'),'4h00');
  const weekly=await page.locator('.grid').innerText();
  await page.click('#month-prev');assert.equal(await page.inputValue('#month-filter'),'2025-12');
  assert.equal(await page.textContent('#history-total'),'8h00');
  assert.equal(await page.locator('#list .shift').count(),1);
  await page.click('#month-prev');assert.equal(await page.inputValue('#month-filter'),'2025-11');
  assert.equal(await page.textContent('#history-total'),'0h00');
  assert.equal(await page.locator('#list .shift').count(),0);
  assert.equal(await page.locator('#list .empty-state').isVisible(),true);
  await page.click('#month-prev');assert.equal(await page.inputValue('#month-filter'),'2025-10');
  assert.equal(await page.textContent('#history-total'),'5h00');
  assert.equal(await page.locator('#month-prev').isDisabled(),false);
  await page.selectOption('#month-filter','2025-01');
  assert.equal(await page.locator('#month-prev').isDisabled(),true);
  await page.selectOption('#month-filter','2026-02');
  assert.equal(await page.locator('#month-next').isDisabled(),true);
  assert.equal(await page.textContent('#history-total'),'0h00');
  await page.selectOption('#month-filter','');
  assert.equal(await page.textContent('#history-total'),'25h00');
  assert.match(await page.textContent('#history-count'),/4 turnos/);
  assert.equal(await page.locator('#list .shift').count(),4);
  assert.match(await page.locator('#list').innerText(),/2025/);
  assert.match(await page.locator('#list').innerText(),/2026/);
  assert.equal(await page.locator('.grid').innerText(),weekly);
  assert.equal(await page.textContent('#history-coverage'),coverage);
  for(const width of [320,375,390,430,780]){
   await page.setViewportSize({width,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`History overflow at ${width}px`);
  }
 });
});

test('global edit mode reveals actions, clears edit on conclusion and preserves browsing state after deletion',async()=>{
 await withHistory(records,async page=>{
  assert.equal(await page.getAttribute('#edit-records','aria-pressed'),'false');
  assert.match(await page.textContent('#edit-records'),/Editar/);
  assert.equal(await page.locator('[data-edit]:visible').count(),0);
  assert.equal(await page.locator('[data-del]:visible').count(),0);
  await page.click('#edit-records');
  assert.equal(await page.getAttribute('#edit-records','aria-pressed'),'true');
  assert.match(await page.textContent('#edit-records'),/Concluir/);
  assert.equal(await page.locator('[data-edit]:visible').count(),2);
  await page.click('[data-edit="jan-night"]');
  assert.equal(await page.inputValue('#start'),'22:00');
  assert.equal(await page.locator('#cancel').isVisible(),true);
  await page.click('#edit-records');
  assert.equal(await page.getAttribute('#edit-records','aria-pressed'),'false');
  assert.equal(await page.locator('#cancel').isVisible(),false);
  assert.equal(await page.inputValue('#start'),'');
  assert.equal(await page.locator('[data-edit]:visible').count(),0);
  await page.fill('#date','2026-01-18');await page.fill('#start','12:00');await page.fill('#end','16:00');
  await page.click('#edit-records');await page.click('#edit-records');
  assert.equal(await page.inputValue('#date'),'2026-01-18');
  assert.equal(await page.inputValue('#start'),'12:00');
  assert.equal(await page.inputValue('#end'),'16:00');
  assert.equal(await page.getAttribute('#edit-records','aria-pressed'),'false');
  await page.selectOption('#month-filter','2025-12');await page.click('#edit-records');
  await page.click('[data-edit="dec-day"]');
  page.once('dialog',dialog=>dialog.accept());await page.click('[data-del="dec-day"]');
  await page.waitForFunction(()=>window.calls.some(call=>call[0]==='delete')&&document.getElementById('sync').textContent==='Sincronizado');
  assert.equal(await page.inputValue('#month-filter'),'2025-12');
  assert.equal(await page.locator('#list .shift').count(),0);
  assert.equal(await page.locator('#list .empty-state').isVisible(),true);
  assert.equal(await page.locator('#cancel').isVisible(),false);
  assert.equal(await page.textContent('#history-total'),'0h00');
  // A save in monthly view reveals its target month; an all-months view remains all months.
  await page.fill('#date','2026-01-20');await page.fill('#start','09:00');await page.fill('#end','10:00');await page.click('#save');
  await page.waitForFunction(()=>document.getElementById('month-filter').value==='2026-01'&&document.getElementById('sync').textContent==='Sincronizado');
  await page.selectOption('#month-filter','');
  await page.fill('#date','2025-09-10');await page.fill('#start','09:00');await page.fill('#end','10:00');await page.click('#save');
  await page.waitForFunction(()=>window.records.some(record=>record.work_date==='2025-09-10')&&document.getElementById('sync').textContent==='Sincronizado');
  assert.equal(await page.inputValue('#month-filter'),'');
 });
});

function manyRecords(count){
 return Array.from({length:count},(_,index)=>{
  const date=new Date('2026-01-08T12:00:00Z');date.setUTCDate(date.getUTCDate()-index);
  return {id:`record-${String(index).padStart(4,'0')}`,work_date:date.toISOString().slice(0,10),start_time:'09:00',end_time:'17:00'};
 }).reverse();
}

test('history loads more than 1000 records with exact count and stable ordering',async()=>{
 await withHistory(manyRecords(1205),async page=>{
  const ranges=await page.evaluate(()=>window.rangeCalls);
  assert.deepEqual(ranges.map(range=>[range.start,range.end]),[[0,499],[500,999],[1000,1499]]);
  for(const range of ranges){
   assert.equal(range.table,'personal_work_hours');assert.equal(range.columns,'*');assert.deepEqual(range.options,{count:'exact'});
   assert.deepEqual(range.ordering,[['work_date',{ascending:false}],['id',{ascending:false}]]);
  }
  assert.equal(await page.inputValue('#month-filter'),'2026-01');
  assert.equal(await page.locator('#list .shift').count(),8);
  await page.selectOption('#month-filter','');
  assert.equal(await page.locator('#list .shift').count(),1205);
  assert.match(await page.textContent('#history-count'),/1205/);
  assert.equal(await page.textContent('#history-total'),'9640h00');
  assert.equal(await page.locator('#list .shift').first().locator('small').textContent(),'8 de janeiro de 2026');
 });
});

test('history pagination respects a lower server row cap without dropping records',async()=>{
 await withHistory(manyRecords(1205),async page=>{
  const starts=await page.evaluate(()=>window.rangeCalls.map(range=>range.start));
  assert.deepEqual(starts,Array.from({length:17},(_,index)=>index*73));
  await page.selectOption('#month-filter','');
  assert.equal(await page.locator('#list .shift').count(),1205);
  assert.match(await page.textContent('#history-coverage'),/1205/);
  assert.equal(await page.textContent('#history-total'),'9640h00');
 },{cap:73});
});

test('signing out while history loads prevents stale user records from reappearing',async()=>{
 await withHistory(records,async page=>{
  await page.fill('#date','2026-01-09');await page.fill('#start','09:00');await page.fill('#end','10:00');
  await page.evaluate(()=>window.deferNextRange=true);await page.click('#save');
  await page.waitForFunction(()=>typeof window.resumeRange==='function');
  await page.click('#account summary');await page.click('#logout');
  await page.waitForSelector('#auth',{state:'visible'});
  await page.evaluate(()=>window.resumeRange());
  // Give the pending query and deferred auth event a chance to settle.
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,100)));
  assert.equal(await page.locator('#app').isVisible(),false);
  assert.equal(await page.locator('#list .shift').count(),0);
  assert.equal(await page.textContent('#history-total'),'0h00');
 });
});

for(const failure of ['recordErrorAt','recordEmptyAt']){
 test(`failed history page (${failure}) retains the previous complete history`,async()=>{
  await withHistory(records,async page=>{
   await page.selectOption('#month-filter','');
   const previous=await page.locator('#history-count,#history-total,#history-coverage,#list').allTextContents();
   const weekly=await page.locator('.grid').innerText();
   await page.evaluate(({fixture,failure})=>{window.records=fixture;window[failure]=500;window.rangeCalls=[]},{fixture:manyRecords(1205),failure});
   await page.fill('#date','2026-01-09');await page.fill('#start','09:00');await page.fill('#end','10:00');await page.click('#save');
   await page.waitForFunction(()=>document.getElementById('sync').textContent.includes('Erro'));
   assert.deepEqual(await page.evaluate(()=>window.rangeCalls.map(range=>range.start)),[0,500]);
   assert.deepEqual(await page.locator('#history-count,#history-total,#history-coverage,#list').allTextContents(),previous);
   assert.match(await page.textContent('#records-msg'),/histórico completo/);
   assert.equal(await page.locator('.grid').innerText(),weekly);
   assert.equal(await page.locator('#list .shift').count(),4);
  });
 });
}
