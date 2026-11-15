import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { parse } from '@babel/parser'
import { nativeChapter4Fixture } from './campaign-ch4.check.mjs'
import { installChapter4Reinforcements } from './campaign-ch4-reinforcements.mjs'
import { CH4, CH4_SPAWNS } from './campaign-ch4-layout.mjs'

// Use the immutable native enemy factory, including hound sensing, damage,
// physics, attack contacts and retirement. Only the audited bolt owner tag is added.
const html=await fs.readFile(new URL('../../几猫国产3A大作_V1-fable5.2.html',import.meta.url),'utf8')
const source=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'))
const body=parse(source).program.body[0].expression.callee.body.body
const boot=body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='gM'))
const nodes=body.filter(n=>n.end<=boot.start),enemyNode=nodes.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='Em')
let prefix=source.slice(nodes[0].start,nodes.at(-1).end)
assert.ok(source.slice(enemyNode.start,enemyNode.end).includes('G.from.copy(T),G.len=0'))
prefix=prefix.replace('G.from.copy(T),G.len=0','G.from.copy(T),G.len=0,G.owner=C,G.ownerId=C.id')
const native=vm.runInNewContext(`(()=>{${prefix};return {enemies:Em,combat:zv}})()`,{console,performance,AbortController},{timeout:15000})

async function fixture(){
  const base=await nativeChapter4Fixture(),{g,T}=base,handlers=new Map(),hits=[],loops=new Set()
  g.params={};g.game={state:'playing',run:{time:0,queue:[]}}
  g.events={on(k,f){if(!handlers.has(k))handlers.set(k,new Set());handlers.get(k).add(f)},off(k,f){handlers.get(k)?.delete(f)},
    emit(k,e){for(const f of [...handlers.get(k)||[]])f(e)}}
  g.player={pos:new T.Vector3(CH4.console.approach.x,0,CH4.console.approach.z),eye:new T.Vector3(),vel:new T.Vector3(),
    alive:true,enabled:true,health:10000,onGround:true,crouching:false,speed:0,
    captureCampaignCollider(){return {position:this.pos.clone(),radius:.32,height:1.8}},
    damage(amount){this.health-=amount;hits.push(amount)}}
  g.player.eye.copy(g.player.pos).y=1.65
  g.camera=new T.PerspectiveCamera(75,1.6,.1,500);g.camera.position.copy(g.player.eye)
  g.camera.lookAt(g.player.eye.clone().add(new T.Vector3(0,0,1)));g.camera.updateMatrixWorld(true)
  g.level={coverPoints:[],interiorBoxes:[]};g.render={lightPool:{acquire:()=>null,flash(){}}}
  g.audio={loop(){const loop={setPos(){},setGain(){},setPitch(){},stop(){loops.delete(loop)}};loops.add(loop);return loop}}
  g.hud={message(){}};g.fx=Object.fromEntries(['smoke','sparks','dust','explosion','debris','tracer','muzzleFlash'].map(k=>[k,()=>{}]))
  g.combat=native.combat(g);g.enemies=await native.enemies(g)
  let intro=false
  function createVisual(){
    const root=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(.6,1.8,.6),new T.MeshBasicMaterial());mesh.position.y=.9;root.add(mesh)
    mesh.computeBoundingSphere=()=>mesh.geometry.computeBoundingSphere()
    let role='Idle';const clips={Idle:0,Patrol:1,Aim:3,Fire:6,Hit:5,Death:8}
    return {root,instance:{root,mesh,skeleton:{update(){}}},animation:{finished:()=>role==='Death',snapshot:()=>({duration:2})},
      getMuzzle:()=>root.position.clone().add(new T.Vector3(0,1.4,0)),getEye:()=>root.position.clone().add(new T.Vector3(0,1.7,0)),
      getForward:()=>new T.Vector3(-Math.sin(root.rotation.y),0,-Math.cos(root.rotation.y)),
      aimAt(point){const d=point.clone().sub(root.position);root.rotation.y=Math.atan2(-d.x,-d.z)},
      clipFor:r=>clips[r],setState(r){role=r},update(){root.updateMatrixWorld(true)},reset(){role='Idle'},snapshot:()=>({role}),
      dispose(){root.removeFromParent();mesh.geometry.dispose();mesh.material.dispose()}}
  }
  const director=installChapter4Reinforcements(g,{createVisual,narrative:{snapshot:()=>({active:intro})}})
  return {...base,g,T,director,hits,loops,intro(value){intro=value},
    tick(dt=.05,{nativeAI=false}={}){g.game.run.time+=dt;director.update(dt);if(nativeAI&&g.game.state==='playing'&&!intro)g.enemies.update(dt)},
    advance(seconds,options){for(let t=0;t<seconds-1e-8;t+=.05)this.tick(Math.min(.05,seconds-t),options)},
    kill(id){const m=director.members.find(m=>m.id===id),actor=m.soldier?.target.actor??m.enemy;actor.damage(actor.hp,actor.pos.clone(),null,'body')},
    dispose(){director.dispose();g.enemies.clear();base.dispose()}}
}

test('explicit start reserves 6+4 only; soldiers and native hounds really spawn and move through native CH4 geometry',async t=>{
  const f=await fixture(),{director:d,g}=f
  try{
    f.tick();assert.deepEqual(d.snapshot().activeByType,{soldier:0,hound:0})
    assert.equal(d.start(),true);assert.equal(d.start(),false);assert.deepEqual(d.snapshot().reservedByType,{soldier:6,hound:4})
    f.tick();assert.deepEqual(d.snapshot().activeByType,{soldier:6,hound:4})
    assert.equal(d.snapshot().soldiers.members.every(m=>m.hp===100),true)
    const dogs=d.members.filter(m=>m.type==='hound')
    assert.equal(dogs.filter(m=>m.site.position.x< -70).length,2)
    assert.equal(dogs.filter(m=>m.site.position.x> -70).length,2)
    for(const m of d.members){
      const pos=new f.T.Vector3(...d.snapshot().members.find(s=>s.id===m.id).position)
      assert.equal(g.physics.moveCapsule(pos.clone(),new f.T.Vector3(),0,m.site.radius,m.type==='hound'?1.4:1.8).hitWall,false)
      for(const peer of d.members)if(peer!==m)
        assert.ok(Math.hypot(m.site.position.x-peer.site.position.x,m.site.position.z-peer.site.position.z)>m.site.radius+peer.site.radius+.25)
      const goal=new f.T.Vector3(CH4.console.approach.x,0,CH4.console.approach.z),path=g.physics.nav.findPath(pos,goal)
      assert.ok(path?.length&&path.at(-1).distanceTo(goal)<.01,`${m.id} reaches the console through native navigation`)
    }
    // Probe the complete planned legs through the unchanged capsule solver;
    // an endpoint-only nav assertion cannot detect a clipped cargo corner.
    for(const m of d.members.filter(m=>m.soldier)){
      const pos=m.soldier.target.actor.pos.clone()
      for(const end of m.soldier.path){
        const delta=end.clone().sub(pos).setY(0),length=delta.length();delta.normalize()
        for(let step=0;step<length-1e-8;step+=.05)
          g.physics.moveCapsule(pos,delta.clone().multiplyScalar(2),Math.min(.05,length-step)/2,.32,1.8,true)
        assert.ok(Math.hypot(pos.x-end.x,pos.z-end.z)<.06,`${m.id} planned leg collides at ${pos.toArray()} toward ${end.toArray()}`)
      }
    }
    const initial=d.snapshot().members.map(m=>m.position),hound=d.members.find(m=>m.type==='hound').enemy
    assert.equal(hound.type,'hound');assert.ok(hound.hp>0)
    f.advance(3,{nativeAI:true})
    for(let i=0;i<d.members.length;i++)assert.ok(Math.hypot(d.snapshot().members[i].position[0]-initial[i][0],d.snapshot().members[i].position[2]-initial[i][2])>.3,`${d.members[i].id} physically advances`)
    for(const m of d.snapshot().members)assert.equal(g.physics.nav.isWalkable(m.position[0],m.position[2]),true)
    assert.equal(d.snapshot().soldiers.stats.pathRejects,0)
    t.diagnostic(JSON.stringify({houndHP:hound.hp,positions:d.snapshot().members.map(m=>({id:m.id,pos:m.position})),nativeMovementSeconds:3}))
  }finally{f.dispose()}
})

test('deployed hound retains native 140HP and native melee contact damage',async t=>{
  const f=await fixture(),{g,director:d}=f
  try{
    d.start();f.tick();const hound=d.members.find(m=>m.type==='hound').enemy
    assert.equal(hound.hp,140)
    // Faster riflemen can now reach this probe during its two-second window.
    // Isolate native hound contacts from their separately verified 5HP bullets.
    d.stopSpawning();for(const m of d.members.filter(m=>m.soldier))f.kill(m.id)
    g.player.pos.copy(hound.pos);g.player.pos.z+=1.3;g.player.eye.copy(g.player.pos).y=1.65
    f.advance(2,{nativeAI:true})
    assert.ok(f.hits.length>0,'native hound made real contact')
    assert.ok(f.hits.every(hit=>hit===15),'native hound contact deals 15 HP')
    t.diagnostic(JSON.stringify({houndHP:140,contactDamage:f.hits}))
  }finally{f.dispose()}
})

test('each death reserves one same-type replacement after two simulation seconds; pause/narrative freeze; stop cancels queues',async()=>{
  const f=await fixture(),d=f.director
  try{
    d.start();f.tick();f.kill('ch4-soldier-1');f.kill('ch4-hound-1');f.tick()
    assert.deepEqual(d.snapshot().activeByType,{soldier:5,hound:3});assert.deepEqual(d.snapshot().queuedByType,{soldier:1,hound:1})
    const elapsed=d.snapshot().elapsed
    f.g.game.state='paused';f.tick(5);assert.equal(d.snapshot().elapsed,elapsed)
    f.g.game.state='playing';f.intro(true);f.tick(5);assert.equal(d.snapshot().elapsed,elapsed)
    f.intro(false);f.advance(1.9);assert.deepEqual(d.snapshot().activeByType,{soldier:5,hound:3})
    f.advance(.15);assert.deepEqual(d.snapshot().activeByType,{soldier:6,hound:4})
    assert.equal(d.snapshot().stats.deaths,2);assert.equal(d.snapshot().stats.spawned,12)
    f.kill('ch4-soldier-2');f.tick();assert.equal(d.stopSpawning(),true)
    assert.deepEqual(d.snapshot().queuedByType,{soldier:0,hound:0})
    const pos=d.snapshot().members.find(m=>m.id==='ch4-soldier-3').position
    f.advance(3);assert.equal(d.snapshot().stats.spawned,12);assert.equal(d.snapshot().activeByType.soldier,5)
    assert.notDeepEqual(d.snapshot().members.find(m=>m.id==='ch4-soldier-3').position,pos,'survivors keep walking after override completes')
  }finally{f.dispose()}
})

test('blocked, nearby, occupied and directly observed reservations are deferred without teleporting',async()=>{
  const f=await fixture(),{g,T,director:d}=f
  try{
    const site=CH4_SPAWNS[0].position
    g.player.pos.set(site.x,0,site.z+7);g.player.eye.copy(g.player.pos).y=1.65
    d.start();f.tick();assert.equal(d.snapshot().members[0].alive,false)
    g.player.pos.set(site.x,0,site.z+18);g.player.eye.copy(g.player.pos).y=1.65
    g.camera.position.copy(g.player.eye);g.camera.lookAt(new T.Vector3(site.x,1,site.z));g.camera.updateMatrixWorld(true)
    // Force only the visibility probe clear, retaining actual native geometry/path checks.
    const los=g.physics.lineOfSight;g.physics.lineOfSight=()=>true
    f.advance(.6);assert.equal(d.snapshot().members[0].alive,false)
    g.camera.lookAt(g.player.eye.clone().add(new T.Vector3(0,0,1)));g.camera.updateMatrixWorld(true)
    g.physics.lineOfSight=los
    const wall=g.physics.addBox([site.x-1,0,site.z-1],[site.x+1,2,site.z+1],{tag:'test-spawn-blocker'});g.physics.build()
    f.advance(.6);assert.equal(d.snapshot().members[0].alive,false)
    g.physics.removeBox(wall);g.physics.build()
    g.player.pos.set(CH4.console.approach.x,0,CH4.console.approach.z);g.player.eye.copy(g.player.pos).y=1.65
    f.advance(.6);assert.equal(d.snapshot().members[0].alive,true)
    assert.ok(d.snapshot().stats.deferred>0)
    for(const type of ['soldier','hound'])assert.ok(d.snapshot().reservedByType[type]<=d.snapshot().quota[type])
  }finally{f.dispose()}
})

test('retirement removes only CH4 native actors, bolts and loop voices; retry returns to dormant ten reservations',async()=>{
  const f=await fixture(),{g,T,director:d}=f
  try{
    const unrelated=g.enemies.spawn('hound',new T.Vector3(-65,0,-110),{state:'idle',passive:true})
    d.start();f.tick();const owned=d.members.find(m=>m.type==='hound').enemy
    g.enemies.debug.ctx.fireBolt(owned.pos,new T.Vector3(0,0,1),owned)
    g.enemies.debug.ctx.fireBolt(unrelated.pos,new T.Vector3(0,0,1),unrelated)
    const ownedBolt=g.enemies.debug.bolts.find(b=>b.on&&b.owner===owned),otherBolt=g.enemies.debug.bolts.find(b=>b.on&&b.owner===unrelated)
    assert.ok(ownedBolt);assert.ok(otherBolt)
    assert.equal(d.retire(),true);assert.equal(d.retire(),false)
    assert.equal(ownedBolt.on,false);assert.equal(otherBolt.on,true);assert.equal(unrelated.active,true)
    assert.deepEqual(d.snapshot().activeByType,{soldier:0,hound:0});assert.equal(d.snapshot().soldiers.effects.voices,0)
    assert.equal(d.start(),false);d.reset();assert.equal(d.snapshot().elapsed,0)
    assert.deepEqual(d.snapshot().queuedByType,{soldier:0,hound:0});assert.equal(d.start(),true);f.tick()
    assert.deepEqual(d.snapshot().activeByType,{soldier:6,hound:4})
  }finally{f.dispose()}
})
