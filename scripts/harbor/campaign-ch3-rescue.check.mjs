import assert from 'node:assert/strict'
import { test,after } from 'node:test'
import { nativeChapter3Fixture } from './campaign-ch3.check.mjs'
import { CH3 } from './campaign-ch3-layout.mjs'
import { CH3_CLEARANCE_DEPLOYMENTS,CH3_RESCUE_BLOCKERS } from './campaign-ch3-deployment.mjs'
import { installChapter3Rescue,CH3_RESCUE_DOOR as d } from './campaign-ch3-rescue.mjs'

const f=await nativeChapter3Fixture(),{T}=f
after(()=>f.dispose())
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),json=value=>JSON.parse(JSON.stringify(value))
function fixture(){
  let down=false,pressed=false,narrativeActive=false,builds=0,workerDisposed=0
  const commits=[],physics={...f.g.physics,build(){builds++;f.g.physics.build()}}
  const actors=CH3_CLEARANCE_DEPLOYMENTS.map(site=>({id:site.id,pos:v(site.position.x,0,site.position.z),hp:200,alive:true}))
  const sniper={id:'ch3-tower-sniper',pos:v(8,5.2,-154),hp:200,alive:true}
  let blockers=actors.filter(actor=>CH3_RESCUE_BLOCKERS.includes(actor.id))
  const root=new T.Group(),geometry=new T.BoxGeometry(.5,1.75,.4),material=f.g.mats.get('worker-fixture')
  root.add(new T.Mesh(geometry,material))
  const worker={root,dispose(){workerDisposed++},snapshot:()=>({position:root.position.toArray()})}
  const g={...f.g,physics,game:{state:'playing'},time:{frame:1},input:{down:()=>down,pressed:()=>pressed},hud:{setPrompt(){}},
    player:{pos:v(),eye:v(),forward:v(-1,0,0),alive:true,enabled:true}}
  const rescue=installChapter3Rescue(g,{worker,narrative:{snapshot:()=>({active:narrativeActive})},getBlockers:()=>blockers,
    onCheckpoint:event=>commits.push({event,state:json(rescue.capture())})})
  function place(point,target){g.player.pos.copy(point);g.player.eye.copy(point).y+=1.68;g.player.forward.copy(target||v(-45,.172,-142)).sub(point).setY(0).normalize()}
  function release(){down=pressed=false;g.time.frame++;rescue.interact()}
  function press(){release();down=pressed=true;g.time.frame++;return rescue.interact()}
  const clear=()=>{for(const actor of blockers){actor.hp=0;actor.alive=false}rescue.update(0)}
  const control=()=>place(v(-35.7,0,-141.06),v(d.x,1.12,-141.06))
  return {g,rescue,worker,actors,sniper,commits,place,press,release,clear,control,setBlockers(value){blockers=value},setNarrative(value){narrativeActive=value},
    builds:()=>builds,workerDisposed:()=>workerDisposed,cleanup(){rescue.dispose();geometry.dispose()}}
}
function walk(g,from,to,height=1.8){
  const pos=from.clone(),delta=to.clone().sub(from).setY(0),direction=delta.clone().normalize();let hit=false
  for(let moved=0;moved<delta.length()-.001;moved+=.04){const result=g.physics.moveCapsule(pos,direction.clone().multiplyScalar(2).setY(-.16),Math.min(.04,delta.length()-moved)/2,.32,height,true);hit ||= result.hitWall}
  return {pos,hit}
}

test('real door mesh/physics/nav close the only native entrance; opening allows both native capsule heights, walls stay solid',t=>{
  const a=fixture(),{g,rescue}=a,outside=v(-35.5,.172,-142),inside=v(-39,.172,-142)
  try{
    const panel=g.scene.getObjectByName('ch3-repair-door'),rayA=outside.clone().setY(1.3),rayB=inside.clone().setY(1.3),direction=rayB.clone().sub(rayA).normalize()
    const assertMesh=()=>{
      const bounds=new T.Box3().setFromObject(panel),box=rescue.snapshot().doorBox
      assert.ok(bounds.min.distanceTo(v(...box.min))<1e-6);assert.ok(bounds.max.distanceTo(v(...box.max))<1e-6)
    }
    assertMesh();assert.equal(g.physics.lineOfSight(rayA,rayB),false)
    assert.equal(g.physics.raycast(rayA,direction,4)?.box?.tag,'ch3-repair-door')
    assert.ok(new T.Raycaster(rayA,direction,0,4).intersectObject(panel).length)
    assert.equal(g.physics.nav.clearLine(outside,inside),false)
    assert.equal(g.physics.nav.findPath(outside,inside),null)
    for(const h of [1.8,1.15])for(const [from,to]of [[outside,inside],[inside,outside]]){
      const result=walk(g,from,to,h);assert.equal(result.hit,true);assert.ok(result.pos.distanceTo(to)>.5)
      assert.equal(rescue.allowsEnemySegment(from,to,.32,h),false)
    }
    a.clear();a.control();assert.equal(a.press(),true);assertMesh()
    assert.equal(g.physics.lineOfSight(rayA,rayB),true);assert.equal(g.physics.nav.clearLine(outside,inside),true)
    for(const h of [1.8,1.15])for(const [from,to]of [[outside,inside],[inside,outside]]){
      assert.ok(g.physics.nav.findPath(from,to)?.length)
      const result=walk(g,from,to,h)
      assert.ok(Math.hypot(result.pos.x-to.x,result.pos.z-to.z)<.04)
      assert.ok(Math.abs(result.pos.y-(to.x<d.x?d.floor:0))<.01)
      assert.equal(rescue.allowsEnemySegment(from,to,.32,h),true)
    }
    let wallRays=0
    for(const [from,to]of [[v(-43,1.3,-142),v(-43,1.3,-144)],[v(-43,1.3,-142),v(-43,1.3,-140)],[v(-48,1.3,-142),v(-50,1.3,-142)],[v(-43,2.2,-142),v(-43,2.7,-142)]]){
      assert.equal(g.physics.lineOfSight(from,to),false);wallRays++
    }
    t.diagnostic(JSON.stringify({closedCapsuleChecks:4,openCapsulePasses:4,retainedWallRoofRays:wallRays,worker:rescue.snapshot().worker}))
  }finally{a.cleanup()}
})

test('only two local fixed blockers unlock; eleven ordinary actors and live sniper are irrelevant; enter then confirm worker',()=>{
  const a=fixture(),{rescue}=a
  try{
    a.control();assert.equal(a.press(),false);assert.equal(rescue.capture().door,'closed')
    const blockers=a.actors.filter(actor=>CH3_RESCUE_BLOCKERS.includes(actor.id))
    blockers[0].hp=0;blockers[0].alive=false;rescue.update(0);assert.equal(rescue.capture().unlocked,false)
    blockers[1].hp=0;blockers[1].alive=false;rescue.update(0);assert.equal(rescue.capture().unlocked,true)
    assert.equal(a.actors.filter(actor=>actor.alive).length,11);assert.equal(a.sniper.alive,true)
    assert.equal(a.press(),true);assert.equal(rescue.capture().rescued,false)
    const pos=walk(a.g,v(-35.5,.172,-142),v(-43.5,.172,-142)).pos
    assert.ok(pos.distanceTo(v(-43.5,.172,-142))<.04);a.place(pos)
    assert.equal(a.press(),true);assert.equal(rescue.capture().rescued,true)
    assert.equal(a.press(),false);assert.equal(a.commits.filter(c=>c.event.kind==='worker-rescued').length,1)
    assert.deepEqual(a.commits.map(c=>c.event.kind),['repair-unlocked','repair-door-open','worker-rescued'])
    assert.equal(a.commits.at(-1).state.rescued,true)
    assert.deepEqual(json(a.worker.root.position.toArray()),[-45,.172,-142])
    const workerPos=a.worker.root.position.clone(),r=a.g.physics.moveCapsule(workerPos,v(),0,.32,1.8)
    assert.equal(r.hitWall,false);assert.equal(r.hitCeil,false);assert.equal(workerPos.y,.172)
    const visitor=v(CH3.safeHouse.visitor.x,.172,-142);assert.equal(a.g.physics.moveCapsule(visitor,v(),0,.32,1.8).hitWall,false)
  }finally{a.cleanup()}
})

test('incomplete blocker arrays fail closed; unlock and one input edge cannot toggle twice; pause/narrative/dead inputs do not replay',()=>{
  const a=fixture(),{rescue,g}=a
  try{
    const blockers=a.actors.filter(actor=>CH3_RESCUE_BLOCKERS.includes(actor.id))
    for(const list of [[],[blockers[0]],[null,null],[blockers[0],blockers[0]]]){a.setBlockers(list);rescue.update();assert.equal(rescue.capture().unlocked,false)}
    a.setBlockers(blockers);a.clear();a.control()
    for(const mode of ['paused','narrative','dead','disabled']){
      if(mode==='paused')g.game.state='paused'
      if(mode==='narrative')a.setNarrative(true)
      if(mode==='dead')g.player.alive=false
      if(mode==='disabled')g.player.enabled=false
      assert.equal(a.press(),false)
      g.game.state='playing';a.setNarrative(false);g.player.alive=true;g.player.enabled=true;g.time.frame++
      assert.equal(rescue.interact(),false);assert.equal(rescue.capture().door,'closed')
    }
    assert.equal(a.press(),true);assert.equal(rescue.interact(),false)
    for(let i=0;i<5;i++){g.time.frame++;assert.equal(rescue.interact(),false)}
    assert.equal(rescue.capture().door,'open');assert.equal(a.press(),true);assert.equal(rescue.capture().door,'closed')
  }finally{a.cleanup()}
})

test('outside, distant, wrong-facing and through-wall interactions cannot open door or rescue worker; close never crushes aperture',()=>{
  const a=fixture(),{g,rescue}=a
  try{
    a.clear()
    for(const point of [v(-32,0,-141.06),v(-37.5,0,-139.5),v(-37.5,0,-144.5)]){
      a.place(point,v(d.x,1.12,-141.06));assert.equal(a.press(),false);assert.equal(rescue.capture().door,'closed')
    }
    a.control();g.player.forward.multiplyScalar(-1);assert.equal(a.press(),false)
    a.control();assert.equal(a.press(),true)
    a.place(v(d.x,.172,-142),v(d.x+.12,1.12,-141.06));assert.equal(a.press(),false);assert.equal(rescue.capture().door,'open')
    for(const point of [v(-45,0,-139.7),v(-45,0,-144.3),v(-49.8,0,-142),v(-40,.172,-142)]){
      a.place(point);assert.equal(a.press(),false);assert.equal(rescue.capture().rescued,false)
    }
    a.place(v(-43.5,.172,-142));g.player.forward.multiplyScalar(-1);assert.equal(a.press(),false)
  }finally{a.cleanup()}
})

test('JSON restore synchronizes physical door, validates state invariants, keeps resource ownership and only rebuilds on changes',()=>{
  const a=fixture(),{rescue,g}=a
  try{
    const initial=json(rescue.capture()),atStart=a.builds()
    for(let i=0;i<20;i++){rescue.update(.05);rescue.interact()}
    assert.equal(a.builds(),atStart)
    a.clear();assert.equal(a.builds(),atStart);a.control();a.press();assert.equal(a.builds(),atStart+1)
    a.place(v(-43.5,.172,-142));a.press();const saved=json(rescue.capture())
    assert.deepEqual(saved,{version:1,door:'open',unlocked:true,rescued:true})
    rescue.reset();assert.deepEqual(json(rescue.capture()),initial)
    const from=v(-35.5,1.3,-142),to=v(-39,1.3,-142)
    assert.equal(g.physics.lineOfSight(from,to),false)
    rescue.restore(saved);assert.deepEqual(json(rescue.capture()),saved);assert.equal(g.physics.lineOfSight(from,to),true)
    const restoredBuilds=a.builds();rescue.restore(json(saved));assert.equal(a.builds(),restoredBuilds)
    for(const bad of [{...saved,version:2},{...saved,unlocked:false},{...saved,door:'ajar'},{...saved,rescued:1},null]){
      assert.throws(()=>rescue.restore(bad),/Invalid CH3 rescue/);assert.deepEqual(json(rescue.capture()),saved)
    }
    a.control();a.press();const closed=json(rescue.capture());assert.equal(closed.rescued,true);assert.equal(closed.door,'closed')
    rescue.restore(closed);assert.equal(g.physics.lineOfSight(from,to),false)
    let released=0;a.worker.root.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.addEventListener('dispose',()=>released++);mesh.material.addEventListener('dispose',()=>released++)}})
    const count=g.physics.boxes.length;rescue.dispose();rescue.dispose()
    assert.equal(g.physics.boxes.length,count-1);assert.equal(a.worker.root.parent,null);assert.equal(released,0);assert.equal(a.workerDisposed(),0)
    assert.throws(()=>rescue.restore(saved),/disposed/)
  }finally{a.cleanup()}
})
