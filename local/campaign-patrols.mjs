import { CH1 } from './campaign-ch1-layout.mjs'

const installed = new WeakMap()
const quota = { hound: 3, gull: 3 }, historyLimit = 64
const copy = value => JSON.parse(JSON.stringify(value))
const byType = items => {
  const result = { hound: 0, gull: 0 }
  for (const item of items) if (item.type in result) result[item.type]++
  return result
}

// Called only by CH1's accepted power event and native simulation tick. Native
// Em owns all actor pools, sensing, combat, wrecks and eventual retirement.
export function installCampaignPatrols(g) {
  if (installed.has(g)) return installed.get(g)
  const T = g.THREE, claims = new Map()
  let active, finished, elapsed, cursor, serial, queue, slots, history, counts, nextSpawnAt
  const playing = () => g.game.state === 'playing' && g.player.alive !== false && !g.game.flow?.manualDialogue
  const current = slot => slot.enemy && slot.enemy.id === slot.nativeId && g.enemies.list.includes(slot.enemy)
  const living = slot => !slot.enemy || current(slot) && slot.enemy.alive && slot.enemy.active
  const external = () => [...g.enemies.list.filter(enemy => enemy.active && enemy.alive &&
    !slots.some(slot => current(slot) && slot.enemy === enemy)), ...(g.game.run?.queue || [])]
  function observe() {
    slots = slots.filter(slot => {
      if (!living(slot)) return false
      if (slot.enemy) {
        slot.position = slot.enemy.pos.toArray(); slot.yaw = slot.enemy.yaw; slot.hp = slot.enemy.hp
      }
      return true
    })
  }
  function reserve(initial = false) {
    if (!active || finished) return
    const reserved = byType([...slots, ...queue, ...external()])
    for (let index = 0; index < 3; index++) for (const type of ['hound','gull']) {
      if (reserved[type] >= quota[type]) continue
      const delay = initial ? .4 + queue.length * .65 : 3 + queue.length * .65
      queue.push({ id: ++serial, type, due: elapsed + delay }); reserved[type]++
    }
  }
  function activate() {
    if (!playing() || active || finished) return false
    active = true; reserve(true); return true
  }
  function safeSite(type) {
    const physics = g.physics, player = g.player, nav = physics.nav
    const forward = g.camera?.getWorldDirection ? g.camera.getWorldDirection(new T.Vector3()) : player.forward
    const fLength = Math.hypot(forward.x,forward.z), valid = []
    for (let step = 0; step < CH1.patrolSites.length; step++) {
      const site = (cursor + step) % CH1.patrolSites.length, [x,z] = CH1.patrolSites[site]
      const distance = Math.hypot(x-player.pos.x,z-player.pos.z), bounds = physics.bounds
      if (distance < 18 || !nav.isWalkable(x,z) || x < bounds.min.x+1 || x > bounds.max.x-1 ||
        z < bounds.min.z+1 || z > bounds.max.z-1) continue
      const ground = physics.groundHeight(x,z,50)
      if (ground < -.05 || ground > .2) continue
      const warehouse = CH1.warehouse.bounds
      if (x > warehouse.minX-1 && x < warehouse.maxX+1 && z > warehouse.minZ-1 && z < warehouse.maxZ+1 ||
        (g.level.interiorBoxes || []).some(box => x > box.min.x-1 && x < box.max.x+1 && z > box.min.z-1 && z < box.max.z+1)) continue
      const pos = new T.Vector3(x,type === 'hound' ? ground : 6,z)
      const radius = type === 'hound' ? .85 : .7, low = type === 'hound' ? ground+.05 : pos.y-.65
      const high = type === 'hound' ? ground+1.4 : pos.y+.65
      if (physics.boxes.some(box => !box.bulletOnly && x+radius > box.min.x && x-radius < box.max.x &&
        z+radius > box.min.z && z-radius < box.max.z && high > box.min.y && low < box.max.y)) continue
      if (g.enemies.list.some(enemy => enemy.active && Math.hypot(enemy.pos.x-x,enemy.pos.z-z) < 5)) continue
      if (history.some(entry => elapsed-entry.time < 12 && Math.hypot(entry.position[0]-x,entry.position[2]-z) < 9)) continue
      const center = (low+high)/2
      const samples = [[x,center,z],[x,high,z],[x,low,z],[x+radius,center,z],[x-radius,center,z],
        [x,center,z+radius],[x,center,z-radius]]
      const hidden = samples.every(point => !physics.lineOfSight(player.eye,new T.Vector3(...point)))
      const facing = fLength > .2 ? ((x-player.pos.x)*forward.x+(z-player.pos.z)*forward.z)/(distance*fLength) : 1
      const behind = facing < -.25
      const halfFov = Math.atan(Math.tan((g.camera?.fov || 75)*Math.PI/360)*(g.camera?.aspect || 1))
      // Expand the camera cone by the actor's projected radius and a margin.
      const outsideFront = fLength > .2 && facing < Math.cos(Math.min(Math.PI,halfFov+.12+Math.atan(radius/distance)))
      if (!hidden && !outsideFront || !nav.findPath(pos,player.pos)?.length) continue
      // Prefer underrepresented authored sectors, then rotate deterministically.
      const use = slots.filter(slot => slot.site === site).length + history.filter(entry => entry.site === site && elapsed-entry.time < 30).length
      valid.push({ pos, site, distance, hidden, behind, outsideFront, use, step })
    }
    valid.sort((a,b) => a.use-b.use || a.step-b.step)
    return valid[0] || null
  }
  function spawn(slot) {
    const pos = new T.Vector3(...slot.position)
    const enemy = g.enemies.spawn(slot.type,pos,{ state:'alert', target:g.player.pos, passive:false,
      yaw:slot.yaw, ...(slot.type === 'gull' ? { hover:pos.y } : {}) })
    if (!enemy) return false
    slot.enemy = enemy; slot.nativeId = enemy.id
    enemy.campaignPatrolId = slot.id
    claims.set(enemy,enemy.id)
    if (slot.hp !== null) { enemy.hp = slot.hp; enemy.pos.copy(pos) }
    slot.hp = enemy.hp
    return true
  }
  function clearOwned() {
    for (const bolt of g.enemies.debug.bolts) if (claims.has(bolt.owner) && claims.get(bolt.owner) === bolt.ownerId) bolt.on = false
    for (const [enemy,id] of claims) if (enemy.id === id && g.enemies.list.includes(enemy)) {
      delete enemy.campaignPatrolId; g.enemies.debug.ctx.retire(enemy)
    }
    claims.clear()
  }
  function update(dt) {
    if (!playing() || !Number.isFinite(dt) || dt <= 0) return
    elapsed += Math.min(dt,.05)
    observe()
    // Restore by replacement at saved positions/HP. These are survivors, not
    // new waves: no safety relocation, grants, cursor movement or history entry.
    for (const slot of slots) if (!slot.enemy && !spawn(slot)) { counts.deferred++; return }
    if (!active || finished) return
    // Diagnostics/native queues may reserve a type too. Cancel surplus pending
    // entries before spawning, without touching any live actor.
    const occupied = byType([...slots,...external()])
    queue = queue.filter(item => occupied[item.type]++ < quota[item.type])
    reserve()
    if (elapsed+1e-8 < nextSpawnAt) return
    const index = queue.findIndex(item => item.due <= elapsed+1e-8)
    if (index < 0) return
    const item = queue[index], candidate = safeSite(item.type)
    const slot = candidate && { id:item.id, type:item.type, site:candidate.site,
      position:candidate.pos.toArray(), yaw:Math.atan2(g.player.pos.x-candidate.pos.x,g.player.pos.z-candidate.pos.z),
      hp:null, enemy:null, nativeId:null }
    if (!slot || !spawn(slot)) { counts.deferred++; nextSpawnAt = elapsed+.75; return }
    queue.splice(index,1); slots.push(slot); cursor = (candidate.site+1)%CH1.patrolSites.length
    counts.spawned++
    history.push({ id:slot.id, nativeId:slot.nativeId, type:slot.type, site:slot.site, position:[...slot.position],
      time:elapsed, distance:candidate.distance, hidden:candidate.hidden, behind:candidate.behind, outsideFront:candidate.outsideFront })
    if (history.length > historyLimit) history.shift()
    nextSpawnAt = elapsed+.65
  }
  function finish() {
    if (finished) return false
    finished = true; queue.length = 0
    clearOwned(); slots.length = 0
    return true
  }
  function snapshot() {
    observe()
    return { active, finished, target:active && !finished ? 6 : 0, quota:{...quota}, elapsed, cursor, serial, nextSpawnAt,
      activeCount:slots.length, activeByType:byType(slots), queuedByType:byType(queue),
      reservedByType:byType([...slots,...queue,...external()]), counts:{...counts},
      actors:slots.map(slot => ({ id:slot.id, nativeId:slot.nativeId, type:slot.type, site:slot.site,
        position:[...slot.position], yaw:slot.yaw, hp:slot.hp })), queued:queue.map(item => ({...item})), history:copy(history) }
  }
  function validateCapture(saved) {
    const vector = point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite)
    if (saved && (typeof saved.active !== 'boolean' || typeof saved.finished !== 'boolean' ||
      !Number.isFinite(saved.elapsed) || saved.elapsed < 0 || !Number.isFinite(saved.nextSpawnAt) || saved.nextSpawnAt < 0 ||
      !Number.isInteger(saved.cursor) || saved.cursor < 0 || saved.cursor >= CH1.patrolSites.length ||
      !Number.isInteger(saved.serial) || saved.serial < 0 || !Array.isArray(saved.actors) || saved.actors.length > 6 ||
      !Array.isArray(saved.queued) || saved.queued.length > 6 || !Array.isArray(saved.history) || saved.history.length > historyLimit ||
      !saved.counts || !['spawned','deferred'].every(key => Number.isInteger(saved.counts[key]) && saved.counts[key] >= 0) ||
      saved.actors.some(actor => !vector(actor.position) || !Number.isFinite(actor.yaw) || !Number.isFinite(actor.hp) || actor.hp <= 0 ||
        !Number.isInteger(actor.site) || actor.site < 0 || actor.site >= CH1.patrolSites.length) ||
      saved.queued.some(item => !Number.isFinite(item.due) || item.due < 0) ||
      [...saved.actors,...saved.queued].some(item => !(item.type in quota) || !Number.isInteger(item.id) || item.id <= 0 || item.id > saved.serial) ||
      new Set([...saved.actors,...saved.queued].map(item => item.id)).size !== saved.actors.length+saved.queued.length ||
      ['hound','gull'].some(type => [...saved.actors,...saved.queued].filter(item => item.type === type).length > quota[type]) ||
      saved.finished && saved.queued.length || !saved.active && (saved.actors.length || saved.queued.length) ||
      saved.history.some(item => !vector(item.position) || !Number.isFinite(item.time) || !Number.isFinite(item.distance) ||
        !Number.isInteger(item.site) || item.site < 0 || item.site >= CH1.patrolSites.length ||
        typeof item.hidden !== 'boolean' || typeof item.behind !== 'boolean' || typeof item.outsideFront !== 'boolean'))) throw Error('Invalid campaign patrol checkpoint')
    return saved ? JSON.parse(JSON.stringify(saved)) : null
  }
  function reset(saved) {
    validateCapture(saved)
    clearOwned()
    active = saved?.active || false; finished = saved?.finished || false
    elapsed = saved?.elapsed || 0; cursor = saved?.cursor || 0; serial = saved?.serial || 0; nextSpawnAt = saved?.nextSpawnAt || 0
    slots = (finished ? [] : saved?.actors || []).map(actor => ({ ...actor, position:[...actor.position], enemy:null, nativeId:null }))
    queue = (saved?.queued || []).map(item => ({...item})); history = copy(saved?.history || [])
    counts = { spawned:saved?.counts.spawned || 0, deferred:saved?.counts.deferred || 0 }
  }
  reset()
  const api = { activate, update, reset, validateCapture, snapshot, finish }
  installed.set(g,api)
  return api
}
