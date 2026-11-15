// Campaign addon. Uses the original renderer, assets, input and animation loop.
while (!window.__ready && !window.__fatal) await new Promise(resolve => setTimeout(resolve, 50))
if (window.__fatal) throw Error(window.__fatal)
const g = window.__G, T = g.THREE
const root = new T.Group()
root.name = 'last-harbor-local-environment'
g.scene.add(root)
const neutral = new URLSearchParams(location.search).get('light') === 'neutral'
g.render.autoExposure = false
g.render.exposure = neutral ? 2.4 : 1.25
// Preserve hand/weapon readability with the original viewmodel-only IBL multiplier.
g.render.viewFill = 6.5
const settings = { reducedFlashes: matchMedia('(prefers-reduced-motion: reduce)').matches }
const faults = { phase: 0, active: false, events: 0, soundEvents: 0 }
const lamps = []
function mesh(geometry, material, position, parent = root) {
  const object = new T.Mesh(geometry, material)
  object.position.set(...position)
  object.castShadow = true
  object.receiveShadow = true
  parent.add(object)
  return object
}
function lamp(position, color, intensity, target, existing = false) {
  const light = new T.SpotLight(color, intensity, 34, .87, .62, 1.5)
  light.position.set(...position)
  light.target.position.set(...target)
  root.add(light, light.target)
  if (!existing) {
    mesh(new T.BoxGeometry(.36, .2, .16), g.mats.get('steel_dark'), position)
    const lens = mesh(new T.PlaneGeometry(.29, .12), new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2, roughness: .25 }), [position[0], position[1], position[2] + .09])
    lens.lookAt(...target)
    light.userData.lens = lens
  }
  lamps.push({ light, peak: intensity })
  return light
}
// Real high-mast fixture locations; leave the other masts without a light source.
lamp([-23.4, 13.2, .5], 0xffba70, 700, [-15, 0, 6], true)
lamp([17, 13.2, 18.6], 0xb1d3ee, 750, [24, 0, 17], true)
lamp([17, 13.2, -8.7], 0xe3b47c, 500, [23, 0, 0], true)
lamp([-36.3, 13.2, 12.4], 0xaacde9, 600, [-31, 0, 6], true)
lamp([28.4, 2.3, 18.4], 0xf5c788, 65, [29, 0, 20])
mesh(new T.CylinderGeometry(.035, .035, 2.3, 10), g.mats.get('steel_galv'), [28.4, 1.15, 18.4])
const faultLight = lamp([1.9, 1.7, 7.4], 0xc5e6f4, 22, [1.8, .8, 8.5])
// The visual-only diagnostic keeps its old residual light; gameplay uses circuits.
if (new URLSearchParams(location.search).get('play') !== '1') for (const light of g.level.shedLights) light.intensity *= .35

// A shorted junction beside the original relay. The port/cabinet stay intact.
mesh(new T.BoxGeometry(.26, .4, .16), g.mats.get('steel_galv'), [2.02, 1.1, 7.5])
const openCover = mesh(new T.BoxGeometry(.25, .38, .025), g.mats.get('steel_dark'), [2.2, 1.1, 7.65])
openCover.rotation.y = .8
for (let i = 0; i < 3; i++) mesh(new T.CylinderGeometry(.012, .012, .3, 6), g.mats.get(i === 1 ? 'brass' : 'rubber'), [1.96 + i * .045, 1.03, 7.61])
const sparkPositions = new Float32Array(24 * 3)
const sparkGeometry = new T.BufferGeometry()
sparkGeometry.setAttribute('position', new T.BufferAttribute(sparkPositions, 3))
const sparkMaterial = new T.LineBasicMaterial({ color: 0xffc88c, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
const sparks = new T.LineSegments(sparkGeometry, sparkMaterial)
sparks.position.set(2.3, 1.12, 7.85)
sparks.frustumCulled = false
root.add(sparks)

function groundDecal(name, x, y, z, width, height, rotation = 0) {
  const { material } = g.mats.decal(name)
  const object = mesh(new T.PlaneGeometry(width, height), material, [x, y, z])
  object.rotation.set(-Math.PI / 2, 0, rotation)
  object.castShadow = false
  return object
}
groundDecal('scorch', 2.02, .009, 7.8, .55, .7, .4)
groundDecal('leak_stain', -.9, .039, -18.7, .8, 1.2, .2)
groundDecal('grime_streak', 27.9, .009, 18.9, .8, 1.4, -.5)
// Independent deterministic texture: a small rain-diluted injury site by the dock.
const canvas = document.createElement('canvas')
canvas.width = canvas.height = 256
const ctx = canvas.getContext('2d')
let seed = 912
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
for (let i = 0; i < 150; i++) {
  const x = 128 + (random() - .5) * 140, y = 40 + random() * 170
  ctx.fillStyle = `rgba(61,20,17,${.08 + random() * .3})`
  ctx.beginPath(); ctx.ellipse(x, y, 2 + random() * 15, 2 + random() * 7, random() * 3, 0, Math.PI * 2); ctx.fill()
}
const bloodMap = new T.CanvasTexture(canvas)
bloodMap.colorSpace = T.SRGBColorSpace
const blood = mesh(new T.PlaneGeometry(.55, .9), new T.MeshStandardMaterial({ map: bloodMap, transparent: true, depthWrite: false, roughness: .52, polygonOffset: true, polygonOffsetFactor: -2 }), [28.65, .012, 19])
blood.rotation.x = -Math.PI / 2
blood.castShadow = false
// Reuse authored prop factories instead of rebuilding models.
const cart = g.props.build('toolbox_cart', { seed: 67 })
cart.position.set(3, .46, 9.2); cart.rotation.z = Math.PI / 2; cart.rotation.y = .4; root.add(cart)
const cone = g.props.build('traffic_cone', { seed: 68 })
cone.position.set(27.8, .18, 22.6); cone.rotation.z = 1.42; root.add(cone)
const sign = g.mats.label('撤离中断 / 07', { color: 'white', font: 'sans', distress: .45 })
const board = mesh(new T.PlaneGeometry(1.2, .24), sign.material, [28.4, 1.9, 18.3])
board.rotation.y = -Math.PI / 2

// Use existing UI type and spacing. This setting is visible only while paused.
const label = document.createElement('label')
label.style.cssText = 'position:fixed;left:24px;bottom:24px;z-index:80;color:var(--bone);font:14px/20px var(--f-label);display:none'
const checkbox = document.createElement('input')
checkbox.type = 'checkbox'; checkbox.checked = settings.reducedFlashes
checkbox.addEventListener('change', () => { settings.reducedFlashes = checkbox.checked })
label.append(checkbox, ' 减少故障闪烁（本地实验）')
document.body.append(label)
document.title = '末港·今夜离港 | Last Harbor:Departure'
const originalUpdate = g.level.update.bind(g.level)
let lastCycleEvent = -1
const emit = g.events.emit.bind(g.events)
g.events.emit = (name, data) => {
  if (name === 'thunder' && settings.reducedFlashes) return
  return emit(name, data)
}
g.level.update = dt => {
  originalUpdate(dt)
  label.style.display = g.game.state === 'paused' ? 'block' : 'none'
  if (g.game.state !== 'playing') return
  window.__lastHarborCampaign?.update(dt)
  if (window.__lastHarborCampaign?.reinforcementEnabled !== false) window.__lastHarborReinforcements?.update(dt)
  const cue = window.__lastHarborSystems?.faultCue
  faults.phase = cue ? cue.phase : faults.phase + dt
  const phase = faults.phase % 14
  const pulse = phase >= 9 && phase < 9.35
  const drop = phase >= 3 && phase < 3.3
  const repaired = window.__lastHarborSystems?.state.power === 'ON'
  faults.active = cue ? cue.active : !repaired && (pulse || drop)
  if (!cue) {
    faultLight.intensity = repaired ? 22 : settings.reducedFlashes ? 12 : pulse ? 1 : drop ? 8 : 22
    faultLight.userData.lens.material.emissiveIntensity = faultLight.intensity / 11
  }
  sparks.visible = cue ? cue.spark : pulse && !settings.reducedFlashes && !repaired
  if (sparks.visible) {
    const age = phase - 9
    sparkMaterial.opacity = 1 - age / .35
    for (let i = 0; i < 12; i++) {
      for (let end = 0; end < 2; end++) {
        const t = Math.max(0, age - end * .045), offset = i * 6 + end * 3
        sparkPositions[offset] = Math.sin(i * 12.73) * t * 1.5
        sparkPositions[offset + 1] = Math.cos(i * 4.3) * t * .8 - t * t * 3
        sparkPositions[offset + 2] = Math.abs(Math.sin(i * 2.4)) * t * 1.6
      }
    }
    sparkGeometry.attributes.position.needsUpdate = true
  }
  const event = cue ? cue.event : Math.floor(faults.phase / 14)
  if ((cue ? cue.event !== null : pulse && !repaired) && event !== lastCycleEvent) {
    lastCycleEvent = event; faults.events++
    g.audio.play('relay_cut', { pos: { x: 2.3, y: 1.12, z: 7.85 }, gain: .12, pitch: 1.3, jitter: 0 })
    faults.soundEvents++
  }
}
// The original does not call level.update while paused, so use its existing HUD tick.
const hudUpdate = g.hud.update.bind(g.hud)
g.hud.update = dt => { hudUpdate(dt); label.style.display = g.game.state === 'paused' ? 'block' : 'none' }
g.events.on('game:state', ({ state, prev }) => {
  if (state === 'playing' && prev !== 'paused') { faults.phase = 0; lastCycleEvent = -1 }
})
window.__lastHarbor = {
  mode: 'local-night-experiment', settings, faults,
  snapshot: () => ({ mode: 'local-night-experiment', settings: { ...settings }, faults: { ...faults }, exposure: g.render.exposure,
    lights: lamps.map(({ light }) => ({ position: light.position.toArray(), intensity: light.intensity })),
    objects: root.children.length, originalRenderer: g.renderer === g.render.renderer }),
}
if (new URLSearchParams(location.search).get('play') === '1') {
  const { installEquipment } = await import('./equipment.mjs')
  const entry = new URLSearchParams(location.search).get('entry')
  const formalChapter5 = ['campaign-m5-a0','campaign-m5-a1','campaign-m5-b','campaign-m5-c'].includes(entry)
  const formalChapter4 = entry === 'campaign-m4' || formalChapter5
  const formalChapter3 = entry === 'campaign-m3' || formalChapter4
  const chapter4Trial = entry === 'campaign-m4-a0' || entry === 'campaign-m4-a1'
  const characterLab = entry === 'campaign-m1' && new URLSearchParams(location.search).get('characterLab') === '1'
  const infectedLab = entry === 'campaign-m1' && !characterLab && new URLSearchParams(location.search).get('infectedLab') === '1'
  const equipment = window.__lastHarborEquipment = installEquipment(g, { mesh, lamp, campaignProbe: ['campaign-m0', 'campaign-m1', 'campaign-m2', 'campaign-m3', 'campaign-m3-a0', 'campaign-m3-a1', 'campaign-m3-a2', 'campaign-m4-a0', 'campaign-m4-a1', 'campaign-m4', 'campaign-m5-a0', 'campaign-m5-a1', 'campaign-m5-b', 'campaign-m5-c'].includes(entry), campaignM2: chapter4Trial || formalChapter3 || entry === 'campaign-m2' || entry === 'campaign-m3-a0' || entry === 'campaign-m3-a1' || entry === 'campaign-m3-a2' || characterLab || infectedLab })
  // Keep the original keyboard/mouse markup in both places; remove the
  // obsolete touch, mouse-capture fallback and controller instructions.
  const controls = g.game.menus.root.querySelector('[data-pane="controls"]')
  for (const element of [...controls.children].slice(2)) element.remove()
  controls.querySelector('.keys').insertAdjacentHTML('beforeend', '<div><dt>手电筒开关</dt><dd><kbd>Q</kbd></dd></div>')
  g.game.menus.root.querySelector('.lg-touch').remove()
  g.game.menus.root.querySelector('.m-legend > div').insertAdjacentHTML('beforeend', '<span><kbd>Q</kbd> 手电筒开关</span>')
  const { installInfrastructure } = await import('./infrastructure.mjs')
  window.__lastHarborSystems = installInfrastructure(g, { mesh, lamp, lamps, settings, equipment,
    resetFaults: () => { faults.phase = 0; faults.active = false; lastCycleEvent = -1; sparks.visible = false } })
  const { installReinforcements } = await import('./reinforcements.mjs')
  window.__lastHarborReinforcements = installReinforcements(g, { equipment, systems: window.__lastHarborSystems })
  const { installNarrative } = await import('./opening-narrative.mjs')
  window.__lastHarborNarrative = chapter4Trial || entry === 'campaign-m3-a0' ? { snapshot: () => ({ active: false, sceneTrial: true }) } : installNarrative(g, equipment, { campaignM2: formalChapter3 || entry === 'campaign-m2', campaignM3: entry === 'campaign-m3-a1' || entry === 'campaign-m3-a2', chapter3Available: formalChapter3, chapter4Available: formalChapter4, chapter5Available: formalChapter5 })
  const { installAftermath } = await import('./aftermath.mjs')
  window.__lastHarborAftermath = installAftermath(g, { enabled: new URLSearchParams(location.search).get('aftermath') !== '0' })
  if (entry === 'campaign-m0') {
    const { installCampaignWorld } = await import('./campaign-world.mjs')
    window.__lastHarborCampaign = installCampaignWorld(g, equipment)
  }
  if (entry === 'campaign-m1' && !characterLab && !infectedLab) {
    const { installCampaignM1 } = await import('./campaign-m1.mjs')
    window.__lastHarborCampaign = installCampaignM1(g, equipment)
  }
  if (characterLab) {
    try {
      const { installCharacterLab } = await import('./character-lab.mjs')
      window.__lastHarborCharacterLab = window.__lastHarborCampaign = await installCharacterLab(g,equipment)
    } catch(error) {
      document.getElementById('boot-msg').textContent = `单体诊断加载失败：${error.message}`
      throw error
    }
  }
  if (chapter4Trial || formalChapter3 || entry === 'campaign-m2' || entry === 'campaign-m3-a0' || entry === 'campaign-m3-a1' || entry === 'campaign-m3-a2' || infectedLab) {
    const { createPickupModel, loadPickupTexture } = await import('./campaign-pickup-asset.mjs')
    // Decode the supplied static cover before the campaign world becomes ready.
    // The texture is shared for this game session; environment instances borrow it.
    const pickupTexture = await loadPickupTexture(T)
    g.campaignAssets = { createPickupModel, pickupTexture }
  }
  if (infectedLab) {
    try {
      const { installCharacterBehaviorLab } = await import('./character-behavior-lab.mjs')
      const sectionId = new URLSearchParams(location.search).get('infectedSection')
      window.__lastHarborInfectedLab = window.__lastHarborCampaign = await installCharacterBehaviorLab(g,equipment,{sectionId})
    } catch(error) {
      document.getElementById('boot-msg').textContent = `感染者行为试玩加载失败：${error.message}`
      throw error
    }
  }
  if (entry === 'campaign-m3-a0') {
    try {
      const { installCampaignM3A0 } = await import('./campaign-m3-a0.mjs')
      window.__lastHarborCampaign = await installCampaignM3A0(g, equipment)
    } catch (error) {
      document.getElementById('boot-msg').textContent = `六号场景加载失败：${error.message}`
      throw error
    }
  }
  if (chapter4Trial) {
    try {
      if(entry==='campaign-m4-a1'){
        const { installCampaignM4A1 } = await import('./campaign-m4-a1.mjs')
        window.__lastHarborCampaign = await installCampaignM4A1(g,equipment)
      }else{
        const { installCampaignM4A0 } = await import('./campaign-m4-a0.mjs')
        window.__lastHarborCampaign = await installCampaignM4A0(g, equipment)
      }
    } catch (error) {
      document.getElementById('boot-msg').textContent = `第七区场景加载失败：${error.message}`
      throw error
    }
  }
  if (formalChapter3 || entry === 'campaign-m2') {
    let asset, bank, chapter3Resources, chapter4Assets, repairResources
    try {
      const { installCampaignM2 } = await import('./campaign-m2.mjs')
      const { loadInfectedAsset } = await import('./character-assets.mjs')
      const { loadInfectedAudio } = await import('./character-audio.mjs')
      asset = await loadInfectedAsset(T)
      bank = await loadInfectedAudio(g)
      if (formalChapter3) {
        const { loadChapter3RuntimeResources } = await import('./campaign-ch3-runtime.mjs')
        const { buildChapter3Environment } = await import('./campaign-ch3-environment.mjs')
        chapter3Resources = await loadChapter3RuntimeResources(g)
        g.campaignAssets.chapter3 = chapter3Resources.assets
        g.campaignAssets.buildChapter3Environment = buildChapter3Environment
      }
      if (formalChapter4) {
        const { loadChapter4Assets } = await import('./campaign-ch4-assets.mjs')
        const { buildChapter4Environment } = await import('./campaign-ch4-environment.mjs')
        chapter4Assets = await loadChapter4Assets(T)
        Object.assign(g.campaignAssets,{chapter4:chapter4Assets,buildChapter4Environment})
      }
      if(['campaign-m5-b','campaign-m5-c'].includes(entry)){
        const { loadChapter5RepairAsset } = await import('./campaign-ch5-repair-asset.mjs')
        repairResources=await loadChapter5RepairAsset(T)
      }
      window.__lastHarborCampaign = installCampaignM2(g, equipment, { settings, infected:{asset,bank}, narrative:window.__lastHarborNarrative,
        chapter3Resources, chapter5Available:formalChapter5, chapter5Combat:['campaign-m5-a1','campaign-m5-b','campaign-m5-c'].includes(entry), chapter5Fuel:['campaign-m5-b','campaign-m5-c'].includes(entry), chapter5Ending:entry==='campaign-m5-c', repairResources, systems:window.__lastHarborSystems,
        chapter5Trial:formalChapter5 && new URLSearchParams(location.search).get('start') === 'chapter5', chapter4Available:formalChapter4, chapter4Trial:formalChapter4 && new URLSearchParams(location.search).get('start') === 'chapter4',
        chapter3Trial:formalChapter3 && new URLSearchParams(location.search).get('start') === 'chapter3' })
    } catch(error) {
      repairResources?.dispose(); chapter4Assets?.dispose(); chapter3Resources?.dispose(); bank?.dispose(); asset?.dispose()
      document.getElementById('boot-msg').textContent = `章节加载失败：${error.message}`
      throw error
    }
  }
  if (entry === 'campaign-m3-a1') {
    try {
      const { installCampaignM3A1 } = await import('./campaign-m3-a1.mjs')
      window.__lastHarborCampaign = await installCampaignM3A1(g,equipment,{narrative:window.__lastHarborNarrative})
    } catch(error) {
      document.getElementById('boot-msg').textContent = `狙击手试玩加载失败：${error.message}`
      throw error
    }
  }
  if (entry === 'campaign-m3-a2') {
    try {
      const { installCampaignM3A2 } = await import('./campaign-m3-a2.mjs')
      window.__lastHarborCampaign = await installCampaignM3A2(g,equipment,{narrative:window.__lastHarborNarrative})
    } catch(error) {
      document.getElementById('boot-msg').textContent = `六号战斗加载失败：${error.message}`
      throw error
    }
  }
  if(['campaign-m5-a1','campaign-m5-b','campaign-m5-c'].includes(entry))window.__lastHarborCampaign.chapter5.battle.warmup()
  document.documentElement.classList.remove('harbor-loading')
  // The source's author CSS overrides the hidden attribute during its fade.
  // End our loading phase atomically so its mark cannot ghost over the title.
  const boot = document.getElementById('boot')
  boot.hidden = true; boot.style.display = 'none'
  const pendingStart = window.__lastHarborPendingStart
  delete window.__lastHarborPendingStart
  pendingStart?.()
}
