import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { parse } from '@babel/parser'
import { installReinforcements } from './reinforcements.mjs'
import { createInfrastructure } from './infrastructure-state.mjs'

// Use the immutable source's actual Three, nav and fixed enemy pools. No DOM,
// renderer, server, original file edits or second animation loop is involved.
const bytes = fs.readFileSync(new URL('../../几猫国产3A大作_V1-fable5.2.html', import.meta.url))
assert.equal(createHash('sha256').update(bytes).digest('hex'), '9e55b5200b088adaf8e1152da04efc0d3b25e236e6baf2dee96f81e23e084966')
const html = bytes.toString(), source = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const body = parse(source).program.body[0].expression.callee.body.body
const boundary = body.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === 'gM'))
assert.ok(boundary)
const prefix = body.filter(node => node.end <= boundary.start).map(node => source.slice(node.start, node.end)).join('\n')
const api = vm.runInNewContext(`(()=>{${prefix};return {THREE:lt,physics:d3,enemies:Em}})()`, { console, performance, AbortController, window: {} }, { timeout: 15000 })
const T = api.THREE

function fixture({ armed = false, initial = 3, types, seed = 4207, retries = 0 } = {}) {
  const handlers = new Map(), calls = [], original = Array.from({ length: types?.length ?? initial }, (_, index) => ({ alive: true, active: true, type: types?.[index] ?? (index === 0 ? 'hound' : 'gull'), pos: new T.Vector3(3 * index, 8, 15) }))
  const g = {
    THREE: T, params: { seed }, game: { state: 'playing', run: { time: 0, retries, queue: [] } },
    rng() { assert.fail('Director consumed the original RNG') },
    player: { alive: true, pos: new T.Vector3(), eye: new T.Vector3(0, 1.68, 0), forward: new T.Vector3(1, 0, 0) },
    weapon: { hasFirearm: armed },
    level: { enemySpawns: ['ground', 'air'].flatMap(type => [-24, -20, 20, 24].flatMap(x => [-20, 0, 20].map(z => ({ type, pos: new T.Vector3(x, type === 'air' ? 7 : 0, z) })))), interiorBoxes: [] },
    physics: { bounds: { min: new T.Vector3(-40, 0, -30), max: new T.Vector3(40, 30, 30) }, boxes: [], groundHeight: () => 0, lineOfSight: () => false,
      nav: { isWalkable: () => true, findPath: (from, to) => [to.clone()], randomPoint() { assert.fail('Director used global navigation randomness') } } },
    enemies: { list: original,
      spawn(type, pos, options) { const enemy = { type, pos: pos.clone(), alive: true, active: true }; this.list.push(enemy); calls.push({ type, pos: pos.clone(), options }); return enemy },
      clear() { assert.fail('Director cleared native actors') }, alert() { assert.fail('Director changed existing AI') },
    },
    events: { on(name, handler) { const list = handlers.get(name) || []; list.push(handler); handlers.set(name, list); return () => list.splice(list.indexOf(handler), 1) },
      emit(name, data) { for (const handler of handlers.get(name) || []) handler(data) } },
  }
  const model = createInfrastructure()
  const systems = { state: model.state, boarding: 0, snapshot() { assert.fail('Per-frame lighting snapshot is unnecessary with the boarding getter') } }
  const equipment = { snapshot() { return { hasFirearm: g.weapon.hasFirearm } } }
  const director = installReinforcements(g, { equipment, systems })
  function tick(dt = .05) { if (g.game.state === 'playing') g.game.run.time += dt; director.update(dt) }
  function advance(seconds) { for (let time = 0; time < seconds - 1e-8; time += .05) tick(Math.min(.05, seconds - time)) }
  function state(state) { const prev = g.game.state; g.game.state = state; g.events.emit('game:state', { state, prev }) }
  function killAll() { for (const enemy of g.enemies.list) { enemy.alive = false; enemy.active = false } }
  return { g, director, systems, model, equipment, handlers, calls, tick, advance, state, killAll }
}

test('three original patrols stay unchanged until armed, then fill exactly two hounds and three gulls', () => {
  const f = fixture(), original = [...f.g.enemies.list]
  f.advance(90)
  assert.equal(f.calls.length, 0)
  assert.equal(f.director.snapshot().armed, false)
  f.g.weapon.hasFirearm = true; f.tick()
  const armed = f.director.snapshot()
  assert.equal(armed.target, 5)
  assert.ok(armed.nextWaveAt - armed.runElapsed >= 25 && armed.nextWaveAt - armed.runElapsed <= 45)
  f.advance(1.9); assert.equal(f.calls.length, 0)
  f.advance(10)
  const snapshot = f.director.snapshot()
  assert.equal(snapshot.active, armed.target)
  assert.deepEqual(snapshot.normalQuota, { hound: 2, gull: 3 })
  assert.deepEqual(snapshot.activeByType, snapshot.normalQuota)
  assert.equal(snapshot.counts.population, armed.target - 3)
  assert.ok(snapshot.history.every(item => item.reason === 'population'))
  for (let i = 1; i < snapshot.history.length; i++) assert.ok(snapshot.history[i].runElapsed - snapshot.history[i - 1].runElapsed >= 2 && snapshot.history[i].runElapsed - snapshot.history[i - 1].runElapsed <= 4.05)
  assert.deepEqual(f.g.enemies.list.slice(0, 3), original)
  assert.ok(f.calls.every(call => call.options.state === 'patrol'))
})

test('recurring one/two waves survive repeated complete wipes at 25–45 second cadence', () => {
  const f = fixture({ armed: true }); f.advance(15)
  let deadline = f.director.snapshot().nextWaveAt, seen = 0
  for (let wave = 0; wave < 8; wave++) {
    f.killAll()
    const before = f.calls.length
    f.advance(deadline - f.director.snapshot().runElapsed - .05)
    assert.equal(f.calls.length, before, 'No early refresh')
    f.advance(.1)
    const next = f.director.snapshot().nextWaveAt
    assert.ok(next - f.director.snapshot().runElapsed >= 24.9 && next - f.director.snapshot().runElapsed <= 45)
    f.advance(5)
    const spawned = f.calls.length - before
    assert.ok(spawned === 1 || spawned === 2)
    const snapshot = f.director.snapshot()
    assert.ok(snapshot.active <= 5)
    assert.ok(snapshot.activeByType.hound <= 2 && snapshot.activeByType.gull <= 3)
    seen += spawned; deadline = next
  }
  assert.equal(f.director.snapshot().counts.ambient, seen)
})

test('a knife-only run also receives population and later reinforcements', () => {
  const f = fixture()
  f.g.weapon.hasWeapon = true
  f.advance(15)
  assert.equal(f.g.weapon.hasFirearm, false)
  assert.equal(f.director.snapshot().active, 5)
  f.killAll(); f.advance(50)
  assert.ok(f.director.snapshot().counts.ambient > 0)
})

test('each facility alone records its first start and never raises normal patrol quotas', () => {
  for (const [kind, start, done] of [['power', 'UNSTABLE', 'ON'], ['gate', 'OPERATING', 'OPEN'], ['fuel', 'PUMPING', 'READY']]) {
    const f = fixture({ armed: true }); f.advance(15)
    f.systems.state[kind] = start; f.tick()
    const startedAt = f.director.snapshot().runElapsed
    assert.equal(f.director.snapshot().facilities[kind], startedAt)
    f.advance(5); f.systems.state[kind] = done; f.advance(90)
    const snapshot = f.director.snapshot()
    assert.equal(snapshot.facilities[kind], startedAt)
    assert.equal(snapshot.burst.triggered, false)
    assert.equal(snapshot.counts.burst, 0)
    assert.deepEqual(snapshot.activeByType, { hound: 2, gull: 3 })
    assert.equal(snapshot.queued.length, 0)
  }
})

test('two different starts within sixty seconds trigger exactly one extra hound and two gulls', () => {
  const f = fixture({ armed: true }); f.advance(15)
  f.systems.state.power = 'UNSTABLE'; f.tick()
  f.advance(5); f.systems.state.gate = 'OPERATING'; f.tick()
  const pending = f.director.snapshot()
  assert.equal(pending.burst.triggered, true)
  assert.equal(pending.burst.triggeredAt, pending.runElapsed)
  assert.deepEqual(pending.burst.facilities, ['power', 'gate'])
  assert.deepEqual(pending.queued.map(item => item.reason), ['burst', 'burst', 'burst'])
  f.advance(14)
  const snapshot = f.director.snapshot(), wave = snapshot.history.filter(item => item.reason === 'burst')
  assert.equal(snapshot.active, 8)
  assert.equal(snapshot.target, 5)
  assert.deepEqual(snapshot.activeByType, { hound: 3, gull: 5 })
  assert.deepEqual(snapshot.burst.counts, { hound: 1, gull: 2 })
  assert.equal(snapshot.counts.burst, 3)
  assert.equal(wave.length, 3)
  for (let i = 1; i < wave.length; i++) assert.ok(wave[i].runElapsed - wave[i - 1].runElapsed >= 2 && wave[i].runElapsed - wave[i - 1].runElapsed <= 4.05)
  assert.ok(wave.every(item => item.active <= 8 && item.queued <= 6))
  f.systems.state.power = 'ON'; f.systems.state.gate = 'OPEN'; f.systems.state.fuel = 'PUMPING'; f.advance(100)
  assert.equal(f.director.snapshot().counts.burst, 3)
  assert.equal(f.director.snapshot().active, 8, 'Existing burst actors must not be deleted')
  f.killAll(); f.advance(200)
  const refilled = f.director.snapshot()
  assert.equal(refilled.counts.burst, 3)
  assert.equal(refilled.active, 5)
  assert.deepEqual(refilled.activeByType, { hound: 2, gull: 3 })
  assert.ok(refilled.history.every(item => item.active <= 5 || item.reason === 'burst'))
})

test('sixty seconds is inclusive, with power timed from UNSTABLE rather than completion', () => {
  for (const gap of [59.999, 60, 60.001]) {
    const f = fixture()
    f.systems.state.power = 'UNSTABLE'; f.tick(.125)
    f.systems.state.power = 'ON'; f.tick(1.5)
    f.systems.state.fuel = 'PUMPING'; f.tick(gap - 1.5)
    const snapshot = f.director.snapshot()
    assert.equal(snapshot.burst.triggered, gap <= 60, `Gap ${gap}`)
    assert.equal(snapshot.facilities.power, .125)
  }
})

test('an expired first pair can still trigger on the second and third facilities', () => {
  const f = fixture()
  f.systems.state.power = 'UNSTABLE'; f.tick(1)
  f.tick(61); f.systems.state.gate = 'OPERATING'; f.tick(1)
  assert.equal(f.director.snapshot().burst.triggered, false)
  f.tick(58); f.systems.state.fuel = 'PUMPING'; f.tick(1)
  const snapshot = f.director.snapshot()
  assert.equal(snapshot.burst.triggered, true)
  assert.deepEqual(snapshot.burst.facilities, ['gate', 'fuel'])
  assert.deepEqual(snapshot.facilities, { power: 1, gate: 63, fuel: 122 })
})

test('same-facility transitions, failed requests and incomplete holds never count as two starts', () => {
  const f = fixture()
  assert.equal(f.model.request('gate'), false); assert.equal(f.model.request('fuel'), false)
  f.advance(10)
  assert.deepEqual(f.director.snapshot().facilities, { power: null, gate: null, fuel: null })
  assert.equal(f.model.request('power'), true); f.tick()
  const first = f.director.snapshot().facilities.power
  assert.equal(f.model.request('fuel'), false)
  f.model.tick(1.5); f.advance(10)
  assert.equal(f.model.request('power'), false)
  f.advance(20)
  assert.equal(f.director.snapshot().facilities.power, first)
  assert.equal(f.director.snapshot().burst.triggered, false)
  assert.equal(f.model.request('fuel'), true); f.tick()
  assert.equal(f.systems.state.fuel, 'PUMPING')
  assert.equal(f.director.snapshot().burst.triggered, true, 'Completion is not required')
  f.systems.state.power = 'OFF'; f.systems.state.fuel = 'UNAVAILABLE'; f.tick()
  f.model.request('power'); f.model.tick(1.5); f.model.request('fuel'); f.tick()
  assert.equal(f.director.snapshot().facilities.power, first)
  assert.equal(f.director.snapshot().queued.filter(item => item.reason === 'burst').length, 3)
})

test('native queued and active enemies share the cap without growing a backlog or catch-up burst', () => {
  const f = fixture({ armed: true, initial: 8 })
  f.systems.state.power = 'ON'; f.systems.state.fuel = 'PUMPING'; f.advance(200)
  assert.equal(f.calls.length, 0); assert.equal(f.director.snapshot().queued.length, 3)
  f.killAll(); f.g.game.run.queue = Array(8).fill({ type: 'hound' }); f.advance(10)
  assert.equal(f.calls.length, 0)
  f.g.game.run.queue.length = 0; f.tick(10)
  assert.equal(f.calls.length, 1, 'One slow tick must never drain the queue')
  f.advance(20)
  assert.ok(f.director.snapshot().active <= 8)
  assert.ok(f.director.snapshot().queued.length <= 6)
})

test('ordinary queue reserves missing types across blocked spawns and changing native queues and actors', () => {
  const f = fixture({ armed: true, initial: 0 })
  f.g.physics.nav.isWalkable = () => false
  f.tick()
  assert.deepEqual(f.director.snapshot().queuedByType, { hound: 2, gull: 3 })
  f.advance(200)
  assert.deepEqual(f.director.snapshot().queuedByType, { hound: 2, gull: 3 }, 'Cadences must not duplicate queued work')
  f.g.game.run.queue = [{ type: 'hound' }, { type: 'gull' }]; f.tick()
  assert.deepEqual(f.director.snapshot().nativeQueuedByType, { hound: 1, gull: 1 })
  assert.deepEqual(f.director.snapshot().queuedByType, { hound: 1, gull: 2 })
  for (const item of f.g.game.run.queue) f.g.enemies.spawn(item.type, new T.Vector3(0, 0, 10), {})
  f.g.game.run.queue.length = 0; f.tick()
  assert.deepEqual(f.director.snapshot().queuedByType, { hound: 1, gull: 2 }, 'Native queue to alive transition keeps the same reservation')
  f.g.enemies.spawn('hound', new T.Vector3(0, 0, 20), {}); f.tick()
  assert.deepEqual(f.director.snapshot().queuedByType, { hound: 0, gull: 2 }, 'New native actors invalidate stale ordinary types')
  f.g.enemies.list[0].alive = false; f.advance(50)
  const pending = f.director.snapshot()
  assert.deepEqual(pending.queuedByType, { hound: 1, gull: 2 }, 'Ambient work fills newly missing types')
  f.g.physics.nav.isWalkable = () => true; f.advance(15)
  const snapshot = f.director.snapshot()
  assert.deepEqual(snapshot.activeByType, { hound: 2, gull: 3 })
  assert.equal(snapshot.active, 5); assert.equal(snapshot.queued.length, 0)
  assert.equal(snapshot.counts.spawned, 3)
})

test('native reservations without a known type retain the total cap, and existing excess actors are untouched', () => {
  const f = fixture({ armed: true, initial: 0 })
  f.g.game.run.queue = Array(5).fill({}); f.advance(50)
  assert.equal(f.calls.length, 0); assert.equal(f.director.snapshot().queued.length, 0)
  f.g.game.run.queue.length = 0; f.advance(200)
  assert.deepEqual(f.director.snapshot().activeByType, { hound: 2, gull: 3 })
  const excess = fixture({ armed: true, types: ['hound', 'hound', 'hound', 'gull', 'gull', 'gull'] })
  const original = [...excess.g.enemies.list]; excess.advance(200)
  assert.equal(excess.calls.length, 0)
  assert.deepEqual(excess.g.enemies.list, original)
  assert.equal(excess.director.snapshot().active, 6)
})

test('pending burst reservations consume ordinary type quotas while waiting behind the native cap', () => {
  const f = fixture({ armed: true, initial: 0 })
  f.tick(); assert.equal(f.director.snapshot().queued.length, 5)
  f.g.game.run.queue = Array(8).fill({ type: 'gull' })
  f.systems.state.power = 'ON'; f.systems.state.gate = 'OPEN'; f.advance(200)
  const snapshot = f.director.snapshot()
  assert.equal(f.calls.length, 0)
  assert.deepEqual(snapshot.queuedByType, { hound: 1, gull: 2 })
  assert.ok(snapshot.queued.every(item => item.reason === 'burst'))
  assert.deepEqual(snapshot.burst.counts, { hound: 0, gull: 0 })
  f.g.game.run.queue.length = 0; f.advance(200)
  assert.equal(f.director.snapshot().counts.burst, 3)
  assert.deepEqual(f.director.snapshot().activeByType, { hound: 2, gull: 3 })
})

test('burst has queue priority and unarmed starts wait for equipment without spawning', () => {
  const f = fixture({ armed: true }); f.tick()
  f.systems.state.power = 'UNSTABLE'; f.systems.state.fuel = 'PUMPING'; f.advance(3)
  assert.equal(f.director.snapshot().history[0].reason, 'burst')
  const unarmed = fixture(); unarmed.systems.state.power = 'ON'; unarmed.systems.state.fuel = 'PUMPING'
  unarmed.advance(90)
  assert.equal(unarmed.calls.length, 0); assert.equal(unarmed.director.snapshot().queued.length, 3)
  assert.equal(unarmed.director.snapshot().burst.triggered, true)
  unarmed.g.weapon.hasFirearm = true; unarmed.advance(12)
  assert.equal(unarmed.director.snapshot().counts.burst, 3)
  assert.ok(unarmed.director.snapshot().active <= 8)
})

test('pause, intro replay, boarding, departure and completion freeze all clocks and pending waves', () => {
  const f = fixture({ armed: true }); f.advance(3)
  const frozen = f.director.snapshot(), runTime = f.g.game.run.time
  f.state('paused'); f.advance(100); assert.deepEqual(f.director.snapshot(), frozen)
  f.state('playing'); assert.equal(f.g.game.run.time, runTime)
  for (const condition of ['boarding', 'DEPARTING', 'EXTRACTED', 'complete']) {
    if (condition === 'boarding') f.systems.boarding = .2
    else if (condition === 'complete') f.state('complete')
    else f.systems.state.boat = condition
    const before = f.director.snapshot(); f.advance(100)
    assert.deepEqual(f.director.snapshot(), before, condition)
  }
  f.state('paused'); f.state('intro')
  const before = f.director.snapshot(); f.advance(20); assert.deepEqual(f.director.snapshot(), before)
})

test('the facility window excludes paused, boarding, departing and extracted time', () => {
  const f = fixture()
  f.systems.state.power = 'UNSTABLE'; f.tick(1)
  f.tick(30)
  f.state('paused'); f.advance(100); f.state('playing')
  f.systems.boarding = .2; f.advance(100); f.systems.boarding = 0
  for (const boat of ['DEPARTING', 'EXTRACTED']) { f.systems.state.boat = boat; f.advance(100) }
  f.systems.state.boat = 'BLOCKED'
  f.systems.state.gate = 'OPERATING'; f.tick(30)
  const snapshot = f.director.snapshot()
  assert.equal(snapshot.runElapsed, 61)
  assert.deepEqual(snapshot.facilities, { power: 1, gate: 61, fuel: null })
  assert.equal(snapshot.burst.triggered, true)
  assert.equal(f.calls.length, 0)
})

test('death, title, new-run intro and quick restart reset history, wave flags and cadence', () => {
  for (const reset of ['dead', 'title', 'intro', 'clock']) {
    const f = fixture({ armed: true }); f.systems.state.power = 'ON'; f.systems.state.fuel = 'PUMPING'; f.advance(14)
    assert.ok(f.director.snapshot().counts.spawned > 0)
    assert.equal(f.director.snapshot().burst.triggered, true)
    if (reset === 'clock') { f.g.game.run.time = 0; f.g.weapon.hasFirearm = false; f.model.reset(); f.tick() }
    else f.state(reset)
    const snapshot = f.director.snapshot()
    assert.equal(snapshot.armed, false); assert.equal(snapshot.history.length, 0); assert.equal(snapshot.queued.length, 0)
    assert.deepEqual(snapshot.facilities, { power: null, gate: null, fuel: null })
    assert.deepEqual(snapshot.burst, { triggered: false, triggeredAt: null, facilities: [], counts: { hound: 0, gull: 0 } })
    assert.deepEqual(snapshot.queuedByType, { hound: 0, gull: 0 })
    assert.equal(snapshot.nextWaveAt, null); assert.equal(snapshot.counts.spawned, 0)
  }
  const f = fixture({ armed: true }); f.advance(5); f.g.player.alive = false; f.tick()
  assert.equal(f.director.snapshot().runElapsed, 0)
  const unarmed = fixture(); unarmed.systems.state.power = 'ON'; unarmed.systems.state.gate = 'OPEN'; unarmed.tick()
  assert.equal(unarmed.director.snapshot().queued.length, 3)
  unarmed.director.reset()
  assert.equal(unarmed.director.snapshot().queued.length, 0)
  assert.equal(unarmed.director.snapshot().burst.triggered, false)
  unarmed.model.reset(); unarmed.g.weapon.hasFirearm = true; unarmed.advance(15)
  assert.deepEqual(unarmed.director.snapshot().activeByType, { hound: 2, gull: 3 })
  unarmed.systems.state.power = 'ON'; unarmed.systems.state.fuel = 'PUMPING'; unarmed.advance(14)
  assert.equal(unarmed.director.snapshot().counts.burst, 3, 'New run can trigger its own burst')
})

test('spawn attempts reject near, visible, non-nav, indoor, obstructed, roof and water points', () => {
  for (const blocked of ['near', 'visible', 'nav', 'indoor', 'box', 'roof', 'water', 'partial-cover']) {
    const f = fixture({ armed: true, initial: 0 }), physics = f.g.physics
    if (blocked === 'near') physics.nav.isWalkable = (x, z) => Math.hypot(x, z) < 12
    if (blocked === 'visible') { physics.lineOfSight = () => true; physics.nav.isWalkable = x => x > 18 }
    if (blocked === 'partial-cover') { physics.lineOfSight = (eye, point) => point.y > 1; physics.nav.isWalkable = x => x > 18 }
    if (blocked === 'nav') physics.nav.isWalkable = () => false
    if (blocked === 'indoor') f.g.level.interiorBoxes = [{ min: new T.Vector3(-50, 0, -50), max: new T.Vector3(50, 10, 50) }]
    if (blocked === 'box') physics.boxes.push({ min: new T.Vector3(-50, -2, -50), max: new T.Vector3(50, 20, 50) })
    if (blocked === 'roof') physics.groundHeight = () => 4
    if (blocked === 'water') physics.groundHeight = () => -1.6
    f.advance(30)
    assert.equal(f.calls.length, 0, blocked)
    assert.ok(f.director.snapshot().counts.deferred > 0, blocked)
    assert.ok(f.director.snapshot().queued.length <= 6)
  }
})

test('clear behind-camera points are allowed; covered points are preferred and actual camera controls visibility', () => {
  const f = fixture({ armed: true, initial: 0 })
  f.g.physics.lineOfSight = () => true
  f.g.camera = { getWorldDirection: result => result.set(-1, 0, 0) }
  f.advance(20)
  assert.ok(f.calls.length >= 5)
  assert.ok(f.calls.every(call => call.pos.x > 0 && call.pos.length() >= 18))
  const covered = fixture({ armed: true, initial: 0 })
  covered.g.physics.lineOfSight = (eye, point) => point.x < 0
  covered.advance(20)
  assert.ok(covered.calls.every(call => call.pos.x > 0), 'Occlusion beats unobstructed rear points')
})

test('walkable but disconnected hound spawns wait until the native path becomes reachable', () => {
  const f = fixture({ armed: true, initial: 0 }), findPath = f.g.physics.nav.findPath
  f.g.physics.nav.findPath = () => null
  f.tick()
  assert.ok(f.director.snapshot().queued.some(item => item.type === 'hound'))
  f.advance(20)
  assert.ok(f.calls.every(call => call.type !== 'hound'))
  assert.equal(f.director.snapshot().queued[0].type, 'hound')
  assert.ok(f.director.snapshot().counts.deferred > 0)
  f.g.physics.nav.findPath = findPath; f.advance(20)
  assert.ok(f.calls.some(call => call.type === 'hound'))
})

test('unsafe or exhausted pool delays preserve the queue and retry without actors or bursts', () => {
  const f = fixture({ armed: true, initial: 0 }); f.g.physics.nav.isWalkable = () => false
  f.advance(12); assert.equal(f.calls.length, 0)
  const pending = f.director.snapshot().queued.length
  f.g.physics.nav.isWalkable = () => true
  const spawn = f.g.enemies.spawn; let attempts = 0
  f.g.enemies.spawn = () => { attempts++; return null }
  f.advance(6)
  assert.ok(attempts >= 2 && attempts <= 3); assert.equal(f.director.snapshot().queued.length, pending)
  f.g.enemies.spawn = spawn
  f.advance(f.director.snapshot().nextSpawnAt - f.director.snapshot().runElapsed - .05)
  assert.equal(f.calls.length, 0)
  f.advance(.1); assert.equal(f.calls.length, 1)
})

test('seed and retry are reproducible without global random consumption; snapshot is detached and bounded', () => {
  function run(seed, retries) {
    const f = fixture({ armed: true, initial: 0, seed, retries })
    for (let round = 0; round < 80; round++) { f.killAll(); f.advance(45) }
    return f
  }
  const previous = Math.random
  Math.random = () => assert.fail('Director used global random')
  try {
    const first = run(4207, 0), second = run(4207, 0), retry = run(4207, 1), other = run(7, 0)
    const snapshot = first.director.snapshot()
    assert.equal(snapshot.history.length, 64); assert.ok(snapshot.counts.spawned > 64)
    assert.deepEqual(snapshot, second.director.snapshot())
    assert.notDeepEqual(snapshot.history, retry.director.snapshot().history)
    assert.notDeepEqual(snapshot.history, other.director.snapshot().history)
    snapshot.history[0].pos[0] = 999; snapshot.history[0].counts.spawned = 999; snapshot.facilities.power = 999; snapshot.queued.push({})
    snapshot.normalQuota.hound = 999; snapshot.activeByType.gull = 999; snapshot.queuedByType.hound = 999; snapshot.nativeQueuedByType.gull = 999
    snapshot.burst.counts.gull = 999; snapshot.burst.facilities.push('power')
    assert.deepEqual(first.director.snapshot(), second.director.snapshot())
  } finally { Math.random = previous }
})

test('dispose removes its sole listener, is idempotent and leaves native actors untouched', () => {
  const f = fixture({ armed: true }); f.advance(4)
  assert.equal(f.handlers.get('game:state').length, 1)
  assert.equal(installReinforcements(f.g, { equipment: f.equipment, systems: f.systems }), f.director)
  assert.equal(f.handlers.get('game:state').length, 1)
  const actors = [...f.g.enemies.list]
  f.director.dispose(); f.director.dispose()
  assert.equal(f.handlers.get('game:state').length, 0)
  assert.deepEqual(f.g.enemies.list, actors)
  const disposed = f.director.snapshot(); f.advance(100); assert.deepEqual(f.director.snapshot(), disposed)
  const replacement = installReinforcements(f.g, { equipment: f.equipment, systems: f.systems })
  assert.notEqual(replacement, f.director); assert.equal(f.handlers.get('game:state').length, 1)
  replacement.dispose()
})

test('real original nav/factories recycle gulls and hound wrecks across repeated reinforcement wipes', async () => {
  const f = fixture({ armed: true, initial: 0 }), { g } = f
  g.scene = new T.Scene(); g.render = { lightPool: { acquire: () => null } }
  g.mats = { get: () => new T.MeshStandardMaterial(), emissive: () => new T.MeshBasicMaterial(), label: () => ({ material: new T.MeshBasicMaterial(), aspect: 3 }) }
  g.audio = { loop: () => ({ setPos() {}, setGain() {}, setPitch() {}, stop() {} }) }
  g.fx = { smoke() {}, sparks() {}, dust() {}, explosion() {}, debris() {} }; g.combat = { explode() {} }
  g.physics = api.physics(g); g.physics.build()
  g.enemies = await api.enemies(g)
  g.player.vel = new T.Vector3(); g.player.damage = () => {}; g.player.health = 100
  const group = g.scene.children.find(object => object.name === 'enemies'), objectCount = group.children.length
  let hounds = 0, gulls = 0, maxList = 0
  // Face away from the valid nav so a clear test map still has safe spawns.
  g.player.forward.set(1, 0, 0)
  for (let round = 0; round < 18; round++) {
    f.advance(45)
    for (const enemy of [...g.enemies.list]) if (enemy.alive) {
      enemy.type === 'hound' ? hounds++ : gulls++
      enemy.damage(1000, enemy.pos.clone(), new T.Vector3(0, 0, 1), 'body')
    }
    for (let time = 0; time < 7; time += .05) g.enemies.update(.05)
    maxList = Math.max(maxList, g.enemies.list.length)
    assert.equal(group.children.length, objectCount, 'No new actor render resources')
    assert.ok(g.enemies.debug.wrecks.length <= 5)
    assert.ok(g.enemies.list.length <= 18, 'Native fixed pools bound all active and dead actors')
  }
  assert.ok(hounds > 8 && gulls > 10, `Reused both pools: ${hounds} hounds, ${gulls} gulls`)
  assert.ok(maxList > 0)
  assert.ok(f.director.snapshot().history.every(item => item.active <= 8 && item.pos[0] < 0))
  f.director.dispose(); g.enemies.clear()
})
