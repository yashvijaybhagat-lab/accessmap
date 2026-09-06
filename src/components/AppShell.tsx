import { Suspense, lazy } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import TopBar from './TopBar'
import BottomNav from './BottomNav'
import MenuDrawer from './MenuDrawer'
import SearchOverlay from './SearchOverlay'
import { useReducedMotion } from '../lib/useAppMotion'
import { useScrollToTop } from '../lib/useScrollToTop'
import {
  MapSkeleton, PlaceDetailSkeleton, ProfileSkeleton, RouteSkeleton, ReviewSkeleton,
  ReportSkeleton, ForBusinessSkeleton, TextPageSkeleton, AdminSkeleton, ScanSkeleton,
  BusinessRegisterSkeleton, TrailsSkeleton, GenericPageSkeleton, HomeSkeleton,
} from './Skeletons'

const MapPage          = lazy(() => import('../pages/MapPage'))
const Home             = lazy(() => import('../pages/Home'))
const PlaceDetail      = lazy(() => import('../pages/PlaceDetail'))
const RoutePlanner     = lazy(() => import('../pages/RoutePlanner'))
const Report           = lazy(() => import('../pages/Report'))
const SubmitReview     = lazy(() => import('../pages/SubmitReview'))
const Profile          = lazy(() => import('../pages/Profile'))
const Admin            = lazy(() => import('../pages/Admin'))
const BusinessRegister = lazy(() => import('../pages/BusinessRegister'))
const Privacy          = lazy(() => import('../pages/Privacy'))
const Terms            = lazy(() => import('../pages/Terms'))
const Councils         = lazy(() => import('../pages/Councils'))
const Security         = lazy(() => import('../pages/Security'))
const Accessibility    = lazy(() => import('../pages/Accessibility'))
const ForBusiness      = lazy(() => import('../pages/ForBusiness'))
const ScanPage         = lazy(() => import('../pages/ScanPage'))
const TrailsPage       = lazy(() => import('../pages/TrailsPage'))
const TruckRouter      = lazy(() => import('../pages/TruckRouter'))
const Accountability   = lazy(() => import('../pages/Accountability'))
const SensoryMap       = lazy(() => import('../pages/SensoryMap'))
const SchoolsMap       = lazy(() => import('../pages/SchoolsMap'))
const DisasterLayer    = lazy(() => import('../pages/DisasterLayer'))
const IndoorMapPage    = lazy(() => import('../pages/IndoorMapPage'))
const BusinessClaim    = lazy(() => import('../pages/BusinessClaim'))
const AlertsFeed       = lazy(() => import('../pages/AlertsFeed'))

function S({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  return <Suspense fallback={fallback}>{children}</Suspense>
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <h1 className="text-xl font-semibold">This page doesn't exist</h1>
      <p className="max-w-sm text-muted">The link may be broken, or the page may have moved.</p>
    </div>
  )
}

export default function AppShell() {
  const location = useLocation()
  const reduced = useReducedMotion()
  useScrollToTop()

  const mapScreen = location.pathname === '/' || location.pathname === '/map'

  // Mobile-only slide; desktop / reduced-motion is instant.
  const isNarrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
  const animate = isNarrow && !reduced
  const variants = {
    initial: animate ? { x: '100%', opacity: 1 } : { opacity: 0 },
    in: { x: 0, opacity: 1 },
    out: animate ? { x: '-30%', opacity: 0 } : { opacity: 0 },
  }

  return (
    <div
      className="app-shell min-h-screen"
      style={{
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <TopBar />

      {/* The map is always mounted so Leaflet never re-initialises and the
          view (pan/zoom/location) survives navigating away and back. */}
      <div
        className={mapScreen ? '' : 'pointer-events-none'}
        style={mapScreen ? undefined : { visibility: 'hidden', position: 'fixed', inset: 0 }}
        aria-hidden={!mapScreen}
      >
        <S fallback={<MapSkeleton />}><MapPage /></S>
      </div>

      {/* Every other screen slides in over the (hidden) map. */}
      {!mapScreen && (
        <div className="relative min-h-screen overflow-x-hidden bg-bg">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={location.pathname}
              variants={variants}
              initial="initial"
              animate="in"
              exit="out"
              transition={{ duration: reduced ? 0 : 0.2, ease: [0.4, 0, 0.2, 1] }}
            >
              <Routes location={location}>
                <Route path="/about"          element={<S fallback={<HomeSkeleton />}><Home /></S>} />
                <Route path="/place/:id"      element={<S fallback={<PlaceDetailSkeleton />}><PlaceDetail /></S>} />
                <Route path="/route"          element={<S fallback={<RouteSkeleton />}><RoutePlanner /></S>} />
                <Route path="/truck"          element={<S fallback={<RouteSkeleton />}><TruckRouter /></S>} />
                <Route path="/report"         element={<S fallback={<ReportSkeleton />}><Report /></S>} />
                <Route path="/submit-review"  element={<S fallback={<ReviewSkeleton />}><SubmitReview /></S>} />
                <Route path="/scan"           element={<S fallback={<ScanSkeleton />}><ScanPage /></S>} />
                <Route path="/trails"         element={<S fallback={<TrailsSkeleton />}><TrailsPage /></S>} />
                <Route path="/alerts"         element={<S fallback={<GenericPageSkeleton />}><AlertsFeed /></S>} />
                <Route path="/profile"        element={<S fallback={<ProfileSkeleton />}><Profile /></S>} />
                <Route path="/for-business"   element={<S fallback={<ForBusinessSkeleton />}><ForBusiness /></S>} />
                <Route path="/business"       element={<S fallback={<BusinessRegisterSkeleton />}><BusinessRegister /></S>} />
                <Route path="/admin"          element={<S fallback={<AdminSkeleton />}><Admin /></S>} />
                <Route path="/privacy"        element={<S fallback={<TextPageSkeleton />}><Privacy /></S>} />
                <Route path="/terms"          element={<S fallback={<TextPageSkeleton />}><Terms /></S>} />
                <Route path="/accessibility"  element={<S fallback={<TextPageSkeleton />}><Accessibility /></S>} />
                <Route path="/councils"       element={<S fallback={<TextPageSkeleton />}><Councils /></S>} />
                <Route path="/security"       element={<S fallback={<TextPageSkeleton />}><Security /></S>} />
                <Route path="/accountability" element={<S fallback={<GenericPageSkeleton />}><Accountability /></S>} />
                <Route path="/sensory"        element={<S fallback={<GenericPageSkeleton />}><SensoryMap /></S>} />
                <Route path="/schools"        element={<S fallback={<GenericPageSkeleton />}><SchoolsMap /></S>} />
                <Route path="/disaster"       element={<S fallback={<GenericPageSkeleton />}><DisasterLayer /></S>} />
                <Route path="/place/:id/indoor" element={<S fallback={<GenericPageSkeleton />}><IndoorMapPage /></S>} />
                <Route path="/claim"          element={<S fallback={<GenericPageSkeleton />}><BusinessClaim /></S>} />
                <Route path="*"               element={<NotFound />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      <BottomNav />
      <MenuDrawer />
      <SearchOverlay />
    </div>
  )
}
