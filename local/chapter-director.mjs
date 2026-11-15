import { createCampaignState, applyCampaignEvent, failCampaignState } from './campaign-state.mjs'

// Checkpoints contain JSON data supplied by the integration owner. Never read,
// grant or merge its ammo, actors, equipment, gate, position or other fields.
const copy = value => JSON.parse(JSON.stringify(value))

export function createChapterDirector() {
  let state = createCampaignState(), saved = null
  function event(event) {
    const next = applyCampaignEvent(state, event), changed = next !== state
    state = next
    return changed
  }
  function snapshot() {
    return copy({ ...state, checkpoint: saved })
  }
  function reset() {
    state = createCampaignState()
    saved = null
    return snapshot()
  }
  function fail() {
    const next = failCampaignState(state), changed = next !== state
    state = next
    return changed
  }
  function checkpoint(runtime) {
    if (state.status === 'failed') return false
    // Copy before assignment so a nonserializable runtime cannot corrupt the
    // previous checkpoint. Runtime must already be serializable plain data.
    const captured = copy(runtime)
    saved = { state: copy(state), runtime: captured }
    return true
  }
  function retry(restore, source = saved) {
    if (!source) return null
    const restored = copy(source)
    // Commit chapter facts only after the world adapter finishes restoring.
    restore?.(restored.runtime, copy(restored.state))
    state = restored.state
    return restored.runtime
  }
  // Frame-loop objective reads must not clone the saved 36-actor runtime.
  return { event, current:()=>copy(state), snapshot, reset, fail, checkpoint, retry }
}
