// One play-through of a level: board state, undo history, move count, and the paint-flow
// animation state that the renderer reads. Pure logic plus timers; no DOM.
import { analyse, buildGraph, flowFrom, groupsOf, cloneBoard, ROT_STATES, KIND, rotMask, openMask } from './engine.js'

const STEP = 0.07      // seconds per cell for the paint front
const FILL = 0.16      // seconds for paint to fill one cell
const FADE = 0.18      // seconds for paint to drain from a cell
const ROT_TIME = 0.14  // seconds for the turn animation

export function createSession(level, { reducedMotion = false, onEvent = () => {} } = {}) {
  let board, A, anim, history, moves, hints, solvedFired, targetState, startedAt
  const reduced = typeof reducedMotion === 'function' ? reducedMotion : () => reducedMotion
  const M = () => (reduced() ? 0.001 : 1)

  function sourceNodes() {
    const out = []
    board.cells.forEach((c, i) => { if (c && c.source) out.push(i * 2) })
    return out
  }

  function reset() {
    board = cloneBoard(level.board)
    A = analyse(board)
    history = []; moves = 0; hints = 0; solvedFired = false; startedAt = null
    anim = board.cells.map(c => (c ? { rot: 0, rotV: 0, color: [0, 0], next: [0, 0], wet: [0, 0], delay: [0, 0], flow: [-1, -1] } : null))
    targetState = new Map()
    retarget(sourceNodes(), true)
  }

  // Compare the new analysis to what is displayed and schedule paint fronts from `starts`.
  function retarget(starts, fromSources = false, prevColors = []) {
    const adj = buildGraph(board)
    const dist = flowFrom(adj, starts)
    // paint that is already flowing elsewhere keeps its timing; new paint spreads from the action
    board.cells.forEach((c, i) => {
      if (!c) return
      const a = anim[i]
      groupsOf(c).forEach((_, g) => {
        const want = A.cellColors[i][g]
        const shown = a.next[g] || a.color[g]
        if (want === shown && (want === 0 || a.wet[g] > 0 || a.delay[g] > 0)) return
        const info = dist.get(i * 2 + g)
        const d = info ? info.dist : 0
        if (want === 0) { a.next[g] = 0; a.delay[g] = 0 }
        else if (a.color[g] === 0 || a.wet[g] === 0) {
          a.color[g] = want; a.next[g] = 0; a.wet[g] = 0
          a.delay[g] = d * STEP * M()
          a.flow[g] = info ? info.from : -1
        } else {
          a.next[g] = want; a.delay[g] = d * STEP * M()
        }
      })
    })
    if (!fromSources) {
      const mudNow = starts.some(n => A.cellColors[n >> 1] && A.cellColors[n >> 1][n & 1] === 7)
      const mudBefore = starts.some(n => prevColors[n >> 1] && prevColors[n >> 1][n & 1] === 7)
      if (mudNow && !mudBefore) onEvent({ type: 'mud' })
    }
  }

  function turn(x, y, dir = 1, { counts = true } = {}) {
    const i = y * board.w + x
    const c = board.cells[i]
    if (!c || solvedFired) return false
    if (c.locked || ROT_STATES[c.kind] === 1) { onEvent({ type: 'blocked', x, y }); return false }
    history.push({ i, rot: c.rot })
    c.rot = (((c.rot + dir) % 4) + 4) % 4
    if (counts) moves++
    if (startedAt === null) startedAt = Date.now()
    anim[i].rot = -dir * Math.PI / 2 * M()
    const prev = A.cellColors
    A = analyse(board)
    retarget(groupsOf(c).map((_, g) => i * 2 + g), false, prev)
    onEvent({ type: 'turn', x, y, dir })
    return true
  }

  function undo() {
    const h = history.pop()
    if (!h || solvedFired) return false
    const c = board.cells[h.i]
    const dir = ((h.rot - c.rot + 4) % 4) === 1 ? 1 : -1
    c.rot = h.rot
    moves = Math.max(0, moves - 1)
    anim[h.i].rot = -dir * Math.PI / 2 * M()
    const prev = A.cellColors
    A = analyse(board)
    retarget(groupsOf(c).map((_, g) => h.i * 2 + g), false, prev)
    onEvent({ type: 'undo' })
    return true
  }

  // Turn one wrong tile toward the stored solution. Prefers tiles touching wet paint.
  function hint() {
    if (solvedFired || A.solved) return null
    const sol = level.solution
    const wrong = []
    board.cells.forEach((c, i) => {
      if (!c || c.locked || ROT_STATES[c.kind] === 1) return
      if (openMask(c) !== rotMask(KIND[c.kind], sol.cells[i].rot)) wrong.push(i)
    })
    if (!wrong.length) return null
    const score = i => {
      const x = i % board.w, y = (i / board.w) | 0
      let s = 0
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const j = (y + dy) * board.w + x + dx
        if (x + dx < 0 || y + dy < 0 || x + dx >= board.w || y + dy >= board.h) continue
        if (A.cellColors[j] && A.cellColors[j].some(v => v)) s += 2
      }
      if (board.cells[i].source || board.cells[i].target) s += 1
      return s
    }
    wrong.sort((a, b) => score(b) - score(a))
    const i = wrong[0], c = board.cells[i]
    const target = rotMask(KIND[c.kind], sol.cells[i].rot)
    let k = 0
    while (k < 4 && rotMask(KIND[c.kind], c.rot + k) !== target) k++
    const dir = k === 3 ? -1 : 1
    const steps = k === 3 ? 1 : k
    for (let s = 0; s < steps; s++) turn(i % board.w, (i / board.w) | 0, dir)
    hints++
    onEvent({ type: 'hint', x: i % board.w, y: (i / board.w) | 0 })
    return { x: i % board.w, y: (i / board.w) | 0 }
  }

  function update(dt) {
    let settling = false
    board.cells.forEach((c, i) => {
      if (!c) return
      const a = anim[i]
      if (a.rot) {
        const s = Math.sign(a.rot)
        a.rot -= s * (Math.PI / 2) * dt / ROT_TIME
        if (Math.sign(a.rot) !== s) a.rot = 0
        settling = true
      }
      groupsOf(c).forEach((_, g) => {
        const want = A.cellColors[i][g]
        if (a.delay[g] > 0) { a.delay[g] -= dt; settling = true; return }
        if (a.next[g]) { a.color[g] = a.next[g]; a.next[g] = 0 }
        if (want === 0) {
          if (a.wet[g] > 0) { a.wet[g] = Math.max(0, a.wet[g] - dt / (FADE * M())); settling = true }
          if (a.wet[g] === 0) a.color[g] = 0
        } else if (a.color[g] === want && a.wet[g] < 1) {
          a.wet[g] = Math.min(1, a.wet[g] + dt / (FILL * M())); settling = true
        }
      })
    })
    // targets light up when the right paint actually arrives
    A.targets.forEach(t => {
      const i = t.y * board.w + t.x
      const a = anim[i]
      const shownOk = a.color[0] === t.need && a.wet[0] >= 1
      const key = i
      if (shownOk && !targetState.get(key)) { targetState.set(key, true); onEvent({ type: 'target', x: t.x, y: t.y, color: t.need }) }
      else if (!shownOk && targetState.get(key)) targetState.set(key, false)
    })
    if (A.solved && !settling && !solvedFired) {
      solvedFired = true
      onEvent({ type: 'solved', moves, par: level.par, stars: starsFor(moves, level.par, hints), hints })
    }
    return settling
  }

  function shownLeaks() {
    return A.leaks.filter(l => {
      const a = anim[l.y * board.w + l.x]
      return a && a.wet.some((v, g) => v >= 0.9 && a.color[g])
    })
  }

  reset()
  return {
    get board() { return board }, get analysis() { return A }, get anim() { return anim },
    get moves() { return moves }, get hints() { return hints }, get solved() { return solvedFired }, get canUndo() { return history.length > 0 && !solvedFired },
    level, turn, undo, hint, update, reset, shownLeaks,
    elapsed: () => (startedAt ? (Date.now() - startedAt) / 1000 : 0),
  }
}

export function starsFor(moves, par, hints = 0) {
  let s = moves <= Math.ceil(par * 1.25) + 3 ? 3 : moves <= par * 2 + 8 ? 2 : 1
  if (hints > 0) s = Math.min(s, 2)
  return s
}
