import { useEffect, useState } from 'react'

/**
 * Returns true when animations should be suppressed — either the OS
 * "reduce motion" setting is on, or the in-app Accessibility mode
 * (`html.a11y-mode`) is active. Used to gate every `motion` transition so
 * sheets / drawers / page slides appear instantly instead of moving.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const a11y = document.documentElement.classList.contains('a11y-mode')
    return mq || a11y
  })

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const recompute = () =>
      setReduced(mq.matches || document.documentElement.classList.contains('a11y-mode'))
    recompute()
    mq.addEventListener('change', recompute)
    // a11y-mode toggles a class on <html> — observe it
    const obs = new MutationObserver(recompute)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      mq.removeEventListener('change', recompute)
      obs.disconnect()
    }
  }, [])

  return reduced
}

/** Spring config for bottom sheets / drawers, collapsed to an instant snap when motion is reduced. */
export function sheetTransition(reduced: boolean) {
  return reduced
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 380, damping: 38, mass: 0.9 }
}
