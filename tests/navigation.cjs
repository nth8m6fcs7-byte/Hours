const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const base=fs.readFileSync(path.join(__dirname,'auth.cjs'),'utf8').match(/const stub=`([\s\S]*?)`;/)[1].replace('const createClient=','const baseCreateClient=');
const finance=fs.readFileSync(path.join(__dirname,'finance.cjs'),'utf8').match(/const financeStub=`([\s\S]*?)`;/)[1];
test('three-screen navigation preserves shift state and keeps income and weekly tips reachable on mobile',async()=>{
 const b=await chromium.launch({headless:true});try{
  const p=await b.newPage({viewport:{width:390,height:844}}),errors=[];p.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
  await p.clock.setFixedTime(new Date('2026-10-19T16:00:00Z'));
  await p.route('https://hours.test/**',r=>r.fulfill({contentType:'text/html',body:html.replace(/^import .*;$/m,base+'\n'+finance+`\nwindow.session={user:{id:'user'}};window.records=[{id:'active',user_id:'user',work_date:'2026-10-19',start_time:'10:51',end_time:null,break_seconds:1800,day_type:'work'}];window.financeRecords=[{user_id:'user',month:'2026-10-01',entries:[{category:'salary',destination:'bank',expected_cents:95000,received_cents:95000},{category:'food',destination:'meal_card',expected_cents:7800,received_cents:7800},{category:'coverflex',destination:'coverflex',expected_cents:74000,received_cents:74000},{category:'tips',destination:'cash',expected_cents:12500,received_cents:12500}]}];`)}));
  await p.goto('https://hours.test/');await p.waitForFunction(()=>document.getElementById('sync').textContent==='Sincronizado');
  assert.equal(await p.locator('#shift-section').isVisible(),true);assert(await p.locator('.app-navigation').evaluate(e=>Math.abs(e.getBoundingClientRect().bottom-innerHeight)<2));assert.equal(await p.locator('#records').isVisible(),false);assert.equal(await p.locator('#finances').isVisible(),false);
  const timer=await p.textContent('#shift-timer');await p.screenshot({path:'/tmp/hours-today.png',fullPage:true});
  await p.click('#toggle-records');await p.click('#tips-card');await p.waitForFunction(()=>!document.getElementById('weekly-tips-save').disabled);assert.equal(await p.locator('#weekly-tips-form').isVisible(),true);await p.screenshot({path:'/tmp/hours-history.png',fullPage:true});
  await p.click('#toggle-finance');await p.waitForFunction(()=>!document.getElementById('finance-fields').disabled);assert.equal(await p.locator('#shift-section').isVisible(),false);assert.equal(await p.locator('#finance-total').isVisible(),true);assert.match(await p.textContent('#finance-income-summary'),/Gorjetas/);await p.screenshot({path:'/tmp/hours-finance.png',fullPage:true});
  await p.click('#toggle-time');assert.equal(await p.textContent('#shift-timer'),timer);assert.equal(await p.inputValue('#start'),'10:51');assert.equal(await p.locator('[data-page-target][aria-current="page"]').count(),1);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const width of [320,768]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)}
  assert.deepEqual(errors,[]);
 }finally{await b.close()}
});
