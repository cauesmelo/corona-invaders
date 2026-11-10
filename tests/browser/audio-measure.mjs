/** Audio measurement in a real browser (README "Sound"). Not part of
 * `npm test` (it needs Chrome):
 *
 *   node tests/browser/audio-measure.mjs [--before <git-ref>] [--json out.json]
 *
 * Every SFX_CATALOG entry (audio.mjs) is rendered offline (OfflineAudioContext,
 * 48 kHz stereo) through the real engine and its master chain, then measured:
 *   peak    sample peak, dBFS
 *   LUFS-M  max momentary loudness (ITU-R BS.1770 K-weighting, 400 ms windows,
 *           100 ms hop; short sounds include their silence, as momentary does)
 *   attack  onset (first 1 ms envelope above -60 dBFS) to 90% of the peak, ms
 *   length  onset to the last envelope sample above -60 dBFS, ms
 * plus a 4 s "busy mix" (auto-fire, hits, chained kills, grazes, a SOAP, a
 * lost vial and a card start over the march) to prove the limiter: peak and
 * the number of samples at or above 0.99.
 *
 * Every render starts with PRE (1.5 s) of silence that is not analysed:
 * Chrome's DynamicsCompressorNode starts fully reduced and releases toward
 * its settled gain, so a sound at t = 0 of a fresh context reads 10-20 dB
 * too quiet. In the game the context has been running since the first
 * gesture, which the pre-roll reproduces.
 *
 * `--before <ref>` also renders the audio.mjs of that commit (fetched with
 * `git show`, served to the page by request interception) on the same
 * fixtures, for the before/after table. Event timing uses
 * OfflineAudioContext.suspend(), so neither engine needs a clock hook.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDemoServer } from '../../serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_FROM || new URL('../../../common/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const before = arg('--before');
const jsonOut = arg('--json');

const server = createDemoServer(root);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.route('**/__measure.html', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>measure</title>' }));
if (before) {
  const old = execFileSync('git', ['show', `${before}:audio.mjs`], { cwd: root, encoding: 'utf8' }).replace(/from '\.\//g, "from '/");
  await page.route('**/__old/audio.mjs', (route) => route.fulfill({ contentType: 'text/javascript', body: old }));
}
await page.goto(base + '__measure.html');

const result = await page.evaluate(async ({ withOld }) => {
  const SR = 48000;
  const next = await import('/audio.mjs');
  const old = withOld ? await import('/__old/audio.mjs') : null;
  const { SFX_CATALOG, fixtureState } = next;
  // BS.1770 K-weighting at 48 kHz (pre-filter shelf, then RLB high-pass).
  const biquad = (x, [b0, b1, b2, a1, a2]) => {
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  };
  const SHELF = [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585];
  const RLB = [1, -2, 1, -1.99004745483398, 0.99007225036621];
  const PRE = 1.5;
  function analyse(full) {
    const from = Math.round(PRE * SR);
    const buf = { length: full.length - from, getChannelData: (i) => full.getChannelData(i).subarray(from) };
    const chans = [buf.getChannelData(0), buf.getChannelData(1)];
    let peak = 0, clipped = 0;
    for (const c of chans) for (const v of c) {
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 0.99) clipped++;
    }
    const k = chans.map((c) => biquad(biquad(c, SHELF), RLB));
    const win = Math.round(SR * 0.4), hop = Math.round(SR * 0.1);
    let maxM = -Infinity;
    for (let s = 0; s + win <= buf.length; s += hop) {
      let sum = 0;
      for (const c of k) {
        let ms = 0;
        for (let i = s; i < s + win; i++) ms += c[i] * c[i];
        sum += ms / win;
      }
      if (sum > 0) maxM = Math.max(maxM, -0.691 + 10 * Math.log10(sum));
    }
    // 1 ms peak envelope (max of both channels).
    const step = Math.round(SR / 1000), env = [];
    for (let s = 0; s < buf.length; s += step) {
      let m = 0;
      for (const c of chans) for (let i = s; i < Math.min(buf.length, s + step); i++) m = Math.max(m, Math.abs(c[i]));
      env.push(m);
    }
    const max = Math.max(...env), onset = env.findIndex((v) => v > 0.001);
    let end = onset;
    for (let i = env.length - 1; i >= 0; i--) if (env[i] > 0.001) { end = i; break; }
    const top = onset < 0 ? -1 : env.findIndex((v, i) => i >= onset && v >= 0.9 * max);
    return {
      peak: peak > 0 ? +(20 * Math.log10(peak)).toFixed(1) : null,
      lufs: Number.isFinite(maxM) ? +maxM.toFixed(1) : null,
      attack: onset < 0 ? null : top - onset,
      length: onset < 0 ? null : end - onset,
      clipped,
    };
  }
  /** Render steps [{at, ev, s}] (or a voice / march) through one engine. */
  async function render(kind, steps, seconds, special) {
    const ctx = new OfflineAudioContext(2, Math.round(SR * (seconds + PRE)), SR);
    // The engines call resume() when enabled; an offline context cannot be
    // resumed before it renders, so they get a no-op and the suspend points
    // below use the real one.
    const resume = ctx.resume.bind(ctx);
    ctx.resume = () => Promise.resolve();
    let engine;
    if (kind === 'old') {
      const saved = window.AudioContext;
      window.AudioContext = function () { return ctx; };
      engine = old.createAudio();
      engine.setEnabled(true, { quiet: true });
      window.AudioContext = saved;
    } else {
      engine = next.createAudio({ context: ctx });
      engine.setEnabled(true, { quiet: true });
    }
    const q = (t) => Math.round((t * SR) / 128) * 128 / SR; // render quantum
    const byTime = new Map();
    for (const st of steps) {
      const t = q(st.at + PRE);
      if (!byTime.has(t)) byTime.set(t, []);
      byTime.get(t).push(st);
    }
    const run = (list) => {
      for (const st of list) {
        if (st.voice) {
          if (engine.voice) engine.voice(st.voice);
        } else if (st.tick) engine.tick(st.s, true);
        else engine.event(st.ev, st.s || fixtureState());
      }
    };
    for (const [t, list] of [...byTime].sort((a, b) => a[0] - b[0])) {
      if (t <= 0) run(list);
      else
        ctx.suspend(t).then(() => {
          try {
            run(list);
          } finally {
            resume();
          }
        });
    }
    return analyse(await ctx.startRendering());
  }
  const rows = [];
  for (const e of SFX_CATALOG) {
    const steps = e.voice ? [{ at: 0, voice: e.voice }] : e.seq || [{ at: 0, ev: e.ev, s: e.s }];
    const span = Math.max(...steps.map((s) => s.at));
    const seconds = span + (e.group === 'Bosses' ? 4 : 2.2);
    const row = { id: e.id, group: e.group, label: e.label, seq: !!e.seq, next: await render('new', steps, seconds) };
    if (old) row.old = await render('old', steps, seconds);
    // Attack is reported for single sounds only (a sequence's loudest moment
    // is a later event, not its attack).
    if (e.seq) for (const m of [row.next, row.old]) if (m) m.attack = null;
    rows.push(row);
  }
  // The march: 2 s of bass at a full sample (72 bpm) and nearly empty (144).
  const march = (fraction) => {
    const s = fixtureState({ enemies: Array.from({ length: 20 }, (_, i) => ({ id: i, kind: 'wild', alive: i < 20 * fraction })) });
    return Array.from({ length: 40 }, (_, i) => ({ at: i * 0.05, tick: true, s }));
  };
  for (const [id, f] of [['march-72', 1], ['march-144', 0]]) {
    const row = { id, group: 'Bed', label: `Bass march ${id.slice(6)} bpm (2 s)`, next: await render('new', march(f), 2.6) };
    if (old) row.old = await render('old', march(f), 2.6);
    rows.push(row);
  }
  // Busy mix: the densest moment the game produces, over 4 s.
  const busy = [];
  const S = (count) => fixtureState({ chain: { count }, enemies: [{ id: 'w', kind: 'wild', alive: true, hp: 2, maxHp: 3, x: 0 }] });
  for (let t = 0; t < 4; t += 0.125) busy.push({ at: t, ev: { type: 'shot', x: 0, focus: false } });
  for (let t = 0; t < 4; t += 0.04) busy.push({ at: t, ev: { type: 'hit', kind: 'wild', id: 'w', x: Math.sin(t * 7) * 6 }, s: S(1) });
  let n = 0;
  for (let t = 0.1; t < 4; t += 0.2) busy.push({ at: t, ev: { type: 'kill', kind: n % 4 ? 'wild' : 'heavy', x: Math.cos(t) * 6 }, s: S(++n) });
  for (let t = 0.05; t < 4; t += 0.08) busy.push({ at: t, ev: { type: 'graze', x: 0.5 } });
  busy.push({ at: 1, ev: { type: 'bomb', x: 0 } }, { at: 2.2, ev: { type: 'hit-core', x: 0 } }, { at: 2.38, ev: { type: 'damage', x: 0 }, s: S(1) }, { at: 3, ev: { type: 'card-end', neutralized: true, cardType: 'card' } }, { at: 3.1, ev: { type: 'phase-break' } });
  const ms = fixtureState({ enemies: Array.from({ length: 20 }, (_, i) => ({ id: i, kind: 'wild', alive: i < 8 })) });
  for (let t = 0; t < 4; t += 0.05) busy.push({ at: t, tick: true, s: ms });
  const mix = { next: await render('new', busy, 5.5) };
  if (old) mix.old = await render('old', busy, 5.5);
  return { rows, mix, sampleRate: SR };
}, { withOld: !!before });

await browser.close();
server.close();
const fmt = (m) => (m ? `${m.peak ?? '—'} / ${m.lufs ?? '—'} / ${m.attack ?? '—'} / ${m.length ?? '—'}` : '');
console.log(`| Sound | ${before ? 'Before (peak dBFS / LUFS-M / attack ms / length ms) | ' : ''}After |`);
console.log(`| --- | ${before ? '--- | ' : ''}--- |`);
for (const r of result.rows) console.log(`| ${r.label} | ${before ? (r.old?.peak === null ? 'silent' : fmt(r.old)) + ' | ' : ''}${fmt(r.next)} |`);
console.log(`\nBusy mix (4 s): after peak ${result.mix.next.peak} dBFS, ${result.mix.next.lufs} LUFS-M, ${result.mix.next.clipped} samples >= 0.99` + (before ? `; before peak ${result.mix.old.peak} dBFS, ${result.mix.old.lufs} LUFS-M, ${result.mix.old.clipped} samples >= 0.99` : ''));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(result, null, 2) + '\n');
