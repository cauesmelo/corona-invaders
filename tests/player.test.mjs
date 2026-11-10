/** The bullet-hell kit: hitbox vs graze, focus, SOAP, deathbomb, respawn,
 * power and auto-fire. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, update, createState, startGame, collectPickup, useBomb, FAMILIES, togglePause } from '../model.mjs';
import { spawnBullet } from '../bullets.mjs';
import { quiet, group, bullet } from './helpers.mjs';

const at = (s, dx, dz, extra) => {
  const b = bullet(s.ship.x + dx, s.ship.z + dz, extra);
  s.enemyShots.push(b);
  return b;
};

test('the core hitbox is 0.2 u and the graze ring 1.0 u around it', () => {
  assert.equal(RULES.shipRadius, 0.2);
  assert.equal(RULES.grazeRadius, 1);
  const r = RULES.shipRadius + 0.15; // core + a circle bullet's solid
  // Just inside core + bullet radius: a hit (the deathbomb window opens).
  let s = quiet();
  at(s, r - 0.02, 0);
  update(s, 1 / 120);
  assert.ok(s.ship.dying > 0, 'touching the core is a hit');
  // Just outside the core but inside the graze ring: a graze, never a hit.
  s = quiet();
  at(s, r + 0.03, 0);
  update(s, 1 / 120);
  assert.equal(s.ship.dying, 0);
  assert.equal(s.grazes, 1);
  // Outside the graze ring: nothing.
  s = quiet();
  at(s, 1 + 0.15 + 0.05, 0);
  update(s, 1 / 120);
  assert.equal(s.grazes, 0);
  assert.equal(s.ship.dying, 0);
});

test('graze counts once per bullet, scores 10, and every 100 grazes gives a SOAP', () => {
  const s = quiet();
  const b = at(s, 0.6, 0);
  for (let i = 0; i < 10; i++) update(s, 1 / 120);
  assert.equal(s.grazes, 1, 'one bullet lingering in the ring grazes once');
  assert.equal(s.score, 10);
  assert.equal(b.grazed, true);
  const bombs = s.ship.bombs;
  s.ship.grazeProgress = 99;
  at(s, -0.7, 0.2);
  update(s, 1 / 120);
  assert.equal(s.ship.bombs, bombs + 1);
  assert.equal(s.ship.grazeProgress, 0);
});

test('normal speed 11.5 u/s, focus 5.0 u/s with an instant switch, diagonals normalised', () => {
  let s = quiet();
  s.ship.x = -6;
  update(s, 0.5, { axisX: 1 });
  assert.ok(Math.abs(s.ship.x - -6 - 11.5 * 0.5) < 0.01, `normal ${s.ship.x}`);
  s = quiet();
  s.ship.x = -6;
  update(s, 0.06, { axisX: 1, focus: true });
  const x0 = s.ship.x;
  update(s, 0.5, { axisX: 1, focus: true });
  assert.ok(Math.abs(s.ship.x - x0 - 5 * 0.5) < 0.05, `focus ${s.ship.x - x0}`);
  assert.ok(s.ship.focus);
  assert.ok(RULES.focusSpeed / RULES.shipSpeed < 0.5);
  s = quiet();
  Object.assign(s.ship, { x: 0, z: 8 });
  update(s, 0.2, { axisX: 1, axisZ: -1 });
  assert.ok(Math.abs(Math.hypot(s.ship.x, s.ship.z - 8) - 11.5 * 0.2) < 0.01, 'a diagonal is never faster');
});

test('the syringe moves in a 2D box: x within +/-8.9, z within -3..12', () => {
  const s = quiet();
  update(s, 2, { axisX: 1, axisZ: -1 });
  assert.equal(s.ship.x, RULES.moveMaxX);
  assert.equal(s.ship.z, RULES.moveMinZ);
  update(s, 2, { axisX: -1, axisZ: 1 });
  update(s, 1, { axisX: -1, axisZ: 1 });
  assert.equal(s.ship.x, RULES.moveMinX);
  assert.equal(s.ship.z, RULES.moveMaxZ);
  // Pointer steering: follows the target at normal speed, never teleports.
  update(s, 0.1, { targetX: 0, targetZ: 6 });
  assert.ok(Math.hypot(s.ship.x - RULES.moveMinX, s.ship.z - 12) <= 11.5 * 0.1 + 1e-6);
});

test('auto-fire: 8 volleys/s; SPRAY fans 3 needles at +/-4 degrees, NEEDLE fires 3 parallel', () => {
  let s = quiet();
  update(s, 1);
  assert.ok(s.shotsFired >= 8 && s.shotsFired <= 9, String(s.shotsFired));
  s = quiet();
  update(s, 1 / 120);
  const xs = s.shots.map((n) => Math.atan2(n.vx, -n.vz));
  assert.deepEqual(xs.map((a) => Math.round((a * 180) / Math.PI)).sort((a, b) => a - b), [-4, 0, 4]);
  s = quiet();
  update(s, 1 / 120, { focus: true });
  assert.equal(s.shots.length, 3);
  assert.ok(s.shots.every((n) => n.vx === 0));
  const gaps = s.shots.map((n) => n.x).sort((a, b) => a - b);
  assert.ok(Math.abs(gaps[1] - gaps[0] - 0.25) < 1e-9);
});

test('power levels: mRNA adds needles and antibody options; options tuck in while focused', () => {
  const s = quiet();
  collectPickup(s, { kind: 'mrna', x: 0, z: 0 });
  assert.equal(s.ship.power, 2, 'one strand: level 2');
  update(s, 1 / 120);
  assert.equal(s.shots.length, 3 + 2, 'spray + two antibodies');
  collectPickup(s, { kind: 'mrna', x: 0, z: 0 });
  assert.equal(s.ship.power, 2, 'level 3 needs 3 strands');
  collectPickup(s, { kind: 'mrna', x: 0, z: 0 });
  assert.equal(s.ship.power, 3);
  collectPickup(s, { kind: 'mrna', x: 0, z: 0 });
  collectPickup(s, { kind: 'mrna', x: 0, z: 0 });
  assert.equal(s.ship.power, 4);
  s.shots = [];
  s.ship.fireCooldown = s.ship.antibodyCooldown = 0;
  update(s, 1 / 120, { focus: true });
  assert.equal(s.shots.length, 5 + 4);
  const option = s.shots.filter((n) => Math.abs(n.x - s.ship.x) > 0.55).map((n) => Math.abs(n.x - s.ship.x));
  assert.ok(Math.max(...option) <= 1.0001, 'focused antibodies tuck within 1 u');
});

test('SOAP clears bullets into antigen tokens, spends stock, grants 2 s and kills popcorn', () => {
  const s = quiet();
  group(s, ['WWW'], { z: -4 });
  for (let i = 0; i < 20; i++) at(s, (i % 5) - 2, -3 - Math.floor(i / 5));
  const stock = s.ship.bombs;
  update(s, 1 / 60, { bomb: true });
  assert.equal(s.ship.bombs, stock - 1);
  assert.equal(s.bombsUsed, 1);
  assert.ok(s.ship.invulnerable >= 1.9);
  for (let i = 0; i < 60; i++) update(s, 1 / 60, { bomb: true });
  assert.equal(s.ship.bombs, stock - 1, 'holding the key spends one SOAP per press');
  assert.equal(s.enemyShots.length, 0);
  assert.equal(s.enemies.filter((e) => e.alive).length, 0, '12 damage kills WILD TYPEs');
  assert.ok(s.score >= 20 * 20, 'every cancelled bullet became an antigen token worth 20');
  // No stock: nothing happens.
  s.ship.bombs = 0;
  update(s, 1 / 60, { bomb: false });
  update(s, 1 / 60, { bomb: true });
  assert.equal(s.bombsUsed, 1);
});

test('deathbomb: SOAP within 0.18 s of a hit cancels the death; later, the vial is lost', () => {
  let s = quiet();
  at(s, 0.05, 0);
  update(s, 1 / 120);
  assert.ok(s.ship.dying > 0 && s.ship.dying <= RULES.deathbomb);
  update(s, 0.1);
  update(s, 1 / 120, { bomb: true });
  assert.equal(s.ship.dying, 0);
  assert.equal(s.health, 3);
  assert.equal(s.deathbombs, 1);
  s = quiet();
  at(s, 0.05, 0);
  update(s, 1 / 120);
  update(s, 0.2);
  assert.equal(s.health, 2, 'too late: the vial is lost');
});

test('death: a vial and a power level are lost (caught back within 4 s), every bullet cancels, 0.5 s glide, 2.5 s invulnerable', () => {
  const s = quiet();
  Object.assign(s.ship, { power: 3, mrna: 3, bombs: 0 });
  for (let i = 0; i < 12; i++) at(s, i - 6, -5);
  at(s, 0, 0);
  update(s, 1 / 120);
  update(s, 0.2);
  assert.equal(s.health, 2);
  assert.equal(s.ship.power, 2);
  assert.equal(s.enemyShots.length, 0);
  assert.equal(s.ship.bombs, 2, 'SOAP stock refills to 2 per vial');
  const strand = s.pickups.find((p) => p.kind === 'mrna');
  assert.ok(strand && strand.life === RULES.strandTime);
  assert.ok(s.ship.respawn > 0 && s.ship.respawn <= RULES.respawnTime);
  assert.ok(s.ship.invulnerable > RULES.hitInvulnerability);
  update(s, 0.6);
  assert.equal(s.ship.respawn, 0, 'control returns after 0.5 s');
  assert.ok(Math.abs(s.ship.z - RULES.shipZ) < 1e-6);
  assert.ok(s.ship.invulnerable > 2);
  update(s, 2, { targetX: strand.x, targetZ: strand.z });
  assert.equal(s.ship.power, 3, 'the dropped strand can be caught back');
});

test('no bullet spawns within 2.5 u of the core', () => {
  const s = quiet();
  for (let a = 0; a < 40; a++) {
    const r = 0.5 + (a % 10) * 0.25;
    spawnBullet(s, { x: s.ship.x + Math.cos(a) * r, z: s.ship.z + Math.sin(a) * r, angle: 0, speed: 4 });
  }
  for (const b of s.enemyShots) assert.ok(Math.hypot(b.x - s.ship.x, b.z - s.ship.z) >= RULES.spawnExclusion);
  assert.ok(s.enemyShots.length > 0, 'spawns outside the circle still happen');
});

test('every bullet carries a family and a source, so the loss card names a real cause', () => {
  // A bare QA fixture bullet (no family, no src) still produces a meaningful cause.
  const s = quiet();
  s.health = 1;
  s.ship.bombs = 0;
  s.enemyShots.push({ id: 999, x: s.ship.x, z: s.ship.z - 0.1, vx: 0, vz: 8, radius: 0.2 });
  update(s, 0.25);
  assert.equal(s.phase, 'lost');
  assert.equal(s.lastCause.by, 'VIRUS');
  assert.equal(s.lastCause.what, 'DROPLET');
  assert.ok(!JSON.stringify(s.lastCause).includes('undefined'));
  // Real play: every spawned bullet is labelled.
  const live = startGame(createState({ seed: 3, stage: 1 }));
  for (let f = 0; f < 60 * 25; f++) {
    update(live, 1 / 60);
    live.ship.invulnerable = 9;
    for (const b of live.enemyShots) {
      assert.ok(FAMILIES[b.family], `family ${b.family}`);
      assert.ok(typeof b.src === 'string' && b.src.length > 1, `src ${b.src}`);
    }
  }
});

test('MASK absorbs droplets in its frontal arc, never mucus globs', () => {
  const s = quiet();
  s.ship.powerups.mask = 10;
  const d = at(s, 0, -1.1);
  const g = at(s, 0.2, -1.3, { family: 'glob', hit: 0.45, vis: 0.6 });
  update(s, 1 / 120);
  assert.ok(!s.enemyShots.includes(d), 'droplet absorbed');
  assert.ok(s.enemyShots.includes(g), 'glob passes');
});

test('Easy: 5 vials, 3 SOAP, auto-bomb on hit, 0.35 s deathbomb', () => {
  const s = quiet(1, { difficulty: 'easy' });
  assert.equal(s.health, 5);
  assert.equal(s.ship.bombs, 3);
  at(s, 0, 0);
  update(s, 1 / 120);
  assert.equal(s.health, 5, 'the auto-bomb spent a SOAP instead');
  assert.equal(s.ship.bombs, 2);
  assert.equal(s.bombsUsed, 1);
});

test('pause freezes combat, bullets and timers', () => {
  const s = quiet();
  at(s, 3, -3, { vz: 4 });
  togglePause(s);
  const before = structuredClone(s);
  update(s, 1, { axisX: 1 });
  assert.equal(s.ship.x, before.ship.x);
  assert.equal(s.enemyShots[0].z, before.enemyShots[0].z);
  assert.equal(s.elapsed, before.elapsed);
  togglePause(s);
  update(s, 0.1);
  assert.ok(s.enemyShots[0].z > before.enemyShots[0].z);
});

test('useBomb refuses during the respawn glide', () => {
  const s = quiet();
  s.ship.respawn = 0.3;
  assert.equal(useBomb(s), false);
});
