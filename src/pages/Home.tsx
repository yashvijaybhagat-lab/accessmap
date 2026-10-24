import { useEffect, useState, lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import {
  MapPin, ArrowRight, Star, ShieldCheck, Ear, Eye, Brain, Accessibility,
  CheckCircle2, Users, Camera, Building2, Route as RouteIcon, Navigation,
  Footprints, DoorOpen, ArrowUpDown, Toilet, Car, Volume2, Mountain, Bell,
  Flag, Layers, GraduationCap, AlertOctagon, Globe, Sparkles, Database,
  ChevronDown, Lock, Smartphone, Type, Contrast,
} from 'lucide-react'
import Layout from '../components/Layout'
// Aurora pulls the WebGL (ogl) runtime — lazy-loaded so the hero text paints
// immediately and the animated background fades in afterwards.
const Aurora = lazy(() => import('../components/reactbits/Aurora'))
import GradientText from '../components/reactbits/GradientText'
import { getHomeReviews } from '../lib/data'
import type { Review } from '../types'

/* Everything on this page describes features that exist in the app today.
 * Keep it that way — no invented numbers, venues or "AI-verified" claims. */

// ─── What a place page tells you ──────────────────────────────────────────────
const DETAILS = [
  { icon: Footprints, title: 'Entrance & steps', body: 'Step-free or not, how many steps, how tall, and the kerb type outside.' },
  { icon: ArrowUpDown, title: 'Ramps & lifts', body: 'Ramp gradient, width and handrails. Lift door width and cabin depth.' },
  { icon: DoorOpen, title: 'Doors', body: 'Automatic or manual, revolving, and the clear width in centimetres.' },
  { icon: Toilet, title: 'Accessible toilets', body: 'Whether there is one, grab rails, turning space, Changing Places.' },
  { icon: Car, title: 'Parking', body: 'Disabled parking and how many spaces, where it has been mapped.' },
  { icon: Ear, title: 'Hearing', body: 'Hearing loops and other support for deaf and hard-of-hearing visitors.' },
  { icon: Eye, title: 'Vision', body: 'Tactile paving, braille menus and tactile or audio signage.' },
  { icon: Brain, title: 'Sensory', body: 'Quiet and sensory rooms, plus a plain-language “what to expect”.' },
]

// ─── Needs ────────────────────────────────────────────────────────────────────
const NEEDS = [
  {
    icon: Accessibility, color: '#1a73e8', title: 'Wheelchair & mobility',
    points: ['Filter the map to step-free places', 'Routes for manual chairs, power chairs, canes and walkers', 'Ramps, lifts, door widths and kerbs on every place'],
  },
  {
    icon: Eye, color: '#7c3aed', title: 'Blind & low vision',
    points: ['Full screen-reader support and a keyboard list view (press L)', 'Read-aloud for place descriptions', 'Low-vision routes and high-contrast, large-text modes'],
  },
  {
    icon: Ear, color: '#0a8f8f', title: 'Deaf & hard of hearing',
    points: ['Hearing-loop filter on the map', 'Everything shown in text — nothing relies on sound', 'Optional vibration for alerts'],
  },
  {
    icon: Brain, color: '#c2410c', title: 'Autism, sensory & cognitive',
    points: ['Quiet-room filter and a dedicated sensory map', 'Plain-language descriptions of what to expect', 'Reduce motion, readable font and reading guide'],
  },
]

// ─── Route profiles (src/lib/routing.ts) ──────────────────────────────────────
const ROUTE_PROFILES = ['Manual wheelchair', 'Power chair / scooter', 'Cane, walker or low stamina', 'Blind or low vision', 'Walking']

// ─── App settings presets (src/lib/a11y.ts) ──────────────────────────────────
const PRESETS = ['Low vision', 'Blind / screen reader', 'Colour blind', 'Deaf / hard of hearing', 'Wheelchair / limited dexterity', 'Dyslexia / cognitive', 'Vestibular / seizure / migraine', 'Autism / sensory']

// ─── More tools ───────────────────────────────────────────────────────────────
const TOOLS = [
  { to: '/alerts', icon: Bell, title: 'Live alerts', body: 'Reported barriers and official lift outages from transit agencies.' },
  { to: '/trails', icon: Mountain, title: 'Accessible trails', body: 'Trails filtered by length, difficulty, surface and wheelchair access.' },
  { to: '/scan', icon: Camera, title: 'Photo scan', body: 'Point your camera at an entrance — AI flags steps, ramps, lifts and grab rails.' },
  { to: '/sensory', icon: Brain, title: 'Sensory map', body: 'Find calmer places and quiet spaces.' },
  { to: '/schools', icon: GraduationCap, title: 'Accessible schools', body: 'School accessibility and how to raise a complaint.' },
  { to: '/disaster', icon: AlertOctagon, title: 'Disaster access', body: 'Accessible help during declared disasters.' },
  { to: '/for-business', icon: Building2, title: 'For businesses', body: 'List your venue and show visitors what to expect.' },
  { to: '/councils', icon: Globe, title: 'For councils', body: 'Model the impact of mapping your area and plan improvements.' },
]

const FAQ = [
  {
    q: 'Is AccessMap free?',
    a: 'Yes. Searching the map, place details and routes are free and need no account. You only sign in to write reviews, report barriers or add details.',
  },
  {
    q: 'Where does the data come from?',
    a: 'Places and their accessibility details come from OpenStreetMap, the open map built by volunteers, plus reports from AccessMap users. Every rating says which one it comes from.',
  },
  {
    q: 'What does “~6.0” or “Estimated” mean?',
    a: 'Many places have not been checked by anyone yet. For those we show an estimate based on the type of place, marked with “~”, and list them after places with real ratings. You can add the real details in a few taps.',
  },
  {
    q: 'Does it track my location?',
    a: 'Your location is only used on your device to show nearby places and plan routes. It is never stored without your consent.',
  },
  {
    q: 'Can I install it like an app?',
    a: 'Yes. Use “Add to home screen” in your browser’s menu and AccessMap opens full-screen like a normal app — no app store needed.',
  },
]

// ─── Reviews (real, from the database) ────────────────────────────────────────
function ReviewsSection() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { getHomeReviews(6).then((r) => { setReviews(r); setLoading(false) }).catch(() => setLoading(false)) }, [])
  const avg = (r: Review) => Math.round(((r.scores.mobility + r.scores.sensory + r.scores.hearing + r.scores.vision) / 4) * 10) / 10

  // Nothing to show yet → keep the page short rather than an empty block.
  if (!loading && reviews.length === 0) return null

  return (
    <section aria-labelledby="reviews-heading" className="mx-auto max-w-5xl px-5 py-16">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label">From the community</p>
          <h2 id="reviews-heading" className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">Recent reviews</h2>
        </div>
        <Link to="/submit-review" className="btn-ghost self-start sm:self-auto"><Star size={15} aria-hidden="true" /> Write a review</Link>
      </div>
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl border border-border bg-white" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r) => (
            <figure key={r.id} className="card flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <figcaption className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{r.userName}</p>
                  {r.placeName && <p className="truncate text-xs font-medium text-primary">{r.placeName}</p>}
                </figcaption>
                <span className="shrink-0 rounded-lg bg-surface px-2 py-1 text-sm font-bold text-ink">{avg(r)}<span className="visually-hidden"> out of 10</span></span>
              </div>
              <blockquote className="line-clamp-4 flex-1 text-sm leading-relaxed text-ink/90">“{r.body}”</blockquote>
            </figure>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Example result row (illustrative, mirrors the map's list) ────────────────
function ExampleRow({ name, summary, score, source, real, est }: { name: string; summary: string; score: string; source: string; real?: boolean; est?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1a73e8]/10 text-[#1a73e8]" aria-hidden="true">
        <MapPin size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{name}</p>
          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold text-white ${est ? 'opacity-75' : ''}`} style={{ background: real ? '#1e8e3e' : '#a16207' }}>{score}</span>
        </div>
        <p className="truncate text-[13px] text-ink/80">{summary}</p>
        <p className={`truncate text-xs ${real ? 'font-semibold text-[#1e8e3e]' : 'text-muted'}`}>{source}</p>
      </div>
    </div>
  )
}

export default function Home() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <Layout bare>
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section aria-labelledby="hero-heading" className="relative mx-3 mt-3 overflow-hidden rounded-3xl bg-[#070B18] px-5 pb-14 pt-16 sm:px-10 sm:pb-20 sm:pt-24">
        <div className="pointer-events-none absolute inset-0 opacity-80" aria-hidden="true">
          <Suspense fallback={null}>
            <Aurora colorStops={['#0ABFBF', '#1a73e8', '#7C3AED']} amplitude={1.1} blend={0.5} />
          </Suspense>
        </div>

        <div className="relative z-10 mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
          <div className="text-center lg:text-left">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-sm text-white/80">
              <Accessibility size={14} aria-hidden="true" /> Free accessibility map for everyone
            </p>
            <h1 id="hero-heading" className="mt-6 text-[2.6rem] font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">
              Know before you go.{' '}
              <GradientText colors={['#0ABFBF', '#7df9ff', '#1a73e8', '#0ABFBF']} animationSpeed={5}>
                Every place, every need.
              </GradientText>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/70 lg:mx-0">
              AccessMap shows whether the places around you actually work for you — step-free entrances,
              accessible toilets, door widths, lifts, hearing loops and quiet rooms — and plans a route
              there that avoids steps and steep kerbs.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link to="/map" className="group inline-flex min-h-[52px] items-center gap-2 rounded-full bg-[#1a73e8] px-7 text-base font-semibold text-white shadow-lg shadow-[#1a73e8]/30 transition-colors hover:bg-[#1557b0]">
                Open the map <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
              <Link to="/route" className="inline-flex min-h-[52px] items-center gap-2 rounded-full border border-white/25 bg-white/10 px-7 text-base font-semibold text-white transition-colors hover:bg-white/20">
                <Navigation size={17} aria-hidden="true" /> Plan a step-free route
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-white/60 lg:justify-start">
              <li className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-[#0ABFBF]" aria-hidden="true" /> No account needed</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-[#0ABFBF]" aria-hidden="true" /> Works worldwide</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-[#0ABFBF]" aria-hidden="true" /> Built on OpenStreetMap</li>
            </ul>
          </div>

          {/* Illustration of the results list */}
          <figure className="mx-auto w-full max-w-sm" aria-label="Example of AccessMap search results">
            <div className="overflow-hidden rounded-3xl bg-white shadow-2xl shadow-black/40">
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f29900] text-white" aria-hidden="true"><Sparkles size={17} /></span>
                <div>
                  <p className="text-sm font-bold text-ink">Coffee</p>
                  <p className="text-xs text-muted">23 places · best access first</p>
                </div>
              </div>
              <div className="divide-y divide-border">
                <ExampleRow name="Corner café" summary="Step-free entrance. Accessible toilet." score="7.0" source="320 m · OpenStreetMap" real />
                <ExampleRow name="Bakery on Main St" summary="Step-free entrance." score="6.0" source="540 m · 2 community reports" real />
                <ExampleRow name="Station kiosk" summary="No access details mapped yet" score="~3.5" source="800 m · Estimated" est />
              </div>
            </div>
            <figcaption className="mt-3 text-center text-xs text-white/45">Illustration — real results show places near you.</figcaption>
          </figure>
        </div>
      </section>

      {/* ── WHAT YOU LEARN ────────────────────────────────────────────────── */}
      <section aria-labelledby="details-heading" className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="label">What AccessMap tells you</p>
          <h2 id="details-heading" className="mt-2 text-3xl font-semibold leading-tight text-ink sm:text-4xl">
            The details that decide whether you can get in.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            Star ratings and photos rarely say if there’s a step at the door. Every place on AccessMap has an
            accessibility score out of 10 and, wherever it’s been mapped, the specifics behind it.
          </p>
        </div>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DETAILS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="card p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true"><Icon size={19} /></span>
              <h3 className="mt-3 font-semibold text-ink">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── HOW RATINGS WORK ──────────────────────────────────────────────── */}
      <section aria-labelledby="ratings-heading" className="px-3">
        <div className="mx-auto max-w-5xl rounded-3xl bg-[#070B18] px-5 py-14 sm:px-12 sm:py-16">
          <div className="max-w-2xl">
            <p className="label text-[#0ABFBF]/80">Honest ratings</p>
            <h2 id="ratings-heading" className="mt-2 text-3xl font-semibold leading-tight text-white sm:text-4xl">
              You always know where a rating comes from.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-white/65">
              Accessibility data is still missing for many places. Instead of hiding that, AccessMap labels every
              score and puts places with real information first.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { icon: Database, color: '#34d399', tag: 'OpenStreetMap', title: 'Mapped details', body: 'Tags volunteers have added to the open map — wheelchair access, steps, toilets, doors, lifts and more.' },
              { icon: Users, color: '#60a5fa', tag: 'Community reports', title: 'Reported by people who went', body: 'Measurements and notes from AccessMap users. They fill gaps in the map and show up straight away.' },
              { icon: Sparkles, color: '#fbbf24', tag: 'Estimated  ~', title: 'Best guess, clearly marked', body: 'When nobody has checked a place yet, the score is estimated from the type of place and listed last.' },
            ].map(({ icon: Icon, color, tag, title, body }) => (
              <div key={tag} className="rounded-2xl border border-white/10 bg-white/[0.06] p-6">
                <div className="flex items-center gap-2">
                  <Icon size={18} style={{ color }} aria-hidden="true" />
                  <span className="text-sm font-semibold" style={{ color }}>{tag}</span>
                </div>
                <h3 className="mt-3 font-semibold text-white">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/60">{body}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-white/55">
            Scores run from 0 to 10: <strong className="text-white/80">8.5+</strong> fully accessible, <strong className="text-white/80">6.5+</strong> accessible,
            <strong className="text-white/80"> 4.5+</strong> partly accessible, below that limited or poor. Open any place to see exactly how its score was worked out.
          </p>
        </div>
      </section>

      {/* ── NEEDS ─────────────────────────────────────────────────────────── */}
      <section aria-labelledby="needs-heading" className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="label">Built for every kind of need</p>
          <h2 id="needs-heading" className="mt-2 text-3xl font-semibold leading-tight text-ink sm:text-4xl">Not just wheelchair access.</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            Set up a needs profile once and AccessMap ranks places by how well they match you, with a match percentage on each one.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {NEEDS.map(({ icon: Icon, color, title, points }) => (
            <div key={title} className="card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-white" style={{ background: color }} aria-hidden="true"><Icon size={21} /></span>
                <h3 className="text-lg font-semibold text-ink">{title}</h3>
              </div>
              <ul className="mt-4 space-y-2">
                {points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2 text-[15px] leading-snug text-ink/85">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color }} aria-hidden="true" /> {pt}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── ROUTES + SETTINGS ─────────────────────────────────────────────── */}
      <section aria-label="Routes and app settings" className="border-y border-border bg-white">
        <div className="mx-auto grid max-w-5xl gap-12 px-5 py-16 sm:py-20 lg:grid-cols-2">
          <div>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#15803d] text-white" aria-hidden="true"><RouteIcon size={21} /></span>
            <h2 className="mt-4 text-2xl font-semibold text-ink sm:text-3xl">Routes without surprises</h2>
            <p className="mt-3 leading-relaxed text-muted">
              Pick how you travel and AccessMap plans a route for you, then checks it for steps, raised kerbs and steep
              slopes along the way. If something on the route can’t be checked, it tells you instead of guessing.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="Route profiles">
              {ROUTE_PROFILES.map((p) => <li key={p} className="rounded-full border border-border bg-surface px-3 py-1 text-sm text-ink">{p}</li>)}
            </ul>
            <Link to="/route" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
              Plan a route <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#7c3aed] text-white" aria-hidden="true"><Type size={21} /></span>
            <h2 className="mt-4 text-2xl font-semibold text-ink sm:text-3xl">An app that adapts to you</h2>
            <p className="mt-3 leading-relaxed text-muted">
              Tap the accessibility button at the top of any screen. Choose a preset, or switch on just what you need —
              text size, high contrast, colour-blind-safe colours, read aloud, reduced motion, a flat 2D map and more.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="Accessibility presets">
              {PRESETS.map((p) => <li key={p} className="rounded-full border border-border bg-surface px-3 py-1 text-sm text-ink">{p}</li>)}
            </ul>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('am:open-a11y'))}
              className="mt-6 inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
            >
              <Contrast size={16} aria-hidden="true" /> Open accessibility settings
            </button>
          </div>
        </div>
      </section>

      {/* ── MORE TOOLS ────────────────────────────────────────────────────── */}
      <section aria-labelledby="tools-heading" className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
        <p className="label">More in AccessMap</p>
        <h2 id="tools-heading" className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">More than a map.</h2>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TOOLS.map(({ to, icon: Icon, title, body }) => (
            <li key={to}>
              <Link to={to} className="card group flex h-full flex-col p-5 hover:-translate-y-0.5">
                <Icon size={20} className="text-primary" aria-hidden="true" />
                <h3 className="mt-3 font-semibold text-ink group-hover:text-primary">{title}</h3>
                <p className="mt-1 flex-1 text-sm leading-relaxed text-muted">{body}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── CONTRIBUTE ────────────────────────────────────────────────────── */}
      <section aria-labelledby="help-heading" className="px-3">
        <div className="mx-auto max-w-5xl rounded-3xl border border-border bg-gradient-to-br from-[#e8f0fe] to-white px-5 py-14 sm:px-12">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div>
              <p className="label">Help fill the map</p>
              <h2 id="help-heading" className="mt-2 text-3xl font-semibold leading-tight text-ink">Been somewhere? Two minutes helps the next person.</h2>
              <p className="mt-4 leading-relaxed text-muted">
                Every report turns an estimate into a real rating for everyone who comes after you.
              </p>
            </div>
            <ol className="grid gap-3 sm:grid-cols-3">
              {[
                { to: '/map', icon: Layers, title: 'Add details', body: 'Open a place → Add specs: steps, doors, toilet, parking.' },
                { to: '/submit-review', icon: Star, title: 'Write a review', body: 'Score it for mobility, hearing, vision and sensory needs.' },
                { to: '/report', icon: Flag, title: 'Report a barrier', body: 'Broken lift, blocked ramp? Warn others straight away.' },
              ].map(({ to, icon: Icon, title, body }) => (
                <li key={title}>
                  <Link to={to} className="card flex h-full flex-col p-5 hover:-translate-y-0.5">
                    <Icon size={20} className="text-primary" aria-hidden="true" />
                    <h3 className="mt-3 font-semibold text-ink">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <ReviewsSection />

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-5 py-16">
        <h2 id="faq-heading" className="text-center text-3xl font-semibold text-ink">Questions</h2>
        <div className="mt-8 divide-y divide-border rounded-2xl border border-border bg-white">
          {FAQ.map(({ q, a }, i) => {
            const open = openFaq === i
            return (
              <div key={q}>
                <h3>
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                    aria-controls={`faq-${i}`}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-ink hover:bg-surface/60"
                  >
                    {q}
                    <ChevronDown size={18} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                </h3>
                <div id={`faq-${i}`} hidden={!open} className="px-5 pb-5 leading-relaxed text-muted">{a}</div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section aria-labelledby="cta-heading" className="px-3 pb-14">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-[#070B18] px-5 py-16 text-center">
          <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden="true">
            <Suspense fallback={null}>
              <Aurora colorStops={['#1a73e8', '#0ABFBF', '#1a73e8']} amplitude={0.8} blend={0.5} />
            </Suspense>
          </div>
          <div className="relative z-10">
            <h2 id="cta-heading" className="text-3xl font-semibold leading-tight text-white sm:text-5xl">See what’s accessible near you.</h2>
            <p className="mx-auto mt-4 max-w-lg text-lg text-white/65">Free, no sign-up — just open the map.</p>
            <Link to="/map" className="group mt-8 inline-flex min-h-[54px] items-center gap-2 rounded-full bg-[#1a73e8] px-9 text-lg font-semibold text-white shadow-xl shadow-[#1a73e8]/30 transition-colors hover:bg-[#1557b0]">
              Open the map <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-white py-12 text-center text-sm text-muted">
        <div className="mx-auto max-w-5xl px-5">
          <div className="flex items-center justify-center gap-2">
            <MapPin size={16} className="text-primary" aria-hidden="true" />
            <span className="text-base font-bold text-ink">Access<span className="text-primary">Map</span></span>
          </div>
          <nav aria-label="Footer" className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link to="/map" className="hover:text-ink hover:underline">Map</Link>
            <Link to="/route" className="hover:text-ink hover:underline">Routes</Link>
            <Link to="/alerts" className="hover:text-ink hover:underline">Alerts</Link>
            <Link to="/for-business" className="hover:text-ink hover:underline">For businesses</Link>
            <Link to="/councils" className="hover:text-ink hover:underline">For councils</Link>
            <Link to="/accessibility" className="font-medium text-primary hover:underline">Accessibility statement</Link>
            <Link to="/privacy" className="hover:text-ink hover:underline">Privacy</Link>
            <Link to="/terms" className="hover:text-ink hover:underline">Terms</Link>
          </nav>
          <ul className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs">
            <li className="flex items-center gap-1.5"><Lock size={12} aria-hidden="true" /> Location never stored without consent</li>
            <li className="flex items-center gap-1.5"><Smartphone size={12} aria-hidden="true" /> Install it like an app</li>
            <li className="flex items-center gap-1.5"><Volume2 size={12} aria-hidden="true" /> Read-aloud on every place</li>
            <li className="flex items-center gap-1.5"><ShieldCheck size={12} aria-hidden="true" /> Free for everyone</li>
          </ul>
          <p className="mt-5 text-xs">
            Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap</a> contributors ·
            Map tiles <a href="https://openfreemap.org" target="_blank" rel="noreferrer" className="underline">OpenFreeMap</a> ·{' '}
            <a href="https://openmaptiles.org" target="_blank" rel="noreferrer" className="underline">OpenMapTiles</a>
          </p>
          <p className="mt-4 text-xs text-muted/70">
            © {new Date().getFullYear()} AccessMap · Accessibility information comes from OpenStreetMap and the community and can be out of date — check with the venue before safety-critical trips.
          </p>
        </div>
      </footer>
    </Layout>
  )
}
