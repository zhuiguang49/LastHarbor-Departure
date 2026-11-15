import { SNIPER_CONFIG } from './campaign-ch3-sniper-config.mjs'
import { createSniperCore, rayCapsuleDistance } from './campaign-ch3-sniper-core.mjs'
import { createSniperPerception } from './campaign-ch3-sniper-perception.mjs'
import { createSniperEffects } from './campaign-ch3-sniper-effects.mjs'
import { installCharacterTarget } from './character-native-target.mjs'

export function installChapter3Sniper(g, { visual, narrative, onDefeated=()=>{} }) {
  const T=g.THREE,config=SNIPER_CONFIG,effects=createSniperEffects(g,visual)
  visual.root.position.fromArray(config.position);visual.root.rotation.y=config.yaw;g.scene.add(visual.root);visual.update(0)
  const perception=createSniperPerception(g,visual,config)
  const history=[]
  let target,core,enabled=false,recovery=0,resetting=false,reportedDeath=false,warningSeen=false,warning=null
  const active=()=>g.game.state==='playing'&&g.player.alive&&g.player.enabled!==false&&!narrative.snapshot().active
  function record(type,data={}){history.push({type,time:g.game.run.time,...data});if(history.length>128)history.shift()}
  function releaseAim(){
    if(visual.snapshot().role==='Aim')visual.animation.restore(visual.animation.capture())
  }
  function stop(){warning=null;effects.cancel();releaseAim();core?.cancel('interrupted')}
  // Native targeting owns the mesh ray and HP. Its existing animation callback
  // selects a visual role; the visual layer owns the ONE mixer update.
  target=installCharacterTarget(g,visual.instance,{
    animation:{playClip(index){visual.setState(index===visual.clipFor('Death')?'Death':'Hit')},stop(){}},
    clipFor:role=>visual.clipFor(role),onStop:stop,
    onChange(){
      if(resetting||!target)return
      if(!target.actor.alive && !reportedDeath){
        reportedDeath=true;core.update(0,{active:false,alive:false});effects.cancel();warning=null
        record('defeated');onDefeated()
      }else if(target.actor.hp>0)recovery=config.hitRecoverySeconds
    },
  })
  target.actor.id='ch3-tower-sniper';target.actor.type='sniper'
  core=createSniperCore(T,{
    getVisibleTarget:perception.getVisibleTarget,aimAt:point=>visual.aimAt(point),getMuzzle:()=>visual.getMuzzle(),
    raycastWorld:(...args)=>g.physics.raycast(...args),getPlayerCapsule:()=>g.player.captureCampaignCollider(),
    onAim(){visual.setState('Aim');effects.aim();record('aim')},
    onCancel({reason}){effects.cancel();releaseAim();record('aim-cancel',{reason})},
    onState({state}){if(state==='LOCK')visual.lockDirection(new T.Vector3(...core.snapshot().direction))},
    onFire(result){
      // FIRE is committed by the core before callbacks; one native damage call.
      if(!active()||!target.actor.alive)return
      effects.fire(result);visual.setState('Fire')
      record('shot',{id:result.shotId,origin:result.origin.toArray(),direction:result.direction.toArray(),
        hit:result.hit,damage:result.damage,worldDistance:result.worldHit?.dist??null,playerDistance:result.playerDistance})
      if(result.hit)g.player.damage(result.damage,result.origin)
    },
  },config)
  function warningTarget(visible) {
    const origin=visual.getMuzzle(),capsule=g.player.captureCampaignCollider()
    // Seek a real nearby metal surface, with a ray that cannot cross the live
    // player. If none exists, omit the optional warning and start normal combat.
    for(const [dx,dz] of [[3,0],[-3,0],[0,3],[0,-3],[5,0],[-5,0],[0,5],[0,-5]]){
      const point=visible.clone().add(new T.Vector3(dx,-.7,dz)),direction=point.sub(origin).normalize()
      const hit=g.physics.raycast(origin,direction,config.range)
      if(!hit||hit.surface!=='metal'||hit.point.distanceTo(visible)>7||hit.point.distanceTo(visible)<1.5)continue
      const playerDistance=rayCapsuleDistance(origin,direction,capsule,config.range)
      if(playerDistance!==null && playerDistance<hit.dist)continue
      return {direction,point:hit.point.clone()}
    }
    return null
  }
  function update(dt){
    const playing=active(),alive=target.actor.alive
    if(enabled!==playing){enabled=playing;target.setEnabled(playing)}
    if(!playing){core.update(0,{active:false,alive});effects.cancel();warning=null;return}
    if(alive||!visual.animation.finished())visual.update(dt)
    effects.update(dt)
    if(!alive){core.update(0,{active:false,alive:false});return}
    recovery=Math.max(0,recovery-dt)
    if(recovery>0){core.update(0,{active:false,alive});return}
    if(!warningSeen){
      const point=perception.getVisibleTarget()
      if(point){
        warningSeen=true;const aim=warningTarget(point)
        if(aim){visual.aimAt(aim.point);visual.setState('Aim');visual.lockDirection(aim.direction);effects.aim();warning={...aim,remaining:config.warningAimSeconds};record('warning-start')}
      }
    }
    if(warning){
      warning.remaining-=dt
      if(warning.remaining<=0){
        const origin=visual.getMuzzle(),direction=warning.direction.clone(),worldHit=g.physics.raycast(origin,direction,config.range)
        effects.fire({origin,direction,worldHit,hit:false,playerDistance:null});visual.setState('Fire')
        warning=null;core.setCooldown(config.fireInterval);record('warning-shot',{damage:0})
        g.hud.message('瞭望塔正在开火 · 利用掩体或西侧货柜绕行',4)
      }
      return
    }
    core.update(dt,{active:playing,alive})
  }
  function capture(){return {version:1,hp:target.actor.hp,alive:target.actor.alive,warningSeen,core:core.capture(),animation:visual.animation.capture()}}
  function reset(saved,{keepWarning=false}={}){
    const retained=keepWarning&&warningSeen;resetting=true
    stop();core.reset();target.reset();target.actor.hp=config.actorHP;visual.reset();visual.root.position.fromArray(config.position);visual.root.rotation.y=config.yaw
    recovery=0;reportedDeath=false;warningSeen=retained;history.length=0
    if(saved){
      target.restoreState({hp:saved.hp,alive:saved.alive});core.restore(saved.core);warningSeen=warningSeen||saved.warningSeen
      reportedDeath=!saved.alive
      if(!saved.alive){visual.setState('Death');visual.update(visual.animation?.snapshot?.().duration||3)}
    }
    enabled=false;target.setEnabled(false);resetting=false
  }
  function onState({state}){if(state!=='playing'){stop();core.update(0,{active:false,alive:target.actor.alive})}}
  g.events.on('game:state',onState);g.events.on('player:dead',stop)
  reset()
  return {update,reset,capture,target,visual,
    snapshot:()=>({config:{...config},...capture(),enabled,recovery,warning:!!warning,
      perception:perception.snapshot(),effects:effects.snapshot(),visual:visual.snapshot(),history:history.map(e=>({...e}))}),
    dispose(){stop();g.events.off('game:state',onState);g.events.off('player:dead',stop);target.dispose();effects.dispose();visual.dispose()},
  }
}
