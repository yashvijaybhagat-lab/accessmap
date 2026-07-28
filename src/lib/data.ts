import { FIREBASE_ENABLED, getDb } from './firebase'
import type { Place, Review, Alert, AccessSpecs, Scores } from '../types'
import { mockPlaces, mockReviews, mockAlerts } from './mockData'
import { checkRate } from './rateLimit'
import { fetchAgencyOutages, outageToAlert } from './transitAlerts'
import type { AgencyOutage } from './transitAlerts'

/* Firestore SDK is loaded lazily (and cached) so it never enters the initial
 * bundle in mock-data mode — every Firebase branch awaits `fs()` for its fns. */
let _fs: Promise<typeof import('firebase/firestore')> | null = null
function fs() { return (_fs ??= import('firebase/firestore')) }

/* ------------------------------------------------------------------ *
 * Live updates (mock/local mode): a tiny pub/sub so the UI reflects
 * new reviews, alerts and specs the instant they're written — and a
 * `storage` listener so changes propagate live across browser tabs.
 * In Firebase mode, Firestore's onSnapshot drives the same callbacks.
 * ------------------------------------------------------------------ */
type LocalListener = () => void
const localListeners = new Set<LocalListener>()

function emitLocal() {
  localListeners.forEach((fn) => { try { fn() } catch { /* ignore */ } })
}

/** Subscribe to any local data mutation. Returns an unsubscribe fn. */
export function subscribeLocal(fn: LocalListener): () => void {
  localListeners.add(fn)
  return () => { localListeners.delete(fn) }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === LS_KEY || e.key === LS_SPECS) {
      // Another tab changed the data — reload our cache and notify.
      local = loadLocal()
      localSpecs = loadSpecs()
      emitLocal()
    }
  })
}

/* ------------------------------------------------------------------ *
 * Local store: keeps the UI fully functional without a backend.
 * Submissions persist to localStorage so they survive reloads.
 * ------------------------------------------------------------------ */
const LS_KEY = 'accessmap.local.v2'
type Local = { reviews: Review[]; alerts: Alert[]; places: Place[] }

function loadLocal(): Local {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Local>
      return { reviews: parsed.reviews ?? [...mockReviews], alerts: parsed.alerts ?? [...mockAlerts], places: parsed.places ?? [] }
    }
  } catch { /* ignore */ }
  return { reviews: [...mockReviews], alerts: [...mockAlerts], places: [] }
}
function saveLocal(l: Local) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(l)) } catch { /* ignore */ }
}
let local = typeof localStorage !== 'undefined' ? loadLocal() : { reviews: [...mockReviews], alerts: [...mockAlerts], places: [] as Place[] }
const uid = () => Math.random().toString(36).slice(2, 10)

// Duck-typed so we don't need a static `Timestamp` import (Firestore timestamps
// expose `.toMillis()`); plain epoch numbers pass straight through.
const toMs = (v: unknown): number =>
  v && typeof (v as { toMillis?: unknown }).toMillis === 'function'
    ? (v as { toMillis: () => number }).toMillis()
    : typeof v === 'number' ? v : Date.now()

/* Offline cache for live (Firebase) reads — last successful result is kept in
 * localStorage so the map still renders when the network drops. */
function cacheGet<T>(key: string): T | null {
  try { const r = localStorage.getItem('am.cache.' + key); return r ? (JSON.parse(r) as T) : null } catch { return null }
}
function cacheSet<T>(key: string, value: T) {
  try { localStorage.setItem('am.cache.' + key, JSON.stringify(value)) } catch { /* quota — ignore */ }
}

/* ── In-memory cache (5 min TTL) ─────────────────────────────────────────── */
type CacheEntry<T> = { data: T; ts: number }
const CACHE_TTL = 5 * 60 * 1000
const cache: { places?: CacheEntry<Place[]>; alerts?: CacheEntry<Alert[]> } = {}

/* ----------------------------- Places ----------------------------- */
export async function getPlaces(): Promise<Place[]> {
  const db = FIREBASE_ENABLED ? await getDb() : null
  if (!db) {
    // sponsored / self-listed businesses first
    return [...local.places, ...mockPlaces].sort((a, b) => Number(b.sponsored) - Number(a.sponsored))
  }
  try {
    const { collection, getDocs } = await fs()
    const snap = await getDocs(collection(db, 'places'))
    const places = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Place, 'id'>), lastUpdated: toMs(d.data().lastUpdated) }))
    cacheSet('places', places)
    return places
  } catch (e) {
    // Offline / network error — fall back to the last cached set.
    const cached = cacheGet<Place[]>('places')
    if (cached) return cached
    throw e
  }
}

export async function getPlace(id: string): Promise<Place | null> {
  const db = FIREBASE_ENABLED ? await getDb() : null
  if (!db)
    return local.places.find((p) => p.id === id) ?? mockPlaces.find((p) => p.id === id) ?? null
  const { doc, getDoc } = await fs()
  const d = await getDoc(doc(db, 'places', id))
  if (!d.exists()) return null
  return { id: d.id, ...(d.data() as Omit<Place, 'id'>), lastUpdated: toMs(d.data().lastUpdated) }
}

export async function addPlace(input: Omit<Place, 'id' | 'lastUpdated' | 'reviewCount'>): Promise<Place> {
  checkRate('listing', { minGapMs: 15000, maxPerHour: 8, label: 'business listing' })
  const base = { ...input, reviewCount: 0, lastUpdated: Date.now() }
  const db = FIREBASE_ENABLED ? await getDb() : null
  if (!db) {
    const place: Place = { ...base, id: 'biz-' + uid() }
    local.places.unshift(place)
    saveLocal(local)
    emitLocal()
    return place
  }
  const { collection, addDoc, serverTimestamp } = await fs()
  const ref = await addDoc(collection(db, 'places'), { ...input, reviewCount: 0, lastUpdated: serverTimestamp() })
  return { ...base, id: ref.id }
}

export async function ensurePlace(place: Place): Promise<void> {
  const db = FIREBASE_ENABLED ? await getDb() : null
  if (!db) return
  const { doc, getDoc, setDoc, serverTimestamp } = await fs()
  const ref = doc(db, 'places', place.id)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      name: place.name, lat: place.lat, lng: place.lng,
      address: place.address ?? '', scores: place.scores,
      reviewCount: 0, lastUpdated: serverTimestamp(),
    })
  }
}

/* ----------------------------- Reviews ---------------------------- */
export async function getReviews(placeId: string): Promise<Review[]> {
  const db = FIREBASE_ENABLED ? await getDb() : null
  if (!db)
    return local.reviews.filter((r) => r.placeId === placeId).sort((a, b) => b.createdAt - a.createdAt)
  const { collection, query, orderBy, getDocs } = await fs()
  const q = query(collection(db, 'places', placeId, 'reviews'), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, placeId, ...(d.data() as Omit<Review, 'id' | 'placeId'>), createdAt: toMs(d.data().createdAt) }))
}

/* Review quality filter — silently hides low-quality or inappropriate content */
const BAD_PATTERNS = [
  /\b(fuck|shit|cunt|bitch|asshole|bastard|damn|hell|ass\b|dick|cock|pussy|whore|slut|nigger|nigga|faggot|retard)\b/i,
  /(.)\1{5,}/,        // spammy repeated chars e.g. "aaaaaaaa"
  /https?:\/\//i,     // links
  /\b(buy|sell|cheap|discount|promo|click here|visit us|order now|free money)\b/i, // spam
]

function reviewPasses(body: string, scores: Scores): boolean {
  if (BAD_PATTERNS.some(p => p.test(body))) return false
  if (body.trim().length < 20) return false
  // all scores at exactly 0 or all at 10 with no real text = likely spam
  const vals = Object.values(scores)
  const allSame = vals.every(v => v === vals[0])
  if (allSame && body.trim().length < 40) return false
  return true
}

export async function addReview(input: Omit<Review, 'id' | 'createdAt' | 'status'>): Promise<Review> {
  checkRate('review', { minGapMs: 8000, maxPerHour: 15, label: 'review' })
  const status: 'approved' | 'hidden' = reviewPasses(input.body, input.scores) ? 'approved' : 'hidden'
  const payload = { ...input, status }
  const db = FIREBASE_ENABLED ? await getDb() : null
  if (!db) {
    const review: Review = { ...payload, id: uid(), createdAt: Date.now() }
    local.reviews.unshift(review)
    saveLocal(local)
    emitLocal()
    return review
  }
  const { collection, addDoc, serverTimestamp } = await fs()
  const ref = await addDoc(collection(db, 'places', input.placeId, 'reviews'), {
    ...payload, createdAt: serverTimestamp(),
  })
  return { ...payload, id: ref.id, createdAt: Date.now() }
}

export async function getHomeReviews(limit = 6): Promise<Review[]> {
  const db = FIREBASE_ENABLED ? await getDb() : null
  if (!db) {
    return local.reviews
      .filter(r => r.status === 'approved' && r.body.trim().length >= 20)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
  }
  // Firestore: collectionGroup across all places/reviews
  const { collectionGroup, query, where, orderBy, limit: fsLimit, getDocs } = await fs()
  const q = query(
    collectionGroup(db, 'reviews'),
    where('status', '==', 'approved'),
    orderBy('createdAt', 'desc'),
    fsLimit(limit),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({
    id: d.id,
    placeId: d.ref.parent.parent?.id ?? '',
    ...(d.data() as Omit<Review, 'id' | 'placeId'>),
    createdAt: toMs(d.data().createdAt),
  }))
}

/* ----------------------------- Alerts ----------------------------- */
export async function getAlerts(placeId?: string, onlyActive = true): Promise<Alert[]> {
  const db = FIREBASE_ENABLED ? await getDb() : null
  if (!db) {
    return local.alerts
      .filter((a) => (placeId ? a.placeId === placeId : true))
      .filter((a) => (onlyActive ? a.status === 'active' : true))
      .sort((a, b) => b.createdAt - a.createdAt)
  }
  const { collection, query, where, getDocs } = await fs()
  const clauses = []
  if (placeId) clauses.push(where('placeId', '==', placeId))
  if (onlyActive) clauses.push(where('status', '==', 'active'))
  const q = query(collection(db, 'alerts'), ...clauses)
  const snap = await getDocs(q)
  const data = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Alert, 'id'>), createdAt: toMs(d.data().createdAt) }))
    .sort((a, b) => b.createdAt - a.createdAt)
  if (!placeId) cache.alerts = { data, ts: Date.now() }
  return data
}

export async function addAlert(input: Omit<Alert, 'id' | 'createdAt' | 'status'>): Promise<Alert> {
  checkRate('report', { minGapMs: 8000, maxPerHour: 20, label: 'report' })
  const db = FIREBASE_ENABLED ? await getDb() : null
  if (!db) {
    const alert: Alert = { ...input, id: uid(), status: 'active', createdAt: Date.now() }
    local.alerts.unshift(alert)
    saveLocal(local)
    emitLocal()
    return alert
  }
  const { collection, addDoc, serverTimestamp } = await fs()
  const ref = await addDoc(collection(db, 'alerts'), {
    ...input, status: 'active', createdAt: serverTimestamp(),
  })
  return { ...input, id: ref.id, status: 'active', createdAt: Date.now() }
}

export async function resolveAlert(id: string): Promise<void> {
  const db = FIREBASE_ENABLED ? await getDb() : null
  if (!db) {
    local.alerts = local.alerts.map((a) => (a.id === id ? { ...a, status: 'resolved', resolvedAt: Date.now() } : a))
    saveLocal(local)
    emitLocal()
    return
  }
  const { doc, updateDoc, serverTimestamp } = await fs()
  await updateDoc(doc(db, 'alerts', id), { status: 'resolved', resolvedAt: serverTimestamp() })
}

/* ----------------------------- Access Specs ----------------------- */
const LS_SPECS = 'accessmap.specs.v1'
function loadSpecs(): AccessSpecs[] {
  try { const r = localStorage.getItem(LS_SPECS); return r ? JSON.parse(r) : [] } catch { return [] }
}
function saveSpecs(s: AccessSpecs[]) { try { localStorage.setItem(LS_SPECS, JSON.stringify(s)) } catch { /* */ } }
let localSpecs: AccessSpecs[] = typeof localStorage !== 'undefined' ? loadSpecs() : []

export async function getSpecs(placeId: string): Promise<AccessSpecs[]> {
  const db = FIREBASE_ENABLED ? await getDb() : null
  if (!db) return localSpecs.filter(s => s.placeId === placeId).sort((a, b) => b.contributedAt - a.contributedAt)
  const { collection, query, orderBy, getDocs } = await fs()
  const q = query(collection(db, 'places', placeId, 'specs'), orderBy('contributedAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AccessSpecs, 'id'>), contributedAt: toMs(d.data().contributedAt) }))
}

export async function addSpecs(input: Omit<AccessSpecs, 'id' | 'contributedAt'>): Promise<AccessSpecs> {
  checkRate('report', { minGapMs: 5000, maxPerHour: 20, label: 'spec contribution' })
  const db = FIREBASE_ENABLED ? await getDb() : null
  if (!db) {
    const s: AccessSpecs = { ...input, id: uid(), contributedAt: Date.now() }
    localSpecs.unshift(s)
    saveSpecs(localSpecs)
    emitLocal()
    return s
  }
  const { collection, addDoc, serverTimestamp } = await fs()
  const ref = await addDoc(collection(db, 'places', input.placeId, 'specs'), { ...input, contributedAt: serverTimestamp() })
  return { ...input, id: ref.id, contributedAt: Date.now() }
}

/* --------------------------- Live feeds --------------------------- *
 * subscribe* helpers push a fresh list to `cb` on every change. They
 * use Firestore onSnapshot when live, or the local pub/sub otherwise.
 * Each returns a synchronous unsubscribe function. The callback fires
 * with the current data so callers don't need a separate initial fetch.
 * ------------------------------------------------------------------ */

export function subscribeAlerts(
  placeId: string | undefined,
  cb: (alerts: Alert[]) => void,
  onlyActive = true,
): () => void {
  let active = true
  let unsubFs: (() => void) | null = null

  if (FIREBASE_ENABLED) {
    ;(async () => {
      const db = await getDb()
      if (!db || !active) return
      const { collection, query, where, onSnapshot } = await fs()
      const clauses = []
      if (placeId) clauses.push(where('placeId', '==', placeId))
      if (onlyActive) clauses.push(where('status', '==', 'active'))
      const q = query(collection(db, 'alerts'), ...clauses)
      unsubFs = onSnapshot(q, (snap) => {
        if (!active) return
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Alert, 'id'>), createdAt: toMs(d.data().createdAt) }))
          .sort((a, b) => b.createdAt - a.createdAt)
        cb(list)
      }, () => { /* swallow permission errors — UI keeps last value */ })
    })()
    return () => { active = false; unsubFs?.() }
  }

  const run = () => { getAlerts(placeId, onlyActive).then((a) => { if (active) cb(a) }) }
  run()
  const unsub = subscribeLocal(run)
  return () => { active = false; unsub() }
}

export function subscribeReviews(
  placeId: string,
  cb: (reviews: Review[]) => void,
): () => void {
  let active = true
  let unsubFs: (() => void) | null = null

  if (FIREBASE_ENABLED) {
    ;(async () => {
      const db = await getDb()
      if (!db || !active) return
      const { collection, query, orderBy, onSnapshot } = await fs()
      const q = query(collection(db, 'places', placeId, 'reviews'), orderBy('createdAt', 'desc'))
      unsubFs = onSnapshot(q, (snap) => {
        if (!active) return
        const list = snap.docs.map((d) => ({
          id: d.id, placeId,
          ...(d.data() as Omit<Review, 'id' | 'placeId'>),
          createdAt: toMs(d.data().createdAt),
        }))
        cb(list)
      }, () => { /* swallow errors */ })
    })()
    return () => { active = false; unsubFs?.() }
  }

  const run = () => { getReviews(placeId).then((r) => { if (active) cb(r) }) }
  run()
  const unsub = subscribeLocal(run)
  return () => { active = false; unsub() }
}

// ── Agency alert sync ──────────────────────────────────────────────────────

const AGENCY_SYNC_INTERVAL = 5 * 60 * 1000
let _agencySyncTimer: ReturnType<typeof setInterval> | null = null
let _lastSyncedOutageIds = new Set<string>()

async function resolveOutagePlaceId(outage: AgencyOutage): Promise<string | null> {
  if (outage.placeId) return outage.placeId
  const places = await getPlaces()
  const needle = outage.stationName.toLowerCase()
  const match = places.find(
    (p) =>
      p.name.toLowerCase().includes(needle) ||
      needle.includes(p.name.toLowerCase().split(' ')[0]),
  )
  return match?.id ?? null
}

export async function syncAgencyAlerts(): Promise<void> {
  let outages: AgencyOutage[]
  try {
    outages = await fetchAgencyOutages()
  } catch {
    return
  }

  const freshIds = new Set(outages.map((o) => o.id))

  for (const outage of outages) {
    if (_lastSyncedOutageIds.has(outage.id)) continue
    const placeId = await resolveOutagePlaceId(outage)
    if (!placeId) continue
    const existing = await getAlerts(placeId, true)
    const alreadyStored = existing.some(
      (a) => a.source === 'agency' && a.description.includes(outage.unit),
    )
    if (alreadyStored) continue
    await addAlert(outageToAlert(outage, placeId))
  }

  const allActive = await getAlerts(undefined, true)
  for (const alert of allActive) {
    if (alert.source !== 'agency') continue
    const stillActive = outages.some((o) => alert.description.includes(o.unit))
    if (!stillActive) await resolveAlert(alert.id)
  }

  _lastSyncedOutageIds = freshIds
}

export function startAgencyAlertSync(): () => void {
  syncAgencyAlerts()
  if (_agencySyncTimer) clearInterval(_agencySyncTimer)
  _agencySyncTimer = setInterval(syncAgencyAlerts, AGENCY_SYNC_INTERVAL)
  return () => {
    if (_agencySyncTimer) { clearInterval(_agencySyncTimer); _agencySyncTimer = null }
  }
}
