import { installCampaignM1 } from './campaign-m1.mjs'
import { installCampaignSupplies } from './campaign-supplies.mjs'
import { loadChapter3Assets } from './campaign-ch3-assets.mjs'
import { buildChapter3Environment } from './campaign-ch3-environment.mjs'
import { loadChapter4Assets } from './campaign-ch4-assets.mjs'
import { buildChapter4Environment } from './campaign-ch4-environment.mjs'
import { loadInfectedAsset } from './character-assets.mjs'
import { loadInfectedAudio } from './character-audio.mjs'
import { createChapter4InfectedDirector } from './campaign-ch4-infected.mjs'
import { installChapter4Clearance } from './campaign-ch4-clearance.mjs'
import { captureCampaignPlayer, validateCampaignPlayer, restoreCampaignPlayer } from './campaign-player-state.mjs'

// Independent A1 entry. The accepted A0 map and earlier chapter entries stay intact.
export async function installCampaignM4A1(g,equipment) {
  let chapter3,chapter4,asset,bank,map,infected,clearance
  try {
    chapter3=await loadChapter3Assets(g.THREE);chapter4=await loadChapter4Assets(g.THREE)
    asset=await loadInfectedAsset(g.THREE);bank=await loadInfectedAudio(g)
    Object.assign(g.campaignAssets,{chapter3,chapter4,buildChapter3Environment,buildChapter4Environment})
    map=installCampaignM1(g,equipment,{chapter1:true,chapter2:true,chapter3:true,chapter4:true,
      objective:()=>clearance?.objective()||'清除封锁区感染者：0/5'})
    infected=createChapter4InfectedDirector(g,{asset,bank})
    clearance=installChapter4Clearance(g,{members:infected.members})
  }catch(error){infected?.dispose();bank?.dispose();asset?.dispose();chapter4?.dispose();chapter3?.dispose();throw error}
  const supplies=installCampaignSupplies(g,{equipment,emit:()=>false})
  let entrySnapshot=null,retryRequested=false
  function validateEntry(saved) {
    if(!saved||saved.version!==1||saved.stage!=='M4-A1')throw Error('Invalid M4-A1 entry snapshot')
    validateCampaignPlayer(saved.player,g.player.maxHealth);equipment.validateCapture(saved.equipment)
  }
  function reset() {
    const saved=retryRequested?entrySnapshot:null
    if(retryRequested)validateEntry(saved)
    retryRequested=false
    map.reset(saved?.map);g.enemies.clear();g.game.run.queue.length=0
    if(saved){restoreCampaignPlayer(g,saved.player);g.game.run.time=saved.runTime;equipment.restore(saved.equipment)}
    else {
      g.player.reset(g.level.playerStart);equipment.reset()
      const kit=equipment.capture()
      for(const id of ['rifle','pistol','knife']){kit.slots[id].owned=true;kit.pickupEnabled[id]=false}
      kit.activeWeapon='rifle';equipment.restore(kit)
    }
    supplies.reset(saved?.supplies||{consumed:true,exitConsumed:true,flashlightOwned:true,on:false})
    infected.reset();clearance.reset()
    // Capture once at the chapter entrance; kills/interactions never move this anchor.
    if(!saved)entrySnapshot=JSON.parse(JSON.stringify({version:1,stage:'M4-A1',map:map.capture(),
      player:captureCampaignPlayer(g.player),runTime:g.game.run.time,equipment:equipment.capture(),supplies:supplies.snapshot()}))
  }
  function prepareReset(retry) {
    retryRequested=!!retry&&g.game.state==='dead'
    if(retryRequested)validateEntry(entrySnapshot)
    return true
  }
  reset()
  document.querySelector('.m-premise').textContent='封锁区感染者清理：长廊内有五只感染者，全部清除后才能解除控制台锁定。1 步枪 / 2 手枪 / 3 刀，Shift 跑，Ctrl 蹲，Q 手电，E 检查控制台。死亡后从第四章入口重新开始。本次试玩止于控制台解锁。'
  return {world:map.world,infected,clearance,reinforcementEnabled:false,prepareReset,reset,
    update(dt){map.update(dt);supplies.update(dt);infected.update(dt)},
    interact(dt){map.interact(dt);clearance.interact()},
    snapshot:()=>({...map.snapshot(),stage:'M4-A1',sceneTrial:false,infected:infected.snapshot(),clearance:clearance.snapshot(),
      entrySnapshot:JSON.parse(JSON.stringify(entrySnapshot)),flashlight:supplies.snapshot(),
      hackingImplemented:false,doorOpeningImplemented:false,storyImplemented:false}),
  }
}
