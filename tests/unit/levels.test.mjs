import test from 'node:test'
import assert from 'node:assert/strict'
import { CHAPTERS, buildLevel, buildDream, DREAM_SIZES } from '../../src/game/levels.js'
import { analyse } from '../../src/game/engine.js'

test('every campaign level builds, starts unsolved, and its solution solves', () => {
  CHAPTERS.forEach((ch, c) => ch.levels.forEach((_, l) => {
    const t0 = Date.now()
    const L = buildLevel(c, l)
    const ms = Date.now() - t0
    assert.equal(analyse(L.solution).solved, true, `${L.key} solution`)
    assert.equal(analyse(L.board).solved, false, `${L.key} start`)
    assert.ok(L.par >= 1, `${L.key} par`)
    assert.ok(ms < 1500, `${L.key} took ${ms}ms`)
    // same seed -> same level
    const L2 = buildLevel(c, l)
    assert.deepEqual(L2.board, L.board, `${L.key} deterministic`)
  }))
})

test('dream sizes build', () => {
  for (const size of Object.keys(DREAM_SIZES)) for (let s = 0; s < 5; s++) {
    const d = buildDream(size, 'x' + s)
    assert.equal(analyse(d.solution).solved, true)
  }
})

test('bridge levels contain every bridge they ask for', () => {
  CHAPTERS.forEach((ch, c) => ch.levels.forEach((def, l) => {
    if (!def.bridges) return
    const L = buildLevel(c, l)
    const n = L.solution.cells.filter(x => x && x.kind === 'bridge').length
    assert.equal(n, def.bridges, `${L.key} bridges`)
  }))
  const tut = buildLevel(0, 5)
  assert.equal(tut.solution.cells.filter(x => x && x.kind === 'bridge').length, 1)
})
