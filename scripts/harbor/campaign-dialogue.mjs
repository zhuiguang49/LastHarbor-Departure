import { campaignCh1Guard as cards } from './campaign-ch1-dialogue.mjs'
import { installNarrativeStyles, trapNarrativeTab } from './opening-narrative.mjs'

const installed = new WeakMap()

// Root validates a fresh E press, pistol, range, facing and LOS, then calls
// guard.request() before open(). Only the native loop presents the scan.
export function installCampaignDialogue(g, { guard }) {
  if (installed.has(g)) return installed.get(g)
  const menu = g.game.menus.root, doc = menu.ownerDocument
  installNarrativeStyles(menu)
  const dialog = doc.createElement('section')
  dialog.className = 'harbor-opening-dialog harbor-campaign-dialogue'
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', '机械守卫 · 手动对白')
  dialog.tabIndex = -1; dialog.hidden = true
  const body = doc.createElement('div'); body.className = 'harbor-opening-body'
  const comms = doc.createElement('div'); comms.className = 'comms on'
  const who = doc.createElement('span'); who.className = 'comms-who'
  const text = doc.createElement('span'); text.className = 'comms-t'
  comms.append(who, text); body.append(comms)
  const nav = doc.createElement('nav'); nav.className = 'harbor-opening-nav'
  nav.setAttribute('aria-label', '守卫对白导航')
  function button(className, label, action, parent) {
    const element = doc.createElement('button')
    element.className = `btn ${className}`; element.type = 'button'; element.textContent = label
    element.addEventListener('click', action); parent.append(element)
    return element
  }
  const previousButton = button('harbor-dialogue-previous', '← 上一条', () => move(-1), nav)
  const count = doc.createElement('span'); count.className = 'harbor-opening-count'
  count.setAttribute('aria-live', 'polite'); nav.append(count)
  const nextButton = button('harbor-dialogue-next', '下一条 →', () => move(1), nav)
  body.append(nav)
  const continueButton = button('primary harbor-opening-start harbor-dialogue-continue', '寻找掩体 · Enter', dismiss, body)
  const help = doc.createElement('p'); help.className = 'harbor-opening-help'
  help.textContent = '← / → 或 Space 翻页 · 最后一条按 Enter 恢复行动 · 随后守卫短暂预警再开火'
  body.append(help); dialog.append(body); menu.append(dialog)
  let active = false, completed = false, cardIndex = -1, furthestIndex = -1, elapsed = 0, saved = null
  const milestones = new Set()
  const radio = g.hud.radio
  g.hud.radio = function (...args) { if (!active) return radio.apply(this, args) }

  function holdControls() {
    g.input.setGameplay(false)
    g.player.enabled = false
    if (g.input.move) Object.assign(g.input.move, { x: 0, y: 0 })
    if (g.input.look) Object.assign(g.input.look, { dx: 0, dy: 0 })
    for (const key of ['fire', 'ads', 'sprint', 'crouch']) g.input[key] = false
  }
  function focusAction() {
    (cardIndex === cards.length - 1 ? continueButton : nextButton).focus({ preventScroll: true })
  }
  function trapFocus(event) { if (active && g.game.state === 'playing' && !dialog.contains(event.target)) focusAction() }
  function showModal(visible) {
    dialog.hidden = !visible
    if (visible) menu.setAttribute('data-harbor-narrative', 'guard')
    else if (menu.getAttribute('data-harbor-narrative') === 'guard') menu.removeAttribute('data-harbor-narrative')
    for (const pane of saved.panes) pane.element.inert = visible ? true : pane.inert
  }
  function showCard() {
    const cue = cards[cardIndex]
    body.scrollTop = 0
    who.textContent = cue.who; text.textContent = cue.text
    count.textContent = `${String(cardIndex + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`
    previousButton.disabled = cardIndex === 0
    nextButton.disabled = cardIndex === cards.length - 1
    continueButton.hidden = cardIndex !== cards.length - 1
    if (cardIndex > furthestIndex) {
      furthestIndex = cardIndex
      if (cue.milestone && !milestones.has(cue.milestone)) {
        guard[cue.milestone]()
        milestones.add(cue.milestone)
      }
    }
    g.events.emit('radio:line', { ...cue, source: 'last-harbor-guard' })
    if (doc.activeElement?.disabled || doc.activeElement?.hidden) focusAction()
  }
  function move(offset) {
    if (!active) return false
    const index = Math.max(0, Math.min(cards.length - 1, cardIndex + offset))
    if (index === cardIndex) return false
    cardIndex = index; showCard(); return true
  }
  function keydown(event) {
    if (!active || g.game.state !== 'playing' || event.isComposing) return
    if (trapNarrativeTab(event, doc, [previousButton, nextButton, continueButton])) return
    event.preventDefault(); event.stopImmediatePropagation()
    if (event.repeat) return
    if (event.code === 'ArrowLeft') move(-1)
    else if (['ArrowRight', 'Space'].includes(event.code)) move(1)
    else if (['Enter', 'NumpadEnter'].includes(event.code)) dismiss()
  }
  function open() {
    if (active || completed || g.game.state !== 'playing' || g.player.alive === false) return false
    saved = { focus: doc.activeElement, enabled: g.player.enabled,
      manualDialogue: g.game.flow.manualDialogue,
      panes: [...menu.querySelectorAll('.m-screen'), menu.querySelector('.panel')].filter(Boolean).map(element => ({ element, inert: element.inert })) }
    active = true; elapsed = 0; cardIndex = 0; furthestIndex = -1; milestones.clear()
    // The audited native lock-loss adapter must honor this flag, as it honors
    // manualIntro. Releasing the cursor must not open the native pause menu.
    g.game.flow.manualDialogue = true
    holdControls(); g.hud.clearRadio(); g.hud.show(false); g.hud.setPrompt(null)
    showModal(true)
    doc.addEventListener('keydown', keydown, true)
    doc.addEventListener('focusin', trapFocus, true)
    g.input.exitLock()
    showCard(); focusAction(); return true
  }
  function close(resume) {
    if (!active) return
    const previous = saved
    active = false; saved = null; dialog.hidden = true
    doc.removeEventListener('keydown', keydown, true)
    doc.removeEventListener('focusin', trapFocus, true)
    const otherModal = menu.hasAttribute('data-harbor-narrative') && menu.getAttribute('data-harbor-narrative') !== 'guard'
    if (!otherModal) {
      menu.removeAttribute('data-harbor-narrative')
      for (const pane of previous.panes) pane.element.inert = pane.inert
    }
    g.game.flow.manualDialogue = previous.manualDialogue
    g.player.enabled = resume ? previous.enabled : false
    if (resume) {
      g.input.setGameplay(true); g.hud.show(true); g.input.requestLock()
    }
    if (dialog.contains(doc.activeElement)) doc.activeElement.blur()
    if (!resume && !otherModal) previous.focus?.focus({ preventScroll: true })
  }
  function dismiss() {
    if (!active || cardIndex !== cards.length - 1 || g.game.state !== 'playing') return false
    // release() starts the guard-owned >=3.2s grace; it must never fire here.
    guard.release(); milestones.add('release'); completed = true
    close(true); return true
  }
  function reset() {
    close(g.game.state === 'playing' && g.player.alive !== false)
    completed = false; cardIndex = -1; furthestIndex = -1; elapsed = 0; milestones.clear()
  }
  g.events.on('input:lock', ({ locked }) => { if (active && locked) g.input.exitLock() })
  g.events.on('game:state', ({ state }) => {
    if (['intro', 'dead', 'title', 'complete'].includes(state)) reset()
    else if (active) {
      holdControls(); showModal(state === 'playing')
      if (state === 'playing') focusAction()
    }
  })
  const update = g.game.update
  g.game.update = function (dt) {
    const result = active && g.game.state === 'playing' ? false : update.call(this, dt)
    if (!active) return result
    holdControls()
    if (g.game.state === 'playing') {
      elapsed += dt; guard.present(dt)
      // The outer loop omits weapon.update when held. Native hand transforms
      // still settle once per frame, with every combat input disabled.
      g.weapon.update?.(dt)
    }
    return false
  }
  const api = { open, reset, snapshot: () => ({ active, completed, cardIndex, cardCount: cards.length,
    furthestIndex, elapsed, controlsHeld: active, milestones: [...milestones] }) }
  installed.set(g, api)
  return api
}
