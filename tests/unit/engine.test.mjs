import test from 'node:test'
import assert from 'node:assert/strict'
import { analyse, rotate, rotMask, KIND, RED, YELLOW, BLUE } from '../../src/game/engine.js'
import { generate, brainMask } from '../../src/game/generator.js'

test('rotMask rotates clockwise', () => {
  assert.equal(rotMask(KIND.end, 0), 0b0001)
  assert.equal(rotMask(KIND.end, 1), 0b0010)
  assert.equal(rotMask(KIND.corner, 3), 0b1001)
})

test('two wells mix through a straight line into the right target', () => {
  // [R end E] [straight E-W] [tee] ... simple: well(E) - straight - target(W)
  const b = { w: 3, h: 1, cells: [
    { kind: 'end', rot: 1, source: RED },
    { kind: 'straight', rot: 1 },
    { kind: 'end', rot: 3, target: RED },
  ] }
  const a = analyse(b)
  assert.equal(a.solved, true)
  b.cells[1].rot = 0
  const a2 = analyse(b)
  assert.equal(a2.solved, false)
  assert.ok(a2.leaks.length > 0)
})

test('generated puzzles: solution solved, scramble not solved', () => {
  for (let s = 0; s < 60; s++) {
    const opts = { w: 5 + (s % 4), h: 5 + (s % 3), seed: 'g' + s, trees: 1 + (s % 3), mixChance: s % 2 ? 0.6 : 0, bridges: s % 3 === 0 ? 1 : 0, targetsPerTree: [1, 2] }
    const g = generate(opts)
    assert.equal(analyse(g.solution).solved, true, 'solution must be solved ' + s)
    assert.equal(analyse(g.board).solved, false, 'scramble must not be solved ' + s)
    assert.ok(g.meta.par > 0)
  }
})

test('brain-shaped masks generate', () => {
  for (let s = 0; s < 20; s++) {
    const w = 9, h = 9
    const g = generate({ w, h, seed: 'b' + s, mask: brainMask(w, h), trees: 3, mixChance: 0.5, bridges: 1 })
    assert.equal(analyse(g.solution).solved, true)
  }
})
