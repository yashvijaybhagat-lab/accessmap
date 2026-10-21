import { Link } from 'react-router-dom'
import { CheckCircle2, AlertCircle, Mail, ExternalLink } from 'lucide-react'
import Layout from '../components/Layout'

const CONFORMANCE = [
  { area: 'Colour contrast', status: 'pass', detail: 'All text meets WCAG AA 4.5:1 (body) and 3:1 (large text) contrast ratios.' },
  { area: 'Keyboard navigation', status: 'pass', detail: 'All interactive elements reachable via Tab; custom focus-visible ring on every focusable element.' },
  { area: 'Skip navigation', status: 'pass', detail: '"Skip to main content" link at top of every page.' },
  { area: 'Landmark regions', status: 'pass', detail: 'header, nav, main, footer landmarks present on all pages.' },
  { area: 'Heading hierarchy', status: 'pass', detail: 'Single h1 per page; logical h2→h3 nesting.' },
  { area: 'Images', status: 'pass', detail: 'All informative images have descriptive alt text; decorative images have alt="".' },
  { area: 'Form labels', status: 'pass', detail: 'Every form control has an associated <label> or aria-label.' },
  { area: 'Interactive components', status: 'pass', detail: 'Buttons, links, and modals expose correct ARIA roles and states.' },
  { area: 'Map (3D, MapLibre)', status: 'partial', detail: 'Every pin is a labelled button that shows its score as text. Arrow keys pan and +/− zoom; press L for a list view of everything on the map. A flat 2D mode removes tilt and 3D buildings. Complex geospatial navigation remains a known limitation of web mapping.' },
  { area: 'Personalisation', status: 'pass', detail: 'One-tap setups for low vision, blindness, colour blindness, deafness, wheelchair / dexterity, dyslexia / cognitive, vestibular and sensory needs, plus text size up to 175%, high contrast, text spacing, large cursor, large targets and a reading guide (Alt + A).' },
  { area: 'Routing', status: 'pass', detail: 'Routes are planned per need (manual wheelchair, power chair, walker, low vision, walking), checked for steps, kerbs, crossings, surfaces and slopes, and can be read aloud or followed with spoken, vibrating step-by-step guidance.' },
  { area: 'Motion', status: 'pass', detail: 'Animated elements respect prefers-reduced-motion — including WebGL (Aurora) and GSAP effects, which stop their animation loops, not just CSS transitions.' },
  { area: 'Text to speech', status: 'pass', detail: 'Built-in read-aloud controls on place details and alerts, plus an optional "read aloud on focus" mode in the accessibility panel.' },
  { area: 'Live updates', status: 'pass', detail: 'New reviews and alerts stream in real time and are announced to screen readers via aria-live regions.' },
]

export default function AccessibilityStatement() {
  return (
    <Layout>
      <main id="main-content" className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
          <Link to="/" className="hover:underline">Home</Link>
          <span className="mx-2" aria-hidden="true">/</span>
          <span aria-current="page">Accessibility Statement</span>
        </nav>

        <h1 className="text-3xl font-semibold text-ink sm:text-4xl">Accessibility Statement</h1>
        <p className="mt-2 text-sm text-muted">Last updated: June 2026</p>

        <p className="mt-6 text-muted leading-relaxed">
          AccessMap is committed to ensuring that our website and application are accessible to all
          users, including people with disabilities. We aim to conform to <strong className="text-ink">WCAG
          2.2 Level AA</strong> and continuously improve the accessibility of our products.
        </p>

        {/* Conformance status */}
        <section aria-labelledby="conformance-heading" className="mt-10">
          <h2 id="conformance-heading" className="text-xl font-semibold text-ink">Conformance status</h2>
          <p className="mt-2 text-muted leading-relaxed">
            We target <strong className="text-ink">WCAG 2.2 Level AA</strong> conformance. The table below
            reflects our current self-assessed status. We conduct periodic audits using automated tools
            (Lighthouse, axe-core) and manual testing with keyboard-only and screen reader (VoiceOver,
            NVDA) workflows.
          </p>
          <div className="mt-5 overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-[#f8f9fa]">
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-ink">Area</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-ink">Status</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-ink">Detail</th>
                </tr>
              </thead>
              <tbody>
                {CONFORMANCE.map(({ area, status, detail }) => (
                  <tr key={area} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">{area}</td>
                    <td className="px-4 py-3">
                      {status === 'pass' ? (
                        <span className="inline-flex items-center gap-1.5 text-[#1e8e3e] font-medium">
                          <CheckCircle2 size={14} aria-hidden="true" /> Pass
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[#f59e0b] font-medium">
                          <AlertCircle size={14} aria-hidden="true" /> Partial
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted leading-relaxed">{detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Known limitations */}
        <section aria-labelledby="limitations-heading" className="mt-10">
          <h2 id="limitations-heading" className="text-xl font-semibold text-ink">Known limitations</h2>
          <ul className="mt-3 space-y-2 text-muted" role="list">
            <li className="flex gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#f59e0b]" aria-hidden="true" />
              <span><strong className="text-ink">Interactive map:</strong> Visual maps present inherent barriers for keyboard-only and screen reader users. The list view (press L) and the route directions list give the same information as text, and result counts are announced live.</span>
            </li>
            <li className="flex gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#f59e0b]" aria-hidden="true" />
              <span><strong className="text-ink">Aurora animation:</strong> The hero background animation may affect users with vestibular disorders. It respects <code className="text-xs bg-[#f1f3f4] rounded px-1 py-0.5">prefers-reduced-motion</code> and is marked <code className="text-xs bg-[#f1f3f4] rounded px-1 py-0.5">aria-hidden</code>.</span>
            </li>
            <li className="flex gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#f59e0b]" aria-hidden="true" />
              <span><strong className="text-ink">Third-party data:</strong> Map tiles (OpenFreeMap), routing (Valhalla) and place data (OpenStreetMap) are community-maintained. Accessibility details are only as complete as the map — places say clearly what is not yet known.</span>
            </li>
          </ul>
        </section>

        {/* Feedback & contact */}
        <section aria-labelledby="feedback-heading" className="mt-10">
          <h2 id="feedback-heading" className="text-xl font-semibold text-ink">Feedback &amp; contact</h2>
          <p className="mt-3 text-muted leading-relaxed">
            We welcome accessibility feedback. If you experience a barrier not listed here, or need
            content in a different format, please contact us:
          </p>
          <address className="mt-4 not-italic rounded-2xl border border-border bg-[#f8f9fa] p-5 text-sm text-muted">
            <p className="font-semibold text-ink">AccessMap Accessibility Team</p>
            <p className="mt-2 flex items-center gap-2">
              <Mail size={14} aria-hidden="true" />
              <a href="mailto:accessibility@accessmap.world" className="underline hover:text-ink">
                accessibility@accessmap.world
              </a>
            </p>
            <p className="mt-1">We aim to respond within <strong className="text-ink">2 business days</strong>.</p>
          </address>
        </section>

        {/* Technical approach */}
        <section aria-labelledby="technical-heading" className="mt-10">
          <h2 id="technical-heading" className="text-xl font-semibold text-ink">Technical approach</h2>
          <p className="mt-3 text-muted leading-relaxed">
            AccessMap is built with React + TypeScript and Tailwind CSS. We test accessibility using:
          </p>
          <ul className="mt-3 space-y-1 text-muted list-disc list-inside">
            <li>Google Lighthouse (Accessibility score target: 100)</li>
            <li>axe-core via browser extension</li>
            <li>Apple VoiceOver (macOS + iOS)</li>
            <li>NVDA + Firefox (Windows)</li>
            <li>Keyboard-only navigation review on every release</li>
          </ul>
        </section>

        {/* Formal complaints */}
        <section aria-labelledby="formal-heading" className="mt-10">
          <h2 id="formal-heading" className="text-xl font-semibold text-ink">Formal complaints</h2>
          <p className="mt-3 text-muted leading-relaxed">
            If you are not satisfied with our response, you may contact your country's relevant
            enforcement body. In the United States, this is the{' '}
            <a href="https://www.ada.gov/" target="_blank" rel="noreferrer" className="text-primary underline hover:no-underline inline-flex items-center gap-1">
              ADA National Network <ExternalLink size={12} aria-label="(opens in new tab)" />
            </a>.
            In the EU, contact your national accessibility authority under the{' '}
            <a href="https://ec.europa.eu/social/main.jsp?catId=1202" target="_blank" rel="noreferrer" className="text-primary underline hover:no-underline inline-flex items-center gap-1">
              European Accessibility Act <ExternalLink size={12} aria-label="(opens in new tab)" />
            </a>.
          </p>
        </section>

        <p className="mt-12 text-sm text-muted border-t border-border pt-6">
          This statement was prepared in June 2026 and will be reviewed every 6 months.
          <Link to="/" className="ml-3 text-primary underline hover:no-underline">← Back to AccessMap</Link>
        </p>
      </main>
    </Layout>
  )
}
