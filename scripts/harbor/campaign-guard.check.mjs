import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { parse } from '@babel/parser'
import { installCampaignGuard } from './campaign-guard.mjs'
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
  const g = { THREE: T, scene: new T.Scene(), params: {}, game: { state: 'playing' },
    player: { alive: true, health: 100, pos: new T.Vector3(0,0,-328), eye: new T.Vector3(0,1.68,-328), vel: new T.Vector3(),
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
  g.enemies.clear = () => assert.fail('Encounter must never clear unrelated actors')
  const guard = installCampaignGuard(g, { emit: event => events.push(event) })
  function tick(dt = .05, ai = true) {
    guard.update(dt)
    if (ai && g.game.state === 'playing' && g.player.alive) g.enemies.update(dt)
  }
  function advance(seconds, ai = true) {
    for (let time = 0; time < seconds - 1e-8; time += .05) tick(Math.min(.05, seconds - time), ai)
  }
  const actors = () => guard.snapshot().actors.map(slot => g.enemies.list.find(enemy => enemy.id === slot.nativeId)).filter(Boolean)
  const kill = enemy => enemy.damage(enemy.hp, enemy.pos.clone(), null, 'body')
  function hostile(ai = false) { assert.equal(guard.request(), true); guard.scan(); guard.warn(); guard.release(); advance(3.2, ai); assert.equal(guard.snapshot().stage, 'hostile') }
  return { g, guard, events, messages, attacks, damage, effects, spawns, tick, advance, actors, kill, hostile, layer }
}

test('native passive actors stay safe before request; original M1 geometry admits all anchors and hound paths', async () => {
  const f = await fixture({ world: true })
  f.advance(30)
  assert.equal(f.spawns.length, 3)
  assert.equal(f.guard.snapshot().stage, 'dormant')
  assert.equal(f.attacks.length, 0)
  assert.equal(f.damage.length, 0)
  assert.equal(f.events.length, 0)
  assert.deepEqual(f.guard.snapshot().actors.map(a => a.type), ['hound','hound','gull'])
  for (const actor of f.actors()) {
    assert.equal(actor.passive, true)
    assert.equal(actor.rig.group.visible, true)
    if (actor.type === 'hound') assert.ok(f.g.physics.nav.findPath(actor.pos, f.g.player.pos)?.length)
  }
  f.layer.dispose()
})

test('manual dialogue holds indefinitely; scan turns native heads and sweeps a white beam, warning turns actual lenses red', async () => {
  const f = await fixture()
  f.tick(.05, false)
  assert.deepEqual(f.guard.snapshot().actors.map(actor => actor.position), CH1.ambush.map(actor => [...actor.position]))
  assert.equal(f.guard.release(), false)
  assert.equal(f.guard.warn(), false)
  assert.equal(f.guard.request(), true)
  assert.equal(f.guard.request(), false)
  f.advance(60)
  assert.equal(f.guard.snapshot().stage, 'requested')
  assert.deepEqual(f.events.map(e => e.type), ['guard-requested'])
  assert.equal(f.guard.scan(), true)
  const before = f.guard.snapshot().scan
  f.g.game.flow = { manualDialogue: true }
  for (let frame = 0; frame < 120; frame++) f.guard.present(.05)
  const scan = f.guard.snapshot().scan
  assert.ok(scan.light > 0)
  assert.equal(scan.color, 0xffffff)
  assert.notEqual(scan.sweep, before.sweep)
  assert.notDeepEqual(scan.target, before.target)
  assert.ok(f.actors().every(actor => actor.lens.color.r === actor.lens.color.g))
  assert.ok(Math.abs(f.actors()[0].rig.bones.head.rotation.y) > .1)
  assert.equal(f.guard.scan(), false)
  f.advance(60)
  assert.equal(f.guard.snapshot().stage, 'scanning')
  assert.equal(f.guard.warn(), true)
  assert.equal(f.guard.warn(), false)
  for (let frame = 0; frame < 1200; frame++) f.guard.present(.05)
  assert.equal(f.guard.snapshot().stage, 'warning')
  assert.equal(f.guard.snapshot().released, false)
  assert.equal(f.guard.snapshot().grace, 0)
  assert.ok(f.actors().every(actor => actor.lens.color.r > actor.lens.color.g * 10))
  assert.ok(f.actors().every(actor => actor.passive))
  assert.equal(f.attacks.length, 0); assert.equal(f.damage.length, 0)
  assert.deepEqual(f.events.map(e => e.type), ['guard-requested','guard-scanning','guard-warning'])
})

test('dismissal starts full visible warning grace; presentation and paused/dialogue ticks never consume it', async () => {
  const f = await fixture()
  f.guard.request(); f.guard.scan(); f.guard.warn()
  assert.equal(f.guard.release(), true)
  assert.equal(f.guard.release(), false)
  f.g.game.flow = { manualDialogue: true }
  for (let i = 0; i < 100; i++) { f.guard.update(1); f.guard.present(.05) }
  assert.equal(f.guard.snapshot().grace, 0)
  f.g.game.flow.manualDialogue = false
  for (const state of ['paused','intro','title','dead','boarding']) {
    f.g.game.state = state
    const before = f.guard.snapshot()
    f.advance(10); f.guard.present(10)
    assert.deepEqual(f.guard.snapshot(), before)
    assert.equal(f.guard.request(), false); assert.equal(f.guard.isolate(), false)
  }
  f.g.game.state = 'playing'; f.g.player.alive = false
  const before = f.guard.snapshot(); f.guard.update(100)
  assert.deepEqual(f.guard.snapshot(), before)
  f.g.player.alive = true
  for (const dt of [0,-1,NaN,Infinity]) f.guard.update(dt)
  assert.deepEqual(f.guard.snapshot(), before)
  f.guard.update(100)
  assert.equal(f.guard.snapshot().grace, .05, 'Late frame cannot skip visible grace')
  f.advance(3.1)
  assert.equal(f.guard.snapshot().stage, 'warning')
  assert.equal(f.attacks.length, 0); assert.equal(f.damage.length, 0)
  f.tick()
  assert.equal(f.guard.snapshot().stage, 'hostile')
  assert.ok(f.actors().every(actor => !actor.passive))
  assert.deepEqual(f.events.map(e => e.type), ['guard-requested','guard-scanning','guard-warning','guard-hostile'])
})

test('original sensing and AI produce telegraphs, real fire, muzzle feedback and ordinary native damage', async () => {
  const f = await fixture()
  f.hostile(true)
  const telegraphs = []
  f.g.events.on('enemy:telegraph', event => telegraphs.push(event))
  f.advance(25)
  assert.ok(telegraphs.length > 0)
  assert.ok(f.attacks.some(event => event.name === 'enemy:fire' && event.type === 'hound'))
  assert.ok(f.attacks.some(event => event.name === 'enemy:fire' && event.type === 'gull'))
  assert.ok(f.guard.snapshot().shots > 0)
  assert.ok(f.effects.includes('tracer') && f.effects.includes('muzzleFlash'))
  assert.ok(f.damage.some(hit => hit.amount === 5 || hit.amount === 7 || hit.amount === 15))
  assert.ok(f.damage.every(hit => hit.amount <= 15), 'No scripted instant kill')
  assert.equal(f.spawns.length, 3)
})

test('combat resolves only encounter actors and never replenishes defeated slots', async () => {
  const f = await fixture()
  const unrelated = f.g.enemies.spawn('hound', new T.Vector3(20,0,-310), { passive: true })
  f.hostile()
  for (const actor of f.actors().slice(0,2)) f.kill(actor)
  f.guard.update(.05)
  assert.equal(f.guard.snapshot().stage, 'hostile')
  f.kill(f.actors().find(actor => actor.alive)); f.guard.update(.05)
  assert.deepEqual(f.events.at(-1), { type: 'ambush-resolved', method: 'combat' })
  assert.equal(unrelated.alive, true)
  f.advance(120)
  assert.equal(f.spawns.length, 4)
  assert.equal(f.guard.request(), false)
  assert.equal(f.guard.isolate(), false)
  assert.equal(f.events.filter(e => e.type === 'ambush-resolved').length, 1)
})

test('isolation shuts down native encounter actors visibly, releases tokens and clears only their bolts', async () => {
  const f = await fixture()
  f.hostile()
  const unrelated = f.g.enemies.spawn('gull', new T.Vector3(20,6,-310), { passive: true, hover: 6 })
  const actors = f.actors(), ctx = f.g.enemies.debug.ctx, gull = actors.find(actor => actor.type === 'gull')
  ctx.fireBolt(gull.pos, new T.Vector3(0,0,1), gull)
  ctx.fireBolt(unrelated.pos, new T.Vector3(0,0,1), unrelated)
  const ownBolt = f.g.enemies.debug.bolts.find(b => b.on && b.owner === gull)
  const otherBolt = f.g.enemies.debug.bolts.find(b => b.on && b.owner === unrelated)
  const body = actors[0].rig.bones.body, before = body.position.clone()
  assert.equal(f.guard.isolate(), true)
  assert.equal(f.guard.isolate(), false)
  assert.equal(ownBolt.on, false)
  assert.equal(otherBolt.on, true)
  assert.equal(unrelated.alive, true)
  assert.ok(actors.every(actor => !actor.alive && actor.rig.group.visible))
  assert.deepEqual(f.events.at(-1), { type: 'ambush-resolved', method: 'isolation' })
  f.advance(.5)
  assert.ok(body.position.distanceTo(before) > .05, 'Native hound collapse progresses after shutdown')
  assert.ok(gull.dieT > 0 && gull.spin !== 0, 'Native gull rotor shutdown/fall progresses')
  assert.ok(f.effects.includes('sparks') && f.effects.includes('smoke'))
  assert.equal(ctx.tokens, 0)
})

test('an already defeated encounter resolves as combat even when isolation is requested before the next tick', async () => {
  const f = await fixture(); f.hostile()
  f.actors().forEach(f.kill)
  assert.equal(f.guard.isolate(), false)
  assert.deepEqual(f.events.at(-1), { type: 'ambush-resolved', method: 'combat' })
})

test('checkpoint reset clears only owned projectiles; isolation before the next update still neutralizes restored actors', async () => {
  const f = await fixture(); f.hostile()
  const gull = f.actors().find(actor => actor.type === 'gull'), ctx = f.g.enemies.debug.ctx
  const unrelated = f.g.enemies.spawn('gull', new T.Vector3(20,6,-310), { passive: true, hover: 6 })
  ctx.fireBolt(gull.pos, new T.Vector3(0,0,1), gull)
  ctx.fireBolt(unrelated.pos, new T.Vector3(0,0,1), unrelated)
  const ownBolt = f.g.enemies.debug.bolts.find(b => b.on && b.owner === gull)
  const otherBolt = f.g.enemies.debug.bolts.find(b => b.on && b.owner === unrelated)
  f.guard.reset(f.guard.snapshot())
  assert.equal(ownBolt.on, false)
  assert.equal(otherBolt.on, true)
  assert.equal(f.guard.isolate(), true)
  assert.ok(f.guard.snapshot().actors.every(actor => actor.defeated))
  f.tick()
  assert.equal(f.g.enemies.list.filter(enemy => enemy.alive).length, 1)
  assert.equal(unrelated.alive, true)
})

for (const stage of ['dormant','requested','scanning','warning','hostile','resolved']) {
  test(`checkpoint restores ${stage}, time, HP and defeated slots without replaying story events`, async () => {
    const f = await fixture()
    f.tick(.05, false)
    if (stage !== 'dormant') f.guard.request()
    if (['scanning','warning','hostile','resolved'].includes(stage)) f.guard.scan()
    if (['warning','hostile','resolved'].includes(stage)) f.guard.warn()
    if (['hostile','resolved'].includes(stage)) { f.guard.release(); f.advance(3.2, false) }
    if (stage === 'resolved') f.guard.isolate()
    else {
      const [dead, wounded] = f.actors()
      f.kill(dead); wounded.damage(31, wounded.pos.clone(), null, 'body')
      f.guard.update(.35)
    }
    const saved = JSON.parse(JSON.stringify(f.guard.snapshot())), eventCount = f.events.length
    const unrelated = f.g.enemies.spawn('hound', new T.Vector3(20,0,-310), { passive: true })
    f.g.game.state = 'dead'; f.g.player.alive = false
    f.guard.reset(saved)
    f.advance(20)
    assert.equal(f.guard.snapshot().stage, stage)
    assert.equal(f.guard.snapshot().stageElapsed, saved.stageElapsed)
    assert.equal(f.guard.snapshot().released, saved.released)
    assert.equal(f.guard.snapshot().grace, saved.grace)
    assert.equal(f.events.length, eventCount)
    f.g.game.state = 'playing'; f.g.player.alive = true; f.guard.update(.01)
    const restored = f.guard.snapshot()
    assert.equal(restored.stage, stage)
    assert.deepEqual(restored.actors.map(a => [a.id,a.type,a.position,a.hp,a.defeated]),
      saved.actors.map(a => [a.id,a.type,a.position,a.hp,a.defeated]))
    assert.ok(f.actors().every(actor => actor.passive === (stage !== 'hostile')))
    assert.equal(f.events.length, eventCount)
    assert.equal(unrelated.alive, true)
    const count = f.spawns.length
    f.advance(20, false)
    assert.equal(f.spawns.length, count, 'No defeated slot or resolved encounter respawns')
  })
}

test('new-run/reset cycles retire only owned actors and reuse fixed native render pools', async () => {
  const f = await fixture(), group = f.g.scene.children.find(object => object.name === 'enemies')
  const count = group.children.length
  const unrelated = f.g.enemies.spawn('hound', new T.Vector3(20,0,-310), { passive: true })
  for (let run = 0; run < 12; run++) {
    f.guard.reset(); f.tick(.05, false)
    assert.equal(f.guard.snapshot().stage, 'dormant')
    assert.equal(f.actors().length, 3)
    assert.equal(f.g.enemies.list.filter(enemy => enemy.alive).length, 4)
    f.hostile(); f.guard.isolate(); f.advance(7)
    assert.equal(unrelated.alive, true)
    assert.equal(group.children.length, count)
    assert.ok(f.g.enemies.debug.wrecks.length <= 2)
  }
  assert.equal(f.spawns.length, 37)
  assert.equal(installCampaignGuard(f.g, { emit() { assert.fail('Duplicate installation') } }), f.guard)
})

test('snapshots and checkpoint input are detached; invalid checkpoints do not destroy the current encounter', async () => {
  const f = await fixture(); f.hostile()
  const before = f.guard.snapshot(), saved = JSON.parse(JSON.stringify(before))
  f.guard.reset(saved)
  saved.actors[0].position[0] = 999; saved.actors[0].hp = 999
  assert.deepEqual(f.guard.snapshot().actors.map(a => a.position), before.actors.map(a => a.position))
  const snapshot = f.guard.snapshot()
  snapshot.actors[0].position[0] = 999; snapshot.stage = 'resolved'
  assert.equal(f.guard.snapshot().stage, 'hostile')
  const frozen = f.guard.snapshot()
  assert.throws(() => f.guard.reset({ ...frozen, actors: [] }), /Invalid campaign guard checkpoint/)
  assert.deepEqual(f.guard.snapshot(), frozen)
})

test('a recycled native pool object cannot be killed, retired or counted as a surviving encounter actor', async () => {
  const f = await fixture(); f.hostile()
  const gull = f.actors().find(actor => actor.type === 'gull')
  f.g.enemies.debug.ctx.retire(gull)
  const unrelated = f.g.enemies.spawn('gull', new T.Vector3(20,6,-310), { passive: true, hover: 6 })
  assert.equal(unrelated, gull, 'Exercise actual fixed pool reuse')
  f.guard.isolate()
  assert.equal(unrelated.alive, true)
  f.guard.reset()
  assert.equal(unrelated.alive, true)
  assert.ok(f.g.enemies.list.includes(unrelated))
})


test('revised CH1 geometry admits the shared ambush anchors and native hound routes', async () => {
  const f = await fixture({ world:true, chapter1:true })
  f.advance(1)
  assert.equal(f.spawns.length,3)
  for (const actor of f.actors()) if (actor.type === 'hound') {
    assert.ok(f.g.physics.nav.findPath(actor.pos,new T.Vector3(...CH1.request))?.length)
  }
  f.layer.dispose()
})

test('scan materials are native per-actor clones; reset restores lenses and leaves shared materials unchanged', async () => {
  const f = await fixture(), shared = f.g.enemies.debug.mats
  const before = { lens:shared.lensBase.color.clone(), glow:shared.glow.color.clone(), cone:shared.cone.uniforms.uColor.value.clone() }
  f.tick(.05,false)
  const actors = f.actors(), originals = actors.map(actor => ({ lens:actor.lens, color:actor.lens.color.clone(), lensC:[...actor.lensC] }))
  f.guard.request(); f.guard.scan(); f.guard.present(.05); f.guard.warn()
  assert.equal(new Set(actors.map(actor => actor.lens)).size,3)
  assert.ok(actors.every(actor => actor.lens !== shared.lensBase))
  f.guard.reset()
  actors.forEach((actor,index) => {
    assert.equal(actor.lens,originals[index].lens)
    assert.ok(actor.lens.color.equals(originals[index].color))
    assert.deepEqual([...actor.lensC],originals[index].lensC)
  })
  assert.ok(shared.lensBase.color.equals(before.lens)); assert.ok(shared.glow.color.equals(before.glow))
  assert.ok(shared.cone.uniforms.uColor.value.equals(before.cone))
  assert.equal(f.g.scene.children.filter(object => object.name === 'campaign-guard-scan').length,1)
})

test('released warning checkpoint restores remaining grace without replaying events', async () => {
  const f = await fixture()
  f.guard.request(); f.guard.scan(); f.guard.warn(); f.guard.release(); f.advance(1.2,false)
  const saved = f.guard.snapshot(), count = f.events.length
  f.guard.reset(saved); f.advance(1.95,false)
  assert.equal(f.guard.snapshot().stage,'warning')
  assert.equal(f.events.length,count)
  f.tick(.05,false)
  assert.equal(f.guard.snapshot().stage,'hostile')
  assert.equal(f.events.length,count+1)
})

test('presentation alone holds native simulation, and scan checkpoints preserve phase without replay', async () => {
  const f=await fixture()
  f.guard.request(); f.guard.scan()
  const time=f.g.enemies.debug.ctx.t, positions=f.actors().map(actor=>actor.pos.toArray())
  for (let i=0;i<240;i++) f.guard.present(.05)
  assert.equal(f.g.enemies.debug.ctx.t,time)
  assert.deepEqual(f.actors().map(actor=>actor.pos.toArray()),positions)
  const lead=f.actors()[0], desired=Math.atan2(f.g.player.eye.x-lead.pos.x,f.g.player.eye.z-lead.pos.z)
  assert.ok(Math.abs(Math.sin(lead.yaw-desired))<.05,'Native body turns enough for the head sensor to face player')
  assert.equal(f.attacks.length,0)
  const saved=f.guard.snapshot(), count=f.events.length
  f.guard.reset(saved)
  assert.deepEqual(f.guard.snapshot().scan,saved.scan)
  assert.equal(f.events.length,count)
  assert.equal(f.guard.snapshot().shots,saved.shots)
})
