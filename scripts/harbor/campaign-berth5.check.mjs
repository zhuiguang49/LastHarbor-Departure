import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { parse } from '@babel/parser'
import { buildCampaignSectors } from './campaign-sectors.mjs'
import { installBerth5 } from './campaign-berth5.mjs'
import { CH1 } from './campaign-ch1-layout.mjs'

// Real shipped Three/factories/physics, before application boot. Canvas drawing
// is recorded, not rendered: these tests cannot establish visual acceptance.
const bytes = fs.readFileSync(new URL('../../几猫国产3A大作_V1-fable5.2.html', import.meta.url))
assert.equal(createHash('sha256').update(bytes).digest('hex'), '9e55b5200b088adaf8e1152da04efc0d3b25e236e6baf2dee96f81e23e084966')
const html = bytes.toString(), source = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const body = parse(source).program.body[0].expression.callee.body.body
const boundary = body.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === 'gM'))
assert.ok(boundary)
const nodes = body.filter(node => node.end <= boundary.start)
let prefix = source.slice(nodes[0].start, nodes.at(-1).end)
const edits = nodes.flatMap(node => (node.declarations || []).filter(d => ['Ya','ol'].includes(d.id?.name)).map(d => ({
  start: d.init.start - nodes[0].start, end: d.init.end - nodes[0].start, value: d.id.name === 'Ya' ? '-164' : '-344',
})))
assert.equal(edits.length, 2, 'Same two nav-domain adapters as M1')
for (const edit of edits.sort((a,b) => b.start - a.start)) prefix = prefix.slice(0,edit.start) + edit.value + prefix.slice(edit.end)
const native = vm.runInNewContext(`(()=>{${prefix};return {THREE:lt,props:Yg,physics:d3,context:ob,merge:By,warehouse:ab,warehouseBounds:no,crane:z1,
  robotVisuals:{create(kind,materials){const definition=kind==='hound'?Z_():j_();return {...pm(definition,materials,{radius:3,center:[0,0,0]}),definition}}}}})()`,
  { console, performance, AbortController }, { timeout: 15000 })
const T = native.THREE

function withCanvas(run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement(tag) {
    assert.equal(tag, 'canvas')
    const commands = [], ctx = {}
    for (const method of ['beginPath','ellipse','fill','moveTo','lineTo','stroke']) ctx[method] = (...args) => commands.push({ method, args })
    return { width: 0, height: 0, commands, getContext: () => ctx }
  } } })
  try { return run() } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous)
    else delete globalThis.document
  }
}

function fixture({ chapter1 = true, standardLenses = false, configure } = {}) {
  const materials = new Map(), sources = [], sourceGeometry = new Set(), labels = [], texture = new T.Texture()
  function get(name, options = {}) {
    const key = name + JSON.stringify(options)
    if (!materials.has(key)) {
      const material = new T.MeshStandardMaterial({ name, map: texture, vertexColors: !!options.vertexColors,
        transparent: name.startsWith('label_') || name.startsWith('decal_') })
      material.defines = { STANDARD: '', SL_TINT: 1, SL_TRIPLANAR: '', SL_FX: '' }
      material.onBeforeCompile = shader => { shader.uniforms.uSlWet = { value: 1 } }
      material.customProgramCacheKey = () => `source-${name}`
      materials.set(key, material)
    }
    return materials.get(key)
  }
  const forbid = name => new Proxy({}, { get() { assert.fail(`Environment accessed ${name}`) } })
  const g = { THREE: T, scene: new T.Scene(), robotVisuals: native.robotVisuals,
    enemies: forbid('live AI'), render: forbid('renderer/exposure'), events: forbid('mission events'),
    mats: { get,
      label(text, options) { labels.push(text); return { material: get(`label_${text}`, options), aspect: 4 } },
      decal: name => ({ material: get(`decal_${name}`), aspect: name.startsWith('logo_') ? 640/192 : 1 }),
      emissive(color, intensity) {
        const key = `emissive_${color}_${intensity}`
        if (!materials.has(key)) {
          const material = standardLenses ? new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity }) :
            new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(intensity) })
          material.name = key
          material.defines = { ...material.defines, FIXTURE_SHADER: '' }
          material.onBeforeCompile = shader => { shader.uniforms.fixture = { value: 1 } }
          material.customProgramCacheKey = () => key
          materials.set(key, material)
        }
        return materials.get(key)
      },
    } }
  g.physics = native.physics(g)
  g.physics.bounds.min.set(-160,0,-340); g.physics.bounds.max.set(40,30,30)
  const props = native.props(g)
  g.props = { build(name, options) {
    const object = props.build(name, options)
    object.traverse(mesh => { if (mesh.isMesh) sourceGeometry.add(mesh.geometry) })
    sources.push(object)
    return object
  } }
  g.campaignFactories = { context: () => native.context(g), merge: native.merge,
    warehouse: context => native.warehouse(context), crane: builder => native.crane(g, builder) }
  configure?.(g)
  const world = buildCampaignSectors(g, { chapter1 }), settings = { reducedFlashes: false }
  g.scene.add(world.root); g.physics.build()
  const environment = chapter1 ? installBerth5(g, { world, settings }) : null
  return { g, world, environment, settings, sources, sourceGeometry, materials, labels, texture }
}

function walk(physics, points, navigate = false) {
  const p = new T.Vector3(points[0][0],0,points[0][1])
  let travelled = 0
  for (const point of points.slice(1)) {
    const target = new T.Vector3(point[0],0,point[1])
    const path = navigate ? physics.nav.findPath(p, target) : [target]
    assert.ok(path?.length, `No native route to ${point}`)
    // Native nav snaps cells beside walls (including the unchanged spawn).
    // Verify the final actual capsule chord too; never count the snapped cell
    // as reaching an interaction or silently skip a physically blocked target.
    if (path.at(-1).distanceTo(target) > 1e-6) path.push(target)
    for (const {x,z} of path) {
      const direction = new T.Vector3(x-p.x,0,z-p.z), length = direction.length()
      travelled += length
      direction.normalize().multiplyScalar(3)
      for (let distance = 0; distance < length - 1e-8; distance += .12) {
        assert.equal(physics.moveCapsule(p,direction.clone(),Math.min(.12,length-distance)/3).hitWall, false, `Blocked at ${p.toArray()} toward ${x},${z}`)
      }
      assert.ok(Math.hypot(p.x-x,p.z-z) < 1e-6)
    }
  }
  return travelled
}

test('CH1 is opt-in: M1 sites, placeholders and labels retain existing defaults', () => {
  const f = fixture({ chapter1: false })
  assert.equal(f.world.snapshot().stage, 'M1')
  assert.equal(f.world.lightSites.length, 5)
  assert.ok(f.world.lightSites.every(site => !site.lenses && !site.circuit && site.intensity === 650))
  assert.ok(f.world.landmarks.every(item => item.placeholder))
  assert.ok(f.labels.includes('05 五号泊位 · M1 地图骨架 / 剧情未实现'))
  assert.throws(() => installBerth5(f.g, { world: f.world }), /chapter1: true/)
  f.world.dispose()
})

test('CH1 uses real fixture positions/lenses with battery guides, healthy masts and a dark branch', () => withCanvas(() => {
  const f = fixture(), circuits = f.environment.snapshot().circuits
  assert.deepEqual(Object.keys(f.environment).sort(), ['reset','setEnabled','setPower','snapshot','update'])
  assert.equal(installBerth5(f.g, { world: f.world }), f.environment)
  assert.equal(f.world.lightSites.length, 13)
  assert.equal(circuits.filter(c => c.circuit === 'battery').length, 2)
  assert.equal(circuits.filter(c => c.circuit === 'healthy').length, 7)
  assert.equal(circuits.filter(c => c.damaged).length, 1)
  for (const site of f.world.lightSites) {
    assert.ok(site.id?.startsWith('berth5-warehouse-') || f.sources.some(object => object.userData.lamps?.some(lamp =>
      new T.Vector3(...lamp.pos).applyMatrix4(object.matrixWorld).distanceTo(new T.Vector3(site.position.x,site.position.y,site.position.z)) < 1e-8)))
    for (const lens of site.lenses || []) {
      let found = false
      f.world.root.traverse(mesh => { if (mesh.isMesh && mesh.material === lens.material) found = true })
      assert.ok(found, 'Controlled lens material survives native static batching')
    }
  }
  f.world.root.traverse(object => assert.ok(!object.isLight, 'Only the integration-owned light pool creates lights'))
  assert.ok(!f.labels.some(label => label.includes('05 五号泊位 · M1')))
  assert.ok(f.labels.includes('02 黑箱堆场 · M1 / 无常规照明'))
  assert.ok(f.world.landmarks.filter(item => item.sectorId !== 'berth-5').every(item => item.placeholder))
  f.world.dispose()
}))

test('power guide keeps its accepted floor position and illuminates the complete switch panel', () => withCanvas(() => {
  const f = fixture()
  try {
    const site = f.world.lightSites.find(site => site.id === 'berth5-power-guide')
    const body = f.sources.find(object => object.userData.prop === 'floodlight_stand' &&
      Math.hypot(object.position.x + 33, object.position.z + 320.5) < .001)
    assert.ok(body)
    assert.deepEqual(Array.from(body.position.toArray()), [-33,0,-320.5])
    const position = new T.Vector3(site.position.x,site.position.y,site.position.z)
    const forward = new T.Vector3(site.target.x,site.target.y,site.target.z).sub(position).normalize()
    for (const x of [-.725,.725]) for (const y of [-.26,.26]) {
      const point = new T.Vector3(CH1.power[0] + x,CH1.power[1] + y,CH1.power[2] + .04)
      const direction = point.sub(position)
      assert.ok(direction.length() < site.distance)
      assert.ok(forward.angleTo(direction) < site.angle - .1, 'Switch panel lies outside the lamp cone')
    }
    assert.ok(site.intensity > 0, 'Battery guide remains lit before restoring power')
  } finally { f.world.dispose() }
}))

for (const standardLenses of [false,true]) test(`power updates pooled intensity and actual ${standardLenses ? 'Standard' : 'Basic'} lenses, never other sectors`, () => withCanvas(() => {
  const f = fixture({ standardLenses }), environment = f.environment
  const otherSites = f.world.lightSites.filter(site => site.sectorId !== 'berth-5')
  const original = structuredClone(otherSites)
  const assertLevels = (healthy, battery = 32) => {
    for (const site of f.world.lightSites.filter(site => site.sectorId === 'berth-5')) {
      assert.equal(site.intensity, site.circuit === 'healthy' ? site.peak * healthy : site.circuit === 'battery' ? battery : 0)
      for (const lens of site.lenses) {
        const lit = standardLenses ? lens.material.emissiveIntensity : lens.material.color.r+ lens.material.color.g+ lens.material.color.b
        assert.equal(lit > 0, site.intensity > 0)
      }
    }
  }
  assertLevels(0)
  environment.setPower('UNSTABLE'); environment.update(.7)
  assert.ok(environment.snapshot().circuits.filter(c => c.circuit === 'healthy').every(c => c.intensity > 0 && c.intensity <= c.peak*.16))
  assert.equal(environment.snapshot().circuits.find(c => c.damaged).intensity, 0)
  environment.setPower('ON'); environment.update(2); assertLevels(1)
  for (let i = 0; i < 5; i++) { environment.setPower('ON'); environment.update(.1) }
  assertLevels(1)
  // Visiting the dark chapter disables bulbs and battery guides without
  // undoing the actual restored power; a return trip restores the same levels.
  environment.setEnabled(false); environment.update(.1); assertLevels(0,0)
  assert.equal(environment.snapshot().power,'ON')
  assert.equal(environment.snapshot().enabled,false)
  environment.setEnabled(true); assertLevels(1)
  environment.setEnabled(false); environment.reset(); assertLevels(0)
  assert.equal(environment.snapshot().enabled,true)
  environment.setPower('OFF'); assertLevels(0)
  assert.deepEqual(otherSites, original)
  assert.throws(() => environment.setPower('BROKEN'), /Invalid Berth 5 power/)
  f.world.dispose()
}))

test('reduced flashes remain smooth; reset and snapshots are deterministic without scene growth', () => withCanvas(() => {
  const f = fixture(), before = f.environment.snapshot(), boxes = f.g.physics.boxes.length
  let meshes = 0; f.world.root.traverse(o => { if (o.isMesh) meshes++ })
  f.settings.reducedFlashes = true; f.environment.setPower('UNSTABLE')
  let previous = 0
  for (let i = 0; i < 30; i++) {
    f.environment.setPower('UNSTABLE'); f.environment.update(.1)
    const level = f.environment.snapshot().circuits.find(c => c.id === 'berth5-yard').level
    assert.ok(level >= previous && level <= .035); previous = level
  }
  f.environment.update(NaN); f.environment.update(-1)
  assert.ok(Number.isFinite(f.environment.snapshot().elapsed))
  for (let i = 0; i < 4; i++) { f.environment.reset(); assert.deepEqual(f.environment.snapshot(), before) }
  assert.equal(f.g.physics.boxes.length, boxes)
  let after = 0; f.world.root.traverse(o => { if (o.isMesh) after++ }); assert.equal(after, meshes)
  const snapshot = f.environment.snapshot(); snapshot.circuits[0].position.x = 99; snapshot.circuits[0].lenses[0].color[0] = 99
  assert.deepEqual(f.environment.snapshot(), before)
  assert.doesNotThrow(() => JSON.stringify(f.world.snapshot()))
  f.world.dispose()
}))

test('native capsule follows checkpoint, central guard, power, warehouse pickups and western gate', t => withCanvas(() => {
  const f = fixture(), physics = f.g.physics
  const route = [[0,-328],[-5.8,-328],[-5.8,-323],[-5.8,-319.4],[-6,-316],[-8,-307],[-13,-304],[-15,-301],
    [-19,-304],[-23,-305],[-18,-307],[-18,-316],[-33,-316],[-34,-317.5],
    [-18,-317],[-1,-318],[13,-318],[13,-322],[16,-326],[17,-330],[17,-334.1],
    [23,-334.1],[25,-334.1],[27,-334.1]]
  const travel = walk(physics, route, true)
  walk(physics, [...route].reverse(), true)
  const exit = walk(physics, [[13,-318],[13,-312],[8,-309],[4,-294],[-15,-294],[-24,-293],[-36,-291],[-52,-291],[-55,-288],[-57.5,-285],[-61,-285]], true)
  assert.ok(travel + exit > 190, `Authored objective route is too short: ${travel + exit}m`)
  t.diagnostic(JSON.stringify({ routeToWarehouse: travel, entranceToExit: exit }))
  for (const [position,target] of [
    [[-5.8,1.68,-323],CH1.pickups.pistol.position], [[-15,1.68,-302.5],CH1.request],
    [[-23,1.68,-306.5],CH1.isolation], [[-34,1.68,-317.5],CH1.power],
    ...['rifle','knife'].map(id => [[CH1.pickups[id].position[0],1.68,-334.1],CH1.pickups[id].position]),
    [[27,1.68,-334.1],CH1.supplies.position], [[-56,1.68,-285],CH1.gate],
  ]) assert.ok(physics.lineOfSight(new T.Vector3(...position),new T.Vector3(...target)), `${position} cannot see ${target}`)
  for (const [x,z] of CH1.patrolSites) {
    assert.ok(physics.nav.isWalkable(x,z), `Patrol site ${x},${z} obstructed`)
    assert.ok(physics.nav.findPath(new T.Vector3(x,0,z),new T.Vector3(-15,0,-301))?.length)
  }
  for (const actor of CH1.ambush) assert.ok(physics.nav.isWalkable(actor.position[0], actor.position[2]))
  const cover = physics.raycast(new T.Vector3(-20,.7,-301),new T.Vector3(0,0,1),8)
  assert.ok(cover && cover.surface === 'concrete', 'Native barrier protects the central escape route')
  f.world.dispose()
}))

test('complete translated native warehouse retains its openings, interior, nine racks, fixtures and crane', t => withCanvas(() => {
  const f = fixture(), state = f.world.snapshot(), industrial = state.environment.find(layer => layer.source === 'native-ab/z1')
  const shed = state.landmarks.find(item => item.id === 'berth5-warehouse')
  const crane = state.landmarks.find(item => item.id === 'berth5-quay-crane')
  assert.deepEqual(shed.bounds, CH1.warehouse.bounds)
  assert.deepEqual([shed.eave,shed.ridge], [native.warehouseBounds.EAVE,native.warehouseBounds.RIDGE])
  assert.equal(shed.source, 'native-ab'); assert.equal(crane.source, 'native-z1')
  assert.equal(shed.shelfRackCount, 9); assert.ok(shed.furnishingCount >= 40)
  assert.equal(industrial.relocated.length, 3)
  assert.ok(industrial.relocated.every(item => item.from[0] > 0 && item.from[2] < -27 && item.to[0] < 0))
  assert.equal(shed.fixtureCount, 4); assert.equal(shed.skylights.length, 8)
  assert.ok(crane.triangles > 10000 && crane.spreader && crane.colliderCount >= 9)
  assert.deepEqual(industrial.interiorBoxes, [{ min: [1,0,-337], max: [29,9.5,-320] }])
  assert.deepEqual([...f.world.interiorBoxes[0].min.toArray()], [1,0,-337])
  assert.deepEqual([...f.world.interiorBoxes[0].max.toArray()], [29,9.5,-320])
  const boxes = f.g.physics.boxes.filter(box => box.tag === 'campaign-berth5-warehouse')
  assert.ok(boxes.length > 70)
  assert.ok(boxes.some(box => box.min.x === 1 && box.max.x === 29 && box.min.z === -337 && box.max.z === -320 && box.max.y === .03))
  assert.ok(boxes.every(box => box.min.z < -318 && box.max.z < -318), 'No unshifted warehouse physics')
  walk(f.g.physics, [[13,-318],[13,-322]])
  walk(f.g.physics, [[13,-322],[13,-318]])
  walk(f.g.physics, [[27.5,-329],[29.1,-329]])
  const opening = f.g.physics.raycast(new T.Vector3(13,1.68,-318),new T.Vector3(0,0,-1),4)
  assert.equal(opening, null, 'North loading door is genuinely open')
  const wall = f.g.physics.raycast(new T.Vector3(9,1.68,-318),new T.Vector3(0,0,-1),4)
  assert.equal(wall?.box.tag, 'campaign-berth5-warehouse')
  const blocked = f.g.physics.moveCapsule(new T.Vector3(9,0,-318),new T.Vector3(0,0,-3),1)
  assert.ok(blocked.hitWall, 'Solid native shell beside opening stops the player')
  for (const id of ['rifle','knife']) assert.ok(Math.hypot(CH1.pickups[id].position[0]-CH1.gate[0], CH1.pickups[id].position[2]-CH1.gate[2]) > 90)
  const warehouseSites = f.world.lightSites.filter(site => site.id?.startsWith('berth5-warehouse-'))
  assert.equal(warehouseSites.length,4)
  const lensSets = warehouseSites.map(site => new Set(site.lenses.map(lens => lens.material)))
  assert.ok(lensSets.every(set => set.size > 0))
  for (let a=0;a<lensSets.length;a++) for (let b=a+1;b<lensSets.length;b++) {
    assert.ok([...lensSets[a]].every(material => !lensSets[b].has(material)), 'Each pooled fixture has independently owned lenses')
  }
  t.diagnostic(JSON.stringify({ containers: state.containers.containerCount, colliderCount: state.colliderCount,
    warehouseColliders: boxes.length, furnishingCount: shed.furnishingCount, craneTriangles: crane.triangles,
    lightSites: state.lightSiteCount }))
  assert.equal(state.colliderCount, f.g.physics.boxes.length)
  f.world.dispose()
}))

test('wrecks remain baked static V6 meshes; cloned materials retain shaders and own no shared textures', () => withCanvas(() => {
  const f = fixture(), wrecks = f.world.snapshot().environment.filter(layer => layer.kind)
  assert.deepEqual(wrecks.map(wreck => wreck.kind), ['hound','gull'])
  assert.ok(wrecks.every(wreck => wreck.static && wreck.liveEntities === 0 && wreck.animationCallbacks === 0 && wreck.lights === 0))
  assert.ok(wrecks.every(wreck => wreck.reusedTriangles > 1000 && wreck.damageFeatures.length >= 6))
  const cached = new Set(f.materials.values()), cloned = new Set(), geometryCounts = new Map()
  const controlled = new Set(f.world.lightSites.flatMap(site => (site.lenses || []).map(lens => lens.material)))
  const original = new Map([...cached].map(material => [material, material.color.clone()]))
  const borrowed = f.sourceGeometry
  for (const geometry of borrowed) geometry.addEventListener('dispose', () => assert.fail('Disposed borrowed native prop geometry'))
  const generated = new Set()
  f.world.root.traverse(mesh => { if (mesh.isMesh && !mesh.isInstancedMesh && !borrowed.has(mesh.geometry)) generated.add(mesh.geometry) })
  const generatedDisposals = new Map([...generated].map(geometry => [geometry,0]))
  for (const geometry of generated) geometry.addEventListener('dispose', () => generatedDisposals.set(geometry,generatedDisposals.get(geometry)+1))
  for (const source of cached) source.addEventListener('dispose', () => assert.fail('Disposed borrowed material'))
  f.texture.addEventListener('dispose', () => assert.fail('Disposed shared texture'))
  f.world.root.traverse(object => {
    assert.ok(!object.isSkinnedMesh && !object.isBone)
    if (!object.isMesh) return
    for (const attribute of Object.values(object.geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite))
    if (object.name.startsWith('aftermath-')) {
      geometryCounts.set(object.geometry, 0)
      object.geometry.addEventListener('dispose', () => geometryCounts.set(object.geometry, geometryCounts.get(object.geometry)+1))
    }
    const material = object.material
    if (!controlled.has(material) && !object.name.endsWith(':source-armor') && !object.name.endsWith(':source-machinery')) return
    cloned.add(material)
    const source = [...cached].find(source => source.name === material.name)
    assert.ok(source)
    assert.deepEqual(material.defines, source.defines)
    assert.equal(material.onBeforeCompile, source.onBeforeCompile)
    assert.equal(material.customProgramCacheKey, source.customProgramCacheKey)
    assert.equal(material.map, source.map)
  })
  assert.ok(cloned.size >= 7)
  const counts = new Map([...cloned].map(material => [material,0]))
  for (const material of cloned) material.addEventListener('dispose', () => counts.set(material,counts.get(material)+1))
  f.environment.setPower('ON'); f.environment.update(3); f.environment.reset()
  for (const [material,color] of original) assert.ok(material.color.equals(color), `Mutated source ${material.name}`)
  f.world.dispose(); f.world.dispose()
  assert.equal(f.g.physics.boxes.length,0)
  for (const count of counts.values()) assert.equal(count,1)
  for (const count of geometryCounts.values()) assert.equal(count,1)
  for (const count of generatedDisposals.values()) assert.equal(count,1)
}))

test('CH1 leaves every other sector placement, container and boundary unchanged', () => withCanvas(() => {
  const m1 = fixture({ chapter1: false }), ch1 = fixture()
  const a = m1.world.snapshot(), b = ch1.world.snapshot()
  assert.deepEqual(a.boundaries,b.boundaries)
  assert.deepEqual(a.nativePlacements.filter(p => p.sectorId !== 'berth-5'),b.nativePlacements.filter(p => p.sectorId !== 'berth-5'))
  const nonChapterContainers = state => state.containers.chunks.filter(chunk => !chunk.id.startsWith('berth-5:'))
  assert.deepEqual(nonChapterContainers(a),nonChapterContainers(b))
  assert.deepEqual(m1.world.lightSites.filter(s => s.sectorId !== 'berth-5'),ch1.world.lightSites.filter(s => s.sectorId !== 'berth-5'))
  assert.ok(b.containers.chunks.filter(chunk => chunk.id.startsWith('berth-5:')).flatMap(chunk => chunk.placements).some(p => p.y === 5.18))
  const detached = ch1.world.snapshot()
  detached.landmarks.find(item => item.id === 'berth5-warehouse').entrances[0].min[0] = 999
  assert.equal(ch1.world.snapshot().landmarks.find(item => item.id === 'berth5-warehouse').entrances[0].min[0],11)
  m1.world.dispose(); ch1.world.dispose()
}))

test('an incomplete native warehouse fails without leaving partial geometry or collider handles', () => withCanvas(() => {
  let g
  assert.throws(() => fixture({ configure(game) {
    g = game
    g.campaignFactories.warehouse = context => {
      context.box('steel_dark',2,3,2,0,1.5,0)
      context.col(-1,0,-1,1,3,1,'metal')
      return { lights: [], skylights: [] }
    }
  } }), /Complete native warehouse/)
  assert.equal(g.physics.boxes.length,0)
  assert.equal(g.scene.children.length,0)
}))
