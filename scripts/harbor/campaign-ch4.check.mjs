import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeFixture, capsulePath, navPath, isMain } from './campaign-ch2.check.mjs'
import { buildM1BoundarySegments, M1_WORLD } from './campaign-layout.mjs'
import { buildChapter4Environment } from './campaign-ch4-environment.mjs'
import { loadChapter4Assets } from './campaign-ch4-assets.mjs'
import { loadChapter3Assets } from './campaign-ch3-assets.mjs'
import { CH4, CH4_CARGO, CH4_ROUTES, CH4_SPAWNS, CH4_CHICANES, CH4_COVER_POSITIONS } from './campaign-ch4-layout.mjs'

const p=(x,z,y=0)=>({x,y,z})
export async function nativeChapter4Fixture() {
  const f=await nativeFixture(),{g,T}=f,boundary=[]
  for(const s of buildM1BoundarySegments().filter(s=>!s.sectorIds.includes('berth-7'))){
    const x0=Math.min(s.from.x,s.to.x),x1=Math.max(s.from.x,s.to.x),z0=Math.min(s.from.z,s.to.z),z1=Math.max(s.from.z,s.to.z)
    if(s.kind==='coast')continue
    const dx=x1===x0?.16:0,dz=z1===z0?.16:0
    const offset=z0===z1&&[-196,-116].includes(z0)?-.16:z0===z1&&[-184,-104].includes(z0)?.16:0
    boundary.push(g.physics.addBox([x0-dx,0,z0-dz+offset],[x1+dx,2.4,z1+dz+offset],{tag:'retained-m1-perimeter'}))
  }
  const assets=await loadChapter4Assets({...T,TextureLoader:class{async loadAsync(){return new T.Texture()}}})
  const chapter3=await loadChapter3Assets({...T,TextureLoader:class{async loadAsync(){return new T.Texture()}}})
  g.campaignAssets.chapter3=chapter3
  const layer=buildChapter4Environment(g,{assets});g.physics.build()
  return {...f,layer,assets,chapter3,dispose(){layer.dispose();assets.dispose();chapter3.dispose();for(const h of boundary)g.physics.removeBox(h)}}
}
function widePath(g,points,label,radius=.65){
  const T=g.THREE,pos=new T.Vector3(points[0].x,0,points[0].z)
  for(const end of points.slice(1)){
    const d=new T.Vector3(end.x-pos.x,0,end.z-pos.z),length=d.length();d.normalize()
    for(let s=0;s<length-1e-8;s+=.1){
      const result=g.physics.moveCapsule(pos,d.clone().multiplyScalar(3),Math.min(.1,length-s)/3,radius,1.25)
      assert.equal(result.hitWall,false,`${label}: ${radius}m radius blocked at ${pos.toArray()}`)
    }
    assert.ok(Math.hypot(pos.x-end.x,pos.z-end.z)<.04,`${label}: missed exact endpoint`)
  }
}

if(isMain(import.meta.url)){
test('M4-A0 preserves fixed L geometry, retains both seams and creates only static scene objects',async t=>{
  const f=await nativeChapter4Fixture(),{g,layer}=f
  try{
    assert.deepEqual(CH4.bounds,M1_WORLD.sectors.find(s=>s.id==='blockade-control').bounds)
    assert.deepEqual(CH4.links,[{id:'six-to-control',x:-60,minZ:-116,maxZ:-104},{id:'control-to-seven',x:-40,minZ:2,maxZ:8}])
    const state=layer.snapshot()
    for(const key of ['storyImplemented','aiImplemented','combatImplemented','gateOpeningImplemented'])assert.equal(state[key],false)
    assert.equal(state.gateClosed,true);assert.equal(state.assetPlacements.length,7);assert.equal(state.containerCount,8)
    assert.equal(state.vehiclePlacements.filter(v=>v.kind==='pickup').length,3)
    layer.root.traverse(o=>assert.ok(!o.isLight,'Must use the original shared pool'))
    for(let z=-115;z<=-105;z++)for(const reverse of [false,true]){
      const route=[p(-62,z),p(-58,z)];if(reverse)route.reverse()
      capsulePath(g,route,`CH3 seam ${z}/${reverse}`);navPath(g,route[0],route[1],`CH3 seam ${z}/${reverse}`)
    }
    // The original seven boundary is unchanged and accessible on the far side
    // of the closed gate; gate opening belongs to the next stage.
    for(let z=3;z<=7;z++)for(const reverse of [false,true]){
      const route=[p(-42,z),p(-38,z)];if(reverse)route.reverse()
      capsulePath(g,route,`CH5 seam ${z}/${reverse}`)
    }
    t.diagnostic(JSON.stringify({containers:state.containerCount,vehicles:state.vehiclePlacements.length,assets:state.assetPlacements.length,colliders:state.colliderCount,lightSites:state.lightSiteCount}))
  }finally{f.dispose()}
})

test('M4-A0 central corridor, turn, service aisle and interaction approaches pass native capsule/nav both ways',async t=>{
  const f=await nativeChapter4Fixture(),{g}=f
  try{
    const results=[]
    for(const [id,points]of Object.entries(CH4_ROUTES))for(const reverse of [false,true]){
      const route=reverse?[...points].reverse():points
      capsulePath(g,route,`${id}/${reverse}`);widePath(g,route,`${id}/hound/${reverse}`)
      for(let i=1;i<route.length;i++)navPath(g,route[i-1],route[i],`${id}/${reverse}/${i}`)
      results.push({id,reverse,length:route.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-route[i].x,p.z-route[i].z),0)})
    }
    const native=navPath(g,CH4.spawn,CH4_ROUTES.main.at(-1),'whole-native-route')
    for(const point of native)assert.ok(point.x<=-60||point.z>=-4,'Path cut outside the L footprint')
    for(const site of [CH4.console,CH4.ammo]){
      const a=new g.THREE.Vector3(site.approach.x,1.25,site.approach.z),b=new g.THREE.Vector3(site.target.x,site.target.y,site.target.z)
      // Endpoint is the face itself; other racks/infill must not intervene.
      const d=b.clone().sub(a),hit=g.physics.raycast(a,d.clone().normalize(),d.length()-.22)
      assert.equal(hit,null,'Interaction face is occluded')
    }
    t.diagnostic(JSON.stringify({routes:results,dogRadius:.65,wholeNativePathPoints:native.length}))
  }finally{f.dispose()}
})

test('M4-A0 six separated central reservations stay walkable and reach the gate with dog clearance',async t=>{
  const f=await nativeChapter4Fixture(),{g,T}=f
  try{
    assert.equal(CH4_SPAWNS.filter(p=>p.kind==='soldier').length,4);assert.equal(CH4_SPAWNS.filter(p=>p.kind==='hound').length,2)
    for(const site of CH4_SPAWNS){
      assert.ok(site.position.x>=-72&&site.position.x<=-67)
      const pos=new T.Vector3(site.position.x,0,site.position.z),result=g.physics.moveCapsule(pos,new T.Vector3(),0,site.radius,1.8)
      assert.equal(result.hitWall,false);assert.equal(result.hitCeil,false)
      assert.ok(pos.distanceTo(new T.Vector3(site.position.x,0,site.position.z))<1e-6)
      const route=navPath(g,site.position,CH4_ROUTES.main.at(-1),`${site.id}/nav`)
      widePath(g,route,`${site.id}/native-hound-route`)
      for(const other of CH4_SPAWNS)if(other!==site)assert.ok(Math.hypot(site.position.x-other.position.x,site.position.z-other.position.z)>site.radius+other.radius+.5)
    }
    t.diagnostic(JSON.stringify({reservations:CH4_SPAWNS,spawnedActors:0}))
  }finally{f.dispose()}
})

test('M4-A0 native shortest paths must alternate sides and cannot run straight down any central or edge lane',async t=>{
  const f=await nativeChapter4Fixture(),{g,T,layer}=f
  try{
    const lengths=[]
    for(const reverse of [false,true]){
      const from=reverse?CH4_ROUTES.main.at(-1):CH4.spawn,to=reverse?CH4.spawn:CH4_ROUTES.main.at(-1)
      const route=navPath(g,from,to,`native-detour/${reverse}`)
      for(const turn of CH4_CHICANES){
        const crossings=route.slice(1).flatMap((b,i)=>{const a=route[i],t=(turn.z-a.z)/(b.z-a.z);return t>=0&&t<=1?[a.x+(b.x-a.x)*t]:[]})
        assert.ok(crossings.length&&crossings.every(x=>x>=turn.minX&&x<=turn.maxX),`Native path missed alternating opening ${turn.id}: ${crossings}`)
      }
      const length=route.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-route[i].x,p.z-route[i].z),0)
      const lateral=route.slice(1).reduce((n,p,i)=>n+Math.abs(p.x-route[i].x),0)
      assert.ok(lateral>=20&&Math.max(...route.map(p=>p.x))-Math.min(...route.map(p=>p.x))>10,'Native path lost the measured lateral detours')
      assert.ok(length>Math.hypot(to.x-from.x,to.z-from.z),'Native path collapsed to a straight chord')
      lengths.push(length)
    }
    let laneCount=0
    for(let x=-79.5;x<=-60.5;x+=.25){
      const from=new T.Vector3(x,1.3,-102),to=new T.Vector3(x,1.3,-26),d=to.clone().sub(from)
      assert.equal(g.physics.lineOfSight(from,to),false,`Straight centre/edge LOS bypass at ${x}`)
      assert.ok(new T.Raycaster(from,d.clone().normalize(),0,d.length()).intersectObject(layer.root,true).length,`Invisible lane blocker ${x}`)
      const pos=new T.Vector3(x,0,-102)
      assert.equal(g.physics.moveCapsule(pos,new T.Vector3(0,0,3),76/3).hitWall,true,`Straight centre/edge movement bypass at ${x}`)
      laneCount++
    }
    t.diagnostic(JSON.stringify({nativeRouteLengths:lengths,blockedStraightLanes:laneCount,alternatingOpenings:CH4_CHICANES}))
  }finally{f.dispose()}
})

test('M4-A0 gate blocks the full short road in native movement, LOS and navigation with visible steel',async t=>{
  const f=await nativeChapter4Fixture(),{g,T,layer}=f
  try{
    let lanes=0
    for(let x=-79.5;x<=-60.5;x+=.25)for(const height of [.55,1.1,1.65])for(const reverse of [false,true]){
      const from=new T.Vector3(x,height,reverse?-5:-9),to=new T.Vector3(x,height,reverse?-9:-5),d=to.clone().sub(from)
      assert.equal(g.physics.lineOfSight(from,to),false,`Open gate LOS lane ${x}`)
      assert.ok(new T.Raycaster(from,d.clone().normalize(),0,d.length()).intersectObject(layer.root,true).length,`Invisible gate collision lane ${x}`)
      const pos=new T.Vector3(x,0,reverse?-5:-9)
      assert.equal(g.physics.moveCapsule(pos,new T.Vector3(0,0,reverse?-3:3),4/3,.32,height===.55?1.15:1.8).hitWall,true,`Passable gate lane ${x}`)
      assert.equal(g.physics.nav.isWalkable(x,-7),false,`Gate absent from nav ${x}`)
      lanes++
    }
    assert.equal(g.physics.nav.findPath(new T.Vector3(-70,0,-9),new T.Vector3(-70,0,-5)),null)
    capsulePath(g,CH4.sevenApproach.route,'seven approach beyond closed gate')
    widePath(g,CH4.sevenApproach.route,'seven approach hound')
    t.diagnostic(JSON.stringify({closedGateLanes:lanes,boundaryX:-40,gateZ:-7}))
  }finally{f.dispose()}
})

test('M4-A0 rotated closed cargo has complete visible ends and tight shared collision, without overlapping route reservations',async t=>{
  const f=await nativeChapter4Fixture(),{g,T,layer}=f
  try{
    let faces=0
    for(const item of layer.snapshot().cargoPlacements){
      const source=g.props.build(item.kind,{doors:0}),local=source.userData.colliders[0]
      const matrix=new T.Matrix4().compose(new T.Vector3(item.x,item.y,item.z),new T.Quaternion().setFromEuler(new T.Euler(0,item.yaw,0)),new T.Vector3(1,1,1))
      const inverse=matrix.clone().invert(),box=new T.Box3(new T.Vector3(...local.min),new T.Vector3(...local.max))
      for(const contact of item.colliders)for(const x of [contact.min[0],contact.max[0]])for(const z of [contact.min[2],contact.max[2]]){
        assert.ok(box.distanceToPoint(new T.Vector3(x,1.3,z).applyMatrix4(inverse))<=.122,'Invisible diagonal wedge')
      }
      for(const axis of [0,2])for(const side of [-1,1])for(const fraction of [-.8,0,.8]){
        const a=[0,1.3,0],b=[0,1.3,0],along=axis===0?2:0
        a[along]=b[along]=(local.max[along]-local.min[along])*fraction/2
        const edge=side<0?local.min[axis]:local.max[axis];a[axis]=edge+side*.5;b[axis]=edge-side*.5
        const from=new T.Vector3(...a).applyMatrix4(matrix),to=new T.Vector3(...b).applyMatrix4(matrix),d=to.clone().sub(from)
        const mesh=new T.Raycaster(from,d.clone().normalize(),0,d.length()).intersectObject(layer.root,true)[0],hit=g.physics.raycast(from,d.clone().normalize(),d.length())
        assert.ok(mesh,`${item.id}: missing exposed panel`);assert.equal(hit?.box?.tag,`campaign-ch4-cargo:${item.id}`)
        assert.ok(Math.abs(mesh.distance-hit.dist)<.17,`${item.id}: visible/contact mismatch`);faces++
      }
    }
    t.diagnostic(JSON.stringify({cargo:CH4_CARGO.length,meshPhysicalFacePairs:faces,stripMetres:.12}))
  }finally{f.dispose()}
})

test('M4-A0 supplied equipment and reused vehicles use their actual surface collision and preserve cab gaps',async t=>{
  const f=await nativeChapter4Fixture(),{g,T,layer}=f
  try{
    let rays=0
    for(const site of layer.snapshot().assetPlacements){
      const object=layer.root.getObjectsByProperty('name',site.modelName).find(o=>o.position.x===site.position.x&&o.position.z===site.position.z)
      assert.ok(object);assert.ok(site.colliders.length>1,'A single enclosing asset box loses visible gaps')
      const height=site.kind==='console'?.55:site.kind==='cover'||site.kind==='sign'?.8:1.3,bounds=site.bounds
      for(const sign of [-1,1]){
        const a=new T.Vector3(0,height,sign*(bounds.size[2]/2+.4)).applyMatrix4(object.matrixWorld)
        const b=new T.Vector3(0,height,0).applyMatrix4(object.matrixWorld),d=b.clone().sub(a)
        const visible=new T.Raycaster(a,d.clone().normalize(),0,d.length()).intersectObject(object,true)[0],physical=g.physics.raycast(a,d.clone().normalize(),d.length())
        assert.ok(visible,`${site.id}: missing supplied surface`)
        assert.equal(physical?.box?.tag,`campaign-ch4-asset:${site.id}`)
        assert.ok(Math.abs(visible.distance-physical.dist)<.25,`${site.id}: mismatched visible/contact surface`)
        rays++
      }
    }
    for(const site of layer.snapshot().vehiclePlacements){
      assert.equal(g.physics.nav.isWalkable(site.x,site.z),false,'Vehicle missing from native occupancy')
      if(site.kind!=='forklift')continue
      const transform=p=>new T.Vector3(...p).applyAxisAngle(new T.Vector3(0,1,0),site.yaw).add(new T.Vector3(site.x,0,site.z))
      const a=transform([-.4,1.75,-.8]),b=transform([-.4,1.75,.8]),d=b.clone().sub(a)
      assert.equal(g.physics.lineOfSight(a,b),true,'Open native forklift cab has an invisible wall')
      assert.equal(new T.Raycaster(a,d.clone().normalize(),0,d.length()).intersectObject(layer.root,true).length,0)
    }
    t.diagnostic(JSON.stringify({assetSurfacePairs:rays,forkliftOpenCabs:2,vehicleNavSolids:5,surfaceVoxelMetres:{cover:.08,other:.2}}))
  }finally{f.dispose()}
})

test('M4-A0 new gate defense pockets shield crouched torsos/heads and support clear peeks and continuous swaps',async t=>{
  const f=await nativeChapter4Fixture(),{g,T,layer}=f
  try{
    let shieldRays=0
    for(const pocket of CH4_COVER_POSITIONS){
      for(const height of [.65,1.05]){
        const a=new T.Vector3(pocket.threat.x,pocket.threat.y,pocket.threat.z),b=new T.Vector3(pocket.refuge.x,height,pocket.refuge.z),d=b.clone().sub(a)
        const hit=g.physics.raycast(a,d.clone().normalize(),d.length())
        assert.equal(hit?.box?.tag,pocket.blockerTag,`${pocket.id}: new cover must be the first blocker at height ${height}`)
        const model=layer.root.getObjectByName(pocket.id==='pickup'?'gate-defense-pickup':'campaign-ch3-cover')
        assert.ok(new T.Raycaster(a,d.clone().normalize(),0,d.length()).intersectObject(model,true).length,`${pocket.id}: invisible cover`)
        shieldRays++
      }
      const eye=new T.Vector3(pocket.peek.x,1.65,pocket.peek.z),threat=new T.Vector3(pocket.threat.x,pocket.threat.y,pocket.threat.z)
      assert.equal(g.physics.lineOfSight(eye,threat),true,`${pocket.id}: peek cannot see its attack lane`)
      for(const point of [pocket.refuge,pocket.peek]){
        const pos=new T.Vector3(point.x,0,point.z),contact=g.physics.moveCapsule(pos,new T.Vector3(),0,.32,1.15)
        assert.equal(contact.hitWall,false);assert.equal(contact.hitCeil,false);assert.equal(pos.y,0)
      }
      capsulePath(g,[pocket.refuge,pocket.peek],`${pocket.id}/peek`)
      capsulePath(g,[pocket.peek,pocket.refuge],`${pocket.id}/hide`,1.15)
    }
    for(const reverse of [false,true]){
      const route=reverse?[...CH4_ROUTES.coverSwap].reverse():CH4_ROUTES.coverSwap
      capsulePath(g,route,`continuous-cover-swap/${reverse}`)
      widePath(g,route,`continuous-cover-swap/hound/${reverse}`)
      for(let i=1;i<route.length;i++)navPath(g,route[i-1],route[i],`cover-swap/${reverse}/${i}`)
    }
    const sites=layer.snapshot().assetPlacements
    for(const kind of ['cover','sign'])assert.equal(sites.filter(s=>s.kind===kind).length,1)
    assert.ok(sites.find(s=>s.kind==='cover').source.path.endsWith('掩体/掩体.glb'))
    assert.ok(sites.find(s=>s.kind==='sign').source.path.endsWith('封锁告示牌/封锁告示牌.glb'))
    t.diagnostic(JSON.stringify({shieldRays,pockets:CH4_COVER_POSITIONS,swapRoute:CH4_ROUTES.coverSwap}))
  }finally{f.dispose()}
})

test('M4-A0 overlapping inward mast coverage covers the entire road without flashlight or new light slots',async t=>{
  const f=await nativeChapter4Fixture(),{g,T,layer}=f
  try{
    assert.equal(layer.lightSites.length,8)
    const samples=[]
    for(const route of Object.values(CH4_ROUTES))for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.z-a.z)
      for(let d=0;d<=length;d+=2){const t=d/length;samples.push(p(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,1.2))}
    }
    for(const sample of samples){
      const nearby=[...layer.lightSites].sort((a,b)=>Math.hypot(a.position.x-sample.x,a.position.z-sample.z)-Math.hypot(b.position.x-sample.x,b.position.z-sample.z)).slice(0,4)
      assert.ok(nearby.some(site=>{
        const from=new T.Vector3(site.position.x,site.position.y,site.position.z),to=new T.Vector3(sample.x,sample.y,sample.z)
        const aim=new T.Vector3(site.target.x,site.target.y,site.target.z).sub(from),d=to.clone().sub(from)
        return d.length()<site.distance&&aim.angleTo(d)<site.angle&&g.physics.lineOfSight(from,to)
      }),`Unlit native route sample ${JSON.stringify(sample)}`)
    }
    t.diagnostic(JSON.stringify({litRouteSamples:samples.length,fixtureSites:layer.lightSites.length,permanentLights:0}))
  }finally{f.dispose()}
})

test('M4-A0 disposal releases owned colliders and geometry while retaining borrowed model resources',async()=>{
  const f=await nativeChapter4Fixture(),{g,layer,assets,chapter3}=f
  try{
    const unrelated=g.physics.addBox([1,0,40],[2,1,41]),before=g.physics.boxes.length,count=layer.snapshot().colliderCount
    let released=0
    for(const asset of [...Object.values(assets.models),...Object.values(chapter3.models)])for(const resource of [asset.geometry,asset.material])resource.addEventListener('dispose',()=>released++)
    layer.dispose();layer.dispose()
    assert.equal(g.physics.boxes.length,before-count);assert.ok(g.physics.boxes.includes(unrelated));assert.equal(released,0)
    assert.equal(layer.snapshot().colliderCount,0)
  }finally{f.dispose()}
})
}
