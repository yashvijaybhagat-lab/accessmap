import type { Place } from '../types'
import type { NeedsProfile, CompatibilityResult } from '../types'
import type { Poi } from './overpass'

export const DEFAULT_PROFILE: NeedsProfile = {
  name: '',
  mobility: 'none',
  hearing: 'none',
  vision: 'none',
  sensory: 'none',
  needsLift: false,
  needsAccessibleToilet: false,
  needsHearingLoop: false,
  needsTactile: false,
  needsQuietSpace: false,
}

/** Generate a natural-language "Before You Go" briefing for a specific place + profile */
export function beforeYouGo(place: Place, profile: NeedsProfile): string {
  const name = profile.name ? profile.name.split(' ')[0] : null
  const greeting = name ? `${name}, ` : ''
  const result = scorePlace(place, profile)
  const lines: string[] = []

  if (profile.mobility !== 'none') {
    const mob = place.scores.mobility
    const aid = { cane: 'a walking aid', manual_wheelchair: 'a manual wheelchair', power_wheelchair: 'a power wheelchair', scooter: 'a mobility scooter' }[profile.mobility]
    if (mob >= 8) lines.push(`This venue has strong wheelchair access, which should work well with ${aid}.`)
    else if (mob >= 5) lines.push(`Wheelchair access here is moderate — some areas may be easier than others for ${aid} users.`)
    else lines.push(`Community reports suggest limited wheelchair access. If you use ${aid}, call ahead to check before visiting.`)
    if (place.terrainRating && place.terrainRating >= 4 && (profile.mobility === 'power_wheelchair' || profile.mobility === 'scooter')) {
      lines.push(`The terrain is rated rough or steep, which can be challenging for powered mobility aids.`)
    }
  }

  if (profile.hearing === 'deaf' || profile.hearing === 'hard_of_hearing') {
    const h = place.scores.hearing
    const features = (place.features ?? []).map(f => f.toLowerCase())
    const hasLoop = features.some(f => f.includes('hearing loop') || f.includes('induction loop'))
    if (hasLoop) lines.push(`A hearing loop has been confirmed at this location.`)
    else if (h >= 7) lines.push(`Good hearing accessibility is reported, though a hearing loop hasn't been confirmed — worth checking in advance.`)
    else lines.push(`Hearing accessibility isn't well documented here. If you rely on a hearing loop or visual alerts, contact the venue first.`)
  }

  if (profile.vision === 'blind' || profile.vision === 'low_vision') {
    const v = place.scores.vision
    const features = (place.features ?? []).map(f => f.toLowerCase())
    const hasTactile = features.some(f => f.includes('tactile') || f.includes('braille'))
    if (hasTactile) lines.push(`Tactile paving or Braille signage has been reported at this venue.`)
    else if (v >= 7) lines.push(`Visual wayfinding is generally rated well by the community.`)
    else lines.push(`Visual accessibility details are limited for this venue. Ask staff about wayfinding assistance on arrival.`)
  }

  if (profile.sensory !== 'none') {
    const s = place.scores.sensory
    if (s >= 8) lines.push(`This is rated as a calm, low-stimulation space — a good choice for sensory needs.`)
    else if (s <= 4) lines.push(`This venue can be noisy or busy. If you have sensory sensitivities, try off-peak hours.`)
    else lines.push(`Sensory conditions are mixed here. Quieter times of day may make a significant difference.`)
  }

  if (lines.length === 0) return ''

  const intro = result.grade === 'great'
    ? `${greeting}this place looks like a strong match for your needs.`
    : result.grade === 'good'
    ? `${greeting}this place should work reasonably well for you, with a few things to note.`
    : result.grade === 'limited'
    ? `${greeting}this place has some limitations for your specific needs.`
    : `${greeting}based on community reports, this place may not work well for your needs.`

  return [intro.charAt(0).toUpperCase() + intro.slice(1), ...lines].join(' ')
}

/** Human-readable label for a mobility option */
export function mobilityLabel(m: NeedsProfile['mobility']): string {
  return { none: 'Walking', cane: 'Walking aid', manual_wheelchair: 'Manual wheelchair', power_wheelchair: 'Power wheelchair', scooter: 'Mobility scooter' }[m]
}
export function hearingLabel(h: NeedsProfile['hearing']): string {
  return { none: 'Full hearing', hard_of_hearing: 'Hard of hearing', deaf: 'Deaf' }[h]
}
export function visionLabel(v: NeedsProfile['vision']): string {
  return { none: 'Full vision', low_vision: 'Low vision', blind: 'Blind' }[v]
}
export function sensoryLabel(s: NeedsProfile['sensory']): string {
  return { none: 'No sensory needs', sensitive: 'Sensory sensitive', severe: 'Significant sensory needs' }[s]
}

export function hasProfile(p: NeedsProfile): boolean {
  return (
    p.mobility !== 'none' ||
    p.hearing !== 'none' ||
    p.vision !== 'none' ||
    p.sensory !== 'none' ||
    p.needsLift ||
    p.needsAccessibleToilet ||
    p.needsHearingLoop ||
    p.needsTactile ||
    p.needsQuietSpace
  )
}

/** Score a Place against a user's NeedsProfile. Returns 0–100 + grade + warnings/highlights. */
export function scorePlace(place: Place, profile: NeedsProfile): CompatibilityResult {
  const warnings: string[] = []
  const highlights: string[] = []
  const features = (place.features ?? []).map((f) => f.toLowerCase())

  let total = 0
  let weight = 0

  // ── Mobility ──────────────────────────────────────────────────────
  if (profile.mobility !== 'none') {
    const mobilityScore = place.scores.mobility
    const w = profile.mobility === 'power_wheelchair' || profile.mobility === 'scooter' ? 3 : 2
    total += mobilityScore * 10 * w
    weight += 100 * w

    if (mobilityScore >= 8) highlights.push('Excellent wheelchair access')
    else if (mobilityScore <= 4) warnings.push('Poor wheelchair / mobility access reported')

    if (profile.mobility === 'power_wheelchair' || profile.mobility === 'scooter') {
      const terrain = place.terrainRating ?? 1
      if (terrain >= 4) warnings.push('Rough terrain — may be difficult for power wheelchair or scooter')
      else if (terrain <= 2) highlights.push('Smooth, flat terrain')
    }

    if (profile.needsLift) {
      const hasLift = features.some((f) => f.includes('elevator') || f.includes('lift'))
      if (hasLift) highlights.push('Elevator / lift available')
      else warnings.push('No elevator or lift confirmed — check before visiting')
    }

    if (profile.needsAccessibleToilet) {
      const hasToilet = features.some((f) => f.includes('accessible toilet') || f.includes('wheelchair toilet'))
      if (hasToilet) highlights.push('Accessible toilet confirmed')
      else warnings.push('Accessible toilet not confirmed — call ahead to verify')
    }
  }

  // ── Hearing ───────────────────────────────────────────────────────
  if (profile.hearing !== 'none') {
    const hearingScore = place.scores.hearing
    const w = profile.hearing === 'deaf' ? 3 : 2
    total += hearingScore * 10 * w
    weight += 100 * w

    if (hearingScore >= 8) highlights.push('Great hearing accessibility')
    else if (hearingScore <= 4) warnings.push('Limited hearing accessibility reported')

    if (profile.needsHearingLoop) {
      const hasLoop = features.some((f) => f.includes('hearing loop') || f.includes('induction loop') || f.includes('t-loop'))
      if (hasLoop) highlights.push('Hearing loop / induction loop available')
      else warnings.push('No hearing loop confirmed at this location')
    }
  }

  // ── Vision ────────────────────────────────────────────────────────
  if (profile.vision !== 'none') {
    const visionScore = place.scores.vision
    const w = profile.vision === 'blind' ? 3 : 2
    total += visionScore * 10 * w
    weight += 100 * w

    if (visionScore >= 8) highlights.push('Good visual accessibility and wayfinding')
    else if (visionScore <= 4) warnings.push('Limited visual accessibility reported')

    if (profile.needsTactile) {
      const hasTactile = features.some((f) => f.includes('tactile') || f.includes('braille'))
      if (hasTactile) highlights.push('Tactile paving / Braille signage present')
      else warnings.push('No tactile paving or Braille signage confirmed')
    }
  }

  // ── Sensory ───────────────────────────────────────────────────────
  if (profile.sensory !== 'none') {
    const sensoryScore = place.scores.sensory
    const w = profile.sensory === 'severe' ? 3 : 2
    total += sensoryScore * 10 * w
    weight += 100 * w

    if (sensoryScore >= 8) highlights.push('Low-stimulation, sensory-friendly environment')
    else if (sensoryScore <= 4) warnings.push('Can be loud or visually overwhelming')

    if (profile.needsQuietSpace) {
      const hasQuiet = features.some((f) => f.includes('quiet') || f.includes('low noise') || f.includes('calm'))
      if (hasQuiet) highlights.push('Quiet / low-stimulation space available')
      else if (sensoryScore <= 5) warnings.push('No quiet space confirmed — may be noisy or busy')
    }
  }

  // Fallback: if profile has no specific needs set, return neutral
  if (weight === 0) return { score: 0, grade: 'good', warnings: [], highlights: [] }

  const score = Math.round((total / weight) * 100)
  const grade: CompatibilityResult['grade'] =
    score >= 80 ? 'great' : score >= 60 ? 'good' : score >= 40 ? 'limited' : 'poor'

  return { score, grade, warnings, highlights }
}

/** Score a POI (from Overpass) against a profile. Simpler — uses what OSM gives us. */
export function scorePoi(poi: Poi, profile: NeedsProfile): CompatibilityResult {
  const warnings: string[] = []
  const highlights: string[] = []

  let total = 0
  let weight = 0

  if (profile.mobility !== 'none') {
    const base = poi.accessScore ?? 5
    total += base * 10 * 2
    weight += 100 * 2
    if (base >= 8) highlights.push('Wheelchair accessible confirmed')
    else if (base <= 4) warnings.push('Limited or no wheelchair access')

    if ((profile.mobility === 'power_wheelchair' || profile.mobility === 'scooter') && poi.terrain === 'Rough') {
      warnings.push('Rough terrain — difficult for powered mobility aids')
    }
    if (profile.needsAccessibleToilet && poi.accessibleToilet) highlights.push('Accessible toilet available')
    else if (profile.needsAccessibleToilet && !poi.accessibleToilet) warnings.push('No accessible toilet confirmed')
  }

  if (profile.vision !== 'none' && profile.needsTactile) {
    if (poi.tactile) highlights.push('Tactile paving present')
    else warnings.push('No tactile paving confirmed')
  }

  if (weight === 0) return { score: 0, grade: 'good', warnings: [], highlights: [] }

  const score = Math.round((total / weight) * 100)
  const grade: CompatibilityResult['grade'] =
    score >= 80 ? 'great' : score >= 60 ? 'good' : score >= 40 ? 'limited' : 'poor'

  return { score, grade, warnings, highlights }
}

export const GRADE_COLOR: Record<CompatibilityResult['grade'], string> = {
  great: '#16a34a',
  good: '#0ABFBF',
  limited: '#f97316',
  poor: '#dc2626',
}

export const GRADE_LABEL: Record<CompatibilityResult['grade'], string> = {
  great: 'Excellent match',
  good: 'Good match',
  limited: 'Limited match',
  poor: 'Poor match',
}
