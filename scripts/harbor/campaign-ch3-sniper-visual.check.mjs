import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { loadSniperResources,createSniperVisual,SNIPER_CLIPS } from './campaign-ch3-sniper-visual.mjs'
import { loadCharacterAsset } from './character-assets.mjs'
import { createCharacterAnimation } from './character-animation.mjs'
import { installCharacterTarget } from './character-native-target.mjs'
import { bakeSniperAssets,bakeSniperGun,SNIPER_GUN_SOURCE } from './convert-ch3-sniper-asset.mjs'
import { sniperGun } from '../../assets/harbor/ch3-sniper-derived/sniper.mesh.mjs'

const {T}=await nativeFixture(),bytes=await fs.readFile(new URL('../../assets/harbor/soldier/soldier.glb',import.meta.url))
const hash=data=>createHash('sha256').update(data).digest('hex')
const decodeImage=async()=>({width:2048,height:2048,close(){}})
const loadTexture=async()=>new T.Texture({width:2048,height:2048})
const resources=()=>loadSniperResources({THREE:T},{bytes,decodeImage,loadTexture})
const world=o=>o.getWorldPosition(new T.Vector3())
const bone=(v,name)=>v.instance.skeleton.bones.find(b=>b.userData.sourceName===`mixamorig:${name}`)
const sampleSkin=v=>{
  const mesh=v.instance.mesh,indices=new Set(mesh.geometry.index.array),p=new T.Vector3(),box=new T.Box3(),points=new Map()
  v.root.updateMatrixWorld(true);v.instance.skeleton.update()
  const inverse=v.root.matrixWorld.clone().invert()
  for(const n of indices){mesh.getVertexPosition(n,p);p.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);box.expandByPoint(p);points.set(n,p.clone())}
  let longest=0
  for(let k=0;k<mesh.geometry.index.count;k+=3){const a=points.get(mesh.geometry.index.array[k]),b=points.get(mesh.geometry.index.array[k+1]),c=points.get(mesh.geometry.index.array[k+2]);longest=Math.max(longest,a.distanceTo(b),b.distanceTo(c),c.distanceTo(a))}
  return {box,longest}
}
const checkContact=v=>{
  const s=v.snapshot();assert.ok(s.gripError<.00001,`right palm ${s.gripError}`);assert.ok(s.foreEndError<.00001,`left palm ${s.foreEndError}`)
  assert.ok(s.aim.reachError<.00001)
  for(const side of ['Right','Left'])for(const finger of ['Index','Middle','Ring','Pinky']){
    const first=world(bone(v,`${side}Hand${finger}1`)),tip=world(bone(v,`${side}Hand${finger}4`))
    assert.ok(first.distanceTo(tip)<.105,`${side} ${finger} must be closed (${first.distanceTo(tip)})`)
  }
}

test('offline rifle reproduces exact source geometry/JPEG/material and surface sockets',async()=>{
  const source=await fs.readFile(new URL('../../assets/harbor/guns/狙击枪.glb',import.meta.url))
  assert.equal(hash(source),SNIPER_GUN_SOURCE.sha256)
  const corrupted=Buffer.from(source);corrupted[corrupted.length-1]^=1
  assert.throws(()=>bakeSniperGun(corrupted),/source changed/)
  const files=await bakeSniperAssets()
  for(const [name,data] of Object.entries(files))assert.deepEqual(data,await fs.readFile(new URL(`../../assets/harbor/ch3-sniper-derived/${name}`,import.meta.url)))
  const length=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+length)),binary=source.subarray(28+length),derived=Buffer.from(sniperGun.data,'base64')
  for(const [n,name] of ['position','normal','uv','index'].entries()){
    const a=sniperGun.attributes[name],v=json.bufferViews[n],size=a.componentType===5123?2:4
    assert.deepEqual(derived.subarray(a.offset,a.offset+a.length*size),binary.subarray(v.byteOffset,v.byteOffset+v.byteLength))
  }
  for(const [name,triangle] of [['grip',1899],['foreEnd',786]]){
    const pa=sniperGun.attributes.position,ia=sniperGun.attributes.index,pos=new Float32Array(derived.buffer,derived.byteOffset+pa.offset,pa.length),index=new Uint16Array(derived.buffer,derived.byteOffset+ia.offset,ia.length)
    const tri=new T.Triangle(...[0,1,2].map(n=>new T.Vector3().fromArray(pos,index[triangle*3+n]*3))),point=new T.Vector3().fromArray(sniperGun.sockets[name])
    assert.ok(tri.closestPointToPoint(point,new T.Vector3()).distanceTo(point)<1e-12)
  }
  const r=await resources(),v=createSniperVisual({THREE:T},r),gun=v.muzzle.parent
  assert.equal(v.scope.parent,gun);assert.equal(gun.geometry.attributes.position.count,4991);assert.equal(gun.geometry.index.count,19017)
  assert.equal(gun.material.map.colorSpace,T.SRGBColorSpace);assert.equal(gun.material.map.flipY,false)
  assert.equal(gun.material.side,T.DoubleSide);assert.equal(gun.material.metalness,0);assert.equal(gun.material.roughness,.8999999761581421)
  assert.ok(Math.abs(gun.geometry.boundingBox.getSize(new T.Vector3()).z*gun.scale.z-1.25)<1e-12)
  v.dispose();r.dispose()
})

test('real Aim/Fire clips, three yaws and up/down targets keep both palms and actual barrel aligned',async()=>{
  const r=await resources(),v=createSniperVisual({THREE:T},r)
  try{
    for(const yaw of [-1.1,.735,2.3])for(const pitch of [-.5,0,.5]){
      v.reset();v.root.position.set(8,5.2,-154);v.root.rotation.y=yaw;v.update(0)
      const aim=new T.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch))
      const point=v.getMuzzle().addScaledVector(aim,40)
      v.aimAt(point)
      for(let k=0;k<72;k++){
        v.update(1/24);checkContact(v)
        assert.ok(v.getForward().angleTo(point.clone().sub(v.getMuzzle()).normalize())<1e-6)
      }
      assert.equal(v.animation.snapshot().index,3);assert.ok(v.animation.snapshot().mixerTime>=3-1e-10)
      const dir=v.getForward(),rootPosition=v.root.position.clone(),before=bone(v,'Spine2').quaternion.clone()
      v.lockDirection(dir);const locked=v.animation.capture(),pose=v.instance.skeleton.bones.map(b=>b.quaternion.clone()),muzzle=v.getMuzzle()
      for(let n=0;n<3;n++){assert.equal(v.aimAt(point.clone().negate()),false);v.update(.1)}
      assert.deepEqual(v.animation.capture(),locked);assert.ok(v.getMuzzle().distanceTo(muzzle)<1e-10)
      pose.forEach((q,n)=>assert.deepEqual(Array.from(q.toArray()),Array.from(v.instance.skeleton.bones[n].quaternion.toArray())))
      v.setState('Fire');assert.equal(v.animation.snapshot().index,6)
      for(let k=0;k<22;k++){
        v.update(1/24);checkContact(v)
        assert.ok(v.getForward().angleTo(dir)<1e-6);assert.equal(v.aimAt(point.clone().negate()),false)
        assert.deepEqual(v.root.position,rootPosition)
      }
      assert.ok(before.angleTo(bone(v,'Spine2').quaternion)>1e-4,'Fire must animate the actual upper body')
      v.update(.05);checkContact(v);assert.equal(v.snapshot().role,'Aim')
    }
    v.reset();v.aimAt(v.getMuzzle().add(new T.Vector3(0,100,-10)))
    assert.equal(v.snapshot().aim.limited,true);assert.equal(v.snapshot().aim.pitch,.65)
    assert.ok(Math.abs(v.getForward().y)>.9,'axis must remain actual requested direction even when body pitch is limited')
  }finally{v.dispose();r.dispose()}
})

test('repeat role dispatch, paused evaluation, reset and direct native target Hit/Death use one mixer',async()=>{
  const r=await resources(),v=createSniperVisual({THREE:T},r),listeners=new Map()
  const events={on(n,f){if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f)},off(n,f){listeners.get(n)?.delete(f)},emit(n,e){for(const f of listeners.get(n)||[])f(e)}}
  const g={THREE:T,events,enemies:{raycast:()=>null},physics:{raycast:()=>null},game:{state:'playing',run:{time:0}},player:{alive:true}}
  const target=installCharacterTarget(g,v.instance,{animation:v.animation,clipFor:v.clipFor})
  try{
    v.update(.4);v.setState('Aim');assert.equal(v.animation.capture().time,.4)
    v.lockDirection(v.getForward());v.setState('Fire');v.update(.2)
    const captured=v.animation.capture(),count=v.animation.updateCount()
    v.setState('Fire');v.update(0);assert.deepEqual(v.animation.capture(),captured);assert.equal(v.animation.updateCount(),count)
    target.actor.damage(20,new T.Vector3(),new T.Vector3(0,0,-1),'body')
    assert.equal(v.snapshot().role,'Hit');assert.equal(v.animation.snapshot().index,5);assert.equal(v.snapshot().locked,false)
    assert.equal(v.setState('Aim'),false);target.update(.2);assert.equal(v.animation.updateCount(),count+1)
    const hitTime=v.animation.capture().time;v.setState('Hit');assert.equal(v.animation.capture().time,hitTime)
    target.update(1);assert.equal(v.snapshot().role,'Aim')
    target.actor.damage(200,new T.Vector3(),new T.Vector3(0,0,-1),'body')
    assert.equal(v.snapshot().role,'Death');assert.equal(v.animation.snapshot().index,8)
    v.setState('Fire');assert.equal(v.snapshot().role,'Death')
    target.update(4);assert.equal(v.animation.finished(),true)
    const death=v.animation.capture();target.update(.2);assert.deepEqual(v.animation.capture(),death)
    const pos=v.root.position.clone(),yaw=v.root.rotation.y
    target.reset();v.reset();assert.equal(v.snapshot().role,'Aim');assert.equal(v.snapshot().locked,false)
    assert.equal(v.animation.capture().time,0);assert.deepEqual(v.root.position,pos);assert.equal(v.root.rotation.y,yaw);checkContact(v)
    for(let n=0;n<8;n++){v.setState('Hit');v.update(.2);v.reset();checkContact(v)}
    assert.equal(listeners.get('game:state').size,1)
  }finally{target.dispose();v.dispose();r.dispose()}
  assert.equal(listeners.get('game:state').size,0)
})

test('Death removes only triangle 18494 on instance clone; indexed skin is grounded and no death spike survives',async()=>{
  const r=await resources(),v=createSniperVisual({THREE:T},r),reference=await loadCharacterAsset(T,{kind:'soldier',bytes,decodeImage}),plain=reference.createInstance()
  try{
    assert.notEqual(v.instance.mesh.geometry,plain.mesh.geometry)
    const actual=v.instance.mesh.geometry.index.array,original=plain.mesh.geometry.index.array
    assert.deepEqual(Array.from(actual.subarray(0,55482)),Array.from(original.subarray(0,55482)))
    assert.deepEqual(Array.from(actual.subarray(55482)),Array.from(original.subarray(55485)))
    for(const name of Object.keys(plain.mesh.geometry.attributes))assert.deepEqual(v.instance.mesh.geometry.attributes[name].array,plain.mesh.geometry.attributes[name].array)
    for(const n of [12905,12983]){assert.ok(original.includes(n));assert.equal(actual.includes(n),false)}
    const raw=createCharacterAnimation(T,plain,reference);raw.playClip(8,{fade:0});raw.update(3)
    const sourceTriangle=original.subarray(55482,55485),points=Array.from(sourceTriangle,n=>plain.mesh.getVertexPosition(n,new T.Vector3()).applyMatrix4(plain.mesh.matrixWorld))
    assert.ok(Math.max(points[0].distanceTo(points[2]),points[1].distanceTo(points[2]))>1.5,'real source reproduces death spike')
    v.root.position.set(8,5.2,-154);v.root.rotation.y=.735;v.setState('Death')
    const logical=v.root.position.clone()
    for(let n=0;n<73;n++){
      v.update(1/24);const s=sampleSkin(v)
      assert.ok(Math.abs(s.box.min.y)<1e-6,`death grounding ${s.box.min.y}`)
      assert.ok(s.longest<.5,`unwanted stretched triangle ${s.longest}`)
      assert.deepEqual(v.root.position,logical)
    }
    const final=sampleSkin(v);assert.ok(final.box.max.y<.6);assert.ok(v.snapshot().grounding>.1&&v.snapshot().grounding<.3)
    const frozen=v.animation.capture();v.update(0);assert.deepEqual(v.animation.capture(),frozen)
    v.reset();assert.equal(v.snapshot().grounding,0);assert.equal(plain.mesh.geometry.index.count,102927)
  }finally{v.dispose();r.dispose();plain.dispose();reference.dispose()}
})

test('visuals own clone/skeleton/mixer; owner defers shared gun and character release, including direct instance disposal',async()=>{
  let closed=0
  const r=await loadSniperResources({THREE:T},{bytes,decodeImage:async()=>({width:2048,height:2048,close(){closed++}}),loadTexture})
  const a=createSniperVisual({THREE:T},r),b=createSniperVisual({THREE:T},r)
  assert.notEqual(a.instance.skeleton,b.instance.skeleton);assert.notEqual(a.instance.mesh.geometry,b.instance.mesh.geometry)
  assert.equal(a.instance.mesh.material,b.instance.mesh.material);assert.equal(a.muzzle.parent.geometry,b.muzzle.parent.geometry)
  const owned=[a.instance.mesh.geometry,b.instance.mesh.geometry],shared=[a.muzzle.parent.geometry,a.muzzle.parent.material,a.muzzle.parent.material.map,
    a.instance.mesh.material,a.instance.mesh.material.map,a.instance.mesh.material.normalMap,a.instance.mesh.material.roughnessMap]
  const ownedCounts=owned.map(()=>0),sharedCounts=shared.map(()=>0)
  owned.forEach((o,n)=>o.addEventListener('dispose',()=>ownedCounts[n]++));shared.forEach((o,n)=>o.addEventListener('dispose',()=>sharedCounts[n]++))
  a.dispose();a.dispose();assert.deepEqual(ownedCounts,[1,0]);assert.ok(sharedCounts.every(n=>n===0));assert.equal(closed,0)
  r.dispose();assert.equal(r.snapshot().released,false);assert.throws(()=>createSniperVisual({THREE:T},r),/live resources/)
  b.update(.3);b.instance.dispose();b.dispose();r.dispose()
  assert.deepEqual(ownedCounts,[1,1]);assert.ok(sharedCounts.every(n=>n===1));assert.equal(closed,3)
  assert.equal(r.snapshot().released,true);assert.equal(b.animation.snapshot().disposed,true)
  let failedClosed=0
  await assert.rejects(loadSniperResources({THREE:T},{bytes,decodeImage:async()=>({width:2048,height:2048,close(){failedClosed++}}),loadTexture:async()=>{throw Error('gun load failure')}}),/gun load failure/)
  assert.equal(failedClosed,3)
})
