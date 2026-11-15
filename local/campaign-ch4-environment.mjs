import { createChapter4Asset } from './campaign-ch4-assets.mjs'
import { createChapter4Gate } from './campaign-ch4-gate.mjs'
import { createChapter3Asset } from './campaign-ch3-assets.mjs'
import { CH4, CH4_CARGO, CH4_VEHICLES, CH4_ASSET_SITES, CH4_SPAWNS, CH4_ROUTES, CH4_CAMERAS, CH4_COVER_POSITIONS } from './campaign-ch4-layout.mjs'

// The integration owner retains native ground/perimeter, renderer and light pool.
// Collider handles are shared by native movement, LOS and navigation.
export function buildChapter4Environment(g, {assets} = {}) {
  const T=g.THREE,root=new T.Group(),chunks=[],lightSites=[],landmarks=[],records=new Map()
  const handles=[],placements=[],assetPlacements=[]
  const borrowed=new Set(),owned=new Set(),ownedMaterials=new Set(),cargoPlacements=[],vehiclePlacements=[],assetTemplates=new Map()
  let disposed=false,gateController=null
  root.name='campaign-ch4-blockade-control'
  function recordAt(x,z) {
    const id=`ch4:${Math.floor((x+80)/24)}:${Math.floor((z+120)/28)}`
    if(!records.has(id)) {
      const context=g.campaignFactories.context(),group=new T.Group()
      group.name=id;root.add(group)
      const chunk={id,sectorId:CH4.sectorId,root:group,updaters:context.updaters,bounds:{}}
      chunks.push(chunk);records.set(id,{context,chunk})
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
    if(object.userData.prop!==name||triangles<=12||!object.userData.colliders?.length)throw Error(`CH4 requires complete native ${name}`)
    placements.push({name,x,y,z,yaw,options:{seed:0,...options}})
    return object
  }
  function label(text,x,y,z,face='y+',height=.2) {
    if(!recordAt(x,z).context.label(text,height,x,y,z,face,{color:'yellow',font:'stencil',distress:.25}))throw Error('Native CH4 label unavailable')
  }
  function displacedCargo(item) {
    const object=g.props.build(item.kind,{seed:0,doors:0,color:item.id.includes('skew')?'orange':'teal',wear:.6})
    if(object.userData.prop!==item.kind||object.userData.colliders?.length!==1)throw Error(`CH4 requires closed native ${item.kind}`)
    const holder=new T.Group();holder.name=item.id;holder.add(object)
    holder.rotation.y=item.yaw;holder.position.set(item.x,0,item.z);holder.updateMatrixWorld(true)
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
      handles.push(g.physics.addBox(min,max,{surface:'metal',tag:`campaign-ch4-cargo:${item.id}`}));contact.push({min,max})
    }
    recordAt(item.x,item.z).context.staticRoot.add(holder)
    cargoPlacements.push({...item,y:holder.position.y,colliders:contact,collisionStrip:.12})
  }
  function own(context) {
    for(const group of [context.staticRoot,context.dynRoot])group.traverse(mesh=>{if(mesh.isMesh&&!borrowed.has(mesh.geometry))owned.add(mesh.geometry)})
  }
  function lamp(x,z,yaw=0) {
    const fixture=place('light_mast',x,z,yaw,{on:true}),source=fixture.userData.lamps?.find(l=>l.dir[0]<0)
    if(!source)throw Error('Native CH4 mast lamp metadata missing')
    const position=new T.Vector3(...source.pos).applyMatrix4(fixture.matrixWorld)
    const target=position.clone().addScaledVector(new T.Vector3(...source.dir).transformDirection(fixture.matrixWorld),16)
    const site={sectorId:CH4.sectorId,position:{x:position.x,y:position.y,z:position.z},target:{x:target.x,y:target.y,z:target.z},
      color:source.color,intensity:1150,distance:48,angle:1.15,penumbra:.65,decay:1.2}
    lightSites.push(site);return site
  }
  // Conservative surface voxels from the actual normalized triangles. Coalesce
  // adjacent X/Z/Y cells; console recesses and vehicle cab gaps remain voids.
  function assetBoxes(object) {
    const cell=object.userData.kind==='cover'?.08:.2, bounds=object.userData.bounds, low=bounds.min
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
    const object=['cover','sign'].includes(site.kind)?createChapter3Asset(T,g.campaignAssets.chapter3,site.kind):createChapter4Asset(T,assets,site.kind)
    object.traverse(mesh=>{if(mesh.isMesh)borrowed.add(mesh.geometry)})
    if(!assetTemplates.has(site.kind))assetTemplates.set(site.kind,assetBoxes(object))
    object.position.set(site.position.x,site.position.y,site.position.z);object.rotation.y=site.yaw
    object.updateMatrixWorld(true)
    recordAt(site.position.x,site.position.z).context.dynRoot.add(object)
    const assetHandles=[]
    const colliders=assetTemplates.get(site.kind).map(local=>{
      const box=new T.Box3(new T.Vector3(...local.min),new T.Vector3(...local.max)).applyMatrix4(object.matrixWorld)
      const handle=g.physics.addBox(box.min,box.max,{surface:'metal',tag:`campaign-ch4-asset:${site.id}`})
      handles.push(handle);assetHandles.push(handle)
      return {min:box.min.toArray(),max:box.max.toArray()}
    })
    const placement={...structuredClone(site),modelName:object.name,source:{...object.userData.source},bounds:structuredClone(object.userData.bounds),colliders,collisionCell:site.kind==='cover'?.08:.2}
    assetPlacements.push(placement)
    if(site.kind==='gate')gateController=createChapter4Gate(g,{object,colliders:assetHandles,placement})
  }
  function vehicles(items) {
    const templates=new Map()
    for(const item of items){
      if(!templates.has(item.kind)){
        const template=item.kind==='pickup'?g.campaignAssets.createPickupModel(T,g.campaignAssets.pickupTexture):g.props.build('forklift',{seed:0}),bounds=new T.Box3()
        if(item.kind!=='pickup'&&template.userData.prop!=='forklift')throw Error('CH4 requires complete native forklift')
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
        handles.push(g.physics.addBox(box.min,box.max,{surface:'metal',tag:`campaign-ch4-vehicle:${item.id}`}))
        return {min:box.min.toArray(),max:box.max.toArray()}
      })
      const visible=bounds.clone().applyMatrix4(holder.matrixWorld)
      vehiclePlacements.push({...item,source:item.kind==='pickup'?'user-glb':'native-forklift',bounds:{min:visible.min.toArray(),max:visible.max.toArray()},colliders,collisionCell:.2})
      recordAt(item.x,item.z).context.dynRoot.add(holder)
    }
  }
  function dispose() {
    if(disposed)return
    disposed=true;gateController?.dispose()
    for(const handle of handles)g.physics.removeBox(handle)
    handles.length=0
    for(const material of ownedMaterials)material.dispose()
    for(const geometry of owned)geometry.dispose()
    owned.clear()
    for(const {context,chunk}of records.values()){
      context.staticRoot.clear();context.dynRoot.clear();context.updaters.length=0;chunk.root.clear()
    }
    root.removeFromParent();root.clear()
  }
  try {
    for(const item of CH4_CARGO)displacedCargo(item)
    vehicles(CH4_VEHICLES)
    for(const [x,z,yaw]of [[-75,-99,0],[-65,-72,0],[-72,-64,Math.PI/2],[-66,-36,Math.PI/2],[-75,-24,0],[-65,-20,0]])place('jersey_barrier',x,z,yaw)
    place('crate_stack',-78,-98.5)
    place('crate_wood',-62,-91)
    place('generator',-77,-73,Math.PI/2)
    place('pipe_stack',-61.2,-35,Math.PI/2)
    place('cable_reel',-77,-23)
    place('toolbox_cart',-62,-18)
    place('crate_wood',CH4.ammo.position.x,CH4.ammo.position.z,CH4.ammo.yaw,{label:'弹药补给'})
    label('弹药补给',CH4.ammo.position.x,1.01,CH4.ammo.position.z,'y+',.13)
    if(!assets)throw Error('M4-A0 requires the supplied console/server/gate assets')
    for(const site of CH4_ASSET_SITES)asset(site)
    // The gate closes the straight corridor before its turn. Keep the native
    // Berth 7 seam and the entire road beyond this stage boundary in place.
    const gate=assetPlacements.find(a=>a.id==='security-gate'),half=gate.bounds.size[0]/2,c=recordAt(-70,-7).context
    for(const [from,to]of [[-80.16,-70-half],[-70+half,-59.84]])capture(()=>{
      c.slab('steel_dark',from,0,-7.22,to,5,-6.78)
      c.col(from,0,-7.22,to,5,-6.78,'metal',{tag:'campaign-ch4-gate-infill'})
      for(let x=from+.18;x<to;x+=.65)c.ibeam('steel_galv','y',5,x,2.5,-7.25,{depth:.16,width:.1})
    })
    for(const [i,z]of [-113,-97,-80,-63,-46,-29,-12].entries()){
      const west=i%2===0,site=lamp(west?-78.3:-61.7,z,west?Math.PI:0)
      site.id=`control-corridor-mast-${i+1}`
    }
    const gateLamp=lamp(-61.7,-10);gateLamp.id='control-gate-mast'
    label('04 第七区控制中心',-69.5,.014,-104,'y+',.3)
    label('07 七号泊位 / 封锁门',-70,.014,-16,'y+',.25)
    for(const {chunk,context}of records.values()){
      own(context)
      const merged=g.campaignFactories.merge(context.staticRoot)
      merged.traverse(mesh=>{if(mesh.isMesh&&!borrowed.has(mesh.geometry))owned.add(mesh.geometry)})
      chunk.root.add(merged,context.dynRoot)
      chunk.root.updateMatrixWorld(true)
      const bounds=new T.Box3().setFromObject(chunk.root)
      chunk.bounds={minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z}
    }
    landmarks.push(...CH4_ASSET_SITES.map(site=>({id:site.id,sectorId:CH4.sectorId,position:{...site.position},source:'user-glb',placeholder:false})),
      {id:'control-ammunition',sectorId:CH4.sectorId,position:{...CH4.ammo.position},source:'native-crate_wood',placeholder:false},
      ...CH4_SPAWNS.map(site=>({...structuredClone(site),sectorId:CH4.sectorId,reservationOnly:true})))
    root.updateMatrixWorld(true)
  }catch(error){for(const {context}of records.values())own(context);dispose();throw error}
  return {root,chunks,lightSites,landmarks,interiorBoxes:[],gate:gateController,
    snapshot:()=>({stage:CH4.stage,disposed,storyImplemented:false,aiImplemented:false,combatImplemented:false,gateOpeningImplemented:gateController.capture().started,
      layout:structuredClone(CH4),routes:structuredClone(CH4_ROUTES),spawns:structuredClone(CH4_SPAWNS),coverPositions:structuredClone(CH4_COVER_POSITIONS),cameras:structuredClone(CH4_CAMERAS),
      nativePlacements:structuredClone(placements),assetPlacements:structuredClone(assetPlacements),cargoPlacements:structuredClone(cargoPlacements),vehiclePlacements:structuredClone(vehiclePlacements),
      containerCount:disposed?0:CH4_CARGO.length,colliderCount:disposed?0:handles.length,lightSiteCount:disposed?0:lightSites.length,permanentLights:0,
      gateClosed:gateController.capture().progress===0,gate:gateController.snapshot(),landmarks:structuredClone(landmarks),chunks:chunks.map(chunk=>({id:chunk.id,bounds:{...chunk.bounds},visible:chunk.root.visible}))}),dispose}
}
