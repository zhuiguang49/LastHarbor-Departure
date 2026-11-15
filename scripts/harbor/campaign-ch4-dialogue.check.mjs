import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { campaignCh4Opening, campaignCh4Dossier, CH4_DOSSIER_FIELD_LABELS } from './campaign-ch4-dialogue.mjs'

const opening = await readFile(new URL('../../docs/harbor/第四关报幕.md', import.meta.url), 'utf8')
const dossier = await readFile(new URL('../../docs/harbor/第四关P-07剧情报幕.md', import.meta.url), 'utf8')
const pages = source => [...source.matchAll(/^### (\d\d \/ \d\d) — ([^\n]+)\n\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)]
  .map(([, index, title, text]) => ({ who:`${index} · ${title}`, text:text.trim().replaceAll('**','') }))

test('CH4 opening and P-07 dossier retain all supplied words and paragraph boundaries', () => {
  assert.deepEqual(campaignCh4Opening, pages(opening)); assert.equal(campaignCh4Opening.length, 8)
  assert.deepEqual(campaignCh4Dossier, pages(dossier)); assert.equal(campaignCh4Dossier.length, 4)
  assert.match(campaignCh4Opening[7].text, /CHAPTER 04\n\n封锁线 · 第七区控制中心$/)
  assert.match(campaignCh4Dossier[3].text, /开始权限覆盖 · Enter$/)
})

test('the eleven blue field titles exclude colons, values, page headings and protocol-summary prose', () => {
  const expected = [...dossier.matchAll(/^\*\*([^*\n]+)：\*\*/gm)].map(([, label]) => label)
  assert.deepEqual(CH4_DOSSIER_FIELD_LABELS, expected); assert.equal(expected.length, 11)
  assert.equal(CH4_DOSSIER_FIELD_LABELS.includes('协议摘要'), false)
  assert.ok(CH4_DOSSIER_FIELD_LABELS.every(label => !label.includes('：')))
  for (const cards of [campaignCh4Opening, campaignCh4Dossier]) {
    assert.ok(Object.isFrozen(cards))
    for (const card of cards) { assert.ok(Object.isFrozen(card)); assert.deepEqual(Object.keys(card).sort(), ['text','who']) }
  }
  assert.ok(Object.isFrozen(CH4_DOSSIER_FIELD_LABELS))
})
