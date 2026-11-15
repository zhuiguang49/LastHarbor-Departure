import { INFECTED_CLIPS } from './character-clips.mjs'
import { CH2_SECTIONS } from './campaign-ch2-layout.mjs'

// Candidate combat values, awaiting user playtesting. No refill.
export const CH2_INFECTED_TUNING = Object.freeze({
  stepRadius:10, gunRadius:25, sightRadius:10, fovDegrees:100,
  wanderRadius:3, walkSpeed:1.1, investigateSpeed:1.8, chaseSpeed:3.6, sprintSpeed:6.4, sprintDistance:5, turnSpeed:4.5,
  alertSeconds:.7, awarenessSeconds:3,
  repathSeconds:.75, goalChange:1.25, arrival:.25, investigateSeconds:7, searchSeconds:5,
  attackDistance:1.5, lungeDistance:2.8, contactStart:0, contactEnd:.9,
  damage:15, contactRange:1.65, lungeSpeed:2.4, recoverySeconds:.25,
  radius:.32, height:1.8,
})

export function createChapter2Infected(g, {spawn,instance,animation,target,voice,moveCapsule = (...args) => g.physics.moveCapsule(...args),approachGoal = point => point,waitingGoal = () => null,patrol = true,navigation = null,opponent = () => g.player,onClue = () => {},section = CH2_SECTIONS.find(s=>s.id===spawn.sectionId)}) {
  const T=g.THREE, p=CH2_INFECTED_TUNING, actor=target.actor, root=instance.root
  if(!section)throw Error(`Unknown CH2 infected section: ${spawn.sectionId}`)
  const home=new T.Vector3(spawn.position.x,spawn.position.y,spawn.position.z)
  const velocity=new T.Vector3(),delta=new T.Vector3(),before=new T.Vector3()
  const eye=new T.Vector3(),source=new T.Vector3(),forward=new T.Vector3()
  const playerSample=g.player.pos.clone(),steps=[],shots=[],events=[]
  let disposed=false,enabled=true,sleeping=false,clock=0,state='WANDER',stateTime=0,hp=actor.hp
  let lastSeen=null,lastHeard=null,visible=false,attack=null,cooldown=0,stagger=0
  let awareUntil=0
  const mode=spawn.mode??'ordinary',tracker=mode==='omniscient-tracker'
  let trackingPosition=null,firstAttackStarted=false,staggerFrom='WANDER',staggerSpeed=p.walkSpeed*.9
  let chaseSpeed=p.chaseSpeed
  let goal=null,path=[],pathIndex=0,nextPlan=0,plannedGoal=null,wanderWait=.75,blockedTime=0
  let lastRole=null,voiceKind=null,nextIdle=0
  const navStats={attempts:0,failures:0,lastFailure:null,lastGoal:null,lastEndpoint:null}
  const motion={distance:0,lastDistance:0,speed:0,hitWall:false,moving:false}
  const signals={stepsAccepted:0,stepsRejected:0,shotsAccepted:0,shotsRejected:0}
  const live=()=>enabled && !disposed && g.game.state==='playing' && g.player.alive && g.player.enabled && actor.alive
  const horizontal=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)
  const record=(type,data={})=>{events.push({type,time:clock,...data});if(events.length>64)events.shift()}
  const clearPath=()=>{path=[];pathIndex=0;plannedGoal=null;blockedTime=0}
  const inSection=v=>v.x>=section.bounds.minX && v.x<=section.bounds.maxX && v.z>=section.bounds.minZ && v.z<=section.bounds.maxZ
  const role=name=>{
    if(lastRole===name)return
    const clip=INFECTED_CLIPS[name]
    animation.playClip(clip.index,{loop:clip.loop,fade:clip.fade,restart:false});lastRole=name
  }
  function sound(kind,loop=false) {
    if(tracker && !firstAttackStarted)return
    source.copy(actor.pos).y+=1.1
    voice.update(source,{occluded:!g.physics.lineOfSight(g.player.eye,source)})
    voice.play(kind,source,{loop});voiceKind=kind
  }
  function silence() {voice.stop();voiceKind=null}
  function enter(next,reason) {
    if(state===next)return
    record('state',{from:state,to:next,reason});state=next;stateTime=0;lastRole=null
    if(next==='ALERT'){clearPath();role('Alert');sound('alert')}
    else if(next==='CHASE')sound('chase',true)
    else if(next!=='ATTACK'){silence();nextIdle=clock+2}
  }
  function cancel(reason) {
    target.cancelAttack()
    if(attack){record('attack-cancelled',{reason});attack=null;cooldown=p.recoverySeconds;enter('SEARCH',reason)}
    silence();steps.length=shots.length=0;playerSample.copy(g.player.pos)
    motion.lastDistance=motion.speed=0;motion.moving=false
  }
  const onState=({state:next})=>{if(next!=='playing')cancel(`game:${next}`);else playerSample.copy(g.player.pos)}
  const onPlayerDeath=()=>cancel('player:dead')
  const onStep=event=>{
    const player=g.player
    if(!live() || !event?.pos || !player.onGround || player.crouching || !(player.speed>.5) || !player.vel || Math.hypot(player.vel.x,player.vel.z)<=.5){signals.stepsRejected++;return}
    // The native emitter passes the mutable post-collision player.pos. Copy now;
    // validate actual movement in the later campaign tick, never from input.
    if(steps.length<4)steps.push({pos:event.pos.clone(),speed:player.speed})
  }
  const onFire=event=>{
    const pos=event?.origin,dir=event?.dir
    if(!live() || !pos || !dir || !['x','y','z'].every(k=>Number.isFinite(pos[k])&&Number.isFinite(dir[k])) || (event.weapon && !['rifle','pistol'].includes(event.weapon))){signals.shotsRejected++;return}
    if(shots.length<4)shots.push({pos:new T.Vector3(pos.x,pos.y,pos.z),ground:g.player.pos.clone()})
  }
  g.events.on('player:step',onStep);g.events.on('weapon:fire',onFire)
  g.events.on('game:state',onState);g.events.on('player:dead',onPlayerDeath)

  function hear(dt) {
    eye.copy(actor.pos).y+=1.1
    const actual=horizontal(g.player.pos,playerSample),actualSpeed=actual/dt
    for(const step of steps) {
      const travelled=horizontal(step.pos,playerSample)
      const valid=live() && g.player.onGround && !g.player.crouching && actualSpeed>.5 && actual<=6.4*dt+.05 && travelled>.001 && horizontal(step.pos,g.player.pos)<.1
      source.copy(step.pos).y+=.2
      if(valid && actor.pos.distanceTo(step.pos)<=p.stepRadius && g.physics.lineOfSight(eye,source)){
        lastHeard={kind:'step',position:step.pos.clone(),time:clock};signals.stepsAccepted++
        record('heard',{kind:'step',position:step.pos.toArray()})
      }else signals.stepsRejected++
    }
    for(const shot of shots) {
      if(actor.pos.distanceTo(shot.pos)<=p.gunRadius && g.physics.lineOfSight(eye,shot.pos)){
        lastHeard={kind:'gun',position:shot.ground.clone(),source:shot.pos.clone(),time:clock};signals.shotsAccepted++
        record('heard',{kind:'gun',position:shot.pos.toArray()})
      }else signals.shotsRejected++
    }
    steps.length=shots.length=0;playerSample.copy(g.player.pos)
  }
  function see() {
    const victim=opponent()
    if(!victim || victim.alive===false || victim.enabled===false){visible=false;return}
    eye.copy(actor.pos).y+=1.5
    delta.copy(victim.pos).sub(actor.pos)
    const distance=delta.length();delta.y=0
    forward.set(-Math.sin(root.rotation.y),0,-Math.cos(root.rotation.y))
    visible=distance<=p.sightRadius && (delta.lengthSq()<1e-8 || delta.normalize().dot(forward)>=Math.cos(p.fovDegrees*Math.PI/360)) && g.physics.lineOfSight(eye,victim.eye)
    if(visible)lastSeen={position:victim.pos.clone(),time:clock}
  }
  const memory=()=>!lastSeen?lastHeard:!lastHeard?lastSeen:lastSeen.time>=lastHeard.time?lastSeen:lastHeard
  function failPath(reason) {
    navStats.failures++;navStats.lastFailure=reason;clearPath()
    record('path-failed',{reason,goal:goal?.toArray()??null})
  }
  function plan() {
    const nav=g.physics.nav
    navStats.attempts++;navStats.lastGoal=goal.toArray();navStats.lastEndpoint=null
    nextPlan=clock+p.repathSeconds;plannedGoal=goal.clone();path=[];pathIndex=0
    // Native findPath silently replaces blocked endpoints up to 12 cells away.
    // Reject those before querying, and verify the returned endpoint and every leg.
    if(!nav.isWalkable(actor.pos.x,actor.pos.z)||!nav.isWalkable(goal.x,goal.z)){failPath('unwalkable-endpoint');return}
    const route=navigation?.findPath(actor.pos,goal)
    const result=navigation?route?.path:nav.findPath(actor.pos,goal)
    navStats.strategy=route?.kind??'native-local';navStats.intermediate=route?.intermediate??[]
    if(!result?.length){failPath('no-path-with-native-9000-budget');return}
    navStats.lastEndpoint=result.at(-1).toArray()
    if(horizontal(result.at(-1),goal)>.05){failPath('replaced-endpoint');return}
    let from=actor.pos
    for(const point of result) {
      if(!nav.isWalkable(point.x,point.z)||!nav.clearLine(from,point)){failPath('blocked-path-leg');return}
      // A pursuer can be outside its home circle when search ends. Its real
      // return path must remain usable; only patrols starting at home are local.
      if(state==='WANDER' && horizontal(actor.pos,home)<=p.wanderRadius && (!inSection(point)||horizontal(point,home)>p.wanderRadius+1)){failPath('wander-outside-home');return}
      from=point
    }
    path=result.map(point=>point.clone());blockedTime=0;navStats.lastFailure=null
    record('path',{goal:goal.toArray(),points:path.map(point=>point.toArray())})
  }
  function move(dt,speed) {
    if(!goal || horizontal(actor.pos,goal)<=p.arrival)return
    if(clock>=nextPlan && (!path.length || pathIndex>=path.length || !plannedGoal || horizontal(plannedGoal,goal)>=p.goalChange))plan()
    if(pathIndex>=path.length)return
    let remaining=dt
    while(remaining>1e-6 && pathIndex<path.length) {
      const waypoint=path[pathIndex]
      // Dynamic collision/nav changes invalidate the leg immediately, before movement.
      if(!g.physics.nav.isWalkable(waypoint.x,waypoint.z)||!g.physics.nav.clearLine(actor.pos,waypoint)){failPath('path-leg-invalidated');break}
      delta.copy(waypoint).sub(actor.pos);delta.y=0
      const distance=delta.length()
      if(distance<.04){pathIndex++;continue}
      const slice=Math.min(.05,remaining,distance/speed),yaw=Math.atan2(-delta.x,-delta.z)
      const turn=Math.atan2(Math.sin(yaw-root.rotation.y),Math.cos(yaw-root.rotation.y))
      root.rotation.y+=Math.max(-p.turnSpeed*slice,Math.min(p.turnSpeed*slice,turn))
      before.copy(actor.pos);velocity.copy(delta).multiplyScalar(speed/distance);velocity.y=-9.81*slice
      const result=moveCapsule(actor.pos,velocity,slice,p.radius,p.height,true)
      const travelled=horizontal(before,actor.pos)
      motion.lastDistance+=travelled;motion.hitWall ||= !!result?.hitWall
      remaining-=slice
      if(travelled<.001){blockedTime+=slice;break}
      blockedTime=0
    }
    if(blockedTime>=.25)failPath('capsule-stalled')
  }
  function wander(dt) {
    if(goal && horizontal(actor.pos,goal)<=p.arrival){goal=null;clearPath();wanderWait=1.5+Math.random()*2}
    if(!goal && (wanderWait-=dt)<=0) {
      if(horizontal(actor.pos,home)>p.wanderRadius){goal=home.clone();clearPath()}
      else for(let i=0;i<6;i++) {
        const angle=Math.random()*Math.PI*2,radius=1+Math.random()*(p.wanderRadius-1)
        const candidate=home.clone().add(new T.Vector3(Math.cos(angle)*radius,0,Math.sin(angle)*radius))
        if(inSection(candidate)&&g.physics.nav.isWalkable(candidate.x,candidate.z)){goal=candidate;clearPath();break}
      }
      wanderWait=1
    }
    move(dt,p.walkSpeed)
    // Failed wander goals expire rather than retrying the same unreachable point forever.
    if(goal && !path.length && clock>=nextPlan){goal=null;wanderWait=1}
  }
  function startAttack() {
    const victim=opponent()
    if(!victim || victim.alive===false || victim.enabled===false)return false
    const distance=horizontal(actor.pos,victim.pos)
    eye.copy(actor.pos).y+=1.1;source.copy(victim.pos).y+=.9
    if((!tracker && !visible) || cooldown>0 || distance>p.lungeDistance || Math.abs(actor.pos.y-victim.pos.y)>.65 || !g.physics.lineOfSight(eye,source))return false
    const name=distance<=p.attackDistance?'Attack':'Lunge Attack',clip=INFECTED_CLIPS[name]
    const spec={clip:clip.index,duration:clip.duration,contactStart:p.contactStart,contactEnd:p.contactEnd,
      damage:p.damage,range:p.contactRange,lungeSpeed:name==='Lunge Attack'?p.lungeSpeed:0}
    if(!target.beginAttack(spec))return false
    firstAttackStarted=true
    // Immediate contact can synchronously cancel via player:dead/game:state.
    if(!live())return true
    attack={...spec,elapsed:0,role:name};clearPath();enter('ATTACK',name);sound('attack')
    record('attack',{role:name,position:actor.pos.toArray()});return true
  }
  function update(dt,{animationDt=dt}={}) {
    if(disposed || !enabled || !Number.isFinite(dt) || dt<=0)return
    if(g.game.state!=='playing' || !g.player.alive || !g.player.enabled){cancel('not-playing');return}
    clock+=dt;stateTime+=dt;cooldown=Math.max(0,cooldown-dt)
    motion.lastDistance=motion.speed=0;motion.hitWall=motion.moving=false
    if(!actor.alive || actor.hp<=0) {
      if(state!=='DEAD'){cancel('dead');clearPath();goal=null;lastSeen=lastHeard=null;visible=false;enter('DEAD','hp')}
      hp=actor.hp;target.update(dt,{animationDt});return // Bridge owns the one-shot Death/terminal pose.
    }
    if(actor.hp<hp) {
      if(state!=='STAGGER'){
        staggerFrom=['CHASE','ATTACK'].includes(state)?'CHASE':state==='INVESTIGATE'?'INVESTIGATE':'WANDER'
        staggerSpeed=(staggerFrom==='CHASE'?chaseSpeed:staggerFrom==='INVESTIGATE'?p.investigateSpeed:p.walkSpeed)*.9
      }
      target.cancelAttack()
      if(attack){record('attack-cancelled',{reason:'hit'});attack=null;cooldown=p.recoverySeconds}
      stagger=INFECTED_CLIPS.Hit.duration
      awareUntil=clock+p.awarenessSeconds
      enter('STAGGER','hp-decreased');stateTime=0 // Bridge already started Hit; never replay it here.
    }
    hp=actor.hp
    const waiting=waitingGoal()
    if(waiting){
      cancel('safe-room-wait');visible=false
      if(!goal||horizontal(goal,waiting)>.01){clearPath();nextPlan=clock}
      goal=waiting
      if(state==='STAGGER'){stagger-=dt;if(stagger<=0)enter('SEARCH','safe-room-wait')}
      else enter('SEARCH','safe-room-wait')
      move(dt,p.walkSpeed)
      target.update(dt,{animationDt})
      motion.distance+=motion.lastDistance;motion.speed=motion.lastDistance/dt;motion.moving=motion.speed>.1
      if(state!=='STAGGER')role(motion.moving?'Walk':'Idle')
      return
    }
    hear(dt);see()
    if(visible)onClue({kind:'seen',position:lastSeen.position,time:clock})
    else if(lastHeard?.time===clock && lastHeard.kind!=='alert')onClue({kind:lastHeard.kind,position:lastHeard.position,time:clock})
    const victim=opponent()
    if(tracker && victim)trackingPosition=victim.pos.clone()
    const known=tracker?{position:trackingPosition}:memory(),wasAware=clock<=awareUntil
    // An old navigation goal never renews ordinary awareness.
    if(visible || lastHeard?.time===clock)awareUntil=clock+p.awarenessSeconds
    if(state==='STAGGER') {
      if(known)goal=staggerFrom==='CHASE'||tracker?approachGoal(known.position.clone()):known.position.clone()
      if(goal){
        eye.copy(actor.pos).y+=1.1;if(victim)source.copy(victim.pos).y+=.9
        const melee=!!victim&&(tracker||visible)&&staggerFrom==='CHASE'&&g.physics.lineOfSight(eye,source)
        const limit=melee?Math.max(0,(horizontal(actor.pos,victim.pos)-p.attackDistance)/dt):Infinity
        if(limit>0)move(dt,Math.min(staggerSpeed,limit))
      }
      stagger-=dt
      if(stagger<=0)enter(tracker||visible?'CHASE':known?'INVESTIGATE':'WANDER','hit-finished')
    }else {
      // Tracking is explicit and private; it never forges seen/heard evidence.
      if(tracker && !['CHASE','ATTACK'].includes(state))enter('CHASE','omniscient-tracking')
      if(state==='ATTACK') {
        if(attack.elapsed>=attack.duration){attack=null;cooldown=p.recoverySeconds;enter(tracker||visible?'CHASE':'INVESTIGATE','attack-recovery')}
      }else if(state==='ALERT') {
        if(stateTime>=p.alertSeconds)enter(visible?'CHASE':'INVESTIGATE','alert-finished')
      }else if(tracker || visible) {
        if(!['CHASE','ATTACK'].includes(state))enter(wasAware?'CHASE':'ALERT',wasAware?'sight-reacquired':'sight')
      }else if(state==='CHASE')enter('INVESTIGATE','lost-sight')
      else if(lastHeard?.time===clock && ['WANDER','SEARCH'].includes(state))enter(wasAware?'INVESTIGATE':'ALERT',wasAware?'sound-reacquired':'sound')

      if(state==='CHASE') {
        goal=known?approachGoal(known.position.clone()):null
        chaseSpeed=victim&&(tracker||visible)&&horizontal(actor.pos,victim.pos)>p.sprintDistance?p.sprintSpeed:p.chaseSpeed
        if(!startAttack() && goal){
          const distance=horizontal(actor.pos,goal),stopDistance=tracker&&!g.physics.lineOfSight(eye,source)?0:p.attackDistance
          // Recovery blocks the next swing, not pursuit. Stop at melee range
          // only with real LOS; a wall still requires completing the detour.
          if(distance>stopDistance)move(dt,Math.min(chaseSpeed,(distance-stopDistance)/dt))
        }
        if(!live())return
      }else if(state==='INVESTIGATE') {
        goal=known?.position.clone()??null
        if(!goal || horizontal(actor.pos,goal)<=p.arrival || stateTime>=p.investigateSeconds){clearPath();enter('SEARCH','last-location-reached-or-expired')}
        else move(dt,p.investigateSpeed)
      }else if(state==='SEARCH') {
        if(stateTime>=p.searchSeconds){lastSeen=lastHeard=null;goal=null;clearPath();wanderWait=.75;enter('WANDER','search-expired')}
      }else if(state==='WANDER' && patrol)wander(dt)
    }

    if(attack){attack.elapsed+=dt;before.copy(actor.pos)}
    target.update(dt,{animationDt}) // Sole attack + Mixer advancement, including the death clip.
    if(attack)motion.lastDistance+=horizontal(before,actor.pos)
    motion.distance+=motion.lastDistance;motion.speed=motion.lastDistance/dt;motion.moving=motion.speed>.1
    if(!['ALERT','ATTACK','STAGGER'].includes(state))role(motion.moving?(state==='CHASE'?'Run':'Walk'):(state==='SEARCH'?'Search':'Idle'))
    if(state==='CHASE' && !voiceKind)sound('chase',true)
    source.copy(actor.pos).y+=1.1
    voice.update(source,{occluded:!g.physics.lineOfSight(g.player.eye,source)})
    if(!voiceKind && clock>=nextIdle && ['WANDER','SEARCH','INVESTIGATE'].includes(state)){sound('idle');nextIdle=clock+12;voiceKind=null}
  }
  function clearTarget() {
    cancel('target-changed');clearPath();goal=null;lastSeen=lastHeard=null;visible=false;awareUntil=0;trackingPosition=null
    staggerFrom='WANDER'
    if(!['STAGGER','DEAD'].includes(state))enter('WANDER','target-changed')
  }
  function reset({position} = {}) {
    if(disposed)return
    if(position)home.copy(position)
    cancel('reset');clock=stateTime=0;state=actor.alive&&actor.hp>0?'WANDER':'DEAD';hp=actor.hp
    lastSeen=lastHeard=null;visible=false;attack=null;cooldown=stagger=awareUntil=0
    trackingPosition=null;firstAttackStarted=false;staggerFrom='WANDER';staggerSpeed=p.walkSpeed*.9
    chaseSpeed=p.chaseSpeed
    goal=null;clearPath();nextPlan=0;wanderWait=.75;lastRole=null;nextIdle=2;sleeping=false
    events.length=0;Object.assign(navStats,{attempts:0,failures:0,lastFailure:null,lastGoal:null,lastEndpoint:null})
    Object.assign(motion,{distance:0,lastDistance:0,speed:0,hitWall:false,moving:false})
    for(const key of Object.keys(signals))signals[key]=0
  }
  const copyMemory=m=>m?{...m,position:m.position.toArray(),...(m.source?{source:m.source.toArray()}:{})}:null
  function capture() {
    return {mode,state:actor.alive?state:'DEAD',time:clock,stateTime,observedHp:hp,firstAttackStarted,
      lastSeen:copyMemory(lastSeen),lastHeard:copyMemory(lastHeard),awarenessRemaining:Math.max(0,awareUntil-clock),
      goal:goal?.toArray()??null,trackingPosition:trackingPosition?.toArray()??null,
      cooldown,stagger:Math.max(0,stagger),staggerFrom,staggerSpeed,chaseSpeed,wanderWait,nextIdleRemaining:Math.max(0,nextIdle-clock),
      attackRemaining:attack?Math.max(0,attack.duration-attack.elapsed):0}
  }
  function validateCapture(data) {
    const invalid=()=>{throw Error(`Invalid CH2 AI capture: ${spawn.id}`)}
    if(!data || data.mode!==mode || !['WANDER','ALERT','CHASE','INVESTIGATE','SEARCH','ATTACK','STAGGER','DEAD'].includes(data.state) || typeof data.firstAttackStarted!=='boolean')invalid()
    for(const key of ['time','stateTime','observedHp','awarenessRemaining','cooldown','stagger','staggerSpeed','chaseSpeed','wanderWait','nextIdleRemaining','attackRemaining'])
      if(!Number.isFinite(data[key])||data[key]<0||data[key]>1e9)invalid()
    if(data.stateTime>data.time+.000001 || data.observedHp>200 || data.awarenessRemaining>p.awarenessSeconds+.000001 || data.cooldown>3 || data.stagger>INFECTED_CLIPS.Hit.duration+.000001 || data.staggerSpeed>p.sprintSpeed || ![p.chaseSpeed,p.sprintSpeed].includes(data.chaseSpeed) || data.attackRemaining>2 || !['WANDER','INVESTIGATE','CHASE'].includes(data.staggerFrom))invalid()
    const point=value=>value===null || Array.isArray(value)&&value.length===3&&value.every(n=>Number.isFinite(n)&&Math.abs(n)<=10000)
    for(const key of ['goal','trackingPosition'])if(!point(data[key]))invalid()
    if(!tracker&&data.trackingPosition!==null)invalid()
    for(const key of ['lastSeen','lastHeard']){
      const m=data[key]
      if(m!==null && (!m || !point(m.position) || m.position===null || !Number.isFinite(m.time)||m.time<0||m.time>data.time+.000001 ||
        key==='lastHeard'&&!['step','gun','alert'].includes(m.kind) || m.source!==undefined&&(!point(m.source)||m.source===null)))invalid()
    }
    return JSON.parse(JSON.stringify(data))
  }
  function restore(data) {
    const saved=validateCapture(data)
    cancel('restore');clearPath()
    clock=saved.time;state=saved.state;stateTime=saved.stateTime;hp=saved.observedHp
    firstAttackStarted=saved.firstAttackStarted
    const restoreMemory=m=>m?{...m,position:new T.Vector3().fromArray(m.position),...(m.source?{source:new T.Vector3().fromArray(m.source)}:{})}:null
    lastSeen=restoreMemory(saved.lastSeen);lastHeard=restoreMemory(saved.lastHeard)
    trackingPosition=saved.trackingPosition?new T.Vector3().fromArray(saved.trackingPosition):null
    goal=saved.goal?new T.Vector3().fromArray(saved.goal):null
    awareUntil=clock+saved.awarenessRemaining;cooldown=saved.cooldown
    if(state==='ATTACK'){state=tracker?'CHASE':'INVESTIGATE';stateTime=0;cooldown=Math.max(cooldown,saved.attackRemaining+p.recoverySeconds)}
    stagger=saved.stagger;staggerFrom=saved.staggerFrom;staggerSpeed=saved.staggerSpeed;chaseSpeed=saved.chaseSpeed
    wanderWait=saved.wanderWait;nextIdle=clock+saved.nextIdleRemaining;nextPlan=clock
    visible=false;attack=null;lastRole=null;sleeping=false
    steps.length=shots.length=0;playerSample.copy(g.player.pos)
    events.length=0
  }
  reset()
  return {update,reset,clearTarget,capture,validateCapture,restore,
    setEnabled(value){enabled=!!value;cancel('chapter-switch');sleeping=false},
    canSleep:()=>!tracker && actor.alive && actor.hp===hp && state==='WANDER' && !lastSeen && !lastHeard && !steps.length && !shots.length,
    setSleeping(value){if(value&&!sleeping)silence();sleeping=!!value},
    sleep(dt){if(enabled && dt>0){clock+=dt;stateTime+=dt;cooldown=Math.max(0,cooldown-dt);playerSample.copy(g.player.pos)}},
    scheduling:()=>({state,visible,pendingDamage:actor.hp!==hp}),
    receiveClue(clue) {
      if(!live() || tracker)return false
      lastHeard={kind:'alert',originKind:clue.kind,position:clue.position.clone(),time:clock}
      if(['WANDER','SEARCH'].includes(state))enter('ALERT','local-credible-clue')
      return true
    },
    snapshot:()=>({id:spawn.id,actorId:actor.id,sectionId:spawn.sectionId,state,stateTime,time:clock,hp:actor.hp,alive:actor.alive,disposed,
      mode,enabled,sleeping,trackingPosition:trackingPosition?.toArray()??null,firstAttackStarted,silent:tracker&&!firstAttackStarted,
      pursuit:state==='CHASE'||state==='STAGGER'&&staggerFrom==='CHASE'?{phase:chaseSpeed===p.sprintSpeed?'far':'near',nominalSpeed:chaseSpeed,locked:tracker||visible}:null,
      stagger:state==='STAGGER'?{from:staggerFrom,speed:staggerSpeed,remaining:stagger}:null,
      position:actor.pos.toArray(),visible,awarenessRemaining:Math.max(0,awareUntil-clock),lastSeen:copyMemory(lastSeen),lastHeard:copyMemory(lastHeard),
      goal:goal?.toArray()??null,localTarget:path[pathIndex]?.toArray()??null,path:path.map(point=>point.toArray()),pathIndex,
      navigation:{...navStats,nextPlan},motion:{...motion},signals:{...signals},attack:attack?{...attack}:null,cooldown,
      events:events.map(event=>({...event}))}),
    dispose(){if(disposed)return;cancel('dispose');clearPath();disposed=true
      g.events.off('player:step',onStep);g.events.off('weapon:fire',onFire)
      g.events.off('game:state',onState);g.events.off('player:dead',onPlayerDeath)},
  }
}
