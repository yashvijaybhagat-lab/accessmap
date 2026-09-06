import { NavLink, useLocation } from 'react-router-dom'
import { Map as MapIcon, Search, Route as RouteIcon, Bell, User } from 'lucide-react'
import { useStore } from '../store/useStore'

const NAVY = '#070B18'
const TEAL = '#0ABFBF'

type Item = { label: string; icon: typeof MapIcon } & (
  | { to: string; action?: never }
  | { action: 'search'; to?: never }
)

const ITEMS: Item[] = [
  { to: '/', label: 'Map', icon: MapIcon },
  { action: 'search', label: 'Search', icon: Search },
  { to: '/route', label: 'Routes', icon: RouteIcon },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/profile', label: 'Profile', icon: User },
]

/**
 * Persistent bottom navigation — present on every primary screen at every
 * breakpoint. Lives in <AppShell> so it never re-mounts on navigation. Teal
 * active state on a navy bar.
 */
export default function BottomNav() {
  const searchOpen = useStore((s) => s.searchOpen)
  const setSearchOpen = useStore((s) => s.setSearchOpen)
  const { pathname } = useLocation()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[850] flex justify-center"
      style={{ background: NAVY, paddingBottom: 'env(safe-area-inset-bottom)', borderTop: '1px solid rgba(255,255,255,0.08)' }}
      aria-label="Primary"
    >
      <div className="flex w-full max-w-md">
        {ITEMS.map((item) => {
          const Icon = item.icon

          if (item.action === 'search') {
            const active = searchOpen
            return (
              <button
                key="search"
                onClick={() => setSearchOpen(!searchOpen)}
                aria-label="Search"
                aria-pressed={active}
                className="relative flex flex-1 flex-col items-center justify-center gap-1 pb-1.5 pt-2 text-[10px] font-semibold"
                style={{ color: active ? TEAL : 'rgba(255,255,255,0.55)', minHeight: 52 }}
              >
                {active && <span className="absolute top-0 h-0.5 w-8 rounded-full" style={{ background: TEAL }} />}
                <Icon size={22} strokeWidth={active ? 2.6 : 1.9} />
                Search
              </button>
            )
          }

          const isMap = item.to === '/'
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={isMap}
              aria-label={item.label}
              className="relative flex flex-1 flex-col items-center justify-center gap-1 pb-1.5 pt-2 text-[10px] font-semibold"
              style={({ isActive }) => {
                // While search is open it owns the active state; the /map alias also lights the Map tab.
                const active = !searchOpen && (isActive || (isMap && pathname === '/map'))
                return { color: active ? TEAL : 'rgba(255,255,255,0.55)', minHeight: 52 }
              }}
            >
              {({ isActive }) => {
                const active = !searchOpen && (isActive || (isMap && pathname === '/map'))
                return (
                  <>
                    {active && <span className="absolute top-0 h-0.5 w-8 rounded-full" style={{ background: TEAL }} />}
                    <Icon size={22} strokeWidth={active ? 2.6 : 1.9} />
                    {item.label}
                  </>
                )
              }}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
