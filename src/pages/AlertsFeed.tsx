import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, AlertTriangle, BadgeCheck, ChevronRight, RefreshCw, Loader2 } from 'lucide-react'
import Layout from '../components/Layout'
import { getAlerts, getPlaces } from '../lib/data'
import { usePullToRefresh } from '../lib/usePullToRefresh'
import { useReducedMotion } from '../lib/useAppMotion'
import type { Alert, Place } from '../types'

const TYPE_LABEL: Record<Alert['type'], string> = {
  elevator: 'Elevator', ramp: 'Ramp', bathroom: 'Bathroom',
  noise: 'Noise level', obstruction: 'Obstruction', other: 'Issue',
}

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function AlertsFeed() {
  const reduced = useReducedMotion()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [places, setPlaces] = useState<Record<string, Place>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [a, ps] = await Promise.all([getAlerts(), getPlaces()])
    setAlerts(a)
    setPlaces(Object.fromEntries(ps.map((p) => [p.id, p])))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const { bind, pullDistance, refreshing } = usePullToRefresh({ onRefresh: load, disabled: reduced })

  return (
    <Layout>
      <div className="mb-4 flex items-center gap-2">
        <Bell size={22} className="text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-ink">Live alerts</h1>
      </div>
      <p className="mb-4 text-sm text-muted">
        Barrier reports from the community and transit agencies — newest first.
      </p>

      <div
        {...bind}
        className="-mx-4 max-h-[calc(100vh-13rem)] overflow-y-auto px-4"
        style={{ overscrollBehavior: 'contain' }}
      >
        {/* Pull-to-refresh indicator */}
        <div
          className="flex items-center justify-center overflow-hidden text-muted transition-[height]"
          style={{ height: refreshing ? 40 : pullDistance }}
        >
          {refreshing
            ? <Loader2 size={18} className="animate-spin" aria-label="Refreshing" />
            : <RefreshCw size={18} style={{ transform: `rotate(${pullDistance * 3}deg)` }} aria-hidden="true" />}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface" />)}
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border py-16 text-center">
            <BadgeCheck size={28} className="mx-auto mb-2 text-emerald-500" aria-hidden="true" />
            <p className="font-semibold text-ink">No active alerts</p>
            <p className="mt-1 text-sm text-muted">Every tracked place is currently barrier-free.</p>
          </div>
        ) : (
          <ul className="space-y-3 pb-4">
            {alerts.map((a) => {
              const place = places[a.placeId]
              const agency = a.source === 'agency'
              return (
                <li key={a.id}>
                  <Link
                    to={`/place/${a.placeId}`}
                    className="flex min-h-[44px] items-start gap-3 rounded-2xl border border-border bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.05)] transition-transform hover:-translate-y-0.5"
                  >
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${agency ? 'bg-blue-50 text-blue-500' : 'bg-alert/10 text-alert'}`}>
                      {agency ? <BadgeCheck size={18} /> : <AlertTriangle size={18} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-alert">{TYPE_LABEL[a.type]}</span>
                        <span className="text-[11px] text-muted">· {timeAgo(a.createdAt)}</span>
                      </span>
                      <span className="mt-0.5 block text-sm text-ink">{a.description}</span>
                      <span className="mt-1 block truncate text-xs text-muted">
                        {place?.name ?? 'View place'} · {agency ? 'Agency report' : a.aiVerified ? 'AI verified' : 'Unverified'}
                      </span>
                    </span>
                    <ChevronRight size={16} className="mt-1 shrink-0 text-muted" aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Layout>
  )
}
