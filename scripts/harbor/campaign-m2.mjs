import { installCampaignM1 } from './campaign-m1.mjs'
import { createChapterDirector } from './chapter-director.mjs'
import { applyCampaignEvent } from './campaign-state.mjs'
import { createInfrastructure } from './infrastructure-state.mjs'
import { installCampaignGuard } from './campaign-guard.mjs'
import { installCampaignSupplies } from './campaign-supplies.mjs'
import { installBerth5 } from './campaign-berth5.mjs'
import { CH1 } from './campaign-ch1-layout.mjs'
import { installCampaignDialogue } from './campaign-dialogue.mjs'
import { installCampaignPatrols } from './campaign-patrols.mjs'
import { containsM1Sector, M1_WORLD } from './campaign-layout.mjs'
import { createChapter2InfectedDirector } from './campaign-ch2-director.mjs'
import { installChapter2Hints } from './campaign-ch2-hints.mjs'
import { captureCampaignPlayer, validateCampaignPlayer, restoreCampaignPlayer } from './campaign-player-state.mjs'
import { installChapter2SafeRooms } from './campaign-ch2-safe-rooms.mjs'
import { installChapter3Runtime } from './campaign-ch3-runtime.mjs'
import { CH3_RESCUE_DOOR } from './campaign-ch3-rescue.mjs'
import { INFECTED_CLIPS } from './character-clips.mjs'
import { installChapter4Runtime } from './campaign-ch4-runtime.mjs'
import { installChapter5Runtime, crossedChapter5Entry } from './campaign-ch5-runtime.mjs'

// One continuous campaign adapter in the original loop. M1 owns the five-zone world;
// original player/physics/AI/rendering remain authoritative.
export function installCampaignM2(g, equipment, { settings, infected, narrative, chapter3Resources = null, chapter3Trial = false, chapter4Available = false, chapter4Trial = false, chapter5Available = false, chapter5Trial = false, chapter5Combat = false, chapter5Fuel = false, chapter5Ending = false, repairResources = null, systems = null }) {
  const T = g.THREE, director = createChapterDirector(), power = createInfrastructure()
  g.hud.root.querySelector('.h-relays').style.display='none'
  const map = installCampaignM1(g, equipment, { chapter1: true, chapter2: true, chapter3: !!chapter3Resources, chapter4: chapter4Available, startAtChapter3: false, startAtChapter4: false, objective: () => {
    return director.current().flags.chapter5Entered && chapter5 ? chapter5.objective() : director.current().flags.chapter4Entered && chapter4 ? chapter4.objective() : director.current().objective
  } })
  const environment = installBerth5(g, { world: map.world, settings })
  const root = new T.Group(); root.name = 'campaign-ch1-interactions'; g.scene.add(root)
  let checkpointPending = false, retryRequested = false, previous = null, restoringFlags = null
  let chapterEntry = null, retrySave = null
  let gateProgress = 0, gateOpening = false, gateOpen = false, entryCrossed = false, lastCheckpoint = null
  const history = [], holds = { isolation: 0, power: 0, gate: 0 }
  const anchors = Object.fromEntries(['request','isolation','power','gate'].map(id => [id,new T.Vector3(...CH1[id])]))
  const steel = g.mats.get('steel_galv'), dark = g.mats.get('steel_dark')
  function mesh(size, material, position, parent = root) {
    const object = new T.Mesh(new T.BoxGeometry(...size), material)
    object.position.set(...position); object.castShadow = object.receiveShadow = true
    parent.add(object); return object
  }
  function sign(text, position, width = 1.2, yaw = 0, parent = root) {
    const label = g.mats.label(text, { color: 'white', font: 'sans', distress: .25 })
    const object = new T.Mesh(new T.PlaneGeometry(width,.19), label.material)
    object.position.set(...position); object.rotation.y = yaw; parent.add(object)
  }
  for (const [id, label] of Object.entries({ request: '安保护送 · E 请求帮助', isolation: '巡逻回路 · 长按 E 隔离', power: '五号应急电源 · 长按 E 合闸', gate: '黑箱维护门 · 长按 E 开启' })) {
    const p = anchors[id], panel = new T.Group()
    panel.position.copy(p); panel.rotation.y = id === 'gate' ? Math.PI/2 : Math.PI; root.add(panel)
    mesh([.08,1.3,.08], dark, [0,.65-p.y,-.16],panel)
    mesh([1.45,.52,.12], dark, [0,0,-.1],panel)
    sign(label,[0,.05,-.025],1.34,0,panel)
    mesh([.12,.12,.04],g.mats.get('paint_red'),[.5,-.13,-.02],panel)
    if (id === 'request') sign('自动化安保单位将在封锁区提供护送',[0,.45,-.025],2.3,0,panel)
  }
  const gate = new T.Group(); gate.position.set(-60,0,-285); root.add(gate)
  mesh([.08,4.2,11.94], g.mats.get('chainlink'), [0,2.1,0], gate)
  for (const z of [-6,-3,0,3,6]) mesh([.13,4.2,.13],steel,[0,2.1,z],gate)
  for (const y of [.08,2.1,4.18]) mesh([.15,.12,12],steel,[0,y,0],gate)
  for (const z of [-291.15,-278.85]) mesh([.22,8.8,.22],dark,[-60,4.4,z])
  sign('黑箱堆场 / 维护通道',[.09,2.5,0],2.6,Math.PI/2,gate)
  const gateBox = g.physics.addBox(new T.Vector3(-60.15,0,-291), new T.Vector3(-59.85,4.2,-279), { surface:'metal', tag:'campaign-ch1-maintenance-gate' })
  g.physics.build()

  function emit(event) {
    if (!director.event(event)) return false
    narrative.setReplayProgress?.(director.current().flags)
    history.push({ ...event, time: g.game.run.time, position: g.player.pos.toArray() })
    if (history.length > 64) history.shift()
    g.events.emit('campaign:objective', { ...event })
    if (['pistol-acquired','ambush-resolved','power-stable','supplies-acquired','equipment-acquired'].includes(event.type)) checkpointPending = true
    if (['chapter2-crossed','chapter2-intro-read','exit-ammo-hint-handled','echo-lane-entered','safe-room-hint-shown',
      'safe-a-entered','safe-b-entered','safe-c-entered','berth6-entered'].includes(event.type)) checkpointPending = true
    if (event.type === 'safe-room-hint-shown') {infectedDirector.setEnabled(true);activateAvailableSections()}
    if (event.type === 'berth6-entered') infectedDirector.finish()
    if (['chapter3-crossed','chapter3-intro-read','sniper-threat-resolved','worker-rescued',
      'worker-testimony-completed','chapter3-exited'].includes(event.type)) checkpointPending = true
    if (['chapter4-crossed','chapter4-intro-read','ch4-infected-cleared','p07-read','gate-override-started',
      'gate-override-accepted','gate-physically-open','chapter4-exited'].includes(event.type)) checkpointPending=true
    if (['chapter5-crossed','chapter5-intro-read','power7-stable','warehouse-initialization-started',
      'warehouse-unlocked','warehouse-physically-open','chapter5-boarded','chapter5-ending-finished'].includes(event.type)) checkpointPending=true
    if (event.type === 'blackbox-entered') {
      patrols.finish()
      checkpointPending = true
    }
    return true
  }
  const guard = installCampaignGuard(g, { emit })
  const dialogue = installCampaignDialogue(g, { guard })
  const patrols = installCampaignPatrols(g)
  const supplies = installCampaignSupplies(g, { equipment, emit })
  const safeRooms = installChapter2SafeRooms(g, { equipment,
    canInteract:()=>director.current().flags.chapter2IntroRead && !dialogue.snapshot().active && !narrative.snapshot().active,
    onCheckpoint:({kind,id})=>{
      if (kind==='enter') emit({type:`safe-${id.at(-1)}-entered`})
      if (kind==='exit') activateAvailableSections()
      checkpointPending=true
    } })
  const infectedDirector = createChapter2InfectedDirector(g, { ...infected, sectionId:null, enabled:false, safeRooms, staged:true })
  const chapter3 = chapter3Resources ? installChapter3Runtime(g,equipment,{resources:chapter3Resources,narrative,
    flags:()=>restoringFlags||director.current().flags,emit,onCheckpoint:()=>{checkpointPending=true} }) : null
  const chapter4 = chapter4Available ? installChapter4Runtime(g,equipment,{infected,personnel:chapter3Resources.personnel,
    gate:map.world.chapter4Gate,narrative,flags:()=>restoringFlags||director.current().flags,emit,
    onCheckpoint:()=>{checkpointPending=true} }) : null
  const chapter5 = chapter5Available ? installChapter5Runtime(g,equipment,{systems,narrative,infected,personnel:chapter3Resources.personnel,combatEnabled:chapter5Combat,fuelEnabled:chapter5Fuel,repairResources,endingEnabled:chapter5Ending,
    flags:()=>restoringFlags||director.current().flags,emit,onCheckpoint:()=>{checkpointPending=true} }) : null
  function activateAvailableSections() {
    for(const room of safeRooms.capture().rooms)if(room.forwardExited&&room.id!=='ch2.safe.c')
      infectedDirector.activateSection(room.id==='ch2.safe.a'?'ch2.s2':'ch2.s3')
  }
  const hints = installChapter2Hints(g, { flags:()=>director.current().flags,emit,
    exitConsumed:()=>supplies.snapshot().exitConsumed,
    blocked:()=>dialogue.snapshot().active || narrative.snapshot().active,
    safeReady:()=>true })
  g.events.on('equipment:acquired', ({ id }) => emit(id === 'pistol' ? { type:'pistol-acquired' } : { type:'equipment-acquired', id }))
  function syncGate() {
    gate.position.y = gateProgress * 4.6
    gateBox.min.y = gate.position.y; gateBox.max.y = gate.position.y + 4.2
  }
  function checkpoint() {
    if (!g.player.alive) return false
    director.checkpoint({ map:map.capture(), player:captureCampaignPlayer(g.player), runTime:g.game.run.time,
      equipment:equipment.capture(), supplies:supplies.snapshot(), guard:guard.snapshot(), patrols:patrols.snapshot(), power:power.snapshot(),
      infected:infectedDirector.capture(), safeRooms:safeRooms.capture(),
      ...(chapter3 ? {chapter3:chapter3.capture()} : {}),
      ...(chapter4 ? {chapter4:chapter4.capture()} : {}),
      ...(chapter5 ? {chapter5:chapter5.capture()} : {}),
      gate:{ progress:gateProgress, opening:gateOpening, open:gateOpen, crossed:entryCrossed } })
    // Later interactions save progress but never move the death-retry anchor.
    // Chapter identity comes from the director, even before map.update at a seam.
    if (!chapterEntry || chapterEntry.state.currentChapter !== director.current().currentChapter) {
      chapterEntry = director.snapshot().checkpoint
      const player=chapterEntry.runtime.player
      player.velocity=[0,0,0];player.lastSafe=[...player.position]
      player.speed=0;player.sprinting=false;player.ads=0;player.motion.jumpBuffer=0
    }
    lastCheckpoint = director.current().objective
    checkpointPending = false
  }
  function chapterRetry() {
    if (!chapterEntry) return null
    const saved=JSON.parse(JSON.stringify(chapterEntry)),flags=director.current().flags
    // Presentation already seen this run is independent of resettable missions.
    for (const id of ['chapter2','chapter3','chapter4','chapter5']) if (flags[`${id}IntroRead`])
      saved.state=applyCampaignEvent(saved.state,{type:`${id}-intro-read`,skipped:flags[`${id}IntroSkipped`]})
    if (flags.p07Read) saved.state=applyCampaignEvent(saved.state,{type:'p07-read'})
    if (chapter3) saved.runtime.chapter3.sniper.warningSeen ||= chapter3.sniper.capture().warningSeen
    return saved
  }
  function validateCheckpoint(checkpoint) {
    if (!checkpoint) return null
    const saved=checkpoint.runtime, flags=checkpoint.state.flags
    const invalid=()=>{throw Error('Invalid campaign world checkpoint')}
    if (!saved || !saved.guard || !saved.patrols || !Number.isFinite(saved.runTime) || saved.runTime<0) invalid()
    validateCampaignPlayer(saved.player,g.player.maxHealth)
    equipment.validateCapture(saved.equipment);guard.validateCapture(saved.guard);patrols.validateCapture(saved.patrols)
    infectedDirector.validateCapture(saved.infected)
    if (chapter3) chapter3.validateCapture(saved.chapter3,flags)
    if (chapter4) chapter4.validateEntry(saved.chapter4,flags)
    if (chapter5) chapter5.validateEntry(saved.chapter5,flags)
    const roomState=safeRooms.validateCapture(saved.safeRooms)
    if (roomState.rooms.some(room=>room.entered!==flags[`safe${room.id.at(-1).toUpperCase()}Visited`])) invalid()
    const sectorIds=M1_WORLD.sectors.map(sector=>sector.id)
    if (saved.map?.entry!=='campaign-m1' || !sectorIds.includes(saved.map.sectorId) || !Array.isArray(saved.map.visitedSectorIds) ||
      !saved.map.visitedSectorIds.every(id=>sectorIds.includes(id)) || saved.map.chapter?.status!=='not-implemented' || saved.map.storyCompleted!==false) invalid()
    const powerState=saved.power, gateState=saved.gate, supply=saved.supplies
    if (!powerState || !['OFF','UNSTABLE','ON'].includes(powerState.power) || powerState.gate!=='LOCKED' ||
      powerState.fuel!=='UNAVAILABLE' || powerState.boat!=='BLOCKED' ||
      !['powerTime','gateProgress','fuelProgress','departureProgress'].every(key=>Number.isFinite(powerState[key])&&powerState[key]>=0)) invalid()
    if (!gateState || !Number.isFinite(gateState.progress) || gateState.progress<0 || gateState.progress>1 ||
      !['opening','open','crossed'].every(key=>typeof gateState[key]==='boolean') ||
      gateState.open!==(gateState.progress===1) || gateState.open && gateState.opening) invalid()
    if (!supply || !['consumed','exitConsumed','flashlightOwned','on'].every(key=>typeof supply[key]==='boolean') ||
      supply.flashlightOwned!==supply.consumed || supply.on && !supply.flashlightOwned) invalid()
    const activeSections=flags.safeRoomHintShown?['ch2.s1',...(roomState.rooms.find(room=>room.id==='ch2.safe.a').forwardExited?['ch2.s2']:[]),
      ...(roomState.rooms.find(room=>room.id==='ch2.safe.b').forwardExited?['ch2.s3']:[])]:[]
    if (JSON.stringify(saved.infected.activeSections)!==JSON.stringify(activeSections) || saved.infected.finished!==flags.berth6Reached) invalid()
    if (saved.infected.enabled!==(gateState.crossed&&flags.safeRoomHintShown&&!flags.berth6Reached) || gateState.crossed!==flags.chapter2Entered ||
      flags.chapter2IntroRead && !gateState.crossed || flags.suppliesAcquired!==supply.consumed ||
      flags.power5Stable!==(powerState.power==='ON') || flags.corridorAccessOpen!==gateState.open ||
      gateState.crossed && (!saved.patrols.finished || saved.guard.stage!=='resolved') ||
      ['pistol','rifle','knife'].some(id=>flags[`${id}Owned`]!==saved.equipment.slots[id].owned)) invalid()
    // Validate the saved capsule against the saved door heights, not the doors
    // in the failed attempt. All other native collision boxes are unchanged.
    const doors=new Map(safeRooms.snapshot().rooms.flatMap(room=>room.doors.map(door=>[door.id,door])))
    const geometry=safeRooms.snapshot().doorGeometry, proposed=new Map()
    for (const room of roomState.rooms) for (const door of room.doors) {
      const live=doors.get(door.id),min=[...live.min]
      min[1]=geometry.floor+(geometry.openBottom-geometry.floor)*door.progress
      proposed.set(door.id,{min:new T.Vector3(...min),max:new T.Vector3(...live.max)})
    }
    proposed.set('campaign-ch1-maintenance-gate',{min:new T.Vector3(-60.15,gateState.progress*4.6,-291),
      max:new T.Vector3(-59.85,gateState.progress*4.6+4.2,-279)})
    if (chapter3) {
      const d=CH3_RESCUE_DOOR,bottom=saved.chapter3.rescue.door==='open'?d.openBottom:d.floor
      proposed.set('ch3-repair-door',{min:new T.Vector3(d.x-d.depth/2,bottom,d.z-d.width/2),
        max:new T.Vector3(d.x+d.depth/2,d.top,d.z+d.width/2)})
    }
    const [x,y,z]=saved.player.position,height=saved.player.crouching?1.15:1.8
    const bounds=g.physics.bounds
    if (x<bounds.min.x+.395 || x>bounds.max.x-.395 || z<bounds.min.z+.395 || z>bounds.max.z-.395) invalid()
    for (const box of g.physics.boxes) {
      if (box.bulletOnly) continue
      const {min,max}=proposed.get(box.tag)||box
      if (y+height<=min.y+.005 || y>=max.y-.005) continue
      const dx=x-Math.max(min.x,Math.min(max.x,x)),dz=z-Math.max(min.z,Math.min(max.z,z))
      if (dx*dx+dz*dz<.315**2) invalid()
    }
    return saved
  }
  function restoreWorld(saved, savedState) {
    restoringFlags=savedState?.flags||null
    // Put the restored body at its safe entry before any chapter gate closes.
    if(saved&&savedState?.flags.chapter5Entered)restoreCampaignPlayer(g,saved.player)
    infectedDirector.setEnabled(false)
    chapter4?.reset(savedState?.flags.chapter4Completed ? saved.chapter4 : undefined)
    chapter5?.reset()
    dialogue.reset(); map.reset(saved?.map); power.reset(); environment.reset()
    g.enemies.clear(); g.game.run.queue.length = 0
    guard.reset(saved?.guard); patrols.reset(saved?.patrols); supplies.reset(saved?.supplies)
    // Restore entry radio/mission state, without merging the failed attempt.
    // The selected snapshot separately retains the one-time warning shot.
    chapter3?.reset(saved?.chapter3)
    Object.assign(holds,{ isolation:0,power:0,gate:0 })
    gateProgress = saved?.gate.progress || 0; gateOpening = saved?.gate.opening || false; gateOpen = saved?.gate.open || false
    entryCrossed = saved?.gate.crossed || false
    if (saved) {
      Object.assign(power.state,saved.power)
      if(!savedState?.flags.chapter5Entered)restoreCampaignPlayer(g,saved.player)
      g.game.run.time=saved.runTime
      equipment.restore(saved.equipment)
    } else { history.length = 0; lastCheckpoint = null }
    checkpointPending = !saved; previous = null
    environment.setPower(power.state.power); environment.setEnabled(containsM1Sector('berth-5',g.player.pos))
    syncGate(); g.physics.build()
    if (saved) {safeRooms.restore(saved.safeRooms);infectedDirector.restore(saved.infected)}
    else {safeRooms.reset();infectedDirector.reset()}
    if (!saved) {
      equipment.setPickupEnabled('rifle',power.state.power === 'ON')
      equipment.setPickupEnabled('knife',power.state.power === 'ON')
    }
    map.refreshView()
    restoringFlags=null
  }
  // Explicit quick-play fixture only. The continuous campaign never calls this.
  // Start on the CH2 side so native movement still owns the CH3 opening trigger.
  function seedChapter3Trial() {
    for (const event of [
      {type:'pistol-acquired'},{type:'guard-requested'},{type:'guard-scanning'},
      {type:'guard-warning'},{type:'guard-hostile'},{type:'ambush-resolved',method:'isolation'},
      {type:'power-stable'},{type:'equipment-acquired',id:'rifle'},{type:'equipment-acquired',id:'knife'},
      {type:'supplies-acquired',ammo:true,flashlight:true},{type:'maintenance-open'},{type:'blackbox-entered'},
      {type:'chapter2-crossed'},{type:'chapter2-intro-read',skipped:false},
      {type:'exit-ammo-hint-handled'},{type:'echo-lane-entered'},{type:'safe-room-hint-shown'},
      {type:'safe-a-entered'},{type:'safe-b-entered'},{type:'safe-c-entered'},
    ]) director.event(event)
    map.reset({entry:'campaign-m1',sectorId:'blackbox-yard',visitedSectorIds:['berth-5','blackbox-yard'],
      chapter:{id:'CH2',status:'not-implemented'},storyCompleted:false})
    power.state.power='ON';gateProgress=1;gateOpening=false;gateOpen=entryCrossed=true;syncGate();g.physics.build()
    const resolved=guard.snapshot();resolved.stage='resolved';resolved.method='isolation'
    for(const actor of resolved.actors){actor.defeated=true;actor.hp=0}
    guard.reset(resolved);patrols.finish()
    supplies.reset({consumed:true,exitConsumed:true,flashlightOwned:true,on:false})
    const rooms=safeRooms.capture()
    for(const room of rooms.rooms){room.entered=true;room.consumed=true;room.forwardExited=true}
    safeRooms.restore(rooms)
    infectedDirector.setEnabled(true);activateAvailableSections()
    const kit=equipment.capture()
    for(const id of ['rifle','pistol','knife']){kit.slots[id].owned=true;kit.pickupEnabled[id]=false}
    kit.activeWeapon='rifle';equipment.restore(kit)
    g.player.reset({pos:new T.Vector3(-61.5,0,-190),yaw:-Math.PI/2})
    environment.setPower('ON');environment.setEnabled(false)
    checkpointPending=true;previous=null
  }
  // Explicit CH4 fixture starts on the CH3 side of the unchanged seam.
  function seedChapter4Trial() {
    seedChapter3Trial()
    for(const event of [{type:'berth6-entered'},{type:'chapter3-crossed'},
      {type:'chapter3-intro-read',skipped:false},{type:'worker-rescued'},
      {type:'sniper-threat-resolved',method:'bypassed'},{type:'worker-testimony-completed'}])director.event(event)
    infectedDirector.finish()
    for(const m of chapter3.clearance.members)chapter3.clearance.retire(m.id)
    chapter3.rescue.restore({version:1,door:'open',unlocked:true,rescued:true})
    map.reset({entry:'campaign-m1',sectorId:'berth-6',visitedSectorIds:['berth-5','blackbox-yard','berth-6'],
      chapter:{id:'CH3',status:'not-implemented'},storyCompleted:false})
    const kit=equipment.capture()
    for(const id of ['rifle','pistol']){const spec=equipment.snapshot().slots[id];kit.slots[id].ammo=spec.magSize;kit.slots[id].reserve=spec.reserveCap}
    equipment.restore(kit)
    g.player.reset({pos:new T.Vector3(-58,0,-110),yaw:Math.PI/2})
    checkpointPending=true;previous=null
  }
  function seedChapter5Trial() {
    seedChapter4Trial()
    for(const event of [{type:'chapter3-exited'},{type:'chapter4-crossed'},
      {type:'chapter4-intro-read',skipped:false}])director.event(event)
    for(const member of chapter4.enemies.members) {
      member.target.restoreState({hp:0,alive:false});member.ai.reset()
      member.animation.playClip(INFECTED_CLIPS.Death.index,{loop:false,fade:0,restart:true})
    }
    for(const event of [{type:'ch4-infected-cleared'},{type:'p07-read'},
      {type:'gate-override-started'},{type:'gate-override-accepted'},{type:'chapter4-exited'}])director.event(event)
    const completed=chapter4.capture()
    completed.clearance={...completed.clearance,count:5,killedIds:completed.infected.members.map(m=>m.id),consoleUnlocked:true}
    completed.elapsed=60;completed.gate={started:true,progress:1};completed.infected.enabled=false
    chapter4.reset(completed)
    map.reset({entry:'campaign-m1',sectorId:'blockade-control',visitedSectorIds:['berth-5','blackbox-yard','berth-6','blockade-control'],
      chapter:{id:'CH4',status:'not-implemented'},storyCompleted:false})
    const kit=equipment.capture()
    // Leave a small, explicit deficit so the trial can exercise the last crate.
    for(const id of ['rifle','pistol']){kit.slots[id].ammo-=2;kit.slots[id].reserve-=10}
    equipment.restore(kit)
    g.player.reset({pos:new T.Vector3(-41.5,0,5),yaw:-Math.PI/2})
    checkpointPending=true;previous=null
  }
  function reset() {
    const saved=retryRequested ? retrySave : null
    validateCheckpoint(saved)
    retryRequested=false;retrySave=null
    narrative.cancelChapter2();narrative.cancelChapter3?.();narrative.cancelChapter4?.();narrative.cancelChapter5?.();narrative.cancelChapter5Power?.();hints.reset()
    try {
      if (saved) director.retry(restoreWorld,saved)
      else {chapterEntry=null;narrative.markChapterRead?.(4,false);narrative.markChapterRead?.(5,false);restoreWorld(null);director.reset();if(chapter5Trial)seedChapter5Trial();else if(chapter4Trial)seedChapter4Trial();else if(chapter3Trial)seedChapter3Trial()}
      narrative.setReplayProgress?.(director.current().flags)
      checkpoint()
    } catch (error) {
      restoringFlags=null
      infectedDirector.setEnabled(false);g.player.enabled=false
      g.input.setGameplay(false);g.audio.setPaused(true)
      g.game.pause()
      throw error
    }
  }
  function prepareReset(retry) {
    retryRequested=!!retry && g.game.state==='dead'
    // Native game.start resets equipment/player before calling this adapter.
    // Reject invalid data here, while the dead world and save are untouched.
    retrySave=retryRequested ? chapterRetry() : null
    if (retryRequested) validateCheckpoint(retrySave)
    // Release the old cinematic before native H resets the player/camera.
    // Victory starts a fresh CH1 run even when launched from the CH5 trial.
    if (director.current().flags.campaignCompleted) chapter3Trial=chapter4Trial=chapter5Trial=false
    chapter5?.ending?.reset()
    return retryRequested || chapter3Trial || chapter4Trial || chapter5Trial
  }
  function nearby(position) {
    const p = g.player.pos, dx = position.x-p.x, dz = position.z-p.z, distance = Math.hypot(dx,dz)
    return distance < 2.15 && Math.abs(p.y) < 1.4 &&
      (distance < .8 || (dx*g.player.forward.x+dz*g.player.forward.z)/(distance*Math.max(.2,Math.hypot(g.player.forward.x,g.player.forward.z))) >= .45) &&
      g.physics.lineOfSight(g.player.eye,position)
  }
  function hold(id, dt, label, enabled, action) {
    holds[id] = enabled && g.input.down('interact') ? Math.min(1,holds[id]+dt/2.4) : Math.max(0,holds[id]-dt*1.6)
    g.hud.setPrompt(label,holds[id])
    if (holds[id] === 1) { holds[id]=0; action(); g.audio.play('relay_cut',{pos:anchors[id],gain:.3,jitter:0}) }
  }
  function interact(dt) {
    if (g.game.state !== 'playing' || !g.player.alive || !g.player.enabled || dialogue.snapshot().active || narrative.snapshot().active) return
    const flags = director.current().flags
    g.hud.setObjective(); g.hud.setRelays(0,0); g.hud.setPrompt(null)
    if (chapter5 && flags.chapter5Entered) {
      equipment.update(dt)
      if (containsM1Sector('berth-6',g.player.pos)) chapter3.interact(dt)
      else chapter5.interact()
      if (checkpointPending && g.player.alive) checkpoint()
      return
    }
    if (chapter4 && flags.chapter4Entered) {
      equipment.update(dt)
      if (containsM1Sector('berth-6',g.player.pos)) chapter3.interact(dt)
      else chapter4.interact(dt)
      if (checkpointPending && g.player.alive) checkpoint()
      return
    }
    equipment.setPickupEnabled('rifle',flags.power5Stable)
    equipment.setPickupEnabled('knife',flags.power5Stable)
    if (equipment.update(dt)) return
    if (chapter3 && flags.chapter3Entered) {
      chapter3.interact(dt)
      if (checkpointPending && g.player.alive) checkpoint()
      if (containsM1Sector('berth-6',g.player.pos)) return
    }
    if (safeRooms.interact()) return
    if (gateOpen && supplies.interactExit()) { checkpointPending=true; return }
    if (flags.power5Stable && supplies.interact()) return
    for (const id of ['isolation','power','gate']) if (!nearby(anchors[id])) holds[id]=0
    if (nearby(anchors.request) && !flags.guardRequested) {
      g.hud.setPrompt(flags.pistolOwned ? '请求机械守卫护送' : '先到安保亭取得自卫装备')
      if (flags.pistolOwned && g.input.pressed('interact') && guard.request()) dialogue.open()
    } else if (nearby(anchors.isolation)) {
      hold('isolation',dt,flags.robotAmbushResolved ? '巡逻回路已安全隔离' : '切断清除单位巡逻回路',flags.guardBetrayalSeen && !flags.robotAmbushResolved,()=>guard.isolate())
    } else if (nearby(anchors.power)) {
      const allowed = flags.robotAmbushResolved && power.state.power === 'OFF'
      hold('power',dt,!flags.robotAmbushResolved ? '清除巡逻仍在活动 · 先解除威胁' : power.state.power === 'OFF' ? '恢复应急供电' : power.state.power === 'UNSTABLE' ? '备用电源正在稳定' : '五号泊位应急供电正常',allowed,()=>power.request('power'))
    } else if (nearby(anchors.gate)) {
      const ready = flags.power5Stable && flags.suppliesAcquired && flags.rifleOwned && flags.knifeOwned
      hold('gate',dt,!ready ? '先到仓库领取步枪、匕首、手电与弹药' : gateOpen ? '维护通道已开放 · 门边可补充弹药' : gateOpening ? '维护门正在升起' : '开启维护门',ready && !gateOpening && !gateOpen,()=>{gateOpening=true})
    }
  }
  function update(dt) {
    if (g.game.state !== 'playing' || !g.player.alive || dialogue.snapshot().active || narrative.snapshot().active) return
    if (entryCrossed && !director.current().flags.chapter2IntroRead) { openChapter2(); return }
    if (chapter3 && director.current().flags.chapter3Entered && !director.current().flags.chapter3IntroRead) { openChapter3(); return }
    if (chapter5 && director.current().flags.chapter5Entered) {
      if (!director.current().flags.chapter5IntroRead) {openChapter5();return}
      const p=g.player.pos
      environment.setEnabled(containsM1Sector('berth-5',p));environment.update(dt);map.update(dt);supplies.update(dt)
      chapter3.update(0);chapter4.update(dt);chapter5.update(dt);previous=p.clone()
      if (checkpointPending) checkpoint()
      return
    }
    if (chapter4 && director.current().flags.chapter4Entered) {
      if (!director.current().flags.chapter4IntroRead) {openChapter4();return}
      const p=g.player.pos
      environment.setEnabled(containsM1Sector('berth-5',p));environment.update(dt);map.update(dt);supplies.update(dt)
      chapter3.update(0);chapter4.update(dt);chapter4.observeExit(previous,p)
      if (chapter5 && crossedChapter5Entry(previous,p) && emit({type:'chapter5-crossed'})) {
        previous=p.clone();checkpoint();openChapter5();return
      }
      previous=p.clone()
      if (checkpointPending) checkpoint()
      return
    }
    guard.update(dt); power.tick(dt)
    if (power.state.power === 'ON' && emit({type:'power-stable'})) {
      patrols.activate()
      g.hud.radio('应急电网已恢复。自动巡防单位正在进入五号泊位。',6)
      g.hud.message('守卫正在增援。前往东北侧仓库领取武器与照明装备。',7)
    }
    patrols.update(dt)
    if (gateOpening) {
      gateProgress = Math.min(1,gateProgress+dt/2.5); syncGate()
      if (gateProgress === 1) { gateOpening=false; gateOpen=true; g.physics.build(); emit({type:'maintenance-open'}) }
    }
    const p = g.player.pos
    // The capsule can clear the rising door before the animation finishes.
    // Retain that real crossing so ordered completion never requires a recross.
    if (!entryCrossed && previous && (gateOpen || gateOpening) && previous.x >= -60 && p.x < -60 &&
      p.z > -291 && p.z < -279 && Math.abs(p.y) < .5 && p.distanceTo(previous) < 4) {
      entryCrossed = true; patrols.finish()
      emit({type:'chapter2-crossed'})
      previous = p.clone()
      checkpoint()
      openChapter2()
      return
    }
    if (gateOpen && entryCrossed) emit({type:'blackbox-entered'})
    environment.setPower(power.state.power); environment.setEnabled(containsM1Sector('berth-5',p)); environment.update(dt)
    map.update(dt); supplies.update(dt)
    safeRooms.update(dt)
    if (entryCrossed && previous && previous.x<=-60 && p.x>-60 && p.z>-196 && p.z<-184 &&
      Math.abs(p.y)<.5 && p.distanceTo(previous)<4 && emit({type:'berth6-entered'})) {
      g.hud.message('第二章完成 · 已抵达六号泊位',8)
      if (chapter3 && emit({type:'chapter3-crossed'})) {
        previous=p.clone();checkpoint();openChapter3();return
      }
    }
    hints.update(dt)
    if (chapter3) {
      chapter3.update(dt)
      if (chapter3.observeExit(previous,p) && chapter4 && emit({type:'chapter4-crossed'})) {
        chapter3.update(0);previous=p.clone();checkpoint();openChapter4();return
      }
    }
    previous = p.clone()
    // Preserve an early crossing/retirement before a newly enabled enemy can hit.
    if (checkpointPending) checkpoint()
    infectedDirector.update(dt)
  }
  function openChapter2() {
    const opened=narrative.openChapter2({ onComplete:({skipped})=>{
      emit({type:'chapter2-intro-read',skipped})
      checkpoint()
    } })
    if (opened) {hints.reset();g.hud.message(null)}
    return opened
  }
  function openChapter3() {
    return narrative.openChapter3({onComplete:({skipped})=>{
      emit({type:'chapter3-intro-read',skipped});checkpoint()
    }})
  }
  function openChapter4() {
    return narrative.openChapter4({onComplete:({skipped})=>{
      emit({type:'chapter4-intro-read',skipped});checkpoint()
    }})
  }
  function openChapter5() {
    return narrative.openChapter5({onComplete:({skipped})=>{
      emit({type:'chapter5-intro-read',skipped});checkpoint();chapter5.showAmmoHint()
    }})
  }
  g.events.on('game:state',({state})=>{ if (state === 'dead') { director.fail(); checkpointPending=false } })
  reset()
  document.querySelector('.m-premise').textContent = chapter5Ending ? (chapter5Trial ? '第五章 · 七号泊位：今夜离港。恢复供电、仓库授权和燃油输送，修复73%故障；燃油满后前往工作艇登船点按E离港。仓库外与维修柜旁弹药箱每10秒恢复。' : '灾变第七日，失联的港区应急技术员必须穿过五号泊位、黑箱堆场、六号泊位与封锁线，寻找七号泊位最后一艘工作艇。WASD移动，E互动，P暂停。') : chapter5Trial && chapter5Fuel ? '第五章 · 七号泊位燃油任务。供电后等待仓库开放，操作控制机关解除工作艇封锁，再开启码头燃油阀。输送故障后前往入口右侧维修柜；仓库旁和维修柜旁弹药箱每10秒恢复。E互动，P暂停。' : chapter5Trial && chapter5Combat ? '第五章 · 七号泊位混战。入口补弹后启动中央供电，确认两页报幕的继续行动；四类敌人开始交战，仓库60秒后开启。每次死亡5秒后安全随机补位；E互动，P暂停。' : chapter5Trial ? '第五章 · 七号泊位：今夜离港。向东进入七号泊位，入口补弹后启动中央应急供电。读完两页短报幕，等待60秒仓库安全联锁完成；E互动，P暂停。' : chapter4Trial ? '第四章 · 封锁线：第七区控制中心。向西穿过连接口，清除五只感染者；在安全门旁按 E 读取机密档案，最后一页 Enter 开始60秒权限覆盖。门旁弹药箱每15秒可补满已持枪械。1 步枪 / 2 手枪 / 3 刀，Ctrl 蹲，Q 手电。' : chapter3Trial ? '第三章 · 六号泊位：清除命令。快速试玩从黑箱出口开始：走向灯光，利用掩体或货柜绕行营救许工；按 E 主动交谈，取得凭据后前往第七区连接口。1 步枪 / 2 手枪 / 3 刀，Ctrl 蹲，Q 手电，E 互动。' :
    '第一章 · 五号泊位：最后的守卫。搜索安保亭，在中央作业区请求护送，恢复供电，进入仓库领取装备，再穿越巡防区前往黑箱堆场。'
  document.querySelector('.m-tag').textContent = chapter5Trial || chapter4Trial ? '07' : chapter3Trial ? '06' : '05'
  return { update, interact, reset, prepareReset, chapter3, chapter4, chapter5, reinforcementEnabled:false,
    snapshot:()=>({ ...map.snapshot(), storyCompleted:!!director.current().flags.campaignCompleted, entry:chapter5?(chapter5Ending?'campaign-m5-c':chapter5Fuel?'campaign-m5-b':chapter5Combat?'campaign-m5-a1':'campaign-m5-a0'):chapter4?'campaign-m4':chapter3?'campaign-m3':'campaign-m2', ...(chapter3?{stage:'M3-B',chapter3Trial,chapter3:chapter3.snapshot()}:{}), ...(chapter4?{stage:'M4-B',chapter4Trial,chapter4:chapter4.snapshot()}:{}), ...(chapter5?{stage:chapter5Ending?'M5-C':chapter5Fuel?'M5-B':chapter5Combat?'M5-A1':'M5-A0',chapter5Trial,chapter5:chapter5.snapshot()}:{}), entrySnapshot:chapterEntry, chapter:director.snapshot(),
      power:power.snapshot(), guard:guard.snapshot(), dialogue:dialogue.snapshot(), patrols:patrols.snapshot(), supplies:supplies.snapshot(), lighting:environment.snapshot(),
      infected:infectedDirector.snapshot(), safeRooms:safeRooms.snapshot(),
      narrative:narrative.snapshot(), hints:hints.snapshot(),
      gate:{ progress:gateProgress,opening:gateOpening,open:gateOpen,crossed:entryCrossed,box:{min:gateBox.min.toArray(),max:gateBox.max.toArray()} },
      anchors:Object.fromEntries(Object.entries(anchors).map(([id,pos])=>[id,pos.toArray()])),
      holds:{...holds}, lastCheckpoint, events:history.map(event=>({...event,position:[...event.position]})) }) }
}
