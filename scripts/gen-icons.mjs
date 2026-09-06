/**
 * Generates the PWA / mobile icon set into public/ from inline SVG.
 *
 *   node scripts/gen-icons.mjs
 *
 * Outputs:
 *   icon-192.png, icon-512.png            — manifest "any"
 *   icon-maskable-192.png, -512.png       — manifest "maskable" (safe-zone padded)
 *   apple-touch-icon.png (180, opaque)    — iOS home screen
 *   favicon-16.png, favicon-32.png, favicon.ico
 *   og-image.png (1200x630)               — link previews
 */
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const NAVY = '#070B18'
const TEAL = '#0ABFBF'

/** App icon artwork. `inset` = fraction of canvas kept clear around the glyph. */
function iconSVG(size, inset) {
  const c = size / 2
  // pin glyph drawn in a 24x24 viewBox, scaled to fill (1 - 2*inset) of canvas
  const glyph = size * (1 - 2 * inset)
  const gx = c - glyph / 2
  const gy = c - glyph / 2
  const ring = glyph * 0.62
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="42%" r="60%">
      <stop offset="0%" stop-color="${TEAL}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${TEAL}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${NAVY}"/>
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#glow)"/>
  <circle cx="${c}" cy="${c * 0.92}" r="${ring / 2}" fill="none" stroke="${TEAL}" stroke-opacity="0.25" stroke-width="${size * 0.014}"/>
  <g transform="translate(${gx} ${gy}) scale(${glyph / 24})">
    <path d="M12 1.5C7.6 1.5 4 5 4 9.3c0 5.6 6.7 12.4 7.4 13.1a0.8 0.8 0 0 0 1.2 0C13.3 21.7 20 14.9 20 9.3 20 5 16.4 1.5 12 1.5Z" fill="${TEAL}"/>
    <circle cx="12" cy="9.2" r="2.9" fill="${NAVY}"/>
  </g>
</svg>`)
}

function ogSVG() {
  const W = 1200, H = 630
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a1020"/>
      <stop offset="100%" stop-color="${NAVY}"/>
    </linearGradient>
    <radialGradient id="glow" cx="26%" cy="45%" r="45%">
      <stop offset="0%" stop-color="${TEAL}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${TEAL}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g transform="translate(150 175) scale(11.6)">
    <path d="M12 1.5C7.6 1.5 4 5 4 9.3c0 5.6 6.7 12.4 7.4 13.1a0.8 0.8 0 0 0 1.2 0C13.3 21.7 20 14.9 20 9.3 20 5 16.4 1.5 12 1.5Z" fill="${TEAL}"/>
    <circle cx="12" cy="9.2" r="2.9" fill="${NAVY}"/>
  </g>
  <text x="470" y="300" font-family="Arial, Helvetica, sans-serif" font-size="86" font-weight="700" fill="#ffffff">AccessMap</text>
  <text x="472" y="366" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="400" fill="${TEAL}">AI-verified accessibility for every place</text>
  <text x="472" y="418" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="400" fill="#9aa4b2">Ramps · step-free entrances · accessible restrooms · routes</text>
</svg>`)
}

/** Minimal ICO container wrapping PNG frames. */
function buildICO(frames) {
  const count = frames.length
  const header = Buffer.alloc(6 + count * 16)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)
  let offset = header.length
  const body = []
  frames.forEach((f, i) => {
    const e = 6 + i * 16
    header.writeUInt8(f.size >= 256 ? 0 : f.size, e)
    header.writeUInt8(f.size >= 256 ? 0 : f.size, e + 1)
    header.writeUInt8(0, e + 2)
    header.writeUInt8(0, e + 3)
    header.writeUInt16LE(1, e + 4)
    header.writeUInt16LE(32, e + 6)
    header.writeUInt32LE(f.data.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += f.data.length
    body.push(f.data)
  })
  return Buffer.concat([header, ...body])
}

async function main() {
  const out = (name, buf) => sharp(buf).png().toFile(join(PUB, name))

  await out('icon-192.png', iconSVG(192, 0.16))
  await out('icon-512.png', iconSVG(512, 0.16))
  await out('icon-maskable-192.png', iconSVG(192, 0.28))
  await out('icon-maskable-512.png', iconSVG(512, 0.28))

  // iOS: opaque, no rounded corners (the OS masks it).
  await sharp(iconSVG(180, 0.14))
    .flatten({ background: NAVY })
    .png()
    .toFile(join(PUB, 'apple-touch-icon.png'))

  const f16 = await sharp(iconSVG(16, 0.1)).png().toBuffer()
  const f32 = await sharp(iconSVG(32, 0.1)).png().toBuffer()
  await out('favicon-16.png', f16)
  await out('favicon-32.png', f32)
  writeFileSync(
    join(PUB, 'favicon.ico'),
    buildICO([{ size: 16, data: f16 }, { size: 32, data: f32 }]),
  )

  await sharp(ogSVG()).png().toFile(join(PUB, 'og-image.png'))

  console.log('icons written to', PUB)
}

main().catch((e) => { console.error(e); process.exit(1) })
