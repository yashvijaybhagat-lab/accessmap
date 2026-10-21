import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Loader2, AlertTriangle, Navigation, ExternalLink, LocateFixed, X, Accessibility, Flag, ArrowUp,
  CornerUpRight, CornerUpLeft, Clock, Route as RouteIcon, ArrowUpDown, Mountain, Eye, Footprints,
  Zap, CheckCircle2, XCircle, Info, Play, Square, ChevronDown, ChevronUp, Undo2, Volume2,
} from 'lucide-react'
import type { Map as MlMap, Marker } from 'maplibre-gl'
import { searchPlaces, reverseGeocode, type GeoResult } from '../lib/nominatim'
import { googleMapsDir } from '../lib/maps'
import { createMap, fitPoints, moveTo, setGeo, setMapMode, whenReady, webglSupported, maplibregl } from '../lib/map3d'
import {
  PROFILES, planRoute, checkBarriers, walkingDistance, fmtDistance, fmtDuration, nearestOnRoute,
  type ProfileId, type RouteResult, type Barrier, type Severity,
} from '../lib/routing'
import { useA11y, hapticAlert, motionReduced } from '../lib/a11y'
import { speak, stopSpeaking, speechSupported } from '../lib/speech'
import SpeakButton from '../components/SpeakButton'

const PROFILE_ICON: Record<ProfileId, typeof Accessibility> = {
  wheelchair: Accessibility, powerchair: Zap, mobility: Footprints, blind: Eye, walk: Footprints,
}
const ROUTE_COLOR: Record<ProfileId, string> = {
  wheelchair: '#1d4ed8', powerchair: '#6d28d9', mobility: '#0f766e', blind: '#b45309', walk: '#1a73e8',
}
const where = (m: number) => (m < 15 ? 'at the start' : `${fmtDistance(m)} in`)

const SEV: Record<Severity, { icon: typeof Info; cls: string; bg: string; label: string }> = {
  block: { icon: XCircle, cls: 'text-[#b91c1c]', bg: '#b91c1c', label: 'Barrier' },
  warn: { icon: AlertTriangle, cls: 'text-[#a16207]', bg: '#b45309', label: 'Caution' },
  info: { icon: Info, cls: 'text-[#1d4ed8]', bg: '#1d4ed8', label: 'Note' },
  good: { icon: CheckCircle2, cls: 'text-[#15803d]', bg: '#15803d', label: 'Good' },
}

const MANEUVER_ICON = (type: number) =>
  type === 4 || type === 5 || type === 6 ? Flag
  : [9, 10, 11].includes(type) ? CornerUpRight
  : [14, 15, 16].includes(type) ? CornerUpLeft
  : ArrowUp

/* ── Place search box (ARIA combobox) ───────────────────────────── */
function GeoInput({ label, value, color, onPick, onClear }: {
  label: string; value?: GeoResult; color: string
  onPick: (g: GeoResult) => void; onClear: () => void
}) {
  const id = useId()
  const [q, setQ] = useState(value?.shortName ?? '')
  const [results, setResults] = useState<GeoResult[]>([])
  const [active, setActive] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [geoBusy, setGeoBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { setQ(value?.shortName ?? '') }, [value?.shortName])

  useEffect(() => {
    if (q.trim().length < 3 || q === value?.shortName) { setResults([]); return }
    const ac = new AbortController()
    const t = setTimeout(async () => {
      setBusy(true)
      try { setResults(await searchPlaces(q, ac.signal)); setActive(-1) } catch { /* superseded */ } finally { setBusy(false) }
    }, 350)
    return () => { clearTimeout(t); ac.abort() }
  }, [q, value?.shortName])

  function pick(r: GeoResult) { onPick(r); setQ(r.shortName); setResults([]) }

  function useMyLocation() {
    setErr('')
    if (!navigator.geolocation || !window.isSecureContext) { setErr('Location needs a secure (https) connection.'); return }
    setGeoBusy(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const g = await reverseGeocode(pos.coords.latitude, pos.coords.longitude)
        g.shortName = 'My location'
        onPick(g); setQ('My location'); setResults([]); setGeoBusy(false)
      },
      () => { setGeoBusy(false); setErr('Location blocked — allow it in your browser, or type an address.') },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white" style={{ background: color }} aria-hidden="true">
          {label === 'From' ? 'A' : 'B'}
        </span>
        <label htmlFor={`${id}-in`} className="visually-hidden">{label === 'From' ? 'Starting point' : 'Destination'}</label>
        <input
          id={`${id}-in`}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          className="min-h-[48px] min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (!results.length) return
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
            else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(results[active]) }
            else if (e.key === 'Escape') setResults([])
          }}
          placeholder={label === 'From' ? 'Starting point' : 'Where to?'}
          autoComplete="off"
        />
        {busy && <Loader2 size={15} className="animate-spin text-primary" aria-label="Searching" />}
        {q && !busy && (
          <button onClick={() => { setQ(''); setResults([]); onClear() }} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink" aria-label={`Clear ${label.toLowerCase()}`}>
            <X size={15} aria-hidden="true" />
          </button>
        )}
        <button onClick={useMyLocation} aria-label={`Use my location as ${label === 'From' ? 'start' : 'destination'}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary/10">
          {geoBusy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <LocateFixed size={16} aria-hidden="true" />}
        </button>
      </div>
      {err && <p className="mt-1 text-xs text-alert" role="alert">{err}</p>}
      {results.length > 0 && (
        <ul id={`${id}-list`} role="listbox" aria-label={`${label} suggestions`} className="absolute z-30 mt-1 w-full overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          {results.map((r, i) => (
            <li
              key={`${r.osmId}-${i}`}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(r) }}
              className={`cursor-pointer border-b border-border/60 px-3.5 py-2.5 last:border-0 ${i === active ? 'bg-primary/10' : 'hover:bg-surface'}`}
            >
              <p className="text-sm font-semibold text-ink">{r.shortName}</p>
              <p className="truncate text-xs text-muted">{r.displayName}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ── Elevation profile (SVG) ────────────────────────────────────── */
function ElevationChart({ route }: { route: RouteResult }) {
  const e = route.elevation
  if (e.length < 3) return null
  const W = 320, H = 70
  const min = Math.min(...e), max = Math.max(...e)
  const span = Math.max(4, max - min)
  const x = (i: number) => (i / (e.length - 1)) * W
  const y = (v: number) => H - 6 - ((v - min) / span) * (H - 14)
  const path = e.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const total = (e.length - 1) * route.elevationIntervalM
  const desc = `Elevation from ${Math.round(e[0])} to ${Math.round(e[e.length - 1])} metres, lowest ${Math.round(min)}, highest ${Math.round(max)}. Total climb ${route.climbM} metres.${route.maxGradePct != null ? ` Steepest section about ${Math.round(route.maxGradePct)} percent.` : ''}`
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[70px] w-full" role="img" aria-label={desc}>
        <defs>
          <linearGradient id="elev" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={ROUTE_COLOR[route.profile]} stopOpacity="0.35" />
            <stop offset="1" stopColor={ROUTE_COLOR[route.profile]} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {route.steepSegs.map((s, i) => (
          <rect key={i} x={(s.fromM / total) * W} width={Math.max(2, ((s.toM - s.fromM) / total) * W)} y={0} height={H} fill="#f59e0b" opacity={0.18} />
        ))}
        <path d={`${path} L${W},${H} L0,${H} Z`} fill="url(#elev)" />
        <path d={path} fill="none" stroke={ROUTE_COLOR[route.profile]} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="flex justify-between text-[11px] text-muted">
        <span>{Math.round(min)} m</span>
        <span>{route.steepSegs.length ? 'Shaded = steeper than recommended' : 'Elevation profile'}</span>
        <span>{Math.round(max)} m</span>
      </figcaption>
    </figure>
  )
}

/* ── Page ───────────────────────────────────────────────────────── */
export default function RoutePlanner() {
  const [params] = useSearchParams()
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const markers = useRef<Marker[]>([])
  const barrierMarkers = useRef<Marker[]>([])
  const fittedRef = useRef<unknown>(null)
  const summaryRef = useRef<HTMLElement>(null)
  const [mapFailed, setMapFailed] = useState(false)
  const flat = useA11y((s) => s.flatMap)

  const [start, setStart] = useState<GeoResult>()
  const [end, setEnd] = useState<GeoResult>()
  const [profile, setProfile] = useState<ProfileId>(() => {
    try { return (localStorage.getItem('am.routeProfile') as ProfileId) || 'wheelchair' } catch { return 'wheelchair' }
  })
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [walkM, setWalkM] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [stepsOpen, setStepsOpen] = useState(true)
  const [announce, setAnnounce] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // Live guidance
  const [guiding, setGuiding] = useState(false)
  const [curStep, setCurStep] = useState(0)
  const [offRoute, setOffRoute] = useState(false)
  const watchRef = useRef<number | null>(null)
  const warnedRef = useRef<Set<string>>(new Set())
  const userMarker = useRef<Marker | null>(null)

  const startRef = useRef<GeoResult>(); startRef.current = start
  const endRef = useRef<GeoResult>(); endRef.current = end

  useEffect(() => { try { localStorage.setItem('am.routeProfile', profile) } catch { /* */ } }, [profile])

  // Destination from ?to=lat,lng&name=… (from a place sheet), start from GPS.
  useEffect(() => {
    const to = params.get('to')
    if (to) {
      const [la, ln] = to.split(',').map(Number)
      if (!isNaN(la) && !isNaN(ln)) {
        const name = params.get('name') || 'Destination'
        setEnd({ lat: la, lng: ln, shortName: name, displayName: name, osmId: 'param' })
      }
    }
    if (navigator.geolocation && window.isSecureContext) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const g = await reverseGeocode(pos.coords.latitude, pos.coords.longitude)
        g.shortName = 'My location'
        setStart((prev) => prev ?? g)
      }, () => {}, { enableHighAccuracy: true, timeout: 8000 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Map setup
  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    if (!webglSupported()) { setMapFailed(true); return }
    let map: MlMap
    try { map = createMap(elRef.current, { center: [39.5, -98.35], zoom: 3.5, label: 'Route map' }) } catch { setMapFailed(true); return }
    mapRef.current = map
    map.on('click', async (e) => {
      const g = await reverseGeocode(e.lngLat.lat, e.lngLat.lng)
      if (!startRef.current) setStart(g)
      else setEnd(g)
    })
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(elRef.current)
    return () => { ro.disconnect(); map.remove(); mapRef.current = null }
  }, [])

  // Skip the first run: createMap already applied the mode, and easing here would cancel the initial fly-to.
  const flatInit = useRef(true)
  useEffect(() => {
    if (flatInit.current) { flatInit.current = false; return }
    if (mapRef.current) setMapMode(mapRef.current, flat)
  }, [flat])

  // A / B markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markers.current.forEach((m) => m.remove()); markers.current = []
    const badge = (txt: string, color: string, label: string) => {
      const el = document.createElement('div')
      el.className = 'route-badge'; el.style.background = color; el.textContent = txt
      el.setAttribute('role', 'img'); el.setAttribute('aria-label', label)
      return el
    }
    if (start) markers.current.push(new maplibregl.Marker({ element: badge('A', '#15803d', `Start: ${start.shortName}`) }).setLngLat([start.lng, start.lat]).addTo(map))
    if (end) markers.current.push(new maplibregl.Marker({ element: badge('B', '#c2410c', `Destination: ${end.shortName}`) }).setLngLat([end.lng, end.lat]).addTo(map))
    if (!route) {
      if (start && end) fitPoints(map, [[start.lat, start.lng], [end.lat, end.lng]], 80)
      else if (start) moveTo(map, start.lat, start.lng, 15)
      else if (end) moveTo(map, end.lat, end.lng, 15)
    }
  }, [start, end, route])

  // Route line + barriers on the map
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    whenReady(map, () => {
      const line: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: route ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.coords.map(([a, b]) => [b, a]) } }] : [],
      }
      setGeo(map, 'am-route', line)
      const steep: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: route ? route.steepSegs.map((s) => {
          const pts = route.coords.filter((_, i) => route.cumM[i] >= s.fromM && route.cumM[i] <= s.toM)
          return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: pts.map(([a, b]) => [b, a]) } }
        }).filter((f) => f.geometry.coordinates.length > 1) : [],
      }
      setGeo(map, 'am-steep', steep)
      if (!map.getLayer('am-route')) {
        map.addLayer({ id: 'am-route-casing', type: 'line', source: 'am-route', paint: { 'line-color': '#ffffff', 'line-width': 11 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
        map.addLayer({ id: 'am-route', type: 'line', source: 'am-route', paint: { 'line-color': ROUTE_COLOR[profile], 'line-width': 6 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
        map.addLayer({ id: 'am-steep', type: 'line', source: 'am-steep', paint: { 'line-color': '#f59e0b', 'line-width': 6, 'line-dasharray': [1, 1] }, layout: { 'line-cap': 'butt' } })
      }
      if (route) map.setPaintProperty('am-route', 'line-color', ROUTE_COLOR[route.profile])

      barrierMarkers.current.forEach((m) => m.remove())
      barrierMarkers.current = (route?.barriers ?? []).filter((b) => b.severity !== 'good').map((b) => {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'barrier-pin'
        el.style.background = SEV[b.severity].bg
        el.setAttribute('aria-label', `${SEV[b.severity].label}: ${b.title}, ${where(b.atM)}`)
        el.innerHTML = `<span aria-hidden="true">${b.severity === 'block' ? '✕' : b.severity === 'warn' ? '!' : 'i'}</span>`
        const popup = new maplibregl.Popup({ offset: 18, className: 'am-popup' }).setHTML(
          `<p class="am-popup-title">${b.title.replace(/</g, '&lt;')}</p><p class="am-popup-sub" style="text-transform:none">${b.detail.replace(/</g, '&lt;')} · ${where(b.atM)}</p>`,
        )
        return new maplibregl.Marker({ element: el }).setLngLat([b.lng, b.lat]).setPopup(popup).addTo(map)
      })
      // Fit once per new route line (the barrier check updates the same route — don't jump the camera again).
      if (route && !guiding && fittedRef.current !== route.coords) {
        fittedRef.current = route.coords
        fitPoints(map, route.coords, window.innerWidth >= 1024
          ? { top: 90, bottom: 90, left: 460, right: 70 }
          : { top: 80, bottom: Math.round(window.innerHeight * 0.6), left: 30, right: 70 })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route])

  async function plan(p: ProfileId = profile) {
    if (!start || !end) return
    abortRef.current?.abort()
    const ac = new AbortController(); abortRef.current = ac
    stopGuidance()
    setBusy(true); setErr(''); setRoute(null); setWalkM(null)
    setAnnounce('Planning route…')
    try {
      const [r, w] = await Promise.all([
        planRoute([start.lat, start.lng], [end.lat, end.lng], p, ac.signal),
        p === 'walk' ? Promise.resolve(null) : walkingDistance([start.lat, start.lng], [end.lat, end.lng], ac.signal),
      ])
      setRoute(r); setWalkM(w); setStepsOpen(true); setBusy(false)
      // Bring the result into view and move focus there so screen-reader users land on it.
      requestAnimationFrame(() => {
        summaryRef.current?.scrollIntoView({ block: 'start', behavior: motionReduced() ? 'auto' : 'smooth' })
        summaryRef.current?.focus({ preventScroll: true })
      })
      setAnnounce(`Route found: ${fmtDistance(r.distanceM)}, about ${fmtDuration(r.durationS)}. Checking kerbs and crossings along it.`)
      // Second pass runs while the route is already on screen.
      const checked = await checkBarriers(r, ac.signal)
      if (ac.signal.aborted) return
      setRoute(checked)
      const blocks = checked.barriers.filter((b) => b.severity === 'block').length
      setAnnounce(`Route check finished. ${checked.verdict}.`)
      if (blocks) hapticAlert()
    } catch (e: any) {
      if (e?.name === 'AbortError' || ac.signal.aborted) return
      setErr(e?.message && !/HTTP|fetch/i.test(e.message) ? e.message : 'Could not plan a route right now. Check your connection and try again.')
      setAnnounce('Route planning failed.')
    } finally { if (!ac.signal.aborted) setBusy(false) }
  }

  // Re-plan automatically when the profile changes and a route is showing.
  function chooseProfile(p: ProfileId) {
    setProfile(p)
    if (route && start && end) plan(p)
  }

  function reset() {
    abortRef.current?.abort()
    stopGuidance()
    setStart(undefined); setEnd(undefined); setRoute(null); setErr(''); setWalkM(null)
  }

  function swap() { const s = start; setStart(end); setEnd(s); setRoute(null) }

  /* ── Live guidance ── */
  function announceStep(i: number, r: RouteResult) {
    const s = r.steps[i]
    if (!s) return
    const text = s.verbal
    setAnnounce(text)
    if (speechSupported) speak(text)
    hapticAlert(200)
  }

  function startGuidance() {
    if (!route || !navigator.geolocation) return
    setGuiding(true); setCurStep(0); setOffRoute(false); warnedRef.current = new Set()
    announceStep(0, route)
    const r = route
    let last = 0
    watchRef.current = navigator.geolocation.watchPosition((pos) => {
      const p: [number, number] = [pos.coords.latitude, pos.coords.longitude]
      const map = mapRef.current
      if (map) {
        if (!userMarker.current) {
          const el = document.createElement('div')
          el.className = 'user-dot'
          el.innerHTML = '<span class="user-dot-pulse"></span><span class="user-dot-core"></span>'
          el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Your position')
          userMarker.current = new maplibregl.Marker({ element: el }).setLngLat([p[1], p[0]]).addTo(map)
        } else userMarker.current.setLngLat([p[1], p[0]])
        moveTo(map, p[0], p[1], 18)
      }
      const near = nearestOnRoute(p, r.coords, r.cumM)
      const off = near.d > Math.max(35, pos.coords.accuracy * 1.5)
      setOffRoute(off)
      if (off) return
      let idx = 0
      for (let i = 0; i < r.steps.length; i++) if (r.steps[i].startM <= near.atM + 8) idx = i
      if (idx !== last) { last = idx; setCurStep(idx); announceStep(idx, r) }
      // Warn ~40 m before a barrier, once each.
      for (const b of r.barriers) {
        if (b.severity === 'good' || warnedRef.current.has(b.id)) continue
        const ahead = b.atM - near.atM
        if (ahead > 0 && ahead < 40) {
          warnedRef.current.add(b.id)
          const msg = `${SEV[b.severity].label}: ${b.title} in about ${Math.round(ahead / 5) * 5} metres.`
          setAnnounce(msg); if (speechSupported) speak(msg); hapticAlert()
        }
      }
    }, () => { setAnnounce('Location unavailable — guidance paused.') }, { enableHighAccuracy: true, maximumAge: 2000 })
  }

  function stopGuidance() {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current)
    watchRef.current = null
    userMarker.current?.remove(); userMarker.current = null
    setGuiding(false); setOffRoute(false)
    stopSpeaking()
  }
  useEffect(() => () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current) }, [])

  const issues = useMemo(() => route?.barriers.filter((b) => b.severity !== 'good') ?? [], [route])
  const goods = useMemo(() => route?.barriers.filter((b) => b.severity === 'good').length ?? 0, [route])
  const detour = route && walkM != null ? route.distanceM - walkM : null
  const speechText = route
    ? `${fmtDistance(route.distanceM)}, about ${fmtDuration(route.durationS)}. ${route.verdict}. ` +
      route.steps.map((s, i) => `Step ${i + 1}: ${s.instruction}${s.barriers.filter((b) => b.severity !== 'good').map((b) => ` ${SEV[b.severity].label}: ${b.title}.`).join('')}`).join(' ')
    : ''

  const focusBarrier = (b: Barrier) => { if (mapRef.current) moveTo(mapRef.current, b.lat, b.lng, 18) }

  return (
    <div className="fixed inset-0 bg-[#eef1f6]">
      <p className="visually-hidden" role="status" aria-live="assertive">{announce}</p>

      {/* Map */}
      <div className="absolute inset-0">
        <div ref={elRef} style={{ position: 'absolute', inset: 0 }} className="cursor-crosshair" />
        {mapFailed && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
            The map can't load on this device (WebGL is off), but routes and directions below still work.
          </div>
        )}
      </div>

      {/* Panel */}
      <main
        id="main-content"
        aria-label="Accessible route planner"
        className={`glass absolute inset-x-2 z-[800] flex flex-col overflow-hidden rounded-3xl lg:inset-x-auto lg:left-4 lg:w-[26rem] ${
          route ? 'top-[42vh] lg:top-[calc(var(--app-header-h,56px)+0.5rem)]' : 'top-[calc(var(--app-header-h,56px)+0.5rem)]'
        }`}
        style={{
          bottom: route || busy ? 'calc(3.25rem + env(safe-area-inset-bottom) + 0.75rem)' : 'auto',
          maxHeight: 'calc(100% - var(--app-header-h, 56px) - 3.25rem - env(safe-area-inset-bottom) - 1.25rem)',
        }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-extrabold text-ink">Accessible routes</h1>
            {(start || end) && (
              <button onClick={reset} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-muted hover:bg-surface hover:text-ink">
                <Undo2 size={14} aria-hidden="true" /> Reset
              </button>
            )}
          </div>

          <div className="relative mt-3 space-y-2">
            <GeoInput label="From" value={start} color="#15803d" onPick={(g) => { setStart(g); setRoute(null) }} onClear={() => setStart(undefined)} />
            <GeoInput label="To" value={end} color="#c2410c" onPick={(g) => { setEnd(g); setRoute(null) }} onClear={() => setEnd(undefined)} />
            <button
              onClick={swap}
              disabled={!start && !end}
              aria-label="Swap start and destination"
              className="absolute -right-1 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted shadow-sm hover:text-ink disabled:opacity-40"
            >
              <ArrowUpDown size={15} aria-hidden="true" />
            </button>
          </div>

          <fieldset className="mt-4">
            <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">I'm travelling…</legend>
            <div role="radiogroup" className="grid grid-cols-1 gap-1.5">
              {PROFILES.map((p) => {
                const Icon = PROFILE_ICON[p.id]
                const on = profile === p.id
                return (
                  <button
                    key={p.id}
                    role="radio"
                    aria-checked={on}
                    onClick={() => chooseProfile(p.id)}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${on ? 'border-transparent text-white' : 'border-border bg-card hover:bg-surface'}`}
                    style={on ? { background: ROUTE_COLOR[p.id] } : undefined}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-white/20' : 'bg-surface text-muted'}`}>
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{p.label}</span>
                      <span className={`block text-xs ${on ? 'text-white/85' : 'text-muted'}`}>{p.desc}</span>
                    </span>
                    {on && <CheckCircle2 size={18} aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="mt-4 flex gap-2">
            <button onClick={() => plan()} disabled={!start || !end || busy} className="btn-primary min-h-[48px] flex-1 disabled:opacity-40">
              {busy ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Navigation size={16} aria-hidden="true" />}
              {busy ? 'Checking the route…' : 'Find accessible route'}
            </button>
          </div>
          {!start || !end ? (
            <p className="mt-2 text-center text-xs text-muted">Search above, or tap the map to set A then B.</p>
          ) : null}

          {err && (
            <div role="alert" className="mt-3 flex items-start gap-2 rounded-2xl border border-alert/30 bg-alert/5 px-3 py-2.5 text-sm text-alert">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{err}</span>
            </div>
          )}

          {busy && (
            <div className="mt-4 space-y-2" aria-hidden="true">
              {['Finding a path that fits your needs', 'Measuring slopes along the way'].map((t, i) => (
                <p key={t} className="flex items-center gap-2 text-sm text-muted" style={{ animation: 'pageIn 300ms ease-out both', animationDelay: `${i * 600}ms` }}>
                  <Loader2 size={14} className="animate-spin text-primary" /> {t}…
                </p>
              ))}
            </div>
          )}

          {route && (
            <section ref={summaryRef} tabIndex={-1} aria-label="Route summary" className="mt-4 outline-none">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl text-white"
                    style={{ background: route.score >= 80 ? '#15803d' : route.score >= 50 ? '#a16207' : '#b91c1c' }}
                  >
                    <span className="text-lg font-extrabold leading-none">{route.score}</span>
                    <span className="text-[9px] font-bold uppercase">access</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-snug text-ink">{route.verdict}</p>
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted">
                      <span className="inline-flex items-center gap-1"><RouteIcon size={13} aria-hidden="true" /> {fmtDistance(route.distanceM)}</span>
                      <span className="inline-flex items-center gap-1"><Clock size={13} aria-hidden="true" /> {fmtDuration(route.durationS)}</span>
                      {route.elevation.length > 2 && <span className="inline-flex items-center gap-1"><Mountain size={13} aria-hidden="true" /> {route.climbM} m climb</span>}
                    </p>
                  </div>
                </div>
                {route.barrierScan === 'pending' && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Checking kerbs, crossings and surfaces along the route…
                  </p>
                )}
                {detour != null && detour > 40 && (
                  <p className="mt-2 text-xs text-muted">Adds {fmtDistance(detour)} compared with the shortest walking route, to avoid barriers.</p>
                )}
                {goods > 0 && <p className="mt-1 text-xs text-[#15803d]">✓ {goods} lowered kerb{goods > 1 ? 's' : ''} or accessible crossing{goods > 1 ? 's' : ''} confirmed on the way.</p>}
                <ElevationChart route={route} />

                {route.notes.map((n) => (
                  <p key={n} className="mt-2 flex items-start gap-1.5 rounded-xl bg-[#fff7ed] px-2.5 py-2 text-xs text-[#7c2d12]">
                    <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" /> {n}
                  </p>
                ))}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {guiding ? (
                    <button onClick={stopGuidance} className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-[#b91c1c] px-3 text-sm font-bold text-white">
                      <Square size={14} aria-hidden="true" /> Stop guidance
                    </button>
                  ) : (
                    <button onClick={startGuidance} className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-3 text-sm font-bold text-white" style={{ background: ROUTE_COLOR[route.profile] }}>
                      <Play size={14} aria-hidden="true" /> Start guidance
                    </button>
                  )}
                  <a
                    href={googleMapsDir([start!.lat, start!.lng], [end!.lat, end!.lng])}
                    target="_blank" rel="noreferrer"
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-bold text-ink"
                  >
                    <ExternalLink size={14} aria-hidden="true" /> Google Maps<span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                </div>
                {guiding && (
                  <div className={`mt-3 rounded-2xl px-3 py-2.5 text-sm font-semibold ${offRoute ? 'bg-[#fef2f2] text-[#991b1b]' : 'bg-primary/10 text-ink'}`} aria-live="polite">
                    {offRoute
                      ? <span className="flex items-center justify-between gap-2">You're off the route. <button onClick={() => plan()} className="underline">Re-plan from here</button></span>
                      : <span className="flex items-center gap-2"><Volume2 size={15} aria-hidden="true" /> {route.steps[curStep]?.instruction}</span>}
                  </div>
                )}
              </div>

              {issues.length > 0 && (
                <div className="mt-3 rounded-2xl border border-border bg-card p-4">
                  <h2 className="text-sm font-bold text-ink">On this route ({issues.length})</h2>
                  <ul className="mt-2 space-y-1">
                    {issues.map((b) => {
                      const S = SEV[b.severity]
                      return (
                        <li key={b.id}>
                          <button onClick={() => focusBarrier(b)} className="flex w-full items-start gap-2 rounded-xl px-1.5 py-1.5 text-left hover:bg-surface">
                            <S.icon size={16} className={`mt-0.5 shrink-0 ${S.cls}`} aria-hidden="true" />
                            <span className="min-w-0 flex-1 text-sm">
                              <span className="visually-hidden">{S.label}: </span>
                              <span className="font-semibold text-ink">{b.title}</span>
                              <span className="block text-xs text-muted">{b.detail} · {where(b.atM)}</span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
                <div className="flex items-center justify-between gap-2 px-4 py-2">
                  <button onClick={() => setStepsOpen((v) => !v)} aria-expanded={stepsOpen} className="flex min-h-[44px] flex-1 items-center gap-2 text-left text-sm font-bold text-ink">
                    Directions <span className="font-normal text-muted">· {route.steps.length} steps</span>
                    {stepsOpen ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
                  </button>
                  <SpeakButton text={speechText} label="Read directions" />
                </div>
                {stepsOpen && (
                  <ol className="divide-y divide-border/60 border-t border-border/60">
                    {route.steps.map((s, i) => {
                      const Icon = MANEUVER_ICON(s.type)
                      const bad = s.barriers.filter((b) => b.severity !== 'good')
                      return (
                        <li key={i} className={`flex gap-3 px-4 py-3 ${guiding && i === curStep ? 'bg-primary/10' : ''}`} aria-current={guiding && i === curStep ? 'step' : undefined}>
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink" aria-hidden="true"><Icon size={15} /></span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold leading-snug text-ink">{s.instruction}</p>
                            {s.distanceM > 0 && <p className="text-xs text-muted">{fmtDistance(s.distanceM)}</p>}
                            {bad.map((b) => {
                              const S = SEV[b.severity]
                              return (
                                <p key={b.id} className={`mt-1 flex items-start gap-1 text-xs font-semibold ${S.cls}`}>
                                  <S.icon size={13} className="mt-px shrink-0" aria-hidden="true" /> {S.label}: {b.title}
                                </p>
                              )
                            })}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                Routing by Valhalla on OpenStreetMap data. Slopes are estimated from terrain data and kerbs/crossings are only as complete as the map — always use your judgement.
              </p>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
