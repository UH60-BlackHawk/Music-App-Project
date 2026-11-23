// End-to-end test of live mode: two students (Maya and Liam) use the real app against a local Postgres
// with the real security rules, through the test bridge. See "Verifying changes" in CLAUDE.md for how to run it.
//   DATABASE_URL=… APP_URL=http://127.0.0.1:4175/ node supabase/tests/live-app.e2e.cjs
// The app must be built with VITE_TEST_BRIDGE and VITE_LASTFM_API_KEY=test-lastfm-key, and the bridge started with
// --reset --functions (see CLAUDE.md, Verifying changes).
// Needs Playwright (preinstalled in the cloud container). Prints one line per check.
const { chromium } = require('playwright');
const pg = require('pg');
const APP = process.env.APP_URL || 'http://127.0.0.1:4175/';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const log = (...a) => console.log(...a);
(async () => {
  await db.connect();
  const b = await chromium.launch();
  const errs = [];
  const mk = async (name) => { const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(name + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' || /Aux sync/.test(m.text())) errs.push(name + ' console: ' + m.text().slice(0, 200)) }); return p };
  const maya = await mk('maya'), liam = await mk('liam');
  const shot = async () => {} // screenshots are taken by hand when needed
  const signUp = async (p, email, name, genre) => {
    await p.goto(APP); await p.waitForSelector('input[type=email]');
    await p.fill('input[type=email]', email); await p.click('button:has-text("Email me a sign-in link")');
    await p.click('text=My email has a code instead'); await p.fill('input.code', '123456'); await p.click('button:has-text("Verify")');
    await p.waitForSelector('text=Who’s got the aux?'); await p.fill('input[aria-label="Your name"]', name); await p.click('button:has-text("Continue")');
    await p.waitForSelector('text=Connect your music'); await p.click('button:has-text("Skip for now")');
    await p.click(`.genre-picker button:has-text("${genre}")`); await p.click('button:has-text("Continue")');
    await p.click('text=Start listening'); await p.waitForSelector('.homebar');
  };
  // Non-school email is refused before anything is sent
  await maya.goto(APP); await maya.fill('input[type=email]', 'maya@gmail.com'); await maya.click('button:has-text("Email me a sign-in link")');
  log('gmail refused:', await maya.textContent('.error'));
  await signUp(maya, 'mokafor27@nobles.edu', 'Maya Okafor', 'Indie');
  await signUp(liam, 'lbrennan27@nobles.edu', 'Liam Brennan', 'Hip-Hop');
  const prof = await db.query("select handle, name, genres, privacy from profiles order by email");
  log('profiles in database:', JSON.stringify(prof.rows));
  await shot(maya, '1-maya-home-empty');
  // Liam follows Maya from Discover
  await liam.goto(APP + '#/discover'); await liam.waitForTimeout(500);
  const classmates = await liam.locator('.section:has-text("Classmates") .row-title').allTextContents();
  log('Liam sees classmates:', classmates);
  await liam.click('.section:has-text("Classmates") .row:has-text("Maya") button:has-text("Follow")'); await liam.waitForTimeout(800);
  log('follow saved:', (await db.query('select count(*)::int n from follows')).rows[0].n);
  // Maya rates a song; Liam sees it in his feed after reload
  await maya.goto(APP + '#/track/t-juna'); await maya.click('.rate-row .star-hit button:nth-child(9)'); await maya.fill('textarea', 'the outro!!'); await maya.click('text=Post rating'); await maya.waitForTimeout(800);
  log('rating saved:', JSON.stringify((await db.query('select stars, review from ratings')).rows));
  await liam.goto(APP); await liam.reload(); await liam.waitForSelector('.homebar'); await liam.waitForTimeout(600);
  log('Liam feed shows Maya rating:', await liam.locator('.feed:has-text("Maya") .note').allTextContents());
  // Liam shares a song with Maya; Maya gets it live
  await liam.goto(APP + '#/track/t-luther'); await liam.click('.detail-actions button:has-text("Share")');
  log('Liam share contacts:', await liam.locator('.share-name').allTextContents());
  await liam.click('.share-person:has-text("Maya")'); await liam.fill('.share-send input', 'you know which part'); await liam.click('.share-send .btn'); await liam.waitForTimeout(800);
  await maya.goto(APP); await maya.waitForSelector('.homebar');
  await maya.waitForSelector('.has-badge .count-badge', { timeout: 8000 });
  log('Maya unread badge (live):', await maya.textContent('.has-badge .count-badge'));
  await maya.goto(APP + '#/messages'); await maya.waitForTimeout(500); await shot(maya, '2-maya-messages');
  await maya.click('.thread-row'); await maya.waitForTimeout(1200);
  log('marked read in database:', (await db.query('select bool_and(read) r from songs_sent')).rows[0].r);
  // Maya replies (allowed: Liam messaged her first, though she doesn't follow him)
  await maya.click('.composer button:has-text("Send a song")'); await maya.fill('.sheet input', 'Juna'); await maya.click('.sheet .row-main >> nth=0');
  await maya.fill('.composer input', 'in return'); await maya.click('.composer button:has-text("Send")'); await maya.waitForTimeout(1000);
  await shot(maya, '3-maya-thread');
  log('messages in database:', JSON.stringify((await db.query('select note from songs_sent order by created_at')).rows.map((r) => r.note)));
  // Privacy: Maya goes private; Liam can no longer see her listening
  await db.query("insert into listens (user_id, track_id, played_at) select id, 't-juna', now() - (n || ' minutes')::interval from profiles, generate_series(1,5) n where handle = 'mokafor27'");
  await db.query("insert into listens (user_id, track_id, played_at) select id, 't-luther', now() - (n || ' minutes')::interval from profiles, generate_series(1,3) n where handle = 'lbrennan27'");
  await liam.goto(APP + '#/discover'); await liam.reload(); await liam.waitForTimeout(600);
  await liam.click('.section:has-text("Classmates") .row-title:has-text("Maya")'); await liam.waitForTimeout(500);
  log('Liam sees Maya recent listens (school privacy):', await liam.locator('.section:has-text("Recent listens") .row').count());
  await maya.goto(APP + '#/settings'); await maya.click('.radio-row:has-text("Private")'); await maya.waitForTimeout(800);
  await liam.reload(); await liam.waitForTimeout(800);
  log('after Maya goes private, Liam sees:', (await liam.textContent('.locked')).trim());
  await maya.click('.radio-row:has-text("Whole school")'); await maya.waitForTimeout(500);
  // Charts come from the server totals
  await liam.goto(APP + '#/charts'); await liam.waitForTimeout(900);
  log('charts (server totals):', (await liam.locator('.chart .row').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim()).slice(0, 3));
  // Blocking: Maya blocks Liam; his next message is refused by the database and he sees an error
  await maya.goto(APP + '#/profile/' + (await db.query("select id from profiles where handle='lbrennan27'")).rows[0].id);
  await maya.click('button[aria-label="More"]'); await maya.click('button:has-text("Block Liam")'); await maya.waitForTimeout(800);
  log('block saved, follows removed:', (await db.query('select (select count(*) from blocks)::int b, (select count(*) from follows)::int f')).rows[0]);
  const mayaId = (await db.query("select id from profiles where handle='mokafor27'")).rows[0].id;
  await liam.goto(APP + '#/messages/' + mayaId); await liam.waitForTimeout(600);
  await liam.click('.composer button:has-text("Send a song")'); await liam.fill('.sheet input', 'tv off'); await liam.click('.sheet .row-main >> nth=0');
  await liam.click('.composer button:has-text("Send")'); await liam.waitForTimeout(1200);
  await liam.evaluate(() => { location.hash = '#/' }); await liam.waitForTimeout(500);
  log('Liam sees error banner:', (await liam.locator('.banner[role=alert]').allTextContents()).map((t) => t.slice(0, 90)));
  log('blocked message not stored:', (await db.query("select count(*)::int n from songs_sent where from_id <> $1 and to_id = $1 and created_at > now() - interval '5 seconds'", [mayaId])).rows[0].n);
  await maya.goto(APP + '#/settings'); await maya.click('.section:has-text("Blocked") button:has-text("Unblock")'); await maya.waitForTimeout(500);
  // Awards: make Maya admin in the database (as the owner would), nominate, vote, reveal
  await db.query("update profiles set is_admin = true where handle = 'mokafor27'");
  await maya.reload(); await maya.waitForTimeout(600);
  await maya.goto(APP + '#/awards'); await maya.click('button:has-text("Nominate") >> nth=0'); await maya.fill('.sheet input', 'Juna'); await maya.click('.sheet .row-main >> nth=0'); await maya.waitForTimeout(500);
  await liam.goto(APP + '#/awards'); await liam.reload(); await liam.waitForTimeout(500);
  await liam.click('button:has-text("Nominate") >> nth=0'); await liam.fill('.sheet input', 'Juna'); await liam.click('.sheet .row-main >> nth=0'); await liam.waitForTimeout(500);
  log('nominations saved:', (await db.query('select count(*)::int n from nma_nominations')).rows[0].n, '| Liam has no admin bar:', await liam.locator('.adminbar').count() === 0);
  await maya.click('text=Advance to voting'); await maya.waitForTimeout(1200);
  log('phase now:', (await db.query('select phase from nma_seasons')).rows[0].phase);
  await maya.click('.card:has-text("Song of the Year") .ballot >> nth=0'); await maya.waitForTimeout(500);
  await liam.reload(); await liam.waitForTimeout(600); await liam.click('.card:has-text("Song of the Year") .ballot >> nth=0'); await liam.waitForTimeout(600);
  log('votes saved (counted by the server):', (await db.query('select count(*)::int n from nma_votes')).rows[0].n);
  await maya.click('text=Advance to reveal'); await maya.waitForTimeout(1500);
  await maya.click('text=Watch the ceremony'); await maya.click('text=Begin'); await maya.waitForTimeout(2600);
  log('ceremony winner:', await maya.textContent('.winner h1'), '|', await maya.textContent('.winner .pill'));
  await shot(maya, '4-maya-ceremony');
  log('Called It badges:', JSON.stringify((await db.query("select handle, badges from profiles order by handle")).rows));
  // Sign out and back in
  await liam.goto(APP + '#/settings'); await liam.click('button:has-text("Sign out")'); await liam.waitForSelector('input[type=email]');
  await liam.fill('input[type=email]', 'lbrennan27@nobles.edu'); await liam.click('button:has-text("Email me a sign-in link")'); await liam.click('text=My email has a code instead'); await liam.fill('input.code', '654321'); await liam.click('button:has-text("Verify")');
  await liam.waitForSelector('.homebar', { timeout: 8000 }); log('returning student goes straight to Home:', await liam.locator('.homebar').count() === 1);
  // ---------- Spotify search, pasted links, Last.fm (needs the bridge started with --functions) ----------
  await maya.goto(APP + '#/track/t-luther'); await maya.click('.detail-actions button:has-text("Share")'); await maya.click('.share-person >> nth=0');
  await maya.keyboard.press('Escape');
  await maya.goto(APP + '#/recommend'); await maya.waitForSelector('.sheet input');
  await maya.fill('.sheet input', 'from the start'); await maya.waitForSelector('.sheet .kicker:has-text("On Spotify")');
  await maya.waitForSelector('.sheet .row-title:has-text("From The Start")', { timeout: 8000 });
  log('Spotify search result:', await maya.textContent('.sheet .row:has-text("From The Start") .row-sub'));
  await maya.click('.sheet .row:has-text("From The Start") .row-main'); await maya.waitForTimeout(400);
  log('picked song shown in Recommend:', await maya.textContent('.card .row-title'));
  await maya.click('button.big'); await maya.waitForTimeout(1500);
  log('new song saved to shared catalog + feed post:', JSON.stringify((await db.query(`select t.title, a.name, a.genre from tracks t join artists a on a.id = t.artist_id where t.id like 't-sp-%'`)).rows), (await db.query(`select count(*)::int n from songs_sent where track_id like 't-sp-%'`)).rows[0].n);
  await maya.goto(APP + '#/recommend'); await maya.waitForSelector('.sheet input');
  await maya.fill('.sheet input', 'https://open.spotify.com/track/1BxfuPKGuaTgP7aM0Bbdwr?si=abc');
  await maya.waitForSelector('.sheet .kicker:has-text("From your link")'); await maya.waitForSelector('.sheet .row-title:has-text("Cruel Summer")', { timeout: 8000 });
  log('pasted link found:', await maya.textContent('.sheet .row-title'));
  await maya.keyboard.press('Escape');
  // Last.fm: privacy note, sign in on (stand-in) Last.fm, come back connected with plays imported
  await maya.route('https://www.last.fm/api/auth/**', (r) => { const cb = new URL(r.request().url()).searchParams.get('cb'); r.fulfill({ status: 302, headers: { location: cb + '&token=' + 'a'.repeat(32) } }) });
  await maya.goto(APP + '#/settings'); await maya.click('.toggle-row:has-text("Last.fm") button:has-text("Connect")');
  log('privacy note shown:', (await maya.textContent('.lastfm-note')).includes('public by default'));
  await maya.click('button:has-text("Continue to Last.fm")');
  await maya.waitForSelector('text=Connected as maya_fm', { timeout: 12000 });
  log('Last.fm connected, plays imported:', (await db.query(`select count(*)::int n from listens l join profiles p on p.id = l.user_id where p.handle = 'mokafor27' and l.track_id <> 't-juna'`)).rows[0].n, '| address bar cleaned:', !maya.url().includes('token='));
  await maya.goto(APP + '#/profile/me'); await maya.waitForTimeout(500);
  log('profile now playing (from Last.fm):', (await maya.textContent('.nowplaying')).replace(/\s+/g, ' ').trim());
  // Sign-in link opened in another tab: the tab still on "Check your inbox" follows along
  const ctx3 = await b.newContext({ viewport: { width: 390, height: 844 } });
  const waiting = await ctx3.newPage(), linkTab = await ctx3.newPage();
  await waiting.goto(APP); await waiting.fill('input[type=email]', 'nchen28@nobles.edu'); await waiting.click('button:has-text("Email me a sign-in link")'); await waiting.waitForSelector('text=Check your inbox');
  log('inbox step leads with the link, code hidden:', (await waiting.textContent('.card')).includes('sign-in link'), !(await waiting.locator('input.code').count()));
  await linkTab.goto(APP); await linkTab.fill('input[type=email]', 'nchen28@nobles.edu'); await linkTab.click('button:has-text("Email me a sign-in link")');
  await linkTab.click('text=My email has a code instead'); await linkTab.fill('input.code', '111111'); await linkTab.click('button:has-text("Verify")');
  await linkTab.waitForSelector('text=Who’s got the aux?');
  await waiting.bringToFront(); await waiting.waitForSelector('text=Who’s got the aux?', { timeout: 8000 }).catch(() => {});
  log('waiting tab moved on after sign-in elsewhere:', await waiting.locator('text=Who’s got the aux?').count() === 1);
  await ctx3.close();
  log(errs.length ? 'logged errors:\n  ' + errs.join('\n  ') : 'no console errors');
  await b.close(); await db.end();
})().catch(async (e) => { console.error('FAIL', e.message); process.exit(1); });
