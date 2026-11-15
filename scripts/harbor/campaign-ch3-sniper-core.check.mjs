import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { SNIPER_CONFIG as tuning } from './campaign-ch3-sniper-config.mjs'
import { createSniperCore, rayCapsuleDistance } from './campaign-ch3-sniper-core.mjs'

// Only native Three and empty physics: no level, renderer, browser or service.
const {g,T}=await nativeFixture(),physics=g.physics
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z)
const close=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`)
function fixture({nativeWorld=false,config={},onFire=()=>{}}={}) {
  for(const box of [...physics.boxes])physics.removeBox(box)
  const shots=[],states=[],aims=[],cancels=[],order=[]
  const player={position:v(0,0,-10),radius:.32,height:1.8}
  const muzzle=v(0,1.4,0),target=v(0,1.4,-10)
  let visible=true,queries=0,visuals=0,worldHit=null
  const callbacks={
    getVisibleTarget(){
      queries++;order.push('visible')
      assert.ok(['IDLE','TRACK'].includes(core.snapshot().state))
      return visible && (!nativeWorld || physics.lineOfSight(muzzle,target))?target:null
    },
    aimAt(point){visuals++;assert.notEqual(point,target)},
    getMuzzle:()=>muzzle,
    raycastWorld(origin,direction,range){order.push('world');return nativeWorld?physics.raycast(origin,direction,range):worldHit},
    getPlayerCapsule(){order.push('capsule');return player},
    onAim(event){aims.push(event)},onCancel(event){cancels.push(event)},
    onState(event){states.push(event)},onFire(event){shots.push(event);onFire(event,core)},
  }
  const core=createSniperCore(T,callbacks,config)
  const box=(min,max)=>physics.addBox(v(...min),v(...max),{tag:'sniper-test-cover'})
  return {core,callbacks,player,muzzle,target,shots,states,aims,cancels,order,box,
    show:value=>{visible=value},wall:value=>{worldHit=value},counts:()=>({queries,visuals}),
    lock(){core.update(.55,{active:true,alive:true});assert.equal(core.snapshot().state,'LOCK')},
    fire(){core.update(.2,{active:true,alive:true});assert.equal(shots.length,1);return shots[0]},
  }
}

test('M3-A1 config centralizes the single sniper hard parameters and fixed sector',()=>{
  assert.deepEqual(tuning.position,[8,5.2,-154])
  assert.equal(tuning.yaw,.735);assert.equal(tuning.horizontalFovDegrees,130);assert.equal(tuning.range,80)
  assert.equal(tuning.actorHP,200);assert.equal(tuning.playerRadius,.32)
  assert.equal(tuning.damage,40);assert.equal(tuning.aimSeconds,.75);assert.equal(tuning.trackingSeconds,.55)
  assert.equal(tuning.fireInterval,3);assert.equal(tuning.searchSeconds,.6)
  assert.equal(tuning.fireMode,'single-shot')
})

test('stationary player receives one 40-damage result after TRACK .55 + LOCK .20',()=>{
  const f=fixture();f.core.update(.3)
  assert.equal(f.core.snapshot().state,'TRACK');assert.equal(f.shots.length,0)
  f.core.update(.25);assert.equal(f.core.snapshot().state,'LOCK')
  f.core.update(.199);assert.equal(f.shots.length,0)
  f.core.update(.001)
  const shot=f.shots[0]
  assert.equal(shot.hit,true);assert.equal(shot.damage,40);assert.equal(shot.shotId,1)
  close(shot.playerDistance,9.68);close(shot.time,.75)
  assert.equal(f.aims.length,1)
  assert.deepEqual(f.states.map(e=>e.state),['TRACK','LOCK','FIRE','COOLDOWN'])
  assert.equal(f.player.health,undefined,'core has no health/damage ownership')
})

test('tracking obstruction cancels; .6s SEARCH prevents visibility flicker from restarting aim',()=>{
  const f=fixture({nativeWorld:true});f.core.update(.2)
  const wall=f.box([-.6,0,-5.1],[.6,2,-4.9])
  f.core.update(.01);assert.equal(f.core.snapshot().state,'SEARCH')
  assert.equal(f.cancels[0].reason,'target-lost');assert.equal(f.core.snapshot().direction,null)
  physics.removeBox(wall)
  const counts=f.counts();f.core.update(.58)
  assert.deepEqual(f.counts(),counts);assert.equal(f.shots.length,0)
  f.core.update(.02);assert.equal(f.core.snapshot().state,'TRACK')
  assert.equal(f.aims.length,2);assert.equal(f.shots.length,0)
})

test('LOCK fires through the frozen line into native world cover without damage',()=>{
  const f=fixture({nativeWorld:true});f.lock()
  const before=f.counts();f.box([-.6,0,-5.1],[.6,2,-4.9])
  f.show(false);f.target.set(20,1.4,-10)
  const shot=f.fire()
  assert.deepEqual(f.counts(),before,'LOCK must never query perception or aimAt')
  close(shot.worldHit.dist,4.9);assert.equal(shot.worldHit.box.tag,'sniper-test-cover')
  assert.equal(shot.hit,false);assert.equal(shot.damage,0)
  assert.deepEqual([...shot.direction.toArray()],[0,0,-1])
})

test('LOCK lateral dodge uses current capsule, not the saved target or a guaranteed hit',()=>{
  const f=fixture();f.lock();f.player.position.x=2;f.target.x=2
  const shot=f.fire();assert.equal(shot.playerDistance,null);assert.equal(shot.hit,false)
  assert.equal(shot.damage,0);assert.deepEqual([...shot.direction.toArray()],[0,0,-1])
})

test('native low cover conceals crouched body while standing exposed sample can be hit',()=>{
  const f=fixture({nativeWorld:true});f.box([-.6,0,-5.1],[.6,1.25,-4.9])
  f.player.height=1.15;f.target.y=.85;f.core.update(.75)
  assert.equal(f.core.snapshot().state,'IDLE');assert.equal(f.shots.length,0)
  f.player.height=1.8;f.target.y=1.4;f.lock()
  assert.equal(f.fire().damage,40)
})

test('standing to crouching during LOCK reads native collision height at fire, including interpolation',()=>{
  for(const height of [1.15,1.3,1.6]){
    const f=fixture();f.lock();f.player.height=height
    const shot=f.fire();assert.equal(shot.hit,height===1.6)
    assert.equal(shot.damage,height===1.6?40:0)
  }
})

test('a genuinely exposed body point beside native cover is hit; cover on the ray wins',()=>{
  const f=fixture({nativeWorld:true})
  f.player.position.x=.2;f.target.x=.42
  f.box([-1,0,-5.1],[.1,2,-4.9])
  f.lock();const shot=f.fire()
  assert.equal(shot.worldHit,null);assert.equal(shot.hit,true);assert.equal(shot.damage,40)
  assert.ok(shot.playerDistance>9 && shot.playerDistance<10)
})

test('fire uses current muzzle but direction is a detached .55s solution',()=>{
  const f=fixture();f.lock();const locked=f.core.snapshot().direction
  f.muzzle.x=2;f.target.x=2
  const shot=f.fire()
  assert.deepEqual([...shot.origin.toArray()],[2,1.4,0]);assert.deepEqual([...shot.direction.toArray()],locked)
  assert.equal(shot.hit,false)
  f.muzzle.x=4;assert.equal(shot.origin.x,2)
})

test('world ray is queried before current player capsule; equal/nearer world surfaces reject damage',()=>{
  for(const distance of [9,9.68,9.68005,9.6802,11]){
    const f=fixture();f.wall({dist:distance,point:v(0,1.4,-distance)})
    f.lock();f.order.length=0;const shot=f.fire()
    assert.deepEqual(f.order,['world','capsule'])
    assert.equal(shot.hit,distance>9.6801)
  }
})

test('fire-to-fire interval is 3 seconds from emission, including a fresh .75s aim',()=>{
  const f=fixture();f.core.update(.75)
  f.core.update(2.249);assert.equal(f.core.snapshot().state,'COOLDOWN')
  f.core.update(.001);assert.equal(f.core.snapshot().state,'IDLE')
  f.core.update(.55);assert.equal(f.core.snapshot().state,'LOCK')
  f.core.update(.199);assert.equal(f.shots.length,1)
  f.core.update(.001);assert.equal(f.shots.length,2)
  close(f.shots[1].time-f.shots[0].time,3)
  assert.deepEqual(f.shots.map(s=>s.shotId),[1,2])
})

test('single shot cannot double-settle on oversized dt or synchronous callback update',()=>{
  const f=fixture({onFire:(_event,core)=>core.update(100)})
  f.core.update(100)
  assert.equal(f.shots.length,1);assert.equal(f.shots[0].damage,40)
  assert.equal(f.core.snapshot().shotId,1);assert.equal(f.counts().queries,1)
  assert.equal(f.core.snapshot().cooldownRemaining,3)
  f.core.update(2.25)
  f.core.update(.55);assert.equal(f.core.snapshot().state,'LOCK')
  f.core.update(.2);assert.equal(f.shots.length,2)
  assert.ok(f.shots[1].time-f.shots[0].time>=3)
})

test('dt crossing several boundaries samples the visible target once, then freezes .20',()=>{
  for(const steps of [[.75],[.2,.55],[.549,.201],[.55,.1,.1],[.4,.4]]){
    const f=fixture();for(const dt of steps)f.core.update(dt)
    assert.equal(f.shots.length,1);close(f.shots[0].time,steps.reduce((sum,dt)=>sum+dt,0))
    assert.equal(f.shots[0].damage,40)
    assert.equal(f.aims.length,1)
  }
})

test('frame overrun cannot backdate emission or shorten actual callback-to-callback interval',()=>{
  let hostTime=0
  const actual=[]
  const f=fixture({onFire:()=>actual.push(hostTime)})
  for(const dt of [1,2,.999,.001,100,2.999,.001]){
    hostTime+=dt;f.core.update(dt)
    if(f.shots.length)close(f.shots.at(-1).time,actual.at(-1))
  }
  assert.ok(actual.length>=3)
  for(let i=1;i<actual.length;i++)assert.ok(actual[i]-actual[i-1]>=3-1e-8)
})

test('FOV exit is callback null in TRACK; LOCK never polls FOV or aimAt again',()=>{
  const f=fixture();f.core.update(.3);f.show(false);f.core.update(.25)
  assert.equal(f.core.snapshot().state,'SEARCH');assert.equal(f.shots.length,0)
  f.core.reset();f.show(true);f.lock();const counts=f.counts()
  f.show(false);f.core.update(.2)
  assert.deepEqual(f.counts(),counts);assert.equal(f.shots[0].damage,40)
})

test('pause/caption/disabled active=false cancels TRACK/LOCK and freezes every timer',()=>{
  for(const elapsed of [.3,.55]){
    const f=fixture();f.core.update(elapsed);f.core.update(10,{active:false})
    assert.equal(f.shots.length,0);assert.equal(f.core.snapshot().state,'SEARCH')
    assert.equal(f.cancels[0].reason,'inactive')
    const saved=f.core.capture(),counts=f.counts()
    f.core.update(100,{active:false});assert.deepEqual(f.core.capture(),saved)
    assert.deepEqual(f.counts(),counts)
    f.core.update(.2);assert.equal(f.shots.length,0,'old locked shot must not survive resume')
  }
  const f=fixture();f.core.update(100,{active:false})
  assert.equal(f.shots.length,0);assert.equal(f.counts().queries,0)
  f.core.setCooldown(3);const saved=f.core.capture()
  f.core.update(100,{active:false});assert.deepEqual(f.core.capture(),saved)
})

test('death wins over inactive, stays DEAD, and reset/cancel remove unshot locks',()=>{
  const f=fixture();f.lock();f.core.update(1,{alive:false,active:false})
  assert.equal(f.core.snapshot().state,'DEAD');f.core.update(100)
  assert.equal(f.shots.length,0)
  f.core.reset();assert.equal(f.core.snapshot().state,'IDLE');f.lock()
  f.core.reset();f.core.update(.2);assert.equal(f.shots.length,0)
  f.core.update(.35);assert.equal(f.core.snapshot().state,'LOCK')
  f.core.cancel('test');f.core.update(.2);assert.equal(f.shots.length,0)
  assert.equal(f.core.snapshot().direction,null)
})

test('checkpoint crosses real JSON, stores arrays, and never restores pending LOCK/TRACK rounds',()=>{
  for(const elapsed of [.3,.55]){
    const f=fixture();f.core.update(elapsed)
    const saved=JSON.parse(JSON.stringify(f.core.capture()))
    assert.ok(Array.isArray(saved.target));assert.equal(saved.target.isVector3,undefined)
    if(elapsed===.55)assert.ok(Array.isArray(saved.direction))
    const restored=fixture();restored.core.restore(saved)
    assert.equal(restored.core.snapshot().state,'COOLDOWN')
    assert.equal(restored.core.snapshot().direction,null)
    assert.equal(restored.core.snapshot().cooldownRemaining,3)
    restored.core.update(.2);assert.equal(restored.shots.length,0)
    restored.core.update(2.05);restored.core.update(.75)
    assert.equal(restored.shots.length,1);assert.equal(restored.shots[0].shotId,1)
  }
})

test('checkpoint preserves post-fire remaining cooldown and next shot ID without catch-up',()=>{
  const f=fixture();f.core.update(.75);f.core.update(1)
  const saved=JSON.parse(JSON.stringify(f.core.capture()))
  const restored=fixture();restored.core.restore(saved)
  assert.equal(restored.core.snapshot().cooldownRemaining,2)
  restored.core.update(1.25);assert.equal(restored.shots.length,0)
  restored.core.update(.75);assert.equal(restored.shots.length,1)
  assert.equal(restored.shots[0].shotId,2)
  close(restored.shots[0].time,f.shots[0].time+3)
  restored.core.update(0);assert.equal(restored.shots.length,1)
})

test('checkpoint preserves DEAD and SEARCH, rejects malformed capture, and detaches live arrays',()=>{
  const f=fixture();f.lock();const capture=f.core.capture()
  capture.target[0]=99;capture.direction[0]=99
  assert.equal(f.core.snapshot().target[0],0);assert.equal(f.core.snapshot().direction[0],0)
  f.core.cancel();f.core.update(.1)
  const search=JSON.parse(JSON.stringify(f.core.capture()))
  f.core.reset();f.core.restore(search);close(f.core.snapshot().searchRemaining,.5)
  f.core.update(.4);assert.equal(f.core.snapshot().state,'SEARCH')
  f.core.update(1,{alive:false});const dead=JSON.parse(JSON.stringify(f.core.capture()))
  f.core.reset();f.core.restore(dead);f.core.update(100);assert.equal(f.core.snapshot().state,'DEAD')
  assert.throws(()=>f.core.restore({...dead,shotId:-1}),/checkpoint/)
  assert.throws(()=>f.core.restore({...dead,target:{x:0,y:0,z:0}}),/checkpoint/)
})

test('setCooldown cancels pending attack and reserves full fire interval for parent warning shot',()=>{
  const f=fixture();f.lock();f.core.setCooldown(3)
  assert.equal(f.core.snapshot().direction,null);f.core.update(2.25)
  assert.equal(f.shots.length,0);f.core.update(.75)
  assert.equal(f.shots.length,1);close(f.shots[0].time,3.55)
})

test('range is a real ray limit and player/world callback argument mutation cannot retarget a shot',()=>{
  const f=fixture({config:{range:5}});f.lock();assert.equal(f.fire().damage,0)
  const other=fixture();other.callbacks.raycastWorld=(origin,dir)=>{origin.x=100;dir.x=10;return null}
  other.lock();assert.equal(other.fire().damage,40)
})

test('ray capsule intersects exact cylinder and hemispheres, tangent edges, axial rays and inside origin',()=>{
  const capsule={position:v(),radius:.32,height:1.8}
  const ray=(o,d,range)=>rayCapsuleDistance(v(...o),v(...d),capsule,range)
  close(ray([0,.9,2],[0,0,-1]),1.68)
  close(ray([0,.9,2],[0,0,-7]),1.68)
  close(ray([.32,.9,2],[0,0,-1]),2)
  assert.equal(ray([.320001,.9,2],[0,0,-1]),null)
  close(ray([0,1.8,2],[0,0,-1]),2)
  assert.equal(ray([0,1.800001,2],[0,0,-1]),null)
  close(ray([0,1.7,2],[0,0,-1]),2-Math.sqrt(.32**2-.22**2))
  close(ray([0,.1,2],[0,0,-1]),2-Math.sqrt(.32**2-.22**2))
  close(ray([0,3,0],[0,-1,0]),1.2)
  close(ray([0,-2,0],[0,1,0]),2)
  assert.equal(ray([0,.9,-2],[0,0,-1]),null)
  assert.equal(ray([0,.9,2],[0,0,-1],1.67),null)
  close(ray([0,.9,2],[0,0,-1],1.68),1.68)
  for(const origin of [[0,.9,0],[0,.1,0],[0,1.7,0],[.32,.9,0]])
    assert.equal(ray(origin,[0,0,1]),0)
  assert.equal(ray([0,.9,2],[0,0,0]),null)
})

test('ray capsule translates correctly, handles sphere-height capsules and steep tangent rays',()=>{
  const capsule={position:v(8,5.2,-154),radius:.32,height:1.8}
  close(rayCapsuleDistance(v(8,8.2,-154),v(0,-1,0),capsule),1.2)
  const sphere={position:v(),radius:1,height:2}
  close(rayCapsuleDistance(v(0,1,5),v(0,0,-1),sphere),4)
  close(rayCapsuleDistance(v(1,5,0),v(0,-1,0),sphere),4)
  const upright={position:v(),radius:.32,height:1.8}
  close(rayCapsuleDistance(v(.32,3,0),v(0,-1,0),upright),1.52)
  assert.throws(()=>rayCapsuleDistance(v(),v(0,0,-1),{...upright,height:.5}),/diameter/)
})
