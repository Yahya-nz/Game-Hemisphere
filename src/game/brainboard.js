// The brain under the board. Dry: pencil-sketched folds. Wherever paint flows, the folds
// beneath the pathway soak up that network's colour (relief x colour + gloss).
// The brain art itself is rendered once per session (see app/scene.js) and stretched to fit.
import { DX, DY, groupsOf } from './engine.js'
import { PAINT_HEX } from './view.js'

export function createBrainBoard(board, view, art, dpr = 1, margin = 0.42) {
  const { cs, ox, oy } = view
  const rect = { x: ox - cs * margin, y: oy - cs * margin, w: board.w * cs + 2 * cs * margin, h: board.h * cs + 2 * cs * margin }
  // keep a brain-like proportion even for tiny tutorial boards
  const minH = rect.w * 0.82
  if (rect.h < minH) { const d = (minH - rect.h) / 2; rect.y -= d; rect.h = minH }
  const minW = rect.h * 0.7
  if (rect.w < minW) { const d = (minW - rect.w) / 2; rect.x -= d; rect.w = minW }
  // the soaked colour layer is soft by nature, so it is composited at a modest resolution
  const scale = Math.min(dpr, 640 / Math.max(rect.w, rect.h))
  const tmp = document.createElement('canvas')
  tmp.width = Math.max(4, Math.ceil(rect.w * scale)); tmp.height = Math.max(4, Math.ceil(rect.h * scale))
  // the pencil brain plus its washes is baked once per layout (and per wash level)
  const bscale = Math.min(dpr, 1100 / Math.max(rect.w, rect.h))
  const base = document.createElement('canvas')
  base.width = Math.max(4, Math.ceil(rect.w * bscale)); base.height = Math.max(4, Math.ceil(rect.h * bscale))
  const SPP = 8
  const stain = document.createElement('canvas')
  stain.width = Math.ceil(rect.w / cs * SPP); stain.height = Math.ceil(rect.h / cs * SPP)
  return { rect, stain, tmp, base, baseKey: '', stainKey: '', SPP, art, cs, ox, oy }
}

function bakeBase(bb, board, wash, voidWash) {
  const { rect, base, art, cs, ox, oy } = bb
  const g = base.getContext('2d')
  const k = base.width / rect.w
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, base.width, base.height)
  g.drawImage(art.sketch, 0, 0, base.width, base.height)
  if (art.silhouette && wash > 0) { g.globalAlpha = wash; g.drawImage(art.silhouette, 0, 0, base.width, base.height); g.globalAlpha = 1 }
  if (art.silhouette && voidWash > 0) {
    const { w, h, cells } = board
    g.save()
    g.setTransform(k, 0, 0, k, -rect.x * k, -rect.y * k)
    g.beginPath()
    for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
      const inside = x >= 0 && y >= 0 && x < w && y < h && cells[y * w + x]
      if (!inside) g.rect(ox + x * cs - 0.5, oy + y * cs - 0.5, cs + 1, cs + 1)
    }
    g.clip()
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.globalAlpha = voidWash
    g.drawImage(art.silhouette, 0, 0, base.width, base.height)
    g.restore()
  }
}

/**
 * spread: 1 = a band along wet pathways; larger values flood the folds (the bloom).
 */
export function drawBrainBoard(ctx, bb, board, analysis, anim, { spread = 1, sketchAlpha = 1, wash = 0, voidWash = 0 } = {}) {
  const { rect, stain, tmp, SPP, art, cs, ox, oy } = bb
  if (!art) return
  const baseKey = wash.toFixed(2) + '|' + voidWash.toFixed(2)
  if (bb.baseKey !== baseKey) { bakeBase(bb, board, wash, voidWash); bb.baseKey = baseKey }
  // what the colour layer depends on; when unchanged, the last composite is reused
  const { w, h, cells } = board
  let key = spread.toFixed(3)
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i]) continue
    const colors = anim && anim[i] ? anim[i].color : analysis.cellColors[i]
    const wets = anim && anim[i] ? anim[i].wet : null
    key += colors[0] ? `${i}:${colors[0]}:${wets ? Math.round(wets[0] * 50) : 50},` : ''
    if (colors[1]) key += `${i}b:${colors[1]}:${wets ? Math.round(wets[1] * 50) : 50},`
    key += cells[i].rot
  }
  const any = /:\d+:[1-9]/.test(key)
  if (key !== bb.stainKey) {
    bb.stainKey = key
    const s = stain.getContext('2d')
    s.setTransform(1, 0, 0, 1, 0, 0)
    s.clearRect(0, 0, stain.width, stain.height)
    // stain space: 1 unit = 1 cell, origin at the board's top-left cell corner
    s.setTransform(SPP, 0, 0, SPP, (ox - rect.x) / cs * SPP, (oy - rect.y) / cs * SPP)
    s.lineCap = 'round'; s.lineJoin = 'round'
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, tile = cells[i]
      if (!tile) continue
      const colors = anim && anim[i] ? anim[i].color : analysis.cellColors[i]
      groupsOf(tile).forEach((dirs, gi) => {
        const c = colors[gi]
        if (!c) return
        const wet = anim && anim[i] ? anim[i].wet[gi] : 1
        if (wet <= 0) return
        s.globalAlpha = Math.min(1, wet)
        s.strokeStyle = PAINT_HEX[c]; s.fillStyle = PAINT_HEX[c]
        s.lineWidth = 0.62 * spread
        s.beginPath()
        for (const d of dirs) { s.moveTo(x + 0.5, y + 0.5); s.lineTo(x + 0.5 + DX[d] * 0.5, y + 0.5 + DY[d] * 0.5) }
        s.stroke()
        s.beginPath(); s.arc(x + 0.5, y + 0.5, 0.34 * spread, 0, Math.PI * 2); s.fill()
      })
    }
    s.globalAlpha = 1
    const t = tmp.getContext('2d')
    t.globalCompositeOperation = 'source-over'
    t.clearRect(0, 0, tmp.width, tmp.height)
    if (any) {
      t.imageSmoothingEnabled = true
      t.drawImage(stain, 0, 0, tmp.width, tmp.height)
      t.globalCompositeOperation = 'multiply'
      t.drawImage(art.relief, 0, 0, tmp.width, tmp.height)
      t.globalCompositeOperation = 'destination-in'
      t.drawImage(stain, 0, 0, tmp.width, tmp.height)
      t.drawImage(art.relief, 0, 0, tmp.width, tmp.height)
      t.globalCompositeOperation = 'source-atop'
      t.drawImage(art.gloss, 0, 0, tmp.width, tmp.height)
      t.globalCompositeOperation = 'source-over'
    }
  }
  ctx.save()
  ctx.globalAlpha = sketchAlpha
  ctx.drawImage(bb.base, rect.x, rect.y, rect.w, rect.h)
  ctx.globalAlpha = 1
  if (any) ctx.drawImage(tmp, rect.x, rect.y, rect.w, rect.h)
  ctx.restore()
}
