import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { campaignCh5Opening, campaignCh5Power, campaignCh5Control, campaignCh5Fault } from './campaign-ch5-dialogue.mjs'

const opening = await readFile(new URL('../../docs/harbor/第五关剧情报幕.md', import.meta.url), 'utf8')
const reports = await readFile(new URL('../../docs/harbor/第五关场内短报幕.md', import.meta.url), 'utf8')
const power = reports.split('\n## 进入仓库，操作控制机关后')[0]
const control = reports.split('\n## 进入仓库，操作控制机关后')[1].split('\n## 燃油达到 73% 时')[0]
const fault = reports.split('\n## 燃油达到 73% 时')[1]
const pages = source => [...source.matchAll(/^### (\d\d \/ \d\d) — ([^\n]+)\n\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)]
  .map(([, index, title, text]) => ({ who:`${index} · ${title}`, text:text.trim().replaceAll('**','') }))

test('CH5 opening preserves the eight local source pages and paragraph boundaries', () => {
  assert.deepEqual(campaignCh5Opening, pages(opening))
  assert.equal(campaignCh5Opening.length, 8)
  assert.match(campaignCh5Opening[7].text, /CHAPTER 05\n\n七号泊位 · 今夜离港$/)
})

test('CH5 power report preserves only the two supplied power pages', () => {
  assert.deepEqual(campaignCh5Power, pages(power))
  assert.equal(campaignCh5Power.length, 2)
  assert.match(campaignCh5Power[1].text, /继续行动 · Enter$/)
  assert.doesNotMatch(campaignCh5Power.map(page => page.text).join('\n'), /120 秒|73%|前往燃油阀|前往维修柜/)
})

test('CH5 control and 73% fault preserve both local reports and their exact final actions', () => {
  for (const [cards, source, action] of [[campaignCh5Control,control,'前往燃油阀'],[campaignCh5Fault,fault,'前往维修柜']]) {
    assert.deepEqual(cards,pages(source))
    assert.equal(cards.length,2)
    assert.equal(cards[1].text.split('\n\n').at(-1),`${action} · Enter`)
  }
  assert.match(campaignCh5Control[1].text,/预计输送时间： 120 秒/)
  assert.match(campaignCh5Fault[0].text,/当前进度： 73%/)
  assert.match(campaignCh5Fault[1].text,/已完成进度： 保留 73%/)
})

test('CH5 supplied pages remain immutable narrative data', () => {
  for (const cards of [campaignCh5Opening, campaignCh5Power, campaignCh5Control, campaignCh5Fault]) {
    assert.ok(Object.isFrozen(cards))
    for (const card of cards) {
      assert.ok(Object.isFrozen(card))
      assert.deepEqual(Object.keys(card).sort(), ['text','who'])
    }
  }
})
