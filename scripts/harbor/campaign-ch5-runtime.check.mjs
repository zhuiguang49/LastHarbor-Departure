import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { createInfrastructure } from './infrastructure-state.mjs'
import { createCampaignState, applyCampaignEvent } from './campaign-state.mjs'
import { installChapter5Runtime, crossedChapter5Entry, CH5_AMMO_SITE, CH5_AMMO_HINT, CH5_POWER_TARGET } from './campaign-ch5-runtime.mjs'

// Native Three, industrial factories, capsule/LOS/nav and real ammunition logic.
// The presentation port holds native states; dedicated narrative checks exercise
// the actual game/input/damage functions. This is not a full-level playthrough.
const json=value=>JSON.parse(JSON.stringify(value))
const priorRoute=[
  {type:'pistol-acquired'},{type:'guard-requested'},{type:'guard-scanning'},
  {type:'guard-warning'},{type:'guard-hostile'},{type:'ambush-resolved',method:'isolation'},
  {type:'power-stable'},{type:'equipment-acquired',id:'rifle'},{type:'equipment-acquired',id:'knife'},
  {type:'supplies-acquired',ammo:true,flashlight:true},{type:'maintenance-open'},{type:'blackbox-entered'},
  {type:'chapter2-crossed'},{type:'chapter2-intro-read',skipped:false},{type:'exit-ammo-hint-handled'},
  {type:'echo-lane-entered'},{type:'safe-room-hint-shown'},{type:'safe-a-entered'},
  {type:'safe-b-entered'},{type:'safe-c-entered'},{type:'berth6-entered'},
  {type:'chapter3-crossed'},{type:'chapter3-intro-read',skipped:false},{type:'worker-rescued'},
  {type:'worker-testimony-completed'},{type:'sniper-threat-resolved',method:'bypassed'},{type:'chapter3-exited'},
  {type:'chapter4-crossed'},{type:'chapter4-intro-read',skipped:false},{type:'ch4-infected-cleared'},
  {type:'p07-read'},{type:'gate-override-started'},{type:'gate-override-accepted'},
  {type:'gate-physically-open'},{type:'chapter4-exited'},
]
function atChapter4Exit(){
  let state=createCampaignState()
  for(const event of priorRoute){const next=applyCampaignEvent(state,event);assert.notEqual(next,state,event.type);state=next}
  return state
}
async function fixture({intro=true}={}) {
  const {g,T,calls}=await nativeFixture(),v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z)
  let pressed=false,down=false,modal=null,page=0,reports=0,requests=0,opening=false
  const events=[],messages=[],checkpoints=[],sounds=[],model=createInfrastructure()
  let state=applyCampaignEvent(atChapter4Exit(),{type:'chapter5-crossed'})
  const entryState=json(state)
  const specs={rifle:{magSize:40,reserveCap:160},pistol:{magSize:12,reserveCap:48},knife:{magSize:0,reserveCap:0}}
  let kit={activeWeapon:'pistol',pickupEnabled:{rifle:false,pistol:false,knife:false},
    slots:{rifle:{owned:true,ammo:2,reserve:3},pistol:{owned:true,ammo:1,reserve:4},knife:{owned:true,ammo:0,reserve:0}}}
  const equipment={capture:()=>json(kit),restore(saved){kit=json(saved)},
    snapshot:()=>({slots:Object.fromEntries(Object.entries(kit.slots).map(([id,s])=>[id,{...s,...specs[id]}]))})}
  const entryKit=equipment.capture()
  Object.assign(g,{game:{state:'playing',run:{time:0}},time:{frame:0},input:{pressed:()=>pressed,down:()=>down},
    audio:{play:(...args)=>sounds.push(args)},
    hud:{setPrompt(value){this.prompt=value},message:(...args)=>messages.push(args)},
    player:{pos:v(-39.9,0,5),eye:v(-39.9,1.68,5),forward:v(1,0,0),alive:true,enabled:true,health:63,addShake(){}},
  })
  const emit=event=>{const next=applyCampaignEvent(state,event);if(next===state)return false;state=next;events.push(event);return true}
  if(intro)emit({type:'chapter5-intro-read',skipped:false})
  const systems={state:model.state,reset:model.reset,snapshot:()=>({...model.snapshot(),lighting:{testPort:true}}),
    requestPower(){requests++;return model.request('power')},updatePower:dt=>model.tick(dt)}
  const close=()=>{modal=null;g.game.state='playing';g.player.enabled=true}
  const narrative={snapshot:()=>({active:!!modal||opening}),
    openChapter5Power({onComplete}){if(modal)return false;modal=onComplete;reports++;page=0;g.game.state='paused';g.player.enabled=false;return true},
    cancelChapter5Power(){if(!modal)return false;close();return true},
  }
  const runtime=installChapter5Runtime(g,equipment,{systems,narrative,flags:()=>state.flags,emit,
    onCheckpoint:event=>checkpoints.push({event,runtime:json(runtime.capture()),kit:equipment.capture(),state:json(state)})})
  const place=(position,target)=>{g.player.pos.copy(position);g.player.eye.copy(position).y+=1.68
    if(target)g.player.forward.copy(target).sub(position).setY(0).normalize()}
  const power=()=>place(v(CH5_POWER_TARGET.x,0,CH5_POWER_TARGET.z+1.2),v(CH5_POWER_TARGET.x,CH5_POWER_TARGET.y,CH5_POWER_TARGET.z))
  const ammo=()=>{const s=runtime.ammo.snapshot().sites[0];place(v(CH5_AMMO_SITE.approach.x,0,CH5_AMMO_SITE.approach.z),v(...s.target))}
  const tick=(dt=.05)=>{g.time.frame++;runtime.update(dt)}
  const release=()=>{pressed=down=false;g.time.frame++;return runtime.interact()}
  const press=()=>{release();pressed=down=true;g.time.frame++;return runtime.interact()}
  const next=()=>{if(!modal||page!==0)return false;page=1;return true}
  const confirm=()=>{if(!modal||page!==1)return false;const callback=modal;callback({skipped:false});close();return true}
  const start=()=>{power();assert.equal(press(),true);release();tick(1.5);assert.equal(reports,1);next();assert.equal(confirm(),true)}
  function retry(){
    const read=state.flags.chapter5IntroRead,skipped=state.flags.chapter5IntroSkipped
    state=json(entryState);if(read)state=applyCampaignEvent(state,{type:'chapter5-intro-read',skipped})
    runtime.reset();equipment.restore(entryKit);g.player.health=63;place(v(-39.9,0,5),v(0,0,5));release()
  }
  return {g,T,v,calls,runtime,equipment,entryKit,systems,narrative,events,messages,checkpoints,sounds,emit,
    flags:()=>state.flags,state:()=>state,requests:()=>requests,reports:()=>reports,place,power,ammo,tick,release,press,next,confirm,start,retry,
    opening(value){opening=value},dispose:()=>runtime.dispose()}
}

test('CH5 seam requires a local forward crossing of the original X=-40 opening and completed CH4 with credential',()=>{
  const p=(x,z=5,y=0)=>({x,y,z})
  assert.equal(crossedChapter5Entry(p(-40.1),p(-39.9)),true)
  assert.equal(crossedChapter5Entry(p(-41,1),p(-39,4)),true,'Interpolate the actual seam point')
  for(const [a,b]of [[null,p(-39.9)],[p(-39.9),p(-40.1)],[p(-70),p(-39.9)],
    [p(-40.1,2),p(-39.9,2)],[p(-40.1,8),p(-39.9,8)],
    [p(-40.1,5,.6),p(-39.9)],[p(-40.1),p(-39.9,5,.6)],[p(NaN),p(-39.9)],
    [p(-70,-8),p(-70,-6)]])assert.equal(crossedChapter5Entry(a,b),false)
  let state=createCampaignState()
  for(const event of priorRoute){assert.equal(applyCampaignEvent(state,{type:'chapter5-crossed'}),state);state=applyCampaignEvent(state,event)}
  for(const flag of ['chapter4Completed','accessCredentialObtained']){
    const missing={...state,flags:{...state.flags,[flag]:false}}
    assert.equal(applyCampaignEvent(missing,{type:'chapter5-crossed'}),missing)
  }
  const failed={...state,status:'failed'};assert.equal(applyCampaignEvent(failed,{type:'chapter5-crossed'}),failed)
  const entered=applyCampaignEvent(state,{type:'chapter5-crossed'})
  assert.equal(entered.currentChapter,'CH5');assert.equal(entered.status,'active')
  for(const [key,value]of Object.entries(state.flags))if(key!=='chapter5Entered')assert.equal(entered.flags[key],value,key)
  assert.equal(applyCampaignEvent(entered,{type:'chapter5-crossed'}),entered)
})

test('CH5 ordered facts reject premature power, warehouse and later-stage fuel/boat events',()=>{
  let state=applyCampaignEvent(atChapter4Exit(),{type:'chapter5-crossed'})
  const steps=['power7-stable','warehouse-initialization-started','warehouse-unlocked','warehouse-physically-open']
  for(const type of steps)assert.equal(applyCampaignEvent(state,{type}),state)
  state=applyCampaignEvent(state,{type:'chapter5-intro-read',skipped:false})
  for(let i=0;i<steps.length;i++){
    for(const type of steps.slice(i+1))assert.equal(applyCampaignEvent(state,{type}),state)
    const next=applyCampaignEvent(state,{type:steps[i]});assert.notEqual(next,state);state=next
    assert.equal(applyCampaignEvent(state,{type:steps[i]}),state)
  }
  for(const type of ['fuel-started','fuel-ready','boat-ready','boarding-completed','chapter5-completed'])
    assert.equal(applyCampaignEvent(state,{type}),state)
  assert.equal(state.status,'active');assert.equal(state.flags.chapter4Completed,true)
})

test('CH5 central supply requires intro, near range, facing, LOS and a new E edge; power is once',async()=>{
  const f=await fixture({intro:false}),{g,runtime:r}=f
  try{
    f.power();assert.equal(f.press(),false);f.tick(10);assert.equal(f.systems.state.power,'OFF')
    f.emit({type:'chapter5-intro-read',skipped:false});f.release()
    g.player.forward.negate();assert.equal(f.press(),false);assert.equal(f.requests(),0)
    f.place(f.v(10,0,10),f.v(CH5_POWER_TARGET.x,CH5_POWER_TARGET.y,CH5_POWER_TARGET.z));assert.equal(f.press(),false)
    f.power();const blocker=g.physics.addBox(f.v(1,0,8.5),f.v(2.4,3,8.6),{tag:'test-power-occlusion'})
    assert.equal(f.press(),false);assert.equal(f.requests(),0);g.physics.removeBox(blocker)
    f.power();f.opening(true);assert.equal(f.press(),false);f.opening(false)
    assert.equal(f.press(),true);assert.equal(f.systems.state.power,'UNSTABLE');assert.equal(f.requests(),1)
    assert.equal(r.interact(),false,'Same frame cannot consume E twice')
    f.g.time.frame++;r.interact();f.press();assert.equal(f.requests(),1)
    f.tick(.5);assert.equal(f.reports(),0)
    g.game.state='paused';f.tick(100);assert.equal(f.systems.state.powerTime,.5)
    g.game.state='playing';f.tick(1);assert.equal(f.flags().power7Stable,true);assert.equal(f.reports(),1)
    f.next();f.confirm();f.press();assert.equal(f.requests(),1);assert.equal(f.sounds.length,1)
  }finally{f.dispose()}
})

test('CH5 report completion starts sixty simulation seconds; reading, pause and inactive updates preserve the clock',async()=>{
  const f=await fixture(),{g,runtime:r}=f
  try{
    f.power();f.press();f.release();f.tick(1.5)
    assert.equal(f.flags().power7Stable,true);assert.equal(f.flags().warehouseInitializationStarted,false)
    assert.equal(f.confirm(),false);f.tick(1000);assert.equal(r.capture().elapsed,0)
    assert.equal(r.warehouse.snapshot().phase,'closed');assert.equal(f.reports(),1)
    f.next();f.tick(1000);assert.equal(r.capture().elapsed,0);assert.equal(f.confirm(),true)
    assert.equal(f.flags().warehouseInitializationStarted,true);assert.equal(r.capture().elapsed,0)
    f.place(f.v(22,0,0),f.v(23,0,0));f.tick(20);assert.equal(r.capture().elapsed,20,'May leave the power cabinet')
    g.game.state='paused';f.tick(100);assert.equal(r.capture().elapsed,20);g.game.state='playing'
    f.opening(true);f.tick(100);assert.equal(r.capture().elapsed,20);f.opening(false)
    g.player.alive=false;f.tick(100);assert.equal(r.capture().elapsed,20);g.player.alive=true
    for(const dt of [0,-1,NaN,Infinity])f.tick(dt)
    assert.equal(r.capture().elapsed,20)
    f.tick(39.9);assert.equal(f.flags().warehouseUnlocked,false);assert.equal(r.warehouse.snapshot().phase,'closed')
    assert.equal(r.objective(),'仓库安全联锁初始化：剩余1s')
    f.tick(.1);assert.equal(r.capture().elapsed,60);assert.equal(f.flags().warehouseUnlocked,true)
    assert.equal(r.warehouse.snapshot().phase,'opening')
    assert.equal(g.physics.lineOfSight(f.v(-3.5,1.6,-10),f.v(-3.5,1.6,-13)),false)
    f.tick(4);assert.equal(f.flags().warehousePhysicallyOpen,true);assert.equal(r.warehouse.snapshot().phase,'open')
    assert.equal(g.physics.lineOfSight(f.v(-3.5,1.6,-10),f.v(-3.5,1.6,-13)),true)
    f.tick(100);assert.equal(f.reports(),1);assert.equal(f.requests(),1);assert.equal(r.capture().elapsed,60)
    for(const type of ['power7-stable','warehouse-initialization-started','warehouse-unlocked','warehouse-physically-open'])
      assert.equal(f.events.filter(e=>e.type===type).length,1,type)
    assert.deepEqual([f.systems.state.gate,f.systems.state.fuel,f.systems.state.boat],['LOCKED','UNAVAILABLE','BLOCKED'])
    assert.equal(f.systems.state.fuelProgress,0);assert.equal(f.systems.state.departureProgress,0)
  }finally{f.dispose()}
})

test('CH5 original ammo crate caps owned guns, preserves full stock, consumes once and snapshots inventory atomically',async()=>{
  const f=await fixture(),r=f.runtime
  try{
    assert.equal(r.ammo.snapshot().sites.length,1);assert.equal(r.ammo.snapshot().sites[0].id,CH5_AMMO_SITE.id)
    assert.ok(f.calls.some(c=>c.name==='crate_wood'));assert.ok(f.calls.some(c=>c.name==='floodlight_stand'))
    assert.equal(r.showAmmoHint(),true);assert.equal(r.showAmmoHint(),false);assert.deepEqual(f.messages,[[CH5_AMMO_HINT,3]])
    f.ammo();assert.equal(f.g.physics.nav.isWalkable(f.g.player.pos.x,f.g.player.pos.z),true)
    const full=f.equipment.capture();full.slots.rifle.ammo=40;full.slots.rifle.reserve=160;full.slots.pistol.ammo=12;full.slots.pistol.reserve=48
    f.equipment.restore(full);f.press();assert.deepEqual(r.ammo.capture().consumed,[])
    const unowned=f.equipment.capture();unowned.slots.rifle.owned=false;unowned.slots.rifle.ammo=0;unowned.slots.rifle.reserve=0
    unowned.slots.pistol.ammo=1;unowned.slots.pistol.reserve=3;f.equipment.restore(unowned)
    f.press();const supplied=f.equipment.capture()
    assert.deepEqual(supplied.slots.rifle,unowned.slots.rifle);assert.deepEqual(supplied.slots.pistol,{owned:true,ammo:12,reserve:48})
    assert.deepEqual(supplied.slots.knife,unowned.slots.knife);assert.equal(supplied.activeWeapon,'pistol')
    assert.deepEqual(supplied.pickupEnabled,unowned.pickupEnabled);assert.deepEqual(r.ammo.capture().consumed,[CH5_AMMO_SITE.id])
    assert.deepEqual(f.checkpoints.at(-1).kit,supplied);assert.deepEqual(f.checkpoints.at(-1).runtime.ammo.consumed,[CH5_AMMO_SITE.id])
    supplied.slots.pistol.ammo=0;f.equipment.restore(supplied);f.press();assert.equal(f.equipment.capture().slots.pistol.ammo,0)
    assert.equal(f.checkpoints.length,1)
  }finally{f.dispose()}
})

test('CH5 entry hint survives mouse-lock clear/reminders for three simulation seconds',async()=>{
  const f=await fixture(),reminder='点击游戏画面以捕获鼠标'
  try{
    f.g.input.describeMode=()=>reminder
    f.runtime.showAmmoHint();f.tick(.8);f.g.hud.message(reminder,2.6)
    f.g.hud.message('',0)
    assert.deepEqual(f.messages,[[CH5_AMMO_HINT,3]])
    f.g.game.state='paused';f.tick(10);f.g.game.state='playing'
    f.tick(2);f.g.hud.message(reminder,2.6)
    assert.deepEqual(f.messages,[[CH5_AMMO_HINT,3]])
    f.tick(.21);f.g.hud.message(reminder,2.6)
    assert.deepEqual(f.messages.at(-1),[reminder,2.6])
    f.runtime.reset();f.runtime.showAmmoHint();f.g.hud.message('已补满弹药',3);f.g.hud.message('',0)
    assert.deepEqual(f.messages.at(-1),['',0],'a real interaction replaces the hint and releases protection')
  }finally{f.dispose()}
})

test('CH5 retry resets facilities and supply alongside entry kit/HP, preserving prior chapters and read opening',async()=>{
  const f=await fixture(),r=f.runtime
  try{
    const entry=json(r.capture()),flags=json(f.flags()),kit=f.equipment.capture()
    assert.doesNotThrow(()=>r.validateEntry(entry,flags))
    f.ammo();f.press();assert.deepEqual(r.ammo.capture().consumed,[CH5_AMMO_SITE.id])
    assert.equal(r.showAmmoHint(),false,'Do not hint if already collected')
    assert.deepEqual(f.equipment.capture().slots.rifle,{owned:true,ammo:40,reserve:160})
    assert.deepEqual(f.equipment.capture().slots.pistol,{owned:true,ammo:12,reserve:48})
    f.start();f.tick(60);f.tick(4);f.g.player.health=1
    assert.equal(f.flags().warehousePhysicallyOpen,true)
    f.retry();assert.deepEqual(f.equipment.capture(),kit);assert.equal(f.g.player.health,63)
    assert.deepEqual(json(r.capture()),entry);assert.deepEqual(f.flags(),flags)
    assert.equal(f.flags().chapter4Completed,true);assert.equal(f.flags().accessCredentialObtained,true);assert.equal(f.flags().chapter5IntroRead,true)
    f.ammo();f.press();assert.deepEqual(r.ammo.capture().consumed,[CH5_AMMO_SITE.id])
  }finally{f.dispose()}
})

test('CH5 entry validation rejects consumed supply and progressed facilities or mission facts',async()=>{
  const f=await fixture(),r=f.runtime
  try{
    const entry=json(r.capture()),flags=json(f.flags())
    assert.doesNotThrow(()=>r.validateEntry(entry,flags))
    for(const mutate of [s=>s.version=2,s=>s.elapsed=.1,s=>s.power.power='ON',
      s=>s.warehouse.progress=.1,s=>s.warehouse.started=true,s=>s.ammo.consumed=[CH5_AMMO_SITE.id],
      s=>s.ammo.consumed=['unknown'],s=>s.ammo=null]){
      const bad=json(entry);mutate(bad);assert.throws(()=>r.validateEntry(bad,flags),/Invalid CH5|Invalid CH3/)
    }
    for(const key of ['power7Stable','warehouseInitializationStarted','warehouseUnlocked','warehousePhysicallyOpen'])
      assert.throws(()=>r.validateEntry(entry,{...flags,[key]:true}),/Invalid CH5/)
    assert.throws(()=>r.validateEntry(null,flags),/Invalid CH5/)
  }finally{f.dispose()}
})
