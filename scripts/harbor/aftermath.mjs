import { buildRobotWreck } from './aftermath-robots.mjs'
import { createCasualties } from './aftermath-casualties.mjs'
import { createAftermathDecals } from './aftermath-decals.mjs'
import { createAftermathProps } from './aftermath-props.mjs'
import { createAftermathSignage } from './aftermath-signage.mjs'

export const AFTERMATH_ZONES = [
  { id: 'S1', position: [-26.8, 0, 7.9], story: 'Interrupted checkpoint evacuation' },
  { id: 'S2', position: [-15.2, 0, 4.4], story: 'Survivors disabled a security hound' },
  { id: 'S3', position: [2.7, 0, 8.3], story: 'Interrupted live electrical repair' },
  { id: 'S4', position: [-5.3, .03, -25.75], story: 'Warehouse support team and crashed security drone' },
  { id: 'S5', position: [25.45, 0, 22.1], story: 'Failed final boarding' },
]
const installed = new WeakMap()
export function installAftermath(g, { enabled = true } = {}) {
  if (installed.has(g)) return installed.get(g)
  const T = g.THREE, root = new T.Group(), robots = [], colliders = [], layers = []
  root.name = 'last-harbor-aftermath'
  let disposed = false, casualties, decals, signage
  function box(min, max, tag) {
    colliders.push(g.physics.addBox(new T.Vector3(...min), new T.Vector3(...max), { surface: 'metal', tag: `aftermath:${tag}` }))
  }
  if (enabled) {
    g.scene.add(root)
    for (const [kind, position, yaw] of [
      ['hound', [-15.2, .004, 4.4], -.18],
      ['gull', [7.8, .034, -22.1], .54],
    ]) {
      const robot = buildRobotWreck(g, kind); robot.group.position.set(...position); robot.group.rotation.y = yaw
      root.add(robot.group); robots.push(robot); layers.push(robot)
    }
    casualties = createCasualties(g, { placements: [
      { id: 'checkpoint-worker', position: [-26.8, .004, 7.9], yaw: Math.PI / 2, variant: 'checkpoint', seed: 671 },
      { id: 'warehouse-technician', position: [-5.3, .034, -25.75], yaw: Math.PI / 2, variant: 'warehouse', seed: 672 },
      { id: 'dock-evacuee', position: [25.45, .004, 22.1], yaw: -Math.PI / 2, variant: 'dock', seed: 673 },
    ] })
    root.add(casualties.root); layers.push(casualties)
    const props = createAftermathProps(g); root.add(props.root); layers.push(props)
    const marks = [
      { id: 'S1-washed-injury', kind: 'dilute', position: [-27, .008, 7.58], size: [.8, .6], yaw: .2 },
      { id: 'S1-trail', kind: 'drag', position: [-25.9, .008, 7.87], size: [.45, 1.2], yaw: 1.6 },
      { id: 'S2-burn', kind: 'scorch', position: [-15.2, .008, 4.4], size: [1.5, 1.25] },
      { id: 'S3-arc-flash', kind: 'scorch', position: [2.28, .008, 7.91], size: [.8, .8] },
      { id: 'S4-injury', kind: 'indoor', position: [-5.8, .038, -25.5], size: [.85, .65], yaw: .5 },
      { id: 'S4-drag', kind: 'drag', environment: 'indoor', position: [-5.4, .038, -24.8], size: [.6, 1.9], yaw: .35 },
      { id: 'S4-boot-print', kind: 'print', position: [-5.05, .038, -23.75], size: [.22, .34], yaw: -.1 },
      { id: 'S4-drone-skid', kind: 'scorch', position: [7.9, .038, -22.1], size: [1.6, 1.2] },
      { id: 'S5-drag', kind: 'drag', position: [26, .008, 22.1], size: [.5, 1.5], yaw: 1.4 },
      { id: 'S5-washed-injury', kind: 'dilute', position: [25.9, .008, 22.18], size: [.8, .6] },
      { id: 'S1-small-splatter', kind: 'splatter', position: [-26.95, .008, 7.12], size: [.58, .48], yaw: .3 },
      { id: 'S1-departing-drops', kind: 'drops', position: [-25.6, .008, 7.52], size: [.34, .76], yaw: 1.1 },
      { id: 'S4-dried-splatter', kind: 'splatter', environment: 'indoor', position: [-5.85, .038, -24.92], size: [.52, .44], yaw: -.6 },
      { id: 'S4-dried-drops', kind: 'drops', environment: 'indoor', position: [-4.92, .038, -24.12], size: [.3, .66], yaw: -.2 },
      { id: 'S5-rain-splatter', kind: 'splatter', position: [26.12, .008, 21.3], size: [.55, .45], yaw: .9 },
    ]
    // Project small chips onto the actual authored mesh, not approximate collider faces.
    g.scene.updateMatrixWorld(true)
    for (let i = 0; i < 6; i++) {
      const checkpoint = i < 3, n = i % 3
      const origin = new T.Vector3(...(checkpoint ? [-32.5, .4 + n * .09, 7.7 + n * .22] : [-5.8 + n * .18, .8 + n * .13, -25.1]))
      const direction = new T.Vector3(...(checkpoint ? [-1, 0, 0] : [0, 0, -1]))
      const ray = new T.Raycaster(origin, direction, 0, 3)
      const hit = ray.intersectObjects(g.scene.children, true).find(h => h.object.isMesh && h.face && h.object.visible)
      if (!hit) throw Error(`No supporting surface for aftermath impact ${i}`)
      const normal = hit.face.normal.clone().applyNormalMatrix(new T.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize()
      marks.push({ id: `${checkpoint ? 'S1' : 'S4'}-impact-${n}`, kind: 'impact', position: hit.point.clone().addScaledVector(normal, .001).toArray(), normal: normal.toArray(), size: [.15, .15] })
    }
    decals = createAftermathDecals(g, marks); root.add(decals.root); layers.push(decals)
    signage = createAftermathSignage(g); root.add(signage.root); layers.push(signage)
    // Physical cores only. Thin tarp skirts, cables, papers and casings are step-over dressing.
    box([-15.58, .015, 4.06], [-14.83, .5, 4.79], 'hound-core')
    box([7.52, .045, -22.4], [8.08, .46, -21.82], 'gull-core')
    g.physics.build()
  }
  const api = {
    reset() { if (!disposed) casualties?.reset() },
    snapshot() {
      let objects = 0, meshes = 0, triangles = 0
      const geometries = new Set(), materials = new Set(), textures = new Set()
      if (!disposed && enabled) root.traverse(o => {
        objects++
        if (!o.isMesh) return
        meshes++; geometries.add(o.geometry); triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          materials.add(m); for (const value of Object.values(m)) if (value?.isTexture) textures.add(value)
        }
      })
      return { enabled, disposed, rootCount: root.parent ? 1 : 0, objects, meshes, triangles,
        colliders: colliders.map(b => ({ min: b.min.toArray(), max: b.max.toArray(), tag: b.tag })),
        robots: robots.map(r => r.snapshot()), casualties: casualties?.snapshot(), marks: decals?.snapshot(), signage: signage?.snapshot(),
        zones: structuredClone(AFTERMATH_ZONES), resourceCounts: { geometries: geometries.size, materials: materials.size, textures: textures.size },
        lifecycle: 'Installed once; immutable scenery persists through new runs. No update callback.',
      }
    },
    dispose() {
      if (disposed) return
      disposed = true; root.removeFromParent(); layers.forEach(layer => layer.dispose()); root.clear()
      colliders.forEach(b => g.physics.removeBox(b)); colliders.length = 0
      if (enabled) g.physics.build()
      installed.delete(g)
    },
  }
  installed.set(g, api); return api
}
