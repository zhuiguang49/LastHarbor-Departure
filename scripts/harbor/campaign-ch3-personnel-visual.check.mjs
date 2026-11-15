import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { loadChapter3PersonnelResources,createClearanceVisual,createWorkerVisual,CLEARANCE_CLIPS } from './campaign-ch3-personnel-visual.mjs'
import { loadSniperResources,createSniperVisual } from './campaign-ch3-sniper-visual.mjs'
import { installCharacterTarget } from './character-native-target.mjs'
import { bakePersonnelAssets,bakePersonnelMesh,RIFLE_SOURCE,WORKER_SOURCE } from './convert-ch3-personnel-assets.mjs'
import { rifle } from '../../assets/harbor/ch3-personnel-derived/rifle.mesh.mjs'
import { worker } from '../../assets/harbor/ch3-personnel-derived/worker.mesh.mjs'

const {T}=await nativeFixture(),g={THREE:T},bytes=await fs.readFile(new URL('../../assets/harbor/soldier/soldier.glb',import.meta.url))
const hash=data=>createHash('sha256').update(data).digest('hex')
const decodeImage=async()=>({width:2048,height:2048,close(){}})
const loadTexture=async()=>new T.Texture({width:2048,height:2048})
const load=options=>loadChapter3PersonnelResources(g,{bytes,decodeImage,loadTexture,...options})
const world=o=>o.getWorldPosition(new T.Vector3())
const bone=(v,name)=>v.instance.skeleton.bones.find(b=>b.userData.sourceName===`mixamorig:${name}`)
function skinBounds(v){
  const mesh=v.instance.mesh,p=new T.Vector3(),box=new T.Box3(),inverse=v.root.matrixWorld.clone().invert()
  for(const index of new Set(mesh.geometry.index.array)){
    mesh.getVertexPosition(index,p);p.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);box.expandByPoint(p)
  }
  return box
}
function checkContact(v){
  const s=v.snapshot();assert.ok(s.gripError<1e-5,`right palm ${s.gripError}`);assert.ok(s.foreEndError<1e-5,`left palm ${s.foreEndError}`)
  assert.ok(s.aim.reachError<1e-5)
  for(const side of ['Right','Left'])for(const finger of ['Index','Middle','Ring','Pinky']){
    const first=world(bone(v,`${side}Hand${finger}1`)),tip=world(bone(v,`${side}Hand${finger}4`))
    assert.ok(first.distanceTo(tip)<.105,`${side} ${finger} must be closed`)
  }
}

test('exact rifle/worker source bytes, extracted attributes/JPEGs, surface sockets and deterministic directory',async()=>{
  const files=await bakePersonnelAssets()
  for(const[name,data]of Object.entries(files))assert.deepEqual(data,await fs.readFile(new URL(`../../assets/harbor/ch3-personnel-derived/${name}`,import.meta.url)))
  assert.deepEqual((await fs.readdir(new URL('../../assets/harbor/ch3-personnel-derived/',import.meta.url))).sort(),Object.keys(files).sort())
  for(const[kind,source,asset]of [['rifle',RIFLE_SOURCE,rifle],['worker',WORKER_SOURCE,worker]]){
    const data=await fs.readFile(new URL(`../../${source.path}`,import.meta.url))
    assert.equal(hash(data),source.sha256);const changed=Buffer.from(data);changed[changed.length-1]^=1
    assert.throws(()=>bakePersonnelMesh(changed,kind),/source changed/)
    const length=data.readUInt32LE(12),json=JSON.parse(data.subarray(20,20+length)),bin=data.subarray(28+length),derived=Buffer.from(asset.data,'base64')
    const primitive=json.meshes[0].primitives[0]
    for(const[name,index]of [['position',0],['normal',1],['uv',2],['index',primitive.indices]]){
      const a=asset.attributes[name],v=json.bufferViews[json.accessors[index].bufferView]
      assert.deepEqual(derived.subarray(a.offset,a.offset+a.length*(a.componentType===5123?2:4)),bin.subarray(v.byteOffset,v.byteOffset+v.byteLength))
    }
  }
  const geometry=Buffer.from(rifle.data,'base64')
  for(const [socket,key]of [['grip','gripVertex'],['foreEnd','foreEndVertex']]){
    const index=rifle.contacts[key]
    assert.deepEqual(rifle.sockets[socket],[0,1,2].map(k=>geometry.readFloatLE((index*3+k)*4)))
  }
  assert.equal(rifle.sockets.muzzle[2],rifle.bounds.max[2]);assert.equal(rifle.forward,'+Z');assert.equal(worker.forward,'+Z')
})

test('worker static source bind pose, original PBR, calibration, scale and no animation/target',async()=>{
  const r=await load(),v=createWorkerVisual(g,r)
  try{
    const mesh=v.root.children[0].children[0],box=new T.Box3().setFromObject(v.root)
    assert.ok(Math.abs(box.getSize(new T.Vector3()).y-1.76)<1e-10);assert.ok(Math.abs(box.min.y)<1e-10)
    assert.ok(new T.Vector3(0,0,1).transformDirection(mesh.matrixWorld).distanceTo(new T.Vector3(0,0,-1))<1e-10)
    assert.equal(mesh.material.map.colorSpace,T.SRGBColorSpace);assert.equal(mesh.material.normalMap.colorSpace,T.NoColorSpace)
    assert.equal(mesh.material.roughnessMap,mesh.material.metalnessMap);assert.equal(mesh.material.side,T.DoubleSide)
    assert.equal(mesh.material.metalness,1);assert.equal(mesh.material.roughness,1)
    assert.equal(v.instance,undefined);assert.equal(v.animation,undefined);assert.equal(v.snapshot().target,false)
    // The source's default inverse binds really reproduce the extracted static geometry.
    const data=await fs.readFile(new URL(`../../${WORKER_SOURCE.path}`,import.meta.url)),length=data.readUInt32LE(12)
    const json=JSON.parse(data.subarray(20,20+length)),bin=data.subarray(28+length),parents=new Array(json.nodes.length).fill(-1)
    json.nodes.forEach((n,i)=>{for(const c of n.children||[])parents[c]=i})
    const matrices=json.nodes.map(n=>new T.Matrix4().compose(new T.Vector3().fromArray(n.translation||[0,0,0]),new T.Quaternion().fromArray(n.rotation||[0,0,0,1]),new T.Vector3().fromArray(n.scale||[1,1,1])))
    const matrix=i=>parents[i]===-1?matrices[i].clone():matrix(parents[i]).multiply(matrices[i])
    const skin=json.skins[0],ibm=json.bufferViews[json.accessors[skin.inverseBindMatrices].bufferView]
    const inverse=new Float32Array(Uint8Array.from(bin.subarray(ibm.byteOffset,ibm.byteOffset+ibm.byteLength)).buffer)
    const transforms=skin.joints.map((n,i)=>matrix(n).multiply(new T.Matrix4().fromArray(inverse,i*16)))
    const joints=json.bufferViews[3],weights=json.bufferViews[4],p=new T.Vector3(),original=new T.Vector3(),result=new T.Vector3()
    let maximum=0
    for(let i=0;i<22177;i++){
      original.fromBufferAttribute(mesh.geometry.attributes.position,i);result.set(0,0,0)
      for(let n=0;n<4;n++)result.addScaledVector(p.copy(original).applyMatrix4(transforms[bin[joints.byteOffset+i*4+n]]),bin.readFloatLE(weights.byteOffset+(i*4+n)*4))
      maximum=Math.max(maximum,result.distanceTo(original))
    }
    assert.ok(maximum<1e-6,`worker bind error ${maximum}`)
  }finally{v.dispose();r.dispose()}
})

test('all six real clips sampled across their duration; live hands/feet, original limbs and repaired Death',async()=>{
  const r=await load(),v=createClearanceVisual(g,r)
  try{
    assert.deepEqual(CLEARANCE_CLIPS,{Idle:7,Patrol:0,Aim:3,Fire:1,Hit:5,Death:8})
    v.root.position.set(4,2,-10);v.root.rotation.y=.73;v.update(0)
    const originalPosition=v.root.position.clone(),lengths=['Left','Right'].flatMap(side=>[
      world(bone(v,`${side}Arm`)).distanceTo(world(bone(v,`${side}ForeArm`))),world(bone(v,`${side}ForeArm`)).distanceTo(world(bone(v,`${side}Hand`)))])
    for(const[role,index]of Object.entries(CLEARANCE_CLIPS)){
      v.reset()
      for(let n=0;n<=24;n++){
        v.animation.restore({index,time:r.character.clips[index].duration*n/24,loop:false})
        assert.equal(v.snapshot().role,role);assert.equal(v.animation.snapshot().index,index)
        if(role!=='Death')checkContact(v)
        const box=skinBounds(v);assert.ok(Math.abs(box.min.y)<.002,`${role} ground ${box.min.y}`)
        assert.deepEqual(v.root.position,originalPosition)
        const current=['Left','Right'].flatMap(side=>[
          world(bone(v,`${side}Arm`)).distanceTo(world(bone(v,`${side}ForeArm`))),world(bone(v,`${side}ForeArm`)).distanceTo(world(bone(v,`${side}Hand`)))])
        current.forEach((value,i)=>assert.ok(Math.abs(value-lengths[i])<1e-5))
        if(role==='Death'){
          if(n===24)assert.ok(box.max.y<.6)
          const gun=v.muzzle.parent,point=new T.Vector3();let minimum=Infinity
          const inverse=v.root.matrixWorld.clone().invert()
          for(let i=0;i<gun.geometry.attributes.position.count;i++){
            point.fromBufferAttribute(gun.geometry.attributes.position,i).applyMatrix4(gun.matrixWorld).applyMatrix4(inverse);minimum=Math.min(minimum,point.y)
          }
          assert.ok(Math.abs(minimum)<1e-6,`dropped rifle ground ${minimum}`)
        }
      }
    }
    const indices=v.instance.mesh.geometry.index.array
    for(const index of [12905,12983])assert.equal(indices.includes(index),false)
    assert.equal(indices.length,102924)
    v.reset();v.setState('Death');v.update(10)
    const scan=v.snapshot().groundingCost.fullGroundScans,count=v.animation.updateCount(),saved=v.animation.capture()
    v.update(.5);v.update(0)
    assert.equal(v.snapshot().groundingCost.fullGroundScans,scan);assert.equal(v.animation.updateCount(),count);assert.deepEqual(v.animation.capture(),saved)
  }finally{v.dispose();r.dispose()}
})

test('Aim/Fire 1 align real muzzle/forward and closed hands at three world yaws and pitches',async()=>{
  const r=await load(),v=createClearanceVisual(g,r)
  try{
    for(const yaw of [-1.1,.735,2.3])for(const pitch of [-.5,0,.5]){
      v.reset();v.root.position.set(8,5.2,-154);v.root.rotation.y=yaw;v.setState('Aim');v.update(.15)
      const aim=new T.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch))
      const point=v.getMuzzle().addScaledVector(aim,40);v.aimAt(point)
      for(const role of ['Aim','Fire']){
        v.setState(role)
        for(let n=0;n<12;n++){
          v.update(.065);checkContact(v)
          assert.ok(v.getForward().angleTo(point.clone().sub(v.getMuzzle()).normalize())<1e-6)
        }
      }
      assert.equal(v.animation.snapshot().index,1)
    }
  }finally{v.dispose();r.dispose()}
})

test('low frequency large dt, repeated states, native target Hit/Death, capture and one animation advance',async()=>{
  const r=await load(),v=createClearanceVisual(g,r),listeners=new Map()
  const events={on(n,f){if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f)},off(n,f){listeners.get(n)?.delete(f)},emit(n,e){for(const f of listeners.get(n)||[])f(e)}}
  const native={THREE:T,events,enemies:{raycast:()=>null},physics:{raycast:()=>null},game:{state:'playing',run:{time:0}},player:{alive:true}}
  const target=installCharacterTarget(native,v.instance,{animation:v.animation,clipFor:v.clipFor})
  try{
    v.setState('Patrol');const before=v.animation.updateCount();v.update(7.25)
    assert.equal(v.animation.updateCount(),before+1);assert.ok(v.animation.capture().time<r.character.clips[0].duration)
    const saved=v.animation.capture();v.setState('Patrol');v.update(0);assert.deepEqual(v.animation.capture(),saved)
    v.setState('Aim');v.aimAt(new T.Vector3(0,1.6,-30));v.setState('Fire');v.update(3.25)
    assert.equal(v.snapshot().role,'Aim');assert.equal(v.animation.updateCount(),before+2)
    target.actor.damage(20,new T.Vector3(),new T.Vector3(0,0,-1),'body');assert.equal(v.snapshot().role,'Hit')
    assert.equal(v.setState('Patrol'),false);const count=v.animation.updateCount();target.update(.5)
    assert.equal(v.animation.updateCount(),count+1)
    const capture=JSON.parse(JSON.stringify(v.animation.capture()));v.animation.restore(capture);assert.deepEqual(v.animation.capture(),capture)
    target.update(3);assert.equal(v.snapshot().role,'Idle')
    target.actor.damage(200,new T.Vector3(),new T.Vector3(0,0,-1),'body');assert.equal(v.snapshot().role,'Death')
    target.update(5);assert.equal(v.animation.finished(),true);assert.equal(v.setState('Patrol'),false)
    target.reset();v.reset();assert.equal(v.snapshot().role,'Idle');assert.equal(v.animation.capture().time,0)
  }finally{target.dispose();v.dispose();r.dispose()}
})

test('13 soldiers share repaired geometry/material/textures but own bones/state; no live full-skin grounding',async()=>{
  const r=await load(),visuals=Array.from({length:13},()=>createClearanceVisual(g,r))
  try{
    const a=visuals[0]
    for(const[n,v]of visuals.entries()){
      assert.equal(v.instance.mesh.geometry,a.instance.mesh.geometry);assert.equal(v.instance.mesh.material,a.instance.mesh.material)
      assert.equal(v.muzzle.parent.geometry,a.muzzle.parent.geometry);assert.equal(v.muzzle.parent.material,a.muzzle.parent.material)
      if(n)assert.notEqual(v.instance.skeleton,a.instance.skeleton)
      v.root.position.x=n*2;v.setState(n%2?'Patrol':'Aim');v.update(.5)
      assert.equal(v.snapshot().groundingCost.fullGroundScans,0)
      assert.ok(v.snapshot().groundingCost.footSamples<=128)
    }
    const previous=visuals[1].animation.capture();a.setState('Hit');a.update(.2)
    assert.deepEqual(visuals[1].animation.capture(),previous)
    const original=r.character.createInstance()
    assert.notEqual(original.mesh.geometry,a.instance.mesh.geometry);assert.equal(original.mesh.geometry.index.count,102927)
    for(const name of Object.keys(original.mesh.geometry.attributes))assert.deepEqual(a.instance.mesh.geometry.attributes[name].array,original.mesh.geometry.attributes[name].array)
    original.dispose()
  }finally{visuals.forEach(v=>v.dispose());r.dispose()}
})

test('sniper borrows the exact soldier resource without decoding/releasing it, including failed gun load',async()=>{
  let decoded=0
  const r=await load({decodeImage:async()=>{decoded++;return {width:2048,height:2048,close(){}}}})
  const s=await loadSniperResources(g,{characterResource:r.character,decodeImage:async()=>{assert.fail('borrow redecoded soldier')},loadTexture})
  const sniper=createSniperVisual(g,s),soldier=createClearanceVisual(g,r)
  try{
    assert.equal(decoded,3);assert.equal(r.character.snapshot().liveInstances,2)
    assert.equal(sniper.instance.mesh.material,soldier.instance.mesh.material)
    assert.equal(s.snapshot().characterOwnership,'borrowed')
    s.dispose();assert.equal(r.character.snapshot().closing,false);sniper.update(.4)
    sniper.dispose();assert.equal(s.snapshot().released,true);assert.equal(r.character.snapshot().closing,false)
    await assert.rejects(loadSniperResources(g,{characterResource:r.character,loadTexture:async()=>{throw Error('expected gun failure')}}),/expected gun failure/)
    assert.equal(r.character.snapshot().closing,false);soldier.update(.3);checkContact(soldier)
    const extra=createClearanceVisual(g,r);extra.dispose()
  }finally{sniper.dispose();s.dispose();soldier.dispose();r.dispose()}
})

test('resource disposal is deferred/idempotent, closes original images once, and cleans partial loads',async()=>{
  let closed=0
  const r=await load({decodeImage:async()=>({width:2048,height:2048,close(){closed++}})})
  const a=createClearanceVisual(g,r),b=createWorkerVisual(g,r)
  const objects=[a.instance.mesh.geometry,a.instance.mesh.material,a.instance.mesh.material.map,
    a.muzzle.parent.geometry,a.muzzle.parent.material,a.muzzle.parent.material.map,b.root.children[0].children[0].geometry,b.root.children[0].children[0].material]
  const counts=objects.map(()=>0);objects.forEach((object,n)=>object.addEventListener('dispose',()=>counts[n]++))
  r.dispose();r.dispose();assert.equal(r.snapshot().released,false);assert.equal(closed,0)
  assert.throws(()=>createClearanceVisual(g,r),/live resources/)
  a.update(.4);a.instance.dispose();a.dispose();assert.equal(closed,3);assert.equal(a.animation.snapshot().disposed,true)
  assert.equal(r.snapshot().released,false);b.dispose();b.dispose();r.dispose()
  assert.ok(counts.every(n=>n===1));assert.equal(r.snapshot().released,true)
  let failureClosed=0,partialDisposed=0
  await assert.rejects(load({decodeImage:async()=>({width:2048,height:2048,close(){failureClosed++}}),loadTexture:async url=>{
    if(url.includes('worker'))throw Error('expected worker failure')
    const texture=await loadTexture();texture.addEventListener('dispose',()=>partialDisposed++);return texture
  }}),/expected worker failure/)
  assert.equal(failureClosed,3);assert.equal(partialDisposed,1)
})

test('personnel owner may close first while borrowed sniper keeps original soldier resources alive',async()=>{
  let closed=0
  const r=await load({decodeImage:async()=>({width:2048,height:2048,close(){closed++}})})
  const s=await loadSniperResources(g,{characterResource:r.character,loadTexture}),sniper=createSniperVisual(g,s)
  const regular=createClearanceVisual(g,r),originalMaterial=sniper.instance.mesh.material
  let released=0;originalMaterial.addEventListener('dispose',()=>released++)
  r.dispose();regular.dispose()
  assert.equal(r.snapshot().released,true);assert.equal(r.character.snapshot().released,false);assert.equal(closed,0)
  sniper.update(.5);assert.equal(sniper.snapshot().disposed,false)
  s.dispose();sniper.dispose();assert.equal(r.character.snapshot().released,true)
  assert.equal(closed,3);assert.equal(released,1)
})
