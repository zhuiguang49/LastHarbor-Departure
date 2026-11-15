import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { parse } from '@babel/parser'
import { buildCampaignSectors } from './campaign-sectors.mjs'
import { M1_WORLD } from './campaign-layout.mjs'

// Original Three, factories, ob/By and physics without DOM/WebGL boot. Material
// maps/Canvas label rasters are stubs: these tests cannot establish visual or
// browser runtime acceptance, nav-domain expansion or rain/audio correctness.
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
  const materials = new Map(), sources = [], sourceMeshes = [], calls = [], textures = [new T.Texture()]
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
    emissive: (color, intensity) => { const m = get('emissive_' + color + '_' + intensity); m.emissive.set(color); m.emissiveIntensity = intensity; return m },
    decal: name => ({ material: get(`decal_${name}`), aspect: name.startsWith('logo_') ? 640 / 192 : 1 }),
  } }
  g.physics = api.physics(g)
  const props = api.props(g)
  g.props = { build(name, options) {
    calls.push({ name, ...options })
    const root = props.build(name, options)
    root.traverse(mesh => { if (mesh.isMesh) sourceMeshes.push(mesh) })
    sources.push(root)
    return root
  } }
  g.campaignFactories = { context: () => api.context(g), merge: api.merge }
  return { g, sources, sourceMeshes, calls, materials, textures }
}


function meshes(root) {
  const result = []
  root.traverse(mesh => { if (mesh.isMesh) result.push(mesh) })
  return result
}

function walk(physics, points) {
  const position = new T.Vector3(points[0].x, 0, points[0].z)
  for (const target of points.slice(1)) {
    const dx = target.x - position.x, dz = target.z - position.z, length = Math.hypot(dx, dz)
    const velocity = new T.Vector3(dx / length * 3, 0, dz / length * 3)
    for (let distance = 0; distance < length - 1e-8; distance += .15) {
      const result = physics.moveCapsule(position, velocity.clone(), Math.min(.15, length - distance) / 3)
      assert.equal(result.hitWall, false, `Blocked toward ${target.x},${target.z} at ${position.x},${position.z}`)
    }
    assert.ok(Math.hypot(position.x - target.x, position.z - target.z) < 1e-6)
  }
  return position
}

test('M1 has identity chunk roots, bounded full-container templates and environmental landmarks only', t => {
  const world = fixture(), layer = buildCampaignSectors(world.g), state = layer.snapshot()
  assert.deepEqual(Object.keys(layer).sort(), ['chunks', 'dispose', 'landmarks', 'lightSites', 'root', 'snapshot'])
  assert.equal(state.stage, 'M1')
  assert.equal(state.storyImplemented, false)
  assert.equal(state.chunkCount, 22)
  assert.equal(state.containers.containerCount, 55)
  assert.equal(state.containers.templateCount, 3)
  assert.equal(world.calls.filter(call => call.name === 'container40').length, 3)
  assert.equal(layer.root.parent, null, 'Integration owner mounts the layer')
  assert.equal(world.g.scene.children.length, 0)
  assert.equal(layer.landmarks.length, 5)
  assert.ok(layer.landmarks.every(item => item.placeholder))
  assert.ok(!state.nativePlacements.some(item => item.sectorId === 'berth-7'))
  assert.ok(!state.boundaries.some(item => item.sectorIds.length === 1 && item.sectorIds[0] === 'berth-7'))
  for (const chunk of layer.chunks) {
    assert.equal(chunk.root.position.length(), 0)
    assert.equal(chunk.root.rotation.toArray().slice(0, 3).every(value => value === 0), true)
    assert.deepEqual(Array.from(chunk.root.scale.toArray()), [1,1,1])
    assert.ok(chunk.bounds.maxX - chunk.bounds.minX <= 53)
    assert.ok(chunk.bounds.maxZ - chunk.bounds.minZ <= 53)
    assert.ok(chunk.updaters.every(update => typeof update === 'function'))
  }
  assert.equal(state.colliderCount, world.g.physics.boxes.length)
  for (const mesh of meshes(layer.root)) for (const attribute of Object.values(mesh.geometry.attributes)) {
    assert.ok(attribute.array.every(Number.isFinite))
  }
  t.diagnostic(JSON.stringify({ chunks: state.chunkCount, containers: state.containers.containerCount,
    colliderCount: state.colliderCount, lightSites: state.lightSiteCount,
    factories: state.nativePlacements.reduce((counts, p) => ({ ...counts, [p.name]: (counts[p.name] || 0) + 1 }), {}) }))
  layer.dispose()
})

test('main/branch paths have three metres plus capsule radius clearance from native prop colliders', () => {
  const world = fixture(), layer = buildCampaignSectors(world.g), physics = world.g.physics
  const props = physics.boxes.filter(box => !box.tag.startsWith('campaign-perimeter') &&
    !box.tag.startsWith('campaign-coast') && box.tag !== 'campaign-quay' && box.min.y < 1.8 && box.max.y > 0)
  // Berth-7's final chord belongs to original navigation, not this layer.
  const coverRoute = [{ x: -64, z: -100 }, { x: -74, z: -100 }, { x: -74, z: -32 }, { x: -64, z: -32 }]
  for (const path of [M1_WORLD.route.slice(0, -1), M1_WORLD.branch, coverRoute]) {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], length = Math.hypot(b.x - a.x, b.z - a.z)
      for (let distance = 0; distance <= length; distance += .1) {
        const x = a.x + (b.x - a.x) * distance / length, z = a.z + (b.z - a.z) * distance / length
        for (const box of props) {
          const clearance = Math.hypot(Math.max(box.min.x - x, 0, x - box.max.x), Math.max(box.min.z - z, 0, z - box.max.z))
          assert.ok(clearance >= 3.32 - 1e-7, `Prop clearance ${clearance} at ${x},${z}, ${JSON.stringify(box)}`)
        }
      }
    }
    walk(physics, path)
    walk(physics, [...path].reverse())
  }
  layer.dispose()
})

test('native physics traverses every link both ways and U/branch partitions physically stop shortcuts', () => {
  const world = fixture(), layer = buildCampaignSectors(world.g), physics = world.g.physics
  for (const link of M1_WORLD.links) {
    const x = link.bounds.minX, z = (link.bounds.minZ + link.bounds.maxZ) / 2
    const route = [{ x: x - 1, z }, { x: x + 1, z }]
    walk(physics, route)
    walk(physics, [...route].reverse())
    // The physical mouth endpoints match the contract; neither neighbouring
    // fence extends across the opening centre or covers it with a base slab.
    for (const box of physics.boxes.filter(box => box.tag.startsWith('campaign-perimeter'))) {
      assert.ok(!(box.min.x <= x && box.max.x >= x && box.min.z < link.bounds.maxZ && box.max.z > link.bounds.minZ))
    }
  }
  for (const [start, direction] of [
    [[-70,1.3,-285],[0,0,1]], [[-60.7,1.3,-285],[0,0,1]], [[-120,1.3,-240],[-1,0,0]],
  ]) {
    const hit = physics.raycast(new T.Vector3(...start), new T.Vector3(...direction), 35)
    assert.equal(hit?.surface, 'metal')
    assert.equal(hit?.box?.tag, 'campaign-container')
    const position = new T.Vector3(start[0], 0, start[2])
    assert.equal(physics.moveCapsule(position, new T.Vector3(...direction).multiplyScalar(3), 12).hitWall, true)
  }
  layer.dispose()
})

test('coast uses concrete quay, metal rails and native mooring bollards; fences stop native rays', () => {
  const world = fixture(), layer = buildCampaignSectors(world.g), physics = world.g.physics
  assert.equal(layer.snapshot().nativePlacements.filter(p => p.name === 'bollard_mooring').length, 10)
  for (const box of physics.boxes.filter(box => box.tag === 'campaign-quay')) {
    assert.equal(box.max.x, 30)
    assert.equal(box.min.x, 29.4)
    assert.equal(box.surface, 'concrete')
  }
  const fence = physics.raycast(new T.Vector3(0, 1.2, -330), new T.Vector3(0, 0, -1), 20)
  assert.equal(fence?.box?.tag, 'campaign-perimeter')
  assert.equal(fence?.surface, 'metal')
  const rail = physics.raycast(new T.Vector3(28, .8, -321), new T.Vector3(1, 0, 0), 10)
  assert.equal(rail?.box?.tag, 'campaign-coast-rail')
  const quay = physics.raycast(new T.Vector3(29.8, .5, -321), new T.Vector3(0, -1, 0), 5)
  assert.equal(quay?.box?.tag, 'campaign-quay')
  layer.dispose()
})

test('five light sites match original mast lamp positions; blackbox lenses are off and no lights are created', () => {
  const world = fixture(), layer = buildCampaignSectors(world.g)
  assert.equal(layer.lightSites.length, 5)
  assert.ok(layer.lightSites.every(site => site.sectorId !== 'blackbox-yard'))
  for (const site of layer.lightSites) {
    assert.deepEqual(Object.keys(site).sort(), ['angle','color','decay','distance','intensity','penumbra','position','sectorId','target'])
    assert.ok(world.sources.filter(source => source.name === 'light_mast').some(source => source.userData.lamps.some(lamp =>
      new T.Vector3(...lamp.pos).applyMatrix4(source.matrixWorld).distanceTo(new T.Vector3(site.position.x, site.position.y, site.position.z)) < 1e-8)))
  }
  const mast = world.sources.find(source => source.name === 'light_mast' && source.position.z === -295)
  assert.ok(mast)
  const lens = meshes(mast).filter(mesh => mesh.material.name.startsWith('emissive_'))
  assert.ok(lens.length)
  assert.ok(lens.every(mesh => mesh.material.emissiveIntensity === .02))
  layer.root.traverse(object => assert.ok(!object.isLight))
  layer.dispose()
})

test('dispose owns buffers/merged geometry/handles, borrows all native geometry/material/textures and is idempotent', () => {
  const world = fixture(), unrelated = world.g.physics.addBox([0,0,40], [1,1,41])
  const layer = buildCampaignSectors(world.g), resources = new Map()
  world.g.scene.add(layer.root)
  for (const mesh of world.sourceMeshes) {
    resources.set(mesh.geometry, digest(mesh.geometry))
    mesh.geometry.addEventListener('dispose', () => assert.fail('Disposed native geometry'))
    mesh.material.addEventListener('dispose', () => assert.fail('Disposed native material'))
  }
  for (const texture of world.textures) texture.addEventListener('dispose', () => assert.fail('Disposed borrowed texture'))
  const owned = meshes(layer.root).filter(mesh => mesh.isInstancedMesh || !resources.has(mesh.geometry))
  const counts = new Map(owned.map(mesh => [mesh, 0]))
  for (const mesh of owned) (mesh.isInstancedMesh ? mesh : mesh.geometry).addEventListener('dispose', () => counts.set(mesh, counts.get(mesh) + 1))
  const before = world.g.physics.boxes.length
  for (const chunk of layer.chunks) chunk.root.visible = false
  assert.equal(world.g.physics.boxes.length, before, 'Culling must keep collisions resident')
  layer.dispose()
  layer.dispose()
  assert.equal(world.g.physics.boxes.length, 1)
  assert.equal(world.g.physics.boxes[0], unrelated)
  assert.equal(world.g.scene.children.length, 0)
  assert.equal(layer.snapshot().colliderCount, 0)
  assert.equal(layer.snapshot().containers.containerCount, 0)
  for (const count of counts.values()) assert.equal(count, 1)
  for (const [geometry, hash] of resources) assert.equal(digest(geometry), hash)
  const replacement = buildCampaignSectors(world.g)
  assert.equal(world.g.physics.boxes.length, before)
  replacement.dispose()
})

test('plain-box native placement fallback fails loudly and removes partially built colliders', () => {
  const world = fixture(), build = world.g.props.build
  world.g.props.build = (name, options) => {
    if (name !== 'generator') return build(name, options)
    const object = new T.Group()
    object.userData.prop = name
    object.userData.colliders = [{ min: [-1,0,-1], max: [1,1,1], surface: 'metal' }]
    object.add(new T.Mesh(new T.BoxGeometry(2,1,2), world.g.mats.get('paint_yellow')))
    return object
  }
  assert.throws(() => buildCampaignSectors(world.g), /complete native generator; plain-box fallback rejected/)
  assert.equal(world.g.physics.boxes.length, 0)
  assert.equal(world.g.scene.children.length, 0)
})
