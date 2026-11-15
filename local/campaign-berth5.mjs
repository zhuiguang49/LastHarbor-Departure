// CH1 lighting projection only. The integration owns the four-SpotLight pool and reads
// these sites after update(); no renderer settings, mission flags or live actors.
const installed = new WeakMap()

export function installBerth5(g, { world, settings = {} }) {
  if (installed.has(world)) return installed.get(world)
  const sites = world.lightSites.filter(site => site.sectorId === 'berth-5')
  if (!sites.length || sites.some(site => !site.circuit || !site.lenses?.length)) {
    throw Error('Berth 5 requires buildCampaignSectors(g, { chapter1: true })')
  }
  let power = 'OFF', elapsed = 0, enabled = true
  const ramp = (time, delay = 0) => {
    const t = Math.max(0, Math.min(1, (time - delay) / .6))
    return t * t * (3 - 2 * t)
  }
  function apply() {
    for (const site of sites) {
      let level = 0
      if (site.circuit === 'battery') level = 1
      else if (site.circuit === 'healthy') {
        if (power === 'ON') level = ramp(elapsed, site.delay)
        else if (power === 'UNSTABLE') {
          const age = elapsed - (site.delay || 0)
          // One restrained failed start, or a smooth low glow in reduced mode.
          level = settings.reducedFlashes ? .035 * ramp(age) :
            age > 0 && age < 1.5 ? .16 * Math.sin(Math.PI * age / 1.5) ** 2 : 0
        }
      }
      if (!enabled) level = 0
      site.level = level
      site.intensity = site.peak * level
      const bulbLevel = level * (site.circuit === 'battery' ? .14 : .65)
      for (const lens of site.lenses) {
        if (lens.material.isMeshBasicMaterial) lens.material.color.copy(lens.color).multiplyScalar(bulbLevel)
        else lens.material.emissiveIntensity = lens.emissiveIntensity * bulbLevel
      }
    }
  }
  function setPower(next) {
    if (!['OFF', 'UNSTABLE', 'ON'].includes(next)) throw Error(`Invalid Berth 5 power: ${next}`)
    if (power === next) return
    power = next; elapsed = 0; apply()
  }
  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return
    elapsed += dt; apply()
  }
  function setEnabled(next) {
    if (enabled === next) return
    enabled = next; apply()
  }
  function reset() { power = 'OFF'; elapsed = 0; enabled = true; apply() }
  function snapshot() {
    return { power, elapsed, enabled, pooled: true, permanentLights: 0,
      circuits: sites.map(site => ({ id: site.id, circuit: site.circuit, damaged: site.circuit === 'damaged',
        level: site.level, intensity: site.intensity, peak: site.peak,
        position: { ...site.position }, target: { ...site.target },
        lenses: site.lenses.map(lens => ({ color: lens.material.color.toArray(),
          emissiveIntensity: lens.material.emissiveIntensity ?? null })) })),
      visualAcceptance: 'Pending parent browser OFF/ON photography, native route, high/low quality and performance gates',
    }
  }
  reset()
  const api = { setPower, setEnabled, update, reset, snapshot }
  installed.set(world, api)
  return api
}
