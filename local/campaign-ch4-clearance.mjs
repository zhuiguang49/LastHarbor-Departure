import { CH4 } from './campaign-ch4-layout.mjs'

// Only these five live actor identities can satisfy the console prerequisite.
// A1 stops at readiness: no hacking clock, gate motion, reinforcements or refill.
export function installChapter4Clearance(g,{members}) {
  const actors=new Map(members.map(m=>[m.spawn.id,m.target.actor])),killed=new Set(),T=g.THREE
  let consoleAcknowledged=false,lastFrame=null,held=false,disposed=false
  const ready=()=>killed.size===5
  const targets=['console','ammo'].map(kind=>({kind,target:new T.Vector3(CH4[kind].target.x,CH4[kind].target.y,CH4[kind].target.z)}))
  function onKilled({enemy}={}) {
    if(disposed||!enemy||actors.get(enemy.id)!==enemy||enemy.alive||enemy.hp>0||killed.has(enemy.id))return
    killed.add(enemy.id)
    if(ready())g.hud.message('封锁区已清理 · 前往安全门控制台',5)
  }
  g.events.on('enemy:killed',onKilled)
  function nearby(target) {
    const p=g.player.pos,f=g.player.forward,dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz)
    return d<2&&g.player.eye.distanceTo(target)<2.5&&
      (dx*f.x+dz*f.z)/Math.max(.001,d*Math.hypot(f.x,f.z))>.45&&g.physics.lineOfSight(g.player.eye,target)
  }
  function interact() {
    if(disposed||g.game.state!=='playing'||!g.player.alive||g.player.enabled===false||lastFrame===g.time.frame)return
    lastFrame=g.time.frame
    const pressed=g.input.pressed('interact')&&!held
    held=!!g.input.down('interact')
    const site=targets.find(s=>nearby(s.target))
    if(!site){g.hud.setPrompt(null);return}
    g.hud.setPrompt(site.kind==='ammo'?'弹药补给预留位置':ready()?'E 检查控制台 · 破解前置条件已满足':`控制台锁定 · 清除封锁区感染者：${killed.size}/5`)
    if(!pressed)return
    if(site.kind==='ammo')g.hud.message('门旁弹药补给预留位置',3)
    else if(!ready())g.hud.message(`控制台锁定 · 尚有 ${5-killed.size} 只感染者`,3)
    else {consoleAcknowledged=true;g.hud.message('控制台已解锁 · 安全门待破解',4)}
  }
  return {interact,
    objective:()=>`清除封锁区感染者：${killed.size}/5${ready()?' · 前往安全门控制台':''}`,
    reset(saved){killed.clear();for(const id of saved?.killedIds||[])if(actors.has(id))killed.add(id);consoleAcknowledged=!!saved?.consoleAcknowledged;lastFrame=null;held=!!g.input.down('interact')},
    snapshot:()=>({killedIds:[...actors.keys()].filter(id=>killed.has(id)),count:killed.size,total:5,
      consoleUnlocked:ready(),consoleAcknowledged,gateClosed:true,hackingStarted:false}),
    dispose(){if(disposed)return;disposed=true;g.events.off('enemy:killed',onKilled)},
  }
}
