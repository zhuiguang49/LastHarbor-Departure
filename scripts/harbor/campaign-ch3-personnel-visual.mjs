import { loadCharacterAsset } from './character-assets.mjs'
import { createCharacterAnimation } from './character-animation.mjs'
import { rifle } from '../../assets/harbor/ch3-personnel-derived/rifle.mesh.mjs'
import { worker } from '../../assets/harbor/ch3-personnel-derived/worker.mesh.mjs'

export const CLEARANCE_CLIPS=Object.freeze({Idle:7,Patrol:0,Aim:3,Fire:1,Hit:5,Death:8})
const owners=new WeakMap()
const requireValue=(value,message)=>{if(!value)throw Error(`CH3 personnel: ${message}`)}
const loopRole=role=>['Idle','Patrol','Aim'].includes(role)
function geometryFor(T,asset) {
  const encoded=atob(asset.data),binary=new Uint8Array(encoded.length)
  for(let i=0;i<encoded.length;i++)binary[i]=encoded.charCodeAt(i)
  const geometry=new T.BufferGeometry()
  for(const [name,a]of Object.entries(asset.attributes)){
    const ArrayType=a.componentType===5123?Uint16Array:Float32Array
    const attribute=new T.BufferAttribute(new ArrayType(binary.buffer,a.offset,a.length),a.itemSize)
    if(name==='index')geometry.setIndex(attribute);else geometry.setAttribute(name,attribute)
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry
}

// Fixed local URLs. bytes/decodeImage/loadTexture are the same Node seams as the soldier loader.
export async function loadChapter3PersonnelResources(g,testOptions={}) {
  const T=g.THREE
  requireValue(T?.REVISION==='180','requires original g.THREE r180')
  let character,closing=false,released=false,repairedGeometry,footVertices,deathVertices
  const assets=new Map(),visuals=new Set(),textures=[]
  const release=()=>{
    if(!closing||visuals.size||released)return
    released=true;repairedGeometry?.dispose()
    for(const {geometry,material}of assets.values()){geometry.dispose();material?.dispose()}
    for(const texture of textures)texture.dispose()
  }
  const resources={get character(){return character},dispose(){closing=true;character?.dispose();release()},
    snapshot:()=>({closing,released,liveVisuals:visuals.size,character:character?.snapshot(),
      rifleSource:rifle.source,workerSource:worker.source,removedTriangle:18494,footSamples:footVertices?.length??0,
      sharing:'one repaired soldier geometry/material/textures, one rifle geometry/material/texture; independent skeleton/mixer per soldier'})}
  try{
    character=await loadCharacterAsset(T,{kind:'soldier',bytes:testOptions.bytes,decodeImage:testOptions.decodeImage})
    const probe=character.createInstance(),source=probe.mesh.geometry
    try{
      repairedGeometry=source.clone()
      const original=source.index.array,repaired=new original.constructor(original.length-3),offset=18494*3
      repaired.set(original.subarray(0,offset));repaired.set(original.subarray(offset+3),offset);repairedGeometry.setIndex(new T.BufferAttribute(repaired,1))
      // A small bind-space XZ grid keeps the lowest sole vertex in each occupied cell.
      // Only these source foot vertices are skinned for live grounding (no whole-body scan).
      const positions=source.attributes.position,cells=new Map(),used=new Set(repaired)
      const floor=source.boundingBox.min.y
      for(const index of used){const y=positions.getY(index);if(y>floor+.045)continue
        const key=`${Math.floor(positions.getX(index)/.018)}:${Math.floor(positions.getZ(index)/.018)}`
        if(!cells.has(key)||y<positions.getY(cells.get(key)))cells.set(key,index)
      }
      footVertices=[...cells.values()];deathVertices=[...used]
      requireValue(footVertices.length>8&&footVertices.length<=128,'unexpected sole sampling size')
    }finally{probe.dispose()}
    for(const [name,asset]of [['rifle',rifle],['worker',worker]]){
      const geometry=geometryFor(T,asset),loaded=[]
      assets.set(name,{geometry,material:null})
      for(const spec of asset.textures){
        const url=`/assets/harbor/ch3-personnel-derived/${spec.path}`
        const texture=await (testOptions.loadTexture?testOptions.loadTexture(url):new T.TextureLoader().loadAsync(url))
        textures.push(texture);loaded.push(texture)
        requireValue(texture.image?.width===2048&&texture.image?.height===2048,'JPEG must decode to 2048×2048')
        texture.flipY=false;texture.colorSpace=spec.path.includes('basecolor')?T.SRGBColorSpace:T.NoColorSpace
        texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter
        texture.wrapS=T.RepeatWrapping;texture.wrapT=T.RepeatWrapping;texture.generateMipmaps=true;texture.needsUpdate=true
      }
      const m=asset.material,p=m.pbrMetallicRoughness
      assets.get(name).material=new T.MeshStandardMaterial({name:m.name,side:T.DoubleSide,
        map:loaded[name==='worker'?1:0],...(name==='worker'?{normalMap:loaded[0],roughnessMap:loaded[2],metalnessMap:loaded[2]}:{}),
        metalness:p.metallicFactor??1,roughness:p.roughnessFactor??1})
    }
    owners.set(resources,{T,character,assets,repairedGeometry,footVertices,deathVertices,visuals,release,isClosing:()=>closing})
    return resources
  }catch(error){resources.dispose();throw error}
}
const sharedFor=(g,resources)=>{
  const shared=owners.get(resources)
  requireValue(shared&&shared.T===g.THREE&&!shared.isClosing(),'requires live resources from this Three instance')
  return shared
}

export function createWorkerVisual(g,resources) {
  const shared=sharedFor(g,resources),T=g.THREE,{geometry,material}=shared.assets.get('worker')
  const root=new T.Group(),adapter=new T.Group(),mesh=new T.Mesh(geometry,material)
  root.name='campaign-ch3-worker';adapter.name='worker-static-calibration';mesh.name=worker.meshName
  adapter.scale.setScalar(worker.scale);adapter.rotation.y=worker.yawRadians
  mesh.position.fromArray(worker.sourceOffset);mesh.castShadow=mesh.receiveShadow=true;adapter.add(mesh);root.add(adapter)
  let disposed=false
  const visual={root,snapshot:()=>({disposed,height:worker.heightMetres,sourceForward:'+Z',gameForward:'-Z',
    position:root.position.toArray(),yaw:root.rotation.y,static:true,animation:false,target:false}),
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();shared.visuals.delete(visual);shared.release()}}
  shared.visuals.add(visual);return visual
}

export function createClearanceVisual(g,resources) {
  const T=g.THREE,shared=sharedFor(g,resources),instance=shared.character.createInstance({height:1.8}),root=instance.root
  instance.mesh.geometry=shared.repairedGeometry
  const raw=createCharacterAnimation(T,instance,shared.character),presentation=new T.Group(),adapter=root.children[0]
  root.add(presentation);presentation.add(adapter);root.name='campaign-ch3-clearance';presentation.name='clearance-grounding'
  const gun=new T.Group(),gunAsset=shared.assets.get('rifle'),mesh=new T.Mesh(gunAsset.geometry,gunAsset.material),sockets={}
  gun.name='clearance-assault-rifle';mesh.name=rifle.meshName;mesh.scale.setScalar(rifle.scale)
  mesh.castShadow=mesh.receiveShadow=true;gun.add(mesh);presentation.add(gun)
  for(const [name,position]of Object.entries(rifle.sockets)){
    const socket=new T.Object3D();socket.name=`clearance-${name}`;socket.position.fromArray(position);mesh.add(socket);sockets[name]=socket
  }
  const bones=Object.fromEntries(instance.skeleton.bones.map(b=>[b.userData.sourceName?.replace('mixamorig:',''),b]))
  const world=o=>o.getWorldPosition(new T.Vector3()),worldQ=o=>o.getWorldQuaternion(new T.Quaternion())
  const setWorldQ=(bone,q)=>{bone.quaternion.copy(worldQ(bone.parent).invert().multiply(q));bone.updateWorldMatrix(false,true)}
  const palm=side=>world(bones[`${side}Hand`]).add(world(bones[`${side}HandMiddle1`])).multiplyScalar(.5)
  const referenceQ=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI)
  const forwardLocal=new T.Vector3(0,0,1),pitchAxis=new T.Vector3(1,0,0),direction=new T.Vector3(0,0,-1)
  const handFrames={},fingerAxes={},fireSupport=new Map()
  let role='Idle',disposed=false,pitch=0,requestedPitch=0,reachError=0,gripAdjustment=0,groundOffset=0,basePose=null,target=null
  let skinSamples=0,fullGroundScans=0,deathTime=null,deathGround=0,deathGunPosition=null,deathGunQ=null
  const clipFor=name=>CLEARANCE_CLIPS[name]??null
  raw.playClip(CLEARANCE_CLIPS.Aim,{loop:true,fade:0})
  for(const name of ['Hips','Spine','Spine1','Spine2','LeftShoulder','RightShoulder'])fireSupport.set(bones[name],bones[name].quaternion.clone())
  const referenceSpinePosition=root.worldToLocal(world(bones.Spine2)),referenceSpineQ=worldQ(root).invert().multiply(worldQ(bones.Spine2))
  for(const side of ['Right','Left']){
    const hand=bones[`${side}Hand`]
    handFrames[side]={rotation:referenceQ.clone().invert().multiply(worldQ(hand)),palmOffset:hand.worldToLocal(palm(side))}
    const along=world(bones[`${side}HandMiddle1`]).sub(world(hand)).normalize()
    const across=world(bones[`${side}HandIndex1`]).sub(world(bones[`${side}HandPinky1`])).normalize()
    const inward=across.cross(along).normalize().multiplyScalar(side==='Left'?-1:1)
    for(const finger of ['Index','Middle','Ring','Pinky','Thumb'])for(let n=1;n<=3;n++){
      const bone=bones[`${side}Hand${finger}${n}`],next=bones[`${side}Hand${finger}${n+1}`]
      fingerAxes[bone.name]=world(next).sub(world(bone)).normalize().cross(inward).normalize().applyQuaternion(worldQ(bone).invert())
    }
  }
  const restoreBones=()=>{
    if(basePose)for(const [bone,q]of basePose)bone.quaternion.copy(q)
    presentation.position.y=0;root.updateMatrixWorld(true)
  }
  function solveArm(side,contact,q) {
    const upper=bones[`${side}Arm`],lower=bones[`${side}ForeArm`],hand=bones[`${side}Hand`]
    const handQ=q.clone().multiply(handFrames[side].rotation)
    const wrist=contact.clone().sub(handFrames[side].palmOffset.clone().multiply(hand.getWorldScale(new T.Vector3())).applyQuaternion(handQ))
    const shoulder=world(upper),elbow=world(lower),oldWrist=world(hand)
    const a=shoulder.distanceTo(elbow),b=elbow.distanceTo(oldWrist),delta=wrist.clone().sub(shoulder),distance=delta.length()
    const d=Math.max(Math.abs(a-b)+1e-5,Math.min(a+b-1e-5,distance)),axis=delta.normalize()
    reachError=Math.max(reachError,Math.abs(distance-d))
    const pole=elbow.clone().sub(shoulder);pole.addScaledVector(axis,-pole.dot(axis))
    if(pole.lengthSq()<1e-8)pole.set(side==='Right'?1:-1,-1,0).applyQuaternion(worldQ(root)).projectOnPlane(axis)
    pole.normalize()
    const x=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-x*x))
    const desiredElbow=shoulder.clone().addScaledVector(axis,x).addScaledVector(pole,height)
    const turn=new T.Quaternion().setFromUnitVectors(elbow.sub(shoulder).normalize(),desiredElbow.sub(shoulder).normalize())
    setWorldQ(upper,turn.multiply(worldQ(upper)))
    const actualElbow=world(lower),toWrist=shoulder.clone().addScaledVector(axis,d).sub(actualElbow).normalize()
    const bend=new T.Quaternion().setFromUnitVectors(world(hand).sub(actualElbow).normalize(),toWrist)
    setWorldQ(lower,bend.multiply(worldQ(lower)));setWorldQ(hand,handQ)
  }
  function fitGrip(desired,q){
    // Both wrist targets translate rigidly with the real rifle. Intersect the
    // two arm-reach spheres to choose the closest feasible grip analytically.
    const spheres=['Right','Left'].map(side=>{
      const upper=bones[`${side}Arm`],lower=bones[`${side}ForeArm`],hand=bones[`${side}Hand`]
      const shoulder=world(upper),elbow=world(lower),handQ=q.clone().multiply(handFrames[side].rotation)
      const offset=new T.Vector3().fromArray(rifle.sockets[side==='Right'?'grip':'foreEnd']).sub(new T.Vector3().fromArray(rifle.sockets.grip))
        .multiplyScalar(rifle.scale).applyQuaternion(q)
        .sub(handFrames[side].palmOffset.clone().multiply(hand.getWorldScale(new T.Vector3())).applyQuaternion(handQ))
      return {center:shoulder.clone().sub(offset),radius:shoulder.distanceTo(elbow)+elbow.distanceTo(world(hand))-.002}
    })
    let result=desired.clone()
    const inside=(p,s)=>p.distanceToSquared(s.center)<=s.radius*s.radius
    if(!spheres.every(s=>inside(result,s))){
      const outside=spheres.find(s=>!inside(result,s))
      result.sub(outside.center).setLength(outside.radius).add(outside.center)
      if(!spheres.every(s=>inside(result,s))){
        const [a,b]=spheres,axis=b.center.clone().sub(a.center),distance=axis.length();axis.divideScalar(distance)
        const x=(a.radius*a.radius-b.radius*b.radius+distance*distance)/(2*distance)
        const center=a.center.clone().addScaledVector(axis,x),radius=Math.sqrt(Math.max(0,a.radius*a.radius-x*x))
        const radial=desired.clone().sub(center).projectOnPlane(axis)
        if(radial.lengthSq()<1e-10)radial.set(0,-1,0).projectOnPlane(axis)
        result=radial.setLength(radius).add(center)
      }
    }
    gripAdjustment=desired.distanceTo(result);return result
  }
  function closeFingers(){
    for(const side of ['Right','Left'])for(const finger of ['Index','Middle','Ring','Pinky','Thumb'])for(let n=1;n<=3;n++){
      const bone=bones[`${side}Hand${finger}${n}`],angle=(finger==='Thumb'?[.35,.6,.5]:[.65,1.05,.8])[n-1]
      bone.quaternion.multiply(new T.Quaternion().setFromAxisAngle(fingerAxes[bone.name],angle))
    }
    root.updateMatrixWorld(true)
  }
  function placeGun(grip,q){
    gun.quaternion.copy(worldQ(presentation).invert().multiply(q));gun.position.copy(presentation.worldToLocal(grip.clone()))
    gun.position.sub(new T.Vector3().fromArray(rifle.sockets.grip).multiplyScalar(rifle.scale).applyQuaternion(gun.quaternion))
    root.updateMatrixWorld(true)
  }
  const updateSkin=()=>{root.updateMatrixWorld(true);instance.skeleton.update()}
  function ground(){
    const time=raw.snapshot().time
    if(role==='Death'&&deathTime===time){
      groundOffset=deathGround;presentation.position.y=groundOffset
      gun.position.copy(deathGunPosition);gun.quaternion.copy(deathGunQ);updateSkin();return
    }
    const vertex=new T.Vector3(),inverse=root.matrixWorld.clone().invert()
    let minimum=Infinity
    const indices=role==='Death'?shared.deathVertices:shared.footVertices
    if(role==='Death')fullGroundScans++
    for(const index of indices){instance.mesh.getVertexPosition(index,vertex);vertex.applyMatrix4(instance.mesh.matrixWorld).applyMatrix4(inverse);minimum=Math.min(minimum,vertex.y)}
    skinSamples+=indices.length;groundOffset=-minimum;presentation.position.y=groundOffset;updateSkin()
    if(role!=='Death')return
    const alpha=Math.min(1,time/.8),restQ=worldQ(root).multiply(referenceQ).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI/2))
    gun.quaternion.slerp(worldQ(presentation).invert().multiply(restQ),alpha)
    gun.position.lerp(new T.Vector3(.3,gun.position.y,.35),alpha);root.updateMatrixWorld(true)
    let gunMin=Infinity
    for(let i=0;i<gunAsset.geometry.attributes.position.count;i++){
      vertex.fromBufferAttribute(gunAsset.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);gunMin=Math.min(gunMin,vertex.y)
    }
    gun.position.y-=gunMin;updateSkin()
    deathTime=time;deathGround=groundOffset;deathGunPosition=gun.position.clone();deathGunQ=gun.quaternion.clone()
  }
  function applyPose(){
    basePose=instance.skeleton.bones.map(bone=>[bone,bone.quaternion.clone()]);reachError=gripAdjustment=0
    if(role==='Death'){
      closeFingers();placeGun(palm('Right'),worldQ(bones.RightHand).multiply(handFrames.Right.rotation.clone().invert()))
    }else{
      if(role==='Fire')for(const [bone,q]of fireSupport)bone.quaternion.slerp(q,.8)
      root.updateMatrixWorld(true)
      const aimed=role==='Aim'||role==='Fire',bodyPitch=aimed?pitch:0
      for(const name of ['Spine','Spine1','Spine2']){
        const bone=bones[name],axis=pitchAxis.clone().applyQuaternion(worldQ(root)).applyQuaternion(worldQ(bone).invert())
        bone.quaternion.multiply(new T.Quaternion().setFromAxisAngle(axis,bodyPitch/3));bone.updateWorldMatrix(false,true)
      }
      const heldDirection=aimed?direction.clone():new T.Vector3(0,-.32,-1).normalize().applyQuaternion(worldQ(root))
      const q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(new T.Vector3(),heldDirection.negate(),new T.Vector3(0,1,0)))
      const base=new T.Vector3(.055,aimed?1.27:1.12,-.29),pivot=new T.Vector3(0,1.19,-.03)
      let grip
      if(aimed)grip=root.localToWorld(base.sub(pivot).applyAxisAngle(pitchAxis,bodyPitch).add(pivot))
      else{
        // Patrol/Hit move the original torso: carry the ready rifle with that
        // frame instead of stretching the support arm toward a fixed world grip.
        const torso=worldQ(bones.Spine2).multiply(referenceSpineQ.clone().invert())
        grip=base.sub(referenceSpinePosition).applyQuaternion(torso).add(world(bones.Spine2))
        q.premultiply(torso.multiply(worldQ(root).invert()))
      }
      placeGun(fitGrip(grip,q),q);solveArm('Right',world(sockets.grip),q);solveArm('Left',world(sockets.foreEnd),q);closeFingers()
    }
    updateSkin();ground()
  }
  function setState(next){
    requireValue(clipFor(next)!==null,`unknown role ${next}`)
    if(disposed||role==='Death'||role===next)return false
    if(role==='Hit'&&!raw.finished()&&!['Hit','Death'].includes(next))return false
    restoreBones();role=next
    if(!['Aim','Fire'].includes(role))target=null
    raw.playClip(clipFor(next),{loop:loopRole(next),fade:.1,restart:false});applyPose();return true
  }
  function aimAt(point){
    if(disposed||!['Aim','Fire'].includes(role))return false
    requireValue(point&&['x','y','z'].every(k=>Number.isFinite(point[k])),'invalid aim point')
    target=new T.Vector3(point.x,point.y,point.z)
    for(let n=0;n<6;n++){
      const delta=target.clone().sub(world(sockets.muzzle));if(delta.lengthSq()<1e-8)return false
      delta.normalize()
      if(delta.angleTo(forwardLocal.clone().transformDirection(mesh.matrixWorld))<1e-8)break
      direction.copy(delta);requestedPitch=Math.asin(direction.y);pitch=Math.max(-.65,Math.min(.65,requestedPitch))
      root.rotation.y=Math.atan2(-direction.x,-direction.z);restoreBones();applyPose()
    }
    return true
  }
  function update(dt){
    if(disposed)return
    requireValue(Number.isFinite(dt)&&dt>=0,'dt must be nonnegative')
    restoreBones()
    if(dt>0&&!(role==='Death'&&raw.finished()))raw.update(dt)
    if(['Fire','Hit'].includes(role)&&raw.finished()){
      role=target?'Aim':'Idle';raw.playClip(clipFor(role),{loop:true,fade:.15,restart:false})
    }
    if(!target&&role==='Aim')direction.set(0,Math.sin(pitch),-Math.cos(pitch)).applyQuaternion(worldQ(root))
    applyPose();if(target)aimAt(target)
  }
  function reset(){
    if(disposed)return
    restoreBones();raw.stop();role='Idle';target=null;pitch=requestedPitch=0;deathTime=null
    raw.playClip(CLEARANCE_CLIPS.Idle,{loop:true,fade:0});direction.set(0,0,-1).applyQuaternion(worldQ(root));applyPose()
  }
  const animation={...raw,update,
    playClip(index,options={}){
      const next=Object.keys(CLEARANCE_CLIPS).find(key=>CLEARANCE_CLIPS[key]===index)
      requireValue(next,'only audited clearance clips supported')
      if(disposed||role==='Death'||next===role&&options.restart===false)return raw.snapshot()
      restoreBones();role=next;if(!['Aim','Fire'].includes(role))target=null
      raw.playClip(index,options);applyPose();return raw.snapshot()
    },
    restore(data){restoreBones();raw.restore(data);role=Object.keys(CLEARANCE_CLIPS).find(key=>CLEARANCE_CLIPS[key]===data.index)??'Idle'
      target=null;deathTime=null;applyPose()},
  }
  const visual={root,instance,animation,muzzle:sockets.muzzle,getMuzzle:()=>world(sockets.muzzle),getEye:()=>world(bones.Head),
    getForward:()=>forwardLocal.clone().transformDirection(mesh.matrixWorld),aimAt,setState,clipFor,update,reset,
    snapshot:()=>({role,disposed,clip:raw.snapshot(),height:1.8,position:root.position.toArray(),yaw:root.rotation.y,
      aim:{pitch,requestedPitch,limited:Math.abs(pitch-requestedPitch)>1e-6,reachError,gripAdjustment},muzzle:world(sockets.muzzle).toArray(),forward:visual.getForward().toArray(),
      gripError:palm('Right').distanceTo(world(sockets.grip)),foreEndError:palm('Left').distanceTo(world(sockets.foreEnd)),
      grounding:groundOffset,groundingCost:{footSamples:shared.footVertices.length,skinSamples,fullGroundScans},removedTriangle:18494,
      resourceOwnership:'borrow shared repaired geometry/material/textures; own skeleton/mixer/sockets'}),
    dispose(){if(!disposed)instance.dispose()},
  }
  instance.onDispose(()=>{disposed=true;raw.dispose();gun.removeFromParent();shared.visuals.delete(visual);shared.release()})
  shared.visuals.add(visual);reset();return visual
}
