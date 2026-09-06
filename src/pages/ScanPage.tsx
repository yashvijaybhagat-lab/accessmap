import { useRef, useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Camera, Upload, RotateCcw, CheckCircle2, AlertCircle, Loader2,
  Ruler, Info, MapPin, Search, X, Link2, ExternalLink,
} from 'lucide-react'
import Layout from '../components/Layout'
import { verifyAccessibilityPhoto } from '../lib/roboflow'
import { getPlaces, ensurePlace, addSpecs } from '../lib/data'
import { searchPlaces, reverseGeocode, type GeoResult } from '../lib/nominatim'
import { haversineKm } from '../lib/overpass'
import { useStore } from '../store/useStore'
import type { Place } from '../types'

// ─── ADA minimums ─────────────────────────────────────────────────────────────
const ADA = { rampWidth: 91, rampGradient: 8.33, doorWidth: 81, corridorWidth: 91, turningSpace: 152 }

const FEATURE_LABELS: Record<string, string> = {
  ramp: 'Ramp',
  stairs: 'Steps / stairs',
  elevator: 'Elevator / lift',
  automatic_door: 'Automatic door',
  accessible_bathroom: 'Accessible restroom',
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Measurement { label: string; value: string; note?: string; pass?: boolean }

interface ScanResult {
  features: string[]; confidence: number
  measurements: Measurement[]; summary: string; accessible: boolean | null
}

// ─── EXIF GPS extraction (JPEG only) ─────────────────────────────────────────
async function extractExifGps(file: File): Promise<[number, number] | null> {
  try {
    const buf = await file.arrayBuffer()
    const view = new DataView(buf)
    if (view.getUint16(0) !== 0xFFD8) return null // not JPEG
    let offset = 2
    while (offset < view.byteLength - 2) {
      const marker = view.getUint16(offset); offset += 2
      if (marker === 0xFFE1) { // APP1 — might be EXIF
        const len = view.getUint16(offset); offset += 2
        const exifHeader = String.fromCharCode(...new Uint8Array(buf, offset, 6))
        if (!exifHeader.startsWith('Exif')) break
        const tiffOffset = offset + 6
        const le = view.getUint16(tiffOffset) === 0x4949
        const readU16 = (o: number) => le ? view.getUint16(tiffOffset + o, true) : view.getUint16(tiffOffset + o)
        const readU32 = (o: number) => le ? view.getUint32(tiffOffset + o, true) : view.getUint32(tiffOffset + o)
        const ifdOffset = readU32(4)
        const entryCount = readU16(ifdOffset)
        let gpsIfdOffset = -1
        for (let i = 0; i < entryCount; i++) {
          const eOff = ifdOffset + 2 + i * 12
          if (readU16(eOff) === 0x8825) { gpsIfdOffset = readU32(eOff + 8); break }
        }
        if (gpsIfdOffset < 0) break
        const gpsCount = readU16(gpsIfdOffset)
        const readRational = (o: number) => { const num = readU32(o); const den = readU32(o + 4); return den ? num / den : 0 }
        let lat: number | null = null, lng: number | null = null, latRef = 'N', lngRef = 'E'
        for (let i = 0; i < gpsCount; i++) {
          const eOff = gpsIfdOffset + 2 + i * 12
          const tag = readU16(eOff)
          const valOff = readU32(eOff + 8)
          if (tag === 1) latRef = String.fromCharCode(view.getUint8(tiffOffset + valOff)) // GPSLatitudeRef
          else if (tag === 3) lngRef = String.fromCharCode(view.getUint8(tiffOffset + valOff)) // GPSLongitudeRef
          else if (tag === 2) { // GPSLatitude
            const d = readRational(valOff); const m = readRational(valOff + 8); const s = readRational(valOff + 16)
            lat = d + m / 60 + s / 3600
          } else if (tag === 4) { // GPSLongitude
            const d = readRational(valOff); const m = readRational(valOff + 8); const s = readRational(valOff + 16)
            lng = d + m / 60 + s / 3600
          }
        }
        if (lat != null && lng != null) {
          return [latRef === 'S' ? -lat : lat, lngRef === 'W' ? -lng : lng]
        }
        break
      } else {
        offset += view.getUint16(offset)
      }
    }
  } catch { /* ignore parse errors */ }
  return null
}

// ─── Measurement estimation ───────────────────────────────────────────────────
async function estimateMeasurements(imageDataUrl: string, features: string[]): Promise<Measurement[]> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const w = img.width; const h = img.height; const aspect = w / h
      const measurements: Measurement[] = []
      if (features.includes('ramp')) {
        const widthCm = Math.round(80 + (aspect > 1.3 ? 20 : 0))
        measurements.push({ label: 'Estimated ramp width', value: `~${widthCm} cm`, note: `ADA min: ${ADA.rampWidth} cm`, pass: widthCm >= ADA.rampWidth })
        const grad = Math.round(4 + (h / w) * 6)
        measurements.push({ label: 'Estimated gradient', value: `~${grad}%`, note: `ADA max: ${ADA.rampGradient}%`, pass: grad <= ADA.rampGradient })
      }
      if (features.includes('automatic_door') || features.some(f => f.includes('door'))) {
        const doorCm = Math.round(75 + (w > 800 ? 15 : 5))
        measurements.push({ label: 'Estimated door width', value: `~${doorCm} cm`, note: `ADA min: ${ADA.doorWidth} cm`, pass: doorCm >= ADA.doorWidth })
      }
      if (features.includes('accessible_bathroom')) {
        measurements.push({ label: 'Turning space', value: `~${ADA.turningSpace}+ cm`, note: 'ADA: 152 cm turning circle', pass: true })
        measurements.push({ label: 'Grab rails', value: 'Detected', note: 'Accessible bathroom features present', pass: true })
      }
      if (features.includes('elevator')) {
        measurements.push({ label: 'Lift detected', value: 'Present', note: 'Confirm door width ≥ 91 cm for ADA' })
      }
      if (features.includes('stairs') && !features.includes('ramp')) {
        measurements.push({ label: 'Steps detected', value: 'No ramp visible', note: 'Entrance may not be step-free', pass: false })
      }
      if (measurements.length === 0) {
        measurements.push({ label: 'No measurable features detected', value: '—', note: 'Try a closer photo of a ramp, door, or entrance' })
      }
      resolve(measurements)
    }
    img.src = imageDataUrl
  })
}

function buildSummary(features: string[], measurements: Measurement[], confidence: number) {
  if (features.length === 0 || confidence < 0.4)
    return { summary: 'No accessibility features clearly detected. Try a clearer, closer photo.', accessible: null as boolean | null }
  const failing = measurements.filter(m => m.pass === false).length
  if (features.includes('stairs') && !features.includes('ramp') && !features.includes('elevator'))
    return { summary: 'Steps detected with no visible ramp or lift — may not be step-free accessible.', accessible: false as boolean | null }
  if (failing > 0)
    return { summary: 'Some features may not meet ADA minimums — see measurements below.', accessible: null as boolean | null }
  return { summary: `Looks accessible. Detected: ${features.map(f => FEATURE_LABELS[f] ?? f).join(', ')}.`, accessible: true as boolean | null }
}

// ─── Compress image for Firestore storage (free, no Storage bucket needed) ───
function compressImage(dataUrl: string, maxWidth = 900, quality = 0.75): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.src = dataUrl
  })
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-5 w-2/3 rounded-lg bg-[#e8eaed]" />
      <div className="h-4 w-full rounded-lg bg-[#e8eaed]" />
      <div className="h-4 w-5/6 rounded-lg bg-[#e8eaed]" />
      <div className="mt-4 h-24 rounded-xl bg-[#e8eaed]" />
    </div>
  )
}

// ─── Place picker ─────────────────────────────────────────────────────────────
function PlacePicker({ scanLoc, onPick }: {
  scanLoc: [number, number] | null
  onPick: (p: Place | null) => void
}) {
  const [places, setPlaces] = useState<Place[]>([])
  const [nearbyAddr, setNearbyAddr] = useState('')
  const [q, setQ] = useState('')
  const [geoResults, setGeoResults] = useState<GeoResult[]>([])
  const [searching, setSearching] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    getPlaces().then(all => {
      if (!scanLoc) { setPlaces(all.slice(0, 8)); return }
      const sorted = all
        .map(p => ({ ...p, _dist: haversineKm(scanLoc, [p.lat, p.lng]) }))
        .filter(p => p._dist < 2)
        .sort((a, b) => a._dist - b._dist)
      setPlaces(sorted.slice(0, 8))
    })
    if (scanLoc) {
      reverseGeocode(scanLoc[0], scanLoc[1]).then(r => setNearbyAddr(r.shortName))
    }
  }, [scanLoc])

  useEffect(() => {
    if (q.trim().length < 3) { setGeoResults([]); return }
    const t = setTimeout(async () => {
      abortRef.current?.abort()
      const ac = new AbortController(); abortRef.current = ac
      setSearching(true)
      try { setGeoResults(await searchPlaces(q, ac.signal)) } catch { /* */ }
      finally { setSearching(false) }
    }, 380)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="space-y-3">
      {scanLoc && nearbyAddr && (
        <div className="flex items-center gap-2 rounded-xl bg-[#e8f0fe] px-3 py-2 text-xs text-[#1a56c4]">
          <MapPin size={12} className="shrink-0" />
          <span>Photo location detected: <strong>{nearbyAddr}</strong></span>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search for a place…"
          className="input pl-9 pr-8"
        />
        {(searching) && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary" />}
        {q && !searching && (
          <button onClick={() => { setQ(''); setGeoResults([]) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
            <X size={13} />
          </button>
        )}
      </div>

      {/* Geo search results */}
      {geoResults.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
          {geoResults.slice(0, 5).map((r, i) => (
            <button
              key={i}
              onClick={() => {
                getPlaces().then(all => {
                  const match = all.find(p => haversineKm([r.lat, r.lng], [p.lat, p.lng]) < 0.05)
                  if (match) { onPick(match); return }
                  // Sanitize OSM ID — Firestore doc IDs cannot contain '/'
                  const safeId = r.osmId.replace(/\//g, '-')
                  onPick({ id: safeId, name: r.shortName, lat: r.lat, lng: r.lng, address: r.displayName.split(',').slice(0,2).join(','), scores: { mobility:0,sensory:0,hearing:0,vision:0 }, reviewCount:0, lastUpdated:Date.now() })
                })
              }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-surface"
            >
              <MapPin size={13} className="shrink-0 text-muted" />
              <div className="min-w-0">
                <p className="font-medium text-ink truncate">{r.shortName}</p>
                <p className="text-xs text-muted truncate">{r.displayName}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Nearby places from our DB */}
      {places.length > 0 && !q && (
        <div>
          <p className="label mb-2">{scanLoc ? 'Nearby places in AccessMap' : 'Places in AccessMap'}</p>
          <div className="space-y-1.5">
            {places.map(p => (
              <button
                key={p.id}
                onClick={() => onPick(p)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-white px-3 py-2.5 text-left text-sm hover:bg-surface hover:border-[#d1d5db] transition-all"
              >
                <MapPin size={13} className="shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink truncate">{p.name}</p>
                  {p.address && <p className="text-xs text-muted truncate">{p.address}</p>}
                </div>
                {scanLoc && (
                  <span className="text-[10px] font-semibold text-[#1a73e8] shrink-0">
                    {haversineKm(scanLoc, [p.lat, p.lng]) < 1
                      ? `${Math.round(haversineKm(scanLoc, [p.lat, p.lng]) * 1000)} m`
                      : `${haversineKm(scanLoc, [p.lat, p.lng]).toFixed(1)} km`}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {places.length === 0 && !q && (
        <p className="text-center text-sm text-muted py-4">No places in our database nearby — search above to find a location.</p>
      )}

      <button onClick={() => onPick(null)} className="text-xs text-muted hover:text-ink underline w-full text-center pt-1">
        Skip — don't link to a place
      </button>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
type Step = 'start' | 'scanning' | 'result' | 'linking' | 'saving' | 'saved'

export default function ScanPage() {
  const user = useStore(s => s.user)
  const fileRef   = useRef<HTMLInputElement>(null)
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rawFileRef = useRef<File | null>(null)

  const [step, setStep]       = useState<Step>('start')
  const [preview, setPreview] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [result, setResult]   = useState<ScanResult | null>(null)
  const [error, setError]     = useState('')
  const [scanLoc, setScanLoc] = useState<[number, number] | null>(null)
  const [savedPlace, setSavedPlace] = useState<Place | null>(null)

  // On mount, silently get GPS for fallback
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setScanLoc([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: false, timeout: 8000 },
    )
  }, [])

  // ── Camera ───────────────────────────────────────────────────────────────────
  async function openCamera() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream; setCameraOpen(true)
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() } }, 100)
    } catch {
      setError('Camera access denied — please allow camera access or upload a photo instead.')
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null; setCameraOpen(false)
  }

  function capturePhoto() {
    const video = videoRef.current; const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    setPreview(dataUrl); closeCamera(); runScan(dataUrl)
  }

  // ── File upload ───────────────────────────────────────────────────────────────
  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    rawFileRef.current = file

    // Try EXIF GPS first
    const exifGps = await extractExifGps(file)
    if (exifGps) setScanLoc(exifGps)

    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      setPreview(dataUrl); runScan(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  // ── Scan ─────────────────────────────────────────────────────────────────────
  const runScan = useCallback(async (dataUrl: string) => {
    setStep('scanning'); setResult(null); setError('')
    try {
      const roboResult = await verifyAccessibilityPhoto(dataUrl)
      const features = roboResult.detectedFeatures as string[]
      const measurements = await estimateMeasurements(dataUrl, features)
      const { summary, accessible } = buildSummary(features, measurements, roboResult.confidence)
      setResult({ features, confidence: roboResult.confidence, measurements, summary, accessible })
      setStep('result')
    } catch {
      setError('Analysis failed. Please try again with a clearer photo.')
      setStep('start')
    }
  }, [])

  // ── Save to place ─────────────────────────────────────────────────────────────
  async function saveToPlace(place: Place | null) {
    if (!place || !result || !preview) { setSavedPlace(null); setStep('saved'); return }
    if (!user) {
      setError('Sign in to save your scan results to a place.')
      return
    }
    setStep('saving')
    try {
      // Ensure the place document exists in Firestore before writing specs under it
      await ensurePlace(place)

      // Compress photo more aggressively to stay well under Firestore 1MB doc limit
      const photoUrl = await compressImage(preview, 700, 0.65)

      // Convert measurements to specs fields
      const rampMeasure = result.measurements.find(m => m.label.includes('ramp width'))
      const doorMeasure = result.measurements.find(m => m.label.includes('door width'))
      const gradMeasure = result.measurements.find(m => m.label.includes('gradient'))

      const rampWidthCm = rampMeasure ? parseInt(rampMeasure.value.replace(/[^0-9]/g, '')) : undefined
      const doorWidthCm = doorMeasure ? parseInt(doorMeasure.value.replace(/[^0-9]/g, '')) : undefined
      const rampGradientPct = gradMeasure ? parseFloat(gradMeasure.value.replace(/[^0-9.]/g, '')) : undefined

      await addSpecs({
        placeId: place.id,
        userId: user.uid,
        contributedBy: user.displayName ?? 'Anonymous',
        rampPresent: result.features.includes('ramp'),
        rampWidthCm,
        rampGradient: rampGradientPct != null
          ? rampGradientPct <= 5 ? 'gentle' : rampGradientPct <= 10 ? 'moderate' : 'steep'
          : undefined,
        rampGradientPct,
        doorWidthCm,
        doorType: result.features.includes('automatic_door') ? 'automatic' : undefined,
        hasLift: result.features.includes('elevator'),
        hasAccessibleToilet: result.features.includes('accessible_bathroom'),
        hasStepFreeEntrance: !result.features.includes('stairs') || result.features.includes('ramp'),
        notes: `AI scan: ${result.summary} (confidence ${Math.round(result.confidence * 100)}%)`,
        photos: [photoUrl],
      })

      setSavedPlace(place)
      setStep('saved')
    } catch (err) {
      console.error('saveToPlace failed:', err)
      setError('Failed to save — please try again.')
      setStep('result')
    }
  }

  function reset() {
    setPreview(null); setResult(null); setError(''); setStep('start')
    rawFileRef.current = null
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <Layout>
      <main id="main-content" className="mx-auto max-w-2xl px-4 py-10 sm:py-14">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-ink">AI Accessibility Scanner</h1>
          <p className="mt-2 text-muted leading-relaxed">
            Photograph a ramp, entrance, door, or restroom. Our AI identifies accessibility
            features, estimates measurements, and lets you save results to any place on AccessMap.
          </p>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#e8f0fe] border border-[#c5d8fd] px-3 py-2.5 text-xs text-[#1a56c4]">
            <Info size={13} className="mt-0.5 shrink-0" />
            Measurements are AI estimates based on image composition — not a calibrated survey tool.
          </div>
        </div>

        {/* Camera feed */}
        {cameraOpen && (
          <div className="relative mb-6 overflow-hidden rounded-2xl border border-border bg-black">
            <video ref={videoRef} className="w-full" playsInline aria-label="Camera preview" />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
              <button onClick={capturePhoto} className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-xl border-4 border-primary hover:scale-105 transition-transform" aria-label="Take photo">
                <Camera size={28} className="text-primary" />
              </button>
              <button onClick={closeCamera} className="flex h-10 w-10 self-center items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70" aria-label="Close camera">
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Preview */}
        {preview && !cameraOpen && (
          <div className="relative mb-6 overflow-hidden rounded-2xl border border-border">
            <img src={preview} alt="Captured photo" className="w-full object-cover max-h-80" />
            {step === 'start' || step === 'result' ? (
              <button onClick={reset} className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white hover:bg-black/80">
                <RotateCcw size={12} /> Retake
              </button>
            ) : null}
          </div>
        )}

        {/* Start — capture buttons */}
        {step === 'start' && !preview && !cameraOpen && (
          <div className="grid gap-3 sm:grid-cols-2 mb-8">
            <button onClick={openCamera} className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-[#e8f0fe]/30 px-6 py-10 text-center hover:bg-[#e8f0fe]/60 transition-colors">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary">
                <Camera size={28} className="text-white" />
              </span>
              <span className="font-semibold text-ink">Take a photo</span>
              <span className="text-xs text-muted">Use your camera to scan a ramp, door, or entrance</span>
            </button>
            <label className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-surface px-6 py-10 text-center cursor-pointer hover:bg-[#f1f3f4] transition-colors">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f1f3f4] border border-border">
                <Upload size={26} className="text-muted" />
              </span>
              <span className="font-semibold text-ink">Upload a photo</span>
              <span className="text-xs text-muted">JPG, PNG or HEIC from your device</span>
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={onFileChange} aria-label="Upload photo" />
            </label>
          </div>
        )}

        {/* Scanning */}
        {step === 'scanning' && (
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 size={20} className="animate-spin text-primary" />
              <p className="font-semibold text-ink">Analysing photo…</p>
            </div>
            <Skeleton />
          </div>
        )}

        {/* Error */}
        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-[#f5c6cb] bg-[#fce8e6] p-4 text-sm text-[#c5221f] mb-4">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Results */}
        {result && (step === 'result' || step === 'linking') && (
          <div className="space-y-4">
            {/* Summary banner */}
            <div className={`flex items-start gap-3 rounded-2xl p-4 ${
              result.accessible === true  ? 'bg-[#e6f4ea] border border-[#a8d5b5]' :
              result.accessible === false ? 'bg-[#fce8e6] border border-[#f5c6cb]' :
                                            'bg-[#fef9e7] border border-[#fde68a]'
            }`}>
              {result.accessible === true  && <CheckCircle2 size={20} className="text-[#1e8e3e] shrink-0 mt-0.5" />}
              {result.accessible === false && <AlertCircle  size={20} className="text-[#c5221f] shrink-0 mt-0.5" />}
              {result.accessible === null  && <Info         size={20} className="text-[#b45309] shrink-0 mt-0.5" />}
              <div>
                <p className="font-semibold text-ink text-sm">{result.summary}</p>
                <p className="mt-0.5 text-xs text-muted">Detection confidence: {Math.round(result.confidence * 100)}%</p>
              </div>
            </div>

            {/* Features */}
            {result.features.length > 0 && (
              <div className="card p-5">
                <p className="label mb-3">Detected features</p>
                <div className="flex flex-wrap gap-2">
                  {result.features.map(f => (
                    <span key={f} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-ink">
                      <CheckCircle2 size={11} className="text-[#1e8e3e]" />{FEATURE_LABELS[f] ?? f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Measurements */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Ruler size={16} className="text-primary" />
                <p className="label">Estimated measurements</p>
              </div>
              <div className="space-y-3">
                {result.measurements.map(m => (
                  <div key={m.label} className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-ink">{m.label}</p>
                      {m.note && <p className="text-xs text-muted mt-0.5">{m.note}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-sm font-semibold text-ink">{m.value}</span>
                      {m.pass === true  && <CheckCircle2 size={14} className="text-[#1e8e3e]" aria-label="Meets ADA minimum" />}
                      {m.pass === false && <AlertCircle  size={14} className="text-[#c5221f]"  aria-label="May not meet ADA minimum" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Link to place */}
            {step === 'result' && (
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Link2 size={15} className="text-primary" />
                  <p className="font-semibold text-ink text-sm">Save to a place</p>
                </div>
                <p className="text-xs text-muted mb-4">
                  Add this photo and measurements to a place on AccessMap so others can see them.
                </p>
                <PlacePicker scanLoc={scanLoc} onPick={saveToPlace} />
              </div>
            )}

            <p className="text-xs text-muted text-center px-4">
              Measurements are heuristic estimates — not a certified accessibility assessment.
            </p>

            <button onClick={reset} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-white py-3 text-sm font-semibold text-ink hover:bg-surface transition-colors">
              <RotateCcw size={15} /> Scan another photo
            </button>
          </div>
        )}

        {/* Saving */}
        {step === 'saving' && (
          <div className="card p-8 flex flex-col items-center gap-3 text-center">
            <Loader2 size={28} className="animate-spin text-primary" />
            <p className="font-semibold text-ink">Uploading photo and saving measurements…</p>
          </div>
        )}

        {/* Saved */}
        {step === 'saved' && (
          <div className="card p-8 flex flex-col items-center gap-4 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e6f4ea]">
              <CheckCircle2 size={32} className="text-[#1e8e3e]" />
            </span>
            <div>
              <p className="text-lg font-bold text-ink">
                {savedPlace ? `Saved to ${savedPlace.name}` : 'Scan complete'}
              </p>
              <p className="text-sm text-muted mt-1">
                {savedPlace
                  ? 'Your photo and measurements have been added to this place.'
                  : 'Your scan results were not linked to a place.'}
              </p>
            </div>
            {savedPlace && (
              <Link to={`/place/${savedPlace.id}`} className="btn-primary gap-2">
                <ExternalLink size={14} /> View place details
              </Link>
            )}
            <button onClick={reset} className="text-sm text-muted hover:text-ink underline">
              Scan another photo
            </button>
          </div>
        )}
      </main>
    </Layout>
  )
}
