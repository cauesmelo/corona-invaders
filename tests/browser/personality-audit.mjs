/** Villain personality in a real browser (README "Villains"). Not part of
 * `npm test` (it needs Chrome):
 *
 *   node tests/browser/personality-audit.mjs [--root <game folder>] [--json out.json]
 *
 * Chrome via Playwright (channel 'chrome', SwiftShader software WebGL, the
 * same rasterizer as the root QA), 960x640 at device pixel ratio 1. For each
 * scene the real frame loop runs for a few seconds with an invulnerable
 * syringe and no input, and the page records:
 *   frame   requestAnimationFrame intervals: median, p95, worst (ms) and fps
 *   bodies  every live enemy's drawn body, measured from the real world
 *           matrices of its mesh (__game.audit): the board footprint may
 *           never exceed the collider radius, and is reported as min/max of
 *           drawn / collider over the scene
 *   faces   every face decal: centre offset + feature reach must stay inside
 *           its anchor's silhouette on screen (px)
 * `--root` runs the same scenes against another checkout (e.g. a git
 * worktree of the commit before the personality pass) for frame-time
 * before/after; the body and face audits are skipped where __game.audit does
 * not exist.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDemoServer } from '../../serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_FROM || new URL('../../../common/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const root = path.resolve(arg('--root') || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const server = createDemoServer(root);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(base + 'index.html');
await page.waitForFunction(() => window.__game?.renderer().triangles > 0);
await page.evaluate(() => __game.setState({ unlockedStage: 18 }));

const SCENES = [
  { name: 'title', setup: () => {} },
  { name: '1-1 choir (60 minis)', setup: () => __game.checkpoint(1) },
  { name: '1-3 popcorn + BIG SNEEZER', setup: () => __game.checkpoint(3), wait: 9 },
  { name: 'ALPHA fight', setup: () => __game.checkpoint(4) },
  { name: 'BETA & GAMMA', setup: () => __game.checkpoint(9) },
  { name: 'OMICRON SPIKE CROWN', setup: () => __game.checkpoint(18) },
  { name: '4-3 busy stage', setup: () => __game.checkpoint(17), wait: 6 },
];
const results = [];
for (const sc of SCENES) {
  await page.evaluate((src) => {
    Function('return (' + src + ')')()();
    if (window.__game.getState().phase !== 'title') window.__game.setState({ ship: { invulnerable: 1e9 } });
  }, sc.setup.toString());
  // Let the scene settle (entrance slides, first spawns).
  await page.waitForTimeout((sc.wait ?? 2.5) * 1000);
  const r = await page.evaluate(async (seconds) => {
    const g = window.__game;
    const frames = [];
    let last = performance.now();
    const body = { min: Infinity, max: 0, n: 0, over: [] },
      face = { worst: -Infinity, n: 0, outside: [] };
    const t0 = last;
    let nextAudit = t0;
    await new Promise((done) => {
      function tick(now) {
        frames.push(now - last);
        last = now;
        if (g.audit && now >= nextAudit) {
          nextAudit = now + 250;
          const a = g.audit();
          for (const e of a?.enemies || []) {
            const k = e.drawn / e.collider;
            body.min = Math.min(body.min, e.min / e.collider);
            body.max = Math.max(body.max, k);
            body.n++;
            if (k > 1 + 1e-6) body.over.push(`${e.char} ${k.toFixed(4)}`);
          }
          for (const f of a?.faces || []) {
            const slack = f.offset + f.reach - f.silhouette;
            face.worst = Math.max(face.worst, slack);
            face.n++;
            if (slack > 0.75) face.outside.push(`${f.char} +${slack.toFixed(2)} px`);
          }
        }
        if (now - t0 < seconds * 1000) requestAnimationFrame(tick);
        else done();
      }
      requestAnimationFrame(tick);
    });
    frames.shift();
    const sorted = [...frames].sort((a, b) => a - b);
    const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    const s = g.getState();
    return {
      frames: frames.length,
      median: +q(0.5).toFixed(1),
      p95: +q(0.95).toFixed(1),
      worst: +sorted.at(-1).toFixed(1),
      fps: +((frames.length / frames.reduce((a, b) => a + b, 0)) * 1000).toFixed(1),
      enemies: s.enemies.filter((e) => e.alive).length,
      bullets: s.enemyShots.length,
      calls: g.renderer().calls,
      body: body.n ? { samples: body.n, min: +body.min.toFixed(3), max: +body.max.toFixed(4), over: body.over.slice(0, 5) } : null,
      face: face.n ? { samples: face.n, worstSlackPx: +face.worst.toFixed(2), outside: face.outside.slice(0, 5) } : null,
    };
  }, 5);
  results.push({ scene: sc.name, ...r });
  console.log(`${sc.name}: median ${r.median} ms, p95 ${r.p95} ms, worst ${r.worst} ms, ${r.fps} fps; ${r.enemies} enemies, ${r.bullets} bullets, ${r.calls} calls` + (r.body ? `; bodies drawn/collider ${r.body.min}-${r.body.max}${r.body.over.length ? ' OVER ' + r.body.over.join(', ') : ''}` : '') + (r.face ? `; faces worst slack ${r.face.worstSlackPx} px${r.face.outside.length ? ' OUTSIDE ' + r.face.outside.join(', ') : ''}` : ''));
}
await browser.close();
server.close();
if (errors.length) console.log('page errors:', errors);
const jsonOut = arg('--json');
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ root, results, errors }, null, 2) + '\n');
const bad = results.some((r) => r.body?.over.length || r.face?.outside.length) || errors.length;
if (bad) process.exitCode = 1;
