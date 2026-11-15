import { SNIPER_CONFIG } from './campaign-ch3-sniper-config.mjs'

// position is the foot point; height is the TOTAL live collision height.
// Return distance in metres, including for a non-unit input direction.
export function rayCapsuleDistance(origin, direction, {position,radius,height}, range=Infinity) {
  if(!(radius>0) || !Number.isFinite(radius) || !Number.isFinite(height) || height<2*radius)
    throw Error('Sniper capsule requires a positive radius and height >= diameter')
  const low=position.y+radius,high=position.y+height-radius
  const ox=origin.x-position.x,oz=origin.z-position.z
  const closestY=Math.max(low,Math.min(high,origin.y)),oy=origin.y-closestY
  if(range<0)return null
  if(ox*ox+oy*oy+oz*oz<=radius*radius)return 0
  const length=Math.hypot(direction.x,direction.y,direction.z)
  if(!Number.isFinite(length) || length===0)return null
  const dx=direction.x/length,dy=direction.y/length,dz=direction.z/length
  let nearest=Infinity
  const roots=(a,b,c,accept)=>{
    let discriminant=b*b-a*c
    const tolerance=16*Number.EPSILON*(b*b+Math.abs(a*c)+1)
    if(discriminant < -tolerance)return
    discriminant=Math.sqrt(Math.max(0,discriminant))
    const q=-b-(b<0?-discriminant:discriminant)
    for(const t of q===0?[-b/a]:[q/a,c/q])
      if(t>=0 && t<=range+16*Number.EPSILON*Math.max(1,range) && t<nearest && accept(t))
        nearest=Math.min(range,t)
  }
  const radial=dx*dx+dz*dz
  if(radial>0)roots(radial,ox*dx+oz*dz,ox*ox+oz*oz-radius*radius,
    t=>origin.y+dy*t>=low && origin.y+dy*t<=high)
  for(const y of [low,high]){
    const sy=origin.y-y
    roots(1,ox*dx+sy*dy+oz*dz,ox*ox+sy*sy+oz*oz-radius*radius,()=>true)
  }
  return nearest===Infinity?null:nearest
}

// All callback vectors are detached copies. getVisibleTarget owns the fixed
// observation sector and body-point LOS; it is NEVER polled during LOCK.
// onAim({point}), onCancel({reason}), onState({from,state,reason,time}) and
// onFire(result) are notifications; only the parent applies result.damage.
export function createSniperCore(T, callbacks, config=SNIPER_CONFIG) {
  const p={...SNIPER_CONFIG,...config}
  for(const key of ['aimSeconds','trackingSeconds','fireInterval','searchSeconds','range'])
    if(!Number.isFinite(p[key]) || p[key]<=0)throw Error(`Invalid sniper ${key}`)
  if(p.trackingSeconds>=p.aimSeconds || p.fireInterval<p.aimSeconds ||
    !Number.isFinite(p.damage) || p.damage<0 || !Number.isFinite(p.worldEpsilon) || p.worldEpsilon<0)
    throw Error('Invalid sniper timing or damage')
  let state='IDLE',time=0,aimElapsed=0,cooldown=0,search=0,shotId=0
  let point=null,direction=null,updating=false,revision=0
  const pending=()=>state==='TRACK' || state==='LOCK'
  function enter(next,reason) {
    if(state===next)return
    const from=state;state=next
    callbacks.onState?.({from,state,reason,time})
  }
  function clear(reason) {
    const hadAim=pending()
    point=direction=null;aimElapsed=0
    if(hadAim)callbacks.onCancel?.({reason})
  }
  function cancel(reason='cancel') {
    revision++
    if(state==='DEAD')return
    clear(reason);search=p.searchSeconds;enter('SEARCH',reason)
  }
  function setCooldown(seconds=p.fireInterval) {
    if(!Number.isFinite(seconds) || seconds<0)throw Error('Invalid sniper cooldown')
    revision++
    if(state==='DEAD')return
    clear('cooldown');search=0;cooldown=seconds
    enter(cooldown>0?'COOLDOWN':'IDLE','cooldown')
  }
  function snapshot() {
    return {version:1,state,time,shotId,aimElapsed,cooldownRemaining:cooldown,searchRemaining:search,
      target:point?[point.x,point.y,point.z]:null,direction:direction?[direction.x,direction.y,direction.z]:null}
  }
  const capture=()=>snapshot()
  function reset() {
    revision++;clear('reset')
    time=aimElapsed=cooldown=search=shotId=0
    enter('IDLE','reset')
  }
  function restore(saved) {
    const states=['IDLE','TRACK','LOCK','FIRE','COOLDOWN','SEARCH','DEAD']
    if(!saved || saved.version!==1 || !states.includes(saved.state) ||
      !Number.isSafeInteger(saved.shotId) || saved.shotId<0 ||
      ['time','aimElapsed','cooldownRemaining','searchRemaining'].some(k=>!Number.isFinite(saved[k]) || saved[k]<0) ||
      ['target','direction'].some(k=>saved[k]!==null &&
        (!Array.isArray(saved[k]) || saved[k].length!==3 || !saved[k].every(Number.isFinite))))
      throw Error('Invalid sniper checkpoint')
    revision++;clear('restore')
    time=saved.time;shotId=saved.shotId;aimElapsed=0;search=0
    cooldown=saved.cooldownRemaining
    // Never resurrect a saved aim/locked round. Preserve post-shot cooldown;
    // an interrupted aim gets a full fresh interval before its next shot.
    if(['TRACK','LOCK','FIRE'].includes(saved.state))cooldown=Math.max(cooldown,p.fireInterval)
    if(saved.state==='SEARCH')search=saved.searchRemaining
    const next=saved.state==='DEAD'?'DEAD':search>0?'SEARCH':cooldown>0?'COOLDOWN':'IDLE'
    enter(next,'restore')
    return snapshot()
  }
  function update(dt,{active=true,alive=true}={}) {
    if(updating)return
    if(!alive){revision++;clear('dead');search=cooldown=0;enter('DEAD','dead');return}
    if(state==='DEAD')return
    // Cancel once, then freeze every timer throughout pause/caption/disable.
    if(!active){if(pending())cancel('inactive');return}
    if(!Number.isFinite(dt) || dt<=0)return
    updating=true
    const token=revision
    let remaining=dt,sampled=false,fired=false
    const advance=seconds=>{
      time+=seconds;remaining=Math.max(0,remaining-seconds)
      if(remaining<16*Number.EPSILON*Math.max(1,dt))remaining=0
      cooldown=Math.max(0,cooldown-seconds)
    }
    try{
      while(remaining>0 && revision===token && state!=='DEAD'){
        if(state==='SEARCH'){
          const step=Math.min(remaining,search);advance(step);search=Math.max(0,search-step)
          if(search>1e-10)break
          search=0;enter('COOLDOWN','search-ended')
        }else if(state==='COOLDOWN'){
          // A fresh .75s aim may overlap the end of the 3s fire-to-fire clock.
          // External setCooldown(3) uses the same clock (e.g. warning shot).
          const wait=Math.max(0,cooldown-p.aimSeconds),step=Math.min(remaining,wait)
          advance(step)
          if(cooldown-p.aimSeconds>1e-10)break
          enter('IDLE','ready')
        }else if(state==='IDLE' || state==='TRACK'){
          if(state==='IDLE' && sampled){advance(remaining);break}
          if(!sampled){
            const visible=callbacks.getVisibleTarget();sampled=true
            if(revision!==token)break
            if(!visible){
              if(state==='TRACK'){
                clear('target-lost');search=p.searchSeconds;enter('SEARCH','target-lost');continue
              }
              advance(remaining);break
            }
            point=new T.Vector3().copy(visible)
            callbacks.aimAt(point.clone())
            if(revision!==token)break
            if(state==='IDLE'){
              aimElapsed=0;enter('TRACK','target-visible')
              if(revision!==token)break
              callbacks.onAim?.({point:point.clone()})
            }
          }
          if(revision!==token)break
          const step=Math.min(remaining,Math.max(0,p.trackingSeconds-aimElapsed))
          aimElapsed+=step;advance(step)
          if(aimElapsed+1e-10<p.trackingSeconds)break
          // Copy the .55s solution before entering LOCK. FIRE uses a new
          // muzzle origin but never derives direction from the live player.
          direction=point.clone().sub(callbacks.getMuzzle()).normalize()
          if(revision!==token)break
          if(direction.lengthSq()===0){cancel('invalid-direction');break}
          enter('LOCK','direction-frozen')
        }else if(state==='LOCK'){
          const step=Math.min(remaining,Math.max(0,p.aimSeconds-aimElapsed))
          aimElapsed+=step;advance(step)
          if(aimElapsed+1e-10<p.aimSeconds)break
          // The callback happens now, at this frame's current world sample,
          // not retroactively at a crossed deadline. Start its full cooldown
          // from here; frame overrun must never shorten the actual interval.
          advance(remaining)
          const origin=new T.Vector3().copy(callbacks.getMuzzle()),ray=direction.clone()
          // Commit before callbacks: this shot cannot be replayed by reentry.
          shotId++;point=direction=null;aimElapsed=0;cooldown=p.fireInterval
          enter('FIRE','shot')
          if(revision!==token)break
          const worldHit=callbacks.raycastWorld(origin.clone(),ray.clone(),p.range)
          if(revision!==token)break
          const playerDistance=rayCapsuleDistance(origin,ray,callbacks.getPlayerCapsule(),p.range)
          if(revision!==token)break
          const hit=playerDistance!==null && (!worldHit || playerDistance<worldHit.dist-p.worldEpsilon)
          fired=true
          callbacks.onFire({shotId,time,origin,direction:ray,worldHit,playerDistance,hit,damage:hit?p.damage:0})
          if(revision!==token)break
          enter('COOLDOWN','shot-resolved')
          // A stalled frame supplies only one current collision sample. Do
          // not manufacture catch-up shots from the rest of that frame.
          break
        }else break
      }
    }finally{updating=false}
    return fired
  }
  return {update,snapshot,capture,restore,reset,cancel,setCooldown}
}
