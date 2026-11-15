// M3-A1: one stationary sniper. The parent owns FOV/LOS, actor HP and the
// native player's live collision height (1.8 standing / 1.15 crouched).
export const SNIPER_CONFIG = Object.freeze({
  position:Object.freeze([8,5.2,-154]), yaw:.735, horizontalFovDegrees:130, range:80,
  actorHP:200, playerRadius:.32,
  damage:40, aimSeconds:.75, trackingSeconds:.55, fireInterval:3, fireMode:'single-shot',
  searchSeconds:.6, worldEpsilon:1e-4,
  hitRecoverySeconds:.96, warningAimSeconds:.35, scopeGlintSeconds:.2, muzzleFlashSeconds:.055,
})
