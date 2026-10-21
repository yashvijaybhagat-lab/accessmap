/**
 * Demo convenience — start every run with a clean profile.
 *
 * `__APP_SESSION__` is stamped fresh by Vite each time the dev server starts or
 * a production build is made (see vite.config.ts). On the next page load we
 * compare it to the stamp we stored last time: if it changed, the app has been
 * re-run, so we wipe the personalisation keys below. HMR reloads reuse the same
 * server process — same stamp — so normal editing never clears anything.
 *
 * Imported first in main.tsx so this runs before the Zustand store reads these
 * keys on module init.
 */
const STAMP_KEY = 'am.session'

/** Keys that make up "my profile" — cleared on a re-run. */
// Accessibility preferences (am.a11y.*, am.easyMode, am.speakFocus) are
// deliberately NOT cleared: wiping them on every deploy forced disabled users
// to reconfigure the app each time it was updated.
const CLEARABLE = [
  'am.needs', // accessibility needs / compatibility profile
]

try {
  if (localStorage.getItem(STAMP_KEY) !== __APP_SESSION__) {
    CLEARABLE.forEach((k) => localStorage.removeItem(k))
    localStorage.setItem(STAMP_KEY, __APP_SESSION__)
  }
} catch {
  /* storage unavailable — nothing to clear */
}

export {}
