# AccessMap — Judge Cheat Sheet

A one-page guide to what we built, how it works, and how to defend it.

## The 15-second pitch
AccessMap is crowdsourced accessibility intelligence for the 1.3 billion people
with disabilities. Search any place, get a 4-dimension score, see real-time
transit outage alerts from official agencies, cross-reference DOJ settlement
records, plan a step-free route, and go indoors — all in one app built to the
accessibility standard it preaches.

> **The hook:** *"An accessibility app that isn't accessible is a contradiction.
> We made the product **and** the experience accessible — and we can prove it."*

> **The civic hook:** *"We don't just tell you where is accessible. We tell you
> where is legally required to be accessible — and whether it actually is."*

> **The infrastructure hook:** *"We open the data via API so cities, transit
> agencies, and civic apps can build on it without rebuilding it."*

---

## 14 features — what to know about each

### 1. Text-to-speech
- **What:** "Read aloud" on every place/alert + focus-driven reading mode.
- **How:** Web Speech API (`src/lib/speech.ts`). Reads accessible names of focused elements.
- **Why:** Audio for everyone, zero setup — not just screen-reader users.

### 2. Voice search
- **What:** Mic button in the search bar — speak a place name.
- **How:** Web Speech recognition (`src/lib/useVoiceSearch.ts`). Gracefully hidden when unsupported.
- **Why:** Hands-free input for motor/dexterity disabilities.

### 3. Official transit agency outage alerts
- **What:** Real-time WMATA + MTA elevator/escalator outages merged into the live alert feed with a blue "WMATA Official" / "MTA Official" badge.
- **How:** `src/lib/transitAlerts.ts` polls both APIs every 5 min. Results flow through the existing `Alert` schema — `aria-live`, AlertBanner, and admin queue all work with zero extra UI code.
- **Demo:** Open any place near a DC/NY station. Mock outages (Farragut North, Grand Central, Jay St) show by default.
- **Judge Q:** *"Can you show it live?"* Yes — active WMATA outages appear with the blue badge if there are any today.

### 4. ADA accountability layer
- **What:** Cross-references community reports against public DOJ ADA settlements. Places with a case on file show an amber banner on their detail page.
- **How:** `src/lib/adaCompliance.ts` — 10-case curated dataset from ada.gov/cases, token-overlap name+city matching.
- **Demo:** Open Grand Central → amber ADA Settlement banner (2022 case).
- **Judge Q:** *"Isn't this just a list?"* No — the value is the match: mobility score 3/10 + DOJ settlement = that business is breaking the law right now.

### 5. Sensory accessibility dimension
- **What:** `/sensory` — noise, lighting, crowd density, and scent scoring for autism and sensory processing disorder.
- **How:** `src/lib/sensory.ts`. SensoryProfile → 0–10 score. 3 places pre-loaded with mock data.
- **Why:** Huge underserved population with nowhere to look this up. We're the first map to surface it.
- **Demo:** Navigate to `/sensory` → Grand Central shows noise level 4/5, crowded, bright lighting.

### 6. School accessibility mapper
- **What:** `/schools` — IDEA/OCR compliance findings for major districts. Parents can see which school districts are under federal finding before enrolling a disabled child.
- **How:** `src/lib/ideaCompliance.ts` — 8-district curated dataset from OSEP + OCR records.
- **Demo:** Navigate to `/schools` → filter by "Physical Access" → LAUSD, NYC DOE, Boston appear.
- **Judge Q:** *"Congressional angle?"* IDEA is federal law enforced by Congress. This directly surfaces federal non-compliance in education.

### 7. Disaster accessibility layer
- **What:** `/disaster` — live FEMA disaster declarations + verified accessible emergency shelters with backup power, medical staff, and ASL interpreter status.
- **How:** `src/lib/disaster.ts` polls `fema.gov/api/open/v2/disasterDeclarationsSummaries`. 3 verified shelters (Chicago, NYC, DC) pre-loaded.
- **Demo:** Navigate to `/disaster` → shows active mock declaration + 3 accessible shelters with accessibility details.
- **Why:** Disabled people are disproportionately killed in disasters because evacuation routes and shelters aren't built for them.

### 8. Indoor accessibility maps
- **What:** `/place/:id/indoor` — crowdsourced floor-level maps showing accessible restrooms, elevators, quiet rooms, and service counters per floor.
- **How:** `src/lib/indoorMaps.ts`. Interactive floor selector, visual grid, feature list. 4 places pre-mapped (Grand Central, Union Station, Navy Pier, Pike Place).
- **Demo:** Open Grand Central → tap "Indoor map" → select floor, see elevator and restroom locations.
- **Why:** Google Maps stops at the front door. We go inside.

### 9. Business certification
- **What:** `/claim` — businesses submit ADA audit reports or renovation receipts to earn a "Certified Accessible" badge. 3-tier system: self-reported → community verified → certified.
- **Demo:** Navigate to `/claim` → select a place → check document types → submit.
- **Why:** Gives businesses an incentive to actually improve — and gives users a trust signal beyond reviews.

### 10. Open API
- **What:** `GET /api/v1/places` and `/api/v1/places/:id` — Vercel edge functions exposing AccessMap data with CORS, filtering, and caching.
- **How:** `api/v1/places.ts` and `api/v1/places/[id].ts`. Queryable by city, min score, limit.
- **Demo:** `curl https://accessmap.vercel.app/api/v1/places?city=chicago` — returns JSON.
- **Why:** Turns AccessMap into infrastructure. Cities, transit planners, and civic devs can build on our data without rebuilding it.

### 11. Live updates (real-time)
- **What:** Reviews and alerts appear instantly with pulsing LIVE indicator.
- **How:** Firestore `onSnapshot` / local pub-sub with cross-tab `storage` sync. `aria-live` for screen readers.

### 12. Offline PWA
- **What:** Installable, works without signal. Saved places and map tiles cached.
- **How:** Service worker (`public/sw.js`). Network-first pages, cache-first tiles.

### 13. Accessible map
- **What:** Screen-reader-only list of every place on the map. Keyboard-focusable markers.
- **Why:** #1 silent failure in mapping apps. We fixed it.

### 14. Adaptive accessibility controls
- **What:** High contrast, larger text, Atkinson Hyperlegible, greyscale, reduce motion — saved per device.
- **How:** Toggles `<html>` classes. WebGL and GSAP loops actually stop under reduce motion.

---

## If they grill you

- **"What's your moat?"** Accessibility data doesn't exist in a usable form anywhere. We fuse OSM, community reviews, official transit feeds, DOJ settlements, IDEA findings, and FEMA data into one normalized view. Nobody else has done this.
- **"How do you trust user data?"** Spam/profanity filter on reviews. AI photo verification via Roboflow. Official agency alerts are sourced directly from WMATA/MTA APIs.
- **"Does it scale?"** Pure client + Firestore. Static hosting, CDN tiles, lazy-loaded routes, code-split bundles. No server to fall over.
- **"Is the accessibility real?"** Run Lighthouse or a screen reader live. Skip links, ARIA roles, focus rings, accessible map list, public Accessibility Statement at `/accessibility`.
- **"What's the civic angle?"** Three separate government datasets — DOJ settlements, IDEA/OCR findings, FEMA declarations — all cross-referenced against community reports. That's accountability infrastructure.
- **"What's the API for?"** City governments and transit agencies can pull our crowdsourced scores to inform capital planning without building their own data collection. We become the layer they build on.

---

## Demo flow (2.5 minutes)

1. `/map` → **speak** "Chicago" into voice search → places appear.
2. Open **Grand Central** → amber **ADA Settlement** banner (2022 DOJ case). Point out community mobility score 6/10 vs. legal obligation.
3. See blue **MTA Official** outage alert with BadgeCheck badge. Hit **Read aloud** — TTS reads the whole thing.
4. Tap **Indoor map** → floor selector → show elevator and restroom locations by floor.
5. Back to nav → `/sensory` → Grand Central: noise 4/5, crowded, bright.
6. `/accountability` → filter "Transit Access" → civic dashboard.
7. `/schools` → filter "Physical Access" → LAUSD, NYC DOE flagged.
8. `/disaster` → active declaration → 3 accessible shelters with backup power / ASL badges.
9. `/api/v1/places?city=chicago` in browser — raw JSON response.
10. Toggle **Reduce motion / High contrast** in accessibility panel.
11. Turn off Wi-Fi → offline banner, app still works.
