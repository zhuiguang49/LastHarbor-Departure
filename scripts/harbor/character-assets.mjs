// Dedicated importer for the two hash-bound, uncompressed Tripo character packages.
// T must be the original g.THREE. No renderer, loop or scene ownership here.
export const INFECTED_SOURCE = Object.freeze({
  url:'/assets/harbor/infected/丧尸.glb',
  sha256:'8b5319bdb04e67ecd90045e81870dcaab1148aee3603083c792a6a00d8084e33',
  bytes:4385116, joints:65, clips:11, vertices:20431, triangles:33870,
  sourceForwardCandidate:'-X', gameForward:'-Z', calibrationStatus:'structural-candidate-not-visually-accepted',
})

export const SOLDIER_SOURCE = Object.freeze({
  url:'/assets/harbor/soldier/soldier.glb',
  sha256:'640c32f8d454618eb00f310e0b0901918452317fd1bc43fa3630ebc385f344ff',
  bytes:4132084, joints:66, clips:9, vertices:21079, triangles:34309,
  sourceForwardCandidate:'-X', gameForward:'-Z', calibrationStatus:'structural-candidate-not-visually-accepted',
})
// No caller-supplied URL, hash or schema: both complete packages were audited.
function profileFor(kind) {
  if(kind==='infected')return {source:INFECTED_SOURCE,nodes:67,prefix:'infected'}
  if(kind==='soldier')return {source:SOLDIER_SOURCE,nodes:68,prefix:'soldier'}
  throw Error(`Character asset: unsupported kind ${kind}`)
}

const fail = message => { throw Error(`Infected asset: ${message}`) }
const requireValue = (condition, message) => { if (!condition) fail(message) }
const widths = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4, MAT4:16 }
const components = { 5121:Uint8Array, 5123:Uint16Array, 5126:Float32Array }

// Test seam: parsing and SHA verification have no Three/browser dependency.
export const parseInfectedGLB = input => parseCharacterGLB(input,'infected')
export async function parseCharacterGLB(input, kind) {
  const profile=profileFor(kind),spec=profile.source
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) :
    ArrayBuffer.isView(input) ? new Uint8Array(input.buffer,input.byteOffset,input.byteLength) : null
  requireValue(bytes, 'expected GLB bytes')
  const digest = await globalThis.crypto.subtle.digest('SHA-256',bytes)
  const sha256 = Array.from(new Uint8Array(digest), n=>n.toString(16).padStart(2,'0')).join('')
  requireValue(sha256===spec.sha256, `SHA-256 mismatch: ${sha256}`)
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
  requireValue(view.getUint32(0,true)===0x46546c67 && view.getUint32(4,true)===2 &&
    view.getUint32(8,true)===bytes.length, 'invalid GLB 2 header')
  const jsonSize = view.getUint32(12,true), binHeader = 20+jsonSize
  requireValue(view.getUint32(16,true)===0x4e4f534a && jsonSize%4===0 &&
    binHeader+8<=bytes.length && view.getUint32(binHeader+4,true)===0x004e4942, 'expected JSON + BIN chunks')
  const binSize = view.getUint32(binHeader,true)
  requireValue(binHeader+8+binSize===bytes.length, 'unexpected trailing chunks')
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20,binHeader)))
  requireValue(json.asset.version==='2.0' && !json.extensionsUsed?.length && !json.extensionsRequired?.length,
    'only the audited glTF 2.0 without extensions is supported')
  requireValue(json.buffers.length===1 && !json.buffers[0].uri && json.buffers[0].byteLength<=binSize,
    'expected one embedded buffer')
  const binary = bytes.slice(binHeader+8,binHeader+8+json.buffers[0].byteLength)
  for (const v of json.bufferViews) requireValue(v.buffer===0 && !v.extensions &&
    Number.isInteger(v.byteLength) && v.byteLength>0 && (v.byteOffset||0)>=0 &&
    (v.byteOffset||0)+v.byteLength<=binary.length, 'invalid/unsupported bufferView')
  const accessors = json.accessors.map(a=>{
    const ArrayType=components[a.componentType], width=widths[a.type], v=json.bufferViews[a.bufferView]
    requireValue(ArrayType && width && v && !a.sparse && !a.normalized && !a.extensions &&
      Number.isInteger(a.count) && a.count>0, 'unsupported accessor format')
    const size=ArrayType.BYTES_PER_ELEMENT, stride=v.byteStride||width*size, offset=a.byteOffset||0
    requireValue(offset>=0 && offset%size===0 && stride>=width*size && stride%size===0 &&
      offset+(a.count-1)*stride+width*size<=v.byteLength, 'invalid accessor range/stride')
    const data=new ArrayType(a.count*width), source=new DataView(binary.buffer)
    const read=a.componentType===5126?'getFloat32':a.componentType===5123?'getUint16':'getUint8'
    for(let i=0;i<a.count;i++) for(let k=0;k<width;k++) {
      const value=source[read]((v.byteOffset||0)+offset+i*stride+k*size,true)
      requireValue(Number.isFinite(value), 'nonfinite accessor value');data[i*width+k]=value
    }
    return { data, width, type:a.type, componentType:a.componentType, count:a.count }
  })
  requireValue(json.nodes.length===profile.nodes && json.meshes.length===1 && json.meshes[0].primitives.length===1 &&
    json.skins.length===1 && json.skins[0].joints.length===spec.joints && json.animations.length===spec.clips,
    `expected the complete ${profile.nodes}-node / ${spec.joints}-joint / ${spec.clips}-clip package`)
  const primitive=json.meshes[0].primitives[0]
  requireValue((primitive.mode??4)===4 && !primitive.targets && !primitive.extensions &&
    Object.keys(primitive.attributes).sort().join(',')==='JOINTS_0,NORMAL,POSITION,TEXCOORD_0,WEIGHTS_0',
    'unsupported mesh primitive')
  const formats={POSITION:[5126,'VEC3'],NORMAL:[5126,'VEC3'],TEXCOORD_0:[5126,'VEC2'],
    JOINTS_0:[5121,'VEC4'],WEIGHTS_0:[5126,'VEC4']}
  for(const [name,[type,shape]] of Object.entries(formats)) {
    const a=accessors[primitive.attributes[name]]
    requireValue(a?.componentType===type && a.type===shape && a.count===spec.vertices, `invalid ${name}`)
  }
  const index=accessors[primitive.indices], ibm=accessors[json.skins[0].inverseBindMatrices]
  requireValue(index?.componentType===5123 && index.type==='SCALAR' && index.count===spec.triangles*3 &&
    index.data.every(n=>n<spec.vertices) && ibm?.type==='MAT4' && ibm.componentType===5126 && ibm.count===spec.joints,
    'invalid triangle indices/inverse binds')
  requireValue(accessors[primitive.attributes.JOINTS_0].data.every(n=>n<spec.joints), 'joint index out of range')
  const parents=new Array(json.nodes.length).fill(-1)
  json.nodes.forEach((n,i)=>{
    requireValue(!n.matrix && !n.extensions && !n.weights && !n.camera, 'only source TRS nodes supported')
    for(const [key,size] of [['translation',3],['rotation',4],['scale',3]])
      requireValue(!n[key] || (n[key].length===size && n[key].every(Number.isFinite)), `invalid node ${key}`)
    for(const child of n.children||[]) {
      requireValue(Number.isInteger(child) && child>=0 && child<parents.length && parents[child]===-1,
        'invalid/multiple node parent');parents[child]=i
    }
  })
  for(let i=0;i<parents.length;i++) {
    const seen=new Set();let p=i
    while(p!==-1){requireValue(!seen.has(p),'cyclic nodes');seen.add(p);p=parents[p]}
  }
  const hipsIndex=json.nodes.findIndex(n=>n.name==='mixamorig:Hips')
  requireValue(hipsIndex>=0 && json.scenes.length===1 && json.scene===0, 'missing source scene/hips')
  for(const animation of json.animations) {
    const targets=new Set()
    requireValue(animation.channels.length===195 && animation.samplers.length===195, 'incomplete clip')
    for(const channel of animation.channels) {
      const s=animation.samplers[channel.sampler], target=channel.target, times=accessors[s?.input], values=accessors[s?.output]
      requireValue(['translation','rotation','scale'].includes(target.path) && json.skins[0].joints.includes(target.node) &&
        !targets.has(`${target.node}:${target.path}`), 'unsupported/duplicate animation target')
      targets.add(`${target.node}:${target.path}`)
      requireValue(['LINEAR','STEP'].includes(s.interpolation||'LINEAR') && times?.type==='SCALAR' &&
        times.componentType===5126 && values?.componentType===5126 && values.count===times.count &&
        values.width===(target.path==='rotation'?4:3), 'unsupported animation sampler')
      requireValue(times.data[0]===0 && times.data.every((t,i)=>i===0||t>times.data[i-1]), 'invalid clip times')
    }
  }
  // Ancestors of hips must be static for the exact parent-space conversion.
  const ancestors=new Set();for(let p=parents[hipsIndex];p!==-1;p=parents[p]) ancestors.add(p)
  requireValue(json.animations.every(a=>a.channels.every(c=>!ancestors.has(c.target.node))), 'animated hips ancestor unsupported')
  requireValue(json.images.length===3 && json.textures.length===3 && json.materials.length===1 &&
    json.images.every(i=>i.mimeType==='image/jpeg' && !i.uri && json.bufferViews[i.bufferView]) &&
    json.textures.every(t=>t.sampler===0 && json.images[t.source]) && json.samplers.length===1 &&
    json.samplers[0].magFilter===9729 && json.samplers[0].minFilter===9987 &&
    (json.samplers[0].wrapS??10497)===10497 && (json.samplers[0].wrapT??10497)===10497,
    'only the audited three embedded JPEGs and sampler supported')
  const material=json.materials[0],pbr=material.pbrMetallicRoughness
  requireValue(material.normalTexture.index===0 && pbr.baseColorTexture.index===1 && pbr.metallicRoughnessTexture.index===2 &&
    !material.extensions && (material.alphaMode||'OPAQUE')==='OPAQUE', 'unsupported PBR material')
  return { json, binary, accessors, parents, hipsIndex, sha256 }
}

async function decodeJPEG(bytes) {
  requireValue(typeof globalThis.createImageBitmap==='function', 'createImageBitmap is required for embedded JPEG decoding')
  // ImageBitmap ignores Texture.flipY/premultiply flags at upload time.
  return globalThis.createImageBitmap(new Blob([bytes],{type:'image/jpeg'}),
    { imageOrientation:'none', premultiplyAlpha:'none', colorSpaceConversion:'none' })
}

export const loadInfectedAsset = (T, options={}) => loadCharacterAsset(T,{...options,kind:'infected'})
export async function loadCharacterAsset(T, options={}) {
  const profile=profileFor(options.kind),spec=profile.source
  requireValue(!['url','profile','sha256','schema'].some(key=>Object.hasOwn(options,key)), 'caller-supplied asset profiles/URLs are forbidden')
  requireValue(T?.REVISION==='180', 'requires original g.THREE r180')
  let bytes=options.bytes
  if(!bytes) {
    const response=await fetch(spec.url)
    requireValue(response.ok, `local GLB HTTP ${response.status}`);bytes=await response.arrayBuffer()
  }
  const parsed=await parseCharacterGLB(bytes,options.kind),{json,binary,accessors,hipsIndex}=parsed
  const textures=[],images=[];let geometry,material
  const release=()=>{
    geometry?.dispose();material?.dispose()
    for(const texture of textures) texture.dispose()
    for(const image of images) image.close?.()
  }
  try {
    for(const source of json.images) {
      const v=json.bufferViews[source.bufferView]
      const image=await (options.decodeImage||decodeJPEG)(binary.slice(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),source)
      images.push(image)
      requireValue(image?.width===2048 && image?.height===2048, 'JPEG must fully decode to 2048×2048')
    }
    for(const source of json.textures) {
      const texture=new T.Texture(images[source.source]);textures.push(texture)
      texture.name=json.images[source.source].name;texture.flipY=false
      texture.colorSpace=source.source===1?T.SRGBColorSpace:T.NoColorSpace
      texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter
      texture.wrapS=T.RepeatWrapping;texture.wrapT=T.RepeatWrapping
      texture.generateMipmaps=true;texture.needsUpdate=true
    }
    const primitive=json.meshes[0].primitives[0]
    geometry=new T.BufferGeometry()
    for(const [semantic,name] of Object.entries({POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',JOINTS_0:'skinIndex',WEIGHTS_0:'skinWeight'})) {
      const a=accessors[primitive.attributes[semantic]]
      geometry.setAttribute(name,new T.BufferAttribute(a.data.slice(),a.width))
    }
    geometry.setIndex(new T.BufferAttribute(accessors[primitive.indices].data.slice(),1))
    geometry.computeBoundingBox();geometry.computeBoundingSphere()
    const m=json.materials[0],p=m.pbrMetallicRoughness,f=p.baseColorFactor||[1,1,1,1]
    material=new T.MeshStandardMaterial({name:m.name,map:textures[1],normalMap:textures[0],
      roughnessMap:textures[2],metalnessMap:textures[2],metalness:p.metallicFactor??1,roughness:p.roughnessFactor??1,
      color:new T.Color().setRGB(f[0],f[1],f[2],T.LinearSRGBColorSpace),opacity:f[3],
      side:m.doubleSided?T.DoubleSide:T.FrontSide,normalScale:new T.Vector2(m.normalTexture.scale??1,m.normalTexture.scale??1)})
  } catch(error) { release();throw error }

  const nodeName=i=>`${profile.prefix}_node_${i}`, path={translation:'position',rotation:'quaternion',scale:'scale'}
  const clips=json.animations.map(a=>new T.AnimationClip(a.name,-1,a.channels.map(c=>{
    const s=a.samplers[c.sampler],input=accessors[s.input],output=accessors[s.output]
    const Track=c.target.path==='rotation'?T.QuaternionKeyframeTrack:T.VectorKeyframeTrack
    return new Track(`${nodeName(c.target.node)}.${path[c.target.path]}`,input.data.slice(),output.data.slice(),
      s.interpolation==='STEP'?T.InterpolateDiscrete:T.InterpolateLinear)
  })))
  // Source tree matrices are also used by animation, before world calibration.
  const sourceMatrices=json.nodes.map(n=>new T.Matrix4().compose(new T.Vector3().fromArray(n.translation||[0,0,0]),
    new T.Quaternion().fromArray(n.rotation||[0,0,0,1]),new T.Vector3().fromArray(n.scale||[1,1,1])))
  const worldMatrix=i=>parsed.parents[i]===-1?sourceMatrices[i].clone():worldMatrix(parsed.parents[i]).multiply(sourceMatrices[i])
  const hipsParentMatrix=parsed.parents[hipsIndex]===-1?new T.Matrix4():worldMatrix(parsed.parents[hipsIndex])
  const hipsAnchor=new T.Vector3().fromArray(json.nodes[hipsIndex].translation).applyMatrix4(hipsParentMatrix)
  const meshIndex=json.nodes.findIndex(n=>n.mesh===0 && n.skin===0)
  const sourceBounds=geometry.boundingBox.clone().applyMatrix4(worldMatrix(meshIndex))
  const sourceHeight=sourceBounds.max.y-sourceBounds.min.y
  const clipMetadata=clips.map((clip,index)=>{
    const track=clip.tracks.find(t=>t.name===`${nodeName(hipsIndex)}.position`),points=[]
    for(let i=0;i<track.values.length;i+=3) points.push(new T.Vector3().fromArray(track.values,i).applyMatrix4(hipsParentMatrix))
    const first=points[0],last=points.at(-1),delta=last.clone().sub(first),min=new T.Vector3(Infinity,Infinity,Infinity),max=min.clone().negate()
    let horizontalPath=0
    points.forEach((p,i)=>{min.min(p);max.max(p);if(i)horizontalPath+=Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z)})
    return Object.freeze({index,name:clip.name,duration:clip.duration,tracks:clip.tracks.length,semanticStatus:'unconfirmed',
      sourceHips:{first:first.toArray(),last:last.toArray(),delta:delta.toArray(),min:min.toArray(),max:max.toArray(),
        horizontalNet:Math.hypot(delta.x,delta.z),horizontalPath,verticalRange:max.y-min.y}})
  })
  const calibration=Object.freeze({status:spec.calibrationStatus,sourceUp:'+Y',sourceForwardCandidate:'-X',
    gameForward:'-Z',yawRadians:-Math.PI/2,sourceHeight,sourceBounds:{min:sourceBounds.min.toArray(),max:sourceBounds.max.toArray()},
    sourceHipsAnchor:hipsAnchor.toArray(),sourceModelOffset:[-hipsAnchor.x,-sourceBounds.min.y,-hipsAnchor.z]})
  let closing=false,released=false
  const instances=new Set()
  function releaseIfUnused() { if(closing && instances.size===0 && !released){released=true;release()} }
  const owner={clips,clipMetadata,calibration,
    // This immutable-by-contract metadata is the exact static parent transform,
    // not local X/Z guessing. Source clips remain unchanged by playback.
    animationSource:{hipsTrack:`${nodeName(hipsIndex)}.position`,hipsParentMatrix:hipsParentMatrix.toArray(),hipsAnchor:hipsAnchor.toArray()},
    createInstance({height=1.8}={}) {
      requireValue(!closing, 'owner disposed; cannot create instances')
      requireValue(Number.isFinite(height) && height>0, 'height must be positive')
      const root=new T.Group(),adapter=new T.Group(),model=new T.Group()
      root.name=`${profile.prefix}-physical-root`;adapter.name=`${profile.prefix}-calibration`;model.name=`${profile.prefix}-source-scene`
      root.add(adapter);adapter.add(model);adapter.scale.setScalar(height/sourceHeight);adapter.rotation.y=calibration.yawRadians
      model.position.fromArray(calibration.sourceModelOffset)
      const joints=new Set(json.skins[0].joints)
      const nodes=json.nodes.map((n,i)=>{
        const object=i===meshIndex?new T.SkinnedMesh(geometry,material):joints.has(i)?new T.Bone():new T.Group()
        object.name=nodeName(i);object.userData={sourceNode:i,sourceName:n.name}
        object.position.fromArray(n.translation||[0,0,0]);object.quaternion.fromArray(n.rotation||[0,0,0,1]);object.scale.fromArray(n.scale||[1,1,1])
        return object
      })
      json.nodes.forEach((n,i)=>{for(const child of n.children||[])nodes[i].add(nodes[child])})
      for(const i of json.scenes[json.scene].nodes)model.add(nodes[i])
      model.updateMatrixWorld(true)
      const skin=json.skins[0],ibm=accessors[skin.inverseBindMatrices].data
      const skeleton=new T.Skeleton(skin.joints.map(i=>nodes[i]),skin.joints.map((_,i)=>new T.Matrix4().fromArray(ibm,i*16)))
      const mesh=nodes[meshIndex]
      // Bind in SOURCE space, before the adapter's scale/yaw/offset. Binding
      // against the calibrated world matrix would cancel/duplicate calibration.
      mesh.bind(skeleton,worldMatrix(meshIndex));mesh.castShadow=true;mesh.receiveShadow=true
      mesh.frustumCulled=false // animated envelope is not the static bind box
      root.userData.calibration={...calibration,height,uniformScale:height/sourceHeight}
      let disposed=false;const disposeListeners=new Set()
      const instance={root,model,mesh,skeleton,
        get disposed(){return disposed},
        // Animation registers cleanup so instance disposal cannot strand a mixer.
        onDispose(callback){requireValue(!disposed,'instance disposed');disposeListeners.add(callback);return()=>disposeListeners.delete(callback)},
        dispose(){
          if(disposed)return;disposed=true
          for(const callback of disposeListeners)callback()
          disposeListeners.clear();root.removeFromParent();skeleton.dispose();instances.delete(instance);releaseIfUnused()
        },
      }
      root.updateMatrixWorld(true);skeleton.update();instances.add(instance);return instance
    },
    ownsInstance:instance=>instances.has(instance),
    dispose(){closing=true;releaseIfUnused()},
    snapshot:()=>({source:{...spec,verifiedSHA256:parsed.sha256},clips:clipMetadata,calibration,
      liveInstances:instances.size,closing,released,releasePolicy:'defer shared release until last instance disposal'}),
  }
  return owner
}
