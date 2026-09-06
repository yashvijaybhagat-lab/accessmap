import { NavLink } from 'react-router-dom'
import { Map as MapIcon, Route as RouteIcon, Flag, Star, Scale } from 'lucide-react'

const links = [
  { to: '/map',            label: 'Map',    icon: MapIcon   },
  { to: '/route',          label: 'Route',  icon: RouteIcon },
  { to: '/report',         label: 'Report', icon: Flag      },
  { to: '/submit-review',  label: 'Review', icon: Star      },
  { to: '/accountability', label: 'ADA',    icon: Scale     },
]

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-[850] flex sm:hidden bg-white/95 backdrop-blur-md border-t border-[#e8eaed]"
      style={{ boxShadow: '0 -1px 0 #e8eaed, 0 -2px 8px rgba(60,64,67,0.08)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Mobile navigation"
    >
      {links.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
              isActive ? 'text-primary' : 'text-[#9aa0a6]'
            }`
          }
          aria-label={label}
        >
          {({ isActive }) => (
            <>
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
