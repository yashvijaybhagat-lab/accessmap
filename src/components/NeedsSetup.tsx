import { useEffect, useState } from 'react'
import { X, ChevronRight, Check, Sparkles } from 'lucide-react'
import type { NeedsProfile } from '../types'
import { useFocusTrap } from '../lib/useFocusTrap'
import {
  DEFAULT_PROFILE, hasProfile,
  mobilityLabel, hearingLabel, visionLabel, sensoryLabel,
} from '../lib/compatibility'
import { useStore } from '../store/useStore'

interface Props { onClose: () => void }

type Step = 'name' | 'mobility' | 'hearing' | 'vision' | 'sensory' | 'features' | 'done'
const STEPS: Step[] = ['name', 'mobility', 'hearing', 'vision', 'sensory', 'features', 'done']

export const MOBILITY_OPTIONS = [
  { value: 'none',              label: 'I walk unaided',             emoji: '🚶' },
  { value: 'cane',              label: 'I use a cane or crutches',   emoji: '🦯' },
  { value: 'manual_wheelchair', label: 'I use a manual wheelchair',  emoji: '♿' },
  { value: 'power_wheelchair',  label: 'I use a power wheelchair',   emoji: '⚡' },
  { value: 'scooter',           label: 'I use a mobility scooter',   emoji: '🛵' },
] as const

export const HEARING_OPTIONS = [
  { value: 'none',           label: 'I have full hearing',            emoji: '👂' },
  { value: 'hard_of_hearing',label: 'I am hard of hearing',           emoji: '🔉' },
  { value: 'deaf',           label: 'I am Deaf / use sign language',  emoji: '🤟' },
] as const

export const VISION_OPTIONS = [
  { value: 'none',       label: 'I have full vision',             emoji: '👁️' },
  { value: 'low_vision', label: 'I have low vision',              emoji: '🔍' },
  { value: 'blind',      label: 'I am blind or have no usable vision', emoji: '🦮' },
] as const

export const SENSORY_OPTIONS = [
  { value: 'none',      label: 'No sensory sensitivities',             emoji: '😊' },
  { value: 'sensitive', label: 'Some sensory sensitivities',           emoji: '🌿' },
  { value: 'severe',    label: 'Significant sensory needs (e.g. autism)', emoji: '🔇' },
] as const

export const FEATURE_OPTIONS: [keyof NeedsProfile, string, string][] = [
  ['needsLift',             '🛗', 'Elevator or lift'],
  ['needsAccessibleToilet', '🚻', 'Accessible / wheelchair toilet'],
  ['needsHearingLoop',      '📡', 'Hearing loop / induction loop'],
  ['needsTactile',          '🖐️', 'Tactile paving or Braille signage'],
  ['needsQuietSpace',       '🤫', 'Quiet or low-stimulation space'],
]

export default function NeedsSetup({ onClose }: Props) {
  const setNeedsProfile = useStore((s) => s.setNeedsProfile)
  const existing = useStore((s) => s.needsProfile)
  const [draft, setDraft] = useState<NeedsProfile>({ ...existing })
  const [stepIdx, setStepIdx] = useState(0)
  const step = STEPS[stepIdx]
  const trapRef = useFocusTrap<HTMLDivElement>(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const firstName = draft.name.trim().split(' ')[0] || ''

  function next() { setStepIdx((i) => Math.min(i + 1, STEPS.length - 1)) }
  function back() { setStepIdx((i) => Math.max(i - 1, 0)) }
  function save() { setNeedsProfile(draft); onClose() }

  const progress = stepIdx / (STEPS.length - 1)

  // Build needs tags for the summary screen
  const needsTags: { emoji: string; label: string }[] = []
  if (draft.mobility !== 'none') needsTags.push({ emoji: MOBILITY_OPTIONS.find(o => o.value === draft.mobility)!.emoji, label: mobilityLabel(draft.mobility) })
  if (draft.hearing !== 'none') needsTags.push({ emoji: HEARING_OPTIONS.find(o => o.value === draft.hearing)!.emoji, label: hearingLabel(draft.hearing) })
  if (draft.vision !== 'none') needsTags.push({ emoji: VISION_OPTIONS.find(o => o.value === draft.vision)!.emoji, label: visionLabel(draft.vision) })
  if (draft.sensory !== 'none') needsTags.push({ emoji: SENSORY_OPTIONS.find(o => o.value === draft.sensory)!.emoji, label: sensoryLabel(draft.sensory) })
  FEATURE_OPTIONS.forEach(([key, emoji, label]) => { if (draft[key]) needsTags.push({ emoji, label }) })

  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby="needs-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div ref={trapRef} className="card w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            <h2 id="needs-title" className="font-semibold">
              {step === 'name' ? 'Personalise your experience' :
               step === 'done' ? (firstName ? `All set, ${firstName}!` : 'All set!') :
               'Your accessibility needs'}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-muted hover:bg-bg hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 px-6 py-3" role="progressbar" aria-valuenow={stepIdx} aria-valuemax={STEPS.length - 1}>
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= stepIdx ? 'bg-primary' : 'bg-border'}`} />
          ))}
        </div>

        <div className="px-6 pb-2">
          {/* ── Name ── */}
          {step === 'name' && (
            <div>
              <p className="text-lg font-semibold text-ink">What should we call you?</p>
              <p className="mt-1 text-sm text-muted">We'll use this to personalise your experience throughout the app.</p>
              <input
                autoFocus
                type="text"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Your first name (optional)"
                className="input mt-4"
                onKeyDown={(e) => e.key === 'Enter' && next()}
                aria-label="Your first name"
              />
            </div>
          )}

          {/* ── Mobility ── */}
          {step === 'mobility' && (
            <StepBlock
              title={`${draft.name ? `${firstName}, how` : 'How'} do you get around?`}
              subtitle="We'll personalise mobility scores, terrain warnings, and lift availability for you."
              options={MOBILITY_OPTIONS}
              value={draft.mobility}
              onChange={(v) => setDraft((d) => ({ ...d, mobility: v as NeedsProfile['mobility'] }))}
            />
          )}

          {/* ── Hearing ── */}
          {step === 'hearing' && (
            <StepBlock
              title="How is your hearing?"
              subtitle="We'll flag hearing loops and audio-based accessibility gaps for you."
              options={HEARING_OPTIONS}
              value={draft.hearing}
              onChange={(v) => setDraft((d) => ({ ...d, hearing: v as NeedsProfile['hearing'] }))}
            />
          )}

          {/* ── Vision ── */}
          {step === 'vision' && (
            <StepBlock
              title="How is your vision?"
              subtitle="We'll flag tactile paving, Braille signage, and visual wayfinding for you."
              options={VISION_OPTIONS}
              value={draft.vision}
              onChange={(v) => setDraft((d) => ({ ...d, vision: v as NeedsProfile['vision'] }))}
            />
          )}

          {/* ── Sensory ── */}
          {step === 'sensory' && (
            <StepBlock
              title="Any sensory sensitivities?"
              subtitle="We'll warn you about noisy, busy, or visually overwhelming environments."
              options={SENSORY_OPTIONS}
              value={draft.sensory}
              onChange={(v) => setDraft((d) => ({ ...d, sensory: v as NeedsProfile['sensory'] }))}
            />
          )}

          {/* ── Features ── */}
          {step === 'features' && (
            <div>
              <p className="font-semibold text-ink">Anything you always need?</p>
              <p className="mt-1 text-sm text-muted">We'll warn you any time a place doesn't have these — so you never arrive surprised.</p>
              <div className="mt-4 space-y-2">
                {FEATURE_OPTIONS.map(([key, emoji, label]) => (
                  <label key={key as string} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                    draft[key] ? 'border-primary bg-primary/8' : 'border-border hover:bg-bg'
                  }`}>
                    <span className="text-lg" aria-hidden="true">{emoji}</span>
                    <span className="flex-1 text-sm font-medium">{label}</span>
                    <input
                      type="checkbox"
                      checked={!!draft[key]}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.checked }))}
                      className="h-4 w-4 rounded accent-primary"
                      aria-label={label}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ── Done / Summary ── */}
          {step === 'done' && (
            <div>
              <p className="text-sm text-muted">
                {needsTags.length > 0
                  ? `Here's what we'll personalise for you across every place on the map:`
                  : `You haven't set any specific needs — you'll see standard accessibility scores. You can update this any time.`}
              </p>
              {needsTags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {needsTags.map(({ emoji, label }) => (
                    <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 px-3 py-1.5 text-sm font-medium text-primary">
                      <span aria-hidden="true">{emoji}</span> {label}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-5 rounded-xl bg-bg p-4 text-sm text-muted leading-relaxed">
                <strong className="text-ink">What changes now:</strong>
                {' '}Every place card shows your personal match score. Place detail pages include a
                "Before You Go" briefing written specifically for your needs.
                Filter the map to <strong className="text-ink">only show places that work for you</strong> with one tap.
              </div>
              {hasProfile(existing) && (
                <button
                  onClick={() => { setDraft({ ...DEFAULT_PROFILE }); setStepIdx(0) }}
                  className="mt-3 text-xs text-muted underline hover:text-ink"
                >
                  Start over / clear profile
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4 mt-4">
          <button
            onClick={stepIdx === 0 ? onClose : back}
            className="btn-ghost text-sm"
          >
            {stepIdx === 0 ? 'Cancel' : '← Back'}
          </button>
          {step !== 'done' ? (
            <button onClick={next} className="btn-primary text-sm">
              {step === 'name' && !draft.name ? 'Skip' : 'Next'} <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={save} className="btn-primary text-sm">
              <Check size={16} /> Save my profile
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StepBlock<T extends string>({
  title, subtitle, options, value, onChange,
}: {
  title: string; subtitle: string
  options: readonly { value: T; label: string; emoji: string }[]
  value: T; onChange: (v: T) => void
}) {
  return (
    <fieldset>
      <legend className="font-semibold text-ink">{title}</legend>
      <p className="mt-1 text-sm text-muted">{subtitle}</p>
      <div className="mt-4 space-y-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
              value === o.value ? 'border-primary bg-primary/8 text-primary' : 'border-border hover:bg-bg'
            }`}
          >
            <input type="radio" name={title} value={o.value} checked={value === o.value}
              onChange={() => onChange(o.value)} className="sr-only" />
            <span className="text-xl" aria-hidden="true">{o.emoji}</span>
            <span className="flex-1 text-sm font-medium">{o.label}</span>
            {value === o.value && <Check size={15} className="shrink-0 text-primary" aria-hidden="true" />}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
