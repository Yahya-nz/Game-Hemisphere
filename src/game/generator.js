// Puzzle generator: grows a spanning forest over a cell mask, turns each tree into pathway
// tiles, puts paint wells and colour targets on its leaves, then scrambles rotations.
// The unscrambled forest is a guaranteed solution.
import { makeRng } from '../lib/rng.js'
import { KIND, rotMask, DX, DY, OPP, RED, YELLOW, BLUE, analyse, cloneBoard, ROT_STATES } from './engine.js'

const MIXES = [RED | YELLOW, YELLOW | BLUE, RED | BLUE]
const PRIMARIES = [RED, YELLOW, BLUE]

// Find kind + rotation whose open mask equals m.
export function tileForMask(m) {
  for (const kind of ['end', 'straight', 'corner', 'tee', 'cross']) {
    for (let r = 0; r < 4; r++) if (rotMask(KIND[kind], r) === m) return { kind, rot: r }
  }
  return null
}

// Brain-shaped mask: two hemispheres, the middle column is the fissure except at `bridgesRows`.
export function brainMask(w, h, { crossRows = null } = {}) {
  const mask = new Array(w * h).fill(true)
  const cx = (w - 1) / 2
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x - cx) / (w / 2), v = ((y + 0.5) / h) * 2 - 1
    const ru = 0.93 + 0.07 * v
    const d = Math.pow(Math.pow(Math.abs(u / ru), 2.5) + Math.pow(Math.abs(v), 2.5), 1 / 2.5)
    if (d > 1.08) mask[y * w + x] = false
  }
  if (w % 2 === 1) {
    const mid = (w - 1) / 2
    const rows = crossRows || [Math.floor(h * 0.3), Math.floor(h * 0.68)]
    for (let y = 0; y < h; y++) if (!rows.includes(y)) mask[y * w + mid] = false
  }
  return mask
}

/**
 * opts: { w, h, seed, mask?, trees, mixChance, targetsPerTree:[min,max], bridges, lockFraction, maxDegree }
 * returns { board, solution, meta }
 */
export function generate(opts) {
  const { w, h, seed = 1, trees = 2, mixChance = 0, targetsPerTree = [1, 2], bridges = 0, lockFraction = 0, maxDegree = 3, wellsOn = null } = opts
  for (let attempt = 0; attempt < 600; attempt++) {
    const rng = makeRng(`${seed}:${attempt}`)
    // insist on every requested bridge first; relax only if a board keeps refusing
    const minBridges = attempt < 400 ? bridges : attempt < 520 ? Math.min(1, bridges) : 0
    const res = tryGenerate(rng, { ...opts, w, h, trees, mixChance, targetsPerTree, bridges, lockFraction, maxDegree, wellsOn, minBridges })
    if (res) { res.meta.attempt = attempt; return res }
  }
  throw new Error('generator failed for ' + JSON.stringify(opts))
}

function tryGenerate(rng, o) {
  const { w, h } = o
  const mask = o.mask || new Array(w * h).fill(true)
  const idx = (x, y) => y * w + x
  const inMask = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[idx(x, y)]
  const cellsList = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[idx(x, y)]) cellsList.push(idx(x, y))
  if (cellsList.length < o.trees * 3) return null

  // pick bridge cells: interior cells whose 4 neighbours are all in the mask
  const bridgeSet = new Set()
  if (o.bridges > 0) {
    const cands = rng.shuffle(cellsList.filter(i => {
      const x = i % w, y = (i / w) | 0
      return [0, 1, 2, 3].every(d => inMask(x + DX[d], y + DY[d])) && [0, 1, 2, 3].every(d => inMask(x + 2 * DX[d], y + 2 * DY[d]) || true)
    }))
    for (const c of cands) {
      if (bridgeSet.size >= o.bridges) break
      const x = c % w, y = (c / w) | 0
      // keep bridges apart
      let ok = true
      for (const b of bridgeSet) { const bx = b % w, by = (b / w) | 0; if (Math.abs(bx - x) + Math.abs(by - y) < 3) ok = false }
      if (ok) bridgeSet.add(c)
    }
  }

  // forest growth
  const owner = new Array(w * h).fill(-1)
  const conn = new Array(w * h).fill(0) // open mask per normal cell
  const bridgeUse = new Map() // cell -> {v: tree|-1, h: tree|-1}
  for (const b of bridgeSet) bridgeUse.set(b, { v: -1, h: -1 })
  const normalCells = cellsList.filter(i => !bridgeSet.has(i))
  const seeds = []
  const pool = rng.shuffle(normalCells.slice())
  for (const c of pool) {
    if (seeds.length >= o.trees) break
    const x = c % w, y = (c / w) | 0
    const minGap = Math.max(2, Math.floor(Math.sqrt(normalCells.length / o.trees) * 0.8))
    if (seeds.every(s => Math.abs((s % w) - x) + Math.abs(((s / w) | 0) - y) >= minGap)) seeds.push(c)
  }
  if (seeds.length < o.trees) return null
  const sizes = new Array(o.trees).fill(1)
  seeds.forEach((s, t) => { owner[s] = t })
  const degree = i => { let n = 0; for (let d = 0; d < 4; d++) if (conn[i] & (1 << d)) n++; return n }
  let remaining = normalCells.length - seeds.length
  let guard = 0
  while (remaining > 0 && guard++ < 100000) {
    // choose the smallest-ish tree to grow (keeps trees balanced). The jitter is drawn before
    // sorting: a comparator that calls the RNG gives different boards in different browsers.
    const jit = []
    for (let t = 0; t < o.trees; t++) jit.push((rng.next() - 0.5) * 3)
    const order = [...Array(o.trees).keys()].sort((a, b) => (sizes[a] + jit[a]) - (sizes[b] + jit[b]) || a - b)
    let grew = false
    for (const t of order) {
      const edges = []
      for (const i of normalCells) {
        if (owner[i] !== t || degree(i) >= o.maxDegree) continue
        const x = i % w, y = (i / w) | 0
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d]
          if (!inMask(nx, ny)) continue
          const j = idx(nx, ny)
          if (bridgeSet.has(j)) {
            const use = bridgeUse.get(j)
            const axis = d === 0 || d === 2 ? 'v' : 'h'
            if (use[axis] !== -1) continue
            const fx = nx + DX[d], fy = ny + DY[d]
            if (!inMask(fx, fy)) continue
            const k = idx(fx, fy)
            if (bridgeSet.has(k) || owner[k] !== -1) continue
            edges.push({ i, d, j, k, axis })
          } else if (owner[j] === -1) edges.push({ i, d, j })
        }
      }
      if (!edges.length) continue
      // a bridge whose other channel already carries another tree is completed eagerly
      const closing = edges.filter(e => e.k !== undefined && bridgeUse.get(e.j)[e.axis === 'v' ? 'h' : 'v'] !== -1 && bridgeUse.get(e.j)[e.axis === 'v' ? 'h' : 'v'] !== t)
      const e = closing.length && rng.chance(0.85) ? rng.pick(closing) : rng.pick(edges)
      if (e.k !== undefined) {
        bridgeUse.get(e.j)[e.axis] = t
        conn[e.i] |= 1 << e.d
        conn[e.k] |= 1 << OPP[e.d]
        owner[e.k] = t
      } else {
        conn[e.i] |= 1 << e.d
        conn[e.j] |= 1 << OPP[e.d]
        owner[e.j] = t
      }
      sizes[t]++
      remaining--
      grew = true
      break
    }
    if (!grew) return null
  }
  if (remaining > 0) return null

  // resolve bridges: both channels -> bridge; one -> straight; none -> fail (rare)
  const cells = new Array(w * h).fill(null)
  for (const [b, use] of bridgeUse) {
    if (use.v !== -1 && use.h !== -1 && use.v !== use.h) cells[b] = { kind: 'bridge', rot: 0, trees: [use.v, use.h] }
    else if (use.v !== -1 && use.h === -1) cells[b] = { kind: 'straight', rot: 0, tree: use.v }
    else if (use.h !== -1 && use.v === -1) cells[b] = { kind: 'straight', rot: 1, tree: use.h }
    else return null
  }
  if (cells.filter(c => c && c.kind === 'bridge').length < (o.minBridges || 0)) return null
  for (const i of normalCells) {
    const t = tileForMask(conn[i])
    if (!t) return null // isolated cell
    cells[i] = { ...t, tree: owner[i] }
  }

  // leaves per tree (normal cells with degree 1)
  const leaves = [...Array(o.trees)].map(() => [])
  for (const i of normalCells) if (degree(i) === 1) leaves[owner[i]].push(i)
  // colour recipes: neighbouring trees should differ
  const recipe = []
  for (let t = 0; t < o.trees; t++) {
    const mix = t < (o.minMixes || 0) || rng.chance(o.mixChance)
    let color, tries = 0
    do { color = mix ? rng.pick(MIXES) : rng.pick(PRIMARIES); tries++ } while (tries < 10 && recipe.includes(color) && recipe.length < 6)
    recipe.push(color)
  }
  for (let t = 0; t < o.trees; t++) {
    const color = recipe[t]
    const wells = PRIMARIES.filter(p => color & p)
    const lv = rng.shuffle(leaves[t].slice())
    const nTargets = Math.min(rng.int(o.targetsPerTree[0], o.targetsPerTree[1]), lv.length - wells.length)
    if (nTargets < 1) return null
    wells.forEach((p, k) => { cells[lv[k]].source = p })
    for (let k = 0; k < nTargets; k++) cells[lv[wells.length + k]].target = color
  }

  const solution = { w, h, cells: cells.map(c => (c ? { ...c } : null)) }
  const check = analyse(solution)
  if (!check.solved) return null

  // scramble, lock some tiles
  const board = cloneBoard(solution)
  const rotatable = []
  board.cells.forEach((c, i) => { if (c && ROT_STATES[c.kind] > 1) rotatable.push(i) })
  const lockN = Math.floor(rotatable.length * o.lockFraction)
  const lockSet = new Set(rng.shuffle(rotatable.slice()).slice(0, lockN))
  let moved = 0
  for (const i of rotatable) {
    const c = board.cells[i]
    if (lockSet.has(i)) { c.locked = true; continue }
    const states = ROT_STATES[c.kind]
    const r0 = c.rot
    c.rot = (r0 + rng.int(0, 3)) % 4
    if (rotMask(KIND[c.kind], c.rot) !== rotMask(KIND[c.kind], r0)) moved++
  }
  const free = rotatable.length - lockN
  if (moved < Math.min(free, Math.max(3, Math.ceil(free * 0.6)))) return null
  const start = analyse(board)
  if (start.solved) return null
  if (start.targets.filter(t => t.ok).length > Math.floor(start.targets.length / 2)) return null
  // minimal clockwise taps to solve (par)
  let par = 0
  board.cells.forEach((c, i) => {
    if (!c || c.locked || ROT_STATES[c.kind] === 1) return
    const target = rotMask(KIND[c.kind], solution.cells[i].rot)
    for (let k = 0; k < 4; k++) if (rotMask(KIND[c.kind], c.rot + k) === target) { par += k; break }
  })
  return { board, solution, meta: { trees: o.trees, recipe, par, bridges: [...bridgeSet].filter(b => solution.cells[b].kind === 'bridge').length } }
}

// ---------------------------------------------------------------- shaped boards
// Boards drawn from the parchment's construction figures. Each mask keeps only its largest
// connected region so the forest can cover every cell.
function keepLargest(mask, w, h) {
  const seen = new Array(w * h).fill(false)
  let best = []
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue
    const comp = [i]; seen[i] = true
    for (let k = 0; k < comp.length; k++) {
      const c = comp[k], x = c % w, y = (c / w) | 0
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d], j = ny * w + nx
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[j] && !seen[j]) { seen[j] = true; comp.push(j) }
      }
    }
    if (comp.length > best.length) best = comp
  }
  const out = new Array(w * h).fill(false)
  best.forEach(i => { out[i] = true })
  return out
}

function strokeMask(w, h, pts, radius) {
  const mask = new Array(w * h).fill(false)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + 0.5, py = y + 0.5
    let best = Infinity
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1]
      const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1
      const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2))
      best = Math.min(best, Math.hypot(px - ax - vx * t, py - ay - vy * t))
    }
    if (best <= radius) mask[y * w + x] = true
  }
  return keepLargest(mask, w, h)
}

function sinePoints(w, h, thick = 1.45, cycles = 1) {
  const pts = []
  for (let k = 0; k <= 60; k++) { const t = k / 60; pts.push([t * w, h / 2 - Math.sin(t * Math.PI * 2 * cycles) * (h / 2 - thick)]) }
  return pts
}
export function sineMask(w, h, { thick = 1.45, cycles = 1 } = {}) {
  return strokeMask(w, h, sinePoints(w, h, thick, cycles), thick)
}

export function ringMask(w, h, { inner = 0.38 } = {}) {
  const mask = new Array(w * h).fill(false)
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R
    if (d <= 1.04 && d >= inner) mask[y * w + x] = true
  }
  return keepLargest(mask, w, h)
}

function spiralPoints(w, h) {
  // golden spiral: r grows by phi every quarter turn, traced from the outside in
  const phi = (1 + Math.sqrt(5)) / 2, b = Math.log(phi) / (Math.PI / 2)
  const R = Math.min(w, h) * 0.48, cx = w * 0.56, cy = h * 0.54
  const pts = []
  for (let k = 0; k <= 160; k++) {
    const th = (k / 160) * 2.2 * Math.PI * 2
    const r = R * Math.exp(-b * th)
    if (r < 0.9) break
    pts.push([cx + Math.cos(th + Math.PI) * r, cy + Math.sin(th + Math.PI) * r])
  }
  return pts
}
export function spiralMask(w, h, { thick = 1.05 } = {}) {
  return strokeMask(w, h, spiralPoints(w, h), thick)
}

// The construction curve behind a shaped board, in cell units (drawn as a pencil guide).
export function shapeGuide(shape, w, h) {
  if (shape === 'sine') return [sinePoints(w, h)]
  if (shape === 'spiral') return [spiralPoints(w, h)]
  if (shape === 'ring') {
    const R = Math.min(w, h) / 2, out = [], inn = []
    for (let k = 0; k <= 72; k++) { const a = (k / 72) * Math.PI * 2; out.push([w / 2 + Math.cos(a) * R * 0.71, h / 2 + Math.sin(a) * R * 0.71]); inn.push([w / 2 + Math.cos(a) * R * 0.2, h / 2 + Math.sin(a) * R * 0.2]) }
    return [out, inn]
  }
  return []
}
