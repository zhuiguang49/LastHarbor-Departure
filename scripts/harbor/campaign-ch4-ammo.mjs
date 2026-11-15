import { CH4 } from './campaign-ch4-layout.mjs'

export const CH4_AMMO_COOLDOWN=15

// Reuse the accepted physical crate. This controller owns no mesh, light,
// collider or renderer state; the host owns its place in interaction priority.
export function installChapter4Ammo(g,equipment,{enabled=()=>true,onChange=()=>{}}={}) {
  const target=new g.THREE.Vector3(CH4.ammo.target.x,CH4.ammo.target.y,CH4.ammo.target.z)
  let cooldownRemaining=0,uses=0,held=!!g.input.down?.('interact'),inputFrame=null,updateFrame=null,lastEdgeFrame=null,edge=false
  const active=()=>enabled()&&g.game.state==='playing'&&g.player.alive&&g.player.enabled!==false
  function nearby() {
    const p=g.player.pos,f=g.player.forward,dx=target.x-p.x,dz=target.z-p.z,distance=Math.hypot(dx,dz)
    return distance<2&&g.player.eye.distanceTo(target)<2.5&&
      (dx*f.x+dz*f.z)/Math.max(.001,distance*Math.hypot(f.x,f.z))>.45&&g.physics.lineOfSight(g.player.eye,target)
  }
  function sampleInput() {
    if(inputFrame===g.time.frame)return
    inputFrame=g.time.frame
    edge=!!g.input.pressed('interact')&&!held;held=!!g.input.down?.('interact')
  }
  function update(dt) {
    sampleInput()
    if(updateFrame===g.time.frame)return
    updateFrame=g.time.frame
    if(active()&&Number.isFinite(dt)&&dt>0)cooldownRemaining=Math.max(0,cooldownRemaining-dt)
  }
  function refillState() {
    const saved=equipment.capture(),specs=equipment.snapshot().slots
    let changed=false,owned=0
    for(const id of ['rifle','pistol']){
      const slot=saved.slots[id],spec=specs[id]
      if(!slot?.owned)continue
      owned++
      if(!Number.isSafeInteger(spec?.magSize)||!Number.isSafeInteger(spec?.reserveCap))throw Error(`CH4 ammo requires ${id} capacities`)
      if(slot.ammo===spec.magSize&&slot.reserve===spec.reserveCap)continue
      slot.ammo=spec.magSize;slot.reserve=spec.reserveCap;changed=true
    }
    return {saved,changed,owned}
  }
  function prompt() {
    if(!active()||!nearby())return null
    if(cooldownRemaining>0)return `弹药补给冷却 · ${Math.ceil(cooldownRemaining)}秒`
    const {changed,owned}=refillState()
    return !owned?'尚未持有枪械 · 保留补给':!changed?'已持枪械弹药已满 · 保留补给':'E 补满已持步枪 / P12 · 弹匣与备用'
  }
  function tryUse() {
    if(!active()||!nearby()||cooldownRemaining>0)return false
    const {saved,changed}=refillState()
    if(!changed)return false
    equipment.restore(saved);cooldownRemaining=CH4_AMMO_COOLDOWN;uses++
    onChange({kind:'ch4-ammo',uses,cooldownRemaining})
    return true
  }
  function interact() {
    sampleInput()
    const pressed=edge&&lastEdgeFrame!==g.time.frame;lastEdgeFrame=g.time.frame
    const text=prompt()
    if(!text)return false
    g.hud.setPrompt(text)
    if(pressed&&tryUse())g.hud.setPrompt(prompt())
    return true
  }
  const capture=()=>({version:1,cooldownRemaining,uses})
  function reset(saved) {
    const value=saved??{version:1,cooldownRemaining:0,uses:0}
    if(value.version!==1||!Number.isFinite(value.cooldownRemaining)||value.cooldownRemaining<0||value.cooldownRemaining>CH4_AMMO_COOLDOWN||
      !Number.isSafeInteger(value.uses)||value.uses<0)throw Error('Invalid CH4 ammunition checkpoint')
    cooldownRemaining=value.cooldownRemaining;uses=value.uses
    inputFrame=updateFrame=null;lastEdgeFrame=g.time.frame;held=!!g.input.down?.('interact');edge=false
  }
  return {update,interact,tryUse,prompt,capture,reset,
    snapshot:()=>({...capture(),cooldownSeconds:CH4_AMMO_COOLDOWN,target:target.toArray(),available:active()&&cooldownRemaining===0})}
}
