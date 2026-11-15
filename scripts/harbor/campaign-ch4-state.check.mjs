import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCampaignState, applyCampaignEvent, failCampaignState } from './campaign-state.mjs'
import { createChapterDirector } from './chapter-director.mjs'

const chapter4Flags = ['chapter4Entered','chapter4IntroRead','chapter4IntroSkipped','blockadeInfectedCleared',
  'p07Read','gateOverrideStarted','gateOverrideAccepted','gatePhysicallyOpen','chapter4Completed']
const priorRoute = [
  { type:'pistol-acquired' }, { type:'guard-requested' }, { type:'guard-scanning' },
  { type:'guard-warning' }, { type:'guard-hostile' }, { type:'ambush-resolved',method:'isolation' },
  { type:'power-stable' }, { type:'equipment-acquired',id:'rifle' }, { type:'equipment-acquired',id:'knife' },
  { type:'supplies-acquired',ammo:true,flashlight:true }, { type:'maintenance-open' },
  { type:'blackbox-entered' }, { type:'chapter2-crossed' }, { type:'chapter2-intro-read',skipped:true },
  { type:'exit-ammo-hint-handled' }, { type:'echo-lane-entered' }, { type:'safe-room-hint-shown' },
  { type:'safe-a-entered' }, { type:'safe-b-entered' }, { type:'safe-c-entered' }, { type:'berth6-entered' },
  { type:'chapter3-crossed' }, { type:'chapter3-intro-read',skipped:false }, { type:'worker-rescued' },
  { type:'worker-testimony-completed' }, { type:'sniper-threat-resolved',method:'bypassed' },
  { type:'chapter3-exited' },
]
const route = [
  { type:'chapter4-crossed' }, { type:'chapter4-intro-read',skipped:false },
  { type:'ch4-infected-cleared' }, { type:'p07-read' }, { type:'gate-override-started' },
  { type:'gate-override-accepted' }, { type:'gate-physically-open' }, { type:'chapter4-exited' },
]
const json = value => JSON.parse(JSON.stringify(value))
const play = (director, events) => {
  for (const event of events) assert.equal(director.event(Object.freeze(event)), true, event.type)
}
const atChapter3Exit = () => {
  const director = createChapterDirector()
  play(director, priorRoute)
  return director
}
const enterChapter4 = () => {
  const director = atChapter3Exit()
  play(director, route.slice(0, 1))
  return director
}
const unchanged = (director, events) => {
  const before = director.current()
  for (const event of events) assert.equal(director.event(event), false, event?.type)
  assert.deepEqual(director.current(), before)
}

test('CH4 facts start empty and a new run clears all progress and its checkpoint', () => {
  const initial = createCampaignState()
  for (const flag of chapter4Flags) assert.equal(initial.flags[flag], false, flag)
  for (const status of ['active','failed','completed']) {
    const director = atChapter3Exit()
    play(director, route.slice(0, status === 'completed' ? route.length : 6))
    director.checkpoint({ gate:{ progress:.4 }, infected:{ killed:5 } })
    if (status === 'failed') assert.equal(director.fail(), true)
    assert.deepEqual(director.reset(), { ...json(initial),checkpoint:null })
    assert.equal(director.retry(), null)
  }
})

test('only the real CH3 completion and credential allow CH4 entry, preserving earlier facts', () => {
  const director = createChapterDirector()
  for (const event of priorRoute) {
    unchanged(director, route)
    play(director, [event])
  }
  const before = director.current()
  assert.equal(before.currentChapter, 'CH3')
  assert.equal(before.status, 'completed')
  for (const flag of ['chapter3Completed','accessCredentialObtained']) {
    const missing = { ...before,flags:{ ...before.flags,[flag]:false } }
    assert.equal(applyCampaignEvent(missing, route[0]), missing, flag)
  }
  const failed = { ...before,status:'failed' }
  assert.equal(applyCampaignEvent(failed, route[0]), failed)
  play(director, route.slice(0, 1))
  const entered = director.current()
  assert.equal(entered.currentChapter, 'CH4')
  assert.equal(entered.status, 'active')
  assert.equal(entered.flags.chapter4Entered, true)
  for (const [flag, value] of Object.entries(before.flags)) {
    if (!chapter4Flags.includes(flag)) assert.equal(entered.flags[flag], value, flag)
  }
  assert.equal(entered.ambushResolution, before.ambushResolution)
  assert.equal(entered.sniperResolution, before.sniperResolution)
  unchanged(director, [route[0], ...priorRoute])
})

test('the CH4 opening requires an exact skipped boolean before any later mission fact', () => {
  for (const skipped of [false,true]) {
    const director = enterChapter4()
    assert.match(director.current().objective, /第四章.*封锁线.*第七区控制中心/)
    unchanged(director, route.slice(2))
    for (const invalid of [undefined,null,0,1,'','false']) {
      unchanged(director, [{ type:'chapter4-intro-read',skipped:invalid }])
    }
    play(director, [{ type:'chapter4-intro-read',skipped }])
    assert.equal(director.current().flags.chapter4IntroRead, true)
    assert.equal(director.current().flags.chapter4IntroSkipped, skipped)
    assert.match(director.current().objective, /清除封锁区感染者/)
    unchanged(director, [{ type:'chapter4-intro-read',skipped:!skipped }])
  }
})

test('ordered clearance, dossier, override and physical crossing drive distinct fallback objectives', () => {
  const director = enterChapter4()
  const objectives = [/清除封锁区感染者/, /前往安全门控制台/, /前往安全门控制台/,
    /权限覆盖进行中/, /通过正在开启的安全门/, /通过正在开启的安全门/, /第四章完成/]
  for (let index = 1; index < route.length; index++) {
    const before = director.current(), encoded = JSON.stringify(before)
    const next = applyCampaignEvent(before, route[index])
    assert.ok(Object.isFrozen(next))
    assert.ok(Object.isFrozen(next.flags))
    assert.equal(JSON.stringify(before), encoded)
    play(director, [route[index]])
    assert.deepEqual(director.current(), json(next))
    assert.match(next.objective, objectives[index - 1])
    unchanged(director, route.slice(0, index + 1))
    assert.equal(next.flags.chapter4Completed, index === route.length - 1)
    assert.equal(next.status, index === route.length - 1 ? 'completed' : 'active')
  }
  assert.equal(director.current().currentChapter, 'CH4')
  assert.equal(director.fail(), false)
})

test('four kills, unvalidated observations and injected flags grant no clearance or gate progress', () => {
  const director = enterChapter4()
  play(director, route.slice(1, 2))
  unchanged(director, [null, undefined, {}, 'ch4-infected-cleared',
    ...['enemy-died','ch4-infected-killed','sector-entered','chapter-completed','p07-opened',
      'p07-cancelled','override-timer-tick','constructor','__proto__'].map(type => ({ type,
      killed:4,total:5,elapsed:60,flags:{ blockadeInfectedCleared:true,p07Read:true,gateOverrideAccepted:true } })),
    ...route.slice(4)])
  assert.equal(director.current().flags.blockadeInfectedCleared, false)
  assert.equal(director.current().flags.gateOverrideStarted, false)
  play(director, [route[2]])
  unchanged(director, route.slice(4))
  assert.equal(director.current().flags.p07Read, false, 'clearance alone grants no dossier reading')
})

test('retained P-07 reading is valid before clearance and cannot start or accept the override', () => {
  const director = enterChapter4()
  const beforeIntro = director.current()
  assert.equal(applyCampaignEvent(beforeIntro, route[3]), beforeIntro)
  play(director, route.slice(1, 2))
  const unentered = { ...director.current(),flags:{ ...director.current().flags,chapter4Entered:false } }
  assert.equal(applyCampaignEvent(unentered, route[3]), unentered)
  play(director, [route[3]])
  assert.equal(director.current().flags.p07Read, true)
  assert.equal(director.current().flags.blockadeInfectedCleared, false)
  assert.match(director.current().objective, /清除封锁区感染者/)
  unchanged(director, [route[3], ...route.slice(4)])
  play(director, [route[2]])
  assert.equal(director.current().flags.gateOverrideStarted, false, 'clearance does not replay a refused start')
  unchanged(director, route.slice(5))
  play(director, [route[4]])
  assert.equal(director.current().flags.gateOverrideAccepted, false, 'starting does not replay a refused acceptance')
})

test('premature opening and exits are rejected; a real crossing during gate rise completes once', () => {
  const director = enterChapter4()
  for (const event of route.slice(1, 5)) {
    unchanged(director, route.slice(5))
    play(director, [event])
  }
  unchanged(director, route.slice(6))
  play(director, [route[5]])
  assert.equal(director.current().flags.gatePhysicallyOpen, false)
  assert.equal(director.current().flags.chapter4Completed, false)
  play(director, [route[7]])
  assert.equal(director.current().flags.gatePhysicallyOpen, true)
  assert.equal(director.current().flags.chapter4Completed, true)
  assert.equal(director.current().status, 'completed')
  unchanged(director, [...route, ...priorRoute])
})

test('every active CH4 stage freezes on failure and refuses all later or repeated events', () => {
  for (let count = 1; count < route.length; count++) {
    const director = atChapter3Exit()
    play(director, route.slice(0, count))
    const before = director.current()
    assert.equal(director.fail(), true)
    assert.equal(director.fail(), false)
    const failed = director.current()
    assert.deepEqual(failed.flags, before.flags)
    assert.match(failed.objective, /行动失败.*本章起点/)
    unchanged(director, [...route, ...priorRoute])
    assert.equal(director.checkpoint({ invalid:true }), false)
    assert.equal(failCampaignState(failed), failed)
  }
})

test('JSON checkpoints restore exact CH4 state and runtime at every stage', () => {
  const director = atChapter3Exit()
  for (const event of route) {
    play(director, [event])
    const facts = director.current(), runtime = { player:{ position:[-70,0,-118],hp:76 },
      infected:{ killed:facts.flags.blockadeInfectedCleared ? 5 : 0 },
      gate:{ progress:facts.flags.gatePhysicallyOpen ? 1 : .2 }, supplies:{ consumed:[false,true] } }
    assert.equal(director.checkpoint(runtime), true)
    const saved = json(director.snapshot().checkpoint)
    runtime.supplies.consumed[0] = true
    assert.equal(director.fail(), facts.status === 'active')
    const restored = director.retry((world, state) => {
      assert.deepEqual(world, saved.runtime)
      assert.deepEqual(state, saved.state)
    })
    assert.deepEqual(restored, saved.runtime)
    assert.deepEqual(director.current(), facts)
    restored.supplies.consumed[0] = true
    assert.deepEqual(director.retry(), saved.runtime)
  }
})

test('fixed chapter-entry retry preserves CH1–3 and seen text while resetting CH4 combat and gate work', () => {
  const director = enterChapter4(), prior = director.current()
  const runtime = { player:{ position:[-70,0,-118],hp:83 },equipment:{ rifle:{ ammo:27,reserve:60 } },
    infected:{ alive:[true,true,true,true,true] },supplies:{ consumed:false },gate:{ progress:0,elapsed:0 } }
  director.checkpoint(runtime)
  const anchor = json(director.snapshot().checkpoint)
  play(director, [{ type:'chapter4-intro-read',skipped:true }, ...route.slice(2, 6)])
  director.checkpoint({ later:true })
  const latest = json(director.snapshot().checkpoint)
  director.fail()
  // The host re-applies only already-seen presentation to a copy of the fixed
  // entry. These events must work even though all five infected respawn there.
  const selected = json(anchor), seen = director.current().flags
  selected.state = applyCampaignEvent(selected.state, { type:'chapter4-intro-read',skipped:seen.chapter4IntroSkipped })
  selected.state = applyCampaignEvent(selected.state, { type:'p07-read' })
  assert.deepEqual(director.retry((world, state) => {
    assert.deepEqual(world, runtime)
    assert.equal(state.flags.p07Read, true)
    assert.equal(state.flags.blockadeInfectedCleared, false)
  }, selected), runtime)
  const restored = director.current()
  assert.equal(restored.status, 'active')
  assert.equal(restored.currentChapter, 'CH4')
  assert.equal(restored.flags.chapter4IntroRead, true)
  assert.equal(restored.flags.chapter4IntroSkipped, true)
  assert.equal(restored.flags.p07Read, true)
  for (const flag of ['blockadeInfectedCleared','gateOverrideStarted','gateOverrideAccepted','gatePhysicallyOpen','chapter4Completed'])
    assert.equal(restored.flags[flag], false, flag)
  for (const [flag, value] of Object.entries(prior.flags)) if (!chapter4Flags.includes(flag))
    assert.equal(restored.flags[flag], value, flag)
  assert.equal(restored.ambushResolution, prior.ambushResolution)
  assert.equal(restored.sniperResolution, prior.sniperResolution)
  assert.deepEqual(director.snapshot().checkpoint, latest, 'diagnostic latest save remains independent')
  assert.equal(anchor.state.flags.chapter4IntroRead, false, 'the fixed entry remains unchanged')
  unchanged(director, route.slice(4))
  play(director, [route[2]])
  assert.equal(director.current().flags.gateOverrideStarted, false)
  play(director, [route[4]])
})
