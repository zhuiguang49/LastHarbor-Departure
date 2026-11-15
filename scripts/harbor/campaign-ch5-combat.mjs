import { rayCapsuleDistance } from './campaign-ch3-sniper-core.mjs'

const senses={infected:{range:10,fov:100,memory:3,gun:25},soldier:{range:32,fov:110,memory:6,gun:30},
  hound:{range:45,fov:200,memory:11,gun:45},gull:{range:45,fov:200,memory:11,gun:45}}
const company=kind=>['soldier','hound','gull'].includes(kind)
const hostile=(a,b)=>a==='player'?b!=='player':a==='infected'?b==='player'||b==='soldier':company(a)&&(b==='player'||b==='infected')

// One local combat registry; it never replaces the player or the native loop.
export function createChapter5Combat(g,{active,contains}) {
  const T=g.THREE,records=new Map(),history=[],nativeMove=g.physics.moveCapsule
  let elapsed=0,serial=0,disposed=false,transaction=null
  const playing=()=>!disposed&&active()&&g.game.state==='playing'&&g.player.alive&&g.player.enabled!==false
  const live=r=>!!r&&r.alive()&&r.actor.alive!==false&&r.actor.active!==false&&contains(r.actor.pos)
  const record=(type,data)=>{history.push({type,time:elapsed,...data});if(history.length>160)history.shift()}
  const id=r=>r?.actor.id??(r?.kind==='player'?'player':null)
  function clue(observer,target,kind,position){
    if(!live(observer)||!live(target)||!hostile(observer.kind,target.kind))return
    observer.target=target;observer.observation={id:id(target),visible:false,position:position.clone(),time:elapsed,kind}
    observer.expires=elapsed+senses[observer.kind].memory;observer.nextSense=Math.min(observer.nextSense,elapsed)
  }
  function register({actor,kind,collider,eye,forward,alive=()=>actor.alive&&actor.active!==false}) {
    if(records.has(actor))throw Error('CH5 combat actor already registered')
    const r={actor,kind,collider,eye,forward,alive,target:null,observation:null,expires:0,nextSense:elapsed+(serial++%4)*.045}
    const originalDamage=actor.damage;r.originalDamage=originalDamage;r.views=new Map()
    if(kind!=='player'){
      r.damage=function(amount,point,dir,part='body'){
        if(!playing()||!live(r)||!(amount>0)||!Number.isFinite(amount))return false
        const source=records.get(transaction?.attacker??g.player)
        if(!source||!hostile(source.kind,kind))return false
        clue(r,source,'hit',source.actor.pos)
        const before=actor.hp,result=originalDamage.call(actor,amount,point??actor.pos.clone(),dir,part)
        record('damage',{attacker:id(source),victim:id(r),amount,before,hp:actor.hp,killed:!actor.alive})
        return result
      }
      actor.damage=r.damage
    }
    r.view={get id(){return id(r)},get pos(){return actor.pos},get eye(){return eye()},get vel(){return actor.vel??zero},
      get alive(){return live(r)},get enabled(){return playing()&&live(r)},get health(){return kind==='player'?actor.health:actor.hp},
      get crouching(){return !!actor.crouching},captureCampaignCollider:()=>collider(),
      damage(amount,source){return damageFrom(transaction?.attacker??g.player,actor,amount,source??actor.pos.clone(),null)}}
    records.set(actor,r)
    let removed=false
    return ()=>{if(removed)return;removed=true
      if(r.damage&&actor.damage===r.damage)actor.damage=originalDamage
      records.delete(actor)
      for(const peer of records.values()){
        peer.views.delete(r)
        if(peer.target===r){peer.target=null;peer.observation=null;peer.expires=0}
      }
    }
  }
  const zero=new T.Vector3()
  register({actor:g.player,kind:'player',collider:()=>g.player.captureCampaignCollider?.()??
    {position:g.player.pos,radius:.32,height:g.player.crouching?1.15:1.8},
    eye:()=>g.player.eye??g.player.pos.clone().add(new T.Vector3(0,1.65,0)),forward:()=>g.player.forward,
    alive:()=>g.player.alive&&g.player.enabled!==false})
  function visible(observer,target){
    const p=senses[observer.kind],eye=observer.eye(),c=target.collider(),center=c.position.clone().add(new T.Vector3(0,c.height*.55,0))
    const d=center.clone().sub(eye),range=d.length(),flat=d.clone().setY(0),f=observer.forward().clone().setY(0)
    if(range>p.range)return false
    const near=company(observer.kind)&&observer.kind!=='soldier'&&range<3.5
    const engaged=observer.kind==='hound'||observer.kind==='gull'?observer.actor.mode==='engage':false
    if(!near&&!engaged&&flat.lengthSq()>1e-8&&flat.normalize().dot(f.normalize())<Math.cos(p.fov*Math.PI/360))return false
    return [c.height*.55,c.height-.12,c.radius+.1].some(y=>g.physics.lineOfSight(eye,c.position.clone().add(new T.Vector3(0,y,0))))
  }
  function update(dt){
    if(!playing()||!Number.isFinite(dt)||dt<=0)return
    elapsed+=dt
    for(const r of records.values()){
      if(r.kind==='player')continue
      if(!live(r)){r.target=null;r.observation=null;continue}
      if(r.target&&!live(r.target)){r.target=null;r.observation=null}
      if(elapsed>=r.nextSense){
        r.nextSense=elapsed+.15+(records.size?serial++%6*.01:0)
        const candidates=[...records.values()].filter(peer=>peer!==r&&live(peer)&&hostile(r.kind,peer.kind)&&visible(r,peer))
        candidates.sort((a,b)=>r.actor.pos.distanceToSquared(a.actor.pos)*(a===r.target?.85:1)-r.actor.pos.distanceToSquared(b.actor.pos)*(b===r.target?.85:1))
        if(candidates.length){
          r.target=candidates[0];r.observation={id:id(r.target),visible:true,position:r.target.actor.pos.clone(),time:elapsed,kind:'seen'}
          r.expires=elapsed+senses[r.kind].memory
        }else if(r.observation)r.observation.visible=false
      }
      if(r.observation&&elapsed>r.expires){r.target=null;r.observation=null}
    }
  }
  function targetFor(actor){
    const r=records.get(actor)
    if(!playing()||!live(r)||!live(r.target))return null
    if(!r.views.has(r.target)){
      const target=r.target,view=Object.create(target.view)
      view.damage=(amount,source)=>damageFrom(actor,target.actor,amount,source??actor.pos.clone(),null)
      r.views.set(target,view)
    }
    return r.views.get(r.target)
  }
  function observationFor(actor){const r=records.get(actor),o=r?.observation;return playing()&&live(r)&&o?{...o,position:o.position.clone()}:null}
  function noise(actor,origin,kind='gun',{sprint=false}={}){
    const source=records.get(actor)
    if(!playing()||!live(source))return false
    record('noise',{source:id(source),kind,origin:origin.toArray()})
    for(const r of records.values()){
      if(r.kind==='player'||!live(r)||!hostile(r.kind,source.kind))continue
      const p=senses[r.kind],clear=g.physics.lineOfSight(r.eye(),origin)
      let range=kind==='step'?(r.kind==='infected'?10:r.kind==='soldier'?(sprint?12:8):0):p.gun
      if(r.kind==='infected'&&!clear)continue
      if(r.kind==='soldier'&&kind==='step'&&!clear)range*=.35
      if(r.eye().distanceTo(origin)<=range&&!r.observation?.visible)clue(r,source,kind,source.actor.pos)
    }
    return true
  }
  function damageFrom(attacker,victim,amount,point,dir,part='body'){
    const a=records.get(attacker),b=records.get(victim)
    if(!playing()||!a||!live(b)||!hostile(a.kind,b.kind)||!(amount>0)||!Number.isFinite(amount))return false
    const previous=transaction;transaction={attacker}
    try{
      if(b.kind==='player'){
        const before=g.player.health,result=g.player.damage(amount,point??attacker.pos)
        record('damage',{attacker:id(a),victim:'player',amount,before,hp:g.player.health,killed:!g.player.alive});return result
      }
      return victim.damage(amount,point??victim.pos.clone(),dir,part)
    }finally{transaction=previous}
  }
  function trace(actor,origin,direction,range,amount){
    const source=records.get(actor),dir=direction.clone().normalize()
    const empty={hit:false,blocked:false,targetId:null,worldDistance:null,actorDistance:null,friendDistance:null,point:null,normal:null,surface:null,damage:0}
    if(!playing()||!source||!Number.isFinite(range)||range<=0||!dir.lengthSq())return empty
    const world=g.physics.raycast(origin,dir,range)
    let victim=null,nearest=Infinity,friendDistance=Infinity,actorDistance=Infinity
    for(const r of records.values()){
      if(r===source||!live(r))continue
      const distance=rayCapsuleDistance(origin,dir,r.collider(),range)
      if(distance===null)continue
      if(hostile(source.kind,r.kind))actorDistance=Math.min(actorDistance,distance);else friendDistance=Math.min(friendDistance,distance)
      if(distance<nearest){nearest=distance;victim=r}
    }
    const result={...empty,worldDistance:world?.dist??null,actorDistance:Number.isFinite(actorDistance)?actorDistance:null,
      friendDistance:Number.isFinite(friendDistance)?friendDistance:null}
    if(world&&world.dist<=nearest+1e-4)return {...result,blocked:true,point:world.point.clone(),normal:world.normal.clone(),surface:world.surface}
    if(!victim)return result
    const point=origin.clone().addScaledVector(dir,nearest),enemy=hostile(source.kind,victim.kind)
    if(enemy)damageFrom(actor,victim.actor,amount,point,dir,'body')
    record('contact',{attacker:id(source),target:id(victim),friendly:!enemy,amount:enemy?amount:0})
    return {...result,hit:enemy,blocked:!enemy,targetId:id(victim),point,normal:dir.clone().negate(),surface:'enemy',damage:enemy?amount:0}
  }
  function fire(actor,origin,dir,range,damage){noise(actor,origin);return trace(actor,origin,dir,range,damage)}
  function projectile(actor,from,to,damage){const dir=to.clone().sub(from);return trace(actor,from,dir,dir.length(),damage)}
  function blocked(actor,from,to,radius,height){
    if(records.get(actor)?.kind!=='player'&&(!contains(to)||
      [[radius,0],[-radius,0],[0,radius],[0,-radius]].some(([x,z])=>!contains({x:to.x+x,y:to.y,z:to.z+z}))||
      to.y+height>(g.physics.bounds?.max.y??30)))return true
    const dx=to.x-from.x,dz=to.z-from.z,length=dx*dx+dz*dz
    return [...records.values()].some(r=>{
      if(r.actor===actor||!live(r))return false
      const c=r.collider(),p=c.position
      if(from.y>=p.y+c.height||from.y+height<=p.y)return false
      const t=length?Math.max(0,Math.min(1,((p.x-from.x)*dx+(p.z-from.z)*dz)/length)):0
      const start=Math.hypot(from.x-p.x,from.z-p.z),end=Math.hypot(to.x-p.x,to.z-p.z),clearance=radius+c.radius+.04
      return Math.hypot(from.x+t*dx-p.x,from.z+t*dz-p.z)<Math.min(start,clearance)-1e-5||start<clearance-1e-5&&end<=start&&length>0
    })
  }
  function move(actor,position,velocity,dt,radius=.32,height=1.8,step=true){
    if(!playing()||!records.has(actor)||!(dt>0))return nativeMove.call(g.physics,position,velocity,dt,radius,height,step)
    let remaining=dt,result,hitWall=false
    while(remaining>1e-7){
      const slice=Math.min(remaining,.025,.08/Math.max(.01,Math.hypot(velocity.x,velocity.z))),from=position.clone(),v=velocity.clone()
      result=nativeMove.call(g.physics,position,v,slice,radius,height,step)
      if(blocked(actor,from,position,radius,height)){position.copy(from);velocity.x=velocity.z=0;hitWall=true}
      else velocity.copy(v)
      hitWall ||= !!result.hitWall;remaining-=slice
    }
    return {...result,hitWall}
  }
  function playerMove(position,velocity,dt,radius,height,step){
    return position===g.player.pos?move(g.player,position,velocity,dt,radius,height,step):nativeMove.call(g.physics,position,velocity,dt,radius,height,step)
  }
  g.physics.moveCapsule=playerMove
  const finite=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]))
  const onFire=e=>{
    const p=g.player.pos
    if(finite(e?.origin)&&finite(e?.dir)&&(!e.weapon||['rifle','pistol'].includes(e.weapon))&&
      Math.hypot(e.origin.x-p.x,e.origin.z-p.z)<=1.5&&e.origin.y>=p.y&&e.origin.y<=p.y+2.2)
      noise(g.player,new T.Vector3(e.origin.x,e.origin.y,e.origin.z))
  }
  const onStep=e=>{
    const p=g.player
    if(finite(e?.pos)&&!p.crouching&&p.onGround&&p.speed>.5&&p.vel&&Math.hypot(p.vel.x,p.vel.z)>.5&&
      Math.hypot(e.pos.x-p.pos.x,e.pos.z-p.pos.z)<=.1)
      noise(p,new T.Vector3(e.pos.x,e.pos.y+.2,e.pos.z),'step',{sprint:!!e.sprint})
  }
  g.events.on('weapon:fire',onFire);g.events.on('player:step',onStep)
  return {register,targetFor,observationFor,update,noise,damageFrom,fire,projectile,move,blocked,
    // Native blast/target adapters use this list without exposing mutable state.
    actors:()=>[...records.values()].filter(live).map(r=>({actor:r.actor,kind:r.kind,collider:r.collider(),eye:r.eye()})),
    reset(){elapsed=0;history.length=0;for(const r of records.values()){r.target=null;r.observation=null;r.views.clear();r.expires=0;r.nextSense=(serial++%4)*.045}},
    snapshot:()=>({elapsed,registered:records.size,actors:[...records.values()].map(r=>({id:id(r),kind:r.kind,alive:live(r),
      targetId:id(r.target),observation:r.observation?{...r.observation,position:r.observation.position.toArray()}:null})),history:history.map(e=>({...e}))}),
    dispose(){if(disposed)return;disposed=true
      g.events.off('weapon:fire',onFire);g.events.off('player:step',onStep)
      if(g.physics.moveCapsule===playerMove)g.physics.moveCapsule=nativeMove
      for(const r of records.values())if(r.damage&&r.actor.damage===r.damage)r.actor.damage=r.originalDamage
      records.clear();history.length=0},
  }
}
