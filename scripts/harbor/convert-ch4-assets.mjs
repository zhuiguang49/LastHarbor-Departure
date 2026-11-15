import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

// Offline extraction of these three hash-bound, uncompressed static GLBs only.
const root = new URL('../../', import.meta.url)
const output = new URL('assets/harbor/ch4-static/', root)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
export const CH4_SOURCES = Object.freeze({
  console:{ path:'assets/harbor/操控台/操控台.glb', bytes:1005768, sha256:'8410c4b1899e786018aae19f6ab4a5bb57fe34cea1208abd776072fd2aff13bc', height:1.5 },
  server:{ path:'assets/harbor/服务器/服务器机柜.glb', bytes:1183096, sha256:'f77e6901f7009d23a2261b152f52d8457f8f9a93848b4ea7a33a833bf7455e68', height:2.5 },
  gate:{ path:'assets/harbor/安全门/安全门.glb', bytes:1230412, sha256:'b38600a36628bd49d68f823b890064dea3bcc8e81b198da581c7f5baa98b062b', height:5 },
})

function jpegDimensions(bytes) {
  assert.equal(bytes.readUInt16BE(0), 0xffd8, 'JPEG SOI')
  let offset = 2
  while (offset + 4 <= bytes.length) {
    assert.equal(bytes[offset], 0xff, 'JPEG marker')
    const marker = bytes[offset + 1], length = bytes.readUInt16BE(offset + 2)
    assert.ok(length >= 2 && offset + 2 + length <= bytes.length, 'JPEG segment range')
    if ([0xc0,0xc1,0xc2].includes(marker)) return { width:bytes.readUInt16BE(offset + 7), height:bytes.readUInt16BE(offset + 5) }
    assert.notEqual(marker, 0xda, 'JPEG must include SOF before scan')
    offset += length + 2
  }
  assert.fail('Missing JPEG dimensions')
}

export function bakeChapter4Asset(kind, bytes) {
  const spec = CH4_SOURCES[kind]
  assert.ok(spec, 'Unknown CH4 static kind')
  assert.equal(hash(bytes), spec.sha256, `${kind}: source SHA-256 changed; audit before replacing`)
  assert.equal(bytes.length, spec.bytes)
  assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length); assert.equal(bytes.readUInt32LE(16), 0x4e4f534a)
  const jsonLength = bytes.readUInt32LE(12), binHeader = 20 + jsonLength
  assert.equal(jsonLength % 4, 0); assert.equal(bytes.readUInt32LE(binHeader + 4), 0x004e4942)
  const gltf = JSON.parse(bytes.subarray(20, binHeader).toString('utf8')), bin = bytes.subarray(binHeader + 8)
  assert.equal(bin.length, bytes.readUInt32LE(binHeader))
  assert.equal(gltf.asset.version, '2.0'); assert.equal(gltf.asset.generator, 'Tripo')
  for (const key of ['skins','animations','extensions','extensionsUsed','extensionsRequired']) assert.equal(gltf[key], undefined, key)
  assert.equal(gltf.scene, 0); assert.deepEqual(gltf.scenes, [{ name:'Scene', nodes:[0] }])
  assert.equal(gltf.nodes.length, 1)
  const node = gltf.nodes[0]
  assert.deepEqual(Object.keys(node).sort(), ['mesh','name'])
  assert.equal(node.mesh, 0)
  assert.equal(gltf.meshes.length, 1)
  assert.deepEqual(gltf.meshes[0].primitives, [{ attributes:{ POSITION:0, NORMAL:1, TEXCOORD_0:2 }, indices:3, material:0 }])
  assert.equal(gltf.materials.length, 1)
  const material = gltf.materials[0]
  assert.deepEqual(material, { doubleSided:true, name:material.name,
    pbrMetallicRoughness:{ baseColorTexture:{ index:0 }, metallicFactor:0, roughnessFactor:0.8999999761581421 } })
  assert.deepEqual(gltf.textures, [{ sampler:0, source:0 }])
  assert.deepEqual(gltf.samplers, [{ magFilter:9729, minFilter:9987 }])
  assert.equal(gltf.buffers.length, 1); assert.equal(gltf.buffers[0].uri, undefined)
  assert.equal(gltf.buffers[0].byteLength, bin.length)
  assert.equal(gltf.accessors.length, 4); assert.equal(gltf.bufferViews.length, 5); assert.equal(gltf.images.length, 1)
  const attributes = {}, chunks = [], attributeAudit = []
  let offset = 0
  for (const [i, name] of ['position','normal','uv','index'].entries()) {
    const a = gltf.accessors[i], v = gltf.bufferViews[i], indexed = i === 3
    const componentType = indexed ? 5123 : 5126, itemSize = i === 2 ? 2 : indexed ? 1 : 3
    const expected = { bufferView:i, componentType, count:a.count, type:indexed ? 'SCALAR' : i === 2 ? 'VEC2' : 'VEC3' }
    if (i === 0) { expected.min = a.min; expected.max = a.max }
    assert.deepEqual(a, expected, `${name}: only packed, non-sparse source data`)
    assert.ok(Number.isInteger(a.count) && a.count > 0)
    if (i === 1 || i === 2) assert.equal(a.count, gltf.accessors[0].count)
    const length = a.count * itemSize, byteLength = length * (indexed ? 2 : 4)
    assert.deepEqual(v, { buffer:0, byteOffset:v.byteOffset, byteLength, target:indexed ? 34963 : 34962 })
    assert.ok(v.byteOffset >= 0 && v.byteOffset + byteLength <= bin.length)
    const data = bin.subarray(v.byteOffset, v.byteOffset + byteLength)
    for (let j = 0; j < data.length; j += indexed ? 2 : 4) {
      const value = indexed ? data.readUInt16LE(j) : data.readFloatLE(j)
      assert.ok(Number.isFinite(value), `Finite ${name}`)
      if (indexed) assert.ok(value < gltf.accessors[0].count, 'Index range')
    }
    if (indexed) assert.equal(a.count % 3, 0)
    attributes[name] = { offset, length, itemSize, componentType }
    attributeAudit.push({ name, ...attributes[name], bytes:byteLength, sha256:hash(data) })
    chunks.push(data); offset += byteLength
  }
  const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity]
  for (let i = 0; i < chunks[0].length; i += 4) {
    const axis = i / 4 % 3, value = chunks[0].readFloatLE(i)
    min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value)
  }
  assert.deepEqual(min, gltf.accessors[0].min); assert.deepEqual(max, gltf.accessors[0].max)
  const size = max.map((v,i) => v - min[i])
  assert.ok(size.every(v => v > 0))
  const uniformScale = spec.height / size[1], scale = [uniformScale,uniformScale,uniformScale]
  const center = min.map((v,i) => i === 1 ? v : (v + max[i]) / 2)
  const translation = center.map((v,i) => -v * scale[i]), finalSize = size.map((v,i) => v * scale[i])
  const bounds = { min:[-finalSize[0]/2,0,-finalSize[2]/2], max:[finalSize[0]/2,finalSize[1],finalSize[2]/2], size:finalSize }
  const files = {}, textures = []
  for (const [i, role] of ['basecolor'].entries()) {
    const image = gltf.images[i], v = gltf.bufferViews[i + 4]
    assert.deepEqual(image, { bufferView:i + 4, mimeType:'image/jpeg', name:image.name })
    assert.deepEqual(v, { buffer:0, byteLength:v.byteLength, byteOffset:v.byteOffset })
    assert.ok(v.byteLength > 0 && v.byteOffset >= 0 && v.byteOffset + v.byteLength <= bin.length)
    const jpeg = bin.subarray(v.byteOffset, v.byteOffset + v.byteLength), dimensions = jpegDimensions(jpeg)
    assert.deepEqual(dimensions, { width:2048, height:2048 })
    const path = `${kind}-${role}.jpg`
    files[path] = jpeg
    let mipPixels = 0
    for (let side = dimensions.width; side >= 1; side /= 2) mipPixels += side * side
    textures.push({ path, role, sourceName:image.name, mimeType:image.mimeType, bytes:jpeg.length, sha256:hash(jpeg), ...dimensions,
      colorSpace:role === 'basecolor' ? 'srgb' : 'linear', estimatedRGBA8MipBytes:mipPixels * 4 })
  }
  const binary = Buffer.concat(chunks), source = { path:spec.path, sha256:spec.sha256, bytes:spec.bytes, generator:gltf.asset.generator }
  const transform = { scale, yawRadians:0, translation, up:'+Y', widthAxis:'+X', origin:'bottom-center',
    method:'Uniform scale to target height; source proportions preserved.',
    sourceNodeTranslation:'Source node has no transform; mesh bottom-centered once.' }
  const asset = { source, meshName:gltf.meshes[0].name, material, attributes, transform, bounds, textures, data:binary.toString('base64') }
  const audit = { source, sourceMetadata:gltf.asset, originalNode:node, originalBounds:{ min, max, size }, transform, boundsMetres:bounds,
    material, sampler:{ magFilter:9729, minFilter:9987, wrapS:10497, wrapT:10497, flipY:false }, attributes:attributeAudit, textures,
    cost:{ vertices:gltf.accessors[0].count, triangles:gltf.accessors[3].count / 3, geometryBytes:binary.length,
      textureJPEGBytes:textures.reduce((n,t) => n + t.bytes, 0), estimatedRGBA8MipBytes:textures.reduce((n,t) => n + t.estimatedRGBA8MipBytes, 0), drawCallsPerInstance:1 } }
  return { asset, audit, files }
}

export async function bakeChapter4Assets() {
  const assets = {}, models = {}, files = {}
  for (const [kind, spec] of Object.entries(CH4_SOURCES)) {
    const baked = bakeChapter4Asset(kind, await fs.readFile(new URL(spec.path, root)))
    assets[kind] = baked.asset; models[kind] = baked.audit; Object.assign(files, baked.files)
  }
  const module = `// Generated from three user-supplied CH4 static GLBs. Do not hand-edit; see provenance.json.\nexport const chapter4Assets = ${JSON.stringify(assets)}\n`
  files['ch4.mesh.mjs'] = Buffer.from(module)
  const provenance = {
    converter:{ script:'scripts/harbor/convert-ch4-assets.mjs', version:'1.0.0', dependencies:[],
      method:'Copy source Float32 POSITION/NORMAL/UV and Uint16 index bytes into ESM base64; extract all embedded JPEGs without re-encoding. Apply transforms only at runtime.' },
    rights:{ notice:'NOTICE' },
    models, outputs:Object.fromEntries(Object.entries(files).map(([path,bytes]) => [path,{ bytes:bytes.length, sha256:hash(bytes) }])),
  }
  files['provenance.json'] = Buffer.from(JSON.stringify(provenance,null,2) + '\n')
  return files
}

if (process.argv[1] && import.meta.url === pathToFileURL(await fs.realpath(process.argv[1])).href) {
  assert.ok(process.argv.slice(2).every(arg => arg === '--check'), 'Only --check is supported')
  const files = await bakeChapter4Assets(), check = process.argv.includes('--check')
  if (!check) await fs.mkdir(output, { recursive:true })
  for (const [name, bytes] of Object.entries(files)) {
    if (check) assert.ok(bytes.equals(await fs.readFile(new URL(name, output))), `${name} differs; regenerate and audit`)
    else await fs.writeFile(new URL(name, output), bytes)
  }
  if (check) assert.deepEqual((await fs.readdir(output)).sort(), Object.keys(files).sort(), 'Exact derived whitelist')
  console.log(JSON.stringify({ success:true, mode:check ? 'check' : 'generate', files:Object.keys(files) }))
}
