// Security-rule tests for supabase/migrations. Runs against a throwaway local Postgres:
//   DATABASE_URL=postgres://user:pass@127.0.0.1:5432/aux_test npm run test:db
// The database is wiped and rebuilt from the migration files on every run.
import pg from 'pg'
import { readFileSync, readdirSync } from 'node:fs'
import { strict as assert } from 'node:assert'

const url = process.env.DATABASE_URL
if (!url) { console.error('Set DATABASE_URL to an empty test database.'); process.exit(1) }
const db = new pg.Client({ connectionString: url })
await db.connect()
db.on('notice', () => {})

const dir = new URL('../', import.meta.url)
await db.query('drop schema if exists public cascade; drop schema if exists auth cascade; drop schema if exists private cascade; create schema public;')
await db.query(readFileSync(new URL('tests/stub_supabase.sql', dir), 'utf8'))
for (const f of readdirSync(new URL('migrations/', dir)).sort()) await db.query(readFileSync(new URL('migrations/' + f, dir), 'utf8'))

let passed = 0
const results = []
async function test(name, fn) {
  try { await fn(); passed++; results.push('  ok   ' + name) } catch (e) { results.push('  FAIL ' + name + '\n       ' + e.message) }
}

/** Run queries as a signed-in student (or signed out when uid is null), inside a transaction that is kept. */
async function as(uid, fn) {
  await db.query('begin')
  try {
    await db.query(`set local role ${uid ? 'authenticated' : 'anon'}`)
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    const out = await fn((sql, params) => db.query(sql, params))
    await db.query('commit')
    return out
  } catch (e) { await db.query('rollback'); throw e }
}
const denied = async (p) => { await assert.rejects(p, /permission denied|row-level security|violates|sealed|Admins only|only for/) }
const signUp = async (email) => (await db.query('insert into auth.users (email) values ($1) returning id', [email])).rows[0].id

// ---------- fixtures ----------
const maya = await signUp('mokafor27@nobles.edu')
const liam = await signUp('lbrennan27@nobles.edu')
const sofia = await signUp('sreyes28@nobles.edu')
const admin = await signUp('aux.admin@nobles.edu')
await db.query('update public.profiles set is_admin = true where id = $1', [admin])
// Check the starting data before the fixtures below clear it.
await test('starting data: sample catalog, this season and its categories exist', async () => {
  const r = await as(maya, (q) => q(`select (select count(*) from public.tracks)::int t, (select count(*) from public.nma_categories where season_id = 'fall-2026')::int c, (select track_id from public.daily_config) d`))
  assert.deepEqual([r.rows[0].t >= 40, r.rows[0].c, r.rows[0].d], [true, 9, 't-juna'])
})

// Sample catalog (t-juna, t-luther, t-tv-off …) comes from the 0002 migration.
await db.query(`delete from public.nma_categories where season_id = 'fall-2026'; delete from public.nma_seasons; delete from public.pred_events;`) // tests create their own

// ---------- sign-up ----------
await test('non-school email cannot sign up', () => assert.rejects(signUp('someone@gmail.com'), /only for @nobles.edu/))
await test('school email sign-up creates a profile with a handle', async () => {
  const r = await db.query('select handle, privacy from public.profiles where id = $1', [maya])
  assert.deepEqual(r.rows[0], { handle: 'mokafor27', privacy: 'school' })
})
await test('a clashing handle gets a number', async () => {
  const id = await signUp('mokafor27!@nobles.edu') // different address, same handle once cleaned up
  assert.equal((await db.query('select handle from public.profiles where id = $1', [id])).rows[0].handle, 'mokafor272')
})
await test('signed-out visitors can read nothing', () => denied(as(null, (q) => q('select * from public.profiles'))))

// ---------- profiles ----------
await test('students can edit their own profile', async () => {
  await as(maya, (q) => q(`update public.profiles set name = 'Maya Okafor', genres = '{indie,folk}' where id = $1`, [maya]))
  assert.equal((await db.query('select name from public.profiles where id = $1', [maya])).rows[0].name, 'Maya Okafor')
})
await test('students cannot make themselves admin or award themselves badges', async () => {
  await as(maya, (q) => q(`update public.profiles set is_admin = true, badges = '{Called It}' where id = $1`, [maya]))
  const r = (await db.query('select is_admin, badges from public.profiles where id = $1', [maya])).rows[0]
  assert.deepEqual(r, { is_admin: false, badges: [] })
})
await test('students cannot edit someone else\'s profile', async () => {
  const r = await as(liam, (q) => q(`update public.profiles set name = 'hacked' where id = $1`, [maya]))
  assert.equal(r.rowCount, 0)
})

// ---------- privacy of listening ----------
await as(maya, (q) => q(`insert into public.listens (track_id, played_at) values ('t-juna', now()), ('t-juna', now() - interval '1 hour')`))
const liamSeesMaya = () => as(liam, (q) => q('select count(*)::int n from public.listens where user_id = $1', [maya])).then((r) => r.rows[0].n)
await test('whole-school privacy: classmates see your listens', async () => assert.equal(await liamSeesMaya(), 2))
await test('friends-only privacy: hidden until you follow each other', async () => {
  await db.query(`update public.profiles set privacy = 'friends' where id = $1`, [maya])
  assert.equal(await liamSeesMaya(), 0)
  await as(liam, (q) => q('insert into public.follows (follower, followee) values ($1, $2)', [liam, maya]))
  assert.equal(await liamSeesMaya(), 0, 'one-way follow is not enough')
  await as(maya, (q) => q('insert into public.follows (follower, followee) values ($1, $2)', [maya, liam]))
  assert.equal(await liamSeesMaya(), 2)
})
await test('pausing sharing hides listens from everyone', async () => {
  await db.query('update public.profiles set sharing_paused = true where id = $1', [maya])
  assert.equal(await liamSeesMaya(), 0)
  await db.query(`update public.profiles set sharing_paused = false, privacy = 'school' where id = $1`, [maya])
})
await test('private: nobody else sees your listens, you still see your own', async () => {
  await db.query(`update public.profiles set privacy = 'private' where id = $1`, [maya])
  assert.equal(await liamSeesMaya(), 0)
  const own = await as(maya, (q) => q('select count(*)::int n from public.listens where user_id = $1', [maya]))
  assert.equal(own.rows[0].n, 2)
  await db.query(`update public.profiles set privacy = 'school' where id = $1`, [maya])
})
await test('students cannot log listens as someone else', () =>
  denied(as(liam, (q) => q(`insert into public.listens (user_id, track_id, played_at) values ($1, 't-juna', now())`, [maya]))))
await test('leaderboard counts opted-in students only and returns totals, not people', async () => {
  await as(liam, (q) => q(`insert into public.listens (track_id, played_at) values ('t-luther', now()), ('t-luther', now() - interval '2 hours')`))
  await db.query('update public.profiles set leaderboard_opt_in = false where id = $1', [liam])
  const r = await as(sofia, (q) => q(`select * from public.leaderboard('songs', now() - interval '7 days')`))
  assert.deepEqual(r.rows, [{ id: 't-juna', plays: '2' }])
  assert.deepEqual(Object.keys(r.rows[0]), ['id', 'plays'])
  await db.query('update public.profiles set leaderboard_opt_in = true where id = $1', [liam])
})
await test('leaderboard genre filter', async () => {
  const r = await as(sofia, (q) => q(`select id from public.leaderboard('artists', now() - interval '7 days', '{hip-hop}')`))
  assert.deepEqual(r.rows.map((x) => x.id), ['ar-kendrick-lamar'])
})

await test('trending: songs with more plays this week than last', async () => {
  const r = await as(sofia, (q) => q('select id, delta from public.trending()'))
  assert.ok(r.rows.some((x) => x.id === 't-luther' && Number(x.delta) === 2))
})
await test('Last.fm accounts can only be linked by the server, and unlinked by their owner', async () => {
  await denied(as(maya, (q) => q(`update public.profiles set lastfm_username = 'someone_else' where id = $1`, [maya])))
  await db.query(`update public.profiles set lastfm_username = 'maya_fm' where id = $1`, [maya]) // server-side
  assert.equal((await db.query('select lastfm_username from public.profiles where id = $1', [maya])).rows[0].lastfm_username, 'maya_fm')
  await as(maya, (q) => q('select public.disconnect_lastfm()'))
  assert.equal((await db.query('select lastfm_username from public.profiles where id = $1', [maya])).rows[0].lastfm_username, null)
})

// ---------- direct messages (songs only) ----------
await test('you can message people you follow', async () => {
  await as(liam, (q) => q(`insert into public.songs_sent (to_id, track_id, note) values ($1, 't-luther', 'you know which part')`, [maya]))
})
await test('you cannot message a stranger who never messaged you', () =>
  denied(as(sofia, (q) => q(`insert into public.songs_sent (to_id, track_id) values ($1, 't-juna')`, [maya]))))
await test('…but you can reply once they have messaged you', async () => {
  await as(liam, (q) => q('insert into public.follows (follower, followee) values ($1, $2)', [liam, sofia]))
  await as(liam, (q) => q(`insert into public.songs_sent (to_id, track_id) values ($1, 't-tv-off')`, [sofia]))
  // Sofia doesn't follow Liam, but may reply because he messaged her first.
  await as(sofia, (q) => q(`insert into public.songs_sent (to_id, track_id, note) values ($1, 't-juna', 'in return')`, [liam]))
})
await test('nobody else can read a private conversation', async () => {
  const r = await as(sofia, (q) => q('select count(*)::int n from public.songs_sent where from_id = $1 and to_id = $2', [liam, maya]))
  assert.equal(r.rows[0].n, 0)
  const m = await as(maya, (q) => q('select count(*)::int n from public.songs_sent where to_id = $1', [maya]))
  assert.equal(m.rows[0].n, 1)
})
await test('a message cannot be sent pre-marked as read, or as someone else', async () => {
  await denied(as(liam, (q) => q(`insert into public.songs_sent (to_id, track_id, read) values ($1, 't-juna', true)`, [maya])))
  await denied(as(liam, (q) => q(`insert into public.songs_sent (from_id, to_id, track_id) values ($1, $2, 't-juna')`, [maya, liam])))
})
await test('the recipient can mark a conversation read; nobody can edit messages directly', async () => {
  await as(maya, (q) => q('select public.mark_thread_read($1)', [liam]))
  assert.equal((await db.query('select bool_and(read) r from public.songs_sent where to_id = $1', [maya])).rows[0].r, true)
  await denied(as(maya, (q) => q(`update public.songs_sent set note = 'edited' where to_id = $1`, [maya])))
})
await test('blocking stops messages both ways and removes follows', async () => {
  await as(maya, (q) => q('insert into public.blocks (blocker, blocked) values ($1, $2)', [maya, liam]))
  assert.equal((await db.query('select count(*)::int n from public.follows where (follower = $1 and followee = $2) or (follower = $2 and followee = $1)', [maya, liam])).rows[0].n, 0)
  await denied(as(liam, (q) => q(`insert into public.songs_sent (to_id, track_id) values ($1, 't-juna')`, [maya])))
  assert.equal(await liamSeesMaya(), 0, 'blocked people cannot see your listens')
  await as(maya, (q) => q('delete from public.blocks where blocker = $1', [maya]))
})
await test('feed posts follow the sender\'s privacy', async () => {
  await as(maya, (q) => q(`insert into public.songs_sent (track_id, note) values ('t-juna', 'posted')`))
  const seen = () => as(sofia, (q) => q(`select count(*)::int n from public.songs_sent where from_id = $1 and to_id is null`, [maya])).then((r) => r.rows[0].n)
  assert.equal(await seen(), 1)
  await db.query(`update public.profiles set privacy = 'private' where id = $1`, [maya])
  assert.equal(await seen(), 0)
  await db.query(`update public.profiles set privacy = 'school' where id = $1`, [maya])
})

// ---------- ratings and moderation ----------
await test('students cannot hide or un-hide ratings themselves', async () => {
  await as(sofia, (q) => q(`insert into public.ratings (item_type, item_id, stars, review) values ('track', 't-juna', 4.5, 'no skips')`))
  await denied(as(sofia, (q) => q(`insert into public.ratings (item_type, item_id, stars, hidden) values ('track', 't-luther', 3, true)`)))
  await denied(as(sofia, (q) => q(`update public.ratings set hidden = true where user_id = $1`, [sofia])))
})
await test('half stars are allowed; other values are not', async () => {
  await denied(as(sofia, (q) => q(`insert into public.ratings (item_type, item_id, stars) values ('album', 'al-gnx', 4.3)`)))
  const r = await as(maya, (q) => q(`select * from public.item_rating('track', 't-juna')`))
  assert.deepEqual(r.rows[0], { avg: '4.50', count: '1' })
})
await test('only admins can resolve reports; removing hides the comment', async () => {
  const c = (await as(liam, (q) => q(`insert into public.comments (target_id, text) values ('daily-t-juna', 'spam spam') returning id`))).rows[0].id
  const rep = (await as(sofia, (q) => q(`insert into public.reports (kind, target_id, reason) values ('comment', $1, 'Spam') returning id`, [c]))).rows[0].id
  await denied(as(sofia, (q) => q('select public.resolve_report($1, true)', [rep])))
  const others = await as(maya, (q) => q('select count(*)::int n from public.reports'))
  assert.equal(others.rows[0].n, 0, 'reports are private to the reporter and admins')
  await as(admin, (q) => q('select public.resolve_report($1, true)', [rep]))
  const visible = await as(maya, (q) => q('select count(*)::int n from public.comments where id = $1', [c]))
  assert.equal(visible.rows[0].n, 0)
})

// ---------- Nobles Music Awards ----------
await db.query(`insert into public.nma_seasons (id, name, phase) values ('fall-2026', 'Fall 2026', 'nominations');
  insert into public.nma_categories (season_id, id, name, item_type) values ('fall-2026', 'soty', 'Song of the Year', 'track');`)
await test('nominations open only during the nominations phase', async () => {
  await as(maya, (q) => q(`insert into public.nma_nominations (season_id, category_id, item_id) values ('fall-2026', 'soty', 't-juna')`))
  await as(liam, (q) => q(`insert into public.nma_nominations (season_id, category_id, item_id) values ('fall-2026', 'soty', 't-luther')`))
  await as(sofia, (q) => q(`insert into public.nma_nominations (season_id, category_id, item_id) values ('fall-2026', 'soty', 't-juna')`))
  await denied(as(sofia, (q) => q(`insert into public.nma_votes (season_id, category_id, item_id) values ('fall-2026', 'soty', 't-juna')`)))
})
await test('only admins can change the phase', async () => {
  await denied(as(maya, (q) => q(`select public.nma_set_phase('fall-2026', 'voting')`)))
  await as(admin, (q) => q(`select public.nma_set_phase('fall-2026', 'voting')`))
})
await test('voting: one vote each, only for items on the ballot, nominations closed', async () => {
  await denied(as(admin, (q) => q(`insert into public.nma_nominations (season_id, category_id, item_id) values ('fall-2026', 'soty', 't-tv-off')`)))
  await denied(as(maya, (q) => q(`update public.nma_nominations set item_id = 't-tv-off' where user_id = auth.uid()`)))
  await denied(as(maya, (q) => q(`insert into public.nma_votes (season_id, category_id, item_id) values ('fall-2026', 'soty', 't-tv-off')`)))
  await as(maya, (q) => q(`insert into public.nma_votes (season_id, category_id, item_id) values ('fall-2026', 'soty', 't-juna')`))
  await denied(as(maya, (q) => q(`insert into public.nma_votes (season_id, category_id, item_id) values ('fall-2026', 'soty', 't-luther')`)))
  await as(liam, (q) => q(`insert into public.nma_votes (season_id, category_id, item_id) values ('fall-2026', 'soty', 't-juna')`))
  await as(sofia, (q) => q(`insert into public.nma_votes (season_id, category_id, item_id) values ('fall-2026', 'soty', 't-luther')`))
})
await test('votes are sealed: no one can see others\' votes or totals before the reveal', async () => {
  const r = await as(admin, (q) => q('select count(*)::int n from public.nma_votes'))
  assert.equal(r.rows[0].n, 0, 'not even admins')
  await denied(as(maya, (q) => q(`select * from public.nma_results('fall-2026')`)))
})
await test('reveal records the winner, credits the first nominator, and awards Called It', async () => {
  await as(admin, (q) => q(`select public.nma_set_phase('fall-2026', 'reveal')`))
  const w = (await as(liam, (q) => q(`select item_id, nominator_id from public.nma_winners where season_id = 'fall-2026'`))).rows[0]
  assert.deepEqual(w, { item_id: 't-juna', nominator_id: maya })
  const badges = (await db.query('select id, badges from public.profiles where id in ($1, $2, $3)', [maya, liam, sofia])).rows
  assert.deepEqual(Object.fromEntries(badges.map((b) => [b.id, b.badges.includes('Called It')])), { [maya]: true, [liam]: false, [sofia]: true })
  const totals = await as(liam, (q) => q(`select item_id, votes from public.nma_results('fall-2026') order by votes desc`))
  assert.deepEqual(totals.rows, [{ item_id: 't-juna', votes: '2' }, { item_id: 't-luther', votes: '1' }])
})

// ---------- predictions ----------
await db.query(`insert into public.pred_events (id, name, starts_at) values ('grammys', 'GRAMMYs', now() + interval '10 days'), ('past', 'Past show', now() - interval '1 day');
  insert into public.pred_categories (event_id, id, name, nominees) values ('grammys', 'roty', 'Record of the Year', '{luther,Espresso}'), ('past', 'song', 'Song', '{Juna,360}');`)
await test('predictions: pick before the show, only from the nominees', async () => {
  await as(maya, (q) => q(`insert into public.pred_picks (event_id, category_id, nominee) values ('grammys', 'roty', 'luther')`))
  await denied(as(maya, (q) => q(`update public.pred_picks set nominee = 'Not a nominee' where event_id = 'grammys'`)))
})
await test('predictions lock at start time and when an admin locks them', async () => {
  await denied(as(maya, (q) => q(`insert into public.pred_picks (event_id, category_id, nominee) values ('past', 'song', 'Juna')`)))
  await db.query(`update public.pred_events set locked = true where id = 'grammys'`)
  await denied(as(maya, (q) => q(`update public.pred_picks set nominee = 'Espresso' where event_id = 'grammys'`)))
})
await test('prediction points: 10 per correct pick, nothing to buy', async () => {
  await db.query(`update public.pred_categories set winner = 'luther' where id = 'roty'`)
  const r = await as(liam, (q) => q('select * from public.prediction_leaderboard()'))
  assert.deepEqual(r.rows, [{ user_id: maya, points: '10' }])
})

console.log(results.join('\n'))
console.log(`\n${passed}/${results.length} passed`)
await db.end()
process.exit(passed === results.length ? 0 : 1)
