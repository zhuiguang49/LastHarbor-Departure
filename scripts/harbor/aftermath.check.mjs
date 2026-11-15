import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { parse } from '@babel/parser'
import { buildRobotWreck } from './aftermath-robots.mjs'
import { createCasualties } from './aftermath-casualties.mjs'
import { createAftermathProps } from './aftermath-props.mjs'
import { createAftermathDecals } from './aftermath-decals.mjs'
import { AFTERMATH_SIGNAGE, createAftermathSignage } from './aftermath-signage.mjs'
import { installAftermath } from './aftermath.mjs'

// Evaluate the shipped Three and visual factories, stopping before DOM boot.
// Read the production adapter itself so this fixture cannot silently diverge.
const bytes = fs.readFileSync(new URL('../../几猫国产3A大作_V1-fable5.2.html', import.meta.url))
assert.equal(createHash('sha256').update(bytes).digest('hex'), '9e55b5200b088adaf8e1152da04efc0d3b25e236e6baf2dee96f81e23e084966')
const html = bytes.toString(), source = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const body = parse(source).program.body[0].expression.callee.body.body
const boundary = body.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === 'gM'))
assert.ok(boundary, 'Original application boot boundary changed')
const build = fs.readFileSync(new URL('./build-night.mjs', import.meta.url), 'utf8'), adapters = []
function findAdapter(node) {
  if (!node || typeof node !== 'object') return
  if (node.type === 'ObjectExpression' && node.properties.some(property => property.key?.name === 'name' && property.value?.value === 'aftermath.visualFactory')) {
    adapters.push(node.properties.find(property => property.key?.name === 'value')?.value?.value)
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(findAdapter)
    else if (value && typeof value === 'object') findAdapter(value)
  }
}
findAdapter(parse(build, { sourceType: 'module' }))
assert.equal(adapters.length, 1, 'Expected one production robot visual adapter')
assert.equal(typeof adapters[0], 'string')
const prefix = body.filter(node => node.end <= boundary.start).map(node => source.slice(node.start, node.end)).join('\n')
const api = vm.runInNewContext(`(()=>{${prefix};return ((t)=>{${adapters[0]};return {THREE:lt,robotVisuals:t.robotVisuals,cloneCachedProp:wf,containerParts:(g,seed,doors,wear)=>zA(g,'container20',seed,doors,wear)}})({})})()`,
  { console, performance, AbortController, window: {} }, { timeout: 15000 })
const T = api.THREE

function fixture() {
  const sharedTexture = new T.Texture(), cached = new Map(), definitions = []
  const forbid = name => () => assert.fail(`Static art accessed ${name}`)
  for (const name of ['armor_white', 'gunmetal']) {
    const material = new T.MeshStandardMaterial({ color: name === 'armor_white' ? 0xc2c5be : 0x4a5155, map: sharedTexture, vertexColors: true })
    material.name = name
    // Gg's actual shader contract; r180 copy() drops these custom defines.
    material.defines = { STANDARD: '', SL_TINT: 1, SL_TRIPLANAR: '', SL_FX: '' }
    material.onBeforeCompile = shader => { shader.uniforms.uSlWet = { value: 1 } }
    material.customProgramCacheKey = () => `source-${name}`
    cached.set(name, material)
  }
  const g = {
    THREE: T, scene: new T.Scene(),
    mats: { get(name) { assert.ok(cached.has(name)); return cached.get(name) } },
    robotVisuals: { create(kind, materials) {
      const rig = api.robotVisuals.create(kind, materials)
      const record = { rig, geometryDisposals: 0, extraDisposals: 0, skeletonDisposals: 0 }
      rig.definition.geometry.addEventListener('dispose', () => record.geometryDisposals++)
      rig.definition.extra?.geometry.addEventListener('dispose', () => record.extraDisposals++)
      const dispose = rig.skeleton.dispose.bind(rig.skeleton)
      rig.skeleton.dispose = () => { record.skeletonDisposals++; dispose() }
      definitions.push(record)
      return rig
    } },
    events: { on: forbid('event registration'), emit: forbid('event emission') },
    enemies: new Proxy({}, { get: forbid('live enemy API') }),
    physics: new Proxy({}, { get: forbid('physics API') }),
    render: new Proxy({}, { get: forbid('renderer/light pool') }),
  }
  return { g, cached, sharedTexture, definitions }
}

function withoutAnimation(buildArt) {
  const keys = ['requestAnimationFrame', 'setTimeout', 'setInterval', 'addEventListener'], previous = new Map()
  for (const key of keys) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value() { assert.fail(`Static art scheduled ${key}`) } })
  }
  try { return buildArt() } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

function inspectGeometry(root) {
  const meshes = []
  root.traverse(object => {
    assert.ok(!object.isLight && !object.isSkinnedMesh && !object.isBone, object.name)
    assert.ok(!object.animations.length, object.name)
    if (!object.isMesh) return
    meshes.push(object)
    const geometry = object.geometry, count = geometry.attributes.position.count
    assert.ok(count > 0)
    assert.ok(!geometry.attributes.skinIndex && !geometry.attributes.skinWeight)
    for (const key of ['position', 'normal', 'uv', 'color']) {
      const attribute = geometry.attributes[key]
      assert.equal(attribute.count, count, `${object.name} ${key}`)
      assert.ok(attribute.array.every(Number.isFinite), `${object.name} ${key} finite`)
    }
    if (geometry.index) assert.ok(geometry.index.array.every(index => index < count))
    assert.ok(geometry.boundingBox && Number.isFinite(geometry.boundingSphere.radius))
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      assert.ok(!material.transparent, `${object.name} should have no blur/searchlight effects`)
      assert.ok(!material.emissive || material.emissive.equals(new T.Color(0)))
    }
  })
  return meshes
}

function geometryHash(root) {
  const hash = createHash('sha256')
  root.traverse(object => {
    if (!object.isMesh) return
    hash.update(object.name)
    for (const key of Object.keys(object.geometry.attributes).sort()) {
      const data = object.geometry.attributes[key].array
      hash.update(key); hash.update(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
    }
    const index = object.geometry.index?.array
    if (index) hash.update(Buffer.from(index.buffer, index.byteOffset, index.byteLength))
  })
  return hash.digest('hex')
}

function uvTriangles(geometry, counts = new Map()) {
  const uv = geometry.attributes.uv, index = geometry.index
  for (let i = 0; i < (index?.count || uv.count); i += 3) {
    const values = []
    for (let j = 0; j < 3; j++) { const v = index ? index.getX(i + j) : i + j; values.push(uv.getX(v), uv.getY(v)) }
    const key = values.join(',')
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

function resources(root) {
  const owned = { geometries: new Map(), materials: new Map(), textures: new Map() }
  const watch = (map, item) => {
    if (!item || map.has(item)) return
    map.set(item, 0)
    item.addEventListener('dispose', () => map.set(item, map.get(item) + 1))
  }
  root.traverse(object => {
    if (!object.isMesh) return
    watch(owned.geometries, object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      watch(owned.materials, material)
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'bumpMap']) watch(owned.textures, material[key])
    }
  })
  return owned
}

for (const kind of ['hound', 'gull']) {
  test(`${kind}: real source geometry remains recognizable, finite, static and deterministic`, () => {
    const world = fixture(), first = withoutAnimation(() => buildRobotWreck(world.g, kind)), second = withoutAnimation(() => buildRobotWreck(world.g, kind))
    try {
      const meshes = inspectGeometry(first.group), state = first.snapshot(), bounds = new T.Box3().setFromObject(first.group)
      assert.equal(world.g.scene.children.length, 0, 'Placement belongs to the installer')
      assert.equal(geometryHash(first.group), geometryHash(second.group))
      assert.deepEqual(first.snapshot(), second.snapshot())
      assert.ok(meshes.length <= 8, 'Detail must be material batched')
      assert.ok(Math.abs(bounds.min.y) < 1e-6, 'Ground contact')
      const size = bounds.getSize(new T.Vector3())
      assert.ok(size.x > .6 && size.x < 2 && size.y > .15 && size.y < 1.2 && size.z > .6 && size.z < 2, `Mechanical scale ${size.toArray()}`)
      const actualSource = world.definitions[0].rig.definition.geometry, originalUV = uvTriangles(actualSource), wreckUV = new Map()
      for (const mesh of meshes) uvTriangles(mesh.geometry, wreckUV)
      let retained = 0
      for (const [key, count] of originalUV) retained += Math.min(count, wreckUV.get(key) || 0)
      assert.ok(retained / (actualSource.attributes.position.count / 3) >= .9, 'At least 90% source triangle UV topology survives posing/damage')
      assert.equal(state.sourceTriangles, actualSource.attributes.position.count / 3)
      assert.ok(state.triangles < 30000)
      for (const item of world.definitions) {
        assert.equal(item.geometryDisposals, 1)
        assert.equal(item.extraDisposals, kind === 'gull' ? 1 : 0)
        assert.equal(item.skeletonDisposals, 1)
      }
      state.footprint.min[0] = 999
      assert.notEqual(first.snapshot().footprint.min[0], 999)
    } finally { first.dispose(); second.dispose() }
  })

  test(`${kind}: source shader definitions/hooks survive cloning; disposal preserves borrowed resources`, () => {
    const world = fixture(), wreck = buildRobotWreck(world.g, kind), tracked = resources(wreck.group)
    const originalColors = [...world.cached.values()].map(material => material.color.toArray())
    for (const name of ['armor_white', 'gunmetal']) {
      const clone = wreck.group.children.find(object => object.material.name === name).material, cached = world.cached.get(name)
      assert.notEqual(clone, cached)
      assert.equal(clone.map, world.sharedTexture)
      assert.deepEqual(clone.defines, cached.defines, 'Custom SL_TINT/TRIPLANAR/FX shader defines are required')
      assert.notEqual(clone.defines, cached.defines)
      assert.equal(clone.onBeforeCompile, cached.onBeforeCompile)
      assert.equal(clone.customProgramCacheKey, cached.customProgramCacheKey)
    }
    let cachedDisposals = 0
    for (const material of world.cached.values()) material.addEventListener('dispose', () => cachedDisposals++)
    world.g.scene.add(wreck.group)
    wreck.dispose(); wreck.dispose()
    assert.equal(world.g.scene.children.length, 0)
    assert.ok(wreck.snapshot().disposed)
    for (const count of tracked.geometries.values()) assert.equal(count, 1)
    for (const count of tracked.materials.values()) assert.equal(count, 1)
    for (const count of tracked.textures.values()) assert.equal(count, 0)
    assert.equal(cachedDisposals, 0)
    assert.deepEqual([...world.cached.values()].map(material => material.color.toArray()), originalColors)
  })
}

test('unknown robot kinds fail clearly through the production adapter', () => {
  const world = fixture()
  assert.throws(() => buildRobotWreck(world.g, 'forklift'), /Unknown robot visual/)
  assert.equal(world.definitions.length, 0)
  assert.equal(world.g.scene.children.length, 0)
})

test('covered workers have finite human-scale geometry and 30 cm workboots; reset does not multiply resources', () => {
  const world = fixture(), placements = ['checkpoint', 'warehouse', 'dock'].map((variant, i) => ({ id: variant, variant, position: [i * 3, .12, 0], seed: 120 + i }))
  const first = withoutAnimation(() => createCasualties(world.g, { placements })), second = withoutAnimation(() => createCasualties(world.g, { placements }))
  try {
    const meshes = inspectGeometry(first.root), state = first.snapshot(), tracked = resources(first.root), hash = geometryHash(first.root)
    assert.equal(hash, geometryHash(second.root))
    assert.equal(state.count, 3)
    assert.ok(meshes.length <= 8, 'All workers share material batches')
    assert.equal(tracked.textures.size, state.resources.textures)
    for (const worker of state.casualties) {
      const [width, height, length] = worker.dimensions
      assert.ok(width > .6 && width < 1.4 && height > .18 && height < .55 && length > 1.6 && length < 2.4)
      // Sewn cover binding can sit below the boot's nominal 4 mm clearance.
      const clearance = worker.minimumY - worker.supportY
      assert.ok(clearance >= 0 && clearance < .006, `Support contact ${worker.variant}: ${clearance}`)
      assert.equal(worker.boots.length, 2)
      for (const boot of worker.boots) {
        assert.ok(boot.length > .28 && boot.length < .32, `Workboot length ${boot.length}`)
        assert.ok(boot.width > .09 && boot.width < .17)
      }
    }
    const originalMeshes = [...first.root.children]
    for (let i = 0; i < 5; i++) {
      assert.deepEqual(first.reset(), state)
      assert.equal(geometryHash(first.root), hash)
      assert.ok(first.root.children.every((mesh, index) => mesh === originalMeshes[index]))
    }
    state.casualties[0].position[0] = 999
    assert.notEqual(first.snapshot().casualties[0].position[0], 999)
    world.g.scene.add(first.root)
    first.dispose(); first.dispose()
    assert.equal(world.g.scene.children.length, 0)
    for (const map of Object.values(tracked)) for (const count of map.values()) assert.equal(count, 1)
  } finally { first.dispose(); second.dispose() }
})

function withCanvasDrawing(run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  // Drawing-only stand-in: no pixels/GPU or visual quality assertions. Real
  // browser photography separately verifies the generated paper/decal artwork.
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement(tag) {
      assert.equal(tag, 'canvas')
      const commands = [], context = { globalCompositeOperation: 'source-over' }
      for (const method of ['fillRect', 'strokeRect', 'fillText', 'drawImage', 'translate', 'beginPath', 'ellipse', 'arc', 'fill', 'moveTo', 'lineTo', 'stroke']) {
        context[method] = (...args) => commands.push({ method, args, color: context.fillStyle, operation: context.globalCompositeOperation })
      }
      return { width: 0, height: 0, commands, getContext(type) { assert.equal(type, '2d'); return context } }
    },
  } })
  try { return run() } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous)
    else delete globalThis.document
  }
}

test('prop batching copies cached source geometry and never disposes borrowed geometry, label material or texture', () => withCanvasDrawing(() => {
  const sharedGeometry = new T.BoxGeometry(.34, .44, .16), sharedTexture = new T.Texture()
  const sharedMaterial = new T.MeshStandardMaterial({ map: sharedTexture }), prototype = new T.Group()
  prototype.add(new T.Mesh(sharedGeometry, sharedMaterial))
  // This is the original wf cache/clone implementation used by jerry_can.
  // A small source mesh exercises its ownership contract without faking art.
  const build = kind => api.cloneCachedProp(`aftermath-ownership-regression:${kind}`, () => prototype)
  const original = build('jerry_can'), another = build('jerry_can')
  assert.notEqual(original, another)
  assert.equal(original.children[0].geometry, sharedGeometry)
  assert.equal(another.children[0].geometry, sharedGeometry)
  assert.equal(another.children[0].material, sharedMaterial)
  let geometryDisposals = 0, materialDisposals = 0, textureDisposals = 0
  sharedGeometry.addEventListener('dispose', () => geometryDisposals++)
  sharedMaterial.addEventListener('dispose', () => materialDisposals++)
  sharedTexture.addEventListener('dispose', () => textureDisposals++)
  const copies = new Map(), clone = sharedGeometry.clone.bind(sharedGeometry)
  sharedGeometry.clone = () => {
    const geometry = clone()
    copies.set(geometry, 0)
    geometry.addEventListener('dispose', () => copies.set(geometry, copies.get(geometry) + 1))
    return geometry
  }
  const g = { THREE: T, props: { build }, mats: { label() { return { material: sharedMaterial, aspect: 4 } } } }
  const props = withoutAnimation(() => createAftermathProps(g)), tracked = resources(props.root)
  try {
    assert.equal(geometryDisposals, 0, 'Batching must not dispose wf cache geometry')
    assert.ok(copies.size >= 2, 'Both borrowed source prop instances need owned geometry')
    for (const count of copies.values()) assert.equal(count, 1, 'Temporary owned copies are freed after batching')
    assert.ok(props.root.children.some(object => object.isMesh && object.material === sharedMaterial), 'Borrowed material survives batching')
    props.dispose(); props.dispose()
    assert.equal(geometryDisposals, 0)
    assert.equal(materialDisposals, 0)
    assert.equal(textureDisposals, 0)
    assert.equal(original.children[0].geometry, sharedGeometry)
    for (const count of tracked.geometries.values()) assert.equal(count, 1)
    for (const [material, count] of tracked.materials) assert.equal(count, material === sharedMaterial ? 0 : 1)
    for (const [texture, count] of tracked.textures) assert.equal(count, texture === sharedTexture ? 0 : 1)
  } finally { props.dispose() }
}))

test('decal snapshots detach surface normals and rotations as well as placement arrays', () => withCanvasDrawing(() => {
  const placements = [{ id: 'wall-impact', kind: 'impact', position: [-2, .8, 4], size: [.15, .15], normal: [0, 0, 1], rotation: [.1, .2, .3] }]
  const expected = structuredClone(placements), layer = createAftermathDecals({ THREE: T }, placements), tracked = resources(layer.root)
  try {
    const original = layer.snapshot().marks
    const state = layer.snapshot()
    state.marks[0].normal[0] = .8
    state.marks[0].rotation[2] = 9
    state.marks[0].position[1] = 22
    state.marks[0].size[0] = 55
    assert.deepEqual(layer.snapshot().marks, original)
    assert.deepEqual(placements, expected)
    layer.dispose(); layer.dispose()
    for (const map of Object.values(tracked)) for (const count of map.values()) assert.equal(count, 1)
  } finally { layer.dispose() }
}))

function containerWorld() {
  const { g } = fixture(), cached = new Map(), labelMaterial = new T.MeshStandardMaterial({ transparent: true })
  g.mats = {
    get(name) { if (!cached.has(name)) cached.set(name, new T.MeshStandardMaterial({ name, vertexColors: true })); return cached.get(name) },
    label() { return { material: labelMaterial, aspect: 3 } },
    decal() { return { material: labelMaterial, aspect: 3 } },
  }
  g.level = { root: new T.Group(), placed: [] }; g.scene.add(g.level.root)
  const authored = [], number = node => node.type === 'UnaryExpression' ? -node.argument.value : node.value
  // Read literal stack placements from hR without invoking unrelated yard props.
  function stacks(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'CallExpression' && node.callee.name === 't') {
      const [x, z, levels] = node.arguments
      authored.push({ x: number(x), z: number(z), kind: levels.elements[0].elements[0].value })
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(stacks)
      else if (value && typeof value === 'object') stacks(value)
    }
  }
  stacks(body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'hR'))
  for (const [i, sign] of AFTERMATH_SIGNAGE.entries()) {
    assert.ok(authored.some(p => p.x === sign.container[0] && p.z === sign.container[1] && p.kind === 20), sign.id)
    const placed = { name: 'container20', x: sign.container[0], y: 0, z: sign.container[1], yaw: [.017, -.005, 0][i] }
    g.level.placed.push(placed)
    const container = new T.Group(); container.position.set(placed.x, placed.y, placed.z); container.rotation.y = placed.yaw
    const { parts } = api.containerParts(g, 319 + i, 0, .72)
    for (const part of parts) container.add(new T.Mesh(part.geo, part.mat.body ? g.mats.get('paint_green') : part.mat))
    g.level.root.add(container)
  }
  g.level.root.updateMatrixWorld(true)
  // Production C1 merges the static containers into material batches. Remove
  // instance hierarchy here too, so fitting cannot rely on container names.
  const batches = new Map()
  g.level.root.traverse(object => {
    if (!object.isMesh) return
    if (!batches.has(object.material)) batches.set(object.material, [])
    const positions = batches.get(object.material), attribute = object.geometry.attributes.position, index = object.geometry.index, point = new T.Vector3()
    for (let i = 0; i < (index?.count || attribute.count); i++) {
      point.fromBufferAttribute(attribute, index ? index.getX(i) : i).applyMatrix4(object.matrixWorld)
      positions.push(...point.toArray())
    }
    object.geometry.dispose()
  })
  g.level.root.clear()
  for (const [material, positions] of batches) {
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals()
    g.level.root.add(new T.Mesh(geometry, material))
  }
  return g
}

test('biohazard paint fits actual authored corrugation/dents at all three rotated yard containers', () => withCanvasDrawing(() => {
  const g = containerWorld(), borrowed = resources(g.level.root), layer = withoutAnimation(() => createAftermathSignage(g)), tracked = resources(layer.root)
  const second = createAftermathSignage(g)
  try {
    assert.equal(layer.root.children.length, 3)
    assert.equal(geometryHash(layer.root), geometryHash(second.root))
    assert.deepEqual(layer.snapshot(), second.snapshot())
    layer.root.updateMatrixWorld(true)
    for (const [i, mesh] of layer.root.children.entries()) {
      const sign = layer.snapshot().signs[i], geometry = mesh.geometry
      assert.equal(sign.fit, 'clipped-authored-triangles')
      assert.ok(sign.triangles > 20 && sign.triangles < 400)
      assert.ok(sign.depthRange[1] - sign.depthRange[0] > .033, 'Paint follows crests/valleys, not a flat plate')
      for (const attribute of Object.values(geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite))
      assert.ok(geometry.boundingSphere.radius < 1)
      const m = mesh.material
      assert.ok(m.isMeshStandardMaterial && m.emissive.equals(new T.Color(0)))
      assert.ok(m.roughness >= .8 && !m.depthWrite && m.alphaTest > 0)
      assert.equal(m.map.colorSpace, T.SRGBColorSpace)
      const outward = new T.Vector3(...sign.normal), ray = new T.Raycaster(), point = new T.Vector3()
      // Raycast the original geometry and fitted paint at interior pixel samples.
      for (let y = 1; y < 5; y++) for (let x = 1; x < 9; x++) {
        point.set((x / 10 - .5) * sign.size[0], (y / 6 - .5) * sign.size[1], .2).applyMatrix4(mesh.matrixWorld)
        ray.set(point, outward.clone().negate()); ray.far = .4
        const sourceHit = ray.intersectObject(g.level.root, true)[0], paintHit = ray.intersectObject(mesh)[0]
        assert.ok(sourceHit && paintHit, `${sign.id}: source and paint cover ${x},${y}`)
        assert.ok(Math.abs(sourceHit.distance - paintHit.distance - .0012) < .000006, `Paint ${sign.id} sample ${x},${y}: source=${sourceHit.distance}, paint=${paintHit.distance}, material=${sourceHit.object.material?.name}`)
        assert.ok(paintHit.face.normal.z > .45)
      }
    }
    const snapshot = layer.snapshot(); snapshot.signs[0].normal[0] = 99; snapshot.signs[0].position[0] = 99; snapshot.signs[0].container.x = 99
    assert.notEqual(layer.snapshot().signs[0].position[0], 99)
    assert.notEqual(layer.snapshot().signs[0].normal[0], 99)
    assert.notEqual(layer.snapshot().signs[0].container.x, 99)
    g.scene.add(layer.root); layer.dispose(); layer.dispose()
    assert.ok(layer.snapshot().disposed && !layer.root.parent)
    for (const map of Object.values(tracked)) for (const count of map.values()) assert.equal(count, 1)
    for (const map of Object.values(borrowed)) for (const count of map.values()) assert.equal(count, 0)
  } finally { layer.dispose(); second.dispose() }
}))

test('container paint preserves holes and never projects onto a back wall through a gap', () => withCanvasDrawing(() => {
  const root = new T.Group(), material = new T.MeshStandardMaterial(), placed = []
  for (const sign of AFTERMATH_SIGNAGE) {
    const [x, z] = sign.container
    placed.push({ name: 'container20', x, y: 0, z, yaw: 0 })
    for (const dx of [-.35, .35]) {
      const mesh = new T.Mesh(new T.PlaneGeometry(.3, 1.2), material)
      mesh.position.set(x + sign.along + dx, sign.height, z + sign.side * 1.207); mesh.rotation.y = sign.side < 0 ? Math.PI : 0; root.add(mesh)
    }
    const back = new T.Mesh(new T.PlaneGeometry(1.2, 1.2), material)
    back.position.set(x + sign.along, sign.height, z - sign.side * .5); back.rotation.y = sign.side < 0 ? Math.PI : 0; root.add(back)
  }
  const layer = createAftermathSignage({ THREE: T, level: { root, placed } })
  try {
    layer.root.updateMatrixWorld(true)
    for (const mesh of layer.root.children) {
      const point = new T.Vector3(0, 0, .25).applyMatrix4(mesh.matrixWorld), normal = new T.Vector3(0, 0, -1).applyQuaternion(mesh.quaternion)
      const ray = new T.Raycaster(point, normal, 0, .5)
      assert.equal(ray.intersectObject(mesh).length, 0, 'The centre gap stays unpainted')
      const xs = mesh.geometry.attributes.position
      for (let i = 0; i < xs.count; i++) assert.ok(Math.abs(xs.getX(i)) >= .19999)
    }
  } finally { layer.dispose() }
}))

test('blood masks remain sparse/nonemissive, separate rain dilution from dry roughness, and own all resources', () => withCanvasDrawing(() => {
  const placements = ['dilute', 'drag', 'indoor', 'print', 'splatter', 'drops'].flatMap((kind, i) =>
    ['indoor', 'outdoor'].map(environment => ({ id: `${kind}:${environment}`, kind, environment, position: [i, .008, 0], size: [.5, .6], yaw: .3 })))
  const layer = withoutAnimation(() => createAftermathDecals({ THREE: T }, placements)), tracked = resources(layer.root)
  try {
    for (const [i, mesh] of layer.root.children.entries()) {
      const mark = layer.snapshot().marks[i], material = mesh.material
      assert.deepEqual(mark.normal.map(v => Math.round(v)), [0, 1, 0])
      assert.ok(material.isMeshStandardMaterial && material.emissive.equals(new T.Color(0)))
      assert.equal(material.opacity, 1); assert.ok(material.transparent && !material.depthWrite && material.alphaTest > 0)
      assert.equal(material.roughness, mark.environment === 'indoor' ? .84 : .48)
      assert.equal(material.map.image.width, 512)
      const commands = material.map.image.commands, fills = commands.filter(c => c.method === 'fill' || c.method === 'fillRect')
      assert.ok(fills.length > 8, 'A generated blood mask must contain actual paint strokes')
      assert.ok(fills.some(c => /^rgba\((109,24,21|133,36,29),/.test(c.color)), 'Blood retains a readable dark red hue')
      assert.ok(fills.every(c => c.method !== 'fillRect' || c.args[2] * c.args[3] < 512 * 512 * .01), 'No opaque blood rectangle')
      assert.ok(commands.filter(c => c.method === 'ellipse').every(c => c.args[2] < 40 && c.args[3] < 45), 'Masks use small irregular contacts')
      if (mark.environment === 'outdoor' && mark.kind !== 'print') assert.ok(fills.some(c => c.operation === 'destination-out'), 'Rain cuts gaps through outdoor blood')
      for (const attribute of Object.values(mesh.geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite))
      assert.ok(mesh.geometry.boundingSphere.radius < 1)
    }
    assert.equal(tracked.materials.size, placements.length, 'Indoor/outdoor variants cannot accidentally share a texture/material')
    placements[0].position[0] = 999
    assert.notEqual(layer.snapshot().marks[0].position[0], 999)
    layer.dispose(); layer.dispose()
    for (const map of Object.values(tracked)) for (const count of map.values()) assert.equal(count, 1)
  } finally { layer.dispose() }
}))

test('aftermath disabled path is allocation-free beyond its unattached root and remains idempotent', () => {
  const g = { THREE: T, scene: new T.Scene() }, layer = installAftermath(g, { enabled: false })
  assert.equal(installAftermath(g), layer)
  layer.reset()
  assert.equal(g.scene.children.length, 0)
  assert.equal(layer.snapshot().meshes, 0)
  assert.equal(layer.snapshot().signage, undefined)
  layer.dispose(); layer.dispose()
  assert.ok(layer.snapshot().disposed)
})

test('installer owns signage/blood, snapshots all marks, and reset/reinstall never multiplies resources', () => withCanvasDrawing(() => {
  const g = containerWorld(), boxes = [], physicsBuilds = []
  g.props = { build() { return new T.Group() } }
  g.physics = {
    addBox(min, max, options) { const box = { min: min.clone(), max: max.clone(), ...options }; boxes.push(box); return box },
    removeBox(box) { boxes.splice(boxes.indexOf(box), 1) }, build() { physicsBuilds.push(boxes.length) },
  }
  const checkpointWall = new T.Mesh(new T.PlaneGeometry(2, 1.5), g.mats.get('paint_grey'))
  checkpointWall.position.set(-33, .8, 8); checkpointWall.rotation.y = Math.PI / 2; g.level.root.add(checkpointWall)
  const warehouseWall = new T.Mesh(new T.PlaneGeometry(2, 2), g.mats.get('paint_grey'))
  warehouseWall.position.set(-5.6, 1, -26.4); g.level.root.add(warehouseWall)
  const borrowed = resources(g.level.root), layer = withoutAnimation(() => installAftermath(g))
  try {
    const root = g.scene.children.find(o => o.name === 'last-harbor-aftermath'), tracked = resources(root), original = layer.snapshot()
    assert.equal(installAftermath(g), layer)
    assert.equal(original.signage.signs.length, 3)
    assert.equal(original.marks.marks.filter(p => !['scorch', 'impact'].includes(p.kind)).length, 12, 'Seven existing blood marks plus five curated groups')
    assert.equal(original.marks.marks.length, 21)
    assert.equal(boxes.length, 2, 'Only the existing wreck cores affect physics')
    for (let i = 0; i < 4; i++) { layer.reset(); assert.deepEqual(layer.snapshot(), original) }
    assert.equal(physicsBuilds.length, 1)
    layer.dispose(); layer.dispose()
    assert.equal(boxes.length, 0)
    assert.ok(!g.scene.children.includes(root))
    for (const [geometry, count] of tracked.geometries) assert.equal(count, 1, geometry.type)
    for (const [material, count] of tracked.materials) assert.equal(count, borrowed.materials.has(material) ? 0 : 1, material.name)
    for (const [texture, count] of tracked.textures) assert.equal(count, 1, texture.type)
    for (const map of Object.values(borrowed)) for (const count of map.values()) assert.equal(count, 0)
    const replacement = installAftermath(g)
    assert.notEqual(replacement, layer)
    assert.equal(replacement.snapshot().marks.marks.length, 21)
    assert.equal(replacement.snapshot().signage.signs.length, 3)
    replacement.dispose()
    assert.equal(boxes.length, 0)
  } finally { layer.dispose() }
}))
