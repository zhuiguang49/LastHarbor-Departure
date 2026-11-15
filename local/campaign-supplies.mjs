import { CH1 } from './campaign-ch1-layout.mjs'

// Root gates interact behind stable power and interactExit behind a fully open gate.
// update belongs in the native level tick, AFTER player/camera and weapon updates.
export function installCampaignSupplies(g, { equipment, emit }) {
  const T = g.THREE, view = g.weapon.equipmentView, left = view.hands[1]
  const grant = { pistol: 48 }
  let consumed = false, exitConsumed = false, flashlightOwned = false, on = false, lastToggleFrame = null, lastInteractFrame = null
  const root = new T.Group(); root.name = 'campaign-warehouse-supplies'; g.scene.add(root)
  const steel = g.mats.get('steel_galv'), dark = g.mats.get('steel_dark'), rubber = g.mats.get('rubber')
  const lens = new T.MeshStandardMaterial({ color:0xd8e5db, emissive:0xb9d9c8, emissiveIntensity:.5, roughness:.18, metalness:.3 })
  function mesh(geometry, material, xyz, parent) {
    const object = new T.Mesh(geometry, material); object.position.set(...xyz)
    object.receiveShadow = true; parent.add(object); return object
  }
  function flashlight() {
    const model = new T.Group(); model.name = 'booth-duty-flashlight'
    const tube = (radius, length, z, material) => {
      const object = mesh(new T.CylinderGeometry(radius,radius,length,20),material,[0,0,z],model)
      object.rotation.x = Math.PI / 2; return object
    }
    tube(.017,.125,.015,dark)
    for (const z of [-.035,.045,.06,.075]) tube(.019,.006,z,rubber)
    tube(.026,.036,-.061,steel); tube(.028,.009,-.083,dark)
    tube(.023,.002,-.089,lens)
    mesh(new T.BoxGeometry(.012,.005,.018),rubber,[0,.018,.025],model)
    return model
  }
  function station(anchor, exit = false) {
    const group = new T.Group(), position = new T.Vector3(...anchor.position)
    group.name = exit ? 'campaign-exit-ammo-station' : 'campaign-warehouse-supply-station'
    group.position.copy(position); group.rotation.y = anchor.yaw; root.add(group)
    mesh(new T.BoxGeometry(.64,.38,.08),dark,[0,-.07,-.4],group)
    mesh(new T.BoxGeometry(.67,.035,.4),steel,[0,-.21,-.22],group)
    group.updateMatrixWorld(true)
    const bounds = new T.Box3(new T.Vector3(-.34,-.23,-.45),new T.Vector3(.34,.13,-.36)).applyMatrix4(group.matrixWorld)
    g.physics.addBox(bounds.min,bounds.max,{surface:'metal',tag:exit ? 'campaign-exit-supplies-shelf' : 'campaign-supplies-shelf'})
    const pickup = new T.Group(); pickup.name = exit ? 'campaign-exit-ammo-pickup' : 'campaign-ammo-flashlight-pickup'; group.add(pickup)
    for (const x of [-.16,.15]) {
      mesh(new T.BoxGeometry(.17,.105,.14),dark,[x,-.145,-.14],pickup)
      mesh(new T.BoxGeometry(.175,.012,.145),steel,[x,-.086,-.14],pickup)
    }
    if (!exit) {
      const display = flashlight(); display.rotation.y = Math.PI/2; display.position.set(0,-.03,-.08); pickup.add(display)
    }
    const label = g.mats.label(exit ? '出口补给 · 步枪 40/160 · P12 12/48' : '仓库补给 · P12 弹药 · Q 手电',{color:'white',font:'sans',distress:.2})
    mesh(new T.BoxGeometry(exit ? 1.63 : 1.03,.21,.025),dark,[0,.28,-.36],group)
    mesh(new T.PlaneGeometry(exit ? 1.55 : .95,.13),label.material,[0,.28,-.34],group)
    return { position, yaw:anchor.yaw, pickup }
  }
  const warehouse = station(CH1.supplies), exit = station(CH1.exitSupplies,true)
  g.physics.build()
  const handheld = flashlight(); handheld.name = 'campaign-held-flashlight'; handheld.position.set(-.16,-.07,.015)
  handheld.traverse(object => { object.layers.mask = left.layers.mask; object.frustumCulled = false })
  g.weapon.root.add(handheld)
  // Use the original detailed support glove, in the original viewmodel layer.
  // During reload it returns to the P12 controller to operate the real magazine.
  const supportQ = new T.Quaternion().setFromEuler(new T.Euler(.12,0,Math.PI/2))
  const support = handheld.position.clone().sub(new T.Vector3(0,-.015,-.055).applyQuaternion(supportQ))
  const light = new T.SpotLight(0xd7e8dd,0,30,.34,.72,1.5)
  light.name = 'campaign-flashlight-beam'; light.castShadow = true
  light.shadow.mapSize.set(512,512); light.shadow.bias = -.0003; light.shadow.camera.near = .08
  root.add(light,light.target)
  const direction = new T.Vector3(), offset = new T.Vector3()
  function nearby(position) {
    const p = g.player.pos, dx = position.x-p.x, dz = position.z-p.z, distance = Math.hypot(dx,dz)
    if (distance > 1.9 || Math.abs(p.y) > 1.4) return false
    const f = g.player.forward, facing = (dx*f.x+dz*f.z)/Math.max(.001,distance*Math.hypot(f.x,f.z))
    return facing >= .45 && g.physics.lineOfSight(g.player.eye,position)
  }
  function collect(station, isExit) {
    if ((isExit ? exitConsumed : consumed) || g.game.state !== 'playing' || !g.player.alive || !nearby(station.position)) return false
    g.hud.setPrompt(isExit ? '领取出口弹药补给' : '领取弹药与手电筒')
    if (!g.input.pressed('interact') || lastInteractFrame === g.time.frame) return false
    lastInteractFrame = g.time.frame
    if (isExit) {
      exitConsumed = true
      equipment.refill('rifle'); equipment.refill('pistol')
    } else {
      consumed = flashlightOwned = true
      equipment.addAmmo('pistol',grant.pistol)
      on = !['rifle','knife'].includes(equipment.capture().activeWeapon)
    }
    station.pickup.visible = false; g.hud.setPrompt(null)
    g.hud.message(isExit ? '已补满持有枪械的弹匣与备用弹药。' : '已取得有限弹药与手电 · Q 开关 · 手枪可与手电同时使用；长枪需收起手电。',6)
    const position = station.position
    g.audio.play('reload_magin',{pos:position,gain:.35,jitter:0})
    if (!isExit) emit({type:'supplies-acquired',ammo:true,flashlight:true})
    return true
  }
  const interact = () => collect(warehouse,false), interactExit = () => collect(exit,true)
  function hide() { light.intensity = 0; handheld.visible = false }
  function update() {
    warehouse.pickup.visible = !consumed; exit.pickup.visible = !exitConsumed
    if (g.game.state !== 'playing' || !g.player.alive) { hide(); return }
    const active = equipment.capture().activeWeapon
    const compatible = active === null || active === 'pistol'
    if (!compatible) on = false
    if (flashlightOwned && compatible && g.input.pressed('alt') && lastToggleFrame !== g.time.frame) {
      on = !on; lastToggleFrame = g.time.frame
    }
    const visible = flashlightOwned && on && compatible && g.weapon.state !== 'reloading'
    handheld.visible = visible; light.intensity = visible ? 140 : 0
    if (!visible) return
    left.position.copy(support); left.quaternion.copy(supportQ)
    // Camera quaternion includes pitch/recoil/shake; player.forward alone does not.
    direction.set(0,0,-1).applyQuaternion(g.camera.quaternion).normalize()
    offset.set(-.15,-.12,-.12).applyQuaternion(g.camera.quaternion)
    light.position.copy(g.camera.position).add(offset)
    light.target.position.copy(light.position).addScaledVector(direction,light.distance)
    light.updateMatrixWorld(true); light.target.updateMatrixWorld(true)
  }
  function reset(saved) {
    consumed = saved?.consumed === true
    exitConsumed = saved?.exitConsumed === true
    flashlightOwned = consumed && saved?.flashlightOwned === true
    on = flashlightOwned && saved?.on === true
    lastToggleFrame = g.time.frame; lastInteractFrame = null
    warehouse.pickup.visible = !consumed; exit.pickup.visible = !exitConsumed; hide()
    // Ammo is exclusively equipment's checkpoint state. Never grant it here.
  }
  function snapshot() {
    return { consumed, exitConsumed, flashlightOwned, on, position:warehouse.position.toArray(), yaw:warehouse.yaw, pickupVisible:warehouse.pickup.visible,
      exitPosition:exit.position.toArray(), exitYaw:exit.yaw, exitPickupVisible:exit.pickup.visible,
      ammoGrant:{...grant}, beam:{active:light.intensity>0,intensity:light.intensity,position:light.position.toArray(),target:light.target.position.toArray()},
      hand: left.position.toArray(), handLayer:left.layers.mask, flashlightLayer:handheld.layers.mask }
  }
  g.events.on('game:state',({state})=>{if(state !== 'playing') hide()})
  reset()
  return { interact, interactExit, update, reset, snapshot }
}
