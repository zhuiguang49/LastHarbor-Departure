// Authored, seeded surface marks. No fetched imagery and no modification of WetGround.
export function createAftermathDecals(g, placements) {
  const T = g.THREE, root = new T.Group(), materials = new Map(), textures = []
  root.name = 'aftermath-surface-evidence'
  function material(kind, environment) {
    const key = `${kind}:${environment}`
    if (materials.has(key)) return materials.get(key)
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512
    const ctx = canvas.getContext('2d')
    let seed = { dilute: 71, drag: 93, indoor: 133, impact: 317, scorch: 809, print: 632, splatter: 173, drops: 241 }[kind]
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
    const dot = (x, y, rx, ry, a, color) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); ctx.fill()
    }
    const indoor = environment === 'indoor', blood = indoor ? '109,24,21' : '133,36,29'
    if (kind === 'impact') {
      // Chipped paint rim, soot and a small dark punched centre, not painted red circles.
      for (let i = 0; i < 100; i++) {
        const a = random() * Math.PI * 2, r = 29 + random() * 30
        dot(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, 4 + random() * 15, 3 + random() * 7, a, `rgba(112,111,98,${.12 + random() * .6})`)
      }
      dot(256, 256, 30, 25, .4, 'rgba(13,15,16,.97)')
      dot(248, 243, 19, 3, -.5, 'rgba(143,143,130,.6)')
      for (let i = 0; i < 8; i++) {
        const a = random() * 6.28
        ctx.strokeStyle = 'rgba(23,24,24,.6)'; ctx.lineWidth = 1 + random() * 3
        ctx.beginPath(); ctx.moveTo(256 + Math.cos(a) * 26, 256 + Math.sin(a) * 23)
        ctx.lineTo(256 + Math.cos(a) * (65 + random() * 40), 256 + Math.sin(a) * (65 + random() * 40)); ctx.stroke()
      }
    } else if (kind === 'scorch') {
      for (let i = 0; i < 1600; i++) {
        const a = random() * 6.28, r = Math.pow(random(), .6) * 190
        dot(256 + Math.cos(a) * r, 256 + Math.sin(a) * r * .72, 3 + random() * 17, 2 + random() * 10, a, `rgba(14,18,19,${.015 + (1 - r / 200) * .07})`)
      }
    } else if (kind === 'drag') {
      for (let i = 0; i < 900; i++) {
        const y = 36 + random() * 440, envelope = Math.sin((y - 36) / 440 * Math.PI)
        const x = 240 + Math.sin(y * .008) * 45 + (random() - .5) * 95 * envelope
        dot(x, y, .5 + random() * 6, 3 + random() * 17, -.08, `rgba(${blood},${.16 + random() * .34})`)
      }
      // Rain erodes outdoor trails; dry warehouse drag retains broken bristle lines.
      ctx.globalCompositeOperation = 'destination-out'
      for (let i = 0; i < (indoor ? 35 : 70); i++) dot(180 + random() * 170, random() * 512, 1 + random() * 3, 5 + random() * 32, -.08, 'rgba(0,0,0,.55)')
    } else if (kind === 'print') {
      for (let row = 0; row < 11; row++) for (let col = 0; col < 4; col++) {
        const y = 85 + row * 28, x = 196 + col * 30
        ctx.fillStyle = `rgba(${blood},${.44 + random() * .3})`
        ctx.fillRect(x + random() * 3, y, 20, 12 + random() * 4)
      }
    } else if (kind === 'splatter' || kind === 'drops') {
      // Sparse satellite drops, with several irregular small contact stains.
      // The occupied area stays small; the surrounding plane is fully clear.
      const count = kind === 'drops' ? 9 : 32
      for (let i = 0; i < count; i++) {
        const x = kind === 'drops' ? 200 + Math.sin(i * 1.8) * 62 : 75 + random() * 355
        const y = kind === 'drops' ? 65 + i * 44 : 70 + random() * 365
        const radius = (kind === 'drops' ? 8 : 3) + random() * (kind === 'drops' ? 12 : 9)
        if (!indoor) dot(x + 3, y + 6, radius * 1.8, radius * 2.3, .2, 'rgba(137,48,37,.14)')
        for (let j = 0; j < 8; j++) dot(x + (random() - .5) * radius, y + (random() - .5) * radius,
          radius * (.4 + random() * .5), radius * (.3 + random() * .4), random() * 3, `rgba(${blood},${.45 + random() * .4})`)
      }
      if (!indoor) {
        ctx.globalCompositeOperation = 'destination-out'
        for (let i = 0; i < 30; i++) dot(70 + random() * 370, 60 + random() * 390, 1 + random() * 2, 8 + random() * 18, .2, 'rgba(0,0,0,.4)')
      }
    } else {
      for (let i = 0; i < 850; i++) {
        const a = random() * 6.28, r = Math.pow(random(), .7) * 150
        dot(256 + Math.cos(a) * r * 1.1, 256 + Math.sin(a) * r * .64, 2 + random() * 15, 1 + random() * 7, a,
          `rgba(${blood},${(indoor ? .2 : .11) + random() * (indoor ? .35 : .26)})`)
      }
      for (let i = 0; i < 24; i++) dot(55 + random() * 400, 70 + random() * 370, 1 + random() * 3, 1 + random() * 2, 0, `rgba(${blood},.68)`)
      if (!indoor) {
        ctx.globalCompositeOperation = 'destination-out'
        for (let i = 0; i < 45; i++) dot(110 + random() * 290, 110 + random() * 290, 1 + random() * 2, 5 + random() * 20, .15, 'rgba(0,0,0,.45)')
      }
    }
    const map = new T.CanvasTexture(canvas); map.colorSpace = T.SRGBColorSpace; map.anisotropy = 4; textures.push(map)
    const m = new T.MeshStandardMaterial({ map, transparent: true, opacity: 1, depthWrite: false, alphaTest: kind === 'impact' || kind === 'scorch' ? .015 : .025,
      roughness: kind === 'impact' || kind === 'scorch' ? .86 : indoor ? .84 : .48,
      metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    materials.set(key, m); return m
  }
  const records = []
  for (const p of placements) {
    const environment = p.environment || (p.kind === 'indoor' || p.kind === 'print' ? 'indoor' : 'outdoor')
    const mesh = new T.Mesh(new T.PlaneGeometry(p.size[0], p.size[1]), material(p.kind, environment))
    mesh.position.set(...p.position)
    mesh.rotation.set(...(p.rotation || [-Math.PI / 2, 0, p.yaw || 0]))
    if (p.normal) mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(...p.normal))
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.renderOrder = 1
    mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere()
    mesh.name = p.id; root.add(mesh)
    records.push({ ...structuredClone(p), environment, normal: new T.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion).toArray(), roughness: mesh.material.roughness })
  }
  let disposed = false
  return { root, snapshot: () => ({ marks: structuredClone(records), disposed }),
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); root.traverse(o => o.geometry?.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()) } }
}
