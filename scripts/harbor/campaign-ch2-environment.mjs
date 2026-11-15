import { installChapter2Obstacles } from './campaign-ch2-obstacles.mjs'
import { CH2, CH2_CONTAINERS, CH2_SAFE_ZONES, CH2_OBSTACLES, getChapter2Colliders, getChapter2Interiors } from './campaign-ch2-layout.mjs'

// Integration: replace the old CH2 placements, retain M1 perimeter/ground, mount
// root once and append chunks/lightSites/interiorBoxes to the native registries.
// Caller batches physics.build() after install/dispose. No loop, lights, actors,
// supply state, checkpoint state or mutations of cached factory assets live here.
export function buildChapter2Environment(g) {
  const T = g.THREE, root = new T.Group(), chunks = [], lightSites = [], landmarks = []
  const records = new Map(), templates = new Map(), batches = [], handles = []
  const ownedGeometry = new Set(), ownedMaterials = new Set(), borrowedGeometry = new Set()
  const colliders = getChapter2Colliders(), interiors = getChapter2Interiors()
  let disposed = false, removedRearTriangles = 0, obstacles = []
  root.name = 'campaign-ch2-blackbox-yard'

  function recordAt(x,z) {
    const column = Math.floor((x-CH2.bounds.minX)/40), row = Math.floor((z-CH2.bounds.minZ)/40)
    const id = `ch2:${column}:${row}`
    if (!records.has(id)) {
      const group = new T.Group(), context = g.campaignFactories.context()
      group.name = id
      const chunk = { id, sectorId: CH2.sectorId, root: group, updaters: [], bounds: {} }
      chunks.push(chunk); root.add(group)
      records.set(id, { chunk, context, placements: [] })
    }
    return records.get(id)
  }

  function ownContext(context) {
    for (const group of [context.staticRoot,context.dynRoot]) group.traverse(mesh => {
      if (mesh.isMesh && !borrowedGeometry.has(mesh.geometry)) ownedGeometry.add(mesh.geometry)
    })
  }

  // Remove zA's corrugated rear panel and its separate inward-facing rear liner,
  // retaining castings, headers, sills, doors, sides and ceiling lining.
  // Work on an owned geometry clone; no cached buffer or source mesh is edited.
  function openRear(geometry, length) {
    const position = geometry.attributes.position, index = geometry.index, keep = []
    const count = index?.count ?? position.count
    let removed = 0
    for (let triangle = 0; triangle<count; triangle+=3) {
      const vertices = [0,1,2].map(offset => index ? index.getX(triangle+offset) : triangle+offset)
      // zA's rear corrugation spans -p+.014 through -p+.056, not one plane.
      // Include the recessed flats and slopes without cutting the end frame.
      const rear = vertices.every(vertex => position.getX(vertex)>=-length/2+.0139 &&
        position.getX(vertex)<=-length/2+.0561 && Math.abs(position.getZ(vertex))<=1.0651 &&
        position.getY(vertex)>=.1669 && position.getY(vertex)<=2.5301)
      // Native zA places the interior rear plane at v+.03 = -length/2+.115.
      // Cutting the outer corrugation alone leaves a visible wall with no body.
      const liner = vertices.every(vertex => Math.abs(position.getX(vertex)+length/2-.115)<.00001 &&
        Math.abs(position.getZ(vertex))<=1.209 && position.getY(vertex)>=.1719 && position.getY(vertex)<=2.5301)
      if (rear || liner) removed++
      else keep.push(...vertices)
    }
    if (!removed) return geometry
    removedRearTriangles += removed
    const copy = geometry.clone()
    copy.setIndex(keep); copy.clearGroups()
    ownedGeometry.add(copy)
    return copy
  }

  function templateFor(item) {
    const key = `${item.name}:${item.variant}:${item.open}`
    if (templates.has(key)) return templates.get(key)
    const options = {seed:0,color:['teal','orange','grey'][item.variant],wear:.5,doors:item.open?1:0}
    const source = g.props.build(item.name,options), parts=[]
    if (source.name!==item.name || source.userData.color!==options.color || source.userData.doors!==options.doors) {
      throw Error(`CH2 requires the complete native ${item.name} factory`)
    }
    source.updateMatrixWorld(true)
    const before = removedRearTriangles
    source.traverse(mesh => {
      if (!mesh.isMesh) return
      borrowedGeometry.add(mesh.geometry)
      const geometry = item.open ? openRear(mesh.geometry,item.name==='container40'?12.19:6.06) : mesh.geometry
      parts.push({geometry,material:mesh.material,matrix:mesh.matrixWorld.clone(),
        bounds:new T.Box3().setFromBufferAttribute(geometry.attributes.position),
        castShadow:mesh.castShadow,receiveShadow:mesh.receiveShadow,layers:mesh.layers.mask,renderOrder:mesh.renderOrder})
    })
    if (parts.length<2 || item.open && removedRearTriangles===before) throw Error('CH2 open container rear panel was not found')
    const template = {key,parts,options}
    templates.set(key,template)
    return template
  }

  function capture(operation) {
    const before = g.physics.boxes.length
    try { return operation() } finally {
      for(const handle of g.physics.boxes.slice(before)) {
        handles.push(handle)
        colliders.push({id:`ch2.fixture:${handles.length}`,part:'battery',min:handle.min.toArray(),max:handle.max.toArray(),surface:handle.surface,tag:handle.tag,
          noNav:handle.noNav,playerOnly:handle.playerOnly,bulletOnly:handle.bulletOnly})
      }
    }
  }

  function battery(zone) {
    const record = recordAt(zone.x,zone.z), c = record.context
    // The complete tripod stands beside the entrance, outside its clear aisle.
    const x = zone.x-(zone.yaw?1.8:5.5), z = zone.z-(zone.yaw?6.5:1.5)
    const yaw = -Math.atan2(zone.z-z,zone.x-x)
    const fixture = capture(()=>c.place('floodlight_stand',x,z,yaw,{seed:5,on:true}))
    fixture.traverse(mesh=>{if(mesh.isMesh) borrowedGeometry.add(mesh.geometry)})
    if (!fixture.userData.lamps?.length) throw Error('CH2 battery requires complete native floodlight_stand')
    const lenses=[], clones=new Map()
    fixture.traverse(mesh=>{
      if (!mesh.isMesh) return
      const source=mesh.material
      if (!(source.isMeshBasicMaterial && !source.transparent) &&
        !(source.emissive && source.emissive.r+source.emissive.g+source.emissive.b>0)) return
      if (!clones.has(source)) {
        const material=source.clone()
        material.defines={...source.defines}; material.onBeforeCompile=source.onBeforeCompile
        material.customProgramCacheKey=source.customProgramCacheKey
        ownedMaterials.add(material); clones.set(source,material)
        lenses.push({material,color:material.color.clone(),emissiveIntensity:material.emissiveIntensity})
        if (material.isMeshBasicMaterial) material.color.multiplyScalar(.12)
        else material.emissiveIntensity*=.12
      }
      mesh.material=clones.get(source)
    })
    const lamp=fixture.userData.lamps[0], position=new T.Vector3(...lamp.pos).applyMatrix4(fixture.matrixWorld)
    const direction=new T.Vector3(...lamp.dir).transformDirection(fixture.matrixWorld)
    const target=position.clone().addScaledVector(direction,4)
    lightSites.push({id:`${zone.id}.battery`,sectorId:CH2.sectorId,circuit:'battery',peak:12,intensity:12,
      position:{x:position.x,y:position.y,z:position.z},target:{x:target.x,y:target.y,z:target.z},
      color:lamp.color,distance:9,angle:1.05,penumbra:.7,decay:1.5,lenses})
    const label = zone.yaw ? [zone.x-1.145,1.75,zone.z,'x+'] : [zone.x,1.75,zone.z-1.145,'z+']
    if (!c.label(`${zone.name} / 独立电池`,.14,...label,{color:'white',font:'stencil',distress:.2})) {
      throw Error('Native CH2 room label unavailable')
    }
  }

  function dispose() {
    if (disposed) return
    disposed=true
    for (const handle of handles) g.physics.removeBox(handle)
    handles.length=0
    for (const batch of batches) batch.dispose()
    for (const geometry of ownedGeometry) geometry.dispose()
    ownedGeometry.clear()
    for (const material of ownedMaterials) material.dispose()
    ownedMaterials.clear()
    for (const {context,chunk} of records.values()) {
      context.staticRoot.clear(); context.dynRoot.clear(); context.updaters.length=0
      chunk.updaters.length=0; chunk.root.clear()
    }
    root.removeFromParent(); root.clear()
  }

  try {
    for (const item of CH2_CONTAINERS) {
      const template=templateFor(item)
      recordAt(item.x,item.z).placements.push({item,template})
    }
    for (const box of colliders) handles.push(g.physics.addBox(box.min,box.max,{surface:box.surface,tag:box.tag}))
    for (const zone of CH2_SAFE_ZONES) battery(zone)
    obstacles=installChapter2Obstacles(g,CH2_OBSTACLES,{recordAt,ownedGeometry,ownedMaterials,borrowedGeometry,colliders,handles,batches})
    // Stencilled route cues are physical native decal geometry; no HUD markers.
    for (const [x,z,text] of [[-68,-285.5,'02 黑箱 / 回声货道'],[-74.5,-290.5,'叉车封路 / 向南绕行 ↓'],
      [-106,-275.7,'货堆盲角 / 向北绕行 ↑'],[-121,-259,'维护支路 ←'],
      [-118,-219,'六号 →'],[-73,-190.5,'06 隔离室 →']]) {
      const c=recordAt(x,z).context
      if (!c.label(text,.2,x,.014,z,'y+',{color:'yellow',font:'stencil',distress:.3})) throw Error('Native CH2 route label unavailable')
    }
    for (const {chunk,context,placements} of records.values()) {
      const parts=new Map()
      for (const {item,template} of placements) {
        const transform=new T.Matrix4().compose(new T.Vector3(item.x,item.y,item.z),
          new T.Quaternion().setFromEuler(new T.Euler(0,item.yaw,item.roll,'YXZ')),new T.Vector3(1,1,1))
        for (const part of template.parts) {
          const key=`${part.geometry.id}:${part.material.id}`
          if (!parts.has(key)) parts.set(key,{part,transforms:[]})
          parts.get(key).transforms.push(transform.clone().multiply(part.matrix))
        }
      }
      for (const {part,transforms} of parts.values()) {
        const batch=new T.InstancedMesh(part.geometry,part.material,transforms.length)
        batches.push(batch)
        batch.name=`ch2-${part.material.name}`
        batch.castShadow=part.castShadow; batch.receiveShadow=part.receiveShadow
        batch.layers.mask=part.layers; batch.renderOrder=part.renderOrder
        batch.boundingBox=new T.Box3()
        for (let index=0;index<transforms.length;index++) {
          const matrix=transforms[index]
          batch.setMatrixAt(index,matrix)
          batch.boundingBox.union(part.bounds.clone().applyMatrix4(matrix))
        }
        batch.instanceMatrix.needsUpdate=true
        batch.boundingSphere=batch.boundingBox.getBoundingSphere(new T.Sphere())
        chunk.root.add(batch)
      }
      ownContext(context)
      const merged=g.campaignFactories.merge(context.staticRoot)
      merged.traverse(mesh=>{if(mesh.isMesh && !borrowedGeometry.has(mesh.geometry)) ownedGeometry.add(mesh.geometry)})
      chunk.root.add(merged,context.dynRoot)
      chunk.updaters.push(...context.updaters)
      chunk.root.updateMatrixWorld(true)
      const bounds=new T.Box3()
      chunk.root.traverse(mesh=>{
        if (!mesh.isMesh) return
        const box=mesh.isInstancedMesh ? mesh.boundingBox.clone() : new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position)
        bounds.union(box.applyMatrix4(mesh.matrixWorld))
      })
      chunk.bounds={minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z}
    }
    for (const item of CH2_CONTAINERS.filter(item=>item.open || item.roll || item.id==='s3-bridge')) {
      const zone=CH2_SAFE_ZONES.find(zone=>zone.shellId===item.id)
      landmarks.push({id:item.id,sectorId:CH2.sectorId,position:{x:item.x,y:item.y,z:item.z},
        source:`native-${item.name}`,placeholder:false,walkThrough:item.open,safeZoneId:item.safeZoneId,
        ...(zone?{entrances:structuredClone(zone.entrances),bounds:{...zone.bounds}}:{}),
        supportIds:[...item.supportIds]})
    }
    root.updateMatrixWorld(true)
  } catch (error) {
    for (const {context} of records.values()) ownContext(context)
    dispose(); throw error
  }

  const interiorBoxes=interiors.map(box=>({min:new T.Vector3(...box.min),max:new T.Vector3(...box.max)}))
  return {root,chunks,lightSites,landmarks,interiorBoxes,
    snapshot:()=>({stage:'M2-B0.5',disposed,storyImplemented:false,infectedImplemented:false,safeZoneProtectionImplemented:false,
      layout:structuredClone(CH2),obstacles:structuredClone(obstacles),obstacleCount:disposed?0:obstacles.length,suppliesImplemented:false,colliders:structuredClone(colliders),interiors:structuredClone(interiors),
      containerCount:disposed?0:CH2_CONTAINERS.length,colliderCount:disposed?0:handles.length,
      openCargoCount:CH2_CONTAINERS.filter(item=>item.open&&!item.safeZoneId).length,safeShellCount:CH2_SAFE_ZONES.length,
      templateCount:templates.size,removedRearTriangles,batchCount:disposed?0:batches.length,
      chunks:chunks.map(chunk=>({id:chunk.id,bounds:{...chunk.bounds},visible:chunk.root.visible,updaterCount:chunk.updaters.length})),
      lightSiteCount:disposed?0:lightSites.length,permanentLights:0,landmarks:structuredClone(landmarks),
      ownership:{borrowed:'native factory geometry/materials/textures, mats caches, preloaded pickup texture',owned:'cut rear/context/merged/pickup/sheet geometry, pickup/lens materials, instance buffers, exact collider handles',
        geometryCount:ownedGeometry.size,materialCount:ownedMaterials.size}}),dispose}
}
