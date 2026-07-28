/** Shared pulse base */
const P = ({ className }: { className: string }) => (
  <div className={`animate-pulse rounded-lg bg-[#e8eaed] ${className}`} />
)

// ─── Generic card row ─────────────────────────────────────────────────────────
function CardRows({ n = 3 }: { n?: number }) {
  return (
    <div className="space-y-3">
      {[...Array(n)].map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-white p-5 space-y-2.5">
          <P className="h-4 w-1/3" />
          <P className="h-3 w-full" />
          <P className="h-3 w-5/6" />
        </div>
      ))}
    </div>
  )
}

// ─── Home ─────────────────────────────────────────────────────────────────────
export function HomeSkeleton() {
  return (
    <div className="mx-3 mt-3" aria-busy="true" aria-label="Loading home page">
      {/* Hero */}
      <div className="h-[500px] rounded-3xl bg-[#0d1117] animate-pulse" />
      {/* Stats strip */}
      <div className="mt-4 grid grid-cols-4 gap-0 border border-border rounded-2xl overflow-hidden bg-white">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="px-6 py-8 text-center space-y-2 border-r border-border last:border-0">
            <P className="h-8 w-16 mx-auto" />
            <P className="h-3 w-24 mx-auto" />
          </div>
        ))}
      </div>
      {/* Content rows */}
      <div className="mx-auto max-w-5xl px-6 py-12 space-y-4">
        <P className="h-6 w-48" />
        <P className="h-4 w-full max-w-xl" />
        <P className="h-4 w-full max-w-lg" />
        <div className="grid grid-cols-3 gap-4 mt-6">
          {[...Array(3)].map((_, i) => <P key={i} className="h-40 rounded-2xl" />)}
        </div>
      </div>
    </div>
  )
}

// ─── Map ──────────────────────────────────────────────────────────────────────
export function MapSkeleton() {
  return (
    <div className="flex h-[calc(100vh-56px)] w-full" aria-busy="true" aria-label="Loading map">
      {/* Sidebar */}
      <div className="hidden sm:flex w-80 flex-col gap-3 border-r border-border bg-white p-4">
        <P className="h-10 w-full rounded-full" />
        <div className="flex gap-2">
          {[...Array(3)].map((_, i) => <P key={i} className="h-8 w-20 rounded-full" />)}
        </div>
        <CardRows n={5} />
      </div>
      {/* Map tile */}
      <div className="flex-1 bg-[#e8eaed] animate-pulse relative">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="space-y-2 text-center">
            <div className="h-10 w-10 rounded-full bg-[#d1d5db] mx-auto animate-pulse" />
            <P className="h-3 w-24 mx-auto" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Place detail ─────────────────────────────────────────────────────────────
export function PlaceDetailSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-5" aria-busy="true" aria-label="Loading place details">
      <P className="h-5 w-32" />
      <div className="flex gap-4 items-start">
        <div className="flex-1 space-y-3">
          <P className="h-8 w-2/3" />
          <P className="h-4 w-1/2" />
        </div>
        <P className="h-20 w-20 rounded-2xl shrink-0" />
      </div>
      {/* Score rings */}
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-white p-4 flex flex-col items-center gap-2">
            <P className="h-16 w-16 rounded-full" />
            <P className="h-3 w-14" />
          </div>
        ))}
      </div>
      {/* Info card */}
      <div className="rounded-2xl border border-border bg-white p-5 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex justify-between">
            <P className="h-3 w-28" />
            <P className="h-3 w-20" />
          </div>
        ))}
      </div>
      {/* Specs */}
      <div className="rounded-2xl border border-border bg-white p-5 space-y-3">
        <P className="h-5 w-36" />
        {[...Array(4)].map((_, i) => <P key={i} className="h-3 w-full" />)}
      </div>
    </div>
  )
}

// ─── Profile ──────────────────────────────────────────────────────────────────
export function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-6" aria-busy="true" aria-label="Loading profile">
      <div className="flex items-center gap-4">
        <P className="h-16 w-16 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <P className="h-5 w-40" />
          <P className="h-3 w-52" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-white p-4 space-y-2">
            <P className="h-6 w-12" />
            <P className="h-3 w-20" />
          </div>
        ))}
      </div>
      <CardRows n={3} />
    </div>
  )
}

// ─── Route planner ────────────────────────────────────────────────────────────
export function RouteSkeleton() {
  return (
    <div className="flex h-[calc(100vh-56px)]" aria-busy="true" aria-label="Loading route planner">
      <div className="w-80 border-r border-border bg-white p-4 space-y-3">
        <P className="h-5 w-36" />
        <P className="h-10 w-full rounded-xl" />
        <P className="h-10 w-full rounded-xl" />
        <P className="h-10 w-full rounded-full" />
        <div className="pt-4 space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-3 items-center">
              <P className="h-8 w-8 rounded-full shrink-0" />
              <P className="h-3 flex-1" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 bg-[#e8eaed] animate-pulse" />
    </div>
  )
}

// ─── Submit review ────────────────────────────────────────────────────────────
export function ReviewSkeleton() {
  return (
    <div className="mx-auto max-w-lg px-6 py-10 space-y-5" aria-busy="true" aria-label="Loading review form">
      <P className="h-8 w-48" />
      <P className="h-4 w-72" />
      <div className="rounded-2xl border border-border bg-white p-6 space-y-4">
        <P className="h-10 w-full rounded-xl" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-1.5">
            <P className="h-3 w-20" />
            <P className="h-4 w-full rounded-full" />
          </div>
        ))}
        <P className="h-24 w-full rounded-xl" />
        <P className="h-11 w-full rounded-full" />
      </div>
    </div>
  )
}

// ─── Report ───────────────────────────────────────────────────────────────────
export function ReportSkeleton() {
  return (
    <div className="mx-auto max-w-lg px-6 py-10 space-y-5" aria-busy="true" aria-label="Loading report form">
      <P className="h-8 w-40" />
      <P className="h-4 w-64" />
      <div className="rounded-2xl border border-border bg-white p-6 space-y-4">
        <P className="h-10 w-full rounded-xl" />
        <div className="grid grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <P key={i} className="h-16 rounded-xl" />)}
        </div>
        <P className="h-24 w-full rounded-xl" />
        <P className="h-11 w-full rounded-full" />
      </div>
    </div>
  )
}

// ─── For Business ─────────────────────────────────────────────────────────────
export function ForBusinessSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading for business page">
      <div className="h-72 bg-[#0d1117] animate-pulse" />
      <div className="mx-auto max-w-5xl px-6 py-12 space-y-4">
        <P className="h-6 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <P key={i} className="h-36 rounded-2xl" />)}
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => <P key={i} className="h-14 rounded-xl" />)}
        </div>
      </div>
    </div>
  )
}

// ─── Generic text page (Privacy, Terms, Accessibility, Councils, Security) ────
export function TextPageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 space-y-4" aria-busy="true" aria-label="Loading page">
      <P className="h-8 w-64" />
      <P className="h-3 w-32" />
      <div className="space-y-2 mt-6">
        {[...Array(12)].map((_, i) => (
          <P key={i} className={`h-3 ${i % 5 === 4 ? 'w-3/4' : 'w-full'}`} />
        ))}
      </div>
      <div className="pt-4 space-y-2">
        <P className="h-5 w-48" />
        {[...Array(8)].map((_, i) => (
          <P key={i} className={`h-3 ${i % 4 === 3 ? 'w-2/3' : 'w-full'}`} />
        ))}
      </div>
    </div>
  )
}

// ─── Admin ────────────────────────────────────────────────────────────────────
export function AdminSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10 space-y-5" aria-busy="true" aria-label="Loading admin panel">
      <P className="h-8 w-36" />
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-white p-5 space-y-2">
            <P className="h-7 w-16" />
            <P className="h-3 w-24" />
          </div>
        ))}
      </div>
      <CardRows n={6} />
    </div>
  )
}

// ─── Scan ─────────────────────────────────────────────────────────────────────
export function ScanSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-5" aria-busy="true" aria-label="Loading scanner">
      <P className="h-8 w-56" />
      <P className="h-4 w-full max-w-md" />
      <P className="h-4 w-5/6 max-w-sm" />
      <div className="grid grid-cols-2 gap-3 mt-4">
        <P className="h-52 rounded-2xl" />
        <P className="h-52 rounded-2xl" />
      </div>
    </div>
  )
}

// ─── Trails ───────────────────────────────────────────────────────────────────
export function TrailsSkeleton() {
  return (
    <div className="flex h-[calc(100vh-56px)]" aria-busy="true" aria-label="Loading trails">
      <div className="w-[22rem] border-r border-border bg-white p-4 space-y-3">
        <P className="h-6 w-40" />
        <P className="h-3 w-32" />
        <div className="grid grid-cols-3 gap-2 mt-2">
          {[...Array(3)].map((_, i) => <P key={i} className="h-14 rounded-xl" />)}
        </div>
        <div className="flex gap-2 flex-wrap pt-2">
          {[...Array(5)].map((_, i) => <P key={i} className="h-6 w-16 rounded-full" />)}
        </div>
        <div className="space-y-3 pt-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <P className="h-4 w-3/4" />
              <P className="h-3 w-full" />
              <P className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 bg-[#e8eaed] animate-pulse" />
    </div>
  )
}

// ─── Business register ────────────────────────────────────────────────────────
export function BusinessRegisterSkeleton() {
  return (
    <div className="mx-auto max-w-lg px-6 py-10 space-y-5" aria-busy="true" aria-label="Loading form">
      <P className="h-8 w-56" />
      <P className="h-4 w-72" />
      <div className="rounded-2xl border border-border bg-white p-6 space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="space-y-1.5">
            <P className="h-3 w-24" />
            <P className="h-10 w-full rounded-xl" />
          </div>
        ))}
        <P className="h-11 w-full rounded-full" />
      </div>
    </div>
  )
}

export function GenericPageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-[#e8eaed]" />
      <div className="h-4 w-full rounded-lg bg-[#e8eaed]" />
      <div className="h-4 w-3/4 rounded-lg bg-[#e8eaed]" />
      <div className="grid grid-cols-3 gap-3 mt-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-[#e8eaed]" />)}
      </div>
      {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-[#e8eaed]" />)}
    </div>
  )
}
