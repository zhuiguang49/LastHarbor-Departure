import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { test, after } from 'node:test'
import { nativeChapter4Fixture } from './campaign-ch4.check.mjs'
import { loadInfectedAsset } from './character-assets.mjs'
import { createChapter2InfectedDirector } from './campaign-ch2-director.mjs'
import { createChapter4InfectedDirector } from './campaign-ch4-infected.mjs'
import { createCampaignState, applyCampaignEvent } from './campaign-state.mjs'
import { CH4 } from './campaign-ch4-layout.mjs'

// Keep the real supplied infected, target registry, clearance counter, ammunition,
// native world/capsules and moving gate. Only DOM presentation and reinforcement
// deployment are ports here; their separate checks own controls and combat.
// This is a local integration check, not a sixty-second defense playthrough.
const base=await nativeChapter4Fixture(),{g,T}=base,v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z)
const bytes=await fs.readFile(new URL('../../assets/harbor/infected/丧尸.glb',import.meta.url))
const asset=await loadInfectedAsset(T,{bytes,decodeImage:async()=>({width:2048,height:2048,close(){}})})
const json=value=>JSON.parse(JSON.stringify(value)),nativeMove=g.physics.moveCapsule,worldChildren=g.scene.children.length
after(()=>{assert.equal(asset.snapshot().liveInstances,0);asset.dispose();base.dispose()})

const ports={
  installChapter4Dossier(g,{onRead,onConfirm}) {
    let active=false,page=0,read=false,confirmed=false
    const close=()=>{active=false;g.game.state='playing';g.player.enabled=true}
    return {
      open(){if(active)return false;active=true;page=0;confirmed=false;g.game.state='paused';g.player.enabled=false;return true},
      next(){if(!active||page===3)return false;page++;if(page===3){read=true;onRead()}return true},
      confirm(){if(!active||page!==3||confirmed)return false;confirmed=true;const result=onConfirm();close();return result},
      cancel(){close()},attemptConfirm:onConfirm,
      reset(){if(active)close();page=0;read=confirmed=false},
      snapshot:()=>({active,cardIndex:page,read,confirmed}),
    }
  },
  installChapter4Reinforcements(g,{narrative}) {
    let started=false,spawning=false,retired=false,queued=0,live=0,elapsed=0
    return {
      start(){g.trace.push({method:'start'});if(started)return false;started=spawning=true;queued=6;return true},
      update(dt){g.trace.push({method:'update',dt});if(g.game.state!=='playing'||narrative.snapshot().active||dt<=0)return
        elapsed+=dt;if(spawning){live+=queued;queued=0}},
      stopSpawning(){g.trace.push({method:'stopSpawning'});spawning=false;queued=0},
      retire(){g.trace.push({method:'retire'});retired=true;spawning=false;queued=live=0},
      reset(){g.trace.push({method:'reset'});started=spawning=retired=false;queued=live=elapsed=0},
      dispose(){g.trace.push({method:'dispose'});retired=true;spawning=false;queued=live=0},
      snapshot:()=>({started,spawning,retired,queued,live,elapsed}),
    }
  },
  createClearanceVisual(){assert.fail('Reinforcement mesh creation belongs to its own native fixture')},
}
const portKey='__ch4RuntimeCheckPorts'
globalThis[portKey]=ports
const portUrl='data:text/javascript;base64,'+Buffer.from(Object.keys(ports).map(key=>`export const ${key}=globalThis.${portKey}.${key}`).join('\n')).toString('base64')
const portModules=['campaign-ch4-dossier.mjs','campaign-ch4-reinforcements.mjs','campaign-ch3-personnel-visual.mjs']
const source=(await fs.readFile(new URL('./campaign-ch4-runtime.mjs',import.meta.url),'utf8')).replace(/from '(\.\/[^']+)'/g,(_,specifier)=>
  `from '${portModules.includes(specifier.slice(2))?portUrl:new URL(specifier,import.meta.url).href}'`)
const {installChapter4Runtime}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
delete globalThis[portKey]

function setup() {
  const listeners=new Map(),events=[],messages=[],radios=[],hits=[],voices=new Set()
  let pressed=false,down=false
  base.layer.gate.reset()
  Object.assign(g,{trace:[],game:{state:'playing',run:{time:0}},time:{frame:0},enemies:{raycast:()=>null},
    input:{pressed:()=>pressed,down:()=>down},
    events:{on(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn)},
      off(name,fn){listeners.get(name)?.delete(fn)},emit(name,data){events.push({name,data});for(const fn of listeners.get(name)||[])fn(data)}},
    hud:{setPrompt(value){this.prompt=value},message:(...args)=>messages.push(args),radio:(...args)=>radios.push(args),clearRadio(){radios.length=0}},
    player:{pos:v(-70,0,-118),eye:v(-70,1.68,-118),forward:v(0,0,1),vel:v(),alive:true,enabled:true,
      health:100,onGround:true,crouching:false,speed:0,
      damage(amount){this.health-=amount;hits.push(amount);g.events.emit('player:hit',{amount});if(this.health<=0)this.alive=false}},
  })
  const raycast=g.enemies.raycast
  const bank={createVoice(){const voice={play:()=>true,update(){},stop(){},snapshot:()=>({active:false}),dispose(){voices.delete(voice)}};voices.add(voice);return voice}}
  const place=(position,target)=>{g.player.pos.copy(position);g.player.eye.copy(position).y+=1.68
    if(target)g.player.forward.copy(target).sub(position).setY(0).normalize()}
  const site=kind=>{const {approach:a,target:t}=CH4[kind];place(v(a.x,0,a.z),v(t.x,t.y,t.z))}
  const cleanup=({allowPassthrough=false}={})=>{
    if(allowPassthrough){
      // Non-LIFO release may leave a disposed pass-through closure. Verify its
      // native behavior; strict function identity is required only for LIFO.
      place(v(8,0,30));const expected=g.player.pos.clone(),actualVelocity=v(8,0,0),expectedVelocity=actualVelocity.clone()
      const wanted=nativeMove.call(g.physics,expected,expectedVelocity,.5,.32,1.8,true)
      const actual=g.physics.moveCapsule(g.player.pos,actualVelocity,.5,.32,1.8,true)
      assert.deepEqual(json(g.player.pos.toArray()),json(expected.toArray()))
      assert.deepEqual(json(actualVelocity.toArray()),json(expectedVelocity.toArray()))
      assert.deepEqual(json(actual),json(wanted))
    }else assert.equal(g.physics.moveCapsule,nativeMove,'LIFO disposal must restore the original shared capsule solver')
    assert.equal(g.enemies.raycast,raycast)
    assert.equal(g.scene.children.length,worldChildren)
    assert.equal(asset.snapshot().liveInstances,0);assert.equal(voices.size,0)
    for(const list of listeners.values())assert.equal(list.size,0)
    base.layer.gate.reset()
    g.physics.moveCapsule=nativeMove
  }
  return {g,bank,listeners,events,messages,radios,hits,voices,place,site,cleanup,
    input(p,d=p){pressed=p;down=d},raycast}
}

function fixture({intro=true}={}) {
  const f=setup(),initial=createCampaignState(),emitted=[],checkpoints=[]
  let opening=false,state=applyCampaignEvent({...initial,currentChapter:'CH3',status:'completed',
    flags:{...initial.flags,chapter3Completed:true,accessCredentialObtained:true}}, {type:'chapter4-crossed'})
  if(intro)state=applyCampaignEvent(state,{type:'chapter4-intro-read',skipped:false})
  const entry=json(state)
  let stock={slots:{rifle:{owned:true,ammo:2,reserve:4},pistol:{owned:true,ammo:1,reserve:2}}}
  const equipment={capture:()=>json(stock),restore(saved){stock=json(saved)},
    snapshot:()=>({slots:{rifle:{magSize:30,reserveCap:90},pistol:{magSize:12,reserveCap:48}}})}
  const emit=event=>{const next=applyCampaignEvent(state,event);if(next===state)return false;state=next;emitted.push(event);return true}
  const runtime=installChapter4Runtime(g,equipment,{infected:{asset,bank:f.bank},personnel:{},gate:base.layer.gate,
    narrative:{snapshot:()=>({active:opening})},flags:()=>state.flags,emit,onCheckpoint:()=>checkpoints.push(json(state))})
  const tick=(dt=.01)=>{g.time.frame++;if(g.game.state==='playing'&&!opening&&!runtime.dossier.snapshot().active)g.game.run.time+=dt;runtime.update(dt)}
  const release=()=>{f.input(false);g.time.frame++;runtime.interact()}
  const press=()=>{release();f.input(true);g.time.frame++;return runtime.interact()}
  const kill=index=>{const a=runtime.enemies.members[index].target.actor;return a.damage(200,a.pos.clone(),v(1,0,0),'body')}
  const clear=()=>{tick();for(let i=0;i<5;i++)assert.equal(kill(i),true);tick()}
  const read=()=>{f.site('console');assert.equal(press(),true);for(let i=0;i<3;i++)assert.equal(runtime.dossier.next(),true)}
  const start=()=>{clear();read();assert.equal(runtime.dossier.confirm(),true);release()}
  return {...f,runtime,equipment,emitted,checkpoints,tick,release,press,kill,clear,read,start,emit,
    flags:()=>state.flags,state:()=>state,setOpening(value){opening=value},
    reset(){state=json(entry);runtime.reset();release()},
    dispose(){runtime.dispose();runtime.dispose();f.cleanup()}}
}

test('CH4 runtime loads without experimental VM modules and gates combat until the opening is read',async()=>{
  assert.equal(typeof (await import('./campaign-ch4-runtime.mjs')).installChapter4Runtime,'function')
  const f=fixture({intro:false}),r=f.runtime
  try{
    f.tick(10);assert.ok(r.enemies.members.every(m=>!m.target.actor.active));assert.equal(r.capture().elapsed,0)
    f.site('console');f.press();assert.equal(r.dossier.snapshot().active,false)
    assert.equal(f.emit({type:'chapter4-intro-read',skipped:false}),true)
    f.tick();assert.ok(r.enemies.members.every(m=>m.target.actor.active))
  }finally{f.dispose()}
})

test('4/5 cannot open the dossier; 5/5 needs a fresh E and final confirmation alone starts the override',()=>{
  const f=fixture(),r=f.runtime
  try{
    f.tick();for(let i=0;i<4;i++)f.kill(i)
    f.tick();f.site('console');assert.equal(f.press(),true)
    assert.equal(r.dossier.snapshot().active,false);assert.equal(f.flags().blockadeInfectedCleared,false)
    assert.match(g.hud.prompt,/4\/5/)
    f.kill(4);f.tick();g.time.frame++;r.interact()
    assert.equal(r.dossier.snapshot().active,false,'The fifth kill must not consume a held interaction')
    assert.equal(f.flags().blockadeInfectedCleared,true)
    assert.equal(r.dossier.attemptConfirm(),false,'The host reducer refuses confirmation without p07Read')
    assert.equal(r.reinforcements.snapshot().started,false)
    f.press();assert.equal(r.dossier.snapshot().active,true)
    assert.equal(r.dossier.confirm(),false,'Early-page Enter is not confirmation')
    for(let i=0;i<3;i++)r.dossier.next()
    assert.equal(f.flags().p07Read,true);assert.equal(f.flags().gateOverrideStarted,false)
    f.tick(50);assert.equal(r.capture().elapsed,0);assert.equal(r.reinforcements.snapshot().started,false)
    r.dossier.cancel();assert.equal(f.flags().gateOverrideStarted,false)
    f.read();assert.equal(r.dossier.snapshot().cardIndex,3)
    assert.equal(r.dossier.confirm(),true);assert.equal(r.dossier.confirm(),false)
    assert.equal(f.flags().gateOverrideStarted,true);assert.equal(f.flags().gateOverrideAccepted,false)
    assert.equal(g.trace.filter(e=>e.method==='start').length,1)
    assert.equal(r.dossier.attemptConfirm(),false,'Repeated completion cannot start another wave')
    assert.deepEqual(r.gate.capture(),{started:false,progress:0})
  }finally{f.dispose()}
})

test('the 60 simulation seconds continue away from the console and after hits, but pause and modal time do not count',()=>{
  const f=fixture(),r=f.runtime
  try{
    f.start();f.place(v(-70,0,-115));f.tick(20)
    g.player.damage(15);f.tick(10)
    assert.equal(g.player.health,85);assert.equal(r.capture().elapsed,30)
    assert.match(r.objective(),/30 秒.*50%/)
    g.game.state='paused';const runTime=g.game.run.time;f.tick(20)
    assert.equal(r.capture().elapsed,30);assert.equal(g.game.run.time,runTime)
    g.game.state='playing';f.setOpening(true);f.tick(20);assert.equal(r.capture().elapsed,30)
    f.setOpening(false);r.dossier.open();f.tick(20);assert.equal(r.capture().elapsed,30);r.dossier.cancel()
    f.tick(29.99);assert.equal(f.flags().gateOverrideAccepted,false)
    assert.equal(r.gate.snapshot().phase,'closed')
    g.trace.length=0;f.tick(.01)
    assert.equal(r.capture().elapsed,60);assert.equal(f.flags().gateOverrideAccepted,true)
    assert.deepEqual(g.trace.map(e=>e.method),['stopSpawning','update'])
    assert.equal(r.reinforcements.snapshot().spawning,false);assert.equal(r.reinforcements.snapshot().queued,0)
    assert.equal(r.gate.snapshot().phase,'opening');assert.equal(f.flags().chapter4Completed,false)
    f.tick(.1);assert.equal(r.capture().elapsed,60)
    assert.equal(f.emitted.filter(e=>e.type==='gate-override-accepted').length,1)
  }finally{f.dispose()}
})

test('completion requires native movement through the passable rising gate and retires only at that crossing',()=>{
  const f=fixture(),r=f.runtime,z=CH4.gate.position.z
  try{
    f.start();assert.equal(r.observeExit(v(-70,0,z-.5),v(-70,0,z+.5)),false)
    f.tick(59.99);f.tick(.01)
    assert.equal(r.observeExit(v(-70,0,z-.5),v(-70,0,z+.5)),false,'The accepted but closed collider still blocks crossing')
    f.tick(1.6)
    assert.equal(r.gate.snapshot().phase,'opening');assert.equal(r.gate.snapshot().standingPassable,false)
    for(const [from,to]of [[v(-70,0,z+.2),v(-70,0,z+1)],[v(-70,0,z+1),v(-70,0,z-1)],
      [v(-70,2,z-.5),v(-70,2,z+.5)],[v(-70,0,z-3),v(-70,0,z+3)],[v(-75,0,z-.5),v(-75,0,z+.5)]])
      assert.equal(r.observeExit(from,to),false)
    assert.equal(r.reinforcements.snapshot().retired,false);assert.equal(f.flags().chapter4Completed,false)
    f.place(v(-70,0,z-.8));const previous=g.player.pos.clone()
    const move=g.physics.moveCapsule(g.player.pos,v(0,0,2),.8,.32,1.15,true)
    assert.equal(move.hitWall,false);assert.ok(g.player.pos.z>z)
    assert.equal(r.observeExit(previous,g.player.pos),true)
    assert.equal(f.flags().gatePhysicallyOpen,true);assert.equal(f.flags().chapter4Completed,true)
    assert.equal(f.state().status,'completed');assert.equal(r.reinforcements.snapshot().retired,true)
    assert.equal(r.reinforcements.snapshot().live,0);assert.equal(r.enemies.snapshot().finished,true)
    assert.equal(g.hud.prompt,null);assert.equal(f.radios.length,0)
    assert.equal(r.observeExit(previous,g.player.pos),false)
    assert.equal(f.emitted.filter(e=>e.type==='chapter4-exited').length,1)
  }finally{f.dispose()}
})

test('entry reset restores the same five actors, count, clock, gate, ammo cooldown and reinforcement reservations',()=>{
  const f=fixture(),r=f.runtime,actors=r.enemies.members.map(m=>m.target.actor)
  try{
    const entry=json(r.capture());assert.doesNotThrow(()=>r.validateEntry(entry,f.flags()))
    f.start();f.tick(12);f.site('ammo');assert.equal(f.press(),true)
    assert.equal(r.ammo.capture().uses,1);assert.equal(r.ammo.capture().cooldownRemaining,15)
    f.tick(47.99);f.tick(.01);f.tick(1.6)
    assert.equal(r.gate.snapshot().phase,'opening');assert.equal(r.reinforcements.snapshot().live,6)
    assert.throws(()=>r.validateEntry(json(r.capture()),f.flags()),/Invalid CH4 entry/)
    f.reset()
    assert.equal(r.capture().elapsed,0);assert.equal(r.clearance.snapshot().count,0)
    assert.deepEqual(r.gate.capture(),{started:false,progress:0})
    assert.equal(g.physics.nav.isWalkable(-70,CH4.gate.position.z),false)
    assert.deepEqual(r.ammo.capture(),{version:1,cooldownRemaining:0,uses:0})
    assert.deepEqual(r.reinforcements.snapshot(),{started:false,spawning:false,retired:false,queued:0,live:0,elapsed:0})
    assert.equal(r.dossier.snapshot().active,false)
    for(const [i,m]of r.enemies.members.entries()){
      assert.equal(m.target.actor,actors[i]);assert.equal(m.target.actor.hp,200);assert.equal(m.target.actor.alive,true)
      assert.deepEqual(Array.from(m.target.actor.pos.toArray()),Object.values(m.spawn.position))
    }
    assert.doesNotThrow(()=>r.validateEntry(json(r.capture()),f.flags()))
    g.events.emit('enemy:killed',{enemy:actors[0]});assert.equal(r.clearance.snapshot().count,0)
    f.tick();f.kill(0);assert.equal(r.clearance.snapshot().count,1)
    assert.equal(r.reinforcements.snapshot().started,false)
  }finally{f.dispose()}
})

test('inactive CH4 installation preserves CH2 player collision, and both active deployments block independently',()=>{
  const f=setup(),options={asset,bank:f.bank,enabled:false}
  const ch2=createChapter2InfectedDirector(g,options),ch4=createChapter4InfectedDirector(g,options)
  try{
    ch2.setEnabled(true)
    for(const m of ch2.members.slice(1))m.target.setEnabled(false)
    ch2.members[0].instance.root.position.set(10,0,30)
    ch4.members[0].instance.root.position.set(10,0,34)
    const probe=z=>{
      // Native empty ground outside authored CH4 cover isolates shared actor
      // contacts from the already-tested map obstacle contacts.
      f.place(v(8,0,z));g.physics.moveCapsule(g.player.pos,v(8,0,0),.5,.32,1.8,true)
      assert.ok(g.player.pos.x<=9.361&&g.player.pos.x>=9.35,`Missing ${z} actor collision at ${g.player.pos.toArray()}`)
    }
    probe(30)
    ch4.setEnabled(true)
    for(const m of ch4.members.slice(1))m.target.setEnabled(false)
    probe(30);probe(34)
    ch2.finish();probe(34)
    f.place(v(8,0,30));g.physics.moveCapsule(g.player.pos,v(8,0,0),.5,.32,1.8,true)
    assert.ok(g.player.pos.x>10,'Finishing CH2 releases only its own player collision')
  }finally{ch4.dispose();ch2.dispose();f.cleanup()}
})

test('CH2 and CH4 share target ownership and release resources and native collisions in either order',()=>{
  for(const order of ['chapter4-first','chapter2-first']){
    const f=setup(),options={asset,bank:f.bank,enabled:false}
    const ch2=createChapter2InfectedDirector(g,options),ch4=createChapter4InfectedDirector(g,options)
    try{
      assert.equal(ch2.members.length,36);assert.equal(ch4.members.length,5)
      assert.equal(ch2.members[0].target.snapshot().raycast.targets,41)
      assert.throws(()=>createChapter2InfectedDirector(g,options),/already owns/)
      assert.throws(()=>createChapter2InfectedDirector(g,{...options,sectionId:'ch2.s1'}),/already owns/)
      assert.throws(()=>createChapter4InfectedDirector(g,options),/already owns/)
      assert.equal(asset.snapshot().liveInstances,41)
      ch2.setEnabled(true);ch4.setEnabled(true)
      const first=order==='chapter4-first'?ch4:ch2,remaining=first===ch4?ch2:ch4
      first.dispose();assert.equal(remaining.members[0].target.snapshot().raycast.targets,remaining.members.length)
      assert.equal(remaining.members[0].target.actor.active,true)
      const replacement=first===ch4?createChapter4InfectedDirector(g,options):createChapter2InfectedDirector(g,options)
      assert.equal(asset.snapshot().liveInstances,41);replacement.dispose()
      remaining.dispose()
    }finally{ch4.dispose();ch2.dispose()}
    f.cleanup({allowPassthrough:order==='chapter2-first'})
  }
})
