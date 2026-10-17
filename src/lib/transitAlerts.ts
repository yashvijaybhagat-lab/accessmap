/**
 * Transit agency elevator/escalator outage feeds.
 * Normalizes WMATA + MTA responses into the existing Alert shape.
 * Falls back to mock outages when no API keys are configured.
 */

import type { Alert } from '../types'

export interface AgencyOutage {
  id: string
  agencyId: 'wmata' | 'mta' | 'bart' | 'capmetro'
  agencyLabel: string
  stationName: string
  unit: string
  outageDate: number
  estimatedReturn?: number
  isElevator: boolean
  placeId?: string
}

// ── Mock outages (shown when no API keys are set) ──────────────────────────
// Themed to the Austin-area CapMetro MetroRail Red Line, whose northern
// terminus runs through the Cedar Park / Lakeline area — matches the rest of
// the demo data set. Each carries an explicit `placeId` so it attaches to one
// of our Cedar Park placeholder businesses regardless of station-name matching.

export const mockAgencyOutages: AgencyOutage[] = [
  {
    id: 'capmetro-lakeline-elv-01',
    agencyId: 'capmetro',
    agencyLabel: 'CapMetro Official',
    stationName: 'Lakeline Station',
    unit: 'Elevator — Parking garage to platform',
    outageDate: Date.now() - 2 * 3600_000,
    isElevator: true,
    placeId: 'lakeline-mall',
  },
  {
    id: 'capmetro-lakeline-escalator-1',
    agencyId: 'capmetro',
    agencyLabel: 'CapMetro Official',
    stationName: 'Lakeline Station',
    unit: 'Escalator — Platform to pedestrian bridge',
    outageDate: Date.now() - 6 * 3600_000,
    estimatedReturn: Date.now() + 18 * 3600_000,
    isElevator: false,
    placeId: 'lakeline-mall',
  },
  {
    id: 'capmetro-cedarpark-elevator-1',
    agencyId: 'capmetro',
    agencyLabel: 'CapMetro Official',
    stationName: 'Cedar Park Transit Center',
    unit: 'Elevator — Street to boarding platform',
    outageDate: Date.now() - 1 * 3600_000,
    isElevator: true,
    placeId: 'heb-center-cedarpark',
  },
]

// ── WMATA ──────────────────────────────────────────────────────────────────

interface WmataIncident {
  UnitName: string
  UnitType: 'ELEVATOR' | 'ESCALATOR'
  LocationDescription: string
  StationCode: string
  StationName: string
  SymptomDescription: string
  DateOutOfServ: string
  DateUpdated: string
  EstimatedReturnToService: string | null
}

async function fetchWmata(apiKey: string): Promise<AgencyOutage[]> {
  const res = await fetch(
    'https://api.wmata.com/Incidents.svc/json/ElevatorIncidents',
    { headers: { api_key: apiKey } },
  )
  if (!res.ok) throw new Error(`WMATA ${res.status}`)
  const data: { ElevatorIncidents: WmataIncident[] } = await res.json()
  return (data.ElevatorIncidents ?? []).map((inc) => ({
    id: `wmata-${inc.StationCode}-${inc.UnitName}`,
    agencyId: 'wmata' as const,
    agencyLabel: 'WMATA Official',
    stationName: inc.StationName,
    unit: `${inc.LocationDescription} (${inc.SymptomDescription})`,
    outageDate: new Date(inc.DateOutOfServ).getTime(),
    estimatedReturn: inc.EstimatedReturnToService
      ? new Date(inc.EstimatedReturnToService).getTime()
      : undefined,
    isElevator: inc.UnitType === 'ELEVATOR',
  }))
}

// ── MTA New York ───────────────────────────────────────────────────────────

interface MtaEquipment {
  station: string
  equipmentno: string
  equipmenttype: string
  isactive: string
  outagedate: string
  estimatedreturntoservice: string
  serving: string
}

async function fetchMta(): Promise<AgencyOutage[]> {
  const res = await fetch('https://api-endpoint.mta.info/Straphangers/ElevatorStatus')
  if (!res.ok) throw new Error(`MTA ${res.status}`)
  const data: { outages: MtaEquipment[] } = await res.json()
  return (data.outages ?? [])
    .filter((eq) => eq.isactive === 'N')
    .map((eq) => ({
      id: `mta-${eq.equipmentno}`,
      agencyId: 'mta' as const,
      agencyLabel: 'MTA Official',
      stationName: eq.station,
      unit: `${eq.equipmenttype === 'EL' ? 'Elevator' : 'Escalator'} ${eq.equipmentno} — ${eq.serving}`,
      outageDate: new Date(eq.outagedate).getTime(),
      estimatedReturn: eq.estimatedreturntoservice
        ? new Date(eq.estimatedreturntoservice).getTime()
        : undefined,
      isElevator: eq.equipmenttype === 'EL',
    }))
}

// ── BART (optional) ────────────────────────────────────────────────────────

interface BartBsa {
  '@type': string
  station: string
  description: { '#cdata-section': string }
  posted: string
}

async function fetchBart(apiKey: string): Promise<AgencyOutage[]> {
  const url = `https://api.bart.gov/api/bsa.aspx?cmd=elev&key=${apiKey}&json=y`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`BART ${res.status}`)
  const data: { root: { bsa: BartBsa | BartBsa[] } } = await res.json()
  const items = Array.isArray(data.root.bsa) ? data.root.bsa : [data.root.bsa]
  return items
    .filter((b) => b['@type'] === 'ELEVATOR')
    .map((b, i) => ({
      id: `bart-${b.station}-${i}`,
      agencyId: 'bart' as const,
      agencyLabel: 'BART Official',
      stationName: b.station,
      unit: b.description['#cdata-section'] ?? 'Elevator',
      outageDate: new Date(b.posted).getTime(),
      isElevator: true,
    }))
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function fetchAgencyOutages(): Promise<AgencyOutage[]> {
  const wmataKey = import.meta.env.VITE_WMATA_KEY as string | undefined
  const bartKey = import.meta.env.VITE_BART_KEY as string | undefined

  if (!wmataKey && !bartKey) return mockAgencyOutages

  const results = await Promise.allSettled([
    wmataKey ? fetchWmata(wmataKey) : Promise.resolve([]),
    fetchMta(),
    bartKey ? fetchBart(bartKey) : Promise.resolve([]),
  ])

  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

export function outageToAlert(
  outage: AgencyOutage,
  placeId: string,
): Omit<Alert, 'id' | 'createdAt' | 'status'> {
  const eta = outage.estimatedReturn
    ? ` Expected back: ${new Date(outage.estimatedReturn).toLocaleString()}.`
    : ''
  return {
    placeId,
    type: 'elevator',
    description: `[${outage.agencyLabel}] ${outage.unit} at ${outage.stationName} is out of service.${eta}`,
    reportedBy: outage.agencyLabel,
    aiVerified: true,
    aiConfidence: 1.0,
    source: 'agency',
    agencyId: outage.agencyId,
  } as Omit<Alert, 'id' | 'createdAt' | 'status'>
}
