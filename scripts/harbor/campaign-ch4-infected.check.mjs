import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { test } from 'node:test'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { nativeChapter4Fixture } from './campaign-ch4.check.mjs'
import { loadInfectedAsset, INFECTED_SOURCE } from './character-assets.mjs'
import { INFECTED_CLIPS, INFECTED_CLIP_SOURCE_SHA } from './character-clips.mjs'
import { CH2_INFECTED_TUNING } from './campaign-ch2-infected.mjs'
import { createChapter2InfectedDirector } from './campaign-ch2-director.mjs'
import { createChapter4InfectedDirector } from './campaign-ch4-infected.mjs'
import { CH4_INFECTED_SECTION, CH4_INFECTED_SPAWNS } from './campaign-ch4-infected-layout.mjs'

// Real supplied model, native Three/nav/capsules and the unchanged AI/target.
// JPEG decoding/audio hardware are doubles; this is not visual or sound acceptance.
const bytes=await fs.readFile(new URL('../../assets/harbor/infected/丧尸.glb',import.meta.url))
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)
async function fixture({world=false,enabled=true}={}) {
  const native=world?await nativeChapter4Fixture():await nativeFixture(),{g,T}=native
  if(!world)g.physics.build()
  const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),listeners=new Map(),emitted=[],voices=new Set()
  g.events={on(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn)},
    off(name,fn){listeners.get(name)?.delete(fn)},emit(name,data){emitted.push({name,data});for(const fn of listeners.get(name)||[])fn(data)}}
  g.game={state:'playing',run:{time:0}};g.enemies={raycast:()=>null}
  g.player={pos:v(-50,0,-130),eye:v(-50,1.68,-130),vel:v(),alive:true,enabled:true,onGround:true,speed:0,crouching:false,
    health:100,damage(amount){this.health-=amount;if(this.health<=0){this.alive=false;g.events.emit('player:dead',{})}}}
  const asset=await loadInfectedAsset(T,{bytes,decodeImage:async()=>({width:2048,height:2048,close(){}})})
  const bank={createVoice(){
    let active=false,kind=null,disposed=false;const calls=[]
    const voice={play(next,pos,options){active=true;kind=next;calls.push({kind:next,position:pos.toArray(),options});return true},
      update(){},stop(){active=false},snapshot:()=>({active,kind,disposed,calls:[...calls]}),
      dispose(){disposed=true;active=false;voices.delete(voice)}}
    voices.add(voice);return voice
  }}
  const originalMove=g.physics.moveCapsule,originalRaycast=g.enemies.raycast,originalChildren=g.scene.children.length
  const director=createChapter4InfectedDirector(g,{asset,bank,enabled})
  const player=(x,z)=>{g.player.pos.set(x,0,z);g.player.eye.copy(g.player.pos).y+=1.68}
  const tick=(count=1,dt=.05)=>{for(let i=0;i<count;i++){g.game.run.time+=dt;director.update(dt)}}
  const put=(member,x,z,yaw=0)=>{member.instance.root.position.set(x,0,z);member.instance.root.rotation.y=yaw;member.ai.reset()}
  function cleanup() {
    director.dispose();director.dispose()
    assert.equal(g.physics.moveCapsule,originalMove);assert.equal(g.enemies.raycast,originalRaycast)
    assert.equal(g.scene.children.length,originalChildren);assert.equal(voices.size,0)
    for(const set of listeners.values())assert.equal(set.size,0)
    assert.equal(asset.snapshot().liveInstances,0);asset.dispose();assert.equal(asset.snapshot().released,true)
    native.dispose?.()
  }
  return {g,T,v,asset,bank,director,voices,emitted,listeners,player,tick,put,cleanup}
}

test('CH4 creates exactly five real ordinary actors with the accepted source, clips and independent state',async()=>{
  const f=await fixture()
  try{
    const members=f.director.members,snapshot=f.director.snapshot()
    assert.equal(INFECTED_SOURCE.sha256,INFECTED_CLIP_SOURCE_SHA)
    assert.equal(f.asset.snapshot().source.verifiedSHA256,INFECTED_CLIP_SOURCE_SHA)
    assert.equal(snapshot.logicalActorCount,5);assert.equal(snapshot.sectionId,CH4_INFECTED_SECTION.id)
    assert.equal(snapshot.navigation,null);assert.equal(snapshot.sleepCount,0)
    assert.deepEqual(members.map(m=>m.spawn),CH4_INFECTED_SPAWNS)
    for(const member of members){
      assert.ok(member.instance.mesh instanceof f.T.SkinnedMesh)
      assert.equal(member.instance.skeleton.bones.length,65);assert.equal(member.target.actor.type,'infected')
      assert.equal(member.target.actor.hp,200);assert.equal(member.target.actor.id,member.spawn.id)
      assert.equal(member.ai.snapshot().mode,'ordinary');assert.equal(member.ai.snapshot().silent,false)
      assert.equal(member.animation.snapshot().index,INFECTED_CLIPS.Idle.index)
      assert.deepEqual(Array.from(member.target.actor.pos.toArray()),Object.values(member.spawn.position))
    }
    for(const key of ['instance','animation','voice','target','ai'])assert.equal(new Set(members.map(m=>m[key])).size,5)
    assert.equal(new Set(members.map(m=>m.instance.skeleton)).size,5)
    assert.equal(new Set(members.map(m=>m.instance.mesh.geometry)).size,1)
    f.tick(1)
    assert.ok(members.every(m=>m.animation.updateCount()===1),'one original Mixer tick per actor')
    assert.equal(f.director.snapshot().sleepCount,0,'far actors do not sleep in this five-actor trial')
  }finally{f.cleanup()}
})

test('CH4 ordinary patrols move without acquiring a hidden far player and use the original voice roles',async()=>{
  const f=await fixture(),random=Math.random
  try{
    Math.random=()=>.5 // A reproducible westward patrol candidate, not altered AI.
    f.tick(50)
    for(const m of f.director.members){
      const ai=m.ai.snapshot()
      assert.equal(ai.state,'WANDER');assert.equal(ai.lastSeen,null);assert.equal(ai.lastHeard,null)
      assert.ok(ai.motion.distance>.5);assert.ok(distance(m.target.actor.pos,m.spawn.position)<=CH2_INFECTED_TUNING.wanderRadius)
      assert.ok(m.voice.snapshot().calls.some(c=>c.kind==='idle'))
      assert.ok(m.voice.snapshot().calls.every(c=>['idle','alert','attack','chase'].includes(c.kind)))
    }
  }finally{Math.random=random;f.cleanup()}
})

test('assembled CH4: native chase, moving Hit, one-shot death and corpse persistence use the unchanged controller',async t=>{
  const f=await fixture({world:true})
  try{
    const a=f.director.members[0],start=a.target.actor.pos.clone()
    f.player(-65,-89)
    f.g.events.emit('weapon:fire',{weapon:'pistol',origin:f.g.player.eye.clone(),dir:f.v(1,0,0)})
    for(let i=0;i<80;i++){f.tick();const ai=a.ai.snapshot();if(ai.state==='CHASE'&&ai.motion.moving)break}
    const chased=a.ai.snapshot(),speed=chased.pursuit?.nominalSpeed
    assert.equal(chased.state,'CHASE');assert.equal(speed,6.4);assert.ok(distance(start,a.target.actor.pos)>.1)
    assert.ok(chased.navigation.attempts>0);assert.equal(chased.navigation.strategy,'native-local')
    assert.ok(a.voice.snapshot().calls.some(c=>c.kind==='alert'));assert.ok(a.voice.snapshot().calls.some(c=>c.kind==='chase'))
    for(let i=0;i<2;i++){
      const before=a.target.actor.pos.clone(),mixer=a.animation.snapshot().mixerTime
      a.target.actor.damage(1,a.target.actor.pos,f.v(1,0,0),'body');f.tick()
      assert.equal(a.ai.snapshot().state,'STAGGER');assert.equal(a.animation.snapshot().index,INFECTED_CLIPS.Hit.index)
      assert.ok(Math.abs(distance(before,a.target.actor.pos)-speed*.9*.05)<.001)
      assert.ok(Math.abs(a.animation.snapshot().mixerTime-mixer-.05)<1e-8)
      assert.equal(f.g.physics.nav.isWalkable(a.target.actor.pos.x,a.target.actor.pos.z),true)
    }
    const deathPosition=a.target.actor.pos.clone()
    a.target.actor.damage(198,deathPosition,f.v(1,0,0),'body');f.tick(45)
    assert.equal(a.ai.snapshot().state,'DEAD');assert.equal(distance(deathPosition,a.target.actor.pos),0)
    assert.equal(a.animation.snapshot().index,INFECTED_CLIPS.Death.index);assert.equal(a.animation.finished(),true)
    assert.equal(a.target.snapshot().attack,null);assert.equal(a.voice.snapshot().active,false)
    assert.equal(f.emitted.filter(e=>e.name==='enemy:killed'&&e.data.enemy===a.target.actor).length,1)
    f.director.setEnabled(false);f.director.setEnabled(true);f.tick()
    assert.equal(a.target.actor.alive,false);assert.equal(f.director.members.length,5)
    t.diagnostic(JSON.stringify({spawn:a.spawn.id,chase:chased.position,speed,hitSpeed:speed*.9,death:deathPosition.toArray()}))
  }finally{f.cleanup()}
})

test('five actors preserve native peer contact gates and player capsule blocking; deaths release passage',async()=>{
  const f=await fixture()
  try{
    const [a,b,...others]=f.director.members
    for(const m of others)m.target.actor.damage(200,m.target.actor.pos,f.v(1,0,0),'body')
    f.put(a,-70,-100);f.put(b,-68.6,-100);f.player(-67.4,-100)
    const spec={clip:INFECTED_CLIPS['Lunge Attack'].index,duration:INFECTED_CLIPS['Lunge Attack'].duration,
      contactStart:0,contactEnd:.9,damage:15,range:1.65,lungeSpeed:2.4}
    assert.equal(a.target.beginAttack(spec),false,'live peer blocks an attack')
    f.put(b,-68.6,-97)
    assert.equal(a.target.beginAttack(spec),true);a.target.update(.8)
    assert.equal(f.g.player.health,85);a.target.update(.1);assert.equal(f.g.player.health,85)
    a.target.cancelAttack();f.put(a,-70,-100);f.player(-72,-100)
    f.g.physics.moveCapsule(f.g.player.pos,f.v(8,0,0),.5,.32,1.8,true)
    assert.ok(f.g.player.pos.x<=-70.64+.001&&f.g.player.pos.x>=-70.65)
    a.target.actor.damage(200,a.target.actor.pos,f.v(1,0,0),'body')
    f.g.physics.moveCapsule(f.g.player.pos,f.v(4,0,0),.5,.32,1.8,true)
    assert.ok(f.g.player.pos.x>-70)
  }finally{f.cleanup()}
})

test('reset reuses the same five objects and capture restores deaths without refill, extra kills or stale attacks',async()=>{
  const f=await fixture()
  try{
    const members=[...f.director.members],actors=members.map(m=>m.target.actor),instances=members.map(m=>m.instance)
    members[0].target.actor.damage(200,members[0].target.actor.pos,f.v(1,0,0),'body')
    members[1].target.actor.damage(34,members[1].target.actor.pos,f.v(1,0,0),'body');f.tick()
    const saved=JSON.parse(JSON.stringify(f.director.capture())),kills=f.emitted.filter(e=>e.name==='enemy:killed').length
    f.director.reset()
    for(const [index,m]of f.director.members.entries()){
      assert.equal(m,members[index]);assert.equal(m.target.actor,actors[index]);assert.equal(m.instance,instances[index])
      assert.equal(m.target.actor.hp,200);assert.equal(m.target.actor.alive,true)
      assert.deepEqual(Array.from(m.target.actor.pos.toArray()),[m.spawn.position.x,0,m.spawn.position.z])
    }
    f.director.restore(saved)
    assert.equal(members[0].target.actor.alive,false);assert.equal(members[1].target.actor.hp,166)
    assert.equal(f.emitted.filter(e=>e.name==='enemy:killed').length,kills)
    assert.equal(f.director.snapshot().logicalActorCount,5);assert.equal(f.asset.snapshot().liveInstances,5)
    const malformed=structuredClone(saved);malformed.members[1].id=malformed.members[0].id
    assert.throws(()=>f.director.restore(malformed),/Invalid CH2 director capture/)
    assert.equal(members[1].target.actor.hp,166)
    f.director.setEnabled(false);f.tick(20)
    assert.ok(members.every(m=>!m.instance.root.visible&&!m.target.actor.active&&!m.voice.snapshot().active))
    f.director.reset();f.director.setEnabled(true)
    assert.equal(f.director.snapshot().alive,5);assert.equal(f.asset.snapshot().liveInstances,5)
  }finally{f.cleanup()}
})

test('fixed deployment rejects missing/duplicate actors without changing original CH2 boundaries',async()=>{
  const f=await fixture()
  try{
    f.director.dispose()
    const options={asset:f.asset,bank:f.bank,sectionId:CH4_INFECTED_SECTION.id}
    assert.throws(()=>createChapter2InfectedDirector(f.g,options),/Invalid twelve-actor CH2 section/)
    assert.throws(()=>createChapter2InfectedDirector(f.g,{...options,deployment:{section:CH4_INFECTED_SECTION,spawns:CH4_INFECTED_SPAWNS.slice(1)}}),/complete fixed deployment/)
    assert.throws(()=>createChapter2InfectedDirector(f.g,{...options,deployment:{section:CH4_INFECTED_SECTION,spawns:Array(5).fill(CH4_INFECTED_SPAWNS[0])}}),/five unique IDs/)
    assert.equal(f.asset.snapshot().liveInstances,0);assert.equal(f.voices.size,0)
  }finally{f.cleanup()}
})
