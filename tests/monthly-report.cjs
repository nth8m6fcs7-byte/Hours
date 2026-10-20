const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),stub=fs.readFileSync(path.join(__dirname,'auth.cjs'),'utf8').match(/const stub=`([\s\S]*?)`;/)[1];
test('monthly PDF downloads real hours, vacation and days off without financial or account data',async()=>{
 const b=await chromium.launch();try{
  const p=await b.newPage({viewport:{width:390,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('https://cdn.jsdelivr.net/**',async r=>r.fulfill({contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:execFileSync('curl',['-fsSL','--max-time','30',r.request().url()],{maxBuffer:10*1024*1024})}));
  await p.route('https://hours.test/**',r=>r.request().url().includes('monthly-report.mjs')?r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(__dirname,'../monthly-report.mjs'))}):r.fulfill({contentType:'text/html',body:html.replace(/^import .*;$/m,stub+`\nwindow.session={user:{id:'user',user_metadata:{hours_weekly_days_off:{days:[2,3],from:'2026-06-01'}}}};window.records=[{id:'a',user_id:'user',work_date:'2026-09-03',day_type:'work',duration_minutes:480},{id:'b',user_id:'user',work_date:'2026-09-04',day_type:'work',start_time:'09:00',end_time:'17:00',break_seconds:3600},{id:'c',user_id:'user',work_date:'2026-09-06',day_type:'vacation'},{id:'d',user_id:'user',work_date:'2026-09-19',day_type:'work',start_time:'09:00',end_time:null}];`)}));
  await p.goto('https://hours.test/');await p.waitForFunction(()=>document.getElementById('sync').textContent==='Sincronizado');await p.click('#toggle-records');
  const pending=p.waitForEvent('download');await p.click('#export-month-pdf');const file=await pending;assert.equal(file.suggestedFilename(),'OTTO-turnos-2026-09.pdf');await file.saveAs('/tmp/otto-monthly-test.pdf');
  const text=execFileSync('pdftotext',['-layout','/tmp/otto-monthly-test.pdf','-'],{encoding:'utf8'});assert.match(text,/Setembro de 2026/);assert.match(text,/15h00/);assert.match(text,/Férias/);assert.match(text,/Folga/);assert.match(text,/Em curso/);assert.doesNotMatch(text,/user|Coverflex|Salário/);assert.deepEqual(errors,[]);
  await p.selectOption('#month-filter','');assert.equal(await p.locator('#export-month-pdf').isVisible(),false);
 }finally{await b.close()}
});
