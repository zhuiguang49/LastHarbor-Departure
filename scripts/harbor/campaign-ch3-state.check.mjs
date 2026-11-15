import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCampaignState, applyCampaignEvent } from './campaign-state.mjs'
import { createChapterDirector } from './chapter-director.mjs'

const chapter3Flags = ['chapter3Entered', 'chapter3IntroRead', 'chapter3IntroSkipped',
  'sniperThreatResolved', 'survivorRescued', 'survivorContacted', 'testimonyHeard',
  'accessCredentialObtained', 'chapter3Completed']
const priorRoute = [
  { type: 'pistol-acquired' }, { type: 'guard-requested' }, { type: 'guard-scanning' },
  { type: 'guard-warning' }, { type: 'guard-hostile' }, { type: 'ambush-resolved', method: 'isolation' },
  { type: 'power-stable' }, { type: 'equipment-acquired', id: 'rifle' },
  { type: 'equipment-acquired', id: 'knife' }, { type: 'supplies-acquired', ammo: true, flashlight: true },
  { type: 'maintenance-open' }, { type: 'blackbox-entered' }, { type: 'chapter2-crossed' },
  { type: 'chapter2-intro-read', skipped: false }, { type: 'exit-ammo-hint-handled' },
  { type: 'echo-lane-entered' }, { type: 'safe-room-hint-shown' },
  { type: 'safe-a-entered' }, { type: 'safe-b-entered' }, { type: 'safe-c-entered' },
  { type: 'berth6-entered' },
]
const chapter3Route = [
  { type: 'chapter3-crossed' }, { type: 'chapter3-intro-read', skipped: false },
  { type: 'worker-rescued' }, { type: 'worker-testimony-completed' },
  { type: 'sniper-threat-resolved', method: 'bypassed' }, { type: 'chapter3-exited' },
]
const play = (director, events) => {
  for (const event of events) assert.equal(director.event(Object.freeze(event)), true, event.type)
}
const atBerth6 = () => {
  const director = createChapterDirector()
  play(director, priorRoute)
  return director
}
const enterChapter3 = () => {
  const director = atBerth6()
  play(director, chapter3Route.slice(0, 1))
  return director
}
const unchanged = (director, events) => {
  const before = director.current()
  for (const event of events) assert.equal(director.event(event), false, event?.type)
  assert.deepEqual(director.current(), before)
}
const json = value => JSON.parse(JSON.stringify(value))

test('CH3 defaults and new runs clear every fact, resolution and checkpoint', () => {
  const initial = createCampaignState()
  assert.equal(initial.sniperResolution, null)
  for (const flag of chapter3Flags) assert.equal(initial.flags[flag], false, flag)
  for (const terminal of ['active', 'failed', 'completed']) {
    const director = atBerth6()
    play(director, chapter3Route.slice(0, 5))
    director.checkpoint({ credential: true, soldiers: [{ alive: true }] })
    if (terminal === 'failed') assert.equal(director.fail(), true)
    if (terminal === 'completed') play(director, chapter3Route.slice(5))
    assert.deepEqual(director.reset(), { ...json(initial), checkpoint: null })
    assert.equal(director.retry(), null)
    assert.deepEqual(createChapterDirector().current(), json(initial))
  }
})

test('old CH1/CH2 exits still complete their chapters; only the new crossing activates CH3', () => {
  const director = createChapterDirector()
  for (const event of priorRoute) {
    unchanged(director, chapter3Route)
    play(director, [event])
    if (event.type === 'blackbox-entered') {
      assert.equal(director.current().currentChapter, 'CH1')
      assert.equal(director.current().status, 'completed')
    }
  }
  const previous = director.current()
  assert.equal(previous.currentChapter, 'CH2')
  assert.equal(previous.status, 'completed')
  assert.equal(previous.flags.berth6Reached, true)
  assert.match(previous.objective, /第二章完成.*六号泊位/)
  unchanged(director, [{ type: 'berth6-entered' }, ...chapter3Route.slice(1)])
  play(director, chapter3Route.slice(0, 1))
  const entered = director.current()
  assert.equal(entered.currentChapter, 'CH3')
  assert.equal(entered.status, 'active')
  assert.equal(entered.flags.chapter3Entered, true)
  for (const [flag, value] of Object.entries(previous.flags)) {
    if (!chapter3Flags.includes(flag)) assert.equal(entered.flags[flag], value, flag)
  }
  unchanged(director, [{ type: 'chapter3-crossed' }, ...priorRoute])
  const failed = { ...previous, status: 'failed' }
  assert.equal(applyCampaignEvent(failed, { type: 'chapter3-crossed' }), failed)
})

test('opening payloads are exact and all later facts require the CH3 opening', () => {
  const director = enterChapter3()
  assert.match(director.current().objective, /第三章.*清除命令/)
  unchanged(director, chapter3Route.slice(2))
  for (const skipped of [undefined, null, 0, 1, '', 'false']) {
    unchanged(director, [{ type: 'chapter3-intro-read', skipped }])
  }
  play(director, [{ type: 'chapter3-intro-read', skipped: true }])
  assert.equal(director.current().flags.chapter3IntroRead, true)
  assert.equal(director.current().flags.chapter3IntroSkipped, true)
  assert.match(director.current().objective, /掩体.*避开狙击手.*维修室/)
  unchanged(director, [{ type: 'chapter3-intro-read', skipped: false },
    { type: 'worker-testimony-completed' }, { type: 'chapter3-exited' }])
  for (const method of [undefined, null, '', 'combat', 'killed-all', 'DEFEATED', true]) {
    unchanged(director, [{ type: 'sniper-threat-resolved', method }])
  }
})

test('proximity, door, cancelled dialogue and injected facts never award testimony or credentials', () => {
  const director = enterChapter3()
  play(director, chapter3Route.slice(1, 2))
  const observations = [null, undefined, {}, 'worker-testimony-completed',
    ...['worker-contacted', 'worker-approached', 'worker-door-opened', 'worker-testimony-started',
      'worker-testimony-cancelled', 'sector-entered', 'chapter-completed', 'chapter4-crossed'].map(type => ({
      type, flags: { testimonyHeard: true, accessCredentialObtained: true }, status: 'completed',
    }))]
  unchanged(director, [...observations, { type: 'worker-testimony-completed' }])
  play(director, [{ type: 'worker-rescued' }])
  const rescued = director.current()
  assert.equal(rescued.flags.survivorRescued, true)
  assert.equal(rescued.flags.survivorContacted, true)
  assert.equal(rescued.flags.testimonyHeard, false)
  assert.equal(rescued.flags.accessCredentialObtained, false)
  assert.match(rescued.objective, /按 E.*许工.*交谈/)
  unchanged(director, [...observations, { type: 'worker-rescued' }])
  play(director, [{ type: 'worker-testimony-completed' }])
  assert.equal(director.current().flags.testimonyHeard, true)
  assert.equal(director.current().flags.accessCredentialObtained, true)
  assert.match(director.current().objective, /凭据.*第七区控制廊道/)
  assert.equal(rescued.flags.testimonyHeard, false, 'the previous state remains unchanged')
  unchanged(director, [...observations, { type: 'worker-testimony-completed' }, { type: 'chapter3-exited' }])
})

test('combat, suppression and bypass work before or after rescue without any kill-all condition', () => {
  for (const method of ['defeated', 'suppressed', 'bypassed']) for (const afterRescue of [false, true]) {
    const director = enterChapter3(), resolution = { type: 'sniper-threat-resolved', method }
    play(director, chapter3Route.slice(1, 2))
    if (!afterRescue) play(director, [resolution])
    play(director, [{ type: 'worker-rescued' }])
    unchanged(director, [{ type: 'chapter3-exited' }])
    play(director, [{ type: 'worker-testimony-completed' }])
    if (afterRescue) play(director, [resolution])
    const ready = director.current()
    assert.equal(ready.status, 'active')
    assert.equal(ready.flags.chapter3Completed, false)
    assert.equal(ready.flags.sniperThreatResolved, true)
    assert.equal(ready.sniperResolution, method)
    unchanged(director, [resolution])
    // Physical connection is validated by the runtime, then reported separately.
    play(director, [{ type: 'chapter3-exited' }])
    assert.equal(director.current().status, 'completed')
    assert.equal(director.current().currentChapter, 'CH3')
    assert.equal(director.current().flags.chapter3Completed, true)
    assert.match(director.current().objective, /第三章完成.*第七区控制廊道/)
  }
})

test('sniper resolutions only upgrade to defeated, including after rescue', () => {
  for (const method of ['suppressed', 'bypassed']) {
    const director = enterChapter3()
    play(director, chapter3Route.slice(1, 3))
    play(director, [{ type: 'sniper-threat-resolved', method }])
    unchanged(director, ['suppressed', 'bypassed'].map(method => ({ type: 'sniper-threat-resolved', method })))
    play(director, [{ type: 'sniper-threat-resolved', method: 'defeated' }])
    assert.equal(director.current().sniperResolution, 'defeated')
    assert.equal(director.current().flags.survivorRescued, true)
    unchanged(director, ['suppressed', 'bypassed', 'defeated'].map(method => ({ type: 'sniper-threat-resolved', method })))
  }
})

test('the physical exit requires every fact independently and never queues premature exits', () => {
  const director = atBerth6()
  play(director, chapter3Route.slice(0, 5))
  const ready = director.current(), encoded = JSON.stringify(ready)
  for (const flag of ['chapter3IntroRead', 'sniperThreatResolved', 'survivorRescued',
    'testimonyHeard', 'accessCredentialObtained']) {
    const missing = { ...ready, flags: { ...ready.flags, [flag]: false } }
    assert.equal(applyCampaignEvent(missing, { type: 'chapter3-exited' }), missing, flag)
  }
  const completed = applyCampaignEvent(ready, { type: 'chapter3-exited' })
  assert.equal(JSON.stringify(ready), encoded)
  assert.ok(Object.isFrozen(completed))
  assert.ok(Object.isFrozen(completed.flags))
  assert.equal(completed.status, 'completed')
})

test('CH3 return trips and late sniper kills preserve completion without regressions', () => {
  for (const method of ['suppressed', 'bypassed']) {
    const director = atBerth6()
    play(director, chapter3Route.slice(0, 4))
    play(director, [{ type: 'sniper-threat-resolved', method }, { type: 'chapter3-exited' }])
    const completed = director.current()
    unchanged(director, [...priorRoute, ...chapter3Route,
      { type: 'sector-entered', sectorId: 'blackbox-yard' }])
    assert.equal(director.fail(), false)
    play(director, [{ type: 'sniper-threat-resolved', method: 'defeated' }])
    assert.deepEqual(director.current(), { ...completed, sniperResolution: 'defeated' })
    unchanged(director, ['suppressed', 'bypassed', 'defeated'].map(method => ({ type: 'sniper-threat-resolved', method })))
  }
})

test('JSON checkpoints and death/retry preserve exact CH3 facts and credentials at every stage', () => {
  const director = atBerth6()
  for (const event of chapter3Route) {
    play(director, [event])
    const facts = json(director.current())
    const runtime = json({ player: { position: [1, 0, 3], hp: 57 },
      ordinarySoldiers: [{ id: 'still-alive', alive: true }], sniper: { alive: true },
      rescue: { doorOpen: facts.flags.survivorRescued }, supplies: { consumed: [true, false] } })
    const expectedRuntime = json(runtime)
    assert.equal(director.checkpoint(runtime), true)
    const saved = json(director.snapshot().checkpoint)
    assert.deepEqual(saved.state, facts)
    runtime.ordinarySoldiers[0].alive = false
    assert.equal(director.fail(), facts.status === 'active')
    unchanged(director, [...chapter3Route, ...priorRoute])
    if (facts.status === 'active') assert.equal(director.checkpoint({ invalidReplacement: true }), false)
    assert.deepEqual(json(director.snapshot().checkpoint), saved)
    const restored = director.retry((world, state) => {
      assert.deepEqual(json(world), expectedRuntime)
      assert.deepEqual(json(state), facts)
    })
    assert.deepEqual(json(restored), expectedRuntime)
    assert.deepEqual(json(director.current()), facts)
    assert.equal(director.current().flags.accessCredentialObtained, facts.flags.testimonyHeard)
    restored.supplies.consumed[0] = false
    assert.deepEqual(json(director.retry()), expectedRuntime)
  }
})
