import { useEffect, useId, type ReactNode } from 'react'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { X } from 'lucide-react'
import { useFocusTrap } from '../lib/useFocusTrap'
import { useReducedMotion, sheetTransition } from '../lib/useAppMotion'

interface Props {
  open: boolean
  onClose: () => void
  /** Accessible label — rendered as a heading when `showHeader` (default). */
  title?: string
  /** Hide the sticky header row (title + close). */
  showHeader?: boolean
  /** Extra classes for the panel (e.g. max-width on desktop). */
  className?: string
  children: ReactNode
}

/**
 * A sheet that slides up from the bottom of the screen — the native-app
 * replacement for a centered modal dialog. Drag the grab handle down to
 * dismiss. Respects the bottom safe-area inset and reduced-motion.
 */
export default function BottomSheet({ open, onClose, title, showHeader = true, className = '', children }: Props) {
  const reduced = useReducedMotion()
  const trapRef = useFocusTrap<HTMLDivElement>(open)
  const dragControls = useDragControls()
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" aria-hidden="true" />
          <motion.div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : 'Details'}
            onClick={(e) => e.stopPropagation()}
            className={`relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_-8px_40px_rgba(0,0,0,0.25)] sm:max-w-lg sm:rounded-3xl ${className}`}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            initial={{ y: reduced ? 0 : '100%' }}
            animate={{ y: 0 }}
            exit={{ y: reduced ? 0 : '100%' }}
            transition={sheetTransition(reduced)}
            drag={reduced ? false : 'y'}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 550) onClose()
            }}
          >
            {/* Grab handle — the drag affordance */}
            <div
              onPointerDown={(e) => !reduced && dragControls.start(e)}
              className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-2 active:cursor-grabbing"
              aria-hidden="true"
            >
              <span className="h-1.5 w-10 rounded-full bg-[#d1d5db]" />
            </div>

            {showHeader && title && (
              <div className="flex shrink-0 items-center justify-between border-b border-border px-5 pb-3">
                <h2 id={titleId} className="text-lg font-semibold text-ink">{title}</h2>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink"
                >
                  <X size={20} />
                </button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
