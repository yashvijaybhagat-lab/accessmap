import { deriveAccess, type CategoryKey } from './overpass'

/* ------------------------------------------------------------------ *
 * Plain-language accessibility descriptions built from OpenStreetMap
 * tags. Every line says what is KNOWN, compares measurements to real
 * standards (ADA 2010 / ISO 21542), and lists what is NOT known so
 * nobody is surprised at the door. Nothing here is invented: lines
 * marked `typical` come from venue-type norms and say so.
 * ------------------------------------------------------------------ */

export type Tone = 'good' | 'warn' | 'bad' | 'info'
export interface Line { text: string; tone: Tone; typical?: boolean }
export interface DescSection { id: 'mobility' | 'inside' | 'vision' | 'hearing' | 'sensory'; title: string; lines: Line[] }
export interface PlaceDescription {
  summary: string
  sections: DescSection[]
  unknowns: string[]
  note?: string
  confidence: 'high' | 'medium' | 'low'
  knownCount: number
}

const yes = (v?: string) => !!v && ['yes', 'designated', 'both', 'true', 'limited'].includes(v.toLowerCase())
const isNo = (v?: string) => !!v && ['no', 'false', 'none', '0'].includes(v.toLowerCase())
const tag = (t: Record<string, string>, ...keys: string[]) => keys.map((k) => t[k]).find((v) => v != null && v !== '')

const inches = (cm: number) => Math.round(cm / 2.54)
const fmtCm = (cm: number) => `${cm} cm (${inches(cm)} in)`

export function describePlace(tags: Record<string, string>, category?: CategoryKey): PlaceDescription {
  const t = tags
  const d = deriveAccess(t, category)
  const typical = (label: string) => d.breakdown.bonuses.some((b) => b.label.startsWith(label) && b.label.includes('typical'))
  const unknowns: string[] = []

  /* ── Getting in ─────────────────────────────────────────────── */
  const mob: Line[] = []
  const wc = d.wheelchair
  if (wc === 'yes') mob.push({ text: 'Mapped as wheelchair accessible — step-free entry to the main areas.', tone: 'good' })
  else if (wc === 'limited') mob.push({ text: 'Partly wheelchair accessible — some areas or the entrance have barriers.', tone: 'warn' })
  else if (wc === 'no') mob.push({ text: 'Mapped as not wheelchair accessible.', tone: 'bad' })
  else unknowns.push('whether the entrance is step-free')

  if (d.stepCount === 0) mob.push({ text: 'No steps at the entrance.', tone: 'good' })
  else if (d.stepCount != null) {
    const h = d.stepHeightCm ? `, each about ${fmtCm(d.stepHeightCm)} high` : ''
    mob.push({ text: `${d.stepCount} step${d.stepCount > 1 ? 's' : ''} at the entrance${h}.`, tone: d.hasRamp ? 'warn' : 'bad' })
  }

  if (d.hasRamp) {
    const bits: string[] = []
    if (d.rampGradient != null) {
      const g = d.rampGradient
      const verdict = g <= 5 ? 'gentle' : g <= 8.33 ? 'within the ADA 1:12 limit' : 'steeper than the ADA 1:12 limit — may need assistance'
      bits.push(`${g.toFixed(1)}% slope (${verdict})`)
    }
    if (d.rampWidthCm) bits.push(`${fmtCm(d.rampWidthCm)} wide${d.rampWidthCm < 91 ? ' — narrower than the 91 cm ADA minimum' : ''}`)
    if (d.rampHasHandrail === true) bits.push('handrails')
    if (d.rampHasHandrail === false) bits.push('no handrails')
    const steep = d.rampGradient != null && d.rampGradient > 8.33
    mob.push({ text: `Ramp available${bits.length ? `: ${bits.join(', ')}` : ''}.`, tone: steep ? 'warn' : 'good' })
    if (d.rampNote) mob.push({ text: `Ramp note: ${d.rampNote}`, tone: 'info' })
  }

  if (d.doorType === 'Automatic') mob.push({ text: 'Automatic door — no pushing or pulling needed.', tone: 'good' })
  else if (d.doorType === 'Revolving') mob.push({ text: 'Revolving door — ask staff for the side door if you use a mobility aid.', tone: 'warn' })
  else if (d.doorType === 'Manual') mob.push({ text: 'Manual door — may be heavy.', tone: 'info' })
  if (d.doorWidthCm) {
    const ok = d.doorWidthCm >= 81.5
    mob.push({ text: `Door clear width ${fmtCm(d.doorWidthCm)} — ${ok ? 'meets' : 'below'} the 81.5 cm (32 in) ADA minimum.`, tone: ok ? 'good' : 'bad' })
  } else if (wc !== 'no') unknowns.push('door width')

  if (d.kerbType) {
    const k = d.kerbType.toLowerCase()
    const good = k === 'flush' || k === 'lowered'
    mob.push({ text: `${k[0].toUpperCase()}${k.slice(1)} kerb nearby${good ? ' — smooth to roll over' : k === 'raised' ? ' — a raised lip to get over' : ''}.`, tone: good ? 'good' : 'warn' })
  }
  if (d.terrain === 'Rough') mob.push({ text: `Rough ground surface (${d.surface ?? 'unpaved'}) — hard going for wheels.`, tone: 'bad' })
  else if (d.terrain === 'Uneven') mob.push({ text: `Uneven surface (${(d.surface ?? 'uneven').replace(/_/g, ' ')}) — can jolt wheelchairs and trip canes.`, tone: 'warn' })
  else if (d.terrain === 'Smooth' && d.surface) mob.push({ text: `Smooth ${d.surface.replace(/_/g, ' ')} surface.`, tone: 'good' })

  if (d.hasDisabledParking) {
    mob.push({
      text: d.disabledParkingSpaces ? `${d.disabledParkingSpaces} accessible parking space${d.disabledParkingSpaces > 1 ? 's' : ''}.` : 'Accessible parking available.',
      tone: 'good', typical: typical('Disabled parking'),
    })
  }
  if (d.entranceLevel && d.entranceLevel !== '0') mob.push({ text: `Accessible entrance is on level ${d.entranceLevel}.`, tone: 'info' })

  /* ── Inside ─────────────────────────────────────────────────── */
  const inside: Line[] = []
  if (d.hasLift) {
    const dims: string[] = []
    if (d.liftWidthCm) dims.push(`door ${fmtCm(d.liftWidthCm)}`)
    if (d.liftDepthCm) dims.push(`car ${fmtCm(d.liftDepthCm)} deep${d.liftDepthCm < 137 ? ' — shorter than the 137 cm ADA car depth, tight for larger chairs' : ''}`)
    inside.push({ text: `Lift / elevator${dims.length ? `: ${dims.join(', ')}` : ''}.`, tone: 'good', typical: typical('Lift') })
  }
  const toiletTag = tag(t, 'toilets:wheelchair', 'wheelchair:toilets')
  if (d.accessibleToilet) {
    const rails = tag(t, 'toilets:grab_rail', 'grab_rail')
    inside.push({
      text: `Accessible toilet${yes(rails) ? ' with grab rails' : ''}.`,
      tone: 'good', typical: typical('Accessible toilet'),
    })
  } else if (isNo(toiletTag)) inside.push({ text: 'No accessible toilet.', tone: 'bad' })
  else unknowns.push('accessible toilet')
  if (d.changingPlace) inside.push({ text: 'Changing Places toilet — hoist and adult-sized changing bench.', tone: 'good' })
  if (d.corridorWidthCm) {
    const ok = d.corridorWidthCm >= 91
    inside.push({ text: `Narrowest passage ${fmtCm(d.corridorWidthCm)}${ok ? '' : ' — tight for most wheelchairs'}.`, tone: ok ? 'good' : 'warn' })
  }
  if (d.hasWheelchairSeating) inside.push({ text: `Wheelchair seating${d.wheelchairSeatingCount ? ` (${d.wheelchairSeatingCount} spaces)` : ''}.`, tone: 'good' })
  const levels = parseInt(tag(t, 'building:levels', 'levels') ?? '')
  if (!isNaN(levels) && levels > 1 && !d.hasLift) {
    inside.push({ text: `${levels}-storey building with no lift recorded — upper floors may need stairs.`, tone: 'warn' })
  }

  /* ── Vision ─────────────────────────────────────────────────── */
  const vision: Line[] = []
  if (d.tactile) vision.push({ text: 'Tactile paving guides the way in.', tone: 'good' })
  if (d.brailleMenu) vision.push({ text: 'Braille menu or signs available.', tone: 'good' })
  if (yes(tag(t, 'tactile_writing', 'blind:sign'))) vision.push({ text: 'Tactile (raised) lettering on signs.', tone: 'good' })
  if (yes(t.speech_output)) vision.push({ text: 'Audio / speech output available.', tone: 'good' })
  if (d.allowsAssistanceDogs) vision.push({ text: 'Assistance dogs welcome.', tone: 'good' })
  else if (isNo(tag(t, 'assistance_dog'))) vision.push({ text: 'Assistance dogs are not allowed (check local law — most require it).', tone: 'bad' })
  if (yes(t.lit)) vision.push({ text: 'Approach is lit at night.', tone: 'good' })
  if (!vision.length) unknowns.push('support for blind and low-vision visitors')

  /* ── Hearing ────────────────────────────────────────────────── */
  const hearing: Line[] = []
  if (d.hearingLoop) hearing.push({ text: 'Hearing loop installed — switch your hearing aid to T.', tone: 'good' })
  const signKey = Object.keys(t).find((k) => k.startsWith('sign_language') && yes(t[k]))
  if (signKey) hearing.push({ text: 'Staff can use sign language.', tone: 'good' })
  if (t['deaf:description']) hearing.push({ text: t['deaf:description'], tone: 'info' })
  if (!hearing.length) unknowns.push('hearing loop or sign-language support')

  /* ── Sensory / cognitive ────────────────────────────────────── */
  const sensory: Line[] = []
  if (d.quietRoom) sensory.push({ text: 'Quiet or sensory room available.', tone: 'good' })
  const sensoryHours = tag(t, 'sensory_friendly:opening_hours', 'opening_hours:sensory_friendly')
  if (sensoryHours) sensory.push({ text: `Sensory-friendly hours: ${sensoryHours}.`, tone: 'good' })
  if (yes(t.sensory_friendly)) sensory.push({ text: 'Marked as sensory-friendly.', tone: 'good' })

  const sections: DescSection[] = [
    { id: 'mobility' as const, title: 'Getting in', lines: mob },
    { id: 'inside' as const, title: 'Inside', lines: inside },
    { id: 'vision' as const, title: 'Blind & low vision', lines: vision },
    { id: 'hearing' as const, title: 'Deaf & hard of hearing', lines: hearing },
    { id: 'sensory' as const, title: 'Sensory & cognitive', lines: sensory },
  ].filter((s) => s.lines.length)

  /* ── One-line summary ───────────────────────────────────────── */
  const parts: string[] = []
  if (d.stepCount === 0 || (wc === 'yes' && d.stepCount == null)) parts.push('step-free entrance')
  else if (d.stepCount && d.hasRamp) parts.push(`${d.stepCount} step${d.stepCount > 1 ? 's' : ''} with a ramp`)
  else if (d.stepCount) parts.push(`${d.stepCount} step${d.stepCount > 1 ? 's' : ''} at the door, no ramp recorded`)
  else if (wc === 'limited') parts.push('partly accessible')
  else if (wc === 'no') parts.push('not wheelchair accessible')
  if (d.doorType === 'Automatic') parts.push('automatic door')
  if (d.hasLift && !typical('Lift')) parts.push('lift')
  if (d.accessibleToilet && !typical('Accessible toilet')) parts.push('accessible toilet')
  if (d.hearingLoop) parts.push('hearing loop')
  if (d.quietRoom) parts.push('quiet room')
  if (d.tactile || d.brailleMenu) parts.push('tactile/braille aids')

  const knownCount = sections.reduce((n, s) => n + s.lines.filter((l) => !l.typical).length, 0)
  const summary = parts.length
    ? `${parts[0][0].toUpperCase()}${parts[0].slice(1)}${parts.length > 1 ? `, ${parts.slice(1, -1).join(', ')}${parts.length > 2 ? ',' : ''} and ${parts[parts.length - 1]}` : ''}.`
    : knownCount
      ? 'Some accessibility details are mapped — see below.'
      : 'No accessibility details have been mapped for this place yet. Call ahead before visiting.'

  const confidence: PlaceDescription['confidence'] = knownCount >= 4 ? 'high' : knownCount >= 2 ? 'medium' : 'low'
  const note = tag(t, 'wheelchair:description', 'wheelchair:description:en', 'description:wheelchair')

  return { summary, sections, unknowns, note, confidence, knownCount }
}

/** Speakable plain text of a description (for the read-aloud button). */
export function descriptionToSpeech(name: string, desc: PlaceDescription): string {
  const body = desc.sections.map((s) => `${s.title}: ${s.lines.map((l) => l.text).join(' ')}`).join(' ')
  const unk = desc.unknowns.length ? ` Not yet known: ${desc.unknowns.join(', ')}.` : ''
  return `${name}. ${desc.summary} ${body}${desc.note ? ` Mapper note: ${desc.note}.` : ''}${unk}`
}
