// Independently authored utility covers and port workboots. No imported human,
// clothing, game mesh or texture. The covers intentionally conceal all anatomy.
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const mix = (a, b, t) => a + (b - a) * t
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t) }
const variants = {
  checkpoint: { color: 0xaaa98b, bend: .035, knee: -.035, pitch: [-1.48, -1.42], roll: [-.35, .53] },
  warehouse: { color: 0xa7aca7, bend: -.055, knee: .045, pitch: [-1.43, -1.50], roll: [-.60, .23] },
  dock: { color: 0x9e9b83, bend: .065, knee: .025, pitch: [-1.50, -1.40], roll: [-.29, .65] },
}
// [longitudinal position, half width of cloth, support height]. The shoulder is
// only 29 cm high; the wide skirt compresses to millimetres against the floor.
const profile = [[-1.02,.24,.006],[-.91,.32,.13],[-.79,.37,.18],[-.69,.43,.165],[-.64,.48,.245],[-.49,.54,.29],[-.29,.52,.28],[-.05,.48,.225],[.15,.44,.20],[.32,.43,.19],[.50,.39,.15],[.72,.32,.12]]
function section(z, column) {
  let i = 0
  while (i < profile.length - 2 && z > profile[i + 1][0]) i++
  const a = profile[i], b = profile[i + 1], t = smooth(a[0], b[0], z)
  return mix(a[column], b[column], t)
}

export function createCasualties(g, { placements = [] } = {}) {
  const T = g.THREE, root = new T.Group(), batches = new Map(), materials = [], textures = [], records = []
  root.name = 'harbor-aftermath-covered-workers'
  root.userData.source = 'Independent Last Harbor draped covers, workboots and procedural textures'
  let disposed = false
  const up = new T.Vector3(0, 1, 0), forward = new T.Vector3(0, 0, 1)

  function texture(size, pixel) {
    const data = new Uint8Array(size * size * 4)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const rgb = pixel(x, y), n = (y * size + x) * 4
      data[n] = rgb[0]; data[n + 1] = rgb[1]; data[n + 2] = rgb[2]; data[n + 3] = 255
    }
    const map = new T.DataTexture(data, size, size, T.RGBAFormat)
    map.wrapS = map.wrapT = T.RepeatWrapping
    map.minFilter = T.LinearMipmapLinearFilter; map.magFilter = T.LinearFilter
    map.generateMipmaps = true; map.anisotropy = 4; map.needsUpdate = true
    textures.push(map)
    return map
  }
  const grain = (x, y) => {
    let n = Math.imul(x + 317, 374761393) ^ Math.imul(y + 911, 668265263)
    n = Math.imul(n ^ (n >>> 13), 1274126177)
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296
  }
  const weave = (x, y) => {
    const warp = Math.cos(x * Math.PI / 4), weft = Math.cos(y * Math.PI / 4)
    const over = ((Math.floor(x / 8) + Math.floor(y / 8)) & 1) ? 1 : -1
    return .5 + .14 * (warp + weft) + .08 * over * (warp - weft) + .035 * grain(x, y)
  }
  const fabric = texture(256, (x, y) => {
    const v = Math.round(201 + weave(x, y) * 44)
    return [v, v, v]
  })
  fabric.colorSpace = T.SRGBColorSpace; fabric.repeat.set(30, 30)
  const fabricNormal = texture(256, (x, y) => {
    const dx = (weave((x + 1) % 256, y) - weave((x + 255) % 256, y)) * .7
    const dy = (weave(x, (y + 1) % 256) - weave(x, (y + 255) % 256)) * .7
    const length = Math.hypot(dx, dy, 1)
    return [Math.round(127.5 - dx / length * 127.5), Math.round(127.5 - dy / length * 127.5), Math.round(127.5 + 127.5 / length)]
  })
  fabricNormal.repeat.copy(fabric.repeat)
  const fabricRoughness = texture(256, (x, y) => {
    const v = Math.round(236 + weave(x, y) * 19)
    return [v, v, v]
  })
  fabricRoughness.repeat.copy(fabric.repeat)
  const leatherGrain = texture(128, (x, y) => {
    const v = Math.round(170 + grain(x, y) * 52 + Math.sin(x * .53 + Math.sin(y * .31) * 2) * 13)
    return [v, v, v]
  })
  leatherGrain.repeat.set(16, 16)
  function material(name, options) {
    const result = new T.MeshStandardMaterial({ vertexColors: true, ...options })
    result.name = `aftermath-worker-${name}`; materials.push(result)
    return result
  }
  const cloth = material('woven-cover', { map: fabric, normalMap: fabricNormal, normalScale: new T.Vector2(.5,.5), roughnessMap: fabricRoughness, roughness: .70, metalness: 0, side: T.DoubleSide })
  const leather = material('creased-workboot-leather', { roughness: .71, metalness: 0, roughnessMap: leatherGrain, bumpMap: leatherGrain, bumpScale: .00055 })
  const rubber = material('moulded-rubber', { roughness: .87, metalness: 0, bumpMap: leatherGrain, bumpScale: .00025 })
  const hardware = material('tarnished-eyelets', { roughness: .52, metalness: .78 })
  const thread = material('sewn-cords-and-welts', { roughness: .94, metalness: 0 })
  const lining = material('boot-lining', { roughness: 1, metalness: 0 })
  const reflective = material('worn-reflective-tabs', { roughness: .63, metalness: .22 })

  // Every detail is baked into one of seven material batches across all bodies.
  // This also prevents a separate draw for each lace, stitch, eyelet or tread.
  let activeMatrix = new T.Matrix4(), activeBounds = null, activeParts = null
  function add(geometry, mat, tint = 0xffffff, transform = null) {
    const matrix = transform ? activeMatrix.clone().multiply(transform) : activeMatrix
    geometry.applyMatrix4(matrix)
    if (!geometry.attributes.normal) geometry.computeVertexNormals()
    const color = new T.Color(tint), colors = geometry.attributes.color
    if (!colors) {
      const data = new Float32Array(geometry.attributes.position.count * 3)
      for (let n = 0; n < data.length; n += 3) { data[n] = color.r; data[n + 1] = color.g; data[n + 2] = color.b }
      geometry.setAttribute('color', new T.BufferAttribute(data, 3))
    } else {
      for (let n = 0; n < colors.count; n++) colors.setXYZ(n, colors.getX(n) * color.r, colors.getY(n) * color.g, colors.getZ(n) * color.b)
    }
    geometry.computeBoundingBox(); activeBounds.union(geometry.boundingBox)
    let batch = batches.get(mat)
    if (!batch) { batch = []; batches.set(mat, batch) }
    batch.push(geometry); activeParts.count++; activeParts.triangles += (geometry.index?.count || geometry.attributes.position.count) / 3
  }
  function matrix(position = [0,0,0], rotation = [0,0,0]) {
    return new T.Matrix4().compose(new T.Vector3(...position), new T.Quaternion().setFromEuler(new T.Euler(...rotation)), new T.Vector3(1,1,1))
  }
  function tube(points, radius, mat, tint, radial = 5) {
    if (points.length < 2) return
    const curve = new T.CatmullRomCurve3(points.map(p => p.isVector3 ? p : new T.Vector3(...p)))
    add(new T.TubeGeometry(curve, Math.max(4, points.length - 1), radius, radial, false), mat, tint)
  }
  function band(points, width, mat, tint) {
    const positions = [], uvs = [], indices = []
    for (let n = 0; n < points.length; n++) {
      const a = points[Math.max(0,n - 1)], b = points[Math.min(points.length - 1,n + 1)]
      const tangent = b.clone().sub(a).normalize(), side = new T.Vector3().crossVectors(tangent, up).normalize().multiplyScalar(width / 2)
      for (const sign of [-1,1]) { const p = points[n].clone().addScaledVector(side,sign); positions.push(...p.toArray()); uvs.push(n * .01, sign) }
      if (n) { const i = n * 2; indices.push(i - 2,i - 1,i,i - 1,i + 1,i) }
    }
    const geometry = new T.BufferGeometry()
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions,3)); geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs,2))
    geometry.setIndex(indices); geometry.computeVertexNormals(); add(geometry, mat, tint)
  }

  function cover(spec, style) {
    const phase = (spec.seed ?? 1) * .173, nx = 44, nz = 80
    const sample = (u, v, lift = 0) => {
      const z = mix(-1.02,.72,v), edge = Math.abs(u)
      const bend = style.bend * Math.sin(v * Math.PI) + .008 * Math.sin(z * 7 + phase)
      const width = section(z,1) * (1 + u * .035 * Math.sin(z * 8 + phase))
      const x = bend + u * width + .005 * Math.sin(z * 31 + phase) * Math.pow(edge,3)
      const crown = 1 - smooth(.23,.96,edge)
      let y = .005 + section(z,2) * crown
      // A slightly offset bent knee and a bridge over the two shins make the
      // cover read as laid over a person without outlining separate primitives.
      y += .027 * Math.exp(-Math.pow((z - .29) / .16,2) - Math.pow((x - style.knee - .10) / .16,2)) * crown
      const skirt = Math.exp(-Math.pow((edge - .72) / .19,2))
      y += skirt * (.008 * Math.sin(z * 48 + u * 8 + phase) + .004 * Math.sin(z * 89 - u * 16))
      y += crown * .0035 * Math.sin(z * 39 + Math.sin(u * 8) * 2 + phase)
      // Short transverse compression folds, each with a shallow crease beside it.
      for (const [at,skew,depth] of [[-.62,.10,.007],[-.28,-.16,.010],[.04,.13,.010],[.43,-.10,.008]]) {
        const q = z - at - x * skew
        y += crown * depth * (Math.exp(-q*q/.00048) - .42 * Math.exp(-Math.pow(q + .025,2)/.00030))
      }
      // Local folds fan out from supported shoulders/hips instead of making
      // repeated full-width waves. Their valleys taper into the thin contact hem.
      for (const [side,at,skew,depth] of [[-1,-.52,.42,.017],[1,-.43,-.32,.014],[-1,-.03,-.35,.015],[1,.14,.46,.012]]) {
        const flank = smooth(.16,.43,u * side) * (1 - smooth(.84,.99,edge))
        const q = z - at - (x - bend) * skew
        y += flank * depth * (Math.exp(-q*q/.00065) - .38 * Math.exp(-Math.pow(q + .030,2)/.00050))
      }
      const end = Math.pow(Math.abs(v * 2 - 1),10)
      const zz = z + .008 * Math.sin(u * 12 + phase) * end
      return new T.Vector3(x, Math.max(.0045,y) + lift, zz)
    }
    const positions = [], uvs = [], colors = [], indices = []
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx * 2 - 1, v = j / nz, p = sample(u,v)
      positions.push(...p.toArray()); uvs.push(u * section(p.z,1),p.z)
      const contact = smooth(.008,.08,p.y), soil = .94 + .035 * Math.sin(p.x * 19 + p.z * 11 + phase)
      const value = mix(.61,1,contact) * soil
      colors.push(value,value,value)
      if (j < nz && i < nx) { const k = j * (nx + 1) + i; indices.push(k,k + nx + 1,k + 1,k + 1,k + nx + 1,k + nx + 2) }
    }
    const geometry = new T.BufferGeometry()
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3)); geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2))
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3)); geometry.setIndex(indices); geometry.computeVertexNormals()
    add(geometry,cloth,style.color)
    // Doubled-over binding follows the actual surface, including its low skirt.
    const perimeter = []
    for (let j = 0; j <= nz; j += 2) perimeter.push(sample(-.992,j/nz,.001))
    for (let i = 2; i <= nx; i += 2) perimeter.push(sample(mix(-.992,.992,i/nx),1,.001))
    for (let j = nz - 2; j >= 0; j -= 2) perimeter.push(sample(.992,j/nz,.001))
    for (let i = nx - 2; i >= 0; i -= 2) perimeter.push(sample(mix(-.992,.992,i/nx),0,.001))
    tube(perimeter,.0023,cloth,new T.Color(style.color).multiplyScalar(.70),4)
    for (const u of [-.965,.965]) {
      const seam = Array.from({length:33},(_,j) => sample(u,j/32,.003))
      tube(seam,.00065,thread,0x727361,4)
      // Individually spaced bartacks, rather than a continuous painted stripe.
      for (let j = 2; j < 64; j += 2) band([sample(u - .003,j/64,.0032),sample(u + .003,j/64 + .002,.0032)],.00075,thread,0x989889)
    }
    const join = Array.from({length:49},(_,i) => sample(mix(-.96,.96,i/48),.412,.002))
    band(join,.008,cloth,new T.Color(style.color).multiplyScalar(.83))
    for (let i = 1; i < 47; i++) {
      const u = mix(-.94,.94,i/48)
      band([sample(u,.411,.003),sample(u + .010,.411,.003)],.0007,thread,0x898c7c)
    }
    for (const [u,v] of [[-.94,.13],[.94,.15],[-.94,.60],[.94,.66]]) {
      const p = sample(u,v,.002), du = sample(u + .002,v).sub(sample(u - .002,v)), dv = sample(u,v + .002).sub(sample(u,v - .002))
      const normal = new T.Vector3().crossVectors(dv,du).normalize(), q = new T.Quaternion().setFromUnitVectors(forward,normal)
      const m = new T.Matrix4().compose(p,q,new T.Vector3(1,1,1))
      add(new T.TorusGeometry(.0062,.0017,4,12),hardware,0x716e59,m)
      add(new T.CircleGeometry(.0044,12),lining,0x252a24,m)
    }
  }

  // Closed lofts use measured shoe-last sections, not scaled spheres/boxes.
  function loft(rows, segments = 20, reverse = false) {
    const positions = [], uvs = [], indices = []
    for (let j = 0; j < rows.length; j++) for (let i = 0; i <= segments; i++) {
      const theta = i / segments * Math.PI * 2, p = rows[j](theta)
      positions.push(...p); uvs.push(i / segments * .35,j / (rows.length - 1) * .30)
      if (j && i < segments) { const k = j * (segments + 1) + i; indices.push(k - segments - 1,k,k - segments,k - segments,k,k + 1) }
    }
    // Flat end caps are hidden in the stitched overlap, but make the shell solid.
    for (const j of [0,rows.length - 1]) {
      const center = [0,0,0]
      for (let i = 0; i < segments; i++) for (let axis = 0; axis < 3; axis++) center[axis] += positions[(j * (segments + 1) + i) * 3 + axis] / segments
      const k = positions.length / 3; positions.push(...center); uvs.push(0,0)
      for (let i = 0; i < segments; i++) { const a = j * (segments + 1) + i; if (j === 0) indices.push(k,a,a + 1); else indices.push(k,a + 1,a) }
    }
    if (reverse) for (let n = 0; n < indices.length; n += 3) [indices[n + 1],indices[n + 2]] = [indices[n + 2],indices[n + 1]]
    const geometry = new T.BufferGeometry()
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3)); geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2))
    geometry.setIndex(indices); geometry.computeVertexNormals()
    return geometry
  }
  const foot = [[-.087,.031,.098],[-.067,.048,.130],[-.025,.052,.137],[.025,.054,.112],[.075,.060,.091],[.125,.063,.081],[.165,.060,.074],[.191,.046,.061],[.205,.021,.045],[.208,.003,.033]]
  const soleOutline = [[-.035,-.0885],[-.051,-.070],[-.057,-.020],[-.058,.030],[-.066,.100],[-.066,.151],[-.055,.186],[-.030,.205],[0,.2085],[.032,.204],[.058,.183],[.068,.146],[.067,.098],[.060,.030],[.055,-.025],[.051,-.071],[.033,-.0885]]
  function slab(outline, bottom, top, bevel = .0015) {
    const shape = new T.Shape(); outline.forEach(([x,z],i) => i ? shape.lineTo(x,z) : shape.moveTo(x,z)); shape.closePath()
    const geometry = new T.ExtrudeGeometry(shape,{depth:top - bottom - bevel * 2,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:bevel,bevelThickness:bevel})
    geometry.rotateX(Math.PI / 2); geometry.translate(0,top - bevel,0)
    return geometry
  }

  function boot(side, style) {
    const ownParts = [], previousMatrix = activeMatrix.clone(), previousBounds = activeBounds, previousParts = activeParts
    // Build temporarily in boot coordinates, then apply the final resting pose
    // and exact lowest-point correction to every shell, lace and tread together.
    const existing = new Map([...batches].map(([mat,list]) => [mat,list.length]))
    activeMatrix = new T.Matrix4(); activeBounds = new T.Box3(); activeParts = {count:0,triangles:0}
    add(slab(soleOutline,.009,.037),rubber,0x33352f)
    add(slab(soleOutline.map(([x,z]) => [x*.986,z*.99]),.036,.045,.001),rubber,0x5d594b)
    add(loft(foot.map(([z,w,h]) => theta => {
      const cosine = Math.cos(theta), sine = (Math.sin(theta) + 1) / 2
      const x = Math.sign(cosine) * Math.pow(Math.abs(cosine),.72) * w
      const compression = .0018 * Math.sin(z * 123 + cosine * 3) * smooth(.035,.13,z) * (1 - smooth(.13,.19,z))
      return [x,.044 + (h - .044) * Math.pow(sine,.82) + compression,z]
    }),20,true),leather,side < 0 ? 0x615548 : 0x5b5145)
    const shaft = [[.098,.047,.037],[.13,.049,.038],[.168,.047,.038],[.204,.045,.036],[.225,.046,.037]]
    add(loft(shaft.map(([y,rx,rz]) => theta => [Math.cos(theta)*rx,y,-.032 + Math.sin(theta)*rz + .0015*Math.sin(theta*4+y*70)])),leather,0x594f43)
    const collar = new T.TorusGeometry(.043,.006,6,20); collar.scale(1,.83,1); collar.rotateX(Math.PI/2); collar.translate(0,.224,-.032)
    add(collar,rubber,0x33382f)
    const opening = new T.CircleGeometry(.037,20); opening.rotateX(-Math.PI/2); opening.scale(1,1,.78); opening.translate(0,.222,-.032); add(opening,lining,0x252d29)
    // Trouser cuff continues under the cover, so the boots are visibly worn.
    add(loft([[.212,.032,.026],[.245,.035,.029],[.267,.039,.031]].map(([y,rx,rz]) => theta => [Math.cos(theta)*rx,y,-.032+Math.sin(theta)*rz])),cloth,0x52584a)
    const tongue = [[-.027,.215,.010],[.027,.215,.010],[.029,.148,.014],[.032,.114,.041],[.029,.094,.085],[-.029,.094,.085],[-.032,.114,.041],[-.029,.148,.014]]
    const tongueGeometry = new T.BufferGeometry(), tp = tongue.flat(), ti = [0,7,1,1,7,2,2,7,3,3,7,6,3,6,4,4,6,5]
    tongueGeometry.setAttribute('position',new T.Float32BufferAttribute(tp,3)); tongueGeometry.setAttribute('uv',new T.Float32BufferAttribute(tongue.flatMap(p => [p[0],p[1]+p[2]]),2)); tongueGeometry.setIndex(ti); tongueGeometry.computeVertexNormals(); add(tongueGeometry,leather,0x4b443b)
    const laceRows = [[.204,.013],[.178,.014],[.151,.019],[.128,.037],[.112,.062],[.100,.086]]
    for (let row = 0; row < laceRows.length; row++) {
      const [y,z] = laceRows[row], width = .026 + row * .0013
      for (const sign of [-1,1]) {
        const eyelet = new T.TorusGeometry(.0034,.001,4,8)
        eyelet.rotateX(row < 3 ? 0 : -.6); eyelet.translate(sign * width,y,z + .0015)
        add(eyelet,hardware,0x8a816b)
      }
      if (row) {
        const [py,pz] = laceRows[row - 1]
        for (const sign of [-1,1]) tube([[sign*width,y,z+.003],[0,(py+y)/2+.002,(pz+z)/2+.006],[-sign*(width-.0013),py,pz+.003]],.00125,thread,0x8a856e,4)
      }
    }
    // Stitched quarter panels, toe cap seam, welt and reinforced heel counter.
    for (const sign of [-1,1]) {
      tube([[sign*.042,.215,-.022],[sign*.048,.156,-.015],[sign*.051,.112,.014],[sign*.055,.074,.062]],.00075,thread,0x8b806b,4)
      tube([[sign*.046,.121,-.063],[sign*.050,.087,-.077],[sign*.048,.052,-.072]],.0013,leather,0x3e3c34,4)
      tube(soleOutline.filter(([x]) => Math.sign(x)===sign).map(([x,z]) => [x*.96,.045,z]),.0009,thread,0x84765b,4)
    }
    tube(Array.from({length:17},(_,i) => {
      const a = mix(-Math.PI/2,Math.PI/2,i/16)
      return [Math.sin(a)*.061,.047+Math.cos(a)*.037,.128+.010*Math.cos(a)]
    }),.0011,thread,0x8a7b63,4)
    // Moulded toe bumper hugs the last; its thin ribs catch grazing wet light.
    for (const z of [.177,.190]) tube(Array.from({length:13},(_,i) => {
      const a = mix(-Math.PI/2,Math.PI/2,i/12), width = z > .18 ? .047 : .056
      return [Math.sin(a)*width,.043+Math.cos(a)*.020,z+.004*Math.cos(a)]
    }),.0024,rubber,0x45483d,5)
    for (const z of [-.065,-.033,.067,.107,.147,.181]) for (const sign of [-1,1]) {
      const tread = [[-.020,-.012],[.019,-.012],[.024,.006],[-.014,.011]].map(([x,dz]) => [sign*.031+x,z+dz])
      add(slab(tread,.001,.012,.001),rubber,0x252a25)
    }
    const tab = new T.BoxGeometry(.012,.033,.003); tab.translate(0,.205,-.071); add(tab,cloth,0x4c5144)
    const silver = new T.BoxGeometry(.013,.010,.001); silver.translate(0,.211,-.073); add(silver,reflective,0x9a9d89)
    const bootBounds = activeBounds.clone(), localParts = activeParts
    for (const [mat,list] of batches) ownParts.push(...list.slice(existing.get(mat) || 0))
    const index = side < 0 ? 0 : 1
    const pose = matrix([side * .127 + style.bend * .4,0,.776 + (side < 0 ? -.015 : .012)], [style.pitch[index],side * .12,style.roll[index]])
    const restBounds = new T.Box3()
    for (const geometry of ownParts) { geometry.applyMatrix4(pose); geometry.computeBoundingBox(); restBounds.union(geometry.boundingBox) }
    const floor = new T.Matrix4().makeTranslation(0,.004 - restBounds.min.y,0)
    for (const geometry of ownParts) { geometry.applyMatrix4(floor).applyMatrix4(previousMatrix); geometry.computeBoundingBox(); previousBounds.union(geometry.boundingBox) }
    previousParts.count += localParts.count; previousParts.triangles += localParts.triangles
    activeMatrix = previousMatrix; activeBounds = previousBounds; activeParts = previousParts
    return { length: +(bootBounds.max.z - bootBounds.min.z).toFixed(4), width: +(bootBounds.max.x - bootBounds.min.x).toFixed(4), floorClearance: .004 }
  }

  for (let index = 0; index < placements.length; index++) {
    const spec = placements[index], position = spec.position || [0,0,0], variant = spec.variant || 'checkpoint', style = variants[variant]
    if (!style) throw Error(`Unknown covered-worker variant: ${variant}`)
    if (position.length !== 3 || !position.every(Number.isFinite) || !Number.isFinite(spec.yaw ?? 0)) throw Error('Covered-worker placement requires finite position/yaw')
    activeMatrix = matrix(position,[0,spec.yaw ?? 0,0]); activeBounds = new T.Box3(); activeParts = {count:0,triangles:0}
    cover(spec,style)
    const boots = [-1,1].map(side => boot(side,style))
    records.push({ id: spec.id || `covered-worker-${index + 1}`, variant, seed: spec.seed ?? 1, position: [...position], yaw: spec.yaw ?? 0,
      bounds: activeBounds.clone(), boots, parts: activeParts.count, triangles: activeParts.triangles })
  }
  for (const [mat,parts] of batches) {
    const data = {position:[],normal:[],uv:[],color:[]}, indices = []
    let offset = 0
    for (const part of parts) {
      for (const key of Object.keys(data)) {
        const attribute = part.attributes[key]
        for (let i = 0; i < attribute.array.length; i++) data[key].push(attribute.array[i])
      }
      if (part.index) for (const i of part.index.array) indices.push(i + offset)
      else for (let i = 0; i < part.attributes.position.count; i++) indices.push(i + offset)
      offset += part.attributes.position.count; part.dispose()
    }
    const geometry = new T.BufferGeometry()
    for (const [key,values] of Object.entries(data)) geometry.setAttribute(key,new T.Float32BufferAttribute(values,key === 'uv' ? 2 : 3))
    geometry.setIndex(indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere()
    const mesh = new T.Mesh(geometry,mat); mesh.name = mat.name; mesh.receiveShadow = true; mesh.castShadow = false
    root.add(mesh)
  }
  batches.clear()
  function snapshot() {
    root.updateWorldMatrix(true,false)
    return { source: root.userData.source, disposed, count: records.length, drawCalls: root.children.length,
      triangles: records.reduce((total,item) => total + item.triangles,0), resources: { geometries: root.children.length, materials: materials.length, textures: textures.length },
      casualties: records.map(item => {
        const box = item.bounds.clone().applyMatrix4(root.matrixWorld)
        return { id:item.id, variant:item.variant, seed:item.seed, position:[...item.position], yaw:item.yaw,
          bounds:{min:box.min.toArray(),max:box.max.toArray()}, dimensions:box.getSize(new T.Vector3()).toArray(), supportY:new T.Vector3(...item.position).applyMatrix4(root.matrixWorld).y,
          minimumY:box.min.y, boots:item.boots.map(boot => ({...boot})), parts:item.parts, triangles:item.triangles }
      }) }
  }
  return { root, reset: snapshot, snapshot, dispose() {
    if (disposed) return
    disposed = true; root.removeFromParent()
    for (const child of root.children) child.geometry.dispose()
    root.clear(); materials.forEach(mat => mat.dispose()); textures.forEach(map => map.dispose())
  } }
}
