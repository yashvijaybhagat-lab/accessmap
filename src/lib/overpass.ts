import {
  Utensils, Coffee, Hotel, Cross, Pill, GraduationCap, ShoppingBag,
  Landmark, TreePine, Banknote, type LucideIcon,
} from 'lucide-react'
import { spaced } from './rateLimit'
import { batchWikiImages } from './wikipedia'

export interface ScoreBreakdown {
  base: number | null
  baseReason: string
  bonuses: { label: string; points: number }[]
  penalties: { label: string; points: number }[]
  total: number | null
  confidence: 'high' | 'medium' | 'low' | 'none'
}

export interface Poi {
  id: string
  osmId: string
  name: string
  lat: number
  lng: number
  category: CategoryKey
  address?: string
  // Core accessibility
  wheelchair?: 'yes' | 'limited' | 'no'
  accessScore: number | null
  accessLabel: string
  breakdown: ScoreBreakdown
  // Surface / terrain
  terrain: string
  surface?: string
  // Ramp
  hasRamp?: boolean
  rampGradient?: number       // % incline
  rampWidthCm?: number        // cm
  rampHasHandrail?: boolean
  rampNote?: string
  // Steps / kerb
  stepCount?: number          // steps at entrance
  stepHeightCm?: number       // cm per step
  kerbType?: string           // flush | lowered | raised | etc.
  // Door / entrance
  doorType?: string           // Automatic | Manual
  doorWidthCm?: number        // cm clear width
  entranceLevel?: string      // floor/level of accessible entrance
  // Lift / elevator
  hasLift?: boolean
  liftWidthCm?: number        // cm door width
  liftDepthCm?: number        // cm cabin depth
  // Toilet
  accessibleToilet: boolean
  // Parking
  hasDisabledParking?: boolean
  disabledParkingSpaces?: number
  // Navigation aids
  tactile: boolean
  hearingLoop?: boolean
  brailleMenu?: boolean
  visualImpaired?: boolean
  // Seating / space
  hasWheelchairSeating?: boolean
  wheelchairSeatingCount?: number
  corridorWidthCm?: number
  // Sensory
  quietRoom?: boolean
  changingPlace?: boolean
  allowsAssistanceDogs?: boolean
  // Extra info
  openingHours?: string
  phone?: string
  website?: string
  imageUrl?: string
  wheelchairDescription?: string
  /** Raw OSM tags — used to build the plain-language description. */
  tags?: Record<string, string>
  /** Number of AccessMap community reports folded into this place's rating. */
  communityReports?: number
}

const SMOOTH = ['asphalt', 'paved', 'concrete', 'paving_stones', 'wood', 'metal', 'rubber', 'tartan', 'tiles']
const UNEVEN = ['sett', 'cobblestone', 'unhewn_cobblestone', 'compacted', 'fine_gravel', 'pebblestone', 'bricks', 'stone']
const ROUGH  = ['gravel', 'ground', 'dirt', 'grass', 'sand', 'earth', 'mud', 'rock', 'woodchips']

function terrainFrom(tags: Record<string, string>): { terrain: string; surface?: string } {
  const surface = (tags.surface || '').toLowerCase() || undefined
  if (!surface) {
    const sm = (tags.smoothness || '').toLowerCase()
    if (['excellent', 'good'].includes(sm)) return { terrain: 'Smooth', surface }
    if (['intermediate'].includes(sm)) return { terrain: 'Uneven', surface }
    if (['bad', 'very_bad', 'horrible', 'very_horrible', 'impassable'].includes(sm)) return { terrain: 'Rough', surface }
    return { terrain: 'Unknown', surface }
  }
  if (SMOOTH.includes(surface)) return { terrain: 'Smooth', surface }
  if (UNEVEN.includes(surface)) return { terrain: 'Uneven', surface }
  if (ROUGH.includes(surface)) return { terrain: 'Rough', surface }
  return { terrain: 'Unknown', surface }
}

/**
 * Honest accessibility scoring from OSM tags.
 *
 * Base scores (NOT inflated):
 *   wheelchair=yes     → 6.0  (confirmed accessible entry, not perfect)
 *   wheelchair=limited → 3.0  (some barriers exist)
 *   wheelchair=no      → 1.0  (hard cap at 2.5 even with bonuses)
 *   inferred smooth    → 4.0  (low confidence)
 *   inferred uneven    → 2.5
 *   inferred rough     → 1.5
 *   no data            → null (shown as Unrated)
 */
// Category-level priors applied when OSM has wheelchair=yes but no detail tags.
// These reflect legally-mandated or statistically typical accessibility for the venue type.
const CATEGORY_PRIORS: Partial<Record<CategoryKey, {
  inferLift?: boolean
  inferToilet?: boolean
  inferParking?: boolean
  // Base score for when ZERO accessibility data exists (no wheelchair tag, no surface)
  // These are conservative real-world averages, not optimistic guesses
  unratedBase: number
  unratedReason: string
}>> = {
  hospital:   { inferLift: true,  inferToilet: true,  inferParking: true,  unratedBase: 7.0, unratedReason: 'Healthcare facility — legally required to meet accessibility standards' },
  pharmacy:   { inferToilet: false, inferParking: false, unratedBase: 5.5, unratedReason: 'Pharmacy — typically accessible entrance required by regulation' },
  hotel:      { inferLift: true,  unratedBase: 5.5, unratedReason: 'Hotel — usually has at least one accessible room and lift' },
  bank:       { unratedBase: 5.0, unratedReason: 'Bank/ATM — typically step-free entrance required' },
  school:     { unratedBase: 4.5, unratedReason: 'School — public building, accessibility varies widely' },
  shop:       { unratedBase: 4.0, unratedReason: 'Retail shop — accessibility varies; assume basic entrance' },
  restaurant: { unratedBase: 3.5, unratedReason: 'Restaurant — accessibility highly variable' },
  cafe:       { unratedBase: 3.5, unratedReason: 'Café — accessibility highly variable' },
  park:       { unratedBase: 3.0, unratedReason: 'Park — surface varies; many parks have paved paths but not all' },
  attraction: { unratedBase: 4.5, unratedReason: 'Tourist attraction — modern ones tend to be accessible; older ones vary' },
}

/**
 * Parse OSM measurement strings to centimetres.
 * "0.9 m" → 90, "90 cm" → 90, "90" → 90, "0.9" → 90
 * Rules:
 *   - explicit "m" unit (not "cm") → multiply by 100
 *   - explicit "cm" → use as-is
 *   - no unit: values < 5 are almost certainly metres → × 100; ≥ 5 are cm
 */
function parseCm(raw: string): number | null {
  if (!raw) return null
  const lower = raw.toLowerCase()
  const v = parseFloat(raw.replace(/[^0-9.]/g, ''))
  if (isNaN(v) || v <= 0) return null
  if (lower.includes('cm')) return Math.round(v)
  if (lower.includes('m')) return Math.round(v * 100)
  // No unit — OSM convention: small decimals are metres, integers ≥ 5 are cm
  return v < 5 ? Math.round(v * 100) : Math.round(v)
}

export function deriveAccess(tags: Record<string, string>, category?: CategoryKey): Omit<Poi,
  'id' | 'osmId' | 'name' | 'lat' | 'lng' | 'category' | 'address'
  | 'imageUrl' | 'openingHours' | 'phone' | 'website' | 'wheelchairDescription'
> {
  const wRaw = (tags.wheelchair || '').toLowerCase()
  const wheelchair = (['yes', 'limited', 'no'].includes(wRaw) ? wRaw : undefined) as Poi['wheelchair']
  const accessibleToilet = (tags['toilets:wheelchair'] || tags['wheelchair:toilets'] || '').toLowerCase() === 'yes'
  const tactile = (tags.tactile_paving || '').toLowerCase() === 'yes'
  const { terrain, surface } = terrainFrom(tags)

  // ── Ramp ─────────────────────────────────────────────────────────
  const rampRaw = (tags['ramp:wheelchair'] || tags['ramp:wheelchair:access'] || tags.ramp || '').toLowerCase()
  const hasRamp = ['yes', 'up', 'down', 'both', 'separate'].includes(rampRaw)
  const rampNote = tags['ramp:wheelchair:description'] || tags['ramp:description'] || undefined

  const inclineRaw = parseFloat((tags.incline || tags['ramp:incline'] || '').replace(/[%°]/g, ''))
  const rampGradient = !isNaN(inclineRaw) ? Math.abs(inclineRaw) : undefined
  const steepIncline = rampGradient != null && rampGradient > 8

  const rampWidthRaw = tags['ramp:width'] || tags['ramp:wheelchair:width'] || tags['ramp:wheelchair:width:left'] || tags['ramp:wheelchair:width:right']
  const rampWidthCm = rampWidthRaw ? parseCm(rampWidthRaw) : undefined
  const handrailRaw = (tags['ramp:handrail'] || tags['ramp:wheelchair:handrail'] || tags.handrail || '').toLowerCase()
  const rampHasHandrail = ['yes', 'both', 'left', 'right'].includes(handrailRaw) ? true
    : handrailRaw === 'no' ? false : undefined

  // ── Steps / kerb ─────────────────────────────────────────────────
  const stepCountRaw = parseInt(tags.step_count || tags['entrance:step_count'] || tags['steps:count'] || tags['step_count:up'] || '')
  const stepCount = !isNaN(stepCountRaw) ? stepCountRaw : undefined
  const stepHeightRaw = tags.step_height || tags['entrance:step_height'] || tags['kerb:height'] || tags['step:height']
  const stepHeightCm = stepHeightRaw ? parseCm(stepHeightRaw) : undefined
  // Normalize kerb type values
  const kerbRaw = tags.kerb || tags.curb || tags['kerb:type'] || undefined
  const kerbType = kerbRaw ? kerbRaw.replace(/_/g, ' ') : undefined

  // ── Door / entrance ───────────────────────────────────────────────
  const doorRaw = (tags.automatic_door || tags['door:automatic'] || tags['entrance:automatic_door'] || '').toLowerCase()
  const doorType = doorRaw === 'yes' || doorRaw === 'button' || doorRaw === 'motion' || doorRaw === 'sensor'
    ? 'Automatic'
    : (tags.door === 'hinged' || tags.door === 'manual' || tags.door === 'swing') ? 'Manual'
    : (tags.door === 'revolving') ? 'Revolving'
    : undefined
  // Only use specific door-width tags — never the generic 'width' (road/path width)
  const doorWidthRaw = tags['door:width'] || tags['entrance:width'] || tags['door:width:clear']
  const doorWidthCm = doorWidthRaw ? parseCm(doorWidthRaw) : undefined
  const entranceLevel = tags.level || tags['entrance:level'] || tags['access:level'] || undefined

  // ── Lift / elevator ───────────────────────────────────────────────
  const liftRaw = (tags.lift || tags.elevator || tags['elevator:access'] || tags['lift:access'] || '').toLowerCase()
  const hasLift = liftRaw === 'yes' || liftRaw === 'wheelchair'
    || (tags.highway === 'elevator')
  const liftWidthCm = parseCm(tags['lift:width'] || tags['elevator:width'] || tags['lift:door:width'] || '') || undefined
  const liftDepthCm = parseCm(tags['lift:depth'] || tags['elevator:depth'] || tags['lift:length'] || '') || undefined

  // ── Parking ───────────────────────────────────────────────────────
  const parkingRaw = tags['parking:disabled'] || tags['capacity:disabled'] || tags['amenity:parking:disabled'] || ''
  const hasDisabledParking = !!parkingRaw && parkingRaw !== 'no' && parkingRaw !== '0'
  const disabledParkingSpaces = (() => {
    const n = parseInt(tags['capacity:disabled'] || tags['parking:disabled:count'] || '')
    return !isNaN(n) && n > 0 ? n : undefined
  })()

  // ── Additional accessibility details ──────────────────────────────
  const hearingLoop = (tags['hearing_loop'] || tags['deaf:loop'] || tags['induction_loop'] || '').toLowerCase() === 'yes'
  const brailleMenu = (tags['menu:braille'] || tags['braille'] || tags['braille:menu'] || '').toLowerCase() === 'yes'
  const visualImpaired = (tags['blind:sign'] || tags['tactile_writing'] || tags['speech_output'] || '').toLowerCase() === 'yes'
  const wheelchairSeating = (tags['wheelchair:seating'] || tags['capacity:wheelchair'] || tags['seating:wheelchair'] || '')
  const hasWheelchairSeating = !!wheelchairSeating && wheelchairSeating !== 'no' && wheelchairSeating !== '0'
  const wheelchairSeatingCount = (() => {
    const n = parseInt(tags['capacity:wheelchair'] || tags['seating:wheelchair'] || '')
    return !isNaN(n) && n > 0 ? n : undefined
  })()
  const quietRoom = (tags['quiet_room'] || tags['sensory_room'] || '').toLowerCase() === 'yes'
  const changingPlace = (tags['changing_place'] || tags['changing_table:wheelchair'] || '').toLowerCase() === 'yes'
  const assistanceAnimals = (tags['assistance_dog'] || tags['dog'] || '').toLowerCase()
  const allowsAssistanceDogs = assistanceAnimals === 'yes' || assistanceAnimals === 'allowed'
  // Only use corridor-specific width tags — not the generic 'width'
  const corridorWidthCm = parseCm(tags['min_width'] || tags['wheelchair:width'] || '') || undefined

  // ── Base ─────────────────────────────────────────────────────────
  let base: number | null = null
  let baseReason = ''
  let confidence: ScoreBreakdown['confidence'] = 'none'
  let inferred = false

  if (wheelchair === 'yes') {
    base = 6.0; baseReason = 'Confirmed wheelchair accessible'; confidence = 'high'
  } else if (wheelchair === 'limited') {
    base = 3.0; baseReason = 'Partially accessible — barriers present'; confidence = 'high'
  } else if (wheelchair === 'no') {
    base = 1.0; baseReason = 'Marked as not accessible'; confidence = 'high'
  } else if (terrain === 'Smooth') {
    base = 4.0; baseReason = 'Smooth surface (accessibility unconfirmed)'; confidence = 'low'; inferred = true
  } else if (terrain === 'Uneven') {
    base = 2.5; baseReason = 'Uneven surface — likely difficult'; confidence = 'low'; inferred = true
  } else if (terrain === 'Rough') {
    base = 1.5; baseReason = 'Rough/unpaved — likely inaccessible'; confidence = 'low'; inferred = true
  }

  // ── Category-based priors ─────────────────────────────────────────
  const prior = category ? CATEGORY_PRIORS[category] : undefined
  // When there is NO accessibility data at all, assign a category-based estimated score
  if (base === null) {
    base = prior?.unratedBase ?? 3.0
    baseReason = prior?.unratedReason ?? 'No accessibility data — estimated from venue type'
    confidence = 'low'
    inferred = true
  }

  // Resolve effective flags (real tag OR category prior)
  const effectiveLift    = hasLift    || (!hasLift    && wheelchair === 'yes' && !!prior?.inferLift)
  const effectiveToilet  = accessibleToilet || (!accessibleToilet && wheelchair === 'yes' && !!prior?.inferToilet)
  const effectiveParking = hasDisabledParking || (!hasDisabledParking && wheelchair === 'yes' && !!prior?.inferParking)

  // ── Bonuses ───────────────────────────────────────────────────────
  const bonuses: { label: string; points: number }[] = []
  if (base !== null && wheelchair !== 'no') {
    if (effectiveToilet)   bonuses.push({ label: accessibleToilet ? 'Accessible toilet ✓' : 'Accessible toilet (typical for this venue) ✓', points: 1.0 })
    if (tactile)           bonuses.push({ label: 'Tactile paving ✓', points: 0.5 })
    if (terrain === 'Smooth' && !inferred) bonuses.push({ label: 'Smooth flooring ✓', points: 0.5 })
    if (hasRamp && wheelchair !== 'yes') bonuses.push({ label: 'Ramp present ✓', points: 0.5 })
    if (effectiveLift)     bonuses.push({ label: hasLift ? 'Lift/elevator ✓' : 'Lift (typical for this venue) ✓', points: 0.5 })
    if (doorType === 'Automatic') bonuses.push({ label: 'Automatic doors ✓', points: 0.3 })
    if (effectiveParking)  bonuses.push({ label: hasDisabledParking ? 'Disabled parking ✓' : 'Disabled parking (typical) ✓', points: 0.2 })
    if (hearingLoop)       bonuses.push({ label: 'Hearing loop ✓', points: 0.3 })
    if (hasWheelchairSeating) bonuses.push({ label: 'Wheelchair seating available ✓', points: 0.2 })
    if (changingPlace)     bonuses.push({ label: 'Changing Place facility ✓', points: 0.5 })
    if (quietRoom)         bonuses.push({ label: 'Quiet / sensory room ✓', points: 0.3 })
  }

  // ── Penalties ─────────────────────────────────────────────────────
  const penalties: { label: string; points: number }[] = []
  if (base !== null) {
    if (wheelchair === 'yes' && terrain === 'Rough')
      penalties.push({ label: 'Rough surface despite accessible tag ⚠', points: -1.5 })
    else if (wheelchair === 'yes' && terrain === 'Uneven')
      penalties.push({ label: 'Uneven/irregular surface ⚠', points: -0.5 })
    if (surface && (surface.includes('cobblestone') || surface === 'sett'))
      penalties.push({ label: 'Cobblestone surface ⚠', points: -0.5 })
    if (steepIncline)
      penalties.push({ label: `Steep incline (${Math.abs(inclineRaw).toFixed(0)}%) ⚠`, points: -0.5 })
  }

  // ── Total ─────────────────────────────────────────────────────────
  let total: number | null = null
  if (base !== null) {
    const s = bonuses.reduce((acc, b) => acc + b.points, 0)
         + penalties.reduce((acc, p) => acc + p.points, 0)
    total = base + s
    if (wheelchair === 'no') total = Math.min(total, 2.5)
    total = Math.max(0, Math.min(10, Math.round(total * 10) / 10))
    if (!inferred && (bonuses.length >= 2 || wheelchair === 'yes')) confidence = 'high'
    else if (!inferred) confidence = 'medium'
    else confidence = bonuses.length > 0 ? 'low' : 'none'
  }

  const accessLabel =
      wheelchair === 'no' ? 'Not accessible'
    : total != null && total >= 8.5 ? 'Fully accessible'
    : total != null && total >= 6.5 ? 'Accessible'
    : total != null && total >= 4.5 ? 'Partly accessible'
    : total != null && total >= 2.5 ? 'Limited access'
    : total != null ? 'Poor access'
    : 'Unrated'

  return {
    wheelchair, accessScore: total, accessLabel,
    breakdown: { base, baseReason, bonuses, penalties, total, confidence },
    terrain, surface,
    // Ramp
    hasRamp,
    rampGradient,
    rampWidthCm: rampWidthCm ?? undefined,
    rampHasHandrail,
    rampNote,
    // Steps / kerb
    stepCount,
    stepHeightCm: stepHeightCm ?? undefined,
    kerbType,
    // Door / entrance
    doorType,
    doorWidthCm: doorWidthCm ?? undefined,
    entranceLevel,
    // Lift
    hasLift: effectiveLift,
    liftWidthCm,
    liftDepthCm,
    // Toilet
    accessibleToilet: effectiveToilet,
    // Parking
    hasDisabledParking: effectiveParking,
    disabledParkingSpaces,
    // Navigation / sensory
    tactile,
    hearingLoop: hearingLoop || undefined,
    brailleMenu: brailleMenu || undefined,
    visualImpaired: visualImpaired || undefined,
    hasWheelchairSeating: hasWheelchairSeating || undefined,
    wheelchairSeatingCount,
    corridorWidthCm,
    quietRoom: quietRoom || undefined,
    changingPlace: changingPlace || undefined,
    allowsAssistanceDogs: allowsAssistanceDogs || undefined,
  }
}

export type CategoryKey =
  | 'restaurant' | 'cafe' | 'hotel' | 'hospital' | 'pharmacy'
  | 'school' | 'shop' | 'park' | 'bank' | 'attraction'

export const CATEGORIES: { key: CategoryKey; label: string; icon: LucideIcon; selector: string; color: string }[] = [
  { key: 'restaurant', label: 'Restaurants', icon: Utensils,      selector: '["amenity"="restaurant"]', color: '#ea4335' },
  { key: 'cafe',       label: 'Coffee',       icon: Coffee,        selector: '["amenity"="cafe"]',       color: '#f29900' },
  { key: 'hotel',      label: 'Hotels',       icon: Hotel,         selector: '["tourism"="hotel"]',      color: '#1a73e8' },
  { key: 'hospital',   label: 'Hospitals',    icon: Cross,         selector: '["amenity"="hospital"]',   color: '#d33b8f' },
  { key: 'pharmacy',   label: 'Pharmacies',   icon: Pill,          selector: '["amenity"="pharmacy"]',   color: '#1e8e3e' },
  { key: 'shop',       label: 'Shopping',     icon: ShoppingBag,   selector: '["shop"]["shop"!="no"]',   color: '#9334e6' },
  { key: 'school',     label: 'Schools',      icon: GraduationCap, selector: '["amenity"="school"]',     color: '#e37400' },
  { key: 'attraction', label: 'Attractions',  icon: Landmark,      selector: '["tourism"="attraction"]', color: '#12b5cb' },
  { key: 'park',       label: 'Parks',        icon: TreePine,      selector: '["leisure"="park"]',       color: '#34a853' },
  { key: 'bank',       label: 'ATMs & Banks', icon: Banknote,      selector: '["amenity"="bank"]',       color: '#5f6368' },
]

export const categoryColor = (k: CategoryKey): string =>
  CATEGORIES.find((c) => c.key === k)?.color ?? '#ea4335'

function wikimediaThumb(id: string): string | undefined {
  const file = id.replace(/^(File:|Category:)/, '').trim()
  if (!file) return undefined
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=400`
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
]

/**
 * Overpass lookup used across the app: mirrors are raced (staggered) and the
 * whole lookup is capped at `budgetMs`, so a busy public server can't leave
 * the UI spinning — callers fall back gracefully on failure.
 */
export async function overpassQuery(q: string, signal?: AbortSignal, budgetMs = 15000): Promise<any> {
  const ac = new AbortController()
  const onAbort = () => ac.abort()
  signal?.addEventListener('abort', onAbort)
  const timer = setTimeout(() => ac.abort(), budgetMs)
  try {
    return await overpassHedged(q, ac.signal, 2500)
  } catch (e) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw e instanceof DOMException ? new Error('Overpass timed out') : e
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Hedged query: start the first mirror, then another every `staggerMs` until
 * one answers. Used for one-off checks (route scans) where waiting on a single
 * overloaded server would blow the time budget. Losing requests are aborted.
 */
export async function overpassHedged(q: string, signal?: AbortSignal, staggerMs = 4000): Promise<any> {
  const body = 'data=' + encodeURIComponent(q)
  const controllers: AbortController[] = []
  let settled = false
  const onAbort = () => controllers.forEach((c) => c.abort())
  signal?.addEventListener('abort', onAbort)
  try {
    return await Promise.any(OVERPASS_ENDPOINTS.map(async (endpoint, i) => {
      if (i) {
        // Abortable wait, so a caller's time budget ends the whole race promptly.
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, i * staggerMs)
          signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
        })
      }
      // Another mirror already answered (or the caller gave up) — don't start this one.
      if (settled || signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const ac = new AbortController(); controllers.push(ac)
      const res = await fetch(endpoint, { method: 'POST', body, signal: ac.signal })
      if (!res.ok) throw new Error(`Overpass ${res.status}`)
      return res.json()
    }))
  } catch (e) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw e instanceof AggregateError ? new Error('All Overpass endpoints failed') : e
  } finally {
    settled = true
    controllers.forEach((c) => c.abort())
    signal?.removeEventListener('abort', onAbort)
  }
}

export async function nearbyByCategory(
  center: [number, number],
  category: CategoryKey,
  radius = 2000,
  signal?: AbortSignal,
  budgetMs = 15000,
): Promise<{ pois: Poi[]; needsImage: string[]; unavailable?: boolean }> {
  const cat = CATEGORIES.find((c) => c.key === category)
  if (!cat) return { pois: [], needsImage: [] }
  await spaced('overpass', 800)
  const [lat, lng] = center
  const q = `[out:json][timeout:${Math.ceil(budgetMs / 1000)}];nwr${cat.selector}["name"](around:${radius},${lat},${lng});out center tags 80;`
  let data: any
  try {
    data = await overpassQuery(q, signal, budgetMs)
  } catch (e) {
    if ((e as any)?.name === 'AbortError') throw e
    // Live query unreachable (offline, blocked, all endpoints busy). The
    // caller falls back to other real sources (Nominatim, map tiles) instead
    // of faking it.
    return { pois: [], needsImage: [], unavailable: true }
  }
  const seen = new Set<string>()
  const out: Poi[] = []
  const needsImage: string[] = []

  for (const el of data.elements as any[]) {
    const plat = el.lat ?? el.center?.lat
    const plng = el.lon ?? el.center?.lon
    // Same place mapped as both a node and a building outline → keep one. Chains
    // (several "Starbucks") are different places, so key by name AND position.
    const dupKey = `${el.tags?.name}|${(+plat).toFixed(3)}|${(+plng).toFixed(3)}`
    if (!plat || !plng || !el.tags?.name || seen.has(dupKey)) continue
    seen.add(dupKey)
    const tags: Record<string, string> = el.tags ?? {}

    let imageUrl: string | undefined
    if (tags.image && /^https?:\/\//.test(tags.image)) imageUrl = tags.image
    else if (tags.wikimedia_commons) imageUrl = wikimediaThumb(tags.wikimedia_commons)

    const poi: Poi = {
      id: `${el.type}-${el.id}`,
      osmId: `${el.type}/${el.id}`,
      name: tags.name,
      lat: plat,
      lng: plng,
      category,
      address: [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ') || undefined,
      imageUrl,
      openingHours: tags.opening_hours || undefined,
      phone: tags.phone || tags['contact:phone'] || undefined,
      website: tags.website || tags['contact:website'] || undefined,
      wheelchairDescription: tags['wheelchair:description'] || undefined,
      ...deriveAccess(tags, category),
      tags,
    }
    out.push(poi)
    if (!imageUrl) needsImage.push(tags.name)
  }

  // Overpass answered and there's genuinely nothing here — say so rather
  // than inventing places.

  return { pois: out, needsImage }
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLng = ((b[1] - a[1]) * Math.PI) / 180
  const la1 = (a[0] * Math.PI) / 180
  const la2 = (b[0] * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
