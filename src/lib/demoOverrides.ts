/* ------------------------------------------------------------------ *
 * Demo overrides — accessibility tags merged on top of live OSM data
 * for specific places, so the demo shows them with their verified
 * on-site details. Matched by name; applied before scoring so the
 * score, label, match % and plain-language description all agree.
 * ------------------------------------------------------------------ */

import type { Place } from '../types'

const OVERRIDES: {
  match: RegExp
  tags: Record<string, string>
  scores: Place['scores']
  features: string[]
}[] = [
  {
    match: /cedar park regional/i,
    scores: { mobility: 10, sensory: 9, hearing: 9, vision: 9 },
    features: ['Elevator', 'Accessible toilet', 'Hearing loop', 'Tactile paving', 'Automatic doors'],
    tags: {
      wheelchair: 'yes',
      'toilets:wheelchair': 'yes',
      tactile_paving: 'yes',
      elevator: 'yes',
      automatic_door: 'yes',
      'parking:disabled': 'yes',
      hearing_loop: 'yes',
      changing_place: 'yes',
    },
  },
]

/** Returns `tags` with any demo override for this place merged on top. */
export function withDemoOverrides(tags: Record<string, string>): Record<string, string> {
  const name = tags.name
  if (!name) return tags
  const o = OVERRIDES.find((x) => x.match.test(name))
  return o ? { ...tags, ...o.tags } : tags
}

/** Returns `place` with any demo override's scores and features applied (used for the personal match). */
export function withDemoPlace(place: Place): Place {
  const o = OVERRIDES.find((x) => x.match.test(place.name))
  if (!o) return place
  return { ...place, scores: o.scores, features: Array.from(new Set([...(place.features ?? []), ...o.features])) }
}
