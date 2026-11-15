import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { CH4_SOURCES, bakeChapter4Asset, bakeChapter4Assets } from './convert-ch4-assets.mjs'
import { loadChapter4Assets, createChapter4Asset } from './campaign-ch4-assets.mjs'
import { chapter4Assets } from '../../assets/harbor/ch4-static/ch4.mesh.mjs'

const root = new URL('../../', import.meta.url), derived = new URL('assets/harbor/ch4-static/', root)
const provenance = JSON.parse(await fs.readFile(new URL('provenance.json', derived)))
const { T } = await nativeFixture() // Native r180 only; no world, server or browser.
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const close = (a,b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`)
const kinds = ['console','server','gate']
const triangles = { console:10815, server:6097, gate:10065 }

function textureFixture({ failAt = Infinity } = {}) {
  const calls = [], objects = [], counts = []
  const track = resource => {
    const index = objects.length
    objects.push(resource); counts.push(0)
    resource.addEventListener('dispose', () => counts[index]++)
    return resource
  }
  const native = { ...T,
    BufferGeometry:class extends T.BufferGeometry { constructor() { super(); track(this) } },
    MeshStandardMaterial:class extends T.MeshStandardMaterial { constructor(options) { super(options); track(this) } },
    TextureLoader:class { async loadAsync(url) {
      calls.push(url)
      if (calls.length === failAt) throw Error('injected texture load failure')
      const expected = Object.values(chapter4Assets).flatMap(a => a.textures).find(t => url === `/assets/harbor/ch4-static/${t.path}`)
      assert.ok(expected, `Exact texture URL: ${url}`)
      const bytes = await fs.readFile(new URL(expected.path, derived))
      assert.equal(hash(bytes), expected.sha256)
      // This tests TextureLoader/PBR wiring, not browser JPEG decoding/upload.
      return track(new T.Texture({ width:expected.width, height:expected.height }))
    } },
  }
  return { native, calls, objects, counts }
}

test('all outputs are reproducible; source channels and all 3 JPEGs are byte-exact', async () => {
  const files = await bakeChapter4Assets()
  assert.deepEqual((await fs.readdir(derived)).sort(), Object.keys(files).sort())
  assert.equal(Object.keys(files).length, 5)
  for (const [name, bytes] of Object.entries(files)) assert.deepEqual(await fs.readFile(new URL(name, derived)), bytes, name)
  assert.deepEqual(Object.keys(chapter4Assets), kinds)
  for (const kind of kinds) {
    const spec = CH4_SOURCES[kind], source = await fs.readFile(new URL(spec.path, root))
    assert.equal(source.length, spec.bytes); assert.equal(hash(source), spec.sha256)
    const length = source.readUInt32LE(12), gltf = JSON.parse(source.subarray(20,20 + length)), bin = source.subarray(28 + length)
    const binary = Buffer.from(chapter4Assets[kind].data,'base64'), audit = provenance.models[kind]
    for (const [i, name] of ['position','normal','uv','index'].entries()) {
      const v = gltf.bufferViews[i], a = chapter4Assets[kind].attributes[name]
      const raw = bin.subarray(v.byteOffset,v.byteOffset + v.byteLength)
      assert.deepEqual(binary.subarray(a.offset,a.offset + v.byteLength),raw)
      assert.equal(hash(raw), audit.attributes[i].sha256)
    }
    for (const [i, texture] of audit.textures.entries()) {
      const v = gltf.bufferViews[gltf.images[i].bufferView], raw = bin.subarray(v.byteOffset,v.byteOffset + v.byteLength)
      assert.deepEqual(files[texture.path], raw)
      assert.equal(hash(raw), texture.sha256)
      assert.equal(texture.width, 2048); assert.equal(texture.height, 2048)
    }
    assert.equal(audit.cost.triangles, triangles[kind]); assert.equal(audit.cost.estimatedRGBA8MipBytes, 22369620)
    assert.deepEqual(audit.sourceMetadata, gltf.asset); assert.deepEqual(audit.originalNode, gltf.nodes[0])
    const changed = Buffer.from(source); changed[changed.length - 1] ^= 1
    assert.throws(() => bakeChapter4Asset(kind,changed), /SHA-256 changed/)
  }
  for (const [name, output] of Object.entries(provenance.outputs)) {
    assert.equal(files[name].length, output.bytes); assert.equal(hash(files[name]), output.sha256)
  }
  assert.equal(provenance.rights.notice, 'NOTICE')
})

test('native Groups have measured normalized bounds and preserve finite source geometry and PBR', async () => {
  const f = textureFixture(), resources = await loadChapter4Assets(f.native)
  try {
    assert.equal(f.calls.length, 3)
    for (const kind of kinds) {
      const group = createChapter4Asset(T,resources,kind), mesh = group.children[0], asset = chapter4Assets[kind]
      assert.ok(group instanceof T.Group); assert.equal(group.children.length, 1)
      assert.ok(mesh instanceof T.Mesh); assert.equal(mesh.geometry.index.count / 3, triangles[kind])
      const binary = Buffer.from(asset.data,'base64')
      for (const name of ['position','normal','uv','index']) {
        const a = name === 'index' ? mesh.geometry.index : mesh.geometry.attributes[name], expected = asset.attributes[name]
        const raw = Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)
        assert.ok(Array.from(a.array).every(Number.isFinite)); assert.equal(a.normalized, false)
        assert.deepEqual(raw, binary.subarray(expected.offset,expected.offset + raw.length))
      }
      for (const index of mesh.geometry.index.array) assert.ok(index < mesh.geometry.attributes.position.count)
      assert.ok(Number.isFinite(mesh.geometry.boundingSphere.radius))
      const box = new T.Box3().setFromObject(group,true), size = box.getSize(new T.Vector3())
      for (const [i, axis] of ['x','y','z'].entries()) {
        close(box.min[axis],group.userData.bounds.min[i]); close(box.max[axis],group.userData.bounds.max[i])
        close(size[axis],group.userData.bounds.size[i])
      }
      close(size.y,CH4_SOURCES[kind].height); close(box.min.y,0)
      close(mesh.scale.x,mesh.scale.y); close(mesh.scale.x,mesh.scale.z)
      assert.deepEqual(Array.from(group.position.toArray()), [0,0,0])
      assert.deepEqual(Array.from(group.scale.toArray()), [1,1,1])
      assert.deepEqual(group.userData.source, provenance.models[kind].source)
      const m = mesh.material
      assert.ok(m instanceof T.MeshStandardMaterial); assert.equal(m.color.getHex(), 0xffffff)
      assert.equal(m.metalness,0); assert.equal(m.roughness,0.8999999761581421); assert.equal(m.side,T.DoubleSide)
      assert.equal(m.map.colorSpace,T.SRGBColorSpace)
      assert.equal(m.normalMap,null); assert.equal(m.roughnessMap,null); assert.equal(m.metalnessMap,null)
      assert.equal(m.transparent,false); assert.equal(m.emissive.getHex(),0)
      assert.equal(mesh.castShadow,true); assert.equal(mesh.receiveShadow,true)
      const t = m.map
      assert.equal(t.flipY,false); assert.equal(t.magFilter,T.LinearFilter); assert.equal(t.minFilter,T.LinearMipmapLinearFilter)
      assert.equal(t.wrapS,T.RepeatWrapping); assert.equal(t.wrapT,T.RepeatWrapping); assert.equal(t.generateMipmaps,true)
      // Metadata stays local; the map author must transform collision/LOS boxes.
      group.position.set(7,5,-4); group.rotation.y = .7; group.updateMatrixWorld(true)
      const actualWorld = new T.Box3().setFromObject(group,true)
      const expectedWorld = box.clone().applyMatrix4(group.matrixWorld)
      // World AABB of a sparse mesh can be tighter than its transformed local AABB.
      assert.ok(expectedWorld.clone().expandByScalar(1e-10).containsBox(actualWorld))
      close(group.userData.bounds.min[1],0)
    }
  } finally { resources.dispose() }
  assert.ok(f.counts.every(n => n === 1))
})

test('instances share owned GPU resources; root metadata/placement remain independent; dispose is idempotent', async () => {
  const f = textureFixture(), resources = await loadChapter4Assets(f.native)
  const a = createChapter4Asset(T,resources,'console'), b = createChapter4Asset(T,resources,'console')
  assert.notEqual(a,b); assert.notEqual(a.children[0],b.children[0])
  assert.equal(a.children[0].geometry,b.children[0].geometry); assert.equal(a.children[0].material,b.children[0].material)
  a.userData.bounds.min[0] = -99; a.position.x = 11
  assert.equal(b.userData.bounds.min[0],chapter4Assets.console.bounds.min[0]); assert.equal(b.position.x,0)
  const scene = new T.Scene(); scene.add(a,b); a.removeFromParent(); b.removeFromParent()
  assert.ok(f.counts.every(n => n === 0), 'Removing a borrowed Group does not release shared GPU resources')
  assert.throws(() => createChapter4Asset(T,resources,'worker'), /Unknown CH4/)
  assert.throws(() => createChapter4Asset(T,resources,'toString'), /Unknown CH4/)
  assert.throws(() => createChapter4Asset(T,null,'console'), /must be loaded/)
  resources.dispose(); resources.dispose()
  assert.equal(resources.disposed,true); assert.equal(f.objects.length,9)
  assert.ok(f.counts.every(n => n === 1))
  assert.throws(() => createChapter4Asset(T,resources,'console'), /not disposed/)
})

test('partial texture failure releases prior textures, geometry and material without a browser', async () => {
  const f = textureFixture({ failAt:3 })
  await assert.rejects(loadChapter4Assets(f.native), /injected texture load failure/)
  assert.equal(f.calls.length,3); assert.equal(f.objects.length,7)
  assert.ok(f.counts.every(n => n === 1))
  await assert.rejects(loadChapter4Assets({ REVISION:'179' }), /original g.THREE r180/)
  assert.throws(() => createChapter4Asset({ REVISION:'179' },null,'console'), /original g.THREE r180/)
})
