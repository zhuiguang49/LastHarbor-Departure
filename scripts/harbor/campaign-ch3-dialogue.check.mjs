import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { campaignCh3Opening, campaignCh3Testimony, campaignCh3Radio } from './campaign-ch3-dialogue.mjs'

const markdown = await readFile(new URL('../../docs/harbor/第三关报幕.md', import.meta.url), 'utf8')
const acts = Object.fromEntries([...markdown.matchAll(/^### 第(.*?)幕[^\n]*\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)].map(([, act, text]) => [act, text]))
function pages(act, total) {
  return [...acts[act].matchAll(/^#### (\d\d \/ \d\d) — ([^\n]+)\n\n([\s\S]*?)(?=^#### |^---|$(?![\s\S]))/gm)]
    .map(([, index, title, text]) => {
      assert.ok(index.endsWith(`/ ${total}`))
      return { who: `${index} · ${title}`, text: text.split('\n*对白结束。')[0].trim().replaceAll('**', '') }
    })
}
function spoken(act) {
  return [...acts[act].matchAll(/^\*\*([^*\n]+)：\*\*\n([\s\S]*?)(?=^\*\*[^*\n]+：\*\*|$(?![\s\S]))/gm)]
    .map(([, who, text]) => ({ who, text: [...text.matchAll(/^“[^\n]+”$/gm)].map(([paragraph]) => paragraph).join('\n\n') }))
}

test('CH3 opening and seven testimony pages match every supplied speaker, line and paragraph', () => {
  assert.deepEqual(campaignCh3Opening, pages('一', '08'))
  assert.deepEqual(campaignCh3Testimony, pages('五', '07'))
  assert.equal(campaignCh3Opening.length, 8)
  assert.equal(campaignCh3Testimony.length, 7)
  assert.match(campaignCh3Testimony[0].text, /许工：\n\n“.*\n\n.*\n\n玩家：/)
  assert.match(campaignCh3Testimony[6].text, /玩家：[\s\S]*许工：[\s\S]*“P-07。”$/)
})

test('CH3 radio follows acts 2/3/4/6 exactly, excluding scene directions and separating detected contact', () => {
  const blockade = spoken('三')
  assert.deepEqual(campaignCh3Radio, {
    warning: spoken('二'),
    blockade: blockade.filter(turn => turn.who !== '清场人员'),
    contact: blockade.filter(turn => turn.who === '清场人员'),
    rescue: spoken('四'),
    departure: spoken('六'),
  })
  assert.deepEqual(Object.fromEntries(Object.entries(campaignCh3Radio).map(([key, cards]) => [key, cards.length])),
    { warning: 2, blockade: 4, contact: 1, rescue: 4, departure: 3 })
  assert.match(campaignCh3Radio.contact[0].text, /发现未经登记人员/)
  assert.ok(campaignCh3Radio.blockade.every(card => !card.text.includes('发现未经登记人员')))
  assert.doesNotMatch(JSON.stringify([campaignCh3Opening, campaignCh3Radio.warning, campaignCh3Radio.blockade, campaignCh3Radio.contact, campaignCh3Radio.rescue]), /P-?07|净港协议/)
  assert.doesNotMatch(campaignCh3Testimony.slice(0, 3).map(card => card.text).join(''), /P-?07/)
})

test('CH3 script exports immutable cards and arrays with only who/text presentation data', () => {
  assert.ok(Object.isFrozen(campaignCh3Radio))
  for (const cards of [campaignCh3Opening, campaignCh3Testimony, ...Object.values(campaignCh3Radio)]) {
    assert.ok(Object.isFrozen(cards))
    for (const card of cards) {
      assert.ok(Object.isFrozen(card))
      assert.deepEqual(Object.keys(card).sort(), ['text', 'who'])
    }
  }
})
