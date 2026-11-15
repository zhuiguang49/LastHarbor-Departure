import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { bakePickupAsset } from './convert-pickup-asset.mjs'
import { createPickupModel, loadPickupTexture } from './campaign-pickup-asset.mjs'
import { pickupAsset } from '../../assets/harbor/pickup-derived/pickup.mesh.mjs'

const root = new URL('../../', import.meta.url)
const sourcePath = 'assets/harbor/皮卡/皮卡.glb'
const derivedPath = 'assets/harbor/pickup-derived/'
const converterPath = 'scripts/harbor/convert-pickup-asset.mjs'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const source = await fs.readFile(new URL(sourcePath, root))
const jsonLength = source.readUInt32LE(12)
const gltf = JSON.parse(source.subarray(20, 20 + jsonLength).toString())
const bin = source.subarray(28 + jsonLength)
const view = index => {
  const v = gltf.bufferViews[index]
  return bin.subarray(v.byteOffset, v.byteOffset + v.byteLength)
}
const provenance = JSON.parse(await fs.readFile(new URL(derivedPath + 'provenance.json', root)))
const { T } = await nativeFixture()

test('pickup extraction is byte-exact and provenance is reproducible from the locked source', async () => {
  assert.equal(source.length, 1462376)
  assert.equal(hash(source), 'e4430419e53594ee317b0f3308cc6188aa74091e4975f8657cfcf52d04b4aa8f')
  const regenerated = bakePickupAsset(source)
  for (const [name, bytes] of Object.entries(regenerated)) assert.deepEqual(await fs.readFile(new URL(derivedPath + name, root)), bytes, name)
  const binary = Buffer.from(pickupAsset.data, 'base64')
  for (const [i, name] of ['position','normal','uv','index'].entries()) {
    const channel = pickupAsset.attributes[name]
    assert.deepEqual(binary.subarray(channel.offset, channel.offset + view(i).length), view(i), name)
    assert.equal(hash(view(i)), provenance.output.attributes[i].sha256)
  }
  const jpeg = await fs.readFile(new URL(derivedPath + 'pickup-basecolor.jpg', root))
  assert.deepEqual(jpeg, view(gltf.images[0].bufferView))
  assert.equal(jpeg.length, 1127572)
  assert.equal(hash(jpeg), '86a08667f76166983446e4b3b74b085ae28e3df9c09545703bd0bcbbd7a19b7f')
  assert.equal(jpeg.readUInt16BE(0), 0xffd8); assert.equal(jpeg.readUInt16BE(jpeg.length - 2), 0xffd9)
  assert.equal(hash(regenerated['pickup.mesh.mjs']), provenance.output.module.sha256)
  assert.equal(hash(jpeg), provenance.output.texture.sha256)
  assert.deepEqual(provenance.sourceMetadata, gltf.asset)
  assert.equal(JSON.parse(provenance.sourceMetadata.extras.AIGC).ProduceID, '316191c6-8a0f-4028-8dc3-381105e29d08')
  assert.equal(provenance.rights.notice, 'NOTICE')
})

test('native Three pickup preserves finite geometry, source material and uniform 5.2m length', () => {
  assert.equal(T.REVISION, '180')
  const texture = new T.Texture(), model = createPickupModel(T, texture)
  assert.ok(model instanceof T.Group); assert.equal(model.children.length, 1)
  const mesh = model.children[0], geometry = mesh.geometry, material = mesh.material
  assert.ok(mesh instanceof T.Mesh); assert.ok(geometry instanceof T.BufferGeometry)
  for (const [i, name] of ['position','normal','uv','index'].entries()) {
    const attribute = name === 'index' ? geometry.index : geometry.attributes[name]
    const array = attribute.array
    assert.deepEqual(Buffer.from(array.buffer, array.byteOffset, array.byteLength), view(i), `Native ${name} bytes`)
    assert.ok(Array.from(array).every(Number.isFinite), `Finite ${name}`)
    assert.equal(attribute.normalized, false)
  }
  assert.equal(geometry.attributes.position.count, 8223)
  assert.equal(geometry.attributes.normal.count, 8223); assert.equal(geometry.attributes.uv.count, 8223)
  assert.equal(geometry.index.count / 3, 11645)
  for (const index of geometry.index.array) assert.ok(index >= 0 && index < 8223)
  assert.deepEqual(Array.from(geometry.boundingBox.min.toArray()), gltf.accessors[0].min)
  assert.deepEqual(Array.from(geometry.boundingBox.max.toArray()), gltf.accessors[0].max)
  assert.ok(Number.isFinite(geometry.boundingSphere.radius) && geometry.boundingSphere.radius > 0)
  assert.ok(material instanceof T.MeshStandardMaterial)
  assert.equal(material.name, gltf.materials[0].name); assert.equal(material.map, texture)
  assert.equal(material.color.getHex(), 0xffffff); assert.equal(material.emissive.getHex(), 0)
  assert.equal(material.metalness, 0); assert.equal(material.roughness, .8999999761581421)
  assert.equal(material.side, T.DoubleSide); assert.equal(material.opacity, 1)
  assert.equal(material.transparent, false); assert.equal(material.alphaTest, 0); assert.equal(material.vertexColors, false)
  for (const object of [model,mesh]) { assert.equal(object.castShadow, true); assert.equal(object.receiveShadow, true) }
  const scale = 5.2 / .99951171875
  assert.deepEqual(Array.from(model.scale.toArray()), [scale,scale,scale])
  assert.deepEqual(Array.from(mesh.scale.toArray()), [1,1,1])
  assert.deepEqual(Array.from(model.position.toArray()), [0,0,0])
  assert.deepEqual(Array.from(model.quaternion.toArray()), [0,0,0,1])
  const box = new T.Box3().setFromObject(model), size = box.getSize(new T.Vector3())
  assert.ok(Math.abs(size.z - 5.2) < 1e-12)
  for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(size.getComponent(axis) - pickupAsset.bounds.size[axis] * scale) < 1e-12)
  assert.equal(box.min.y, 0, 'Original grounded origin retained')
  assert.deepEqual(model.userData.source, provenance.source)
  assert.deepEqual(model.userData.bounds, provenance.originalBounds); assert.equal(model.userData.scale, scale)
  mesh.geometry.dispose(); mesh.material.dispose()
})

test('instances own independent geometry/material and borrow the shared texture through disposal', () => {
  const texture = new T.Texture(), first = createPickupModel(T, texture), second = createPickupModel(T, texture)
  const a = first.children[0], b = second.children[0]
  let textureDisposals = 0, geometryDisposals = 0, materialDisposals = 0
  texture.addEventListener('dispose', () => textureDisposals++)
  b.geometry.addEventListener('dispose', () => geometryDisposals++)
  b.material.addEventListener('dispose', () => materialDisposals++)
  assert.notEqual(a.geometry, b.geometry); assert.notEqual(a.material, b.material)
  assert.equal(a.material.map, texture); assert.equal(b.material.map, texture)
  for (const name of ['position','normal','uv','index']) {
    const aa = name === 'index' ? a.geometry.index : a.geometry.attributes[name]
    const ba = name === 'index' ? b.geometry.index : b.geometry.attributes[name]
    assert.notEqual(aa.array.buffer, ba.array.buffer)
    const original = ba.array[0]
    aa.array[0] = original + 1
    assert.equal(ba.array[0], original)
  }
  first.userData.bounds.min[0] = -99; first.userData.source.sha256 = 'changed'
  assert.equal(second.userData.bounds.min[0], -.218994140625)
  assert.equal(second.userData.source.sha256, provenance.source.sha256)
  a.material.roughness = .1
  assert.equal(b.material.roughness, .8999999761581421)
  // Same ownership operation the environment must perform; no map traversal.
  for (const model of [first,second]) model.traverse(object => {
    object.geometry?.dispose(); object.material?.dispose()
  })
  assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1); assert.equal(textureDisposals, 0)
  texture.dispose(); assert.equal(textureDisposals, 1, 'Only the preload owner releases the texture')
  assert.throws(() => createPickupModel(T), /preloaded base-color texture/)
})

test('texture loader uses explicit route and GLB sampler/sRGB/flipY settings without DOM', async () => {
  const texture = new T.Texture(), calls = []
  class Loader extends T.TextureLoader {
    load(url, onLoad) { calls.push(url); onLoad(texture); return texture }
  }
  const loaded = await loadPickupTexture({ ...T, TextureLoader:Loader })
  assert.equal(loaded, texture)
  assert.deepEqual(calls, ['/assets/harbor/pickup-derived/pickup-basecolor.jpg'])
  assert.equal(loaded.flipY, false); assert.equal(loaded.colorSpace, T.SRGBColorSpace)
  assert.equal(loaded.magFilter, T.LinearFilter); assert.equal(loaded.minFilter, T.LinearMipmapLinearFilter)
  assert.equal(loaded.wrapS, T.RepeatWrapping); assert.equal(loaded.wrapT, T.RepeatWrapping)
  assert.equal(loaded.generateMipmaps, true)
  const error = new Error('JPEG unavailable')
  class FailedLoader extends T.TextureLoader {
    load(url, onLoad, onProgress, onError) { onError(error) }
  }
  await assert.rejects(loadPickupTexture({ ...T, TextureLoader:FailedLoader }), caught => caught === error)
  texture.dispose()
})

test('source drift and --check output/provenance tampering fail without rewriting files', async () => {
  const changed = Buffer.from(source); changed[16] ^= 1
  assert.throws(() => bakePickupAsset(changed), /source SHA-256 changed/)
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'harbor-pickup-check-'))
  try {
    for (const relative of [sourcePath,converterPath,...['pickup.mesh.mjs','pickup-basecolor.jpg','provenance.json'].map(name => derivedPath + name)]) {
      const destination = path.join(directory, relative)
      await fs.mkdir(path.dirname(destination), { recursive:true })
      await fs.copyFile(new URL(relative, root), destination)
    }
    const check = () => spawnSync(process.execPath, [path.join(directory, converterPath),'--check'], { encoding:'utf8' })
    const initial = check(); assert.equal(initial.status, 0, initial.stderr)
    for (const name of ['pickup.mesh.mjs','pickup-basecolor.jpg','provenance.json']) {
      const file = path.join(directory, derivedPath, name), original = await fs.readFile(file)
      const modified = Buffer.from(original); modified[modified.length - 1] ^= 1
      await fs.writeFile(file, modified)
      const result = check()
      assert.notEqual(result.status, 0); assert.match(result.stderr, /differs from reproducible extraction/)
      assert.deepEqual(await fs.readFile(file), modified, '--check must not repair or overwrite tampered output')
      await fs.writeFile(file, original)
    }
    await fs.writeFile(path.join(directory, sourcePath), changed)
    const drift = check(); assert.notEqual(drift.status, 0); assert.match(drift.stderr, /source SHA-256 changed/)
    assert.deepEqual(await fs.readFile(path.join(directory, sourcePath)), changed, '--check never writes the source')
  } finally { await fs.rm(directory, { recursive:true, force:true }) }
})
