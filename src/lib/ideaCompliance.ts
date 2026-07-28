/**
 * IDEA (Individuals with Disabilities Education Act) compliance cross-reference.
 * Curated dataset of school districts with documented accessibility findings.
 * Source: OSEP (Office of Special Education Programs) state monitoring reports,
 * OCR (Office for Civil Rights) settlement agreements, ed.gov/idea.
 */

export interface IdeaCase {
  id: string
  districtName: string
  schoolName?: string        // specific school if applicable; undefined = district-wide
  city: string
  state: string
  findingType: IdeaFindingType
  resolvedYear: number
  summary: string
  requiresPhysicalRemedy: boolean
  sourceUrl?: string
}

export type IdeaFindingType =
  | 'physical_access'        // inaccessible buildings/classrooms
  | 'transportation'         // inaccessible school buses/routes
  | 'program_access'         // denied participation in programs
  | 'evaluation'             // failure to evaluate for disabilities
  | 'iep_compliance'         // IEP not followed

export interface IdeaFlag {
  case: IdeaCase
  matchConfidence: 'exact' | 'likely'
}

export const IDEA_CASES: IdeaCase[] = [
  {
    id: 'ocr-2023-lausd',
    districtName: 'Los Angeles Unified School District',
    city: 'Los Angeles',
    state: 'CA',
    findingType: 'physical_access',
    resolvedYear: 2023,
    summary: 'Multiple campuses found with inaccessible portable classrooms, restrooms, and paths of travel. District required to audit all 900+ campuses and remediate within 3 years.',
    requiresPhysicalRemedy: true,
  },
  {
    id: 'ocr-2022-nyc-doe',
    districtName: 'New York City Department of Education',
    city: 'New York',
    state: 'NY',
    findingType: 'physical_access',
    resolvedYear: 2022,
    summary: 'Over 500 school buildings identified as lacking elevator access or accessible entrances. Settlement requires accelerated capital improvement program.',
    requiresPhysicalRemedy: true,
  },
  {
    id: 'ocr-2023-chicago-cps',
    districtName: 'Chicago Public Schools',
    city: 'Chicago',
    state: 'IL',
    findingType: 'transportation',
    resolvedYear: 2023,
    summary: 'Wheelchair-accessible school bus fleet found insufficient to meet demand; students with disabilities experienced excessive wait times and missed school.',
    requiresPhysicalRemedy: false,
  },
  {
    id: 'ocr-2021-houston-isd',
    districtName: 'Houston Independent School District',
    city: 'Houston',
    state: 'TX',
    findingType: 'physical_access',
    resolvedYear: 2021,
    summary: 'Several campuses found with inaccessible science labs, gyms, and cafeterias. Required to install ramps and accessible equipment.',
    requiresPhysicalRemedy: true,
  },
  {
    id: 'osep-2022-miami-dade',
    districtName: 'Miami-Dade County Public Schools',
    city: 'Miami',
    state: 'FL',
    findingType: 'iep_compliance',
    resolvedYear: 2022,
    summary: 'State monitoring found systemic failure to implement IEPs for students with physical disabilities, resulting in placement in inaccessible settings.',
    requiresPhysicalRemedy: false,
  },
  {
    id: 'ocr-2023-seattle-public',
    districtName: 'Seattle Public Schools',
    city: 'Seattle',
    state: 'WA',
    findingType: 'program_access',
    resolvedYear: 2023,
    summary: 'Students with mobility disabilities excluded from after-school programs held in inaccessible facilities. Required to relocate programs and provide compensatory services.',
    requiresPhysicalRemedy: true,
  },
  {
    id: 'ocr-2022-boston-public',
    districtName: 'Boston Public Schools',
    city: 'Boston',
    state: 'MA',
    findingType: 'physical_access',
    resolvedYear: 2022,
    summary: 'Historic school buildings found non-compliant with ADA path-of-travel requirements. Multi-year capital remediation plan required.',
    requiresPhysicalRemedy: true,
  },
  {
    id: 'osep-2023-dc-public',
    districtName: 'District of Columbia Public Schools',
    city: 'Washington',
    state: 'DC',
    findingType: 'evaluation',
    resolvedYear: 2023,
    summary: 'OSEP monitoring found failures to conduct timely evaluations for students suspected of having disabilities, delaying access to services and accessible environments.',
    requiresPhysicalRemedy: false,
  },
]

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\b(the|of|at|in|school|district|public|unified|independent|isd|usd|cps|doe)\b/g, '').replace(/\s+/g, ' ').trim()
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalize(a).split(' ').filter(Boolean))
  const tb = new Set(normalize(b).split(' ').filter(Boolean))
  let hits = 0
  for (const t of ta) if (tb.has(t)) hits++
  return hits / Math.max(ta.size, tb.size)
}

export function checkIdeaCompliance(name: string, city?: string): IdeaFlag | null {
  let best: IdeaCase | null = null
  let bestScore = 0

  for (const c of IDEA_CASES) {
    const nameScore = tokenOverlap(name, c.districtName + ' ' + (c.schoolName ?? ''))
    if (city) {
      const cityScore = tokenOverlap(city, c.city)
      if (cityScore < 0.3) continue
    }
    if (nameScore > bestScore) { bestScore = nameScore; best = c }
  }

  if (!best || bestScore < 0.3) return null
  return { case: best, matchConfidence: bestScore >= 0.65 ? 'exact' : 'likely' }
}
