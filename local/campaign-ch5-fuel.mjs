export const CH5_FUEL_SECONDS=120
export const CH5_FAULT_SECONDS=87.6

// Campaign-only mission state. The six-second sandbox pump is never requested.
export function createChapter5Fuel() {
  const state={}
  const reset=()=>Object.assign(state,{version:1,controlAuthorized:false,fuelStarted:false,elapsed:0,
    faultTriggered:false,faultReportConfirmed:false,repaired:false})
  reset()
  function authorize(){if(state.controlAuthorized)return false;state.controlAuthorized=true;return true}
  function start(){if(!state.controlAuthorized||state.fuelStarted)return false;state.fuelStarted=true;return true}
  function repair(){if(!state.faultTriggered||!state.faultReportConfirmed||state.repaired)return false;state.repaired=true;return true}
  function tick(dt) {
    if(!Number.isFinite(dt)||dt<=0||!state.fuelStarted||state.faultTriggered&&!state.repaired)return false
    state.elapsed=Math.min(state.faultTriggered?CH5_FUEL_SECONDS:CH5_FAULT_SECONDS,state.elapsed+dt)
    if(!state.faultTriggered&&state.elapsed>=CH5_FAULT_SECONDS-1e-9){state.elapsed=CH5_FAULT_SECONDS;state.faultTriggered=true;return true}
    if(state.elapsed>=CH5_FUEL_SECONDS-1e-9)state.elapsed=CH5_FUEL_SECONDS
    return false
  }
  return {state,authorize,start,repair,tick,reset,capture:()=>({...state})}
}

export function installChapter5Fuel(g,{systems,facilities,narrative,flags,onCheckpoint=()=>{}}) {
  const model=createChapter5Fuel(),s=model.state
  let generation=0,controlPending=false,faultPending=false
  const progress=()=>s.elapsed/CH5_FUEL_SECONDS
  const presentation=()=>({progress:progress(),fault:s.faultTriggered&&!s.repaired,
    pumping:s.fuelStarted&&s.elapsed<CH5_FUEL_SECONDS&&(!s.faultTriggered||s.repaired)})
  function present(paused=false){systems.presentChapter5Fuel(0,{...presentation(),paused})}
  function nearby(target) {
    const p=g.player.pos,f=g.player.forward,dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz)
    return d<2.1&&g.player.eye.distanceTo(target)<2.5&&
      (dx*f.x+dz*f.z)/Math.max(.001,d*Math.hypot(f.x,f.z))>.45&&g.physics.lineOfSight(g.player.eye,target)
  }
  function interact(pressed) {
    for(const kind of ['control','fuel','repair']) {
      const target=facilities.targets[kind]
      if(!nearby(target))continue
      const prompt=kind==='control'?(s.controlAuthorized?'工作艇封锁已解除 · 燃油输送已授权':
        flags().warehousePhysicallyOpen?'E 操作工作艇与燃油控制机关':'等待仓库安全联锁初始化'):
        kind==='fuel'?(!s.controlAuthorized?'先前往仓库取得燃油授权':!s.fuelStarted?'E 开启燃油阀门':objective()):
        s.repaired?'旁路供电正常':s.faultTriggered?'E 修复备用维修柜 · 恢复旁路供电':'备用维修柜 · 暂无故障'
      g.hud.setPrompt(prompt)
      if(pressed&&kind==='control'&&!s.controlAuthorized&&!controlPending&&flags().warehousePhysicallyOpen&&flags().accessCredentialObtained) {
        const token=generation
        controlPending=true
        if(!narrative.openChapter5Control({onComplete:()=>{
          if(token!==generation||!controlPending||!g.player.alive)return
          controlPending=false
          if(model.authorize()){facilities.openBoatGate();g.audio.play('relay_cut',{pos:target,gain:.25,jitter:0});onCheckpoint()}
        }}))controlPending=false
      }else if(pressed&&kind==='fuel'&&model.start()) {
        g.audio.play('relay_cut',{pos:target,gain:.25,jitter:0});present();onCheckpoint()
      }else if(pressed&&kind==='repair'&&model.repair()) {
        g.audio.play('relay_cut',{pos:target,gain:.25,jitter:0});present()
        g.hud.message('故障已解除 · 燃油输送继续',6);onCheckpoint()
      }
      return true
    }
    return false
  }
  function update(dt) {
    const finished=s.elapsed===CH5_FUEL_SECONDS
    if(model.tick(dt)) {
      g.audio.play('relay_cut',{pos:facilities.targets.fuel,gain:.4,pitch:.65,jitter:0})
      onCheckpoint()
    }
    present()
    if(s.faultTriggered&&!s.faultReportConfirmed&&!faultPending) {
      const token=generation
      faultPending=true
      g.hud.setPrompt(null)
      if(!narrative.openChapter5Fault({onComplete:()=>{
        if(token!==generation||!faultPending||!g.player.alive)return
        faultPending=false;s.faultReportConfirmed=true;onCheckpoint()
      }}))faultPending=false
    }
    if(!finished&&s.elapsed===CH5_FUEL_SECONDS){g.hud.message('燃油输送完成 · 100%',6);onCheckpoint()}
  }
  function objective() {
    return !s.controlAuthorized?'进入仓库 · 操作工作艇与燃油控制机关':
      !s.fuelStarted?'前往码头 · 开启燃油阀门':
      s.faultTriggered&&!s.repaired?'燃油输送暂停 · 73%｜前往入口右侧维修柜修复':
      s.elapsed===CH5_FUEL_SECONDS?'燃油输送完成 · 100%':`燃油输送中 · ${Math.floor(progress()*100+1e-9)}%`
  }
  function reset() {
    generation++;controlPending=faultPending=false
    narrative.cancelChapter5Control();narrative.cancelChapter5Fault();model.reset();systems.presentChapter5Fuel(0,null)
  }
  function validateEntry(saved) {
    const initial=createChapter5Fuel().capture()
    if(!saved||Object.keys(initial).some(key=>saved[key]!==initial[key]))throw Error('Invalid CH5 fuel entry checkpoint')
  }
  return {update,interact,objective,reset,validateEntry,capture:model.capture,pause:()=>present(true),
    snapshot:()=>({...model.capture(),progress:progress(),controlPending,faultPending,objective:objective()}),
    dispose:reset}
}
