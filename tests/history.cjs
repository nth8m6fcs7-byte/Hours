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
const adjustedRecords=[
 {id:'split-shift',work_date:'2026-07-31',start_time:'09:00',end_time:'22:40',duration_minutes:670,notes:'09:00–14:00 / 16:30–22:40'},
 {id:'zero-shift',work_date:'2026-07-30',start_time:'09:00',end_time:'17:00',duration_minutes:0,notes:'Zero contado'},
 {id:'automatic-shift',work_date:'2026-07-27',start_time:'10:00',end_time:'15:00',duration_minutes:null,notes:null},
 {id:'older-shift',work_date:'2026-06-01',start_time:'09:00',end_time:'17:00',duration_minutes:null,notes:null}
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
   if(width<=560){
    const mobileForm=await page.evaluate(()=>{
     const rect=selector=>document.querySelector(selector).getBoundingClientRect();
     const grid=rect('.row3'),card=rect('.form-card'),date=rect('#date'),start=rect('#start'),end=rect('#end');
     const near=(left,right)=>Math.abs(left-right)<=1;
     return {
      dateFillsGrid:near(date.left,grid.left)&&near(date.right,grid.right),
      timesAligned:near(start.width,end.width)&&near(start.top,end.top)&&near(start.left,date.left)&&near(end.right,date.right),
      equalMargins:near(date.left-card.left,card.right-date.right),
      inputsContained:['date','start','end'].every(id=>{const input=rect('#'+id),field=document.getElementById(id).closest('.field').getBoundingClientRect();return input.left>=field.left-1&&input.right<=field.right+1})
     };
    });
    assert.deepEqual(mobileForm,{dateFillsGrid:true,timesAligned:true,equalMargins:true,inputsContained:true},`Uneven mobile fields at ${width}px`);
   }
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

test('adjusted duration counts split shifts and zero in monthly and both weekly totals',async()=>{
 await withHistory(adjustedRecords,async page=>{
  assert.equal(await page.inputValue('#month-filter'),'2026-07');
  assert.equal(await page.locator('#list .shift').nth(0).locator('.dur').textContent(),'11h10');
  assert.equal(await page.locator('#list .shift').nth(1).locator('.dur').textContent(),'0h00');
  assert.equal(await page.locator('#list .shift').nth(2).locator('.dur').textContent(),'5h00');
  assert.equal(await page.textContent('#history-total'),'16h10');
  assert.equal(await page.textContent('#tips-total'),'16h10');
  assert.equal(await page.textContent('#mine-total'),'11h10');
  assert.equal(await page.locator('#shift-details').getAttribute('open'),null);
  const weekly=await page.locator('.grid').innerText();
  await page.selectOption('#month-filter','2026-06');assert.equal(await page.textContent('#history-total'),'8h00');
  await page.selectOption('#month-filter','');assert.equal(await page.textContent('#history-total'),'24h10');
  assert.equal(await page.locator('.grid').innerText(),weekly);
  await page.click('#edit-records');await page.click('[data-edit="zero-shift"]');
  assert.equal(await page.inputValue('#duration-override'),'00:00');
  assert.equal(await page.inputValue('#notes'),'Zero contado');
 });
});

test('editing preserves, adjusts and clears recorded duration and notes while escaping note markup',async()=>{
 await withHistory(adjustedRecords,async page=>{
  const waitForEdit=async count=>page.waitForFunction(count=>window.calls.filter(call=>call[0]==='edit').length===count&&document.getElementById('sync').textContent==='Sincronizado',count);
  const lastEdit=()=>page.evaluate(()=>window.calls.filter(call=>call[0]==='edit').at(-1)[2]);
  await page.click('#edit-records');
  const originalTotals=await page.locator('#history-total,#tips-total,#mine-total').allTextContents();
  await page.click('[data-edit="automatic-shift"]');
  assert.equal(await page.inputValue('#duration-override'),'');
  await page.click('#shift-details summary');
  const shoppingNote='Compras às 10:30. Material para a equipa.';
  await page.fill('#notes',shoppingNote);await page.click('#save');await waitForEdit(1);
  assert.equal((await lastEdit()).duration_minutes,null);assert.equal((await lastEdit()).notes,shoppingNote);
  assert.equal(await page.evaluate(()=>window.records.find(record=>record.id==='automatic-shift').duration_minutes),null);
  assert.equal(await page.locator('#list .shift').filter({hasText:'27 de julho de 2026'}).locator('.dur').textContent(),'5h00');
  assert.deepEqual(await page.locator('#history-total,#tips-total,#mine-total').allTextContents(),originalTotals);
  await page.click('[data-edit="split-shift"]');
  assert.equal(await page.locator('#shift-details').getAttribute('open'),'');
  assert.equal(await page.inputValue('#start'),'09:00');assert.equal(await page.inputValue('#end'),'22:40');
  assert.equal(await page.inputValue('#duration-override'),'11:10');
  assert.equal(await page.inputValue('#notes'),'09:00–14:00 / 16:30–22:40');
  await page.click('#save');await waitForEdit(2);
  assert.equal((await lastEdit()).duration_minutes,670);
  assert.equal((await lastEdit()).notes,'09:00–14:00 / 16:30–22:40');
  assert.equal(await page.textContent('#history-total'),'16h10');
  await page.click('[data-edit="split-shift"]');await page.fill('#duration-override','10:30');
  const literalNote='<img src=x onerror="window.notesExecuted=true"> & <strong>texto</strong>\nLinha 2';
  await page.fill('#notes',`  ${literalNote}  `);await page.click('#save');await waitForEdit(3);
  assert.equal((await lastEdit()).duration_minutes,630);assert.equal((await lastEdit()).notes,literalNote);
  assert.equal(await page.textContent('#history-total'),'15h30');
  assert.equal(await page.textContent('#mine-total'),'10h30');
  assert.equal(await page.locator('#list img').count(),0);
  assert.equal(await page.evaluate(()=>window.notesExecuted===true),false);
  assert.ok((await page.locator('#list').textContent()).includes(literalNote));
  await page.setViewportSize({width:320,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Notes overflow at 320px');
  await page.setViewportSize({width:390,height:844});
  // A blank override returns to the entry/exit calculation and blank notes become null.
  await page.click('[data-edit="split-shift"]');await page.fill('#duration-override','');await page.fill('#notes','   ');
  await page.click('#save');await waitForEdit(4);
  assert.equal((await lastEdit()).duration_minutes,null);assert.equal((await lastEdit()).notes,null);
  assert.equal(await page.locator('#list .shift').first().locator('.dur').textContent(),'13h40');
  assert.equal(await page.textContent('#history-total'),'18h40');
  assert.equal(await page.textContent('#tips-total'),'18h40');
  assert.equal(await page.textContent('#mine-total'),'13h40');
  await page.fill('#date','2026-08-01');await page.fill('#start','22:00');await page.fill('#end','02:00');await page.click('#save');
  await page.waitForFunction(()=>window.calls.some(call=>call[0]==='upsert')&&document.getElementById('sync').textContent==='Sincronizado');
  const created=await page.evaluate(()=>window.calls.find(call=>call[0]==='upsert')[2]);
  assert.equal(created.duration_minutes,null);assert.equal(created.notes,null);
  assert.equal(await page.inputValue('#month-filter'),'2026-08');
  assert.equal(await page.textContent('#history-total'),'4h00');
 });
});

test('duration adjustment validates minutes and maximum, accepts explicit zero and a full day',async()=>{
 await withHistory(records,async page=>{
  await page.fill('#date','2026-01-20');await page.fill('#start','09:00');await page.fill('#end','17:00');
  await page.click('#shift-details summary');
  for(const invalid of ['25:00','12:60','-01:00','not a duration']){
   await page.fill('#duration-override',invalid);await page.click('#save');
   assert.equal(await page.evaluate(()=>window.calls.some(call=>call[0]==='upsert')),false,`Accepted invalid duration: ${invalid}`);
   assert.ok((await page.textContent('#form-msg')).trim().length>0);
  }
  await page.fill('#duration-override','00:00');await page.click('#save');
  await page.waitForFunction(()=>window.calls.filter(call=>call[0]==='upsert').length===1&&document.getElementById('sync').textContent==='Sincronizado');
  assert.equal(await page.evaluate(()=>window.calls.find(call=>call[0]==='upsert')[2].duration_minutes),0);
  assert.equal(await page.locator('#list .shift').first().locator('.dur').textContent(),'0h00');
  await page.fill('#date','2026-01-21');await page.fill('#start','09:00');await page.fill('#end','17:00');
  await page.click('#shift-details summary');await page.fill('#duration-override','24:00');await page.click('#save');
  await page.waitForFunction(()=>window.calls.filter(call=>call[0]==='upsert').length===2&&document.getElementById('sync').textContent==='Sincronizado');
  assert.equal(await page.evaluate(()=>window.calls.filter(call=>call[0]==='upsert').at(-1)[2].duration_minutes),1440);
  assert.equal(await page.locator('#list .shift').first().locator('.dur').textContent(),'24h00');
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
