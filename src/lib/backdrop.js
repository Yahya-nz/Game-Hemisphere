// Procedural backdrops from the artwork: the LEFT world (aged parchment with faint geometric
// construction drawings) and the RIGHT world (deep plum with paint ribbons, splashes and a staff).
import { makeRng } from './rng.js'

const TAU = Math.PI * 2
const PHI = (1 + Math.sqrt(5)) / 2

export const SKETCH = {
  paper: '#efe5cf', paperEdge: '#d9c7a3', ink: '#2e2924', inkSoft: 'rgba(46,41,36,0.22)', inkFaint: 'rgba(46,41,36,0.12)',
}
export const PAINT = {
  plum: '#4a0c38', plumDeep: '#25051f', plumGlow: '#7a1456', cream: '#f7e8d0',
  colors: ['#ff4f9a', '#e51c7c', '#9a2fd2', '#ff3d33', '#ff8a1c', '#ffd13a', '#4ec65c', '#16b2ac', '#2a78d8'],
}

// ---------------------------------------------------------------- parchment
export function drawParchment(ctx, x, y, w, h, seed = 'paper') {
  const rng = makeRng(seed)
  ctx.save()
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
  const g = ctx.createRadialGradient(x + w * 0.5, y + h * 0.45, Math.min(w, h) * 0.1, x + w * 0.5, y + h * 0.5, Math.hypot(w, h) * 0.62)
  g.addColorStop(0, '#f3ead6'); g.addColorStop(0.6, SKETCH.paper); g.addColorStop(1, SKETCH.paperEdge)
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h)
  // stains
  for (let i = 0; i < 7; i++) {
    const sx = x + rng.float(0, w), sy = y + rng.float(0, h), r = rng.float(0.08, 0.3) * Math.max(w, h)
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r)
    sg.addColorStop(0, `rgba(170,130,70,${rng.float(0.03, 0.07)})`); sg.addColorStop(1, 'rgba(170,130,70,0)')
    ctx.fillStyle = sg; ctx.fillRect(x, y, w, h)
  }
  // fibres
  ctx.lineWidth = 0.6
  for (let i = 0; i < (w * h) / 5000; i++) {
    const fx = x + rng.float(0, w), fy = y + rng.float(0, h), a = rng.float(0, TAU), l = rng.float(4, 18)
    ctx.strokeStyle = `rgba(120,95,60,${rng.float(0.04, 0.1)})`
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo(fx + Math.cos(a + 0.4) * l * 0.5, fy + Math.sin(a + 0.4) * l * 0.5, fx + Math.cos(a) * l, fy + Math.sin(a) * l); ctx.stroke()
  }
  // grain
  ctx.fillStyle = 'rgba(90,70,40,0.06)'
  for (let i = 0; i < (w * h) / 90; i++) ctx.fillRect(x + rng.float(0, w), y + rng.float(0, h), 1, 1)
  ctx.restore()
}

// A wobbly graphite line (two light passes, like a hand with a ruler).
export function pencilLine(ctx, x1, y1, x2, y2, rng, alpha = 0.22, width = 0.9) {
  for (let p = 0; p < 2; p++) {
    ctx.strokeStyle = `rgba(46,41,36,${alpha * (p ? 0.55 : 1)})`
    ctx.lineWidth = width * (p ? 0.7 : 1)
    ctx.beginPath()
    const j = () => rng.float(-0.8, 0.8)
    ctx.moveTo(x1 + j(), y1 + j())
    const mx = (x1 + x2) / 2 + j() * 1.5, my = (y1 + y2) / 2 + j() * 1.5
    ctx.quadraticCurveTo(mx, my, x2 + j(), y2 + j())
    ctx.stroke()
  }
}

// Faint construction drawings: sine wave with axes, golden spiral, compass circles, rays, dotted guides.
export function drawConstruction(ctx, x, y, w, h, seed = 'geometry', { strength = 1 } = {}) {
  const rng = makeRng(seed)
  const s = Math.min(w, h)
  const A = 0.2 * strength
  ctx.save()
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
  ctx.lineCap = 'round'
  // sine wave with axes, top-left
  {
    const ox = x + w * 0.08, oy = y + h * 0.16, L = w * 0.5, amp = s * 0.07
    pencilLine(ctx, ox, oy, ox + L, oy, rng, A)
    pencilLine(ctx, ox + 4, oy - amp * 1.5, ox + 4, oy + amp * 1.5, rng, A)
    ctx.strokeStyle = `rgba(46,41,36,${A * 1.3})`; ctx.lineWidth = 1.1
    ctx.beginPath()
    for (let i = 0; i <= 120; i++) {
      const t = i / 120, px = ox + t * L, py = oy - Math.sin(t * TAU * 1.5) * amp
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
    }
    ctx.stroke()
    for (let i = 1; i < 7; i++) pencilLine(ctx, ox + (L * i) / 6, oy - 3, ox + (L * i) / 6, oy + 3, rng, A)
    dotted(ctx, ox + L * 0.166, oy - amp, ox + L * 0.166, oy, A)
  }
  // golden spiral inside its rectangle, bottom-left
  {
    const rw = s * 0.42, rh = rw / PHI
    const ox = x + w * 0.06, oy = y + h * 0.95 - rh
    goldenSpiral(ctx, ox, oy, rw, rng, A)
  }
  // compass circles and rays, centre
  {
    const cx = x + w * rng.float(0.45, 0.6), cy = y + h * 0.55, R = s * 0.32
    ctx.strokeStyle = `rgba(46,41,36,${A * 0.6})`; ctx.lineWidth = 0.8
    for (const k of [1, 0.62, 0.38]) { ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, TAU); ctx.stroke() }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU
      pencilLine(ctx, cx, cy, cx + Math.cos(a) * R * 1.1, cy + Math.sin(a) * R * 1.1, rng, A * 0.45, 0.6)
    }
  }
  // dotted guides and plus marks
  for (let i = 0; i < 5; i++) {
    const gy = y + rng.float(0.05, 0.95) * h
    dotted(ctx, x + rng.float(0, w * 0.3), gy, x + rng.float(w * 0.6, w), gy, A * 0.7)
  }
  ctx.fillStyle = `rgba(46,41,36,${A * 1.4})`
  for (let i = 0; i < 9; i++) {
    const px = x + rng.float(0.05, 0.95) * w, py = y + rng.float(0.05, 0.95) * h
    ctx.fillRect(px - 3, py - 0.4, 6, 0.8); ctx.fillRect(px - 0.4, py - 3, 0.8, 6)
  }
  ctx.restore()
}

function dotted(ctx, x1, y1, x2, y2, a) {
  const d = Math.hypot(x2 - x1, y2 - y1), n = Math.floor(d / 5)
  ctx.fillStyle = `rgba(46,41,36,${a})`
  for (let i = 0; i <= n; i++) {
    const t = i / (n || 1)
    ctx.beginPath(); ctx.arc(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 0.7, 0, TAU); ctx.fill()
  }
}

export function goldenSpiral(ctx, ox, oy, rw, rng, A = 0.2) {
  let x = ox, y = oy, w = rw, h = rw / PHI
  pencilLine(ctx, x, y, x + w, y, rng, A); pencilLine(ctx, x + w, y, x + w, y + h, rng, A)
  pencilLine(ctx, x + w, y + h, x, y + h, rng, A); pencilLine(ctx, x, y + h, x, y, rng, A)
  const arcs = [], guides = []
  for (let i = 0; i < 9; i++) {
    const sq = Math.min(w, h)
    const dir = i % 4
    if (dir === 0) { arcs.push([x + sq, y + sq, sq, Math.PI]); guides.push([x + sq, y, x + sq, y + h]); x += sq; w -= sq }
    else if (dir === 1) { arcs.push([x, y + sq, sq, -Math.PI / 2]); guides.push([x, y + sq, x + w, y + sq]); y += sq; h -= sq }
    else if (dir === 2) { arcs.push([x + w - sq, y, sq, 0]); guides.push([x + w - sq, y, x + w - sq, y + h]); w -= sq }
    else { arcs.push([x + sq, y + h - sq, sq, Math.PI / 2]); guides.push([x, y + h - sq, x + w, y + h - sq]); h -= sq }
  }
  for (const g of guides) pencilLine(ctx, g[0], g[1], g[2], g[3], rng, A * 0.8, 0.7)
  ctx.strokeStyle = `rgba(46,41,36,${Math.min(0.6, A * 1.7)})`; ctx.lineWidth = 1.2
  ctx.beginPath()
  arcs.forEach(([cx, cy, r, a0], i) => {
    if (i === 0) ctx.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r)
    ctx.arc(cx, cy, r, a0, a0 + Math.PI / 2)
  })
  ctx.stroke()
}

// ---------------------------------------------------------------- paint world
export function drawPaintWorld(ctx, x, y, w, h, seed = 'paint', { ribbons = true, staff = true, splashes = 26, avoid = [] } = {}) {
  const rng = makeRng(seed)
  ctx.save()
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
  const g = ctx.createRadialGradient(x + w * 0.45, y + h * 0.45, 0, x + w * 0.5, y + h * 0.5, Math.hypot(w, h) * 0.7)
  g.addColorStop(0, PAINT.plumGlow); g.addColorStop(0.45, PAINT.plum); g.addColorStop(1, PAINT.plumDeep)
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h)
  // soft colour clouds
  for (let i = 0; i < 6; i++) {
    const cx = x + rng.float(0, w), cy = y + rng.float(0, h), r = rng.float(0.15, 0.4) * Math.max(w, h)
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    const col = hexToRgb(rng.pick(PAINT.colors))
    cg.addColorStop(0, `rgba(${col},0.16)`); cg.addColorStop(1, `rgba(${col},0)`)
    ctx.fillStyle = cg; ctx.fillRect(x, y, w, h)
  }
  if (staff) drawStaff(ctx, x + w * 0.05, y + h * 0.18, w * 0.9, h * 0.1, rng)
  if (ribbons) {
    for (let i = 0; i < 4; i++) {
      const y0 = y + h * rng.float(0.1, 0.9)
      const pts = []
      for (let k = 0; k <= 5; k++) pts.push([x - w * 0.1 + (w * 1.2 * k) / 5, y0 + rng.float(-0.15, 0.15) * h])
      paintRibbon(ctx, pts, rng.float(6, 16) * (w / 600 + 0.5), rng.pick(PAINT.colors), rng.pick(PAINT.colors), rng, 0.78)
    }
  }
  for (let i = 0; i < splashes; i++) {
    const sx = x + rng.float(0, w), sy = y + rng.float(0, h)
    const r = rng.float(2.5, 7) * (0.6 + Math.min(w, h) / 900)
    const col = rng.pick(PAINT.colors)
    if (avoid.some(([ax, ay, aw, ah]) => sx > ax - 20 && sx < ax + aw + 20 && sy > ay - 20 && sy < ay + ah + 20)) continue
    splash(ctx, sx, sy, r, col, rng)
  }
  ctx.restore()
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

// Catmull-Rom through pts, filled as a ribbon whose width swells and tapers, glossy highlight on top.
export function paintRibbon(ctx, pts, width, c1, c2, rng, alpha = 1) {
  const path = spline(pts, 18)
  const left = [], right = []
  for (let i = 0; i < path.length; i++) {
    const [px, py] = path[i]
    const [qx, qy] = path[Math.min(path.length - 1, i + 1)]
    const [rx, ry] = path[Math.max(0, i - 1)]
    let tx = qx - rx, ty = qy - ry
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl
    const t = i / (path.length - 1)
    const wv = width * (0.25 + 0.75 * Math.sin(Math.PI * t)) * (0.85 + 0.3 * Math.sin(t * 9 + width))
    left.push([px - ty * wv, py + tx * wv]); right.push([px + ty * wv, py - tx * wv])
  }
  const [x0, y0] = path[0], [x1, y1] = path[path.length - 1]
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  g.addColorStop(0, c1); g.addColorStop(1, c2)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.shadowColor = 'rgba(20,0,16,0.45)'; ctx.shadowBlur = width * 0.8; ctx.shadowOffsetY = width * 0.25
  ctx.fillStyle = g
  ctx.beginPath()
  left.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1])
  ctx.closePath(); ctx.fill()
  ctx.shadowColor = 'transparent'
  // glossy streaks
  ctx.strokeStyle = 'rgba(255,250,240,0.5)'; ctx.lineWidth = Math.max(1, width * 0.14); ctx.lineCap = 'round'
  ctx.beginPath()
  path.forEach(([px, py], i) => {
    const off = width * 0.35
    const [ax, ay] = left[i]
    const qx = px + (ax - px) * 0.45, qy = py + (ay - py) * 0.45
    i ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy)
    void off
  })
  ctx.stroke()
  ctx.restore()
}

export function spline(pts, seg = 12) {
  const out = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let s = 0; s < seg; s++) {
      const t = s / seg, t2 = t * t, t3 = t2 * t
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ])
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

// A paint splash: main blob, satellite droplets, a couple of radial streaks, a highlight.
export function splash(ctx, x, y, r, color, rng, alpha = 0.9) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  blob(ctx, x, y, r, rng)
  const n = rng.int(3, 8)
  for (let i = 0; i < n; i++) {
    const a = rng.float(0, TAU), d = r * rng.float(1.4, 3.2), rr = r * rng.float(0.12, 0.38)
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, 0, TAU); ctx.fill()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.35, r * 0.28, r * 0.16, -0.6, 0, TAU); ctx.fill()
  ctx.restore()
}

function blob(ctx, x, y, r, rng) {
  const k = 9, ph = rng.float(0, TAU)
  ctx.beginPath()
  for (let i = 0; i <= k * 4; i++) {
    const a = (i / (k * 4)) * TAU
    const rr = r * (1 + 0.12 * Math.sin(a * 3 + ph) + 0.07 * Math.sin(a * 7 + ph * 2))
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
  }
  ctx.closePath(); ctx.fill()
}

// Flowing musical staff with a few notes, in cream, like the artwork's upper right.
export function drawStaff(ctx, x, y, w, h, rng, alpha = 0.32) {
  const gap = h / 4
  const curve = t => Math.sin(t * Math.PI * 1.2 + 0.4) * h * 0.9 - t * h * 0.6
  ctx.save()
  ctx.strokeStyle = `rgba(247,232,208,${alpha})`; ctx.lineWidth = 1
  for (let l = 0; l < 5; l++) {
    ctx.beginPath()
    for (let i = 0; i <= 60; i++) {
      const t = i / 60, px = x + t * w, py = y + curve(t) + l * gap
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
    }
    ctx.stroke()
  }
  ctx.fillStyle = `rgba(247,232,208,${alpha * 1.6})`
  const notes = rng.int(5, 8)
  for (let i = 0; i < notes; i++) {
    const t = 0.12 + (i / notes) * 0.8 + rng.float(-0.02, 0.02)
    const line = rng.int(0, 8) / 2
    const px = x + t * w, py = y + curve(t) + line * gap
    ctx.beginPath(); ctx.ellipse(px, py, gap * 0.62, gap * 0.45, -0.4, 0, TAU); ctx.fill()
    ctx.fillRect(px + gap * 0.5, py - gap * 3, 1.2, gap * 3)
    if (rng.chance(0.5)) {
      ctx.beginPath(); ctx.moveTo(px + gap * 0.5 + 1, py - gap * 3)
      ctx.quadraticCurveTo(px + gap * 1.4, py - gap * 2.2, px + gap * 1.1, py - gap * 1.4); ctx.lineWidth = 1.4
      ctx.strokeStyle = `rgba(247,232,208,${alpha * 1.6})`; ctx.stroke()
    }
  }
  ctx.restore()
}
