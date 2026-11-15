import assert from 'node:assert/strict'
import { test } from 'node:test'
import { capsulePath, navPath } from './campaign-ch2.check.mjs'
import { nativeChapter4Fixture } from './campaign-ch4.check.mjs'
import { CH4, CH4_SPAWNS } from './campaign-ch4-layout.mjs'
import { CH4_INFECTED_SECTION, CH4_INFECTED_SPAWNS } from './campaign-ch4-infected-layout.mjs'

const p=(x,z)=>({x,y:0,z})
// QA-only local patrol segments. Production keeps the accepted CH2 patrol AI.
const patrolEnds=[p(-75,-91),p(-68.5,-80),p(-73.8,-63),p(-69.3,-49),p(-70.5,-28)]
const mainJoins=[p(-65,-89),p(-72.5,-80),p(-75,-64),p(-64,-50),p(-69.4,-28)]
const length=route=>route.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-route[i].x,p.z-route[i].z),0)

test('M4-A1 fixes five separated ordinary patrols before the closed gate without occupying reinforcement reservations',()=>{
  assert.deepEqual(CH4_INFECTED_SECTION,{id:'ch4-blockade',bounds:{minX:-80,maxX:-60,minZ:-120,maxZ:CH4.gate.position.z}})
  assert.deepEqual(CH4_INFECTED_SPAWNS.map(s=>s.id),Array.from({length:5},(_,i)=>`ch4-infected-${i+1}`))
  const b=CH4_INFECTED_SECTION.bounds
  for(const site of CH4_INFECTED_SPAWNS){
    const p=site.position
    assert.equal(site.sectionId,CH4_INFECTED_SECTION.id)
    assert.equal(site.mode,'ordinary');assert.equal(site.patrol,true);assert.equal(site.omniscientTracking??false,false)
    assert.ok(Number.isFinite(site.initialYaw));assert.equal(p.y,0)
    assert.ok(p.x>b.minX&&p.x<b.maxX&&p.z>b.minZ&&p.z<b.maxZ)
    assert.ok(Math.hypot(p.x-CH4.spawn.x,p.z-CH4.spawn.z)>15,'Spawn is too close to the trial entry')
    for(const other of CH4_INFECTED_SPAWNS)if(site!==other)assert.ok(Math.hypot(p.x-other.position.x,p.z-other.position.z)>6,'Patrols overlap or cluster together')
    for(const reserved of CH4_SPAWNS)assert.ok(Math.hypot(p.x-reserved.position.x,p.z-reserved.position.z)>.32+reserved.radius+1,'Occupied a future reinforcement reservation')
  }
})

test('M4-A1 actual assembled scene supports every spawn, 3m patrol, main-route join and native path to the console',async t=>{
  const f=await nativeChapter4Fixture(),{g,T}=f,b=CH4_INFECTED_SECTION.bounds,measured=[]
  try{
    for(const [index,site]of CH4_INFECTED_SPAWNS.entries()){
      const pos=new T.Vector3(site.position.x,0,site.position.z),stationary=g.physics.moveCapsule(pos,new T.Vector3(),0,.32,1.8)
      assert.equal(stationary.hitWall,false,site.id);assert.equal(stationary.hitCeil,false,site.id)
      assert.ok(pos.distanceTo(new T.Vector3(site.position.x,0,site.position.z))<1e-7,`${site.id}: not standing on unobstructed ground`)
      assert.equal(g.physics.nav.isWalkable(pos.x,pos.z),true,site.id)
      const nearby=g.physics.boxes.filter(box=>/^campaign-ch4-(cargo|vehicle):/.test(box.tag||''))
        .some(box=>new T.Box3(box.min,box.max).distanceToPoint(new T.Vector3(pos.x,1,pos.z))<4)
      assert.ok(nearby,`${site.id}: must be beside actual cargo or equipment`)
      const local=[site.position,patrolEnds[index]]
      assert.ok(Math.abs(length(local)-3)<1e-6)
      capsulePath(g,local,`${site.id}/local-patrol`)
      capsulePath(g,[...local].reverse(),`${site.id}/local-patrol-return`)
      const routes=[]
      for(const [name,target]of [['patrol',patrolEnds[index]],['main',mainJoins[index]],['console',CH4.console.approach]]){
        for(const reverse of [false,true]){
          const from=reverse?target:site.position,to=reverse?site.position:target
          // navPath asserts exact endpoints and replays every native segment
          // with the original 1.8m/.32m capsule, without snapping or teleporting.
          const route=navPath(g,from,to,`${site.id}/${name}/${reverse}`)
          for(const point of route)assert.ok(point.x>b.minX&&point.x<b.maxX&&point.z>b.minZ&&point.z<b.maxZ,'Route escaped the closed chapter corridor')
          routes.push({name,reverse,metres:length(route),points:route})
        }
      }
      measured.push({id:site.id,position:site.position,patrolEnd:patrolEnds[index],routes})
    }
    const entry=new T.Vector3(CH4.spawn.x,1.65,CH4.spawn.z),first=CH4_INFECTED_SPAWNS[0].position
    assert.equal(g.physics.lineOfSight(entry,new T.Vector3(first.x,1.3,first.z)),false,'First patrol should begin behind the first transverse container')
    t.diagnostic(JSON.stringify({actorCount:5,actualActorsCreated:0,patrolMetres:3,measured,
      representativeChase:measured[3].routes.find(r=>r.name==='console'&&!r.reverse),
      representativeHitApproach:{infected:CH4_INFECTED_SPAWNS[0].position,player:mainJoins[0]}}))
  }finally{f.dispose()}
})
