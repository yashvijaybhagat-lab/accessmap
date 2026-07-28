import type { VercelRequest, VercelResponse } from '@vercel/node'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
}

const MOCK_PLACES: Record<string, object> = {
  'grand-central-nyc': {
    id: 'grand-central-nyc',
    name: 'Grand Central Terminal',
    address: '89 E 42nd St, New York, NY 10017',
    city: 'New York',
    lat: 40.7527,
    lng: -73.9772,
    scores: { mobility: 6, sensory: 3, hearing: 6, vision: 7 },
    avgScore: 5.5,
    reviewCount: 3,
    category: 'transit',
    adaSettlement: { year: 2022, type: 'physical_access', source: 'ada.gov' },
    lastUpdated: Date.now() - 3600000,
  },
  'union-station-chi': {
    id: 'union-station-chi',
    name: 'Chicago Union Station',
    address: '225 S Canal St, Chicago, IL 60606',
    city: 'Chicago',
    lat: 41.8789,
    lng: -87.6396,
    scores: { mobility: 8, sensory: 5, hearing: 6, vision: 7 },
    avgScore: 6.5,
    reviewCount: 3,
    category: 'transit',
    adaSettlement: { year: 2021, type: 'physical_access', source: 'ada.gov' },
    lastUpdated: Date.now() - 86400000,
  },
  'central-park-vc-nyc': {
    id: 'central-park-vc-nyc',
    name: 'Central Park Visitor Center',
    address: 'Central Park, New York, NY 10024',
    city: 'New York',
    lat: 40.7812,
    lng: -73.9665,
    scores: { mobility: 7, sensory: 8, hearing: 5, vision: 6 },
    avgScore: 6.5,
    reviewCount: 3,
    category: 'park',
    lastUpdated: Date.now() - 172800000,
  },
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).setHeaders(CORS_HEADERS).end()
  if (req.method !== 'GET') return res.status(405).setHeaders(CORS_HEADERS).json({ error: 'Method not allowed' })

  const { id } = req.query as { id: string }
  const place = MOCK_PLACES[id]

  if (!place) {
    return res.status(404).setHeaders(CORS_HEADERS).json({ error: 'Place not found', id })
  }

  return res.status(200).setHeaders(CORS_HEADERS).json({ data: place })
}
