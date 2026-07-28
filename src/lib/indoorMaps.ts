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
  'navy-pier-chi': {
    placeId: 'navy-pier-chi',
    contributedBy: 'AccessMap Community',
    contributedAt: Date.now() - 21 * 86400_000,
    floors: [0, 1, 2],
    overallIndoorScore: 8.1,
    notes: 'All main attractions are step-free. Accessible restrooms on every floor.',
    features: [
      { id: 'f1', type: 'entrance', floor: 0, label: 'Main entrance — fully step-free', accessible: true, x: 50, y: 10 },
      { id: 'f2', type: 'elevator', floor: 0, label: 'Elevator bank — all floors', accessible: true, x: 80, y: 50 },
      { id: 'f3', type: 'restroom', floor: 0, label: 'Accessible restroom — west wing', accessible: true, x: 20, y: 70 },
      { id: 'f4', type: 'restroom', floor: 1, label: 'Accessible restroom — food hall', accessible: true, x: 60, y: 60 },
      { id: 'f5', type: 'service_counter', floor: 1, label: 'Guest services — lowered counter', accessible: true, x: 50, y: 30 },
      { id: 'f6', type: 'seating', floor: 2, label: 'Accessible theatre seating', accessible: true, x: 40, y: 50 },
    ],
  },
  'millennium-park-chi': {
    placeId: 'millennium-park-chi',
    contributedBy: 'AccessMap Community',
    contributedAt: Date.now() - 10 * 86400_000,
    floors: [0, -1],
    overallIndoorScore: 7.5,
    notes: 'Primarily outdoor but Harris Theater and underground parking have accessible facilities.',
    features: [
      { id: 'f1', type: 'entrance', floor: 0, label: 'Michigan Ave step-free entrance', accessible: true, x: 15, y: 50 },
      { id: 'f2', type: 'restroom', floor: -1, label: 'Accessible restroom — underground', accessible: true, x: 50, y: 60 },
      { id: 'f3', type: 'elevator', floor: 0, label: 'Elevator to underground parking', accessible: true, x: 70, y: 40 },
      { id: 'f4', type: 'parking', floor: -1, label: 'Accessible parking — 20 spaces', accessible: true, x: 30, y: 70 },
      { id: 'f5', type: 'quiet_room', floor: 0, label: 'Quiet rest area near Lurie Garden', accessible: true, x: 85, y: 30 },
    ],
  },
  'pike-place-market-sea': {
    placeId: 'pike-place-market-sea',
    contributedBy: 'AccessMap Community',
    contributedAt: Date.now() - 30 * 86400_000,
    floors: [0, 1, 2, 3],
    overallIndoorScore: 5.2,
    notes: 'Historic building with mixed accessibility. Elevator access exists but is not always obvious. Cobblestone main floor is difficult for manual wheelchairs.',
    features: [
      { id: 'f1', type: 'entrance', floor: 0, label: 'Western Ave accessible entrance (avoid Pike Place main)', accessible: true, x: 10, y: 50 },
      { id: 'f2', type: 'elevator', floor: 0, label: 'Elevator to lower floors — Pike St hillclimb', accessible: true, x: 70, y: 30 },
      { id: 'f3', type: 'restroom', floor: 1, label: 'Accessible restroom — info booth level', accessible: true, x: 50, y: 60 },
      { id: 'f4', type: 'service_counter', floor: 0, label: 'Market info desk — standard height counter', accessible: false, x: 40, y: 40, notes: 'Counter not lowered — ask staff for assistance' },
    ],
  },
}

export function getIndoorMap(placeId: string): IndoorMap | null {
  return MOCK_INDOOR_MAPS[placeId] ?? null
}
