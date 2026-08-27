import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import {
  Loader2, AlertTriangle, Navigation, LocateFixed, X, Truck,
  MapPin, Flag, ArrowUp, CornerUpRight, CornerUpLeft, CornerDownRight,
  ArrowRightLeft, GitFork, Merge, Clock, Route, RotateCcw,
  ChevronDown, ChevronUp, ShieldAlert, CheckCircle2, Weight, RulerIcon,
} from 'lucide-react'
import Layout from '../components/Layout'
import { searchPlaces, reverseGeocode, type GeoResult } from '../lib/nominatim'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Restriction {
  id: number
  lat: number
  lng: number
  name?: string
  maxheight?: number   // metres
  maxweight?: number   // tonnes
  maxaxleload?: number // tonnes
  maxwidth?: number    // metres
  type: 'bridge' | 'weight' | 'width' | 'other'
}

interface TruckSpecs {
  heightM: number      // vehicle height in metres
  weightT: number      // gross weight in tonnes
  axleT: number        // axle weight in tonnes (0 = not set)
  widthM: number       // vehicle width in metres (0 = not set)
}

// ─── OSRM routing (car profile — HGV profile unavailable on free servers) ────

const OSRM_CAR = [
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  'https://router.project-osrm.org/route/v1/driving',
]

async function truckRoute(
  start: [number, number],
  end: [number, number],
): Promise<{ coords: [number, number][]; distance: number; duration: number; steps: string[]; bounds: [[number,number],[number,number]] }> {
  for (const base of OSRM_CAR) {
    try {
      const url = `${base}/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson&steps=true`
      const res = await fetch(url)
      if (!res.ok) continue
      const data = await res.json()
      const route = data.routes?.[0]
      if (!route) continue
      const coords: [number, number][] = route.geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]],
      )
      const steps: string[] = (route.legs?.[0]?.steps ?? []).map((s: any) => {
        const name = s.name || 'the road'
        const m = Math.round(s.distance)
        const mod = s.maneuver?.modifier ? ` ${s.maneuver.modifier}` : ''
        const type = `${s.maneuver?.type ?? 'continue'}${mod}`
        return `${type} on ${name} — ${m} m`
      })
      const lats = coords.map(c => c[0]), lngs = coords.map(c => c[1])
      const bounds: [[number,number],[number,number]] = [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ]
      return { coords, distance: route.distance, duration: route.duration, steps, bounds }
    } catch { /* try next */ }
  }
  throw new Error('No route found')
}

// ─── Overpass: fetch bridge/weight restrictions in bbox ───────────────────────

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
]

async function fetchRestrictions(
  bounds: [[number,number],[number,number]],
): Promise<Restriction[]> {
  const [sw, ne] = bounds
  // Expand bbox slightly
  const bbox = `${sw[0]-0.01},${sw[1]-0.01},${ne[0]+0.01},${ne[1]+0.01}`
  const q = `[out:json][timeout:20];
(
  way["maxheight"](${bbox});
  way["maxweight"](${bbox});
  way["maxaxleload"](${bbox});
  way["maxwidth"](${bbox});
  node["maxheight"](${bbox});
  node["maxweight"](${bbox});
);
out center tags;`

  for (const ep of OVERPASS) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(q),
      })
      if (!res.ok) continue
      const data = await res.json()
      return (data.elements ?? []).map((el: any): Restriction => {
        const t = el.tags ?? {}
        const lat = el.lat ?? el.center?.lat
        const lng = el.lon ?? el.center?.lon
        const parseVal = (v?: string) => {
          if (!v) return undefined
          // strip non-numeric suffix (e.g. "4.0 m", "4'6\"")
          const n = parseFloat(v.replace(/[^0-9.]/g, ''))
          // convert feet notation like 13'6" or 13-6
          if (v.includes("'") || v.includes('-') && !v.includes('.')) {
            const parts = v.split(/['"-]/).map(Number)
            return parts[0] + (parts[1] || 0) / 12 // feet to metres
          }
          return isNaN(n) ? undefined : n
        }
        const maxheight = parseVal(t.maxheight)
        const maxweight = parseVal(t.maxweight)
        const maxaxleload = parseVal(t.maxaxleload)
        const maxwidth = parseVal(t.maxwidth)
        const type: Restriction['type'] = maxheight ? 'bridge'
          : maxweight || maxaxleload ? 'weight'
          : maxwidth ? 'width' : 'other'
        return {
          id: el.id,
          lat, lng,
          name: t.name || t['name:en'] || undefined,
          maxheight, maxweight, maxaxleload, maxwidth,
          type,
        }
      }).filter((r: Restriction) => r.lat && r.lng)
    } catch { /* try next */ }
  }
  return []
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseStep(s: string) {
  const [main = '', distPart = ''] = s.split(' — ')
  const m = main.match(/^(.+?) on (.+)$/)
  return { verb: m?.[1] ?? main, road: m?.[2] ?? '', dist: distPart }
}

function StepIcon({ verb }: { verb: string }) {
  const v = verb.toLowerCase()
  if (/depart|start/i.test(v)) return <MapPin size={13} className="shrink-0" />
  if (/arrive/i.test(v)) return <Flag size={13} className="shrink-0" />
  if (/turn right/i.test(v)) return <CornerUpRight size={13} className="shrink-0" />
  if (/turn left/i.test(v)) return <CornerUpLeft size={13} className="shrink-0" />
  if (/turn/i.test(v)) return <CornerUpRight size={13} className="shrink-0" />
  if (/off ramp/i.test(v)) return <CornerDownRight size={13} className="shrink-0" />
  if (/merge/i.test(v)) return <Merge size={13} className="shrink-0" />
  if (/fork/i.test(v)) return <GitFork size={13} className="shrink-0" />
  if (/end of road/i.test(v)) return <ArrowRightLeft size={13} className="shrink-0" />
  return <ArrowUp size={13} className="shrink-0" />
}

function verbLabel(verb: string) {
  const v = verb.toLowerCase()
  if (/depart/i.test(v)) return 'Depart'
  if (/arrive/i.test(v)) return 'Arrive'
  if (/off ramp/i.test(v)) return 'Take off-ramp'
  if (/merge/i.test(v)) return 'Merge'
  if (/fork/i.test(v)) return 'Take fork'
  if (/end of road/i.test(v)) return 'End of road'
  if (/new name/i.test(v)) return 'Continue'
  if (/turn right/i.test(v)) return 'Turn right'
  if (/turn left/i.test(v)) return 'Turn left'
  if (/turn/i.test(v)) return 'Turn'
  if (/continue|straight/i.test(v)) return 'Continue'
  return verb.charAt(0).toUpperCase() + verb.slice(1)
}

function formatDist(dist: string) {
  const m = parseInt(dist)
  if (isNaN(m)) return dist
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`
}

function restrictionViolates(r: Restriction, specs: TruckSpecs): string[] {
  const issues: string[] = []
  if (r.maxheight !== undefined && specs.heightM > r.maxheight)
    issues.push(`Clearance ${r.maxheight.toFixed(1)} m — your truck is ${specs.heightM.toFixed(1)} m tall`)
  if (r.maxweight !== undefined && specs.weightT > r.maxweight)
    issues.push(`Weight limit ${r.maxweight} t — your truck weighs ${specs.weightT} t`)
  if (r.maxaxleload !== undefined && specs.axleT > 0 && specs.axleT > r.maxaxleload)
    issues.push(`Axle limit ${r.maxaxleload} t — your axle load is ${specs.axleT} t`)
  if (r.maxwidth !== undefined && specs.widthM > 0 && specs.widthM > r.maxwidth)
    issues.push(`Width limit ${r.maxwidth.toFixed(1)} m — your truck is ${specs.widthM.toFixed(1)} m wide`)
  return issues
}

// ─── Geolocation with IP fallback ────────────────────────────────────────────
// GPS (getCurrentPosition) often times out on desktops with no GPS hardware, so
// fall back to IP-based location — races 3 free, key-free services.
async function ipCoords(): Promise<[number, number] | null> {
  const to = (ms: number) => new Promise<never>((_, rej) => setTimeout(() => rej(new Error('t')), ms))
  const attempt = async (fn: () => Promise<[number, number] | null>) => {
    const c = await fn(); if (!c) throw new Error('no coords'); return c
  }
  try {
    return await Promise.any([
      attempt(async () => {
        const d: any = await Promise.race([fetch('https://get.geojs.io/v1/ip/geo.json').then(r => r.json()), to(4000)])
        const lat = parseFloat(d.latitude), lng = parseFloat(d.longitude)
        return (!isNaN(lat) && !isNaN(lng)) ? [lat, lng] as [number, number] : null
      }),
      attempt(async () => {
        const d: any = await Promise.race([fetch('https://ipwho.is/').then(r => r.json()), to(4000)])
        return (d.success && d.latitude && d.longitude) ? [d.latitude, d.longitude] as [number, number] : null
      }),
      attempt(async () => {
        const d: any = await Promise.race([fetch('https://geolocation-db.com/json/').then(r => r.json()), to(4000)])
        return (d.latitude && d.longitude && d.latitude !== 'Not found') ? [+d.latitude, +d.longitude] as [number, number] : null
      }),
    ])
  } catch { return null }
}

// Distance in metres from a point to the nearest segment of the route polyline.
// Used to keep only the bridge/weight restrictions that actually lie on the route
// (Overpass returns every restriction in the bounding box, not just the corridor).
function metresToRoute(lat: number, lng: number, route: [number, number][]): number {
  if (route.length === 0) return Infinity
  const mPerLat = 111320
  const mPerLng = 111320 * Math.cos((lat * Math.PI) / 180)
  const px = lng * mPerLng, py = lat * mPerLat
  let min = Infinity
  for (let i = 0; i < route.length - 1; i++) {
    const ax = route[i][1] * mPerLng, ay = route[i][0] * mPerLat
    const bx = route[i + 1][1] * mPerLng, by = route[i + 1][0] * mPerLat
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    const cx = ax + t * dx, cy = ay + t * dy
    const d = Math.hypot(px - cx, py - cy)
    if (d < min) min = d
  }
  return min
}

// Only flag restrictions within this many metres of the route centreline.
const ROUTE_CORRIDOR_M = 150

// ─── Dot marker ──────────────────────────────────────────────────────────────

const dot = (color: string) =>
  L.divIcon({
    className: '',
    html: `<span style="display:block;width:14px;height:14px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.3)"></span>`,
    iconSize: [14, 14], iconAnchor: [7, 7],
  })

const warningIcon = (violated: boolean) =>
  L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;border-radius:50%;background:${violated ? '#ef4444' : '#f59e0b'};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:13px">${violated ? '⛔' : '⚠️'}</div>`,
    iconSize: [26, 26], iconAnchor: [13, 13],
  })

// ─── GeoInput ────────────────────────────────────────────────────────────────

function GeoInput({ label, value, color, onPick, onClear }: {
  label: string; value?: GeoResult; color: string
  onPick: (g: GeoResult) => void; onClear: () => void
}) {
  const [q, setQ] = useState(value?.shortName ?? '')
  const [results, setResults] = useState<GeoResult[]>([])
  const [busy, setBusy] = useState(false)
  const [geoBusy, setGeoBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { setQ(value?.shortName ?? '') }, [value?.shortName])

  useEffect(() => {
    if (q.trim().length < 3 || q === value?.shortName) { setResults([]); return }
    const t = setTimeout(async () => {
      setBusy(true)
      try { setResults(await searchPlaces(q)) } finally { setBusy(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [q, value?.shortName])

  function useMyLocation() {
    setErr(''); setGeoBusy(true)
    let settled = false
    const done = async (lat: number, lng: number) => {
      if (settled) return
      settled = true
      const g = await reverseGeocode(lat, lng)
      g.shortName = 'My location'
      onPick(g); setQ('My location'); setResults([]); setGeoBusy(false)
    }
    const ipFallback = async () => {
      if (settled) return
      const c = await ipCoords()
      if (settled) return
      if (c) done(c[0], c[1])
      else { settled = true; setGeoBusy(false); setErr('Location unavailable — type an address instead.') }
    }
    if (!navigator.geolocation) { ipFallback(); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => done(pos.coords.latitude, pos.coords.longitude),
      () => ipFallback(),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
    // Desktop safety net: if GPS is slow/unresponsive, use IP location after 4.5s
    setTimeout(() => { if (!settled) ipFallback() }, 4500)
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 transition-all">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="w-10 shrink-0 text-xs font-medium text-muted">{label}</span>
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/60"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}…`}
          aria-label={label}
        />
        {busy && <Loader2 size={13} className="animate-spin text-primary" />}
        {q && !busy && (
          <button onClick={() => { setQ(''); setResults([]); onClear() }}
            className="rounded-full p-0.5 text-muted hover:text-ink">
            <X size={13} />
          </button>
        )}
        <div className="h-4 w-px bg-border" />
        <button onClick={useMyLocation}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary/10 transition-colors">
          {geoBusy ? <Loader2 size={13} className="animate-spin" /> : <LocateFixed size={13} />}
        </button>
      </div>
      {err && <p className="mt-1 text-xs text-alert">{err}</p>}
      {results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {results.map((r, i) => (
            <button key={i} onClick={() => { onPick(r); setQ(r.shortName); setResults([]) }}
              className="block w-full border-b border-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-bg transition-colors">
              <p className="text-sm font-medium">{r.shortName}</p>
              <p className="truncate text-xs text-muted">{r.displayName}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Specs input ─────────────────────────────────────────────────────────────

function SpecInput({ label, value, unit, min, max, step, icon: Icon, onChange }: {
  label: string; value: number; unit: string; min: number; max: number; step: number
  icon: typeof Weight; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className="shrink-0 text-muted" />
      <span className="w-28 text-xs text-muted">{label}</span>
      <input
        type="number" min={min} max={max} step={step} value={value || ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        placeholder="0"
        className="w-20 rounded-lg border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-primary"
      />
      <span className="text-xs text-muted">{unit}</span>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TruckRouter() {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const lineRef = useRef<L.Polyline | null>(null)
  const markerRefs = useRef<L.Marker[]>([])
  const restrictionRefs = useRef<L.Marker[]>([])

  const [start, setStart] = useState<GeoResult>()
  const [end, setEnd] = useState<GeoResult>()
  const [specs, setSpecs] = useState<TruckSpecs>({ heightM: 4.0, weightT: 20, axleT: 0, widthM: 0 })
  const [steps, setSteps] = useState<string[]>([])
  const [meta, setMeta] = useState<{ km: number; min: number } | null>(null)
  const [restrictions, setRestrictions] = useState<Restriction[]>([])
  const [violations, setViolations] = useState<{ r: Restriction; issues: string[] }[]>([])
  const [busy, setBusy] = useState(false)
  const [checkingRestrictions, setCheckingRestrictions] = useState(false)
  const [err, setErr] = useState('')
  const [stepsOpen, setStepsOpen] = useState(false)
  const [specsOpen, setSpecsOpen] = useState(true)

  const startRef = useRef<GeoResult>(); startRef.current = start
  const endRef = useRef<GeoResult>(); endRef.current = end

  // Init map
  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current, { attributionControl: false, zoomControl: false })
      .setView([39.5, -98.35], 4)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.control.attribution({ position: 'bottomright', prefix: false })
      .addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>')
      .addTo(map)
    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 100)

    map.on('click', async (e: L.LeafletMouseEvent) => {
      const g = await reverseGeocode(e.latlng.lat, e.latlng.lng)
      if (!startRef.current) setStart(g)
      else if (!endRef.current) setEnd(g)
      else setEnd(g)
    })

    const seedStart = async (lat: number, lng: number) => {
      const g = await reverseGeocode(lat, lng)
      g.shortName = 'My location'
      setStart((prev) => prev ?? g)
    }
    const seedFromIP = async () => {
      const c = await ipCoords()
      if (c) seedStart(c[0], c[1])
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => seedStart(pos.coords.latitude, pos.coords.longitude),
        () => seedFromIP(),
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 },
      )
    } else {
      seedFromIP()
    }

    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Update endpoint markers
  useEffect(() => {
    const map = mapRef.current
    if (!map || lineRef.current) return
    markerRefs.current.forEach(m => m.remove()); markerRefs.current = []
    if (start) markerRefs.current.push(L.marker([start.lat, start.lng], { icon: dot('#f97316') }).addTo(map).bindTooltip('Origin'))
    if (end) markerRefs.current.push(L.marker([end.lat, end.lng], { icon: dot('#ef4444') }).addTo(map).bindTooltip('Destination'))
    if (start && end) map.fitBounds(L.latLngBounds([[start.lat, start.lng], [end.lat, end.lng]]), { padding: [60, 60] })
    else if (start) map.setView([start.lat, start.lng], 13)
    else if (end) map.setView([end.lat, end.lng], 13)
  }, [start, end])

  async function plan() {
    if (!start || !end || !mapRef.current) return
    setBusy(true); setErr(''); setRestrictions([]); setViolations([])

    // Clear old layers
    lineRef.current?.remove(); lineRef.current = null
    markerRefs.current.forEach(m => m.remove()); markerRefs.current = []
    restrictionRefs.current.forEach(m => m.remove()); restrictionRefs.current = []

    try {
      const { coords, distance, duration, steps, bounds } = await truckRoute(
        [start.lat, start.lng], [end.lat, end.lng],
      )

      const line = L.polyline(coords, { color: '#f97316', weight: 5, opacity: 0.85 }).addTo(mapRef.current)
      lineRef.current = line
      markerRefs.current = [
        L.marker([start.lat, start.lng], { icon: dot('#f97316') }).addTo(mapRef.current).bindTooltip('Origin'),
        L.marker([end.lat, end.lng], { icon: dot('#ef4444') }).addTo(mapRef.current).bindTooltip('Destination'),
      ]
      mapRef.current.fitBounds(line.getBounds(), { padding: [50, 50] })
      setSteps(steps)
      setMeta({ km: distance / 1000, min: Math.round(duration / 60) })
      setStepsOpen(true)

      // Now fetch restrictions along the route
      setCheckingRestrictions(true)
      try {
        const all = await fetchRestrictions(bounds)
        // Keep only restrictions that actually lie along the route corridor —
        // Overpass returns everything in the bounding box, which buries the route.
        const rlist = all.filter(r => metresToRoute(r.lat, r.lng, coords) <= ROUTE_CORRIDOR_M)
        setRestrictions(rlist)

        // Check which violate the truck specs
        const viols = rlist
          .map(r => ({ r, issues: restrictionViolates(r, specs) }))
          .filter(v => v.issues.length > 0)
        setViolations(viols)

        // Place markers on map
        rlist.forEach(r => {
          if (!mapRef.current || !r.lat || !r.lng) return
          const violated = viols.some(v => v.r.id === r.id)
          const m = L.marker([r.lat, r.lng], { icon: warningIcon(violated) })
            .addTo(mapRef.current!)
          const lines = [
            r.name && `<b>${r.name}</b>`,
            r.maxheight !== undefined && `Max height: ${r.maxheight.toFixed(1)} m`,
            r.maxweight !== undefined && `Max weight: ${r.maxweight} t`,
            r.maxaxleload !== undefined && `Max axle load: ${r.maxaxleload} t`,
            r.maxwidth !== undefined && `Max width: ${r.maxwidth.toFixed(1)} m`,
            violated && `<span style="color:#ef4444;font-weight:600">⛔ Violates your truck specs</span>`,
          ].filter(Boolean).join('<br>')
          m.bindPopup(lines)
          restrictionRefs.current.push(m)
        })
      } finally { setCheckingRestrictions(false) }

    } catch (e: any) {
      setErr(e?.message ?? 'Could not find a route between those points.')
    } finally { setBusy(false) }
  }

  function reset() {
    lineRef.current?.remove(); lineRef.current = null
    markerRefs.current.forEach(m => m.remove()); markerRefs.current = []
    restrictionRefs.current.forEach(m => m.remove()); restrictionRefs.current = []
    setStart(undefined); setEnd(undefined); setSteps([]); setMeta(null)
    setRestrictions([]); setViolations([]); setErr('')
  }

  const spec = (k: keyof TruckSpecs) => (v: number) => setSpecs(s => ({ ...s, [k]: v }))

  return (
    <Layout>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
          <Truck size={20} />
        </div>
        <div>
          <h1 className="text-3xl font-semibold">Truck route planner</h1>
          <p className="mt-0.5 text-muted text-sm">Plan routes with bridge clearance &amp; weight limit checks.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* ── Sidebar ── */}
        <div className="flex flex-col gap-4">

          {/* Origin / Destination */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
            <GeoInput label="From" value={start} color="#f97316" onPick={setStart} onClear={() => setStart(undefined)} />
            <div className="flex items-center gap-2 px-1">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted">to</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <GeoInput label="To" value={end} color="#ef4444" onPick={setEnd} onClear={() => setEnd(undefined)} />
          </div>

          {/* Truck specs */}
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <button
              onClick={() => setSpecsOpen(v => !v)}
              className="flex w-full items-center gap-3 px-4 py-3 hover:bg-bg transition-colors"
            >
              <Truck size={16} className="text-orange-500" />
              <span className="flex-1 text-left text-sm font-semibold">Truck dimensions &amp; weight</span>
              {specsOpen ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
            </button>
            {specsOpen && (
              <div className="border-t border-border px-4 py-4 space-y-3">
                <SpecInput label="Vehicle height" value={specs.heightM} unit="m" min={1} max={6} step={0.1} icon={RulerIcon} onChange={spec('heightM')} />
                <SpecInput label="Gross weight" value={specs.weightT} unit="t" min={1} max={100} step={0.5} icon={Weight} onChange={spec('weightT')} />
                <SpecInput label="Axle weight" value={specs.axleT} unit="t" min={0} max={30} step={0.5} icon={Weight} onChange={spec('axleT')} />
                <SpecInput label="Vehicle width" value={specs.widthM} unit="m" min={0} max={5} step={0.1} icon={RulerIcon} onChange={spec('widthM')} />
                <p className="text-[11px] text-muted">Set axle weight and width to 0 to skip those checks.</p>
              </div>
            )}
          </div>

          {/* Plan button */}
          <div className="flex gap-2">
            <button onClick={plan} disabled={!start || !end || busy}
              className="btn-primary flex-1 disabled:opacity-40 bg-orange-500 hover:bg-orange-600 border-orange-500">
              {busy ? <Loader2 className="animate-spin" size={15} /> : <Navigation size={15} />}
              {busy ? 'Routing…' : 'Plan truck route'}
            </button>
          </div>

          {(start || end) && !busy && (
            <button onClick={reset} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
              <RotateCcw size={13} /> Reset
            </button>
          )}

          {err && (
            <div className="flex items-start gap-2 rounded-xl border border-alert/30 bg-alert/5 px-3 py-2.5 text-sm text-alert">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {err}
            </div>
          )}

          {/* Restriction scan result */}
          {(checkingRestrictions || restrictions.length > 0) && (
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <ShieldAlert size={15} className={violations.length > 0 ? 'text-alert' : 'text-emerald-500'} />
                <span className="text-sm font-semibold">
                  {checkingRestrictions ? 'Scanning route for restrictions…' : 'Bridge & weight check'}
                </span>
                {checkingRestrictions && <Loader2 size={13} className="animate-spin text-muted ml-auto" />}
              </div>

              {!checkingRestrictions && (
                <div className="px-4 py-3 space-y-2">
                  {violations.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 size={15} />
                      No restrictions violated — route looks clear for your truck.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-alert">{violations.length} restriction{violations.length > 1 ? 's' : ''} violated</p>
                      {violations.map(({ r, issues }, i) => (
                        <div key={i} className="rounded-xl border border-alert/30 bg-alert/5 px-3 py-2.5 text-xs space-y-0.5">
                          {r.name && <p className="font-semibold">{r.name}</p>}
                          {issues.map((issue, j) => (
                            <p key={j} className="text-alert flex items-start gap-1.5">
                              <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {issue}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-muted">
                    {restrictions.length} restriction{restrictions.length !== 1 ? 's' : ''} found along route — shown as markers on the map. Click any marker for details.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Route summary + steps */}
          {meta && (
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center gap-4 bg-orange-50 dark:bg-orange-950/30 px-4 py-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-orange-700 dark:text-orange-300">
                  <Route size={14} /> {meta.km.toFixed(1)} km
                </div>
                <div className="h-4 w-px bg-orange-200 dark:bg-orange-800" />
                <div className="flex items-center gap-1.5 text-sm font-semibold text-orange-700 dark:text-orange-300">
                  <Clock size={14} /> ~{meta.min} min
                </div>
              </div>

              <button
                onClick={() => setStepsOpen(v => !v)}
                className="flex w-full items-center justify-between px-4 py-3 hover:bg-bg transition-colors"
              >
                <span className="text-sm font-semibold">Turn-by-turn directions</span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  {steps.length} steps
                  {stepsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>

              {stepsOpen && (
                <ol className="max-h-72 overflow-y-auto divide-y divide-border/50">
                  {steps.map((s, i) => {
                    const { verb, road, dist } = parseStep(s)
                    const isFirst = i === 0
                    const isLast = i === steps.length - 1
                    return (
                      <li key={i} className="flex items-start gap-3 px-4 py-3 text-sm hover:bg-bg transition-colors">
                        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full
                          ${isFirst || isLast ? 'bg-orange-500 text-white' : 'bg-bg text-muted border border-border'}`}>
                          {isFirst ? <MapPin size={11} /> : isLast ? <Flag size={11} /> : <StepIcon verb={verb} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-tight">{verbLabel(verb)}</p>
                          {road && <p className="mt-0.5 truncate text-xs text-muted">{road}</p>}
                        </div>
                        {dist && (
                          <span className="shrink-0 rounded-md bg-bg px-1.5 py-0.5 text-[11px] font-medium text-muted border border-border/60">
                            {formatDist(dist)}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          )}

          {!meta && !busy && (
            <p className="text-center text-xs text-muted pt-2">
              Set your truck specs, then search or click the map to set start &amp; destination.
            </p>
          )}
        </div>

        {/* ── Map ── */}
        <div ref={elRef}
          className="h-[540px] cursor-crosshair overflow-hidden rounded-2xl border border-border shadow-sm lg:h-[calc(100vh-160px)] lg:min-h-[500px]"
        />
      </div>
    </Layout>
  )
}
