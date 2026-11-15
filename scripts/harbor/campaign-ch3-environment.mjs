import { createChapter3Asset } from './campaign-ch3-assets.mjs'
import { createCampaignContainers } from './campaign-containers.mjs'
import { CH3, CH3_CONTAINERS, CH3_DISPLACED_CARGO, CH3_VEHICLES, CH3_ROUTES, CH3_BLOCKADES, CH3_ASSET_SITES, CH3_LOS, CH3_CAMERAS } from './campaign-ch3-layout.mjs'

// Mount once in the integration-owned sector layer, replacing its old CH3
// placements. Retain M1 ground/perimeter. Caller batches physics.build().
// assets are preloaded resources; native geometry/material caches are borrowed.
export function buildChapter3Environment(g, {assets} = {}) {
  const T=g.THREE,root=new T.Group(),chunks=[],lightSites=[],landmarks=[],records=new Map()
  const containers=createCampaignContainers(g),handles=[],placements=[],assetPlacements=[]
  const borrowed=new Set(),owned=new Set(),ownedMaterials=new Set(),cargoPlacements=[],vehiclePlacements=[],assetTemplates=new Map()
  let disposed=false
  root.name='campaign-ch3-berth6'
  function recordAt(x,z) {
    const id=`ch3:${Math.floor((x+60)/36)}:${Math.floor((z+205)/35)}`
    if(!records.has(id)) {
      const context=g.campaignFactories.context(),group=new T.Group()
      group.name=id;root.add(group)
      const chunk={id,sectorId:CH3.sectorId,root:group,updaters:context.updaters,bounds:{}}
      chunks.push(chunk);records.set(id,{context,chunk,containers:[]})
    }
    return records.get(id)
  }
  function capture(fn) {
    const before=g.physics.boxes.length
    try{return fn()}finally{handles.push(...g.physics.boxes.slice(before))}
  }
  function place(name,x,z,yaw=0,options={},y=0) {
    const c=recordAt(x,z).context,object=capture(()=>c.place(name,x,z,yaw,{seed:0,...options},y))
    let triangles=0
    object.traverse(mesh=>{if(mesh.isMesh){borrowed.add(mesh.geometry);triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3}})
    if(object.userData.prop!==name||triangles<=12||!object.userData.colliders?.length)throw Error(`CH3 requires complete native ${name}`)
    placements.push({name,x,y,z,yaw,options:{seed:0,...options}})
    return object
  }
  function label(text,x,y,z,face='y+',height=.2) {
    if(!recordAt(x,z).context.label(text,height,x,y,z,face,{color:'yellow',font:'stencil',distress:.25}))throw Error('Native CH3 label unavailable')
  }
  function displacedCargo(item) {
    const object=g.props.build(item.kind,{seed:0,doors:0,color:item.pitch?'orange':'teal',wear:.6})
    if(object.userData.prop!==item.kind||object.userData.colliders?.length!==1)throw Error(`CH3 requires closed native ${item.kind}`)
    // Closed native containers omit their hidden underside entirely. Rotation
    // exposes it, so complete only these instances with a deck and crossmembers.
    if(item.pitch){
      const underframe=g.campaignFactories.context(),{min,max}=object.userData.colliders[0]
      underframe.slab('steel_dark',min[0]+.035,.12,min[2]+.05,max[0]-.072,.15,max[2]-.05)
      for(let x=min[0]+.35;x<max[0]-.2;x+=.75)underframe.ibeam('steel_dark','z',max[2]-min[2]-.1,x,.07,0,{depth:.12,width:.07})
      underframe.staticRoot.traverse(mesh=>{if(mesh.isMesh)owned.add(mesh.geometry)})
      object.add(underframe.staticRoot)
    }
    const holder=new T.Group();holder.name=item.id;holder.add(object)
    holder.rotation.set(item.pitch||0,item.yaw,0,'YXZ');holder.position.set(item.x,0,item.z);holder.updateMatrixWorld(true)
    const visible=new T.Box3()
    object.traverse(mesh=>{if(mesh.isMesh){if(!owned.has(mesh.geometry))borrowed.add(mesh.geometry);visible.union(new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position).applyMatrix4(mesh.matrixWorld))}})
    holder.position.y=-visible.min.y;holder.updateMatrixWorld(true)
    // The closed solid volume becomes thin world-axis strips. Clipping the
    // rotated footprint avoids a large invisible wedge beside a diagonal box.
    const local=object.userData.colliders[0],corners=[]
    for(const x of [local.min[0],local.max[0]])for(const y of [local.min[1],local.max[1]])for(const z of [local.min[2],local.max[2]])corners.push(new T.Vector3(x,y,z).applyMatrix4(holder.matrixWorld))
    const points=corners.map(p=>[p.x,p.z]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    const half=points=>{const result=[];for(const p of points){while(result.length>1&&cross(result.at(-2),result.at(-1),p)<=1e-8)result.pop();result.push(p)}return result.slice(0,-1)}
    const polygon=[...half(points),...half([...points].reverse())],extent=new T.Box3().setFromPoints(corners),axis=extent.max.x-extent.min.x>extent.max.z-extent.min.z?0:1
    const clip=(poly,value,above)=>poly.flatMap((a,i)=>{const b=poly[(i+1)%poly.length],inside=above?a[axis]>=value:a[axis]<=value,next=above?b[axis]>=value:b[axis]<=value,out=inside?[a]:[];if(inside!==next){const t=(value-a[axis])/(b[axis]-a[axis]);out.push(a.map((v,j)=>v+(b[j]-v)*t))}return out})
    const low=Math.min(...polygon.map(p=>p[axis])),high=Math.max(...polygon.map(p=>p[axis])),contact=[]
    for(let start=low;start<high;start+=.12){
      const poly=clip(clip(polygon,start,true),Math.min(high,start+.12),false)
      if(poly.length<3)continue
      const min=[Math.min(...poly.map(p=>p[0])),extent.min.y,Math.min(...poly.map(p=>p[1]))],max=[Math.max(...poly.map(p=>p[0])),extent.max.y,Math.max(...poly.map(p=>p[1]))]
      handles.push(g.physics.addBox(min,max,{surface:'metal',tag:`campaign-ch3-cargo:${item.id}`}));contact.push({min,max})
    }
    recordAt(item.x,item.z).context.staticRoot.add(holder)
    cargoPlacements.push({...item,y:holder.position.y,colliders:contact,collisionStrip:.12})
  }
  function own(context) {
    for(const group of [context.staticRoot,context.dynRoot])group.traverse(mesh=>{if(mesh.isMesh&&!borrowed.has(mesh.geometry))owned.add(mesh.geometry)})
  }
  function lamp(x,z,yaw=0) {
    const fixture=place('light_mast',x,z,yaw,{on:true}),source=fixture.userData.lamps?.find(l=>l.dir[0]<0)
    if(!source)throw Error('Native CH3 mast lamp metadata missing')
    const position=new T.Vector3(...source.pos).applyMatrix4(fixture.matrixWorld)
    const target=position.clone().addScaledVector(new T.Vector3(...source.dir).transformDirection(fixture.matrixWorld),16)
    const site={sectorId:CH3.sectorId,position:{x:position.x,y:position.y,z:position.z},target:{x:target.x,y:target.y,z:target.z},
      color:source.color,intensity:650,distance:38,angle:.95,penumbra:.65,decay:1.5}
    lightSites.push(site);return site
  }
  // Conservative surface voxels from the actual normalized triangles. Coalesce
  // adjacent X/Z/Y cells; voids remain voids. In particular the observation
  // platform/tripod never receives an enclosing AABB through its standing area.
  function assetBoxes(object) {
    const cell=.2, bounds=object.userData.bounds, low=bounds.min
    const counts=bounds.size.map(size=>Math.ceil(size/cell)), occupied=new Set()
    const key=(x,y,z)=>`${x},${y},${z}`, triangle=new T.Triangle(),box=new T.Box3()
    object.updateMatrixWorld(true)
    object.traverse(mesh=>{
      if(!mesh.isMesh)return
      const position=mesh.geometry.attributes.position,index=mesh.geometry.index
      for(let i=0;i<(index?.count??position.count);i+=3){
        for(const [j,v]of [triangle.a,triangle.b,triangle.c].entries())v.fromBufferAttribute(position,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld)
        const extent=new T.Box3().setFromPoints([triangle.a,triangle.b,triangle.c])
        const first=extent.min.toArray().map((v,a)=>Math.max(0,Math.floor((v-low[a])/cell)))
        const last=extent.max.toArray().map((v,a)=>Math.min(counts[a]-1,Math.floor((v-low[a])/cell)))
        for(let y=first[1];y<=last[1];y++)for(let z=first[2];z<=last[2];z++)for(let x=first[0];x<=last[0];x++){
          box.min.set(low[0]+x*cell,low[1]+y*cell,low[2]+z*cell)
          box.max.set(Math.min(bounds.max[0],box.min.x+cell),Math.min(bounds.max[1],box.min.y+cell),Math.min(bounds.max[2],box.min.z+cell))
          if(box.intersectsTriangle(triangle))occupied.add(key(x,y,z))
        }
      }
    })
    const result=[]
    for(let y=0;y<counts[1];y++)for(let z=0;z<counts[2];z++)for(let x=0;x<counts[0];x++){
      if(!occupied.has(key(x,y,z)))continue
      let endX=x+1,endZ=z+1,endY=y+1
      while(endX<counts[0]&&occupied.has(key(endX,y,z)))endX++
      const row=(yy,zz)=>{for(let xx=x;xx<endX;xx++)if(!occupied.has(key(xx,yy,zz)))return false;return true}
      while(endZ<counts[2]&&row(y,endZ))endZ++
      const plane=yy=>{for(let zz=z;zz<endZ;zz++)if(!row(yy,zz))return false;return true}
      while(endY<counts[1]&&plane(endY))endY++
      for(let yy=y;yy<endY;yy++)for(let zz=z;zz<endZ;zz++)for(let xx=x;xx<endX;xx++)occupied.delete(key(xx,yy,zz))
      result.push({min:[low[0]+x*cell,low[1]+y*cell,low[2]+z*cell],max:[endX,endY,endZ].map((n,a)=>Math.min(bounds.max[a],low[a]+n*cell))})
    }
    return result
  }
  function asset(site) {
    const object=createChapter3Asset(T,assets,site.kind)
    object.traverse(mesh=>{if(mesh.isMesh)borrowed.add(mesh.geometry)})
    if(!assetTemplates.has(site.kind))assetTemplates.set(site.kind,assetBoxes(object))
    object.position.set(site.position.x,site.position.y,site.position.z);object.rotation.y=site.yaw
    object.updateMatrixWorld(true)
    recordAt(site.position.x,site.position.z).context.dynRoot.add(object)
    const colliders=assetTemplates.get(site.kind).map(local=>{
      const box=new T.Box3(new T.Vector3(...local.min),new T.Vector3(...local.max)).applyMatrix4(object.matrixWorld)
      const handle=g.physics.addBox(box.min,box.max,{surface:'metal',tag:`campaign-ch3-asset:${site.id}`})
      handles.push(handle)
      return {min:box.min.toArray(),max:box.max.toArray()}
    })
    assetPlacements.push({...structuredClone(site),bounds:structuredClone(object.userData.bounds),colliders,collisionCell:.2})
  }
  function vehicles(items) {
    const templates=new Map()
    for(const item of items){
      if(!templates.has(item.kind)){
        const template=item.kind==='pickup'?g.campaignAssets.createPickupModel(T,g.campaignAssets.pickupTexture):g.props.build('forklift',{seed:0}),bounds=new T.Box3()
        if(item.kind!=='pickup'&&template.userData.prop!=='forklift')throw Error('CH3 requires complete native forklift')
        template.updateMatrixWorld(true)
        template.traverse(mesh=>{if(mesh.isMesh){
          if(item.kind==='pickup'){owned.add(mesh.geometry);ownedMaterials.add(mesh.material)}else borrowed.add(mesh.geometry)
          bounds.union(new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position).applyMatrix4(mesh.matrixWorld))
        }})
        template.userData.bounds={min:bounds.min.toArray(),max:bounds.max.toArray(),size:bounds.getSize(new T.Vector3()).toArray()}
        templates.set(item.kind,{template,bounds,boxes:assetBoxes(template)})
      }
      const {template,bounds,boxes}=templates.get(item.kind)
      const holder=new T.Group();holder.name=item.id;holder.add(template.clone(true));holder.position.set(item.x,0,item.z);holder.rotation.y=item.yaw;holder.updateMatrixWorld(true)
      const colliders=boxes.map(local=>{
        const box=new T.Box3(new T.Vector3(...local.min),new T.Vector3(...local.max)).applyMatrix4(holder.matrixWorld)
        handles.push(g.physics.addBox(box.min,box.max,{surface:'metal',tag:`campaign-ch3-vehicle:${item.id}`}))
        return {min:box.min.toArray(),max:box.max.toArray()}
      })
      const visible=bounds.clone().applyMatrix4(holder.matrixWorld)
      vehiclePlacements.push({...item,source:item.kind==='pickup'?'user-glb':'native-forklift',bounds:{min:visible.min.toArray(),max:visible.max.toArray()},colliders,collisionCell:.2})
      recordAt(item.x,item.z).context.dynRoot.add(holder)
    }
  }
  function dispose() {
    if(disposed)return
    disposed=true
    for(const handle of handles)g.physics.removeBox(handle)
    handles.length=0;containers.dispose()
    for(const material of ownedMaterials)material.dispose()
    for(const geometry of owned)geometry.dispose()
    owned.clear()
    for(const {context,chunk}of records.values()){
      context.staticRoot.clear();context.dynRoot.clear();context.updaters.length=0;chunk.root.clear()
    }
    root.removeFromParent();root.clear()
  }
  try {
    for(const item of CH3_CONTAINERS)recordAt(item.x,item.z).containers.push(item)
    // Real, one-ended room: retain the complete native corrugated shell,
    // floor/roof/back wall and open door leaves with their exact colliders.
    const safe=place('container40',-43,-142,0,{doors:1,color:'teal',wear:.5})
    // Native context.place omits the container's low floor collider; restore
    // the actual .172m wood floor for standing, rain/audio and bullet contact.
    capture(()=>recordAt(-43,-142).context.col(-49.095,0,-143.219,-36.905,.172,-140.781,'wood',{tag:'campaign-ch3-safe-house'}))
    for(const handle of handles)handle.tag='campaign-ch3-safe-house'
    safe.name='ch3-enterable-safe-house'
    if(!assets)place('toolbox_cart',-46.7,-142.65,0,{},.172)
    place('guard_booth',-48,-136,Math.PI,{on:false})
    // Preserve every original tower factory/transform, then complete the
    // missing intermediate landing and the upper deck end fall protection.
    place('stairs_metal',5,-154)
    place('catwalk',8,-154,0,{rails:'both'},2.55)
    place('stairs_metal',11,-152,Math.PI,{},2.6)
    for(const z of [-152,-153.2,-154.4])place('catwalk',8,z,0,{rails:z===-152?'right':z===-154.4?'left':'none'},5.15)
    const c=recordAt(8,-154).context
    capture(()=>{
      for(const x of [6.5,9.5])for(const z of [-151.4,-155]){
        c.ibeam('steel_dark','y',5.2,x,2.6,z,{depth:.24,width:.2})
        c.col(x-.12,0,z-.12,x+.12,5.2,z+.12,'metal',{tag:'campaign-tower'})
      }
      for(const z of [-151.4,-155]){
        c.rod('steel_galv',[6.5,.2,z],[9.5,5.1,z],.045)
        c.rod('steel_galv',[9.5,.2,z],[6.5,5.1,z],.045)
      }
      c.slab('paint_grey',6.8,4.15,-155.04,9.2,4.65,-155)
      c.col(6.8,4.15,-155.04,9.2,4.65,-155,'metal',{tag:'campaign-tower-sign'})
      // The supplied observation platform sits on a braced upper east bay.
      // Its centre stays clear of the original tower standing position.
      c.slab('steel_dark',9.5,5.1,-155.6,13.7,5.2,-152.6)
      c.col(9.5,5.1,-155.6,13.7,5.2,-152.6,'metal',{tag:'campaign-ch3-observation-deck'})
      c.slab('steel_dark',9.95,5.2,-153.3,10.6,5.4,-152.7)
      c.col(9.95,5.2,-153.3,10.6,5.4,-152.7,'metal',{tag:'campaign-ch3-observation-step'})
      for(const x of [10,13.4])for(const z of [-155.4,-152.8]){
        c.ibeam('steel_dark','y',5.2,x,2.6,z,{depth:.24,width:.2})
        c.col(x-.12,0,z-.12,x+.12,5.2,z+.12,'metal',{tag:'campaign-ch3-observation-support'})
      }
      c.slab('steel_dark',9.5,2.5,-154.6,13.4,2.6,-150.9)
      c.col(9.5,2.5,-154.6,13.4,2.6,-150.9,'metal',{tag:'campaign-ch3-tower-landing'})
      for(const [a,b]of [[[13.35,2.6,-154.6],[13.35,2.6,-150.9]],[[9.5,2.6,-154.6],[13.35,2.6,-154.6]]]){
        for(const y of [.55,1.05])c.rod('steel_galv',[a[0],a[1]+y,a[2]],[b[0],b[1]+y,b[2]],.025)
        c.col(Math.min(a[0],b[0])-.03,2.6,Math.min(a[2],b[2])-.03,Math.max(a[0],b[0])+.03,3.7,Math.max(a[2],b[2])+.03,'metal',{tag:'campaign-ch3-tower-rail'})
      }
    })
    // Existing industrial factories supply physical cover even before the
    // preloaded user assets are passed in by the integration owner.
    place('forklift',-9,-178,Math.PI/2)
    place('generator',-9,-149)
    place('pipe_stack',-10,-126)
    for(const [x,z]of [[-8,-186],[-3,-150],[-8,-117]])place('jersey_barrier',x,z)
    for(const item of CH3_DISPLACED_CARGO)displacedCargo(item)
    vehicles(CH3_VEHICLES)
    for(const [x,z]of [[-4,-188],[4,-166],[2,-122]])place('jersey_barrier',x,z)
    if(assets)for(const site of CH3_ASSET_SITES)asset(site)
    lamp(-32,-164);lamp(14,-130)
    const northeast=lamp(24,-174,.9)
    northeast.id='berth6-northeast-mast'
    northeast.intensity=850;northeast.distance=42;northeast.angle=1.05;northeast.penumbra=.45
    const workLight=place('floodlight_stand',-41.5,-142.78,Math.PI,{on:true},.172)
    const bulb=workLight.userData.lamps?.[0]
    if(!bulb)throw Error('CH3 safe-house requires the complete native work light')
    const bulbPosition=new T.Vector3(...bulb.pos).applyMatrix4(workLight.matrixWorld)
    lightSites.push({id:'berth6-safe-house-work-light',sectorId:CH3.sectorId,position:{x:bulbPosition.x,y:bulbPosition.y,z:bulbPosition.z},
      target:{x:-46,y:1.15,z:-142},color:bulb.color,intensity:40,distance:12,angle:1.05,penumbra:.7,decay:1.5})
    label('06 六号泊位 / 工业卸货区',-20,.014,-191)
    label('维修安全屋 ←',-33.5,.014,-146)
    label('安全屋 / 维修工位',-36.88,1.9,-142,'x+',.16)
    label('瞭望塔 / 六号照明平台',8,4.4,-155.045,'z-',.2)
    label('封锁控制通路 ← 04',-42,.014,-110)
    for(const {chunk,context,containers:items}of records.values()){
      own(context)
      const merged=g.campaignFactories.merge(context.staticRoot)
      merged.traverse(mesh=>{if(mesh.isMesh&&!borrowed.has(mesh.geometry))owned.add(mesh.geometry)})
      chunk.root.add(merged,context.dynRoot)
      if(items.length)chunk.root.add(containers.createInstances({id:chunk.id,placements:items}).root)
      chunk.root.updateMatrixWorld(true)
      const bounds=new T.Box3()
      chunk.root.traverse(mesh=>{
        if(!mesh.isMesh)return
        const box=mesh.isInstancedMesh?mesh.boundingBox.clone():new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position)
        bounds.union(box.applyMatrix4(mesh.matrixWorld))
      })
      chunk.bounds={minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z}
    }
    landmarks.push({id:'berth6-sniper-tower',sectorId:CH3.sectorId,position:{...CH3.tower},source:'native-stairs_metal/catwalk/ibeam',placeholder:false},
      {id:'berth6-safe-house',sectorId:CH3.sectorId,position:{...CH3.safeHouse.position},source:'native-container40',placeholder:false,closedShell:false,
        bounds:{...CH3.safeHouse.bounds},entrances:structuredClone(CH3.safeHouse.entrance)},
      ...CH3_BLOCKADES.map(site=>({id:site.id,sectorId:CH3.sectorId,position:{...site.position},reservationOnly:true,patrol:structuredClone(site.patrol)})))
    root.updateMatrixWorld(true)
  } catch(error){for(const {context}of records.values())own(context);dispose();throw error}
  const b=CH3.safeHouse.bounds,interiorBoxes=[{min:new T.Vector3(b.minX,.172,b.minZ),max:new T.Vector3(b.maxX,2.5,b.maxZ)}]
  return {root,chunks,lightSites,landmarks,interiorBoxes,
    snapshot:()=>({stage:CH3.stage,disposed,storyImplemented:false,aiImplemented:false,combatImplemented:false,chapter4Implemented:false,
      layout:structuredClone(CH3),routes:structuredClone(CH3_ROUTES),blockades:structuredClone(CH3_BLOCKADES),los:structuredClone(CH3_LOS),cameras:structuredClone(CH3_CAMERAS),
      nativePlacements:structuredClone(placements),assetPlacements:structuredClone(assetPlacements),assetsProvided:!!assets,assetSites:structuredClone(CH3_ASSET_SITES),
      cargoPlacements:structuredClone(cargoPlacements),vehiclePlacements:structuredClone(vehiclePlacements),
      containerCount:disposed?0:CH3_CONTAINERS.length+1+CH3_DISPLACED_CARGO.length,colliderCount:disposed?0:handles.length+containers.snapshot().chunks.reduce((n,c)=>n+c.colliderCount,0),
      lightSiteCount:disposed?0:lightSites.length,permanentLights:0,landmarks:structuredClone(landmarks),
      chunks:chunks.map(chunk=>({id:chunk.id,bounds:{...chunk.bounds},visible:chunk.root.visible,updaterCount:chunk.updaters.length})),
      ownership:{borrowed:'native factory and preloaded asset geometry/material/texture caches',owned:'context/merged geometry, instance buffers, exact collider handles',geometryCount:owned.size}}),dispose}
}
