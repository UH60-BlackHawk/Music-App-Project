// Tests for the server functions (Spotify search / links / ids, Last.fm sign-in and import) against a local
// Postgres and stand-in Spotify and Last.fm services. Run: DATABASE_URL=… npm run test:functions
import { strict as assert } from 'node:assert'
import { asUser, resetDatabase } from './bridge.mjs'
import { pgDb } from './pgdb.mjs'
import { FAKE, fakeFetch } from './fakes.mjs'
import { lastfmAction, spotifyAction } from '../functions/_shared/handlers.ts'
import { createSpotify, spotifyIdFromLink } from '../functions/_shared/spotify.ts'
import { createLastfm } from '../functions/_shared/lastfm.ts'

await resetDatabase()
const calls = []
const db = pgDb(asUser)
const spotify = createSpotify({ clientId: FAKE.spotifyId, clientSecret: FAKE.spotifySecret, fetch: fakeFetch(calls) })
const lastfm = createLastfm({ apiKey: FAKE.lastfmKey, sharedSecret: FAKE.lastfmSecret, fetch: fakeFetch(calls) })
const uid = await asUser('service', async (c) => (await c.query(`insert into auth.users (email) values ('mokafor27@nobles.edu') returning id`)).rows[0].id)
const other = await asUser('service', async (c) => (await c.query(`insert into auth.users (email) values ('lbrennan27@nobles.edu') returning id`)).rows[0].id)
const sql = (text, params) => asUser('service', (c) => c.query(text, params)).then((r) => r.rows)

let passed = 0
const results = []
async function test(name, fn) {
  try { await fn(); passed++; results.push('  ok   ' + name) } catch (e) { results.push('  FAIL ' + name + '\n       ' + (e.stack ?? e.message).split('\n').slice(0, 3).join('\n       ')) }
}

await test('pasted links of every common shape give the track id', () => {
  for (const link of ['https://open.spotify.com/track/4xqrdfXkTW4T0RauPLv3WA?si=abc123', 'open.spotify.com/intl-de/track/4xqrdfXkTW4T0RauPLv3WA', 'spotify:track:4xqrdfXkTW4T0RauPLv3WA'])
    assert.equal(spotifyIdFromLink(link), '4xqrdfXkTW4T0RauPLv3WA')
  assert.equal(spotifyIdFromLink('https://open.spotify.com/album/123'), null)
})
await test('search finds songs on Spotify and maps ones already in the catalog to their existing id', async () => {
  const r = await spotifyAction({ action: 'search', q: 'espresso' }, { db, spotify })
  assert.deepEqual(r.results.map((x) => [x.id, x.isNew]), [['t-espresso', false]])
  assert.equal((await sql(`select spotify_id from tracks where id = 't-espresso'`))[0].spotify_id, '6dOtVTDdiauQNBQEDOtlAB', 'existing song learns its Spotify id')
})
await test('new songs come back with catalog rows (artist genre mapped), but nothing is saved until used', async () => {
  const r = await spotifyAction({ action: 'search', q: 'from the start' }, { db, spotify })
  assert.deepEqual(r.results.map((x) => x.id), ['t-sp-4xqrdfXkTW4T0RauPLv3WA'])
  assert.deepEqual(r.catalog.artists, [{ id: 'ar-sp-spA3', name: 'Laufey', genre: 'indie', spotifyId: 'spA3' }])
  assert.equal(r.catalog.albums[0].year, 2023)
  assert.equal((await sql(`select count(*)::int n from tracks where id like 't-sp-%'`))[0].n, 0)
})
await test('new songs by artists already in the catalog reuse that artist', async () => {
  const r = await spotifyAction({ action: 'search', q: 'good luck babe' }, { db, spotify })
  assert.equal(r.catalog.tracks[0].artistId, 'ar-chappell-roan')
  assert.equal(r.catalog.artists.length, 0)
})
await test('a pasted link looks up that exact song', async () => {
  const r = await spotifyAction({ action: 'track', link: 'https://open.spotify.com/track/1BxfuPKGuaTgP7aM0Bbdwr?si=x' }, { db, spotify })
  assert.equal(r.results[0].title, 'Cruel Summer')
  await assert.rejects(spotifyAction({ action: 'track', link: 'https://open.spotify.com/track/doesnotexist00' }, { db, spotify }), /couldn|find/i)
})
await test('resolve finds and remembers the Spotify id of a catalog song', async () => {
  assert.deepEqual(await spotifyAction({ action: 'resolve', trackId: 't-juna' }, { db, spotify }), { spotifyId: '2plbrEY59IikOBgBGLjaoe' })
  calls.length = 0
  assert.deepEqual(await spotifyAction({ action: 'resolve', trackId: 't-juna' }, { db, spotify }), { spotifyId: '2plbrEY59IikOBgBGLjaoe' })
  assert.equal(calls.filter((c) => c.startsWith('spotify:/search')).length, 0, 'second time uses the saved id')
})
await test('the app-only Spotify token is fetched once and reused', async () => {
  assert.equal(calls.filter((c) => c === 'spotify:token').length, 0)
})
await test('Last.fm: a bad token is refused', async () => {
  await assert.rejects(lastfmAction({ action: 'connect', token: 'b'.repeat(32) }, { uid, db, lastfm, spotify }), /Unauthorized Token/)
})
await test('Last.fm: signing in links the account and imports recent plays', async () => {
  const r = await lastfmAction({ action: 'connect', token: FAKE.lastfmToken }, { uid, db, lastfm, spotify })
  assert.equal(r.username, 'maya_fm')
  assert.equal(r.imported, 4)
  const rows = await sql(`select l.track_id, t.title from listens l join tracks t on t.id = l.track_id where l.user_id = $1 order by l.played_at desc`, [uid])
  assert.deepEqual(rows.map((x) => x.track_id), ['t-juna', 't-sp-4xqrdfXkTW4T0RauPLv3WA', rows[2].track_id, 't-espresso'])
  assert.ok(rows[2].track_id.startsWith('t-lf-'), 'a song not on Spotify still gets a catalog entry')
  const p = (await sql('select lastfm_username, now_playing, lastfm_synced_at from profiles where id = $1', [uid]))[0]
  assert.equal(p.lastfm_username, 'maya_fm')
  assert.equal(p.now_playing, 't-sp-4xqrdfXkTW4T0RauPLv3WA', 'what is playing now is shown')
  assert.ok(p.lastfm_synced_at)
  const g = (await sql(`select a.genre from tracks t join artists a on a.id = t.artist_id where t.id = 't-sp-4xqrdfXkTW4T0RauPLv3WA'`))[0]
  assert.equal(g.genre, 'indie')
})
await test('Last.fm: syncing again adds no duplicates', async () => {
  const r = await lastfmAction({ action: 'sync' }, { uid, db, lastfm, spotify })
  assert.equal(r.imported, 0)
  assert.equal((await sql('select count(*)::int n from listens where user_id = $1', [uid]))[0].n, 4)
})
await test('Last.fm: one account cannot be linked to two students', async () => {
  await assert.rejects(lastfmAction({ action: 'connect', token: FAKE.lastfmToken }, { uid: other, db, lastfm, spotify }), /already linked/)
})
await test('Last.fm works without Spotify configured (plays still import)', async () => {
  await sql('update profiles set lastfm_username = null where id = $1', [uid])
  await sql('delete from listens')
  const r = await lastfmAction({ action: 'connect', token: FAKE.lastfmToken }, { uid, db, lastfm, spotify: null })
  assert.equal(r.imported, 4)
})
await test('Last.fm: sync before connecting gives a clear message', async () => {
  await assert.rejects(lastfmAction({ action: 'sync' }, { uid: other, db, lastfm, spotify }), /Connect Last.fm first/)
})

console.log(results.join('\n'))
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
