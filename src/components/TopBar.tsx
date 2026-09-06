import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, Search, User, LogIn } from 'lucide-react'
import AuthModal from './AuthModal'
import { useStore } from '../store/useStore'

/**
 * Slim, persistent top bar: hamburger (opens the menu drawer) · tappable search
 * pill (opens the full-screen search overlay) · account avatar. On the map
 * screens it floats over a full-bleed map; elsewhere it's a solid strip.
 * Publishes its rendered height as `--app-header-h` for pages that offset by it.
 */
export default function TopBar() {
  const { pathname } = useLocation()
  const mapScreen = pathname === '/' || pathname === '/map'

  const user = useStore((s) => s.user)
  const setMenuOpen = useStore((s) => s.setMenuOpen)
  const setSearchOpen = useStore((s) => s.setSearchOpen)
  const [showAuth, setShowAuth] = useState(false)

  const headerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const publish = () =>
      document.documentElement.style.setProperty('--app-header-h', `${el.offsetHeight}px`)
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    window.addEventListener('resize', publish)
    return () => { ro.disconnect(); window.removeEventListener('resize', publish) }
  }, [])

  return (
    <>
      <a href="#main-content" className="skip-nav">Skip to main content</a>

      <header
        ref={headerRef}
        className={`fixed inset-x-0 top-0 z-[900] ${
          mapScreen ? 'bg-transparent' : 'border-b border-black/5 bg-white/90 backdrop-blur-xl'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-3">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink ${
              mapScreen ? 'bg-white shadow-[0_2px_10px_rgba(0,0,0,0.18)]' : 'hover:bg-surface'
            }`}
          >
            <Menu size={20} aria-hidden="true" />
          </button>

          <button
            onClick={() => setSearchOpen(true)}
            className={`flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full px-4 text-left text-[15px] text-muted ${
              mapScreen
                ? 'bg-white shadow-[0_2px_10px_rgba(0,0,0,0.18)]'
                : 'border border-border bg-white'
            }`}
          >
            <Search size={17} className="shrink-0 text-[#9aa0a6]" aria-hidden="true" />
            <span className="truncate">Search places, addresses…</span>
          </button>

          {user ? (
            <Link
              to="/profile"
              aria-label={`Your profile — ${user.displayName}`}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                mapScreen ? 'bg-white shadow-[0_2px_10px_rgba(0,0,0,0.18)]' : ''
              }`}
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full ring-1 ring-black/10" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-muted">
                  <User size={16} aria-hidden="true" />
                </span>
              )}
            </Link>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              aria-label="Sign in"
              className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ${
                mapScreen
                  ? 'bg-white text-ink shadow-[0_2px_10px_rgba(0,0,0,0.18)]'
                  : 'bg-primary text-white'
              }`}
            >
              <LogIn size={17} aria-hidden="true" />
              <span className="hidden sm:inline">Sign in</span>
            </button>
          )}
        </div>
      </header>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
    </>
  )
}
