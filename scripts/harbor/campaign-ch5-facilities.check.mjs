import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {test} from 'node:test'
import {nativeChapter5Fixture} from './campaign-ch5-warehouse.check.mjs'
import {capsulePath,navPath} from './campaign-ch2.check.mjs'
import {createInfrastructure} from './infrastructure-state.mjs'
import {createChapter5Facilities} from './campaign-ch5-facilities.mjs'
import {CH5_REPAIR_SOURCE,loadChapter5RepairAsset,createChapter5RepairAsset} from './campaign-ch5-repair-asset.mjs'
import {installChapter5Ammo,CH5_REUSABLE_AMMO_SITES} from './campaign-ch5-ammo.mjs'

const bytes=await fs.readFile(new URL(`../../${CH5_REPAIR_SOURCE.path}`,import.meta.url)),json=value=>JSON.parse(JSON.stringify(value))
const source=await fs.readFile(new URL('./infrastructure.mjs',import.meta.url),'utf8')
const dom={style:{},querySelector(){return this},setAttribute(){},prepend(){}}
// Execute the actual infrastructure installer (including every mesh and box).
// Only DOM, lighting and audio are stubs; real native physics/nav is retained.
const installInfrastructure=vm.runInNewContext(`(()=>{${source.slice(source.indexOf('export function')).replace('export function','function')};return installInfrastructure})()`,{
  createInfrastructure,installPowerLighting:()=>({update(){},reset(){},snapshot:()=>({fixtures:[]})}),
  document:{querySelector:()=>dom,createElement:()=>dom,createTreeWalker:()=>({nextNode:()=>false})},NodeFilter:{SHOW_TEXT:4},
})

async function resources(T,{fail=false}={}){
  const tracked=[],track=object=>{let count=0;object.addEventListener('dispose',()=>count++);tracked.push(()=>count);return object}
  const native={...T,BufferGeometry:class extends T.BufferGeometry{constructor(){super();track(this)}},
    MeshStandardMaterial:class extends T.MeshStandardMaterial{constructor(options){super(options);track(this)}},
    TextureLoader:class{async loadAsync(url){
      if(fail)throw Error('injected JPEG failure')
      const jpeg=Buffer.from(await(await fetch(url)).arrayBuffer()),length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length))
      const v=gltf.bufferViews[gltf.images[0].bufferView],binary=bytes.subarray(28+length)
      assert.deepEqual(jpeg,binary.subarray(v.byteOffset,v.byteOffset+v.byteLength),'original embedded JPEG bytes')
      return track(new T.Texture({width:2048,height:2048}))
    }},
  }
  return {asset:await loadChapter5RepairAsset(native,{bytes}),tracked}
}

async function fixture(){
  const f=nativeChapter5Fixture(),{g,T}=f
  g.level={objectives:Object.entries(f.devices).map(([id,object],index)=>({id:['relay_a','relay_b','relay_c'][index],object,pos:object.position.clone()})),
    extraction:{pos:new T.Vector3(29,0,20)},shedLights:f.warehouse.lights}
  g.backdrop={boat:new T.Group()};g.backdrop.boat.position.set(31.5,-1.6,21);g.scene.add(g.backdrop.boat)
  g.render={frame(){}};g.hud={setMarkers(){}};g.audio={play(){},loop:()=>({stop(){}})}
  g.game={state:'playing',run:{time:0}};g.player={pos:new T.Vector3(-37,0,6),alive:true,enabled:true}
  g.enemies={list:[]}
  const environment={settings:{},lamps:[],mesh(geometry,material,position,parent){
    const m=new T.Mesh(geometry,material);m.position.set(...position);parent.add(m);return m
  },lamp(position,color,intensity,target){const light=new T.SpotLight(color,intensity)
    light.position.set(...position);light.target.position.set(...target)
    light.userData.lens=new T.Mesh(new T.PlaneGeometry(.29,.12),new T.MeshStandardMaterial({color,emissive:color}));g.scene.add(light);return light
  }}
  const infrastructure=installInfrastructure(g,environment),loaded=await resources(T)
  const before={objects:[...g.scene.getObjectByName('harbor-infrastructure').children],boxes:[...g.physics.boxes],boat:g.backdrop.boat}
  let extra=[]
  const facilities=createChapter5Facilities(g,{infrastructure,repairResources:loaded.asset,occupants:()=>extra})
  const tick=dt=>{infrastructure.updatePower(dt);facilities.update(dt)}
  return {...f,infrastructure,facilities,loaded,before,tick,setExtra:list=>{extra=list}}
}

test('CH5 repair GLB retains original bytes, attributes, normals and material at human scale; resources have explicit ownership',async()=>{
  assert.equal(bytes.length,CH5_REPAIR_SOURCE.bytes)
  assert.equal(createHash('sha256').update(bytes).digest('hex'),CH5_REPAIR_SOURCE.sha256)
  const {T}=nativeChapter5Fixture(),{asset,tracked}=await resources(T)
  const group=createChapter5RepairAsset(T,asset),mesh=group.children[0].children[0],bounds=new T.Box3().setFromObject(group)
  assert.equal(mesh.geometry,asset.geometry);assert.equal(mesh.material,asset.material)
  assert.equal(mesh.geometry.index.count/3,5790)
  assert.ok(Math.abs(bounds.max.y-1.8)<1e-10);assert.ok(Math.abs(bounds.min.y)<1e-10)
  assert.ok(Math.abs(bounds.getCenter(new T.Vector3()).x)<1e-10)
  const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length)),bin=bytes.subarray(28+length)
  for(const [i,name]of ['position','normal','uv','index'].entries()){
    const attr=i===3?mesh.geometry.index:mesh.geometry.attributes[name],view=gltf.bufferViews[i]
    assert.deepEqual(Buffer.from(attr.array.buffer,attr.array.byteOffset,attr.array.byteLength),bin.subarray(view.byteOffset,view.byteOffset+view.byteLength),name)
  }
  assert.equal(asset.material.roughness,gltf.materials[0].pbrMetallicRoughness.roughnessFactor)
  assert.equal(asset.material.metalness,0);assert.equal(asset.material.side,T.DoubleSide)
  assert.equal(asset.texture.flipY,false);assert.equal(asset.texture.colorSpace,T.SRGBColorSpace)
  assert.ok(tracked.every(count=>count()===0));asset.dispose();asset.dispose();assert.ok(tracked.every(count=>count()===1))
  assert.throws(()=>createChapter5RepairAsset(T,asset),/not disposed/)
  const changed=Buffer.from(bytes);changed[changed.length-1]^=1
  await assert.rejects(loadChapter5RepairAsset(T,{bytes:changed}),/SHA-256/)
  await assert.rejects(resources(T,{fail:true}),/injected JPEG failure/)
})

test('CH5 facilities borrow original gate, pump and relay identity; cabinet right of entry is grounded, solid and reachable',async t=>{
  const {g,T,facilities:f,before,shutters,loaded}=await fixture()
  assert.equal(f.gate,before.objects.find(o=>o.isGroup&&o.position.x===27.6&&o.position.z===20))
  assert.equal(f.gateBox,before.boxes.find(box=>box.tag==='harbor-moving-gate'))
  assert.equal(g.backdrop.boat,before.boat)
  const retained=g.scene.getObjectByName('harbor-infrastructure').children
  assert.equal(retained.length,before.objects.length);before.objects.forEach((object,i)=>assert.equal(retained[i],object))
  const b=f.cabinetBox
  assert.ok(b.max.z>6&&Math.abs(b.min.y)<1e-10&&Math.abs(b.max.y-1.8)<1e-10)
  for(const box of before.boxes){
    if(box.max.y<.05)continue
    assert.ok(!(b.max.x>box.min.x&&b.min.x<box.max.x&&b.max.y>box.min.y&&b.min.y<box.max.y&&b.max.z>box.min.z&&b.min.z<box.max.z),`cabinet overlaps ${box.tag}`)
  }
  assert.equal(g.physics.nav.isWalkable(-35,12),false)
  const a=f.approaches.repair,eye=a.clone().add(new T.Vector3(0,1.68,0))
  assert.equal(g.physics.lineOfSight(eye,f.targets.repair),true)
  assert.equal(g.physics.raycast(eye,new T.Vector3(0,0,1),3).box,b)
  const pos=a.clone(),velocity=new T.Vector3(0,0,3)
  assert.equal(g.physics.moveCapsule(pos,velocity,1,.32,1.8).hitWall,true);assert.ok(pos.z<b.min.z)
  navPath(g,{x:-37,z:6},a,'entry-to-repair')
  shutters.start();shutters.update(4)
  for(const key of ['control','fuel']){
    const target=f.targets[key],approach=f.approaches[key]
    assert.equal(g.physics.nav.isWalkable(approach.x,approach.z),true,key)
    assert.equal(g.physics.lineOfSight(approach.clone().add(new T.Vector3(0,1.68,0)),target),true,key)
    navPath(g,{x:-3.5,z:-9.5},approach,`warehouse-to-${key}`)
  }
  t.diagnostic(JSON.stringify(f.snapshot()))
  f.dispose();f.dispose();assert.ok(!g.physics.boxes.includes(b));assert.ok(g.physics.boxes.includes(f.gateBox));assert.equal(loaded.asset.disposed,false)
  loaded.asset.dispose()
})

test('CH5 cabinet and both native ammunition crates/lights coexist without overlap and keep their approaches reachable',async()=>{
  const {g,T,facilities:f}=await fixture();g.input={down:()=>false,pressed:()=>false};g.time={frame:0}
  const ammo=installChapter5Ammo(g,{equipment:{},narrative:{snapshot:()=>({active:false})}})
  const cabinet=f.cabinetBox,ammoBoxes=g.physics.boxes.filter(b=>b.tag.startsWith('ch5-ammo-'))
  assert.ok(ammoBoxes.length>=4)
  for(const box of ammoBoxes)assert.ok(!(cabinet.max.x>box.min.x&&cabinet.min.x<box.max.x&&cabinet.max.y>box.min.y&&cabinet.min.y<box.max.y&&cabinet.max.z>box.min.z&&cabinet.min.z<box.max.z),box.tag)
  for(const site of CH5_REUSABLE_AMMO_SITES){
    assert.equal(g.physics.nav.isWalkable(site.approach.x,site.approach.z),true,site.id)
    const pos=new T.Vector3(site.approach.x,0,site.approach.z),before=pos.clone()
    g.physics.moveCapsule(pos,new T.Vector3(),.05,.32,1.8)
    assert.ok(pos.distanceTo(before)<.001,`${site.id} standing clearance`)
  }
  assert.equal(g.physics.lineOfSight(f.approaches.repair.clone().setY(1.68),f.targets.repair),true)
  navPath(g,{x:-37,z:6},f.approaches.repair,'entry-to-repair-with-supplies')
  ammo.dispose()
})

test('CH5 original ladder gate blocks capsules/LOS/nav, then clears while rising with one native clock and no fuel advancement',async()=>{
  const {g,T,facilities:f,infrastructure:s,tick}=await fixture()
  const from=new T.Vector3(26.8,0,20),to=new T.Vector3(29,0,20)
  assert.equal(f.openBoatGate(),false);s.requestPower();tick(1.5)
  assert.equal(s.state.power,'ON');assert.equal(f.snapshot().phase,'closed')
  assert.equal(g.physics.nav.isWalkable(27.6,20),false)
  assert.equal(g.physics.lineOfSight(from.clone().setY(1.6),to.clone().setY(1.6)),false)
  const blocked=from.clone();assert.equal(g.physics.moveCapsule(blocked,new T.Vector3(3,0,0),1,.32,1.8).hitWall,true)
  assert.ok(blocked.x<27.5)
  assert.equal(f.openBoatGate(),true);assert.equal(f.openBoatGate(),false)
  tick(.8);assert.equal(f.snapshot().phase,'opening');assert.equal(s.state.gateProgress,.32)
  capsulePath(g,[from,to],'boat-gate-rising-crouch',1.15)
  assert.equal(g.physics.lineOfSight(from.clone().setY(1.6),to.clone().setY(1.6)),false)
  tick(.5);assert.equal(f.snapshot().phase,'opening')
  assert.equal(g.physics.nav.isWalkable(27.6,20),true)
  navPath(g,from,to,'boat-open-nav');capsulePath(g,[from,to],'boat-gate-rising-standing')
  tick(1.2);assert.equal(f.snapshot().phase,'open');assert.equal(s.state.gateProgress,1)
  assert.equal(g.physics.lineOfSight(from.clone().setY(1.6),to.clone().setY(1.6)),true)
  assert.equal(s.state.fuel,'UNAVAILABLE');assert.equal(s.state.fuelProgress,0);assert.equal(s.state.boat,'BLOCKED')
  const save=json(f.capture());f.reset();assert.equal(f.snapshot().phase,'closed');f.reset(save);assert.equal(f.snapshot().phase,'open')
})

test('CH5 pause/death freeze opening and reset never closes onto the native player or an NPC body',async()=>{
  const {g,T,facilities:f,infrastructure:s,tick,setExtra}=await fixture()
  s.requestPower();tick(1.5);f.openBoatGate();tick(.2)
  const save=json(f.capture());g.game.state='paused';tick(60);assert.deepEqual(json(f.capture()),save)
  g.game.state='playing';g.player.alive=false;tick(60);assert.deepEqual(json(f.capture()),save)
  g.player.alive=true;tick(3)
  g.player.pos.set(27.6,0,20);assert.equal(f.reset(),false);assert.equal(f.snapshot().phase,'reset-pending');assert.equal(f.gate.position.y,3.8)
  tick(.1);assert.equal(f.gate.position.y,3.8)
  g.player.pos.set(26.8,0,20)
  setExtra([{collider:{position:new T.Vector3(27.6,0,20),radius:.32,height:1.8}}]);tick(.1);assert.equal(f.snapshot().phase,'reset-pending')
  setExtra([]);tick(.1);assert.equal(f.snapshot().phase,'closed');assert.equal(g.physics.nav.isWalkable(27.6,20),false)
  assert.equal(f.gateBox.min.y,0);assert.equal(f.gateBox.max.y,3.6)
})

test('CH5 native player can release crouch beneath rising boat gate and automatically stand before it finishes',async t=>{
  const f=await fixture(),{g,T,facilities:fac,infrastructure:s,tick}=f
  g.camera=new T.PerspectiveCamera();g.render=null;g.events={emit(){},on(){},off(){}}
  g.enemies.raycast=()=>null;g.time={frame:0}
  g.input={down:()=>false,pressed:()=>false,look:{dx:0,dy:0},move:{x:0,y:1},sprint:false,crouch:true,fire:false,ads:false}
  g.player=f.createPlayer(g);g.player.reset({pos:new T.Vector3(26.8,0,20),yaw:-Math.PI/2})
  s.requestPower();tick(1.5);fac.openBoatGate();tick(.8)
  let released=false,crossed=false
  for(let i=0;i<120;i++){
    if(g.player.pos.x>27.5){released ||= g.player.crouching;g.input.crouch=false}
    g.time.frame++;g.game.run.time+=1/60;g.player.update(1/60);tick(1/60)
    if(g.player.pos.x>28.4){crossed=true;break}
  }
  assert.ok(released);assert.ok(crossed);assert.equal(g.player.crouching,false);assert.equal(g.player.health,100)
  assert.equal(fac.snapshot().phase,'opening')
  t.diagnostic(JSON.stringify({feet:g.player.pos.toArray(),progress:fac.capture().gateProgress,crouching:g.player.crouching}))
})
