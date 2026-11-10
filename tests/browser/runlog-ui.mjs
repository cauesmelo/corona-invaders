/** The owner calibration kit in a real browser: the title's difficulty switch,
 * the run log on the run-over screen and COPY RUN LOG. Not part of `npm test`
 * (it needs Chrome); run with the game served locally:
 *
 *   node serve.mjs --port 4439 &
 *   node tests/browser/runlog-ui.mjs http://127.0.0.1:4439/ [--shots DIR]
 *
 * Real key events and clicks; the only fixture is `__game.setState`, used to
 * put one bullet on the core so a run can be lost on purpose.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(process.env.PLAYWRIGHT_FROM || new URL('../../../common/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const args = process.argv.slice(2);
const BASE = args.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:4439/';
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
  }
}
const assert = (ok, msg) => {
  if (!ok) throw new Error(msg);
};

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-webgl'] });
async function open(viewport, { clipboard = true } = {}) {
  const ctx = await browser.newContext({ viewport, permissions: clipboard ? ['clipboard-read', 'clipboard-write'] : [], hasTouch: viewport.width < 500, isMobile: viewport.width < 500 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE);
  await page.waitForFunction(() => window.__game && document.querySelector('#overlay')?.dataset.screen === 'title', null, { timeout: 30000 });
  return { ctx, page, errors };
}
const shot = (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
const mode = (page) =>
  page.evaluate(() => ({
    checked: [...document.querySelectorAll('#mode-switch [aria-checked="true"]')].map((b) => b.dataset.mode),
    stops: [...document.querySelectorAll('#mode-switch [tabindex="0"]')].length,
    note: document.querySelector('#mode-note').textContent,
    stored: JSON.parse(localStorage.getItem('corona-invaders-v6-difficulty') ?? 'null'),
    easyStart: !document.querySelector('#easy-start').hidden,
    state: __game.getState().difficulty,
  }));

// ---- The switch ----------------------------------------------------------------
await check('title: EASY / NORMAL / HARD, Normal chosen, one tab stop, a description, the first-visit offer', async () => {
  const { ctx, page, errors } = await open({ width: 960, height: 540 });
  const m = await mode(page);
  assert(m.checked.join() === 'normal' && m.stops === 1 && m.state === 'normal' && m.easyStart && /DESIGNED GAME/.test(m.note), JSON.stringify(m));
  const labels = await page.$$eval('#mode-switch [role=radio]', (els) => els.map((e) => e.textContent.trim()));
  assert(labels.join() === 'EASY,NORMAL,HARD', labels.join());
  await shot(page, 'title-960x540');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});
await check('title: arrow keys step the switch (no wrap), save the choice, and it survives a reload', async () => {
  const { ctx, page } = await open({ width: 960, height: 540 });
  await page.keyboard.press('ArrowRight');
  let m = await mode(page);
  assert(m.checked[0] === 'hard' && m.stored === 'hard' && m.state === 'hard' && !m.easyStart && /MORE PRESSURE/.test(m.note), JSON.stringify(m));
  await page.keyboard.press('ArrowRight');
  assert((await mode(page)).checked[0] === 'hard', 'the right end does not wrap to EASY');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  m = await mode(page);
  assert(m.checked[0] === 'easy' && m.stored === 'easy' && /AUTO-SOAP/.test(m.note), JSON.stringify(m));
  await page.reload();
  await page.waitForFunction(() => window.__game && document.querySelector('#overlay')?.dataset.screen === 'title');
  m = await mode(page);
  assert(m.checked[0] === 'easy' && m.state === 'easy' && !m.easyStart, 'the saved choice returns: ' + JSON.stringify(m));
  await page.click('#mode-switch [data-mode="hard"]');
  assert((await mode(page)).stored === 'hard', 'a click chooses too');
  await ctx.close();
});
await check('a corrupt stored difficulty reads as Normal', async () => {
  const { ctx, page } = await open({ width: 960, height: 540 });
  await page.evaluate(() => localStorage.setItem('corona-invaders-v6-difficulty', JSON.stringify('nightmare')));
  await page.reload();
  await page.waitForFunction(() => window.__game && document.querySelector('#overlay')?.dataset.screen === 'title');
  assert((await mode(page)).checked[0] === 'normal', 'normal');
  await ctx.close();
});
await check('Hard run: 3 vials, 1 SOAP, a HARD chip in the HUD; the pause row cycles the mode', async () => {
  const { ctx, page } = await open({ width: 960, height: 540 });
  await page.click('#mode-switch [data-mode="hard"]');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => __game.getState().phase === 'playing');
  const s = await page.evaluate(() => ({ d: __game.getState().difficulty, health: __game.getState().health, bombs: __game.getState().ship.bombs, chip: document.querySelector('#mode-chip').textContent, hidden: document.querySelector('#mode-chip').hidden }));
  assert(s.d === 'hard' && s.health === 3 && s.bombs === 1 && s.chip === 'HARD' && !s.hidden, JSON.stringify(s));
  await page.keyboard.press('Escape');
  await page.waitForSelector('#difficulty-button:not([hidden])');
  const read = () => page.$eval('#difficulty-button', (e) => e.textContent);
  assert(/HARD/.test(await read()), await read());
  await page.click('#difficulty-button');
  assert(/EASY/.test(await read()), 'HARD cycles to EASY: ' + (await read()));
  await page.click('#difficulty-button');
  assert(/NORMAL/.test(await read()), await read());
  await ctx.close();
});

// ---- The run log ---------------------------------------------------------------
async function loseRun(page) {
  const kill = async () => {
    for (let tries = 0; tries < 8; tries++) {
      await page.evaluate(() => {
        const s = __game.getState();
        __game.setState({ health: 1, ship: { invulnerable: 0 }, enemyShots: [{ x: s.ship.x, z: s.ship.z, vx: 0, vz: 0, hit: 0.3, src: 'WILD TYPE', pattern: 'RAIN', family: 'droplet' }] });
      });
      await page.waitForTimeout(450);
      if ((await page.evaluate(() => __game.getState().phase)) === 'lost') return;
    }
    throw new Error('could not lose a vial on purpose');
  };
  await page.click('#mode-switch [data-mode="hard"]');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => __game.getState().phase === 'playing');
  await kill();
  for (let credit = 0; credit < 2; credit++) {
    await page.waitForTimeout(1200); // a retry key is ignored for 1 s after a loss
    await page.keyboard.press('Space');
    await page.waitForFunction(() => __game.getState().phase === 'playing');
    await kill();
  }
  await page.waitForFunction(() => __game.getState().runOver && !document.querySelector('#copy-button').hidden);
  // Space and Enter are ignored for 1 s on the loss screens (a held SOAP key must not dismiss the report).
  await page.waitForTimeout(1300);
}
await check('run over: the log is on the FINAL REPORT; COPY RUN LOG is reachable by key and puts the text on the clipboard', async () => {
  const { ctx, page, errors } = await open({ width: 960, height: 540 });
  await loseRun(page);
  const ui = await page.evaluate(() => {
    const card = document.querySelector('#card').getBoundingClientRect(),
      actions = document.querySelector('#actions').getBoundingClientRect();
    return { rows: document.querySelectorAll('.rl-row').length, head: document.querySelector('.rl-head')?.textContent, text: document.querySelector('.runlog')?.textContent, within: actions.bottom <= card.bottom + 1 && actions.top >= card.top, result: document.querySelector('#overlay').dataset.result };
  });
  assert(ui.rows === 1 && /STG/.test(ui.head) && /WILD TYPE RAIN/.test(ui.text) && ui.within && ui.result === 'final', JSON.stringify(ui));
  await shot(page, 'runover-960x540');
  await page.keyboard.press('ArrowDown');
  assert((await page.evaluate(() => document.activeElement?.id)) === 'copy-button', 'ArrowDown reaches COPY RUN LOG');
  await page.keyboard.press('Enter');
  // Interval polling: the confirmation is short-lived and rAF polling starves on a loaded machine.
  await page.waitForFunction(() => /COPIED/.test(document.querySelector('#copy-button').textContent), null, { polling: 40 });
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const lines = clip.split('\n');
  assert(/^CORONA INVADERS v[\d.]+ \| HARD \| seed \d+ \| RUN OVER at 1-1/.test(lines[0]), lines[0]);
  assert(lines.length <= 30 && /^[\x0a\x20-\x7e]+$/.test(clip), 'ASCII, at most 30 lines');
  assert(lines.some((l) => /^1-1 FIRST CONTACT\s+lost 3\s+\d+s\s+2 continues.*hit: WILD TYPE RAIN x3/.test(l)), clip);
  await shot(page, 'runover-copied-960x540');
  await page.evaluate(() => navigator.clipboard.writeText('x'));
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(250);
  assert((await page.evaluate(() => navigator.clipboard.readText())).startsWith('CORONA INVADERS'), 'the C key copies too');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});
await check('copy fallbacks: a denied clipboard falls back to execCommand; both failing shows a selected textarea', async () => {
  const { ctx, page, errors } = await open({ width: 960, height: 540 }, { clipboard: false });
  await loseRun(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) }, configurable: true });
    window.__copied = null;
    document.execCommand = (cmd) => {
      if (cmd !== 'copy') return false;
      window.__copied = document.activeElement?.value ?? [...document.querySelectorAll('textarea')].at(-1)?.value;
      return true;
    };
  });
  await page.click('#copy-button');
  // Interval polling: the confirmation is short-lived and rAF polling starves on a loaded machine.
  await page.waitForFunction(() => /COPIED/.test(document.querySelector('#copy-button').textContent), null, { polling: 40 });
  assert((await page.evaluate(() => window.__copied)).startsWith('CORONA INVADERS'), 'execCommand received the text');
  await page.evaluate(() => (document.execCommand = () => false));
  await page.click('#copy-button');
  await page.waitForSelector('#runlog-text');
  const t = await page.evaluate(() => ({ value: document.querySelector('#runlog-text').value, selected: document.querySelector('#runlog-text').selectionEnd - document.querySelector('#runlog-text').selectionStart, label: document.querySelector('#copy-button').textContent }));
  assert(t.value.startsWith('CORONA INVADERS') && t.selected === t.value.length && /FAILED/.test(t.label), JSON.stringify(t).slice(0, 200));
  await shot(page, 'copy-fallback-960x540');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});
await check('loss screen on Hard: after 3 failures SWITCH TO EASY is offered, and taking it saves Easy', async () => {
  const { ctx, page } = await open({ width: 960, height: 540 });
  await page.click('#mode-switch [data-mode="hard"]');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => __game.getState().phase === 'playing');
  for (let tries = 0; tries < 8; tries++) {
    await page.evaluate(() => {
      const s = __game.getState();
      __game.setState({ failures: 3, health: 1, ship: { invulnerable: 0 }, enemyShots: [{ x: s.ship.x, z: s.ship.z, vx: 0, vz: 0, hit: 0.3, src: 'WILD TYPE', pattern: 'RAIN', family: 'droplet' }] });
    });
    await page.waitForTimeout(450);
    if ((await page.evaluate(() => __game.getState().phase)) === 'lost') break;
  }
  await page.waitForSelector('#easy-button:not([hidden])');
  await page.click('#easy-button');
  await page.waitForFunction(() => __game.getState().phase === 'playing');
  const s = await page.evaluate(() => ({ d: __game.getState().difficulty, stored: JSON.parse(localStorage.getItem('corona-invaders-v6-difficulty')), chip: document.querySelector('#mode-chip').textContent }));
  assert(s.d === 'easy' && s.stored === 'easy' && s.chip === 'EASY', JSON.stringify(s));
  await ctx.close();
});
for (const [w, h] of [[390, 844], [320, 568]]) {
  await check(`run over at ${w}x${h}: no horizontal scroll, the controls are pinned inside the card`, async () => {
    const { ctx, page } = await open({ width: w, height: h });
    await loseRun(page);
    const m = await page.evaluate(() => {
      const card = document.querySelector('#card').getBoundingClientRect(),
        a = document.querySelector('#actions').getBoundingClientRect(),
        copy = document.querySelector('#copy-button').getBoundingClientRect();
      return { hScroll: document.documentElement.scrollWidth > innerWidth, actionsInside: a.bottom <= card.bottom + 1 && a.top >= card.top, copyTall: copy.height >= 40, copyInside: copy.right <= innerWidth && copy.left >= 0 };
    });
    assert(!m.hScroll && m.actionsInside && m.copyTall && m.copyInside, JSON.stringify(m));
    await shot(page, `runover-${w}x${h}`);
    await ctx.close();
  });
}
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} browser checks passed`);
process.exitCode = failed ? 1 : 0;
