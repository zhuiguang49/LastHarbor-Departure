import { CH4 } from './campaign-ch4-layout.mjs'
import { createChapter4InfectedDirector } from './campaign-ch4-infected.mjs'
import { installChapter4Clearance } from './campaign-ch4-clearance.mjs'
import { installChapter4Dossier } from './campaign-ch4-dossier.mjs'
import { installChapter4Reinforcements } from './campaign-ch4-reinforcements.mjs'
import { installChapter4Ammo } from './campaign-ch4-ammo.mjs'
import { createClearanceVisual } from './campaign-ch3-personnel-visual.mjs'

const radio=[
  '第七区检测到未经授权的门禁覆盖请求。',
  '已确认目标位置。立即执行清场，阻止目标进入七号泊位。',
]

// The continuous campaign owns the fixed entry snapshot and previous chapters.
// This controller owns CH4 actors, its simulation clock and the physical gate.
export function installChapter4Runtime(g,equipment,{infected,personnel,gate,narrative,flags,emit,onCheckpoint=()=>{}}) {
  const T=g.THREE,target=new T.Vector3(CH4.console.target.x,CH4.console.target.y,CH4.console.target.z)
  let elapsed=0,radioIndex=0,radioRemaining=0,lastFrame=null,held=false,disposed=false
  const enemies=createChapter4InfectedDirector(g,{...infected,enabled:false})
  const clearance=installChapter4Clearance(g,{members:enemies.members})
  const blocked=()=>disposed||!flags().chapter4Entered||!flags().chapter4IntroRead||flags().chapter4Completed||
    !!narrative.snapshot().active||!!dossier.snapshot().active
  const active=()=>!blocked()&&g.game.state==='playing'&&g.player.alive&&g.player.enabled!==false
  function requestOverride() {
    if(!flags().chapter4IntroRead||clearance.snapshot().count!==5||flags().gateOverrideStarted||flags().chapter4Completed)return false
    if(!emit({type:'gate-override-started'}))return false
    elapsed=0;radioIndex=0;radioRemaining=0;reinforcements.start();onCheckpoint();return true
  }
  const dossier=installChapter4Dossier(g,{
    onRead(){emit({type:'p07-read'});onCheckpoint()},onConfirm:requestOverride,
  })
  const reinforcements=installChapter4Reinforcements(g,{
    createVisual:()=>createClearanceVisual(g,personnel),narrative:{snapshot:()=>({active:blocked()})},onChange:onCheckpoint,
  })
  const ammo=installChapter4Ammo(g,equipment,{enabled:active,onChange:onCheckpoint})
  function nearby() {
    const p=g.player.pos,f=g.player.forward,dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz)
    return d<2&&g.player.eye.distanceTo(target)<2.5&&
      (dx*f.x+dz*f.z)/Math.max(.001,d*Math.hypot(f.x,f.z))>.45&&g.physics.lineOfSight(g.player.eye,target)
  }
  function interact() {
    if(!active()||lastFrame===g.time.frame)return false
    lastFrame=g.time.frame
    const pressed=g.input.pressed('interact')&&!held;held=!!g.input.down('interact')
    if(nearby()) {
      const ready=clearance.snapshot().count===5,f=flags()
      g.hud.setPrompt(f.gateOverrideAccepted?'权限覆盖成功 · 通过安全门':f.gateOverrideStarted?'权限覆盖进行中':
        ready?'E 读取 P-07 机密档案':`控制台锁定 · 清除封锁区感染者：${clearance.snapshot().count}/5`)
      if(pressed&&!f.gateOverrideStarted) {
        if(ready)dossier.open()
        else g.hud.message(`控制台锁定 · 尚有 ${5-clearance.snapshot().count} 只感染者`,3)
      }
      return true
    }
    return ammo.interact()
  }
  function update(dt) {
    const f=flags()
    enemies.setEnabled(!!f.chapter4Entered&&!!f.chapter4IntroRead&&!f.chapter4Completed)
    if(!active()) {
      reinforcements.update(0)
      if(f.chapter4Completed&&g.game.state==='playing'&&!narrative.snapshot().active)gate.update(dt)
      return
    }
    if(!Number.isFinite(dt)||dt<=0)return
    enemies.update(dt);ammo.update(dt)
    if(clearance.snapshot().count===5&&!f.blockadeInfectedCleared){emit({type:'ch4-infected-cleared'});onCheckpoint()}
    if(f.gateOverrideStarted&&!f.gateOverrideAccepted) {
      elapsed=Math.min(60,elapsed+dt)
      if(elapsed>=60-1e-9) {
        elapsed=60
        // Cancel reservations before this frame can attempt another spawn.
        reinforcements.stopSpawning();emit({type:'gate-override-accepted'});gate.start()
        g.hud.message('权限覆盖成功 · 安全门正在开启',6);onCheckpoint()
      }
      radioRemaining=Math.max(0,radioRemaining-dt)
      if(radioIndex<radio.length&&radioRemaining===0){g.hud.radio(radio[radioIndex++],6,'清场无线电');radioRemaining=6}
    }
    gate.update(dt)
    if(gate.snapshot().standingPassable&&!flags().gatePhysicallyOpen){emit({type:'gate-physically-open'});onCheckpoint()}
    reinforcements.update(dt)
  }
  function observeExit(previous,current) {
    if(!active()||!flags().gateOverrideAccepted||!previous||previous.distanceTo(current)>4||
      Math.abs(previous.y)>.5||Math.abs(current.y)>.5||previous.z>=CH4.gate.position.z||current.z<CH4.gate.position.z)return false
    const t=(CH4.gate.position.z-previous.z)/(current.z-previous.z),point=previous.clone().lerp(current,t)
    // Native movement has already crossed; it may auto-stand after clearing.
    if(!gate.isPassableAt(point,{height:1.15,radius:.32})||!emit({type:'chapter4-exited'}))return false
    reinforcements.retire();enemies.finish();g.hud.clearRadio();g.hud.setPrompt(null)
    g.hud.message('第四章完成 · 已通过安全门',8);onCheckpoint();return true
  }
  function objective() {
    const f=flags()
    return f.chapter4Completed?'第四章完成 · 已通过安全门':!f.chapter4IntroRead?'第四章 · 封锁线：第七区控制中心':
      !f.gateOverrideStarted?clearance.objective():!f.gateOverrideAccepted?
        `权限覆盖：${Math.ceil(60-elapsed)} 秒 · ${Math.floor(elapsed/60*100)}%`:'权限覆盖成功 · 安全门正在开启 · 穿门进入七号泊位'
  }
  function capture(){return {version:1,elapsed,infected:enemies.capture(),clearance:clearance.snapshot(),gate:gate.capture(),ammo:ammo.capture()}}
  function validateEntry(saved,missionFlags) {
    if(missionFlags.chapter4Completed) {
      if(!saved||saved.version!==1||saved.elapsed!==60||saved.clearance.count!==5||!saved.gate.started||
        !Number.isFinite(saved.gate.progress)||saved.gate.progress<0||saved.gate.progress>1||
        !missionFlags.gateOverrideAccepted||!missionFlags.gatePhysicallyOpen||saved.infected.enabled)
        throw Error('Invalid completed CH4 checkpoint')
      enemies.validateCapture(saved.infected)
      if(saved.infected.members.some(m=>m.alive||m.hp!==0)||
        saved.clearance.killedIds.length!==5||new Set(saved.clearance.killedIds).size!==5||
        saved.clearance.killedIds.some(id=>!saved.infected.members.some(m=>m.id===id)))throw Error('Invalid completed CH4 actors')
      return
    }
    if(!saved||saved.version!==1||saved.elapsed!==0||saved.clearance.count!==0||saved.gate.started||saved.gate.progress!==0||
      missionFlags.blockadeInfectedCleared||missionFlags.gateOverrideStarted||missionFlags.gateOverrideAccepted||missionFlags.chapter4Completed)
      throw Error('Invalid CH4 entry checkpoint')
    enemies.validateCapture(saved.infected)
    if(saved.infected.members.some(m=>!m.alive||m.hp!==200))throw Error('Invalid CH4 entry actors')
  }
  function reset(saved) {
    dossier.reset();reinforcements.reset();enemies.reset();enemies.setEnabled(false);clearance.reset();gate.reset();ammo.reset()
    elapsed=radioIndex=radioRemaining=0;lastFrame=null;held=!!g.input.down('interact')
    if(saved) {
      enemies.restore(saved.infected);enemies.finish();reinforcements.retire()
      clearance.reset(saved.clearance);gate.reset(saved.gate);ammo.reset(saved.ammo);elapsed=saved.elapsed
    }
  }
  return {update,interact,observeExit,objective,capture,validateEntry,reset,enemies,clearance,dossier,reinforcements,ammo,gate,
    snapshot:()=>({...capture(),dossier:dossier.snapshot(),reinforcements:reinforcements.snapshot(),gate:gate.snapshot(),objective:objective()}),
    dispose(){if(disposed)return;disposed=true;dossier.reset();reinforcements.dispose();clearance.dispose();enemies.dispose()},
  }
}
