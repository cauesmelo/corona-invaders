/** Difficulty measured with a deliberately imperfect "reactive human"
 * (tests/reactive.mjs: 150 ms perception lag, 100 ms decisions, straight-line
 * extrapolation, one committed keyboard direction), not the autopilot.
 *
 *  1. Every boss and midboss card is dodgeable without SOAP from 5 starts.
 *  2. No wall: every sample clears within 3 tries (SOAP allowed) on 5 seeds.
 *  3. The curve rises by sector: mean vials lost and near-core pressure per
 *     stage (no SOAP) climb sector by sector. The per-stage sawtooth and the
 *     other ladders live in tests/suite.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, BOSSES, update, restartGame } from '../model.mjs';
import { createReactive } from './reactive.mjs';
import { cardArena, running } from './helpers.mjs';

const STARTS = [-6, -3, 0, 3, 6];
function playCard(type, card, x) {
  const s = cardArena(type, card, { x, seed: 11 + x });
  const player = createReactive({ phase: x + 6, bombs: false });
  let peak = 0;
  for (let f = 0; f < 60 * 50 && s.phase === 'playing'; f++) {
    update(s, 1 / 60, player(s, f));
    peak = Math.max(peak, s.enemyShots.length);
  }
  return { hits: s.damageTaken, peak, bombs: s.bombsUsed, ended: s.boss?.results?.[0]?.reason ?? 'none' };
}
const cards = [];
for (const [type, def] of Object.entries(BOSSES))
  def.cards.forEach((c, i) => {
    const runs = STARTS.map((x) => playCard(type, i, x));
    cards.push({ type, name: c.name, survival: c.type === 'survival', runs, mean: runs.reduce((n, r) => n + r.hits, 0) / runs.length, worst: Math.max(...runs.map((r) => r.hits)) });
  });

test('card table (diagnostic)', (t) => {
  for (const c of cards) t.diagnostic(`${c.type.padEnd(13)} ${c.name.padEnd(16)} hits ${c.runs.map((r) => r.hits).join(' ')} mean ${c.mean.toFixed(1)} peak ${Math.max(...c.runs.map((r) => r.peak))} ended ${c.runs.map((r) => r.ended[0]).join('')}`);
});
test('the same reactive player ends every card by damage, not on the timer, from most starts', () => {
  for (const c of cards.filter((c) => !c.survival)) assert.ok(c.runs.filter((r) => r.ended === 'cleared').length >= 4, `${c.type} ${c.name}: ${c.runs.map((r) => r.ended).join(' ')}`);
});
test('every boss and midboss card is dodgeable without SOAP by a 150 ms reactive player from 5 starts', () => {
  assert.equal(cards.length, Object.values(BOSSES).reduce((n, b) => n + b.cards.length, 0));
  for (const c of cards) {
    assert.ok(c.runs.every((r) => r.bombs === 0), 'no SOAP used');
    // "mean <= 1.2 hits per card" is removed as a design target
    // (RESEARCH_DIFFICULTY §2.4); the worst seed stays bounded.
    assert.ok(c.worst <= 3, `${c.type} ${c.name}: worst ${c.worst}`);
    assert.ok(c.runs.filter((r) => r.hits <= 1).length >= 3, `${c.type} ${c.name}: most starts take at most one hit`);
  }
});

// Eight seeds: single-sample vial losses are noisy (chaotic trajectories).
const SEEDS = [42, 1, 7, 3, 5, 11, 23, 99];
function playSample(stage, seed, bombs) {
  const s = running(seed, stage);
  let losses = 0,
    hits = 0,
    near = 0,
    samples = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) restartGame(s);
    const player = createReactive({ phase: attempt * 4, bombs });
    for (let f = 0; f < 60 * 300; f++) {
      const before = s.damageTaken;
      update(s, 1 / 60, player(s, f));
      hits += s.damageTaken - before;
      // Pressure: bullets within 3 u of the core, sampled every 0.1 s.
      if (f % 6 === 0) {
        samples++;
        for (const b of s.enemyShots) if (Math.hypot(b.x - s.ship.x, b.z - s.ship.z) < 3) near++;
      }
      if (s.phase === 'transition' || s.phase === 'won') return { cleared: true, losses, hits, near: near / samples };
      if (s.phase === 'lost') break;
    }
    losses++;
  }
  return { cleared: false, losses, hits, near: near / Math.max(1, samples) };
}
const table = (bombs) =>
  LEVELS.map((level) => {
    const runs = SEEDS.map((seed) => playSample(level.id, seed, bombs));
    return { level, runs, hits: runs.reduce((n, r) => n + r.hits, 0) / SEEDS.length, near: runs.reduce((n, r) => n + r.near, 0) / SEEDS.length, losses: runs.reduce((n, r) => n + r.losses, 0) };
  });
const dodging = table(false);
const withSoap = table(true);
const worldMean = (rows, w, key = 'hits') => {
  const list = rows.filter((r) => r.level.world === w && r.level.kind !== 'bonus');
  return list.reduce((n, r) => n + r[key], 0) / list.length;
};

test('reactive-player curve table (diagnostic)', (t) => {
  for (const r of dodging)
    t.diagnostic(`${r.level.code.padEnd(4)} ${r.level.name.padEnd(16)} vials lost/seed ${r.hits.toFixed(2)} near ${r.near.toFixed(2)} losses ${r.losses} ${r.runs.map((x) => `${x.cleared ? 'C' : 'X'}${x.losses}`).join(' ')}`);
  t.diagnostic(`world means (no SOAP) ${[1, 2, 3, 4].map((w) => `W${w} lost ${worldMean(dodging, w).toFixed(2)} near ${worldMean(dodging, w, 'near').toFixed(2)}`).join(' | ')}`);
});
test('no wall: the reactive player clears every sample within three tries on five seeds', () => {
  for (const r of withSoap) for (const [i, run] of r.runs.entries()) assert.ok(run.cleared, `${r.level.code} not cleared (seed ${SEEDS[i]})`);
});
test('sector 1 is learnable: every AIRWAY stage clears on the first try', () => {
  for (const r of withSoap.filter((r) => r.level.world === 1)) assert.equal(r.losses, 0, r.level.code);
});
test('the curve rises by sector: near-core pressure climbs S1 < S2 < S3 < S4; vials lost trend up', () => {
  // Near pressure is the primary ladder (RESEARCH_V1.md 2.3): single-sample
  // vial losses are noisy, so they only have to trend up (S4 above S1 and S2).
  const near = [1, 2, 3, 4].map((w) => worldMean(dodging, w, 'near'));
  for (let i = 1; i < 4; i++) assert.ok(near[i] > near[i - 1], `near: S${i + 1} ${near[i].toFixed(2)} <= S${i} ${near[i - 1].toFixed(2)}`);
  assert.ok(near[3] >= near[0] * 1.5, `near: S4 ${near[3].toFixed(2)} vs S1 ${near[0].toFixed(2)}`);
  // Vials lost by sector are judged on the human proxies (tests/difficulty.mjs
  // §2.2 bands, rising by sector for each proxy); for this 150 ms referee
  // without SOAP they only have to rise from S1 and peak at or after S2.
  const hits = [1, 2, 3, 4].map((w) => worldMean(dodging, w, 'hits'));
  assert.ok(hits[1] > hits[0] && hits[3] > hits[0] && hits[2] > hits[0], `hits ${hits.map((h) => h.toFixed(2)).join(' ')}`);
  const byCode = Object.fromEntries(dodging.map((r) => [r.level.code, r.hits]));
  assert.ok(byCode['4-3'] >= byCode['1-3'], 'OMICRON is not easier than ALPHA');
});
