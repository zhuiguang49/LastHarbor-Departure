// Pure M1 map skeleton. Native runtime adapters own physics and walk evidence.
function freezeData(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freezeData(child)
  return Object.freeze(value)
}

export const M1_WORLD = freezeData({
  sectors: [
    { id: 'berth-5', chapterId: 'CH1',
      bounds: { minX: -60, maxX: 30, minZ: -340, maxZ: -270 },
      footprint: [[-60,-340],[30,-340],[30,-270],[-60,-270]] },
    { id: 'blackbox-yard', chapterId: 'CH2',
      bounds: { minX: -160, maxX: -60, minZ: -300, maxZ: -180 },
      footprint: [[-160,-300],[-60,-300],[-60,-180],[-160,-180]] },
    { id: 'berth-6', chapterId: 'CH3',
      bounds: { minX: -60, maxX: 30, minZ: -205, maxZ: -100 },
      footprint: [[-60,-205],[30,-205],[30,-100],[-60,-100]] },
    { id: 'blockade-control', chapterId: 'CH4',
      bounds: { minX: -80, maxX: -40, minZ: -120, maxZ: 8 },
      footprint: [[-80,-120],[-60,-120],[-60,-4],[-40,-4],[-40,8],[-80,8]] },
    { id: 'berth-7', chapterId: 'CH5',
      bounds: { minX: -40, maxX: 40, minZ: -30, maxZ: 30 },
      footprint: [[-40,-30],[40,-30],[40,30],[-40,30]] },
  ],
  links: [
    { id: 'five-to-yard', fromSectorId: 'berth-5', toSectorId: 'blackbox-yard',
      bounds: { minX: -60, maxX: -60, minZ: -291, maxZ: -279 }, bidirectional: true },
    { id: 'yard-to-six', fromSectorId: 'blackbox-yard', toSectorId: 'berth-6',
      bounds: { minX: -60, maxX: -60, minZ: -196, maxZ: -184 }, bidirectional: true },
    { id: 'six-to-control', fromSectorId: 'berth-6', toSectorId: 'blockade-control',
      bounds: { minX: -60, maxX: -60, minZ: -116, maxZ: -104 }, bidirectional: true },
    { id: 'control-to-seven', fromSectorId: 'blockade-control', toSectorId: 'berth-7',
      bounds: { minX: -40, maxX: -40, minZ: 2, maxZ: 8 }, bidirectional: true },
  ],
  spawn: { x: 0, y: 0, z: -328 },
  spawnYaw: Math.PI,
  route: [
    { x: 0, y: 0, z: -328 }, { x: 0, y: 0, z: -285 }, { x: -64, y: 0, z: -285 },
    { x: -120, y: 0, z: -285 }, { x: -120, y: 0, z: -190 }, { x: -56, y: 0, z: -190 },
    { x: -20, y: 0, z: -170 }, { x: -20, y: 0, z: -110 }, { x: -64, y: 0, z: -110 },
    { x: -64, y: 0, z: -20 },
    // Geometry correction: the documented diagonal cuts outside the L-shaped footprint.
    { x: -64, y: 0, z: 5 }, { x: -45, y: 0, z: 5 }, { x: -32, y: 0, z: 6 },
    // Destination only: the final legacy-harbor leg requires native navigation,
    // not a straight line or an automatic movement command. Exclude its chord
    // from static route-length claims until the runtime records the actual path.
    // Native nav/physics reject (24,20): the original quay obstruction remains.
    { x: 24.75, y: 0, z: 20.75 },
  ],
  branch: [
    { x: -120, y: 0, z: -265 }, { x: -148, y: 0, z: -265 },
    { x: -148, y: 0, z: -210 }, { x: -120, y: 0, z: -210 },
  ],
})

const EPSILON = 1e-8
const sectorById = new Map(M1_WORLD.sectors.map(sector => [sector.id, sector]))
const point = ([x,z]) => ({ x, z })
const cross = (a, b) => a.x * b.z - a.z * b.x
const difference = (a, b) => ({ x: a.x - b.x, z: a.z - b.z })
const at = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
const edges = sector => sector.footprint.map((vertex, index) => ({
  from: point(vertex), to: point(sector.footprint[(index + 1) % sector.footprint.length]), sectorId: sector.id,
}))
const mouths = M1_WORLD.links.map(link => ({
  from: { x: link.bounds.minX, z: link.bounds.minZ },
  to: { x: link.bounds.maxX, z: link.bounds.maxZ },
}))

function onSegment(p, a, b) {
  return Math.abs(cross(difference(p, a), difference(b, a))) < EPSILON &&
    p.x >= Math.min(a.x, b.x) - EPSILON && p.x <= Math.max(a.x, b.x) + EPSILON &&
    p.z >= Math.min(a.z, b.z) - EPSILON && p.z <= Math.max(a.z, b.z) + EPSILON
}

// Parameters on AB at intersections with CD, including partial overlap ends.
function intersections(a, b, c, d) {
  const r = difference(b, a), s = difference(d, c), q = difference(c, a), denominator = cross(r, s)
  if (Math.abs(denominator) > EPSILON) {
    const t = cross(q, s) / denominator, u = cross(q, r) / denominator
    return t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON ? [Math.max(0, Math.min(1, t))] : []
  }
  if (Math.abs(cross(q, r)) > EPSILON) return []
  const axis = Math.abs(r.x) > Math.abs(r.z) ? 'x' : 'z'
  if (Math.abs(r[axis]) < EPSILON) return []
  return [c,d].map(p => (p[axis] - a[axis]) / r[axis]).filter(t => t >= 0 && t <= 1)
}

/** Inclusive X/Z polygon test; finite Y is required but native physics owns height. */
export function containsM1Sector(sectorId, position) {
  const sector = sectorById.get(sectorId)
  if (!sector || !position || ![position.x, position.y, position.z].every(Number.isFinite)) return false
  const { x, z } = position, b = sector.bounds
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false
  let inside = false
  for (const { from: a, to: b } of edges(sector)) {
    if (onSegment(position, a, b)) return true
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

/** Split every new perimeter at intersections and link mouths. Legacy edges
 * contribute split points/ownership only; the original berth-7 fence is not built.
 * Coincident pieces share one segment and list all owning sector IDs.
 */
export function buildM1BoundarySegments() {
  const perimeter = M1_WORLD.sectors.flatMap(edges), result = new Map()
  for (const edge of perimeter.filter(edge => edge.sectorId !== 'berth-7')) {
    const { from, to } = edge
    const cuts = [...new Set([0,1, ...[...perimeter, ...mouths].flatMap(other => intersections(from, to, other.from, other.to))])].sort((a,b) => a - b)
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i] - cuts[i - 1] < EPSILON) continue
      const a = at(from, to, cuts[i - 1]), b = at(from, to, cuts[i]), middle = at(a, b, .5)
      if (mouths.some(mouth => onSegment(middle, mouth.from, mouth.to))) continue
      const [start,end] = a.x < b.x || a.x === b.x && a.z < b.z ? [a,b] : [b,a]
      const key = `${start.x},${start.z}:${end.x},${end.z}`
      if (result.has(key)) continue
      const sectorIds = [...new Set(perimeter.filter(other => onSegment(middle, other.from, other.to)).map(other => other.sectorId))]
      result.set(key, { from: start, to: end, kind: start.x === 30 && end.x === 30 ? 'coast' : 'fence', sectorIds })
    }
  }
  return freezeData([...result.values()])
}

/** Immutable exploration only; no objective, inventory or completion flags. */
export function createM1State() {
  return freezeData({ entry: 'campaign-m1', sectorId: 'berth-5', visitedSectorIds: ['berth-5'],
    chapter: { id: 'CH1', status: 'not-implemented' }, storyCompleted: false })
}

/** Pure new-run reset; prior snapshots remain untouched. */
export function resetM1State() {
  return createM1State()
}

function segmentInside(sectorId, from, to) {
  if (!containsM1Sector(sectorId, { ...from, y: 0 }) || !containsM1Sector(sectorId, { ...to, y: 0 })) return false
  const cuts = [0,1, ...edges(sectorById.get(sectorId)).flatMap(edge => intersections(from, to, edge.from, edge.to))].sort((a,b) => a - b)
  return cuts.slice(1).every((t, i) => containsM1Sector(sectorId, { ...at(from, to, (cuts[i] + t) / 2), y: 0 }))
}

/** Observe consecutive native movement samples, returning the original state
 * for invalid/unlinked observations or movement within the current sector.
 * A <=4m sample may cross one named seam in either direction; endpoints need
 * not land on the seam. Larger/discontinuous samples must not award exploration.
 * This sampling guard is not teleport detection: fabricated short samples can
 * still imitate walking. Only the runtime keyboard/collision gate proves a walk.
 */
export function observeM1Movement(state, previous, current) {
  if (state.entry !== 'campaign-m1' || !containsM1Sector(state.sectorId, previous) ||
    !current || ![current.x, current.y, current.z].every(Number.isFinite) ||
    Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z) > 4) return state
  if (containsM1Sector(state.sectorId, current)) return state
  for (let i = 0; i < M1_WORLD.links.length; i++) {
    const link = M1_WORLD.links[i]
    const destination = link.fromSectorId === state.sectorId ? link.toSectorId :
      link.bidirectional && link.toSectorId === state.sectorId ? link.fromSectorId : null
    if (!destination || !containsM1Sector(destination, current)) continue
    const mouth = mouths[i]
    if (Math.abs(cross(difference(current, previous), difference(mouth.to, mouth.from))) < EPSILON) continue
    const [t] = intersections(previous, current, mouth.from, mouth.to)
    if (t === undefined) continue
    const seam = at(previous, current, t)
    if (!segmentInside(state.sectorId, previous, seam) || !segmentInside(destination, seam, current)) continue
    return freezeData({ entry: 'campaign-m1', sectorId: destination,
      visitedSectorIds: [...new Set([...state.visitedSectorIds, destination])],
      chapter: { id: sectorById.get(destination).chapterId, status: 'not-implemented' }, storyCompleted: false })
  }
  return state
}
