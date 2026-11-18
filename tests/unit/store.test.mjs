import test from 'node:test'
import assert from 'node:assert/strict'

const DEFAULTS = { settings: { sound: true, lang: null }, progress: { stars: {} }, daily: {}, dreams: 0, last: null }
async function storeWith(raw, { throws = false } = {}) {
  globalThis.window = { localStorage: { getItem: () => { if (throws) throw new Error('blocked'); return raw }, setItem: () => {} } }
  const { createStore } = await import('../../src/lib/store.js?' + Math.random())
  return createStore('k', DEFAULTS)
}

test('corrupt or old saves never break the defaults', async () => {
  for (const raw of ['null', '42', '"x"', '[]', '{"settings":null}', '{"progress":{"stars":null}}', '{"settings":5,"daily":[]}', 'not json']) {
    const s = await storeWith(raw)
    assert.equal(typeof s.data.settings, 'object', raw)
    assert.ok(s.data.settings !== null, raw)
    assert.equal(typeof s.data.progress.stars, 'object', raw)
    assert.ok(s.data.progress.stars !== null, raw)
  }
})

test('valid saves are kept, storage that throws is survived', async () => {
  const s = await storeWith('{"settings":{"sound":false,"lang":"id"},"progress":{"stars":{"lines-1":3}},"last":[1,2]}')
  assert.equal(s.data.settings.sound, false)
  assert.equal(s.data.settings.lang, 'id')
  assert.equal(s.data.progress.stars['lines-1'], 3)
  assert.deepEqual(s.data.last, [1, 2])
  const t = await storeWith(null, { throws: true })
  assert.equal(t.data.settings.sound, true)
})
