import test from 'node:test'
import assert from 'node:assert/strict'
import { CHAPTERS, buildLevel } from '../../src/game/levels.js'
import { createSession, starsFor } from '../../src/game/session.js'

function solveWithHints(level) {
  const events = []
  const s = createSession(level, { onEvent: e => events.push(e) })
  let guard = 0
  while (s.hint() && guard++ < 500) { for (let k = 0; k < 3; k++) s.update(0.05) }
  for (let k = 0; k < 400 && !s.solved; k++) s.update(0.05)
  return { s, events }
}

test('hints alone solve every campaign level and fire one solved event', () => {
  CHAPTERS.forEach((ch, c) => ch.levels.forEach((_, l) => {
    const L = buildLevel(c, l)
    const { s, events } = solveWithHints(L)
    const solved = events.filter(e => e.type === 'solved')
    assert.equal(solved.length, 1, `${L.key} solved once`)
    assert.equal(s.solved, true)
    assert.ok(events.some(e => e.type === 'target'), `${L.key} target event`)
    assert.ok(solved[0].stars <= 2, 'hints cap stars at 2')
  }))
})

test('undo restores the board and the move count', () => {
  const L = buildLevel(1, 2)
  const s = createSession(L)
  const before = JSON.stringify(s.board)
  const i = s.board.cells.findIndex(c => c && !c.locked && c.kind !== 'cross' && c.kind !== 'bridge')
  s.turn(i % s.board.w, (i / s.board.w) | 0, 1)
  assert.equal(s.moves, 1)
  s.undo()
  assert.equal(s.moves, 0)
  assert.equal(JSON.stringify(s.board), before)
})

test('locked tiles and bridges do not turn', () => {
  const L = buildLevel(0, 5) // bridge tutorial
  const s = createSession(L)
  const bi = s.board.cells.findIndex(c => c && c.kind === 'bridge')
  assert.equal(s.turn(bi % s.board.w, (bi / s.board.w) | 0), false)
})

test('star thresholds', () => {
  assert.equal(starsFor(5, 5), 3)
  assert.equal(starsFor(14, 10), 3)
  assert.equal(starsFor(17, 10), 2)
  assert.equal(starsFor(28, 10), 2)
  assert.equal(starsFor(29, 10), 1)
  assert.equal(starsFor(5, 5, 1), 2)
})
