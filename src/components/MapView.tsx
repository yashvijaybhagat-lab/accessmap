import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { Plus, Minus, Compass, Box, Square } from 'lucide-react'
import type { Map as MlMap, Marker } from 'maplibre-gl'
import type { Place } from '../types'
import { type Poi } from '../lib/overpass'
import { scoreColor, scoreWord } from './ScoreRing'
import type { TransitLine, TransitStation, WalkingPath } from '../lib/transit'
import { createMap, moveTo, setGeo, setMapMode, whenReady, webglSupported, maplibregl } from '../lib/map3d'
import { useA11y } from '../lib/a11y'

interface Props {
  places: Place[]
  pois?: Poi[]
  alertPlaceIds: Set<string>
  userLocation?: { lat: number; lng: number; accuracy?: number } | null
  focus?: { lat: number; lng: number; zoom?: number } | null
  selectedId?: string | null
  onSelect?: (place: Place) => void
  onPoiSelect?: (poi: Poi) => void
  onCenterChange?: (lat: number, lng: number) => void
  className?: string
  transitLines?: TransitLine[]
  transitStations?: TransitStation[]
  walkingPaths?: WalkingPath[]
  /** Extra floating buttons stacked above the zoom controls (locate, layers…). */
  controls?: ReactNode
  /** CSS bottom offset for the control stack. */
  controlsBottom?: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

// One decimal so the number always agrees with the colour band (7.7 must not read as "8").
const pinScore = (n: number) => (n >= 10 ? '10' : n.toFixed(1))

/** A pin is a real <button>: focusable, labelled, and shows the score as text. */
function pinEl(opts: { color: string; text: string; label: string; ring?: string; big?: boolean; onClick: () => void }) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'map-pin'
  btn.setAttribute('aria-label', opts.label)
  btn.title = opts.label
  const w = opts.big ? 38 : 32
  const h = Math.round(w * 1.25)
  btn.innerHTML = `<span class="map-pin-inner" style="width:${w}px;height:${h}px">
    <svg width="${w}" height="${h}" viewBox="0 0 32 40" aria-hidden="true">
      <path d="M16 39s13-14.2 13-23.5C29 7.5 23.2 1.5 16 1.5S3 7.5 3 15.5C3 24.8 16 39 16 39z" fill="${opts.color}" stroke="${opts.ring ?? '#fff'}" stroke-width="2.5"/>
    </svg>
    <span class="map-pin-label">${esc(opts.text)}</span>
  </span>`
  btn.addEventListener('click', (e) => { e.stopPropagation(); opts.onClick() })
  return btn
}

function MapView({
  places, pois = [], alertPlaceIds, userLocation, focus, selectedId, onSelect, onPoiSelect, onCenterChange,
  className, transitLines = [], transitStations = [], walkingPaths = [], controls, controlsBottom,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const markers = useRef<Marker[]>([])
  const stationMarkers = useRef<Marker[]>([])
  const userMarker = useRef<Marker | null>(null)
  const cb = useRef({ onSelect, onPoiSelect, onCenterChange })
  cb.current = { onSelect, onPoiSelect, onCenterChange }
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const [bearing, setBearing] = useState(0)
  const flat = useA11y((s) => s.flatMap)
  const colorSafe = useA11y((s) => s.colorSafe)
  const setA11y = useA11y((s) => s.set)

  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    if (!webglSupported()) { setFailed(true); return }
    let map: MlMap
    try {
      map = createMap(elRef.current, { label: 'Accessibility map' })
    } catch {
      setFailed(true); return
    }
    mapRef.current = map
    const emit = () => { const c = map.getCenter(); cb.current.onCenterChange?.(c.lat, c.lng) }
    map.on('moveend', emit)
    map.on('rotate', () => setBearing(map.getBearing()))
    map.on('load', () => { setReady(true); emit() })
    map.on('error', (e) => console.warn('[map]', e?.error?.message ?? e))
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(elRef.current)
    return () => { ro.disconnect(); map.remove(); mapRef.current = null }
  }, [])

  // 2D / 3D follows the accessibility setting.
  // Skip the first run: createMap already applied the mode, and easing here would cancel the initial fly-to.
  const flatInit = useRef(true)
  useEffect(() => {
    if (flatInit.current) { flatInit.current = false; return }
    if (mapRef.current) setMapMode(mapRef.current, flat)
  }, [flat])

  // Place + POI pins
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markers.current.forEach((m) => m.remove())
    markers.current = []
    places.forEach((p) => {
      const avg = (p.scores.mobility + p.scores.sensory + p.scores.hearing + p.scores.vision) / 4
      const alert = alertPlaceIds.has(p.id)
      const el = pinEl({
        color: alert ? '#b45309' : scoreColor(avg),
        ring: p.id === selectedId ? '#111827' : p.sponsored ? '#7c3aed' : '#fff',
        big: p.id === selectedId,
        text: alert ? '!' : pinScore(avg),
        label: `${p.name}. Accessibility ${avg.toFixed(1)} out of 10, ${scoreWord(avg)}${alert ? '. Active accessibility alert' : ''}${p.sponsored ? '. Featured' : ''}`,
        onClick: () => cb.current.onSelect?.(p),
      })
      markers.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map))
    })
    pois.forEach((p) => {
      const rated = p.accessScore != null
      const el = pinEl({
        color: rated ? scoreColor(p.accessScore!) : '#6b7280',
        ring: p.id === selectedId ? '#111827' : '#fff',
        big: p.id === selectedId,
        text: rated ? pinScore(p.accessScore!) : '?',
        label: `${p.name}. ${rated ? `Accessibility ${p.accessScore!.toFixed(1)} out of 10, ${p.accessLabel}` : 'Accessibility not rated'}`,
        onClick: () => cb.current.onPoiSelect?.(p),
      })
      markers.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map))
    })
  }, [places, pois, alertPlaceIds, selectedId, colorSafe])

  // User location — pulsing dot with accuracy halo
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!userLocation) { userMarker.current?.remove(); userMarker.current = null; return }
    if (!userMarker.current) {
      const el = document.createElement('div')
      el.className = 'user-dot'
      el.setAttribute('role', 'img')
      el.setAttribute('aria-label', 'Your location')
      el.innerHTML = '<span class="user-dot-pulse"></span><span class="user-dot-core"></span>'
      userMarker.current = new maplibregl.Marker({ element: el }).setLngLat([userLocation.lng, userLocation.lat]).addTo(map)
    } else {
      userMarker.current.setLngLat([userLocation.lng, userLocation.lat])
    }
  }, [userLocation])

  useEffect(() => {
    if (focus && mapRef.current) moveTo(mapRef.current, focus.lat, focus.lng, focus.zoom ?? 16)
  }, [focus])

  // Transit lines + walking paths as styled GeoJSON line layers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    whenReady(map, () => {
      setGeo(map, 'am-transit', {
        type: 'FeatureCollection',
        features: transitLines.map((l) => ({
          type: 'Feature', properties: { color: l.color, name: l.name },
          geometry: { type: 'LineString', coordinates: l.coords.map(([a, b]) => [b, a]) },
        })),
      })
      if (!map.getLayer('am-transit')) {
        map.addLayer({ id: 'am-transit-casing', type: 'line', source: 'am-transit', paint: { 'line-color': '#fff', 'line-width': 6, 'line-opacity': 0.9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
        map.addLayer({ id: 'am-transit', type: 'line', source: 'am-transit', paint: { 'line-color': ['get', 'color'], 'line-width': 3.5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
      }
      stationMarkers.current.forEach((m) => m.remove())
      stationMarkers.current = transitStations.map((st) => {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'station-pin'
        const access = st.wheelchair === 'yes' ? 'step-free access' : st.wheelchair === 'limited' ? 'limited access' : st.wheelchair === 'no' ? 'not step-free' : 'access unknown'
        el.setAttribute('aria-label', `${st.name}, ${st.type} station, ${access}`)
        el.innerHTML = `<span aria-hidden="true">${st.wheelchair === 'yes' ? '♿' : st.type === 'bus' ? 'B' : 'T'}</span>`
        const popup = new maplibregl.Popup({ offset: 16, closeButton: true, className: 'am-popup' }).setHTML(
          `<p class="am-popup-title">${esc(st.name)}</p><p class="am-popup-sub">${esc(st.type)} station · ${access}</p>`,
        )
        return new maplibregl.Marker({ element: el }).setLngLat([st.lng, st.lat]).setPopup(popup).addTo(map)
      })
    })
  }, [transitLines, transitStations, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    whenReady(map, () => {
      setGeo(map, 'am-walk', {
        type: 'FeatureCollection',
        features: walkingPaths.map((p) => ({
          type: 'Feature', properties: { steps: p.highway === 'steps' ? 1 : 0 },
          geometry: { type: 'LineString', coordinates: p.coords.map(([a, b]) => [b, a]) },
        })),
      })
      if (!map.getLayer('am-walk')) {
        map.addLayer({
          id: 'am-walk', type: 'line', source: 'am-walk',
          paint: {
            'line-color': ['case', ['==', ['get', 'steps'], 1], '#b45309', '#15803d'],
            'line-width': ['case', ['==', ['get', 'steps'], 1], 3, 2.5],
            'line-dasharray': ['case', ['==', ['get', 'steps'], 1], ['literal', [1, 1]], ['literal', [1, 0]]],
            'line-opacity': 0.85,
          },
          layout: { 'line-cap': 'round' },
        })
      }
    })
  }, [walkingPaths, ready])

  const zoom = (d: number) => mapRef.current?.zoomTo(mapRef.current.getZoom() + d, { duration: 250 })
  const resetNorth = () => mapRef.current?.resetNorthPitch({ duration: 400 })

  if (failed) {
    return (
      <div className={`${className ?? 'h-full w-full'} flex items-center justify-center bg-surface p-6 text-center`} role="alert">
        <div className="max-w-xs">
          <p className="font-semibold text-ink">The interactive map can't load on this device</p>
          <p className="mt-1 text-sm text-muted">Your browser has WebGL turned off. Use the list view to browse places — everything on the map is available there.</p>
        </div>
      </div>
    )
  }

  const ctlBtn = 'flex h-[44px] w-[44px] items-center justify-center text-ink hover:bg-surface disabled:opacity-40'
  return (
    <div className={`relative ${className ?? 'h-full w-full'}`}>
      {/* Inline position: maplibre's CSS sets .maplibregl-map { position: relative }, which would beat a utility class. */}
      <div ref={elRef} style={{ position: 'absolute', inset: 0 }} />
      <div
        className="absolute right-3 z-[700] flex flex-col items-end gap-2"
        style={{ bottom: controlsBottom ?? '1rem' }}
      >
        {controls}
        <button
          onClick={() => setA11y('flatMap', !flat)}
          aria-pressed={!flat}
          aria-label={flat ? 'Switch to 3D map' : 'Switch to flat 2D map'}
          className="map-ctl glass font-bold text-ink"
        >
          {flat ? <Square size={16} aria-hidden="true" /> : <Box size={16} aria-hidden="true" />}
          <span aria-hidden="true">{flat ? '2D' : '3D'}</span>
        </button>
        {Math.abs(bearing) > 2 && (
          <button onClick={resetNorth} aria-label="Reset map to north" className="glass flex h-[44px] w-[44px] items-center justify-center rounded-full text-ink">
            <Compass size={18} style={{ transform: `rotate(${-bearing - 45}deg)` }} aria-hidden="true" />
          </button>
        )}
        <div className="glass flex flex-col overflow-hidden rounded-2xl" role="group" aria-label="Zoom">
          <button onClick={() => zoom(1)} aria-label="Zoom in" className={ctlBtn}><Plus size={18} aria-hidden="true" /></button>
          <span className="mx-2 h-px bg-border" aria-hidden="true" />
          <button onClick={() => zoom(-1)} aria-label="Zoom out" className={ctlBtn}><Minus size={18} aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  )
}

export default memo(MapView)
