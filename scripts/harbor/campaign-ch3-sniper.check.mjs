import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { installChapter3Sniper } from './campaign-ch3-sniper.mjs'

// Production controller and native physics with a visual port double. Actual
// GLB/weapon rays and audio decoding are separately checked in the browser.
async function fixture(){
  const {g,T}=await nativeFixture(),listeners=new Map(),hits=[],roles=[]
  g.events={on(k,f){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(f)},
    off(k,f){listeners.get(k)?.delete(f)},emit(k,e){for(const f of [...listeners.get(k)||[]])f(e)}}
  g.enemies={raycast:()=>null};g.game={state:'playing',run:{time:0}};g.hud={message(){}}
  const position=new T.Vector3(-5,0,-175);let height=1.8,intro=false,defeated=0
  g.player={pos:position,alive:true,enabled:true,health:100,
    captureCampaignCollider:()=>({position:position.clone(),radius:.32,height}),
    damage(amount){hits.push(amount);this.health=Math.max(0,this.health-amount);if(!this.health){this.alive=false;g.events.emit('player:dead',{})}}}
  const root=new T.Group(),scope=new T.Object3D();root.add(scope)
  const muzzle=()=>new T.Vector3(7.5,6.6,-154.6),eye=()=>new T.Vector3(8,6.8,-154)
  let role='Aim'
  const visual={root,scope,instance:{root},animation:{capture:()=>({index:role==='Death'?8:3,time:0,loop:role!=='Death'}),restore(){},finished:()=>role==='Death'},
    getMuzzle:muzzle,getEye:eye,getForward:()=>position.clone().sub(muzzle()).normalize(),aimAt(){},lockDirection(){},
    update(){},setState(value){role=value;roles.push(value)},clipFor:r=>r==='Death'?8:5,reset(){role='Aim'},dispose(){},snapshot:()=>({role})}
  const previous=globalThis.document
  globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})}
  let sniper
  try{sniper=installChapter3Sniper(g,{visual,narrative:{snapshot:()=>({active:intro})},onDefeated:()=>defeated++})}
  finally{globalThis.document=previous}
  return {g,T,sniper,hits,roles,position,defeated:()=>defeated,setIntro:v=>{intro=v},setHeight:v=>{height=v},
    tick(dt=.01){g.game.run.time+=dt;sniper.update(dt)},
    until(state){for(let i=0;i<500&&sniper.snapshot().core.state!==state;i++)this.tick();assert.equal(sniper.snapshot().core.state,state)},
    pause(){g.game.state='paused';g.events.emit('game:state',{state:'paused'})},
    resume(){g.game.state='playing';g.events.emit('game:state',{state:'playing'})},
    dispose:()=>sniper.dispose()}
}

test('production sniper controller deals exactly one native HP call and cancels on pause/caption',async()=>{
  const f=await fixture()
  try{
    f.until('LOCK');f.tick(.2);assert.deepEqual(f.hits,[40]);assert.equal(f.g.player.health,60)
    for(let i=0;i<50;i++)f.tick();assert.deepEqual(f.hits,[40])
    f.until('LOCK');f.pause();const paused=f.sniper.snapshot().core
    f.tick(10);assert.deepEqual(f.hits,[40]);assert.deepEqual(f.sniper.snapshot().core,paused)
    f.resume();f.setIntro(true);for(let i=0;i<10;i++)f.tick(1)
    assert.deepEqual(f.hits,[40]);assert.equal(f.sniper.snapshot().effects.voices,0)
    f.setIntro(false);f.until('LOCK');f.position.x+=3;f.tick(.2)
    assert.deepEqual(f.hits,[40],'live player capsule misses a frozen ray after lateral movement')
  }finally{f.dispose()}
})

test('native actor Hit/Death cancels attacks, saves death and never duplicates the single registered target',async()=>{
  const f=await fixture()
  try{
    f.until('LOCK');const p=new f.T.Vector3(8,6.5,-154),d=new f.T.Vector3(0,0,-1)
    f.sniper.target.actor.damage(40,p,d,'body');assert.equal(f.roles.at(-1),'Hit')
    f.tick(.2);assert.deepEqual(f.hits,[])
    f.sniper.target.actor.damage(160,p,d,'body');assert.equal(f.roles.at(-1),'Death');assert.equal(f.defeated(),1)
    const dead=JSON.parse(JSON.stringify(f.sniper.capture()))
    f.tick(20);assert.deepEqual(f.hits,[]);assert.equal(f.sniper.snapshot().core.state,'DEAD')
    f.sniper.reset(dead,{keepWarning:true});f.tick(10)
    assert.equal(f.sniper.target.actor.alive,false);assert.equal(f.sniper.target.snapshot().raycast.targets,1)
    assert.equal(f.defeated(),1);assert.deepEqual(f.hits,[])
  }finally{f.dispose()}
})

test('optional warning strikes real metal harmlessly once; retrying an older checkpoint does not replay it',async()=>{
  const f=await fixture()
  try{
    const baseline=JSON.parse(JSON.stringify(f.sniper.capture()))
    f.g.physics.addBox([-2.4,0,-175.4],[-1.6,1.8,-174.6],{surface:'metal',tag:'warning-metal'})
    f.tick();assert.equal(f.sniper.snapshot().warning,true)
    f.tick(.35);assert.deepEqual(f.hits,[])
    assert.equal(f.sniper.snapshot().history.filter(e=>e.type==='warning-shot').length,1)
    assert.equal(f.sniper.snapshot().core.cooldownRemaining,3)
    f.sniper.reset(baseline,{keepWarning:true});f.until('LOCK');f.tick(.2)
    assert.equal(f.sniper.snapshot().warningSeen,true)
    assert.equal(f.sniper.snapshot().history.filter(e=>e.type==='warning-start').length,0)
    assert.deepEqual(f.hits,[40])
    f.sniper.reset();assert.equal(f.sniper.snapshot().warningSeen,false,'explicit fresh run can replay the encounter')
  }finally{f.dispose()}
})

test('player death in LOCK and checkpoint restore leave no pending shot or immediate damage',async()=>{
  const f=await fixture()
  try{
    f.until('LOCK');const locked=JSON.parse(JSON.stringify(f.sniper.capture()))
    f.g.player.alive=false;f.g.events.emit('player:dead',{});f.tick(5);assert.deepEqual(f.hits,[])
    f.g.player.alive=true;f.sniper.reset(locked,{keepWarning:true})
    f.tick(.2);assert.deepEqual(f.hits,[]);assert.notEqual(f.sniper.snapshot().core.state,'LOCK')
    f.until('LOCK');f.tick(.2);assert.deepEqual(f.hits,[40])
  }finally{f.dispose()}
})
