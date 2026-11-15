import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

// Offline extraction for this audited GLB only; no glTF runtime or dependency.
// Generate: node scripts/harbor/convert-pickup-asset.mjs
// Recompute and compare every output: node scripts/harbor/convert-pickup-asset.mjs --check
const root = new URL('../../', import.meta.url)
const sourcePath = 'assets/harbor/皮卡/皮卡.glb'
const output = new URL('assets/harbor/pickup-derived/', root)
const sourceHash = 'e4430419e53594ee317b0f3308cc6188aa74091e4975f8657cfcf52d04b4aa8f'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const sourceBounds = { min:[-.218994140625,0,-.499755859375], max:[.218994140625,.38037109375,.499755859375], size:[.43798828125,.38037109375,.99951171875] }
const channels = [
  { name:'position', type:'VEC3', componentType:5126, itemSize:3, count:8223, offset:0, bytes:98676, sha256:'8a868ff5e9ab432a6de9775648d13047557205a79f63ed0da745dd018076681c' },
  { name:'normal', type:'VEC3', componentType:5126, itemSize:3, count:8223, offset:98676, bytes:98676, sha256:'9b52ee6bfe4602c3f15c5a5fd7ad5d9bc66292f5afd186984f7472f69c2d21d5' },
  { name:'uv', type:'VEC2', componentType:5126, itemSize:2, count:8223, offset:197352, bytes:65784, sha256:'18726d5d4fcabe2bff5790d9b590cf2a503ac23443e0cfeb1e3dfc0eb48bf520' },
  { name:'index', type:'SCALAR', componentType:5123, itemSize:1, count:34935, offset:263136, bytes:69870, sha256:'8a0beb19c4b815102f608d124a22753500ca4230683ff63e614e29a503bc35d8' },
]

export function bakePickupAsset(sourceBytes) {
  assert.equal(hash(sourceBytes), sourceHash, 'Pickup source SHA-256 changed; stop and audit instead of accepting format drift')
  assert.equal(sourceBytes.length, 1462376)
  assert.equal(sourceBytes.readUInt32LE(0), 0x46546c67, 'GLB magic')
  assert.equal(sourceBytes.readUInt32LE(4), 2, 'GLB version')
  assert.equal(sourceBytes.readUInt32LE(8), sourceBytes.length)
  assert.equal(sourceBytes.readUInt32LE(16), 0x4e4f534a, 'First chunk is JSON')
  const jsonLength = sourceBytes.readUInt32LE(12), binHeader = 20 + jsonLength
  assert.equal(jsonLength % 4, 0)
  assert.equal(sourceBytes.readUInt32LE(binHeader + 4), 0x004e4942, 'Second chunk is BIN')
  const bin = sourceBytes.subarray(binHeader + 8)
  assert.equal(bin.length, sourceBytes.readUInt32LE(binHeader))
  const gltf = JSON.parse(sourceBytes.subarray(20, binHeader).toString('utf8'))
  assert.equal(gltf.asset.generator, 'Tripo'); assert.equal(gltf.asset.version, '2.0')
  assert.equal(gltf.scene, 0); assert.deepEqual(gltf.scenes, [{ name:'Scene', nodes:[0] }])
  assert.equal(gltf.nodes.length, 1)
  assert.deepEqual(gltf.nodes[0], { mesh:0, name:'tripo_node_316191c6-8a0f-4028-8dc3-381105e29d08' }, 'Identity source node only')
  for (const key of ['skins','animations','extensions','extensionsUsed','extensionsRequired']) assert.equal(gltf[key], undefined, `Unsupported ${key}`)
  assert.equal(gltf.meshes.length, 1)
  assert.deepEqual(gltf.meshes[0].primitives, [{ attributes:{ POSITION:0, NORMAL:1, TEXCOORD_0:2 }, indices:3, material:0 }], 'One indexed TRIANGLES primitive')
  assert.equal(gltf.materials.length, 1)
  const material = gltf.materials[0]
  assert.deepEqual(material, { doubleSided:true, name:'tripo_mat_316191c6-8a0f-4028-8dc3-381105e29d08',
    pbrMetallicRoughness:{ baseColorTexture:{ index:0 }, metallicFactor:0, roughnessFactor:.8999999761581421 } })
  assert.deepEqual(gltf.textures, [{ sampler:0, source:0 }])
  assert.deepEqual(gltf.samplers, [{ magFilter:9729, minFilter:9987 }])
  assert.deepEqual(gltf.images, [{ bufferView:4, mimeType:'image/jpeg', name:'tripo_image_316191c6-8a0f-4028-8dc3-381105e29d08_0_0' }])
  assert.deepEqual(gltf.buffers, [{ byteLength:1460580 }]); assert.equal(bin.length, 1460580)
  assert.equal(gltf.accessors.length, 4); assert.equal(gltf.bufferViews.length, 5)
  const attributes = {}, chunks = []
  for (const [i, channel] of channels.entries()) {
    const accessor = { bufferView:i, componentType:channel.componentType, count:channel.count, type:channel.type }
    if (i === 0) { accessor.min = sourceBounds.min; accessor.max = sourceBounds.max }
    assert.deepEqual(gltf.accessors[i], accessor, `Packed, non-sparse ${channel.name} only`)
    assert.deepEqual(gltf.bufferViews[i], { buffer:0, byteLength:channel.bytes, byteOffset:channel.offset, target:i === 3 ? 34963 : 34962 })
    const bytes = bin.subarray(channel.offset, channel.offset + channel.bytes)
    assert.equal(hash(bytes), channel.sha256, `Unchanged ${channel.name} bytes`)
    for (let offset = 0; offset < bytes.length; offset += i === 3 ? 2 : 4) {
      const value = i === 3 ? bytes.readUInt16LE(offset) : bytes.readFloatLE(offset)
      assert.ok(Number.isFinite(value), `Finite ${channel.name}`)
      if (i === 3) assert.ok(value < 8223, 'Index references an existing vertex')
    }
    attributes[channel.name] = { offset:channel.offset, length:channel.count * channel.itemSize, itemSize:channel.itemSize, componentType:channel.componentType }
    chunks.push(bytes)
  }
  const position = chunks[0], min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity]
  for (let offset = 0; offset < position.length; offset += 4) {
    const axis = offset / 4 % 3, value = position.readFloatLE(offset)
    min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value)
  }
  const bounds = { min, max, size:max.map((v,i) => v - min[i]) }
  assert.deepEqual(bounds, sourceBounds)
  assert.deepEqual(gltf.bufferViews[4], { buffer:0, byteLength:1127572, byteOffset:333008 })
  const jpeg = bin.subarray(333008, 1460580)
  assert.equal(hash(jpeg), '86a08667f76166983446e4b3b74b085ae28e3df9c09545703bd0bcbbd7a19b7f', 'Original JPEG bytes')
  const source = { path:sourcePath, sha256:sourceHash, bytes:sourceBytes.length, generator:gltf.asset.generator }
  const uniformScale = 5.2 / bounds.size[2], binary = Buffer.concat(chunks)
  const asset = { version:'1.0.0', source, bounds, uniformScale, meshName:gltf.meshes[0].name,
    material, sampler:{ ...gltf.samplers[0], wrapS:10497, wrapT:10497 }, attributes, data:binary.toString('base64') }
  const module = `// Generated from the user-supplied pickup GLB. Do not hand-edit; see provenance.json.\nexport const pickupAsset = ${JSON.stringify(asset)}\n`
  const provenance = {
    converter:{ script:'scripts/harbor/convert-pickup-asset.mjs', version:asset.version, dependencies:[],
      method:'Copy the audited packed Float32 POSITION/NORMAL/TEXCOORD_0 and Uint16 indices verbatim into base64 ESM; extract the embedded JPEG without decoding or re-encoding.' },
    source, sourceMetadata:gltf.asset,
    rights:{ notice:'NOTICE' },
    originalBounds:bounds, originalNode:gltf.nodes[0],
    transform:{ up:'+Y', front:'+Z', targetLengthMetres:5.2, uniformScale,
      mapping:'Original source coordinates and origin retained; root.scale.setScalar(uniformScale). No centering, rotation, nonuniform stretch or geometry remodeling.',
      boundsMetres:{ min:min.map(v => v * uniformScale), max:max.map(v => v * uniformScale), size:bounds.size.map(v => v * uniformScale) } },
    material, sampler:{ source:gltf.samplers[0], resolved:asset.sampler, defaults:'glTF omitted wrapS/wrapT resolve to REPEAT (10497).', flipY:false, colorSpace:'srgb' },
    encoding:'Little-endian original Float32 XYZ positions/normals, Float32 UV, Uint16 indices; no quantization, welding or normal recomputation.',
    output:{ module:{ path:'pickup.mesh.mjs', sha256:hash(module), bytes:Buffer.byteLength(module), binaryBytes:binary.length },
      texture:{ path:'pickup-basecolor.jpg', sha256:hash(jpeg), bytes:jpeg.length, mimeType:'image/jpeg', width:2048, height:2048 },
      attributes:channels, vertices:8223, triangles:34935 / 3 },
    integration:{ factory:'scripts/harbor/campaign-pickup-asset.mjs', model:'createPickupModel(g.THREE, pickupTexture)', texture:'await loadPickupTexture(g.THREE)',
      install:'campaign-m2 only: g.campaignAssets = { pickupTexture, createPickupModel } before constructing the environment.',
      serve:['/local/campaign-pickup-asset.mjs','/assets/harbor/pickup-derived/pickup.mesh.mjs','/assets/harbor/pickup-derived/pickup-basecolor.jpg'],
      mime:{ '.mjs':'text/javascript; charset=utf-8', '.jpg':'image/jpeg' },
      ownership:'Each model owns new geometry, buffers and material. Environment disposes these; texture is borrowed from the preloading owner and must not be disposed by the model/environment.',
      bounds:'root.userData.bounds is in original source units; root.userData.scale is the uniform metres conversion. Bounds are metadata, not a collision proxy.',
      collision:'Not generated. Environment owner fits physical parts after native in-game visual inspection; no enclosing vehicle AABB.' },
  }
  return { 'pickup.mesh.mjs':Buffer.from(module), 'pickup-basecolor.jpg':jpeg, 'provenance.json':Buffer.from(JSON.stringify(provenance,null,2) + '\n') }
}

if (process.argv[1] && import.meta.url === pathToFileURL(await fs.realpath(process.argv[1])).href) {
  assert.ok(process.argv.slice(2).every(arg => arg === '--check'), 'Only --check is supported')
  const files = bakePickupAsset(await fs.readFile(new URL(sourcePath, root)))
  const check = process.argv.includes('--check')
  if (!check) await fs.mkdir(output, { recursive:true })
  for (const [name, bytes] of Object.entries(files)) {
    const url = new URL(name, output)
    if (check) assert.ok(bytes.equals(await fs.readFile(url)), `${name} differs from reproducible extraction; regenerate and audit`)
    else await fs.writeFile(url, bytes)
  }
  console.log(JSON.stringify({ success:true, mode:check ? 'check' : 'generate', sourceSha256:sourceHash, vertices:8223, triangles:11645,
    outputs:Object.fromEntries(Object.entries(files).map(([name,bytes]) => [name,{ bytes:bytes.length, sha256:hash(bytes) }])) }, null, 2))
}
