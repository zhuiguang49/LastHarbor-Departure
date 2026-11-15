import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { parse } from '@babel/parser'

// Build first. Read the actual generated application; never import a duplicate
// implementation from the build script or depend on ignored audit extracts.
const root = new URL('../../', import.meta.url)
const originalBytes = fs.readFileSync(new URL('几猫国产3A大作_V1-fable5.2.html', root))
const originalHash = '9e55b5200b088adaf8e1152da04efc0d3b25e236e6baf2dee96f81e23e084966'
const derivedBytes = fs.readFileSync(new URL('.local/last-harbor/night.html', root))
const manifest = JSON.parse(fs.readFileSync(new URL('.local/last-harbor/night-manifest.json', root)))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const plain = value => JSON.parse(JSON.stringify(value))
const campaignRect = { x0: -244, z0: -40, size: 280, height: 80 }
const m1Rect = { x0: -164, z0: -360, size: 200, height: 400 }
const legacyRect = { x0: -44, z0: -40, size: 80 }
const addedPuddles = [[-225, 8, 7, 1.4, .38], [-175, 8, 6, 1.8, .36], [-125, 8, 7, 1.4, .4], [-75, 8, 6, 1.6, .38]]

function extract(bytes) {
  const scripts = [...bytes.toString().matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).filter(source => source.includes('function Rb('))
  assert.equal(scripts.length, 1, 'Expected one native application script')
  const source = scripts[0], ast = parse(source)
  const boot = ast.program.body.find(node => node.expression?.callee?.body?.type === 'BlockStatement')
  assert.ok(boot, 'Native application IIFE changed')
  const body = boot.expression.callee.body.body
  const declarations = new Map(body.flatMap(node => node.type === 'VariableDeclaration' ? node.declarations : [node])
    .filter(node => node.id?.name).map(node => [node.id.name, node]))
  const boundary = body.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === 'gM'))
  assert.ok(boundary, 'Native application boot boundary changed')
  const prefix = body.filter(node => node.end <= boundary.start).map(node => source.slice(node.start, node.end)).join('\n')
  const text = name => {
    const node = declarations.get(name)
    assert.ok(node, `Missing native declaration ${name}`)
    return source.slice(node.start, node.end)
  }
  // Instrument only the two loop headers, retaining the real allocation,
  // coordinate math, channel encoding and procedural field. Production-sized
  // buffers contain ONLY the selected pixels; never treat them as full masks.
  const rb = declarations.get('Rb'), outer = rb.body.body.find(node => node.type === 'ForStatement')
  const inner = outer?.body.body.find(node => node.type === 'ForStatement')
  assert.ok(outer && inner, 'Native Rb loop structure changed')
  let sampled = text('Rb')
  for (const [loop, selection] of [[inner, '__columns'], [outer, '__rows']]) {
    const name = loop.init.declarations[0].id.name
    sampled = sampled.slice(0, loop.start - rb.start) + `for(let ${name} of ${selection})` + sampled.slice(loop.body.start - rb.start)
  }
  return { text, load(search) {
    return vm.runInNewContext(`(()=>{${prefix};return {THREE:lt,Li,Sb,Tb,ER,wR,SR,fs,fl,So,Rb,U1,N1,Ib,Nb,TR,AR,UR,oi,kb,Lb,Ya,ol,Ls,B1,
      sample(width,__rows,__columns){return (${sampled})(width)}}})()`,
    { console, performance, AbortController, URLSearchParams, location: { search } }, { timeout: 15000 })
  } }
}

const originalSource = extract(originalBytes), derivedSource = extract(derivedBytes)
const native = originalSource.load(''), legacy = derivedSource.load('?entry=legacy-sandbox')
const campaign = derivedSource.load('?entry=campaign-m0'), m1 = derivedSource.load('?entry=campaign-m1')
const heightAt = (rect, width) => Math.round(width * (rect.height || rect.size) / rect.size)
const near = (actual, expected, tolerance = 1e-12, label = '') =>
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected} (±${tolerance})`)

function fieldAt(x, z, extra = []) {
  let field = native.SR(x, z)
  for (const puddle of extra) {
    const a = ((x - puddle[0]) / (puddle[2] * native.Tb)) ** 2 + ((z - puddle[1]) / (puddle[3] * native.Tb)) ** 2
    if (a < 9) field -= (puddle[4] + native.ER) * Math.exp(-a * a)
  }
  return field
}

function referencePixel(x, z, extra = []) {
  const h = fieldAt(x, z, extra), { So, fs, fl, wR } = native
  return [So(.5 + (h - wR) * 2.5), So(.5 + (fs(x / 5.5, z / 5.5, 41, 3) - .5) * 1.5 + (.5 - h) * .9),
    So(fl(.6, .78, fs(x / 1.4, z / 1.4, 77, 4)) * fl(.47, .62, fs(x / 9, z / 9, 91, 2))),
    So(fs(x / 22, z / .9, 57, 3) * .6 + fs(x / 13, z / 13, 63, 3) * .4)].map(value => Math.round(value * 255))
}

// Independent texture2D base-level bilinear reference, including clamp-to-edge.
function textureSample(texture, u, v, channel) {
  const { data, width, height } = texture.image
  const x = Math.max(0, Math.min(width - 1, u * width - .5)), y = Math.max(0, Math.min(height - 1, v * height - .5))
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1)
  const at = (col, row) => data[(row * width + col) * 4 + channel] / 255
  return (at(x0, y0) * (1 - x + x0) + at(x1, y0) * (x - x0)) * (1 - y + y0)
    + (at(x0, y1) * (1 - x + x0) + at(x1, y1) * (x - x0)) * (y - y0)
}

function uniformFixture(api, width = 28, height = heightAt(api.Li, width)) {
  const mask = api.N1(new Uint8Array(width * height * 4), width, { repeat: false, height })
  const maps = { mask, marks: { image: { width: 64, height: 64 } }, detail: {}, detailN: {}, black: {} }
  const g = { quality: { rain: .15 }, rng: { fork: () => () => .5 } }
  const apron = api.Ib(g, maps), rain = api.Nb(g, maps)
  assert.ok(apron.uniforms.uMask.value.isDataTexture)
  return { apron, rain, mask, dispose() {
    for (const mesh of [apron.mesh, rain.rain, rain.splash]) { mesh.geometry.dispose(); mesh.material.dispose() }
    mask.dispose()
  } }
}

test('canonical original hash and generated manifest match the files under test', () => {
  assert.equal(sha(originalBytes), originalHash)
  assert.equal(manifest.originalSha256, originalHash)
  assert.equal(manifest.derivedSha256, sha(derivedBytes), 'Derived HTML/manifest mismatch; run npm run build')
})

test('campaign changes only the rectangle and the four audited puddles; square legacy stays native', () => {
  assert.deepEqual(plain(native.Li), legacyRect)
  assert.deepEqual(plain(legacy.Li), legacyRect)
  assert.deepEqual(plain(campaign.Li), campaignRect)
  assert.deepEqual(plain(legacy.Sb), plain(native.Sb))
  assert.deepEqual(plain(campaign.Sb), [...plain(native.Sb), ...addedPuddles])
  for (const name of ['SR', 'fs', 'Ab', 'F1', 'So', 'fl', 'Tb', 'ER', 'wR']) assert.equal(derivedSource.text(name), originalSource.text(name), `${name} procedural source changed`)
})

test('real Rb allocates rectangular RGBA bytes and encodes every pixel at equal x/z metres per texel', () => {
  for (const [api, rect, extra] of [[legacy, legacyRect, []], [campaign, campaignRect, addedPuddles]]) {
    const width = 112, height = heightAt(rect, width), data = api.Rb(width), step = rect.size / width
    assert.equal(data.BYTES_PER_ELEMENT, 1)
    assert.equal(data.length, width * height * 4)
    for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
      const x = rect.x0 + (col + .5) * step, z = rect.z0 + (row + .5) * step, offset = (row * width + col) * 4
      near(api.SR(x, z), fieldAt(x, z, extra), 1e-12, 'procedural height')
      assert.deepEqual(Array.from(data.subarray(offset, offset + 4)), referencePixel(x, z, extra), `pixel ${col},${row}`)
    }
    near((rect.height || rect.size) / height, step)
  }
  assert.deepEqual(Array.from(legacy.Rb(32)), Array.from(native.Rb(32)))
})

test('sampled production rows retain native legacy and old-port campaign sampling at high and low', t => {
  let compared = 0, maxFieldDelta = 0, maxByteDelta = 0
  for (const nativeWidth of [512, 1024]) {
    const width = nativeWidth * 3.5, shift = width - nativeWidth
    const middleRow = Math.floor(nativeWidth * .6)
    const rows = [0, 1, middleRow, middleRow + 1, nativeWidth - 2, nativeWidth - 1]
    const columns = [0, 1, nativeWidth / 4, nativeWidth / 4 + 1, nativeWidth / 2, nativeWidth / 2 + 1, nativeWidth - 2, nativeWidth - 1]
    const expected = native.sample(nativeWidth, rows, columns), square = legacy.sample(nativeWidth, rows, columns)
    const rectangle = campaign.sample(width, rows, columns.map(col => col + shift))
    assert.equal(rectangle.length, width * nativeWidth * 4)
    near(campaignRect.size / width, legacyRect.size / nativeWidth)
    near(campaignRect.height / nativeWidth, legacyRect.size / nativeWidth)
    for (const row of rows) for (const col of columns) {
      const x = legacyRect.x0 + (col + .5) * legacyRect.size / nativeWidth, z = legacyRect.z0 + (row + .5) * legacyRect.size / nativeWidth
      const delta = Math.abs(fieldAt(x, z, addedPuddles) - native.SR(x, z))
      maxFieldDelta = Math.max(maxFieldDelta, delta)
      const pixel = referencePixel(x, z, addedPuddles)
      for (let channel = 0; channel < 4; channel++) {
        const index = (row * nativeWidth + col) * 4 + channel, rectIndex = (row * width + col + shift) * 4 + channel
        assert.equal(square[index], expected[index], 'Legacy sampled byte changed')
        assert.equal(rectangle[rectIndex], pixel[channel], 'Campaign sampled pixel/stride changed')
        // Quantization can differ by one byte even for a tiny smooth-field tail.
        const tolerance = channel < 2 ? Math.ceil(255 * delta * (channel === 0 ? 2.5 : .9)) : 0
        const byteDelta = Math.abs(rectangle[rectIndex] - expected[index])
        assert.ok(byteDelta <= tolerance, `Old port channel ${channel} differs by ${byteDelta}, limit ${tolerance}`)
        maxByteDelta = Math.max(maxByteDelta, byteDelta)
        compared++
      }
    }
    // Both neighbours are present in the selected rows/columns. Query actual
    // U1 at non-centre positions to check production strides, not just bytes.
    for (const col of [nativeWidth / 4, nativeWidth / 2]) for (let channel = 0; channel < 4; channel++) {
      const step = legacyRect.size / nativeWidth, x = legacyRect.x0 + (col + .87) * step, z = legacyRect.z0 + (middleRow + .73) * step
      const expectedValue = native.U1(expected, nativeWidth, x, z, channel)
      let tolerance = 0
      for (const row of [middleRow, middleRow + 1]) for (const neighbour of [col, col + 1]) {
        const px = legacyRect.x0 + (neighbour + .5) * step, pz = legacyRect.z0 + (row + .5) * step
        const delta = Math.abs(fieldAt(px, pz, addedPuddles) - native.SR(px, pz))
        if (channel < 2) tolerance = Math.max(tolerance, Math.ceil(255 * delta * (channel === 0 ? 2.5 : .9)) / 255)
      }
      near(legacy.U1(square, nativeWidth, x, z, channel), expectedValue, 1e-12, 'Legacy production U1')
      near(campaign.U1(rectangle, width, x, z, channel), expectedValue, tolerance + 1e-12, 'Old-port production U1')
    }
  }
  t.diagnostic(JSON.stringify({ comparedBytes: compared, maxFieldDelta, maxByteDelta }))
})

test('N1 honors optional height, real DataTexture byte counts and native square defaults', () => {
  for (const api of [legacy, campaign, m1]) {
    const data = new Uint8Array(28 * 8 * 4), rect = api.N1(data, 28, { height: 8, repeat: false, aniso: 2 })
    const square = api.N1(new Uint8Array(7 * 7 * 4), 7)
    assert.equal(rect.image.data, data)
    assert.deepEqual([rect.image.width, rect.image.height, rect.image.data.byteLength], [28, 8, 896])
    assert.equal(rect.wrapS, api.THREE.ClampToEdgeWrapping)
    assert.equal(rect.wrapT, api.THREE.ClampToEdgeWrapping)
    assert.equal(rect.magFilter, api.THREE.LinearFilter)
    assert.equal(rect.minFilter, api.THREE.LinearMipmapLinearFilter)
    assert.equal(rect.generateMipmaps, true)
    assert.equal(rect.anisotropy, 2)
    assert.equal(rect.flipY, false)
    assert.equal(rect.format, api.THREE.RGBAFormat)
    assert.equal(rect.type, api.THREE.UnsignedByteType)
    assert.deepEqual([square.image.width, square.image.height], [7, 7])
    assert.equal(square.wrapS, api.THREE.RepeatWrapping)
    assert.equal(square.wrapT, api.THREE.RepeatWrapping)
    rect.dispose(); square.dispose()
  }
})

test('U1 matches texture bilinear sampling and never crosses a rectangular buffer boundary', () => {
  for (const api of [legacy, campaign, m1]) {
    const rect = api.Li, width = 28, height = heightAt(rect, width), data = new Uint8Array(width * height * 4)
    for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
      data.set([(col * 17 + row * 31) % 256, (col + 53 * row) % 256, (col * col + 7 * row) % 256, (3 * col + 47 * row) % 256], (row * width + col) * 4)
    }
    const guarded = new Proxy(data, { get(target, key) {
      if (typeof key === 'string' && /^\d+$/.test(key)) assert.ok(+key < target.length, `Out-of-bounds U1 byte ${key}/${target.length}`)
      return target[key]
    } })
    const texture = api.N1(data, width, { height, repeat: false })
    const probes = [[.5 / width, .5 / height], [.37, .42], [1.5 / width, 1 / height], [.65, (height - 1.5) / height],
      [.01, (height - .5) / height], [0, 0], [1, 0], [0, 1], [1, 1], [-.2, .4], [.4, 1.3]]
    for (const [u, v] of probes) for (let channel = 0; channel < 4; channel++) {
      const x = rect.x0 + u * rect.size, z = rect.z0 + v * (rect.height || rect.size)
      const actual = api.U1(guarded, width, x, z, channel)
      // Native U1 caps at lastIndex-.001 to keep all four reads in bounds.
      const cpuU = Math.max(.5, Math.min(width - 1.001, u * width - .5) + .5) / width
      const cpuV = Math.max(.5, Math.min(height - 1.001, v * height - .5) + .5) / height
      near(actual, textureSample(texture, cpuU, cpuV, channel), 1e-12, 'CPU bilinear')
      near(actual, textureSample(texture, u, v, channel), .002 + 1e-12, 'GPU clamp-to-edge tolerance')
      if (api === legacy) near(actual, native.U1(data, width, x, z, channel), 1e-12, 'Native legacy U1')
    }
    texture.dispose()
  }
})

test('real Ib/Nb uniforms and shader expressions normalize both rectangular axes identically', () => {
  for (const api of [legacy, campaign, m1]) {
    const fixture = uniformFixture(api), { apron, rain, mask } = fixture
    try {
      const rect = api.Li, expected = [rect.x0, rect.z0, 1 / rect.size, 1 / (rect.height || rect.size)]
      assert.deepEqual(Array.from(apron.uniforms.uMaskRect.value.toArray()), expected)
      assert.deepEqual(Array.from(rain.splash.material.uniforms.uMaskRect.value.toArray()), expected)
      assert.deepEqual(Array.from(apron.uniforms.uMaskRes.value.toArray()), [mask.image.width, mask.image.height])
      assert.equal(typeof apron.uniforms.uMarkRes.value, 'number')
      assert.match(api.AR, /vec2 muv = \(gxz - uMaskRect\.xy\) \* uMaskRect\.zw;/)
      assert.match(rain.splash.material.vertexShader, /vec2 muv = \(p\.xz - uMaskRect\.xy\) \* uMaskRect\.zw;/)
      for (const [x, z] of [[rect.x0, rect.z0], [rect.x0 + rect.size, rect.z0 + (rect.height || rect.size)], [-225, 8], [-32, 6]]) {
        const normalize = value => [(x - value.x) * value.z, (z - value.y) * value.w]
        const uv = normalize(apron.uniforms.uMaskRect.value)
        assert.deepEqual(uv, normalize(rain.splash.material.uniforms.uMaskRect.value))
        near(uv[0], (x - rect.x0) / rect.size)
        near(uv[1], (z - rect.z0) / (rect.height || rect.size))
        if (api === legacy) near(uv[1], (z - native.Li.z0) / native.Li.size)
      }
      const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader:
        '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <lights_physical_fragment>\n#include <lights_fragment_maps>\n#include <lights_fragment_end>' }
      apron.material.onBeforeCompile(shader)
      assert.ok(shader.fragmentShader.includes(api.TR) && shader.fragmentShader.includes(api.AR))
      assert.equal(shader.uniforms.uMaskRes, apron.uniforms.uMaskRes)
      assert.equal(shader.uniforms.uMaskRect, apron.uniforms.uMaskRect)
    } finally { fixture.dispose() }
  }
})

test('original bicubic arithmetic and other ground/splash shading survive only the audited type/UV substitutions', () => {
  assert.equal(campaign.TR, native.TR.replace('uMarkRes, uMaskRes;', 'uMarkRes; uniform vec2 uMaskRes;')
    .replace('uniform vec3 uMaskRect;', 'uniform vec4 uMaskRect;')
    .replace('vec4 gBicubic(sampler2D t, vec2 uv, float res)', 'vec4 gBicubic(sampler2D t, vec2 uv, vec2 res)'))
  assert.equal(campaign.AR, native.AR.replace('* uMaskRect.z;', '* uMaskRect.zw;')
    .replace('float mIn = smoothstep(0.0, 0.05, min(min(muv.x, 1.0 - muv.x), min(muv.y, 1.0 - muv.y)));',
      'vec2 edgeM = min(muv, vec2(1.0) - muv) / uMaskRect.zw;\n  float mIn = smoothstep(0.0, 4.0, min(edgeM.x, edgeM.y));')
    .replace('gBicubic(uMarks, kuv, uMarkRes)', 'gBicubic(uMarks, kuv, vec2(uMarkRes))'))
  assert.equal(campaign.UR, native.UR.replace('uniform vec3 uSunDir, uSunCol, uAmb, uMaskRect;', 'uniform vec3 uSunDir, uSunCol, uAmb; uniform vec4 uMaskRect;')
    .replace('* uMaskRect.z;', '* uMaskRect.zw;'))
  assert.match(campaign.AR, /gBicubic\(uMask, muv, uMaskRes\)/)
  assert.equal(legacy.TR, campaign.TR)
  assert.equal(legacy.AR, campaign.AR)
  assert.equal(legacy.UR, campaign.UR)
})

test('world-metre mask edge fade retains the original square fade and a four-metre rectangular border', () => {
  for (const rect of [legacyRect, campaignRect, m1Rect]) {
    const height = rect.height || rect.size
    for (const dx of [-1, 0, 1, 2, 3, 4, 6, rect.size / 2, rect.size - 2, rect.size + 1]) {
      for (const dz of [-1, 0, 1, 2, 3, 4, 6, height / 2, height - 2, height + 1]) {
        const u = dx / rect.size, v = dz / height
        const edgeX = Math.min(u, 1 - u) * rect.size, edgeZ = Math.min(v, 1 - v) * height
        const actual = native.fl(0, 4, Math.min(edgeX, edgeZ))
        near(actual, native.fl(0, 4, Math.min(dx, rect.size - dx, dz, height - dz)))
        if (rect === legacyRect) near(actual, native.fl(0, .05, Math.min(u, 1 - u, v, 1 - v)))
      }
    }
  }
})

test('actual O1 high/low wiring preserves density, rectangular texture size and z bounds', async t => {
  const sizes = []
  for (const [api, search, expectedWidths, source] of [[native, '', [512, 1024], originalSource],
    [legacy, '?entry=legacy-sandbox', [512, 1024], derivedSource], [campaign, '?entry=campaign-m0', [1792, 3584], derivedSource], [m1, '?entry=campaign-m1', [1280, 2560], derivedSource]]) {
    for (const [index, quality] of [512, 1024].entries()) {
      const calls = [], T = api.THREE
      // DOM font loading, generated detail/label maps and render factories are
      // irrelevant here. Rb's production allocation and N1 remain native; only
      // selected Rb pixels are evaluated to avoid millions of noise calls.
      const O1 = vm.runInNewContext(`(${source.text('O1')})`, {
        URLSearchParams, location: { search }, document: {}, Li: api.Li, oi: api.oi, bs: T.MathUtils,
        Rb(width) { calls.push(width); return api.sample(width, [0, 1], [0, 1]) }, N1: api.N1, U1: api.U1,
        Cb: () => ({ det: new Uint8Array(4), nrm: new Uint8Array(4) }), Pb: () => ({}), ui: T.DataTexture, wt: T.Group,
        Ib: () => ({ mesh: new T.Group(), uniforms: { uTime: {}, uRain: {} } }),
        kb: () => ({ mesh: new T.Group(), skirt: new T.Group(), uniforms: { uTime: {} } }),
        Nb: () => ({ rain: new T.Group(), splash: new T.Group() }), zb: () => ({ camera: {}, target: {}, pass() {} }),
      })
      const ground = await O1({ quality: { tex: quality }, renderer: { capabilities: {} }, scene: new T.Scene() })
      const width = expectedWidths[index], height = heightAt(api.Li, width), image = ground.maskTexture.image
      assert.deepEqual(calls, [width], 'O1 selected the wrong quality/density')
      assert.deepEqual([image.width, image.height, image.data.byteLength], [width, height, width * height * 4])
      assert.equal(height, quality * (api === m1 ? 5 : 1))
      assert.equal(ground.puddleDepth(api.Li.x0 + 1, api.Li.z0 + (api.Li.height || api.Li.size) + 1), -.2)
      assert.equal(ground.wetnessAt(api.Li.x0 + 1, api.Li.z0 + (api.Li.height || api.Li.size) + 1), .6)
      assert.equal(ground.puddleDepth(api.Li.x0, 0), -.2, 'Native domain excludes its exact border')
      sizes.push({ entry: search, quality, width, height, bytes: image.data.byteLength })
      ground.maskTexture.dispose()
    }
  }
  t.diagnostic(JSON.stringify(sizes))
})

test('M1 north/west origins retain native 0.5m navigation cells and old-port wet texels', () => {
  assert.deepEqual(plain(m1.Li), m1Rect)
  assert.deepEqual([m1.Ya,m1.ol,m1.Ls], [-164,-344,.5])
  assert.deepEqual([legacy.Ya,legacy.ol,legacy.Ls], [native.Ya,native.ol,native.Ls])
  for (const nativeWidth of [512,1024]) {
    const width = nativeWidth * 2.5, height = nativeWidth * 5
    const shiftX = nativeWidth * 1.5, shiftZ = nativeWidth * 4
    const rows = [0,1,nativeWidth / 2,nativeWidth - 1], cols = [0,1,nativeWidth / 2,nativeWidth - 1]
    const old = native.sample(nativeWidth,rows,cols)
    const actual = m1.sample(width,rows.map(r => r + shiftZ),cols.map(c => c + shiftX))
    assert.equal(actual.length, width * height * 4)
    near(m1.Li.size / width, native.Li.size / nativeWidth)
    for (const row of rows) for (const col of cols) for (let channel = 0; channel < 4; channel++) {
      assert.equal(actual[((row + shiftZ) * width + col + shiftX) * 4 + channel], old[(row * nativeWidth + col) * 4 + channel])
    }
  }
})

test('M1 coastal waves use the same CPU/GPU coast segment and native dense sea grid', () => {
  for (const api of [legacy,campaign,m1]) {
    const sea = api.kb({}, { detail: {}, detailN: {} })
    try {
      assert.deepEqual(Array.from(sea.uniforms.uCoastRange.value.toArray()), api === m1 ? [-340,30] : [0,0])
      const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '' }
      sea.material.onBeforeCompile(shader)
      assert.match(shader.vertexShader, /clamp\(swp.z, uCoastRange.x, uCoastRange.y\)/)
      assert.equal(shader.uniforms.uCoastRange, sea.uniforms.uCoastRange)
      const positions = sea.mesh.geometry.attributes.position
      const rows = [...new Set(Array.from({ length: positions.count },(_,i) => positions.getZ(i)))].sort((a,b) => a - b)
      const skirt = sea.skirt.geometry
      skirt.computeBoundingBox()
      assert.deepEqual([skirt.boundingBox.min.z,skirt.boundingBox.max.z], api === m1 ? [-360,160] : [-160,160])
      if (api === m1) {
        const dense = rows.filter(z => z >= -340 && z <= 30)
        assert.ok(dense.length > 400)
        for (let i = 1; i < dense.length; i++) assert.ok(dense[i] - dense[i - 1] <= .9001)
      }
      for (const x of [28,30,45,120,260]) for (const z of [-380,-328,-150,-30,0,30,70]) for (const t of [0,3.75]) {
        const range = sea.uniforms.uCoastRange.value, coastZ = Math.max(range.x,Math.min(range.y,z))
        const amplitude = 1 - api.THREE.MathUtils.smoothstep(Math.hypot(x - 30,z - coastZ),50,220)
        const wave = api.B1.reduce((sum,o) => sum + o[3] * Math.sin(o[4] * (o[0]*x+o[1]*z) - o[5]*t),0)
        near(api.Lb(x,z,t), api.oi.seaY + wave * amplitude)
        if (api !== m1) near(api.Lb(x,z,t), native.Lb(x,z,t))
      }
    } finally { sea.mesh.geometry.dispose(); sea.skirt.geometry.dispose(); sea.material.dispose(); sea.skirt.material.dispose() }
  }
})
