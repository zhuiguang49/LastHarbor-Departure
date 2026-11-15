// Install after infrastructure/equipment and before deployment. The audited mM
// adapter honors flow.manualIntro and exposes the non-resetting skipIntro().
// Camera/rendering stay in the original loop; only card inputs end this intro.
import { campaignCh1Opening, campaignCh1Arrival } from './campaign-ch1-dialogue.mjs'
import { campaignCh2Opening } from './campaign-ch2-dialogue.mjs'
import { campaignCh3Opening } from './campaign-ch3-dialogue.mjs'
import { campaignCh4Opening } from './campaign-ch4-dialogue.mjs'
import { campaignCh5Opening, campaignCh5Power, campaignCh5Control, campaignCh5Fault } from './campaign-ch5-dialogue.mjs'

const chapter5Reports = {
  chapter5Power: { cards:campaignCh5Power, name:'中央应急电力恢复', action:'继续行动', source:'last-harbor-ch5-power' },
  chapter5Control: { cards:campaignCh5Control, name:'仓库控制机关', action:'前往燃油阀', source:'last-harbor-ch5-control' },
  chapter5Fault: { cards:campaignCh5Fault, name:'燃油输送中断', action:'前往维修柜', source:'last-harbor-ch5-fault' },
}

const cues = [
  { who: '灾变第七日', text: '2029 年 11 月 17 日 · 23:47\n紫金港 · 第七封锁区' },
  { who: '七天前', text: '失联的远洋货轮驶入紫金港。异常感染、失踪与袭击随之蔓延。' },
  { who: '撤离中断', text: '封锁与撤离相继失败。对外通讯中断，港区大部断电。' },
  { who: '最后的滞留者', text: '我是参与撤离保障的平民应急维修技术员。停电中，我与同事失联。' },
  { who: '天亮之前', text: '七号泊位或许还有工作艇。恢复供电、解除封锁、启动燃油系统，我得在天亮前离港。' },
  { who: '无线电杂音 · 七号泊位', text: '“这里是七号泊位……最后一班船……”' },
  { who: '另一道声音突然插入', text: '“别去……他们在……不要相信广播！”［信号中断］' },
]
const hint = '我得先去安保检查站。那里或许还留着自卫装备。'
const installed = new WeakMap()
const styled = new WeakSet()

// Narrative modals use the native comms/button styles and the same card
// layout and keyboard focus order. No separate UI/render loop is installed.
export function installNarrativeStyles(menu) {
  if (styled.has(menu)) return
  styled.add(menu)
  const doc = menu.ownerDocument
  const style = doc.createElement('style')
  style.textContent = `
    .comms:not([data-harbor-opening]) .comms-t { white-space:pre-line; }
    .menu[data-harbor-narrative] > .m-screen, .menu[data-harbor-narrative] > .panel { visibility:hidden; }
    .harbor-opening-dialog { position:absolute; inset:0; z-index:7; pointer-events:auto; }
    .harbor-opening-dialog[hidden], .harbor-opening-dialog [hidden] { display:none !important; }
    .harbor-opening-dialog:focus { outline:none; }
    .harbor-opening-dialog .btn:focus-visible { outline:2px solid var(--signal); outline-offset:4px; }
    .harbor-opening-skip, .harbor-opening-close { position:absolute; top:calc(24px + var(--sat)); right:max(24px, var(--gr)); }
    .harbor-opening-body { position:absolute; bottom:calc(48px + var(--sab)); left:50%; transform:translateX(-50%); width:min(680px, calc(100vw - 48px)); display:flex; flex-direction:column; gap:24px; max-height:calc(100% - 120px - var(--sat) - var(--sab)); overflow-y:auto; padding:8px; }
    .harbor-opening-body .comms { position:static; inset:auto; transform:none; width:auto; opacity:1; }
    .harbor-opening-body .comms-who { font-size:12px; line-height:16px; }
    .harbor-opening-body .comms-t { font-size:18px; line-height:28px; white-space:pre-line; text-wrap:pretty; }
    .harbor-opening-nav { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:16px; }
    .harbor-opening-nav .btn { padding:8px 16px; font-size:14px; line-height:20px; letter-spacing:.08em; }
    .harbor-opening-nav .btn:disabled { opacity:.35; cursor:default; }
    .harbor-opening-count { font:400 14px/20px var(--f-mono); font-variant-numeric:tabular-nums; color:var(--bone-dim); white-space:nowrap; }
    .harbor-opening-body .harbor-opening-start { align-self:center; padding:8px 24px; font-size:18px; line-height:28px; }
    .menu .harbor-opening-help { font:400 12px/16px var(--f-label); color:var(--bone-dim); text-align:center; }
    @media (max-width:480px) { .harbor-opening-body { width:calc(100vw - 32px); bottom:calc(24px + var(--sab)); gap:16px; } .harbor-opening-nav { gap:8px; } .harbor-opening-nav .btn { padding:8px; } }
  `
  menu.append(style)
}

export function trapNarrativeTab(event, doc, buttons) {
  if (event.code !== 'Tab') return false
  const available = buttons.filter(element => !element.hidden && !element.disabled)
  const current = available.indexOf(doc.activeElement)
  const target = (current + (event.shiftKey ? -1 : 1) + available.length) % available.length
  event.preventDefault(); event.stopImmediatePropagation()
  available[target].focus({ preventScroll: true })
  return true
}

export function installNarrative(g, equipment, { campaignM2 = false, campaignM3 = false, chapter3Available = false, chapter4Available = false, chapter5Available = false } = {}) {
  if (installed.has(g)) return installed.get(g)
  if (typeof g.game.skipIntro !== 'function') throw Error('Opening narrative requires the non-resetting mM game.skipIntro() adapter')
  const openingCards = campaignM3 ? campaignCh3Opening : campaignM2 ? [...campaignCh1Opening, ...campaignCh1Arrival] : cues
  let cards = openingCards, chapter = 0
  const menu = g.game.menus.root, doc = menu.ownerDocument
  const comms = doc.querySelector('.comms'), who = comms.querySelector('.comms-who'), text = comms.querySelector('.comms-t')
  const location = menu.querySelector('.loc-card')
  // The decorative, opacity-hidden card must not cover the CH4 title actions.
  if (chapter4Available || chapter5Available) location.style.pointerEvents = 'none'
  installNarrativeStyles(menu)
  const dialog = doc.createElement('section')
  dialog.className = 'harbor-opening-dialog'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', '开场广播 · 手动翻页')
  dialog.tabIndex = -1
  dialog.hidden = true
  const body = doc.createElement('div')
  body.className = 'harbor-opening-body'
  const nav = doc.createElement('nav')
  nav.className = 'harbor-opening-nav'
  nav.setAttribute('aria-label', '广播卡片导航')
  function button(className, label, action, parent = dialog) {
    const element = doc.createElement('button')
    element.className = `btn ${className}`; element.type = 'button'; element.textContent = label
    element.addEventListener('click', action)
    parent.append(element)
    return element
  }
  const skipButton = button('small harbor-opening-skip', '跳过开场 · Esc', skip)
  const closeButton = button('small harbor-opening-close', '返回标题页', closeReplay)
  const previousButton = button('harbor-opening-previous', '← 上一条', previous, nav)
  const count = doc.createElement('span')
  count.className = 'harbor-opening-count'; count.setAttribute('aria-live', 'polite'); nav.append(count)
  const nextButton = button('harbor-opening-next', '下一条 →', next, nav)
  body.append(nav)
  const startButton = button('primary harbor-opening-start', '进入末港 · Enter', start, body)
  const help = doc.createElement('p')
  help.className = 'harbor-opening-help'
  body.append(help); dialog.append(body); menu.append(dialog)
  const replayButtons = []
  const chapter2ReplayButtons = []
  const chapter3ReplayButtons = []
  const chapter4ReplayButtons = []
  for (const screen of ['title', 'paused']) {
    const actions = menu.querySelector(`[data-s="${screen}"] .m-actions`)
    if (!campaignM3) {
      const element = button('', campaignM2 ? '回看第一章开场广播' : '回看开场广播', () => replay(element), actions)
      element.dataset.harborReplay = 'true'
      replayButtons.push(element)
    }
    if (campaignM2) {
      const ch2 = button('', '回看第二章 · 没有灯的路', () => replayChapter2(ch2), actions)
      ch2.dataset.harborReplayChapter2 = 'true'
      chapter2ReplayButtons.push(ch2)
    }
    if (chapter3Available) {
      const ch3 = button('', '回看第三章 · 清除命令', () => replayChapter3(ch3), actions)
      ch3.dataset.harborReplayChapter3 = 'true'
      chapter3ReplayButtons.push(ch3)
    }
    if (chapter4Available) {
      const ch4 = button('', '回看第四章 · 封锁线', () => replayChapter4(ch4), actions)
      ch4.dataset.harborReplayChapter4 = 'true'
      chapter4ReplayButtons.push(ch4)
    }
  }
  location.querySelector('b').textContent = '紫金港 · 第七封锁区'
  location.querySelector('span').textContent = '2029.11.17 · 23:47\n灾变第七日 · 暴雨持续中'
  location.querySelector('span').style.whiteSpace = 'pre-line'
  g.game.flow.manualIntro = true
  let mode = null, elapsed = 0, cardIndex = -1, introSeen = false, skipped = false, pendingHint = false, saved = null
  let onChapterComplete = null, completingChapter = false
  let chapterRelock = false
  let chapterUnlockPending = false
  let chapter4Read = false
  let chapter5Read = false
  let replayCompleted = new Set()
  const campaignReplay = campaignM2 || campaignM3 || chapter3Available || chapter4Available || chapter5Available
  const canReplay = number => !campaignReplay || replayCompleted.has(number)
  function setReplayProgress(flags = {}) {
    replayCompleted = new Set([flags.blackboxEntered, flags.berth6Reached, flags.chapter3Completed, flags.chapter4Completed]
      .flatMap((completed, index) => completed ? [index + 1] : []))
    for (const [index, buttons] of [replayButtons, chapter2ReplayButtons, chapter3ReplayButtons, chapter4ReplayButtons].entries())
      for (const button of buttons) {
        button.disabled = !canReplay(index + 1)
        button.hidden = button.disabled
        button.style.display = button.hidden ? 'none' : ''
      }
  }
  setReplayProgress()
  const chapterName = () => `第${chapter === 2 ? '二' : chapter === 4 ? '四' : chapter === 5 ? '五' : '三'}章`
  const isReplay = () => ['replay', 'replay2', 'replay3', 'replay4'].includes(mode)
  const isChapter = () => ['chapter2', 'chapter3', 'chapter4', 'chapter5'].includes(mode) || Object.hasOwn(chapter5Reports, mode)
  const isMain = () => mode === 'intro' || isChapter()
  const radio = g.hud.radio
  g.hud.radio = function (...args) { if (!mode) return radio.apply(this, args) }

  function focusAction() {
    const element = cardIndex === cards.length - 1 ? (isMain() ? startButton : closeButton) : nextButton
    element.focus({ preventScroll: true })
  }
  function showCard() {
    const cue = cards[cardIndex]
    body.scrollTop = 0
    who.textContent = cue.who; text.textContent = cue.text
    comms.setAttribute('data-harbor-opening', '')
    comms.classList.add('on')
    const arrival = !chapter && campaignM2 && cardIndex >= campaignCh1Opening.length
    const index = arrival ? cardIndex - campaignCh1Opening.length : cardIndex
    const total = !chapter && campaignM2 ? (arrival ? campaignCh1Arrival.length : campaignCh1Opening.length) : cards.length
    count.textContent = `${arrival ? '抵达 · ' : ''}${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`
    previousButton.disabled = cardIndex === 0
    nextButton.disabled = cardIndex === cards.length - 1
    startButton.hidden = !isMain() || cardIndex !== cards.length - 1
    skipButton.hidden = !isMain() || arrival
    startButton.textContent = chapter5Reports[mode] ? `${chapter5Reports[mode].action} · Enter` : mode === 'chapter5' ? '开始行动 · Enter' : isChapter() ? `继续${chapterName()} · Enter` : campaignM3 ? '进入六号泊位 · Enter' : campaignM2 ? '开始行动 · Enter' : '进入末港 · Enter'
    if (doc.activeElement?.disabled || doc.activeElement?.hidden) focusAction()
    g.events.emit('radio:line', { text: cue.text, who: cue.who, source: chapter5Reports[mode]?.source ?? (chapter && mode !== 'intro' ? `last-harbor-ch${chapter}-${isMain() ? 'opening' : 'replay'}` : mode === 'intro' ? 'last-harbor-opening' : 'last-harbor-replay') })
  }
  function move(offset) {
    if (!mode) return false
    const index = Math.max(0, Math.min(cards.length - 1, cardIndex + offset))
    if (index === cardIndex) return false
    cardIndex = index; showCard(); return true
  }
  function previous() { return move(-1) }
  function next() { return move(1) }
  function trapFocus(event) { if (mode && !dialog.contains(event.target)) focusAction() }
  function open(nextMode, opener, held = {}) {
    // A native new run may reach this listener before an older conversation's
    // state listener. Release its focus/panes before capturing the new modal.
    g.events.emit('narrative:open', { mode: nextMode })
    saved = {
      focus: opener || doc.activeElement, screen: g.game.state,
      parent: comms.parentElement, sibling: comms.nextSibling,
      who: who.textContent, text: text.textContent, on: comms.classList.contains('on'),
      panes: [...menu.querySelectorAll('.m-screen'), menu.querySelector('.panel')].filter(Boolean).map(element => ({ element, inert: element.inert })),
      ...held,
    }
    const report = chapter5Reports[nextMode]
    chapter = nextMode === 'chapter5' || report ? 5 : ['chapter4', 'replay4'].includes(nextMode) ? 4 : ['chapter2', 'replay2'].includes(nextMode) ? 2 : ['chapter3', 'replay3'].includes(nextMode) || campaignM3 ? 3 : 0
    cards = report?.cards ?? (chapter === 5 ? campaignCh5Opening : chapter === 4 ? campaignCh4Opening : chapter === 2 ? campaignCh2Opening : chapter === 3 ? campaignCh3Opening : openingCards)
    mode = nextMode; cardIndex = 0
    g.input.setGameplay(false)
    for (const pane of saved.panes) pane.element.inert = true
    menu.setAttribute('data-harbor-narrative', mode)
    skipButton.hidden = !isMain(); closeButton.hidden = !isReplay()
    closeButton.textContent = saved.screen === 'paused' ? '返回暂停菜单' : '返回标题页'
    const name = report?.name ?? chapterName()
    skipButton.textContent = isChapter() ? `跳过${name}报幕 · Esc` : campaignM2 && !campaignM3 ? '跳至抵达 · Esc' : '跳过开场 · Esc'
    help.textContent = chapter === 5 && isChapter() ? `← / → 或 Space 翻页 · 最后一页按 Enter ${mode === 'chapter5Power' ? '继续' : '开始'}行动 · Esc 跳过报幕` : isChapter() ? `← / → 或 Space 翻页 · 最后一页按 Enter 继续${name} · Esc 跳过报幕` : mode === 'intro' ? (campaignM2 && !campaignM3 ? '← / → 或 Space 翻页 · Esc 跳至抵达 · 全部对白结束后按 Enter 开始行动' : '← / → 或 Space 翻页 · 最后一条按 Enter 开始 · Esc 跳过') : '← / → 或 Space 翻页 · Esc 返回原界面'
    if(report&&saved.requireConfirm){skipButton.textContent='跳至末页 · Esc';help.textContent=`← / → 或 Space 翻页 · Esc 跳至末页 · 最后一页按 Enter ${report.action}`}
    dialog.setAttribute('aria-label', chapter ? `${name}报幕 · 手动翻页` : '开场广播 · 手动翻页')
    dialog.hidden = false
    body.prepend(comms)
    doc.addEventListener('keydown', keydown, true)
    doc.addEventListener('focusin', trapFocus, true)
    g.input.exitLock()
    showCard(); focusAction()
  }
  function close(restoreFocus = false) {
    const previous = saved
    if (chapter) chapterUnlockPending = true
    if (isChapter()) {
      chapterRelock = false
      onChapterComplete = null
      if (g.player.damage === previous.blockDamage) g.player.damage = previous.damage
      g.game.flow.manualDialogue = previous.manualDialogue
      if (['paused', 'playing'].includes(g.game.state)) g.player.enabled = previous.enabled
      g.hud.clearRadio()
    }
    const otherModal = menu.getAttribute('data-harbor-narrative') && menu.getAttribute('data-harbor-narrative') !== mode
    mode = null; saved = null; dialog.hidden = true
    doc.removeEventListener('keydown', keydown, true)
    doc.removeEventListener('focusin', trapFocus, true)
    if (!otherModal) {
      menu.removeAttribute('data-harbor-narrative')
      for (const pane of previous.panes) pane.element.inert = pane.inert
    }
    previous.parent.insertBefore(comms, previous.sibling)
    comms.removeAttribute('data-harbor-opening')
    who.textContent = previous.who; text.textContent = previous.text
    comms.classList.toggle('on', restoreFocus && previous.on)
    if (restoreFocus && !otherModal) previous.focus?.focus({ preventScroll: true })
    else if (dialog.contains(doc.activeElement)) doc.activeElement.blur()
  }
  function finish(asSkipped) {
    if (mode !== 'intro' || g.game.state !== 'intro') return false
    skipped = skipped || asSkipped
    const result = g.game.skipIntro()
    if (result) g.input.requestLock()
    return result
  }
  function skip() {
    if(chapter5Reports[mode]&&saved.requireConfirm){if(completingChapter)return false;cardIndex=cards.length-1;showCard();focusAction();return true}
    if (isChapter()) return finishChapter(true)
    if (!campaignM2 || campaignM3) return finish(true)
    if (mode !== 'intro' || cardIndex >= campaignCh1Opening.length) return false
    skipped = true; cardIndex = campaignCh1Opening.length
    showCard(); focusAction(); return true
  }
  function start() { return cardIndex === cards.length - 1 && (isChapter() ? finishChapter(false) : finish(false)) }
  function closeReplay() {
    if (!isReplay()) return false
    close(true); return true
  }
  function replay(opener) {
    if (!canReplay(campaignM3 ? 3 : 1)) return false
    if (mode || menu.getAttribute('data-harbor-narrative') || g.game.flow.manualDialogue) return false
    if (g.game.state === 'playing') g.game.pause()
    if (!['title', 'paused'].includes(g.game.state)) return false
    const focus = opener || (menu.contains(doc.activeElement) ? doc.activeElement : replayButtons[g.game.state === 'paused' ? 1 : 0])
    open('replay', focus); return true
  }
  function replayChapter2(opener) { return replayChapter(2, opener) }
  function replayChapter3(opener) { return replayChapter(3, opener) }
  function replayChapter4(opener) { return replayChapter(4, opener) }
  function replayChapter(number, opener) {
    if (!canReplay(number)) return false
    if (mode || menu.getAttribute('data-harbor-narrative') || g.game.flow.manualDialogue) return false
    if (g.game.state === 'playing') g.game.pause()
    if (!['title', 'paused'].includes(g.game.state)) return false
    const buttons = number === 4 ? chapter4ReplayButtons : number === 2 ? chapter2ReplayButtons : chapter3ReplayButtons
    const focus = opener || (menu.contains(doc.activeElement) ? doc.activeElement : buttons[g.game.state === 'paused' ? 1 : 0])
    g.hud.clearRadio()
    open(`replay${number}`, focus); return true
  }
  function holdChapter(clear = false) {
    // setGameplay(false) clears native held actions only on a state change.
    // Flush again at the boundary (including a sampled pad/IME edge) while the
    // original simulation is paused; never carry menu actions into gameplay.
    if (clear) g.input.setGameplay(true)
    g.input.setGameplay(false)
    g.input.endFrame?.()
    g.player.enabled = false
    if (g.input.move) Object.assign(g.input.move, { x: 0, y: 0 })
    if (g.input.look) Object.assign(g.input.look, { dx: 0, dy: 0 })
    for (const key of ['fire', 'ads', 'sprint', 'crouch']) g.input[key] = false
  }
  function openChapter2(options) { return openChapter(2, options) }
  function openChapter3(options) { return openChapter(3, options) }
  function openChapter4(options) { return !chapter4Read && openChapter(4, options) }
  function openChapter5(options) { return !chapter5Read && openChapter(5, options) }
  function openChapter5Power(options) { return openChapter(5, options, 'chapter5Power') }
  function openChapter5Control({ onComplete } = {}) { return openChapter(5, { onComplete, requireConfirm:true }, 'chapter5Control') }
  function openChapter5Fault({ onComplete } = {}) { return openChapter(5, { onComplete, requireConfirm:true }, 'chapter5Fault') }
  function markChapterRead(number, value = true) {
    if (number === 4) chapter4Read = !!value
    else if (number === 5) chapter5Read = !!value
    else return false
    return true
  }
  function openChapter(number, { onComplete, requireConfirm=false } = {}, report = null) {
    if (mode || menu.getAttribute('data-harbor-narrative') || g.game.flow.manualDialogue || g.game.menus.panelOpen ||
      g.game.state !== 'playing' || g.player.alive === false) return false
    const held = { requireConfirm, enabled: g.player.enabled, manualDialogue: g.game.flow.manualDialogue,
      damage: g.player.damage, blockDamage() {} }
    // Native pause stops the outer simulation/level updates and silences the
    // original mixer. Suppress lock-loss recursion while its exit is pending.
    g.game.flow.manualDialogue = true
    g.player.damage = held.blockDamage
    holdChapter(true)
    g.game.pause()
    g.hud.clearRadio(); g.hud.setPrompt(null)
    onChapterComplete = onComplete; completingChapter = false
    // Equipment cancels knife contact on the native paused state event. This
    // existing rifle adapter cancels pending reload/inspect without inventory edits.
    g.weapon.equipmentView?.cancelActions()
    open(report ?? `chapter${number}`, undefined, held)
    return true
  }
  function finishChapter(asSkipped) {
    if (!isChapter() || completingChapter || g.game.state !== 'paused' || g.player.alive === false) return false
    completingChapter = true
    const current = saved, complete = onChapterComplete
    onChapterComplete = null
    holdChapter(true)
    if (chapter === 4) chapter4Read = true
    if (mode === 'chapter5') chapter5Read = true
    // Checkpoint facts are committed while time, damage and controls are held.
    // A callback may cancel/reset; never resume a replacement run or modal.
    complete?.({ skipped: asSkipped })
    if (!isChapter() || saved !== current) return true
    close()
    // Native resume requests immediately. If the browser still reports the old
    // lock, that request is a no-op; retry once when the queued exit arrives.
    chapterRelock = g.input.mode === 'lock' && g.input.locked && !g.input.touch
    g.game.resume()
    return true
  }
  function cancelChapter2() { return cancelChapter(2) }
  function cancelChapter3() { return cancelChapter(3) }
  function cancelChapter4() { return cancelChapter(4) }
  function cancelChapter5() { return cancelChapter(5) }
  function cancelChapter5Power() { return mode === 'chapter5Power' && cancelChapter(5) }
  function cancelChapter5Control() { return mode === 'chapter5Control' && cancelChapter(5) }
  function cancelChapter5Fault() { return mode === 'chapter5Fault' && cancelChapter(5) }
  function cancelChapter(number) {
    if (chapter !== number || !(isChapter() || isReplay())) return false
    if (isChapter()) holdChapter(true)
    close(isReplay()); return true
  }
  function keydown(event) {
    if (!mode || event.isComposing && !chapter) return
    if (trapNarrativeTab(event, doc, [skipButton, closeButton, previousButton, nextButton, startButton])) return
    event.preventDefault(); event.stopImmediatePropagation()
    if (event.repeat || event.isComposing) return
    if (event.code === 'ArrowLeft') previous()
    else if (['ArrowRight', 'Space'].includes(event.code)) next()
    else if (event.code === 'Escape') isMain() ? skip() : closeReplay()
    else if (['Enter', 'NumpadEnter'].includes(event.code) && cardIndex === cards.length - 1) isMain() ? start() : closeReplay()
  }
  // Deployment can resolve pointer lock after its synchronous state event.
  g.events.on('input:lock', ({ locked }) => {
    if (locked && (mode || chapterUnlockPending && g.game.state !== 'playing')) g.input.exitLock()
    else if (chapterRelock && !locked) {
      chapterRelock = false
      if (!mode && g.game.state === 'playing' && g.player.alive !== false) g.input.requestLock()
    }
  })
  g.events.on('game:state', ({ state, prev }) => {
    if (state !== 'playing' || prev !== 'paused') chapterRelock = false
    if (mode) close(state === saved.screen && isReplay())
    if (['playing', 'intro'].includes(state)) chapterUnlockPending = false
    if (state === 'intro') {
      chapter4Read = false
      chapter5Read = false
      elapsed = 0; skipped = false; introSeen = false; pendingHint = false
      g.hud.clearRadio(); g.game.menus.locationCard(false); location.setAttribute('aria-hidden', 'true')
      open('intro')
    } else if (state === 'playing' && prev !== 'paused') {
      if (prev !== 'intro') { elapsed = 0; skipped = true }
      introSeen = true; pendingHint = true
    } else if (['dead', 'title'].includes(state)) {
      elapsed = 0; cardIndex = -1; pendingHint = false
      if (state === 'title') { introSeen = false; skipped = false }
    }
  })
  const update = g.game.update
  g.game.update = function (dt) {
    if (isChapter()) { holdChapter(); return false }
    if (mode === 'intro') elapsed += dt
    const result = update.call(this, dt)
    if (isChapter()) { holdChapter(); return false }
    if (mode === 'intro' && g.game.state === 'intro') {
      g.hud.show(false)
      // Return false holds enemy/player simulation. The outer loop then omits
      // weapon.update, so the original hands receive exactly one update here.
      g.weapon.update?.(dt)
      return false
    }
    if (pendingHint && g.game.state === 'playing') {
      pendingHint = false
      if (!equipment?.snapshot?.().hasFirearm) g.hud.message(hint, 6)
    }
    return result
  }
  const api = {
    skip, start, previous, next, replay, closeReplay, openChapter2, replayChapter2, cancelChapter2,
    openChapter3, replayChapter3, cancelChapter3,
    openChapter4, replayChapter4, cancelChapter4, markChapterRead, setReplayProgress,
    openChapter5, cancelChapter5, openChapter5Power, cancelChapter5Power,
    openChapter5Control, cancelChapter5Control, openChapter5Fault, cancelChapter5Fault,
    snapshot: () => ({ active: mode !== null, mode, elapsed, cardIndex, cardCount: cards.length, introSeen, skipped,
      campaignM2, campaignM3, chapter3Available, chapter4Available, chapter4Read, chapter5Available, chapter5Read, phase: chapter5Reports[mode] ? mode : mode ? (chapter ? `chapter${chapter}` : campaignM2 && cardIndex >= campaignCh1Opening.length ? 'arrival' : 'opening') : null,
      openingCardCount: campaignM3 ? campaignCh3Opening.length : campaignM2 ? campaignCh1Opening.length : cues.length,
      arrivalIndex: !chapter && campaignM2 && cardIndex >= campaignCh1Opening.length ? cardIndex - campaignCh1Opening.length : -1,
      controlsHeld: mode !== null, returnScreen: saved?.screen ?? null }),
  }
  installed.set(g, api)
  return api
}
