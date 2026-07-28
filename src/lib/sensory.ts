/**
 * Sensory accessibility dimension — noise, lighting, crowd, scent.
 * Extends the existing AccessSpecs model with sensory-specific fields
 * and provides scoring helpers for autism / sensory processing needs.
 */

export interface SensoryProfile {
  noiseLevel?: 1 | 2 | 3 | 4 | 5        // 1=library-quiet, 5=concert-loud
  lightingType?: 'dim' | 'moderate' | 'bright' | 'fluorescent' | 'natural'
  crowdDensity?: 'sparse' | 'moderate' | 'busy' | 'crowded'
  scentIntensity?: 1 | 2 | 3 | 4 | 5    // 1=none, 5=heavy scent/cleaning products
  hasQuietRoom?: boolean
  hasSensoryKit?: boolean                 // noise-cancelling headphones, fidget tools
  hasLowStimulationHours?: boolean        // e.g. autism-friendly shopping hours
  lowStimHoursNote?: string
  notes?: string
}

export const NOISE_LABELS: Record<number, string> = {
  1: 'Library quiet',
  2: 'Low background noise',
  3: 'Moderate — conversations audible',
  4: 'Loud — music / machinery',
  5: 'Very loud',
}

export const CROWD_LABELS: Record<string, string> = {
  sparse:   'Rarely crowded',
  moderate: 'Moderately busy',
  busy:     'Often busy',
  crowded:  'Frequently crowded',
}

export const LIGHTING_LABELS: Record<string, string> = {
  dim:         'Dim / low light',
  moderate:    'Moderate lighting',
  bright:      'Bright',
  fluorescent: 'Fluorescent (may flicker)',
  natural:     'Mostly natural light',
}

/** Derive a 0–10 sensory score from a SensoryProfile (higher = more sensory-friendly). */
export function sensoryScore(p: SensoryProfile): number {
  let score = 10

  // Noise
  if (p.noiseLevel) score -= (p.noiseLevel - 1) * 1.5

  // Lighting
  if (p.lightingType === 'fluorescent') score -= 2
  else if (p.lightingType === 'bright') score -= 1

  // Crowd
  if (p.crowdDensity === 'crowded') score -= 2
  else if (p.crowdDensity === 'busy') score -= 1

  // Scent
  if (p.scentIntensity) score -= (p.scentIntensity - 1) * 0.8

  // Positive signals
  if (p.hasQuietRoom) score += 1
  if (p.hasSensoryKit) score += 0.5
  if (p.hasLowStimulationHours) score += 1

  return Math.max(0, Math.min(10, Math.round(score * 10) / 10))
}

/** Mock sensory profiles for demo places */
export const MOCK_SENSORY: Record<string, SensoryProfile> = {
  'grand-central-nyc': {
    noiseLevel: 4,
    lightingType: 'bright',
    crowdDensity: 'crowded',
    scentIntensity: 2,
    hasQuietRoom: false,
    hasSensoryKit: false,
    hasLowStimulationHours: false,
    notes: 'Main concourse is very loud and overwhelming during peak hours. Smaller side corridors are quieter.',
  },
  'union-station-chi': {
    noiseLevel: 3,
    lightingType: 'natural',
    crowdDensity: 'moderate',
    scentIntensity: 2,
    hasQuietRoom: false,
    hasSensoryKit: false,
    hasLowStimulationHours: false,
  },
  'central-park-vc-nyc': {
    noiseLevel: 2,
    lightingType: 'natural',
    crowdDensity: 'moderate',
    scentIntensity: 1,
    hasQuietRoom: true,
    hasSensoryKit: false,
    hasLowStimulationHours: false,
    notes: 'Quiet room available off the main hall. Outdoor areas are generally low-stimulation.',
  },
}
