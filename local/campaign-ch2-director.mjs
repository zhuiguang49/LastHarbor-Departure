import { createChapter2Navigation } from './campaign-ch2-navigation.mjs'
import { CH2_SECTIONS } from './campaign-ch2-layout.mjs'
import { CH2_INFECTED_DEPLOYMENT } from './campaign-ch2-deployment.mjs'
import { createCharacterAnimation } from './character-animation.mjs'
import { INFECTED_CLIPS } from './character-clips.mjs'
import { installCharacterTarget } from './character-native-target.mjs'
import { createChapter2Infected, CH2_INFECTED_TUNING } from './campaign-ch2-infected.mjs'

// One owner for all native targets/player collision; stable actors never refill.
const owners=new WeakMap()

export function createChapter2InfectedDirector(g,{sectionId=null,asset,bank,enabled=true,safeRooms=null,staged=false,deployment=null}) {
  const section=deployment?deployment.section:CH2_SECTIONS.find(section=>section.id===sectionId)
  if(deployment && (sectionId===null || section?.id!==sectionId || !Array.isArray(deployment.spawns)))throw Error('Invalid fixed infected deployment')
  if(sectionId!==null && !section)throw Error(`Invalid twelve-actor CH2 section: ${sectionId}`)
  const ownerKey=deployment?sectionId:'chapter-2'
  if(owners.get(g)?.has(ownerKey))throw Error('A CH2 director already owns this game')
  const T=g.THREE,p=CH2_INFECTED_TUNING,spawns=deployment?deployment.spawns:CH2_INFECTED_DEPLOYMENT.filter(spawn=>sectionId===null || spawn.sectionId===sectionId)
  const full=sectionId===null
  if(staged&&!full)throw Error('Staged activation requires the full CH2 director')
  if(spawns.length!==(deployment?5:full?36:12))throw Error('CH2 director requires the complete fixed deployment')
  if(deployment && (new Set(spawns.map(s=>s.id)).size!==5 || spawns.some(s=>s.sectionId!==sectionId)))throw Error('Fixed infected deployment requires five unique IDs in its section')
  const navigation=full&&!staged?createChapter2Navigation(g,{safeRooms}):null
  const sectionNavigation=new Map(staged?CH2_SECTIONS.map(({id})=>[id,createChapter2Navigation(g,{safeRooms,
    allowsSegment:(from,to)=>!safeRooms||safeRooms.allowsSectionSegment(id,from,to)})]):[])
  const members=[],crowd=new Map(),trial=new T.Vector3(),trialVelocity=new T.Vector3(),toward=new T.Vector3()
  let disposed=false,time=0,frame=0,resets=0,finished=false
  let activeSections=new Set(staged&&enabled?['ch2.s1']:[])
  enabled=!!enabled
  const memberEnabled=member=>enabled&&!finished&&(!staged||activeSections.has(member.spawn.sectionId))
  const alerts={sent:0,received:0,radius:8,cooldown:4,recipientBudget:2}
  const nativeMove=g.physics.moveCapsule
  const stats={moves:0,blocked:0,detours:0,yields:0,attackWaits:0}
  const horizontal=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)
  const inside=point=>full || point.x>=section.bounds.minX && point.x<=section.bounds.maxX && point.z>=section.bounds.minZ && point.z<=section.bounds.maxZ
  const live=member=>member.target.actor.alive && member.target.actor.active && member.target.actor.hp>0
  function segmentDistance(a,b,point) {
    const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz
    const t=length?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/length)):0
    return Math.hypot(a.x+t*dx-point.x,a.z+t*dz-point.z)
  }
  function obstruction(member,from,to,radius=p.radius,includePlayer=true) {
    const crosses=(position,clearance)=>{
      const distance=horizontal(from,position)
      return segmentDistance(from,to,position)<Math.min(distance,clearance)-.00001 ||
        (distance<clearance-.00001 && horizontal(to,position)<=distance)
    }
    for(const peer of members) {
      if(peer===member || !live(peer) || Math.abs(peer.target.actor.pos.y-from.y)>=p.height)continue
      const position=peer.target.actor.pos
      // Overlapping starts (e.g. external diagnostic placement) can only move
      // apart; ordinary movement may never sweep through another live capsule.
      if(crosses(position,radius+p.radius))return peer
    }
    if(includePlayer && g.player.alive && g.player.enabled && Math.abs(g.player.pos.y-from.y)<p.height) {
      if(crosses(g.player.pos,radius+.32))return 'player'
    }
    return null
  }
  function attempt(member,position,velocity,dt,radius,height,step) {
    trial.copy(position);trialVelocity.copy(velocity)
    const result=nativeMove.call(g.physics,trial,trialVelocity,dt,radius,height,step)
    // Native depenetration is not a licence to eject an obstructed spawn or to
    // slide across another actor. Commit only a legal swept native step.
    if(horizontal(position,trial)>Math.hypot(velocity.x,velocity.z)*dt+.0001 ||
      !g.physics.nav.isWalkable(trial.x,trial.z) || !g.physics.nav.clearLine(position,trial) ||
      obstruction(member,position,trial,radius) || safeRooms&&!safeRooms.allowsEnemySegment(position,trial,radius,height) ||
      staged&&safeRooms&&!safeRooms.allowsSectionSegment(member.spawn.sectionId,position,trial,radius))return null
    position.copy(trial);velocity.copy(trialVelocity)
    return result
  }
  function move(member,position,velocity,dt,radius,height,step) {
    const state=crowd.get(member),start=position.clone(),desired=velocity.clone(),speed=Math.hypot(velocity.x,velocity.z)
    stats.moves++
    if(!speed || !(dt>0))return attempt(member,position,velocity,dt,radius,height,step)??{hitWall:true}
    function yieldStep() {
      if(!state.yieldPoint)return null
      if(time>=state.yieldUntil || horizontal(start,state.yieldPoint)<=.08 || !members.some(peer=>peer.spawn.id===state.blocker && live(peer))){state.yieldPoint=null;return null}
      toward.copy(state.yieldPoint).sub(start).setY(0)
      toward.multiplyScalar(Math.min(speed,toward.length()/dt)/toward.length());toward.y=desired.y
      const result=attempt(member,position,toward,dt,radius,height,step)
      if(result && horizontal(start,position)>.0001)return result
      state.yieldPoint=null;return null
    }
    // Finish the short retreat before trying forward again, so a blocked pair
    // cannot alternate one forward/back step indefinitely at the same corner.
    const yielding=yieldStep()
    if(yielding)return yielding
    const result=attempt(member,position,velocity,dt,radius,height,step)
    if(result && horizontal(start,position)>.0001){state.blockedFor=0;state.blocker=null;return result}
    const endpoint=start.clone().addScaledVector(desired,dt),blocker=obstruction(member,start,endpoint,radius)
    if(!blocker){state.blockedFor+=dt;stats.blocked++;return {hitWall:true}}
    state.blockedFor+=dt;state.blocker=blocker==='player'?'player':blocker.spawn.id
    // Deterministic right-first sidesteps make opposing actors choose opposite
    // physical sides. Every alternative is still solved against world/capsules.
    for(const angle of [.65,-.65,1.25,-1.25]) {
      const c=Math.cos(angle),s=Math.sin(angle)
      trialVelocity.set(desired.x*c-desired.z*s,desired.y,desired.x*s+desired.z*c)
      const detour=attempt(member,position,trialVelocity.clone(),dt,radius,height,step)
      if(detour && horizontal(start,position)>.0001){stats.detours++;state.yieldPoint=null;return detour}
    }
    // A blocked rear actor yields to a nearby moving/attacking actor. Search a
    // bounded local pocket, never remove collision or teleport to that pocket.
    if(blocker!=='player' && state.blockedFor>=.2 && (!state.yieldPoint || time>=state.yieldUntil)) {
      state.yieldPoint=null
      const forward=desired.clone().setY(0).normalize()
      for(const angle of [Math.PI/2,-Math.PI/2,Math.PI*.8,-Math.PI*.8,Math.PI]) {
        const point=start.clone().add(new T.Vector3(forward.x*Math.cos(angle)-forward.z*Math.sin(angle),0,forward.x*Math.sin(angle)+forward.z*Math.cos(angle)).multiplyScalar(.9))
        if(inside(point) && g.physics.nav.isWalkable(point.x,point.z) && g.physics.nav.clearLine(start,point) && !obstruction(member,start,point,radius)){
          state.yieldPoint=point;state.yieldUntil=time+.8;stats.yields++;break
        }
      }
    }
    const yielded=yieldStep()
    if(yielded)return yielded
    stats.blocked++;return {hitWall:true}
  }
  function approach(member,known) {
    const state=crowd.get(member),nav=g.physics.nav
    state.approach=null
    const exterior=(staged&&safeRooms?.sectionApproach(member.spawn.sectionId,known))||safeRooms?.enemyApproach(member.target.actor.pos,known)
    if(exterior){state.approach=exterior;return exterior}
    // Never replace an unwalkable target via native endpoint substitution.
    if(!nav.isWalkable(known.x,known.z))return known
    for(const offset of [0,1,-1,2,-2,3]) {
      const angle=(state.index+offset)*Math.PI/3
      const point=known.clone().add(new T.Vector3(Math.cos(angle)*1.2,0,Math.sin(angle)*1.2))
      if(!nav.isWalkable(point.x,point.z) || !nav.clearLine(known,point))continue
      if(members.some(peer=>peer!==member && live(peer) && crowd.get(peer).approach && horizontal(crowd.get(peer).approach,point)<p.radius*2))continue
      state.approach=point;return point
    }
    return known
  }
  function canAttack(member) {
    // AI/bridge check actual world LOS at start and contact, even for trackers.
    // This physical gate never shares the player's position with peers.
    const blocked=obstruction(member,member.target.actor.pos,g.player.pos,p.radius,false)
    if(blocked)stats.attackWaits++
    return !blocked && (!safeRooms || safeRooms.canAttack(member.target.actor.pos,g.player.pos)) &&
      (!staged||!safeRooms||safeRooms.allowsSectionSegment(member.spawn.sectionId,member.target.actor.pos,g.player.pos,0))
  }
  function release() {
    for(const member of members){member.ai?.dispose();member.target?.dispose();member.animation?.dispose();member.voice?.dispose();member.instance?.dispose()}
    crowd.clear();navigation?.dispose();for(const nav of sectionNavigation.values())nav.dispose()
    if(g.physics.moveCapsule===playerMove)g.physics.moveCapsule=nativeMove
    owners.get(g)?.delete(ownerKey)
  }
  function playerMove(position,velocity,dt,radius=.32,height=1.8,step=true) {
    if(position!==g.player.pos || disposed)return nativeMove.call(g.physics,position,velocity,dt,radius,height,step)
    const start=position.clone(),end=position.clone(),solvedVelocity=velocity.clone()
    // Preserve the native player identity through other chapter body wrappers.
    let result=nativeMove.call(g.physics,position,solvedVelocity,dt,radius,height,step),fraction=1
    end.copy(position);position.copy(start)
    const dx=end.x-start.x,dz=end.z-start.z,a=dx*dx+dz*dz
    for(const member of members) {
      if(!live(member) || Math.abs(member.target.actor.pos.y-start.y)>=height)continue
      const peer=member.target.actor.pos,x=start.x-peer.x,z=start.z-peer.z,r=radius+p.radius
      const c=x*x+z*z-r*r,b=x*dx+z*dz
      if(c<0){if(b<0)fraction=0;continue}
      const discriminant=b*b-a*c
      if(a>0 && b<0 && discriminant>=0)fraction=Math.min(fraction,Math.max(0,(-b-Math.sqrt(discriminant))/a-.0001))
    }
    if(fraction<1){
      solvedVelocity.copy(velocity);solvedVelocity.x*=fraction;solvedVelocity.z*=fraction;end.copy(start)
      result=nativeMove.call(g.physics,position,solvedVelocity,dt,radius,height,step);result.hitWall=true
      end.copy(position);position.copy(start)
      // World sliding must not redirect the shortened step into another body.
      if(obstruction(null,start,end,radius,false)){end.x=start.x;end.z=start.z}
    }
    position.copy(end);velocity.copy(solvedVelocity);return result
  }
  function broadcast(member,clue) {
    if(!full || !enabled)return
    const sender=crowd.get(member)
    if(time<sender.sendAfter)return
    sender.sendAfter=time+alerts.cooldown
    let budget=alerts.recipientBudget
    const origin=member.target.actor.pos.clone().add(new T.Vector3(0,1.1,0))
    for(const peer of members){
      if(!budget)break
      const receiver=crowd.get(peer)
      if(peer===member || !live(peer) || peer.spawn.omniscientTracking || time<receiver.receiveAfter || horizontal(member.target.actor.pos,peer.target.actor.pos)>alerts.radius)continue
      const destination=peer.target.actor.pos.clone().add(new T.Vector3(0,1.1,0))
      if(!g.physics.lineOfSight(origin,destination))continue
      if(peer.ai.receiveClue(clue)){receiver.receiveAfter=time+alerts.cooldown;receiver.sleeping=false;peer.ai.setSleeping(false);budget--;alerts.received++}
    }
    if(budget<alerts.recipientBudget)alerts.sent++
  }
  function syncActivation(force=false) {
    for(const member of members){
      const active=memberEnabled(member),state=crowd.get(member)
      if(!force&&state.enabled===active)continue
      member.ai.setEnabled(active);member.target.setEnabled(active);member.instance.root.visible=active
      state.enabled=active;state.sleeping=false;state.animationPending=0
    }
  }
  function setEnabled(value) {
    if(disposed)return
    enabled=!!value&&!finished
    if(staged&&enabled&&!activeSections.size)activeSections.add('ch2.s1')
    syncActivation()
  }
  function activateSection(id) {
    if(!staged||!enabled||finished||activeSections.has(id)||!CH2_SECTIONS.some(section=>section.id===id))return false
    activeSections.add(id);syncActivation();return true
  }
  function finish() {
    if(disposed||finished)return
    finished=true;enabled=false;syncActivation()
  }
  function capture() {
    if(disposed)throw Error('CH2 director disposed')
    return {schemaVersion:staged?2:1,sectionId,enabled,...(staged?{activeSections:CH2_SECTIONS.filter(s=>activeSections.has(s.id)).map(s=>s.id),finished}:{}),time,frame,resets,members:members.map(member=>{
      const state=crowd.get(member),actor=member.target.actor
      return {id:member.spawn.id,mode:member.spawn.mode,position:actor.pos.toArray(),yaw:member.instance.root.rotation.y,
        hp:actor.hp,alive:actor.alive,ai:member.ai.capture(),animation:member.animation.capture(),
        sleeping:state.sleeping&&member.ai.canSleep(),animationPending:state.animationPending,
        sendRemaining:Math.max(0,state.sendAfter-time),receiveRemaining:Math.max(0,state.receiveAfter-time)}
    })}
  }
  function validateCapture(data) {
    const invalid=()=>{throw Error('Invalid CH2 director capture')}
    if(!data || data.schemaVersion!==(staged?2:1) || data.sectionId!==sectionId || typeof data.enabled!=='boolean' || !Array.isArray(data.members) || data.members.length!==members.length)invalid()
    if(staged&&(!Array.isArray(data.activeSections)||data.activeSections.length>3||
      JSON.stringify(data.activeSections)!==JSON.stringify(CH2_SECTIONS.filter(s=>data.activeSections.includes(s.id)).map(s=>s.id))||typeof data.finished!=='boolean'||
      data.finished&&data.enabled||data.enabled&&!data.activeSections.length))invalid()
    if(!Number.isFinite(data.time)||data.time<0||data.time>1e9 || !Number.isSafeInteger(data.frame)||data.frame<0 || !Number.isSafeInteger(data.resets)||data.resets<0)invalid()
    const seen=new Set()
    for(const saved of data.members){
      const member=members.find(m=>m.spawn.id===saved?.id)
      if(!member || seen.has(saved.id) || saved.mode!==member.spawn.mode)invalid()
      seen.add(saved.id)
      if(!Array.isArray(saved.position)||saved.position.length!==3||!saved.position.every(n=>Number.isFinite(n)&&Math.abs(n)<=10000) ||
        !Number.isFinite(saved.yaw)||Math.abs(saved.yaw)>1e9 || !Number.isFinite(saved.hp)||saved.hp<0||saved.hp>200 || typeof saved.alive!=='boolean'||saved.alive!==(saved.hp>0) || typeof saved.sleeping!=='boolean')invalid()
      if(safeRooms?.contains(new T.Vector3().fromArray(saved.position)))invalid()
      if(staged&&safeRooms&&!safeRooms.allowsSectionSegment(member.spawn.sectionId,new T.Vector3().fromArray(saved.position),new T.Vector3().fromArray(saved.position)))invalid()
      for(const key of ['animationPending','sendRemaining','receiveRemaining'])if(!Number.isFinite(saved[key])||saved[key]<0||saved[key]>(key==='animationPending'?.25:alerts.cooldown)+.000001)invalid()
      member.ai.validateCapture(saved.ai);member.animation.validateCapture(saved.animation)
      if((saved.ai.state==='DEAD')!==!saved.alive || saved.ai.observedHp<saved.hp || !saved.alive && (saved.animation.index!==INFECTED_CLIPS.Death.index || saved.animation.loop) ||
        saved.sleeping && (!full || saved.mode!=='ordinary' || !saved.alive || saved.ai.state!=='WANDER' || saved.ai.observedHp!==saved.hp || saved.ai.lastSeen || saved.ai.lastHeard))invalid()
    }
    // No current nav/door query: the host synchronizes its world before restore.
    return JSON.parse(JSON.stringify(data))
  }
  function restore(data) {
    const saved=validateCapture(data)
    if(disposed)throw Error('CH2 director disposed')
    setEnabled(false)
    time=saved.time;frame=saved.frame;resets=saved.resets
    for(const entry of saved.members){
      const member=members.find(m=>m.spawn.id===entry.id),state=crowd.get(member)
      member.target.restoreState(entry);member.instance.root.position.fromArray(entry.position);member.instance.root.rotation.y=entry.yaw
      member.ai.restore(entry.ai)
      let pose=entry.animation
      if(!entry.alive)pose={index:INFECTED_CLIPS.Death.index,time:INFECTED_CLIPS.Death.duration,loop:false}
      else if(entry.ai.state==='ATTACK')pose={index:INFECTED_CLIPS.Idle.index,time:0,loop:true}
      member.animation.restore(pose)
      Object.assign(state,{blockedFor:0,blocker:null,yieldPoint:null,yieldUntil:0,approach:null,
        sleeping:entry.sleeping,animationPending:entry.animationPending,sendAfter:time+entry.sendRemaining,receiveAfter:time+entry.receiveRemaining})
    }
    // Do not use reset or damage; restoring facts has no kills/rewards/contacts.
    finished=staged?saved.finished:false;activeSections=new Set(staged?saved.activeSections:[]);enabled=saved.enabled
    for(const member of members){const active=memberEnabled(member);member.ai.setEnabled(active);member.target.setEnabled(active);member.instance.root.visible=active;crowd.get(member).enabled=active;member.ai.setSleeping(crowd.get(member).sleeping)}
    return true
  }
  if(!owners.has(g))owners.set(g,new Set())
  owners.get(g).add(ownerKey)
  try {
    for(const [index,spawn] of spawns.entries()) {
      const member={spawn};members.push(member)
      crowd.set(member,{index,post:spawn.post,yaw:spawn.initialYaw,blockedFor:0,blocker:null,yieldPoint:null,yieldUntil:0,approach:null,sleeping:false,animationPending:0,logicalUpdates:0,sleepTicks:0,updateState:'native',sendAfter:0,receiveAfter:0})
      member.instance=asset.createInstance({height:p.height})
      member.instance.root.name=spawn.id;member.instance.root.position.set(spawn.position.x,spawn.position.y,spawn.position.z)
      member.instance.root.rotation.y=spawn.initialYaw
      member.animation=createCharacterAnimation(T,member.instance,asset);member.voice=bank.createVoice()
      const moveCapsule=(...args)=>move(member,...args)
      member.target=installCharacterTarget(g,member.instance,{animation:member.animation,clipFor:role=>INFECTED_CLIPS[role]?.index,onStop:()=>member.voice.stop(),moveCapsule,canAttack:()=>canAttack(member)})
      member.target.actor.id=spawn.id
      member.ai=createChapter2Infected(g,{...member,section:deployment?.section,moveCapsule,approachGoal:point=>approach(member,point),patrol:spawn.patrol,
        navigation:sectionNavigation.get(spawn.sectionId)||navigation,
        waitingGoal:()=>staged?safeRooms?.waitingPoint(spawn.sectionId,member.target.actor.pos,g.player.pos):null,onClue:clue=>broadcast(member,clue)})
      member.animation.playClip(INFECTED_CLIPS.Idle.index,{loop:true,fade:0,restart:true})
      g.scene.add(member.instance.root)
    }
    g.physics.moveCapsule=playerMove
    syncActivation(true)
  }catch(error){release();throw error}
  return {members,setEnabled,activateSection,finish,capture,validateCapture,restore,
    update(dt) {
      if(disposed || !enabled || !Number.isFinite(dt) || dt<=0)return
      if(g.game.state==='playing' && g.player.alive && g.player.enabled){time+=dt;frame++}
      // Rotate first mover to avoid a permanent creation-order right of way.
      // No snapshots/event histories are copied to schedule these updates.
      for(let i=0;i<members.length;i++){
        const member=members[(i+frame)%members.length],state=crowd.get(member),actor=member.target.actor
        if(!memberEnabled(member))continue
        if(g.game.state!=='playing' || !g.player.alive || !g.player.enabled){member.ai.update(dt,{animationDt:0});state.animationPending=0;continue}
        const distance=horizontal(actor.pos,g.player.pos),status=member.ai.scheduling()
        const canSleep=full && member.ai.canSleep() && distance>(state.sleeping?30:36) &&
          !g.physics.lineOfSight(actor.pos.clone().add(new T.Vector3(0,1.5,0)),g.player.eye)
        state.sleeping=canSleep;member.ai.setSleeping(canSleep)
        if(canSleep){member.ai.sleep(dt);state.sleepTicks++;state.updateState='sleep';state.animationPending=0;continue}
        const nativeAnimation=!full || distance<=30 || status.visible || ['ATTACK','STAGGER','ALERT'].includes(status.state) || status.pendingDamage || !actor.alive
        state.animationPending+=dt
        const animationDt=nativeAnimation || state.animationPending>=.2?state.animationPending:0
        if(animationDt)state.animationPending=0
        member.ai.update(dt,{animationDt});state.logicalUpdates++
        state.updateState=!actor.alive&&member.animation.finished()?'dead-terminal':nativeAnimation?'native':'far-animation-5hz'
      }
    },
    reset() {
      if(disposed)return
      time=frame=0;resets++;finished=false;activeSections=new Set(staged&&enabled?['ch2.s1']:[])
      for(const key of Object.keys(stats))stats[key]=0
      alerts.sent=alerts.received=0
      for(const member of members) {
        const state=crowd.get(member),{spawn,instance,target,animation,ai}=member
        target.reset();target.setEnabled(enabled)
        instance.root.position.set(spawn.position.x,spawn.position.y,spawn.position.z);instance.root.rotation.y=state.yaw
        Object.assign(state,{blockedFor:0,blocker:null,yieldPoint:null,yieldUntil:0,approach:null,sleeping:false,animationPending:0,sleepTicks:0,updateState:'native',sendAfter:0,receiveAfter:0})
        animation.playClip(INFECTED_CLIPS.Idle.index,{loop:true,fade:0,restart:true});ai.reset()
      }
      syncActivation(true)
    },
    snapshot:()=>({sectionId,disposed,time,resets,enabled,staged,finished,activeSections:CH2_SECTIONS.filter(s=>activeSections.has(s.id)).map(s=>s.id),logicalActorCount:members.length,alive:members.filter(m=>m.target.actor.alive).length,
      awakeCount:members.filter(m=>memberEnabled(m)&&m.target.actor.alive&&!crowd.get(m)?.sleeping).length,
      sleepCount:members.filter(m=>memberEnabled(m)&&m.target.actor.alive&&crowd.get(m)?.sleeping).length,
      deadCount:members.filter(m=>!m.target.actor.alive).length,
      updates:{logical:members.reduce((n,m)=>n+(crowd.get(m)?.logicalUpdates??0),0),animation:members.reduce((n,m)=>n+m.animation.updateCount(),0)},
      alerts:{...alerts,enabled:full},navigation:navigation?.snapshot()??(staged?Object.fromEntries([...sectionNavigation].map(([id,nav])=>[id,nav.snapshot()])):null),
      crowd:{...stats,policy:'native swept capsules; local yielding; private perception/tracking goals; bounded credible local clues in full mode; no refill'},
      members:members.map(member=>{const state=crowd.get(member);return {id:member.spawn.id,spawn:member.spawn.position,
        mode:member.spawn.mode,omniscientTracking:member.spawn.omniscientTracking,
        sleeping:state?.sleeping??false,updateState:disposed?'disposed':memberEnabled(member)?state.updateState:'disabled',updates:{logical:state?.logicalUpdates??0,animation:member.animation.updateCount(),sleepTicks:state?.sleepTicks??0},
        hp:member.target.actor.hp,alive:member.target.actor.alive,position:member.target.actor.pos.toArray(),
        ai:member.ai.snapshot(),animation:member.animation.snapshot(),voice:member.voice.snapshot(),
        crowd:state?{post:state.post,initialYaw:state.yaw,blockedFor:state.blockedFor,blocker:state.blocker,approach:state.approach?.toArray()??null,yieldPoint:state.yieldPoint?.toArray()??null}:null}})}),
    dispose(){if(disposed)return;disposed=true;release()},
  }
}
