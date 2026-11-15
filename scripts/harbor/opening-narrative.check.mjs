import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'
import { installNarrative } from './opening-narrative.mjs'
import { campaignCh1Opening, campaignCh1Arrival } from './campaign-ch1-dialogue.mjs'
import { campaignCh2Opening } from './campaign-ch2-dialogue.mjs'
import { campaignCh3Opening } from './campaign-ch3-dialogue.mjs'
import { campaignCh4Opening } from './campaign-ch4-dialogue.mjs'
import { campaignCh5Opening, campaignCh5Power, campaignCh5Control, campaignCh5Fault } from './campaign-ch5-dialogue.mjs'

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

function fixture({ armed = false, equipment = true, install = true, campaignM2 = false, campaignM3 = false, chapter3Available = false, chapter4Available = false, chapter5Available = false, nativeInput = false } = {}) {
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
  const narrative = install ? installNarrative(g, gear, { campaignM2, campaignM3, chapter3Available, chapter4Available, chapter5Available }) : null
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

test('campaign replay cannot reveal unfinished chapters through buttons or direct API',()=>{
  const f=fixture({campaignM2:true,chapter3Available:true,chapter4Available:true,chapter5Available:true})
  assert.equal(f.narrative.replay(),false)
  assert.equal(f.narrative.replayChapter2(),false)
  assert.equal(f.narrative.replayChapter3(),false)
  assert.equal(f.narrative.replayChapter4(),false)
  const selectors=['[data-harbor-replay]','[data-harbor-replay-chapter2]','[data-harbor-replay-chapter3]','[data-harbor-replay-chapter4]']
  const hidden=()=>{for(const selector of selectors)for(const button of f.menu.querySelectorAll(selector)){
    assert.equal(button.disabled,true);assert.equal(button.hidden,true);assert.equal(button.style.display,'none')
  }}
  hidden()
  assert.equal(f.narrative.snapshot().active,false)
  f.narrative.markChapterRead(4)
  f.narrative.setReplayProgress({chapter2IntroRead:true,chapter3IntroRead:true,chapter4IntroRead:true})
  assert.equal(f.narrative.replayChapter4(),false,'reading an opening does not complete its chapter')
  f.g.game.start({skipIntro:true});f.frame()
  assert.equal(f.narrative.replayChapter2(),false);assert.equal(f.g.game.state,'playing')
  f.narrative.setReplayProgress({blackboxEntered:true})
  assert.equal(f.narrative.replay(),true);f.key('Escape')
  assert.equal(f.narrative.replayChapter2(),false)
  for(const [flag,method,selector] of [['berth6Reached','replayChapter2','chapter2'],['chapter3Completed','replayChapter3','chapter3'],['chapter4Completed','replayChapter4','chapter4']]){
    f.narrative.setReplayProgress({[flag]:true})
    assert.equal(f.menu.querySelector(`[data-harbor-replay-${selector}]`).disabled,false)
    for(const button of f.menu.querySelectorAll(`[data-harbor-replay-${selector}]`)){
      assert.equal(button.hidden,false);assert.equal(button.style.display,'')
    }
    assert.equal(f.narrative[method](),true);f.key('Escape')
  }
  f.narrative.setReplayProgress({})
  hidden()
  assert.equal(f.narrative.replayChapter4(),false,'fresh campaign clears replay permission')
})

test('manual title deployment holds the first card indefinitely and advances no simulation', () => {
  const f = fixture()
  assert.equal(f.g.game.flow.manualIntro, true)
  assert.equal(f.g.game.flow.introSeconds, 3.5, 'Manual mode does not fake a long intro duration')
  assert.equal(f.g.game.flow.retryIntroSeconds, 1.3)
  f.actions.deploy()
  assert.equal(f.g.game.state, 'intro')
  assert.equal(f.narrative.snapshot().cardIndex, 0)
  assert.match(f.comms.textContent, /2029 年 11 月 17 日 · 23:47/)
  for (let i = 0; i < 4000; i++) f.frame()
  assert.equal(f.g.game.state, 'intro')
  assert.equal(f.narrative.snapshot().cardIndex, 0)
  assert.equal(f.counters.simulationFrames, 0, 'Enemies/player/resources stay frozen')
  assert.equal(f.counters.weaponFrames, 4000, 'Authored hand transforms update exactly once per original frame')
  assert.equal(f.counters.lines.length, 1)
  assert.equal(f.g.hud.root.classList.contains('on'), false)
  assert.equal(f.g.game.run.time, 0)
  assert.equal(f.counters.radio.length, 0, 'Original timed radio does not overlap the manual broadcast')
  assert.ok(f.counters.updateDts.every(dt => dt === .05), 'The original update receives real frame time')
  assert.equal(f.g.render.exposure, 1.25)
})

test('arrows, Space and buttons browse all seven preserved cards within bounds', () => {
  const f = fixture(); f.actions.deploy()
  const previous = f.menu.querySelector('.harbor-opening-previous'), next = f.menu.querySelector('.harbor-opening-next')
  assert.equal(previous.disabled, true)
  f.key('ArrowLeft'); previous.click()
  assert.equal(f.narrative.snapshot().cardIndex, 0)
  f.key('Enter'); assert.equal(f.g.game.state, 'intro', 'Enter cannot skip earlier cards')
  next.click(); assert.equal(f.narrative.snapshot().cardIndex, 1)
  f.key('ArrowLeft'); assert.equal(f.narrative.snapshot().cardIndex, 0)
  const texts = [f.comms.textContent]
  for (let i = 1; i < 7; i++) {
    const event = f.key(i % 2 ? 'ArrowRight' : 'Space')
    assert.equal(event.prevented, true); assert.equal(event.stopped, true)
    assert.equal(f.narrative.snapshot().cardIndex, i)
    assert.equal(f.menu.querySelector('.harbor-opening-count').textContent, `${String(i + 1).padStart(2, '0')} / 07`)
    texts.push(f.comms.textContent)
  }
  assert.equal(next.disabled, true)
  f.key('ArrowRight'); f.key('Space'); next.click()
  assert.equal(f.narrative.snapshot().cardIndex, 6)
  assert.equal(f.g.game.state, 'intro')
  assert.equal(f.menu.querySelector('.harbor-opening-start').hidden, false)
  assert.equal(f.doc.activeElement, f.menu.querySelector('.harbor-opening-start'))
  const transcript = texts.join('\n')
  for (const fact of [/灾变第七日/, /紫金港 · 第七封锁区/, /失联的远洋货轮/, /异常感染/, /通讯中断/, /平民应急维修技术员/, /同事失联/, /七号泊位/, /供电.*封锁.*燃油/, /不要相信广播/]) assert.match(transcript, fact)
  assert.doesNotMatch(transcript, /清洗|清除所有|公司.*杀|机器人.*故障|防御系统失控/)
  previous.click(); assert.equal(f.narrative.snapshot().cardIndex, 5)
  assert.equal(f.menu.querySelector('.harbor-opening-start').hidden, true)
})

test('last-card Enter/start and Esc/skip use the native handoff once without any reset', () => {
  for (const control of ['Enter', 'NumpadEnter', 'start-button', 'Escape', 'skip-button']) {
    const f = fixture(); f.actions.deploy(); f.frame(1)
    const skipped = ['Escape', 'skip-button'].includes(control)
    if (!skipped) for (let i = 0; i < 6; i++) f.narrative.next()
    f.g.game.run.retries = 2
    const before = [f.counters.resets, f.counters.weaponResets, f.counters.clears]
    if (control.endsWith('button')) f.menu.querySelector(control === 'start-button' ? '.harbor-opening-start' : '.harbor-opening-skip').click()
    else f.key(control)
    assert.equal(f.g.game.state, 'playing')
    assert.deepEqual([f.counters.resets, f.counters.weaponResets, f.counters.clears], before)
    assert.equal(f.g.game.run.retries, 2)
    assert.equal(f.g.game.run.time, 0)
    assert.equal(f.narrative.snapshot().skipped, skipped)
    assert.equal(f.narrative.snapshot().introSeen, true)
    assert.equal(f.narrative.skip(), false)
    assert.equal(f.menu.querySelector('.harbor-opening-dialog').hidden, true)
    assert.equal(f.comms.getAttribute('data-harbor-opening'), null)
    assert.equal(f.comms.classList.contains('on'), false)
    assert.equal(f.doc.listeners.get('keydown').length, 0)
    assert.equal(f.doc.listeners.get('focusin').length, 0)
    assert.equal(f.counters.lockRequests, 2, 'Deploy requests lock; the intentional gameplay handoff reacquires it')
    f.frame()
    assert.equal(f.gear.snapshot().hasFirearm, false)
    assert.equal(f.counters.messages.at(-1).value, '我得先去安保检查站。那里或许还留着自卫装备。')
    assert.equal(f.comms.parentElement, f.doc, 'Original radio container is restored for later gameplay messages')
    f.g.hud.radio('港区自动警卫仍在活动。')
    assert.deepEqual(f.counters.radio, ['港区自动警卫仍在活动。'])
  }
})

test('title and paused replay reuse interactive cards, restore focus/panes, and preserve the run', () => {
  const f = fixture({ armed: true })
  const titleButton = f.menu.querySelector('[data-s="title"] [data-harbor-replay]')
  titleButton.click()
  assert.equal(f.g.game.state, 'title')
  assert.equal(f.narrative.snapshot().mode, 'replay')
  f.key('ArrowRight'); assert.equal(f.narrative.snapshot().cardIndex, 1)
  f.key('Escape')
  assert.equal(f.doc.activeElement, titleButton)
  assert.equal(f.g.game.menus.screen, 'title')
  f.g.game.start({ skipIntro: true }); f.frame()
  f.g.game.run.retries = 4; f.g.game.run.time = 71
  const before = [f.counters.resets, f.counters.weaponResets, f.counters.clears, f.counters.messages.length]
  assert.equal(f.narrative.replay(), true)
  assert.equal(f.g.game.state, 'paused')
  const pauseButton = f.menu.querySelector('[data-s="paused"] [data-harbor-replay]')
  assert.equal(f.narrative.snapshot().returnScreen, 'paused')
  const elapsed = f.narrative.snapshot().elapsed
  for (let i = 0; i < 6; i++) f.key('Space')
  f.frame(500)
  assert.equal(f.narrative.snapshot().cardIndex, 6)
  assert.equal(f.narrative.snapshot().elapsed, elapsed)
  assert.equal(f.menu.querySelector('.harbor-opening-start').hidden, true)
  assert.equal(f.narrative.start(), false)
  f.key('Enter')
  assert.equal(f.g.game.state, 'paused')
  assert.equal(f.doc.activeElement, pauseButton)
  assert.equal(f.gear.snapshot().hasFirearm, true)
  assert.equal(f.g.game.run.retries, 4); assert.equal(f.g.game.run.time, 71)
  assert.deepEqual([f.counters.resets, f.counters.weaponResets, f.counters.clears, f.counters.messages.length], before)
  // An existing native settings/controls pane is retained, including its focus.
  const opener = f.doc.createElement('button'); opener.dataset.act = 'controls'; f.menu.append(opener); opener.click()
  assert.equal(f.g.game.menus.panelOpen, true)
  assert.equal(f.doc.activeElement, f.menu.querySelector('.panel'))
  assert.equal(f.narrative.replay(), true)
  f.menu.querySelector('.harbor-opening-close').click()
  assert.equal(f.g.game.menus.panelOpen, true)
  assert.equal(f.doc.activeElement, f.menu.querySelector('.panel'), 'Existing pane focus is restored')
  f.g.game.resume(); f.frame()
  assert.equal(f.g.game.state, 'playing')
  assert.deepEqual([f.counters.resets, f.counters.weaponResets, f.counters.clears, f.counters.messages.length], before)
})

test('focus trap, late pointer lock, repeat keys, listener cleanup and idempotent installation', () => {
  const f = fixture()
  assert.equal(installNarrative(f.g, f.gear), f.narrative)
  assert.equal(f.menu.querySelectorAll('.harbor-opening-dialog').length, 1)
  for (let i = 0; i < 4; i++) {
    f.narrative.replay()
    assert.equal(f.doc.listeners.get('keydown').length, 1)
    assert.equal(f.doc.listeners.get('focusin').length, 1)
    f.key('ArrowRight', { repeat: true }); assert.equal(f.narrative.snapshot().cardIndex, 0)
    f.key('ArrowRight'); assert.equal(f.narrative.snapshot().cardIndex, 1)
    const before = f.counters.lockExits
    f.g.events.emit('input:lock', { locked: true })
    assert.equal(f.counters.lockExits, before + 1)
    const outside = f.menu.querySelector('[data-s="title"] [data-harbor-replay]')
    outside.focus()
    assert.equal(f.doc.activeElement, f.menu.querySelector('.harbor-opening-next'))
    f.key('Tab'); assert.equal(f.doc.activeElement, f.menu.querySelector('.harbor-opening-close'))
    f.key('Tab', { shiftKey: true }); assert.equal(f.doc.activeElement, f.menu.querySelector('.harbor-opening-next'))
    assert.equal(outside.closest('.m-screen').inert, true)
    f.key('Escape')
    assert.equal(outside.closest('.m-screen').inert, false)
    assert.equal(f.doc.listeners.get('keydown').length, 0)
    assert.equal(f.doc.listeners.get('focusin').length, 0)
  }
  f.actions.deploy(); f.g.game.start({ skipIntro: true })
  assert.equal(f.narrative.snapshot().active, false, 'External state transitions close the dialog and detach inputs')
  assert.equal(f.doc.listeners.get('keydown').length, 0)
})

test('death retry starts another manual prologue; explicit skipIntro bypass remains unarmed', () => {
  const f = fixture()
  f.g.game.start({ skipIntro: true }); f.frame()
  assert.equal(f.narrative.snapshot().skipped, true)
  f.g.events.emit('player:dead', {})
  f.actions.retry()
  assert.equal(f.g.game.state, 'intro')
  assert.equal(f.narrative.replay(), false)
  f.frame(100)
  assert.equal(f.g.game.state, 'intro', 'Native 1.3-second retry cannot auto-complete manual mode')
  assert.equal(f.narrative.snapshot().cardIndex, 0)
  f.key('Escape'); f.frame()
  assert.equal(f.g.game.state, 'playing')
  assert.equal(f.g.game.run.retries, 1)
  assert.equal(f.gear.snapshot().hasFirearm, false)
})

test('armed equipment suppresses the unarmed hint; missing equipment and adapter fail correctly', () => {
  const f = fixture({ armed: true })
  f.g.game.start({ skipIntro: true }); f.frame()
  assert.ok(f.counters.messages.every(message => !message.value.includes('安保检查站')))
  const unarmed = fixture({ equipment: false })
  unarmed.g.game.start({ skipIntro: true }); unarmed.frame()
  assert.match(unarmed.counters.messages.at(-1).value, /安保检查站/)
  const missing = fixture({ install: false })
  delete missing.g.game.skipIntro
  assert.throws(() => installNarrative(missing.g, missing.gear), /non-resetting mM game\.skipIntro/)
  assert.equal(missing.g.game.flow.introSeconds, 3.5)
})

test('M2 preserves every paragraph of all twelve supplied pages and the exact arrival sequence', async () => {
  const original = await readFile(new URL('../../docs/harbor/第一关报幕.md', import.meta.url), 'utf8')
  const supplied = [...original.matchAll(/^### (\d{2}) \/ 12 — (.+)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)]
  assert.equal(supplied.length, 12)
  assert.deepEqual(campaignCh1Opening.map(cue => ({ ...cue })), supplied.map(([, index, title, text]) => ({
    who: `${index} / 12 · ${title}`, text: text.trim().replaceAll('*', ''),
  })))
  assert.deepEqual(campaignCh1Arrival.map(cue => cue.text), [
    '“五号泊位……我还活着。”',
    '“应急电力已经中断。如果要去七号泊位，必须先让这里的设施重新工作。”',
    '“安保亭就在前面。先找到武器，再试着联系巡逻守卫。”',
    '“这里是七号泊位……最后一班船……”',
    '“别去……他们在……不要相信广播！”［信号中断］',
  ])
  const f = fixture({ campaignM2: true }); f.actions.deploy()
  const transcript = [], controls = []
  const before = [f.counters.resets, f.counters.weaponResets, f.counters.clears]
  for (let index = 0; index < 17; index++) {
    const snapshot = f.narrative.snapshot()
    assert.equal(snapshot.cardIndex, index)
    assert.equal(snapshot.cardCount, 17)
    assert.equal(snapshot.openingCardCount, 12)
    assert.equal(snapshot.phase, index < 12 ? 'opening' : 'arrival')
    assert.equal(snapshot.arrivalIndex, index < 12 ? -1 : index - 12)
    assert.equal(snapshot.controlsHeld, true)
    assert.equal(f.g.input.gameplay, false)
    assert.equal(f.g.player.enabled, false)
    transcript.push(f.comms.querySelector('.comms-t').textContent)
    for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyE', 'Digit1', 'KeyR', 'Enter']) {
      if (index === 16 && code === 'Enter') continue
      const event = f.key(code); controls.push(event.stopped)
    }
    for (let frame = 0; frame < 5; frame++) f.frame(100)
    assert.equal(f.narrative.snapshot().cardIndex, index, 'No timed progression')
    assert.equal(f.g.game.run.time, 0)
    assert.equal(f.counters.simulationFrames, 0)
    if (index < 16) {
      f.menu.querySelector('.harbor-opening-body').scrollTop = 500
      f.key('ArrowRight')
      assert.equal(f.menu.querySelector('.harbor-opening-body').scrollTop, 0)
    }
  }
  assert.ok(controls.every(Boolean), 'Gameplay key presses never reach native input')
  assert.deepEqual(transcript, [...campaignCh1Opening, ...campaignCh1Arrival].map(cue => cue.text))
  assert.equal(f.narrative.skip(), false)
  f.key('ArrowRight'); f.key('Escape'); f.key('KeyW')
  assert.equal(f.g.game.state, 'intro', 'Final arrival card requires explicit handoff')
  f.key('Enter'); f.frame()
  assert.equal(f.g.game.state, 'playing')
  assert.equal(f.g.input.gameplay, true)
  assert.equal(f.g.player.enabled, true)
  assert.equal(f.narrative.snapshot().controlsHeld, false)
  assert.deepEqual([f.counters.resets, f.counters.weaponResets, f.counters.clears], before)
})

test('M2 Esc skips only the opening; arrival and radios remain held through the final continue', () => {
  for (const firstPage of [0, 6, 11]) {
    const f = fixture({ campaignM2: true }); f.actions.deploy()
    for (let index = 0; index < firstPage; index++) f.narrative.next()
    f.key('Escape')
    assert.equal(f.narrative.snapshot().cardIndex, 12)
    assert.equal(f.narrative.snapshot().skipped, true)
    assert.equal(f.doc.activeElement, f.menu.querySelector('.harbor-opening-next'))
    for (let index = 12; index < 17; index++) {
      f.key('Escape'); f.frame(100)
      assert.equal(f.narrative.skip(), false)
      assert.equal(f.narrative.snapshot().cardIndex, index)
      assert.equal(f.g.game.state, 'intro')
      assert.equal(f.g.input.gameplay, false)
      if (index < 16) f.key('Space')
    }
    f.menu.querySelector('.harbor-opening-start').click()
    assert.equal(f.g.game.state, 'playing')
    assert.equal(f.narrative.snapshot().skipped, true)
  }
})

test('M2 checkpoint bypass stays explicit and new runs always restart all opening pages', () => {
  const f = fixture({ campaignM2: true })
  f.g.game.start({ skipIntro: true }); f.frame()
  assert.equal(f.g.game.state, 'playing')
  assert.equal(f.narrative.snapshot().active, false)
  f.actions.redeploy()
  assert.equal(f.g.game.state, 'intro')
  assert.equal(f.narrative.snapshot().cardIndex, 0)
  assert.equal(f.narrative.snapshot().skipped, false)
  assert.equal(f.narrative.snapshot().introSeen, false)
  f.narrative.skip(); for (let index = 0; index < 4; index++) f.narrative.next()
  f.narrative.start()
  f.g.events.emit('player:dead', {})
  assert.equal(f.narrative.snapshot().cardIndex, -1)
  // Root's checkpoint retry adapter uses this native bypass, after replacing
  // physical runtime. No checkpoint detection or equipment grant lives here.
  f.g.game.start({ skipIntro: true }); f.frame()
  assert.equal(f.narrative.snapshot().active, false)
  f.actions.redeploy()
  assert.equal(f.narrative.snapshot().cardIndex, 0)
  assert.equal(f.narrative.snapshot().phase, 'opening')
  assert.equal(f.doc.listeners.get('keydown').length, 1)
})

function chapter2Fixture() {
  const f = fixture({ campaignM2: true, armed: true, nativeInput: true })
  f.g.game.start({ skipIntro: true }); f.frame(); f.lock(true)
  return f
}

test('CH2 data independently matches all eight Markdown pages, paragraphs and final chapter title', async () => {
  const markdown = await readFile(new URL('../../docs/harbor/第二关报幕.md', import.meta.url), 'utf8')
  const sections = markdown.split(/^### /m).slice(1)
  assert.equal(sections.length, 8)
  const expected = sections.map((section, index) => {
    const [heading, ...lines] = section.split('\n')
    const match = heading.match(/^(\d{2}) \/ 08 — (.+)$/)
    assert.equal(match?.[1], String(index + 1).padStart(2, '0'))
    return { who: `${match[1]} / 08 · ${match[2]}`, text: lines.join('\n').trim().replace(/\*\*([^*]+)\*\*/g, '$1') }
  })
  assert.deepEqual(campaignCh2Opening, expected)
  assert.ok(Object.isFrozen(campaignCh2Opening) && campaignCh2Opening.every(Object.isFrozen))
  assert.match(campaignCh2Opening.at(-1).text, /\n\nCHAPTER 02\n\n黑箱堆场 · 没有灯的路$/)
})

test('CH2 uses native pause, real input and damage; arbitrarily long reading freezes the original run', () => {
  const f = chapter2Fixture(), damage = f.g.player.damage
  f.g.player.damage(7)
  assert.equal(f.g.player.health, 93, 'Actual x_.damage is live before the modal')
  f.key('KeyW'); f.key('KeyR'); f.key('Enter'); f.g.input.update(.05)
  f.g.input.look.dx = .8; f.g.input.look.dy = .2
  assert.equal(f.g.input.fire, true)
  const before = JSON.stringify({ time: f.g.game.run.time, queue: f.g.game.run.queue, pos: f.g.player.pos, health: f.g.player.health })
  const pos = f.g.player.pos, frames = f.counters.simulationFrames, weaponFrames = f.counters.weaponFrames
  f.g.hud.radio('stale radio')
  assert.equal(f.narrative.openChapter2(), true)
  assert.equal(f.g.game.state, 'paused')
  assert.equal(f.g.game.menus.screen, 'paused')
  assert.equal(f.counters.audio.at(-1), true)
  assert.equal(f.g.player.enabled, false)
  assert.equal(f.g.player.invulnerable, undefined, 'No global invulnerability flag')
  assert.equal(f.g.input.down('forward'), false)
  assert.equal(f.g.input.pressed('fire'), false, 'Pre-open native edge is cleared')
  assert.equal(f.g.input.fire, false)
  assert.deepEqual(JSON.parse(JSON.stringify(f.g.input.move)), { x: 0, y: 0 })
  assert.deepEqual(JSON.parse(JSON.stringify(f.g.input.look)), { dx: 0, dy: 0 })
  assert.equal(f.counters.actionCancels, 1)
  for (let i = 0; i < 4000; i++) {
    f.frame(1)
    f.g.player.damage(1000)
    f.g.hud.radio('must not queue')
  }
  assert.equal(JSON.stringify({ time: f.g.game.run.time, queue: f.g.game.run.queue, pos: f.g.player.pos, health: f.g.player.health }), before)
  assert.equal(f.g.player.pos, pos, 'Live position identity is retained separately from persisted values')
  assert.equal(f.counters.simulationFrames, frames)
  assert.equal(f.counters.weaponFrames, weaponFrames)
  assert.equal(f.narrative.snapshot().cardIndex, 0)
  assert.equal(f.counters.hits, 1)
  assert.deepEqual(f.counters.radio, [])
  assert.notEqual(f.g.player.damage, damage)
  f.narrative.cancelChapter2()
  assert.equal(f.g.player.damage, damage)
  assert.equal(f.g.game.state, 'paused', 'Cancel returns to a safe native menu; it never resumes or completes')
})

test('CH2 eight pages share the original comms/dialog, only manual navigation and final Enter resume', () => {
  const f = chapter2Fixture(), dialog = f.menu.querySelector('.harbor-opening-dialog'), comms = f.comms
  const completed = []
  f.narrative.openChapter2({ onComplete: result => completed.push(result) })
  assert.equal(f.menu.querySelectorAll('.harbor-opening-dialog').length, 1)
  assert.equal(f.menu.querySelector('.comms'), comms)
  const composing = { code: 'ArrowRight', isComposing: true, preventDefault() {}, stopImmediatePropagation() { this.stopped = true } }
  f.doc.dispatch('keydown', composing)
  assert.equal(composing.stopped, true, 'IME navigation is held without turning the page or the player')
  f.key('ArrowLeft'); f.menu.querySelector('.harbor-opening-previous').click()
  assert.equal(f.narrative.snapshot().cardIndex, 0)
  for (let index = 0; index < 8; index++) {
    assert.equal(f.narrative.snapshot().cardIndex, index)
    assert.equal(f.narrative.snapshot().cardCount, 8)
    assert.equal(f.narrative.snapshot().phase, 'chapter2')
    assert.equal(f.menu.querySelector('.harbor-opening-count').textContent, `${String(index + 1).padStart(2, '0')} / 08`)
    assert.equal(comms.querySelector('.comms-who').textContent, campaignCh2Opening[index].who)
    assert.equal(comms.querySelector('.comms-t').textContent, campaignCh2Opening[index].text)
    f.frame(10000)
    for (const code of ['KeyW', 'KeyE', 'KeyR', 'KeyP', 'Digit1', 'KeyQ', 'ArrowUp']) assert.equal(f.key(code).stopped, true)
    f.key('ArrowRight', { repeat: true })
    assert.equal(f.narrative.snapshot().cardIndex, index)
    if (index < 7) {
      f.key('Enter'); f.key('NumpadEnter')
      assert.deepEqual(completed, [])
      assert.equal(f.narrative.start(), false)
      f.key(index % 2 ? 'ArrowRight' : 'Space')
    }
  }
  f.key('ArrowRight'); f.key('Space'); f.menu.querySelector('.harbor-opening-next').click()
  assert.equal(f.narrative.snapshot().cardIndex, 7)
  f.key('ArrowLeft'); assert.equal(f.narrative.snapshot().cardIndex, 6)
  f.menu.querySelector('.harbor-opening-next').click()
  assert.equal(f.doc.activeElement, f.menu.querySelector('.harbor-opening-start'))
  f.key('Enter')
  assert.deepEqual(completed, [{ skipped: false }])
  assert.equal(dialog.hidden, true)
  assert.equal(f.g.game.state, 'playing')
  assert.equal(f.g.input.fire, false)
  const shots = f.counters.shots; f.frame()
  assert.equal(f.counters.shots, shots, 'The continue Enter never becomes native fire')
})

test('CH2 completion/skip is once, before simulation/audio/input resume, with real damage and lock restored', () => {
  for (const control of ['Enter', 'NumpadEnter', 'start-button', 'Escape', 'skip-button']) {
    const f = chapter2Fixture(), damage = f.g.player.damage, order = [], startTime = f.g.game.run.time
    const resume = f.g.game.resume
    f.g.game.resume = () => { order.push('resume'); resume() }
    const expectedSkip = ['Escape', 'skip-button'].includes(control)
    f.narrative.openChapter2({ onComplete: result => {
      order.push(JSON.parse(JSON.stringify(result)))
      assert.equal(f.g.game.state, 'paused')
      assert.equal(f.g.game.run.time, startTime)
      assert.equal(f.counters.audio.at(-1), true)
      assert.equal(f.g.player.enabled, false)
      assert.equal(f.g.input.down('fire'), false)
      const health = f.g.player.health; f.g.player.damage(200)
      assert.equal(f.g.player.health, health)
      assert.equal(f.narrative.skip(), false, 'Reentrant finish cannot complete twice')
      assert.equal(f.narrative.openChapter2(), false)
    } })
    if (!expectedSkip) for (let i = 0; i < 7; i++) f.narrative.next()
    const requests = f.counters.lockRequests
    if (control.endsWith('button')) f.menu.querySelector(control === 'start-button' ? '.harbor-opening-start' : '.harbor-opening-skip').click()
    else f.key(control)
    assert.deepEqual(order, [{ skipped: expectedSkip }, 'resume'])
    assert.equal(f.narrative.snapshot().active, false)
    assert.equal(f.narrative.skip(), false); assert.equal(f.narrative.start(), false)
    assert.equal(f.narrative.cancelChapter2(), false)
    assert.equal(f.g.game.state, 'playing')
    assert.equal(f.g.player.enabled, true)
    assert.equal(f.counters.audio.at(-1), false)
    assert.equal(f.counters.lockRequests, requests + 1, 'Native resume requests the mouse exactly once')
    assert.equal(f.g.game.flow.manualDialogue, undefined)
    assert.equal(f.g.player.damage, damage)
    f.g.player.damage(5); assert.equal(f.g.player.health, 95)
    f.frame(); assert.ok(f.g.game.run.time > startTime)
    assert.deepEqual(f.counters.radio, [], 'Expired radio never returns')
    assert.equal(f.comms.parentElement, f.doc)
    assert.equal(f.comms.classList.contains('on'), false)
    assert.equal(f.menu.getAttribute('data-harbor-narrative'), null)
    f.g.hud.radio('fresh radio'); assert.deepEqual(f.counters.radio, ['fresh radio'])
  }
})

test('CH2 rejects nonplaying/dead/panel/other narrative and never steals their focus or panes', () => {
  const f = fixture({ campaignM2: true })
  assert.equal(f.narrative.openChapter2(), false)
  f.actions.deploy(); assert.equal(f.narrative.openChapter2(), false)
  f.g.game.start({ skipIntro: true }); f.frame()
  for (const blocker of ['dead', 'panel', 'guard-attribute', 'manual-dialogue']) {
    f.g.player.alive = blocker !== 'dead'
    f.g.game.menus.panelOpen = blocker === 'panel'
    f.g.game.flow.manualDialogue = blocker === 'manual-dialogue'
    if (blocker === 'guard-attribute') f.menu.setAttribute('data-harbor-narrative', 'guard')
    assert.equal(f.narrative.openChapter2(), false, blocker)
    assert.equal(f.g.game.state, 'playing')
    f.menu.removeAttribute('data-harbor-narrative')
  }
  f.g.player.alive = true; f.g.game.menus.panelOpen = false; f.g.game.flow.manualDialogue = false
  assert.equal(f.narrative.openChapter2(), true)
  assert.equal(f.narrative.replay(), false); assert.equal(f.narrative.replayChapter2(), false)
  f.g.events.emit('player:dead', {})
  assert.equal(f.narrative.snapshot().active, false)
  assert.equal(f.g.game.state, 'dead')
})

test('CH2 title/paused replay selects chapter explicitly and never completes, resets, grants or resumes', () => {
  const f = fixture({ campaignM2: true, armed: true, nativeInput: true })
  f.narrative.setReplayProgress({blackboxEntered:true,berth6Reached:true})
  for (const screen of ['title', 'paused']) {
    if (screen === 'paused') { f.g.game.start({ skipIntro: true }); f.frame(); f.g.game.pause() }
    const button = f.menu.querySelector(`[data-s="${screen}"] [data-harbor-replay-chapter2]`)
    assert.match(button.textContent, /第二章/)
    const before = JSON.stringify({ run: f.g.game.run, gear: f.gear.snapshot(), resets: f.counters.resets, weaponResets: f.counters.weaponResets, clears: f.counters.clears })
    button.click()
    assert.equal(f.narrative.snapshot().mode, 'replay2')
    assert.equal(f.narrative.snapshot().returnScreen, screen)
    assert.equal(f.g.game.state, screen)
    assert.equal(f.narrative.start(), false)
    assert.equal(f.narrative.skip(), false)
    for (let i = 0; i < 7; i++) f.key('Space')
    assert.equal(f.menu.querySelector('.harbor-opening-start').hidden, true)
    assert.match(f.comms.textContent, /CHAPTER 02/)
    f.key('Enter')
    assert.equal(f.g.game.state, screen)
    assert.equal(f.doc.activeElement, button)
    assert.equal(JSON.stringify({ run: f.g.game.run, gear: f.gear.snapshot(), resets: f.counters.resets, weaponResets: f.counters.weaponResets, clears: f.counters.clears }), before)
    f.narrative.replayChapter2(); f.key('Escape')
    assert.equal(f.g.game.state, screen)
    f.narrative.replay()
    assert.equal(f.narrative.snapshot().phase, 'opening')
    assert.equal(f.narrative.snapshot().cardCount, 17)
    f.key('Escape')
  }
})

test('CH2 late pointer locks, focus trap, cancel/reentry and new-run/restore transitions clean up without callbacks', () => {
  const f = chapter2Fixture(), damage = f.g.player.damage, completed = []
  const panel = f.menu.querySelector('.panel'); panel.inert = true
  for (let i = 0; i < 3; i++) {
    f.narrative.openChapter2({ onComplete: result => completed.push(result) })
    f.narrative.next()
    f.lock(true); f.flushLocks()
    assert.equal(f.g.input.locked, false)
    assert.equal(f.g.game.state, 'paused')
    f.canvas.focus(); assert.equal(f.doc.activeElement, f.menu.querySelector('.harbor-opening-next'))
    f.key('Tab'); assert.equal(f.doc.activeElement, f.menu.querySelector('.harbor-opening-skip'))
    f.key('Tab', { shiftKey: true }); assert.equal(f.doc.activeElement, f.menu.querySelector('.harbor-opening-next'))
    assert.equal(f.narrative.cancelChapter2(), true)
    assert.equal(f.g.player.damage, damage)
    assert.equal(f.g.player.enabled, true)
    assert.equal(panel.inert, true)
    assert.equal(f.menu.querySelector('.m-screen').inert, false)
    assert.equal(f.doc.listeners.get('focusin').length, 0)
    assert.equal(f.doc.listeners.get('keydown').length, 1, 'Only the native input listener remains')
    f.g.game.resume(); f.flushLocks(); f.flushLocks()
    assert.equal(f.g.game.state, 'playing')
    assert.equal(f.g.input.locked, true)
  }
  for (const action of ['redeploy', 'restore', 'resume']) {
    f.narrative.openChapter2({ onComplete: result => completed.push(result) })
    if (action === 'redeploy') f.actions.redeploy()
    else if (action === 'restore') f.g.game.start({ skipIntro: true })
    else f.g.game.resume()
    assert.equal(f.g.player.damage, damage)
    assert.equal(f.g.game.flow.manualDialogue, undefined)
    if (action === 'redeploy') {
      assert.equal(f.narrative.snapshot().phase, 'opening')
      assert.equal(f.narrative.snapshot().cardCount, 17)
      f.g.game.start({ skipIntro: true })
    }
    assert.equal(f.narrative.snapshot().active, false)
    assert.equal(f.g.player.enabled, true)
    assert.equal(f.menu.getAttribute('data-harbor-narrative'), null)
  }
  assert.deepEqual(completed, [])
  f.lock(true); f.lock(false)
  assert.equal(f.g.game.state, 'paused', 'Normal gameplay lock loss still uses native pause')
})

test('CH2 finishing callbacks may cancel/reset, and a thrown checkpoint callback cannot resume the run', () => {
  for (const reset of [false, true]) {
    const f = chapter2Fixture(), calls = []
    f.narrative.openChapter2({ onComplete: result => {
      calls.push(result); f.narrative.cancelChapter2()
      if (reset) f.actions.redeploy()
    } })
    f.narrative.skip()
    assert.deepEqual(calls, [{ skipped: true }])
    assert.equal(f.g.game.state, reset ? 'intro' : 'paused')
    if (reset) assert.equal(f.narrative.snapshot().phase, 'opening')
  }
  const f = chapter2Fixture(); let calls = 0
  f.narrative.openChapter2({ onComplete() { calls++; throw Error('checkpoint rejected') } })
  assert.throws(() => f.narrative.skip(), /checkpoint rejected/)
  assert.equal(f.narrative.skip(), false)
  assert.equal(calls, 1)
  assert.equal(f.g.game.state, 'paused')
  assert.equal(f.counters.audio.at(-1), true)
  assert.equal(f.narrative.cancelChapter2(), true)
})

test('CH2 opened within a real native update holds the remaining outer simulation tick', () => {
  const f = chapter2Fixture(), frames = f.counters.simulationFrames, weapons = f.counters.weaponFrames
  f.duringUpdate(() => { f.duringUpdate(null); f.narrative.openChapter2() })
  f.frame()
  const time = f.g.game.run.time
  assert.equal(f.narrative.snapshot().mode, 'chapter2')
  assert.equal(f.counters.simulationFrames, frames)
  assert.equal(f.counters.weaponFrames, weapons)
  f.g.player.damage(1000)
  f.frame(1000)
  assert.equal(f.g.player.health, 100)
  assert.equal(f.g.game.run.time, time)
})

test('CH2 immediate skip recaptures after delayed unlock; later intentional lock loss still pauses', () => {
  const f = chapter2Fixture()
  f.narrative.openChapter2(); f.narrative.skip()
  assert.equal(f.g.game.state, 'playing')
  assert.equal(f.g.input.locked, true, 'Browser has not yet delivered the original unlock')
  const requests = f.counters.lockRequests
  f.flushLocks()
  assert.equal(f.g.game.state, 'playing')
  assert.equal(f.g.input.locked, false)
  assert.equal(f.counters.lockRequests, requests + 1, 'Queued unlock requests one real reacquire')
  f.flushLocks()
  assert.equal(f.g.input.locked, true)
  f.lock(false)
  assert.equal(f.g.game.state, 'paused', 'Native lock-loss pause remains enabled after handoff')
  f.flushLocks()
  assert.equal(f.g.input.locked, false)
  assert.equal(f.counters.lockRequests, requests + 1, 'Pause never recaptures the mouse')
})

test('CH2 input boundaries clear native held actions and retain the saved player enabled state', () => {
  const f = chapter2Fixture()
  f.g.player.enabled = false
  f.narrative.openChapter2()
  // Simulate a device edge arriving outside DOM keyboard capture. The native
  // input admits global actions even when gameplay is off; finish must flush it.
  f.g.input.setGameplay(true)
  f.canvas.dispatch('mousedown', { button: 0, preventDefault() {} })
  f.g.input.update(.05)
  assert.equal(f.g.input.fire, true, 'The real native mouse edge is present before the finish boundary')
  f.narrative.skip()
  assert.equal(f.g.input.down('forward'), false)
  assert.equal(f.g.input.down('fire'), false)
  assert.equal(f.g.player.enabled, false)
  const shots = f.counters.shots; f.frame()
  assert.equal(f.counters.shots, shots)
})

test('CH2 pointer request failure retains native drag fallback and the next lock click is not an attack', () => {
  const f = fixture({ campaignM2: true, armed: true, nativeInput: true })
  f.g.game.start({ skipIntro: true }); f.frame()
  f.narrative.openChapter2()
  f.doc.dispatch('pointerlockerror', {})
  assert.equal(f.g.input.mode, 'drag')
  f.narrative.skip(); f.frame()
  assert.equal(f.g.game.state, 'playing')
  assert.equal(f.g.input.mode, 'drag')
  assert.equal(f.g.input.down('fire'), false)
  f.g.input.mode = 'lock'
  const shots = f.counters.shots
  f.canvas.dispatch('mousedown', { button: 0, preventDefault() {} }); f.frame()
  assert.equal(f.counters.shots, shots)
  f.flushLocks()
  assert.equal(f.g.input.locked, true)
})

test('CH2 cancellation releases a previously pending lock request that succeeds after the modal closes', () => {
  const f = fixture({ campaignM2: true, armed: true, nativeInput: true })
  f.g.game.start({ skipIntro: true }); f.g.input.requestLock()
  assert.equal(f.g.input.locked, false)
  f.narrative.openChapter2(); f.narrative.cancelChapter2()
  f.flushLocks(); f.flushLocks()
  assert.equal(f.g.game.state, 'paused')
  assert.equal(f.g.input.locked, false, 'No late lock remains over the native paused menu')
  f.g.game.resume(); f.flushLocks()
  assert.equal(f.g.game.state, 'playing')
  assert.equal(f.g.input.locked, true, 'An intentional native resume may acquire the mouse normally')
})

test('CH3 uses exactly the eight supplied opening cards and holds native simulation until handoff',async()=>{
  const markdown=(await readFile(new URL('../../docs/harbor/第三关报幕.md',import.meta.url),'utf8')).split('### 第二幕')[0]
  const expected=[...markdown.matchAll(/#### (\d\d \/ 08) — ([^\n]+)\n\n([\s\S]*?)(?=\n####|\n---|$)/g)]
    .map(([,index,title,text])=>({who:`${index} · ${title}`,text:text.trim().replaceAll('**','')}))
  assert.deepEqual(campaignCh3Opening,expected);assert.equal(expected.length,8)
  const f=fixture({campaignM3:true,armed:true,nativeInput:true});f.actions.deploy()
  const before=f.counters.simulationFrames,time=f.g.game.run.time
  for(let i=0;i<8;i++){
    assert.equal(f.comms.querySelector('.comms-t').textContent,expected[i].text)
    f.frame(20);assert.equal(f.g.game.state,'intro');assert.equal(f.counters.simulationFrames,before)
    assert.equal(f.g.game.run.time,time)
    if(i<7)f.key('ArrowRight')
  }
  assert.equal(f.narrative.snapshot().phase,'chapter3');assert.equal(f.narrative.snapshot().openingCardCount,8)
  f.key('Enter');assert.equal(f.g.game.state,'playing');assert.equal(f.narrative.snapshot().active,false)
})

test('CH3 crossing uses native pause and eight original pages; only final Enter or Esc completes once', () => {
  for (const control of ['Enter', 'NumpadEnter', 'button', 'Escape']) {
    const f = fixture({ campaignM2: true, chapter3Available: true, armed: true, nativeInput: true })
    f.g.game.start({ skipIntro: true }); f.frame(); f.g.input.requestLock(); f.flushLocks()
    const damage = f.g.player.damage, time = f.g.game.run.time, frames = f.counters.simulationFrames, calls = []
    assert.equal(f.narrative.openChapter3({ onComplete: result => {
      calls.push(result)
      assert.equal(f.g.game.state, 'paused'); assert.equal(f.g.player.enabled, false)
      assert.equal(f.counters.audio.at(-1), true)
      f.g.player.damage(1000); assert.equal(f.g.player.health, 100)
      assert.equal(f.narrative.skip(), false)
    } }), true)
    assert.equal(f.narrative.snapshot().mode, 'chapter3'); assert.equal(f.narrative.snapshot().phase, 'chapter3')
    assert.equal(f.narrative.snapshot().cardCount, 8); assert.equal(f.narrative.snapshot().arrivalIndex, -1)
    assert.equal(f.narrative.openChapter2(), false)
    f.key('Enter'); assert.deepEqual(calls, [])
    for (let i = 0; i < 8; i++) {
      assert.equal(f.comms.querySelector('.comms-t').textContent, campaignCh3Opening[i].text)
      f.g.player.damage(1000); f.frame(100)
      assert.equal(f.g.game.run.time, time); assert.equal(f.counters.simulationFrames, frames)
      assert.equal(f.g.player.health, 100)
      if (i < 7) f.key('Space')
    }
    if (control === 'button') f.menu.querySelector('.harbor-opening-start').click()
    else f.key(control)
    assert.deepEqual(calls, [{ skipped: control === 'Escape' }])
    assert.equal(f.narrative.start(), false); assert.equal(f.narrative.skip(), false)
    assert.equal(f.g.game.state, 'playing'); assert.equal(f.g.player.enabled, true)
    assert.equal(f.g.player.damage, damage); assert.equal(f.g.game.flow.manualDialogue, undefined)
    assert.equal(f.g.input.down('fire'), false); assert.equal(f.g.input.down('forward'), false)
    f.flushLocks(); f.flushLocks(); assert.equal(f.g.input.locked, true)
    f.g.player.damage(5); assert.equal(f.g.player.health, 95)
  }
})

test('CH3 Esc on the first page completes only the report; cancellation, death and new runs never complete', () => {
  const f = fixture({ campaignM2: true, nativeInput: true }), calls = []
  f.g.game.start({ skipIntro: true }); f.frame()
  f.narrative.openChapter3({ onComplete: result => calls.push(result) }); f.key('Escape')
  assert.deepEqual(calls, [{ skipped: true }])
  const damage = f.g.player.damage
  for (const action of ['cancel', 'death', 'new-run']) {
    if (f.g.game.state !== 'playing') { f.g.game.start({ skipIntro: true }); f.frame() }
    f.narrative.openChapter3({ onComplete: () => calls.push('unexpected') })
    if (action === 'cancel') {
      assert.equal(f.narrative.cancelChapter2(), false)
      assert.equal(f.narrative.cancelChapter3(), true)
      assert.equal(f.g.game.state, 'paused'); f.g.game.resume()
    } else if (action === 'death') f.g.events.emit('player:dead', {})
    else { f.actions.redeploy(); assert.equal(f.narrative.snapshot().phase, 'opening') }
    assert.equal(f.g.player.damage, damage)
    assert.equal(f.g.game.flow.manualDialogue, undefined)
    assert.deepEqual(calls, [{ skipped: true }])
  }
})

test('CH3 replay buttons are opt-in; title/paused replay preserves chapter selection and campaign facts', () => {
  for (const campaignM3 of [false, true]) {
    const unavailable = fixture({ campaignM2: !campaignM3, campaignM3 })
    assert.equal(unavailable.menu.querySelector('[data-harbor-replay-chapter3]'), null)
    const f = fixture({ campaignM2: !campaignM3, campaignM3, chapter3Available: true, nativeInput: true })
    f.narrative.setReplayProgress({blackboxEntered:true,berth6Reached:true,chapter3Completed:true})
    for (const screen of ['title', 'paused']) {
      if (screen === 'paused') { f.g.game.start({ skipIntro: true }); f.frame(); f.g.game.pause() }
      const button = f.menu.querySelector(`[data-s="${screen}"] [data-harbor-replay-chapter3]`)
      const before = JSON.stringify({ run: f.g.game.run, gear: f.gear.snapshot(), resets: f.counters.resets, clears: f.counters.clears })
      button.click()
      assert.equal(f.narrative.snapshot().mode, 'replay3'); assert.equal(f.narrative.snapshot().phase, 'chapter3')
      assert.equal(f.narrative.start(), false); assert.equal(f.narrative.skip(), false)
      for (let i = 0; i < 7; i++) f.key('ArrowRight')
      assert.equal(f.menu.querySelector('.harbor-opening-start').hidden, true)
      assert.match(f.comms.textContent, /CHAPTER 03/)
      f.key('Enter'); assert.equal(f.g.game.state, screen); assert.equal(f.doc.activeElement, button)
      assert.equal(JSON.stringify({ run: f.g.game.run, gear: f.gear.snapshot(), resets: f.counters.resets, clears: f.counters.clears }), before)
      f.narrative.replayChapter3(); f.key('Escape'); assert.equal(f.g.game.state, screen)
      if (!campaignM3) {
        f.narrative.replayChapter2(); assert.equal(f.narrative.snapshot().phase, 'chapter2'); f.key('Escape')
        f.narrative.replay(); assert.equal(f.narrative.snapshot().phase, 'opening'); f.key('Escape')
      }
    }
  }
})

test('CH4 eight-page report freezes native world/input/damage and commits read once on final Enter or skip', () => {
  for (const skip of [false, true]) {
    const f=fixture({chapter4Available:true,armed:true,nativeInput:true}),calls=[]
    f.g.game.start({skipIntro:true});f.frame()
    const damage=f.g.player.damage,time=f.g.game.run.time,frames=f.counters.simulationFrames
    assert.equal(f.narrative.openChapter4({onComplete:result=>{
      calls.push(result);assert.equal(f.g.game.state,'paused');assert.equal(f.narrative.snapshot().chapter4Read,true)
      f.g.player.damage(1000);assert.equal(f.g.player.health,100)
      assert.equal(f.narrative.skip(),false)
    }}),true)
    assert.equal(f.narrative.snapshot().phase,'chapter4');assert.equal(f.narrative.snapshot().cardCount,8)
    f.key('Enter');assert.equal(calls.length,0)
    for(let i=0;i<8;i++){
      assert.equal(f.comms.querySelector('.comms-t').textContent,campaignCh4Opening[i].text)
      f.key('KeyW');f.key('KeyR');f.key('Digit1');f.g.player.damage(1000);f.frame(100)
      assert.equal(f.g.game.run.time,time);assert.equal(f.counters.simulationFrames,frames);assert.equal(f.g.player.health,100)
      assert.equal(f.g.player.enabled,false);assert.equal(f.g.input.down('forward'),false)
      assert.equal(f.comms.querySelectorAll('.harbor-ch4-field').length,0)
      if(i<7)f.key('Space')
    }
    f.key('Enter',{repeat:true});assert.equal(calls.length,0)
    f.key(skip?'Escape':'Enter');assert.deepEqual(calls,[{skipped:skip}])
    assert.equal(f.g.game.state,'playing');assert.equal(f.g.player.damage,damage)
    assert.equal(f.narrative.openChapter4({onComplete:()=>calls.push('duplicate')}),false)
    f.g.events.emit('player:dead',{});f.g.game.start({skipIntro:true});f.frame()
    assert.equal(f.narrative.snapshot().chapter4Read,true);assert.equal(f.narrative.openChapter4(),false)
    assert.equal(f.narrative.markChapterRead(4,false),true);assert.equal(f.narrative.openChapter4(),true)
    f.narrative.cancelChapter4();f.g.game.resume()
    assert.equal(f.narrative.snapshot().chapter4Read,false)
    f.narrative.markChapterRead(4);f.actions.redeploy();assert.equal(f.narrative.snapshot().chapter4Read,false)
  }
})

test('CH4 replay is opt-in and repeatable after completion without starting gameplay or mutating facts', () => {
  const unavailable=fixture()
  assert.equal(unavailable.menu.querySelector('[data-harbor-replay-chapter4]'),null)
  const f=fixture({chapter4Available:true,nativeInput:true})
  assert.equal(f.narrative.markChapterRead(4),true);assert.equal(f.narrative.markChapterRead(99),false)
  f.narrative.setReplayProgress({chapter4Completed:true})
  for(const screen of ['title','paused']){
    if(screen==='paused'){f.g.game.start({skipIntro:true});f.frame();f.g.game.pause()}
    const before=JSON.stringify({run:f.g.game.run,resets:f.counters.resets,clears:f.counters.clears})
    const button=f.menu.querySelector(`[data-s="${screen}"] [data-harbor-replay-chapter4]`)
    button.click();assert.equal(f.narrative.snapshot().mode,'replay4')
    assert.match(f.menu.querySelector('.harbor-opening-dialog').getAttribute('aria-label'),/第四章/)
    for(let i=0;i<7;i++)f.key('ArrowRight')
    assert.match(f.comms.textContent,/CHAPTER 04/);f.key('Enter')
    assert.equal(f.g.game.state,screen);assert.equal(f.narrative.snapshot().chapter4Read,true)
    assert.equal(JSON.stringify({run:f.g.game.run,resets:f.counters.resets,clears:f.counters.clears}),before)
    assert.equal(f.narrative.replayChapter4(),true);f.key('Escape')
  }
})

test('CH5 opening freezes native simulation, movement, weapons and damage; skip/read survives retry only', () => {
  for (const skip of [false,true]) {
    const f=fixture({chapter5Available:true,armed:true,nativeInput:true}),calls=[]
    f.g.game.start({skipIntro:true});f.frame()
    const damage=f.g.player.damage,time=f.g.game.run.time,frames=f.counters.simulationFrames,shots=f.counters.shots
    assert.equal(f.narrative.openChapter5({onComplete:result=>{
      calls.push(result)
      assert.equal(f.g.game.state,'paused');assert.equal(f.narrative.snapshot().chapter5Read,true)
      f.g.player.damage(1000);assert.equal(f.g.player.health,100)
      assert.equal(f.narrative.skip(),false)
    }}),true)
    assert.equal(f.narrative.snapshot().phase,'chapter5');assert.equal(f.narrative.snapshot().cardCount,8)
    f.key('Enter');assert.equal(calls.length,0)
    for(let i=0;i<8;i++){
      assert.equal(f.comms.querySelector('.comms-t').textContent,campaignCh5Opening[i].text)
      f.key('KeyW');f.key('KeyR');f.key('Digit1');f.g.input.fire=true;f.g.player.damage(1000);f.frame(100)
      assert.equal(f.g.game.run.time,time);assert.equal(f.counters.simulationFrames,frames)
      assert.equal(f.counters.shots,shots);assert.equal(f.g.player.health,100)
      assert.equal(f.g.player.enabled,false);assert.equal(f.g.input.down('forward'),false)
      if(i<7)f.key(i%2?'ArrowRight':'Space')
    }
    f.key('ArrowLeft');assert.equal(f.narrative.snapshot().cardIndex,6);f.key('ArrowRight')
    f.key('Enter',{repeat:true});assert.equal(calls.length,0)
    f.key(skip?'Escape':'Enter');assert.deepEqual(calls,[{skipped:skip}])
    assert.equal(f.g.game.state,'playing');assert.equal(f.g.player.damage,damage)
    assert.equal(f.narrative.openChapter5(),false)
    f.g.events.emit('player:dead',{});f.g.game.start({skipIntro:true});f.frame()
    assert.equal(f.narrative.snapshot().chapter5Read,true);assert.equal(f.narrative.openChapter5(),false)
    f.narrative.markChapterRead(5,false);assert.equal(f.narrative.openChapter5(),true)
    f.narrative.cancelChapter5();f.g.game.resume();assert.equal(f.narrative.snapshot().chapter5Read,false)
    f.narrative.markChapterRead(5);f.actions.redeploy();assert.equal(f.narrative.snapshot().chapter5Read,false)
  }
})

test('CH5 power report uses the same paused modal and cannot start its clock while being read', () => {
  for (const skip of [false,true]) {
    const f=fixture({chapter5Available:true,armed:true,nativeInput:true}),calls=[]
    f.g.game.start({skipIntro:true});f.frame()
    f.narrative.markChapterRead(5)
    const damage=f.g.player.damage,time=f.g.game.run.time,frames=f.counters.simulationFrames
    assert.equal(f.narrative.openChapter5Power({onComplete:result=>{
      assert.equal(f.g.game.state,'paused');calls.push(result)
    }}),true)
    assert.equal(f.narrative.snapshot().phase,'chapter5Power');assert.equal(f.narrative.snapshot().cardCount,2)
    assert.equal(f.narrative.openChapter5Power(),false)
    f.key('Enter');assert.equal(calls.length,0)
    for(let i=0;i<2;i++){
      assert.equal(f.comms.querySelector('.comms-t').textContent,campaignCh5Power[i].text)
      f.g.player.damage(1000);f.key('KeyW');f.frame(1000)
      assert.equal(f.g.game.run.time,time);assert.equal(f.counters.simulationFrames,frames)
      assert.equal(f.g.player.enabled,false);assert.equal(f.g.player.health,100);assert.equal(calls.length,0)
      if(i===0)f.key('Space')
    }
    f.key(skip?'Escape':'Enter');assert.deepEqual(calls,[{skipped:skip}])
    assert.equal(f.g.game.state,'playing');assert.equal(f.g.player.damage,damage)
    f.frame();assert.ok(f.g.game.run.time>time)
    assert.equal(f.narrative.openChapter5(),false,'Supply report must not erase the entry read fact')
    assert.equal(f.narrative.openChapter5Power({onComplete:()=>calls.push('cancelled')}),true)
    assert.equal(f.narrative.cancelChapter5Power(),true);assert.equal(calls.length,1)
    f.g.game.resume();assert.equal(f.g.player.damage,damage)
  }
})

test('M5-A1 power Esc only browses to the last page; explicit continue is the sole combat handoff',()=>{
  const f=fixture({chapter5Available:true,armed:true,nativeInput:true}),calls=[]
  f.g.game.start({skipIntro:true});f.frame()
  const time=f.g.game.run.time
  assert.equal(f.narrative.openChapter5Power({requireConfirm:true,onComplete:r=>calls.push(r)}),true)
  f.key('Enter');assert.equal(calls.length,0)
  f.key('Escape');assert.equal(f.narrative.snapshot().cardIndex,1)
  f.key('Escape');f.frame(1000)
  assert.equal(f.g.game.run.time,time);assert.equal(f.g.game.state,'paused');assert.equal(calls.length,0)
  f.key('ArrowLeft');f.key('Enter');assert.equal(calls.length,0)
  f.key('Space');f.key('Enter')
  assert.deepEqual(calls,[{skipped:false}]);assert.equal(f.g.game.state,'playing')
  f.key('Enter');assert.equal(calls.length,1)
})

for (const report of [
  {name:'Control',cards:campaignCh5Control,action:'前往燃油阀',title:'仓库控制机关',source:'last-harbor-ch5-control'},
  {name:'Fault',cards:campaignCh5Fault,action:'前往维修柜',title:'燃油输送中断',source:'last-harbor-ch5-fault'},
]) {
  const open=`openChapter5${report.name}`,cancel=`cancelChapter5${report.name}`,mode=`chapter5${report.name}`
  test(`M5-B ${report.name} freezes native simulation and requires explicit final confirmation`,()=>{
    for(const control of ['Enter','NumpadEnter','button']){
      const f=fixture({chapter5Available:true,armed:true,nativeInput:true}),calls=[]
      f.g.game.start({skipIntro:true});f.frame();f.g.input.requestLock();f.flushLocks()
      f.narrative.markChapterRead(5)
      const damage=f.g.player.damage,time=f.g.game.run.time,frames=f.counters.simulationFrames,shots=f.counters.shots
      assert.equal(f.narrative[open]({requireConfirm:false,onComplete:result=>{
        calls.push(result)
        assert.equal(f.g.game.state,'paused');assert.equal(f.g.player.enabled,false)
        assert.equal(f.counters.audio.at(-1),true)
        f.g.player.damage(1000);assert.equal(f.g.player.health,100)
        assert.equal(f.narrative.skip(),false);assert.equal(f.narrative.start(),false)
      }}),true)
      assert.equal(f.narrative.snapshot().phase,mode);assert.equal(f.narrative.snapshot().cardCount,2)
      assert.equal(f.narrative[open](),false);assert.equal(f.narrative.openChapter5Power(),false)
      assert.match(f.menu.querySelector('.harbor-opening-dialog').getAttribute('aria-label'),new RegExp(report.title))
      assert.equal(f.menu.querySelector('.harbor-opening-skip').textContent,'跳至末页 · Esc')
      assert.equal(f.menu.querySelector('.harbor-opening-start').hidden,true)
      assert.match(f.menu.querySelector('.harbor-opening-help').textContent,new RegExp(`Enter ${report.action}`))
      f.key('Enter');assert.equal(calls.length,0)
      for(let page=0;page<2;page++){
        assert.equal(f.comms.querySelector('.comms-t').textContent,report.cards[page].text)
        assert.equal(f.counters.lines.at(-1).source,report.source)
        f.key('KeyW');f.key('KeyR');f.key('Digit1');f.g.input.fire=true;f.g.player.damage(1000);f.frame(1000)
        assert.equal(f.g.game.run.time,time);assert.equal(f.counters.simulationFrames,frames)
        assert.equal(f.counters.shots,shots);assert.equal(f.g.player.health,100)
        assert.equal(f.g.player.enabled,false);assert.equal(f.g.input.down('forward'),false)
        assert.equal(calls.length,0)
        if(page===0)f.key('Space')
      }
      f.key('ArrowLeft');f.key('Enter');assert.equal(calls.length,0)
      f.key('Escape');f.key('Escape');f.frame(1000)
      assert.equal(f.narrative.snapshot().cardIndex,1);assert.equal(f.g.game.state,'paused')
      assert.equal(f.g.game.run.time,time);assert.equal(calls.length,0)
      f.key('Enter',{repeat:true});assert.equal(calls.length,0)
      const button=f.menu.querySelector('.harbor-opening-start')
      assert.equal(button.textContent,`${report.action} · Enter`);assert.equal(button.hidden,false)
      if(control==='button')button.click();else f.key(control)
      assert.deepEqual(calls,[{skipped:false}]);assert.equal(f.g.game.state,'playing')
      assert.equal(f.g.player.damage,damage);assert.equal(f.g.game.flow.manualDialogue,undefined)
      assert.equal(f.g.player.enabled,true);assert.equal(f.g.input.down('fire'),false)
      assert.equal(f.narrative.snapshot().chapter5Read,true);assert.equal(f.narrative.openChapter5(),false)
      f.key('Enter');assert.equal(calls.length,1)
      f.flushLocks();f.flushLocks();assert.equal(f.g.input.locked,true)
      f.g.player.damage(5);assert.equal(f.g.player.health,95)
      f.frame();assert.ok(f.g.game.run.time>time)
      assert.equal(f.narrative[open]({onComplete:()=>calls.push('reread')}),true)
      assert.equal(f.narrative.snapshot().cardIndex,0);assert.equal(calls.length,1)
      f.narrative[cancel]();assert.equal(calls.length,1)
    }
  })

  test(`M5-B ${report.name} cancellation/death/new run never completes or changes the opening read fact`,()=>{
    for(const action of ['cancel','chapter-cancel','death','new-run']){
      const f=fixture({chapter5Available:true,armed:true,nativeInput:true}),calls=[]
      f.g.game.start({skipIntro:true});f.frame()
      const damage=f.g.player.damage
      assert.equal(f.narrative.snapshot().chapter5Read,false)
      f.narrative[open]({onComplete:result=>calls.push(result)});f.key('Escape')
      const otherCancel=report.name==='Control'?'cancelChapter5Fault':'cancelChapter5Control'
      assert.equal(f.narrative[otherCancel](),false);assert.equal(f.narrative.cancelChapter5Power(),false)
      if(action==='cancel'||action==='chapter-cancel'){
        assert.equal(f.narrative[action==='cancel'?cancel:'cancelChapter5'](),true)
        assert.equal(f.narrative[cancel](),false);assert.equal(f.g.game.state,'paused');f.g.game.resume()
      }else if(action==='death')f.g.events.emit('player:dead',{})
      else f.actions.redeploy()
      assert.equal(f.g.player.damage,damage);assert.equal(f.g.game.flow.manualDialogue,undefined)
      assert.equal(f.narrative.snapshot().chapter5Read,false);assert.deepEqual(calls,[])
    }
  })

  test(`M5-B ${report.name} opened during native update holds the outer tick and a failed commit remains paused`,()=>{
    const f=fixture({chapter5Available:true,armed:true,nativeInput:true})
    f.g.game.start({skipIntro:true});f.frame()
    const frames=f.counters.simulationFrames,weapons=f.counters.weaponFrames
    let calls=0
    f.duringUpdate(()=>{f.duringUpdate(null);f.narrative[open]({onComplete(){calls++;throw Error('CH5 task commit failed')}})})
    f.frame()
    assert.equal(f.narrative.snapshot().phase,mode);assert.equal(f.counters.simulationFrames,frames)
    assert.equal(f.counters.weaponFrames,weapons)
    const time=f.g.game.run.time
    f.key('Escape');assert.throws(()=>f.key('Enter'),/CH5 task commit failed/)
    f.key('Escape');f.key('Enter');f.frame(1000)
    assert.equal(calls,1);assert.equal(f.g.game.state,'paused');assert.equal(f.g.game.run.time,time)
    assert.equal(f.counters.audio.at(-1),true);assert.equal(f.narrative.snapshot().chapter5Read,false)
    assert.equal(f.narrative[cancel](),true)
  })
}
