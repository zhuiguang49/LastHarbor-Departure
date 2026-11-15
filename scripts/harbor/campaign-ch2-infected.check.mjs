import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { parse } from '@babel/parser'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { installCharacterTarget } from './character-native-target.mjs'
import { INFECTED_CLIPS } from './character-clips.mjs'
import { CH2_SPAWNS } from './campaign-ch2-layout.mjs'
import { createChapter2Infected, CH2_INFECTED_TUNING as tuning } from './campaign-ch2-infected.mjs'

// No renderer/browser, level build or route suite. Borrow only native Three,
// the unchanged 9000-node nav/capsule, and the actual single-character bridge.
const {g:native,T}=await nativeFixture(),physics=native.physics
const html=await fs.readFile(new URL('../../几猫国产3A大作_V1-fable5.2.html',import.meta.url),'utf8')
const code=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'))
const body=parse(code).program.body[0].expression.callee.body.body
const dependencies=new Set(['oi','Pi','Zn','bi','Fo','sl','kn','Mt','rC'])
const playerSource=body.flatMap(node=>{
  if(node.type==='FunctionDeclaration' && node.id.name==='x_')return [code.slice(node.start,node.end)]
  return (node.declarations||[]).filter(d=>dependencies.has(d.id.name)).map(d=>`var ${code.slice(d.start,d.end)};`)
}).join('\n')
const nativePlayer=Function('W','In',`${playerSource};return x_`)(T.Vector3,T.Euler)
const spawn=CH2_SPAWNS[1],v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z)

function fixture({realPlayer=false,mode='ordinary',canAttack=()=>true}={}) {
  for(const box of [...physics.boxes])physics.removeBox(box)
  physics.build()
  const listeners=new Map(),emitted=[],plays=[],voices=[]
  const events={on(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn)},
    off(name,fn){listeners.get(name)?.delete(fn)},
    emit(name,data){emitted.push({name,data});for(const fn of listeners.get(name)||[])fn(data)}}
  const g={THREE:T,physics,events,game:{state:'playing',run:{time:0}},enemies:{raycast:()=>null},
    camera:new T.PerspectiveCamera(),params:{},input:{move:{x:0,y:0},look:{dx:0,dy:0},sprint:false,crouch:false,ads:false,fire:false,pressed:()=>false}}
  g.player=realPlayer?nativePlayer(g):{pos:v(),eye:v(),vel:v(),alive:true,enabled:true,onGround:true,speed:0,crouching:false,health:100,
    damage(amount){this.health-=amount;if(this.health<=0){this.alive=false;events.emit('player:dead',{})}}}
  const root=new T.Group();root.position.set(spawn.position.x,spawn.position.y,spawn.position.z)
  const instance={root},mixer=new T.AnimationMixer(root),actions=new Map()
  let current=null,updates=0,targetUpdates=0,targetDisposals=0,animationDisposals=0,voiceDisposals=0,voiceStops=0
  const animation={playClip(index,options={}){
    if(current?.index===index && options.restart===false)return
    plays.push({index,time:g.game.run.time});mixer.stopAllAction()
    let action=actions.get(index)
    if(!action){action=mixer.clipAction(new T.AnimationClip(String(index),Object.values(INFECTED_CLIPS).find(c=>c.index===index).duration,[]));actions.set(index,action)}
    action.reset().setLoop(options.loop?T.LoopRepeat:T.LoopOnce,options.loop?Infinity:1);action.clampWhenFinished=true;action.play();current={index,action}
  },update(dt){updates++;mixer.update(dt)},stop(){mixer.stopAllAction()},dispose(){animationDisposals++}}
  const voice={play(kind,pos,options){voices.push({kind,position:pos.toArray(),options,time:g.game.run.time});return true},update(){},stop(){voiceStops++},dispose(){voiceDisposals++}}
  const target=installCharacterTarget(g,instance,{animation,canAttack,clipFor:role=>INFECTED_CLIPS[role].index})
  target.actor.id=spawn.id
  const nativeUpdate=target.update,nativeDispose=target.dispose,bridgeSnapshot=target.snapshot
  target.update=dt=>{targetUpdates++;nativeUpdate(dt)}
  target.dispose=()=>{targetDisposals++;nativeDispose()}
  target.snapshot=()=>{throw Error('AI must not clone target event history per tick')}
  function placePlayer(dx,dz) {
    const position=v(root.position.x+dx,0,root.position.z+dz)
    if(realPlayer)g.player.reset({pos:position,yaw:0})
    else {g.player.pos.copy(position);g.player.eye.copy(position).y+=1.68}
  }
  placePlayer(0,7) // Behind the native -Z character facing.
  const ai=createChapter2Infected(g,{spawn:{...spawn,mode},instance,animation,target,voice})
  const tick=(count=1,dt=.05)=>{for(let i=0;i<count;i++){g.game.run.time+=dt;ai.update(dt)}}
  const step=(dx=0,dz=-.1)=>{
    g.player.pos.add(v(dx,0,dz));g.player.eye.copy(g.player.pos).y+=1.68
    g.player.vel.set(dx/.05,0,dz/.05);g.player.speed=Math.hypot(dx,dz)/.05
    events.emit('player:step',{pos:g.player.pos,surface:'metal',sprint:false});tick()
  }
  const box=(min,max,options={})=>{const b=physics.addBox(v(...min),v(...max),options);physics.build();return b}
  return {g,ai,target,root,plays,voices,emitted,listeners,animation,box,placePlayer,tick,step,bridgeSnapshot,
    counts:()=>({updates,targetUpdates,targetDisposals,animationDisposals,voiceDisposals,voiceStops}),
    cleanup(){ai.dispose();nativeDispose();mixer.stopAllAction();mixer.uncacheRoot(root)}}
}
function awaitAttack(f) {
  for(let i=0;i<100 && !f.ai.snapshot().attack;i++)f.tick()
  assert.ok(f.ai.snapshot().attack,'expected a telegraphed attack')
}

test('fluidity: reacquisition within three seconds resumes pursuit without repeating Alert',()=>{
  const f=fixture()
  try{
    f.placePlayer(0,-8);f.ai.reset();f.tick()
    assert.equal(f.ai.snapshot().state,'ALERT')
    for(let i=0;i<50 && f.ai.snapshot().state==='ALERT';i++)f.tick()
    assert.equal(f.ai.snapshot().state,'CHASE')
    for(let i=0;i<3;i++){
      f.placePlayer(60,40);f.tick();assert.equal(f.ai.snapshot().state,'INVESTIGATE')
      f.root.rotation.y=0;f.placePlayer(0,-8);f.tick()
      assert.equal(f.ai.snapshot().state,'CHASE','brief LOS loss must not replay Alert')
    }
    assert.equal(f.plays.filter(e=>e.index===INFECTED_CLIPS.Alert.index).length,1)
    assert.equal(f.voices.filter(e=>e.kind==='alert').length,1)
    f.placePlayer(60,40);f.tick(62)
    f.root.rotation.y=0;f.placePlayer(0,-8);f.tick()
    assert.equal(f.ai.snapshot().state,'ALERT','quiet loss beyond three seconds permits a fresh tell')
  }finally{f.cleanup()}
})

test('fluidity: first detection gives a short tell and starts moving within one second',()=>{
  const f=fixture()
  try{
    f.placePlayer(0,-8);f.ai.reset();f.tick()
    assert.equal(f.ai.snapshot().state,'ALERT');assert.equal(f.g.player.health,100)
    f.tick(16)
    assert.equal(f.ai.snapshot().state,'CHASE')
    assert.ok(f.ai.snapshot().motion.distance>0)
  }finally{f.cleanup()}
})

test('locked pursuit matches actual native Shift speed only beyond 5m; ordinary lost sight investigates memory',t=>{
  const samples=[]
  for(const distance of [4.999,5,5.001,8]){
    const f=fixture({realPlayer:true,mode:'omniscient-tracker'})
    try{
      f.placePlayer(0,-distance);f.ai.reset();f.tick()
      const snap=f.ai.snapshot(),expected=distance>5?6.4:3.6
      assert.equal(snap.pursuit.nominalSpeed,expected)
      assert.equal(snap.pursuit.phase,distance>5?'far':'near')
      assert.ok(Math.abs(snap.motion.lastDistance-expected*.05)<1e-6)
      f.g.input.move.y=1;f.g.input.sprint=true
      // Native ground acceleration is preserved; measure a full-speed step.
      for(let i=0;i<16;i++)f.g.player.update(.05)
      assert.equal(f.g.player.tuning.sprint,6.4)
      assert.equal(f.g.player.sprinting,true)
      const before=f.g.player.pos.clone();f.g.player.update(.05)
      const actual=Math.hypot(f.g.player.pos.x-before.x,f.g.player.pos.z-before.z)/.05
      assert.ok(Math.abs(actual-6.4)<1e-6,'unchanged native straight Shift movement is 6.4m/s')
      samples.push({distance,pursuit:snap.pursuit,actualNativeShiftSpeed:actual})
    }finally{f.cleanup()}
  }
  const f=fixture()
  try{
    f.placePlayer(0,-9);f.ai.reset();f.tick(16)
    assert.equal(f.ai.snapshot().pursuit.nominalSpeed,6.4)
    const seen=f.ai.snapshot().lastSeen
    f.placePlayer(60,40);f.tick()
    const snap=f.ai.snapshot()
    assert.equal(snap.state,'INVESTIGATE');assert.equal(snap.pursuit,null)
    assert.deepEqual(snap.goal,seen.position);assert.equal(snap.trackingPosition,null)
    assert.ok(Math.abs(snap.motion.lastDistance-1.8*.05)<1e-6)
  }finally{f.cleanup()}
  t.diagnostic(JSON.stringify(samples))
})

test('successful immediate lethal start unlocks tracker once without resurrecting a cancelled attack',()=>{
  const f=fixture({mode:'omniscient-tracker'})
  try{
    f.g.player.health=15;f.placePlayer(0,1.2);f.ai.reset();f.tick()
    assert.equal(f.g.player.alive,false);assert.equal(f.g.player.health,0)
    assert.equal(f.ai.snapshot().firstAttackStarted,true)
    assert.equal(f.ai.snapshot().attack,null);assert.equal(f.bridgeSnapshot().attack,null)
    assert.equal(f.bridgeSnapshot().events.filter(e=>e.type==='attack-contact').length,1)
    const count=f.counts().updates;f.tick(20);assert.equal(f.counts().updates,count)
    assert.equal(f.g.player.health,0)
  }finally{f.cleanup()}
})

test('Hit retains near/far pursuit speed at ninety percent without compounding repeated damage',()=>{
  for(const distance of [4.8,9]){
    const f=fixture()
    try{
      f.placePlayer(0,-distance);f.ai.reset();f.tick(16)
      assert.equal(f.ai.snapshot().state,'CHASE')
      const speed=f.ai.snapshot().pursuit.nominalSpeed
      assert.equal(speed,distance>5?6.4:3.6)
      for(let i=0;i<6;i++){
        f.target.actor.damage(1,v(),v(),'body')
        const before=f.root.position.clone();f.tick()
        assert.equal(f.ai.snapshot().state,'STAGGER')
        assert.equal(f.plays.at(-1).index,INFECTED_CLIPS.Hit.index)
        assert.ok(Math.abs(f.root.position.distanceTo(before)-speed*.9*.05)<.001,'Hit retains the pre-hit nominal speed without compounding slowdown')
      }
      assert.equal(f.counts().updates,f.counts().targetUpdates)
    }finally{f.cleanup()}
  }
})

test('Hit uses nominal investigate/wander speed, refreshes honest perception, and never invents a hidden target',()=>{
  for(const mode of ['INVESTIGATE','WANDER','UNINFORMED']){
    const f=fixture()
    try{
      if(mode==='INVESTIGATE'){f.step();f.tick(16);f.placePlayer(60,40)}
      else {f.placePlayer(60,40);if(mode==='WANDER')f.root.position.x+=7;f.ai.reset();f.tick(mode==='WANDER'?16:1)}
      assert.equal(f.ai.snapshot().state,mode==='UNINFORMED'?'WANDER':mode)
      const before=f.root.position.clone(),known=f.ai.snapshot().lastHeard
      f.target.actor.damage(1,v(),v(),'body');f.tick()
      const snap=f.ai.snapshot(),speed=mode==='INVESTIGATE'?1.8*.9:mode==='WANDER'?1.1*.9:0
      assert.equal(snap.state,'STAGGER');assert.equal(f.plays.at(-1).index,INFECTED_CLIPS.Hit.index)
      assert.ok(Math.abs(f.root.position.distanceTo(before)-speed*.05)<.001,mode)
      assert.equal(snap.lastSeen,null);assert.deepEqual(snap.lastHeard,known);assert.equal(snap.trackingPosition,null)
      if(mode==='UNINFORMED')assert.equal(snap.goal,null)
      // Credible stationary vision still updates while the full Hit is playing.
      f.root.rotation.y=0;f.placePlayer(0,-7);f.tick()
      assert.ok(f.ai.snapshot().lastSeen);assert.equal(f.plays.at(-1).index,INFECTED_CLIPS.Hit.index)
    }finally{f.cleanup()}
  }
})

test('Hit obeys a real capsule wall and lethal damage stops immediately without a queued contact',()=>{
  const f=fixture()
  try{
    f.placePlayer(0,-9);f.ai.reset();f.tick(16)
    const {x,z}=f.root.position
    f.box([x-5,0,z-1],[x+5,3,z-.8],{noNav:true})
    f.target.actor.damage(1,v(),v(),'body');f.tick(24)
    assert.equal(f.ai.snapshot().state,'STAGGER');assert.equal(f.ai.snapshot().motion.moving,false)
    assert.equal(f.plays.at(-1).index,INFECTED_CLIPS.Hit.index)
    assert.ok(f.root.position.z>=z-.8+.32-1e-6)
    const position=f.root.position.clone();f.target.actor.damage(199,v(),v(),'body');f.tick(10)
    assert.equal(f.ai.snapshot().state,'DEAD');assert.equal(f.ai.snapshot().attack,null)
    assert.ok(f.root.position.distanceTo(position)<1e-8);assert.equal(f.plays.at(-1).index,INFECTED_CLIPS.Death.index)
    assert.equal(f.g.player.health,100)
  }finally{f.cleanup()}
})

test('tracker stays silent through Hit/pause/rejected starts, unlocks only successful beginAttack, and resets explicitly',()=>{
  let allowed=false
  const f=fixture({mode:'omniscient-tracker',canAttack:()=>allowed})
  try{
    f.placePlayer(0,8);f.ai.reset();f.tick(4)
    assert.equal(f.ai.snapshot().state,'CHASE');assert.ok(f.ai.snapshot().motion.distance>0)
    assert.equal(f.ai.snapshot().lastSeen,null);assert.equal(f.ai.snapshot().lastHeard,null)
    assert.deepEqual(f.ai.snapshot().trackingPosition,f.g.player.pos.toArray());assert.equal(f.voices.length,0)
    f.target.actor.damage(1,v(),v(),'body');f.tick()
    assert.equal(f.ai.snapshot().state,'STAGGER');assert.equal(f.ai.snapshot().silent,true)
    f.g.game.state='paused';f.g.events.emit('game:state',{state:'paused'});f.tick(4)
    assert.equal(f.ai.snapshot().firstAttackStarted,false);assert.equal(f.voices.length,0)
    f.g.game.state='playing';f.g.events.emit('game:state',{state:'playing'});f.tick(40)
    f.placePlayer(0,1.2);f.tick(3)
    assert.equal(f.ai.snapshot().attack,null);assert.equal(f.ai.snapshot().firstAttackStarted,false)
    assert.equal(f.ai.snapshot().silent,true);assert.equal(f.voices.length,0)
    allowed=true;f.tick()
    const begun=f.ai.snapshot()
    assert.equal(begun.firstAttackStarted,true);assert.equal(begun.silent,false);assert.ok(begun.attack)
    assert.equal(f.voices.at(-1).kind,'attack');assert.equal(f.g.player.health,85)
    f.tick(10);assert.equal(f.g.player.health,85,'one action contacts at most once')
    // Interrupt after the action begins: silence must remain unlocked forever in this run.
    f.target.actor.damage(1,v(),v(),'body');f.tick();assert.equal(f.ai.snapshot().firstAttackStarted,true)
    f.placePlayer(0,20);f.g.player.crouching=true;f.tick(42)
    assert.equal(f.ai.snapshot().state,'CHASE');assert.equal(f.ai.snapshot().silent,false)
    assert.deepEqual(f.ai.snapshot().trackingPosition,f.g.player.pos.toArray())
    assert.ok(f.voices.some(e=>e.kind==='chase'));assert.equal(f.voices.some(e=>e.kind==='alert'),false)
    f.target.reset();f.ai.reset()
    assert.equal(f.target.actor.hp,200);assert.equal(f.ai.snapshot().firstAttackStarted,false)
    assert.equal(f.ai.snapshot().silent,true);assert.equal(f.ai.snapshot().trackingPosition,null)
    const count=f.voices.length;f.tick(4);assert.equal(f.voices.length,count)
  }finally{f.cleanup()}
})

test('tracker knows stationary crouched positions behind steel, takes native detours, and never starts through the wall',()=>{
  const f=fixture({mode:'omniscient-tracker'})
  try{
    f.g.player.crouching=true;f.placePlayer(0,-2.6)
    const {x,z}=f.root.position,wall=f.box([x-1,0,z-1.5],[x+1,3,z-1.3])
    f.ai.reset();f.tick()
    let snap=f.ai.snapshot()
    assert.equal(snap.visible,false);assert.equal(snap.lastSeen,null);assert.equal(snap.lastHeard,null)
    assert.deepEqual(snap.trackingPosition,f.g.player.pos.toArray())
    assert.equal(snap.attack,null);assert.equal(snap.firstAttackStarted,false);assert.equal(f.voices.length,0)
    assert.ok(snap.path.length>=2,'real native path rounds the steel')
    const start=f.root.position.clone();f.tick(5)
    assert.ok(f.root.position.distanceTo(start)>.5);assert.equal(f.g.player.health,100)
    assert.ok(Math.abs(f.root.position.x-x)>.3,'actual horizontal detour')
    f.placePlayer(0,15);f.tick()
    snap=f.ai.snapshot();assert.deepEqual(snap.trackingPosition,f.g.player.pos.toArray())
    assert.equal(snap.lastHeard,null);assert.equal(snap.firstAttackStarted,false)
    physics.removeBox(wall);physics.build()
  }finally{f.cleanup()}
})

test('tracker does not apply the melee stopping radius through a wall when a valid detour remains',()=>{
  const f=fixture({mode:'omniscient-tracker'})
  try{
    const {x,z}=f.root.position
    f.placePlayer(0,-2.6);f.box([x-1,0,z-1.5],[x+1,3,z-1.3]);f.ai.reset()
    assert.ok(physics.nav.isWalkable(x,z));assert.ok(physics.nav.isWalkable(x,z-2.6))
    for(let i=0;i<60 && !f.ai.snapshot().firstAttackStarted;i++)f.tick()
    assert.equal(f.ai.snapshot().firstAttackStarted,true,'nearby hidden tracker must finish its detour and begin a real attack')
    const source=f.root.position.clone().add(v(0,1.1,0)),destination=f.g.player.pos.clone().add(v(0,.9,0))
    const contact=source.distanceTo(destination)<=tuning.contactRange&&physics.lineOfSight(source,destination)
    assert.equal(f.g.player.health,contact?85:100,'post-corner damage follows actual current range and LOS')
    assert.equal(f.bridgeSnapshot().events.filter(e=>e.type==='attack-contact').length,contact?1:0)
  }finally{f.cleanup()}
})

test('fluidity: nearby attacks recur within 2.4 seconds and recovery follows a retreating player',t=>{
  const f=fixture()
  try{
    f.placePlayer(0,-1.2);f.ai.reset();awaitAttack(f)
    const first=f.g.game.run.time
    for(let i=0;i<50 && f.ai.snapshot().attack;i++)f.tick()
    assert.equal(f.ai.snapshot().attack,null)
    f.placePlayer(0,-5);const position=f.root.position.clone()
    f.tick(2)
    assert.ok(f.ai.snapshot().cooldown>0)
    assert.ok(f.root.position.distanceTo(position)>.1,'cooldown must not freeze pursuit')
    f.placePlayer(0,-1.2)
    for(let i=0;i<20 && !f.ai.snapshot().attack;i++)f.tick()
    const interval=f.g.game.run.time-first
    assert.ok(f.ai.snapshot().attack);assert.ok(interval<=2.4,`attack interval ${interval}`)
    t.diagnostic(`stationary/retreat/reapproach attack interval ${interval.toFixed(3)}s`)
  }finally{f.cleanup()}
})

test('fluidity: fresh sound during an investigation resumes action without an Alert loop',()=>{
  const f=fixture()
  try{
    f.placePlayer(0,7);f.ai.reset()
    const {x,z}=f.g.player.pos
    // A low obstruction makes the sound source unreachable without blocking
    // the real ear-to-gun LOS. Repeated shots must not repeat the surprise tell.
    f.box([x-2,0,z-2],[x+2,1,z+2])
    assert.equal(physics.nav.isWalkable(x,z),false,'sound fixture must exercise a blocked navigation endpoint')
    for(let i=0;i<180;i++){
      if(i%10===0)f.g.events.emit('weapon:fire',{weapon:'pistol',origin:f.g.player.eye,dir:v(0,0,-1)})
      f.tick()
    }
    const snap=f.ai.snapshot()
    assert.ok(snap.signals.shotsAccepted>10);assert.equal(snap.visible,false)
    assert.equal(f.plays.filter(e=>e.index===INFECTED_CLIPS.Alert.index).length,1)
    assert.equal(f.voices.filter(e=>e.kind==='alert').length,1)
    assert.ok(snap.events.some(e=>e.type==='state'&&e.reason==='sound-reacquired'))
    assert.equal(snap.state,'INVESTIGATE');assert.ok(snap.awarenessRemaining>2)
    assert.equal(snap.navigation.lastFailure,'unwalkable-endpoint')
    assert.equal(snap.motion.distance,0)
  }finally{f.cleanup()}
})

test('ordinary hearing uses real event position, <=10m boundary, motion, grounded/quiet and native steel LOS',()=>{
  for(const [distance,accepted] of [[9.999,true],[10,true],[10.001,false],[12,false]]) {
    const f=fixture()
    try{f.placePlayer(0,distance+.1);f.ai.reset();f.step()
      assert.equal(!!f.ai.snapshot().lastHeard,accepted,`step distance ${distance}`)
      assert.equal(f.ai.snapshot().visible,false)
    }finally{f.cleanup()}
  }
  for(const invalid of ['stationary','crouch','airborne','disabled','paused','demo','dead','camera','teleport']) {
    const f=fixture()
    try{
      f.g.player.vel.z=-2;f.g.player.speed=2
      if(invalid==='crouch')f.g.player.crouching=true
      if(invalid==='airborne')f.g.player.onGround=false
      if(invalid==='disabled')f.g.player.enabled=false
      if(['paused','demo'].includes(invalid))f.g.game.state=invalid
      if(invalid==='dead')f.g.player.alive=false
      if(invalid==='camera')f.g.camera.rotation.y+=1
      if(invalid==='teleport')f.g.player.pos.z+=2
      if(['crouch','airborne','disabled','paused','demo','dead'].includes(invalid))f.g.player.pos.z-=.1
      f.g.events.emit('player:step',{pos:f.g.player.pos,surface:'metal'});f.tick()
      assert.equal(f.ai.snapshot().lastHeard,null,invalid)
    }finally{f.cleanup()}
  }
  const f=fixture()
  try{
    const {x,z}=f.root.position;f.box([x-2,0,z+2],[x+2,3,z+2.2])
    f.step();assert.equal(f.ai.snapshot().lastHeard,null)
    f.g.events.emit('player:step',{pos:f.g.player.pos.clone().add(v(20,0,0)),surface:'metal'});f.tick()
    assert.equal(f.ai.snapshot().lastHeard,null)
  }finally{f.cleanup()}
})

test('actual native player produces cadence; bounds-held keys and camera do not create AI hearing; sprint stays <=10m',t=>{
  const counts={}
  for(const mode of ['walk','sprint','crouch','idle','bound','sprint-outside']) {
    const f=fixture({realPlayer:true})
    try{
      f.placePlayer(0,mode==='sprint-outside'?24:7)
      if(mode==='bound') {
        // Native player bounds clamp occurs after capsule; vel/speed remain nonzero.
        physics.bounds.max.z=f.g.player.pos.z+.4
        f.g.player.yaw=Math.PI
      }
      f.ai.reset();f.g.input.move.y=['idle'].includes(mode)?0:1
      f.g.input.sprint=mode.startsWith('sprint');f.g.input.crouch=mode==='crouch'
      if(mode==='idle')f.g.input.look.dx=.01
      for(let i=0;i<28;i++){f.g.player.update(.05);f.tick()}
      const result=f.ai.snapshot();counts[mode]={nativeSteps:f.emitted.filter(e=>e.name==='player:step').length,accepted:result.signals.stepsAccepted}
      if(mode==='walk'||mode==='sprint')assert.ok(result.signals.stepsAccepted>0,mode)
      else assert.equal(result.signals.stepsAccepted,0,mode)
      if(mode==='bound')assert.ok(counts[mode].nativeSteps>0,'exercise real native phantom cadence at bounds')
    }finally{physics.bounds.max.z=30;f.cleanup()}
  }
  assert.ok(counts.sprint.nativeSteps>counts.walk.nativeSteps)
  t.diagnostic(JSON.stringify(counts))
})

test('stationary clear FOV discovers player; rear, range and steel wall reject vision independently',()=>{
  for(const [dx,dz,wall,visible] of [[0,-7,false,true],[7,0,false,false],[0,7,false,false],[0,-11,false,false],[0,-7,true,false]]) {
    const f=fixture()
    try{
      f.placePlayer(dx,dz);f.ai.reset()
      if(wall){const {x,z}=f.root.position;f.box([x-2,0,z-4],[x+2,3,z-3.8])}
      f.tick();assert.equal(f.ai.snapshot().visible,visible,`${dx},${dz},wall:${wall}`)
      assert.equal(f.ai.snapshot().state,visible?'ALERT':'WANDER')
      assert.equal(f.ai.snapshot().lastHeard,null)
    }finally{f.cleanup()}
  }
})

test('gunfire is an independent 25m event with LOS; knife/dry/malformed events give no signal',()=>{
  for(const [distance,wall,accepted] of [[23,false,true],[26,false,false],[23,true,false]]) {
    const f=fixture()
    try{
      f.placePlayer(0,distance);f.ai.reset()
      if(wall){const {x,z}=f.root.position;f.box([x-2,0,z+4],[x+2,3,z+4.2])}
      f.g.events.emit('weapon:fire',{origin:f.g.player.eye,dir:v(0,0,-1),muzzle:f.g.player.eye,weapon:'pistol'});f.tick()
      assert.equal(!!f.ai.snapshot().lastHeard,accepted)
      if(accepted){assert.equal(f.ai.snapshot().lastHeard.kind,'gun');assert.equal(f.ai.snapshot().lastSeen,null)}
    }finally{f.cleanup()}
  }
  const f=fixture()
  try{
    for(const name of ['weapon:melee','weapon:dry'])f.g.events.emit(name,{origin:f.g.player.eye})
    f.g.events.emit('weapon:fire',{origin:f.g.player.eye,dir:v(0,0,-1),weapon:'knife'})
    f.g.events.emit('weapon:fire',{});f.tick();assert.equal(f.ai.snapshot().lastHeard,null)
  }finally{f.cleanup()}
})

test('lost signal keeps separate last seen/heard locations, bounded search forgets hidden player',()=>{
  const f=fixture()
  try{
    f.step();const heard=f.ai.snapshot().lastHeard
    f.placePlayer(0,-6);f.tick();const seen=f.ai.snapshot().lastSeen
    assert.ok(seen);assert.deepEqual(f.ai.snapshot().lastHeard,heard)
    f.placePlayer(60,30);f.tick(45)
    const lost=f.ai.snapshot();assert.deepEqual(lost.goal,seen.position)
    assert.deepEqual(lost.lastSeen,seen);assert.deepEqual(lost.lastHeard,heard)
    f.tick(260);assert.equal(f.ai.snapshot().state,'WANDER')
    assert.equal(f.ai.snapshot().lastSeen,null);assert.equal(f.ai.snapshot().lastHeard,null)
    assert.ok(f.ai.snapshot().navigation.attempts<30,'planning remains rate limited')
  }finally{f.cleanup()}
})

test('real native nav/capsule execute a corner detour to the remembered point, not current hidden player',t=>{
  const f=fixture(),trace=[]
  try{
    f.root.rotation.y=Math.PI;f.placePlayer(0,5);f.ai.reset();f.tick()
    const destination=f.ai.snapshot().lastSeen.position,{x,z}=f.root.position
    f.box([x-1,0,z+2],[x+1,3,z+2.4]);f.placePlayer(50,40)
    for(let i=0;i<180;i++){f.tick();trace.push(f.root.position.toArray());if(f.ai.snapshot().state==='SEARCH')break}
    const snap=f.ai.snapshot()
    assert.ok(Math.max(...trace.map(p=>Math.abs(p[0]-x)))>=1.5,'actual capsule rounded the wall corner')
    assert.ok(Math.hypot(f.root.position.x-destination[0],f.root.position.z-destination[2])<=tuning.arrival+.05)
    assert.equal(snap.navigation.lastFailure,null)
    assert.ok(trace.every(p=>!(p[0]>x-1.31&&p[0]<x+1.31&&p[2]>z+1.69&&p[2]<z+2.71)))
    assert.ok(snap.events.some(e=>e.type==='path'&&e.points.length>=2))
    t.diagnostic(JSON.stringify({destination,position:snap.position,navigation:snap.navigation,motion:snap.motion,traceSamples:trace.length}))
  }finally{f.cleanup()}
})

test('native endpoint replacement, disconnected paths and invalidated legs never authorize direct motion',()=>{
  for(const mode of ['blocked-end','disconnected','replaced-end','dynamic-wall']) {
    const f=fixture()
    try{
      f.root.rotation.y=Math.PI;f.placePlayer(0,6);f.ai.reset();f.tick()
      const {x,z}=f.root.position,destination=f.g.player.pos.clone(),start=f.root.position.clone()
      if(mode==='blocked-end') {
        f.box([x-2,0,z+4],[x+2,3,z+8])
        const nativePath=physics.nav.findPath(start,destination)
        assert.ok(nativePath?.length);assert.ok(nativePath.at(-1).distanceTo(destination)>1,'real native snap exercised')
      }else if(mode==='disconnected') {
        f.box([x-2,0,z+1],[x+2,3,z+1.2]);f.box([x-2,0,z-2],[x+2,3,z-1.8])
        f.box([x-2,0,z-2],[x-1.8,3,z+1.2]);f.box([x+1.8,0,z-2],[x+2,3,z+1.2])
      }
      f.placePlayer(60,40)
      const original=physics.nav.findPath
      if(mode==='replaced-end')physics.nav.findPath=()=>[destination.clone().add(v(6,0,0))]
      try{f.tick(42)}finally{physics.nav.findPath=original}
      if(mode==='dynamic-wall') {
        const now=f.root.position.clone();f.box([x-3,0,now.z+.5],[x+3,3,now.z+1])
        f.tick();assert.equal(f.ai.snapshot().navigation.lastFailure,'path-leg-invalidated')
        assert.ok(f.root.position.distanceTo(now)<1e-8)
      }else {
        assert.ok(f.root.position.distanceTo(start)<1e-8,mode)
        assert.ok(f.ai.snapshot().navigation.failures>0,mode)
        assert.equal(f.ai.snapshot().motion.moving,false)
        assert.equal(f.plays.at(-1).index,INFECTED_CLIPS.Idle.index)
      }
    }finally{f.cleanup()}
  }
})

test('capsule-only obstruction stops movement animation and records stalled planning',()=>{
  const f=fixture()
  try{
    f.root.rotation.y=Math.PI;f.placePlayer(0,6);f.ai.reset();f.tick()
    const {x,z}=f.root.position;f.box([x-5,0,z+2],[x+5,3,z+2.3],{noNav:true});f.placePlayer(60,40)
    f.tick(95);const snap=f.ai.snapshot()
    assert.ok(snap.events.some(e=>e.type==='path-failed'&&e.reason==='capsule-stalled'))
    assert.equal(snap.motion.moving,false);assert.equal(f.plays.at(-1).index,INFECTED_CLIPS.Idle.index)
    assert.ok(f.root.position.z<=z+2-.32+1e-6)
  }finally{f.cleanup()}
})

test('unaware wandering stays local and a displaced pursuer can walk home without reset placement',()=>{
  const f=fixture()
  try{
    f.placePlayer(60,40);f.ai.reset();f.tick(140)
    const home=v(spawn.position.x,spawn.position.y,spawn.position.z)
    assert.ok(f.ai.snapshot().motion.distance>1)
    assert.ok(f.root.position.distanceTo(home)<=tuning.wanderRadius+.05)
    // Caller relocation here represents a previous chase, not AI placement.
    f.root.position.copy(home).x+=7;f.ai.reset()
    assert.equal(f.root.position.x,home.x+7);f.tick(180)
    assert.ok(f.root.position.distanceTo(home)<=tuning.wanderRadius+.05)
    assert.ok(f.ai.snapshot().motion.distance>4)
  }finally{f.cleanup()}
})

test('ordinary contacts at start, lunge waits for real range, both recover without restarting each frame',()=>{
  for(const distance of [1.2,2.6]) {
    const f=fixture()
    try{
      f.placePlayer(0,-distance);f.ai.reset();awaitAttack(f)
      assert.ok(f.voices.some(e=>e.kind==='alert'));assert.ok(f.voices.some(e=>e.kind==='attack'))
      assert.equal(f.ai.snapshot().attack.role,distance<1.5?'Attack':'Lunge Attack')
      assert.equal(f.g.player.health,distance<1.5?85:100);f.tick(10);assert.equal(f.g.player.health,85)
      f.tick(8)
      assert.equal(f.g.player.health,85);f.tick(8);assert.equal(f.g.player.health,85)
      const attackCount=()=>f.plays.filter(e=>[3,6].includes(e.index)).length
      assert.equal(attackCount(),1)
      for(let i=0;i<20 && f.ai.snapshot().attack;i++)f.tick()
      assert.equal(f.ai.snapshot().attack,null);assert.ok(f.ai.snapshot().cooldown>0)
      const recoveryPosition=f.root.position.clone()
      assert.equal(attackCount(),1);f.tick(2);assert.equal(attackCount(),1)
      assert.ok(f.root.position.distanceTo(recoveryPosition)<1e-8,'recovery must not walk into the player')
      assert.equal(f.g.player.health,85)
      for(let i=0;i<10 && attackCount()===1;i++)f.tick()
      assert.equal(attackCount(),2);assert.equal(f.g.player.health,70,'new melee action has its own immediate contact')
      const starts=f.plays.filter(e=>[3,6].includes(e.index)).map(e=>e.time)
      assert.ok(starts[1]-starts[0]<=2.4)
      assert.equal(f.bridgeSnapshot().events.filter(e=>e.type==='attack-contact').length,2)
    }finally{f.cleanup()}
  }
  const f=fixture()
  try{
    f.placePlayer(0,-2.6);f.ai.reset();awaitAttack(f);f.placePlayer(50,30)
    for(let i=0;i<50 && f.ai.snapshot().attack;i++)f.tick()
    assert.equal(f.g.player.health,100);assert.ok(f.ai.snapshot().cooldown>0)
    assert.equal(f.plays.filter(e=>[3,6].includes(e.index)).length,1)
  }finally{f.cleanup()}
})

test('pause, player death and Hit cancel contacts; bridge advances once and owns Hit/Death terminal clips',()=>{
  for(const interruption of ['pause','player-death','hit','death']) {
    const f=fixture()
    try{
      f.placePlayer(0,-2.6);f.ai.reset();awaitAttack(f)
      const starts=f.plays.filter(e=>[3,6].includes(e.index)).length
      if(interruption==='pause'){f.g.game.state='paused';f.g.events.emit('game:state',{state:'paused'})}
      if(interruption==='player-death'){f.g.player.alive=false;f.g.events.emit('player:dead',{})}
      if(interruption==='hit'||interruption==='death')f.target.actor.damage(interruption==='hit'?10:200,v(),v(),'body')
      if(['pause','player-death'].includes(interruption)) {
        assert.equal(f.bridgeSnapshot().attack,null)
        const before=f.counts();f.tick(30);assert.equal(f.counts().updates,before.updates)
        f.g.game.state='playing';f.g.player.alive=true;f.g.events.emit('game:state',{state:'playing'})
      }
      f.placePlayer(50,30);f.tick(14);assert.equal(f.g.player.health,100)
      if(['pause','player-death'].includes(interruption)){
        const resumed=f.bridgeSnapshot()
        assert.ok(resumed.events.some(e=>e.type==='attack-cancelled'))
        assert.equal(resumed.events.filter(e=>e.type==='attack-contact').length,0)
        assert.equal(resumed.attack,null,'resume cannot deliver the cancelled contact')
        assert.equal(f.plays.filter(e=>[3,6].includes(e.index)).length,starts)
      }else assert.equal(f.bridgeSnapshot().attack,null)
      if(interruption==='hit') {
        assert.equal(f.ai.snapshot().state,'STAGGER');assert.equal(f.plays.at(-1).index,INFECTED_CLIPS.Hit.index)
        assert.equal(f.plays.filter(e=>e.index===5).length,1)
        f.tick(28)
        assert.notEqual(f.ai.snapshot().state,'STAGGER');assert.notEqual(f.ai.snapshot().state,'ALERT')
        assert.equal(f.voices.filter(e=>e.kind==='alert').length,1,'Hit must not add another surprise tell')
      }
      if(interruption==='death') {
        f.tick(50);assert.equal(f.ai.snapshot().state,'DEAD');assert.equal(f.plays.filter(e=>e.index===8).length,1)
        assert.equal(f.plays.at(-1).index,8);assert.equal(f.ai.snapshot().motion.moving,false)
      }
      assert.equal(f.counts().updates,f.counts().targetUpdates)
    }finally{f.cleanup()}
  }
})

test('reset synchronizes borrowed actor without placing/healing; dispose only unsubscribes and stops owned behavior',()=>{
  const f=fixture()
  try{
    f.placePlayer(0,-7);f.tick();f.target.actor.hp=63;f.root.rotation.y=.7
    const position=f.root.position.toArray();f.ai.reset()
    assert.deepEqual(f.root.position.toArray(),position);assert.equal(f.root.rotation.y,.7);assert.equal(f.target.actor.hp,63)
    assert.equal(f.ai.snapshot().hp,63);assert.equal(f.ai.snapshot().lastSeen,null)
    f.tick();assert.notEqual(f.ai.snapshot().state,'STAGGER')
    f.ai.dispose();f.ai.dispose();const before=f.counts();f.tick()
    assert.equal(f.counts().targetUpdates,before.targetUpdates)
    assert.equal(f.counts().targetDisposals,0);assert.equal(f.counts().animationDisposals,0);assert.equal(f.counts().voiceDisposals,0)
    for(const name of ['player:step','weapon:fire'])assert.equal(f.listeners.get(name).size,0)
    for(const name of ['game:state','player:dead'])assert.equal(f.listeners.get(name).size,1,'only borrowed native bridge remains')
  }finally{f.cleanup()}
})
