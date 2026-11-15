import { installCampaignM1 } from './campaign-m1.mjs'
import { installCampaignSupplies } from './campaign-supplies.mjs'
import { loadChapter3Assets } from './campaign-ch3-assets.mjs'
import { buildChapter3Environment } from './campaign-ch3-environment.mjs'

// Scene trial only. Same native world, player, lighting pool and game loop;
// no chapter director, combat actors, checkpoint awards or story completion.
export async function installCampaignM3A0(g, equipment) {
  const assets = await loadChapter3Assets(g.THREE)
  g.campaignAssets.chapter3 = assets
  g.campaignAssets.buildChapter3Environment = buildChapter3Environment
  let map
  try {
    map = installCampaignM1(g, equipment, { chapter1: true, chapter2: true, chapter3: true,
      objective: () => 'M3-A0 六号场景试玩 · 主路 / 西侧绕路 / 维修安全屋 · Q 手电' })
  } catch (error) { assets.dispose(); throw error }
  const supplies = installCampaignSupplies(g, { equipment, emit: () => false })
  function reset() {
    map.reset()
    equipment.reset()
    for (const id of ['rifle', 'pistol', 'knife']) equipment.setPickupEnabled(id, false)
    g.enemies.clear()
    g.game.run.queue.length = 0
    supplies.reset({ consumed: true, exitConsumed: true, flashlightOwned: true, on: false })
  }
  reset()
  document.querySelector('.m-premise').textContent = '六号泊位场景试玩：从第二章出口直接进入，检查工业主路、西侧绕路、钢制瞭望塔和可进入的维修安全屋。WASD 移动，Shift 跑，Ctrl 蹲，Q 手电。'
  return { world: map.world, reinforcementEnabled: false, prepareReset: () => true, reset,
    update(dt) { map.update(dt); supplies.update(dt) },
    interact(dt) { map.interact(dt); g.hud.setPrompt(null) },
    snapshot: () => ({ ...map.snapshot(), stage: 'M3-A0', sceneTrial: true,
      aiImplemented: false, storyImplemented: false, flashlight: supplies.snapshot() }),
  }
}
