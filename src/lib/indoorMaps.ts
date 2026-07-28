/**
 * Indoor accessibility mapping data layer.
 * Crowdsourced floor-level features: accessible restrooms, elevators,
 * quiet rooms, counter heights, sensory considerations per floor.
 */

export interface IndoorFeature {
  id: string
  type: IndoorFeatureType
  floor: number            // 0 = ground/lobby, negative = basement
  label: string
  accessible: boolean
  notes?: string
  x: number                // 0–100 relative position on floor grid
  y: number
}

export type IndoorFeatureType =
  | 'restroom'
  | 'elevator'
  | 'entrance'
  | 'quiet_room'
  | 'service_counter'
  | 'seating'
  | 'parking'
  | 'info_desk'

export interface IndoorMap {
  placeId: string
  contributedBy: string
  contributedAt: number
  floors: number[]                  // list of floor numbers present
  features: IndoorFeature[]
  overallIndoorScore: number        // 0–10
  notes?: string
}

const FEATURE_ICONS: Record<IndoorFeatureType, string> = {
  restroom:        '🚻',
  elevator:        '🛗',
  entrance:        '🚪',
  quiet_room:      '🔕',
  service_counter: '🪧',
  seating:         '💺',
  parking:         '🅿️',
  info_desk:       'ℹ️',
}

export function getFeatureIcon(type: IndoorFeatureType): string {
  return FEATURE_ICONS[type]
}

export const FEATURE_LABELS: Record<IndoorFeatureType, string> = {
  restroom:        'Accessible Restroom',
  elevator:        'Elevator',
  entrance:        'Accessible Entrance',
  quiet_room:      'Quiet Room',
  service_counter: 'Accessible Counter',
  seating:         'Accessible Seating',
  parking:         'Accessible Parking',
  info_desk:       'Information Desk',
}

// ── Mock indoor maps for demo ─────────────────────────────────────────────

export const MOCK_INDOOR_MAPS: Record<string, IndoorMap> = {
  'grand-central-nyc': {
    placeId: 'grand-central-nyc',
    contributedBy: 'AccessMap Community',
    contributedAt: Date.now() - 7 * 86400_000,
    floors: [-1, 0, 1],
    overallIndoorScore: 6.5,
    notes: 'Elevators are located near the Vanderbilt Ave entrance and near the Oyster Bar. Main concourse can be overwhelming during peak hours.',
    features: [
      { id: 'f1', type: 'elevator', floor: 0, label: 'Elevator to all levels', accessible: true, x: 30, y: 50 },
      { id: 'f2', type: 'restroom', floor: 0, label: 'Accessible restroom — lower level', accessible: true, x: 60, y: 70 },
      { id: 'f3', type: 'entrance', floor: 0, label: 'Vanderbilt Ave accessible entrance', accessible: true, x: 20, y: 20 },
      { id: 'f4', type: 'service_counter', floor: 0, label: 'MTA Help Point — lowered counter', accessible: true, x: 50, y: 40 },
      { id: 'f5', type: 'restroom', floor: -1, label: 'Accessible restroom — dining concourse', accessible: true, x: 40, y: 60 },
    ],
  },
  'union-station-chi': {
    placeId: 'union-station-chi',
    contributedBy: 'AccessMap Community',
    contributedAt: Date.now() - 14 * 86400_000,
    floors: [0, 1],
    overallIndoorScore: 7.2,
    features: [
      { id: 'f1', type: 'elevator', floor: 0, label: 'Elevator to Great Hall', accessible: true, x: 25, y: 50 },
      { id: 'f2', type: 'restroom', floor: 0, label: 'Accessible restroom — main concourse', accessible: true, x: 70, y: 60 },
      { id: 'f3', type: 'entrance', floor: 0, label: 'Canal St step-free entrance', accessible: true, x: 10, y: 50 },
      { id: 'f4', type: 'seating', floor: 1, label: 'Accessible seating — Great Hall', accessible: true, x: 50, y: 30 },
    ],
  },
}

export function getIndoorMap(placeId: string): IndoorMap | null {
  return MOCK_INDOOR_MAPS[placeId] ?? null
}
