import type { AccessContext } from './rating'
import { tileFacts } from './tilePois'

/* ------------------------------------------------------------------ *
 * Measured surroundings of a place, from free key-less sources:
 *   - ground slope: open terrain tiles (Mapzen "Terrarium" elevation tiles on
 *     AWS Open Data, ~10 m terrain in the US) — decoded in the browser, so
 *     there are no per-request limits; one tile covers a whole neighbourhood
 *   - building height + nearest car park: OpenFreeMap street-level tiles
 * Results are cached in localStorage — terrain and buildings rarely change.
 * ------------------------------------------------------------------ */

const TERRAIN = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
const TZ = 14         // ~8 m per pixel at mid latitudes
const BASE_M = 30     // slope measured across 30 m either side of the place

const cacheKey = (lat: number, lng: number) => `am.ctx.${lat.toFixed(4)},${lng.toFixed(4)}`
function cached(lat: number, lng: number): AccessContext | undefined {
  try { const raw = localStorage.getItem(cacheKey(lat, lng)); return raw ? JSON.parse(raw) : undefined } catch { return undefined }
}
function remember(lat: number, lng: number, c: AccessContext) {
  try { localStorage.setItem(cacheKey(lat, lng), JSON.stringify(c)) } catch { /* full / blocked */ }
}

const demCache = new Map<string, Promise<Uint8ClampedArray | null>>()
/** RGB pixels of one terrain tile (Terrarium: metres = R·256 + G + B/256 − 32768). */
function demTile(x: number, y: number, signal?: AbortSignal): Promise<Uint8ClampedArray | null> {
  const key = `${x}/${y}`
  let p = demCache.get(key)
  if (!p) {
    p = (async () => {
      const res = await fetch(`${TERRAIN}/${TZ}/${x}/${y}.png`, { signal })
      if (!res.ok) return null
      const bmp = await createImageBitmap(await res.blob())
      const canvas: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(bmp.width, bmp.height)
        : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height })
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
      if (!ctx) return null
      ctx.drawImage(bmp, 0, 0)
      return ctx.getImageData(0, 0, bmp.width, bmp.height).data
    })().catch(() => null)
    demCache.set(key, p)
    p.then((d) => { if (!d) demCache.delete(key) })
  }
  return p
}

async function elevationAt(lat: number, lng: number, signal?: AbortSignal): Promise<number | null> {
  const n = 2 ** TZ
  const fx = ((lng + 180) / 360) * n
  const fy = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n
  const x = Math.floor(fx), y = Math.floor(fy)
  const px = Math.min(255, Math.floor((fx - x) * 256)), py = Math.min(255, Math.floor((fy - y) * 256))
  const d = await demTile(x, y, signal)
  if (!d) return null
  const i = (py * 256 + px) * 4
  return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768
}

/** Steepest ground slope (%) through the place, from N–S and E–W elevation differences. */
async function slopeAt(lat: number, lng: number, signal?: AbortSignal): Promise<number | undefined> {
  const dLat = BASE_M / 111_320
  const dLng = BASE_M / (111_320 * Math.cos((lat * Math.PI) / 180))
  const [n, s, e, w] = await Promise.all([
    elevationAt(lat + dLat, lng, signal), elevationAt(lat - dLat, lng, signal),
    elevationAt(lat, lng + dLng, signal), elevationAt(lat, lng - dLng, signal),
  ])
  if (n == null || s == null || e == null || w == null) return undefined
  return Math.round((Math.max(Math.abs(n - s), Math.abs(e - w)) / (2 * BASE_M)) * 1000) / 10
}

/** Measured context for each place, keyed by `id`. Missing facts are simply left out. */
export async function contextFor(
  places: { id: string; lat: number; lng: number }[], signal?: AbortSignal,
): Promise<Map<string, AccessContext>> {
  const result = new Map<string, AccessContext>()
  const todo: typeof places = []
  for (const p of places) {
    const c = cached(p.lat, p.lng)
    if (c) result.set(p.id, c)
    else todo.push(p)
  }
  if (!todo.length) return result
  const [slope, facts] = await Promise.all([
    Promise.all(todo.map((p) => slopeAt(p.lat, p.lng, signal).catch(() => undefined))),
    Promise.all(todo.map((p) => tileFacts(p.lat, p.lng, signal).catch(() => ({})))),
  ])
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  todo.forEach((p, i) => {
    const c: AccessContext = { ...facts[i] }
    if (slope[i] != null) c.slopePct = slope[i]
    result.set(p.id, c)
    // Only cache complete measurements, so a failed elevation call is retried next time.
    if (c.slopePct != null) remember(p.lat, p.lng, c)
  })
  return result
}
