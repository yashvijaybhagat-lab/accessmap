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
