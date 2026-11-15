// Audited x_ closure in the immutable source. Preserve gameplay timers that
// reset() otherwise clears, especially the delay before native HP regeneration.
export const CAMPAIGN_PLAYER_BRIDGE = 'C.captureCampaignCollider=()=>({position:C.pos.clone(),radius:Pi.radius,height:C.alive?o:.6});C.captureCampaignMotion=()=>({wasGrounded:l,coyote:r,jumpBuffer:a,airTime:c,fallSpeed:u,stride:h,damageAge:E});C.restoreCampaignMotion=F=>{l=F.wasGrounded;r=F.coyote;a=F.jumpBuffer;c=F.airTime;u=F.fallSpeed;h=F.stride;E=F.damageAge;o=C.crouching?Mt.crouchHeight:Mt.standHeight;K(0)};'

export function captureCampaignPlayer(player) {
  return { position:player.pos.toArray(), velocity:player.vel.toArray(), lastSafe:player.lastSafe.toArray(),
    yaw:player.yaw,pitch:player.pitch,health:player.health,onGround:player.onGround,crouching:player.crouching,
    sprinting:player.sprinting,speed:player.speed,ads:player.ads,motion:player.captureCampaignMotion() }
}

export function validateCampaignPlayer(saved, maxHealth = 100) {
  const invalid = () => { throw Error('Invalid campaign player checkpoint') }
  if (!saved) invalid()
  for (const key of ['position','velocity','lastSafe']) {
    if (!Array.isArray(saved[key]) || saved[key].length !== 3 || !saved[key].every(value=>Number.isFinite(value)&&Math.abs(value)<=10000)) invalid()
  }
  for (const key of ['yaw','pitch','health','speed','ads']) if (!Number.isFinite(saved[key])) invalid()
  if (saved.health<=0 || saved.health>maxHealth || Math.abs(saved.yaw)>1e9 || Math.abs(saved.pitch)>1.6 ||
    saved.speed<0 || saved.speed>100 || saved.ads<0 || saved.ads>1) invalid()
  for (const key of ['onGround','crouching','sprinting']) if (typeof saved[key]!=='boolean') invalid()
  if (!saved.motion || typeof saved.motion.wasGrounded!=='boolean') invalid()
  for (const key of ['coyote','jumpBuffer','airTime','fallSpeed','stride','damageAge']) {
    if (!Number.isFinite(saved.motion[key]) || saved.motion[key]<0 || saved.motion[key]>1e9) invalid()
  }
  return JSON.parse(JSON.stringify(saved))
}

export function restoreCampaignPlayer(g, saved) {
  const state = validateCampaignPlayer(saved, g.player.maxHealth)
  g.player.reset({pos:new g.THREE.Vector3(...state.position),yaw:state.yaw})
  for (const key of ['pitch','health','onGround','crouching','sprinting','speed','ads']) g.player[key]=state[key]
  g.player.vel.fromArray(state.velocity);g.player.lastSafe.fromArray(state.lastSafe)
  g.player.restoreCampaignMotion(state.motion)
}
