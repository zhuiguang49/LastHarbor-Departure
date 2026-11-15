import assert from 'node:assert/strict'
import {test} from 'node:test'
import {robotFixture} from './campaign-ch5-native-adapters.check.mjs'

test('M5 hostile matrix selects observed opponents, views retain real damage identity and hidden observations remain detached',async()=>{
  const f=await robotFixture(),{combat:c,v,g}=f
  try{
    const infected=f.person('infected','infected',v(),v(0,0,1)),soldier=f.person('soldier','soldier',v(0,0,6))
    const dog=g.enemies.spawn('hound',v(2,0,3),{passive:false,yaw:Math.PI});f.bridge.register(dog)
    c.update(.3)
    assert.equal(c.targetFor(infected).id,'soldier','infected must ignore closer company robot')
    assert.equal(c.targetFor(soldier).id,'infected');assert.equal(c.targetFor(dog).id,'infected')
    const view=c.targetFor(infected);assert.equal(c.targetFor(infected),view)
    view.damage(15,infected.pos);assert.equal(soldier.hp,185)
    assert.equal(c.snapshot().history.filter(e=>e.type==='damage').at(-1).attacker,'infected')
    const saved=c.observationFor(infected),original=saved.position.clone();saved.position.set(99,99,99)
    assert.notDeepEqual(c.observationFor(infected).position,saved.position)
    g.physics.addBox(v(-1,0,2),v(1,4,2.2));g.physics.build();c.update(.3)
    soldier.pos.z=9;c.update(.3)
    assert.equal(c.observationFor(infected).visible,false);assert.ok(c.observationFor(infected).position.distanceTo(original)<.001)
    assert.equal(c.targetFor(infected),view,'the retained view identifies the actor, not a new fake player')
    c.update(4);assert.equal(c.targetFor(infected),null);assert.equal(c.observationFor(infected),null)
  }finally{f.dispose()}
})

test('M5 fire/projectile use nearest world and live bodies; company shields allies without friendly damage',async()=>{
  const f=await robotFixture(),{combat:c,v,g}=f
  try{
    const shooter=f.person('shooter','soldier',v()),friend=f.person('friend','soldier',v(0,0,3)),victim=f.person('victim','infected',v(0,0,7))
    const origin=v(0,1,1),dir=v(0,0,1)
    let hit=c.fire(shooter,origin,dir,20,5)
    assert.equal(hit.targetId,'friend');assert.equal(hit.blocked,true);assert.equal(hit.hit,false);assert.equal(friend.hp,200);assert.equal(victim.hp,200)
    friend.alive=false
    const wall=g.physics.addBox(v(-1,0,4),v(1,3,4.2));g.physics.build()
    hit=c.fire(shooter,origin,dir,20,5);assert.equal(hit.blocked,true);assert.equal(hit.surface,'concrete');assert.equal(victim.hp,200)
    g.physics.removeBox(wall);g.physics.build()
    hit=c.fire(shooter,origin,dir,20,5);assert.equal(hit.hit,true);assert.equal(hit.targetId,'victim');assert.equal(victim.hp,195)
    const sounds=c.snapshot().history.filter(e=>e.type==='noise').length
    c.projectile(shooter,v(0,1,5),v(0,1,8),195)
    assert.equal(victim.alive,false);assert.equal(victim.hp,0)
    assert.equal(c.snapshot().history.filter(e=>e.type==='noise').length,sounds)
    assert.equal(f.events.filter(e=>e.name==='enemy:killed'&&e.data.enemy===victim).length,1)
    assert.equal(f.events.filter(e=>e.name==='weapon:fire').length,0,'NPCs must not impersonate player gunshots')
  }finally{f.dispose()}
})

test('M5 real-source hearing is a single saved clue; pause freezes damage/time, retry clears memory and unregister restores wrappers',async()=>{
  const f=await robotFixture(),{combat:c,v,g}=f
  try{
    const source=f.person('source','soldier',v(0,0,15)),listener=f.person('listener','infected',v(),v(0,0,-1))
    c.noise(source,source.pos.clone().add(v(0,1,0)));const before=c.observationFor(listener)
    assert.equal(before.kind,'gun');assert.equal(before.visible,false)
    source.pos.x=10;c.update(.3);assert.equal(c.observationFor(listener).position.x,0)
    g.game.state='paused';const time=c.snapshot().elapsed
    c.update(10);c.damageFrom(source,listener,10,listener.pos);assert.equal(listener.hp,200);assert.equal(c.snapshot().elapsed,time)
    g.game.state='playing';c.reset();assert.equal(c.targetFor(listener),null);assert.equal(c.snapshot().history.length,0)
    const actor={id:'transient',pos:v(5,0,5),hp:20,alive:true,active:true,damage(n){this.hp-=n}},original=actor.damage
    const release=c.register({actor,kind:'infected',collider:()=>({position:actor.pos,radius:.32,height:1.8}),eye:()=>actor.pos.clone().add(v(0,1,0)),forward:()=>v(0,0,1)})
    assert.notEqual(actor.damage,original);release();assert.equal(actor.damage,original)
  }finally{f.dispose()}
})

test('M5 swept movement keeps real world collisions and cross-faction bodies, bounds NPCs while permitting player return',async()=>{
  const f=await robotFixture(),{combat:c,v,g}=f
  try{
    const a=f.person('walker','infected',v()),b=f.person('blocker','soldier',v(0,0,2))
    const result=c.move(a,a.pos,v(0,0,6.4),1,.32,1.8,true)
    assert.equal(result.hitWall,true);assert.ok(a.pos.z<1.35);assert.equal(b.pos.z,2)
    a.pos.set(28.6,0,0);c.move(a,a.pos,v(3,0,0),1,.32,1.8,true);assert.ok(a.pos.x<=28.68)
    g.player.pos.set(-38.5,0,20);g.physics.moveCapsule(g.player.pos,v(-3,0,0),.3,.32,1.8,true)
    assert.ok(g.player.pos.x< -39,'Player may return toward CH4')
  }finally{f.dispose()}
})
