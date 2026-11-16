import { test,after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { nativeFixture,loadChapter2 } from './campaign-ch2.check.mjs'
import { CH2_SAFE_ZONES } from './campaign-ch2-layout.mjs'
import { installChapter2SafeRooms,CH2_SAFE_ROOM_DOOR as dimensions } from './campaign-ch2-safe-rooms.mjs'
import { createChapter2InfectedDirector } from './campaign-ch2-director.mjs'
import { loadInfectedAsset } from './character-assets.mjs'
import { INFECTED_CLIPS } from './character-clips.mjs'
import { createChapter2Navigation } from './campaign-ch2-navigation.mjs'

// Real original physics/nav/factories and current GLB. Texture/audio/input and
// equipment are doubles; this is a local diagnostic, not a player route/Gate.
const {g:native,T,createPlayer}=await nativeFixture(),{build}=await loadChapter2()
const asset=await loadInfectedAsset(T,{bytes:await fs.readFile(new URL('../../assets/harbor/infected/丧尸.glb',import.meta.url)),decodeImage:async()=>({width:2048,height:2048,close(){}})})
after(()=>asset.dispose())
const json=value=>JSON.parse(JSON.stringify(value)),v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z)
const evidence={scope:'Local native/GLB diagnostics only; no browser, full route, user Gate or performance acceptance',dimensions,geometry:[],combat:[],ammo:[]}
const output=new URL('../../artifacts/harbor/ch2-completion-2026-11-13/b2-exit-trigger-fix/',import.meta.url)
after(async()=>{await fs.mkdir(output,{recursive:true});await fs.writeFile(new URL('local-evidence.json',output),JSON.stringify(evidence,null,2)+'\n');for(const key of ['geometry','combat','ammo'])if(evidence[key].length)await fs.writeFile(new URL(`${key}-local.json`,output),JSON.stringify({scope:evidence.scope,dimensions,records:evidence[key]},null,2)+'\n')})
function fixture(){
  for(const box of [...native.physics.boxes])native.physics.removeBox(box)
  const environment=build(native),listeners=new Map(),events={on(k,f){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(f)},off(k,f){listeners.get(k)?.delete(f)},emit(k,e){for(const f of listeners.get(k)||[])f(e)}}
  let key=false,pressed=false,allowed=true
  const slots={pistol:{owned:true,ammo:4,reserve:0},rifle:{owned:true,ammo:7,reserve:0},knife:{owned:true,ammo:1,reserve:0}},calls=[],commits=[]
  const equipment={capture:()=>json({slots}),addAmmo(id,amount){calls.push({id,amount});const s=slots[id],delta=Math.min(amount,(id==='pistol'?48:160)-s.reserve);s.reserve+=delta;return delta},
    refill(id){calls.push({id,refill:true});const s=slots[id];if(!s?.owned)return false;const changed=s.ammo!==40||s.reserve!==160;s.ammo=40;s.reserve=160;return changed}}
  const g={...native,events,enemies:{raycast:()=>null},game:{state:'playing',run:{time:0}},time:{frame:1},input:{down:()=>key,pressed:()=>pressed},hud:{setPrompt(){},message(){}},
    player:{pos:v(),eye:v(),vel:v(),forward:v(0,0,-1),health:83,alive:true,enabled:true,onGround:true,crouching:false,damage(n){this.health-=n}}}
  const safe=installChapter2SafeRooms(g,{equipment,canInteract:()=>allowed,onCheckpoint:event=>commits.push({event,state:json(safe.capture()),equipment:equipment.capture(),health:g.player.health})})
  function place(point,{crouch=false,facing}={}){g.player.pos.copy(point);g.player.eye.copy(point).y+=crouch?1.05:1.68;g.player.crouching=crouch;g.player.vel.set(0,0,0);if(facing)g.player.forward.copy(facing).sub(point).setY(0).normalize()}
  function tick(dt=.05){g.time.frame++;g.game.run.time+=dt;safe.update(dt)}
  function release(){key=pressed=false;tick(0);safe.interact()}
  function press(){release();key=pressed=true;g.time.frame++;return safe.interact()}
  function stateDoor(id,progress,target=progress===1?1:0){const state=safe.capture();for(const room of state.rooms)for(const door of room.doors)if(door.id===id)Object.assign(door,{progress,target,held:false});safe.restore(state)}
  return {g,safe,environment,slots,calls,commits,place,tick,press,release,stateDoor,setAllowed(value){allowed=value},cleanup(){safe.dispose();environment.dispose()}}
}
function center(entrance){return v(...entrance.min).add(v(...entrance.max)).multiplyScalar(.5)}
function walk(g,from,to,height,speed=2){
  const pos=from.clone(),trail=[pos.toArray()],direction=to.clone().sub(from).setY(0).normalize()
  const steps=Math.ceil(from.distanceTo(to)/speed*60)+30
  let hitWall=false
  for(let i=0;i<steps&&Math.hypot(pos.x-to.x,pos.z-to.z)>.025;i++){
    const velocity=direction.clone().multiplyScalar(Math.min(speed,Math.hypot(pos.x-to.x,pos.z-to.z)*60));velocity.y=-.16
    const result=g.physics.moveCapsule(pos,velocity,1/60,.32,height,true);hitWall ||= result.hitWall;trail.push(pos.toArray())
  }
  return {pos,hitWall,trail}
}

test('six actual apertures: closed/moving/open meshes, rays, native nav and both native capsule heights agree; crouch returns both ways',()=>{
  const f=fixture()
  try{
    assert.equal(dimensions.openBottom,1.55);assert.ok(.172+1.15<1.55);assert.ok(1.8>1.55)
    for(const zone of CH2_SAFE_ZONES)for(const entrance of zone.entrances){
      const c=center(entrance),outside=v(entrance.outside.x,.172,entrance.outside.z),inside=v(entrance.inside.x,.172,entrance.inside.z)
      const direction=inside.clone().sub(outside).setY(0).normalize(),start=c.clone().addScaledVector(direction,-.8).setY(.172),end=c.clone().addScaledVector(direction,.8).setY(.172)
      for(const progress of [0,.5,.85,1]){
        f.stateDoor(entrance.id,progress,1)
        const door=f.safe.snapshot().rooms.flatMap(r=>r.doors).find(d=>d.id===entrance.id),panel=f.g.scene.getObjectByName(entrance.id)
        panel.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(panel)
        assert.ok(bounds.min.distanceTo(v(...door.min))<1e-6);assert.ok(bounds.max.distanceTo(v(...door.max))<1e-6)
        const blocked=walk(f.g,start,end,1.8)
        assert.ok(blocked.pos.distanceTo(end)>.5,`${entrance.id}/${progress}: infected crossed`)
        assert.ok(blocked.hitWall)
        evidence.geometry.push({id:entrance.id,progress,bottom:door.min[1],standingBlocked:blocked.pos.toArray(),nativeNavClear:f.g.physics.nav.clearLine(start,end),meshMin:bounds.min.toArray(),meshMax:bounds.max.toArray()})
        assert.equal(f.safe.allowsEnemySegment(start,end),false)
        const lowA=start.clone().setY(.8),lowB=end.clone().setY(.8),highA=start.clone().setY(2),highB=end.clone().setY(2)
        assert.equal(f.g.physics.lineOfSight(highA,highB),false)
        assert.equal(f.g.physics.lineOfSight(lowA,lowB),door.min[1]>.8)
        const rayDirection=highB.clone().sub(highA).normalize(),hits=new T.Raycaster(highA,rayDirection,0,highA.distanceTo(highB)).intersectObject(panel)
        assert.ok(hits.length,`${entrance.id}: visible shutter missing`)
        if(progress===0){assert.ok(walk(f.g,start,end,1.15).pos.distanceTo(end)>.5);assert.equal(f.g.physics.nav.clearLine(start,end),false)}
        if(progress===1){
          assert.equal(f.g.physics.nav.clearLine(start,end),true)
          const index=f.g.physics.boxes.findIndex(b=>b.tag===entrance.id),handle=f.g.physics.boxes[index]
          f.g.physics.boxes.splice(index,1);f.g.physics.build()
          try{assert.ok(walk(f.g,start,end,1.8).pos.distanceTo(end)<.025,`${entrance.id}: removing only actual door must release standing capsule`)}
          finally{f.g.physics.boxes.splice(index,0,handle);f.g.physics.build()}
          for(const [from,to] of [[outside,inside],[inside,outside]]){
            assert.ok(f.g.physics.nav.findPath(from,to)?.length,`${entrance.id}: native player path missing`)
            const passed=walk(f.g,from,to,1.15)
            assert.ok(Math.hypot(passed.pos.x-to.x,passed.pos.z-to.z)<.025,`${entrance.id}: crouched capsule blocked`)
            evidence.geometry.push({id:entrance.id,progress,from:from.toArray(),to:to.toArray(),final:passed.pos.toArray(),min:door.min,max:door.max})
          }
        }
      }
    }
  }finally{f.cleanup()}
})

test('physical safety exits require the capsule to clear the forward door; opening, backward exits and restore do not activate a section',()=>{
  const f=fixture()
  try {
    const walkPlayer=to=>{
      for(let i=0;i<240&&Math.hypot(to.x-f.g.player.pos.x,to.z-f.g.player.pos.z)>.025;i++){
        const velocity=to.clone().sub(f.g.player.pos).setY(0).normalize().multiplyScalar(1.5);velocity.y=-.16
        f.g.physics.moveCapsule(f.g.player.pos,velocity,1/60,.32,1.15,true);f.tick(1/60)
      }
    }
    for(const zone of CH2_SAFE_ZONES){
      f.safe.reset();f.place(v(zone.x,.172,zone.z),{crouch:true});f.tick(0)
      const end=zone.entrances[1],outside=v(end.outside.x,0,end.outside.z)
      walkPlayer(outside);assert.equal(f.safe.capture().rooms.find(r=>r.id===zone.id).forwardExited,false)
      f.stateDoor(end.id,1);const inside=f.g.player.pos.clone(),saved=json(f.safe.capture()),count=f.commits.filter(c=>c.event.kind==='exit').length
      assert.equal(saved.occupant,zone.id)
      walkPlayer(outside)
      assert.equal(f.safe.capture().rooms.find(r=>r.id===zone.id).forwardExited,true)
      assert.equal(f.commits.filter(c=>c.event.kind==='exit').length,count+1)
      f.tick(.5);assert.equal(f.commits.filter(c=>c.event.kind==='exit').length,count+1)
      f.place(inside,{crouch:true});f.safe.restore(saved)
      assert.equal(f.commits.filter(c=>c.event.kind==='exit').length,count+1,'restoring never emits an exit')
      walkPlayer(outside);assert.equal(f.commits.filter(c=>c.event.kind==='exit').length,count+2)
      f.safe.reset();f.place(v(zone.x,.172,zone.z),{crouch:true});f.tick(0)
      const back=zone.entrances[0];f.stateDoor(back.id,1);walkPlayer(v(back.outside.x,0,back.outside.z))
      assert.equal(f.safe.capture().rooms.find(r=>r.id===zone.id).forwardExited,false)
    }
  }finally{f.cleanup()}
})

test('native player exits emit the section activation event even when crouch is released under the shutter',()=>{
  const f=fixture()
  try {
    f.g.camera=new T.PerspectiveCamera();f.g.render=null
    Object.assign(f.g.input,{look:{dx:0,dy:0},move:{x:0,y:1},sprint:false,crouch:true,fire:false,ads:false})
    f.g.player=createPlayer(f.g)
    for(const zone of CH2_SAFE_ZONES){
      f.safe.reset()
      f.g.player.reset({pos:v(zone.x,.172,zone.z),yaw:zone.yaw?Math.PI:-Math.PI/2})
      f.g.input.crouch=true;f.g.player.update(1/60);f.tick(1/60)
      const end=zone.entrances[1],c=center(end),axis=zone.yaw?'z':'x'
      f.stateDoor(end.id,1)
      const trace=[]
      for(let i=0;i<240&&f.g.player.pos[axis]<c[axis]+1;i++){
        if(f.g.player.pos[axis]>c[axis]-.1)f.g.input.crouch=false
        f.g.player.update(1/60);f.tick(1/60)
        if(f.g.player.pos[axis]>c[axis]-.2)trace.push({offset:f.g.player.pos[axis]-c[axis],y:f.g.player.pos.y,crouching:f.g.player.crouching,occupant:f.safe.capture().occupant})
      }
      assert.ok(f.g.player.pos[axis]>c[axis]+.8,'native player must really clear the exit')
      assert.equal(f.safe.capture().rooms.find(r=>r.id===zone.id).forwardExited,true,`${zone.id}: exit missing; ${JSON.stringify(trace)}`)
      assert.equal(f.commits.filter(c=>c.event.kind==='exit'&&c.event.id===zone.id).length,1,'emit the actual exit once for the campaign activation callback')
      assert.equal(f.g.player.crouching,false,'native headroom clearance must restore standing')
    }
  }finally{f.cleanup()}
})

test('staged room cohorts keep their door side and physically retreat from an occupied room exit, including trackers and Hit',()=>{
  const f=fixture(),bank={createVoice:()=>({play(){},update(){},stop(){},snapshot:()=>({}),dispose(){}})}
  const director=createChapter2InfectedDirector(f.g,{asset,bank,safeRooms:f.safe,staged:true})
  try {
    director.activateSection('ch2.s2');director.activateSection('ch2.s3')
    for(const [index,doorIndex,sectionId] of [[0,0,'ch2.s1'],[0,1,'ch2.s2'],[1,0,'ch2.s2'],[1,1,'ch2.s3'],[2,0,'ch2.s3']]){
      const zone=CH2_SAFE_ZONES[index],entrance=zone.entrances[doorIndex],c=center(entrance)
      const axis=zone.yaw?'z':'x',side=doorIndex?1:-1,member=director.members.find(m=>m.spawn.sectionId===sectionId&&m.spawn.omniscientTracking)
      f.stateDoor(entrance.id,1);member.target.actor.pos.copy(c).setY(0);member.target.actor.pos[axis]+=side*.65;member.ai.reset()
      f.place(v(zone.x,.172,zone.z),{crouch:true});const health=f.g.player.health
      member.target.actor.damage(1,member.target.actor.pos,v(1,0,0),'body')
      for(let i=0;i<100;i++){director.update(.05);assert.ok(f.safe.allowsSectionSegment(sectionId,member.target.actor.pos,member.target.actor.pos))}
      const clearance=(member.target.actor.pos[axis]-c[axis])*side
      assert.ok(clearance>=3.2,`${entrance.id}: waiting infected is only ${clearance}m from the doorway`)
      assert.equal(f.g.player.health,health);assert.equal(member.target.snapshot().attack,null)
      assert.equal(member.target.actor.hp,199)
      const wrongSide=c.clone();wrongSide[axis]-=side*5
      assert.equal(f.safe.allowsSectionSegment(sectionId,member.target.actor.pos,wrongSide),false)
      const approach=f.safe.sectionApproach(sectionId,wrongSide)
      assert.ok((approach[axis]-c[axis])*side>0,'an old cohort never targets the other exit')
      member.target.restoreState({hp:200,alive:true});member.target.actor.pos.set(member.spawn.position.x,0,member.spawn.position.z);member.ai.reset()
    }
    const saved=director.capture();director.restore(saved);assert.deepEqual(director.capture().activeSections,saved.activeSections)
  }finally{director.dispose();f.cleanup()}
})

test('normal E controls raise/lower doors, guard a crouched player below the curtain and resume after clearance; motion/pause/restore are exact',()=>{
  const f=fixture()
  try{
    const zone=CH2_SAFE_ZONES[0],entrance=zone.entrances[0],c=center(entrance),control=c.clone().add(v(.72,.0,-.13)).setY(1.02)
    f.place(c.clone().add(v(0,0,-1.2)).setY(0),{facing:control})
    assert.equal(f.press(),true)
    f.tick(.4);assert.equal(f.safe.capture().rooms[0].doors[0].progress,.5)
    const mid=json(f.safe.capture());f.safe.reset();f.safe.restore(mid);assert.deepEqual(json(f.safe.capture()),mid)
    f.g.game.state='paused';f.tick(.4);assert.deepEqual(json(f.safe.capture()),mid);f.g.game.state='playing';f.tick(.4)
    assert.equal(f.safe.capture().rooms[0].doors[0].progress,1)
    f.release();assert.equal(f.press(),true)
    f.place(c.clone().setY(.172),{crouch:true});f.tick(.8)
    assert.equal(f.safe.capture().rooms[0].doors[0].progress,1);assert.equal(f.safe.capture().rooms[0].doors[0].held,true)
    const held=json(f.safe.capture());f.safe.restore(held);assert.deepEqual(json(f.safe.capture()),held)
    f.place(v(zone.x,.172,zone.z));f.tick(.8)
    assert.equal(f.safe.capture().rooms[0].doors[0].progress,0)
  }finally{f.cleanup()}
})

test('safe entry requires supported actual feet; all three supplies refill owned rifles before the checkpoint callback',()=>{
  const f=fixture()
  try{
    for(const [index,zone] of CH2_SAFE_ZONES.entries()){
      f.slots.rifle.ammo=7;f.slots.rifle.reserve=3
      f.place(v(zone.x,.172,zone.z));f.g.player.vel.x=1;f.tick(0);assert.equal(f.safe.capture().rooms[index].entered,false)
      f.g.player.vel.set(0,0,0);f.g.player.onGround=false;f.tick(0);assert.equal(f.safe.capture().rooms[index].entered,false)
      f.g.player.onGround=true;f.g.player.pos.y=0;f.tick(0);assert.equal(f.safe.capture().rooms[index].entered,false)
      f.place(v(zone.x,.172,zone.z));f.tick(0);assert.equal(f.safe.capture().rooms[index].entered,true)
      const station=v(...f.safe.snapshot().rooms[index].station);f.place(v(zone.x,.172,zone.z),{facing:station})
      assert.equal(f.press(),true);assert.equal(f.press(),false)
      const expected=[12,30,42][index];assert.equal(f.slots.pistol.reserve,expected)
      assert.equal(f.slots.pistol.ammo,4);assert.deepEqual(f.slots.rifle,{owned:true,ammo:40,reserve:160},zone.id);assert.equal(f.g.player.health,83)
      const callback=f.commits.at(-1)
      assert.deepEqual(callback.event,{kind:'ammo',id:zone.id});assert.equal(callback.state.rooms[index].consumed,true);assert.equal(callback.equipment.slots.pistol.reserve,expected)
      assert.deepEqual(callback.equipment.slots.rifle,{owned:true,ammo:40,reserve:160})
      assert.equal(f.safe.snapshot().rooms[index].pickupVisible,false)
      const saved=json(f.safe.capture()),before=json(f.slots),calls=f.calls.length,commits=f.commits.length
      f.safe.restore(saved);f.safe.restore(saved);assert.deepEqual(f.slots,before);assert.equal(f.calls.length,calls);assert.equal(f.commits.length,commits)
      evidence.ammo.push({id:zone.id,callback})
    }
    assert.equal(f.slots.rifle.reserve,160)
    for(const reserve of [45,48]){
      f.safe.reset();f.slots.pistol.reserve=reserve;Object.assign(f.slots.rifle,{owned:false,ammo:7,reserve:20})
      const z=CH2_SAFE_ZONES[2];f.place(v(z.x,.172,z.z));f.tick(0);f.place(f.g.player.pos,{facing:v(...f.safe.snapshot().rooms[2].station)})
      assert.equal(f.press(),true);assert.equal(f.slots.pistol.reserve,48);assert.deepEqual(f.slots.rifle,{owned:false,ammo:7,reserve:20});assert.equal(f.safe.capture().rooms[2].consumed,true)
    }
    for(const reserve of [155,160]){
      f.safe.reset();f.slots.rifle.owned=true;f.slots.rifle.reserve=reserve
      const z=CH2_SAFE_ZONES[2];f.place(v(z.x,.172,z.z));f.tick(0);f.place(f.g.player.pos,{facing:v(...f.safe.snapshot().rooms[2].station)})
      assert.equal(f.press(),true);assert.equal(f.slots.rifle.reserve,160);assert.equal(f.slots.rifle.ammo,40)
    }
    f.safe.reset();f.slots.pistol.owned=f.slots.rifle.owned=false;const z=CH2_SAFE_ZONES[0];f.place(v(z.x,.172,z.z));f.tick(0);f.place(f.g.player.pos,{facing:v(...f.safe.snapshot().rooms[0].station)});const count=f.calls.length
    assert.equal(f.press(),true);assert.equal(f.calls.length,count);assert.equal(f.slots.pistol.owned,false)
  }finally{f.cleanup()}
})

test('illegal E, repeated same-frame calls, held E, behind/wall/range/pause/death/modal inputs never grant; invalid captures do not partially write',()=>{
  const f=fixture()
  try{
    const z=CH2_SAFE_ZONES[0],station=v(...f.safe.snapshot().rooms[0].station),home=v(z.x,.172,z.z)
    const aim=()=>f.place(home,{facing:station});aim();f.tick(0)
    for(const mode of ['range','back','wall','paused','dead','disabled','modal']){
      aim();let wall=null
      if(mode==='range')f.place(home.clone().add(v(0,0,8)),{facing:station})
      if(mode==='back')f.g.player.forward.negate()
      if(mode==='wall'){const mid=home.clone().add(station).multiplyScalar(.5);wall=f.g.physics.addBox(mid.clone().add(v(-.05,-2,-.8)),mid.clone().add(v(.05,2,.8)));f.g.physics.build()}
      if(mode==='paused')f.g.game.state='paused'
      if(mode==='dead')f.g.player.alive=false
      if(mode==='disabled')f.g.player.enabled=false
      if(mode==='modal')f.setAllowed(false)
      assert.equal(f.press(),false,mode);assert.equal(f.calls.length,0,mode)
      f.g.game.state='playing';f.g.player.alive=f.g.player.enabled=true;f.setAllowed(true)
      if(wall){f.g.physics.removeBox(wall);f.g.physics.build()}
    }
    aim();assert.equal(f.press(),true);assert.equal(f.safe.interact(),false)
    f.tick();assert.equal(f.safe.interact(),false)
    const good=json(f.safe.capture()),clone=f.safe.validateCapture(good);clone.rooms[0].doors[0].progress=.5;assert.notDeepEqual(clone,good)
    const faults=[x=>x.rooms.pop(),x=>x.rooms[2].id=x.rooms[0].id,x=>x.rooms[2].doors.pop(),x=>x.rooms[2].doors[1].id=x.rooms[2].doors[0].id,
      x=>x.rooms[2].doors[1].progress=NaN,x=>x.rooms[2].doors[1].progress=Infinity,x=>x.rooms[2].doors[1].target=2,x=>x.rooms[2].consumed=true,x=>x.rooms[2].doors[1].held=true]
    for(const fault of faults){const bad=json(good);fault(bad);assert.throws(()=>f.safe.restore(bad),/Invalid/);assert.deepEqual(json(f.safe.capture()),good)}
    f.safe.reset();assert.equal(f.calls.length,2);assert.ok(f.safe.snapshot().rooms.every(r=>!r.entered&&!r.consumed&&r.pickupVisible))
  }finally{f.cleanup()}
})

test('real full36 GLB director: moving gates stop chase/lunge/Hit/crowd, contacts cannot enter or hurt inside, external records and restore first tick remain independent',()=>{
  const f=fixture(),bank={createVoice:()=>({play(){},update(){},stop(){},snapshot:()=>({}),dispose(){}})}
  const director=createChapter2InfectedDirector(f.g,{asset,bank,safeRooms:f.safe})
  try{
    assert.equal(director.members.length,36);assert.equal(director.members.filter(m=>m.spawn.omniscientTracking).length,9)
    const member=director.members.find(m=>m.spawn.omniscientTracking),actor=member.target.actor
    const dead=director.members.find(m=>m!==member);dead.target.actor.damage(200,dead.target.actor.pos,v(1,0,0),'body');director.update(.01)
    const ids=director.members.map(m=>m.target.actor)
    for(const zone of CH2_SAFE_ZONES)for(const entrance of zone.entrances){
      const c=center(entrance),toward=v(entrance.inside.x,0,entrance.inside.z).sub(c).setY(0).normalize()
      const outer=c.clone().addScaledVector(toward,-.65).setY(0),inner=c.clone().addScaledVector(toward,1).setY(.172)
      for(const progress of [0,.5,1]){
        f.stateDoor(entrance.id,progress,1);actor.pos.copy(outer);member.target.restoreState({hp:200,alive:true});member.ai.reset()
        f.place(inner,{crouch:true});f.g.player.health=83;const health=f.g.player.health
        const spec={clip:INFECTED_CLIPS['Lunge Attack'].index,duration:1.46,contactStart:0,contactEnd:.9,damage:15,range:1.65,lungeSpeed:2.4}
        assert.equal(member.target.beginAttack(spec),false,'protected room rejects immediate contact')
        // An attack begun outside before the player crosses is cancelled only
        // by geometry/contact checks, not by disabling or deleting its actor.
        f.place(outer.clone().addScaledVector(toward,.2));const beganOutside=member.target.beginAttack(spec);if(progress===1)assert.equal(beganOutside,true,`${entrance.id}: pre-entry lunge never began`);f.place(inner,{crouch:true})
        const afterOutside=f.g.player.health
        member.target.update(.25);assert.equal(f.g.player.health,afterOutside)
        director.update(.05);assert.equal(member.ai.snapshot().state,'CHASE')
        actor.damage(1,actor.pos,v(1,0,0),'body')
        const start=actor.pos.clone();for(let i=0;i<8;i++){director.update(.05);assert.equal(f.safe.contains(actor.pos),null)}
        assert.equal(actor.hp,199);assert.equal(actor.alive,true);assert.equal(member.ai.snapshot().stagger.from,'CHASE');assert.ok(actor.pos.distanceTo(start)<=6.4*.4+.001)
        assert.equal(f.g.player.health,afterOutside)
        const saved=json(director.capture()),safeSaved=json(f.safe.capture()),inventory=json(f.slots)
        f.safe.restore(safeSaved);director.restore(saved);director.update(.05)
        assert.equal(f.safe.contains(actor.pos),null);assert.equal(f.g.player.health,afterOutside);assert.equal(actor.hp,199);assert.deepEqual(f.slots,inventory)
        assert.equal(director.members.length,36);assert.equal(dead.target.actor.alive,false);assert.equal(dead.target.actor.hp,0);assert.ok(director.members.every((m,i)=>m.target.actor===ids[i]));assert.ok(director.members.every(m=>!f.safe.contains(m.target.actor.pos)))
        const bad=json(director.capture());bad.members[0].position=[zone.x,.172,zone.z];assert.throws(()=>director.validateCapture(bad),/Invalid/)
        evidence.combat.push({id:entrance.id,progress,healthBefore:health,healthAfterOutside:afterOutside,healthAfterInside:f.g.player.health,actor:{id:actor.id,hp:actor.hp,position:actor.pos.toArray()},count:director.members.length})
      }
    }
    // Optional navigation rejects standing routes through the actual raised
    // shutter even though native 2D nav permits the crouched player's passage.
    const z=CH2_SAFE_ZONES[0],e=z.entrances[0];f.stateDoor(e.id,1)
    const nav=createChapter2Navigation(f.g,{safeRooms:f.safe}),from=v(e.outside.x,0,e.outside.z),to=v(e.inside.x,.172,e.inside.z)
    assert.equal(nav.findPath(from,to),null);const approach=f.safe.enemyApproach(from,to);assert.ok(approach);assert.equal(f.safe.contains(approach),null);assert.ok(nav.findPath(from,approach));nav.dispose()
  }finally{director.dispose();f.cleanup()}
})

test('optional standing planner respects gate state and retains default diagnostic crouch-nav paths without modifying native nav or its budget',()=>{
  const f=fixture(),zone=CH2_SAFE_ZONES[0],entrance=zone.entrances[0],from=v(entrance.outside.x,0,entrance.outside.z),to=v(entrance.inside.x,.172,entrance.inside.z)
  const nativeFind=f.g.physics.nav.findPath,plain=createChapter2Navigation(f.g),protectedNav=createChapter2Navigation(f.g,{safeRooms:f.safe})
  try{
    f.stateDoor(entrance.id,1)
    assert.ok(plain.findPath(from,to),'unconfigured diagnostic retains native 2D route')
    assert.equal(protectedNav.findPath(from,to),null,'standing infected cannot follow crouch-only passage')
    const apron=f.safe.enemyApproach(from,to)
    assert.ok(protectedNav.findPath(from,apron),'private known target still has an exterior approach')
    assert.equal(f.g.physics.nav.findPath,nativeFind);assert.equal(f.g.physics.nav._grid().cell,.5)
    f.stateDoor(entrance.id,0);assert.equal(f.g.physics.nav.clearLine(from,to),false)
    f.stateDoor(entrance.id,1);assert.ok(plain.findPath(from,to),'live validation does not retain a stale closed door')
  }finally{plain.dispose();protectedNav.dispose();f.cleanup()}
})
