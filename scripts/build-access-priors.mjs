/**
 * Builds src/data/accessPriors.json — real-world accessibility rates per
 * place type and per chain, from OpenStreetMap tag statistics (taginfo).
 * e.g. "of all cafés with a wheelchair tag, 52% say yes, 21% limited, 26% no".
 * Used to estimate what isn't mapped yet for a place. Re-run occasionally:
 *   node scripts/build-access-priors.mjs
 */
import { writeFileSync } from 'node:fs'

const API = 'https://taginfo.openstreetmap.org/api/4'
const UA = { 'User-Agent': 'AccessMap priors builder (accessmap.world)' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${API}${path}`, { headers: UA })
      if (res.ok) return await res.json()
    } catch { /* retry */ }
    await sleep(1500 * (attempt + 1))
  }
  throw new Error(`taginfo failed: ${path}`)
}

/** wheelchair + toilets:wheelchair value counts among objects with key=value. */
async function stats(key, value) {
  const d = await get(`/tag/combinations?key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}&filter=all&query=wheelchair&sortname=together_count&sortorder=desc&page=1&rp=50`)
  const c = (k, v) => d.data.find((r) => r.other_key === k && r.other_value === v)?.together_count ?? 0
  const w = { n: c('wheelchair', ''), yes: c('wheelchair', 'yes'), limited: c('wheelchair', 'limited'), no: c('wheelchair', 'no') }
  const t = { n: c('toilets:wheelchair', ''), yes: c('toilets:wheelchair', 'yes'), no: c('toilets:wheelchair', 'no') }
  // taginfo only lists common combinations, so rare values can be missing. Everything
  // tagged that isn't yes/limited counts as "no" — that can only make estimates more cautious.
  const out = {}
  if (w.n >= 30 && w.yes > 0) out.w = [w.yes, w.limited, Math.max(0, w.n - w.yes - w.limited)]
  if (t.n >= 30 && t.yes > 0) out.t = [t.yes, Math.max(0, t.n - t.yes)]
  return out
}

const TYPES = [
  'amenity=restaurant', 'amenity=fast_food', 'amenity=cafe', 'amenity=bar', 'amenity=pub', 'amenity=ice_cream',
  'amenity=pharmacy', 'amenity=hospital', 'amenity=clinic', 'amenity=doctors', 'amenity=dentist',
  'amenity=bank', 'amenity=atm', 'amenity=school', 'amenity=college', 'amenity=university', 'amenity=library',
  'amenity=place_of_worship', 'amenity=townhall', 'amenity=post_office', 'amenity=cinema', 'amenity=theatre',
  'amenity=community_centre', 'amenity=fuel', 'amenity=toilets', 'amenity=police',
  'tourism=hotel', 'tourism=motel', 'tourism=guest_house', 'tourism=museum', 'tourism=attraction', 'tourism=gallery', 'tourism=zoo',
  'shop=supermarket', 'shop=convenience', 'shop=department_store', 'shop=mall', 'shop=clothes', 'shop=bakery',
  'shop=books', 'shop=hardware', 'shop=doityourself', 'shop=chemist', 'shop=electronics', 'shop=hairdresser', 'shop=car_repair',
  'leisure=park', 'leisure=playground', 'leisure=sports_centre', 'leisure=fitness_centre', 'leisure=swimming_pool',
]

const out = { builtAt: new Date().toISOString().slice(0, 10), source: 'OpenStreetMap via taginfo', types: {}, brands: {} }
for (const kv of TYPES) {
  const [k, v] = kv.split('=')
  const s = await stats(k, v)
  if (s.w || s.t) out.types[kv] = s
  process.stdout.write(`${kv} ${JSON.stringify(s)}\n`)
  await sleep(250)
}

const top = await get('/key/values?key=brand:wikidata&filter=all&sortname=count&sortorder=desc&page=1&rp=400')
let done = 0
for (const row of top.data) {
  if (!/^Q\d+$/.test(row.value)) continue
  const s = await stats('brand:wikidata', row.value)
  if (s.w || s.t) out.brands[row.value] = s
  if (++done % 50 === 0) process.stdout.write(`brands ${done}/${top.data.length}, kept ${Object.keys(out.brands).length}\n`)
  await sleep(250)
}

writeFileSync(new URL('../src/data/accessPriors.json', import.meta.url), JSON.stringify(out))
console.log(`wrote ${Object.keys(out.types).length} place types, ${Object.keys(out.brands).length} brands`)
