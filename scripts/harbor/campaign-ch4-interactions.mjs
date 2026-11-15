// A0 inspections only: no mission events, ammunition grant, timer or door state.
export function installChapter4Interactions(g, sites) {
  const T=g.THREE
  let consoleInspections=0,lastFrame=null,held=false
  const targets=['console','ammo'].map(kind=>({kind,target:new T.Vector3(sites[kind].target.x,sites[kind].target.y,sites[kind].target.z)}))
  function nearby(target) {
    const p=g.player.pos,f=g.player.forward,dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz)
    return d<2&&g.player.eye.distanceTo(target)<2.5&&
      (dx*f.x+dz*f.z)/Math.max(.001,d*Math.hypot(f.x,f.z))>.45&&g.physics.lineOfSight(g.player.eye,target)
  }
  function interact() {
    if(g.game.state!=='playing'||!g.player.alive||g.player.enabled===false)return
    if(lastFrame===g.time.frame)return
    lastFrame=g.time.frame
    const down=!!g.input.down('interact'),pressed=g.input.pressed('interact')&&!held
    held=down
    const site=targets.find(s=>nearby(s.target))
    if(!site){g.hud.setPrompt(null);return}
    g.hud.setPrompt(site.kind==='console'?'E 检查控制台 · 安全门锁闭':'弹药补给预留位置')
    if(!pressed)return
    if(site.kind==='console'){
      consoleInspections++
      g.hud.message('控制台已通电 · 安全门保持锁闭 · M4-A0 场景试玩',4)
    }else g.hud.message('门旁弹药补给位置 · 本阶段仅检查可达空间',4)
  }
  return {interact,reset(){consoleInspections=0;lastFrame=null;held=!!g.input.down('interact')},
    snapshot:()=>({consoleInspections,gateClosed:true,ammunitionReserved:true})}
}
