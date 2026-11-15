import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'
import { installNarrative } from './opening-narrative.mjs'
import { campaignCh3Testimony } from './campaign-ch3-dialogue.mjs'
import { installChapter3Conversation } from './campaign-ch3-conversation.mjs'

// Exercise the real original game state machine, with only its scene/DOM ports
// stubbed. Inject the exact non-resetting bridge requested from the build owner.
const html = await readFile(new URL('../../几猫国产3A大作_V1-fable5.2.html', import.meta.url), 'utf8')
const source = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
let gameNode, flowNode, adapterNode, introNode, inputNode, damageNode
const inputBindings = {}
function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc') continue
    if (Array.isArray(value)) value.forEach(child => walk(child, visit))
    else if (value && typeof value === 'object') walk(value, visit)
  }
}
walk(parse(source), node => {
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'mM') gameNode = node
  if (node.type === 'VariableDeclarator' && node.id?.name === 'Yi') flowNode = node.init
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'v_') inputNode = node
  if (node.type === 'VariableDeclarator' && ['h_', 'g_'].includes(node.id?.name)) inputBindings[node.id.name] = runInNewContext(`(${source.slice(node.init.start, node.init.end)})`)
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'x_') walk(node, child => {
    if (child.type === 'ObjectMethod' && child.key?.name === 'damage') damageNode = child
  })
})
assert.ok(gameNode && flowNode, 'Original game boundaries exist')
walk(gameNode, node => {
  if (node.type === 'VariableDeclarator' && node.id?.name === '_' && node.init?.type === 'ObjectExpression') adapterNode = node.init
  if (node.type === 'SwitchCase' && node.test?.value === 'intro') introNode = node
})
assert.ok(adapterNode.properties.some(property => property.key?.name === 'start'))
const bridge = 'skipIntro(){if(_.state!=="intro")return false;l.locationCard(false);e.fade=0;T();return true},'
assert.equal(introNode.consequent[0].type, 'ReturnStatement')
const manual = 'if(Yi.manualIntro){e.fade=kn(e.fade||0,0,6,P);return true;}'
const gameSource = (source.slice(gameNode.start, adapterNode.start + 1) + bridge + source.slice(adapterNode.start + 1, introNode.consequent[0].start) + manual + source.slice(introNode.consequent[0].start, gameNode.end))
  .replace('_.state==="playing"&&g&&G()', '_.state==="playing"&&!Yi.manualDialogue&&g&&G()')

class Element {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase(); this.ownerDocument = ownerDocument
    this.children = []; this.dataset = {}; this.style = {}; this.attributes = new Map(); this.listeners = new Map()
    this.className = ''; this.hidden = false; this.scrollTop = 0; this.inert = false; this.disabled = false; this.captures = new Map()
    this.classList = {
      contains: name => this.className.split(' ').includes(name),
      add: name => { if (!this.classList.contains(name)) this.className += ` ${name}` },
      remove: name => { this.className = this.className.split(' ').filter(item => item !== name).join(' ') },
      toggle: (name, value) => { const on = value ?? !this.classList.contains(name); this.classList[on ? 'add' : 'remove'](name); return on },
    }
  }
  insertBefore(child, sibling = null) {
    if (child.parentElement) child.parentElement.children.splice(child.parentElement.children.indexOf(child), 1)
    const index = sibling === null ? this.children.length : this.children.indexOf(sibling)
    assert.ok(index >= 0, 'Insert reference belongs to parent')
    child.parentElement = this; this.children.splice(index, 0, child)
  }
  append(...children) { for (const child of children) { if (typeof child === 'string') this.children.push(child); else this.insertBefore(child) } }
  prepend(child) { this.insertBefore(child, this.children[0] ?? null) }
  get nextSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] ?? null }
  contains(element) { return element === this || this.children.some(child => typeof child !== 'string' && child.contains(element)) }
  set textContent(value) { this.children = [String(value)] }
  get textContent() { return this.children.map(child => typeof child === 'string' ? child : child.textContent).join('') }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  removeAttribute(name) { this.attributes.delete(name) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1))
    if (selector.startsWith('[')) {
      const [, name, value] = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/)
      const actual = name.startsWith('data-') ? this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] : this.getAttribute(name)
      return value === undefined ? actual !== undefined && actual !== null : actual === value
    }
    return this.tagName.toLowerCase() === selector
  }
  querySelectorAll(selector) {
    const [first, ...rest] = selector.split(' '), matches = []
    const visit = element => { for (const child of element.children) if (typeof child !== 'string') { if (child.matches(first)) matches.push(child); visit(child) } }
    visit(this)
    return rest.length ? matches.flatMap(element => element.querySelectorAll(rest.join(' '))) : matches
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null }
  addEventListener(name, listener, capture = false) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(listener); this.captures.set(listener, capture === true) }
  removeEventListener(name, listener) { this.listeners.set(name, (this.listeners.get(name) || []).filter(value => value !== listener)) }
  dispatch(name, event) { for (const listener of [...this.listeners.get(name) || []].sort((a, b) => Number(this.captures.get(b)) - Number(this.captures.get(a)))) { listener(event); if (event.stopped) break } if (!event.stopped) this.parentElement?.dispatch(name, event) }
  click() { if (!this.disabled) { this.focus(); this.dispatch('click', { target: this }) } }
  focus() { this.ownerDocument.activeElement = this; this.dispatch('focusin', { target: this }) }
  blur() { this.ownerDocument.activeElement = null }
}
class Vector {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z) }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this }
  copy(other) { return this.set(other.x, other.y, other.z) }
  distanceTo(other) { return Math.hypot(this.x - other.x, this.y - other.y, this.z - other.z) }
}

function fixture({ armed = false, equipment = true, install = true, campaignM2 = false, campaignM3 = false, chapter3Available = false, nativeInput = false } = {}) {
  const doc = new Element('document')
  doc.createElement = tag => new Element(tag, doc)
  const add = (parent, tag, className = '', dataset = {}) => {
    const element = doc.createElement(tag); element.className = className; element.dataset = dataset; parent.append(element); return element
  }
  const menu = add(doc, 'div', 'menu')
  for (const screen of ['title', 'paused']) add(add(menu, 'section', 'm-screen', { s: screen }), 'div', 'm-actions')
  const panel = add(menu, 'div', 'panel'); panel.hidden = true
  const controls = add(panel, 'div', 'panel-b', { pane: 'controls' })
  const location = add(menu, 'div', 'loc-card'); add(location, 'b'); add(location, 'span')
  const comms = add(doc, 'div', 'comms'); add(comms, 'span', 'comms-who').textContent = '未知信号'; add(comms, 'span', 'comms-t')
  const canvas = add(doc, 'canvas')
  doc.getElementById = id => id === 'view' ? canvas : id === 'ui' ? doc : null
  const lockQueue = []
  canvas.requestPointerLock = () => { lockQueue.push(true) }
  doc.exitPointerLock = () => { lockQueue.push(false) }
  const counters = { resets: 0, weaponResets: 0, weaponFrames: 0, clears: 0, simulationFrames: 0, messages: [], radio: [], lines: [], updateDts: [], lockRequests: 0, lockExits: 0, audio: [], actionCancels: 0, shots: 0, hits: 0 }
  const events = new Map()
  const g = {
    params: {}, render: { post: {}, exposure: 1.25 }, rng: () => .5,
    audio: { setPaused: value => counters.audio.push(value), setIntensity() {}, resume() {} },
    events: {
      on(name, listener) { if (!events.has(name)) events.set(name, []); events.get(name).push(listener) },
      emit(name, data) { for (const listener of events.get(name) || []) listener(data) },
    },
    player: { pos: new Vector(), forward: new Vector(1, 0, 0), alive: true, health: 100, reset() { counters.resets++; this.alive = true }, addShake() {} },
    input: { mode: 'lock', locked: true, setGameplay(value) { this.gameplay = value }, requestLock() { counters.lockRequests++ }, exitLock() { counters.lockExits++; this.locked = false }, describeMode: () => '', onModeChange() {}, pressed: () => false, down: () => false },
    level: { playerStart: { pos: new Vector(-32, 0, 6) }, objectives: [], enemySpawns: [] },
    enemies: { clear() { counters.clears++ }, spawn() { return {} }, list: [], aliveCount: () => 0 },
    weapon: { reset() { counters.weaponResets++ }, update() { counters.weaponFrames++; if (g.input.fire || g.input.pressed('fire')) counters.shots++ }, setVisible() {}, equipmentView: { cancelActions() { counters.actionCancels++ } } },
    hud: {
      root: add(doc, 'div', 'hud'), show(value) { this.root.classList.toggle('on', value) },
      reset() { this.clearRadio() }, clearRadio() { counters.radio.length = 0; comms.classList.remove('on') },
      radio(value) { counters.radio.push(value) }, message(value, seconds) { counters.messages.push({ value, seconds }) },
      setPrompt() {}, setObjective() {}, setRelays() {}, setMarkers() {},
    },
  }
  assert.ok(damageNode && inputNode)
  g.player.damage = runInNewContext(`({${source.slice(damageNode.start, damageNode.end)}}).damage`, { C: g.player, i: g, E: 99, w: 0 })
  g.events.on('player:hit', () => counters.hits++)
  if (nativeInput) {
    g.renderer = { domElement: canvas }
    g.input = runInNewContext(`(${source.slice(inputNode.start, inputNode.end)})(g)`, {
      ...inputBindings, g, document: doc, navigator: {}, performance, innerWidth: 1200, innerHeight: 800,
      addEventListener: doc.addEventListener.bind(doc),
    })
    for (const [method, counter] of [['requestLock', 'lockRequests'], ['exitLock', 'lockExits']]) {
      const original = g.input[method]
      g.input[method] = () => { counters[counter]++; original() }
    }
  }
  const menus = {
    root: menu, panelOpen: false, screen: 'none', applySettings() {},
    show(screen) { this.screen = screen; menu.dataset.screen = screen; this.panelOpen = false; panel.hidden = true; if (screen === 'none' && menu.contains(doc.activeElement)) doc.activeElement.blur() },
    locationCard(value) { location.classList.toggle('on', value) }, setLookMode() {}, setDead() {},
    closePanel() { const wasOpen = this.panelOpen; this.panelOpen = false; return wasOpen },
  }
  // This is the existing menu's delegated Controls action; the addon must use it.
  menu.addEventListener('click', event => { if (event.target.closest('button')?.dataset.act === 'controls') { menus.panelOpen = true; panel.hidden = false; panel.focus() } })
  let actions
  g.game = runInNewContext(`(${gameSource})(g)`, {
    g, W: Vector, pM: (_, handlers) => { actions = handlers; return menus },
    Yi: runInNewContext(`(${source.slice(flowNode.start, flowNode.end)})`),
    _l: { intro: '旧版开场广播', contact: '', low: '' }, document: doc,
    Zn: (value, min, max) => Math.max(min, Math.min(max, value)),
    sl: (min, max, value) => { const t = Math.max(0, Math.min(1, (value - min) / (max - min))); return t * t * (3 - 2 * t) },
    kn: value => value, addEventListener() {}, setTimeout() {}, console,
  })
  const update = g.game.update
  let duringUpdate = null
  g.game.update = dt => { counters.updateDts.push(dt); const result = update(dt); duringUpdate?.(); return result }
  g.events.on('radio:line', line => counters.lines.push(line))
  const gear = equipment ? Object.freeze({ snapshot: () => Object.freeze({ hasFirearm: armed }) }) : undefined
  const narrative = install ? installNarrative(g, gear, { campaignM2, campaignM3, chapter3Available }) : null
  function frame(dt = .05) {
    if (nativeInput) g.input.update(dt)
    if (g.game.update(dt) !== false && !['title', 'paused'].includes(g.game.state)) { counters.simulationFrames++; g.weapon.update(dt) }
    if (nativeInput) g.input.endFrame()
  }
  function key(code, { repeat = false, shiftKey = false } = {}) {
    const event = { code, repeat, shiftKey, target: doc.activeElement, preventDefault() { this.prevented = true }, stopImmediatePropagation() { this.stopped = true } }
    doc.dispatch('keydown', event); return event
  }
  function lock(locked) { doc.pointerLockElement = locked ? canvas : null; doc.dispatch('pointerlockchange', {}) }
  function flushLocks() { for (const value of lockQueue.splice(0)) lock(value) }
  return { g, doc, controls, menu, comms, location, gear, counters, narrative, actions, frame, key, canvas, lock, flushLocks,
    duringUpdate: action => { duringUpdate = action } }
}

function conversationFixture(onComplete) {
  const f = fixture({ campaignM2: true, chapter3Available: true, armed: true, nativeInput: true })
  f.g.game.start({ skipIntro: true }); f.frame(); f.g.input.requestLock(); f.flushLocks()
  f.conversation = installChapter3Conversation(f.g, { onComplete })
  f.dialog = f.menu.querySelector('.harbor-ch3-conversation')
  f.step = (count = 1) => { for (let i = 0; i < count; i++) f.key('Space') }
  return f
}

test('conversation is manual and pauses the real native world, inputs, damage and audio for all seven pages', () => {
  let calls = 0
  const f = conversationFixture(() => calls++), time = f.g.game.run.time, frames = f.counters.simulationFrames
  const damage = f.g.player.damage, actions = f.counters.actionCancels
  assert.equal(f.conversation.snapshot().active, false)
  f.frame(); assert.equal(f.conversation.snapshot().active, false, 'No automatic dialogue trigger')
  assert.equal(f.conversation.open(), true); assert.equal(f.conversation.open(), false)
  assert.equal(f.g.game.state, 'paused'); assert.equal(f.counters.audio.at(-1), true)
  assert.equal(f.counters.actionCancels, actions + 1)
  const heldTime = f.g.game.run.time, heldFrames = f.counters.simulationFrames
  for (let index = 0; index < 7; index++) {
    assert.equal(f.dialog.querySelector('.comms-who').textContent, campaignCh3Testimony[index].who)
    assert.equal(f.dialog.querySelector('.comms-t').textContent, campaignCh3Testimony[index].text.replace(/^玩家：$/gm,'你：'))
    assert.deepEqual(f.dialog.querySelectorAll('.harbor-ch3-speaker').map(el=>el.textContent),
      campaignCh3Testimony[index].text.split('\n\n').filter(p=>p==='许工：'||p==='玩家：').map(p=>p==='玩家：'?'你：':p))
    assert.equal(f.dialog.querySelector('.harbor-dialogue-continue').hidden, index !== 6)
    if (index < 6) {
      f.key('Enter'); f.dialog.querySelector('.harbor-dialogue-continue').click()
      assert.equal(calls, 0); assert.equal(f.conversation.snapshot().completed, false)
    }
    f.key('KeyW'); f.key('KeyP'); f.key('Digit1'); f.key('KeyR')
    f.canvas.dispatch('mousedown', { button: 0, preventDefault() {} })
    f.g.player.damage(1000); f.frame(100)
    assert.equal(f.g.game.run.time, heldTime); assert.equal(f.counters.simulationFrames, heldFrames)
    assert.equal(f.g.player.health, 100); assert.equal(f.g.player.enabled, false)
    assert.equal(f.g.input.down('forward'), false); assert.equal(f.g.input.down('fire'), false)
    if (index < 6) f.step()
  }
  f.key('ArrowLeft'); assert.equal(f.conversation.snapshot().cardIndex, 5)
  f.step(); f.key('Enter')
  assert.equal(calls, 1); assert.equal(f.conversation.snapshot().completed, true)
  assert.equal(f.g.player.damage, damage); assert.equal(f.g.player.enabled, true)
  assert.equal(f.g.game.state, 'playing'); assert.equal(f.counters.audio.at(-1), false)
  assert.equal(f.g.game.flow.manualDialogue, undefined); assert.equal(f.g.input.down('fire'), false)
  assert.equal(f.conversation.open(), false)
  assert.ok(heldTime > time); assert.ok(heldFrames > frames)
})

test('Esc cancels at any page without completion or credentials, restores normal input/damage, and allows reopening', () => {
  for (const lastPage of [false, true]) {
    let calls = 0
    const f = conversationFixture(() => calls++), damage = f.g.player.damage
    f.conversation.open(); if (lastPage) f.step(6)
    f.key('Escape')
    assert.equal(calls, 0); assert.equal(f.conversation.snapshot().completed, false)
    assert.equal(f.conversation.snapshot().active, false); assert.equal(f.dialog.hidden, true)
    assert.equal(f.g.game.state, 'playing'); assert.equal(f.g.player.damage, damage)
    assert.equal(f.g.player.enabled, true); assert.equal(f.g.input.down('fire'), false)
    f.g.player.damage(5); assert.equal(f.g.player.health, 95)
    f.flushLocks(); f.flushLocks(); assert.equal(f.g.input.locked, true)
    const frames = f.counters.simulationFrames; f.frame(); assert.equal(f.counters.simulationFrames, frames + 1)
    assert.equal(f.conversation.open(), true); assert.equal(f.conversation.snapshot().cardIndex, 0)
    f.dialog.querySelector('.harbor-opening-close').click(); assert.equal(calls, 0)
  }
})

test('only final Enter/NumpadEnter/button completes once while held; reentrant input cannot complete again', () => {
  for (const control of ['Enter', 'NumpadEnter', 'button']) {
    let calls = 0
    const f = conversationFixture(() => {
      calls++; assert.equal(f.g.game.state, 'paused'); assert.equal(f.g.player.enabled, false)
      assert.equal(f.counters.audio.at(-1), true)
      f.g.player.damage(1000); assert.equal(f.g.player.health, 100)
      f.key('Enter'); f.key('Escape'); assert.equal(f.conversation.open(), false)
    })
    f.conversation.open(); f.step(6)
    if (control === 'button') f.dialog.querySelector('.harbor-dialogue-continue').click()
    else f.key(control)
    f.dialog.querySelector('.harbor-dialogue-continue').click()
    assert.equal(calls, 1); assert.equal(f.g.game.state, 'playing')
    assert.equal(f.conversation.snapshot().completed, true)
    const shots = f.counters.shots; f.frame(); assert.equal(f.counters.shots, shots)
  }
})

test('focus trap, saved panes, held-key filtering and radio suppression clean up on cancellation', () => {
  const f = conversationFixture(), panel = f.menu.querySelector('.panel')
  panel.inert = true
  assert.equal(installChapter3Conversation(f.g), f.conversation)
  assert.deepEqual(Object.keys(f.conversation).sort(), ['open', 'reset', 'snapshot'])
  f.conversation.open()
  const next = f.dialog.querySelector('.harbor-dialogue-next'), cancel = f.dialog.querySelector('.harbor-opening-close')
  f.canvas.focus(); assert.equal(f.doc.activeElement, next)
  f.key('Tab'); assert.equal(f.doc.activeElement, cancel)
  f.key('Tab', { shiftKey: true }); assert.equal(f.doc.activeElement, next)
  f.key('Space', { repeat: true }); assert.equal(f.conversation.snapshot().cardIndex, 0)
  f.g.hud.radio('expired'); assert.deepEqual(f.counters.radio, [])
  f.lock(true); f.flushLocks(); assert.equal(f.g.input.locked, false)
  f.key('Escape')
  assert.equal(f.menu.getAttribute('data-harbor-narrative'), null)
  assert.equal(f.menu.querySelector('.m-screen').inert, false); assert.equal(panel.inert, true)
  assert.equal(f.doc.listeners.get('focusin').length, 0)
  assert.equal(f.doc.listeners.get('keydown').length, 1, 'Only native input remains')
  f.g.hud.radio('fresh'); assert.deepEqual(f.counters.radio, ['fresh'])
})

test('death, new-run, reset and external resume never retain a modal or its damage wrapper or grant completion', () => {
  for (const action of ['death', 'new-run', 'title', 'reset', 'external-resume']) {
    let calls = 0
    const f = conversationFixture(() => calls++), damage = f.g.player.damage
    f.conversation.open(); f.step(6)
    if (action === 'death') f.g.events.emit('player:dead', {})
    else if (action === 'new-run') f.actions.redeploy()
    else if (action === 'title') { f.g.game.state = 'title'; f.g.events.emit('game:state', { state: 'title', prev: 'paused' }) }
    else if (action === 'reset') f.conversation.reset()
    else f.g.game.resume()
    assert.equal(f.conversation.snapshot().active, false); assert.equal(calls, 0)
    assert.equal(f.conversation.snapshot().completed, false); assert.equal(f.dialog.hidden, true)
    assert.equal(f.g.player.damage, damage); assert.equal(f.g.game.flow.manualDialogue, undefined)
    if (action === 'new-run') {
      assert.equal(f.narrative.snapshot().active, true)
      assert.equal(f.menu.getAttribute('data-harbor-narrative'), 'intro')
      assert.equal(f.menu.querySelector('.m-screen').inert, true)
      assert.equal(f.doc.activeElement, f.menu.querySelector('.harbor-opening-next'))
      f.g.game.start({ skipIntro: true })
      assert.equal(f.menu.querySelector('.m-screen').inert, false, 'The new report saves the original pane state')
    } else {
      assert.equal(f.menu.getAttribute('data-harbor-narrative'), null)
      assert.equal(f.doc.listeners.get('focusin').length, 0)
    }
    if (action === 'external-resume') {
      f.key('KeyW'); f.g.input.update(.05)
      assert.equal(f.g.input.move.y, 1, 'Native movement accepts fresh input after external resume')
      f.doc.dispatch('keyup', { code: 'KeyW' })
    }
    f.g.game.start({ skipIntro: true }); f.frame()
    assert.equal(f.conversation.open(), true); f.key('Escape')
  }
})

test('conversation rejects conflicting native states and chapter reports', () => {
  const f = conversationFixture()
  for (const blocker of ['dead', 'panel', 'manual-dialogue', 'chapter2', 'chapter3']) {
    if (blocker === 'dead') f.g.player.alive = false
    else if (blocker === 'panel') f.g.game.menus.panelOpen = true
    else if (blocker === 'manual-dialogue') f.g.game.flow.manualDialogue = true
    else f.narrative[blocker === 'chapter2' ? 'openChapter2' : 'openChapter3']()
    assert.equal(f.conversation.open(), false, blocker)
    f.g.player.alive = true; f.g.game.menus.panelOpen = false
    if (blocker === 'manual-dialogue') f.g.game.flow.manualDialogue = undefined
    if (blocker.startsWith('chapter')) { f.narrative[blocker === 'chapter2' ? 'cancelChapter2' : 'cancelChapter3'](); f.g.game.resume() }
  }
  f.conversation.open(); assert.equal(f.narrative.openChapter3(), false); f.key('Escape')
})

test('opening inside native update holds the remaining tick; instant cancel handles delayed pointer unlock', () => {
  const f = conversationFixture(), frames = f.counters.simulationFrames, damage = f.g.player.damage
  f.duringUpdate(() => { f.duringUpdate(null); f.conversation.open() }); f.frame()
  assert.equal(f.conversation.snapshot().active, true); assert.equal(f.counters.simulationFrames, frames)
  f.key('Escape'); assert.equal(f.g.game.state, 'playing'); assert.equal(f.g.player.damage, damage)
  f.flushLocks(); assert.equal(f.g.game.state, 'playing')
  f.flushLocks(); assert.equal(f.g.input.locked, true)
  f.lock(false); assert.equal(f.g.game.state, 'paused', 'Native lock-loss pause survives the handoff')
})

test('completion callbacks may reset/start a run or throw without resuming a replacement run', () => {
  for (const action of ['reset', 'redeploy', 'throw']) {
    let calls = 0
    const f = conversationFixture(() => {
      calls++
      if (action === 'reset') f.conversation.reset()
      else if (action === 'redeploy') f.actions.redeploy()
      else throw Error('checkpoint rejected')
    }), damage = f.g.player.damage
    f.conversation.open(); f.step(6)
    if (action === 'throw') {
      assert.throws(() => f.key('Enter'), /checkpoint rejected/)
      f.key('Enter'); assert.equal(f.g.game.state, 'paused')
      f.conversation.reset()
    } else f.key('Enter')
    assert.equal(calls, 1); assert.equal(f.g.player.damage, damage)
    assert.equal(f.g.game.state, action === 'redeploy' ? 'intro' : 'paused')
    assert.equal(f.conversation.snapshot().active, false)
  }
})
