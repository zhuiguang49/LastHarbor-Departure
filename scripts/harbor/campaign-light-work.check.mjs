import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { parse } from '@babel/parser'

// Check the actual built shader selected by each entry, not a second patcher.
function shader(file,entry) {
  const html=fs.readFileSync(new URL(file,import.meta.url),'utf8')
  const source=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function Rb('))
  let expression
  function visit(node) {
    if(!node||typeof node!=='object')return
    if(node.type==='VariableDeclarator'&&node.id.name==='pE')expression=source.slice(node.init.start,node.init.end)
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value)
  }
  visit(parse(source));assert.ok(expression,'Native lights_fragment_begin boundary changed')
  return vm.runInNewContext(expression,{URLSearchParams,location:{search:`?entry=${entry}`}})
}
const original=shader('../../几猫国产3A大作_V1-fable5.2.html','')
const built=entry=>shader('../../.local/last-harbor/night.html',entry)

test('M5 skips PBR for zero-contribution spotlights, retaining all other native lighting expressions',()=>{
  const actual=built('campaign-m5-a0')
  assert.equal(built('campaign-m5-a1'),actual)
  const begin=actual.indexOf('#if ( NUM_SPOT_LIGHTS > 0 )'),end=actual.indexOf('#if ( NUM_DIR_LIGHTS > 0 )',begin)
  assert.ok(begin>=0&&end>begin)
  assert.match(actual.slice(begin,end),/if \( directLight\.visible \) RE_Direct\(/)
  assert.equal(actual.replace('if ( directLight.visible ) RE_Direct(','RE_Direct('),original)
})

test('legacy and previously accepted chapter entries retain the exact original lighting shader',()=>{
  for(const entry of ['legacy-sandbox','campaign-m0','campaign-m1','campaign-m2','campaign-m3','campaign-m4'])
    assert.equal(built(entry),original,entry)
})
