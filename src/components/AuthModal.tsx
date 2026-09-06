import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { X, LogIn, Mail, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useStore } from '../store/useStore'

interface Props {
  open: boolean
  onClose: () => void
}

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" />
    <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z" />
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z" />
  </svg>
)

type Tab = 'google' | 'email'

export default function AuthModal({ open, onClose }: Props) {
  const signInGoogle = useStore(s => s.signInGoogle)
  const signInEmail = useStore(s => s.signInEmail)
  const user = useStore(s => s.user)

  const [tab, setTab] = useState<Tab>('google')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const dialogRef = useRef<HTMLDialogElement>(null)
  const firstFocusRef = useRef<HTMLButtonElement>(null)

  // Close on successful sign-in
  useEffect(() => { if (user && open) onClose() }, [user, open, onClose])

  // Native dialog + focus trap
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open) {
      el.showModal()
      requestAnimationFrame(() => firstFocusRef.current?.focus())
    } else {
      el.close()
    }
  }, [open])

  // Close on backdrop click
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    const handler = (e: MouseEvent) => { if (e.target === el) onClose() }
    el.addEventListener('click', handler)
    return () => el.removeEventListener('click', handler)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  function reset() {
    setError('')
    setEmail('')
    setPassword('')
    setName('')
    setShowPw(false)
    setLoading(false)
  }

  async function handleGoogle() {
    setLoading(true)
    setError('')
    try {
      await signInGoogle()
    } catch (e: any) {
      console.error('[AuthModal] Google sign-in error:', e)
      setError(friendlyError(e?.code, e?.message))
    } finally {
      setLoading(false)
    }
  }

  async function handleEmail(ev: React.FormEvent) {
    ev.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signInEmail(email, password, name, mode === 'register')
    } catch (e: any) {
      console.error('[AuthModal] Email sign-in error:', e)
      setError(friendlyError(e?.code, e?.message))
    } finally {
      setLoading(false)
    }
  }

  function switchTab(t: Tab) { setTab(t); setError('') }
  function switchMode() { setMode(m => m === 'login' ? 'register' : 'login'); setError('') }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-full max-w-sm rounded-2xl border border-border bg-white p-0 shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      aria-labelledby="auth-modal-title"
      aria-modal="true"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 id="auth-modal-title" className="font-semibold text-ink">
          {mode === 'login' ? 'Sign in to AccessMap' : 'Create an account'}
        </h2>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-[#f1f3f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Close sign-in dialog"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="p-5">
        {/* Tab switcher */}
        <div className="mb-5 flex rounded-xl border border-border p-1" role="tablist" aria-label="Sign-in method">
          <button
            ref={firstFocusRef}
            id="tab-btn-google"
            role="tab"
            aria-selected={tab === 'google'}
            aria-controls="tab-google"
            onClick={() => switchTab('google')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${tab === 'google' ? 'bg-[#f8f9fa] text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            Google
          </button>
          <button
            id="tab-btn-email"
            role="tab"
            aria-selected={tab === 'email'}
            aria-controls="tab-email"
            onClick={() => switchTab('email')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${tab === 'email' ? 'bg-[#f8f9fa] text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            Email
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl bg-[#fce8e6] px-3 py-2.5 text-sm text-[#c5221f]">
            <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Google tab */}
        <div id="tab-google" role="tabpanel" aria-labelledby="tab-btn-google" hidden={tab !== 'google'}>
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-white py-3 text-sm font-medium text-ink shadow-sm hover:bg-[#f8f9fa] active:scale-[0.98] transition-transform disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-busy={loading}
          >
            <GoogleIcon />
            {loading ? 'Signing in…' : 'Continue with Google'}
          </button>
          <p className="mt-4 text-center text-xs text-muted">
            We'll never post to Google or share your data. See our{' '}
            <Link to="/privacy" onClick={onClose} className="underline hover:text-ink">Privacy Policy</Link>.
          </p>
        </div>

        {/* Email tab */}
        <div id="tab-email" role="tabpanel" aria-labelledby="tab-btn-email" hidden={tab !== 'email'}>
          <form onSubmit={handleEmail} noValidate className="space-y-3">
            {mode === 'register' && (
              <div>
                <label htmlFor="auth-name" className="block text-xs font-medium text-ink mb-1">Display name</label>
                <input
                  id="auth-name" name="name" type="text"
                  value={name} onChange={e => setName(e.target.value)}
                  className="w-full rounded-xl border border-border px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
            )}
            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-ink mb-1">Email</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
                <input
                  id="auth-email" name="email" type="email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-border pl-9 pr-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            </div>
            <div>
              <label htmlFor="auth-pw" className="block text-xs font-medium text-ink mb-1">Password</label>
              <div className="relative">
                <input
                  id="auth-pw" name="password" type={showPw ? 'text' : 'password'} required
                  value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-border px-3 py-2.5 pr-10 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder={mode === 'register' ? 'At least 6 characters' : '••••••••'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink focus-visible:outline-none"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 text-sm font-semibold disabled:opacity-60"
              aria-busy={loading}
            >
              <LogIn size={15} aria-hidden="true" />
              {loading ? (mode === 'register' ? 'Creating account…' : 'Signing in…') : (mode === 'register' ? 'Create account' : 'Sign in')}
            </button>
          </form>
          <p className="mt-4 text-center text-xs text-muted">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={switchMode} className="text-primary underline hover:no-underline">
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </dialog>
  )
}

function friendlyError(code?: string, message?: string): string {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.'
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.'
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.'
    case 'auth/unauthorized-domain':
      return 'This domain is not authorised in Firebase. Add it under Authentication → Settings → Authorised domains.'
    default:
      return message || 'Something went wrong. Please try again.'
  }
}
