import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { parse } from '@babel/parser'
import { INFECTED_AUDIO_FILES, loadInfectedAudio } from './character-audio.mjs'

const root=new URL('../../',import.meta.url)
const hash=bytes => createHash('sha256').update(bytes).digest('hex')
const html=await fs.readFile(new URL('几猫国产3A大作_V1-fable5.2.html',root),'utf8')
const code=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(code => code.includes('function u_('))
const functions=new Map()
function visit(node) {
  if (!node || typeof node !== 'object') return
  if (node.type === 'FunctionDeclaration') functions.set(node.id.name,code.slice(node.start,node.end))
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') visit(value)
  }
}
visit(parse(code,{sourceType:'module'}))
// Execute only the tiny native event emitter, never the game/audio boot.
const nativeEvents=Function(`return (${functions.get('Dy')})`)()

class Param {
  constructor(value=0) { this.value=value; this.targets=[] }
  setTargetAtTime(value,time,tau) { this.targets.push({value,time,tau}) }
}
class Node {
  constructor(context,type) { this.context=context; this.type=type; this.outputs=[]; this.disconnects=0; context.nodes.push(this) }
  connect(node) { assert.equal(node.context,this.context); this.outputs.push(node); return node }
  disconnect() { this.outputs=[]; this.disconnects++ }
}
class FakeContext extends EventTarget {
  constructor() { super(); this.state='running'; this.currentTime=10; this.nodes=[]; this.sources=[]; this.decoded=[]; this.listeners=new Set() }
  addEventListener(type,callback) { super.addEventListener(type,callback); this.listeners.add(callback) }
  removeEventListener(type,callback) { super.removeEventListener(type,callback); this.listeners.delete(callback) }
  async decodeAudioData(bytes) {
    const buffer={numberOfChannels:1,duration:3,bytes}
    this.decoded.push(buffer); return buffer
  }
  createGain() { const node=new Node(this,'gain'); node.gain=new Param(1); return node }
  createBiquadFilter() { const node=new Node(this,'filter'); node.frequency=new Param(); node.Q=new Param(); return node }
  createPanner() {
    const node=new Node(this,'panner')
    for (const axis of ['X','Y','Z']) node[`position${axis}`]=new Param()
    return node
  }
  createBufferSource() {
    const node=new Node(this,'source'); node.starts=0; node.stops=0; node.buffer=null
    node.start=() => { assert.ok(node.buffer); node.starts++; assert.equal(node.starts,1) }
    node.stop=() => { node.stops++ }
    node.end=() => node.onended?.()
    this.sources.push(node); return node
  }
  changeState(state) { this.state=state; this.dispatchEvent(new Event('statechange')) }
}
function fixture() {
  const ctx=new FakeContext(), bus=new Node(ctx,'native-near'), events=nativeEvents()
  const subscriptions=new Set(), on=events.on.bind(events), off=events.off.bind(events)
  events.on=(name,callback) => { subscriptions.add(callback); return on(name,callback) }
  events.off=(name,callback) => { subscriptions.delete(callback); return off(name,callback) }
  const elements=[1,0,0,0,0,1,0,0,0,0,1,0,-120,1.7,-240,1]
  const g={audio:{ctx,meleeBus:bus},events,game:{state:'playing'},player:{alive:true},camera:{matrixWorld:{elements}}}
  const fetched=[]
  const fetch=async url => { fetched.push(url); return {ok:true,arrayBuffer:async () => new ArrayBuffer(4)} }
  const setState=state => { const prev=g.game.state; g.game.state=state; events.emit('game:state',{state,prev}) }
  return {g,ctx,bus,subscriptions,fetched,fetch,setState}
}
const pos={x:-117,y:1.7,z:-240}
const assertReleased=(ctx,bus) => {
  for (const node of ctx.nodes.filter(node => node !== bus)) {
    assert.deepEqual(node.outputs,[])
    assert.equal(node.disconnects,1)
  }
}

test('16 case-sensitive OGG routes match current source hashes and the native mixer/listener contract', async () => {
  assert.equal(hash(html),'9e55b5200b088adaf8e1152da04efc0d3b25e236e6baf2dee96f81e23e084966')
  assert.equal(hash(await fs.readFile(new URL('assets/harbor/infected/丧尸.glb',root))),'8b5319bdb04e67ecd90045e81870dcaab1148aee3603083c792a6a00d8084e33')
  assert.equal(INFECTED_AUDIO_FILES.length,16)
  assert.equal(new Set(INFECTED_AUDIO_FILES.map(file => file.url)).size,16)
  for (const kind of ['idle','alert','attack','chase']) {
    const files=INFECTED_AUDIO_FILES.filter(file => file.kind === kind)
    assert.equal(files.length,4)
    for (const [i,file] of files.entries()) {
      const name={idle:'idle',alert:'Alert',attack:'Attack',chase:'chase'}[kind]
      assert.equal(file.url,`/assets/harbor/audio/infected/${name}/${name}${i+1}.ogg`)
      assert.equal(hash(await fs.readFile(new URL(file.url.slice(1),root))),file.sha256)
      const bytes=await fs.readFile(new URL(file.url.slice(1),root))
      assert.equal(bytes.subarray(0,4).toString(),'OggS')
      const packet=bytes.indexOf(Buffer.from('OpusHead'))
      assert.ok(packet>=0,'Opus identification header')
      assert.equal(bytes[packet+9],1,'mono audio')
    }
  }
  const mixer=functions.get('u_')
  for (const fragment of ['H.near.connect(S)','H.near.connect(Q)','w.gain.value=me','ue?0:1',
    're.x=De[12],re.y=De[13],re.z=De[14]','pe.positionX.value=re.x','pe.forwardX.value=-De[8]',
    'he.distanceModel="inverse",he.refDistance=3,he.rolloffFactor=.6,he.maxDistance=400',
    'ie(De.pan,Ht.x||0,Ht.y||0,Ht.z||0)']) assert.ok(mixer.includes(fragment),fragment)
  const build=await fs.readFile(new URL('scripts/harbor/build-night.mjs',root),'utf8')
  assert.ok(build.includes('Re.meleeBus=H.near;'))
})

test('shared buffers, independent voices, one source per voice, updates never replay', async () => {
  const f=fixture(), bank=await loadInfectedAudio(f.g,{fetch:f.fetch})
  assert.equal(f.fetched.length,16); assert.equal(f.ctx.decoded.length,16); assert.equal(f.ctx.nodes.length,1)
  const first=bank.createVoice(), second=bank.createVoice()
  assert.equal(first.play('idle',pos,{loop:true,variant:2}),true)
  const source=f.ctx.sources[0], buffer=source.buffer, oldEnd=source.onended
  second.play('idle',pos,{variant:2})
  assert.equal(f.ctx.sources[1].buffer,buffer)
  assert.equal(bank.snapshot().active,2)
  for (let i=0;i<80;i++) first.update(pos)
  assert.equal(f.ctx.sources.length,2); assert.equal(source.starts,1); assert.equal(source.loop,true)
  first.play('attack',pos,{variant:4})
  assert.equal(source.stops,1); assert.equal(f.ctx.sources[1].stops,0)
  oldEnd(); assert.equal(first.snapshot().kind,'attack')
  assert.equal(first.snapshot().variant,4); assert.equal(first.snapshot().started,2)
  first.stop(); second.dispose(); bank.dispose(); bank.dispose()
  assert.equal(bank.snapshot().buffers,0); assert.equal(bank.snapshot().voices,0)
  assert.equal(f.subscriptions.size,0); assert.equal(f.ctx.listeners.size,0)
  assertReleased(f.ctx,f.bus); assert.equal(f.bus.disconnects,0)
})

test('world-space distance and smooth occlusion preserve the existing bus graph', async () => {
  const f=fixture(), bank=await loadInfectedAudio(f.g,{fetch:f.fetch}), voice=bank.createVoice()
  voice.play('alert',pos)
  const [source,gain,filter,pan]=f.ctx.nodes.slice(1)
  assert.deepEqual(source.outputs,[gain]); assert.deepEqual(gain.outputs,[filter]); assert.deepEqual(filter.outputs,[pan]); assert.deepEqual(pan.outputs,[f.bus])
  assert.equal(pan.positionX.value,-117); assert.equal(pan.positionZ.value,-240)
  assert.equal(pan.distanceModel,'inverse'); assert.equal(pan.refDistance,3); assert.equal(pan.rolloffFactor,.6)
  assert.equal(voice.snapshot().distance,3); assert.equal(voice.snapshot().distanceGain,1)
  voice.update({x:-90,y:1.7,z:-240},{occluded:true})
  assert.equal(voice.snapshot().distance,30); assert.ok(Math.abs(voice.snapshot().distanceGain-.15625)<1e-12)
  assert.deepEqual(gain.gain.targets,[{value:1.3*10**(18/20)*.35,time:10,tau:.06}])
  assert.deepEqual(filter.frequency.targets,[{value:1200,time:10,tau:.06}])
  for (let i=0;i<20;i++) voice.update(pos,{occluded:true})
  assert.equal(gain.gain.targets.length,1); assert.equal(f.ctx.sources.length,1)
  voice.update(pos)
  assert.deepEqual(filter.frequency.targets.at(-1),{value:20000,time:10,tau:.06})
  f.g.camera.matrixWorld.elements[12]=-147
  voice.update(pos); assert.equal(voice.snapshot().distance,30)
  bank.dispose(); assertReleased(f.ctx,f.bus)
})

test('pause/death/context suspension stop immediately; resume and update never replay stale attacks', async () => {
  const f=fixture(), bank=await loadInfectedAudio(f.g,{fetch:f.fetch}), voice=bank.createVoice()
  voice.play('attack',pos)
  f.setState('paused'); assert.equal(voice.snapshot().active,false)
  assert.equal(voice.play('attack',pos),false)
  f.setState('playing'); voice.update(pos); assert.equal(f.ctx.sources.length,1)
  voice.play('chase',pos,{loop:true}); f.ctx.changeState('suspended')
  assert.equal(voice.snapshot().active,false); assert.equal(voice.play('alert',pos),false)
  f.ctx.changeState('running'); voice.update(pos); assert.equal(f.ctx.sources.length,2)
  voice.play('attack',pos); f.g.player.alive=false; f.g.events.emit('player:dead',{})
  assert.equal(voice.snapshot().active,false); assert.equal(voice.play('attack',pos),false)
  f.setState('dead'); f.g.player.alive=true; f.setState('playing')
  voice.update(pos); assert.equal(f.ctx.sources.length,3)
  voice.play('chase',pos); voice.stop() // Reset owner must call stop: native H has no reset event.
  voice.update(pos); assert.equal(f.ctx.sources.length,4)
  bank.dispose(); assertReleased(f.ctx,f.bus)
  for (const source of f.ctx.sources) assert.equal(source.stops,1)
})

test('natural endings free nodes, default variants rotate, invalid input and disposed voices fail clearly', async () => {
  const f=fixture(), bank=await loadInfectedAudio(f.g,{fetch:f.fetch}), voice=bank.createVoice()
  for (const variant of [1,2,3,4,1]) {
    voice.play('alert',pos); assert.equal(voice.snapshot().variant,variant)
    f.ctx.sources.at(-1).end(); assert.equal(voice.snapshot().active,false)
  }
  assert.throws(() => voice.play('hit',pos),/Unknown infected audio kind/)
  assert.throws(() => voice.play('attack',pos,{variant:0}),/variant must be 1..4/)
  assert.throws(() => voice.update({x:NaN,y:0,z:0}),/finite world-space/)
  voice.dispose(); assert.equal(voice.play('alert',pos),false)
  bank.dispose(); assert.throws(() => bank.createVoice(),/disposed/)
  assertReleased(f.ctx,f.bus)
})

test('missing native interfaces, fetch/decode failures and cancellation leave no graph or listeners', async () => {
  await assert.rejects(loadInfectedAudio({}),/missing native interfaces.*g.audio.meleeBus/)
  for (const failure of ['fetch','decode','stereo','cancel']) {
    const f=fixture(), controller=new AbortController()
    const decode=f.ctx.decodeAudioData.bind(f.ctx)
    f.ctx.decodeAudioData=async bytes => {
      if (f.ctx.decoded.length === 3) {
        if (failure === 'decode') throw Error('unsupported OGG')
        if (failure === 'stereo') return {numberOfChannels:2,duration:3}
        if (failure === 'cancel') controller.abort()
      }
      return decode(bytes)
    }
    const fetch=async url => failure === 'fetch' && f.fetched.length === 3 ? {ok:false,status:404} : f.fetch(url)
    await assert.rejects(loadInfectedAudio(f.g,{fetch,signal:controller.signal}),/load failed: idle .*idle4.ogg: (HTTP 404|unsupported OGG|Expected a nonempty mono AudioBuffer|Infected audio load cancelled)/)
    assert.equal(f.ctx.sources.length,0); assert.equal(f.ctx.nodes.length,1)
    assert.equal(f.subscriptions.size,0); assert.equal(f.ctx.listeners.size,0)
  }
})

test('load completion reads current game state and a failed start releases every owned node', async () => {
  const f=fixture()
  f.g.game.state='title'
  const bank=await loadInfectedAudio(f.g,{fetch:async url => { f.g.game.state='playing'; return f.fetch(url) }})
  const voice=bank.createVoice(), create=f.ctx.createBufferSource.bind(f.ctx)
  f.ctx.createBufferSource=() => { const source=create(); source.start=() => { throw Error('start failed') }; return source }
  assert.throws(() => voice.play('attack',pos),/play failed: .*Attack1.ogg: start failed/)
  assert.equal(voice.snapshot().active,false); assert.equal(voice.snapshot().started,0)
  bank.dispose(); assertReleased(f.ctx,f.bus)
})
