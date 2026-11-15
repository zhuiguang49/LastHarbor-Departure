// Campaign mission facts only. Runtime adapters validate physical actions; equipment
// owns ammunition. Sector observations never stand in for these real events.
const objectives = [
  ['pistol-acquired', 'pistolOwned', '搜索五号泊位安保亭 · 取得 P12 手枪'],
  ['guard-requested', 'guardRequested', '使用求援面板 · 呼叫机械守卫'],
  ['guard-scanning', 'guardScanning', '等待机械守卫扫描'],
  ['guard-warning', 'guardWarning', '注意守卫识别警告 · 寻找掩体'],
  ['guard-hostile', 'guardBetrayalSeen', '进入掩体 · 躲避机械守卫攻击'],
  ['ambush-resolved', 'robotAmbushResolved', '击退清除巡逻或使用隔离开关'],
  ['power-stable', 'power5Stable', '恢复五号泊位应急供电'],
  ['supplies-acquired', 'suppliesAcquired', '前往五号仓库深处 · 领取手电与弹药补给'],
  ['maintenance-open', 'corridorAccessOpen', '打开通往黑箱堆场的维护门'],
  ['blackbox-entered', 'blackboxEntered', '穿过维护门 · 进入黑箱堆场'],
]
const chapter2Flags = ['chapter2Entered','chapter2IntroRead','chapter2IntroSkipped','exitAmmoHintHandled',
  'echoLaneEntered','safeRoomHintShown','safeAVisited','safeBVisited','safeCVisited','berth6Reached']
const chapter3Flags = ['chapter3Entered','chapter3IntroRead','chapter3IntroSkipped','sniperThreatResolved',
  'survivorRescued','survivorContacted','testimonyHeard','accessCredentialObtained','chapter3Completed']
const chapter4Flags = ['chapter4Entered','chapter4IntroRead','chapter4IntroSkipped','blockadeInfectedCleared',
  'p07Read','gateOverrideStarted','gateOverrideAccepted','gatePhysicallyOpen','chapter4Completed']
const chapter5Flags = ['chapter5Entered','chapter5IntroRead','chapter5IntroSkipped','power7Stable',
  'warehouseInitializationStarted','warehouseUnlocked','warehousePhysicallyOpen',
  'chapter5Boarded','chapter5Completed','campaignCompleted']

function chapter3Objective(flags) {
  return !flags.chapter3IntroRead ? '第三章 · 六号泊位：清除命令' :
    !flags.survivorRescued ? '寻找掩体 · 避开狙击手 · 推进或绕行至维修室' :
      !flags.testimonyHeard || !flags.accessCredentialObtained ? '按 E 与许工交谈 · 手动翻页听取证词' :
        '携带许工的通行凭据 · 前往第七区控制廊道'
}

function chapter4Objective(flags) {
  return !flags.chapter4IntroRead ? '第四章 · 封锁线：第七区控制中心' :
    !flags.blockadeInfectedCleared ? '清除封锁区感染者' :
      !flags.gateOverrideStarted ? '封锁区已清理 · 前往安全门控制台' :
        !flags.gateOverrideAccepted ? '权限覆盖进行中 · 守住控制台' :
          '通过正在开启的安全门 · 前往七号泊位'
}

function mission(state) {
  const next = objectives.find(([, flag]) => !state.flags[flag])
  const remaining = [!state.flags.rifleOwned && '步枪', !state.flags.knifeOwned && '匕首',
    !state.flags.suppliesAcquired && '手电与弹药补给'].filter(Boolean)
  const objective = state.status === 'failed' ? '行动失败 · 从本章起点重试或开始新局' :
    state.status === 'completed' ? (state.currentChapter === 'CH5' ? '第五章完成 · 已离开紫金港' :
      state.currentChapter === 'CH4' ? '第四章完成 · 已通过安全门' :
      state.currentChapter === 'CH3' ? '第三章完成 · 已进入第七区控制廊道' :
      state.currentChapter === 'CH2' ? '第二章完成 · 已抵达六号泊位' : '第一章完成 · 进入黑箱堆场') :
      state.currentChapter === 'CH5' ? (state.flags.chapter5Boarded ? '工作艇正在离港' : '七号泊位 · 恢复中央应急供电并进入仓库') :
      state.currentChapter === 'CH4' ? chapter4Objective(state.flags) :
      state.currentChapter === 'CH3' ? chapter3Objective(state.flags) :
      state.currentChapter === 'CH2' ? (state.flags.chapter2IntroRead ? '穿过黑箱货道与应急安全室 · 前往六号泊位' : '第二章 · 黑箱堆场：没有灯的路') :
      state.flags.power5Stable && remaining.length ? `前往五号仓库深处 · 领取${remaining.join('、')}` : next[2]
  return Object.freeze({ ...state, flags: Object.freeze(state.flags), objective })
}

export function createCampaignState() {
  return mission({ currentChapter: 'CH1', status: 'active', ambushResolution: null, sniperResolution: null,
    flags: { ...Object.fromEntries([...objectives.map(([, flag]) => flag),...chapter2Flags,...chapter3Flags,...chapter4Flags,...chapter5Flags].map(flag => [flag, false])),
      flashlightOwned: false, rifleOwned: false, knifeOwned: false } })
}

/** Pure ordered reducer. Ignored, duplicate and premature events return the
 * same state; they are never queued for later replay. Payloads live on the event:
 * {type:'ambush-resolved', method:'combat'|'isolation'},
 * {type:'supplies-acquired', ammo:true, flashlight:true},
 * {type:'equipment-acquired', id:'rifle'|'knife'}. Warehouse pickups after power
 * are independent; supplies are accepted before either weapon. The physical
 * maintenance-open event requires all three acquisitions, in any order.
 * maintenance-open means collision has actually opened; blackbox-entered means
 * the adapter observed a real crossing after that opening, not sector presence.
 * CH3 begins only after the historical berth6-entered completion. Its opening
 * requires {type:'chapter3-intro-read', skipped:boolean}. Sniper resolution uses
 * {type:'sniper-threat-resolved', method:'defeated'|'suppressed'|'bypassed'}.
 * The adapter validates the real worker-rescued and chapter3-exited actions;
 * only worker-testimony-completed grants testimony and credentials together.
 * CH4 requires CH3 completion and its credential. The adapter validates all five
 * infected deaths, the override duration and the physical gate crossing. P-07
 * reading may survive entry retry before clearance, but never starts the override.
 * An accepted chapter4-exited also records physical clearance while the door rises.
 * CH5 boarding requires the runtime's fuelReady/boatGateOpen proof in addition
 * to chapter facts. Only chapter5-ending-finished with fadeComplete:true grants
 * the final chapter and campaign completion after the timed departure sequence.
 */
export function applyCampaignEvent(state, event) {
  if (event?.type === 'chapter5-crossed' && state.currentChapter === 'CH4' && state.status !== 'failed' &&
    state.flags.chapter4Completed && state.flags.accessCredentialObtained && !state.flags.chapter5Entered) {
    return mission({ ...state,currentChapter:'CH5',status:'active',flags:{ ...state.flags,chapter5Entered:true } })
  }
  if (event?.type === 'chapter4-crossed' && state.currentChapter === 'CH3' && state.status !== 'failed' &&
    state.flags.chapter3Completed && state.flags.accessCredentialObtained && !state.flags.chapter4Entered) {
    return mission({ ...state, currentChapter:'CH4', status:'active', flags:{ ...state.flags,chapter4Entered:true } })
  }
  if (event?.type === 'chapter3-crossed' && state.status !== 'failed' && state.flags.berth6Reached &&
    !state.flags.chapter3Entered) {
    return mission({ ...state, currentChapter:'CH3', status:'active', flags:{ ...state.flags,chapter3Entered:true } })
  }
  if (event?.type === 'chapter2-crossed' && state.status !== 'failed' && !state.flags.chapter2Entered &&
    state.flags.power5Stable && state.flags.suppliesAcquired && state.flags.rifleOwned && state.flags.knifeOwned) {
    return mission({ ...state, currentChapter:'CH2', status:'active', flags:{ ...state.flags,chapter2Entered:true } })
  }
  if (event?.type === 'sniper-threat-resolved' && state.currentChapter === 'CH3' &&
    state.status !== 'failed' && state.flags.chapter3IntroRead) {
    if (!['defeated','suppressed','bypassed'].includes(event.method) ||
      state.flags.sniperThreatResolved && (state.sniperResolution === 'defeated' || event.method !== 'defeated')) return state
    return mission({ ...state,sniperResolution:event.method,flags:{ ...state.flags,sniperThreatResolved:true } })
  }
  if (state.status !== 'active') return state
  if (state.currentChapter === 'CH5') {
    if (['chapter5-boarded','chapter5-ending-finished'].includes(event?.type)) {
      if (!['blackboxEntered','berth6Reached','chapter3Completed','chapter4Completed','accessCredentialObtained',
        'chapter5Entered','chapter5IntroRead','power7Stable','warehouseInitializationStarted','warehouseUnlocked',
        'warehousePhysicallyOpen'].every(flag=>state.flags[flag])) return state
      if (event.type === 'chapter5-boarded') {
        if (state.flags.chapter5Boarded || event.fuelReady !== true || event.boatGateOpen !== true) return state
        return mission({ ...state,flags:{ ...state.flags,chapter5Boarded:true } })
      }
      if (!state.flags.chapter5Boarded || event.fadeComplete !== true) return state
      return mission({ ...state,status:'completed',flags:{ ...state.flags,chapter5Completed:true,campaignCompleted:true } })
    }
    if (event?.type === 'chapter5-intro-read' && !state.flags.chapter5IntroRead && typeof event.skipped === 'boolean')
      return mission({ ...state,flags:{ ...state.flags,chapter5IntroRead:true,chapter5IntroSkipped:event.skipped } })
    if (!state.flags.chapter5IntroRead) return state
    const steps = [['power7-stable','power7Stable'],['warehouse-initialization-started','warehouseInitializationStarted'],
      ['warehouse-unlocked','warehouseUnlocked'],['warehouse-physically-open','warehousePhysicallyOpen']]
    const index=steps.findIndex(([type])=>type===event?.type)
    if(index<0||state.flags[steps[index][1]]||index>0&&!state.flags[steps[index-1][1]])return state
    return mission({ ...state,flags:{ ...state.flags,[steps[index][1]]:true } })
  }
  if (state.currentChapter === 'CH4') {
    if (!state.flags.chapter4Entered) return state
    if (event?.type === 'chapter4-intro-read' && !state.flags.chapter4IntroRead && typeof event.skipped === 'boolean') {
      return mission({ ...state,flags:{ ...state.flags,chapter4IntroRead:true,chapter4IntroSkipped:event.skipped } })
    }
    if (!state.flags.chapter4IntroRead) return state
    const flag = { 'ch4-infected-cleared':'blockadeInfectedCleared', 'p07-read':'p07Read',
      'gate-override-started':'gateOverrideStarted', 'gate-override-accepted':'gateOverrideAccepted',
      'gate-physically-open':'gatePhysicallyOpen' }[event?.type]
    if (typeof flag === 'string') {
      if (state.flags[flag] || flag === 'gateOverrideStarted' && (!state.flags.blockadeInfectedCleared || !state.flags.p07Read) ||
        flag === 'gateOverrideAccepted' && !state.flags.gateOverrideStarted ||
        flag === 'gatePhysicallyOpen' && !state.flags.gateOverrideAccepted) return state
      return mission({ ...state,flags:{ ...state.flags,[flag]:true } })
    }
    if (event?.type === 'chapter4-exited' && state.flags.gateOverrideAccepted) {
      return mission({ ...state,status:'completed',flags:{ ...state.flags,gatePhysicallyOpen:true,chapter4Completed:true } })
    }
    return state
  }
  if (state.currentChapter === 'CH3') {
    if (event?.type === 'chapter3-intro-read' && !state.flags.chapter3IntroRead && typeof event.skipped === 'boolean') {
      return mission({ ...state,flags:{ ...state.flags,chapter3IntroRead:true,chapter3IntroSkipped:event.skipped } })
    }
    if (!state.flags.chapter3IntroRead) return state
    if (event?.type === 'worker-rescued' && !state.flags.survivorRescued) {
      return mission({ ...state,flags:{ ...state.flags,survivorRescued:true,survivorContacted:true } })
    }
    if (event?.type === 'worker-testimony-completed' && state.flags.survivorRescued && !state.flags.testimonyHeard) {
      return mission({ ...state,flags:{ ...state.flags,testimonyHeard:true,accessCredentialObtained:true } })
    }
    if (event?.type === 'chapter3-exited' && state.flags.sniperThreatResolved && state.flags.survivorRescued &&
      state.flags.testimonyHeard && state.flags.accessCredentialObtained) {
      return mission({ ...state,status:'completed',flags:{ ...state.flags,chapter3Completed:true } })
    }
    return state
  }
  if (state.currentChapter === 'CH2') {
    if (event?.type === 'chapter2-intro-read' && !state.flags.chapter2IntroRead && typeof event.skipped === 'boolean') {
      return mission({ ...state,flags:{ ...state.flags,chapter2IntroRead:true,chapter2IntroSkipped:event.skipped } })
    }
    const flag = { 'exit-ammo-hint-handled':'exitAmmoHintHandled', 'echo-lane-entered':'echoLaneEntered',
      'safe-room-hint-shown':'safeRoomHintShown', 'safe-a-entered':'safeAVisited', 'safe-b-entered':'safeBVisited',
      'safe-c-entered':'safeCVisited', 'berth6-entered':'berth6Reached' }[event?.type]
    if (flag) {
      if (!state.flags.chapter2IntroRead || state.flags[flag] ||
        flag === 'safeRoomHintShown' && (!state.flags.echoLaneEntered || !state.flags.exitAmmoHintHandled) ||
        flag === 'berth6Reached' && (!state.flags.blackboxEntered || !state.flags.safeCVisited)) return state
      return mission({ ...state,status:flag === 'berth6Reached' ? 'completed' : state.status,flags:{ ...state.flags,[flag]:true } })
    }
  }
  if (event?.type === 'equipment-acquired') {
    if (!state.flags.power5Stable || !['rifle', 'knife'].includes(event.id)) return state
    const flag = `${event.id}Owned`
    return state.flags[flag] ? state : mission({ ...state, flags: { ...state.flags, [flag]: true } })
  }
  const next = objectives.find(([, flag]) => !state.flags[flag])
  if (!next) return state
  const [type, flag] = next
  if (event?.type !== type) return state
  if (type === 'ambush-resolved' && !['combat', 'isolation'].includes(event.method)) return state
  if (type === 'supplies-acquired' && (event.ammo !== true || event.flashlight !== true)) return state
  if (type === 'maintenance-open' && (!state.flags.suppliesAcquired || !state.flags.flashlightOwned ||
    !state.flags.rifleOwned || !state.flags.knifeOwned)) return state
  return mission({ ...state,
    status: type === 'blackbox-entered' && state.currentChapter === 'CH1' ? 'completed' : 'active',
    ambushResolution: type === 'ambush-resolved' ? event.method : state.ambushResolution,
    flags: { ...state.flags, [flag]: true,
      flashlightOwned: state.flags.flashlightOwned || type === 'supplies-acquired' } })
}

export function failCampaignState(state) {
  return state.status === 'active' ? mission({ ...state, status: 'failed', flags: { ...state.flags } }) : state
}
