export interface Scores {
  mobility: number // 0-10
  sensory: number
  hearing: number
  vision: number
}

export type Dimension = keyof Scores

export interface Place {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  scores: Scores
  reviewCount: number
  lastUpdated: number // epoch ms
  osmId?: string
  city?: string
  category?: string
  sponsored?: boolean   // featured / advertised listing
  selfListed?: boolean  // added by the business owner
  features?: string[]   // self-reported accessibility features
  contact?: string
  terrainRating?: number  // 1-5: 1=flat/paved, 5=very rough/steep
  trailDifficulty?: 'easy' | 'moderate' | 'hard' | 'expert'
}

/** Crowdsourced physical accessibility specs for a place */
export interface AccessSpecs {
  id: string
  placeId: string
  userId: string               // uid for ownership checks
  contributedBy: string        // display name
  contributedAt: number
  // entrances
  hasStepFreeEntrance?: boolean
  entranceStepCount?: number   // 0 = step-free
  stepHeightCm?: number        // per step
  kerbType?: string            // flush | lowered | raised
  entranceLevel?: string       // floor number
  // ramp
  rampPresent?: boolean
  rampGradient?: 'gentle' | 'moderate' | 'steep'
  rampGradientPct?: number     // actual % value from OSM
  rampWidthCm?: number         // cm clear width
  rampHasHandrails?: boolean
  // door
  doorWidthCm?: number         // cm
  doorType?: 'manual' | 'automatic' | 'heavy_manual' | 'revolving'
  // interior
  hasLift?: boolean
  liftDoorWidthCm?: number
  liftDepthCm?: number         // cabin depth
  corridorWidthCm?: number     // narrowest point
  hasAccessibleToilet?: boolean
  toiletGrabRails?: boolean
  turningSpaceCm?: number      // turning circle in toilet
  // surfaces
  floorSurface?: 'smooth' | 'carpet' | 'uneven' | 'cobblestone' | 'gravel'
  hasTactilePaving?: boolean
  // parking
  hasDisabledParking?: boolean
  disabledParkingSpaces?: number
  parkingDistanceM?: number
  // notes
  notes?: string
  photos?: string[]            // URLs of supporting photos
}

export interface Review {
  id: string
  placeId: string
  userId: string
  userName: string
  userPhoto?: string
  scores: Scores
  body: string
  photos: string[]
  verified: boolean
  createdAt: number
  status?: 'approved' | 'hidden'
  placeName?: string
}

export type AlertType =
  | 'elevator'
  | 'ramp'
  | 'bathroom'
  | 'noise'
  | 'obstruction'
  | 'other'

export interface Alert {
  id: string
  placeId: string
  type: AlertType
  description: string
  reportedBy: string
  photoUrl?: string
  aiVerified: boolean
  aiConfidence?: number
  status: 'active' | 'resolved'
  createdAt: number
  resolvedAt?: number
  source?: 'community' | 'agency'
  agencyId?: 'wmata' | 'mta' | 'bart'
}

export interface AppUser {
  uid: string
  displayName: string
  email: string
  photoURL?: string
  role: 'user' | 'admin'
  premium: boolean
  savedPlaces: string[]
  reviewCount: number
  reportCount: number
}

export type FilterKey =
  | 'wheelchair'
  | 'quiet'
  | 'elevator'
  | 'braille'
  | 'sign'
  | 'hearingloop'

export interface NeedsProfile {
  name: string
  mobility: 'none' | 'cane' | 'manual_wheelchair' | 'power_wheelchair' | 'scooter'
  hearing: 'none' | 'hard_of_hearing' | 'deaf'
  vision: 'none' | 'low_vision' | 'blind'
  sensory: 'none' | 'sensitive' | 'severe'
  needsLift: boolean
  needsAccessibleToilet: boolean
  needsHearingLoop: boolean
  needsTactile: boolean
  needsQuietSpace: boolean
}

export interface CompatibilityResult {
  score: number          // 0–100
  grade: 'great' | 'good' | 'limited' | 'poor'
  warnings: string[]     // specific issues for this user
  highlights: string[]   // specific positives for this user
}

export interface VerifyResult {
  verified: boolean
  confidence: number
  detectedFeatures: (
    | 'ramp'
    | 'stairs'
    | 'elevator'
    | 'automatic_door'
    | 'accessible_bathroom'
  )[]
}
