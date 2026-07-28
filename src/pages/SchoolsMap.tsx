import { useState } from 'react'
import { GraduationCap, ShieldAlert, CheckCircle2, ExternalLink, AlertTriangle } from 'lucide-react'
import Layout from '../components/Layout'
import { IDEA_CASES } from '../lib/ideaCompliance'
import type { IdeaFindingType } from '../lib/ideaCompliance'

const FINDING_LABELS: Record<IdeaFindingType, string> = {
  physical_access: 'Physical Access',
  transportation:  'Transportation',
  program_access:  'Program Access',
  evaluation:      'Evaluation',
  iep_compliance:  'IEP Compliance',
}

const FINDING_COLORS: Record<IdeaFindingType, string> = {
  physical_access: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  transportation:  'text-blue-400 bg-blue-400/10 border-blue-400/30',
  program_access:  'text-purple-400 bg-purple-400/10 border-purple-400/30',
  evaluation:      'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  iep_compliance:  'text-red-400 bg-red-400/10 border-red-400/30',
}

export default function SchoolsMap() {
  const [filter, setFilter] = useState<IdeaFindingType | 'all'>('all')

  const visible = filter === 'all'
    ? IDEA_CASES
    : IDEA_CASES.filter((c) => c.findingType === filter)

  const physicalCount = IDEA_CASES.filter((c) => c.requiresPhysicalRemedy).length

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-8">

        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <GraduationCap size={22} className="text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold">School Accessibility</h1>
          </div>
          <p className="text-muted">
            Parents of disabled children have no reliable way to compare schools on
            accessibility before enrolling. This layer surfaces IDEA compliance
            findings from OSEP state monitoring and OCR settlement agreements.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-amber-400">{IDEA_CASES.length}</p>
            <p className="label mt-1">Districts on record</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-orange-400">{physicalCount}</p>
            <p className="label mt-1">Physical remedy required</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-primary">
              {new Set(IDEA_CASES.map((c) => c.state)).size}
            </p>
            <p className="label mt-1">States covered</p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by finding type">
          <button
            onClick={() => setFilter('all')}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filter === 'all' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted hover:border-primary/50'}`}
          >
            All
          </button>
          {(Object.keys(FINDING_LABELS) as IdeaFindingType[]).map((v) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filter === v ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted hover:border-primary/50'}`}
            >
              {FINDING_LABELS[v]}
            </button>
          ))}
        </div>

        {/* Cases */}
        <div className="space-y-3">
          {visible.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 shrink-0 text-amber-400" size={18} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{c.districtName}</h2>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${FINDING_COLORS[c.findingType]}`}>
                      {FINDING_LABELS[c.findingType]}
                    </span>
                  </div>
                  {c.schoolName && <p className="text-xs text-primary">{c.schoolName}</p>}
                  <p className="label mt-0.5">{c.city}, {c.state} · Resolved {c.resolvedYear}</p>
                  <p className="mt-2 text-sm text-muted">{c.summary}</p>
                  {c.requiresPhysicalRemedy && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
                      <AlertTriangle size={11} aria-hidden="true" />
                      Physical accessibility changes legally required
                    </div>
                  )}
                  {c.sourceUrl && (
                    <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2">
                      Source document <ExternalLink size={10} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-border p-4 text-xs text-muted">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <p>
              Data sourced from OSEP state performance plans, OCR resolution agreements, and
              public complaint records. File an IDEA complaint at{' '}
              <a href="https://www2.ed.gov/about/offices/list/ocr/complaintintro.html"
                target="_blank" rel="noopener noreferrer" className="text-primary underline">
                ed.gov/ocr
              </a>{' '}
              or contact your State Education Agency.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}
