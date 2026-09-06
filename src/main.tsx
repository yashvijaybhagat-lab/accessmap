import './lib/freshStart' // must run before the store reads localStorage
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import App from './App'
import { initSpeech } from './lib/speech'
import { registerSW } from './lib/registerSW'
import './index.css'

// Restore the saved "speak on focus" preference before first paint.
initSpeech()
// Enable offline support (production only).
registerSW()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Analytics />
    </BrowserRouter>
  </React.StrictMode>,
)
