import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  M1_WORLD, buildM1BoundarySegments, containsM1Sector,
  createM1State, resetM1State, observeM1Movement,
} from './campaign-layout.mjs'

const position = (x, z) => ({ x, y: 0, z })
const ids = ['berth-5', 'blackbox-yard', 'berth-6', 'blockade-control', 'berth-7']
const sector = id => M1_WORLD.sectors.find(item => item.id === id)
const boundaries = buildM1BoundarySegments()
const routeToLegacySpawn = M1_WORLD.route.slice(0, -1)
const distance = (a, b) => Math.hypot(b.x - a.x, b.z - a.z)
const interpolate = (a, b, t) => position(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)

function walk(route, initial = createM1State(), step = .35) {
  let state = initial
  const entered = [state.sectorId]
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], count = Math.ceil(distance(a, b) / step)
    for (let j = 1; j <= count; j++) {
      const previous = interpolate(a, b, (j - 1) / count), current = interpolate(a, b, j / count)
      assert.ok(containsM1Sector(state.sectorId, previous), `Previous sample is outside ${state.sectorId}`)
      const next = observeM1Movement(state, previous, current)
      assert.ok(containsM1Sector(next.sectorId, current), `Sample at ${JSON.stringify(current)} was not admitted`)
      if (next.sectorId !== state.sectorId) entered.push(next.sectorId)
      assert.deepEqual(next.chapter, { id: sector(next.sectorId).chapterId, status: 'not-implemented' })
      assert.equal(next.storyCompleted, false)
      state = next
    }
  }
  return { state, entered }
}

// Independent axis-aligned checks for exported boundaries (no geometry helper reuse).
function onLine(p, line, strict = false) {
  const { from: a, to: b } = line
  const axis = a.x === b.x ? 'z' : 'x', fixed = axis === 'x' ? 'z' : 'x'
  return p[fixed] === a[fixed] && (strict ? p[axis] > Math.min(a[axis], b[axis]) && p[axis] < Math.max(a[axis], b[axis]) :
    p[axis] >= Math.min(a[axis], b[axis]) && p[axis] <= Math.max(a[axis], b[axis]))
}
const mouth = link => ({ from: position(link.bounds.minX, link.bounds.minZ), to: position(link.bounds.maxX, link.bounds.maxZ) })
const polygonEdges = M1_WORLD.sectors.flatMap(item => item.footprint.map(([x,z], index) => ({
  from: position(x, z), to: position(...item.footprint[(index + 1) % item.footprint.length]), sectorId: item.id,
})))

test('five sector envelopes and real footprints match the owner layout contract', () => {
  assert.deepEqual(M1_WORLD.sectors.map(({ id, chapterId }) => [id,chapterId]), ids.map((id, i) => [id,`CH${i + 1}`]))
  const expected = [
    [-60,30,-340,-270, [[-60,-340],[30,-340],[30,-270],[-60,-270]]],
    [-160,-60,-300,-180, [[-160,-300],[-60,-300],[-60,-180],[-160,-180]]],
    [-60,30,-205,-100, [[-60,-205],[30,-205],[30,-100],[-60,-100]]],
    [-80,-40,-120,8, [[-80,-120],[-60,-120],[-60,-4],[-40,-4],[-40,8],[-80,8]]],
    [-40,40,-30,30, [[-40,-30],[40,-30],[40,30],[-40,30]]],
  ]
  M1_WORLD.sectors.forEach((item, i) => {
    const [minX,maxX,minZ,maxZ,footprint] = expected[i]
    assert.deepEqual(item.bounds, { minX, maxX, minZ, maxZ })
    assert.deepEqual(item.footprint, footprint)
    for (const [x,z] of footprint) assert.ok(containsM1Sector(item.id, position(x,z)))
  })
  assert.deepEqual(M1_WORLD.spawn, position(0,-328))
  assert.equal(M1_WORLD.spawnYaw, Math.PI)
  assert.ok(containsM1Sector('berth-5', M1_WORLD.spawn))
  assert.ok(containsM1Sector('berth-7', position(29,20)))
})

test('each named bidirectional mouth is nonzero and shared by its two footprints', () => {
  const expected = [
    ['five-to-yard', 'berth-5', 'blackbox-yard', -60,-291,-279],
    ['yard-to-six', 'blackbox-yard', 'berth-6', -60,-196,-184],
    ['six-to-control', 'berth-6', 'blockade-control', -60,-116,-104],
    ['control-to-seven', 'blockade-control', 'berth-7', -40,2,8],
  ]
  assert.deepEqual(M1_WORLD.links, expected.map(([id,fromSectorId,toSectorId,x,minZ,maxZ]) => ({
    id, fromSectorId, toSectorId, bounds: { minX: x, maxX: x, minZ, maxZ }, bidirectional: true,
  })))
  for (const link of M1_WORLD.links) {
    assert.ok(link.bounds.maxZ > link.bounds.minZ)
    for (let z = link.bounds.minZ; z <= link.bounds.maxZ; z += .5) {
      for (const id of [link.fromSectorId, link.toSectorId]) assert.ok(containsM1Sector(id, position(link.bounds.minX,z)))
    }
  }
})

test('control region rejects the excluded envelope corner, with inclusive true polygon edges', () => {
  for (const p of [position(-50,-110), position(-40,-100), position(-59.999,-4.001)]) {
    assert.equal(containsM1Sector('blockade-control', p), false)
  }
  for (const p of [position(-60,-110), position(-60,-4), position(-50,-4), position(-50,5), position(-79.999,-119.999)]) {
    assert.equal(containsM1Sector('blockade-control', p), true)
  }
  for (const item of M1_WORLD.sectors) {
    const { minX, maxX, minZ, maxZ } = item.bounds
    for (const p of [position(minX - .001,minZ), position(maxX + .001,maxZ),
      position(minX,minZ - .001), position(maxX,maxZ + .001)]) assert.equal(containsM1Sector(item.id,p), false)
  }
  for (const key of ['x','y','z']) for (const value of [NaN,Infinity,-Infinity,undefined,'0']) {
    assert.equal(containsM1Sector('berth-5', { ...M1_WORLD.spawn, [key]: value }), false)
  }
  assert.equal(containsM1Sector('missing', M1_WORLD.spawn), false)
  assert.equal(containsM1Sector('berth-5', null), false)
  assert.equal(containsM1Sector('berth-5', { ...M1_WORLD.spawn, y: 10 }), true) // Physics owns height.
})

test('route preserves owner waypoints, correcting only the diagonal outside the control footprint', () => {
  assert.deepEqual(M1_WORLD.route.map(({ x,z }) => [x,z]), [
    [0,-328],[0,-285],[-64,-285],[-120,-285],[-120,-190],[-56,-190],
    [-20,-170],[-20,-110],[-64,-110],[-64,-20],[-64,5],[-45,5],[-32,6],[24.75,20.75],
  ])
  assert.ok([...M1_WORLD.route, ...M1_WORLD.branch].every(p => p.y === 0))
  const originalCut = interpolate(position(-64,-20), position(-45,5), .4)
  assert.equal(M1_WORLD.sectors.some(item => containsM1Sector(item.id, originalCut)), false)
  assert.ok(boundaries.some(line => onLine(position(-60,-20 + 25 * 4 / 19), line)))
})

test('sampled main route crosses all five IDs in order and only changes exploration/chapter label', () => {
  const initial = createM1State(), before = JSON.stringify(initial)
  for (const step of [.2,.35,1.3]) {
    const { state, entered } = walk(routeToLegacySpawn, initial, step)
    assert.deepEqual(entered, ids)
    assert.deepEqual(state.visitedSectorIds, ids)
    assert.deepEqual(state.chapter, { id: 'CH5', status: 'not-implemented' })
    assert.equal(state.storyCompleted, false)
    assert.deepEqual(Object.keys(state).sort(), ['chapter','entry','sectorId','storyCompleted','visitedSectorIds'])
  }
  assert.equal(JSON.stringify(initial), before)
})

test('full reverse route traverses the same named links back to berth-5 without duplicate visits', () => {
  const forward = walk(routeToLegacySpawn)
  const reverse = walk([...routeToLegacySpawn].reverse(), forward.state)
  assert.deepEqual(reverse.entered, [...ids].reverse())
  assert.deepEqual(reverse.state.visitedSectorIds, ids)
  assert.deepEqual(reverse.state.chapter, { id: 'CH1', status: 'not-implemented' })
  assert.equal(reverse.state.storyCompleted, false)
})

test('every seam supports intermediate crossings, landing on a seam, and reverse movement', () => {
  const entryRouteEnds = [1,4,7,10]
  for (const [index,link] of M1_WORLD.links.entries()) {
    const fromState = walk(routeToLegacySpawn.slice(0,entryRouteEnds[index])).state
    assert.equal(fromState.sectorId, link.fromSectorId)
    const x = link.bounds.minX, z = (link.bounds.minZ + link.bounds.maxZ) / 2
    const direction = containsM1Sector(link.fromSectorId, position(x - 1,z)) ? 1 : -1
    const a = position(x - direction,z), b = position(x + direction,z), seam = position(x,z)
    let next = observeM1Movement(fromState, a, b)
    assert.equal(next.sectorId, link.toSectorId)
    assert.equal(observeM1Movement(next, b, a).sectorId, link.fromSectorId)
    assert.equal(observeM1Movement(fromState, a, seam), fromState)
    assert.equal(observeM1Movement(fromState, seam, b).sectorId, link.toSectorId)
    assert.equal(observeM1Movement(fromState, seam, seam), fromState)
    // Tangential movement along the seam must not be mistaken for entry.
    assert.equal(observeM1Movement(fromState, position(x,z - .2), position(x,z + .2)), fromState)
    for (const outsideZ of [link.bounds.minZ - .1,link.bounds.maxZ + .1]) {
      assert.equal(observeM1Movement(fromState, position(a.x,outsideZ), position(b.x,outsideZ)), fromState)
      assert.equal(observeM1Movement(next, position(b.x,outsideZ), position(a.x,outsideZ)), next)
    }
  }
})

test('out-of-mouth, out-of-bounds, unlinked and synthetic jumps do not award exploration', () => {
  const initial = createM1State()
  for (const [previous,current] of [
    [position(-59,-292),position(-61,-292)], [position(-59,-278),position(-61,-278)],
    [position(-59,-269),position(-61,-269)], [position(-59,-285),position(-161,-285)],
    [position(-58,-285),position(-62.01,-285)], [position(-60,-298),position(-60,-272)],
    [M1_WORLD.spawn,position(-120,-285)], [M1_WORLD.spawn,position(-32,6)],
    [position(-61,-190),position(-59,-190)], // Unrelated seam for the current state.
    [position(-59,-285),position(-61,-200)], [position(-61,-285),position(-62,-285)],
    [position(-59,-285),null], [null,position(-61,-285)],
  ]) assert.equal(observeM1Movement(initial,previous,current), initial)
  for (const key of ['x','y','z']) for (const value of [NaN,Infinity,undefined,'0']) {
    assert.equal(observeM1Movement(initial,position(-59,-285), { ...position(-61,-285), [key]: value }), initial)
    assert.equal(observeM1Movement(initial,{ ...position(-59,-285), [key]: value },position(-61,-285)), initial)
  }
  const inControl = walk(routeToLegacySpawn.slice(0,10)).state
  // The enclosing rectangle cannot authorize a diagonal jump from the cutout to the harbor.
  assert.equal(observeM1Movement(inControl,position(-41,-5),position(-39,-3)), inControl)
  const extraInput = { ...position(-61,-285), storyCompleted: true, flags: { boardingCompleted: true } }
  const next = observeM1Movement(initial,position(-59,-285),extraInput)
  assert.equal(next.storyCompleted, false)
  assert.equal(Object.hasOwn(next,'flags'), false)
})

test('yard branch leaves and rejoins the main route, stays in CH2 and works in reverse', () => {
  assert.deepEqual(M1_WORLD.branch.map(({ x,z }) => [x,z]), [[-120,-265],[-148,-265],[-148,-210],[-120,-210]])
  const start = walk(routeToLegacySpawn.slice(0,4)).state
  for (const branch of [M1_WORLD.branch, [...M1_WORLD.branch].reverse()]) {
    const { state, entered } = walk(branch,start)
    assert.equal(state,start)
    assert.deepEqual(entered,['blackbox-yard'])
  }
  const main = { from: position(-120,-285), to: position(-120,-190) }
  assert.ok(onLine(M1_WORLD.branch[0],main,true))
  assert.ok(onLine(M1_WORLD.branch.at(-1),main,true))
  const length = M1_WORLD.branch.slice(1).reduce((sum,p,i) => sum + distance(M1_WORLD.branch[i],p),0)
  assert.equal(length,111)
  assert.equal(length - distance(M1_WORLD.branch[0],M1_WORLD.branch.at(-1)),56)
  assert.equal(distance(M1_WORLD.branch[1],position(-120,-265)),28)
  // Static centerlines only: native containers must still separate these two paths.
})

test('boundaries cover each new perimeter exactly once outside declared mouths', () => {
  assert.equal(boundaries.length,24)
  for (const edge of polygonEdges.filter(item => item.sectorId !== 'berth-7')) {
    const count = Math.ceil(distance(edge.from,edge.to) * 2)
    for (let i = 0; i < count; i++) {
      const p = interpolate(edge.from,edge.to,(i + .5) / count)
      const opening = M1_WORLD.links.some(link => onLine(p,mouth(link),true))
      const matches = boundaries.filter(line => onLine(p,line,true))
      assert.equal(matches.length, opening ? 0 : 1, `Perimeter coverage at ${JSON.stringify(p)}`)
      if (!opening) assert.ok(matches[0].sectorIds.includes(edge.sectorId))
    }
  }
})

test('common fences list both sectors and are split at partial overlaps and T intersections', () => {
  assert.deepEqual(boundaries.filter(line => line.sectorIds.length > 1).map(line => [
    line.from.x,line.from.z,line.to.x,line.to.z,line.sectorIds,
  ]), [
    [-60,-279,-60,-270,['berth-5','blackbox-yard']],
    [-60,-300,-60,-291,['berth-5','blackbox-yard']],
    [-60,-205,-60,-196,['blackbox-yard','berth-6']],
    [-60,-184,-60,-180,['blackbox-yard','berth-6']],
    [-60,-104,-60,-100,['berth-6','blockade-control']],
    [-60,-120,-60,-116,['berth-6','blockade-control']],
    [-40,-4,-40,2,['blockade-control','berth-7']],
  ])
  for (const line of boundaries) for (const edge of polygonEdges) {
    for (const p of [edge.from,edge.to]) assert.equal(onLine(p,line,true), false, 'A perimeter vertex was not split')
    if (line.from.x === line.to.x && edge.from.z === edge.to.z) {
      const p = position(line.from.x,edge.from.z)
      assert.equal(onLine(p,line,true) && onLine(p,edge), false, 'A T intersection was not split')
    }
  }
})

test('no duplicate, partially overlapping or zero-length boundary fragments remain', () => {
  for (let i = 0; i < boundaries.length; i++) {
    const a = boundaries[i]
    assert.ok(distance(a.from,a.to) > 0)
    assert.ok(a.from.x === a.to.x || a.from.z === a.to.z)
    assert.equal(a.sectorIds.length,new Set(a.sectorIds).size)
    for (let j = i + 1; j < boundaries.length; j++) {
      const b = boundaries[j]
      const axis = a.from.x === a.to.x ? 'z' : 'x', fixed = axis === 'x' ? 'z' : 'x'
      if (b.from[fixed] !== b.to[fixed] || a.from[fixed] !== b.from[fixed]) continue
      const overlap = Math.min(a.to[axis],b.to[axis]) - Math.max(a.from[axis],b.from[axis])
      assert.ok(overlap <= 0, `Overlapping boundary fragments ${i}/${j}`)
    }
  }
  assert.deepEqual(buildM1BoundarySegments(),boundaries)
})

test('link centers have real openings and the corrected route clears new fences', () => {
  function nearest(p, line) {
    const dx = line.to.x - line.from.x, dz = line.to.z - line.from.z
    const t = Math.max(0,Math.min(1,((p.x - line.from.x) * dx + (p.z - line.from.z) * dz) / (dx * dx + dz * dz)))
    return distance(p,interpolate(line.from,line.to,t))
  }
  for (const link of M1_WORLD.links) {
    const center = position(link.bounds.minX,(link.bounds.minZ + link.bounds.maxZ) / 2)
    assert.equal(Math.min(...boundaries.map(line => nearest(center,line))),(link.bounds.maxZ - link.bounds.minZ) / 2)
  }
  for (let i = 1; i < routeToLegacySpawn.length; i++) {
    const a = routeToLegacySpawn[i - 1], b = routeToLegacySpawn[i], count = Math.ceil(distance(a,b) * 2)
    for (let j = 0; j <= count; j++) {
      const p = interpolate(a,b,j / count)
      assert.ok(Math.min(...boundaries.map(line => nearest(p,line))) >= 2, 'Route too close to a generated fence')
    }
  }
})

test('only X=30 new shore edges are coast, and the legacy harbor perimeter is not rebuilt', () => {
  assert.deepEqual(boundaries.filter(line => line.kind === 'coast').map(line => [line.from,line.to]), [
    [{ x: 30, z: -340 },{ x: 30, z: -270 }], [{ x: 30, z: -205 },{ x: 30, z: -100 }],
  ])
  assert.ok(boundaries.every(line => line.kind === 'fence' || line.from.x === 30 && line.to.x === 30))
  assert.ok(boundaries.every(line => line.sectorIds.some(id => id !== 'berth-7')))
  assert.ok(boundaries.every(line => line.from.x !== 40 && line.to.x !== 40))
  assert.ok(boundaries.every(line => line.from.z !== 30 && line.to.z !== 30))
})

test('500–700m static intent excludes the last legacy navigation chord and the optional branch', () => {
  const length = routeToLegacySpawn.slice(1).reduce((sum,p,i) => sum + distance(routeToLegacySpawn[i],p),0)
  assert.ok(length >= 500 && length <= 700)
  assert.ok(Math.abs(length - 614.2209253743532) < 1e-9)
  assert.deepEqual(routeToLegacySpawn.at(-1),position(-32,6))
  assert.deepEqual(M1_WORLD.route.at(-1),position(24.75,20.75))
  // This is a design polyline, not measured walking distance. The last legacy
  // leg needs native navigation and all paths still need the real browser gate.
})

test('world, generated boundaries and state snapshots are deeply frozen and independent', () => {
  function assertFrozen(value) {
    assert.ok(Object.isFrozen(value))
    for (const child of Object.values(value)) if (child && typeof child === 'object') assertFrozen(child)
  }
  const a = createM1State(), b = createM1State()
  for (const value of [M1_WORLD,boundaries,a]) assertFrozen(value)
  assert.notEqual(a,b)
  assert.notEqual(a.chapter,b.chapter)
  assert.notEqual(a.visitedSectorIds,b.visitedSectorIds)
  assert.throws(() => { M1_WORLD.route[0].x = 10 },TypeError)
  assert.throws(() => { boundaries[0].sectorIds.push('missing') },TypeError)
  assert.throws(() => { a.storyCompleted = true },TypeError)
  const explored = walk(routeToLegacySpawn).state, before = JSON.stringify(explored)
  assert.deepEqual(resetM1State(),a)
  assert.deepEqual(resetM1State(explored),a)
  assert.equal(JSON.stringify(explored),before)
  assert.notEqual(resetM1State(),a)
})
