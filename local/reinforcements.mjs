const installations = new WeakMap()

// Runs only from the existing level tick. Native factories own AI, death,
// wreck retirement and the fixed actor pools; this director never edits them.
export function installReinforcements(g, { equipment, systems }) {
  if (installations.has(g)) return installations.get(g)
  const T = g.THREE, maxActive = 8, maxQueued = 6, historyLimit = 64
  const normalQuota = { hound: 2, gull: 3 }, normalTarget = 5
  const startedStates = { power: ['UNSTABLE', 'ON'], gate: ['OPERATING', 'OPEN'], fuel: ['PUMPING', 'READY'] }
  let disposed = false, elapsed, nextWaveAt, nextSpawnAt, armed, queue, history, facilities, burst, counts, random, lastRunTime
  function reset() {
    const retry = Number(g.game.run?.retries) || 0
    let seed = ((Number(g.params?.seed || 4207) >>> 0) ^ Math.imul(retry + 1, 0x9e3779b9)) >>> 0
    random = () => {
      seed = (seed + 0x6d2b79f5) | 0
      let value = Math.imul(seed ^ seed >>> 15, 1 | seed)
      value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value
      return ((value ^ value >>> 14) >>> 0) / 4294967296
    }
    elapsed = 0; nextWaveAt = null; nextSpawnAt = 0; armed = false
    queue = []; history = []; facilities = { power: null, gate: null, fuel: null }
    burst = { triggered: false, triggeredAt: null, facilities: [], counts: { hound: 0, gull: 0 } }
    counts = { spawned: 0, population: 0, ambient: 0, burst: 0, deferred: 0 }
    lastRunTime = g.game.run?.time ?? 0
  }
  const aliveCount = () => g.enemies.list.reduce((sum, enemy) => sum + (enemy.alive ? 1 : 0), 0)
  function byType(items) {
    const result = { hound: 0, gull: 0 }
    for (const item of items) if (item.type === 'hound' || item.type === 'gull') result[item.type]++
    return result
  }
  function budget(items) {
    const native = g.game.run?.queue || [], active = g.enemies.list.filter(enemy => enemy.alive)
    const reserved = byType([...active, ...native, ...items])
    return { slots: Math.max(0, normalTarget - active.length - native.length - items.length),
      hound: Math.max(0, normalQuota.hound - reserved.hound), gull: Math.max(0, normalQuota.gull - reserved.gull) }
  }
  function reconcileQueue() {
    // Native spawns and burst reservations can consume a previously missing
    // type. Drop stale ordinary work, never a live actor or a burst reservation.
    const remaining = budget(queue.filter(item => item.reason === 'burst'))
    queue = queue.filter(item => {
      if (item.reason === 'burst') return true
      if (!remaining.slots || !remaining[item.type]) return false
      remaining.slots--; remaining[item.type]--
      return true
    })
  }
  function enqueue(reason, amount) {
    const remaining = budget(queue)
    for (let i = 0; i < amount && remaining.slots > 0 && queue.length < maxQueued; i++) {
      const missing = ['hound', 'gull'].filter(kind => remaining[kind] > 0)
      if (!missing.length) break
      const type = missing[Math.floor(random() * missing.length)]
      queue.push({ reason, type }); remaining.slots--; remaining[type]--
    }
  }
  function observeFacilities(state) {
    for (const kind of Object.keys(startedStates)) {
      if (facilities[kind] !== null || !startedStates[kind].includes(state[kind])) continue
      facilities[kind] = elapsed
      if (burst.triggered) continue
      const partner = Object.keys(facilities).find(other => other !== kind && facilities[other] !== null && elapsed - facilities[other] <= 60 + 1e-8)
      if (!partner) continue
      burst.triggered = true; burst.triggeredAt = elapsed; burst.facilities = [partner, kind]
      queue.unshift(...['hound', 'gull', 'gull'].map(type => ({ reason: 'burst', type })))
      queue.length = Math.min(queue.length, maxQueued)
      nextSpawnAt = Math.max(nextSpawnAt, elapsed + 2)
    }
  }
  function safePosition(kind) {
    const physics = g.physics, nav = physics.nav, player = g.player
    const forward = g.camera?.getWorldDirection ? g.camera.getWorldDirection(new T.Vector3()) : player.forward
    const eye = player.eye, fLength = Math.hypot(forward.x, forward.z)
    const bounds = physics.bounds, candidates = []
    // Authored points first, then a small independent sample of the real nav.
    // Never call nav.randomPoint: the original uses global Math.random there.
    const authored = g.level.enemySpawns.filter(point => point.type === (kind === 'hound' ? 'ground' : 'air'))
    const start = Math.floor(random() * Math.max(1, authored.length))
    for (let i = 0; i < authored.length; i++) candidates.push(authored[(start + i) % authored.length].pos)
    for (let i = 0; i < 24; i++) candidates.push(new T.Vector3(
      bounds.min.x + 2 + random() * (bounds.max.x - bounds.min.x - 4),
      kind === 'hound' ? 0 : 6 + random() * 4,
      bounds.min.z + 2 + random() * (bounds.max.z - bounds.min.z - 4)))
    const valid = []
    for (const point of candidates) {
      const pos = point.clone(), dx = pos.x - player.pos.x, dz = pos.z - player.pos.z, distance = Math.hypot(dx, dz)
      if (distance < 18 || !nav.isWalkable(pos.x, pos.z)) continue
      if (pos.x < bounds.min.x + 1 || pos.x > bounds.max.x - 1 || pos.z < bounds.min.z + 1 || pos.z > bounds.max.z - 1) continue
      const ground = physics.groundHeight(pos.x, pos.z, 50)
      if (ground < -.05 || ground > .2) continue // Water, stacked cargo and roofs.
      if (g.level.interiorBoxes.some(box => pos.x > box.min.x - 1 && pos.x < box.max.x + 1 && pos.z > box.min.z - 1 && pos.z < box.max.z + 1)) continue
      pos.y = kind === 'hound' ? ground : Math.max(5, pos.y)
      const radius = kind === 'hound' ? .85 : .7, low = kind === 'hound' ? pos.y + .05 : pos.y - .65, high = kind === 'hound' ? pos.y + 1.4 : pos.y + .65
      if (physics.boxes.some(box => !box.bulletOnly && pos.x + radius > box.min.x && pos.x - radius < box.max.x && pos.z + radius > box.min.z && pos.z - radius < box.max.z && high > box.min.y && low < box.max.y)) continue
      if (g.enemies.list.some(enemy => enemy.active && Math.hypot(enemy.pos.x - pos.x, enemy.pos.z - pos.z) < 2.5)) continue
      const center = pos.clone(); center.y = (low + high) / 2
      const samples = [center, new T.Vector3(pos.x, high, pos.z), new T.Vector3(pos.x, low, pos.z), new T.Vector3(pos.x + radius, center.y, pos.z), new T.Vector3(pos.x - radius, center.y, pos.z), new T.Vector3(pos.x, center.y, pos.z + radius), new T.Vector3(pos.x, center.y, pos.z - radius)]
      const hidden = samples.every(sample => !physics.lineOfSight(eye, sample))
      const behind = fLength > .2 && (dx * forward.x + dz * forward.z) / (distance * fLength) < -.25
      if (!hidden && !behind) continue
      valid.push({ pos, score: (hidden ? 2 : 0) + random() })
    }
    valid.sort((a, b) => b.score - a.score)
    for (const candidate of valid) {
      // A hound must be able to leave its spawn and reach the player's area.
      if (kind === 'hound' && !nav.findPath(candidate.pos, player.pos)?.length) continue
      return candidate.pos
    }
    return null
  }
  function update(dt) {
    if (disposed) return
    const state = g.game.state
    if (state === 'title' || state === 'dead' || !g.player.alive) {
      if (elapsed || armed || queue.length || history.length) reset()
      return
    }
    if (state !== 'playing' || !Number.isFinite(dt) || dt <= 0) return
    const runTime = g.game.run?.time
    if (Number.isFinite(runTime) && runTime < lastRunTime) reset()
    lastRunTime = runTime ?? lastRunTime
    const facilityState = systems.state
    // Infrastructure exposes this cheap getter; snapshot supports older wiring.
    const boarding = systems.boarding ?? systems.snapshot?.().boarding ?? 0
    if (boarding > 0 || facilityState.boat === 'DEPARTING' || facilityState.boat === 'EXTRACTED') return
    elapsed += dt
    // Only successful starts change these states. Record their first observed
    // simulation time even without equipment; the burst can wait in the queue.
    observeFacilities(facilityState)
    reconcileQueue()
    if (!armed && (g.weapon?.hasWeapon ?? g.weapon?.hasFirearm ?? equipment.snapshot().hasWeapon)) {
      armed = true
      enqueue('population', normalTarget)
      nextSpawnAt = elapsed + 2
      nextWaveAt = elapsed + 25 + random() * 20
    }
    if (!armed) return
    if (elapsed >= nextWaveAt) {
      enqueue('ambient', 1 + (random() < .5 ? 0 : 1))
      nextWaveAt = elapsed + 25 + random() * 20
    }
    if (!queue.length || elapsed < nextSpawnAt) return
    // Count native queued actors too: ordinary relay waves (if ever triggered by
    // diagnostics) run earlier in game.update and must retain their own budget.
    const nativeQueued = g.game.run?.queue?.length || 0
    if (aliveCount() + nativeQueued >= maxActive) { nextSpawnAt = elapsed + 1; return }
    const item = queue[0], pos = safePosition(item.type)
    const enemy = pos && g.enemies.spawn(item.type, pos, { state: item.reason === 'population' ? 'patrol' : 'alert', target: g.player.pos, yaw: random() * Math.PI * 2 })
    if (!enemy) { counts.deferred++; nextSpawnAt = elapsed + 2; return }
    queue.shift(); counts.spawned++; counts[item.reason]++
    if (item.reason === 'burst') burst.counts[item.type]++
    history.push({ reason: item.reason, type: item.type, pos: enemy.pos.toArray(), runElapsed: elapsed, active: aliveCount(), queued: queue.length, counts: { ...counts } })
    if (history.length > historyLimit) history.shift()
    nextSpawnAt = elapsed + 2 + random() * 2
  }
  reset()
  const unsubscribe = g.events.on('game:state', ({ state, prev }) => {
    if (disposed) return
    if (state === 'title' || state === 'dead' || state === 'intro' && prev !== 'paused') reset()
  })
  const director = {
    update, reset,
    snapshot: () => ({ disposed, armed, target: armed ? normalTarget : 0, normalQuota: { ...normalQuota }, runElapsed: elapsed, nextWaveAt, nextSpawnAt,
      active: aliveCount(), activeByType: byType(g.enemies.list.filter(enemy => enemy.alive)), maxActive, maxQueued,
      queued: queue.map(item => ({ ...item })), queuedByType: byType(queue), nativeQueuedByType: byType(g.game.run?.queue || []),
      facilities: { ...facilities }, burst: { ...burst, facilities: [...burst.facilities], counts: { ...burst.counts } },
      counts: { ...counts }, history: history.map(item => ({ ...item, pos: [...item.pos], counts: { ...item.counts } })) }),
    dispose() {
      if (disposed) return
      disposed = true
      if (typeof unsubscribe === 'function') unsubscribe()
      queue.length = 0
      installations.delete(g)
    },
  }
  installations.set(g, director)
  return director
}
