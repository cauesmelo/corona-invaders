/** The v1.0 short syringe (RESEARCH_V1.md 4, tests T7 and T11): the drawn
 * body is 1.64 u long and lies entirely inside the 1.0 u graze ring, the core
 * sits at the silhouette's centroid, the needles leave the drawn tip, and
 * focus is a real trade-off (wide spray vs a concentrated needle stream).
 * The browser half of T7 (length in px, ghosting, marker = collider) lives in
 * the root QA suite. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, update } from '../model.mjs';
import { BODY_RADIUS, INJECT, NEEDLE } from '../hitboxes.mjs';
import { SYRINGE, syringeOutline } from '../shapes.mjs';
import { quiet, group } from './helpers.mjs';

const part = (role) => SYRINGE.parts.find((p) => p.role === role);

test('T7: the syringe is at most 1.7 u long, tilted at most 10 degrees, drawn at scale 1', () => {
  const zs = SYRINGE.parts.flatMap((p) => [p.z0, p.z1]);
  const length = (Math.max(...zs) - Math.min(...zs)) * SYRINGE.scale;
  assert.ok(length <= 1.7 + 1e-9, `length ${length}`);
  assert.ok(Math.abs(length - 1.64) < 1e-9, 'the brief proportions: 1.64 u');
  assert.ok(SYRINGE.tilt <= (10 * Math.PI) / 180 + 1e-12, `tilt ${SYRINGE.tilt}`);
  assert.equal(SYRINGE.tip, Math.min(...zs), 'the tip is the most up-field point');
});

test('T7: every point of the drawn syringe lies inside the 1.0 u graze ring', () => {
  for (const p of syringeOutline()) {
    for (const z of [p.z0, p.z1]) {
      const far = Math.hypot(z, p.half);
      assert.ok(far < RULES.grazeRadius, `${p.role}: corner ${far.toFixed(3)} u from the core`);
    }
  }
});

test('T7: the core is within 0.05 u of the area-weighted silhouette centroid, at the barrel centre', () => {
  let area = 0,
    moment = 0;
  for (const p of syringeOutline()) {
    const a = (p.z1 - p.z0) * 2 * p.half;
    area += a;
    moment += a * (p.z0 + p.z1) * 0.5;
  }
  const centroid = moment / area;
  assert.ok(Math.abs(centroid - SYRINGE.core.z) <= 0.05, `centroid ${centroid.toFixed(3)}`);
  const barrel = part('barrel');
  assert.equal((barrel.z0 + barrel.z1) / 2, SYRINGE.core.z);
  assert.equal(SYRINGE.core.r, RULES.shipRadius, 'the drawn dose is the collider');
  // The core fills about 71% of the barrel width: a glass capsule around its dose.
  assert.ok(Math.abs(RULES.shipRadius / barrel.r - 0.71) < 0.01);
});

test('T7: BODY_RADIUS is the barrel radius; the needle tip is the INJECT collider', () => {
  assert.equal(BODY_RADIUS, part('barrel').r);
  assert.equal(BODY_RADIUS, SYRINGE.barrelRadius * SYRINGE.scale);
  assert.equal(INJECT.reach, -SYRINGE.tip * SYRINGE.scale, 'the tip collider sits at the drawn tip');
  assert.ok(INJECT.r <= part('needle').outline, 'the tip collider is no wider than the drawn needle outline');
});

test('T7: needles leave the drawn tip (the muzzle), not a point ahead of it', () => {
  const s = quiet();
  update(s, 1 / 120, {});
  const tips = s.shots.map((n) => n.z);
  assert.ok(tips.length >= 3);
  // Spawned at the tip, then moved by one substep at 34 u/s (cos of the spray angle).
  for (const z of tips) assert.ok(z <= s.ship.z - INJECT.reach + 1e-9 && z >= s.ship.z - INJECT.reach - RULES.needleSpeed / 120 - 1e-9, `${z}`);
});

/** Damage per second on one still target of radius r at distance d. */
function dpsOn(power, focus, r = 0.6, d = 10) {
  const s = quiet();
  s.ship.power = power;
  const [e] = group(s, ['W'], { z: s.ship.z - d });
  e.radius = r;
  e.hp = e.maxHp = 1e6;
  s.ship.x = e.x;
  for (let i = 0; i < 600; i++) update(s, 1 / 60, { focus });
  return (1e6 - e.hp) / 10;
}
test('T11: unfocused SPRAY covers at least 3 u at 10 u from power 3; focused NEEDLE deals >= 1.5x on one 0.6 u target', (t) => {
  // Five needles at k x sprayAngle: the outer pair's offset 10 u out, plus the needle radius.
  const cover = 2 * (10 * Math.tan(2 * RULES.sprayAngle) + NEEDLE.r);
  assert.ok(cover >= 3, `coverage ${cover.toFixed(2)} u`);
  const gains = [1, 2, 3, 4].map((p) => dpsOn(p, true) / dpsOn(p, false));
  t.diagnostic(`focused / unfocused DPS on a 0.6 u target at 10 u, power 1-4: ${gains.map((g) => g.toFixed(2)).join(' / ')}`);
  for (const [i, g] of gains.entries()) assert.ok(g >= 1.5, `power ${i + 1}: x${g.toFixed(2)}`);
});
test('T11: unfocused needles still all land on a boss-sized target 17.6 u away at power 1', () => {
  // Same needle count reaches it either way: the spray never halves boss DPS.
  const spray = dpsOn(1, false, 2, 17.6),
    stream = dpsOn(1, true, 2, 17.6);
  assert.ok(spray >= stream * 0.99, `spray ${spray} vs focus ${stream}`);
});
