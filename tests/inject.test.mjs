/** INJECT, the signature verb (RESEARCH_V1.md 5.4, test T8): the needle tip
 * cures what it touches. Every check runs the real update(); fixtures only
 * place actors. The browser half (the drawn tip within 1 px of this
 * collider) lives in the root QA suite. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, update, BOSSES, ARCHETYPES, stageHp } from '../model.mjs';
import { INJECT, needleTip } from '../hitboxes.mjs';
import { STEP, createClock, advanceClock } from '../clock.mjs';
import { quiet, group, cardArena, toFight } from './helpers.mjs';
import { createReactive } from './reactive.mjs';

/** A board with one enemy and the syringe parked so the tip is `gap` u
 * outside its body (negative: inside). Auto-fire is off. */
function touch(kind, { stage = 10, gap = 0.1, extra = {} } = {}) {
  const s = quiet(stage);
  s.ship.fireCooldown = s.ship.antibodyCooldown = 1e9;
  const [e] = group(s, [Object.entries({ m: 'mini', W: 'wild', N: 'sneezer', D: 'droplet', K: 'heavy', B: 'bloom' }).find(([, k]) => k === kind)?.[0] ?? 'W'], { z: -3.5 });
  Object.assign(e, extra);
  s.ship.x = e.x;
  s.ship.z = e.z + e.radius + INJECT.r + INJECT.reach + gap;
  return { s, e };
}

test('T8: the tip point is 0.95 u up-field of the core on the board plane', () => {
  assert.deepEqual(needleTip({ x: 1.5, z: 4 }), [1.5, 4 - 0.95]);
  assert.equal(INJECT.r, 0.05);
});

test('T8: a touch cures popcorn on the touch step, whatever its HP; a cure scores x2 and pushes the Dose Chain', () => {
  for (const kind of ['mini', 'wild', 'sneezer', 'droplet']) {
    const { s, e } = touch(kind, { extra: { hp: 999, maxHp: 999 } });
    update(s, 1 / 120);
    assert.ok(e.alive, `${kind}: not yet touching`);
    s.ship.z -= 0.15;
    update(s, 1 / 120);
    assert.equal(e.alive, false, `${kind} cured on the touch step`);
    const ev = s.events.find((x) => x.type === 'inject');
    assert.ok(ev && ev.cured && !ev.elite, kind);
    const kill = s.events.find((x) => x.type === 'kill');
    assert.equal(kill.points, ARCHETYPES[kind].score * 2 * kill.mult, `${kind} x2`);
    assert.equal(s.chain.count, 1);
    assert.equal(s.ship.injectReload > 0.45, true);
  }
});

test('T8: worms, puffs and a diving droplet are popcorn too', () => {
  const s = quiet(5);
  s.ship.fireCooldown = s.ship.antibodyCooldown = 1e9;
  for (const [kind, extra] of [['worm', { mode: 'worm', dir: 1, z0: -3.5, phase: 0, modeTime: 0, trailClock: 99, attackClock: 99 }], ['puff', { mode: 'drift', vx: 0, z0: -3.5, age: 0, attackClock: 99 }], ['droplet', { mode: 'dive', target: [0, -3.5] }]]) {
    s.enemies = [];
    const [e] = group(s, ['W'], { z: -3.5 });
    Object.assign(e, { kind, radius: ARCHETYPES[kind].radius, half: ARCHETYPES[kind].half || 0, hp: 50, ...extra });
    // The tip at the body centre.
    s.ship.x = e.x;
    s.ship.z = e.z + INJECT.reach;
    s.ship.injectReload = 0;
    s.hitstop = 0; // the previous cure's 60 ms freeze
    s.hitstopLog = [];
    update(s, 1 / 120);
    assert.equal(e.alive, false, kind);
  }
});

test('T8: elites take 10 x stageHp per injection (a closed BLOOM too), never an instant cure', () => {
  for (const kind of ['heavy', 'bloom']) {
    const { s, e } = touch(kind, { gap: -0.05 });
    if (kind === 'bloom') assert.equal(e.bud.state, 'closed');
    const hp = e.hp;
    update(s, 1 / 120);
    const dealt = hp - e.hp;
    assert.ok(Math.abs(dealt - INJECT.eliteDamage * stageHp(1, 10)) < 1e-9, `${kind}: ${dealt}`);
    assert.equal(s.events.find((x) => x.type === 'inject').elite, true);
    assert.ok(Math.abs(s.ship.injectReload - (INJECT.reloadElite - 1 / 120)) < 1e-6 || s.ship.injectReload === INJECT.reloadElite, `${kind} reload 0.8 s`);
  }
  // A VESICLE's supply pops out when an injection finishes it.
  const s = quiet(2);
  s.ship.fireCooldown = s.ship.antibodyCooldown = 1e9;
  const [v] = group(s, ['W'], { z: -3.5 });
  Object.assign(v, { kind: 'vesicle', radius: ARCHETYPES.vesicle.radius, hp: 5, carry: 'mrna', noDrop: true });
  s.ship.x = v.x;
  s.ship.z = v.z + v.radius + INJECT.reach;
  update(s, 1 / 120);
  assert.equal(v.alive, false);
  assert.ok(s.pickups.some((p) => p.kind === 'mrna' && p.source === 'vesicle'));
});

test('T8: reload 0.5 s after popcorn and 0.8 s after an elite; nothing injects while reloading', () => {
  const { s, e } = touch('wild', { gap: -0.05 });
  const f = group(s, ['W'], { z: -3.5 }).at(-1);
  f.x = e.x;
  f.z = -9;
  update(s, 1 / 120);
  assert.equal(e.alive, false);
  assert.equal(s.ship.injectReloadMax, INJECT.reload);
  // A second virus right there waits for the reload.
  f.z = e.z;
  for (let t = 0; t < INJECT.reload - 0.1; t += 1 / 120) {
    s.ship.invulnerable = 1e9;
    update(s, 1 / 120);
  }
  assert.ok(f.alive, 'still reloading');
  for (let t = 0; t < 0.2; t += 1 / 120) update(s, 1 / 120);
  assert.equal(f.alive, false, 'reloaded');
});

test("T8: the victim's live bullets become antigen tokens; others stay", () => {
  const { s, e } = touch('wild', { gap: 0.3 });
  s.enemyShots.push({ id: 1, x: -6, z: -8, vx: 0, vz: 0, family: 'droplet', hit: 0.15, half: 0.12, src: 'T', age: 0, owner: e.id });
  s.enemyShots.push({ id: 2, x: 6, z: -8, vx: 0, vz: 0, family: 'droplet', hit: 0.15, half: 0.12, src: 'T', age: 0, owner: 'someone-else' });
  s.ship.z -= 0.35;
  update(s, 1 / 120);
  assert.equal(e.alive, false);
  assert.deepEqual(s.enemyShots.map((b) => b.id), [2]);
  assert.ok(s.antigens.length >= 1);
  assert.equal(s.events.find((x) => x.type === 'inject').cancelled, 1);
});

test('T8: the tip never hurts the player; the core against a body still costs a vial', () => {
  const { s, e } = touch('heavy', { gap: -0.05 });
  for (let i = 0; i < 60; i++) update(s, 1 / 120);
  assert.equal(s.damageTaken, 0, 'tip in the body: no damage to the player');
  assert.ok(e.alive);
  // Core contact: the heavy over the core.
  s.ship.invulnerable = 0;
  s.ship.injectReload = 1e9;
  s.ship.z = e.z + e.radius;
  update(s, 1 / 120);
  for (let i = 0; i < 40; i++) update(s, 1 / 120);
  assert.equal(s.damageTaken, 1);
});

test('T8: hitstop 60 ms per injection, inside the 120 ms cap', () => {
  const { s } = touch('wild', { gap: -0.05 });
  update(s, 1 / 120);
  assert.ok(s.hitstopLog.some((h) => Math.abs(h.amount - INJECT.hitstop) < 1e-9));
  assert.ok(s.hitstopLog.reduce((n, h) => n + h.amount, 0) <= RULES.hitstopCap + 1e-9);
});

test('T8: no boss or midboss card brings a body within the needle reach (geometry sweep)', () => {
  // The tip reaches z = moveMinZ - reach - r at most.
  const reach = RULES.moveMinZ - INJECT.reach - INJECT.r;
  let worst = -Infinity,
    where = '';
  for (const [type, def] of Object.entries(BOSSES))
    def.cards.forEach((c, i) => {
      for (const x of [-6, 0, 6]) {
        const s = cardArena(type, i, { x, seed: 3 });
        const player = createReactive({ phase: 2, bombs: false });
        toFight(s);
        for (let f = 0; f < 60 * 30 && s.phase === 'playing'; f++) {
          const input = player(s, f);
          // Sweep the syringe across the top of the box, where the tip reaches.
          input.axisZ = -1;
          update(s, 1 / 60, input);
          for (const p of s.enemies) if (p.alive && p.kind === 'boss' && p.z + p.radius > worst) [worst, where] = [p.z + p.radius, `${type} ${c.name}`];
        }
      }
    });
  assert.ok(worst < reach, `${where}: a boss body front at z ${worst.toFixed(2)} >= reach ${reach}`);
});

test('T8: a boss body brought within reach (fixture) takes elite damage only', () => {
  const s = cardArena('alpha', 0);
  toFight(s);
  s.ship.fireCooldown = s.ship.antibodyCooldown = 1e9;
  s.shots = [];
  const core = s.enemies.find((e) => e.kind === 'boss');
  core.z = -4.5;
  s.ship.x = core.x;
  s.ship.z = core.z + core.radius + INJECT.reach;
  s.ship.invulnerable = 1e9;
  const hp = s.boss.hp;
  update(s, 1 / 120);
  assert.equal(s.boss.state, 'fight');
  assert.ok(Math.abs(hp - s.boss.hp - INJECT.eliteDamage * stageHp(1, 3)) < 1e-9);
});

test('T8: injections are bit-identical at 30/60/120/240 Hz (fixed 1/120 s clock)', () => {
  const run = (hz) => {
    const s = quiet(1);
    group(s, ['W.W.W.W', 'mmmmmmm'], { z: -3.6, spacing: 1.6 });
    s.ship.z = 2;
    const clock = createClock();
    for (let f = 0; f < hz * 6; f++) {
      const t = f / hz;
      advanceClock(clock, 1 / hz);
      // Input boundaries on multiples of 1/30 s, shared by every rate.
      const input = { axisX: Math.floor(t / 0.8 + 1e-6) % 2 ? 1 : -1, axisZ: t + 1e-6 < 1 ? -1 : 0 };
      for (let i = 0; i < clock.steps; i++) update(s, STEP, input);
    }
    return JSON.stringify([s.injections, s.score, s.ship.x, s.ship.z, s.enemies.filter((e) => e.alive).length]);
  };
  const ref = run(120);
  assert.ok(JSON.parse(ref)[0] > 0, 'the run injects');
  for (const hz of [30, 60, 240]) assert.equal(run(hz), ref, `${hz} Hz`);
});
