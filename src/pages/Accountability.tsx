import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldAlert, ShieldCheck, ExternalLink, Scale, AlertTriangle } from 'lucide-react'
import Layout from '../components/Layout'
import { ADA_CASES } from '../lib/adaCompliance'
import type { AdaViolationType } from '../lib/adaCompliance'

const VIOLATION_LABELS: Record<AdaViolationType, string> = {
  physical_access: 'Physical Access',
  communications: 'Communications',
  service_denial: 'Service Denial',
  transit: 'Transit Access',
  healthcare: 'Healthcare',
  lodging: 'Lodging',
}

const VIOLATION_COLORS: Record<AdaViolationType, string> = {
  physical_access: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  communications: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  service_denial: 'text-red-400 bg-red-400/10 border-red-400/30',
  transit: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
  healthcare: 'text-green-400 bg-green-400/10 border-green-400/30',
  lodging: 'text-teal-400 bg-teal-400/10 border-teal-400/30',
}

export default function Accountability() {
  const [filter, setFilter] = useState<AdaViolationType | 'all'>('all')

  const visible = filter === 'all'
    ? ADA_CASES
    : ADA_CASES.filter((c) => c.violationType === filter)

  const remediationRequired = ADA_CASES.filter((c) => c.requiresRemedy).length

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Scale size={22} className="text-amber-400" aria-hidden="true" />
            <h1 className="text-2xl font-bold">ADA Accountability</h1>
          </div>
          <p className="text-muted">
            Places with public DOJ ADA settlement records are legally required to be accessible.
            Compare these records against community reports to see if they're actually complying.
          </p>
          <p className="mt-2 text-xs text-muted/70">
            Source: U.S. Department of Justice Civil Rights Division, ada.gov/cases.
            All cases are matters of public record.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-amber-400">{ADA_CASES.length}</p>
            <p className="label mt-1">Settlements on record</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-orange-400">{remediationRequired}</p>
            <p className="label mt-1">Physical remedy required</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-primary">
              {new Set(ADA_CASES.map((c) => c.state)).size}
            </p>
            <p className="label mt-1">States covered</p>
          </div>
        </div>

        {/* Filter chips */}
        <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by violation type">
          <button
            onClick={() => setFilter('all')}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === 'all'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted hover:border-primary/50'
            }`}
          >
            All
          </button>
          {(Object.keys(VIOLATION_LABELS) as AdaViolationType[]).map((v) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filter === v
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted hover:border-primary/50'
              }`}
            >
              {VIOLATION_LABELS[v]}
            </button>
          ))}
        </div>

        {/* Case list */}
        <div className="space-y-3">
          {visible.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 shrink-0 text-amber-400" size={18} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{c.businessName}</h2>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${VIOLATION_COLORS[c.violationType]}`}>
                      {VIOLATION_LABELS[c.violationType]}
                    </span>
                  </div>
                  <p className="label mt-0.5">{c.city}, {c.state} · Settled {c.settledYear}</p>
                  <p className="mt-2 text-sm text-muted">{c.summary}</p>

                  {c.requiresRemedy && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
                      <AlertTriangle size={11} aria-hidden="true" />
                      Physical accessibility changes legally required
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {c.caseUrl && (
                      <a
                        href={c.caseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
                      >
                        DOJ case record <ExternalLink size={10} aria-hidden="true" />
                      </a>
                    )}
                    <Link
                      to={`/map?q=${encodeURIComponent(c.businessName + ' ' + c.city)}`}
                      className="inline-flex items-center gap-1 text-xs text-muted underline underline-offset-2"
                    >
                      Find on AccessMap →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-8 rounded-xl border border-border bg-card p-4 text-xs text-muted">
          <div className="flex items-start gap-2">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <p>
              This page cross-references community accessibility reports with public DOJ enforcement
              records. A settlement record means a place was <em>found non-compliant</em> — community
              reports show whether they've actually fixed it. Discrepancies can be reported to the
              ADA Information Line at 800-514-0301 or via{' '}
              <a href="https://www.ada.gov/file-a-complaint/" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                ada.gov/file-a-complaint
              </a>.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}
