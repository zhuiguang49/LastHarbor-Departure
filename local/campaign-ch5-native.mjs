// Optional hooks for the native factories. Ownership includes activation ID:
// the engine reuses the same robot object and skeletal resources after death.
export function installChapter5Native(g,{combat,active}) {
  const T=g.THREE,ctx=g.enemies.debug.ctx,owned=new Map(),claims=new Map(),zero=new T.Vector3(),history=[]
  const original={think:ctx.think,provoke:ctx.provoke,rally:ctx.rally,shot:g.combat.enemyShot,explode:g.combat.explode,chapter5:ctx.chapter5}
  let disposed=false
  const enabled=()=>!disposed&&active()&&g.game.state==='playing'&&g.player.alive&&g.player.enabled!==false
  const owns=actor=>!!actor&&owned.get(actor)?.id===actor.id
  const ownsBolt=bolt=>!!bolt.owner&&claims.get(bolt.owner)?.has(bolt.ownerId)
  const record=(type,actor,data={})=>{history.push({type,id:actor.id,...data});if(history.length>128)history.shift()}
  function target(actor){
    const r=owned.get(actor),view=combat.targetFor(actor),observation=combat.observationFor(actor)
    if(!r||!view||!observation)return null
    r.observation=observation
    if(r.targetId!==view.id){
      ctx.releaseToken(actor);actor.atk='idle';actor.es='move';actor.hasGoal=false;actor.path=null
      actor.mode=r.targetId===null&&observation.kind==='seen'?'patrol':'investigate';actor.seeT=0;actor.noSeeT=0;actor.modeT=10
      actor.lastKnown.copy(observation.position);r.los=false;r.targetId=view.id;r.view=null
      record('target',actor,{targetId:view.id})
    }
    if(!r.view){
      r.view=Object.create(view)
      Object.defineProperties(r.view,{
        pos:{get(){return r.los?view.pos:r.observation?.position??actor.lastKnown}},
        eye:{get(){return r.los?view.eye:(r.observation?.position??actor.lastKnown).clone().add(new T.Vector3(0,1,0))}},
        vel:{get(){return r.los?view.vel:zero}},
      })
    }
    return r.view
  }
  function think(actor,dt,delay){
    const r=owned.get(actor),view=combat.targetFor(actor),o=combat.observationFor(actor)
    if(!enabled()||!r)return
    r.observation=o
    r.los=!!(view&&o?.visible&&g.physics.lineOfSight(actor.sensor,view.eye))
    actor.los=r.los
    if(!view||!o){ctx.releaseToken(actor);actor.mode='patrol';actor.seeT=0;actor.exposure=0;actor.atk='idle';actor.es='move';return}
    if(r.los){actor.seeT+=dt;actor.noSeeT=0;actor.lastKnown.copy(o.position);actor.exposure=Math.min(1,actor.exposure+dt*.1)}
    else{actor.noSeeT+=dt;actor.seeT=Math.max(0,actor.seeT-dt*.6);actor.exposure=Math.max(0,actor.exposure-dt*.45);actor.lastKnown.copy(o.position)}
    if(actor.mode==='engage'){
      if(actor.noSeeT>4){actor.mode='search';actor.modeT=8;ctx.releaseToken(actor)}
    }else if(r.los&&actor.seeT>(actor.mode==='patrol'?delay:delay*.45)){
      actor.mode='engage';actor.noSeeT=0;g.events.emit('enemy:alert',{enemy:actor})
    }else if(actor.mode!=='patrol'){actor.modeT-=dt;if(actor.modeT<=0){actor.mode='patrol';actor.home.copy(actor.pos)}}
  }
  function canMelee(actor,view){
    const actual=combat.targetFor(actor),o=combat.observationFor(actor)
    const direction=actual?.pos.clone().sub(actor.pos).setY(0)
    return enabled()&&actual&&actual.id===view.id&&actual.alive&&o?.visible&&Math.abs(actor.pos.y-actual.pos.y)<.8&&
      (direction.lengthSq()<1e-8||direction.normalize().dot(actor.fwd)>.25)&&
      g.physics.lineOfSight(actor.pos.clone().add(new T.Vector3(0,.8,0)),actual.pos.clone().add(new T.Vector3(0,.7,0)))
  }
  function flightBlocked(actor,from,to){
    const delta=to.clone().sub(from)
    if(combat.blocked(actor,from.clone().add(new T.Vector3(0,-.5,0)),to.clone().add(new T.Vector3(0,-.5,0)),.5,1))return true
    // Sweep the complete one-metre flight envelope, not just the native three
    // feeler rays. This also catches thin walls on a long diagnostic step.
    return g.physics.boxes.some(box=>{
      if(box.bulletOnly||box.playerOnly)return false
      let enter=0,exit=1
      for(const axis of ['x','y','z']){
        const min=box.min[axis]-.5,max=box.max[axis]+.5,d=delta[axis]
        if(Math.abs(d)<1e-9){if(from[axis]<min||from[axis]>max)return false;continue}
        const a=(min-from[axis])/d,b=(max-from[axis])/d
        enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b))
        if(enter>exit)return false
      }
      return exit>0&&enter<=1
    })
  }
  const hooks={owns,ownsBolt,active:enabled,target,think,canMelee,
    moveGull(actor,dt){
      const before=owned.get(actor).before??actor.pos,next=actor.pos.clone().addScaledVector(actor.vel,dt)
      if(flightBlocked(actor,before,next)){actor.pos.copy(before);actor.vel.set(0,0,0);return actor.pos}
      return actor.pos.copy(next)
    },
    melee(actor,view,amount){if(!canMelee(actor,view))return false;return view.damage(amount,actor.pos.clone())},
    projectile(bolt,distance){
      if(!enabled())return false
      const result=combat.projectile(bolt.owner,bolt.pos,bolt.pos.clone().addScaledVector(bolt.dir,distance),g.enemies.TUNE.gull.boltDamage)
      if(result.blocked&&result.point)g.events.emit('impact',{point:result.point,normal:result.normal,surface:result.surface,dir:bolt.dir,from:'enemy'})
      return result.hit||result.blocked
    },
  }
  ctx.chapter5=hooks
  const thinkWrapper=(actor,dt,delay)=>owns(actor)?think(actor,dt,delay):original.think.call(ctx,actor,dt,delay)
  const provokeWrapper=actor=>{
    if(!owns(actor))return original.provoke.call(ctx,actor)
    const o=combat.observationFor(actor)
    if(o&&enabled()){actor.lastKnown.copy(o.position);actor.mode='investigate';actor.modeT=10;actor.seeT=1;actor.senseT=0}
  }
  const rallyWrapper=(position,radius,goal,source)=>{if(!owns(source))return original.rally.call(ctx,position,radius,goal,source)}
  const shotWrapper=(origin,dir,options={})=>{
    if(!owns(options.owner))return original.shot.call(g.combat,origin,dir,options)
    const result=combat.fire(options.owner,origin,dir,options.range??200,options.damage??5)
    if(result.blocked&&result.point)g.events.emit('impact',{point:result.point,normal:result.normal,surface:result.surface,dir,from:'enemy'})
    return result.hit
  }
  const explodeWrapper=(position,radius,damage,from,owner)=>{
    if(!owns(owner))return original.explode.call(g.combat,position,radius,damage,from)
    if(!enabled())return
    for(const {actor,collider}of combat.actors()){
      if(actor===owner)continue
      const point=collider.position.clone().add(new T.Vector3(0,collider.height*.5,0)),distance=point.distanceTo(position)
      if(distance<radius&&g.physics.lineOfSight(position,point))combat.damageFrom(owner,actor,damage*(actor===g.player?.5:1)*(1-distance/radius),point,point.clone().sub(position).normalize())
    }
  }
  ctx.think=thinkWrapper;ctx.provoke=provokeWrapper;ctx.rally=rallyWrapper
  g.combat.enemyShot=shotWrapper;g.combat.explode=explodeWrapper
  function unregister(enemy){
    const r=owned.get(enemy)
    if(!r)return false
    for(const bolt of g.enemies.debug.bolts)if(bolt.owner===enemy&&claims.get(enemy)?.has(bolt.ownerId))bolt.on=false
    if(enemy._update===r.update)enemy._update=r.originalUpdate
    r.release();owned.delete(enemy);claims.delete(enemy);return true
  }
  function register(enemy){
    if(owns(enemy)){const existing=owned.get(enemy);return ()=>owned.get(enemy)===existing&&unregister(enemy)}
    if(owned.has(enemy))unregister(enemy)
    if(!['hound','gull'].includes(enemy.type))throw Error('CH5 native bridge requires a native robot')
    const r={id:enemy.id,originalUpdate:enemy._update,targetId:null,view:null,los:false}
    r.release=combat.register({actor:enemy,kind:enemy.type,
      collider:()=>({position:enemy.type==='gull'?enemy.pos.clone().add(new T.Vector3(0,-.5,0)):enemy.pos,radius:enemy.type==='hound'?.65:.5,height:enemy.type==='hound'?1.4:1}),
      eye:()=>enemy.sensor.clone(),forward:()=>enemy.fwd.clone(),alive:()=>enemy.id===r.id&&enemy.active&&enemy.alive})
    r.update=dt=>{
      if(!enabled()||enemy.id!==r.id)return
      const before=enemy.pos.clone();r.before=before
      r.originalUpdate.call(enemy,dt)
      if(enemy.alive&&combat.blocked(enemy,before,enemy.pos,enemy.type==='hound'?.65:.5,enemy.type==='hound'?1.4:1)){
        enemy.pos.copy(before);if(enemy.vel)enemy.vel.x=enemy.vel.z=0;if(enemy.type==='hound'){enemy.speed=0;enemy.planT=0}
      }
    }
    enemy._update=r.update;enemy.lastKnown.copy(enemy.home);enemy.mode='patrol';enemy.seeT=0;enemy.noSeeT=0
    owned.set(enemy,r);if(!claims.has(enemy))claims.set(enemy,new Set());claims.get(enemy).add(enemy.id)
    record('register',enemy);return ()=>owned.get(enemy)===r&&unregister(enemy)
  }
  function clearOwned(){
    for(const bolt of g.enemies.debug.bolts)if(ownsBolt(bolt))bolt.on=false
    for(const [enemy,r]of [...owned]){
      if(enemy.id===r.id&&g.enemies.list.includes(enemy))ctx.retire(enemy)
      unregister(enemy)
    }
  }
  function silenceOwned(){
    for(const bolt of g.enemies.debug.bolts)if(ownsBolt(bolt))bolt.on=false
    for(const [enemy,r]of owned)if(enemy.id===r.id){
      ctx.releaseToken(enemy)
      if(enemy.loop){try{enemy.loop.stop()}catch{}enemy.loop=null}
    }
  }
  const onFire=e=>{if(e?.enemy?.type==='gull'&&owns(e.enemy)&&e.pos)combat.noise(e.enemy,e.pos)}
  g.events.on('enemy:fire',onFire)
  return {register,unregister,clearOwned,silenceOwned,
    snapshot:()=>({owned:[...owned].map(([enemy,r])=>({id:r.id,currentId:enemy.id,type:enemy.type,alive:enemy.alive,targetId:r.targetId,los:r.los})),
      bolts:g.enemies.debug.bolts.filter(b=>b.on&&ownsBolt(b)).length,history:history.map(e=>({...e}))}),
    dispose(){if(disposed)return;clearOwned();disposed=true;g.events.off('enemy:fire',onFire)
      if(ctx.chapter5===hooks)ctx.chapter5=original.chapter5
      if(ctx.think===thinkWrapper)ctx.think=original.think;if(ctx.provoke===provokeWrapper)ctx.provoke=original.provoke;if(ctx.rally===rallyWrapper)ctx.rally=original.rally
      if(g.combat.enemyShot===shotWrapper)g.combat.enemyShot=original.shot;if(g.combat.explode===explodeWrapper)g.combat.explode=original.explode
    },
  }
}
