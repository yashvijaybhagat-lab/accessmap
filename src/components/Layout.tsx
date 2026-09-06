import type { ReactNode } from 'react'
import Navbar from './Navbar'
import BottomNav from './BottomNav'

export default function Layout({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  return (
    <div className="min-h-screen">
      <Navbar />
      {bare ? (
        <main
          id="main-content"
          className="pb-16 sm:pb-0"
          style={{ paddingTop: 'var(--app-header-h, 56px)' }}
        >{children}</main>
      ) : (
        <main
          id="main-content"
          className="mx-auto max-w-5xl animate-page-in px-4 pb-28 sm:pb-24"
          style={{ paddingTop: 'calc(var(--app-header-h, 64px) + 1.5rem)' }}
        >{children}</main>
      )}
      <BottomNav />
    </div>
  )
}
