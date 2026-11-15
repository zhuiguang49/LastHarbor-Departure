import { createKnifeModel } from './knife-asset.mjs'
import { createKnifeSound } from './knife-sound.mjs'

// User-provided STEP knife with authored handling. Uses original collision/damage
// contract, without invoking playerShot, weapon:fire, tracers or shell effects.
export const KNIFE = Object.freeze({ id: 'knife', slot: 3, name: '港务安保匕首', magSize: 0, ammo: 0, reserve: 0, damage: 38, rpm: 0, range: 1.65, cooldown: .38, contact: .105, recovery: .30, equip: .28 })
const clamp = v => Math.max(0, Math.min(1, v))
const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v) }

export function createKnife(g, view, hands) {
  if (typeof g.enemies?.raycast !== 'function' || typeof g.physics.raycast !== 'function') throw Error('Knife requires original enemy and physics raycasts')
  const T = g.THREE, root = createKnifeModel(T), weapon = g.weapon, right = hands[0], left = hands[1]
  if (typeof view.createGripHand !== 'function' || !view.gloveMaterial) throw Error('Knife requires the audited original glove factory')
  const carrier = new T.Group(); carrier.name = 'knife-overhand-cut'; weapon.root.add(carrier); carrier.add(root)
  const rightQ = new T.Quaternion().setFromEuler(new T.Euler(0,-.18,-Math.PI/2))
  const resting = new T.Quaternion().setFromEuler(new T.Euler(-.12,-1.40,.22))
  const forearm = new T.Vector3(.50,-.25,.83).normalize().applyQuaternion(resting.clone().invert()).applyQuaternion(rightQ.clone().invert()).toArray()
  const sound = createKnifeSound(g.audio), cutting = new T.Quaternion()
  const geometry = view.createGripHand({ mirror:false, fingers:[[.65,1.7,.85,.02],[.62,1.72,.8,0],[.68,1.7,.8,-.03],[.74,1.66,.8,-.09]], thumb:[[0,-.25,-.97],[.7,-.2,-.68],[.9,0,-.3]], forearm, sleeve:.34 })
  const hand = new T.Mesh(geometry,view.gloveMaterial); hand.name = 'knife-closed-original-glove'; hand.frustumCulled = false; hand.receiveShadow = true; carrier.add(hand)
  carrier.traverse(object => { object.layers.mask = right.object.layers.mask })
  hand.quaternion.copy(rightQ); hand.position.fromArray(root.userData.grip).sub(new T.Vector3(.006,-.031,-.085).applyQuaternion(rightQ))
  const inverse = new T.Quaternion(), offset = new T.Vector3()
  const leftQ = left.quaternion.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(.15,-.15,.1)))
  const leftPos = new T.Vector3(-.20,-.23,-.45).sub(new T.Vector3(0,-.015,-.055).applyQuaternion(leftQ))
  const origin = new T.Vector3(), dir = new T.Vector3()
  let time = 0, equip = 0, cooldown = 0, contactPause = 0, impactKick = 0, swing = null, prevFire = true, swings = 0, contacts = 0, hits = 0, wallHits = 0, lastHit = null
  function cancel() {
    swing = null; equip = contactPause = impactKick = 0; sound.cancel(); prevFire = true; weapon.ads = 0; g.player.ads = 0; view.setTrigger?.(0)
    // Keep cooldown across switches and pause so neither bypasses attack cadence.
  }
  function reset() { cancel(); sound.reset(); time = cooldown = swings = contacts = hits = wallHits = 0; lastHit = null }
  function equipNow() { cancel(); equip = KNIFE.equip }
  function contact() {
    contacts++; origin.copy(g.player.eye || g.camera.position); dir.set(0,0,-1).applyQuaternion(g.camera.quaternion).normalize()
    const wall = g.physics.raycast(origin,dir,KNIFE.range), range = wall ? Math.max(0,Math.min(KNIFE.range,wall.dist-.001)) : KNIFE.range
    const hit = range > 0 ? g.enemies.raycast(origin,dir,range) : null
    // The original manager bounds its raycasts too; validate the returned hit so
    // damage never crosses the wall or the melee reach, including tied surfaces.
    if (hit && hit.dist >= 0 && hit.dist <= range && hit.enemy.alive) {
      const killed = hit.enemy.damage(KNIFE.damage,hit.point,dir,hit.part) === true
      hits++; lastHit = { surface:'enemy', distance:hit.dist, enemyId:hit.enemy.id ?? null, part:hit.part, killed }
      g.events.emit('impact',{point:hit.point,normal:hit.normal || dir.clone().negate(),dist:hit.dist,surface:'enemy',enemy:hit.enemy,part:hit.part,dir:dir.clone(),from:'player',weapon:'knife',killed})
      g.events.emit('player:hitEnemy',{enemy:hit.enemy,part:hit.part,killed,weak:false,weapon:'knife'})
      sound.play(hit.enemy.type==='infected'?'wall':'robot'); contactPause=.022; impactKick=1; g.player.addShake?.(.25)
    } else if (wall && wall.dist <= KNIFE.range) {
      wallHits++; lastHit = { surface:wall.surface, distance:wall.dist, enemyId:null, killed:false }
      // Wall contact uses sound only: the native impact FX would make bullet holes.
      sound.play('wall'); contactPause=.018; impactKick=.7; g.player.addShake?.(.16)
    } else lastHit = { surface:'miss', distance:null, enemyId:null, killed:false }
    g.events.emit('harbor:knife',{phase:'contact',weapon:'knife',...lastHit})
  }
  function update(dt) {
    if (g.game.state !== 'playing' || !g.player.alive) { cancel(); return }
    dt = Math.min(dt,.05); time += dt; cooldown = Math.max(0,cooldown-dt)
    const fire = !!g.input.fire, edge = fire && !prevFire; prevFire = fire
    if (edge && !swing && equip <= 0 && cooldown <= 0) {
      swing = {t:0,contact:false}; cooldown = KNIFE.cooldown; swings++
      g.events.emit('harbor:knife',{phase:'swing',weapon:'knife'})
      sound.play('swing')
    }
    if (swing) {
      const frozen=Math.min(contactPause,dt); contactPause-=frozen; swing.t+=dt-frozen
      if (!swing.contact && swing.t >= KNIFE.contact) { swing.contact = true; contact() }
      if (swing.t >= KNIFE.recovery) swing = null
    }
    equip = Math.max(0,equip-dt)
    const t = swing?.t ?? 0, cut = smooth((t-.03)/.085), recover = smooth((t-.145)/.155)
    const follow = cut*(1-recover), lift = smooth(t/.03)*(1-cut), speed = clamp((g.player.speed || 0)/5), bob = Math.sin(time*(5+(g.player.speed || 0))) * .004 * speed
    impactKick=Math.max(0,impactKick-dt*12)
    weapon.root.position.set(.22,-.18-.18*smooth(equip/KNIFE.equip)+bob,-.43)
    weapon.root.quaternion.copy(resting)
    // Blade spine faces the player; the edge faces out. The short overhand cut
    // travels across/down in the view plane instead of extending into a thrust.
    inverse.copy(resting).invert()
    offset.set(.015*lift-.205*follow,.085*lift-.065*follow,-.045*follow+.012*impactKick).applyQuaternion(inverse)
    carrier.position.copy(offset)
    cutting.setFromEuler(new T.Euler(-.38*follow,.04*follow,-.32*follow))
    carrier.quaternion.copy(inverse).multiply(cutting).multiply(resting)
    left.object.position.copy(leftPos).sub(weapon.root.position).applyQuaternion(inverse)
    left.object.quaternion.copy(inverse).multiply(leftQ)
    weapon.ads = 0; g.player.ads = 0; weapon.spread = 0
    weapon.state = equip > 0 ? 'equipping' : swing ? swing.t < KNIFE.contact ? 'winding' : swing.t < .145 ? 'impact' : 'recovering' : 'idle'
  }
  return { root, hand, reset, cancel, equip:equipNow, update,
    snapshot: () => ({ phase:equip>0?'equipping':swing?swing.t<KNIFE.contact?'windup':swing.t<.145?'impact':'recovery':cooldown>0?'cooldown':'idle',equipTime:equip,cooldown,swingTime:swing?.t ?? null,contactApplied:swing?.contact ?? false,swings,contacts,hits,wallHits,lastHit:lastHit?{...lastHit}:null,range:KNIFE.range,damage:KNIFE.damage,sound:sound.snapshot(),contactPause,spineDirection:new T.Vector3(1,0,0).applyQuaternion(resting).toArray(),rightHand:hand.position.toArray(),modelPosition:carrier.position.clone().applyQuaternion(weapon.root.quaternion).add(weapon.root.position).toArray(),modelRotation:carrier.rotation.toArray() }) }
}
