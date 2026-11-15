// Driven only by the caller's native simulation tick. No animation semantics
// are inferred here: callers choose source index and loop/one-shot explicitly.
export function createCharacterAnimation(T, instance, asset) {
  if(T?.REVISION!=='180' || !asset.ownsInstance(instance) || instance.disposed)
    throw Error('Character animation requires a live infected instance and original Three r180')
  const {hipsTrack,hipsParentMatrix,hipsAnchor}=asset.animationSource
  const parent=new T.Matrix4().fromArray(hipsParentMatrix),inverse=parent.clone().invert()
  const anchor=new T.Vector3().fromArray(hipsAnchor),point=new T.Vector3()
  const clips=asset.clips.map(source=>{
    const clip=source.clone(),track=clip.tracks.find(t=>t.name===hipsTrack)
    if(!track)throw Error('Character animation: missing hips track')
    for(let i=0;i<track.values.length;i+=3) {
      point.fromArray(track.values,i).applyMatrix4(parent)
      point.x=anchor.x;point.z=anchor.z // lock source-scene horizontal axes, retain scene Y
      point.applyMatrix4(inverse).toArray(track.values,i)
    }
    return clip
  })
  const mixer=new T.AnimationMixer(instance.model),actions=new Map(),active=new Set()
  let current=null,disposed=false,updates=0
  const assertLive=()=>{if(disposed||instance.disposed)throw Error('Character animation disposed')}
  function stop() {
    mixer.stopAllAction();mixer.uncacheRoot(instance.model)
    actions.clear();active.clear();current=null
  }
  const unsubscribe=instance.onDispose(()=>controller.dispose())
  const controller={
    playClip(index,{loop=false,fade=.15,restart=true}={}) {
      assertLive()
      if(!Number.isInteger(index)||!clips[index])throw Error(`Character animation: invalid clip ${index}`)
      if(!Number.isFinite(fade)||fade<0)throw Error('Character animation: fade must be nonnegative')
      // Repeated state dispatch must opt out of restarts via restart:false.
      if(current?.index===index && !restart) return controller.snapshot()
      let next=actions.get(index)
      if(!next){next=mixer.clipAction(clips[index]);actions.set(index,next)}
      const outgoing=[...active].filter(action=>action!==next)
      // Preserve normalized total weight, including an interrupted fade. Native
      // crossFadeTo fades every source from 1 and can pop on rapid transitions.
      const weights=new Map(outgoing.map(action=>[action,action.getEffectiveWeight()]))
      const initial=active.has(next)?next.getEffectiveWeight():0
      next.reset().setLoop(loop?T.LoopRepeat:T.LoopOnce,loop?Infinity:1)
      next.clampWhenFinished=!loop;next.enabled=true;next.setEffectiveTimeScale(1);next.setEffectiveWeight(initial);next.play()
      active.add(next)
      current={index,action:next,loop,elapsed:0,fade:outgoing.length?fade:0,initial,weights}
      if(current.fade===0) {
        for(const action of outgoing){action.stop();active.delete(action)}
        next.setEffectiveWeight(1)
      }
      mixer.update(0);instance.root.updateMatrixWorld(true);instance.skeleton.update()
      return controller.snapshot()
    },
    update(dt) {
      assertLive()
      if(!Number.isFinite(dt)||dt<0)throw Error('Character animation: dt must be nonnegative')
      if(current) {
        current.elapsed+=dt
        if(current.fade>0) {
          const alpha=Math.min(1,current.elapsed/current.fade)
          current.action.setEffectiveWeight(current.initial+(1-current.initial)*alpha)
          for(const [action,weight] of current.weights) {
            action.setEffectiveWeight(weight*(1-alpha))
            if(alpha===1){action.stop();active.delete(action)}
          }
          if(alpha===1){current.fade=0;current.weights.clear()}
        }
      }
      updates++;mixer.update(dt);instance.root.updateMatrixWorld(true);instance.skeleton.update()
    },
    updateCount:()=>updates,
    finished:()=>!!current && !current.loop && current.action.paused,
    capture:()=>({index:current?.index??null,time:current?.action.time??0,loop:current?.loop??false}),
    validateCapture(data) {
      if(!data || !(data.index===null || Number.isInteger(data.index)&&clips[data.index]) ||
        !Number.isFinite(data.time) || data.time<0 || data.time>(clips[data.index]?.duration??0)+.000001 || typeof data.loop!=='boolean')throw Error('Invalid character animation capture')
      return {index:data.index,time:data.time,loop:data.loop}
    },
    restore(data) {
      const saved=controller.validateCapture(data)
      assertLive();stop()
      if(saved.index===null)return
      controller.playClip(saved.index,{loop:saved.loop,fade:0,restart:true})
      current.action.time=saved.time;current.elapsed=saved.time
      if(!saved.loop && saved.time>=clips[saved.index].duration)current.action.paused=true
      mixer.update(0);instance.root.updateMatrixWorld(true);instance.skeleton.update()
    },
    stop(){assertLive();stop()},
    snapshot:()=>({disposed,index:current?.index??null,name:current?asset.clips[current.index].name:null,
      time:current?.action.time??0,duration:current?clips[current.index].duration:0,loop:current?.loop??false,
      finished:!!current && !current.loop && current.action.paused,
      activeActions:active.size,cachedActions:actions.size,mixerTime:mixer.time,
      inPlace:'static hips parent → source scene XZ bind anchor → parent; source scene Y preserved',
      semanticStatus:'unconfirmed'}),
    dispose(){if(disposed)return;disposed=true;stop();unsubscribe();clips.length=0},
  }
  return controller
}
