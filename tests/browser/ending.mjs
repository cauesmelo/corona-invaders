/** The beginning and the end in a real browser: the new-run briefing, the
 * epilogue after OMICRON PRIME, the FINAL REPORT, the credits roll and the
 * return to the title. Not part of `npm test` (it needs Chrome); run with the
 * game served locally:
 *
 *   node serve.mjs --port 4550 &
 *   node tests/browser/ending.mjs http://127.0.0.1:4550/ [--shots DIR]
 *
 * Real key events and clicks throughout. The only fixtures are the sanctioned
 * QA hooks: `__game.setState` (unlock stage 12, make the syringe invulnerable,
 * put OMICRON PRIME on a few hit points, label a finished run's report) and
 * `__game.checkpoint(12)`; the boss itself is killed by the syringe's own
 * needles, steered with real arrow keys. A held key is sent the way the OS
 * sends it: one keydown, then repeated keydowns with `repeat: true`
 * (Playwright marks a keydown for an already-down key as an auto-repeat).
 *
 * Frame-time is not measured here: a loaded machine slows the reels' clock
 * (they run on real elapsed time clamped to 0.1 s a frame), so every wait is
 * on a condition, never on a fixed time, and `lockout` waits add margin.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(process.env.PLAYWRIGHT_FROM || new URL('../../../common/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const args = process.argv.slice(2);
const BASE = args.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:4550/';
const shotsAt = args.indexOf('--shots');
const SHOTS = shotsAt >= 0 ? args[shotsAt + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
async function check(name, fn) {
  // ONLY=text runs the checks whose name contains it (debugging a single one).
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}${detail ? ` ${JSON.stringify(detail)}` : ''}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`FAIL ${name}\n  ${String(error?.message || error)}${process.env.STACK ? '\n' + error.stack : ''}`);
  } finally {
    // Every page runs a 3D render loop: close a check's pages before the next one starts,
    // or the idle ones starve the new page on a software-WebGL machine.
    for (const ctx of contexts.splice(0)) await ctx.close().catch(() => {});
  }
}
const assert = (ok, msg) => {
  if (!ok) throw new Error(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const contexts = [];
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
async function open({ viewport = { width: 960, height: 640 }, storage = null } = {}) {
  const ctx = await browser.newContext({ viewport });
  contexts.push(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE);
  if (storage) {
    await page.evaluate((entries) => Object.entries(entries).forEach(([k, v]) => localStorage.setItem(k, v)), storage);
    await page.reload();
  }
  await page.waitForFunction(() => window.__game && document.querySelector('#overlay')?.dataset.screen === 'title', null, { timeout: 60000 });
  return { ctx, page, errors };
}
const shot = (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
const reel = (page) => page.evaluate(() => window.__game.reel());
// A hidden overlay keeps its last data-screen, so "no screen" is `hidden`.
const screenOf = (page) => page.evaluate(() => { const o = document.querySelector('#overlay'); return o.hidden ? '' : o.dataset.screen || ''; });
const phaseOf = (page) => page.evaluate(() => window.__game.getState().phase);
const waitReel = (page, kind, timeout = 60000) => page.waitForFunction((k) => window.__game.reel()?.kind === k, kind, { timeout });
const waitScreen = (page, screen, timeout = 60000) => page.waitForFunction((s) => { const o = document.querySelector('#overlay'); return !o.hidden && o.dataset.screen === s && !window.__game.reel(); }, screen, { timeout });
/** The title's attract loop starts a demo after 8 idle seconds, which hides the
 * title's own buttons: on a busy machine a page can sit that long. Shift is a
 * key the title wakes on without starting anything. */
async function onTitle(page) {
  if ((await screenOf(page)) !== 'title') await page.keyboard.press('ShiftLeft');
  await page.waitForFunction(() => { const o = document.querySelector('#overlay'); return !o.hidden && o.dataset.screen === 'title'; }, null, { timeout: 30000 });
}
/** The OS's auto-repeat for a key already held: keydown, keydown, keydown... */
async function hold(page, code, ms, every = 40) {
  for (let t = 0; t < ms; t += every) {
    await page.keyboard.down(code);
    await sleep(every);
  }
}
/** Let the card's lockout pass (the reel's clock may run slow on a busy machine). */
const pastLockout = (page) => page.waitForFunction(() => { const r = window.__game.reel(); return r && r.t >= r.lockout + 0.15; }, null, { timeout: 30000 });

/** Put the run at OMICRON PRIME with a few hit points left and play it out with
 * real arrow keys: the syringe's own needles do the killing. `holdSpace`:
 * SOAP is held down from the fight through the win, as a player spamming it
 * would. `onWon` runs the moment the model says won (before the report). */
async function winRun(page, { holdSpace = false, easy = false, onWon = null } = {}) {
  await page.evaluate((isEasy) => {
    const g = window.__game;
    g.setDifficulty(isEasy ? 'easy' : 'normal');
    g.setState({ unlockedStage: 12 });
    g.checkpoint(12);
    g.setState({ ship: { invulnerable: 1e9 } });
  }, easy);
  await page.waitForFunction(() => { const s = window.__game.getState(); return s.boss && s.boss.state !== 'intro'; }, null, { timeout: 90000 });
  await page.evaluate(() => window.__game.setState({ boss: { hp: 5 } }));
  if (holdSpace) await page.keyboard.down('Space');
  const t0 = Date.now();
  while (Date.now() - t0 < 360000) {
    const s = await page.evaluate(() => {
      const g = window.__game.getState();
      const b = g.enemies.find((e) => e.kind === 'boss' && e.alive);
      return { phase: g.phase, bx: b?.x, sx: g.ship.x };
    });
    if (s.phase === 'won') break;
    const want = s.bx === undefined ? null : s.bx > s.sx + 0.3 ? 'ArrowRight' : s.bx < s.sx - 0.3 ? 'ArrowLeft' : null;
    if (want) {
      await page.keyboard.down(want);
      await sleep(60);
      await page.keyboard.up(want);
    } else await sleep(60);
    if (holdSpace) await page.keyboard.down('Space'); // auto-repeat
  }
  assert((await phaseOf(page)) === 'won', 'OMICRON PRIME was defeated with real keys');
  if (onWon) await onWon();
}

// ---- 1. The beginning ----------------------------------------------------------
await check('beginning: START opens the briefing; the stage waits; a held Space cannot skip it; a fresh key does and starts play', async () => {
  const { page, errors } = await open();
  // START with Enter (a focused button takes Enter on keydown, Space on keyup) and keep it held.
  await page.keyboard.down('Enter');
  await waitReel(page, 'briefing');
  const first = await reel(page);
  assert(first.count === 1 && first.lines.length >= 3 && first.lines.length <= 5, JSON.stringify(first));
  assert(/SYRINGE/.test(first.text) && /AIRWAY, LUNGS, BLOODSTREAM, THE CELL/.test(first.text) && /R0/.test(first.text), first.text);
  const before = await page.evaluate(() => { const s = window.__game.getState(); return { t: s.waveElapsed, x: s.ship.x, bombs: s.ship.bombs }; });
  await sleep(900);
  await shot(page, 'briefing-typing');
  await hold(page, 'Enter', 1000); // the START key stays down and repeats
  let r = await reel(page);
  assert(r && r.kind === 'briefing', 'a held START key did not skip the briefing');
  const during = await page.evaluate(() => { const s = window.__game.getState(); return { t: s.waveElapsed, x: s.ship.x }; });
  assert(during.t === before.t && during.x === before.x, `the stage waits under the briefing (${JSON.stringify([before, during])})`);
  await page.keyboard.up('Enter');
  await sleep(200);
  assert((await reel(page))?.kind === 'briefing', 'releasing the START key does not skip it either');
  await page.waitForFunction(() => window.__game.reel().t > 3.2, null, { timeout: 30000 });
  await shot(page, 'briefing-full');
  // A fresh press skips it. Held (not released) it must not fire a SOAP when play resumes.
  await page.keyboard.down('Space');
  await page.waitForFunction(() => !window.__game.reel(), null, { timeout: 10000 });
  await page.waitForFunction(() => window.__game.getState().waveElapsed > 0.2, null, { timeout: 30000 });
  const held = await page.evaluate(() => window.__game.getState().ship.bombs);
  assert(held === before.bombs, `the Space that skipped it fired no SOAP (${held} vs ${before.bombs})`);
  await page.keyboard.up('Space');
  await page.keyboard.press('Space');
  await page.waitForFunction((b) => window.__game.getState().ship.bombs < b, before.bombs, { timeout: 10000 });
  const intro = await page.evaluate(() => ({ shown: !document.querySelector('#intro-card').hidden, code: document.querySelector('#intro-code').textContent }));
  assert(intro.shown && /1-1/.test(intro.code), `the stage intro follows the briefing: ${JSON.stringify(intro)}`);
  assert(errors.length === 0, errors.join('; '));
  return { lines: first.lines.length, hold: first.hold };
});

await check('beginning: a movement key skips it and plays at once; a click works; it runs by itself in about five seconds', async () => {
  let { page, errors } = await open();
  await page.locator('#play-button').click();
  await waitReel(page, 'briefing');
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => !window.__game.reel(), null, { timeout: 10000 });
  // The first frames after a start are slow in software WebGL: wait for the stage to run, not for a fixed time.
  await page.waitForFunction(() => window.__game.getState().waveElapsed > 0.5, null, { timeout: 30000 });
  const s = await page.evaluate(() => window.__game.getState());
  await page.keyboard.up('ArrowRight');
  assert(s.ship.x > 0.3 && s.shotsFired > 0, `the key that skipped it also moved the syringe: x ${s.ship.x}, shots ${s.shotsFired}`);
  // A mouse click skips it.
  ({ page } = await open());
  await page.locator('#play-button').click();
  await waitReel(page, 'briefing');
  await page.mouse.click(480, 120);
  await page.waitForFunction(() => !window.__game.reel(), null, { timeout: 10000 });
  // Nobody presses anything: the briefing finishes by itself.
  const quiet = await open();
  await quiet.page.keyboard.press('Space');
  await waitReel(quiet.page, 'briefing');
  // The reel runs on real elapsed time clamped to 0.1 s a frame, so a very slow machine stretches it: judge it by its own clock.
  const t0 = Date.now();
  let lastSeen = null;
  while (Date.now() - t0 < 120000) {
    const r = await reel(quiet.page);
    if (!r) break;
    lastSeen = r;
    await sleep(120);
  }
  const waited = (Date.now() - t0) / 1000;
  assert(lastSeen && lastSeen.t >= lastSeen.hold - 1.2 && lastSeen.hold < 7, `the briefing ran to its own hold by itself (last seen t ${lastSeen?.t} of ${lastSeen?.hold})`);
  assert((await phaseOf(quiet.page)) === 'playing' && (await screenOf(quiet.page)) === '', 'then play');
  assert(errors.length === 0 && quiet.errors.length === 0, [...errors, ...quiet.errors].join('; '));
  return { unattendedSeconds: Number(waited.toFixed(1)), hold: lastSeen.hold };
});

await check('beginning: the briefing is for a new run only: a lost-run continue, a pause, a stage change and RESUME RUN never show it', async () => {
  const { page, errors } = await open();
  await page.keyboard.press('Space');
  await waitReel(page, 'briefing');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => !window.__game.reel(), null, { timeout: 10000 });
  await page.waitForFunction(() => window.__game.getState().waveElapsed > 0.5, null, { timeout: 30000 });
  // Pause and resume.
  await page.keyboard.press('KeyP');
  await page.keyboard.press('KeyP');
  assert((await reel(page)) === null, 'pause and resume');
  // Lose a vial on purpose, then continue.
  await page.evaluate(() => {
    const g = window.__game;
    const s = g.getState();
    g.setState({ health: 1, ship: { invulnerable: 0, shield: 0, coat: 0 }, enemyShots: [{ id: 999, x: s.ship.x, z: s.ship.z - 0.1, vx: 0, vz: 8, radius: 0.2 }] });
    g.step(0.25);
  });
  await waitScreen(page, 'lost');
  await sleep(1300);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.getState().phase === 'playing', null, { timeout: 10000 });
  assert((await reel(page)) === null, 'CONTINUE does not replay the briefing');
  // A run saved in the middle (the game saves at each FORMULATE and stage change; here the model's own export of a fresh run):
  // RESUME RUN picks it up without a briefing.
  const saved = await page.evaluate(async () => {
    const m = await import('./model.mjs');
    const s = m.createState({ seed: 5, drafts: true });
    m.newRun(s, 5);
    const data = m.exportRun(s);
    if (data) localStorage.setItem('corona-invaders-v6-run', JSON.stringify(data));
    return !!data;
  });
  assert(saved, 'a run save exists to resume');
  await page.reload();
  await page.waitForFunction(() => window.__game && document.querySelector('#overlay')?.dataset.screen === 'title', null, { timeout: 60000 });
  assert(await page.locator('#resume-button').isVisible(), 'the title offers RESUME RUN');
  await page.locator('#resume-button').click();
  await sleep(500);
  assert((await reel(page)) === null && (await phaseOf(page)) === 'playing', 'RESUME RUN goes straight back to play');
  assert(errors.length === 0, errors.join('; '));
});

// ---- 2. The end: epilogue, FINAL REPORT, credits, title ----------------------------
await check('ending: a held Space cannot skip the epilogue, the FINAL REPORT or the credits; presses after the lockout turn the cards; the roll ends on the title', async () => {
  const { page, errors } = await open();
  const notes = {};
  await winRun(page, {
    holdSpace: true,
    // The model says won; the report is labelled a one-credit clear so the stamp and its epilogue line are exercised too.
    onWon: async () => {
      notes.saved = await page.evaluate(() => !!window.__game.saved());
      await page.evaluate(() => {
        const g = window.__game;
        g.setState({ finalReport: { ...g.getState().finalReport, stamp: '1CC · ONE CREDIT CLEAR', oneCredit: true, creditsUsed: 0, credits: 3 } });
      });
    },
  });
  assert(notes.saved === false, 'a won run is not saved: the title will not offer CONTINUE into it');
  assert((await screenOf(page)) === '', 'the boss pops first: no overlay yet');
  // The SOAP key is still held. Keep repeating it through the whole epilogue.
  await waitReel(page, 'epilogue');
  const path = [];
  const t0 = Date.now();
  let last = null;
  const shotAt = new Set();
  while ((await reel(page))?.kind === 'epilogue' && Date.now() - t0 < 60000) {
    await page.keyboard.down('Space');
    const r = await reel(page);
    if (r) {
      if (last && r.index !== last.index) path.push({ from: last.index, atT: Number(last.t.toFixed(2)), hold: last.hold });
      last = r;
      if (r.t > 1.4 && !shotAt.has(r.index)) {
        shotAt.add(r.index);
        await shot(page, `epilogue-${r.index + 1}-${['note', 'culture', 'filed'][r.index]}`);
      }
    }
    await sleep(40);
  }
  assert(path.length === 2, `two card turns under a held key, got ${JSON.stringify(path)}`);
  for (const p of path) assert(p.atT >= p.hold - 1.0, `card ${p.from} turned by the clock (${p.atT} s of ${p.hold} s), not by the held key`);
  // The epilogue is over (by time); Space is still down: the FINAL REPORT must not be skipped into the credits.
  await waitScreen(page, 'won');
  for (let i = 0; i < 40; i++) {
    await page.keyboard.down('Space');
    await sleep(40);
  }
  assert((await screenOf(page)) === 'won' && (await reel(page)) === null, 'the held Space did not start the credits');
  const report = await page.evaluate(() => ({ text: document.querySelector('#overlay-body').innerText, stamp: document.querySelector('.stamp')?.textContent, primary: document.querySelector('#play-button').innerText, rows: [...document.querySelectorAll('#actions .row:not([hidden])')].map((b) => b.id), tag: document.querySelector('#card-tag').textContent }));
  assert(report.stamp === '1CC · ONE CREDIT CLEAR' && /RESULT\s+CONTAINED/.test(report.text), JSON.stringify(report));
  assert(/CREDITS/.test(report.primary) && report.rows.join() === 'play-button,copy-button,newrun-button,menu-button', JSON.stringify(report.rows));
  assert(/OMICRON PRIME NEUTRALIZED/.test(report.tag), report.tag);
  await shot(page, 'final-report');
  await page.keyboard.up('Space');
  await sleep(1300); // past the report's own lockout
  // CREDITS: a fresh Enter on the focused primary row rolls them. Keep it held through the first card.
  await page.keyboard.down('Enter');
  await waitReel(page, 'credits');
  const roll = await reel(page);
  assert(roll.count === 7 && roll.id === 'title', JSON.stringify(roll));
  await shot(page, 'credits-1-title');
  const c0 = Date.now();
  while (Date.now() - c0 < 1800) {
    await page.keyboard.down('Enter');
    await sleep(40);
  }
  assert((await reel(page)).index === 0, 'a held Enter did not skip the first credit card');
  await page.keyboard.up('Enter');
  // The same with Space, pressed fresh and then held (its button click would only come on release).
  await pastLockout(page);
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__game.reel().index === 1, null, { timeout: 10000 });
  const c1 = Date.now();
  while (Date.now() - c1 < 1500) {
    await page.keyboard.down('Space');
    await sleep(40);
  }
  assert((await reel(page)).index === 1, 'a held Space turned exactly one card, then nothing more');
  await page.keyboard.up('Space');
  // Now press through every card, each after its lockout; a press inside the lockout does nothing.
  const seen = [roll.id, (await reel(page)).id];
  const shots = ['title', 'original', 'version', 'three', 'sound', 'lettering', 'thanks'];
  for (let i = 2; i < 7; i++) {
    await pastLockout(page);
    const before = (await reel(page)).index;
    await page.keyboard.press('Space');
    await page.waitForFunction((n) => window.__game.reel().index === n, before + 1, { timeout: 10000 });
    await page.keyboard.press('Space'); // inside the new card's lockout
    const now = await reel(page);
    assert(now.index === before + 1, `a second press inside the lockout was ignored (${now.index})`);
    seen.push(now.id);
    await sleep(1300);
    await shot(page, `credits-${i + 1}-${shots[i]}`);
  }
  const ids = await page.evaluate(async () => (await import('./credits.mjs')).CREDITS.map((c) => c.id));
  assert(seen.join() === ids.join(), `the roll played the credits data in order: ${seen}`);
  await pastLockout(page);
  await page.keyboard.press('Space'); // the last card
  await waitScreen(page, 'title');
  const end = await page.evaluate(() => ({ phase: window.__game.getState().phase, saved: !!window.__game.saved(), resume: !document.querySelector('#resume-button').hidden, hud: getComputedStyle(document.querySelector('.hud > *')).visibility, focus: document.activeElement?.id }));
  assert(end.phase === 'title' && !end.saved && !end.resume, `back on the title with nothing to continue: ${JSON.stringify(end)}`);
  await shot(page, 'title-after-credits');
  // After the credits a new run starts, with its briefing.
  await page.keyboard.press('Space');
  await waitReel(page, 'briefing');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => !window.__game.reel(), null, { timeout: 10000 });
  const run = await page.evaluate(() => { const s = window.__game.getState(); return { wave: s.wave, phase: s.phase, creditsUsed: s.creditsUsed, practice: !!s.practice }; });
  assert(run.wave === 1 && run.phase === 'playing' && run.creditsUsed === 0 && !run.practice, JSON.stringify(run));
  assert(errors.length === 0, errors.join('; '));
  return { epilogueTurns: path.map((p) => p.atT), cards: seen.length };
});

await check('ending: the epilogue and credits end on their own clock when nobody presses (calm timing), and Escape skips each', async () => {
  const { page, errors } = await open();
  await winRun(page);
  await waitReel(page, 'epilogue');
  const start = Date.now();
  await page.waitForFunction(() => (() => { const o = document.querySelector('#overlay'); return !o.hidden && o.dataset.screen === 'won'; })() && !window.__game.reel(), null, { timeout: 90000 });
  const epilogueSeconds = (Date.now() - start) / 1000;
  assert(epilogueSeconds > 8 && epilogueSeconds < 150, `the unattended epilogue took ${epilogueSeconds.toFixed(1)} s (nominal 14 s; a busy machine stretches it)`);
  // Credits by the FINAL REPORT's own button, then Escape.
  await sleep(1200);
  await page.locator('#play-button').click();
  await waitReel(page, 'credits');
  await pastLockout(page);
  await page.waitForFunction(() => window.__game.reel().index === 1, null, { timeout: 30000 }); // the first card turned by itself
  await page.keyboard.press('Escape');
  await waitScreen(page, 'title');
  assert((await phaseOf(page)) === 'title', 'Escape ends the roll on the title');
  // The FINAL REPORT's NEW RUN skips the credits, for a repeat win.
  await winRun(page);
  await waitReel(page, 'epilogue');
  await pastLockout(page);
  await page.keyboard.press('Escape'); // skips the whole epilogue to the report
  await waitScreen(page, 'won');
  await sleep(1200);
  await page.locator('#newrun-button').click();
  await waitReel(page, 'briefing');
  assert((await page.evaluate(() => window.__game.getState().wave)) === 1, 'NEW RUN starts at 1-1 with its briefing');
  assert(errors.length === 0, errors.join('; '));
  return { epilogueSeconds: Number(epilogueSeconds.toFixed(1)) };
});

await check('ending: R and the tray after a win: R does not restart OMICRON, the tray opens, the report returns, practice and the campaign still start', async () => {
  const { page, errors } = await open();
  await winRun(page);
  await waitReel(page, 'epilogue');
  await pastLockout(page);
  await page.keyboard.press('Escape');
  await waitScreen(page, 'won');
  await sleep(1200);
  await page.keyboard.press('KeyR');
  await sleep(300);
  assert((await phaseOf(page)) === 'won' && (await screenOf(page)) === 'won', 'R does nothing under a won run');
  // PRACTICE / TRAY, then BACK to the same report.
  await page.locator('#menu-button').click();
  await page.waitForFunction(() => (() => { const o = document.querySelector('#overlay'); return !o.hidden && o.dataset.screen === 'map'; })(), null, { timeout: 10000 });
  await shot(page, 'tray-after-win');
  await page.locator('#map-back').click();
  await waitScreen(page, 'won');
  // The campaign tab: start 1-1 from the tray (a new run: briefing), then 4-3 (no briefing).
  await page.locator('#menu-button').click();
  await page.waitForFunction(() => (() => { const o = document.querySelector('#overlay'); return !o.hidden && o.dataset.screen === 'map'; })(), null, { timeout: 10000 });
  await page.locator('#tray-rows [data-stage="12"]').click();
  await sleep(500);
  assert((await reel(page)) === null && (await phaseOf(page)) === 'playing' && (await page.evaluate(() => window.__game.getState().wave)) === 12, 'a later stage from the tray has no briefing');
  await page.evaluate(() => window.__game.menu());
  await page.waitForFunction(() => (() => { const o = document.querySelector('#overlay'); return !o.hidden && o.dataset.screen === 'map'; })(), null, { timeout: 10000 });
  await page.locator('#tray-rows [data-stage="1"]').click();
  await waitReel(page, 'briefing');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !window.__game.reel(), null, { timeout: 10000 });
  // Practice a cleared sample.
  await page.evaluate(() => window.__game.menu());
  await page.waitForFunction(() => (() => { const o = document.querySelector('#overlay'); return !o.hidden && o.dataset.screen === 'map'; })(), null, { timeout: 10000 });
  await page.locator('#tray-tabs [data-mode="practice"]').click();
  const dish = page.locator('#tray-rows [data-practice]:not([disabled])').first();
  assert((await dish.count()) > 0, 'a cleared sample can be practised');
  await dish.click();
  await sleep(500);
  const practice = await page.evaluate(() => ({ practice: !!window.__game.getState().practice, phase: window.__game.getState().phase, reel: window.__game.reel() }));
  assert(practice.practice && practice.phase === 'playing' && practice.reel === null, JSON.stringify(practice));
  assert(errors.length === 0, errors.join('; '));
});

// ---- 3. The title's CREDITS button -----------------------------------------------
await check('credits: the title button plays the same cards, a held Enter cannot skip them, Escape and the last card return to the title', async () => {
  const { page, errors } = await open();
  const data = await page.evaluate(async () => (await import('./credits.mjs')).CREDITS.map((c) => ({ id: c.id, lines: c.lines })));
  await onTitle(page);
  await page.locator('#title-credits').focus();
  await page.keyboard.down('Enter'); // keyboard-only: Enter on the focused button
  await waitReel(page, 'credits');
  for (let i = 0; i < 30; i++) {
    await page.keyboard.down('Enter');
    await sleep(40);
  }
  assert((await reel(page)).index === 0, 'a held Enter did not skip the first card');
  await page.keyboard.up('Enter');
  const seen = [];
  for (let i = 0; i < data.length; i++) {
    await pastLockout(page);
    const r = await reel(page);
    seen.push({ id: r.id, lines: r.lines });
    const inDom = await page.evaluate(() => document.querySelector('#overlay-body').innerText);
    for (const line of data[i].lines) if (r.id !== 'title') assert(inDom.includes(line.trim()), `card ${r.id} shows "${line}"`);
    if (i === data.length - 1) break;
    await page.keyboard.press('Enter');
    await page.waitForFunction((n) => window.__game.reel().index === n, i + 1, { timeout: 10000 });
  }
  assert(JSON.stringify(seen) === JSON.stringify(data), 'the title button plays exactly the same data as the ending');
  await page.keyboard.press('Enter');
  await waitScreen(page, 'title');
  assert((await phaseOf(page)) === 'title' && (await page.evaluate(() => document.activeElement?.id)) === 'play-button', 'back on the title, focus on START');
  // Again with the mouse, and Escape.
  await onTitle(page);
  await page.locator('#title-credits').click();
  await waitReel(page, 'credits');
  await pastLockout(page);
  await page.keyboard.press('Escape');
  await waitScreen(page, 'title');
  // The attract loop's compact card shows the same text.
  const compact = await page.evaluate(async () => (await import('./ui.mjs')).creditsCard().replace(/<[^>]+>/g, ' '));
  for (const card of data.filter((c) => c.id !== 'title' && c.id !== 'thanks')) assert(compact.includes(card.lines[0]), card.id);
  assert(errors.length === 0, errors.join('; '));
  return { cards: seen.length };
});

// ---- 4. Layout at other desktop sizes ----------------------------------------------
await check('layout: the reel card fits a small and a large desktop window (no overflow, nothing clipped)', async () => {
  for (const viewport of [{ width: 800, height: 520 }, { width: 1280, height: 720 }]) {
    const { page, errors } = await open({ viewport });
    await onTitle(page);
    await page.locator('#title-credits').click();
    await waitReel(page, 'credits');
    await pastLockout(page);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__game.reel().index === 1, null, { timeout: 10000 });
    await sleep(800);
    const box = await page.evaluate(() => {
      const card = document.querySelector('#card').getBoundingClientRect();
      const stage = document.querySelector('#stage').getBoundingClientRect();
      const body = document.querySelector('#card');
      return { card: [card.left, card.top, card.right, card.bottom].map(Math.round), stage: [stage.left, stage.top, stage.right, stage.bottom].map(Math.round), scroll: body.scrollHeight - body.clientHeight };
    });
    assert(box.card[0] >= box.stage[0] && box.card[1] >= box.stage[1] && box.card[2] <= box.stage[2] && box.card[3] <= box.stage[3] && box.scroll <= 1, `${viewport.width}x${viewport.height}: ${JSON.stringify(box)}`);
    await shot(page, `credits-${viewport.width}x${viewport.height}`);
    assert(errors.length === 0, errors.join('; '));
  }
});

for (const ctx of contexts) await ctx.close();
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
process.exit(failed ? 1 : 0);
