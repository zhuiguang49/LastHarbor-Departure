// Paint cut from the shipped container triangles, including corrugation and dents.
// No replacement container, guessed flat face, borrowed material or external image.
export const AFTERMATH_SIGNAGE = [
  { id: 'S1-infectious-container', container: [-19.45, 2.08], side: 1, along: 1.05, height: 1.23, size: [1.04, 1.12] },
  { id: 'S2-quarantined-container', container: [-13.6, 9.92], side: -1, along: -2.15, height: 1.23, size: [1.04, 1.12] },
  { id: 'S5-sealed-container', container: [13.53, 12.42], side: 1, along: 1.05, height: 1.23, size: [1.04, 1.12] },
]

function paintTexture(T) {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 832
  const ctx = canvas.getContext('2d'), symbol = document.createElement('canvas')
  symbol.width = symbol.height = 256
  const ink = symbol.getContext('2d')
  ink.translate(128, 128); ink.fillStyle = '#161913'
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + i * Math.PI * 2 / 3
    ink.beginPath(); ink.arc(Math.cos(a) * 44, Math.sin(a) * 44, 64, 0, Math.PI * 2); ink.fill()
  }
  ink.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + i * Math.PI * 2 / 3
    ink.beginPath(); ink.arc(Math.cos(a) * 66, Math.sin(a) * 66, 48, 0, Math.PI * 2); ink.fill()
  }
  ink.globalCompositeOperation = 'source-over'; ink.strokeStyle = '#161913'; ink.lineWidth = 10
  ink.beginPath(); ink.arc(0, 0, 42, 0, Math.PI * 2); ink.stroke()
  ink.globalCompositeOperation = 'destination-out'
  ink.beginPath(); ink.arc(0, 0, 14, 0, Math.PI * 2); ink.fill()
  ink.lineWidth = 5
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + i * Math.PI * 2 / 3
    ink.beginPath(); ink.moveTo(0, 0); ink.lineTo(Math.cos(a) * 32, Math.sin(a) * 32); ink.stroke()
  }
  ctx.fillStyle = '#b49a48'; ctx.fillRect(20, 20, 728, 792)
  ctx.strokeStyle = '#20231b'; ctx.lineWidth = 14; ctx.strokeRect(40, 40, 688, 752)
  ctx.drawImage(symbol, 164, 72, 440, 440)
  ctx.fillStyle = '#171c15'; ctx.textAlign = 'center'
  ctx.font = '900 84px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.fillText('感染性废物', 384, 568)
  ctx.font = '800 70px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.fillText('隔离封存', 384, 662)
  ctx.font = 'bold 52px sans-serif'; ctx.fillText('BIOHAZARD', 384, 738)
  ctx.font = '24px sans-serif'; ctx.fillText('07 / 医疗废物 · 禁止开箱', 384, 778)
  // Small paint losses reveal the original steel; the symbol/text remain legible.
  let seed = 723
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
  ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,.48)'
  for (let i = 0; i < 680; i++) ctx.fillRect(20 + random() * 728, 20 + random() * 792, 1 + random() * 5, 1 + random() * 7)
  for (let i = 0; i < 24; i++) ctx.fillRect(24 + random() * 720, 20 + random() * 792, 1, 12 + random() * 60)
  const map = new T.CanvasTexture(canvas); map.colorSpace = T.SRGBColorSpace; map.anisotropy = 4
  return map
}

// Sutherland–Hodgman clipping keeps source triangle edges and holes intact.
function clip(vertices, axis, limit, sign) {
  const out = []
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length]
    const da = sign * (a.getComponent(axis) - limit), db = sign * (b.getComponent(axis) - limit)
    if (da <= 0) out.push(a)
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) out.push(a.clone().lerp(b, da / (da - db)))
  }
  return out
}

function fittedPaint(T, support, frame, size) {
  const inverse = frame.clone().invert(), positions = [], uvs = []
  const half = [size[0] / 2, size[1] / 2], a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3()
  const ab = new T.Vector3(), ac = new T.Vector3(), normal = new T.Vector3()
  support.traverse(object => {
    if (!object.isMesh || !object.visible) return
    const geometry = object.geometry, attr = geometry.attributes.position, index = geometry.index
    const transform = inverse.clone().multiply(object.matrixWorld)
    const slots = Array.isArray(object.material) ? object.material : [object.material]
    const groups = Array.isArray(object.material) ? geometry.groups : [{ start: 0, count: index?.count || attr.count, materialIndex: 0 }]
    for (const group of groups) {
      const material = slots[group.materialIndex]
      if (!material?.isMeshStandardMaterial || material.transparent) continue
      for (let i = group.start; i < group.start + group.count; i += 3) {
        a.fromBufferAttribute(attr, index ? index.getX(i) : i).applyMatrix4(transform)
        b.fromBufferAttribute(attr, index ? index.getX(i + 1) : i + 1).applyMatrix4(transform)
        c.fromBufferAttribute(attr, index ? index.getX(i + 2) : i + 2).applyMatrix4(transform)
        if (Math.max(a.x, b.x, c.x) < -half[0] || Math.min(a.x, b.x, c.x) > half[0] ||
            Math.max(a.y, b.y, c.y) < -half[1] || Math.min(a.y, b.y, c.y) > half[1] ||
            Math.max(a.z, b.z, c.z) < -.085 || Math.min(a.z, b.z, c.z) > .006) continue
        normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize()
        if (normal.z < .45) continue // Reject back faces, frame edges and the inside wall.
        let polygon = [a.clone(), b.clone(), c.clone()]
        for (const [axis, limit, sign] of [[0, -half[0], -1], [0, half[0], 1], [1, -half[1], -1], [1, half[1], 1], [2, -.085, -1], [2, .006, 1]]) polygon = clip(polygon, axis, limit, sign)
        for (let j = 1; j + 1 < polygon.length; j++) for (const v of [polygon[0], polygon[j], polygon[j + 1]]) {
          positions.push(v.x, v.y, v.z + .0012); uvs.push(v.x / size[0] + .5, v.y / size[1] + .5)
        }
      }
    }
  })
  if (!positions.length) throw Error('No authored container triangles support biohazard paint')
  const geometry = new T.BufferGeometry()
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  return geometry
}

export function createAftermathSignage(g) {
  const T = g.THREE, root = new T.Group(), records = [], geometries = [], map = paintTexture(T)
  root.name = 'aftermath-container-paint'
  const material = new T.MeshStandardMaterial({ map, roughness: .86, metalness: .05, transparent: true,
    alphaTest: .07, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
  const disposeResources = () => { geometries.forEach(geometry => geometry.dispose()); material.dispose(); map.dispose() }
  try {
    g.level.root.updateMatrixWorld(true)
    for (const sign of AFTERMATH_SIGNAGE) {
      const placed = g.level.placed.find(p => p.name === 'container20' && p.y === 0 && Math.hypot(p.x - sign.container[0], p.z - sign.container[1]) < .1)
      if (!placed) throw Error(`Missing authored container for ${sign.id}`)
      const container = new T.Matrix4().makeRotationY(placed.yaw); container.setPosition(placed.x, placed.y, placed.z)
      // zA: Bc/2 - .012 = 1.207 m, with inward corrugation/dents.
      const position = new T.Vector3(sign.along, sign.height, sign.side * 1.207).applyMatrix4(container)
      const rotation = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), placed.yaw + (sign.side < 0 ? Math.PI : 0))
      const frame = new T.Matrix4().compose(position, rotation, new T.Vector3(1, 1, 1))
      const geometry = fittedPaint(T, g.level.root, frame, sign.size); geometries.push(geometry)
      const mesh = new T.Mesh(geometry, material); mesh.name = sign.id; mesh.position.copy(position); mesh.quaternion.copy(rotation)
      mesh.receiveShadow = true; mesh.castShadow = false; mesh.renderOrder = 1; root.add(mesh)
      records.push({ ...sign, position: position.toArray(), normal: new T.Vector3(0, 0, 1).applyQuaternion(rotation).toArray(),
        container: { ...placed }, triangles: geometry.attributes.position.count / 3, surfaceOffset: .0012,
        depthRange: [geometry.boundingBox.min.z, geometry.boundingBox.max.z], fit: 'clipped-authored-triangles' })
    }
  } catch (error) { disposeResources(); throw error }
  let disposed = false
  return { root, snapshot: () => ({ signs: structuredClone(records), disposed }), dispose() {
    if (disposed) return
    disposed = true; root.removeFromParent(); root.clear(); disposeResources()
  } }
}
