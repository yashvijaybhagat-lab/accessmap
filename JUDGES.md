# AccessMap — Judge Cheat Sheet

A one-page guide to what we built, how it works, and how to defend it.

## The 15-second pitch
AccessMap is crowdsourced accessibility intelligence for the 1.3 billion people
with disabilities. Search any place and get a four-dimension accessibility score
(mobility, sensory, hearing, vision), live barrier alerts from official transit
agencies, and AI-verified photo reports — and the app itself is built to the
accessibility standard it preaches: screen-reader friendly, voice-driven, works offline.

> **The hook:** *"An accessibility app that isn't accessible is a contradiction.
> We made the product **and** the experience accessible — and we can prove it."*

> **The civic hook:** *"We don't just tell you where is accessible. We tell you
> where is legally required to be accessible — and whether it actually is."*

---

## Standout features (what to demo)

### 1. Text-to-speech, built in
- **What it is:** A "Read aloud" button on every place and alert, plus a
  "Read aloud on focus" mode that speaks buttons, links and headings as you
  move through the page.
- **How it works:** The Web Speech API (`speechSynthesis`). A small controller
  (`src/lib/speech.ts`) manages one shared utterance, tracks which control is
  speaking, and reads the *accessible name* of focused elements.
- **Why it matters:** Low-vision and low-literacy users, and anyone who can't
  look at the screen (e.g. navigating in a wheelchair), get the information by ear.
- **Judge Q — "Don't screen readers already do this?"** Screen readers exist but
  many users don't run one. This gives audio support to *everyone* with zero
  setup, and our content is structured so a real screen reader works too.

### 2. Voice search
- **What it is:** A mic button in the map search bar — speak a place name instead
  of typing. `"/"` also jumps focus to search.
- **How it works:** Web Speech *recognition* (`src/lib/useVoiceSearch.ts`).
  Gracefully hidden when unsupported.
- **Why it matters:** Hands-free input for users with motor/dexterity
  disabilities — typing on a phone can be the single hardest step.

### 3. Official transit agency outage alerts (NEW)
- **What it is:** Real-time elevator and escalator outage feeds from WMATA
  (Washington Metro) and MTA (New York) merged into the same live alert system
  as community reports — with a blue "WMATA Official" / "MTA Official" badge.
- **How it works:** `src/lib/transitAlerts.ts` polls
  `api.wmata.com/Incidents.svc/json/ElevatorIncidents` and
  `api-endpoint.mta.info/Straphangers/ElevatorStatus` every 5 minutes.
  Results are normalized into the existing `Alert` schema and flow through
  `subscribeAlerts()` unchanged — so the `aria-live` region, alert banner,
  and admin queue all work with zero extra UI code.
- **Why it matters:** A broken elevator makes a "10/10" station completely
  inaccessible. Nobody publishes this data in a usable form — we're the
  first map to surface it alongside community reports.
- **Judge Q — "Can you show it live?"** Yes. Open any place near a DC or NY
  transit station — if WMATA or MTA has an active outage, it appears with the
  blue badge. Mock outages (Farragut North, Grand Central, Jay St) show by
  default so the feature is demoable anywhere.

### 4. ADA accountability layer (NEW)
- **What it is:** A new `/accountability` page that cross-references AccessMap
  community reports against public DOJ ADA settlement records. When a place has
  a settlement on file, its detail page shows an amber warning banner: *"ADA
  Settlement — Physical Access (2022) — Settlement required improved elevator
  reliability..."*
- **How it works:** `src/lib/adaCompliance.ts` holds a curated dataset of public
  DOJ cases (source: ada.gov/cases) and runs a token-overlap name+city match
  against every place the user opens. Match confidence is `exact` or `likely`.
- **Why it matters:** These businesses are *legally required* to be accessible.
  Community reports show whether they actually are. The delta between legal
  obligation and real-world experience is the accountability gap — and we surface it.
- **Judge Q — "Isn't this just a list?"** No — it's a cross-reference engine.
  The value is the match: community score 3/10 + DOJ settlement = that business
  is breaking the law right now. That's actionable in a way a list never is.

### 5. Live updates (real-time)
- **What it is:** New reviews and barrier alerts appear instantly — no refresh —
  with a pulsing **LIVE** indicator and self-updating "2m ago" timestamps.
- **How it works:** Firestore `onSnapshot` when a backend is configured; a local
  pub/sub with **cross-tab `storage` sync** otherwise (`src/lib/data.ts`).
  New alerts are announced to screen readers via an `aria-live` region.
- **Why it matters:** Accessibility is *dynamic* — a broken lift makes a "10/10"
  place unusable today. Static data lies; live data is the whole point.

### 6. Works offline (PWA)
- **What it is:** Installable app that keeps working with no signal — your saved
  places and visited map tiles stay available, and a banner tells you you're offline.
- **How it works:** A service worker (`public/sw.js`): network-first for pages,
  stale-while-revalidate for assets, cache-first for map tiles. The data layer
  caches the last successful fetch to localStorage (`src/lib/data.ts`).
- **Why it matters:** People check accessibility *on the move* — transit dead
  zones, basements, rural areas. The moment you most need it is often offline.

### 7. The map is accessible (most apps fail here)
- **What it is:** Leaflet pins are invisible to screen readers by default. We add
  a screen-reader-only **list of every place on the map** (name + score + alert
  status, as links), keyboard-focusable labelled markers, and live result-count
  announcements.
- **Why it matters:** This is the #1 silent accessibility failure in mapping apps.
  We fixed the thing everyone else ships broken.

### 8. Adaptive accessibility controls
- **What it is:** A panel for larger text, high contrast, readable font
  (Atkinson Hyperlegible), greyscale, and **reduce motion** — saved per device.
- **How it works:** Toggles classes on `<html>`; our WebGL (Aurora) and GSAP
  animations actually *stop their loops* under reduced motion, not just CSS.
- **Why it matters:** WCAG 2.2 AA compliance with real, user-controlled options —
  vestibular-disorder users won't get sick from our hero animation.

### 9. Resilience / crash protection
- **What it is:** A React **error boundary** — one bad component shows a friendly
  recovery screen, never a white page. Reads as `role="alert"`.
- **Why it matters:** Judges *will* click something weird. We degrade gracefully.

---

## If they grill you — quick answers

- **"What's your moat / why is this hard?"** Accessibility data doesn't exist in a
  usable form. We fuse OpenStreetMap tags, community reviews, official transit
  outage feeds, and DOJ settlement records into one normalized view — and keep it live.
- **"How do you trust user data?"** Reviews pass a quality/profanity/spam filter
  before publishing; photos are AI-verified before they earn a "verified" badge;
  agency alerts are sourced directly from WMATA/MTA APIs.
- **"Does it scale?"** Pure client + Firestore; static hosting, CDN tiles, lazy-
  loaded routes, code-split bundles. No server to fall over.
- **"Is the accessibility real or buzzwords?"** Run a screen reader or Lighthouse
  on it live. Skip links, focus rings, ARIA roles, an accessible map list, and a
  public Accessibility Statement at `/accessibility` documenting conformance.
- **"What's the civic angle?"** `/accountability` — places with DOJ ADA settlements
  are legally required to be accessible. We show you which ones have community
  reports saying they're not. That's a gap between law and reality that currently
  exists nowhere in one place.
- **"What did you build recently?"** Real-time WMATA + MTA elevator outage feeds
  with official agency badges, ADA accountability cross-reference engine, and the
  `/accountability` civic dashboard — the difference between a review app and a
  civic enforcement tool.

---

## Demo flow (2 minutes)

1. Open `/map` → **speak** a city into voice search.
2. Open **Grand Central** → point out the amber **ADA Settlement** banner (2022 DOJ case on record).
3. Point out the **LIVE** WMATA/MTA outage alert with blue "Official" badge.
4. Hit **Read aloud** — the TTS reads the alert and settlement summary.
5. Navigate to `/accountability` → show the civic dashboard, filter by "Transit Access".
6. Toggle **Reduce motion / High contrast** in the accessibility panel.
7. Turn off Wi-Fi → app still shows places, **offline banner** appears.
8. Tab through with a screen reader → the map reads as a **list of places**.
