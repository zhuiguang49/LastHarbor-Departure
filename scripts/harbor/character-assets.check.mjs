import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { INFECTED_SOURCE, SOLDIER_SOURCE, loadInfectedAsset, loadCharacterAsset, parseInfectedGLB, parseCharacterGLB } from './character-assets.mjs'

const source=await fs.readFile(new URL('../../assets/harbor/infected/丧尸.glb',import.meta.url))
const {T}=await nativeFixture() // imports no CH2 tests; never builds the world or starts a service
const evidence=new URL('../../artifacts/harbor/ch2-completion-2026-11-13/b1a-character/',import.meta.url)
const hash=data=>createHash('sha256').update(data).digest('hex')
const parsed=await parseInfectedGLB(source)
const results=[]
await fs.mkdir(evidence,{recursive:true})
const decodeImage=async bytes=>{
  assert.equal(bytes[0],0xff);assert.equal(bytes[1],0xd8)
  return {width:2048,height:2048,close(){}}
}

test('current hash, complete accessors, mesh attributes and original clips are preserved',async()=>{
  assert.equal(hash(source),INFECTED_SOURCE.sha256);assert.equal(source.length,INFECTED_SOURCE.bytes)
  const changed=Buffer.from(source);changed[changed.length-1]^=1
  await assert.rejects(parseInfectedGLB(changed),/SHA-256 mismatch/)
  await assert.rejects(loadInfectedAsset({REVISION:'179'},{bytes:source}),/original g.THREE r180/)
  const decoded=[]
  const asset=await loadInfectedAsset(T,{bytes:source,decodeImage:async(bytes,image)=>{
    decoded.push({name:image.name,bytes:bytes.length,sha256:hash(bytes)});return decodeImage(bytes)
  }})
  const instance=asset.createInstance(),p=parsed.json.meshes[0].primitives[0]
  for(const [semantic,name] of Object.entries({POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',JOINTS_0:'skinIndex',WEIGHTS_0:'skinWeight'})) {
    const actual=instance.mesh.geometry.attributes[name],expected=parsed.accessors[p.attributes[semantic]]
    assert.equal(actual.itemSize,expected.width);assert.equal(actual.normalized,false)
    assert.deepEqual(Buffer.from(actual.array.buffer),Buffer.from(expected.data.buffer))
    // Independent contiguous bytes comparison against the original BIN.
    const a=parsed.json.accessors[p.attributes[semantic]],v=parsed.json.bufferViews[a.bufferView]
    assert.deepEqual(Buffer.from(actual.array.buffer),Buffer.from(parsed.binary.subarray(v.byteOffset,v.byteOffset+v.byteLength)))
  }
  assert.equal(instance.mesh.geometry.index.count,101610)
  assert.equal(instance.skeleton.bones.length,65);assert.equal(asset.clips.length,11)
  const inverseBinds=parsed.accessors[parsed.json.skins[0].inverseBindMatrices].data
  for(let i=0;i<65;i++)assert.deepEqual(Array.from(instance.skeleton.boneInverses[i].elements),Array.from(inverseBinds.slice(i*16,(i+1)*16)))
  let maxRestSkinError=0
  const vertex=new T.Vector3(),original=new T.Vector3(),positions=instance.mesh.geometry.attributes.position
  for(let i=0;i<positions.count;i++) {
    instance.mesh.getVertexPosition(i,vertex);original.fromBufferAttribute(positions,i)
    maxRestSkinError=Math.max(maxRestSkinError,vertex.distanceTo(original))
  }
  assert.ok(maxRestSkinError<3e-6,'source-space inverse binds must preserve rest mesh despite world calibration')
  for(const [i,clip] of asset.clips.entries()) {
    const raw=parsed.json.animations[i]
    assert.equal(clip.name,raw.name);assert.equal(clip.tracks.length,195)
    for(const [k,track] of clip.tracks.entries()) {
      const sampler=raw.samplers[raw.channels[k].sampler]
      assert.deepEqual(Array.from(track.times),Array.from(parsed.accessors[sampler.input].data))
      assert.deepEqual(Array.from(track.values),Array.from(parsed.accessors[sampler.output].data))
      assert.equal(track.getInterpolation(),sampler.interpolation==='STEP'?T.InterpolateDiscrete:T.InterpolateLinear)
    }
  }
  const m=instance.mesh.material
  assert.equal(m.map.colorSpace,T.SRGBColorSpace)
  assert.equal(m.normalMap.colorSpace,T.NoColorSpace);assert.equal(m.roughnessMap.colorSpace,T.NoColorSpace)
  assert.equal(m.roughnessMap,m.metalnessMap);assert.equal(m.metalness,1);assert.equal(m.roughness,1)
  assert.equal(m.side,T.DoubleSide);assert.equal(m.normalScale.x,1);assert.equal(m.normalScale.y,1)
  for(const texture of [m.map,m.normalMap,m.roughnessMap]) {
    assert.equal(texture.flipY,false);assert.equal(texture.magFilter,T.LinearFilter);assert.equal(texture.minFilter,T.LinearMipmapLinearFilter)
    assert.equal(texture.wrapS,T.RepeatWrapping);assert.equal(texture.wrapT,T.RepeatWrapping)
  }
  assert.equal(instance.root.parent,null);assert.deepEqual(Array.from(instance.root.scale.toArray()),[1,1,1])
  const box=new T.Box3().setFromObject(instance.root,true)
  assert.ok(Math.abs(box.min.y)<1e-5);assert.ok(Math.abs(box.max.y-box.min.y-1.8)<1e-5)
  const direction=new T.Vector3(-1,0,0).applyQuaternion(instance.root.children[0].quaternion)
  assert.ok(direction.distanceTo(new T.Vector3(0,0,-1))<1e-12)
  const snapshot=asset.snapshot()
  assert.equal(snapshot.source.verifiedSHA256,INFECTED_SOURCE.sha256)
  assert.ok(snapshot.clips.every(c=>c.semanticStatus==='unconfirmed'))
  results.push({check:'complete-package',maxRestSkinError,decodedJPEGByteHashes:decoded,decode:'INJECTED dimension fixtures; no browser image decoding acceptance',
    staticBoundsMetres:{min:box.min.toArray(),max:box.max.toArray()},snapshot})
  instance.dispose();asset.dispose()
})

test('independent skeletons share owner resources; closing owner defers release until last instance',async()=>{
  const closed=[]
  const asset=await loadInfectedAsset(T,{bytes:source,decodeImage:async(_,image)=>({width:2048,height:2048,close(){closed.push(image.name)}})})
  const a=asset.createInstance(),b=asset.createInstance({height:2})
  assert.notEqual(a.skeleton,b.skeleton)
  for(let i=0;i<65;i++){
    assert.notEqual(a.skeleton.bones[i],b.skeleton.bones[i]);assert.notEqual(a.skeleton.boneInverses[i],b.skeleton.boneInverses[i])
  }
  assert.equal(a.mesh.geometry,b.mesh.geometry);assert.equal(a.mesh.material,b.mesh.material)
  assert.equal(a.mesh.material.map,b.mesh.material.map)
  const resources=[a.mesh.geometry,a.mesh.material,a.mesh.material.map,a.mesh.material.normalMap,a.mesh.material.roughnessMap]
  const counts=resources.map(()=>0)
  resources.forEach((resource,i)=>resource.addEventListener('dispose',()=>counts[i]++))
  a.skeleton.bones[0].position.x+=3
  assert.notEqual(a.skeleton.bones[0].position.x,b.skeleton.bones[0].position.x)
  a.dispose();a.dispose();assert.deepEqual(counts,[0,0,0,0,0]);assert.equal(asset.snapshot().liveInstances,1)
  asset.dispose();asset.dispose()
  assert.throws(()=>asset.createInstance(),/owner disposed/);assert.equal(asset.snapshot().released,false)
  b.root.updateMatrixWorld(true);b.skeleton.update()
  assert.ok(Array.from(b.skeleton.boneMatrices).every(Number.isFinite))
  b.dispose();b.dispose();asset.dispose()
  assert.deepEqual(counts,[1,1,1,1,1]);assert.equal(closed.length,3);assert.equal(asset.snapshot().released,true)
  results.push({check:'shared-release',resourceDisposals:counts,bitmapClosures:closed.length,policy:asset.snapshot().releasePolicy})
})

test('embedded ImageBitmap options and partial decode failure clean up without a browser',async()=>{
  const original=globalThis.createImageBitmap,calls=[];let closures=0
  try {
    globalThis.createImageBitmap=async(blob,options)=>{
      assert.equal(blob.type,'image/jpeg');calls.push({bytes:blob.size,options})
      return {width:2048,height:2048,close(){closures++}}
    }
    const asset=await loadInfectedAsset(T,{bytes:source});asset.dispose()
    assert.equal(calls.length,3);assert.equal(closures,3)
    assert.deepEqual(calls[0].options,{imageOrientation:'none',premultiplyAlpha:'none',colorSpaceConversion:'none'})
  } finally { if(original)globalThis.createImageBitmap=original;else delete globalThis.createImageBitmap }
  let n=0,closed=0
  await assert.rejects(loadInfectedAsset(T,{bytes:source,decodeImage:async()=>{
    if(n++===1)throw Error('injected decode failure')
    return {width:2048,height:2048,close(){closed++}}
  }}),/injected decode failure/)
  assert.equal(closed,1)
  assert.equal(hash(await fs.readFile(new URL('../../assets/harbor/infected/丧尸.glb',import.meta.url))),INFECTED_SOURCE.sha256)
  results.push({check:'image-decode-contract',browser:false,calls,partialFailureClosures:closed})
  await fs.writeFile(new URL('assets-results.json',evidence),JSON.stringify({sourceSHA:hash(source),three:T.REVISION,
    scope:'Node structural/lifecycle only; injected image decoder, not visual or playback acceptance',results},null,2)+'\n')
})


const soldierBytes=await fs.readFile(new URL('../../assets/harbor/soldier/soldier.glb',import.meta.url))
test('fixed soldier profile preserves every source attribute, inverse bind and all 1755 tracks',async()=>{
  assert.equal(hash(soldierBytes),SOLDIER_SOURCE.sha256);assert.equal(soldierBytes.length,SOLDIER_SOURCE.bytes)
  const parsed=await parseCharacterGLB(soldierBytes,'soldier'),decoded=[]
  const asset=await loadCharacterAsset(T,{kind:'soldier',bytes:soldierBytes,decodeImage:async(bytes,image)=>{
    decoded.push(hash(bytes));return decodeImage(bytes,image)
  }}),instance=asset.createInstance(),primitive=parsed.json.meshes[0].primitives[0]
  for(const [semantic,name] of Object.entries({POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',JOINTS_0:'skinIndex',WEIGHTS_0:'skinWeight'})){
    const a=instance.mesh.geometry.attributes[name],expected=parsed.accessors[primitive.attributes[semantic]]
    assert.equal(a.itemSize,expected.width);assert.equal(a.normalized,false)
    assert.deepEqual(Buffer.from(a.array.buffer),Buffer.from(expected.data.buffer))
    const v=parsed.json.bufferViews[parsed.json.accessors[primitive.attributes[semantic]].bufferView]
    assert.deepEqual(Buffer.from(a.array.buffer),Buffer.from(parsed.binary.subarray(v.byteOffset,v.byteOffset+v.byteLength)))
  }
  assert.deepEqual(Array.from(instance.mesh.geometry.index.array),Array.from(parsed.accessors[primitive.indices].data))
  assert.equal(instance.mesh.geometry.index.count,102927);assert.equal(instance.skeleton.bones.length,66)
  assert.ok(instance.skeleton.bones.some(b=>b.userData.sourceName==='neutral_bone'))
  const inverse=parsed.accessors[parsed.json.skins[0].inverseBindMatrices].data
  for(let n=0;n<66;n++)assert.deepEqual(Array.from(instance.skeleton.boneInverses[n].elements),Array.from(inverse.slice(n*16,n*16+16)))
  for(const [n,clip] of asset.clips.entries()){
    assert.equal(clip.name,parsed.json.animations[n].name);assert.equal(clip.tracks.length,195)
    for(const [k,track] of clip.tracks.entries()){
      const a=parsed.json.animations[n],channel=a.channels[k],sampler=a.samplers[channel.sampler]
      assert.equal(track.name,`soldier_node_${channel.target.node}.${{translation:'position',rotation:'quaternion',scale:'scale'}[channel.target.path]}`)
      assert.deepEqual(Array.from(track.times),Array.from(parsed.accessors[sampler.input].data))
      assert.deepEqual(Array.from(track.values),Array.from(parsed.accessors[sampler.output].data))
    }
  }
  assert.equal(asset.clips.length,9)
  const m=instance.mesh.material
  assert.equal(m.side,T.DoubleSide);assert.equal(m.metalness,1);assert.equal(m.roughness,1)
  assert.equal(m.map.colorSpace,T.SRGBColorSpace);assert.equal(m.normalMap.colorSpace,T.NoColorSpace)
  assert.equal(m.roughnessMap,m.metalnessMap);assert.equal(m.normalScale.x,1)
  assert.deepEqual(decoded,['e3fd20a250d787948a7f68741b2a05718cc1088f73f81ea13898c61c2e14a06a',
    'ce56020ac523d55e69f58199d498aeb039f950dc162ee6b88e384173940344f4',
    'fe4291efd7308caa864f5ba395fb3bc1c1534f6e4cb9773f5c5ce238d74d7bb9'])
  let error=0
  const pos=instance.mesh.geometry.attributes.position,actual=new T.Vector3(),expected=new T.Vector3()
  for(let n=0;n<pos.count;n++){instance.mesh.getVertexPosition(n,actual);expected.fromBufferAttribute(pos,n);error=Math.max(error,actual.distanceTo(expected))}
  assert.ok(error<3e-6)
  const bounds=new T.Box3().setFromObject(instance.root,true)
  assert.ok(Math.abs(bounds.min.y)<1e-5);assert.ok(Math.abs(bounds.max.y-bounds.min.y-1.8)<1e-5)
  assert.equal(asset.snapshot().source.verifiedSHA256,SOLDIER_SOURCE.sha256)
  instance.dispose();asset.dispose()
})

test('only two fixed profiles are permitted; infected wrapper cannot select soldier or an arbitrary URL',async()=>{
  for(const kind of ['unknown','toString',undefined,{source:SOLDIER_SOURCE}])await assert.rejects(parseCharacterGLB(soldierBytes,kind),/unsupported kind/)
  await assert.rejects(parseInfectedGLB(soldierBytes),/SHA-256 mismatch/)
  await assert.rejects(parseCharacterGLB(source,'soldier'),/SHA-256 mismatch/)
  const corrupt=Buffer.from(soldierBytes);corrupt[corrupt.length-1]^=1
  await assert.rejects(parseCharacterGLB(corrupt,'soldier'),/SHA-256 mismatch/)
  await assert.rejects(loadInfectedAsset(T,{kind:'soldier',bytes:soldierBytes}),/SHA-256 mismatch/)
  for(const key of ['url','profile','sha256','schema'])await assert.rejects(loadCharacterAsset(T,{kind:'soldier',bytes:soldierBytes,[key]:'override'}),/forbidden/)
  const infected=await loadInfectedAsset(T,{kind:'soldier',bytes:source,decodeImage})
  assert.equal(infected.snapshot().source.sha256,INFECTED_SOURCE.sha256);infected.dispose()
})

test('soldier and infected coexist without shared disposal; soldier partial decode failure closes images',async()=>{
  let closed=0
  const infected=await loadInfectedAsset(T,{bytes:source,decodeImage}),soldier=await loadCharacterAsset(T,{kind:'soldier',bytes:soldierBytes,
    decodeImage:async()=>({width:2048,height:2048,close(){closed++}})})
  const a=soldier.createInstance(),b=soldier.createInstance(),c=infected.createInstance()
  assert.equal(a.mesh.geometry,b.mesh.geometry);assert.notEqual(a.mesh.geometry,c.mesh.geometry)
  assert.notEqual(a.skeleton.bones[0],b.skeleton.bones[0])
  soldier.dispose();assert.equal(soldier.snapshot().released,false);a.dispose();assert.equal(closed,0)
  b.dispose();assert.equal(closed,3);assert.equal(soldier.snapshot().released,true)
  assert.equal(infected.snapshot().released,false);c.dispose();infected.dispose()
  let n=0,failedClosed=0
  await assert.rejects(loadCharacterAsset(T,{kind:'soldier',bytes:soldierBytes,decodeImage:async()=>{
    if(n++===1)throw Error('soldier decode failure')
    return {width:2048,height:2048,close(){failedClosed++}}
  }}),/soldier decode failure/)
  assert.equal(failedClosed,1)
})
