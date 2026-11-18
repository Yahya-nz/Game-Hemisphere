// Procedural WebAudio. Nothing plays until unlock() runs inside a user gesture.
// Left-brain sounds are dry and precise (pencil, ticks, music-box); right-brain sounds are
// wet and lush (paint splashes, kalimba notes in reverb, pads).

const A4 = 440
export const mtof = m => A4 * Math.pow(2, (m - 69) / 12)
// Notes per paint colour (a pentatonic-friendly set), so colours have voices.
export const SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84]

export function createAudio() {
  let ac = null, master = null, dry = null, wet = null, comp = null
  let muted = false, musicOn = true, volume = 0.8
  let noiseBuf = null
  let musicTimer = null, musicStep = 0, musicMood = 0 // 0 = left (sparse), 1 = right (lush)

  function ensure() {
    if (ac) return ac
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    try { ac = new AC() } catch { return null }
    comp = ac.createDynamicsCompressor()
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2
    master = ac.createGain(); master.gain.value = muted ? 0 : volume
    master.connect(comp); comp.connect(ac.destination)
    dry = ac.createGain(); dry.gain.value = 1; dry.connect(master)
    const verb = ac.createConvolver(); verb.buffer = impulse(ac, 2.6, 2.2)
    wet = ac.createGain(); wet.gain.value = 0.55
    wet.connect(verb); verb.connect(master)
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 1, ac.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    return ac
  }

  function impulse(ctx, seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c)
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
    }
    return buf
  }

  const ready = () => ac && ac.state === 'running' && !muted

  function out(node, pan = 0, wetAmt = 0.3) {
    let last = node
    if (ac.createStereoPanner) {
      const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan))
      node.connect(p); last = p
    }
    const g1 = ac.createGain(); g1.gain.value = 1 - wetAmt * 0.5
    const g2 = ac.createGain(); g2.gain.value = wetAmt
    last.connect(g1); g1.connect(dry)
    last.connect(g2); g2.connect(wet)
  }

  function noise(dur, t0) {
    const src = ac.createBufferSource(); src.buffer = noiseBuf
    src.loop = true
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05)
    return src
  }

  const api = {
    unlock() {
      const ctx = ensure()
      if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {})
      if (musicOn && !musicTimer) startMusic()
    },
    get available() { return !!(window.AudioContext || window.webkitAudioContext) },
    setMuted(m) { muted = !!m; if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ac.currentTime, 0.05) },
    get muted() { return muted },
    setMusic(on) { musicOn = !!on; if (!musicOn) stopMusic(); else if (ac) startMusic() },
    get music() { return musicOn },
    setMood(m) { musicMood = Math.max(0, Math.min(1, m)) },

    // graphite on paper: a short band-passed scratch
    pencil(pan = 0, strength = 1) {
      if (!ready()) return
      const t = ac.currentTime
      const src = noise(0.12, t)
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200 + Math.random() * 2600; bp.Q.value = 1.1 + Math.random() * 0.8
      const g = ac.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime((0.11 + Math.random() * 0.05) * strength, t + 0.012)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09 + Math.random() * 0.04)
      src.connect(bp); bp.connect(g); out(g, pan, 0.05)
    },
    // a dry wooden tick for UI and rotations
    tick(pan = 0, pitch = 1) {
      if (!ready()) return
      const t = ac.currentTime
      const o = ac.createOscillator(); o.type = 'triangle'
      o.frequency.setValueAtTime(1500 * pitch, t); o.frequency.exponentialRampToValueAtTime(700 * pitch, t + 0.04)
      const g = ac.createGain(); g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
      o.connect(g); out(g, pan, 0.05); o.start(t); o.stop(t + 0.08)
    },
    // music-box / kalimba note: sine fundamental + bright partial, long reverb tail
    note(midi, { vel = 0.6, pan = 0, wetAmt = 0.45, dur = 1.6, delay = 0 } = {}) {
      if (!ready()) return
      const t = ac.currentTime + delay
      const f = mtof(midi)
      const g = ac.createGain()
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32 * vel, t + 0.006)
      g.gain.exponentialRampToValueAtTime(0.001, t + dur)
      const o1 = ac.createOscillator(); o1.type = 'sine'; o1.frequency.value = f
      const o2 = ac.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 4.02
      const g2 = ac.createGain(); g2.gain.setValueAtTime(0.18 * vel, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
      o1.connect(g); o2.connect(g2); g2.connect(g); out(g, pan, wetAmt)
      o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + 0.3)
    },
    // wet paint splash: low "bloop" + lowpassed noise burst
    splash(pan = 0, size = 1) {
      if (!ready()) return
      const t = ac.currentTime
      const o = ac.createOscillator(); o.type = 'sine'
      o.frequency.setValueAtTime(520 / Math.sqrt(size), t); o.frequency.exponentialRampToValueAtTime(140, t + 0.18)
      const og = ac.createGain(); og.gain.setValueAtTime(0.0, t); og.gain.linearRampToValueAtTime(0.28, t + 0.01); og.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
      o.connect(og); out(og, pan, 0.35); o.start(t); o.stop(t + 0.25)
      const src = noise(0.3, t)
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(400, t + 0.25)
      const ng = ac.createGain(); ng.gain.setValueAtTime(0.18 * size, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.28)
      src.connect(lp); lp.connect(ng); out(ng, pan, 0.4)
    },
    // soft "wrong" sound: two detuned low notes
    buzz(pan = 0) {
      if (!ready()) return
      const t = ac.currentTime
      for (const f of [146.8, 155.6]) {
        const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f
        const g = ac.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
        o.connect(g); out(g, pan, 0.15); o.start(t); o.stop(t + 0.4)
      }
    },
    // rising arpeggio for a solved moment
    chord(midis, { spread = 0.07, vel = 0.55 } = {}) {
      midis.forEach((m, i) => api.note(m, { vel, delay: i * spread, pan: (i / Math.max(1, midis.length - 1)) * 1.2 - 0.6, dur: 2.4, wetAmt: 0.6 }))
    },
    // big bloom: arpeggio + swell pad
    bloom(root = 60) {
      if (!ready()) return
      api.chord([root, root + 4, root + 7, root + 11, root + 14, root + 19], { spread: 0.09, vel: 0.5 })
      const t = ac.currentTime
      for (const [m, d] of [[root - 12, 0], [root - 5, 5], [root + 4, -6]]) {
        const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = d
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(1600, t + 1.2); lp.frequency.linearRampToValueAtTime(500, t + 3)
        const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.8); g.gain.linearRampToValueAtTime(0, t + 3.2)
        o.connect(lp); lp.connect(g); out(g, 0, 0.7); o.start(t); o.stop(t + 3.3)
      }
    },
  }

  // Generative background music: a slow pentatonic phrase. Mood 0 = sparse, dry and regular
  // (left brain); mood 1 = denser, wetter, wandering (right brain).
  function startMusic() {
    if (musicTimer || !ac) return
    const phrase = [0, 2, 4, 3, 5, 4, 2, 1]
    musicTimer = setInterval(() => {
      if (!ready() || !musicOn || document.hidden) return
      musicStep++
      const beatsPerNote = musicMood < 0.5 ? 2 : 1
      if (musicStep % beatsPerNote) return
      const idx = phrase[(musicStep / beatsPerNote) % phrase.length | 0]
      const wander = musicMood > 0.5 && Math.random() < 0.4 ? (Math.random() < 0.5 ? 1 : -1) : 0
      const m = SCALE[Math.max(0, Math.min(SCALE.length - 1, idx + 2 + wander))]
      api.note(m - 12, { vel: 0.22 + 0.1 * musicMood, wetAmt: 0.35 + 0.4 * musicMood, dur: 2.8, pan: Math.random() * 0.8 - 0.4 })
      if (musicStep % 16 === 0) api.note(SCALE[0] - 24, { vel: 0.25, wetAmt: 0.6, dur: 4 })
    }, 620)
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null } }

  return api
}
