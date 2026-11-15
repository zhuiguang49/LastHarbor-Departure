import { M1_WORLD, buildM1BoundarySegments } from './campaign-layout.mjs'
import { createCampaignContainers } from './campaign-containers.mjs'
import { buildRobotWreck } from './aftermath-robots.mjs'
import { createAftermathDecals } from './aftermath-decals.mjs'
import { CH1 } from './campaign-ch1-layout.mjs'
import { buildCampaignWarehouse } from './campaign-warehouse.mjs'
import { buildChapter2Environment } from './campaign-ch2-environment.mjs'

const BATCH_SIZE = 40
// Three metres from each route centreline, plus the original capsule radius.
const ROUTE_CLEARANCE = 3 + .32

function cellSize(bounds) {
  const width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ
  return { width: width / Math.max(1, Math.round(width / BATCH_SIZE)),
    depth: depth / Math.max(1, Math.round(depth / BATCH_SIZE)) }
}

// Environment only. The integration owner mounts root, schedules updaters and
// pools lightSites. Physics/nav build() is deliberately left to that owner.
// All chunk roots have identity world transforms. Native factory resources and
// mats caches are borrowed; only merged/context geometry, instance buffers and
// the exact collider handles created here are disposed by this layer.
export function buildCampaignSectors(g, { chapter1 = false, chapter2 = false, chapter3 = false, chapter4 = false } = {}) {
  const T = g.THREE, root = new T.Group(), chunks = [], lightSites = [], landmarks = []
  root.name = 'campaign-m1-map-skeleton'
  const records = new Map(), borrowedGeometry = new Set(), ownedGeometry = new Set(), handles = []
  const ownedMaterials = new Set(), layers = [], interiorBoxes = []
  // Shared CH4/CH5 edges already have the original harbor perimeter; reuse it.
  const placements = [], boundaries = buildM1BoundarySegments().filter(segment => !segment.sectorIds.includes('berth-7'))
  const containers = createCampaignContainers(g)
  let disposed = false

  function chunkAt(sectorId, x, z) {
    const sector = M1_WORLD.sectors.find(item => item.id === sectorId)
    if (!sector || sectorId === 'berth-7') throw Error(`Invalid new campaign sector: ${sectorId}`)
    const cell = cellSize(sector.bounds)
    const column = Math.floor((x - sector.bounds.minX) / cell.width)
    const row = Math.floor((z - sector.bounds.minZ) / cell.depth)
    const id = `${sectorId}:${column}:${row}`
    if (!records.has(id)) {
      const bounds = { minX: sector.bounds.minX + column * cell.width,
        maxX: Math.min(sector.bounds.maxX, sector.bounds.minX + (column + 1) * cell.width),
        minZ: sector.bounds.minZ + row * cell.depth,
        maxZ: Math.min(sector.bounds.maxZ, sector.bounds.minZ + (row + 1) * cell.depth) }
      const group = new T.Group(), context = g.campaignFactories.context()
      group.name = `m1-chunk-${id}`
      root.add(group)
      const chunk = { id, bounds, root: group, updaters: context.updaters }
      chunks.push(chunk)
      records.set(id, { chunk, context, boxes: [], containerPlacements: [] })
    }
    return records.get(id)
  }

  function capture(record, operation) {
    const before = g.physics.boxes.length
    try { return operation() } finally {
      const added = g.physics.boxes.slice(before)
      record.boxes.push(...added)
      handles.push(...added)
    }
  }

  function place(sectorId, name, x, z, yaw = 0, options = {}, y = 0) {
    const record = chunkAt(sectorId, x, z)
    const object = capture(record, () => record.context.place(name, x, z, yaw, options, y))
    let meshCount = 0
    object.traverse(mesh => { if (mesh.isMesh) { borrowedGeometry.add(mesh.geometry); meshCount++ } })
    // Yg.build catches native builder failures and returns an unnamed box.
    // Kn.finish props (generator/forklift/pipe_stack) are intentionally unnamed;
    // every selected full factory has multiple material meshes, fallback has one.
    if (object.userData.prop !== name || meshCount < 2 || !object.userData.colliders?.length) {
      throw Error(`Campaign requires complete native ${name}; plain-box fallback rejected`)
    }
    placements.push({ sectorId, name, x, y, z, yaw, options: { ...options } })
    return object
  }

  function container(sectorId, x, z, yaw = 0, y = 0, variant = 0) {
    chunkAt(sectorId, x, z).containerPlacements.push({ x, y, z, yaw, variant })
  }

  function lenses(object) {
    const materials = new Map()
    object.traverse(mesh => {
      if (!mesh.isMesh) return
      const source = mesh.material
      if (!(source.isMeshBasicMaterial && !source.transparent) &&
        !(source.emissive && source.emissive.r + source.emissive.g + source.emissive.b > 0)) return
      if (!materials.has(source)) {
        const material = source.clone()
        material.defines = { ...source.defines }
        material.onBeforeCompile = source.onBeforeCompile
        material.customProgramCacheKey = source.customProgramCacheKey
        ownedMaterials.add(material)
        materials.set(source, { material, color: material.color.clone(), emissiveIntensity: material.emissiveIntensity })
      }
      mesh.material = materials.get(source).material
    })
    if (!materials.size) throw Error('CH1 fixture requires independent native lenses')
    return [...materials.values()]
  }

  function lightSite(object, sectorId, source, control) {
    const position = new T.Vector3(...source.pos).applyMatrix4(object.matrixWorld)
    const direction = new T.Vector3(...source.dir).transformDirection(object.matrixWorld)
    const target = position.clone().addScaledVector(direction, control?.circuit === 'battery' ? 5 : 16)
    const site = { position: { x: position.x, y: position.y, z: position.z },
      target: { x: target.x, y: target.y, z: target.z }, sectorId, color: source.color,
      intensity: 650, distance: 32, angle: .95, penumbra: .65, decay: 1.5 }
    if (control) {
      Object.assign(site, control, { lenses: lenses(object), intensity: control.circuit === 'battery' ? control.peak : 0 })
      if (control.circuit === 'battery') Object.assign(site, { distance: 13, angle: 1.05 })
      for (const lens of site.lenses) {
        if (lens.material.isMeshBasicMaterial) lens.material.color.copy(lens.color).multiplyScalar(control.circuit === 'battery' ? .14 : 0)
        else lens.material.emissiveIntensity = control.circuit === 'battery' ? lens.emissiveIntensity * .14 : 0
      }
    }
    lightSites.push(site)
    return site
  }

  function lamp(sectorId, x, z, yaw = 0, control) {
    const object = place(sectorId, 'light_mast', x, z, yaw, { seed: 0, on: sectorId !== 'blackbox-yard' })
    if (sectorId === 'blackbox-yard') return
    if (!object.userData.lamps?.length) throw Error('Native light_mast lamp metadata missing')
    // One pooled site per physical mast, located at a real source lamp. Other
    // source lenses remain geometry, just as in the original pooled M0 setup.
    const source = object.userData.lamps.find(lamp => Math.sign(lamp.dir[0]) === Math.sign(-x))
    if (!source) throw Error('Native inward-facing mast lamp missing')
    return lightSite(object, sectorId, source, control)
  }

  function label(sectorId, text, x, z, height = .3, y = .012, face = 'y+') {
    const { context } = chunkAt(sectorId, x, z)
    if (!context.label(text, height, x, y, z, face, { color: 'yellow', font: 'stencil', distress: .25 })) {
      throw Error('Native campaign route label unavailable')
    }
  }

  function buildBoundary(segment) {
    const dx = segment.to.x - segment.from.x, dz = segment.to.z - segment.from.z
    const length = Math.hypot(dx, dz)
    if (!length || dx && dz) throw Error('M1 perimeter requires axis-aligned nonempty segments')
    // Split at actual spatial cell edges, not arbitrary fractional segments.
    const sectorId = segment.sectorIds.find(id => id !== 'berth-7')
    const sector = M1_WORLD.sectors.find(item => item.id === sectorId)
    const cuts = [0, length]
    const axis = dx ? 'x' : 'z', low = Math.min(segment.from[axis], segment.to[axis])
    const high = Math.max(segment.from[axis], segment.to[axis])
    const origin = sector.bounds[dx ? 'minX' : 'minZ']
    const cell = cellSize(sector.bounds)
    for (let value = origin; value < high; value += dx ? cell.width : cell.depth) {
      if (value > low) cuts.push(Math.abs(value - segment.from[axis]))
    }
    cuts.sort((a, b) => a - b)
    for (let index = 1; index < cuts.length; index++) {
      const a = { x: segment.from.x + dx / length * cuts[index - 1], z: segment.from.z + dz / length * cuts[index - 1] }
      const b = { x: segment.from.x + dx / length * cuts[index], z: segment.from.z + dz / length * cuts[index] }
      // A transverse return at a mouth corner must put its entire thickness
      // outside that opening (not silently narrow the original six-metre exit).
      if (dx) {
        const mouth = M1_WORLD.links.find(link => link.bounds.minX >= Math.min(a.x, b.x) &&
          link.bounds.minX <= Math.max(a.x, b.x) && [link.bounds.minZ, link.bounds.maxZ].includes(a.z))
        if (mouth) {
          const offset = a.z === mouth.bounds.minZ ? -.16 : .16
          a.z += offset
          b.z += offset
        }
      }
      const midpoint = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
      // Boundary coordinates can lie on the maximum edge; use the interior cell.
      const record = chunkAt(sectorId, Math.min(midpoint.x, sector.bounds.maxX - .001), Math.min(midpoint.z, sector.bounds.maxZ - .001))
      const c = record.context, minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x)
      const minZ = Math.min(a.z, b.z), maxZ = Math.max(a.z, b.z)
      capture(record, () => {
        if (segment.kind === 'coast') {
          if (a.x !== 30 || b.x !== 30) throw Error('Campaign coast must remain at x=30')
          c.slab('concrete', 29.4, -4.2, minZ, 30, .028, maxZ)
          c.slab('steel_worn', 29.93, -.16, minZ, 30, .036, maxZ)
          c.col(29.4, -4.2, minZ, 30, .028, maxZ, 'concrete', { tag: 'campaign-quay' })
          for (const y of [.55, 1.05]) c.rod('steel_galv', [29.6, y, minZ], [29.6, y, maxZ], .024)
          c.col(29.56, .028, minZ, 29.64, 1.1, maxZ, 'metal', { tag: 'campaign-coast-rail' })
          for (let z = minZ; z <= maxZ; z += 3) c.rod('paint_yellow', [29.6, .028, z], [29.6, 1.1, z], .035)
        } else {
          const halfX = dx ? 0 : .16, halfZ = dz ? 0 : .16
          c.slab('concrete', minX - halfX, 0, minZ - halfZ, maxX + halfX, .3, maxZ + halfZ)
          c.slab(c.M('chainlink', { doubleSide: true }), minX - (dx ? 0 : .012), .3,
            minZ - (dz ? 0 : .012), maxX + (dx ? 0 : .012), 2.4, maxZ + (dz ? 0 : .012))
          c.rod('steel_galv', [a.x, 2.4, a.z], [b.x, 2.4, b.z], .035)
          for (let t = 0; t <= 1; t += 1 / Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3)) {
            c.rod('steel_galv', [a.x + (b.x - a.x) * t, .3, a.z + (b.z - a.z) * t],
              [a.x + (b.x - a.x) * t, 2.4, a.z + (b.z - a.z) * t], .035)
          }
          c.col(minX - halfX, 0, minZ - halfZ, maxX + halfX, .3, maxZ + halfZ, 'concrete', { tag: 'campaign-perimeter-base' })
          c.col(minX - halfX, .3, minZ - halfZ, maxX + halfX, 2.4, maxZ + halfZ, 'metal', { tag: 'campaign-perimeter' })
        }
      })
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    containers.dispose()
    for (const layer of layers) layer.dispose()
    for (const handle of handles) g.physics.removeBox(handle)
    handles.length = 0
    for (const geometry of ownedGeometry) geometry.dispose()
    ownedGeometry.clear()
    for (const material of ownedMaterials) material.dispose()
    ownedMaterials.clear()
    root.removeFromParent()
    root.clear()
    for (const { context, chunk } of records.values()) {
      context.staticRoot.clear()
      context.dynRoot.clear()
      chunk.root.clear()
      chunk.updaters.length = 0
    }
  }

  try {
    for (const boundary of boundaries) buildBoundary(boundary)
    // CH1: staffed-port geometry, closed booth and separate supply yard. No
    // pickup/relay registration, objectives or chapter state are installed.
    const booth = place('berth-5', 'guard_booth', -9, -323, 0, { seed: 0, on: true })
    const generator = chapter1 ? CH1.generator : [-25, 0, -307]
    const relay = chapter1 ? CH1.relay : [-22, 0, -307]
    place('berth-5', 'generator', generator[0], generator[2], 0, { seed: 0 })
    place('berth-5', 'relay_node', relay[0], relay[2], 0, { seed: 0, id: '05', state: 'cut' })
    place('berth-5', 'forklift', -37, -299, Math.PI / 2, { seed: 0 })
    if (chapter1) {
      // Double/triple banks form loading lanes and escape cover; the central
      // request/isolation area and every reserved patrol site remain open.
      for (const [x,z,yaw,tiers] of [
        [-44,-332,0,3], [-27,-332,0,2], [-55,-320,Math.PI/2,2],
        [-44,-309,Math.PI/2,2], [-28,-311,0,2], [-3,-303,Math.PI/2,2],
        [14,-287,0,3], [-33,-278,0,2], [-53,-273,0,2],
      ]) for (let tier = 0; tier < tiers; tier++) container('berth-5', x, z, yaw, tier * 2.59, tier % 3)
    } else {
      for (const x of [-43, -27, 14]) for (const z of [-333, -314, -277]) container('berth-5', x, z, 0, 0, x === 14 ? 1 : 0)
      for (const x of [-43, -27]) container('berth-5', x, -333, 0, 2.59, 2)
    }
    const yard = lamp('berth-5', -10, -312, 0, chapter1 ? { id: 'berth5-yard', circuit: 'healthy', peak: 1600, delay: 0 } : undefined)
    const exit = lamp('berth-5', -48, -279, chapter1 ? Math.PI : 0, chapter1 ? { id: 'berth5-exit', circuit: 'healthy', peak: 1600, delay: .5 } : undefined)
    if (chapter1) for (const site of [yard, exit]) Object.assign(site, { distance: 48, angle: 1.15, decay: 1.2 })
    label('berth-5', chapter1 ? '05 五号泊位 · 安保检查站' : '05 五号泊位 · M1 地图骨架 / 剧情未实现', 0, -324)
    label('berth-5', '黑箱堆场 ← 02', -25, -285)
    landmarks.push({ id: 'berth5-checkpoint', sectorId: 'berth-5', position: { x: -9, y: 0, z: -323 }, placeholder: !chapter1 },
      { id: 'berth5-power-site', sectorId: 'berth-5', position: chapter1 ?
        { x: CH1.power[0], y: CH1.power[1], z: CH1.power[2] } : { x: generator[0], y: 0, z: generator[2] }, placeholder: !chapter1 })
    if (chapter1) {
      const industrial = buildCampaignWarehouse(g), record = chunkAt('berth-5', 15, -328)
      layers.push(industrial)
      record.context.dynRoot.add(industrial.root)
      record.chunk.updaters.push(...industrial.updaters)
      interiorBoxes.push(...industrial.interiorBoxes)
      landmarks.push(...industrial.landmarks)
      for (const [index, fixture] of industrial.fixtures.entries()) {
        const position = fixture.position
        lightSites.push({ id: `berth5-warehouse-${index}`, sectorId: 'berth-5', circuit: 'healthy', delay: .2 + index * .12,
          position: { x: position.x, y: position.y, z: position.z }, target: { x: position.x, y: .03, z: position.z },
          color: fixture.color, peak: 140, intensity: 0, distance: 23, angle: 1.2, penumbra: .7, decay: 1.2,
          lenses: fixture.lenses })
      }
      const craneSite = lamp('berth-5', 12, -277, 0, { id: 'berth5-crane-apron', circuit: 'healthy', peak: 1600, delay: .4 })
      Object.assign(craneSite, { distance: 48, angle: 1.15, decay: 1.2 })
      craneSite.lenses.push(...lenses(industrial.craneRoot))
      // Battery guides participate in the integration-owned four-slot pool, never adding
      // permanent lights. The east-facing booth lockers remain unobstructed.
      for (const [id, x, z, yaw] of [
        ['berth5-booth-guide', -4.8, -321.8, Math.PI],
        ['berth5-power-guide', -33, -320.5, -Math.PI / 3],
      ]) {
        const fixture = place('berth-5', 'floodlight_stand', x, z, yaw, { seed: 5, on: true })
        const site = lightSite(fixture, 'berth-5', fixture.userData.lamps[0], { id, circuit: 'battery', peak: 32 })
        if (id === 'berth5-booth-guide') site.lenses.push(...lenses(booth))
      }
      lamp('berth-5', 12, -303, 0, { id: 'berth5-damaged', circuit: 'damaged', peak: 0 })
      place('berth-5', 'jersey_barrier', -5.5, -311.5, 0, { seed: 51 })
      place('berth-5', 'toolbox_cart', -40.8, -317, .2, { seed: 52 })
      place('berth-5', 'jersey_barrier', -20, -297, .1, { seed: 53 })
      place('berth-5', 'jersey_barrier', 6, -316, 0, { seed: 54 })
      label('berth-5', '五号应急电源 / 健康回路', -34, -316.5, .16)
      label('berth-5', '仓库器材与补给 →', 8, -316.5, .2)
      label('berth-5', '05 五号仓库 / 维修与装备', 12.5, -319.93, .24, 5.5, 'z+')
      label('berth-5', '东侧支路烧损 · 禁止合闸', 10, -300, .16)
      for (const [kind, x, z, yaw] of [['hound', -14.5, -313.5, -.3], ['gull', -29, -302.5, .54]]) {
        const wreck = buildRobotWreck(g, kind), record = chunkAt('berth-5', x, z)
        layers.push(wreck)
        wreck.group.position.set(x, .004, z); wreck.group.rotation.y = yaw
        record.context.dynRoot.add(wreck.group)
        wreck.group.updateMatrixWorld(true)
        const bounds = new T.Box3().setFromObject(wreck.group)
        capture(record, () => record.context.col(bounds.min.x, .004, bounds.min.z,
          bounds.max.x, Math.min(.5, bounds.max.y), bounds.max.z, 'metal', { tag: `campaign-berth5-${kind}-wreck` }))
        landmarks.push({ id: `berth5-${kind}-wreck`, sectorId: 'berth-5', position: { x, y: .004, z }, placeholder: false, static: true })
      }
      const marks = [
        { id: 'berth5-hound-burn', kind: 'scorch', position: [-14.5,.008,-313.5], size: [1.5,1.1] },
        { id: 'berth5-gull-skid', kind: 'scorch', position: [-29,.008,-302.5], size: [1.3,.85] },
        { id: 'berth5-power-scorch', kind: 'scorch', position: [relay[0]+.2,.008,relay[2]-.6], size: [.85,.7] },
      ]
      booth.updateMatrixWorld(true)
      for (let i = 0; i < 3; i++) {
        const ray = new T.Raycaster(new T.Vector3(-6.8,.4+i*.12,-323.8+i*.35), new T.Vector3(-1,0,0), 0, 2)
        const hit = ray.intersectObject(booth, true).find(hit => hit.face)
        if (!hit) throw Error('CH1 battle mark requires an actual booth surface')
        const normal = hit.face.normal.clone().applyNormalMatrix(new T.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize()
        marks.push({ id: `berth5-booth-impact-${i}`, kind: 'impact', position: hit.point.clone().addScaledVector(normal,.001).toArray(), normal: normal.toArray(), size: [.13,.13] })
      }
      const decals = createAftermathDecals(g, marks)
      layers.push(decals)
      chunkAt('berth-5', -14.5, -313.5).context.dynRoot.add(decals.root)
      const c = chunkAt('berth-5', -9, -323).context
      c.decal('grime_streak', .55, -7.723, .38, -323.55, 'x+')
      c.decal('rust_run', .25, -7.723, .7, -322.35, 'x+')
    }

    if (chapter2) {
      const blackbox = buildChapter2Environment(g)
      layers.push(blackbox)
      root.add(blackbox.root)
      chunks.push(...blackbox.chunks)
      lightSites.push(...blackbox.lightSites)
      landmarks.push(...blackbox.landmarks)
      interiorBoxes.push(...blackbox.interiorBoxes)
    } else {
      // CH2: a closed eastern storage island forces the U-shaped main route.
      // The western double-height bank separates the connected side branch.
      for (const z of [-275, -200]) for (let i = 0; i < 4; i++) {
        container('blackbox-yard', -66.1 - i * 12.19, z, 0, 0, 2)
        container('blackbox-yard', -66.1 - i * 12.19, z, 0, 2.59, 0)
      }
      for (let i = 0; i < 6; i++) container('blackbox-yard', -110.1, -268.5 + i * 12.19, Math.PI / 2, 0, 2)
      for (let i = 0; i < 3; i++) for (const y of [0, 2.59]) {
        container('blackbox-yard', -134, -249.69 + i * 12.19, Math.PI / 2, y, y ? 0 : 2)
      }
      for (const z of [-283, -253, -228, -198]) {
        container('blackbox-yard', -156, z, Math.PI / 2, 0, 2)
        container('blackbox-yard', -156, z, Math.PI / 2, 2.59, 0)
      }
      // Extinguish native mast lenses via the source on:false option. No CH2 sites.
      lamp('blackbox-yard', -124, -295)
      label('blackbox-yard', '02 黑箱堆场 · M1 / 无常规照明', -100, -285)
      label('blackbox-yard', '维护支路 ← → 主货道', -133, -265)
      label('blackbox-yard', '06 六号泊位 →', -91, -190)
    }

    if (chapter3) {
      const berth6 = g.campaignAssets.buildChapter3Environment(g, { assets: g.campaignAssets.chapter3 })
      layers.push(berth6)
      root.add(berth6.root)
      chunks.push(...berth6.chunks)
      lightSites.push(...berth6.lightSites)
      landmarks.push(...berth6.landmarks)
      interiorBoxes.push(...berth6.interiorBoxes)
    } else {
      // CH3: original stairs/catwalks on a braced steel frame, without a roof or
      // interior claim. The closed safe-house shell is a complete native container.
      container('berth-6', -43, -142, 0, 0, 0)
      container('berth-6', -43, -144.5, 0, 0, 2)
      place('berth-6', 'guard_booth', -49, -138, Math.PI, { seed: 0, on: false })
      for (const z of [-199, -176, -146, -115]) container('berth-6', 20, z, 0, 0, 1)
      for (const z of [-171, -124]) container('berth-6', -46, z, 0, 0, 2)
      place('berth-6', 'stairs_metal', 5, -154, 0)
      place('berth-6', 'catwalk', 8, -154, 0, { rails: 'both' }, 2.55)
      place('berth-6', 'stairs_metal', 11, -152, Math.PI, {}, 2.6)
      for (const z of [-152, -153.2, -154.4]) place('berth-6', 'catwalk', 8, z, 0, { rails: z === -152 ? 'left' : z === -154.4 ? 'right' : 'none' }, 5.15)
      const tower = chunkAt('berth-6', 8, -154)
      capture(tower, () => {
        for (const x of [6.5, 9.5]) for (const z of [-151.4, -155]) {
          tower.context.ibeam('steel_dark', 'y', 5.2, x, 2.6, z, { depth: .24, width: .2 })
          tower.context.col(x - .12, 0, z - .12, x + .12, 5.2, z + .12, 'metal', { tag: 'campaign-tower' })
        }
        for (const z of [-151.4, -155]) {
          tower.context.rod('steel_galv', [6.5, .2, z], [9.5, 5.1, z], .045)
          tower.context.rod('steel_galv', [9.5, .2, z], [6.5, 5.1, z], .045)
        }
        tower.context.slab('paint_grey', 6.8, 4.15, -155.04, 9.2, 4.65, -155)
        tower.context.col(6.8, 4.15, -155.04, 9.2, 4.65, -155, 'metal', { tag: 'campaign-tower-sign' })
      })
      label('berth-6', '瞭望塔 / M1 环境占位', 8, -155.045, .22, 4.4, 'z-')
      label('berth-6', '安全屋 / M1 封闭占位', -43, -140.77, .24, 1.5, 'z+')
      label('berth-6', '06 六号泊位 · M1 地图骨架', -20, -166)
      label('berth-6', '封锁控制通路 ← 04', -37, -110)
      landmarks.push({ id: 'berth6-sniper-tower', sectorId: 'berth-6', position: { x: 8, y: 5.2, z: -154 }, placeholder: true },
        { id: 'berth6-safe-house', sectorId: 'berth-6', position: { x: -43, y: 0, z: -142 }, placeholder: true, closedShell: true })
      lamp('berth-6', -32, -164)
      lamp('berth-6', 14, -130)
    }
    for (const sector of M1_WORLD.sectors.filter(item => ['berth-5', 'berth-6'].includes(item.id))) {
      for (let z = sector.bounds.minZ + 8; z < sector.bounds.maxZ - 3; z += 16) {
        if (chapter1 && sector.id === 'berth-5' && z >= CH1.warehouse.bounds.minZ && z <= CH1.warehouse.bounds.maxZ) continue
        place(sector.id, 'bollard_mooring', 28.5, z, 0, { seed: 0 })
      }
    }

    if (chapter4) {
      const control = g.campaignAssets.buildChapter4Environment(g, { assets: g.campaignAssets.chapter4 })
      layers.push(control)
      root.add(control.root)
      chunks.push(...control.chunks)
      lightSites.push(...control.lightSites)
      landmarks.push(...control.landmarks)
    } else {
      // CH4: open-air L corridor, working physical perimeter, optional western
      // cover lane; the relay is scenery, never a mission/controller replacement.
      for (const z of [-90, -74, -58, -42]) place('blockade-control', 'jersey_barrier', -70, z, Math.PI / 2, { seed: 0 })
      place('blockade-control', 'relay_node', -76, -16, Math.PI / 2, { seed: 0, id: '04', state: 'cut' })
      place('blockade-control', 'pipe_stack', -78, -64, Math.PI / 2, { seed: 0 })
      lamp('blockade-control', -77, -12)
      label('blockade-control', '04 封锁控制通路 · M1 开放通行', -64, -96, .22)
      label('blockade-control', '07 七号泊位 →', -51, 4.5, .22)
      landmarks.push({ id: 'blockade-control-cabinet', sectorId: 'blockade-control', position: { x: -76, y: 0, z: -16 }, placeholder: true })
    }

    for (const { chunk, context, containerPlacements } of records.values()) {
      context.staticRoot.traverse(mesh => {
        if (mesh.isMesh && !borrowedGeometry.has(mesh.geometry)) ownedGeometry.add(mesh.geometry)
      })
      const merged = g.campaignFactories.merge(context.staticRoot)
      merged.traverse(mesh => {
        if (mesh.isMesh && !borrowedGeometry.has(mesh.geometry)) ownedGeometry.add(mesh.geometry)
      })
      chunk.root.add(merged, context.dynRoot)
      if (containerPlacements.length) chunk.root.add(containers.createInstances({ id: chunk.id, placements: containerPlacements }).root)
      // Expose bounds covering full assets at cell edges, for correct culling.
      chunk.root.updateMatrixWorld(true)
      const visual = new T.Box3()
      chunk.root.traverse(mesh => {
        if (!mesh.isMesh) return
        // setFromObject would compute bounding boxes on borrowed noMerge
        // factory geometry. Derive our own bounds without mutating that cache.
        const bounds = mesh.isInstancedMesh ? mesh.boundingBox.clone() :
          new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position)
        visual.union(bounds.applyMatrix4(mesh.matrixWorld))
      })
      chunk.bounds = { minX: Math.min(chunk.bounds.minX, visual.min.x), maxX: Math.max(chunk.bounds.maxX, visual.max.x),
        minZ: Math.min(chunk.bounds.minZ, visual.min.z), maxZ: Math.max(chunk.bounds.maxZ, visual.max.z) }
    }
  } catch (error) {
    // Context geometry created before a failed native placement is owned too.
    for (const { context } of records.values()) context.staticRoot.traverse(mesh => {
      if (mesh.isMesh && !borrowedGeometry.has(mesh.geometry)) ownedGeometry.add(mesh.geometry)
    })
    dispose()
    throw error
  }

  return { root, chunks, lightSites, landmarks, ...(chapter4 ? {chapter4Gate:layers.find(layer=>layer.gate).gate} : {}), ...(chapter1 ? { interiorBoxes } : {}),
    snapshot: () => ({ stage: chapter4 ? 'M4-A0' : chapter3 ? 'M3-A0' : chapter2 ? 'M2-B0.5' : chapter1 ? 'M2-A' : 'M1', storyImplemented: false, disposed, batchSize: BATCH_SIZE,
      routeClearance: chapter1 ? .32 : ROUTE_CLEARANCE, chunkCount: disposed ? 0 : chunks.length,
      chunks: chunks.map(chunk => ({ id: chunk.id, bounds: { ...chunk.bounds }, visible: chunk.root.visible,
        updaterCount: chunk.updaters.length })), containers: containers.snapshot(),
      nativePlacements: placements.map(item => ({ ...item, options: { ...item.options } })),
      boundaries: boundaries.map(item => ({ ...item, from: { ...item.from }, to: { ...item.to }, sectorIds: [...item.sectorIds] })),
      lightSiteCount: disposed ? 0 : lightSites.length, landmarks: structuredClone(landmarks),
      colliderCount: disposed ? 0 : handles.length + containers.snapshot().containerCount +
        layers.reduce((count, layer) => count + (layer.snapshot().colliderCount || 0), 0),
      ...(chapter1 ? { environment: layers.map(layer => layer.snapshot()), ownedMaterialCount: ownedMaterials.size } : {}),
      ownership: { borrowed: 'native factory geometry/material/texture; mats caches',
        owned: 'context/merged geometry, instance buffers, collider handles', ownedGeometryCount: ownedGeometry.size } }),
    dispose,
  }
}
