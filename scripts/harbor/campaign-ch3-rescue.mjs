import { CH3 } from './campaign-ch3-layout.mjs'
import { CH3_RESCUE_BLOCKERS } from './campaign-ch3-deployment.mjs'

export const CH3_RESCUE_DOOR = Object.freeze({x:CH3.safeHouse.bounds.maxX,z:-142,
  floor:CH3.safeHouse.floor,top:CH3.safeHouse.ceiling,width:2.44,depth:.18,openBottom:2.44})

// Caller owns worker resources/animation, actors, objectives and checkpoints.
// The roller door is a visible native-material solid; room walls remain A0's.
export function installChapter3Rescue(g,{worker,narrative,getBlockers,onCheckpoint=()=>{}}) {
  const T=g.THREE,d=CH3_RESCUE_DOOR,root=new T.Group(),geometries=[]
  const steel=g.mats.get('steel_galv'),dark=g.mats.get('steel_dark'),stripe=g.mats.get('hazard_stripes')
  let disposed=false,door='closed',unlocked=false,rescued=false,held=!!g.input.down?.('interact'),inputFrame=null,lastEdgeFrame=null,edge=false
  root.name='campaign-ch3-rescue';g.scene.add(root)
  function mesh(size,material,position) {
    const geometry=new T.BoxGeometry(...size),object=new T.Mesh(geometry,material)
    geometries.push(geometry);object.position.set(...position);object.castShadow=object.receiveShadow=true;root.add(object);return object
  }
  const panel=mesh([d.depth,1,d.width],steel,[d.x,0,d.z]);panel.name='ch3-repair-door'
  const box=g.physics.addBox([d.x-d.depth/2,d.floor,d.z-d.width/2],[d.x+d.depth/2,d.top,d.z+d.width/2],{surface:'metal',tag:panel.name})
  // Header and guides sit on the existing shell, outside its clear aperture.
  mesh([.22,.10,d.width+.10],stripe,[d.x,d.top+.05,d.z])
  for(const side of [-1,1])mesh([.22,d.top-d.floor,.045],dark,[d.x,(d.top+d.floor)/2,d.z+side*(d.width/2+.025)])
  const controls=[-1,1].map(side=>{
    const position=new T.Vector3(d.x+side*(d.depth/2+.025),1.12,d.z+.94)
    mesh([.045,.18,.14],dark,position.toArray())
    return position.clone().add(new T.Vector3(side*.025,0,0))
  })
  worker.root.position.set(CH3.safeHouse.survivor.x,CH3.safeHouse.survivor.y,CH3.safeHouse.survivor.z)
  worker.root.rotation.y=-Math.PI/2;root.add(worker.root)
  const workerPoint=new T.Vector3(CH3.safeHouse.survivor.x,CH3.safeHouse.survivor.y+1.15,CH3.safeHouse.survivor.z)
  function syncDoor() {
    const bottom=door==='open'?d.openBottom:d.floor
    const changed=box.min.y!==bottom
    box.min.y=bottom;panel.position.y=(bottom+d.top)/2;panel.scale.y=d.top-bottom
    root.updateMatrixWorld(true)
    if(changed)g.physics.build()
  }
  const active=()=>!disposed&&g.game.state==='playing'&&g.player.alive&&g.player.enabled!==false&&!narrative?.snapshot().active
  function localClear() {
    const blockers=getBlockers()
    // Missing/unloaded actors cannot silently unlock a new run. The caller
    // supplies exactly the exported blocker subset, never the whole squad.
    return Array.isArray(blockers)&&blockers.length===CH3_RESCUE_BLOCKERS.length&&new Set(blockers).size===blockers.length&&
      blockers.every(actor=>actor&&(actor.alive===false||Number.isFinite(actor.hp)&&actor.hp<=0))
  }
  function update() {
    if(!active())return
    if(!unlocked&&localClear()){
      unlocked=true;onCheckpoint({kind:'repair-unlocked'})
    }
  }
  function readEdge() {
    if(inputFrame!==g.time.frame){
      inputFrame=g.time.frame
      const down=!!g.input.down?.('interact')
      edge=!!g.input.pressed('interact')&&!held;held=down
    }
    if(!edge||lastEdgeFrame===g.time.frame)return false
    lastEdgeFrame=g.time.frame;return true
  }
  function nearby(target,range=2) {
    const p=g.player.pos,f=g.player.forward,dx=target.x-p.x,dz=target.z-p.z,distance=Math.hypot(dx,dz)
    return distance<=range&&g.player.eye.distanceTo(target)<=2.15&&
      (dx*f.x+dz*f.z)/Math.max(.001,distance*Math.hypot(f.x,f.z))>=.5&&g.physics.lineOfSight(g.player.eye,target)
  }
  function inside(point,margin=.32) {
    const b=CH3.safeHouse.bounds
    return point.x>b.minX+margin&&point.x<b.maxX-margin&&point.z>b.minZ+margin&&point.z<b.maxZ-margin&&
      point.y>=d.floor-.03&&point.y+1.15<d.top
  }
  function interact() {
    const pressed=readEdge()
    if(!active())return false
    update()
    if(!rescued&&inside(g.player.pos)&&door==='open'&&nearby(workerPoint,1.9)){
      g.hud.setPrompt('确认许工安全')
      if(!pressed)return false
      rescued=true;g.hud.setPrompt(null);onCheckpoint({kind:'worker-rescued'});return true
    }
    const side=g.player.pos.x>=d.x?1:0
    if(!nearby(controls[side]))return false
    g.hud.setPrompt(unlocked?(door==='closed'?'开启维修室门':'关闭维修室门'):'维修室被封锁 · 解决门外的两名封锁者')
    if(!pressed||!unlocked)return false
    // A close request cannot crush a capsule in the aperture. No invisible
    // protection volume, damage override or actor-specific room immunity.
    const p=g.player.pos
    if(door==='open'&&Math.abs(p.x-d.x)<=d.depth/2+.33&&Math.abs(p.z-d.z)<=d.width/2+.32)return false
    door=door==='closed'?'open':'closed';syncDoor();g.hud.setPrompt(null)
    onCheckpoint({kind:door==='open'?'repair-door-open':'repair-door-closed'});return true
  }
  function capture(){return {version:1,door,unlocked,rescued}}
  function validateCapture(data) {
    if(!data||data.version!==1||!['closed','open'].includes(data.door)||typeof data.unlocked!=='boolean'||typeof data.rescued!=='boolean'||
      !data.unlocked&&(data.door==='open'||data.rescued))throw Error('Invalid CH3 rescue capture')
    return {version:1,door:data.door,unlocked:data.unlocked,rescued:data.rescued}
  }
  function restore(data) {
    const saved=validateCapture(data)
    if(disposed)throw Error('CH3 rescue disposed')
    ;({door,unlocked,rescued}=saved)
    inputFrame=null;lastEdgeFrame=g.time.frame;held=!!g.input.down?.('interact');edge=false
    syncDoor();return true
  }
  function allowsEnemySegment(from,to,radius=.32,height=1.8) {
    if(disposed||Math.min(from.y,to.y)+height<=box.min.y||Math.max(from.y,to.y)>=box.max.y)return true
    let first=0,last=1
    for(const axis of ['x','z']){
      const delta=to[axis]-from[axis],min=box.min[axis]-radius,max=box.max[axis]+radius
      if(Math.abs(delta)<1e-10){if(from[axis]<min||from[axis]>max)return true;continue}
      const a=(min-from[axis])/delta,b=(max-from[axis])/delta
      first=Math.max(first,Math.min(a,b));last=Math.min(last,Math.max(a,b));if(first>last)return true
    }
    return false
  }
  // One initial batch indexes the added solid. Stable update/interact calls
  // perform no rebuild; only an actual open/close/restore geometry change does.
  syncDoor();g.physics.build()
  return {update,interact,reset:()=>restore({version:1,door:'closed',unlocked:false,rescued:false}),capture,validateCapture,restore,
    allowsEnemySegment,
    snapshot:()=>({...capture(),disposed,blockers:[...CH3_RESCUE_BLOCKERS],doorBox:{min:box.min.toArray(),max:box.max.toArray()},
      controls:controls.map(p=>p.toArray()),worker:worker.snapshot(),objective:rescued?'许工已获救':unlocked?'进入维修室，靠近许工按 E 确认安全':'突破维修区局部封锁，营救许工'}),
    dispose(){if(disposed)return;disposed=true;worker.root.removeFromParent();root.removeFromParent();g.physics.removeBox(box);g.physics.build();for(const geometry of geometries)geometry.dispose()},
  }
}
