import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import fs from 'node:fs/promises'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { loadInfectedAsset } from './character-assets.mjs'
import { createCharacterAnimation } from './character-animation.mjs'
import { installCharacterTarget } from './character-native-target.mjs'
import { INFECTED_CLIPS } from './character-clips.mjs'
import { createChapter5Infected } from './campaign-ch5-infected.mjs'

const json=value=>JSON.parse(JSON.stringify(value))
const native=await nativeFixture(),{T}=native,v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z)
const bytes=await fs.readFile(new URL('../../assets/harbor/infected/丧尸.glb',import.meta.url))
const asset=await loadInfectedAsset(T,{bytes,decodeImage:async()=>({width:2048,height:2048,close(){}})})
after(()=>{assert.equal(asset.snapshot().liveInstances,0);asset.dispose()})
function fixture(){
  const listeners=new Map(),events=[],voices=new Set(),registered=new Set(),selected=new Map(),observations=new Map()
  for(const box of [...native.g.physics.boxes])native.g.physics.removeBox(box)
  native.g.physics.build()
  const g={...native.g,scene:new T.Scene(),game:{state:'playing',run:{time:0}},enemies:{raycast:()=>null},
    player:{pos:v(20,0,20),eye:v(20,1.68,20),alive:true,enabled:true,onGround:true,crouching:false,speed:0,vel:v(),health:100,
      damage(amount){this.health-=amount}},
    events:{on(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn)},
      off(name,fn){listeners.get(name)?.delete(fn)},
      emit(name,data){events.push({name,data});for(const fn of listeners.get(name)||[])fn(data)}},
  }
  const raycast=g.enemies.raycast
  const bank={createVoice(){
    let active=false,disposed=false,lastPosition=null,stops=0
    const voice={play(){active=true},update(point){lastPosition=point.clone()},stop(){active=false;stops++},
      snapshot:()=>({active,disposed,position:lastPosition?.toArray(),stops}),
      dispose(){if(disposed)return;disposed=true;active=false;voices.delete(voice)}}
    voices.add(voice);return voice
  }}
  const combat={register(record){registered.add(record);return()=>registered.delete(record)},
    targetFor:actor=>selected.get(actor)??null,observationFor:actor=>observations.get(actor)??null,
    move:(actor,...args)=>g.physics.moveCapsule(...args)}
  const navigation={findPath(from,to){const path=g.physics.nav.findPath(from,to);return path?{path,kind:'native-check'}:null}}
  const create=(id,position=v(),yaw=0)=>createChapter5Infected(g,{id,infected:{asset,bank},combat,navigation,position,yaw})
  const select=(slot,victim,observation=null)=>{selected.set(slot.actor,victim);observations.set(slot.actor,observation)}
  const tick=(slot,count=1,dt=.05)=>{for(let i=0;i<count;i++){g.game.run.time+=dt;slot.update(dt)}}
  function soldier(id,position=v(0,0,-1.2)){
    // A real character damage/animation bridge at soldier HP. This isolates
    // melee semantics without loading/claiming the soldier's visual acceptance.
    const instance=asset.createInstance(),animation=createCharacterAnimation(T,instance,asset)
    instance.root.position.copy(position)
    const target=installCharacterTarget(g,instance,{animation,clipFor:role=>INFECTED_CLIPS[role]?.index})
    target.actor.id=id;target.actor.type='clearance';target.restoreState({hp:100,alive:true})
    const view={id,pos:target.actor.pos,get eye(){return target.actor.pos.clone().add(v(0,1.68,0))},
      get alive(){return target.actor.alive},get enabled(){return target.actor.active},get health(){return target.actor.hp},
      captureCampaignCollider:()=>({position:target.actor.pos,radius:.32,height:1.8}),
      damage:(amount,source)=>target.actor.damage(amount,target.actor.pos.clone(),target.actor.pos.clone().sub(source).normalize(),'body')}
    return {view,target,instance,animation,dispose(){target.dispose();animation.dispose();instance.dispose()}}
  }
  const cleanup=()=>{assert.equal(registered.size,0);assert.equal(voices.size,0);assert.equal(g.enemies.raycast,raycast)
    for(const set of listeners.values())assert.equal(set.size,0)}
  return {g,bank,combat,navigation,create,select,tick,soldier,registered,voices,events,cleanup}
}

test('optional opponent uses real victim HP/death, immediate contact once and serializable attack snapshots',()=>{
  const f=fixture(),victim=f.soldier('soldier'),instance=asset.createInstance(),animation=createCharacterAnimation(T,instance,asset)
  let chosen=victim.view
  const target=installCharacterTarget(f.g,instance,{animation,opponent:()=>chosen,clipFor:role=>INFECTED_CLIPS[role]?.index})
  const spec={clip:3,duration:1.958,contactStart:0,contactEnd:.9,damage:15,range:1.65}
  try{
    assert.equal(target.beginAttack(spec),true);assert.equal(victim.target.actor.hp,85);assert.equal(f.g.player.health,100)
    const saved=JSON.parse(JSON.stringify(target.snapshot()))
    assert.deepEqual(Object.keys(saved.attack).sort(),['clip','contactEnd','contactStart','damage','duration','elapsed','hit','lungeSpeed','range'].sort())
    target.update(.8);assert.equal(victim.target.actor.hp,85)
    for(let i=0;i<6;i++){target.cancelAttack();assert.equal(target.beginAttack(spec),true)}
    assert.equal(victim.target.actor.hp,0);assert.equal(victim.target.actor.alive,false)
    assert.equal(victim.animation.snapshot().index,INFECTED_CLIPS.Death.index)
    assert.equal(f.events.filter(e=>e.name==='enemy:killed'&&e.data.enemy===victim.target.actor).length,1)
    target.update(.1);assert.equal(target.beginAttack(spec),false)
  }finally{target.dispose();animation.dispose();instance.dispose();victim.dispose();f.cleanup()}
})

test('opponent is frozen per swing; windows, live distance, direction, height, steel, death and pause remain authoritative',()=>{
  const f=fixture(),a=f.soldier('a'),b=f.soldier('b',v(0,0,-1.3)),instance=asset.createInstance(),animation=createCharacterAnimation(T,instance,asset)
  let chosen=a.view
  const target=installCharacterTarget(f.g,instance,{animation,opponent:()=>chosen})
  const spec={clip:3,duration:1.2,contactStart:.3,contactEnd:.5}
  try{
    target.beginAttack(spec);chosen=b.view;target.update(.35)
    assert.equal(a.target.actor.hp,85);assert.equal(b.target.actor.hp,100,'Provider changes cannot transfer an old swing')
    target.cancelAttack();assert.equal(target.beginAttack(spec),true)
    b.instance.root.position.set(0,0,1.3);target.update(.35);assert.equal(b.target.actor.hp,100,'Behind the frozen swing direction')
    target.cancelAttack();b.instance.root.position.set(0,1,-1.3);assert.equal(target.beginAttack(spec),false)
    b.instance.root.position.set(0,0,-2);assert.equal(target.beginAttack(spec),false)
    b.instance.root.position.set(0,0,-1.3);target.beginAttack(spec)
    const wall=f.g.physics.addBox(v(-2,0,-.8),v(2,3,-.7),{surface:'metal'})
    target.update(.4);assert.equal(b.target.actor.hp,100)
    target.update(.2);f.g.physics.removeBox(wall);target.update(.2);assert.equal(b.target.actor.hp,100,'Expired contact window')
    target.cancelAttack();target.beginAttack(spec);b.target.actor.damage(100,v(),v(),'body');target.update(.4)
    assert.equal(b.target.actor.hp,0);assert.equal(target.snapshot().attack,null)
    chosen=a.view;target.beginAttack(spec);f.g.game.state='paused';f.g.events.emit('game:state',{state:'paused'})
    f.g.game.state='playing';target.update(.4);assert.equal(a.target.actor.hp,85)
    target.beginAttack(spec);target.actor.damage(200,v(),v(),'body');target.update(.4);assert.equal(a.target.actor.hp,85)
  }finally{target.dispose();animation.dispose();instance.dispose();a.dispose();b.dispose();f.cleanup()}
})

test('CH5 ordinary AI sees and attacks soldiers, keeps real player audio listener and cancels target switches',()=>{
  const f=fixture(),slot=f.create('infected-1'),a=f.soldier('soldier-a'),b=f.soldier('soldier-b',v(8,0,0))
  try{
    assert.equal(slot.actor.active,false);assert.equal(slot.actor.alive,false);assert.equal(slot.instance.root.visible,false)
    f.select(slot,a.view);slot.respawn(v(),0)
    for(let i=0;i<30&&a.target.actor.hp===100;i++)f.tick(slot)
    assert.equal(a.target.actor.hp,85);assert.equal(slot.snapshot().ai.state,'ATTACK');assert.equal(f.g.player.health,100)
    assert.ok(slot.voice.snapshot().position)
    f.select(slot,b.view);f.tick(slot)
    assert.equal(slot.snapshot().target.attack,null);assert.equal(slot.snapshot().targetId,'soldier-b')
    assert.equal(slot.snapshot().ai.lastSeen,null);assert.equal(slot.snapshot().ai.lastHeard,null)
    assert.equal(b.target.actor.hp,100);assert.equal(a.target.actor.hp,85)
    slot.retire();f.tick(slot,50);assert.equal(slot.instance.root.visible,false);assert.equal(slot.voice.snapshot().active,false)
    assert.equal(slot.actor.active,false);assert.equal(a.target.actor.hp,85)
  }finally{slot.dispose();a.dispose();b.dispose();f.cleanup()}
})

test('CH5 receives only fresh detached observations and never follows a hidden target current position',()=>{
  const f=fixture(),slot=f.create('infected-memory'),victim=f.soldier('soldier',v(0,0,-8))
  try{
    slot.respawn(v(),0);f.select(slot,victim.view);f.tick(slot,16)
    const known=slot.snapshot().ai.lastSeen.position
    victim.instance.root.position.set(8,0,8);f.tick(slot)
    assert.equal(slot.snapshot().ai.visible,false);assert.deepEqual(slot.snapshot().ai.goal,known)
    const observation={id:victim.view.id,visible:false,position:v(3,0,3),time:1,kind:'gun'}
    f.select(slot,victim.view,observation);f.tick(slot)
    assert.deepEqual(json(slot.snapshot().ai.lastHeard.position),[3,0,3])
    const recorded=slot.snapshot().ai.lastHeard.time
    observation.position.set(20,0,20);victim.instance.root.position.set(21,0,21);f.tick(slot,5)
    assert.deepEqual(json(slot.snapshot().ai.lastHeard.position),[3,0,3]);assert.equal(slot.snapshot().ai.lastHeard.time,recorded)
    f.select(slot,null);f.tick(slot)
    assert.equal(slot.snapshot().ai.lastHeard,null);assert.equal(slot.snapshot().ai.lastSeen,null)
    assert.equal(slot.snapshot().ai.attack,null)
  }finally{slot.dispose();victim.dispose();f.cleanup()}
})

test('CH5 infected never discovers or contacts a soldier through original steel LOS',()=>{
  const f=fixture(),slot=f.create('infected-wall'),victim=f.soldier('soldier')
  try{
    f.g.physics.addBox(v(-3,0,-.8),v(3,3,-.7),{surface:'metal'});f.g.physics.build()
    slot.respawn(v(),0);f.select(slot,victim.view);f.tick(slot,10)
    assert.equal(slot.snapshot().ai.visible,false);assert.equal(slot.snapshot().ai.lastSeen,null)
    assert.equal(slot.snapshot().ai.attack,null);assert.equal(victim.target.actor.hp,100)
  }finally{slot.dispose();victim.dispose();f.cleanup()}
})

test('four CH5 slots reuse independent skeletons, mixers and voices through deaths, five-second waits and respawns',()=>{
  const f=fixture(),slots=Array.from({length:4},(_,i)=>f.create(`infected-${i}`,v(i*3,0,0)))
  try{
    const skeletons=slots.map(s=>s.instance.skeleton),animations=slots.map(s=>s.animation),voices=slots.map(s=>s.voice)
    assert.equal(new Set(skeletons).size,4);assert.equal(new Set(animations).size,4);assert.equal(new Set(voices).size,4)
    assert.equal(new Set(slots.map(s=>s.instance.mesh.geometry)).size,1)
    assert.equal(new Set(slots.map(s=>s.instance.mesh.material)).size,1)
    assert.ok(skeletons.every(s=>s.bones.length===65));assert.equal(asset.clips.length,11)
    assert.equal(asset.snapshot().liveInstances,4);assert.equal(f.registered.size,4)
    for(let round=0;round<3;round++)for(const [i,slot]of slots.entries()){
      slot.respawn(v(i*3,0,0),0);assert.equal(slot.actor.hp,200);assert.equal(slot.actor.active,true)
      slot.actor.damage(200,slot.actor.pos.clone(),v(0,0,-1),'body');f.tick(slot,100)
      assert.equal(slot.animation.snapshot().index,INFECTED_CLIPS.Death.index);assert.equal(slot.animation.finished(),true)
      assert.equal(slot.voice.snapshot().active,false)
      slot.retire();slot.respawn(v(i*3,0,2),Math.PI)
      assert.equal(slot.actor.hp,200);assert.deepEqual(json(slot.actor.pos.toArray()),[i*3,0,2]);assert.equal(slot.snapshot().targetId,null)
      assert.equal(slot.animation.snapshot().index,INFECTED_CLIPS.Idle.index)
      assert.equal(slot.instance.skeleton,skeletons[i]);assert.equal(slot.animation,animations[i]);assert.equal(slot.voice,voices[i])
      assert.equal(asset.snapshot().liveInstances,4);assert.equal(f.voices.size,4)
    }
    f.g.game.state='paused';f.g.events.emit('game:state',{state:'paused'})
    const before=slots.map(s=>s.animation.snapshot().time);slots.forEach(s=>s.update(20))
    assert.deepEqual(slots.map(s=>s.animation.snapshot().time),before);assert.ok(slots.every(s=>!s.voice.snapshot().active))
  }finally{slots.forEach(s=>{s.dispose();s.dispose()});f.cleanup()}
})
