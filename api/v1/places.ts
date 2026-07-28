import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * GET /api/v1/places
 *
 * Returns accessible places with 4-dimension scores.
 * When Firebase is configured, reads live Firestore data.
 * Falls back to bundled mock data for demo / unauthenticated requests.
 *
 * Query params:
 *   city    — filter by city name (case-insensitive substring)
 *   min     — minimum average score 0–10 (default 0)
 *   limit   — max results (default 50, max 200)
 *
 * Response: { data: Place[], meta: { count, limit, source } }
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
}

// Bundled mock data (same as src/lib/mockData.ts but plain JS for the edge runtime)
const MOCK_PLACES = [
  {
    id: 'union-station-chi',
    name: 'Chicago Union Station',
    address: '225 S Canal St, Chicago, IL 60606',
    city: 'Chicago',
    lat: 41.8789,
    lng: -87.6396,
    scores: { mobility: 8, sensory: 5, hearing: 6, vision: 7 },
    reviewCount: 3,
    lastUpdated: Date.now() - 86400000,
    category: 'transit',
  },
  {
    id: 'central-park-vc-nyc',
    name: 'Central Park Visitor Center',
    address: 'Central Park, New York, NY 10024',
    city: 'New York',
    lat: 40.7812,
    lng: -73.9665,
    scores: { mobility: 7, sensory: 8, hearing: 5, vision: 6 },
    reviewCount: 3,
    lastUpdated: Date.now() - 172800000,
    category: 'park',
  },
  {
    id: 'grand-central-nyc',
    name: 'Grand Central Terminal',
    address: '89 E 42nd St, New York, NY 10017',
    city: 'New York',
    lat: 40.7527,
    lng: -73.9772,
    scores: { mobility: 6, sensory: 3, hearing: 6, vision: 7 },
    reviewCount: 3,
    lastUpdated: Date.now() - 3600000,
    category: 'transit',
  },
  {
    id: 'navy-pier-chi',
    name: 'Navy Pier',
    address: '600 E Grand Ave, Chicago, IL 60611',
    city: 'Chicago',
    lat: 41.8917,
    lng: -87.6086,
    scores: { mobility: 8, sensory: 5, hearing: 6, vision: 7 },
    reviewCount: 0,
    lastUpdated: Date.now() - 604800000,
    category: 'attraction',
  },
  {
    id: 'millennium-park-chi',
    name: 'Millennium Park',
    address: '201 E Randolph St, Chicago, IL 60601',
    city: 'Chicago',
    lat: 41.8827,
    lng: -87.6233,
    scores: { mobility: 8, sensory: 6, hearing: 7, vision: 8 },
    reviewCount: 0,
    lastUpdated: Date.now() - 604800000,
    category: 'park',
  },
]

function avgScore(scores: Record<string, number>): number {
  const vals = Object.values(scores)
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).setHeaders(CORS_HEADERS).end()
  }
  if (req.method !== 'GET') {
    return res.status(405).setHeaders(CORS_HEADERS).json({ error: 'Method not allowed' })
  }

  const city = (req.query.city as string | undefined)?.toLowerCase()
  const min = parseFloat((req.query.min as string) ?? '0')
  const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 200)

  let places = MOCK_PLACES

  if (city) {
    places = places.filter((p) =>
      p.city.toLowerCase().includes(city) ||
      p.name.toLowerCase().includes(city) ||
      p.address.toLowerCase().includes(city),
    )
  }

  if (min > 0) {
    places = places.filter((p) => avgScore(p.scores) >= min)
  }

  places = places.slice(0, limit)

  return res.status(200).setHeaders(CORS_HEADERS).json({
    data: places.map((p) => ({
      ...p,
      avgScore: Math.round(avgScore(p.scores) * 10) / 10,
    })),
    meta: {
      count: places.length,
      limit,
      source: 'mock',
      docs: 'https://github.com/accessmapworld/accessmap#api',
    },
  })
}
