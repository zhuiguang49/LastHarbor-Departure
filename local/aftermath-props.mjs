// Small, purpose-specific aftermath props; source prop materials remain borrowed.
export function createAftermathProps(g) {
  const T = g.THREE, root = new T.Group(), ownedMaterials = [], textures = [], geometries = new Set(), lights = []
  root.name = 'aftermath-abandoned-equipment'
  const mat = (color, roughness = .7, metalness = 0) => {
    const m = new T.MeshStandardMaterial({ color, roughness, metalness }); ownedMaterials.push(m); return m
  }
  const zinc = mat(0x555d5a, .48, .85), rubber = mat(0x161c1e, .8), copper = mat(0x89583a, .4, .8)
  const bag = mat(0x655f42, .91), strap = mat(0x242b28, .85), paper = mat(0xb6b09a, .92)
  function mesh(geo, material, pos, rotation = [0, 0, 0], parent = root) {
    geometries.add(geo); const m = new T.Mesh(geo, material); m.position.set(...pos); m.rotation.set(...rotation)
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m
  }
  function cable(points, radius = .009, material = rubber) {
    return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), 40, radius, 8, false), material, [0, 0, 0])
  }
  function rounded(width, height, depth, bevel = .018) {
    const s = new T.Shape(), x = width / 2, y = height / 2, r = bevel * 2
    s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r)
    s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y); s.lineTo(-x + r, y)
    s.quadraticCurveTo(-x, y, -x, y - r); s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y)
    const geo = new T.ExtrudeGeometry(s, { depth: depth - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, steps: 1, curveSegments: 6 })
    geo.translate(0, 0, -depth / 2 + bevel); return geo
  }
  function prop(type, position, rotation, seed) {
    const p = g.props.build(type, { seed }); p.position.set(...position); p.rotation.set(...rotation); root.add(p)
    p.updateMatrixWorld(true)
    const box = new T.Box3().setFromObject(p); p.position.y += position[1] - box.min.y
    // Some source factories return Object3D clones with cached shared geometry.
    // Own only our copies; source materials and textures remain borrowed.
    p.traverse(o => { if (o.geometry) { o.geometry = o.geometry.clone(); geometries.add(o.geometry) } })
    return p
  }
  function label(text, size, position, rotation, color = 'white') {
    const l = g.mats.label(text, { color, font: 'sans', distress: .3 })
    const m = mesh(new T.PlaneGeometry(...size), l.material, position, rotation); m.castShadow = false
    return m
  }
  function bentPanel(position, yaw, width, length) {
    const geo = new T.PlaneGeometry(width, length, 16, 20), a = geo.attributes.position
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), y = a.getY(i)
      a.setXYZ(i, x, .012 + .07 * Math.pow(x / width + .5, 3) + .018 * Math.sin(y * 36) * Math.sin(Math.PI * (x / width + .5)), y)
    }
    geo.computeVertexNormals()
    const m = mesh(geo, zinc, position, [0, yaw, 0]); m.material.side = T.DoubleSide
    return m
  }
  // S1: dropped field case and a torn strip still hooked to the existing barrier.
  prop('jerry_can', [-26.5, .005, 8.54], [Math.PI / 2, .4, .15], 661)
  label('紧急封锁 / 禁止入内', [.7, .15], [-27.5, .013, 8.39], [-Math.PI / 2, 0, .2])
  // S2: survivors fired from the existing pallet cover; a sheet was torn off in the fight.
  bentPanel([-14.1, .006, 4.4], .43, .46, .61)
  for (let i = 0; i < 9; i++) {
    const x = -16.4 + (i % 4) * .13, z = 4.25 + Math.floor(i / 4) * .19
    mesh(new T.CylinderGeometry(.006, .006, .034, 10), copper, [x, .008, z], [Math.PI / 2, i * .9, .2])
  }
  // S3: broken insulated harness ends below the original shorting junction.
  for (let i = 0; i < 3; i++) {
    cable([[2.02 + i * .04, 1.03, 7.61], [2.28, .67, 7.7 + i * .06], [2.5 + i * .13, .1, 7.91], [2.82 + i * .11, .018, 8.2]])
    cable([[2.82 + i * .11, .018, 8.2], [2.86 + i * .11, .02, 8.22], [2.91 + i * .11, .018, 8.2]], .0025, copper)
  }
  bentPanel([2.85, .007, 8.7], -.5, .32, .49)
  // The interrupted repair's small laminated instruction card, beside the tools.
  const card = mesh(new T.PlaneGeometry(.32, .13), paper, [3.1, .004, 8.2], [-Math.PI / 2, 0, .2])
  card.castShadow = false
  label('维修 / 断电 · 验电 · 接地', [.285, .042], [3.1, .0045, 8.2], [-Math.PI / 2, 0, .2], 'black')
  // A dropped insulated pair: continuous glove silhouettes with five fingers.
  for (let hand = 0; hand < 2; hand++) {
    const glove = new T.Group(); glove.position.set(2.65 + hand * .19, .018, 8.4); glove.rotation.y = -.4 + hand * .7; root.add(glove)
    mesh(rounded(.092, .13, .018, .01), bag, [0, .006, 0], [-Math.PI / 2, 0, 0], glove)
    for (let f = 0; f < 4; f++) {
      const geo = new T.CapsuleGeometry(.009, .045 + Math.sin(f) * .014, 4, 8)
      mesh(geo, bag, [(f - 1.5) * .022, .01, -.087 - Math.sin(f) * .008], [Math.PI / 2, 0, (f - 1.5) * .08], glove)
    }
    mesh(new T.CapsuleGeometry(.012, .038, 4, 8), bag, [-.052, .012, -.02], [.8, 0, .8], glove)
    mesh(rounded(.09, .05, .021, .008), rubber, [0, .01, .075], [-Math.PI / 2, 0, 0], glove)
  }
  // S4: an overturned authored maintenance cart, interrupted evacuation manifest.
  prop('toolbox_cart', [-7.1, .034, -25.4], [0, .25, Math.PI / 2], 674)
  function documentTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 384; const ctx = c.getContext('2d')
    ctx.fillStyle = '#b7b19c'; ctx.fillRect(0, 0, 256, 384); ctx.fillStyle = '#3a423f'; ctx.font = 'bold 18px sans-serif'; ctx.fillText('撤离保障 / 07', 20, 38)
    ctx.font = '11px sans-serif'; ctx.fillText('2029.11.16   最后一次转运', 20, 63)
    for (let i = 0; i < 10; i++) { ctx.strokeStyle = '#777a6e'; ctx.strokeRect(20, 85 + i * 23, 12, 12); ctx.fillRect(45, 90 + i * 23, 130 - (i % 3) * 21, 2) }
    ctx.fillStyle = '#6a4335'; ctx.fillText('联络中断 · 留守待命', 38, 348)
    const map = new T.CanvasTexture(c); map.colorSpace = T.SRGBColorSpace; textures.push(map)
    const m = mat(0xffffff, .9); m.map = map; m.side = T.DoubleSide; return m
  }
  const documentMat = documentTexture()
  for (let i = 0; i < 4; i++) {
    const geo = new T.PlaneGeometry(.21, .297, 6, 10), a = geo.attributes.position
    for (let j = 0; j < a.count; j++) { const x = a.getX(j), z = a.getY(j); a.setXYZ(j, x, .003 + .009 * Math.pow(z / .297 + .5, 4) + .002 * Math.sin(x * 35), z) }
    geo.computeVertexNormals(); mesh(geo, documentMat, [-6.85 + i * .28, .035, -24.7 + (i % 2) * .3], [0, i * 1.32, 0])
  }
  // S5: a real-scale first-aid pouch and rain-soaked transfer supplies left before boarding.
  const aid = new T.Group(); aid.position.set(25, .13, 22.5); aid.rotation.y = .27; root.add(aid)
  mesh(rounded(.34, .2, .23), bag, [0, 0, 0], [0, 0, 0], aid)
  for (const x of [-.1, .1]) mesh(rounded(.025, .212, .239, .004), strap, [x, 0, 0], [0, 0, 0], aid)
  const cross = mat(0xaaa994, .8)
  mesh(new T.BoxGeometry(.095, .027, .003), cross, [0, 0, .136], [0, 0, 0], aid)
  mesh(new T.BoxGeometry(.027, .095, .003), cross, [0, 0, .138], [0, 0, 0], aid)
  cable([[24.85, .019, 22.6], [24.65, .03, 22.8], [24.74, .018, 23.04], [25.03, .018, 22.8]], .012, strap)
  // Tear geometry has two unequal ends; restrained faded yellow rather than hazard UI.
  const tapeMat = mat(0x9b8c47, .82); tapeMat.side = T.DoubleSide
  for (const [x, z, yaw] of [[25.8, 22.2, .4], [24.8, 22.9, -1]]) {
    const geo = new T.PlaneGeometry(.65, .045, 24, 1), a = geo.attributes.position
    for (let i = 0; i < a.count; i++) { const u = a.getX(i), v = a.getY(i); a.setXYZ(i, u, .012 + Math.sin((u + .325) * 12) ** 2 * .018, v + (u > .3 ? -.014 : 0)) }
    geo.computeVertexNormals(); mesh(geo, tapeMat, [x, .005, z], [0, yaw, 0])
  }
  // Four finite battery worklights, with visible housings: local grazing light
  // reveals cloth/servo details during the outage, without changing exposure.
  const lens = mat(0xb7c6bd, .3); lens.emissive.set(0xb7c6bd); lens.emissiveIntensity = .8
  for (const [position, target, intensity] of [
    [[-27.8, .55, 7.04], [-26.8, .17, 7.9], 5], [[-16.3, .55, 5.25], [-15.2, .38, 4.4], 8],
    [[-4.2, .58, -24.6], [-5.3, .18, -25.75], 5], [[24.65, .55, 21.7], [25.45, .17, 22.1], 4],
  ]) {
    const fixture = new T.Group(); fixture.position.set(...position); fixture.lookAt(...target); root.add(fixture)
    mesh(rounded(.24, .17, .075, .009), rubber, [0, 0, 0], [0, 0, 0], fixture)
    mesh(rounded(.202, .13, .008, .004), zinc, [0, 0, .044], [0, 0, 0], fixture)
    mesh(rounded(.175, .105, .004, .004), lens, [0, 0, .05], [0, 0, 0], fixture)
    mesh(new T.CylinderGeometry(.012, .012, .44, 10), zinc, [position[0], position[1] - .27, position[2]])
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3
      cable([[position[0], position[1] - .37, position[2]], [position[0] + Math.sin(angle) * .19, position[1] - .535, position[2] + Math.cos(angle) * .19]], .011, rubber)
    }
    const light = new T.SpotLight(0xc9d5ce, intensity, 4.5, .84, .65, 2)
    light.position.set(...position); light.target.position.set(...target); light.castShadow = false
    light.name = 'aftermath-battery-worklight'; lights.push(light, light.target)
  }
  // Static props share batches by material, including detailed source factories.
  root.updateMatrixWorld(true)
  const batches = new Map()
  root.traverse(o => {
    if (!o.isMesh) return
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
    geo.applyMatrix4(o.matrixWorld)
    const slots = Array.isArray(o.material) ? o.material : [o.material]
    const groups = Array.isArray(o.material) ? geo.groups : [{ start: 0, count: geo.attributes.position.count, materialIndex: 0 }]
    for (const group of groups) {
      const material = slots[group.materialIndex]
      if (!batches.has(material)) batches.set(material, { position: [], normal: [], uv: [], color: [] })
      const out = batches.get(material)
      for (let i = group.start; i < group.start + group.count; i++) for (const [key, size] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) {
        const a = geo.attributes[key]
        for (let j = 0; j < size; j++) out[key].push(a ? a.array[i * size + j] : key === 'color' ? 1 : 0)
      }
    }
    geo.dispose()
  })
  root.clear(); geometries.forEach(geo => geo.dispose()); geometries.clear()
  for (const [material, data] of batches) {
    const geo = new T.BufferGeometry()
    for (const [key, size] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) geo.setAttribute(key, new T.Float32BufferAttribute(data[key], size))
    geo.computeBoundingBox(); geo.computeBoundingSphere()
    const m = mesh(geo, material, [0, 0, 0]); m.castShadow = false
  }
  root.add(...lights)
  let disposed = false
  return { root, snapshot: () => ({ disposed, objects: root.children.length }), dispose() {
    if (disposed) return; disposed = true; root.removeFromParent(); geometries.forEach(geo => geo.dispose()); ownedMaterials.forEach(m => m.dispose()); textures.forEach(t => t.dispose())
  } }
}
