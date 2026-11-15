// The original u_ mixer updates its listener from camera.matrixWorld in world
// space. Feed world-space panners into its exposed H.near bus; borrow everything.
export const INFECTED_AUDIO_FILES = Object.freeze([
  ['idle','idle/idle1','a90f970a030145faa83e8ca3f0df5597ee4a13652ede18560068084804e7221b'],
  ['idle','idle/idle2','46a4d6045fea2c5eb253dbd3fcf1590db1f1e5a866d3fb93c7429c7e95a34df2'],
  ['idle','idle/idle3','473b8e26697d6d413e3096b825c3b58c4955fa4f2f5b868d75d6a6eadc44bec1'],
  ['idle','idle/idle4','a6049357693f9ba2b131b76d9dd19e02fb7ed25d122d29dfb7fcadd0c09d9b84'],
  ['alert','Alert/Alert1','113a4596a5cedde74f110a580eb0877d9c6affd3f668ce8020d57908a64d729f'],
  ['alert','Alert/Alert2','ff65ef6003d6738754cbfcd110a917a0728b03f5fa221e365a135c8ade2fef41'],
  ['alert','Alert/Alert3','2aa3d5d609f97cca985227b3944d875f76d7731243c0309f11ce0ff707fd943b'],
  ['alert','Alert/Alert4','5852063cb893a5a4c41fb21ee2778371e1189cb9884e00d60976ff7aa1f4929b'],
  ['attack','Attack/Attack1','df90eddaa12f180db40fa9bd9e49f227953b7a67cbee2137d64d8ca85f75ce90'],
  ['attack','Attack/Attack2','a1dc0a125d39e7f431123c0f458cc9f5e2defa23d6fc7b3efdb7430f3f14c38d'],
  ['attack','Attack/Attack3','387c22abe79d815954500ca805ad720fa05a746c30ecbf89c1fca83a25201a96'],
  ['attack','Attack/Attack4','b7683ed717e5c9eef9f2d6378b2510085a4ba9488f0fe06d44f1240459700ec2'],
  ['chase','chase/chase1','83ba88536edd710276d4dd8fda9f7e22983711bfa284566da218de93006cacb9'],
  ['chase','chase/chase2','7a80e329b54a9fc79358fb5593b6b0a7226f76b2ef488542a5bbf0f25e8c9f0f'],
  ['chase','chase/chase3','797f1cdbe59e3d68e91f6fea1972a0aadb740ce04e5099b8d8dec73d089dec05'],
  ['chase','chase/chase4','89b8c567f216de9520fda108a936bdfcbe525c4813e50a4c69a5524ae2ca69f3'],
].map(([kind,path,sha256]) => Object.freeze({ kind, url:`/assets/harbor/audio/infected/${path}.ogg`, sha256 })))

// User-accepted mix: first +6dB revision, then +12dB, +12dB and -6dB.
const voiceBoost = 10 ** (18/20)
const levels = { idle:6*voiceBoost, alert:1.3*voiceBoost, attack:1.5*voiceBoost, chase:2*voiceBoost }
const spatial = { refDistance:3, rolloffFactor:.6, maxDistance:400 }
const positionCopy = position => {
  if (!position || !['x','y','z'].every(axis => Number.isFinite(position[axis]))) throw Error('Infected audio requires a finite world-space {x,y,z} position')
  return { x:position.x, y:position.y, z:position.z }
}

export async function loadInfectedAudio(g, options = {}) {
  const ctx=g?.audio?.ctx, bus=g?.audio?.meleeBus, events=g?.events
  const missing=[]
  for (const name of ['decodeAudioData','createBufferSource','createGain','createPanner','createBiquadFilter','addEventListener','removeEventListener']) {
    if (typeof ctx?.[name] !== 'function') missing.push(`g.audio.ctx.${name}`)
  }
  if (!bus || bus.context !== ctx) missing.push('g.audio.meleeBus (H.near in the same context)')
  if (typeof events?.on !== 'function' || typeof events?.off !== 'function') missing.push('g.events.on/off')
  if (!g?.game || typeof g.game.state !== 'string') missing.push('g.game.state')
  if (!g?.camera?.matrixWorld?.elements) missing.push('g.camera.matrixWorld')
  const fetchFile=options.fetch ?? globalThis.fetch
  if (typeof fetchFile !== 'function') missing.push('fetch')
  if (missing.length) throw Error(`Infected audio missing native interfaces: ${missing.join(', ')}`)
  if (ctx.state === 'closed') throw Error('Infected audio cannot use a closed g.audio.ctx')

  const buffers=new Map(), voices=new Set()
  const checkAbort=() => { if (options.signal?.aborted) throw Error('Infected audio load cancelled') }
  try {
    for (const file of INFECTED_AUDIO_FILES) {
      try {
        checkAbort()
        const response=await fetchFile(file.url, { signal:options.signal })
        if (!response.ok) throw Error(`HTTP ${response.status}`)
        const buffer=await ctx.decodeAudioData(await response.arrayBuffer())
        checkAbort()
        if (buffer.numberOfChannels !== 1 || !Number.isFinite(buffer.duration) || buffer.duration <= 0) throw Error('Expected a nonempty mono AudioBuffer')
        buffers.set(file.url, buffer)
      } catch (cause) {
        throw new Error(`Infected audio load failed: ${file.kind} ${file.url}: ${cause.message}`, { cause })
      }
    }
  } catch (error) { buffers.clear(); throw error }

  let disposed=false, state=g.game.state, playerDead=g.player?.alive === false
  const playable=() => !disposed && state === 'playing' && g.game.state === 'playing' && !playerDead && g.player?.alive !== false && ctx.state === 'running'
  const stopAll=() => { for (const voice of voices) voice.stop() }
  // Stop even on a transition back to playing; resumption is an explicit call.
  const onState=event => { state=event.state; playerDead=g.player?.alive === false; stopAll() }
  const onDeath=() => { playerDead=true; stopAll() }
  const onContext=() => { if (ctx.state !== 'running') stopAll() }
  events.on('game:state', onState)
  events.on('player:dead', onDeath)
  ctx.addEventListener('statechange', onContext)

  function createVoice() {
    if (disposed) throw Error('Infected audio bank is disposed')
    let active=null, position=null, occluded=false, dead=false, started=0
    const next={ idle:0, alert:0, attack:0, chase:0 }
    function release(record, stop) {
      if (!record || record.released) return
      record.released=true
      record.source.onended=null
      if (stop) try { record.source.stop() } catch {} // Already ended/not started.
      for (const node of record.nodes) node.disconnect()
      record.source.buffer=null
      if (active === record) active=null
    }
    function stop() { release(active, true) }
    function update(newPosition, { occluded:blocked=false } = {}) {
      if (dead || disposed) return false
      position=positionCopy(newPosition)
      const changed=occluded !== !!blocked
      occluded=!!blocked
      if (!playable()) { stop(); return false }
      if (active) {
        const pan=active.pan
        if (pan.positionX) {
          pan.positionX.value=position.x; pan.positionY.value=position.y; pan.positionZ.value=position.z
        } else pan.setPosition(position.x,position.y,position.z)
        if (changed) {
          active.gain.gain.setTargetAtTime(levels[active.kind]*(occluded?.35:1),ctx.currentTime,.06)
          active.filter.frequency.setTargetAtTime(occluded?1200:20000,ctx.currentTime,.06)
        }
      }
      return true
    }
    const voice={
      play(kind, newPosition, { loop=false, variant } = {}) {
        if (!Object.hasOwn(levels,kind)) throw Error(`Unknown infected audio kind: ${kind}`)
        if (variant !== undefined && (!Number.isInteger(variant) || variant < 1 || variant > 4)) throw Error('Infected audio variant must be 1..4')
        position=positionCopy(newPosition)
        if (dead || !playable()) { stop(); return false }
        stop()
        const index=variant === undefined ? next[kind] : variant-1
        next[kind]=(index+1)%4
        const file=INFECTED_AUDIO_FILES.filter(file => file.kind === kind)[index]
        const nodes=[]
        let source, record
        try {
          source=ctx.createBufferSource(); nodes.push(source)
          const gain=ctx.createGain(); nodes.push(gain)
          const filter=ctx.createBiquadFilter(); nodes.push(filter)
          const pan=ctx.createPanner(); nodes.push(pan)
          source.buffer=buffers.get(file.url); source.loop=!!loop
          gain.gain.value=levels[kind]*(occluded?.35:1)
          filter.type='lowpass'; filter.frequency.value=occluded?1200:20000; filter.Q.value=.5
          pan.panningModel='equalpower'; pan.distanceModel='inverse'
          Object.assign(pan,spatial); pan.coneInnerAngle=360; pan.coneOuterAngle=360
          source.connect(gain); gain.connect(filter); filter.connect(pan); pan.connect(bus)
          record={ source,gain,filter,pan,nodes,kind,variant:index+1,url:file.url,loop:!!loop,released:false }
          active=record
          source.onended=() => release(record,false)
          update(position,{occluded})
          source.start()
          started++
          return true
        } catch (cause) {
          if (record) release(record,true)
          else { // Allocation/connection failed before the record owned nodes.
            for (const node of nodes) node.disconnect()
            if (source) source.buffer=null
          }
          throw new Error(`Infected audio play failed: ${file.url}: ${cause.message}`, { cause })
        }
      },
      update, stop,
      snapshot() {
        const e=g.camera.matrixWorld.elements, listener={x:e[12],y:e[13],z:e[14]}
        const distance=position?Math.hypot(position.x-listener.x,position.y-listener.y,position.z-listener.z):null
        const distanceGain=distance === null?null:spatial.refDistance/(spatial.refDistance+spatial.rolloffFactor*(Math.min(spatial.maxDistance,Math.max(spatial.refDistance,distance))-spatial.refDistance))
        return { disposed:dead, active:!!active, kind:active?.kind ?? null, variant:active?.variant ?? null, url:active?.url ?? null,
          loop:active?.loop ?? false, started, position:position?{...position}:null, listener, distance, distanceGain,
          occluded, targetGain:active?levels[active.kind]*(occluded?.35:1):0, targetLowpassHz:occluded?1200:20000 }
      },
      dispose() { if (dead) return; stop(); dead=true; voices.delete(voice) },
    }
    voices.add(voice)
    return voice
  }
  return {
    createVoice,
    snapshot:() => ({ disposed, buffers:buffers.size, voices:voices.size, active:[...voices].filter(voice => voice.snapshot().active).length, state, contextState:ctx.state, playable:playable() }),
    dispose() {
      if (disposed) return
      disposed=true
      events.off('game:state',onState); events.off('player:dead',onDeath)
      ctx.removeEventListener('statechange',onContext)
      for (const voice of [...voices]) voice.dispose()
      buffers.clear()
    },
  }
}
