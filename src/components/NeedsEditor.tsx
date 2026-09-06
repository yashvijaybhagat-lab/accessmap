import { Check } from 'lucide-react'
import type { NeedsProfile } from '../types'
import { useStore } from '../store/useStore'
import {
  MOBILITY_OPTIONS, HEARING_OPTIONS, VISION_OPTIONS, SENSORY_OPTIONS, FEATURE_OPTIONS,
} from './NeedsSetup'

/**
 * Inline, always-editable accessibility-needs form. Changes persist immediately
 * to the store (localStorage) and flow through the whole app — match scores,
 * "for me" map filter, and "before you go" briefings. Used as the main content
 * of the Profile screen.
 */
function Group<T extends string>({
  legend, hint, options, value, onChange,
}: {
  legend: string
  hint: string
  options: readonly { value: T; label: string; emoji: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <fieldset className="mt-6 first:mt-0">
      <legend className="text-sm font-semibold text-ink">{legend}</legend>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const active = value === o.value
          return (
            <label
              key={o.value}
              className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors ${
                active ? 'border-primary bg-primary/8 text-primary' : 'border-border hover:bg-surface'
              }`}
            >
              <input
                type="radio"
                name={legend}
                value={o.value}
                checked={active}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              <span className="text-lg" aria-hidden="true">{o.emoji}</span>
              <span className="flex-1 font-medium">{o.label}</span>
              {active && <Check size={15} className="shrink-0" aria-hidden="true" />}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export default function NeedsEditor() {
  const profile = useStore((s) => s.needsProfile)
  const setNeedsProfile = useStore((s) => s.setNeedsProfile)
  const patch = (p: Partial<NeedsProfile>) => setNeedsProfile({ ...profile, ...p })

  return (
    <div>
      <label className="block">
        <span className="text-sm font-semibold text-ink">What should we call you?</span>
        <input
          type="text"
          value={profile.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Your first name (optional)"
          className="input mt-2"
          aria-label="Your first name"
        />
      </label>

      <Group
        legend="Getting around"
        hint="Personalises mobility scores, terrain warnings and lift info."
        options={MOBILITY_OPTIONS}
        value={profile.mobility}
        onChange={(v) => patch({ mobility: v as NeedsProfile['mobility'] })}
      />
      <Group
        legend="Hearing"
        hint="Flags hearing loops and audio-based accessibility gaps."
        options={HEARING_OPTIONS}
        value={profile.hearing}
        onChange={(v) => patch({ hearing: v as NeedsProfile['hearing'] })}
      />
      <Group
        legend="Vision"
        hint="Flags tactile paving, Braille signage and visual wayfinding."
        options={VISION_OPTIONS}
        value={profile.vision}
        onChange={(v) => patch({ vision: v as NeedsProfile['vision'] })}
      />
      <Group
        legend="Sensory"
        hint="Warns about noisy, busy or visually overwhelming places."
        options={SENSORY_OPTIONS}
        value={profile.sensory}
        onChange={(v) => patch({ sensory: v as NeedsProfile['sensory'] })}
      />

      <fieldset className="mt-6">
        <legend className="text-sm font-semibold text-ink">Things you always need</legend>
        <p className="mt-0.5 text-xs text-muted">We'll warn you whenever a place is missing one of these.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {FEATURE_OPTIONS.map(([key, emoji, label]) => {
            const active = !!profile[key]
            return (
              <label
                key={key as string}
                className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors ${
                  active ? 'border-primary bg-primary/8' : 'border-border hover:bg-surface'
                }`}
              >
                <span className="text-lg" aria-hidden="true">{emoji}</span>
                <span className="flex-1 font-medium">{label}</span>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => patch({ [key]: e.target.checked } as Partial<NeedsProfile>)}
                  className="h-4 w-4 rounded accent-primary"
                  aria-label={label}
                />
              </label>
            )
          })}
        </div>
      </fieldset>

      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted">
        <Check size={13} className="text-emerald-500" aria-hidden="true" />
        Saved on this device automatically — no account needed.
      </p>
    </div>
  )
}
