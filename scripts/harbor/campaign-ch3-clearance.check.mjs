import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { nativeChapter3Fixture } from './campaign-ch3.check.mjs'
import { CH3_CLEARANCE_DEPLOYMENTS } from './campaign-ch3-deployment.mjs'
import { installChapter3Clearance } from './campaign-ch3-clearance.mjs'
import { CLEARANCE_CONFIG as tuning } from './campaign-ch3-clearance-config.mjs'
import { createChapter3ClearanceNavigation } from './campaign-ch3-clearance-navigation.mjs'
import { CH3 } from './campaign-ch3-layout.mjs'

// Native immutable Three/nav/physics; injected mesh visuals are test ports,
// not supplied soldier/rifle assets or browser rendering acceptance.
const {g:base,T}=await nativeFixture()
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z)
const point=(x=0,y=0,z=0)=>v(x,y,z-160)
const patrol=(x,z)=>({x,y:0,z:z-160})
const json=value=>JSON.parse(JSON.stringify(value))
const definition=(id='a',x=0,z=0,group=null)=>({id,route:group?'central':'west',group,position:patrol(x,z),yaw:0,
  patrol:[],cover:[],territory:{minX:-59,maxX:29,minZ:-204,maxZ:-101}})
function fixture(definitions=[definition()],{canEnter=()=>true,audio=false,worldPhysics=null,approachSpeed=null}={}){
  // Native fixture physics is fresh per case; reuse its immutable Three only.
  const physics=worldPhysics??base.physics
  if(!worldPhysics){
    for(const box of [...physics.boxes])physics.removeBox(box)
    physics.bounds.min.set(-100,0,-260);physics.bounds.max.set(60,20,-100);physics.build()
  }
  const listeners=new Map(),hits=[],cues=[],voices=new Set()
  const events={on(k,f){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(f)},
    off(k,f){listeners.get(k)?.delete(f)},emit(k,event){cues.push({k,event});for(const f of [...listeners.get(k)||[]])f(event)}}
  let intro=false,height=1.8,changes=0
  const g={THREE:T,scene:new T.Scene(),physics,events,enemies:{raycast:()=>null},game:{state:'playing',run:{time:0}}}
  g.player={pos:point(0,0,-10),alive:true,enabled:true,health:1000,onGround:true,crouching:false,speed:1,vel:v(0,0,-1),
    captureCampaignCollider(){return {position:this.pos.clone(),radius:.32,height}},
    damage(amount){hits.push(amount);this.health-=amount;if(this.health<=0){this.alive=false;events.emit('player:dead',{})}}}
  if(audio)g.audio={meleeBus:{},ctx:{state:'running',
    createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)}},
    createBufferSource(){const source={connect(){},disconnect(){},start(){voices.add(source)},stop(){voices.delete(source)}};return source},
    createGain:()=>({gain:{value:0},connect(){},disconnect(){}}),
    createPanner:()=>({positionX:{},positionY:{},positionZ:{},connect(){},disconnect(){}})}}
  const visuals=[]
  function createVisual(){
    const root=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(.6,1.8,.6),new T.MeshBasicMaterial())
    mesh.position.y=.9;mesh.computeBoundingSphere=()=>mesh.geometry.computeBoundingSphere();root.add(mesh)
    let role='Idle',updates=0,aims=0
    const clips={Idle:0,Patrol:1,Aim:3,Fire:6,Hit:5,Death:8}
    const visual={root,instance:{root,mesh,skeleton:{update(){}}},animation:{finished:()=>role==='Death',snapshot:()=>({duration:2})},
      getMuzzle:()=>root.position.clone().add(v(0,1.4,0)),getEye:()=>root.position.clone().add(v(0,1.7,0)),
      getForward:()=>v(-Math.sin(root.rotation.y),0,-Math.cos(root.rotation.y)),
      aimAt(point){aims++;const d=point.clone().sub(this.getMuzzle());root.rotation.y=Math.atan2(-d.x,-d.z)},
      clipFor:r=>clips[r],setState(r){role=r},update(){updates++;root.updateMatrixWorld(true)},reset(){role='Idle'},
      dispose(){root.removeFromParent();mesh.geometry.dispose();mesh.material.dispose()},snapshot:()=>({role,updates,aims})}
    visuals.push(visual);return visual
  }
  const originalMove=physics.moveCapsule,originalRay=g.enemies.raycast
  const ai=installChapter3Clearance(g,{createVisual,deployments:definitions,narrative:{snapshot:()=>({active:intro})},canEnter,approachSpeed,onChange:()=>changes++})
  return {g,ai,hits,cues,voices,visuals,listeners,createVisual,changes:()=>changes,
    setHeight(value){height=value},intro(value){intro=value},
    tick(dt=.01){g.game.run.time+=dt;ai.update(dt)},
    until(state,id=definitions[0].id){for(let i=0;i<500&&ai.snapshot().members.find(m=>m.id===id).state!==state;i++)this.tick();assert.equal(ai.snapshot().members.find(m=>m.id===id).state,state)},
    pause(){g.game.state='paused';events.emit('game:state',{state:'paused'})},
    resume(){g.game.state='playing';events.emit('game:state',{state:'playing'})},
    wall(min,max){const result=physics.addBox([min[0],min[1],min[2]-160],[max[0],max[1],max[2]-160],{surface:'metal'});physics.build();return result},
    dispose(){ai.dispose();assert.equal(physics.moveCapsule,originalMove);assert.equal(g.enemies.raycast,originalRay);assert.equal(g.scene.children.length,0);for(const set of listeners.values())assert.equal(set.size,0)}}
}

describe('M3-A2 clearance',()=>{
test('individual retirement and respawn reuse the actor/visual without resetting peers or changing combat tuning',()=>{
  const f=fixture([definition('a'),definition('b',3)])
  try{
    f.tick();const a=f.ai.members[0],b=f.ai.members[1],visual=b.visual,actor=b.target.actor
    a.target.actor.damage(25,a.target.actor.pos,v(0,0,1),'body')
    const before=f.ai.capture().members[0]
    assert.equal(f.ai.retire('b'),true);assert.equal(actor.alive,false);assert.equal(visual.root.visible,false)
    assert.equal(f.ai.respawn('b',{position:patrol(5,0),goal:patrol(0,-12)}),true)
    assert.equal(f.ai.members[1].visual,visual);assert.equal(f.ai.members[1].target.actor,actor)
    assert.equal(actor.hp,100);assert.equal(actor.alive,true);assert.equal(visual.root.visible,true)
    assert.deepEqual(f.ai.capture().members[0],before)
    assert.equal(f.ai.respawn('b',{position:patrol(7,0)}),false,'live actors cannot teleport')
    assert.equal(tuning.burstRounds,4);assert.equal(tuning.damage,5)
  }finally{f.dispose()}
})
test('13 stable native targets: three central triples, four independent west; JSON death never refills',()=>{
  const definitions=Array.from({length:13},(_,i)=>definition(`soldier-${i}`,i*1.5,0,i<9?`group-${Math.floor(i/3)}`:null))
  const f=fixture(definitions)
  try{
    f.tick();assert.equal(f.ai.members.length,13)
    assert.deepEqual([...new Set(f.ai.members.filter(m=>m.definition.group).map(m=>m.definition.group))],['group-0','group-1','group-2'])
    assert.equal(f.ai.members.filter(m=>m.definition.group===null).length,4)
    const live=f.ai.members.map(m=>m.target.actor),instances=f.ai.members.map(m=>m.visual)
    f.ai.members[1].target.actor.damage(100,point(1.5,1,0),v(0,0,1),'body')
    const saved=JSON.parse(JSON.stringify(f.ai.capture()));assert.equal(f.ai.validateCapture(saved),true)
    f.ai.restore(saved);f.tick()
    assert.equal(f.ai.members[1].target.actor.alive,false)
    for(let i=0;i<13;i++){assert.equal(f.ai.members[i].target.actor,live[i]);assert.equal(f.ai.members[i].visual,instances[i])}
    assert.equal(f.ai.members[0].target.snapshot().raycast.targets,13)
    assert.equal(f.ai.snapshot().members[1].state,'DEAD');assert.equal(f.visuals[1].snapshot().role,'Death')
  }finally{f.dispose()}
})

test('FOV/range and multi-point native LOS; low cover permits standing exposure and blocks crouch',()=>{
  const f=fixture()
  try{
    f.g.player.pos.z=-150;f.tick();assert.equal(f.ai.snapshot().members[0].lastKnown,null)
    f.g.player.pos.copy(point(0,0,-40));f.tick(1);assert.equal(f.ai.snapshot().members[0].lastKnown,null)
    f.g.player.pos.copy(point(0,0,-10));f.setHeight(1.15)
    const wall=f.wall([-2,0,-9.5],[2,1.3,-9]);f.tick(1)
    assert.equal(f.ai.snapshot().members[0].lastKnown,null)
    f.setHeight(1.8);f.tick(.2);assert.equal(f.ai.snapshot().members[0].state,'TRACK')
    wall.max.y=2;f.tick(.01);assert.equal(f.ai.snapshot().members[0].state,'INVESTIGATE')
    assert.deepEqual(f.hits,[])
  }finally{f.dispose()}
})

test('group clue is one local detached position; hidden peers need own LOS; west and distant group remain private',()=>{
  const a=definition('a',0,0,'g'),b=definition('b',5,0,'g'),west=definition('west',8,0),other=definition('other',12,0,'other'),far=definition('far',25,0,'g')
  for(const d of [b,west,other,far])d.yaw=Math.PI
  const f=fixture([a,b,west,other,far])
  try{
    f.tick();let s=f.ai.snapshot()
    assert.deepEqual(s.members[1].lastKnown,s.members[0].lastKnown)
    assert.equal(s.members[1].knownKind,'group');assert.equal(s.members[1].state,'INVESTIGATE')
    for(const i of [2,3,4])assert.equal(s.members[i].lastKnown,null)
    assert.equal(s.stats.groupMessages,1)
    const known=JSON.parse(JSON.stringify(s.members[1].lastKnown))
    f.g.player.pos.x=-8;f.tick(.1);s=f.ai.snapshot()
    assert.deepEqual(json(s.members[1].lastKnown),known,'no streaming of sender/player coordinates')
    assert.equal(s.stats.groupMessages,1);assert.deepEqual(f.hits,[])
  }finally{f.dispose()}
})

test('hearing validates native payload and locomotion; guns keep 30m through walls and footsteps attenuate',()=>{
  const defs=[definition('near',0,0),definition('occluded',8,0),definition('far',30,0)]
  for(const d of defs)d.yaw=Math.PI
  const f=fixture(defs)
  try{
    f.g.player.pos.copy(point(0,0,-5));f.wall([3,0,-4],[4,3,3]);f.tick()
    f.g.events.emit('weapon:fire',{});f.g.events.emit('weapon:fire',{weapon:'knife',origin:point(0,1.5,-5),dir:v(0,0,-1)})
    assert.equal(f.ai.snapshot().stats.heard,0)
    // Exact native rifle payload has no weapon field (P12 supplies 'pistol').
    f.g.events.emit('weapon:fire',{origin:point(0,1.5,-5),muzzle:point(0,1.5,-5),dir:v(0,0,-1),ads:0})
    let s=f.ai.snapshot();assert.equal(s.members[0].knownKind,'gun')
    assert.equal(s.members[1].knownKind,'gun','gun hearing keeps its full 30m radius through cover');assert.equal(s.members[2].lastKnown,null)
    f.ai.reset();f.tick();f.g.player.crouching=true
    f.g.events.emit('player:step',{pos:f.g.player.pos,sprint:false,surface:'metal'});assert.equal(f.ai.snapshot().members[0].lastKnown,null)
    f.g.player.crouching=false;f.g.events.emit('player:step',{pos:f.g.player.pos,sprint:false,surface:'metal'})
    s=f.ai.snapshot();assert.equal(s.members[0].knownKind,'step');assert.equal(s.members[1].lastKnown,null)
    f.ai.reset();f.g.player.pos.copy(point(0,0,-60));f.tick();f.g.events.emit('weapon:fire',{weapon:'rifle',origin:point(0,1.5,-5),dir:v(0,0,-1)})
    assert.equal(f.ai.snapshot().members[0].lastKnown,null,'unrelated emitter cannot impersonate the player')
  }finally{f.dispose()}
})

test('memory expires without hidden tracking and returns to patrol',()=>{
  const d=definition();d.patrol=[patrol(-2,0)]
  const f=fixture([d])
  try{
    f.tick();const known=f.ai.capture().members[0].lastKnown
    f.wall([-10,0,-5],[10,3,-4]);f.g.player.pos.copy(point(9,0,-70));f.tick(.1)
    assert.deepEqual(f.ai.capture().members[0].lastKnown,known)
    for(let i=0;i<250;i++)f.tick(.1)
    assert.equal(f.ai.capture().members[0].lastKnown,null);assert.equal(f.ai.capture().members[0].memory,0)
    assert.ok(['PATROL','IDLE'].includes(f.ai.capture().members[0].state));assert.deepEqual(f.hits,[])
  }finally{f.dispose()}
})

test('ordinary soldier is 100HP; each four-round burst emits independent 5HP rays at .10s with no catch-up',()=>{
  assert.equal(tuning.actorHP,100);assert.equal(tuning.damage,5);assert.equal(tuning.aimSeconds,.8);assert.equal(tuning.lockSeconds,.15)
  const f=fixture()
  try{
    assert.equal(f.ai.members[0].target.actor.hp,100)
    f.tick();f.tick(.64);assert.deepEqual(f.hits,[]);assert.equal(f.ai.snapshot().members[0].state,'TRACK')
    f.tick(.01);assert.equal(f.ai.snapshot().members[0].state,'LOCK')
    f.tick(.149);assert.deepEqual(f.hits,[]);f.tick(.001);assert.deepEqual(f.hits,[5])
    for(let i=0;i<3;i++){f.tick(.099);assert.equal(f.hits.length,i+1);f.tick(.001)}
    assert.deepEqual(f.hits,[5,5,5,5]);assert.equal(f.hits.reduce((a,b)=>a+b),20)
    let shots=f.ai.snapshot().history.filter(e=>e.type==='shot')
    for(let i=1;i<4;i++){assert.ok(shots[i].time-shots[i-1].time>=.1-1e-8);assert.deepEqual(shots[i].direction,shots[0].direction)}
    f.until('LOCK');f.tick(100);assert.equal(f.hits.length,5)
    f.tick(100);assert.equal(f.hits.length,6,'a stalled update emits at most one remaining round')
    shots=f.ai.snapshot().history.filter(e=>e.type==='shot')
    assert.ok(shots[4].time-shots[3].time>=tuning.fireInterval)
  }finally{f.dispose()}
})

test('later burst rounds recheck the live world, player capsule and friendly capsule once each',()=>{
  for(const mode of ['cover','player','friend']){
    const defs=[definition('a')]
    if(mode==='friend')defs.push(definition('b',8,-5))
    const f=fixture(defs)
    try{
      f.tick()
      if(mode==='friend'){const saved=json(f.ai.capture());saved.members[1].cooldown=100;f.ai.restore(saved)}
      f.until('LOCK');f.tick(.15);assert.deepEqual(f.hits,[5])
      const before=f.ai.snapshot().stats.shots,aims=f.visuals[0].snapshot().aims
      if(mode==='cover')f.wall([-1,0,-5],[1,3,-4])
      if(mode==='player')f.g.player.pos.x=2
      if(mode==='friend')f.ai.members[1].target.actor.pos.copy(point(0,0,-5))
      for(let i=0;i<3;i++)f.tick(.1)
      const shots=f.ai.snapshot().history.filter(e=>e.type==='shot'&&e.id==='a')
      assert.equal(shots.length,4);assert.equal(f.ai.snapshot().stats.shots-before,3)
      assert.deepEqual(shots.map(e=>e.hit),[true,false,false,false],mode);assert.deepEqual(f.hits,[5])
      assert.equal(f.visuals[0].snapshot().aims,aims,'burst never retargets')
      for(const shot of shots)assert.deepEqual(shot.direction,shots[0].direction)
      if(mode==='friend')assert.equal(f.ai.members[1].target.actor.hp,100)
    }finally{f.dispose()}
  }
})

test('visible soldiers pursue at 2m/s beyond 15m and all stop at 15m even without an aim slot',()=>{
  const defs=Array.from({length:3},(_,i)=>definition(`a${i}`,(i-1)*2))
  const f=fixture(defs)
  try{
    f.g.player.pos.copy(point(0,0,-30));f.tick(.1)
    assert.equal(f.ai.snapshot().shooters.length,0)
    for(let i=0;i<3;i++)assert.ok(f.ai.members[i].target.actor.pos.distanceTo(point((i-1)*2,0,0))>=.19)
    f.g.player.pos.copy(point(0,0,-14));f.tick(.2)
    const positions=f.ai.members.map(m=>m.target.actor.pos.clone())
    for(let i=0;i<10;i++)f.tick(.025)
    assert.equal(f.ai.snapshot().shooters.length,2)
    for(let i=0;i<3;i++)assert.ok(f.ai.members[i].target.actor.pos.distanceTo(positions[i])<1e-8,'visible close-range member must stop')
    assert.deepEqual(f.hits,[])
  }finally{f.dispose()}
})

test('CH4 approach speed runs at 6.4m/s outside 15m then returns to native aim, burst and hit recovery',()=>{
  const f=fixture([definition()],{approachSpeed:6.4})
  try{
    const m=f.ai.members[0]
    f.g.player.pos.copy(point(0,0,-25));f.tick(.05)
    const before=m.target.actor.pos.clone();f.tick(.1)
    assert.ok(Math.abs(m.target.actor.pos.distanceTo(before)-.64)<1e-6)
    assert.equal(f.ai.snapshot().shooters.length,0)
    for(let i=0;i<50&&m.state!=='TRACK';i++)f.tick(.05)
    assert.equal(m.state,'TRACK')
    assert.ok(Math.hypot(m.target.actor.pos.x-f.g.player.pos.x,m.target.actor.pos.z-f.g.player.pos.z)<=15)
    const stopped=m.target.actor.pos.clone();f.tick(.1)
    assert.ok(m.target.actor.pos.distanceTo(stopped)<1e-8)
    f.until('LOCK');f.tick(.15);for(let i=0;i<3;i++)f.tick(.1)
    assert.deepEqual(f.hits,[5,5,5,5])
    m.target.actor.damage(1,m.target.actor.pos,v(0,0,1),'body')
    const hitPosition=m.target.actor.pos.clone();f.tick(.1)
    assert.equal(m.state,'HIT');assert.ok(m.target.actor.pos.distanceTo(hitPosition)<1e-8)
    f.g.player.pos.copy(point(0,0,-45))
    for(let i=0;i<20;i++)f.tick(.05)
    const chasing=m.target.actor.pos.clone();f.tick(.1)
    assert.ok(Math.abs(m.target.actor.pos.distanceTo(chasing)-.64)<1e-6,'retreating beyond 15m restores CH4 approach speed')
  }finally{f.dispose()}
})

test('TRACK cancels into pursuit when the visible player retreats beyond 15m',()=>{
  const f=fixture()
  try{
    f.tick();assert.equal(f.ai.snapshot().members[0].state,'TRACK')
    f.g.player.pos.copy(point(0,0,-25));f.tick(.1)
    assert.equal(f.ai.snapshot().members[0].state,'INVESTIGATE');assert.equal(f.ai.snapshot().shooters.length,0)
    const before=f.ai.members[0].target.actor.pos.clone();f.tick(.1)
    assert.ok(f.ai.members[0].target.actor.pos.distanceTo(before)>.19);assert.deepEqual(f.hits,[])
  }finally{f.dispose()}
})

test('gun clue through cover drives 3m/s to the recorded source outside territory; over 30m ignores it',()=>{
  const a=definition('a'),b=definition('b',0,2)
  a.yaw=b.yaw=Math.PI;a.territory={minX:-1,maxX:1,minZ:-161,maxZ:-159}
  const f=fixture([a,b])
  try{
    f.g.player.pos.copy(point(0,0,-29));f.wall([-2,0,-14],[2,3,-13]);f.tick(.01)
    f.g.events.emit('weapon:fire',{origin:point(0,1.7,-29),dir:v(0,0,-1)})
    let saved=f.ai.capture();assert.equal(saved.members[0].knownKind,'gun');assert.equal(saved.members[1].lastKnown,null)
    const clue=json(saved.members[0].lastKnown),start=f.ai.members[0].target.actor.pos.clone()
    f.g.player.pos.copy(point(20,0,-70));f.tick(.1)
    assert.ok(Math.abs(f.ai.members[0].target.actor.pos.distanceTo(start)-.3)<1e-6)
    for(let i=0;i<15;i++)f.tick(.1)
    assert.ok(f.ai.members[0].target.actor.pos.z<-161,'investigation leaves the old small territory')
    assert.deepEqual(json(f.ai.capture().members[0].lastKnown),clue,'hidden player movement does not alter source')
    saved=json(f.ai.capture());f.ai.restore(saved);assert.deepEqual(json(f.ai.capture()),saved,'out-of-territory position survives JSON')
    assert.equal(f.ai.snapshot().members[0].burstRemaining,0)
    for(let i=0;i<500;i++)f.tick(.1)
    assert.equal(f.ai.capture().members[0].lastKnown,null,'reaches the clue and eventually resumes patrol')
    assert.ok(f.ai.members[0].target.actor.pos.distanceTo(start)<.2,'returns to its original patrol/spawn')
    assert.deepEqual(f.hits,[])
  }finally{f.dispose()}
})

test('enemy bursts neither renew hearing memory nor relay player alerts across the map',()=>{
  const a=definition('a'),b=definition('b',8,0),c=definition('c',25,0)
  b.yaw=c.yaw=Math.PI
  const f=fixture([a,b,c])
  try{
    const saved=json(f.ai.capture());saved.members[1].lastKnown=point(-8,0,-10).toArray();saved.members[1].knownKind='gun';saved.members[1].memory=1
    f.ai.restore(saved);f.until('LOCK');const memory=f.ai.capture().members[1].memory
    f.tick(.15);for(let i=0;i<3;i++)f.tick(.1)
    assert.equal(f.ai.capture().members[2].lastKnown,null)
    assert.ok(f.ai.capture().members[1].memory<=memory)
    assert.equal(f.ai.snapshot().stats.heard,0)
  }finally{f.dispose()}
})

test('locked muzzle ray uses current world before exact current capsule; lateral and crouch dodges miss',()=>{
  for(const mode of ['wall','lateral','crouch','world-behind']){
    const f=fixture()
    try{
      f.until('LOCK');const aims=f.visuals[0].snapshot().aims
      if(mode==='wall')f.wall([-1,0,-5],[1,3,-4])
      if(mode==='world-behind')f.wall([-1,0,-12],[1,3,-11])
      if(mode==='lateral')f.g.player.pos.x=2
      if(mode==='crouch')f.setHeight(1.15)
      const order=[],ray=f.g.physics.raycast,capture=f.g.player.captureCampaignCollider
      f.g.physics.raycast=(...args)=>{order.push('world');return ray(...args)}
      f.g.player.captureCampaignCollider=function(){order.push('player');return capture.call(this)}
      try{f.tick(.15)}finally{f.g.physics.raycast=ray;f.g.player.captureCampaignCollider=capture}
      assert.equal(order[0],'world');assert.equal(order[1],'player')
      assert.equal(f.visuals[0].snapshot().aims,aims,'LOCK does not aim at a hidden/moved target')
      assert.deepEqual(f.hits,mode==='world-behind'?[5]:[],mode)
      if(mode==='wall')assert.ok(f.cues.some(e=>e.k==='impact'&&e.event.from==='enemy'))
    }finally{f.dispose()}
  }
})

test('a live teammate capsule in front blocks fire without friendly damage or penetration',()=>{
  const f=fixture([definition('a'),definition('b',0,-5)])
  try{
    f.tick();const saved=f.ai.capture();saved.members[1].cooldown=100;f.ai.restore(JSON.parse(JSON.stringify(saved)))
    f.until('LOCK','a');f.tick(.15)
    const shot=f.ai.snapshot().history.find(e=>e.type==='shot'&&e.id==='a')
    assert.ok(shot.friendDistance<shot.playerDistance);assert.equal(shot.hit,false)
    assert.deepEqual(f.hits,[]);assert.equal(f.ai.members[1].target.actor.hp,100)
  }finally{f.dispose()}
})

test('global/group aim+fire caps stay at two and circular scheduling gives all visible soldiers a turn',()=>{
  const defs=Array.from({length:13},(_,i)=>definition(`soldier-${i}`,(i-6)*1.2,0,i<9?`group-${Math.floor(i/3)}`:null))
  const f=fixture(defs)
  try{
    for(let i=0;i<700;i++){
      f.tick(.025);const s=f.ai.snapshot();assert.ok(s.shooters.length<=2)
      const groups=new Map()
      for(const id of s.shooters){const group=defs.find(d=>d.id===id).group;if(group)groups.set(group,(groups.get(group)||0)+1)}
      for(const n of groups.values())assert.ok(n<=2)
    }
    for(const m of f.ai.snapshot().members)assert.ok(m.shots>0,`${m.id} starved`)
    assert.ok(f.hits.every(hit=>hit===5))
  }finally{f.dispose()}
})

test('native nav exact endpoint path and capsule movement respect canEnter and reject snapped endpoints',()=>{
  const d=definition();d.patrol=[patrol(5,0)];d.territory={minX:-1,maxX:6,minZ:-162,maxZ:-158}
  const f=fixture([d],{canEnter:(from,to)=>to.x<2.5})
  try{
    f.g.player.pos.copy(point(0,0,-70))
    for(let i=0;i<30;i++)f.tick(.1)
    assert.equal(f.ai.members[0].target.actor.pos.x,0);assert.ok(f.ai.snapshot().stats.pathRejects>0)
    d.patrol[0].x=2
    for(let i=0;i<50;i++)f.tick(.1)
    assert.ok(f.ai.members[0].target.actor.pos.x>1.7);assert.ok(f.ai.members[0].target.actor.pos.x<=2)
    assert.ok(f.ai.snapshot().stats.moves>0)
    const native=f.g.physics.nav.findPath
    d.patrol[0].x=5
    f.g.physics.nav.findPath=()=>[point(1,0,0)]
    try{const saved=f.ai.capture();saved.members[0].position=point().toArray();saved.members[0].patrolWait=0;f.ai.restore(saved);f.tick(1)
      assert.equal(f.ai.members[0].target.actor.pos.x,0)
    }finally{f.g.physics.nav.findPath=native}
  }finally{f.dispose()}
})

test('native wall routing walks around world cover, and rejects native replaced endpoints',()=>{
  const d=definition();d.patrol=[patrol(4,0)]
  const f=fixture([d])
  try{
    f.g.player.pos.copy(point(0,0,-70));f.wall([1,0,-1],[2,3,1])
    let detour=false
    for(let i=0;i<120;i++){f.tick(.1);const pos=f.ai.members[0].target.actor.pos;detour ||= Math.abs(pos.z+160)>1.25;assert.ok(!(pos.x>1&&pos.x<2&&Math.abs(pos.z+160)<1.3))}
    assert.ok(detour);assert.ok(f.ai.members[0].target.actor.pos.distanceTo(point(4,0,0))<.2)
    const find=f.g.physics.nav.findPath
    f.g.physics.nav.findPath=()=>[point(20,0,0)]
    try{f.ai.reset();for(let i=0;i<30;i++)f.tick(.1);assert.equal(f.ai.members[0].target.actor.pos.x,0);assert.ok(f.ai.snapshot().stats.pathRejects>0)}
    finally{f.g.physics.nav.findPath=find}
  }finally{f.dispose()}
})

test('CH3 and CH4 owners compose native player collisions and retain them when either controller is disabled',()=>{
  const f=fixture([definition('ch3-soldier')]);let chapter4Blocked=false
  const next=installChapter3Clearance(f.g,{ownerKey:'chapter-4',createVisual:f.createVisual,deployments:[definition('ch4-soldier',4)],
    narrative:{snapshot:()=>({active:chapter4Blocked})}})
  const move=(x)=>{
    f.g.player.pos.copy(point(x));f.ai.update(0);next.update(0)
    return f.g.physics.moveCapsule(f.g.player.pos,v(8,0,0),.8,.32,1.8,true)
  }
  try{
    assert.equal(move(-2).hitWall,true)
    assert.ok(f.g.player.pos.x<-.68,'outer CH4 wrapper must preserve the inner CH3 body collision')
    assert.equal(move(2).hitWall,true);assert.ok(f.g.player.pos.x<3.32,'outer CH4 body still blocks')
    chapter4Blocked=true
    assert.equal(move(-2).hitWall,true);assert.ok(f.g.player.pos.x<-.68,'inactive CH4 transparently delegates to CH3')
    f.intro(true);chapter4Blocked=false
    assert.equal(move(-2).hitWall,true);assert.ok(f.g.player.pos.x>3&&f.g.player.pos.x<3.32,'disabled CH3 releases its body while CH4 remains solid')
    chapter4Blocked=true
    assert.equal(move(-2).hitWall,false);assert.ok(f.g.player.pos.x>4,'both inactive owners transparently delegate to native physics')
  }finally{next.dispose();f.dispose()}
})

test('continuous native small steps reject member/member and player/member capsule crossing; dispose releases wrapper',()=>{
  const a=definition('a',-2,0),b=definition('b',2,0)
  a.patrol=[patrol(2,0)];b.patrol=[patrol(-2,0)]
  const f=fixture([a,b])
  try{
    f.g.player.pos.copy(point(0,0,-70))
    for(let i=0;i<70;i++){
      const before=f.ai.members.map(m=>m.target.actor.pos.clone());f.tick(.1)
      const [a,b]=f.ai.members.map(m=>m.target.actor.pos)
      assert.ok(a.distanceTo(b)>=tuning.radius*2+tuning.spacing-1e-5)
      f.ai.members.forEach((m,index)=>assert.ok(m.target.actor.pos.distanceTo(before[index])<=tuning.walkSpeed*.1+1e-4))
    }
    f.g.player.pos.copy(f.ai.members[0].target.actor.pos).add(v(-2,0,0))
    f.g.physics.moveCapsule(f.g.player.pos,v(20,0,0),.5,.32,1.8,true)
    assert.ok(f.g.player.pos.x<f.ai.members[0].target.actor.pos.x-.64)
    assert.ok(f.ai.snapshot().stats.bodyBlocks>0)
  }finally{f.dispose()}
})

test('native target ray registration stays active at distance, uses world priority and Hit/Death interrupt locks',()=>{
  const f=fixture()
  try{
    f.g.player.pos.z=-230;f.tick()
    const hit=f.g.enemies.raycast(point(0,1,-70),v(0,0,1),100)
    assert.equal(hit.enemy,f.ai.members[0].target.actor)
    f.wall([-1,0,-5],[1,3,-4]);assert.equal(f.g.enemies.raycast(point(0,1,-70),v(0,0,1),100),null)
    for(const box of [...f.g.physics.boxes])f.g.physics.removeBox(box)
    f.g.physics.build();f.g.player.pos.z=-170;f.until('LOCK')
    f.ai.members[0].target.actor.damage(40,point(0,1,0),v(0,0,1),'body')
    assert.equal(f.visuals[0].snapshot().role,'Hit');f.tick(.2);assert.deepEqual(f.hits,[])
    f.ai.members[0].target.actor.damage(60,point(0,1,0),v(0,0,1),'body')
    assert.equal(f.visuals[0].snapshot().role,'Death');f.tick(10);assert.deepEqual(f.hits,[])
    assert.ok(f.changes()>0)
  }finally{f.dispose()}
})

test('pause/dead/intro cancel pending rounds and owned audio; JSON restore keeps facts without pending aim',()=>{
  for(const mode of ['pause','dead','intro']){
    const f=fixture(undefined,{audio:true})
    try{
      f.until('LOCK');const saved=JSON.parse(JSON.stringify(f.ai.capture()))
      if(mode==='pause')f.pause()
      if(mode==='dead'){f.g.player.alive=false;f.g.events.emit('player:dead',{})}
      if(mode==='intro')f.intro(true)
      f.tick(10);const frozen=JSON.parse(JSON.stringify(f.ai.capture()));f.tick(20)
      assert.deepEqual(json(f.ai.capture()),frozen);assert.deepEqual(f.hits,[]);assert.equal(f.voices.size,0)
      f.resume();f.g.player.alive=true;f.intro(false);f.ai.restore(saved)
      f.tick(.2);assert.deepEqual(f.hits,[]);assert.equal(f.ai.snapshot().members[0].direction,null)
      f.until('LOCK');f.tick(.15);assert.deepEqual(f.hits,[5]);assert.equal(f.voices.size,1)
      f.pause();assert.equal(f.voices.size,0);assert.equal(f.ai.snapshot().effects.voices,0)
    }finally{f.dispose()}
  }
})

test('pause, intro, player/actor death, Hit, disable and retry discard all remaining burst rounds',()=>{
  for(const mode of ['pause','intro','player-dead','actor-dead','hit','disable','retry']){
    const f=fixture(undefined,{audio:true})
    try{
      f.until('LOCK');f.tick(.15);assert.deepEqual(f.hits,[5]);assert.equal(f.ai.snapshot().members[0].burstRemaining,3)
      const saved=json(f.ai.capture())
      if(mode==='pause')f.pause()
      if(mode==='intro')f.intro(true)
      if(mode==='player-dead'){f.g.player.alive=false;f.g.events.emit('player:dead',{})}
      if(mode==='actor-dead'||mode==='hit')f.ai.members[0].target.actor.damage(mode==='hit'?1:100,point(0,1,0),v(0,0,1),'body')
      if(mode==='disable')f.g.player.enabled=false
      if(mode==='retry')f.ai.restore(saved)
      f.tick(.1)
      assert.equal(f.ai.snapshot().members[0].burstRemaining,0,mode);assert.deepEqual(f.hits,[5],mode)
      assert.equal(f.voices.size,0,mode)
      if(mode!=='actor-dead'){
        f.resume();f.intro(false);f.g.player.alive=f.g.player.enabled=true;f.tick(.2)
        assert.deepEqual(f.hits,[5],`${mode} cannot resume a suspended burst`)
      }
    }finally{f.dispose()}
  }
})

test('lethal first bullet synchronously cancels all remaining rounds and other shooters',()=>{
  const f=fixture([definition('a',-1),definition('b',1)],{audio:true})
  try{
    f.g.player.health=5;f.until('LOCK');f.tick(.15)
    assert.equal(f.g.player.alive,false);assert.deepEqual(f.hits,[5]);assert.equal(f.ai.snapshot().shooters.length,0)
    assert.equal(f.voices.size,0);assert.ok(f.ai.snapshot().members.every(m=>m.burstRemaining===0))
    f.tick(10);assert.deepEqual(f.hits,[5])
  }finally{f.dispose()}
})

test('checkpoint position validation precedes restored door geometry; movement still uses live canEnter',()=>{
  let open=true
  const f=fixture(undefined,{canEnter:()=>open})
  try{
    const saved=json(f.ai.capture());open=false
    const wall=f.wall([-1,0,-1],[1,3,1])
    assert.equal(f.g.physics.nav.isWalkable(0,-160),false)
    assert.equal(f.ai.validateCapture(saved),true,'saved open-world location is not judged against a later closed door')
    f.g.physics.removeBox(wall);f.g.physics.build();open=true
    f.ai.restore(saved);assert.deepEqual(json(f.ai.capture()),saved)
  }finally{f.dispose()}
})

test('capture validation rejects broken identities/HP/vector/timers atomically; far sense and animation are throttled',()=>{
  const f=fixture()
  try{
    const saved=JSON.parse(JSON.stringify(f.ai.capture()))
    for(const mutate of [s=>s.members[0].id='wrong',s=>s.members[0].hp=-1,s=>s.members[0].hp=101,s=>s.members[0].position=[1,null,0],
      s=>s.members[0].position=[-59.9,0,-160],s=>s.members[0].position=[-61,0,-190],
      s=>s.members[0].memory=-1,s=>s.members[0].state='DEAD',s=>s.members.push(s.members[0])]){
      const bad=structuredClone(saved);mutate(bad);assert.throws(()=>f.ai.restore(bad),/checkpoint/)
      assert.deepEqual(json(f.ai.capture()),saved)
    }
    f.g.player.pos.z=-230
    const before=f.ai.snapshot().stats
    for(let i=0;i<100;i++)f.tick(.01)
    const stats=f.ai.snapshot().stats
    assert.ok(stats.senses-before.senses<=2);assert.ok(stats.animationUpdates-before.animationUpdates<=4)
    assert.equal(f.ai.members[0].target.actor.active,true)
    assert.equal(f.ai.snapshot().members[0].lastKnown,null)
  }finally{f.dispose()}
})

test('actual 13 authored deployments patrol the accepted A0 native world locally without body overlap or territory escape',async()=>{
  const world=await nativeChapter3Fixture(),f=fixture(CH3_CLEARANCE_DEPLOYMENTS,{worldPhysics:world.g.physics})
  try{
    f.g.player.pos.set(-56,0,-190)
    const starts=f.ai.members.map(m=>m.target.actor.pos.clone()),travelled=new Map()
    for(let i=0;i<50;i++){
      f.tick(.1)
      for(const m of f.ai.members){
        const pos=m.target.actor.pos,b=m.definition.territory
        assert.ok(pos.x>=b.minX&&pos.x<=b.maxX&&pos.z>=b.minZ&&pos.z<=b.maxZ,m.id)
        assert.equal(f.g.physics.nav.isWalkable(pos.x,pos.z),true,m.id)
        const start=starts[f.ai.members.indexOf(m)]
        travelled.set(m.id,Math.max(travelled.get(m.id)||0,pos.distanceTo(start)))
        for(const peer of f.ai.members)if(peer!==m)assert.ok(pos.distanceTo(peer.target.actor.pos)>=.64,`${m.id}/${peer.id}`)
      }
    }
    for(const m of f.ai.members)assert.ok(travelled.get(m.id)>.25,`${m.id} never walked its own local patrol`)
    assert.deepEqual(f.hits,[],'entry remains outside local encounter sightlines')
    assert.equal(f.ai.snapshot().stats.pathRejects,0)
    const saved=json(f.ai.capture());f.ai.restore(saved)
    assert.equal(f.ai.members.length,13);assert.equal(f.ai.validateCapture(json(f.ai.capture())),true)
  }finally{f.dispose();world.dispose()}
})

test('actual A0 west soldier investigates around native cargo beyond its old territory and restores there',async()=>{
  const world=await nativeChapter3Fixture(),d=CH3_CLEARANCE_DEPLOYMENTS.find(d=>d.id==='west-1')
  const f=fixture([d],{worldPhysics:world.g.physics})
  try{
    f.g.player.pos.set(-56,0,-163);f.tick(.01)
    f.g.events.emit('weapon:fire',{origin:v(-56,1.7,-163),dir:v(0,0,-1)})
    assert.equal(f.ai.capture().members[0].knownKind,'gun')
    const clue=json(f.ai.capture().members[0].lastKnown),start=f.ai.members[0].target.actor.pos.clone()
    f.g.player.pos.set(-95,0,-230)
    let escaped=false,travel=0
    for(let i=0;i<120;i++){
      const before=f.ai.members[0].target.actor.pos.clone();f.tick(.1);const pos=f.ai.members[0].target.actor.pos
      travel+=pos.distanceTo(before);escaped ||= pos.x<d.territory.minX||pos.z>d.territory.maxZ
      assert.ok(pos.distanceTo(before)<=.3+1e-5);assert.ok(f.g.physics.nav.isWalkable(pos.x,pos.z))
      assert.ok(pos.x>=CH3.bounds.minX+.32&&pos.x<=CH3.bounds.maxX-.32&&pos.z>=CH3.bounds.minZ+.32&&pos.z<=CH3.bounds.maxZ-.32)
    }
    assert.ok(escaped);assert.ok(travel>15,`actual travelled ${travel}`)
    assert.ok(f.ai.members[0].target.actor.pos.distanceTo(v(...clue))<.2)
    assert.ok(f.ai.members[0].target.actor.pos.distanceTo(start)>15)
    const saved=json(f.ai.capture());f.ai.restore(saved);assert.deepEqual(json(f.ai.capture()),saved)
    assert.deepEqual(f.hits,[])
  }finally{f.dispose();world.dispose()}
})

test('CH3 anchored native navigation respects chapter edges, live canEnter and exact unsnapped destinations',async()=>{
  const world=await nativeChapter3Fixture(),{g}=world
  const blocked=(from,to)=>!(Math.min(from.x,to.x)<-38&&Math.max(from.x,to.x)>-38&&Math.min(from.z,to.z)<-141&&Math.max(from.z,to.z)>-143)
  const nav=createChapter3ClearanceNavigation(g,{canEnter:blocked})
  try{
    const start=v(-56,0,-190),goal=v(-56,0,-110),route=nav.findPath(start,goal)
    assert.ok(route);assert.equal(route.kind,'native-corridor-graph');assert.ok(route.intermediate.length>1)
    let from=start
    for(const to of route.path){assert.ok(nav.legValid(from,to));assert.ok(nav.contains(to));from=to}
    assert.ok(from.distanceTo(goal)<.05)
    assert.equal(nav.findPath(start,v(-61,0,-190)),null,'no leaving chapter through the real open seam')
    assert.equal(nav.findPath(start,v(-59.9,0,-190)),null,'entire capsule remains inside chapter')
    assert.equal(nav.findPath(v(-33.5,0,-142),v(-40,.172,-142)),null,'canEnter forbids crossing closed safe-house approach')
    const original=g.physics.nav.findPath;g.physics.nav.findPath=()=>[v(-56,0,-188)]
    try{assert.equal(nav.findPath(start,v(-56,0,-186)),null,'reject replaced native endpoint')}
    finally{g.physics.nav.findPath=original}
  }finally{nav.dispose();world.dispose()}
})

})
