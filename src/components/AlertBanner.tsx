import { AlertTriangle, Check, BadgeCheck } from 'lucide-react'
import type { Alert } from '../types'
import { useStore } from '../store/useStore'
import { useNow } from '../lib/useNow'
import SpeakButton from './SpeakButton'

function timeAgo(ms: number, now: number): string {
  const s = Math.floor((now - ms) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const TYPE_LABEL: Record<Alert['type'], string> = {
  elevator: 'Elevator',
  ramp: 'Ramp',
  bathroom: 'Bathroom',
  noise: 'Noise level',
  obstruction: 'Obstruction',
  other: 'Issue',
}

const AGENCY_LABEL: Record<NonNullable<Alert['agencyId']>, string> = {
  wmata: 'WMATA',
  mta: 'MTA',
  bart: 'BART',
}

interface Props {
  alert: Alert
  onResolve?: (id: string) => void
}

export default function AlertBanner({ alert, onResolve }: Props) {
  const user = useStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const now = useNow()
  const ago = timeAgo(alert.createdAt, now)
  const isAgency = alert.source === 'agency'
  const agencyLabel = alert.agencyId ? AGENCY_LABEL[alert.agencyId] : null
  const spoken = `Live alert. ${TYPE_LABEL[alert.type]}. ${alert.description}. ${isAgency ? `Official ${agencyLabel} report.` : `Reported ${ago}, ${alert.aiVerified ? 'AI verified' : 'unverified'}.`}`

  return (
    <div className="flex items-center gap-3 rounded-xl border border-alert/40 bg-alert/10 px-4 py-3 animate-alert-glow">
      <AlertTriangle className="shrink-0 text-alert" size={20} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">
          <span className="font-semibold text-alert">{TYPE_LABEL[alert.type]} — </span>
          {alert.description}
        </p>
        <p className="label mt-0.5 flex items-center gap-1.5">
          {isAgency && agencyLabel ? (
            <>
              <BadgeCheck size={12} className="text-blue-400" aria-hidden="true" />
              <span className="font-semibold text-blue-400">{agencyLabel} Official</span>
              <span className="text-muted">· {ago}</span>
            </>
          ) : (
            <>
              reported {ago} · by {alert.reportedBy} ·{' '}
              {alert.aiVerified ? 'AI verified' : 'unverified'}
            </>
          )}
        </p>
      </div>
      <SpeakButton text={spoken} label="Read alert" variant="icon" className="shrink-0" />
      {isAdmin && onResolve && (
        <button onClick={() => onResolve(alert.id)} className="btn-ghost shrink-0 px-3 py-1.5 text-sm">
          <Check size={16} aria-hidden="true" /> Resolve
        </button>
      )}
    </div>
  )
}
