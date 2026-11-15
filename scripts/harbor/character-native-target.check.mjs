import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { parse } from '@babel/parser'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { installCharacterTarget } from './character-native-target.mjs'
import { loadInfectedAsset } from './character-assets.mjs'
import { createCharacterAnimation } from './character-animation.mjs'

const native=await nativeFixture(),T=native.T
const html=await fs.readFile(new URL('../../几猫国产3A大作_V1-fable5.2.html',import.meta.url),'utf8')
const source=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'))
const body=parse(source).program.body[0].expression.callee.body.body
const combatNode=body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='zv')
const nativeCombat=Function(`return (${source.slice(combatNode.start,combatNode.end)})`)()
function fixture({canAttack=()=>true}={}) {
  const listeners=new Map(),records=[],plays=[]
  const events={on(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn)},off(name,fn){listeners.get(name)?.delete(fn)},emit(name,data){records.push({name,data});for(const fn of listeners.get(name)||[])fn(data)}}
  const physics=native.g.physics
  for(const b of [...physics.boxes])physics.removeBox(b)
  physics.build()
  let nativeHit=null
  const g={THREE:T,physics,events,game:{state:'playing',run:{time:0}},player:{alive:true,pos:new T.Vector3(0,0,1),health:100,damage(amount){this.health-=amount}},enemies:{raycast(){return nativeHit}}}
  g.combat=nativeCombat(g)
  const geometry=new T.BoxGeometry(.6,1.8,.4);geometry.translate(0,.9,0)
  const count=geometry.attributes.position.count,indices=new Uint16Array(count*4),weights=new Float32Array(count*4)
  for(let i=0;i<count;i++)weights[i*4]=1
  geometry.setAttribute('skinIndex',new T.BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.BufferAttribute(weights,4))
  const root=new T.Group(),mesh=new T.SkinnedMesh(geometry,new T.MeshBasicMaterial()),bone=new T.Bone()
  mesh.add(bone);root.add(mesh);root.updateMatrixWorld(true)
  const skeleton=new T.Skeleton([bone]);mesh.bind(skeleton)
  const instance={root,mesh,skeleton},animation={playClip(index,options){plays.push({index,options})},update(){},stop(){}}
  const target=installCharacterTarget(g,instance,{animation,canAttack,clipFor:role=>({Hit:5,Death:8})[role]})
  return {g,target,instance,records,plays,setNativeHit(hit){nativeHit=hit},cleanup(){target.dispose();geometry.dispose();mesh.material.dispose();skeleton.dispose()}}
}
test('native weapon damage hits the current skinned surface, respects walls and nearest native targets',()=>{
  const f=fixture(),{g,target,instance}=f,origin=new T.Vector3(0,1,4),dir=new T.Vector3(0,0,-1)
  try{
    assert.equal(target.actor.hp,200)
    assert.equal(g.combat.playerShot(origin,dir,{damage:26}).enemy,target.actor)
    assert.equal(target.actor.hp,174)
    const nearer={dist:1,point:new T.Vector3(0,1,3),enemy:{alive:true,damage(){return false}},part:'body'}
    f.setNativeHit(nearer);assert.equal(g.combat.playerShot(origin,dir,{damage:34}).enemy,nearer.enemy)
    assert.equal(target.actor.hp,174);f.setNativeHit(null)
    const wall=g.physics.addBox(new T.Vector3(-1,0,1),new T.Vector3(1,2,1.1),{surface:'metal'})
    g.physics.build()
    assert.equal(g.combat.playerShot(origin,dir,{damage:34}).enemy,null)
    assert.equal(target.actor.hp,174)
    g.physics.removeBox(wall);g.physics.build()
    // Bone motion moves the hit surface; a cached bind-pose bound must not win.
    instance.skeleton.bones[0].position.x=3
    assert.equal(g.combat.playerShot(origin,dir,{damage:34}),null)
    instance.skeleton.bones[0].position.x=0
    assert.equal(g.combat.playerShot(origin,dir,{damage:34}).enemy,target.actor)
    assert.equal(target.actor.hp,140)
    assert.equal(g.combat.playerShot(origin,dir,{damage:60}).killed,false)
    assert.equal(target.actor.hp,80)
    for(const damage of [34,34])assert.equal(g.combat.playerShot(origin,dir,{damage}).killed,false)
    assert.equal(target.actor.hp,12)
    assert.equal(g.combat.playerShot(origin,dir,{damage:26}).killed,true)
    assert.equal(target.actor.alive,false);assert.equal(g.combat.stats.kills,1)
    assert.equal(g.combat.playerShot(origin,dir,{damage:100}),null)
    target.update(.1);target.update(.1)
    assert.equal(f.plays.filter(p=>p.index===8).length,1)
    assert.equal(f.records.filter(e=>e.name==='enemy:killed').length,1)
    target.reset();assert.equal(target.actor.hp,200);assert.equal(target.actor.alive,true);assert.equal(target.actor.active,true)
  }finally{f.cleanup()}
})
test('single contact requires the live window, facing and native LOS; pause/death cancel pending attacks',()=>{
  const f=fixture(),{g,target}=f,spec={clip:4,duration:1,contactStart:.3,contactEnd:.5}
  try{
    target.beginAttack(spec);target.update(.2);assert.equal(g.player.health,100)
    target.update(.15);assert.equal(g.player.health,85)
    target.update(.1);target.update(.1);assert.equal(g.player.health,85)
    target.update(.5)
    assert.ok(target.beginAttack(spec))
    const wall=g.physics.addBox(new T.Vector3(-1,0,.4),new T.Vector3(1,2,.5),{surface:'metal'});g.physics.build()
    target.update(.4);assert.equal(g.player.health,85)
    target.update(.2);g.physics.removeBox(wall);g.physics.build();target.update(.2);assert.equal(g.player.health,85)
    target.cancelAttack();target.beginAttack(spec)
    g.game.state='paused';g.events.emit('game:state',{state:'paused'});g.game.state='playing';target.update(.4)
    assert.equal(g.player.health,85)
    target.beginAttack(spec);target.actor.damage(200,new T.Vector3(),new T.Vector3(),'body');target.update(.4)
    assert.equal(g.player.health,85)
  }finally{f.cleanup()}
})
test('lunge uses native capsule collision and cleanup restores the original raycast',()=>{
  const f=fixture(),{g,target}=f
  try{
    g.player.pos.z=2.6
    assert.ok(target.beginAttack({clip:6,duration:1,contactStart:.3,contactEnd:.8,lungeSpeed:5}))
    g.physics.addBox(new T.Vector3(-2,0,.8),new T.Vector3(2,3,1),{surface:'metal'});g.physics.build()
    for(let i=0;i<25;i++)target.update(.04)
    assert.ok(target.actor.pos.z<=.48+1e-6);assert.equal(g.player.health,100)
    const wrapped=g.enemies.raycast;target.dispose();assert.notEqual(g.enemies.raycast,wrapped)
    assert.equal(g.enemies.raycast(new T.Vector3(),new T.Vector3(0,0,-1)),null)
  }finally{f.cleanup()}
})

test('attack start rejects distance, height and steel before playing an action',()=>{
  const f=fixture(),spec={clip:6,duration:1.958,contactStart:.65,contactEnd:.9,lungeSpeed:2.4}
  try{
    f.g.player.pos.set(0,0,2.81);assert.equal(f.target.beginAttack(spec),false)
    f.g.player.pos.set(0,1,1);assert.equal(f.target.beginAttack(spec),false)
    f.g.player.pos.set(0,0,1)
    f.g.physics.addBox(new T.Vector3(-1,0,.4),new T.Vector3(1,3,.5));f.g.physics.build()
    assert.equal(f.target.beginAttack(spec),false)
    assert.equal(f.target.snapshot().attack,null);assert.equal(f.plays.length,0)
    assert.equal(f.g.player.health,100)
  }finally{f.cleanup()}
})

test('current supplied GLB connects to the native weapon bridge and keeps its one-shot terminal pose',async()=>{
  const f=fixture();f.target.dispose()
  const bytes=await fs.readFile(new URL('../../assets/harbor/infected/丧尸.glb',import.meta.url))
  const asset=await loadInfectedAsset(T,{bytes,decodeImage:async()=>({width:2048,height:2048,close(){}})})
  const instance=asset.createInstance(),animation=createCharacterAnimation(T,instance,asset)
  // Clip numbers exercise the adapter contract only; semantics remain manual.
  const target=installCharacterTarget(f.g,instance,{animation,clipFor:()=>8})
  try{
    animation.playClip(0,{fade:0});target.update(.2)
    const mesh=instance.mesh,ids=mesh.geometry.index
    const points=[0,1,2].map(i=>mesh.getVertexPosition(ids.getX(i),new T.Vector3()).applyMatrix4(mesh.matrixWorld))
    const center=points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1/3)
    const normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize()
    const origin=center.clone().addScaledVector(normal,2),direction=normal.clone().negate()
    const hit=f.g.combat.playerShot(origin,direction,{damage:200,range:3})
    assert.equal(hit?.enemy,target.actor);assert.equal(hit.killed,true)
    target.update(asset.clips[8].duration+.1)
    assert.equal(animation.snapshot().finished,true)
    const time=animation.snapshot().time;target.update(.1);assert.equal(animation.snapshot().time,time)
    assert.equal(f.g.enemies.raycast(origin,direction,3),null)
    assert.equal(asset.snapshot().liveInstances,1)
  }finally{target.dispose();animation.dispose();instance.dispose();asset.dispose();f.cleanup()}
})

test('twelve targets use one registry: nearest native/character/wall wins once, disabled/dead skip, arbitrary release restores original',()=>{
  const f=fixture(),{g}=f,extra=[]
  const origin=new T.Vector3(0,1,4),dir=new T.Vector3(0,0,-1)
  // Actual native combat and physics; simple skinned boxes isolate ray ordering.
  let worldRays=0
  const worldRaycast=g.physics.raycast
  g.physics.raycast=function(...args){worldRays++;return worldRaycast.apply(this,args)}
  try {
    for(let i=1;i<12;i++){
      const root=new T.Group(),bone=new T.Bone(),mesh=new T.SkinnedMesh(f.instance.mesh.geometry,f.instance.mesh.material)
      mesh.add(bone);root.add(mesh);root.position.z=-i*2;root.updateMatrixWorld(true)
      const skeleton=new T.Skeleton([bone]);mesh.bind(skeleton)
      const instance={root,mesh,skeleton},animation={playClip(){},stop(){},update(){}}
      const target=installCharacterTarget(g,instance,{animation});target.actor.id=`ray-${i}`
      extra.push({target,skeleton})
    }
    const registry=g.enemies.raycast
    assert.equal(g.combat.playerShot(origin,dir,{damage:26}).enemy,f.target.actor)
    assert.equal(f.target.actor.hp,174)
    assert.deepEqual(extra.map(e=>e.target.actor.hp),Array(11).fill(200))
    assert.equal(worldRays,2,'one native combat world ray + one registry world ray, independent of twelve targets')
    assert.deepEqual(f.target.snapshot().raycast,{targets:12,queries:1,wallRays:1,meshRays:12})
    const nearer={dist:1,point:new T.Vector3(0,1,3),enemy:{alive:true,damage(){return false}},part:'body'}
    f.setNativeHit(nearer);assert.equal(g.combat.playerShot(origin,dir,{damage:34}).enemy,nearer.enemy);f.setNativeHit(null)
    f.target.setEnabled(false)
    assert.equal(g.combat.playerShot(origin,dir,{damage:200}).enemy,extra[0].target.actor)
    assert.equal(extra[0].target.actor.alive,false)
    assert.equal(g.combat.playerShot(origin,dir,{damage:26}).enemy,extra[1].target.actor)
    assert.equal(extra[1].target.actor.hp,174)
    const wall=g.physics.addBox(new T.Vector3(-1,0,-2.8),new T.Vector3(1,2,-2.7),{surface:'metal'});g.physics.build()
    assert.equal(g.combat.playerShot(origin,dir,{damage:26}).enemy,null)
    assert.equal(g.enemies.raycast(origin,dir,30),null)
    g.physics.removeBox(wall);g.physics.build()
    // Release first, middle, last, then the remaining targets. No wrapper chain.
    f.target.dispose();extra[2].target.dispose();extra[4].target.dispose()
    assert.equal(g.enemies.raycast,registry)
    assert.equal(g.combat.playerShot(origin,dir,{damage:26}).enemy,extra[1].target.actor)
    for(const index of [10,0,6,1,9,3,8,7,5])extra[index].target.dispose()
    assert.notEqual(g.enemies.raycast,registry)
    f.setNativeHit(nearer);assert.equal(g.enemies.raycast(origin,dir,30),nearer)
    // Creating again after complete release must wrap the actual native function.
    const next=installCharacterTarget(g,f.instance,{animation:{playClip(){},stop(){},update(){}}})
    f.setNativeHit(null);assert.equal(g.enemies.raycast(origin,dir,30).enemy,next.actor)
    next.dispose();assert.equal(g.enemies.raycast(origin,dir,30),null)
  }finally{g.physics.raycast=worldRaycast;for(const item of extra){item.target.dispose();item.skeleton.dispose()}f.cleanup()}
})

test('zero-start contact is immediate, validates negative time and survives synchronous lethal cancellation',()=>{
  const f=fixture(),spec={clip:3,duration:1.958,contactStart:0,contactEnd:.9}
  try{
    assert.throws(()=>f.target.beginAttack({...spec,contactStart:-.01}),/Invalid/)
    assert.ok(f.target.beginAttack(spec));assert.equal(f.g.player.health,85)
    f.target.update(.9);f.target.update(1.1);assert.equal(f.g.player.health,85)
    assert.equal(f.target.snapshot().attack,null)
    f.g.player.health=15
    f.g.player.damage=function(amount){this.health-=amount;if(this.health<=0){this.alive=false;f.g.events.emit('player:dead',{})}}
    assert.ok(f.target.beginAttack(spec))
    assert.equal(f.g.player.health,0);assert.equal(f.target.snapshot().attack,null)
    f.target.update(2);assert.equal(f.g.player.health,0)
    assert.equal(f.target.snapshot().events.filter(e=>e.type==='attack-contact').length,2)
  }finally{f.cleanup()}
})

test('zero-start lunge checks real range, facing, wall and peers during its bounded window; cancellation leaves no residual',()=>{
  for(const mode of ['range','facing','wall','peer','pause','hit','disabled','player-disabled','death']){
    let allowed=true
    const f=fixture({canAttack:()=>allowed}),spec={clip:6,duration:1.958,contactStart:0,contactEnd:.9,lungeSpeed:2.4}
    try{
      f.g.player.pos.z=2.6
      assert.ok(f.target.beginAttack(spec));assert.equal(f.g.player.health,100,'2.8m trigger is not damage range')
      if(mode==='range')f.g.player.pos.z=20
      if(mode==='facing')f.g.player.pos.z=-1
      if(mode==='wall'){f.g.physics.addBox(new T.Vector3(-2,0,.8),new T.Vector3(2,3,1));f.g.physics.build()}
      if(mode==='peer')allowed=false
      if(mode==='pause'){f.g.game.state='paused';f.g.events.emit('game:state',{state:'paused'});f.g.game.state='playing'}
      if(mode==='hit'||mode==='death')f.target.actor.damage(mode==='hit'?1:200,new T.Vector3(),new T.Vector3(),'body')
      if(mode==='disabled')f.target.setEnabled(false)
      if(mode==='player-disabled')f.g.player.enabled=false
      f.target.update(1.5);assert.equal(f.g.player.health,100,mode)
      allowed=true;f.g.player.pos.z=f.target.actor.pos.z+1
      f.target.update(.2);assert.equal(f.g.player.health,100,'no late contact after window/cancellation')
    }finally{f.cleanup()}
  }
  const f=fixture(),spec={clip:6,duration:1.958,contactStart:0,contactEnd:.9,lungeSpeed:2.4}
  try{
    f.g.player.pos.z=2.6;assert.ok(f.target.beginAttack(spec));assert.equal(f.g.player.health,100)
    f.target.update(1.5)
    assert.equal(f.g.player.health,85,'large dt checks actual range along the legal lunge')
    assert.ok(Math.abs(f.target.actor.pos.z-2.4*.9)<1e-6,'movement is clamped to the 0-.9 window')
    assert.equal(f.target.snapshot().attack.elapsed,1.5)
    f.target.update(.5);assert.equal(f.g.player.health,85);assert.equal(f.target.snapshot().attack,null)
  }finally{f.cleanup()}
})

test('state restoration preserves enable state, validates before mutation and never emits another death or contact',()=>{
  const f=fixture(),{target,g}=f
  try{
    target.setEnabled(false);target.restoreState({hp:163,alive:true})
    assert.equal(target.actor.hp,163);assert.equal(target.actor.active,false)
    for(const saved of [{hp:NaN,alive:true},{hp:0,alive:true},{hp:201,alive:true}]){
      const before=target.snapshot();assert.throws(()=>target.restoreState(saved),/Invalid/);assert.deepEqual(target.snapshot(),before)
    }
    target.setEnabled(true);assert.equal(target.actor.active,true)
    target.restoreState({hp:0,alive:false});target.update(1)
    assert.equal(target.actor.active,false);assert.equal(f.records.filter(e=>e.name==='enemy:killed').length,0)
    assert.equal(target.snapshot().attack,null)
    target.reset();assert.equal(target.actor.hp,200)
  }finally{f.cleanup()}
})
