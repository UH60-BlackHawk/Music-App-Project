/**
 * Apple Music (MusicKit JS) adapter — interface stub.
 * MusicKit needs a developer token signed with an Apple Developer private key, which must be
 * minted server-side. Until a backend exists, Apple Music runs in mock mode and clips fall back
 * to a deep link (see appleLink in data/catalog.ts). Wiring plan:
 *   1. Backend endpoint returns a short-lived developer token (JWT, ES256).
 *   2. MusicKit.configure({ developerToken, app: { name: 'Aux' } }); music.authorize() for the user token.
 *   3. Recently played: GET /v1/me/recent/played/tracks · heavy rotation: GET /v1/me/history/heavy-rotation
 *   4. Clip playback: music.setQueue({ song: id }) → music.play() → music.seekToTime(startSec), pause after 30s.
 */
export const appleMusicConfigured = false
