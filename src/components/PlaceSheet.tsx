import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Accessibility, Navigation, Clock, Phone, ExternalLink } from 'lucide-react'
import { scoreColor, scoreWord } from './ScoreRing'
import AccessDescription from './AccessDescription'
import { describePlace } from '../lib/describe'
import type { Poi } from '../lib/overpass'
import type { Place, Dimension } from '../types'

export type Selected =
  | { kind: 'place'; data: Place }
  | { kind: 'poi'; data: Poi }

const DIMS: { key: Dimension; label: string }[] = [
  { key: 'mobility', label: 'Mobility' },
  { key: 'hearing', label: 'Hearing' },
  { key: 'vision', label: 'Vision' },
  { key: 'sensory', label: 'Sensory' },
]

export function routeHref(lat: number, lng: number, name: string) {
  return `/route?to=${lat.toFixed(6)},${lng.toFixed(6)}&name=${encodeURIComponent(name)}`
}

/**
 * Contents of the bottom sheet shown when a map pin is tapped. Works for both
 * curated places and OSM POIs. "Full details" navigates client-side.
 */
export default function PlaceSheet({ selected, onClose }: { selected: Selected; onClose: () => void }) {
  const p = selected.data
  const detailHref =
    selected.kind === 'place'
      ? `/place/${p.id}`
      : `/place/${p.id}?lat=${p.lat}&lng=${p.lng}&name=${encodeURIComponent(p.name)}`

  const fromTiles = selected.kind === 'poi' && selected.data.id.startsWith('tile-')
  const desc = useMemo(
    () => (selected.kind === 'poi' && selected.data.tags && !fromTiles ? describePlace(selected.data.tags, selected.data.category) : null),
    [selected, fromTiles],
  )
  const score = selected.kind === 'poi'
    ? selected.data.accessScore
    : (p as Place).scores ? (DIMS.reduce((n, d) => n + (p as Place).scores[d.key], 0) / 4) : null

  return (
    <div className="px-5 pb-5 pt-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold leading-snug text-ink">{p.name}</h2>
          {p.address && <p className="mt-0.5 text-sm text-muted">{p.address}</p>}
        </div>
        {score != null && (
          <div
            className="flex shrink-0 flex-col items-center rounded-2xl px-3 py-1.5 text-white"
            style={{ background: scoreColor(score) }}
          >
            <span className="text-lg font-extrabold leading-none">{score.toFixed(1)}</span>
            <span className="text-[10px] font-semibold opacity-95">{scoreWord(score)}</span>
          </div>
        )}
      </div>

      {selected.kind === 'poi' && selected.data.id.startsWith('placeholder') && (
        <p className="mt-3 rounded-xl bg-[#fff7ed] px-3 py-2 text-xs text-[#7c2d12]" role="note">
          <strong>Sample place</strong> — live map data couldn't load, so this isn't a real result.
        </p>
      )}

      {selected.kind === 'place' && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {DIMS.map(({ key, label }) => (
            <div key={key} className="rounded-xl bg-surface px-2 py-2 text-center">
              <span
                className="mx-auto mb-1 block h-2 w-2 rounded-full"
                style={{ background: scoreColor(selected.data.scores[key]) }}
                aria-hidden="true"
              />
              <p className="text-[11px] text-muted">{label}</p>
              <p className="text-sm font-bold text-ink">{selected.data.scores[key]}<span className="visually-hidden"> out of 10</span></p>
            </div>
          ))}
        </div>
      )}
      {selected.kind === 'place' && selected.data.features?.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Reported features">
          {selected.data.features.map((f) => <li key={f} className="badge-green">{f}</li>)}
        </ul>
      ) : null}

      {fromTiles && (
        <p className="mt-3 rounded-xl bg-[#e8f0fe] px-3 py-2 text-[13px] text-[#0b3d91]" role="note">
          Accessibility details for this place haven't loaded yet (the live database is busy). Open <strong>Full details</strong> to fetch them.
        </p>
      )}

      {desc && (
        <div className="mt-4">
          <AccessDescription name={p.name} desc={desc} compact />
        </div>
      )}

      {selected.kind === 'poi' && (selected.data.openingHours || selected.data.phone) && (
        <div className="mt-3 space-y-1 text-[13px] text-muted">
          {selected.data.openingHours && <p className="flex items-center gap-1.5"><Clock size={13} aria-hidden="true" /> {selected.data.openingHours}</p>}
          {selected.data.phone && (
            <p className="flex items-center gap-1.5"><Phone size={13} aria-hidden="true" /> <a href={`tel:${selected.data.phone}`} className="text-primary underline">{selected.data.phone}</a></p>
          )}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Link
          to={routeHref(p.lat, p.lng, p.name)}
          onClick={onClose}
          className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-white"
        >
          <Navigation size={16} aria-hidden="true" /> Accessible route
        </Link>
        <Link
          to={detailHref}
          onClick={onClose}
          className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-bold text-ink"
        >
          <Accessibility size={16} aria-hidden="true" /> Full details
        </Link>
      </div>
      {selected.kind === 'poi' && selected.data.osmId && !selected.data.id.startsWith('placeholder') && (
        <a
          href={`https://www.openstreetmap.org/${selected.data.osmId}`}
          target="_blank" rel="noreferrer"
          className="mt-3 flex items-center justify-center gap-1 text-xs text-muted hover:text-primary"
        >
          Data from OpenStreetMap — fix or add details <ExternalLink size={11} aria-hidden="true" /><span className="visually-hidden">(opens in a new tab)</span>
        </a>
      )}
    </div>
  )
}
