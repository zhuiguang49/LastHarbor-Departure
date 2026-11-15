import { PISTOL, createPistol } from './pistol.mjs'
import { KNIFE, createKnife } from './knife.mjs'
import { CH1 } from './campaign-ch1-layout.mjs'

// Installed once after the audited dm view adapter; the original root and hands
// remain in its viewmodel render layer. Only the selected controller updates it.
export function installEquipment(g, environment) {
  const T = g.THREE, weapon = g.weapon, input = g.input, view = weapon.equipmentView
  const { mesh, lamp, campaignM2 = false } = environment
  if (!view || view.hands?.length !== 2 || !view.firearm?.length || !view.effects || typeof view.cancelActions !== 'function') {
    throw Error('Equipment requires the audited dm.equipmentView adapter before gameplay')
  }
  const rifle = { id: 'rifle', slot: 1, name: '港务安保突击步枪', magSize: weapon.magSize, reserve: weapon.magSize, damage: weapon.damage > 25 ? weapon.damage + 5 : 25, rpm: weapon.rpm, range: 300 }
  if (campaignM2) Object.assign(rifle,{ magSize:40, reserve:160, reserveCap:160 })
  const specs = { rifle, pistol: campaignM2 ? { ...PISTOL, reserveCap:48 } : PISTOL, knife: KNIFE }, slots = {}
  const labels = { rifle:'1 PRIMARY · 突击步枪', pistol:'2 PISTOL · P12 手枪', knife:'3 KNIFE · 安保匕首' }
  let active = null, equipTime = 0, hinted = false, markers = [], pendingSlot = null, lastPickupFrame = null
  const native = {
    inputUpdate: input.update.bind(input), down: input.down.bind(input), pressed: input.pressed.bind(input),
    weaponUpdate: weapon.update.bind(weapon), reset: weapon.reset.bind(weapon), reload: weapon.reloadNow.bind(weapon),
    muzzleWorld: weapon.muzzleWorld?.bind(weapon), playerShot: g.combat.playerShot.bind(g.combat), hudUpdate: g.hud.update.bind(g.hud),
    setMarkers: g.hud.setMarkers.bind(g.hud), setObjective: g.hud.setObjective.bind(g.hud),
  }
  const hands = view.hands.map(object => ({ object, position: object.position.clone(), quaternion: object.quaternion.clone() }))
  const unarmedTurns = [new T.Quaternion().setFromEuler(new T.Euler(.25, -.18, .12)), new T.Quaternion().setFromEuler(new T.Euler(.2, .12, -.18))]
  function freshSlots() { for (const [id, spec] of Object.entries(specs)) slots[id] = { ...spec, owned: false, ammo: spec.magSize } }
  freshSlots()
  // Native HUD, player ADS and rifle controller all see the selected slot's
  // authoritative record. Inactive ammo never passes through a shared counter.
  for (const field of ['ammo','reserve','magSize','name','damage','rpm']) Object.defineProperty(weapon, field, {
    configurable: true, enumerable: true,
    get: () => slots[active || 'rifle'][field],
    set: value => {
      const s = slots[active || 'rifle']
      if (campaignM2 && ['ammo','reserve'].includes(field)) {
        if (Number.isSafeInteger(value)) s[field] = Math.max(0,Math.min(value,field === 'ammo' ? s.magSize : s.reserveCap ?? 0))
      } else s[field] = value
    },
  })
  const armed = () => !!active && slots[active].owned
  const firearm = () => armed() && active !== 'knife'
  Object.defineProperty(weapon, 'hasFirearm', { configurable: true, get: firearm })
  Object.defineProperty(weapon, 'hasWeapon', { configurable: true, get: armed })
  const pistol = createPistol(g, view, hands)
  const knife = createKnife(g, view, hands)
  const campaignProbe = environment.campaignProbe || campaignM2
  const group = new T.Group(); group.name = 'harbor-security-equipment'; g.scene.add(group)
  const steel = g.mats.get('steel_galv'), dark = g.mats.get('steel_dark')
  const pickups = []
  const locations = campaignM2 ? CH1.pickups : Object.fromEntries([['pistol',.15],['rifle',-1.65],['knife',1.95]].map(([id,z])=>[id,{position:[-33.47,1.12,z],yaw:Math.PI/2}]))
  for (const [id, anchor] of Object.entries(locations)) {
    const position = new T.Vector3(...anchor.position), locker = new T.Group()
    locker.name = `security-${id}-locker`; locker.position.copy(position); locker.rotation.y = anchor.yaw - Math.PI/2; group.add(locker)
    const box = (size, pos, material = steel) => mesh(new T.BoxGeometry(...size),material,pos,locker)
    box([.07,1.05,1.04],[-.38,-.07,0],dark)
    for (const dz of [-.52,.52]) box([.34,1.05,.045],[-.21,-.07,dz])
    for (const y of [.52,.86,1.58]) box([.34,.045,1.08],[-.21,y-position.y,0])
    const door = box([.035,1.05,1.02],[-.19,-.07,.93],dark); door.rotation.y = -.95
    locker.updateMatrixWorld(true)
    const bounds = new T.Box3(new T.Vector3(-.43,-position.y,-.57),new T.Vector3(-.03,1.61-position.y,.57)).applyMatrix4(locker.matrixWorld)
    g.physics.addBox(bounds.min,bounds.max,{surface:'metal',tag:`harbor-security-${id}-locker`})
    const pickup = new T.Group(); pickup.name = `security-${id}-pickup`; locker.add(pickup)
    if (id === 'pistol') {
      const model = pistol.root.clone(true); model.rotation.set(.15,0,-.35); model.scale.setScalar(1.4); pickup.add(model)
    } else if (id === 'knife') {
      const model = knife.root.clone(true); model.rotation.set(.08,Math.PI/2,-.3); model.scale.setScalar(1.6); pickup.add(model)
    } else for (const original of view.firearm) pickup.add(original.clone(true))
    pickup.traverse(o => { o.layers.mask = g.scene.layers.mask; o.castShadow = false; if (id === 'rifle') o.visible = true })
    const label = g.mats.label(labels[id], {color:'white',font:'sans',distress:.2})
    if (campaignM2) box([.025,.2,1.02],[-.01,.37,0],dark)
    const sign = mesh(new T.PlaneGeometry(.94,.12),label.material,[.01,.37,0],locker); sign.rotation.y = Math.PI/2
    pickups.push({id,position,yaw:anchor.yaw,locker,object:pickup,enabled:true})
  }
  g.physics.build()
  const notice = g.mats.label('安保协议执行中 · 非授权人员不得进入',{color:'white',font:'sans',distress:.2})
  const checkpoint = pickups.find(p=>p.id === 'pistol')
  const plate = mesh(new T.PlaneGeometry(1.2,.1),notice.material,[-.41,.78,0],checkpoint.locker); plate.rotation.y = Math.PI/2
  const guidePosition = checkpoint.locker.localToWorld(new T.Vector3(.52,.93,0))
  const guide = lamp(guidePosition.toArray(),0xffd4a0,16,checkpoint.position.toArray()); guide.distance = 6; guide.castShadow = false
  const style = document.createElement('style')
  style.textContent = '.harbor-unarmed .h-ammo,.harbor-unarmed .h-cross,.harbor-unarmed .h-hit,.harbor-unarmed .t-fire,.harbor-unarmed .t-ads,.harbor-unarmed .t-reload,.harbor-knife .h-ammo-row,.harbor-knife .h-pips,.harbor-knife .h-cue,.harbor-knife .t-ads,.harbor-knife .t-reload{display:none!important}'
  document.head.append(style)
  function sync() {
    document.documentElement.classList.toggle('harbor-unarmed', !armed())
    document.documentElement.classList.toggle('harbor-knife', active === 'knife')
    for (const p of pickups) p.object.visible = !slots[p.id].owned
    for (const o of view.firearm) o.visible = active === 'rifle'
    pistol.root.visible = active === 'pistol'
    knife.root.visible = active === 'knife'
    knife.hand.visible = active === 'knife'
    if (active !== 'rifle') for (const o of view.effects) o.visible = false
    if (!firearm()) { weapon.ads = 0; g.player.ads = 0 }
    if (g.player.alive && ['intro','playing'].includes(g.game.state)) weapon.root.visible = true
    for (const [i, hand] of hands.entries()) hand.object.visible = active !== 'knife' || i !== 0
  }
  function syncMarkers() {
    native.setMarkers([...markers,...pickups.filter(p=>!campaignProbe && p.enabled && !slots[p.id].owned).map(p=>({id:`security-${p.id}`,short:String(specs[p.id].slot),label:labels[p.id],pos:p.position,kind:'relay'}))])
  }
  function restoreHands() { for (const hand of hands) { hand.object.position.copy(hand.position); hand.object.quaternion.copy(hand.quaternion) } }
  function poseUnarmed() {
    restoreHands()
    for (let i = 0; i < hands.length; i++) {
      const o = hands[i].object; o.position.x += i ? -.18 : -.02; o.position.y += i ? -.015 : .08; o.position.z += i ? .01 : -.18; o.quaternion.multiply(unarmedTurns[i])
    }
  }
  function select(slot) {
    const id = Object.values(specs).find(spec=>String(spec.slot)===String(slot))?.id || slot
    if (g.game.state !== 'playing' || !g.player.alive || !slots[id]?.owned || id === active) return false
    activate(id); return true
  }
  function activate(id) {
    // Native reset also restores its detached magazine/support-hand transforms.
    // Preserve all slot records while cancelling private rifle animation state.
    const saved = Object.fromEntries(Object.entries(slots).map(([key,s])=>[key,{...s}]))
    native.reset(); Object.assign(slots,saved); view.cancelActions(); pistol.cancel(); knife.cancel(); restoreHands()
    active = id; equipTime = .42; weapon.state = 'equipping'; weapon.ads = 0; g.player.ads = 0
    weapon.debug.noFire = false; weapon.debug.flash = false; weapon.debug.reloadT = null
    if (id === 'pistol') pistol.equip()
    if (id === 'knife') knife.equip()
    sync()
  }
  function reset() {
    active = null; equipTime = 0; hinted = false; pendingSlot = null
    for (const p of pickups) p.enabled = true
    native.reset(); freshSlots(); pistol.reset(); knife.reset(); poseUnarmed(); view.cancelActions(); sync(); syncMarkers()
  }
  function capture() {
    return { activeWeapon: active,
      slots: Object.fromEntries(Object.entries(slots).map(([id,s])=>[id,{owned:s.owned,ammo:s.ammo,reserve:s.reserve}])),
      pickupEnabled: Object.fromEntries(pickups.map(p=>[p.id,p.enabled])) }
  }
  function restore(saved) {
    reset()
    if (!saved) return capture()
    for (const [id,s] of Object.entries(slots)) {
      const record = saved.slots?.[id]
      if (!record) continue
      s.owned = record.owned === true
      if (Number.isSafeInteger(record.ammo) && record.ammo >= 0 && (campaignM2 || record.ammo <= s.magSize)) s.ammo = Math.min(record.ammo,s.magSize)
      if (Number.isSafeInteger(record.reserve) && record.reserve >= 0 && id !== 'knife') s.reserve = Math.min(record.reserve,s.reserveCap ?? Number.MAX_SAFE_INTEGER)
    }
    for (const p of pickups) p.enabled = saved.pickupEnabled?.[p.id] !== false
    if (slots[saved.activeWeapon]?.owned) activate(saved.activeWeapon)
    sync(); syncMarkers(); return capture()
  }
  function validateCapture(saved) {
    const invalid = () => { throw Error('Invalid equipment checkpoint') }
    if (!saved?.slots || !saved.pickupEnabled || !(saved.activeWeapon === null || Object.hasOwn(slots,saved.activeWeapon))) invalid()
    for (const [id,spec] of Object.entries(specs)) {
      const record=saved.slots[id]
      if (!record || typeof record.owned !== 'boolean' || typeof saved.pickupEnabled[id] !== 'boolean' ||
        !Number.isSafeInteger(record.ammo) || record.ammo<0 || record.ammo>spec.magSize ||
        !Number.isSafeInteger(record.reserve) || record.reserve<0 || record.reserve>(spec.reserveCap ?? Number.MAX_SAFE_INTEGER) ||
        id==='knife' && record.reserve!==0) invalid()
    }
    if (saved.activeWeapon && !saved.slots[saved.activeWeapon].owned) invalid()
    return JSON.parse(JSON.stringify(saved))
  }
  function addAmmo(id, amount) {
    const s = slots[id]
    if (!s || id === 'knife' || !Number.isSafeInteger(amount) || amount <= 0) return 0
    const added = Math.min(amount,(s.reserveCap ?? Number.MAX_SAFE_INTEGER)-s.reserve)
    if (!s.reserveCap && !Number.isSafeInteger(s.reserve + amount)) return 0
    s.reserve += added; return added
  }
  function refill(id) {
    const s = slots[id]
    if (!s?.owned || !s.reserveCap || id === 'knife') return false
    const changed = s.ammo !== s.magSize || s.reserve !== s.reserveCap
    s.ammo = s.magSize; s.reserve = s.reserveCap
    return changed
  }
  function setPickupEnabled(id, enabled) {
    const p = pickups.find(p=>p.id === id)
    if (!p) return false
    p.enabled = !!enabled; syncMarkers(); return true
  }
  const blocked = action => (!armed() && action === 'fire') || (!firearm() && ['ads','reload'].includes(action))
  input.down = action => blocked(action) ? false : native.down(action)
  input.pressed = action => blocked(action) || (action === 'interact' && lastPickupFrame !== null && lastPickupFrame === g.time?.frame) ? false : native.pressed(action)
  input.update = dt => {
    native.inputUpdate(dt)
    if (pendingSlot !== null) { select(pendingSlot); pendingSlot = null }
    if (!armed()) input.fire = false
    if (!firearm()) input.ads = false
  }
  // Existing native input has no number-key actions. One installer-owned handler
  // forwards only fresh gameplay presses; pause/replay and text fields ignore it.
  globalThis.addEventListener?.('keydown', event => {
    if (event.repeat || g.game.state !== 'playing' || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target?.tagName || '')) return
    if (['Digit1','Digit2','Digit3'].includes(event.code)) { pendingSlot = Number(event.code.at(-1)); event.preventDefault() }
  })
  weapon.reloadNow = (...args) => !firearm() || g.game.state !== 'playing' ? false : active === 'pistol' ? pistol.reloadNow() : native.reload(...args)
  weapon.muzzleWorld = (...args) => active === 'pistol' ? pistol.muzzleWorld(...args) : native.muzzleWorld?.(...args)
  // The native rifle emits its closed-over original damage; apply the owned
  // rifle record at the existing combat boundary as well as the HUD record.
  g.combat.playerShot = (origin,direction,options) => firearm() && g.game.state === 'playing' && g.player.alive ?
    native.playerShot(origin,direction,active === 'rifle' ? {...options,damage:slots.rifle.damage} : options) : null
  weapon.reset = reset
  weapon.update = dt => {
    if (!g.player.alive || (g.game.state !== 'playing' && g.game.state !== 'intro')) return
    if (active === 'knife') knife.update(dt)
    else if (active === 'pistol') pistol.update(dt)
    else {
      if (!active) {
        input.fire = false; input.ads = false; view.cancelActions()
        weapon.debug.noFire = true; weapon.debug.flash = false; weapon.debug.reloadT = null
      }
      native.weaponUpdate(dt)
      if (!active) poseUnarmed()
    }
    equipTime = Math.max(0,equipTime-dt)
    if (active === 'rifle' && equipTime > 0) {
      const amount = (equipTime/.42)**2
      weapon.root.position.y -= amount*.14; weapon.root.rotation.x += amount*.24
    }
    sync()
  }
  g.hud.setMarkers = next => { markers = [...next]; syncMarkers() }
  const objective = () => !campaignProbe && !armed() ? '前往安保检查站 · 寻找装备' : null
  g.hud.setObjective = text => native.setObjective(objective() || text)
  g.hud.update = dt => { native.hudUpdate(dt); sync() }
  function nearby(position) {
    const p = g.player.pos, dx = position.x-p.x, dz = position.z-p.z, distance = Math.hypot(dx,dz)
    if (distance > 1.9 || Math.abs(p.y) > 1.4) return false
    const f = g.player.forward, facing = (dx*f.x+dz*f.z)/Math.max(.001,distance*Math.hypot(f.x,f.z))
    return (distance < .8 || facing >= .45) && g.physics.lineOfSight(g.player.eye,position)
  }
  function update() {
    if (g.game.state !== 'playing' || !g.player.alive) return false
    if (!hinted && !campaignProbe) { hinted = true; g.hud.message('身后的安保岗亭留有自卫装备。绕过路障检查东侧三柜：1 主武器步枪 / 2 手枪 / 3 安保匕首。',7) }
    const candidate = pickups.filter(p=>p.enabled && !slots[p.id].owned && nearby(p.position)).sort((a,b)=>a.position.distanceToSquared(g.player.pos)-b.position.distanceToSquared(g.player.pos))[0]
    if (!candidate) return false
    const spec = specs[candidate.id]; g.hud.setPrompt(`拾取${spec.name}`)
    const prompt = g.hud.root.querySelector('.h-plabel'); if (prompt) prompt.textContent = `E — 拾取${spec.name}`
    if (input.pressed('interact')) {
      lastPickupFrame = g.time?.frame ?? null
      slots[candidate.id].owned = true; select(candidate.id); syncMarkers(); g.hud.setPrompt(null)
      g.hud.message(`已取得${spec.name} · 1 主武器 / 2 手枪 / 3 刀${candidate.id==='knife'?' · 左键轻击':''}`,4)
      g.audio.play('reload_magin',{pos:candidate.position,gain:.35,jitter:0})
      g.events.emit('equipment:acquired',{id:candidate.id,name:spec.name,slot:spec.slot})
    }
    return true
  }
  g.events.on('game:state',({state})=>{
    pendingSlot = null
    if (state === 'dead' || state === 'title') reset()
    // Firearm reloads retain their existing pause timeline. A suspended melee
    // contact is cancelled so resuming cannot damage an enemy without a new edge.
    if (state !== 'playing' && active === 'knife') { knife.cancel(); weapon.state = 'idle' }
    if (state === 'paused') { input.fire = false; input.ads = false }
  })
  reset()
  return { reset, update, objective, select, capture, restore, validateCapture, addAmmo, refill, setPickupEnabled,
    snapshot: () => ({ hasFirearm: firearm(), hasWeapon: armed(), activeWeapon: active, activeSlot: active ? specs[active].slot : null, slotLabels:{...labels}, phase: armed()?'armed':'unarmed', pickupConsumed: slots.pistol.owned, position: pickups[0].position.toArray(), pickupVisible: pickups[0].object.visible,
      equipTime, ammo: weapon.ammo, reserve: weapon.reserve, slots: Object.fromEntries(Object.entries(slots).map(([id,s])=>[id,{...s}])),
      pickups: pickups.map(p=>({id:p.id,slot:specs[p.id].slot,position:p.position.toArray(),yaw:p.yaw,visible:p.object.visible,owned:slots[p.id].owned,enabled:p.enabled})), pistol:pistol.snapshot(), knife:knife.snapshot() }),
  }
}
