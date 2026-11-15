import { containsM1Sector } from './campaign-layout.mjs'

export const CH2_HINTS = Object.freeze({
  ammo: '弹药补给：身后的维护门旁仍有弹药补给点。如果刚才匆忙逃离，记得返回领取。靠近补给点按 E。',
  safety: '生存提示：黑箱堆场分为三段危险货道，每段尽头都有应急安全室。安全室内可补充弹药，感染者无法进入，也无法在室内攻击你。',
})

// One native HUD message slot. Persistent once-per-run facts belong to the
// chapter director; interrupted visible time remains local to this message.
export function installChapter2Hints(g, { flags, emit, exitConsumed, blocked, safeReady }) {
  const nativeMessage = g.hud.message
  let active = null, busy = 0, visible = false
  function suspend() {
    if (visible) nativeMessage.call(g.hud, null)
    visible = false
  }
  function message(text, seconds = 3) {
    visible = false
    busy = text ? Math.max(0, seconds) : 0
    return nativeMessage.call(this, text, seconds)
  }
  g.hud.message = message
  const held = () => g.game.state !== 'playing' || !g.player.alive || !g.player.enabled || blocked()
  const onState = () => { if (held()) suspend() }
  g.events.on('game:state', onState)
  g.events.on('radio:line', onState)
  function show(kind, seconds) {
    active = { kind, remaining:seconds }
    nativeMessage.call(g.hud, CH2_HINTS[kind], seconds); visible = true
  }
  function update(dt) {
    if (held()) { suspend(); return }
    const state = flags(), p = g.player.pos
    if (!state.chapter2IntroRead) return
    // The first actual freight aisle, clear of the maintenance doorway.
    if (!state.echoLaneEntered && p.x <= -64 && p.x >= -74 && p.z >= -293 && p.z <= -278 && Math.abs(p.y) < .8) emit({type:'echo-lane-entered'})
    if (active?.kind === 'ammo' && exitConsumed()) { suspend(); active = null }
    if (active && visible) {
      active.remaining = Math.max(0, active.remaining - dt)
      if (!active.remaining) { suspend(); active = null }
    }
    busy = Math.max(0, busy - dt)
    if (busy > 0) return
    if (active) {
      if (!visible) { nativeMessage.call(g.hud, CH2_HINTS[active.kind], active.remaining); visible = true }
      return
    }
    if (!state.exitAmmoHintHandled) {
      emit({type:'exit-ammo-hint-handled'})
      if (!exitConsumed()) show('ammo', 7)
      return
    }
    // A queued hint must not activate infected after the player has returned
    // to the lit CH1 supplies or is still beside the maintenance doorway.
    if (flags().echoLaneEntered && !state.safeRoomHintShown && p.x<=-64 && containsM1Sector('blackbox-yard',p) && safeReady()) {
      show('safety', 9); emit({type:'safe-room-hint-shown'})
    }
  }
  function reset() { suspend(); active = null; busy = 0 }
  return { update, reset, suspend,
    snapshot:()=>({active:active ? {...active} : null,busy,visible}),
    dispose(){reset();g.events.off('game:state',onState);g.events.off('radio:line',onState);if(g.hud.message===message)g.hud.message=nativeMessage},
  }
}
