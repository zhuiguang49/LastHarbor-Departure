import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { installEquipment } from './equipment.mjs'
import { installCampaignSupplies } from './campaign-supplies.mjs'
import { CH1 } from './campaign-ch1-layout.mjs'

// The shipped Three.js, original physics and original glove factory, without GPU
// or boot. Equipment and supplies themselves run together without replacement.
const html = await fs.readFile(new URL('../../几猫国产3A大作_V1-fable5.2.html',import.meta.url),'utf8')
const source = html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'))
const startup = 'QC().catch(i=>bM(i&&i.stack||i));', noop = () => {}
assert.equal(source.split(startup).length,2)
const box = { console:{...console,error:noop}, document:{getElementById:()=>({})},addEventListener:noop,setTimeout:noop,URLSearchParams,performance,AbortController,TextDecoder,navigator:{userAgent:''},location:{search:''} }
box.window = box
vm.runInNewContext(source.replace(startup,'globalThis.THREE=lt;globalThis.physics=d3;globalThis.hand=Vv;'),box)
const T = box.THREE
const copy = value => JSON.parse(JSON.stringify(value))
function fixture() {
  const pressed = new Set(), held = new Set(), raw = {fire:false,ads:false}, callbacks = new Map(), emitted = [], shots = [], keyHandlers = []
  globalThis.addEventListener = (name,fn) => { if(name==='keydown')keyHandlers.push(fn) }
  globalThis.document = {createElement:tag=>tag==='canvas'?{getContext:()=>({fillText(){},createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})}:{},head:{append(){}},documentElement:{classList:{toggle(){}}}}
  const hands = [new T.Group(),new T.Group()], firearm = [new T.Group()], effects = [new T.Group()]
  for(const object of [...hands,...firearm,...effects])object.layers.set(1)
  const g = {
    THREE:T,scene:new T.Scene(),camera:new T.PerspectiveCamera(74),viewCamera:new T.PerspectiveCamera(54),time:{frame:0},game:{state:'playing'},
    mats:{get:()=>new T.MeshStandardMaterial(),label:()=>({material:new T.MeshStandardMaterial()})},
    player:{pos:new T.Vector3(-6.03,0,-319.4),eye:new T.Vector3(-6.03,1.68,-319.4),forward:new T.Vector3(-1,0,0),alive:true,ads:0,speed:0},
    input:{fire:false,ads:false,down:action=>held.has(action),pressed:action=>pressed.has(action),update(){this.fire=raw.fire;this.ads=raw.ads}},
    events:{on(name,fn){const list=callbacks.get(name)||[];list.push(fn);callbacks.set(name,list)},emit(name,data){for(const fn of callbacks.get(name)||[])fn(data)}},
    audio:{play(){}},fx:{tracer(){},shell(){}},combat:{playerShot(...args){shots.push(args)}},enemies:{raycast:()=>null},
    hud:{root:{querySelector:()=>null},setPrompt(value){this.prompt=value},setMarkers(){},setObjective(){},message(){},update(){}},
    weapon:{root:new T.Group(),equipmentView:{hands,firearm,effects,createGripHand:options=>box.hand(options).fabric,gloveMaterial:new T.MeshStandardMaterial({vertexColors:true}),cancelActions(){},setTrigger(){}},
      ammo:30,magSize:30,reserve:150,damage:26,rpm:720,state:'idle',ads:0,debug:{},
      reset(){this.ammo=30;this.reserve=150;this.state='idle';this.ads=0},reloadNow(){return false},update(){},
    },
  }
  g.physics=box.physics(g);g.weapon.root.add(...hands,...firearm,...effects);g.scene.add(g.weapon.root)
  const equipment=installEquipment(g,{campaignM2:true,mesh(geometry,material,xyz,parent){const o=new T.Mesh(geometry,material);o.position.set(...xyz);parent.add(o);return o},lamp:()=>({})})
  const supplies=installCampaignSupplies(g,{equipment,emit:event=>emitted.push(event)})
  function frame(dt=.016){g.time.frame++;g.camera.position.copy(g.player.eye);g.input.update(dt);g.weapon.update(dt);supplies.update(dt);g.hud.update(dt);pressed.clear()}
  function aimAt(position,yaw=CH1.supplies.yaw){g.player.pos.set(position[0]+Math.sin(yaw)*1.37,0,position[2]+Math.cos(yaw)*1.37);g.player.eye.copy(g.player.pos).y=1.68;g.player.forward.set(-Math.sin(yaw),0,-Math.cos(yaw))}
  function pickup(id){const target=equipment.snapshot().pickups.find(p=>p.id===id);aimAt(target.position,target.yaw);pressed.add('interact');equipment.update();pressed.clear();frame()}
  function collect(exit=false){const snap=supplies.snapshot();aimAt(exit ? snap.exitPosition : snap.position,exit ? snap.exitYaw : snap.yaw);pressed.add('interact');const result=exit ? supplies.interactExit() : supplies.interact();pressed.clear();frame();return result}
  aimAt(supplies.snapshot().position)
  return {g,equipment,supplies,pressed,held,raw,hands,emitted,shots,keyHandlers,frame,pickup,collect,aimAt}
}

test('physical supply station requires fresh E, range, height, facing and original physics LOS',()=>{
  for(const change of [f=>f.g.player.pos.x+=4,f=>f.g.player.pos.y=2,f=>f.g.player.forward.negate(),f=>{const p=f.supplies.snapshot().position;f.g.physics.addBox(new T.Vector3(p[0]-.6,0,p[2]+.6),new T.Vector3(p[0]+.6,3,p[2]+.7))},f=>f.g.game.state='paused',f=>f.g.player.alive=false]){
    const f=fixture();change(f);f.pressed.add('interact');assert.equal(f.supplies.interact(),false);assert.equal(f.supplies.snapshot().consumed,false);assert.equal(f.emitted.length,0)
  }
  const f=fixture();f.held.add('interact');assert.equal(f.supplies.interact(),false)
  assert.deepEqual([...f.supplies.snapshot().position],[...CH1.supplies.position])
  const pickup=f.g.scene.getObjectByName('campaign-ammo-flashlight-pickup');assert.ok(pickup.children.length>=5)
  assert.ok(f.g.physics.boxes.find(b=>b.tag==='campaign-supplies-shelf'))
  assert.equal(f.collect(),true);assert.equal(pickup.visible,false)
  assert.deepEqual(f.emitted,[{type:'supplies-acquired',ammo:true,flashlight:true}])
})

test('one finite ammo grant does not grant ownership, change magazine rounds or enable locked pickups',()=>{
  const f=fixture();f.equipment.setPickupEnabled('rifle',false);f.equipment.setPickupEnabled('knife',false)
  f.pickup('pistol');f.g.weapon.ammo=5;f.g.weapon.reserve=3
  assert.equal(f.collect(),true);const saved=f.equipment.capture()
  assert.deepEqual(saved.slots.pistol,{owned:true,ammo:5,reserve:48})
  assert.deepEqual(saved.slots.rifle,{owned:false,ammo:40,reserve:160});assert.equal(saved.pickupEnabled.rifle,false)
  for(let n=0;n<5;n++)assert.equal(f.collect(),false)
  assert.deepEqual(f.equipment.capture(),saved);assert.equal(f.emitted.length,1)
  f.equipment.setPickupEnabled('rifle',true);f.pickup('rifle');assert.equal(f.equipment.capture().slots.rifle.reserve,160)
})

test('Q uses native alt edges only, leaves pistol fire and ADS usable, and rifle extinguishes it',()=>{
  const f=fixture();f.pickup('pistol');f.collect();assert.equal(f.supplies.snapshot().beam.active,true)
  assert.equal(f.keyHandlers.length,1,'supplies must not add a competing Q handler')
  f.held.add('alt');f.frame();assert.equal(f.supplies.snapshot().on,true)
  f.pressed.add('alt');f.frame();assert.equal(f.supplies.snapshot().on,false)
  f.frame();f.pressed.add('alt');f.frame();assert.equal(f.supplies.snapshot().on,true)
  for(let n=0;n<40;n++)f.frame()
  f.raw.fire=f.raw.ads=true;f.frame();assert.equal(f.shots.length,1);assert.equal(f.g.weapon.ammo,11);assert.ok(f.g.weapon.ads>0);assert.equal(f.supplies.snapshot().beam.active,true)
  f.raw.fire=f.raw.ads=false;f.pickup('rifle');assert.equal(f.supplies.snapshot().on,false);assert.equal(f.supplies.snapshot().beam.active,false)
  f.pressed.add('alt');f.frame();assert.equal(f.supplies.snapshot().on,false)
  f.equipment.select(2);f.frame();assert.equal(f.supplies.snapshot().on,false)
  f.pressed.add('alt');f.frame();assert.equal(f.supplies.snapshot().beam.active,true)
})

test('beam follows current camera including pitch in the same root tick; original hands and layers survive',()=>{
  const f=fixture(),left=f.hands[1],right=f.hands[0];f.pickup('pistol');f.collect()
  f.g.camera.rotation.set(.45,1.1,.07,'YXZ');f.frame()
  const beam=f.supplies.snapshot().beam,dir=new T.Vector3().fromArray(beam.target).sub(new T.Vector3().fromArray(beam.position)).normalize()
  const expected=new T.Vector3(0,0,-1).applyQuaternion(f.g.camera.quaternion)
  assert.ok(dir.distanceTo(expected)<1e-10);assert.ok(Math.abs(dir.y)>.4)
  const before=copy(beam);f.g.player.eye.x+=3;f.g.camera.rotation.y=-.8;f.frame()
  assert.notDeepEqual(f.supplies.snapshot().beam.position,before.position)
  const after=f.supplies.snapshot().beam;assert.ok(new T.Vector3().fromArray(after.target).sub(new T.Vector3().fromArray(after.position)).normalize().distanceTo(new T.Vector3(0,0,-1).applyQuaternion(f.g.camera.quaternion))<1e-10)
  assert.equal(f.g.weapon.equipmentView.hands[1],left);assert.equal(f.g.weapon.equipmentView.hands[0],right);assert.equal(left.visible,true)
  const model=f.g.weapon.root.getObjectByName('campaign-held-flashlight');model.traverse(object=>assert.equal(object.layers.mask,left.layers.mask))
  const light=f.g.scene.getObjectByName('campaign-flashlight-beam');assert.ok(light.isSpotLight);assert.equal(light.castShadow,true);assert.equal(light.layers.mask,1)
})

test('flashlight yields original support hand to reload and preserves ammo transfer, pause and knife poses',()=>{
  const f=fixture();f.pickup('pistol');f.collect();f.g.weapon.ammo=4
  const reserve=f.g.weapon.reserve;assert.equal(f.g.weapon.reloadNow(),true);f.frame();assert.equal(f.supplies.snapshot().beam.active,false)
  const start=[...f.hands[1].position.toArray()];for(let n=0;n<50;n++)f.frame();assert.notDeepEqual([...f.hands[1].position.toArray()],start)
  for(let n=0;n<80;n++)f.frame();assert.deepEqual([f.g.weapon.ammo,f.g.weapon.reserve],[12,reserve-8]);assert.equal(f.supplies.snapshot().beam.active,true)
  f.g.game.state='paused';f.g.events.emit('game:state',{state:'paused'});assert.equal(f.supplies.snapshot().beam.active,false)
  f.pressed.add('alt');f.frame();assert.equal(f.supplies.snapshot().on,true)
  f.g.game.state='playing';f.frame();assert.equal(f.supplies.snapshot().beam.active,true)
  f.pickup('knife');assert.equal(f.supplies.snapshot().on,false);assert.equal(f.g.weapon.root.getObjectByName('knife-closed-original-glove').visible,true)
})

test('checkpoint retries restore consumed supplies and independent ammo without duplication; new run clears both',()=>{
  const f=fixture();f.pickup('pistol')
  const before={equipment:copy(f.equipment.capture()),supplies:copy(f.supplies.snapshot())}
  f.collect();f.g.weapon.ammo=2;f.g.weapon.reserve=17
  const after={equipment:copy(f.equipment.capture()),supplies:copy(f.supplies.snapshot())}
  for(let n=0;n<3;n++){
    f.g.player.alive=false;f.g.game.state='dead';f.g.events.emit('game:state',{state:'dead'})
    f.g.player.alive=true;f.g.game.state='playing';f.equipment.restore(after.equipment);f.supplies.reset(after.supplies);f.frame()
    assert.deepEqual(f.equipment.capture(),after.equipment);assert.equal(f.collect(),false);assert.equal(f.supplies.snapshot().flashlightOwned,true)
  }
  f.equipment.restore(before.equipment);f.supplies.reset(before.supplies);assert.equal(f.supplies.snapshot().pickupVisible,true);assert.equal(f.collect(),true)
  assert.equal(f.g.weapon.reserve,48)
  const saved=copy(f.supplies.snapshot());f.supplies.reset(saved);f.supplies.reset(saved);assert.equal(f.g.weapon.reserve,48)
  saved.on=false;saved.position[0]=100;assert.equal(f.supplies.snapshot().on,true);assert.equal(f.supplies.snapshot().position[0],CH1.supplies.position[0])
  f.equipment.reset();f.supplies.reset();f.frame();assert.equal(f.supplies.snapshot().consumed,false);assert.equal(f.supplies.snapshot().flashlightOwned,false);assert.equal(f.supplies.snapshot().beam.active,false)
  assert.ok(Object.values(f.equipment.capture().slots).every(s=>!s.owned));assert.equal(f.equipment.capture().slots.pistol.reserve,24)
})

test('both physical stations use shared anchors and yaw with shelf collision behind their interaction points',()=>{
  const f=fixture(),snap=f.supplies.snapshot()
  assert.deepEqual([...snap.exitPosition],[...CH1.exitSupplies.position]);assert.equal(snap.yaw,CH1.supplies.yaw);assert.equal(snap.exitYaw,CH1.exitSupplies.yaw)
  assert.deepEqual(snap.ammoGrant,{pistol:48})
  for(const [anchor,name,tag] of [[CH1.supplies,'campaign-warehouse-supply-station','campaign-supplies-shelf'],[CH1.exitSupplies,'campaign-exit-ammo-station','campaign-exit-supplies-shelf']]){
    const group=f.g.scene.getObjectByName(name),collider=f.g.physics.boxes.find(b=>b.tag===tag)
    assert.deepEqual([...group.position.toArray()],[...anchor.position]);assert.equal(group.rotation.y,anchor.yaw)
    const normal=new T.Vector3(Math.sin(anchor.yaw),0,Math.cos(anchor.yaw)),center=collider.min.clone().add(collider.max).multiplyScalar(.5)
    assert.ok(center.sub(group.position).dot(normal)<0)
    group.updateMatrixWorld(true);const sign=group.children.find(o=>o.isMesh&&o.geometry.type==='PlaneGeometry')
    assert.ok(new T.Vector3(0,0,1).transformDirection(sign.matrixWorld).distanceTo(normal)<1e-10)
  }
  assert.ok(f.g.scene.getObjectByName('campaign-exit-ammo-pickup').children.length>=4)
})

test('exit station requires its own fresh E, range, facing, height and original physics LOS',()=>{
  for(const change of [f=>f.g.player.pos.x+=4,f=>f.g.player.pos.y=2,f=>f.g.player.forward.negate(),f=>{
    const p=f.supplies.snapshot().exitPosition
    f.g.physics.addBox(new T.Vector3(p[0]+.6,0,p[2]-.6),new T.Vector3(p[0]+.7,3,p[2]+.6))
  },f=>f.g.game.state='paused',f=>f.g.player.alive=false]){
    const f=fixture(),snap=f.supplies.snapshot();f.aimAt(snap.exitPosition,snap.exitYaw);change(f);f.pressed.add('interact')
    assert.equal(f.supplies.interactExit(),false);assert.equal(f.supplies.snapshot().exitConsumed,false);assert.equal(f.emitted.length,0)
  }
  const f=fixture(),snap=f.supplies.snapshot();f.aimAt(snap.exitPosition,snap.exitYaw);f.held.add('interact')
  assert.equal(f.supplies.interactExit(),false);assert.equal(f.collect(true),true);assert.equal(f.supplies.snapshot().exitPickupVisible,false)
  assert.equal(f.supplies.snapshot().flashlightOwned,false);assert.equal(f.supplies.snapshot().consumed,false);assert.equal(f.emitted.length,0)
})

test('exit collection tops both owned firearms once while missing weapons and physical pickup gates stay intact',()=>{
  const f=fixture();f.pickup('pistol');f.pickup('rifle');f.g.weapon.ammo=3;f.g.weapon.reserve=2;f.equipment.select(2);f.g.weapon.ammo=1;f.g.weapon.reserve=0
  f.equipment.setPickupEnabled('knife',false)
  assert.equal(f.collect(true),true)
  assert.deepEqual(f.equipment.capture().slots.rifle,{owned:true,ammo:40,reserve:160})
  assert.deepEqual(f.equipment.capture().slots.pistol,{owned:true,ammo:12,reserve:48})
  assert.equal(f.equipment.capture().slots.knife.owned,false);assert.equal(f.equipment.capture().pickupEnabled.knife,false)
  f.g.weapon.ammo=2;f.g.weapon.reserve=5;const saved=copy(f.equipment.capture())
  for(let n=0;n<3;n++)assert.equal(f.collect(true),false)
  assert.deepEqual(f.equipment.capture(),saved);assert.equal(f.supplies.snapshot().flashlightOwned,false)
  const missing=fixture();missing.equipment.setPickupEnabled('rifle',false);missing.equipment.setPickupEnabled('knife',false)
  const inventory=copy(missing.equipment.capture());assert.equal(missing.collect(true),true);assert.deepEqual(missing.equipment.capture(),inventory)
  missing.pickup('pistol');assert.deepEqual(missing.equipment.capture().slots.pistol,{owned:true,ammo:12,reserve:24})
})

test('warehouse has no rifle grant and one E edge cannot consume warehouse and exit in the same tick',()=>{
  const f=fixture(),saved=f.equipment.capture();saved.slots.rifle.reserve=8;f.equipment.restore(saved)
  f.pressed.add('interact');assert.equal(f.supplies.interact(),true)
  const snap=f.supplies.snapshot();f.aimAt(snap.exitPosition,snap.exitYaw)
  assert.equal(f.supplies.interactExit(),false);assert.equal(f.supplies.snapshot().exitConsumed,false)
  assert.equal(f.equipment.capture().slots.rifle.reserve,8);assert.equal(f.equipment.capture().slots.rifle.owned,false)
  assert.equal(f.equipment.capture().slots.pistol.owned,false)
  f.frame();assert.equal(f.supplies.interactExit(),false,'held E is not another input edge')
  assert.equal(f.collect(true),true);assert.equal(f.equipment.capture().slots.rifle.reserve,8)
})

test('exit consumed checkpoint restoration never grants ammo and retry replacement restores both station states',()=>{
  const f=fixture();f.pickup('pistol');f.pickup('rifle')
  const before={equipment:copy(f.equipment.capture()),supplies:copy(f.supplies.snapshot())}
  f.collect();f.g.weapon.ammo=0;f.g.weapon.reserve=0;f.collect(true);f.g.weapon.ammo=6;f.g.weapon.reserve=10
  const after={equipment:copy(f.equipment.capture()),supplies:copy(f.supplies.snapshot())}
  for(let n=0;n<3;n++){
    f.equipment.restore(after.equipment);f.supplies.reset(after.supplies);f.supplies.reset(after.supplies)
    assert.deepEqual(f.equipment.capture(),after.equipment);assert.equal(f.supplies.snapshot().exitConsumed,true)
    assert.equal(f.collect(true),false);assert.equal(f.collect(),false)
  }
  f.equipment.restore(before.equipment);f.supplies.reset(before.supplies)
  assert.deepEqual(f.equipment.capture(),before.equipment);assert.equal(f.supplies.snapshot().pickupVisible,true);assert.equal(f.supplies.snapshot().exitPickupVisible,true)
  f.equipment.reset();f.supplies.reset(after.supplies)
  assert.equal(f.supplies.snapshot().exitConsumed,true);assert.ok(Object.values(f.equipment.capture().slots).every(s=>!s.owned))
  assert.equal(f.equipment.capture().slots.pistol.reserve,24)
  f.supplies.reset();const fresh=f.supplies.snapshot();assert.equal(fresh.exitConsumed,false);assert.equal(fresh.consumed,false);assert.equal(fresh.exitPickupVisible,true)
  after.supplies.exitPosition[0]=999;assert.deepEqual([...f.supplies.snapshot().exitPosition],[...CH1.exitSupplies.position])
})

test('native Q action is unused elsewhere and level timing follows camera and weapon before render',()=>{
  assert.ok(source.includes('KeyQ:"alt"'));assert.equal(source.includes('pressed("alt")'),false);assert.equal(source.includes('down("alt")'),false)
  const loop=source.slice(source.indexOf('t.renderer.setAnimationLoop('))
  assert.ok(loop.indexOf('u("player",p)')<loop.indexOf('u("weapon",p)'))
  assert.ok(loop.indexOf('u("weapon",p)')<loop.indexOf('u("level",p)'))
  assert.ok(loop.indexOf('u("level",p)')<loop.indexOf('t.render.frame(p)'))
})
