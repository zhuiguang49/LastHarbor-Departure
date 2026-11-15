import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { test,after } from 'node:test'
import { nativeChapter3Fixture } from './campaign-ch3.check.mjs'
import { CH3_RESCUE_BLOCKERS } from './campaign-ch3-deployment.mjs'
import { CH3_RESCUE_DOOR as door } from './campaign-ch3-rescue.mjs'
import { createCampaignState, applyCampaignEvent } from './campaign-state.mjs'

// Keep native controllers, target registry, physics, props and door. Only asset
// loading/mesh presentation and the separately owned DOM conversation are ports.
// Import rewriting stays in this check; production has no injection switches.
const f=await nativeChapter3Fixture(),{T}=f,v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z)
after(()=>f.dispose())
const json=x=>JSON.parse(JSON.stringify(x)),radioData=Object.fromEntries(
  ['warning','blockade','contact','rescue','departure'].map(key=>[key,[{who:key,text:`${key} first`},{who:key,text:`${key} second`}]]))
let loading
function resource(name){return {name,character:{name:'shared-character'},releases:0,dispose(){this.releases++}}}
function visual(g,sniper=false) {
  const root=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(.6,1.8,.6),new T.MeshBasicMaterial()),scope=new T.Object3D()
  mesh.position.y=.9;mesh.computeBoundingSphere=()=>mesh.geometry.computeBoundingSphere();root.add(mesh,scope)
  let role='Idle'
  const clips={Idle:7,Patrol:0,Aim:3,Fire:6,Hit:5,Death:8}
  const animation={finished:()=>role==='Death',snapshot:()=>({duration:2}),capture:()=>({index:clips[role],time:0,loop:role!=='Death'}),
    validateCapture(s){assert.ok(s&&Number.isInteger(s.index)&&Object.values(clips).includes(s.index)&&s.time>=0&&typeof s.loop==='boolean');return s},restore(){}}
  return {root,scope,instance:{root,mesh,skeleton:{update(){}}},animation,
    getMuzzle:()=>root.position.clone().add(v(0,1.4,0)),getEye:()=>root.position.clone().add(v(0,1.7,0)),
    getForward:()=>v(-Math.sin(root.rotation.y),0,-Math.cos(root.rotation.y)),
    aimAt(point){if(!sniper){const delta=point.clone().sub(root.position);root.rotation.y=Math.atan2(-delta.x,-delta.z)}},lockDirection(){},
    clipFor:r=>clips[r],setState(r){role=r},update(){root.updateMatrixWorld(true)},reset(){role=sniper?'Aim':'Idle'},
    snapshot:()=>({role}),dispose(){root.removeFromParent();mesh.geometry.dispose();mesh.material.dispose()}}
}
const ports={
  async loadChapter3Assets(){loading.calls.push('assets');return loading.assets},
  async loadChapter3PersonnelResources(){loading.calls.push('personnel');if(loading.fail==='personnel')throw Error('personnel failure');return loading.personnel},
  async loadSniperResources(g,options){loading.calls.push('sniper');assert.equal(options.characterResource,loading.personnel.character);if(loading.fail==='sniper')throw Error('sniper failure');return loading.sniper},
  createSniperVisual:g=>visual(g,true),createClearanceVisual:g=>visual(g),
  createWorkerVisual(){const root=new T.Group();return {root,snapshot:()=>({position:root.position.toArray()}),dispose(){root.removeFromParent()}}},
  campaignCh3Radio:radioData,
  installChapter3Conversation(g,{onComplete}) {
    let active=false
    return {open(){if(active)return false;active=true;return true},reset(){active=false},snapshot:()=>({active}),
      complete(){assert.equal(active,true);active=false;onComplete()},cancel(){active=false}}
  },
}
const portKey='__ch3RuntimeCheckPorts'
globalThis[portKey]=ports
const portUrl='data:text/javascript;base64,'+Buffer.from(Object.keys(ports).map(key=>`export const ${key}=globalThis.${portKey}.${key}`).join('\n')).toString('base64')
const portModules=['campaign-ch3-assets.mjs','campaign-ch3-personnel-visual.mjs','campaign-ch3-sniper-visual.mjs','campaign-ch3-conversation.mjs','campaign-ch3-dialogue.mjs']
const source=(await fs.readFile(new URL('./campaign-ch3-runtime.mjs',import.meta.url),'utf8')).replace(/from '(\.\/[^']+)'/g,(_,specifier)=>
  `from '${portModules.includes(specifier.slice(2))?portUrl:new URL(specifier,import.meta.url).href}'`)
const {loadChapter3RuntimeResources,installChapter3Runtime}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
delete globalThis[portKey]

function fixture() {
  let down=false,pressed=false,intro=false,losBlocked=false
  const events=new Map(),emitted=[],checkpoints=[],radios=[],messages=[],hits=[]
  let missionState={...createCampaignState(),currentChapter:'CH3'}
  const mission={...missionState.flags}
  const g={...f.g,scene:new T.Scene(),game:{state:'playing',run:{time:0}},time:{frame:1},
    enemies:{raycast:()=>null},input:{down:()=>down,pressed:()=>pressed},
    events:{on(k,fn){if(!events.has(k))events.set(k,new Set());events.get(k).add(fn)},off(k,fn){events.get(k)?.delete(fn)},
      emit(k,e){for(const fn of [...events.get(k)||[]])fn(e)}},
    hud:{setPrompt(text){this.prompt=text},message:(...args)=>messages.push(args),radio:(...args)=>radios.push(args)},
    player:{pos:v(-56,0,-190),eye:v(-56,1.68,-190),forward:v(1,0,0),alive:true,enabled:true,onGround:true,
      health:100,vel:v(),speed:0,crouching:false,
      captureCampaignCollider(){return {position:this.pos.clone(),radius:.32,height:1.8}},damage(n){hits.push(n);this.health-=n}}}
  const nativeLos=g.physics.lineOfSight
  // Only the explicit LOS rejection case uses this port; all other rays are native.
  g.physics={...g.physics,lineOfSight:(a,b)=>!losBlocked&&nativeLos(a,b)}
  let kit={slots:{rifle:{owned:true,ammo:2,reserve:3},pistol:{owned:true,ammo:1,reserve:2}}},restores=0
  const equipment={capture:()=>json(kit),snapshot:()=>({slots:{rifle:{magSize:30,reserveCap:90},pistol:{magSize:12,reserveCap:48}}}),
    restore(saved){restores++;kit=json(saved)}}
  const previousDocument=globalThis.document
  globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})}
  let runtime
  try {runtime=installChapter3Runtime(g,equipment,{resources:{personnel:{},sniperResources:{}},narrative:{snapshot:()=>({active:intro})},flags:()=>mission,
    emit(event){
      const previous={...missionState,flags:{...mission}},next=applyCampaignEvent(previous,event)
      if(next===previous)return false
      missionState=next;Object.assign(mission,next.flags);emitted.push(event)
      return true},onCheckpoint:event=>checkpoints.push(event)})
  }finally{globalThis.document=previousDocument}
  const tick=(dt=.01)=>{g.time.frame++;g.game.run.time+=dt;runtime.update(dt)}
  const place=(p,target=v(-45,1.322,-142))=>{g.player.pos.copy(p);g.player.eye.copy(p).y+=1.68;g.player.forward.copy(target).sub(p).setY(0).normalize()}
  const release=()=>{down=pressed=false;g.time.frame++;runtime.interact(.01)}
  const press=()=>{release();down=pressed=true;g.time.frame++;return runtime.interact(.01)}
  const enable=()=>{mission.chapter3Entered=mission.chapter3IntroRead=true;tick()}
  const kill=id=>{const m=runtime.clearance.members.find(m=>m.id===id);m.target.actor.damage(100,m.target.actor.pos.clone().add(v(0,1,0)),v(1,0,0),'body')}
  const rescueWorker=()=>{enable();for(const id of CH3_RESCUE_BLOCKERS)kill(id);tick()
    place(v(-35.7,0,-141.06),v(door.x,1.12,-141.06));assert.equal(press(),true)
    place(v(-43.5,.172,-142));assert.equal(press(),true);return json(runtime.capture())}
  return {g,runtime,equipment,mission,emitted,checkpoints,radios,messages,hits,tick,place,press,release,enable,kill,rescueWorker,
    setIntro(x){intro=x},setLosBlocked(x){losBlocked=x},restores:()=>restores,
    dispose(){runtime.dispose();assert.equal(g.scene.children.length,0);for(const list of events.values())assert.equal(list.size,0)}}
}

test('resource pack borrows personnel character, leaves g untouched, releases on failed loads and idempotent disposal',async()=>{
  for(const fail of [null,'personnel','sniper']){
    loading={fail,calls:[],assets:resource('assets'),personnel:resource('personnel'),sniper:resource('sniper')}
    const g={THREE:T,campaignAssets:{sentinel:true}},before={...g.campaignAssets}
    if(fail){await assert.rejects(loadChapter3RuntimeResources(g),new RegExp(`${fail} failure`));assert.equal(loading.assets.releases,1)
      assert.equal(loading.personnel.releases,fail==='sniper'?1:0)}
    else {const resources=await loadChapter3RuntimeResources(g);assert.equal(resources.personnel,loading.personnel);resources.dispose();resources.dispose()
      for(const name of ['assets','personnel','sniper'])assert.equal(loading[name].releases,1)}
    assert.deepEqual(g.campaignAssets,before)
  }
})

test('production module resolves the supplied conversation and radio exports',async()=>{
  const runtime=await import('./campaign-ch3-runtime.mjs')
  assert.equal(typeof runtime.loadChapter3RuntimeResources,'function')
  assert.equal(typeof runtime.installChapter3Runtime,'function')
})

test('initial/intro/modal combat gates disable native targets and hearing; accepted controllers keep their damage/HP',()=>{
  const a=fixture(),{runtime:r,g}=a
  try {
    for(const mode of ['not-entered','intro-unread','opening']){
      if(mode==='intro-unread')a.mission.chapter3Entered=true
      if(mode==='opening'){a.mission.chapter3IntroRead=true;a.setIntro(true)}
      a.tick(1);assert.equal(r.sniper.target.actor.active,false);assert.ok(r.clearance.members.every(m=>!m.target.actor.active))
      assert.equal(r.sniper.target.actor.damage(200,v(),v(1,0,0),'body'),false)
      g.events.emit('weapon:fire',{origin:g.player.pos.clone().add(v(0,1.6,0)),dir:v(1,0,0)})
      assert.ok(r.clearance.capture().members.every(m=>m.lastKnown===null))
    }
    a.setIntro(false);a.enable();assert.equal(r.sniper.target.actor.active,true)
    assert.equal(r.sniper.target.actor.hp,200);assert.ok(r.clearance.members.every(m=>m.target.actor.hp===100))
    r.conversation.open();a.tick(3);assert.equal(r.sniper.target.actor.active,false);assert.ok(r.clearance.members.every(m=>!m.target.actor.active))
    assert.deepEqual(a.hits,[]);r.conversation.cancel();a.tick();assert.equal(r.sniper.target.actor.active,true)
  }finally{a.dispose()}
})

test('only c3-2/c3-3 unlock; rescue E cannot start testimony; next fresh E needs indoor facing/range/LOS',()=>{
  const a=fixture(),{runtime:r,g}=a
  try {
    a.rescueWorker();assert.equal(r.rescue.capture().rescued,true);assert.equal(r.conversation.snapshot().active,false)
    assert.equal(r.clearance.members.filter(m=>m.target.actor.alive).length,11);assert.equal(r.sniper.target.actor.alive,true)
    assert.deepEqual(a.emitted,[{type:'worker-rescued'},{type:'sniper-threat-resolved',method:'bypassed'}])
    assert.equal(r.interact(.01),false,'same rescue input frame is consumed')
    for(const mode of ['facing','los','outside','distant']){
      a.place(v(-43.5,.172,-142))
      if(mode==='facing')g.player.forward.negate()
      if(mode==='los')a.setLosBlocked(true)
      if(mode==='outside')a.place(v(-43.5,0,-144))
      if(mode==='distant')a.place(v(-40,.172,-142))
      a.press();assert.equal(r.conversation.snapshot().active,false);a.setLosBlocked(false)
    }
    a.place(v(-43.5,.172,-142));assert.equal(a.press(),true);assert.equal(r.sniper.target.actor.active,false)
    r.conversation.cancel();assert.equal(a.mission.accessCredentialObtained,false)
    a.tick();assert.equal(a.press(),true);r.conversation.complete()
    assert.equal(a.mission.accessCredentialObtained,true);assert.equal(a.mission.testimonyHeard,true)
    assert.equal(a.emitted.filter(e=>e.type==='worker-testimony-completed').length,1)
    assert.equal(r.validateCapture(json(r.capture()),a.mission),true)
    a.tick();assert.equal(r.sniper.target.actor.active,true,'bypassed live tower resumes after dialogue')
  }finally{a.dispose()}
})

test('real native tower death emits defeated once and checkpoints without full diagnostic snapshots',()=>{
  const a=fixture(),{runtime:r}=a
  try {
    a.enable();r.sniper.snapshot=()=>{throw Error('diagnostic snapshot in native loop')}
    r.clearance.snapshot=()=>{throw Error('diagnostic snapshot in native loop')}
    r.sniper.target.actor.damage(200,v(8,6,-154),v(0,0,-1),'body');a.tick()
    assert.deepEqual(a.emitted,[{type:'sniper-threat-resolved',method:'defeated'}])
    assert.ok(a.checkpoints.some(e=>e.kind==='ch3-sniper-defeated'))
    assert.equal(r.validateCapture(json(r.capture()),a.mission),true)
  }finally{a.dispose()}
})

test('contact needs a nearby live soldier with real direct perception and current LOS; an unseen indoor approach stays silent',()=>{
  const a=fixture(),{runtime:r}=a
  try {
    a.enable();a.place(v(-37.5,.172,-142));a.tick(1)
    assert.ok(!r.capture().progress.radio.triggered.includes('contact'))
    a.place(v(-57,0,-137));a.tick(1)
    const soldier=r.clearance.members.find(m=>m.id==='west-4')
    assert.equal(soldier.target.actor.alive,true);assert.equal(soldier.knownKind,'seen');assert.ok(soldier.visible)
    assert.equal(a.g.physics.lineOfSight(soldier.visual.getEye(),a.g.player.eye),true)
    assert.ok(r.capture().progress.radio.triggered.includes('contact'))
  }finally{a.dispose()}
})

test('ammo owns nearby interaction, refills both owned weapons once, and consumed groups require all three deaths',()=>{
  const a=fixture(),{runtime:r}=a
  try {
    a.rescueWorker()
    for(const id of ['c1-1','c1-2','c1-3'])a.kill(id)
    a.tick();const station=r.ammo.snapshot().sites.find(s=>s.group==='g1'),target=v(...station.target)
    a.place(v(-20,0,-185),target);assert.equal(a.press(),true)
    assert.deepEqual(a.equipment.capture().slots,{rifle:{owned:true,ammo:30,reserve:90},pistol:{owned:true,ammo:12,reserve:48}})
    assert.deepEqual(json(r.ammo.capture().consumed),['ch3-ammo-g1']);const restores=a.restores();a.press();assert.equal(a.restores(),restores)
    assert.equal(r.conversation.snapshot().active,false)
    const saved=json(r.capture());assert.equal(r.validateCapture(saved,a.mission),true)
    const invalid=json(saved);invalid.ammo.consumed.push('ch3-ammo-g3')
    assert.throws(()=>r.validateCapture(invalid,a.mission),/Invalid CH3 runtime/)
  }finally{a.dispose()}
})

test('JSON capture validates rescue, mission credential, radio and sniper invariants before mutations',()=>{
  const a=fixture(),{runtime:r}=a
  try {
    a.rescueWorker();const saved=json(r.capture()),flags={...a.mission}
    for(const change of [s=>s.version=9,s=>s.rescue.unlocked=false,s=>s.sniper.hp=201,s=>s.sniper.alive=false,
      s=>s.sniper.core.direction=[NaN,0,1],s=>s.sniper.core.shotId=-1,s=>s.sniper.core.state='DEAD',
      s=>s.progress.radio.played.push('warning:0'),s=>s.progress.radio.queue.push('missing:0'),
      s=>s.clearance.members.find(m=>m.id==='c3-2').alive=true]){
      const bad=json(saved);change(bad);assert.throws(()=>r.validateCapture(bad,flags));assert.deepEqual(json(r.capture()),saved)
    }
    for(const bad of [{...flags,survivorRescued:false},{...flags,survivorContacted:false},{...flags,accessCredentialObtained:true},
      {...flags,testimonyHeard:true,accessCredentialObtained:true,survivorContacted:false},{...flags,sniperThreatResolved:false}])
      assert.throws(()=>r.validateCapture(saved,bad),/Invalid CH3 runtime/)
    assert.equal(r.validateCapture(saved,flags),true)
  }finally{a.dispose()}
})

test('retry restores door before actors then ammo, reuses instances, retains warning/radio and clears pending aims/bursts',()=>{
  const a=fixture(),{runtime:r}=a
  try {
    a.enable();const saved=json(r.capture()),actors=r.clearance.members.map(m=>m.target.actor),tower=r.sniper.target.actor,worker=r.worker
    const warned=json(saved.sniper);warned.warningSeen=true;r.sniper.reset(warned);a.tick()
    assert.equal(a.radios.length,1)
    saved.sniper.core={...saved.sniper.core,state:'LOCK',target:[-20,1,-190],direction:[0,0,-1],aimElapsed:.6}
    saved.clearance.members[0].state='FIRE'
    const order=[]
    for(const [object,key,label] of [[r.rescue,'restore','door'],[r.clearance,'reset','actors'],[r.sniper,'reset','sniper'],[r.ammo,'restore','ammo']]){
      const original=object[key];object[key]=(...args)=>{order.push(label);return original(...args)}
    }
    const beforePlayer=gatherPlayer(a.g),beforeEquipment=a.equipment.capture()
    r.reset(saved,{retry:true});assert.deepEqual(order,['door','actors','sniper','ammo'])
    assert.deepEqual(gatherPlayer(a.g),beforePlayer);assert.deepEqual(a.equipment.capture(),beforeEquipment)
    assert.equal(r.worker,worker);assert.equal(r.sniper.target.actor,tower)
    for(let i=0;i<actors.length;i++)assert.equal(r.clearance.members[i].target.actor,actors[i])
    assert.equal(r.sniper.capture().warningSeen,true);assert.equal(r.sniper.capture().core.aimElapsed,0)
    assert.equal(r.sniper.capture().core.direction,null)
    assert.ok(r.clearance.members.every(m=>m.burstRemaining===0&&m.aimElapsed===0&&m.direction===null))
    a.tick(.01);assert.equal(a.radios.length,1,'retry must not resend a played warning line')
    assert.equal(r.validateCapture(json(r.capture()),a.mission),true)
  }finally{a.dispose()}
})
const gatherPlayer=g=>({position:g.player.pos.toArray(),health:g.player.health})

test('radio is ordered, one-shot, freezes on pause/modal and departure requires real credentialled room exit',()=>{
  const a=fixture(),{runtime:r,g}=a
  try {
    a.enable();const warned=json(r.sniper.capture());warned.warningSeen=true;r.sniper.reset(warned);a.tick(.01)
    assert.equal(a.radios[0][0],'warning：warning first')
    const remaining=r.capture().progress.radio.remaining
    g.game.state='paused';a.tick(30);assert.equal(r.capture().progress.radio.remaining,remaining)
    g.game.state='playing';r.conversation.open();a.tick(30);assert.equal(r.capture().progress.radio.remaining,remaining)
    r.conversation.cancel();a.tick(8);assert.equal(a.radios[1][0],'warning：warning second')
    a.rescueWorker();a.place(v(-38,.172,-142));a.tick();a.place(v(-35.5,0,-142));a.tick()
    assert.ok(!r.capture().progress.radio.triggered.includes('departure'))
    a.place(v(-43.5,.172,-142));a.press();r.conversation.complete()
    a.place(v(-38,.172,-142));a.tick();g.game.state='paused';a.tick(5)
    g.game.state='playing';a.place(v(-35.5,0,-142));a.tick()
    assert.ok(r.capture().progress.radio.triggered.includes('departure'))
    const current=json(r.capture());r.reset(current,{retry:true});assert.equal(r.validateCapture(json(r.capture()),a.mission),true)
    for(let i=0;i<16;i++)a.tick(8)
    const text=a.radios.map(([line])=>line);assert.equal(new Set(text).size,text.length)
    assert.ok(text.includes('departure：departure first'))
    assert.ok(!text.includes('rescue：rescue second'),'testimony must retire an unfinished earlier rescue exchange')
    assert.ok(r.capture().progress.radio.skipped.includes('rescue:1'))
  }finally{a.dispose()}
})

test('resolved blockade and active testimony discard stale radios without marking them heard or replaying on retry',()=>{
  const a=fixture(),{runtime:r}=a
  try {
    a.enable();a.place(v(-35,0,-142));a.tick()
    for(const id of CH3_RESCUE_BLOCKERS)a.kill(id)
    a.tick()
    assert.ok(r.capture().progress.radio.skipped.includes('blockade:1'))
    assert.ok(!r.capture().progress.radio.played.includes('blockade:1'))
    a.place(v(-35.7,0,-141.06),v(door.x,1.12,-141.06));a.press()
    a.place(v(-43.5,.172,-142));a.press();a.press()
    assert.equal(r.conversation.snapshot().active,true)
    const saved=json(r.capture());assert.equal(saved.progress.radio.queue.length,0)
    assert.equal(r.validateCapture(saved,a.mission),true)
    r.reset(saved,{retry:true})
    const before=a.radios.length;for(let i=0;i<5;i++)a.tick(8)
    assert.equal(a.radios.length,before)
  }finally{a.dispose()}
})

test('exit observes a grounded continuous plane crossing only; credentialless attempts hint, never enter CH4 or complete game',()=>{
  const a=fixture(),{runtime:r}=a
  try {
    a.enable()
    assert.equal(r.observeExit(v(-59,0,-110),v(-61,0,-110)),false);assert.equal(a.messages.length,1)
    a.rescueWorker();a.press();r.conversation.complete()
    for(const [from,to] of [[v(-59,0,-190),v(-61,0,-190)],[v(-58,0,-110),v(-63,0,-110)],
      [v(-59,2,-110),v(-61,2,-110)],[v(-61,0,-110),v(-62,0,-110)],[v(-61,0,-110),v(-59,0,-110)],
      [v(-59,0,-116),v(-61,0,-116)],[v(-59,0,-104),v(-61,0,-104)],[v(NaN,0,-110),v(-61,0,-110)]])
      assert.equal(r.observeExit(from,to),false)
    assert.equal(r.observeExit(v(-59,0,-116.5),v(-61,0,-113.5)),true,'intersection z, rather than either endpoint, selects the physical opening')
    assert.equal(r.observeExit(v(-59,0,-110),v(-61,0,-110)),false)
    assert.equal(a.emitted.filter(e=>e.type==='chapter3-exited').length,1);a.tick()
    assert.equal(r.sniper.target.actor.active,true);assert.equal(a.g.game.state,'playing')
  }finally{a.dispose()}
})
