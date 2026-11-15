import { createChapter5Ending } from './campaign-ch5-ending-state.mjs'
import { createChapter5DepartureView } from './campaign-ch5-departure-view.mjs'

export const CH5_BOARDING_PROMPT='工作艇已准备就绪 · 按 E 登船离港'

export function chapter5ReadyToBoard(flags,power,warehouse,facilities,fuel) {
  return flags.chapter4Completed&&flags.chapter5Entered&&flags.chapter5IntroRead&&
    flags.power7Stable&&power.power==='ON'&&flags.warehousePhysicallyOpen&&warehouse.phase==='open'&&
    fuel.controlAuthorized&&facilities.gate==='OPEN'&&facilities.gateProgress===1&&
    fuel.fuelStarted&&fuel.repaired&&fuel.elapsed===120
}

export function installChapter5Ending(g,{systems,warehouse,facilities,fuel,battle,flags,emit}) {
  const model=createChapter5Ending(),view=createChapter5DepartureView(g)
  const originalUpdate=g.game.update,originalHudUpdate=g.hud.update,originalRadio=g.hud.radio,
    originalMessage=g.hud.message,originalDamage=g.player.damage,originalReload=g.weapon.reloadNow
  const who=document.querySelector('.comms-who'),screen=document.querySelector('.m-debrief')
  const hiddenHud=[...g.hud.root.children].filter(el=>!el.classList.contains('h-msg'))
  const savedDisplays=new Map(),history=[]
  let disposed=false,saved=null,engine=null,victory=false,noise=null
  const started=()=>model.snapshot().started
  const ready=()=>!disposed&&chapter5ReadyToBoard(flags(),systems.state,warehouse.snapshot(),facilities.capture(),fuel.capture())
  function nearBoat() {
    const p=g.player.pos,at=g.level.extraction.pos
    // The original gate enclosure and ladder, not the boat model across water.
    return Math.hypot(p.x-at.x,p.z-at.z)<g.level.extraction.radius&&
      p.x>28.05&&p.x<29.62&&p.z>18.45&&p.z<21.55&&Math.abs(p.y-at.y)<.4&&
      g.physics.lineOfSight(g.player.eye,at.clone().setY(at.y+1))
  }
  function protect() {
    g.player.enabled=false;g.player.invulnerable=true;g.player.vel.set(0,0,0)
    g.input.setGameplay(false);g.input.fire=false;g.input.ads=false;g.input.move.x=g.input.move.y=0
    g.weapon.setVisible(false);g.weapon.equipmentView.cancelActions();g.weapon.state='idle'
  }
  function radioNoise() {
    // Short filtered noise through the original mixer; no new audio context.
    const ctx=g.audio.ctx,bus=g.audio.meleeBus
    if(!ctx||!bus)return
    noise?.stop()
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain()
    const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.14),ctx.sampleRate),data=buffer.getChannelData(0)
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.sin(Math.PI*i/data.length)
    source.buffer=buffer;filter.type='bandpass';filter.frequency.value=1800;filter.Q.value=.65;gain.gain.value=.07
    source.connect(filter);filter.connect(gain);gain.connect(bus)
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();if(noise===source)noise=null}
    noise=source;source.start()
  }
  function begin() {
    if(started()||!ready()||!nearBoat()||g.game.state!=='playing'||!g.player.alive||!g.player.enabled)return false
    if(!emit({type:'chapter5-boarded',fuelReady:true,boatGateOpen:true}))return false
    saved={manualDialogue:g.game.flow.manualDialogue,invulnerable:g.player.invulnerable,who:who.textContent,
      title:screen.querySelector('.m-h').textContent,kicker:screen.querySelector('.m-k').textContent,
      rating:screen.querySelector('[data-f="rating"]').textContent}
    model.begin();g.game.flow.manualDialogue=true;protect()
    battle.stopForDeparture();g.game.run.queue.length=0;g.fx.clear()
    g.hud.clearRadio();originalMessage.call(g.hud,'',0);g.hud.setPrompt(null)
    for(const el of [...hiddenHud,screen.querySelector('.m-stats'),screen.querySelector('.m-rating span')]){
      savedDisplays.set(el,el.style.display);el.style.display='none'
    }
    g.hud.show(true);view.start()
    engine=g.audio.loop('relay_hum',{pos:g.backdrop.boat.position,gain:.4,pitch:.65})
    history.push({type:'boarded',at:0});return true
  }
  function finish() {
    if(victory||!canFinish())return false
    if(!emit({type:'chapter5-ending-finished',fadeComplete:true}))return false
    victory=true;engine?.stop();engine=null;noise?.stop();noise=null
    g.hud.clearRadio();originalMessage.call(g.hud,'',0)
    if(!g.game.completeCampaign())throw Error('Native campaign victory rejected after final fade')
    screen.querySelector('.m-k').textContent='LAST HARBOR'
    screen.querySelector('.m-h').textContent='末港 · 今夜离港'
    screen.querySelector('[data-f="rating"]').textContent='你已成功离开紫金港。'
    history.push({type:'victory',at:model.snapshot().elapsed});return true
  }
  function update(dt) {
    if(disposed||!started()||victory||g.game.state!=='playing')return
    protect()
    for(const event of model.tick(dt)) {
      history.push({...event,at:model.snapshot().elapsed})
      if(event.type==='line') {
        g.hud.clearRadio();originalMessage.call(g.hud,'',0)
        if(event.channel==='hud')originalMessage.call(g.hud,event.text,event.seconds)
        else{who.textContent=event.sender;originalRadio.call(g.hud,event.text,event.seconds);radioNoise()}
      }else if(event.type==='silence'){g.hud.clearRadio();originalMessage.call(g.hud,'',0)}
    }
    const state=model.snapshot();view.update(state.elapsed,{phase:state.phase,fade:state.fade})
    engine?.setPos(g.backdrop.boat.position);engine?.setPitch(.65+Math.min(1,state.elapsed/5)*.25)
    if(state.finished)finish()
  }
  function gameUpdate(dt) {
    if(!started()) {
      const result=originalUpdate.call(g.game,dt)
      // Boarding is committed inside the original interaction call. Stop the
      // rest of this very frame before native player/weapon/enemy updates.
      return started()?false:result
    }
    if(g.game.state==='paused')return originalUpdate.call(g.game,dt)
    if(g.game.state==='playing') {
      if(g.input.pressed('pause'))g.game.pause()
      else if(Number.isFinite(dt)&&dt>0)g.game.run.time+=dt
      protect()
    }
    return false
  }
  const hudUpdate=function(dt){
    const result=originalHudUpdate.call(g.hud,started()&&g.game.state!=='playing'?0:dt)
    // Equipment's HUD sync restores the active viewmodel each frame. Keep the
    // cinematic hands hidden after that sync, just before the native renderer.
    if(started())g.weapon.setVisible(false)
    return result
  }
  const radio=function(...args){if(!started())return originalRadio.apply(g.hud,args)}
  const message=function(...args){if(!started())return originalMessage.apply(g.hud,args)}
  const damage=function(...args){if(!started())return originalDamage.apply(g.player,args)}
  const reload=function(...args){return started()?false:originalReload.apply(g.weapon,args)}
  const keydown=event=>{
    if(!started()||victory||g.game.state!=='playing'||['KeyP','Escape','Tab','Enter','NumpadEnter'].includes(event.code))return
    event.preventDefault();event.stopImmediatePropagation()
  }
  const onState=({state})=>{if(started()&&state==='playing'){protect();g.game.flow.manualDialogue=true}}
  g.game.update=gameUpdate;g.hud.update=hudUpdate;g.hud.radio=radio;g.hud.message=message;g.player.damage=damage;g.weapon.reloadNow=reload
  globalThis.addEventListener?.('keydown',keydown,true)
  g.events.on('game:state',onState)
  function reset() {
    engine?.stop();engine=null;noise?.stop();noise=null;g.hud.clearRadio()
    originalMessage.call(g.hud,'',0)
    if(saved){
      g.game.flow.manualDialogue=saved.manualDialogue;g.player.invulnerable=saved.invulnerable
      who.textContent=saved.who;screen.querySelector('.m-h').textContent=saved.title
      screen.querySelector('.m-k').textContent=saved.kicker;screen.querySelector('[data-f="rating"]').textContent=saved.rating
      for(const [el,display]of savedDisplays)el.style.display=display
      savedDisplays.clear();g.weapon.setVisible(true)
    }
    saved=null;victory=false;history.length=0;view.reset();model.reset()
  }
  function canFinish(){return model.snapshot().finished&&view.snapshot().fade===1&&g.render.post.fade===1}
  return {update,reset,ready,started,canFinish,
    interact(pressed){if(started()||!ready()||!nearBoat())return false;g.hud.setPrompt(CH5_BOARDING_PROMPT);if(pressed)begin();return true},
    objective:()=>started()?'工作艇正在驶离七号泊位':ready()?CH5_BOARDING_PROMPT:null,
    capture:()=>({...model.snapshot(),victory}),
    snapshot:()=>({...model.snapshot(),victory,ready:ready(),atBoat:nearBoat(),view:view.snapshot(),history:history.map(e=>({...e}))}),
    dispose(){if(disposed)return;reset();disposed=true;view.dispose();g.events.off('game:state',onState)
      if(g.game.update===gameUpdate)g.game.update=originalUpdate
      if(g.hud.update===hudUpdate)g.hud.update=originalHudUpdate
      if(g.hud.radio===radio)g.hud.radio=originalRadio
      if(g.hud.message===message)g.hud.message=originalMessage
      if(g.player.damage===damage)g.player.damage=originalDamage
      if(g.weapon.reloadNow===reload)g.weapon.reloadNow=originalReload
      globalThis.removeEventListener?.('keydown',keydown,true)
    },
  }
}
