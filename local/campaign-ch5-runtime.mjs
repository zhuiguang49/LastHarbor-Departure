import { installChapter3Ammo } from './campaign-ch3-ammo.mjs'
import { createChapter5Warehouse } from './campaign-ch5-warehouse.mjs'
import { installChapter5Battle } from './campaign-ch5-battle.mjs'
import { createChapter5Facilities } from './campaign-ch5-facilities.mjs'
import { installChapter5Fuel } from './campaign-ch5-fuel.mjs'
import { installChapter5Ammo } from './campaign-ch5-ammo.mjs'
import { installChapter5Ending } from './campaign-ch5-ending.mjs'

export const CH5_AMMO_SITE = {id:'ch5-ammo-entry',group:null,position:{x:-36.5,y:0,z:7},yaw:-Math.PI/2,
  label:'七号泊位入口',code:'07',approach:{x:-38,y:0,z:7}}
export const CH5_AMMO_HINT='弹药补给：七号泊位入口旁设有最后一处应急弹药箱，建议补充装备后再启动中央供电。'
export const CH5_POWER_TARGET=Object.freeze({x:1.757173,y:1,z:8.204530})

// CH4 completes at its gate (Z=-7). CH5 begins at the unchanged original
// harbor seam (X=-40), only on a short native movement across that seam.
export function crossedChapter5Entry(previous,current) {
  if(!previous||!current||![previous,current].every(p=>['x','y','z'].every(k=>Number.isFinite(p[k])))||
    previous.x>=-40||current.x< -40||Math.abs(previous.y)>.5||Math.abs(current.y)>.5||
    Math.hypot(current.x-previous.x,current.y-previous.y,current.z-previous.z)>4)return false
  const t=(-40-previous.x)/(current.x-previous.x),z=previous.z+(current.z-previous.z)*t
  return z>2&&z<8
}

export function installChapter5Runtime(g,equipment,{systems,narrative,flags,emit,onCheckpoint=()=>{},combatEnabled=false,infected,personnel,fuelEnabled=false,repairResources,endingEnabled=false}) {
  const T=g.THREE,target=new T.Vector3(CH5_POWER_TARGET.x,CH5_POWER_TARGET.y,CH5_POWER_TARGET.z)
  const warehouse=createChapter5Warehouse(g)
  let elapsed=0,hintShown=false,hintRemaining=0,lastFrame=null,held=false,disposed=false
  const originalMessage=g.hud.message
  function message(text,...args) {
    // Native lock acquisition clears this slot; missing-lock reminders also
    // replace it. Neither should erase the three-second entry instruction.
    if(hintRemaining>0&&g.game.state==='playing'&&(!text||text===g.input.describeMode?.()))return
    if(text!==CH5_AMMO_HINT)hintRemaining=0
    return originalMessage.call(this,text,...args)
  }
  g.hud.message=message
  const active=()=>!disposed&&flags().chapter5Entered&&flags().chapter5IntroRead&&
    g.game.state==='playing'&&g.player.alive&&g.player.enabled!==false&&!narrative.snapshot().active
  const battle=combatEnabled?installChapter5Battle(g,{infected,personnel,active}):null
  const ammo=installChapter3Ammo(g,{equipment,narrative:{snapshot:()=>({active:!active()})},
    getMembers:()=>[],sites:[CH5_AMMO_SITE],onCheckpoint})
  const facilities=fuelEnabled?createChapter5Facilities(g,{infrastructure:systems,repairResources,occupants:()=>battle?.combat.actors()||[]}):null
  const fuel=fuelEnabled?installChapter5Fuel(g,{systems,facilities,narrative,flags,onCheckpoint}):null
  const reusableAmmo=fuelEnabled?installChapter5Ammo(g,{equipment,narrative:{snapshot:()=>({active:!active()})},onCheckpoint}):null
  const ending=endingEnabled?installChapter5Ending(g,{systems,warehouse,facilities,fuel,battle,flags,emit}):null
  const onGameState=({state})=>{if(state!=='playing')fuel?.pause()}
  if(fuel)g.events.on('game:state',onGameState)
  function showAmmoHint() {
    if(hintShown||ammo.capture().consumed.length)return false
    hintShown=true;hintRemaining=3;g.hud.message(CH5_AMMO_HINT,3);return true
  }
  function nearby() {
    const p=g.player.pos,f=g.player.forward,dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz)
    return d<2.1&&g.player.eye.distanceTo(target)<2.5&&
      (dx*f.x+dz*f.z)/Math.max(.001,d*Math.hypot(f.x,f.z))>.45&&g.physics.lineOfSight(g.player.eye,target)
  }
  function interact() {
    if(!active()||lastFrame===g.time.frame)return false
    lastFrame=g.time.frame
    const pressed=g.input.pressed('interact')&&!held;held=!!g.input.down('interact')
    if(ending?.interact(pressed))return true
    if(ammo.interact())return true
    if(reusableAmmo?.interact()||fuel?.interact(pressed))return true
    if(!nearby())return false
    const power=systems.state.power
    g.hud.setPrompt(power==='OFF'?'E 恢复七号泊位中央应急供电':power==='UNSTABLE'?'备用电源正在稳定':'七号泊位应急供电正常')
    if(pressed&&power==='OFF'&&systems.requestPower()) {
      g.audio.play('relay_cut',{pos:target,gain:.25,jitter:0});g.player.addShake(.08);onCheckpoint()
    }
    return true
  }
  function update(dt) {
    if(ending?.started()){ending.update(dt);return}
    if(!active()||!Number.isFinite(dt)||dt<=0){battle?.update(0);fuel?.pause();return}
    hintRemaining=Math.max(0,hintRemaining-dt)
    ammo.update();reusableAmmo?.update(dt);systems.updatePower(dt);facilities?.update(dt)
    if(systems.state.power==='ON')emit({type:'power7-stable'})
    if(flags().power7Stable&&!flags().warehouseInitializationStarted) {
      narrative.openChapter5Power({requireConfirm:combatEnabled,onComplete:()=>{
        if(emit({type:'warehouse-initialization-started'})){elapsed=0;battle?.start();onCheckpoint()}
      }})
      return
    }
    fuel?.update(dt)
    if(fuel)g.hud.setObjective()
    if(!active()){battle?.update(0);return}
    battle?.update(dt)
    if(flags().warehouseInitializationStarted&&!flags().warehouseUnlocked) {
      elapsed=Math.min(60,elapsed+dt)
      if(elapsed>=60-1e-9) {
        elapsed=60;emit({type:'warehouse-unlocked'});warehouse.start()
        g.hud.message('仓库安全联锁初始化完成 · 仓库大门正在开启',6);onCheckpoint()
      }
    }
    warehouse.update(dt)
    if(warehouse.snapshot().phase==='open'&&emit({type:'warehouse-physically-open'}))onCheckpoint()
  }
  function objective() {
    if(ending?.objective())return ending.objective()
    return !flags().chapter5IntroRead?'第五章 · 七号泊位：今夜离港':
      !flags().power7Stable?'补充入口弹药 · 恢复中央应急供电':
      !flags().warehouseInitializationStarted?'七号泊位供电已恢复':
      !flags().warehouseUnlocked?`仓库安全联锁初始化：剩余${Math.ceil(60-elapsed)}s`:
      !flags().warehousePhysicallyOpen?'仓库大门正在开启':fuel?fuel.objective():battle?'仓库已开放 · 清场单位持续增援':'仓库已开放 · 进入仓库检查设施'
  }
  function capture(){return {version:1,elapsed,hintShown,power:{...systems.state},warehouse:warehouse.capture(),ammo:ammo.capture(),...(battle?{battle:battle.capture()}:{}),...(fuel?{fuel:fuel.capture(),facilities:facilities.capture(),reusableAmmo:reusableAmmo.capture()}:{}),...(ending?{ending:ending.capture()}:{})}}
  function validateEntry(saved,missionFlags) {
    if(!saved||saved.version!==1||saved.elapsed!==0||saved.power?.power!=='OFF'||
      saved.warehouse?.progress!==0||saved.warehouse?.started||missionFlags.power7Stable||
      missionFlags.warehouseInitializationStarted||missionFlags.warehouseUnlocked||missionFlags.warehousePhysicallyOpen)
      throw Error('Invalid CH5 entry checkpoint')
    if(battle&&(!saved.battle||saved.battle.started||saved.battle.elapsed!==0))throw Error('Invalid CH5 entry population')
    ammo.validateCapture(saved.ammo)
    if(saved.ammo.consumed.length)throw Error('Invalid CH5 entry ammunition')
    if(ending&&(!saved.ending||saved.ending.started||saved.ending.elapsed!==0||saved.ending.victory))throw Error('Invalid CH5 ending entry checkpoint')
    if(fuel){
      fuel.validateEntry(saved.fuel);reusableAmmo.validateCapture(saved.reusableAmmo)
      if(saved.facilities?.gate!=='LOCKED'||saved.facilities.gateProgress!==0||saved.facilities.pendingReset||
        saved.reusableAmmo.stations.some(s=>s.uses||s.cooldownRemaining))throw Error('Invalid CH5 facilities entry checkpoint')
    }
  }
  function reset() {
    ending?.reset()
    narrative.cancelChapter5Power?.();fuel?.reset();battle?.reset();systems.reset();facilities?.reset();warehouse.reset();ammo.reset();reusableAmmo?.reset()
    elapsed=0;hintShown=false;hintRemaining=0;lastFrame=null;held=!!g.input.down('interact')
  }
  return {update,interact,objective,capture,validateEntry,reset,showAmmoHint,ammo,warehouse,battle,fuel,facilities,reusableAmmo,ending,
    snapshot:()=>({...capture(),objective:objective(),warehouse:warehouse.snapshot(),ammo:ammo.snapshot(),
      powerTarget:target.toArray(),lighting:systems.snapshot().lighting,...(battle?{battle:battle.snapshot()}:{}),
      ...(fuel?{fuel:fuel.snapshot(),facilities:facilities.snapshot(),reusableAmmo:reusableAmmo.snapshot()}:{} ),...(ending?{ending:ending.snapshot()}:{})}),
    dispose(){if(disposed)return;disposed=true;ending?.dispose();if(g.hud.message===message)g.hud.message=originalMessage;if(fuel)g.events.off('game:state',onGameState);fuel?.dispose();facilities?.dispose();reusableAmmo?.dispose();repairResources?.dispose();battle?.dispose();ammo.dispose();warehouse.dispose?.()},
  }
}
