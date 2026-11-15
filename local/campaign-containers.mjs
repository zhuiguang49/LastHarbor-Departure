const VARIANTS = [
  { seed: 0, color: 'teal', wear: .5, doors: 0 },
  { seed: 1, color: 'orange', wear: .5, doors: 0 },
  { seed: 2, color: 'grey', wear: .5, doors: 0 },
]

// Original M3/zA container40: 12.19 x 2.59 x 2.44 metres, closed doors.
// Owns only chunk Groups, InstancedMesh buffers and native collider handles.
// All factory geometry/material/texture resources remain borrowed and unmodified.
// Add each returned root to an identity world/chunk parent; placements use world
// coordinates. The caller batches physics.build() after creating/removing chunks.
export function createCampaignContainers(g) {
  const T = g.THREE, chunks = new Map()
  let disposed = false
  const templates = VARIANTS.map(options => {
    const source = g.props.build('container40', options), parts = []
    // Yg silently falls back to a plain box if a factory throws. Reject that.
    if (source.name !== 'container40' || source.userData.color !== options.color || source.userData.doors !== 0) {
      throw Error('Campaign requires the complete original container40 factory')
    }
    source.updateMatrixWorld(true)
    source.traverse(mesh => {
      if (!mesh.isMesh) return
      parts.push({ geometry: mesh.geometry, material: mesh.material, matrix: mesh.matrixWorld.clone(),
        castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow, layers: mesh.layers.mask,
        renderOrder: mesh.renderOrder,
        // Do not call computeBoundingBox/Sphere on borrowed factory geometry.
        bounds: new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position) })
    })
    return { options, parts, colliders: source.userData.colliders }
  })

  function createChunk({ index, from, to }) {
    if (disposed) throw Error('Campaign containers have been disposed')
    if (!Number.isInteger(index) || index < 0 || chunks.has(index)) throw Error('Invalid or duplicate container chunk index')
    if (!Number.isFinite(from) || !Number.isFinite(to) || to - from < 24.38) throw Error('Container chunk requires at least 24.38 metres')
    const template = templates[index % templates.length], placements = []
    for (const z of [-1, 17]) for (const fraction of [.25, .75]) {
      placements.push({ name: 'container40', x: from + (to - from) * fraction, y: 0, z,
        yaw: z < 2 ? 0 : Math.PI, ...template.options })
    }
    return instantiate(index, placements, (from + to) / 2, 0, { index, from, to }, `m0-containers-${index}`)
  }

  // M1: bounded native templates, arbitrary cardinal placements, one local
  // instancing root per spatial batch. No new seeds/material variants per box.
  function createInstances({ id, placements }) {
    if (disposed) throw Error('Campaign containers have been disposed')
    if (typeof id !== 'string' || !id || chunks.has(id)) throw Error('Invalid or duplicate container batch id')
    if (!Array.isArray(placements) || !placements.length) throw Error('Container batch requires placements')
    const resolved = placements.map(p => {
      const variant = p.variant ?? 0, yaw = p.yaw ?? 0
      if (!Number.isInteger(variant) || !templates[variant] ||
          ![p.x, p.y ?? 0, p.z, yaw].every(Number.isFinite) ||
          Math.abs(yaw / (Math.PI / 2) - Math.round(yaw / (Math.PI / 2))) > 1e-8) {
        throw Error('Container instances require finite cardinal placements and a cached variant')
      }
      return { name: 'container40', x: p.x, y: p.y ?? 0, z: p.z, yaw, ...templates[variant].options }
    })
    return instantiate(id, resolved, resolved.reduce((n, p) => n + p.x, 0) / resolved.length,
      resolved.reduce((n, p) => n + p.z, 0) / resolved.length, { id }, `m1-containers-${id}`)
  }

  function instantiate(key, placements, centerX, centerZ, metadata, name) {
    const root = new T.Group(), colliders = [], batches = []
    root.name = name
    root.position.set(centerX, 0, centerZ)
    const transforms = placements.map(placement => new T.Matrix4().compose(
      new T.Vector3(placement.x - centerX, placement.y, placement.z - centerZ),
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), placement.yaw), new T.Vector3(1, 1, 1)))
    for (const template of templates) {
      const indices = placements.flatMap((placement, index) => placement.seed === template.options.seed ? [index] : [])
      if (!indices.length) continue
      for (const part of template.parts) {
        const batch = new T.InstancedMesh(part.geometry, part.material, indices.length)
        batch.name = `container40-${part.material.name}`
        batch.castShadow = part.castShadow
        batch.receiveShadow = part.receiveShadow
        batch.layers.mask = part.layers
        batch.renderOrder = part.renderOrder
        batch.boundingBox = new T.Box3()
        for (let i = 0; i < indices.length; i++) {
          const matrix = transforms[indices[i]].clone().multiply(part.matrix)
          batch.setMatrixAt(i, matrix)
          batch.boundingBox.union(part.bounds.clone().applyMatrix4(matrix))
        }
        batch.instanceMatrix.needsUpdate = true
        batch.boundingSphere = batch.boundingBox.getBoundingSphere(new T.Sphere())
        root.add(batch)
        batches.push(batch)
      }
    }
    // Like ob.place/M, transform the factory's local colliders into world AABBs.
    // Cardinal yaw needs no native oblique-box subdivision.
    const worldOffset = new T.Matrix4().makeTranslation(centerX, 0, centerZ)
    for (let index = 0; index < transforms.length; index++) {
      const template = templates.find(item => item.options.seed === placements[index].seed)
      for (const box of template.colliders) {
        const bounds = new T.Box3(new T.Vector3(...box.min), new T.Vector3(...box.max))
          .applyMatrix4(worldOffset.clone().multiply(transforms[index]))
        colliders.push(g.physics.addBox(bounds.min, bounds.max, { surface: box.surface, tag: 'campaign-container' }))
      }
    }
    let removed = false
    const chunk = { root, colliders,
      snapshot: () => ({ ...metadata, disposed: removed, containerCount: removed ? 0 : placements.length,
        batchCount: removed ? 0 : batches.length, colliderCount: colliders.length,
        placements: placements.map(placement => ({ ...placement })) }),
      dispose() {
        if (removed) return
        removed = true
        root.removeFromParent()
        for (const batch of batches) batch.dispose()
        root.clear()
        for (const handle of colliders) g.physics.removeBox(handle)
        colliders.length = 0
        chunks.delete(key)
      },
    }
    chunks.set(key, chunk)
    return chunk
  }

  return { createChunk, createInstances,
    snapshot: () => ({ source: 'g.props.build/container40', disposed, templateCount: templates.length,
      geometryCount: new Set(templates.flatMap(template => template.parts.map(part => part.geometry))).size,
      materialCount: new Set(templates.flatMap(template => template.parts.map(part => part.material))).size,
      containerCount: [...chunks.values()].reduce((sum, chunk) => sum + chunk.snapshot().containerCount, 0),
      chunks: [...chunks.values()].map(chunk => chunk.snapshot()) }),
    dispose() {
      if (disposed) return
      disposed = true
      for (const chunk of [...chunks.values()]) chunk.dispose()
    },
  }
}
