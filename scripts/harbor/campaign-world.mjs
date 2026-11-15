import { M0_WORLD, createCampaignState, resetCampaignState, applyObjectiveEvent, getReinforcementPolicy } from './campaign-contracts.mjs'
import { createCampaignContainers } from './campaign-containers.mjs'

// M0 engineering spike. Original physics, factories, renderer and loop remain owners.
export function installCampaignWorld(g, equipment) {
  const T = g.THREE, entry = 'campaign-m0', root = new T.Group(), chunks = []
  root.name = 'campaign-m0-technical-spike'
  g.scene.add(root)
  let state = createCampaignState(entry), previous = null
  const sunPosition = g.render.sun.position.clone(), sunTarget = g.render.sun.target.position.clone()
  const setObjective = g.hud.setObjective.bind(g.hud)
  g.hud.setObjective = () => setObjective('M0 技术通路 · 向东进入七号泊位 · 非剧情关卡')
  const setMarkers = g.hud.setMarkers.bind(g.hud)
  g.hud.setMarkers = () => setMarkers([])
  const corridor = M0_WORLD.sectors[0], bounds = corridor.bounds
  g.physics.bounds.min.x = bounds.minX
  // fR's visible entrance is already open; this single player-only seal closes it.
  const seal = g.physics.boxes.filter(b => b.playerOnly && b.min.x === -38.4 && b.max.x === -38.1 && b.min.z === 2 && b.max.z === 8)
  if (seal.length !== 1) throw Error('M0 western entrance collision boundary changed')
  g.physics.removeBox(seal[0])
  const count = 7, width = (bounds.maxX - bounds.minX) / count
  const containers = createCampaignContainers(g)
  // Keep two shader light slots; zero-intensity scene lights still cost uniforms
  // and lighting work. Reassign positions instead of accumulating seven lights.
  const lights = Array.from({ length: 2 }, () => {
    const light = new T.SpotLight(0xb8d4ee, 0, 32, .95, .65, 1.5)
    root.add(light, light.target)
    return light
  })
  for (let index = 0; index < count; index++) {
    const from = bounds.minX + index * width, to = from + width, center = (from + to) / 2
    const context = g.campaignFactories.context()
    for (const z of [bounds.minZ, bounds.maxZ]) {
      context.slab('concrete', from, 0, z - .18, to, .9, z + .18)
      context.slab('chainlink', from, .9, z - .012, to, 2.4, z + .012)
      context.rod('steel_galv', [from,2.4,z], [to,2.4,z], .035)
      for (let x = from; x < to; x += 3.35) context.rod('steel_galv', [x,.9,z], [x,2.4,z], .035)
      context.col(from, 0, z - .18, to, .9, z + .18, 'concrete', { tag: 'campaign-perimeter' })
      context.col(from, .9, z - .18, to, 2.4, z + .18, 'metal', { tag: 'campaign-perimeter' })
    }
    if (!index) {
      context.slab('concrete', from, 0, 2, from + .3, 2.4, 14)
      context.col(from, 0, 2, from + .3, 2.4, 14, 'concrete', { tag: 'campaign-end' })
    }
    context.place('container20', center, index % 2 ? 12.3 : 3.7, 0, { seed: 700 + index, color: ['teal','orange','grey'][index % 3], wear: .6 })
    context.place('light_mast', center + 7, 13, 0, { seed: 800 + index })
    context.place('traffic_cone', center + 5, 6, 0, { seed: 900 + index })
    context.label(`M0 / ${String(index + 1).padStart(2,'0')} → 07`, .24, center, 1.5, 13.8, 'z-', { color: 'white' })
    context.staticRoot.updateMatrixWorld(true)
    const group = g.campaignFactories.merge(context.staticRoot)
    group.name = `m0-chunk-${index}`
    group.add(containers.createChunk({ index, from, to }).root)
    root.add(group, context.dynRoot)
    chunks.push({ from, to, center, group, dynamic: context.dynRoot, updaters: context.updaters })
  }
  // Narrow the last two metres to the existing six-metre security entrance.
  const join = g.campaignFactories.context()
  join.slab('concrete', -40, 0, 8, -38.4, 2.4, 14)
  join.col(-40, 0, 8, -38.4, 2.4, 14, 'concrete', { tag: 'campaign-entrance-return' })
  root.add(join.staticRoot)
  g.physics.build()
  const spawn = M0_WORLD.entries[entry].spawn
  g.level.playerStart = { pos: new T.Vector3(spawn.x, spawn.y, spawn.z), yaw: -Math.PI / 2 }
  function reset() {
    state = resetCampaignState(state)
    previous = null
    g.hud.setMarkers([])
  }
  function update(dt) {
    if (g.game.state !== 'playing') return
    const p = g.player.pos
    // Translate the original shadow volume, preserving texel and penumbra scale.
    const shadowOffset = Math.min(0, Math.round((p.x + 32) * 4) / 4)
    g.render.sun.position.copy(sunPosition).x += shadowOffset
    g.render.sun.target.position.copy(sunTarget).x += shadowOffset
    g.render.sun.updateMatrixWorld(true)
    g.render.sun.target.updateMatrixWorld(true)
    if (previous && (previous.x < -40) !== (p.x < -40)) {
      const ratio = (-40 - previous.x) / (p.x - previous.x)
      const seam = { x: -40, y: previous.y + (p.y - previous.y) * ratio, z: previous.z + (p.z - previous.z) * ratio }
      state = applyObjectiveEvent(state, { type: 'sector-entered', sectorId: p.x < -40 ? 'm0-corridor' : 'berth-7', position: seam, linkId: 'm0-to-berth-7' })
    }
    previous = { x: p.x, y: p.y, z: p.z }
    const nearest = [...chunks].sort((a,b) => Math.abs((a.from+a.to)/2-p.x)-Math.abs((b.from+b.to)/2-p.x)).slice(0,2)
    for (let index = 0; index < lights.length; index++) {
      lights[index].position.set(nearest[index].center + 7, 13.2, 13)
      lights[index].target.position.set(nearest[index].center, 0, 8)
      lights[index].intensity = p.x < -42 ? 650 : 0
    }
    for (const chunk of chunks) {
      chunk.group.visible = chunk.dynamic.visible = p.x > chunk.from - 65 && p.x < chunk.to + 65
      if (chunk.group.visible) for (const update of chunk.updaters) update(dt)
    }
  }
  function interact(dt) {
    equipment.update(dt)
    g.hud.setObjective('M0 技术通路 · 向东进入原七号泊位 · 剧情尚未实现')
    g.hud.setRelays(0, 0)
  }
  reset()
  document.querySelector('.m-premise').textContent = 'M0 扩图技术验证：200 米可步行工业通路。五章剧情尚未实现；原 V6 流程请使用 legacy-sandbox 入口。'
  return { update, interact, reset, get reinforcementEnabled() { return getReinforcementPolicy(entry, state.sectorId).enabled },
    snapshot: () => ({ state, spawn, bounds, visibleChunks: chunks.filter(c => c.group.visible).map(c => c.group.name),
      totalChunks: chunks.length, containers: containers.snapshot(), activeLights: lights.filter(light => light.intensity > 0).length, colliders: g.physics.boxes.length,
      navigation: { ...g.physics.nav._grid(), blocked: undefined }, rain: g.ground.rainLevel, reflection: g.ground.planar.active }) }
}
