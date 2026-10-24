import { spaced } from './rateLimit'
import { deriveAccess, type CategoryKey, type Poi } from './overpass'

/* ------------------------------------------------------------------ *
 * Fast, real nearby places from OpenStreetMap via Nominatim.
 * Nominatim answers category searches in well under a second and returns
 * the place's OSM tags (wheelchair, toilets:wheelchair, opening_hours…) via
 * `extratags`, so results are scored exactly like Overpass results. Overpass
 * is still used afterwards to fill in anything Nominatim's 40-result cap misses.
 * Usage policy: ≤1 request/second, cache results — both handled here.
 * ------------------------------------------------------------------ */

const QUERIES: Record<CategoryKey, string[]> = {
  restaurant: ['[amenity=restaurant]', '[amenity=fast_food]'],
  cafe: ['[amenity=cafe]'],
  hotel: ['[tourism=hotel]', '[tourism=motel]'],
  hospital: ['[amenity=hospital]', '[amenity=clinic]'],
  pharmacy: ['[amenity=pharmacy]'],
  shop: ['[shop=supermarket]', '[shop=department_store]', '[shop=mall]'],
  school: ['[amenity=school]'],
  attraction: ['[tourism=attraction]', '[tourism=museum]'],
  park: ['[leisure=park]'],
  bank: ['[amenity=bank]', '[amenity=atm]'],
}

const CACHE_TTL = 30 * 60_000

function cacheGet(key: string): any | undefined {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return undefined
    const { t, v } = JSON.parse(raw)
    return Date.now() - t < CACHE_TTL ? v : undefined
  } catch { return undefined }
}
function cacheSet(key: string, v: any) {
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v })) } catch { /* full / blocked */ }
}

/** Turn one Nominatim result into a Poi, or null if it has no usable name. */
export function poiFromNominatim(r: any, category: CategoryKey): Poi | null {
  const name: string = r.name || r.namedetails?.name || ''
  const lat = parseFloat(r.lat), lng = parseFloat(r.lon)
  if (!name || isNaN(lat) || isNaN(lng)) return null
  const tags: Record<string, string> = { ...(r.extratags ?? {}), name }
  if (r.category && r.type) tags[r.category] = r.type
  const a = r.address ?? {}
  return {
    id: `${r.osm_type}-${r.osm_id}`,
    osmId: `${r.osm_type}/${r.osm_id}`,
    name,
    lat, lng,
    category,
    address: [a.house_number, a.road].filter(Boolean).join(' ') || undefined,
    imageUrl: tags.image && /^https?:\/\//.test(tags.image) ? tags.image : undefined,
    openingHours: tags.opening_hours || undefined,
    phone: tags.phone || tags['contact:phone'] || undefined,
    website: tags.website || tags['contact:website'] || undefined,
    wheelchairDescription: tags['wheelchair:description'] || undefined,
    ...deriveAccess(tags, category),
    tags,
  }
}

async function nominatimSearch(params: Record<string, string>, signal?: AbortSignal): Promise<any[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  for (const [k, v] of Object.entries({ format: 'jsonv2', extratags: '1', addressdetails: '1', ...params })) url.searchParams.set(k, v)
  const key = `am.nom.${url.search}`
  const hit = cacheGet(key)
  if (hit) return hit
  await spaced('nominatim', 1100)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const ac = new AbortController()
  const onAbort = () => ac.abort()
  signal?.addEventListener('abort', onAbort)
  const timer = setTimeout(() => ac.abort(), 8000)
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { 'Accept-Language': 'en' } })
    if (!res.ok) throw new Error(`Nominatim ${res.status}`)
    const data = await res.json()
    cacheSet(key, data)
    return data
  } catch (e) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw e
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function viewbox([lat, lng]: [number, number], radiusM: number): string {
  const dLat = radiusM / 111_320
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180))
  return `${lng - dLng},${lat + dLat},${lng + dLng},${lat - dLat}`
}

/**
 * Real places of `category` around `center`. Calls `onBatch` as each
 * sub-query answers (the first usually within ~0.5 s) so the list can fill
 * in progressively. Resolves with everything found; rejects only if every
 * sub-query failed.
 */
export async function nominatimNearby(
  center: [number, number],
  category: CategoryKey,
  radiusM: number,
  onBatch: (pois: Poi[]) => void,
  signal?: AbortSignal,
): Promise<Poi[]> {
  const vb = viewbox(center, radiusM)
  const all: Poi[] = []
  let failures = 0
  const queries = QUERIES[category] ?? []
  for (const q of queries) {
    try {
      const rows = await nominatimSearch({ q, viewbox: vb, bounded: '1', limit: '40' }, signal)
      const batch = rows.map((r) => poiFromNominatim(r, category)).filter((p): p is Poi => !!p)
      all.push(...batch)
      if (batch.length) onBatch(batch)
    } catch (e) {
      if ((e as any)?.name === 'AbortError') throw e
      failures++
    }
  }
  if (failures === queries.length) throw new Error('Nominatim unavailable')
  return all
}

/** Nominatim's `osm_ids` code for "node/123" → "N123". */
const lookupCode = (osmId: string) => {
  const m = /^(node|way|relation)\/(\d+)$/.exec(osmId)
  return m ? `${m[1][0].toUpperCase()}${m[2]}` : null
}

/**
 * Raw Nominatim rows for many OSM elements, 50 per request (Nominatim's cap),
 * cached per element. Elements Nominatim doesn't know map to null.
 */
async function lookupRows(osmIds: string[], signal?: AbortSignal, onChunk?: (rows: any[]) => void): Promise<Map<string, any | null>> {
  const out = new Map<string, any | null>()
  const todo: string[] = []
  for (const id of new Set(osmIds)) {
    if (!lookupCode(id)) continue
    const hit = cacheGet(`am.nomlk.${id}`)
    if (hit !== undefined) out.set(id, hit)
    else todo.push(id)
  }
  const cached = [...out.values()].filter(Boolean)
  if (cached.length) onChunk?.(cached)
  for (let i = 0; i < todo.length; i += 50) {
    const chunk = todo.slice(i, i + 50)
    const url = new URL('https://nominatim.openstreetmap.org/lookup')
    url.searchParams.set('osm_ids', chunk.map(lookupCode).join(','))
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('extratags', '1')
    url.searchParams.set('addressdetails', '1')
    await spaced('nominatim', 1100)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const ac = new AbortController()
    const onAbort = () => ac.abort()
    signal?.addEventListener('abort', onAbort)
    const timer = setTimeout(() => ac.abort(), 8000)
    try {
      const res = await fetch(url, { signal: ac.signal, headers: { 'Accept-Language': 'en' } })
      if (!res.ok) throw new Error(`Nominatim ${res.status}`)
      const rows: any[] = await res.json()
      const byId = new Map(rows.map((r) => [`${r.osm_type}/${r.osm_id}`, r]))
      for (const id of chunk) {
        const r = byId.get(id) ?? null
        out.set(id, r)
        cacheSet(`am.nomlk.${id}`, r)
      }
      onChunk?.(rows)
    } catch (e) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      if (i === 0 && !out.size) throw e // nothing at all came back — let the caller know
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
  return out
}

/**
 * Real OSM tags for a batch of places known only by id (e.g. from the map
 * tiles), scored like every other result. `onBatch` fires as each 50-place chunk arrives.
 */
export async function nominatimLookupMany(
  osmIds: string[], category: CategoryKey, signal?: AbortSignal, onBatch?: (pois: Poi[]) => void,
): Promise<Poi[]> {
  const toPois = (rows: any[]) => rows.map((r) => r && poiFromNominatim(r, category)).filter((p): p is Poi => !!p)
  const rows = await lookupRows(osmIds, signal, onBatch && ((chunk) => onBatch(toPois(chunk))))
  const out: Poi[] = []
  for (const r of rows.values()) {
    const p = r && poiFromNominatim(r, category)
    if (p) out.push(p)
  }
  return out
}

/** Full OSM tags for one element (e.g. "node/123") — used to open place details instantly. */
export async function nominatimLookup(osmId: string, signal?: AbortSignal): Promise<{ tags: Record<string, string>; lat: number; lng: number } | null> {
  let r: any
  try { r = (await lookupRows([osmId], signal)).get(osmId) } catch (e) {
    if ((e as any)?.name === 'AbortError') throw e
    return null
  }
  if (!r) return null
  const a = r.address ?? {}
  const tags: Record<string, string> = { ...(r.extratags ?? {}) }
  if (r.name) tags.name = r.name
  if (r.category && r.type) tags[r.category] = r.type
  if (a.road && !tags['addr:street']) tags['addr:street'] = a.road
  if (a.house_number && !tags['addr:housenumber']) tags['addr:housenumber'] = a.house_number
  if ((a.city || a.town) && !tags['addr:city']) tags['addr:city'] = a.city || a.town
  if (a.postcode && !tags['addr:postcode']) tags['addr:postcode'] = a.postcode
  return { tags, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }
}

/** Find a place by name right around a point (for places we only know by name + position). */
export async function nominatimByName(name: string, center: [number, number], signal?: AbortSignal): Promise<string | null> {
  try {
    const rows = await nominatimSearch({ q: name, viewbox: viewbox(center, 250), bounded: '1', limit: '1' }, signal)
    const r = rows[0]
    return r ? `${r.osm_type}/${r.osm_id}` : null
  } catch (e) {
    if ((e as any)?.name === 'AbortError') throw e
    return null
  }
}
