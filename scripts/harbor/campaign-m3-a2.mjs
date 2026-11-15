import { installCampaignM1 } from './campaign-m1.mjs'
import { installCampaignSupplies } from './campaign-supplies.mjs'
import { loadChapter3Assets } from './campaign-ch3-assets.mjs'
import { buildChapter3Environment } from './campaign-ch3-environment.mjs'
import { loadSniperResources, createSniperVisual } from './campaign-ch3-sniper-visual.mjs'
import { installChapter3Sniper } from './campaign-ch3-sniper.mjs'
import { loadChapter3PersonnelResources, createClearanceVisual, createWorkerVisual } from './campaign-ch3-personnel-visual.mjs'
import { installChapter3Clearance } from './campaign-ch3-clearance.mjs'
import { CH3_CLEARANCE_DEPLOYMENTS, CH3_RESCUE_BLOCKERS } from './campaign-ch3-deployment.mjs'
import { installChapter3Rescue } from './campaign-ch3-rescue.mjs'
import { installChapter3Ammo, CH3_AMMO_SITES } from './campaign-ch3-ammo.mjs'
import { captureCampaignPlayer, validateCampaignPlayer, restoreCampaignPlayer } from './campaign-player-state.mjs'

// One original-loop chapter trial. Checkpoints commit all actors and the real
// room together, after native damage/interaction callbacks have settled.
export async function installCampaignM3A2(g,equipment,{narrative}) {
  const assets=await loadChapter3Assets(g.THREE)
  let personnel,sniperResources
  try {
    personnel=await loadChapter3PersonnelResources(g)
    sniperResources=await loadSniperResources(g,{characterResource:personnel.character})
  }catch(error){sniperResources?.dispose();personnel?.dispose();assets.dispose();throw error}
  g.campaignAssets.chapter3=assets;g.campaignAssets.buildChapter3Environment=buildChapter3Environment
  let checkpoint=null,pendingCheckpoint=true,retryRequested=false,resetting=false,rescue,clearance
  let progress={opening:false,central:false,west:false,repair:false}
  const active=()=>g.game.state==='playing'&&g.player.alive&&g.player.enabled!==false&&!narrative.snapshot().active
  const requestCheckpoint=()=>{if(!resetting)pendingCheckpoint=true}
  const map=installCampaignM1(g,equipment,{chapter1:true,chapter2:true,chapter3:true,
    objective:()=>rescue?.snapshot().objective||'六号泊位 · 穿过封锁，寻找维修室里的许工'})
  const supplies=installCampaignSupplies(g,{equipment,emit:()=>false})
  const sniper=installChapter3Sniper(g,{visual:createSniperVisual(g,sniperResources),narrative,onDefeated:requestCheckpoint})
  const worker=createWorkerVisual(g,personnel)
  rescue=installChapter3Rescue(g,{worker,narrative,onCheckpoint:requestCheckpoint,
    getBlockers:()=>CH3_RESCUE_BLOCKERS.map(id=>clearance?.members.find(m=>m.id===id)?.target.actor)})
  clearance=installChapter3Clearance(g,{createVisual:()=>createClearanceVisual(g,personnel),
    deployments:CH3_CLEARANCE_DEPLOYMENTS,narrative,onChange:requestCheckpoint,
    canEnter:(from,to)=>rescue.allowsEnemySegment(from,to)})
  const ammo=installChapter3Ammo(g,{equipment,narrative,getMembers:()=>clearance.members,onCheckpoint:requestCheckpoint})
  function saveCheckpoint(){
    if(!active())return
    checkpoint=JSON.parse(JSON.stringify({version:2,stage:'M3-A2',map:map.capture(),
      player:captureCampaignPlayer(g.player),runTime:g.game.run.time,equipment:equipment.capture(),
      supplies:supplies.snapshot(),sniper:sniper.capture(),clearance:clearance.capture(),rescue:rescue.capture(),ammo:ammo.capture(),progress}))
    pendingCheckpoint=false
  }
  function validateCheckpoint(saved){
    if(!saved)return
    if(saved.version!==2||saved.stage!=='M3-A2'||!Number.isFinite(saved.runTime)||saved.runTime<0||
      !saved.progress||Object.keys(progress).some(k=>typeof saved.progress[k]!=='boolean'))throw Error('Invalid M3-A2 checkpoint')
    validateCampaignPlayer(saved.player,g.player.maxHealth);equipment.validateCapture(saved.equipment)
    clearance.validateCapture(saved.clearance);rescue.validateCapture(saved.rescue);ammo.validateCapture(saved.ammo)
    if(saved.rescue.unlocked&&CH3_RESCUE_BLOCKERS.some(id=>saved.clearance.members.find(m=>m.id===id)?.alive))throw Error('Invalid rescue blockade checkpoint')
    for(const site of CH3_AMMO_SITES)if(site.group&&saved.ammo.consumed.includes(site.id)&&
      CH3_CLEARANCE_DEPLOYMENTS.filter(d=>d.group===site.group).some(d=>saved.clearance.members.find(m=>m.id===d.id).alive))throw Error('Invalid ammo blockade checkpoint')
  }
  function reset(){
    const retry=retryRequested,saved=retry?checkpoint:null;validateCheckpoint(saved);retryRequested=false;resetting=true
    try {
      map.reset(saved?.map);g.enemies.clear();g.game.run.queue.length=0
      // Door/world state precedes actor/player placement; reuse every instance.
      if(saved)rescue.restore(saved.rescue);else rescue.reset()
      clearance.reset(saved?.clearance);sniper.reset(saved?.sniper,{keepWarning:retry})
      if(saved)ammo.restore(saved.ammo);else ammo.reset()
      if(saved){restoreCampaignPlayer(g,saved.player);g.game.run.time=saved.runTime;equipment.restore(saved.equipment)}
      else {
        equipment.reset();const kit=equipment.capture()
        for(const id of ['rifle','pistol','knife']){kit.slots[id].owned=true;kit.pickupEnabled[id]=false}
        kit.activeWeapon='rifle';equipment.restore(kit);checkpoint=null
      }
      supplies.reset(saved?.supplies||{consumed:true,exitConsumed:true,flashlightOwned:true,on:false})
      progress=saved?{...saved.progress}:{opening:false,central:false,west:false,repair:false}
      pendingCheckpoint=!saved
    }finally{resetting=false}
  }
  function prepareReset(retry){retryRequested=!!retry&&g.game.state==='dead';if(retryRequested)validateCheckpoint(checkpoint);return retryRequested}
  function hints(){
    const p=g.player.pos
    const show=(key,condition,text)=>{if(!progress[key]&&condition){progress[key]=true;g.hud.message(text,5);requestCheckpoint();return true}return false}
    if(show('opening',true,'找到六号维修室 · 主路有成组封锁，货柜后方可绕行'))return
    if(show('repair',Math.hypot(p.x+36.9,p.z+142)<9,'维修室就在前方 · 解决门外封锁者，按 E 解除门锁'))return
    if(show('west',p.x<-30&&p.z>-181&&p.z<-151,'货柜通道仍有落单巡逻 · 利用转角遮挡，选择绕过或交火'))return
    show('central',p.x>-25&&p.z>-190&&p.z<-155,'装卸区封锁人员已在前方 · 利用掩体分段推进')
  }
  reset()
  document.querySelector('.m-premise').textContent='六号泊位：清除命令。中央装卸区有成组封锁，西侧货柜有独立巡逻，高塔狙击手仍在监视。选择路线接近维修室，突破门外封锁并找到许工。1 步枪 / 2 手枪 / 3 刀，Ctrl 蹲，Q 手电，E 互动。'
  return {world:map.world,sniper,clearance,rescue,ammo,worker,resources:personnel,reinforcementEnabled:false,prepareReset,reset,
    update(dt){
      map.update(dt);supplies.update(dt)
      if(active()){hints();if(pendingCheckpoint)saveCheckpoint()}
      sniper.update(dt);clearance.update(dt);rescue.update(dt);ammo.update(dt)
      if(pendingCheckpoint&&active())saveCheckpoint()
    },
    interact(dt){map.interact(dt);g.hud.setPrompt(null);if(!ammo.interact(dt))rescue.interact(dt);if(pendingCheckpoint&&active())saveCheckpoint()},
    snapshot:()=>({...map.snapshot(),stage:'M3-A2',sceneTrial:false,sniper:sniper.snapshot(),clearance:clearance.snapshot(),rescue:rescue.snapshot(),ammo:ammo.snapshot(),
      resources:personnel.snapshot(),flashlight:supplies.snapshot(),progress:{...progress},
      flags:{sniperDefeated:!sniper.target.actor.alive,survivorRescued:rescue.capture().rescued},
      checkpoint:checkpoint?JSON.parse(JSON.stringify(checkpoint)):null,ordinaryClearanceImplemented:true,chapter4Implemented:false}),
  }
}
