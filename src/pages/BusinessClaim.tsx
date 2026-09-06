import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Upload, CheckCircle2, ShieldCheck, FileText, Star } from 'lucide-react'
import Layout from '../components/Layout'
import { getPlaces } from '../lib/data'
import { useStore } from '../store/useStore'
import type { Place } from '../types'

type Step = 'select' | 'docs' | 'submitted'

const CERT_TIERS = [
  {
    id: 'self',
    label: 'Self-Reported',
    icon: Star,
    color: 'text-muted',
    description: 'Business confirms features exist. Unverified.',
  },
  {
    id: 'community',
    label: 'Community Verified',
    icon: CheckCircle2,
    color: 'text-primary',
    description: '5+ community reviews corroborate accessibility claims.',
  },
  {
    id: 'certified',
    label: 'Certified Accessible',
    icon: ShieldCheck,
    color: 'text-emerald-400',
    description: 'ADA audit report or renovation receipts submitted and reviewed.',
  },
]

export default function BusinessClaim() {
  const user = useStore((s) => s.user)
  const [places, setPlaces] = useState<Place[]>([])
  const [selected, setSelected] = useState('')
  const [step, setStep] = useState<Step>('select')
  const [docs, setDocs] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { getPlaces().then(setPlaces) }, [])

  async function submitClaim() {
    setBusy(true)
    await new Promise((r) => setTimeout(r, 1200)) // demo delay
    setStep('submitted')
    setBusy(false)
  }

  if (!user) {
    return (
      <Layout>
        <div className="mx-auto max-w-md py-16 text-center">
          <Building2 size={40} className="mx-auto mb-4 text-muted" />
          <h1 className="font-display text-2xl">Sign in to claim your listing</h1>
          <p className="mt-2 text-muted">Business owners can claim their AccessMap listing and earn a verified badge.</p>
        </div>
      </Layout>
    )
  }

  if (step === 'submitted') {
    return (
      <Layout>
        <div className="mx-auto max-w-md py-16 text-center">
          <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-400" />
          <h1 className="font-display text-2xl">Claim submitted</h1>
          <p className="mt-2 text-muted">
            Our team will review your documentation within 3–5 business days.
            You'll be notified at <strong>{user.email}</strong> when your badge is approved.
          </p>
          <div className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-300">
            <ShieldCheck size={16} className="inline mr-1" aria-hidden="true" />
            Once approved, your listing will show the <strong>Certified Accessible</strong> badge.
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-8">

        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Building2 size={22} className="text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold">Claim Your Listing</h1>
          </div>
          <p className="text-muted">
            Earn a verified accessibility badge by submitting your ADA audit report,
            renovation receipts, or third-party accessibility certification.
          </p>
        </div>

        {/* Certification tiers */}
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          {CERT_TIERS.map(({ id, label, icon: Icon, color, description }) => (
            <div key={id} className="card p-4 text-center">
              <Icon size={24} className={`mx-auto mb-2 ${color}`} aria-hidden="true" />
              <p className="text-sm font-semibold">{label}</p>
              <p className="mt-1 text-xs text-muted">{description}</p>
            </div>
          ))}
        </div>

        {step === 'select' && (
          <div className="space-y-4">
            <label className="block">
              <span className="label">Select your business</span>
              <select
                className="input mt-1"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                aria-label="Select your business listing"
              >
                <option value="">Choose a listing…</option>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.address}</option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted">
              Don't see your business?{' '}
              <Link to="/for-business" className="text-primary underline">Register it first →</Link>
            </p>
            <button
              className="btn-primary w-full"
              disabled={!selected}
              onClick={() => setStep('docs')}
            >
              Continue
            </button>
          </div>
        )}

        {step === 'docs' && (
          <div className="space-y-5">
            <h2 className="font-semibold">Upload documentation</h2>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { id: 'audit', label: 'ADA Audit Report', icon: FileText },
                { id: 'receipts', label: 'Renovation Receipts', icon: Upload },
                { id: 'cert', label: 'Third-party Certification', icon: ShieldCheck },
                { id: 'photos', label: 'Accessibility Photos', icon: Star },
              ].map(({ id, label, icon: Icon }) => (
                <label
                  key={id}
                  className={`card flex cursor-pointer items-center gap-3 p-4 transition-colors hover:border-primary/50 ${
                    docs.includes(id) ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={docs.includes(id)}
                    onChange={(e) =>
                      setDocs((d) => e.target.checked ? [...d, id] : d.filter((x) => x !== id))
                    }
                    aria-label={label}
                  />
                  <Icon size={18} className={docs.includes(id) ? 'text-primary' : 'text-muted'} aria-hidden="true" />
                  <span className="text-sm">{label}</span>
                  {docs.includes(id) && <CheckCircle2 size={14} className="ml-auto text-primary" aria-hidden="true" />}
                </label>
              ))}
            </div>

            <label className="block">
              <span className="label">Additional notes (optional)</span>
              <textarea
                className="input mt-1 min-h-[80px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Describe recent accessibility improvements, ongoing renovations, etc."
                aria-label="Additional notes"
              />
            </label>

            <p className="text-xs text-muted">
              In this demo, file upload is simulated. In production, documents are uploaded
              to secure storage and reviewed by the AccessMap team.
            </p>

            <div className="flex gap-3">
              <button className="btn-ghost flex-1" onClick={() => setStep('select')}>Back</button>
              <button
                className="btn-primary flex-1"
                disabled={docs.length === 0 || busy}
                onClick={submitClaim}
              >
                {busy ? 'Submitting…' : 'Submit claim'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
