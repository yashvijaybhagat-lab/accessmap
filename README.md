# AccessMap

Crowdsourced accessibility intelligence for people with disabilities. Search any
place, see a four-dimension accessibility score, read community reviews, get live
issue alerts, plan step-free routes, and submit AI-verified photo reports.

> **Runs out of the box.** With no Firebase keys configured, AccessMap loads
> bundled mock data (10 places across 5 cities, reviews, live alerts) and a
> local demo auth so every screen and flow is explorable. Add `.env` keys to go
> live on real Firestore + Roboflow.

## Stack
React + TypeScript + Vite · Tailwind CSS · Leaflet + OpenStreetMap · Firebase
(Auth/Firestore/Storage) · Roboflow inference · React Router v6 · Zustand ·
Lucide React.

## Quick start
```bash
npm install
cp .env.example .env   # optional — fill in for live backend
npm run dev            # http://localhost:5173
```

## Routes
| Path | Page |
|------|------|
| `/` | Full-screen map, Nominatim search, accessibility filter chips, place sidebar |
| `/place/:id` | Score rings, live alert banner, reviews, AI-verified photo gallery, report/review modals |
| `/route` | Step-free route planner (OSRM) with accessibility warnings flagged |
| `/report` | Report an issue (also a modal on place pages) |
| `/submit-review` | Submit a 4-dimension review with photo upload |
| `/profile` | Google + email auth, saved places, my reviews & reports |
| `/admin` | Admin-only: AI verification queue, report resolution, place data |

## Design system
Navy `#070B18` · teal `#0ABFBF` · orange `#FF6B47` · cards `#111827`.
DM Serif Display (headings) · Inter (body) · JetBrains Mono (labels).
Animations: pulse rings, score-ring fill, alert glow, page fade-in, pin drop,
staggered lists — all defined in `tailwind.config.js`.

## Going live
1. Create a Firebase project → enable Auth (Google + Email/Password), Firestore, Storage.
2. Fill `.env` from `.env.example`.
3. Deploy rules: `firebase deploy --only firestore:rules` (see `firestore.rules`).
4. Seed data (Node 20+ loads `.env` natively):
   ```bash
   npx tsx --env-file=.env src/scripts/seed.ts        # demo places/reviews/alerts
   npx tsx --env-file=.env src/scripts/osm-seed.ts Chicago
   npx tsx --env-file=.env src/scripts/osm-seed.ts NYC
   ```
5. Add a Roboflow accessibility model and set `VITE_ROBOFLOW_*` to enable real
   photo verification (otherwise a deterministic demo verifier is used).
6. To grant admin: set `role: "admin"` on the user's `users/{uid}` document.

## Key components
`MapPin` · `ScoreRing` · `AlertBanner` · `AccessibilityFilter` · `PhotoUpload`
· `PlaceCard` · `MapView` · `ReviewForm` · `ReportForm` · `Modal`.
