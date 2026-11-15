// V4 projection of infrastructure.state.power. No renderer, event listener or loop.
// Install after the six night lamps and infrastructure's pump lamp exist, before
// any legacy shed/pump dimming. Call update only from the infrastructure tick.
// state is the existing { power, powerTime }; settings is the live night settings.
// update(dt, state) / reset(state) return the current { phase, active, spark,
// age, event } cue for night's existing sparks/audio. event is null outside an
// OFF arc window, otherwise its 14-second cycle ID (deduplicate sound by ID).
// reset on a new run; snapshot() returns detached, serializable audit data.
export function installPowerLighting(g, { lamps, pumpLight, settings = {}, state }) {
  const T = g.THREE, circuits = [], fixtures = []
  const near = (a, b) => Math.abs(a.x - b[0]) < .03 && Math.abs(a.y - b[1]) < .03 && Math.abs(a.z - b[2]) < .03
  function lightAt(position) {
    const light = lamps.map(entry => entry.light || entry).find(light => near(light.position, position))
    if (!light) throw Error(`Power lighting: missing light at ${position}`)
    return light
  }
  function circuit(id, group, light, peak, delay = 0, bulbPeak = 1, damaged = false) {
    const item = { id, group, light, peak, delay, bulbPeak, damaged, level: 0, bulbs: [] }
    circuits.push(item)
    return item
  }
  function fixture(id, position, material, branch, radius) {
    fixtures.push({ id, position, material, branch, radius, triangles: 0 })
  }
  const mastMaterial = g.mats.emissive(16769981, 8)
  const shedMaterial = g.mats.emissive(16757864, 7)
  const yardWest = circuit('yard-west', 'EM_YARD', lightAt([-23.4, 13.2, .5]), 420, .1, .65)
  const yardSouth = circuit('yard-south', 'EM_YARD', lightAt([17, 13.2, 18.6]), 450, 1.05, .65)
  const yardDark = circuit('yard-damaged', 'EM_YARD', lightAt([17, 13.2, -8.7]), 0, 0, 0, true)
  const westGuide = circuit('west-guide', 'BAT_GUIDE', lightAt([-36.3, 13.2, 12.4]), 72, 0, .14)
  const checkpoint = circuit('checkpoint-guide', 'BAT_GUIDE', null, 0, 0, .12)
  for (const [x, z, branch] of [
    [-23.4, .5, yardWest], [-23.4, 21.4, yardDark],
    [17, -8.7, yardDark], [17, 18.6, yardSouth], [-20.6, -11.6, yardDark],
    [-27.6, -.9, checkpoint], [-36.3, 12.4, westGuide],
    [26.6, -28.7, yardDark], [26.6, 26.7, yardDark],
  ]) fixture(`mast:${x},${z}`, [x, 13.2, z], mastMaterial, branch, .85)

  // ab() authored four 34-unit PointLights but nine 7x Basic-material bulbs.
  // The five bulbs without a real light stay damaged; do not light ghost lamps.
  const shed = g.level.shedLights.map((light, i) => circuit(`shed-${i}`, 'EM_SHED', light, 34 * .84, .35 + i * .45))
  const shedDark = circuit('shed-damaged', 'EM_SHED', null, 0, 0, 0, true)
  for (const z of [-15.4, -23.6]) for (const x of [-13.6, -8.5, -3.5, 2.6, 8.6]) {
    if (z < -20 && x < -10) continue
    const branch = shed.find(item => near(item.light.position, [x, 5.75, z])) || shedDark
    fixture(`shed:${x},${z}`, [x, 6.07, z], shedMaterial, branch, .3)
  }
  if (!pumpLight?.userData.lens) throw Error('Power lighting: pass infrastructure pumpLight with its lens')
  const pump = circuit('pump', 'EM_DOCK', pumpLight, 40, .9)
  const dock = circuit('berth', 'EM_DOCK', lightAt([28.4, 2.3, 18.4]), 65, 1.95)
  const fault = circuit('junction-a', 'FAULT_A', lightAt([1.9, 1.7, 7.4]), 22)

  function bindMaterial(branch, material) {
    const local = material.clone()
    // Three Material.clone() does not retain shader callbacks.
    local.onBeforeCompile = material.onBeforeCompile
    local.customProgramCacheKey = material.customProgramCacheKey
    branch.bulbs.push({ material: local, color: local.color.clone(), emissiveIntensity: local.emissiveIntensity })
    return local
  }
  // Split ONLY triangles belonging to the audited bulbs. Retain attributes,
  // transforms, layers and any unrelated triangles using the same material.
  // Damaged fixtures share a partition, keeping this to eight extra draws.
  const sources = [], plans = []
  g.level.root.updateMatrixWorld(true)
  g.level.root.traverse(object => {
    if (object.isMesh && (object.material === mastMaterial || object.material === shedMaterial)) sources.push(object)
  })
  const vertex = new T.Vector3(), center = new T.Vector3()
  for (const object of sources) {
    const geometry = object.geometry, position = geometry.attributes.position, index = geometry.index
    const partitions = new Map(), remainder = []
    for (let i = 0; i < (index ? index.count : position.count); i += 3) {
      const triangle = [0, 1, 2].map(offset => index ? index.getX(i + offset) : i + offset)
      center.set(0, 0, 0)
      for (const v of triangle) center.add(vertex.fromBufferAttribute(position, v))
      center.multiplyScalar(1 / 3).applyMatrix4(object.matrixWorld)
      const hit = fixtures.find(item => item.material === object.material &&
        Math.abs(center.x - item.position[0]) < item.radius &&
        Math.abs(center.z - item.position[2]) < item.radius && Math.abs(center.y - item.position[1]) < .18)
      if (!hit) { remainder.push(...triangle); continue }
      hit.triangles++
      if (!partitions.has(hit.branch)) partitions.set(hit.branch, [])
      partitions.get(hit.branch).push(...triangle)
    }
    plans.push({ object, partitions, remainder })
  }
  const missing = fixtures.filter(item => !item.triangles).map(item => item.id)
  if (missing.length) throw Error(`Power lighting: original bulb mapping incomplete: ${missing.join('; ')}`)
  for (const { object, partitions, remainder } of plans) {
    for (const [branch, indices] of partitions) {
      const part = object.clone(false)
      part.name = `power-bulbs:${branch.id}`
      part.geometry = object.geometry.clone().setIndex(indices)
      part.geometry.clearGroups()
      part.material = bindMaterial(branch, object.material)
      // Original Basic bulbs do not cast or receive shadows.
      part.castShadow = false; part.receiveShadow = false
      object.parent.add(part)
    }
    if (remainder.length) object.geometry = object.geometry.clone().setIndex(remainder)
    else object.visible = false
  }
  for (const branch of [pump, dock, fault]) {
    const lens = branch.light.userData.lens
    if (!lens) throw Error(`Power lighting: missing lens for ${branch.id}`)
    lens.material = bindMaterial(branch, lens.material)
  }

  let previousPower, currentState, onTime = 0, faultTime = 0
  const faultCue = { phase: 0, active: false, spark: false, age: 0, event: null }
  const ramp = (time, delay, duration = .55) => {
    const t = Math.max(0, Math.min(1, (time - delay) / duration))
    return t * t * (3 - 2 * t)
  }
  const attempt = (time, start, duration, peak) => time < start || time > start + duration ? 0 : peak * Math.sin(Math.PI * (time - start) / duration) ** 2
  function apply(branch, level) {
    branch.level = level
    if (branch.light) branch.light.intensity = branch.peak * level
    for (const bulb of branch.bulbs) {
      if (bulb.material.isMeshBasicMaterial) bulb.material.color.copy(bulb.color).multiplyScalar(branch.bulbPeak * level)
      else bulb.material.emissiveIntensity = bulb.emissiveIntensity * branch.bulbPeak * level
    }
  }
  function update(dt, state) {
    currentState = state
    const power = state.power
    if (power !== previousPower) {
      onTime = power === 'ON' && previousPower === 'UNSTABLE' ? Math.max(0, state.powerTime - 1.5) : 0
      previousPower = power
    } else if (power === 'ON') onTime += dt
    faultTime += dt
    const phase = faultTime % 14, pulse = phase >= 9 && phase < 9.35, drop = phase >= 3 && phase < 3.3
    const off = power === 'OFF', reduced = settings.reducedFlashes
    Object.assign(faultCue, { phase, active: off && (pulse || drop), spark: off && pulse && !reduced,
      age: pulse ? phase - 9 : 0, event: off && pulse ? Math.floor(faultTime / 14) : null })
    for (const branch of circuits) {
      let level = 0
      if (branch.group === 'BAT_GUIDE') level = 1
      else if (branch === fault) level = off ? (reduced ? 6 : pulse ? 1 : drop ? 4 : 12) / 22 :
        power === 'UNSTABLE' ? 6 / 22 * (1 - ramp(state.powerTime, 0, .45)) : 0
      else if (!branch.damaged && power === 'ON') level = ramp(onTime, branch.delay)
      else if (!branch.damaged && power === 'UNSTABLE' && branch.group !== 'EM_DOCK') {
        const start = .18 + branch.delay * .5
        level = reduced ? .025 * ramp(state.powerTime, start) : attempt(state.powerTime, start, .7, .16)
      }
      apply(branch, level)
    }
    return faultCue
  }
  function reset(state) {
    previousPower = undefined; onTime = 0; faultTime = 0
    return update(0, state)
  }
  function snapshot() {
    return { power: currentState.power, onTime, fault: { ...faultCue },
      circuits: circuits.map(branch => ({ id: branch.id, group: branch.group, damaged: branch.damaged,
        level: branch.level, intensity: branch.light?.intensity ?? null, position: branch.light?.position.toArray() ?? null,
        bulbs: branch.bulbs.map(bulb => ({ color: bulb.material.color.toArray(), emissiveIntensity: bulb.material.emissiveIntensity ?? null })) })),
      fixtures: fixtures.map(item => ({ id: item.id, position: [...item.position], circuit: item.branch.id, triangles: item.triangles })),
    }
  }
  reset(state)
  return { update, reset, snapshot }
}
