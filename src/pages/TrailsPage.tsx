import { useEffect, useRef, useState, useMemo } from 'react'
import { Mountain, Loader2, LocateFixed, X, Filter, Clock, Ruler, ChevronRight, ChevronDown, ChevronUp, Accessibility, Navigation2, AlertTriangle, Bike, List } from 'lucide-react'
import { getNearbyTrails, DIFFICULTY_META, SURFACE_LABEL, type Trail, type TrailDifficulty, type TrailType } from '../lib/trails'
import { haversineKm } from '../lib/overpass'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// ── Difficulty pill ──────────────────────────────────────────────────────────
function DiffBadge({ d }: { d: TrailDifficulty }) {
  const m = DIFFICULTY_META[d]
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}` }}
    >
      {m.label}
    </span>
  )
}

// ── Polyline color ───────────────────────────────────────────────────────────
const TRAIL_COLOR: Record<TrailDifficulty, string> = {
  beginner: '#16a34a',
  easy:     '#22c55e',
  moderate: '#f59e0b',
  hard:     '#ef4444',
  expert:   '#8b5cf6',
}

// ── Map component ────────────────────────────────────────────────────────────
function TrailMap({
  trails, userLoc, selected, onSelect, center,
}: {
  trails: Trail[]
  userLoc: [number, number] | null
  selected: Trail | null
  onSelect: (t: Trail) => void
  center: [number, number] | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<Map<string, L.Polyline>>(new Map())
  const userMarkerRef = useRef<L.CircleMarker | null>(null)

  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const defaultCenter: [number, number] = center ?? [51.5, -0.1]
    const map = L.map(ref.current, {
      center: defaultCenter,
      zoom: center ? 13 : 4,
      zoomControl: false,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Pan to center when it changes
  useEffect(() => {
    if (!mapRef.current || !center) return
    mapRef.current.setView(center, 13, { animate: true })
  }, [center])

  // Draw/redraw trail polylines
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Remove old layers no longer in trails
    const currentIds = new Set(trails.map(t => t.id))
    layersRef.current.forEach((layer, id) => {
      if (!currentIds.has(id)) { layer.remove(); layersRef.current.delete(id) }
    })

    // Add new trails
    for (const trail of trails) {
      if (layersRef.current.has(trail.id)) continue
      const isSelected = selected?.id === trail.id
      const polyline = L.polyline(trail.geometry, {
        color: trail.trailType === 'biking' ? '#f97316' : TRAIL_COLOR[trail.difficulty],
        weight: isSelected ? 6 : 4,
        opacity: isSelected ? 1 : 0.7,
        lineCap: 'round',
        lineJoin: 'round',
      })
      polyline.on('click', () => onSelect(trail))
      polyline.bindTooltip(trail.name, { sticky: true, className: 'am-tooltip' })
      polyline.addTo(map)
      layersRef.current.set(trail.id, polyline)
    }
  }, [trails, selected, onSelect])

  // Highlight selected trail
  useEffect(() => {
    layersRef.current.forEach((layer, id) => {
      const trail = trails.find(t => t.id === id)
      if (!trail) return
      const isSel = selected?.id === id
      layer.setStyle({
        weight: isSel ? 7 : 4,
        opacity: isSel ? 1 : 0.65,
      })
      if (isSel) {
        layer.bringToFront()
        mapRef.current?.fitBounds(layer.getBounds(), { padding: [40, 40] })
      }
    })
  }, [selected, trails])

  // User location dot
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    userMarkerRef.current?.remove()
    if (userLoc) {
      userMarkerRef.current = L.circleMarker(userLoc, {
        radius: 8, fillColor: '#1a73e8', color: '#fff', weight: 2,
        fillOpacity: 1,
      }).addTo(map)
    }
  }, [userLoc])

  return <div ref={ref} className="h-full w-full" />
}

// ── Main page ─────────────────────────────────────────────────────────────────
const ALL_DIFFS: TrailDifficulty[] = ['beginner', 'easy', 'moderate', 'hard', 'expert']

export default function TrailsPage() {
  const [trails, setTrails] = useState<Trail[]>([])
  const [loading, setLoading] = useState(false)
  const [located, setLocated] = useState(false)
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null)
  const [center, setCenter] = useState<[number, number] | null>(null)
  const [selected, setSelected] = useState<Trail | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [diffFilter, setDiffFilter] = useState<Set<TrailDifficulty>>(new Set())
  const [typeFilter, setTypeFilter] = useState<TrailType | 'all'>('all')
  const [wheelchairOnly, setWheelchairOnly] = useState(false)
  const [maxDistKm, setMaxDistKm] = useState<number>(10)
  const [maxLengthKm, setMaxLengthKm] = useState<number>(50)
  const [maxMinutes, setMaxMinutes] = useState<number>(300)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Sidebar sizing: draggable width on desktop, slide-over drawer on mobile.
  const SIDEBAR_MIN = 280
  const SIDEBAR_MAX = 560
  const [sidebarW, setSidebarW] = useState(() => {
    const saved = Number(localStorage.getItem('am-trails-sidebar-w'))
    return saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX ? saved : 340
  })
  const [drawerOpen, setDrawerOpen] = useState(true)
  const draggingRef = useRef(false)

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!draggingRef.current) return
      setSidebarW(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX)))
    }
    function onUp() {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try { localStorage.setItem('am-trails-sidebar-w', String(sidebarW)) } catch { /* ignore */ }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [sidebarW])

  const isMobile = () =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches

  async function loadTrails(loc: [number, number]) {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true); setError(null)
    try {
      const results = await getNearbyTrails(loc, maxDistKm * 1000, ac.signal)
      // Attach distance from user
      const withDist = results.map(t => ({
        ...t,
        distanceKm: haversineKm(loc, t.center),
      })).sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
      setTrails(withDist)
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError('Could not load trails — check your connection.')
    } finally {
      if (!ac.signal.aborted) setLoading(false)
    }
  }

  async function ipCoords(): Promise<[number, number] | null> {
    const to = (ms: number) => new Promise<never>((_, rej) => setTimeout(() => rej(new Error('t')), ms))
    try {
      return await Promise.any([
        (async () => {
          const d: any = await Promise.race([fetch('https://get.geojs.io/v1/ip/geo.json').then(r => r.json()), to(4000)])
          const lat = parseFloat(d.latitude), lng = parseFloat(d.longitude)
          if (isNaN(lat) || isNaN(lng)) throw new Error('no coords')
          return [lat, lng] as [number, number]
        })(),
        (async () => {
          const d: any = await Promise.race([fetch('https://ipwho.is/').then(r => r.json()), to(4000)])
          if (!d.success) throw new Error('no coords')
          return [d.latitude, d.longitude] as [number, number]
        })(),
      ])
    } catch { return null }
  }

  function locate() {
    setLoading(true); setError(null)
    if (!navigator?.geolocation) {
      ipCoords().then(c => {
        if (c) { setCenter(c); loadTrails(c) }
        else { setError('Location unavailable — try searching for a city.'); setLoading(false) }
      })
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setUserLoc(loc); setCenter(loc); setLocated(true)
        loadTrails(loc)
      },
      async () => {
        // GPS denied or failed — fall back to IP geolocation
        const c = await ipCoords()
        if (c) { setCenter(c); loadTrails(c) }
        else { setError('Location unavailable. Allow location access or search for a place.'); setLoading(false) }
      },
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }

  useEffect(() => { locate() }, [])

  const visible = useMemo(() => {
    return trails.filter(t => {
      if (diffFilter.size > 0 && !diffFilter.has(t.difficulty)) return false
      if (typeFilter !== 'all' && t.trailType !== typeFilter) return false
      if (wheelchairOnly && !t.accessibleForWheelchair) return false
      if (maxLengthKm < 50 && t.lengthKm > maxLengthKm) return false
      if (maxMinutes < 300 && t.estimatedMinutes > maxMinutes) return false
      return true
    })
  }, [trails, diffFilter, typeFilter, wheelchairOnly, maxLengthKm, maxMinutes])

  function toggleDiff(d: TrailDifficulty) {
    setDiffFilter(prev => {
      const n = new Set(prev)
      n.has(d) ? n.delete(d) : n.add(d)
      return n
    })
  }

  const stats = useMemo(() => ({
    total: visible.length,
    biking: visible.filter(t => t.trailType === 'biking').length,
    wheelchair: visible.filter(t => t.accessibleForWheelchair).length,
  }), [visible])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <div
        id="main-content"
        className="relative flex flex-1 overflow-hidden"
        style={{ paddingTop: 'var(--app-header-h, 56px)' }}
      >
        {/* ── Sidebar — draggable column on desktop, slide-over drawer on mobile ── */}
        <aside
          className={`absolute bottom-0 left-0 z-[820] flex flex-col overflow-hidden border-r border-border bg-white shadow-2xl transition-transform duration-300 ease-out
            sm:static sm:z-auto sm:shrink-0 sm:translate-x-0 sm:shadow-none sm:transition-none
            ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
          style={{ width: sidebarW, maxWidth: '86vw', top: 'var(--app-header-h, 56px)' }}
        >

          {/* Header */}
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h1 className="flex items-center gap-2 text-[17px] font-bold text-ink">
                  <Mountain size={18} className="text-primary" /> Trails & Paths
                </h1>
                <p className="mt-0.5 text-xs text-muted">
                  {located
                    ? `${visible.length} of ${trails.length} trails near you`
                    : 'Finding your location…'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={locate}
                  disabled={loading}
                  aria-label="Refresh nearby trails"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted hover:bg-surface hover:text-ink disabled:opacity-40"
                >
                  {loading
                    ? <Loader2 size={16} className="animate-spin" />
                    : <LocateFixed size={16} />}
                </button>
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Hide sidebar"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted hover:bg-surface hover:text-ink sm:hidden"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Stats strip */}
            {trails.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { label: 'Showing', value: stats.total },
                  { label: 'Bike trails', value: stats.biking },
                  { label: 'Wheelchair', value: stats.wheelchair },
                ].map(s => (
                  <div key={s.label} className="rounded-xl bg-surface px-2.5 py-2 text-center">
                    <p className="text-[15px] font-bold text-ink">{s.value}</p>
                    <p className="text-[10px] leading-tight text-muted">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Filters — collapsible */}
          <div className="border-b border-border bg-[#fafafa]">
            <button
              onClick={() => setFiltersOpen(o => !o)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left"
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Filter size={11} />
                Filters
                {(diffFilter.size > 0 || typeFilter !== 'all' || wheelchairOnly || maxLengthKm < 50 || maxMinutes < 300) && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                    {[diffFilter.size > 0, typeFilter !== 'all', wheelchairOnly, maxLengthKm < 50, maxMinutes < 300].filter(Boolean).length}
                  </span>
                )}
              </span>
              {filtersOpen ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
            </button>

          <div className={`space-y-3 px-4 pb-3 ${filtersOpen ? '' : 'hidden'}`}>
            {/* Difficulty chips */}
            <div>
              <p className="label mb-1.5 flex items-center gap-1"><Filter size={10} /> Difficulty</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_DIFFS.map(d => {
                  const m = DIFFICULTY_META[d]
                  const active = diffFilter.has(d)
                  return (
                    <button
                      key={d}
                      onClick={() => toggleDiff(d)}
                      style={active ? { background: m.color, borderColor: m.color, color: '#fff' } : { background: m.bg, borderColor: m.border, color: m.color }}
                      className="rounded-full border px-3 py-1 text-[11px] font-semibold transition-all"
                    >
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Trail type */}
            <div>
              <p className="label mb-1.5">Type</p>
              <div className="flex gap-1.5">
                {(['all', 'hiking', 'biking'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-1.5 text-xs font-semibold transition-all ${
                      typeFilter === t
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-white text-muted hover:text-ink'
                    }`}
                  >
                    {t === 'biking' ? <Bike size={12} /> : t === 'hiking' ? <Mountain size={12} /> : null}
                    {t === 'all' ? 'All' : t === 'hiking' ? 'Hiking' : 'Biking'}
                  </button>
                ))}
              </div>
            </div>

            {/* Wheelchair toggle */}
            <button
              onClick={() => setWheelchairOnly(s => !s)}
              className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                wheelchairOnly
                  ? 'border-primary/40 bg-primary/5 text-primary'
                  : 'border-border bg-white text-muted hover:text-ink hover:border-[#d1d5db]'
              }`}
            >
              <Accessibility size={14} />
              Wheelchair accessible only
            </button>

            {/* Max length */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="label flex items-center gap-1"><Ruler size={10} /> Max length</p>
                <span className="text-xs font-semibold text-primary">
                  {maxLengthKm >= 50 ? 'Any' : `${maxLengthKm} km`}
                </span>
              </div>
              <input
                type="range" min={1} max={50} step={1} value={maxLengthKm}
                onChange={e => setMaxLengthKm(+e.target.value)}
                className="w-full accent-primary"
              />
            </div>

            {/* Max time */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="label flex items-center gap-1"><Clock size={10} /> Max time</p>
                <span className="text-xs font-semibold text-primary">
                  {maxMinutes >= 300 ? 'Any'
                    : maxMinutes < 60 ? `${maxMinutes} min`
                    : `${Math.floor(maxMinutes / 60)}h${maxMinutes % 60 ? ` ${maxMinutes % 60}m` : ''}`}
                </span>
              </div>
              <input
                type="range" min={15} max={300} step={15} value={maxMinutes}
                onChange={e => setMaxMinutes(+e.target.value)}
                className="w-full accent-primary"
              />
            </div>

            {/* Radius */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="label">Search radius</p>
                <span className="text-xs font-semibold text-primary">{maxDistKm} km</span>
              </div>
              <input
                type="range" min={2} max={30} step={2} value={maxDistKm}
                onChange={e => setMaxDistKm(+e.target.value)}
                onMouseUp={() => { if (center) loadTrails(center) }}
                onTouchEnd={() => { if (center) loadTrails(center) }}
                className="w-full accent-primary"
              />
            </div>
          </div>
          </div>

          {/* Trail list */}
          <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-[#f3f4f6]">
            {loading && trails.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
                <Loader2 size={28} className="animate-spin text-primary" />
                <p className="text-sm">Searching for trails…</p>
              </div>
            )}
            {!loading && visible.length === 0 && trails.length > 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <Mountain size={32} className="text-[#d1d5db]" />
                <p className="text-sm font-medium">No trails match your filters</p>
                <button onClick={() => { setDiffFilter(new Set()); setTypeFilter('all'); setWheelchairOnly(false); setMaxLengthKm(50); setMaxMinutes(300) }} className="text-xs text-primary hover:underline">
                  Clear filters
                </button>
              </div>
            )}
            {visible.map((trail, i) => (
              <button
                key={trail.id}
                onClick={() => {
                  const next = selected?.id === trail.id ? null : trail
                  setSelected(next)
                  if (next && isMobile()) setDrawerOpen(false)
                }}
                className={`w-full px-4 py-3.5 text-left transition-colors ${
                  selected?.id === trail.id ? 'bg-primary/5 border-l-2 border-primary' : 'hover:bg-[#f9fafb]'
                }`}
                style={{ animation: `pageIn 220ms ease-out ${Math.min(i, 15) * 25}ms both` }}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className="mt-1 h-3 w-3 shrink-0 rounded-full"
                    style={{ background: trail.trailType === 'biking' ? '#f97316' : TRAIL_COLOR[trail.difficulty] }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-ink leading-snug">{trail.name}</p>
                      <ChevronRight size={14} className="mt-0.5 shrink-0 text-muted" />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {trail.trailType === 'biking'
                        ? <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700"><Bike size={9} /> Biking</span>
                        : <DiffBadge d={trail.difficulty} />}
                      {trail.accessibleForWheelchair && (
                        <span className="inline-flex items-center gap-0.5 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                          <Accessibility size={9} /> WC
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted">
                      <span className="flex items-center gap-1"><Ruler size={10} />{trail.lengthKm < 1 ? `${Math.round(trail.lengthKm * 1000)}m` : `${trail.lengthKm.toFixed(1)} km`}</span>
                      <span className="flex items-center gap-1"><Clock size={10} />~{trail.estimatedMinutes < 60 ? `${trail.estimatedMinutes}min` : `${(trail.estimatedMinutes/60).toFixed(1)}h`}</span>
                      {trail.distanceKm != null && (
                        <span className="flex items-center gap-1 font-medium text-[#1a73e8]">
                          <Navigation2 size={10} />{trail.distanceKm < 1 ? `${Math.round(trail.distanceKm*1000)}m away` : `${trail.distanceKm.toFixed(1)}km away`}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted capitalize">{SURFACE_LABEL[trail.surface]} surface{trail.inclineMax ? ` · max ${trail.inclineMax.toFixed(0)}% grade` : ''}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Drag-to-resize handle (desktop) */}
          <div
            onPointerDown={(e) => {
              draggingRef.current = true
              document.body.style.cursor = 'col-resize'
              document.body.style.userSelect = 'none'
              e.preventDefault()
            }}
            onDoubleClick={() => setSidebarW(340)}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar (double-click to reset)"
            className="absolute inset-y-0 right-0 hidden w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-primary/25 sm:block"
          />
        </aside>

        {/* Reopen the drawer (mobile, when hidden) */}
        {!drawerOpen && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="absolute left-3 z-[810] flex items-center gap-1.5 rounded-full border border-border bg-white px-3.5 py-2 text-sm font-semibold text-ink shadow-lg sm:hidden"
            style={{ top: 'calc(var(--app-header-h, 56px) + 0.5rem)' }}
          >
            <List size={15} /> Trails
          </button>
        )}

        {/* ── Map ──────────────────────────────────────────────────── */}
        <div className="relative flex-1">
          <TrailMap
            trails={visible}
            userLoc={userLoc}
            selected={selected}
            onSelect={t => setSelected(prev => prev?.id === t.id ? null : t)}
            center={center}
          />

          {/* Selected trail detail panel */}
          {selected && (
            <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-[700]">
              <div className="card p-4 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold text-ink">{selected.name}</h2>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <DiffBadge d={selected.difficulty} />
                      {selected.accessibleForWheelchair && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                          <Accessibility size={10} /> Wheelchair accessible
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="shrink-0 rounded-full p-1.5 text-muted hover:bg-surface"
                    aria-label="Close trail detail"
                  >
                    <X size={16} />
                  </button>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-muted">
                  {DIFFICULTY_META[selected.difficulty].description}
                </p>

                {selected.description && (
                  <p className="mt-2 text-xs text-muted italic">"{selected.description}"</p>
                )}

                {/* Stats grid */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { label: 'Distance', value: selected.lengthKm < 1 ? `${Math.round(selected.lengthKm*1000)} m` : `${selected.lengthKm.toFixed(2)} km` },
                    { label: 'Est. time', value: selected.estimatedMinutes < 60 ? `${selected.estimatedMinutes} min` : `${(selected.estimatedMinutes/60).toFixed(1)} h` },
                    { label: 'Surface', value: SURFACE_LABEL[selected.surface] },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl bg-surface px-2 py-2 text-center">
                      <p className="text-xs font-bold text-ink">{s.value}</p>
                      <p className="text-[10px] text-muted">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Extra tags */}
                {(selected.from || selected.to || selected.operator || selected.sacScale) && (
                  <div className="mt-3 space-y-1 text-[11px] text-muted">
                    {selected.from && selected.to && <p>Route: {selected.from} → {selected.to}</p>}
                    {selected.sacScale && <p>SAC scale: <span className="capitalize font-medium text-ink">{selected.sacScale.replace(/_/g,' ')}</span></p>}
                    {selected.trailVisibility && <p>Trail visibility: <span className="capitalize font-medium text-ink">{selected.trailVisibility}</span></p>}
                    {selected.inclineMax != null && <p>Max gradient: <span className="font-medium text-ink">{selected.inclineMax.toFixed(0)}%</span></p>}
                    {selected.operator && <p>Maintained by: <span className="font-medium text-ink">{selected.operator}</span></p>}
                  </div>
                )}

                {/* Action buttons */}
                <div className="mt-3 flex gap-2">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selected.center[0]},${selected.center[1]}&travelmode=walking`}
                    target="_blank" rel="noreferrer"
                    className="btn-primary flex-1 text-xs py-2"
                  >
                    Directions
                  </a>
                  <a
                    href={`https://www.openstreetmap.org/${selected.osmId}`}
                    target="_blank" rel="noreferrer"
                    className="btn-ghost text-xs py-2 px-3"
                  >
                    OSM ↗
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Legend */}
          {!selected && (
            <div className="absolute bottom-4 right-4 z-[700] flex flex-col gap-1.5 rounded-2xl bg-white/95 px-4 py-3 shadow-md border border-border">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-0.5">Difficulty</p>
              {ALL_DIFFS.map(d => (
                <div key={d} className="flex items-center gap-2">
                  <span className="h-2.5 w-5 rounded-full" style={{ background: TRAIL_COLOR[d] }} />
                  <span className="text-[11px] text-ink">{DIFFICULTY_META[d].label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
