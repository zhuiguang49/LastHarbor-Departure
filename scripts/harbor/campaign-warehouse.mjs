import { CH1 } from './campaign-ch1-layout.mjs'

// Complete native buildings in a private context. Only this context's generated
// geometry and exact physics handles are owned; prop caches and mats are borrowed.
export function buildCampaignWarehouse(g) {
  const T = g.THREE, root = new T.Group(), context = g.campaignFactories.context()
  const offset = new T.Vector3(...CH1.warehouse.offset), craneOffset = new T.Vector3(0, 0, -280)
  const borrowed = new Set(), geometry = new Set(), materials = new Set(), handles = [], relocated = []
  const fixtures = [], placed = [], place = context.place
  let disposed = false, warehouse, crane
  root.name = 'campaign-berth5-native-industrial'
  context.place = (name, x, z, yaw = 0, options = {}, y = 0, extra = {}) => {
    // Keep the back/east equipment aisle and its three wall lockers accessible.
    // Relocate these original racks into the western half of the second row.
    if (name === 'shelf_rack' && z < -27 && x > 0) {
      relocated.push({ name, from: [x, y, z], to: [x - 11.2, y, -23.45] })
      x -= 11.2; z = -23.45
    }
    const object = place(name, x, z, yaw, options, y, extra)
    let triangles = 0
    object.traverse(mesh => { if (mesh.isMesh) {
      borrowed.add(mesh.geometry)
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3
    } })
    // Some complete props (sandbags) intentionally use a single material mesh.
    if (object.userData.prop !== name || triangles <= 12) throw Error(`Warehouse requires complete native ${name}`)
    return object
  }
  function borrowProps(object) {
    // ob.stairs/catwalk use their captured native place(), bypassing the public
    // context.place wrapper. Their cached geometry is borrowed too.
    object.traverse(mesh => {
      if (!mesh.isMesh) return
      for (let parent = mesh; parent && parent !== object; parent = parent.parent) {
        if (parent.userData.prop) { borrowed.add(mesh.geometry); break }
      }
    })
  }
  const ownGeometry = object => object.traverse(mesh => {
    if (mesh.isMesh && !borrowed.has(mesh.geometry)) geometry.add(mesh.geometry)
  })
  function dispose() {
    if (disposed) return
    disposed = true
    for (const handle of handles) g.physics.removeBox(handle)
    handles.length = 0
    for (const item of geometry) item.dispose()
    geometry.clear()
    for (const material of materials) material.dispose()
    materials.clear()
    context.updaters.length = 0
    root.removeFromParent(); root.clear()
    context.staticRoot.clear(); context.dynRoot.clear()
  }
  try {
    const before = g.physics.boxes.length
    try { warehouse = g.campaignFactories.warehouse(context) } finally {
      handles.push(...g.physics.boxes.slice(before))
      borrowProps(context.staticRoot); borrowProps(context.dynRoot)
      ownGeometry(context.staticRoot); ownGeometry(context.dynRoot)
    }
    if (!warehouse?.fan || warehouse.lights?.length !== 4 || !warehouse.skylights?.length) {
      throw Error('Complete native warehouse and fixture metadata required')
    }
    placed.push(...context.placed.map(prop => ({ ...prop,
      x: prop.x + offset.x, y: prop.y + offset.y, z: prop.z + offset.z })))
    for (const handle of handles) {
      handle.min.add(offset); handle.max.add(offset)
      handle.tag = 'campaign-berth5-warehouse'
    }
    // ab() creates four native point lights. Their positions become pooled sites;
    // the fixtures remain original meshes. No permanent light enters the scene.
    for (const light of warehouse.lights) {
      fixtures.push({ position: light.position.clone().add(offset), color: light.color.getHex(),
        sourceIntensity: light.intensity, sourceDistance: light.distance, lenses: [] })
      light.removeFromParent()
    }
    const lensMaterials = fixtures.map(() => new Map())
    function cloneLenses(object) {
      object.updateMatrixWorld(true)
      object.traverse(mesh => {
        if (!mesh.isMesh) return
        const source = mesh.material
        if (!(source.isMeshBasicMaterial && !source.transparent) &&
          !(source.emissive && source.emissive.r + source.emissive.g + source.emissive.b > 0)) return
        const position = mesh.getWorldPosition(new T.Vector3()).add(offset)
        const index = fixtures.map((site, index) => ({ index, distance: site.position.distanceToSquared(position) }))
          .sort((a,b) => a.distance - b.distance)[0].index
        const cache = lensMaterials[index]
        if (!cache.has(source)) {
          const material = source.clone()
          material.defines = { ...source.defines }
          material.onBeforeCompile = source.onBeforeCompile
          material.customProgramCacheKey = source.customProgramCacheKey
          const lens = { material, color: material.color.clone(), emissiveIntensity: material.emissiveIntensity }
          cache.set(source, lens); materials.add(material); fixtures[index].lenses.push(lens)
          if (material.isMeshBasicMaterial) material.color.setRGB(0, 0, 0)
          else material.emissiveIntensity = 0
        }
        mesh.material = cache.get(source).material
      })
    }
    cloneLenses(context.staticRoot); cloneLenses(context.dynRoot)
    context.staticRoot.position.copy(offset); context.dynRoot.position.copy(offset)
    context.staticRoot.updateMatrixWorld(true)
    const merged = g.campaignFactories.merge(context.staticRoot)
    ownGeometry(merged)
    root.add(merged, context.dynRoot)
    context.updaters.push(dt => warehouse.update(dt))

    // z1() supplies the original high-detail crane, spreader/container and exact
    // leg/wheel colliders. Its small navigation lamps are emissive geometry only.
    const markers = new T.Group()
    crane = g.campaignFactories.crane({ add(shape, color) {
      const source = g.mats.emissive(0xffffff, 1), material = source.clone()
      material.defines = { ...source.defines }
      material.onBeforeCompile = source.onBeforeCompile
      material.customProgramCacheKey = source.customProgramCacheKey
      material.color.setRGB(...color)
      materials.add(material); geometry.add(shape)
      markers.add(new T.Mesh(shape, material))
    } })
    if (!crane?.root || !crane.spreader || !crane.colliders?.length || crane.tris < 10000) {
      throw Error('Complete native quay crane required')
    }
    ownGeometry(crane.root)
    crane.root.add(markers); crane.root.position.copy(craneOffset)
    root.add(crane.root)
    for (const box of crane.colliders) {
      const min = new T.Vector3(...box.min).add(craneOffset), max = new T.Vector3(...box.max).add(craneOffset)
      handles.push(g.physics.addBox(min, max, { ...box, surface: 'metal', tag: 'campaign-berth5-crane' }))
    }
    let craneTime = 0
    context.updaters.push(dt => {
      craneTime += dt
      crane.spreader.rotation.x = .012 * Math.sin(craneTime * .52) + .004 * Math.sin(craneTime * 1.31 + 1)
      crane.spreader.rotation.z = .009 * Math.sin(craneTime * .41 + 1.1)
    })
    root.updateMatrixWorld(true)
  } catch (error) { dispose(); throw error }

  const interiorBoxes = [{ min: new T.Vector3(CH1.warehouse.bounds.minX, 0, CH1.warehouse.bounds.minZ),
    max: new T.Vector3(CH1.warehouse.bounds.maxX, 9.5, CH1.warehouse.bounds.maxZ) }]
  const entrances = [
    { id: 'north-loading-door', min: [11, .03, -320.6], max: [16, 4.5, -318.6] },
    { id: 'east-loading-door', min: [28.75, .03, -331], max: [30.4, 4.5, -326] },
  ]
  const skylights = warehouse.skylights.map(site => ({ ...site, x: site.x + offset.x, y: site.y + offset.y, z: site.z + offset.z }))
  const bounds = new T.Box3()
  root.traverse(mesh => {
    if (mesh.isMesh) bounds.union(new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position).applyMatrix4(mesh.matrixWorld))
  })
  const landmarks = [
    { id: 'berth5-warehouse', sectorId: 'berth-5', position: { x: 15, y: 0, z: -328.5 }, placeholder: false,
      source: 'native-ab', bounds: { ...CH1.warehouse.bounds }, eave: 7, ridge: 9.5,
      entrances, furnishingCount: placed.length, shelfRackCount: placed.filter(p => p.name === 'shelf_rack').length,
      skylights, fixtureCount: fixtures.length },
    { id: 'berth5-quay-crane', sectorId: 'berth-5', position: { x: 23.5, y: 0, z: -280 }, placeholder: false,
      source: 'native-z1', triangles: crane.tris, colliderCount: crane.colliders.length,
      spreader: true, seaOverhang: true, offset: craneOffset.toArray() },
  ]
  return { root, fixtures, interiorBoxes, landmarks, updaters: context.updaters,
    craneRoot: crane.root,
    snapshot: () => ({ source: 'native-ab/z1', disposed,
      colliderCount: disposed ? 0 : handles.length, permanentLights: 0,
      bounds: { min: [...bounds.min.toArray()], max: [...bounds.max.toArray()] },
      interiorBoxes: interiorBoxes.map(box => ({ min: [...box.min.toArray()], max: [...box.max.toArray()] })),
      entrances: structuredClone(entrances), relocated: structuredClone(relocated), placed: structuredClone(placed),
      fixtures: fixtures.map(site => ({ position: site.position.toArray(), color: site.color,
        sourceIntensity: site.sourceIntensity, sourceDistance: site.sourceDistance })),
      ownedGeometryCount: geometry.size, ownedMaterialCount: materials.size }),
    dispose,
  }
}
