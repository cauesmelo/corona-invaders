/** The 3D draft in a real browser (RESEARCH_DIFFICULTY.md §8 D7 / D8). Not
 * part of `npm test` (it needs Chrome); run with the game served locally:
 *
 *   node serve.mjs --port 4436 &
 *   node tests/browser/draft-3d.mjs http://127.0.0.1:4436/ [--shots DIR] [--json FILE]
 *
 * Chrome via Playwright (channel 'chrome', SwiftShader WebGL, DPR 1).
 * Playwright is resolved from ../common or PLAYWRIGHT_FROM.
 *
 * D7 (function): during the draft the canvas is visible and no visible DOM
 * shows card content (only the control bar and the hidden live region);
 * __game.draft.scene() has 3 cartridges matching run.offer, on-screen rects
 * that do not overlap, labels = name + stat, label cap heights >= 14 px at
 * 960x640 and >= 11 px at 320x568; picks by keys 1-3 + Enter, a mouse click
 * on the cartridge and a touch tap + INJECT; RESAMPLE and DISCARD; play
 * resumes <= 1.2 s after a pick; a shading probe (lit 3D, not flat) and
 * distinct tier materials (frosted roughness >= 0.45, gold cap metalness 1).
 *
 * D8 (frame time): idle median <= 20 ms and p95 <= 33 ms over 120 frames,
 * drop-in p95 <= 33 ms, inject p95 <= 40 ms, first open <= 150 ms, <= 40
 * draw calls and <= 25,000 triangles, LITE off. Frame time is only judged
 * on a machine with load average <= 4; above that the check is reported
 * INCONCLUSIVE with its numbers and the load, never PASS.
 */
import { createRequire } from 'node:module';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(process.env.PLAYWRIGHT_FROM || new URL('../../../common/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const args = process.argv.slice(2);
const BASE = args.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:4436/';
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const SHOTS = flag('--shots');
// --only SUBSTRING runs just the checks whose name contains it (iterating).
const ONLY = flag('--only');
const JSON_OUT = flag('--json');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const MAX_LOAD = 4;

const results = [];
const load = () => os.loadavg().map((v) => Math.round(v * 100) / 100);
async function check(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  const t0 = Date.now();
  try {
    const detail = await fn();
    const status = detail?.inconclusive ? 'INCONCLUSIVE' : 'PASS';
    results.push({ name, status, ms: Date.now() - t0, detail });
    console.log(`${status.padEnd(12)} ${name}${detail ? ` ${JSON.stringify(detail)}` : ''}`);
  } catch (error) {
    results.push({ name, status: 'FAIL', ms: Date.now() - t0, error: String(error?.stack || error) });
    console.log(`FAIL         ${name}\n  ${String(error?.message || error)}`);
  }
}
const assert = (ok, msg) => {
  if (!ok) throw new Error(msg);
};

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });

async function page({ width = 960, height = 640, touch = false, reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch, reducedMotion });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto(BASE + 'index.html');
  await p.waitForFunction(() => window.__game && window.__game.renderer().webgl, null, { timeout: 60000 });
  await p.evaluate(async () => {
    const m = await import('./cards.mjs');
    window.__cards = Object.fromEntries(m.ALL_CARDS.map((c) => [c.id, { name: c.name, label: c.label || c.name, tier: c.tier, line: c.line, stat: c.stat || null, costLabel: c.costLabel || null, tradeoff: !!c.tradeoff, sector: c.sector || 0 }]));
  });
  return { ctx, p, errors };
}
/** Clear the stage through the model (the transition ends) and wait for the
 * draft, optionally replacing the offer with fixed ids (QA fixture). */
async function openDraft(p, { fresh = false, ids = null } = {}) {
  if (fresh) {
    await p.evaluate(() => window.__game.newRun(4321));
    await p.waitForTimeout(300);
  }
  await p.evaluate(() => {
    window.__game.setState({ phase: 'transition', transition: 0.02, transitionHold: false, enemies: [], enemyShots: [] });
    window.__game.step(0.05);
  });
  await p.waitForFunction(() => window.__game.getState().phase === 'draft' && window.__game.draft.scene()?.open);
  if (ids) {
    await p.waitForTimeout(100);
    await p.evaluate((list) => {
      const run = window.__game.run();
      run.offer = { ...run.offer, ids: list, tiers: list.map((id) => window.__cards[id].tier) };
      delete run.kit;
      window.__game.setState({ run });
    }, ids);
  }
}
const revealed = (p) => p.waitForFunction(() => window.__game.draft.screen().revealed && !window.__game.draft.scene().busy, null, { timeout: 10000 });
const sceneOf = (p) => p.evaluate(() => window.__game.draft.scene());
const stateOf = (p) => p.evaluate(() => window.__game.getState());
const runOf = (p) => p.evaluate(() => window.__game.run());
/** rAF intervals (ms) over `frames` frames, or until `until()` is true. */
const rafTimes = (p, frames, untilSrc = null) =>
  p.evaluate(
    ({ frames, untilSrc }) =>
      new Promise((resolve) => {
        const until = untilSrc ? new Function(`return (${untilSrc})`)() : null;
        const out = [];
        let last = 0;
        const tick = (t) => {
          if (last) out.push(t - last);
          last = t;
          if (out.length >= frames || (until && until())) resolve(out);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { frames, untilSrc },
  );
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (k) => s[Math.min(s.length - 1, Math.floor(k * (s.length - 1)))];
  return { n: s.length, median: Math.round(q(0.5) * 10) / 10, p95: Math.round(q(0.95) * 10) / 10, max: Math.round((s.at(-1) ?? 0) * 10) / 10 };
};
/** Visible text outside the canvas, excluding the hidden live region and
 * the control bar's own labels. */
const visibleText = (p) =>
  p.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!n.textContent.trim() || !el || el.closest('#formulate-live, .sr-only, #formulate-panel, script, style')) continue;
      let vis = true;
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) vis = false;
      }
      const r = el.getBoundingClientRect();
      if (vis && r.width > 1 && r.height > 1) out.push(n.textContent.trim());
    }
    return out.join(' | ');
  });
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---- D7: rendering, labels, legibility, no DOM panels ------------------------------------
await check('D7 draft renders in 3D: canvas visible, no DOM card content, 3 cartridges = run.offer, labels = name + stat, non-overlapping rects', async () => {
  const { ctx, p, errors } = await page();
  await openDraft(p, { fresh: true });
  await revealed(p);
  const sc = await sceneOf(p);
  const run = await runOf(p);
  assert(sc.cartridges.length === 3, 'three cartridges');
  assert(JSON.stringify(sc.cartridges.map((c) => c.id)) === JSON.stringify(run.offer.ids), 'ids = run.offer');
  assert(JSON.stringify(sc.cartridges.map((c) => c.tier)) === JSON.stringify(run.offer.tiers), 'tiers = run.offer');
  const cards = await p.evaluate(() => window.__cards);
  for (const c of sc.cartridges) {
    const card = cards[c.id];
    assert(c.label.name.length > 0 && c.label.stat.length > 0, `label has a name and a stat (${c.id})`);
    if (card.stat) assert(c.label.stat === card.stat.toUpperCase(), `label stat is the card's stat line (${c.id})`);
    assert(c.text === `${c.label.name} ${c.label.stat}`, 'label text = name + stat');
    assert(c.rect && c.rect.h >= 72 && c.rect.w >= 300, `cartridge on screen >= 300x72 px at 960x640 (${JSON.stringify(c.rect)})`);
  }
  const rects = sc.cartridges.map((c) => c.rect);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert(!overlap(rects[i], rects[j]), `rects ${i} and ${j} do not overlap`);
  const canvasVisible = await p.evaluate(() => {
    const c = document.querySelector('#game');
    const r = c.getBoundingClientRect();
    return getComputedStyle(c).visibility !== 'hidden' && r.width > 100 && r.height > 100;
  });
  assert(canvasVisible, 'the WebGL canvas is visible');
  assert((await p.locator('.slide').count()) === 0, 'no .slide panels');
  const text = (await visibleText(p)).toUpperCase();
  for (const c of sc.cartridges) {
    assert(!text.includes(cards[c.id].name.toUpperCase()), `no visible DOM shows ${cards[c.id].name}`);
    assert(!text.includes(c.label.stat), `no visible DOM shows the stat ${c.label.stat}`);
  }
  const live = await p.locator('#formulate-live').textContent();
  assert(sc.cartridges.every((c) => live.includes(cards[c.id].name)), 'the live region names all three');
  assert(sc.renderer.calls <= 40 && sc.renderer.triangles <= 25000, `budget: ${sc.renderer.calls} calls, ${sc.renderer.triangles} triangles`);
  assert(errors.length === 0, `console errors: ${errors.join('; ')}`);
  await ctx.close();
  return { calls: sc.renderer.calls, triangles: sc.renderer.triangles, rects: rects.map((r) => [Math.round(r.w), Math.round(r.h)]) };
});

for (const [w, h, minName] of [[960, 640, 14], [390, 844, 11], [320, 568, 11]]) {
  await check(`D7 labels legible at ${w}x${h}: name cap >= ${minName} px, stat cap >= ${minName - 3} px, every cartridge fully on screen`, async () => {
    const touch = w < 700;
    const { ctx, p } = await page({ width: w, height: h, touch });
    // The longest lines the cartridges print: the 16-character labels
    // (MASS VACCINATION, CLONAL EXPANSION, ENTERIC COATING ...).
    const ids = await p.evaluate(() =>
      Object.entries(window.__cards)
        .sort((a, b) => b[1].label.length - a[1].label.length || b[1].stat?.length - a[1].stat?.length)
        .slice(0, 3)
        .map(([id]) => id),
    );
    await openDraft(p, { fresh: true, ids });
    await revealed(p);
    const sc = await sceneOf(p);
    const out = [];
    for (const c of sc.cartridges) {
      out.push([c.label.name, Math.round(c.nameCapPx * 10) / 10, Math.round(c.statCapPx * 10) / 10]);
      assert(c.nameCapPx >= minName, `${c.label.name}: name cap ${c.nameCapPx.toFixed(1)} px < ${minName}`);
      assert(c.statCapPx >= minName - 3, `${c.label.name}: stat cap ${c.statCapPx.toFixed(1)} px`);
      assert(c.rect.x >= 0 && c.rect.y >= 0 && c.rect.x + c.rect.w <= w && c.rect.y + c.rect.h <= h, `on screen: ${JSON.stringify(c.rect)}`);
      assert(c.rect.h >= 48, 'touch target >= 48 px tall');
    }
    const rects = sc.cartridges.map((c) => c.rect);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert(!overlap(rects[i], rects[j]), `rects ${i}, ${j} overlap`);
    // The control bar sits under the cartridges and its keys are >= 48 px.
    const keys = await p.evaluate(() => [...document.querySelectorAll('#formulate-panel .f-key')].map((k) => k.getBoundingClientRect().toJSON()));
    assert(keys.length === 3 && keys.every((k) => k.height >= 48 && k.width >= 48), 'three keys >= 48x48');
    assert(keys.every((k) => rects.every((r) => r.y + r.h <= k.y)), 'cartridges above the control bar');
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `draft3d-longest-${w}x${h}.png`) });
    await ctx.close();
    return { caps: out };
  });
}

await check('D7 tier materials are distinct: clear, frosted (roughness >= 0.45, bump), cobalt, gold cap (metalness 1, crown); pixels differ; shading probe >= 60 levels', async () => {
  const { ctx, p } = await page();
  const byTier = await p.evaluate(() => {
    const out = {};
    for (const [id, c] of Object.entries(window.__cards)) (out[c.tier] ||= []).push(id);
    return out;
  });
  const seen = {};
  const probes = [];
  for (const ids of [[byTier.common[0], byTier.rare[0], byTier.epic[0]], [byTier.legendary[0], byTier.common[1], byTier.rare[1]]]) {
    await openDraft(p, { fresh: !Object.keys(seen).length, ids });
    // Full quality whatever the machine's load (LITE is judged in D8).
    await p.evaluate(() => window.__game.draft.lite(false));
    await revealed(p);
    await p.waitForTimeout(400);
    const sc = await sceneOf(p);
    for (const c of sc.cartridges) seen[c.tier] = c.materials;
    const pr = await p.evaluate(() => window.__game.draft.probe());
    probes.push(...pr);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `draft3d-tiers-${ids.map((i) => window_tier(i, byTier)).join('-')}-960x640.png`) });
    if (Object.keys(seen).length < 4) {
      // Back to play so the next fixture opens a fresh draft.
      await p.keyboard.press('Enter');
      await p.waitForFunction(() => !window.__game.draft.screen().holding && window.__game.getState().phase === 'playing', null, { timeout: 5000 });
    }
  }
  const { common, rare, epic, legendary } = seen;
  assert(common && rare && epic && legendary, 'all four tiers shown');
  assert(rare.glass.roughness >= 0.45 && rare.glass.bump, 'frosted: roughness >= 0.45 with a bump map');
  assert(common.glass.roughness <= 0.1 && common.glass.opacity <= 0.35, 'clear glass');
  assert(epic.glass.color === '#3a5bff', 'cobalt glass');
  assert(legendary.cap.metalness === 1 && legendary.cap.crown && legendary.cap.color === '#f2c14e', 'gold crown cap, metalness 1');
  assert(new Set([common, rare, epic, legendary].map((m) => `${m.glass.color}|${m.glass.roughness}|${m.glass.opacity}|${m.cap.color}|${m.notches}`)).size === 4, 'four distinct looks');
  assert(new Set([common, rare, epic, legendary].map((m) => m.notches)).size === 4, 'notches 1-4');
  for (const pr of probes) assert(pr.bright - pr.dark >= 60, `shading probe ${pr.tier}: ${pr.bright.toFixed(0)} - ${pr.dark.toFixed(0)} < 60`);
  // Mean colours: epic (cobalt) is bluest, legendary carries the most red (gold).
  const mean = (t) => probes.find((x) => x.tier === t).color;
  const blue = (c) => c[2] - (c[0] + c[1]) / 2;
  assert(blue(mean('epic')) > blue(mean('common')) && blue(mean('epic')) > blue(mean('rare')), 'cobalt reads bluer than clear and frosted');
  await ctx.close();
  return { probes: probes.map((x) => ({ tier: x.tier, contrast: Math.round(x.bright - x.dark), rgb: x.color.map(Math.round) })) };
});
function window_tier(id, byTier) {
  return Object.entries(byTier).find(([, ids]) => ids.includes(id))?.[0] || 'x';
}

// ---- D7: all 30 cards, one by one -----------------------------------------------------------
const OFFER_SIZE = 3;
/** Await a wait; if it times out, say where the run was. */
async function stuck(p, where, promise) {
  try {
    return await promise;
  } catch (e) {
    const s = await p.evaluate(() => {
      const g = window.__game.getState();
      return { phase: g.phase, wave: g.wave, hold: g.transitionHold, tr: g.transition, boss: g.boss ? g.boss.state : null, paused: g.paused };
    });
    throw new Error(`stuck at ${where}: ${JSON.stringify(s)}`);
  }
}
async function setOffer(p, list) {
  await p.evaluate((ids) => {
    const run = window.__game.run();
    run.offer = { ...run.offer, ids, tiers: ids.map((id) => window.__cards[id].tier) };
    delete run.kit;
    window.__game.setState({ run });
  }, list);
  await p.waitForFunction((want) => window.__game.draft.scene().cartridges.map((c) => c.id).join() === want, list.join(), { timeout: 10000 });
  await revealed(p);
  await p.waitForTimeout(150);
}
/** Every card in the set, forced into the offer (ten offers of three), each
 * one selected with a real key press: its cartridge text is label + stat,
 * the cost line is on the trade-offs, the caps meet the brief, the rects are
 * on screen, the caption is whole, and every glyph rasterises. With
 * --shots DIR it writes the contact sheets (3D crops and label textures). */
for (const [W, H, minName, minStat] of [[960, 640, 14, 11], [390, 844, 11, 8], [320, 568, 11, 8]]) {
await check(`D7 all 30 cards at ${W}x${H}: label + stat on the cartridge, cap heights (name >= ${minName} px, stat >= ${minStat} px), rects, whole captions, every glyph rasterised, sector cards read as such`, async () => {
  const { ctx, p, errors } = await page({ width: W, height: H, touch: W < 700 });
  const cards = await p.evaluate(() => window.__cards);
  const ids = Object.keys(cards);
  assert(ids.length === 30, `30 cards, got ${ids.length}`);
  // Mix tiers and lines in each offer so the sheets show variety.
  const order = [...ids].sort((a, b) => cards[a].tier.localeCompare(cards[b].tier) || a.localeCompare(b));
  const offers = [];
  for (let i = 0; i < OFFER_SIZE * 10; i++) offers[i % 10] = [...(offers[i % 10] || []), order[i]];
  await openDraft(p, { fresh: true });
  await revealed(p);
  const rows = [];
  const shots = [];
  const overlaps = [];
  const costCaps = [];
  for (const offer of offers) {
    await setOffer(p, offer);
    // Shading: the cartridges are lit 3D objects at full quality.
    await p.evaluate(() => window.__game.draft.lite(false));
    for (let slot = 0; slot < offer.length; slot++) {
      await p.keyboard.press(`Digit${slot + 1}`);
      await p.waitForTimeout(260);
      const sc = await sceneOf(p);
      const c = sc.cartridges[slot],
        card = cards[offer[slot]];
      assert(sc.selected === slot, `${offer[slot]}: Digit${slot + 1} selects slot ${slot}`);
      assert(c.id === offer[slot], `${offer[slot]}: the cartridge shows the forced card (${c.id})`);
      const want = `${card.label.toUpperCase()} ${(card.stat || '').toUpperCase()}`.trim();
      assert(c.text === want, `${offer[slot]}: label text "${c.text}" != "${want}"`);
      assert(card.label.length <= 16 && (card.stat || '').length <= 18, `${offer[slot]}: label/stat lengths`);
      if (card.tradeoff) assert(c.label.cost && /^COST /.test(c.label.cost) && c.label.cost.includes((card.costLabel || '').toUpperCase()), `${offer[slot]}: the COST line "${c.label.cost}"`);
      else assert(c.label.cost === '', `${offer[slot]}: no COST line`);
      assert(c.nameCapPx >= minName && c.statCapPx >= minStat, `${offer[slot]}: caps ${c.nameCapPx.toFixed(1)} / ${c.statCapPx.toFixed(1)} px at ${W}x${H}`);
      assert(c.nameFits, `${offer[slot]}: the name fits its plate`);
      // The pink COST line is the smallest print on the cartridge (the foot band is
      // half the name's): it must stay readable, and the caption repeats it in full.
      if (card.tradeoff) {
        costCaps.push(Math.round(c.costCapPx * 10) / 10);
        assert(c.costCapPx >= minName * 0.45, `${offer[slot]}: the COST line is ${c.costCapPx.toFixed(1)} px tall`);
        assert(sc.caption.some((r) => r.startsWith('COST')), `${offer[slot]}: the caption states the cost in full`);
      }
      assert(c.rect && c.rect.x >= 0 && c.rect.y >= 0 && c.rect.x + c.rect.w <= W && c.rect.y + c.rect.h <= H, `${offer[slot]}: on screen ${JSON.stringify(c.rect)}`);
      assert(c.tier === card.tier, `${offer[slot]}: tier ${c.tier}`);
      // The selected caption: one to three rows, at most 44 characters, never cut.
      assert(sc.caption.length >= 1 && sc.caption.length <= 3 && sc.caption.every((r) => r.length > 0 && r.length <= 44 && !r.endsWith('…')), `${offer[slot]}: caption ${JSON.stringify(sc.caption)}`);
      const caption = sc.caption.join(' ');
      if (card.sector) {
        const word = { 2: 'BREATH', 3: 'CURRENT', 4: 'MUTATION' }[card.sector];
        assert(caption.includes(word) || c.label.stat.length > 0, `${offer[slot]} reads as the ${word} card`);
        assert(caption.toUpperCase().includes(word), `${offer[slot]}: its caption names ${word} ("${caption}")`);
      }
      // Rects of the three cartridges, with the selected one lifted.
      const rects = sc.cartridges.map((x) => x.rect);
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++)
          if (overlap(rects[i], rects[j])) {
            // Depth of the bounding boxes' overlap (the tilted, lifted
            // cartridge's box, not its pixels).
            const depth = Math.min(rects[i].y + rects[i].h, rects[j].y + rects[j].h) - Math.max(rects[i].y, rects[j].y);
            overlaps.push({ at: `${offer.join('+')} sel ${slot}: ${i}/${j}`, depth: Math.round(depth * 10) / 10 });
          }
      rows.push({ id: offer[slot], tier: card.tier, text: c.text, cost: c.label.cost, caps: [Math.round(c.nameCapPx * 10) / 10, Math.round(c.statCapPx * 10) / 10], caption });
      if (SHOTS) {
        const st = await p.evaluate(() => document.querySelector('#stage').getBoundingClientRect().toJSON());
        const file = path.join(SHOTS, `card-${W}x${H}-${String(rows.length).padStart(2, '0')}-${offer[slot]}.png`);
        await p.screenshot({ path: file, clip: { x: st.x + sc.safe.x, y: st.y + sc.safe.y + 10, width: sc.safe.w, height: Math.min(sc.safe.h, 400) } });
        shots.push(file);
      }
    }
    const pr = await p.evaluate(() => window.__game.draft.probe());
    for (const x of pr) assert(x.bright - x.dark >= 60, `${offer.join('+')}: shading probe ${x.tier} ${(x.bright - x.dark).toFixed(0)} < 60`);
  }
  // A selected cartridge lifts toward the camera; where it grazes a neighbour is a finding, not a failure.
  assert(rows.length === 30 && new Set(rows.map((r) => r.id)).size === 30, 'all 30 shown once');
  // Rasterise every label texture: each character of each line draws lit dots.
  const raster = await p.evaluate(async () => {
    const D = await import('./draft3d.mjs');
    const out = { blanks: [], rightEdge: [], sheet: null };
    const W = D.LABEL_W,
      H = D.LABEL_H,
      ids = Object.keys(window.__cards);
    const cols = 3,
      scale = 0.5,
      sheet = document.createElement('canvas');
    sheet.width = Math.ceil(cols * W * scale);
    sheet.height = Math.ceil((ids.length / cols) * (H * scale + 6));
    const sg = sheet.getContext('2d');
    sg.fillStyle = '#10181b';
    sg.fillRect(0, 0, sheet.width, sheet.height);
    ids.forEach((id, k) => {
      const label = D.labelOf(id);
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const g = cv.getContext('2d', { willReadFrequently: true });
      D.paintLabel(g, label);
      const lay = D.labelLayout(label);
      const sx = W / lay.len,
        A1 = D.CARTRIDGE.label.a1,
        span = D.CARTRIDGE.label.a1 - D.CARTRIDGE.label.a0;
      const vy = (a) => ((A1 - a) / span) * H;
      const px = g.getImageData(0, 0, W, H).data;
      const lit = (x0, x1, y0, y1) => {
        let n = 0;
        for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++)
          for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
            const i = (y * W + x) * 4;
            if (px[i] + px[i + 1] + px[i + 2] < 330) n++; // ink on paper (paper is ~700)
          }
        return n;
      };
      for (const ln of [lay.name, lay.stat, lay.foot, lay.tier]) {
        if (!ln || !ln.text) continue;
        [...ln.text].forEach((ch, i) => {
          if (ch === ' ') return;
          const x0 = (ln.x0 + i * 6 * ln.pitchX) * sx;
          if (lit(x0, x0 + 5 * ln.pitchX * sx, vy(ln.a1), vy(ln.a0)) === 0) out.blanks.push(`${id}: "${ch}" in "${ln.text}"`);
        });
        // Ink must stop before the plate's right edge (no overflow into the shoulder band).
        // (the trade-offs' pink shoulder band takes the last 22 px).
        const endX = (ln.x0 + ln.width) * sx;
        if (endX > W - (label.tradeoff ? 24 : 8)) out.rightEdge.push(`${id}: ${ln.kind} ends at ${endX.toFixed(0)} of ${W}`);
      }
      const cx = (k % cols) * W * scale,
        cy = Math.floor(k / cols) * (H * scale + 6);
      sg.drawImage(cv, cx, cy, W * scale, H * scale);
    });
    out.sheet = sheet.toDataURL('image/png');
    return out;
  });
  assert(raster.blanks.length === 0, `blank glyphs: ${raster.blanks.slice(0, 6).join('; ')}`);
  assert(raster.rightEdge.length === 0, `text past the plate: ${raster.rightEdge.slice(0, 6).join('; ')}`);
  if (SHOTS) {
    fs.writeFileSync(path.join(SHOTS, `labels-sheet.png`), Buffer.from(raster.sheet.split(',')[1], 'base64'));
    // Contact sheet of the 30 3D crops, 5 columns.
    const sheet = await ctx.newPage();
    // about:blank cannot load file: URLs, so the crops go in as data URIs.
    const imgs = shots.map((f) => `<img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" style="width:360px;margin:2px">`).join('');
    await sheet.setViewportSize({ width: 5 * 366, height: 6 * 322 });
    await sheet.setContent(`<body style="margin:0;background:#0a1114">${imgs}</body>`);
    await sheet.waitForTimeout(500);
    await sheet.screenshot({ path: path.join(SHOTS, `cards-sheet-${W}x${H}.png`), fullPage: true });
  }
  assert(errors.length === 0, `console errors: ${errors.join('; ')}`);
  await ctx.close();
  // The lifted selection may graze its neighbour's box, never bury it: the
  // hover test takes the nearest cartridge, so a deep overlap would steal clicks.
  const deepest = Math.max(0, ...overlaps.map((o) => o.depth));
  assert(deepest <= 16, `a selected cartridge's box buries its neighbour's by ${deepest} px`);
  return { size: `${W}x${H}`, cards: rows.length, overlappingWhenSelected: overlaps.length, deepestOverlapPx: deepest, costCapPx: costCaps, minCaps: [Math.min(...rows.map((r) => r.caps[0])), Math.min(...rows.map((r) => r.caps[1]))] };
});
}

// ---- D7: the whole run's drafts with real keys --------------------------------------------
/** A run from 1-1 to the end with real key presses on every draft: the draft
 * opens after stages 1-11 (boosted after each sector boss, whose clear goes
 * through the model's own finishSector and report), each pick adds its card
 * to the deck, the header names what was cleared, and clearing OMICRON ends
 * the run without a draft. Stages are cleared by fixture (a sample's
 * transition, a boss set defeated); every outcome after that is the game's. */
await check('D7 a whole run of drafts with real keys: 11 drafts (3 boosted), headers, picks by 1-3 + Enter / Space, no draft after OMICRON', async () => {
  const { ctx, p, errors } = await page();
  await p.evaluate(() => window.__game.newRun(4321));
  await p.waitForTimeout(400);
  const seen = [];
  for (let stage = 1; stage <= 12; stage++) {
    await stuck(p, `stage ${stage} start`, p.waitForFunction((st) => window.__game.getState().phase === 'playing' && window.__game.getState().wave === st, stage, { timeout: 15000 }));
    await p.waitForTimeout(200);
    const boss = await p.evaluate(() => !!window.__game.getState().boss);
    if (boss) {
      // The real clear: the boss is defeated, the model reports and holds.
      await p.evaluate(() => {
        window.__game.setState({ enemies: [], enemyShots: [], boss: { state: 'defeated' } });
        window.__game.step(0.05);
      });
      // OMICRON goes straight to the end (no LAB REPORT, no draft).
      if (stage < 12) await stuck(p, `stage ${stage} report`, p.waitForFunction(() => window.__game.getState().phase === 'transition' && window.__game.getState().transitionHold, null, { timeout: 5000 }));
      // The LAB REPORT takes a deliberate press once it is shown: press
      // Enter as a player would until it lets go.
      for (let i = 0; i < 20 && (await p.evaluate(() => window.__game.getState().transitionHold)); i++) {
        await p.waitForTimeout(350);
        await p.keyboard.press('Enter');
      }
    } else {
      await p.evaluate(() => {
        window.__game.setState({ phase: 'transition', transition: 0.02, transitionHold: false, enemies: [], enemyShots: [] });
        window.__game.step(0.05);
      });
    }
    if (stage === 12) {
      // OMICRON: the run ends, a draft never opens.
      const phases = new Set();
      for (let i = 0; i < 40; i++) {
        phases.add(await p.evaluate(() => window.__game.getState().phase));
        if (phases.has('won')) break;
        await p.waitForTimeout(250);
      }
      assert(!phases.has('draft'), `a draft opened after OMICRON (${[...phases]})`);
      assert(phases.has('won'), `the run did not end (${[...phases]})`);
      break;
    }
    await stuck(p, `stage ${stage} draft`, p.waitForFunction(() => window.__game.getState().phase === 'draft' && window.__game.draft.scene()?.open, null, { timeout: 15000 }));
    await revealed(p);
    const sc = await sceneOf(p);
    const run = await runOf(p);
    assert(JSON.stringify(sc.cartridges.map((c) => c.id)) === JSON.stringify(run.offer.ids), `stage ${stage}: cartridges = run.offer`);
    assert(run.offer.boosted === [3, 6, 9].includes(stage), `stage ${stage}: boosted ${run.offer.boosted}`);
    const code = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2'][stage - 1];
    const names = { 3: 'ALPHA', 6: 'BETA & GAMMA', 9: 'DELTA' };
    assert(boss ? sc.header.left.startsWith(`${names[stage]} SEQUENCED`) : sc.header.left === `${code} CLEARED · PICK ONE`, `stage ${stage}: header "${sc.header.left}"`);
    assert(sc.cartridges.every((c) => c.text.length > 3 && c.rect), `stage ${stage}: every cartridge has its label and a rect`);
    seen.push({ stage, ids: run.offer.ids, sectorCard: run.offer.ids.find((id) => ({ 3: 'tidal-volume', 6: 'streamline', 9: 'proofreading' })[stage] === id) || null });
    // Real keys: look at the others first, then take one.
    if (stage === 1) {
      // The arrows walk the three (Left / Up back, Right / Down forward) and never leave 0-2.
      const sel = async () => (await sceneOf(p)).selected;
      assert((await sel()) === 0, 'the first cartridge starts selected');
      const walk = [['ArrowRight', 1], ['ArrowDown', 2], ['ArrowRight', 2], ['ArrowLeft', 1], ['ArrowUp', 0], ['ArrowLeft', 0]];
      for (const [key, want] of walk) {
        await p.keyboard.press(key);
        await p.waitForTimeout(60);
        assert((await sel()) === want, `${key} selects ${want}, got ${await sel()}`);
      }
    }
    await p.keyboard.press('Digit3');
    await p.keyboard.press('Digit1');
    await p.waitForTimeout(260);
    const slot = stage % 3;
    await p.keyboard.press(`Digit${slot + 1}`);
    await p.waitForTimeout(220);
    assert((await sceneOf(p)).selected === slot, `stage ${stage}: Digit${slot + 1} selects`);
    await p.keyboard.press(stage % 2 ? 'Enter' : 'Space');
    await stuck(p, `stage ${stage} pick`, p.waitForFunction((st) => !window.__game.draft.screen().holding && window.__game.getState().phase === 'playing' && window.__game.getState().wave === st + 1, stage, { timeout: 15000 }));
    const deck = (await runOf(p)).deck;
    assert(deck.length === stage && deck.at(-1).id === run.offer.ids[slot], `stage ${stage}: the deck gained ${run.offer.ids[slot]} (${deck.length} cards)`);
  }
  assert(seen.length === 11, `${seen.length} drafts`);
  assert(errors.length === 0, `console errors: ${errors.join('; ')}`);
  await ctx.close();
  return { drafts: seen.length, sectorCardsOffered: seen.filter((s) => s.sectorCard).map((s) => s.sectorCard) };
});

// ---- D7: input ----------------------------------------------------------------------
await check('D7 keyboard: a held Space never picks; 1-3 select, Enter injects; play resumes <= 1.2 s; R resamples; S twice discards (+1 SOAP)', async () => {
  const { ctx, p, errors } = await page();
  await p.keyboard.down('Space');
  await openDraft(p, { fresh: true });
  await p.waitForTimeout(700);
  await p.keyboard.up('Space');
  assert((await stateOf(p)).phase === 'draft', 'a held Space never picks');
  await revealed(p);
  const tokens = (await runOf(p)).tokens;
  const before = (await runOf(p)).offer.ids.join();
  await p.keyboard.press('KeyR');
  const r1 = await runOf(p);
  assert(r1.tokens === tokens - 1, 'RESAMPLE spends a token');
  await p.waitForTimeout(600);
  await revealed(p);
  const sc = await sceneOf(p);
  assert(sc.cartridges.map((c) => c.id).join() === r1.offer.ids.join(), 'the cartridges show the new offer');
  void before;
  await p.keyboard.press('Digit3');
  assert((await sceneOf(p)).selected === 2, 'Digit3 selects the third');
  await p.keyboard.press('ArrowUp');
  assert((await sceneOf(p)).selected === 1, 'ArrowUp moves up');
  const want = r1.offer.ids[1];
  const t0 = await p.evaluate(() => performance.now());
  await p.keyboard.press('Enter');
  const resumed = await p.evaluate(
    (t0) =>
      new Promise((resolve) => {
        const tick = () => {
          const s = window.__game.getState();
          if (!window.__game.draft.screen().holding && s.phase === 'playing' && s.waveElapsed > 0) resolve(performance.now() - t0);
          else requestAnimationFrame(tick);
        };
        tick();
      }),
    t0,
  );
  const s1 = await stateOf(p);
  assert(s1.wave === 2 && s1.run.deck.at(-1).id === want, 'the deck gains the selected id');
  // Play resumes when the 1.0 s animation hands back, one frame later; a
  // loaded machine adds its frame gaps, so the 1.2 s bound is judged idle.
  if (load()[0] <= MAX_LOAD) assert(resumed <= 1200, `play resumes in ${resumed.toFixed(0)} ms (<= 1200)`);
  else assert(resumed <= 3000, `play resumes in ${resumed.toFixed(0)} ms (loaded machine)`);
  assert((await p.locator('#rack .chip').count()) === 1, 'the HUD rack shows the pick');
  // DISCARD: S once arms, S again discards: +1 SOAP, back to play.
  await openDraft(p);
  await revealed(p);
  const bombs = (await stateOf(p)).ship.bombs;
  await p.keyboard.press('KeyS');
  assert((await stateOf(p)).phase === 'draft', 'one S only arms');
  await p.keyboard.press('KeyS');
  await p.waitForFunction(() => !window.__game.draft.screen().holding && window.__game.getState().phase === 'playing', null, { timeout: 3000 });
  const s2 = await stateOf(p);
  assert(s2.ship.bombs === Math.min(s2.kit.maxBombs, bombs + 1), 'DISCARD +1 SOAP');
  assert(errors.length === 0, `console errors: ${errors.join('; ')}`);
  await ctx.close();
  return { resumeMs: Math.round(resumed), load: load()[0] };
});

await check('D7 mouse: hovering a cartridge selects it, clicking the selected one injects; a click on a key acts', async () => {
  const { ctx, p } = await page();
  await openDraft(p, { fresh: true });
  await revealed(p);
  const sc = await sceneOf(p);
  const target = sc.cartridges[2];
  const stage = await p.evaluate(() => document.querySelector('#stage').getBoundingClientRect().toJSON());
  const cx = stage.x + target.rect.x + target.rect.w / 2,
    cy = stage.y + target.rect.y + target.rect.h / 2;
  await p.mouse.move(cx, cy, { steps: 4 });
  await p.waitForTimeout(250);
  assert((await sceneOf(p)).selected === 2, 'hover selects the third cartridge');
  assert((await stateOf(p)).phase === 'draft', 'hover never injects');
  await p.mouse.click(cx, cy);
  await p.waitForFunction(() => window.__game.getState().phase === 'playing');
  assert((await stateOf(p)).run.deck.at(-1).id === target.id, 'mouse click injects the hovered cartridge');
  await p.waitForFunction(() => !window.__game.draft.screen().holding, null, { timeout: 3000 });
  // The keys: RESAMPLE by click.
  await openDraft(p);
  await revealed(p);
  const tokens = (await runOf(p)).tokens;
  await p.click('#formulate [data-act="resample"]');
  assert((await runOf(p)).tokens === tokens - 1, 'RESAMPLE key');
  await revealed(p);
  await p.click('#formulate [data-act="inject"]');
  await p.waitForFunction(() => window.__game.getState().phase === 'playing');
  await ctx.close();
});

await check('D7 touch (390x844): a tap selects, a second tap or INJECT injects; DISCARD by two taps', async () => {
  const { ctx, p } = await page({ width: 390, height: 844, touch: true });
  await openDraft(p, { fresh: true });
  await revealed(p);
  const stage = await p.evaluate(() => document.querySelector('#stage').getBoundingClientRect().toJSON());
  const sc = await sceneOf(p);
  const at = (c) => [stage.x + c.rect.x + c.rect.w / 2, stage.y + c.rect.y + c.rect.h / 2];
  await p.touchscreen.tap(...at(sc.cartridges[1]));
  await p.waitForTimeout(200);
  assert((await sceneOf(p)).selected === 1, 'a tap selects');
  assert((await stateOf(p)).phase === 'draft', 'a tap on an unselected cartridge only selects');
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'draft3d-touch-select-390x844.png') });
  await p.tap('#formulate [data-act="inject"]');
  await p.waitForFunction(() => window.__game.getState().phase === 'playing');
  assert((await stateOf(p)).run.deck.at(-1).id === sc.cartridges[1].id, 'INJECT takes the tapped one');
  await p.waitForFunction(() => !window.__game.draft.screen().holding, null, { timeout: 3000 });
  await openDraft(p);
  await revealed(p);
  const sc2 = await sceneOf(p);
  await p.touchscreen.tap(...at(sc2.cartridges[2]));
  await p.waitForTimeout(200);
  await p.touchscreen.tap(...at((await sceneOf(p)).cartridges[2]));
  await p.waitForFunction(() => window.__game.getState().phase === 'playing');
  assert((await stateOf(p)).run.deck.at(-1).id === sc2.cartridges[2].id, 'a second tap injects');
  await p.waitForFunction(() => !window.__game.draft.screen().holding, null, { timeout: 3000 });
  await openDraft(p);
  await revealed(p);
  await p.tap('#formulate [data-act="discard"]');
  assert((await stateOf(p)).phase === 'draft', 'one tap arms DISCARD');
  await p.tap('#formulate [data-act="discard"]');
  await p.waitForFunction(() => window.__game.getState().phase === 'playing');
  await ctx.close();
});

await check('D7 reduced motion: no drop-in, a pick resumes play at once', async () => {
  const { ctx, p } = await page({ reducedMotion: 'reduce' });
  await openDraft(p, { fresh: true });
  const sc = await sceneOf(p);
  assert(sc.revealed && sc.motion === false, 'revealed at once');
  await p.waitForTimeout(600);
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => window.__game.getState().phase === 'playing');
  assert(!(await p.evaluate(() => window.__game.draft.screen().holding)), 'no hold');
  await ctx.close();
});

await check('D7 robustness: pause and resume mid-draft, a resize re-captures the board and refits, blur during the inject hold hands back to play paused', async () => {
  const { ctx, p, errors } = await page();
  await openDraft(p, { fresh: true });
  await revealed(p);
  await p.keyboard.press('Escape');
  assert((await stateOf(p)).paused === true, 'Esc pauses the draft');
  assert(await p.locator('#overlay').isVisible(), 'the pause card shows');
  await p.keyboard.press('Escape');
  assert((await stateOf(p)).paused === false && (await stateOf(p)).phase === 'draft', 'resumes into the draft');
  const before = await sceneOf(p);
  await p.setViewportSize({ width: 820, height: 600 });
  await p.waitForFunction((w) => window.__game.draft.scene().safe.w !== w, before.safe.w, { timeout: 5000 }).catch(() => {});
  const after = await sceneOf(p);
  assert(after.open && after.safe.w !== before.safe.w, 'the safe rect follows the resize');
  for (const c of after.cartridges) assert(c.rect.x >= 0 && c.rect.x + c.rect.w <= 820, 'still on screen');
  await p.setViewportSize({ width: 960, height: 640 });
  await p.waitForFunction((w) => window.__game.draft.scene().safe.w === w, before.safe.w, { timeout: 5000 }).catch(() => {});
  await revealed(p);
  // A pick, then the window loses focus mid-animation: play is not held.
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => window.__game.draft.screen().holding);
  await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  await p.waitForTimeout(200);
  const s = await stateOf(p);
  assert(s.phase === 'playing' && s.paused === true, 'paused at the new stage');
  assert(!(await p.evaluate(() => window.__game.draft.screen().holding)), 'the hold ended');
  assert(errors.length === 0, `console errors: ${errors.join('; ')}`);
  await ctx.close();
});

// ---- D8: frame time ---------------------------------------------------------------------
await check('D8 draft frame time on SwiftShader 960x640 DPR 1: idle median <= 20 / p95 <= 33, drop-in p95 <= 33, inject p95 <= 40, first open <= 150 ms, <= 40 calls', async () => {
  const { ctx, p } = await page();
  const loadBefore = load();
  await p.evaluate(() => window.__game.newRun(4321));
  await p.waitForTimeout(1500);
  // Play at 1-1 for reference (the board, the same page).
  const play = stats(await rafTimes(p, 120));
  // First open: frames from the draft event, including the open frame.
  const openTimes = p.evaluate(() => {
    return new Promise((resolve) => {
      const out = [];
      let last = 0;
      const tick = (t) => {
        if (last) out.push(t - last);
        last = t;
        if (out.length >= 54) resolve(out);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame((t) => {
        last = t;
        window.__game.setState({ phase: 'transition', transition: 0.02, transitionHold: false, enemies: [], enemyShots: [] });
        window.__game.step(0.05);
        requestAnimationFrame(tick);
      });
    });
  });
  const drop = await openTimes;
  const firstOpen = Math.max(...drop.slice(0, 3));
  await revealed(p);
  const idle = stats(await rafTimes(p, 120));
  const sc = await sceneOf(p);
  // Inject: Enter, then every frame until play has resumed.
  // GPU cost per frame at full quality (render + gl.finish), draft vs the
  // board, independent of rAF scheduling on a busy machine.
  const bench = await p.evaluate(() => {
    window.__game.draft.lite(false);
    const d = window.__game.draft.bench(40);
    const b = window.__game.draft.benchBoard(40);
    window.__game.draft.bench(2);
    return { d, b };
  });
  const injectP = rafTimes(p, 200, "() => !window.__game.draft.screen().holding && window.__game.getState().phase === 'playing'");
  await p.keyboard.press('Enter');
  const inject = stats(await injectP);
  const loadAfter = load();
  const lite = sc.lite;
  const detail = { load: { before: loadBefore, after: loadAfter, cpus: os.cpus().length }, play, idle, drop: stats(drop.slice(3)), firstOpen: Math.round(firstOpen), inject, calls: sc.renderer.calls, triangles: sc.renderer.triangles, lite, gpu: { draft: stats(bench.d), board: stats(bench.b) } };
  assert(sc.renderer.calls <= 40 && sc.renderer.triangles <= 25000, `budget ${sc.renderer.calls} calls / ${sc.renderer.triangles} triangles`);
  const pass = idle.median <= 20 && idle.p95 <= 33 && detail.drop.p95 <= 33 && inject.p95 <= 40 && firstOpen <= 150 && !lite;
  if (Math.max(loadBefore[0], loadAfter[0]) > MAX_LOAD) return { ...detail, inconclusive: true, judged: pass ? 'within budget despite load' : 'over budget under load' };
  assert(pass, `frame time over budget: ${JSON.stringify(detail)}`);
  await ctx.close();
  return detail;
});

await browser.close();
const summary = { base: BASE, at: new Date().toISOString(), load: load(), pass: results.filter((r) => r.status === 'PASS').length, fail: results.filter((r) => r.status === 'FAIL').length, inconclusive: results.filter((r) => r.status === 'INCONCLUSIVE').length, results };
console.log(`\n${summary.pass} PASS, ${summary.fail} FAIL, ${summary.inconclusive} INCONCLUSIVE (load ${summary.load.join(' ')})`);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
process.exitCode = summary.fail ? 1 : 0;
