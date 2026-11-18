// Board renderer. Dry pathways are pencil tubes on the sketched brain; wet pathways are
// glossy paint, and the brain under them takes the network's colour.
import { DX, DY, OPP, groupsOf, openMask, RED, YELLOW, BLUE } from './engine.js'

export const PAINT_HEX = {
  1: '#e8283c', 2: '#ffc414', 3: '#ff7a1a', 4: '#2386e8', 5: '#9340d6', 6: '#2fb24c', 7: '#7a5232',
}
const rgbCache = {}
export function rgbOf(color) {
  if (rgbCache[color]) return rgbCache[color]
  const n = parseInt(PAINT_HEX[color].slice(1), 16)
  return (rgbCache[color] = [(n >> 16) & 255, (n >> 8) & 255, n & 255])
}
export const shade = (color, k) => { const [r, g, b] = rgbOf(color); return `rgb(${r * k | 0},${g * k | 0},${b * k | 0})` }

const GRAPHITE = 'rgba(43,38,33,0.86)'
const PAPER = '#f2ead7'
const TAU = Math.PI * 2

// Primary symbols for colour-blind play: red triangle, yellow circle, blue square.
// A dark outline keeps the white symbols readable on light paints (yellow, orange, green).
export const SYMBOL_OUTLINE = 'rgba(28,22,18,0.85)'
export function drawSymbol(ctx, prim, x, y, r, fill, outline = null) {
  ctx.fillStyle = fill
  ctx.beginPath()
  if (prim === RED) { ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.95, y + r * 0.72); ctx.lineTo(x - r * 0.95, y + r * 0.72); ctx.closePath() }
  else if (prim === YELLOW) ctx.arc(x, y, r * 0.82, 0, TAU)
  else ctx.rect(x - r * 0.72, y - r * 0.72, r * 1.44, r * 1.44)
  if (outline) { ctx.save(); ctx.strokeStyle = outline; ctx.lineWidth = Math.max(1, r * 0.34); ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore() }
  ctx.fill()
}
export function drawRecipe(ctx, color, x, y, r, fill, outline = null) {
  const prims = [RED, YELLOW, BLUE].filter(p => color & p)
  const gap = r * 2.3
  prims.forEach((p, k) => drawSymbol(ctx, p, x + (k - (prims.length - 1) / 2) * gap, y, r, fill, outline))
}

/**
 * view: { cs, ox, oy } cell size and board origin in canvas px
 * anim: per-cell { rotFrom (radians offset), wet: 0..1 per group, wetColor per group, flowFrom: dir|-1 }
 */
export function drawTiles(ctx, board, analysis, view, anim, t, opts = {}) {
  const { w, h, cells } = board
  const { cs, ox, oy } = view
  const tube = cs * 0.24
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, tile = cells[i]
    if (!tile) continue
    const a = anim[i]
    const cx = ox + (x + 0.5) * cs, cy = oy + (y + 0.5) * cs
    ctx.save()
    ctx.translate(cx, cy)
    if (a && a.rot) ctx.rotate(a.rot)
    const groups = groupsOf({ ...tile, rot: 0 })
    // draw in tile-local frame using the tile's base orientation rotated by tile.rot
    ctx.rotate((tile.kind === 'bridge' ? 0 : tile.rot) * Math.PI / 2)
    const colors = a ? a.color : analysis.cellColors[i]
    const wetness = a ? a.wet : colors.map(c => (c ? 1 : 0))
    if (tile.kind === 'bridge') {
      drawArms(ctx, [1, 3], cs, tube, colors[1], wetness[1], a && a.flow ? a.flow[1] : -1)
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = cs * 0.08
      drawArms(ctx, [0, 2], cs, tube, colors[0], wetness[0], a && a.flow ? a.flow[0] : -1)
      ctx.restore()
    } else {
      const dirs = groups[0]
      const special = tile.source || tile.target
      drawArms(ctx, dirs, cs, tube, colors[0], wetness[0], a && a.flow ? localDir(a.flow[0], tile.rot) : -1, !special && dirs.length === 1)
    }
    ctx.restore()
    if (opts.symbols && !tile.source && !tile.target) {
      groups.forEach((_, gi) => {
        const col = colors[gi]
        if (!col || wetness[gi] < 1) return
        if (tile.kind === 'bridge') {
          const off = cs * 0.25
          const [sx, sy] = gi === 0 ? [cx, cy - off] : [cx + off, cy]
          drawRecipe(ctx, col, sx, sy, cs * 0.05, 'rgba(255,255,255,0.95)', SYMBOL_OUTLINE)
        } else drawRecipe(ctx, col, cx, cy, cs * 0.05, 'rgba(255,255,255,0.95)', SYMBOL_OUTLINE)
      })
    }
    if (tile.source) drawWell(ctx, cx, cy, cs, tile.source, t)
    if (tile.target) drawTarget(ctx, cx, cy, cs, tile.target, wetness[0] >= 1 ? colors[0] : 0, t, opts)
    if (tile.locked) drawPin(ctx, ox + x * cs, oy + y * cs, cs)
  }
}

// flow direction is stored in board space; arms are drawn in tile-local space
function localDir(d, rot) { return d < 0 ? -1 : (((d - rot) % 4) + 4) % 4 }

// Segments through a tile, in tile-local space: a straight arm from the centre to an edge, or
// a quarter arc joining two perpendicular edges, so corners read as flowing curves, not pipes.
function segmentsFor(dirs, cs) {
  const L = cs / 2
  if (dirs.length === 2 && (dirs[0] + 2) % 4 !== dirs[1]) {
    const [d1, d2] = dirs
    const cx = (DX[d1] + DX[d2]) * L, cy = (DY[d1] + DY[d2]) * L
    const a1 = Math.atan2(DY[d1] * L - cy, DX[d1] * L - cx)
    let sweep = Math.atan2(DY[d2] * L - cy, DX[d2] * L - cx) - a1
    while (sweep > Math.PI) sweep -= TAU
    while (sweep < -Math.PI) sweep += TAU
    return [{ arc: true, d1, d2, cx, cy, r: L, a1, sweep }]
  }
  return dirs.map(d => ({ arc: false, d }))
}

// Trace part of a segment (t0..t1). Arms run centre -> edge; arcs run d1 -> d2.
// Ends that touch an edge are extended a hair so neighbouring tiles join without a seam.
function trace(ctx, s, cs, t0 = 0, t1 = 1) {
  const L = cs / 2, ext = L * 0.04
  if (s.arc) {
    const p0x = s.cx + Math.cos(s.a1 + s.sweep * t0) * s.r, p0y = s.cy + Math.sin(s.a1 + s.sweep * t0) * s.r
    if (t0 === 0) { ctx.moveTo(p0x + DX[s.d1] * ext, p0y + DY[s.d1] * ext); ctx.lineTo(p0x, p0y) } else ctx.moveTo(p0x, p0y)
    ctx.arc(s.cx, s.cy, s.r, s.a1 + s.sweep * t0, s.a1 + s.sweep * t1, s.sweep < 0)
    if (t1 === 1) ctx.lineTo(DX[s.d2] * (L + ext), DY[s.d2] * (L + ext))
  } else {
    const e = t1 === 1 ? 1 + ext / L : t1
    ctx.moveTo(DX[s.d] * L * t0, DY[s.d] * L * t0)
    ctx.lineTo(DX[s.d] * L * e, DY[s.d] * L * e)
  }
}

function pointOn(s, cs, t) {
  if (s.arc) { const a = s.a1 + s.sweep * t; return [s.cx + Math.cos(a) * s.r, s.cy + Math.sin(a) * s.r, Math.cos(a), Math.sin(a)] }
  const L = cs / 2
  return [DX[s.d] * L * t, DY[s.d] * L * t, -DY[s.d], DX[s.d]]
}

function drawArms(ctx, dirs, cs, tube, color, wet, flowFrom, knob) {
  const segs = segmentsFor(dirs, cs)
  const hub = !segs[0].arc
  // pencil tube (always drawn: it is the structure)
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round'
  ctx.strokeStyle = GRAPHITE; ctx.lineWidth = tube + 3.2
  ctx.beginPath(); segs.forEach(sg => trace(ctx, sg, cs)); ctx.stroke()
  if (hub) { ctx.fillStyle = GRAPHITE; ctx.beginPath(); ctx.arc(0, 0, (tube + 3.2) / 2, 0, TAU); ctx.fill() }
  ctx.strokeStyle = PAPER; ctx.lineWidth = tube
  ctx.beginPath(); segs.forEach(sg => trace(ctx, sg, cs)); ctx.stroke()
  if (hub) { ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(0, 0, tube / 2, 0, TAU); ctx.fill() }
  // pencil hatching across dry tubes
  if (wet < 1) {
    ctx.strokeStyle = 'rgba(43,38,33,0.24)'; ctx.lineWidth = 0.8
    ctx.beginPath()
    for (const sg of segs) {
      const n = sg.arc ? 6 : 4
      for (let k = 0; k < n; k++) {
        const t = sg.arc ? 0.1 + (k / (n - 1)) * 0.8 : 0.3 + k * 0.2
        const [px, py, nx, ny] = pointOn(sg, cs, t)
        const sk = 0.18
        ctx.moveTo(px + nx * tube * 0.36 + ny * tube * sk, py + ny * tube * 0.36 - nx * tube * sk)
        ctx.lineTo(px - nx * tube * 0.36 - ny * tube * sk, py - ny * tube * 0.36 + nx * tube * sk)
      }
    }
    ctx.stroke()
  }
  if (knob) {
    ctx.fillStyle = GRAPHITE; ctx.beginPath(); ctx.arc(0, 0, Math.max(0.5, tube * 0.85), 0, TAU); ctx.fill()
    ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(0, 0, Math.max(0.3, tube * 0.85 - 1.6), 0, TAU); ctx.fill()
  }
  if (!color || wet <= 0) return
  const inner = Math.max(0.6, tube - 2.2)
  ctx.strokeStyle = PAINT_HEX[color]; ctx.fillStyle = PAINT_HEX[color]; ctx.lineWidth = inner
  const p = Math.max(0, Math.min(1, wet))
  const paint = (sg, t0, t1) => { if (t1 <= t0) return; ctx.beginPath(); trace(ctx, sg, cs, t0, t1); ctx.stroke() }
  if (flowFrom >= 0 && dirs.includes(flowFrom)) {
    if (segs[0].arc) {
      const sg = segs[0]
      if (sg.d1 === flowFrom) paint(sg, 0, p)
      else paint(sg, 1 - p, 1)
    } else {
      // in along the entry arm, then out along the others
      const entry = segs.find(sg => sg.d === flowFrom)
      paint(entry, 1 - Math.min(1, p * 2), 1)
      if (p > 0.5) {
        ctx.beginPath(); ctx.arc(0, 0, inner / 2, 0, TAU); ctx.fill()
        segs.forEach(sg => { if (sg !== entry) paint(sg, 0, (p - 0.5) * 2) })
      }
    }
  } else {
    ctx.globalAlpha = p
    segs.forEach(sg => paint(sg, 0, 1))
    if (hub) { ctx.beginPath(); ctx.arc(0, 0, inner / 2, 0, TAU); ctx.fill() }
    ctx.globalAlpha = 1
  }
  if (knob && p > 0.6) { ctx.beginPath(); ctx.arc(0, 0, Math.max(0.3, tube * 0.85 - 2.4), 0, TAU); ctx.fill() }
  // gloss highlight along each segment
  if (p >= 1) {
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = Math.max(1, inner * 0.22); ctx.lineCap = 'round'
    ctx.beginPath()
    for (const sg of segs) {
      if (sg.arc) {
        const r = sg.r + (sg.sweep > 0 ? -1 : 1) * inner * 0.22 * (sg.d1 === 0 || sg.d1 === 3 ? 1 : -1)
        const a0 = sg.a1 + sg.sweep * 0.2, a1 = sg.a1 + sg.sweep * 0.8
        ctx.moveTo(sg.cx + Math.cos(a0) * r, sg.cy + Math.sin(a0) * r)
        ctx.arc(sg.cx, sg.cy, r, a0, a1, sg.sweep < 0)
      } else {
        const d = sg.d, nx = -DY[d], ny = DX[d]
        const off = inner * 0.22 * (d === 0 || d === 3 ? 1 : -1)
        ctx.moveTo(DX[d] * cs * 0.12 + nx * off, DY[d] * cs * 0.12 + ny * off)
        ctx.lineTo(DX[d] * cs * 0.42 + nx * off, DY[d] * cs * 0.42 + ny * off)
      }
    }
    ctx.stroke()
  }
}

function drawWell(ctx, cx, cy, cs, prim, t) {
  const r = cs * 0.3
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = cs * 0.08; ctx.shadowOffsetY = cs * 0.03
  ctx.fillStyle = '#2b2621'; ctx.beginPath(); ctx.arc(cx, cy, r + 2.5, 0, TAU); ctx.fill()
  ctx.restore()
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r)
  const [R, G, B] = rgbOf(prim)
  g.addColorStop(0, `rgb(${Math.min(255, R + 70)},${Math.min(255, G + 70)},${Math.min(255, B + 70)})`)
  g.addColorStop(1, PAINT_HEX[prim])
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill()
  // slow swirl inside the well
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.4
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, t * 1.2, t * 1.2 + 2.2); ctx.stroke()
  drawSymbol(ctx, prim, cx, cy + (prim === RED ? r * 0.06 : 0), r * 0.36, 'rgba(255,255,255,0.96)', SYMBOL_OUTLINE)
}

function drawTarget(ctx, cx, cy, cs, need, got, t, opts) {
  const r = cs * 0.3
  const ok = got === need
  ctx.save()
  ctx.fillStyle = '#2b2621'; ctx.beginPath(); ctx.arc(cx, cy, r + 2.5, 0, TAU); ctx.fill()
  ctx.fillStyle = ok ? PAINT_HEX[need] : got ? PAINT_HEX[got] : '#f6efe0'
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill()
  // needed colour ring (dashed while waiting)
  ctx.strokeStyle = PAINT_HEX[need]; ctx.lineWidth = Math.max(2.5, cs * 0.07)
  if (!ok) ctx.setLineDash([cs * 0.07, cs * 0.05])
  ctx.lineDashOffset = -t * 6
  ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.5, r - ctx.lineWidth / 2 - 1), 0, TAU); ctx.stroke()
  ctx.setLineDash([])
  // waiting: the recipe in ink on cream; filled: white with an ink outline
  if (ok || got) drawRecipe(ctx, need, cx, cy, r * 0.2, 'rgba(255,255,255,0.96)', SYMBOL_OUTLINE)
  else drawRecipe(ctx, need, cx, cy, r * 0.2, '#2b2620')
  if (got && !ok) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(cx + r * 0.45, cy + r * 0.45); ctx.lineTo(cx + r * 0.85, cy + r * 0.85); ctx.stroke()
  }
  ctx.restore()
}

function drawPin(ctx, x, y, cs) {
  const px = x + cs * 0.82, py = y + cs * 0.18, r = Math.max(2.2, cs * 0.06)
  ctx.fillStyle = '#2b2621'; ctx.beginPath(); ctx.arc(px, py, r + 1.2, 0, TAU); ctx.fill()
  ctx.fillStyle = '#b9a27a'; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill()
}

// Paint dripping out of open ends of wet pathways.
export function drawLeaks(ctx, leaks, view, t) {
  const { cs, ox, oy } = view
  for (const l of leaks) {
    const ex = ox + (l.x + 0.5 + DX[l.d] * 0.5) * cs, ey = oy + (l.y + 0.5 + DY[l.d] * 0.5) * cs
    const ph = (t * 0.8 + (l.x * 7 + l.y * 3) * 0.13) % 1
    ctx.fillStyle = PAINT_HEX[l.color]
    ctx.beginPath(); ctx.arc(ex, ey, cs * 0.11, 0, TAU); ctx.fill()
    const dx = DX[l.d], dy = DY[l.d]
    const dist = cs * (0.12 + ph * 0.3)
    ctx.globalAlpha = 1 - ph
    ctx.beginPath(); ctx.arc(ex + dx * dist + (dy ? 0 : 0), ey + dy * dist + (dx ? cs * 0.08 * ph : 0), cs * 0.06 * (1 - ph * 0.5), 0, TAU); ctx.fill()
    ctx.globalAlpha = 1
  }
}
