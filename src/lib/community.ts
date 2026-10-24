import type { AccessSpecs } from '../types'
import { deriveAccess, type Poi } from './overpass'

/**
 * Fold community-reported specs (newest first) into a place's OSM-style tags
 * and re-score it. Community data fills gaps only — a value mapped in
 * OpenStreetMap is never overwritten — and each field uses the newest report.
 */
export function applyCommunitySpecs(poi: Poi, specs: AccessSpecs[]): Poi {
  if (!specs.length) return poi
  const latest = <K extends keyof AccessSpecs>(k: K): AccessSpecs[K] | undefined => specs.find((s) => s[k] != null)?.[k]
  const add: Record<string, string> = {}
  const yn = (v: boolean | undefined) => (v == null ? undefined : v ? 'yes' : 'no')

  const stepFree = latest('hasStepFreeEntrance')
  const steps = latest('entranceStepCount')
  if (stepFree != null) add.wheelchair = stepFree ? 'yes' : 'limited'
  else if (steps != null) add.wheelchair = steps === 0 ? 'yes' : 'limited'
  if (steps != null) add.step_count = String(steps)
  if (latest('stepHeightCm') != null) add.step_height = `${latest('stepHeightCm')} cm`
  if (latest('kerbType')) add.kerb = String(latest('kerbType'))
  if (latest('rampPresent') != null) add.ramp = yn(latest('rampPresent'))!
  if (latest('rampGradientPct') != null) add.incline = `${latest('rampGradientPct')}%`
  if (latest('rampWidthCm') != null) add['ramp:width'] = `${latest('rampWidthCm')} cm`
  if (latest('rampHasHandrails') != null) add['ramp:handrail'] = yn(latest('rampHasHandrails'))!
  if (latest('doorWidthCm') != null) add['door:width'] = `${latest('doorWidthCm')} cm`
  const door = latest('doorType')
  if (door === 'automatic') add.automatic_door = 'yes'
  else if (door === 'revolving') add.door = 'revolving'
  else if (door) add.door = 'hinged'
  if (latest('hasLift') != null) add.lift = yn(latest('hasLift'))!
  if (latest('liftDoorWidthCm') != null) add['lift:width'] = `${latest('liftDoorWidthCm')} cm`
  if (latest('liftDepthCm') != null) add['lift:depth'] = `${latest('liftDepthCm')} cm`
  if (latest('hasAccessibleToilet') != null) add['toilets:wheelchair'] = yn(latest('hasAccessibleToilet'))!
  if (latest('corridorWidthCm') != null) add.min_width = `${latest('corridorWidthCm')} cm`
  const surface = latest('floorSurface')
  if (surface) add.surface = { smooth: 'paved', carpet: 'carpet', uneven: 'compacted', cobblestone: 'sett', gravel: 'gravel' }[surface]
  if (latest('hasTactilePaving') != null) add.tactile_paving = yn(latest('hasTactilePaving'))!
  if (latest('hasDisabledParking') != null) add['parking:disabled'] = yn(latest('hasDisabledParking'))!
  if (latest('disabledParkingSpaces') != null) add['capacity:disabled'] = String(latest('disabledParkingSpaces'))

  const tags = { ...add, ...(poi.tags ?? {}) } // OSM wins where both exist
  return {
    ...poi,
    ...deriveAccess(tags, poi.category, poi.context),
    tags,
    communityReports: specs.length,
  }
}
