import { createInfrastructure } from './infrastructure-state.mjs'
import { installPowerLighting } from './power-lighting.mjs'

export function installInfrastructure(g, environment) {
  const T = g.THREE, model = createInfrastructure(), s = model.state
  const group = new T.Group(); group.name = 'harbor-infrastructure'; g.scene.add(group)
  const { mesh, lamp } = environment
  const steel = g.mats.get('steel_galv'), dark = g.mats.get('steel_dark'), fence = g.mats.get('chainlink')
  const box = (size, pos, material = steel, parent = group) => mesh(new T.BoxGeometry(...size), material, pos, parent)
  function barrier(min, max, tag) {
    return g.physics.addBox(new T.Vector3(...min), new T.Vector3(...max), { surface: 'metal', tag })
  }
  // A visible enclosure controls the original ladder, without sealing off any device.
  const gate = new T.Group(); gate.position.set(27.6, 0, 20); group.add(gate)
  box([.06, 3.5, 3.8], [0, 1.8, 0], fence, gate)
  for (const z of [-1.95, 1.95]) box([.12, 3.6, .12], [0, 1.8, z], steel, gate)
  for (const y of [.05, 3.55]) box([.12, .12, 4], [0, y, 0], steel, gate)
  for (const z of [17.9, 22.1]) {
    box([2.53, 3.6, .07], [28.765, 1.8, z], fence)
    box([.15, 7.5, .15], [27.6, 3.75, z], dark)
    barrier([27.5, 0, z - .08], [30.03, 3.6, z + .08], 'harbor-fixed-fence')
  }
  const gateBox = barrier([27.5, 0, 18], [27.7, 3.6, 22], 'harbor-moving-gate')
  g.physics.build()
  const statusLight = lamp([27.7, 2.5, 20], 0xffb26b, 14, [28, 0, 20])
  const pumpLight = lamp([24.2, 2.1, -.8], 0xbbd9ee, 0, [23.2, .3, 0])
  box([.08, 2.1, .08], [24.2, 1.05, -.8])
  box([.95, .22, .65], [24.4, .11, -.8], dark)
  const motor = mesh(new T.CylinderGeometry(.2, .2, .55, 16), g.mats.get('paint_green'), [24.4, .46, -.8], group)
  motor.rotation.z = Math.PI / 2
  for (let i = 0; i < 5; i++) { const fin = mesh(new T.TorusGeometry(.205, .012, 4, 20), dark, [24.2 + i * .1, .46, -.8], group); fin.rotation.y = Math.PI / 2 }
  const wheel = mesh(new T.TorusGeometry(.18, .025, 6, 20), g.mats.get('paint_red'), [24.4, .9, -.8], group)
  const hoseCurve = new T.CatmullRomCurve3([[24.6,.22,-.6],[28.6,.08,1],[28.65,.08,9],[28.65,.08,16],[29.1,.12,19.5],[30.5,-.8,20.5]].map(p => new T.Vector3(...p)))
  mesh(new T.TubeGeometry(hoseCurve, 90, .035, 7, false), g.mats.get('rubber'), [0,0,0], group)
  const dial = mesh(new T.CylinderGeometry(.14,.14,.05,24), g.mats.get('paint_white'), [24.1,.9,-.5], group)
  dial.rotation.x = Math.PI / 2
  const needle = box([.015,.12,.012], [24.1,.94,-.46], dark)
  const boatLamp = mesh(new T.SphereGeometry(.055, 8, 6), new T.MeshStandardMaterial({ color: 0x733b22, emissive: 0x733b22, emissiveIntensity: 1 }), [0,1.5,0], g.backdrop.boat)
  const boatX = g.backdrop.boat.position.x
  const lighting = installPowerLighting(g, { lamps: environment.lamps, pumpLight, settings: environment.settings, state: s })
  let faultCue
  const devices = g.level.objectives.map((o, i) => ({ o, kind: ['power','gate','fuel'][i], name: ['应急配电柜','七号泊位封锁控制','燃油泵与离港控制'][i], hold: 0 }))
  for (const d of devices) {
    const panel = new T.Group(); panel.position.copy(d.o.pos); panel.rotation.y = [ .35, .9*Math.PI/2, -.2 ][devices.indexOf(d)]; group.add(panel)
    box([.85,.3,.025],[0,1.45,.51], dark, panel)
    const label = g.mats.label(d.name, { color:'white', font:'sans', distress:.15 })
    mesh(new T.PlaneGeometry(.79,.14),label.material,[0,1.47,.53],panel)
    d.lever = box([.035,.2,.04],[.3,1.15,.57],g.mats.get('paint_red'),panel)
    d.indicator = mesh(new T.SphereGeometry(.035,8,6),new T.MeshStandardMaterial({color:0x833d20,emissive:0x833d20,emissiveIntensity:1}),[-.3,1.15,.57],panel)
    d.o.label = d.name
  }
  let boarding = 0, ended = false, previousGate = 'LOCKED', pumpLoop = null, departureCamera = null, chapter5Fuel = null
  const menu = document.querySelector('.menu')
  menu.querySelector('.m-title').setAttribute('aria-label','末港·今夜离港')
  menu.querySelector('.m-word').innerHTML = '末港<span class="m-subtitle">·今夜离港</span>'
  menu.querySelector('.m-eyebrow').innerHTML = '<span class="m-tag">07</span><span>Last Harbor:Departure</span><span class="m-dim">紫金港 · 灾变第七日 · 23:47</span>'
  menu.querySelector('.m-eyebrow').style.textTransform = 'none'
  menu.querySelector('.m-premise').textContent = '你是撤离行动中失联的港区应急技术人员。七号泊位还停着一艘工作艇。恢复供电，解除封锁，启动燃油系统，在天亮前离港。'
  menu.querySelector('.m-note').textContent = ''
  menu.querySelector('.m-debrief .m-h').textContent = '已驶离七号泊位'
  menu.querySelector('.m-debrief .m-k').textContent = '七号泊位 · 行动简报'
  menu.querySelector('.loc-card b').textContent = '紫金港 · 第七封锁区'
  menu.querySelector('.loc-card span').textContent = '2029.11.17 — 23:47\n暴雨持续中。港区通讯中断。撤离状态：未知。'
  menu.querySelector('.loc-card span').style.whiteSpace = 'pre-line'
  document.querySelector('.comms-who').textContent = '未知信号'
  const controls = document.createTreeWalker(menu, NodeFilter.SHOW_TEXT)
  while (controls.nextNode()) {
    const node=controls.currentNode
    const copy={'切断中继':'操作港务设备',' 切断中继':' 操作设备','靠近中继并按住“交互”':'靠近设备并按住“交互”','已切断中继':'已就绪设备','突击队员倒下':'幸存者倒下'}[node.textContent]
    if (copy) node.textContent=copy
  }
  const sourceNote=document.createElement('p')
  sourceNote.textContent='原作基础：Felix Rieseberg 的 Saltline。中文本地化：几猫汉化版。更多制作与素材署名见仓库 CREDITS.md。'
  menu.querySelector('[data-pane="about"]').prepend(sourceNote)
  document.querySelector('.h-relays > span').textContent = '设备'
  const renderFrame = g.render.frame.bind(g.render)
  // Player.update writes the camera after game.update. Attach to the existing
  // boat immediately before the original renderer copies its viewmodel camera.
  g.render.frame = dt => {
    if (g.game.state === 'dead') menu.querySelector('[data-f="dead-relays"]').textContent = `${[s.power==='ON',s.gate==='OPEN',s.fuel==='READY'].filter(Boolean).length}/3`
    if (departureCamera) {
      const board = Math.min(1, s.departureProgress / .3)
      g.camera.position.copy(departureCamera).lerp(new T.Vector3(g.backdrop.boat.position.x, g.backdrop.boat.position.y + 2.1, g.backdrop.boat.position.z), board)
    }
    renderFrame(dt)
  }
  function objective() { return s.power !== 'ON' ? '恢复应急供电 · 三处设备可自由调查' : s.gate !== 'OPEN' ? '开启七号泊位封锁 · 燃油泵可先启动' : s.fuel !== 'READY' ? '启动燃油泵，等待离港联锁' : '七号泊位就绪 · 到梯口长按 E 登船' }
  function reason(d) {
    if (d.kind !== 'power' && s.power !== 'ON') return `${d.name}：应急母线无稳定电力`
    if (d.kind === 'power') return s.power === 'OFF' ? null : s.power === 'UNSTABLE' ? '备用电源正在稳定' : '应急供电正常'
    if (d.kind === 'gate') return s.gate === 'LOCKED' ? null : s.gate === 'OPERATING' ? '泊位安全门正在升起' : '泊位通路已开放'
    return s.fuel === 'UNAVAILABLE' ? null : s.fuel === 'PUMPING' ? `燃油输送 ${Math.round(s.fuelProgress*100)}%` : '燃油就绪'
  }
  function sync(dt) {
    const on = s.power === 'ON'
    faultCue = lighting.update(dt, s)
    gate.position.y = s.gateProgress * 3.8
    gateBox.min.y = gate.position.y; gateBox.max.y = gate.position.y + 3.6
    if (previousGate !== s.gate) { g.physics.build(); previousGate = s.gate }
    const color = s.gate === 'OPEN' ? 0x78cf91 : 0xc06f32
    statusLight.color.setHex(color); statusLight.userData.lens.material.color.setHex(color); statusLight.userData.lens.material.emissive.setHex(color)
    for (const d of devices) {
      const done = d.kind === 'power' ? on : d.kind === 'gate' ? s.gate === 'OPEN' : s.fuel === 'READY'
      d.lever.rotation.x = done ? -.8 : d.hold * -.6
      d.indicator.material.emissive.setHex(done ? 0x78cf91 : 0x833d20)
    }
    syncFuel(dt)
    boatLamp.material.emissive.setHex(s.boat === 'READY' || s.boat === 'DEPARTING' ? 0x78cf91 : 0x733b22)
    g.backdrop.boat.position.x = boatX + s.departureProgress * 5
  }
  function syncFuel(dt) {
    const progress=chapter5Fuel?.progress??s.fuelProgress
    const pumping=chapter5Fuel?chapter5Fuel.pumping&&!chapter5Fuel.paused:s.fuel==='PUMPING'
    if (pumping) {
      wheel.rotation.z += dt * 4
      if (!pumpLoop) pumpLoop = g.audio.loop('relay_hum', { pos: { x:24.4,y:.5,z:-.8 }, gain:.25 })
    } else if (pumpLoop) { pumpLoop.stop(); pumpLoop = null }
    needle.rotation.z = 1.1 - progress * 2.2
    const fault=!!chapter5Fuel?.fault,color=fault?0xff6a24:0xbbd9ee
    pumpLight.color.setHex(color);pumpLight.userData.lens.material.color.setHex(color)
    pumpLight.userData.lens.material.emissive.setHex(color)
    if(fault){pumpLight.intensity=18;pumpLight.userData.lens.material.emissiveIntensity=1.5}
    if(chapter5Fuel){
      const d=devices.find(d=>d.kind==='fuel')
      d.lever.rotation.x=progress>0?-.8:0
      d.indicator.material.emissive.setHex(fault?0xff6a24:progress===1?0x78cf91:0x833d20)
    }
  }
  function reset() {
    model.reset(); boarding = 0; ended = false; departureCamera = null; chapter5Fuel = null
    lighting.reset(s)
    environment.resetFaults?.()
    for (const d of devices) { d.hold=0; d.o.object.userData.setState('live') }
    g.hud.setMarkers([...devices.map(d=>({id:d.o.id,short:d.kind==='power'?'电':d.kind==='gate'?'门':'油',label:d.name,pos:d.o.pos,kind:'relay'})),{id:'extract',short:'艇',label:'七号登船点',pos:g.level.extraction.pos,kind:'extract'}])
    sync(0); g.physics.build()
  }
  function update(dt, finish) {
    if (g.game.state !== 'playing' || !g.player.alive) return
    model.tick(dt); sync(dt)
    if (environment.equipment?.update(dt)) return
    if (s.boat === 'EXTRACTED') { if (!ended) { ended=true; finish() } return }
    if (s.boat === 'DEPARTING') {
      departureCamera ||= g.camera.position.clone()
      g.player.enabled=false; g.player.invulnerable=true
      g.hud.setPrompt(null); g.hud.setObjective('已登船 · 正在离港'); return
    }
    g.hud.setObjective(objective())
    g.hud.setRelays([s.power==='ON',s.gate==='OPEN',s.fuel==='READY'].filter(Boolean).length,3)
    const p = g.player.pos
    let candidate = null, nearest = 2.2
    for (const d of devices) {
      const dx=d.o.pos.x-p.x,dz=d.o.pos.z-p.z,dist=Math.hypot(dx,dz)
      if (dist<nearest && Math.abs(d.o.pos.y-p.y)<2.5 && (dist<.9 || (dx*g.player.forward.x+dz*g.player.forward.z)/(dist*Math.max(.2,Math.hypot(g.player.forward.x,g.player.forward.z)))>=.45)) {candidate=d;nearest=dist}
    }
    for (const d of devices) {
      if (d===candidate && !reason(d) && g.input.down('interact')) {
        d.hold = Math.min(1,d.hold+dt/2.4)
        if (d.hold===1 && model.request(d.kind)) {g.audio.play('relay_cut',{pos:d.o.pos,gain:.25,jitter:0});g.player.addShake(.08);d.hold=0}
      } else d.hold=Math.max(0,d.hold-dt*1.6)
    }
    if (candidate) { g.hud.setPrompt(reason(candidate) || `${candidate.kind==='power'?'合闸':candidate.kind==='gate'?'解除封锁':'启动燃油泵'}`, candidate.hold); return }
    const nearBoat=Math.hypot(p.x-29,p.z-20)<4
    const inside=p.x>28.05 && p.x<29.62 && p.z>18.45 && p.z<21.55 && Math.abs(p.y)<.4
    if (nearBoat) {
      const missing=[s.power!=='ON'?'应急电力':null,s.gate!=='OPEN'?'泊位安全门':null,s.fuel!=='READY'?'燃油':null].filter(Boolean)
      if (missing.length) {g.hud.setPrompt(`离港联锁未就绪：${missing.join('、')}`);boarding=0}
      else if (!inside) {g.hud.setPrompt('进入开放的安全门，抵达登船梯口');boarding=0}
      else {boarding=g.input.down('interact')?Math.min(1,boarding+dt/2.4):Math.max(0,boarding-dt*1.6);g.hud.setPrompt('登船离港',boarding);if(boarding===1)model.request('boat')}
    } else {boarding=0;g.hud.setPrompt(null)}
  }
  reset()
  // CH5 borrows the original power/gate clock and pump presentation, without
  // calling the legacy six-second fuel interaction or boarding update.
  function requestPower() { return model.request('power') }
  function updatePower(dt) {
    if (g.game.state !== 'playing' || !g.player.alive || !Number.isFinite(dt) || dt <= 0) return
    model.tick(dt); sync(dt)
  }
  function presentChapter5Fuel(dt,presentation){chapter5Fuel=presentation?{...presentation}:null;syncFuel(dt)}
  return {state:s,reset,update,requestPower,updatePower,presentChapter5Fuel,objective,get boarding(){return boarding},get faultCue(){return faultCue},snapshot:()=>({...model.snapshot(),boarding,gateY:gate.position.y,gateBox:{min:gateBox.min.toArray(),max:gateBox.max.toArray()},holds:devices.map(d=>d.hold),lights:g.level.shedLights.map(l=>l.intensity),bulbMeshes:lighting.snapshot().fixtures.filter(f=>f.id.startsWith('shed:')).length,pumpLight:pumpLight.intensity,chapter5Fuel:chapter5Fuel?{...chapter5Fuel}:null,boatX:g.backdrop.boat.position.x,lighting:lighting.snapshot()})}
}
