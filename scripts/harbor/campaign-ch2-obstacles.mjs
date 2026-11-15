// Geometry-derived contact parts. No factory cache or source buffer is mutated.
// Thin/diagonal surfaces are clipped before AABB conversion, never padded to
// the complete prop envelope. Opaque closed factory cargo keeps its solid core.
function clip(polygon, axis, value, above) {
  const out=[]
  for (let i=0;i<polygon.length;i++) {
    const a=polygon[i],b=polygon[(i+1)%polygon.length],inside=above?a[axis]>=value:a[axis]<=value
    if (inside) out.push(a)
    if (inside!==(above?b[axis]>=value:b[axis]<=value)) {
      const t=(value-a[axis])/(b[axis]-a[axis])
      out.push(a.map((v,j)=>v+(b[j]-v)*t))
    }
  }
  return out
}
function bounds(vertices) {
  return {min:[0,1,2].map(a=>Math.min(...vertices.map(v=>v[a]))),max:[0,1,2].map(a=>Math.max(...vertices.map(v=>v[a])))}
}
function triangles(mesh, T) {
  const p=mesh.geometry.attributes.position,index=mesh.geometry.index,tri=[]
  for(let i=0;i<(index?.count??p.count);i+=3) tri.push([0,1,2].map(j=>{
    const n=index?index.getX(i+j):i+j
    return new T.Vector3(p.getX(n),p.getY(n),p.getZ(n)).applyMatrix4(mesh.matrixWorld).toArray()
  }))
  return tri
}
// Tight clipped surface cells preserve bed cavities, wheel gaps and thin sheet
// edges. Empty cells are absent; each cell contains actual source triangles.
export function chapter2SurfaceBoxes(T,tris, cell, surface='metal', part='surface') {
  const cells=new Map()
  for(const tri of tris) {
    const b=bounds(tri),lo=b.min.map(v=>Math.floor((v+1e-7)/cell)),hi=b.max.map(v=>Math.floor((v-1e-7)/cell))
    for(let a=0;a<3;a++)hi[a]=Math.max(lo[a],hi[a])
    for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++)for(let z=lo[2];z<=hi[2];z++) {
      const indices=[x,y,z];let poly=tri
      for(let a=0;a<3&&poly.length;a++) {poly=clip(poly,a,indices[a]*cell,true);if(poly.length)poly=clip(poly,a,(indices[a]+1)*cell,false)}
      if(poly.length<3)continue
      const key=indices.join(','),p=bounds(poly),existing=cells.get(key)
      const pieces=[]
      for(let i=1;i<poly.length-1;i++)pieces.push([poly[0],poly[i],poly[i+1]])
      if(existing) {
        for(let a=0;a<3;a++){existing.min[a]=Math.min(existing.min[a],p.min[a]);existing.max[a]=Math.max(existing.max[a],p.max[a])}
        existing.tris.push(...pieces)
      } else cells.set(key,{...p,tris:pieces,surface,part})
    }
  }
  function measure(tris) {
    const box=bounds(tris.flat()),geometry=tris.map(t=>new T.Triangle(...t.map(p=>new T.Vector3(...p))))
    let error=0
    for(const x of [box.min[0],box.max[0]])for(const y of [box.min[1],box.max[1]])for(const z of [box.min[2],box.max[2]]) {
      const point=new T.Vector3(x,y,z)
      error=Math.max(error,Math.min(...geometry.map(t=>t.closestPointToPoint(point,new T.Vector3()).distanceTo(point))))
    }
    return {...box,tris,error}
  }
  function refine(b,depth=0) {
    if(b.error>.045&&depth<16) {
      let best=null
      for(let axis=0;axis<3;axis++) {
        if(b.max[axis]-b.min[axis]<.045)continue
        const middle=(b.min[axis]+b.max[axis])/2,halves=[[],[]]
        for(const tri of b.tris)for(let side=0;side<2;side++) {
          const poly=clip(tri,axis,middle,!!side)
          for(let i=1;i<poly.length-1;i++)halves[side].push([poly[0],poly[i],poly[i+1]])
        }
        const parts=halves.filter(t=>t.length).map(measure),score=Math.max(...parts.map(p=>p.error))
        if(!best||score<best.score)best={parts,score}
      }
      if(best)return best.parts.flatMap(p=>refine(p,depth+1))
    }
    for(let a=0;a<3;a++)if(b.max[a]-b.min[a]<.004){const c=(b.min[a]+b.max[a])/2;b.min[a]=c-.002;b.max[a]=c+.002}
    return [{min:b.min,max:b.max,surface,part}]
  }
  let result=[...cells.values()].flatMap(b=>refine(measure(b.tris)))
  // Join only exact rectangular neighbours. This deletes subdivision seams
  // without expanding into any new space or joining across a cavity.
  for(let pass=0;pass<2;pass++)for(let axis=0;axis<3;axis++) {
    const groups=new Map()
    for(const box of result) {
      const key=[0,1,2].filter(a=>a!==axis).flatMap(a=>[box.min[a],box.max[a]]).map(v=>Math.round(v*1e6)).join(',')
      if(!groups.has(key))groups.set(key,[])
      groups.get(key).push(box)
    }
    result=[]
    for(const boxes of groups.values()) {
      boxes.sort((a,b)=>a.min[axis]-b.min[axis])
      let current=null
      for(const box of boxes) {
        if(current&&box.min[axis]<=current.max[axis]+1e-6)current.max[axis]=Math.max(current.max[axis],box.max[axis])
        else {current=box;result.push(box)}
      }
    }
  }
  return result
}
function components(mesh,T) {
  const tris=triangles(mesh,T),parent=tris.map((_,i)=>i),vertices=new Map()
  const root=i=>parent[i]===i?i:parent[i]=root(parent[i])
  tris.forEach((tri,i)=>tri.forEach(p=>{const key=p.map(v=>Math.round(v*1e5)).join(',');if(vertices.has(key))parent[root(i)]=root(vertices.get(key));else vertices.set(key,i)}))
  const groups=new Map()
  tris.forEach((t,i)=>{const key=root(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t)})
  return [...groups.values()]
}
export function chapter2PropBoxes(T,object,name) {
  object.updateMatrixWorld(true)
  const boxes=[]
  object.traverse(mesh=>{
    if(!mesh.isMesh)return
    const material=mesh.material.name||'',surface=/wood|card|polymer|tarp/.test(material)?'wood':material==='rubber'?'rubber':material==='concrete'?'concrete':'metal'
    if(material.startsWith('label_')||material.startsWith('decal_'))return
    if(name==='crate_stack'&&material!=='wood_dark')return
    if(name==='tarp_cargo'&&!['wood_pallet','tarp'].includes(material))return
    if(name==='shelf_rack'&&/polymer|glass_dirty/.test(material))return
    if(name==='fence_panel'&&material==='chainlink')return
    // Opaque draped fabric has contact on the cloth itself, not a solid
    // envelope across the empty gaps between the underlying wooden loads.
    if(name==='tarp_cargo'&&material==='tarp') {
      boxes.push(...chapter2SurfaceBoxes(T,triangles(mesh,T),.8,surface,material))
      return
    }
    for(const tris of components(mesh,T)) {
      const b=bounds(tris.flat()),size=b.max.map((v,a)=>v-b.min[a]),part=material
      if(name==='crate_stack') {
        // E1's closed wood_dark cores are the three actual closed crates. The
        // side boards add 28mm. E1 has a 2mm bottom offset and a 35mm
        // lid allowance, not a symmetric vertical pad through the lower air gap.
        // The same yaw is recovered from a core face.
        const t=tris.find(t=>Math.abs(new T.Vector3(...t[1]).sub(new T.Vector3(...t[0])).cross(new T.Vector3(...t[2]).sub(new T.Vector3(...t[0]))).y)<1e-6)
        const n=new T.Vector3(...t[1]).sub(new T.Vector3(...t[0])).cross(new T.Vector3(...t[2]).sub(new T.Vector3(...t[0]))).normalize(),yaw=Math.atan2(-n.z,n.x),c=Math.cos(yaw),s=Math.sin(yaw)
        const core=bounds(tris.flat().map(([x,y,z])=>[x*c-z*s,y,x*s+z*c]))
        core.min=core.min.map((v,a)=>v-(a===1?.002:.028));core.max=core.max.map((v,a)=>v+(a===1?.035:.028))
        if(core.min[1]<.1)for(const x of [-.47,0,.47])boxes.push({min:[x-.045,0,-.49],max:[x+.045,.07,.49],surface:'wood',part:'crate-skid'})
        const dx=Math.abs(Math.sin(2*yaw))>.01?Math.ceil((core.max[0]-core.min[0])/.25):1
        const dz=Math.abs(Math.sin(2*yaw))>.01?Math.ceil((core.max[2]-core.min[2])/.25):1
        for(let x=0;x<dx;x++)for(let z=0;z<dz;z++){
          const v=[]
          for(const a of [x,x+1])for(const y of [core.min[1],core.max[1]])for(const d of [z,z+1]){const u=core.min[0]+(core.max[0]-core.min[0])*a/dx,w=core.min[2]+(core.max[2]-core.min[2])*d/dz;v.push([u*c+w*s,y,-u*s+w*c])}
          boxes.push({...bounds(v),surface:'wood',part:'closed-crate'})
        }
        continue
      }
      // Planar rack punch-outs are decals, not solid steel plates.
      if(Math.min(...size)<.00001)continue
      // Diagonal braces, leaning posts and irregular fabric/straps need tight
      // surface parts. Cardinal boards and actual closed cargo remain boxes.
      let area=0,obliqueArea=0
      for(const t of tris) {
        const n=new T.Vector3(...t[1]).sub(new T.Vector3(...t[0])).cross(new T.Vector3(...t[2]).sub(new T.Vector3(...t[0])))
        const weight=n.length();area+=weight;n.normalize()
        if(Math.max(Math.abs(n.x),Math.abs(n.y),Math.abs(n.z))<.985)obliqueArea+=weight
      }
      const diagonal=obliqueArea>area*.4
      if(name==='fence_panel'&&Math.max(...size)>.2 || diagonal&&Math.max(...size)>.35 || name==='shelf_rack'&&material==='wood_pallet'&&size[0]>.8&&size[2]>.7) boxes.push(...chapter2SurfaceBoxes(T,tris,.25,surface,part))
      else boxes.push({...b,surface,part})
    }
  })
  return boxes
}

export function installChapter2Obstacles(g, items, {recordAt,ownedGeometry,ownedMaterials,borrowedGeometry,colliders,handles,batches}) {
  const T=g.THREE, snapshots=[],templates=new Map(),holders=new Map()
  for(const item of items) {
    const record=recordAt(item.x,item.z),holder=new T.Group()
    let object,local
    if(item.kind==='pickup') {
      if(typeof g.campaignAssets?.createPickupModel!=='function')throw Error('CH2 pickup asset must be preloaded before environment construction')
      object=g.campaignAssets.createPickupModel(T,g.campaignAssets.pickupTexture)
      object.updateMatrixWorld(true)
      const tris=[]
      object.traverse(m=>{if(m.isMesh){ownedGeometry.add(m.geometry);ownedMaterials.add(m.material);tris.push(...triangles(m,T))}})
      local=chapter2SurfaceBoxes(T,tris,.2,'metal','pickup-shell')
    } else if(item.kind==='steel_plate') {
      object=new T.Group()
      const material=g.mats.get('steel_worn',{vertexColors:true}),geometry=new T.BoxGeometry(item.width,1.8,.05)
      ownedGeometry.add(geometry)
      const mesh=new T.Mesh(geometry,material);mesh.position.y=.9;mesh.rotation.x=.18;mesh.castShadow=true;mesh.receiveShadow=true;object.add(mesh)
      // Two welded ground feet support the leaning sheet; its lower edge
      // lands at y=0. The sheet contact is split along the actual slope.
      mesh.position.y=Math.cos(.18)*.9+Math.sin(.18)*.025
      for(const x of [-item.width/2+.2,item.width/2-.2]) {
        const geo=new T.BoxGeometry(.08,.08,.8);ownedGeometry.add(geo)
        const foot=new T.Mesh(geo,material);foot.position.set(x,.04,.12);foot.castShadow=true;foot.receiveShadow=true;object.add(foot)
      }
      object.traverse(m=>{if(m.isMesh)m.geometry.setAttribute('color',new T.BufferAttribute(new Float32Array(m.geometry.attributes.position.count*3).fill(1),3))})
      local=[]
      for(let i=0;i<8;i++) {
        const box=new T.Box3(new T.Vector3(-item.width/2,-.9+1.8*i/8,-.025),new T.Vector3(item.width/2,-.9+1.8*(i+1)/8,.025))
        mesh.updateMatrix();box.applyMatrix4(mesh.matrix)
        local.push({min:box.min.toArray(),max:box.max.toArray(),surface:'metal',part:'leaning-sheet'})
      }
      for(const x of [-item.width/2+.2,item.width/2-.2])local.push({min:[x-.04,0,-.28],max:[x+.04,.08,.52],surface:'metal',part:'sheet-foot'})
    } else {
      const key=`${item.kind}:${JSON.stringify(item.options||{})}`
      if(!templates.has(key)) {
        const source=g.props.build(item.kind,{seed:0,...item.options})
        let meshes=0;source.traverse(m=>{if(m.isMesh){meshes++;borrowedGeometry.add(m.geometry)}})
        if(source.userData.prop!==item.kind||meshes<2||!source.userData.colliders?.length)throw Error(`CH2 requires complete native ${item.kind}; fallback rejected`)
        // Native jersey/wood boxes have matching component metadata. Forklift
        // body metadata overfills the cab, so merged props are split by actual
        // primitive connectivity so empty rack bays cannot become solid walls.
        const parts=['jersey_barrier','crate_wood'].includes(item.kind)?source.userData.colliders.map((b,i)=>({...b,part:`native-${i}`})):chapter2PropBoxes(T,source,item.kind)
        templates.set(key,{source,parts})
      }
      const template=templates.get(key)
      object=template.source.clone(true);local=template.parts
    }
    holder.name=item.id;holder.add(object)
    holder.position.set(item.x,item.y||0,item.z)
    holder.rotation.set(item.pitch||0,item.yaw||0,item.roll||0,'YXZ')
    holder.scale.setScalar(item.scale||1)
    holder.updateMatrixWorld(true)
    if(!holders.has(record.chunk))holders.set(record.chunk,[])
    holders.get(record.chunk).push(holder)
    const contact=[]
    // Cardinal placements keep exact component bounds; tilted objects use the
    // source geometry after transformation rather than rotated envelope boxes.
    if(item.pitch||item.roll) {
      local=chapter2PropBoxes(T,holder,item.kind)
      if(item.kind==='fence_panel') {
        // One transparent net contact strip per 8cm of the actual tilted mesh.
        // It blocks capsules only; opaque posts/rails retain normal LOS boxes.
        for(let i=0;i<25;i++) {
          const box=new T.Box3(new T.Vector3(-1.46,.06+1.93*i/25,.001),new T.Vector3(1.46,.06+1.93*(i+1)/25,.023)).applyMatrix4(holder.matrixWorld)
          local.push({min:box.min.toArray(),max:box.max.toArray(),surface:'metal',part:'chainlink',playerOnly:true})
        }
      }

    }
    for(const [i,b] of local.entries()) {
      const box=item.pitch||item.roll?new T.Box3(new T.Vector3(...b.min),new T.Vector3(...b.max)):new T.Box3(new T.Vector3(...b.min),new T.Vector3(...b.max)).applyMatrix4(holder.matrixWorld)
      const data={id:`${item.id}:${i}`,obstacleId:item.id,part:b.part,min:box.min.toArray(),max:box.max.toArray(),surface:b.surface,tag:'campaign-ch2-obstacle',playerOnly:!!b.playerOnly}
      colliders.push(data);contact.push(data.id)
      const handle=g.physics.addBox(data.min,data.max,data)
      handle.id=data.id;handle.obstacleId=item.id;handle.part=data.part
      handles.push(handle)
    }
    const visibleBounds=new T.Box3().setFromObject(holder)
    snapshots.push({...structuredClone(item),bounds:{min:visibleBounds.min.toArray(),max:visibleBounds.max.toArray()},source:item.kind==='pickup'?'user-glb':item.kind==='steel_plate'?'native-material-sheet':`native-${item.kind}`,colliderIds:contact})
  }
  // Repeated native props share immutable factory templates. Each chunk uses
  // the same instancing path as the original CH2 containers, including labels.
  for(const [chunk,objects] of holders) {
    const parts=new Map()
    for(const object of objects)object.traverse(mesh=>{
      if(!mesh.isMesh)return
      const key=`${mesh.geometry.id}:${mesh.material.id}`
      if(!parts.has(key))parts.set(key,{mesh,matrices:[],obstacleIds:[]})
      parts.get(key).matrices.push(mesh.matrixWorld.clone())
      parts.get(key).obstacleIds.push(object.name)
    })
    for(const {mesh,matrices,obstacleIds} of parts.values()) {
      const batch=new T.InstancedMesh(mesh.geometry,mesh.material,matrices.length)
      batch.name=`ch2-obstacle-${mesh.material.name}`
      batch.userData.obstacleIds=obstacleIds
      batch.castShadow=mesh.castShadow;batch.receiveShadow=mesh.receiveShadow
      batch.layers.mask=mesh.layers.mask;batch.renderOrder=mesh.renderOrder
      batch.boundingBox=new T.Box3()
      const box=new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position)
      matrices.forEach((matrix,i)=>{batch.setMatrixAt(i,matrix);batch.boundingBox.union(box.clone().applyMatrix4(matrix))})
      batch.instanceMatrix.needsUpdate=true
      batch.boundingSphere=batch.boundingBox.getBoundingSphere(new T.Sphere())
      batches.push(batch);chunk.root.add(batch)
    }
    for(const object of objects)object.clear()
  }
  return snapshots
}
