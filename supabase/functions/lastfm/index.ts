// Edge Function: link a student's Last.fm account (after Last.fm sign-in) and import their recent plays.
// Secrets: LASTFM_API_KEY, LASTFM_SHARED_SECRET, and the Spotify ones (used to match plays to Spotify songs; optional).
import { lastfmAction } from '../_shared/handlers.ts'
import { createLastfm } from '../_shared/lastfm.ts'
import { createSpotify } from '../_shared/spotify.ts'
import { env, serve } from '../_shared/serve.ts'

const lastfm = createLastfm({ apiKey: env('LASTFM_API_KEY'), sharedSecret: env('LASTFM_SHARED_SECRET') })
const spotify = env('SPOTIFY_CLIENT_SECRET') ? createSpotify({ clientId: env('SPOTIFY_CLIENT_ID'), clientSecret: env('SPOTIFY_CLIENT_SECRET') }) : null
serve((body, { uid, db }) => lastfmAction(body, { uid, db, lastfm, spotify }))
