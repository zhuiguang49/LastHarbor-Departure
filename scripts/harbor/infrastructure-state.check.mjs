import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInfrastructure } from './infrastructure-state.mjs'

test('physical dependencies, both branch orders, idempotence and restart', () => {
  for (const order of [['gate','fuel'],['fuel','gate']]) {
    const m=createInfrastructure()
    for (const action of ['gate','fuel','boat']) assert.equal(m.request(action),false)
    assert.equal(m.request('power'),true);assert.equal(m.request('power'),false)
    m.tick(1);assert.equal(m.state.power,'UNSTABLE');assert.equal(m.request('fuel'),false)
    m.tick(.5);assert.equal(m.state.power,'ON')
    m.request(order[0]);m.tick(7)
    assert.equal(m.state.boat,'BLOCKED');assert.equal(m.request('boat'),false)
    assert.equal(m.request(order[0]),false)
    m.request(order[1]);m.tick(7);assert.equal(m.state.boat,'READY')
    assert.equal(m.request('boat'),true);assert.equal(m.request('boat'),false)
    m.tick(1);assert.equal(m.state.boat,'DEPARTING')
    m.tick(1.5);assert.equal(m.state.boat,'EXTRACTED')
    assert.doesNotThrow(()=>JSON.parse(JSON.stringify(m.snapshot())))
    m.reset();assert.deepEqual(m.snapshot(),createInfrastructure().snapshot())
  }
})
