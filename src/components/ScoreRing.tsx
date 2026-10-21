import { useEffect, useRef, useState } from 'react'

interface Props {
  score: number // 0-10
  label: string
  size?: number
}

/**
 * Score → colour. Shades are dark enough for white text on top (≥4.5:1).
 * With the colour-blind-safe setting on, uses the Okabe-Ito blue / orange /
 * reddish-purple set, which stays distinguishable for all common CVD types.
 */
export function scoreColor(score: number): string {
  const safe = typeof document !== 'undefined' && document.documentElement.classList.contains('a11y-cvd')
  if (score >= 8) return safe ? '#0060a0' : '#15803d'
  if (score >= 5) return safe ? '#b35c00' : '#a16207'
  return safe ? '#a3307a' : '#c2410c'
}

/** Word label for a score so colour is never the only signal (WCAG 1.4.1). */
export function scoreWord(score: number): string {
  if (score >= 8) return 'Good access'
  if (score >= 5) return 'Some barriers'
  return 'Major barriers'
}

/** Animated SVG progress ring (0 → score on mount, re-animates on score change). */
export default function ScoreRing({ score, label, size = 96 }: Props) {
  const [shown, setShown] = useState(0)
  const rafRef = useRef<number | null>(null)
  const radius = (size - 12) / 2
  const circ = 2 * Math.PI * radius
  const pct = Math.max(0, Math.min(10, shown)) / 10
  const color = scoreColor(score)

  useEffect(() => {
    // Reset to 0 first so transition always plays from empty
    setShown(0)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => setShown(score))
    })
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [score])

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e3e6ea" strokeWidth={8} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={8}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)}
            style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.34, 1.2, 0.64, 1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-bold text-2xl" style={{ color }}>
            {score.toFixed(score % 1 ? 1 : 0)}
          </span>
        </div>
      </div>
      <span className="label">{label}</span>
    </div>
  )
}
