import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  X, Mountain, ScanLine, Truck, Ear, GraduationCap, AlertOctagon,
  Flag, Star, Building2, Scale, Globe, UserCog, Accessibility, Sparkles,
  ShieldCheck, Info,
} from 'lucide-react'
import BrandPin from './MapPin'
import NeedsSetup from './NeedsSetup'
import { useStore } from '../store/useStore'
import { useFocusTrap } from '../lib/useFocusTrap'
import { useReducedMotion, sheetTransition } from '../lib/useAppMotion'
import { hasProfile } from '../lib/compatibility'

type Row = { to: string; label: string; icon: typeof Mountain }

const EXPLORE: Row[] = [
  { to: '/trails', label: 'Trails', icon: Mountain },
  { to: '/scan', label: 'Scan a place', icon: ScanLine },
  { to: '/truck', label: 'Truck routing', icon: Truck },
  { to: '/sensory', label: 'Sensory map', icon: Ear },
  { to: '/schools', label: 'Accessible schools', icon: GraduationCap },
  { to: '/disaster', label: 'Disaster access', icon: AlertOctagon },
]
const CONTRIBUTE: Row[] = [
  { to: '/report', label: 'Report a barrier', icon: Flag },
  { to: '/submit-review', label: 'Write a review', icon: Star },
]
const ORGS: Row[] = [
  { to: '/for-business', label: 'For Business', icon: Building2 },
  { to: '/councils', label: 'For Councils', icon: Globe },
  { to: '/accountability', label: 'ADA Accountability', icon: Scale },
  { to: '/business', label: 'List your business', icon: Building2 },
]
const FOOTER: Row[] = [
  { to: '/about', label: 'About AccessMap', icon: Info },
  { to: '/accessibility', label: 'Accessibility statement', icon: Accessibility },
  { to: '/privacy', label: 'Privacy', icon: ShieldCheck },
  { to: '/terms', label: 'Terms', icon: ShieldCheck },
]

const rowCls =
  'flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink transition-colors hover:bg-surface aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary'

function Section({ title, rows, onNavigate }: { title: string; rows: Row[]; onNavigate: () => void }) {
  return (
    <div className="px-2 py-2">
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</p>
      {rows.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} onClick={onNavigate} className={rowCls}>
          <Icon size={17} className="shrink-0 text-muted" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </div>
  )
}

export default function MenuDrawer() {
  const reduced = useReducedMotion()
  const open = useStore((s) => s.menuOpen)
  const setOpen = useStore((s) => s.setMenuOpen)
  const user = useStore((s) => s.user)
  const easyMode = useStore((s) => s.easyMode)
  const toggleEasyMode = useStore((s) => s.toggleEasyMode)
  const needsProfile = useStore((s) => s.needsProfile)
  const profileSet = hasProfile(needsProfile)
  const { pathname } = useLocation()
  const [showNeeds, setShowNeeds] = useState(false)
  const trapRef = useFocusTrap<HTMLDivElement>(open)

  // Close on route change
  useEffect(() => { setOpen(false) }, [pathname, setOpen])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  const close = () => setOpen(false)

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[950]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
          >
            <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden="true" />
            <motion.div
              ref={trapRef}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-white shadow-2xl"
              style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 4rem)' }}
              initial={{ x: reduced ? 0 : '-100%' }} animate={{ x: 0 }} exit={{ x: reduced ? 0 : '-100%' }}
              transition={sheetTransition(reduced)}
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <BrandPin size={26} pulse={false} />
                  <span className="text-[15px] font-bold tracking-tight text-ink">Access<span className="text-primary">Map</span></span>
                </div>
                <button onClick={close} aria-label="Close menu" className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink">
                  <X size={20} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border">
                {/* Settings */}
                <div className="px-2 py-2">
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">My settings</p>
                  <button onClick={() => setShowNeeds(true)} className={rowCls + ' w-full text-left'}>
                    <UserCog size={17} className="shrink-0 text-muted" aria-hidden="true" />
                    <span className="flex-1">My Needs</span>
                    {profileSet && <span className="text-xs font-semibold text-emerald-600">Set ✓</span>}
                  </button>
                  <button onClick={toggleEasyMode} aria-pressed={easyMode} className={rowCls + ' w-full text-left'}>
                    <Accessibility size={17} className="shrink-0 text-muted" aria-hidden="true" />
                    <span className="flex-1">Accessibility mode</span>
                    <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${easyMode ? 'bg-primary' : 'bg-border'}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${easyMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </span>
                  </button>
                  <button
                    onClick={() => { close(); window.dispatchEvent(new CustomEvent('am:open-a11y')) }}
                    className={rowCls + ' w-full text-left'}
                  >
                    <Sparkles size={17} className="shrink-0 text-muted" aria-hidden="true" />
                    Adjust my experience
                  </button>
                </div>

                <Section title="Explore" rows={EXPLORE} onNavigate={close} />
                <Section title="Contribute" rows={CONTRIBUTE} onNavigate={close} />
                <Section title="For organisations" rows={ORGS} onNavigate={close} />

                {user?.role === 'admin' && (
                  <div className="px-2 py-2">
                    <NavLink to="/admin" onClick={close} className={rowCls}>
                      <ShieldCheck size={17} className="shrink-0 text-muted" aria-hidden="true" /> Admin
                    </NavLink>
                  </div>
                )}

                <Section title="About" rows={FOOTER} onNavigate={close} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showNeeds && <NeedsSetup onClose={() => setShowNeeds(false)} />}
    </>
  )
}
