/** Precise hitboxes: every collider equals what is drawn, colliders and
 * visuals share the board plane, elongated bullets are capsules, and
 * collisions are swept (user feedback: "the hitbox of everything needs to be
 * very precise"). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULES, update, ARCHETYPES, BOSSES } from '../model.mjs';
import { COLLIDERS, NEEDLE, BODY_RADIUS, drawnSolid, bulletQuad, spriteLayout, enemyScale, bodyRadiusOf, sweptHit, segSegDist2 } from '../hitboxes.mjs';
import { FAMILIES, spawnBullet } from '../bullets.mjs';
import { SHAPES, SYRINGE, shapeFor } from '../shapes.mjs';
import { quiet, group, cardArena } from './helpers.mjs';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('every bullet family: the drawn solid (rim included) is exactly its collider', () => {
  for (const [family, c] of Object.entries(COLLIDERS)) {
    const d = drawnSolid(family);
    assert.ok(close(d.r, c.r, 0.005), `${family}: drawn radius ${d.r} vs collider ${c.r}`);
    assert.ok(close(d.half, c.half, 0.005), `${family}: drawn half-length ${d.half} vs ${c.half}`);
    assert.equal(FAMILIES[family].hit, c.r);
    assert.equal(FAMILIES[family].half, c.half);
    const q = bulletQuad(family),
      L = spriteLayout(family);
    assert.ok(close(q.w / q.l, L.width / L.height, 1e-9), `${family}: the quad keeps the canvas aspect, so circles stay circles`);
  }
  assert.ok(COLLIDERS.droplet.half > 0 && COLLIDERS.spike.half > 0, 'elongated families are capsules');
  const s = quiet();
  const b = spawnBullet(s, { x: 0, z: -6, angle: 0, speed: 5, family: 'spike' });
  assert.deepEqual([b.hit, b.half], [COLLIDERS.spike.r, COLLIDERS.spike.half]);
});

test('every enemy and boss part: its body is drawn at exactly the collider radius (spikes are decorative)', () => {
  const kinds = Object.keys(ARCHETYPES);
  for (const kind of kinds) {
    const a = ARCHETYPES[kind];
    const spec = shapeFor({ kind });
    const e = { kind, radius: a.radius, half: a.half || 0 };
    assert.ok(close(bodyRadiusOf(spec) * enemyScale(e, spec), e.radius), kind);
  }
  // Capsule bodies: the drawn lobes / tube span the collider's half-length.
  const bud = SHAPES.budder,
    sb = enemyScale({ kind: 'budder', radius: ARCHETYPES.budder.radius }, bud);
  assert.ok(close(bud.parts[0].at[0] * -sb, ARCHETYPES.budder.half, 0.01), 'budder lobes at the capsule ends');
  assert.ok(close(SHAPES.worm.bodyHalf, ARCHETYPES.worm.half), 'worm tube spans the capsule');
  assert.ok(close(SHAPES.worm.parts[0].length / 2, ARCHETYPES.worm.half), 'worm tube length');
  for (const [type] of Object.entries(BOSSES)) {
    const s = cardArena(type, 0);
    for (const p of s.enemies.filter((e) => e.kind === 'boss')) {
      const spec = shapeFor(p, type);
      assert.ok(close(bodyRadiusOf(spec) * enemyScale(p, spec), p.radius), `${type} ${p.part}`);
    }
  }
});

test('the syringe: one core at the barrel centre, drawn at exactly the collision radius; supplies touch the barrel', () => {
  assert.equal(SYRINGE.core.r, RULES.shipRadius);
  assert.equal(SYRINGE.core.z, 0);
  const barrel = SYRINGE.parts.find((p) => p.role === 'barrel');
  assert.equal(barrel.z, 0, 'the chamber sits at the barrel centre');
  assert.ok(close(SYRINGE.barrelRadius * SYRINGE.scale, BODY_RADIUS, 0.001), 'the drawn barrel half-width is the supply catcher');
  assert.ok(2 * RULES.shipRadius * 15 >= 6, 'about 6 px or more even at 15 px/u (320 px wide)');
  const src = readFileSync(new URL('../render.mjs', import.meta.url), 'utf8');
  assert.ok(/const dotR = RULES\.shipRadius;/.test(src), 'the renderer draws the marker at the collider radius, never scaled up');
  assert.ok(!/BULLET_Y \+ bob/.test(src), 'enemies sit on the board plane (no bob offset)');
});

test('capsules: an elongated droplet hits where a circle at its centre would miss', () => {
  const s = quiet();
  s.ship.invulnerable = 0;
  const c = COLLIDERS.droplet;
  // Centre 0.43 u ahead of the core along its travel: the circle gap is
  // 0.43 - 0.15 = 0.28 > 0.2, but the capsule tip reaches 0.43 - 0.12 - 0.15.
  s.enemyShots.push({ id: 1, x: s.ship.x, z: s.ship.z - 0.43, vx: 0, vz: 0.001, family: 'droplet', hit: c.r, half: c.half, src: 'T', age: 0 });
  update(s, 1 / 1200);
  assert.ok(s.ship.dying > 0);
  // Side-on, the same capsule is only its radius wide.
  const t = quiet();
  t.enemyShots.push({ id: 2, x: t.ship.x + 0.38, z: t.ship.z, vx: 0, vz: 0.001, family: 'droplet', hit: c.r, half: c.half, src: 'T', age: 0 });
  update(t, 1 / 1200);
  assert.equal(t.ship.dying, 0);
});

test('swept collision: a bullet that jumps across the core within one substep still hits', () => {
  const s = quiet();
  // 120 u/s = 1 u per 1/120 s substep: it starts 0.5 u before the core and
  // ends 0.5 u past it; a point test at either end would miss.
  s.enemyShots.push({ id: 3, x: s.ship.x, z: s.ship.z - 0.5, vx: 0, vz: 120, family: 'aerosol', hit: 0.15, half: 0, src: 'T', age: 0 });
  update(s, 1 / 120);
  assert.ok(s.ship.dying > 0, 'no tunnelling');
  assert.ok(sweptHit({ x: 0, z: 1, px: 0, pz: -1, hit: 0.1, half: 0, vx: 0, vz: 1 }, 0, 0, 0, 0, 0.1));
  assert.equal(segSegDist2(-1, 0, 1, 0, 0, -1, 0, 1), 0, 'crossing segments');
});

test('needles never tunnel: at 34 u/s every needle crossing the smallest virus is caught', () => {
  for (let offset = 0; offset < 0.6; offset += 0.05) {
    const s = quiet();
    s.ship.fireCooldown = s.ship.antibodyCooldown = 1e9;
    const [e] = group(s, ['m'], { z: -5 });
    s.shots.push({ id: 1, x: e.x + e.radius + NEEDLE.r - 0.01, z: e.z + 1 + offset, vx: 0, vz: -RULES.needleSpeed, radius: NEEDLE.r, damage: 1 });
    update(s, 0.1);
    assert.equal(e.alive, false, `offset ${offset}`);
  }
  const s = quiet();
  s.ship.fireCooldown = s.ship.antibodyCooldown = 1e9;
  const [e] = group(s, ['m'], { z: -5 });
  s.shots.push({ id: 1, x: e.x + e.radius + NEEDLE.r + 0.02, z: e.z + 2, vx: 0, vz: -RULES.needleSpeed, radius: NEEDLE.r, damage: 1 });
  update(s, 0.2);
  assert.equal(e.alive, true, 'a needle that passes beside the body misses');
});

test('beams hit exactly where drawn; contact uses the drawn body; supplies and SOAP touch exactly', () => {
  const r = RULES.shipRadius;
  let s = quiet();
  s.beams.push({ id: 1, x: s.ship.x + 1 + r - 0.01, width: 2, fromZ: -8, timer: 0.5, src: 'T' });
  update(s, 1 / 1200);
  assert.ok(s.ship.dying > 0, 'core overlapping the drawn edge');
  s = quiet();
  s.beams.push({ id: 1, x: s.ship.x + 1 + r + 0.02, width: 2, fromZ: -8, timer: 0.5, src: 'T' });
  update(s, 1 / 1200);
  assert.equal(s.ship.dying, 0, 'just outside the drawn beam');
  // Enemy contact: the body circle against the core.
  for (const [d, hit] of [[-0.02, true], [0.02, false]]) {
    const t = quiet();
    t.ship.fireCooldown = t.ship.antibodyCooldown = 1e9;
    const [e] = group(t, ['W'], { z: 0 });
    t.ship.x = e.x + e.radius + r + d;
    t.ship.z = e.z;
    update(t, 1 / 1200);
    assert.equal(t.ship.dying > 0, hit, `contact at ${d}`);
  }
  // Supplies: caught when the drawn icon touches the drawn barrel.
  for (const [d, caught] of [[-0.01, 1], [0.03, 0]]) {
    const t = quiet();
    t.pickups.push({ id: 7, kind: 'soap', x: t.ship.x + 0.5 + BODY_RADIUS + d, z: t.ship.z, age: 0, phase: 0, radius: 0.5 });
    update(t, 1 / 1200);
    assert.equal(t.pickupsCaught, caught, `pickup at ${d}`);
  }
  // SOAP: cancels exactly the bullets its drawn bubble touches.
  const t = quiet();
  t.soapRing = { x: t.ship.x, z: t.ship.z, r: 0, t: 0.2, hit: [] };
  const R = (15 * (0.2 + 1 / 1200)) / 0.6;
  t.enemyShots.push({ id: 11, x: t.ship.x, z: t.ship.z - (R + 0.15 - 0.03), vx: 0, vz: 0, family: 'aerosol', hit: 0.15, half: 0, src: 'T', age: 0 });
  t.enemyShots.push({ id: 12, x: t.ship.x, z: t.ship.z - (R + 0.15 + 0.03), vx: 0, vz: 0, family: 'aerosol', hit: 0.15, half: 0, src: 'T', age: 0 });
  update(t, 1 / 1200);
  assert.deepEqual(t.enemyShots.map((b) => b.id), [12]);
});
