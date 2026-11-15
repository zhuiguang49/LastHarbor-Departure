import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CH5_ENDING_STAGES, CH5_ENDING_SECONDS, createChapter5Ending } from './campaign-ch5-ending-state.mjs'

const expected=[
  ['hud','许工……船真的还在。',2.5],
  ['hud','我终于离开紫金港了。',2.5],
  ['radio','警告。',1],
  ['radio','第七封锁区检测到未经授权的出港船只。',3],
  ['radio','目标正在离开指定管制区域。',2.5],
  ['radio','正在向中央安保网络发送海上拦截请求……',3.5],
  ['radio','［信号中断］',1.5],
]
const near=(actual,value)=>assert.ok(Math.abs(actual-value)<1e-8,`${actual} != ${value}`)

test('CH5 departure preserves both HUD sentences and all five company lines exactly',()=>{
  const lines=CH5_ENDING_STAGES.filter(stage=>stage.channel)
  assert.deepEqual(lines.map(({channel,text,seconds})=>[channel,text,seconds]),expected)
  for(const line of lines){
    if(line.channel==='hud')assert.equal(Object.hasOwn(line,'sender'),false)
    else assert.equal(line.sender,'DEEPTIDE SECURITY SYSTEM')
  }
  assert.equal(CH5_ENDING_SECONDS,21.5)
  assert.ok(Object.isFrozen(CH5_ENDING_STAGES));assert.ok(CH5_ENDING_STAGES.every(Object.isFrozen))
})

test('CH5 departure emits each cue once, then silence, then victory only after full fade',()=>{
  const m=createChapter5Ending(),events=[],lineTimes=[]
  assert.equal(m.snapshot().phase,'READY');assert.equal(m.snapshot().progress,0)
  assert.equal(m.begin(),true);assert.equal(m.snapshot().phase,'DEPARTING')
  for(let frame=1;frame<=430;frame++){
    const emitted=m.tick(.05),s=m.snapshot()
    for(const event of emitted){
      events.push(event)
      if(event.type==='line')lineTimes.push(frame*.05)
    }
    if(frame<430){assert.equal(s.finished,false);assert.ok(s.progress<1)}
    if(frame<390)assert.equal(s.fade,0)
    if(frame===360){assert.equal(s.phase,'SAILING');assert.equal(s.cue,null);assert.equal(events.at(-1).type,'silence')}
    if(frame===390){assert.equal(s.phase,'FADING');assert.equal(s.fade,0)}
    if(frame===410)near(s.fade,.5)
  }
  const lines=events.filter(event=>event.type==='line')
  assert.deepEqual(lines.map(({channel,text,seconds})=>[channel,text,seconds]),expected)
  assert.deepEqual(lines.map(line=>line.index),[0,1,2,3,4,5,6])
  assert.deepEqual(lineTimes,[1.5,4,6.5,7.5,10.5,13,16.5])
  assert.deepEqual(events.slice(-2),[{type:'silence'},{type:'finished'}])
  assert.equal(m.snapshot().phase,'FINISHED');assert.equal(m.snapshot().elapsed,21.5)
  assert.equal(m.snapshot().progress,1);assert.equal(m.snapshot().fade,1);assert.equal(m.snapshot().cue,null)
  assert.deepEqual(m.tick(1000),[]);assert.equal(m.begin(),false)
})

test('CH5 departure discards excess dt rather than skipping multiple unread stages',()=>{
  const m=createChapter5Ending();m.begin()
  assert.deepEqual(m.tick(1000).map(event=>event.text),[expected[0][1]])
  let s=m.snapshot();assert.equal(s.stageIndex,1);assert.equal(s.stageElapsed,0);assert.equal(s.elapsed,1.5)
  assert.deepEqual(m.tick(2.49),[]);assert.equal(m.snapshot().cue.text,expected[0][1])
  assert.deepEqual(m.tick(1000).map(event=>event.text),[expected[1][1]])
  s=m.snapshot();assert.equal(s.stageIndex,2);assert.equal(s.stageElapsed,0);near(s.elapsed,4)
  for(let index=2;index<7;index++){
    const emitted=m.tick(1000)
    assert.equal(emitted.length,1);assert.equal(emitted[0].text,expected[index][1])
    assert.equal(m.snapshot().stageElapsed,0);assert.equal(m.snapshot().finished,false)
  }
  assert.deepEqual(m.tick(1000),[{type:'silence'}]);assert.equal(m.snapshot().phase,'SAILING')
  assert.deepEqual(m.tick(1000),[]);assert.equal(m.snapshot().phase,'FADING');assert.equal(m.snapshot().fade,0)
  assert.deepEqual(m.tick(1.99),[]);assert.equal(m.snapshot().finished,false)
  assert.deepEqual(m.tick(.01),[{type:'finished'}]);assert.deepEqual(m.tick(1000),[])
})

test('CH5 departure pause gate and invalid dt hold every stage; repeated E cannot restart it',()=>{
  const m=createChapter5Ending(),initial=m.snapshot()
  assert.deepEqual(m.tick(1000),[]);assert.deepEqual(m.snapshot(),initial)
  m.begin()
  for(let index=0;index<10;index++){
    const before=m.snapshot()
    for(const dt of [0,-1,NaN,Infinity,-Infinity,undefined])assert.deepEqual(m.tick(dt),[])
    assert.deepEqual(m.tick(1000,false),[]);assert.equal(m.begin(),false)
    assert.deepEqual(m.snapshot(),before)
    m.tick(1000)
  }
  assert.equal(m.snapshot().finished,true)
  assert.deepEqual(m.reset(),initial);assert.equal(m.begin(),true)
  assert.equal(m.snapshot().phase,'DEPARTING');assert.equal(m.snapshot().elapsed,0)
  assert.equal(createChapter5Ending().snapshot().phase,'READY')
})

test('CH5 departure snapshots and emitted cues cannot corrupt later playback or reset',()=>{
  const m=createChapter5Ending();m.begin()
  const [line]=m.tick(1.5),saved=m.snapshot()
  line.text='changed';line.channel='radio';saved.cue.text='changed';saved.elapsed=10000;saved.finished=true
  assert.equal(m.snapshot().cue.text,expected[0][1]);assert.equal(m.snapshot().finished,false)
  m.reset();assert.equal(m.snapshot().cue,null);assert.equal(m.snapshot().fade,0)
  m.begin();assert.equal(m.tick(1.5)[0].text,expected[0][1])
})
