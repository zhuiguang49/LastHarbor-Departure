import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parse } from '@babel/parser'
import { CH5_NATIVE_ADAPTERS } from './campaign-ch5-native-adapters.mjs'
import { CAMPAIGN_PLAYER_BRIDGE } from './campaign-player-state.mjs'

// Exact-version AST edits, never a bundle-wide text replacement. Output is ignored.
const root = new URL('../../', import.meta.url)
const bytes = await fs.readFile(new URL('几猫国产3A大作_V1-fable5.2.html', root))
const hash = createHash('sha256').update(bytes).digest('hex')
if (hash !== '9e55b5200b088adaf8e1152da04efc0d3b25e236e6baf2dee96f81e23e084966') throw Error('Source version changed')
const html = bytes.toString(), start = html.indexOf('<script>') + 8, end = html.lastIndexOf('</script>')
const code = html.slice(start, end), ast = parse(code), edits = []
const configs = {
  Mn: '{dir:new W(.916,.225,.331).normalize(),color:new Ve(.56,.69,1),intensity:.45}',
  en: '{zenith:new Ve(.012,.02,.038),horizon:new Ve(.05,.07,.095),horizonAway:new Ve(.022,.033,.05),fog:new Ve(.045,.06,.08)}',
}
// Only these audited text literals change; model/material generators stay intact.
const storyLabels = {
  l3: { '四号泊位':'七号泊位', '几猫北航':'紫金北航', '几猫远洋':'东岸远洋', '几猫太平洋':'海岬货运', '几猫联运':'紫金联运' },
  N3: { '几猫船用制冷':'紫金船用制冷' },
  qA: { '几猫04':'紫金07' },
  oR: { '几猫':'紫金港务' },
  z1: { '几猫04号':'紫金07号' },
  vb: { '几猫撤离艇':'紫金港务艇' },
  Eb: { '几猫撤离艇':'紫金港务艇', '几猫04号':'紫金07号' },
  QC: { '正在检查几猫制式步枪':'正在检查港区安保装备' },
  bM: { '几猫启动失败：':'末港启动失败：' },
  wA: { '几猫港区  B4-0271':'紫金港  B7-0271' },
  YA: { '几猫港区':'紫金港' },
  aR: { '四号泊位废物 ':'七号泊位废物 ' },
  cb: { '四号登船点':'七号登船点' },
  hR: { '四号泊位维修车间':'七号泊位维修车间' },
  Pb: { '四号泊位':'七号泊位' },
  TC: { '港务局装备 · 四号泊位武器库':'港务局装备 · 七号泊位武器库', '几猫兵工厂 · 港区装备':'紫金港务 · 安保装备' },
}
const labelCounts = new Map()
const menuCopy = {
  'aria-label="几猫"': 'aria-label="末港·今夜离港"',
  '<span class="m-tag">B4</span><span>几猫突击小队</span><span class="m-dim">几猫港区 · 05:42</span>': '<span class="m-tag">07</span><span>Last Harbor:Departure</span><span class="m-dim">紫金港 · 灾变第七日 · 23:47</span>',
  '几猫<span class="m-subtitle">3A大作</span>': '末港<span class="m-subtitle">·今夜离港</span>',
  '港区防御系统失控。切断三处中继，突破封锁，登船撤离。': '你是撤离行动中失联的港区应急技术人员。七号泊位还停着一艘工作艇。恢复供电，解除封锁，启动燃油系统，在天亮前离港。',
  '使用 Fable5.2 自主研发 · 国产第一人称射击游戏 · 开发体验版': '',
  '突击队员倒下': '幸存者倒下', '已切断中继': '已就绪设备',
  '四号泊位 · 行动简报': '七号泊位 · 行动简报', '几猫港区已解除封锁': '已驶离七号泊位',
  '几猫港区 · 四号泊位 · 05:42': '紫金港 · 第七封锁区 · 23:47',
  '几猫突击小队 · 单兵行动，无人支援': '2029.11.17 · 灾变第七日 · 暴雨持续中',
}
const menuCounts = new Map()
const campaign = 'new URLSearchParams(location.search).get("entry")==="campaign-m0"'
const campaignM1 = '["campaign-m1","campaign-m2","campaign-m3","campaign-m3-a0","campaign-m3-a1","campaign-m3-a2","campaign-m4-a0","campaign-m4-a1","campaign-m4","campaign-m5-a0","campaign-m5-a1","campaign-m5-b","campaign-m5-c"].includes(new URLSearchParams(location.search).get("entry"))'
const campaignAny = `(${campaign}||${campaignM1})`
const nearSkyline = (x,z) => `((${campaign}&&${x}<-40&&${z}>-28&&${z}<44)||(${campaignM1}&&(${z}<-30||${x}<-40&&${z}<14)))`
const campaignEdits = new Set()
function campaignEdit(node, name, original, value) {
  if (code.slice(node.start, node.end) !== original || campaignEdits.has(name)) throw Error(`Campaign boundary changed: ${name}`)
  campaignEdits.add(name)
  edits.push({ name:`campaign.${name}`, start:node.start, end:node.end, value })
}
function campaignTextEdit(node, name, replacements) {
  const original = code.slice(node.start, node.end)
  let value = original
  for (const [before, after] of replacements) {
    if (value.split(before).length !== 2) throw Error(`Campaign text boundary changed: ${name} / ${before}`)
    value = value.replace(before, after)
  }
  campaignEdit(node, name, original, value)
}

function visit(node, scope = '') {
  if (!node || typeof node !== 'object') return
  if (node.type === 'FunctionDeclaration') scope = node.id?.name || scope
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'zy') {
    // Radeon APUs need the same starting budget as Intel integrated graphics.
    // Preserve explicit presets and dedicated Radeon RX mobile GPUs.
    campaignTextEdit(node, 'integratedGPUQuality', [[
      '/Intel/i.test(t)&&!/Arc/i.test(t)?Pr.medium:Pr.high',
      String.raw`(/Intel/i.test(t)&&!/Arc/i.test(t)||/\bRadeon(?:\s*\(TM\)|™)?\s+(?:[678]\d0M\b|Graphics\b)/i.test(t))?Pr.medium:Pr.high`,
    ]])
  }
  if (node.type === 'VariableDeclarator' && node.id?.name === 'pE') {
    // Native lights_fragment_begin calls PBR even when the spot contributes
    // zero radiance. Keep all light slots and their original attenuation/shadows;
    // skip only that zero contribution in the CH5 campaign build.
    const original = code.slice(node.init.start,node.init.end)
    const begin = original.indexOf('#if ( NUM_SPOT_LIGHTS > 0 )'), end = original.indexOf('#if ( NUM_DIR_LIGHTS > 0 )',begin)
    const block = original.slice(begin,end), call = 'RE_Direct( directLight,'
    if (begin < 0 || end < begin || block.split(call).length !== 2) throw Error('Spotlight shader boundary changed')
    const optimized = original.slice(0,begin) + block.replace(call,'if ( directLight.visible ) ' + call) + original.slice(end)
    campaignEdit(node.init,'spotLightWork',original,`(["campaign-m5-a0","campaign-m5-a1","campaign-m5-b","campaign-m5-c"].includes(new URLSearchParams(location.search).get("entry"))?${optimized}:${original})`)
  }
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'x_') {
    const result = node.body.body.at(-1)
    if (result.type !== 'ReturnStatement' || code.slice(result.start,result.end) !== 'return C') throw Error('Player checkpoint boundary changed')
    edits.push({name:'x_.campaignMotion',start:result.start,end:result.start,value:CAMPAIGN_PLAYER_BRIDGE})
  }
  if (node.type === 'FunctionDeclaration') {
    const adapter=CH5_NATIVE_ADAPTERS.find(a=>a.scope===node.id?.name)
    if(adapter)campaignTextEdit(node,adapter.name,adapter.replacements)
  }
  if (scope === 'fR' && node.type === 'CallExpression' && node.arguments[0]?.value === 'gate_arm') campaignEdit(node.arguments[4], 'entranceArm', '{seed:2}', `(${campaignAny}?{seed:2,open:1}:{seed:2})`)
  if (scope === 'fR' && node.type === 'CallExpression' && node.arguments[0]?.value === 'jersey_barrier' && code.slice(node.arguments[1].start,node.arguments[1].end) === '-34.7') campaignEdit(node.arguments[3], 'entranceBarrier', 'ts+.08', `(${campaignAny}?0:ts+.08)`)
  if (scope === 'Mb' && node.type === 'ArrayExpression' && code.slice(node.start,node.end) === '[-182,40,110]') campaignEdit(node, 'westernBackdropBuilding', '[-182,40,110]', `(${campaign}?[-182,80,70]:[-182,40,110])`)
  // The native skyline has only faces visible from the old harbor. Remove its
  // newly near-field rows, consuming the same RNG values to retain far scenery.
  if (scope === 'y' && node.type === 'VariableDeclaration' && code.slice(node.start,node.end).startsWith('let Z=yb[Math.floor(s()*yb.length)]')) {
    const original = code.slice(node.start,node.end)
    campaignEdit(node, 'nearSkylineRows', original, `${original};if(${nearSkyline('ue','B')})continue;`)
  }
  if (scope === 'y' && node.type === 'VariableDeclarator' && node.id?.name === 'ne' && code.slice(node.init.start,node.init.end) === '(re,$)=>re>=0&&re<F.length&&$>=0&&$<D.length?X[re][$]:0') {
    campaignEdit(node.init, 'skylineNeighbors', '(re,$)=>re>=0&&re<F.length&&$>=0&&$<D.length?X[re][$]:0', `(re,$)=>re>=0&&re<F.length&&$>=0&&$<D.length?(${nearSkyline('D[$]','F[re].z')}?0:X[re][$]):0`)
  }
  if (scope === 'y' && node.type === 'VariableDeclarator' && node.id?.name === 've' && code.slice(node.init.start,node.init.end) === '!K&&!(Y(me+1,me)&&ne($,me+1)>L)') campaignEdit(node.init, 'skylineWestFaces', '!K&&!(Y(me+1,me)&&ne($,me+1)>L)', `(!K||${campaignAny})&&!(Y(me+1,me)&&ne($,me+1)>L)`)
  // These distant, non-colliding skyline structures occupy the new playable
  // footprints. Omit whole structures, preserving the original RNG sequence.
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'S' && code.slice(node.start,node.end).startsWith('function S(D,C,G,j,N){let K=G,')) campaignTextEdit(node, 'northBackdropCranes', [
    ['let K=G,', `if(${campaignM1}&&(C<-30||D<-40&&C<14)){s();return}let K=G,`],
  ])
  if (scope === 'Mb' && node.type === 'ForOfStatement' && node.right.type === 'ArrayExpression') {
    const original = code.slice(node.body.start,node.body.end), list = code.slice(node.right.start,node.right.end)
    const rule = list.startsWith('[[-67.5,-22,32]') ? ['northBackdropMasts', 'C<-30||D<-40&&C<14', '']
      : list.startsWith('[[-158,-30,62]') ? ['northBackdropTowers', 'C<0', 's();']
        : list.startsWith('[[-178,-70,90]') ? ['northBackdropWarehouses', 'C<0', ''] : null
    if (rule) campaignEdit(node.body, rule[0], original, `{if(${campaignM1}&&(${rule[1]})){${rule[2]}continue;}${original.slice(1)}`)
  }
  if (scope === 'Mb' && node.type === 'ArrowFunctionExpression' && code.slice(node.start,node.end).startsWith('([D,C,G,j],N)=>{let Q=mb(')) campaignTextEdit(node, 'northBackdropQuayCranes', [
    ['{let Q=mb(', `{if(${campaignM1}&&D<0)return;let Q=mb(`],
  ])
  // A ship authored for the old distant skyline becomes a near-field slab at
  // Berth 5. Keep that proxy offshore; playable near-field uses full factories.
  if (scope === 'Mb' && node.type === 'CallExpression' && code.slice(node.start,node.end) === 'q(34,58,-360,-205,10,[.2,.08,.07],.2)') campaignEdit(node, 'northOffshoreBackdrop', 'q(34,58,-360,-205,10,[.2,.08,.07],.2)', `q(${campaignM1}?130:34,${campaignM1}?154:58,-360,-205,10,[.2,.08,.07],.2)`)
  if (node.type === 'VariableDeclarator' && node.id?.name === 'Sb') {
    const original = code.slice(node.init.start,node.init.end)
    campaignEdit(node.init, 'westernPuddles', original, `(${original}.concat(${campaign}?[[-225,8,7,1.4,.38],[-175,8,6,1.8,.36],[-125,8,7,1.4,.4],[-75,8,6,1.6,.38]]:[]))`)
  }
  if (node.type === 'VariableDeclarator' && node.id?.name === 'Ya') campaignEdit(node.init, 'navOrigin', '-40', `(${campaignM1}?-164:${campaign}?-240:-40)`)
  if (node.type === 'VariableDeclarator' && node.id?.name === 'ol') campaignEdit(node.init, 'navOriginZ', '-32', `(${campaignM1}?-344:-32)`)
  if (node.type === 'VariableDeclarator' && node.id?.name === 'Li') campaignEdit(node.init, 'wetMaskDomain', '{x0:-44,z0:-40,size:80}', `(${campaignM1}?{x0:-164,z0:-360,size:200,height:400}:${campaign}?{x0:-244,z0:-40,size:280,height:80}:{x0:-44,z0:-40,size:80})`)
  if (scope === 'O1' && node.type === 'VariableDeclarator' && node.id?.name === 'n') campaignEdit(node.init, 'wetMaskResolution', 'e?1024:512', `(${campaignM1}?(e?2560:1280):${campaign}?(e?3584:1792):(e?1024:512))`)
  // Keep the native procedural field, bicubic filter and metres/texel. The
  // rectangle changes storage/UV axes only; legacy remains an 80m square.
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'Rb') campaignTextEdit(node, 'wetMaskRows', [
    ['let e=new Uint8Array(i*i*4)', 'let height=Math.round(i*(Li.height||Li.size)/Li.size),e=new Uint8Array(i*height*4)'],
    ['for(let r=0;r<i;r++)', 'for(let r=0;r<height;r++)'],
  ])
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'U1') campaignTextEdit(node, 'wetMaskCPU', [
    ['let o=(t-Li.x0)/Li.size*e-.5,r=(n-Li.z0)/Li.size*e-.5', 'let height=Math.round(e*(Li.height||Li.size)/Li.size),o=(t-Li.x0)/Li.size*e-.5,r=(n-Li.z0)/(Li.height||Li.size)*height-.5'],
    ['r=r<0?0:r>e-1.001?e-1.001:r', 'r=r<0?0:r>height-1.001?height-1.001:r'],
  ])
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'N1') campaignTextEdit(node, 'wetMaskTextureHeight', [
    ['{repeat:t=!0,aniso:n=1}={}', '{repeat:t=!0,aniso:n=1,height:h=e}={}'],
    ['new ui(i,e,e,_n,yi)', 'new ui(i,e,h,_n,yi)'],
  ])
  if (scope === 'O1' && node.type === 'VariableDeclarator' && node.id?.name === 'o') campaignEdit(node.init, 'wetMaskTexture', 'N1(s,n,{repeat:!1,aniso:2})', 'N1(s,n,{repeat:!1,aniso:2,height:Math.round(n*(Li.height||Li.size)/Li.size)})')
  if (scope === 'O1' && node.type === 'VariableDeclarator' && node.id?.name === 'm') campaignTextEdit(node.init, 'wetMaskBounds', [['E<Li.z0+Li.size', 'E<Li.z0+(Li.height||Li.size)']])
  if (scope === 'Ib' && node.type === 'ObjectProperty' && node.key?.name === 'uMaskRes') campaignEdit(node.value, 'wetMaskUniformSize', '{value:e.mask.image.width}', '{value:new Ae(e.mask.image.width,e.mask.image.height)}')
  if (['Ib','Nb'].includes(scope) && node.type === 'NewExpression' && code.slice(node.start,node.end) === 'new W(Li.x0,Li.z0,1/Li.size)') campaignEdit(node, `wetMaskRect${scope}`, 'new W(Li.x0,Li.z0,1/Li.size)', 'new Dt(Li.x0,Li.z0,1/Li.size,1/(Li.height||Li.size))')
  if (node.type === 'VariableDeclarator' && node.id?.name === 'TR') campaignTextEdit(node.init, 'wetMaskShaderTypes', [
    ['uMarkRes, uMaskRes;', 'uMarkRes; uniform vec2 uMaskRes;'],
    ['uniform vec3 uMaskRect;', 'uniform vec4 uMaskRect;'],
    ['vec4 gBicubic(sampler2D t, vec2 uv, float res)', 'vec4 gBicubic(sampler2D t, vec2 uv, vec2 res)'],
  ])
  if (node.type === 'VariableDeclarator' && node.id?.name === 'AR') campaignTextEdit(node.init, 'wetMaskShaderUV', [
    ['* uMaskRect.z;', '* uMaskRect.zw;'],
    ['float mIn = smoothstep(0.0, 0.05, min(min(muv.x, 1.0 - muv.x), min(muv.y, 1.0 - muv.y)));', 'vec2 edgeM = min(muv, vec2(1.0) - muv) / uMaskRect.zw;\n  float mIn = smoothstep(0.0, 4.0, min(edgeM.x, edgeM.y));'],
    ['gBicubic(uMarks, kuv, uMarkRes)', 'gBicubic(uMarks, kuv, vec2(uMarkRes))'],
  ])
  if (node.type === 'VariableDeclarator' && node.id?.name === 'UR') campaignTextEdit(node.init, 'wetMaskSplashUV', [
    ['uniform vec3 uSunDir, uSunCol, uAmb, uMaskRect;', 'uniform vec3 uSunDir, uSunCol, uAmb; uniform vec4 uMaskRect;'],
    ['* uMaskRect.z;', '* uMaskRect.zw;'],
  ])
  if (scope === 'Ib' && node.type === 'VariableDeclarator' && node.id?.name === 's') campaignEdit(node.init, 'apronExtent', 'new rn(190,320,1,1).rotateX(-Math.PI/2).translate(-65,0,0)', `(${campaignM1}?new rn(194,520,1,1).rotateX(-Math.PI/2).translate(-67,0,-100):${campaign}?new rn(274,320,1,1).rotateX(-Math.PI/2).translate(-107,0,0):new rn(190,320,1,1).rotateX(-Math.PI/2).translate(-65,0,0))`)
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'kb') campaignTextEdit(node, 'northCoastalSurface', [
    ['s.map(M=>-M).reverse().concat(gv(-48+.9,48-.9,.9,1,.9),s.slice(0))', `(${campaignM1}?s.map(M=>-M-312).reverse().concat(gv(-360+.9,48-.9,.9,1,.9),s.slice(0)):s.map(M=>-M).reverse().concat(gv(-48+.9,48-.9,.9,1,.9),s.slice(0)))`],
    ['y={uTime:{value:0}', `y={uCoastRange:{value:new Ae(${campaignM1}?-340:0,${campaignM1}?30:0)},uTime:{value:0}`],
    ['`uniform float uTime;', '`uniform vec2 uCoastRange; uniform float uTime;'],
    ['distance(swp.xz, vec2(30.0, 0.0))', 'distance(swp.xz, vec2(30.0, clamp(swp.z, uCoastRange.x, uCoastRange.y)))'],
    ['new rn(320,4.4).rotateY(Math.PI/2).translate(29.88,-2.18,0)', `(${campaignM1}?new rn(520,4.4).rotateY(Math.PI/2).translate(29.88,-2.18,-100):new rn(320,4.4).rotateY(Math.PI/2).translate(29.88,-2.18,0))`],
  ])
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'Lb') campaignTextEdit(node, 'northCoastalHeight', [
    ['Math.hypot(i-30,e)', `Math.hypot(i-30,e-(${campaignM1}?pi(e,-340,30):0))`],
  ])
  if (node.type === 'CallExpression' && code.slice(node.start,node.end) === 'Oe.sea.setPos([33,-1,pi(re.z,-28,26)])') campaignEdit(node, 'northCoastalAudio', 'Oe.sea.setPos([33,-1,pi(re.z,-28,26)])', `Oe.sea.setPos([33,-1,${campaignM1}?pi(re.z,-340,30):pi(re.z,-28,26)])`)
  // Expose audited native placement/batching and pure robot visual blueprints.
  if (node.type === 'AssignmentExpression' && code.slice(node.left.start, node.left.end) === 'window.__G') {
    if (code.slice(node.start, node.end) !== 'window.__G=t') throw Error('Runtime visual adapter boundary changed')
    edits.push({ name:'aftermath.visualFactory', start:node.start, end:node.end,
      value:'(window.__G=t,t.campaignFactories={context:()=>ob(t),merge:By,warehouse:context=>ab(context),crane:builder=>z1(t,builder)},t.robotVisuals={create(kind,materials){if(kind!=="hound"&&kind!=="gull")throw Error("Unknown robot visual");const definition=kind==="hound"?Z_():j_();return {...pm(definition,materials,{radius:3,center:[0,0,0]}),definition}}},t)' })
  }
  const label = node.type === 'StringLiteral' && storyLabels[scope]?.[node.value]
  if (label) {
    const name = `story.${scope}.${node.value}`
    labelCounts.set(name, (labelCounts.get(name) || 0) + 1)
    edits.push({name, start:node.start, end:node.end, value:`(new URLSearchParams(location.search).get('play')==='1'?${JSON.stringify(label)}:${code.slice(node.start,node.end)})`})
  }
  if (scope === 'pM' && node.type === 'TemplateElement') {
    let value = code.slice(node.start, node.end)
    for (const [before, after] of Object.entries(menuCopy)) {
      if (!value.includes(before)) continue
      if (value.split(before).length !== 2) throw Error(`Menu identity boundary ambiguous: ${before}`)
      value = value.replace(before, after)
      menuCounts.set(before, (menuCounts.get(before) || 0) + 1)
    }
    if (value.includes('<h3>几猫3A大作</h3>')) {
      const from = value.indexOf('<h3>几猫3A大作</h3>'), to = value.indexOf('</div>', from)
      if (to < from) throw Error('About identity boundary changed')
      value = value.slice(0, from) + '<h3>末港·今夜离港</h3><p>2029 年，紫金港。灾变第七日，一名失联的应急技术员试图在天亮前离港。</p><p>一款设定于暴雨工业港口的五章第一人称生存恐怖游戏。在感染者与敌对安保力量之间穿行，重启港务设施，寻找最后一艘工作艇。</p>\n      ' + value.slice(to)
    }
    if (value !== code.slice(node.start, node.end)) edits.push({ name:'identity.menu', start:node.start, end:node.end, value })
  }
  if (node.type === 'VariableDeclarator' && node.id?.name === 'mi') {
    const name = node.init?.properties?.find(p => p.key?.name === 'name')?.value
    if (name?.value !== '几猫九式突击步枪') throw Error('Weapon name boundary changed')
    edits.push({ name:'identity.rifleName', start:name.start, end:name.end, value:JSON.stringify('安保突击步枪') })
  }
  if (scope === 'u_' && node.type === 'CallExpression' && node.callee?.name === 'ln' && node.arguments[0]?.value === 'weapon:fire') {
    const callback = node.arguments[1], audio = '{variant:I,gain:1,jitter:.012}'
    const original = code.slice(callback.start, callback.end)
    if (callback.type !== 'ArrowFunctionExpression' || callback.params.length || !original.startsWith('()=>') || original.split(audio).length !== 2) throw Error('Weapon audio boundary changed')
    edits.push({ name:'audio.pistol', start:callback.start, end:callback.end,
      value:('(event)' + original.slice(2)).replace(audio, "(event?.weapon==='pistol'?{variant:I,pitch:1.36,gain:.62*10**(6/20),jitter:.006}:{variant:I,gain:10**(6/20),jitter:.012})") })
  }
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'u_') {
    const result = node.body.body.at(-1), original = code.slice(result.start,result.end)
    if (result.type !== 'ReturnStatement' || !original.startsWith('return Object.assign(Re,{ctx:e,') || !original.endsWith('}),Re')) throw Error('Original audio mixer return changed')
    edits.push({ name:'audio.meleeBus', start:result.start, end:result.start, value:'Re.meleeBus=H.near;' })
  }
  if (scope === 'u_' && node.type === 'CallExpression' && node.callee?.name === 'ln' && node.arguments[0]?.value === 'impact') {
    const callback = node.arguments[1]
    if (callback.type !== 'ArrowFunctionExpression' || callback.params[0]?.name !== 'te' || !code.slice(callback.start,callback.end).startsWith('te=>{let he=e.currentTime;')) throw Error('Impact audio boundary changed')
    edits.push({ name:'audio.knifeImpact', start:callback.body.start+1, end:callback.body.start+1, value:'if(te.weapon==="knife")return;if(["infected","sniper","clearance"].includes(te.enemy?.type)){ze("impact_rubber",{pos:Hn(te.point),gain:.65,jitter:.03});return;}' })
  }
  if (scope === 'Cf' && node.type === 'CallExpression' && node.arguments[0]?.value === 'impact') {
    const callback=node.arguments[1]
    if (code.slice(callback.start,callback.end) !== 'ee=>{!ee||!ee.point||C(ee.point,ee.normal,ee.surface,ee.dir,ee.enemy)}') throw Error('Native impact FX boundary changed')
    edits.push({name:'character.impactFX',start:callback.body.start+1,end:callback.body.start+1,value:'if(["infected","sniper","clearance"].includes(ee?.enemy?.type))return;'})
  }
  if (scope === 'u_' && node.type === 'CallExpression' && node.arguments[0]?.value === 'enemy:killed') {
    const callback=node.arguments[1]
    if (!code.slice(callback.start,callback.end).startsWith('te=>{let he=te.enemy,')) throw Error('Native enemy death audio boundary changed')
    edits.push({name:'character.deathAudio',start:callback.body.start+1,end:callback.body.start+1,value:'if(["infected","sniper","clearance"].includes(te.type||te.enemy?.type))return;'})
  }
  if (scope === 'hM' && node.type === 'CallExpression' && node.arguments[0]?.value === 'enemy:killed') {
    const callback=node.arguments[1]
    if (!code.slice(callback.start,callback.end).startsWith('k=>{let ce=({gull:')) throw Error('Native kill feed boundary changed')
    edits.push({name:'character.killFeed',start:callback.body.start+1,end:callback.body.start+1,value:'if(["infected","sniper","clearance"].includes(k.type||k.enemy?.type)){fe=I.feed((k.type||k.enemy?.type)==="sniper"?"<b>狙击手</b> 已击倒":(k.type||k.enemy?.type)==="clearance"?"<b>清场人员</b> 已击倒":"<b>感染者</b> 已击倒");le=i.time.frame;return;}'})
  }
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'mM') {
    const interact = node.body.body.find(n => n.type === 'FunctionDeclaration' && n.id?.name === 'ue')
    if (!interact || interact.params[0]?.name !== 'P') throw Error('Interaction adapter boundary changed')
    edits.push({ name:'mM.ue', start:interact.body.start+1, end:interact.body.start+1,
      value:'if(window.__lastHarborCampaign){window.__lastHarborCampaign.interact(P);return;}if(window.__lastHarborSystems){window.__lastHarborSystems.update(P,ee);return;}' })
    const reset = node.body.body.find(n => n.type === 'FunctionDeclaration' && n.id?.name === 'H')
    if (!reset || reset.params.length) throw Error('New-run reset boundary changed')
    edits.push({ name:'mM.reset', start:reset.body.end-1, end:reset.body.end-1,
      value:';window.__lastHarborSystems?.reset();window.__lastHarborReinforcements?.reset();window.__lastHarborCampaign?.reset();' })
    const deploy = node.body.body.find(n => n.type === 'FunctionDeclaration' && n.id?.name === 'U')
    if (!deploy) throw Error('Deployment boundary changed')
    edits.push({ name:'mM.ready', start:deploy.body.start+1, end:deploy.body.start+1,
      value:'if(new URLSearchParams(location.search).get("play")==="1"&&!window.__lastHarborNarrative){window.__lastHarborPendingStart=()=>U({skipIntro:P,quick:V,keepRetries:Y});return;}if(window.__lastHarborCampaign?.prepareReset?.(Y))P=true;' })
  }
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'dm') {
    const result = node.body.body.at(-1)
    if (result.type !== 'ReturnStatement' || code.slice(result.start,result.end) !== 'return _e(),ve') throw Error('Weapon adapter boundary changed')
    edits.push({ name:'dm.equipmentView', start:result.start, end:result.start,
      value:'ve.equipmentView={hands:[A,q],firearm:e.children.filter(o=>o!==A&&o!==q&&o!==x),effects:[x],createGripHand(options){return Vv(options).fabric},gloveMaterial:_,setTrigger(amount){z(amount)},cancelActions(){k.adsLin=k.adsE=0;k.reload=null;k.autoReload=-1;k.inspect=-1;k.idleT=0}};' })
  }
  if (node.type === 'VariableDeclarator' && node.id?.name === '_l') {
    const original = code.slice(node.init.start,node.init.end)
    const radio = {intro:'这里是紫金港七号泊位……如果还有人能听到……不要相信广播。［信号中断］',contact:'港区自动警卫仍在活动。避开巡逻，寻找掩体。',cut:[],all:'离港联锁就绪。前往七号泊位。',low:'伤势严重，寻找掩体恢复。',done:'工作艇已驶离七号泊位。外界情况仍然未知。'}
    edits.push({name:'_l',start:node.init.start,end:node.init.end,value:`(new URLSearchParams(location.search).get('play')==='1'?${JSON.stringify(radio)}:${original})`})
  }
  if (scope === 'mM' && node.type === 'VariableDeclarator' && node.id?.name === '_' && node.init?.type === 'ObjectExpression') {
    if (!node.init.properties.some(p => p.key?.name === 'start')) throw Error('Game adapter boundary changed')
    edits.push({ name:'mM.skipIntro', start:node.init.start+1, end:node.init.start+1,
      value:'completeCampaign(){if(_.state!=="playing"||!window.__lastHarborCampaign?.chapter5?.ending?.canFinish())return false;ee();o.clearRadio();e.fade=1;l.show("complete");return true},skipIntro(){if(_.state!=="intro")return false;l.locationCard(false);e.fade=0;T();return true},' })
  }
  if (scope === 'mM' && node.type === 'LogicalExpression' && code.slice(node.start,node.end) === '_.state==="playing"&&g&&G()') {
    // Manual CH1 dialogue releases pointer lock while the original loop still
    // renders the guard scan. Normal lock loss retains native pause behavior.
    edits.push({ name:'mM.manualDialogue', start:node.start, end:node.end,
      value:'_.state==="playing"&&!Yi.manualDialogue&&g&&G()' })
  }
  if (scope === 'B' && node.type === 'SwitchCase' && node.test?.value === 'intro') {
    if (node.consequent.length !== 1 || node.consequent[0].type !== 'ReturnStatement') throw Error('Intro state boundary changed')
    edits.push({ name:'mM.manualIntro', start:node.consequent[0].start, end:node.consequent[0].start,
      value:'if(Yi.manualIntro){e.fade=kn(e.fade||0,0,6,P);return true;}' })
  }
  if (node.type === 'VariableDeclarator' && node.id?.name === 'H6') {
    let shader = code.slice(node.init.start, node.init.end)
    const disk = 'col += vec3(1.0, 0.80, 0.52) * disk * 110.0 * veil * (1.0 - uEnv);'
    const output = 'gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);'
    if (shader.split(disk).length !== 2 || shader.split(output).length !== 2) throw Error('Sky patch anchors changed')
    shader = shader.replace(disk, 'col += vec3(0.42, 0.58, 0.85) * disk * 0.6 * veil * (1.0 - uEnv);')
    shader = shader.replace(output, 'col *= vec3(0.045, 0.065, 0.10);\n  ' + output)
    edits.push({ name: 'H6', start: node.init.start, end: node.init.end, value: shader })
  }
  if (node.type === 'VariableDeclarator' && configs[node.id?.name]) {
    edits.push({ name: node.id.name, start: node.init.start, end: node.init.end, value: configs[node.id.name] })
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc') continue
    if (Array.isArray(value)) value.forEach(child => visit(child, scope))
    else if (value && typeof value === 'object') visit(value, scope)
  }
}
visit(ast)
if (campaignEdits.size !== 37) throw Error(`Missing campaign adapters: ${campaignEdits.size}`)
if (new Set(edits.filter(e => !e.name.startsWith('story.')).map(e => e.name)).size !== 58 || edits.filter(e => e.name === 'identity.menu').length !== 2) throw Error('Ambiguous adaptation boundaries')
for (const name of new Set(edits.filter(e => !e.name.startsWith('story.')).map(e => e.name))) {
  if (edits.filter(e => e.name === name).length !== (name === 'identity.menu' ? 2 : 1)) throw Error(`Duplicate adapter: ${name}`)
}
for (const label of Object.keys(menuCopy)) if (menuCounts.get(label) !== 1) throw Error(`Menu identity boundary changed: ${label}`)
for (const [scope, labels] of Object.entries(storyLabels)) for (const original of Object.keys(labels)) {
  if (labelCounts.get(`story.${scope}.${original}`) !== (['Pb', 'vb'].includes(scope) ? 2 : 1)) throw Error(`Story label boundary changed: ${scope}`)
}
let derived = code
for (const edit of edits.sort((a, b) => b.start - a.start)) derived = derived.slice(0, edit.start) + edit.value + derived.slice(edit.end)
parse(derived)
let shell = html.slice(0, start)
for (const [original, replacement] of [
  ['<title>几猫3A大作</title>', '<title>末港·今夜离港 | Last Harbor:Departure</title>'],
  ['<div class="boot-mark">几猫</div>', '<div class="boot-mark">末港</div>'],
  ['<div class="boot-sub" id="boot-msg">正在载入几猫港区</div>', '<div class="boot-sub" id="boot-msg">正在载入紫金港 · 23:47</div>'],
]) {
  if (shell.split(original).length !== 2) throw Error('Entry identity boundary changed')
  shell = shell.replace(original, replacement)
}
// Hold the branded loading shell until every gameplay addon has installed.
// This runs before the original bootstrap constructs or reveals its menu.
shell = shell.replace('<script>', '<style>.harbor-loading .menu{visibility:hidden}.harbor-loading #boot{display:flex!important;opacity:1!important;visibility:visible!important;pointer-events:auto}</style><script>if(new URLSearchParams(location.search).get("play")==="1")document.documentElement.classList.add("harbor-loading");')
const output = shell + derived + html.slice(end, end + 9) + '\n<script type="module" src="/local/night.mjs"></script>' + html.slice(end + 9)
await fs.mkdir(new URL('.local/last-harbor/', root), { recursive: true })
await fs.writeFile(new URL('.local/last-harbor/night.html', root), output)
await fs.writeFile(new URL('.local/last-harbor/night-manifest.json', root), JSON.stringify({ originalSha256: hash, derivedSha256: createHash('sha256').update(output).digest('hex'), edits, scope: 'Last Harbor: Departure' }, null, 2))
console.log('Built Last Harbor: Departure.')
