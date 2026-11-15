import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { nativeFixture, loadChapter2, frozenB0 } from './campaign-ch2.check.mjs'
import { loadInfectedAsset } from './character-assets.mjs'
import { CH2_INFECTED_TUNING as tuning } from './campaign-ch2-infected.mjs'
import { createChapter2InfectedDirector } from './campaign-ch2-director.mjs'
import { CH2_INFECTED_DEPLOYMENT } from './campaign-ch2-deployment.mjs'
import { CH2_SPAWNS, CH2_SAFE_ZONES, CH2_SECTIONS, CH2_TRAVERSAL_ROUTES } from './campaign-ch2-layout.mjs'
import { INFECTED_CLIPS } from './character-clips.mjs'

// Real r180/model/mixers/nav/capsules, no browser or route suite. Texture
// decoding, audio and player are doubles. Relocations below are test fixtures.
await fs.mkdir(new URL('../../artifacts/harbor/ch2-completion-2026-11-13/b1b-full-ai/',import.meta.url),{recursive:true})
const {g:native,T}=await nativeFixture(),physics=native.physics
const asset=await loadInfectedAsset(T,{bytes:await fs.readFile(new URL('../../assets/harbor/infected/丧尸.glb',import.meta.url)),decodeImage:async()=>({width:2048,height:2048,close(){}})})
after(()=>asset.dispose())
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z)
function fixture(sectionId='ch2.s1',{world=false,enabled=true,staged=false,safeRooms=null}={}) {
  if(!world){for(const box of [...physics.boxes])physics.removeBox(box);physics.build()}
  const listeners=new Map(),voices=new Set()
  const events={on(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn)},off(name,fn){listeners.get(name)?.delete(fn)},emit(name,event){for(const fn of listeners.get(name)||[])fn(event)}}
  const g={THREE:T,physics,scene:new T.Scene(),events,game:{state:'playing',run:{time:0}},enemies:{raycast:()=>null},
    player:{pos:v(-56.5,0,-285.5),eye:v(-56.5,1.68,-285.5),vel:v(),alive:true,enabled:true,health:10000,speed:0,onGround:true,crouching:false,damage(amount){this.health-=amount}}}
  const originalRaycast=g.enemies.raycast,originalMove=physics.moveCapsule
  let borrowedDisposals=0
  const bank={createVoice(){let disposed=false,active=false,kind=null;const voice={play(next){active=true;kind=next},update(){},stop(){active=false},snapshot:()=>({disposed,active,kind}),dispose(){disposed=true;active=false;voices.delete(voice)}};voices.add(voice);return voice},dispose(){borrowedDisposals++}}
  const director=createChapter2InfectedDirector(g,{sectionId,asset,bank,enabled,staged,safeRooms})
  const player=(x,z)=>{g.player.pos.set(x,0,z);g.player.eye.copy(g.player.pos).y+=1.68}
  const tick=(count=1,dt=.05)=>{for(let i=0;i<count;i++){g.game.run.time+=dt;director.update(dt)}}
  return {g,director,bank,listeners,voices,originalRaycast,originalMove,player,tick,borrowedDisposals:()=>borrowedDisposals,
    cleanup(){director.dispose();assert.equal(g.enemies.raycast,originalRaycast);assert.equal(physics.moveCapsule,originalMove);assert.equal(voices.size,0);assert.equal(borrowedDisposals,0);assert.equal(g.scene.children.length,0);for(const set of listeners.values())assert.equal(set.size,0)}}
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)
function assertSeparated(members) {
  for(const [i,a] of members.entries())for(const b of members.slice(i+1))if(a.target.actor.alive && b.target.actor.alive)assert.ok(distance(a.target.actor.pos,b.target.actor.pos)>=.64-.0001,`${a.spawn.id}/${b.spawn.id} overlap`)
}
function movementLimit(member,start,player) {
  const ai=member.ai.snapshot()
  if(ai.state==='STAGGER')return ai.stagger.speed
  if(ai.state==='ATTACK')return tuning.lungeSpeed
  if(ai.state==='CHASE'){
    assert.ok(ai.pursuit.locked,'fast pursuit requires private tracking or actual visibility')
    const expected=distance(start,player)>tuning.sprintDistance?tuning.sprintSpeed:tuning.chaseSpeed
    assert.equal(ai.pursuit.nominalSpeed,expected,'speed follows actual pre-step player distance, not approach offset')
    return ai.pursuit.nominalSpeed
  }
  return ai.state==='INVESTIGATE'?tuning.investigateSpeed:ai.state==='WANDER'?tuning.walkSpeed:0
}
function put(member,x,z,yaw=0){member.instance.root.position.set(x,0,z);member.instance.root.rotation.y=yaw;member.ai.reset()}
const spec={clip:INFECTED_CLIPS['Lunge Attack'].index,duration:INFECTED_CLIPS['Lunge Attack'].duration,contactStart:0,contactEnd:.9,damage:15,range:1.65,lungeSpeed:2.4}

test('staged campaign enables twelve at a time and permanently retires all actors on chapter completion',()=>{
  const f=fixture(null,{enabled:false,staged:true})
  try {
    const d=f.director,active=()=>d.members.filter(m=>m.target.actor.active).length
    d.setEnabled(true);assert.equal(active(),12,'later sections must remain hidden until a physical room exit')
    assert.equal(d.activateSection('ch2.s4'),false)
    assert.equal(d.activateSection('ch2.s2'),true);assert.equal(active(),24)
    assert.equal(d.activateSection('ch2.s2'),false);assert.equal(d.activateSection('ch2.s3'),true);assert.equal(active(),36)
    d.members[0].target.actor.damage(34,v(),v(1,0,0),'body');f.tick()
    const saved=d.capture();d.finish();assert.equal(active(),0)
    assert.ok(d.members.every(m=>!m.instance.root.visible&&!m.voice.snapshot().active))
    const completed=d.capture();d.setEnabled(true);f.tick(2);assert.equal(active(),0)
    d.restore(completed);assert.equal(active(),0);assert.equal(d.snapshot().finished,true)
    d.restore(saved);assert.equal(active(),36);assert.equal(d.members[0].target.actor.hp,166)
    d.setEnabled(false);d.reset();assert.equal(d.snapshot().finished,false);assert.equal(active(),0)
    d.setEnabled(true);assert.equal(active(),12)
  }finally{f.cleanup()}
})

test('each section creates only its twelve IDs, preserving the original six with independent skeletons, mixers, voices and health',()=>{
  for(const sectionId of ['ch2.s1','ch2.s2','ch2.s3']) {
    const f=fixture(sectionId)
    try {
      const members=f.director.members
      assert.equal(members.length,12);assert.equal(asset.snapshot().liveInstances,12)
      assert.deepEqual(members.map(m=>m.spawn),CH2_INFECTED_DEPLOYMENT.filter(s=>s.sectionId===sectionId))
      assert.deepEqual(members.slice(0,6).map(m=>m.spawn.id),frozenB0.spawns.filter(s=>s.sectionId===sectionId).map(s=>s.id))
      assert.deepEqual(CH2_SPAWNS,frozenB0.spawns,'runtime relocation must leave the environment fixture exact')
      assert.equal(members.filter(m=>m.spawn.mode==='omniscient-tracker').length,3)
      assert.equal(members.filter(m=>m.spawn.mode==='ordinary').length,9)
      for(const member of members){assert.deepEqual([...member.instance.root.position.toArray()],Object.values(member.spawn.position));assert.equal(member.target.actor.id,member.spawn.id)}
      for(const key of ['instance','animation','voice','target','ai'])assert.equal(new Set(members.map(m=>m[key])).size,12)
      assert.equal(new Set(members.map(m=>m.instance.skeleton)).size,12)
      assert.equal(new Set(members.map(m=>m.instance.skeleton.bones[0])).size,12)
      members[0].target.actor.damage(15,members[0].target.actor.pos,v(1,0,0),'body')
      assert.deepEqual(members.map(m=>m.target.actor.hp),[185,...Array(11).fill(200)])
      members[0].animation.update(.1);assert.equal(members[1].animation.snapshot().mixerTime,0)
      if(sectionId==='ch2.s1')assert.equal(members[0].instance.root.rotation.y,Math.PI/2)
      assert.throws(()=>createChapter2InfectedDirector(f.g,{sectionId:'ch2.s2',asset,bank:f.bank}),/already owns/)
      assert.throws(()=>createChapter2InfectedDirector(f.g,{sectionId:'s1',asset,bank:f.bank}),/Invalid/)
      assert.equal(asset.snapshot().liveInstances,12)
    }finally{f.cleanup();assert.equal(asset.snapshot().liveInstances,0)}
  }
})

test('one director tick advances each mixer once without history snapshots; death/return never refill; explicit reset preserves player',()=>{
  const f=fixture()
  try {
    const members=f.director.members,saved=members.map(m=>m.ai.snapshot)
    for(const m of members)m.ai.snapshot=()=>{throw Error('no per-frame event copies')}
    f.tick(1,.01)
    for(const [i,m] of members.entries()){m.ai.snapshot=saved[i];assert.equal(m.animation.snapshot().mixerTime,.01)}
    const dead=members[2];dead.target.actor.damage(200,dead.target.actor.pos,v(1,0,0),'body');f.tick()
    assert.equal(dead.ai.snapshot().state,'DEAD');assert.equal(f.director.snapshot().alive,11)
    const bones=members.map(m=>m.instance.skeleton)
    f.player(-40,-200);f.tick();f.player(-56.5,-285.5);f.tick()
    assert.equal(dead.target.actor.hp,0);assert.deepEqual(members.map(m=>m.instance.skeleton),bones)
    const player={position:f.g.player.pos.toArray(),hp:f.g.player.health}
    f.director.reset()
    assert.deepEqual(f.g.player.pos.toArray(),player.position);assert.equal(f.g.player.health,player.hp)
    for(const member of members){assert.equal(member.target.actor.hp,200);assert.deepEqual([...member.target.actor.pos.toArray()],Object.values(member.spawn.position));assert.equal(member.ai.snapshot().lastHeard,null)}
    assert.equal(f.director.snapshot().resets,1)
  }finally{f.cleanup()}
})

test('partial construction failure releases only owned resources and permits a clean new director',()=>{
  const f=fixture();f.director.dispose()
  let created=0
  const bank={createVoice(){if(++created===3)throw Error('voice allocation fixture');return f.bank.createVoice()},dispose(){throw Error('borrowed bank must survive')}}
  try {
    assert.throws(()=>createChapter2InfectedDirector(f.g,{sectionId:'ch2.s2',asset,bank}),/voice allocation/)
    assert.equal(asset.snapshot().liveInstances,0);assert.equal(asset.snapshot().closing,false)
    assert.equal(f.g.enemies.raycast,f.originalRaycast);assert.equal(physics.moveCapsule,f.originalMove)
    assert.equal(f.voices.size,0);assert.equal(f.g.scene.children.length,0)
    const next=createChapter2InfectedDirector(f.g,{sectionId:'ch2.s3',asset,bank:f.bank})
    assert.equal(next.members.length,12);next.dispose()
  }finally{f.cleanup()}
})

test('actual GLB Hit remains the current one-shot while native crowd movement continues; lethal damage stops it',()=>{
  const f=fixture()
  try{
    const a=f.director.members[0]
    put(a,-100,-285.5);f.player(-100,-295)
    f.tick(16);assert.equal(a.ai.snapshot().state,'CHASE')
    const samples=[],speed=a.ai.snapshot().pursuit.nominalSpeed
    assert.equal(speed,6.4)
    for(let i=0;i<8;i++){
      const before=a.target.actor.pos.clone(),mixer=a.animation.snapshot().mixerTime
      a.target.actor.damage(1,a.target.actor.pos,v(1,0,0),'body');f.tick()
      const animation=a.animation.snapshot(),ai=a.ai.snapshot()
      assert.equal(animation.index,INFECTED_CLIPS.Hit.index);assert.equal(animation.loop,false)
      assert.equal(ai.state,'STAGGER');assert.ok(ai.motion.moving)
      assert.ok(Math.abs(distance(before,a.target.actor.pos)-speed*.9*.05)<.001)
      assert.ok(Math.abs(animation.mixerTime-mixer-.05)<1e-8)
      samples.push({position:ai.position,stagger:ai.stagger,animation})
    }
    const before=a.target.actor.pos.clone()
    a.target.actor.damage(192,a.target.actor.pos,v(1,0,0),'body');f.tick(4)
    assert.equal(distance(before,a.target.actor.pos),0);assert.equal(a.ai.snapshot().state,'DEAD')
    assert.equal(a.animation.snapshot().index,INFECTED_CLIPS.Death.index)
    assert.equal(a.target.snapshot().attack,null)
    assert.equal(f.director.members[1].target.actor.hp,200)
    assert.equal(samples.length,8)
  }finally{f.cleanup()}
})

test('three trackers privately pursue a hidden player; a live peer blocks first attack without unmuting',()=>{
  const f=fixture()
  try{
    f.player(-90,-285.5)
    f.tick(2)
    for(const m of f.director.members){
      const s=m.ai.snapshot()
      if(m.spawn.omniscientTracking){assert.equal(s.mode,'omniscient-tracker');assert.deepEqual(s.trackingPosition,f.g.player.pos.toArray());assert.equal(s.state,'CHASE');assert.equal(s.silent,true)}
      else {assert.equal(s.trackingPosition,null);assert.equal(s.mode,'ordinary')}
    }
    const tracker=f.director.members[9],peer=f.director.members[8]
    put(tracker,-100,-285.5);put(peer,-99.1,-285.5);f.player(-98,-285.5)
    for(let i=0;i<4;i++){
      // Advance just the tracker so the blocking live peer stays in the doorway.
      f.g.game.run.time+=.05;tracker.ai.update(.05)
      assert.equal(tracker.ai.snapshot().firstAttackStarted,false)
      assert.equal(tracker.voice.snapshot().active,false)
      assertSeparated(f.director.members)
    }
    assert.ok(f.director.snapshot().crowd.attackWaits>0)
    peer.target.actor.damage(200,peer.target.actor.pos,v(1,0,0),'body')
    for(let i=0;i<12 && !tracker.ai.snapshot().firstAttackStarted;i++)tracker.ai.update(.05)
    assert.equal(tracker.ai.snapshot().firstAttackStarted,true)
    assert.equal(tracker.voice.snapshot().kind,'attack');assert.equal(tracker.voice.snapshot().active,true)
    assert.equal(f.g.player.health,10000,'2m lunge start is outside actual contact range')
  }finally{f.cleanup()}
})

test('twelve credible perceptions choose distinct reachable approaches and real movement never overlaps; hidden peers receive no broadcast',()=>{
  const f=fixture()
  try {
    f.player(-100,-286)
    for(const [i,m]of f.director.members.entries()){
      const angle=i*Math.PI/6,x=-100+Math.cos(angle)*5,z=-286+Math.sin(angle)*5
      put(m,x,z,Math.atan2(x+100,z+286))
    }
    for(let i=0;i<50;i++){
      const before=f.director.members.map(m=>m.target.actor.pos.clone());f.tick();assertSeparated(f.director.members)
      for(const [j,m]of f.director.members.entries())assert.ok(distance(before[j],m.target.actor.pos)<=movementLimit(m,before[j],f.g.player.pos)*.05+.0001)
    }
    const snap=f.director.snapshot()
    assert.ok(new Set(snap.members.map(m=>JSON.stringify(m.crowd.approach)).filter(p=>p!=='null')).size>=3)
    assert.ok(snap.members.every(m=>m.ai.lastSeen))
    // Hide an uninformed stationary post behind original solid collision.
    f.director.reset();const quiet=f.director.members[3],position=quiet.target.actor.pos
    f.player(position.x+3,position.z)
    physics.addBox(v(position.x+1,-1,position.z-10),v(position.x+1.2,4,position.z+10));physics.build()
    quiet.instance.root.rotation.y=-Math.PI/2
    f.g.events.emit('weapon:fire',{weapon:'pistol',origin:f.g.player.eye.clone(),dir:v(1,0,0)})
    f.tick(10)
    assert.equal(quiet.ai.snapshot().lastSeen,null);assert.equal(quiet.ai.snapshot().lastHeard,null)
    assert.equal(quiet.ai.snapshot().state,'WANDER')
  }finally{f.cleanup()}
})

test('a blocked lunge and walking share swept collision; narrow lane stops, open space detours, corpses do not seal the lane',()=>{
  for(const narrow of [true,false]) {
    const f=fixture()
    try {
      const [a,b,left,right,...others]=f.director.members
      for(const member of others)member.target.actor.damage(200,member.target.actor.pos,v(1,0,0),'body')
      put(a,-104,-285.75);put(b,-103,-283)
      f.player(-101.3,-285.75)
      if(narrow){
        physics.addBox(v(-108,0,-290),v(-96,3,-286.85));physics.addBox(v(-108,0,-284.65),v(-96,3,-281));physics.build()
        put(left,-103.1,-285.05);put(right,-103.1,-286.45)
      }else for(const member of [left,right])member.target.actor.damage(200,member.target.actor.pos,v(1,0,0),'body')
      assert.ok(physics.nav.isWalkable(-104,-285.75),'lane centre must be valid in native grid')
      assert.ok(a.target.beginAttack(spec));put(b,-103.1,-285.75)
      let previous=a.target.actor.pos.clone()
      for(let i=0;i<30;i++){
        a.target.update(.05);assertSeparated([a,b])
        assert.ok(distance(previous,a.target.actor.pos)<=2.4*.05+.0001);previous.copy(a.target.actor.pos)
      }
      const crowd=f.director.snapshot().crowd
      if(narrow){assert.ok(a.target.actor.pos.x<=b.target.actor.pos.x-.64+.001);assert.ok(crowd.blocked>0);assert.ok(crowd.yields>0)}
      else {assert.ok(crowd.detours+crowd.yields>0);assert.ok(Math.abs(a.target.actor.pos.z-b.target.actor.pos.z)>.3)}
      b.target.actor.damage(200,b.target.actor.pos,v(1,0,0),'body');a.target.cancelAttack();a.ai.reset()
      // A completed yield may put the actor a full .9m farther back. Resume
      // its real pursuit rather than assuming one finite lunge covers that.
      for(let i=0;i<40;i++){f.g.game.run.time+=.05;a.ai.update(.05)}
      assert.ok(a.target.actor.pos.x>b.target.actor.pos.x+.1,`dead body cannot seal lane: ${JSON.stringify({narrow,a:a.target.actor.pos.toArray(),b:b.target.actor.pos.toArray(),crowd:f.director.snapshot().crowd})}`)
    }finally{f.cleanup()}
  }
})

test('native player capsule is blocked by live members and released by death; dispose restores original movement',()=>{
  const f=fixture()
  try {
    const [a,...others]=f.director.members
    for(const member of others)member.target.actor.damage(200,member.target.actor.pos,v(1,0,0),'body')
    put(a,-100,-285.5);f.player(-102,-285.5)
    physics.moveCapsule(f.g.player.pos,v(8,0,0),.5,.32,1.8,true)
    assert.ok(f.g.player.pos.x<=-100.64+.001);assert.ok(f.g.player.pos.x>=-100.65)
    a.target.actor.damage(200,a.target.actor.pos,v(1,0,0),'body')
    physics.moveCapsule(f.g.player.pos,v(4,0,0),.5,.32,1.8,true)
    assert.ok(f.g.player.pos.x>-100)
  }finally{f.cleanup()}
})

test('zero-start contact rechecks a live peer during the lunge; an unobstructed window delivers once',()=>{
  const f=fixture()
  try {
    const [a,b,...others]=f.director.members
    for(const member of others)member.target.actor.damage(200,member.target.actor.pos,v(1,0,0),'body')
    put(a,-100,-285.5);put(b,-98.6,-283.5);f.player(-97.4,-285.5)
    const health=f.g.player.health
    assert.ok(a.target.beginAttack(spec));a.target.update(.1)
    put(b,-98.6,-285.5);a.target.update(.4)
    assert.equal(f.g.player.health,health,'a newly blocking peer must stop contact too')
    put(b,-98.6,-283.5);a.target.update(.2);a.target.update(.1)
    assert.equal(f.g.player.health,health-15)
  }finally{f.cleanup()}
})

test('pause, reset and arbitrary disposal cannot deliver queued contacts',()=>{
  const f=fixture()
  try {
    const a=f.director.members[0];f.player(a.spawn.position.x-2.6,a.spawn.position.z)
    assert.ok(a.target.beginAttack(spec));a.target.update(.1)
    const health=f.g.player.health
    f.g.game.state='paused';f.g.events.emit('game:state',{state:'paused'});f.tick()
    f.g.game.state='playing';f.g.events.emit('game:state',{state:'playing'});f.tick()
    assert.equal(f.g.player.health,health)
    assert.ok(a.target.beginAttack(spec));a.target.update(.1);f.director.reset();f.tick();f.player(a.spawn.position.x-2.6,a.spawn.position.z)
    assert.equal(f.g.player.health,health)
    assert.ok(a.target.beginAttack(spec));a.target.update(.1);f.director.dispose();f.director.update(1)
    assert.equal(f.g.player.health,health)
  }finally{f.cleanup()}
})

test('real CH2 geometry: all 36 fixed deployments are clear and connect to local player aisles; twelve GLBs take legal native steps',async t=>{
  const {build}=await loadChapter2(),environment=build(native);physics.build()
  const report=[],clearance=[]
  try {
    assert.equal(CH2_INFECTED_DEPLOYMENT.length,36);assert.equal(new Set(CH2_INFECTED_DEPLOYMENT.map(s=>s.id)).size,36)
    assert.deepEqual(CH2_SPAWNS,frozenB0.spawns,'the original 18-point fixture stays exact')
    for(const sectionId of ['ch2.s1','ch2.s2','ch2.s3']) {
      const f=fixture(sectionId,{world:true})
      try {
        for(const member of f.director.members){
          const position=member.target.actor.pos,probe=position.clone()
          assert.equal(physics.nav.isWalkable(position.x,position.z),true,member.spawn.id)
          physics.moveCapsule(probe,v(),0,.32,1.8,true)
          assert.equal(distance(position,probe),0,`${member.spawn.id}: no horizontal spawn ejection`)
          const section=CH2_SECTIONS.find(s=>s.id===sectionId),bounds=section.bounds
          assert.ok(position.x>=bounds.minX && position.x<=bounds.maxX && position.z>=bounds.minZ && position.z<=bounds.maxZ)
          for(const zone of CH2_SAFE_ZONES){const b=zone.bounds;assert.equal(position.x>=b.minX-.5 && position.x<=b.maxX+.5 && position.z>=b.minZ-.5 && position.z<=b.maxZ+.5,false,`${member.spawn.id}: safe-room clearance`)}
          const start=sectionId==='ch2.s1'?v(-56.5,0,-285.5):v(-120.5,0,sectionId==='ch2.s2'?-271.53:-205.53)
          if(member.spawn.omniscientTracking)assert.ok(distance(position,start)>10,'no tracker spawns against the diagnostic player')
          const candidates=[...CH2_TRAVERSAL_ROUTES[section.routeId],...section.branchIds.flatMap(id=>CH2_TRAVERSAL_ROUTES[id])]
            .map(p=>v(p.x,p.y,p.z)).filter(p=>distance(position,p)>.8 && distance(position,p)<12 && physics.nav.isWalkable(p.x,p.z))
            .sort((a,b)=>distance(position,a)-distance(position,b))
          let local=null
          for(const goal of candidates){
            const path=physics.nav.findPath(position,goal)
            if(!path?.length || distance(path.at(-1),goal)>.05)continue
            let from=position,valid=true
            for(const point of path){if(!physics.nav.isWalkable(point.x,point.z)||!physics.nav.clearLine(from,point)){valid=false;break}from=point}
            if(valid){local={goal:goal.toArray(),path:path.map(p=>p.toArray())};break}
          }
          assert.ok(local,`${member.spawn.id}: exact-endpoint native local path required`)
          clearance.push({...member.spawn,groundY:probe.y,horizontalEjection:distance(position,probe),local})
        }
        const a=f.director.members[0],start=a.target.actor.pos.clone()
        // A local gun at its own walkable position is a diagnostic stimulus,
        // not an end-to-end encounter; actor still has .7s alert before moving.
        const aim=sectionId==='ch2.s1'?v(-80.85714285714286,0,-291.42857142857144):sectionId==='ch2.s2'?v(-125.9,0,-250.2):v(-105.5,0,-185.5)
        assert.ok(physics.nav.isWalkable(aim.x,aim.z),'local observer must be on a real player aisle')
        assert.ok(physics.lineOfSight(start.clone().add(v(0,1.1,0)),aim.clone().add(v(0,1.68,0))),'local gun has actual unobstructed LOS')
        f.player(aim.x,aim.z);f.g.events.emit('weapon:fire',{weapon:'pistol',origin:f.g.player.eye.clone(),dir:v(0,0,-1)})
        for(let i=0;i<22;i++){
          const previous=f.director.members.map(m=>m.target.actor.pos.clone());f.tick();assertSeparated(f.director.members)
          for(const [j,m]of f.director.members.entries())assert.ok(distance(previous[j],m.target.actor.pos)<=movementLimit(m,previous[j],f.g.player.pos)*.05+.0001)
        }
        assert.ok(a.ai.snapshot().lastHeard,'own local gun must be credible')
        assert.ok(a.ai.snapshot().motion.distance>.1,'actual fixed actor must execute native steps')
        report.push({sectionId,spawn:a.spawn.id,motion:a.ai.snapshot().motion,positions:f.director.members.map(m=>({id:m.spawn.id,position:m.target.actor.pos.toArray(),state:m.ai.snapshot().state}))})
      }finally{f.cleanup()}
    }
    await fs.writeFile(new URL('../../artifacts/harbor/ch2-completion-2026-11-13/b1b-full-ai/spawn-clearance.json',import.meta.url),JSON.stringify({colliders:physics.boxes.length,clearance},null,2)+'\n')
    await fs.writeFile(new URL('../../artifacts/harbor/ch2-completion-2026-11-13/b1b-full-ai/native-local.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
    t.diagnostic(JSON.stringify({colliders:physics.boxes.length,report}))
  }finally{environment.dispose()}
})

test('full chapter owns exactly 36 stable instances; disable preserves facts and removes body/ray/sound interaction',()=>{
  const f=fixture(null,{enabled:false})
  try{
    const d=f.director,m=d.members[0],initial=d.capture(),bones=d.members.map(m=>m.instance.skeleton)
    assert.equal(d.members.length,36);assert.equal(asset.snapshot().liveInstances,36)
    assert.deepEqual(d.members.map(m=>m.spawn.id),CH2_INFECTED_DEPLOYMENT.map(s=>s.id))
    assert.equal(d.members.filter(m=>m.spawn.omniscientTracking).length,9)
    assert.equal(new Set(d.members.map(m=>m.instance.mesh.geometry)).size,1)
    assert.equal(new Set(d.members.map(m=>m.instance.mesh.material)).size,1)
    f.tick(3);assert.deepEqual(d.capture(),initial)
    for(const member of d.members){assert.equal(member.instance.root.visible,false);assert.equal(member.target.actor.active,false);assert.equal(member.voice.snapshot().active,false)}
    d.setEnabled(true);m.target.actor.damage(15,m.target.actor.pos,v(1,0,0),'body')
    const before=d.capture();d.setEnabled(false);f.tick(10);d.setEnabled(true)
    assert.equal(m.target.actor.hp,185);assert.deepEqual(m.target.actor.pos.toArray(),before.members[0].position)
    assert.deepEqual(d.members.map(m=>m.instance.skeleton),bones)
    assert.equal(d.snapshot().enabled,true);assert.equal(d.snapshot().logicalActorCount,36)
    assert.throws(()=>createChapter2InfectedDirector(f.g,{sectionId:null,asset,bank:f.bank}),/already owns/)
  }finally{f.cleanup()}
})

test('full chapter sleep keeps hit surfaces and identity; damage wakes, trackers and existing threats still take native steps',async()=>{
  const f=fixture(null)
  const wall=physics.addBox(v(-162,0,-250),v(-60,4,-249),{surface:'metal'});physics.build()
  try{
    const d=f.director,m=d.members.find(m=>m.spawn.id==='ch2.s3.z3'),tracker=d.members.find(m=>m.spawn.id==='ch2.s1.z10')
    f.player(-100,-285.5);put(m,-100,-190.5)
    const instance=m.instance,skeleton=m.instance.skeleton
    const trackerStart=tracker.target.actor.pos.clone();f.tick(5)
    const sample=d.snapshot(),sleep=sample.members.find(s=>s.id===m.spawn.id)
    assert.equal(sleep.sleeping,true);assert.equal(m.instance.root.visible,true);assert.equal(m.target.actor.active,true)
    assert.equal(sleep.ai.lastSeen,null);assert.equal(sleep.ai.lastHeard,null);assert.equal(sleep.ai.trackingPosition,null)
    assert.ok(distance(trackerStart,tracker.target.actor.pos)>.1);assert.equal(tracker.ai.snapshot().state,'CHASE')
    assert.ok(sample.updates.animation<sample.updates.logical,'far animation is throttled independently of logic')
    // A ray from the actor's side of the wall can hit a technically sleeping
    // real GLB. Sleep never unregisters a target or changes its visible flag.
    let hit=null
    for(const y of [.6,.9,1.2]){const origin=m.target.actor.pos.clone().add(v(0,y,3));hit=f.g.enemies.raycast(origin,v(0,0,-1),5);if(hit?.enemy===m.target.actor)break}
    assert.equal(hit?.enemy,m.target.actor)
    m.target.actor.damage(15,hit.point,v(0,0,-1),'body');f.tick()
    assert.equal(m.target.actor.hp,185);assert.equal(m.ai.snapshot().state,'STAGGER')
    assert.equal(d.snapshot().members.find(s=>s.id===m.spawn.id).sleeping,false)
    assert.equal(m.instance,instance);assert.equal(m.instance.skeleton,skeleton)
    // An ordinary pursuer must keep investigating its actual old memory even
    // when the player departs beyond the sleep radius.
    const ordinary=d.members[0];put(ordinary,-100,-280);f.player(-100,-288);f.tick(16)
    assert.equal(ordinary.ai.snapshot().state,'CHASE');const known=ordinary.ai.snapshot().lastSeen
    f.player(-40,-190);const start=ordinary.target.actor.pos.clone();f.tick(3)
    assert.equal(ordinary.ai.snapshot().state,'INVESTIGATE');assert.ok(distance(start,ordinary.target.actor.pos)>0)
    assert.deepEqual(ordinary.ai.snapshot().lastSeen,known);assert.equal(ordinary.ai.snapshot().trackingPosition,null)
    await fs.writeFile(new URL('../../artifacts/harbor/ch2-completion-2026-11-13/b1b-full-ai/scheduling-local.json',import.meta.url),JSON.stringify({counts:{awake:sample.awakeCount,sleep:sample.sleepCount,dead:sample.deadCount},updates:sample.updates,sleep,tracker:tracker.ai.snapshot(),ordinary:ordinary.ai.snapshot()},null,2)+'\n')
  }finally{physics.removeBox(wall);f.cleanup()}
})

test('full chapter alerts have local recipient/cooldown budgets and never relay private tracker positions',()=>{
  const f=fixture(null)
  try{
    const d=f.director,sender=d.members[9],receivers=d.members.filter(m=>!m.spawn.omniscientTracking).slice(0,4)
    // Other actors stay away. All these ordinary actors face away from player.
    put(sender,-100,-280,Math.PI);f.player(-100,-286)
    for(const [i,m]of receivers.entries())put(m,-104-i,-280,Math.PI)
    // Tracker facing +Z cannot really see -Z. Its private knowledge is silent.
    sender.ai.update(.05)
    for(const m of receivers)assert.equal(m.ai.snapshot().lastHeard,null)
    assert.equal(d.snapshot().alerts.received,0)
    sender.instance.root.rotation.y=0;sender.ai.update(.05)
    const alerted=receivers.filter(m=>m.ai.snapshot().lastHeard?.kind==='alert')
    assert.equal(alerted.length,2);assert.equal(d.snapshot().alerts.received,2)
    for(const m of alerted)assert.deepEqual(m.ai.snapshot().lastHeard.position,f.g.player.pos.toArray())
    f.player(-40,-190);for(const m of alerted)m.ai.update(.05)
    assert.equal(d.snapshot().alerts.received,2,'received clues never rebroadcast')
    sender.ai.update(.05);assert.equal(d.snapshot().alerts.received,2,'sender cooldown')
    assert.equal(receivers[3].ai.snapshot().lastHeard,null)
  }finally{f.cleanup()}
})

test('full capture validates whole sets before mutation and restores hurt/dead/first-attack facts without rewards or old contact',async()=>{
  const f=fixture(null)
  try{
    const d=f.director,tracker=d.members[9],hurt=d.members[0],dead=d.members[1]
    put(tracker,-100,-280);f.player(-100,-282.4);tracker.ai.update(.05)
    assert.equal(tracker.ai.snapshot().firstAttackStarted,true);assert.ok(tracker.ai.snapshot().attack)
    hurt.target.actor.damage(37,hurt.target.actor.pos,v(1,0,0),'body')
    let kills=0;f.g.events.on('enemy:killed',()=>kills++)
    dead.target.actor.damage(200,dead.target.actor.pos,v(1,0,0),'body');assert.equal(kills,1)
    const saved=JSON.parse(JSON.stringify(d.capture())),identities=d.members.map(m=>m.instance),health=f.g.player.health
    assert.deepEqual(d.validateCapture(saved),saved)
    // Current dynamic occupancy must not invalidate a structurally legal save.
    const wall=physics.addBox(hurt.target.actor.pos.clone().add(v(-1,0,-1)),hurt.target.actor.pos.clone().add(v(1,3,1)),{surface:'metal'});physics.build()
    assert.doesNotThrow(()=>d.validateCapture(saved));physics.removeBox(wall);physics.build()
    const corruptions=[s=>s.members.pop(),s=>s.members.push(s.members[0]),s=>s.members[1].id=s.members[0].id,
      s=>s.members[0].position[0]=NaN,s=>s.enabled='yes',s=>s.members[0].hp=201,s=>s.members[0].alive=false,
      s=>s.members[0].mode='omniscient-tracker',s=>s.members[0].ai.lastSeen={position:[0,0,0],time:Infinity},
      s=>s.members[0].ai.firstAttackStarted=null,s=>s.members[0].animation.time=999,s=>s.members[0].sleeping=true]
    for(const corrupt of corruptions){const bad=structuredClone(saved);corrupt(bad);const before=d.capture();assert.throws(()=>d.restore(bad),/Invalid/);assert.deepEqual(d.capture(),before)}
    const rootBefore=[...hurt.target.actor.pos.toArray()];saved.members[0].position[0]+=1;assert.deepEqual([...hurt.target.actor.pos.toArray()],rootBefore);saved.members[0].position[0]-=1
    d.reset();assert.equal(hurt.target.actor.hp,200);assert.equal(tracker.ai.snapshot().firstAttackStarted,false)
    assert.equal(d.restore(saved),true);assert.deepEqual(d.members.map(m=>m.instance),identities)
    assert.equal(kills,1);assert.equal(hurt.target.actor.hp,163);assert.equal(dead.target.actor.alive,false);assert.equal(dead.target.actor.active,false)
    assert.equal(dead.animation.snapshot().index,INFECTED_CLIPS.Death.index);assert.ok(dead.animation.snapshot().finished)
    assert.equal(tracker.ai.snapshot().firstAttackStarted,true);assert.equal(tracker.ai.snapshot().silent,false)
    assert.equal(tracker.target.snapshot().attack,null);assert.equal(tracker.ai.snapshot().attack,null)
    for(let i=0;i<12;i++)tracker.ai.update(.05)
    assert.equal(f.g.player.health,health,'restore must not replay the old lunge contact while playing')
    assert.equal(tracker.target.snapshot().attack,null)
    assert.equal(tracker.voice.snapshot().active,true,'a restored unlocked tracker resumes its chase loop')
    const beforePose=dead.animation.updateCount();f.g.game.state='paused';f.g.events.emit('game:state',{state:'paused'});f.tick(20)
    assert.equal(f.g.player.health,health);assert.equal(dead.animation.updateCount(),beforePose)
    d.setEnabled(false);const disabled=d.capture();d.restore(disabled);assert.equal(d.snapshot().enabled,false)
    d.setEnabled(true);assert.equal(tracker.ai.snapshot().silent,false);assert.equal(hurt.target.actor.hp,163)
    await fs.writeFile(new URL('../../artifacts/harbor/ch2-completion-2026-11-13/b1b-full-ai/capture-local.json',import.meta.url),JSON.stringify({saved,restored:d.capture(),kills,health,invalidCases:corruptions.length},null,2)+'\n')
  }finally{for(const fn of f.listeners.get('enemy:killed')??[])f.g.events.off('enemy:killed',fn);f.cleanup()}
})

test('full real-world trackers keep private long goals and physically cross A/B in both directions without home bounds',async()=>{
  const {build}=await loadChapter2(),environment=build(native);physics.build()
  const f=fixture(null,{world:true}),report=[]
  try{
    const trackers=f.director.members.filter(m=>m.spawn.omniscientTracking)
    const starts=trackers.map(m=>m.target.actor.pos.clone());f.tick(6)
    await fs.writeFile(new URL('../../artifacts/harbor/ch2-completion-2026-11-13/b1b-full-ai/full-trackers-diagnostic.json',import.meta.url),JSON.stringify(trackers.map((m,i)=>({id:m.spawn.id,start:starts[i].toArray(),ai:m.ai.snapshot()})),null,2)+'\n')
    for(const [i,m]of trackers.entries()){
      assert.equal(m.ai.snapshot().state,'CHASE');assert.ok(distance(starts[i],m.target.actor.pos)>.01,m.spawn.id)
      assert.deepEqual(m.ai.snapshot().trackingPosition,f.g.player.pos.toArray())
      report.push({id:m.spawn.id,start:starts[i].toArray(),after:m.target.actor.pos.toArray(),navigation:m.ai.snapshot().navigation})
    }
    for(const m of f.director.members.filter(m=>!m.spawn.omniscientTracking))assert.equal(m.ai.snapshot().trackingPosition,null)
    const tracker=trackers[0],crossings=[]
    // Diagnostic fixture placement once per local channel; subsequent forward
    // and reverse motion is entirely native capsules on the same live instance.
    for(const [name,from,to] of [['A',[-120.5,-275.5],[-120.5,-255.5]],['B',[-120.5,-208],[-120.5,-190.5]]]){
      put(tracker,...from);f.player(...to)
      const trace=[]
      for(let i=0;i<100 && distance(tracker.target.actor.pos,f.g.player.pos)>2.9;i++){
        const before=tracker.target.actor.pos.clone();tracker.ai.update(.05)
        assert.ok(distance(before,tracker.target.actor.pos)<=6.4*.05+.00001)
        trace.push(tracker.target.actor.pos.toArray())
      }
      assert.ok(distance(tracker.target.actor.pos,f.g.player.pos)<3,name)
      assert.ok(trace.some(p=>Math.abs(p[1]-.172)<.001),`${name} actual shell floor crossed`)
      f.player(...from);const returnStart=tracker.target.actor.pos.clone(),reverse=[]
      for(let i=0;i<100 && distance(tracker.target.actor.pos,f.g.player.pos)>2.9;i++){tracker.ai.update(.05);reverse.push(tracker.target.actor.pos.toArray())}
      await fs.writeFile(new URL(`../../artifacts/harbor/ch2-completion-2026-11-13/b1b-full-ai/channel-${name}-diagnostic.json`,import.meta.url),JSON.stringify({forward:trace,reverse,ai:tracker.ai.snapshot()},null,2)+'\n')
      assert.ok(distance(tracker.target.actor.pos,f.g.player.pos)<3,`${name} reverse`)
      assert.ok(distance(returnStart,tracker.target.actor.pos)>10)
      crossings.push({name,forward:trace,reverse})
    }
    await fs.writeFile(new URL('../../artifacts/harbor/ch2-completion-2026-11-13/b1b-full-ai/full-native-local.json',import.meta.url),JSON.stringify({logicalCount:36,trackers:report,crossings},null,2)+'\n')
  }finally{f.cleanup();environment.dispose()}
})

test('selected twelve keeps its capture boundary and a disposed director remains inspectable',()=>{
  const f=fixture('ch2.s2')
  try{
    const d=f.director,m=d.members[0]
    m.target.actor.damage(20,m.target.actor.pos,v(1,0,0),'body')
    const saved=JSON.parse(JSON.stringify(d.capture()));assert.equal(saved.members.length,12);assert.equal(saved.sectionId,'ch2.s2')
    assert.deepEqual(d.validateCapture(saved),saved)
    d.reset();d.restore(saved);assert.equal(m.target.actor.hp,180)
    assert.equal(d.snapshot().alerts.enabled,false);assert.equal(d.snapshot().sleepCount,0)
    d.dispose();assert.equal(d.snapshot().disposed,true);assert.throws(()=>d.capture(),/disposed/)
  }finally{f.cleanup()}
})
