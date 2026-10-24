import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import PhotoUpload from './PhotoUpload'
import { scoreColor } from './ScoreRing'
import { addReview, getPlaces } from '../lib/data'
import { useStore } from '../store/useStore'
import type { Place, Dimension, Scores } from '../types'

const DIMS: { key: Dimension; label: string }[] = [
  { key: 'mobility', label: 'Mobility' },
  { key: 'sensory', label: 'Sensory' },
  { key: 'hearing', label: 'Hearing' },
  { key: 'vision', label: 'Vision' },
]

export default function ReviewForm({ placeId, placeName, onDone }: { placeId?: string; placeName?: string; onDone?: () => void }) {
  const user = useStore((s) => s.user)
  const [places, setPlaces] = useState<Place[]>([])
  const [selected, setSelected] = useState(placeId ?? '')
  const [scores, setScores] = useState<Scores>({ mobility: 5, sensory: 5, hearing: 5, vision: 5 })
  const [body, setBody] = useState('')
  const [photos, setPhotos] = useState<{ url: string; verified: boolean }[]>([])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { if (!placeId) getPlaces().then(setPlaces) }, [placeId])

  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const valid = selected && body.trim().length >= 20

  async function submit() {
    // Keep the button clickable and explain what's missing instead of silently disabling it
    if (!selected) { setErr('Please choose a place to review.'); return }
    if (body.trim().length < 20) {
      setErr(`Please write at least 20 characters about your visit (${20 - body.trim().length} more to go).`)
      bodyRef.current?.focus()
      return
    }
    setBusy(true); setErr('')
    try {
      await addReview({
        placeId: selected,
        userId: user?.uid ?? 'anon',
        userName: user?.displayName ?? 'Anonymous',
        userPhoto: user?.photoURL ?? undefined,
        scores,
        body: body.trim(),
        photos: photos.map((p) => p.url),
        verified: photos.length > 0 && photos.every((p) => p.verified),
        placeName: placeName ?? places.find(p => p.id === selected)?.name,
      })
      setDone(true)
      setTimeout(() => onDone?.(), 900)
    } catch (e: any) {
      setErr(e?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) return <p role="status" aria-live="polite" className="py-6 text-center text-primary">Thanks — your review is live ✓</p>

  return (
    <div className="space-y-4">
      {!placeId && (
        <label className="block">
          <span className="label">Place</span>
          <select className="input mt-1" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Select a place…</option>
            {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      <div className="space-y-3">
        {DIMS.map(({ key, label }) => (
          <div key={key}>
            <div className="flex justify-between text-sm">
              <span>{label}</span>
              <span className="font-mono" style={{ color: scoreColor(scores[key]) }}>{scores[key]}/10</span>
            </div>
            <input
              type="range" min={0} max={10} value={scores[key]}
              onChange={(e) => setScores((s) => ({ ...s, [key]: Number(e.target.value) }))}
              aria-label={`${label} rating, ${scores[key]} out of 10`}
              aria-valuetext={`${scores[key]} out of 10`}
              className="w-full accent-[#0ABFBF]"
            />
          </div>
        ))}
      </div>

      <label className="block">
        <span className="label">Your review (min 20 chars)</span>
        <textarea
          ref={bodyRef}
          className="input mt-1 min-h-24" value={body}
          onChange={(e) => { setBody(e.target.value); if (err) setErr('') }}
          placeholder="What was the accessibility experience like?"
        />
        <span className="label">{body.trim().length} / 20</span>
      </label>

      <div>
        <span className="label">Photos</span>
        <div className="mt-1">
          <PhotoUpload onResult={({ url, verify }) => setPhotos((p) => [...p, { url, verified: verify.verified }])} />
        </div>
      </div>

      {err && <p role="alert" className="text-sm text-alert">{err}</p>}
      <button disabled={busy} onClick={submit} className={`btn-primary w-full disabled:opacity-50 ${valid ? '' : 'opacity-70'}`}>
        {busy ? <Loader2 className="animate-spin" size={16} /> : null} Submit review
      </button>
    </div>
  )
}
