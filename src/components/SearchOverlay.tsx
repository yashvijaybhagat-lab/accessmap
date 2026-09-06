import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Search, Loader2, X, MapPin as MapPinIcon, Clock, ChevronRight } from 'lucide-react'
import { searchPlaces, type GeoResult } from '../lib/nominatim'
import { useStore } from '../store/useStore'
import { useReducedMotion } from '../lib/useAppMotion'

const RECENT_KEY = 'am.recentSearch'
const MAX_RECENT = 6

function loadRecent(): GeoResult[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}
function saveRecent(list: GeoResult[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))) } catch { /* */ }
}

/**
 * Full-screen search view that slides up over the app. Opened by the top-bar
 * pill and the Search tab. Picking a result flies the map to it and closes.
 */
export default function SearchOverlay() {
  const reduced = useReducedMotion()
  const open = useStore((s) => s.searchOpen)
  const setOpen = useStore((s) => s.setSearchOpen)
  const flyTo = useStore((s) => s.flyTo)
  const navigate = useNavigate()

  const [q, setQ] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [searching, setSearching] = useState(false)
  const [recent, setRecent] = useState<GeoResult[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    setRecent(loadRecent())
    setQ(''); setResults([])
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey) }
  }, [open, setOpen])

  useEffect(() => {
    if (q.trim().length < 3) { setResults([]); return }
    const t = setTimeout(async () => {
      abortRef.current?.abort()
      const ac = new AbortController(); abortRef.current = ac
      setSearching(true)
      try { setResults(await searchPlaces(q, ac.signal)) } catch { /* */ }
      finally { setSearching(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [q])

  function pick(r: GeoResult) {
    const next = [r, ...recent.filter((x) => x.osmId !== r.osmId)].slice(0, MAX_RECENT)
    setRecent(next); saveRecent(next)
    flyTo({ lat: r.lat, lng: r.lng, zoom: 15, label: r.shortName })
    setOpen(false)
    navigate('/')
  }

  const list = q.trim().length >= 3 ? results : recent
  const showingRecent = q.trim().length < 3 && recent.length > 0

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-x-0 top-0 z-[903] flex flex-col bg-bg"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            // Stop above the bottom nav so it stays visible and usable.
            bottom: 'calc(3.25rem + env(safe-area-inset-bottom))',
          }}
          initial={{ y: reduced ? 0 : '100%', opacity: reduced ? 0 : 1 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: reduced ? 0 : '100%', opacity: reduced ? 0 : 1 }}
          transition={reduced ? { duration: 0.12 } : { type: 'spring', stiffness: 400, damping: 40 }}
        >
          {/* Search field */}
          <div className="flex items-center gap-2 border-b border-border bg-white px-2 py-2.5">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close search"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-surface px-3">
              <Search size={17} className="shrink-0 text-[#9aa0a6]" aria-hidden="true" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search places, buildings, addresses…"
                aria-label="Search for accessible places"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-ink outline-none placeholder:text-muted"
              />
              {searching && <Loader2 size={16} className="shrink-0 animate-spin text-primary" aria-hidden="true" />}
              {q && !searching && (
                <button onClick={() => { setQ(''); inputRef.current?.focus() }} aria-label="Clear" className="shrink-0 rounded-full p-1 text-muted hover:bg-black/5">
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          {/* Results / recents */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-6">
            {showingRecent && (
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Recent</p>
                <button onClick={() => { setRecent([]); saveRecent([]) }} className="text-xs font-medium text-primary">Clear</button>
              </div>
            )}

            {list.length === 0 && q.trim().length >= 3 && !searching && (
              <p className="px-2 py-10 text-center text-sm text-muted">No matches for "{q}".</p>
            )}
            {list.length === 0 && q.trim().length < 3 && recent.length === 0 && (
              <p className="px-2 py-10 text-center text-sm text-muted">Search any place to see its accessibility.</p>
            )}

            <div className="flex flex-col gap-2">
              {list.map((r, i) => (
                <button
                  key={r.osmId + i}
                  onClick={() => pick(r)}
                  className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.05)] transition-transform active:scale-[0.99]"
                >
                  {showingRecent
                    ? <Clock size={16} className="shrink-0 text-muted" aria-hidden="true" />
                    : <MapPinIcon size={16} className="shrink-0 text-primary" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{r.shortName}</span>
                    <span className="block truncate text-xs text-muted">{r.displayName}</span>
                  </span>
                  <ChevronRight size={15} className="shrink-0 text-muted" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
