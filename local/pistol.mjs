// Independently authored port-security sidearm. No extracted Saltline assets.
export const PISTOL = Object.freeze({ id: 'pistol', slot: 2, name: '港务 P12 安保手枪', magSize: 12, reserve: 24, damage: 34, rpm: 300, range: 180 })
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v) }
const mix = (a, b, t) => a + (b - a) * t

export function createPistolModel(T) {
  const root = new T.Group(); root.name = 'harbor-p12-security-pistol'
  // Deterministic machining grain and moulded polymer stippling, authored here.
  // Meter-space extrusion UVs repeat the fine finish across bevelled surfaces.
  function finish(stipple) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(128,128)
    let seed = stipple ? 7031 : 1207
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      seed = (Math.imul(seed,1664525)+1013904223) >>> 0
      const grain = seed / 4294967296, v = Math.round(stipple ? 140 + grain * 110 : 192 + grain * 38 + Math.sin(y * 2.5) * 9), n = (y * 128 + x) * 4
      pixels.data[n] = pixels.data[n+1] = pixels.data[n+2] = v; pixels.data[n+3] = 255
    }
    ctx.putImageData(pixels,0,0)
    const tex = new T.CanvasTexture(canvas); tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(stipple ? 14 : 9,stipple ? 14 : 9)
    return tex
  }
  const machining = finish(false), moulding = finish(true)
  const metal = new T.MeshStandardMaterial({ color: 0x384047, roughness: .47, metalness: .76, roughnessMap: machining, bumpMap: machining, bumpScale: .000055, vertexColors: true })
  const edge = new T.MeshStandardMaterial({ color: 0x626b6f, roughness: .42, metalness: .8, roughnessMap: machining, bumpMap: machining, bumpScale: .00004, vertexColors: true })
  const polymer = new T.MeshStandardMaterial({ color: 0x292e2d, roughness: .94, metalness: .02, roughnessMap: moulding, bumpMap: moulding, bumpScale: .00012 })
  const gripMat = new T.MeshStandardMaterial({ color: 0x202727, roughness: .98, metalness: 0, roughnessMap: moulding, bumpMap: moulding, bumpScale: .00032 })
  const bore = new T.MeshStandardMaterial({ color: 0x040607, roughness: .98, metalness: .1 })
  const sightMat = new T.MeshStandardMaterial({ color: 0xd1d6b3, emissive: 0x334024, emissiveIntensity: .4, roughness: .65 })
  function mesh(geometry, material, pos, parent = root, name = '') {
    const o = new T.Mesh(geometry, material); o.name = name; o.position.set(...pos)
    o.castShadow = false; o.receiveShadow = true; o.frustumCulled = false; parent.add(o); return o
  }
  function bevel(size, pos, material = metal, parent = root, name = '') {
    const [w, h, d] = size, r = Math.min(.002, w / 6, h / 6, d / 6), s = new T.Shape()
    s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.lineTo(w / 2, -h / 2 + r)
    s.lineTo(w / 2, h / 2 - r); s.lineTo(w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2)
    s.lineTo(-w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.closePath()
    const g = new T.ExtrudeGeometry(s, { depth: d - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r / 2, bevelSegments: 2, steps: 1 })
    g.translate(0, 0, -d / 2 + r)
    return mesh(g, material, pos, parent, name)
  }
  function tube(radius, length, pos, material, parent = root, name = '') {
    const o = mesh(new T.CylinderGeometry(radius, radius, length, 16), material, pos, parent, name); o.rotation.x = Math.PI / 2; return o
  }
  // One continuous bevelled steel slide, with distinct rails and chamber hood.
  const slide = new T.Group(); slide.name = 'p12-reciprocating-slide'; root.add(slide)
  bevel([.029, .041, .184], [0, .023, -.038], metal, slide, 'phosphated-bevelled-slide')
  for (const x of [-.016, .016]) bevel([.002, .006, .172], [x, .005, -.038], edge, root, 'frame-rail')
  bevel([.024, .004, .175], [0, -.002, -.036], polymer, root, 'dust-cover')
  bevel([.031, .019, .082], [0, -.014, .01], polymer, root, 'polymer-receiver')
  tube(.008, .177, [0, .021, -.046], edge, root, 'steel-barrel')
  tube(.006, .002, [0, .021, -.1355], bore, root, 'recessed-muzzle-bore')
  tube(.0042, .003, [0, .002, -.129], edge, root, 'recoil-guide-rod')
  bevel([.015, .006, .028], [.005, .044, -.017], edge, slide, 'exposed-chamber-hood')
  bevel([.001, .017, .029], [.0152, .027, -.019], bore, slide, 'ejection-port')
  bevel([.0015, .005, .025], [.0161, .037, -.014], edge, slide, 'extractor')
  for (const x of [-.0156, .0156]) {
    for (let n = 0; n < 8; n++) {
      const o = bevel([.0012, .026, .0016], [x, .023, .026 + n * .0035], bore, slide, 'rear-slide-serration'); o.rotation.x = -.18
    }
    for (let n = 0; n < 4; n++) bevel([.0012, .021, .0015], [x, .019, -.108 + n * .004], bore, slide, 'front-slide-serration')
  }
  // Angled, contoured grip with separate backstrap, palm panels and base plate.
  const grip = new T.Group(); grip.name = 'p12-grip'; grip.position.set(0, -.067, .038); grip.rotation.x = -.24; root.add(grip)
  bevel([.031, .092, .039], [0, -.007, 0], polymer, grip, 'contoured-grip-frame')
  bevel([.027, .079, .005], [0, -.009, .022], gripMat, grip, 'textured-backstrap')
  for (const x of [-.016, .016]) {
    bevel([.002, .071, .032], [x, -.011, 0], gripMat, grip, 'stippling-panel')
    for (let n = 0; n < 7; n++) bevel([.0028, .0014, .028], [x, -.04 + n * .009, -.0005], polymer, grip, 'grip-checkering')
  }
  const magazine = new T.Group(); magazine.name = 'p12-detachable-magazine'; magazine.position.set(0, -.067, .038); magazine.rotation.x = -.24; root.add(magazine)
  bevel([.023, .085, .028], [0, -.013, 0], edge, magazine, 'magazine-body')
  bevel([.035, .007, .043], [0, -.058, 0], gripMat, magazine, 'magazine-floorplate')
  for (let n = 0; n < 4; n++) tube(.0016, .024, [0, -.027 + n * .009, .011], bore, magazine, 'magazine-witness-hole').rotation.set(0, 0, Math.PI / 2)
  // A curved hollow trigger guard, separate safety blade and curved trigger.
  const guardCurve = new T.CatmullRomCurve3([[0,-.014,.013],[0,-.046,.005],[0,-.05,-.034],[0,-.04,-.054],[0,-.012,-.055]].map(p => new T.Vector3(...p)))
  mesh(new T.TubeGeometry(guardCurve, 20, .0037, 6, false), polymer, [0,0,0], root, 'hollow-trigger-guard')
  const trigger = bevel([.006, .021, .004], [0, -.022, -.019], metal, root, 'trigger'); trigger.rotation.x = -.28
  bevel([.002, .014, .0018], [0, -.022, -.0165], bore, root, 'trigger-safety-blade')
  for (const x of [-.017, .017]) {
    const pin = tube(.0024, .002, [x, -.011, .024], edge, root, 'frame-retaining-pin'); pin.rotation.set(0, 0, Math.PI / 2)
    bevel([.002, .004, .014], [x, -.003, .036], edge, root, 'slide-stop-lever')
    bevel([.0025, .006, .006], [x, -.028, .026], edge, root, 'magazine-catch')
  }
  // Rear U notch is physically open; front post and three subdued sight dots.
  for (const x of [-.01, .01]) {
    bevel([.006, .009, .008], [x, .048, .043], bore, slide, 'rear-notch-wing')
    tube(.0014, .001, [x, .049, .0475], sightMat, slide, 'rear-sight-dot')
  }
  bevel([.004, .008, .009], [0, .048, -.116], bore, slide, 'front-sight-post')
  tube(.0014, .001, [0, .05, -.111], sightMat, slide, 'front-sight-dot')
  // Original markings rendered locally, with no foreign logo or texture.
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#969e9d'; ctx.font = 'bold 27px monospace'; ctx.fillText('ZH / P12     9×19', 12, 35)
  ctx.font = '15px monospace'; ctx.fillText('PORT SECURITY  07-0216', 12, 67)
  const tex = new T.CanvasTexture(canvas); tex.colorSpace = T.SRGBColorSpace
  const markings = new T.MeshStandardMaterial({ map: tex, transparent: true, roughness: .72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  for (const side of [-1, 1]) {
    const o = mesh(new T.PlaneGeometry(.075, .014), markings, [side * .01515, .021, -.055], slide, 'engraved-port-markings'); o.rotation.y = side * Math.PI / 2
  }
  const flashMat = new T.MeshBasicMaterial({ color: 0xffdca3, transparent: true, opacity: .85, depthWrite: false, toneMapped: false })
  const flash = mesh(new T.ConeGeometry(.018, .065, 7, 1, true), flashMat, [0, .021, -.165], root, 'pistol-muzzle-flash'); flash.rotation.x = -Math.PI / 2; flash.visible = false
  // Keep moving pieces separate; batch all fixed detail by material. Serrations,
  // checkering, pins and rails retain their geometry without one draw per piece.
  root.updateMatrixWorld(true)
  for (const scope of [root, slide, magazine]) {
    const byMaterial = new Map(), parts = []
    scope.traverse(o => {
      if (!o.isMesh || o === trigger || o === flash) return
      let parent = o.parent
      while (parent && parent !== scope) {
        if (parent === slide || parent === magazine) return
        parent = parent.parent
      }
      if (parent !== scope) return
      const list = byMaterial.get(o.material) || []; list.push(o); byMaterial.set(o.material, list)
    })
    for (const [material, objects] of byMaterial) {
      const data = { position: [], normal: [], uv: [] }, inverse = scope.matrixWorld.clone().invert()
      for (const o of objects) {
        const transformed = o.geometry.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld))
        const geometry = transformed.index ? transformed.toNonIndexed() : transformed
        for (const name of Object.keys(data)) data[name].push(...geometry.attributes[name].array)
        parts.push(o.name); o.parent.remove(o)
        if (geometry !== transformed) geometry.dispose()
        transformed.dispose(); o.geometry.dispose()
      }
      const geometry = new T.BufferGeometry()
      for (const [name, values] of Object.entries(data)) geometry.setAttribute(name, new T.BufferAttribute(new Float32Array(values), name === 'uv' ? 2 : 3))
      if (material.vertexColors) {
        const normals = geometry.attributes.normal, positions = geometry.attributes.position, colors = new Float32Array(normals.count * 3)
        for (let n = 0; n < normals.count; n++) {
          const nx = Math.abs(normals.getX(n)), ny = Math.abs(normals.getY(n)), nz = Math.abs(normals.getZ(n))
          const bevel = Math.max(nx,ny,nz) < .98, grain = Math.sin(positions.getX(n) * 1731 + positions.getZ(n) * 719) * .025
          const value = (bevel ? 1.3 : .88) + grain
          colors[n*3] = value; colors[n*3+1] = value; colors[n*3+2] = value
        }
        geometry.setAttribute('color',new T.BufferAttribute(colors,3))
      }
      mesh(geometry, material, [0,0,0], scope, 'p12-batched-detail')
    }
    scope.userData.parts = parts
  }
  root.userData.source = 'Independent Last Harbor procedural P12; no Saltline asset reuse'
  return { root, slide, magazine, trigger, flash }
}

export function createPistol(g, view, hands) {
  const T = g.THREE, model = createPistolModel(T), weapon = g.weapon
  weapon.root.add(model.root)
  const layer = hands[0].object.layers.mask
  model.root.traverse(o => { o.layers.mask = layer })
  const right = hands[0], left = hands[1]
  const supportQ = new T.Quaternion().setFromEuler(new T.Euler(.12, 0, Math.PI / 2))
  const support = new T.Vector3(-.025, -.073, .035).sub(new T.Vector3(0,-.015,-.055).applyQuaternion(supportQ))
  let time = 0, ads = 0, sprint = 0, cooldown = 0, prevFire = false, recoil = 0, recoilV = 0, slideTime = 1, flashTime = 1, reload = null, autoReload = -1, equip = 0, shots = 0
  const muzzle = new T.Vector3(), origin = new T.Vector3(), dir = new T.Vector3(), target = new T.Vector3(), velocity = new T.Vector3()
  const magHome = model.magazine.position.clone(), magQ = model.magazine.quaternion.clone(), supportTarget = new T.Vector3(), reloadQ = new T.Quaternion(), rightQ = right.quaternion.clone()
  function muzzleWorld(out = new T.Vector3()) {
    weapon.root.updateMatrix()
    out.set(0,.021,-.14).applyMatrix4(weapon.root.matrix)
    const scale = Math.tan(g.camera.fov * Math.PI / 360) / Math.tan(g.viewCamera.fov * Math.PI / 360)
    out.x *= scale; out.y *= scale
    return out.applyQuaternion(g.camera.quaternion).add(g.camera.position)
  }
  function cancel() {
    reload = null; autoReload = -1; ads = sprint = recoil = recoilV = 0; cooldown = 0; prevFire = true; slideTime = 1; flashTime = 1
    model.flash.visible = false; model.slide.position.z = 0; model.magazine.position.copy(magHome); model.magazine.quaternion.copy(magQ); model.magazine.visible = true
    view.setTrigger?.(0)
  }
  function reset() { cancel(); time = shots = equip = 0 }
  function equipNow() { cancel(); equip = .38 }
  function reloadNow() {
    if (g.game.state !== 'playing' || reload || weapon.ammo >= PISTOL.magSize || weapon.reserve <= 0) return false
    reload = { t: 0, empty: weapon.ammo === 0, inserted: false, out: false, bolt: false }
    autoReload = -1
    g.events.emit('weapon:reload', { phase: 'start', empty: reload.empty, weapon: 'pistol' }); return true
  }
  function shot() {
    weapon.ammo--; shots++; cooldown = 60 / PISTOL.rpm; recoilV += 1.7; slideTime = flashTime = 0
    if (weapon.ammo === 0 && weapon.reserve > 0) autoReload = .32
    origin.copy(g.player.eye || g.camera.position)
    const random = g.rng || Math.random, angle = random() * Math.PI * 2, spread = Math.tan(weapon.spread) * Math.sqrt(random())
    dir.set(Math.cos(angle) * spread, Math.sin(angle) * spread, -1).normalize().applyQuaternion(g.camera.quaternion)
    // The existing combat module owns raycast, enemy damage, impacts and hitmarkers.
    const hit = g.combat.playerShot(origin, dir, { damage: PISTOL.damage, range: PISTOL.range })
    if (hit?.point) target.copy(hit.point); else target.copy(origin).addScaledVector(dir, PISTOL.range)
    muzzleWorld(muzzle); g.fx?.tracer?.(muzzle, target)
    const shell = muzzle.clone().add(new T.Vector3(.025,.015,.1).applyQuaternion(g.camera.quaternion))
    velocity.set(1.8 + random(), 1.2 + random() * .6, .4).applyQuaternion(g.camera.quaternion)
    if (g.player.vel) velocity.add(g.player.vel)
    g.fx?.shell?.(shell, velocity); g.render?.lightPool?.flash(muzzle, 0xffc782, 22, 5, .035)
    g.events.emit('weapon:fire', { origin, dir, muzzle, ads, weapon: 'pistol' })
    g.player.addRecoil?.(.013 * mix(1,.65,ads), (random() - .5) * .003)
    g.player.addShake?.(.075)
  }
  function update(dt) {
    dt = Math.min(dt, .05); time += dt; cooldown = Math.max(0, cooldown - dt)
    const fire = !!g.input.fire, edge = fire && !prevFire; prevFire = fire
    const reloading = !!reload
    sprint = mix(sprint, g.player.sprinting && !g.input.ads && !fire && !reload ? 1 : 0, 1 - Math.exp(-10 * dt))
    ads = mix(ads, g.input.ads && !reload && sprint < .35 ? 1 : 0, 1 - Math.exp(-19 * dt))
    if (g.input.pressed('reload')) reloadNow()
    if (autoReload >= 0) { autoReload -= dt; if (autoReload < 0) reloadNow() }
    weapon.ads = ads; weapon.spread = mix(.012,.0018,ads) + clamp((g.player.speed || 0) / 6) * mix(.01,.003,ads) + recoil * .06
    if (edge && !reload && sprint < .45 && cooldown <= 0) {
      if (weapon.ammo > 0) shot(); else { g.events.emit('weapon:dry', { weapon: 'pistol' }); cooldown = .2; if (weapon.reserve > 0 && autoReload < 0) autoReload = .32 }
    }
    recoilV += (-recoil * 340 - recoilV * 24) * dt; recoil += recoilV * dt
    slideTime += dt; flashTime += dt
    const slide = slideTime < .09 ? Math.sin(slideTime / .09 * Math.PI) : 0
    model.slide.position.z = .029 * Math.max(slide, weapon.ammo === 0 || (reload?.empty && !reload.bolt) ? .95 : 0)
    model.flash.visible = flashTime < .035; model.flash.rotation.z = shots * 2.4
    view.setTrigger?.(fire && !reload ? 1 : 0); model.trigger.rotation.x = -.28 - (fire ? .16 : 0)
    right.object.position.copy(right.position).add(new T.Vector3(0,.015,-.038)); right.object.quaternion.copy(rightQ)
    left.object.position.copy(support); left.object.quaternion.copy(supportQ)
    model.magazine.visible = true; model.magazine.position.copy(magHome); model.magazine.quaternion.copy(magQ)
    let reloadWeight = 0
    if (reload) {
      const r = reload; r.t += dt; const t = r.t, duration = r.empty ? 2.16 : 1.82
      reloadWeight = Math.min(smooth(t / .25), 1 - smooth((t - duration + .32) / .32))
      // Support hand contacts the mag, pulls it clear, reaches the belt, then seats it.
      const keys = [[0,0,0,0],[.2,0,-.035,.025],[.42,-.005,-.105,.055],[.78,-.09,-.29,.13],[1.02,-.08,-.22,.11],[1.3,-.005,-.115,.05],[1.48,0,-.035,.025],[1.68,0,0,0],[2.2,0,0,0]]
      let n = 0; while (n < keys.length - 2 && t > keys[n + 1][0]) n++
      const a = keys[n], b = keys[n + 1], blend = smooth((t - a[0]) / (b[0] - a[0]))
      supportTarget.set(mix(a[1],b[1],blend),mix(a[2],b[2],blend),mix(a[3],b[3],blend))
      left.object.position.add(supportTarget)
      reloadQ.setFromEuler(new T.Euler(-.3 * reloadWeight, .2 * reloadWeight, .12 * reloadWeight)); left.object.quaternion.multiply(reloadQ)
      if (t >= .3 && !r.out) { r.out = true; g.events.emit('weapon:reload', { phase: 'magout', weapon: 'pistol' }) }
      if (t >= .3 && t < 1.48) {
        // The same physical magazine follows the support hand through the whole arc.
        model.magazine.position.add(supportTarget); model.magazine.position.y -= .012 * smooth((t - .3) / .12)
        model.magazine.quaternion.multiply(reloadQ)
      }
      if (t >= 1.48 && !r.inserted) {
        r.inserted = true; const rounds = Math.min(PISTOL.magSize - weapon.ammo, weapon.reserve)
        weapon.ammo += rounds; weapon.reserve -= rounds; g.events.emit('weapon:reload', { phase: 'magin', weapon: 'pistol' })
      }
      if (r.empty && t > 1.58 && t < 1.98) {
        const rack = Math.sin((t - 1.58) / .4 * Math.PI)
        left.object.position.y += .13 * rack; left.object.position.z -= .055 * rack
        model.slide.position.z = .029 * (t < 1.85 ? 1 : 1 - smooth((t - 1.85) / .1))
      }
      if (r.empty && t >= 1.93 && !r.bolt) { r.bolt = true; g.events.emit('weapon:reload', { phase: 'bolt', weapon: 'pistol' }) }
      if (t >= duration) { reload = null; g.events.emit('weapon:reload', { phase: 'done', weapon: 'pistol' }) }
    }
    equip = Math.max(0, equip - dt)
    const speed = clamp((g.player.speed || 0) / 4), bob = time * (5 + (g.player.speed || 0) * 1.4), quiet = 1 - ads * .9
    const swayX = clamp(g.input.look?.dx || 0,-.1,.1), swayY = clamp(g.input.look?.dy || 0,-.1,.1)
    weapon.root.position.set(mix(.09,0,ads) + Math.sin(bob) * .004 * speed * quiet - .035 * reloadWeight,
      mix(-.105,-.050,ads) + Math.sin(time * 1.8) * .0012 * quiet + Math.cos(bob * 2) * .003 * speed * quiet - .09 * sprint + .045 * reloadWeight - .14 * smooth(equip / .38),
      mix(-.37,-.27,ads) + recoil * .65 + .04 * sprint)
    weapon.root.rotation.set(.025 * (1 - ads) + recoil * 1.4 - .3 * sprint + .3 * reloadWeight + swayY * .2,
      .06 * (1 - ads) + .3 * sprint + .18 * reloadWeight + swayX * .3,
      -.035 * (1 - ads) + .35 * sprint - .6 * reloadWeight + Math.sin(bob) * .008 * speed * quiet)
    weapon.state = reload ? 'reloading' : sprint > .5 ? 'sprinting' : slideTime < .14 ? 'firing' : equip > 0 ? 'equipping' : 'idle'
    if (reloading && !reload) model.slide.position.z = 0
  }
  return { ...model, reset, cancel, equip: equipNow, reloadNow, update, muzzleWorld,
    snapshot: () => ({ ads, sprint, recoil, slide: model.slide.position.z, flash: model.flash.visible, reloadTime: reload?.t ?? null, reloadEmpty: reload?.empty ?? false, magazine: model.magazine.position.toArray(), supportHand: left.object.position.toArray(), equipTime: equip, shots }) }
}
