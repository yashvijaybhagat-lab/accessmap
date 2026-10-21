import maplibregl, { type Map as MlMap, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getA11y, motionReduced } from './a11y'

/* ------------------------------------------------------------------ *
 * Shared 3D map factory (MapLibre GL + OpenFreeMap vector tiles).
 * Free, key-less, global. Buildings are extruded in 3D at street zoom;
 * the "Flat 2D map" / "Reduce motion" accessibility settings switch to a
 * top-down view with no tilt animation.
 * ------------------------------------------------------------------ */

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
export const TILT_3D = 55

/** Accessible, softer palette for the stock "liberty" style. */
function polishStyle(map: MlMap) {
  const has = (id: string) => !!map.getLayer(id)
  if (has('building-3d')) {
    map.setPaintProperty('building-3d', 'fill-extrusion-color', [
      'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 0],
      0, '#e9e6f0', 30, '#dcd8e8', 120, '#c9c3dc',
    ])
    map.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0.92)
  }
  try {
    map.setSky({
      'sky-color': '#cfe3ff', 'horizon-color': '#eef4ff', 'fog-color': '#f4f6fb',
      'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.6,
    })
  } catch { /* older style spec — sky is optional */ }
  try { map.setLight({ anchor: 'viewport', color: '#ffffff', intensity: 0.35, position: [1.4, 210, 35] }) } catch { /* optional */ }
}

/** Show/hide 3D extrusions and set the camera pitch for 2D vs 3D. */
export function setMapMode(map: MlMap, flat: boolean, moveCamera = true) {
  const apply = () => {
    if (map.getLayer('building-3d')) map.setLayoutProperty('building-3d', 'visibility', flat ? 'none' : 'visible')
    if (map.getLayer('building')) map.setLayoutProperty('building', 'visibility', 'visible')
  }
  if (map.isStyleLoaded()) apply(); else map.once('styledata', apply)
  map.setMaxPitch(flat ? 0 : 70)
  map.dragRotate[flat ? 'disable' : 'enable']()
  map.touchPitch[flat ? 'disable' : 'enable']()
  if (!moveCamera) return
  const pitch = flat ? 0 : TILT_3D
  if (motionReduced()) map.jumpTo({ pitch, bearing: flat ? 0 : map.getBearing() })
  else map.easeTo({ pitch, bearing: flat ? 0 : map.getBearing(), duration: 600 })
}

export interface CreateOpts {
  center?: [number, number] // [lat, lng]
  zoom?: number
  label?: string
}

/** Create a map. Throws if WebGL is unavailable — callers show a fallback. */
export function createMap(container: HTMLElement, opts: CreateOpts = {}): MlMap {
  const flat = getA11y().flatMap
  const [lat, lng] = opts.center ?? [39.5, -20]
  const map = new maplibregl.Map({
    container,
    style: STYLE_URL as string | StyleSpecification,
    center: [lng, lat],
    zoom: opts.zoom ?? 2.5,
    pitch: flat ? 0 : TILT_3D,
    maxPitch: flat ? 0 : 70,
    attributionControl: { compact: true },
    cooperativeGestures: false,
    fadeDuration: motionReduced() ? 0 : 300,
    locale: {
      'NavigationControl.ZoomIn': 'Zoom in',
      'NavigationControl.ZoomOut': 'Zoom out',
      'Map.Title': opts.label ?? 'Map',
    },
  })
  map.keyboard.enable()
  if (flat) { map.dragRotate.disable(); map.touchPitch.disable() }
  // Layers only — moving the camera here would cancel any fly-to already in progress.
  map.on('style.load', () => { polishStyle(map); setMapMode(map, getA11y().flatMap, false) })
  const canvas = map.getCanvas()
  canvas.setAttribute('aria-label', `${opts.label ?? 'Map'}. Use arrow keys to pan and plus or minus to zoom.`)
  canvas.setAttribute('role', 'application')
  return map
}

/** Move the camera, honouring reduced motion. */
export function moveTo(map: MlMap, lat: number, lng: number, zoom?: number) {
  const opts = { center: [lng, lat] as [number, number], zoom: zoom ?? map.getZoom() }
  if (motionReduced()) map.jumpTo(opts)
  else map.flyTo({ ...opts, duration: 900, essential: false })
}

/** Fit to bounds of [lat,lng] points, honouring reduced motion. */
export function fitPoints(map: MlMap, pts: [number, number][], padding: number | maplibregl.PaddingOptions = 60) {
  if (!pts.length) return
  const b = new maplibregl.LngLatBounds()
  pts.forEach(([la, ln]) => b.extend([ln, la]))
  const pad = typeof padding === 'number' ? { top: padding, bottom: padding, left: padding, right: padding } : padding
  map.fitBounds(b, { padding, maxZoom: 17, duration: motionReduced() ? 0 : 800 })
  // With the map tilted, fitBounds fits the ground plane, so near/far points can
  // still spill past the padding. Check the projected points and zoom out until
  // everything is inside the visible box (a few steps at most).
  let tries = 0
  const check = () => {
    const c = map.getCanvas()
    const w = c.clientWidth, h = c.clientHeight
    const box = { l: pad.left ?? 0, r: w - (pad.right ?? 0), t: pad.top ?? 0, btm: h - (pad.bottom ?? 0) }
    const step = Math.max(1, Math.floor(pts.length / 200))
    let ok = true
    let sx = 0, sy = 0, n = 0
    for (let i = 0; i < pts.length; i += step) {
      const p = map.project([pts[i][1], pts[i][0]])
      sx += p.x; sy += p.y; n++
      if (p.x < box.l || p.x > box.r || p.y < box.t || p.y > box.btm) ok = false
    }
    if (ok || ++tries > 4) return
    // Re-centre on the points' screen centroid, shifted to the padded box centre, and zoom out a little.
    const target = map.unproject([sx / n - ((box.l + box.r) / 2 - w / 2), sy / n - ((box.t + box.btm) / 2 - h / 2)])
    map.easeTo({ center: target, zoom: map.getZoom() - 0.35, duration: motionReduced() ? 0 : 250 })
    map.once('moveend', check)
  }
  map.once('moveend', check)
}

/** Add or replace a GeoJSON source's data. */
export function setGeo(map: MlMap, id: string, data: GeoJSON.FeatureCollection) {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined
  if (src) src.setData(data)
  else map.addSource(id, { type: 'geojson', data })
}

/** Run `fn` once the style is ready (immediately if it already is). */
export function whenReady(map: MlMap, fn: () => void) {
  if (map.isStyleLoaded()) fn()
  else map.once('load', fn)
}

export function webglSupported(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}

export { maplibregl }
