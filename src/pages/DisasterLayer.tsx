import { useEffect, useState } from 'react'
import { AlertOctagon, ShieldCheck, Phone, Zap, Heart, Mic, MapPin, RefreshCw } from 'lucide-react'
import Layout from '../components/Layout'
import { fetchActiveDisasters, MOCK_SHELTERS, getSheltersByState } from '../lib/disaster'
import type { DisasterDeclaration, AccessibleShelter } from '../lib/disaster'

function ShelterCard({ shelter }: { shelter: AccessibleShelter }) {
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 shrink-0 text-primary" size={18} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{shelter.name}</h3>
          <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
            <MapPin size={11} aria-hidden="true" /> {shelter.address}, {shelter.city}, {shelter.state}
          </p>
          <p className="text-xs text-muted mt-0.5">Capacity: {shelter.capacity.toLocaleString()}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {shelter.wheelchairAccessible && (
              <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                <ShieldCheck size={10} /> Wheelchair accessible
              </span>
            )}
            {shelter.hasBackupPower && (
              <span className="flex items-center gap-1 rounded-full bg-yellow-400/10 px-2.5 py-1 text-xs text-yellow-400">
                <Zap size={10} /> Backup power
              </span>
            )}
            {shelter.hasMedicalStaff && (
              <span className="flex items-center gap-1 rounded-full bg-red-400/10 px-2.5 py-1 text-xs text-red-400">
                <Heart size={10} /> Medical staff
              </span>
            )}
            {shelter.hasSignLanguageInterpreter && (
              <span className="flex items-center gap-1 rounded-full bg-purple-400/10 px-2.5 py-1 text-xs text-purple-400">
                <Mic size={10} /> ASL interpreter
              </span>
            )}
          </div>

          {shelter.accessibilityNotes && (
            <p className="mt-2 text-xs text-muted">{shelter.accessibilityNotes}</p>
          )}

          {shelter.phone && (
            <a href={`tel:${shelter.phone}`}
              className="mt-2 flex items-center gap-1.5 text-xs text-primary"
              aria-label={`Call ${shelter.name} at ${shelter.phone}`}>
              <Phone size={11} aria-hidden="true" /> {shelter.phone}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DisasterLayer() {
  const [disasters, setDisasters] = useState<DisasterDeclaration[]>([])
  const [shelters, setShelters] = useState<AccessibleShelter[]>(MOCK_SHELTERS)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    const d = await fetchActiveDisasters()
    setDisasters(d)
    const activeStates = [...new Set(d.filter((x) => x.active).map((x) => x.state))]
    setShelters(activeStates.length > 0
      ? activeStates.flatMap(getSheltersByState)
      : MOCK_SHELTERS)
    setLastUpdated(Date.now())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const activeDisasters = disasters.filter((d) => d.active)

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertOctagon size={22} className="text-red-400" aria-hidden="true" />
              <h1 className="text-2xl font-bold">Disaster Accessibility</h1>
            </div>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:text-ink disabled:opacity-50"
              aria-label="Refresh disaster data">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
              {loading ? 'Updating…' : lastUpdated ? `Updated ${Math.floor((Date.now() - lastUpdated) / 60000)}m ago` : 'Refresh'}
            </button>
          </div>
          <p className="text-muted">
            Verified accessible emergency shelters and evacuation routes for people
            with disabilities. Pulls active FEMA disaster declarations in real time.
          </p>
        </div>

        {/* Active declarations */}
        {activeDisasters.length > 0 && (
          <div className="mb-6 space-y-3">
            <h2 className="label flex items-center gap-2">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-400" aria-hidden="true" />
              Active declarations ({activeDisasters.length})
            </h2>
            {activeDisasters.map((d) => (
              <div key={d.id} className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3">
                <p className="text-sm font-semibold text-red-300">{d.declarationTitle}</p>
                <p className="label mt-0.5">
                  {d.state} · FEMA #{d.disasterNumber} · Declared {new Date(d.declarationDate).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}

        {activeDisasters.length === 0 && !loading && (
          <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <p className="text-sm text-primary font-medium">No active major disaster declarations</p>
            <p className="text-xs text-muted mt-0.5">
              Showing all verified accessible shelters. This layer activates automatically during declared disasters.
            </p>
          </div>
        )}

        {/* Shelters */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="label">Accessible shelters ({shelters.length})</h2>
          <span className="text-xs text-muted">All wheelchair accessible</span>
        </div>

        <div className="space-y-3">
          {shelters.map((s) => <ShelterCard key={s.id} shelter={s} />)}
        </div>

        {/* Emergency contacts */}
        <div className="mt-8 rounded-xl border border-border p-4 text-xs text-muted space-y-2">
          <p className="font-semibold text-ink text-sm">Emergency contacts</p>
          <p><a href="tel:211" className="text-primary underline">211</a> — Local emergency resources (shelter, food, transportation)</p>
          <p><a href="tel:18006212000" className="text-primary underline">1-800-621-2000</a> — FEMA disaster assistance</p>
          <p>
            <a href="https://www.fema.gov/disaster/recover/accessible" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              fema.gov/accessible
            </a>{' '}
            — FEMA accessibility resources for people with disabilities
          </p>
        </div>
      </div>
    </Layout>
  )
}
