import { installCampaignM1 } from './campaign-m1.mjs'
import { installCampaignSupplies } from './campaign-supplies.mjs'
import { loadChapter3Assets } from './campaign-ch3-assets.mjs'
import { buildChapter3Environment } from './campaign-ch3-environment.mjs'
import { loadChapter4Assets } from './campaign-ch4-assets.mjs'
import { buildChapter4Environment } from './campaign-ch4-environment.mjs'
import { CH4 } from './campaign-ch4-layout.mjs'
import { installChapter4Interactions } from './campaign-ch4-interactions.mjs'

// The separate scene trial preserves the accepted CH1–CH3 entries and CH4 seams.
export async function installCampaignM4A0(g, equipment) {
  const chapter3=await loadChapter3Assets(g.THREE)
  let chapter4,map
  try {
    chapter4=await loadChapter4Assets(g.THREE)
    Object.assign(g.campaignAssets,{chapter3,chapter4,buildChapter3Environment,buildChapter4Environment})
    map=installCampaignM1(g,equipment,{chapter1:true,chapter2:true,chapter3:true,chapter4:true,
      objective:()=> 'M4-A0 第七区地图试玩 · 检查长廊、控制台与关闭安全门'})
  } catch(error){chapter3.dispose();chapter4?.dispose();throw error}
  const supplies=installCampaignSupplies(g,{equipment,emit:()=>false})
  const inspections=installChapter4Interactions(g,CH4)
  function reset() {
    map.reset();equipment.reset()
    for(const id of ['rifle','pistol','knife'])equipment.setPickupEnabled(id,false)
    g.enemies.clear();g.game.run.queue.length=0
    supplies.reset({consumed:true,exitConsumed:true,flashlightOwned:true,on:false})
    inspections.reset()
  }
  reset()
  document.querySelector('.m-premise').textContent='第七区地图试玩：绕过交错箱体与中央斜箱，抵达直廊末端的控制台、服务器与关闭安全门。WASD 移动，Shift 跑，Ctrl 蹲，E 检查控制台，Q 手电。本阶段无敌人和正式剧情，门旁保留弹药补给位置。'
  return {world:map.world,reinforcementEnabled:false,prepareReset:()=>true,reset,
    update(dt){map.update(dt);supplies.update(dt)},
    interact(dt){map.interact(dt);inspections.interact()},
    snapshot:()=>({...map.snapshot(),stage:'M4-A0',sceneTrial:true,aiImplemented:false,storyImplemented:false,
      hackingImplemented:false,doorOpeningImplemented:false,inspections:inspections.snapshot(),flashlight:supplies.snapshot()})}
}
