import { spaced } from './rateLimit'
import { overpassHedged, haversineKm } from './overpass'

/* ------------------------------------------------------------------ *
 * Accessible routing.
 *
 *  1. Valhalla (valhalla1.openstreetmap.de — free, global, key-less)
 *     computes the route with a real per-disability costing model:
 *     wheelchair routing refuses steps and caps slope, blind routing
 *     prefers sidewalks and lit ways, etc.
 *  2. The returned elevation profile is turned into slope segments and
 *     checked against ADA limits (5% running slope, 8.33% ramp max).
 *  3. OpenStreetMap is scanned along the line for barriers the router
 *     can't price: raised kerbs, crossings without signals or tactile
 *     paving, rough surfaces, gates, lifts that could be out of order.
 *  4. Everything is scored per profile so the UI can say *why*.
 *
 * If Valhalla is down we fall back to OSRM foot routing and say clearly
 * that the disability constraints could not be applied.
 * ------------------------------------------------------------------ */

export type ProfileId = 'wheelchair' | 'powerchair' | 'mobility' | 'blind' | 'walk'

export interface Profile {
  id: ProfileId
  label: string
  short: string
  desc: string
  /** Ladder of Valhalla pedestrian costing options — tried in order until one routes. */
  ladder: Record<string, unknown>[]
  ladderNotes: string[]
}

export const PROFILES: Profile[] = [
  {
    id: 'wheelchair', label: 'Manual wheelchair', short: 'Wheelchair',
    desc: 'No steps, slopes kept under 6%, prefers smooth paths',
    ladder: [
      { type: 'wheelchair', max_grade: 6, step_penalty: 100000, use_hills: 0, walking_speed: 3.5, sidewalk_factor: 0.9, use_tracks: 0 },
      { type: 'wheelchair', max_grade: 10, step_penalty: 100000, use_hills: 0, walking_speed: 3.5, use_tracks: 0 },
    ],
    ladderNotes: ['', 'No route exists under 6% slope here, so steeper sections up to 10% are included.'],
  },
  {
    id: 'powerchair', label: 'Power chair / scooter', short: 'Power chair',
    desc: 'No steps, slopes up to 10%, faster travel',
    ladder: [{ type: 'wheelchair', max_grade: 10, step_penalty: 100000, use_hills: 0.3, walking_speed: 5.5, use_tracks: 0 }],
    ladderNotes: [''],
  },
  {
    id: 'mobility', label: 'Cane, walker or low stamina', short: 'Walker',
    desc: 'Strongly avoids stairs and hills, slower pace',
    ladder: [{ type: 'foot', step_penalty: 60, use_hills: 0.05, walking_speed: 3.0, use_tracks: 0, sidewalk_factor: 0.9 }],
    ladderNotes: [''],
  },
  {
    id: 'blind', label: 'Blind or low vision', short: 'Low vision',
    desc: 'Sidewalks, lit streets, fewer complex crossings',
    ladder: [{ type: 'blind', walkway_factor: 0.8, sidewalk_factor: 0.8, alley_factor: 2, driveway_factor: 5, use_lit: 1, use_tracks: 0, walking_speed: 4.0 }],
    ladderNotes: [''],
  },
  {
    id: 'walk', label: 'Walking', short: 'Walk',
    desc: 'Fastest walking route',
    ladder: [{ type: 'foot' }],
    ladderNotes: [''],
  },
]

export const profileById = (id: ProfileId) => PROFILES.find((p) => p.id === id)!

export type Severity = 'block' | 'warn' | 'info' | 'good'

export interface Barrier {
  id: string
  kind: 'steps' | 'kerb' | 'crossing' | 'surface' | 'gate' | 'lift' | 'slope' | 'incline'
  title: string
  detail: string
  severity: Severity
  lat: number
  lng: number
  atM: number
}

export interface RouteStep {
  instruction: string
  verbal: string
  distanceM: number
  timeS: number
  type: number
  street?: string
  startM: number
  point: [number, number]
  barriers: Barrier[]
}

export interface SlopeSeg { fromM: number; toM: number; pct: number; lat: number; lng: number }

export interface RouteResult {
  profile: ProfileId
  engine: 'valhalla' | 'osrm'
  constraintsApplied: boolean
  coords: [number, number][]
  cumM: number[]
  distanceM: number
  durationS: number
  steps: RouteStep[]
  elevation: number[]
  elevationIntervalM: number
  climbM: number
  maxGradePct: number | null
  steepSegs: SlopeSeg[]
  barriers: Barrier[]
  barrierScan: 'pending' | 'ok' | 'skipped' | 'failed'
  score: number
  verdict: string
  notes: string[]
}

/* ── Geometry helpers ──────────────────────────────────────────── */

function decodePolyline(str: string, precision = 6): [number, number][] {
  const factor = 10 ** precision
  const out: [number, number][] = []
  let lat = 0, lng = 0, i = 0
  while (i < str.length) {
    let b, shift = 0, result = 0
    do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1
    shift = 0; result = 0
    do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1
    out.push([lat / factor, lng / factor])
  }
  return out
}

const mDist = (a: [number, number], b: [number, number]) => haversineKm(a, b) * 1000

function cumulative(coords: [number, number][]): number[] {
  const cum = [0]
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + mDist(coords[i - 1], coords[i]))
  return cum
}

/** Distance (m) from point p to the route, plus the distance along the route of the closest point. */
export function nearestOnRoute(p: [number, number], coords: [number, number][], cum: number[]): { d: number; atM: number; idx: number } {
  // Local equirectangular projection — accurate to centimetres over a few km.
  const k = Math.cos((p[0] * Math.PI) / 180)
  const toXY = (c: [number, number]) => [(c[1] - p[1]) * 111320 * k, (c[0] - p[0]) * 110540]
  let best = { d: Infinity, atM: 0, idx: 0 }
  for (let i = 0; i < coords.length - 1; i++) {
    const [ax, ay] = toXY(coords[i]); const [bx, by] = toXY(coords[i + 1])
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0
    const x = ax + t * dx, y = ay + t * dy
    const d = Math.hypot(x, y)
    if (d < best.d) best = { d, atM: cum[i] + t * (cum[i + 1] - cum[i]), idx: i }
  }
  return best
}

function pointAt(coords: [number, number][], cum: number[], m: number): [number, number] {
  for (let i = 1; i < cum.length; i++) {
    if (cum[i] >= m) {
      const t = (m - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1])
      return [coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]), coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1])]
    }
  }
  return coords[coords.length - 1]
}

/* ── Engines ───────────────────────────────────────────────────── */

const VALHALLA = 'https://valhalla1.openstreetmap.de/route'

class NoRouteError extends Error {}

async function valhalla(start: [number, number], end: [number, number], costing: Record<string, unknown>, signal?: AbortSignal) {
  await spaced('valhalla', 400)
  const res = await fetch(VALHALLA, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: [{ lat: start[0], lon: start[1] }, { lat: end[0], lon: end[1] }],
      costing: 'pedestrian',
      costing_options: { pedestrian: costing },
      elevation_interval: 30,
      directions_options: { units: 'kilometers', language: document.documentElement.lang || 'en-US' },
    }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.trip) {
    // 442 = no path within constraints; 171/170 = can't snap a location to a usable way.
    if (data?.error_code === 442 || data?.error_code === 171 || data?.error_code === 170) throw new NoRouteError(data.error)
    throw new Error(data?.error || `Valhalla HTTP ${res.status}`)
  }
  return data.trip
}

const OSRM_FOOT = [
  'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  'https://router.project-osrm.org/route/v1/foot',
]

async function osrm(start: [number, number], end: [number, number], signal?: AbortSignal) {
  await spaced('osrm', 600)
  let lastErr: Error = new Error('Routing failed')
  for (const base of OSRM_FOOT) {
    try {
      const res = await fetch(`${base}/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson&steps=true`, { signal })
      if (!res.ok) continue
      const data = await res.json()
      const r = data.routes?.[0]
      if (!r) { lastErr = new NoRouteError('No route found'); continue }
      return r
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e
      lastErr = e as Error
    }
  }
  throw lastErr
}

/* ── Barrier scan ──────────────────────────────────────────────── */

const ROUGH = /^(gravel|ground|dirt|grass|sand|mud|woodchips|earth|rock|pebblestone|unpaved)$/
const BUMPY = /^(cobblestone|sett|unhewn_cobblestone|compacted|fine_gravel|grass_paver|stepping_stones)$/

function severityFor(profile: ProfileId, kind: string, flavour: string): Severity | null {
  const chair = profile === 'wheelchair' || profile === 'powerchair'
  switch (kind) {
    case 'steps': return chair ? 'block' : profile === 'mobility' ? 'warn' : profile === 'blind' ? 'info' : null
    case 'kerb':
      if (flavour === 'raised') return chair ? 'block' : profile === 'mobility' ? 'warn' : profile === 'blind' ? 'info' : null
      if (flavour === 'rolled') return chair ? 'warn' : null
      return chair ? 'good' : null
    case 'surface':
      if (flavour === 'rough') return chair ? (profile === 'wheelchair' ? 'block' : 'warn') : profile === 'walk' ? null : 'warn'
      return chair || profile === 'mobility' || profile === 'blind' ? 'warn' : null
    case 'gate':
      if (flavour === 'impassable') return chair ? 'block' : profile === 'mobility' ? 'warn' : 'info'
      return chair ? 'warn' : profile === 'blind' ? 'info' : null
    case 'lift': return chair || profile === 'mobility' ? 'info' : null
    case 'crossing':
      if (profile === 'blind') return flavour === 'accessible' ? 'good' : 'warn'
      if (flavour === 'raised-kerb') return chair ? 'block' : null
      return null
    case 'incline': return chair || profile === 'mobility' ? 'warn' : null
  }
  return null
}

async function scanBarriers(coords: [number, number][], cum: number[], profile: ProfileId, signal?: AbortSignal, routerAvoidsSteps = false): Promise<Barrier[]> {
  const chair = profile === 'wheelchair' || profile === 'powerchair'
  let s = 90, w = 180, n = -90, e = -180
  for (const [la, ln] of coords) { s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, ln); e = Math.max(e, ln) }
  const pad = 0.0004
  const bb = `${s - pad},${w - pad},${n + pad},${e + pad}`
  const q = `[out:json][timeout:20][bbox:${bb}];
(
  way["highway"="steps"];
  node["kerb"];
  node["barrier"~"^(kerb|gate|bollard|stile|turnstile|kissing_gate|cycle_barrier|swing_gate|chain|block|lift_gate)$"];
  node["highway"="crossing"];
  node["highway"="elevator"];
  way["highway"~"^(footway|path|pedestrian|track|cycleway|living_street|service)$"]["surface"~"^(gravel|ground|dirt|grass|sand|mud|woodchips|earth|rock|pebblestone|unpaved|cobblestone|sett|unhewn_cobblestone|compacted|fine_gravel|grass_paver|stepping_stones)$"];
  way["highway"~"^(footway|path|pedestrian)$"]["incline"~"%"];
);
out tags geom qt 2000;`
  // One-off check per route: race the mirrors (staggered) inside checkBarriers' time cap.
  const data = await overpassHedged(q, signal)
  const out: Barrier[] = []
  const seen = new Set<string>()
  const add = (b: Omit<Barrier, 'severity'> & { flavour: string }) => {
    const sev = severityFor(profile, b.kind, b.flavour)
    if (!sev || seen.has(b.id)) return
    seen.add(b.id)
    const { flavour: _f, ...rest } = b
    out.push({ ...rest, severity: sev })
  }

  for (const el of (data?.elements ?? []) as any[]) {
    const t: Record<string, string> = el.tags ?? {}
    if (el.type === 'node') {
      const hit = nearestOnRoute([el.lat, el.lon], coords, cum)
      if (hit.d > 7) continue
      const base = { id: `n${el.id}`, lat: el.lat, lng: el.lon, atM: hit.atM }
      if (t.highway === 'crossing') {
        const signals = t.crossing === 'traffic_signals' || t.crossing_ref === 'pelican' || t.crossing_ref === 'toucan' || !!t['traffic_signals:sound']
        const sound = t['traffic_signals:sound'] === 'yes'
        const tactile = t.tactile_paving === 'yes'
        const kerb = (t.kerb || '').toLowerCase()
        const bits = [signals ? 'signalised' : 'no signals', sound ? 'audible signal' : null, tactile ? 'tactile paving' : t.tactile_paving === 'no' ? 'no tactile paving' : null, kerb ? `${kerb} kerb` : null].filter(Boolean)
        if (kerb === 'raised') add({ ...base, kind: 'crossing', flavour: 'raised-kerb', title: 'Crossing with raised kerb', detail: bits.join(' · ') })
        else add({ ...base, kind: 'crossing', flavour: signals && (sound || tactile) ? 'accessible' : 'plain', title: signals ? 'Signalised crossing' : 'Crossing without signals', detail: bits.join(' · ') || 'No crossing details mapped' })
      } else if (t.highway === 'elevator') {
        add({ ...base, kind: 'lift', flavour: '', title: 'Route uses a lift', detail: 'Check it is working before you set off' })
      } else if (t.kerb || t.barrier === 'kerb') {
        const k = (t.kerb || 'raised').toLowerCase()
        const flavour = k === 'flush' || k === 'lowered' || k === 'no' ? 'ok' : k === 'rolled' ? 'rolled' : 'raised'
        const h = t['kerb:height'] ? ` (${t['kerb:height']})` : ''
        add({ ...base, kind: 'kerb', flavour, title: flavour === 'ok' ? `${k[0].toUpperCase()}${k.slice(1)} kerb` : `${k[0].toUpperCase()}${k.slice(1)} kerb${h}`, detail: flavour === 'ok' ? 'Smooth transition' : 'A lip to get up or down' })
      } else if (t.barrier) {
        const impassable = /^(stile|turnstile|kissing_gate)$/.test(t.barrier)
        const label = t.barrier.replace(/_/g, ' ')
        const width = t.maxwidth || t.width
        const detail = impassable
          ? (chair ? 'Usually impassable in a wheelchair' : 'You may need to step over or squeeze through')
          : width ? `Gap ${width}` : 'May narrow the path'
        add({ ...base, kind: 'gate', flavour: impassable ? 'impassable' : 'narrow', title: `${label[0].toUpperCase()}${label.slice(1)} on the path`, detail })
      }
    } else if (el.type === 'way' && Array.isArray(el.geometry)) {
      const pts = el.geometry.map((g: any) => [g.lat, g.lon] as [number, number])
      const hits = pts.map((p: [number, number]) => nearestOnRoute(p, coords, cum)).filter((h: { d: number }) => h.d < 6)
      // A way counts as "on the route" when most of its vertices sit on the line —
      // so a flight of steps running *beside* a ramp the route uses isn't flagged.
      if (hits.length < Math.max(2, Math.ceil(pts.length * 0.7))) continue
      // Valhalla's wheelchair costing never routes over steps; anything matched is a parallel way.
      if (t.highway === 'steps' && routerAvoidsSteps) continue
      const atM = Math.min(...hits.map((h: { atM: number }) => h.atM))
      const mid = pointAt(coords, cum, atM)
      const base = { id: `w${el.id}`, lat: mid[0], lng: mid[1], atM }
      if (t.highway === 'steps') {
        const n = t.step_count ? `${t.step_count} steps` : 'Steps'
        const rail = t.handrail === 'yes' || t['handrail:left'] === 'yes' || t['handrail:right'] === 'yes'
        const ramp = t['ramp:wheelchair'] === 'yes' || t.ramp === 'yes'
        add({ ...base, kind: 'steps', flavour: '', title: n, detail: [rail ? 'handrail' : 'no handrail mapped', ramp ? 'wheelchair ramp alongside' : null].filter(Boolean).join(' · ') })
      } else if (t.incline && /%/.test(t.incline)) {
        const pct = Math.abs(parseFloat(t.incline))
        if (pct > 5) add({ ...base, kind: 'incline', flavour: '', title: `${pct}% incline`, detail: 'Mapped slope on this path' })
      } else if (t.surface) {
        const sfc = t.surface.toLowerCase()
        const flavour = ROUGH.test(sfc) ? 'rough' : BUMPY.test(sfc) ? 'bumpy' : ''
        if (flavour) {
          const len = hits.length > 1 ? Math.abs(hits[hits.length - 1].atM - hits[0].atM) : 0
          add({ ...base, kind: 'surface', flavour, title: `${sfc.replace(/_/g, ' ')[0].toUpperCase()}${sfc.replace(/_/g, ' ').slice(1)} surface`, detail: `${flavour === 'rough' ? 'Unpaved' : 'Uneven'}${len > 10 ? ` for about ${Math.round(len)} m` : ''}` })
        }
      }
    }
  }
  return out.sort((a, b) => a.atM - b.atM)
}

/* ── Slope analysis ────────────────────────────────────────────── */

function slopes(elev: number[], interval: number, coords: [number, number][], cum: number[], profile: ProfileId) {
  let climb = 0
  let maxG: number | null = null
  const steep: SlopeSeg[] = []
  // Smooth over 2 samples (~60 m) — terrain data is ~30 m resolution and noisy point-to-point.
  const limit = profile === 'powerchair' ? 8.33 : profile === 'walk' || profile === 'blind' ? 10 : 5
  for (let i = 0; i + 2 < elev.length; i++) {
    const dh = elev[i + 2] - elev[i]
    const g = (Math.abs(dh) / (2 * interval)) * 100
    if (maxG == null || g > maxG) maxG = g
    if (elev[i + 1] > elev[i]) climb += elev[i + 1] - elev[i]
    if (g > limit) {
      const fromM = i * interval
      const last = steep[steep.length - 1]
      if (last && fromM <= last.toM) { last.toM = fromM + 2 * interval; last.pct = Math.max(last.pct, g) }
      else {
        const p = pointAt(coords, cum, fromM + interval)
        steep.push({ fromM, toM: fromM + 2 * interval, pct: g, lat: p[0], lng: p[1] })
      }
    }
  }
  if (elev.length >= 2) { const i = elev.length - 2; if (elev[i + 1] > elev[i]) climb += elev[i + 1] - elev[i] }
  return { climb: Math.round(climb), maxG: maxG == null ? null : Math.round(maxG * 10) / 10, steep }
}

/* ── Public API ────────────────────────────────────────────────── */

export async function planRoute(
  start: [number, number], end: [number, number], profileId: ProfileId, signal?: AbortSignal,
): Promise<RouteResult> {
  const profile = profileById(profileId)
  const notes: string[] = []
  let trip: any = null
  let engine: RouteResult['engine'] = 'valhalla'
  let constraintsApplied = true
  let lastErr: unknown

  for (let i = 0; i < profile.ladder.length; i++) {
    try {
      trip = await valhalla(start, end, profile.ladder[i], signal)
      if (profile.ladderNotes[i]) notes.push(profile.ladderNotes[i])
      break
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e
      lastErr = e
      if (!(e instanceof NoRouteError)) break // server problem — no point trying looser constraints
    }
  }

  let coords: [number, number][]
  let steps: RouteStep[] = []
  let distanceM: number, durationS: number
  let elevation: number[] = []
  let interval = 30

  if (trip) {
    const leg = trip.legs[0]
    coords = decodePolyline(leg.shape, 6)
    const cum = cumulative(coords)
    distanceM = trip.summary.length * 1000
    durationS = trip.summary.time
    elevation = (leg.elevation ?? []).filter((v: number | null) => v != null)
    interval = leg.elevation_interval ?? 30
    steps = leg.maneuvers.map((m: any) => ({
      instruction: m.instruction,
      verbal: m.verbal_pre_transition_instruction || m.instruction,
      distanceM: Math.round(m.length * 1000),
      timeS: m.time,
      type: m.type,
      street: m.street_names?.join(' / '),
      startM: cum[m.begin_shape_index] ?? 0,
      point: coords[m.begin_shape_index] ?? coords[0],
      barriers: [],
    }))
  } else {
    if (lastErr instanceof NoRouteError && profileId !== 'walk') {
      throw new NoRouteError(
        profileId === 'wheelchair' || profileId === 'powerchair'
          ? 'No step-free route was found between these points. One end may only be reachable by stairs — try a nearby entrance or street corner.'
          : 'No route was found between these points.',
      )
    }
    const r = await osrm(start, end, signal)
    engine = 'osrm'
    constraintsApplied = profileId === 'walk'
    if (!constraintsApplied) notes.push('The accessible routing service is unavailable, so this is a standard walking route. Steps and slopes were NOT avoided — check the warnings below carefully.')
    coords = r.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]])
    distanceM = r.distance
    durationS = r.duration
    let at = 0
    steps = (r.legs?.[0]?.steps ?? []).map((s: any) => {
      const type = s.maneuver?.type ?? 'continue'
      const mod = s.maneuver?.modifier ? ` ${s.maneuver.modifier}` : ''
      const text = type === 'depart' ? `Head${mod} on ${s.name || 'the path'}`
        : type === 'arrive' ? 'You have arrived'
        : `${type[0].toUpperCase()}${type.slice(1)}${mod}${s.name ? ` onto ${s.name}` : ''}`
      const step: RouteStep = {
        instruction: text, verbal: text, distanceM: Math.round(s.distance), timeS: s.duration, type: 0,
        street: s.name || undefined, startM: at, point: [s.maneuver.location[1], s.maneuver.location[0]], barriers: [],
      }
      at += s.distance
      return step
    })
  }

  const cum = cumulative(coords)
  const sl = slopes(elevation, interval, coords, cum, profileId)

  // Slopes become barriers too, so they show on the map and in the steps.
  const slopeLimitBlock = profileId === 'wheelchair' ? 8.33 : profileId === 'powerchair' ? 12 : 99
  const slopeBarriers: Barrier[] = profileId === 'walk' ? [] : sl.steep.map((s, i) => ({
    id: `slope${i}`, kind: 'slope' as const, lat: s.lat, lng: s.lng, atM: s.fromM,
    severity: (s.pct > slopeLimitBlock ? 'block' : 'warn') as Severity,
    title: `Steep slope ≈${Math.round(s.pct)}%`,
    detail: `About ${Math.round(s.toM - s.fromM)} m · estimated from terrain data${s.pct > 8.33 ? ' · steeper than a legal ramp' : ''}`,
  }))

  const tooLong = distanceM > 12000
  if (tooLong) notes.push('Route is over 12 km, so kerbs and crossings along it were not checked individually.')

  return finalize({
    profile: profileId, engine, constraintsApplied, coords, cumM: cum, distanceM, durationS, steps,
    elevation, elevationIntervalM: interval, climbM: sl.climb, maxGradePct: sl.maxG, steepSegs: sl.steep,
    barriers: slopeBarriers, barrierScan: tooLong ? 'skipped' : 'pending', score: 0, verdict: '', notes,
  })
}

/** Attach barriers to steps and (re)compute score + verdict. */
function finalize(r: RouteResult): RouteResult {
  const barriers = [...r.barriers].sort((a, b) => a.atM - b.atM)
  const steps = r.steps.map((s) => ({ ...s, barriers: [] as Barrier[] }))
  for (const b of barriers) {
    let idx = 0
    for (let i = 0; i < steps.length; i++) if (steps[i].startM <= b.atM + 1) idx = i
    steps[idx]?.barriers.push(b)
  }
  const blocks = barriers.filter((b) => b.severity === 'block').length
  const warns = barriers.filter((b) => b.severity === 'warn').length
  const checked = r.barrierScan === 'ok'
  const score = Math.max(0, Math.min(100, 100 - blocks * 25 - warns * 6 - (r.constraintsApplied ? 0 : 15) - (checked || r.barrierScan === 'pending' ? 0 : 5)))
  const who = profileById(r.profile).short.toLowerCase()
  const verdict = blocks
    ? `${blocks} likely barrier${blocks > 1 ? 's' : ''} for ${who} users on this route`
    : warns
      ? `Usable with care — ${warns} thing${warns > 1 ? 's' : ''} to watch for`
      : checked
        ? 'No known barriers on this route'
        : 'No barriers found so far'
  return { ...r, barriers, steps, score, verdict }
}

/**
 * Second pass: scan OpenStreetMap along the route for kerbs, crossings,
 * surfaces, gates and lifts. Capped at ~30 s so a busy server can't hang
 * the UI — the route is already shown while this runs.
 */
export async function checkBarriers(r: RouteResult, signal?: AbortSignal): Promise<RouteResult> {
  if (r.barrierScan !== 'pending') return r
  const ac = new AbortController()
  const onAbort = () => ac.abort()
  signal?.addEventListener('abort', onAbort)
  const cap = setTimeout(() => ac.abort(), 30000)
  try {
    const routerAvoidsSteps = r.engine === 'valhalla' && r.constraintsApplied && (r.profile === 'wheelchair' || r.profile === 'powerchair')
    const found = await scanBarriers(r.coords, r.cumM, r.profile, ac.signal, routerAvoidsSteps)
    return finalize({ ...r, barriers: [...r.barriers, ...found], barrierScan: 'ok' })
  } catch (e) {
    if (signal?.aborted) throw e
    return finalize({
      ...r, barrierScan: 'failed',
      notes: [...r.notes, `Could not check kerbs, crossings and surfaces along the route right now (map data server busy).${
        r.constraintsApplied && (r.profile === 'wheelchair' || r.profile === 'powerchair') ? ' Steps were still avoided by the router.' : ''}`],
    })
  } finally {
    clearTimeout(cap)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Plain walking distance, used to explain detours ("adds 240 m to avoid steps"). */
export async function walkingDistance(start: [number, number], end: [number, number], signal?: AbortSignal): Promise<number | null> {
  try {
    const t = await valhalla(start, end, { type: 'foot' }, signal)
    return t.summary.length * 1000
  } catch { return null }
}

export function fmtDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 5) * 5} m`
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`
}

export function fmtDuration(s: number): string {
  const min = Math.round(s / 60)
  if (min < 60) return `${Math.max(1, min)} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}

export { NoRouteError }
