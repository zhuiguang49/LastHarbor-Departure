import { CLEARANCE_CONFIG } from './campaign-ch3-clearance-config.mjs'
import { rayCapsuleDistance } from './campaign-ch3-sniper-core.mjs'
import { installCharacterTarget } from './character-native-target.mjs'
import { createClearanceEffects } from './campaign-ch3-clearance-effects.mjs'
import { createChapter3ClearanceNavigation } from './campaign-ch3-clearance-navigation.mjs'

const owners=new WeakMap()
const finitePoint=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]))
const horizontal=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)
const states=['IDLE','PATROL','INVESTIGATE','TRACK','LOCK','FIRE','HIT','DEAD']
const pending=m=>m.state==='TRACK'||m.state==='LOCK'
const shooting=m=>pending(m)||m.burstRemaining>0||m.state==='FIRE'&&m.firePose>0

export function installChapter3Clearance(g,{createVisual,deployments,narrative,onChange=()=>{},canEnter=()=>true,ownerKey='chapter-3',navigation:providedNavigation,approachSpeed=null,combat=null}) {
  if(owners.get(g)?.has(ownerKey))throw Error('CH3 clearance already installed')
  if(!Array.isArray(deployments)||!deployments.length||new Set(deployments.map(d=>d.id)).size!==deployments.length)
    throw Error('Clearance requires unique fixed deployments')
  for(const d of deployments)if(typeof d.id!=='string'||!d.id||!['central','west'].includes(d.route)||
    !(d.group===null||typeof d.group==='string')||d.route==='west'&&d.group!==null||!finitePoint(d.position)||!Number.isFinite(d.yaw)||
    !Array.isArray(d.patrol)||!Array.isArray(d.cover)||![...d.patrol,...d.cover].every(finitePoint)||
    !d.territory||!['minX','maxX','minZ','maxZ'].every(k=>Number.isFinite(d.territory[k]))||
    d.territory.minX>d.territory.maxX||d.territory.minZ>d.territory.maxZ)
    throw Error('Invalid clearance deployment')
  const T=g.THREE,p=CLEARANCE_CONFIG,members=[],effects=createClearanceEffects(g),history=[]
  const navigation=providedNavigation??createChapter3ClearanceNavigation(g,{canEnter,radius:p.radius})
  const nativeMove=g.physics.moveCapsule
  let time=0,turn=0,disposed=false,resetting=false,updating=false,enabled=false
  const stats={senses:0,farSenses:0,animationUpdates:0,paths:0,pathRejects:0,moves:0,bodyBlocks:0,shots:0,groupMessages:0,heard:0}
  const vector=point=>new T.Vector3(point.x,point.y,point.z)
  const active=()=>!disposed&&g.game.state==='playing'&&g.player.alive&&g.player.enabled!==false&&!narrative?.snapshot().active
  const inside=(m,v)=>{const b=m.definition.territory;return v.x>=b.minX&&v.x<=b.maxX&&v.z>=b.minZ&&v.z<=b.maxZ}
  const record=(type,m,data={})=>{history.push({type,id:m?.id??null,time,...data});if(history.length>128)history.shift()}
  const role=(m,value)=>{if(m.role!==value){m.role=value;m.visual.setState(value)}}
  function cancel(m){
    const had=shooting(m)
    m.aimElapsed=0;m.direction=m.visible=null;m.burstRemaining=0;m.burstWait=0;m.firePose=0
    if(had)m.cooldown=Math.max(m.cooldown||0,p.fireInterval)
    if(had){m.state=m.lastKnown?'INVESTIGATE':'IDLE';role(m,'Idle')}
    effects.cancel(m.id)
  }
  function stop(){for(const m of members){cancel(m);m.path=[]}effects.cancel()}
  function clearRay(from,to){
    const dir=to.clone().sub(from),distance=dir.length()
    if(distance<1e-5)return true
    const hit=g.physics.raycast(from,dir.multiplyScalar(1/distance),distance)
    return !hit||hit.dist>=distance-p.worldEpsilon
  }
  function perceive(m){
    stats.senses++
    const opponent=combat?m.opponent:g.player
    if(!opponent?.alive)return null
    const capsule=opponent.captureCampaignCollider(),eye=m.visual.getEye(),muzzle=m.visual.getMuzzle()
    const offset=capsule.position.clone().sub(eye),forward=m.visual.getForward().clone().setY(0).normalize()
    if(offset.length()>p.range)return null
    const threshold=Math.cos(p.horizontalFovDegrees*Math.PI/360),flat=offset.clone().setY(0).normalize()
    if(flat.dot(forward)<threshold)return null
    const side=new T.Vector3(-flat.z,0,flat.x),r=capsule.radius,h=capsule.height
    for(const [x,y] of [[0,h-r-.12],[0,h-r*.35],[-r*.65,h-r-.18],[r*.65,h-r-.18],
      [0,Math.max(r,h*.45)],[-r*.65,r+.15],[r*.65,r+.15],[0,r*.5]]){
      const point=capsule.position.clone().addScaledVector(side,x);point.y+=y
      const direction=point.clone().sub(eye)
      if(direction.length()<=p.range&&direction.setY(0).normalize().dot(forward)>=threshold&&clearRay(eye,point)&&clearRay(muzzle,point))return point
    }
    return null
  }
  function remember(m,point,kind){
    m.lastKnown=point.clone();m.memory=p.memorySeconds;m.knownKind=kind
    if(!m.shared&&kind!=='group'&&m.definition.group!==null){
      m.shared=true
      for(const peer of members)if(peer!==m&&peer.target.actor.alive&&peer.definition.group===m.definition.group&&horizontal(peer.target.actor.pos,m.target.actor.pos)<=p.groupRadius){
        peer.lastKnown=point.clone();peer.memory=p.memorySeconds;peer.knownKind='group';peer.shared=true
        peer.nextSense=0;stats.groupMessages++;record('group-alert',peer,{from:m.id,position:point.toArray()})
      }
    }
  }
  function hear(point,kind,radius){
    if(!active())return
    for(const m of members){
      if(!m.target.actor.alive)continue
      const distance=m.visual.getEye().distanceTo(point)
      if(distance>radius)continue
      const effective=kind==='gun'||clearRay(m.visual.getEye(),point)?radius:radius*p.occludedHearingScale
      if(distance>effective)continue
      const ground=point.clone();ground.y=m.target.actor.pos.y
      remember(m,ground,kind);m.nextSense=0;stats.heard++;record('heard',m,{kind,position:ground.toArray()})
    }
  }
  function observeCombat(m){
    const selected=combat.targetFor(m.target.actor),opponent=selected?.alive?selected:null
    if(opponent!==m.opponent){
      cancel(m);m.opponent=opponent;m.path=[];m.lastKnown=null;m.memory=0;m.shared=false;m.coverReached=false
      m.knownKind=null;m.observationTime=null;m.observationKind=null;m.nextSense=0
    }
    const clue=combat.observationFor(m.target.actor)
    // The field validates the source/faction/range. Only copy a new observation;
    // live target coordinates are read by perceive(), never as hidden goals.
    if(!clue||clue.id!==opponent?.id||clue.kind==='seen'||
      clue.time===m.observationTime&&clue.kind===m.observationKind)return
    m.observationTime=clue.time;m.observationKind=clue.kind
    const kind=clue.kind==='hit'?'shot':clue.kind==='step'?'step':'gun',point=clue.position.clone()
    point.y=m.target.actor.pos.y;remember(m,point,kind);m.nextSense=0
    stats.heard++;record('heard',m,{kind,targetId:clue.id,position:point.toArray()})
  }
  function onFire(event){
    if(combat)return
    // The original rifle omits weapon; P12 explicitly supplies 'pistol'.
    if(!finitePoint(event?.origin)||!finitePoint(event?.dir)||event.weapon!==undefined&&!['rifle','pistol'].includes(event.weapon)||
      horizontal(event.origin,g.player.pos)>1.5||event.origin.y<g.player.pos.y||event.origin.y>g.player.pos.y+2.2)return
    hear(vector(event.origin),'gun',p.gunRadius)
  }
  function onStep(event){
    if(combat)return
    if(!finitePoint(event?.pos)||!g.player.onGround||g.player.crouching||!(g.player.speed>.5)||
      !g.player.vel||Math.hypot(g.player.vel.x,g.player.vel.z)<=.5||horizontal(event.pos,g.player.pos)>.1)return
    const point=vector(event.pos);point.y+=.2
    hear(point,'step',event.sprint?p.sprintRadius:p.stepRadius)
  }
  // Reject swept body overlap before committing native steps; never eject actors.
  function blocked(member,from,to,radius,height,includePlayer=true){
    if(combat?.blocked(member?.target.actor??g.player,from,to,radius,height))return true
    const dx=to.x-from.x,dz=to.z-from.z,length=dx*dx+dz*dz
    const crosses=(position,r,h)=>{
      if(from.y>=position.y+h||from.y+height<=position.y)return false
      const t=length?Math.max(0,Math.min(1,((position.x-from.x)*dx+(position.z-from.z)*dz)/length)):0
      const start=horizontal(from,position),end=horizontal(to,position),clearance=radius+r+p.spacing
      return Math.hypot(from.x+t*dx-position.x,from.z+t*dz-position.z)<Math.min(start,clearance)-1e-5||
        start<clearance-1e-5&&end<=start
    }
    for(const peer of members)if(peer!==member&&peer.target.actor.alive&&crosses(peer.target.actor.pos,p.radius,p.height))return true
    if(includePlayer&&g.player.alive){const c=g.player.captureCampaignCollider();if(crosses(c.position,c.radius,c.height))return true}
    return false
  }
  function playerMove(position,velocity,dt,radius=.32,height=1.8,step=true){
    if(position!==g.player.pos||disposed||!enabled||!(dt>0))return nativeMove.call(g.physics,position,velocity,dt,radius,height,step)
    let remaining=dt,hitWall=false,result
    while(remaining>1e-7){
      const speed=Math.hypot(velocity.x,velocity.z),slice=Math.min(remaining,p.moveStep,.08/Math.max(speed,.01))
      const start=position.clone(),trialVelocity=velocity.clone()
      // Other chapter wrappers identify the real player vector. Preserve that
      // identity through the chain, then roll back before our swept-body check.
      result=nativeMove.call(g.physics,position,trialVelocity,slice,radius,height,step)
      const trial=position.clone();position.copy(start)
      if(blocked(null,position,trial,radius,height,false)){
        hitWall=true;velocity.x=velocity.z=0;stats.bodyBlocks++
      }else {position.copy(trial);velocity.copy(trialVelocity)}
      hitWall ||= !!result?.hitWall;remaining-=slice
    }
    return {...result,hitWall}
  }
  function plan(m,goal){
    const from=m.target.actor.pos
    m.path=[];m.nextPlan=p.repathSeconds;m.plannedGoal=goal.clone();stats.paths++
    const reject=()=>{stats.pathRejects++;return false}
    const route=navigation.findPath(from,goal)
    if(!route)return reject()
    m.path=route.path;return true
  }
  function move(m,goal,dt,speed){
    const pos=m.target.actor.pos,nav=g.physics.nav
    if(!goal||horizontal(pos,goal)<=p.arrival)return false
    if(m.nextPlan<=0&&(!m.path.length||!m.plannedGoal||horizontal(m.plannedGoal,goal)>p.goalChange))plan(m,goal)
    let remaining=Math.min(dt,p.maxMoveSeconds),moved=false
    while(remaining>1e-7&&m.path.length){
      const waypoint=m.path[0],delta=waypoint.clone().sub(pos).setY(0),distance=delta.length()
      if(distance<.04){m.path.shift();continue}
      if(!navigation.contains(waypoint)||!canEnter(pos,waypoint)||!nav.clearLine(pos,waypoint)||!nav.isWalkable(waypoint.x,waypoint.z)){m.path=[];break}
      const slice=Math.min(remaining,p.moveStep,distance/speed),velocity=delta.multiplyScalar(speed/distance)
      velocity.y=-9.81*slice
      const trial=pos.clone();nativeMove.call(g.physics,trial,velocity,slice,p.radius,p.height,true);stats.moves++
      if(horizontal(pos,trial)>speed*slice+1e-4||!navigation.contains(trial)||!canEnter(pos,trial)||!nav.clearLine(pos,trial)||
        !nav.isWalkable(trial.x,trial.z)||blocked(m,pos,trial,p.radius,p.height)){
        stats.bodyBlocks++;m.path=[];break
      }
      const yaw=Math.atan2(-delta.x,-delta.z),turn=Math.atan2(Math.sin(yaw-m.visual.root.rotation.y),Math.cos(yaw-m.visual.root.rotation.y))
      m.visual.root.rotation.y+=Math.max(-p.turnSpeed*slice,Math.min(p.turnSpeed*slice,turn))
      moved ||= horizontal(pos,trial)>.0001;pos.copy(trial);remaining-=slice
    }
    return moved
  }
  function goalFor(m){
    if(m.memory>0&&m.lastKnown){
      // Only a detached observation is a destination; never consult hidden player coordinates.
      const point=m.lastKnown.clone();point.y=m.target.actor.pos.y
      return point
    }
    const patrol=m.definition.patrol.length?vector(m.definition.patrol[m.patrolIndex]):vector(m.definition.position)
    return inside(m,patrol)?patrol:null
  }
  function commitFire(m,origin){
    m.visible=null;m.aimElapsed=0;m.state='FIRE';m.firePose=p.firePoseSeconds
    m.burstRemaining--;m.burstWait=p.burstInterval
    if(!m.burstRemaining){m.direction=null;m.cooldown=p.fireInterval}
    m.shots++;stats.shots++;role(m,'Fire');effects.fire(m.id,origin)
  }
  function fire(m){
    if(!active()||!m.target.actor.alive||!m.direction)return
    const origin=m.visual.getMuzzle().clone(),direction=m.direction.clone()
    if(combat){
      commitFire(m,origin)
      const result=combat.fire(m.target.actor,origin,direction,p.range,p.damage)
      record('shot',m,{origin:origin.toArray(),direction:direction.toArray(),hit:result.hit,damage:result.damage,
        targetId:result.targetId,worldDistance:result.worldDistance,actorDistance:result.actorDistance,friendDistance:result.friendDistance})
      if(result.blocked&&result.targetId===null&&result.point)
        g.events.emit('impact',{point:result.point,normal:result.normal,surface:result.surface||'metal',dir:direction,weapon:'rifle',from:'enemy'})
      return
    }
    // World is queried first. The live collider is sampled only at emission.
    const worldHit=g.physics.raycast(origin,direction,p.range)
    const playerDistance=rayCapsuleDistance(origin,direction,g.player.captureCampaignCollider(),p.range)
    let friendDistance=Infinity
    for(const peer of members)if(peer!==m&&peer.target.actor.alive){
      const distance=rayCapsuleDistance(origin,direction,{position:peer.target.actor.pos,radius:p.radius,height:p.height},p.range)
      if(distance!==null)friendDistance=Math.min(friendDistance,distance)
    }
    const hit=playerDistance!==null&&playerDistance<Math.min(worldHit?.dist??Infinity,friendDistance)-p.worldEpsilon
    commitFire(m,origin)
    record('shot',m,{origin:origin.toArray(),direction:direction.toArray(),hit,damage:hit?p.damage:0,
      worldDistance:worldHit?.dist??null,playerDistance,friendDistance:Number.isFinite(friendDistance)?friendDistance:null})
    if(worldHit&&worldHit.dist<Math.min(playerDistance??Infinity,friendDistance))
      g.events.emit('impact',{point:worldHit.point,normal:worldHit.normal,surface:worldHit.surface||'metal',dir:direction,weapon:'rifle',from:'enemy'})
    // Enemy rifle reports carry no new player evidence and cannot relay alerts.
    if(hit)g.player.damage(p.damage,origin)
  }
  function update(dt){
    if(disposed||updating)return
    const playing=active()
    if(playing!==enabled){enabled=playing;for(const m of members)m.target.setEnabled(playing)}
    if(!playing){stop();return}
    if(!Number.isFinite(dt)||dt<=0)return
    updating=true
    try{
      time+=dt
      for(const m of members){
        const actor=m.target.actor
        if(!actor.alive){if(!m.visual.animation.finished?.())m.visual.update(dt);continue}
        if(combat)observeCombat(m)
        m.cooldown=Math.max(0,m.cooldown-dt);m.recovery=Math.max(0,m.recovery-dt);m.nextPlan-=dt
        // Keep a finite clue while actually travelling to it, then search for six seconds.
        if(!m.lastKnown||horizontal(actor.pos,m.lastKnown)<=p.arrival||!m.path.length)m.memory=Math.max(0,m.memory-dt)
        m.nextSense-=dt;m.animationTime+=dt;m.firePose=Math.max(0,m.firePose-dt);m.burstWait=Math.max(0,m.burstWait-dt)
        if(!m.memory){m.lastKnown=null;m.knownKind=null;m.shared=false;m.coverReached=false}
        const far=horizontal(actor.pos,g.player.pos)>p.farDistance&&!m.memory&&!pending(m)
        if(m.state!=='LOCK'&&!m.burstRemaining&&m.nextSense<=0){
          m.visible=perceive(m);m.nextSense=far?p.farSenseSeconds:pending(m)?0:p.nearSenseSeconds
          if(far)stats.farSenses++
          if(m.visible){const ground=m.visible.clone();ground.y=actor.pos.y;remember(m,ground,'seen')}
          else if(m.state==='TRACK')cancel(m)
        }
        if(pending(m)&&m.recovery<=0){
          if(m.state==='TRACK'){
            // Tracking LOS must be current every frame, including near-sense ticks.
            m.visible=perceive(m)
            if(!m.visible||horizontal(actor.pos,m.visible)>p.stopRange){cancel(m);continue}
            const point=m.visible.clone();point.y=actor.pos.y;remember(m,point,'seen')
            m.visual.aimAt(m.visible)
          }
          m.aimElapsed+=dt
          if(m.state==='TRACK'&&m.aimElapsed>=p.aimSeconds-p.lockSeconds){
            m.direction=m.visible.clone().sub(m.visual.getMuzzle()).normalize();m.state='LOCK'
          }
          if(m.state==='LOCK'&&m.aimElapsed>=p.aimSeconds){m.burstRemaining=p.burstRounds;fire(m)}
        }
        else if(m.burstRemaining&&m.burstWait<=1e-8)fire(m)
        if(!active())break
        if(m.state==='LOCK'||m.burstRemaining)continue // Freeze evaluated pose through the final .15s and the whole burst.
        if(m.recovery>0){m.state='HIT'}
        else if(m.state==='FIRE'&&m.firePose>0){}
        else if(!pending(m)){
          const goal=goalFor(m)
          if(m.memory>0)m.state='INVESTIGATE'
          else if(m.patrolWait>0){m.patrolWait=Math.max(0,m.patrolWait-dt);m.state='IDLE'}
          else m.state=goal?'PATROL':'IDLE'
          let moving=false
          if(m.state!=='IDLE'&&!(m.visible&&horizontal(actor.pos,m.visible)<=p.stopRange))
            moving=move(m,goal,dt,approachSpeed!==null&&horizontal(actor.pos,g.player.pos)>p.stopRange?approachSpeed:
              m.memory?m.knownKind==='gun'?p.gunSpeed:p.alertSpeed:p.walkSpeed)
          if(goal&&horizontal(actor.pos,goal)<=p.arrival){
            if(m.memory>0)m.coverReached=true
            else {m.patrolIndex=(m.patrolIndex+1)%Math.max(1,m.definition.patrol.length);m.patrolWait=p.patrolWait;m.path=[]}
          }
          role(m,moving?'Patrol':'Idle')
        }
        if(!far||m.animationTime>=p.farAnimationSeconds){m.visual.update(m.animationTime);m.animationTime=0;stats.animationUpdates++}
      }
      if(!active()){stop();return}
      let slots=members.filter(shooting).length
      const groupCounts=new Map()
      for(const m of members.filter(shooting))if(m.definition.group!==null)groupCounts.set(m.definition.group,(groupCounts.get(m.definition.group)||0)+1)
      for(let offset=0;offset<members.length&&slots<p.maxShooters;offset++){
        const index=(turn+offset)%members.length,m=members[index],group=m.definition.group
        if(!m.target.actor.alive||shooting(m)||m.recovery>0||m.cooldown>0||!m.visible||m.firePose>0||
          group!==null&&(groupCounts.get(group)||0)>=p.maxGroupShooters)continue
        // Never grant a slot on stale cached sight or a group/hearing clue.
        m.visible=perceive(m);if(!m.visible||horizontal(m.target.actor.pos,m.visible)>p.stopRange)continue
        m.state='TRACK';m.aimElapsed=0;m.direction=null;m.path=[];m.nextSense=0
        role(m,'Aim');m.visual.aimAt(m.visible);slots++
        if(group!==null)groupCounts.set(group,(groupCounts.get(group)||0)+1)
        turn=(index+1)%members.length;record('aim',m)
        // Rebase the circular scan after each grant without skipping a candidate.
        offset=-1
      }
    }finally{updating=false}
  }
  function capture(){return {version:1,time,turn,members:members.map(m=>({id:m.id,hp:m.target.actor.hp,alive:m.target.actor.alive,
    position:m.target.actor.pos.toArray(),yaw:m.visual.root.rotation.y,state:m.state,lastKnown:m.lastKnown?.toArray()??null,
    knownKind:m.knownKind,memory:m.memory,shared:m.shared,coverReached:m.coverReached,patrolIndex:m.patrolIndex,
    patrolWait:m.patrolWait,cooldown:m.cooldown,recovery:m.recovery,shots:m.shots}))}}
  function validateCapture(saved){
    // The host validates before restoring saved doors. Check the fixed chapter
    // envelope here; native nav/canEnter use the restored world during movement.
    const invalid=()=>{throw Error('Invalid clearance checkpoint')}
    if(!saved||saved.version!==1||!Number.isFinite(saved.time)||saved.time<0||!Number.isInteger(saved.turn)||saved.turn<0||saved.turn>=members.length||
      !Array.isArray(saved.members)||saved.members.length!==members.length)invalid()
    const ids=new Set()
    for(const s of saved.members){
      const m=members.find(m=>m.id===s.id)
      if(!m||ids.has(s.id)||!Number.isFinite(s.hp)||s.hp<0||s.hp>p.actorHP||typeof s.alive!=='boolean'||s.alive!==(s.hp>0)||
        !states.includes(s.state)||(s.state==='DEAD')!==!s.alive||!Number.isFinite(s.yaw)||
        !Array.isArray(s.position)||s.position.length!==3||!s.position.every(Number.isFinite)||
        s.lastKnown!==null&&(!Array.isArray(s.lastKnown)||s.lastKnown.length!==3||!s.lastKnown.every(Number.isFinite))||
        ![null,'seen','group','gun','step','shot'].includes(s.knownKind)||typeof s.shared!=='boolean'||typeof s.coverReached!=='boolean'||
        !Number.isInteger(s.patrolIndex)||s.patrolIndex<0||s.patrolIndex>=Math.max(1,m.definition.patrol.length)||
        !Number.isSafeInteger(s.shots)||s.shots<0||['memory','patrolWait','cooldown','recovery'].some(k=>!Number.isFinite(s[k])||s[k]<0)||
        !navigation.contains(new T.Vector3(...s.position)))invalid()
      ids.add(s.id)
    }
    return true
  }
  function resetMember(m,s){
      const d=m.definition
      m.visual.root.visible=true
      m.visual.reset();m.visual.root.position.copy(s?new T.Vector3(...s.position):vector(d.position));m.visual.root.rotation.y=s?.yaw??d.yaw
      m.target.reset();m.target.restoreState({hp:s?.hp??p.actorHP,alive:s?.alive??true})
      Object.assign(m,{state:s?.state??'IDLE',role:null,lastKnown:s?.lastKnown?new T.Vector3(...s.lastKnown):null,
        knownKind:s?.knownKind??null,memory:s?.memory??0,shared:s?.shared??false,coverReached:s?.coverReached??false,
        patrolIndex:s?.patrolIndex??0,patrolWait:s?.patrolWait??p.patrolWait,cooldown:s?.cooldown??0,recovery:s?.recovery??0,
        shots:s?.shots??0,aimElapsed:0,direction:null,visible:null,path:[],plannedGoal:null,nextPlan:0,nextSense:0,animationTime:0,firePose:0,burstRemaining:0,burstWait:0})
      if(['TRACK','LOCK','FIRE'].includes(m.state)){m.state=m.lastKnown?'INVESTIGATE':'IDLE';m.cooldown=Math.max(m.cooldown,p.fireInterval)}
      role(m,!m.target.actor.alive?'Death':m.recovery>0?'Hit':'Idle')
      m.visual.update(!m.target.actor.alive?m.visual.animation.snapshot?.().duration||3:0)
      m.target.setEnabled(false)
  }
  function reset(saved){
    if(saved)validateCapture(saved)
    resetting=true;stop();time=saved?.time??0;turn=saved?.turn??0;history.length=0
    try{for(const m of members){
      resetMember(m,saved?.members.find(s=>s.id===m.id))
      if(combat){m.opponent=null;m.observationTime=null;m.observationKind=null}
    }enabled=false}finally{resetting=false}
  }
  function respawn(id,{position,goal}={}){
    const m=members.find(m=>m.id===id)
    if(!m||m.target.actor.alive||!finitePoint(position)||!navigation.contains(vector(position))||goal&&!finitePoint(goal))return false
    resetting=true
    try{
      resetMember(m)
      if(combat){m.opponent=null;m.observationTime=null;m.observationKind=null}
      m.visual.root.position.copy(vector(position));m.patrolWait=0
      if(goal){m.lastKnown=vector(goal);m.memory=p.memorySeconds;m.knownKind='group';m.state='INVESTIGATE'}
      m.target.setEnabled(active());record('respawn',m)
    }finally{resetting=false}
    return true
  }
  function retire(id){
    const m=members.find(m=>m.id===id);if(!m)return false
    cancel(m);m.path=[];m.lastKnown=null;m.memory=0;m.state='DEAD'
    m.target.restoreState({hp:0,alive:false});m.target.setEnabled(false);m.visual.root.visible=false
    return true
  }
  function onState({state}){if(state!=='playing')stop()}
  try{
    for(const definition of deployments){
      const visual=createVisual(),m={id:definition.id,definition,visual,target:null,state:'IDLE',role:null}
      members.push(m);g.scene.add(visual.root)
      m.target=installCharacterTarget(g,visual.instance,{clipFor:role=>visual.clipFor(role),
        animation:{playClip(index){role(m,index===visual.clipFor('Death')?'Death':'Hit')},stop(){}},
        onStop:()=>cancel(m),onChange(){
          if(resetting||!m.target)return
          if(!m.target.actor.alive){m.state='DEAD';m.path=[];record('death',m)}
          else {m.state='HIT';m.recovery=p.hitRecoverySeconds;m.path=[]}
          onChange()
        }})
      m.target.actor.id=m.id;m.target.actor.type='clearance'
      if(combat)m.unregister=combat.register({actor:m.target.actor,kind:'soldier',
        collider:()=>({position:m.target.actor.pos.clone(),radius:p.radius,height:p.height}),
        eye:()=>m.visual.getEye(),forward:()=>m.visual.getForward()})
    }
    reset();if(!owners.has(g))owners.set(g,new Set());owners.get(g).add(ownerKey);g.physics.moveCapsule=playerMove
    g.events.on('weapon:fire',onFire);g.events.on('player:step',onStep);g.events.on('game:state',onState);g.events.on('player:dead',stop)
  }catch(error){for(const m of members){m.unregister?.();m.target?.dispose();m.visual.dispose()}effects.dispose();navigation.dispose();throw error}
  return {members,update,reset,respawn,retire,capture,validateCapture,restore:reset,
    snapshot(){const saved=capture();return {...saved,enabled,shooters:members.filter(shooting).map(m=>m.id),stats:{...stats},navigation:navigation.snapshot(),effects:effects.snapshot(),
      members:members.map((m,i)=>({...saved.members[i],visible:!!m.visible,aimElapsed:m.aimElapsed,direction:m.direction?.toArray()??null,
        ...(combat?{opponentId:m.opponent?.id??null}:{}),
        burstRemaining:m.burstRemaining,burstWait:m.burstWait,target:m.target.snapshot(),visual:m.visual.snapshot()})),history:history.map(e=>({...e}))}},
    dispose(){if(disposed)return;stop();disposed=true
      g.events.off('weapon:fire',onFire);g.events.off('player:step',onStep);g.events.off('game:state',onState);g.events.off('player:dead',stop)
      for(const m of members){m.unregister?.();m.target.dispose();m.visual.dispose()}
      effects.dispose();navigation.dispose();if(g.physics.moveCapsule===playerMove)g.physics.moveCapsule=nativeMove;owners.get(g)?.delete(ownerKey);if(!owners.get(g)?.size)owners.delete(g)
    },
  }
}
