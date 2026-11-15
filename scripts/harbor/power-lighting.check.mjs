import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parse } from '@babel/parser'
import { installPowerLighting } from './power-lighting.mjs'
import { createInfrastructure } from './infrastructure-state.mjs'

// Exercise the exact shipped Three r180 geometry/material implementation,
// without booting the DOM, WebGL renderer, or another copy of Three.
const html = fs.readFileSync(new URL('../../几猫国产3A大作_V1-fable5.2.html', import.meta.url), 'utf8')
const code = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const body = parse(code).program.body[0].expression.callee.body.body
const boundary = body.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === 'oi'))
assert.ok(boundary, 'Original Three/application boundary changed')
const T = Function(`return ${code.slice(0, boundary.start).trimStart()} return lt;})()`)()

function fixture({ nonIndexed = false, transformed = false, omitBulb = false, defer = false } = {}) {
  const scene = new T.Scene(), root = new T.Group(), materials = new Map()
  scene.add(root)
  const emissive = (color, strength) => {
    const key = `${color}:${strength}`
    if (!materials.has(key)) materials.set(key, new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(strength) }))
    return materials.get(key)
  }
  function merged(geometries, material) {
    const positions = [], normals = [], uvs = [], indices = []
    for (const geometry of geometries) {
      const offset = positions.length / 3
      positions.push(...geometry.attributes.position.array)
      normals.push(...geometry.attributes.normal.array)
      uvs.push(...geometry.attributes.uv.array)
      indices.push(...Array.from(geometry.index.array, i => i + offset))
    }
    let geometry = new T.BufferGeometry()
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    if (nonIndexed) geometry = geometry.toNonIndexed()
    const mesh = new T.Mesh(geometry, material)
    if (transformed) {
      mesh.position.set(2, 1, -3); mesh.rotation.y = .3; mesh.scale.setScalar(.8)
      mesh.updateMatrix()
      geometry.applyMatrix4(mesh.matrix.clone().invert())
    }
    mesh.layers.mask = 5
    root.add(mesh)
    return mesh
  }
  const mastMaterial = emissive(16769981, 8), shedMaterial = emissive(16757864, 7)
  const masts = [[-23.4,.5],[-23.4,21.4],[17,-8.7],[17,18.6],[-20.6,-11.6],[-27.6,-.9],[-36.3,12.4],[26.6,-28.7],[26.6,26.7]]
  const mastGeometry = masts.filter((_, i) => !omitBulb || i !== 0).flatMap(([x, z]) => [-.55, .55].flatMap(dz => [-.34, .34].map(dx =>
    new T.PlaneGeometry(.28, .2).translate(x + dx, 13.2, z + dz))))
  // An unrelated shared-material face must survive byte-for-byte.
  mastGeometry.push(new T.PlaneGeometry(.2, .2).translate(100, 3, 100))
  const mastMesh = merged(mastGeometry, mastMaterial)
  const shedGeometry = []
  for (const z of [-15.4, -23.6]) for (const x of [-13.6, -8.5, -3.5, 2.6, 8.6]) {
    if (z < -20 && x < -10) continue
    shedGeometry.push(new T.CylinderGeometry(.24, .24, .02, 14).translate(x, 6.07, z))
  }
  const shedMesh = merged(shedGeometry, shedMaterial)
  const shedLights = [[-8.5,-15.4],[2.6,-15.4],[-3.5,-23.6],[8.6,-23.6]].map(([x,z]) => {
    const light = new T.PointLight(0xffbbaa, 34, 13, 2)
    light.position.set(x, 5.75, z); root.add(light)
    return light
  })
  const lamps = []
  function lamp(position, intensity, lens = false) {
    const light = new T.SpotLight(0xffddaa, intensity)
    light.position.set(...position); root.add(light)
    if (lens) {
      const mesh = new T.Mesh(new T.PlaneGeometry(.2, .1), new T.MeshStandardMaterial({ emissive: 0xffddaa, emissiveIntensity: 2 }))
      mesh.material.onBeforeCompile = () => 'original shader'
      mesh.material.customProgramCacheKey = () => 'original key'
      light.userData.lens = mesh; root.add(mesh)
    }
    lamps.push({ light, peak: intensity })
    return light
  }
  lamp([-23.4,13.2,.5],700); lamp([17,13.2,18.6],750)
  lamp([17,13.2,-8.7],500); lamp([-36.3,13.2,12.4],600)
  lamp([28.4,2.3,18.4],65,true); lamp([1.9,1.7,7.4],22,true)
  const independent = lamp([27.7,2.5,20],14,true)
  const pumpLight = lamp([24.2,2.1,-.8],0,true)
  const distant = new T.Mesh(new T.PlaneGeometry(), mastMaterial)
  distant.name = 'backdrop-lamps'; scene.add(distant)
  const render = Object.freeze({ exposure: 1.25, viewFill: 6.5, autoExposure: false, sky: Object.freeze({}) })
  const g = { THREE: T, scene, render, level: { root, shedLights }, mats: { emissive } }
  const state = createInfrastructure(), settings = { reducedFlashes: false }
  const originals = { mastMesh, shedMesh, mastMaterial, shedMaterial, distant, independent,
    mastColor: mastMaterial.color.toArray(), shedColor: shedMaterial.color.toArray(), render,
    lensMaterial: pumpLight.userData.lens.material }
  const install = () => installPowerLighting(g, { lamps: [...lamps].reverse(), pumpLight, settings, state: state.state })
  const lighting = defer ? null : install()
  return { g, lamps, state, settings, originals, lighting, install }
}
const byId = lighting => Object.fromEntries(lighting.snapshot().circuits.map(item => [item.id, item]))
function tick(world, dt) { world.state.tick(dt); return world.lighting.update(dt, world.state.state) }

test('OFF binds every original fixture, extinguishes emergency light AND bulb, preserves independent sources', () => {
  const w = fixture(), snapshot = w.lighting.snapshot(), branches = byId(w.lighting)
  assert.equal(snapshot.fixtures.length, 18)
  for (const item of snapshot.fixtures) assert.equal(item.triangles, item.id.startsWith('mast:') ? 8 : 56)
  for (const item of snapshot.circuits.filter(item => item.group.startsWith('EM_'))) {
    if (item.intensity !== null) assert.equal(item.intensity, 0)
    for (const bulb of item.bulbs) {
      if (bulb.emissiveIntensity === null) assert.deepEqual(bulb.color, [0,0,0])
      else assert.equal(bulb.emissiveIntensity, 0)
    }
  }
  assert.equal(branches['west-guide'].intensity, 72)
  assert.equal(w.originals.independent.intensity, 14)
  assert.strictEqual(w.originals.distant.material, w.originals.mastMaterial)
  assert.deepEqual(w.originals.mastMaterial.color.toArray(), w.originals.mastColor)
  assert.deepEqual(w.originals.shedMaterial.color.toArray(), w.originals.shedColor)
  assert.equal(w.originals.mastMesh.geometry.index.count, 6, 'Unrelated shared-material face retained')
  assert.equal(w.originals.shedMesh.visible, false)
  assert.equal(w.g.render, w.originals.render)
})

test('UNSTABLE uses the existing 1.5-second state, with local attempts, dock waiting and no state mutation', () => {
  const w = fixture()
  w.state.request('power')
  let attempted = false
  for (let i = 0; i < 29; i++) {
    const before = { ...w.state.state }
    w.lighting.update(0, w.state.state)
    assert.deepEqual(w.state.state, before)
    const cue = tick(w, .05), branches = byId(w.lighting)
    attempted ||= branches['yard-west'].intensity > 0 && branches['yard-west'].bulbs[0].color[0] > 0
    assert.equal(branches.pump.intensity, 0); assert.equal(branches.berth.intensity, 0)
    assert.equal(branches['west-guide'].intensity, 72)
    assert.equal(cue.spark, false)
  }
  assert.equal(w.state.state.power, 'UNSTABLE'); assert.ok(attempted)
  tick(w, .051); assert.equal(w.state.state.power, 'ON')
})

test('ON cascades over 2.5 seconds; corresponding lamp and bulb agree; damaged and distant zones stay unchanged', () => {
  const w = fixture(), before = w.lighting.snapshot()
  w.state.request('power'); tick(w, 1.5); tick(w, .5)
  let branches = byId(w.lighting)
  assert.ok(branches['yard-west'].intensity > 0)
  assert.equal(branches['yard-south'].intensity, 0)
  assert.equal(branches.berth.intensity, 0)
  tick(w, 2)
  branches = byId(w.lighting)
  assert.equal(branches['yard-west'].intensity, 420)
  assert.equal(branches['yard-south'].intensity, 450)
  assert.equal(branches['yard-damaged'].intensity, 0)
  assert.equal(branches.pump.intensity, 40)
  assert.equal(branches.berth.intensity, 65)
  assert.equal(branches['junction-a'].intensity, 0)
  assert.ok(w.g.level.shedLights.every(light => light.intensity === 34 * .84))
  for (const branch of w.lighting.snapshot().circuits) {
    if (branch.damaged) for (const bulb of branch.bulbs) assert.deepEqual(bulb.color, [0,0,0])
    if (branch.group === 'BAT_GUIDE') assert.deepEqual(branch, before.circuits.find(item => item.id === branch.id))
  }
  const lens = w.lamps.at(-1).light.userData.lens.material
  assert.equal(lens.emissiveIntensity, 2)
  assert.notStrictEqual(lens, w.originals.lensMaterial)
  assert.strictEqual(lens.onBeforeCompile, w.originals.lensMaterial.onBeforeCompile)
  assert.strictEqual(lens.customProgramCacheKey, w.originals.lensMaterial.customProgramCacheKey)
  assert.equal(w.g.scene.children.find(item => item.name === 'backdrop-lamps').material.color.r, 8)
})

test('reset exactly restores OFF without accumulating dimming or changing infrastructure', () => {
  const w = fixture(), initial = w.lighting.snapshot()
  for (let run = 0; run < 3; run++) {
    w.state.request('power'); tick(w, 1.5); tick(w, 3)
    const held = w.lighting.snapshot()
    w.lighting.update(0, w.state.state)
    assert.deepEqual(w.lighting.snapshot(), held)
    w.state.reset(); w.lighting.reset(w.state.state)
    assert.deepEqual(w.lighting.snapshot(), initial)
  }
  const returned = w.lighting.snapshot()
  returned.fixtures[0].position[0] = 900
  returned.circuits[0].bulbs[0].color[0] = 900
  assert.deepEqual(w.lighting.snapshot(), initial, 'Snapshots do not expose mutable materials or positions')
})

test('fault cues and reduced flashes are deterministic, local, isolated on stabilization and resettable', () => {
  const a = fixture(), b = fixture()
  a.settings.reducedFlashes = b.settings.reducedFlashes = true
  for (const dt of [3.1, .3, 5.7, .3, 4.7]) {
    assert.deepEqual(tick(a, dt), tick(b, dt))
    assert.deepEqual(a.lighting.snapshot(), b.lighting.snapshot())
    assert.equal(byId(a.lighting)['junction-a'].intensity, 6)
    assert.equal(a.lighting.snapshot().fault.spark, false)
  }
  a.state.reset(); a.lighting.reset(a.state.state); a.settings.reducedFlashes = false
  assert.equal(tick(a, 9.1).spark, true)
  assert.equal(a.lighting.snapshot().fault.event, 0)
  a.state.request('power'); tick(a, .5)
  assert.equal(byId(a.lighting)['junction-a'].intensity, 0)
  assert.equal(a.lighting.snapshot().fault.spark, false)
  tick(a, 1); tick(a, 15)
  assert.equal(byId(a.lighting)['junction-a'].intensity, 0)
  b.state.request('power')
  let previous = 0
  for (let i = 0; i < 25; i++) {
    tick(b, .05)
    const level = byId(b.lighting)['yard-west'].level
    assert.ok(level >= previous && level <= .025)
    previous = level
  }
})

test('indexed/non-indexed and transformed batches retain attributes, layers and bounded draw/shadow counts', () => {
  for (const nonIndexed of [false, true]) {
    const w = fixture({ nonIndexed, transformed: true }), parts = []
    w.g.level.root.traverse(object => { if (object.name.startsWith('power-bulbs:')) parts.push(object) })
    assert.equal(parts.length, 10, 'Five mast partitions and five shed partitions replace two batches')
    assert.equal(parts.reduce((sum, part) => sum + part.geometry.index.count / 3, 0), 9 * 8 + 9 * 56)
    for (const part of parts) {
      assert.deepEqual(Object.keys(part.geometry.attributes), ['position', 'normal', 'uv'])
      assert.equal(part.layers.mask, 5)
      assert.equal(part.castShadow, false); assert.equal(part.receiveShadow, false)
    }
    assert.ok(w.lamps.every(({ light }) => !light.castShadow))
  }
})

test('missing original bulb mapping fails before mutating scene objects', () => {
  const w = fixture({ omitBulb: true, defer: true }), count = w.g.level.root.children.length
  const geometry = w.originals.mastMesh.geometry
  assert.throws(w.install, /original bulb mapping incomplete: mast:-23.4,0.5/)
  assert.equal(w.g.level.root.children.length, count)
  assert.strictEqual(w.originals.mastMesh.geometry, geometry)
  assert.strictEqual(w.originals.mastMesh.material, w.originals.mastMaterial)
  assert.strictEqual(w.originals.shedMesh.material, w.originals.shedMaterial)
  assert.equal(w.originals.shedMesh.visible, true)
})
