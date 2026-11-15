import { installCampaignM1 } from './campaign-m1.mjs'
import { INFECTED_SOURCE, loadInfectedAsset } from './character-assets.mjs'
import { createCharacterAnimation } from './character-animation.mjs'
import { loadInfectedAudio } from './character-audio.mjs'
import { installCharacterTarget } from './character-native-target.mjs'
import { INFECTED_CLIPS, INFECTED_CLIP_SOURCE_SHA, INFECTED_CLIP_FEEDBACK_SHA } from './character-clips.mjs'

// Explicit diagnostic entry: one supplied actor, freely selectable source clips
// and test equipment. Its resets/assignments are never campaign progress.
export async function installCharacterLab(g,equipment) {
  if(INFECTED_SOURCE.sha256!==INFECTED_CLIP_SOURCE_SHA)throw Error('Infected animation mapping belongs to a different source package')
  const T=g.THREE,asset=await loadInfectedAsset(T)
  let bank
  try{bank=await loadInfectedAudio(g)}catch(error){asset.dispose();throw error}
  const instance=asset.createInstance({height:1.8}),animation=createCharacterAnimation(T,instance,asset),voice=bank.createVoice()
  const roles=Object.keys(INFECTED_CLIPS)
  const mapping=Object.fromEntries(roles.map(role=>[role,INFECTED_CLIPS[role].index])),assignments=[]
  let index=0,loop=false,combat=false,notice='已载入你确认的11段动作标记；B 试听，P 打开面板。',audioIndex=0,uiElapsed=0
  const map=installCampaignM1(g,equipment,{chapter1:true,objective:()=> '单体诊断 · 动作标记已载入 · 非章节通关'})
  const target=installCharacterTarget(g,instance,{animation,clipFor:role=>mapping[role],
    onStop:()=>voice.stop(),onAttack:()=>voice.play('attack',instance.root.position),onChange:()=>{uiElapsed=1}})
  target.setEnabled(false)
  g.scene.add(instance.root)
  g.level.playerStart={pos:new T.Vector3(0,0,-326),yaw:0}
  const light=new T.SpotLight(0xe8e4da,90,16,.8,.6,1.5)
  light.position.set(3,4,-328);light.target.position.set(0,1,-332);g.scene.add(light,light.target)

  const panel=document.createElement('aside'),status=document.createElement('div'),controls=document.createElement('div'),style=document.createElement('style')
  panel.className='harbor-character-lab';panel.setAttribute('aria-label','单体动作诊断')
  status.className='body-5';status.setAttribute('aria-live','polite')
  controls.className='harbor-character-controls';panel.append(status,controls)
  style.textContent=`.harbor-character-lab{position:fixed;right:16px;top:80px;z-index:90;width:min(320px,calc(100vw - 32px));max-height:calc(100vh - 96px);overflow:auto;padding:16px;border:1px solid var(--line);background:var(--plate-solid);color:var(--bone);font-family:var(--f-label)}
    .harbor-character-lab .body-5,.harbor-character-lab label{font:400 14px/20px var(--f-label);white-space:pre-line}
    .harbor-character-controls{display:grid;gap:8px;margin-top:16px}.harbor-character-controls label{display:grid;gap:4px}
    .harbor-character-controls select,.harbor-character-controls input{width:100%;box-sizing:border-box;background:var(--ink);color:var(--bone);border:1px solid var(--line);padding:8px;font:400 14px/20px var(--f-label)}
    .harbor-character-controls :focus-visible{outline:2px solid var(--signal);outline-offset:2px}.harbor-character-controls .btn{padding:8px 12px;white-space:normal}
    .harbor-character-lab[data-playing="true"]{pointer-events:none;background:var(--plate)}.harbor-character-lab[data-playing="true"] .harbor-character-controls{display:none}`
  document.head.append(style);document.body.append(panel)
  function field(text,element){const label=document.createElement('label');label.append(text,element);controls.append(label);return element}
  function button(text,action){const b=document.createElement('button');b.type='button';b.className='btn small';b.textContent=text;b.addEventListener('click',action);controls.append(b);return b}
  function option(select,value,text){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o)}
  const clips=field('源动作',document.createElement('select'))
  for(const [i,clip] of asset.clips.entries())option(clips,i,`${i+1} / ${asset.clips.length} · ${clip.duration.toFixed(3)} 秒`)
  clips.addEventListener('change',()=>selectClip(Number(clips.value)))
  const roleSelect=field('看过后，将当前动作标为',document.createElement('select'))
  for(const role of roles)option(roleSelect,role,role)
  button('记录动作用途',()=>{
    const role=roleSelect.value
    combat=false;target.setEnabled(false)
    for(const key of roles)if(mapping[key]===index)mapping[key]=null
    mapping[role]=index;assignments.push({role,clip:index,time:g.game.run.time})
    notice=`已标记 ${role} → 动作 ${index+1}。`;refresh()
  })
  button('清除当前动作标记',()=>{combat=false;target.setEnabled(false);for(const role of roles)if(mapping[role]===index)mapping[role]=null;refresh()})
  button('播放 / 重播 · V',()=>selectClip(index))
  button('切换单次 / 循环 · L',()=>{loop=!loop;selectClip(index)})
  button('转身 90° · T',rotate)
  const contactStart=field('接触窗口开始（秒，待对照动作）',document.createElement('input'))
  const contactEnd=field('接触窗口结束（秒，待对照动作）',document.createElement('input'))
  for(const [input,value]of [[contactStart,.65],[contactEnd,.9]]){input.type='number';input.min='.05';input.step='.05';input.value=String(value)}
  button('进入命中测试 · G',enableCombat)
  button('回到动作浏览',()=>{combat=false;target.setEnabled(false);selectClip(index)})
  button('重新放置单体 · N',resetActor)
  button('导出本次动作标记与命中记录',()=>{
    const data=snapshot(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a')
    a.href=url;a.download='last-harbor-b1a-feedback.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  })
  const help=document.createElement('p');help.className='body-5'
  help.textContent='P 返回游戏 / 打开面板\n[ ] 上一段 / 下一段 · V 重播 · L 循环\nT 转身 · B 轮换试听 · M 停止声音\nG 命中测试 · K 普通攻击 · J 扑击\nN 重置单体 · 1 步枪 / 2 手枪 / 3 刀\n标记 Hit / Death 后可配发测试装备；攻击另需标记 Attack / Lunge Attack。'
  controls.append(help)
  function selectClip(next) {
    if(!target.actor.alive){notice='单体已死亡；按 N 重新放置。';refresh();return}
    target.cancelAttack();index=(next+asset.clips.length)%asset.clips.length;clips.value=String(index)
    animation.playClip(index,{loop,fade:.15,restart:true});refresh()
  }
  function rotate(){if(target.snapshot().attack)return;instance.root.rotation.y+=Math.PI/2;refresh()}
  function resetActor() {
    voice.stop();target.reset();instance.root.position.set(0,0,-332);instance.root.rotation.y=Math.PI
    animation.playClip(index,{loop,fade:0,restart:true});notice='单体已重新放置；这是诊断重置。';refresh()
  }
  function enableCombat() {
    if(!Number.isInteger(mapping.Hit)||!Number.isInteger(mapping.Death)){notice='先播放并标记 Hit 和 Death，再进入命中测试。';refresh();return}
    const saved=equipment.capture()
    saved.activeWeapon='pistol'
    for(const [id,slot]of Object.entries(saved.slots)){slot.owned=true;slot.ammo=id==='rifle'?40:id==='pistol'?12:0;slot.reserve=id==='rifle'?160:id==='pistol'?48:0}
    equipment.restore(saved);combat=true;target.setEnabled(true)
    notice='测试装备已配发；正常伤害。1 / 2 / 3 切武器，R 换弹。';refresh()
  }
  function attack(role) {
    if(!combat){notice='先标记 Hit / Death，再按 G 进入命中测试。';refresh();return}
    const clip=mapping[role]
    if(!Number.isInteger(clip)){notice=`请先标记 ${role} 的源动作。`;refresh();return}
    try{
      target.beginAttack({clip,duration:asset.clips[clip].duration,contactStart:Number(contactStart.value),contactEnd:Number(contactEnd.value),lungeSpeed:role==='Lunge Attack'?2.4:0})
    }catch(error){notice=error.message;refresh()}
  }
  function refresh() {
    panel.hidden=!['playing','paused','dead'].includes(g.game.state)
    panel.dataset.playing=String(g.game.state==='playing')
    const assigned=roles.filter(role=>mapping[role]===index)
    const groundNote=index===8?'\n已知：本段源姿态采样最低点穿地约16cm，待检查。':''
    status.textContent=`B1-A 单体诊断 · ${combat?'命中测试':'动作浏览'}\n动作 ${index+1} / ${asset.clips.length} · ${asset.clips[index].duration.toFixed(3)} 秒 · ${loop?'循环':'单次'}\n${asset.clips[index].name.replaceAll('\n',' ')}\n用途：${assigned.join(' / ')||'未标记'} · 已标记 ${roles.filter(role=>mapping[role]!==null).length}/11\n单体 HP ${target.actor.hp} · 玩家 HP ${Math.ceil(g.player.health)}${groundNote}\n${notice}\n[ ] 切换 · V 重播 · P 面板`
  }
  function keydown(event) {
    if(g.game.state!=='playing'||!g.player.alive||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return
    const actions={BracketLeft:()=>selectClip(index-1),BracketRight:()=>selectClip(index+1),KeyV:()=>selectClip(index),KeyL:()=>{loop=!loop;selectClip(index)},KeyT:rotate,KeyG:enableCombat,KeyK:()=>attack('Attack'),KeyJ:()=>attack('Lunge Attack'),KeyN:resetActor,
      KeyB:()=>{if(target.actor.alive){const kind=['idle','alert','attack','chase'][audioIndex++%4];voice.play(kind,instance.root.position);notice=`试听 ${kind}，走动检查距离与方向。`;refresh()}},KeyM:()=>voice.stop()}
    if(actions[event.code]){event.preventDefault();actions[event.code]()}
  }
  document.addEventListener('keydown',keydown)
  const onState=({state})=>{
    if(state==='intro'){window.__lastHarborNarrative.skip();return}
    if(state!=='playing')target.cancelAttack()
    refresh()
  }
  g.events.on('game:state',onState)
  function reset() {
    voice.stop();combat=false;target.setEnabled(false);equipment.reset();map.reset();g.enemies.clear();g.game.run.queue.length=0
    resetActor()
  }
  function update(dt) {
    map.update(dt);target.update(dt)
    const pos=instance.root.position.clone().add(new T.Vector3(0,1.1,0))
    voice.update(pos,{occluded:!g.physics.lineOfSight(g.player.eye,pos)})
    uiElapsed+=dt;if(uiElapsed>=.25){uiElapsed=0;refresh()}
  }
  function snapshot(){return {stage:'B1-A-diagnostic',classification:'single-actor lab, not campaign route acceptance',source:INFECTED_SOURCE,
    mapping:{...mapping},mappingSource:{sha256:INFECTED_CLIP_FEEDBACK_SHA,classification:'user-confirmed labels; current edits remain diagnostic'},assignments:assignments.map(a=>({...a})),clips:asset.clips.map((clip,i)=>({index:i,name:clip.name,duration:clip.duration})),
    selectedClip:index,loop,combat,contactWindow:{start:Number(contactStart.value),end:Number(contactEnd.value)},
    actor:target.snapshot(),animation:animation.snapshot(),audio:voice.snapshot(),player:{position:g.player.pos.toArray(),health:g.player.health,alive:g.player.alive},equipment:equipment.capture()}}
  reset()
  document.querySelector('.m-premise').textContent='单只感染者动作与命中诊断。直接进入五号测试区，逐段播放11个源动作并标记用途，再试步枪、手枪、匕首和接触伤害。此入口不计章节进度。'
  document.querySelector('.m-tag').textContent='B1-A'
  return {reset,update,interact:()=>{g.hud.setObjective();g.hud.setPrompt(null)},reinforcementEnabled:false,snapshot,
    dispose(){document.removeEventListener('keydown',keydown);g.events.off('game:state',onState);target.dispose();animation.dispose();voice.dispose();bank.dispose();instance.dispose();asset.dispose();light.removeFromParent();light.target.removeFromParent();light.dispose();panel.remove();style.remove()}}
}
