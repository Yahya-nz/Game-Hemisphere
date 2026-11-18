// Two-language strings (Bahasa Indonesia + English). t('key', {n: 3}) fills {n}.
export function detectLang() {
  try {
    const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'])
    if (langs.some(l => /^(id|ms|jv|su)\b/i.test(l))) return 'id'
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '')
    if (/^Asia\/(Jakarta|Pontianak|Makassar|Jayapura)$/.test(tz)) return 'id'
    return 'en'
  } catch { return 'en' }
}

export function createI18n(dict, lang = detectLang()) {
  let cur = dict[lang] ? lang : 'en'
  const listeners = new Set()
  const t = (key, vars) => {
    let s = (dict[cur] && dict[cur][key]) ?? (dict.en && dict.en[key]) ?? key
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m))
    return s
  }
  return {
    t,
    get lang() { return cur },
    setLang(l) { if (dict[l] && l !== cur) { cur = l; listeners.forEach(f => f(cur)) } },
    onChange(f) { listeners.add(f); return () => listeners.delete(f) },
    // fills every [data-i18n] element under root (text) and [data-i18n-aria] (aria-label)
    apply(root = document) {
      root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n) })
      root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)) })
      root.querySelectorAll('[data-i18n-title]').forEach(el => { el.setAttribute('title', t(el.dataset.i18nTitle)) })
    },
  }
}
