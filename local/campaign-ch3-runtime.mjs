import { loadChapter3Assets } from './campaign-ch3-assets.mjs'
import { loadChapter3PersonnelResources, createClearanceVisual, createWorkerVisual } from './campaign-ch3-personnel-visual.mjs'
import { loadSniperResources, createSniperVisual } from './campaign-ch3-sniper-visual.mjs'
import { installChapter3Sniper } from './campaign-ch3-sniper.mjs'
import { SNIPER_CONFIG } from './campaign-ch3-sniper-config.mjs'
import { installChapter3Clearance } from './campaign-ch3-clearance.mjs'
import { CH3_CLEARANCE_DEPLOYMENTS, CH3_RESCUE_BLOCKERS } from './campaign-ch3-deployment.mjs'
import { installChapter3Rescue, CH3_RESCUE_DOOR } from './campaign-ch3-rescue.mjs'
import { installChapter3Ammo, CH3_AMMO_SITES } from './campaign-ch3-ammo.mjs'
import { CH3 } from './campaign-ch3-layout.mjs'
import { installChapter3Conversation } from './campaign-ch3-conversation.mjs'
import { campaignCh3Radio } from './campaign-ch3-dialogue.mjs'

// Load before the parent's one M1 map. No environment installation or global
// mutation here; the tower borrows the same audited soldier character resource.
export async function loadChapter3RuntimeResources(g) {
  const assets=await loadChapter3Assets(g.THREE)
  let personnel,sniperResources,disposed=false
  const dispose=()=>{if(disposed)return;disposed=true;sniperResources?.dispose();personnel?.dispose();assets.dispose()}
  try {
    personnel=await loadChapter3PersonnelResources(g)
    sniperResources=await loadSniperResources(g,{characterResource:personnel.character})
    return {assets,personnel,sniperResources,dispose}
  }catch(error){dispose();throw error}
}

const finitePoint=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]))
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)
const copyPoint=p=>({x:p.x,y:p.y,z:p.z})
const radioGroups=['warning','blockade','contact','rescue','departure']
const radioIds=radioGroups.flatMap(key=>campaignCh3Radio[key].map((_,index)=>`${key}:${index}`))
const radioLine=id=>{const [key,index]=id.split(':');return campaignCh3Radio[key][Number(index)]}
const radioDuration=id=>Math.max(3,Math.min(8,radioLine(id).text.length*.13+1.5))
const initialProgress=()=>({radio:{triggered:[],played:[],skipped:[],queue:[],remaining:0}})
const copyProgress=p=>({radio:{triggered:[...p.radio.triggered],played:[...p.radio.played],skipped:[...p.radio.skipped],queue:[...p.radio.queue],remaining:p.radio.remaining}})

// The parent owns the map, equipment/player restoration, mission reducer and
// atomic checkpoint. These controllers own only their existing CH3 instances.
export function installChapter3Runtime(g,equipment,{resources,narrative,flags,emit,onCheckpoint=()=>{}}) {
  const T=g.THREE,d=CH3_RESCUE_DOOR,b=CH3.safeHouse.bounds
  let sniper,clearance,rescue,ammo,worker,conversation,disposed=false,resetting=true
  let progress=initialProgress(),previousRoomPoint=null,inputFrame=null,lastEdgeFrame=null,edge=false,held=!!g.input.down?.('interact')
  const checkpoint=event=>{if(!resetting&&!disposed)onCheckpoint(event)}
  const blocked=()=>disposed||!flags().chapter3Entered||!flags().chapter3IntroRead||
    !!narrative.snapshot().active||!!conversation?.snapshot().active
  const gate={snapshot:()=>({active:blocked()})}
  const combatGate={snapshot:()=>({active:blocked()||!!flags().chapter4Entered})}
  const active=()=>!blocked()&&g.game.state==='playing'&&g.player.alive&&g.player.enabled!==false
  function inside(p,margin=0) {
    return p.x>b.minX+margin&&p.x<b.maxX-margin&&p.z>b.minZ+margin&&p.z<b.maxZ-margin&&p.y>=d.floor-.03&&p.y+1.15<d.top
  }
  function enqueue(key) {
    const r=progress.radio
    if(r.triggered.includes(key))return false
    r.triggered.push(key);r.queue.push(...campaignCh3Radio[key].map((_,i)=>`${key}:${i}`))
    checkpoint({kind:'ch3-radio-queued',id:key});return true
  }
  function discardRadio(groups) {
    const r=progress.radio
    // A later story beat supersedes unfinished ambient exchanges; do not play
    // a dead guard or an earlier rescue greeting after hearing the testimony.
    for(const key of groups){
      if(!r.triggered.includes(key))r.triggered.push(key)
      for(const id of radioIds.filter(id=>id.startsWith(`${key}:`)))
        if(!r.played.includes(id)&&!r.skipped.includes(id))r.skipped.push(id)
    }
    r.queue=r.queue.filter(id=>!r.skipped.includes(id));r.remaining=0
  }
  function controllers(dt) {sniper.update(dt);clearance.update(dt);rescue.update(dt);ammo.update(dt)}
  function rescued(event) {
    if(resetting)return
    if(event.kind==='repair-unlocked')discardRadio(['blockade'])
    if(event.kind==='repair-door-open')enqueue('rescue')
    if(event.kind==='worker-rescued'){
      emit({type:'worker-rescued'})
      // This callback comes only from the native indoor, facing/LOS rescue E.
      // A living tower remains active after the player has safely bypassed it.
      if(sniper.target.actor.alive&&!flags().sniperThreatResolved)emit({type:'sniper-threat-resolved',method:'bypassed'})
      enqueue('rescue')
    }
    checkpoint(event)
  }
  try {
    sniper=installChapter3Sniper(g,{visual:createSniperVisual(g,resources.sniperResources),narrative:combatGate,
      onDefeated(){if(!resetting){emit({type:'sniper-threat-resolved',method:'defeated'});checkpoint({kind:'ch3-sniper-defeated'})}}})
    worker=createWorkerVisual(g,resources.personnel)
    rescue=installChapter3Rescue(g,{worker,narrative:gate,onCheckpoint:rescued,
      getBlockers:()=>CH3_RESCUE_BLOCKERS.map(id=>clearance?.members.find(m=>m.id===id)?.target.actor)})
    clearance=installChapter3Clearance(g,{createVisual:()=>createClearanceVisual(g,resources.personnel),
      deployments:CH3_CLEARANCE_DEPLOYMENTS,narrative:combatGate,onChange:()=>checkpoint({kind:'ch3-clearance'}),
      canEnter:(from,to)=>rescue.allowsEnemySegment(from,to)})
    ammo=installChapter3Ammo(g,{equipment,narrative:gate,getMembers:()=>clearance.members,onCheckpoint:checkpoint,includeExit:true})
    conversation=installChapter3Conversation(g,{onComplete(){
      if(resetting||disposed)return
      if(emit({type:'worker-testimony-completed'}))g.hud.message('已获得第七区维修通行凭据 · 前往第七区控制廊道',6)
      previousRoomPoint=inside(g.player.pos)?copyPoint(g.player.pos):null
      checkpoint({kind:'worker-testimony-completed'})
    }})
    resetting=false
  }catch(error){ammo?.dispose();clearance?.dispose();rescue?.dispose();worker?.dispose();sniper?.dispose();throw error}

  function sampleInput() {
    if(inputFrame===g.time.frame)return
    inputFrame=g.time.frame
    edge=!!g.input.pressed('interact')&&!held;held=!!g.input.down?.('interact')
  }
  function workerNearby() {
    const p=g.player.pos,target=new T.Vector3(CH3.safeHouse.survivor.x,CH3.safeHouse.survivor.y+1.15,CH3.safeHouse.survivor.z)
    const dx=target.x-p.x,dz=target.z-p.z,range=Math.hypot(dx,dz),forward=g.player.forward
    return inside(p,.32)&&range<=1.9&&g.player.eye.distanceTo(target)<=2.15&&
      (dx*forward.x+dz*forward.z)/Math.max(.001,range*Math.hypot(forward.x,forward.z))>=.5&&g.physics.lineOfSight(g.player.eye,target)
  }
  function interact(dt) {
    sampleInput()
    const pressed=edge&&lastEdgeFrame!==g.time.frame;lastEdgeFrame=g.time.frame
    if(!active())return false
    if(ammo.interact(dt))return true
    if(flags().chapter4Entered)return false
    const alreadyRescued=rescue.capture().rescued
    if(rescue.interact(dt))return true
    if(!alreadyRescued||flags().accessCredentialObtained||!workerNearby())return false
    g.hud.setPrompt('与许工交谈 · 了解七号泊位的情况')
    if(!pressed)return false
    const opened=conversation.open()
    if(opened){discardRadio(['warning','blockade','contact','rescue']);checkpoint({kind:'worker-conversation-started'});controllers(0)}
    return opened
  }
  function roomExit(a,p) {
    if(!a||distance(a,p)>4||a.x>=d.x||p.x<d.x||Math.abs(a.y-d.floor)>.35||Math.abs(p.y-d.floor)>.35)return false
    const t=(d.x-a.x)/(p.x-a.x),z=a.z+(p.z-a.z)*t
    return Math.abs(z-d.z)<d.width/2
  }
  function radioUpdate(dt) {
    const r=progress.radio
    r.remaining=Math.max(0,r.remaining-dt)
    if(r.remaining>0||!r.queue.length)return
    const id=r.queue[0],key=id.split(':')[0]
    // A retry can retain radio history from a later checkpoint. Keep it queued
    // until its corresponding restored mission fact is true again.
    if(key==='rescue'&&!rescue.capture().rescued||key==='departure'&&!flags().accessCredentialObtained)return
    const cue=radioLine(id)
    r.queue.shift();r.played.push(id);r.remaining=radioDuration(id)
    g.hud.radio(`${cue.who}：${cue.text}`,r.remaining)
    checkpoint({kind:'ch3-radio-played',id})
  }
  function update(dt) {
    sampleInput();controllers(dt)
    if(!active()||flags().chapter4Entered){
      if(!g.player.alive||!flags().chapter3Entered)previousRoomPoint=null
      return
    }
    const p=g.player.pos
    if(sniper.capture().warningSeen)enqueue('warning')
    if(!rescue.capture().unlocked&&CH3_RESCUE_BLOCKERS.every(id=>clearance.members.find(m=>m.id===id)?.target.actor.alive)&&
      Math.abs(p.y)<.5&&Math.hypot(p.x-d.x,p.z-d.z)<10)enqueue('blockade')
    if(clearance.members.some(m=>m.target.actor.alive&&m.visible&&m.knownKind==='seen'&&m.memory>0&&m.lastKnown&&
      Math.hypot(m.lastKnown.x-p.x,m.lastKnown.z-p.z)<1&&Math.hypot(m.target.actor.pos.x-p.x,m.target.actor.pos.z-p.z)<20&&
      g.physics.lineOfSight(m.visual.getEye(),g.player.eye)))enqueue('contact')
    if(flags().accessCredentialObtained&&roomExit(previousRoomPoint,p))enqueue('departure')
    previousRoomPoint=copyPoint(p)
    if(Number.isFinite(dt)&&dt>0)radioUpdate(dt)
  }
  function capture() {return {version:1,sniper:sniper.capture(),clearance:clearance.capture(),rescue:rescue.capture(),ammo:ammo.capture(),progress:copyProgress(progress)}}
  function validateCapture(saved,missionFlags) {
    const invalid=()=>{throw Error('Invalid CH3 runtime capture')}
    if(!saved||saved.version!==1)invalid()
    clearance.validateCapture(saved.clearance);rescue.validateCapture(saved.rescue);ammo.validateCapture(saved.ammo)
    const s=saved.sniper,c=s?.core,r=saved.progress?.radio
    if(!s||s.version!==1||!Number.isFinite(s.hp)||s.hp<0||s.hp>SNIPER_CONFIG.actorHP||typeof s.alive!=='boolean'||s.alive!==(s.hp>0)||
      typeof s.warningSeen!=='boolean'||!c||c.version!==1||!['IDLE','TRACK','LOCK','FIRE','COOLDOWN','SEARCH','DEAD'].includes(c.state)||
      (c.state==='DEAD')!==!s.alive||!Number.isSafeInteger(c.shotId)||c.shotId<0||
      ['time','aimElapsed','cooldownRemaining','searchRemaining'].some(k=>!Number.isFinite(c[k])||c[k]<0)||
      ['target','direction'].some(k=>c[k]!==null&&(!Array.isArray(c[k])||c[k].length!==3||!c[k].every(Number.isFinite)))||
      ['TRACK','LOCK'].includes(c.state)&&!c.target||c.state==='LOCK'&&(!c.direction||Math.hypot(...c.direction)<.99))invalid()
    sniper.visual.animation.validateCapture(s.animation)
    if(!r||!Number.isFinite(r.remaining)||r.remaining<0||r.remaining>8||
      !Array.isArray(r.triggered)||new Set(r.triggered).size!==r.triggered.length||r.triggered.some(key=>!radioGroups.includes(key))||
      ['played','skipped','queue'].some(k=>!Array.isArray(r[k])||new Set(r[k]).size!==r[k].length||r[k].some(id=>!radioIds.includes(id)))||
      r.played.some(id=>r.queue.includes(id)||r.skipped.includes(id))||r.skipped.some(id=>r.queue.includes(id))||
      radioIds.some(id=>r.triggered.includes(id.split(':')[0])!==(r.played.includes(id)||r.skipped.includes(id)||r.queue.includes(id))))invalid()
    const dead=id=>saved.clearance.members.find(m=>m.id===id)?.alive===false
    if(saved.rescue.unlocked&&CH3_RESCUE_BLOCKERS.some(id=>!dead(id)))invalid()
    for(const site of CH3_AMMO_SITES)if(site.group&&saved.ammo.consumed.includes(site.id)&&
      CH3_CLEARANCE_DEPLOYMENTS.some(m=>m.group===site.group&&!dead(m.id)))invalid()
    if(!missionFlags||typeof missionFlags.survivorRescued!=='boolean'||typeof missionFlags.survivorContacted!=='boolean'||
      saved.rescue.rescued!==missionFlags.survivorRescued||saved.rescue.rescued!==missionFlags.survivorContacted||
      typeof missionFlags.testimonyHeard!=='boolean'||typeof missionFlags.accessCredentialObtained!=='boolean'||
      missionFlags.testimonyHeard!==missionFlags.accessCredentialObtained||missionFlags.testimonyHeard&&!saved.rescue.rescued||
      typeof missionFlags.sniperThreatResolved!=='boolean'||missionFlags.sniperThreatResolved!==(!s.alive||saved.rescue.rescued)||
      typeof missionFlags.chapter3Completed!=='boolean'||missionFlags.chapter3Completed&&!missionFlags.accessCredentialObtained)invalid()
    return true
  }
  function reset(saved,{retry=false}={}) {
    if(saved)validateCapture(saved,flags())
    const retained=retry?copyProgress(progress).radio:null
    resetting=true
    try {
      conversation.reset()
      if(saved)rescue.restore(saved.rescue);else rescue.reset()
      clearance.reset(saved?.clearance);sniper.reset(saved?.sniper,{keepWarning:retry})
      if(saved)ammo.restore(saved.ammo);else ammo.reset()
      progress=saved?copyProgress(saved.progress):initialProgress()
      if(retained){
        const r=progress.radio
        r.triggered=[...new Set([...r.triggered,...retained.triggered])]
        r.played=[...new Set([...r.played,...retained.played])]
        r.skipped=[...new Set([...r.skipped,...retained.skipped])].filter(id=>!r.played.includes(id))
        r.queue=[...new Set([...retained.queue,...r.queue])].filter(id=>!r.played.includes(id)&&!r.skipped.includes(id))
        r.remaining=Math.max(r.remaining,retained.remaining)
      }
      previousRoomPoint=null;inputFrame=null;lastEdgeFrame=g.time.frame;edge=false;held=!!g.input.down?.('interact')
    }finally{resetting=false}
  }
  function observeExit(previous,current) {
    if(!active()||!finitePoint(previous)||!finitePoint(current)||distance(previous,current)>4||
      Math.abs(previous.y)>.35||Math.abs(current.y)>.35||previous.x<-60||current.x>=-60)return false
    const t=(-60-previous.x)/(current.x-previous.x),z=previous.z+(current.z-previous.z)*t
    if(z<=-116||z>=-104)return false
    if(!flags().accessCredentialObtained){g.hud.message('先找到维修室里的许工 · 取得第七区通行凭据',4);return false}
    if(flags().chapter3Completed)return false
    const changed=emit({type:'chapter3-exited'})
    if(changed===false)return false
    g.hud.message('第三章完成 · 已抵达第七区控制廊道',8)
    checkpoint({kind:'chapter3-exited'});return true
  }
  return {sniper,clearance,rescue,ammo,worker,conversation,update,interact,reset,capture,validateCapture,observeExit,
    snapshot:()=>({...capture(),active:active(),conversation:conversation.snapshot(),chapter4Implemented:false}),
    dispose(){if(disposed)return;disposed=true;conversation.reset();ammo.dispose();clearance.dispose();rescue.dispose();worker.dispose();sniper.dispose()},
  }
}
