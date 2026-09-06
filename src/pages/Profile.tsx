import { useEffect, useState } from 'react'
import { LogOut, Crown, Sliders, LogIn } from 'lucide-react'
import Layout from '../components/Layout'
import PlaceCard from '../components/PlaceCard'
import AuthModal from '../components/AuthModal'
import NeedsEditor from '../components/NeedsEditor'
import { useStore } from '../store/useStore'
import { getPlaces, getReviews, getAlerts } from '../lib/data'
import type { Place, Review, Alert } from '../types'

export default function Profile() {
  const user = useStore((s) => s.user)
  const logout = useStore((s) => s.logout)
  const [showAuth, setShowAuth] = useState(false)

  const [places, setPlaces] = useState<Place[]>([])
  const [myReviews, setMyReviews] = useState<Review[]>([])
  const [myReports, setMyReports] = useState<Alert[]>([])

  useEffect(() => {
    if (!user) return
    getPlaces().then(async (ps) => {
      setPlaces(ps)
      const reviews = (await Promise.all(ps.map((p) => getReviews(p.id)))).flat()
      setMyReviews(reviews.filter((r) => r.userId === user.uid || r.userName === user.displayName))
      const alerts = await getAlerts(undefined, false)
      setMyReports(alerts.filter((a) => a.reportedBy === user.displayName))
    })
  }, [user])

  const savedPlaces = places.filter((p) => user && user.savedPlaces.includes(p.id))

  return (
    <Layout>
      {/* ── Account row ─────────────────────────────────────────── */}
      {user ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="h-14 w-14 rounded-full border border-border" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-xl font-semibold text-primary">
                {user.displayName.charAt(0)}
              </span>
            )}
            <div>
              <h1 className="text-xl font-semibold text-ink">
                {user.displayName}
                {user.premium && <Crown className="ml-2 inline text-yellow-400" size={16} />}
              </h1>
              <p className="text-sm text-muted">{user.email}</p>
            </div>
          </div>
          <button onClick={logout} className="btn-ghost"><LogOut size={16} /> Sign out</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.05)]">
          <div>
            <p className="text-sm font-semibold text-ink">Sign in to sync</p>
            <p className="text-xs text-muted">Save places and carry your needs across devices. Not required to use the app.</p>
          </div>
          <button onClick={() => setShowAuth(true)} className="btn-primary shrink-0 text-sm">
            <LogIn size={15} /> Sign in
          </button>
        </div>
      )}

      {/* ── Accessibility customisation (primary content) ───────── */}
      <section className="mt-8">
        <div className="mb-1 flex items-center gap-2">
          <Sliders size={18} className="text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-ink">Your accessibility needs</h2>
        </div>
        <p className="mb-5 text-sm text-muted">
          Tell us how you experience the world. Every place on the map is then scored, filtered
          and briefed for <em>you</em> specifically.
        </p>
        <NeedsEditor />
      </section>

      {/* ── Contributions (signed in only) ─────────────────────── */}
      {user && (
        <div className="mt-10 grid gap-8 border-t border-border pt-8 md:grid-cols-2">
          <section>
            <h2 className="text-lg font-semibold text-ink">Saved places</h2>
            <div className="mt-3 space-y-3">
              {savedPlaces.length === 0 && <p className="text-sm text-muted">No saved places yet.</p>}
              {savedPlaces.map((p) => <PlaceCard key={p.id} place={p} />)}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">My reports</h2>
            <div className="mt-3 space-y-2">
              {myReports.length === 0 && <p className="text-sm text-muted">No reports submitted.</p>}
              {myReports.map((a) => (
                <div key={a.id} className="card flex items-center justify-between p-3 text-sm">
                  <span className="truncate">{a.description}</span>
                  <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    a.status === 'resolved' ? 'bg-green-500/15 text-green-600'
                    : a.aiVerified ? 'bg-primary/15 text-primary' : 'bg-yellow-500/15 text-yellow-600'
                  }`}>
                    {a.status === 'resolved' ? 'resolved' : a.aiVerified ? 'verified' : 'pending'}
                  </span>
                </div>
              ))}
            </div>

            <h2 className="mt-6 text-lg font-semibold text-ink">My reviews</h2>
            <div className="mt-3 space-y-2">
              {myReviews.length === 0 && <p className="text-sm text-muted">No reviews yet.</p>}
              {myReviews.map((r) => (
                <div key={r.id} className="card p-3 text-sm">
                  <p className="truncate text-muted">{places.find((p) => p.id === r.placeId)?.name}</p>
                  <p>{r.body}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
    </Layout>
  )
}
