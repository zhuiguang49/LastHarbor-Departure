import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { parse } from '@babel/parser'
import { createCampaignContainers } from './campaign-containers.mjs'

// Run the shipped Three, registered props, ob/By and physics without DOM boot.
// Only GPU-generated material maps and Canvas label rasters are stubbed; the
// container topology, metadata, shader source and collision code are original.
const bytes = fs.readFileSync(new URL('../../几猫国产3A大作_V1-fable5.2.html', import.meta.url))
assert.equal(createHash('sha256').update(bytes).digest('hex'), '9e55b5200b088adaf8e1152da04efc0d3b25e236e6baf2dee96f81e23e084966')
const html = bytes.toString(), source = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const body = parse(source).program.body[0].expression.callee.body.body
const boundary = body.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === 'gM'))
assert.ok(boundary, 'Original application boot boundary changed')
const prefix = body.filter(node => node.end <= boundary.start).map(node => source.slice(node.start, node.end)).join('\n')
const api = vm.runInNewContext(`(()=>{${prefix};return {THREE:lt,props:Yg,physics:d3,context:ob,merge:By,vertex:pA,shader:h3}})()`,
  { console, performance, AbortController }, { timeout: 15000 })
const T = api.THREE

function digest(geometry) {
  const hash = createHash('sha256')
  for (const attribute of [...Object.values(geometry.attributes), geometry.index].filter(Boolean)) {
    const array = attribute.array
    hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength))
  }
  return hash.digest('hex')
}

function fixture() {
  const materials = new Map(), sources = [], calls = [], textures = [new T.Texture()]
  const get = (name, options = {}) => {
    const key = name + JSON.stringify(options)
    if (!materials.has(key)) {
      const transparent = name.startsWith('label_') || name.startsWith('decal_')
      const material = new T.MeshStandardMaterial({ map: textures[0], vertexColors: !!options.vertexColors,
        transparent, depthWrite: !transparent })
      material.name = name
      material.onBeforeCompile = shader => api.shader(shader, {})
      material.customProgramCacheKey = () => `source-${name}`
      materials.set(key, material)
    }
    return materials.get(key)
  }
  const g = { THREE: T, scene: new T.Scene(), mats: { get,
    label: (text, options) => ({ material: get(`label_${text}`, options), aspect: Math.max(1, text.length * .55) }),
    decal: name => ({ material: get(`decal_${name}`), aspect: name.startsWith('logo_') ? 640 / 192 : 1 }),
  } }
  g.physics = api.physics(g)
  const props = api.props(g)
  g.props = { build(name, options) {
    calls.push({ name, ...options })
    const root = props.build(name, options)
    sources.push(root)
    return root
  } }
  return { g, sources, calls, materials, textures }
}

function sevenChunks(layer, scene) {
  return Array.from({ length: 7 }, (_, index) => {
    const from = -240 + index * 200 / 7, to = -240 + (index + 1) * 200 / 7
    const chunk = layer.createChunk({ index, from, to })
    scene.add(chunk.root)
    return chunk
  })
}

function meshes(root) {
  const result = []
  root.traverse(mesh => { if (mesh.isMesh) result.push(mesh) })
  return result
}

test('real native factory keeps standard dimensions and all five exposed faces with outward winding', () => {
  const world = fixture(), layer = createCampaignContainers(world.g)
  for (const template of world.sources) {
    assert.deepEqual(Array.from(template.userData.size), [12.19, 2.59, 2.44])
    assert.equal(template.userData.colliders.length, 1)
    assert.ok(meshes(template).reduce((n, mesh) => n + mesh.geometry.attributes.position.count, 0) > 1000)
    template.updateMatrixWorld(true)
    // The original closed factory omits the hidden underfloor/interior. Reuse
    // it as shipped; front/back/left/right/top must be real near-field surfaces.
    for (const [origin, direction, axis, value] of [
      [[0, 1.3, 4], [0, 0, -1], 'z', 1.219], [[0, 1.3, -4], [0, 0, 1], 'z', -1.219],
      [[9, 1.3, .4], [-1, 0, 0], 'x', 6.095], [[-9, 1.3, .4], [1, 0, 0], 'x', -6.095],
      [[0, 5, .4], [0, -1, 0], 'y', 2.59],
    ]) {
      const hits = new T.Raycaster(new T.Vector3(...origin), new T.Vector3(...direction)).intersectObject(template, true)
      assert.ok(hits.length, `Missing exposed ${axis}=${value} face`)
      assert.ok(Math.abs(hits[0].point[axis] - value) < .15)
      assert.ok(hits[0].face.normal.dot(new T.Vector3(...direction)) < 0)
    }
    for (const mesh of meshes(template)) {
      const count = mesh.geometry.attributes.position.count
      for (const name of ['position', 'normal', 'uv', ...mesh.material.vertexColors ? ['color'] : []]) {
        const attribute = mesh.geometry.attributes[name]
        assert.equal(attribute.count, count)
        assert.ok(attribute.array.every(Number.isFinite))
      }
      assert.equal(mesh.material.side, T.FrontSide)
    }
  }
  assert.match(api.vertex, /USE_INSTANCING[\s\S]*instanceMatrix \* slWP/)
  layer.dispose()
})

test('7 local instanced chunks place 28 full boxes beside the corridor with bounded factory variants', t => {
  const world = fixture(), layer = createCampaignContainers(world.g), chunks = sevenChunks(layer, world.g.scene)
  world.g.scene.updateMatrixWorld(true)
  assert.equal(world.calls.length, 3)
  assert.deepEqual(world.calls.map(call => [call.name, call.seed, call.color, call.wear, call.doors]), [
    ['container40', 0, 'teal', .5, 0], ['container40', 1, 'orange', .5, 0], ['container40', 2, 'grey', .5, 0],
  ])
  const snapshot = layer.snapshot()
  assert.equal(snapshot.containerCount, 28)
  assert.equal(snapshot.chunks.length, 7)
  assert.equal(world.g.physics.boxes.length, 28)
  t.diagnostic(JSON.stringify({ templates: snapshot.templateCount, geometries: snapshot.geometryCount,
    materials: snapshot.materialCount, containers: snapshot.containerCount,
    batchesPerChunk: snapshot.chunks.map(chunk => chunk.batchCount),
    submittedTriangles: chunks.reduce((sum, chunk) => sum + meshes(chunk.root).reduce((n, mesh) =>
      n + (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3 * mesh.count, 0), 0) }))
  for (const chunk of chunks) {
    const summary = chunk.snapshot()
    assert.equal(summary.containerCount, 4)
    assert.equal(summary.colliderCount, 4)
    assert.equal(summary.batchCount, world.sources[summary.index % 3].children.length)
    for (const mesh of meshes(chunk.root)) {
      assert.ok(mesh.isInstancedMesh)
      assert.equal(mesh.count, 4)
      assert.ok(mesh.frustumCulled)
      assert.ok(mesh.boundingBox && Number.isFinite(mesh.boundingSphere.radius))
      const bounds = mesh.boundingBox.clone().applyMatrix4(chunk.root.matrixWorld)
      assert.ok(bounds.min.x >= summary.from - .05 && bounds.max.x <= summary.to + .05)
      for (let i = 0; i < mesh.count; i++) {
        const matrix = new T.Matrix4()
        mesh.getMatrixAt(i, matrix)
        const box = new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position)
          .applyMatrix4(chunk.root.matrixWorld.clone().multiply(matrix))
        assert.ok(box.max.z < 2 || box.min.z > 14)
        const center = box.getCenter(new T.Vector3())
        assert.ok(mesh.boundingSphere.clone().applyMatrix4(chunk.root.matrixWorld).containsPoint(center))
      }
    }
    for (const box of chunk.colliders) {
      assert.ok(box.max.z < 2 || box.min.z > 14)
      assert.ok(Math.abs(box.max.x - box.min.x - 12.19) < 1e-8)
      assert.ok(Math.abs(box.max.y - box.min.y - 2.59) < 1e-8)
      assert.ok(Math.abs(box.max.z - box.min.z - 2.438) < 1e-8)
      assert.equal(box.surface, 'metal')
      assert.equal(box.tag, 'campaign-container')
      assert.ok(!box.noNav && !box.bulletOnly && !box.playerOnly)
    }
  }
  // Real ray/physics checks outside the original x=-40 boundary. Nav-domain
  // expansion belongs to the main AST integration and is not tested here.
  const p = chunks[0].snapshot().placements[0], physics = world.g.physics
  const hit = physics.raycast(new T.Vector3(p.x, 1.3, 1), new T.Vector3(0, 0, -1), 10)
  assert.equal(hit.surface, 'metal')
  assert.ok(chunks[0].colliders.includes(hit.box))
  const pos = new T.Vector3(p.x, 0, 1), velocity = new T.Vector3(0, 0, -5)
  assert.ok(physics.moveCapsule(pos, velocity, 1).hitWall)
  assert.ok(pos.z >= p.z + 1.219 + .32 - 1e-7)
  for (const z of [2.33, 8, 13.67]) {
    const walker = new T.Vector3(-238, 0, z), motion = new T.Vector3(5, 0, 0)
    const result = physics.moveCapsule(walker, motion, 39)
    assert.equal(result.hitWall, false)
    assert.ok(Math.abs(walker.x + 43) < 1e-7)
  }
  layer.dispose()
})

test('instances borrow untouched factory resources and disposal removes only their own handles/buffers', () => {
  const world = fixture(), layer = createCampaignContainers(world.g), resourceState = new Map()
  for (const source of world.sources) for (const mesh of meshes(source)) {
    resourceState.set(mesh.geometry, { hash: digest(mesh.geometry), box: mesh.geometry.boundingBox, sphere: mesh.geometry.boundingSphere })
    mesh.geometry.addEventListener('dispose', () => assert.fail('Disposed borrowed geometry'))
    mesh.material.addEventListener('dispose', () => assert.fail('Disposed borrowed material'))
  }
  for (const texture of world.textures) texture.addEventListener('dispose', () => assert.fail('Disposed borrowed texture'))
  const materialsBefore = [...world.materials.values()].map(material => material.toJSON())
  const unrelated = world.g.physics.addBox([10, 0, 10], [12, 2, 12])
  const chunks = sevenChunks(layer, world.g.scene), batches = chunks.flatMap(chunk => meshes(chunk.root))
  const counts = new Map(batches.map(mesh => [mesh, 0]))
  for (const mesh of batches) {
    mesh.addEventListener('dispose', () => counts.set(mesh, counts.get(mesh) + 1))
    assert.ok(resourceState.has(mesh.geometry))
    assert.ok([...world.materials.values()].includes(mesh.material))
  }
  chunks[0].root.visible = false
  assert.equal(chunks[0].colliders.length, 4, 'Visibility must not remove physical obstacles')
  chunks[0].dispose()
  chunks[0].dispose()
  assert.equal(world.g.physics.boxes.length, 25)
  const replacement = layer.createChunk({ index: 0, from: -240, to: -240 + 200 / 7 })
  assert.equal(world.calls.length, 3, 'Recreating a chunk must reuse cached templates')
  replacement.dispose()
  layer.dispose()
  layer.dispose()
  assert.equal(world.g.scene.children.length, 0)
  assert.equal(world.g.physics.boxes.length, 1)
  assert.equal(world.g.physics.boxes[0], unrelated)
  assert.equal(layer.snapshot().containerCount, 0)
  for (const count of counts.values()) assert.equal(count, 1)
  for (const [geometry, state] of resourceState) {
    assert.equal(digest(geometry), state.hash)
    assert.equal(geometry.boundingBox, state.box)
    assert.equal(geometry.boundingSphere, state.sphere)
  }
  assert.deepEqual([...world.materials.values()].map(material => material.toJSON()), materialsBefore)
  assert.throws(() => layer.createChunk({ index: 0, from: -240, to: -210 }), /disposed/)
})

test('native ob registration matches our handles; By bakes world transforms into new geometry', () => {
  const world = fixture(), layer = createCampaignContainers(world.g)
  const chunk = layer.createChunk({ index: 0, from: -240, to: -240 + 200 / 7 })
  const context = api.context(world.g), before = world.g.physics.boxes.length
  for (const p of chunk.snapshot().placements) {
    context.place(p.name, p.x, p.z, p.yaw, { seed: p.seed, color: p.color, wear: p.wear, doors: p.doors }, p.y)
  }
  const nativeBoxes = world.g.physics.boxes.slice(before)
  assert.equal(nativeBoxes.length, chunk.colliders.length)
  for (let i = 0; i < nativeBoxes.length; i++) {
    for (const side of ['min', 'max']) assert.ok(nativeBoxes[i][side].distanceTo(chunk.colliders[i][side]) < 1e-8)
    assert.equal(nativeBoxes[i].surface, chunk.colliders[i].surface)
  }
  const originalGeometries = new Set(meshes(context.staticRoot).map(mesh => mesh.geometry))
  const merged = api.merge(context.staticRoot)
  assert.equal(merged.position.length(), 0)
  assert.ok(meshes(merged).length < meshes(context.staticRoot).length)
  for (const mesh of meshes(merged)) {
    assert.ok(!originalGeometries.has(mesh.geometry))
    const bounds = new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position)
    assert.ok(bounds.max.x < -210 && bounds.min.x > -241)
    mesh.geometry.dispose()
  }
  layer.dispose()
})

test('rejects the native silent plain-box fallback rather than presenting it as a complete container', () => {
  const world = fixture()
  world.g.props.build = () => {
    const root = new T.Group()
    root.userData.size = [12.19, 2.59, 2.44]
    return root
  }
  assert.throws(() => createCampaignContainers(world.g), /complete original container40/)
})

test('M1 cardinal batches share M0 templates and match native transformed colliders/rays', () => {
  const world = fixture(), layer = createCampaignContainers(world.g)
  const chunk = layer.createInstances({ id: 'yard:0:1', placements: [
    { x: -134, z: -240, yaw: Math.PI / 2, variant: 2 },
    { x: -134, y: 2.59, z: -240, yaw: -Math.PI / 2, variant: 0 },
    { x: -110, z: -275, yaw: Math.PI, variant: 1 },
  ] })
  world.g.scene.add(chunk.root)
  world.g.scene.updateMatrixWorld(true)
  assert.equal(world.calls.length, 3)
  const summary = chunk.snapshot(), context = api.context(world.g), before = world.g.physics.boxes.length
  for (const p of summary.placements) context.place(p.name, p.x, p.z, p.yaw, { seed: p.seed, color: p.color, wear: p.wear, doors: p.doors }, p.y)
  const native = world.g.physics.boxes.slice(before)
  assert.equal(native.length, 3)
  for (let i = 0; i < native.length; i++) for (const side of ['min', 'max']) {
    assert.ok(native[i][side].distanceTo(chunk.colliders[i][side]) < 1e-8)
  }
  // Avoid testing an ambiguous ray tie against the comparison's duplicate boxes.
  for (const box of native) world.g.physics.removeBox(box)
  const hit = world.g.physics.raycast(new T.Vector3(-120, 1.3, -240), new T.Vector3(-1, 0, 0), 20)
  assert.equal(hit.surface, 'metal')
  assert.equal(hit.box, chunk.colliders[0])
  const nativeHits = new T.Raycaster(new T.Vector3(-120, 1.3, -240), new T.Vector3(-1, 0, 0)).intersectObject(context.staticRoot, true)
  const instanceHits = new T.Raycaster(new T.Vector3(-120, 1.3, -240), new T.Vector3(-1, 0, 0)).intersectObject(chunk.root, true)
  assert.ok(nativeHits.length && instanceHits.length)
  assert.ok(nativeHits[0].point.distanceTo(instanceHits[0].point) < 1e-7)
  chunk.dispose()
  const replacement = layer.createInstances({ id: 'yard:0:1', placements: [{ x: -134, z: -240 }] })
  assert.equal(world.calls.length, 6, 'Only the three explicit native comparison calls build extra sources')
  assert.equal(replacement.snapshot().containerCount, 1)
  layer.dispose()
})

test('M1 batches reject invalid coordinates, variants, noncardinal yaw and duplicate ids before adding colliders', () => {
  const world = fixture(), layer = createCampaignContainers(world.g)
  for (const placements of [[], [{ x: NaN, z: 0 }], [{ x: 0, z: 0, variant: 3 }], [{ x: 0, z: 0, yaw: .1 }]]) {
    assert.throws(() => layer.createInstances({ id: 'invalid', placements }), /requires placements|require finite cardinal/)
  }
  assert.equal(world.g.physics.boxes.length, 0)
  layer.createInstances({ id: 'one', placements: [{ x: 0, z: -240 }] })
  assert.throws(() => layer.createInstances({ id: 'one', placements: [{ x: 0, z: -240 }] }), /duplicate/)
  layer.dispose()
  assert.throws(() => layer.createInstances({ id: 'two', placements: [{ x: 0, z: -240 }] }), /disposed/)
})
