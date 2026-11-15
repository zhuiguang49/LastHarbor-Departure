import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { test,after } from 'node:test'
import { robotFixture } from './campaign-ch5-native-adapters.check.mjs'
import { loadInfectedAsset } from './character-assets.mjs'
import { loadChapter3PersonnelResources } from './campaign-ch3-personnel-visual.mjs'
import { installChapter5Battle } from './campaign-ch5-battle.mjs'

const bootstrap=await robotFixture({hooks:false}),T=bootstrap.T
bootstrap.dispose()
const decodeImage=async()=>({width:2048,height:2048,close(){}})
const asset=await loadInfectedAsset(T,{bytes:await fs.readFile(new URL('../../assets/harbor/infected/丧尸.glb',import.meta.url)),decodeImage})
const personnel=await loadChapter3PersonnelResources({THREE:T},{bytes:await fs.readFile(new URL('../../assets/harbor/soldier/soldier.glb',import.meta.url)),decodeImage,
  loadTexture:async()=>new T.Texture({width:2048,height:2048})})
after(()=>{assert.equal(asset.snapshot().liveInstances,0);assert.equal(personnel.snapshot().liveVisuals,0);asset.dispose();personnel.dispose()})
const json=value=>JSON.parse(JSON.stringify(value))
async function fixture(){
  const f=await robotFixture({hooks:false}),{g,v}=f
  f.combat.dispose()
  const voices=new Set(),sources=new Set(),radio=[]
  const bank={createVoice(){const voice={active:false,play(){this.active=true},update(){},stop(){this.active=false},dispose(){voices.delete(this)}};voices.add(voice);return voice}}
  g.audio.meleeBus={};g.audio.ctx={state:'running',
    createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)}},
    createBufferSource(){const source={connect(){},disconnect(){},start(){sources.add(source)},stop(){sources.delete(source)}};return source},
    createGain:()=>({gain:{value:0},connect(){},disconnect(){}}),
    createPanner:()=>({positionX:{value:0},positionY:{value:0},positionZ:{value:0},connect(){},disconnect(){}})}
  g.hud={radio(text){radio.push(text)},clearRadio(){radio.length=0}}
  let active=true
  const battle=installChapter5Battle(g,{infected:{asset,bank},personnel,active:()=>active})
  const tick=(dt=.02)=>{g.time.frame++;g.game.run.time+=dt;g.enemies.update(dt);battle.update(dt)}
  const until=(predicate,message)=>{for(let n=0;n<500&&!predicate();n++)tick();assert.ok(predicate(),message)}
  return {...f,battle,voices,sources,radio,tick,until,setActive:value=>{active=value},
    dispose(){battle.dispose();assert.equal(voices.size,0);assert.equal(sources.size,0);f.dispose()}}
}
function full(battle){const counts=battle.population.snapshot().counts
  for(const [kind,count]of Object.entries({infected:7,soldier:5,hound:3,gull:3}))assert.deepEqual(counts[kind],{alive:count,reserved:0})}
function poses(battle){return [...battle.infected.map(m=>m.instance.root),...battle.soldiers.members.map(m=>m.visual.root)]
  .map(root=>({position:root.position.toArray(),quaternion:root.quaternion.toArray(),visible:root.visible}))}

test('M5-C departure synchronously cancels shots, owned bolts/voices and reservations while preserving visible actor resources',async()=>{
  const f=await fixture(),{g,battle:b,v}=f
  try{
    const outsider=g.enemies.spawn('gull',v(-38,8,20),{passive:true}),outsideLoop=outsider.loop
    assert.equal(b.start(),true);f.tick();full(b)
    const soldier=b.soldiers.members[0],infected=b.infected[0]
    soldier.visual.root.position.set(0,0,0);soldier.visual.root.rotation.y=0
    infected.instance.root.position.set(0,0,-9)
    f.until(()=>b.soldiers.snapshot().stats.shots>0,'a real soldier must fire before departure')
    assert.ok(f.sources.size>0,'soldier fire has a live cancellable audio source')
    // Preserve an actual queued replacement and live native projectile at the
    // exact interaction boundary, before that frame's native enemy manager.
    const vacant=b.population.slots.find(s=>s.kind==='infected'&&s.actor!==infected.actor)
    b.combat.damageFrom(g.player,vacant.actor,200,vacant.actor.pos.clone(),v(1,0,0));f.tick()
    assert.equal(b.population.snapshot().counts.infected.reserved,1)
    const gull=b.population.slots.find(s=>s.kind==='gull').actor
    g.enemies.debug.ctx.fireBolt(gull.pos.clone(),v(0,0,1),gull)
    g.enemies.debug.ctx.fireBolt(outsider.pos.clone(),v(0,0,1),outsider)
    assert.ok(b.native.snapshot().bolts>0)
    for(const voice of f.voices)voice.play()
    const beforePoses=json(poses(b)),nativePoses=g.enemies.list.filter(a=>a!==outsider).map(a=>({actor:a,position:a.pos.clone(),rig:a.rig}))
    const resources={infected:asset.snapshot().liveInstances,soldiers:personnel.snapshot().liveVisuals},hp=g.player.health
    assert.equal(b.stopForDeparture(),true);assert.equal(b.stopForDeparture(),false);assert.equal(b.start(),false)
    assert.equal(b.snapshot().departureStopped,true);assert.equal(b.capture().started,false)
    assert.ok(b.population.snapshot().slots.every(s=>s.due===null&&s.retryAt===0))
    assert.equal(b.native.snapshot().bolts,0);assert.equal(f.sources.size,0);assert.ok([...f.voices].every(v=>!v.active))
    assert.equal(f.loops.size,1);assert.ok(f.loops.has(outsideLoop));assert.equal(f.radio.length,0)
    assert.equal(g.enemies.debug.bolts.filter(x=>x.on&&x.owner===outsider).length,1)
    const shots=b.soldiers.snapshot().stats.shots,clock=b.capture().elapsed
    // A direct native shot after stop and this frame's enemy update both see
    // the closed CH5 gate even while game.state is still playing.
    const dog=b.population.slots.find(s=>s.kind==='hound').actor
    assert.equal(g.combat.enemyShot(dog.pos.clone(),v(1,0,0),{owner:dog,damage:5,range:200}),false)
    for(let i=0;i<300;i++)f.tick()
    assert.equal(g.player.health,hp);assert.equal(b.soldiers.snapshot().stats.shots,shots);assert.equal(b.capture().elapsed,clock)
    assert.deepEqual(json(poses(b)),beforePoses)
    for(const {actor,position,rig}of nativePoses){assert.ok(actor.pos.equals(position));assert.equal(actor.rig,rig);assert.equal(actor.rig.group.visible,true)}
    assert.equal(asset.snapshot().liveInstances,resources.infected);assert.equal(personnel.snapshot().liveVisuals,resources.soldiers)
    assert.equal(asset.snapshot().closing,false);assert.equal(personnel.snapshot().closing,false)
    assert.equal(outsider.alive,true);assert.equal(outsider.active,true)
  }finally{f.dispose()}
})

test('M5-C departure also cancels initial reservations and repeated reset/new starts recover full battle without new character instances',async()=>{
  const f=await fixture(),{g,battle:b}=f
  try{
    const originals={infected:b.infected.map(m=>m.instance),soldiers:b.soldiers.members.map(m=>m.visual)}
    assert.equal(b.start(),true);assert.ok(Object.values(b.population.snapshot().counts).every(c=>c.alive===0&&c.reserved>0))
    assert.equal(b.stopForDeparture(),true);f.tick(10)
    assert.ok(Object.values(b.population.snapshot().counts).every(c=>c.alive===0&&c.reserved===0))
    for(let i=0;i<3;i++){
      b.reset();assert.equal(b.snapshot().departureStopped,false);assert.equal(b.start(),true);f.tick();full(b)
      for(const [j,m]of b.infected.entries())assert.equal(m.instance,originals.infected[j])
      for(const [j,m]of b.soldiers.members.entries())assert.equal(m.visual,originals.soldiers[j])
      assert.equal(b.stopForDeparture(),true);assert.equal(b.start(),false)
      f.setActive(false);g.game.state='paused';f.tick(20);g.game.state='playing';f.setActive(true);f.tick(20)
      assert.ok(b.population.snapshot().slots.every(s=>s.due===null));assert.equal(b.native.snapshot().bolts,0)
    }
    b.reset();assert.equal(b.capture().elapsed,0);assert.equal(b.capture().started,false)
    assert.equal(b.start(),true);f.tick();full(b)
  }finally{f.dispose()}
})

test('M5-C stopping an already dormant battle is idempotent and does not reactivate retired previous-chapter native actors',async()=>{
  const f=await fixture(),{g,battle:b,v}=f
  try{
    const old=g.enemies.spawn('hound',v(-35,0,20),{passive:true}),oldId=old.id,rig=old.rig
    g.enemies.debug.ctx.retire(old)
    assert.equal(b.stopForDeparture(),true);assert.equal(b.stopForDeparture(),false)
    for(let i=0;i<10;i++)f.tick(1)
    assert.equal(old.id,oldId);assert.equal(old.active,false);assert.equal(old.rig,rig);assert.equal(old.rig.group.visible,false)
    assert.equal(g.enemies.list.includes(old),false);assert.equal(b.native.snapshot().owned.length,0)
    b.dispose();assert.equal(b.stopForDeparture(),false);assert.equal(b.start(),false)
  }finally{f.dispose()}
})
