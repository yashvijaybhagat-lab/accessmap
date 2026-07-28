import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  MapPin as MapPinIcon, Flag, Star, Route as RouteIcon,
  ShieldCheck, ShieldAlert, Bookmark, ExternalLink, BadgeCheck,
  CheckCircle2, ArrowUpDown, Car, Zap, Toilet as ToiletIcon,
  Footprints, Clock, Phone, Globe, Camera, ChevronDown, ChevronUp,
  Info,
} from 'lucide-react'
import { googleMapsTo } from '../lib/maps'
import Layout from '../components/Layout'
import ScoreRing from '../components/ScoreRing'
import { scoreColor } from '../components/ScoreRing'
import AlertBanner from '../components/AlertBanner'
import Modal from '../components/Modal'
import ReportForm from '../components/ReportForm'
import ReviewForm from '../components/ReviewForm'
import { getPlace, getReviews, getAlerts, resolveAlert, getSpecs } from '../lib/data'
import { useStore } from '../store/useStore'
import { scorePlace, hasProfile, beforeYouGo } from '../lib/compatibility'
import MatchBadge from '../components/MatchBadge'
import SpecsPanel from '../components/SpecsPanel'
import SpecsForm from '../components/SpecsForm'
import { fetchOsmDetails } from '../lib/osmDetails'
import type { OsmData } from '../lib/osmDetails'
import type { Place, Review, Alert, AccessSpecs } from '../types'
import { checkAdaCompliance } from '../lib/adaCompliance'
import type { AdaFlag } from '../lib/adaCompliance'

function timeAgo(ms: number) {
  const d = Math.floor((Date.now() - ms) / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d}d ago`
  return new Date(ms).toLocaleDateString('en', { month: 'short', year: 'numeric' })
}

function FeatureBadge({ icon: Icon, label, positive }: { icon: React.ElementType; label: string; positive?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
      positive
        ? 'border-[#1e8e3e]/25 bg-[#e6f4ea] text-[#1e8e3e]'
        : 'border-border bg-bg text-muted'
    }`}>
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  )
}

export default function PlaceDetail() {
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const [place, setPlace] = useState<Place | null>(null)
  const [osmOnlyMode, setOsmOnlyMode] = useState(false)
  const [reviews, setReviews] = useState<Review[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [specs, setSpecs] = useState<AccessSpecs[]>([])
  const [osmData, setOsmData] = useState<OsmData | null>(null)
  const [osmLoading, setOsmLoading] = useState(true)
  const [showReport, setShowReport] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [showSpecsForm, setShowSpecsForm] = useState(false)
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const [adaFlag, setAdaFlag] = useState<AdaFlag | null>(null)
  const user = useStore((s) => s.user)
  const toggleSaved = useStore((s) => s.toggleSaved)
  const needsProfile = useStore((s) => s.needsProfile)
  const saved = user?.savedPlaces.includes(id)

  const osmAbort = useRef<AbortController | null>(null)

  async function load() {
    // Cancel any in-flight OSM fetch from a previous render
    osmAbort.current?.abort()
    const ac = new AbortController()
    osmAbort.current = ac

    const p = await getPlace(id)
    if (p) {
      setPlace(p)
      setAdaFlag(checkAdaCompliance(p.name, p.city))
      setOsmOnlyMode(false)
      // Fetch reviews, alerts, specs in parallel
      const [revs, alts, sps] = await Promise.all([getReviews(id), getAlerts(id), getSpecs(id)])
      setReviews(revs); setAlerts(alts); setSpecs(sps)
      setOsmLoading(true)
      fetchOsmDetails(p.lat, p.lng, ac.signal)
        .then(d => { if (!ac.signal.aborted) setOsmData(d) })
        .finally(() => { if (!ac.signal.aborted) setOsmLoading(false) })
    } else {
      // OSM POI — lat/lng/name passed as query params
      const lat = parseFloat(searchParams.get('lat') ?? '')
      const lng = parseFloat(searchParams.get('lng') ?? '')
      const name = searchParams.get('name') ?? 'Place'
      if (!isNaN(lat) && !isNaN(lng)) {
        setOsmOnlyMode(true)
        // Synthesise a minimal Place so the page renders
        setPlace({
          id, name, address: '', lat, lng,
          scores: { mobility: 0, sensory: 0, hearing: 0, vision: 0 },
          reviewCount: 0, lastUpdated: 0,
        })
        setSpecs(await getSpecs(id))
        setOsmLoading(true)
        fetchOsmDetails(lat, lng, ac.signal)
          .then(d => {
            if (ac.signal.aborted) return
            setOsmData(d)
            // Patch name from OSM if available
            if (d?.name) setPlace(prev => prev ? { ...prev, name: d.name!, address: d.extras.find(e => e.label === 'Address (OSM)')?.value ?? '' } : prev)
          })
          .finally(() => { if (!ac.signal.aborted) setOsmLoading(false) })
      }
    }
  }
  useEffect(() => {
    load()
    return () => { osmAbort.current?.abort() }
  }, [id])

  // Programmatic JSON-LD + SEO title for this venue (§6.3 — organic SEO moat)
  useEffect(() => {
    if (!place) return
    const avg = (place.scores.mobility + place.scores.sensory + place.scores.hearing + place.scores.vision) / 4
    const features = [
      ...(place.features ?? []),
      ...(place.scores.mobility >= 6 ? ['Wheelchair accessible entrance'] : []),
      ...(place.scores.vision >= 6 ? ['Braille / tactile guidance'] : []),
      ...(place.scores.hearing >= 6 ? ['Hearing support'] : []),
      ...(place.scores.sensory >= 7 ? ['Low-sensory / quiet space'] : []),
    ]
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: place.name,
      address: place.address,
      geo: { '@type': 'GeoCoordinates', latitude: place.lat, longitude: place.lng },
      accessibilityFeature: Array.from(new Set(features)),
      aggregateRating: place.reviewCount > 0
        ? { '@type': 'AggregateRating', ratingValue: avg.toFixed(1), bestRating: 10, ratingCount: place.reviewCount }
        : undefined,
    }
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.text = JSON.stringify(ld)
    document.head.appendChild(script)
    const prevTitle = document.title
    document.title = `${place.name} — accessibility rating & details · AccessMap`
    return () => { script.remove(); document.title = prevTitle }
  }, [place])

  async function onResolve(alertId: string) {
    await resolveAlert(alertId)
    setAlerts(await getAlerts(id))
  }

  if (!place) return <Layout><p className="text-muted py-10 text-center">Loading…</p></Layout>

  const avg = osmOnlyMode
    ? (osmData?.accessScore ?? null)
    : (place.scores.mobility + place.scores.sensory + place.scores.hearing + place.scores.vision) / 4
  // While loading in OSM-only mode, show a neutral placeholder colour
  const avgColor = avg != null ? scoreColor(avg) : osmLoading ? '#bdc1c6' : '#9aa0a6'
  const communityPhotos = [
    ...reviews.flatMap((r) => r.photos.map((url) => ({ url, verified: r.verified }))),
    ...specs.flatMap((s) => (s.photos ?? []).map((url) => ({ url, verified: false }))),
  ]
  const bd = osmData?.breakdown

  // Dominant photo: OSM first, then community
  const heroPhoto = osmData?.imageUrl ?? (communityPhotos[0]?.url ?? null)

  return (
    <Layout>
      {alerts.map((a) => (
        <div key={a.id} className="mb-3"><AlertBanner alert={a} onResolve={onResolve} /></div>
      ))}

      {/* ── ADA accountability flag ─────────────────────────────── */}
      {adaFlag && (
        <div className="mb-3 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <ShieldAlert className="mt-0.5 shrink-0 text-amber-400" size={18} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-300">{adaFlag.flagLabel}</p>
            <p className="mt-0.5 text-xs text-muted">{adaFlag.case.summary}</p>
            <Link to="/accountability" className="mt-1 inline-block text-xs text-amber-400 underline underline-offset-2">
              View ADA accountability report →
            </Link>
          </div>
          {adaFlag.matchConfidence === 'exact' && (
            <BadgeCheck size={14} className="mt-0.5 shrink-0 text-amber-400" aria-label="Confirmed match" />
          )}
        </div>
      )}

      {/* ── Hero photo ─────────────────────────────────────────── */}
      {heroPhoto && (
        <div className="-mx-4 -mt-2 mb-6 sm:-mx-8">
          <div className="relative h-56 w-full overflow-hidden sm:h-72 sm:rounded-2xl">
            <img src={heroPhoto} alt={place.name} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            {/* Overall score pinned to photo */}
            <div className="absolute bottom-4 left-4 flex items-center gap-3">
              <span
                className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl text-white shadow-lg"
                style={{ background: avgColor }}
              >
                <span className="text-xl font-bold leading-none">{avg != null ? avg.toFixed(1) : '?'}</span>
                <span className="text-[9px] font-medium uppercase tracking-wide opacity-90">/ 10</span>
              </span>
              <div className="text-white drop-shadow">
                <h1 className="text-xl font-bold leading-tight">{place.name}</h1>
                <p className="text-sm opacity-85 flex items-center gap-1">
                  <MapPinIcon size={12} aria-hidden="true" /> {place.address}
                </p>
              </div>
            </div>
            {user && (
              <button
                onClick={() => toggleSaved(id)}
                aria-label={saved ? 'Remove from saved' : 'Save this place'}
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm hover:bg-white/35"
              >
                <Bookmark size={16} className={saved ? 'fill-white' : ''} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Header (no photo fallback) ──────────────────────────── */}
      {!heroPhoto && (
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-[#f8f9fa] to-white border border-[#e8eaed] p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-4 min-w-0">
              <span
                className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl text-white shadow-lg"
                style={{ background: avgColor }}
              >
                <span className="text-2xl font-bold leading-none">{avg != null ? avg.toFixed(1) : '?'}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wider opacity-90">/ 10</span>
              </span>
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight text-[#202124]">{place.name}</h1>
                {place.address && (
                  <p className="mt-1 flex items-center gap-1.5 text-[#6b7280] text-sm">
                    <MapPinIcon size={13} /> {place.address}
                  </p>
                )}
              </div>
            </div>
            {user && (
              <button onClick={() => toggleSaved(id)} className="shrink-0 flex items-center gap-1.5 rounded-full border border-[#dadce0] px-3 py-1.5 text-sm text-[#5f6368] hover:bg-[#f8f9fa] transition-colors">
                <Bookmark size={14} className={saved ? 'fill-primary text-primary' : ''} />
                {saved ? 'Saved' : 'Save'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Badges: sponsored / self-listed / features */}
      {(place.sponsored || place.selfListed || (place.features?.length ?? 0) > 0) && (
        <div className="mb-6 flex flex-wrap gap-2">
          {place.sponsored && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#f5b50a]/15 px-2.5 py-1 text-xs font-semibold text-[#b9870a]">
              <Star size={12} className="fill-[#f5b50a] text-[#f5b50a]" /> Sponsored
            </span>
          )}
          {place.selfListed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              <BadgeCheck size={12} /> Disability-friendly business
            </span>
          )}
          {place.features?.map((f) => (
            <span key={f} className="rounded-full border border-border bg-bg px-2.5 py-1 text-xs text-muted">{f}</span>
          ))}
        </div>
      )}

      {/* ── Personal match ──────────────────────────────────────── */}
      {hasProfile(needsProfile) && (() => {
        const match = scorePlace(place, needsProfile)
        const briefing = beforeYouGo(place, needsProfile)
        const firstName = needsProfile.name ? needsProfile.name.split(' ')[0] : null
        return (
          <section className="mb-6 space-y-3" aria-label="Your personal accessibility match">
            <h2 className="label">{firstName ? `${firstName}'s match` : 'Your match'}</h2>
            <MatchBadge result={match} size="md" />
            {briefing && (
              <div className="rounded-xl border border-border bg-bg p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Before you go</p>
                <p className="text-sm leading-relaxed text-ink">{briefing}</p>
              </div>
            )}
          </section>
        )
      })()}

      {/* ── OSM accessibility score + breakdown ─────────────────── */}
      {osmLoading && (
        <div className="card mb-6 p-5 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-[#e8eaed] shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-[#e8eaed]" />
              <div className="h-3 w-56 rounded bg-[#e8eaed]" />
              <div className="h-3 w-32 rounded bg-[#e8eaed]" />
            </div>
          </div>
        </div>
      )}
      {/* Fallback when OSM fetch returns nothing */}
      {!osmLoading && osmOnlyMode && !osmData && (
        <div className="card mb-6 p-5 flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f1f3f4] text-[#9aa0a6]">
            <Info size={24} />
          </span>
          <div>
            <p className="font-semibold text-[#202124]">No accessibility data found</p>
            <p className="mt-1 text-sm text-[#6b7280]">This place hasn't been mapped in OpenStreetMap yet. You can help by adding accessibility details.</p>
            <a
              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(place.name)}`}
              target="_blank" rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Add to OpenStreetMap ↗
            </a>
          </div>
        </div>
      )}
      {!osmLoading && osmData && osmData.accessScore !== null && (
        <section className="card mb-6 overflow-hidden">
          {/* Score header */}
          <div className="flex items-center gap-4 p-5">
            <span
              className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl text-white font-bold shadow"
              style={{ background: scoreColor(osmData.accessScore) }}
            >
              <span className="text-2xl leading-none">{osmData.accessScore.toFixed(1)}</span>
              <span className="text-[9px] uppercase tracking-wide opacity-90">/ 10</span>
            </span>
            <div className="flex-1">
              <p className="font-semibold text-ink text-lg">{osmData.accessLabel}</p>
              <p className="text-sm text-muted mt-0.5">{bd?.baseReason}</p>
              <p className="mt-1 text-xs text-muted flex items-center gap-1">
                {bd?.confidence === 'low' || bd?.confidence === 'none'
                  ? <><span className="text-[#f29900]">●</span> Estimated — limited mapping data</>
                  : <><span className="text-[#1e8e3e]">●</span> Verified OpenStreetMap data</>
                }
              </p>
            </div>
          </div>

          {/* Breakdown toggle */}
          {bd && bd.base !== null && (
            <>
              <button
                onClick={() => setBreakdownOpen(o => !o)}
                className="flex w-full items-center justify-between border-t border-border px-5 py-3 text-sm font-medium text-primary hover:bg-bg"
                aria-expanded={breakdownOpen}
              >
                <span>Score breakdown</span>
                {breakdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {breakdownOpen && (
                <div className="border-t border-border bg-bg px-5 py-4 text-sm space-y-1.5">
                  <div className="flex items-center justify-between text-ink">
                    <span>Base ({bd.baseReason})</span>
                    <span className="font-mono font-semibold">{bd.base}/10</span>
                  </div>
                  {bd.bonuses.map(b => (
                    <div key={b.label} className="flex items-center justify-between text-[#1e8e3e]">
                      <span>{b.label}</span>
                      <span className="font-mono font-semibold">+{b.points}</span>
                    </div>
                  ))}
                  {bd.penalties.map(p => (
                    <div key={p.label} className="flex items-center justify-between text-[#c5221f]">
                      <span>{p.label}</span>
                      <span className="font-mono font-semibold">{p.points}</span>
                    </div>
                  ))}
                  <div className="mt-2 flex items-center justify-between border-t border-border pt-2 font-bold text-ink">
                    <span>Total</span>
                    <span className="font-mono" style={{ color: scoreColor(osmData.accessScore!) }}>
                      {osmData.accessScore!.toFixed(1)}/10
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ── Physical feature badges ─────────────────────────────── */}
      {!osmLoading && osmData && (() => {
        const s = osmData.specs
        const features: React.ReactNode[] = []

        // Entrance / steps
        if (s.hasStepFreeEntrance === true)
          features.push(<FeatureBadge key="step" icon={CheckCircle2} label="Step-free entrance" positive />)
        if (s.hasStepFreeEntrance === false)
          features.push(<FeatureBadge key="step-no" icon={Info} label="Steps at entrance" />)
        if (s.entranceStepCount != null && s.entranceStepCount > 0)
          features.push(<FeatureBadge key="steps" icon={Info} label={`${s.entranceStepCount} step${s.entranceStepCount !== 1 ? 's' : ''} at entrance${s.stepHeightCm != null ? ` (${s.stepHeightCm} cm each)` : ''}`} />)
        if (s.kerbType)
          features.push(<FeatureBadge key="kerb" icon={Info} label={`Kerb: ${s.kerbType}`} positive={s.kerbType === 'flush' || s.kerbType === 'lowered'} />)
        if (s.entranceLevel)
          features.push(<FeatureBadge key="level" icon={Info} label={`Accessible entry: level ${s.entranceLevel}`} positive />)

        // Ramp
        if (s.rampPresent === true) {
          const rampParts: string[] = ['Ramp']
          if (s.rampGradientPct != null) rampParts.push(`${s.rampGradientPct.toFixed(0)}% gradient${s.rampGradient ? ` (${s.rampGradient})` : ''}`)
          else if (s.rampGradient) rampParts.push(s.rampGradient)
          if (s.rampWidthCm != null) rampParts.push(`${s.rampWidthCm} cm wide`)
          features.push(<FeatureBadge key="ramp" icon={ArrowUpDown} label={rampParts.join(' · ')} positive />)
          if (s.rampHasHandrails === true)
            features.push(<FeatureBadge key="rail" icon={CheckCircle2} label="Ramp handrail" positive />)
          if (s.rampHasHandrails === false)
            features.push(<FeatureBadge key="rail-no" icon={Info} label="No ramp handrail" />)
        }

        // Door
        if (s.doorType) {
          const doorLabel = s.doorType === 'automatic' ? 'Automatic door' : s.doorType === 'manual' ? 'Manual door' : 'Heavy manual door'
          features.push(<FeatureBadge key="door" icon={CheckCircle2} label={`${doorLabel}${s.doorWidthCm != null ? ` · ${s.doorWidthCm} cm clear width` : ''}`} positive={s.doorType === 'automatic'} />)
        } else if (s.doorWidthCm != null) {
          features.push(<FeatureBadge key="dw" icon={Info} label={`Door width: ${s.doorWidthCm} cm`} positive={s.doorWidthCm >= 80} />)
        }

        // Lift
        if (s.hasLift === true) {
          const liftParts: string[] = ['Lift / elevator']
          if (s.liftDoorWidthCm != null) liftParts.push(`${s.liftDoorWidthCm} cm door`)
          if (s.liftDepthCm != null) liftParts.push(`${s.liftDepthCm} cm deep`)
          features.push(<FeatureBadge key="lift" icon={Zap} label={liftParts.join(' · ')} positive />)
        }
        if (s.hasLift === false)
          features.push(<FeatureBadge key="lift-no" icon={Info} label="No lift" />)

        // Accessible WC — with grab rails and turning space from specs
        if (s.hasAccessibleToilet === true) {
          const wcParts = ['Accessible WC']
          if (s.toiletGrabRails) wcParts.push('grab rails')
          if (s.turningSpaceCm != null) wcParts.push(`${s.turningSpaceCm} cm turning space`)
          features.push(<FeatureBadge key="wc" icon={ToiletIcon} label={wcParts.join(' · ')} positive />)
        }
        if (s.hasAccessibleToilet === false)
          features.push(<FeatureBadge key="wc-no" icon={Info} label="No accessible WC" />)

        // Parking (single badge, includes space count)
        if (s.hasDisabledParking === true) {
          const parkParts = ['Disabled parking']
          if (s.disabledParkingSpaces != null) parkParts.push(`${s.disabledParkingSpaces} space${s.disabledParkingSpaces !== 1 ? 's' : ''}`)
          if (s.parkingDistanceM != null) parkParts.push(`${s.parkingDistanceM}m away`)
          features.push(<FeatureBadge key="park" icon={Car} label={parkParts.join(' · ')} positive />)
        }

        // Surface / tactile
        if (s.floorSurface)
          features.push(<FeatureBadge key="surf" icon={Info} label={`Surface: ${s.floorSurface}`} positive={s.floorSurface === 'smooth'} />)
        if (s.hasTactilePaving === true)
          features.push(<FeatureBadge key="tac" icon={Footprints} label="Tactile paving" positive />)

        // Sensory / hearing / communication (from OSM extras)
        const extras = osmData.extras
        const extraByLabel = (lbl: string) => extras.find(e => e.label === lbl)?.value
        if (extraByLabel('Hearing loop') === 'Yes')
          features.push(<FeatureBadge key="loop" icon={Info} label="Hearing loop" positive />)
        if (extraByLabel('Braille menu') === 'Available')
          features.push(<FeatureBadge key="braille" icon={Info} label="Braille menu available" positive />)
        if (extraByLabel('Quiet / sensory room') === 'Available')
          features.push(<FeatureBadge key="quiet" icon={Info} label="Quiet / sensory room" positive />)
        if (extraByLabel('Changing Place') === 'Available')
          features.push(<FeatureBadge key="cp" icon={ToiletIcon} label="Changing Place facility" positive />)
        if (extraByLabel('Assistance dogs') === 'Allowed')
          features.push(<FeatureBadge key="dog" icon={Info} label="Assistance dogs welcome" positive />)
        const wSeating = extraByLabel('Wheelchair seating')
        if (wSeating)
          features.push(<FeatureBadge key="wseat" icon={Info} label={`Wheelchair seating · ${wSeating}`} positive />)
        const minWidth = extraByLabel('Min. corridor width')
        if (minWidth)
          features.push(<FeatureBadge key="corridor" icon={Info} label={`Corridor · min ${minWidth}`} positive={parseFloat(minWidth) >= 120} />)

        return (
          <section className="mb-6">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#9aa0a6]">Physical access features</h2>
            {features.length > 0
              ? <div className="flex flex-wrap gap-2">{features}</div>
              : <p className="text-sm text-muted">No detailed physical access data recorded in OpenStreetMap yet.</p>
            }
            {osmData.wheelchairDescription && (
              <p className="mt-3 text-sm italic text-muted leading-relaxed">
                "{osmData.wheelchairDescription}"
              </p>
            )}
          </section>
        )
      })()}

      {/* ── Place info (OSM) ───────────────────────────────────── */}
      {!osmLoading && osmData && (osmData.openingHours || osmData.phone || osmData.website || osmData.extras.length > 0) && (
        <section className="card mb-6 divide-y divide-border">
          {osmData.openingHours && (
            <div className="flex items-start gap-3 px-4 py-3 text-sm">
              <Clock size={15} className="mt-0.5 shrink-0 text-muted" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-0.5">Hours</p>
                <p className="text-ink">{osmData.openingHours}</p>
              </div>
            </div>
          )}
          {osmData.phone && (
            <div className="flex items-center gap-3 px-4 py-3 text-sm">
              <Phone size={15} className="shrink-0 text-muted" />
              <a href={`tel:${osmData.phone}`} className="text-primary hover:underline">{osmData.phone}</a>
            </div>
          )}
          {osmData.website && (
            <div className="flex items-center gap-3 px-4 py-3 text-sm">
              <Globe size={15} className="shrink-0 text-muted" />
              <a href={osmData.website} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">{osmData.website.replace(/^https?:\/\//, '')}</a>
            </div>
          )}
          {osmData.extras.filter(e => !['Accessibility note', 'Hearing loop', 'Braille menu', 'Quiet / sensory room', 'Changing Place', 'Assistance dogs', 'Wheelchair seating', 'Min. corridor width'].includes(e.label)).map(({ label, value }) => (
            <div key={label} className="flex items-start gap-3 px-4 py-3 text-sm">
              <Info size={15} className="mt-0.5 shrink-0 text-muted" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-0.5">{label}</p>
                <p className="text-ink">{value}</p>
              </div>
            </div>
          ))}
          {osmData.osmId && (
            <div className="px-4 py-2">
              <a
                href={`https://www.openstreetmap.org/${osmData.osmId}`}
                target="_blank" rel="noreferrer"
                className="text-xs text-muted hover:text-primary hover:underline"
              >
                View / edit on OpenStreetMap ↗
              </a>
            </div>
          )}
        </section>
      )}

      {/* ── Community score rings (hidden for OSM-only POIs with no reviews) ── */}
      {!osmOnlyMode && <section className="card mb-6 p-5">
        <h2 className="label mb-4">Community accessibility scores</h2>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <ScoreRing score={place.scores.mobility} label="Mobility" />
          <ScoreRing score={place.scores.sensory} label="Sensory" />
          <ScoreRing score={place.scores.hearing} label="Hearing" />
          <ScoreRing score={place.scores.vision} label="Vision" />
        </div>
        {(place.terrainRating || place.trailDifficulty) && (
          <div className="mt-5 border-t border-border pt-5">
            <h3 className="label mb-3">Terrain & Trail</h3>
            <div className="flex flex-wrap gap-3">
              {place.terrainRating && (() => {
                const labels = ['', 'Flat / Paved', 'Mostly Flat', 'Some Slopes', 'Hilly', 'Steep / Rough']
                const colors = ['', '#1e8e3e', '#3d8b40', '#f29900', '#e67c00', '#ea4335']
                return (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">Terrain</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-white" style={{ background: colors[place.terrainRating] }}>
                      {labels[place.terrainRating]}
                    </span>
                  </div>
                )
              })()}
              {place.trailDifficulty && (() => {
                const colors: Record<string, string> = { easy: '#1e8e3e', moderate: '#f29900', hard: '#e67c00', expert: '#ea4335' }
                return (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">Trail difficulty</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium capitalize text-white" style={{ background: colors[place.trailDifficulty] }}>
                      {place.trailDifficulty}
                    </span>
                  </div>
                )
              })()}
            </div>
          </div>
        )}
      </section>}

      {/* ── Actions ─────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap gap-3">
        {!osmOnlyMode && <button onClick={() => setShowReview(true)} className="btn-primary"><Star size={16} /> Write a review</button>}
        <button onClick={() => setShowSpecsForm(true)} className="btn-ghost"><CheckCircle2 size={16} /> Add specs</button>
        <button onClick={() => setShowReport(true)} className="btn-alert"><Flag size={16} /> Report issue</button>
        <Link to="/route" className="btn-ghost"><RouteIcon size={16} /> Route</Link>
        <a href={googleMapsTo([place.lat, place.lng])} target="_blank" rel="noreferrer" className="gmaps-btn">
          <ExternalLink size={16} /> Google Maps
        </a>
        <a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${place.lat},${place.lng}`} target="_blank" rel="noreferrer" className="btn-ghost">
          <Camera size={16} /> Street View
        </a>
      </div>

      {/* ── Community specs ─────────────────────────────────────── */}
      <section className="card mb-6 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="label">Community-reported specs</h2>
          <button onClick={() => setShowSpecsForm(true)} className="text-xs text-primary font-medium hover:underline">
            + Add / update
          </button>
        </div>
        <SpecsPanel specs={specs} osmData={osmData ?? undefined} />
      </section>

      {/* ── All photos ─────────────────────────────────────────── */}
      {communityPhotos.length > 0 && (
        <section className="mb-8">
          <h2 className="label mb-3">Community photos</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {communityPhotos.map((p, i) => (
              <div key={i} className="relative overflow-hidden rounded-xl border border-border">
                <img src={p.url} alt={`Accessibility photo of ${place.name}`} className="aspect-square w-full object-cover" />
                <span className={`absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${p.verified ? 'bg-green-600 text-white' : 'bg-alert text-white'}`}>
                  {p.verified ? <ShieldCheck size={10} /> : <ShieldAlert size={10} />}
                  {p.verified ? 'Verified' : 'Unverified'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Reviews ─────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="label mb-3">Community reviews ({reviews.length})</h2>
        <div className="space-y-3">
          {reviews.length === 0 && (
            <div className="card p-6 text-center text-muted">
              <p>No reviews yet — be the first to share your experience.</p>
              <button onClick={() => setShowReview(true)} className="btn-primary mt-4 text-sm">
                <Star size={14} /> Write a review
              </button>
            </div>
          )}
          {reviews.map((r, i) => (
            <article key={r.id} className="card p-4" style={{ animation: 'pageIn 380ms ease-out both', animationDelay: `${i * 60}ms` }}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">
                  {r.userName.charAt(0)}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">{r.userName}</p>
                  <p className="label">{timeAgo(r.createdAt)}{r.verified && ' · photo verified ✓'}</p>
                </div>
                {/* Score pills */}
                <div className="flex gap-1.5">
                  {(['mobility', 'sensory', 'hearing', 'vision'] as const).map(dim => (
                    <span
                      key={dim}
                      title={`${dim}: ${r.scores[dim]}/10`}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: scoreColor(r.scores[dim]) }}
                    >
                      {r.scores[dim]}
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-ink/90">{r.body}</p>
              {r.photos.length > 0 && (
                <div className="mt-3 flex gap-2">
                  {r.photos.map((url, j) => (
                    <img key={j} src={url} alt={`Photo ${j + 1} from ${r.userName}'s review`} className="h-16 w-16 rounded-lg object-cover border border-border" />
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <Modal open={showReport} onClose={() => setShowReport(false)} title="Report an issue">
        <ReportForm placeId={id} onDone={() => { setShowReport(false); load() }} />
      </Modal>
      <Modal open={showReview} onClose={() => setShowReview(false)} title="Submit a review">
        <ReviewForm placeId={id} onDone={() => { setShowReview(false); load() }} />
      </Modal>
      <Modal open={showSpecsForm} onClose={() => setShowSpecsForm(false)} title="Add physical access specs">
        <SpecsForm placeId={id} onDone={() => { setShowSpecsForm(false); load() }} />
      </Modal>
    </Layout>
  )
}
