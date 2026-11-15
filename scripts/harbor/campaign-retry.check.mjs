import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createChapterDirector } from './chapter-director.mjs'

const json=value=>JSON.parse(JSON.stringify(value))
const entry=()=>({player:{position:[0,0,-328],hp:100},equipment:{pistol:{owned:false,ammo:0}},supplies:{consumed:[]},npc:{hp:100,alert:false}})

test('chosen entry restore rolls back the whole attempt while ordinary retry still restores the latest save',()=>{
  const d=createChapterDirector();d.checkpoint(entry());const start=json(d.snapshot().checkpoint)
  d.event({type:'pistol-acquired'})
  d.checkpoint({player:{position:[-7,0,-323],hp:45},equipment:{pistol:{owned:true,ammo:12}},supplies:{consumed:['pickup']},npc:{hp:0,alert:true}})
  const latest=json(d.snapshot().checkpoint);d.fail()
  const restored=d.retry((runtime,state)=>{
    assert.deepEqual(runtime,start.runtime);assert.equal(state.flags.pistolOwned,false)
  },start)
  assert.deepEqual(restored,start.runtime);assert.equal(d.current().flags.pistolOwned,false)
  // A diagnostic resume API remains independent of the game's death policy.
  assert.deepEqual(d.snapshot().checkpoint,latest)
  d.fail();d.retry();assert.equal(d.current().flags.pistolOwned,true)
})

test('selected chapter entry is copied through JSON and failed restore commits no facts',()=>{
  const d=createChapterDirector();d.checkpoint(entry());const start=json(d.snapshot().checkpoint)
  d.event({type:'pistol-acquired'});d.checkpoint({later:true});d.fail()
  const failed=json(d.snapshot())
  assert.throws(()=>d.retry((runtime,state)=>{runtime.player.hp=0;state.flags.pistolOwned=true;throw Error('world validation')},start),/world validation/)
  assert.deepEqual(d.snapshot(),failed);assert.equal(start.runtime.player.hp,100);assert.equal(start.state.flags.pistolOwned,false)
  d.retry((runtime,state)=>{runtime.player.position[0]=12;state.flags.pistolOwned=true},start)
  assert.equal(d.current().flags.pistolOwned,false,'callback cannot mutate the committed facts')
  assert.equal(start.runtime.player.position[0],0,'callback cannot mutate the retry anchor')
})
