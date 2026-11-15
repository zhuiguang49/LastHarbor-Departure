import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { test } from 'node:test'

test('static server exposes the formal campaign and returns 404 for retired entries', async () => {
  const manifest=JSON.parse(await fs.readFile(new URL('../../dist/release-manifest.json',import.meta.url)))
  const socket=net.createServer()
  socket.listen(0,'127.0.0.1');await once(socket,'listening')
  const port=socket.address().port
  await new Promise(resolve=>socket.close(resolve))
  const child=spawn(process.execPath,[new URL('./serve.mjs',import.meta.url).pathname],{env:{...process.env,HARBOR_PORT:String(port)},stdio:['ignore','pipe','pipe']})
  const closed=once(child,'exit')
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Static server startup timeout')),5000)
      child.stdout.on('data',data=>{if(data.toString().includes('Last Harbor:')){clearTimeout(timer);resolve()}})
      child.once('error',error=>{clearTimeout(timer);reject(error)})
      child.once('exit',()=>{clearTimeout(timer);reject(Error('Static server exited before startup'))})
    })
    const origin=`http://127.0.0.1:${port}${manifest.base}`
    for (const route of ['', 'campaign/', 'last-harbor-night/']) assert.equal((await fetch(origin+route)).status,200,route)
    for (const [route,mime] of [['local/night.mjs','text/javascript'],['assets/harbor/infected/丧尸.glb','model/gltf-binary']]) {
      const response=await fetch(origin+route)
      assert.equal(response.status,200);assert.ok(response.headers.get('content-type').startsWith(mime),route)
    }
    for(const extension of ['.jpg','.ogg']) {
      const file=manifest.files.find(record=>record.path.endsWith(extension))
      const response=await fetch(origin+file.path)
      assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),extension==='.jpg' ? 'image/jpeg' : 'audio/ogg')
    }
    if(manifest.base!=='/') assert.equal((await fetch(new URL('/',origin))).status,404)
    if(manifest.mode==='custom-domain') {
      const response=await fetch(origin+'CNAME')
      assert.equal(response.status,200);assert.equal(await response.text(),'lastharbor.zhuiguang.tech\n')
    } else assert.equal((await fetch(origin+'CNAME')).status,404)
    const retired=['legacy-sandbox','campaign-m0','campaign-m1','campaign-m2','campaign-m3','campaign-m3-a0','campaign-m3-a1','campaign-m3-a2',
      'campaign-m4-a0','campaign-m4-a1','campaign-m4','campaign-m5-a0','campaign-m5-a1','campaign-m5-b','campaign-m5-c','character-lab','infected-lab','infected-lab/full']
    for (const route of retired) for (const suffix of ['', '/']) assert.equal((await fetch(origin+route+suffix)).status,404,route+suffix)
    for (const name of ['character-lab','character-behavior-lab','campaign-m3-a0','campaign-m3-a1','campaign-m3-a2','campaign-m4-a0','campaign-m4-a1']) {
      assert.equal((await fetch(origin+`local/${name}.mjs`)).status,404,name)
    }
  } finally { child.kill();await closed }
})
