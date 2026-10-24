import type { Map as MlMap } from 'maplibre-gl'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import { deriveAccess, haversineKm, type CategoryKey, type Poi } from './overpass'
import { STYLE_URL } from './map3d'

/* ------------------------------------------------------------------ *
 * Real places straight from the map's own vector tiles (OpenFreeMap /
 * OpenMapTiles "poi" layer, rebuilt from OpenStreetMap every few days).
 * At street zoom (z14) the tiles hold EVERY named place, and each feature id
 * encodes its OpenStreetMap element (osm_id × 10 + 1 node / 2 way / 3 relation),
 * so the full list can be matched to real OSM accessibility tags afterwards.
 * Tile places carry names and types only, so until that lookup they're
 * marked "not yet assessed" (id prefix `tile-`).
 * ------------------------------------------------------------------ */

const CLASSES: Record<CategoryKey, (cls: string, sub: string) => boolean> = {
  restaurant: (c) => c === 'restaurant' || c === 'fast_food',
  cafe: (c) => c === 'cafe',
  hotel: (c) => c === 'lodging',
  hospital: (c, s) => c === 'hospital' || s === 'doctors' || c === 'doctors' || s === 'clinic',
  pharmacy: (c) => c === 'pharmacy',
  shop: (c, s) => ['shop', 'grocery', 'clothing_store', 'alcohol_shop', 'bakery'].includes(c) || (c === 'library' && s === 'books'),
  school: (c) => c === 'school' || c === 'college',
  attraction: (c, s) => ['attraction', 'museum', 'theatre', 'zoo'].includes(c) || (c === 'art_gallery' && s !== 'artwork'),
  park: (c, s) => c === 'park' && s === 'park',
  bank: (c) => c === 'bank' || c === 'atm',
}

const OSM_TYPES: Record<number, string> = { 1: 'node', 2: 'way', 3: 'relation' }

/** "node/123" from an OpenMapTiles feature id, or '' if it doesn't encode one. */
export function osmIdFromTileId(id: unknown): string {
  const n = typeof id === 'number' ? id : Number(id)
  if (!Number.isFinite(n) || n <= 0) return ''
  const type = OSM_TYPES[n % 10]
  return type ? `${type}/${Math.floor(n / 10)}` : ''
}

function tilePoi(name: string, lat: number, lng: number, category: CategoryKey, osmId: string, fallbackKey: string): Poi {
  return {
    id: `tile-${osmId ? osmId.replace('/', '-') : fallbackKey}`,
    osmId,
    name,
    lat, lng,
    category,
    ...deriveAccess({}, category),
    // No accessibility tags in tiles — don't present a venue-type guess as a rating.
    accessScore: null,
    accessLabel: 'Not yet assessed',
    tags: { name },
  }
}

/** Places of `category` in the map's loaded tiles within `radiusM` of `center`, nearest first. */
export function poisFromTiles(map: MlMap, category: CategoryKey, center: [number, number], radiusM = 5000): Poi[] {
  let feats: ReturnType<MlMap['querySourceFeatures']>
  try { feats = map.querySourceFeatures('openmaptiles', { sourceLayer: 'poi' }) } catch { return [] }
  const match = CLASSES[category]
  const seen = new Set<string>()
  const out: (Poi & { _d: number })[] = []
  for (const f of feats) {
    const p = f.properties as Record<string, string>
    if (!p?.name || f.geometry.type !== 'Point' || !match(p.class ?? '', p.subclass ?? '')) continue
    const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates
    // Tiles overlap at their edges, so the same place can appear twice.
    const osmId = osmIdFromTileId(f.id)
    const key = osmId || `${p.name}|${lat.toFixed(4)}|${lng.toFixed(4)}`
    if (seen.has(key)) continue
    seen.add(key)
    const d = haversineKm(center, [lat, lng]) * 1000
    if (d > radiusM) continue
    out.push({ ...tilePoi(p.name, lat, lng, category, osmId, `${category}-${f.id ?? key}`), _d: d })
  }
  return out.sort((a, b) => a._d - b._d).slice(0, 60).map(({ _d, ...poi }) => poi)
}

/** Tiles only include individual places at street-level zoom. */
export const TILE_POI_MIN_ZOOM = 13.5

/* ── Area sweep: every named place around a point, independent of the map view ── */

const Z = 14
let tileUrlP: Promise<string> | null = null
/** The current tile URL template (OpenFreeMap versions its tile paths). */
function tileUrl(): Promise<string> {
  return (tileUrlP ??= (async () => {
    const style = await (await fetch(STYLE_URL)).json()
    const src = style.sources?.openmaptiles
    const tj = src?.tiles ? src : await (await fetch(src.url)).json()
    return tj.tiles[0] as string
  })().catch((e) => { tileUrlP = null; throw e }))
}

const tileCache = new Map<string, Promise<VectorTile>>()
function loadTile(url: string, signal?: AbortSignal): Promise<VectorTile> {
  let p = tileCache.get(url)
  if (!p) {
    p = fetch(url, { signal }).then(async (r) => {
      if (!r.ok) throw new Error(`tile ${r.status}`)
      return new VectorTile(new Pbf(new Uint8Array(await r.arrayBuffer())))
    })
    p.catch(() => tileCache.delete(url))
    tileCache.set(url, p)
  }
  return p
}

const lng2x = (lng: number) => ((lng + 180) / 360) * 2 ** Z
const lat2y = (lat: number) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** Z
const x2lng = (x: number) => (x / 2 ** Z) * 360 - 180
const y2lat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** Z))) * 180) / Math.PI

/**
 * Every named place of `category` within `radiusM` of `center`, read from the
 * street-level map tiles (nearest tiles first), nearest place first, capped at `limit`.
 */
export async function placesAround(
  center: [number, number], category: CategoryKey, radiusM: number, signal?: AbortSignal, limit = 150,
): Promise<Poi[]> {
  const [lat, lng] = center
  const dLat = radiusM / 111_320
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180))
  const x0 = Math.floor(lng2x(lng - dLng)), x1 = Math.floor(lng2x(lng + dLng))
  const y0 = Math.floor(lat2y(lat + dLat)), y1 = Math.floor(lat2y(lat - dLat))
  const cx = lng2x(lng), cy = lat2y(lat)
  const tiles: [number, number][] = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push([x, y])
  tiles.sort((a, b) => Math.hypot(a[0] + 0.5 - cx, a[1] + 0.5 - cy) - Math.hypot(b[0] + 0.5 - cx, b[1] + 0.5 - cy))

  const template = await tileUrl()
  const match = CLASSES[category]
  const seen = new Set<string>()
  const out: (Poi & { _d: number })[] = []
  const results = await Promise.allSettled(tiles.map(([x, y]) =>
    loadTile(template.replace('{z}', String(Z)).replace('{x}', String(x)).replace('{y}', String(y)), signal)
      .then((vt) => ({ vt, x, y }))))
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (results.every((r) => r.status === 'rejected')) throw new Error('Map tiles unavailable')

  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    const { vt, x, y } = r.value
    const layer = vt.layers.poi
    if (!layer) continue
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i)
      const p = f.properties as Record<string, string>
      if (!p.name || f.type !== 1 || !match(String(p.class ?? ''), String(p.subclass ?? ''))) continue
      const osmId = osmIdFromTileId(f.id)
      const pt = f.loadGeometry()[0]?.[0]
      if (!pt) continue
      const plat = y2lat(y + pt.y / layer.extent), plng = x2lng(x + pt.x / layer.extent)
      const key = osmId || `${p.name}|${plat.toFixed(4)}|${plng.toFixed(4)}`
      if (seen.has(key)) continue
      seen.add(key)
      const d = haversineKm(center, [plat, plng]) * 1000
      if (d > radiusM) continue
      out.push({ ...tilePoi(String(p.name), plat, plng, category, osmId, `${category}-${key}`), _d: d })
    }
  }
  return out.sort((a, b) => a._d - b._d).slice(0, limit).map(({ _d, ...poi }) => poi)
}
