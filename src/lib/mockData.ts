import type { Place, Review, Alert } from '../types'

const now = Date.now()
const hrs = (n: number) => now - n * 3600_000

// Placeholder businesses so the map, pin taps, and the Wheelchair/Vision/
// Hearing/Sensory filter chips always have something to show out of the box —
// even with no network access (Overpass/Nominatim) and no Firebase configured.
// All in and around Cedar Park, TX. Coordinates are approximate (demo data,
// not surveyed addresses). Reviews/alerts below reference three of these ids.
export const mockPlaces: Place[] = [
  { id: 'heb-plus-cedarpark',       name: 'H-E-B Plus',                     address: '1335 E Whitestone Blvd, Cedar Park, TX', city: 'Cedar Park', lat: 30.5195, lng: -97.8046, scores: { mobility: 8,  sensory: 4, hearing: 6, vision: 7 }, reviewCount: 0, lastUpdated: hrs(10) },
  { id: 'lakeline-mall',            name: 'Lakeline Mall',                  address: '11200 Lakeline Mall Dr, Cedar Park, TX', city: 'Cedar Park', lat: 30.4903, lng: -97.8166, scores: { mobility: 9,  sensory: 3, hearing: 7, vision: 8 }, reviewCount: 3, lastUpdated: hrs(5) },
  { id: 'brushy-creek-park',        name: 'Brushy Creek Lake Park',         address: '3-4 Brushy Creek Rd, Cedar Park, TX',    city: 'Cedar Park', lat: 30.5159, lng: -97.8171, scores: { mobility: 6,  sensory: 8, hearing: 4, vision: 6 }, reviewCount: 3, lastUpdated: hrs(2) },
  { id: 'cedar-park-rec-center',    name: 'Cedar Park Recreation Center',   address: '1435 Main St, Cedar Park, TX',           city: 'Cedar Park', lat: 30.5057, lng: -97.8207, scores: { mobility: 9,  sensory: 6, hearing: 7, vision: 8 }, reviewCount: 0, lastUpdated: hrs(18) },
  { id: 'cedar-park-regional-med',  name: 'Cedar Park Regional Medical Center', address: '1401 Medical Pkwy, Cedar Park, TX',  city: 'Cedar Park', lat: 30.5157, lng: -97.8304, scores: { mobility: 10, sensory: 6, hearing: 8, vision: 9 }, reviewCount: 0, lastUpdated: hrs(30) },
  { id: 'cedar-park-library',       name: 'Cedar Park Public Library',      address: '550 Discovery Blvd, Cedar Park, TX',     city: 'Cedar Park', lat: 30.5172, lng: -97.8379, scores: { mobility: 9,  sensory: 7, hearing: 8, vision: 9 }, reviewCount: 0, lastUpdated: hrs(14) },
  { id: 'summermoon-coffee-cp',     name: 'Summermoon Coffee Bar',          address: '1091 E Whitestone Blvd, Cedar Park, TX', city: 'Cedar Park', lat: 30.5220, lng: -97.8130, scores: { mobility: 5,  sensory: 5, hearing: 5, vision: 6 }, reviewCount: 0, lastUpdated: hrs(9) },
  { id: 'dans-hamburgers-cp',       name: "Dan's Hamburgers",               address: '1420 Cypress Creek Rd, Cedar Park, TX',  city: 'Cedar Park', lat: 30.5280, lng: -97.8350, scores: { mobility: 6,  sensory: 4, hearing: 5, vision: 5 }, reviewCount: 0, lastUpdated: hrs(22) },
  { id: 'heb-center-cedarpark',     name: 'H-E-B Center at Cedar Park',     address: '2100 Avenue of the Stars, Cedar Park, TX', city: 'Cedar Park', lat: 30.4974, lng: -97.8199, scores: { mobility: 9,  sensory: 3, hearing: 7, vision: 8 }, reviewCount: 3, lastUpdated: hrs(1) },
  { id: 'cedar-park-antique-mall',  name: 'Cedar Park Antique Mall',        address: '300 S Lakeline Blvd, Cedar Park, TX',    city: 'Cedar Park', lat: 30.5010, lng: -97.8233, scores: { mobility: 3,  sensory: 2, hearing: 3, vision: 3 }, reviewCount: 0, lastUpdated: hrs(40) },
]

const r = (placeId: string, idx: number, userName: string, s: Review['scores'], body: string, h: number, verified = false): Review => ({
  id: `${placeId}-r${idx}`, placeId, userId: `u${idx}`, userName, scores: s, body, photos: [], verified, createdAt: hrs(h),
})

export const mockReviews: Review[] = [
  r('lakeline-mall', 1, 'Maya R.', { mobility: 8, sensory: 4, hearing: 6, vision: 7 }, 'Great elevators near the food court but the west entrance ramp by Dillard’s is steep. Plenty of accessible restrooms throughout.', 6, true),
  r('lakeline-mall', 2, 'Devon K.', { mobility: 7, sensory: 3, hearing: 6, vision: 7 }, 'Crowded on weekends and the PA announcements echo badly, hard to follow. Guest services staff were very helpful with directions though.', 30),
  r('lakeline-mall', 3, 'Priya S.', { mobility: 9, sensory: 5, hearing: 7, vision: 8 }, 'Tactile paving leading to the crosswalks outside is excellent. Automatic doors at every main entrance.', 72, true),
  r('brushy-creek-park', 1, 'Sam W.', { mobility: 6, sensory: 8, hearing: 4, vision: 6 }, 'Calm, well-shaded trail with plenty of benches. No hearing loop at the nature center desk which was a miss for me.', 4),
  r('brushy-creek-park', 2, 'Lena M.', { mobility: 7, sensory: 8, hearing: 4, vision: 6 }, 'Step-free entry to the main pavilion and a quiet shaded area off the main trail. Loved how low-stimulation it felt compared to the mall.', 26, true),
  r('brushy-creek-park', 3, 'Theo B.', { mobility: 5, sensory: 7, hearing: 4, vision: 6 }, 'Ramp down to the lake overlook is a little narrow for power chairs but doable.', 50),
  r('heb-center-cedarpark', 1, 'Aiko T.', { mobility: 9, sensory: 2, hearing: 7, vision: 8 }, 'Beautiful arena but LOUD during games. The main concourse is overwhelming. Elevators exist but are hard to find from the north entrance.', 1),
  r('heb-center-cedarpark', 2, 'Marcus L.', { mobility: 9, sensory: 2, hearing: 7, vision: 8 }, 'Signage is good for low vision. Sensory overload is real during Texas Stars games — bring ear protection.', 18),
  r('heb-center-cedarpark', 3, 'Nora P.', { mobility: 8, sensory: 3, hearing: 7, vision: 7 }, 'Found the accessible seating section eventually — ask guest services near gate 3.', 40),
]

export const mockAlerts: Alert[] = [
  { id: 'a1', placeId: 'heb-center-cedarpark', type: 'elevator', description: 'Elevator to the upper concourse is offline — engineers on site.', reportedBy: 'Aiko T.', aiVerified: true, aiConfidence: 0.82, status: 'active', createdAt: hrs(2) },
  { id: 'a2', placeId: 'lakeline-mall', type: 'ramp', description: 'West entrance ramp near Dillard’s blocked by construction barriers. Use the Food Court entrance ramp instead.', reportedBy: 'Devon K.', aiVerified: false, aiConfidence: 0.41, status: 'active', createdAt: hrs(5) },
]
