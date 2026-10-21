import { CheckCircle2, AlertTriangle, XCircle, Info, HelpCircle, Accessibility, DoorOpen, Eye, Ear, Brain } from 'lucide-react'
import SpeakButton from './SpeakButton'
import { descriptionToSpeech, type PlaceDescription, type Tone, type DescSection } from '../lib/describe'

const TONE: Record<Tone, { icon: typeof Info; cls: string; sr: string }> = {
  good: { icon: CheckCircle2, cls: 'text-[#15803d]', sr: 'Yes:' },
  warn: { icon: AlertTriangle, cls: 'text-[#a16207]', sr: 'Caution:' },
  bad: { icon: XCircle, cls: 'text-[#b91c1c]', sr: 'Barrier:' },
  info: { icon: Info, cls: 'text-muted', sr: 'Note:' },
}

const SECTION_ICON: Record<DescSection['id'], typeof Info> = {
  mobility: Accessibility, inside: DoorOpen, vision: Eye, hearing: Ear, sensory: Brain,
}

const CONF = {
  high: { label: 'Well mapped', cls: 'bg-[#dcfce7] text-[#14532d]' },
  medium: { label: 'Partly mapped', cls: 'bg-[#fef9c3] text-[#713f12]' },
  low: { label: 'Little data', cls: 'bg-surface text-ink' },
}

/** Plain-language accessibility write-up for a place, grouped by need. */
export default function AccessDescription({ name, desc, compact = false }: { name: string; desc: PlaceDescription; compact?: boolean }) {
  const conf = CONF[desc.confidence]
  return (
    <section aria-label={`Accessibility details for ${name}`}>
      <div className="flex items-start gap-3">
        <p className={`flex-1 font-medium leading-snug text-ink ${compact ? 'text-[15px]' : 'text-base'}`}>{desc.summary}</p>
        <SpeakButton text={descriptionToSpeech(name, desc)} variant="icon" label={`Read accessibility details for ${name} aloud`} />
      </div>
      <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${conf.cls}`}>{conf.label}</span>

      {desc.note && (
        <blockquote className="mt-3 rounded-xl border-l-4 border-primary bg-primary/5 px-3 py-2 text-sm text-ink">
          <span className="font-semibold">Mapper note: </span>{desc.note}
        </blockquote>
      )}

      <div className={`mt-3 ${compact ? 'space-y-3' : 'grid gap-3 sm:grid-cols-2'}`}>
        {desc.sections.map((s) => {
          const SIcon = SECTION_ICON[s.id]
          return (
            <div key={s.id} className={compact ? '' : 'rounded-2xl border border-border bg-card p-4'}>
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
                <SIcon size={15} className="text-primary" aria-hidden="true" /> {s.title}
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                {s.lines.map((l, i) => {
                  const T = TONE[l.tone]
                  return (
                    <li key={i} className="flex items-start gap-2 text-sm leading-snug text-ink">
                      <T.icon size={16} className={`mt-0.5 shrink-0 ${T.cls}`} aria-hidden="true" />
                      <span>
                        <span className="visually-hidden">{T.sr} </span>
                        {l.text}
                        {l.typical && <span className="ml-1 text-xs text-muted">(typical for this kind of place — not confirmed)</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>

      {desc.unknowns.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-surface px-3 py-2.5 text-[13px] text-ink">
          <HelpCircle size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
          <p><span className="font-semibold">Not yet mapped:</span> {desc.unknowns.join(', ')}. Call ahead if these matter to you.</p>
        </div>
      )}
    </section>
  )
}
