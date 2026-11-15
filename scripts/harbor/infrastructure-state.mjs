export function createInfrastructure() {
  const state = {}
  const reset = () => Object.assign(state, { power: 'OFF', gate: 'LOCKED', fuel: 'UNAVAILABLE', boat: 'BLOCKED', powerTime: 0, gateProgress: 0, fuelProgress: 0, departureProgress: 0 })
  reset()
  function request(device) {
    if (device === 'power' && state.power === 'OFF') { state.power = 'UNSTABLE'; return true }
    if (state.power !== 'ON') return false
    if (device === 'gate' && state.gate === 'LOCKED') { state.gate = 'OPERATING'; return true }
    if (device === 'fuel' && state.fuel === 'UNAVAILABLE') { state.fuel = 'PUMPING'; return true }
    if (device === 'boat' && state.boat === 'READY') { state.boat = 'DEPARTING'; return true }
    return false
  }
  function tick(dt) {
    if (state.power === 'UNSTABLE' && (state.powerTime += dt) >= 1.5) state.power = 'ON'
    if (state.power === 'ON') {
      if (state.gate === 'OPERATING') { state.gateProgress = Math.min(1, state.gateProgress + dt / 2.5); if (state.gateProgress === 1) state.gate = 'OPEN' }
      if (state.fuel === 'PUMPING') { state.fuelProgress = Math.min(1, state.fuelProgress + dt / 6); if (state.fuelProgress === 1) state.fuel = 'READY' }
    }
    if (state.boat === 'DEPARTING') { state.departureProgress = Math.min(1, state.departureProgress + dt / 2.5); if (state.departureProgress === 1) state.boat = 'EXTRACTED' }
    else if (state.boat !== 'EXTRACTED') state.boat = state.power === 'ON' && state.gate === 'OPEN' && state.fuel === 'READY' ? 'READY' : 'BLOCKED'
  }
  return { state, reset, request, tick, snapshot: () => ({ ...state }) }
}
