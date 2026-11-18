// Everything drawn on the canvas: the split backdrop, the title brain, the board and its
// paint, particles, and the bloom when a level is solved.
import { makeFoldGridGen, renderBrainLayersGen, blendLayersGen, seamMix, runSliced } from '../lib/brainart.js'
import { drawParchment, drawConstruction, drawPaintWorld, paintRibbon, drawStaff, splash as drawSplash, PAINT } from '../lib/backdrop.js'
import { makeRng } from '../lib/rng.js'
import { drawTiles, drawLeaks, PAINT_HEX } from '../game/view.js'
import { createBrainBoard, drawBrainBoard } from '../game/brainboard.js'

const ART_W = 860, ART_H = Math.round(ART_W * 1.16)
const TAU = Math.PI * 2
const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3))

export function createScene(canvas, { reducedMotion = () => false, symbols = () => false } = {}) {
  const ctx = canvas.getContext('2d')
  let W = 0, H = 0, dpr = 1
  let bgParch = null, bgPlum = null, titleDecor = null
  let art = null
  let mode = 'title'
  let session = null, bb = null, view = null
  let titleBox = { top: 0, bottom: 0 }
  let titleBrain = null // cached canvas with shadow at current size
  let insets = { top: 70, bottom: 86, left: 16, right: 16, centerFree: false }
  let viewAnim = null // slide/scale from a previous layout to the current one
  let bloom = null
  let split = 0.5, splitTarget = 0.5
  let spread = 1
  const particles = []
  const userSplashes = [] // paint the player flicks onto a solved brain, in cell units
  const marks = [] // transient rings: {x,y,t0,dur,color}
  let coachCell = null
  let focusCell = null, showFocus = false
  let hoverCell = null
  let titleFade = 0
  let time = 0
  const rng = makeRng('scene')

  // ---------------------------------------------------------------- art
  const ready = (async () => {
    const G = await runSliced(makeFoldGridGen('hemisphere', 160, 186))
    const L = await runSliced(renderBrainLayersGen(G, ART_W, ART_H))
    const title = await runSliced(blendLayersGen(L, seamMix))
    const toCanvas = img => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').putImageData(img, 0, 0); return c }
    art = { sketch: toCanvas(L.sketch), paint: toCanvas(L.paint), relief: toCanvas(L.relief), gloss: toCanvas(L.gloss), title: toCanvas(title) }
    // flat paper-coloured brain silhouette, used to wash the folds down under the board
    const sil = document.createElement('canvas'); sil.width = art.sketch.width; sil.height = art.sketch.height
    const sg = sil.getContext('2d'); sg.drawImage(art.sketch, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#efe7d4'; sg.fillRect(0, 0, sil.width, sil.height)
    art.silhouette = sil
    titleBrain = null
    if (session) layoutBoard()
    return art
  })()

  function resize() {
    const r = canvas.getBoundingClientRect()
    const nW = Math.max(1, r.width), nH = Math.max(1, r.height), nD = Math.min(2, window.devicePixelRatio || 1)
    if (nW === W && nH === H && nD === dpr && bgPlum) return false
    W = nW; H = nH; dpr = nD
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
    renderBackgrounds()
    titleBrain = null
    if (session) layoutBoard()
    return true
  }

  function renderBackgrounds() {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr); const g = c.getContext('2d'); g.scale(dpr, dpr); return [c, g] }
    const [p, pg] = mk(W / 2 + 40, H)
    drawParchment(pg, 0, 0, W / 2 + 40, H, 'paper')
    drawConstruction(pg, 0, 0, W / 2, H, 'geometry', { strength: W < 600 ? 0.75 : 1 })
    bgParch = p
    const [q, qg] = mk(W, H)
    drawPaintWorld(qg, 0, 0, W, H, 'paint', { ribbons: false, staff: false, splashes: 0 })
    // right half details: staff and splashes, kept to the right of the seam
    drawPaintWorld(qg, W / 2, 0, W / 2, H, 'paint-right', { ribbons: false, staff: false, splashes: Math.round(18 * Math.min(1.4, W / 1000 + 0.4)), avoid: [[W / 2, 0, W * 0.36, H * 0.3], [W * 0.74, H * 0.4, W * 0.26, H * 0.24]] })
    drawStaff(qg, W / 2 + W * 0.04, H * 0.8, W * 0.44, Math.max(18, H * 0.05), makeRng('staff'), 0.28)
    // left half (seen only while the bloom floods it) gets its own splashes
    drawPaintWorld(qg, 0, 0, W / 2, H, 'paint-left', { ribbons: false, staff: false, splashes: 14 })
    bgPlum = q
    const [d, dg] = mk(W, H)
    const r2 = makeRng('ribbons')
    // ribbons flow out of the right hemisphere, routed between the tagline, the poem and the staff
    const paths = [
      [[0.5, 0.34], [0.62, 0.31], [0.78, 0.37], [0.92, 0.32], [1.08, 0.35]],
      [[0.5, 0.40], [0.64, 0.42], [0.80, 0.36], [0.95, 0.41], [1.08, 0.38]],
      [[0.5, 0.68], [0.63, 0.72], [0.79, 0.66], [0.93, 0.71], [1.08, 0.68]],
    ]
    paths.forEach((pp, k) => {
      const pts = pp.map(([fx, fy]) => [W * fx, H * fy])
      paintRibbon(dg, pts, Math.max(5, Math.min(W, H) * (0.012 + 0.006 * r2.next())), PAINT.colors[(k * 2 + 1) % PAINT.colors.length], PAINT.colors[(k * 3 + 4) % PAINT.colors.length], r2, 0.85)
    })
    titleDecor = d
  }

  // ---------------------------------------------------------------- layout
  // Fit the board between the insets. While playing it is centred on the seam; once solved
  // (the whole backdrop is paint) it may slide to make room for the completion card.
  function layoutBoard(animate = false) {
    if (!session) return
    const b = session.board
    const L = insets.left ?? 16, R = insets.right ?? 16
    let availW, cx
    if (insets.centerFree) { availW = W - L - R; cx = L + availW / 2 }
    else {
      const side = Math.max(L, R, W >= 1000 && H >= 560 ? Math.min(200, W * 0.16) : 12)
      availW = W - 2 * side; cx = W / 2
    }
    const availH = H - insets.top - insets.bottom
    const m = 0.5
    let cs = Math.floor(Math.min(availW / (b.w + 2 * m), availH / (b.h + 2 * m)))
    cs = Math.max(10, Math.min(cs, W < 560 ? 84 : 96))
    const ox = Math.round(cx - (b.w * cs) / 2)
    const oy = Math.round(insets.top + (availH - b.h * cs) / 2)
    const prev = view
    view = { cs, ox, oy }
    viewAnim = animate && prev && !reducedMotion() ? { from: prev, t0: time, dur: 0.45 } : null
    bb = createBrainBoard(b, view, art, dpr)
  }

  // ---------------------------------------------------------------- particles
  function burst(cx, cy, color, n = 12, power = 1) {
    if (reducedMotion()) return
    for (let k = 0; k < n; k++) {
      const a = rng.float(0, TAU), sp = rng.float(60, 220) * power
      particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60 * power, r: rng.float(2, 6) * Math.sqrt(power), color: PAINT_HEX[color] || color, life: 0, ttl: rng.float(0.7, 1.4) })
    }
  }
  function cellCenter(x, y) { return view ? [view.ox + (x + 0.5) * view.cs, view.oy + (y + 0.5) * view.cs] : [W / 2, H / 2] }

  // ---------------------------------------------------------------- drawing
  function drawBackdrop() {
    const sx = W * split
    if (bgPlum) ctx.drawImage(bgPlum, 0, 0, W, H)
    if (bgParch && sx > -20) {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(0, 0)
      const amp = split < 0.49 ? 14 : 0
      for (let y = 0; y <= H; y += 12) ctx.lineTo(sx + Math.sin(y * 0.021 + time * 1.7) * amp + Math.sin(y * 0.05) * amp * 0.4, y)
      ctx.lineTo(0, H)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(bgParch, 0, 0, bgParch.width / dpr, H)
      ctx.restore()
    }
  }

  function drawTitle() {
    if (titleDecor) ctx.drawImage(titleDecor, 0, 0, W, H)
    if (!art) return
    const availTop = titleBox.top || H * 0.24, availBot = titleBox.bottom || H * 0.74
    const maxH = Math.max(120, availBot - availTop - 16)
    let bw = Math.min(W * (W < 700 ? 0.86 : 0.5), maxH / 1.16)
    bw = Math.max(120, bw)
    const bh = bw * 1.16
    const x = W / 2 - bw / 2, y = availTop + (availBot - availTop - bh) / 2
    if (!titleBrain || titleBrain.bw !== Math.round(bw)) {
      const pad = 40
      const c = document.createElement('canvas')
      c.width = Math.ceil((bw + pad * 2) * dpr); c.height = Math.ceil((bh + pad * 2) * dpr)
      const g = c.getContext('2d'); g.scale(dpr, dpr)
      g.shadowColor = 'rgba(20,0,16,0.45)'; g.shadowBlur = 28; g.shadowOffsetY = 10
      g.drawImage(art.title, pad, pad, bw, bh)
      titleBrain = { c, bw: Math.round(bw), pad }
    }
    titleFade = Math.min(1, titleFade + 0.04)
    ctx.globalAlpha = titleFade
    ctx.drawImage(titleBrain.c, x - titleBrain.pad, y - titleBrain.pad, titleBrain.c.width / dpr, titleBrain.c.height / dpr)
    ctx.globalAlpha = 1
    // a few drops of paint drifting off the right hemisphere
    if (!reducedMotion()) {
      for (let k = 0; k < 10; k++) {
        const ph = (time * 0.05 + k * 0.137) % 1
        const px = W / 2 + bw * 0.3 + ph * (W / 2 - bw * 0.2) + Math.sin(time * 0.7 + k) * 10
        const py = y + bh * (0.15 + 0.07 * k) + Math.sin(time * 0.9 + k * 2) * 14
        ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.85
        ctx.fillStyle = PAINT.colors[k % PAINT.colors.length]
        ctx.beginPath(); ctx.arc(px, py, 2.5 + (k % 3), 0, TAU); ctx.fill()
      }
      ctx.globalAlpha = 1
    }
  }

  function drawGame(dt) {
    if (!session || !view) return
    ctx.save()
    if (viewAnim) {
      const k = ease((time - viewAnim.t0) / viewAnim.dur)
      if (k >= 1) viewAnim = null
      else {
        const f = viewAnim.from, s0 = f.cs / view.cs
        const sc = s0 + (1 - s0) * k
        const Ox = f.ox + (view.ox - f.ox) * k, Oy = f.oy + (view.oy - f.oy) * k
        ctx.translate(Ox - view.ox * sc, Oy - view.oy * sc)
        ctx.scale(sc, sc)
      }
    }
    drawGameInner(dt)
    ctx.restore()
  }

  function drawGameInner(dt) {
    const A = session.analysis
    const calm = bloom ? Math.max(0, 0.34 - (time - bloom.t0) * 0.5) : 0.34
    if (bb) drawBrainBoard(ctx, bb, session.board, A, session.anim, { spread, wash: calm, voidWash: session.level.guide && !bloom ? 0.62 : 0 })
    if (session.level.guide && !bloom) drawGuide(session.level.guide)
    const still = reducedMotion()
    const tt = still ? 0 : time
    drawTiles(ctx, session.board, A, view, session.anim, tt, { symbols: symbols() })
    drawLeaks(ctx, session.shownLeaks(), view, still ? 0.35 : time)
    const { cs, ox, oy } = view
    drawUserSplashes(ctx, view)
    // coach pointer: pulsing ring
    if (coachCell && !bloom) {
      const [cx, cy] = cellCenter(coachCell.x, coachCell.y)
      const p = still ? 0.25 : (time * 1.1) % 1
      ctx.strokeStyle = `rgba(229,28,124,${0.9 * (1 - p)})`; ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(cx, cy, cs * (0.42 + p * 0.25), 0, TAU); ctx.stroke()
    }
    if (hoverCell && !showFocus && !bloom) {
      const t = session.board.cells[hoverCell.y * session.board.w + hoverCell.x]
      if (t) {
        ctx.strokeStyle = 'rgba(43,38,32,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4])
        ctx.strokeRect(ox + hoverCell.x * cs + 2, oy + hoverCell.y * cs + 2, cs - 4, cs - 4); ctx.setLineDash([])
      }
    }
    if (showFocus && focusCell && !bloom) {
      ctx.strokeStyle = '#ffb000'; ctx.lineWidth = 3
      ctx.strokeRect(ox + focusCell.x * cs + 1.5, oy + focusCell.y * cs + 1.5, cs - 3, cs - 3)
    }
    for (let k = marks.length - 1; k >= 0; k--) {
      const m = marks[k]
      const p = (time - m.t0) / m.dur
      if (p >= 1) { marks.splice(k, 1); continue }
      const [cx, cy] = cellCenter(m.x, m.y)
      ctx.strokeStyle = m.color; ctx.globalAlpha = 1 - p; ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(cx, cy, cs * (still ? 0.5 : 0.35 + 0.4 * ease(p)), 0, TAU); ctx.stroke()
      ctx.globalAlpha = 1
    }
    void dt
  }

  function drawUserSplashes(g, v) {
    for (const u of userSplashes) drawSplash(g, v.ox + u.x * v.cs, v.oy + u.y * v.cs, u.r * v.cs, u.color, makeRng(u.seed), 0.92)
  }

  // the construction figure a shaped board was cut from, in dashed graphite
  function drawGuide(paths) {
    const { cs, ox, oy } = view
    ctx.save()
    ctx.strokeStyle = 'rgba(30,26,22,0.6)'; ctx.lineWidth = Math.max(1.5, cs * 0.05); ctx.setLineDash([cs * 0.16, cs * 0.12]); ctx.lineCap = 'round'
    for (const pts of paths) {
      ctx.beginPath()
      pts.forEach(([x, y], k) => (k ? ctx.lineTo(ox + x * cs, oy + y * cs) : ctx.moveTo(ox + x * cs, oy + y * cs)))
      ctx.stroke()
    }
    ctx.restore()
  }

  function drawParticles(dt) {
    for (let k = particles.length - 1; k >= 0; k--) {
      const p = particles[k]
      p.life += dt
      if (p.life >= p.ttl) { particles.splice(k, 1); continue }
      p.vy += 420 * dt; p.vx *= 0.985
      p.x += p.vx * dt; p.y += p.vy * dt
      const a = 1 - p.life / p.ttl
      ctx.globalAlpha = Math.min(1, a * 1.5)
      ctx.fillStyle = p.color
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.beginPath(); ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.35, 0, TAU); ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  function render(dt) {
    time += dt
    // bloom timeline
    if (bloom) {
      const t = time - bloom.t0
      const rm = reducedMotion()
      spread = rm ? 4.4 : 1 + 3.4 * ease(t / 1.4)
      splitTarget = -0.06
      if (!bloom.burst && t > 0.15) { bloom.burst = true; bloomBursts() }
    } else {
      spread += (1 - spread) * Math.min(1, dt * 6)
      splitTarget = 0.5
    }
    const k = reducedMotion() ? 1 : Math.min(1, dt * (bloom ? 1.6 : 3.2))
    split += (splitTarget - split) * k
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    drawBackdrop()
    if (mode === 'title') drawTitle()
    else drawGame(dt)
    drawParticles(dt)
  }

  function bloomBursts() {
    if (!session || !view) return
    const b = session.board
    b.cells.forEach((c, i) => {
      if (c && c.target) { const [x, y] = cellCenter(i % b.w, (i / b.w) | 0); burst(x, y, c.target, 16, 1.3) }
    })
    if (bb) {
      const r = bb.rect
      for (let k = 0; k < 8; k++) {
        const a = rng.float(0, TAU)
        burst(r.x + r.w / 2 + Math.cos(a) * r.w * 0.48, r.y + r.h / 2 + Math.sin(a) * r.h * 0.48, rng.pick([1, 2, 3, 4, 5, 6]), 8, 1)
      }
    }
  }

  return {
    ready,
    resize,
    render,
    get size() { return { W, H } },
    setInsets(v, { animate = false } = {}) {
      const next = { ...insets, ...v }
      const same = ['top', 'bottom', 'left', 'right', 'centerFree'].every(k => Math.abs((next[k] || 0) - (insets[k] || 0)) < 1 || next[k] === insets[k])
      insets = next
      if (session && (!same || !view)) layoutBoard(animate)
    },
    setTitleBox(v) { titleBox = v; titleBrain = null },
    setMode(m) { mode = m; if (m === 'title') { titleFade = 0.35; bloom = null } },
    setSession(s) {
      session = s; bloom = null; coachCell = null; marks.length = 0; userSplashes.length = 0
      insets = { ...insets, centerFree: false }
      viewAnim = null
      layoutBoard()
    },
    get view() { return view },
    cellAt(clientX, clientY) {
      if (!view || !session) return null
      const r = canvas.getBoundingClientRect()
      const x = Math.floor((clientX - r.left - view.ox) / view.cs)
      const y = Math.floor((clientY - r.top - view.oy) / view.cs)
      if (x < 0 || y < 0 || x >= session.board.w || y >= session.board.h) return null
      return { x, y }
    },
    cellCenterClient(x, y) { const r = canvas.getBoundingClientRect(); const [cx, cy] = cellCenter(x, y); return [cx + r.left, cy + r.top] },
    burstAt(x, y, color, n, power) { const [cx, cy] = cellCenter(x, y); burst(cx, cy, color, n, power) },
    mark(x, y, color = '#e51c7c', dur = 0.7) { marks.push({ x, y, t0: time, dur, color }) },
    setCoach(c) { coachCell = c },
    setFocus(c, visible) { focusCell = c; showFocus = visible },
    setHover(c) { hoverCell = c },
    // The solved brain as a wallpaper: plum world, fully soaked brain, painted pathways.
    renderPainting(PW, PH, caption) {
      if (!session || !art) return null
      const c = document.createElement('canvas'); c.width = PW; c.height = PH
      const g = c.getContext('2d')
      drawPaintWorld(g, 0, 0, PW, PH, 'painting', { ribbons: false, staff: false, splashes: Math.round(26 * Math.max(PW, PH) / 2000) })
      drawStaff(g, PW * 0.56, PH * 0.84, PW * 0.38, Math.max(16, PH * 0.04), makeRng('painting-staff'), 0.22)
      const b = session.board, m = 0.5
      const cs = Math.floor(Math.min(PW * 0.84 / (b.w + 2 * m), PH * 0.78 / (b.h + 2 * m)))
      const v = { cs, ox: Math.round(PW / 2 - (b.w * cs) / 2), oy: Math.round(PH * 0.47 - (b.h * cs) / 2) }
      const bb2 = createBrainBoard(b, v, art, 1)
      g.save(); g.shadowColor = 'rgba(15,0,12,0.55)'; g.shadowBlur = cs * 0.9; g.shadowOffsetY = cs * 0.2
      g.fillStyle = 'rgba(30,4,26,0.9)'; g.beginPath(); g.ellipse(bb2.rect.x + bb2.rect.w / 2, bb2.rect.y + bb2.rect.h / 2, bb2.rect.w * 0.46, bb2.rect.h * 0.46, 0, 0, TAU); g.fill(); g.restore()
      drawBrainBoard(g, bb2, b, session.analysis, session.anim, { spread: 4.4 })
      drawTiles(g, b, session.analysis, v, session.anim, 0)
      drawUserSplashes(g, v)
      g.fillStyle = 'rgba(247,232,208,0.85)'
      g.font = `italic ${Math.round(Math.min(PW, PH) * 0.028)}px "EB Garamond", Georgia, serif`
      g.textAlign = 'right'; g.textBaseline = 'alphabetic'
      g.fillText(caption, PW * 0.965, PH * 0.965)
      return c
    },
    splashAt(clientX, clientY) {
      if (!view || !session) return null
      const r = canvas.getBoundingClientRect()
      const px = clientX - r.left, py = clientY - r.top
      const x = (px - view.ox) / view.cs, y = (py - view.oy) / view.cs
      const b = session.board
      const cx = Math.floor(x), cy = Math.floor(y)
      let color = null
      if (cx >= 0 && cy >= 0 && cx < b.w && cy < b.h && session.anim[cy * b.w + cx]) color = session.anim[cy * b.w + cx].color.find(c => c) || null
      const hex = color ? PAINT_HEX[color] : PAINT.colors[(userSplashes.length * 5 + 3) % PAINT.colors.length]
      if (userSplashes.length > 120) userSplashes.shift()
      userSplashes.push({ x, y, r: 0.12 + ((userSplashes.length * 7) % 5) * 0.03, color: hex, seed: 'u' + userSplashes.length + ':' + Math.round(px) + ':' + Math.round(py) })
      burst(px, py, hex, 7, 0.7)
      return { height: 1 - Math.max(0, Math.min(1, py / H)), pan: (px / W) * 2 - 1 }
    },
    startBloom() { bloom = { t0: time, burst: false } },
    endBloom() { bloom = null },
    get blooming() { return !!bloom },
    get busy() { return particles.length > 0 || marks.length > 0 || Math.abs(split - splitTarget) > 0.002 || Math.abs(spread - (bloom ? 4.4 : 1)) > 0.01 },
  }
}

// Small static illustration of a board (used by the how-to panel).
export function drawMiniBoard(canvas, board, analysis) {
  const g = canvas.getContext('2d')
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = canvas.clientWidth || 240, h = canvas.clientHeight || 160
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)
  const cs = Math.floor(Math.min((w - 16) / board.w, (h - 16) / board.h))
  const view = { cs, ox: Math.round((w - board.w * cs) / 2), oy: Math.round((h - board.h * cs) / 2) }
  drawTiles(g, board, analysis, view, [], 1.2)
  return view
}

// A curved "turn me" arrow around one cell of a mini board.
export function drawTurnArrow(canvas, view, x, y) {
  const g = canvas.getContext('2d')
  const cx = view.ox + (x + 0.5) * view.cs, cy = view.oy + (y + 0.5) * view.cs, r = view.cs * 0.62
  g.save()
  g.strokeStyle = '#e51c7c'; g.fillStyle = '#e51c7c'; g.lineWidth = 2.5; g.lineCap = 'round'
  const a0 = -Math.PI * 0.85, a1 = -Math.PI * 0.15
  g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke()
  const ex = cx + Math.cos(a1) * r, ey = cy + Math.sin(a1) * r
  const tx = -Math.sin(a1), ty = Math.cos(a1)
  g.beginPath(); g.moveTo(ex + tx * 7, ey + ty * 7); g.lineTo(ex - ty * 5, ey + tx * 5); g.lineTo(ex + ty * 5, ey - tx * 5); g.closePath(); g.fill()
  g.restore()
}
