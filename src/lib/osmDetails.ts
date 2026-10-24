import type { AccessSpecs } from '../types'
import { deriveAccess, overpassQuery as hedgedOverpass, type ScoreBreakdown } from './overpass'
import { withDemoOverrides } from './demoOverrides'
import { nominatimLookup, nominatimByName } from './nominatimPois'
import { fetchWikiImage } from './wikipedia'

export interface OsmData {
  osmId?: string
  name?: string
  accessScore: number | null
  accessLabel: string
  breakdown: ScoreBreakdown
  specs: Partial<AccessSpecs>
  imageUrl?: string
  openingHours?: string
  phone?: string
  website?: string
  wheelchairDescription?: string
  extras: { label: string; value: string }[]
  raw: Record<string, string>
}

// Shared hedged Overpass client with a hard time budget, so a busy server
// can't leave the details page spinning.
const overpassQuery = (q: string, signal?: AbortSignal) => hedgedOverpass(q, signal, 9000)

// Tags that indicate accessibility-relevant data
const A11Y_TAGS = [
  'wheelchair', 'ramp', 'ramp:wheelchair', 'tactile_paving', 'step_count',
  'entrance:step_count', 'step_height', 'lift', 'elevator',
  'toilets:wheelchair', 'wheelchair:toilets', 'surface', 'smoothness',
  'handrail', 'ramp:handrail', 'parking:disabled', 'capacity:disabled',
  'door:width', 'entrance:width', 'ramp:width', 'ramp:wheelchair:width', 'lift:width', 'lift:depth',
  'elevator:width', 'elevator:depth', 'kerb', 'kerb:height', 'incline', 'ramp:incline',
  'hearing_loop', 'deaf:loop', 'menu:braille', 'braille', 'blind:sign', 'tactile_writing',
  'quiet_room', 'sensory_room', 'changing_place', 'changing_table:wheelchair',
  'assistance_dog', 'capacity:wheelchair', 'wheelchair:seating',
  'min_width', 'wheelchair:width', 'toilets:grab_rail', 'grab_rail',
  'turning_circle:wheelchair', 'turning_space', 'automatic_door', 'door:automatic',
  'wheelchair:description', 'access:disabled', 'step_count', 'steps:count',
]

// Parse OSM measurement to cm. Handles: "0.9 m", "90 cm", "90", "0.9", "3'6\"" (feet/inches)
function parseCmLocal(raw: string): number | null {
  if (!raw) return null
  const lower = raw.toLowerCase().trim()

  // Handle ranges like "0.9-1.2 m" — take the minimum (worst case for accessibility)
  const rangeMatch = raw.match(/^([\d.]+)\s*[-–]\s*([\d.]+)/)
  if (rangeMatch) {
    const a = parseCmLocal(rangeMatch[1] + (lower.includes('m') ? ' m' : lower.includes('cm') ? ' cm' : ''))
    const b = parseCmLocal(rangeMatch[2] + (lower.includes('m') ? ' m' : lower.includes('cm') ? ' cm' : ''))
    if (a != null && b != null) return Math.min(a, b)
  }

  // Feet and inches: 3'6" or 3 ft 6 in
  const feetMatch = raw.match(/(\d+)\s*(?:'|ft)[^\d]*(\d+)?(?:"|in)?/)
  if (feetMatch) {
    const ft = parseInt(feetMatch[1])
    const inch = parseInt(feetMatch[2] ?? '0')
    return Math.round((ft * 30.48) + (inch * 2.54))
  }

  const v = parseFloat(raw.replace(/[^0-9.]/g, ''))
  if (isNaN(v) || v <= 0) return null
  if (lower.includes('cm')) return Math.round(v)
  if (lower.includes('mm')) return Math.round(v / 10)
  if (lower.includes('m')) return Math.round(v * 100)
  // No unit: values < 5 are metres (OSM convention), ≥ 5 are cm
  return v < 5 ? Math.round(v * 100) : Math.round(v)
}

/**
 * Merge tags from multiple OSM elements into one combined tag set.
 * Strategy:
 *   - "yes" on any element wins over "no" on another (real feature found)
 *   - measurements come from the most specific sub-element (elevator node > building relation)
 *   - main element's name/image/contact info wins
 */
function mergeTags(main: Record<string, string>, subElements: Record<string, string>[]): Record<string, string> {
  const merged = { ...main }

  // Tags where "yes" from ANY element should win
  const positiveWins = [
    'wheelchair', 'ramp', 'ramp:wheelchair', 'lift', 'elevator', 'tactile_paving',
    'toilets:wheelchair', 'wheelchair:toilets', 'hearing_loop', 'deaf:loop',
    'menu:braille', 'braille', 'quiet_room', 'sensory_room', 'changing_place',
    'changing_table:wheelchair', 'assistance_dog', 'automatic_door', 'door:automatic',
    'toilets:grab_rail', 'grab_rail', 'blind:sign',
  ]

  // Tags where the sub-element's value is more specific (override main if not set)
  const preferSpecific = [
    'lift:width', 'elevator:width', 'lift:depth', 'elevator:depth',
    'ramp:width', 'ramp:wheelchair:width', 'ramp:incline', 'ramp:handrail',
    'step_count', 'entrance:step_count', 'steps:count', 'step_height',
    'door:width', 'entrance:width', 'kerb', 'kerb:height',
    'capacity:disabled', 'parking:disabled', 'capacity:wheelchair', 'wheelchair:seating',
    'min_width', 'wheelchair:width', 'turning_circle:wheelchair', 'turning_space',
    'toilets:grab_rail', 'grab_rail', 'incline', 'smoothness',
    'wheelchair:description',
  ]

  for (const sub of subElements) {
    // Positive wins: if sub says yes, upgrade merged
    for (const tag of positiveWins) {
      const subVal = sub[tag]?.toLowerCase()
      const mainVal = merged[tag]?.toLowerCase()
      if ((subVal === 'yes' || subVal === 'both') && mainVal !== 'yes') {
        merged[tag] = 'yes'
      }
      // Special: if main says wheelchair=yes from building, keep it
      if (tag === 'wheelchair' && mainVal === 'yes') continue
    }
    // Specific measurements: fill in if main doesn't have them
    for (const tag of preferSpecific) {
      if (!merged[tag] && sub[tag]) {
        merged[tag] = sub[tag]
      }
    }
  }

  return merged
}

function subQuery(lat: number, lng: number) {
  return `
    [out:json][timeout:9];
    (
      node(around:150,${lat},${lng})["highway"="elevator"];
      node(around:150,${lat},${lng})["amenity"="toilets"]["wheelchair"="yes"];
      node(around:150,${lat},${lng})["entrance"]["wheelchair"];
      node(around:150,${lat},${lng})["entrance"]["ramp"];
      node(around:150,${lat},${lng})["ramp:wheelchair"="yes"];
      node(around:150,${lat},${lng})["ramp"="yes"];
      node(around:100,${lat},${lng})["amenity"="parking"]["capacity:disabled"];
      node(around:100,${lat},${lng})["amenity"="parking"]["parking:disabled"];
      way(around:100,${lat},${lng})["amenity"="parking"]["capacity:disabled"];
      way(around:100,${lat},${lng})["amenity"="toilets"]["wheelchair"="yes"];
      node(around:150,${lat},${lng})["kerb"]["kerb"!="no"];
      node(around:150,${lat},${lng})["hearing_loop"="yes"];
      node(around:150,${lat},${lng})["tactile_paving"="yes"];
    );
    out center tags 30;`
}

async function fetchViaOverpass(lat: number, lng: number, signal?: AbortSignal): Promise<OsmData | null> {
  // q1: Named elements within 200m (catches large buildings as relations)
  const q1 = `
    [out:json][timeout:9];
    (
      node(around:200,${lat},${lng})["name"];
      way(around:200,${lat},${lng})["name"];
      relation(around:200,${lat},${lng})["name"];
    );
    out center tags 20;`

  // q2: Any wheelchair-tagged element within 100m (fallback)
  const q2 = `
    [out:json][timeout:9];
    (
      node(around:100,${lat},${lng})["wheelchair"];
      way(around:100,${lat},${lng})["wheelchair"];
      relation(around:100,${lat},${lng})["wheelchair"];
    );
    out center tags 5;`

  // q3: Accessibility sub-features within 150m — elevator nodes, entrance nodes,
  //     accessible toilets, disabled parking areas, steps, kerb nodes
  //     These are separate OSM objects that carry the real measurement data
  const q3 = subQuery(lat, lng)

  let elements: any[] = []
  let subElements: any[] = []

  try {
    const [data1, data3] = await Promise.all([
      overpassQuery(q1, signal),
      overpassQuery(q3, signal).catch(() => ({ elements: [] })),
    ])

    elements = data1?.elements ?? []
    subElements = data3?.elements ?? []

    // If no named elements or best has zero a11y tags, also run q2
    const bestScore = elements.reduce((best: number, el: any) => {
      const t: Record<string, string> = el.tags ?? {}
      return Math.max(best, A11Y_TAGS.filter(k => t[k] && t[k] !== 'no').length)
    }, 0)

    if (elements.length === 0 || bestScore === 0) {
      const data2 = await overpassQuery(q2, signal)
      const extra: any[] = data2?.elements ?? []
      const seen = new Set(elements.map((e: any) => `${e.type}/${e.id}`))
      for (const el of extra) {
        if (!seen.has(`${el.type}/${el.id}`)) elements.push(el)
      }
    }
  } catch { return null }

  if (elements.length === 0) return null

  // Pick the element with the most accessibility-relevant tags as the "main" element
  const scored = elements.map((el: any) => {
    const t: Record<string, string> = el.tags ?? {}
    const score = A11Y_TAGS.filter(k => t[k] && t[k] !== 'no').length
    return { el, t, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return buildOsmData(scored[0].el, scored[0].t, subElements, true)
}

/** Accessibility sub-features (elevators, entrances, toilets, parking…) around a point. */
async function fetchSubElements(lat: number, lng: number, signal?: AbortSignal): Promise<any[]> {
  const data = await overpassQuery(subQuery(lat, lng), signal)
  return data?.elements ?? []
}

/**
 * Accessibility details for a place. With a known OSM id the main tags come
 * from Nominatim (well under a second) and `onQuick` fires right away; the
 * nearby sub-features from Overpass are merged in afterwards when it answers.
 */
export async function fetchOsmDetails(
  lat: number, lng: number, signal?: AbortSignal,
  opts: { osmId?: string; name?: string; onQuick?: (d: OsmData) => void } = {},
): Promise<OsmData | null> {
  let osmId = opts.osmId && /^(node|way|relation)\/\d+$/.test(opts.osmId) ? opts.osmId : undefined
  // No id (e.g. a curated place or a map-tile place): match it by name right at its position.
  if (!osmId && opts.name) osmId = (await nominatimByName(opts.name, [lat, lng], signal)) ?? undefined
  if (!osmId) return fetchViaOverpass(lat, lng, signal)
  const [main, subs] = await Promise.all([
    nominatimLookup(osmId, signal).then(async (m) => {
      if (m && opts.onQuick && !signal?.aborted) opts.onQuick(await buildOsmData(elRef(osmId!), m.tags, [], false))
      return m
    }),
    fetchSubElements(lat, lng, signal).catch((e) => { if (e?.name === 'AbortError') throw e; return [] as any[] }),
  ])
  if (!main) return fetchViaOverpass(lat, lng, signal).catch(() => null)
  return buildOsmData(elRef(osmId), main.tags, subs, true)
}

const elRef = (osmId: string) => { const [type, id] = osmId.split('/'); return { type, id } }

async function buildOsmData(mainEl: { type: string; id: string | number }, mainTags: Record<string, string>, subElements: any[], enrich: boolean): Promise<OsmData> {

  // Merge sub-element tags into main tags for richer data
  const subTags = subElements.map((el: any) => el.tags ?? {} as Record<string, string>)
  const t = withDemoOverrides(mergeTags(mainTags, subTags))

  // Run scoring engine on merged tags
  const derived = deriveAccess(t)

  // ── Map to AccessSpecs ────────────────────────────────────────────
  const specs: Partial<AccessSpecs> = {}

  // Step-free entrance
  const wcVal = t.wheelchair?.toLowerCase()
  if (wcVal === 'yes') specs.hasStepFreeEntrance = true
  else if (wcVal === 'no') specs.hasStepFreeEntrance = false

  // Steps / kerb
  const stepCount = parseInt(t.step_count ?? t['entrance:step_count'] ?? t['steps:count'] ?? '')
  if (!isNaN(stepCount)) {
    specs.entranceStepCount = stepCount
    if (stepCount === 0) specs.hasStepFreeEntrance = true
  }
  if (derived.stepHeightCm != null) specs.stepHeightCm = derived.stepHeightCm
  if (derived.kerbType) specs.kerbType = derived.kerbType
  if (derived.entranceLevel) specs.entranceLevel = derived.entranceLevel

  // Ramp — check merged tags and sub-elements
  specs.rampPresent = derived.hasRamp
    || subElements.some(el => ['yes','up','down','both'].includes((el.tags?.ramp ?? el.tags?.['ramp:wheelchair'] ?? '').toLowerCase()))
  if (derived.rampGradient != null) {
    specs.rampGradientPct = derived.rampGradient
    specs.rampGradient = derived.rampGradient <= 5 ? 'gentle' : derived.rampGradient <= 10 ? 'moderate' : 'steep'
  }
  if (derived.rampWidthCm != null) specs.rampWidthCm = derived.rampWidthCm
  if (derived.rampHasHandrail != null) specs.rampHasHandrails = derived.rampHasHandrail

  // Door
  if (derived.doorWidthCm != null) specs.doorWidthCm = derived.doorWidthCm
  if (derived.doorType === 'Automatic') specs.doorType = 'automatic'
  else if (t.door === 'hinged' || t.door === 'manual') specs.doorType = 'manual'
  else if (t.door === 'revolving') specs.doorType = 'revolving'

  // Lift — merged tags or any sub-element with highway=elevator
  const hasElevatorNode = subElements.some(el =>
    el.tags?.highway === 'elevator' || (el.tags?.lift ?? el.tags?.elevator ?? '').toLowerCase() === 'yes'
  )
  specs.hasLift = derived.hasLift || hasElevatorNode

  // Elevator dimensions — prefer sub-element (elevator node) over building node
  const elevatorNode = subElements.find(el => el.tags?.highway === 'elevator')
  const liftWidthSrc = elevatorNode?.tags?.['lift:width'] || elevatorNode?.tags?.['elevator:width']
    || t['lift:width'] || t['elevator:width']
  const liftDepthSrc = elevatorNode?.tags?.['lift:depth'] || elevatorNode?.tags?.['elevator:depth']
    || t['lift:depth'] || t['elevator:depth']
  if (liftWidthSrc) specs.liftDoorWidthCm = parseCmLocal(liftWidthSrc) ?? undefined
  if (liftDepthSrc) specs.liftDepthCm = parseCmLocal(liftDepthSrc) ?? undefined

  // Accessible WC — merged tags or dedicated toilet node
  const hasAccessibleToiletNode = subElements.some(el =>
    el.tags?.amenity === 'toilets' && ['yes', 'limited'].includes((el.tags?.wheelchair ?? '').toLowerCase())
  )
  if (derived.accessibleToilet || hasAccessibleToiletNode) specs.hasAccessibleToilet = true
  else if ((t['toilets:wheelchair'] || t['wheelchair:toilets'] || '').toLowerCase() === 'no') specs.hasAccessibleToilet = false

  // WC grab rails — check toilet node first
  const toiletNode = subElements.find(el => el.tags?.amenity === 'toilets' && el.tags?.wheelchair === 'yes')
  const grabRailRaw = (
    toiletNode?.tags?.['toilets:grab_rail'] || toiletNode?.tags?.grab_rail ||
    t['toilets:grab_rail'] || t.grab_rail || ''
  ).toLowerCase()
  if (grabRailRaw === 'yes') specs.toiletGrabRails = true
  else if (grabRailRaw === 'no') specs.toiletGrabRails = false

  // WC turning space
  const turningRaw = toiletNode?.tags?.['turning_circle:wheelchair'] || toiletNode?.tags?.turning_space
    || t['turning_circle:wheelchair'] || t['turning_space']
  if (turningRaw) {
    const cm = parseCmLocal(turningRaw)
    if (cm) specs.turningSpaceCm = cm
  }

  // Surface / tactile
  if (derived.surface) {
    const s = derived.surface
    if (['asphalt', 'paved', 'concrete', 'paving_stones', 'tiles', 'wood', 'rubber', 'tartan'].includes(s)) specs.floorSurface = 'smooth'
    else if (s === 'carpet') specs.floorSurface = 'carpet'
    else if (['sett', 'cobblestone', 'unhewn_cobblestone'].includes(s)) specs.floorSurface = 'cobblestone'
    else if (['gravel', 'ground', 'dirt', 'sand', 'grass', 'earth', 'mud'].includes(s)) specs.floorSurface = 'gravel'
    else if (['compacted', 'fine_gravel', 'pebblestone', 'bricks'].includes(s)) specs.floorSurface = 'uneven'
  }
  const hasTactile = derived.tactile || subElements.some(el => el.tags?.tactile_paving === 'yes')
  if (hasTactile) specs.hasTactilePaving = true
  else if (t.tactile_paving?.toLowerCase() === 'no') specs.hasTactilePaving = false

  // Parking — check parking lot nodes/ways near the venue
  const parkingNode = subElements.find(el =>
    el.tags?.amenity === 'parking' && (el.tags?.['capacity:disabled'] || el.tags?.['parking:disabled'])
  )
  if (derived.hasDisabledParking || parkingNode) {
    specs.hasDisabledParking = true
    const spaces = parseInt(parkingNode?.tags?.['capacity:disabled'] || t['capacity:disabled'] || '')
    if (!isNaN(spaces) && spaces > 0) specs.disabledParkingSpaces = spaces
  }

  // Corridor width
  if (derived.corridorWidthCm) specs.corridorWidthCm = derived.corridorWidthCm

  // ── Wikidata enrichment ───────────────────────────────────────────
  // Use SPARQL to get image, accessibility properties, and website
  let wikidataImage: string | undefined
  let wikidataWebsite: string | undefined

  const qid = t.wikidata?.trim()
  if (enrich && qid && /^Q\d+$/.test(qid)) {
    try {
      // SPARQL: fetch image (P18), Commons category (P373), website (P856),
      // wheelchair accessibility (P5630), accessible to disabled (P2846)
      const sparql = `
        SELECT ?item ?image ?commonscat ?website ?wcAccess ?disabled WHERE {
          BIND(wd:${qid} AS ?item)
          OPTIONAL { ?item wdt:P18 ?image }
          OPTIONAL { ?item wdt:P373 ?commonscat }
          OPTIONAL { ?item wdt:P856 ?website }
          OPTIONAL { ?item wdt:P5630 ?wcAccess }
          OPTIONAL { ?item wdt:P2846 ?disabled }
        } LIMIT 1`

      const sparqlUrl = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`
      const wd = await Promise.race([
        fetch(sparqlUrl, { headers: { Accept: 'application/sparql-results+json' } }).then(r => r.json()),
        new Promise<null>(res => setTimeout(() => res(null), 4000)),
      ])

      if (wd?.results?.bindings?.[0]) {
        const row = wd.results.bindings[0]

        // Image from Wikimedia Commons
        if (row.image?.value) {
          const file = row.image.value.replace('http://commons.wikimedia.org/wiki/Special:FilePath/', '')
            .replace('https://commons.wikimedia.org/wiki/Special:FilePath/', '')
          wikidataImage = `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=800`
        } else if (row.commonscat?.value) {
          wikidataImage = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(row.commonscat.value.replace(/ /g, '_'))}?width=800`
        }

        // Website fallback
        if (row.website?.value && !t.website) {
          wikidataWebsite = row.website.value
        }

        // P5630 wheelchair accessibility: Q51673526=fully, Q51673530=partially, Q51673527=not
        if (row.wcAccess?.value) {
          const wcQid = row.wcAccess.value.split('/').pop()
          if (wcQid === 'Q51673526') { specs.hasStepFreeEntrance = true }
          else if (wcQid === 'Q51673527') { specs.hasStepFreeEntrance = false }
        }

        // P2846 = accessible to people with disabilities (any value means it's accessible)
        if (row.disabled?.value && specs.hasStepFreeEntrance == null) {
          specs.hasStepFreeEntrance = true
        }
      }
    } catch { /* ignore */ }
  }

  // ── Image (priority: OSM tag > Wikimedia Commons tag > Wikidata SPARQL > Wikipedia) ──
  let imageUrl: string | undefined
  if (t.image && /^https?:\/\//.test(t.image)) {
    imageUrl = t.image
  } else if (t.wikimedia_commons) {
    const file = t.wikimedia_commons.replace(/^(File:|Category:)/, '').trim()
    imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=800`
  } else if (wikidataImage) {
    imageUrl = wikidataImage
  } else if (enrich && t.name) {
    imageUrl = await Promise.race([
      fetchWikiImage(t.name),
      new Promise<undefined>(res => setTimeout(() => res(undefined), 2500)),
    ]) || undefined
  }

  // ── Extras (info card — sensory/comms badges shown separately as feature badges) ──
  const extras: { label: string; value: string }[] = []
  if (t['wheelchair:description'])
    extras.push({ label: 'Accessibility note', value: t['wheelchair:description'] })
  if (t.fee === 'no') extras.push({ label: 'Admission', value: 'Free entry' })
  else if (t.fee === 'yes') extras.push({ label: 'Admission', value: 'Paid' })
  if (t['addr:street']) {
    const addr = [t['addr:housenumber'], t['addr:street'], t['addr:city'], t['addr:postcode']]
      .filter(Boolean).join(' ')
    extras.push({ label: 'Address', value: addr })
  }
  // Sensory / communication (also shown as feature badges in PlaceDetail)
  const hearingLoop = (t['hearing_loop'] || t['deaf:loop'] || '').toLowerCase() === 'yes'
    || subElements.some(el => (el.tags?.hearing_loop || '').toLowerCase() === 'yes')
  if (hearingLoop) extras.push({ label: 'Hearing loop', value: 'Yes' })

  if ((t['menu:braille'] || t['braille'] || '').toLowerCase() === 'yes')
    extras.push({ label: 'Braille menu', value: 'Available' })
  if ((t['quiet_room'] || t['sensory_room'] || '').toLowerCase() === 'yes')
    extras.push({ label: 'Quiet / sensory room', value: 'Available' })
  if ((t['changing_place'] || t['changing_table:wheelchair'] || '').toLowerCase() === 'yes')
    extras.push({ label: 'Changing Place', value: 'Available' })
  if ((t['assistance_dog'] || '').toLowerCase() === 'yes')
    extras.push({ label: 'Assistance dogs', value: 'Allowed' })

  const wSeating = t['capacity:wheelchair'] || t['wheelchair:seating']
  if (wSeating && wSeating !== 'no' && wSeating !== '0')
    extras.push({ label: 'Wheelchair seating', value: /^\d+$/.test(wSeating) ? `${wSeating} spaces` : 'Available' })

  const minWidth = t['min_width'] || t['wheelchair:width']
  if (minWidth) {
    const cm = parseCmLocal(minWidth)
    extras.push({ label: 'Min. corridor width', value: cm ? `${cm} cm` : minWidth })
  }

  // Blind/visual impairment aids
  if ((t['blind:sign'] || t['tactile_writing'] || '').toLowerCase() === 'yes')
    extras.push({ label: 'Visual aids', value: 'Tactile / audio signs' })

  // Floors / levels (multi-storey info)
  if (t.levels && parseInt(t.levels) > 1)
    extras.push({ label: 'Floors', value: `${t.levels} floors` })
  if (t['building:levels'] && parseInt(t['building:levels']) > 1 && !t.levels)
    extras.push({ label: 'Floors', value: `${t['building:levels']} floors` })

  const finalWebsite = t.website || t['contact:website'] || wikidataWebsite || undefined

  return {
    osmId: `${mainEl.type}/${mainEl.id}`,
    name: mainTags.name,
    accessScore: derived.accessScore,
    accessLabel: derived.accessLabel,
    breakdown: derived.breakdown,
    specs,
    imageUrl,
    openingHours: t.opening_hours || undefined,
    phone: t.phone || t['contact:phone'] || t['phone:intl'] || undefined,
    website: finalWebsite,
    wheelchairDescription: t['wheelchair:description'] || undefined,
    extras,
    raw: t,
  }
}
