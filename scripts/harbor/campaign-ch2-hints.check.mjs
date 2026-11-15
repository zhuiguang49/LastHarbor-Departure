import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installChapter2Hints, CH2_HINTS } from './campaign-ch2-hints.mjs'

function fixture({consumed=false,ready=true}={}) {
  const listeners=new Map(),messages=[],state={chapter2IntroRead:false,exitAmmoHintHandled:false,echoLaneEntered:false,safeRoomHintShown:false}
  let modal=false
  const events={on(name,fn){listeners.set(name,fn)},off(name){listeners.delete(name)},emit(name){listeners.get(name)?.()}}
  const g={events,game:{state:'playing'},player:{alive:true,enabled:true,pos:{x:-60.5,y:0,z:-285.5}},hud:{message(text,seconds){messages.push({text,seconds})}}}
  const types={'echo-lane-entered':'echoLaneEntered','exit-ammo-hint-handled':'exitAmmoHintHandled','safe-room-hint-shown':'safeRoomHintShown'}
  const hints=installChapter2Hints(g,{flags:()=>({...state}),emit:event=>{
    assert.equal(state[types[event.type]],false)
    if(event.type==='safe-room-hint-shown')assert.equal(messages.at(-1)?.text,CH2_HINTS.safety,'activation event follows the actual HUD display')
    state[types[event.type]]=true
  },exitConsumed:()=>consumed,blocked:()=>modal,safeReady:()=>ready})
  return {g,hints,state,messages,consume:()=>{consumed=true},modal:value=>{modal=value;events.emit('radio:line')}}
}
test('exact requested text; resume hint and physical aisle trigger are separate',()=>{
  assert.equal(CH2_HINTS.ammo,'弹药补给：身后的维护门旁仍有弹药补给点。如果刚才匆忙逃离，记得返回领取。靠近补给点按 E。')
  assert.equal(CH2_HINTS.safety,'生存提示：黑箱堆场分为三段危险货道，每段尽头都有应急安全室。安全室内可补充弹药，感染者无法进入，也无法在室内攻击你。')
  const f=fixture();f.hints.update(100);assert.equal(f.messages.length,0)
  f.state.chapter2IntroRead=true;f.hints.update(.016)
  assert.deepEqual(f.messages,[{text:CH2_HINTS.ammo,seconds:7}]);assert.equal(f.state.safeRoomHintShown,false)
  f.hints.update(7);f.hints.update(100);assert.equal(f.state.safeRoomHintShown,false,'waiting is not a spatial trigger')
  f.g.player.pos.x=-65;f.hints.update(.016)
  assert.deepEqual(f.messages.at(-1),{text:CH2_HINTS.safety,seconds:9})
  f.hints.update(9);f.g.player.pos.x=-59;f.hints.update(1);f.g.player.pos.x=-65;f.hints.update(1)
  assert.equal(f.messages.filter(m=>m.text===CH2_HINTS.safety).length,1)
})
test('collected ammo and unavailable room protection suppress their respective hints',()=>{
  const f=fixture({consumed:true,ready:false});f.state.chapter2IntroRead=true;f.g.player.pos.x=-65
  f.hints.update(.016);assert.equal(f.state.exitAmmoHintHandled,true);assert.equal(f.messages.length,0)
  f.hints.update(100);assert.equal(f.state.safeRoomHintShown,false)
})
test('collecting the exit supply cancels its interrupted reminder before entering deeper aisles',()=>{
  const f=fixture();f.state.chapter2IntroRead=true;f.hints.update(.016);f.hints.update(2)
  f.consume();f.g.hud.message('已补满持有枪械的弹匣与备用弹药。',6)
  f.hints.update(5);assert.equal(f.messages.at(-1).text,'已补满持有枪械的弹匣与备用弹药。')
  f.g.player.pos.x=-65;f.hints.update(1)
  assert.equal(f.messages.filter(m=>m.text===CH2_HINTS.ammo).length,1,'collected ammo must never replay its old reminder')
  assert.equal(f.messages.at(-1).text,CH2_HINTS.safety)
  assert.equal(f.state.safeRoomHintShown,true,'the normal aisle activation must still occur')
})
test('collected exit supply also removes a reminder that is still visible',()=>{
  const f=fixture();f.state.chapter2IntroRead=true;f.hints.update(.016)
  f.consume();f.hints.update(.016)
  assert.equal(f.messages.at(-1).text,null);assert.equal(f.hints.snapshot().active,null)
  f.hints.update(10);assert.equal(f.messages.filter(m=>m.text===CH2_HINTS.ammo).length,1)
})
test('aisle reached during ammo hint queues safety until the existing message finishes',()=>{
  const f=fixture();f.state.chapter2IntroRead=true;f.g.player.pos.x=-65
  f.hints.update(.016);assert.equal(f.state.echoLaneEntered,true);assert.equal(f.state.safeRoomHintShown,false)
  f.hints.update(6.9);assert.equal(f.state.safeRoomHintShown,false)
  f.hints.update(.11);assert.equal(f.messages.at(-1).text,CH2_HINTS.safety)
})
test('queued safety waits through a return to CH1, then shows on forward re-entry even beyond the first aisle',()=>{
  const f=fixture();f.state.chapter2IntroRead=true;f.g.player.pos.x=-65
  f.hints.update(.016);assert.equal(f.state.echoLaneEntered,true)
  for(const x of [-57.5,-60.5]){
    f.g.player.pos.x=x;f.hints.update(30)
    assert.equal(f.state.safeRoomHintShown,false)
    assert.ok(!f.messages.some(message=>message.text===CH2_HINTS.safety))
  }
  f.g.player.pos.x=-80;f.hints.update(.016)
  assert.equal(f.state.safeRoomHintShown,true);assert.equal(f.messages.at(-1).text,CH2_HINTS.safety)
})
test('pause/death/dialogue freeze and hide hint; other native messages retain priority; retry keeps shown flags',()=>{
  const f=fixture();f.state.chapter2IntroRead=true;f.hints.update(.016);f.hints.update(2)
  for(const state of ['paused','dead']){
    f.g.game.state=state;f.g.events.emit('game:state');assert.equal(f.messages.at(-1).text,null)
    f.hints.update(30);assert.equal(f.hints.snapshot().active.remaining,5)
    f.g.game.state='playing';f.hints.update(0);assert.equal(f.messages.at(-1).seconds,5)
  }
  f.modal(true);f.hints.update(30);assert.equal(f.hints.snapshot().active.remaining,5)
  f.modal(false);f.hints.update(0)
  f.g.hud.message('设施已启动',6);f.hints.update(5);assert.equal(f.messages.at(-1).text,'设施已启动')
  f.hints.update(1);assert.deepEqual(f.messages.at(-1),{text:CH2_HINTS.ammo,seconds:5})
  f.hints.reset();f.messages.length=0;f.hints.update(10);assert.equal(f.messages.length,0)
  f.hints.dispose()
})
