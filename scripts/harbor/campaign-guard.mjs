import { CH1 } from './campaign-ch1-layout.mjs'

const installations = new WeakMap()
const encounter = CH1.ambush.map((actor, index) => ({ id: ['guard','flank','overwatch'][index],
  type: actor.kind, position: [...actor.position] }))
const graceDuration = 3.2
const stages = ['dormant','requested','scanning','warning','hostile','resolved']

// Root validates E/pistol/range. Dialogue owns every pre-release transition.
// Native factories retain movement, attacks, damage, shutdown and retirement.
export function installCampaignGuard(g, { emit }) {
  if (installations.has(g)) return installations.get(g)
  const T = g.THREE, defaults = new WeakMap()
  // Native Q_/iM clone lensBase for each pooled actor. Never mutate shared
  // glow/cone materials; restore the per-actor lens and its native color cache.
  for (const enemy of [...g.enemies.debug.hounds, ...g.enemies.debug.gulls]) {
    defaults.set(enemy, { color: enemy.lens.color.clone(), lensC: [...enemy.lensC] })
  }
  const light = new T.SpotLight(0xffffff, 0, 32, .17, .7, 1.2), target = new T.Object3D()
  light.name = 'campaign-guard-scan'; light.castShadow = false; light.target = target
  g.scene.add(light, target)
  let stage, stageElapsed, method, shots, slots, released, grace, scanState
  const playing = () => g.game.state === 'playing' && g.player.alive !== false
  const held = () => g.game.flow?.manualDialogue === true
  const current = slot => slot.enemy && slot.enemy.id === slot.nativeId && g.enemies.list.includes(slot.enemy)
  const owns = enemy => slots.some(slot => current(slot) && slot.enemy === enemy)
  function restoreLens(slot) {
    if (!current(slot)) return
    const original = defaults.get(slot.enemy)
    slot.enemy.lens.color.copy(original.color)
    slot.enemy.lensC.splice(0, 3, ...original.lensC)
  }
  function observe(slot) {
    if (!slot.enemy) return
    if (!current(slot)) { slot.data.defeated = true; return }
    const enemy = slot.enemy
    slot.data.position = enemy.pos.toArray(); slot.data.yaw = enemy.yaw
    slot.data.hp = Math.max(0, enemy.hp); slot.data.defeated = !enemy.alive || !enemy.active
  }
  function clearBolts() {
    for (const bolt of g.enemies.debug.bolts) {
      if (slots.some(slot => slot.enemy === bolt.owner && slot.nativeId === bolt.ownerId)) bolt.on = false
    }
  }
  function configure(enemy) {
    enemy.passive = stage !== 'hostile'
    if (stage !== 'hostile') return
    enemy.mode = 'investigate'; enemy.modeT = 10
    enemy.lastKnown.copy(g.player.pos); enemy.senseT = 0
  }
  function materialize() {
    for (const slot of slots) {
      if (slot.enemy || slot.data.defeated) continue
      const data = slot.data, pos = new T.Vector3(...data.position)
      const ground = g.physics.groundHeight(pos.x, pos.z, 50), radius = data.type === 'hound' ? .85 : .7
      const low = data.type === 'hound' ? ground + .05 : pos.y - .65
      const high = data.type === 'hound' ? ground + 1.4 : pos.y + .65
      if (data.hp === null && (!g.physics.nav.isWalkable(pos.x, pos.z) || ground < -.05 || ground > .2 ||
        data.type === 'hound' && !g.physics.nav.findPath(pos, g.player.pos)?.length ||
        g.physics.boxes.some(box => !box.bulletOnly && pos.x + radius > box.min.x && pos.x - radius < box.max.x &&
          pos.z + radius > box.min.z && pos.z - radius < box.max.z && high > box.min.y && low < box.max.y))) {
        throw Error(`Campaign guard ${data.id} requires a clear native navigation position at ${data.position}`)
      }
      const enemy = g.enemies.spawn(data.type, pos, { passive: stage !== 'hostile',
        state: stage === 'hostile' ? 'alert' : 'patrol', target: g.player.pos,
        yaw: data.yaw, patrolRadius: 0, ...(data.type === 'gull' ? { hover: pos.y } : {}) })
      if (!enemy) throw Error(`Campaign guard native pool exhausted: ${data.id}`)
      slot.enemy = enemy; slot.nativeId = enemy.id
      restoreLens(slot)
      if (data.hp !== null) { enemy.hp = data.hp; enemy.pos.copy(pos) }
      configure(enemy); observe(slot)
    }
  }
  function enter(next) {
    stage = next; stageElapsed = 0
    emit({ type: `guard-${stage}` })
  }
  function request() {
    if (!playing() || stage !== 'dormant') return false
    materialize(); enter('requested'); return true
  }
  function scan() {
    if (!playing() || stage !== 'requested') return false
    enter('scanning'); scanState.active = true; present(.016); return true
  }
  function warn() {
    if (!playing() || stage !== 'scanning') return false
    enter('warning'); scanState.active = false
    g.audio?.play?.('relay_cut', { pos: new T.Vector3(...CH1.ambush[0].position), gain: .22, jitter: 0 })
    present(.016); return true
  }
  function release() {
    if (!playing() || stage !== 'warning' || released) return false
    released = true; grace = 0; stageElapsed = 0
    g.hud.message('清除武器正在解锁——立即寻找掩体！西侧隔离开关可切断巡逻回路。', graceDuration)
    return true
  }
  function present(dt) {
    if (!playing() || !Number.isFinite(dt) || dt <= 0) return
    light.intensity = 0
    if (!['scanning','warning'].includes(stage)) return
    materialize()
    scanState.elapsed += Math.min(dt, .05)
    scanState.sweep = Math.sin(scanState.elapsed * 2.4) * .42
    const white = stage === 'scanning', color = white ? [6,6,6] : [9,.06,.015]
    for (const slot of slots) {
      if (!current(slot) || !slot.enemy.alive) continue
      const enemy = slot.enemy, bones = enemy.rig.bones
      enemy.lens.color.setRGB(...color); enemy.lensC.splice(0, 3, ...color)
      const origin = enemy.type === 'hound' ? enemy.headPos : enemy.sensor
      const dx = g.player.eye.x-origin.x, dz = g.player.eye.z-origin.z
      const turn = Math.atan2(Math.sin(Math.atan2(dx,dz)-enemy.yaw), Math.cos(Math.atan2(dx,dz)-enemy.yaw))
      if (enemy.type === 'hound' && white) {
        enemy.yaw += Math.max(-1.8*Math.min(dt,.05),Math.min(1.8*Math.min(dt,.05),turn))
        enemy.rig.group.rotation.y = enemy.yaw
      }
      const yaw = Math.atan2(Math.sin(Math.atan2(dx,dz)-enemy.yaw), Math.cos(Math.atan2(dx,dz)-enemy.yaw))
      const pitch = -Math.atan2(g.player.eye.y-origin.y, Math.hypot(dx,dz))
      if (enemy.type === 'hound') {
        enemy.hyaw = Math.max(-1.2,Math.min(1.2,yaw + (white ? scanState.sweep : 0)))
        enemy.hpitch = pitch; bones.head.rotation.set(pitch,enemy.hyaw,0)
      } else {
        enemy.gy = yaw + (white ? scanState.sweep : 0); enemy.gp = pitch
        bones.gimbalYaw.rotation.y = enemy.gy; bones.ball.rotation.x = pitch-enemy.pitch
      }
      enemy.rig.group.updateMatrixWorld(true)
    }
    const lead = slots.find(slot => current(slot) && slot.enemy.alive)
    if (!lead) return
    const enemy = lead.enemy
    light.position.copy(enemy.type === 'hound' ? enemy.headPos : enemy.sensor)
    // Sweep a real white beam across the player, without simulating attacks.
    target.position.copy(g.player.eye); target.position.x += white ? scanState.sweep * 5 : 0
    target.updateMatrixWorld(true); light.color.setHex(white ? 0xffffff : 0xff1608)
    light.intensity = white ? 28 : 9
    scanState.headYaw = enemy.hyaw ?? enemy.gy
  }
  function resolve(resolution) {
    stage = 'resolved'; stageElapsed = 0; method = resolution; light.intensity = 0; scanState.active = false
    g.hud.message(resolution === 'isolation' ? '巡逻回路已隔离。清除单位正在停机，前往应急配电区。' :
      '该片区清除单位已解除。前往应急配电区恢复供电。', 5)
    emit({ type: 'ambush-resolved', method })
  }
  function isolate() {
    if (!playing() || held() || stage !== 'hostile') return false
    materialize(); slots.forEach(observe)
    if (slots.every(slot => slot.data.defeated)) { resolve('combat'); return false }
    clearBolts()
    for (const slot of slots) {
      if (!current(slot) || !slot.enemy.alive) continue
      const enemy = slot.enemy
      enemy.passive = true; enemy.damage(enemy.hp, enemy.pos.clone(), null, 'body'); observe(slot)
    }
    resolve('isolation'); return true
  }
  function update(dt) {
    if (!playing() || held() || !Number.isFinite(dt) || dt <= 0) return
    materialize(); slots.forEach(observe)
    if (stage === 'hostile') {
      if (slots.every(slot => slot.data.defeated)) resolve('combat')
      return
    }
    present(dt)
    if (stage !== 'warning' || !released) return
    grace = Math.min(graceDuration, grace + Math.min(dt,.05)); stageElapsed = grace
    if (grace + 1e-8 < graceDuration) return
    for (const slot of slots) if (current(slot) && slot.enemy.alive) {
      restoreLens(slot); slot.enemy.passive = false
      slot.enemy.mode = 'investigate'; slot.enemy.modeT = 10
      slot.enemy.lastKnown.copy(g.player.pos); slot.enemy.senseT = 0
    }
    light.intensity = 0; enter('hostile')
  }
  function snapshot() {
    slots.forEach(observe)
    return { stage, stageElapsed, released, grace, graceDuration, scan: { ...scanState, light: light.intensity,
      color: light.color.getHex(), target: target.position.toArray() }, method, shots, maxActors: encounter.length,
      actors: slots.map(slot => ({ ...slot.data, position: [...slot.data.position], nativeId: slot.nativeId,
        active: !!(current(slot) && slot.enemy.active), passive: current(slot) ? slot.enemy.passive : stage !== 'hostile' })) }
  }
  function validateCapture(saved) {
    if (saved && (!stages.includes(saved.stage) || !Number.isFinite(saved.stageElapsed) || saved.stageElapsed < 0 ||
      typeof saved.released !== 'boolean' || !Number.isFinite(saved.grace) || saved.grace < 0 || saved.grace > graceDuration ||
      !saved.scan || !Number.isFinite(saved.scan.elapsed) || !Number.isFinite(saved.scan.sweep) || !Number.isFinite(saved.scan.headYaw) ||
      !Number.isInteger(saved.shots) || saved.shots < 0 || !Array.isArray(saved.actors) || saved.actors.length !== encounter.length ||
      saved.actors.some((actor, index) => actor.id !== encounter[index].id || actor.type !== encounter[index].type ||
        !Array.isArray(actor.position) || actor.position.length !== 3 || !actor.position.every(Number.isFinite) ||
        !Number.isFinite(actor.yaw) || !(actor.hp === null || Number.isFinite(actor.hp) && actor.hp >= 0) || typeof actor.defeated !== 'boolean') ||
      saved.stage === 'resolved' && (!['combat','isolation'].includes(saved.method) || saved.actors.some(actor => !actor.defeated)))) {
      throw Error('Invalid campaign guard checkpoint')
    }
    return saved ? JSON.parse(JSON.stringify(saved)) : null
  }
  function reset(saved) {
    validateCapture(saved)
    if (slots) {
      clearBolts()
      for (const slot of slots) if (current(slot)) { restoreLens(slot); g.enemies.debug.ctx.retire(slot.enemy) }
    }
    stage = saved?.stage || 'dormant'; stageElapsed = saved?.stageElapsed || 0
    released = saved?.released || false; grace = saved?.grace || 0
    method = saved?.method || null; shots = saved?.shots || 0
    scanState = saved ? { active: saved.scan.active, elapsed: saved.scan.elapsed, sweep: saved.scan.sweep, headYaw: saved.scan.headYaw } :
      { active: false, elapsed: 0, sweep: 0, headYaw: 0 }
    light.intensity = saved?.scan.light || 0
    if (saved?.scan.target) target.position.fromArray(saved.scan.target)
    light.color.setHex(saved?.scan.color ?? 0xffffff)
    slots = encounter.map((definition, index) => {
      const data = saved?.actors[index] || { ...definition, yaw: 0, hp: null, defeated: false }
      return { enemy: null, nativeId: null, data: { id: definition.id, type: definition.type,
        position: [...data.position], yaw: data.yaw, hp: data.hp, defeated: data.defeated } }
    })
    // Materialize on the native tick (root restores player/physics after reset).
    // Retry replaces actors and never replays story events.
  }
  reset()
  g.events.on('enemy:fire', ({ enemy }) => { if (stage === 'hostile' && owns(enemy)) shots++ })
  const api = { request, scan, warn, release, present, isolate, update, reset, validateCapture, snapshot }
  installations.set(g, api)
  return api
}
