import { createChapter5Combat } from './campaign-ch5-combat.mjs'
import { installChapter5Native } from './campaign-ch5-native.mjs'
import { createChapter5Infected } from './campaign-ch5-infected.mjs'
import { installChapter3Clearance } from './campaign-ch3-clearance.mjs'
import { createClearanceVisual } from './campaign-ch3-personnel-visual.mjs'
import { CH5_QUOTAS, CH5_BOUNDS, CH5_GROUND_SITES, inChapter5, createChapter5Navigation } from './campaign-ch5-spawns.mjs'
import { createChapter5Population } from './campaign-ch5-population.mjs'

export function installChapter5Battle(g,{infected,personnel,active}) {
  const T=g.THREE,position=new T.Vector3(-30,0,-2),navigation=createChapter5Navigation(g),infectedSlots=new Map(),releases=new Map()
  let armed=false,disposed=false,departureStopped=false,radioIndex=0,radioRemaining=0
  const enabled=()=>!disposed&&!departureStopped&&armed&&active()
  const combat=createChapter5Combat(g,{active:enabled,contains:inChapter5})
  const native=installChapter5Native(g,{combat,active:enabled})
  for(let i=1;i<=CH5_QUOTAS.infected;i++){
    const id=`ch5-infected-${i}`
    infectedSlots.set(id,createChapter5Infected(g,{id,infected,combat,navigation,position}))
  }
  const soldiers=installChapter3Clearance(g,{createVisual:()=>createClearanceVisual(g,personnel),ownerKey:'chapter-5',combat,navigation,
    narrative:{snapshot:()=>({active:!enabled()})},deployments:Array.from({length:5},(_,i)=>({id:`ch5-soldier-${i+1}`,route:'central',group:null,
      position:{x:-30,y:0,z:-2},yaw:0,patrol:[],cover:[],territory:CH5_BOUNDS}))})
  for(const m of soldiers.members)soldiers.retire(m.id)
  const population=createChapter5Population(g,{active:enabled,actors:combat.actors,navigation,
    spawn(slot,point,yaw){
      if(slot.kind==='infected'){const m=infectedSlots.get(slot.id);return m.respawn(point,yaw)?m.actor:null}
      if(slot.kind==='soldier'){
        const m=soldiers.members.find(m=>m.id===slot.id)
        m.definition.position={x:point.x,y:point.y,z:point.z};m.definition.yaw=yaw
        m.definition.patrol=CH5_GROUND_SITES.filter(s=>Math.hypot(s.x-point.x,s.z-point.z)<10&&navigation.findPath(point,new T.Vector3(s.x,0,s.z))).slice(0,3)
        return soldiers.respawn(slot.id,{position:point})?m.target.actor:null
      }
      const actor=g.enemies.spawn(slot.kind,point,{state:'patrol',yaw})
      if(actor)releases.set(slot.id,native.register(actor))
      return actor
    },
    retire(slot){
      if(slot.kind==='infected')infectedSlots.get(slot.id).retire()
      else if(slot.kind==='soldier')soldiers.retire(slot.id)
      else {if(slot.actor.id===slot.actorId&&g.enemies.list.includes(slot.actor))g.enemies.debug.ctx.retire(slot.actor);releases.get(slot.id)?.();releases.delete(slot.id)}
    },
  })
  const radio=['七号泊位检测到未经授权的供电恢复。','各清场单位，立即前往目标区域。']
  function start(){if(armed||disposed||departureStopped)return false;armed=true;population.start();return true}
  function stopForDeparture(){
    if(disposed||departureStopped)return false
    // Interact runs inside native game.update, before this frame's native
    // weapon/enemies tick. Close every attack gate before clearing live effects.
    departureStopped=true;armed=false;population.stop();native.silenceOwned();combat.reset()
    soldiers.update(0)
    for(const m of infectedSlots.values())m.voice.stop()
    radioRemaining=0;g.hud.clearRadio()
    return true
  }
  function update(dt){
    if(!enabled()||!Number.isFinite(dt)||dt<=0){soldiers.update(0);return}
    population.update(dt);combat.update(dt)
    for(const m of infectedSlots.values())m.update(dt)
    soldiers.update(dt)
    radioRemaining=Math.max(0,radioRemaining-dt)
    if(radioIndex<radio.length&&radioRemaining===0){g.hud.radio(radio[radioIndex++],6,'公司清场无线电');radioRemaining=6}
  }
  function reset(){
    armed=false;departureStopped=false;population.reset();native.clearOwned();combat.reset()
    for(const m of infectedSlots.values())m.retire()
    for(const m of soldiers.members)soldiers.retire(m.id)
    radioIndex=0;radioRemaining=0;g.hud.clearRadio()
  }
  function warmup(){
    // The native scene renders into linear offscreen/reflection targets. A
    // default compile() misses those variants, shadow programs and bone uploads.
    // Warm existing meshes under the loading shell without activating any actor.
    const roots=[...[...infectedSlots.values()].map(m=>m.instance.root),...soldiers.members.map(m=>m.visual.root),
      ...[...g.enemies.debug.hounds,...g.enemies.debug.gulls].map(e=>e.rig.group)]
    const held=[],renderer=g.renderer,previous=renderer.getRenderTarget(),target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType})
    target.texture.colorSpace=T.LinearSRGBColorSpace
    try{
      for(const root of roots){held.push([root,'visible',root.visible]);root.visible=true
        root.traverse(o=>{if(o.isMesh){held.push([o,'frustumCulled',o.frustumCulled]);o.frustumCulled=false}})}
      renderer.setRenderTarget(target);renderer.render(g.scene,g.camera)
    }finally{
      for(const [object,key,value]of held)object[key]=value
      renderer.setRenderTarget(previous);renderer.shadowMap.needsUpdate=true;target.dispose()
    }
  }
  return {start,stopForDeparture,update,reset,warmup,combat,native,population,soldiers,infected:[...infectedSlots.values()],
    capture:()=>population.capture(),snapshot:()=>({departureStopped,population:population.snapshot(),combat:combat.snapshot(),native:native.snapshot(),
      infected:[...infectedSlots.values()].map(m=>m.snapshot()),soldiers:soldiers.snapshot(),radioIndex}),
    dispose(){if(disposed)return;reset();population.dispose();soldiers.dispose();for(const m of infectedSlots.values())m.dispose();native.dispose();combat.dispose();disposed=true},
  }
}
