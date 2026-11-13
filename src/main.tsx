import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { handleSpotifyCallback } from './services/spotify'
import { useStore } from './store'
import './styles/themes.css'
import './styles/base.css'

// Complete a real Spotify OAuth redirect if one is in progress (no-op in mock mode).
handleSpotifyCallback()
  .then((ok) => { if (ok) useStore.getState().connect() })
  .catch(() => {})

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
