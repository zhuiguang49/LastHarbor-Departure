import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { parse } from '@babel/parser'
import { installEquipment } from './equipment.mjs'
import { CH1 } from './campaign-ch1-layout.mjs'
import { KNIFE } from './knife.mjs'
import { knifeSamples } from './knife-sound.mjs'

// Exercise the exact Three.js shipped by the immutable source, without a GPU or
// a second dependency. Suppress only the boot call; no game code is evaluated as
// part of an assertion and the production source is never written.
const html = await fs.readFile(new URL('../../几猫国产3A大作_V1-fable5.2.html', import.meta.url), 'utf8')
const source = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const startup = 'QC().catch(i=>bM(i&&i.stack||i));'
assert.equal(source.split(startup).length, 2)
const noop = () => {}, box = { console: { ...console, error: noop }, document: { getElementById: () => ({}) }, addEventListener: noop, setTimeout: noop, URLSearchParams, performance, AbortController, TextDecoder, navigator: { userAgent: '' }, location: { search: '' } }
box.window = box
const viewAdapter = 've.equipmentView={hands:[A,q],firearm:e.children.filter(o=>o!==A&&o!==q&&o!==x),effects:[x],createGripHand(options){return Vv(options).fabric},gloveMaterial:_,setTrigger(amount){z(amount)},cancelActions(){k.adsLin=k.adsE=0;k.reload=null;k.autoReload=-1;k.inspect=-1;k.idleT=0}};'
assert.equal(source.split('return _e(),ve}').length,2)
assert.ok((await fs.readFile(new URL('./build-night.mjs',import.meta.url),'utf8')).includes(viewAdapter))
vm.runInNewContext(source.replace('return _e(),ve}',viewAdapter+'return _e(),ve}').replace(startup, 'globalThis.THREE=lt;globalThis.createHandPose=Vv;globalThis.originalPhysics=d3;globalThis.originalWeapon=dm;globalThis.houndHelpers={sM,nM,ni};'), box)
const T = box.THREE
const functions = new Map()
function visit(n) { if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration')functions.set(n.id.name,n);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v) }
visit(parse(source))
// Execute the immutable source's actual manager/gull methods with their lexical
// state supplied. No model/AI replacement is needed to exercise collision and
// damage contracts, and the native physics implementation runs in full.
function originalMethod(scope,name,bindings) {
  const matches=[]
  function find(n) { if(!n||typeof n!=='object')return;if(n.type==='ObjectMethod'&&n.key?.name===name)matches.push(n);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(find);else if(v&&typeof v==='object')find(v) }
  find(functions.get(scope));assert.equal(matches.length,1,`${scope}.${name}`)
  const node=matches[0]
  return new Function(...Object.keys(bindings),`return ({${source.slice(node.start,node.end)}}).${name}`)(...Object.values(bindings))
}
function fixture(options = {}) {
  const classes = new Set(), events = new Map(), pressed = new Set(), raw = { fire: false, ads: false }, keyHandlers = []
  globalThis.addEventListener = (name, fn) => { if (name === 'keydown') keyHandlers.push(fn) }
  globalThis.document = {
    createElement: tag => tag === 'canvas' ? { getContext: () => ({ fillText() {}, createImageData: (w,h) => ({data:new Uint8ClampedArray(w*h*4)}), putImageData() {} }) } : {}, head: { append() {} },
    documentElement: { classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name) } } },
  }
  const hands = [new T.Group(), new T.Group()], firearm = [new T.Group(),new T.Group()], effects = [new T.Group()]
  const calls = { reset: 0, update: 0, shots: [], reload: 0, sounds: [], shells: 0, trigger: 0, events:[], damage:[], provoke:0, shakes:[] }, prompt = { textContent: '' }
  const g = {
    THREE: T, scene: new T.Scene(), camera: new T.PerspectiveCamera(70), viewCamera: new T.PerspectiveCamera(55), game: { state: 'playing' }, time:{frame:0},
    mats: { get: () => new T.MeshStandardMaterial(), label: () => ({ material: new T.MeshStandardMaterial() }) },
    player: { pos: new T.Vector3(-32.1,0,.15), eye: new T.Vector3(-32.1,1.68,.15), forward: new T.Vector3(-1,0,0), alive: true, ads: 0, invulnerable: false, speed: 0, addShake:amount=>calls.shakes.push(amount) },
    input: { fire: false, ads: false, down: a => pressed.has(a), pressed: a => pressed.has(a), update() { this.fire=raw.fire; this.ads=raw.ads } },
    combat: { playerShot(origin,dir,options) { calls.shots.push({ origin:origin?.clone(),dir:dir?.clone(),options }); return null } },
    fx: { tracer() {}, shell() { calls.shells++ } }, audio: { play(name) { calls.sounds.push(name) } },
    events: { on(name,fn) { const list=events.get(name)||[];list.push(fn);events.set(name,list) }, emit(name,data) { calls.events.push({name,data});for(const fn of events.get(name)||[])fn(data) } },
    hud: { root: { querySelector: () => prompt }, update() {}, setObjective(text) { this.objective=text }, setMarkers(markers) { this.markers=markers }, setPrompt(text) { this.prompt=text }, message() {} },
    weapon: {
      root: new T.Group(), equipmentView: { hands,firearm,effects,createGripHand:options=>box.createHandPose(options).fabric,gloveMaterial:new T.MeshStandardMaterial({vertexColors:true}),cancelActions() {},setTrigger(v) { calls.trigger=v } },
      name:'original',ammo:30,magSize:30,reserve:150,damage:options.rifleDamage??26,rpm:720,state:'idle',ads:0,debug:{},
      reset() { calls.reset++;this.ammo=30;this.reserve=150;this.state='idle';this.ads=0 },
      reloadNow() { calls.reload++;this.state='reloading';return true },
      update() { calls.update++;this.root.position.y=-.12;this.ads=g.input.ads?1:0;if(g.input.pressed('reload'))this.reloadNow();if(g.input.fire&&!this.debug.noFire){this.ammo--;g.combat.playerShot()}effects[0].visible=true },
    },
  }
  g.physics=box.originalPhysics(g)
  g.enemies={list:[]};g.enemies.raycast=originalMethod('Em','raycast',{t:g.enemies.list,W:T.Vector3})
  g.weapon.root.add(...firearm,...hands,...effects)
  const environment = { ...options, mesh(geometry,material,position,parent) { const o=new T.Mesh(geometry,material);o.position.set(...position);parent.add(o);return o },lamp() {return {}} }
  const equipment=options.deferInstall ? null : installEquipment(g,environment)
  function frame(dt=.016) {g.time.frame++;g.input.update(dt);g.weapon.update(dt);g.hud.update(dt)}
  function advance(seconds) {for(let n=0;n<Math.ceil(seconds/.016);n++)frame()}
  function pickup(id='pistol') {const {position:target,yaw}=equipment.snapshot().pickups.find(p=>p.id===id);g.player.pos.set(target[0]+Math.sin(yaw)*1.37,0,target[2]+Math.cos(yaw)*1.37);g.player.eye.copy(g.player.pos).y=1.68;g.player.forward.set(-Math.sin(yaw),0,-Math.cos(yaw));pressed.add('interact');equipment.update();pressed.clear();frame();return equipment.snapshot()}
  function enemy(distance,offset=0) {
    // Gull ellipsoid radius is .5: put its nearest face at the requested reach.
    const enemy={id:g.enemies.list.length+1,type:'gull',alive:true,hp:100,pos:g.player.eye.clone().add(new T.Vector3(offset,.03,-distance-.5)),vel:new T.Vector3(),roll:0,pitch:0}
    enemy._raycast=originalMethod('Q_','_raycast',{d:enemy})
    const damage=originalMethod('Q_','damage',{d:enemy,s:g,i:{provoke(){calls.provoke++}},o:()=>.5,v(){enemy.alive=false;g.events.emit('enemy:killed',{enemy})}})
    enemy.damage=(...args)=>{calls.damage.push(args);return damage(...args)};g.enemies.list.push(enemy);return enemy
  }
  function wall(distance) {const o=g.player.eye;return g.physics.addBox(new T.Vector3(o.x-1,0,o.z-distance-.1),new T.Vector3(o.x+1,3,o.z-distance),{surface:'metal'})}
  return {g,equipment,environment,calls,classes,raw,pressed,hands,firearm,effects,prompt,keyHandlers,frame,advance,pickup,enemy,wall}
}

test('unarmed suppresses every weapon entry while retaining original detailed hand layer',()=>{
  const f=fixture(),{g}=f;f.raw.fire=f.raw.ads=true;f.pressed.add('reload');f.frame()
  assert.equal(g.input.fire,false);assert.equal(g.input.ads,false);assert.equal(g.input.down('reload'),false);assert.equal(g.weapon.reloadNow(),false);assert.equal(g.combat.playerShot(),null)
  assert.equal(f.calls.shots.length,0);assert.equal(f.calls.reload,0);assert.equal(f.calls.update,1);assert.equal(g.weapon.ammo,30);assert.equal(g.weapon.reserve,30)
  assert.ok(f.hands.every(h=>h.visible&&h.layers.mask===1));assert.ok(f.firearm.every(o=>!o.visible));assert.ok(f.classes.has('harbor-unarmed'));assert.equal(f.equipment.select(1),false)
})

test('rifle tuning reaches the native combat call once and survives switching, reset and JSON retry',()=>{
  for(const [original,expected] of [[20,25],[25,25],[26,31]]){
    const f=fixture({rifleDamage:original});f.pickup('rifle')
    const saved=JSON.parse(JSON.stringify(f.equipment.capture()))
    for(let i=0;i<3;i++){
      f.equipment.reset();f.equipment.restore(saved)
      assert.equal(f.g.weapon.damage,expected)
      f.g.combat.playerShot(f.g.player.eye,f.g.player.forward,{damage:original,range:300})
      assert.equal(f.calls.shots.at(-1).options.damage,expected)
      assert.equal(f.calls.shots.at(-1).options.range,300)
    }
    f.pickup('pistol');f.raw.fire=true;f.advance(.5)
    assert.equal(f.calls.shots.at(-1).options.damage,34)
    f.equipment.select('rifle');assert.equal(f.g.weapon.damage,expected)
  }
})

test('M2 uses independent anchored warehouse lockers and root gates, preserving legacy defaults',()=>{
  const f=fixture({campaignM2:true}),snap=f.equipment.snapshot()
  assert.deepEqual(snap.pickups.map(p=>[p.id,...p.position]),Object.entries(CH1.pickups).map(([id,a])=>[id,...a.position]))
  assert.equal(f.equipment.objective(),null);f.g.hud.setMarkers([]);assert.deepEqual(f.g.hud.markers,[])
  for(const p of snap.pickups){
    const collider=f.g.physics.boxes.find(b=>b.tag===`harbor-security-${p.id}-locker`),normal=new T.Vector3(Math.sin(p.yaw),0,Math.cos(p.yaw)),center=collider.min.clone().add(collider.max).multiplyScalar(.5)
    assert.ok(center.sub(new T.Vector3(...p.position)).dot(normal)<0,'collider stays behind accessible pickup')
    const locker=f.g.scene.getObjectByName(`security-${p.id}-locker`),sign=locker.children.find(o=>o.isMesh&&o.geometry.type==='PlaneGeometry')
    locker.updateMatrixWorld(true);const signNormal=new T.Vector3(0,0,1).transformDirection(sign.matrixWorld)
    assert.ok(signNormal.distanceTo(normal)<1e-10,'sign faces the anchor interior')
  }
  for(const id of ['rifle','knife']){assert.equal(f.equipment.setPickupEnabled(id,false),true);assert.equal(f.pickup(id).slots[id].owned,false)}
  assert.equal(f.pickup('pistol').activeWeapon,'pistol')
  assert.equal(f.equipment.setPickupEnabled('rifle',true),true);assert.equal(f.pickup('rifle').activeWeapon,'rifle')
  assert.equal(f.equipment.snapshot().slots.knife.owned,false)
  assert.equal(f.equipment.setPickupEnabled('rifle',false),true)
  assert.equal(f.equipment.setPickupEnabled('knife',true),true);assert.equal(f.pickup('knife').activeWeapon,'knife')
  assert.deepEqual([f.equipment.snapshot().slots.rifle.ammo,f.equipment.snapshot().slots.rifle.reserve],[40,160])
  assert.equal(f.equipment.setPickupEnabled('unknown',true),false)
  const legacy=fixture();assert.deepEqual(legacy.equipment.snapshot().pickups.map(p=>[...p.position]),[[-33.47,1.12,.15],[-33.47,1.12,-1.65],[-33.47,1.12,1.95]])
})

test('equipment capture/restore conserves independent ammo, ownership and gates, cancelling pending reloads',()=>{
  const f=fixture({campaignM2:true});f.pickup('pistol');f.g.weapon.ammo=4;f.g.weapon.reserve=7
  assert.equal(f.equipment.addAmmo('rifle',30),0);assert.equal(f.equipment.snapshot().slots.rifle.owned,false)
  f.equipment.setPickupEnabled('knife',false)
  const saved=JSON.parse(JSON.stringify(f.equipment.capture()))
  f.g.weapon.reloadNow();f.advance(.6);assert.notEqual(f.equipment.snapshot().pistol.reloadTime,null)
  f.equipment.restore(saved);assert.equal(f.equipment.snapshot().pistol.reloadTime,null)
  f.advance(2);assert.deepEqual(f.equipment.capture(),saved)
  f.pickup('rifle');assert.equal(f.g.weapon.reserve,160)
  f.equipment.reset();assert.ok(f.equipment.snapshot().pickups.every(p=>p.visible&&p.enabled&&!p.owned))
  f.g.game.state='paused';f.equipment.restore(saved);assert.deepEqual(f.equipment.capture(),saved)
  saved.slots.pistol.ammo=999;saved.pickupEnabled.knife=true
  assert.equal(f.equipment.capture().slots.pistol.ammo,4);assert.equal(f.equipment.capture().pickupEnabled.knife,false)
  for(const [id,amount] of [['knife',10],['unknown',10],['pistol',-1],['pistol',NaN],['pistol',Infinity],['pistol',1.2]])assert.equal(f.equipment.addAmmo(id,amount),0)
  assert.equal(f.equipment.capture().slots.pistol.reserve,7)
})

test('M2 ammo caps apply to additions, native counters and restoration without granting ownership',()=>{
  const f=fixture({campaignM2:true}),saved=f.equipment.capture()
  saved.slots.rifle={owned:false,ammo:500,reserve:500};saved.slots.pistol={owned:false,ammo:500,reserve:500}
  f.equipment.restore(saved)
  assert.deepEqual(f.equipment.capture().slots.rifle,{owned:false,ammo:40,reserve:160})
  assert.deepEqual(f.equipment.capture().slots.pistol,{owned:false,ammo:12,reserve:48})
  assert.equal(f.equipment.addAmmo('pistol',48),0);assert.equal(f.equipment.refill('rifle'),false);assert.equal(f.equipment.refill('pistol'),false)
  saved.slots.pistol={owned:false,ammo:2,reserve:3};f.equipment.restore(saved)
  assert.equal(f.equipment.addAmmo('pistol',100),45);assert.equal(f.equipment.capture().slots.pistol.owned,false)
  f.pickup('pistol');f.g.weapon.ammo=900;f.g.weapon.reserve=900
  assert.deepEqual(f.equipment.capture().slots.pistol,{owned:true,ammo:12,reserve:48})
  f.g.weapon.ammo=3;f.g.weapon.reserve=1;assert.equal(f.equipment.addAmmo('pistol',10),10)
  assert.equal(f.equipment.addAmmo('pistol',Number.MAX_SAFE_INTEGER),37)
  assert.equal(f.equipment.refill('pistol'),true);assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],[12,48]);assert.equal(f.equipment.refill('pistol'),false)
  f.pickup('rifle');f.g.weapon.ammo=2;f.g.weapon.reserve=159;assert.equal(f.equipment.addAmmo('rifle',9),1)
  assert.equal(f.equipment.refill('rifle'),true);assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],[40,160]);assert.equal(f.equipment.refill('rifle'),false)
  for(const id of ['knife','unknown'])assert.equal(f.equipment.refill(id),false)
  const legacy=fixture();legacy.pickup('rifle');assert.equal(legacy.equipment.addAmmo('rifle',200),200);assert.deepEqual([legacy.g.weapon.ammo,legacy.g.weapon.reserve],[30,230])
})

test('native dm reload transfers rounds to the M2 forty-round magazine and preserves the legacy thirty',async()=>{
  for(const campaignM2 of [false,true]){
    const f=fixture({campaignM2,deferInstall:true}),g=f.g
    g.weapon=await box.originalWeapon(g)
    const equipment=installEquipment(g,f.environment),p=equipment.snapshot().pickups.find(p=>p.id==='rifle')
    g.player.pos.set(p.position[0]+Math.sin(p.yaw)*1.37,0,p.position[2]+Math.cos(p.yaw)*1.37)
    g.player.eye.copy(g.player.pos).y=1.68;g.player.forward.set(-Math.sin(p.yaw),0,-Math.cos(p.yaw))
    f.pressed.add('interact');equipment.update();f.pressed.clear();g.weapon.debug.freeze=true
    const capacity=campaignM2 ? 40 : 30,reserve=campaignM2 ? 160 : 30
    assert.deepEqual([g.weapon.ammo,g.weapon.reserve],[capacity,reserve])
    // Empty and partial reloads execute the immutable native controller, including
    // its private reload timeline and the actual magazine-insertion transfer.
    for(const remaining of [0,7,35].filter(n=>n<capacity)){
      g.weapon.ammo=remaining;g.weapon.reserve=reserve
      assert.equal(g.weapon.reloadNow(),true);f.advance(1)
      assert.deepEqual([g.weapon.ammo,g.weapon.reserve],[remaining,reserve])
      f.advance(.4);assert.deepEqual([g.weapon.ammo,g.weapon.reserve],[capacity,reserve-(capacity-remaining)])
      f.advance(2);assert.equal(g.weapon.reloadNow(),false)
    }
    g.weapon.ammo=0;g.weapon.reserve=9;assert.equal(g.weapon.reloadNow(),true);f.advance(3)
    assert.deepEqual([g.weapon.ammo,g.weapon.reserve],[9,0])
  }
})

test('one native E edge cannot consume two physical pickups in one frame',()=>{
  const f=fixture({campaignM2:true});f.pickup('pistol')
  const p=f.equipment.snapshot().pickups.find(p=>p.id==='rifle'),aim=id=>{
    const target=f.equipment.snapshot().pickups.find(p=>p.id===id)
    f.g.player.pos.set(target.position[0],0,target.position[2]+1.37);f.g.player.eye.copy(f.g.player.pos).y=1.68;f.g.player.forward.set(0,0,-1)
  }
  assert.equal(p.owned,false);aim('rifle');f.pressed.add('interact');f.equipment.update();aim('knife');f.equipment.update()
  assert.equal(f.equipment.snapshot().slots.rifle.owned,true);assert.equal(f.equipment.snapshot().slots.knife.owned,false)
  f.frame();f.equipment.update();assert.equal(f.equipment.snapshot().slots.knife.owned,true)
})

test('three real pickups enforce fresh E, facing, height and line of sight',()=>{
  for(const id of ['pistol','rifle','knife'])for(const change of [g=>g.player.pos.x=-30,g=>g.player.pos.y=2,g=>g.player.forward.x=1,g=>g.physics.lineOfSight=()=>false]){const f=fixture();f.g.player.pos.z=f.equipment.snapshot().pickups.find(p=>p.id===id).position[2];change(f.g);f.pressed.add('interact');assert.equal(f.equipment.update(),false);assert.equal(f.equipment.snapshot().hasWeapon,false)}
  const f=fixture();assert.equal(f.equipment.update(),true);assert.equal(f.equipment.snapshot().hasFirearm,false);assert.match(f.prompt.textContent,/P12/)
  assert.equal(f.pickup().activeWeapon,'pistol');assert.equal(f.equipment.update(),false);assert.equal(f.equipment.select(1),false)
  assert.equal(f.pickup('rifle').activeWeapon,'rifle');assert.equal(f.equipment.select(3),false)
  assert.equal(f.pickup('knife').activeWeapon,'knife');assert.ok(Object.values(f.equipment.snapshot().slots).every(s=>s.owned));assert.equal(f.equipment.update(),false)
  assert.deepEqual(f.calls.sounds,['reload_magin','reload_magin','reload_magin']);assert.equal(f.equipment.snapshot().pickups.filter(p=>p.visible).length,0)
})

test('pistol fires exactly once per trigger edge through original combat and native casing FX',()=>{
  const f=fixture();f.pickup();f.advance(.5);const nativeUpdates=f.calls.update;f.raw.fire=true;f.advance(1)
  assert.equal(f.calls.shots.length,1);assert.equal(f.g.weapon.ammo,11);assert.equal(f.calls.shells,1);assert.equal(f.calls.update,nativeUpdates)
  assert.equal(f.calls.shots[0].options.damage,34);assert.equal(f.calls.shots[0].options.range,180);assert.ok(Math.abs(f.calls.shots[0].dir.length()-1)<1e-9)
  f.raw.fire=false;f.advance(.3);f.raw.fire=true;f.frame();assert.equal(f.calls.shots.length,2);assert.equal(f.g.weapon.ammo,10)
})

test('semi-auto cadence rejects early edges and never schedules an extra held shot',()=>{
  const f=fixture();f.pickup();f.advance(.5);f.raw.fire=true;f.frame();f.raw.fire=false;f.frame();f.raw.fire=true;f.advance(.5)
  assert.equal(f.calls.shots.length,1);assert.equal(f.g.weapon.ammo,11)
  f.raw.fire=false;f.frame();f.raw.fire=true;f.frame();assert.equal(f.calls.shots.length,2)
})

test('pistol automatically reloads after its last round without a new trigger and preserves semiauto',()=>{
  for(const hold of [false,true]){
    const f=fixture();f.pickup();f.advance(.5);f.g.weapon.ammo=1;f.g.weapon.reserve=17
    f.raw.fire=true;f.frame();f.raw.fire=hold
    assert.equal(f.g.weapon.ammo,0);f.advance(.28);assert.equal(f.equipment.snapshot().pistol.reloadTime,null)
    f.advance(.08);assert.equal(f.g.weapon.state,'reloading');assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],[0,17])
    f.advance(2.5);assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],[12,5]);assert.equal(f.calls.shots.length,1)
    assert.deepEqual(f.calls.events.filter(e=>e.name==='weapon:reload').map(e=>e.data.phase),['start','magout','magin','bolt','done'])
    f.raw.fire=false;f.frame();f.raw.fire=true;f.frame();assert.equal(f.calls.shots.length,2)
  }
})

test('pistol auto reload handles empty clicks, limited reserves and manual reload without duplicate transfers',()=>{
  for(const mode of ['no-reserve','empty-click','manual']){
    const f=fixture();f.pickup();f.advance(.5);f.g.weapon.ammo=mode==='empty-click'?0:1;f.g.weapon.reserve=mode==='no-reserve'?0:4
    f.raw.fire=true;f.frame();f.raw.fire=false
    if(mode==='manual')assert.equal(f.g.weapon.reloadNow(),true)
    f.advance(3)
    assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],mode==='no-reserve'?[0,0]:[4,0])
    assert.equal(f.calls.events.filter(e=>e.name==='weapon:reload'&&e.data.phase==='start').length,mode==='no-reserve'?0:1)
    assert.equal(f.equipment.snapshot().pistol.reloadTime,null)
  }
})

test('pistol pending auto reload freezes on pause and cancels on switch or death',()=>{
  for(const mode of ['pause','switch','death']){
    const f=fixture();f.pickup();if(mode==='switch'){f.pickup('rifle');f.equipment.select(2)}
    f.advance(.5);f.g.weapon.ammo=1;f.g.weapon.reserve=8;f.raw.fire=true;f.frame();f.raw.fire=false;f.advance(.1)
    if(mode==='pause'){
      f.g.game.state='paused';f.g.events.emit('game:state',{state:'paused'});f.advance(3)
      assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],[0,8]);assert.equal(f.equipment.snapshot().pistol.reloadTime,null)
      f.g.game.state='playing';f.g.events.emit('game:state',{state:'playing'});f.advance(.1)
      assert.equal(f.equipment.snapshot().pistol.reloadTime,null);f.advance(2.6);assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],[8,0])
    }else if(mode==='switch'){
      f.equipment.select(1);const rifle=[f.g.weapon.ammo,f.g.weapon.reserve];f.advance(3)
      assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],rifle);f.equipment.select(2);f.advance(3)
      assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],[0,8]);assert.equal(f.equipment.snapshot().pistol.reloadTime,null)
    }else{
      f.g.player.alive=false;f.g.game.state='dead';f.g.events.emit('game:state',{state:'dead'});f.advance(3)
      assert.equal(f.equipment.snapshot().hasWeapon,false)
    }
    if(mode!=='pause')assert.equal(f.calls.events.filter(e=>e.name==='weapon:reload').length,0)
  }
})

test('checkpoint validation rejects invalid inventory before changing the live equipment',()=>{
  const f=fixture({campaignM2:true}),equipment=f.equipment
  const saved=equipment.capture(),before=JSON.stringify(saved)
  assert.deepEqual(equipment.validateCapture(saved),saved)
  for(const mutate of [s=>s.slots.pistol.reserve=49,s=>s.slots.rifle.ammo=41,s=>s.activeWeapon='pistol',s=>delete s.pickupEnabled.knife]) {
    const bad=structuredClone(saved);mutate(bad)
    assert.throws(()=>equipment.validateCapture(bad),/Invalid equipment checkpoint/)
    assert.equal(JSON.stringify(equipment.capture()),before)
  }
})

test('model detail batches retain finite geometry, view layers and independent moving components',()=>{
  const f=fixture(),model=f.g.weapon.root.getObjectByName('harbor-p12-security-pistol'),meshes=[]
  model.traverse(o=>{if(o.isMesh)meshes.push(o)})
  assert.ok(meshes.length<22,'Fixed detail uses material batches rather than one draw per pin')
  assert.ok(model.getObjectByName('p12-reciprocating-slide'));assert.ok(model.getObjectByName('p12-detachable-magazine'))
  assert.ok(model.userData.parts.includes('hollow-trigger-guard'))
  assert.ok(model.getObjectByName('p12-reciprocating-slide').userData.parts.includes('rear-slide-serration'))
  for(const m of meshes){assert.equal(m.layers.mask,f.hands[0].layers.mask);for(const name of ['position','normal'])for(const v of m.geometry.attributes[name].array)assert.ok(Number.isFinite(v))}
  assert.ok(meshes.some(m=>m.material.roughnessMap&&m.material.bumpMap))
})

test('reload moves the physical magazine and support hand, transfers conserved ammo only at insertion',()=>{
  const f=fixture();f.pickup();f.advance(.5);f.g.weapon.ammo=5
  const before=f.equipment.snapshot().pistol;assert.equal(f.g.weapon.reloadNow(),true);f.advance(.75)
  const middle=f.equipment.snapshot().pistol;assert.ok(middle.reloadTime>.7);assert.notDeepEqual(middle.magazine,before.magazine);assert.notDeepEqual(middle.supportHand,before.supportHand)
  assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],[5,24]);f.advance(1.6);assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],[12,17]);assert.equal(f.equipment.snapshot().pistol.reloadTime,null)
})

test('empty reload locks the slide, racks it and respects limited reserves',()=>{
  const f=fixture();f.pickup();f.advance(.5);f.g.weapon.ammo=0;f.g.weapon.reserve=4;f.frame();assert.ok(f.equipment.snapshot().pistol.slide>.02)
  f.g.weapon.reloadNow();f.advance(1.7);assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],[4,0]);assert.ok(f.equipment.snapshot().pistol.slide>.02)
  f.advance(.6);assert.equal(f.equipment.snapshot().pistol.slide,0);assert.equal(f.g.weapon.reloadNow(),false)
})

test('owned slots switch independently, cancel reloads, and never overlap models',()=>{
  const f=fixture();f.pickup();f.g.weapon.ammo=7;f.g.weapon.reserve=13;f.pickup('rifle');assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],[30,30]);f.g.weapon.ammo=19;f.g.weapon.reserve=8
  assert.equal(f.equipment.select(2),true);assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],[7,13]);f.g.weapon.reloadNow();f.advance(.7);assert.equal(f.equipment.select(1),true)
  assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],[19,8]);assert.equal(f.equipment.snapshot().pistol.reloadTime,null);assert.ok(f.firearm.every(o=>o.visible))
  assert.equal(f.equipment.select(2),true);assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],[7,13]);assert.ok(f.firearm.every(o=>!o.visible));f.advance(2);assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],[7,13])
  f.keyHandlers[0]({code:'Digit1',repeat:false,preventDefault(){}});f.frame();assert.equal(f.equipment.snapshot().activeWeapon,'rifle')
})

test('pause retains ownership/ammo/reload timeline; death and native new-run reset remove both weapons',()=>{
  const f=fixture();f.pickup();f.pickup('rifle');f.equipment.select(2);f.g.weapon.ammo=4;f.g.weapon.reloadNow();f.advance(.5);const t=f.equipment.snapshot().pistol.reloadTime
  f.g.game.state='paused';f.g.events.emit('game:state',{state:'paused'});f.advance(1);assert.equal(f.equipment.snapshot().pistol.reloadTime,t);assert.equal(f.equipment.select(1),false)
  f.g.game.state='playing';f.g.events.emit('game:state',{state:'playing',prev:'paused'});assert.equal(f.equipment.snapshot().slots.pistol.ammo,4)
  f.g.player.alive=false;f.g.game.state='dead';f.g.events.emit('game:state',{state:'dead'});assert.equal(f.equipment.snapshot().hasFirearm,false)
  assert.ok(Object.values(f.equipment.snapshot().slots).every(s=>!s.owned));f.g.weapon.reset();assert.ok(f.equipment.snapshot().pickups.every(p=>p.visible));assert.equal(f.g.player.invulnerable,false)
})

test('markers/objectives compose with infrastructure; snapshots cannot mutate records; pickup flashes stay hidden',()=>{
  const f=fixture(),marker={id:'power'};f.g.hud.setMarkers([marker]);assert.equal(f.g.hud.markers.length,4);f.g.hud.setObjective('供电');assert.equal(f.g.hud.objective,f.equipment.objective())
  f.pickup();f.g.hud.setObjective('供电');assert.equal(f.g.hud.objective,'供电');assert.deepEqual(f.g.hud.markers.map(m=>m.id),['power','security-rifle','security-knife'])
  const snap=f.equipment.snapshot();snap.slots.pistol.ammo=999;snap.pickups[0].position[0]=0;assert.equal(f.g.weapon.ammo,12);assert.equal(f.equipment.snapshot().position[0],-33.47)
  const group=f.g.scene.getObjectByName('harbor-security-equipment');assert.equal(group.getObjectByName('security-pistol-pickup').getObjectByName('pistol-muzzle-flash').visible,false)
  for(const p of f.g.physics.boxes)assert.ok(p.max.x < -33.47);assert.doesNotThrow(()=>JSON.stringify(f.equipment.snapshot()))
})

test('knife-only ownership satisfies equipment objective but never exposes firearm inputs or ammo',()=>{
  const f=fixture(),s=f.pickup('knife');f.advance(.5)
  assert.equal(s.hasWeapon,true);assert.equal(s.hasFirearm,false);assert.equal(f.g.weapon.hasWeapon,true);assert.equal(f.g.weapon.hasFirearm,false)
  assert.equal(s.slots.rifle.owned,false);assert.equal(s.slots.pistol.owned,false);assert.equal(s.activeSlot,3)
  f.g.hud.setObjective('恢复应急供电');assert.equal(f.g.hud.objective,'恢复应急供电');assert.equal(f.equipment.objective(),null)
  f.raw.ads=true;f.pressed.add('ads');f.pressed.add('reload');f.advance(.4)
  assert.equal(f.g.input.ads,false);assert.equal(f.g.input.down('ads'),false);assert.equal(f.g.input.pressed('reload'),false);assert.equal(f.g.weapon.reloadNow(),false)
  assert.equal(f.g.weapon.ads,0);assert.equal(f.g.player.ads,0);assert.equal(f.g.combat.playerShot(),null)
  assert.equal(f.calls.reload,0);assert.equal(f.calls.shots.length,0);assert.ok(f.classes.has('harbor-knife'));assert.equal(f.classes.has('harbor-unarmed'),false)
  assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],[0,0]);assert.ok(f.firearm.every(o=>!o.visible))
})

test('knife executes one delayed native enemy hit per click, with impact and recovery poses',()=>{
  const f=fixture();f.pickup('knife');f.advance(.5);const enemy=f.enemy(1),updates=f.calls.update,home=f.equipment.snapshot().knife.modelPosition
  f.raw.fire=true;f.advance(.048);const winding=f.equipment.snapshot().knife
  assert.equal(winding.phase,'windup');assert.equal(winding.hits,0);assert.equal(enemy.hp,100);assert.ok(winding.modelPosition[1]-home[1]>.02);assert.ok(winding.spineDirection[2]>.85)
  f.advance(.064);const impact=f.equipment.snapshot().knife
  assert.ok(home[0]-impact.modelPosition[0]>.17);assert.ok(home[2]-impact.modelPosition[2]<.07);assert.ok(impact.contactPause>0);assert.ok(f.calls.shakes.at(-1)>=.2);assert.equal(impact.phase,'impact');assert.equal(impact.hits,1);assert.equal(impact.contacts,1);assert.equal(enemy.hp,100-KNIFE.damage)
  assert.equal(f.calls.provoke,1);assert.equal(f.calls.damage[0][3],'body');assert.ok(Math.abs(f.calls.damage[0][2].length()-1)<1e-9)
  assert.equal(f.calls.events.filter(e=>e.name==='player:hitEnemy').length,1);assert.equal(f.calls.events.filter(e=>e.name==='impact').length,1)
  f.advance(.12);assert.equal(f.equipment.snapshot().knife.phase,'recovery')
  f.advance(1);assert.equal(f.equipment.snapshot().knife.swings,1);assert.equal(f.equipment.snapshot().knife.hits,1)
  assert.equal(f.calls.events.filter(e=>e.name==='weapon:melee').length,0,'Native jump sound event must not be triggered');assert.equal(f.calls.events.filter(e=>e.name==='harbor:knife').length,2);
  assert.equal(f.calls.update,updates);assert.equal(f.calls.shots.length,0);assert.equal(f.calls.shells,0);assert.equal(f.calls.events.filter(e=>e.name==='weapon:fire').length,0)
  f.raw.fire=false;f.frame();f.raw.fire=true;f.advance(.23);assert.equal(f.equipment.snapshot().knife.hits,2)
})

test('knife cooldown rejects recovery and early repeat edges and does not queue a held attack',()=>{
  const f=fixture();f.pickup('knife');f.advance(.5);f.enemy(1)
  f.raw.fire=true;f.frame();f.raw.fire=false;f.advance(.32);assert.equal(f.equipment.snapshot().knife.phase,'cooldown')
  f.raw.fire=true;f.advance(.5);assert.equal(f.equipment.snapshot().knife.swings,1)
  f.raw.fire=false;f.frame();f.raw.fire=true;f.advance(.23);assert.equal(f.equipment.snapshot().knife.swings,2);assert.equal(f.equipment.snapshot().knife.hits,2)
})

test('native ellipsoid and physics raycasts enforce knife reach, aim, nearest enemy and wall occlusion',()=>{
  for(const [distance,offset,wall,expected] of [[1.64,0,null,'enemy'],[1.66,0,null,'miss'],[1,1,null,'miss'],[1,0,.5,'metal'],[1,0,1.2,'enemy'],[1,0,1,'metal'],[2,0,2,'miss']]) {
    const f=fixture();f.pickup('knife');f.advance(.5);const enemy=f.enemy(distance,offset);if(wall!==null)f.wall(wall)
    f.raw.fire=true;f.advance(.23);const s=f.equipment.snapshot().knife
    assert.equal(s.lastHit.surface,expected,JSON.stringify({distance,offset,wall}));assert.equal(enemy.hp,expected==='enemy'?100-KNIFE.damage:100)
    assert.equal(s.hits,expected==='enemy'?1:0);assert.equal(s.wallHits,expected==='metal'?1:0)
    if(expected!=='enemy')assert.equal(f.calls.events.filter(e=>e.name==='impact').length,0,'No bullet-hole effects on knife misses or walls')
  }
  const f=fixture();f.pickup('knife');f.advance(.5);const far=f.enemy(1.4),near=f.enemy(.8);near.hp=KNIFE.damage
  f.raw.fire=true;f.advance(.23);assert.equal(near.alive,false);assert.equal(far.hp,100)
  assert.equal(f.equipment.snapshot().knife.lastHit.killed,true);assert.equal(f.calls.events.filter(e=>e.name==='enemy:killed').length,1)
})

test('knife tests cover the original hound capsules and weak-point raycast without firearm multipliers',()=>{
  const f=fixture();f.pickup('knife');f.advance(.5)
  // Bind the original hound raycast to the original capsule/sphere helpers from
  // the same source VM; only the stationary pose is supplied by this fixture.
  const enemy={id:7,type:'hound',alive:true,hp:100,pos:f.g.player.eye.clone().add(new T.Vector3(0,-.7,-1.1)),headPos:f.g.player.eye.clone().add(new T.Vector3(0,0,-1.1)),yaw:0,sL:{v:0},sR:{v:0},sP:{v:0},sY:{x:0,v:0},crouch:0}
  enemy._raycast=originalMethod('iM','_raycast',{m:enemy,...box.houndHelpers,ps:new T.Vector3(),ru:new T.Vector3()})
  const damage=originalMethod('iM','damage',{m:enemy,s:f.g,i:{provoke(){f.calls.provoke++}},q(){enemy.alive=false}})
  enemy.damage=(amount,point,dir,part)=>{f.calls.damage.push({amount,part});return damage(amount,point,dir,part)};f.g.enemies.list.push(enemy)
  f.raw.fire=true;f.advance(.23);assert.equal(f.equipment.snapshot().knife.hits,1);assert.deepEqual(f.calls.damage,[{amount:KNIFE.damage,part:'weak'}])
  assert.equal(enemy.hp,100-KNIFE.damage);assert.equal(f.calls.provoke,1);assert.ok(enemy.sP.v!==0)
})

test('all number keys select original PRIMARY, PISTOL and KNIFE with independent firearm ammo',()=>{
  const f=fixture();f.pickup();f.g.weapon.ammo=7;f.g.weapon.reserve=13;f.pickup('rifle');f.g.weapon.ammo=19;f.g.weapon.reserve=8;f.pickup('knife');f.advance(.5)
  const saved=f.equipment.snapshot().slots
  f.raw.fire=true;f.advance(.8);f.raw.fire=false;f.frame()
  for(const [code,id] of [['Digit1','rifle'],['Digit2','pistol'],['Digit3','knife']]) {
    f.keyHandlers[0]({code,repeat:false,preventDefault(){}});f.frame()
    assert.equal(f.equipment.snapshot().activeWeapon,id);assert.equal(f.g.weapon.root.getObjectByName('harbor-duty-knife').visible,id==='knife')
    assert.equal(f.g.weapon.root.getObjectByName('harbor-p12-security-pistol').visible,id==='pistol');assert.ok(f.firearm.every(o=>o.visible===(id==='rifle')))
    assert.deepEqual(f.equipment.snapshot().slots,saved)
  }
  assert.deepEqual(Object.values(saved).map(s=>[s.id,s.slot]),[['rifle',1],['pistol',2],['knife',3]])
})

test('switch, pause, death and new game cancel pending knife contact; switching never clears cooldown',()=>{
  for(const action of ['switch','pause','dead','reset']) {
    const f=fixture();f.pickup('rifle');f.pickup('knife');f.advance(.5);f.enemy(1);f.raw.fire=true;f.advance(.096)
    if(action==='switch') { f.equipment.select(1);f.equipment.select(3) }
    if(action==='pause') { f.g.game.state='paused';f.g.events.emit('game:state',{state:'paused'});f.advance(.5);f.g.game.state='playing';f.g.events.emit('game:state',{state:'playing'}) }
    if(action==='dead') { f.g.player.alive=false;f.g.game.state='dead';f.g.events.emit('game:state',{state:'dead'}) }
    if(action==='reset')f.g.weapon.reset()
    assert.equal(f.equipment.snapshot().knife.swingTime,null);f.advance(1);assert.equal(f.calls.damage.length,0,action)
    if(action==='pause'||action==='switch') { assert.equal(f.equipment.snapshot().knife.swings,1);assert.equal(f.equipment.snapshot().hasWeapon,true) }
    else { assert.equal(f.equipment.snapshot().hasWeapon,false);assert.ok(f.equipment.snapshot().pickups.every(p=>p.visible&&!p.owned));assert.equal(f.equipment.snapshot().knife.cooldown,0) }
  }
  const f=fixture();f.pickup('rifle');f.pickup('knife');f.advance(.5);f.raw.fire=true;f.advance(.096)
  const cooldown=f.equipment.snapshot().knife.cooldown;f.equipment.select(1);f.equipment.select(3);assert.equal(f.equipment.snapshot().knife.cooldown,cooldown)
})

test('user STEP knife preserves CAD meshes, four real holes and fitted original-glove pose',async()=>{
  const f=fixture();f.pickup('knife');f.advance(.5);const model=f.g.weapon.root.getObjectByName('harbor-duty-knife'),meshes=[]
  model.traverse(o=>{if(o.isMesh)meshes.push(o)})
  assert.equal(meshes.length,3);for(const name of ['step-blade','step-edge','step-handle'])assert.ok(model.getObjectByName(name))
  for(const mesh of meshes) { assert.equal(mesh.layers.mask,f.hands[0].layers.mask);for(const key of ['position','normal'])for(const value of mesh.geometry.attributes[key].array)assert.ok(Number.isFinite(value)) }
  const T=f.g.THREE, data=JSON.parse(await fs.readFile(new URL('../../assets/harbor/knife/provenance.json',import.meta.url),'utf8'))
  for(const mesh of meshes)mesh.matrixWorld.identity()
  for(const hole of data.holes){
    const [x,y]=hole.centre
    for(const side of [-1,1]){const ray=new T.Raycaster(new T.Vector3(x,y,.1*side),new T.Vector3(0,0,-side),0,.2);assert.equal(ray.intersectObjects(meshes).length,0,'STEP slot must remain open in the game mesh')}
  }
  assert.equal(data.holes.length,4);assert.equal(model.userData.source.sha256,data.source.sha256)
  assert.notDeepEqual(f.equipment.snapshot().knife.rightHand,[0,0,0]);assert.equal(f.hands[0].visible,false);assert.equal(f.g.weapon.root.getObjectByName('knife-closed-original-glove').visible,true)
  const snap=f.equipment.snapshot();snap.knife.modelPosition[0]=999;assert.notEqual(f.equipment.snapshot().knife.modelPosition[0],999)
})

test('audited original dm still has exact hands, trigger morph, effects and reset boundaries',()=>{
  const dm=functions.get('dm'),game=functions.get('mM'),code=source.slice(dm.start,dm.end)
  for(const s of ['A.add(o(m.fabric,_))','q.add(o(O.fabric,_))','e.add(A)','e.add(q)','x=N_()','e.traverse(Me=>{Me.layers.set(zc)})','function z(Me)'])assert.ok(code.includes(s),s)
  const last=dm.body.body.at(-1);assert.equal(source.slice(last.start,last.end),'return _e(),ve');assert.ok(source.slice(game.start,game.end).includes('a(i.weapon,"reset")'))
})

test('knife sounds are short authored transients with finite bounded samples',()=>{
  for(const [kind,seconds]of [['swing',.12],['robot',.105],['wall',.085]]){
    const samples=knifeSamples(kind);assert.equal(samples.length,Math.ceil(24000*seconds));assert.ok(samples.every(Number.isFinite));assert.ok(Math.max(...samples.map(Math.abs))<1);assert.equal(samples[0],0);assert.ok(Math.abs(samples.at(-1))<.001)
    const energy=samples.reduce((sum,v)=>sum+v*v,0)/samples.length;assert.ok(energy>.001)
  }
})
