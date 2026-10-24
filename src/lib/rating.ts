import PRIORS from '../data/accessPriors.json'
import type { CategoryKey } from './overpass'

/* ------------------------------------------------------------------ *
 * Accessibility score (0–10) for one place, built from five weighted
 * factors instead of a single yes/no tag. Each factor uses the best
 * evidence available, in this order:
 *   mapped     — the place's own OpenStreetMap / community tags
 *   measured   — physical facts around it: ground slope (elevation data),
 *                building height and nearest car park (map tiles)
 *   statistics — how often places of the same chain / type are accessible,
 *                from OpenStreetMap-wide tag statistics (src/data/accessPriors.json)
 *   typical    — a neutral middle value when nothing else is known
 * So two "wheelchair=yes" places no longer get the same 6.0: a single-storey
 * café on flat ground with parking outside scores higher than one up a hill.
 * ------------------------------------------------------------------ */

export interface AccessContext {
  /** Steepest ground slope around the place, % (from elevation data). */
  slopePct?: number
  /** Height of the building the place is in, metres (from map tiles). */
  buildingHeightM?: number
  /** Distance to the nearest car park, metres (from map tiles). */
  parkingM?: number
}

export type FactorSource = 'mapped' | 'measured' | 'statistics' | 'typical'
export interface Factor {
  key: 'entrance' | 'toilet' | 'ground' | 'parking' | 'inside'
  label: string
  detail: string
  /** 0 (worst) … 1 (best). */
  value: number
  weight: number
  source: FactorSource
}

/** What deriveAccess has already pulled out of the tags. */
export interface Details {
  wheelchair?: 'yes' | 'limited' | 'no'
  stepCount?: number
  hasRamp: boolean
  steepIncline: boolean
  rampGradient?: number
  accessibleToiletTag?: 'yes' | 'no'
  terrain: string
  surface?: string
  hasLift: boolean
  liftNo: boolean
  doorType?: string
  doorWidthCm?: number
  hasDisabledParking: boolean
  hearingLoop: boolean
  tactile: boolean
  brailleMenu: boolean
  quietRoom: boolean
  changingPlace: boolean
  hasWheelchairSeating: boolean
}

type Split = { w?: number[]; t?: number[] }
const TYPES = (PRIORS as { types: Record<string, Split> }).types
const BRANDS = (PRIORS as { brands: Record<string, Split> }).brands

const CATEGORY_TYPE: Record<CategoryKey, string> = {
  restaurant: 'amenity=restaurant', cafe: 'amenity=cafe', hotel: 'tourism=hotel', hospital: 'amenity=hospital',
  pharmacy: 'amenity=pharmacy', shop: 'shop=supermarket', school: 'amenity=school', attraction: 'tourism=attraction',
  park: 'leisure=park', bank: 'amenity=bank',
}

// Average over every place type, for places of an unknown type.
const GLOBAL: { w: number[]; t: number[] } = (() => {
  const w = [0, 0, 0], t = [0, 0]
  for (const s of Object.values(TYPES)) {
    s.w?.forEach((n, i) => (w[i] += n))
    s.t?.forEach((n, i) => (t[i] += n))
  }
  return { w, t }
})()

const share = (arr: number[], i: number) => arr[i] / Math.max(1, arr.reduce((a, b) => a + b, 0))

/** Blend a chain's own numbers with its place type's, so small samples don't swing wildly. */
function blend(brand: number[] | undefined, base: number[], k = 25): number[] {
  if (!brand) return base.map((_, i) => share(base, i))
  const n = brand.reduce((a, b) => a + b, 0)
  return base.map((_, i) => (brand[i] + k * share(base, i)) / (n + k))
}

function typeOf(tags: Record<string, string>, category?: CategoryKey): { key?: string; label: string } {
  for (const k of ['amenity', 'shop', 'tourism', 'leisure', 'healthcare']) {
    const v = tags[k]
    if (v && TYPES[`${k}=${v}`]) return { key: `${k}=${v}`, label: v.replace(/_/g, ' ') }
  }
  if (category) return { key: CATEGORY_TYPE[category], label: CATEGORY_TYPE[category].split('=')[1].replace(/_/g, ' ') }
  return { label: 'place' }
}

const plural = (s: string) => (/(s|sh|ch)$/.test(s) ? `${s}es` : s.endsWith('y') && !/[aeiou]y$/.test(s) ? `${s.slice(0, -1)}ies` : `${s}s`)
const pct = (x: number) => `${Math.round(x * 100)}%`
const round1 = (x: number) => Math.round(x * 10) / 10

export interface Scored {
  total: number
  confidence: 'high' | 'medium' | 'low'
  factors: Factor[]
  base: number
  bonuses: { label: string; points: number }[]
  penalties: { label: string; points: number }[]
}

export function scoreAccess(tags: Record<string, string>, d: Details, category?: CategoryKey, ctx: AccessContext = {}): Scored {
  const type = typeOf(tags, category)
  const typeSplit = (type.key && TYPES[type.key]) || {}
  const brandSplit = tags['brand:wikidata'] ? BRANDS[tags['brand:wikidata']] : undefined
  const brandName = brandSplit ? tags.brand || tags.name : undefined
  const who = brandName ? `mapped ${brandName} locations` : `mapped ${plural(type.label)}`
  const factors: Factor[] = []

  /* Entrance (40%) */
  {
    let value: number, detail: string, source: FactorSource = 'mapped'
    if (d.wheelchair === 'yes') { value = 1; detail = 'Mapped as step-free / wheelchair accessible' }
    else if (d.wheelchair === 'limited') { value = 0.5; detail = 'Mapped as partly accessible — some barriers' }
    else if (d.wheelchair === 'no') { value = 0; detail = 'Mapped as not wheelchair accessible' }
    else if (d.stepCount === 0) { value = 1; detail = 'No steps at the entrance' }
    else if (d.stepCount != null) { value = d.hasRamp ? 0.7 : 0.2; detail = `${d.stepCount} step${d.stepCount > 1 ? 's' : ''} at the entrance${d.hasRamp ? ', with a ramp' : ''}` }
    else if (d.hasRamp) { value = 0.75; detail = 'Ramp at the entrance' }
    else {
      const p = blend(brandSplit?.w, typeSplit.w ?? GLOBAL.w)
      value = p[0] + 0.5 * p[1]
      detail = `Not mapped yet — ${pct(p[0])} of ${who} are step-free`
      source = 'statistics'
    }
    factors.push({ key: 'entrance', label: 'Entrance', detail, value, weight: 4, source })
  }

  /* Accessible toilet (20%) — skipped where there are no toilets */
  if (tags.toilets !== 'no' && !['atm', 'bench', 'parking'].includes(tags.amenity ?? '') && tags.leisure !== 'park') {
    let value: number, detail: string, source: FactorSource = 'mapped'
    if (d.accessibleToiletTag === 'yes') { value = 1; detail = 'Accessible toilet mapped' }
    else if (d.accessibleToiletTag === 'no') { value = 0; detail = 'Mapped as having no accessible toilet' }
    else {
      const p = blend(brandSplit?.t, typeSplit.t ?? GLOBAL.t)
      value = p[0]
      detail = `Not mapped yet — ${pct(p[0])} of ${who} that list it have one`
      source = 'statistics'
    }
    factors.push({ key: 'toilet', label: 'Accessible toilet', detail, value, weight: 2, source })
  }

  /* Ground around it (15%) — surface tags and measured slope */
  {
    const parts: { v: number; text: string; src: FactorSource }[] = []
    if (d.terrain === 'Smooth') parts.push({ v: 1, text: 'smooth surface', src: 'mapped' })
    else if (d.terrain === 'Uneven') parts.push({ v: 0.6, text: 'uneven surface', src: 'mapped' })
    else if (d.terrain === 'Rough') parts.push({ v: 0.3, text: 'rough / unpaved surface', src: 'mapped' })
    if (ctx.slopePct != null) {
      const s = ctx.slopePct
      // Continuous: flat ground scores 1, the ADA 5% limit ≈0.64, 10%+ bottoms out.
      const v = Math.max(0.2, Math.min(1, 1 - Math.max(0, s - 1) * 0.09))
      parts.push({ v, text: `${s <= 2 ? 'flat ground' : `ground slopes about ${Math.round(s)}%`} around it`, src: 'measured' })
    }
    if (parts.length) {
      const worst = parts.reduce((a, b) => (b.v < a.v ? b : a))
      factors.push({ key: 'ground', label: 'Ground around it', detail: parts.map((p) => p.text).join(', ').replace(/^./, (c) => c.toUpperCase()), value: worst.v, weight: 1.5, source: worst.src })
    } else {
      factors.push({ key: 'ground', label: 'Ground around it', detail: 'Slope not measured yet', value: 0.75, weight: 1.5, source: 'typical' })
    }
  }

  /* Parking (10%) */
  if (d.hasDisabledParking) factors.push({ key: 'parking', label: 'Parking', detail: 'Disabled parking mapped', value: 1, weight: 1, source: 'mapped' })
  else if (ctx.parkingM != null && ctx.parkingM <= 300) {
    const m = ctx.parkingM
    factors.push({ key: 'parking', label: 'Parking', detail: `Car park about ${Math.max(10, Math.round(m / 10) * 10)} m away`, value: 0.9 - (Math.max(0, m - 30) / 270) * 0.3, weight: 1, source: 'measured' })
  } else {
    // Many car parks aren't on the map, so "none found" isn't evidence there isn't one.
    factors.push({ key: 'parking', label: 'Parking', detail: 'No car park mapped close by', value: 0.5, weight: 1, source: 'typical' })
  }

  /* Inside (15%) — lift, doors, building height */
  {
    const bits: string[] = []
    let value = 0.7, source: FactorSource = 'typical'
    const tall = ctx.buildingHeightM != null && ctx.buildingHeightM > 6
    if (ctx.buildingHeightM != null) {
      value = tall ? 0.55 : 0.9; source = 'measured'
      bits.push(tall ? `building is about ${Math.round(ctx.buildingHeightM / 3)} storeys` : 'single-storey building')
    }
    if (d.hasLift) { value = 1; source = 'mapped'; bits.push('lift mapped') }
    else if (d.liftNo) { value = tall ? 0.25 : Math.min(value, 0.6); source = 'mapped'; bits.push('no lift') }
    if (d.doorType === 'Automatic') { value = Math.min(1, value + 0.1); source = 'mapped'; bits.push('automatic doors') }
    if (d.doorWidthCm != null) {
      source = 'mapped'
      if (d.doorWidthCm < 80) { value = Math.min(value, 0.4); bits.push(`narrow door (${d.doorWidthCm} cm)`) }
      else bits.push(`door ${d.doorWidthCm} cm wide`)
    }
    factors.push({ key: 'inside', label: 'Inside', detail: bits.length ? bits.join(', ').replace(/^./, (c) => c.toUpperCase()) : 'Lifts and doors not mapped yet', value, weight: 1.5, source })
  }

  const wSum = factors.reduce((n, f) => n + f.weight, 0)
  const base = (10 * factors.reduce((n, f) => n + f.weight * f.value, 0)) / wSum

  const bonuses: { label: string; points: number }[] = []
  if (d.wheelchair !== 'no') {
    if (d.hearingLoop) bonuses.push({ label: 'Hearing loop', points: 0.2 })
    if (d.tactile) bonuses.push({ label: 'Tactile paving', points: 0.15 })
    if (d.brailleMenu) bonuses.push({ label: 'Braille menu', points: 0.1 })
    if (d.quietRoom) bonuses.push({ label: 'Quiet / sensory room', points: 0.15 })
    if (d.changingPlace) bonuses.push({ label: 'Changing Place', points: 0.2 })
    if (d.hasWheelchairSeating) bonuses.push({ label: 'Wheelchair seating', points: 0.1 })
  }
  const penalties: { label: string; points: number }[] = []
  if (d.surface && (d.surface.includes('cobblestone') || d.surface === 'sett')) penalties.push({ label: 'Cobblestones', points: -0.4 })
  if (d.steepIncline) penalties.push({ label: `Steep ramp (${Math.round(d.rampGradient ?? 0)}%)`, points: -0.4 })

  let total = base + Math.min(0.6, bonuses.reduce((n, b) => n + b.points, 0)) + penalties.reduce((n, p) => n + p.points, 0)
  if (d.wheelchair === 'no') total = Math.min(total, 2.5)
  total = Math.max(0, Math.min(10, round1(total)))

  // Confidence = how much of the score rests on facts about this place itself.
  const entranceKnown = factors[0].source === 'mapped'
  const otherFacts = factors.slice(1).filter((f) => f.source === 'mapped' || f.source === 'measured').length
  const confidence = entranceKnown && otherFacts >= 2 ? 'high' : entranceKnown ? 'medium' : 'low'

  return { total, confidence, factors, base: round1(base), bonuses, penalties }
}
