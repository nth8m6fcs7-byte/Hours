const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const base=fs.readFileSync(path.join(__dirname,'auth.cjs'),'utf8').match(/const stub=`([\s\S]*?)`;/)[1].replace('const createClient=','const baseCreateClient=');
const financeStub=`
window.financeRecords=[];window.financeFailure=null;window.financeReadFailure=null;
const createClient=(...args)=>{
 const client=baseCreateClient(...args),original=client.from;
 client.from=table=>table!=='hours_finance_months'?original(table):{
  select:()=>{const filters=[];const query={eq:(key,value)=>{filters.push([key,value]);return query},range:async()=>{
   window.calls.push(['finance-load',filters]);
   if(window.deferFinance){window.deferFinance=false;await new Promise(resolve=>window.finishFinanceLoad=resolve)}
   if(window.financeReadFailure)return {data:null,error:{message:window.financeReadFailure}};
   return {data:window.financeRecords.filter(r=>filters.every(([k,v])=>r[k]===v)),error:null};
  }};return query},
  upsert:async(record,options)=>{window.calls.push(['finance-save',record,options]);if(window.financeFailure)return {error:{message:window.financeFailure}};
   const current=window.financeRecords.find(r=>r.user_id===record.user_id&&r.month===record.month);
   if(current)Object.assign(current,record);else window.financeRecords.push(record);return {error:null};}
 };return client;
};`;
async function withFinance(run){
 const b=await chromium.launch({headless:true});
 try{
  const page=await b.newPage({viewport:{width:390,height:844}}),errors=[];let seed=null;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://hours.test/**',r=>r.fulfill({contentType:'text/html',body:html.replace(/^import .*;$/m,()=>base+financeStub+'\nwindow.session={user:{id:"user"}};'+(seed?'window.financeRecords='+JSON.stringify(seed)+';':''))}));
  await page.clock.setFixedTime(new Date('2026-10-18T12:00:00'));await page.goto('https://hours.test/');
  await page.waitForFunction(()=>document.getElementById('sync').textContent==='Sincronizado');
  await run(page,async()=>{seed=await page.evaluate(()=>window.financeRecords);await page.reload();await page.waitForFunction(()=>document.getElementById('sync').textContent==='Sincronizado')});
  assert.deepEqual(errors,[]);
 }finally{await b.close()}
}
const line=(p,i)=>p.locator('.finance-line').nth(i);
async function open(page){await page.click('#toggle-finance');await page.waitForFunction(()=>!document.getElementById('finance-fields').disabled)}
async function amount(page,i,expected,received){await line(page,i).locator('[data-finance="expected_cents"]').fill(expected);await line(page,i).locator('[data-finance="received_cents"]').fill(received)}
test('monthly finances persist exact cents, distinguish cash and benefits, and compare with completed hours',async()=>{
 await withFinance(async(p,reopen)=>{
  assert.equal(await p.locator('#finance-form').isVisible(),false);assert.equal(await p.evaluate(()=>window.calls.some(c=>c[0]==='finance-load')),false);
  await open(p);assert.equal(await p.inputValue('#finance-month'),'2026-10');assert.equal(await p.locator('.finance-line').count(),6);
  assert.equal(await p.textContent('#finance-total'),'—');assert.equal(await p.textContent('#finance-rate'),'—');assert.equal(await p.textContent('#finance-hours'),'17h00');
  await amount(p,0,'1.000,00','1000');await p.click('#finance-save');assert.match(await p.textContent('#finance-msg'),/separadores de milhares/);
  await amount(p,0,'1000,10','1000,10');await amount(p,1,'150','150');await amount(p,3,'200','200');await amount(p,4,'50,25','50,25');
  assert.match(await p.textContent('#finance-comparison'),/igual ao esperado/);
  assert.equal(await p.textContent('#finance-total'),await p.evaluate(()=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(1400.35)));
  assert.equal(await p.textContent('#finance-rate'),await p.evaluate(()=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(61.79)));
  await p.click('#finance-save');await p.waitForFunction(()=>document.getElementById('finance-state').textContent==='Guardado na tua conta');
  const saved=await p.evaluate(()=>window.financeRecords[0]);assert.equal(saved.month,'2026-10-01');assert.equal(saved.user_id,'user');assert.equal(saved.entries[0].received_cents,100010);assert.equal(saved.entries[4].received_cents,5025);assert.equal(saved.entries[3].destination,'coverflex');
  await reopen();await open(p);assert.equal(await line(p,0).locator('[data-finance="received_cents"]').inputValue(),'1000,10');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.screenshot({path:'/tmp/hours-finance-mobile.png',fullPage:true});
 });
});
test('months isolate records, errors preserve edits, and discard confirmation protects unsaved values',async()=>{
 await withFinance(async p=>{
  await open(p);await amount(p,0,'100','90');
  p.once('dialog',d=>d.dismiss());await p.click('#finance-prev');assert.equal(await p.inputValue('#finance-month'),'2026-10');assert.equal(await line(p,0).locator('[data-finance="received_cents"]').inputValue(),'90');
  await p.evaluate(()=>window.financeFailure='Sem rede');await p.click('#finance-save');await p.waitForFunction(()=>document.getElementById('finance-msg').textContent==='Sem rede');
  assert.equal(await line(p,0).locator('[data-finance="received_cents"]').inputValue(),'90');assert.equal(await p.evaluate(()=>window.financeRecords.length),0);
  await p.evaluate(()=>window.financeFailure=null);await p.click('#finance-save');await p.waitForFunction(()=>document.getElementById('finance-state').textContent==='Guardado na tua conta');
  assert.match(await p.textContent('#finance-comparison'),/10,00.*face ao esperado/);
  await p.click('#finance-prev');await p.waitForFunction(()=>!document.getElementById('finance-fields').disabled);assert.equal(await p.inputValue('#finance-month'),'2026-09');assert.equal(await p.textContent('#finance-total'),'—');assert.equal(await p.textContent('#finance-hours'),'0h00');
  await amount(p,0,'0','0');assert.notEqual(await p.textContent('#finance-total'),'—');assert.equal(await p.textContent('#finance-rate'),'—');
  await p.click('#finance-save');await p.waitForFunction(()=>document.getElementById('finance-state').textContent==='Guardado na tua conta');
  await p.click('#finance-next');await p.waitForFunction(()=>!document.getElementById('finance-fields').disabled);assert.equal(await line(p,0).locator('[data-finance="received_cents"]').inputValue(),'90,00');
  await p.evaluate(()=>window.financeReadFailure='Offline');await p.click('#finance-next');await p.waitForFunction(()=>!document.getElementById('finance-retry').classList.contains('hidden'));assert.equal(await p.locator('#finance-fields').evaluate(e=>e.disabled),true);assert.equal(await p.textContent('#finance-total'),'—');
  await p.evaluate(()=>window.financeReadFailure=null);await p.click('#finance-retry');await p.waitForFunction(()=>!document.getElementById('finance-fields').disabled);
 });
});
test('multiple payment destinations, removal, invalid amounts and account isolation',async()=>{
 await withFinance(async p=>{
  await open(p);await p.click('#finance-add');const i=6;await line(p,i).locator('[data-finance="category"]').selectOption('tips');await line(p,i).locator('[data-finance="destination"]').selectOption('bank');await amount(p,i,'10','10');await amount(p,4,'20','20');
  await line(p,1).locator('.finance-remove').click();assert.equal(await p.locator('.finance-line').count(),6);
  await line(p,0).locator('[data-finance="received_cents"]').fill('-1');await p.click('#finance-save');assert.equal(await p.evaluate(()=>window.financeRecords.length),0);
  await amount(p,0,'','');await p.click('#finance-save');await p.waitForFunction(()=>document.getElementById('finance-state').textContent==='Guardado na tua conta');
  assert.equal(await p.evaluate(()=>window.financeRecords[0].entries.filter(e=>e.category==='tips').length),2);
  await p.evaluate(()=>{window.session={user:{id:'second-user'}};window.authEvent('SIGNED_IN')});await p.waitForFunction(()=>document.getElementById('finance-lines').children.length===0);
  await p.click('#toggle-finance');await p.click('#toggle-finance');await p.waitForFunction(()=>!document.getElementById('finance-fields').disabled);assert.equal(await p.textContent('#finance-total'),'—');
  await p.evaluate(()=>{window.session=null;window.authEvent('SIGNED_OUT')});await p.waitForSelector('#app',{state:'hidden'});assert.equal(await p.locator('.finance-line').count(),0);
 });
});
