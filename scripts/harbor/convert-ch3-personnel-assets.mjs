import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const root=new URL('../../',import.meta.url),output=new URL('assets/harbor/ch3-personnel-derived/',root)
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
export const RIFLE_SOURCE=Object.freeze({path:'assets/harbor/guns/突击步枪.glb',bytes:986900,
  sha256:'4c424341cfca6bbc16a8e0815985802d0d10cd5252c59f5d91502a5798781067'})
export const WORKER_SOURCE=Object.freeze({path:'assets/harbor/worker/许工.glb',bytes:3987896,
  sha256:'69be592918cf0944799593f09e249f05a4fe4a125498d27371a488b5b70a6722'})

export function bakePersonnelMesh(bytes,kind) {
  assert.ok(['rifle','worker'].includes(kind))
  const worker=kind==='worker',source=worker?WORKER_SOURCE:RIFLE_SOURCE
  assert.equal(hash(bytes),source.sha256,`${kind} source changed; audit before replacement`)
  assert.equal(bytes.length,source.bytes)
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length)
  const length=bytes.readUInt32LE(12),header=20+length
  assert.equal(length%4,0);assert.equal(bytes.readUInt32LE(16),0x4e4f534a);assert.equal(bytes.readUInt32LE(header+4),0x004e4942)
  const json=JSON.parse(bytes.subarray(20,header)),bin=bytes.subarray(header+8)
  assert.equal(bin.length,bytes.readUInt32LE(header));assert.ok(bin.length-json.buffers[0].byteLength<4)
  assert.equal(json.asset.version,'2.0');assert.equal(json.asset.generator,'Tripo')
  for(const key of ['animations','extensions','extensionsUsed','extensionsRequired'])assert.equal(json[key],undefined)
  assert.equal(json.buffers.length,1);assert.equal(json.buffers[0].uri,undefined)
  assert.equal(json.meshes.length,1);assert.equal(json.meshes[0].primitives.length,1)
  const primitive=json.meshes[0].primitives[0],vertices=worker?22177:5521,indices=worker?108783:18750
  assert.deepEqual(primitive,{attributes:worker?{POSITION:0,NORMAL:1,TEXCOORD_0:2,JOINTS_0:3,WEIGHTS_0:4}:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:worker?5:3,material:0})
  assert.equal(json.nodes.length,worker?67:1)
  assert.deepEqual(json.nodes[worker?65:0],{mesh:0,name:json.nodes[worker?65:0].name,...(worker?{skin:0}:{})})
  if(worker){assert.equal(json.skins.length,1);assert.equal(json.skins[0].joints.length,65)
    assert.deepEqual(json.nodes[66],{children:[65,64],name:'Armature'})
  }else assert.equal(json.skins,undefined)
  const attributes={},chunks=[],audit=[];let offset=0
  for(const [name,index,itemSize] of [['position',0,3],['normal',1,3],['uv',2,2],['index',primitive.indices,1]]) {
    const a=json.accessors[index],v=json.bufferViews[a.bufferView],indexed=name==='index',size=indexed?2:4
    assert.equal(a.componentType,indexed?5123:5126);assert.equal(a.type,indexed?'SCALAR':name==='uv'?'VEC2':'VEC3')
    assert.equal(a.count,indexed?indices:vertices);assert.equal(a.byteOffset,undefined);assert.equal(a.sparse,undefined)
    assert.equal(v.buffer,0);assert.equal(v.byteStride,undefined);assert.equal(v.byteLength,a.count*itemSize*size)
    assert.ok(v.byteOffset>=0&&v.byteOffset+v.byteLength<=bin.length)
    const data=bin.subarray(v.byteOffset,v.byteOffset+v.byteLength)
    for(let k=0;k<data.length;k+=size){const value=indexed?data.readUInt16LE(k):data.readFloatLE(k);assert.ok(Number.isFinite(value));if(indexed)assert.ok(value<vertices)}
    attributes[name]={offset,length:a.count*itemSize,itemSize,componentType:a.componentType}
    chunks.push(data);audit.push({name,bytes:data.length,sha256:hash(data)});offset+=data.length
  }
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],positions=chunks[0]
  for(let i=0;i<positions.length;i+=4){const axis=i/4%3,value=positions.readFloatLE(i);min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value)}
  assert.deepEqual(min,json.accessors[0].min);assert.deepEqual(max,json.accessors[0].max)
  assert.deepEqual(json.samplers,[{magFilter:9729,minFilter:9987}])
  assert.equal(json.materials.length,1);assert.equal(json.materials[0].doubleSided,true)
  assert.equal(json.images.length,worker?3:1);assert.equal(json.textures.length,json.images.length)
  const files={},textures=json.images.map((image,i)=>{
    assert.equal(image.mimeType,'image/jpeg');assert.equal(image.uri,undefined)
    assert.deepEqual(json.textures[i],{sampler:0,source:i})
    const v=json.bufferViews[image.bufferView],data=bin.subarray(v.byteOffset,v.byteOffset+v.byteLength)
    const path=`${kind}-${worker?['normal','basecolor','rm'][i]:'basecolor'}.jpg`;files[path]=data
    return {path,bytes:data.length,sha256:hash(data),width:2048,height:2048}
  })
  const asset={source,meshName:json.meshes[0].name,material:json.materials[0],attributes,textures,
    bounds:{min,max},forward:'+Z',up:'+Y',data:Buffer.concat(chunks).toString('base64')}
  if(!worker){
    // Exact source surface vertices selected from the side projection; no invented geometry/socket bone.
    const contact=candidate=>{let distance=Infinity,vertex=-1,point
      for(let i=0;i<vertices;i++){const p=[0,1,2].map(k=>positions.readFloatLE((i*3+k)*4)),d=p.reduce((sum,v,k)=>sum+(v-candidate[k])**2,0)
        if(d<distance){distance=d;vertex=i;point=p}}
      return {vertex,point}
    }
    const grip=contact([-.025,.108,-.186]),foreEnd=contact([0,.238,.12])
    const front=[];for(let i=0;i<vertices;i++)if(positions.readFloatLE((i*3+2)*4)===max[2])front.push([0,1,2].map(k=>positions.readFloatLE((i*3+k)*4)))
    const muzzle=[0,1,2].map(axis=>(Math.min(...front.map(p=>p[axis]))+Math.max(...front.map(p=>p[axis])))/2)
    Object.assign(asset,{lengthMetres:1,scale:1/(max[2]-min[2]),sockets:{muzzle,grip:grip.point,foreEnd:foreEnd.point},
      contacts:{gripVertex:grip.vertex,foreEndVertex:foreEnd.vertex,muzzleFrontVertices:front.length}})
  }else Object.assign(asset,{heightMetres:1.76,scale:1.76/(max[1]-min[1]),yawRadians:Math.PI,
    sourceOffset:[-(min[0]+max[0])/2,-min[1],-(min[2]+max[2])/2],
    pose:'Original static bind geometry; no animations, skeleton, target or interaction at runtime.'})
  return {asset,audit,files}
}

export async function bakePersonnelAssets() {
  const files={},sources={}
  for(const [kind,source] of [['rifle',RIFLE_SOURCE],['worker',WORKER_SOURCE]]){
    const baked=bakePersonnelMesh(await fs.readFile(new URL(source.path,root)),kind)
    Object.assign(files,baked.files)
    files[`${kind}.mesh.mjs`]=Buffer.from(`// Generated by convert-ch3-personnel-assets.mjs; source geometry/JPEG bytes are unchanged.\nexport const ${kind} = ${JSON.stringify(baked.asset)}\n`)
    sources[kind]={source,attributes:baked.audit,textures:baked.asset.textures,bounds:baked.asset.bounds}
  }
  files['provenance.json']=Buffer.from(JSON.stringify({sources,
    method:'Exact Float32 POSITION/NORMAL/UV and Uint16 index extraction; original embedded JPEGs, no re-encoding. Worker keeps static bind pose; skin is not animated.',
    rights:{notice:'NOTICE'},
    outputs:Object.fromEntries(Object.entries(files).map(([name,data])=>[name,{bytes:data.length,sha256:hash(data)}]))},null,2)+'\n')
  return files
}
if(process.argv[1]&&import.meta.url===pathToFileURL(await fs.realpath(process.argv[1])).href){
  assert.ok(process.argv.slice(2).every(arg=>arg==='--check'),'Only --check supported')
  const files=await bakePersonnelAssets(),check=process.argv.includes('--check')
  if(!check)await fs.mkdir(output,{recursive:true})
  for(const [name,bytes] of Object.entries(files)){
    if(check)assert.ok(bytes.equals(await fs.readFile(new URL(name,output))),`${name} differs`)
    else await fs.writeFile(new URL(name,output),bytes)
  }
  if(check)assert.deepEqual((await fs.readdir(output)).sort(),Object.keys(files).sort())
  console.log(JSON.stringify({success:true,mode:check?'check':'generate',files:Object.keys(files)}))
}
