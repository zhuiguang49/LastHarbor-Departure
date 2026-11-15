import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

// Offline extraction of these four hash-bound, uncompressed static GLBs only.
const root = new URL('../../', import.meta.url)
const output = new URL('assets/harbor/ch3-derived/', root)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
export const CH3_SOURCES = Object.freeze({
  cover:{ path:'assets/harbor/掩体/掩体.glb', bytes:1501236, sha256:'1a39f4c25934a18a9e46c95d86121b1ac04131cb24361492e8070fc2ad8569f2', width:4, height:1.4 },
  workbench:{ path:'assets/harbor/许工维修工作台/许工维修工作台.glb', bytes:1890984, sha256:'f851f84ced9ae84b71b8cd47da39204cd1142f9ac171ebbe4800bbafdd3bf316', width:2.2 },
  observation:{ path:'assets/harbor/狙击瞭望台/狙击瞭望台.glb', bytes:1697732, sha256:'585e3fb5632b02bae42df32fa6b9163cfed7b4f8c0c81c3414b9b8882db90493', width:3 },
  sign:{ path:'assets/harbor/封锁告示牌/封锁告示牌.glb', bytes:2171072, sha256:'5f755aa3e668e07bc1069e32647e5191501a125a9f906f06ce4b124820fbec38', width:1.5 },
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

export function bakeChapter3Asset(kind, bytes) {
  const spec = CH3_SOURCES[kind]
  assert.ok(spec, 'Unknown CH3 static kind')
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
  assert.deepEqual(Object.keys(node).sort(), ['mesh','name','translation'])
  assert.equal(node.mesh, 0); assert.equal(node.translation.length, 3); assert.ok(node.translation.every(Number.isFinite))
  assert.equal(gltf.meshes.length, 1)
  assert.deepEqual(gltf.meshes[0].primitives, [{ attributes:{ POSITION:0, NORMAL:1, TEXCOORD_0:2 }, indices:3, material:0 }])
  assert.equal(gltf.materials.length, 1)
  const material = gltf.materials[0]
  assert.deepEqual(material, { name:material.name, normalTexture:{ index:0 },
    pbrMetallicRoughness:{ baseColorTexture:{ index:1 }, metallicRoughnessTexture:{ index:2 } } })
  assert.deepEqual(gltf.textures, [0,1,2].map(source => ({ sampler:0, source })))
  assert.deepEqual(gltf.samplers, [{ magFilter:9729, minFilter:9987 }])
  assert.equal(gltf.buffers.length, 1); assert.equal(gltf.buffers[0].uri, undefined)
  assert.equal(gltf.buffers[0].byteLength, bin.length)
  assert.equal(gltf.accessors.length, 4); assert.equal(gltf.bufferViews.length, 7); assert.equal(gltf.images.length, 3)
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
  const size = max.map((v,i) => v - min[i]), widthAxis = kind === 'sign' ? 2 : 0
  assert.ok(size.every(v => v > 0))
  const uniformScale = spec.width / size[widthAxis], scale = [uniformScale,spec.height ? spec.height / size[1] : uniformScale,uniformScale]
  const yaw = kind === 'sign' ? Math.PI / 2 : 0
  const center = min.map((v,i) => i === 1 ? v : (v + max[i]) / 2)
  const sourceOffset = center.map((v,i) => -v * scale[i])
  const translation = yaw ? [sourceOffset[2],sourceOffset[1],-sourceOffset[0]] : sourceOffset
  const finalSize = yaw ? [size[2] * scale[2],size[1] * scale[1],size[0] * scale[0]] : size.map((v,i) => v * scale[i])
  const bounds = { min:[-finalSize[0]/2,0,-finalSize[2]/2], max:[finalSize[0]/2,finalSize[1],finalSize[2]/2], size:finalSize }
  const files = {}, textures = []
  for (const [i, role] of ['normal','basecolor','metallic-roughness'].entries()) {
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
  const transform = { scale, yawRadians:yaw, translation, up:'+Y', widthAxis:'+X', origin:'bottom-center',
    method:kind === 'cover' ? 'XZ uniformly scaled to 4m width; Y independently scaled to 1.4m height.' : 'Uniform scale to target width; sign yaw +90 degrees so source Z width becomes X.',
    sourceNodeTranslation:'Recorded but removed by bottom-centering; no source transform is applied twice.' }
  const asset = { source, meshName:gltf.meshes[0].name, material, attributes, transform, bounds, textures, data:binary.toString('base64') }
  const audit = { source, sourceMetadata:gltf.asset, originalNode:node, originalBounds:{ min, max, size }, transform, boundsMetres:bounds,
    material, sampler:{ magFilter:9729, minFilter:9987, wrapS:10497, wrapT:10497, flipY:false }, attributes:attributeAudit, textures,
    cost:{ vertices:gltf.accessors[0].count, triangles:gltf.accessors[3].count / 3, geometryBytes:binary.length,
      textureJPEGBytes:textures.reduce((n,t) => n + t.bytes, 0), estimatedRGBA8MipBytes:textures.reduce((n,t) => n + t.estimatedRGBA8MipBytes, 0), drawCallsPerInstance:1 } }
  return { asset, audit, files }
}

export async function bakeChapter3Assets() {
  const assets = {}, models = {}, files = {}
  for (const [kind, spec] of Object.entries(CH3_SOURCES)) {
    const baked = bakeChapter3Asset(kind, await fs.readFile(new URL(spec.path, root)))
    assets[kind] = baked.asset; models[kind] = baked.audit; Object.assign(files, baked.files)
  }
  const module = `// Generated from four user-supplied CH3 static GLBs. Do not hand-edit; see provenance.json.\nexport const chapter3Assets = ${JSON.stringify(assets)}\n`
  files['ch3.mesh.mjs'] = Buffer.from(module)
  const provenance = {
    converter:{ script:'scripts/harbor/convert-ch3-assets.mjs', version:'1.0.0', dependencies:[],
      method:'Copy source Float32 POSITION/NORMAL/UV and Uint16 index bytes into ESM base64; extract all embedded JPEGs without re-encoding. Apply transforms only at runtime.' },
    rights:{ notice:'NOTICE' },
    models, outputs:Object.fromEntries(Object.entries(files).map(([path,bytes]) => [path,{ bytes:bytes.length, sha256:hash(bytes) }])),
  }
  files['provenance.json'] = Buffer.from(JSON.stringify(provenance,null,2) + '\n')
  return files
}

if (process.argv[1] && import.meta.url === pathToFileURL(await fs.realpath(process.argv[1])).href) {
  assert.ok(process.argv.slice(2).every(arg => arg === '--check'), 'Only --check is supported')
  const files = await bakeChapter3Assets(), check = process.argv.includes('--check')
  if (!check) await fs.mkdir(output, { recursive:true })
  for (const [name, bytes] of Object.entries(files)) {
    if (check) assert.ok(bytes.equals(await fs.readFile(new URL(name, output))), `${name} differs; regenerate and audit`)
    else await fs.writeFile(new URL(name, output), bytes)
  }
  if (check) assert.deepEqual((await fs.readdir(output)).sort(), Object.keys(files).sort(), 'Exact derived whitelist')
  console.log(JSON.stringify({ success:true, mode:check ? 'check' : 'generate', files:Object.keys(files) }))
}
