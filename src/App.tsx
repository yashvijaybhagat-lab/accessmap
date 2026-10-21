import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from './store/useStore'
import { startAgencyAlertSync } from './lib/data'
import AppShell from './components/AppShell'
import AccessibilityPanel from './components/AccessibilityPanel'
import ErrorBoundary from './components/ErrorBoundary'
import ConnectionStatus from './components/ConnectionStatus'
import InstallPrompt from './components/InstallPrompt'

export default function App() {
  const initAuth = useStore((s) => s.initAuth)
  const location = useLocation()
  useEffect(() => { initAuth() }, [initAuth])
  useEffect(() => startAgencyAlertSync(), [])

  // "/" opens search from anywhere (unless the user is typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      e.preventDefault()
      useStore.getState().setSearchOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <ErrorBoundary resetKey={location.pathname}>
        <AppShell />
      </ErrorBoundary>
      <AccessibilityPanel />
      <ConnectionStatus />
      <InstallPrompt />
    </>
  )
}
