import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Building2, ArrowLeft, CheckCircle2, XCircle, Info } from 'lucide-react'
import Layout from '../components/Layout'
import { getIndoorMap, getFeatureIcon, FEATURE_LABELS } from '../lib/indoorMaps'
import { getPlace } from '../lib/data'
import { scoreColor } from '../components/ScoreRing'
import type { IndoorMap, IndoorFeature } from '../lib/indoorMaps'
import type { Place } from '../types'

function FloorGrid({ features, floor }: { features: IndoorFeature[]; floor: number }) {
  const floorFeatures = features.filter((f) => f.floor === floor)
  return (
    <div className="relative h-48 rounded-xl border border-border bg-card overflow-hidden" aria-label={`Floor ${floor} map`}>
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 40px)' }}
        aria-hidden="true" />
      {floorFeatures.map((f) => (
        <div
          key={f.id}
          className="absolute flex flex-col items-center gap-0.5"
          style={{ left: `${f.x}%`, top: `${f.y}%`, transform: 'translate(-50%,-50%)' }}
          title={`${FEATURE_LABELS[f.type]}${f.notes ? ` — ${f.notes}` : ''}`}
          aria-label={`${FEATURE_LABELS[f.type]} at this location${f.accessible ? ', accessible' : ', not accessible'}`}
        >
          <span className="text-xl" aria-hidden="true">{getFeatureIcon(f.type)}</span>
          <span className={`text-[9px] font-medium px-1 rounded ${f.accessible ? 'text-primary' : 'text-red-400'}`}>
            {FEATURE_LABELS[f.type]}
          </span>
        </div>
      ))}
      <span className="absolute bottom-2 left-2 text-xs text-muted">
        {floor === 0 ? 'Ground floor' : floor > 0 ? `Floor ${floor}` : `Basement ${Math.abs(floor)}`}
      </span>
    </div>
  )
}

export default function IndoorMapPage() {
  const { id = '' } = useParams()
  const [place, setPlace] = useState<Place | null>(null)
  const [indoorMap, setIndoorMap] = useState<IndoorMap | null>(null)
  const [activeFloor, setActiveFloor] = useState(0)

  useEffect(() => {
    getPlace(id).then(setPlace)
    const m = getIndoorMap(id)
    setIndoorMap(m)
    if (m) setActiveFloor(m.floors[0] ?? 0)
  }, [id])

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link to={`/place/${id}`} className="mb-4 flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={14} aria-hidden="true" /> Back to {place?.name ?? 'place'}
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <Building2 size={22} className="text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-bold">{place?.name ?? '…'} — Indoor Map</h1>
            <p className="text-xs text-muted">Crowdsourced accessibility features by floor</p>
          </div>
        </div>

        {!indoorMap ? (
          <div className="card p-8 text-center text-muted">
            <Building2 size={32} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">No indoor map yet</p>
            <p className="mt-1 text-sm">Be the first to map accessibility features inside this building.</p>
            <button className="btn-primary mt-4">Contribute indoor data</button>
          </div>
        ) : (
          <>
            {/* Score + meta */}
            <div className="mb-6 flex items-center justify-between card p-4">
              <div>
                <p className="label">Indoor accessibility score</p>
                <p className="mt-1 text-3xl font-bold font-mono"
                  style={{ color: scoreColor(indoorMap.overallIndoorScore) }}>
                  {indoorMap.overallIndoorScore}/10
                </p>
              </div>
              <div className="text-right text-xs text-muted">
                <p>{indoorMap.features.length} features mapped</p>
                <p>{indoorMap.floors.length} floor{indoorMap.floors.length !== 1 ? 's' : ''}</p>
                <p>Updated {new Date(indoorMap.contributedAt).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Floor selector */}
            <div className="mb-3 flex gap-2" role="group" aria-label="Select floor">
              {indoorMap.floors.map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFloor(f)}
                  aria-pressed={f === activeFloor}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    f === activeFloor
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted hover:border-primary/50'
                  }`}
                >
                  {f === 0 ? 'Ground' : f > 0 ? `Floor ${f}` : `B${Math.abs(f)}`}
                </button>
              ))}
            </div>

            {/* Floor grid */}
            <FloorGrid features={indoorMap.features} floor={activeFloor} />

            {/* Feature list for active floor */}
            <div className="mt-4 space-y-2">
              {indoorMap.features.filter((f) => f.floor === activeFloor).map((f) => (
                <div key={f.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                  <span className="text-xl" aria-hidden="true">{getFeatureIcon(f.type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{f.label}</p>
                    {f.notes && <p className="text-xs text-muted">{f.notes}</p>}
                  </div>
                  {f.accessible
                    ? <CheckCircle2 size={16} className="text-primary shrink-0" aria-label="Accessible" />
                    : <XCircle size={16} className="text-red-400 shrink-0" aria-label="Not accessible" />}
                </div>
              ))}
            </div>

            {indoorMap.notes && (
              <div className="mt-4 flex gap-2 rounded-xl border border-border p-3 text-xs text-muted">
                <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                {indoorMap.notes}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
