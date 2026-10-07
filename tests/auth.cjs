// Run with: node tests/auth.cjs (requires Playwright and Chromium).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const stub=`
window.calls=[];window.rangeCalls=[];window.session=location.hash.includes('access_token=mock')?{user:{id:'user'}}:null;window.authError=null;
window.records=[
 {id:'one',work_date:'2026-10-05',start_time:'09:00',end_time:'17:00'},
 {id:'two',work_date:'2026-10-04',start_time:'22:00',end_time:'02:00'},
 {id:'three',work_date:'2026-10-01',start_time:'10:00',end_time:'15:00'}
];
const createClient=(url,key,options)=>{
 window.clientOptions=options;
 const result=()=>({data:{session:window.session},error:window.authError});
 const auth={
  getSession:async()=>({data:{session:window.session}}),
  getUser:async()=>({data:{user:window.session?.user}}),
  onAuthStateChange:cb=>{window.authEvent=cb;if(location.hash.includes('access_token=mock')){history.replaceState(null,'',location.pathname+location.search);setTimeout(()=>cb('PASSWORD_RECOVERY'),0)}},
  signInWithPassword:async input=>{window.calls.push(['login',input]);if(!window.authError)window.session={user:{id:'user'}};return result()},
  signUp:async input=>{window.calls.push(['signup',input]);return result()},
  resetPasswordForEmail:async(...input)=>{window.calls.push(['reset',...input]);return result()},
  updateUser:async input=>{window.calls.push(['updateUser',input]);return result()},
  signOut:async()=>{window.session=null;window.authEvent('SIGNED_OUT');return result()},
  registerPasskey:async()=>{window.calls.push(['register']);return result()},
  signInWithPasskey:async()=>{window.calls.push(['passkey']);if(!window.authError){window.session={user:{id:'user'}};window.authEvent('SIGNED_IN')}return result()}
 };
 return {auth,from:table=>({
  select:(columns,options)=>{
   const ordering=[],filters=[];
   const query={
    eq:(column,value)=>{filters.push(record=>record[column]===value);return query},
    gte:(column,value)=>{filters.push(record=>record[column]>=value);return query},
    lte:(column,value)=>{filters.push(record=>record[column]<=value);return query},
    order:(column,settings)=>{ordering.push([column,settings]);return query},
    range:async(start,end)=>{
     window.rangeCalls.push({table,columns,options,ordering,start,end});
     if(window.deferNextRange){window.deferNextRange=false;await new Promise(resolve=>window.resumeRange=resolve)}
     if(start===window.recordErrorAt)return {data:null,count:null,error:{message:'History unavailable'}};
     const records=window.records.filter(record=>filters.every(filter=>filter(record))).sort((a,b)=>{
      for(const [column,settings] of ordering){const difference=String(a[column]).localeCompare(String(b[column]));if(difference)return settings.ascending?difference:-difference}
      return 0;
     });
     const cap=window.pageCap||500;
     return {data:start===window.recordEmptyAt?[]:records.slice(start,Math.min(end+1,start+cap)),count:records.length,error:null};
    },
    then:(resolve,reject)=>query.range(0,499).then(resolve,reject)
   };
   return query;
  },
  upsert:async(input,options)=>{window.calls.push(['upsert',table,input,options]);if(window.saveError)return {error:{message:window.saveError}};for(const record of (Array.isArray(input)?input:[input])){const existing=window.records.find(row=>row.work_date===record.work_date);if(existing)Object.assign(existing,record);else window.records.push({...record,id:'saved-'+window.records.length})}return {error:null}},
  update:input=>({eq:async(...filter)=>{window.calls.push(['edit',table,input,filter]);Object.assign(window.records.find(record=>record[filter[0]]===filter[1]),input);return {error:null}}}),
  delete:()=>({eq:async(...filter)=>{window.calls.push(['delete',table,filter]);window.records=window.records.filter(record=>record[filter[0]]!==filter[1]);return {error:null}}})
 })};
};`;
test('authentication, recovery, passkeys and hours regression',async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://hours.test/**',route=>route.fulfill({contentType:'text/html',body:html.replace(/^import .*;$/m,stub)}));
  await page.goto('https://hours.test/');
  await page.waitForFunction(()=>!!window.authEvent);
  assert.equal(await page.evaluate(()=>window.clientOptions.auth.experimental.passkey),true);
  await page.click('#toggle-password');assert.equal(await page.getAttribute('#password','type'),'text');
  await page.click('#toggle-password');assert.equal(await page.getAttribute('#password','type'),'password');
  await page.click('#tab-signup');assert.equal(await page.getAttribute('#password','autocomplete'),'new-password');
  await page.click('#toggle-password');assert.equal(await page.getAttribute('#password','type'),'text');
  await page.fill('#email','person@example.com');await page.fill('#password','example-password');
  await page.click('#auth-submit');await page.waitForFunction(()=>document.getElementById('auth-msg').textContent.includes('Confirma'));
  await page.click('#tab-login');await page.click('#forgot-password');
  await page.waitForFunction(()=>window.calls.some(c=>c[0]==='reset'));
  assert.deepEqual(await page.evaluate(()=>window.calls.find(c=>c[0]==='reset')),['reset','person@example.com',{redirectTo:'https://nth8m6fcs7-byte.github.io/Hours/'}]);
  await page.evaluate(()=>window.authError={message:'<img src=x onerror=alert(1)>'});
  await page.click('#forgot-password');assert.equal(await page.locator('#auth-msg img').count(),0);
  await page.evaluate(()=>window.authError=null);
  await page.click('#passkey-login');await page.waitForSelector('#app',{state:'visible'});
  assert.equal(await page.textContent('#tips-total'),'8h00');assert.equal(await page.textContent('#mine-total'),'17h00');
  assert.equal(await page.locator('#passkey-register').isVisible(),false);
  await page.click('#account summary');
  await page.click('#passkey-register');await page.waitForFunction(()=>window.calls.some(c=>c[0]==='register'));
  assert.equal(await page.locator('[data-edit="two"]').isVisible(),false);
  await page.click('#edit-records');assert.equal(await page.getAttribute('#edit-records','aria-pressed'),'true');
  await page.click('[data-edit="two"]');assert.equal(await page.inputValue('#start'),'22:00');
  await page.fill('#end','03:00');await page.click('#save');await page.waitForFunction(()=>window.calls.some(c=>c[0]==='edit'));
  await page.fill('#date','2026-10-06');await page.fill('#start','09:00');await page.fill('#end','18:00');await page.click('#save');
  await page.waitForFunction(()=>window.calls.some(c=>c[0]==='upsert'));
  if(await page.getAttribute('#edit-records','aria-pressed')!=='true')await page.click('#edit-records');
  page.once('dialog',dialog=>dialog.accept());await page.click('[data-del="three"]');
  await page.waitForFunction(()=>window.calls.some(c=>c[0]==='delete'));
  await page.evaluate(()=>window.authEvent('PASSWORD_RECOVERY'));
  await page.waitForSelector('#recovery',{state:'visible'});assert.equal(await page.locator('#app').isVisible(),false);
  await page.fill('#new-password','new-password');await page.fill('#confirm-password','different');await page.click('#recovery-submit');
  assert.equal(await page.evaluate(()=>window.calls.some(c=>c[0]==='updateUser')),false);
  await page.fill('#confirm-password','new-password');
  await page.evaluate(()=>window.authError={message:'Password policy rejected'});await page.click('#recovery-submit');
  assert.equal(await page.locator('#recovery').isVisible(),true);
  await page.evaluate(()=>window.authError=null);await page.click('#recovery-submit');
  await page.waitForSelector('#app',{state:'visible'});assert.equal(await page.evaluate(()=>sessionStorage.getItem('hours-password-recovery')),null);
  await page.click('#logout');await page.waitForSelector('#auth',{state:'visible'});
  await page.fill('#email','person@example.com');await page.fill('#password','example-password');await page.click('#auth-submit');
  await page.waitForSelector('#app',{state:'visible'});
  await page.evaluate(()=>window.authEvent('PASSWORD_RECOVERY'));await page.waitForSelector('#recovery',{state:'visible'});
  await page.click('#recovery-cancel');await page.waitForSelector('#auth',{state:'visible'});
  await page.goto('https://hours.test/?expired=1#error=access_denied&error_code=otp_expired');
  await page.waitForFunction(()=>document.getElementById('auth-msg').textContent.includes('expirou'));
  assert.equal(await page.evaluate(()=>location.hash),'');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.goto('https://hours.test/?recovery=1#access_token=mock&type=recovery');
  await page.waitForSelector('#recovery',{state:'visible'});
  assert.equal(await page.locator('#app').isVisible(),false);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('hours-password-recovery')),'true');
  // Simulate a persisted SDK session after a reload with the token fragment removed.
  await context.addInitScript(()=>{if(sessionStorage.getItem('hours-password-recovery'))window.restoredSession=true});
  await page.route('https://hours.test/?restored=1',route=>route.fulfill({contentType:'text/html',body:html.replace(/^import .*;$/m,stub+"\nif(window.restoredSession)window.session={user:{id:'user'}};")}));
  await page.goto('https://hours.test/?restored=1');
  await page.waitForSelector('#recovery',{state:'visible'});
  await page.click('#recovery-cancel');await page.waitForSelector('#auth',{state:'visible'});
  assert.deepEqual(errors,[]);
  // Unsupported browsers retain the password login fallback.
  await context.addInitScript(()=>Object.defineProperty(window,'PublicKeyCredential',{value:undefined}));
  await page.goto('https://hours.test/');await page.waitForFunction(()=>!!window.authEvent);
  assert.equal(await page.locator('#passkey-login').isDisabled(),true);
  assert.equal(await page.locator('#auth-submit').isDisabled(),false);
 }finally{await browser.close()}
});
