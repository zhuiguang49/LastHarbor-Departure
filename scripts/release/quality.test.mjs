import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { test } from 'node:test'
import { parse } from '@babel/parser'

// Exercise the picker actually shipped in the static game, with renderer strings
// reported by desktop WebGL. This does not measure frame rate on those devices.
const html=await fs.readFile(new URL('../../dist/last-harbor-night/index.html',import.meta.url),'utf8')
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match=>match[1]).find(text=>text.includes('function zy('))
const nodes=[]
function visit(node) {
  if(!node||typeof node!=='object')return
  if(node.type)nodes.push(node)
  for(const [key,value] of Object.entries(node)) {
    if(key==='loc')continue
    if(Array.isArray(value))value.forEach(visit)
    else if(value&&typeof value==='object')visit(value)
  }
}
visit(parse(code).program)
const preset=nodes.find(node=>node.type==='VariableDeclarator'&&node.id?.name==='Pr'&&node.init?.type==='ObjectExpression')
const picker=nodes.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='zy')
assert.ok(preset&&picker,'Expected native quality presets and picker')
const source=`const Pr=${code.slice(preset.init.start,preset.init.end)};${code.slice(picker.start,picker.end)};zy(requested)`
function select(renderer,requested='',userAgent='Windows NT 10.0') {
  const gl={getExtension(name){return name==='WEBGL_debug_renderer_info'?{UNMASKED_RENDERER_WEBGL:1}:{loseContext(){}}},getParameter(){return renderer}}
  return vm.runInNewContext(source,{requested,navigator:{userAgent,maxTouchPoints:0},screen:{width:2560,height:1600},document:{createElement(){return {getContext(){return gl}}}}})
}

test('automatic quality gives Radeon integrated GPUs the native medium preset',()=>{
  for(const renderer of ['ANGLE (AMD, AMD Radeon 780M Graphics, D3D11)','AMD Radeon(TM) 680M','AMD Radeon 760M Graphics','AMD Radeon(TM) Graphics']) {
    const quality=select(renderer)
    assert.equal(quality.name,'medium',renderer)
    assert.equal(quality.shadow,2048);assert.equal(quality.msaa,2)
  }
})

test('manual presets, dedicated GPUs and existing mobile/Intel choices retain their native settings',()=>{
  for(const name of ['low','medium','high','ultra','test']) assert.equal(select('AMD Radeon 780M Graphics',name).name,name)
  for(const gpu of ['AMD Radeon RX 6600M','AMD Radeon RX 6800 XT','NVIDIA GeForce RTX 4060','Apple M3']) assert.equal(select(gpu).name,'high',gpu)
  assert.equal(select('Intel Iris Xe Graphics').name,'medium')
  assert.equal(select('Intel Arc A770').name,'high')
  assert.equal(select('SwiftShader').name,'medium')
  assert.equal(select('Adreno','','Android').name,'low')
})
