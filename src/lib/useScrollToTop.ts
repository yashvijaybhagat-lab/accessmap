import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Routes that own their own viewport (the map) and must NOT be scrolled/reset.
const STICKY = new Set(['/', '/map'])

/**
 * Native-app scroll behaviour: on every client-side navigation, reset the
 * scroll position to the top so the new screen starts at its beginning —
 * except for the full-bleed map routes, which manage their own view.
 * `<Routes>` is not a data router, so React Router's <ScrollRestoration> is
 * unavailable; this is the manual equivalent.
 */
export function useScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    if (STICKY.has(pathname)) return
    const main = document.getElementById('main-content')
    main?.scrollTo({ top: 0, left: 0 })
    window.scrollTo({ top: 0, left: 0 })
  }, [pathname])
}
