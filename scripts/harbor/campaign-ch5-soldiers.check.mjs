import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { installCharacterTarget } from './character-native-target.mjs'
import { installChapter3Clearance } from './campaign-ch3-clearance.mjs'
import { createChapter5Combat } from './campaign-ch5-combat.mjs'

// Real native Three/physics/nav, actual target damage and CH5 combat registry.
// The mesh/animation port is deliberately a test double, not visual acceptance.
const {g:base,T}=await nativeFixture(),v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z)
const json=value=>JSON.parse(JSON.stringify(value))
function fixture(){
  const physics=base.physics,originalMove=physics.moveCapsule
  for(const b of [...physics.boxes])physics.removeBox(b)
  physics.bounds.min.set(-40,0,-30);physics.bounds.max.set(30,20,30);physics.build()
  const listeners=new Map(),events=[]
  const bus={on(k,f){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(f)},
    off(k,f){listeners.get(k)?.delete(f)},emit(k,e){events.push({type:k,event:e});for(const f of [...listeners.get(k)||[]])f(e)}}
  const g={THREE:T,scene:new T.Scene(),physics,events:bus,enemies:{raycast:()=>null},game:{state:'playing',run:{time:0}},time:{frame:0}}
  g.player={id:'player',pos:v(25,0,25),eye:v(25,1.68,25),alive:true,enabled:true,health:1000,
    forward:v(0,0,-1),vel:v(),onGround:true,crouching:false,speed:0,
    captureCampaignCollider(){return {position:this.pos.clone(),radius:.32,height:1.8}},
    damage(amount){this.health-=amount;if(this.health<=0){this.alive=false;bus.emit('player:dead',{})}}}
  let intro=false,active=true
  const contains=p=>p.x>=-39&&p.x<=29&&p.z>=-29&&p.z<=29
  const combat=createChapter5Combat(g,{active:()=>active&&!intro,contains})
  const visuals=[],targets=[]
  function createVisual(){
    const root=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(.6,1.8,.6),new T.MeshBasicMaterial())
    mesh.position.y=.9;mesh.computeBoundingSphere=()=>mesh.geometry.computeBoundingSphere();root.add(mesh)
    let role='Idle',disposed=false,updates=0
    const clips={Idle:0,Patrol:1,Aim:3,Fire:6,Hit:5,Death:8}
    const visual={root,instance:{root,mesh,skeleton:{update(){}}},animation:{finished:()=>role==='Death',snapshot:()=>({duration:2})},
      getMuzzle:()=>root.position.clone().add(v(0,1.4,0)),getEye:()=>root.position.clone().add(v(0,1.7,0)),
      getForward:()=>v(-Math.sin(root.rotation.y),0,-Math.cos(root.rotation.y)),
      aimAt(point){const d=point.clone().sub(this.getMuzzle());root.rotation.y=Math.atan2(-d.x,-d.z)},
      clipFor:r=>clips[r],setState(r){role=r},update(){updates++;root.updateMatrixWorld(true)},reset(){role='Idle'},
      dispose(){disposed=true;root.removeFromParent();mesh.geometry.dispose();mesh.material.dispose()},snapshot:()=>({role,disposed,updates})}
    visuals.push(visual);return visual
  }
  const navigation={contains,findPath(from,to){
    const path=physics.nav.findPath(from,to)
    return path?.length&&path.at(-1).distanceTo(to)<.05?{path:Array.from(path,p=>p.clone())}:null
  },snapshot:()=>({}),dispose(){}}
  const definition={id:'ch5-soldier-1',route:'central',group:null,position:{x:0,y:0,z:0},yaw:0,
    patrol:[],cover:[],territory:{minX:-39,maxX:29,minZ:-29,maxZ:29}}
  const soldiers=installChapter3Clearance(g,{createVisual,deployments:[definition],navigation,combat,ownerKey:'chapter-5',
    narrative:{snapshot:()=>({active:intro||!active})}})
  function target(id,position,kind='infected'){
    const visual=createVisual();g.scene.add(visual.root);visual.root.position.copy(position)
    const target=installCharacterTarget(g,visual.instance,{clipFor:r=>visual.clipFor(r),
      animation:{playClip(index){visual.setState(index===8?'Death':'Hit')},stop(){}}})
    const actor=target.actor;actor.id=id;actor.type=kind
    const unregister=combat.register({actor,kind,collider:()=>({position:actor.pos.clone(),radius:.32,height:1.8}),
      eye:visual.getEye,forward:visual.getForward})
    const item={actor,target,visual,unregister};targets.push(item);return item
  }
  const infected=target('ch5-infected-1',v(0,0,-10))
  function tick(dt=.02){g.game.run.time+=dt;g.time.frame++;combat.update(dt);soldiers.update(dt)}
  function until(predicate,message){for(let i=0;i<6000&&!predicate();i++)tick();assert.ok(predicate(),message)}
  const snapshot=()=>soldiers.snapshot().members[0]
  return {g,combat,soldiers,infected,targets,visuals,events,tick,until,snapshot,target,
    run(seconds){for(let i=0;i<Math.round(seconds/.02);i++)tick()},
    setIntro(value){intro=value},setActive(value){active=value},
    pause(){g.game.state='paused';bus.emit('game:state',{state:'paused'})},
    resume(){g.game.state='playing';bus.emit('game:state',{state:'playing'})},
    wall(min,max){const b=physics.addBox(min,max,{surface:'metal',tag:'ch5-test-wall'});physics.build();return b},
    dispose(){soldiers.dispose();for(const t of targets){t.unregister();t.target.dispose();t.visual.dispose()}combat.dispose()
      assert.equal(physics.moveCapsule,originalMove);assert.equal(g.scene.children.length,0)
      for(const callbacks of listeners.values())assert.equal(callbacks.size,0)}}
}

test('CH5 soldiers use real four-round five-HP hits against infected through the shared target death chain',()=>{
  const f=fixture()
  try{
    f.until(()=>f.soldiers.snapshot().stats.shots===4,'first burst must finish')
    assert.equal(f.infected.actor.hp,180);assert.equal(f.g.player.health,1000)
    const shots=f.soldiers.snapshot().history.filter(e=>e.type==='shot')
    assert.equal(shots.length,4);assert.ok(shots.every(e=>e.damage===5&&e.targetId==='ch5-infected-1'))
    assert.equal(f.soldiers.members[0].target.actor.hp,100)
    f.until(()=>!f.infected.actor.alive,'soldier must actually kill the infected')
    assert.equal(f.infected.actor.hp,0);assert.equal(f.infected.actor.active,false)
    assert.equal(f.infected.visual.snapshot().role,'Death')
    assert.ok(f.events.some(e=>e.type==='enemy:killed'&&e.event.enemy===f.infected.actor))
    const count=f.soldiers.snapshot().stats.shots;f.run(2)
    assert.equal(f.soldiers.snapshot().stats.shots,count,'dead target cannot sustain a burst')
  }finally{f.dispose()}
})

test('CH5 locked rays recheck world and company bodies at each emission without friendly fire or penetration',()=>{
  for(const blocker of ['wall','hound']){
    const f=fixture()
    try{
      f.until(()=>f.snapshot().state==='LOCK','must lock before blocker appears')
      let friend
      if(blocker==='wall')f.wall([-2,0,-5.2],[2,3,-4.8])
      else friend=f.target('ch5-hound-test',v(0,0,-5),'hound')
      f.until(()=>f.soldiers.snapshot().stats.shots>=4,'locked burst must emit')
      assert.equal(f.infected.actor.hp,200);assert.equal(f.g.player.health,1000)
      if(friend)assert.equal(friend.actor.hp,200)
      assert.ok(f.soldiers.snapshot().history.filter(e=>e.type==='shot').every(e=>!e.hit&&e.damage===0))
    }finally{f.dispose()}
  }
})

test('CH5 locked direction can be dodged, and changing target identity cancels outstanding burst rounds',()=>{
  const f=fixture()
  try{
    f.until(()=>f.snapshot().state==='LOCK','must lock')
    const direction=f.snapshot().direction
    f.infected.actor.pos.x=3
    f.until(()=>f.soldiers.snapshot().stats.shots===1,'first locked ray must emit')
    assert.equal(f.infected.actor.hp,200)
    assert.deepEqual(f.soldiers.snapshot().history.find(e=>e.type==='shot').direction,direction)
    const other=f.target('ch5-infected-2',v(0,0,-7))
    f.infected.target.restoreState({hp:0,alive:false});f.tick()
    assert.equal(f.snapshot().burstRemaining,0)
    const count=f.soldiers.snapshot().stats.shots;f.run(.5)
    assert.equal(f.soldiers.snapshot().stats.shots,count,'the old burst cannot move to a new identity')
    f.until(()=>other.actor.hp<200,'new target needs a new aim cycle')
  }finally{f.dispose()}
})

test('CH5 hearing and lost sight retain detached observations instead of hidden target live coordinates',()=>{
  const f=fixture()
  try{
    f.wall([-15,0,-5.2],[15,3,-4.8]);f.run(.3)
    assert.equal(f.snapshot().lastKnown,null)
    f.combat.noise(f.infected.actor,f.infected.actor.pos.clone().add(v(0,1.4,0)))
    f.tick();const known=f.snapshot().lastKnown
    assert.deepEqual(json(known),[0,0,-10]);assert.equal(f.snapshot().knownKind,'gun')
    f.infected.actor.pos.x=8;f.run(.4)
    assert.deepEqual(f.snapshot().lastKnown,known,'moving unseen NPC must not refresh the saved source')
    assert.equal(f.soldiers.snapshot().stats.shots,0)
    assert.equal(f.g.player.health,1000)
  }finally{f.dispose()}
})

test('CH5 pause, narrative, retirement and repeated respawn reuse actors without retained aim, memory or registrations',()=>{
  const f=fixture()
  try{
    f.until(()=>f.snapshot().state==='LOCK','must lock')
    f.pause();const before=json(f.soldiers.capture()),hp=f.infected.actor.hp;f.run(1)
    assert.deepEqual(json(f.soldiers.capture()),before);assert.equal(f.infected.actor.hp,hp)
    f.resume();f.setIntro(true);f.run(1);assert.equal(f.infected.actor.hp,hp)
    f.setIntro(false);f.until(()=>f.snapshot().state==='TRACK','resume can reacquire')
    const m=f.soldiers.members[0],actor=m.target.actor,visual=m.visual,registered=f.combat.snapshot().registered
    for(let i=0;i<12;i++){
      f.soldiers.retire(m.id);f.combat.reset()
      assert.equal(actor.alive,false);assert.equal(visual.root.visible,false)
      assert.equal(f.soldiers.respawn(m.id,{position:v(2,0,1)}),true)
      const s=f.snapshot();assert.equal(s.hp,100);assert.equal(s.lastKnown,null);assert.equal(s.opponentId,null)
      assert.equal(s.burstRemaining,0);assert.equal(s.direction,null)
      assert.equal(m.target.actor,actor);assert.equal(m.visual,visual)
      assert.equal(f.combat.snapshot().registered,registered)
    }
  }finally{f.dispose()}
})
