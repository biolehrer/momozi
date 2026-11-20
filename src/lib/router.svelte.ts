// Einfacher Hash-Router: jede Ansicht hat eine eigene Adresse (#/decks, #/deck?id=…).
// Dadurch schließt die Zurück-Geste (Android) bzw. der Zurück-Button nur die aktuelle Ansicht.

export const route = $state({ path: '/', query: new URLSearchParams() })

function parse() {
  const hash = location.hash.replace(/^#/, '') || '/'
  const [p, q = ''] = hash.split('?')
  route.path = p || '/'
  route.query = new URLSearchParams(q)
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', parse)
  window.addEventListener('hashchange', parse)
  parse()
}

function depth(): number {
  return (history.state as { depth?: number } | null)?.depth ?? 0
}

export function go(path: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) history.replaceState({ depth: depth() }, '', '#' + path)
  else history.pushState({ depth: depth() + 1 }, '', '#' + path)
  parse()
}

/** Eine Ansicht zurück – oder zur Rückfall-Adresse, wenn die App direkt hier geöffnet wurde */
export function back(fallback = '/') {
  if (depth() > 0) history.back()
  else go(fallback, { replace: true })
}

export const TAB_ROOTS = ['/', '/decks', '/suche', '/einstellungen']

/** Wechsel zwischen Hauptbereichen: Zurück führt immer zur Startseite, nicht durch alle Tabs */
export function goTab(path: string) {
  if (route.path === path) return
  const fromTab = TAB_ROOTS.includes(route.path) && route.path !== '/'
  if (path === '/') {
    if (depth() > 0 && fromTab) history.back()
    else go('/', { replace: true })
  } else go(path, { replace: fromTab })
}
