import { CH3_CLEARANCE_DEPLOYMENTS } from './campaign-ch3-deployment.mjs'

const p=(x,z)=>({x,y:0,z})
export const CH3_AMMO_SITES = [
  {id:'ch3-ammo-g1',group:'g1',position:p(-21.6,-185),yaw:Math.PI/2,approach:p(-20,-185),route:p(-20,-186),cover:p(-24,-185)},
  {id:'ch3-ammo-g2',group:'g2',position:p(-17.5,-155),yaw:-Math.PI/2,approach:p(-19.1,-155),route:p(-20,-155),cover:p(-15,-155)},
  {id:'ch3-ammo-g3',group:'g3',position:p(-30.4,-145),yaw:-Math.PI/2,approach:p(-32,-145),route:p(-33.5,-145),cover:p(-28,-145)},
  {id:'ch3-ammo-west',group:null,position:p(-39.2,-144.5),yaw:Math.PI,approach:p(-39.2,-146.1),route:p(-33.5,-146.1),cover:p(-39.2,-142)},
]
// Facing west (-X) into the existing CH4 connection, right is -Z.
export const CH3_EXIT_AMMO_SITE = {id:'ch3-ammo-exit',group:null,position:p(-57.5,-114.2),yaw:Math.PI/2,
  approach:p(-55.9,-114.2),route:p(-56,-110)}

// Install after the A0 environment. Native factory geometry, materials and label
// rasters are borrowed caches. Only the plaques/planes, lights and boxes are ours.
export function installChapter3Ammo(g,{equipment,narrative,getMembers,onCheckpoint=()=>{},includeExit=false,sites=includeExit?[...CH3_AMMO_SITES,CH3_EXIT_AMMO_SITE]:CH3_AMMO_SITES,cooldownSeconds=0}) {
  if(!Number.isFinite(cooldownSeconds)||cooldownSeconds<0)throw Error('Invalid ammunition cooldown')
  const reusable=cooldownSeconds>0
  const T=g.THREE,root=new T.Group(),handles=[],geometries=[],stations=[]
  let disposed=false,held=!!g.input.down?.('interact'),inputFrame=null,updateFrame=null,lastEdgeFrame=null,edge=false
  root.name='campaign-ch3-ammo';g.scene.add(root)
  const active=()=>!disposed&&g.game.state==='playing'&&g.player.alive&&g.player.enabled!==false&&!narrative?.snapshot().active
  const vector=point=>new T.Vector3(point.x,point.y,point.z)
  function mesh(size,material,position,parent,plane=false) {
    const geometry=plane?new T.PlaneGeometry(...size):new T.BoxGeometry(...size),object=new T.Mesh(geometry,material)
    geometries.push(geometry);object.position.set(...position);object.castShadow=!plane;object.receiveShadow=true;parent.add(object);return object
  }
  function label(text) {return g.mats.label(text,{color:'white',font:'sans',distress:.15}).material}
  function prop(name,position,yaw,parent,options={}) {
    const object=g.props.build(name,{seed:0,...options})
    let triangles=0
    object.traverse(mesh=>{if(mesh.isMesh)triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3})
    if(object.userData.prop!==name||!object.userData.colliders?.length||triangles<=12)throw Error(`CH3 ammo requires native ${name}`)
    object.position.copy(position);object.rotation.y=yaw;parent.add(object);root.updateMatrixWorld(true)
    for(const local of object.userData.colliders){
      const box=new T.Box3(new T.Vector3(...local.min),new T.Vector3(...local.max)).applyMatrix4(object.matrixWorld)
      handles.push(g.physics.addBox(box.min,box.max,{surface:local.surface,tag:parent.name+':'+name}))
    }
    return object
  }
  function open(site,members) {
    if(!site.group)return true
    if(!Array.isArray(members))return false
    const expected=CH3_CLEARANCE_DEPLOYMENTS.filter(m=>m.group===site.group).map(m=>m.id)
    // Identity, group and live actor must all agree; missing/duplicate entries
    // cannot turn a partially loaded squad into an empty, cleared group.
    const group=members.filter(m=>m?.definition?.group===site.group)
    return expected.length===3&&group.length===3&&expected.every(id=>{
      const matches=members.filter(m=>m?.id===id)
      return matches.length===1&&matches[0].definition?.group===site.group&&matches[0].target?.actor?.alive===false
    })
  }
  function sync() {
    const members=getMembers()
    for(const station of stations){
      station.open=open(station.site,members)
      const spent=station.consumed||station.cooldownRemaining>0,status=spent?'spent':station.open?'ready':'locked'
      station.status.material=station.labels[status]
      // Keep the renderer's light slots fixed; removing a visible light changes
      // every lit material's shader variant at the moment of collection.
      station.light.intensity=spent?0:16
    }
  }
  function sampleInput() {
    if(inputFrame===g.time.frame)return
    inputFrame=g.time.frame
    const down=!!g.input.down?.('interact')
    edge=!!g.input.pressed('interact')&&!held;held=down
  }
  function update(dt) {
    sampleInput()
    if(reusable&&updateFrame!==g.time.frame){
      updateFrame=g.time.frame
      if(active()&&Number.isFinite(dt)&&dt>0)
        for(const station of stations)station.cooldownRemaining=Math.max(0,station.cooldownRemaining-dt)
    }
    if(!disposed)sync()
  }
  function nearby(target) {
    const p=g.player.pos,f=g.player.forward,dx=target.x-p.x,dz=target.z-p.z,distance=Math.hypot(dx,dz)
    return distance<=1.9&&g.player.eye.distanceTo(target)<=2.15&&
      (dx*f.x+dz*f.z)/Math.max(.001,distance*Math.hypot(f.x,f.z))>=.5&&g.physics.lineOfSight(g.player.eye,target)
  }
  function refill() {
    const specs=equipment.snapshot().slots,saved=equipment.capture()
    let changed=false
    for(const id of ['rifle','pistol']){
      const slot=saved.slots[id],spec=specs[id]
      if(!slot?.owned)continue
      if(!Number.isSafeInteger(spec?.magSize)||!Number.isSafeInteger(spec?.reserveCap))throw Error(`CH3 ammo requires ${id} capacities`)
      if(slot.ammo===spec.magSize&&slot.reserve===spec.reserveCap)continue
      slot.ammo=spec.magSize;slot.reserve=spec.reserveCap;changed=true
    }
    if(changed)equipment.restore(saved)
    return changed
  }
  // True means this module owns a nearby candidate's prompt, including locked,
  // full and spent crates. It does not mean ammo was awarded on this frame.
  function interact() {
    sampleInput()
    const pressed=edge&&lastEdgeFrame!==g.time.frame
    lastEdgeFrame=g.time.frame
    if(!active())return false
    sync()
    const station=stations.filter(s=>nearby(s.target)).sort((a,b)=>a.target.distanceToSquared(g.player.pos)-b.target.distanceToSquared(g.player.pos))[0]
    if(!station)return false
    if(station.cooldownRemaining>0){g.hud.setPrompt(`补给恢复中：${Math.ceil(station.cooldownRemaining)}s`);return true}
    if(station.consumed){g.hud.setPrompt('此处弹药已领取');return true}
    if(!station.open){g.hud.setPrompt('弹药箱封锁中 · 解决本组三名士兵');return true}
    g.hud.setPrompt(reusable?'弹药补给可用 · E 补满已持步枪 / P12':'一次补满已持步枪 / 手枪 · 弹匣与备用')
    if(!pressed)return true
    if(!refill()){g.hud.setPrompt('已持枪械弹药已满 / 尚未持枪 · 保留补给');return true}
    if(reusable){station.cooldownRemaining=cooldownSeconds;station.uses++}else station.consumed=true
    sync();g.hud.setPrompt(reusable?`补给恢复中：${cooldownSeconds}s`:null)
    // The host commits equipment, actors, player and this capture together.
    onCheckpoint({kind:'ch3-ammo',id:station.site.id});return true
  }
  function capture() {return reusable?{version:2,stations:stations.map(s=>({id:s.site.id,cooldownRemaining:s.cooldownRemaining,uses:s.uses}))}:
    {version:1,consumed:stations.filter(s=>s.consumed).map(s=>s.site.id)}}
  function validateCapture(data) {
    if(reusable){
      if(!data||data.version!==2||!Array.isArray(data.stations)||data.stations.length!==sites.length||
        new Set(data.stations.map(s=>s?.id)).size!==sites.length||data.stations.some(s=>!s||!sites.some(site=>site.id===s.id)||
          !Number.isFinite(s.cooldownRemaining)||s.cooldownRemaining<0||s.cooldownRemaining>cooldownSeconds||
          !Number.isSafeInteger(s.uses)||s.uses<0||s.uses===0&&s.cooldownRemaining!==0))throw Error('Invalid reusable ammo capture')
      return {version:2,stations:sites.map(site=>{const s=data.stations.find(s=>s.id===site.id)
        return {id:site.id,cooldownRemaining:s.cooldownRemaining,uses:s.uses}})}
    }
    if(!data||data.version!==1||!Array.isArray(data.consumed)||new Set(data.consumed).size!==data.consumed.length||
      data.consumed.some(id=>!sites.some(s=>s.id===id)))throw Error('Invalid CH3 ammo capture')
    return {version:1,consumed:sites.filter(s=>data.consumed.includes(s.id)).map(s=>s.id)}
  }
  function restore(data) {
    const saved=validateCapture(data)
    if(disposed)throw Error('CH3 ammo disposed')
    for(const station of stations){
      if(reusable){const s=saved.stations.find(s=>s.id===station.site.id);station.cooldownRemaining=s.cooldownRemaining;station.uses=s.uses}
      else station.consumed=saved.consumed.includes(station.site.id)
    }
    inputFrame=updateFrame=null;lastEdgeFrame=g.time.frame;held=!!g.input.down?.('interact');edge=false
    sync();return true
  }
  function dispose() {
    if(disposed)return
    disposed=true;root.removeFromParent()
    for(const box of handles)g.physics.removeBox(box)
    handles.length=0;g.physics.build()
    for(const geometry of geometries)geometry.dispose()
    for(const station of stations)station.light.dispose()
    root.clear()
  }
  try {
    for(const site of sites){
      const holder=new T.Group();holder.name=site.id;holder.position.copy(vector(site.position));holder.rotation.y=site.yaw;root.add(holder)
      prop('crate_wood',new T.Vector3(),0,holder,{label:'弹药补给',code:site.code||site.group?.toUpperCase()||(site===CH3_EXIT_AMMO_SITE?'EXIT':'WEST')})
      mesh([.94,.34,.012],g.mats.get('steel_dark'),[0,.69,.46],holder)
      mesh([.90,.12],label(`弹药补给 · ${site.label||site.group?.toUpperCase()||(site===CH3_EXIT_AMMO_SITE?'第七区入口':'维修屋')}`),[0,.78,.468],holder,true)
      const labels={locked:label('封锁中 · 本组三名士兵'),ready:label(reusable?'弹药补给可用 · E':'补满弹匣与备用 · 一次'),
        spent:label(reusable?`补给恢复中 · ${cooldownSeconds}秒`:'已领取 · 补给耗尽')}
      const status=mesh([.90,.10],labels.locked,[0,.62,.468],holder,true)
      const fixture=prop('floodlight_stand',new T.Vector3(-.85,0,0),-Math.PI/2,holder,{on:true})
      const source=fixture.userData.lamps?.[0]
      if(!source)throw Error('CH3 ammo requires native work light metadata')
      const light=new T.SpotLight(source.color,16,7,1.05,.7,1.5)
      light.position.copy(new T.Vector3(...source.pos).applyMatrix4(fixture.matrixWorld))
      light.target.position.copy(light.position).addScaledVector(new T.Vector3(...source.dir).transformDirection(fixture.matrixWorld),5)
      light.castShadow=false;root.add(light,light.target)
      stations.push({site,target:holder.localToWorld(new T.Vector3(0,.68,.49)),status,labels,light,consumed:false,open:false,cooldownRemaining:0,uses:0})
    }
    root.updateMatrixWorld(true);sync();g.physics.build()
  } catch(error){dispose();throw error}
  const empty=()=>reusable?{version:2,stations:sites.map(s=>({id:s.id,cooldownRemaining:0,uses:0}))}:{version:1,consumed:[]}
  return {update,interact,capture,validateCapture,restore,reset:saved=>restore(saved??empty()),dispose,
    snapshot:()=>({...capture(),disposed,colliderCount:handles.length,ownedGeometryCount:disposed?0:geometries.length,lightCount:disposed?0:stations.filter(s=>s.light.intensity>0).length,
      ...(reusable?{cooldownSeconds}:{}),
      sites:stations.map(s=>({...structuredClone(s.site),target:s.target.toArray(),open:s.open,consumed:s.consumed,
        ...(reusable?{cooldownRemaining:s.cooldownRemaining,uses:s.uses,available:active()&&s.open&&s.cooldownRemaining===0}: {})})),
      colliders:handles.map(b=>({min:b.min.toArray(),max:b.max.toArray(),tag:b.tag}))}),
  }
}
