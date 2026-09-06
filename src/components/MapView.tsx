import { memo, useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import type { Place } from '../types'
import { type Poi } from '../lib/overpass'
import { scoreColor } from './ScoreRing'
import type { TransitLine, TransitStation, WalkingPath } from '../lib/transit'

const accessColor = (p: Poi) => (p.accessScore != null ? scoreColor(p.accessScore) : '#9aa0a6')

interface Props {
  places: Place[]
  pois?: Poi[]
  alertPlaceIds: Set<string>
  userLocation?: { lat: number; lng: number } | null
  focus?: { lat: number; lng: number; zoom?: number } | null
  onSelect?: (place: Place) => void
  onPoiSelect?: (poi: Poi) => void
  onCenterChange?: (lat: number, lng: number) => void
  className?: string
  transitLines?: TransitLine[]
  transitStations?: TransitStation[]
  walkingPaths?: WalkingPath[]
}

function pin(color: string, size = 28) {
  const h = Math.round(size * 1.28)
  return L.divIcon({
    className: 'am-pin',
    html: `<div style="animation:pinDrop 380ms cubic-bezier(0.34,1.56,0.64,1) both;transform-origin:bottom center">
      <svg width="${size}" height="${h}" viewBox="0 0 28 36" fill="none" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.22))">
        <path d="M14 0C7.373 0 2 5.373 2 12c0 8.5 12 24 12 24S26 20.5 26 12C26 5.373 20.627 0 14 0Z" fill="${color}"/>
        <circle cx="14" cy="12" r="5" fill="rgba(255,255,255,0.9)"/>
      </svg></div>`,
    iconSize: [size, h],
    iconAnchor: [size / 2, h],
  })
}

const PLACE_ICON = pin('#0ABFBF')
const ALERT_ICON = pin('#f97316')
const SPONSOR_ICON = pin('#8b5cf6', 32)

const pinCache = new Map<string, L.DivIcon>()
const cachedPin = (color: string) => {
  let ic = pinCache.get(color)
  if (!ic) { ic = pin(color); pinCache.set(color, ic) }
  return ic
}

const gmaps = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`

function popupHtml(
  name: string, address: string | undefined,
  scoreHtml: string, terrainHtml: string,
  lat: number, lng: number,
  detailHref?: string,
) {
  return `<div style="min-width:200px;font-family:'Inter',system-ui,sans-serif">
    <p style="margin:0;font-size:14px;font-weight:600;color:#111827;line-height:1.3">${name}</p>
    ${address ? `<p style="margin:4px 0 0;font-size:12px;color:#6b7280">${address}</p>` : ''}
    <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">${scoreHtml}${terrainHtml}</div>
    <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
      ${detailHref ? `<a href="${detailHref}"
        style="display:inline-flex;align-items:center;gap:4px;padding:5px 12px;background:#1a73e8;color:#fff;border-radius:999px;font-size:12px;font-weight:600;text-decoration:none">
        View details →
      </a>` : ''}
      <a href="${gmaps(lat, lng)}" target="_blank" rel="noreferrer"
        style="display:inline-flex;align-items:center;gap:4px;padding:5px 12px;background:#0ABFBF;color:#fff;border-radius:999px;font-size:12px;font-weight:600;text-decoration:none">
        Directions ↗
      </a>
    </div>
  </div>`
}

const STATION_ICONS: Record<string, string> = {
  train: '🚆',
  subway: '🚇',
  tram: '🚊',
  bus: '🚌',
}

function stationIcon(type: TransitStation['type']) {
  return L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:13px">${STATION_ICONS[type] ?? '🚆'}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function MapView({ places, pois = [], alertPlaceIds, userLocation, focus, onSelect, onPoiSelect, onCenterChange, className, transitLines = [], transitStations = [], walkingPaths = [] }: Props) {
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onPoiSelectRef = useRef(onPoiSelect)
  onPoiSelectRef.current = onPoiSelect
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const placeLayer = useRef<L.LayerGroup | null>(null)
  const poiLayer = useRef<L.LayerGroup | null>(null)
  const transitLayer = useRef<L.LayerGroup | null>(null)
  const walkLayer = useRef<L.LayerGroup | null>(null)
  const userMarker = useRef<L.Marker | null>(null)
  const onCenterRef = useRef(onCenterChange)
  onCenterRef.current = onCenterChange

  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([39.5, -20], 3)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abc',
    }).addTo(map)

    // Zoom control bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    // Minimal attribution bottom-right
    L.control.attribution({ position: 'bottomright', prefix: false })
      .addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors')
      .addTo(map)

    placeLayer.current = L.layerGroup().addTo(map)
    poiLayer.current = L.layerGroup().addTo(map)
    transitLayer.current = L.layerGroup().addTo(map)
    walkLayer.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const emit = () => { const c = map.getCenter(); onCenterRef.current?.(c.lat, c.lng) }
    map.on('moveend', emit)
    emit()
    setTimeout(() => map.invalidateSize(), 100)
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const layer = placeLayer.current
    if (!layer) return
    layer.clearLayers()
    places.forEach((p) => {
      const icon = p.sponsored ? SPONSOR_ICON : alertPlaceIds.has(p.id) ? ALERT_ICON : PLACE_ICON
      const avgScore = (p.scores.mobility + p.scores.sensory + p.scores.hearing + p.scores.vision) / 4
      const m = L.marker([p.lat, p.lng], {
        icon,
        keyboard: true,          // focusable + Enter/Space opens the popup
        riseOnHover: true,
        title: p.name,           // native tooltip on hover
        alt: `${p.name}, accessibility score ${avgScore.toFixed(1)} of 10${alertPlaceIds.has(p.id) ? ', active alert' : ''}`,
      })
      m.bindTooltip(p.name, { direction: 'top', offset: [0, -30], className: 'am-tooltip' })
      // Tapping a pin opens a bottom sheet (handled by the page), not a Leaflet popup.
      m.on('click', () => onSelectRef.current?.(p))
      m.addTo(layer)
    })
  }, [places, alertPlaceIds])

  useEffect(() => {
    const layer = poiLayer.current
    if (!layer) return
    layer.clearLayers()
    pois.forEach((p) => {
      const c = accessColor(p)
      const m = L.marker([p.lat, p.lng], {
        icon: cachedPin(c),
        keyboard: true,
        riseOnHover: true,
        title: p.name,
        alt: `${p.name}${p.accessScore != null ? `, accessibility score ${p.accessScore} of 10` : ', accessibility not rated'}`,
      })
      m.bindTooltip(p.name, { direction: 'top', offset: [0, -30], className: 'am-tooltip' })
      m.on('click', () => onPoiSelectRef.current?.(p))
      m.addTo(layer)
    })
  }, [pois])

  useEffect(() => {
    if (!mapRef.current) return
    userMarker.current?.remove()
    if (!userLocation) return
    userMarker.current = L.marker([userLocation.lat, userLocation.lng], {
      icon: L.divIcon({
        className: '',
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 3px rgba(37,99,235,0.25),0 2px 6px rgba(0,0,0,0.25)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    }).addTo(mapRef.current)
  }, [userLocation])

  useEffect(() => {
    if (focus && mapRef.current) mapRef.current.flyTo([focus.lat, focus.lng], focus.zoom ?? 15, { duration: 0.8 })
  }, [focus])

  useEffect(() => {
    const layer = transitLayer.current
    if (!layer) return
    layer.clearLayers()
    transitLines.forEach(line => {
      L.polyline(line.coords, { color: line.color, weight: 3, opacity: 0.85 })
        .bindTooltip(line.name, { sticky: true })
        .addTo(layer)
    })
    transitStations.forEach(st => {
      L.marker([st.lat, st.lng], { icon: stationIcon(st.type) })
        .bindPopup(`<div style="font-family:system-ui;min-width:160px">
          <p style="margin:0;font-size:14px;font-weight:600">${st.name}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#6b7280;text-transform:capitalize">${st.type} station</p>
          ${st.wheelchair ? `<p style="margin:4px 0 0;font-size:12px">♿ ${st.wheelchair === 'yes' ? 'Wheelchair accessible' : st.wheelchair === 'limited' ? 'Limited access' : 'Not accessible'}</p>` : ''}
        </div>`)
        .addTo(layer)
    })
  }, [transitLines, transitStations])

  useEffect(() => {
    const layer = walkLayer.current
    if (!layer) return
    layer.clearLayers()
    walkingPaths.forEach(path => {
      const isSteps = path.highway === 'steps'
      L.polyline(path.coords, {
        color: isSteps ? '#f59e0b' : '#16a34a',
        weight: isSteps ? 2 : 2.5,
        opacity: 0.75,
        dashArray: isSteps ? '4,4' : undefined,
      })
        .bindTooltip(
          (isSteps ? 'Steps' : 'Walking path') +
          (path.surface ? ` · ${path.surface}` : '') +
          (path.lit ? ' · Lit' : ''),
          { sticky: true },
        )
        .addTo(layer)
    })
  }, [walkingPaths])

  return <div ref={elRef} className={className ?? 'h-full w-full'} />
}

export default memo(MapView)
