import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'

/**
 * Add-to-home-screen prompt for the mobile demo.
 *
 *   • Android / Chromium — captures `beforeinstallprompt` and offers a native
 *     install button.
 *   • iOS Safari — no such event, so we show the manual "Share → Add to Home
 *     Screen" hint instead.
 *
 * Hidden when already running standalone, and stays dismissed for 30 days.
 */
const DISMISS_KEY = 'am-install-dismissed'
const DISMISS_DAYS = 30

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function recentlyDismissed() {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY))
    return ts > 0 && Date.now() - ts < DISMISS_DAYS * 864e5
  } catch {
    return false
  }
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)
  const [show, setShow] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return

    const onBIP = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BIPEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onBIP)

    const ua = navigator.userAgent
    const isIOS = /iphone|ipad|ipod/i.test(ua)
    const isSafari = /^((?!chrome|crios|fxios|android).)*safari/i.test(ua)
    if (isIOS && isSafari) {
      setIosHint(true)
      setShow(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', onBIP)
  }, [])

  if (!show) return null

  const dismiss = () => {
    setShow(false)
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
    dismiss()
  }

  return (
    <div
      role="dialog"
      aria-label="Install AccessMap"
      className="fixed inset-x-3 z-[880] mx-auto max-w-md rounded-2xl border border-black/5 bg-white p-4 shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
      style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
    >
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-full p-1.5 text-muted hover:bg-surface"
      >
        <X size={16} />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <img src="/icon-192.png" alt="" width={44} height={44} className="shrink-0 rounded-xl" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Install AccessMap</p>
          {iosHint ? (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-[13px] leading-snug text-muted">
              Tap <Share size={14} className="inline align-text-bottom text-primary" /> then
              <span className="font-medium text-ink">&nbsp;Add to Home Screen</span>
            </p>
          ) : (
            <p className="mt-1 text-[13px] leading-snug text-muted">
              Full-screen, works offline, one tap from your home screen.
            </p>
          )}
        </div>
      </div>

      {!iosHint && (
        <button onClick={install} className="btn-primary mt-3 w-full">
          <Download size={16} /> Add to home screen
        </button>
      )}
    </div>
  )
}
