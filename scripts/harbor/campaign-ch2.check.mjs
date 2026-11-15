import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { parse } from '@babel/parser'
import { test } from 'node:test'

export const CH2_STAGE = 'M2-B0.5'
export const frozenB0 = JSON.parse(await fs.readFile(new URL('./fixtures/ch2-b0-coordinates.json', import.meta.url), 'utf8'))

export function assertFrozenLayout(layout) {
  assert.equal(layout.CH2.stage,CH2_STAGE)
  for(const [key,actual] of Object.entries({bounds:layout.CH2.bounds,links:layout.CH2.links,routes:layout.CH2_ROUTES,
    safeZones:layout.CH2_SAFE_ZONES,spawns:layout.CH2_SPAWNS,containers:layout.CH2_CONTAINERS}))
    assert.deepEqual(actual,frozenB0[key],`${key}: changed independently frozen B0 data from ${frozenB0.head}`)
  assert.equal(layout.CH2_CONTAINERS.length,81)
  for(const [id,old] of Object.entries(frozenB0.routes)){
    const route=layout.CH2_TRAVERSAL_ROUTES?.[id]
    assert.ok(route,`PENDING B0.5: missing actual CH2_TRAVERSAL_ROUTES.${id}`)
    let cursor=0
    for(const point of route)if(cursor<old.length&&['x','y','z'].every(axis=>point[axis]===old[cursor][axis]))cursor++
    assert.equal(cursor,old.length,`${id}: frozen points must remain an ordered subsequence`)
  }
}

// Native Three/factories/physics with the same two audited nav-origin adapters
// as campaign-m1. Materials are test doubles; this cannot accept visual quality.
export async function nativeFixture() {
  const bytes = await fs.readFile(new URL('../../几猫国产3A大作_V1-fable5.2.html', import.meta.url))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '9e55b5200b088adaf8e1152da04efc0d3b25e236e6baf2dee96f81e23e084966')
  const html = bytes.toString(), source = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
  const body = parse(source).program.body[0].expression.callee.body.body
  const boundary = body.find(n => n.type === 'VariableDeclaration' && n.declarations.some(d => d.id.name === 'gM'))
  assert.ok(boundary, 'Original application boot boundary changed')
  const nodes = body.filter(n => n.end <= boundary.start), start = nodes[0].start
  let prefix = source.slice(start, nodes.at(-1).end)
  const edits = nodes.flatMap(n => (n.declarations || []).filter(d => ['Ya','ol'].includes(d.id?.name)).map(d => ({
    start: d.init.start - start, end: d.init.end - start, value: d.id.name === 'Ya' ? '-164' : '-344',
  })))
  assert.equal(edits.length, 2)
  for (const edit of edits.sort((a,b) => b.start - a.start)) prefix = prefix.slice(0,edit.start) + edit.value + prefix.slice(edit.end)
  const native = vm.runInNewContext(`(()=>{${prefix};return {THREE:lt,props:Yg,physics:d3,context:ob,merge:By,player:x_}})()`,
    { console, performance, AbortController }, { timeout: 15000 })
  const T = native.THREE, materials = new Map(), calls = []
  const texture = new T.Texture()
  const get = (name, options = {}) => {
    const key = name + JSON.stringify(options)
    if (!materials.has(key)) {
      const material = new T.MeshStandardMaterial({ name, map:texture, vertexColors:!!options.vertexColors,
        transparent:name.startsWith('label_') || name.startsWith('decal_') })
      // Native chainlink is double-sided alpha-cut (.5), not opaque sheet steel.
      if(name==='chainlink'){material.alphaTest=.5;material.side=T.DoubleSide}
      material.defines = { STANDARD:'', SL_TINT:1, SL_TRIPLANAR:'', SL_FX:'' }
      material.onBeforeCompile = () => {}
      material.customProgramCacheKey = () => key
      materials.set(key, material)
    }
    return materials.get(key)
  }
  const forbidden = name => new Proxy({}, { get() { assert.fail(`B0.5 environment accessed ${name}`) } })
  const g = { THREE:T, scene:new T.Scene(), enemies:forbidden('live AI'), render:forbidden('renderer'), events:forbidden('mission events'),
    mats:{ get, label:(text,options) => ({material:get(`label_${text}`,options),aspect:Math.max(1,text.length*.55)}),
      decal:name => ({material:get(`decal_${name}`),aspect:1}),
      emissive:(color,intensity) => { const m=get(`emissive_${color}_${intensity}`);m.emissive.set(color);m.emissiveIntensity=intensity;return m } },
  }
  g.physics = native.physics(g)
  g.physics.bounds.min.set(-160,0,-340)
  const props = native.props(g)
  g.props = { build(name,options) { calls.push({name,options});return props.build(name,options) } }
  g.campaignFactories = { context:() => native.context(g), merge:native.merge }
  const {createPickupModel}=await import('./campaign-pickup-asset.mjs')
  g.campaignAssets={createPickupModel,pickupTexture:new T.Texture()}
  return {g,T,calls,createPlayer:native.player}
}

export async function loadChapter2() {
  const layout = await import('./campaign-ch2-layout.mjs')
  const environment = await import('./campaign-ch2-environment.mjs')
  assert.equal(typeof environment.buildChapter2Environment, 'function', `Missing environment builder; exports: ${Object.keys(environment)}`)
  return {layout,build:environment.buildChapter2Environment}
}

// QA-local schema, mapped only here from the layout owner's actual exports.
// route: point[]; branches: {id,points:point[]}[]
// safeZones: {id,center,bounds:{minX,maxX,minZ,maxZ},entrance:point[]}[]
// spawnPoints: {id,segment:1|2|3,position:point}[]
// openContainers: {id,path:point[],solidRays:{from,to}[]}[] (sides, roof, floor)
// obliqueEdges: {id,clearPath:point[],blockedRay:{from,to},blockedPath:point[]}[]
// Points use {x,y,z}; route starts inside CH2 and ends inside Berth 6.
export function adaptLayout(layout) {
  const {CH2,CH2_TRAVERSAL_ROUTES:CH2_ROUTES,CH2_SAFE_ZONES,CH2_SPAWNS,CH2_CONTAINERS,chapter2Transform}=layout
  assertFrozenLayout(layout)
  assert.ok(CH2&&CH2_ROUTES&&CH2_SAFE_ZONES&&CH2_SPAWNS&&CH2_CONTAINERS&&chapter2Transform,
    `CH2 layout contract changed; adapt its actual exports: ${Object.keys(layout)}`)
  const point=(item,x,y,z)=>{const p=chapter2Transform(item,[x,y,z]);return {x:p[0],y:p[1],z:p[2]}}
  const through=item=>{
    const half=(item.name==='container40'?12.19:6.06)/2
    // QA mapping for the actual three local cargo placements. Apertures are
    // tested separately; these chords exercise the real staggered aisle.
    const local=item.id==='open-maze'?[[-half-1.5,0,0],[-1.65,.172,.45],[0,.172,0],[1.65,.172,-.45],[half+1.5,0,0]]:
      item.id==='open-exit'?[[-half-1.5,0,0],[0,.172,0],[1.65,.172,-.45],[half+1.5,0,0]]:
      [[-half-1.5,0,0],[0,.172,0],[half+1.5,0,0]]
    return local.map(p=>point(item,...p))
  }
  const edge=CH2_CONTAINERS.find(item=>item.id==='s2-oblique.0')
  assert.ok(edge,'Actual oblique container was removed; choose a replacement probe')
  const ray=(item,from,to)=>({from:point(item,...from),to:point(item,...to)})
  assert.ok(layout.CH2_OBSTACLES?.length&&layout.CH2_CHICANES?.length>=2,'PENDING B0.5: obstacles/chicanes not declared')
  const surveys=layout.CH2_CHICANES.map(c=>{
    const start=CH2_ROUTES.s1.findIndex(p=>p.x===c.entry.x&&p.z===c.entry.z)
    const end=CH2_ROUTES.s1.findIndex((p,i)=>i>start&&p.x===c.exit.x&&p.z===c.exit.z)
    assert.ok(start>=0&&end>start,`${c.id}: actual traversal does not contain frozen entry/exit`)
    return {id:c.id,points:CH2_ROUTES.s1.slice(start,end+1)}
  })
  return {stage:CH2_STAGE,surveys,chicanes:layout.CH2_CHICANES,obstacles:layout.CH2_OBSTACLES,sections:['s1','s2','s3'].map(id=>({id,points:CH2_ROUTES[id]})),route:[{x:-61.5,y:0,z:CH2_ROUTES.s1[0].z},...CH2_ROUTES.s1.slice(1),
    // Keep the last yard sample inside its sector despite .45m native walking
    // tolerance. The following -56m point separately proves the real crossing.
    ...CH2_ROUTES.s2.slice(1),...CH2_ROUTES.s3.slice(1).map(p=>p.x===-60?{...p,x:-60.75}:p),
    {x:-56,y:0,z:CH2_ROUTES.s3.at(-1).z}],
    branches:['s1Branch','maintenance'].map(id=>({id,points:CH2_ROUTES[id]})),
    safeZones:CH2_SAFE_ZONES.map(zone=>({id:zone.id,center:zone.position,bounds:zone.bounds,
      entrance:[zone.entrances[0].outside,zone.entrances[0].inside,zone.position,zone.entrances[1].inside,zone.entrances[1].outside]})),
    spawnPoints:CH2_SPAWNS.map(site=>({id:site.id,segment:Number(site.sectionId.at(-1)),position:site.position})),
    openContainers:CH2_CONTAINERS.filter(item=>item.open).map(item=>({id:item.id,path:through(item),
      apertureRays:[-1,1].flatMap(end=>[false,true].flatMap(reverse=>[.4,1.3,2.2].flatMap(height=>
        [-.9,-.7,-.3,-.1,0,.1,.3,.7,.9].map(offset=>{
          const half=(item.name==='container40'?12.19:6.06)/2
          const inside=[end*(half-.25),height,offset],outside=[end*(half+.2),height,offset]
          return ray(item,...(reverse?[outside,inside]:[inside,outside]))
        })))),
      solidRays:[ray(item,[-2.5,1.3,.9],[-2.5,1.3,1.4]),ray(item,[-2.5,1.3,-.9],[-2.5,1.3,-1.4]),
        ray(item,[-2.5,2.3,0],[-2.5,2.8,0]),ray(item,[-2.5,.3,0],[-2.5,-.1,0])],
      interiorPoint:point(item,0,.172,0)})),
    obliqueEdges:[{id:edge.id,clearPath:[point(edge,-4.3,0,2.3),point(edge,4.3,0,2.3)],
      blockedRay:ray(edge,[0,1.3,2.3],[0,1.3,.7]),blockedPath:[point(edge,0,0,2.3),point(edge,0,0,.7)]}],
  }
}

export function validatePlan(plan) {
  assert.equal(plan.stage,CH2_STAGE)
  const finite = p => assert.ok(p && [p.x,p.y,p.z].every(Number.isFinite), `Invalid QA point ${JSON.stringify(p)}`)
  assert.ok(plan.route.length>=4,'Missing three-segment main route')
  assert.ok(plan.branches.length>=1,'Missing real reconnecting branch')
  assert.equal(plan.safeZones.length,3)
  assert.equal(plan.spawnPoints.length,18,'B0.5 reserves exactly 18 fixed positions; it does not spawn AI')
  assert.equal(new Set(plan.spawnPoints.map(p=>p.id)).size,18,'Duplicate SpawnID')
  assert.equal(new Set(plan.spawnPoints.map(p=>`${p.position.x},${p.position.z}`)).size,18,'Duplicate spawn position')
  for(const segment of [1,2,3])assert.equal(plan.spawnPoints.filter(p=>p.segment===segment).length,6,`Segment ${segment} must reserve six fixed positions`)
  const within=(p,b,margin=0)=>p.x>=b.minX-margin&&p.x<=b.maxX+margin&&p.z>=b.minZ-margin&&p.z<=b.maxZ+margin
  const bounds={minX:-160,maxX:-60,minZ:-300,maxZ:-180}
  for(const zone of plan.safeZones){
    finite(zone.center);assert.ok(within(zone.center,zone.bounds));assert.ok(within(zone.center,bounds))
    assert.ok(zone.bounds.minX<zone.bounds.maxX&&zone.bounds.minZ<zone.bounds.maxZ)
    assert.ok(zone.entrance.length>=2,`${zone.id}: no physical entrance route`)
    zone.entrance.forEach(finite)
  }
  for(const spawn of plan.spawnPoints){
    finite(spawn.position);assert.ok(within(spawn.position,bounds),`${spawn.id}: outside fixed CH2 bounds`)
    for(const zone of plan.safeZones)assert.equal(within(spawn.position,zone.bounds,.5),false,`${spawn.id}: intersects safe zone ${zone.id} or its nav clearance`)
  }
  plan.route.forEach(finite)
  assert.ok(plan.route[0].x<-60&&Math.abs(plan.route[0].z+285)<6,'Route must begin at the real five-to-yard mouth')
  assert.ok(plan.route.at(-1).x>-60&&Math.abs(plan.route.at(-1).z+190)<6,'Route must physically cross into Berth 6')
  for(const branch of plan.branches){assert.ok(branch.points.length>=3);branch.points.forEach(finite)}
  assert.ok(plan.openContainers.length>=5,'Need cargo openings plus three real traversable safe shells')
  assert.ok(plan.obliqueEdges.length>=1,'Need an oblique-edge collision probe')
  for(const box of plan.openContainers){
    assert.equal(box.apertureRays.length,108,`${box.id}: two ends/both directions/three heights/nine offsets required`)
    assert.ok(box.path.length>=3,`${box.id}: doorway/interior/exit route missing`)
    assert.ok(box.solidRays.length>=3,`${box.id}: side/roof/floor ray coverage missing`)
    box.path.forEach(finite)
    for(const ray of box.solidRays){finite(ray.from);finite(ray.to)}
  }
  for(const edge of plan.obliqueEdges){
    assert.ok(edge.clearPath.length>=2&&edge.blockedPath.length===2)
    edge.clearPath.forEach(finite);edge.blockedPath.forEach(finite)
    finite(edge.blockedRay.from);finite(edge.blockedRay.to)
  }
  return plan
}

// Pure read-only query against either the VM fixture or the live native world.
// Serializable function: browser harness invokes the identical probes.
export function inspectNative(g, plan) {
  const V=g.THREE.Vector3, v=p=>new V(p.x,p.y,p.z)
  const nav=(from,to)=>({from,to,startWalkable:g.physics.nav.isWalkable(from.x,from.z),
    endWalkable:g.physics.nav.isWalkable(to.x,to.z),path:g.physics.nav.findPath(v(from),v(to))?.map(p=>p.toArray())||null})
  const ray=({from,to})=>{
    const start=v(from),end=v(to),delta=end.clone().sub(start),length=delta.length()
    const hit=g.physics.raycast(start,delta.normalize(),length)
    return {from,to,los:g.physics.lineOfSight(start,end),hit:hit?{dist:hit.dist,point:hit.point.toArray(),tag:hit.box?.tag,surface:hit.surface}:null}
  }
  const paths=[{id:'main',points:plan.route},...plan.branches,...plan.safeZones.map(z=>({id:z.id,points:z.entrance})),
    ...plan.openContainers.map(b=>({id:b.id,points:b.path}))]
  return {chapterWideDiagnostic:[false,true].map(reverse=>{
      const ends=[plan.sections[0].points[0],plan.sections.at(-1).points.at(-1)]
      return {reverse,nativeSearchBudget:9000,...nav(...(reverse?ends.reverse():ends))}
    }),shortest:[...plan.sections.map(s=>({id:s.id,from:s.points[0],to:s.points.at(-1)})),
      ...plan.chicanes.map(c=>({id:c.id,from:c.entry,to:c.exit,portals:c.portals}))].flatMap(s=>[false,true].map(reverse=>({id:s.id,reverse,
        portals:s.portals?(reverse?[...s.portals].reverse():s.portals):null,...nav(reverse?s.to:s.from,reverse?s.from:s.to)}))),
    paths:paths.map(p=>({id:p.id,legs:p.points.slice(1).flatMap((to,i)=>[nav(p.points[i],to),nav(to,p.points[i])])})),
    spawns:plan.spawnPoints.map(p=>({id:p.id,walkable:g.physics.nav.isWalkable(p.position.x,p.position.z)})),
    openContainers:plan.openContainers.map(b=>({id:b.id,openRays:b.apertureRays.map(ray),solidRays:b.solidRays.map(ray)})),
    obliqueEdges:plan.obliqueEdges.map(e=>({id:e.id,solid:ray(e.blockedRay)}))}
}

export function assertNativeProbes(probes) {
  for(const leg of probes.shortest){
    assert.equal(leg.startWalkable,true,`${leg.id}: shortest start blocked`);assert.equal(leg.endWalkable,true,`${leg.id}: shortest end blocked`)
    assert.ok(leg.path?.length,`${leg.id}: shortest missing`)
    assert.ok(Math.hypot(leg.path.at(-1)[0]-leg.to.x,leg.path.at(-1)[2]-leg.to.z)<1e-6,`${leg.id}: shortest snapped endpoint`)
    const points=[[leg.from.x,leg.from.y,leg.from.z],...leg.path];let previous=-1
    for(const portal of leg.portals||[]){
      const axis=portal.axis==='x'?0:2,other=axis===0?2:0;let crossing=null
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],delta=b[axis]-a[axis];if(Math.abs(delta)<1e-10)continue
        const t=(portal.value-a[axis])/delta,value=a[other]+(b[other]-a[other])*t
        if(t>=0&&t<=1&&value>=portal.min&&value<=portal.max&&i+t>previous){crossing=i+t;break}
      }
      assert.notEqual(crossing,null,`${leg.id}: no-waypoint native path bypassed ${portal.side} portal`);previous=crossing
    }
  }
  for(const route of probes.paths)for(const leg of route.legs){
    assert.equal(leg.startWalkable,true,`${route.id}: native start blocked`)
    assert.equal(leg.endWalkable,true,`${route.id}: native end blocked`)
    assert.ok(leg.path?.length,`${route.id}: no native nav route`)
    assert.ok(Math.hypot(leg.path.at(-1)[0]-leg.to.x,leg.path.at(-1)[2]-leg.to.z)<1e-6,`${route.id}: snapped destination`)
  }
  for(const spawn of probes.spawns)assert.equal(spawn.walkable,true,`${spawn.id}: native nav rejects fixed point`)
  for(const box of probes.openContainers){
    for(const ray of box.openRays){assert.equal(ray.los,true,`${box.id}: hidden closed doorway collider`);assert.equal(ray.hit,null)}
    for(const ray of box.solidRays){assert.equal(ray.los,false,`${box.id}: missing shell LOS obstruction`);assert.equal(ray.hit?.tag,'campaign-ch2-shell')}
  }
  for(const edge of probes.obliqueEdges){assert.equal(edge.solid.los,false,`${edge.id}: oblique wall leaks LOS`);assert.equal(edge.solid.hit?.tag,'campaign-ch2-shell')}
}

// Walk each physical chord in small steps; never let the native nav silently
// snap an unreachable destination to a nearby cell and count that as success.
export function capsulePath(g, points, label, height=1.8) {
  assert.ok(points.length >= 2, `${label}: missing route`)
  const V = g.THREE.Vector3, pos = new V(points[0].x,points[0].y || 0,points[0].z)
  for (const target of points.slice(1)) {
    const end = new V(target.x,target.y || 0,target.z), direction = new V(end.x-pos.x,0,end.z-pos.z), length = direction.length()
    if (length < 1e-8) continue
    direction.normalize()
    for (let moved=0; moved<length-1e-8; moved+=.1) {
      const result=g.physics.moveCapsule(pos,direction.clone().multiplyScalar(3),Math.min(.1,length-moved)/3,.32,height)
      assert.equal(result.hitWall,false,`${label}: capsule blocked at ${pos.toArray()} toward ${end.toArray()}`)
      assert.equal(result.hitCeil,false,`${label}: ${height}m capsule hit ceiling`)
    }
    assert.ok(Math.hypot(pos.x-end.x,pos.z-end.z)<.04&&Math.abs(pos.y-end.y)<=.42,
      `${label}: capsule endpoint ${pos.toArray()} != ${end.toArray()}`)
  }
  return pos
}

export function navPath(g, from, to, label) {
  const V=g.THREE.Vector3
  for(const p of [from,to])assert.equal(g.physics.nav.isWalkable(p.x,p.z),true,`${label}: unwalkable endpoint ${JSON.stringify(p)}`)
  const route=g.physics.nav.findPath(new V(from.x,0,from.z),new V(to.x,0,to.z))
  assert.ok(route?.length,`${label}: no native nav path`)
  assert.ok(route.at(-1).distanceTo(new V(to.x,0,to.z))<1e-7,`${label}: native nav snapped endpoint`)
  const points=[from,...route.map(p=>({x:p.x,y:p.y,z:p.z}))]
  capsulePath(g,points,`${label}/nav-capsule`)
  return points
}

// Use the ray's actual longitudinal position, with radius clearance from its
// inside origin. Moving the old .5m ray delta from the box centre never reached
// a side wall; starting at the ray itself embeds a .32m capsule in that wall.
export function shellCapsule(g, box, ray, height=1.8) {
  const V=g.THREE.Vector3,from=new V(ray.from.x,ray.from.y,ray.from.z),to=new V(ray.to.x,ray.to.y,ray.to.z)
  const delta=to.clone().sub(from),side=Math.abs(delta.y)<.01,direction=delta.clone().normalize(),radius=.32
  assert.ok(side||delta.y>0,`${box.id}: capsule probe must target side or roof`)
  const hit=g.physics.raycast(from,direction,delta.length())
  const pos=new V(from.x,box.interiorPoint.y,from.z)
  if(side)pos.addScaledVector(direction,-radius)
  const start=pos.clone(),initial=g.physics.moveCapsule(pos,new V(),0,radius,height)
  assert.equal(initial.hitWall,false,`${box.id}: shell probe starts embedded`)
  assert.equal(initial.hitCeil,false,`${box.id}: shell probe starts in ceiling`)
  assert.ok(pos.distanceTo(start)<1e-7,`${box.id}: shell probe starts above/below supported floor`)
  const length=side?delta.length()+radius:to.y-height-pos.y,path=[]
  assert.ok(length>0,`${box.id}: shell probe does not reach solid`)
  let blocked=false
  for(let moved=0;moved<length-1e-8;moved+=3/60){
    const before=pos.toArray(),result=g.physics.moveCapsule(pos,direction.clone().multiplyScalar(3),Math.min(3/60,length-moved)/3,radius,height)
    blocked ||= side?result.hitWall:result.hitCeil
    path.push({from:before,to:pos.toArray(),...result})
    if(side)assert.ok(Math.abs(pos.y-start.y)<1e-7,`${box.id}: shell probe climbed an obstacle`)
    else assert.equal(result.hitWall,false,`${box.id}: roof probe drifted into a wall`)
  }
  const label=height===1.8?'standing':'crouching'
  assert.equal(blocked,true,`${box.id}: ${label} capsule crossed ${side?'side wall':'roof'}`)
  assert.equal(hit?.box?.tag,'campaign-ch2-shell',`${box.id}: probe did not target native shell`)
  const contact=pos.clone()
  if(side){contact.addScaledVector(direction,radius);contact.y=hit.point.y}
  else contact.y+=height
  assert.ok(contact.distanceTo(hit.point)<1e-6,`${box.id}: capsule stopped at another obstacle instead of shell`)
  if(!side)assert.ok(pos.y+height<=2.5+1e-7,`${box.id}: capsule head crossed roof underside`)
  return {id:box.id,height,part:side?'side':'roof',start:start.toArray(),initial,ray,
    hit:{distance:hit.dist,point:hit.point.toArray(),tag:hit.box.tag},path}
}

export const isMain = url => !!process.argv[1] && url === pathToFileURL(path.resolve(process.argv[1])).href

if(isMain(import.meta.url)){
  test('B0.5 open-container rendered apertures agree with physical openings',async()=>{
    const {layout,build}=await loadChapter2(),{g,T}=await nativeFixture(),layer=build(g)
    try{
      layer.root.updateMatrixWorld(true)
      for(const box of layout.CH2_CONTAINERS.filter(box=>box.open)){
        const half=(box.name==='container40'?12.19:6.06)/2
        // Native steel is front-sided: an outward-facing rear panel is invisible
        // to inside-only rays even when it still renders across a physical exit.
        for(const end of [-1,1])for(const reverse of [false,true])for(const height of [.4,1.3,2.2])for(const offset of [-.9,-.7,-.3,-.1,0,.1,.3,.7,.9]){
          const inside=new T.Vector3(...layout.chapter2Transform(box,[end*(half-.25),height,offset]))
          const outside=new T.Vector3(...layout.chapter2Transform(box,[end*(half+.2),height,offset]))
          const from=reverse?outside:inside,to=reverse?inside:outside
          const delta=to.clone().sub(from),ray=new T.Raycaster(from,delta.clone().normalize(),0,delta.length())
          assert.equal(g.physics.raycast(from,delta.clone().normalize(),delta.length()),null,`${box.id}: physical aperture blocked`)
          const hits=ray.intersectObject(layer.root,true)
          assert.equal(hits.length,0,`${box.id}: visible end ${end} blocks ${reverse?'outside-in':'inside-out'} aperture at ${height}/${offset}: ${hits[0]?.distance}`)
        }
      }
    }finally{layer.dispose()}
  })
  test('B0.5 inner storage perimeter prevents skipping the middle section',async()=>{
    const {buildCampaignSectors}=await import('./campaign-sectors.mjs')
    const {g,T}=await nativeFixture(),world=buildCampaignSectors(g,{chapter2:true})
    try{
      g.physics.build()
      const from=new T.Vector3(-120.5,0,-267),to=new T.Vector3(-65,0,-190.5)
      const route=g.physics.nav.findPath(from,to)
      assert.ok(route?.length,'A to C must remain reachable')
      assert.ok(route.at(-1).distanceTo(to)<1e-7)
      let previous=from
      for(const next of route){
        const length=previous.distanceTo(next)
        for(let distance=0;distance<length;distance+=.1){
          const p=previous.clone().lerp(next,distance/length)
          if(p.z>-262&&p.z<-202)assert.ok(p.x<-113,`Native route skips II via inner stockyard: ${p.toArray()}`)
        }
        previous=next
      }
      for(const z of [-266,-200]){
        const p=new T.Vector3(-120.5,0,z)
        assert.equal(g.physics.moveCapsule(p,new T.Vector3(3,0,0),8).hitWall,true)
        assert.ok(p.x<-112,'Capsule crossed the inner storage bank')
      }
    }finally{world.dispose()}
  })
  test('B0.5 exports environment-only layer and retains unrelated colliders on dispose',async()=>{
    const {build}=await loadChapter2(),{g,calls}=await nativeFixture()
    const unrelated=g.physics.addBox([0,0,40],[1,1,41],{tag:'test-unrelated'})
    const layer=build(g)
    try{
      for(const name of ['root','chunks','lightSites','landmarks','interiorBoxes','snapshot','dispose'])assert.ok(layer[name],`Missing environment contract ${name}`)
      assert.equal(layer.root.parent,null,'Integration owner mounts environment')
      assert.ok(layer.chunks.length>0);assert.ok(layer.interiorBoxes.length>=2)
      assert.ok(calls.some(p=>p.name==='container40'));assert.ok(g.physics.boxes.length>1)
      for(const chunk of layer.chunks){
        assert.equal(chunk.root.position.length(),0);assert.ok([chunk.root.rotation.x,chunk.root.rotation.y,chunk.root.rotation.z].every(v=>v===0))
        assert.deepEqual(Array.from(chunk.root.scale.toArray()),[1,1,1])
      }
      layer.root.traverse(mesh=>{if(mesh.isMesh)for(const a of Object.values(mesh.geometry.attributes))assert.ok(a.array.every(Number.isFinite))})
      const before=g.physics.boxes.length
      for(const chunk of layer.chunks)chunk.root.visible=false
      assert.equal(g.physics.boxes.length,before,'Culling removed physical cover')
      assert.doesNotThrow(()=>JSON.stringify(layer.snapshot()))
    }finally{layer.dispose();layer.dispose()}
    assert.equal(g.physics.boxes.length,1);assert.equal(g.physics.boxes[0],unrelated)
  })
  test('B0.5 fixed 6×3 positions, main/branch/safe entrances, open shells and oblique edges agree with native capsule/nav/LOS',async t=>{
    const {layout,build}=await loadChapter2(),plan=validatePlan(adaptLayout(layout)),{g}=await nativeFixture(),layer=build(g)
    try{
      g.physics.build()
      const probes=inspectNative(g,plan);assertNativeProbes(probes)
      for(const site of plan.spawnPoints)for(const height of [1.8,1.15]){
        const V=g.THREE.Vector3,pos=new V(site.position.x,site.position.y,site.position.z)
        const result=g.physics.moveCapsule(pos,new V(),0,.32,height)
        assert.equal(result.hitWall,false,`${site.id}: ${height}m capsule overlaps solid`)
        assert.ok(Math.abs(pos.y-site.position.y)<=.172+1e-6,`${site.id}: spawn lifted onto obstacle`)
        for(const [x,z] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const next=pos.clone(),step=g.physics.moveCapsule(next,new V(x,0,z),.15,.32,height)
          assert.equal(step.hitWall,false,`${site.id}: ${height}m initial clearance blocked ${x}/${z}`)
        }
      }
      const paths=[{id:'main',points:plan.route},...plan.branches,...plan.safeZones.map(z=>({id:z.id,points:z.entrance})),
        ...plan.openContainers.map(b=>({id:b.id,points:b.path})),...plan.obliqueEdges.map(e=>({id:e.id,points:e.clearPath}))]
      for(const route of paths){
        for(const height of [1.8,1.15]){
          capsulePath(g,route.points,`${route.id}/${height}`,height);capsulePath(g,[...route.points].reverse(),`${route.id}/${height}/reverse`,height)
        }
        for(let i=1;i<route.points.length;i++)navPath(g,route.points[i-1],route.points[i],route.id)
      }
      for(const box of plan.openContainers){
        const center=box.interiorPoint
        assert.ok(layer.interiorBoxes.some(b=>center.x>b.min.x&&center.x<b.max.x&&center.z>b.min.z&&center.z<b.max.z&&b.min.y<1.3&&b.max.y>1.3),
          `${box.id}: missing native rain/audio interior volume`)
        for(const height of [1.8,1.15])for(const ray of box.solidRays.filter(r=>r.to.y>=r.from.y))shellCapsule(g,box,ray,height)
      }
      for(const edge of plan.obliqueEdges){
        const [from,to]=edge.blockedPath,V=g.THREE.Vector3,pos=new V(from.x,from.y,from.z),delta=new V(to.x-from.x,0,to.z-from.z)
        assert.equal(g.physics.moveCapsule(pos,delta.clone().normalize().multiplyScalar(3),delta.length()/3).hitWall,true,`${edge.id}: capsule crossed oblique solid`)
        assert.ok(pos.distanceTo(new V(to.x,to.y,to.z))>.1)
      }
      const state=layer.snapshot()
      assert.equal(state.stage,CH2_STAGE);assert.equal(state.layout.stage,CH2_STAGE)
      assert.equal(state.infectedImplemented,false);assert.equal(state.safeZoneProtectionImplemented,false);assert.equal(state.suppliesImplemented,false)
      assert.equal(state.permanentLights,0);assert.equal(layer.lightSites.length,3)
      assert.ok(layer.lightSites.every(s=>s.circuit==='battery'&&s.sectorId==='blackbox-yard'))
      t.diagnostic(JSON.stringify({scope:'B0.5 geometry only; no AI safety/persistence/supplies acceptance',
        routeLegs:probes.paths.reduce((n,p)=>n+p.legs.length,0),fixedPoints:probes.spawns.length,
        openContainers:probes.openContainers.length,obliqueEdges:probes.obliqueEdges.length,
        containers:state.containerCount,colliders:state.colliderCount,lightSites:state.lightSiteCount,nativeNavCell:g.physics.nav._grid().cell}))
    }finally{layer.dispose()}
  })
  test('B0.5 shell capsule probes reject removed side walls and roofs',async t=>{
    const {layout,build}=await loadChapter2(),plan=validatePlan(adaptLayout(layout)),{g,T}=await nativeFixture(),layer=build(g)
    let rejected=0
    try{
      for(const box of plan.openContainers)for(const ray of box.solidRays.filter(r=>r.to.y>=r.from.y)){
        for(const height of [1.8,1.15])shellCapsule(g,box,ray,height)
        const from=new T.Vector3(ray.from.x,ray.from.y,ray.from.z),delta=new T.Vector3(ray.to.x-from.x,ray.to.y-from.y,ray.to.z-from.z)
        const hit=g.physics.raycast(from,delta.clone().normalize(),delta.length()),index=g.physics.boxes.indexOf(hit.box)
        assert.ok(index>=0);g.physics.boxes.splice(index,1)
        try{
          assert.equal(g.physics.boxes.includes(hit.box),false,'Fault injection did not remove the real shell collider')
          for(const height of [1.8,1.15]){
            assert.throws(()=>shellCapsule(g,box,ray,height),/capsule crossed (side wall|roof)/,`${box.id}: missing shell escaped capsule probe`)
            rejected++
          }
        }finally{g.physics.boxes.splice(index,0,hit.box)}
        for(const height of [1.8,1.15])shellCapsule(g,box,ray,height)
      }
      assert.equal(rejected,36)
      t.diagnostic(JSON.stringify({scope:'VM-only real-collider removal; no production or browser mutation',rejected}))
    }finally{layer.dispose()}
  })
}
