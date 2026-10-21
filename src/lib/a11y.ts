import { create } from 'zustand'

/* ------------------------------------------------------------------ *
 * "Adjust my experience" settings — one source of truth for every
 * accessibility preference. Each setting maps to a class on <html>
 * (styled in index.css) and/or is read directly by JS (map, routing,
 * colours). Saved per device; respects OS preferences on first run.
 * ------------------------------------------------------------------ */

export type TextScale = 100 | 125 | 150 | 175

export interface A11ySettings {
  textScale: TextScale
  contrast: boolean        // high-contrast colours + stronger borders
  readable: boolean        // Atkinson Hyperlegible font
  spacing: boolean         // WCAG 1.4.12 text spacing (dyslexia)
  underlineLinks: boolean
  bigCursor: boolean
  largeTargets: boolean    // 48px+ touch targets (motor / tremor)
  reduceMotion: boolean
  grey: boolean
  colorSafe: boolean       // colour-blind-safe score palette + shape cues
  flatMap: boolean         // 2D top-down map instead of tilted 3D
  readingGuide: boolean    // horizontal reading ruler that follows the pointer
  vibrate: boolean         // vibrate on alerts / route warnings (deaf, deafblind)
}

export const A11Y_DEFAULTS: A11ySettings = {
  textScale: 100,
  contrast: false,
  readable: false,
  spacing: false,
  underlineLinks: false,
  bigCursor: false,
  largeTargets: false,
  reduceMotion: false,
  grey: false,
  colorSafe: false,
  flatMap: false,
  readingGuide: false,
  vibrate: false,
}

const KEY = 'am.a11y.v2'
const LEGACY_KEY = 'am.a11y.v1'

function osDefaults(): Partial<A11ySettings> {
  if (typeof window === 'undefined' || !window.matchMedia) return {}
  return {
    contrast: window.matchMedia('(prefers-contrast: more)').matches,
    reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }
}

function load(): A11ySettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...A11Y_DEFAULTS, ...JSON.parse(raw) }
    // Migrate the old v1 toggles (large/contrast/readable/reduceMotion/grey).
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const v1 = JSON.parse(legacy) as Record<string, boolean>
      return {
        ...A11Y_DEFAULTS,
        textScale: v1.large ? 125 : 100,
        contrast: !!v1.contrast,
        readable: !!v1.readable,
        reduceMotion: !!v1.reduceMotion,
        grey: !!v1.grey,
      }
    }
  } catch { /* storage blocked or corrupt — fall through */ }
  return { ...A11Y_DEFAULTS, ...osDefaults() }
}

const CLASS_FOR: Partial<Record<keyof A11ySettings, string>> = {
  contrast: 'a11y-contrast',
  readable: 'a11y-readable',
  spacing: 'a11y-spacing',
  underlineLinks: 'a11y-underline',
  bigCursor: 'a11y-cursor',
  largeTargets: 'a11y-targets',
  reduceMotion: 'a11y-reduce-motion',
  grey: 'a11y-grey',
  colorSafe: 'a11y-cvd',
}

let fontRequested = false
function ensureReadableFont() {
  if (fontRequested) return
  fontRequested = true
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap'
  document.head.appendChild(link)
}

export function applyA11y(s: A11ySettings) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  for (const [k, cls] of Object.entries(CLASS_FOR)) {
    root.classList.toggle(cls!, Boolean(s[k as keyof A11ySettings]))
  }
  root.style.fontSize = s.textScale === 100 ? '' : `${s.textScale}%`
  root.dataset.textScale = String(s.textScale)
  if (s.readable) ensureReadableFont()
}

interface A11yStore extends A11ySettings {
  set: <K extends keyof A11ySettings>(k: K, v: A11ySettings[K]) => void
  merge: (p: Partial<A11ySettings>) => void
  reset: () => void
}

function persist(s: A11ySettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

function pick(s: A11yStore): A11ySettings {
  const out = {} as A11ySettings
  for (const k of Object.keys(A11Y_DEFAULTS) as (keyof A11ySettings)[]) (out as any)[k] = s[k]
  return out
}

export const useA11y = create<A11yStore>((set, get) => {
  const initial = load()
  applyA11y(initial)
  const commit = (p: Partial<A11ySettings>) => {
    set(p as Partial<A11yStore>)
    const next = pick(get())
    applyA11y(next)
    persist(next)
  }
  return {
    ...initial,
    set: (k, v) => commit({ [k]: v } as Partial<A11ySettings>),
    merge: (p) => commit(p),
    reset: () => commit({ ...A11Y_DEFAULTS }),
  }
})

export function getA11y(): A11ySettings {
  return pick(useA11y.getState())
}

/** True when JS-driven motion (map fly-to, tilt) should be skipped. */
export function motionReduced(): boolean {
  if (typeof window === 'undefined') return false
  const root = document.documentElement.classList
  return useA11y.getState().reduceMotion
    || root.contains('a11y-mode')
    || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/* ------------------------------------------------------------------ *
 * Presets — one tap configures the app for a disability type. They
 * only ever turn settings ON, so combining presets is additive.
 * ------------------------------------------------------------------ */
export interface Preset {
  id: string
  label: string
  desc: string
  settings: Partial<A11ySettings>
  speakFocus?: boolean
}

export const PRESETS: Preset[] = [
  { id: 'lowvision', label: 'Low vision', desc: 'Bigger text, high contrast, large cursor, flat map',
    settings: { textScale: 150, contrast: true, bigCursor: true, largeTargets: true, underlineLinks: true, flatMap: true } },
  { id: 'blind', label: 'Blind / screen reader', desc: 'Read-aloud, list views, no motion, 2D map',
    settings: { reduceMotion: true, flatMap: true, underlineLinks: true }, speakFocus: true },
  { id: 'colour', label: 'Colour blind', desc: 'Blue / orange palette with text + shape cues',
    settings: { colorSafe: true, underlineLinks: true } },
  { id: 'deaf', label: 'Deaf / hard of hearing', desc: 'Everything visual; vibration for alerts',
    settings: { vibrate: true } },
  { id: 'motor', label: 'Wheelchair / limited dexterity', desc: 'Large tap targets, no precision gestures',
    settings: { largeTargets: true, textScale: 125, reduceMotion: true } },
  { id: 'cognitive', label: 'Dyslexia / cognitive', desc: 'Readable font, extra spacing, reading guide',
    settings: { readable: true, spacing: true, readingGuide: true, reduceMotion: true, underlineLinks: true } },
  { id: 'vestibular', label: 'Vestibular / seizure / migraine', desc: 'No animation, no tilting map',
    settings: { reduceMotion: true, flatMap: true } },
  { id: 'sensory', label: 'Autism / sensory', desc: 'Calm, muted colours and no motion',
    settings: { reduceMotion: true, grey: true, flatMap: true } },
]

export function presetActive(p: Preset, s: A11ySettings): boolean {
  return Object.entries(p.settings).every(([k, v]) => {
    const cur = s[k as keyof A11ySettings]
    return k === 'textScale' ? (cur as number) >= (v as number) : cur === v
  })
}

/** Vibrate (if enabled + supported) — a non-audio cue for alerts. */
export function hapticAlert(pattern: number | number[] = [180, 80, 180]) {
  if (!useA11y.getState().vibrate) return
  try { navigator.vibrate?.(pattern) } catch { /* unsupported */ }
}
