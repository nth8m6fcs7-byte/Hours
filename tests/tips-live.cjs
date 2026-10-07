const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],assets=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(/tips-(core|ui)\.mjs|tips\.css/.test(r.url()))assets.push([r.url(),r.status(),r.headers()['content-type']]);});
  await page.goto('https://nth8m6fcs7-byte.github.io/Hours/?verify=team-tips',{waitUntil:'networkidle'});
  await page.locator('#email').waitFor({state:'visible'});
  assert.equal(await page.locator('#team-tips #gt-review').count(),1);
  assert.equal(await page.locator('#section-tips').textContent(),'Gorjetas da equipa');
  assert.deepEqual(errors,[]);assert.equal(assets.length,3);assert(assets.every(a=>a[1]===200));
  console.log('PASS: deployed app loads actual SDK and all tips assets, initializes the feature and preserves the unauthenticated login screen; no real payments created.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
