import { createCharacterAnimation } from './character-animation.mjs'
import { installCharacterTarget } from './character-native-target.mjs'
import { INFECTED_CLIPS } from './character-clips.mjs'
import { createChapter2Infected, CH2_INFECTED_TUNING } from './campaign-ch2-infected.mjs'

// One reusable slot. The CH5 director owns the quota and five-second
// replacement delay; this adapter owns one original model/voice/AI lifetime.
export function createChapter5Infected(g,{id,infected,combat,navigation,position,yaw=0}) {
  const T=g.THREE,p=CH2_INFECTED_TUNING,{asset,bank}=infected
  const instance=asset.createInstance({height:p.height}),animation=createCharacterAnimation(T,instance,asset),voice=bank.createVoice()
  const root=instance.root
  root.name=id;root.position.copy(position);root.rotation.y=yaw;g.scene.add(root)
  let enabled=false,disposed=false,selected=null,lastObservation=null
  const opponent=()=>selected
  const moveCapsule=(...args)=>combat.move(target.actor,...args)
  const target=installCharacterTarget(g,instance,{animation,opponent,moveCapsule,
    clipFor:role=>INFECTED_CLIPS[role]?.index,onStop:()=>voice.stop()})
  const actor=target.actor;actor.id=id
  const section={id:'ch5',bounds:{minX:-40,maxX:40,minZ:-30,maxZ:30}}
  const spawn={id,sectionId:section.id,position:{x:position.x,y:position.y,z:position.z},mode:'ordinary'}
  const ai=createChapter2Infected(g,{spawn,section,instance,animation,voice,target,opponent,moveCapsule,navigation})
  const unregister=combat.register({actor,kind:'infected',
    collider:()=>({position:actor.pos,radius:p.radius,height:p.height}),
    eye:()=>actor.pos.clone().add(new T.Vector3(0,1.5,0)),
    forward:()=>new T.Vector3(-Math.sin(root.rotation.y),0,-Math.cos(root.rotation.y)),
    alive:()=>enabled&&!disposed&&actor.alive&&actor.active})
  function clearSelection(){selected=null;lastObservation=null;ai.clearTarget()}
  function retire(){
    if(disposed)return
    enabled=false;clearSelection();ai.setEnabled(false);target.setEnabled(false)
    target.restoreState({hp:0,alive:false});voice.stop();root.visible=false
  }
  function respawn(at,nextYaw=0){
    if(disposed)return false
    clearSelection();voice.stop();root.position.copy(at);root.rotation.y=nextYaw
    target.reset();target.setEnabled(true);ai.reset({position:at});ai.setEnabled(true)
    animation.playClip(INFECTED_CLIPS.Idle.index,{loop:true,fade:0,restart:true})
    root.visible=true;enabled=true;return true
  }
  function update(dt){
    if(disposed||!enabled||!Number.isFinite(dt)||dt<=0)return
    if(g.game.state==='playing'&&g.player.alive&&g.player.enabled!==false&&actor.alive){
      const candidate=combat.targetFor(actor)
      if(candidate!==selected){ai.clearTarget();selected=candidate;lastObservation=null}
      const observation=combat.observationFor(actor)
      if(observation&&observation.id===selected?.id&&
        (!lastObservation||lastObservation.id!==observation.id||lastObservation.time!==observation.time)){
        // Feed only a recorded observation, never a hidden target's live position.
        ai.receiveClue({kind:observation.kind,position:observation.position.clone()})
        lastObservation={id:observation.id,time:observation.time}
      }
    }
    ai.update(dt)
  }
  retire()
  return {actor,instance,animation,voice,update,respawn,retire,
    snapshot:()=>({id,enabled,disposed,targetId:selected?.id??null,ai:ai.snapshot(),target:target.snapshot(),animation:animation.snapshot()}),
    dispose(){
      if(disposed)return
      retire();disposed=true;unregister();ai.dispose();target.dispose();animation.dispose();voice.dispose();instance.dispose()
    },
  }
}
