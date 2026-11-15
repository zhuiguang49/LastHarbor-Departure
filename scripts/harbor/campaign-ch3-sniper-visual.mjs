import { loadCharacterAsset } from './character-assets.mjs'
import { createCharacterAnimation } from './character-animation.mjs'
import { sniperGun } from '../../assets/harbor/ch3-sniper-derived/sniper.mesh.mjs'

export const SNIPER_CLIPS=Object.freeze({Aim:3,Fire:6,Hit:5,Death:8})
const owners=new WeakMap()
const requireValue=(value,message)=>{if(!value)throw Error(`Sniper visual: ${message}`)}

// Optional byte/image seams are only for Node checks; production uses fixed local URLs.
export async function loadSniperResources(g, {bytes,decodeImage,loadTexture,characterResource}={}) {
  const T=g.THREE
  requireValue(T?.REVISION==='180','requires original g.THREE r180')
  let character,geometry,texture,material,closing=false,released=false
  const visuals=new Set()
  const release=()=>{
    if(!closing||visuals.size||released)return
    released=true;if(!characterResource)character?.dispose();geometry?.dispose();material?.dispose();texture?.dispose()
  }
  const resources={dispose(){closing=true;if(!characterResource)character?.dispose();release()},
    snapshot:()=>({closing,released,liveVisuals:visuals.size,characterOwnership:characterResource?'borrowed':'owned',character:character?.snapshot(),gunSource:sniperGun.source})}
  try {
    if(characterResource){
      const source=characterResource.snapshot()?.source
      requireValue(source?.sha256==='640c32f8d454618eb00f310e0b0901918452317fd1bc43fa3630ebc385f344ff'&&!characterResource.snapshot().closing,
        'requires live audited soldier resource')
      character=characterResource
    }else character=await loadCharacterAsset(T,{kind:'soldier',bytes,decodeImage})
    const encoded=atob(sniperGun.data),binary=new Uint8Array(encoded.length)
    for(let i=0;i<encoded.length;i++)binary[i]=encoded.charCodeAt(i)
    geometry=new T.BufferGeometry()
    for(const [name,a] of Object.entries(sniperGun.attributes)){
      const ArrayType=a.componentType===5123?Uint16Array:Float32Array
      const attribute=new T.BufferAttribute(new ArrayType(binary.buffer,a.offset,a.length),a.itemSize)
      if(name==='index')geometry.setIndex(attribute);else geometry.setAttribute(name,attribute)
    }
    geometry.computeBoundingBox();geometry.computeBoundingSphere()
    const url=`/assets/harbor/ch3-sniper-derived/${sniperGun.texture.path}`
    texture=await (loadTexture?loadTexture(url):new T.TextureLoader().loadAsync(url))
    requireValue(texture.image?.width===2048&&texture.image?.height===2048,'gun JPEG must decode to 2048×2048')
    texture.flipY=false;texture.colorSpace=T.SRGBColorSpace
    texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter
    texture.wrapS=T.RepeatWrapping;texture.wrapT=T.RepeatWrapping;texture.generateMipmaps=true;texture.needsUpdate=true
    material=new T.MeshStandardMaterial({name:sniperGun.material.name,map:texture,side:T.DoubleSide,
      metalness:0,roughness:sniperGun.material.pbrMetallicRoughness.roughnessFactor})
    owners.set(resources,{T,character,geometry,material,visuals,release,isClosing:()=>closing})
    return resources
  }catch(error){closing=true;release();throw error}
}

export function createSniperVisual(g, resources) {
  const T=g.THREE,shared=owners.get(resources)
  requireValue(shared&&shared.T===T&&!shared.isClosing(),'requires live resources from this Three instance')
  const instance=shared.character.createInstance({height:1.8}),root=instance.root
  const raw=createCharacterAnimation(T,instance,shared.character)
  // Only this visual owns the repaired index. All attributes/source/other instances stay intact.
  const originalGeometry=instance.mesh.geometry,geometry=originalGeometry.clone(),indices=originalGeometry.index.array
  const repaired=new indices.constructor(indices.length-3),offset=18494*3
  repaired.set(indices.subarray(0,offset));repaired.set(indices.subarray(offset+3),offset)
  geometry.setIndex(new T.BufferAttribute(repaired,1));instance.mesh.geometry=geometry
  const presentation=new T.Group(),adapter=root.children[0]
  root.add(presentation);presentation.add(adapter)
  root.name='campaign-ch3-sniper';presentation.name='sniper-grounding'
  const gun=new T.Group(),mesh=new T.Mesh(shared.geometry,shared.material)
  gun.name='sniper-rifle';mesh.name=sniperGun.meshName;mesh.scale.setScalar(sniperGun.scale)
  mesh.castShadow=mesh.receiveShadow=true;gun.add(mesh);presentation.add(gun)
  const sockets={}
  for(const [name,position] of Object.entries(sniperGun.sockets)){
    const anchor=new T.Object3D();anchor.name=`sniper-${name}`;anchor.position.fromArray(position);mesh.add(anchor);sockets[name]=anchor
  }
  const {muzzle,scope}=sockets
  const bones=Object.fromEntries(instance.skeleton.bones.map(b=>[b.userData.sourceName?.replace('mixamorig:',''),b]))
  const world=object=>object.getWorldPosition(new T.Vector3())
  const worldQ=object=>object.getWorldQuaternion(new T.Quaternion())
  const rootPoint=object=>root.worldToLocal(world(object))
  const setWorldQ=(bone,q)=>{bone.quaternion.copy(worldQ(bone.parent).invert().multiply(q));root.updateMatrixWorld(true)}
  const palm=side=>world(bones[`${side}Hand`]).add(world(bones[`${side}HandMiddle1`])).multiplyScalar(.5)
  let role='Aim',locked=false,disposed=false,pitch=0,requestedPitch=0,reachError=0,groundOffset=0
  let target=null,lockedDirection=null,frozenGrip=null,basePose=null
  const direction=new T.Vector3(0,0,-1),handFrames={},fingerAxes={},fireSupport=new Map()
  const gripBase=new T.Vector3(.055,1.27,-.29),pivot=new T.Vector3(0,1.19,-.03)
  const forwardLocal=new T.Vector3(0,0,1),pitchAxis=new T.Vector3(1,0,0)
  const clipFor=name=>SNIPER_CLIPS[name]??null
  const restoreBones=()=>{
    if(basePose)for(const [bone,q] of basePose)bone.quaternion.copy(q)
    presentation.position.y=0;root.updateMatrixWorld(true)
  }
  raw.playClip(SNIPER_CLIPS.Aim,{loop:true,fade:0})
  for(const name of ['Hips','Spine','Spine1','Spine2','LeftShoulder','RightShoulder'])fireSupport.set(bones[name],bones[name].quaternion.clone())
  // World hand orientation from the real Aim, expressed relative to a -Z rifle.
  const referenceGunQ=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI)
  for(const side of ['Right','Left']){
    const hand=bones[`${side}Hand`],q=worldQ(hand)
    handFrames[side]={rotation:referenceGunQ.clone().invert().multiply(q),
      palmOffset:hand.worldToLocal(palm(side))}
    const along=world(bones[`${side}HandMiddle1`]).sub(world(hand)).normalize()
    const across=world(bones[`${side}HandIndex1`]).sub(world(bones[`${side}HandPinky1`])).normalize()
    const inward=across.cross(along).normalize().multiplyScalar(side==='Left'?-1:1)
    for(const finger of ['Index','Middle','Ring','Pinky','Thumb'])for(let n=1;n<=3;n++){
      const bone=bones[`${side}Hand${finger}${n}`],next=bones[`${side}Hand${finger}${n+1}`]
      const axis=world(next).sub(world(bone)).normalize().cross(inward).normalize()
      fingerAxes[bone.name]=axis.applyQuaternion(worldQ(bone).invert())
    }
  }
  // Analytic two-bone IK changes rotations only. Source limb lengths and skin remain exact.
  function solveArm(side,contact,gunQ) {
    const upper=bones[`${side}Arm`],lower=bones[`${side}ForeArm`],hand=bones[`${side}Hand`]
    const q=gunQ.clone().multiply(handFrames[side].rotation)
    const scale=hand.getWorldScale(new T.Vector3())
    const wrist=contact.clone().sub(handFrames[side].palmOffset.clone().multiply(scale).applyQuaternion(q))
    const shoulder=world(upper),elbow=world(lower),oldWrist=world(hand)
    const a=shoulder.distanceTo(elbow),b=elbow.distanceTo(oldWrist),delta=wrist.clone().sub(shoulder),distance=delta.length()
    const d=Math.max(Math.abs(a-b)+1e-5,Math.min(a+b-1e-5,distance)),axis=delta.normalize()
    reachError=Math.max(reachError,Math.abs(distance-d))
    // Keep the source animated elbow's plane; Fire still contributes body/recoil motion.
    const pole=elbow.clone().sub(shoulder);pole.addScaledVector(axis,-pole.dot(axis))
    if(pole.lengthSq()<1e-8)pole.set(side==='Right'?1:-1,-1,0).applyQuaternion(worldQ(root)).projectOnPlane(axis)
    pole.normalize()
    const x=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-x*x))
    const desiredElbow=shoulder.clone().addScaledVector(axis,x).addScaledVector(pole,height)
    const turn=new T.Quaternion().setFromUnitVectors(elbow.sub(shoulder).normalize(),desiredElbow.clone().sub(shoulder).normalize())
    setWorldQ(upper,turn.multiply(worldQ(upper)))
    const actualElbow=world(lower),toWrist=shoulder.clone().addScaledVector(axis,d).sub(actualElbow).normalize()
    const bend=new T.Quaternion().setFromUnitVectors(world(hand).sub(actualElbow).normalize(),toWrist)
    setWorldQ(lower,bend.multiply(worldQ(lower)));setWorldQ(hand,q)
  }
  function closeFingers() {
    for(const side of ['Right','Left'])for(const finger of ['Index','Middle','Ring','Pinky','Thumb'])for(let n=1;n<=3;n++){
      const bone=bones[`${side}Hand${finger}${n}`]
      const angle=(finger==='Thumb'?[.35,.6,.5]:[.65,1.05,.8])[n-1]
      bone.quaternion.multiply(new T.Quaternion().setFromAxisAngle(fingerAxes[bone.name],angle))
    }
    root.updateMatrixWorld(true)
  }
  function placeGun(grip,q) {
    gun.quaternion.copy(worldQ(presentation).invert().multiply(q))
    gun.position.copy(presentation.worldToLocal(grip.clone()))
    gun.position.sub(new T.Vector3().fromArray(sniperGun.sockets.grip).multiplyScalar(sniperGun.scale).applyQuaternion(gun.quaternion))
    root.updateMatrixWorld(true)
  }
  const updateSkin=()=>{root.updateMatrixWorld(true);instance.skeleton.update()}
  function applyPose() {
    basePose=instance.skeleton.bones.map(bone=>[bone,bone.quaternion.clone()])
    reachError=0;groundOffset=0
    if(role==='Aim'||role==='Fire'){
      // Fire's authored shoulder retreat exceeds the real left arm length.
      // Keep 20% of that torso recoil over the held Aim support, then solve arms.
      if(role==='Fire'||raw.snapshot().activeActions>1)for(const [bone,q] of fireSupport)bone.quaternion.slerp(q,.8)
      root.updateMatrixWorld(true)
      for(const name of ['Spine','Spine1','Spine2']){
        const bone=bones[name],axis=pitchAxis.clone().applyQuaternion(worldQ(root)).applyQuaternion(worldQ(bone).invert())
        bone.quaternion.multiply(new T.Quaternion().setFromAxisAngle(axis,pitch/3));root.updateMatrixWorld(true)
      }
      const q=new T.Quaternion().setFromUnitVectors(forwardLocal,direction)
      // Keep the rifle's up axis aligned with the body (no roll from shortest-arc +Z).
      const aimMatrix=new T.Matrix4().lookAt(new T.Vector3(),direction.clone().negate(),new T.Vector3(0,1,0))
      q.setFromRotationMatrix(aimMatrix)
      const grip=frozenGrip?.clone()??root.localToWorld(gripBase.clone().sub(pivot).applyAxisAngle(pitchAxis,pitch).add(pivot))
      placeGun(grip,q)
      solveArm('Right',world(sockets.grip),q);solveArm('Left',world(sockets.foreEnd),q)
      closeFingers()
    }else {
      closeFingers()
      const q=worldQ(bones.RightHand).multiply(handFrames.Right.rotation.clone().invert())
      placeGun(palm('Right'),q)
    }
    updateSkin()
    if(role==='Death'){
      let minimum=Infinity
      const used=new Set(repaired),vertex=new T.Vector3(),inverse=root.matrixWorld.clone().invert()
      for(const index of used){instance.mesh.getVertexPosition(index,vertex);vertex.applyMatrix4(instance.mesh.matrixWorld).applyMatrix4(inverse);minimum=Math.min(minimum,vertex.y)}
      groundOffset=-minimum;presentation.position.y=groundOffset;updateSkin()
      // The dying hand releases the rifle; ground the dropped gun separately,
      // rather than lifting the entire corpse to accommodate a downward barrel.
      const alpha=Math.min(1,raw.snapshot().time/.8)
      const restQ=worldQ(root).multiply(referenceGunQ).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI/2))
      gun.quaternion.slerp(worldQ(presentation).invert().multiply(restQ),alpha)
      gun.position.lerp(new T.Vector3(.3,gun.position.y,.35),alpha);root.updateMatrixWorld(true)
      let gunMin=Infinity
      for(let i=0;i<shared.geometry.attributes.position.count;i++){
        vertex.fromBufferAttribute(shared.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse)
        gunMin=Math.min(gunMin,vertex.y)
      }
      if(gunMin<0||alpha===1)gun.position.y-=gunMin
      updateSkin()
    }
  }
  function setState(next) {
    requireValue(clipFor(next)!==null,`unknown role ${next}`)
    if(disposed||role==='Death')return false
    if(next===role){
      // A fresh TRACK notification can release a cancelled LOCK without replaying Aim.
      if(next==='Aim'){locked=false;lockedDirection=frozenGrip=null}
      return false
    }
    if(role==='Hit'&&!raw.finished()&&!['Hit','Death'].includes(next))return false
    restoreBones();role=next
    if(next==='Hit'||next==='Death'){locked=false;lockedDirection=frozenGrip=target=null}
    raw.playClip(clipFor(next),{loop:next==='Aim',fade:.1,restart:false});applyPose();return true
  }
  function aimAt(point) {
    if(disposed||locked||role==='Hit'||role==='Death')return false
    requireValue(point&&['x','y','z'].every(k=>Number.isFinite(point[k])),'invalid aim point')
    target=point.clone()
    // Iterate against the actual off-axis muzzle, including the gun's source offsets.
    for(let n=0;n<6;n++){
      const delta=target.clone().sub(world(muzzle));if(delta.lengthSq()<1e-8)return false
      direction.copy(delta).normalize();requestedPitch=Math.asin(direction.y);pitch=Math.max(-.65,Math.min(.65,requestedPitch))
      root.rotation.y=Math.atan2(-direction.x,-direction.z)
      restoreBones();applyPose()
    }
    return true
  }
  function lockDirection(value) {
    if(disposed||role==='Hit'||role==='Death'||locked)return false
    requireValue(value&&['x','y','z'].every(k=>Number.isFinite(value[k]))&&value.lengthSq()>1e-8,'invalid lock direction')
    restoreBones();direction.copy(value).normalize();requestedPitch=Math.asin(direction.y);pitch=Math.max(-.65,Math.min(.65,requestedPitch))
    root.rotation.y=Math.atan2(-direction.x,-direction.z);applyPose()
    locked=true;target=null;lockedDirection=direction.clone();frozenGrip=world(sockets.grip)
    return true
  }
  function update(dt) {
    if(disposed)return
    requireValue(Number.isFinite(dt)&&dt>=0,'dt must be nonnegative')
    if(locked&&role==='Aim')return // Freeze the evaluated Aim pose throughout LOCK.
    restoreBones()
    // A paused tick re-evaluates matrices without advancing the native mixer.
    if(dt>0)raw.update(dt)
    if((role==='Fire'||role==='Hit')&&raw.finished()){
      role='Aim';locked=false;lockedDirection=frozenGrip=null
      raw.playClip(SNIPER_CLIPS.Aim,{loop:true,fade:.15,restart:false})
    }
    if(!locked&&role==='Aim')direction.set(0,Math.sin(pitch),-Math.cos(pitch)).applyQuaternion(worldQ(root))
    applyPose()
    if(target&&dt>0)aimAt(target)
  }
  function reset() {
    if(disposed)return
    restoreBones();raw.stop();role='Aim';locked=false;lockedDirection=frozenGrip=target=null;pitch=requestedPitch=0
    raw.playClip(SNIPER_CLIPS.Aim,{loop:true,fade:0});direction.set(0,0,-1).applyQuaternion(worldQ(root));applyPose()
  }
  const animation={...raw,
    playClip(index,options={}){
      const next=Object.keys(SNIPER_CLIPS).find(key=>SNIPER_CLIPS[key]===index)
      requireValue(next,'only audited sniper clips supported')
      if(disposed||role==='Death')return raw.snapshot()
      if(next===role&&options.restart===false)return raw.snapshot()
      restoreBones();role=next
      if(next==='Hit'||next==='Death'){locked=false;lockedDirection=frozenGrip=target=null}
      raw.playClip(index,options);applyPose();return raw.snapshot()
    },update,
    restore(data){restoreBones();raw.restore(data);role=Object.keys(SNIPER_CLIPS).find(key=>SNIPER_CLIPS[key]===data.index)??'Aim'
      locked=false;lockedDirection=frozenGrip=target=null;applyPose()},
  }
  const visual={root,instance,animation,muzzle,scope,getMuzzle:()=>world(muzzle),getEye:()=>world(bones.Head),
    getForward:()=>forwardLocal.clone().transformDirection(mesh.matrixWorld),aimAt,lockDirection,update,setState,reset,clipFor,
    snapshot:()=>({role,locked,disposed,clip:raw.snapshot(),position:root.position.toArray(),yaw:root.rotation.y,height:1.8,
      aim:{pitch,requestedPitch,limited:Math.abs(pitch-requestedPitch)>1e-6,reachError,lockedDirection:lockedDirection?.toArray()??null},
      muzzle:world(muzzle).toArray(),scope:world(scope).toArray(),forward:visual.getForward().toArray(),
      gripError:palm('Right').distanceTo(world(sockets.grip)),foreEndError:palm('Left').distanceTo(world(sockets.foreEnd)),
      grounding:groundOffset,removedTriangle:18494,resourceOwnership:'borrow shared owner; own repaired geometry/skeleton/mixer/sockets'}),
    dispose(){if(disposed)return;instance.dispose()},
  }
  instance.onDispose(()=>{disposed=true;raw.dispose();geometry.dispose();gun.removeFromParent();shared.visuals.delete(visual);shared.release()})
  shared.visuals.add(visual);reset();return visual
}
