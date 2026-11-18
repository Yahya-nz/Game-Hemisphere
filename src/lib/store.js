// Optional persistence. Every access is guarded: storage can be missing or throw
// (private windows, blocked site data, previews), and the game must still work.
export function createStore(key, defaults) {
  let data = structuredCloneSafe(defaults)
  try {
    const raw = window.localStorage && window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null
    if (isPlain(parsed)) data = deepMerge(data, parsed)
  } catch { data = structuredCloneSafe(defaults) /* unreadable or unavailable: start fresh */ }
  let timer = null
  const flush = () => {
    timer = null
    try { window.localStorage && window.localStorage.setItem(key, JSON.stringify(data)) } catch { /* ignore */ }
  }
  return {
    get data() { return data },
    save() { if (!timer) timer = setTimeout(flush, 120) },
    flush,
    reset() { data = structuredCloneSafe(defaults); flush() },
  }
}

function structuredCloneSafe(v) { return JSON.parse(JSON.stringify(v)) }
const isPlain = v => !!v && typeof v === 'object' && !Array.isArray(v)
// Saved values only replace defaults of the same shape, so old or damaged saves cannot break boot.
function deepMerge(base, extra) {
  const out = { ...base }
  for (const k of Object.keys(extra)) {
    const b = base[k], e = extra[k]
    if (isPlain(b)) out[k] = isPlain(e) ? (Object.keys(b).length ? deepMerge(b, e) : { ...e }) : b
    else if (b === null || b === undefined) out[k] = e
    else if (typeof e === typeof b && !isPlain(e)) out[k] = e
  }
  return out
}
