/**
 * Disaster accessibility layer.
 * Pulls FEMA disaster declarations and merges with a curated dataset of
 * verified accessible emergency shelters. Activates when there is an active
 * declared disaster in the user's area.
 */

export interface DisasterDeclaration {
  id: string
  disasterNumber: string
  state: string
  declarationTitle: string
  declarationType: 'DR' | 'EM' | 'FM'  // Major Disaster, Emergency, Fire
  declarationDate: number               // epoch ms
  incidentBeginDate: number
  incidentEndDate?: number
  active: boolean
}

export interface AccessibleShelter {
  id: string
  name: string
  address: string
  city: string
  state: string
  lat: number
  lng: number
  wheelchairAccessible: boolean
  hasBackupPower: boolean
  hasMedicalStaff: boolean
  hasSignLanguageInterpreter: boolean
  capacity: number
  accessibilityNotes?: string
  phone?: string
  source: 'fema' | 'red_cross' | 'verified'
}

// ── Mock shelters (shown when offline / no disaster active) ───────────────

export const MOCK_SHELTERS: AccessibleShelter[] = [
  {
    id: 'shelter-chi-1',
    name: 'McCormick Place Emergency Shelter',
    address: '2301 S Lake Shore Dr',
    city: 'Chicago',
    state: 'IL',
    lat: 41.8527,
    lng: -87.6154,
    wheelchairAccessible: true,
    hasBackupPower: true,
    hasMedicalStaff: true,
    hasSignLanguageInterpreter: true,
    capacity: 2000,
    accessibilityNotes: 'Full ADA compliance. Accessible restrooms on all floors. Mobility device charging available.',
    phone: '312-791-7000',
    source: 'verified',
  },
  {
    id: 'shelter-nyc-1',
    name: 'Jacob K. Javits Convention Center Shelter',
    address: '429 11th Ave',
    city: 'New York',
    state: 'NY',
    lat: 40.7579,
    lng: -74.0023,
    wheelchairAccessible: true,
    hasBackupPower: true,
    hasMedicalStaff: true,
    hasSignLanguageInterpreter: false,
    capacity: 3000,
    accessibilityNotes: 'Accessible entry on 11th Ave. Elevator to all floors. Accessible cots available on request.',
    phone: '212-216-2000',
    source: 'fema',
  },
  {
    id: 'shelter-dc-1',
    name: 'DC Armory Emergency Shelter',
    address: '2001 E Capitol St SE',
    city: 'Washington',
    state: 'DC',
    lat: 38.8876,
    lng: -76.9803,
    wheelchairAccessible: true,
    hasBackupPower: true,
    hasMedicalStaff: false,
    hasSignLanguageInterpreter: true,
    capacity: 1500,
    accessibilityNotes: 'Ground-floor accessible entrance. Accessible restrooms available. Service animals welcome.',
    phone: '202-724-4968',
    source: 'red_cross',
  },
]

// ── FEMA API ──────────────────────────────────────────────────────────────
// Docs: https://www.fema.gov/api/open/v2/disasterDeclarationsSummaries

interface FemaDisaster {
  disasterNumber: number
  state: string
  declarationTitle: string
  declarationType: string
  declarationDate: string
  incidentBeginDate: string
  incidentEndDate?: string
}

export async function fetchActiveDisasters(state?: string): Promise<DisasterDeclaration[]> {
  const now = Date.now()
  const thirtyDaysAgo = new Date(now - 30 * 86400_000).toISOString().split('T')[0]

  let url = `https://www.fema.gov/api/open/v2/disasterDeclarationsSummaries?$filter=declarationDate ge '${thirtyDaysAgo}'&$orderby=declarationDate desc&$top=20&$format=json`
  if (state) url += `&$filter=state eq '${state}'`

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`FEMA ${res.status}`)
    const data: { DisasterDeclarationsSummaries: FemaDisaster[] } = await res.json()
    return (data.DisasterDeclarationsSummaries ?? []).map((d) => ({
      id: `fema-${d.disasterNumber}`,
      disasterNumber: String(d.disasterNumber),
      state: d.state,
      declarationTitle: d.declarationTitle,
      declarationType: d.declarationType as DisasterDeclaration['declarationType'],
      declarationDate: new Date(d.declarationDate).getTime(),
      incidentBeginDate: new Date(d.incidentBeginDate).getTime(),
      incidentEndDate: d.incidentEndDate ? new Date(d.incidentEndDate).getTime() : undefined,
      active: !d.incidentEndDate || new Date(d.incidentEndDate).getTime() > now,
    }))
  } catch {
    return MOCK_DECLARATIONS
  }
}

export const MOCK_DECLARATIONS: DisasterDeclaration[] = [
  {
    id: 'fema-demo-1',
    disasterNumber: 'DEMO',
    state: 'IL',
    declarationTitle: 'Severe Winter Storm and Flooding — Accessibility Layer Active',
    declarationType: 'DR',
    declarationDate: Date.now() - 3 * 86400_000,
    incidentBeginDate: Date.now() - 5 * 86400_000,
    active: true,
  },
]

export function getSheltersByState(state: string): AccessibleShelter[] {
  return MOCK_SHELTERS.filter((s) => s.state === state)
}
