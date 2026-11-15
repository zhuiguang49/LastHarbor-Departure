import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LEGACY_ANCHORS, M0_WORLD, containsXZ, createCampaignState,
  resetCampaignState, applyObjectiveEvent, getReinforcementPolicy,
} from './campaign-contracts.mjs'

const sector = id => M0_WORLD.sectors.find(item => item.id === id)
const enter = (sectorId, position = { x: -40, y: 0, z: 8 }, linkId = 'm0-to-berth-7') =>
  ({ type: 'sector-entered', sectorId, position, linkId })

test('legacy anchors and world footprint stay at their original coordinates', () => {
  assert.deepEqual(LEGACY_ANCHORS, {
    spawn: { x: -32, y: 0, z: 6 }, coastX: 30, boat: { x: 29, y: 0, z: 20 },
  })
  assert.deepEqual(sector('berth-7').bounds, { minX: -40, maxX: 40, minZ: -30, maxZ: 30 })
  assert.deepEqual(sector('berth-7').spawn, LEGACY_ANCHORS.spawn)
  assert.ok(containsXZ(sector('berth-7').bounds, LEGACY_ANCHORS.boat))
})

test('M0 has only the proposed 200m corridor and unchanged harbor', () => {
  assert.deepEqual(M0_WORLD.sectors.map(item => item.id), ['m0-corridor', 'berth-7'])
  assert.deepEqual(sector('m0-corridor').bounds, { minX: -240, maxX: -40, minZ: 2, maxZ: 14 })
  assert.deepEqual(sector('m0-corridor').spawn, { x: -232, y: 0, z: 8 })
  assert.notDeepEqual(sector('m0-corridor').spawn, LEGACY_ANCHORS.spawn)
  for (const item of M0_WORLD.sectors) {
    assert.ok(item.bounds.minX < item.bounds.maxX && item.bounds.minZ < item.bounds.maxZ)
    assert.ok(containsXZ(item.bounds, item.spawn))
  }
})

test('footprints include edges and reject each outside edge or nonfinite coordinate', () => {
  for (const { bounds: b } of M0_WORLD.sectors) {
    for (const x of [b.minX, b.maxX]) for (const z of [b.minZ, b.maxZ]) {
      assert.equal(containsXZ(b, { x, y: 0, z }), true)
    }
    const center = { x: (b.minX + b.maxX) / 2, y: 0, z: (b.minZ + b.maxZ) / 2 }
    for (const patch of [{ x: b.minX - .001 }, { x: b.maxX + .001 },
      { z: b.minZ - .001 }, { z: b.maxZ + .001 }]) {
      assert.equal(containsXZ(b, { ...center, ...patch }), false)
    }
    for (const key of ['x', 'y', 'z']) for (const value of [NaN, Infinity, -Infinity, '0', undefined]) {
      assert.equal(containsXZ(b, { ...center, [key]: value }), false)
    }
    assert.equal(containsXZ(b, null), false)
    assert.equal(containsXZ(b, { ...center, y: 8 }), true) // Footprint, not floor collision.
  }
})

test('zone link has distinct existing ends and a nonzero seam shared by both sectors', () => {
  const ids = M0_WORLD.sectors.map(item => item.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(M0_WORLD.links.length, 1)
  assert.equal(new Set(M0_WORLD.links.map(item => item.id)).size, M0_WORLD.links.length)
  for (const link of M0_WORLD.links) {
    assert.notEqual(link.fromSectorId, link.toSectorId)
    assert.ok(ids.includes(link.fromSectorId) && ids.includes(link.toSectorId))
    assert.equal(link.bidirectional, true)
    assert.deepEqual(link.bounds, { minX: -40, maxX: -40, minZ: 2, maxZ: 14 })
    for (const z of [link.bounds.minZ, link.bounds.maxZ]) {
      const point = { x: -40, y: 0, z }
      for (const id of [link.fromSectorId, link.toSectorId]) assert.ok(containsXZ(sector(id).bounds, point))
    }
  }
})

test('proposed route to old spawn has no footprint gap and is within the M0 distance target', () => {
  const route = [sector('m0-corridor').spawn, { x: -40, y: 0, z: 8 }, LEGACY_ANCHORS.spawn]
  let distance = 0
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], length = Math.hypot(b.x - a.x, b.z - a.z)
    distance += length
    for (let step = 0; step <= Math.ceil(length); step++) {
      const t = step / Math.ceil(length), point = { x: a.x + (b.x - a.x) * t, y: 0, z: a.z + (b.z - a.z) * t }
      assert.ok(M0_WORLD.sectors.some(item => containsXZ(item.bounds, point)))
    }
  }
  assert.ok(distance >= 150 && distance <= 250)
  // Static geometry consistency only; actual walking/collision is the runtime gate.
})

test('entry selection is explicit, has a valid spawn, and isolates the legacy regression', () => {
  for (const [entry, definition] of Object.entries(M0_WORLD.entries)) {
    assert.ok(definition.sectorIds.includes(definition.sectorId))
    assert.ok(containsXZ(sector(definition.sectorId).bounds, definition.spawn))
    assert.deepEqual(definition.spawn, sector(definition.sectorId).spawn)
    for (const id of definition.sectorIds) assert.ok(sector(id))
    const state = createCampaignState(entry)
    assert.equal(state.sectorId, definition.sectorId)
    assert.deepEqual(state.visitedSectorIds, [definition.sectorId])
    assert.equal(state.storyCompleted, false)
  }
  assert.deepEqual(createCampaignState('campaign-m0').chapter, { id: 'CH1', status: 'not-implemented' })
  assert.equal(createCampaignState('legacy-sandbox').chapter, null)
  assert.deepEqual(M0_WORLD.entries['legacy-sandbox'].sectorIds, ['berth-7'])
  for (const entry of [undefined, null, '', 'campaign', 'campaign-m1', '__proto__']) {
    assert.throws(() => createCampaignState(entry), /Unknown campaign entry/)
  }
})

test('world descriptors and returned state cannot be mutated across runs', () => {
  const a = createCampaignState('campaign-m0'), b = createCampaignState('campaign-m0')
  assert.notEqual(a, b)
  assert.notEqual(a.visitedSectorIds, b.visitedSectorIds)
  assert.notEqual(a.chapter, b.chapter)
  assert.throws(() => { LEGACY_ANCHORS.spawn.x = 0 }, TypeError)
  assert.throws(() => { sector('m0-corridor').bounds.minX = 0 }, TypeError)
  assert.throws(() => { M0_WORLD.links[0].fromSectorId = 'missing' }, TypeError)
  assert.throws(() => { a.storyCompleted = true }, TypeError)
  assert.throws(() => { a.chapter.id = 'CH5' }, TypeError)
  assert.throws(() => { a.visitedSectorIds.push('CH5') }, TypeError)
  assert.deepEqual(a, b)
})

test('bidirectional linked exploration is pure, idempotent and never advances the chapter', () => {
  const initial = createCampaignState('campaign-m0'), before = JSON.stringify(initial)
  const event = Object.freeze(enter('berth-7', Object.freeze({ x: -40, y: 0, z: 8 })))
  let state = applyObjectiveEvent(initial, event)
  assert.equal(JSON.stringify(initial), before)
  assert.notEqual(state, initial)
  assert.equal(state.sectorId, 'berth-7')
  assert.deepEqual(state.visitedSectorIds, ['m0-corridor', 'berth-7'])
  assert.equal(applyObjectiveEvent(state, event), state)
  for (let i = 0; i < 3; i++) {
    state = applyObjectiveEvent(state, enter('berth-7', LEGACY_ANCHORS.spawn))
    state = applyObjectiveEvent(state, enter('berth-7', LEGACY_ANCHORS.boat))
    state = applyObjectiveEvent(state, enter('m0-corridor'))
    state = applyObjectiveEvent(state, enter('m0-corridor', sector('m0-corridor').spawn))
    state = applyObjectiveEvent(state, event)
    assert.deepEqual(state.chapter, { id: 'CH1', status: 'not-implemented' })
    assert.equal(state.storyCompleted, false)
    assert.deepEqual(state.visitedSectorIds, ['m0-corridor', 'berth-7'])
  }
})

test('unlinked, unknown, out-of-bounds or entry-incompatible transitions are rejected', () => {
  const initial = createCampaignState('campaign-m0')
  for (const event of [enter('missing'), enter('berth-7', undefined, 'missing'),
    { ...enter('berth-7'), linkId: undefined }, enter('berth-7', LEGACY_ANCHORS.spawn),
    enter('berth-7', { x: -40, y: 0, z: 1.99 }), enter('berth-7', { x: -40, y: 0, z: 14.01 }),
    enter('berth-7', { x: 41, y: 0, z: 8 }), enter('berth-7', { x: -40, y: NaN, z: 8 }),
    enter('m0-corridor', { x: -241, y: 0, z: 8 })]) {
    assert.throws(() => applyObjectiveEvent(initial, event))
  }
  assert.throws(() => applyObjectiveEvent(createCampaignState('legacy-sandbox'), enter('m0-corridor')), /unavailable/)
  assert.deepEqual(initial, createCampaignState('campaign-m0'))
})

test('story, objective-completion and chapter-leap events cannot fabricate campaign completion', () => {
  const initial = createCampaignState('campaign-m0')
  for (const type of ['chapter-entered', 'chapter-completed', 'objective-completed', 'campaign-completed', 'boarding-completed']) {
    assert.throws(() => applyObjectiveEvent(initial, { type, chapterId: 'CH5', storyCompleted: true }), /only sector-entered/)
  }
  for (const event of [null, undefined, {}]) assert.throws(() => applyObjectiveEvent(initial, event), /only sector-entered/)
  const state = applyObjectiveEvent(initial, { ...enter('berth-7'),
    chapter: { id: 'CH5', status: 'completed' }, storyCompleted: true, flags: { boardingCompleted: true } })
  assert.deepEqual(state.chapter, initial.chapter)
  assert.equal(state.storyCompleted, false)
  assert.equal(Object.hasOwn(state, 'flags'), false)
})

test('reset clears exploration, preserves entry, and leaves previous snapshots intact', () => {
  for (const entry of ['campaign-m0', 'legacy-sandbox']) {
    const initial = createCampaignState(entry)
    const explored = entry === 'campaign-m0' ? applyObjectiveEvent(initial, enter('berth-7')) : initial
    const snapshot = JSON.parse(JSON.stringify(explored))
    const reset = resetCampaignState(explored)
    assert.deepEqual(reset, initial)
    assert.notEqual(reset, initial)
    assert.deepEqual(JSON.parse(JSON.stringify(explored)), snapshot)
    assert.deepEqual(resetCampaignState(reset), initial)
    assert.deepEqual(resetCampaignState(snapshot), initial)
  }
})

test('continuous reinforcements are zone-scoped and disabled throughout the spike entry', () => {
  for (const entry of ['legacy-sandbox', 'campaign-m0']) for (const { id: sectorId } of M0_WORLD.sectors) {
    const policy = getReinforcementPolicy(entry, sectorId)
    assert.deepEqual(policy, { entry, sectorId, enabled: entry === 'legacy-sandbox' && sectorId === 'berth-7' })
    assert.ok(Object.isFrozen(policy))
  }
  assert.throws(() => getReinforcementPolicy('campaign-m1', 'berth-7'), /Unknown campaign entry/)
  assert.throws(() => getReinforcementPolicy('campaign-m0', 'missing'), /Unknown world sector/)
})
