const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const base=fs.readFileSync(path.join(__dirname,'auth.cjs'),'utf8').match(/const stub=`([\s\S]*?)`;/)[1].replace('const createClient=','const baseCreateClient=');
const finance=fs.readFileSync(path.join(__dirname,'finance.cjs'),'utf8').match(/const financeStub=`([\s\S]*?)`;/)[1].replace('const createClient=','const financeCreateClient=');
const docs=`
window.documents=[];window.files={};window.docFailure=null;window.removeFailure=null;window.deleteFailure=null;
const createClient=(...args)=>{
 const client=financeCreateClient(...args),original=client.from;
 client.from=table=>table!=='hours_finance_documents'?original(table):{
  select:()=>{const f=[];const q={eq:(k,v)=>{f.push([k,v]);return q},order:()=>q,range:async()=>({data:window.documents.filter(d=>f.every(([k,v])=>d[k]===v)),error:null})};return q},
  delete:()=>{const f=[];const q={eq:(k,v)=>{f.push([k,v]);return q},select:async()=>{if(window.deleteFailure)return {error:{message:window.deleteFailure}};const data=window.documents.filter(d=>f.every(([k,v])=>d[k]===v));window.documents=window.documents.filter(d=>!data.includes(d));return {data,error:null}}};return q},
  insert:async d=>{window.documents.push({...d});return {error:null}}
 };
 client.storage={from:bucket=>({upload:async(key,file)=>{window.calls.push(['file-upload',bucket,key]);window.files[key]=file;return {error:null}},remove:async keys=>{if(window.removeFailure)return {error:{message:window.removeFailure}};for(const key of keys)delete window.files[key];return {error:null}},download:async key=>({data:window.files[key],error:null})})};
 client.rpc=async(name,p)=>{window.calls.push(['confirm-doc',name,p]);if(window.docFailure)return {error:{message:window.docFailure}};
 const doc=window.documents.find(d=>d.id===p.p_id);if(doc.status==='confirmed')return {error:{message:'Documento repetido'}};
 let month=window.financeRecords.find(r=>r.month===p.p_income_month&&r.user_id===window.session.user.id);
 if(!month){month={month:p.p_income_month,user_id:window.session.user.id,entries:[]};window.financeRecords.push(month)}
 for(const [key,category,destination] of [['salary','salary','bank'],['food','food','meal_card'],['bonus','coverflex','coverflex']])if(Object.hasOwn(p.p_values,key)){month.entries=month.entries.filter(e=>e.category!==category);month.entries.push({category,destination,expected_cents:p.p_values[key],received_cents:p.p_values[key]})}
 if(Object.hasOwn(p.p_values,'ppr')){let movement=window.financeRecords.find(r=>r.month===p.p_movement_month&&r.user_id===window.session.user.id);if(!movement){movement={month:p.p_movement_month,user_id:window.session.user.id,entries:[]};window.financeRecords.push(movement)}movement.ppr_redemption_cents=p.p_values.ppr;movement.ppr_origin_month=p.p_origin_month}
 doc.status='confirmed';doc.income_month=p.p_income_month;return {error:null};};return client;
};`;
async function withDocs(run){const b=await chromium.launch({headless:true});try{const p=await b.newPage({viewport:{width:390,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://hours.test/**',r=>r.fulfill({contentType:r.request().url().includes('.mjs')?'application/javascript':'text/html',body:r.request().url().includes('.mjs')?'export async function recognizeDocument(file){return JSON.parse(await file.text())}':html.replace(/^import .*;$/m,()=>base+finance+docs+'\nwindow.session={user:{id:"user"}};')}));
 await p.goto('https://hours.test/');await p.waitForFunction(()=>document.getElementById('sync').textContent==='Sincronizado');await p.click('#toggle-finance');await p.click('#income-tab');await p.waitForFunction(()=>!document.getElementById('finance-fields').disabled);await run(p);assert.deepEqual(errors,[]);
}finally{await b.close()}}
async function choose(p,kind,values,name='documento.pdf',month='2026-10'){
 await p.click(kind==='payroll'?'#add-payroll':'#add-coverflex');
 await p.setInputFiles('#document-file',{name,mimeType:'application/pdf',buffer:Buffer.from(JSON.stringify({values,evidence:{},month,hasValues:Object.keys(values).length>0}))});
 await p.waitForSelector('#document-review',{state:'visible'});await p.waitForFunction(()=>!document.getElementById('document-confirm').disabled);
}
async function confirm(p){await p.click('#document-confirm');await p.waitForFunction(()=>document.getElementById('document-review').classList.contains('hidden'));await p.waitForFunction(()=>!document.getElementById('finance-fields').disabled)}
test('simple document-first view confirms payroll and Coverflex without counting PPR or food twice',async()=>{
 await withDocs(async p=>{
  assert.equal(await p.locator('#finance-form').isVisible(),false);assert.equal(await p.locator('#finance-breakdown').isVisible(),false);
  await choose(p,'payroll',{salary:84000,food:10000,ppr:30000,gross:100000,net:124000});
  assert.equal(await p.locator('[data-document-value="ppr"]').isVisible(),false);assert.equal(await p.locator('.finance-stats').isVisible(),false);assert.equal(await p.locator('#document-confirm').textContent(),'Guardar');
  assert.equal(await p.evaluate(()=>window.documents.length),0);await p.locator('#document-details > summary').click();await p.fill('#document-origin-month','2026-09');await confirm(p);
  let row=await p.evaluate(()=>window.financeRecords[0]);assert.equal(row.entries.reduce((s,e)=>s+e.received_cents,0),94000);assert.equal(row.ppr_redemption_cents,30000);assert.equal(row.ppr_origin_month,'2026-09-01');
  assert.match(await p.textContent('#finance-ppr'),/não entra novamente/);
  await choose(p,'coverflex',{food:10000,bonus:20000},'coverflex.pdf');assert.equal(await p.locator('#document-details').getAttribute('open'),null);await confirm(p);
  row=await p.evaluate(()=>window.financeRecords[0]);assert.equal(row.entries.reduce((s,e)=>s+e.received_cents,0),114000);assert.equal(row.entries.filter(e=>e.category==='food').length,1);assert.equal(row.ppr_redemption_cents,30000);
  await choose(p,'coverflex',{food:10000,bonus:20000},'coverflex.pdf');await p.click('#document-confirm');await p.waitForFunction(()=>document.getElementById('document-msg').textContent.includes('já está guardado'));
  assert.equal(await p.evaluate(()=>window.documents.length),2);await p.click('#document-cancel');
  await p.locator('#finance-documents summary').click();await p.waitForFunction(()=>document.querySelectorAll('.finance-document-row').length===2);
  assert.equal(await p.evaluate(()=>window.calls.filter(c=>c[0]==='file-upload').every(c=>c[1]==='hours-receipts'&&c[2].startsWith('user/'))),true);
  await p.locator('#finance-manual > summary').click();await p.getByText('Movimentos antigos de PPR',{exact:true}).click();await p.fill('#finance-ppr-amount','200');await p.click('#finance-save');await p.waitForFunction(()=>document.getElementById('finance-state').textContent==='Guardado na tua conta');
  assert.equal(await p.evaluate(()=>window.financeRecords[0].ppr_redemption_cents),20000);assert.equal(await p.evaluate(()=>window.financeRecords[0].entries.reduce((s,e)=>s+e.received_cents,0)),114000);
  await p.locator('#finance-manual > summary').click();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.screenshot({path:'/tmp/hours-documents-simple.png',fullPage:true});
 });
});
test('confirmation checks totals, preserves review after a failed save and allows manual recognition fallback',async()=>{
 await withDocs(async p=>{
  await choose(p,'payroll',{salary:90000,food:10000,ppr:30000,net:124000});await p.click('#document-confirm');await p.waitForFunction(()=>document.getElementById('document-msg').textContent.includes('não correspondem'));
  assert.equal(await p.evaluate(()=>window.documents.length),0);
  await p.locator('[data-document-value="salary"]').fill('840');await p.evaluate(()=>window.docFailure='Sem rede');await p.click('#document-confirm');await p.waitForFunction(()=>document.getElementById('document-msg').textContent==='Sem rede');assert.equal(await p.locator('#document-review').isVisible(),true);
  await p.evaluate(()=>window.docFailure=null);await confirm(p);assert.equal(await p.evaluate(()=>window.documents.length),1);
  await choose(p,'coverflex',{},'nao-reconhecido.pdf','2026-09');await p.locator('[data-document-value="bonus"]').fill('200');await confirm(p);assert.equal(await p.inputValue('#finance-month'),'2026-09');
 });
});

test('removing a document supports cancel and retry while keeping financial values',async()=>{
 await withDocs(async p=>{
  await choose(p,'coverflex',{food:7800,bonus:74358},'beneficios.pdf');await confirm(p);
  await p.locator('#finance-documents summary').click();await p.waitForSelector('.finance-document-row');
  const before=await p.evaluate(()=>JSON.stringify(window.financeRecords));
  p.once('dialog',d=>d.dismiss());await p.getByRole('button',{name:'Retirar beneficios.pdf',exact:true}).click();assert.equal(await p.evaluate(()=>window.documents.length),1);
  await p.evaluate(()=>window.removeFailure='Sem rede');p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'Retirar beneficios.pdf',exact:true}).click();await p.waitForFunction(()=>document.getElementById('finance-document-msg').textContent.includes('Tenta novamente'));assert.equal(await p.evaluate(()=>window.documents.length),1);
  await p.evaluate(()=>{window.removeFailure=null;window.deleteFailure='Sem rede'});p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'Retirar beneficios.pdf',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('.finance-document-actions button:last-child').disabled);assert.equal(await p.evaluate(()=>window.documents.length),1);
  await p.evaluate(()=>window.deleteFailure=null);p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'Retirar beneficios.pdf',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('.finance-document-row').length===0);
  assert.equal(await p.evaluate(()=>window.documents.length),0);assert.equal(await p.evaluate(()=>Object.keys(window.files).length),0);assert.equal(await p.evaluate(()=>JSON.stringify(window.financeRecords)),before);
 });
});
