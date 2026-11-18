// Rules engine (pure, no DOM). Pathway tiles on a grid carry paint from wells to targets.
// Directions: 0=N 1=E 2=S 3=W. A tile's openings are a 4-bit mask (bit d = open toward d).

export const N = 0, E = 1, S = 2, W = 3
export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]
export const OPP = [2, 3, 0, 1]

// Primary paints as bits; any union is a colour.
export const RED = 1, YELLOW = 2, BLUE = 4
export const COLOR_NAMES = { 0: 'dry', 1: 'red', 2: 'yellow', 3: 'orange', 4: 'blue', 5: 'purple', 6: 'green', 7: 'umber' }

// Tile kinds and their base masks (rotation 0).
export const KIND = {
  end: 0b0001,       // N
  straight: 0b0101,  // N+S
  corner: 0b0011,    // N+E
  tee: 0b0111,       // N+E+S
  cross: 0b1111,     // all four, one junction (paints mix)
  bridge: 0b1111,    // N-S and E-W pass over each other without touching
}

export const rotMask = (mask, r) => {
  r = ((r % 4) + 4) % 4
  return ((mask << r) | (mask >> (4 - r))) & 0xf
}

// Port groups of a tile: arrays of direction lists that are internally connected.
export function groupsOf(tile) {
  if (tile.kind === 'bridge') return [[N, S], [E, W]] // rotation-invariant by symmetry
  const m = rotMask(KIND[tile.kind], tile.rot)
  const dirs = []
  for (let d = 0; d < 4; d++) if (m & (1 << d)) dirs.push(d)
  return [dirs]
}

export const openMask = tile => rotMask(KIND[tile.kind], tile.rot)

// How many distinct rotations a kind has (for scrambling and move counting).
export const ROT_STATES = { end: 4, straight: 2, corner: 4, tee: 4, cross: 1, bridge: 1 }

export function cloneBoard(b) {
  return { w: b.w, h: b.h, cells: b.cells.map(c => (c ? { ...c } : null)) }
}

// Analyse a board: connected networks, their colours, leaks, targets, win state.
// Returns { nodeColor: Map key->color, cellColors: per cell array of group colours,
//           leaks: [{x,y,d}], targets: [{x,y,need,got,ok}], allWet, solved }
export function analyse(board) {
  const { w, h, cells } = board
  // node id = cellIndex*2 + groupIndex
  const parent = new Map()
  const find = a => { let r = a; while (parent.get(r) !== r) r = parent.get(r); let c = a; while (parent.get(c) !== r) { const n = parent.get(c); parent.set(c, r); c = n } return r }
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  const groupDir = new Array(cells.length) // per cell: dir -> group index (or -1)
  for (let i = 0; i < cells.length; i++) {
    const t = cells[i]
    if (!t) continue
    const gs = groupsOf(t)
    const map = [-1, -1, -1, -1]
    gs.forEach((g, gi) => { parent.set(i * 2 + gi, i * 2 + gi); g.forEach(d => { map[d] = gi }) })
    groupDir[i] = map
  }
  const leaksRaw = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, t = cells[i]
    if (!t) continue
    const map = groupDir[i]
    for (let d = 0; d < 4; d++) {
      if (map[d] < 0) continue
      const nx = x + DX[d], ny = y + DY[d]
      const j = ny * w + nx
      const inside = nx >= 0 && ny >= 0 && nx < w && ny < h && cells[j]
      if (inside && groupDir[j][OPP[d]] >= 0) {
        if (d === E || d === S) union(i * 2 + map[d], j * 2 + groupDir[j][OPP[d]])
      } else {
        leaksRaw.push({ x, y, d, node: i * 2 + map[d] })
      }
    }
  }
  const compColor = new Map()
  for (let i = 0; i < cells.length; i++) {
    const t = cells[i]
    if (t && t.source) {
      const r = find(i * 2 + 0)
      compColor.set(r, (compColor.get(r) || 0) | t.source)
    }
  }
  const colorOf = node => compColor.get(find(node)) || 0
  const cellColors = cells.map((t, i) => (t ? groupsOf(t).map((_, gi) => colorOf(i * 2 + gi)) : null))
  const leaks = leaksRaw.filter(l => colorOf(l.node) !== 0).map(({ x, y, d, node }) => ({ x, y, d, color: colorOf(node) }))
  const targets = []
  let allWet = true
  for (let i = 0; i < cells.length; i++) {
    const t = cells[i]
    if (!t) continue
    if (cellColors[i].some(c => c === 0)) allWet = false
    if (t.target) {
      const got = cellColors[i][0]
      targets.push({ x: i % w, y: (i / w) | 0, need: t.target, got, ok: got === t.target })
    }
  }
  const solved = allWet && leaks.length === 0 && targets.every(t => t.ok)
  return { cellColors, leaks, targets, allWet, solved }
}

export function rotate(board, x, y, dir = 1) {
  const t = board.cells[y * board.w + x]
  if (!t || t.locked) return false
  if (ROT_STATES[t.kind] === 1) return false
  t.rot = (((t.rot + dir) % 4) + 4) % 4
  return true
}

// Adjacency between port groups: node = cellIndex*2 + group. Returns array of [node, dir] lists,
// where dir is the direction travelled from this node's cell to the neighbour.
export function buildGraph(board) {
  const { w, h, cells } = board
  const adj = new Map()
  const groupAt = (i, d) => {
    const t = cells[i]
    if (!t) return -1
    const gs = groupsOf(t)
    for (let g = 0; g < gs.length; g++) if (gs[g].includes(d)) return g
    return -1
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    if (!cells[i]) continue
    groupsOf(cells[i]).forEach((dirs, g) => {
      const list = []
      for (const d of dirs) {
        const nx = x + DX[d], ny = y + DY[d]
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        const gj = groupAt(j, OPP[d])
        if (gj >= 0) list.push([j * 2 + gj, d])
      }
      adj.set(i * 2 + g, list)
    })
  }
  return adj
}

// Breadth-first distances (in cells) from the given start nodes. Returns Map node -> {dist, from}
// where `from` is the direction paint arrives from (-1 at the start nodes).
export function flowFrom(adj, starts) {
  const out = new Map()
  const q = []
  for (const s of starts) if (adj.has(s) && !out.has(s)) { out.set(s, { dist: 0, from: -1 }); q.push(s) }
  for (let k = 0; k < q.length; k++) {
    const n = q[k], dn = out.get(n).dist
    for (const [m, d] of adj.get(n)) {
      if (out.has(m)) continue
      out.set(m, { dist: dn + 1, from: OPP[d] })
      q.push(m)
    }
  }
  return out
}

// Minimal single rotations (either direction) to bring each tile to the solution orientation.
export function rotationsToSolve(board, solution) {
  let total = 0
  board.cells.forEach((c, i) => {
    if (!c || c.locked || ROT_STATES[c.kind] === 1) return
    const target = rotMask(KIND[c.kind], solution.cells[i].rot)
    for (let k = 0; k < 4; k++) if (rotMask(KIND[c.kind], c.rot + k) === target) { total += Math.min(k, 4 - k); break }
  })
  return total
}
