import { installCampaignM1 } from './campaign-m1.mjs'
import { installCampaignSupplies } from './campaign-supplies.mjs'
import { loadChapter3Assets } from './campaign-ch3-assets.mjs'
import { buildChapter3Environment } from './campaign-ch3-environment.mjs'
import { loadSniperResources, createSniperVisual } from './campaign-ch3-sniper-visual.mjs'
import { installChapter3Sniper } from './campaign-ch3-sniper.mjs'
import { captureCampaignPlayer, validateCampaignPlayer, restoreCampaignPlayer } from './campaign-player-state.mjs'

// Isolated CH3 combat trial on the accepted M3-A0 world. No ordinary clearance
// actors or later chapter progression. Native game.start/keepRetries owns reset.
export async function installCampaignM3A1(g,equipment,{narrative}) {
  const assets=await loadChapter3Assets(g.THREE)
  let resources
  try{resources=await loadSniperResources(g)}catch(error){assets.dispose();throw error}
  g.campaignAssets.chapter3=assets;g.campaignAssets.buildChapter3Environment=buildChapter3Environment
  let checkpoint=null,pendingCheckpoint=true,retryRequested=false,sniper
  const map=installCampaignM1(g,equipment,{chapter1:true,chapter2:true,chapter3:true,
    objective:()=>sniper?.target.actor.alive?'六号泊位 · 利用掩体避开瞭望塔，或反击狙击手':'狙击手已击倒 · 六号泊位狙击试玩完成'})
  const supplies=installCampaignSupplies(g,{equipment,emit:()=>false})
  sniper=installChapter3Sniper(g,{visual:createSniperVisual(g,resources),narrative,onDefeated(){pendingCheckpoint=true}})
  function saveCheckpoint(){
    if(!g.player.alive)return
    checkpoint=JSON.parse(JSON.stringify({version:1,stage:'M3-A1',map:map.snapshot().state,
      player:captureCampaignPlayer(g.player),runTime:g.game.run.time,equipment:equipment.capture(),
      supplies:supplies.snapshot(),sniper:sniper.capture(),flags:{sniperDefeated:!sniper.target.actor.alive}}))
    pendingCheckpoint=false
  }
  function validateCheckpoint(saved){
    if(!saved)return
    if(saved.version!==1||saved.stage!=='M3-A1'||!Number.isFinite(saved.runTime)||saved.runTime<0||
      saved.flags.sniperDefeated!==!saved.sniper.alive)throw Error('Invalid M3-A1 checkpoint')
    validateCampaignPlayer(saved.player,g.player.maxHealth);equipment.validateCapture(saved.equipment)
  }
  function reset(){
    const retry=retryRequested,saved=retry?checkpoint:null;validateCheckpoint(saved);retryRequested=false
    map.reset(saved?.map);g.enemies.clear();g.game.run.queue.length=0
    if(saved){restoreCampaignPlayer(g,saved.player);g.game.run.time=saved.runTime;equipment.restore(saved.equipment)}
    else {
      equipment.reset();const kit=equipment.capture()
      for(const id of ['rifle','pistol','knife']){kit.slots[id].owned=true;kit.pickupEnabled[id]=false}
      kit.activeWeapon='pistol';equipment.restore(kit)
      if(!retry)checkpoint=null
    }
    supplies.reset(saved?.supplies||{consumed:true,exitConsumed:true,flashlightOwned:true,on:false})
    sniper.reset(saved?.sniper,{keepWarning:retry});pendingCheckpoint=!saved
  }
  function prepareReset(retry){
    retryRequested=!!retry&&g.game.state==='dead'
    if(retryRequested)validateCheckpoint(checkpoint)
    return retryRequested
  }
  reset()
  document.querySelector('.m-premise').textContent='六号泊位狙击试玩：看见镜片反光、听到警示音后，利用实体掩体、横移、蹲伏或西侧绕路避开射击。每次真实命中 40 HP。1 步枪 / 2 手枪 / 3 刀，Q 手电。'
  return {world:map.world,sniper,reinforcementEnabled:false,prepareReset,reset,
    update(dt){
      map.update(dt);supplies.update(dt)
      if(pendingCheckpoint&&g.game.state==='playing'&&g.player.alive&&!narrative.snapshot().active)saveCheckpoint()
      sniper.update(dt)
      if(pendingCheckpoint&&g.game.state==='playing'&&g.player.alive&&!narrative.snapshot().active)saveCheckpoint()
    },
    interact(dt){map.interact(dt);g.hud.setPrompt(null)},
    snapshot:()=>({...map.snapshot(),stage:'M3-A1',sceneTrial:false,sniper:sniper.snapshot(),
      flashlight:supplies.snapshot(),flags:{sniperDefeated:!sniper.target.actor.alive},checkpoint:checkpoint?JSON.parse(JSON.stringify(checkpoint)):null,
      ordinaryClearanceImplemented:false,chapter4Implemented:false}),
  }
}
