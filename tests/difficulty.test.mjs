/** D1s: the human-proxy harness smoke (RESEARCH_DIFFICULTY.md §8). The whole
 * banded harness is `npm run test:difficulty` (tests/difficulty.mjs); this
 * file keeps the proxies honest in `npm test`: their parameters are §2.1's,
 * they only send inputs (no state edits, no RNG reads), the deathbomb press
 * lands one human reaction time after the hit, and each clears 1-1. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES, LEARNING, MIN_REACTION, createHuman, learned, playHumanRun } from './humans.mjs';
import { createState, newRun, update } from '../model.mjs';

test('D1s profiles: the parameters are exactly §2.1', () => {
  const row = (p) => [p.lag, p.decision, p.attention, p.noise, p.lapse, p.focus, p.panic, ...p.deathbomb, p.inject, p.draft];
  assert.deepEqual(row(PROFILES.firstTimer), [300, 200, 6, 0.15, 0.08, false, 0.3, 380, 80, 0.05, 'rarest']);
  assert.deepEqual(row(PROFILES.casual), [220, 150, 10, 0.07, 0.03, true, 0.5, 280, 60, 0.25, 'random']);
  assert.deepEqual(row(PROFILES.expert), [150, 100, Infinity, 0.02, 0, true, 0.75, 190, 40, 0.6, 'synergy']);
  assert.deepEqual({ ...LEARNING }, { noise: 0.7, lapse: 0.7, attention: 2 });
  const l = learned(PROFILES.casual, 2);
  assert.ok(Math.abs(l.noise - 0.07 * 0.49) < 1e-12 && Math.abs(l.lapse - 0.03 * 0.49) < 1e-12 && l.attention === 14);
});

test('D1s inputs only: a proxy never edits the state or reads the stage RNG', () => {
  const s = createState({ seed: 77, drafts: true });
  newRun(s, 77);
  for (const id of Object.keys(PROFILES)) {
    const human = createHuman(id, { seed: 3 });
    for (let f = 0; f < 900; f++) {
      const before = JSON.stringify({ rng: s.rngState, ship: s.ship, shots: s.enemyShots.length, enemies: s.enemies.map((e) => [e.x, e.z, e.hp]) });
      const input = human(s, f);
      assert.equal(JSON.stringify({ rng: s.rngState, ship: s.ship, shots: s.enemyShots.length, enemies: s.enemies.map((e) => [e.x, e.z, e.hp]) }), before, `${id} changed state at frame ${f}`);
      for (const k of Object.keys(input)) assert.ok(['axisX', 'axisZ', 'focus', 'bomb', 'confirm'].includes(k), `${id} sent ${k}`);
      update(s, 1 / 60, input);
    }
  }
});

test('D1s deathbomb: every press lands >= 150 ms after the hit flash, at the profile reaction time', () => {
  for (const [id, p] of Object.entries(PROFILES)) {
    const log = [];
    const human = createHuman(id, { seed: 11, log });
    // A synthetic hit flash on each of 200 frames (the event the model emits).
    const s = createState({ seed: 5 });
    s.phase = 'playing';
    for (let f = 0; f < 200; f++) {
      s.events = f % 40 === 0 ? [{ type: 'hit-core' }] : [];
      human(s, f);
    }
    const presses = log.filter((e) => e.kind === 'deathbomb');
    assert.equal(presses.length, 5);
    for (const e of presses) {
      assert.ok(e.ms >= MIN_REACTION && (e.at - e.frame) / 60 >= MIN_REACTION / 1000 - 1 / 120, `${id} pressed ${e.ms} ms after the hit`);
      assert.ok(Math.abs(e.ms - p.deathbomb[0]) <= 4 * p.deathbomb[1] + 1, `${id} ${e.ms} ms is outside its profile`);
    }
  }
});

test('D1s reachability: one seed per proxy clears 1-1 (Normal, drafts on)', () => {
  for (const proxy of Object.keys(PROFILES)) {
    const r = playHumanRun({ proxy, seed: 5000, upTo: 1 });
    const st = r.stages.find((x) => x.stage === 1);
    assert.ok(st?.cleared, `${proxy} did not clear 1-1`);
  }
});
