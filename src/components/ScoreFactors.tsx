import type { Factor, FactorSource } from '../lib/rating'

const SOURCE: Record<FactorSource, { label: string; cls: string }> = {
  mapped: { label: 'Mapped', cls: 'bg-[#e6f4ea] text-[#137333]' },
  measured: { label: 'Measured', cls: 'bg-[#e8f0fe] text-[#1a56c4]' },
  statistics: { label: 'Statistics', cls: 'bg-[#fef7e0] text-[#8a5a00]' },
  typical: { label: 'Not known', cls: 'bg-surface text-muted' },
}

const barColor = (v: number) => (v >= 0.8 ? '#1e8e3e' : v >= 0.55 ? '#a16207' : '#c5221f')

/** "Why this score": one row per factor with how good it is and where that came from. */
export default function ScoreFactors({ factors, compact = false }: { factors: Factor[]; compact?: boolean }) {
  const total = factors.reduce((n, f) => n + f.weight, 0)
  return (
    <ul className={compact ? 'space-y-2' : 'space-y-3'} aria-label="How this score was worked out">
      {factors.map((f) => (
        <li key={f.key}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">{f.label}</span>
            <span className="text-[11px] text-muted">{Math.round((f.weight / total) * 100)}% of score</span>
            <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SOURCE[f.source].cls}`}>{SOURCE[f.source].label}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${Math.max(4, f.value * 100)}%`, background: barColor(f.value) }} />
          </div>
          {!compact || f.source !== 'typical' ? <p className="mt-1 text-xs leading-snug text-muted">{f.detail}</p> : null}
          <span className="visually-hidden">{`${f.label}: ${Math.round(f.value * 100)} out of 100, ${SOURCE[f.source].label.toLowerCase()}.`}</span>
        </li>
      ))}
    </ul>
  )
}
