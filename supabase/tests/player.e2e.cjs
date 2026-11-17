// Tests best-part playback through Spotify's embedded player, using a stand-in for Spotify's iFrame API script
// (the real one can't be loaded in tests). Run after live-app.e2e.cjs, against the same bridge and build:
//   APP_URL=http://127.0.0.1:4175/ node supabase/tests/player.e2e.cjs
const { chromium } = require('playwright');
const APP = process.env.APP_URL || 'http://127.0.0.1:4175/';
const FAKE_API = `
window.__embed = []; 
window.onSpotifyIframeApiReady && 0;
(function(){
  const api = { createController(el, opts, cb) {
    window.__embed.push(['create', opts.uri]);
    const frame = document.createElement('iframe'); frame.title = 'Spotify player'; el.appendChild(frame);
    const L = {}; let pos = 0, paused = true, timer = null; const dur = window.__embedDuration || 197000;
    const emit = (n, d) => (L[n] || []).forEach((f) => f({ data: d }));
    const update = () => emit('playback_update', { isPaused: paused, position: pos, duration: dur, isBuffering: false });
    const c = {
      addListener(n, f) { (L[n] = L[n] || []).push(f) },
      play() { window.__embed.push(['play']); if (window.__blockAutoplay) return; paused = false; clearInterval(timer); timer = setInterval(() => { if (!paused) { pos = Math.min(dur, pos + 1000); update(); if (pos >= dur) { paused = true; update(); clearInterval(timer) } } }, 100); update() },
      seek(s) { window.__embed.push(['seek', s]); pos = s * 1000; update() },
      pause() { window.__embed.push(['pause']); paused = true; update() },
      destroy() { window.__embed.push(['destroy']); clearInterval(timer) },
    };
    cb(c); setTimeout(() => emit('ready', {}), 50);
  } };
  const go = () => window.onSpotifyIframeApiReady ? window.onSpotifyIframeApiReady(api) : setTimeout(go, 10); go();
})();`;
(async () => {
  const b = await chromium.launch(); const shots = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://open.spotify.com/embed/iframe-api/v1', (r) => r.fulfill({ contentType: 'application/javascript', body: FAKE_API }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const shot = async () => {}
  await p.goto(APP); await p.fill('input[type=email]', 'mokafor27@nobles.edu'); await p.click('button:has-text("Email me a sign-in link")');
  await p.fill('input.code', '123456'); await p.click('button:has-text("Verify")'); await p.waitForSelector('.homebar');
  // 1) Song with a known Spotify id: the clip Maya posted earlier
  await p.goto(APP + '#/track/t-sp-4xqrdfXkTW4T0RauPLv3WA'); await p.waitForSelector('.clip');
  const startText = await p.textContent('.clip-time');
  await p.click('.clip .playbtn'); await p.waitForTimeout(700); await shot('1-embed-playing');
  log = await p.evaluate(() => window.__embed.slice());
  console.log('known id → controller calls:', JSON.stringify(log), '| clip', startText);
  await p.waitForSelector('.clip .playbtn[aria-label="Play best part"]', { timeout: 15000 });
  console.log('stopped itself after 30s of song:', JSON.stringify((await p.evaluate(() => window.__embed)).filter((c) => c[0] === 'pause' || c[0] === 'destroy')));
  // 2) Sample song without a saved Spotify id: the server finds it, then it plays
  await p.goto(APP + '#/recommend/t-juna'); await p.waitForSelector('.clip-picker');
  await p.evaluate(() => { window.__embed.length = 0 });
  await p.click('.clip-meta button:has-text("Preview")'); await p.waitForTimeout(1200);
  console.log('resolved id → controller calls:', JSON.stringify(await p.evaluate(() => window.__embed.slice(0, 3))));
  await p.click('.clip-meta button:has-text("Stop")'); await p.waitForTimeout(200);
  console.log('stopping removes the player:', await p.locator('.spotify-embed iframe').count() === 0, JSON.stringify((await p.evaluate(() => window.__embed)).slice(-1)));
  // 3) Song Spotify doesn't have: visual preview + Open in Spotify
  await p.goto(APP + '#/recommend/t-kyoto'); await p.waitForSelector('.clip-picker');
  await p.click('.clip-meta button:has-text("Preview")'); await p.waitForTimeout(1200);
  console.log('not on Spotify → note:', (await p.textContent('.clip-note')).replace(/\s+/g, ' ').trim()); await shot('2-fallback');
  await p.click('.clip-meta button:has-text("Stop")');
  // 4) Preview-only listener (not logged in to Spotify) and a browser that blocks autoplay
  await p.evaluate(() => { window.__embedDuration = 30000 });
  await p.goto(APP + '#/recommend/t-juna'); await p.evaluate(() => { window.__embedDuration = 30000; window.__embed.length = 0 });
  await p.click('.clip-meta button:has-text("Preview")'); await p.waitForTimeout(900);
  console.log('preview-only → note:', (await p.textContent('.clip-note')).trim(), '| seek not attempted:', !(await p.evaluate(() => window.__embed.some((c) => c[0] === 'seek'))));
  await shot('3-preview-note');
  await p.click('.clip-meta button:has-text("Stop")');
  await p.evaluate(() => { window.__embedDuration = 0; window.__blockAutoplay = true });
  await p.click('.clip-meta button:has-text("Preview")'); await p.waitForTimeout(4200);
  console.log('autoplay blocked → note:', (await p.textContent('.clip-note')).trim());
  console.log(errs.length ? errs.join('\n') : 'no page errors');
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
var log;
