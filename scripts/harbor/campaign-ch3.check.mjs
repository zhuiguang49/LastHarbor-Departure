import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { nativeFixture, capsulePath, navPath, isMain } from './campaign-ch2.check.mjs'
import { buildM1BoundarySegments, M1_WORLD } from './campaign-layout.mjs'
import { buildChapter3Environment } from './campaign-ch3-environment.mjs'
import { loadChapter3Assets } from './campaign-ch3-assets.mjs'
import { CH3_MAIN_PORTALS, CH3_ENTRY_SIGHT } from './campaign-ch3-layout.mjs'
import { CH3, CH3_CONTAINERS, CH3_ROUTES, CH3_BLOCKADES, CH3_LOS, CH3_WEST_PORTALS } from './campaign-ch3-layout.mjs'

const length=points=>points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.z-points[i].z),0)
const digest=geometry=>{
  const hash=createHash('sha256')
  for(const a of [...Object.values(geometry.attributes),geometry.index].filter(Boolean))hash.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength))
  return hash.digest('hex')
}
// Install the retained, integration-owned M1 edge only. This fixture never adds
// invisible route fences or guide colliders. Native material rasters are doubles.
export async function nativeChapter3Fixture(options={}) {
  const f=await nativeFixture(),{g}=f,sourceBuild=g.props.build,sources=new Set()
  g.props.build=(...args)=>{
    const object=sourceBuild(...args)
    object.traverse(mesh=>{if(mesh.isMesh){sources.add(mesh.geometry);sources.add(mesh.material)}})
    return object
  }
  const boundary=[]
  for(const s of buildM1BoundarySegments().filter(s=>!s.sectorIds.includes('berth-7'))){
    const x0=Math.min(s.from.x,s.to.x),x1=Math.max(s.from.x,s.to.x),z0=Math.min(s.from.z,s.to.z),z1=Math.max(s.from.z,s.to.z)
    if(s.kind==='coast'){
      boundary.push(g.physics.addBox([29.4,-4.2,z0],[30,.028,z1],{tag:'retained-m1-quay'}),
        g.physics.addBox([29.56,.028,z0],[29.64,1.1,z1],{tag:'retained-m1-coast-rail'}))
      continue
    }
    const dx=x1===x0?.16:0,dz=z1===z0?.16:0
    // Same full-thickness opening corners as buildCampaignSectors().
    const offset=z0===z1&&[-196,-116].includes(z0)?-.16:z0===z1&&[-184,-104].includes(z0)?.16:0
    boundary.push(g.physics.addBox([x0-dx,0,z0-dz+offset],[x1+dx,2.4,z1+dz+offset],{tag:'retained-m1-perimeter'}))
  }
  const assets=options.assets??await loadChapter3Assets({...f.T,TextureLoader:class{async loadAsync(){return new f.T.Texture()}}})
  const layer=buildChapter3Environment(g,{...options,assets})
  g.physics.build()
  return {...f,layer,sources,boundary,dispose(){layer.dispose();assets.dispose();for(const h of boundary)g.physics.removeBox(h)}}
}
const p=(x,z,y=0)=>({x,y,z})
function ray(g,from,to){
  const a=new g.THREE.Vector3(from.x,from.y,from.z),b=new g.THREE.Vector3(to.x,to.y,to.z),d=b.clone().sub(a)
  return {los:g.physics.lineOfSight(a,b),hit:g.physics.raycast(a,d.clone().normalize(),d.length())}
}
function assertPortal(path,portal){
  let crossed=false
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],t=(portal.z-a.z)/(b.z-a.z)
    if(t>=0&&t<=1){const x=a.x+(b.x-a.x)*t;if(x>=portal.minX&&x<=portal.maxX)crossed=true}
  }
  assert.ok(crossed,`Actual no-waypoint nav bypassed west opening ${JSON.stringify(portal)}: ${JSON.stringify(path)}`)
}

// QA-only unlimited A* over native .5m inflated occupancy. The production
// nav API's unchanged 9000-expansion limit is reported separately, never hidden.
export function gridShortest(g,from,to) {
  const grid=g.physics.nav._grid(),{w,h,minX,minZ,cell,blocked}=grid
  const id=p=>Math.floor((p.z-minZ)/cell)*w+Math.floor((p.x-minX)/cell),start=id(from),goal=id(to)
  const cost=new Float64Array(w*h).fill(Infinity),parent=new Int32Array(w*h).fill(-1),closed=new Uint8Array(w*h),heap=[]
  const heuristic=id=>{const x=Math.abs(id%w-goal%w),z=Math.abs(Math.floor(id/w)-Math.floor(goal/w));return x+z+(1.4142-2)*Math.min(x,z)}
  const push=(id,f)=>{let i=heap.length;heap.push({id,f});while(i){const p=(i-1)>>1;if(heap[p].f<=f)break;heap[i]=heap[p];i=p}heap[i]={id,f}}
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c}heap[i]=last}return top.id}
  assert.equal(blocked[start],0);assert.equal(blocked[goal],0)
  cost[start]=0;push(start,heuristic(start))
  while(heap.length){
    const a=pop();if(closed[a])continue;closed[a]=1;if(a===goal)break
    const x=a%w,z=Math.floor(a/w)
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      if((!dx&&!dz)||x+dx<0||x+dx>=w||z+dz<0||z+dz>=h)continue
      const b=a+dz*w+dx
      if(blocked[b]||closed[b]||dx&&dz&&(blocked[a+dx]||blocked[a+dz*w]))continue
      const next=cost[a]+(dx&&dz?1.4142:1)
      if(next<cost[b]){cost[b]=next;parent[b]=a;push(b,next+heuristic(b))}
    }
  }
  assert.equal(closed[goal],1,'Native occupancy has no complete route')
  const indices=[];for(let i=goal;i!==-1;i=parent[i])indices.push(i)
  const points=indices.reverse().map(i=>p(minX+(i%w+.5)*cell,minZ+(Math.floor(i/w)+.5)*cell))
  return [from,...points,to]
}

if(isMain(import.meta.url)){
test('M3-A0 exports the isolated environment contract, native tower and fixed seams',async t=>{
  const f=await nativeChapter3Fixture(),{g,layer}=f
  try{
    assert.deepEqual(Object.keys(layer).sort(),['chunks','dispose','interiorBoxes','landmarks','lightSites','root','snapshot'])
    assert.equal(layer.root.parent,null);assert.equal(g.scene.children.length,0)
    assert.deepEqual(CH3.bounds,M1_WORLD.sectors.find(s=>s.id==='berth-6').bounds)
    assert.deepEqual(CH3.tower,p(8,-154,5.2));assert.deepEqual(CH3.safeHouse.position,p(-43,-142))
    assert.deepEqual(CH3.links,[{id:'yard-to-six',x:-60,minZ:-196,maxZ:-184},{id:'six-to-control',x:-60,minZ:-116,maxZ:-104}])
    const state=layer.snapshot()
    for(const key of ['storyImplemented','aiImplemented','combatImplemented','chapter4Implemented'])assert.equal(state[key],false)
    assert.equal(state.permanentLights,0)
    const tower=state.nativePlacements.filter(item=>['stairs_metal','catwalk'].includes(item.name))
    assert.equal(tower.length,6)
    assert.deepEqual(tower.map(({name,x,y,z,yaw})=>({name,x,y,z,yaw})),[
      {name:'stairs_metal',x:5,y:0,z:-154,yaw:0},{name:'catwalk',x:8,y:2.55,z:-154,yaw:0},
      {name:'stairs_metal',x:11,y:2.6,z:-152,yaw:Math.PI},
      ...[-152,-153.2,-154.4].map(z=>({name:'catwalk',x:8,y:5.15,z,yaw:0})),
    ])
    assert.equal(state.colliderCount,g.physics.boxes.length-f.boundary.length)
    for(const chunk of layer.chunks){
      assert.equal(chunk.root.position.length(),0);assert.equal(chunk.root.rotation.x+chunk.root.rotation.y+chunk.root.rotation.z,0)
      assert.ok(Object.values(chunk.bounds).every(Number.isFinite));assert.ok(chunk.updaters.every(fn=>typeof fn==='function'))
    }
    layer.root.traverse(object=>{assert.ok(!object.isLight);if(object.isMesh)for(const attribute of Object.values(object.geometry.attributes))assert.ok(attribute.array.every(Number.isFinite))})
    t.diagnostic(JSON.stringify({stage:state.stage,chunks:layer.chunks.length,containers:state.containerCount,colliders:state.colliderCount,pooledLights:state.lightSiteCount}))
  }finally{f.dispose()}
})

test('M3-A0 standing/crouching capsule routes, patrol reservations and both complete seams are bidirectional',async t=>{
  const f=await nativeChapter3Fixture(),{g}=f
  try{
    for(const [id,points]of Object.entries(CH3_ROUTES)){
      for(const h of [1.8,1.15])for(const reverse of [false,true])capsulePath(g,reverse?[...points].reverse():points,`${id}/${h}/${reverse}`,h)
      if(!['tower','observation'].includes(id))for(let i=1;i<points.length;i++)for(const reverse of [false,true]){
        const [a,b]=reverse?[points[i],points[i-1]]:[points[i-1],points[i]]
        navPath(g,{...a,y:0},{...b,y:0},`${id}/leg${i}/${reverse}`)
      }
    }
    for(const site of CH3_BLOCKADES){
      navPath(g,site.patrol[0],site.patrol[1],site.id)
      capsulePath(g,site.patrol,site.id);capsulePath(g,[...site.patrol].reverse(),`${site.id}/reverse`)
      const pos=new g.THREE.Vector3(site.position.x,site.position.y,site.position.z)
      assert.equal(g.physics.moveCapsule(pos,new g.THREE.Vector3(),0).hitWall,false)
      assert.equal(pos.y,site.position.y)
    }
    let seamLanes=0
    for(const link of CH3.links)for(let z=link.minZ+.6;z<link.maxZ-.5;z+=1){
      const route=[p(-61.3,z),p(-58.5,z)]
      for(const h of [1.8,1.15]){capsulePath(g,route,`${link.id}/${z}`,h);capsulePath(g,[...route].reverse(),`${link.id}/${z}/reverse`,h)}
      navPath(g,route[0],route[1],link.id);navPath(g,route[1],route[0],`${link.id}/reverse`);seamLanes++
    }
    t.diagnostic(JSON.stringify({authoredLengths:Object.fromEntries(Object.entries(CH3_ROUTES).map(([id,route])=>[id,length(route)])),seamLanes}))
  }finally{f.dispose()}
})

test('M3-A0 actual native shortest paths cannot use straight, western boundary or screen gaps as shortcuts',async t=>{
  const f=await nativeChapter3Fixture(),{g}=f
  try{
    const measured=[]
    for(const reverse of [false,true]){
      const ends=[CH3_ROUTES.main[0],CH3_ROUTES.main.at(-1)],from=reverse?ends[1]:ends[0],to=reverse?ends[0]:ends[1]
      const raw=g.physics.nav.findPath(new g.THREE.Vector3(from.x,0,from.z),new g.THREE.Vector3(to.x,0,to.z))
      if(raw)navPath(g,from,to,`native-whole/${reverse}`)
      const route=gridShortest(g,from,to)
      capsulePath(g,route,`grid-shortest/${reverse}`)
      assert.ok(length(route)>140,'Entry-to-exit route collapsed into a near-straight edge shortcut')
      for(const point of route)assert.ok(point.x>=-59.5&&point.x<29.5&&point.z>-204.5&&point.z<-100.5)
      measured.push({id:'whole',reverse,length:length(route),native9000Found:!!raw,nativeSmoothedLength:raw?length([from,...raw]):null})
    }
    for(const [id,from,to,portals]of [
      ['west',p(-33,-184),p(-33.5,-113),CH3_WEST_PORTALS],
      ['main',p(-20,-186),p(-20,-116),CH3_MAIN_PORTALS],
    ])for(const reverse of [false,true]){
      const a=reverse?to:from,b=reverse?from:to,route=gridShortest(g,a,b)
      capsulePath(g,route,`${id}/grid/${reverse}`)
      // A whole-world shortest path may deliberately take the other real route.
      // Local no-waypoint native queries around each actual gate additionally
      // prove that a straight or boundary chord cannot replace its opening.
      for(const portal of portals){
        const route=navPath(g,p(id==='west'?-33.5:-20,portal.z-5),p(id==='west'?-33.5:-20,portal.z+5),`${id}/portal/${portal.z}`)
        assertPortal(route,portal)
      }
      measured.push({id,reverse,length:length(route)})
    }
    for(let z=-190;z<=-119;z+=.25){
      const r=ray(g,p(-30,z,1.3),p(-26,z,1.3));assert.equal(r.los,false,`Screen leaked at z=${z}`)
    }
    for(const [start,end]of [[p(-58,-188),p(-58,-176)],[p(-49,-175),p(-49,-163)],[p(-58,-162),p(-58,-150)]]){
      const pos=new g.THREE.Vector3(start.x,0,start.z),delta=new g.THREE.Vector3(end.x-start.x,0,end.z-start.z)
      assert.equal(g.physics.moveCapsule(pos,delta.clone().normalize().multiplyScalar(3),delta.length()/3).hitWall,true)
      assert.equal(ray(g,{...start,y:1.3},{...end,y:1.3}).los,false)
    }
    t.diagnostic(JSON.stringify({nativeNavCell:g.physics.nav._grid().cell,measured}))
  }finally{f.dispose()}
})

test('M3-A0 tower has exposed firing lanes and true western cover; native cover blocks LOS and capsules',async t=>{
  const f=await nativeChapter3Fixture(),{g}=f
  try{
    assert.equal(ray(g,CH3_ENTRY_SIGHT.from,CH3_ENTRY_SIGHT.to).los,true,'Real CH2 crossing must reveal the distant tower')
    for(const point of CH3_LOS.hidden)for(const h of [1.15,1.65])assert.equal(ray(g,CH3.towerEye,{...point,y:h}).los,false,`West route exposed ${JSON.stringify(point)}/${h}`)
    for(const point of CH3_LOS.exposed)assert.equal(ray(g,CH3.towerEye,{...point,y:1.65}).los,true,`Tower firing lane blocked ${JSON.stringify(point)}`)
    for(const probe of CH3_LOS.cover){
      const {hit,los}=ray(g,probe.from,probe.to);assert.equal(los,false,probe.id);assert.equal(hit?.box?.tag,'campaign-container')
      const position=new g.THREE.Vector3(probe.from.x,0,probe.from.z),delta=new g.THREE.Vector3(probe.to.x-probe.from.x,0,probe.to.z-probe.from.z)
      assert.equal(g.physics.moveCapsule(position,delta.clone().normalize().multiplyScalar(3),delta.length()/3).hitWall,true,probe.id)
      const d=new g.THREE.Vector3(probe.to.x-probe.from.x,probe.to.y-probe.from.y,probe.to.z-probe.from.z)
      assert.ok(new g.THREE.Raycaster(new g.THREE.Vector3(probe.from.x,probe.from.y,probe.from.z),d.normalize(),0,d.length()+5).intersectObject(f.layer.root,true).length,`${probe.id}: invisible physics cover`)
    }
    t.diagnostic(JSON.stringify({westHidden:CH3_LOS.hidden.length*2,exposed:CH3_LOS.exposed.length,coverPairs:CH3_LOS.cover.length}))
  }finally{f.dispose()}
})

test('M3-A0 safe-house open doors, floor, walls, roof and interior standing positions agree in mesh/physics/nav',async t=>{
  const f=await nativeChapter3Fixture(),{g,T,layer}=f
  try{
    let apertureRays=0
    for(const h of [.4,1.3,2.2])for(const offset of [-.8,-.4,0,.4,.8])for(const reverse of [false,true]){
      const points=[p(-37.2,-142+offset,h),p(-35.5,-142+offset,h)],from=reverse?points[1]:points[0],to=reverse?points[0]:points[1],d=new T.Vector3(to.x-from.x,0,to.z-from.z)
      assert.equal(ray(g,from,to).los,true)
      assert.equal(new T.Raycaster(new T.Vector3(from.x,from.y,from.z),d.clone().normalize(),0,d.length()).intersectObject(layer.root,true).length,0,'Visible door covers a physical opening')
      apertureRays++
    }
    const shells=[{from:p(-43,-142.7,1.3),to:p(-43,-144,1.3)},{from:p(-43,-141.3,1.3),to:p(-43,-140,1.3)},
      {from:p(-48.5,-142,1.3),to:p(-50,-142,1.3)},{from:p(-43,-142,2.1),to:p(-43,-142,3)},
      {from:p(-43,-142,.6),to:p(-43,-142,-.1)}]
    for(const probe of shells){
      const {los,hit}=ray(g,probe.from,probe.to);assert.equal(los,false);assert.equal(hit?.box?.tag,'campaign-ch3-safe-house')
      const d=new T.Vector3(probe.to.x-probe.from.x,probe.to.y-probe.from.y,probe.to.z-probe.from.z)
      const from=probe.to.y<0?probe.from:probe.to, direction=probe.to.y<0?d.clone():d.clone().negate()
      assert.ok(new T.Raycaster(new T.Vector3(from.x,from.y,from.z),direction.normalize(),0,d.length()).intersectObject(layer.root,true).length,`Missing shell mesh ${JSON.stringify(probe)}`)
    }
    for(const site of [CH3.safeHouse.survivor,CH3.safeHouse.visitor]){
      const pos=new T.Vector3(site.x,site.y,site.z),result=g.physics.moveCapsule(pos,new T.Vector3(),0)
      assert.equal(result.hitWall,false);assert.equal(result.hitCeil,false);assert.ok(Math.abs(pos.y-site.y)<1e-6)
      assert.equal(g.physics.nav.isWalkable(site.x,site.z),true)
      assert.ok(layer.interiorBoxes.some(b=>pos.x>b.min.x&&pos.x<b.max.x&&pos.z>b.min.z&&pos.z<b.max.z&&b.max.y>pos.y+1.8))
    }
    for(const probe of shells.slice(0,3))for(const height of [1.8,1.15]){
      const from=new T.Vector3(probe.from.x,.172,probe.from.z),d=new T.Vector3(probe.to.x-probe.from.x,0,probe.to.z-probe.from.z)
      assert.equal(g.physics.moveCapsule(from,d.clone().normalize().multiplyScalar(3),d.length()/3,.32,height).hitWall,true)
    }
    for(const height of [1.8,1.15]){
      const pos=new T.Vector3(-43,.172,-142),result=g.physics.moveCapsule(pos,new T.Vector3(0,3,0),1,.32,height)
      assert.equal(result.hitCeil,true);assert.ok(Math.abs(pos.y+height-2.5)<1e-6)
    }
    t.diagnostic(JSON.stringify({apertureRays,shellRays:shells.length,standingSites:2,roofClearance:2.5-.172}))
  }finally{f.dispose()}
})

test('M3-A0 all seven loaded assets retain real surfaces and gaps, open observation standing access and shared ownership',async t=>{
  const f=await nativeChapter3Fixture(),{g,T,layer}=f
  try{
    const state=layer.snapshot(),instances=state.assetPlacements
    assert.equal(instances.length,7)
    assert.deepEqual([...new Set(instances.map(a=>a.kind))].sort(),['cover','observation','sign','workbench'])
    const solids={cover:[[0,1,-2.1],[0,1,2.1]],workbench:[[0,.6,0],[0,1.3,0]],
      observation:[[-1.8,1,0],[1.8,1,0]],sign:[[0,.8,-.5],[0,.8,.5]]}
    const gaps={cover:[[0,.6,0],[0,1.3,0]],workbench:[[0,.4,-.5],[0,.4,.5]],sign:[[0,.15,-.5],[0,.15,.5]]}
    const transform=(object,a)=>new T.Vector3(...a).applyMatrix4(object.matrixWorld)
    const sourceResources=new Set()
    for(const a of instances){
      const object=layer.root.getObjectsByProperty('name',`campaign-ch3-${a.kind}`).find(o=>Math.abs(o.position.x-a.position.x)<1e-7&&Math.abs(o.position.z-a.position.z)<1e-7)
      assert.ok(object)
      const physicalBounds=new T.Box3(new T.Vector3(...a.bounds.min),new T.Vector3(...a.bounds.max)).applyMatrix4(object.matrixWorld).expandByScalar(1e-8)
      for(const collider of a.colliders)assert.ok(physicalBounds.containsBox(new T.Box3(new T.Vector3(...collider.min),new T.Vector3(...collider.max))))
      assert.ok(a.colliders.length>1,`${a.id}: enclosing AABB is forbidden`)
      const [localFrom,localTo]=solids[a.kind],from=transform(object,localFrom),to=transform(object,localTo),d=to.clone().sub(from)
      assert.ok(new T.Raycaster(from,d.clone().normalize(),0,d.length()).intersectObject(object,true).length,`${a.id}: expected actual visible surface`)
      assert.equal(g.physics.raycast(from,d.clone().normalize(),d.length())?.box?.tag,`campaign-ch3-asset:${a.id}`)
      if(gaps[a.kind]){
        const [gapFrom,gapTo]=gaps[a.kind].map(p=>transform(object,p)),d=gapTo.clone().sub(gapFrom)
        assert.equal(new T.Raycaster(gapFrom,d.clone().normalize(),0,d.length()).intersectObject(object,true).length,0)
        assert.equal(g.physics.raycast(gapFrom,d.clone().normalize(),d.length()),null,`${object.name}: filled a visible empty space`)
      }
      object.traverse(mesh=>{if(mesh.isMesh){sourceResources.add(mesh.geometry);sourceResources.add(mesh.material)}})
    }
    const spot=CH3.observation.standing,pos=new T.Vector3(spot.x,spot.y,spot.z),stationary=g.physics.moveCapsule(pos,new T.Vector3(),0)
    assert.equal(stationary.hitWall,false);assert.equal(stationary.hitCeil,false)
    assert.ok(pos.distanceTo(new T.Vector3(spot.x,spot.y,spot.z))<1e-7,'Observation station must stand on its actual platform')
    const observation=layer.root.getObjectByName('campaign-ch3-observation')
    for(const y of [.6,1.2,1.65])for(const [x,z]of [[1,0],[0,1]]){
      const a=new T.Vector3(spot.x-x*.3,spot.y+y,spot.z-z*.3),d=new T.Vector3(x,0,z)
      assert.equal(new T.Raycaster(a,d,0,.6).intersectObject(observation,true).length,0,'Observation standing capsule clips source mesh')
    }
    // The environment borrows the pack. It may only release its own voxels,
    // native context geometry and instance buffers, even after a partial build.
    let released=0;for(const item of sourceResources)item.addEventListener('dispose',()=>released++)
    layer.dispose();assert.equal(released,0)
    t.diagnostic(JSON.stringify({instances:instances.length,assetColliders:instances.reduce((n,a)=>n+a.colliders.length,0),
      surfaceVoxelMetres:.2,observationStanding:spot,sharedResourcesReleasedByEnvironment:released}))
  }finally{f.dispose()}
})

test('M3-A0 safe-house work light uses a real native fixture and the existing pool with a clear interior beam',async()=>{
  const f=await nativeChapter3Fixture(),{g,layer}=f
  try{
    assert.equal(layer.lightSites.length,4)
    const site=layer.lightSites.find(s=>s.id==='berth6-safe-house-work-light'),b=CH3.safeHouse.bounds
    assert.ok(site);assert.ok(site.position.x>b.minX&&site.position.x<b.maxX&&site.position.z>b.minZ&&site.position.z<b.maxZ)
    assert.ok(site.position.y>1.8&&site.position.y<CH3.safeHouse.ceiling)
    assert.ok(site.intensity>0);assert.equal(site.sectorId,'berth-6')
    assert.equal(ray(g,site.position,site.target).los,true)
    assert.ok(layer.snapshot().nativePlacements.some(p=>p.name==='floodlight_stand'&&p.y===.172))
    layer.root.traverse(o=>assert.ok(!o.isLight,'Fixture must use the integration-owned pool'))
    const a=p(-20,-186),beyond=p(-20,-116),position=new g.THREE.Vector3(a.x,0,a.z)
    assert.equal(g.physics.moveCapsule(position,new g.THREE.Vector3(0,0,3),(beyond.z-a.z)/3).hitWall,true,'Main route permits a 70m straight run')
  }finally{f.dispose()}
})

test('M3-A0 displaced cargo is grounded with tight diagonal contact; reused vehicles retain open cab space',async t=>{
  const f=await nativeChapter3Fixture(),{g,T,layer}=f,state=layer.snapshot()
  try{
    let faceRays=0
    for(const item of state.cargoPlacements){
      const source=g.props.build(item.kind,{seed:0,doors:0,color:item.pitch?'orange':'teal',wear:.6}),local=source.userData.colliders[0]
      const matrix=new T.Matrix4().compose(new T.Vector3(item.x,item.y,item.z),new T.Quaternion().setFromEuler(new T.Euler(item.pitch||0,item.yaw,0,'YXZ')),new T.Vector3(1,1,1)),inverse=matrix.clone().invert()
      const visible=new T.Box3();source.updateMatrixWorld(true)
      source.traverse(mesh=>{if(mesh.isMesh)visible.union(new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position).applyMatrix4(mesh.matrixWorld).applyMatrix4(matrix))})
      assert.ok(Math.abs(visible.min.y)<.002,`${item.id} is floating or sunk`)
      for(const b of item.colliders)for(const x of [b.min[0],b.max[0]])for(const y of [b.min[1],b.max[1]])for(const z of [b.min[2],b.max[2]]){
        const v=new T.Vector3(x,y,z).applyMatrix4(inverse),box=new T.Box3(new T.Vector3(...local.min),new T.Vector3(...local.max))
        assert.ok(box.distanceToPoint(v)<=.121,`${item.id}: invisible diagonal wedge`)
      }
      for(const sign of [-1,1]){
        const end=sign<0?local.min[0]:local.max[0],a=new T.Vector3(end+sign*.8,1.3,0).applyMatrix4(matrix),b=new T.Vector3(end-sign*.6,1.3,0).applyMatrix4(matrix),d=b.clone().sub(a)
        const hit=g.physics.raycast(a,d.clone().normalize(),d.length()),mesh=new T.Raycaster(a,d.clone().normalize(),0,d.length()).intersectObject(layer.root,true)[0]
        assert.equal(hit?.box?.tag,`campaign-ch3-cargo:${item.id}`);assert.ok(mesh,`${item.id}: invisible cargo`)
        assert.ok(Math.abs(mesh.distance-hit.dist)<.16,`${item.id}: visual/contact edge differs`)
        const feet=new T.Vector3(a.x,0,a.z)
        assert.equal(g.physics.moveCapsule(feet,new T.Vector3(d.x,0,d.z).normalize().multiplyScalar(3),Math.hypot(d.x,d.z)/3).hitWall,true)
        faceRays++
      }
    }
    for(const item of state.vehiclePlacements.filter(v=>v.kind==='forklift')){
      const transform=p=>new T.Vector3(...p).applyAxisAngle(new T.Vector3(0,1,0),item.yaw).add(new T.Vector3(item.x,0,item.z))
      const a=transform([-.4,1.75,-.8]),b=transform([-.4,1.75,.8]),d=b.clone().sub(a)
      assert.equal(g.physics.lineOfSight(a,b),true,`${item.id}: open cab overfilled`)
      assert.equal(new T.Raycaster(a,d.clone().normalize(),0,d.length()).intersectObject(layer.root,true).length,0)
      assert.equal(g.physics.nav.isWalkable(item.x,item.z),false,'Vehicle is missing from navigation')
    }
    assert.equal(state.vehiclePlacements.filter(v=>v.source==='user-glb').length,2)
    assert.ok(state.colliderCount<2000,'Scene density must not use thousands of tiny per-triangle contacts')
    t.diagnostic(JSON.stringify({displacedCargo:state.cargoPlacements.length,sideResting:state.cargoPlacements.filter(v=>v.pitch).length,vehicles:state.vehiclePlacements.length,faceRays,colliders:state.colliderCount}))
  }finally{f.dispose()}
})

test('M3-A0 side-resting cargo closes exposed panels from outside, including its original underside',async t=>{
  const f=await nativeChapter3Fixture(),{g,T,layer}=f,missing=[]
  let checked=0
  try{
    for(const item of layer.snapshot().cargoPlacements.filter(p=>p.pitch)){
      const local=g.props.build(item.kind,{doors:0}).userData.colliders[0]
      const matrix=new T.Matrix4().compose(new T.Vector3(item.x,item.y,item.z),new T.Quaternion().setFromEuler(new T.Euler(item.pitch,item.yaw,0,'YXZ')),new T.Vector3(1,1,1))
      for(const axis of [0,1,2])for(const side of [-1,1])for(const fraction of [-.99,-.75,0,.75,.99]){
        const centre=local.min.map((v,a)=>(v+local.max[a])/2),along=axis===0?2:0,face=side<0?local.min[axis]:local.max[axis]
        centre[along]+=(local.max[along]-local.min[along])*fraction/2
        const start=[...centre],end=[...centre];start[axis]=face+side*.3;end[axis]=face-side*.35
        const a=new T.Vector3(...start).applyMatrix4(matrix),b=new T.Vector3(...end).applyMatrix4(matrix),d=b.clone().sub(a)
        if(a.y<.2)continue // Contact face resting on the real ground is hidden.
        checked++
        const hit=new T.Raycaster(a,d.clone().normalize(),0,d.length()).intersectObject(layer.root,true)[0]
        if(!hit)missing.push({id:item.id,axis,side,fraction})
        assert.equal(g.physics.lineOfSight(a,b),false,'Closed cargo has a physical panel hole')
      }
    }
    t.diagnostic(JSON.stringify({checked,missing}))
    assert.deepEqual(missing,[],'A side-resting container exposes its interior through an invisible panel')
  }finally{f.dispose()}
})

test('M3-A0 northeast mast lights the tower and eastern apron through the existing light pool',async()=>{
  const f=await nativeChapter3Fixture(),{g,T,layer}=f
  try{
    const site=layer.lightSites.find(s=>s.id==='berth6-northeast-mast'),state=layer.snapshot()
    assert.ok(site);assert.equal(layer.lightSites.length,4);assert.equal(state.permanentLights,0)
    assert.ok(state.nativePlacements.some(p=>p.name==='light_mast'&&p.x===24&&p.z===-174&&p.options.on))
    assert.ok(site.position.x>CH3.tower.x&&site.position.z<CH3.tower.z&&site.position.y>13)
    const start=new T.Vector3(site.position.x,site.position.y,site.position.z),direction=new T.Vector3(site.target.x,site.target.y,site.target.z).sub(start).normalize()
    for(const point of [CH3.towerEye,p(1,-170,1.65),p(16,-164,1.65)]){
      const end=new T.Vector3(point.x,point.y,point.z),delta=end.clone().sub(start)
      assert.ok(delta.length()<site.distance);assert.ok(direction.angleTo(delta)<site.angle)
      assert.equal(g.physics.lineOfSight(start,end),true,'Mast beam is obstructed')
    }
    assert.equal(g.physics.nav.isWalkable(24,-174),false,'Mast pole lacks navigation contact')
    layer.root.traverse(o=>assert.ok(!o.isLight,'Use pooled lights, not extra shader slots'))
  }finally{f.dispose()}
})

test('M3-A0 dispose retains borrowed caches and unrelated physics; failed native factories roll back',async()=>{
  const f=await nativeFixture(),{g,T}=f,build=g.props.build,borrowed=new Set(),hashes=new Map()
  g.props.build=(...args)=>{const object=build(...args);object.traverse(mesh=>{if(mesh.isMesh){borrowed.add(mesh.geometry);borrowed.add(mesh.material)}});return object}
  const unrelated=g.physics.addBox([1,0,40],[2,1,41]),layer=buildChapter3Environment(g)
  for(const item of borrowed){item.addEventListener('dispose',()=>assert.fail('Disposed a borrowed native cache'));if(item.isBufferGeometry)hashes.set(item,digest(item))}
  const owned=new Set(),disposed=new Set()
  layer.root.traverse(mesh=>{if(mesh.isMesh){const item=mesh.isInstancedMesh?mesh:!borrowed.has(mesh.geometry)?mesh.geometry:null;if(item)owned.add(item)}})
  for(const item of owned)item.addEventListener('dispose',()=>disposed.add(item))
  const before=g.physics.boxes.length;for(const chunk of layer.chunks)chunk.root.visible=false
  assert.equal(g.physics.boxes.length,before)
  layer.dispose();layer.dispose()
  assert.equal(g.physics.boxes.length,1);assert.equal(g.physics.boxes[0],unrelated);assert.equal(disposed.size,owned.size)
  for(const [geometry,hash]of hashes)assert.equal(digest(geometry),hash)
  assert.equal(layer.snapshot().colliderCount,0)
  g.props.build=(name,options)=>name==='stairs_metal'?new T.Group():build(name,options)
  assert.throws(()=>buildChapter3Environment(g),/complete native stairs_metal/)
  assert.equal(g.physics.boxes.length,1)
})

}
