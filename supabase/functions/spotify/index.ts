// Edge Function: search all of Spotify, look up pasted song links, and find catalog songs' Spotify ids.
// Secrets (Supabase dashboard -> Edge Functions -> Secrets): SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET.
import { spotifyAction } from '../_shared/handlers.ts'
import { createSpotify } from '../_shared/spotify.ts'
import { env, serve } from '../_shared/serve.ts'

const spotify = createSpotify({ clientId: env('SPOTIFY_CLIENT_ID'), clientSecret: env('SPOTIFY_CLIENT_SECRET') })
serve((body, { db }) => spotifyAction(body, { db, spotify }))
