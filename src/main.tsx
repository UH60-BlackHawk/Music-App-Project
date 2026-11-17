import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startSpotify } from './services/spotifySync'
import { useStore } from './store'
import './styles/themes.css'
import './styles/base.css'

// Finish a Spotify sign-in if one is in progress, and refresh real listening data (no-op in sample mode).
void startSpotify()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
