import { campaignCh3Testimony as cards } from './campaign-ch3-dialogue.mjs'
import { installNarrativeStyles, trapNarrativeTab } from './opening-narrative.mjs'

const installed = new WeakMap()

// The campaign owner validates the fresh interaction, rescue state and range.
// Only final confirmation reports testimony completion; facts belong to root.
export function installChapter3Conversation(g, { onComplete } = {}) {
  if (installed.has(g)) return installed.get(g)
  const menu = g.game.menus.root, doc = menu.ownerDocument
  installNarrativeStyles(menu)
  const style = doc.createElement('style')
  style.textContent = `
    .harbor-ch3-conversation .harbor-opening-body { overflow:hidden; }
    .harbor-ch3-conversation .comms { min-height:0; overflow-y:auto; flex:1 1 auto; }
    .harbor-ch3-conversation .harbor-ch3-speaker { color:var(--signal); }
    .harbor-ch3-conversation .harbor-opening-nav,
    .harbor-ch3-conversation .harbor-opening-start,
    .harbor-ch3-conversation .harbor-opening-help { flex-shrink:0; }
  `
  menu.append(style)
  const dialog = doc.createElement('section')
  dialog.className = 'harbor-opening-dialog harbor-ch3-conversation'
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', '许工的证词 · 手动对白')
  dialog.tabIndex = -1; dialog.hidden = true
  const body = doc.createElement('div'); body.className = 'harbor-opening-body'
  const comms = doc.createElement('div'); comms.className = 'comms on'
  const who = doc.createElement('span'); who.className = 'comms-who'
  const text = doc.createElement('span'); text.className = 'comms-t'
  comms.append(who, text); body.append(comms)
  const nav = doc.createElement('nav'); nav.className = 'harbor-opening-nav'
  nav.setAttribute('aria-label', '许工证词导航')
  function button(className, label, action, parent = dialog) {
    const element = doc.createElement('button')
    element.className = `btn ${className}`; element.type = 'button'; element.textContent = label
    element.addEventListener('click', action); parent.append(element)
    return element
  }
  const cancelButton = button('small harbor-opening-close', '暂时离开 · Esc', () => closeAndResume(false))
  const previousButton = button('harbor-dialogue-previous', '← 上一条', () => move(-1), nav)
  const count = doc.createElement('span'); count.className = 'harbor-opening-count'
  count.setAttribute('aria-live', 'polite'); nav.append(count)
  const nextButton = button('harbor-dialogue-next', '下一条 →', () => move(1), nav)
  body.append(nav)
  const continueButton = button('primary harbor-opening-start harbor-dialogue-continue', '结束交谈 · Enter', () => closeAndResume(true), body)
  const help = doc.createElement('p'); help.className = 'harbor-opening-help'
  help.textContent = '← / → 或 Space 翻页 · 滚轮阅读长页 · 最后一页 Enter 完成交谈 · Esc 暂时离开'
  body.append(help); dialog.append(body); menu.append(dialog)
  let active = false, completed = false, finishing = false, cardIndex = -1, saved = null
  let relock = false, unlockPending = false
  const radio = g.hud.radio
  g.hud.radio = function (...args) { if (!active) return radio.apply(this, args) }

  function holdControls(clear = false) {
    if (clear) g.input.setGameplay(true)
    g.input.setGameplay(false); g.input.endFrame?.()
    g.player.enabled = false
    if (g.input.move) Object.assign(g.input.move, { x: 0, y: 0 })
    if (g.input.look) Object.assign(g.input.look, { dx: 0, dy: 0 })
    for (const key of ['fire', 'ads', 'sprint', 'crouch']) g.input[key] = false
  }
  function focusAction() {
    (cardIndex === cards.length - 1 ? continueButton : nextButton).focus({ preventScroll: true })
  }
  function trapFocus(event) { if (active && g.game.state === 'paused' && !dialog.contains(event.target)) focusAction() }
  function showCard() {
    const cue = cards[cardIndex]
    body.scrollTop = 0; comms.scrollTop = 0; who.textContent = cue.who; text.textContent = ''
    cue.text.split('\n\n').forEach((paragraph,index) => {
      if (index) text.append('\n\n')
      if (paragraph === '许工：' || paragraph === '玩家：') {
        const speaker = doc.createElement('span'); speaker.className = 'harbor-ch3-speaker'
        speaker.textContent = paragraph === '玩家：' ? '你：' : paragraph
        text.append(speaker)
      } else text.append(paragraph)
    })
    count.textContent = `${String(cardIndex + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`
    previousButton.disabled = cardIndex === 0; nextButton.disabled = cardIndex === cards.length - 1
    continueButton.hidden = cardIndex !== cards.length - 1
    if (doc.activeElement?.disabled || doc.activeElement?.hidden) focusAction()
    g.events.emit('radio:line', { ...cue, source: 'last-harbor-ch3-testimony' })
  }
  function move(offset) {
    if (!active || finishing) return false
    const index = Math.max(0, Math.min(cards.length - 1, cardIndex + offset))
    if (index === cardIndex) return false
    cardIndex = index; showCard(); return true
  }
  function keydown(event) {
    if (!active) return
    if (trapNarrativeTab(event, doc, [cancelButton, previousButton, nextButton, continueButton])) return
    event.preventDefault(); event.stopImmediatePropagation()
    if (event.repeat || event.isComposing) return
    if (event.code === 'ArrowLeft') move(-1)
    else if (['ArrowRight', 'Space'].includes(event.code)) move(1)
    else if (['Enter', 'NumpadEnter'].includes(event.code)) closeAndResume(true)
    else if (event.code === 'Escape') closeAndResume(false)
  }
  function open() {
    if (active || completed || menu.getAttribute('data-harbor-narrative') || g.game.flow.manualDialogue ||
      g.game.menus.panelOpen || g.game.state !== 'playing' || g.player.alive === false) return false
    const held = { focus: doc.activeElement, enabled: g.player.enabled, manualDialogue: g.game.flow.manualDialogue,
      damage: g.player.damage, blockDamage() {},
      panes: [...menu.querySelectorAll('.m-screen'), menu.querySelector('.panel')].filter(Boolean).map(element => ({ element, inert: element.inert })) }
    g.game.flow.manualDialogue = true; g.player.damage = held.blockDamage
    holdControls(true); g.game.pause()
    g.hud.clearRadio(); g.hud.setPrompt(null); g.weapon.equipmentView?.cancelActions()
    saved = held; active = true; finishing = false; cardIndex = 0; relock = false
    for (const pane of saved.panes) pane.element.inert = true
    menu.setAttribute('data-harbor-narrative', 'ch3-conversation'); dialog.hidden = false
    doc.addEventListener('keydown', keydown, true); doc.addEventListener('focusin', trapFocus, true)
    g.input.exitLock(); showCard(); focusAction(); return true
  }
  function close() {
    const previous = saved
    active = false; saved = null; dialog.hidden = true; relock = false; unlockPending = true
    doc.removeEventListener('keydown', keydown, true); doc.removeEventListener('focusin', trapFocus, true)
    const otherModal = menu.getAttribute('data-harbor-narrative') && menu.getAttribute('data-harbor-narrative') !== 'ch3-conversation'
    if (!otherModal) {
      menu.removeAttribute('data-harbor-narrative')
      for (const pane of previous.panes) pane.element.inert = pane.inert
    }
    if (g.player.damage === previous.blockDamage) g.player.damage = previous.damage
    g.game.flow.manualDialogue = previous.manualDialogue
    if (['paused', 'playing'].includes(g.game.state)) g.player.enabled = previous.enabled
    g.hud.clearRadio()
    if (dialog.contains(doc.activeElement)) doc.activeElement.blur()
    if (g.game.state === 'paused' && !otherModal) previous.focus?.focus({ preventScroll: true })
  }
  function closeAndResume(complete) {
    if (!active || finishing || g.game.state !== 'paused' || g.player.alive === false || complete && cardIndex !== cards.length - 1) return false
    finishing = true
    const current = saved
    holdControls(true)
    if (complete) {
      // Commit parent-owned facts while the world and damage remain held.
      completed = true; onComplete?.()
    }
    if (!active || saved !== current) return true
    close()
    relock = g.input.mode === 'lock' && g.input.locked && !g.input.touch
    g.game.resume(); return true
  }
  function reset() {
    if (active) { holdControls(true); close() }
    completed = false; finishing = false; cardIndex = -1
  }
  g.events.on('narrative:open', () => { if (active) reset() })
  g.events.on('input:lock', ({ locked }) => {
    if (locked && (active || unlockPending && g.game.state !== 'playing')) g.input.exitLock()
    else if (relock && !locked) {
      relock = false
      if (!active && g.game.state === 'playing' && g.player.alive !== false) g.input.requestLock()
    }
  })
  g.events.on('game:state', ({ state, prev }) => {
    if (state !== 'playing' || prev !== 'paused') relock = false
    if (active) close()
    if (['playing', 'intro'].includes(state)) unlockPending = false
    if (['dead', 'title', 'intro', 'complete'].includes(state)) reset()
  })
  const update = g.game.update
  g.game.update = function (dt) {
    if (active) { holdControls(); return false }
    const result = update.call(this, dt)
    if (active) { holdControls(); return false }
    return result
  }
  const api = { open, reset, snapshot: () => ({ active, completed, cardIndex, cardCount: cards.length, controlsHeld: active }) }
  installed.set(g, api)
  return api
}
