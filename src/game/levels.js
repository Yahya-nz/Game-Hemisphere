// Campaign: a hand-made tutorial chapter, then generated chapters with fixed seeds.
import { generate, brainMask, sineMask, ringMask, spiralMask, shapeGuide } from './generator.js'
import { analyse, cloneBoard, rotationsToSolve, RED, YELLOW, BLUE } from './engine.js'

const KINDS = { e: 'end', s: 'straight', c: 'corner', t: 'tee', x: 'cross', b: 'bridge' }
const SRC = { R: RED, Y: YELLOW, B: BLUE }
const TGT = { r: RED, y: YELLOW, b: BLUE, o: RED | YELLOW, g: YELLOW | BLUE, p: RED | BLUE }

// rows of tokens: <kind><rot>[R|Y|B well][r|y|b|o|g|p target] or '.' for no tile
function parse(rows) {
  const grid = rows.map(r => r.trim().split(/\s+/))
  const h = grid.length, w = grid[0].length
  const cells = []
  for (const row of grid) for (const tok of row) {
    if (tok === '.') { cells.push(null); continue }
    const kind = KINDS[tok[0]], rot = +tok[1]
    const cell = { kind, rot }
    for (const ch of tok.slice(2)) {
      if (SRC[ch]) cell.source = SRC[ch]
      else if (TGT[ch]) cell.target = TGT[ch]
      else if (ch === 'L') cell.locked = true
    }
    cells.push(cell)
  }
  return { w, h, cells }
}

// Hand-made levels: solution rows + initial rotation per tile ("scramble" rows, '.' = keep).
const TUTORIAL = [
  { id: 't1', coach: 'coach1', sol: ['e1R s1 e3r'], start: ['. s0 .'] },
  { id: 't2', coach: 'coach2', sol: ['e1R c2 .', '. c0 e3r'], start: ['. c0 .', '. c2 .'] },
  { id: 't3', coach: 'coach3', sol: ['. . e2y', 'e1Y s1 t2', '. . e0y'], start: ['. . e1', '. . t0', '. . e3'] },
  { id: 't4', coach: 'coach4', sol: ['e1R c2 .', '. t0 e3o', 'e1Y c3 .'], start: ['. c0 .', '. t1 e1', '. c0 .'] },
  { id: 't5', coach: 'coach5', gen: { w: 4, h: 4, trees: 2, mixChance: 0, targetsPerTree: [1, 1], seed: 'tut5' } },
  { id: 't6', coach: 'coach6', sol: ['. e2B .', 'e1R b0 e3r', '. e0b .'], start: ['. e0 .', 'e2 . e0', '. e1 .'] },
]

const G = (w, h, trees, extra = {}) => ({ w, h, trees, targetsPerTree: [1, 2], ...extra })
const BRAIN = (w, h, trees, extra = {}) => ({ ...G(w, h, trees, extra), brain: true })
const SHAPE = (shape, w, h, trees, extra = {}) => ({ ...G(w, h, trees, extra), shape })
const MASKS = { sine: sineMask, ring: ringMask, spiral: spiralMask }

export const CHAPTERS = [
  { id: 'lines', name: 'ch1', levels: TUTORIAL },
  { id: 'colors', name: 'ch2', levels: [
    G(4, 4, 2), G(4, 5, 2), G(5, 5, 2), G(5, 5, 3), SHAPE('sine', 7, 5, 2, { coach: 'coachSine' }), G(6, 6, 3), G(6, 6, 3, { lockFraction: 0.15, coach: 'coach8' }), SHAPE('ring', 7, 7, 3, { coach: 'coachRing' }),
  ] },
  { id: 'mixing', name: 'ch3', levels: [
    G(4, 5, 2, { minMixes: 1, mixChance: 0.3, coach: 'coach4' }), G(5, 5, 2, { minMixes: 1, mixChance: 0.5 }), G(5, 6, 3, { minMixes: 1, mixChance: 0.5 }),
    G(6, 6, 3, { minMixes: 1, mixChance: 0.6 }), SHAPE('sine', 8, 6, 3, { minMixes: 2, mixChance: 0.6 }), G(6, 7, 3, { minMixes: 2, mixChance: 0.6 }),
    G(7, 7, 4, { minMixes: 2, mixChance: 0.6, lockFraction: 0.1 }), SHAPE('spiral', 9, 9, 4, { minMixes: 2, mixChance: 0.7, coach: 'coachSpiral' }),
  ] },
  { id: 'bridges', name: 'ch4', levels: [
    G(5, 5, 2, { bridges: 1, coach: 'coach6' }), G(5, 6, 3, { bridges: 1, mixChance: 0.3 }), G(6, 6, 3, { bridges: 1, mixChance: 0.5 }),
    G(6, 6, 3, { bridges: 2, mixChance: 0.5 }), G(7, 7, 3, { bridges: 2, mixChance: 0.5, lockFraction: 0.1 }),
    SHAPE('ring', 8, 8, 4, { bridges: 2, mixChance: 0.6 }), G(7, 8, 4, { bridges: 3, mixChance: 0.6 }),
  ] },
  { id: 'brain', name: 'ch5', levels: [
    BRAIN(7, 8, 3, { mixChance: 0.3, coach: 'coach7' }), BRAIN(7, 8, 3, { mixChance: 0.6, minMixes: 1 }), BRAIN(9, 9, 3, { mixChance: 0.6, minMixes: 1 }),
    BRAIN(9, 10, 4, { mixChance: 0.6, minMixes: 1 }), BRAIN(9, 10, 4, { mixChance: 0.6, bridges: 1 }),
    BRAIN(9, 11, 4, { mixChance: 0.6, bridges: 1, minMixes: 2 }), BRAIN(9, 12, 5, { mixChance: 0.6, bridges: 2, minMixes: 2 }),
  ] },
]

export const levelKey = (c, l) => `${CHAPTERS[c].id}-${l + 1}`
export const totalLevels = () => CHAPTERS.reduce((n, c) => n + c.levels.length, 0)

function fromDef(def, seed) {
  if (def.sol) {
    const solution = parse(def.sol)
    const board = cloneBoard(solution)
    const start = parse(def.start.map(r => r.split(/\s+/).map(t => (t === '.' ? 'e0' : t)).join(' ')))
    def.start.forEach((row, y) => row.trim().split(/\s+/).forEach((tok, x) => {
      if (tok !== '.' && board.cells[y * board.w + x]) board.cells[y * board.w + x].rot = start.cells[y * board.w + x].rot
    }))
    return { board, solution }
  }
  const opts = def.gen ? { ...def.gen } : { ...def, seed }
  delete opts.coach
  if (def.brain) opts.mask = brainMask(def.w, def.h)
  if (def.shape) opts.mask = MASKS[def.shape](def.w, def.h)
  delete opts.shape
  const g = generate(opts)
  return { board: g.board, solution: g.solution }
}

export function buildLevel(c, l) {
  const def = CHAPTERS[c].levels[l]
  const { board, solution } = fromDef(def, `hemisphere:${levelKey(c, l)}`)
  return { key: levelKey(c, l), chapter: c, index: l, board, solution, par: Math.max(1, rotationsToSolve(board, solution)), coach: def.coach || null, guide: def.shape ? shapeGuide(def.shape, def.w, def.h) : null }
}

// Endless "Dream" puzzles and the daily one.
export const DREAM_SIZES = {
  small: { w: 6, h: 6, trees: 3, mixChance: 0.5, bridges: 1, targetsPerTree: [1, 2] },
  medium: { w: 9, h: 9, trees: 4, mixChance: 0.6, bridges: 1, minMixes: 1, targetsPerTree: [1, 2], brain: true },
  large: { w: 9, h: 12, trees: 5, mixChance: 0.6, bridges: 2, minMixes: 2, targetsPerTree: [1, 2], brain: true },
}
export function buildDream(size, seed) {
  const def = DREAM_SIZES[size] || DREAM_SIZES.medium
  const { board, solution } = fromDef(def, `dream:${size}:${seed}`)
  return { key: `dream-${size}-${seed}`, chapter: -1, index: -1, dream: size, seed, board, solution, par: Math.max(1, rotationsToSolve(board, solution)), coach: null }
}

export { analyse, parse }
