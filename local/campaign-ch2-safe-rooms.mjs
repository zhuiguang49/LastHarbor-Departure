import { CH2_SAFE_ZONES } from './campaign-ch2-layout.mjs'

// Native crouch passage: floor .172, crouched head 1.322, shutter bottom
// <=1.55, infected head >=1.8. Never an actor-specific/invisible collider.
export const CH2_SAFE_ROOM_DOOR = Object.freeze({floor:.172,top:2.5,width:2.3,depth:.16,openBottom:1.55,seconds:.8})
const ammo=[12,18,12]
export function installChapter2SafeRooms(g,{equipment,onCheckpoint=()=>{},canInteract=()=>true}={}) {
  const T=g.THREE,d=CH2_SAFE_ROOM_DOOR,root=new T.Group(),handles=[],geometries=[]
  root.name='campaign-ch2-safe-rooms';g.scene.add(root)
  let disposed=false,lastEdgeFrame=null,inputFrame=null,edge=false,held=!!g.input.down?.('interact'),occupant=null,previous=null
  const steel=g.mats.get('steel_galv'),dark=g.mats.get('steel_dark'),stripe=g.mats.get('hazard_stripes')
  function mesh(size,material,position,parent=root) {
    const geometry=new T.BoxGeometry(...size),object=new T.Mesh(geometry,material)
    geometries.push(geometry);object.position.set(...position);object.castShadow=object.receiveShadow=true;parent.add(object);return object
  }
  function label(text,position,yaw,parent=root,width=1.8) {
    const material=g.mats.label(text,{color:'white',font:'sans',distress:.2}).material
    const geometry=new T.PlaneGeometry(width,.13),object=new T.Mesh(geometry,material)
    geometries.push(geometry);object.position.set(...position);object.rotation.y=yaw;parent.add(object)
  }
  const rooms=CH2_SAFE_ZONES.map((zone,index)=>{
    const along=zone.yaw?'z':'x',cross=along==='z'?'x':'z',room={zone,along,cross,entered:false,consumed:false,forwardExited:false,doors:[]}
    for(const entrance of zone.entrances){
      const center=new T.Vector3(...entrance.min).add(new T.Vector3(...entrance.max)).multiplyScalar(.5)
      const size=along==='z'?[d.width,1,d.depth]:[d.depth,1,d.width]
      const panel=mesh(size,steel,[center.x,0,center.z]);panel.name=entrance.id
      const min=center.clone(),max=center.clone();min[cross]-=d.width/2;max[cross]+=d.width/2;min[along]-=d.depth/2;max[along]+=d.depth/2;min.y=d.floor;max.y=d.top
      const box=g.physics.addBox(min,max,{surface:'metal',tag:entrance.id});handles.push(box)
      const door={id:entrance.id,center,panel,box,progress:0,target:0,held:false};room.doors.push(door)
      // Original industrial materials, tracks and a compressing roller curtain.
      for(const side of [-1,1]){
        const p=center.clone();p[cross]+=side*(d.width/2+.035);p.y=(d.top+d.floor)/2
        mesh(along==='z'?[.07,d.top-d.floor,.20]:[.20,d.top-d.floor,.07],dark,p.toArray())
      }
      const p=center.clone();p.y=2.47
      mesh(along==='z'?[d.width,.06,.18]:[.18,.06,d.width],stripe,p.toArray())
      for(const side of [-1,1]){
        const p=center.clone();p[along]+=side*.105;p.y=2.25
        label('E 启闭隔离门 · 蹲行通过',p.toArray(),along==='z'?(side>0?0:Math.PI):(side>0?Math.PI/2:-Math.PI/2))
        const control=center.clone();control[along]+=side*.115;control[cross]+=d.width/2-.07;control.y=1.02
        mesh(along==='z'?[.14,.18,.05]:[.05,.18,.14],dark,control.toArray())
      }
    }
    // Wall-mounted original-style ammo cartons, off the clear central aisle.
    const station=new T.Group();station.position.set(zone.x,0,zone.z);station.rotation.y=zone.yaw;root.add(station)
    mesh([.64,.045,.24],steel,[0,.94,-.96],station)
    mesh([.64,.36,.035],dark,[0,1.10,-1.09],station)
    const pickup=new T.Group();station.add(pickup)
    for(const x of [-.16,.16]){
      mesh([.17,.105,.14],dark,[x,1.015,-.94],pickup)
      mesh([.175,.012,.145],steel,[x,1.074,-.94],pickup)
    }
    label(`P12 +${ammo[index]} · 已持步枪补满 · 一次领取`,[0,1.32,-1.06],0,station,1.65)
    station.updateMatrixWorld(true)
    const bounds=new T.Box3(new T.Vector3(-.32,.92,-1.108),new T.Vector3(.32,1.28,-1.072)).applyMatrix4(station.matrixWorld)
    handles.push(g.physics.addBox(bounds.min,bounds.max,{surface:'metal',tag:`${zone.id}.shelf`}))
    room.pickup=pickup;room.station=station.localToWorld(new T.Vector3(0,1.08,-.85));room.pistolAmmo=ammo[index]
    return room
  })
  function syncDoor(door) {
    const bottom=d.floor+(d.openBottom-d.floor)*door.progress
    door.panel.position.y=(bottom+d.top)/2;door.panel.scale.y=d.top-bottom
    door.box.min.y=bottom;door.box.max.y=d.top
    door.panel.updateMatrixWorld(true)
  }
  function sync() {for(const room of rooms){room.pickup.visible=!room.consumed;for(const door of room.doors)syncDoor(door)}g.physics.build()}
  function contains(point,{margin=0}={}) {
    if(!point || !['x','y','z'].every(k=>Number.isFinite(point[k])))return null
    const room=rooms.find(({zone:{bounds:b}})=>point.x>=b.minX+margin&&point.x<=b.maxX-margin&&point.z>=b.minZ+margin&&point.z<=b.maxZ-margin&&point.y>=-.025&&point.y<d.top)
    return room?.zone.id??null
  }
  const isSafe=point=>!!contains(point,{margin:.32})&&point.y>=d.floor-.025
  const limits={
    'ch2.s1':[{room:rooms[0],door:rooms[0].doors[0],side:-1}],
    'ch2.s2':[{room:rooms[0],door:rooms[0].doors[1],side:1},{room:rooms[1],door:rooms[1].doors[0],side:-1}],
    'ch2.s3':[{room:rooms[1],door:rooms[1].doors[1],side:1},{room:rooms[2],door:rooms[2].doors[0],side:-1}],
  }
  const outward=(edge,point)=>(point[edge.room.along]-edge.door.center[edge.room.along])*edge.side
  function apron(edge,distance) {
    const point=edge.door.center.clone();point[edge.room.along]+=edge.side*distance;point.y=0;return point
  }
  // Behaviour territory, not a player collider: each cohort keeps the same
  // side of the real safety doors, including all outdoor routes around them.
  function allowsSectionSegment(sectionId,from,to,radius=.32) {
    return limits[sectionId].every(edge=>outward(edge,from)>=radius+d.depth/2-.00001&&outward(edge,to)>=radius+d.depth/2-.00001)
  }
  function sectionApproach(sectionId,known) {
    const edge=limits[sectionId].find(edge=>outward(edge,known)<.32+d.depth/2)
    return edge?apron(edge,1.1):null
  }
  function waitingPoint(sectionId,from,player) {
    if(!isSafe(player))return null
    const edge=limits[sectionId].find(edge=>edge.room.zone.id===contains(player))
    return edge&&outward(edge,from)<3.25?apron(edge,3.5):from.clone()
  }
  function segmentHits(from,to,box,radius,height) {
    if(Math.min(from.y,to.y)+height<=box.min.y || Math.max(from.y,to.y)>=box.max.y)return false
    let first=0,last=1
    for(const axis of ['x','z']){
      const delta=to[axis]-from[axis],min=box.min[axis]-radius,max=box.max[axis]+radius
      if(Math.abs(delta)<1e-10){if(from[axis]<min||from[axis]>max)return false;continue}
      const a=(min-from[axis])/delta,b=(max-from[axis])/delta
      first=Math.max(first,Math.min(a,b));last=Math.min(last,Math.max(a,b));if(first>last)return false
    }
    return true
  }
  function allowsEnemySegment(from,to,radius=.32,height=1.8) {
    return !rooms.some(room=>room.doors.some(door=>segmentHits(from,to,door.box,radius,height)))
  }
  // Project only the caller's already-known clue to the accessible exterior.
  // Each pursuer retains its own memory/tracker record; nothing is broadcast.
  function enemyApproach(from,known) {
    const room=rooms.find(room=>room.zone.id===contains(known))
    if(!room)return null
    return room.doors.map(door=>{
      const point=door.center.clone();point[room.along]+=Math.sign(door.center[room.along]-room.zone[room.along])*1.1;point.y=0;return point
    }).sort((a,b)=>a.distanceToSquared(from)-b.distanceToSquared(from))[0]
  }
  const canAttack=(from,to)=>!contains(to) && allowsEnemySegment(from,to,0,1.8)
  const active=()=>!disposed&&g.game.state==='playing'&&g.player.alive&&g.player.enabled&&canInteract()
  function readEdge() {
    if(inputFrame!==g.time.frame){
      inputFrame=g.time.frame
      const down=!!g.input.down?.('interact'),pressed=!!g.input.pressed('interact')
      edge=pressed&&!held;held=down
    }
    if(!edge || lastEdgeFrame===g.time.frame)return false
    lastEdgeFrame=g.time.frame;return true
  }
  function nearby(position,range=1.9) {
    const p=g.player.pos,dx=position.x-p.x,dz=position.z-p.z,distance=Math.hypot(dx,dz),f=g.player.forward
    return distance<=range&&Math.abs(position.y-p.y)<=2&&
      (dx*f.x+dz*f.z)/Math.max(.001,distance*Math.hypot(f.x,f.z))>=.45&&g.physics.lineOfSight(g.player.eye,position)
  }
  function interact() {
    const pressed=readEdge()
    if(!active())return false
    const room=rooms.find(room=>!room.consumed&&isSafe(g.player.pos)&&contains(g.player.pos)===room.zone.id&&nearby(room.station))
    if(room){
      g.hud.setPrompt('领取一次性弹药补给')
      if(!pressed || !room.entered)return false
      const slots=equipment.capture().slots
      if(slots.pistol?.owned)equipment.addAmmo('pistol',room.pistolAmmo)
      if(slots.rifle?.owned)equipment.refill('rifle')
      room.consumed=true;room.pickup.visible=false;g.hud.setPrompt(null)
      // Reward and physical disappearance precede the host's complete commit.
      onCheckpoint({kind:'ammo',id:room.zone.id});return true
    }
    for(const room of rooms)for(const door of room.doors){
      const side=g.player.pos[room.along]>=door.center[room.along]?1:-1
      const control=door.center.clone();control[room.along]+=side*.13;control[room.cross]+=d.width/2-.07;control.y=1.02
      if(!nearby(control))continue
      g.hud.setPrompt(door.target?'关闭隔离门':'开启隔离门 · 蹲行通过')
      if(!pressed)return false
      door.target=1-door.target;door.held=false;return true
    }
    return false
  }
  function standingSafe(room) {
    const p=g.player
    if(!isSafe(p.pos)||contains(p.pos)!==room.zone.id||!p.onGround||Math.abs(p.pos.y-d.floor)>.025||p.vel.length()>.05)return false
    const trial=p.pos.clone(),result=g.physics.moveCapsule(trial,new T.Vector3(),0,.32,p.crouching?1.15:1.8,true)
    return result.onGround&&!result.hitWall&&!result.hitCeil&&trial.distanceTo(p.pos)<1e-5
  }
  function update(dt) {
    if(!active()) {readEdge();return}
    if(!Number.isFinite(dt)||dt<0)return
    let changed=false
    for(const room of rooms)for(const door of room.doors){
      const next=door.progress+Math.sign(door.target-door.progress)*Math.min(Math.abs(door.target-door.progress),dt/d.seconds)
      door.held=false
      if(next<door.progress){
        const proposed={min:door.box.min.clone(),max:door.box.max};proposed.min.y=d.floor+(d.openBottom-d.floor)*next
        door.held=segmentHits(g.player.pos,g.player.pos,proposed,.34,(g.player.crouching?1.15:1.8)+.04)
      }
      if(!door.held&&next!==door.progress){door.progress=next;syncDoor(door);changed=true}
    }
    if(changed)g.physics.build()
    const p=g.player.pos
    if(previous&&p.distanceTo(previous)<4&&occupant){
      const room=rooms.find(room=>room.zone.id===occupant)
      for(const [index,door] of room.doors.entries()){
        const side=index?1:-1,boundary=door.center[room.along]+side*(d.depth/2+.32)
        if((previous[room.along]-boundary)*side<=0&&(p[room.along]-boundary)*side>0&&
          Math.abs(p[room.cross]-door.center[room.cross])<=d.width/2-.32&&Math.abs(p.y-d.floor)<.25&&
          // The native player may stand as soon as its capsule clears the
          // curtain. Check the crouch passage, not the posture after exiting.
          door.box.min.y>=d.floor+1.15-.01){
          occupant=null
          if(index===1&&!room.forwardExited){room.forwardExited=true;onCheckpoint({kind:'exit',id:room.zone.id})}
          break
        }
      }
    }
    if(isSafe(p))occupant=contains(p)
    else if(occupant){
      const room=rooms.find(room=>room.zone.id===occupant)
      if(Math.abs(p[room.cross]-room.zone[room.cross])>1.3||Math.abs(p[room.along]-room.zone[room.along])>3.8)occupant=null
    }
    previous=p.clone()
    for(const room of rooms)if(!room.entered&&standingSafe(room)){
      room.entered=true;onCheckpoint({kind:'enter',id:room.zone.id})
    }
  }
  function capture() {
    return {schemaVersion:2,occupant,rooms:rooms.map(room=>({id:room.zone.id,entered:room.entered,consumed:room.consumed,forwardExited:room.forwardExited,
      doors:room.doors.map(({id,progress,target,held})=>({id,progress,target,held}))}))}
  }
  function validateCapture(data) {
    const invalid=()=>{throw Error('Invalid CH2 safe rooms capture')}
    if(!data||data.schemaVersion!==2||!(data.occupant===null||rooms.some(room=>room.zone.id===data.occupant))||!Array.isArray(data.rooms)||data.rooms.length!==rooms.length)invalid()
    const seen=new Set()
    for(const saved of data.rooms){
      const room=rooms.find(room=>room.zone.id===saved?.id)
      if(!room||seen.has(saved.id)||typeof saved.entered!=='boolean'||typeof saved.consumed!=='boolean'||typeof saved.forwardExited!=='boolean'||saved.consumed&&!saved.entered||!Array.isArray(saved.doors)||saved.doors.length!==2)invalid()
      seen.add(saved.id);const ids=new Set()
      for(const door of saved.doors){
        if(!room.doors.some(d=>d.id===door?.id)||ids.has(door.id)||!Number.isFinite(door.progress)||door.progress<0||door.progress>1||![0,1].includes(door.target)||typeof door.held!=='boolean'||door.held&&(door.target!==0||door.progress===0))invalid()
        ids.add(door.id)
      }
    }
    return {schemaVersion:2,occupant:data.occupant,rooms:data.rooms.map(room=>({id:room.id,entered:room.entered,consumed:room.consumed,forwardExited:room.forwardExited,
      doors:room.doors.map(({id,progress,target,held})=>({id,progress,target,held}))}))}
  }
  function restore(data) {
    const saved=validateCapture(data)
    if(disposed)throw Error('CH2 safe rooms disposed')
    for(const entry of saved.rooms){
      const room=rooms.find(room=>room.zone.id===entry.id);room.entered=entry.entered;room.consumed=entry.consumed;room.forwardExited=entry.forwardExited
      for(const door of entry.doors)Object.assign(room.doors.find(d=>d.id===door.id),door)
    }
    occupant=saved.occupant;previous=g.player.pos.clone()
    lastEdgeFrame=g.time.frame;inputFrame=null;held=!!g.input.down?.('interact');sync();return true
  }
  const reset=()=>restore({schemaVersion:2,occupant:null,rooms:rooms.map(room=>({id:room.zone.id,entered:false,consumed:false,forwardExited:false,doors:room.doors.map(door=>({id:door.id,progress:0,target:0,held:false}))}))})
  reset()
  return {interact,update,reset,capture,validateCapture,restore,contains,isSafe,allowsEnemySegment,enemyApproach,canAttack,allowsSectionSegment,sectionApproach,waitingPoint,
    snapshot:()=>({...capture(),disposed,doorGeometry:{...d},rooms:rooms.map(room=>({...capture().rooms.find(r=>r.id===room.zone.id),station:room.station.toArray(),pickupVisible:room.pickup.visible,
      doors:room.doors.map(door=>({id:door.id,progress:door.progress,target:door.target,held:door.held,min:door.box.min.toArray(),max:door.box.max.toArray()}))}))}),
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const box of handles)g.physics.removeBox(box);g.physics.build();for(const geometry of geometries)geometry.dispose()},
  }
}
