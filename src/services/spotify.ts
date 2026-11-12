/**
 * Real Spotify adapter (Authorization Code + PKCE, no client secret, no backend needed).
 * Active only when VITE_SPOTIFY_CLIENT_ID is set; otherwise the app runs on mock data.
 * Clip playback uses the official Web Playback SDK (Premium required) and only ever
 * seeks within Spotify's own stream — Aux stores track id + start time, never audio.
 */
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined
const REDIRECT = location.origin + location.pathname
const SCOPES = 'user-read-recently-played user-top-read user-read-currently-playing user-read-playback-state user-modify-playback-state streaming user-read-email user-read-private'
const KEY = 'aux-spotify'

export const spotifyConfigured = !!CLIENT_ID
type Tok = { access: string; refresh: string; exp: number }
const load = (): Tok | null => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } }
export const spotifyLive = () => spotifyConfigured && !!load()
export const spotifyLogout = () => localStorage.removeItem(KEY)

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function beginSpotifyAuth() {
  if (!CLIENT_ID) return
  const verifier = b64(crypto.getRandomValues(new Uint8Array(48)).buffer)
  const challenge = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  sessionStorage.setItem('aux-pkce', verifier)
  const q = new URLSearchParams({ client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT, scope: SCOPES, code_challenge_method: 'S256', code_challenge: challenge })
  location.assign('https://accounts.spotify.com/authorize?' + q)
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: CLIENT_ID!, ...body }) })
  if (!res.ok) throw new Error('Spotify token request failed')
  const j = await res.json()
  const tok: Tok = { access: j.access_token, refresh: j.refresh_token ?? load()?.refresh ?? '', exp: Date.now() + j.expires_in * 1000 - 60e3 }
  localStorage.setItem(KEY, JSON.stringify(tok))
  return tok
}

/** Call once on startup: completes the OAuth redirect if `?code=` is present. Returns true if a login completed. */
export async function handleSpotifyCallback() {
  const code = new URLSearchParams(location.search).get('code')
  const verifier = sessionStorage.getItem('aux-pkce')
  if (!CLIENT_ID || !code || !verifier) return false
  sessionStorage.removeItem('aux-pkce')
  history.replaceState(null, '', location.pathname + location.hash)
  await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier })
  return true
}

async function token() {
  let t = load()
  if (!t) throw new Error('Not connected to Spotify')
  if (Date.now() > t.exp) t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh })
  return t.access
}
async function api(path: string, init: RequestInit = {}) {
  const res = await fetch('https://api.spotify.com/v1' + path, { ...init, headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' } })
  if (!res.ok) throw new Error(`Spotify ${res.status}`)
  return res.status === 204 ? null : res.json().catch(() => null)
}

export interface LiveTrack { title: string; artist: string; uri: string; playedAt?: string }
const norm = (t: any, playedAt?: string): LiveTrack => ({ title: t.name, artist: t.artists?.map((a: any) => a.name).join(', ') ?? '', uri: t.uri, playedAt })

export const recentlyPlayed = async (): Promise<LiveTrack[]> => ((await api('/me/player/recently-played?limit=20'))?.items ?? []).map((i: any) => norm(i.track, i.played_at))
export const topTracks = async (): Promise<LiveTrack[]> => ((await api('/me/top/tracks?limit=10&time_range=short_term'))?.items ?? []).map((t: any) => norm(t))
export const topArtists = async (): Promise<string[]> => ((await api('/me/top/artists?limit=10&time_range=short_term'))?.items ?? []).map((a: any) => a.name)
export const currentlyPlaying = async (): Promise<LiveTrack | null> => { const j = await api('/me/player/currently-playing'); return j?.item ? norm(j.item) : null }

const uriCache: Record<string, string> = {}
async function resolveUri(title: string, artist: string) {
  const k = `${title}|${artist}`
  if (!uriCache[k]) {
    const j = await api(`/search?type=track&limit=1&q=${encodeURIComponent(`track:${title} artist:${artist}`)}`)
    uriCache[k] = j?.tracks?.items?.[0]?.uri ?? ''
  }
  return uriCache[k]
}

let devicePromise: Promise<string> | null = null
let stopTimer: number | undefined
function device(): Promise<string> {
  return (devicePromise ??= new Promise((resolve, reject) => {
    const w = window as any
    w.onSpotifyWebPlaybackSDKReady = () => {
      const player = new w.Spotify.Player({ name: 'Aux', getOAuthToken: (cb: (t: string) => void) => token().then(cb), volume: 0.8 })
      player.addListener('ready', ({ device_id }: { device_id: string }) => resolve(device_id))
      player.addListener('initialization_error', reject)
      player.addListener('account_error', reject) // e.g. not Premium → caller falls back to deep link
      player.connect()
    }
    const sc = document.createElement('script')
    sc.src = 'https://sdk.scdn.co/spotify-player.js'
    sc.onerror = reject
    document.head.appendChild(sc)
  }))
}

/** Play a 30-second "best part" by seeking the official stream to `startSec`. */
export async function playClip(title: string, artist: string, startSec: number) {
  const [id, uri] = await Promise.all([device(), resolveUri(title, artist)])
  if (!uri) throw new Error('Track not found on Spotify')
  await api(`/me/player/play?device_id=${id}`, { method: 'PUT', body: JSON.stringify({ uris: [uri], position_ms: Math.round(startSec * 1000) }) })
  clearTimeout(stopTimer)
  stopTimer = window.setTimeout(() => stopClip(), 30_000)
}
export async function stopClip() {
  clearTimeout(stopTimer)
  if (devicePromise) await api('/me/player/pause', { method: 'PUT' }).catch(() => {})
}
