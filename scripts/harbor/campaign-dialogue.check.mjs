import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { installCampaignDialogue } from './campaign-dialogue.mjs'
import { installNarrative } from './opening-narrative.mjs'
import { campaignCh1Guard } from './campaign-ch1-dialogue.mjs'

class Element {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase(); this.ownerDocument = ownerDocument
    this.children = []; this.dataset = {}; this.style = {}; this.attributes = new Map(); this.listeners = new Map()
    this.className = ''; this.hidden = false; this.scrollTop = 0; this.inert = false; this.disabled = false
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
  hasAttribute(name) { return this.attributes.has(name) }
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
  addEventListener(name, listener) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(listener) }
  removeEventListener(name, listener) { this.listeners.set(name, (this.listeners.get(name) || []).filter(value => value !== listener)) }
  dispatch(name, event) { for (const listener of [...this.listeners.get(name) || []]) { listener(event); if (event.stopped) break } if (!event.stopped) this.parentElement?.dispatch(name, event) }
  click() { if (!this.disabled) { this.focus(); this.dispatch('click', { target: this }) } }
  focus() { this.ownerDocument.activeElement = this; this.dispatch('focusin', { target: this }) }
  blur() { this.ownerDocument.activeElement = null }
}

function fixture({ narrative = false } = {}) {
  const doc = new Element('document')
  doc.createElement = tag => new Element(tag, doc)
  const add = (parent, tag, className = '', dataset = {}) => {
    const element = doc.createElement(tag); element.className = className; element.dataset = dataset
    parent.append(element); return element
  }
  const menu = add(doc, 'div', 'menu')
  for (const screen of ['title', 'paused']) add(add(menu, 'section', 'm-screen', { s: screen }), 'div', 'm-actions')
  const panel = add(menu, 'div', 'panel'); panel.hidden = true
  const location = add(menu, 'div', 'loc-card'); add(location, 'b'); add(location, 'span')
  const comms = add(doc, 'div', 'comms'); add(comms, 'span', 'comms-who'); add(comms, 'span', 'comms-t')
  const canvas = add(doc, 'canvas'); canvas.focus()
  const listeners = new Map(), calls = [], presentations = [], lines = [], radio = []
  let gameAction = null
  const counters = { game: 0, player: 0, weapon: 0, enemies: 0, fire: 0, lockExits: 0, lockRequests: 0, pauses: 0 }
  const g = {
    player: { enabled: true, alive: true, pos: { x: 0, y: 0, z: 0 }, yaw: 1, pitch: .2 },
    input: { gameplay: true, locked: true, move: { x: 1, y: 1 }, look: { dx: 2, dy: 2 }, fire: true, ads: true,
      setGameplay(value) { this.gameplay = value },
      requestLock() { counters.lockRequests++ },
      exitLock() { counters.lockExits++; this.locked = false; g.events.emit('input:lock', { locked: false }) },
    },
    events: {
      on(name, listener) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(listener) },
      emit(name, value) { for (const listener of listeners.get(name) || []) listener(value) },
    },
    weapon: { update() { counters.weapon++; if (g.input.gameplay && g.input.fire) counters.fire++ } },
    hud: { radio: value => radio.push(value), clearRadio() { radio.length = 0 }, show(value) { this.shown = value }, setPrompt() {} },
    game: { state: 'playing', flow: {}, run: { time: 12 }, menus: { root: menu, locationCard() {} },
      skipIntro() { if (this.state !== 'intro') return false; g.player.enabled = true; g.input.setGameplay(true); state('playing'); return true },
      pause() { counters.pauses++; state('paused') },
      update(dt) { counters.game++; if (this.state === 'playing') { this.run.time += dt; gameAction?.() }; return this.state === 'playing' },
    },
  }
  function state(value) {
    const prev = g.game.state; g.game.state = value
    g.events.emit('game:state', { state: value, prev })
  }
  // Contract port: root's audited mM lock-loss condition must include
  // !Yi.manualDialogue. This focused fixture does not verify the AST adapter.
  g.events.on('input:lock', ({ locked }) => { if (!locked && g.game.state === 'playing' && !g.game.flow.manualDialogue) g.game.pause() })
  g.events.on('radio:line', line => lines.push(line))
  let stage = 'dormant', grace = 0
  const guard = {
    request() { calls.push('request'); stage = 'requested'; return true },
    scan() { calls.push('scan'); stage = 'scanning'; return true },
    warn() { calls.push('warn'); stage = 'warning'; return true },
    release() { calls.push('release'); stage = 'released'; grace = 3.2; return true },
    present(dt) { presentations.push({ stage, dt }) },
    update(dt) { if (stage === 'released') { grace -= dt; if (grace <= 0) stage = 'hostile' } },
  }
  const opening = narrative ? installNarrative(g, undefined, { campaignM2: true }) : null
  const dialogue = installCampaignDialogue(g, { guard })
  function frame(dt = .05) {
    if (g.game.update(dt) !== false && !['title', 'paused'].includes(g.game.state)) {
      counters.player++; counters.enemies++
      if (g.input.gameplay && g.player.enabled) {
        g.player.pos.x += g.input.move.x; g.player.yaw += g.input.look.dx
      }
      g.weapon.update(dt); guard.update(dt)
    }
  }
  function key(code, { repeat = false, shiftKey = false } = {}) {
    const event = { code, repeat, shiftKey, preventDefault() { this.prevented = true }, stopImmediatePropagation() { this.stopped = true } }
    doc.dispatch('keydown', event); return event
  }
  const open = () => { guard.request(); return dialogue.open() }
  const step = count => { for (let index = 0; index < count; index++) key('ArrowRight') }
  return { g, doc, menu, panel, canvas, guard, dialogue, opening, counters, calls, presentations, lines, radio,
    frame, key, open, step, state, duringUpdate: action => { gameAction = action }, stage: () => stage }
}

test('guard cards preserve every supplied spoken line and both presentation directions', async () => {
  const source = await readFile(new URL('../../docs/harbor/第一关守卫扫描对白.md', import.meta.url), 'utf8')
  const spoken = source.match(/“[^”]+”/g)
  assert.equal(spoken.length, 9)
  assert.deepEqual(campaignCh1Guard.map(cue => cue.text.match(/“[^”]+”/)[0]), spoken)
  for (const direction of source.split('\n').filter(line => line.startsWith('机械守卫停止') || line.startsWith('机械守卫解除'))) {
    assert.ok(campaignCh1Guard.some(cue => cue.text.includes(direction)))
  }
  assert.deepEqual(campaignCh1Guard.flatMap((cue, index) => cue.milestone ? [[index, cue.milestone]] : []), [[3, 'scan'], [8, 'warn']])
})

test('manual dialogue freezes native simulation, movement, view and fire; only present advances', () => {
  const f = fixture(), before = JSON.stringify(f.g.player.pos), yaw = f.g.player.yaw
  assert.equal(f.open(), true)
  assert.deepEqual(f.calls, ['request'], 'Opening does not request or start scanning on its own')
  const time = f.g.game.run.time
  assert.equal(f.g.game.flow.manualDialogue, true)
  assert.equal(f.g.input.gameplay, false)
  assert.equal(f.g.player.enabled, false)
  assert.deepEqual(f.g.input.move, { x: 0, y: 0 })
  assert.deepEqual(f.g.input.look, { dx: 0, dy: 0 })
  assert.equal(f.g.input.fire, false)
  assert.equal(f.g.input.ads, false)
  assert.equal(f.counters.pauses, 0, 'Requires root manualDialogue lock-loss adapter')
  assert.equal(f.g.hud.shown, false)
  for (let index = 0; index < 2000; index++) f.frame()
  assert.equal(f.g.game.run.time, time)
  assert.equal(f.counters.game, 0)
  assert.equal(f.counters.player, 0)
  assert.equal(f.counters.enemies, 0)
  assert.equal(f.counters.fire, 0)
  assert.equal(f.counters.weapon, 2000, 'Hands update once while native outer loop is held')
  assert.equal(f.presentations.length, 2000)
  assert.ok(f.presentations.every(value => value.dt === .05 && value.stage === 'requested'))
  assert.equal(JSON.stringify(f.g.player.pos), before)
  assert.equal(f.g.player.yaw, yaw)
  assert.equal(f.dialogue.snapshot().cardIndex, 0)
  assert.deepEqual(f.calls, ['request'])
  f.g.hud.radio('unrelated radio'); assert.deepEqual(f.radio, [])
  for (const code of ['KeyW','KeyS','KeyA','KeyD','KeyE','KeyR','KeyQ','Digit1','Escape','Enter']) {
    const event = f.key(code); assert.equal(event.prevented, true); assert.equal(event.stopped, true)
  }
  assert.equal(f.dialogue.snapshot().cardIndex, 0)
})

test('forward-only milestones fire once; backwards review never replays scan or warning', () => {
  const f = fixture(); f.open(); f.step(2)
  assert.deepEqual(f.calls, ['request'])
  f.key('ArrowRight', { repeat: true }); assert.equal(f.dialogue.snapshot().cardIndex, 2)
  f.key('ArrowRight'); f.frame(1000)
  assert.deepEqual(f.calls, ['request', 'scan'])
  assert.equal(f.stage(), 'scanning')
  assert.equal(f.presentations.at(-1).stage, 'scanning')
  assert.equal(f.dialogue.snapshot().cardIndex, 3)
  f.key('ArrowLeft'); f.key('Space'); f.step(4)
  assert.deepEqual(f.calls, ['request', 'scan'])
  f.key('ArrowRight'); f.frame(1000)
  assert.deepEqual(f.calls, ['request', 'scan', 'warn'])
  assert.equal(f.stage(), 'warning')
  assert.equal(f.dialogue.snapshot().furthestIndex, 8)
  for (let index = 0; index < 8; index++) f.key('ArrowLeft')
  f.step(8)
  assert.deepEqual(f.calls, ['request', 'scan', 'warn'])
  f.key('Escape'); f.key('ArrowRight'); f.key('Space'); f.key('KeyW')
  assert.equal(f.dialogue.snapshot().active, true)
  assert.equal(f.g.input.gameplay, false)
  assert.equal(f.counters.fire, 0)
})

test('only final continue releases once and restores control before the guard-owned grace elapses', () => {
  for (const control of ['Enter', 'NumpadEnter', 'button']) {
    const f = fixture(); f.open(); f.key('Enter'); assert.deepEqual(f.calls, ['request'])
    f.step(8)
    if (control === 'button') f.menu.querySelector('.harbor-dialogue-continue').click()
    else f.key(control)
    assert.deepEqual(f.calls, ['request','scan','warn','release'])
    assert.equal(f.dialogue.snapshot().completed, true)
    assert.equal(f.dialogue.snapshot().controlsHeld, false)
    assert.equal(f.g.game.flow.manualDialogue, undefined)
    assert.equal(f.g.player.enabled, true)
    assert.equal(f.g.input.gameplay, true)
    assert.equal(f.g.hud.shown, true)
    assert.equal(f.counters.lockRequests, 1)
    assert.equal(f.doc.listeners.get('keydown').length, 0)
    f.menu.querySelector('.harbor-dialogue-continue').click()
    assert.deepEqual(f.calls, ['request','scan','warn','release'])
    assert.equal(f.dialogue.open(), false)
    f.frame(3.19); assert.equal(f.stage(), 'released')
    f.frame(.02); assert.equal(f.stage(), 'hostile')
    f.g.hud.radio('restored radio'); assert.deepEqual(f.radio, ['restored radio'])
  }
})

test('focus, panes, late pointer lock and detached snapshots use the existing card trap', () => {
  const f = fixture(); f.panel.inert = true
  assert.equal(installCampaignDialogue(f.g, { guard: f.guard }), f.dialogue)
  assert.deepEqual(Object.keys(f.dialogue).sort(), ['open','reset','snapshot'])
  f.open(); assert.equal(f.dialogue.open(), false)
  const next = f.menu.querySelector('.harbor-dialogue-next'), previous = f.menu.querySelector('.harbor-dialogue-previous')
  assert.equal(f.doc.activeElement, next)
  f.canvas.focus(); assert.equal(f.doc.activeElement, next)
  f.key('Tab'); assert.equal(f.doc.activeElement, next, 'Only next is enabled on first page')
  f.step(1); f.key('Tab', { shiftKey: true }); assert.equal(f.doc.activeElement, previous)
  f.key('Tab'); assert.equal(f.doc.activeElement, next)
  const exits = f.counters.lockExits
  f.g.events.emit('input:lock', { locked: true })
  assert.equal(f.counters.lockExits, exits + 1)
  assert.equal(f.counters.pauses, 0)
  f.step(7)
  assert.equal(f.doc.activeElement, f.menu.querySelector('.harbor-dialogue-continue'))
  const snapshot = f.dialogue.snapshot(); snapshot.milestones.push('fake'); snapshot.cardIndex = 999
  assert.deepEqual(f.dialogue.snapshot().milestones, ['scan','warn'])
  assert.equal(f.dialogue.snapshot().cardIndex, 8)
  f.key('Enter')
  assert.equal(f.menu.querySelector('.m-screen').inert, false)
  assert.equal(f.panel.inert, true, 'Existing inert pane state survives')
  assert.equal(f.doc.listeners.get('focusin').length, 0)
  assert.equal(f.menu.querySelectorAll('.harbor-campaign-dialogue').length, 1)
})

test('death and new-run reset remove the modal without emitting release or retaining milestones', () => {
  for (const target of ['dead','title','intro']) {
    const f = fixture(); f.open(); f.step(8)
    f.state(target)
    assert.deepEqual(f.calls, ['request','scan','warn'])
    assert.deepEqual(f.dialogue.snapshot(), { active: false, completed: false, cardIndex: -1,
      cardCount: 9, furthestIndex: -1, elapsed: 0, controlsHeld: false, milestones: [] })
    assert.equal(f.g.game.flow.manualDialogue, undefined)
    assert.equal(f.doc.listeners.get('keydown').length, 0)
    assert.equal(f.doc.listeners.get('focusin').length, 0)
    f.state('playing'); f.g.player.enabled = true
    assert.equal(f.open(), true); f.step(8)
    assert.deepEqual(f.calls, ['request','scan','warn','request','scan','warn'])
    f.dialogue.reset(); f.dialogue.reset()
    assert.equal(f.g.input.gameplay, true)
    assert.equal(f.g.player.enabled, true)
    assert.equal(f.dialogue.snapshot().completed, false)
  }
})

test('external pause suspends the modal and resume restores the same card and held controls', () => {
  const f = fixture(); f.open(); f.step(4); f.state('paused')
  assert.equal(f.menu.querySelector('.harbor-campaign-dialogue').hidden, true)
  assert.equal(f.menu.getAttribute('data-harbor-narrative'), null)
  assert.equal(f.key('Enter').stopped, undefined, 'Native paused menu receives its keys')
  f.frame(10)
  assert.equal(f.counters.game, 1)
  assert.equal(f.presentations.length, 0)
  f.g.input.setGameplay(true); f.state('playing')
  assert.equal(f.dialogue.snapshot().cardIndex, 4)
  assert.equal(f.menu.querySelector('.harbor-campaign-dialogue').hidden, false)
  assert.equal(f.g.input.gameplay, false)
  assert.deepEqual(f.calls, ['request','scan'])
})

test('opening the modal during native game.update holds the remainder of that same simulation tick', () => {
  const f = fixture()
  f.duringUpdate(f.open); f.frame()
  assert.equal(f.counters.game, 1)
  assert.equal(f.dialogue.snapshot().active, true)
  assert.equal(f.presentations.length, 1)
  assert.equal(f.counters.player, 0)
  assert.equal(f.counters.enemies, 0)
})

test('guard reset cannot steal the new opening modal attribute, listeners or pane focus', () => {
  const f = fixture({ narrative: true }); f.open(); f.step(4)
  f.g.player.enabled = false; f.g.input.setGameplay(false); f.state('intro')
  assert.equal(f.dialogue.snapshot().active, false)
  assert.equal(f.opening.snapshot().active, true)
  assert.equal(f.menu.getAttribute('data-harbor-narrative'), 'intro')
  assert.equal(f.menu.querySelector('.m-screen').inert, true)
  assert.equal(f.doc.listeners.get('keydown').length, 1)
  assert.equal(f.doc.listeners.get('focusin').length, 1)
  assert.equal(f.doc.activeElement, f.menu.querySelector('.harbor-opening-next'))
})
