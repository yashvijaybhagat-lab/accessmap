import { useEffect, useState } from 'react'
import { Ear, Eye, Wind, Users, Volume2, Sun, CheckCircle2, Info } from 'lucide-react'
import Layout from '../components/Layout'
import { getPlaces } from '../lib/data'
import { MOCK_SENSORY, sensoryScore, NOISE_LABELS, CROWD_LABELS, LIGHTING_LABELS } from '../lib/sensory'
import { scoreColor } from '../components/ScoreRing'
import type { Place } from '../types'
import { Link } from 'react-router-dom'

function SensoryBar({ value, max = 5, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="flex gap-0.5" aria-hidden="true">
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className="h-2 flex-1 rounded-sm transition-colors"
          style={{ background: i < value ? color : 'rgba(255,255,255,0.1)' }}
        />
      ))}
    </div>
  )
}

export default function SensoryMap() {
  const [places, setPlaces] = useState<Place[]>([])

  useEffect(() => { getPlaces().then(setPlaces) }, [])

  const enriched = places
    .map((p) => {
      const s = MOCK_SENSORY[p.id]
      return s ? { place: p, sensory: s, score: sensoryScore(s) } : null
    })
    .filter(Boolean) as { place: Place; sensory: typeof MOCK_SENSORY[string]; score: number }[]

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-8">

        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Ear size={22} className="text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold">Sensory Accessibility</h1>
          </div>
          <p className="text-muted">
            Noise levels, lighting, crowd density, and scent intensity — scored for
            autism spectrum and sensory processing needs. An underserved community
            with nowhere to look this up until now.
          </p>
        </div>

        {/* Legend */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: Volume2, label: 'Noise', color: '#f97316' },
            { icon: Sun, label: 'Lighting', color: '#eab308' },
            { icon: Users, label: 'Crowd', color: '#8b5cf6' },
            { icon: Wind, label: 'Scent', color: '#06b6d4' },
          ].map(({ icon: Icon, label, color }) => (
            <div key={label} className="card flex items-center gap-2 p-3">
              <Icon size={16} style={{ color }} aria-hidden="true" />
              <span className="text-sm">{label}</span>
            </div>
          ))}
        </div>

        {enriched.length === 0 ? (
          <div className="card p-8 text-center text-muted">
            <Ear size={32} className="mx-auto mb-3 opacity-40" />
            <p>No sensory profiles yet. Be the first to contribute one.</p>
            <Link to="/submit-review" className="btn-primary mt-4 inline-block">Add sensory data</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {enriched.map(({ place, sensory, score }) => (
              <Link key={place.id} to={`/place/${place.id}`} className="card block p-4 hover:-translate-y-0.5 transition-transform">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{place.name}</h2>
                    <p className="text-xs text-muted">{place.address}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-xl font-bold font-mono" style={{ color: scoreColor(score) }}>
                      {score.toFixed(1)}
                    </span>
                    <p className="text-xs text-muted">sensory score</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {sensory.noiseLevel && (
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-muted"><Volume2 size={11} /> Noise</span>
                        <span className="text-muted">{NOISE_LABELS[sensory.noiseLevel]}</span>
                      </div>
                      <SensoryBar value={sensory.noiseLevel} color="#f97316" />
                    </div>
                  )}
                  {sensory.crowdDensity && (
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-muted"><Users size={11} /> Crowd</span>
                        <span className="text-muted">{CROWD_LABELS[sensory.crowdDensity]}</span>
                      </div>
                      <SensoryBar value={['sparse','moderate','busy','crowded'].indexOf(sensory.crowdDensity) + 1} color="#8b5cf6" />
                    </div>
                  )}
                  {sensory.lightingType && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-muted"><Sun size={11} /> Lighting</span>
                      <span className="text-muted">{LIGHTING_LABELS[sensory.lightingType]}</span>
                    </div>
                  )}
                </div>

                {(sensory.hasQuietRoom || sensory.hasSensoryKit || sensory.hasLowStimulationHours) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sensory.hasQuietRoom && (
                      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                        <CheckCircle2 size={11} /> Quiet room
                      </span>
                    )}
                    {sensory.hasSensoryKit && (
                      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                        <CheckCircle2 size={11} /> Sensory kit
                      </span>
                    )}
                    {sensory.hasLowStimulationHours && (
                      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                        <CheckCircle2 size={11} /> Low-stim hours
                      </span>
                    )}
                  </div>
                )}

                {sensory.notes && (
                  <p className="mt-3 flex gap-1.5 text-xs text-muted">
                    <Info size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
                    {sensory.notes}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-8 rounded-xl border border-border p-4 text-xs text-muted">
          Sensory profiles are community-contributed. Add yours at any place page.
          Data helps autistic individuals, people with sensory processing disorder,
          PTSD, migraines, and anyone who needs a low-stimulation environment.
        </div>
      </div>
    </Layout>
  )
}
