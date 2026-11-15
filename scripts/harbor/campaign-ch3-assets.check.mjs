import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { CH3_SOURCES, bakeChapter3Asset, bakeChapter3Assets } from './convert-ch3-assets.mjs'
import { loadChapter3Assets, createChapter3Asset } from './campaign-ch3-assets.mjs'
import { chapter3Assets } from '../../assets/harbor/ch3-derived/ch3.mesh.mjs'

const root = new URL('../../', import.meta.url), derived = new URL('assets/harbor/ch3-derived/', root)
const provenance = JSON.parse(await fs.readFile(new URL('provenance.json', derived)))
const { T } = await nativeFixture() // Native r180 only; no world, server or browser.
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const close = (a,b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`)
const kinds = ['cover','workbench','observation','sign']
const triangles = { cover:3962, workbench:5957, observation:3967, sign:3970 }

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
      const expected = Object.values(chapter3Assets).flatMap(a => a.textures).find(t => url === `/assets/harbor/ch3-derived/${t.path}`)
      assert.ok(expected, `Exact texture URL: ${url}`)
      const bytes = await fs.readFile(new URL(expected.path, derived))
      assert.equal(hash(bytes), expected.sha256)
      // This tests TextureLoader/PBR wiring, not browser JPEG decoding/upload.
      return track(new T.Texture({ width:expected.width, height:expected.height }))
    } },
  }
  return { native, calls, objects, counts }
}

test('all outputs are reproducible; source channels and all 12 JPEGs are byte-exact', async () => {
  const files = await bakeChapter3Assets()
  assert.deepEqual((await fs.readdir(derived)).sort(), Object.keys(files).sort())
  assert.equal(Object.keys(files).length, 14)
  for (const [name, bytes] of Object.entries(files)) assert.deepEqual(await fs.readFile(new URL(name, derived)), bytes, name)
  assert.deepEqual(Object.keys(chapter3Assets), kinds)
  for (const kind of kinds) {
    const spec = CH3_SOURCES[kind], source = await fs.readFile(new URL(spec.path, root))
    assert.equal(source.length, spec.bytes); assert.equal(hash(source), spec.sha256)
    const length = source.readUInt32LE(12), gltf = JSON.parse(source.subarray(20,20 + length)), bin = source.subarray(28 + length)
    const binary = Buffer.from(chapter3Assets[kind].data,'base64'), audit = provenance.models[kind]
    for (const [i, name] of ['position','normal','uv','index'].entries()) {
      const v = gltf.bufferViews[i], a = chapter3Assets[kind].attributes[name]
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
    assert.equal(audit.cost.triangles, triangles[kind]); assert.equal(audit.cost.estimatedRGBA8MipBytes, 67108860)
    assert.deepEqual(audit.sourceMetadata, gltf.asset); assert.deepEqual(audit.originalNode, gltf.nodes[0])
    const changed = Buffer.from(source); changed[changed.length - 1] ^= 1
    assert.throws(() => bakeChapter3Asset(kind,changed), /SHA-256 changed/)
  }
  for (const [name, output] of Object.entries(provenance.outputs)) {
    assert.equal(files[name].length, output.bytes); assert.equal(hash(files[name]), output.sha256)
  }
  assert.equal(provenance.rights.notice, 'NOTICE')
})

test('native Groups have measured normalized bounds and preserve finite source geometry and PBR', async () => {
  const f = textureFixture(), resources = await loadChapter3Assets(f.native)
  try {
    assert.equal(f.calls.length, 12)
    for (const kind of kinds) {
      const group = createChapter3Asset(T,resources,kind), mesh = group.children[0], asset = chapter3Assets[kind]
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
      close(size.x,CH3_SOURCES[kind].width); close(box.min.y,0)
      if (kind === 'cover') close(size.y,1.4)
      else close(mesh.scale.x,mesh.scale.y)
      assert.deepEqual(Array.from(group.position.toArray()), [0,0,0])
      assert.deepEqual(Array.from(group.scale.toArray()), [1,1,1])
      assert.deepEqual(group.userData.source, provenance.models[kind].source)
      const m = mesh.material
      assert.ok(m instanceof T.MeshStandardMaterial); assert.equal(m.color.getHex(), 0xffffff)
      assert.equal(m.metalness,1); assert.equal(m.roughness,1); assert.equal(m.side,T.FrontSide)
      assert.equal(m.map.colorSpace,T.SRGBColorSpace); assert.equal(m.normalMap.colorSpace,T.NoColorSpace)
      assert.equal(m.roughnessMap.colorSpace,T.NoColorSpace); assert.equal(m.roughnessMap,m.metalnessMap)
      assert.equal(m.normalScale.x,1); assert.equal(m.normalScale.y,1); assert.equal(m.transparent,false)
      assert.equal(m.emissive.getHex(),0); assert.equal(mesh.castShadow,true); assert.equal(mesh.receiveShadow,true)
      for (const t of [m.map,m.normalMap,m.roughnessMap]) {
        assert.equal(t.flipY,false); assert.equal(t.magFilter,T.LinearFilter); assert.equal(t.minFilter,T.LinearMipmapLinearFilter)
        assert.equal(t.wrapS,T.RepeatWrapping); assert.equal(t.wrapT,T.RepeatWrapping); assert.equal(t.generateMipmaps,true)
      }
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
  const f = textureFixture(), resources = await loadChapter3Assets(f.native)
  const a = createChapter3Asset(T,resources,'cover'), b = createChapter3Asset(T,resources,'cover')
  assert.notEqual(a,b); assert.notEqual(a.children[0],b.children[0])
  assert.equal(a.children[0].geometry,b.children[0].geometry); assert.equal(a.children[0].material,b.children[0].material)
  a.userData.bounds.min[0] = -99; a.position.x = 11
  assert.equal(b.userData.bounds.min[0],-2); assert.equal(b.position.x,0)
  const scene = new T.Scene(); scene.add(a,b); a.removeFromParent(); b.removeFromParent()
  assert.ok(f.counts.every(n => n === 0), 'Removing a borrowed Group does not release shared GPU resources')
  assert.throws(() => createChapter3Asset(T,resources,'worker'), /Unknown CH3/)
  assert.throws(() => createChapter3Asset(T,resources,'toString'), /Unknown CH3/)
  assert.throws(() => createChapter3Asset(T,null,'cover'), /must be loaded/)
  resources.dispose(); resources.dispose()
  assert.equal(resources.disposed,true); assert.equal(f.objects.length,20)
  assert.ok(f.counts.every(n => n === 1))
  assert.throws(() => createChapter3Asset(T,resources,'cover'), /not disposed/)
})

test('partial texture failure releases prior textures, geometry and material without a browser', async () => {
  const f = textureFixture({ failAt:5 })
  await assert.rejects(loadChapter3Assets(f.native), /injected texture load failure/)
  assert.equal(f.calls.length,5); assert.equal(f.objects.length,7)
  assert.ok(f.counts.every(n => n === 1))
  await assert.rejects(loadChapter3Assets({ REVISION:'179' }), /original g.THREE r180/)
  assert.throws(() => createChapter3Asset({ REVISION:'179' },null,'cover'), /original g.THREE r180/)
})
