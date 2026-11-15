import assert from 'node:assert/strict'
import {test} from 'node:test'
import {robotFixture} from './campaign-ch5-native-adapters.check.mjs'

test('M5 native dog and gull naturally acquire, move, animate, fire and kill the registered infected with original 5/7HP attacks',async t=>{
  const f=await robotFixture(),{g,v,combat:c,bridge:b}=f
  try{
    const victim=f.person('victim','infected',v(0,0,10))
    const dog=g.enemies.spawn('hound',v(),{yaw:0}),gull=g.enemies.spawn('gull',v(5,5,0),{yaw:-.5})
    const rigs=[dog.rig,gull.rig];b.register(dog);b.register(gull)
    assert.equal(dog.hp,140);assert.equal(gull.hp,45)
    f.advance(20)
    const hits=c.snapshot().history.filter(e=>e.type==='damage'&&e.victim==='victim')
    assert.ok(hits.some(e=>e.attacker===dog.id&&e.amount===5));assert.ok(hits.some(e=>e.attacker===gull.id&&e.amount===7))
    assert.ok(dog.pos.distanceTo(v())>.3);assert.ok(gull.pos.distanceTo(v(5,5,0))>.3)
    assert.equal(dog.rig,rigs[0]);assert.equal(gull.rig,rigs[1]);assert.ok(f.loops.size>=2)
    f.advance(35);assert.equal(victim.alive,false)
    assert.equal(f.events.filter(e=>e.name==='enemy:killed'&&e.data.enemy===victim).length,1)
    assert.ok(f.events.some(e=>e.name==='enemy:telegraph'&&e.data.type==='hound'))
    assert.ok(f.events.some(e=>e.name==='enemy:telegraph'&&e.data.type==='gull'))
    t.diagnostic(JSON.stringify({firstTwentySeconds:hits,deathHP:victim.hp,pools:[g.enemies.debug.hounds.length,g.enemies.debug.gulls.length]}))
  }finally{f.dispose()}
})

test('M5 native hound melee retains 15HP contact and rejects high or wall-separated targets',async()=>{
  for(const condition of ['clear','wall','high']){
    const f=await robotFixture(),{g,v,combat:c,bridge:b}=f
    try{
      const victim=f.person('victim','infected',v(0,condition==='high'?4:0,1.25))
      const dog=g.enemies.spawn('hound',v(),{yaw:0});b.register(dog)
      if(condition==='wall'){g.physics.addBox(v(-1,0,.55),v(1,3,.65));g.physics.build()}
      f.advance(2)
      const melee=c.snapshot().history.filter(e=>e.type==='damage'&&e.victim==='victim'&&e.amount===15)
      assert.equal(melee.length>0,condition==='clear',condition)
      if(condition==='wall')assert.equal(victim.hp,200)
    }finally{f.dispose()}
  }
})

test('M5 owned gull bolts collide with world and company bodies, freeze with modal active, and cannot become legacy player shots',async()=>{
  const f=await robotFixture(),{g,v,combat:c,bridge:b}=f
  try{
    const gull=g.enemies.spawn('gull',v(0,5,0),{yaw:0});b.register(gull)
    const victim=f.person('victim','infected',v(0,0,5)),friend=f.person('friend','soldier',v(0,0,2))
    const fire=()=>g.enemies.debug.ctx.fireBolt(v(0,1,0),v(0,0,1),gull)
    fire();f.advance(.15);assert.equal(victim.hp,200);assert.equal(friend.hp,200)
    friend.alive=false
    const wall=g.physics.addBox(v(-1,0,2),v(1,2,2.1));g.physics.build()
    fire();f.advance(.15);assert.equal(victim.hp,200)
    g.physics.removeBox(wall);g.physics.build()
    fire();const bolt=g.enemies.debug.bolts.find(x=>x.on),before={position:bolt.pos.clone(),life:bolt.life,robot:gull.pos.clone()}
    f.setActive(false);f.advance(1)
    assert.ok(bolt.pos.equals(before.position));assert.equal(bolt.life,before.life);assert.ok(gull.pos.equals(before.robot))
    f.setActive(true);f.advance(.15);assert.equal(victim.hp,193)
    assert.ok(c.snapshot().history.some(e=>e.type==='damage'&&e.attacker===gull.id&&e.victim==='victim'))
  }finally{f.dispose()}
})

test('M5 gull full flight envelope cannot sweep through thin walls, low hardware, ceilings or chapter bounds',async()=>{
  const f=await robotFixture(),{g,v,bridge:b}=f
  try{
    const gull=g.enemies.spawn('gull',v(0,3,0),{yaw:0});b.register(gull)
    const hook=g.enemies.debug.ctx.chapter5
    for(const obstacle of [
      {min:v(1,0,-2),max:v(1.05,8,2),velocity:v(40,0,0)},
      {min:v(.75,2.6,-.2),max:v(.85,2.8,.2),velocity:v(40,0,0)},
      {min:v(-2,4,-2),max:v(2,4.05,2),velocity:v(0,40,0)},
    ]){
      gull.pos.set(0,3,0);gull.vel.copy(obstacle.velocity)
      const wall=g.physics.addBox(obstacle.min,obstacle.max);g.physics.build()
      hook.moveGull(gull,.05)
      assert.ok(gull.pos.equals(v(0,3,0)));assert.equal(gull.vel.length(),0)
      g.physics.removeBox(wall);g.physics.build()
    }
    gull.pos.set(28.4,3,0);gull.vel.set(40,0,0);hook.moveGull(gull,.05);assert.equal(gull.pos.x,28.4)
    gull.pos.set(0,3,0);gull.vel.set(2,0,0);hook.moveGull(gull,.05);assert.equal(gull.pos.x,.1)
  }finally{f.dispose()}
})

test('M5 native melee requires facing the live target even inside the native omnidirectional near-sense radius',async()=>{
  const f=await robotFixture(),{g,v,combat:c,bridge:b}=f
  try{
    f.person('behind','infected',v(0,0,-1.2))
    const dog=g.enemies.spawn('hound',v(),{yaw:0});b.register(dog);c.update(.3)
    assert.equal(c.targetFor(dog).id,'behind')
    assert.equal(g.enemies.debug.ctx.chapter5.canMelee(dog,c.targetFor(dog)),false)
    dog.fwd.set(0,0,-1)
    assert.equal(g.enemies.debug.ctx.chapter5.canMelee(dog,c.targetFor(dog)),true)
  }finally{f.dispose()}
})

test('M5 falling gull uses native crash/explosion and damages GLB enemies without company friendly fire',async()=>{
  const f=await robotFixture(),{g,v,combat:c,bridge:b}=f
  try{
    const gull=g.enemies.spawn('gull',v(0,2,0),{yaw:0});b.register(gull)
    const infected=f.person('infected','infected',v(1,0,0)),soldier=f.person('soldier','soldier',v(-1,0,0))
    c.damageFrom(g.player,gull,45,gull.pos.clone(),null);assert.equal(gull.alive,false)
    f.advance(3)
    assert.equal(gull.active,false);assert.ok(infected.hp<200);assert.equal(soldier.hp,200)
    assert.equal(f.events.filter(e=>e.name==='enemy:killed'&&e.data.enemy===gull).length,1)
  }finally{f.dispose()}
})

test('M5 ownership survives native pool reuse, unregister restores damage, and clear retires only owned actors/bolts/voices',async()=>{
  const f=await robotFixture(),{g,v,combat:c,bridge:b}=f
  try{
    const outsider=g.enemies.spawn('gull',v(20,6,20),{passive:true}),dog=g.enemies.spawn('hound',v(),{yaw:0}),rig=dog.rig
    b.register(dog);const first=dog.id
    g.enemies.debug.ctx.fireBolt(v(0,1,0),v(0,0,1),dog)
    g.enemies.debug.ctx.fireBolt(v(20,1,20),v(0,0,1),outsider)
    g.enemies.debug.ctx.retire(dog);b.unregister(dog)
    const reused=g.enemies.spawn('hound',v(1,0,0),{yaw:0});assert.equal(reused,dog);assert.equal(reused.rig,rig);assert.notEqual(reused.id,first)
    b.register(reused);assert.equal(b.snapshot().owned.length,1)
    b.clearOwned();assert.equal(reused.active,false);assert.equal(outsider.active,true)
    assert.equal(g.enemies.debug.bolts.filter(x=>x.on&&x.owner===outsider).length,1)
    assert.equal(g.enemies.debug.bolts.filter(x=>x.on&&x.owner===dog).length,0)
    assert.equal(c.snapshot().registered,1);assert.equal(f.loops.size,1)
  }finally{f.dispose()}
})

test('M5 stale release callbacks cannot unregister a newly activated generation of the same native pool object',async()=>{
  const f=await robotFixture(),{g,v,combat:c,bridge:b}=f
  try{
    const dog=g.enemies.spawn('hound',v(),{yaw:0}),first=dog.id
    const releaseOld=b.register(dog),releaseDuplicate=b.register(dog)
    g.enemies.debug.ctx.retire(dog)
    const reused=g.enemies.spawn('hound',v(1,0,0),{yaw:0})
    assert.equal(reused,dog);assert.notEqual(reused.id,first)
    const releaseNew=b.register(reused),update=reused._update,damage=reused.damage
    assert.equal(releaseOld(),false);assert.equal(releaseDuplicate(),false)
    assert.equal(b.snapshot().owned.length,1);assert.equal(b.snapshot().owned[0].id,reused.id)
    assert.equal(c.snapshot().registered,2);assert.equal(reused._update,update);assert.equal(reused.damage,damage)
    assert.equal(releaseNew(),true);assert.equal(c.snapshot().registered,1)
    assert.equal(releaseOld(),false);assert.equal(releaseNew(),false)
  }finally{f.dispose()}
})

test('M5 a dead gull retains the ownership of in-flight bolts until explicit cleanup',async()=>{
  const f=await robotFixture(),{g,v,combat:c,bridge:b}=f
  try{
    const gull=g.enemies.spawn('gull',v(0,5,0),{yaw:0});b.register(gull)
    const victim=f.person('victim','infected',v(0,0,5))
    g.enemies.debug.ctx.fireBolt(v(0,1,0),v(0,0,1),gull)
    const bolt=g.enemies.debug.bolts.find(x=>x.on)
    c.damageFrom(g.player,gull,45,gull.pos.clone(),null)
    assert.equal(gull.alive,false);assert.equal(bolt.owner,gull);assert.equal(bolt.ownerId,gull.id)
    f.advance(.1)
    assert.equal(victim.hp,193);assert.equal(bolt.on,false)
    const hit=c.snapshot().history.filter(e=>e.type==='damage'&&e.victim==='victim').at(-1)
    assert.equal(hit.attacker,gull.id);assert.equal(hit.amount,7)
    g.enemies.debug.ctx.fireBolt(v(0,1,0),v(1,0,0),gull)
    assert.equal(b.snapshot().bolts,1)
    b.clearOwned();assert.equal(b.snapshot().bolts,0);assert.equal(g.enemies.debug.bolts.some(x=>x.on&&x.owner===gull),false)
    assert.equal(c.snapshot().registered,2,'Only real player and live character registration remain')
  }finally{f.dispose()}
})

test('M5 derived native factories with no owned hook retain legacy player-only damage and tuning',async()=>{
  const f=await robotFixture({hooks:false}),{g,v}=f
  try{
    g.player.pos.set(0,0,3);g.player.eye.set(0,1.65,3)
    const dog=g.enemies.spawn('hound',v(),{yaw:0}),gull=g.enemies.spawn('gull',v(0,5,0),{passive:true})
    assert.equal(g.enemies.TUNE.hound.shotDamage,5);assert.equal(g.enemies.TUNE.gull.boltDamage,7)
    assert.equal(g.combat.enemyShot(v(0,1,0),v(0,0,1),{owner:dog,damage:5,range:20}),true)
    g.enemies.debug.ctx.fireBolt(v(0,1,0),v(0,0,1),gull);g.enemies.update(.05)
    assert.equal(g.player.health,988)
  }finally{f.dispose()}
})
