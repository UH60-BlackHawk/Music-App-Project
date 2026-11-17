import { useStore } from '../store'
import { handleSpotifyCallback, importSpotify, spotifyLive } from './spotify'

const STALE_MS = 10 * 60e3
let running: Promise<void> | null = null

/** Pull fresh data from the user's real Spotify account into the app. Safe to call often. */
export function syncSpotify(force = false): Promise<void> {
  const st = useStore.getState()
  if (!spotifyLive() || !st.signedIn) return Promise.resolve()
  if (!force && st.users.me.spotifySync && Date.now() - st.users.me.spotifySync.at < STALE_MS) return Promise.resolve()
  return (running ??= importSpotify()
    .then((d) => useStore.getState().applySpotifyImport(d))
    .finally(() => { running = null }))
}

/** On startup: finish a Spotify sign-in redirect if one is in progress, then refresh if the data is stale. */
export async function startSpotify() {
  try {
    const justConnected = await handleSpotifyCallback()
    await syncSpotify(justConnected)
  } catch (e) {
    console.warn('Spotify sync failed', e)
  }
}
