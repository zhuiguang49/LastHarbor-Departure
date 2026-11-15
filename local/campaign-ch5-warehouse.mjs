export const CH5_WAREHOUSE_MOTION=Object.freeze({lift:3,seconds:4})

// Both native ab() ground-level apertures must share the interlock. The host
// owns its 60-second clock; these shutters only move after start(). Original
// walls, rolled/stowed door hardware, materials and interior remain in place.
export function createChapter5Warehouse(g) {
  const T=g.THREE,root=new T.Group(),colliders=[],doors=[]
  root.name='campaign-ch5-warehouse-shutters';g.scene.add(root)
  const steel=g.mats.get('steel_galv'),panel=g.mats.get('corrugated_roof'),stripe=g.mats.get('hazard_stripes')
  const specs=[
    {id:'south',position:[-3.5,0,-11.16],yaw:0},
    {id:'east',position:[11.96,0,-19.5],yaw:Math.PI/2},
  ]
  function mesh(parent,size,position,material){
    const object=new T.Mesh(new T.BoxGeometry(...size),material)
    object.position.set(...position);object.castShadow=object.receiveShadow=true;parent.add(object)
  }
  for(const spec of specs){
    const door=new T.Group();door.name=`campaign-ch5-warehouse-${spec.id}`
    door.position.set(...spec.position);door.rotation.y=spec.yaw;root.add(door)
    mesh(door,[5,4.5,.12],[0,2.25,0],panel)
    mesh(door,[5,.12,.16],[0,.06,0],stripe)
    for(const x of [-2.46,2.46])mesh(door,[.08,4.5,.16],[x,2.25,0],steel)
    root.updateMatrixWorld(true)
    const bounds=new T.Box3().setFromObject(door)
    const collider=g.physics.addBox(bounds.min,bounds.max,{surface:'metal',tag:`campaign-ch5-warehouse-${spec.id}`})
    doors.push({spec,object:door,collider,base:{min:collider.min.y,max:collider.max.y}});colliders.push(collider)
  }
  let started=false,progress=0
  // Native capsule/LOS use the live boxes. Nav alone caches vertical occupancy.
  const navSignature=()=>colliders.map(box=>box.max.y>=.47&&box.min.y<=1.5?'1':'0').join('')
  let signature=navSignature()
  g.physics.build()
  function sync(next){
    if(next===progress)return
    progress=next
    const lift=progress*CH5_WAREHOUSE_MOTION.lift
    for(const {object,collider,base}of doors){
      object.position.y=lift;collider.min.y=base.min+lift;collider.max.y=base.max+lift
    }
    root.updateMatrixWorld(true)
    const nextSignature=navSignature()
    if(signature!==nextSignature){signature=nextSignature;g.physics.build()}
  }
  const capture=()=>({started,progress})
  return {
    root,colliders,
    start(){if(started)return false;started=true;return true},
    update(dt){if(!started||!Number.isFinite(dt)||dt<=0||progress===1)return;sync(Math.min(1,progress+dt/CH5_WAREHOUSE_MOTION.seconds))},
    reset(saved){const next=Math.max(0,Math.min(1,Number.isFinite(saved?.progress)?saved.progress:0));started=!!saved?.started||next>0;sync(next)},
    capture,
    snapshot:()=>({...capture(),phase:started?(progress===1?'open':'opening'):'closed',lift:progress*CH5_WAREHOUSE_MOTION.lift,
      colliders:colliders.map(box=>({tag:box.tag,min:box.min.toArray(),max:box.max.toArray()})),
      doors:doors.map(({spec,object})=>({id:spec.id,position:object.position.toArray(),yaw:spec.yaw}))}),
  }
}
