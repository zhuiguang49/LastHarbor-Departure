import { SNIPER_CONFIG } from './campaign-ch3-sniper-config.mjs'

// The observation sector stays anchored to the tower, not the actor's last
// tracking rotation. Only visible body samples leave this function.
export function createSniperPerception(g, { getEye, getMuzzle }, config=SNIPER_CONFIG) {
  const T=g.THREE, forward=new T.Vector3(-Math.sin(config.yaw),0,-Math.cos(config.yaw))
  const threshold=Math.cos(config.horizontalFovDegrees*Math.PI/360)
  let samples=0,visibleSamples=0
  function clear(from,to) {
    const direction=to.clone().sub(from),distance=direction.length()
    if(distance<1e-5)return false
    const hit=g.physics.raycast(from,direction.multiplyScalar(1/distance),distance)
    return !hit || hit.dist>=distance-config.worldEpsilon
  }
  function getVisibleTarget() {
    if(!g.player.alive || g.player.enabled===false)return null
    const capsule=g.player.captureCampaignCollider(),eye=getEye(),muzzle=getMuzzle()
    const offset=capsule.position.clone().sub(eye),distance=offset.length()
    if(distance>config.range || distance<1)return null
    const flat=offset.clone().setY(0).normalize()
    if(flat.dot(forward)<threshold)return null
    const side=new T.Vector3(-flat.z,0,flat.x),r=capsule.radius,h=capsule.height
    // Upper torso, head, shoulders, then exposed lower body. The top/bottom
    // points stay inside the native rounded capsule rather than a guessed AABB.
    const points=[[0,h-r-.12],[0,h-r*.35],[-r*.65,h-r-.18],[r*.65,h-r-.18],
      [0,Math.max(r,h*.45)],[-r*.65,r+.15],[r*.65,r+.15],[0,r*.5]]
    for(const [x,y] of points) {
      const point=capsule.position.clone().addScaledVector(side,x);point.y+=y;samples++
      const direction=point.clone().sub(eye)
      if(direction.length()>config.range || direction.setY(0).normalize().dot(forward)<threshold)continue
      if(clear(eye,point) && clear(muzzle,point)){visibleSamples++;return point}
    }
    return null
  }
  return {getVisibleTarget,snapshot:()=>({samples,visibleSamples,yaw:config.yaw,horizontalFovDegrees:config.horizontalFovDegrees,range:config.range})}
}
