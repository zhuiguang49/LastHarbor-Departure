// Pure M0 data only. Runtime adapters own movement, collision and native AI.
/** @typedef {'legacy-sandbox'|'campaign-m0'} CampaignEntry */
/** @typedef {'CH1'|'CH2'|'CH3'|'CH4'|'CH5'} ChapterId */
/** @typedef {{x:number, y:number, z:number}} WorldPosition */
/** @typedef {{minX:number, maxX:number, minZ:number, maxZ:number}} BoundsXZ */

/**
 * An absolute-world footprint, not a collision mesh or proof of walkability.
 * @typedef {Object} WorldSector
 * @property {string} id
 * @property {'technical-spike'|'legacy-harbor'} role
 * @property {BoundsXZ} bounds
 * @property {WorldPosition} spawn Player foot position, Y up, units in metres.
 */

/**
 * A shared physical seam; crossing never changes coordinates or story chapter.
 * @typedef {Object} ZoneLink
 * @property {string} id
 * @property {string} fromSectorId
 * @property {string} toSectorId
 * @property {BoundsXZ} bounds
 * @property {boolean} bidirectional
 */

/**
 * Only an implementation marker in M0. No story objectives are implemented.
 * @typedef {Object} ChapterState
 * @property {ChapterId} id
 * @property {'not-implemented'} status
 */

/**
 * @typedef {Object} CampaignState
 * @property {CampaignEntry} entry
 * @property {string} sectorId
 * @property {string[]} visitedSectorIds Exploration observations only.
 * @property {ChapterState|null} chapter Legacy has no campaign chapter.
 * @property {false} storyCompleted
 */

/**
 * An adapter's observed entry, not permission to teleport or complete a task.
 * A change of sector must be observed at the named link's seam. The adapter
 * must verify actual movement/collision; this contract cannot prove a walk.
 * @typedef {Object} ObjectiveEvent
 * @property {'sector-entered'} type
 * @property {string} sectorId
 * @property {WorldPosition} position
 * @property {string} [linkId] Required when changing sector.
 */

function freezeData(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freezeData(child)
  return Object.freeze(value)
}

export const LEGACY_ANCHORS = freezeData({
  spawn: { x: -32, y: 0, z: 6 },
  coastX: 30,
  // The gameplay boarding/extraction anchor, not the offshore boat mesh root.
  boat: { x: 29, y: 0, z: 20 },
})

// Proposed technical corridor only, not CH1 scenery or a five-zone M1 map.
export const M0_WORLD = freezeData({
  sectors: [
    { id: 'm0-corridor', role: 'technical-spike',
      bounds: { minX: -240, maxX: -40, minZ: 2, maxZ: 14 },
      spawn: { x: -232, y: 0, z: 8 } },
    { id: 'berth-7', role: 'legacy-harbor',
      bounds: { minX: -40, maxX: 40, minZ: -30, maxZ: 30 },
      spawn: LEGACY_ANCHORS.spawn },
  ],
  links: [
    { id: 'm0-to-berth-7', fromSectorId: 'm0-corridor', toSectorId: 'berth-7',
      bounds: { minX: -40, maxX: -40, minZ: 2, maxZ: 14 }, bidirectional: true },
  ],
  entries: {
    'legacy-sandbox': { sectorId: 'berth-7', spawn: LEGACY_ANCHORS.spawn, sectorIds: ['berth-7'] },
    'campaign-m0': { sectorId: 'm0-corridor', spawn: { x: -232, y: 0, z: 8 }, sectorIds: ['m0-corridor', 'berth-7'] },
  },
})

/** Inclusive X/Z footprint test. Finite Y is required but not height-tested.
 * @param {BoundsXZ} bounds
 * @param {WorldPosition} position
 */
export function containsXZ(bounds, position) {
  return !!position && [position.x, position.y, position.z].every(Number.isFinite) &&
    position.x >= bounds.minX && position.x <= bounds.maxX &&
    position.z >= bounds.minZ && position.z <= bounds.maxZ
}

function getEntry(entry) {
  if (!Object.hasOwn(M0_WORLD.entries, entry)) throw Error(`Unknown campaign entry: ${entry}`)
  return M0_WORLD.entries[entry]
}

function getSector(sectorId) {
  const sector = M0_WORLD.sectors.find(item => item.id === sectorId)
  if (!sector) throw Error(`Unknown world sector: ${sectorId}`)
  return sector
}

/** Requires an explicit entry; no implicit switch from the legacy regression.
 * @param {CampaignEntry} entry
 * @returns {CampaignState}
 */
export function createCampaignState(entry) {
  const start = getEntry(entry)
  return freezeData({ entry, sectorId: start.sectorId, visitedSectorIds: [start.sectorId],
    chapter: entry === 'campaign-m0' ? { id: 'CH1', status: 'not-implemented' } : null,
    storyCompleted: false })
}

/** Pure new-run reset; keeps entry selection and clears exploration.
 * @param {CampaignState} state
 * @returns {CampaignState}
 */
export function resetCampaignState(state) {
  return createCampaignState(state.entry)
}

/** Only exploration events are supported. Story/completion events are rejected.
 * @param {CampaignState} state State produced by this module, without patches.
 * @param {ObjectiveEvent} event
 * @returns {CampaignState}
 */
export function applyObjectiveEvent(state, event) {
  const entry = getEntry(state.entry)
  if (event?.type !== 'sector-entered') throw Error('M0 accepts only sector-entered exploration events')
  const sector = getSector(event.sectorId)
  if (!entry.sectorIds.includes(sector.id)) throw Error('Sector is unavailable in this entry')
  if (!containsXZ(sector.bounds, event.position)) throw Error('Sector entry position is outside its footprint')
  if (state.sectorId === sector.id) return state
  const link = M0_WORLD.links.find(item => item.id === event.linkId)
  const connected = link && (link.fromSectorId === state.sectorId && link.toSectorId === sector.id ||
    link.bidirectional && link.toSectorId === state.sectorId && link.fromSectorId === sector.id)
  if (!connected || !containsXZ(link.bounds, event.position)) throw Error('Sector change must cross its declared zone link')
  return freezeData({ ...state, sectorId: sector.id,
    visitedSectorIds: [...new Set([...state.visitedSectorIds, sector.id])] })
}

/** Policy for the continuous reinforcement director only, not native AI probes.
 * Campaign M0 disables it even when exploring the reused harbor. Legacy keeps
 * the existing director only in its own zone; quotas remain owned by that module.
 * @param {CampaignEntry} entry
 * @param {string} sectorId
 * @returns {{entry:CampaignEntry, sectorId:string, enabled:boolean}}
 */
export function getReinforcementPolicy(entry, sectorId) {
  getEntry(entry)
  getSector(sectorId)
  return freezeData({ entry, sectorId, enabled: entry === 'legacy-sandbox' && sectorId === 'berth-7' })
}
