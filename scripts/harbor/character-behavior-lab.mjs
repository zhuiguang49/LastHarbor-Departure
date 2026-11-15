import { installCampaignM1 } from './campaign-m1.mjs'
import { installCampaignSupplies } from './campaign-supplies.mjs'
import { CH2_SPAWNS, CH2_SECTIONS, CH2_SAFE_ZONES } from './campaign-ch2-layout.mjs'
import { INFECTED_SOURCE, loadInfectedAsset } from './character-assets.mjs'
import { createCharacterAnimation } from './character-animation.mjs'
import { loadInfectedAudio } from './character-audio.mjs'
import { INFECTED_CLIPS, INFECTED_CLIP_SOURCE_SHA } from './character-clips.mjs'
import { installCharacterTarget } from './character-native-target.mjs'
import { createChapter2Infected, CH2_INFECTED_TUNING } from './campaign-ch2-infected.mjs'
import { createChapter2InfectedDirector } from './campaign-ch2-director.mjs'

// Diagnostic deployment in the real CH2 world. One actor, one section or all 36;
// resets/equipment grants are recorded and never count as campaign progress.
export async function installCharacterBehaviorLab(g,equipment,{sectionId=null}={}) {
  const full=sectionId==='ch2.full',section=sectionId===null||full?null:CH2_SECTIONS.find(section=>section.id===sectionId)
  if(sectionId!==null && !full && !section)throw Error(`Invalid infected trial section: ${sectionId}`)
  if(INFECTED_SOURCE.sha256!==INFECTED_CLIP_SOURCE_SHA)throw Error('Infected mapping/source mismatch')
  const T=g.THREE,spawn=CH2_SPAWNS[0],asset=await loadInfectedAsset(T)
  const label=full?'全章三十六只连续试玩':section?`${section.name} · 十二只追逐试玩`:'单只感染者行为试玩'
  let bank
  try{bank=await loadInfectedAudio(g)}catch(error){asset.dispose();throw error}
  const map=installCampaignM1(g,equipment,{chapter1:true,chapter2:true,
    objective:()=> `${label} · 正常伤害 · G 测试装备 · Q 手电 · P 反馈面板`})
  const supplies=installCampaignSupplies(g,{equipment,emit:()=>false})
  let director,instance,animation,voice,target,ai
  if(section||full)director=createChapter2InfectedDirector(g,{sectionId:full?null:sectionId,asset,bank})
  else {
    instance=asset.createInstance({height:1.8});animation=createCharacterAnimation(T,instance,asset);voice=bank.createVoice()
    target=installCharacterTarget(g,instance,{animation,clipFor:role=>INFECTED_CLIPS[role]?.index,onStop:()=>voice.stop()})
    target.actor.id=spawn.id;instance.root.name=spawn.id;g.scene.add(instance.root)
    instance.root.position.set(spawn.position.x,spawn.position.y,spawn.position.z)
    ai=createChapter2Infected(g,{spawn,instance,animation,target,voice})
  }
  const members=director?.members??[{spawn,instance,animation,voice,target,ai}]
  const initialActorHealth=members[0].target.actor.hp,trackerCount=members.filter(member=>member.spawn.omniscientTracking).length
  const startRoom=sectionId==='ch2.s2'?CH2_SAFE_ZONES[0]:sectionId==='ch2.s3'?CH2_SAFE_ZONES[1]:null
  const start=startRoom?.entrances[0].outside??{x:-56.5,y:0,z:-285.5}
  g.level.playerStart={pos:new T.Vector3(start.x,start.y,start.z),yaw:startRoom?Math.PI:Math.PI/2}
  const records=[],trajectory=[],rounds=[]
  let elapsed=0,round=0,disposed=false
  const record=(type,data={})=>{records.push({type,time:g.game.run.time,round,...data});if(records.length>256)records.shift()}
  const point=p=>p?.toArray?.()??null
  const names={WANDER:'游荡',ALERT:'警觉',CHASE:'追逐',INVESTIGATE:'调查声源/失联点',SEARCH:'搜索',ATTACK:'攻击',STAGGER:'受击',DEAD:'死亡'}
  const panel=document.createElement('aside'),status=document.createElement('div'),controls=document.createElement('div'),style=document.createElement('style')
  panel.className='harbor-behavior-lab';panel.setAttribute('aria-label',label)
  status.className='body-5';controls.className='harbor-behavior-controls';panel.append(status,controls)
  style.textContent=`.harbor-behavior-lab{position:fixed;right:16px;top:80px;z-index:90;width:min(320px,calc(100vw - 32px));max-height:calc(100vh - 96px);overflow:auto;padding:16px;border:1px solid var(--line);background:var(--plate-solid);color:var(--bone);font:400 14px/20px var(--f-label)}
    .harbor-behavior-lab .body-5{font:inherit;white-space:pre-line}.harbor-behavior-controls{display:grid;gap:8px;margin-top:16px}.harbor-behavior-controls .btn{padding:8px 12px;white-space:normal}
    .harbor-behavior-controls :focus-visible{outline:2px solid var(--signal);outline-offset:2px}.harbor-behavior-lab[data-playing="true"]{pointer-events:none;background:var(--plate)}.harbor-behavior-lab[data-playing="true"] .harbor-behavior-controls{display:none}`
  document.head.append(style);document.body.append(panel)
  function button(text,action){const b=document.createElement('button');b.type='button';b.className='btn small';b.textContent=text;b.addEventListener('click',action);controls.append(b)}
  function grantEquipment() {
    if(!g.player.alive)return
    const saved=equipment.capture();saved.activeWeapon='pistol'
    for(const [id,slot]of Object.entries(saved.slots)){
      slot.owned=true;slot.ammo=id==='rifle'?40:id==='pistol'?12:0;slot.reserve=id==='rifle'?160:id==='pistol'?48:0
      saved.pickupEnabled[id]=false
    }
    equipment.restore(saved);record('diagnostic-equipment-grant');refresh()
  }
  function roundSnapshot(){return {round,...(director?{director:director.snapshot(),targets:members.map(member=>member.target.snapshot())}:
    {ai:ai.snapshot(),target:target.snapshot(),animation:animation.snapshot(),audio:voice.snapshot()}),
    player:{position:g.player.pos.toArray(),health:g.player.health,alive:g.player.alive},equipment:equipment.capture(),
    records:records.map(event=>({...event})),trajectory:trajectory.map(sample=>({...sample}))}}
  function resetActor() {
    if(round){rounds.push(roundSnapshot());if(rounds.length>3)rounds.shift()}
    round++;records.length=trajectory.length=0
    if(director){director.reset();record('diagnostic-section-reset',{sectionId,spawnIds:members.map(member=>member.spawn.id)})}
    else {
      target.reset();instance.root.position.set(spawn.position.x,spawn.position.y,spawn.position.z)
      instance.root.rotation.y=Math.PI/2
      animation.playClip(INFECTED_CLIPS.Idle.index,{loop:true,fade:0,restart:true})
      ai.reset();record('diagnostic-actor-reset',{spawnId:spawn.id,position:instance.root.position.toArray()})
    }
    refresh()
  }
  button('配发测试装备 · G',grantEquipment)
  const resetLabel=full?'全章三十六只':section?'本段十二只':'单体'
  button(`重置${resetLabel}至原部署点 · N`,resetActor)
  button('导出行为与命中反馈',()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'})),a=document.createElement('a')
    a.href=url;a.download=full?'last-harbor-b1b-full-feedback.json':section?`last-harbor-b1b-twelve-pressure-${sectionId.slice(-2)}-feedback.json`:'last-harbor-b1b-single-feedback.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  })
  const help=document.createElement('p');help.className='body-5'
  const hints={
    'ch2.full':'从五号连接口连续穿过三段，抵达六号后可原路返回。留意远处追兵能否跨段赶来、受伤或死亡是否保持，以及转角拥堵和卡顿。',
    'ch2.s1':'穿过两处 S 弯，试走近引敌、蹲伏绕过和后撤；观察多只相遇时是否重叠或堵死退路。',
    'ch2.s2':'分别走主货道与西侧维护路，比较遮挡和遭遇；引来后绕箱甩开，再返回检查击杀是否保持。',
    'ch2.s3':'通过连续转角抵达六号出口，试潜行与被发现后撤退；留意出口拥堵及是否有反应机会。',
  }
  help.textContent=`WASD 移动 · Shift 跑 · Ctrl 蹲\nQ 手电（空手 / 手枪）· G 测试装备\n1 步枪 / 2 手枪 / 3 匕首 · R 换弹\nP 暂停 / 返回 · N 重置${resetLabel}\n\n${hints[sectionId]??'先从背后走近或慢蹲，观察脚步反应；再绕到正面站立、隔箱甩开、后退躲扑击，试受击和死亡停攻。'}\n\n锁定后超过 ${CH2_INFECTED_TUNING.sprintDistance}m 以 ${CH2_INFECTED_TUNING.sprintSpeed}m/s 追赶；近身 ${CH2_INFECTED_TUNING.chaseSpeed}m/s，攻击起手即判定。观察受击继续前进${director?`、转角露出和 ${trackerCount} 只首攻前静音追踪者的近身压力`:''}。正常伤害；死亡使用原重试按钮。N 是诊断重置，三间安全室尚无防敌功能。`
  controls.append(help)
  function refresh() {
    panel.hidden=!['playing','paused','dead'].includes(g.game.state);panel.dataset.playing=String(g.game.state==='playing')
    const lines=director&&g.game.state==='playing'?[]:members.map(member=>{
      const state=member.ai.snapshot(),distance=g.player.pos.distanceTo(member.instance.root.position)
      return `${member.spawn.id} · ${names[state.state]||state.state}${state.pursuit?`/${state.pursuit.phase==='far'?'远追':'近身'} ${state.pursuit.nominalSpeed}m/s`:''} · HP ${member.target.actor.hp} · ${distance.toFixed(1)}m${member.spawn.omniscientTracking?state.silent?' · 静音追踪':' · 追踪者已起手':''}`
    })
    const scheduling=full&&g.game.state!=='playing'?director.snapshot():null
    status.textContent=`B1-B ${label}\n初始 ${initialActorHealth} HP${director?` · ${members.length-trackerCount} 普通 / ${trackerCount} 追踪者`:''}\n${scheduling?`活动 ${scheduling.awakeCount} · 休眠 ${scheduling.sleepCount} · 死亡 ${scheduling.deadCount}\n`:''}${lines.length?lines.join('\n')+'\n':''}玩家 HP ${Math.ceil(g.player.health)}\n普通感知：脚步 ≤10m · 枪声 ≤25m\nG 测试装备 · Q 手电 · P 反馈面板`
  }
  const onState=({state})=>{
    if(state==='intro'){window.__lastHarborNarrative.skip();return}
    record('game-state',{state});refresh()
  }
  const onHit=()=>record('player-hit',{health:g.player.health,position:g.player.pos.toArray()})
  const onDeath=()=>record('player-dead',{health:g.player.health,position:g.player.pos.toArray()})
  const onFire=event=>record('weapon-fire',{weapon:event?.weapon??'rifle',origin:point(event?.origin)})
  const onImpact=event=>{
    const member=members.find(member=>event?.enemy===member.target.actor)
    if(member)record('infected-impact',{spawnId:member.spawn.id,weapon:event.weapon??equipment.capture().activeWeapon,point:point(event.point),hp:member.target.actor.hp})
  }
  const subscriptions=[['game:state',onState],['player:hit',onHit],['player:dead',onDeath],['weapon:fire',onFire],['impact',onImpact]]
  for(const [name,fn]of subscriptions)g.events.on(name,fn)
  const keydown=event=>{
    if(g.game.state!=='playing'||!g.player.alive||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return
    if(event.code==='KeyG'){event.preventDefault();grantEquipment()}
    if(event.code==='KeyN'){event.preventDefault();resetActor()}
  }
  document.addEventListener('keydown',keydown)
  function reset() {
    equipment.reset();for(const id of ['rifle','pistol','knife'])equipment.setPickupEnabled(id,false)
    map.reset();g.enemies.clear();g.game.run.queue.length=0
    supplies.reset({consumed:true,exitConsumed:true,flashlightOwned:true,on:true})
    elapsed=0;resetActor();record('diagnostic-run-start')
  }
  function update(dt) {
    if(disposed)return
    map.update(dt);supplies.update(dt)
    if(director)director.update(dt);else ai.update(dt)
    elapsed+=dt
    if(elapsed>=.25){elapsed=0
      const scheduling=full?director.snapshot():null
      const states=members.map(member=>{const state=member.ai.snapshot();return {id:member.spawn.id,position:state.position,state:state.state,hp:member.target.actor.hp,
        mode:state.mode,trackingPosition:state.trackingPosition,firstAttackStarted:state.firstAttackStarted,silent:state.silent,pursuit:state.pursuit,stagger:state.stagger,motion:state.motion}})
      trajectory.push({time:g.game.run.time,player:g.player.pos.toArray(),health:g.player.health,
        ...(scheduling?{scheduling:{awake:scheduling.awakeCount,sleep:scheduling.sleepCount,dead:scheduling.deadCount,updates:scheduling.updates}}:{}),
        ...(director?{infected:states}:{infected:states[0].position,state:states[0].state,pursuit:states[0].pursuit,stagger:states[0].stagger,motion:states[0].motion}),
        input:{move:{...g.input.move},sprint:!!g.input.sprint,crouch:!!g.input.crouch,fire:!!g.input.fire}})
      if(trajectory.length>2400)trajectory.shift()
      refresh()
    }
  }
  function snapshot(){return {schemaVersion:2,revision:full?'b1b-full-v1':'b1b-sprint-cover-immediate-v3-auto-reload',stage:full?'B1-B-full-diagnostic':director?'B1-B-twelve-diagnostic':'B1-B-single-diagnostic',classification:'fixed CH2 runtime spawns; diagnostic start/reset/equipment, not continuous campaign route acceptance',
    source:INFECTED_SOURCE,clips:INFECTED_CLIPS,tuning:CH2_INFECTED_TUNING,...(director?{sectionId,spawns:members.map(member=>member.spawn)}:{spawn}),logicalActorCount:members.length,initialActorHealth,trackerCount,
    current:roundSnapshot(),previousRounds:rounds,flashlight:supplies.snapshot(),world:map.snapshot(),
    entry:location.href,browser:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},
    performance:'not measured; no FPS/P95 acceptance'}}
  reset()
  document.querySelector('.m-premise').textContent=`黑箱堆场${label}。${full?'全章同场 36 只，包含 9 只首攻前静音追踪者；跨段和返程保持生命与行为状态。':section?'本段十二只部署于转角遮挡处，三只首攻前静音追踪，从该段前方开始。':'直接从五号连接口开始。'}感染者 ${initialActorHealth} HP、受击继续移动；远追 ${CH2_INFECTED_TUNING.sprintSpeed}m/s，攻击起手即判定。正常伤害；G 配发测试装备，Q 手电，P 面板导出反馈。此入口不计章节进度。`
  document.querySelector('.m-tag').textContent=`B1-B · ${full?'全章 · 36':section?section.name+' · 12':'1'}`
  return {reset,update,interact:()=>{g.hud.setObjective();g.hud.setRelays(0,0);g.hud.setPrompt(null)},reinforcementEnabled:false,snapshot,
    dispose(){if(disposed)return;disposed=true;document.removeEventListener('keydown',keydown)
      for(const [name,fn]of subscriptions)g.events.off(name,fn)
      if(director)director.dispose();else {ai.dispose();target.dispose();animation.dispose();voice.dispose();instance.dispose()}
      bank.dispose();asset.dispose();panel.remove();style.remove()}}
}
