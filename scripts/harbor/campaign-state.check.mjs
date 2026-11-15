import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCampaignState, applyCampaignEvent, failCampaignState } from './campaign-state.mjs'
import { createChapterDirector } from './chapter-director.mjs'

const route = method => [
  { type: 'pistol-acquired' }, { type: 'guard-requested' },
  { type: 'guard-scanning' }, { type: 'guard-warning' }, { type: 'guard-hostile' },
  { type: 'ambush-resolved', method }, { type: 'power-stable' },
  { type: 'supplies-acquired', ammo: true, flashlight: true },
  { type: 'maintenance-open' }, { type: 'blackbox-entered' },
]
const advance = (director, count, method = 'combat', start = 0) => {
  for (const event of route(method).slice(start, count)) {
    if (event.type === 'maintenance-open') warehouseWeapons(director)
    assert.equal(director.event(event), true)
  }
}
const warehouseWeapons = director => {
  for (const id of ['rifle', 'knife']) if (!director.snapshot().flags[`${id}Owned`]) {
    assert.equal(director.event({ type: 'equipment-acquired', id }), true)
  }
}
const runtime = () => ({
  player: { position: [-6, 0, -316], yaw: Math.PI, hp: 76 },
  equipment: { active: 'pistol', slots: { pistol: { owned: true, ammo: 7, reserve: 9 },
    rifle: { owned: false, ammo: 0, reserve: 0 } }, pickups: [true, false, false] },
  guard: { stage: 'hostile', actors: [{ id: 'encounter-1', hp: 21 }], spawned: 3 },
  supplies: { consumed: false, flashlight: { owned: false, on: false } },
  power: { state: 'OFF', time: 0 }, gate: { state: 'LOCKED', progress: 0 },
})

test('failed world restore preserves failed facts and the complete saved checkpoint', () => {
  const director=createChapterDirector()
  director.event({type:'pistol-acquired'});director.checkpoint(runtime());director.fail()
  const before=director.snapshot()
  assert.throws(()=>director.retry(saved=>{saved.player.hp=0;throw Error('world restore failed')}),/world restore failed/)
  assert.deepEqual(director.snapshot(),before)
  director.retry(saved=>assert.equal(saved.player.hp,76))
  assert.equal(director.current().status,'active')
})

test('new CH1 runs have isolated empty facts, an active objective and no checkpoint', () => {
  const a = createChapterDirector(), b = createChapterDirector(), initial = a.snapshot()
  assert.equal(initial.currentChapter, 'CH1')
  assert.equal(initial.status, 'active')
  assert.match(initial.objective, /P12/)
  assert.equal(initial.checkpoint, null)
  assert.equal(initial.ambushResolution, null)
  assert.ok(Object.values(initial.flags).every(value => value === false))
  assert.equal(a.retry(), null)
  assert.equal(a.event({ type: 'pistol-acquired' }), true)
  assert.deepEqual(b.snapshot(), initial)
})

test('the real CH1 sequence advances each objective through combat or isolation', () => {
  for (const method of ['combat', 'isolation']) {
    const director = createChapterDirector(), seen = new Set([director.snapshot().objective])
    for (const [index, event] of route(method).entries()) {
      if (event.type === 'maintenance-open') warehouseWeapons(director)
      assert.equal(director.event(Object.freeze(event)), true)
      const state = director.snapshot()
      assert.equal(state.status, index === 9 ? 'completed' : 'active')
      assert.equal(seen.has(state.objective), false)
      seen.add(state.objective)
    }
    const state = director.snapshot()
    assert.equal(state.currentChapter, 'CH1') // CH2 is not implemented by this slice.
    assert.equal(state.ambushResolution, method)
    for (const flag of ['pistolOwned', 'guardRequested', 'guardScanning', 'guardWarning',
      'guardBetrayalSeen', 'robotAmbushResolved', 'power5Stable', 'suppliesAcquired',
      'flashlightOwned', 'corridorAccessOpen', 'blackboxEntered']) assert.equal(state.flags[flag], true)
    assert.equal(state.flags.rifleOwned, true)
    assert.equal(state.flags.knifeOwned, true)
    assert.match(state.objective, /第一章完成.*黑箱堆场/)
  }
})

test('every prerequisite rejects all later events and never banks them for replay', () => {
  const director = createChapterDirector(), events = route('combat')
  for (let index = 0; index < events.length; index++) {
    if (events[index].type === 'maintenance-open') warehouseWeapons(director)
    const before = director.snapshot()
    for (const event of events.slice(index + 1)) assert.equal(director.event(event), false)
    assert.deepEqual(director.snapshot(), before)
    assert.equal(director.event(events[index]), true)
    assert.equal(director.snapshot().status, index === 9 ? 'completed' : 'active')
  }
})

test('repeated events are idempotent at every stage, including alternative resolutions', () => {
  const director = createChapterDirector(), events = route('isolation')
  for (let index = 0; index < events.length; index++) {
    if (events[index].type === 'maintenance-open') warehouseWeapons(director)
    assert.equal(director.event(events[index]), true)
    const before = director.snapshot()
    for (let repeat = 0; repeat < 3; repeat++) {
      for (const event of events.slice(0, index + 1)) assert.equal(director.event(event), false)
    }
    if (index >= 5) assert.equal(director.event({ type: 'ambush-resolved', method: 'combat' }), false)
    assert.deepEqual(director.snapshot(), before)
  }
  assert.equal(director.snapshot().ambushResolution, 'isolation')
})

test('resolution and supplies require the exact validated payload, without partial credit', () => {
  const director = createChapterDirector()
  advance(director, 5)
  const hostile = director.snapshot()
  for (const method of [undefined, null, '', 'killed-all', 'COMBAT', true]) {
    assert.equal(director.event({ type: 'ambush-resolved', method }), false)
    assert.deepEqual(director.snapshot(), hostile)
  }
  advance(director, 7, 'combat', 5)
  const powered = director.snapshot()
  for (const payload of [{}, { ammo: true }, { flashlight: true },
    { ammo: false, flashlight: true }, { ammo: true, flashlight: false },
    { ammo: 1, flashlight: true }, { ammo: true, flashlight: 'true' }]) {
    assert.equal(director.event({ type: 'supplies-acquired', ...payload }), false)
    assert.deepEqual(director.snapshot(), powered)
  }
  assert.equal(director.event(route('combat')[7]), true)
  assert.equal(director.snapshot().flags.flashlightOwned, true)
})

test('sector observations, generic completion and injected flags never complete CH1', () => {
  const director = createChapterDirector()
  const observations = [null, undefined, {}, 'blackbox-entered',
    ...['sector-entered', 'chapter-entered', 'objective-completed', 'chapter-completed',
      'campaign-completed', 'boarding-completed', 'fail', 'reset'].map(type => ({ type,
      sectorId: 'blackbox-yard', position: { x: -61, y: 0, z: -285 },
      chapterId: 'CH2', status: 'completed', flags: { blackboxEntered: true } }))]
  for (let index = 0; index < 10; index++) {
    const before = director.snapshot()
    for (const event of observations) assert.equal(director.event(event), false)
    assert.deepEqual(director.snapshot(), before)
    if (index < 9) {
      if (route('combat')[index].type === 'maintenance-open') warehouseWeapons(director)
      assert.equal(director.event(route('combat')[index]), true)
    }
  }
  const state = director.snapshot()
  assert.equal(state.flags.corridorAccessOpen, true)
  assert.equal(state.flags.blackboxEntered, false)
  assert.equal(state.status, 'active')
  assert.equal(director.event({ type: 'blackbox-entered' }), true)
})

test('independent physical rifle and knife acquisitions require power and cannot replace the pistol', () => {
  const director = createChapterDirector()
  for (const id of ['pistol', 'rifle', 'knife', 'flashlight', '__proto__']) {
    assert.equal(director.event({ type: 'equipment-acquired', id }), false)
  }
  advance(director, 7)
  assert.match(director.snapshot().objective, /仓库.*步枪.*匕首.*手电.*弹药/)
  for (const id of ['rifle', 'knife']) {
    assert.equal(director.event({ type: 'equipment-acquired', id }), true)
    assert.equal(director.event({ type: 'equipment-acquired', id }), false)
    assert.equal(director.snapshot().flags[`${id}Owned`], true)
  }
  assert.match(director.snapshot().objective, /仓库.*手电.*弹药/)
  assert.doesNotMatch(director.snapshot().objective, /步枪|匕首/)
  const before = director.snapshot()
  for (const id of [undefined, null, '', 'pistol', 'flashlight', '__proto__']) {
    assert.equal(director.event({ type: 'equipment-acquired', id }), false)
  }
  assert.deepEqual(director.snapshot(), before)
  advance(director, 10, 'combat', 7)
})

test('all six warehouse pickup orders require both independent weapons and supplies before the physical gate', () => {
  const pickups = {
    rifle: { type: 'equipment-acquired', id: 'rifle' },
    knife: { type: 'equipment-acquired', id: 'knife' },
    supplies: { type: 'supplies-acquired', ammo: true, flashlight: true },
  }
  for (const order of [['rifle','knife','supplies'], ['rifle','supplies','knife'],
    ['knife','rifle','supplies'], ['knife','supplies','rifle'],
    ['supplies','rifle','knife'], ['supplies','knife','rifle']]) {
    const director = createChapterDirector()
    advance(director, 7)
    for (const [index, id] of order.entries()) {
      const before = director.snapshot()
      assert.equal(director.event({ type: 'maintenance-open' }), false)
      assert.equal(director.event({ type: 'blackbox-entered' }), false)
      assert.deepEqual(director.snapshot(), before, 'Premature door/crossing never queues')
      assert.equal(director.event(pickups[id]), true)
      assert.equal(director.event(pickups[id]), false)
      const state = director.snapshot()
      assert.equal(state.flags.corridorAccessOpen, false)
      if (index < 2) {
        assert.match(state.objective, /五号仓库深处/)
        for (const [item, label] of [['rifle','步枪'], ['knife','匕首'], ['supplies','手电与弹药补给']]) {
          assert.equal(state.objective.includes(label), !order.slice(0, index + 1).includes(item))
        }
      } else assert.match(state.objective, /打开.*维护门/)
      director.checkpoint({ pickups: order.slice(0, index + 1), opaqueAmmo: 17 })
      director.fail()
      assert.deepEqual(director.retry(), { pickups: order.slice(0, index + 1), opaqueAmmo: 17 })
      assert.deepEqual(director.snapshot().flags, state.flags)
      assert.equal(director.snapshot().objective, state.objective)
    }
    assert.equal(director.event({ type: 'maintenance-open' }), true)
    assert.equal(director.event({ type: 'blackbox-entered' }), true)
    assert.equal(director.snapshot().status, 'completed')
  }
})

test('failure freezes mission progression and checkpoint writes at every unfinished stage', () => {
  for (let stage = 0; stage < 10; stage++) {
    const director = createChapterDirector()
    advance(director, stage)
    director.checkpoint({ stage })
    const before = director.snapshot()
    assert.equal(director.fail(), true)
    const failed = director.snapshot()
    assert.equal(failed.status, 'failed')
    assert.deepEqual(failed.flags, before.flags)
    assert.deepEqual(failed.checkpoint, before.checkpoint)
    assert.match(failed.objective, /失败/)
    for (const event of [...route('combat'), { type: 'equipment-acquired', id: 'rifle' }]) {
      assert.equal(director.event(event), false)
    }
    assert.equal(director.fail(), false)
    assert.equal(director.checkpoint({ invalidReplacement: true }), false)
    assert.deepEqual(director.snapshot(), failed)
  }
})

test('retry without a checkpoint leaves failure intact; completed chapters also freeze', () => {
  const director = createChapterDirector()
  director.fail()
  const failed = director.snapshot()
  assert.equal(director.retry(), null)
  assert.deepEqual(director.snapshot(), failed)
  director.reset()
  advance(director, 10)
  const completed = director.snapshot()
  assert.equal(director.fail(), false)
  for (const event of [...route('combat'), { type: 'equipment-acquired', id: 'knife' }]) {
    assert.equal(director.event(event), false)
  }
  assert.deepEqual(director.snapshot(), completed)
})

test('checkpoint and retry restore all opaque runtime fields and exact chapter facts', () => {
  const director = createChapterDirector(), physical = runtime(), expected = runtime()
  advance(director, 5)
  const chapter = director.snapshot()
  assert.equal(director.checkpoint(physical), true)
  physical.player.hp = 0
  physical.player.position[0] = -60
  physical.equipment.slots.pistol.ammo = 0
  physical.guard.actors[0].hp = 0
  physical.supplies.consumed = true
  advance(director, 9, 'combat', 5)
  director.fail()
  const restored = director.retry()
  assert.deepEqual(restored, expected)
  assert.deepEqual(director.snapshot(), { ...chapter, checkpoint: { state: {
    currentChapter: chapter.currentChapter, status: chapter.status, objective: chapter.objective,
    ambushResolution: chapter.ambushResolution, sniperResolution: chapter.sniperResolution, flags: chapter.flags }, runtime: expected } })
  // Neither the caller's old input nor the returned restore can change the save.
  restored.equipment.slots.pistol.reserve = 9999
  restored.guard.actors.push({ id: 'extra', hp: 100 })
  restored.player.position[0] = 100
  assert.deepEqual(director.retry(), expected)
  advance(director, 10, 'isolation', 5)
  assert.equal(director.snapshot().status, 'completed')
})

test('latest active checkpoint replaces the save without recursive checkpoint nesting', () => {
  const director = createChapterDirector()
  director.checkpoint({ marker: ['entry'] })
  advance(director, 7)
  const powered = director.snapshot()
  assert.equal(director.checkpoint({ marker: ['powered'], arbitraryFutureModule: { data: [1, null, false] } }), true)
  const saved = director.snapshot().checkpoint
  assert.equal(Object.hasOwn(saved.state, 'checkpoint'), false)
  director.fail()
  assert.deepEqual(director.retry(), saved.runtime)
  assert.deepEqual(director.snapshot().flags, powered.flags)
  assert.equal(director.snapshot().status, 'active')
  const circular = {}; circular.self = circular
  assert.throws(() => director.checkpoint(circular), TypeError)
  assert.deepEqual(director.snapshot().checkpoint, saved)
  assert.deepEqual(director.retry(), saved.runtime)
})

test('chapter completion and return-trip supplies survive retry without reviving the patrol', () => {
  const director=createChapterDirector()
  advance(director,9)
  director.checkpoint({patrols:{finished:false,actors:[{id:1}]},supplies:{exitConsumed:false}})
  advance(director,10,'combat',9)
  const completed={patrols:{finished:true,actors:[],queued:[]},supplies:{exitConsumed:false}}
  assert.equal(director.checkpoint(completed),true)
  director.fail()
  assert.deepEqual(director.retry(),completed)
  assert.equal(director.snapshot().status,'completed')
  assert.equal(director.snapshot().flags.blackboxEntered,true)
  const collected={...completed,supplies:{exitConsumed:true},ammo:{rifle:[40,160],pistol:[12,48]}}
  assert.equal(director.checkpoint(collected),true)
  assert.deepEqual(director.retry(),collected)
  assert.equal(director.event({type:'blackbox-entered'}),false)
})

test('snapshots deeply isolate live facts, saved facts, runtime arrays and separate directors', () => {
  const director = createChapterDirector()
  advance(director, 5)
  director.checkpoint(runtime())
  const expected = director.snapshot(), first = director.snapshot(), second = director.snapshot()
  assert.notEqual(first.flags, second.flags)
  assert.notEqual(first.checkpoint.state.flags, second.checkpoint.state.flags)
  assert.notEqual(first.checkpoint.runtime.guard.actors, second.checkpoint.runtime.guard.actors)
  first.status = 'completed'
  first.flags.pistolOwned = false
  first.flags.blackboxEntered = true
  first.checkpoint.state.flags.power5Stable = true
  first.checkpoint.runtime.equipment.slots.pistol.ammo = 9999
  first.checkpoint.runtime.guard.actors.length = 0
  first.checkpoint.runtime.player.position[0] = 100
  assert.deepEqual(director.snapshot(), expected)
  assert.deepEqual(second, expected)
  assert.deepEqual(director.retry(), runtime())
  assert.equal(createChapterDirector().snapshot().checkpoint, null)
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(director.snapshot())))
})

test('retry replaces consumed resources instead of accumulating repeated supply awards', () => {
  const director = createChapterDirector(), saved = runtime()
  advance(director, 7)
  director.checkpoint(saved)
  let physical = saved, grants = 0
  const collect = () => {
    if (director.event({ type: 'supplies-acquired', ammo: true, flashlight: true })) {
      physical.equipment.slots.pistol.reserve += 12
      physical.supplies.consumed = true
      grants++
    }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    collect(); collect()
    assert.equal(physical.equipment.slots.pistol.reserve, 21)
    director.fail()
    physical = director.retry() // Root restores, rather than merges, physical data.
    assert.equal(physical.equipment.slots.pistol.reserve, 9)
    assert.equal(physical.supplies.consumed, false)
  }
  assert.equal(grants, 3)
  collect()
  director.checkpoint(physical)
  director.fail()
  physical = director.retry()
  collect()
  assert.equal(grants, 4)
  assert.equal(physical.equipment.slots.pistol.reserve, 21)
  assert.equal(physical.supplies.consumed, true)
})

test('new run clears failures, completion, warehouse gear, resolution and checkpoint runtime', () => {
  for (const terminal of ['active', 'failed', 'completed']) {
    const director = createChapterDirector()
    advance(director, 7, 'isolation')
    director.event({ type: 'equipment-acquired', id: 'rifle' })
    director.event({ type: 'equipment-acquired', id: 'knife' })
    director.checkpoint(runtime())
    if (terminal === 'failed') director.fail()
    if (terminal === 'completed') advance(director, 10, 'isolation', 7)
    const previous = director.snapshot(), expected = createChapterDirector().snapshot()
    assert.deepEqual(director.reset(), expected)
    assert.deepEqual(director.snapshot(), expected)
    assert.equal(director.retry(), null)
    assert.deepEqual(director.reset(), expected)
    assert.equal(previous.flags.rifleOwned, true)
    assert.equal(previous.ambushResolution, 'isolation')
    assert.ok(previous.checkpoint)
  }
})

test('pure reducer preserves previous immutable states and never owns ammo', () => {
  const initial = createCampaignState(), encoded = JSON.stringify(initial)
  assert.ok(Object.isFrozen(initial))
  assert.ok(Object.isFrozen(initial.flags))
  const event = { type: 'pistol-acquired', ammo: 9999, flags: { power5Stable: true }, status: 'completed' }
  const next = applyCampaignEvent(initial, event)
  event.flags.power5Stable = false
  assert.equal(JSON.stringify(initial), encoded)
  assert.equal(next.flags.pistolOwned, true)
  assert.equal(next.flags.power5Stable, false)
  assert.equal(next.status, 'active')
  assert.equal(Object.hasOwn(next, 'ammo'), false)
  assert.equal(Object.hasOwn(next.flags, 'ammo'), false)
  assert.equal(applyCampaignEvent(next, { type: 'pistol-acquired' }), next)
  assert.throws(() => { next.flags.power5Stable = true }, TypeError)
  const failed = failCampaignState(next)
  assert.equal(next.status, 'active')
  assert.equal(failed.status, 'failed')
  assert.equal(failCampaignState(failed), failed)
  assert.equal(applyCampaignEvent(failed, { type: 'guard-requested' }), failed)
})

test('CH2 early crossing, manual opening, spatial hints and physical exit keep separate facts', () => {
  const director = createChapterDirector()
  assert.equal(director.event({type:'chapter2-crossed'}),false)
  advance(director,8);warehouseWeapons(director)
  assert.equal(director.event({type:'chapter2-crossed'}),true)
  assert.equal(director.current().currentChapter,'CH2')
  assert.equal(director.current().flags.corridorAccessOpen,false)
  assert.equal(director.event({type:'safe-room-hint-shown'}),false)
  assert.equal(director.event({type:'chapter2-intro-read',skipped:true}),true)
  assert.equal(director.event({type:'chapter2-intro-read',skipped:false}),false)
  assert.equal(director.event({type:'exit-ammo-hint-handled'}),true)
  assert.equal(director.event({type:'safe-room-hint-shown'}),false)
  assert.equal(director.event({type:'echo-lane-entered'}),true)
  assert.equal(director.event({type:'safe-room-hint-shown'}),true)
  assert.equal(director.event({type:'maintenance-open'}),true)
  assert.equal(director.event({type:'blackbox-entered'}),true)
  assert.equal(director.current().status,'active')
  assert.equal(director.event({type:'berth6-entered'}),false)
  assert.equal(director.event({type:'safe-c-entered'}),true)
  director.checkpoint({ammo:3,exitConsumed:true})
  director.fail();assert.equal(director.current().status,'failed')
  assert.deepEqual(director.retry(),{ammo:3,exitConsumed:true})
  assert.equal(director.current().flags.chapter2IntroRead,true)
  assert.equal(director.current().flags.chapter2IntroSkipped,true)
  assert.equal(director.event({type:'chapter2-crossed'}),false)
  assert.equal(director.event({type:'berth6-entered'}),true)
  assert.equal(director.current().status,'completed')
  assert.match(director.current().objective,/第二章完成.*六号/)
  assert.equal(director.event({type:'berth6-entered'}),false)
  director.reset();assert.ok(Object.values(director.current().flags).every(value=>!value))
})

const chapter5Route=[
  {type:'chapter2-crossed'},{type:'chapter2-intro-read',skipped:false},{type:'exit-ammo-hint-handled'},
  {type:'echo-lane-entered'},{type:'safe-room-hint-shown'},{type:'safe-a-entered'},{type:'safe-b-entered'},
  {type:'safe-c-entered'},{type:'berth6-entered'},{type:'chapter3-crossed'},{type:'chapter3-intro-read',skipped:false},
  {type:'worker-rescued'},{type:'worker-testimony-completed'},{type:'sniper-threat-resolved',method:'bypassed'},
  {type:'chapter3-exited'},{type:'chapter4-crossed'},{type:'chapter4-intro-read',skipped:false},
  {type:'ch4-infected-cleared'},{type:'p07-read'},{type:'gate-override-started'},{type:'gate-override-accepted'},
  {type:'gate-physically-open'},{type:'chapter4-exited'},{type:'chapter5-crossed'},{type:'chapter5-intro-read',skipped:false},
  {type:'power7-stable'},{type:'warehouse-initialization-started'},{type:'warehouse-unlocked'},{type:'warehouse-physically-open'},
]
const boarded={type:'chapter5-boarded',fuelReady:true,boatGateOpen:true}
const endingFinished={type:'chapter5-ending-finished',fadeComplete:true}
function readyChapter5(){
  const director=createChapterDirector();advance(director,10)
  for(const event of chapter5Route)assert.equal(director.event(event),true,event.type)
  return director
}

test('CH5 boarding and final completion reject every earlier chapter/warehouse stage and generic completion',()=>{
  const director=createChapterDirector();advance(director,10)
  for(const event of chapter5Route){
    const before=director.snapshot()
    assert.equal(director.event(boarded),false);assert.equal(director.event(endingFinished),false)
    assert.deepEqual(director.snapshot(),before)
    assert.equal(director.event(event),true,event.type)
  }
  for(const type of ['boarding-completed','fuel-ready','boat-ready','chapter5-completed','campaign-completed',
    'chapter5-control-read','chapter5-fault-read'])assert.equal(director.event({type}),false)
  assert.equal(director.current().flags.chapter5Boarded,false)
  assert.equal(director.current().flags.chapter5Completed,false)
  assert.equal(director.current().flags.campaignCompleted,false)
})

test('CH5 boarding and ending require all preceding chapter/entry/power/warehouse facts and exact proof',()=>{
  const state=readyChapter5().current()
  for(const flag of ['blackboxEntered','berth6Reached','chapter3Completed','chapter4Completed','accessCredentialObtained',
    'chapter5Entered','chapter5IntroRead','power7Stable','warehouseInitializationStarted','warehouseUnlocked','warehousePhysicallyOpen']){
    const missing={...state,flags:{...state.flags,[flag]:false}}
    assert.equal(applyCampaignEvent(missing,boarded),missing,flag)
    const aboard={...missing,flags:{...missing.flags,chapter5Boarded:true}}
    assert.equal(applyCampaignEvent(aboard,endingFinished),aboard,flag)
  }
  for(const field of ['fuelReady','boatGateOpen'])for(const value of [undefined,false,1,'true'])
    assert.equal(applyCampaignEvent(state,{...boarded,[field]:value}),state)
  assert.equal(applyCampaignEvent(state,endingFinished),state,'Fade proof cannot substitute for physical boarding')
  const aboard=applyCampaignEvent(state,boarded)
  for(const value of [undefined,false,1,'true'])assert.equal(applyCampaignEvent(aboard,{...endingFinished,fadeComplete:value}),aboard)
  const failed=failCampaignState(state);assert.equal(applyCampaignEvent(failed,boarded),failed)
  const failedAboard=failCampaignState(aboard);assert.equal(applyCampaignEvent(failedAboard,endingFinished),failedAboard)
})

test('CH5 remains active throughout departure; only the finished fade grants chapter and campaign victory once',async()=>{
  const {createChapter5Ending}=await import('./campaign-ch5-ending-state.mjs')
  const director=readyChapter5(),ending=createChapter5Ending(),before=director.current()
  assert.equal(director.event(boarded),true);assert.equal(director.event(boarded),false);ending.begin()
  assert.equal(director.current().status,'active');assert.match(director.current().objective,/正在离港/)
  assert.equal(director.current().flags.chapter5Completed,false);assert.equal(director.current().flags.campaignCompleted,false)
  let completions=0
  for(let frame=1;frame<=430;frame++){
    for(const event of ending.tick(.05))if(event.type==='finished'){
      assert.equal(frame,430);assert.equal(ending.snapshot().fade,1)
      completions+=Number(director.event(endingFinished))
    }
    if(frame<430){assert.equal(director.current().status,'active');assert.equal(director.current().flags.campaignCompleted,false)}
  }
  const completed=director.current()
  assert.equal(completions,1);assert.equal(completed.status,'completed');assert.equal(completed.currentChapter,'CH5')
  assert.equal(completed.flags.chapter5Completed,true);assert.equal(completed.flags.campaignCompleted,true)
  assert.match(completed.objective,/第五章完成.*离开紫金港/)
  for(const [flag,value]of Object.entries(before.flags))if(!['chapter5Boarded','chapter5Completed','campaignCompleted'].includes(flag))
    assert.equal(completed.flags[flag],value,flag)
  assert.equal(director.event(endingFinished),false);assert.equal(director.event(boarded),false);assert.equal(director.fail(),false)
  assert.deepEqual(director.current(),completed)
})

test('CH5 retry/new run clear unfinished departure without granting victory or changing earlier facts',()=>{
  const director=readyChapter5(),entry=director.current()
  director.checkpoint({chapter5:{fuel:{elapsed:0}},player:{hp:63}})
  director.event(boarded);director.fail()
  assert.deepEqual(director.retry(),{chapter5:{fuel:{elapsed:0}},player:{hp:63}})
  assert.deepEqual(director.current(),entry)
  assert.equal(director.event(endingFinished),false)
  director.event(boarded);director.event(endingFinished)
  director.reset();assert.deepEqual(director.current(),createCampaignState())
  assert.equal(director.current().flags.chapter5Boarded,false);assert.equal(director.current().flags.campaignCompleted,false)
})
