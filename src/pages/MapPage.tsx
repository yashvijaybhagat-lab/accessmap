import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Loader2, X, LocateFixed, Accessibility, MapPin as MapPinIcon, AlertTriangle, Route as RouteIcon,
  Navigation, Navigation2, ChevronRight, Info, RefreshCw, Eye, Ear, Brain, TrainFront, Footprints, List, Sparkles,
} from 'lucide-react'
import BrandPin from '../components/MapPin'
import MapView from '../components/MapView'
import BottomSheet from '../components/BottomSheet'
import PlaceSheet, { type Selected, routeHref, placeDetailHref } from '../components/PlaceSheet'
import { scoreColor, scoreWord } from '../components/ScoreRing'
import { getPlaces, getAlerts, getSpecsFor } from '../lib/data'
import { searchPlaces, type GeoResult } from '../lib/nominatim'
import { CATEGORIES, categoryColor, nearbyByCategory, haversineKm, type Poi, type CategoryKey } from '../lib/overpass'
import { nominatimNearby, nominatimLookupMany } from '../lib/nominatimPois'
import { poisFromTiles, placesAround, TILE_POI_MIN_ZOOM } from '../lib/tilePois'
import { applyCommunitySpecs } from '../lib/community'
import type { Map as MlMap } from 'maplibre-gl'
import { getNearbyTransit, getNearbyWalkingPaths, type TransitLine, type TransitStation, type WalkingPath } from '../lib/transit'
import { batchWikiImages } from '../lib/wikipedia'
import { describePlace } from '../lib/describe'
import { useFocusTrap } from '../lib/useFocusTrap'
import { scorePlace, scorePoi, hasProfile, GRADE_COLOR } from '../lib/compatibility'
import { useStore } from '../store/useStore'
import type { Place, Alert, Dimension, AccessSpecs } from '../types'

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

/** Merge two lists of real places by OSM id; `preferIncoming` = incoming has the fuller tag set. */
function mergePois(existing: Poi[], incoming: Poi[], preferIncoming: boolean): Poi[] {
  const byId = new Map(existing.map((p) => [p.osmId, p]))
  for (const p of incoming) {
    const prev = byId.get(p.osmId)
    if (!prev || preferIncoming) byId.set(p.osmId, prev?.imageUrl && !p.imageUrl ? { ...p, imageUrl: prev.imageUrl } : p)
  }
  return [...byId.values()]
}

/** 2 = real rating (mapped in OSM or reported by users), 1 = estimated from the type of place, 0 = not rated. */
function ratingTier(p: Poi): 0 | 1 | 2 {
  if (p.accessScore == null) return 0
  return p.communityReports || p.breakdown.confidence === 'high' || p.breakdown.confidence === 'medium' ? 2 : 1
}

/** The id AccessMap stores community data under for a place ("node-123"). */
const placeKey = (p: Poi) => (p.osmId ? p.osmId.replace('/', '-') : p.id)

/** Real places plus any map-tile places they don't already cover (same OSM id, or same name within ~150 m). */
function withUnmatchedTiles(real: Poi[], tiles: Poi[]): Poi[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const ids = new Set(real.map((p) => p.osmId).filter(Boolean))
  const extra: Poi[] = []
  for (const t of tiles) {
    if (t.osmId && ids.has(t.osmId)) continue
    if (real.some((r) => norm(r.name) === norm(t.name) && haversineKm([r.lat, r.lng], [t.lat, t.lng]) < 0.15)) continue
    if (t.osmId) ids.add(t.osmId)
    else if (extra.some((e) => e.id === t.id)) continue
    extra.push(t)
  }
  return [...real, ...extra]
}

export default function MapPage() {
  const [places, setPlaces] = useState<Place[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  // Live device position (GPS / Wi-Fi). Never set from IP lookups — those are too rough to draw as "you".
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const userLocRef = useRef(userLoc); userLocRef.current = userLoc
  // 'live' = device fix streaming in; 'approx' states = map centred from the IP address only.
  const [locStatus, setLocStatus] = useState<'idle' | 'searching' | 'live' | 'denied' | 'unavailable' | 'unsupported'>('idle')
  const [following, setFollowing] = useState(false)
  const followRef = useRef(false); followRef.current = following
  const [locNotice, setLocNotice] = useState<{ kind: 'denied' | 'unavailable' | 'unsupported' | 'coarse'; msg: string } | null>(null)
  const mapRef = useRef<MlMap | null>(null)
  const [viewCenter, setViewCenter] = useState<[number, number] | null>(null)
  const [lastSearch, setLastSearch] = useState<{ cat: CategoryKey; center: [number, number] } | null>(null)
  const [dataSource, setDataSource] = useState<'live' | 'tiles' | 'unavailable' | 'zoom'>('live')
  // True while slower sources are still adding places to an already-visible list.
  const [refining, setRefining] = useState(false)
  const poiCache = useRef(new Map<string, Poi[]>())
  // centerRef tracks map pan position without triggering re-renders
  // center state is only updated when we actually need to run a search
  const centerRef = useRef<[number, number] | null>(null)
  const [center, setCenter] = useState<[number, number] | null>(null)
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number; follow?: boolean } | null>(null)
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

  // Pin-tap bottom sheet — drag it up to open the full place page
  const [selected, setSelected] = useState<Selected | null>(null)
  const navigate = useNavigate()
  const openSelectedDetails = useCallback(() => {
    if (!selected) return
    navigate(placeDetailHref(selected))
    setSelected(null)
  }, [selected, navigate])

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
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    Promise.all([getPlaces(), getAlerts()]).then(([p, a]) => { setPlaces(p); setAlerts(a) })
    startLocation()
    return () => stopWatch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Search overlay picked a place → fly the map there (and stop following the user).
  useEffect(() => {
    if (!mapTarget) return
    setFollowing(false)
    setCenter([mapTarget.lat, mapTarget.lng])
    setFocus({ lat: mapTarget.lat, lng: mapTarget.lng, zoom: mapTarget.zoom ?? 15 })
    clearMapTarget()
  }, [mapTarget, clearMapTarget])

  function showToast(msg: string, type: 'info' | 'error' = 'info') {
    setLocToast({ msg, type })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setLocToast(null), 6000)
  }

  /** Rough area from the IP address — used only to centre the map, never shown as "you". */
  async function ipCoords(): Promise<[number, number] | null> {
    const get = async (url: string, pick: (d: any) => [number, number] | null) => {
      const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 4000)
      try { return pick(await (await fetch(url, { signal: ac.signal })).json()) } catch { return null } finally { clearTimeout(t) }
    }
    const results = (await Promise.all([
      get('https://ipwho.is/', (d) => (d.success && d.latitude ? [d.latitude, d.longitude] : null)),
      get('https://geolocation-db.com/json/', (d) => (d.latitude && d.latitude !== 'Not found' ? [+d.latitude, +d.longitude] : null)),
      get('https://get.geojs.io/v1/ip/geo.json', (d) => (d.latitude ? [parseFloat(d.latitude), parseFloat(d.longitude)] : null)),
    ])).filter((c): c is [number, number] => !!c && !isNaN(c[0]) && !isNaN(c[1]))
    if (!results.length) return null
    // The services often disagree by several km — average them instead of trusting whichever answered first.
    return [results.reduce((n, c) => n + c[0], 0) / results.length, results.reduce((n, c) => n + c[1], 0) / results.length]
  }

  const zoomForAccuracy = (acc: number) => (acc <= 50 ? 17 : acc <= 300 ? 16 : acc <= 1500 ? 14 : 12)

  function stopWatch() {
    if (watchRef.current != null) navigator.geolocation?.clearWatch(watchRef.current)
    watchRef.current = null
    if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null }
  }

  async function approximateFallback(kind: 'denied' | 'unavailable' | 'unsupported') {
    const how =
      kind === 'denied'
        ? 'Location is blocked for this site. To fix it, click the icon to the left of the web address → Site settings → Location → Allow, then press Retry.'
        : kind === 'unsupported'
          ? 'This browser can’t share your location (it needs a secure https connection and location support).'
          : 'Your device couldn’t work out where you are. On a Mac: System Settings → Privacy & Security → Location Services → turn it on for your browser, and keep Wi-Fi on. On a phone: turn Location on. We’ll keep trying.'
    setLocNotice({ kind, msg: `Showing an approximate area based on your internet connection — it can be 5–15 km off. ${how}` })
    if (userLocRef.current) return // keep the last real fix on screen
    const c = await ipCoords()
    if (c && !userLocRef.current) { setCenter(c); setFocus({ lat: c[0], lng: c[1], zoom: 12 }) }
  }

  /**
   * Continuous, high-accuracy tracking. One watcher feeds the blue dot for the
   * whole session so the position is live (updates as you move) and improves
   * as GPS / Wi-Fi refine it. `explicit` = the user pressed the locate button.
   */
  function startLocation(explicit = false) {
    if (!navigator?.geolocation || !window.isSecureContext) {
      setLocStatus('unsupported'); approximateFallback('unsupported'); return
    }
    stopWatch()
    if (explicit) { setLocating(true); setFollowing(true) }
    if (!userLocRef.current) setLocStatus('searching')
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords
        const first = !userLocRef.current
        setUserLoc({ lat, lng, accuracy })
        setLocStatus('live')
        setLocating(false)
        setLocNotice(
          accuracy > 1000
            ? { kind: 'coarse', msg: `Your position is only accurate to about ${(accuracy / 1000).toFixed(1)} km. Turn on Wi-Fi or GPS for a precise location.` }
            : null,
        )
        if (first) { setCenter([lat, lng]); setFollowing(true); setFocus({ lat, lng, zoom: zoomForAccuracy(accuracy) }) }
        else if (followRef.current) setFocus({ lat, lng, follow: true })
      },
      (err) => {
        setLocating(false)
        if (err.code === err.PERMISSION_DENIED) {
          stopWatch(); setLocStatus('denied'); approximateFallback('denied'); return
        }
        // Position unavailable / timed out. If we already have a fix, keep showing it.
        if (userLocRef.current) return
        setLocStatus('unavailable')
        approximateFallback('unavailable')
        // Some browsers stop a watch after an error — keep retrying quietly so the
        // dot appears as soon as Location Services / GPS come back.
        if (!retryTimer.current) {
          retryTimer.current = setTimeout(() => { retryTimer.current = null; if (!userLocRef.current) startLocation() }, 20000)
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
  }

  /** Locate button: jump to (and follow) your live position, or retry finding it. */
  function locateExplicit() {
    const u = userLocRef.current
    if (u && locStatus === 'live') {
      setFollowing(true)
      setFocus({ lat: u.lat, lng: u.lng, zoom: Math.max(zoomForAccuracy(u.accuracy), mapRef.current?.getZoom() ?? 0) })
      return
    }
    startLocation(true)
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
    setActiveCat(cat); setPanelOpen(true)
    setLastSearch({ cat, center: c })
    poiAbort.current?.abort()
    const ac = new AbortController(); poiAbort.current = ac

    // Same category in (roughly) the same area this session → instant.
    const key = `${cat}|${c[0].toFixed(2)}|${c[1].toFixed(2)}`
    const cached = poiCache.current.get(key)
    if (cached) {
      setPois(cached); setDataSource('live'); setLoadingPois(false); setRefining(false)
      return
    }
    setPois([]); setLoadingPois(true); setRefining(true)

    // Real places that are already in the map's tiles appear immediately (no access data yet);
    // Nominatim (~0.5 s) and Overpass (slower, most complete) then fill in rated places.
    const map = mapRef.current
    const tiles = map && map.getZoom() >= TILE_POI_MIN_ZOOM ? poisFromTiles(map, cat, c, 5000) : []
    let real: Poi[] = []       // places with their real OSM tags
    let swept: Poi[] = []      // every named place in the area, from the street-level map tiles
    let community = new Map<string, AccessSpecs[]>()
    const view = () => {
      const list = withUnmatchedTiles(real, [...swept, ...tiles])
      return community.size ? list.map((p) => { const sp = community.get(placeKey(p)); return sp ? applyCommunitySpecs(p, sp) : p }) : list
    }
    const render = () => {
      if (ac.signal.aborted) return
      const list = view()
      setPois(list)
      if (list.length) { setDataSource(real.length ? 'live' : 'tiles'); setLoadingPois(false) }
    }
    if (tiles.length) render()

    const fromNominatim = nominatimNearby(c, cat, 5000, (batch) => { real = mergePois(real, batch, false); render() }, ac.signal)
      .then(() => true, (e) => { if (e?.name === 'AbortError') throw e; return false })
    const fromOverpass = nearbyByCategory(c, cat, 5000, ac.signal, 8000)
      .then((r) => { if (r.unavailable) return false; real = mergePois(real, r.pois, true); render(); return true })
      .catch((e) => { if (e?.name === 'AbortError') throw e; return false })
    // Every named place nearby, then its real OSM accessibility tags (50 places per lookup).
    const fromSweep = placesAround(c, cat, 5000, ac.signal, 300)
      .then(async (list) => {
        swept = list; render()
        await fromNominatim // don't re-look-up places the category search already returned
        const known = new Set(real.map((p) => p.osmId))
        const ids = list.map((p) => p.osmId).filter((id) => id && !known.has(id))
        if (ids.length) await nominatimLookupMany(ids, cat, ac.signal, (batch) => { real = mergePois(real, batch, false); render() })
        return true
      })
      .catch((e) => { if (e?.name === 'AbortError') throw e; return false })

    try {
      const [nomOk, sweepOk] = await Promise.all([fromNominatim, fromSweep])
      if (ac.signal.aborted) return
      // Nothing within 5 km: widen once (Nominatim only — it's fast).
      if (!real.length && !swept.length && !tiles.length && (nomOk || sweepOk)) {
        await nominatimNearby(c, cat, 15000, (batch) => { real = mergePois(real, batch, false); render() }, ac.signal).catch((e) => { if (e?.name === 'AbortError') throw e })
      }
      // Ratings reported by AccessMap users.
      const ids = view().map(placeKey)
      if (ids.length) {
        community = await getSpecsFor(ids).catch(() => new Map<string, AccessSpecs[]>())
        render()
      }
      const opOk = await fromOverpass
      if (ac.signal.aborted) return
      setRefining(false)
      setLoadingPois(false)
      const final = view()
      if (final.length) {
        setPois(final)
        setDataSource(real.length ? 'live' : 'tiles')
        if (real.length) poiCache.current.set(key, final)
      } else {
        setPois([])
        setDataSource(nomOk || opOk || sweepOk ? 'live' : map && map.getZoom() < TILE_POI_MIN_ZOOM ? 'zoom' : 'unavailable')
      }
      // Patch in Wikipedia images for places without an OSM image
      const needsImage = real.filter((p) => !p.imageUrl).slice(0, 25).map((p) => p.name)
      if (needsImage.length) {
        batchWikiImages(needsImage, 4).then((wikiMap) => {
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
      if (!ac.signal.aborted) { setLoadingPois(false); setRefining(false) }
    }
  }

  const onCenterChange = useCallback((lat: number, lng: number) => {
    centerRef.current = [lat, lng]
    setViewCenter([lat, lng])
  }, [])
  const onMapReady = useCallback((m: MlMap) => { mapRef.current = m }, [])
  // Dragging / zooming the map yourself stops "follow my location".
  const onUserGesture = useCallback(() => setFollowing(false), [])
  const onMapSelect = useCallback((p: Place) => {
    setFollowing(false)
    setFocus({ lat: p.lat, lng: p.lng, zoom: 16 })
    setSelected({ kind: 'place', data: p })
  }, [])
  const onPoiSelect = useCallback((p: Poi) => {
    setFollowing(false)
    setFocus({ lat: p.lat, lng: p.lng, zoom: 16 })
    setSelected({ kind: 'poi', data: p })
  }, [])

  /** Search where the map is looking (so panning to another area and searching works). */
  function currentCenter(): [number, number] | null {
    return centerRef.current ?? (userLoc ? [userLoc.lat, userLoc.lng] : center)
  }
  /** Distances are measured from you when we know where you are, else from the map centre. */
  function distanceOrigin(): [number, number] | null {
    return userLoc && locStatus === 'live' ? [userLoc.lat, userLoc.lng] : currentCenter()
  }

  // Offer "Search this area" once the map has moved well away from the last search.
  const movedAway = !!(lastSearch && viewCenter && panelOpen && !loadingPois
    && haversineKm(lastSearch.center, viewCenter) > 1.2)

  function runCategory(cat: CategoryKey) {
    if (activeCat === cat) { poiAbort.current?.abort(); setRefining(false); setActiveCat(null); setPois([]); setPanelOpen(false); setLastSearch(null); return }
    const c = currentCenter()
    if (c) searchCategory(cat, c)
    else { setActiveCat(cat); setPanelOpen(true); setLoadingPois(true); startLocation(true) }
  }

  // If a category was chosen before the map had a position, run it once one arrives.
  useEffect(() => {
    if (activeCat && loadingPois && !lastSearch && viewCenter) searchCategory(activeCat, viewCenter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewCenter])

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
    // Same origin as the distances shown on each card: you (live) or the searched area.
    const origin: [number, number] | null = userLoc && locStatus === 'live' ? [userLoc.lat, userLoc.lng] : lastSearch?.center ?? center
    const dist = (p: Poi) => (origin ? haversineKm(origin, [p.lat, p.lng]) : 0)
    const active = DIS_FILTERS.filter((f) => dis.has(f.key))
    const filtered = active.length ? pois.filter((p) => active.every((f) => f.poi(p))) : pois
    // Real ratings (mapped or reported) first, then estimates, then unrated places.
    // Within a tier: personal match when a needs profile is set, else access score.
    const rank = (p: Poi) => ratingTier(p) * 100 + (profileActive ? scorePoi(p, needsProfile).score / 10 : p.accessScore ?? 0)
    return [...filtered].sort((a, b) => {
      const sa = rank(a), sb = rank(b)
      if (Math.abs(sb - sa) > 0.05) return sb - sa
      return dist(a) - dist(b)
    })
  }, [pois, center, dis, profileActive, needsProfile, userLoc, locStatus, lastSearch])

  const activeCatMeta = CATEGORIES.find((c) => c.key === activeCat)

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
    const c = distanceOrigin()
    const all: Selected[] = [
      ...visiblePlaces.map((p) => ({ kind: 'place' as const, data: p })),
      ...sortedPois.map((p) => ({ kind: 'poi' as const, data: p })),
    ]
    return all
      .map((s) => ({ s, km: c ? haversineKm(c, [s.data.lat, s.data.lng]) : null }))
      .sort((a, b) => (a.km ?? 0) - (b.km ?? 0))
      .slice(0, 80)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePlaces, sortedPois, userLoc, center, locStatus])

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
          onReady={onMapReady}
          onUserGesture={onUserGesture}
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
                aria-label={locStatus === 'live' ? (following ? 'Following your location' : 'Show and follow my location') : 'Find my location'}
                aria-pressed={locStatus === 'live' ? following : undefined}
                disabled={locating}
                className={`flex h-[48px] w-[48px] items-center justify-center rounded-full shadow-[0_6px_18px_rgba(26,115,232,0.4)] disabled:opacity-60 ${
                  following && locStatus === 'live' ? 'bg-primary text-white ring-4 ring-primary/25' : locStatus === 'live' ? 'bg-white text-primary' : 'bg-primary text-white'
                }`}
              >
                {locating || locStatus === 'searching'
                  ? <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                  : following && locStatus === 'live'
                    ? <Navigation2 size={20} className="fill-current" aria-hidden="true" />
                    : <LocateFixed size={20} aria-hidden="true" />}
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

        {locNotice && (
          <div
            role="status"
            className={`pointer-events-auto flex shrink-0 items-start gap-2.5 rounded-2xl px-3.5 py-3 text-sm shadow-md ${
              locNotice.kind === 'coarse' ? 'bg-[#e8f0fe] text-[#0b3d91]' : 'bg-[#fff7ed] text-[#7c2d12]'
            }`}
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="leading-snug">{locNotice.msg}</p>
              {locNotice.kind !== 'coarse' && locNotice.kind !== 'unsupported' && (
                <button onClick={() => startLocation(true)} className="mt-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-bold underline-offset-2 hover:underline">
                  Retry
                </button>
              )}
            </div>
            <button onClick={() => setLocNotice(null)} aria-label="Dismiss location message" className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/5">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Needs filters */}
        <div className="pointer-events-auto flex shrink-0 items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_88%,transparent)] pr-6" role="group" aria-label="Filter by access need">
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
          className="pointer-events-auto flex shrink-0 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_88%,transparent)] pr-6"
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

        {movedAway && lastSearch && (
          <button
            onClick={() => { const c = currentCenter(); if (c) searchCategory(lastSearch.cat, c) }}
            className="pointer-events-auto mx-auto flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white shadow-lg"
          >
            <RefreshCw size={14} aria-hidden="true" /> Search this area
          </button>
        )}

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
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  {loadingPois ? 'Searching nearby…' : `${sortedPois.length} place${sortedPois.length !== 1 ? 's' : ''} · ${dataSource === 'tiles' ? 'nearest first' : profileActive ? 'best match for you first' : 'best access first'}`}
                  {refining && !loadingPois && (
                    <span className="inline-flex items-center gap-1 text-primary"><Loader2 size={11} className="animate-spin" aria-hidden="true" /> finding more</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => { poiAbort.current?.abort(); setRefining(false); setPanelOpen(false); setActiveCat(null); setPois([]) }}
                aria-label="Close results"
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {!loadingPois && !refining && dataSource !== 'live' && (
              <p className="flex items-start gap-2 border-b border-border/70 bg-surface/70 px-4 py-2 text-xs text-muted" role="note">
                <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  {dataSource === 'tiles' && <>Access ratings couldn’t load, so these places are unrated for now. Tap one to load its details, or <button className="font-bold text-primary underline" onClick={() => { const c = currentCenter(); if (c && activeCat) searchCategory(activeCat, c) }}>try again</button>.</>}
                  {dataSource === 'zoom' && <>Place data is slow right now. <strong>Zoom in closer</strong> and search again.</>}
                  {dataSource === 'unavailable' && <>Place data couldn’t load. Check your connection and <button className="font-bold text-primary underline" onClick={() => { const c = currentCenter(); if (c && activeCat) searchCategory(activeCat, c) }}>try again</button>.</>}
                </span>
              </p>
            )}

            <ul className="min-h-0 flex-1 overflow-y-auto" aria-busy={loadingPois || refining}>
              {loadingPois && [0, 1, 2, 3, 4].map((k) => (
                <li key={k} className="flex items-center gap-3 px-4 py-3" aria-hidden="true">
                  <span className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-surface" />
                  <span className="flex-1 space-y-2">
                    <span className="block h-3.5 w-3/5 animate-pulse rounded bg-surface" />
                    <span className="block h-3 w-4/5 animate-pulse rounded bg-surface" />
                  </span>
                </li>
              ))}
              {loadingPois && <li className="visually-hidden">Finding accessible places…</li>}
              {!loadingPois && sortedPois.length === 0 && dataSource === 'live' && (
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
                const here = distanceOrigin()
                const dist = here ? haversineKm(here, [p.lat, p.lng]) : null
                const fromTiles = p.id.startsWith('tile-') && !p.communityReports
                const desc = p.tags && !fromTiles ? describePlace(p.tags, p.category) : null
                const match = profileActive ? scorePoi(p, needsProfile) : null
                const tier = ratingTier(p)
                const estimated = tier === 1
                const source = p.communityReports ? `${p.communityReports} community report${p.communityReports > 1 ? 's' : ''}` : tier === 2 ? 'OpenStreetMap' : tier === 1 ? 'Estimated' : null
                return (
                  <li
                    key={p.id}
                    className="flex items-center border-b border-border/60 last:border-0"
                    style={{ animation: 'pageIn 220ms ease-out both', animationDelay: `${Math.min(i, 8) * 25}ms` }}
                  >
                    <button
                      onClick={() => onPoiSelect(p)}
                      className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left transition-colors hover:bg-surface/60 focus-visible:bg-surface/60"
                    >
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt=""
                          loading="lazy"
                          className="h-12 w-12 shrink-0 rounded-xl bg-surface object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: `${categoryColor(p.category)}1f`, color: categoryColor(p.category) }} aria-hidden="true">
                          {activeCatMeta && <activeCatMeta.icon size={20} />}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{p.name}</span>
                          {p.accessScore != null ? (
                            <span
                              className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold text-white"
                              style={{ background: scoreColor(p.accessScore), opacity: estimated ? 0.75 : 1 }}
                              title={estimated ? 'Estimated from the type of place — little mapped data' : p.accessLabel}
                            >
                              {estimated && '~'}{p.accessScore.toFixed(1)}<span className="visually-hidden"> out of 10, {p.accessLabel}{estimated ? ', estimated' : ''}</span>
                            </span>
                          ) : (
                            <span className="shrink-0 rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-muted">Unrated</span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-[13px] text-ink/80">
                          {desc ? desc.summary : fromTiles ? 'Tap to load access details' : p.accessLabel}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {dist != null && <span className="font-semibold text-ink/70">{fmtKm(dist)}</span>}
                          {source && <>{dist != null && ' · '}<span className={tier === 2 ? 'font-semibold text-[#1e8e3e]' : ''}>{source}</span></>}
                          {(dist != null || source) && (p.address || match) && ' · '}
                          {p.address}
                          {match && <span className="font-semibold" style={{ color: GRADE_COLOR[match.grade] }}>{p.address ? ' · ' : ''}{match.score}% match</span>}
                        </span>
                      </span>
                    </button>
                    <Link
                      to={routeHref(p.lat, p.lng, p.name)}
                      aria-label={`Accessible route to ${p.name}`}
                      className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-white"
                    >
                      <Navigation size={16} aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </aside>
        )}
      </div>

      {/* Pin-tap place details — slides up from the bottom */}
      <BottomSheet
        open={!!selected}
        onClose={() => setSelected(null)}
        showHeader={false}
        onExpand={openSelectedDetails}
        expandHint="Swipe up for full details"
      >
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
