import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'

const address = new URL(process.env.LASTHARBOR_URL || 'http://127.0.0.1:4181/')
const manifest=JSON.parse(await fs.readFile(new URL('../../dist/release-manifest.json',import.meta.url)))
assert.equal(address.pathname,manifest.base,'Preview URL must match the static package base')
const out = new URL(`../../artifacts/browser-smoke/${manifest.mode}/`,import.meta.url)
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=user-gesture-required']})
const page=await browser.newPage({viewport:{width:1280,height:800}})
const report={address:address.href,mode:manifest.mode,browser:browser.version(),scope:'Title, Chapter 1 opening, input/audio, menu, refresh and static assets; no full playthrough',errors:[]}
page.on('pageerror',error=>report.errors.push(error.stack))
page.on('console',message=>{if(message.type()==='error') report.errors.push(message.text())})
page.on('response',response=>{if(response.status()>=400) report.errors.push(`${response.status()} ${response.url()}`)})
page.on('requestfailed',request=>{if(request.failure()?.errorText!=='net::ERR_ABORTED') report.errors.push(`${request.failure()?.errorText} ${request.url()}`)})
async function title(url,reload=false) {
  if(reload) await page.reload()
  else await page.goto(url)
  await page.waitForFunction(()=>typeof window.__lastHarborCampaign?.snapshot==='function',null,{timeout:90000})
  await page.getByRole('button',{name:'开始行动',exact:true}).waitFor({state:'visible'})
  const snapshot=await page.evaluate(()=>window.__lastHarborCampaign.snapshot())
  assert.equal(snapshot.entry,'campaign-m5-c');assert.equal(snapshot.chapter.currentChapter,'CH1');assert.equal(snapshot.chapter5Trial,false)
  assert.equal(new URL(page.url()).searchParams.get('play'),'1')
  return snapshot
}
try {
  const url=new URL(address);url.search='?q=low&dynres=0&seed=4207'
  report.entry=await title(url.href)
  await page.screenshot({path:new URL('title.png',out).pathname})
  report.resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({url:r.name,status:r.responseStatus})))
  const loaded=report.resources.map(r=>decodeURI(new URL(r.url).pathname))
  for(const file of manifest.files.filter(file=>/\.(ogg|glb|jpg)$/.test(file.path))) assert.ok(loaded.includes(manifest.base+file.path),`Resource not loaded: ${file.path}`)
  for(const name of ['campaign-ch5-ending.mjs','campaign-ch5-fuel.mjs','campaign-ch5-battle.mjs']) {
    assert.ok(manifest.files.some(file=>file.path==='local/'+name),`Missing chapter 5 module: ${name}`)
    assert.ok(loaded.includes(manifest.base+'local/'+name),`Chapter 5 module not imported: ${name}`)
  }
  assert.ok(report.resources.every(r=>new URL(r.url).origin===address.origin && new URL(r.url).pathname.startsWith(manifest.base)))
  await page.getByRole('button',{name:'开始行动',exact:true}).click()
  await page.waitForFunction(()=>window.__lastHarborNarrative.snapshot().active)
  report.opening=await page.evaluate(()=>window.__lastHarborNarrative.snapshot())
  assert.equal(report.opening.mode,'intro')
  report.audioAfterClick=await page.evaluate(()=>window.__G.audio.ctx.state)
  assert.equal(report.audioAfterClick,'running')
  await page.screenshot({path:new URL('chapter1-opening.png',out).pathname})
  for(let i=0;i<report.opening.cardCount-1;i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await page.waitForFunction(()=>window.__G.game.state==='playing')
  // Input checks stay at the unarmed chapter entrance; no movement or combat.
  await page.locator('canvas').first().click({position:{x:640,y:400},force:true})
  await page.waitForFunction(()=>!!document.pointerLockElement)
  report.input=await page.evaluate(()=>({pointerLock:!!document.pointerLockElement,mode:window.__G.input.mode,chapter:window.__lastHarborCampaign.snapshot().chapter.currentChapter}))
  assert.equal(report.input.chapter,'CH1')
  await page.keyboard.press('KeyP')
  await page.waitForFunction(()=>window.__G.game.state==='paused')
  report.pause=await page.evaluate(()=>({state:window.__G.game.state,menu:window.__G.game.menus.root.textContent}))
  await page.screenshot({path:new URL('pause.png',out).pathname})
  await page.getByRole('button',{name:'继续游戏',exact:true}).click()
  await page.waitForFunction(()=>window.__G.game.state==='playing')
  report.reloaded=await title(page.url(),true)
  report.campaignRoute=await title(new URL('campaign/?q=low&dynres=0&seed=4207',address).href)
  await page.goto(new URL('CREDITS.md',address).href)
  await page.goBack()
  await page.waitForFunction(()=>typeof window.__lastHarborCampaign?.snapshot==='function',null,{timeout:90000})
  await page.getByRole('button',{name:'开始行动',exact:true}).waitFor({state:'visible'})
  report.backNavigation=await page.evaluate(()=>window.__lastHarborCampaign.snapshot().chapter.currentChapter)
  assert.equal(report.backNavigation,'CH1')
  assert.deepEqual(report.errors,[])
  report.pass=true
} catch(error) {
  report.pass=false;report.failure=error.stack;process.exitCode=1
  report.diagnostic=await page.evaluate(()=>({body:document.body.innerText.slice(-2000),fatal:window.__fatal,state:window.__G?.game?.state,narrative:window.__lastHarborNarrative?.snapshot()})).catch(()=>null)
} finally {
  await fs.writeFile(new URL('browser-smoke.json',out),JSON.stringify(report,null,2)+'\n')
  await browser.close()
}
console.log(JSON.stringify({pass:report.pass,mode:report.mode,browser:report.browser,errors:report.errors,failure:report.failure,diagnostic:report.pass ? undefined : report.diagnostic},null,2))
