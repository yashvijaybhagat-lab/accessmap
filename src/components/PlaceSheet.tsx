import { Link } from 'react-router-dom'
import {
  Accessibility, CheckCircle2, ExternalLink, ArrowUpDown, Zap, Toilet,
  Ear, Brain, Info, Clock,
} from 'lucide-react'
import { scoreColor } from './ScoreRing'
import { googleMapsTo } from '../lib/maps'
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

function poiBadges(p: Poi): React.ReactNode[] {
  const b: React.ReactNode[] = []
  if (p.stepCount === 0) b.push(<span key="sf" className="badge-green"><CheckCircle2 size={10} /> Step-free</span>)
  if (p.stepCount != null && p.stepCount > 0) b.push(<span key="st" className="badge-red"><Info size={10} /> {p.stepCount} step{p.stepCount !== 1 ? 's' : ''}</span>)
  if (p.hasRamp) b.push(<span key="ramp" className="badge-green"><ArrowUpDown size={10} /> Ramp</span>)
  if (p.hasLift) b.push(<span key="lift" className="badge-green"><Zap size={10} /> Lift</span>)
  if (p.accessibleToilet) b.push(<span key="wc" className="badge-green"><Toilet size={10} /> Accessible WC</span>)
  if (p.hearingLoop) b.push(<span key="hl" className="badge-green"><Ear size={10} /> Hearing loop</span>)
  if (p.quietRoom) b.push(<span key="qr" className="badge-green"><Brain size={10} /> Quiet room</span>)
  if (p.brailleMenu) b.push(<span key="br" className="badge-green">Braille</span>)
  return b
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

  return (
    <div className="px-5 pb-5 pt-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-snug text-ink">{p.name}</h2>
          {p.address && <p className="mt-0.5 text-sm text-muted">{p.address}</p>}
        </div>
        {selected.kind === 'poi' && selected.data.accessScore != null && (
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-white"
            style={{ background: scoreColor(selected.data.accessScore) }}
          >
            {selected.data.accessScore.toFixed(1)}/10
          </span>
        )}
      </div>

      {selected.kind === 'place' && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {DIMS.map(({ key, label }) => (
            <div key={key} className="rounded-xl bg-surface px-2 py-2 text-center">
              <span
                className="mx-auto mb-1 block h-2 w-2 rounded-full"
                style={{ background: scoreColor(selected.data.scores[key]) }}
              />
              <p className="text-[10px] text-muted">{label}</p>
              <p className="text-sm font-semibold text-ink">{selected.data.scores[key]}</p>
            </div>
          ))}
        </div>
      )}

      {selected.kind === 'poi' && (() => {
        const badges = poiBadges(selected.data)
        return (
          <>
            {badges.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{badges}</div>}
            {selected.data.wheelchairDescription && (
              <p className="mt-2.5 text-[13px] italic leading-snug text-muted">"{selected.data.wheelchairDescription}"</p>
            )}
            {selected.data.openingHours && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Clock size={12} /> {selected.data.openingHours}</p>
            )}
          </>
        )
      })()}

      <div className="mt-4 flex gap-2">
        <Link
          to={detailHref}
          onClick={onClose}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-white"
        >
          <Accessibility size={15} aria-hidden="true" /> Full details
        </Link>
        <a
          href={googleMapsTo([p.lat, p.lng])}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold text-ink"
        >
          <ExternalLink size={15} aria-hidden="true" /> Directions
        </a>
      </div>
    </div>
  )
}
