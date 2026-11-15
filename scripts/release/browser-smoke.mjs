import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'

const address = process.env.LASTHARBOR_URL || 'http://127.0.0.1:4196/'
const out = new URL('../../artifacts/browser-smoke/',import.meta.url)
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1280,height:800}})
const report={address,scope:'Focused static release entry and asset/audio smoke; no full playthrough or performance claim',errors:[]}
page.on('pageerror',error=>{report.errors.push(error.stack);console.log('pageerror',error.message)})
page.on('console',message=>{if(message.type()==='error'){report.errors.push(message.text());console.log('console error',message.text())}})
page.on('response',response=>{if(response.status()>=400){report.errors.push(`${response.status()} ${response.url()}`);console.log('http error',response.status(),response.url())}})
try {
  await page.goto(address+'?q=low&dynres=0&seed=4207')
  console.log('Waiting for full campaign installation')
  await page.waitForFunction(()=>!!window.__lastHarborCampaign?.chapter5?.ending,null,{timeout:90000})
  report.entry=await page.evaluate(()=>({url:location.href,ready:__ready,fatal:__fatal,snapshot:__lastHarborCampaign.snapshot(),audio:__G.audio.ctx.state}))
  assert.equal(report.entry.snapshot.entry,'campaign-m5-c')
  assert.equal(report.entry.snapshot.chapter.currentChapter,'CH1')
  assert.equal(report.entry.snapshot.chapter5Trial,false)
  await page.screenshot({path:new URL('title.png',out).pathname})
  await page.getByRole('button',{name:'开始行动',exact:true}).click()
  await page.waitForFunction(()=>__lastHarborNarrative.snapshot().active)
  report.opening=await page.evaluate(()=>__lastHarborNarrative.snapshot())
  assert.equal(report.opening.mode,'intro')
  await page.screenshot({path:new URL('chapter1-opening.png',out).pathname})
  report.resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({url:r.name,status:r.responseStatus})))
  assert.equal(report.resources.filter(r=>r.url.endsWith('.ogg')).length,16)
  assert.ok(report.resources.every(r=>new URL(r.url).pathname.startsWith(new URL(report.entry.url).pathname.split('/last-harbor-night/')[0]+'/')))
  assert.deepEqual(report.errors,[])
  report.pass=true
} catch(error) {
  report.pass=false;report.failure=error.stack;process.exitCode=1
  report.diagnostic=await page.evaluate(()=>({body:document.body.innerText.slice(-2000),globals:Object.keys(window).filter(k=>k.includes('Harbor')),fatal:window.__fatal})).catch(()=>null)
} finally {
  await fs.writeFile(new URL('browser-smoke.json',out),JSON.stringify(report,null,2)+'\n')
  await browser.close()
}
console.log(JSON.stringify({pass:report.pass,errors:report.errors,failure:report.failure},null,2))
