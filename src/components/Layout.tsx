import type { ReactNode } from 'react'

/**
 * Page content wrapper for non-map screens. The persistent chrome (top bar,
 * bottom nav, drawer) lives in <AppShell> and is NOT re-rendered here — this
 * only sizes the scroll area and clears the fixed bars + safe areas.
 */
export default function Layout({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const top = 'calc(var(--app-header-h, 56px))'
  const bottom = 'calc(3.25rem + env(safe-area-inset-bottom) + 1rem)'

  return bare ? (
    <main id="main-content" style={{ paddingTop: top, paddingBottom: bottom }}>
      {children}
    </main>
  ) : (
    <main
      id="main-content"
      className="mx-auto max-w-5xl px-4"
      style={{ paddingTop: `calc(${top} + 1rem)`, paddingBottom: bottom }}
    >
      {children}
    </main>
  )
}
