// Hemisphere: boot, game flow, input and the frame loop.
import { createScene } from './app/scene.js'
import { createUI } from './app/ui.js'
import { STRINGS } from './app/strings.js'
import { createAudio, SCALE } from './lib/audio.js'
import { createStore } from './lib/store.js'
import { createI18n, detectLang } from './lib/i18n.js'
import { CHAPTERS, buildLevel, buildDream, levelKey } from './game/levels.js'
import { createSession } from './game/session.js'
import { ROT_STATES, KIND, rotMask, openMask } from './game/engine.js'

const NOTE_FOR = { 1: 60, 2: 64, 4: 67, 3: 62, 6: 69, 5: 72, 7: 48 }

function start(hot = {}) {
  const store = createStore('hemisphere.v1', {
    settings: { sound: true, music: true, symbols: false, motion: false, lang: null },
    progress: { stars: {} },
    daily: {},
    dreams: 0,
    last: null,
  })
  const S = store.data.settings
  const i18n = createI18n(STRINGS, S.lang || detectLang())
  const t = i18n.t
  document.documentElement.lang = i18n.lang
  const audio = createAudio()
  audio.setMuted(!S.sound)
  audio.setMusic(S.music)

  const mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false }
  const reducedMotion = () => S.motion || mqReduce.matches
  document.documentElement.classList.toggle('reduce-motion', !!S.motion)
  const isTouch = () => (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window

  const canvas = document.getElementById('stage')
  const scene = createScene(canvas, { reducedMotion, symbols: () => S.symbols })
  let session = null
  let level = null
  let mode = 'title'
  let focus = { x: 0, y: 0 }, keyboardMode = false
  let lastActive = performance.now()
  let solvedInfo = null

  const levelColorsCache = {}
  const actions = {}
  const ui = createUI(document.getElementById('ui'), {
    t, i18n, store, audio, actions, isTouch,
    chapterUnlocked, chapterNeed,
    currentKey: () => (level ? level.key : nextLevelRef() ? levelKey(...nextLevelRef()) : null),
    levelColors: (c, l) => {
      const k = levelKey(c, l)
      if (!levelColorsCache[k]) {
        const L = buildLevel(c, l)
        const set = new Set(); L.solution.cells.forEach(cell => { if (cell && cell.target) set.add(cell.target) })
        levelColorsCache[k] = [...set]
      }
      return levelColorsCache[k]
    },
    todayKey,
    dailyStreak,
  })
  i18n.apply(document)

  // ---------------------------------------------------------------- progress helpers
  function solvedCount(c) { return CHAPTERS[c].levels.filter((_, l) => store.data.progress.stars[levelKey(c, l)]).length }
  function chapterNeed(c) { if (c === 0) return 0; const prev = CHAPTERS[c - 1].levels.length; return Math.max(0, Math.ceil(prev * 0.6) - solvedCount(c - 1)) }
  function chapterUnlocked(c) { return c === 0 || (chapterUnlocked(c - 1) && chapterNeed(c) === 0) }
  function nextLevelRef() {
    for (let c = 0; c < CHAPTERS.length; c++) {
      if (!chapterUnlocked(c)) break
      for (let l = 0; l < CHAPTERS[c].levels.length; l++) if (!store.data.progress.stars[levelKey(c, l)]) return [c, l]
    }
    return null
  }
  function todayKey() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  function dailyStreak() {
    const d = new Date()
    const key = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    if (!store.data.daily[key(d)]) d.setDate(d.getDate() - 1)
    let n = 0
    while (store.data.daily[key(d)] && n < 3650) { n++; d.setDate(d.getDate() - 1) }
    return n
  }
  function refreshPlayLabel() {
    const any = Object.keys(store.data.progress.stars).length > 0
    ui.setPlayLabel(any ? t('continue') : t('play'))
  }

  // ---------------------------------------------------------------- level flow
  function levelTitle() {
    if (level.dream) return level.daily ? t('dailyLabel', { date: level.seed }) : t('dreamLabel', { size: t(level.dream) })
    return t('levelLabel', { chapter: t(CHAPTERS[level.chapter].name), n: level.index + 1 })
  }
  function levelSub() {
    if (level.dream) return t('dreamSub').split('.')[0]
    return t(CHAPTERS[level.chapter].name + 'sub')
  }
  function coachText() {
    if (!level.coach) return null
    let txt = t(level.key === 'lines-1' && !isTouch() ? 'coach1Mouse' : level.coach)
    if (level.key === 'lines-2') txt += ' ' + (isTouch() ? t('coachBackTouch') : t('coachBackMouse'))
    return txt
  }
  function mixesIn(L) {
    const set = new Set()
    L.solution.cells.forEach(c => { if (c && c.target && [3, 5, 6].includes(c.target)) set.add(c.target) })
    return [...set].sort()
  }

  function loadLevel(L, { snapshot = null } = {}) {
    level = L
    solvedInfo = null
    session = createSession(L, { reducedMotion, onEvent })
    if (snapshot) {
      try {
        snapshot.rots.forEach((r, i) => { if (session.board.cells[i] && r !== null) session.board.cells[i].rot = r })
        // replay through turn() is unnecessary; rebuild analysis by a no-op reset of history
        session.restoreMoves && session.restoreMoves(snapshot.moves)
      } catch { /* ignore a stale snapshot */ }
    }
    scene.setSession(session)
    scene.endBloom()
    ui.setBloomed(false)
    focus = { x: Math.floor(L.board.w / 2), y: Math.floor(L.board.h / 2) }
    scene.setFocus(focus, keyboardMode)
    mode = 'game'
    canvas.tabIndex = 0
    scene.setMode('game')
    ui.show('game')
    ui.setLevelInfo({ title: levelTitle(), sub: levelSub(), moves: 0, par: L.par, canUndo: false, coach: coachText(), mixes: mixesIn(L) })
    requestAnimationFrame(() => { scene.setInsets(ui.hudInsets()); updateCoachPointer() })
    if (!L.dream) { store.data.last = [L.chapter, L.index]; store.save() }
    audio.setMood(0)
    canvas.focus({ preventScroll: true })
    announce(levelTitle())
  }

  function updateCoachPointer() {
    if (!session || !level || !(level.key === 'lines-1' || level.key === 'lines-2') || session.moves > 0) { scene.setCoach(null); return }
    const sol = level.solution
    const i = session.board.cells.findIndex((c, k) => c && !c.locked && ROT_STATES[c.kind] > 1 && openMask(c) !== rotMask(KIND[c.kind], sol.cells[k].rot))
    scene.setCoach(i >= 0 ? { x: i % session.board.w, y: (i / session.board.w) | 0 } : null)
  }

  function onEvent(e) {
    const pan = session && e.x !== undefined ? (e.x / Math.max(1, session.board.w - 1)) * 1.4 - 0.7 : 0
    switch (e.type) {
      case 'turn': audio.pencil(pan); afterMove(); break
      case 'undo': audio.tick(0, 0.8); afterMove(); break
      case 'blocked': audio.tick(pan, 0.55); scene.mark(e.x, e.y, '#2b2620', 0.4); ui.toast(t('blocked'), 1400); announce(t('blocked')); break
      case 'mud': audio.buzz(); ui.toast(t('mud')); announce(t('mud')); break
      case 'hint': scene.mark(e.x, e.y, '#ffc414', 0.9); audio.note(79, { vel: 0.35 }); break
      case 'target':
        audio.note(NOTE_FOR[e.color] || 60, { vel: 0.6, pan })
        audio.splash(pan, 0.7)
        scene.burstAt(e.x, e.y, e.color, 10, 0.8)
        break
      case 'solved': onSolved(e); break
    }
  }

  function afterMove() {
    ui.setMoves(session.moves, level.par, session.canUndo)
    if (session.moves > 0) { scene.setCoach(null); if (level.key === 'lines-1') ui.hideCoach() }
    lastActive = performance.now()
  }

  function onSolved(e) {
    const prevBest = level.dream ? 0 : store.data.progress.stars[level.key] || 0
    if (!level.dream) {
      store.data.progress.stars[level.key] = Math.max(prevBest, e.stars)
    } else if (level.daily) {
      store.data.daily[level.seed] = Math.max(store.data.daily[level.seed] || 0, e.stars)
    } else store.data.dreams = (store.data.dreams || 0) + 1
    store.save()
    solvedInfo = e
    ui.setMoves(e.moves, level.par, false)
    scene.setCoach(null)
    ui.hideCoach()
    scene.startBloom()
    const bloomSession = session
    setTimeout(() => { if (session === bloomSession && session.solved) ui.setBloomed(true) }, reducedMotion() ? 0 : 450)
    audio.bloom(level.dream ? 62 : 60 + (level.chapter % 3) * 2)
    audio.setMood(1)
    announce(t('solvedAria'))
    const praiseN = 1 + ((level.key.length + e.moves) % 5)
    let extra = ''
    if (!level.dream) {
      const c = level.chapter
      if (!prevBest && solvedCount(c) === CHAPTERS[c].levels.length) extra = t('chapterDone', { name: t(CHAPTERS[c].name) })
      if (!nextLevelRef() && !prevBest) extra = t('allDone')
    }
    const nxt = nextAfter()
    lastComplete = { praiseN, stars: e.stars, moves: e.moves, par: e.par, extra: extra ? (extra === t('allDone') ? ['allDone'] : ['chapterDone', CHAPTERS[level.chapter].name]) : null, hasNext: level.dream ? true : !!nxt }
    const solvedSession = session
    setTimeout(() => {
      if (session !== solvedSession || mode !== 'game') return
      mode = 'complete'
      ui.showComplete(completeInfo())
      requestAnimationFrame(() => scene.setInsets(ui.hudInsets(), { animate: true }))
    }, reducedMotion() ? 200 : 1500)
  }

  let lastComplete = null
  function completeInfo() {
    const c = lastComplete
    const extra = !c.extra ? '' : c.extra[0] === 'allDone' ? t('allDone') : t('chapterDone', { name: t(c.extra[1]) })
    return { praise: t('praise' + c.praiseN), stars: c.stars, sub: t(c.moves === 1 ? 'solvedIn1' : 'solvedIn', { moves: c.moves, par: c.par }), extra, nextLabel: level.dream ? t('newDream') : t('next'), hasNext: c.hasNext }
  }

  function nextAfter() {
    if (!level || level.dream) return null
    let c = level.chapter, l = level.index + 1
    if (l >= CHAPTERS[c].levels.length) { c++; l = 0 }
    if (c >= CHAPTERS.length || !chapterUnlocked(c)) return nextLevelRef()
    return [c, l]
  }

  // ---------------------------------------------------------------- actions
  Object.assign(actions, {
    play() {
      const ok = r => Array.isArray(r) && Number.isInteger(r[0]) && Number.isInteger(r[1]) && CHAPTERS[r[0]] && r[1] >= 0 && r[1] < CHAPTERS[r[0]].levels.length
      const ref = nextLevelRef() || (ok(store.data.last) ? store.data.last : [0, 0])
      actions.startLevel(ref[0], ref[1])
    },
    startLevel(c, l) { loadLevel(buildLevel(c, l)) },
    startDream(size) { loadLevel(buildDream(size, String(Date.now() % 1e9))) },
    startDaily() { const d = todayKey(); const L = buildDream('medium', d); L.daily = true; L.seed = d; loadLevel(L) },
    undo() { if (session && mode === 'game') session.undo() },
    restart() {
      if (!level) return
      ui.closeAllPanels()
      loadLevel(level)
    },
    hint() { if (session && mode === 'game') { session.hint(); afterMove() } },
    next() {
      if (!level) return
      if (level.dream) { level.daily ? actions.startDream('medium') : actions.startDream(level.dream); return }
      const n = nextAfter()
      if (n) actions.startLevel(n[0], n[1])
      else { ui.show('title'); goTitle(); ui.openPanel('levels') }
    },
    home() { goTitle() },
    setSetting(key, val) {
      S[key] = val; store.save()
      if (key === 'sound') audio.setMuted(!val)
      if (key === 'music') audio.setMusic(val)
      if (key === 'motion') document.documentElement.classList.toggle('reduce-motion', !!val)
    },
    setLang(l) {
      i18n.setLang(l); S.lang = l; store.save()
      document.documentElement.lang = l
      ui.applyText(); refreshPlayLabel()
      i18n.apply(document.getElementById('app'))
      if (level && (mode === 'game' || mode === 'complete')) ui.setLevelInfo({ title: levelTitle(), sub: levelSub(), moves: session.moves, par: level.par, canUndo: session.canUndo, coach: ui.coachVisible ? coachText() : null, mixes: mixesIn(level) })
      if (mode === 'complete' && lastComplete) ui.showComplete(completeInfo(), { refreshOnly: true })
    },
    makePainting(portrait) {
      try {
        const c = portrait ? scene.renderPainting(1179, 2556, 'Hemisphere · ' + levelTitle()) : scene.renderPainting(2560, 1600, 'Hemisphere · ' + levelTitle())
        return c ? c.toDataURL('image/jpeg', 0.9) : null
      } catch (err) { console.warn(err); return null }
    },
    resetProgress() { store.data.progress.stars = {}; store.data.daily = {}; store.data.dreams = 0; store.data.last = null; store.flush(); refreshPlayLabel() },
    panelClosed() { if (mode === 'game') canvas.focus({ preventScroll: true }) },
  })

  function goTitle() {
    mode = 'title'
    canvas.tabIndex = -1
    level = null; session = null
    scene.setSession(null)
    scene.setMode('title')
    ui.show('title')
    refreshPlayLabel()
    audio.setMood(0.5)
    requestAnimationFrame(() => scene.setTitleBox(ui.titleBox()))
  }

  // ---------------------------------------------------------------- input
  let press = null
  canvas.addEventListener('pointerdown', e => {
    audio.unlock()
    if (mode === 'complete' && session && !ui.panelOpen) {
      // a solved brain is a canvas: flick paint at it, each splash sings a note
      const r = scene.splashAt(e.clientX, e.clientY)
      if (r) {
        const idx = Math.min(SCALE.length - 1, Math.floor(r.height * SCALE.length))
        audio.note(SCALE[idx], { vel: 0.5, pan: r.pan, wetAmt: 0.55 })
        audio.splash(r.pan, 0.5)
      }
      return
    }
    if (mode !== 'game' || !session || ui.panelOpen) return
    if (e.button === 2) return // handled by contextmenu
    const cell = scene.cellAt(e.clientX, e.clientY)
    keyboardMode = false; scene.setFocus(focus, false)
    if (!cell) return
    press = { id: e.pointerId, cell, x: e.clientX, y: e.clientY, done: false, type: e.pointerType }
    if (e.pointerType !== 'mouse') {
      press.timer = setTimeout(() => {
        if (!press || press.done) return
        press.done = true
        session.turn(cell.x, cell.y, -1)
        try { navigator.vibrate && navigator.vibrate(12) } catch { /* not allowed */ }
      }, 430)
    }
  })
  const endPress = e => {
    if (!press || press.id !== e.pointerId) return
    clearTimeout(press.timer)
    const p = press
    press = null
    if (p.done || e.type === 'pointercancel') return
    const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y)
    if (moved > 18) return
    const cell = scene.cellAt(e.clientX, e.clientY)
    if (!cell || cell.x !== p.cell.x || cell.y !== p.cell.y) return
    const dir = e.shiftKey || e.altKey ? -1 : 1
    session.turn(cell.x, cell.y, dir)
    focus = { ...cell }
  }
  canvas.addEventListener('pointerup', endPress)
  canvas.addEventListener('pointercancel', endPress)
  canvas.addEventListener('pointermove', e => {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 18) clearTimeout(press.timer)
    if (e.pointerType === 'mouse' && mode === 'game') scene.setHover(scene.cellAt(e.clientX, e.clientY))
  })
  canvas.addEventListener('pointerleave', () => scene.setHover(null))
  canvas.addEventListener('focus', () => {
    if (mode === 'game' && session && canvas.matches(':focus-visible')) { keyboardMode = true; scene.setFocus(focus, true) }
  })
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault()
    if (mode !== 'game' || !session || ui.panelOpen) return
    const cell = scene.cellAt(e.clientX, e.clientY)
    if (cell) { session.turn(cell.x, cell.y, -1); focus = { ...cell } }
  })

  window.addEventListener('keydown', e => {
    if (ui.panelOpen || e.defaultPrevented) return
    if (mode === 'title' && (e.key === 'Enter') && document.activeElement === document.body) { audio.unlock(); actions.play(); return }
    if (mode === 'complete' && e.key === 'Enter' && document.activeElement === canvas) { actions.next(); return }
    if (mode !== 'game' || !session) return
    const k = e.key
    const move = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k]
    if (move) {
      e.preventDefault(); audio.unlock()
      if (document.activeElement !== canvas) canvas.focus({ preventScroll: true })
      keyboardMode = true
      focus = { x: Math.max(0, Math.min(session.board.w - 1, focus.x + move[0])), y: Math.max(0, Math.min(session.board.h - 1, focus.y + move[1])) }
      scene.setFocus(focus, true)
      announce(describeCell(focus.x, focus.y))
      return
    }
    if (k === ' ' || k === 'Enter') {
      if (document.activeElement && document.activeElement !== canvas && document.activeElement !== document.body) return
      e.preventDefault(); audio.unlock(); keyboardMode = true; scene.setFocus(focus, true)
      if (session.turn(focus.x, focus.y, e.shiftKey ? -1 : 1)) announce(describeCell(focus.x, focus.y))
      return
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (k === 'z' || k === 'Z' || k === 'Backspace') { e.preventDefault(); actions.undo() }
    else if (k === 'h' || k === 'H') actions.hint()
    else if (k === 'r' || k === 'R') actions.restart()
    else if (k === 'Escape') ui.openPanel('menu')
  })

  // Short spoken description of a cell for screen readers.
  function describeCell(x, y) {
    const c = session.board.cells[y * session.board.w + x]
    const pos = t('cellPos', { row: y + 1, col: x + 1 })
    if (!c) return t('cellEmpty') + '. ' + pos
    const colors = session.analysis.cellColors[y * session.board.w + x]
    const paint = colors.filter(Boolean).map(v => t('color' + v)).join(', ') || t('dry')
    let kind = t('kind_' + c.kind)
    if (c.source) kind = t('well', { color: t('color' + c.source) })
    if (c.target) kind = t('target', { color: t('color' + c.target) })
    const dirs = ['dirN', 'dirE', 'dirS', 'dirW'].filter((_, d) => (openMask(c) >> d) & 1).map(k => t(k)).join(' ')
    return `${kind}, ${paint}. ${t('opens', { dirs })}. ${pos}${c.locked ? '. ' + t('pinned') : ''}`
  }

  // ---------------------------------------------------------------- live region
  const live = document.getElementById('live')
  function announce(text) { live.textContent = ''; setTimeout(() => { live.textContent = text }, 40) }

  // ---------------------------------------------------------------- resize + loop
  const app = document.getElementById('app')
  let resizeQueued = false
  const onResize = () => {
    if (resizeQueued) return
    resizeQueued = true
    requestAnimationFrame(() => {
      resizeQueued = false
      const r = canvas.getBoundingClientRect()
      const landscape = r.height < 560 && r.width > r.height * 1.25
      app.classList.toggle('landscape', landscape)
      app.classList.toggle('side-card', landscape || (r.width >= 1000 && r.width > r.height * 1.2))
      scene.resize()
      if (mode === 'title') scene.setTitleBox(ui.titleBox())
      else scene.setInsets(ui.hudInsets())
    })
  }
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(canvas)
  else window.addEventListener('resize', onResize)

  let last = performance.now(), acc = 0
  let frameErrors = 0
  function frame(now) {
    requestAnimationFrame(frame) // schedule first: one bad frame must never stop the game
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    try {
      const settling = session ? session.update(dt) : false
      if (session && mode === 'game' && settling) lastActive = now
      const idle = now - lastActive > 2500 && !scene.busy && !settling && mode !== 'title'
      acc += dt
      if (!idle || acc > 1 / 20) { scene.render(acc); acc = 0 }
    } catch (err) {
      acc = 0
      if (frameErrors++ < 3) console.error(err)
    }
  }

  // ---------------------------------------------------------------- boot
  canvas.tabIndex = -1
  ui.show('title')
  ui.setLoading(true)
  refreshPlayLabel()
  onResize()
  scene.ready.then(() => { ui.setLoading(false); onResize() }).catch(err => { ui.setLoading(false); console.error(err) })
  requestAnimationFrame(frame)
  document.addEventListener('visibilitychange', () => { if (document.hidden) store.flush() })

  // resume a level after a live update of the page
  if (hot && hot.level) {
    try {
      const L = hot.level.dream ? buildDream(hot.level.dream, hot.level.seed) : buildLevel(hot.level.c, hot.level.l)
      if (hot.level.daily) L.daily = true
      loadLevel(L)
    } catch { /* start fresh */ }
  }
  if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
    window.claude.hot.snapshot(() => ({ level: level ? (level.dream ? { dream: level.dream, seed: level.seed, daily: !!level.daily } : { c: level.chapter, l: level.index }) : null }))
  }

  // test hook (used by automated browser tests; harmless for players)
  window.__hemisphere = {
    get mode() { return mode },
    get level() { return level && { key: level.key, par: level.par, w: level.board.w, h: level.board.h } },
    get moves() { return session ? session.moves : 0 },
    get hints() { return session ? session.hints : 0 },
    solveStep() { return session ? session.hint() : null },
    startLevel: (c, l) => actions.startLevel(c, l),
    cellCenter: (x, y) => scene.cellCenterClient(x, y),
    hasTile: (x, y) => !!(session && session.board.cells[y * session.board.w + x]),
    get solved() { return session ? session.solved : false },
    progress: () => JSON.parse(JSON.stringify(store.data.progress)),
  }
}

if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start)
else start((window.claude && window.claude.hot && window.claude.hot.data) || {})
