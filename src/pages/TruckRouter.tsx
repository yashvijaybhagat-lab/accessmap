import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import {
  Loader2, AlertTriangle, Navigation, LocateFixed, X, Truck,
  MapPin, Flag, ArrowUp, CornerUpRight, CornerUpLeft, CornerDownRight,
  ArrowRightLeft, GitFork, Merge, Clock, Route as RouteIcon, RotateCcw,
  ChevronDown, ChevronUp, ShieldAlert, CheckCircle2, Info,
} from 'lucide-react'
import Layout from '../components/Layout'
import { searchPlaces, reverseGeocode, type GeoResult } from '../lib/nominatim'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TruckSpecs {
  heightM: number
  weightT: number
  axleT: number
  widthM: number
}

interface Restriction {
  id: number
  lat: number
  lng: number
  name?: string
  maxheight?: number
  maxweight?: number
  maxaxleload?: number
  maxwidth?: number
}

// ─── Routing ──────────────────────────────────────────────────────────────────

const OSRM = [
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  'https://router.project-osrm.org/route/v1/driving',
]

async function fetchRoute(start: [number, number], end: [number, number]) {
  for (const base of OSRM) {
    try {
      const res = await fetch(
        `${base}/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson&steps=true`,
      )
      if (!res.ok) continue
      const data = await res.json()
      const route = data.routes?.[0]
      if (!route) continue
      const coords: [number, number][] = route.geometry.coordinates.map(
        ([lng, lat]: [number, number]) => [lat, lng],
      )
      const steps: string[] = (route.legs?.[0]?.steps ?? []).map((s: any) => {
        const name = s.name || 'the road'
        const m = Math.round(s.distance)
        const mod = s.maneuver?.modifier ? ` ${s.maneuver.modifier}` : ''
        return `${s.maneuver?.type ?? 'continue'}${mod} on ${name} — ${m} m`
      })
      const lats = coords.map(c => c[0])
      const lngs = coords.map(c => c[1])
      const bounds: [[number, number], [number, number]] = [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ]
      return { coords, distance: route.distance, duration: route.duration, steps, bounds }
    } catch { /* next server */ }
  }
  throw new Error('No route found between those points. Try locations closer together or on major roads.')
}

// ─── Overpass restrictions ────────────────────────────────────────────────────

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
]

function parseOsmValue(v?: string): number | undefined {
  if (!v) return undefined
  // Handle feet/inches: 13'6" or 13-6
  if (v.includes("'")) {
    const [ft, inch = '0'] = v.split("'")
    const metres = parseInt(ft) * 0.3048 + parseInt(inch) * 0.0254
    return isNaN(metres) ? undefined : parseFloat(metres.toFixed(2))
  }
  const n = parseFloat(v)
  return isNaN(n) ? undefined : n
}

async function fetchRestrictions(bounds: [[number, number], [number, number]]): Promise<Restriction[]> {
  const [sw, ne] = bounds
  const pad = 0.01
  const bbox = `${sw[0] - pad},${sw[1] - pad},${ne[0] + pad},${ne[1] + pad}`
  const q = `[out:json][timeout:25];(way["maxheight"](${bbox});way["maxweight"](${bbox});way["maxaxleload"](${bbox});way["maxwidth"](${bbox});node["maxheight"](${bbox});node["maxweight"](${bbox}););out center tags;`

  for (const ep of OVERPASS) {
    try {
      const res = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q) })
      if (!res.ok) continue
      const data = await res.json()
      return (data.elements ?? [])
        .map((el: any): Restriction | null => {
          const t = el.tags ?? {}
          const lat = el.lat ?? el.center?.lat
          const lng = el.lon ?? el.center?.lon
          if (!lat || !lng) return null
          return {
            id: el.id, lat, lng,
            name: t.name || t['name:en'] || undefined,
            maxheight: parseOsmValue(t.maxheight),
            maxweight: parseOsmValue(t.maxweight),
            maxaxleload: parseOsmValue(t.maxaxleload),
            maxwidth: parseOsmValue(t.maxwidth),
          }
        })
        .filter(Boolean) as Restriction[]
    } catch { /* next server */ }
  }
  return []
}

function checkViolations(r: Restriction, specs: TruckSpecs): string[] {
  const issues: string[] = []
  if (r.maxheight !== undefined && specs.heightM > r.maxheight)
    issues.push(`Height limit ${r.maxheight.toFixed(1)} m — your truck is ${specs.heightM.toFixed(1)} m tall`)
  if (r.maxweight !== undefined && specs.weightT > r.maxweight)
    issues.push(`Weight limit ${r.maxweight} t — your truck weighs ${specs.weightT} t`)
  if (r.maxaxleload !== undefined && specs.axleT > 0 && specs.axleT > r.maxaxleload)
    issues.push(`Axle load limit ${r.maxaxleload} t — your axle load is ${specs.axleT} t`)
  if (r.maxwidth !== undefined && specs.widthM > 0 && specs.widthM > r.maxwidth)
    issues.push(`Width limit ${r.maxwidth.toFixed(1)} m — your truck is ${specs.widthM.toFixed(1)} m wide`)
  return issues
}

// ─── Map icons ────────────────────────────────────────────────────────────────

const dotIcon = (color: string) =>
  L.divIcon({
    className: '',
    html: `<span style="display:block;width:14px;height:14px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.3)"></span>`,
    iconSize: [14, 14], iconAnchor: [7, 7],
  })

const restrictionMarker = (violated: boolean) =>
  L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;border-radius:6px;background:${violated ? '#ef4444' : '#f59e0b'};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.22);display:flex;align-items:center;justify-content:center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        ${violated
          ? '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
          : '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
        }
      </svg>
    </div>`,
    iconSize: [28, 28], iconAnchor: [14, 14],
  })

// ─── Step helpers ─────────────────────────────────────────────────────────────

function parseStep(s: string) {
  const [main = '', dist = ''] = s.split(' — ')
  const m = main.match(/^(.+?) on (.+)$/)
  return { verb: m?.[1] ?? main, road: m?.[2] ?? '', dist }
}

function StepIcon({ verb }: { verb: string }) {
  const v = verb.toLowerCase()
  const cls = 'shrink-0'
  if (/arrive/i.test(v)) return <Flag size={13} className={cls} />
  if (/turn right|slight right|sharp right/i.test(v)) return <CornerUpRight size={13} className={cls} />
  if (/turn left|slight left|sharp left/i.test(v)) return <CornerUpLeft size={13} className={cls} />
  if (/off ramp/i.test(v)) return <CornerDownRight size={13} className={cls} />
  if (/merge/i.test(v)) return <Merge size={13} className={cls} />
  if (/fork/i.test(v)) return <GitFork size={13} className={cls} />
  if (/end of road/i.test(v)) return <ArrowRightLeft size={13} className={cls} />
  return <ArrowUp size={13} className={cls} />
}

function verbLabel(verb: string) {
  const v = verb.toLowerCase()
  if (/depart/i.test(v)) return 'Depart'
  if (/arrive/i.test(v)) return 'Arrive'
  if (/off ramp/i.test(v)) return 'Take off-ramp'
  if (/merge/i.test(v)) return 'Merge'
  if (/fork/i.test(v)) return 'Take fork'
  if (/end of road/i.test(v)) return 'End of road'
  if (/new name|continue|straight/i.test(v)) return 'Continue'
  if (/turn right|slight right/i.test(v)) return 'Turn right'
  if (/turn left|slight left/i.test(v)) return 'Turn left'
  if (/turn/i.test(v)) return 'Turn'
  return verb.charAt(0).toUpperCase() + verb.slice(1)
}

function fmtDist(dist: string) {
  const m = parseInt(dist)
  if (isNaN(m)) return dist
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`
}

// ─── GeoInput ─────────────────────────────────────────────────────────────────

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

  function locate() {
    setErr('')
    if (!navigator.geolocation) { setErr('Geolocation not available.'); return }
    setGeoBusy(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const g = await reverseGeocode(pos.coords.latitude, pos.coords.longitude)
        g.shortName = 'My location'
        onPick(g); setQ('My location'); setResults([]); setGeoBusy(false)
      },
      () => { setGeoBusy(false); setErr('Location blocked — type an address instead.') },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 transition-all">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="w-10 shrink-0 text-xs font-semibold text-muted">{label}</span>
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/50"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={label === 'From' ? 'Origin address or city' : 'Destination address or city'}
          aria-label={label}
        />
        {busy && <Loader2 size={13} className="animate-spin text-primary" />}
        {q && !busy && (
          <button onClick={() => { setQ(''); setResults([]); onClear() }} className="rounded-full p-0.5 text-muted hover:text-ink">
            <X size={13} />
          </button>
        )}
        <div className="h-4 w-px bg-border" />
        <button onClick={locate} title="Use my location"
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

// ─── Spec field ───────────────────────────────────────────────────────────────

function SpecField({ label, hint, value, unit, min, max, step, placeholder, onChange }: {
  label: string; hint: string; value: number; unit: string
  min: number; max: number; step: number; placeholder: string
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-semibold">{label}</label>
        <span className="text-xs text-muted">{hint}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number" min={min} max={max} step={step}
          value={value > 0 ? value : ''}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
        />
        <span className="w-8 text-sm font-medium text-muted">{unit}</span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TruckRouter() {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const lineRef = useRef<L.Polyline | null>(null)
  const markerRefs = useRef<L.Marker[]>([])
  const restrictionRefs = useRef<L.Marker[]>([])

  const [start, setStart] = useState<GeoResult>()
  const [end, setEnd] = useState<GeoResult>()
  const [specs, setSpecs] = useState<TruckSpecs>({ heightM: 0, weightT: 0, axleT: 0, widthM: 0 })
  const [steps, setSteps] = useState<string[]>([])
  const [meta, setMeta] = useState<{ km: number; min: number } | null>(null)
  const [restrictions, setRestrictions] = useState<Restriction[]>([])
  const [violations, setViolations] = useState<{ r: Restriction; issues: string[] }[]>([])
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [err, setErr] = useState('')
  const [stepsOpen, setStepsOpen] = useState(false)

  const startRef = useRef<GeoResult>(); startRef.current = start
  const endRef = useRef<GeoResult>(); endRef.current = end

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

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const g = await reverseGeocode(pos.coords.latitude, pos.coords.longitude)
        g.shortName = 'My location'
        setStart(prev => prev ?? g)
      }, () => {}, { enableHighAccuracy: false, timeout: 6000 })
    }

    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || lineRef.current) return
    markerRefs.current.forEach(m => m.remove()); markerRefs.current = []
    if (start) markerRefs.current.push(L.marker([start.lat, start.lng], { icon: dotIcon('#f97316') }).addTo(map).bindTooltip('Origin'))
    if (end) markerRefs.current.push(L.marker([end.lat, end.lng], { icon: dotIcon('#ef4444') }).addTo(map).bindTooltip('Destination'))
    if (start && end) map.fitBounds([[start.lat, start.lng], [end.lat, end.lng]], { padding: [60, 60] })
    else if (start) map.setView([start.lat, start.lng], 13)
    else if (end) map.setView([end.lat, end.lng], 13)
  }, [start, end])

  async function plan() {
    if (!start || !end || !mapRef.current) return
    setBusy(true); setErr('')
    setRestrictions([]); setViolations([])
    lineRef.current?.remove(); lineRef.current = null
    markerRefs.current.forEach(m => m.remove()); markerRefs.current = []
    restrictionRefs.current.forEach(m => m.remove()); restrictionRefs.current = []

    try {
      const { coords, distance, duration, steps, bounds } = await fetchRoute(
        [start.lat, start.lng], [end.lat, end.lng],
      )
      const line = L.polyline(coords, { color: '#f97316', weight: 5, opacity: 0.88 }).addTo(mapRef.current)
      lineRef.current = line
      markerRefs.current = [
        L.marker([start.lat, start.lng], { icon: dotIcon('#f97316') }).addTo(mapRef.current).bindTooltip('Origin'),
        L.marker([end.lat, end.lng], { icon: dotIcon('#ef4444') }).addTo(mapRef.current).bindTooltip('Destination'),
      ]
      mapRef.current.fitBounds(line.getBounds(), { padding: [50, 50] })
      setSteps(steps)
      setMeta({ km: distance / 1000, min: Math.round(duration / 60) })

      // Scan for restrictions only if specs are set
      const hasSpecs = specs.heightM > 0 || specs.weightT > 0 || specs.axleT > 0 || specs.widthM > 0
      if (hasSpecs) {
        setScanning(true)
        try {
          const rlist = await fetchRestrictions(bounds)
          setRestrictions(rlist)
          const viols = rlist.map(r => ({ r, issues: checkViolations(r, specs) })).filter(v => v.issues.length > 0)
          setViolations(viols)
          rlist.forEach(r => {
            if (!mapRef.current) return
            const violated = viols.some(v => v.r.id === r.id)
            const marker = L.marker([r.lat, r.lng], { icon: restrictionMarker(violated) }).addTo(mapRef.current)
            const popup = [
              r.name ? `<b>${r.name}</b>` : '',
              r.maxheight !== undefined ? `Max height: ${r.maxheight.toFixed(1)} m` : '',
              r.maxweight !== undefined ? `Max weight: ${r.maxweight} t` : '',
              r.maxaxleload !== undefined ? `Max axle load: ${r.maxaxleload} t` : '',
              r.maxwidth !== undefined ? `Max width: ${r.maxwidth.toFixed(1)} m` : '',
              violated ? `<span style="color:#ef4444;font-weight:600">Violates your truck specs</span>` : '',
            ].filter(Boolean).join('<br>')
            marker.bindPopup(popup)
            restrictionRefs.current.push(marker)
          })
        } finally { setScanning(false) }
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Could not find a route.')
    } finally { setBusy(false) }
  }

  function reset() {
    lineRef.current?.remove(); lineRef.current = null
    markerRefs.current.forEach(m => m.remove()); markerRefs.current = []
    restrictionRefs.current.forEach(m => m.remove()); restrictionRefs.current = []
    setStart(undefined); setEnd(undefined); setSteps([]); setMeta(null)
    setRestrictions([]); setViolations([]); setErr('')
  }

  const setSpec = (k: keyof TruckSpecs) => (v: number) => setSpecs(s => ({ ...s, [k]: v }))
  const hasSpecs = specs.heightM > 0 || specs.weightT > 0

  return (
    <Layout>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
          <Truck size={20} />
        </div>
        <div>
          <h1 className="text-3xl font-semibold">Truck route planner</h1>
          <p className="mt-0.5 text-sm text-muted">Enter your truck dimensions to check bridge clearances and weight limits along any route.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <div className="flex flex-col gap-5">

          {/* Truck specs — shown first so user fills these before routing */}
          <div className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
              <Truck size={15} className="text-orange-500" />
              <h2 className="text-sm font-semibold">Your truck dimensions</h2>
            </div>
            <div className="px-4 py-4 space-y-4">
              <SpecField
                label="Vehicle height"
                hint="Required for bridge clearance checks"
                value={specs.heightM}
                unit="m"
                min={1} max={6} step={0.05}
                placeholder="e.g. 4.0"
                onChange={setSpec('heightM')}
              />
              <SpecField
                label="Gross vehicle weight"
                hint="Required for weight limit checks"
                value={specs.weightT}
                unit="t"
                min={1} max={100} step={0.5}
                placeholder="e.g. 26"
                onChange={setSpec('weightT')}
              />
              <SpecField
                label="Axle load"
                hint="Optional — leave blank to skip"
                value={specs.axleT}
                unit="t"
                min={0} max={30} step={0.5}
                placeholder="e.g. 11.5"
                onChange={setSpec('axleT')}
              />
              <SpecField
                label="Vehicle width"
                hint="Optional — leave blank to skip"
                value={specs.widthM}
                unit="m"
                min={0} max={5} step={0.05}
                placeholder="e.g. 2.5"
                onChange={setSpec('widthM')}
              />
              {!hasSpecs && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                  <Info size={13} className="mt-0.5 shrink-0" />
                  Enter at least height or weight to enable restriction checking.
                </div>
              )}
            </div>
          </div>

          {/* Route */}
          <div className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
              <RouteIcon size={15} className="text-orange-500" />
              <h2 className="text-sm font-semibold">Route</h2>
            </div>
            <div className="px-4 py-4 space-y-2">
              <GeoInput label="From" value={start} color="#f97316" onPick={setStart} onClear={() => setStart(undefined)} />
              <div className="flex items-center gap-2 px-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">to</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <GeoInput label="To" value={end} color="#ef4444" onPick={setEnd} onClear={() => setEnd(undefined)} />
            </div>

            <div className="border-t border-border px-4 pb-4 pt-3 space-y-2">
              <button
                onClick={plan}
                disabled={!start || !end || busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-40"
              >
                {busy ? <Loader2 className="animate-spin" size={15} /> : <Navigation size={15} />}
                {busy ? 'Routing…' : 'Plan route'}
              </button>
              {(start || end) && !busy && (
                <button onClick={reset} className="flex w-full items-center justify-center gap-1.5 text-sm text-muted hover:text-ink transition-colors py-1">
                  <RotateCcw size={13} /> Clear
                </button>
              )}
            </div>
          </div>

          {err && (
            <div className="flex items-start gap-2 rounded-xl border border-alert/30 bg-alert/5 px-3 py-3 text-sm text-alert">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {err}
            </div>
          )}

          {/* Restriction results */}
          {(scanning || restrictions.length > 0) && (
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
                <ShieldAlert size={15} className={violations.length > 0 ? 'text-alert' : 'text-emerald-500'} />
                <span className="text-sm font-semibold">
                  {scanning ? 'Checking bridge & weight restrictions…' : 'Restriction check'}
                </span>
                {scanning && <Loader2 size={13} className="animate-spin text-muted ml-auto" />}
              </div>

              {!scanning && (
                <div className="px-4 py-4 space-y-3">
                  {violations.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 size={15} className="shrink-0" />
                      No violations found — route looks clear for your truck.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-alert">
                        {violations.length} violation{violations.length > 1 ? 's' : ''} found
                      </p>
                      {violations.map(({ r, issues }, i) => (
                        <div key={i} className="rounded-xl border border-alert/25 bg-alert/5 px-3 py-3 space-y-1.5">
                          {r.name && <p className="text-xs font-semibold">{r.name}</p>}
                          {issues.map((issue, j) => (
                            <div key={j} className="flex items-start gap-2 text-xs text-alert">
                              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                              <span>{issue}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-muted">
                    {restrictions.length} restriction{restrictions.length !== 1 ? 's' : ''} found along route — click any marker on the map for details.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Route summary */}
          {meta && (
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center gap-4 bg-orange-50 dark:bg-orange-950/30 px-4 py-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-orange-700 dark:text-orange-300">
                  <RouteIcon size={14} /> {meta.km.toFixed(1)} km
                </div>
                <div className="h-4 w-px bg-orange-200" />
                <div className="flex items-center gap-1.5 text-sm font-semibold text-orange-700 dark:text-orange-300">
                  <Clock size={14} /> ~{meta.min} min driving
                </div>
              </div>
              <button
                onClick={() => setStepsOpen(v => !v)}
                className="flex w-full items-center justify-between px-4 py-3 hover:bg-bg transition-colors"
              >
                <span className="text-sm font-semibold">Turn-by-turn directions</span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  {steps.length} steps {stepsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>
              {stepsOpen && (
                <ol className="max-h-72 overflow-y-auto divide-y divide-border/50">
                  {steps.map((s, i) => {
                    const { verb, road, dist } = parseStep(s)
                    const isFirst = i === 0, isLast = i === steps.length - 1
                    return (
                      <li key={i} className="flex items-start gap-3 px-4 py-3 text-sm hover:bg-bg transition-colors">
                        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isFirst || isLast ? 'bg-orange-500 text-white' : 'border border-border bg-bg text-muted'}`}>
                          {isFirst ? <MapPin size={11} /> : isLast ? <Flag size={11} /> : <StepIcon verb={verb} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-tight">{verbLabel(verb)}</p>
                          {road && <p className="mt-0.5 truncate text-xs text-muted">{road}</p>}
                        </div>
                        {dist && (
                          <span className="shrink-0 rounded-md border border-border/60 bg-bg px-1.5 py-0.5 text-[11px] font-medium text-muted">
                            {fmtDist(dist)}
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
            <div className="rounded-xl border border-border/60 bg-card px-4 py-3 text-center text-xs text-muted">
              Fill in your truck specs above, then enter a start and destination to plan your route.
            </div>
          )}
        </div>

        {/* Map */}
        <div
          ref={elRef}
          className="h-[520px] cursor-crosshair overflow-hidden rounded-2xl border border-border shadow-sm lg:sticky lg:top-20 lg:h-[calc(100vh-100px)]"
        />
      </div>
    </Layout>
  )
}
