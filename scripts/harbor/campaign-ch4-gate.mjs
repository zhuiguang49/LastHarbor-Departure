export const CH4_GATE_MOTION=Object.freeze({lift:3,seconds:4})

// The host owns the 60-second defense clock and calls start only on completion.
// Move the supplied complete model and its existing handles; never replace it
// with an invisible blocker or release the asset pack's shared GPU resources.
export function createChapter4Gate(g,{object,colliders,placement}) {
  const origin=object.position.y,base=colliders.map(box=>({min:box.min.y,max:box.max.y}))
  const bounds=new g.THREE.Box3().setFromObject(object)
  const aperture=Object.freeze({minX:bounds.min.x,maxX:bounds.max.x,z:object.position.z,minZ:bounds.min.z,maxZ:bounds.max.z})
  let started=false,progress=0,disposed=false
  // Audited native d3 navigation uses .42m step + .05m and 1.5m headroom.
  // Physics/LOS read these same live handles directly; only nav is cached.
  const navSignature=()=>colliders.map(box=>!box.noNav&&!box.bulletOnly&&box.max.y>=.47&&box.min.y<=1.5?'1':'0').join('')
  let signature=navSignature()
  function sync(next) {
    if(next===progress)return
    progress=next
    const lift=progress*CH4_GATE_MOTION.lift
    object.position.y=origin+lift;object.updateMatrixWorld(true)
    for(const [i,box]of colliders.entries()){
      box.min.y=base[i].min+lift;box.max.y=base[i].max+lift
      placement.colliders[i].min[1]=box.min.y;placement.colliders[i].max[1]=box.max.y
    }
    placement.position.y=object.position.y
    const nextSignature=navSignature()
    if(signature!==nextSignature){signature=nextSignature;g.physics.build()}
  }
  function isPassableAt(point,{height=1.8,radius=.32}={}) {
    if(disposed||point.x-radius<aperture.minX||point.x+radius>aperture.maxX)return false
    // Match the native horizontal capsule's height/step tests. At an observed
    // crossing, use its actual posture (or 1.15m if it stood after clearing).
    return !colliders.some(box=>point.x+radius>box.min.x&&point.x-radius<box.max.x&&
      box.max.y>point.y+.42&&box.min.y<point.y+height)
  }
  const capture=()=>({started,progress})
  return {
    start(){if(disposed||started)return false;started=true;return true},
    update(dt){if(disposed||!started||!Number.isFinite(dt)||dt<=0||progress===1)return;sync(Math.min(1,progress+dt/CH4_GATE_MOTION.seconds))},
    reset(saved){if(disposed)return;const next=Math.max(0,Math.min(1,Number.isFinite(saved?.progress)?saved.progress:0));started=!!saved?.started||next>0;sync(next)},
    capture,isPassableAt,
    snapshot:()=>({...capture(),disposed,phase:started?(progress===1?'open':'opening'):'closed',
      lift:progress*CH4_GATE_MOTION.lift,aperture:{...aperture},
      standingPassable:isPassableAt({x:object.position.x,y:origin,z:aperture.z}),
      crouchPassable:isPassableAt({x:object.position.x,y:origin,z:aperture.z},{height:1.15})}),
    dispose(){disposed=true},
  }
}
