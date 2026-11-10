/** Revision seven's pattern levers (BALANCE.md "Where skill shows"): the RNA
 * SNAKE beats, the PEEL divers, the CURRENT's flow schedule and the wall
 * gap that follows it. Measured on real emitters and the real model. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, update, RULES, STAGE_COUNT } from '../model.mjs';
import { flowAt } from '../core.mjs';
import { LIMITS, PRESETS, startPattern } from '../patterns.mjs';
import { FAMILIES } from '../bullets.mjs';
import { ARCHETYPES, attackFor } from '../levels.mjs';
import { quiet, group } from './helpers.mjs';

test('every beat that retunes an archetype (tune) stays inside its preset LIMITS, snakes included', () => {
  let tuned = 0,
    snakes = 0;
  for (const level of LEVELS)
    for (const st of level.script || []) {
      if (!st.tune) continue;
      for (const kind of Object.keys(st.tune)) {
        const a = attackFor(kind, level.world, st.tune);
        const L = LIMITS[a.preset];
        const p = { ...PRESETS[a.preset].defaults, ...a.params };
        tuned++;
        if (a.preset === 'strand') snakes++;
        for (const key of ['n', 'spread', 'interval', 'amp', 'wavelength', 'rate', 'cone']) if (L[key] && p[key] !== undefined) assert.ok(p[key] >= L[key][0] - 1e-9 && p[key] <= L[key][1] + 1e-9, `${level.code} ${kind}: ${key} ${p[key]} outside ${L[key]}`);
        for (const v of [].concat(p.speeds ?? p.speed)) {
          assert.ok(v >= L.speed[0] && v <= L.speed[1], `${level.code} ${kind}: speed ${v} outside ${L.speed}`);
          const fam = FAMILIES[p.family || PRESETS[a.preset].family];
          assert.ok(v >= fam.speed[0] && v <= fam.speed[1], `${level.code} ${kind}: speed ${v} outside the ${fam.label} band`);
        }
        if (L.odd) assert.equal(p.n % 2, 1);
        if (L.even) assert.equal(p.n % 2, 0);
      }
    }
  assert.ok(tuned >= 5 && snakes >= 4, `${tuned} tuned beats, ${snakes} snakes`);
});

test('a tune may swap the preset: WILD TYPEs sing an aimed RNA snake only inside that beat', () => {
  const plain = attackFor('wild', 3);
  const snake = attackFor('wild', 3, { wild: { preset: 'strand', n: 7, speed: 4.4, amp: 0.7, wavelength: 5, interval: 0.12, aimShip: true } });
  assert.equal(plain.preset, 'cough');
  assert.equal(snake.preset, 'strand');
  assert.equal(snake.params.aimShip, true);
  assert.equal(ARCHETYPES.wild.attack.preset, 'cough', 'the archetype itself is unchanged');
  // A strand launched with aimShip points its first bead at the core: grammar aimed.
  const s = quiet(5);
  s.ship.x = 2;
  const em = startPattern(s, 'strand', { x: -3, z: -8, params: snake.params, force: true });
  assert.equal(em.grammar, 'aimed');
  const target = Math.atan2(2 - -3, s.ship.z - -8);
  assert.ok(Math.abs(em.aim - target) < 1e-9);
});

test('flowAt is the one CURRENT schedule: it reproduces the model twist, flips are warned 2 s ahead and dir0 starts the other way', () => {
  const s = quiet(9);
  for (let t = 0; t < 40; t += 0.37) {
    s.waveElapsed = t;
    update(s, 1e-4);
    const f = flowAt('current', s.waveElapsed, {});
    assert.equal(s.twist.drift, f.drift, `drift at ${t}`);
    assert.equal(s.twist.warn, f.warn);
  }
  const a = flowAt('rush', 3, {}),
    b = flowAt('rush', 9, {});
  assert.equal(a.dir, -b.dir, 'the rush flips every 6 s');
  assert.equal(flowAt('current', 5, { period: 12, dir0: 1 }).dir, -flowAt('current', 5, { period: 12 }).dir);
  assert.ok(flowAt('rush', 4.1, {}).warn && !flowAt('rush', 3.9, {}).warn, 'the warning is the last 2 s of a period');
});

test('a wall under a CURRENT is launched so its gap arrives on the board (the F1 replay found BLOOD RUSH gaps drifting off it)', () => {
  const FLIGHT = (RULES.shipZ - -11) / 3.2;
  let drifted = 0;
  for (const kind of ['rush', 'current']) {
    const over = kind === 'rush' ? { kind: 'rush' } : { kind: 'current', speed: 0.8, period: 12, from: 0 };
    for (let seed = 1; seed <= 60; seed++)
      for (const t0 of [0.5, 2, 3.7, 5.2, 8, 11.4]) {
        const s = quiet(9, { seed });
        s.waveElapsed = t0;
        s.twistOverride = over;
        s.twist.kind = kind;
        const em = startPattern(s, 'wall', { x: 0, z: -11, params: { gaps: 1, gapWidth: 2.4, speed: 3.2 }, boss: true, force: true });
        let shift = 0;
        for (let tau = 0; tau < FLIGHT; tau += 0.1) shift += flowAt(kind, kind === 'rush' ? t0 + tau : t0 - 0 + tau, over).drift * 0.1;
        const arrival = em.gapList[0].x + shift;
        if (Math.abs(shift) > 2) drifted++;
        assert.ok(Math.abs(arrival) <= 8.6, `${kind} seed ${seed} t0 ${t0}: the gap arrives at ${arrival.toFixed(1)}`);
        assert.ok(em.gapList[0].width >= 2, 'the gap stays >= 2.0 u');
      }
  }
  assert.ok(drifted > 50, 'the test covered launches whose flight really drifts');
});

test('a wall gap list follows the flow with its bullets, so the bots, the proxies and the floor marker always see the real gap', () => {
  const s = quiet(9, { seed: 5 });
  s.waveElapsed = 1;
  s.twistOverride = { kind: 'rush' };
  s.twist.kind = 'rush';
  s.ship.x = -8;
  s.ship.z = 12;
  const em = startPattern(s, 'wall', { x: 0, z: -11, params: { gaps: 1, gapWidth: 2.4, speed: 3.2 }, boss: true, force: true });
  em.timer = 0;
  s.sector.hold = true;
  const before = em.gapList[0].x;
  for (let i = 0; i < 90; i++) update(s, 1 / 60);
  const wall = s.enemyShots.find((b) => b.gaps);
  assert.ok(wall, 'the wall is in flight');
  assert.ok(Math.abs(wall.gaps[0].x - before) > 0.5, `the gap moved ${(wall.gaps[0].x - before).toFixed(2)} u with the flow`);
  // The wall is solid right up to the gap's edges and open inside it.
  const xs = s.enemyShots.filter((b) => b.gaps === wall.gaps).map((b) => b.x);
  const g = wall.gaps[0];
  assert.ok(xs.every((x) => Math.abs(x - g.x) >= g.width / 2 - 1e-6), 'no wall bullet sits inside the drifted gap');
});

test('PEEL: a grid member leaves on an announced straight line, the telegraph holds it in its slot, a sidestep clears it', () => {
  const s = quiet(1, { seed: 7 });
  s.sector.divers = { every: [1, 1], max: 1, tele: 1.2, speed: 5.5 };
  s.sector.diverClock = 0;
  group(s, ['mmmmmmm'], { z: -8 });
  s.ship.x = 1.5;
  s.ship.z = 10;
  const spawnedBefore = s.sector.spawned;
  let peeler = null;
  for (let f = 0; f < 30 && !peeler; f++) {
    update(s, 1 / 60);
    peeler = s.enemies.find((e) => e.mode === 'peel');
  }
  assert.ok(peeler, 'one member peeled off');
  assert.equal(s.sector.spawned, spawnedBefore + 1, 'a diver counts toward R0 if it gets through');
  const tele = s.telegraphs.find((t) => t.kind === 'path' && t.ownerId === peeler.id);
  assert.ok(tele && tele.danger, 'the dashed path is on screen from the first frame');
  const [tx, tz] = peeler.target;
  // The announced line passes through the column the syringe stood in (or the board edge).
  const k = (s.ship.z - peeler.z) / (tz - peeler.z);
  assert.ok(Math.abs(peeler.x + (tx - peeler.x) * k - 1.5) < 0.8, 'the line goes through the syringe column');
  // It does not move during the 1.2 s telegraph (slot sway only), then it dives straight.
  const z0 = peeler.z;
  for (let f = 0; f < 60; f++) update(s, 1 / 60);
  assert.ok(Math.abs(peeler.z - z0) < 0.6, 'it bristles in its slot for the telegraph');
  s.ship.x = 8.5; // a sidestep far from the line
  for (let f = 0; f < 60 * 8 && peeler.alive; f++) update(s, 1 / 60);
  assert.equal(s.health, 3, 'a sidestep clears the dive');
  assert.ok(peeler.escaped && !peeler.alive, 'it left the board and counts as escaped');
  assert.ok(!s.telegraphs.some((t) => t.ownerId === peeler.id), 'its path telegraph left with it');
});

test('PEEL: the diver is a body hazard (contact hurts) and the INJECT tip cures it before the core is reached', () => {
  const s = quiet(1, { seed: 9 });
  s.sector.divers = { every: [1, 1], max: 1, tele: 1, speed: 5.5 };
  s.sector.diverClock = 0;
  group(s, ['mmmmmmm'], { z: -8 });
  s.ship.x = 0;
  s.ship.z = 8;
  s.ship.invulnerable = 0;
  // Stand still in the line with the needles held (they would shoot it first):
  // the tip (0.95 u ahead of the core) meets it first.
  let cured = false;
  for (let f = 0; f < 60 * 8 && !cured; f++) {
    s.ship.fireCooldown = 1e9;
    s.ship.antibodyCooldown = 1e9;
    update(s, 1 / 60);
    for (const ev of s.events) if (ev.type === 'inject' && ev.peel) cured = true;
    if (s.ship.dying > 0 || s.health < 3) break;
  }
  assert.ok(cured || s.health < 3, 'the diver met the syringe');
  if (cured) assert.equal(s.health, 3, 'the tip cured it; no vial lost');
});

test('the stage count and the scripts still agree after the new beats (12 stages, divers only in sector 1)', () => {
  assert.equal(STAGE_COUNT, 12);
  for (const l of LEVELS) {
    const has = (l.script || []).some((st) => st.divers && !st.divers.off);
    assert.equal(has, l.id <= 2, `${l.code}: divers ${has}`);
  }
});
