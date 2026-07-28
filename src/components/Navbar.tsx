import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Route as RouteIcon, Flag, Star, User, ShieldCheck, Map as MapIcon, Accessibility, UserCog, LogIn, ScanLine, Mountain, Truck, Scale } from 'lucide-react'
import MapPin from './MapPin'
import { useStore } from '../store/useStore'
import { hasProfile } from '../lib/compatibility'
import NeedsSetup from './NeedsSetup'
import AuthModal from './AuthModal'

const navCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
    isActive
      ? 'bg-primary/8 text-primary'
      : 'text-muted hover:text-ink hover:bg-black/5'
  }`

export default function Navbar() {
  const user          = useStore(s => s.user)
  const easyMode      = useStore(s => s.easyMode)
  const toggleEasyMode = useStore(s => s.toggleEasyMode)
  const needsProfile  = useStore(s => s.needsProfile)
  const [showNeeds, setShowNeeds] = useState(false)
  const [showAuth,  setShowAuth]  = useState(false)
  const profileSet = hasProfile(needsProfile)

  const links = [
    { to: '/map',           label: 'Map',    icon: MapIcon   },
    { to: '/trails',        label: 'Trails', icon: Mountain  },
    { to: '/scan',          label: 'Scan',   icon: ScanLine  },
    { to: '/route',         label: 'Route',  icon: RouteIcon },
    { to: '/truck',         label: 'Trucks', icon: Truck     },
    { to: '/report',         label: 'Report',  icon: Flag  },
    { to: '/submit-review',  label: 'Review',  icon: Star  },
    { to: '/accountability', label: 'ADA',     icon: Scale },
  ]

  return (
    <>
      <a href="#main-content" className="skip-nav">Skip to main content</a>

      <header
        className="fixed inset-x-0 top-0 z-[900] border-b border-black/5 bg-white/80 backdrop-blur-xl"
        style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06)' }}
      >
        <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6" aria-label="Main navigation">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="AccessMap home">
            <MapPin size={28} pulse={false} />
            <span className="text-[16px] font-bold tracking-tight text-ink">
              Access<span className="text-primary">Map</span>
            </span>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-0.5">
            <div className="hidden md:flex items-center gap-0.5 mr-2">
              {links.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={navCls}>
                  <Icon size={14} aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              ))}
              {user?.role === 'admin' && (
                <NavLink to="/admin" className={navCls}>
                  <ShieldCheck size={14} aria-hidden="true" />
                  <span>Admin</span>
                </NavLink>
              )}
            </div>

            {/* Mobile nav — icons only */}
            <div className="flex md:hidden items-center gap-0.5 mr-1">
              {links.slice(0, 3).map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} aria-label={label} className={navCls}>
                  <Icon size={16} aria-hidden="true" />
                </NavLink>
              ))}
            </div>

            {/* My Needs */}
            <button
              onClick={() => setShowNeeds(true)}
              aria-label={profileSet ? 'Edit accessibility needs' : 'Set accessibility needs'}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
                profileSet
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border border-dashed border-primary/30 text-primary hover:bg-primary/5'
              }`}
            >
              <UserCog size={14} aria-hidden="true" />
              <span className="hidden sm:inline">
                {profileSet
                  ? (needsProfile.name ? `${needsProfile.name.split(' ')[0]} ✓` : 'My Needs ✓')
                  : 'My Needs'}
              </span>
            </button>

            {/* Accessibility toggle */}
            <button
              onClick={toggleEasyMode}
              aria-pressed={easyMode}
              aria-label={easyMode ? 'Turn off accessibility mode' : 'Turn on accessibility mode'}
              className={`ml-1 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
                easyMode
                  ? 'bg-primary text-white shadow-sm'
                  : 'border border-border text-muted hover:text-ink hover:border-[#d1d5db]'
              }`}
            >
              <Accessibility size={14} aria-hidden="true" />
              <span className="hidden lg:inline">{easyMode ? 'Accessibility On' : 'Accessibility'}</span>
            </button>

            {/* Auth */}
            {user ? (
              <NavLink
                to="/profile"
                className="ml-2 shrink-0"
                aria-label={`Your profile — ${user.displayName}`}
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    className="h-8 w-8 rounded-full border-2 border-white shadow-sm ring-1 ring-black/10"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-muted hover:bg-[#eef0f3] transition-colors">
                    <User size={15} aria-hidden="true" />
                  </span>
                )}
              </NavLink>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="ml-2 flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#1557b0] transition-colors shadow-sm"
              >
                <LogIn size={14} aria-hidden="true" />
                <span className="hidden sm:inline">Sign in</span>
              </button>
            )}
          </div>
        </nav>

        {easyMode && (
          <div role="status" aria-live="polite" className="bg-primary px-4 py-1.5 text-center text-xs font-semibold text-white tracking-wide">
            Accessibility mode on — larger text, high contrast, bigger tap targets
          </div>
        )}
      </header>

      {showNeeds && <NeedsSetup onClose={() => setShowNeeds(false)} />}
      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
    </>
  )
}
