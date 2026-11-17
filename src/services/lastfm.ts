/**
 * Last.fm listening history (live mode). The student signs in on Last.fm's own page, which proves the account
 * is theirs; the server function `lastfm` then links it and imports recent plays. The API key here is public
 * by design; the shared secret only exists on the server.
 */
import { useStore } from '../store'
import { LIVE } from './mode'
import { remote } from './remote'
import { reload, useLive } from './live'

const KEY = import.meta.env.VITE_LASTFM_API_KEY as string | undefined
export const lastfmConfigured = LIVE && !!KEY
const STALE_MS = 10 * 60e3
let lastSync = 0

/** Send the student to Last.fm to sign in. Last.fm returns to the app with `?lastfm=1&token=…`. */
export function beginLastfmAuth() {
  if (!KEY) return
  const cb = `${location.origin}${location.pathname}?lastfm=1`
  location.assign(`https://www.last.fm/api/auth/?api_key=${encodeURIComponent(KEY)}&cb=${encodeURIComponent(cb)}`)
}

/** Finish a Last.fm sign-in if we've just come back from Last.fm. Call after the student is signed in to Aux. */
async function finishLastfmAuth(): Promise<boolean> {
  const p = new URLSearchParams(location.search)
  const token = p.get('token')
  if (!remote || p.get('lastfm') !== '1' || !token) return false
  history.replaceState(null, '', location.pathname + location.hash)
  await remote.invoke('lastfm', { action: 'connect', token })
  lastSync = Date.now()
  await reload()
  // Last.fm returns to the app's home address; take students who connected from Settings back there.
  if (useStore.getState().onboarded) location.hash = '#/settings'
  return true
}

/** Import new plays from Last.fm. Skips if it ran in the last 10 minutes unless forced. */
export async function syncLastfm(force = false) {
  if (!remote || !useStore.getState().users.me.lastfm) return { imported: 0 }
  if (!force && Date.now() - lastSync < STALE_MS) return { imported: 0 }
  lastSync = Date.now()
  const r = await remote.invoke<{ imported: number }>('lastfm', { action: 'sync' })
  if (r.imported) await reload()
  return r
}

export async function disconnectLastfm() {
  if (!remote) return
  await remote.rpc('disconnect_lastfm')
  await reload()
}

/** On startup: finish a Last.fm sign-in in progress, otherwise refresh plays. Errors show in the app's banner. */
export async function startLastfm() {
  if (!lastfmConfigured || !useLive.getState().user) return
  try {
    if (!(await finishLastfmAuth())) await syncLastfm()
  } catch (e) {
    useLive.setState({ error: e instanceof Error ? e.message : 'Couldn’t reach Last.fm' })
  }
}
