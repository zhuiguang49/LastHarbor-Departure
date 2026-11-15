import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { installChapter4Clearance } from './campaign-ch4-clearance.mjs'
import { CH4 } from './campaign-ch4-layout.mjs'
import { CH4_INFECTED_SPAWNS } from './campaign-ch4-infected-layout.mjs'

async function fixture() {
  const {g,T}=await nativeFixture(),listeners=new Map(),messages=[]
  let pressed=false,down=false
  Object.assign(g,{events:{on(k,fn){listeners.set(k,fn)},off(k){listeners.delete(k)},emit(k,event){listeners.get(k)?.(event)}},
    game:{state:'playing'},time:{frame:0},input:{pressed:()=>pressed,down:()=>down},
    player:{alive:true,enabled:true,pos:new T.Vector3(),eye:new T.Vector3(),forward:new T.Vector3()},
    hud:{setPrompt(value){this.prompt=value},message:text=>messages.push(text)}})
  const members=CH4_INFECTED_SPAWNS.map(spawn=>({spawn,target:{actor:{id:spawn.id,hp:200,alive:true}}}))
  const mission=installChapter4Clearance(g,{members})
  const tick=(value=false)=>{pressed=down=value;g.time.frame++;mission.interact()}
  const pose=()=>{const a=CH4.console.approach,t=CH4.console.target;g.player.pos.set(a.x,0,a.z);g.player.eye.set(a.x,1.68,a.z);g.player.forward.set(t.x-a.x,0,t.z-a.z).normalize()}
  const kill=i=>{const actor=members[i].target.actor;actor.alive=false;actor.hp=0;g.events.emit('enemy:killed',{enemy:actor,type:'infected'})}
  pose()
  return {g,T,members,mission,listeners,messages,tick,pose,kill}
}

test('CH4 counts only actual deaths of its five actor identities, once each, and announces 5/5 once',async()=>{
  const {g,members,mission,messages,kill}=await fixture()
  assert.equal(mission.objective(),'清除封锁区感染者：0/5')
  g.events.emit('enemy:killed',{enemy:{id:'ch2.s1.infected-1',hp:0,alive:false}})
  g.events.emit('enemy:killed',{enemy:{...members[0].target.actor,hp:0,alive:false}})
  g.events.emit('enemy:killed',{enemy:members[0].target.actor})
  assert.equal(mission.snapshot().count,0)
  for(let i=0;i<5;i++){
    kill(i);kill(i)
    assert.equal(mission.snapshot().count,i+1)
    assert.equal(mission.snapshot().consoleUnlocked,i===4)
    assert.equal(mission.snapshot().hackingStarted,false)
  }
  assert.deepEqual(messages,['封锁区已清理 · 前往安全门控制台'])
  assert.match(mission.objective(),/清除封锁区感染者：5\/5.*前往安全门控制台/)
  mission.dispose();assert.equal(g.events.emit('enemy:killed',{}),undefined)
})

test('4/5 blocks console and 5/5 needs a fresh facing/unobstructed E press; gate stays closed without hacking',async()=>{
  const {g,T,mission,tick,pose,kill}=await fixture()
  for(let i=0;i<4;i++)kill(i)
  tick(true);assert.match(g.hud.prompt,/控制台锁定/);assert.equal(mission.snapshot().consoleAcknowledged,false)
  kill(4);tick(true);assert.equal(mission.snapshot().consoleAcknowledged,false,'held E cannot activate after the fifth death')
  tick(false);g.player.forward.negate();tick(true);assert.equal(g.hud.prompt,null)
  pose();tick(false)
  const midpoint=g.player.pos.clone().add(new T.Vector3(CH4.console.target.x,0,CH4.console.target.z)).multiplyScalar(.5)
  const wall=g.physics.addBox([midpoint.x-.2,0,midpoint.z-.2],[midpoint.x+.2,3,midpoint.z+.2]);g.physics.build()
  tick(true);assert.equal(g.hud.prompt,null);assert.equal(mission.snapshot().consoleAcknowledged,false)
  g.physics.removeBox(wall);g.physics.build();tick(false)
  g.player.pos.x+=10;g.player.eye.x+=10;tick(true);assert.equal(g.hud.prompt,null)
  pose();tick(false);g.player.alive=false;tick(true);assert.equal(mission.snapshot().consoleAcknowledged,false)
  g.player.alive=true;tick(false);tick(true)
  assert.equal(mission.snapshot().consoleAcknowledged,true)
  assert.equal(mission.snapshot().gateClosed,true);assert.equal(mission.snapshot().hackingStarted,false)
  mission.dispose()
})

test('chapter restart clears killed identities, console readiness and held-input state without recounting old deaths',async()=>{
  const {g,members,mission,tick,kill,messages}=await fixture()
  for(let i=0;i<5;i++)kill(i)
  tick(true);assert.equal(mission.snapshot().consoleAcknowledged,true)
  for(const {target:{actor}} of members){actor.hp=200;actor.alive=true}
  mission.reset();tick(true)
  assert.equal(mission.snapshot().count,0);assert.equal(mission.snapshot().consoleUnlocked,false)
  assert.equal(mission.snapshot().consoleAcknowledged,false)
  g.events.emit('enemy:killed',{enemy:members[0].target.actor});assert.equal(mission.snapshot().count,0)
  kill(0);kill(0);assert.equal(mission.snapshot().count,1)
  assert.equal(messages.filter(m=>m==='封锁区已清理 · 前往安全门控制台').length,1)
  mission.dispose()
})
