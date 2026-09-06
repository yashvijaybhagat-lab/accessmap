import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, Loader2, X, LocateFixed, Accessibility, ExternalLink,
  MapPin as MapPinIcon, AlertTriangle, Route as RouteIcon, Mountain, Toilet,
  Navigation2, ChevronRight, ChevronDown, Car, ArrowUpDown, Zap, Clock, Info, CheckCircle2,
  Eye, Ear, Brain, TrainFront, Footprints,
} from 'lucide-react'
import Navbar from '../components/Navbar'
import BrandPin from '../components/MapPin'
import MapView from '../components/MapView'
import { scoreColor } from '../components/ScoreRing'
import { getPlaces, getAlerts } from '../lib/data'
import { searchPlaces, type GeoResult } from '../lib/nominatim'
import { CATEGORIES, categoryColor, nearbyByCategory, haversineKm, type Poi, type CategoryKey } from '../lib/overpass'
import { getNearbyTransit, getNearbyWalkingPaths, type TransitLine, type TransitStation, type WalkingPath } from '../lib/transit'
import { batchWikiImages } from '../lib/wikipedia'
import { googleMapsTo } from '../lib/maps'
import { useFocusTrap } from '../lib/useFocusTrap'
import { scorePlace, hasProfile } from '../lib/compatibility'
import { useStore } from '../store/useStore'
import type { Place, Alert, Dimension } from '../types'

// Disability-type map filters — each predicate decides whether a POI / place is a match
const DIS_FILTERS: {
  key: Dimension
  label: string
  icon: typeof Eye
  poi: (p: Poi) => boolean
}[] = [
  {
    key: 'mobility', label: 'Wheelchair', icon: Accessibility,
    poi: (p) => p.wheelchair === 'yes' || (p.accessScore != null && p.accessScore >= 6) || !!p.hasRamp || !!p.hasLift,
  },
  {
    key: 'vision', label: 'Vision', icon: Eye,
    poi: (p) => !!p.tactile || !!p.brailleMenu || !!p.visualImpaired,
  },
  {
    key: 'hearing', label: 'Hearing', icon: Ear,
    poi: (p) => p.hearingLoop === true,
  },
  {
    key: 'sensory', label: 'Sensory', icon: Brain,
    poi: (p) => p.quietRoom === true,
  },
]

export default function MapPage() {
  const [places, setPlaces] = useState<Place[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null)
  // centerRef tracks map pan position without triggering re-renders
  // center state is only updated when we actually need to run a search
  const centerRef = useRef<[number, number] | null>(null)
  const [center, setCenter] = useState<[number, number] | null>(null)
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number } | null>(null)
  const [locating, setLocating] = useState(false)

  const [q, setQ] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [searching, setSearching] = useState(false)

  const [activeCat, setActiveCat] = useState<CategoryKey | null>(null)
  const [pois, setPois] = useState<Poi[]>([])
  const [loadingPois, setLoadingPois] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [showA11y, setShowA11y] = useState(true)
  const [forMeOnly, setForMeOnly] = useState(false)
  const [dis, setDis] = useState<Set<Dimension>>(new Set())
  function toggleDis(d: Dimension) {
    setDis((prev) => {
      const n = new Set(prev)
      n.has(d) ? n.delete(d) : n.add(d)
      return n
    })
  }
  // Transit / walking overlays
  const [showTransit, setShowTransit] = useState(false)
  const [showWalking, setShowWalking] = useState(false)
  const [transitLines, setTransitLines] = useState<TransitLine[]>([])
  const [transitStations, setTransitStations] = useState<TransitStation[]>([])
  const [walkingPaths, setWalkingPaths] = useState<WalkingPath[]>([])
  const [loadingTransit, setLoadingTransit] = useState(false)
  const [loadingWalking, setLoadingWalking] = useState(false)
  const transitAbort = useRef<AbortController | null>(null)
  const walkAbort = useRef<AbortController | null>(null)

  // null = no message; string = show toast
  const [locToast, setLocToast] = useState<{ msg: string; type: 'info' | 'error' } | null>(null)
  const needsProfile = useStore((s) => s.needsProfile)
  const profileActive = hasProfile(needsProfile)
  const [expandedBreakdowns, setExpandedBreakdowns] = useState<Set<string>>(new Set())
  function toggleBreakdown(id: string) {
    setExpandedBreakdowns(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const [showIntro, setShowIntro] = useState(() => {
    try { return sessionStorage.getItem('am.introSeen') !== '1' } catch { return true }
  })

  const introTrapRef = useFocusTrap<HTMLDivElement>(showIntro)

  function dismissIntro() {
    setShowIntro(false)
    try { sessionStorage.setItem('am.introSeen', '1') } catch { /* */ }
  }

  useEffect(() => {
    if (!showIntro) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismissIntro()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showIntro])

  const abortRef = useRef<AbortController | null>(null)
  const poiAbort = useRef<AbortController | null>(null)
  const watchRef = useRef<number | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    Promise.all([getPlaces(), getAlerts()]).then(([p, a]) => { setPlaces(p); setAlerts(a) })
    locateSilent()
  }, [])

  useEffect(() => () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current)
  }, [])

  function showToast(msg: string, type: 'info' | 'error' = 'info') {
    setLocToast({ msg, type })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setLocToast(null), 6000)
  }

  // IP geolocation — race 3 verified-working services in parallel
  async function ipCoords(): Promise<[number, number] | null> {
    const to = (ms: number) => new Promise<never>((_, rej) => setTimeout(() => rej(new Error('t')), ms))
    const attempt = async (fn: () => Promise<[number, number] | null>) => {
      const c = await fn(); if (!c) throw new Error('no coords'); return c
    }
    try {
      return await Promise.any([
        // geojs.io — lat/lng as strings
        attempt(async () => {
          const d: any = await Promise.race([fetch('https://get.geojs.io/v1/ip/geo.json').then(r => r.json()), to(4000)])
          const lat = parseFloat(d.latitude), lng = parseFloat(d.longitude)
          return (!isNaN(lat) && !isNaN(lng)) ? [lat, lng] as [number, number] : null
        }),
        // ipwho.is — free, no key, CORS-safe
        attempt(async () => {
          const d: any = await Promise.race([fetch('https://ipwho.is/').then(r => r.json()), to(4000)])
          return (d.success && d.latitude && d.longitude) ? [d.latitude, d.longitude] as [number, number] : null
        }),
        // geolocation-db.com — free, no key
        attempt(async () => {
          const d: any = await Promise.race([fetch('https://geolocation-db.com/json/').then(r => r.json()), to(4000)])
          return (d.latitude && d.longitude && d.latitude !== 'Not found') ? [+d.latitude, +d.longitude] as [number, number] : null
        }),
      ])
    } catch { return null }
  }

  function startWatch() {
    if (watchRef.current != null) return
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => setUserLoc({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 },
    )
  }

  // Silent startup: never show toasts, just do best-effort centering
  async function locateSilent() {
    if (!navigator?.geolocation) {
      const c = await ipCoords()
      if (c) { setCenter(c); setFocus({ lat: c[0], lng: c[1], zoom: 12 }) }
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        setUserLoc({ lat, lng })
        setCenter([lat, lng])
        setFocus({ lat, lng, zoom: 15 })
        startWatch()
      },
      async () => {
        // GPS failed silently — try IP, no error shown
        const c = await ipCoords()
        if (c) { setCenter(c); setFocus({ lat: c[0], lng: c[1], zoom: 12 }) }
        // If both fail, map just stays centered on [0,0] — user can search
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    )
  }

  // User-triggered location (locate button or intro CTA)
  function locateExplicit(onDone?: (c: [number, number]) => void) {
    setLocating(true)
    setLocToast(null)

    if (!navigator?.geolocation) {
      ipCoords().then((c) => {
        setLocating(false)
        if (c) { setCenter(c); setFocus({ lat: c[0], lng: c[1], zoom: 13 }); onDone?.(c) }
        else showToast('Location unavailable — try searching for a place.', 'error')
      })
      return
    }

    let settled = false
    function finish(lat: number, lng: number, precise: boolean, permDenied = false) {
      if (settled) return
      settled = true
      setLocating(false)
      setLocToast(null)
      if (precise) {
        setUserLoc({ lat, lng })
        startWatch()
      }
      setCenter([lat, lng])
      setFocus({ lat, lng, zoom: precise ? 17 : 13 })
      if (!precise && permDenied) {
        showToast(
          'Location permission denied — enable it in your browser settings for GPS.',
          'info',
        )
      }
      onDone?.([lat, lng])
    }

    // Track 1: high-accuracy GPS (may take a few seconds on mobile)
    let gpsWatchId: number | null = null
    gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (gpsWatchId != null) navigator.geolocation.clearWatch(gpsWatchId)
        finish(pos.coords.latitude, pos.coords.longitude, true)
        startWatch()
      },
      async (err) => {
        if (gpsWatchId != null) navigator.geolocation.clearWatch(gpsWatchId)
        if (settled) return
        // GPS failed — try IP as fallback
        const c = await ipCoords()
        if (c) finish(c[0], c[1], false, err.code === 1)
        else {
          setLocating(false)
          // If everything fails, just tell them to search — don't show a dead-end error
          showToast(
            err.code === 1
              ? 'Location blocked — enable it in your browser, or type a place in the search bar.'
              : 'Location unavailable — type a city or place in the search bar to get started.',
            'info',
          )
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    )

    // Track 2: after 4s if GPS hasn't responded, try low-accuracy (wifi/cell)
    // which is instant on desktop — if it beats GPS, use it temporarily
    setTimeout(() => {
      if (settled) return
      navigator.geolocation.getCurrentPosition(
        (pos) => finish(pos.coords.latitude, pos.coords.longitude, true),
        () => { /* let GPS track handle the error */ },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 },
      )
    }, 4000)
  }

  // Search autocomplete
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

  async function searchCategory(cat: CategoryKey, c: [number, number]) {
    setActiveCat(cat); setLoadingPois(true); setPanelOpen(true); setPois([])
    poiAbort.current?.abort()
    const ac = new AbortController(); poiAbort.current = ac
    try {
      let result = await nearbyByCategory(c, cat, 5000, ac.signal)
      if (result.pois.length === 0) result = await nearbyByCategory(c, cat, 15000, ac.signal)
      setPois(result.pois)
      setLoadingPois(false)
      // Patch in Wikipedia images for POIs without an OSM image
      if (result.needsImage.length > 0 && !ac.signal.aborted) {
        batchWikiImages(result.needsImage, 4).then((wikiMap) => {
          if (ac.signal.aborted) return
          setPois(prev => prev.map(poi =>
            !poi.imageUrl && wikiMap.has(poi.name)
              ? { ...poi, imageUrl: wikiMap.get(poi.name) }
              : poi
          ))
        }).catch(() => {/* ignore */})
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') showToast('Search failed — check your connection and try again.', 'error')
      setLoadingPois(false)
    }
  }

  const onCenterChange = useCallback((lat: number, lng: number) => { centerRef.current = [lat, lng] }, [])
  const onMapSelect = useCallback((p: Place) => setFocus({ lat: p.lat, lng: p.lng, zoom: 16 }), [])

  function currentCenter(): [number, number] | null {
    if (userLoc) return [userLoc.lat, userLoc.lng]
    return centerRef.current ?? center
  }

  function runCategory(cat: CategoryKey) {
    if (activeCat === cat) { setActiveCat(null); setPois([]); setPanelOpen(false); return }
    const c = currentCenter()
    if (c) {
      searchCategory(cat, c)
    } else {
      setActiveCat(cat); setPanelOpen(true); setLoadingPois(true)
      locateExplicit((loc) => searchCategory(cat, loc))
    }
  }

  async function toggleTransit() {
    if (showTransit) { setShowTransit(false); setTransitLines([]); setTransitStations([]); return }
    setShowTransit(true)
    const c = currentCenter()
    if (!c) return
    setLoadingTransit(true)
    transitAbort.current?.abort()
    const ac = new AbortController(); transitAbort.current = ac
    try {
      const result = await getNearbyTransit(c, 8000, ac.signal)
      if (!ac.signal.aborted) { setTransitLines(result.lines); setTransitStations(result.stations) }
    } catch { /* */ } finally { if (!ac.signal.aborted) setLoadingTransit(false) }
  }

  async function toggleWalking() {
    if (showWalking) { setShowWalking(false); setWalkingPaths([]); return }
    setShowWalking(true)
    const c = currentCenter()
    if (!c) return
    setLoadingWalking(true)
    walkAbort.current?.abort()
    const ac = new AbortController(); walkAbort.current = ac
    try {
      const paths = await getNearbyWalkingPaths(c, 2000, ac.signal)
      if (!ac.signal.aborted) setWalkingPaths(paths)
    } catch { /* */ } finally { if (!ac.signal.aborted) setLoadingWalking(false) }
  }

  function pickResult(r: GeoResult) {
    setCenter([r.lat, r.lng])
    setFocus({ lat: r.lat, lng: r.lng, zoom: 15 })
    setQ(r.shortName); setResults([])
  }

  const alertIds = useMemo(() => new Set(alerts.map((a) => a.placeId)), [alerts])
  const visiblePlaces = useMemo(() => {
    if (!showA11y) return []
    let list = places
    if (forMeOnly && profileActive) list = list.filter(p => scorePlace(p, needsProfile).score >= 60)
    if (dis.size) list = list.filter(p => [...dis].every(d => p.scores[d] >= 6))
    return list
  }, [showA11y, forMeOnly, places, needsProfile, profileActive, dis])

  const sortedPois = useMemo(() => {
    const dist = (p: Poi) => (center ? haversineKm(center, [p.lat, p.lng]) : 0)
    const active = DIS_FILTERS.filter((f) => dis.has(f.key))
    const filtered = active.length ? pois.filter((p) => active.every((f) => f.poi(p))) : pois
    return [...filtered].sort((a, b) => {
      const sa = a.accessScore ?? -1, sb = b.accessScore ?? -1
      if (sb !== sa) return sb - sa
      return dist(a) - dist(b)
    })
  }, [pois, center, dis])

  const activeCatMeta = CATEGORIES.find((c) => c.key === activeCat)

  return (
    <div className="relative h-screen overflow-hidden bg-[#e8eaed]">
      <Navbar />

      {/* Map fills everything below nav */}
      <div id="main-content" className="absolute inset-0" style={{ paddingTop: 'var(--app-header-h, 64px)' }}>
        <MapView
          places={visiblePlaces}
          pois={sortedPois}
          alertPlaceIds={alertIds}
          userLocation={userLoc}
          focus={focus}
          onCenterChange={onCenterChange}
          onSelect={onMapSelect}
          transitLines={transitLines}
          transitStations={transitStations}
          walkingPaths={walkingPaths}
        />
      </div>

      {/* Transit + Walking overlay toggles — bottom right */}
      <div className="absolute bottom-10 right-3 z-[700] flex flex-col gap-1.5">
        <button
          onClick={toggleTransit}
          aria-pressed={showTransit}
          title="Show train lines & stations"
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold shadow-md transition-all ${
            showTransit
              ? 'bg-[#1a73e8] text-white'
              : 'bg-white text-[#374151] hover:bg-[#f1f3f4]'
          }`}
        >
          {loadingTransit
            ? <Loader2 size={14} className="animate-spin" />
            : <TrainFront size={14} />}
          <span>Trains</span>
        </button>
        <button
          onClick={toggleWalking}
          aria-pressed={showWalking}
          title="Show walking paths"
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold shadow-md transition-all ${
            showWalking
              ? 'bg-[#16a34a] text-white'
              : 'bg-white text-[#374151] hover:bg-[#f1f3f4]'
          }`}
        >
          {loadingWalking
            ? <Loader2 size={14} className="animate-spin" />
            : <Footprints size={14} />}
          <span>Walking</span>
        </button>
      </div>

      {/* OSM attribution */}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer"
        className="absolute bottom-2 right-2 z-[700] rounded-md bg-white/90 px-2 py-0.5 text-[10px] text-[#6b7280] shadow-sm hover:text-[#111827]">
        © OpenStreetMap contributors
      </a>

      {/* ── Left panel ───────────────────────────────────────────── */}
      <div
        role="region"
        aria-label="Search and filter panel"
        className="pointer-events-none absolute left-0 bottom-0 z-[800] flex w-full flex-col gap-2.5 px-3 pb-4 pt-3 sm:w-[25rem]"
        style={{ top: 'var(--app-header-h, 64px)' }}
      >

        {/* Search bar */}
        <div className="pointer-events-auto shrink-0">
          <div
            role="search"
            className="flex items-center gap-2 rounded-2xl bg-white px-3.5 py-1 shadow-[0_2px_12px_rgba(0,0,0,0.15)]"
          >
            <Search size={17} className="shrink-0 text-[#9aa0a6]" aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search places, buildings, addresses…"
              aria-label="Search for accessible places"
              aria-autocomplete="list"
              aria-controls="search-results"
              aria-expanded={results.length > 0}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-[#202124] outline-none placeholder:text-[#9aa0a6]"
            />
            {searching && <Loader2 size={15} className="shrink-0 animate-spin text-primary" aria-label="Searching…" />}
            {q && !searching && (
              <button
                onClick={() => { setQ(''); setResults([]) }}
                aria-label="Clear search"
                className="shrink-0 rounded-full p-1 text-[#9aa0a6] hover:bg-[#f1f3f4] hover:text-[#202124]"
              >
                <X size={15} aria-hidden="true" />
              </button>
            )}
            <div className="h-5 w-px shrink-0 bg-[#dadce0]" aria-hidden="true" />
            <button
              onClick={() => locateExplicit()}
              aria-label="Use my current location"
              disabled={locating}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            >
              {locating
                ? <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                : <LocateFixed size={17} aria-hidden="true" />}
            </button>
          </div>

          {/* Search results dropdown */}
          {results.length > 0 && (
            <div
              id="search-results"
              role="listbox"
              aria-label="Search results"
              className="mt-1.5 overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.14)]"
            >
              {results.map((r, i) => (
                <button
                  key={r.osmId + i}
                  role="option"
                  onClick={() => pickResult(r)}
                  className="flex w-full items-center gap-3 border-b border-[#f1f3f4] px-4 py-3 text-left last:border-0 hover:bg-[#f8f9fa]"
                >
                  <MapPinIcon size={15} className="shrink-0 text-[#9aa0a6]" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#202124]">{r.shortName}</p>
                    <p className="truncate text-xs text-[#6b7280]">{r.displayName}</p>
                  </div>
                  <ChevronRight size={14} className="ml-auto shrink-0 text-[#9aa0a6]" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}

          {/* Location toast */}
          {locToast && (
            <div
              role="status"
              aria-live="polite"
              className={`mt-2 flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-sm shadow-md ${
                locToast.type === 'error'
                  ? 'bg-[#fce8e6] text-[#c5221f]'
                  : 'bg-[#e8f0fe] text-[#1a73e8]'
              }`}
            >
              {locToast.type === 'error'
                ? <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                : <Navigation2 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />}
              <span className="flex-1 leading-snug">{locToast.msg}</span>
              <button
                onClick={() => setLocToast(null)}
                aria-label="Dismiss"
                className="shrink-0 opacity-60 hover:opacity-100"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Accessibility filters — wrap so every chip stays visible */}
        <div className="pointer-events-auto flex shrink-0 flex-wrap items-center gap-2">
          <button
            onClick={() => setShowA11y((s) => !s)}
            className={`chip ${showA11y ? 'chip-active' : ''}`}
            aria-pressed={showA11y}
          >
            <Accessibility size={15} aria-hidden="true" /> Accessible
          </button>
          {profileActive && (
            <button
              onClick={() => setForMeOnly((s) => !s)}
              className={`chip ${forMeOnly ? 'chip-active' : 'border-primary/40 text-primary'}`}
              aria-pressed={forMeOnly}
            >
              ✦ {needsProfile.name ? `${needsProfile.name.split(' ')[0]}'s map` : 'For Me'}
            </button>
          )}
          {/* Disability-type filters */}
          {DIS_FILTERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => toggleDis(key)}
              className={`chip ${dis.has(key) ? 'chip-active' : ''}`}
              aria-pressed={dis.has(key)}
              title={`Show only places suited to ${label.toLowerCase()} needs`}
            >
              <Icon size={15} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

        {/* Category chips — horizontal carousel (scrolls like Google Maps) */}
        <div
          className="pointer-events-auto flex shrink-0 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Place categories"
        >
          {CATEGORIES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => runCategory(key)}
              className={`chip shrink-0 ${activeCat === key ? 'chip-active' : ''}`}
              aria-pressed={activeCat === key}
            >
              <Icon size={15} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

        {/* POI results panel */}
        {panelOpen && (
          <aside className="pointer-events-auto flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.14)]">
            {/* Panel header */}
            <div className="flex items-center gap-3 border-b border-[#f1f3f4] px-4 py-3">
              {activeCatMeta && (
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ background: activeCatMeta.color }}
                >
                  <activeCatMeta.icon size={19} aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[#202124]">{activeCatMeta?.label}</p>
                <p className="text-xs text-[#6b7280]">
                  {loadingPois ? 'Searching nearby…' : `${sortedPois.length} place${sortedPois.length !== 1 ? 's' : ''} found`}
                </p>
              </div>
              <button
                onClick={() => { setPanelOpen(false); setActiveCat(null); setPois([]) }}
                aria-label="Close panel"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f1f3f4] hover:text-[#202124]"
              >
                <X size={17} />
              </button>
            </div>

            {/* Accessibility legend strip */}
            <div className="flex items-center gap-3 border-b border-[#f1f3f4] bg-[#f8f9fa] px-4 py-2 text-[11px] text-[#6b7280]">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#22c55e]" aria-hidden="true" /> Accessible</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#eab308]" aria-hidden="true" /> Partial</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#FF6B47]" aria-hidden="true" /> Not rated</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#9aa0a6]" aria-hidden="true" /> Unknown</span>
            </div>

            {/* List */}
            <div className="min-h-0 flex-1 divide-y divide-[#f1f3f4] overflow-y-auto">
              {loadingPois && (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#6b7280]">
                  <Loader2 size={24} className="animate-spin text-primary" aria-label="Loading…" />
                  <p className="text-sm">Finding accessible places…</p>
                </div>
              )}
              {!loadingPois && sortedPois.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <span className="text-3xl" aria-hidden="true">🔍</span>
                  <p className="text-sm font-medium text-[#202124]">Nothing found nearby</p>
                  <p className="text-xs text-[#6b7280]">
                    {dis.size > 0
                      ? 'No places match your accessibility filters here — clear a filter or move the map.'
                      : 'Try moving the map or choosing a different category.'}
                  </p>
                  {dis.size > 0 && (
                    <button onClick={() => setDis(new Set())} className="mt-1 text-xs font-medium text-primary hover:underline">
                      Clear accessibility filters
                    </button>
                  )}
                </div>
              )}
              {sortedPois.map((p, i) => {
                const dist = center ? haversineKm(center, [p.lat, p.lng]) : null
                const bd = p.breakdown
                // Build all feature badges in a flat array — all wrapped together
                const badges: React.ReactNode[] = []
                if (p.terrain !== 'Unknown') badges.push(<span key="terr" className="badge"><Mountain size={9} /> {p.surface ?? p.terrain}</span>)
                if (p.stepCount === 0) badges.push(<span key="sf" className="badge-green"><CheckCircle2 size={9} /> Step-free</span>)
                if (p.stepCount != null && p.stepCount > 0) badges.push(<span key="steps" className="badge-red"><Info size={9} /> {p.stepCount} step{p.stepCount !== 1 ? 's' : ''}{p.stepHeightCm ? ` · ${p.stepHeightCm}cm` : ''}</span>)
                if (p.kerbType) badges.push(<span key="kerb" className={p.kerbType === 'flush' || p.kerbType === 'lowered' ? 'badge-green' : 'badge'}><Info size={9} /> Kerb: {p.kerbType}</span>)
                if (p.hasRamp) {
                  const rampLabel = ['Ramp', p.rampGradient != null && `${p.rampGradient.toFixed(0)}%`, p.rampWidthCm && `${p.rampWidthCm}cm wide`].filter(Boolean).join(' · ')
                  badges.push(<span key="ramp" className="badge-green"><ArrowUpDown size={9} /> {rampLabel}</span>)
                  if (p.rampHasHandrail === true) badges.push(<span key="hn" className="badge-green">Handrail ✓</span>)
                  if (p.rampHasHandrail === false) badges.push(<span key="hn2" className="badge">No handrail</span>)
                }
                if (p.doorType || p.doorWidthCm != null) {
                  const doorLabel = [p.doorType ?? 'Door', p.doorWidthCm && `${p.doorWidthCm}cm`].filter(Boolean).join(' · ')
                  badges.push(<span key="door" className={p.doorType === 'Automatic' ? 'badge-green' : 'badge'}><Zap size={9} /> {doorLabel}</span>)
                }
                if (p.hasLift) {
                  const liftLabel = ['Lift', p.liftWidthCm && `${p.liftWidthCm}cm door`, p.liftDepthCm && `${p.liftDepthCm}cm deep`].filter(Boolean).join(' · ')
                  badges.push(<span key="lift" className="badge-green"><Zap size={9} /> {liftLabel}</span>)
                }
                if (p.accessibleToilet) badges.push(<span key="wc" className="badge-green"><Toilet size={9} /> Accessible WC</span>)
                if (p.hasDisabledParking) {
                  const parkLabel = ['Parking', p.disabledParkingSpaces && `${p.disabledParkingSpaces} spaces`].filter(Boolean).join(' · ')
                  badges.push(<span key="park" className="badge-green"><Car size={9} /> {parkLabel}</span>)
                }
                if (p.tactile) badges.push(<span key="tac" className="badge">Tactile paving</span>)
                if (p.corridorWidthCm != null) badges.push(<span key="corr" className={p.corridorWidthCm >= 120 ? 'badge-green' : 'badge'}>Corridor: {p.corridorWidthCm}cm</span>)
                if (p.hearingLoop) badges.push(<span key="hl" className="badge-green">Hearing loop</span>)
                if (p.brailleMenu) badges.push(<span key="brl" className="badge-green">Braille menu</span>)
                if (p.quietRoom) badges.push(<span key="qr" className="badge-green">Quiet room</span>)
                if (p.changingPlace) badges.push(<span key="cp" className="badge-green">Changing Place</span>)
                if (p.allowsAssistanceDogs) badges.push(<span key="dog" className="badge-green">Assistance dogs ✓</span>)
                if (p.hasWheelchairSeating) badges.push(<span key="ws" className="badge-green">WC seating{p.wheelchairSeatingCount ? ` · ${p.wheelchairSeatingCount}` : ''}</span>)

                return (
                  <div
                    key={p.id}
                    className="border-b border-[#f1f3f4] last:border-0"
                    style={{ animation: 'pageIn 280ms ease-out both', animationDelay: `${Math.min(i, 10) * 35}ms` }}
                  >
                    {/* Photo banner */}
                    {p.imageUrl && (
                      <div className="relative h-36 w-full overflow-hidden bg-[#f1f3f4]">
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="h-full w-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                        <div className="absolute bottom-2 left-3">
                          {p.accessScore != null ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-white shadow"
                              style={{ background: scoreColor(p.accessScore) }}
                            >
                              {p.accessScore.toFixed(1)}/10 · {p.accessLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )}

                    <div className="px-4 pb-4 pt-3">
                      {/* Name row */}
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold leading-snug text-[#202124]">{p.name}</p>
                          <p className="mt-0.5 text-xs text-[#6b7280] truncate">
                            {p.address || activeCatMeta?.label}
                            {dist != null && (
                              <span className="ml-1 font-medium text-[#1a73e8]">
                                · {dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}
                              </span>
                            )}
                          </p>
                        </div>
                        <a
                          href={googleMapsTo([p.lat, p.lng])}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Directions to ${p.name}`}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#dadce0] text-[#5f6368] hover:bg-primary hover:text-white hover:border-primary transition-colors"
                        >
                          <ExternalLink size={13} />
                        </a>
                      </div>

                      {/* Score pill (only when no photo) */}
                      {!p.imageUrl && p.accessScore != null && (
                        <div className="mt-2">
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
                            style={{ background: scoreColor(p.accessScore) }}
                          >
                            <Accessibility size={10} /> {p.accessScore.toFixed(1)}/10 · {p.accessLabel}
                          </span>
                        </div>
                      )}

                      {/* Score breakdown — collapsed by default, toggle per card */}
                      {bd.base !== null && (
                        <div className="mt-2">
                          <button
                            onClick={() => toggleBreakdown(p.id)}
                            className="flex items-center gap-1 text-[11px] text-[#9aa0a6] hover:text-primary transition-colors"
                          >
                            <ChevronDown size={12} className={`transition-transform ${expandedBreakdowns.has(p.id) ? 'rotate-180' : ''}`} />
                            {expandedBreakdowns.has(p.id) ? 'Hide' : 'Score breakdown'}
                          </button>
                          {expandedBreakdowns.has(p.id) && (
                            <div className="mt-1.5 rounded-xl bg-[#f8f9fa] px-3 py-2.5 text-[11px] leading-relaxed text-[#5f6368] space-y-0.5">
                              <div><span className="font-semibold text-[#202124]">Base {bd.base}/10</span> — {bd.baseReason}</div>
                              {bd.bonuses.map(b => (
                                <div key={b.label} className="text-[#1a7337]">+{b.points} {b.label.replace(' ✓', '')}</div>
                              ))}
                              {bd.penalties.map(b => (
                                <div key={b.label} className="text-[#b31412]">{b.points} {b.label.replace(' ⚠', '')}</div>
                              ))}
                              {(bd.confidence === 'low' || bd.confidence === 'none') && (
                                <div className="text-[#9aa0a6] italic">Estimated — limited OSM data</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* All feature badges in one wrapping row */}
                      {badges.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {badges}
                        </div>
                      )}

                      {/* Mapper note */}
                      {p.wheelchairDescription && (
                        <p className="mt-2 text-[11px] italic leading-snug text-[#6b7280]">
                          "{p.wheelchairDescription}"
                        </p>
                      )}
                      {p.rampNote && (
                        <p className="mt-1 text-[11px] text-[#6b7280]">Ramp note: {p.rampNote}</p>
                      )}

                      {/* Opening hours */}
                      {p.openingHours && (
                        <p className="mt-2 flex items-center gap-1 text-[11px] text-[#6b7280]">
                          <Clock size={10} /> {p.openingHours}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="mt-3 flex items-center gap-2">
                        <a
                          href={`/place/${p.id}?lat=${p.lat}&lng=${p.lng}&name=${encodeURIComponent(p.name)}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
                        >
                          Full details →
                        </a>
                        <a
                          href={`https://www.openstreetmap.org/${p.osmId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-[#9aa0a6] hover:text-primary hover:underline"
                        >
                          OSM ↗
                        </a>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </aside>
        )}
      </div>

      {/* Bottom legend (desktop only, when no panel open) */}
      {showA11y && !panelOpen && (
        <div className="absolute bottom-6 left-4 z-[700] hidden items-center gap-3 rounded-full bg-white/95 px-4 py-2 text-xs text-[#6b7280] shadow-[0_2px_8px_rgba(0,0,0,0.12)] sm:flex">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#f5b50a]" aria-hidden="true" /> Sponsored</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#0ABFBF]" aria-hidden="true" /> Accessible</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#f9ab00]" aria-hidden="true" /> Alert</span>
          <Link to="/business" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            <MapPinIcon size={12} aria-hidden="true" /> List your business
          </Link>
        </div>
      )}

      {/* Welcome overlay */}
      {showIntro && (
        <div
          className="fixed inset-0 z-[950] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="intro-title"
        >
          <div ref={introTrapRef} className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
            {/* Header */}
            <div className="bg-gradient-to-br from-[#0ABFBF] to-[#1a73e8] px-7 py-7 text-center text-white">
              <div className="mx-auto mb-3 flex justify-center">
                <BrandPin size={56} />
              </div>
              <h2 id="intro-title" className="text-2xl font-bold">Welcome to AccessMap</h2>
              <p className="mt-1 text-sm text-white/85">Crowdsourced accessibility intelligence</p>
            </div>

            <div className="px-6 py-5">
              <div className="space-y-3">
                {[
                  { icon: Accessibility, color: '#0ABFBF', title: 'Accessibility scores', body: 'Mobility, sensory, hearing & vision — rated by the community.' },
                  { icon: AlertTriangle, color: '#ea4335', title: 'Live alerts', body: 'Real-time reports like "elevator offline", verified by AI.' },
                  { icon: RouteIcon, color: '#1a73e8', title: 'Step-free routes', body: 'Plan accessible routes and open them in Google Maps.' },
                ].map((f) => {
                  const Icon = f.icon
                  return (
                    <div key={f.title} className="flex items-start gap-3">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                        style={{ background: f.color }}
                        aria-hidden="true"
                      >
                        <Icon size={18} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[#202124]">{f.title}</p>
                        <p className="text-xs text-[#6b7280]">{f.body}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  onClick={() => { dismissIntro(); locateExplicit() }}
                  className="btn-primary w-full"
                >
                  <LocateFixed size={16} aria-hidden="true" /> Use my location
                </button>
                <button onClick={dismissIntro} className="btn-ghost w-full">
                  Explore the map
                </button>
              </div>

              <p className="mt-4 text-center text-[11px] leading-relaxed text-[#9aa0a6]">
                By continuing you agree to our{' '}
                <a href="/terms" className="underline hover:text-primary">Terms</a> &{' '}
                <a href="/privacy" className="underline hover:text-primary">Privacy Policy</a>.
                Your location is never stored without consent.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
