// M3-A2 ordinary riflemen only. The accepted tower sniper keeps its own tuning.
export const CLEARANCE_CONFIG=Object.freeze({
  actorHP:100,damage:5,range:32,stopRange:15,horizontalFovDegrees:110,
  aimSeconds:.8,lockSeconds:.15,fireInterval:2,firePoseSeconds:.24,burstRounds:4,burstInterval:.10,hitRecoverySeconds:.96,
  maxShooters:2,maxGroupShooters:2,memorySeconds:6,groupRadius:18,
  gunRadius:30,stepRadius:8,sprintRadius:12,occludedHearingScale:.35,
  walkSpeed:1.1,alertSpeed:2,gunSpeed:3,turnSpeed:3.5,radius:.32,height:1.8,spacing:.06,
  arrival:.16,patrolWait:1.4,repathSeconds:.8,goalChange:.6,maxMoveSeconds:.2,moveStep:.025,
  farDistance:46,farSenseSeconds:.65,farAnimationSeconds:.25,nearSenseSeconds:.12,
  worldEpsilon:1e-4,
})
