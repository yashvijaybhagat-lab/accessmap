import type { Map as MlMap } from 'maplibre-gl'
import { deriveAccess, haversineKm, type CategoryKey, type Poi } from './overpass'

/* ------------------------------------------------------------------ *
 * Real places straight from the map's own vector tiles (OpenFreeMap /
 * OpenMapTiles "poi" layer, rebuilt from OpenStreetMap every few days).
 * Used when the live Overpass servers are busy, so the app shows real
 * nearby places instead of nothing. Tiles carry names and types but not
 * accessibility tags, so these places are marked as not yet assessed;
 * opening one fetches its full details.
 * ------------------------------------------------------------------ */

const CLASSES: Record<CategoryKey, (cls: string, sub: string) => boolean> = {
  restaurant: (c) => c === 'restaurant' || c === 'fast_food',
  cafe: (c) => c === 'cafe',
  hotel: (c) => c === 'lodging',
  hospital: (c, s) => c === 'hospital' || s === 'doctors' || c === 'doctors',
  pharmacy: (c) => c === 'pharmacy',
  shop: (c, s) => ['shop', 'grocery', 'clothing_store', 'alcohol_shop', 'bakery'].includes(c) || (c === 'library' && s === 'books'),
  school: (c) => c === 'school' || c === 'college',
  attraction: (c, s) => ['attraction', 'museum', 'theatre', 'zoo'].includes(c) || (c === 'art_gallery' && s !== 'artwork'),
  park: (c, s) => c === 'park' && s === 'park',
  bank: (c) => c === 'bank' || c === 'atm',
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
    const key = `${p.name}|${lat.toFixed(4)}|${lng.toFixed(4)}`
    if (seen.has(key)) continue
    seen.add(key)
    const d = haversineKm(center, [lat, lng]) * 1000
    if (d > radiusM) continue
    out.push({
      id: `tile-${category}-${f.id ?? key}`,
      osmId: '',
      name: p.name,
      lat, lng,
      category,
      ...deriveAccess({}, category),
      // No accessibility tags in tiles — don't present a venue-type guess as a rating.
      accessScore: null,
      accessLabel: 'Not yet assessed',
      tags: { name: p.name },
      _d: d,
    })
  }
  return out.sort((a, b) => a._d - b._d).slice(0, 60).map(({ _d, ...poi }) => poi)
}

/** Tiles only include individual places at street-level zoom. */
export const TILE_POI_MIN_ZOOM = 13.5
