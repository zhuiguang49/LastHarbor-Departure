import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const root=new URL('../../',import.meta.url),output=new URL('assets/harbor/ch3-sniper-derived/',root)
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
export const SNIPER_GUN_SOURCE=Object.freeze({path:'assets/harbor/guns/狙击枪.glb',bytes:996020,
  sha256:'ef340b6ea23d66b1be5a1f6a6bb5d7c11f4347ece1fc530fce699cbc415a2aa3'})

export function bakeSniperGun(bytes) {
  assert.equal(hash(bytes),SNIPER_GUN_SOURCE.sha256,'Sniper source changed; audit before replacement')
  assert.equal(bytes.length,SNIPER_GUN_SOURCE.bytes)
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length)
  const length=bytes.readUInt32LE(12),header=20+length
  assert.equal(length%4,0);assert.equal(bytes.readUInt32LE(16),0x4e4f534a);assert.equal(bytes.readUInt32LE(header+4),0x004e4942)
  const json=JSON.parse(bytes.subarray(20,header)),bin=bytes.subarray(header+8)
  assert.equal(bin.length,bytes.readUInt32LE(header));assert.equal(json.buffers[0].byteLength,bin.length)
  assert.equal(json.asset.version,'2.0');assert.equal(json.asset.generator,'Tripo')
  for(const key of ['skins','animations','extensions','extensionsUsed','extensionsRequired'])assert.equal(json[key],undefined)
  assert.deepEqual(json.scenes,[{name:'Scene',nodes:[0]}]);assert.equal(json.scene,0)
  assert.deepEqual(json.nodes,[{mesh:0,name:json.nodes[0].name}])
  assert.equal(json.buffers.length,1);assert.equal(json.buffers[0].uri,undefined)
  assert.equal(json.meshes.length,1)
  assert.deepEqual(json.meshes[0].primitives,[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0}])
  assert.deepEqual(json.materials,[{doubleSided:true,name:json.materials[0].name,
    pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:0.8999999761581421}}])
  assert.deepEqual(json.textures,[{sampler:0,source:0}]);assert.deepEqual(json.samplers,[{magFilter:9729,minFilter:9987}])
  assert.equal(json.accessors.length,4);assert.equal(json.bufferViews.length,5);assert.equal(json.images.length,1)
  const attributes={},chunks=[],audit=[];let offset=0
  for(const [i,name] of ['position','normal','uv','index'].entries()) {
    const a=json.accessors[i],v=json.bufferViews[i],indexed=i===3,itemSize=indexed?1:i===2?2:3,componentType=indexed?5123:5126
    const expected={bufferView:i,componentType,count:indexed?19017:4991,type:indexed?'SCALAR':i===2?'VEC2':'VEC3'}
    if(i===0){expected.min=a.min;expected.max=a.max}
    assert.deepEqual(a,expected)
    const byteLength=a.count*itemSize*(indexed?2:4)
    assert.deepEqual(v,{buffer:0,byteLength,byteOffset:v.byteOffset,target:indexed?34963:34962})
    assert.ok(v.byteOffset>=0&&v.byteOffset+byteLength<=bin.length)
    const data=bin.subarray(v.byteOffset,v.byteOffset+byteLength)
    for(let k=0;k<data.length;k+=indexed?2:4){const value=indexed?data.readUInt16LE(k):data.readFloatLE(k);assert.ok(Number.isFinite(value));if(indexed)assert.ok(value<4991)}
    attributes[name]={offset,length:a.count*itemSize,itemSize,componentType};chunks.push(data)
    audit.push({name,bytes:byteLength,sha256:hash(data)});offset+=byteLength
  }
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity]
  for(let i=0;i<chunks[0].length;i+=4){const axis=i/4%3,v=chunks[0].readFloatLE(i);min[axis]=Math.min(min[axis],v);max[axis]=Math.max(max[axis],v)}
  assert.deepEqual(min,json.accessors[0].min);assert.deepEqual(max,json.accessors[0].max)
  const image=json.images[0],v=json.bufferViews[4]
  assert.deepEqual(image,{bufferView:4,mimeType:'image/jpeg',name:'狙击枪_basecolor'})
  assert.deepEqual(v,{buffer:0,byteLength:796491,byteOffset:197748})
  const jpeg=bin.subarray(v.byteOffset,v.byteOffset+v.byteLength)
  assert.equal(hash(jpeg),'be5d7dbd4fd50c474d045bdbdfd7b11e6c02aac47a441b8d46ad0fcbaea9d34f')
  const asset={source:SNIPER_GUN_SOURCE,meshName:json.meshes[0].name,material:json.materials[0],attributes,
    lengthMetres:1.25,scale:1.25/(max[2]-min[2]),forward:'+Z',up:'+Y',
    sockets:{muzzle:[-.052001953125,.199951171875,max[2]],scope:[-.041015625,.28857421875,.109130859375],
      grip:[-.07683035624824693,.12309154158174096,-.25016530647403173],
      foreEnd:[-.05261959690614856,.16991906626261782,-.039581541073472865]},
    contacts:{gripTriangle:1899,foreEndTriangle:786,method:'Closest source surface to audited grip and rear fore-end candidates; exact triangle contacts, not bone sockets.'},
    texture:{path:'sniper-basecolor.jpg',bytes:jpeg.length,sha256:hash(jpeg),width:2048,height:2048},data:Buffer.concat(chunks).toString('base64')}
  return {asset,audit,files:{'sniper-basecolor.jpg':jpeg}}
}
export async function bakeSniperAssets() {
  const {asset,audit,files}=bakeSniperGun(await fs.readFile(new URL(SNIPER_GUN_SOURCE.path,root)))
  files['sniper.mesh.mjs']=Buffer.from(`// Generated by convert-ch3-sniper-asset.mjs; source bytes and JPEG are unchanged.\nexport const sniperGun = ${JSON.stringify(asset)}\n`)
  files['provenance.json']=Buffer.from(JSON.stringify({source:SNIPER_GUN_SOURCE,attributes:audit,texture:asset.texture,
    method:'Exact packed Float32 POSITION/NORMAL/UV and Uint16 indices; embedded JPEG copied without re-encoding. Uniform 1.25m length at runtime.',
    rights:{notice:'NOTICE'},
    outputs:Object.fromEntries(Object.entries(files).map(([name,data])=>[name,{bytes:data.length,sha256:hash(data)}]))},null,2)+'\n')
  return files
}
if(process.argv[1]&&import.meta.url===pathToFileURL(await fs.realpath(process.argv[1])).href){
  assert.ok(process.argv.slice(2).every(arg=>arg==='--check'),'Only --check supported')
  const files=await bakeSniperAssets(),check=process.argv.includes('--check')
  if(!check)await fs.mkdir(output,{recursive:true})
  for(const [name,bytes] of Object.entries(files)){
    if(check)assert.ok(bytes.equals(await fs.readFile(new URL(name,output))),`${name} differs`)
    else await fs.writeFile(new URL(name,output),bytes)
  }
  if(check)assert.deepEqual((await fs.readdir(output)).sort(),Object.keys(files).sort())
  console.log(JSON.stringify({success:true,mode:check?'check':'generate',files:Object.keys(files)}))
}
