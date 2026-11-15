import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { INFECTED_SOURCE, loadInfectedAsset } from './character-assets.mjs'
import { createCharacterAnimation } from './character-animation.mjs'

const source=await fs.readFile(new URL('../../assets/harbor/infected/丧尸.glb',import.meta.url))
const {T}=await nativeFixture()
const evidence=new URL('../../artifacts/harbor/ch2-completion-2026-11-13/b1b-full-ai/',import.meta.url)
await fs.mkdir(evidence,{recursive:true})
const load=()=>loadInfectedAsset(T,{bytes:source,decodeImage:async()=>({width:2048,height:2048,close(){}})})
const hips=instance=>instance.model.getObjectByName('infected_node_64')
const sceneHips=instance=>instance.model.worldToLocal(hips(instance).getWorldPosition(new T.Vector3()))
const clipHash=clips=>createHash('sha256').update(JSON.stringify(clips.map(c=>c.toJSON()))).digest('hex')
// Source quaternion norms have audited ~1e-6 errors. angleTo assumes exact
// unit inputs and can report an angle even for bit-identical quaternions.
const quaternionDelta=(a,b)=>Math.max(...['x','y','z','w'].map(key=>Math.abs(a[key]-b[key])))
function bounds(instance) {
  const box=new T.Box3(),point=new T.Vector3(),mesh=instance.mesh
  for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
    mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld)
    assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.z),`nonfinite skinned vertex ${i}`)
    box.expandByPoint(point)
  }
  assert.ok(Array.from(instance.skeleton.boneMatrices).every(Number.isFinite))
  const footY={}
  for(const name of ['mixamorig:LeftFoot','mixamorig:RightFoot']) {
    const bone=instance.skeleton.bones.find(b=>b.userData.sourceName===name)
    footY[name]=bone.getWorldPosition(point).y
  }
  return {min:box.min.toArray(),max:box.max.toArray(),lowestVertexY:box.min.y,footBoneY:footY}
}

test('all 11 clips bind and sample finite skin; parent-space horizontal lock preserves source Y',async()=>{
  const asset=await load(),before=clipHash(asset.clips),instance=asset.createInstance(),raw=asset.createInstance()
  const animation=createCharacterAnimation(T,instance,asset),rawMixer=new T.AnimationMixer(raw.model),reports=[]
  const calibration=instance.root.children[0],initialScale=calibration.scale.toArray()
  try {
    let bindings=0
    for(const clip of asset.clips) for(const track of clip.tracks) {
      const binding=new T.PropertyBinding(instance.model,track.name);binding.bind()
      assert.ok(binding.targetObject,`unbound ${track.name}`);binding.unbind();bindings++
    }
    assert.equal(bindings,2145)
    for(const [index,clip] of asset.clips.entries()) {
      animation.playClip(index,{fade:0})
      rawMixer.stopAllAction()
      const action=rawMixer.clipAction(clip).reset().setLoop(T.LoopOnce,1)
      action.clampWhenFinished=true;action.play();rawMixer.update(0)
      const samples=[],aggregate=new T.Box3(),anchor=asset.animationSource.hipsAnchor
      let previous=0,maxHorizontalError=0,maxYError=0
      for(let i=0;i<=8;i++) {
        const time=clip.duration*i/8,dt=time-previous;previous=time
        animation.update(dt);rawMixer.update(dt);raw.root.updateMatrixWorld(true);raw.skeleton.update()
        const actual=sceneHips(instance),original=sceneHips(raw)
        maxHorizontalError=Math.max(maxHorizontalError,Math.hypot(actual.x-anchor[0],actual.z-anchor[2]))
        maxYError=Math.max(maxYError,Math.abs(actual.y-original.y))
        assert.ok(maxHorizontalError<2e-6);assert.ok(maxYError<2e-6)
        const sample={time,sourceHips:original.toArray(),inPlaceHips:actual.toArray(),boundsMetres:bounds(instance)}
        samples.push(sample)
        aggregate.expandByPoint(new T.Vector3().fromArray(sample.boundsMetres.min))
        aggregate.expandByPoint(new T.Vector3().fromArray(sample.boundsMetres.max))
      }
      animation.update(.001)
      assert.equal(animation.snapshot().finished,true)
      const final=hips(instance).position.clone();animation.update(.5)
      assert.ok(hips(instance).position.distanceTo(final)<1e-12,'one-shot holds terminal pose')
      assert.deepEqual(Array.from(calibration.scale.toArray()),Array.from(initialScale),'no scale drift')
      reports.push({...asset.clipMetadata[index],samples,maxHorizontalError,maxYError,
        sampledDynamicBoundsMetres:{min:aggregate.min.toArray(),max:aggregate.max.toArray()}})
    }
    assert.equal(clipHash(asset.clips),before,'original tracks unchanged')
    await fs.writeFile(new URL('animation-samples.json',evidence),JSON.stringify({sourceSHA:INFECTED_SOURCE.sha256,three:T.REVISION,
      scope:'offline native Three; 9 samples/clip × all 20431 vertices; sampled envelope, not continuous extrema or browser playback',
      imageDecode:'injected fixtures; no visual acceptance',bindingCount:bindings,calibration:asset.calibration,clips:reports},null,2)+'\n')
  } finally {animation.dispose();rawMixer.stopAllAction();rawMixer.uncacheRoot(raw.model);instance.dispose();raw.dispose();asset.dispose()}
})

test('rotated/scaled hips parent conversion preserves scene Y instead of blindly clearing local XZ',async()=>{
  const asset=await load(),instance=asset.createInstance(),armature=instance.model.getObjectByName('infected_node_66')
  armature.position.set(.3,-.2,.4);armature.rotation.set(.2,.4,.7);armature.scale.set(.8,1.1,1.2);armature.updateMatrix()
  const parent=armature.matrix.clone(),anchor=hips(instance).position.clone().applyMatrix4(parent)
  const facade={...asset,animationSource:{...asset.animationSource,hipsParentMatrix:parent.toArray(),hipsAnchor:anchor.toArray()}}
  const animation=createCharacterAnimation(T,instance,facade)
  try {
    animation.playClip(8,{fade:0})
    const track=asset.clips[8].tracks.find(t=>t.name===facade.animationSource.hipsTrack),interpolant=track.createInterpolant()
    let previous=0,localXRange=[]
    for(let i=0;i<=8;i++) {
      const t=asset.clips[8].duration*i/8;animation.update(t-previous);previous=t
      const expected=new T.Vector3().fromArray(interpolant.evaluate(t)).applyMatrix4(parent),actual=sceneHips(instance)
      assert.ok(Math.hypot(actual.x-anchor.x,actual.z-anchor.z)<2e-6)
      assert.ok(Math.abs(actual.y-expected.y)<2e-6)
      localXRange.push(hips(instance).position.x)
    }
    assert.ok(Math.max(...localXRange)-Math.min(...localXRange)>.01,'local X must change to preserve scene vertical motion')
  } finally {animation.dispose();instance.dispose();asset.dispose()}
})

test('independent mixers, rapid blends, no repeated restart when requested, terminal clamp and disposal caches',async()=>{
  const asset=await load(),a=asset.createInstance(),b=asset.createInstance()
  const first=createCharacterAnimation(T,a,asset),second=createCharacterAnimation(T,b,asset),initialScale=a.root.children[0].scale.toArray()
  try {
    first.playClip(0,{loop:true,fade:0});second.playClip(8,{fade:0})
    first.update(.4);second.update(.2)
    const untouched=hips(b).position.clone(),secondTime=second.snapshot().mixerTime
    first.update(.2);assert.ok(hips(b).position.equals(untouched));assert.equal(second.snapshot().mixerTime,secondTime)
    const time=first.snapshot().time;first.playClip(0,{restart:false});assert.equal(first.snapshot().time,time)
    const pose=hips(a).quaternion.clone();first.playClip(1,{fade:.15})
    assert.ok(quaternionDelta(hips(a).quaternion,pose)<1e-12,'blend begins from outgoing pose')
    first.update(.04);const interrupted=hips(a).quaternion.clone();first.playClip(2,{fade:.15})
    assert.ok(quaternionDelta(hips(a).quaternion,interrupted)<1e-12,'interrupted fade does not pop to bind pose')
    first.update(.16);assert.equal(first.snapshot().activeActions,1)
    assert.deepEqual(Array.from(a.root.children[0].scale.toArray()),Array.from(initialScale))
    second.update(10);assert.equal(second.snapshot().finished,true)
    const final=hips(b).quaternion.clone();second.playClip(8,{restart:false});second.update(.2)
    assert.ok(hips(b).quaternion.equals(final))
    first.stop();assert.equal(first.snapshot().activeActions,0);assert.equal(first.snapshot().cachedActions,0)
    first.playClip(4,{fade:0});first.update(.1)
    a.dispose();assert.equal(first.snapshot().disposed,true);assert.equal(first.snapshot().cachedActions,0)
    assert.throws(()=>first.update(.01),/disposed/)
    second.update(.1);asset.dispose();assert.equal(asset.snapshot().released,false)
    b.dispose();assert.equal(second.snapshot().disposed,true);assert.equal(asset.snapshot().released,true)
    assert.equal(second.snapshot().cachedActions,0)
    await fs.writeFile(new URL('animation-lifecycle.json',evidence),JSON.stringify({sourceSHA:INFECTED_SOURCE.sha256,
      checks:['independent mixers/bones','restart:false preserves time and terminal pose','rapid fade preserves pose',
        'uniform calibration scale stable','instance disposal clears mixer actions/cache','owner delayed resource release'],
      first:first.snapshot(),second:second.snapshot(),owner:asset.snapshot()},null,2)+'\n')
  } finally {first.dispose();second.dispose();a.dispose();b.dispose();asset.dispose()}
})

test('capture/restore samples the same real skeleton pose and explicitly holds a restored death terminal frame',async()=>{
  const asset=await load(),a=asset.createInstance(),b=asset.createInstance()
  const left=createCharacterAnimation(T,a,asset),right=createCharacterAnimation(T,b,asset)
  const transforms=i=>i.skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()])
  try{
    left.playClip(1,{loop:true,fade:0});left.update(.62)
    const captured=left.capture();right.restore(captured)
    const l=transforms(a),r=transforms(b)
    for(let i=0;i<l.length;i++)for(let j=0;j<l[i].length;j++)assert.ok(Math.abs(l[i][j]-r[i][j])<1e-6)
    const before=right.capture();assert.throws(()=>right.restore({...before,time:Infinity}),/Invalid/);assert.deepEqual(right.capture(),before)
    left.playClip(8,{loop:false,fade:0});left.update(asset.clips[8].duration+.1)
    right.restore({index:8,time:asset.clips[8].duration,loop:false})
    assert.equal(right.finished(),true)
    const death=transforms(a),restored=transforms(b)
    for(let i=0;i<death.length;i++)for(let j=0;j<death[i].length;j++)assert.ok(Math.abs(death[i][j]-restored[i][j])<1e-6)
    right.update(1);assert.deepEqual(transforms(b),restored)
  }finally{left.dispose();right.dispose();a.dispose();b.dispose();asset.dispose()}
})
