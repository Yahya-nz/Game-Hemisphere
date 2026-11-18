// Procedural brain art. One labyrinth field (band-limited noise whose zero-set looks like
// cortical folds) rendered two ways: a graphite pencil sketch and glossy liquid paint.
// Both layers are rendered once into ImageData; animations composite them through masks.
import { makeRng } from './rng.js'

const TAU = Math.PI * 2
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x)
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }

// Top-to-bottom flow of paint colours, taken from the artwork's right hemisphere.
export const PAINT_STOPS = [
  [0.00, [255, 92, 160]],
  [0.13, [229, 28, 124]],
  [0.27, [146, 46, 206]],
  [0.41, [255, 58, 52]],
  [0.54, [255, 138, 28]],
  [0.66, [255, 209, 54]],
  [0.79, [78, 198, 92]],
  [0.90, [22, 178, 172]],
  [1.00, [30, 120, 210]],
]

export function paletteAt(stops, t) {
  t = clamp01(t)
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i]
      const f = (t - t0) / (t1 - t0 || 1)
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f]
    }
  }
  return stops[stops.length - 1][1].slice()
}

export function makeBrainField(seed = 'hemisphere', { waves = 14, folds = 24 } = {}) {
  const rng = makeRng(seed)
  const k = TAU * folds
  const dirs = []
  for (let i = 0; i < waves; i++) {
    const th = ((i + rng.float(-0.4, 0.4)) / waves) * Math.PI
    dirs.push(Math.cos(th) * k, Math.sin(th) * k, rng.float(0, TAU))
  }
  const warp = []
  for (let i = 0; i < 4; i++) warp.push(rng.float(2.5, 6.5), rng.float(0, TAU))
  return { dirs, warp, k, norm: 1 / Math.sqrt(waves / 2) }
}

// Field value and gradient at (s,t), in units where the brain is 1 wide.
export function evalField(F, s, t, out) {
  const w = F.warp
  const ws = s + 0.02 * Math.sin(w[0] * t + w[1]) + 0.012 * Math.sin(w[2] * (s + t) + w[3])
  const wt = t + 0.02 * Math.sin(w[4] * s + w[5]) + 0.012 * Math.sin(w[6] * (s - t) + w[7])
  const d = F.dirs
  let n = 0, gx = 0, gy = 0
  for (let i = 0; i < d.length; i += 3) {
    const a = d[i] * ws + d[i + 1] * wt + d[i + 2]
    const sn = Math.sin(a)
    n += Math.cos(a)
    gx -= d[i] * sn
    gy -= d[i + 1] * sn
  }
  out.n = n * F.norm; out.gx = gx * F.norm; out.gy = gy * F.norm
  return out
}

// Labyrinth grid: band-limited noise sharpened by repeated difference-of-Gaussians steps
// (a cheap activator/inhibitor pattern former). Produces long winding gyri instead of blobs.
export function makeFoldGrid(seed, gw, gh, opts) { return drain(makeFoldGridGen(seed, gw, gh, opts)) }

export function* makeFoldGridGen(seed = 'hemisphere', gw = 160, gh = 186, { folds = 24, iters = 44 } = {}) {
  const F = makeBrainField(seed, { waves: 16, folds })
  let g = new Float32Array(gw * gh)
  const o = { n: 0, gx: 0, gy: 0 }
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) g[y * gw + x] = evalField(F, x / gw, y / gw, o).n
  const cellsPerFold = gw / folds
  const s1 = cellsPerFold * 0.16, s2 = cellsPerFold * 0.42
  const k1 = gaussKernel(s1), k2 = gaussKernel(s2)
  const a = new Float32Array(gw * gh), b = new Float32Array(gw * gh), tmp = new Float32Array(gw * gh)
  for (let it = 0; it < iters; it++) {
    blur(g, a, tmp, gw, gh, k1)
    blur(g, b, tmp, gw, gh, k2)
    for (let i = 0; i < g.length; i++) g[i] = Math.tanh(g[i] * 0.4 + (a[i] - b[i]) * 6.0)
    if (it % 4 === 3) yield
  }
  // soften the plateaus so contour hatching spreads across each fold
  blur(g, a, tmp, gw, gh, gaussKernel(cellsPerFold * 0.12))
  return { grid: a, gw, gh }
}

function gaussKernel(sigma) {
  const r = Math.max(1, Math.ceil(sigma * 2.6))
  const k = new Float32Array(r * 2 + 1)
  let sum = 0
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; sum += v }
  for (let i = 0; i < k.length; i++) k[i] /= sum
  return k
}

function blur(src, dst, tmp, w, h, k) {
  const r = (k.length - 1) >> 1
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let i = -r; i <= r; i++) {
        let xx = x + i; xx = xx < 0 ? -xx : xx >= w ? 2 * w - xx - 2 : xx
        acc += src[row + xx] * k[i + r]
      }
      tmp[row + x] = acc
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let i = -r; i <= r; i++) {
        let yy = y + i; yy = yy < 0 ? -yy : yy >= h ? 2 * h - yy - 2 : yy
        acc += tmp[yy * w + x] * k[i + r]
      }
      dst[y * w + x] = acc
    }
  }
}

// Catmull-Rom bicubic sample of a grid at fractional cell coords.
export function sampleGrid(G, fx, fy) {
  const { grid, gw, gh } = G
  const x0 = Math.floor(fx), y0 = Math.floor(fy)
  const tx = fx - x0, ty = fy - y0
  let out = 0
  for (let j = -1; j <= 2; j++) {
    const yy = Math.min(gh - 1, Math.max(0, y0 + j))
    const wy = cr(ty, j)
    let rowAcc = 0
    for (let i = -1; i <= 2; i++) {
      const xx = Math.min(gw - 1, Math.max(0, x0 + i))
      rowAcc += grid[yy * gw + xx] * cr(tx, i)
    }
    out += rowAcc * wy
  }
  return out
}
function cr(t, i) {
  // Catmull-Rom weights for offsets -1,0,1,2
  const t2 = t * t, t3 = t2 * t
  if (i === -1) return -0.5 * t3 + t2 - 0.5 * t
  if (i === 0) return 1.5 * t3 - 2.5 * t2 + 1
  if (i === 1) return -1.5 * t3 + 2 * t2 + 0.5 * t
  return 0.5 * t3 - 0.5 * t2
}

// Signed distance (in half-width units, negative inside) to the top-view brain outline,
// with the longitudinal fissure cut down the middle. u,v in [-1,1].
export function brainSDF(u, v) {
  const th = Math.atan2(v, u)
  const ru = 0.93 + 0.07 * v
  const p = 2.5
  const d = Math.pow(Math.pow(Math.abs(u / ru), p) + Math.pow(Math.abs(v), p), 1 / p)
  const bumps = 0.006 * Math.sin(17 * th + 0.7) + 0.004 * Math.sin(31 * th + 2.1)
  const outline = d - (0.97 + bumps)
  const fw = 0.016 + 0.06 * smoothstep(0.72, 1.0, Math.abs(v))
  return Math.max(outline, fw - Math.abs(u))
}

// Renders both layers from a fold grid. Brain fills the W x H box (H ~ 1.16 W).
export function renderBrainLayers(G, W, H, opts) { return drain(renderBrainLayersGen(G, W, H, opts)) }

export function* renderBrainLayersGen(G, W, H, opts = {}) {
  const crease = opts.crease ?? -0.12
  const lineGap = opts.lineGap ?? 0.26
  const folds = opts.folds ?? 24
  const sketch = new ImageData(W, H)
  const paint = new ImageData(W, H)
  // relief: grey shading to multiply with any paint colour; gloss: white specular highlights
  const relief = new ImageData(W, H)
  const gloss = new ImageData(W, H)
  const R = relief.data, Q = gloss.data
  const N = new Float32Array(W * H)
  const alpha = new Float32Array(W * H)
  const S = sketch.data, P = paint.data
  const scale = G.gw / W
  const px = 2 / W
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H * 2 - 1
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const u = (x + 0.5) / W * 2 - 1
      alpha[i] = clamp01(0.5 - brainSDF(u, v) / px)
      N[i] = sampleGrid(G, (x + 0.5) * scale - 0.5, (y + 0.5) * scale - 0.5)
    }
    if (y % 48 === 47) yield
  }
  let Lx = -0.45, Ly = -0.62, Lz = 0.64
  const Ll = Math.hypot(Lx, Ly, Lz); Lx /= Ll; Ly /= Ll; Lz /= Ll
  let Hx = Lx, Hy = Ly, Hz = Lz + 1
  const Hl = Math.hypot(Hx, Hy, Hz); Hx /= Hl; Hy /= Hl; Hz /= Hl
  const lambda = W / folds
  const bump = lambda * 0.55
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H * 2 - 1
    for (let x = 0; x < W; x++) {
      const i = y * W + x, j = i * 4
      const a = alpha[i]
      if (a <= 0) continue
      const u = (x + 0.5) / W * 2 - 1
      const n = N[i]
      const gx = (N[x < W - 1 ? i + 1 : i] - N[x > 0 ? i - 1 : i]) * 0.5
      const gy = (N[y < H - 1 ? i + W : i] - N[y > 0 ? i - W : i]) * 0.5
      const gradPx = Math.hypot(gx, gy) + 1e-5
      const z = clamp01((n - crease) / 0.85)
      const h = 1 - (1 - z) * (1 - z)
      const dh = z > 0 && z < 1 ? 2 * (1 - z) / 0.85 : 0
      const uc = u < 0 ? -0.5 : 0.5
      const du = (u - uc) / 0.5, dv = v
      const r2 = Math.min(0.97, (du * du + dv * dv) * 0.78)
      const domeK = 0.28 / Math.sqrt(1 - r2)
      let nx = -dh * gx * bump + du * domeK
      let ny = -dh * gy * bump + dv * domeK
      let nz = 1
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl
      const lam = Math.max(0, nx * Lx + ny * Ly + nz * Lz)
      const sd = brainSDF(u, v)
      const rim = smoothstep(-0.14, 0, sd)

      // ---------- pencil sketch ----------
      const dark = clamp01(0.82 - lam * 1.05 + (1 - h) * 0.62 + rim * 0.32)
      let r = 240 - 58 * dark, g = 233 - 60 * dark, b = 220 - 62 * dark
      const grain = 0.94 + 0.06 * hash2(x, y)
      const q = n / lineGap
      const qi = Math.round(q)
      const dLine = Math.abs(q - qi) * lineGap / gradPx
      const thresh = 0.1 + (((qi % 3) + 3) % 3) * 0.22
      const vis = smoothstep(thresh - 0.12, thresh + 0.12, dark)
      const lineA = (1 - smoothstep(0.2, 0.85, dLine)) * vis * 0.62
      const dCrease = Math.abs(n - crease) / gradPx
      const creaseA = (1 - smoothstep(0.45, 1.5, dCrease)) * 0.85
      const crossA = ((x + y) & 3) === 0 ? smoothstep(0.6, 0.85, dark) * 0.5 : 0
      const ink = Math.max(lineA, creaseA, crossA)
      S[j] = (r * (1 - ink) + 44 * ink) * grain
      S[j + 1] = (g * (1 - ink) + 40 * ink) * grain
      S[j + 2] = (b * (1 - ink) + 36 * ink) * grain
      S[j + 3] = 255 * a

      // ---------- liquid paint ----------
      const tq = clamp01((v * 0.5 + 0.5) * 0.94 + 0.03 + 0.05 * n + 0.04 * Math.sin(3.1 * u + 2.3 * v))
      let c = paletteAt(PAINT_STOPS, tq)
      const streak = Math.abs(Math.sin(n * 5.5 + v * 3.0 + u * 2.0))
      if (streak < 0.2) {
        const c2 = paletteAt(PAINT_STOPS, clamp01(tq + 0.15))
        const f = (1 - streak / 0.2) * 0.7
        c = [c[0] + (c2[0] - c[0]) * f, c[1] + (c2[1] - c[1]) * f, c[2] + (c2[2] - c[2]) * f]
      }
      // crevices show deep plum (the background seeping between paint ribbons), not black
      const fill = smoothstep(0.02, 0.55, h)
      const dif = (0.55 + 0.6 * lam) * (1 - rim * 0.25)
      const spec = Math.pow(Math.max(0, nx * Hx + ny * Hy + nz * Hz), 30) * 0.85 * smoothstep(0.2, 0.75, h)
      const edge = (1 - smoothstep(0.4, 1.4, dCrease)) * 0.3
      const pr = c[0] * dif * (1 - edge), pg = c[1] * dif * (1 - edge), pb = c[2] * dif * (1 - edge)
      P[j] = 58 + (pr - 58) * fill + 255 * spec
      P[j + 1] = 10 + (pg - 10) * fill + 248 * spec
      P[j + 2] = 52 + (pb - 52) * fill + 236 * spec
      P[j + 3] = 255 * a
      const rv = 255 * (0.28 + 0.72 * fill) * Math.min(1, dif * 1.05) * (1 - edge * 0.8)
      R[j] = rv; R[j + 1] = rv; R[j + 2] = rv; R[j + 3] = 255 * a
      Q[j] = 255; Q[j + 1] = 250; Q[j + 2] = 240; Q[j + 3] = 255 * a * Math.min(1, spec * 1.2)
    }
    if (y % 24 === 23) yield
  }
  return { sketch, paint, relief, gloss, field: N, alpha, W, H }
}

function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Mixes the two layers per pixel: mixFn(u, v, n) -> 0 (pencil) .. 1 (paint).
export function blendLayers(L, mixFn) { return drain(blendLayersGen(L, mixFn)) }

export function* blendLayersGen(L, mixFn) {
  const { W, H, sketch, paint, field } = L
  const out = new ImageData(W, H)
  const O = out.data, S = sketch.data, P = paint.data
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H * 2 - 1
    for (let x = 0; x < W; x++) {
      const i = y * W + x, j = i * 4
      if (S[j + 3] === 0 && P[j + 3] === 0) continue
      const m = clamp01(mixFn((x + 0.5) / W * 2 - 1, v, field[i]))
      O[j] = S[j] + (P[j] - S[j]) * m
      O[j + 1] = S[j + 1] + (P[j + 1] - S[j + 1]) * m
      O[j + 2] = S[j + 2] + (P[j + 2] - S[j + 2]) * m
      O[j + 3] = S[j + 3]
    }
    if (y % 64 === 63) yield
  }
  return out
}

// The artwork's seam: paint owns the right hemisphere and creeps into the left along the gyri.
export function seamMix(u, v, n) {
  const edge = -0.012 + 0.025 * Math.sin(v * 7.3 + 0.5)
  const base = smoothstep(edge - 0.015, edge + 0.015, u)
  const reach = 0.1 + 0.12 * Math.max(0, Math.sin(v * 5.1 + 1.2)) + 0.06 * Math.sin(v * 17.0)
  const creep = smoothstep(-reach - 0.02, -reach + 0.04, u) * smoothstep(0.1, 0.45, n) * (u < 0 ? 1 : 0)
  return Math.max(base, creep)
}

// Run a generator to completion synchronously and return its value.
export function drain(gen) {
  let r = gen.next()
  while (!r.done) r = gen.next()
  return r.value
}

// Run a generator in ~10ms slices so the page stays responsive.
export function runSliced(gen, budgetMs = 10) {
  return new Promise((resolve, reject) => {
    const step = () => {
      const t0 = performance.now()
      try {
        let r = gen.next()
        while (!r.done && performance.now() - t0 < budgetMs) r = gen.next()
        if (r.done) resolve(r.value)
        else setTimeout(step, 0)
      } catch (e) { reject(e) }
    }
    step()
  })
}
