/** D1s: the human-proxy harness smoke (RESEARCH_DIFFICULTY.md §8). The whole
 * banded harness is `npm run test:difficulty` (tests/difficulty.mjs); this
 * file keeps the proxies honest in `npm test`: their parameters are §2.1's,
 * they only send inputs (no state edits, no RNG reads), the deathbomb press
 * lands one human reaction time after the hit, and each clears 1-1. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES, LEARNING, MIN_REACTION, createHuman, learned, playHumanRun } from './humans.mjs';
import { createState, newRun, update } from '../model.mjs';

test('D1s profiles: §2.1 as recalibrated in revision seven (CALIBRATION in BALANCE.md)', () => {
  // Changes against §2.1, each measured (BALANCE.md "Proxy calibration"):
  // the expert attends to the 16 nearest bullets (all-in-view was worse than
  // the casual in dense fields), the first-timer holds focus in 30% of 1.2 s
  // episodes (the 1-2 protocol line teaches Shift), and every SOAP press has
  // a motor delay (`panicMs`) instead of landing on the frame of the thought.
  const row = (p) => [p.lag, p.decision, p.attention, p.noise, p.lapse, p.focus, p.panic, ...p.panicMs, ...p.deathbomb, p.inject, p.draft];
  assert.deepEqual(row(PROFILES.firstTimer), [300, 200, 6, 0.15, 0.08, 0.3, 0.3, 330, 70, 380, 80, 0.05, 'rarest']);
  assert.deepEqual(row(PROFILES.casual), [220, 150, 10, 0.07, 0.03, 1, 0.5, 250, 50, 280, 60, 0.25, 'random']);
  assert.deepEqual(row(PROFILES.expert), [150, 100, 16, 0.02, 0, 1, 0.75, 170, 35, 190, 40, 0.6, 'synergy']);
  assert.deepEqual({ ...LEARNING }, { noise: 0.7, lapse: 0.7, attention: 2 });
  const l = learned(PROFILES.casual, 2);
  assert.ok(Math.abs(l.noise - 0.07 * 0.49) < 1e-12 && Math.abs(l.lapse - 0.03 * 0.49) < 1e-12 && l.attention === 14);
});

test('D1s panic SOAP: pressed only after a motor delay (>= 150 ms), never on the frame the danger is seen', () => {
  for (const [id, p] of Object.entries(PROFILES)) {
    const s = createState({ seed: 5 });
    s.phase = 'playing';
    s.ship.respawn = 0;
    s.ship.bombs = 5;
    s.enemies = [];
    s.enemyShots = [];
    // A field: stationary bullets 0.3 u apart for 3 u around the core, so
    // every move (fast or focused, any direction) meets one inside 0.16 s.
    let id0 = 0;
    for (let gx = -3; gx <= 3.001; gx += 0.3)
      for (let gz = -3; gz <= 3.001; gz += 0.3) if (Math.hypot(gx, gz) <= 3) s.enemyShots.push({ id: ++id0, x: s.ship.x + gx, z: s.ship.z + gz, vx: 0, vz: 0, hit: 0.15, half: 0, family: 'droplet' });
    const log = [];
    // Attention is lifted so the first-timer sees the whole field (the test is about the press, not the sight).
    const human = createHuman({ ...p, panic: 1, attention: 99 }, { seed: 4, log });
    const pressed = [];
    for (let f = 0; f < 90; f++) if (human(s, f).bomb) pressed.push(f);
    const first = log.find((e) => e.kind === 'panic');
    assert.ok(first, `${id} never panicked in a field of bullets`);
    assert.ok(first.ms >= MIN_REACTION && Math.abs(first.ms - p.panicMs[0]) <= 4 * p.panicMs[1] + 1, `${id} motor delay ${first.ms} ms`);
    assert.ok(pressed.length && pressed[0] >= first.frame + Math.round((MIN_REACTION / 1000) * 60), `${id} pressed on frame ${pressed[0]}, thought on ${first.frame}`);
  }
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

test('D1 fast banded subset: sector 1 on 6 seeds per proxy (the whole bands are npm run test:difficulty)', () => {
  const seeds = [5000, 5101, 5202, 5303, 5404, 5505];
  const s1 = (proxy) =>
    seeds.map((seed) => {
      const r = playHumanRun({ proxy, seed, upTo: 3 });
      const st = r.stages.filter((x) => x.stage <= 3);
      return { cleared: !!st.find((x) => x.stage === 3)?.cleared, vials: st.reduce((n, x) => n + x.vialsLost, 0) };
    });
  const mean = (rs) => rs.reduce((n, r) => n + r.vials, 0) / rs.length;
  const ft = s1('firstTimer'),
    ca = s1('casual'),
    ex = s1('expert');
  // The start bites a novice but is learnable (§2.2: >= 70% clear, 1.5-4 vials).
  assert.ok(ft.filter((r) => r.cleared).length >= 3, `first-timer cleared S1 ${ft.filter((r) => r.cleared).length}/6`);
  assert.ok(mean(ft) >= 1 && mean(ft) <= 6, `first-timer S1 vials ${mean(ft).toFixed(2)}`);
  assert.ok(ca.every((r) => r.cleared) && mean(ca) <= 1.2, `casual S1 vials ${mean(ca).toFixed(2)}`);
  assert.ok(ex.every((r) => r.cleared) && mean(ex) <= 0.6, `expert S1 vials ${mean(ex).toFixed(2)}`);
  // Casual and expert both lose almost nothing in S1 (bands 0.2-1.0 and
  // 0-0.3); 6 seeds cannot order them, so only the novice gap is asserted.
  assert.ok(mean(ft) > mean(ca) + 0.5 && mean(ft) > mean(ex) + 0.5, 'the first-timer loses clearly more');
});
