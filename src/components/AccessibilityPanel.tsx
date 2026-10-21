import { useEffect, useState, type ReactNode } from 'react'
import {
  Accessibility, X, Type, Contrast, BookOpen, Eye, Pause, Volume2, MousePointer2,
  Hand, Link2, Palette, Map as MapIcon, Rows3, Vibrate, Check, RotateCcw, Space,
} from 'lucide-react'
import { useFocusTrap } from '../lib/useFocusTrap'
import { speechSupported, setSpeakOnFocus, isSpeakOnFocus, speak } from '../lib/speech'
import { useA11y, PRESETS, presetActive, type A11ySettings, type TextScale, type Preset } from '../lib/a11y'

type BoolKey = { [K in keyof A11ySettings]: A11ySettings[K] extends boolean ? K : never }[keyof A11ySettings]

const GROUPS: { title: string; items: { key: BoolKey; label: string; desc: string; icon: typeof Type }[] }[] = [
  {
    title: 'Seeing',
    items: [
      { key: 'contrast', label: 'High contrast', desc: 'Black text, dark borders, stronger colours', icon: Contrast },
      { key: 'colorSafe', label: 'Colour-blind safe', desc: 'Blue / orange scores, never colour alone', icon: Palette },
      { key: 'bigCursor', label: 'Large cursor', desc: 'A bigger, high-contrast mouse pointer', icon: MousePointer2 },
      { key: 'underlineLinks', label: 'Underline links', desc: 'Links stand out without relying on colour', icon: Link2 },
      { key: 'grey', label: 'Greyscale', desc: 'Remove colour to reduce visual noise', icon: Eye },
    ],
  },
  {
    title: 'Reading & focus',
    items: [
      { key: 'readable', label: 'Readable font', desc: 'Atkinson Hyperlegible, designed for low vision', icon: BookOpen },
      { key: 'spacing', label: 'Extra text spacing', desc: 'Wider letter, word and line spacing (dyslexia)', icon: Space },
      { key: 'readingGuide', label: 'Reading guide', desc: 'A highlight bar that follows your pointer', icon: Rows3 },
    ],
  },
  {
    title: 'Movement & touch',
    items: [
      { key: 'largeTargets', label: 'Large tap targets', desc: 'Every button at least 48 × 48 px', icon: Hand },
      { key: 'reduceMotion', label: 'Reduce motion', desc: 'No animations, map jumps instead of flying', icon: Pause },
      { key: 'flatMap', label: 'Flat 2D map', desc: 'Top-down map — no tilt or 3D buildings', icon: MapIcon },
    ],
  },
  {
    title: 'Hearing',
    items: [
      { key: 'vibrate', label: 'Vibrate on alerts', desc: 'Phone vibrates for route warnings and live alerts', icon: Vibrate },
    ],
  },
]

const SCALES: TextScale[] = [100, 125, 150, 175]

function Switch({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-border'}`}>
      <span className={`absolute top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`}>
        {on && <Check size={12} className="text-primary" strokeWidth={3} />}
      </span>
    </span>
  )
}

function Row({ on, onClick, icon: Icon, label, desc }: { on: boolean; onClick: () => void; icon: typeof Type; label: string; desc: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors ${
        on ? 'border-primary/60 bg-primary/5' : 'border-border bg-card hover:bg-surface'
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-primary text-white' : 'bg-surface text-muted'}`}>
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{label}</span>
        <span className="block text-xs text-muted">{desc}</span>
      </span>
      <Switch on={on} />
    </button>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

/** Horizontal reading ruler that follows the pointer / keyboard focus. */
function ReadingGuide() {
  const [y, setY] = useState<number | null>(null)
  useEffect(() => {
    const move = (e: PointerEvent) => setY(e.clientY)
    const focus = (e: FocusEvent) => {
      const r = (e.target as HTMLElement)?.getBoundingClientRect?.()
      if (r) setY(r.top + r.height / 2)
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('focusin', focus)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('focusin', focus) }
  }, [])
  if (y == null) return null
  return <div className="reading-guide" style={{ top: `calc(${y}px - 1.3em)` }} aria-hidden="true" />
}

export default function AccessibilityPanel() {
  const [open, setOpen] = useState(false)
  const a11y = useA11y()
  const [speakFocus, setSpeakFocusState] = useState(isSpeakOnFocus)
  const trapRef = useFocusTrap<HTMLDivElement>(open)
  const [announce, setAnnounce] = useState('')

  function toggleSpeakFocus(next = !speakFocus) {
    setSpeakFocusState(next)
    setSpeakOnFocus(next)
    if (next) speak('Read aloud is on. Move through the page and items will be read to you.')
  }

  function applyPreset(p: Preset) {
    const active = presetActive(p, a11y) && (!p.speakFocus || speakFocus)
    if (active) {
      // Turning a preset off resets just the settings it switched on.
      const off: Partial<A11ySettings> = {}
      for (const k of Object.keys(p.settings) as (keyof A11ySettings)[]) (off as any)[k] = k === 'textScale' ? 100 : false
      a11y.merge(off)
      if (p.speakFocus) toggleSpeakFocus(false)
      setAnnounce(`${p.label} settings turned off`)
    } else {
      a11y.merge(p.settings)
      if (p.speakFocus) toggleSpeakFocus(true)
      setAnnounce(`${p.label} settings turned on`)
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Opened from the menu drawer, or anywhere with Alt+A.
  useEffect(() => {
    const openPanel = () => setOpen(true)
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'a' || e.key === 'A' || e.code === 'KeyA')) { e.preventDefault(); setOpen((o) => !o) }
    }
    window.addEventListener('am:open-a11y', openPanel)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('am:open-a11y', openPanel); window.removeEventListener('keydown', onKey) }
  }, [])

  const anyOn = a11y.textScale !== 100 || GROUPS.some((g) => g.items.some((i) => a11y[i.key])) || speakFocus

  return (
    <>
      {a11y.readingGuide && <ReadingGuide />}
      <p className="visually-hidden" role="status" aria-live="polite">{announce}</p>


      {open && (
        <div className="fixed inset-0 z-[1100] flex justify-end bg-black/40" onClick={() => setOpen(false)}>
          <div
            ref={trapRef}
            className="flex h-full w-full max-w-md animate-[pageIn_240ms_ease-out] flex-col bg-bg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="a11y-title"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div className="flex items-center justify-between border-b border-border bg-card px-5 py-4">
              <div>
                <h2 id="a11y-title" className="flex items-center gap-2 text-xl font-bold text-ink">
                  <Accessibility size={22} className="text-primary" aria-hidden="true" /> Accessibility
                </h2>
                <p className="mt-0.5 text-xs text-muted">Saved on this device · open anytime with Alt + A</p>
              </div>
              <button onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink" aria-label="Close accessibility settings">
                <X size={20} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-28 pt-2">
              <Section title="Quick setup — choose what fits you">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PRESETS.map((p) => {
                    const on = presetActive(p, a11y) && (!p.speakFocus || speakFocus)
                    return (
                      <button
                        key={p.id}
                        onClick={() => applyPreset(p)}
                        aria-pressed={on}
                        className={`rounded-2xl border px-3.5 py-3 text-left transition-colors ${
                          on ? 'border-primary bg-primary text-white' : 'border-border bg-card hover:border-primary/50'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2 text-sm font-bold">
                          {p.label}
                          {on && <Check size={16} aria-hidden="true" />}
                        </span>
                        <span className={`mt-0.5 block text-xs ${on ? 'text-white/85' : 'text-muted'}`}>{p.desc}</span>
                      </button>
                    )
                  })}
                </div>
              </Section>

              <Section title="Text size">
                <div role="radiogroup" aria-label="Text size" className="grid grid-cols-4 gap-1.5 rounded-2xl border border-border bg-card p-1.5">
                  {SCALES.map((sc) => {
                    const on = a11y.textScale === sc
                    return (
                      <button
                        key={sc}
                        role="radio"
                        aria-checked={on}
                        onClick={() => a11y.set('textScale', sc)}
                        className={`flex flex-col items-center rounded-xl py-2 font-semibold transition-colors ${on ? 'bg-primary text-white' : 'text-ink hover:bg-surface'}`}
                      >
                        <span aria-hidden="true" style={{ fontSize: `${0.8 + (sc - 100) / 160}rem` }}>Aa</span>
                        <span className="text-[11px]">{sc}%</span>
                      </button>
                    )
                  })}
                </div>
              </Section>

              {GROUPS.map((g) => (
                <Section key={g.title} title={g.title}>
                  {g.items.map((it) => (
                    <Row key={it.key} on={a11y[it.key]} onClick={() => a11y.set(it.key, !a11y[it.key])} icon={it.icon} label={it.label} desc={it.desc} />
                  ))}
                  {g.title === 'Hearing' && (
                    <p className="px-1 text-xs text-muted">
                      AccessMap never relies on sound alone — every spoken direction and alert is also shown as text.
                    </p>
                  )}
                </Section>
              ))}

              {speechSupported && (
                <Section title="Listening">
                  <Row
                    on={speakFocus}
                    onClick={() => toggleSpeakFocus()}
                    icon={Volume2}
                    label="Read aloud on focus"
                    desc="Speaks buttons, links and headings as you move through the page"
                  />
                </Section>
              )}

              <Section title="Keyboard">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-2xl border border-border bg-card p-4 text-sm">
                  <dt><kbd className="rounded border border-border bg-surface px-1.5 font-mono text-xs">Alt A</kbd></dt><dd className="text-muted">Open these settings</dd>
                  <dt><kbd className="rounded border border-border bg-surface px-1.5 font-mono text-xs">/</kbd></dt><dd className="text-muted">Search places</dd>
                  <dt><kbd className="rounded border border-border bg-surface px-1.5 font-mono text-xs">L</kbd></dt><dd className="text-muted">List view of places on the map</dd>
                  <dt><kbd className="rounded border border-border bg-surface px-1.5 font-mono text-xs">← ↑ → ↓</kbd></dt><dd className="text-muted">Pan the map (when focused) · <kbd className="font-mono">+ −</kbd> zoom</dd>
                </dl>
              </Section>

              {anyOn && (
                <button
                  onClick={() => { a11y.reset(); if (speakFocus) toggleSpeakFocus(false); setAnnounce('All accessibility settings reset') }}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-ink hover:bg-surface"
                >
                  <RotateCcw size={15} aria-hidden="true" /> Reset everything
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
