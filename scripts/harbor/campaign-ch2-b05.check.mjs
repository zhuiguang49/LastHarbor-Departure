import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { test } from 'node:test'
import { nativeFixture, loadChapter2, assertFrozenLayout, frozenB0, adaptLayout, validatePlan, capsulePath, navPath, CH2_STAGE, isMain } from './campaign-ch2.check.mjs'

export const pathLength = points => points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.z-points[i].z),0)
const at = (grid,id) => ({x:grid.minX+(id%grid.w+.5)*grid.cell,y:0,z:grid.minZ+(Math.floor(id/grid.w)+.5)*grid.cell})
const cell = (grid,p) => Math.floor((p.z-grid.minZ)/grid.cell)*grid.w+Math.floor((p.x-grid.minX)/grid.cell)

// QA-only Dijkstra on a copy/read-only view of the native occupancy graph.
// Native diagonal cost/no corner cutting are retained. This does not change
// collider flags, nav inflation, path budget or the runtime graph.
export function gridShortest(grid,from,to,{allow=()=>true,cut=()=>false}={}) {
  const start=cell(grid,from),end=cell(grid,to),cost=new Float64Array(grid.blocked.length).fill(Infinity)
  const parents=new Int32Array(grid.blocked.length).fill(-1),heap=[]
  const push=(id,d)=>{let i=heap.length;heap.push({id,d});while(i){const p=(i-1)>>1;if(heap[p].d<=d)break;heap[i]=heap[p];i=p}heap[i]={id,d}}
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].d<heap[c].d)c++;if(heap[c].d>=last.d)break;heap[i]=heap[c];i=c}heap[i]=last}return top}
  if(grid.blocked[start]!==0||grid.blocked[end]!==0||!allow(at(grid,start))||!allow(at(grid,end)))return null
  cost[start]=0;push(start,0)
  while(heap.length){
    const {id,d}=pop();if(d!==cost[id])continue;if(id===end)break
    const x=id%grid.w,z=Math.floor(id/grid.w),a=at(grid,id)
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dz)continue
      const nx=x+dx,nz=z+dz,next=nz*grid.w+nx
      if(nx<0||nz<0||nx>=grid.w||nz>=grid.h||grid.blocked[next]||dx&&dz&&(grid.blocked[z*grid.w+nx]||grid.blocked[nz*grid.w+x]))continue
      const b=at(grid,next);if(!allow(b)||cut(a,b))continue
      const nd=d+(dx&&dz?1.4142:1)*grid.cell
      if(nd<cost[next]){cost[next]=nd;parents[next]=id;push(next,nd)}
    }
  }
  if(!Number.isFinite(cost[end]))return null
  const ids=[];for(let id=end;id!==-1;id=parents[id])ids.push(id)
  // Preserve the exact endpoints instead of walking out to their cell centres
  // and back (the frozen connection x=-60 lies on a half-metre grid boundary).
  const points=[from,...ids.reverse().slice(1,-1).map(id=>at(grid,id)),to]
  return {gridCost:cost[end],polylineLength:pathLength(points),points}
}

export function portalCrossings(points,portal) {
  const axis=portal.axis,other=axis==='x'?'z':'x',crossings=[]
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],d=b[axis]-a[axis]
    if(Math.abs(d)<1e-10)continue
    const t=(portal.value-a[axis])/d
    if(t<0||t>1)continue
    const value=a[other]+(b[other]-a[other])*t
    if(value>=portal.min-1e-7&&value<=portal.max+1e-7)crossings.push({leg:i,t,value})
  }
  return crossings
}

function assertPortals(points,portals,label) {
  let previous=-1
  for(const portal of portals){
    const crossing=portalCrossings(points,portal).find(c=>c.leg+c.t>previous+1e-8)
    assert.ok(crossing,`${label}: unconstrained native path bypasses ${JSON.stringify(portal)}`)
    previous=crossing.leg+crossing.t
  }
}

function samples(points,step=.5) {
  return points.slice(1).flatMap((b,i)=>{
    const a=points[i],length=Math.hypot(a.x-b.x,a.z-b.z),n=Math.max(1,Math.ceil(length/step))
    return Array.from({length:n},(_,j)=>({x:a.x+(b.x-a.x)*(j+.5)/n,y:1.3,z:a.z+(b.z-a.z)*(j+.5)/n,weight:length/n}))
  })
}

function exposureProxy(g,points,sites) {
  let length=0,exposed=0
  for(const p of samples(points)){
    length+=p.weight
    if(sites.some(s=>Math.hypot(p.x-s.position.x,p.z-s.position.z)<=20&&g.physics.lineOfSight(
      new g.THREE.Vector3(p.x,1.3,p.z),new g.THREE.Vector3(s.position.x,1.3,s.position.z))))exposed+=p.weight
  }
  return {method:'LOS at 1.3m to frozen section-II deployments within 20m; distance-weighted .5m samples; geometry proxy only',
    length,exposedLength:exposed,concealedFraction:1-exposed/length}
}

export function inspectB05(g,layout,layer) {
  assertFrozenLayout(layout)
  const state=layer.snapshot(),plan=validatePlan(adaptLayout(layout)),report={stage:CH2_STAGE,scope:'geometry-only; material doubles cannot accept visuals',shortest:[],worldConnectivity:[],chicanes:[],comparison:null,bypasses:[],failures:[]}
  const check=(label,fn)=>{try{fn()}catch(e){report.failures.push({label,message:e.message,stack:e.stack})}}
  assert.equal(state.stage,CH2_STAGE);assert.equal(state.infectedImplemented,false)
  assert.equal(state.safeZoneProtectionImplemented,false);assert.equal(state.suppliesImplemented,false)
  const grid=g.physics.nav._grid()
  assert.equal(grid.cell,.5);assert.equal(layout.CH2.navRadius,.5);assert.equal(layout.CH2.playerRadius,.32)
  const inYard=p=>p.x>=-160&&p.x<=-60&&p.z>=-300&&p.z<=-180
  const checkPath=(from,to,label)=>{
    const points=navPath(g,from,to,label)
    capsulePath(g,points,`${label}/crouch`,1.15)
    assert.ok(samples(points).every(inYard),`${label}: path escapes CH2 through perimeter`)
    return points
  }
  for(const section of plan.sections){
    for(const reverse of [false,true])check(`${section.id}/${reverse}`,()=>{
      const [from,to]=reverse?[section.points.at(-1),section.points[0]]:[section.points[0],section.points.at(-1)]
      const points=checkPath(from,to,`${section.id}/${reverse?'reverse':'forward'}`)
      const shortest=gridShortest(grid,from,to)
      assert.ok(shortest,'Native reachable endpoints must also be connected in QA graph')
      report.shortest.push({id:section.id,reverse,nativeLength:pathLength(points),gridCost:shortest.gridCost,points,
        authoredLength:pathLength(section.points)})
    })
  }
  // The unchanged native A* stops after 9000 expansions. Even frozen B0's
  // integrated world returns null for this chapter-wide query in both directions.
  // Require the actual occupancy graph's unconstrained shortest path, physically
  // traverse it, and keep the single-query limitation explicit. Section queries
  // above must still succeed in the original API without intermediate waypoints.
  for(const reverse of [false,true])check(`entry-exit/${reverse}`,()=>{
    const ends=[frozenB0.routes.s1[0],frozenB0.routes.s3.at(-1)], [from,to]=reverse?ends.reverse():ends
    const shortest=gridShortest(grid,from,to)
    assert.ok(shortest,'Entry and exit are disconnected in native occupancy')
    assert.ok(samples(shortest.points).every(inYard),'Shortest chapter route escapes CH2 through perimeter')
    for(const height of [1.8,1.15])capsulePath(g,shortest.points,`entry-exit/${reverse}/${height}`,height)
    const V=g.THREE.Vector3,native=g.physics.nav.findPath(new V(from.x,0,from.z),new V(to.x,0,to.z))
    if(native?.length)checkPath(from,to,`entry-exit/native/${reverse}`)
    report.worldConnectivity.push({reverse,from,to,gridCost:shortest.gridCost,length:shortest.polylineLength,points:shortest.points,
      nativeSingleQuery:native?.map(p=>p.toArray())??null,nativeSearchBudget:9000,
      limitation:'Chapter-wide native A* may exhaust its unchanged budget; B1 must validate local pursuit planning separately.'})
  })
  assert.equal(plan.chicanes.filter(c=>c.sectionId==='ch2.s1').length,2,'Exactly two declared first-section S groups required')
  for(const chicane of plan.chicanes)check(chicane.id,()=>{
    assert.ok(chicane.portals.length>=2&&chicane.obstacleIds.length>0)
    assert.ok(chicane.portals.every((p,i)=>!i||p.side!==chicane.portals[i-1].side),`${chicane.id}: sides must alternate`)
    for(const id of chicane.obstacleIds)assert.ok(state.obstacles.some(o=>o.id===id&&o.colliderIds.length),`${id}: missing real obstacle/collision`)
    for(const reverse of [false,true]){
      const points=checkPath(reverse?chicane.exit:chicane.entry,reverse?chicane.entry:chicane.exit,`${chicane.id}/${reverse}`)
      assertPortals(points,reverse?[...chicane.portals].reverse():chicane.portals,chicane.id)
      report.chicanes.push({id:chicane.id,reverse,length:pathLength(points),points})
    }
    for(const portal of chicane.portals)check(`${chicane.id}/${portal.side}/cut`,()=>{
      const bypass=gridShortest(grid,chicane.entry,chicane.exit,{cut:(a,b)=>portalCrossings([a,b],portal).length>0})
      if(bypass)report.bypasses.push({id:chicane.id,portal,...bypass})
      assert.ok(bypass===null,`${chicane.id}: native occupancy permits ${bypass?.polylineLength.toFixed(2)}m bypass around required ${portal.side} portal`)
    })
    const V=g.THREE.Vector3,p=new V(chicane.entry.x,0,chicane.entry.z),delta=new V(chicane.exit.x-p.x,0,chicane.exit.z-p.z)
    for(const height of [1.8,1.15])assert.equal(g.physics.moveCapsule(p.clone(),delta.clone(),1,.32,height).hitWall,true,`${chicane.id}: direct ${height}m chord crosses S`)
  })
  check('same-endpoint-main-maintenance',()=>{
  // Same immutable joins; the channel constraint chooses a route class without
  // injecting author waypoints. Divider's native width is the frozen 2.44m.
  const [from,to]=[frozenB0.routes.maintenance[0],frozenB0.routes.maintenance.at(-1)]
  const west=-135-2.44/2-.5,east=-135+2.44/2+.5
  const domain=p=>inYard(p)&&p.z>=from.z-1.5&&p.z<=to.z+1.5
  const main=gridShortest(grid,from,to,{allow:p=>domain(p)&&p.x>east})
  const maintenance=gridShortest(grid,from,to,{allow:p=>domain(p)&&(p.x<west||p.z<from.z+1.5||p.z>to.z-1.5)})
  assert.ok(main&&maintenance,'Same-endpoint main/maintenance channel shortest paths missing')
  for(const [id,path] of Object.entries({main,maintenance}))for(const h of [1.8,1.15]){
    capsulePath(g,path.points,`${id}/grid/${h}`,h);capsulePath(g,[...path.points].reverse(),`${id}/grid/reverse/${h}`,h)
  }
  const sites=layout.CH2_SPAWNS.filter(s=>s.sectionId==='ch2.s2')
  report.comparison={from,to,constraint:{west,east,south:from.z+1.5,north:to.z-1.5},
    main:{...main,exposure:exposureProxy(g,main.points,sites)},maintenance:{...maintenance,exposure:exposureProxy(g,maintenance.points,sites)},
    target:{ratio:1.2,extraMetres:15},ratio:maintenance.polylineLength/main.polylineLength,extraMetres:maintenance.polylineLength-main.polylineLength}
  assert.ok(report.comparison.ratio>=1.2&&report.comparison.extraMetres>=15,'Maintenance misses predeclared >=1.2x and >=15m shortest-path targets')
  assert.ok(report.comparison.maintenance.exposure.concealedFraction>report.comparison.main.exposure.concealedFraction,'Maintenance geometry proxy provides no greater concealment')
  })
  if(report.failures.length){const error=new AggregateError(report.failures.map(f=>Error(f.message)),'B0.5 geometry checks failed');error.report=report;throw error}
  return report
}

export function assertObstacleSurfaces(g,layer) {
  const T=g.THREE,state=layer.snapshot(),coverage=[]
  layer.root.updateMatrixWorld(true)
  // Match the actual batched instances and native contact handles by identity.
  // Isolate only inside this VM check: nearby closed props can contain the old
  // exterior origins and expose back faces/internal collider subdivision seams.
  // Integrated world reachability, shells and cargo rays are checked separately.
  const originals=[...g.physics.boxes],meshes=new Map()
  layer.root.traverse(batch=>{
    if(!batch.userData.obstacleIds)return
    assert.equal(batch.userData.obstacleIds.length,batch.count)
    batch.userData.obstacleIds.forEach((id,index)=>{
      const mesh=new T.Mesh(batch.geometry,batch.material),matrix=new T.Matrix4()
      batch.getMatrixAt(index,matrix);mesh.matrixAutoUpdate=false
      mesh.matrix.copy(batch.matrixWorld).multiply(matrix);mesh.updateMatrixWorld(true)
      mesh.layers.mask=batch.layers.mask;mesh.name=batch.name;mesh.userData.instance=index
      if(!meshes.has(id))meshes.set(id,[])
      meshes.get(id).push(mesh)
    })
  })
  try {
  for(const item of state.obstacles){
    const boxes=state.colliders.filter(b=>b.obstacleId===item.id)
    assert.equal(boxes.length,item.colliderIds.length)
    assert.ok(boxes.length>0,`${item.id}: no physical parts`)
    assert.ok(meshes.get(item.id)?.length,`${item.id}: missing rendered instances`)
    g.physics.boxes.splice(0,g.physics.boxes.length,...originals.filter(b=>b.obstacleId===item.id))
    const bounds=new T.Box3(),rays=[]
    for(const b of boxes)bounds.union(new T.Box3(new T.Vector3(...b.min),new T.Vector3(...b.max)))
    for(const axis of [0,1,2])for(const reverse of [false,true]){
      if(axis===1&&!reverse)continue // Below-ground underside is not a playable viewpoint.
      const origin=bounds.getCenter(new T.Vector3()),direction=new T.Vector3()
      origin.setComponent(axis,(reverse?bounds.max:bounds.min).getComponent(axis)+(reverse?.5:-.5));direction.setComponent(axis,reverse?-1:1)
      const ray=new T.Raycaster(origin,direction,0,bounds.getSize(new T.Vector3()).getComponent(axis)+1)
      ray.layers.enableAll()
      // CPU triangle rays cannot sample cutout texture holes. Opaque posts and
      // rails still participate; the net has separate player-only contacts.
      const visible=ray.intersectObjects(meshes.get(item.id),false).find(h=>!h.object.material.transparent&&!h.object.material.alphaTest)
      const hit=g.physics.raycast(origin,direction,ray.far),physical=hit?.box?hit.dist:null
      if(visible&&!visible.object.material.transparent){assert.notEqual(physical,null,`${item.id}: visible opaque surface lacks collision`)
        assert.ok(Math.abs(visible.distance-physical)<=.45,`${item.id}: visible/physical surface disagreement ${visible.distance}/${physical}`)}
      if(!visible)assert.equal(physical,null,`${item.id}: collision fills visible empty centre ray axis=${axis} reverse=${reverse} origin=${origin.toArray()}`)
      rays.push({axis,reverse,origin:origin.toArray(),direction:direction.toArray(),far:ray.far,
        visible:visible?.distance??null,physical,analyticGround:hit&&!hit.box?hit.dist:null,
        mesh:visible?.object.name,instance:visible?.object.userData.instance,obstacleId:hit?.box?.obstacleId})
    }
    coverage.push({id:item.id,kind:item.kind,colliderCount:boxes.length,rays})
  }
  } finally {g.physics.boxes.splice(0,g.physics.boxes.length,...originals)}
  return coverage
}

if(isMain(import.meta.url)){
  test('B0.5 QA shortest graph rejects corner cutting and disconnected portal cuts',()=>{
    const grid={w:3,h:3,minX:0,minZ:0,cell:1,blocked:new Uint8Array([0,1,0,1,0,0,0,0,0])}
    assert.equal(gridShortest(grid,{x:.5,z:.5},{x:1.5,z:1.5}),null)
    grid.blocked.fill(0)
    const path=gridShortest(grid,{x:.5,y:0,z:.5},{x:2.5,y:0,z:2.5})
    assert.ok(Math.abs(path.gridCost-2*1.4142)<1e-7)
    assert.equal(gridShortest(grid,{x:.5,z:.5},{x:2.5,z:2.5},{cut:(a,b)=>portalCrossings([a,b],{axis:'x',value:1,min:0,max:3}).length>0}),null)
  })
  test('B0.5 independent B0 coordinates and ordered traversal freeze',async()=>{
    const layout=await import('./campaign-ch2-layout.mjs');assertFrozenLayout(layout)
  })
  test('B0.5 no-waypoint shortest paths, alternating portals, bypass cuts and same-endpoint comparison',async t=>{
    const {layout,build}=await loadChapter2(),{g}=await nativeFixture(),layer=build(g)
    let world
    try{
      g.physics.build()
      const fixture=await nativeFixture(),{buildCampaignSectors}=await import('./campaign-sectors.mjs')
      world=buildCampaignSectors(fixture.g,{chapter2:true});fixture.g.physics.build()
      // The M1+CH2 world does not publish layers without CH1. Reuse the real
      // CH2 snapshot for static metadata; query the integrated world's physics.
      let report,failure
      try{report=inspectB05(fixture.g,layout,layer)}catch(e){report=e.report;failure=e}
      await fs.mkdir('artifacts/harbor/ch2-b05-qa',{recursive:true})
      await fs.writeFile('artifacts/harbor/ch2-b05-qa/geometry-diagnostic.json',JSON.stringify({status:failure?'failed-diagnostic-not-final-freeze':'diagnostic-only-not-final-freeze',integrated:report},null,2))
      if(failure)throw failure
      t.diagnostic(JSON.stringify({scope:report.scope,shortest:report.shortest.map(p=>({id:p.id,reverse:p.reverse,length:p.nativeLength})),comparison:report.comparison}))
    }finally{world?.dispose();layer.dispose()}
  })

  test('B0.5 world perimeter has no standing/crouching physical gaps outside the two frozen links',async t=>{
    const {g,T}=await nativeFixture(),{buildCampaignSectors}=await import('./campaign-sectors.mjs'),world=buildCampaignSectors(g,{chapter2:true})
    const checks=[],leaks=[]
    try{
      for(const axis of ['x','z'])for(const side of [-1,1]){
        const limit=axis==='x'?(side<0?-160:-60):(side<0?-300:-180),other=axis==='x'?'z':'x'
        const min=other==='x'?-159.5:-299.5,max=other==='x'?-60.5:-180.5
        for(const height of [1.8,1.15]){
        // A capsule can cross only at a gap in the actual border contact
        // intervals. Probe every distinct gap/joint, including its two edges,
        // rather than thousands of duplicate moves along solid wall interiors.
        const intervals=g.physics.boxes.filter(b=>!b.bulletOnly&&b.max.y>.42&&b.min.y<height&&
          b.min[axis]<=limit+1.2&&b.max[axis]>=limit-1.2&&b.max[other]>=min&&b.min[other]<=max)
          .map(b=>[Math.max(min,b.min[other]),Math.min(max,b.max[other])]).sort((a,b)=>a[0]-b[0])
        const merged=[]
        for(const interval of intervals){const last=merged.at(-1);if(last&&interval[0]<=last[1])last[1]=Math.max(last[1],interval[1]);else merged.push([...interval])}
        const joints=[min,max,...merged.flatMap(([a,b])=>[a-.34,a+.34,b-.34,b+.34])]
        let previous=min
        for(const [a,b] of [...merged,[max,max]]){if(a>previous)joints.push(previous+.33,a-.33,(previous+a)/2);previous=Math.max(previous,b)}
        for(const value of [...new Set(joints)].filter(v=>v>=min&&v<=max)){
          if(axis==='x'&&side===1&&frozenB0.links.some(l=>value>=l.minZ&&value<=l.maxZ))continue
          const p=new T.Vector3();p[axis]=limit-side*.8;p[other]=value
          const initial=p.clone(),clear=g.physics.moveCapsule(p,new T.Vector3(),0,.32,height)
          if(clear.hitWall||p.distanceTo(initial)>.2)continue // Solid/unsupported approach cannot be entered at this height.
          const velocity=new T.Vector3();velocity[axis]=side*3
          const result=g.physics.moveCapsule(p,velocity,1,.32,height)
          const crossed=side*(p[axis]-limit)>1e-5
          checks.push({axis,side,value,height,crossed,hitWall:result.hitWall,pos:p.toArray()})
          if(crossed)leaks.push(checks.at(-1))
        }
      }
      }
      await fs.mkdir('artifacts/harbor/ch2-b05-qa',{recursive:true})
      await fs.writeFile('artifacts/harbor/ch2-b05-qa/perimeter-diagnostic.json',JSON.stringify({status:'diagnostic-not-final-freeze',checks,leaks},null,2))
      assert.ok(checks.length>0,'No physically clear perimeter approaches tested')
      assert.ok(leaks.length===0,`Physical CH2 perimeter gaps outside frozen connections: ${JSON.stringify(leaks)}`)
      t.diagnostic(JSON.stringify({physicallyClearProbes:checks.length,leaks:leaks.length}))
    }finally{world.dispose()}
  })
  test('B0.5 added interior cargo has its own bidirectional rays independent of the six shell apertures',async()=>{
    const {layout,build}=await loadChapter2(),{g,T}=await nativeFixture(),layer=build(g)
    try{
      for(const id of ['ch2.obstacle.s2.inside-south','ch2.obstacle.s2.inside-north','ch2.obstacle.s3.inside']){
        const item=layout.CH2_OBSTACLES.find(o=>o.id===id);assert.ok(item,`${id}: expected actual cargo missing`)
        const point=side=>new T.Vector3(item.x+Math.cos(item.yaw)*side*.8,item.y+.3,item.z-Math.sin(item.yaw)*side*.8)
        for(const side of [-1,1]){
          const from=point(side),to=point(-side),delta=to.clone().sub(from)
          const hit=g.physics.raycast(from,delta.clone().normalize(),delta.length())
          assert.equal(hit?.box?.obstacleId,id,`${id}: cargo ray missing actual owned physical part`)
          assert.equal(g.physics.lineOfSight(from,to),false,`${id}: cargo leaks LOS`)
        }
      }
    }finally{layer.dispose()}
  })
  test('B0.5 every visible obstacle has physical parts and hollow centre rays remain hollow',async t=>{
    const {build}=await loadChapter2(),{g}=await nativeFixture(),layer=build(g)
    try{
      const coverage=assertObstacleSurfaces(g,layer)
      await fs.mkdir('artifacts/harbor/ch2-b05-qa',{recursive:true})
      await fs.writeFile('artifacts/harbor/ch2-b05-qa/obstacle-surface-diagnostic.json',JSON.stringify({scope:'isolated actual instances/native contact handles; no visual acceptance',coverage},null,2))
      t.diagnostic(JSON.stringify({obstacles:coverage.length,rays:coverage.reduce((sum,item)=>sum+item.rays.length,0)}))
    }finally{layer.dispose()}
  })
  test('B0.5 obstacle surface probes reject absent cloth and filled forklift clearance',async()=>{
    const {build}=await loadChapter2(),{g,T}=await nativeFixture(),layer=build(g),originals=[...g.physics.boxes]
    try{
      const coverage=assertObstacleSurfaces(g,layer)
      const cloth=g.physics.boxes.filter(b=>b.obstacleId==='ch2.obstacle.s2.tarp'&&b.part==='tarp')
      assert.ok(cloth.length>0)
      for(const box of cloth)g.physics.removeBox(box)
      assert.throws(()=>assertObstacleSurfaces(g,layer),/ch2.obstacle.s2.tarp: visible\/physical surface disagreement/)
      g.physics.boxes.splice(0,g.physics.boxes.length,...originals)
      const forklift=coverage.find(item=>item.id==='ch2.obstacle.s1.forklift'),empty=forklift.rays.find(ray=>ray.visible===null&&ray.physical===null)
      assert.ok(empty,'Missing actually hollow forklift probe')
      const center=new T.Vector3(...empty.origin).addScaledVector(new T.Vector3(...empty.direction),empty.far/2)
      const fake=g.physics.addBox(center.clone().addScalar(-.1),center.clone().addScalar(.1),{surface:'metal'})
      fake.obstacleId=forklift.id
      assert.throws(()=>assertObstacleSurfaces(g,layer),/collision fills visible empty centre ray/)
      g.physics.boxes.splice(0,g.physics.boxes.length,...originals)
      assert.doesNotThrow(()=>assertObstacleSurfaces(g,layer))
    }finally{g.physics.boxes.splice(0,g.physics.boxes.length,...originals);layer.dispose()}
  })
}
