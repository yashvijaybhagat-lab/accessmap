import { useEffect, useRef, useState } from 'react'

interface Options {
  /** Called when the user pulls past the threshold and releases. Should return a promise. */
  onRefresh: () => Promise<unknown> | unknown
  /** Pixels the user must drag before a release triggers a refresh. */
  threshold?: number
  /** Disable (e.g. reduced motion, desktop). */
  disabled?: boolean
}

/**
 * Touch pull-to-refresh for a scrollable list. Attach `bind` to the scroll
 * container. Only engages when the container is already scrolled to the top and
 * the gesture is a downward drag, so it never fights normal scrolling.
 *
 *   const { bind, pullDistance, refreshing } = usePullToRefresh({ onRefresh })
 *   <div {...bind} className="overflow-y-auto"> … </div>
 */
export function usePullToRefresh({ onRefresh, threshold = 72, disabled = false }: Options) {
  const ref = useRef<HTMLDivElement | null>(null)
  const startY = useRef<number | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || disabled) return

    const onStart = (e: TouchEvent) => {
      if (refreshing) return
      if (el.scrollTop <= 0) startY.current = e.touches[0].clientY
    }
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || refreshing) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) { setPullDistance(0); return }
      // Resistance curve so the pull feels rubbery.
      setPullDistance(Math.min(dy * 0.5, threshold * 1.5))
      if (el.scrollTop <= 0 && dy > 4) e.preventDefault()
    }
    const onEnd = async () => {
      if (startY.current == null) return
      const past = pullDistance >= threshold
      startY.current = null
      if (past && !refreshing) {
        setRefreshing(true)
        setPullDistance(threshold)
        try { await onRefresh() } finally {
          setRefreshing(false)
          setPullDistance(0)
        }
      } else {
        setPullDistance(0)
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [onRefresh, threshold, disabled, pullDistance, refreshing])

  return { bind: { ref }, pullDistance, refreshing }
}
