export const CH5_REPAIR_SOURCE=Object.freeze({
  path:'assets/harbor/维修柜/维修柜.glb',url:'/assets/harbor/维修柜/维修柜.glb',bytes:948308,
  sha256:'371cc49a8ae5d8e1c5dbaed1f56e928779f7342101d2c9cf79ac8a1ec757932a',height:1.8,
})

// One hash-bound user-supplied static GLB, using the same original Three
// geometry/material/texture ownership as CH3/CH4. No second GLTF runtime.
export async function loadChapter5RepairAsset(T,{bytes}={}) {
  if(T?.REVISION!=='180')throw Error('CH5 repair asset requires original g.THREE r180')
  if(!bytes){const response=await fetch(CH5_REPAIR_SOURCE.url);if(!response.ok)throw Error(`Repair GLB HTTP ${response.status}`);bytes=await response.arrayBuffer()}
  const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes)
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('')
  if(data.length!==CH5_REPAIR_SOURCE.bytes||sha256!==CH5_REPAIR_SOURCE.sha256)throw Error('Repair GLB source SHA-256 changed; audit before replacing')
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength),jsonLength=view.getUint32(12,true)
  const json=JSON.parse(new TextDecoder().decode(data.subarray(20,20+jsonLength))),binary=data.subarray(28+jsonLength)
  const geometry=new T.BufferGeometry();let material,texture,disposed=false
  const dispose=()=>{if(disposed)return;disposed=true;geometry.dispose();material?.dispose();texture?.dispose()}
  try {
    for(const [i,name]of ['position','normal','uv','index'].entries()){
      const a=json.accessors[i],v=json.bufferViews[a.bufferView],ArrayType=i===3?Uint16Array:Float32Array
      const raw=binary.slice(v.byteOffset,v.byteOffset+v.byteLength),array=new ArrayType(raw.buffer,raw.byteOffset,raw.byteLength/ArrayType.BYTES_PER_ELEMENT)
      const attribute=new T.BufferAttribute(array,i===3?1:i===2?2:3)
      if(i===3)geometry.setIndex(attribute);else geometry.setAttribute(name,attribute)
    }
    geometry.computeBoundingBox();geometry.computeBoundingSphere()
    const sourceImage=json.images[0],v=json.bufferViews[sourceImage.bufferView]
    const url=URL.createObjectURL(new Blob([binary.slice(v.byteOffset,v.byteOffset+v.byteLength)],{type:sourceImage.mimeType}))
    try{texture=await new T.TextureLoader().loadAsync(url)}finally{URL.revokeObjectURL(url)}
    if(texture.image?.width!==2048||texture.image?.height!==2048)throw Error('Repair GLB JPEG must decode to 2048×2048')
    texture.name=sourceImage.name;texture.flipY=false;texture.colorSpace=T.SRGBColorSpace
    texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter
    texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.generateMipmaps=true
    const sourceMaterial=json.materials[0],pbr=sourceMaterial.pbrMetallicRoughness
    material=new T.MeshStandardMaterial({name:sourceMaterial.name,map:texture,color:0xffffff,
      metalness:pbr.metallicFactor,roughness:pbr.roughnessFactor,side:sourceMaterial.doubleSided?T.DoubleSide:T.FrontSide})
    const sourceBounds=geometry.boundingBox.clone(),size=sourceBounds.getSize(new T.Vector3()),scale=CH5_REPAIR_SOURCE.height/size.y
    // Keep the original node translation, then normalize the complete node's
    // bottom/centre once. Uniform scaling preserves normals and proportions.
    const nodeTranslation=new T.Vector3(...json.nodes[0].translation),centre=sourceBounds.getCenter(new T.Vector3()).add(nodeTranslation)
    const translation=new T.Vector3(-centre.x*scale,-(sourceBounds.min.y+nodeTranslation.y)*scale,-centre.z*scale)
    const bounds={min:[-size.x*scale/2,0,-size.z*scale/2],max:[size.x*scale/2,CH5_REPAIR_SOURCE.height,size.z*scale/2]}
    return {geometry,material,texture,bounds,scale,nodeTranslation,translation,source:{...CH5_REPAIR_SOURCE},
      get disposed(){return disposed},dispose}
  }catch(error){dispose();throw error}
}

export function createChapter5RepairAsset(T,resources) {
  if(!resources||resources.disposed)throw Error('CH5 repair resources must be loaded and not disposed')
  const root=new T.Group(),node=new T.Group(),mesh=new T.Mesh(resources.geometry,resources.material)
  root.name='campaign-ch5-repair-cabinet';node.position.copy(resources.translation);node.scale.setScalar(resources.scale)
  mesh.position.copy(resources.nodeTranslation);mesh.castShadow=mesh.receiveShadow=true;node.add(mesh);root.add(node)
  root.userData.source={...resources.source};root.userData.bounds=structuredClone(resources.bounds)
  root.updateMatrixWorld(true);return root
}
