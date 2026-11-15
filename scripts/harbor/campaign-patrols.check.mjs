import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { parse } from '@babel/parser'
import { installCampaignPatrols } from './campaign-patrols.mjs'
import { CH1 } from './campaign-ch1-layout.mjs'
import { buildCampaignSectors } from './campaign-sectors.mjs'

// Real native Three, physics, combat, actor factories, AI and damage. Only
// material rasters/audio/render effects are stubs; this is not visual QA.
const bytes = fs.readFileSync(new URL('../../几猫国产3A大作_V1-fable5.2.html', import.meta.url))
assert.equal(createHash('sha256').update(bytes).digest('hex'), '9e55b5200b088adaf8e1152da04efc0d3b25e236e6baf2dee96f81e23e084966')
const html = bytes.toString(), source = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const body = parse(source).program.body[0].expression.callee.body.body
const boundary = body.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === 'gM'))
assert.ok(boundary)
const nodes = body.filter(node => node.end <= boundary.start), edits = []
for (const node of nodes) {
  for (const declaration of node.declarations || []) {
    const name = declaration.id?.name
    if (!['Ya','ol'].includes(name)) continue
    assert.equal(source.slice(declaration.init.start, declaration.init.end), name === 'Ya' ? '-40' : '-32')
    // Same two native nav-domain adapters as the audited M1 build.
    edits.push({ start: declaration.init.start, end: declaration.init.end, value: name === 'Ya' ? '-164' : '-344' })
  }
}
const nativeEnemies = nodes.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'Em')
const enemySource = source.slice(nativeEnemies.start, nativeEnemies.end)
const boltAnchor = 'G.from.copy(T),G.len=0'
assert.equal(enemySource.split(boltAnchor).length, 2)
assert.ok(enemySource.includes('fireBolt(T,D,C){'))
const boltStart = nativeEnemies.start + enemySource.indexOf(boltAnchor)
// Integration owner must apply exactly this ownership-only AST adapter to Em.
// No sensing, attack, damage or death code is replaced by this fixture.
edits.push({ start: boltStart, end: boltStart + boltAnchor.length,
  value: `${boltAnchor},G.owner=C,G.ownerId=C.id` })
assert.equal(edits.length, 3)
let prefix = source.slice(nodes[0].start, nodes.at(-1).end)
for (const edit of edits.sort((a,b) => b.start - a.start)) {
  const start = edit.start - nodes[0].start, end = edit.end - nodes[0].start
  prefix = prefix.slice(0, start) + edit.value + prefix.slice(end)
}
const randomMath = Object.create(Math)
let seed = 4207
randomMath.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
const native = vm.runInNewContext(`(()=>{${prefix};return {THREE:lt,physics:d3,enemies:Em,combat:zv,props:Yg,context:ob,merge:By,warehouse:ab,crane:z1,
  robotVisuals:{create(kind,materials){const definition=kind==='hound'?Z_():j_();return {...pm(definition,materials,{radius:3,center:[0,0,0]}),definition}}}}})()`,
  { console, performance, AbortController, window: {}, Math: randomMath }, { timeout: 15000 })
const T = native.THREE

async function fixture({ world = false, chapter1 = false } = {}) {
  const handlers = new Map(), events = [], messages = [], attacks = [], damage = [], effects = [], spawns = []
  const g = { THREE: T, scene: new T.Scene(), params: {}, game: { state: 'playing', run:{queue:[]} },
    player: { alive: true, health: 100, pos: new T.Vector3(0,0,-360), eye: new T.Vector3(0,1.68,-360), vel: new T.Vector3(),
      damage(amount, from) { damage.push({ amount, from: from.clone() }); this.health = Math.max(0, this.health - amount); this.alive = this.health > 0 } },
    camera: new T.PerspectiveCamera(), level: { coverPoints: [], interiorBoxes: [] },
    mats: { get: () => new T.MeshStandardMaterial(), emissive: () => new T.MeshBasicMaterial(),
      label: () => ({ material: new T.MeshBasicMaterial(), aspect: 3 }), decal: () => ({ material: new T.MeshBasicMaterial(), aspect: 1 }) },
    render: { lightPool: { acquire: () => null, flash() {} } },
    audio: { loop: () => ({ setPos() {}, setGain() {}, setPitch() {}, stop() {} }) },
    hud: { message: (text, seconds) => messages.push({ text, seconds }) },
    events: { on(name, handler) { const list = handlers.get(name) || []; list.push(handler); handlers.set(name, list) },
      emit(name, event) { if (name === 'enemy:fire' || name === 'enemy:melee') attacks.push({ name, ...event });
        if (name === 'enemy:spawn') spawns.push(event.enemy.id)
        for (const handler of handlers.get(name) || []) handler(event) } },
    fx: Object.fromEntries(['smoke','sparks','dust','explosion','debris','tracer','muzzleFlash'].map(name => [name, () => effects.push(name)])),
  }
  g.physics = native.physics(g)
  g.physics.bounds.min.set(-160,0,-340)
  g.physics.bounds.max.set(40,30,30)
  let layer = null
  if (world) {
    g.props = native.props(g)
    g.robotVisuals = native.robotVisuals
    g.campaignFactories = { context: () => native.context(g), merge: native.merge,
      warehouse: context => native.warehouse(context), crane: builder => native.crane(g,builder) }
    const previous = globalThis.document
    globalThis.document = { createElement: () => ({ getContext: () => Object.fromEntries(
      ['beginPath','ellipse','fill','moveTo','lineTo','stroke'].map(name => [name,()=>{}])) }) }
    try { layer = buildCampaignSectors(g,{chapter1}) } finally {
      if (previous) globalThis.document = previous
      else delete globalThis.document
    }
    g.level.interiorBoxes = layer.interiorBoxes || []
  }
  g.physics.build()
  g.combat = native.combat(g)
  g.enemies = await native.enemies(g)
  const clearNative = g.enemies.clear.bind(g.enemies)
  g.enemies.clear = () => assert.fail('Patrol director must never clear unrelated actors')
  const patrols = installCampaignPatrols(g)
  function tick(dt = .05, ai = true) {
    patrols.update(dt)
    if (ai && g.game.state === 'playing' && g.player.alive) g.enemies.update(dt)
  }
  function advance(seconds, ai = true) {
    for (let time = 0; time < seconds - 1e-8; time += .05) tick(Math.min(.05, seconds - time), ai)
  }
  const actors = () => patrols.snapshot().actors.map(slot => g.enemies.list.find(enemy => enemy.id === slot.nativeId)).filter(Boolean)
  const kill = enemy => enemy.damage(enemy.hp, enemy.pos.clone(), null, 'body')
  return { g, patrols, events, messages, attacks, damage, effects, spawns, tick, advance, actors, kill, layer, clearNative }
}


test('no pre-power patrols; activation reserves exactly 3+3 and staggers entries across six shared sites', async () => {
  const f = await fixture()
  f.advance(60,false)
  assert.equal(f.patrols.snapshot().activeCount,0); assert.equal(f.spawns.length,0)
  assert.equal(f.patrols.activate(),true); assert.equal(f.patrols.activate(),false)
  assert.deepEqual(f.patrols.snapshot().queuedByType,{hound:3,gull:3})
  for (let i=0;i<100;i++) {
    f.tick(.05,false)
    assert.deepEqual(f.patrols.snapshot().reservedByType,{hound:3,gull:3})
  }
  const state = f.patrols.snapshot()
  assert.deepEqual(state.activeByType,{hound:3,gull:3})
  assert.equal(state.queued.length,0)
  assert.equal(new Set(state.history.map(item => item.site)).size,6)
  for (const item of state.history) {
    assert.ok(item.distance >= 18 && (item.hidden || item.outsideFront))
    assert.deepEqual([item.position[0],item.position[2]],[...CH1.patrolSites[item.site]])
  }
  assert.equal(installCampaignPatrols(f.g),f.patrols)
})

test('all player LOS samples are required for hidden spawning; front-visible candidates defer with reservations intact', async () => {
  const f = await fixture(), p=f.g.player
  p.pos.set(0,0,-390); p.eye.set(0,1.68,-390)
  f.g.camera.rotation.y=Math.PI; f.g.camera.fov=120; f.g.camera.aspect=2
  let calls=0
  f.g.physics.lineOfSight=()=>++calls%7 === 0
  f.patrols.activate(); f.advance(10,false)
  assert.equal(f.spawns.length,0)
  assert.equal(f.patrols.snapshot().queued.length,6)
  assert.ok(f.patrols.snapshot().counts.deferred>0)
  f.g.physics.lineOfSight=()=>false
  f.advance(6,false)
  assert.equal(f.spawns.length,6)
  assert.ok(f.patrols.snapshot().history.every(item => item.hidden && !item.behind))
})

test('unsafe nav, roof, water, warehouse interior, colliders, paths and near-player sites defer rather than fall back', async () => {
  for (const reason of ['nav','roof','water','interior','collider','path','near','occupied']) {
    const f=await fixture(), physics=f.g.physics
    f.patrols.activate()
    if (reason === 'nav') physics.nav.isWalkable=()=>false
    if (reason === 'roof') physics.groundHeight=()=>6
    if (reason === 'water') physics.groundHeight=()=>-2
    if (reason === 'interior') f.g.level.interiorBoxes=[{min:new T.Vector3(-60,0,-340),max:new T.Vector3(29,10,-270)}]
    if (reason === 'collider') physics.boxes.push({min:new T.Vector3(-60,-.1,-340),max:new T.Vector3(29,20,-270),bulletOnly:false})
    if (reason === 'path') physics.nav.findPath=()=>null
    if (reason === 'near') { f.g.player.pos.set(-15,0,-301); physics.nav.isWalkable=(x,z)=>Math.hypot(x+15,z+301)<18 }
    if (reason === 'occupied') for (const [x,z] of CH1.patrolSites) f.g.enemies.spawn('hound',new T.Vector3(x,0,z),{passive:true})
    f.advance(8,false)
    assert.equal(f.patrols.snapshot().activeCount,0,reason)
    assert.ok(f.patrols.snapshot().counts.deferred>0 || reason==='occupied',reason)
  }
})

test('killed patrols reserve brief replacements; recent entrants and other live actors keep sectors separated', async () => {
  const f=await fixture()
  f.patrols.activate(); f.advance(5,false)
  const first=f.actors()[0], oldId=first.id
  f.kill(first); f.tick(.05,false)
  assert.deepEqual(f.patrols.snapshot().reservedByType,{hound:3,gull:3})
  const due=f.patrols.snapshot().queued[0].due
  assert.ok(due-f.patrols.snapshot().elapsed >= 2.99)
  f.advance(3,false)
  assert.equal(f.patrols.snapshot().activeCount,5,'Occupied/recent authored sites defer replacement')
  // Let native wrecks retire and actors approach through the real AI.
  f.g.player.damage=()=>{}
  f.advance(15)
  const state=f.patrols.snapshot()
  assert.ok(state.history.some(item=>item.nativeId!==oldId && item.id>6))
  assert.ok(state.activeByType.hound<=3 && state.activeByType.gull<=3)
})

test('native powered patrol sensing produces attacking hounds and gulls with original telegraphs', async () => {
  const f=await fixture(), telegraphs=[]
  f.g.player.pos.set(0,0,-328); f.g.player.eye.set(0,1.68,-328)
  f.g.player.damage=(amount,from)=>f.damage.push({amount,from:from.clone()})
  f.g.events.on('enemy:telegraph',event=>telegraphs.push(event))
  f.patrols.activate(); f.advance(35)
  assert.ok(telegraphs.length)
  assert.ok(f.attacks.some(attack=>attack.type==='hound'))
  assert.ok(f.attacks.some(attack=>attack.type==='gull'))
  assert.ok(f.damage.length)
  assert.ok(f.damage.every(hit=>hit.amount<=15))
  assert.ok(f.actors().every(actor=>!actor.passive))
})

test('checkpoint replaces exact survivors, wounds, positions and queue delays without duplicating a wave', async () => {
  const f=await fixture()
  f.patrols.activate(); f.advance(2,false)
  f.actors()[0].damage(31,f.actors()[0].pos.clone(),null,'body')
  f.actors()[0].pos.x+=1
  const saved=JSON.parse(JSON.stringify(f.patrols.snapshot()))
  const count=f.spawns.length
  f.patrols.reset(saved); f.tick(.05,false)
  const state=f.patrols.snapshot()
  assert.deepEqual(state.actors.map(({id,type,position,hp})=>({id,type,position,hp})),
    saved.actors.map(({id,type,position,hp})=>({id,type,position,hp})))
  assert.deepEqual(state.queued,saved.queued)
  assert.deepEqual(state.history,saved.history)
  assert.deepEqual(state.counts,saved.counts)
  assert.equal(f.spawns.length,count+saved.actors.length)
  assert.equal(f.g.enemies.list.filter(actor=>actor.alive).length,saved.actors.length)
  saved.actors[0].position[0]=999; saved.queued[0].due=999
  assert.notEqual(f.patrols.snapshot().actors[0].position[0],999)
  assert.notEqual(f.patrols.snapshot().queued[0].due,999)
  f.advance(4,false)
  assert.deepEqual(f.patrols.snapshot().activeByType,{hound:3,gull:3})
  assert.equal(f.patrols.snapshot().history.length,6)
})

test('native clear before checkpoint reset still restores exactly once; pause/death retain checkpoint state', async () => {
  const f=await fixture()
  f.patrols.activate(); f.advance(5,false)
  const saved=f.patrols.snapshot()
  f.clearNative()
  f.patrols.reset(saved)
  for (const state of ['paused','intro','title','dead']) {
    f.g.game.state=state
    const before=f.patrols.snapshot(); f.advance(10,false)
    assert.deepEqual(f.patrols.snapshot(),before)
  }
  f.g.game.state='playing'; f.tick(.05,false)
  assert.equal(f.actors().length,6)
  const count=f.spawns.length; f.advance(5,false)
  assert.equal(f.spawns.length,count)
})

test('chapter exit retires its actors and bolts permanently while preserving unrelated actors', async () => {
  const f=await fixture()
  f.patrols.activate(); f.advance(2,false)
  const actors=f.actors(), owner=actors.find(actor=>actor.type==='gull')
  const unrelated=f.g.enemies.spawn('gull',new T.Vector3(20,6,-300),{passive:true,hover:6})
  const ctx=f.g.enemies.debug.ctx
  ctx.fireBolt(owner.pos,new T.Vector3(0,0,1),owner)
  ctx.fireBolt(unrelated.pos,new T.Vector3(0,0,1),unrelated)
  const ownBolt=f.g.enemies.debug.bolts.find(b=>b.on && b.owner===owner)
  const otherBolt=f.g.enemies.debug.bolts.find(b=>b.on && b.owner===unrelated)
  const count=f.spawns.length
  assert.ok(f.patrols.snapshot().queued.length>0)
  assert.equal(f.patrols.finish(),true); assert.equal(f.patrols.finish(),false)
  assert.ok(actors.every(actor=>!f.g.enemies.list.includes(actor) && !actor.rig.group.visible))
  assert.equal(ownBolt.on,false); assert.equal(otherBolt.on,true)
  assert.equal(unrelated.alive,true); otherBolt.on=false
  assert.equal(f.patrols.snapshot().activeCount,0)
  f.advance(40)
  assert.equal(f.spawns.length,count)
  assert.equal(f.patrols.snapshot().queued.length,0)
  assert.equal(f.patrols.activate(),false)
  const saved=f.patrols.snapshot(); f.patrols.reset(saved); f.advance(2)
  assert.equal(f.patrols.snapshot().finished,true)
  assert.equal(f.spawns.length,count)
})

test('new runs and repeated deaths reuse native pools, bound history/list/wrecks and retire only owned identities/bolts', async () => {
  const f=await fixture(), ctx=f.g.enemies.debug.ctx
  const group=f.g.scene.children.find(item=>item.name==='enemies'), meshes=group.children.length
  const unrelated=f.g.enemies.spawn('gull',new T.Vector3(20,6,-300),{passive:true,hover:6})
  for (let run=0;run<8;run++) {
    f.patrols.reset(); assert.equal(f.patrols.snapshot().active,false)
    f.patrols.activate(); f.advance(6,false)
    assert.equal(f.patrols.snapshot().reservedByType.gull,3)
    const actor=f.actors().find(enemy=>enemy.type==='gull')
    ctx.fireBolt(actor.pos,new T.Vector3(0,0,1),actor)
    ctx.fireBolt(unrelated.pos,new T.Vector3(0,0,1),unrelated)
    const ownBolt=f.g.enemies.debug.bolts.find(b=>b.on && b.owner===actor)
    const otherBolt=f.g.enemies.debug.bolts.find(b=>b.on && b.owner===unrelated)
    f.patrols.reset()
    assert.equal(ownBolt.on,false); assert.equal(otherBolt.on,true)
    otherBolt.on=false
    assert.equal(unrelated.alive,true)
    assert.equal(group.children.length,meshes)
    assert.equal(f.g.enemies.list.length,1)
  }
  f.patrols.reset(); f.g.player.damage=()=>{}; f.patrols.activate()
  for (let cycle=0;cycle<16;cycle++) {
    f.advance(15)
    f.actors().forEach(f.kill)
    f.advance(7)
    assert.ok(f.g.enemies.list.length<=12)
    assert.ok(f.g.enemies.debug.wrecks.length<=f.g.enemies.TUNE.maxWrecks)
  }
  assert.ok(f.patrols.snapshot().counts.spawned>64)
  assert.equal(f.patrols.snapshot().history.length,64)
})

test('invalid checkpoints preserve current state; recycled pool objects cannot be retired as old patrols', async () => {
  const f=await fixture()
  f.patrols.activate(); f.advance(5,false)
  const before=f.patrols.snapshot()
  assert.throws(()=>f.patrols.reset({...before,queued:[{id:1,type:'gull',due:0}]}),/Invalid campaign patrol checkpoint/)
  assert.deepEqual(f.patrols.snapshot(),before)
  const gull=f.actors().find(enemy=>enemy.type==='gull')
  f.g.enemies.debug.ctx.retire(gull)
  const unrelated=f.g.enemies.spawn('gull',new T.Vector3(20,6,-310),{passive:true,hover:6})
  assert.equal(unrelated,gull)
  f.patrols.reset()
  assert.equal(unrelated.alive,true)
})

test('complete revised CH1 geometry admits distributed safe entries from power, warehouse and gate areas', async t => {
  const f=await fixture({world:true,chapter1:true})
  for (const [x,z] of [[-34,-317.5],[13,-318],[-56,-285]]) {
    f.patrols.reset(); f.g.player.pos.set(x,0,z); f.g.player.eye.set(x,1.68,z)
    f.g.player.damage=()=>{}
    f.patrols.activate(); f.advance(12)
    const state=f.patrols.snapshot()
    assert.ok(state.history.length>=3,`Too few safe sectors from ${x},${z}: ${JSON.stringify(state)}`)
    assert.ok(new Set(state.history.map(item=>item.site)).size>=3)
    assert.ok(state.history.every(item=>item.distance>=18 && (item.hidden || item.outsideFront)))
    t.diagnostic(JSON.stringify({player:[x,z],spawned:state.history.map(item=>({site:item.site,type:item.type,hidden:item.hidden,behind:item.behind})),queued:state.queuedByType}))
  }
  f.layer.dispose()
})
