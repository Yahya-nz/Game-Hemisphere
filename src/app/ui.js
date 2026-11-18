// DOM screens over the canvas: title, HUD, completion card, and panels.
import { CHAPTERS, levelKey, parse, DREAM_SIZES } from '../game/levels.js'
import { analyse } from '../game/engine.js'
import { drawRecipe, PAINT_HEX, SYMBOL_OUTLINE } from '../game/view.js'
import { drawMiniBoard, drawTurnArrow } from './scene.js'

const I = {
  menu: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  undo: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  restart: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  hint: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>',
  close: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  grid: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/></svg>',
  moon: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  help: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 0 1 5 1c0 1.8-2.5 2-2.5 4"/><path d="M12 17.5h.01"/></svg>',
  gear: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  home: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/></svg>',
  play: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  star: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>',
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function createUI(root, ctx) {
  // ctx: { t, i18n, store, audio, actions: {...}, isTouch }
  const { t } = ctx
  const $ = sel => root.querySelector(sel)
  let current = null
  let panelStack = []
  let panelSeq = 0
  // while a panel is open, everything behind it is inert (no focus, no clicks)
  function updateInert() {
    const open = panelStack.length > 0
    for (const el of [document.getElementById('stage'), title, hud, complete]) if (el) el.inert = open
    panelStack.forEach((p, k) => { p.wrap.inert = k < panelStack.length - 1 })
  }
  let toastTimer = null

  function screen(id, html) {
    const el = document.createElement('section')
    el.className = 'screen'; el.id = id; el.hidden = true
    el.innerHTML = html
    root.appendChild(el)
    return el
  }

  // ---------------------------------------------------------------- title
  const title = screen('screen-title', `
    <div class="title-top">
      <h1 class="lockup" aria-label="Hemisphere"><span class="hemi" aria-hidden="true">Hemi</span><span class="sphere" aria-hidden="true">sphere</span></h1>
      <p class="tagline"><span data-i18n="taglineL"></span><span data-i18n="taglineR"></span></p>
    </div>
    <div class="poems" aria-hidden="true">
      <p class="poem left"><span class="big" data-i18n="poemLeft1"></span><span data-i18n="poemLeft2"></span><br><span data-i18n="poemLeft3"></span></p>
      <p class="poem right"><span class="big" data-i18n="poemRight1"></span><span data-i18n="poemRight2"></span><br><span data-i18n="poemRight3"></span></p>
    </div>
    <div class="title-actions">
      <p class="loading-note" id="loading-note" data-i18n="loading"></p>
      <button class="btn-paint" id="btn-play" data-act="play"></button>
      <div class="title-row">
        <button class="btn-card" data-act="levels">${I.grid}<span data-i18n="levels"></span></button>
        <button class="btn-card" data-act="dream">${I.moon}<span data-i18n="dream"></span></button>
        <button class="btn-card" data-act="howto">${I.help}<span data-i18n="howto"></span></button>
        <button class="btn-card" data-act="settings" data-i18n-aria="settings">${I.gear}</button>
      </div>
    </div>`)

  // ---------------------------------------------------------------- HUD
  const hud = screen('hud', `
    <div class="hud-top">
      <div class="hud-left">
        <button class="icon-btn on-paper" data-act="menu" data-i18n-aria="menu" data-i18n-title="menu">${I.menu}</button>
        <div class="level-name"><b id="lvl-title"></b><small id="lvl-sub"></small></div>
      </div>
      <div class="hud-right">
        <div class="counter" aria-live="off"><b id="moves">0</b><small id="moves-sub"></small></div>
      </div>
    </div>
    <div class="legend" id="legend" aria-hidden="true"></div>
    <div class="hud-bottom">
      <div class="group left">
        <span class="with-label"><button class="icon-btn on-paper" data-act="undo" id="btn-undo" data-i18n-aria="undo">${I.undo}</button><span data-i18n="undo"></span></span>
        <span class="with-label"><button class="icon-btn on-paper" data-act="restart" data-i18n-aria="restart">${I.restart}</button><span data-i18n="restart"></span></span>
      </div>
      <div class="group right">
        <span class="with-label"><button class="icon-btn on-plum" data-act="hint" id="btn-hint" data-i18n-aria="hint">${I.hint}</button><span data-i18n="hint"></span></span>
      </div>
    </div>
    <div class="coach" id="coach" hidden></div>
    <div class="toast" id="toast" role="status" hidden></div>`)

  // ---------------------------------------------------------------- complete
  const complete = screen('screen-complete', `
    <div class="complete-card" role="dialog" aria-labelledby="praise">
      <h2 class="praise" id="praise"></h2>
      <div class="stars" id="stars"></div>
      <div class="complete-sub" id="complete-sub"></div>
      <div class="complete-extra" id="complete-extra"></div>
      <div class="complete-tip" data-i18n="splashTip"></div>
      <div class="complete-actions">
        <button class="btn-paint" data-act="next" id="btn-next"></button>
        <button class="btn-card" data-act="painting"><span data-i18n="painting"></span></button>
        <button class="btn-card" data-act="replay"><span data-i18n="replay"></span></button>
        <button class="btn-card" data-act="levels"><span data-i18n="levels"></span></button>
      </div>
    </div>`)

  // ---------------------------------------------------------------- panels
  const panelRoot = screen('panels', '')
  panelRoot.style.zIndex = 5

  function openPanel(kind, opts = {}) {
    const wrap = document.createElement('div')
    wrap.className = 'screen'
    wrap.style.pointerEvents = 'auto'
    wrap.innerHTML = `<div class="veil" data-act="close-panel"></div>`
    const panel = document.createElement('div')
    panel.className = 'panel' + (kind === 'levels' || kind === 'howto' || kind === 'painting' ? ' wide' : '')
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true')
    const hid = 'panel-title-' + (++panelSeq)
    panel.innerHTML = `<header><h2 id="${hid}"></h2><button class="icon-btn close" data-act="close-panel" data-i18n-aria="close">${I.close}</button></header><div class="body"></div>`
    panel.setAttribute('aria-labelledby', hid)
    wrap.appendChild(panel)
    panelRoot.appendChild(wrap)
    panelRoot.hidden = false
    const body = panel.querySelector('.body')
    const head = panel.querySelector('h2')
    const fill = () => {
      if (kind === 'levels') fillLevels(head, body)
      else if (kind === 'settings') fillSettings(head, body)
      else if (kind === 'howto') fillHowto(head, body)
      else if (kind === 'dream') fillDream(head, body)
      else if (kind === 'menu') fillMenu(head, body)
      else if (kind === 'painting') fillPainting(head, body, opts)
      ctx.i18n.apply(wrap)
    }
    fill()
    panelStack.push({ kind, wrap, fill, opener: document.activeElement })
    updateInert()
    const focusable = panel.querySelector('.body button, .body input') || panel.querySelector('.close')
    // move focus into the dialog, unless the player already put it somewhere inside
    setTimeout(() => { if (focusable && focusable.isConnected && !panel.contains(document.activeElement)) focusable.focus({ preventScroll: true }) }, 30)
    if (opts.scrollTo) { const el = body.querySelector(opts.scrollTo); if (el) el.scrollIntoView({ block: 'center' }) }
  }
  function closePanel() {
    const p = panelStack.pop()
    if (!p) return false
    p.wrap.remove()
    if (!panelStack.length) panelRoot.hidden = true
    updateInert()
    if (p.opener && p.opener.focus) p.opener.focus({ preventScroll: true })
    ctx.actions.panelClosed && ctx.actions.panelClosed(p.kind)
    return true
  }
  function closeAllPanels() { while (closePanel()) { /* empty */ } }

  function fillLevels(head, body) {
    head.textContent = t('levels')
    const prog = ctx.store.data.progress.stars
    body.innerHTML = CHAPTERS.map((ch, c) => {
      const unlocked = ctx.chapterUnlocked(c)
      const solvedN = ch.levels.filter((_, l) => prog[levelKey(c, l)]).length
      const levels = ch.levels.map((_, l) => {
        const key = levelKey(c, l), st = prog[key] || 0
        const recipe = ctx.levelColors(c, l)
        const bg = st && recipe.length ? `style="background:${recipe.length > 1 ? `linear-gradient(135deg, ${recipe.map(r => PAINT_HEX[r]).join(', ')})` : PAINT_HEX[recipe[0]]}"` : ''
        const cur = ctx.currentKey() === key ? ' current' : ''
        return `<button class="level-btn${st ? ' solved' : ''}${cur}" data-act="level" data-c="${c}" data-l="${l}" ${bg} aria-label="${esc(t('levelLabel', { chapter: t(ch.name), n: l + 1 }))}${st ? ', ' + esc(t('starsAria', { n: st })) : ''}">
          <span>${l + 1}</span><span class="mini-stars" aria-hidden="true">${[1, 2, 3].map(k => `<span class="${k <= st ? 'lit' : ''}">★</span>`).join('')}</span></button>`
      }).join('')
      const need = ctx.chapterNeed(c)
      return `<div class="chapter" id="chapter-${c}">
        <div class="chapter-head"><h3>${esc(t(ch.name))}</h3><span>${esc(t(ch.name + 'sub'))} · <span class="count">${solvedN}/${ch.levels.length}</span></span></div>
        ${unlocked ? `<div class="level-grid">${levels}</div>` : `<p class="locked-note">${esc(t('chapterLocked', { n: need }))}</p>`}
      </div>`
    }).join('')
    // colour solved buttons by their recipe (computed lazily)
  }

  function fillSettings(head, body) {
    head.textContent = t('settings')
    const s = ctx.store.data.settings
    const row = (id, key, checked) => `<div class="setting"><label for="${id}" data-i18n="${key}"></label><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><label for="${id}" class="toggle" aria-hidden="true"></label></div>`
    body.innerHTML = `
      ${row('set-sound', 'sound', s.sound)}
      ${row('set-music', 'music', s.music)}
      ${row('set-symbols', 'symbols', s.symbols)}
      ${row('set-motion', 'motion', s.motion)}
      <div class="setting"><span data-i18n="language"></span>
        <span class="lang-switch" role="group"><button id="lang-id" aria-pressed="${ctx.i18n.lang === 'id'}" data-act="lang" data-lang="id">Indonesia</button><button id="lang-en" aria-pressed="${ctx.i18n.lang === 'en'}" data-act="lang" data-lang="en">English</button></span></div>
      <div class="setting"><span></span><button class="btn-card danger" data-act="reset" id="btn-reset"><span data-i18n="resetProgress"></span></button></div>`
    body.querySelectorAll('input[type=checkbox]').forEach(inp => inp.addEventListener('change', () => {
      const key = { 'set-sound': 'sound', 'set-music': 'music', 'set-symbols': 'symbols', 'set-motion': 'motion' }[inp.id]
      ctx.actions.setSetting(key, inp.checked)
    }))
  }

  function fillHowto(head, body) {
    head.textContent = t('howto')
    body.innerHTML = `<div class="how">
      ${[1, 2, 3, 4].map(k => `<figure><canvas id="how-${k}" width="240" height="160" aria-hidden="true"></canvas><figcaption><b data-i18n="how${k}t"></b><span data-i18n="how${k}"></span></figcaption></figure>`).join('')}
      </div><p class="symbols-key" data-i18n="symbolsKey"></p>${ctx.isTouch() ? '' : '<p class="keys-note" data-i18n="shortcuts"></p>'}`
    requestAnimationFrame(() => {
      const boards = [
        ['e1R s0 e3r'], // turn: the middle tile is the wrong way round
        ['e1R s1 c2', '. . e0r'],
        ['e1R c2 .', '. t0 e3o', 'e1Y c3 .'],
        ['. e2B .', 'e1R b0 e3r', '. e0b .'],
      ]
      boards.forEach((rows, k) => {
        const b = parse(rows)
        const cv = body.querySelector('#how-' + (k + 1))
        if (!cv) return
        const v = drawMiniBoard(cv, b, analyse(b))
        if (k === 0) drawTurnArrow(cv, v, 1, 0)
      })
    })
  }

  function fillDream(head, body) {
    head.textContent = t('dream')
    const today = ctx.todayKey()
    const dailyStars = ctx.store.data.daily[today] || 0
    const streak = ctx.dailyStreak()
    body.innerHTML = `<p data-i18n="dreamSub"></p>
      <div class="dream-sizes">
        <button class="btn-card" data-act="dream-size" data-size="small"><span data-i18n="small"></span><small>${DREAM_SIZES.small.w} × ${DREAM_SIZES.small.h}</small></button>
        <button class="btn-card" data-act="dream-size" data-size="medium"><span data-i18n="medium"></span><small>${DREAM_SIZES.medium.w} × ${DREAM_SIZES.medium.h}</small></button>
        <button class="btn-card" data-act="dream-size" data-size="large"><span data-i18n="large"></span><small>${DREAM_SIZES.large.w} × ${DREAM_SIZES.large.h}</small></button>
      </div>
      <button class="btn-paint" data-act="daily" style="width:100%"><span data-i18n="daily"></span>${dailyStars ? ' · ' + '★'.repeat(dailyStars) : ''}</button>
      ${streak > 0 ? `<p class="streak">${esc(streak === 1 ? t('streak1') : t('streak', { n: streak }))}</p>` : ''}`
  }

  function fillPainting(head, body, opts) {
    head.textContent = t('paintingTitle')
    const portrait = (opts && opts.portrait) ?? (window.innerHeight > window.innerWidth)
    body.innerHTML = `<div class="painting-modes lang-switch" role="group">
        <button data-act="painting-mode" data-mode="desk" aria-pressed="${!portrait}"><span data-i18n="paintingDesk"></span></button>
        <button data-act="painting-mode" data-mode="phone" aria-pressed="${portrait}"><span data-i18n="paintingPhone"></span></button></div>
      <div class="painting-frame"><p class="painting-wait" data-i18n="paintingMaking"></p></div>
      <p class="painting-help" data-i18n="paintingHelp"></p>`
    const frame = body.querySelector('.painting-frame')
    setTimeout(() => {
      const url = ctx.actions.makePainting(portrait)
      if (!url || !frame.isConnected) return
      frame.innerHTML = `<img alt="${esc(t('paintingTitle'))}" src="${url}">`
    }, 40)
  }

  function fillMenu(head, body) {
    head.textContent = t('menu')
    body.innerHTML = `<div class="menu-list">
      <button class="btn-card" data-act="close-panel">${I.play}<span data-i18n="resume"></span></button>
      <button class="btn-card" data-act="restart">${I.restart}<span data-i18n="restart"></span></button>
      <button class="btn-card" data-act="levels">${I.grid}<span data-i18n="levels"></span></button>
      <button class="btn-card" data-act="howto">${I.help}<span data-i18n="howto"></span></button>
      <button class="btn-card" data-act="settings">${I.gear}<span data-i18n="settings"></span></button>
      <button class="btn-card" data-act="home">${I.home}<span data-i18n="home"></span></button>
    </div>`
  }

  // ---------------------------------------------------------------- events
  let resetArmed = false
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act]')
    if (!b || !root.contains(b)) return
    const act = b.dataset.act
    ctx.audio.unlock()
    if (act !== 'close-panel') ctx.audio.tick(0, 1.2)
    const A = ctx.actions
    switch (act) {
      case 'play': A.play(); break
      case 'levels': closeAllPanels(); openPanel('levels', { scrollTo: '.current' }); break
      case 'dream': openPanel('dream'); break
      case 'howto': openPanel('howto'); break
      case 'settings': openPanel('settings'); break
      case 'menu': openPanel('menu'); break
      case 'close-panel': closePanel(); break
      case 'level': closeAllPanels(); A.startLevel(+b.dataset.c, +b.dataset.l); break
      case 'undo': A.undo(); break
      case 'restart': closeAllPanels(); A.restart(); break
      case 'hint': A.hint(); break
      case 'next': A.next(); break
      case 'replay': A.restart(); break
      case 'painting': openPanel('painting'); break
      case 'painting-mode': {
        const top = panelStack[panelStack.length - 1]
        if (top && top.kind === 'painting') { closePanel(); openPanel('painting', { portrait: b.dataset.mode === 'phone' }) }
        break
      }
      case 'home': closeAllPanels(); A.home(); break
      case 'dream-size': closeAllPanels(); A.startDream(b.dataset.size); break
      case 'daily': closeAllPanels(); A.startDaily(); break
      case 'lang': A.setLang(b.dataset.lang); break
      case 'reset':
        if (!resetArmed) { resetArmed = true; b.querySelector('span').textContent = t('confirmReset'); setTimeout(() => { resetArmed = false; if (b.isConnected) b.querySelector('span').textContent = t('resetProgress') }, 3500) }
        else { resetArmed = false; A.resetProgress(); b.querySelector('span').textContent = t('progressErased') }
        break
    }
  })
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panelStack.length) { e.preventDefault(); closePanel() }
  })

  // ---------------------------------------------------------------- api
  function show(name) {
    current = name
    root.parentElement.classList.toggle('completing', name === 'complete')
    title.hidden = name !== 'title'
    hud.hidden = name !== 'game' && name !== 'complete'
    complete.hidden = name !== 'complete'
    if (name === 'complete') hud.querySelector('.hud-bottom').style.visibility = 'hidden'
    else hud.querySelector('.hud-bottom').style.visibility = ''
  }

  function applyText() {
    const a = document.activeElement
    const sig = a && a.dataset ? { id: a.id, act: a.dataset.act, lang: a.dataset.lang, size: a.dataset.size } : null
    ctx.i18n.apply(root)
    panelStack.forEach(p => { const b = p.wrap.querySelector('.body'); const scroll = b.scrollTop; p.fill(); b.scrollTop = scroll })
    if (sig && (!a.isConnected)) {
      const top = panelStack.length ? panelStack[panelStack.length - 1].wrap : root
      const match = (sig.id && top.querySelector('#' + sig.id)) ||
        [...top.querySelectorAll('[data-act]')].find(el => el.dataset.act === sig.act && el.dataset.lang === sig.lang && el.dataset.size === sig.size)
      if (match) match.focus({ preventScroll: true })
    }
  }

  return {
    show,
    setBloomed(on) { hud.classList.toggle('bloomed', !!on) },
    get current() { return current },
    get panelOpen() { return panelStack.length > 0 },
    openPanel, closePanel, closeAllPanels,
    applyText,
    setPlayLabel(text) { $('#btn-play').innerHTML = `${esc(text)}` },
    setLoading(on) { $('#loading-note').style.visibility = on ? 'visible' : 'hidden' },
    titleBox() {
      const top = title.querySelector('.title-top').getBoundingClientRect()
      const bot = title.querySelector('.title-actions').getBoundingClientRect()
      const host = root.getBoundingClientRect()
      return { top: top.bottom - host.top, bottom: bot.top - host.top + (title.querySelector('#loading-note').getBoundingClientRect().height || 0) }
    },
    // Space the board must leave free, in px from each edge of the stage.
    hudInsets() {
      const app = root.parentElement
      const host = root.getBoundingClientRect()
      const R = el => el.getBoundingClientRect()
      const shown = el => !!el && !el.hidden && el.offsetParent !== null
      const coach = $('#coach')
      let top, bottom, left = 16, right = 16
      if (app.classList.contains('landscape')) {
        const nameBox = R(hud.querySelector('.hud-left')), undoBox = R(hud.querySelector('.hud-bottom .group.left'))
        coach.style.top = (nameBox.bottom - host.top + 8) + 'px'
        coach.style.bottom = 'auto'
        coach.style.maxHeight = Math.max(40, undoBox.top - nameBox.bottom - 16) + 'px'
        coach.style.overflow = 'hidden'
        const lefts = [hud.querySelector('.hud-left'), hud.querySelector('.hud-bottom .group.left')]
        if (shown(coach)) lefts.push(coach)
        const rights = [hud.querySelector('.hud-right'), hud.querySelector('.hud-bottom .group.right')]
        left = Math.max(16, ...lefts.map(e => R(e).right - host.left)) + 10
        right = Math.max(16, ...rights.map(e => host.right - R(e).left)) + 10
        top = 10; bottom = 10
      } else {
        coach.style.top = ''; coach.style.bottom = ''; coach.style.maxHeight = ''; coach.style.overflow = ''
        top = R(hud.querySelector('.hud-top')).bottom - host.top + 8
        bottom = host.bottom - R(hud.querySelector('.hud-bottom')).top + 8
        if (shown(coach)) bottom = Math.max(bottom, host.bottom - R(coach).top + 8)
      }
      let centerFree = false
      if (!complete.hidden) {
        centerFree = true
        const c = R(complete.querySelector('.complete-card'))
        if (app.classList.contains('side-card')) right = Math.max(right, host.right - c.left + 14)
        else bottom = Math.max(bottom, host.bottom - c.top + 8)
      }
      return { top, bottom, left, right, centerFree }
    },
    setLevelInfo({ title: tt, sub, moves, par, canUndo, coach, mixes }) {
      $('#lvl-title').textContent = tt
      $('#lvl-sub').textContent = sub
      this.setMoves(moves, par, canUndo)
      const c = $('#coach')
      if (coach) { c.textContent = coach; c.hidden = false } else c.hidden = true
      const lg = $('#legend')
      lg.classList.toggle('has-mix', mixes.length > 0)
      lg.innerHTML = mixes.length ? `<h3 data-i18n="legendTitle">${esc(t('legendTitle'))}</h3>` + mixes.map(() => '<canvas width="120" height="30"></canvas>').join('') : ''
      lg.querySelectorAll('canvas').forEach((cv, k) => drawLegendRow(cv, mixes[k]))
    },
    setMoves(moves, par, canUndo) {
      $('#moves').textContent = moves
      $('#moves-sub').textContent = `${t('moves')} · ${t('par')} ${par}`
      $('#btn-undo').disabled = !canUndo
    },
    hideCoach() { $('#coach').hidden = true },
    toast(text, ms = 2200) {
      const el = $('#toast')
      el.textContent = text; el.hidden = false; el.style.opacity = 1
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => { el.style.opacity = 0; setTimeout(() => { el.hidden = true }, 320) }, ms)
    },
    showComplete(info, { refreshOnly = false } = {}) {
      const { praise, stars, sub, extra, nextLabel, hasNext } = info
      $('#praise').textContent = praise
      $('#stars').innerHTML = [1, 2, 3].map(k => `<span class="${k <= stars ? 'lit' : 'dim'}">${I.star}</span>`).join('')
      $('#stars').setAttribute('role', 'img')
      $('#stars').setAttribute('aria-label', t('starsAria', { n: stars }))
      $('#complete-sub').textContent = sub
      $('#complete-extra').textContent = extra || ''
      const nb = $('#btn-next')
      nb.textContent = nextLabel
      nb.hidden = !hasNext
      if (refreshOnly) return
      show('complete')
      setTimeout(() => (hasNext ? nb : complete.querySelector('.btn-card')).focus({ preventScroll: true }), 60)
    },
    get coachVisible() { return !$('#coach').hidden },
  }
}

function drawLegendRow(cv, mix) {
  const g = cv.getContext('2d')
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  cv.width = 120 * dpr; cv.height = 30 * dpr
  g.scale(dpr, dpr)
  const prims = [1, 2, 4].filter(p => mix & p)
  let x = 10
  prims.forEach((p, k) => {
    g.fillStyle = PAINT_HEX[p]; g.beginPath(); g.arc(x + 4, 15, 9, 0, Math.PI * 2); g.fill()
    drawRecipe(g, p, x + 4, 15, 3.4, 'rgba(255,255,255,0.96)', SYMBOL_OUTLINE)
    x += 24
    if (k < prims.length - 1) { g.fillStyle = '#f7e8d0'; g.font = '16px serif'; g.fillText('+', x - 6, 20); x += 10 }
  })
  g.fillStyle = '#f7e8d0'; g.font = '16px serif'; g.fillText('=', x - 4, 20); x += 16
  g.fillStyle = PAINT_HEX[mix]; g.beginPath(); g.arc(x + 8, 15, 11, 0, Math.PI * 2); g.fill()
  drawRecipe(g, mix, x + 8, 15, 2.8, 'rgba(255,255,255,0.96)', SYMBOL_OUTLINE)
}
