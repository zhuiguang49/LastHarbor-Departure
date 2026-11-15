import assert from 'node:assert/strict'
import { test,after } from 'node:test'
import { nativeChapter3Fixture } from './campaign-ch3.check.mjs'
import { capsulePath,navPath } from './campaign-ch2.check.mjs'
import { CH3,CH3_ROUTES } from './campaign-ch3-layout.mjs'
import { CH3_CLEARANCE_DEPLOYMENTS as sites,CH3_RESCUE_BLOCKERS } from './campaign-ch3-deployment.mjs'

// Original native nav (unchanged 9000-node budget), capsules, factories and A0
// assets. No whole-level player, unlimited pathfinder or browser is used here.
const f=await nativeChapter3Fixture(),{g,T}=f
after(()=>f.dispose())
const p=(x,z,y=0)=>new T.Vector3(x,y,z),v=point=>p(point.x,point.z,point.y)
const eye=point=>v(point).add(p(0,0,1.6))
const los=(a,b)=>g.physics.lineOfSight(eye(a),eye(b))
const inside=(point,b)=>point.x>=b.minX&&point.x<=b.maxX&&point.z>=b.minZ&&point.z<=b.maxZ

test('13 fixed identities: 3 central groups of 3, 4 independent west posts, only 2 local blockers',()=>{
  assert.equal(sites.length,13);assert.equal(new Set(sites.map(s=>s.id)).size,13)
  assert.deepEqual(sites.filter(s=>s.route==='central').map(s=>s.id),['c1-1','c1-2','c1-3','c2-1','c2-2','c2-3','c3-1','c3-2','c3-3'])
  for(const group of ['g1','g2','g3'])assert.equal(sites.filter(s=>s.group===group).length,3)
  assert.deepEqual(sites.filter(s=>s.route==='west').map(s=>s.id),['west-1','west-2','west-3','west-4'])
  for(const site of sites){assert.equal(site.group===null,site.route==='west');assert.ok(Number.isFinite(site.yaw));assert.ok(inside(site.position,CH3.bounds))}
  assert.deepEqual(CH3_RESCUE_BLOCKERS,['c3-2','c3-3'])
  for(const id of CH3_RESCUE_BLOCKERS){const site=sites.find(s=>s.id===id);assert.ok(Math.hypot(site.position.x+36.905,site.position.z+142)<5)}
  assert.ok(Math.min(...sites.map(s=>v(s.position).distanceTo(p(-56,-190))))>12,'Do not put soldiers in the 12m entry mouth')
})

test('all 52 home/patrol/cover nodes stand on native ground; 78 bidirectional local nav queries and 26 patrol legs pass',t=>{
  let nodes=0,queries=0,patrolLegs=0
  for(const site of sites){
    assert.equal(site.patrol.length,2);assert.equal(site.cover.length,1)
    for(const point of [site.position,...site.patrol,...site.cover]){
      assert.ok(inside(point,site.territory));assert.equal(g.physics.nav.isWalkable(point.x,point.z),true,`${site.id}: blocked node`)
      const pos=v(point),start=pos.clone(),result=g.physics.moveCapsule(pos,p(0,0),0,.32,1.8)
      assert.equal(result.hitWall,false);assert.equal(result.hitCeil,false);assert.equal(result.onGround,true);assert.ok(pos.distanceTo(start)<1e-8)
      const down=g.physics.raycast(pos.clone().add(p(0,0,.1)),p(0,0,-1),.3)
      // Native terrain is implicit y=0 and is not a box-ray surface.
      assert.equal(pos.y,0);assert.ok(!down||down.point.y<=.001);nodes++
    }
    for(const point of [...site.patrol,...site.cover])for(const [a,b]of [[site.position,point],[point,site.position]]){
      navPath(g,a,b,`${site.id}/local`);queries++
    }
    for(const route of [site.patrol,[...site.patrol].reverse()]){capsulePath(g,route,site.id);patrolLegs++}
  }
  // Authored short patrols do not overlap another soldier's home capsule.
  for(const site of sites)for(const other of sites.filter(s=>s!==site)){
    const a=v(site.patrol[0]),b=v(site.patrol[1]),line=new T.Line3(a,b),nearest=line.closestPointToPoint(v(other.position),true,p(0,0))
    assert.ok(nearest.distanceTo(v(other.position))>.64,`${site.id} patrol intersects ${other.id} home`)
  }
  t.diagnostic(JSON.stringify({nodes,queries,patrolLegs}))
})

test('native walls isolate encounter groups; entry is clear and west posts are staggered behind cargo rows',t=>{
  const probes=[p(-56,-190),p(-20,-190),p(-20,-165),p(-34,-142)]
  const visible=probes.map(point=>({point:point.toArray(),ids:sites.filter(site=>los(point,site.position)).map(s=>s.id)}))
  assert.equal(visible[0].ids.length,0)
  assert.ok(visible[1].ids.some(id=>id.startsWith('c1-')))
  assert.ok(visible[2].ids.some(id=>id.startsWith('c2-')))
  assert.ok(visible[3].ids.some(id=>CH3_RESCUE_BLOCKERS.includes(id)))
  for(const probe of visible)assert.ok(new Set(probe.ids.map(id=>sites.find(s=>s.id===id).group).filter(Boolean)).size<=1,'Three groups have transparent sightlines')
  for(const a of sites.filter(s=>s.group==='g1'))for(const b of sites.filter(s=>s.group==='g3'))assert.equal(los(a.position,b.position),false)
  const west=sites.filter(s=>s.route==='west')
  for(let i=1;i<west.length;i++){
    assert.ok(west[i].position.z-west[i-1].position.z>=11)
    assert.equal(los(west[i-1].position,west[i].position),false,'West guards share a long unobstructed lane')
  }
  t.diagnostic(JSON.stringify(visible))
})

test('both real routes reach the local door apron; central repair approach wraps around screen using native segments',t=>{
  const central=[...CH3_ROUTES.main.slice(0,13),p(-33.5,-113),p(-33.5,-127),p(-56,-127),p(-56,-138.5),p(-33.5,-138.5),p(-34,-142)]
  const west=[...CH3_ROUTES.west.slice(0,7),p(-34,-142)]
  let queries=0
  for(const [id,route]of [['central',central],['west',west]])for(let i=1;i<route.length;i++)for(const reverse of [false,true]){
    navPath(g,reverse?route[i]:route[i-1],reverse?route[i-1]:route[i],`${id}/${i}/${reverse}`);queries++
  }
  assert.equal(los(p(-20,-143),p(-34,-142)),false,'Do not pretend the continuous cargo wall has a local crossing')
  for(const site of sites.filter(s=>s.group==='g3'))navPath(g,site.position,p(-34,-142),`${site.id}/door`)
  t.diagnostic(JSON.stringify({bidirectionalRouteQueries:queries,repairQueries:3,nativeBudget:9000,centralPoints:central.length,westPoints:west.length}))
})

test('west concealment bypass: native crouched route outside all four initial 130-degree/30m post views',t=>{
  const route=[[-56,-190],[-33,-190],[-33,-175],[-51.5,-175],[-51.5,-163],[-33.5,-163],[-33.5,-138.5],[-34,-142]].map(([x,z])=>p(x,z))
  capsulePath(g,route,'west-concealed',1.15)
  for(let i=1;i<route.length;i++)navPath(g,route[i-1],route[i],`west-concealed/${i}`)
  let samples=0
  for(const site of sites.filter(s=>s.route==='west')){
    const source=eye(site.position),forward=p(-Math.sin(site.yaw),-Math.cos(site.yaw))
    for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],steps=Math.ceil(a.distanceTo(b)/.25)
      for(let j=0;j<=steps;j++){
        const target=a.clone().lerp(b,j/steps).setY(1.05),delta=target.clone().sub(source);samples++
        if(delta.length()>30||delta.clone().setY(0).normalize().dot(forward)<Math.cos(65*Math.PI/180))continue
        assert.equal(g.physics.lineOfSight(source,target),false,`${site.id}: uncovered initial-view bypass at ${target.toArray()}`)
      }
    }
  }
  t.diagnostic(JSON.stringify({samples,postFovDegrees:130,range:30,scope:'Initial posts only; moving patrol perception belongs to AI integration'}))
})
