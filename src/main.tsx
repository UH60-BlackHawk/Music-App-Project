import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startSpotify } from './services/spotifySync'
import { startLive } from './services/live'
import { startLastfm } from './services/lastfm'
import { useStore } from './store'
import './styles/themes.css'
import './styles/base.css'

// Live mode: restore the session and load data from the backend (no-op in sample mode).
// Then finish a Spotify sign-in if one is in progress, and refresh real listening data.
void startLive().then(startLastfm).then(startSpotify)

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
