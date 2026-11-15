// One wrapper per native enemy manager, independent of target release order.
// Native rifle/P12/knife still own world-first rays and the single damage call.
const registries=new WeakMap()
function targetRegistry(g) {
  let registry=registries.get(g.enemies)
  if(registry)return registry
  const original=g.enemies.raycast,targets=new Set(),ray=new g.THREE.Raycaster()
  const stats={queries:0,wallRays:0,meshRays:0}
  function raycast(origin,dir,range=300) {
    stats.queries++
    let nearest=original.call(g.enemies,origin,dir,range)
    const live=[...targets].filter(target=>target.playable())
    if(!live.length)return nearest
    stats.wallRays++
    const wall=g.physics.raycast(origin,dir,range)
    const wallLimit=wall?Math.max(0,wall.dist-.001):range
    if(nearest && nearest.dist>wallLimit)nearest=null
    let limit=Math.min(range,nearest?.dist??Infinity,wallLimit)
    for(const {instance,actor} of live) {
      instance.root.updateMatrixWorld(true);instance.skeleton.update()
      // Pose bounds belong to the mesh, not the shared bind-pose geometry.
      // The sphere is sufficient for SkinnedMesh's broad phase; no second
      // full-vertex bounding-box pass for each actor.
      instance.mesh.computeBoundingSphere()
      ray.set(origin,dir);ray.near=0;ray.far=limit;stats.meshRays++
      const hit=ray.intersectObject(instance.mesh,false)[0]
      if(!hit || hit.distance>=limit)continue
      nearest={dist:hit.distance,point:hit.point.clone(),normal:dir.clone().negate(),enemy:actor,part:'body'}
      limit=hit.distance
    }
    return nearest
  }
  registry={targets,stats,raycast,original}
  registries.set(g.enemies,registry);g.enemies.raycast=raycast
  return registry
}

export function installCharacterTarget(g, instance, { animation, clipFor = () => null, onChange = () => {}, onAttack = () => {}, onStop = () => {}, moveCapsule = (...args) => g.physics.moveCapsule(...args), canAttack = () => true, opponent = () => g.player } = {}) {
  const T=g.THREE, velocity=new T.Vector3(), direction=new T.Vector3(),events=[]
  let attack=null, attackOpponent=null, disposed=false, enabled=true
  const record=(type,data={}) => {
    events.push({type,time:g.game.run.time,position:instance.root.position.toArray(),...data})
    if(events.length>256)events.shift()
    onChange()
  }
  const playable=() => enabled && !disposed && actor.alive && actor.active && g.game.state==='playing' && g.player.alive
  function playRole(role) {
    const clip=clipFor(role)
    if(Number.isInteger(clip))animation.playClip(clip,{loop:false,fade:.1,restart:true})
    else animation.stop()
  }
  function cancelAttack() { if(attack){record('attack-cancelled');attack=null}attackOpponent=null;velocity.set(0,0,0);onStop() }
  const actor={id:'b1a-single-infected',type:'infected',pos:instance.root.position,hp:200,alive:true,active:true,
    damage(amount,point,dir,part) {
      if(!playable() || !(amount>0) || !Number.isFinite(amount))return false
      cancelAttack();actor.hp=Math.max(0,actor.hp-amount)
      record('hit',{amount,hp:actor.hp,point:point.toArray(),part})
      if(actor.hp>0){playRole('Hit');return false}
      actor.alive=false;actor.active=false;playRole('Death')
      record('death');g.events.emit('enemy:killed',{enemy:actor,type:actor.type,pos:actor.pos.clone()})
      return true
    },
  }
  const registry=targetRegistry(g),registration={instance,actor,playable}
  registry.targets.add(registration)
  function beginAttack({clip,duration,contactStart,contactEnd,damage=15,range=1.65,lungeSpeed=0}) {
    const victim=opponent()
    if(!playable() || g.player.enabled===false || attack || !victim || victim.alive===false || victim.enabled===false || !canAttack())return false
    if(![duration,contactStart,contactEnd,damage,range,lungeSpeed].every(Number.isFinite)||!Number.isInteger(clip)||!(duration>0)||contactStart<0||contactEnd<contactStart||contactEnd>duration||!(damage>0)||!(range>0)||lungeSpeed<0)throw Error('Invalid single-actor contact window')
    const source=actor.pos.clone().add(new T.Vector3(0,1.1,0)),destination=victim.pos.clone().add(new T.Vector3(0,.9,0))
    if(Math.hypot(actor.pos.x-victim.pos.x,actor.pos.z-victim.pos.z)>(lungeSpeed?2.8:range) || Math.abs(actor.pos.y-victim.pos.y)>.65 || !g.physics.lineOfSight(source,destination))return false
    direction.copy(victim.pos).sub(actor.pos).setY(0)
    if(direction.lengthSq()<1e-8)direction.set(0,0,-1);else direction.normalize()
    instance.root.rotation.y=Math.atan2(-direction.x,-direction.z)
    attackOpponent=victim
    const started=attack={clip,duration,contactStart,contactEnd,damage,range,lungeSpeed,elapsed:0,hit:false}
    animation.playClip(clip,{loop:false,fade:.12,restart:true});onAttack();record('attack-start',{...started})
    if(contactStart===0)contact(started)
    return true
  }
  function contact(current) {
    const victim=attackOpponent
    if(attack!==current || !playable() || g.player.enabled===false || current.hit || !victim || victim.alive===false || victim.enabled===false)return
    const source=actor.pos.clone().add(new T.Vector3(0,1.1,0)),target=victim.pos.clone().add(new T.Vector3(0,.9,0))
    const delta=target.clone().sub(source),horizontal=delta.clone().setY(0)
    if(delta.length()<=current.range && horizontal.normalize().dot(direction)>.25 && g.physics.lineOfSight(source,target) && canAttack()){
      current.hit=true
      // Damage may synchronously emit player:dead/game:state and clear attack.
      victim.damage(current.damage,source);record('attack-contact',{amount:current.damage,playerHealth:victim.health})
    }
  }
  function update(dt,{animationDt=dt}={}) {
    if(!Number.isFinite(dt)||dt<=0||g.game.state!=='playing'||!g.player.alive)return
    if(attack && (!playable() || g.player.enabled===false || !attackOpponent || attackOpponent.alive===false || attackOpponent.enabled===false))cancelAttack()
    if(attack && actor.alive){
      const current=attack,previous=current.elapsed,end=previous+dt
      if(previous>=current.contactStart && previous<=current.contactEnd)contact(current)
      // Only the overlapping part of this tick may lunge/contact. Bounded
      // physical steps cannot skip over melee range on a large diagnostic dt.
      let time=Math.max(previous,current.contactStart*.5),until=Math.min(end,current.contactEnd)
      while(attack===current && playable() && g.player.enabled!==false && time<until){
        const slice=Math.min(.05,until-time)
        if(current.lungeSpeed){
          velocity.copy(direction).multiplyScalar(current.lungeSpeed);velocity.y=-9.81*slice
          moveCapsule(actor.pos,velocity,slice,.32,1.8,true)
        }
        time+=slice
        if(time>=current.contactStart)contact(current)
      }
      if(attack===current){current.elapsed=end;if(end>=current.duration){record('attack-finished',{hit:current.hit});attack=null;attackOpponent=null}}
    }
    if(animationDt>0 && (actor.alive || !animation.finished?.()))animation.update(animationDt)
  }
  const onState=({state}) => {if(state!=='playing')cancelAttack()}
  g.events.on('game:state',onState);g.events.on('player:dead',cancelAttack)
  return {actor,beginAttack,cancelAttack,update,
    setEnabled(value){cancelAttack();enabled=!!value;actor.active=enabled&&actor.alive},
    restoreState({hp,alive}) {
      if(!Number.isFinite(hp)||hp<0||hp>200||typeof alive!=='boolean'||alive!==(hp>0))throw Error('Invalid character target state')
      cancelAttack();actor.hp=hp;actor.alive=alive;actor.active=enabled&&alive
    },
    reset(){cancelAttack();actor.hp=200;actor.alive=actor.active=true;events.length=0;onChange()},
    snapshot:()=>({id:actor.id,type:actor.type,enabled,hp:actor.hp,alive:actor.alive,position:actor.pos.toArray(),attack:attack?{...attack}:null,raycast:{targets:registry.targets.size,...registry.stats},events:events.map(e=>({...e}))}),
    dispose(){if(disposed)return;cancelAttack();disposed=true;actor.active=actor.alive=false
      g.events.off('game:state',onState);g.events.off('player:dead',cancelAttack);registry.targets.delete(registration)
      if(!registry.targets.size){if(g.enemies.raycast===registry.raycast)g.enemies.raycast=registry.original;registries.delete(g.enemies)}},
  }
}
