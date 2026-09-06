/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_ROBOFLOW_API_KEY: string
  readonly VITE_ROBOFLOW_MODEL: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Build/dev-server stamp injected by vite.config.ts `define`. */
declare const __APP_SESSION__: string
