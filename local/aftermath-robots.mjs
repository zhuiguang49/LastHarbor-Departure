// Source visual factories only: no enemy instances, events, hit tests or updates.
// The adapter owns each new blueprint; source material textures remain borrowed.
export function buildRobotWreck(g, kind) {
  const T = g.THREE, group = new T.Group(), batches = new Map(), geometries = new Set(), materials = new Set()
  group.name = `aftermath-${kind}-wreck`
  function cloneSurface(name) {
    const source = g.mats.get(name, { triplanar: true, vertexColors: true }), material = source.clone()
    // r180 MeshStandardMaterial.copy() resets defines to STANDARD.
    material.defines = { ...source.defines }
    material.onBeforeCompile = source.onBeforeCompile
    material.customProgramCacheKey = source.customProgramCacheKey
    materials.add(material)
    return material
  }
  function surface(color, roughness, metalness) {
    const material = new T.MeshStandardMaterial({ color, roughness, metalness, vertexColors: true })
    materials.add(material)
    return material
  }
  const armor = cloneSurface('armor_white'), metal = cloneSurface('gunmetal')
  const dark = surface(0x111a1b, .66, .28), edge = surface(0x737b78, .46, .82)
  const copper = surface(0x794322, .64, .7), rubber = surface(0x111715, .94, .04), char = surface(0x252922, .96, .16)
  armor.color.multiplyScalar(.88)
  const rig = g.robotVisuals.create(kind, { shell: armor, metal, glow: dark, lens: dark })
  const source = rig.definition.geometry, sourceBounds = source.boundingBox.clone(), sourceTriangles = source.attributes.position.count / 3
  const bones = rig.bones, features = [], removed = { shell: 0, metal: 0 }, plate = []
  // j_ also authors rotor-blur discs and its searchlight cone. Never bind them.
  rig.definition.extra?.geometry.dispose()
  if (kind === 'hound') {
    bones.root.rotation.set(-.08, 0, 1.56)
    bones.body.rotation.y = -.12
    bones.neck.rotation.set(.24, -.32, -.15)
    bones.head.rotation.set(.2, .36, -.18)
    bones.turret.rotation.y = -.43
    bones.gun.rotation.x = .34
    bones.antenna.rotation.z = -.94
    for (const [leg, thigh, shin, spread] of [
      ['FL', .9, -2.08, -.3], ['FR', .62, -1.67, .3],
      ['RL', -.86, 1.72, -.26], ['RR', -1.06, 1.63, .24],
    ]) {
      bones[`abd${leg}`].rotation.z = spread
      bones[`thigh${leg}`].rotation.x = thigh
      bones[`shin${leg}`].rotation.x = shin
    }
    bones.shinFL.rotation.z = .63
    bones.shinFL.position.x += .045
    bones.shinFL.position.y += .035
    features.push('original articulated chassis', 'folded unsupported legs', 'fractured front knee', 'removed side armor', 'exposed wound servo', 'severed hydraulic harness', 'fallen original armor panel')
  } else {
    bones.root.rotation.set(.22, 0, -.24)
    bones.gimbalYaw.rotation.y = .68
    bones.ball.rotation.x = .5
    for (let i = 0; i < 4; i++) bones[`rotor${i}`].rotation.y = [.3, 1.06, .54, 1.41][i]
    features.push('original quad duct silhouette', 'buckled rear arm', 'fractured rotor guard', 'stationary physical propellers', 'damaged sensor gimbal', 'torn motor wiring', 'fallen guard fragments')
  }
  rig.group.updateMatrixWorld(true)
  rig.skeleton.update()
  const boneMatrices = rig.skeleton.bones.map((bone, i) => new T.Matrix4().multiplyMatrices(bone.matrixWorld, rig.skeleton.boneInverses[i]))
  const normalMatrices = boneMatrices.map(matrix => new T.Matrix3().getNormalMatrix(matrix))
  const p = new T.Vector3(), n = new T.Vector3(), c = new T.Color(), warpPivot = new T.Vector3(-.09, 0, -.1)
  const warpAxis = new T.Vector3(1, 0, -1).normalize(), warpRotation = new T.Quaternion()
  const clamp = value => Math.max(0, Math.min(1, value))
  function bendDrone(position, normal) {
    const weight = clamp((Math.min(-position.x, -position.z) - .11) / .16)
    if (!weight) return
    warpRotation.setFromAxisAngle(warpAxis, -.64 * weight)
    position.sub(warpPivot).applyQuaternion(warpRotation).add(warpPivot)
    normal?.applyQuaternion(warpRotation)
  }
  function bucket(material) {
    if (!batches.has(material)) batches.set(material, { position: [], normal: [], uv: [], color: [] })
    return batches.get(material)
  }
  function vertex(out, position, normal, uv, color) {
    out.position.push(position.x, position.y, position.z)
    out.normal.push(normal.x, normal.y, normal.z)
    out.uv.push(uv[0], uv[1])
    out.color.push(color.r, color.g, color.b)
  }
  const attribute = source.attributes, slots = rig.definition.slots
  let reusedTriangles = 0
  for (const part of source.groups) {
    const slot = slots[part.materialIndex], material = slot === 'shell' ? armor : slot === 'metal' ? metal : dark
    const out = bucket(material)
    for (let i = part.start; i < part.start + part.count; i += 3) {
      let x = 0, y = 0, z = 0
      for (let j = 0; j < 3; j++) {
        x += attribute.position.getX(i + j) / 3
        y += attribute.position.getY(i + j) / 3
        z += attribute.position.getZ(i + j) / 3
      }
      const body = attribute.skinIndex.getX(i) === 1
      const sidePlate = kind === 'hound' && body && slot === 'shell' && x > .132 && y > .665 && y < .819 && z > -.231 && z < .081
      const openCore = kind === 'hound' && body && slot === 'metal' && x > .125 && x < .137 && y > .613 && y < .81 && z > -.21 && z < .09
      const brokenDuct = kind === 'gull' && slot === 'shell' && x < -.43 && z < -.29 && y > .012 && y < .083
      if (openCore || brokenDuct) { removed[slot]++; continue }
      if (sidePlate) { plate.push(i, i + 1, i + 2); removed.shell++; continue }
      reusedTriangles++
      for (let j = 0; j < 3; j++) {
        const index = i + j, bone = attribute.skinIndex.getX(index)
        p.fromBufferAttribute(attribute.position, index)
        n.fromBufferAttribute(attribute.normal, index)
        if (kind === 'gull') bendDrone(p, n)
        p.applyMatrix4(boneMatrices[bone])
        n.applyMatrix3(normalMatrices[bone]).normalize()
        c.fromBufferAttribute(attribute.color, index)
        if (material === dark) c.setRGB(.34, .39, .38)
        if (kind === 'hound' && body && x > .1 && z > -.29 && z < .14) {
          const soot = .5 + .2 * Math.sin(y * 61 + z * 35)
          c.multiplyScalar(soot)
        }
        vertex(out, p, n, [attribute.uv.getX(index), attribute.uv.getY(index)], c)
      }
    }
  }
  // Work in bind space for the new internals, then use the original body pose.
  const bodyMatrix = boneMatrices[1], base = new T.Matrix4().makeTranslation(0, kind === 'hound' ? .72 : 0, 0)
  const bodyFrame = new T.Matrix4().multiplyMatrices(bodyMatrix, base)
  const bulkBounds = new T.Box3()
  for (const data of batches.values()) for (let i = 0; i < data.position.length; i += 3) bulkBounds.expandByPoint(p.fromArray(data.position, i))
  const offset = new T.Vector3(-(bulkBounds.min.x + bulkBounds.max.x) / 2, -bulkBounds.min.y, -(bulkBounds.min.z + bulkBounds.max.z) / 2)
  const groundFrame = new T.Matrix4().makeTranslation(offset.x, offset.y, offset.z)
  bodyFrame.premultiply(groundFrame)
  for (const data of batches.values()) for (let i = 0; i < data.position.length; i += 3) {
    data.position[i] += offset.x; data.position[i + 1] += offset.y; data.position[i + 2] += offset.z
  }
  function add(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], frame = bodyFrame) {
    const local = new T.Matrix4().compose(new T.Vector3(...position), new T.Quaternion().setFromEuler(new T.Euler(...rotation)), new T.Vector3(1, 1, 1))
    const matrix = new T.Matrix4().multiplyMatrices(frame, local), normals = new T.Matrix3().getNormalMatrix(matrix)
    const data = geometry.index ? geometry.toNonIndexed() : geometry, out = bucket(material)
    for (let i = 0; i < data.attributes.position.count; i++) {
      p.fromBufferAttribute(data.attributes.position, i).applyMatrix4(matrix)
      n.fromBufferAttribute(data.attributes.normal, i).applyMatrix3(normals).normalize()
      c.setRGB(1, 1, 1)
      vertex(out, p, n, data.attributes.uv ? [data.attributes.uv.getX(i), data.attributes.uv.getY(i)] : [0, 0], c)
    }
    if (data !== geometry) data.dispose()
    geometry.dispose()
  }
  function cable(points, radius, material = rubber, frame = bodyFrame, segments = 20) {
    add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(point => new T.Vector3(...point))), segments, radius, 6, false), material, [0, 0, 0], [0, 0, 0], frame)
  }
  function rod(start, end, radius, material = edge, frame = bodyFrame, top = radius) {
    const a = new T.Vector3(...start), b = new T.Vector3(...end), geometry = new T.CylinderGeometry(top, radius, a.distanceTo(b), 12)
    const matrix = new T.Matrix4().compose(a.clone().add(b).multiplyScalar(.5), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize()), new T.Vector3(1, 1, 1))
    geometry.applyMatrix4(matrix)
    add(geometry, material, [0, 0, 0], [0, 0, 0], frame)
  }
  // Thin, bent metal, with real thickness and an irregular torn edge.
  function tornSheet(points, depth, material, position, rotation, frame = bodyFrame) {
    const shape = new T.Shape()
    points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y))
    shape.closePath()
    const geometry = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 })
    const pos = geometry.attributes.position
    for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + Math.pow(pos.getX(i), 2) * 1.6)
    geometry.computeVertexNormals()
    add(geometry, material, position, rotation, frame)
  }
  const identity = new T.Matrix4()
  if (kind === 'hound') {
    // Open stator with copper windings, rotor shaft, fixing lugs and bolt holes.
    add(new T.CylinderGeometry(.065, .065, .056, 24, 1, true), char, [.115, .014, -.075], [0, 0, Math.PI / 2])
    for (const x of [.088, .147]) add(new T.TorusGeometry(.062, .004, 6, 24), edge, [x, .014, -.075], [0, Math.PI / 2, 0])
    add(new T.CylinderGeometry(.024, .024, .078, 16), metal, [.129, .014, -.075], [0, 0, Math.PI / 2])
    add(new T.TorusGeometry(.027, .004, 6, 20), edge, [.171, .014, -.075], [0, Math.PI / 2, 0])
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI / 5, points = []
      for (let j = 0; j <= 24; j++) {
        const t = j / 24, a = angle + (t - .5) * .34, turn = t * Math.PI * 6, radius = .045 + Math.sin(turn) * .009
        points.push([.139 + Math.cos(turn) * .011, .014 + Math.cos(a) * radius, -.075 + Math.sin(a) * radius])
      }
      cable(points, .0018, copper, bodyFrame, 24)
      rod([.164, .014 + Math.cos(angle) * .071, -.075 + Math.sin(angle) * .071], [.176, .014 + Math.cos(angle) * .071, -.075 + Math.sin(angle) * .071], .004, edge)
    }
    tornSheet([[-.13, -.013], [-.11, .012], [-.084, -.008], [-.064, .016], [-.04, .003], [-.017, .018], [.02, .008], [.04, .027], [.06, -.004], [.13, .014], [.13, -.024], [-.13, -.024]], .002, edge, [.151, .092, -.075], [0, Math.PI / 2, 0])
    for (let i = 0; i < 4; i++) {
      const z = -.19 + i * .04
      cable([[.12, -.035, z], [.19, -.065, z + .02], [.25, -.13, z + .005], [.28 + i * .012, -.2, z + .06]], .0035, i === 2 ? copper : rubber)
      rod([.28 + i * .012, -.2, z + .06], [.293 + i * .012, -.207, z + .065], .0015, copper)
    }
    rod([.21, -.08, .365], [.29, -.225, .43], .016, metal)
    rod([.29, -.225, .43], [.32, -.29, .465], .006, edge)
    cable([[.18, -.04, .38], [.26, -.1, .43], [.24, -.25, .46]], .005)
    // The removed panel is the source geometry, laid beside the body.
    const panelCenter = new T.Vector3(.15, .742, -.075)
    const panelFrame = new T.Matrix4().compose(new T.Vector3(.62, .025, -.2), new T.Quaternion().setFromEuler(new T.Euler(.08, .44, Math.PI / 2)), new T.Vector3(1, 1, 1))
    const panelNormal = new T.Matrix3().getNormalMatrix(panelFrame), out = bucket(armor)
    for (const index of plate) {
      p.fromBufferAttribute(attribute.position, index).sub(panelCenter).applyMatrix4(panelFrame)
      n.fromBufferAttribute(attribute.normal, index).applyMatrix3(panelNormal).normalize()
      c.fromBufferAttribute(attribute.color, index).multiplyScalar(.7)
      vertex(out, p, n, [attribute.uv.getX(index), attribute.uv.getY(index)], c)
    }
    tornSheet([[-.045, -.02], [-.027, -.035], [-.008, -.019], [.01, -.04], [.045, -.025], [.04, .032], [-.037, .025]], .0025, armor, [.43, .018, -.42], [Math.PI / 2, .2, -.3], identity)
  } else {
    // The struck arm bends continuously from the source geometry. These strips
    // expose its split seam, retaining the guard, motor and stopped propeller.
    tornSheet([[-.05, -.013], [-.027, -.024], [-.013, -.006], [0, -.018], [.016, -.004], [.045, -.012], [.043, .018], [-.047, .02]], .002, edge, [-.175, -.025, -.16], [.2, -.65, .18])
    for (let i = 0; i < 3; i++) cable([[-.11, -.01, -.1], [-.16, -.09 - i * .008, -.15], [-.24, -.13, -.21], [-.28, -.105, -.24 + i * .007]], .0025, i === 1 ? copper : rubber)
    add(new T.TorusGeometry(.027, .003, 6, 18), edge, [-.258, -.103, -.243], [.25, .3, 0])
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7
      add(new T.TorusGeometry(.006, .0014, 5, 10), copper, [-.258 + Math.cos(a) * .019, -.101, -.243 + Math.sin(a) * .019], [Math.PI / 2, 0, a])
    }
    // Physical cracks across the inactive sensor, rather than a glowing decal.
    cable([[-.028, -.149, .342], [-.014, -.159, .348], [.001, -.145, .35], [.013, -.158, .349]], .0011, edge)
    for (let i = 0; i < 3; i++) tornSheet([[-.04, -.014], [-.012, -.021], [.008, -.008], [.037, -.015], [.03, .015], [-.03, .016]], .002, i === 1 ? armor : edge, [.42 + i * .07, .016, -.21 + i * .06], [Math.PI / 2, .1, i * .7], identity)
  }
  // Surface damage has physical rims and recessed dark centers. Local geometry
  // shares the same batches, so bolts/wires/fragments do not add draw calls.
  const impacts = kind === 'hound' ? [[.17, .055, .2], [.17, -.014, .09], [.17, .032, -.27]] : [[.09, .073, .02], [.055, .075, .13]]
  for (const [x, y, z] of impacts) {
    const rotation = kind === 'hound' ? [0, Math.PI / 2, 0] : [-Math.PI / 2, 0, 0]
    add(new T.TorusGeometry(.008, .0015, 5, 10), edge, [x, y, z], rotation)
    add(new T.CircleGeometry(.0068, 12), char, [x - (kind === 'hound' ? .0006 : 0), y - (kind === 'gull' ? .0006 : 0), z], rotation)
  }
  source.dispose()
  rig.skeleton.dispose()
  rig.group.clear()
  for (const [material, data] of batches) {
    if (!data.position.length) continue
    const geometry = new T.BufferGeometry()
    for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) geometry.setAttribute(name, new T.Float32BufferAttribute(data[name], size))
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    geometries.add(geometry)
    const mesh = new T.Mesh(geometry, material)
    mesh.name = `${group.name}:${material === armor ? 'source-armor' : material === metal ? 'source-machinery' : material === dark ? 'inactive-optics' : material === copper ? 'copper-windings' : material === rubber ? 'cut-harness' : material === char ? 'burned-cavity' : 'exposed-steel'}`
    mesh.castShadow = false
    mesh.receiveShadow = true
    group.add(mesh)
  }
  const bounds = new T.Box3().setFromObject(group), groundShift = -bounds.min.y
  for (const geometry of geometries) { geometry.translate(0, groundShift, 0); geometry.computeBoundingBox(); geometry.computeBoundingSphere() }
  bounds.translate(new T.Vector3(0, groundShift, 0))
  const audit = {
    kind, static: true, sourceFactory: kind === 'hound' ? 'Z_' : 'j_', sourceTriangles,
    sourceSize: sourceBounds.getSize(new T.Vector3()).toArray(), bakedBones: rig.definition.bones.length,
    reusedTriangles, removedTriangles: removed, fallenSourcePanelTriangles: plate.length / 3,
    triangles: [...geometries].reduce((sum, geometry) => sum + geometry.attributes.position.count / 3, 0),
    drawCalls: group.children.length, footprint: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: bounds.getSize(new T.Vector3()).toArray() },
    damageFeatures: features, lights: 0, liveEntities: 0, animationCallbacks: 0, sharedTexturesOwned: false,
  }
  group.userData.aftermath = { kind, static: true, sourceFactory: audit.sourceFactory }
  let disposed = false
  return {
    group,
    snapshot() { return { ...structuredClone(audit), disposed } },
    dispose() {
      if (disposed) return
      disposed = true
      group.removeFromParent()
      group.clear()
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
    },
  }
}
