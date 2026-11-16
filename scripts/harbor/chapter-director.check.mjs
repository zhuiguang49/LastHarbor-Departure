import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createChapterDirector } from './chapter-director.mjs'

// The frame loop reads flags/objectives repeatedly; saving runtime data remains
// a separate deep-copy operation at checkpoint and retry boundaries.
test('repeated current-state reads do not serialize mission facts',()=>{
  const director=createChapterDirector()
  director.checkpoint({actors:Array.from({length:36},(_,id)=>({id,hp:200,position:[0,0,0]}))})
  const stringify=JSON.stringify,parse=JSON.parse
  let encodes=0,decodes=0,owned=false
  try {
    JSON.stringify=(...args)=>{encodes++;return stringify(...args)}
    JSON.parse=(...args)=>{decodes++;return parse(...args)}
    for(let i=0;i<1000;i++)owned=director.current().flags.pistolOwned
  } finally {JSON.stringify=stringify;JSON.parse=parse}
  assert.equal(owned,false)
  assert.equal(encodes,0,'frame reads must not generate temporary JSON strings')
  assert.equal(decodes,0,'frame reads must not parse those strings again')
})

test('current-state copies retain values and cannot mutate live facts or retry saves',()=>{
  const director=createChapterDirector()
  const check=()=>{
    const expected=director.snapshot();delete expected.checkpoint
    const a=director.current(),b=director.current()
    assert.deepEqual(a,expected);assert.deepEqual(b,expected)
    assert.notEqual(a,b);assert.notEqual(a.flags,b.flags)
    for(const [key,value] of Object.entries(a)) {
      if(key==='flags')assert.ok(Object.values(value).every(value=>typeof value==='boolean'))
      else assert.ok(value===null||typeof value!=='object',`Mission fact ${key} needs independent copying`)
    }
    a.status='changed';a.flags.pistolOwned=!a.flags.pistolOwned
    assert.deepEqual(director.current(),expected)
  }
  check()
  director.event({type:'pistol-acquired'});director.checkpoint({player:{hp:100}});check()
  director.fail();check();director.retry();check();director.reset();check()
})
