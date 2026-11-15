import { M1_WORLD, createM1State, resetM1State, observeM1Movement } from './campaign-layout.mjs'
import { buildCampaignSectors } from './campaign-sectors.mjs'

// M1 exploration only, scheduled by the original level update. No story flags,
// new render loop, world teleport, independent rain or second reflection pass.
export function installCampaignM1(g, equipment, { chapter1 = false, chapter2 = false, chapter3 = false, chapter4 = false, startAtChapter3 = chapter3, startAtChapter4 = chapter4, objective } = {}) {
  const T = g.THREE, world = buildCampaignSectors(g, { chapter1, chapter2, chapter3, chapter4 })
  g.scene.add(world.root)
  const originalInteriors = [...g.level.interiorBoxes], originalSkylights = g.level.skylights
  const warehouse = chapter1 ? world.landmarks.find(item => item.id === 'berth5-warehouse') : null
  const campaignInteriors = world.interiorBoxes || []
  let selectedInterior = originalInteriors[0], activeInterior = 'berth7-warehouse'
  function selectInterior(useWarehouse) {
    if (!warehouse) return
    const p = g.player.pos
    const inside = box => p.x > box.min.x && p.x < box.max.x && p.z > box.min.z && p.z < box.max.z && p.y < box.max.y
    const selected = [...campaignInteriors, ...originalInteriors].find(inside) ||
      (useWarehouse ? campaignInteriors[0] : originalInteriors[0])
    if (selectedInterior === selected) return
    selectedInterior = selected
    // Native rain/audio inspect all boxes; volumetrics, wet hands and interior
    // environment selection inspect the first. Keep both real buildings valid.
    g.level.interiorBoxes.splice(0,g.level.interiorBoxes.length,selected,
      ...[...campaignInteriors,...originalInteriors].filter(box => box !== selected))
    const index = campaignInteriors.indexOf(selected)
    activeInterior = chapter3 && index === campaignInteriors.length - 1 ? 'berth6-safe-house' : index === 0 ? 'berth5-warehouse' : index > 0 ? `blackbox-interior-${index}` : 'berth7-warehouse'
    g.level.skylights = index === 0 ? warehouse.skylights : index > 0 ? [] : originalSkylights
  }
  selectInterior(chapter1)
  let state = createM1State(), previous = null
  const names = { 'berth-5': '五号泊位', 'blackbox-yard': '黑箱堆场', 'berth-6': '六号泊位',
    'blockade-control': '封锁控制通路', 'berth-7': '七号泊位' }
  const sunPosition = g.render.sun.position.clone(), sunTarget = g.render.sun.target.position.clone()
  const setObjective = g.hud.setObjective.bind(g.hud), setMarkers = g.hud.setMarkers.bind(g.hud)
  g.hud.setObjective = () => setObjective(objective ? objective() : `M1 地图骨架 · ${names[state.sectorId]} · 剧情未实现`)
  g.hud.setMarkers = () => setMarkers([])
  g.physics.bounds.min.x = -160
  g.physics.bounds.min.z = -340
  const seal = g.physics.boxes.filter(b => b.playerOnly && b.min.x === -38.4 && b.max.x === -38.1 && b.min.z === 2 && b.max.z === 8)
  if (seal.length !== 1) throw Error('M1 western entrance collision boundary changed')
  g.physics.removeBox(seal[0])
  g.physics.build()
  const spawn = startAtChapter4 ? { x: -64, y: 0, z: -110 } : startAtChapter3 ? { x: -56, y: 0, z: -190 } : M1_WORLD.spawn
  g.level.playerStart = { pos: new T.Vector3(spawn.x, spawn.y, spawn.z), yaw: startAtChapter4 ? Math.PI : startAtChapter3 ? -Math.PI / 2 : M1_WORLD.spawnYaw }
  // A fixed number of shader slots. CH2 has no working area-light sites.
  const lights = Array.from({ length: chapter1 ? 4 : 2 }, () => {
    const light = new T.SpotLight(0xb8d4ee, 0, 32, .95, .65, 1.5)
    world.root.add(light, light.target)
    return light
  })
  function reset(saved) {
    state = saved ? Object.freeze({ ...saved, visitedSectorIds:Object.freeze([...saved.visitedSectorIds]),
      chapter:Object.freeze({...saved.chapter}) }) : resetM1State()
    if (!saved && startAtChapter3) state = { ...state, sectorId: 'berth-6', visitedSectorIds: ['berth-6'], chapter: { id: 'CH3', status: 'not-implemented' } }
    if (!saved && startAtChapter4) state = { ...state, sectorId: 'blockade-control', visitedSectorIds: ['blockade-control'], chapter: { id: 'CH4', status: 'not-implemented' } }
    previous = null
    selectInterior(chapter1 && state.sectorId !== 'berth-7')
    g.hud.setMarkers([])
  }
  function update(dt) {
    if (g.game.state !== 'playing') return
    const p = g.player.pos
    if (previous) state = observeM1Movement(state, previous, p)
    previous = { x: p.x, y: p.y, z: p.z }
    refreshView(dt)
  }
  // New-run openings freeze gameplay, but must already show the restored area.
  function refreshView(dt = 0) {
    const p = g.player.pos
    const legacy = state.sectorId === 'berth-7'
    selectInterior(!legacy)
    const offsetX = legacy ? 0 : Math.min(0, Math.round((p.x + 32) * 4) / 4)
    const offsetZ = legacy ? 0 : Math.min(0, Math.round((p.z + 22) * 4) / 4)
    g.render.sun.position.copy(sunPosition).add(new T.Vector3(offsetX, 0, offsetZ))
    g.render.sun.target.position.copy(sunTarget).add(new T.Vector3(offsetX, 0, offsetZ))
    g.render.sun.updateMatrixWorld(true)
    g.render.sun.target.updateMatrixWorld(true)
    const candidates = (state.sectorId === 'blackbox-yard' && !chapter1) || legacy ? [] : world.lightSites
      .map(site => ({ site, distance: Math.hypot(site.position.x - p.x, site.position.z - p.z) }))
      .filter(item => item.distance < 48 && (!chapter1 || item.site.intensity > 0))
      .sort((a,b) => a.distance - b.distance).slice(0, lights.length)
    for (let i = 0; i < lights.length; i++) {
      const light = lights[i], site = candidates[i]?.site
      light.intensity = site?.intensity || 0
      if (!site) continue
      light.position.copy(site.position)
      light.target.position.copy(site.target)
      light.color.set(site.color)
      light.distance = site.distance; light.angle = site.angle
      light.penumbra = site.penumbra; light.decay = site.decay
    }
    for (const chunk of world.chunks) {
      const b = chunk.bounds
      const distance = Math.hypot(Math.max(b.minX - p.x, 0, p.x - b.maxX), Math.max(b.minZ - p.z, 0, p.z - b.maxZ))
      chunk.root.visible = distance < 85
      if (chunk.root.visible) for (const updater of chunk.updaters) updater(dt)
    }
  }
  function interact(dt) {
    equipment.update(dt)
    g.hud.setObjective()
    g.hud.setRelays(0, 0)
  }
  reset()
  document.querySelector('.m-premise').textContent = 'M1 五区地图骨架：从五号泊位，经黑箱堆场、六号泊位与封锁控制通路，步行至原七号泊位。剧情、角色和任务尚未实现。'
  return { update, interact, reset, refreshView, world, reinforcementEnabled: false,
    // Gameplay checkpoints need only progress, without scene/geometry statistics.
    capture: () => ({ ...state, visitedSectorIds:[...state.visitedSectorIds], chapter:{...state.chapter} }),
    snapshot: () => ({ state, spawn, bounds: { minX: g.physics.bounds.min.x, minZ: g.physics.bounds.min.z,
      maxX: g.physics.bounds.max.x, maxZ: g.physics.bounds.max.z },
      totalChunks: world.chunks.length, visibleChunks: world.chunks.filter(c => c.root.visible).map(c => c.id),
      world: world.snapshot(), activeLights: lights.filter(light => light.intensity > 0).length,
      ...(chapter1 ? { activeInterior,
        interiorBoxes: g.level.interiorBoxes.map(box => ({ min:box.min.toArray(),max:box.max.toArray() })),
        skylights: g.level.skylights.map(site => ({ ...site })) } : {}),
      colliders: g.physics.boxes.length, navigation: { ...g.physics.nav._grid(), blocked: undefined },
      rain: g.ground.rainLevel, reflection: g.ground.planar.active }) }
}
