import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Loader2, X, LocateFixed, Accessibility, MapPin as MapPinIcon, AlertTriangle, Route as RouteIcon,
  Navigation, Navigation2, ChevronRight, Info, Eye, Ear, Brain, TrainFront, Footprints, List, Sparkles,
} from 'lucide-react'
import BrandPin from '../components/MapPin'
import MapView from '../components/MapView'
import BottomSheet from '../components/BottomSheet'
import PlaceSheet, { type Selected, routeHref } from '../components/PlaceSheet'
import { scoreColor, scoreWord } from '../components/ScoreRing'
import { getPlaces, getAlerts } from '../lib/data'
import { searchPlaces, type GeoResult } from '../lib/nominatim'
import { CATEGORIES, categoryColor, nearbyByCategory, haversineKm, type Poi, type CategoryKey } from '../lib/overpass'
import { getNearbyTransit, getNearbyWalkingPaths, type TransitLine, type TransitStation, type WalkingPath } from '../lib/transit'
import { batchWikiImages } from '../lib/wikipedia'
import { describePlace } from '../lib/describe'
import { useFocusTrap } from '../lib/useFocusTrap'
import { scorePlace, scorePoi, hasProfile, GRADE_COLOR } from '../lib/compatibility'
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
  const mapTarget = useStore((s) => s.mapTarget)
  const clearMapTarget = useStore((s) => s.clearMapTarget)

  // Pin-tap bottom sheet
  const [selected, setSelected] = useState<Selected | null>(null)

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

  // Search overlay picked a place → fly the map there.
  useEffect(() => {
    if (!mapTarget) return
    setCenter([mapTarget.lat, mapTarget.lng])
    setFocus({ lat: mapTarget.lat, lng: mapTarget.lng, zoom: mapTarget.zoom ?? 15 })
    clearMapTarget()
  }, [mapTarget, clearMapTarget])

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
      async (err) => {
        // GPS failed — fall back to IP centering either way
        const c = await ipCoords()
        if (c) { setCenter(c); setFocus({ lat: c[0], lng: c[1], zoom: 12 }) }
        // If it's specifically a blocked/denied permission, say so — this is the
        // one case the user can actually fix, so it's worth surfacing up front
        // rather than only when they tap "locate me".
        if (err.code === err.PERMISSION_DENIED) {
          showToast('Location is blocked in your browser — centering by your approximate IP location instead. Enable it in your browser’s site settings, or just search for a place.', 'info')
        }
        // If IP lookup also fails, the map just stays at its default view — user can search.
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
  const onMapSelect = useCallback((p: Place) => {
    setFocus({ lat: p.lat, lng: p.lng, zoom: 16 })
    setSelected({ kind: 'place', data: p })
  }, [])
  const onPoiSelect = useCallback((p: Poi) => {
    setFocus({ lat: p.lat, lng: p.lng, zoom: 16 })
    setSelected({ kind: 'poi', data: p })
  }, [])

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
    // With a needs profile set, rank by personal match; otherwise by access score.
    const rank = (p: Poi) => (profileActive ? scorePoi(p, needsProfile).score / 10 : p.accessScore ?? -1)
    return [...filtered].sort((a, b) => {
      const sa = rank(a), sb = rank(b)
      if (Math.abs(sb - sa) > 0.05) return sb - sa
      return dist(a) - dist(b)
    })
  }, [pois, center, dis, profileActive, needsProfile])

  const activeCatMeta = CATEGORIES.find((c) => c.key === activeCat)
  const usingSamples = pois.length > 0 && pois.every((p) => p.id.startsWith('placeholder'))

  // Screen-reader announcement when results arrive.
  const [announce, setAnnounce] = useState('')
  useEffect(() => {
    if (loadingPois || !activeCatMeta) return
    setAnnounce(`${sortedPois.length} ${activeCatMeta.label.toLowerCase()} found nearby, best access first.`)
  }, [loadingPois, sortedPois.length, activeCatMeta])

  // "L" toggles the accessible list view (keyboard / screen-reader alternative to the map).
  const [listOpen, setListOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'l' && e.key !== 'L') || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      setListOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const listItems = useMemo(() => {
    const c = currentCenter()
    const all: Selected[] = [
      ...visiblePlaces.map((p) => ({ kind: 'place' as const, data: p })),
      ...sortedPois.map((p) => ({ kind: 'poi' as const, data: p })),
    ]
    return all
      .map((s) => ({ s, km: c ? haversineKm(c, [s.data.lat, s.data.lng]) : null }))
      .sort((a, b) => (a.km ?? 0) - (b.km ?? 0))
      .slice(0, 80)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePlaces, sortedPois, userLoc, center])

  const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`)
  const navBottom = 'calc(3.25rem + env(safe-area-inset-bottom) + 1rem)'

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#eef1f6]">
      <p className="visually-hidden" role="status" aria-live="polite">{announce}</p>

      {/* Full-bleed 3D map — sits behind the floating top bar */}
      <div id="main-content" className="absolute inset-0">
        <MapView
          places={visiblePlaces}
          pois={sortedPois}
          alertPlaceIds={alertIds}
          userLocation={userLoc}
          focus={focus}
          selectedId={selected?.data.id ?? null}
          onCenterChange={onCenterChange}
          onSelect={onMapSelect}
          onPoiSelect={onPoiSelect}
          transitLines={transitLines}
          transitStations={transitStations}
          walkingPaths={walkingPaths}
          controlsBottom={navBottom}
          controls={
            <>
              <button
                onClick={toggleTransit}
                aria-pressed={showTransit}
                aria-label="Transit lines and stations"
                className={`map-ctl ${showTransit ? 'bg-[#1d4ed8] text-white shadow-lg' : 'glass text-ink'}`}
              >
                {loadingTransit ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <TrainFront size={16} aria-hidden="true" />}
                <span className="map-ctl-text">Transit</span>
              </button>
              <button
                onClick={toggleWalking}
                aria-pressed={showWalking}
                aria-label="Walking paths and steps"
                className={`map-ctl ${showWalking ? 'bg-[#15803d] text-white shadow-lg' : 'glass text-ink'}`}
              >
                {loadingWalking ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Footprints size={16} aria-hidden="true" />}
                <span className="map-ctl-text">Paths</span>
              </button>
              <button
                onClick={() => setListOpen(true)}
                aria-label="List view of places (L)"
                className="map-ctl glass text-ink"
              >
                <List size={16} aria-hidden="true" /> <span className="map-ctl-text">List</span>
              </button>
              <button
                onClick={() => locateExplicit()}
                aria-label="Show my location"
                disabled={locating}
                className="flex h-[48px] w-[48px] items-center justify-center rounded-full bg-primary text-white shadow-[0_6px_18px_rgba(26,115,232,0.4)] disabled:opacity-60"
              >
                {locating ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <LocateFixed size={20} aria-hidden="true" />}
              </button>
            </>
          }
        />
      </div>

      {/* ── Left column — floats below the top bar ─────────────────── */}
      <div
        role="region"
        aria-label="Map filters and results"
        className="pointer-events-none absolute left-0 z-[800] flex w-full flex-col gap-2 px-3 pt-2 sm:w-[26rem]"
        style={{
          top: 'calc(var(--app-header-h, 56px) + 0.25rem)',
          bottom: navBottom,
        }}
      >
        <div className="pointer-events-auto shrink-0">
          {locToast && (
            <div
              role="status"
              aria-live="polite"
              className={`flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm shadow-md ${
                locToast.type === 'error' ? 'bg-[#fce8e6] text-[#a50e0e]' : 'bg-[#e8f0fe] text-[#0b3d91]'
              }`}
            >
              {locToast.type === 'error'
                ? <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                : <Navigation2 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />}
              <span className="flex-1 leading-snug">{locToast.msg}</span>
              <button onClick={() => setLocToast(null)} aria-label="Dismiss message" className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/5">
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {/* Needs filters */}
        <div className="pointer-events-auto flex shrink-0 items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter by access need">
          {profileActive && (
            <button
              onClick={() => setForMeOnly((s) => !s)}
              className={`chip ${forMeOnly ? 'chip-active' : 'border-primary/40 text-primary'}`}
              aria-pressed={forMeOnly}
            >
              <Sparkles size={15} aria-hidden="true" /> {needsProfile.name ? `${needsProfile.name.split(' ')[0]}'s matches` : 'Matches me'}
            </button>
          )}
          {DIS_FILTERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => toggleDis(key)}
              className={`chip ${dis.has(key) ? 'chip-active' : ''}`}
              aria-pressed={dis.has(key)}
            >
              <Icon size={15} aria-hidden="true" /> {label}
            </button>
          ))}
          <button
            onClick={() => setShowA11y((s) => !s)}
            className={`chip ${showA11y ? '' : 'opacity-70'}`}
            aria-pressed={showA11y}
          >
            <MapPinIcon size={15} aria-hidden="true" /> Reviewed places
          </button>
        </div>

        {/* Category chips */}
        <div
          className="pointer-events-auto flex shrink-0 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Find nearby"
        >
          {CATEGORIES.map(({ key, label, icon: Icon, color }) => (
            <button
              key={key}
              onClick={() => runCategory(key)}
              className={`chip shrink-0 ${activeCat === key ? 'chip-active' : ''}`}
              aria-pressed={activeCat === key}
            >
              <Icon size={15} aria-hidden="true" style={activeCat === key ? undefined : { color }} /> {label}
            </button>
          ))}
        </div>

        {/* Results panel */}
        {panelOpen && (
          <aside aria-label={`${activeCatMeta?.label ?? 'Places'} near you`} className="glass pointer-events-auto flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl">
            <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
              {activeCatMeta && (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: activeCatMeta.color }} aria-hidden="true">
                  <activeCatMeta.icon size={19} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-ink">{activeCatMeta?.label}</h2>
                <p className="text-xs text-muted">
                  {loadingPois ? 'Searching nearby…' : `${sortedPois.length} place${sortedPois.length !== 1 ? 's' : ''} · ${profileActive ? 'best match for you first' : 'best access first'}`}
                </p>
              </div>
              <button
                onClick={() => { setPanelOpen(false); setActiveCat(null); setPois([]) }}
                aria-label="Close results"
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {usingSamples && !loadingPois && (
              <p className="flex items-start gap-2 border-b border-border/70 bg-[#fff7ed] px-4 py-2 text-xs text-[#7c2d12]" role="note">
                <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>Live map data is unavailable right now, so these are <strong>sample places</strong>, not real results. Try again in a moment.</span>
              </p>
            )}

            <ul className="min-h-0 flex-1 overflow-y-auto" aria-busy={loadingPois}>
              {loadingPois && (
                <li className="flex flex-col items-center justify-center gap-2 py-12 text-muted">
                  <Loader2 size={24} className="animate-spin text-primary" aria-hidden="true" />
                  <p className="text-sm">Finding accessible places…</p>
                </li>
              )}
              {!loadingPois && sortedPois.length === 0 && (
                <li className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                  <p className="text-sm font-semibold text-ink">Nothing found nearby</p>
                  <p className="text-xs text-muted">
                    {dis.size > 0
                      ? 'No places here match your access filters — clear a filter or move the map.'
                      : 'Try moving the map or choosing a different category.'}
                  </p>
                  {dis.size > 0 && (
                    <button onClick={() => setDis(new Set())} className="mt-1 text-sm font-semibold text-primary underline">
                      Clear access filters
                    </button>
                  )}
                </li>
              )}
              {!loadingPois && sortedPois.map((p, i) => {
                const here = currentCenter()
                const dist = here ? haversineKm(here, [p.lat, p.lng]) : null
                const desc = p.tags ? describePlace(p.tags, p.category) : null
                const match = profileActive ? scorePoi(p, needsProfile) : null
                const bd = p.breakdown
                return (
                  <li
                    key={p.id}
                    className="border-b border-border/60 last:border-0"
                    style={{ animation: 'pageIn 260ms ease-out both', animationDelay: `${Math.min(i, 10) * 30}ms` }}
                  >
                    <div className="flex gap-3 px-4 py-3.5">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt=""
                          className="h-16 w-16 shrink-0 rounded-2xl bg-surface object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: categoryColor(p.category) }} aria-hidden="true">
                          {activeCatMeta && <activeCatMeta.icon size={24} />}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <h3 className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-ink">
                            <button onClick={() => onPoiSelect(p)} className="text-left hover:underline">{p.name}</button>
                          </h3>
                          {p.accessScore != null ? (
                            <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: scoreColor(p.accessScore) }}>
                              {p.accessScore.toFixed(1)}<span className="visually-hidden"> out of 10, {p.accessLabel}</span>
                            </span>
                          ) : (
                            <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted">Unrated</span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {p.address || activeCatMeta?.label}
                          {dist != null && <span className="font-semibold text-primary"> · {fmtKm(dist)}</span>}
                          {match && <span className="font-semibold" style={{ color: GRADE_COLOR[match.grade] }}> · {match.score}% match</span>}
                        </p>
                        {desc && <p className="mt-1.5 text-[13px] leading-snug text-ink">{desc.summary}</p>}
                        {bd.confidence === 'low' || bd.confidence === 'none' ? (
                          <p className="mt-1 text-[11px] text-muted">Score estimated from the type of place — little mapped data.</p>
                        ) : null}
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <Link
                            to={routeHref(p.lat, p.lng, p.name)}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-bold text-white"
                          >
                            <Navigation size={13} aria-hidden="true" /> Route<span className="visually-hidden"> to {p.name}</span>
                          </Link>
                          <button
                            onClick={() => onPoiSelect(p)}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-border bg-card px-3.5 text-xs font-bold text-ink"
                          >
                            Details<span className="visually-hidden"> for {p.name}</span> <ChevronRight size={13} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </aside>
        )}
      </div>

      {/* Pin-tap place details — slides up from the bottom */}
      <BottomSheet open={!!selected} onClose={() => setSelected(null)} showHeader={false}>
        {selected && <PlaceSheet selected={selected} onClose={() => setSelected(null)} />}
      </BottomSheet>

      {/* Accessible list view — everything on the map, as a plain list */}
      <BottomSheet open={listOpen} onClose={() => setListOpen(false)} title="Places on the map">
        <div className="px-5 pb-6">
          <p className="text-sm text-muted">
            {listItems.length ? `${listItems.length} places, nearest first.` : 'No places loaded yet — choose a category such as Cafés or Hospitals first.'}
          </p>
          <ul className="mt-3 divide-y divide-border">
            {listItems.map(({ s, km }) => {
              const sc = s.kind === 'poi' ? s.data.accessScore : (s.data.scores.mobility + s.data.scores.sensory + s.data.scores.hearing + s.data.scores.vision) / 4
              return (
                <li key={`${s.kind}-${s.data.id}`}>
                  <button
                    onClick={() => { setListOpen(false); s.kind === 'poi' ? onPoiSelect(s.data) : onMapSelect(s.data) }}
                    className="flex w-full items-center gap-3 py-3 text-left"
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ background: sc != null ? scoreColor(sc) : '#6b7280' }}
                      aria-hidden="true"
                    >
                      {sc != null ? sc.toFixed(0) : '?'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{s.data.name}</span>
                      <span className="block text-xs text-muted">
                        {sc != null ? `Access ${sc.toFixed(1)} of 10 — ${scoreWord(sc)}` : 'Access not rated'}
                        {km != null && ` · ${fmtKm(km)} away`}
                      </span>
                    </span>
                    <ChevronRight size={16} className="text-muted" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </BottomSheet>

      {/* Welcome sheet (first visit) */}
      <BottomSheet open={showIntro} onClose={dismissIntro} showHeader={false}>
        <div>
          <div className="bg-gradient-to-br from-[#0b3d91] via-[#1a73e8] to-[#0aa5a5] px-7 py-7 text-center text-white">
            <div className="mx-auto mb-3 flex justify-center">
              <BrandPin size={56} />
            </div>
            <h2 className="text-2xl font-bold">Welcome to AccessMap</h2>
            <p className="mt-1 text-sm text-white/90">Know before you go — for every kind of access need.</p>
          </div>

          <div className="px-6 py-5">
            <ul className="space-y-3">
              {[
                { icon: Accessibility, color: '#0b3d91', title: 'Access you can trust', body: 'Step counts, door widths, lifts, toilets, hearing loops and quiet rooms — in plain language.' },
                { icon: RouteIcon, color: '#15803d', title: 'Smarter routes', body: 'Wheelchair, low-vision and step-free routes that check kerbs, steps and slopes.' },
                { icon: Sparkles, color: '#7c3aed', title: 'Made for you', body: 'Tap the Accessibility button for text size, contrast, read-aloud and more.' },
              ].map((f) => {
                const Icon = f.icon
                return (
                  <li key={f.title} className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: f.color }} aria-hidden="true">
                      <Icon size={19} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-ink">{f.title}</p>
                      <p className="text-[13px] text-muted">{f.body}</p>
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="mt-5 flex flex-col gap-2.5">
              <button onClick={() => { dismissIntro(); locateExplicit() }} className="btn-primary w-full">
                <LocateFixed size={16} aria-hidden="true" /> Use my location
              </button>
              <button onClick={() => { dismissIntro(); window.dispatchEvent(new CustomEvent('am:open-a11y')) }} className="btn-ghost w-full">
                <Accessibility size={16} aria-hidden="true" /> Set up accessibility first
              </button>
              <button onClick={dismissIntro} className="w-full py-2 text-sm font-semibold text-muted hover:text-ink">
                Just explore the map
              </button>
            </div>

            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
              By continuing you agree to our{' '}
              <Link to="/terms" className="underline hover:text-primary">Terms</Link> &{' '}
              <Link to="/privacy" className="underline hover:text-primary">Privacy Policy</Link>.
              Your location is never stored without consent.
            </p>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
