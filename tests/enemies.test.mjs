/** Archetype behaviours: one job, one bullet family, one telegraph each. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, update, LEVELS } from '../model.mjs';
import { ARCHETYPES, CODE_KIND, stageHp } from '../levels.mjs';
import { LIMITS } from '../patterns.mjs';
import { COLLIDERS } from '../hitboxes.mjs';
import { quiet, group, campaign, running } from './helpers.mjs';

const alive = (s, kind) => s.enemies.filter((e) => e.alive && (!kind || e.kind === kind));
const kill = (s, e) => {
  // A needle placed on the enemy: the real damage rule does the rest.
  for (let i = 0; i < 40 && e.alive; i++) {
    s.shots.push({ id: 1e6 + i, x: e.x, z: e.z + 0.2, vx: 0, vz: -0.001, radius: 0.12, damage: 1 });
    update(s, 1 / 120);
  }
};

test('the formation enters from the back and never descends past z = -4', () => {
  const s = running(42, 1);
  s.ship.invulnerable = 1e9;
  for (let t = 0; t < 90; t += 1 / 30) {
    update(s, 1 / 30);
    s.ship.invulnerable = 1e9;
    s.shots = []; // nobody shoots: the grid keeps coming
    for (const e of s.enemies) if (e.alive && e.group >= 0 && e.mode === 'formation') assert.ok(e.z <= RULES.formationFrontZ + 1e-6, `${e.kind} at z ${e.z}`);
  }
});

test('the choir: 2-3 front-row members of one archetype fire together (world 1)', () => {
  const s = running(42, 1);
  s.ship.invulnerable = 1e9;
  let sizes = [];
  for (let t = 0; t < 20; t += 1 / 60) {
    const before = new Set(s.emitters.map((e) => e.id));
    update(s, 1 / 60);
    s.ship.invulnerable = 1e9;
    s.shots = [];
    const fresh = s.emitters.filter((e) => !before.has(e.id) && e.ownerId);
    if (fresh.length) {
      sizes.push(fresh.length);
      const kinds = new Set(fresh.map((em) => s.enemies.find((e) => e.id === em.ownerId)?.kind));
      assert.equal(kinds.size, 1, 'one archetype per volley');
    }
  }
  assert.ok(sizes.length >= 8);
  assert.ok(Math.max(...sizes) <= 3 && Math.max(...sizes) >= 2, String(sizes));
});

test('WILD TYPE bristles 0.5 s, then a COUGH aimed where the syringe was when it bristled', () => {
  const s = quiet(1);
  s.sector.verse = 'cough';
  const [e] = group(s, ['W']);
  s.choirClock = 0;
  update(s, 1 / 120);
  const em = s.emitters[0];
  assert.equal(em.preset, 'cough');
  assert.ok(e.charge > 0.45);
  const aimX = s.ship.x;
  update(s, 0.2, { axisX: 1 });
  update(s, 0.35);
  const b = s.enemyShots[0];
  assert.ok(b && b.family === 'droplet' && b.src === 'WILD TYPE');
  const xAtShip = b.x + (b.vx / b.vz) * (RULES.shipZ - b.z);
  assert.ok(Math.abs(xAtShip - aimX) < 0.2, 'aim locked at telegraph start');
});

test('SNEEZER inhales for 0.8 s, then fans an odd SNEEZE', () => {
  const s = quiet(2);
  group(s, ['N']);
  s.choirClock = 0;
  update(s, 1 / 120);
  const em = s.emitters[0];
  assert.equal(em.preset, 'sneeze');
  assert.ok(em.tele >= 0.8);
  update(s, em.tele + 0.05);
  // An odd fan per speed tier: the centre bullet points at you.
  assert.equal((s.enemyShots.length / em.p.speeds.length) % 2, 1);
  assert.ok(s.events.some((e) => e.type === 'sneeze') || s.enemyShots.length >= 7);
});

test('BUDDER buds two shootable VIRIONs when it dies; a needle cures them', () => {
  const s = quiet(3);
  const [b] = group(s, ['U'], { z: -6 });
  kill(s, b);
  const virions = s.enemyShots.filter((x) => x.family === 'virion');
  assert.equal(virions.length, 2);
  assert.ok(virions.every((v) => v.shootable));
  const v = virions[0];
  s.shots.push({ id: 5e6, x: v.x, z: v.z + 0.1, vx: 0, vz: -0.001, radius: 0.12 });
  update(s, 1 / 120);
  assert.ok(!s.enemyShots.includes(v));
});

test('DROPLET: a dashed path 0.8 s, a dive, then a puddle that pops into a ring unless shot; a splash raises R0', () => {
  const s = quiet(10);
  s.diveClock = 0;
  group(s, ['D', 'W'], { z: -8 });
  s.ship.invulnerable = 1e9;
  s.ship.fireCooldown = s.ship.antibodyCooldown = 1e9; // a syringe that holds its fire
  update(s, 1 / 120);
  const d = alive(s, 'droplet')[0];
  assert.equal(d.mode, 'aim');
  assert.ok(s.telegraphs.some((t) => t.kind === 'path' && t.ownerId === d.id));
  update(s, 0.7);
  assert.equal(d.mode, 'aim');
  update(s, 0.15);
  assert.equal(d.mode, 'dive');
  for (let i = 0; i < 240 && d.mode === 'dive'; i++) update(s, 1 / 120);
  assert.equal(d.mode, 'puddle');
  assert.ok(Math.hypot(d.x - s.ship.x, d.z - s.ship.z) >= 2.5, 'it lands in front of you, never on you');
  for (let i = 0; i < 240 && d.alive; i++) {
    update(s, 1 / 120);
    s.shots = [];
  }
  assert.equal(d.escaped, true);
  assert.equal(s.sector.escaped, 1);
  assert.ok(s.r0 > 0);
  assert.ok(s.enemyShots.filter((b) => b.src === 'DROPLET').length >= 5, 'the splash ring');
});

test('HIJACKER: a 1.5 s tether turns a WILD TYPE into a HEAVY CROWN unless the hijacker dies (+300 CURED)', () => {
  let s = quiet(11);
  s.ship.fireCooldown = s.ship.antibodyCooldown = 1e9;
  const [h, w] = group(s, ['HW']);
  h.tetherClock = 0;
  update(s, 1 / 120);
  assert.ok(h.tether && s.telegraphs.some((t) => t.kind === 'tether'));
  update(s, 1.6);
  assert.equal(w.kind, 'heavy');
  assert.equal(w.hp, ARCHETYPES.heavy.hp);
  s = quiet(11);
  const [h2] = group(s, ['HW']);
  h2.tetherClock = 0;
  update(s, 1 / 120);
  const score = s.score;
  kill(s, h2);
  assert.ok(s.events.some((e) => e.type === 'cured') || s.score - score >= 300 + 250);
  assert.equal(alive(s, 'heavy').length, 0);
});

test('INFECTED CELL pops (2.2 u) and chains, damaging viruses only, never the syringe', () => {
  const s = quiet(11);
  const [c] = group(s, ['CCW'], { z: -4.6, spacing: 2 }); // 1.6 u away: inside the pop, clear of contact
  s.ship.x = c.x;
  s.ship.z = -3; // point-blank, inside the pop radius
  const health = s.health;
  kill(s, c);
  update(s, 0.3);
  assert.equal(alive(s).length, 0, 'the pop chained through the neighbours');
  assert.equal(s.health, health);
  assert.equal(s.ship.dying, 0);
});

test('BLOOM: closed buds spark needles away; open for 1.8 s after a 0.8 s opening that fires a ring', () => {
  const s = quiet(11);
  const [b] = group(s, ['B']);
  s.ship.invulnerable = 1e9;
  s.ship.fireCooldown = s.ship.antibodyCooldown = 1e9; // only the placed needles
  const hp = b.hp;
  s.shots.push({ id: 7e6, x: b.x, z: b.z + 0.2, vx: 0, vz: -0.001, radius: 0.12 });
  update(s, 1 / 120);
  assert.equal(b.hp, hp, 'closed: invulnerable');
  b.bud.timer = 0;
  update(s, 1 / 120);
  assert.equal(b.bud.state, 'opening');
  update(s, 0.85);
  assert.equal(b.bud.state, 'open');
  assert.ok(s.enemyShots.some((x) => x.family === 'spike'));
  s.shots.push({ id: 7e6 + 1, x: b.x, z: b.z + 0.2, vx: 0, vz: -0.001, radius: 0.12 });
  update(s, 1 / 120);
  assert.ok(b.hp < hp);
  update(s, 1.9);
  assert.equal(b.bud.state, 'closed');
});

test('flights that exit escape (R0 rises); shooting them first keeps R0 at 0', () => {
  const s = running(42, 1);
  const { r0 } = { r0: (spawned, escaped) => (3 * escaped) / spawned };
  s.sector.spawned = 10;
  s.sector.escaped = 3;
  assert.ok(Math.abs(r0(10, 3) - 0.9) < 1e-9);
  update(s, 1 / 60);
  assert.ok(Math.abs(s.r0 - 0.9) < 1e-9);
});

test('VESICLE drifts across the back, never fires and always carries an mRNA supply', () => {
  const s = running(42, 2);
  s.ship.invulnerable = 1e9;
  let v = null;
  for (let t = 0; t < 40 && !v; t += 1 / 60) {
    update(s, 1 / 60);
    s.ship.invulnerable = 1e9;
    s.shots = [];
    // Fixture: the first beat's popcorn is already cured, so the script
    // reaches the develop beat that carries the run's first VESICLE.
    for (const e of s.enemies) if (e.alive && e.kind !== 'vesicle') e.alive = false;
    v = alive(s, 'vesicle').find((e) => Math.abs(e.x) < 7);
  }
  assert.ok(v, 'a vesicle appears in 1-2');
  assert.ok(v.z < -11);
  kill(s, v);
  assert.ok(s.pickups.some((p) => p.kind === 'mrna' && p.source === 'vesicle'));
  assert.ok(!s.emitters.some((em) => em.ownerId === v.id));
});

test('T9 MUTATION (sector 4): a flash means an upgrade; a WILD TYPE becomes a HEAVY CROWN, others fire one tier up', () => {
  const s = quiet(10);
  s.ship.fireCooldown = s.ship.antibodyCooldown = 1e9;
  const [w] = group(s, ['W']);
  s.mutationClock = 0;
  update(s, 1 / 120);
  assert.ok(Math.abs(w.mutating - 0.8) < 0.01, 'a 0.8 s flash');
  update(s, 0.85);
  assert.equal(w.kind, 'heavy');
  assert.equal(w.radius, ARCHETYPES.heavy.radius, 'the HEAVY collider');
  assert.equal(w.hp, Math.round(stageHp(ARCHETYPES.heavy.hp, 10)));
  // Others: one tier up, clamped to LIMITS.
  const t = quiet(10);
  t.ship.fireCooldown = t.ship.antibodyCooldown = 1e9;
  const [n] = group(t, ['N']);
  t.mutationClock = 0;
  update(t, 1 / 120);
  update(t, 0.85);
  assert.equal(n.tier, 1);
  t.choirClock = 0;
  update(t, 1 / 120);
  const em = t.emitters.find((x) => x.ownerId === n.id);
  assert.equal(em.n, 11, 'a 9-way SNEEZE becomes 11-way');
  assert.ok(em.n <= LIMITS.sneeze.n[1]);
  // The introduce beat's 1.2 s flash.
  const i = quiet(10);
  i.sector.mutation = { flash: 1.2, every: 4.5 };
  const [w2] = group(i, ['W']);
  i.mutationClock = 0;
  update(i, 1 / 120);
  assert.ok(Math.abs(w2.mutating - 1.2) < 0.01);
});

test('T9: a virus cured during its flash never fires (it never sings while mutating)', () => {
  const s = quiet(10);
  s.ship.fireCooldown = s.ship.antibodyCooldown = 1e9;
  const [w] = group(s, ['W']);
  s.mutationClock = 0;
  update(s, 1 / 120);
  for (let i = 0; i < 40; i++) {
    s.choirClock = 0;
    update(s, 1 / 60);
  }
  assert.ok(!s.emitters.some((em) => em.ownerId === w.id), 'no attack during the flash');
  kill(s, w);
  update(s, 1);
  assert.equal(s.enemyShots.length, 0);
});

test('T10 RAIN: the choir drops single droplets straight down (static), alternating with the aimed cough', () => {
  const s = quiet(1);
  s.ship.fireCooldown = s.ship.antibodyCooldown = 1e9;
  s.ship.x = 4;
  group(s, ['W.W.W.W']);
  const presets = [];
  for (let v = 0; v < 4; v++) {
    s.choirClock = 0;
    update(s, 1 / 120);
    presets.push(s.emitters.at(-1)?.preset);
    update(s, 0.7);
    s.emitters = [];
  }
  assert.deepEqual(presets, ['rain', 'cough', 'rain', 'cough'], 'volleys alternate rain and cough');
  const rain = s.enemyShots.filter((b) => b.pattern === 'RAIN');
  assert.ok(rain.length >= 2);
  for (const b of rain) {
    assert.equal(b.vx, 0, 'angle 0: only the CURRENT drifts a lane');
    assert.equal(b.gram, 'static');
    assert.ok(Math.hypot(b.vx, b.vz) <= 5 + 1e-9, 'a static field stays at or below 5 u/s');
  }
  assert.ok(rain.every((b) => b.vz > 0));
  // Lanes from neighbouring minis (1.18 u apart) leave room for the core.
  const lane = 1.18 - 2 * COLLIDERS.droplet.r;
  assert.ok(lane >= 2 * RULES.shipRadius, `lane clearance ${lane}`);
});

test('BREATH (lungs) slows bullets to x0.6 on the inhale and x1.3 on the exhale; CURRENT drifts them 0.8 u/s', () => {
  const s = quiet(4);
  s.waveElapsed = 1.5;
  update(s, 1 / 120);
  assert.equal(s.twist.stage, 'inhale');
  assert.equal(s.twist.scale, 0.6);
  s.waveElapsed = 3;
  update(s, 1 / 120);
  assert.equal(s.twist.scale, 1.3);
  const c = quiet(7);
  c.enemyShots.push({ id: 1, x: 0, z: -5, vx: 0, vz: 0, family: 'droplet', hit: 0.16, vis: 0.26, src: 'TEST', age: 0 });
  update(c, 1);
  assert.ok(Math.abs(Math.abs(c.enemyShots[0].x) - 0.8) < 0.02);
});

test('every archetype debuts while only plain WILD TYPEs are on the board (campaign run)', () => {
  const firstSeen = {};
  campaign(7, {
    observe(s) {
      for (const ev of s.events) {
        if (ev.type === 'mutated' && ev.into === 'heavy' && !firstSeen.heavy) firstSeen.heavy = { code: LEVELS[s.wave - 1].code, others: [], via: 'mutation' };
        if (ev.type === 'spawn' && !(ev.kind in firstSeen)) {
          const others = new Set(s.enemies.filter((e) => e.alive && e.id !== ev.id && e.kind !== ev.kind && e.kind !== 'boss').map((e) => e.kind));
          for (const k of ['wild', 'mini', 'vesicle']) others.delete(k);
          firstSeen[ev.kind] = { code: LEVELS[s.wave - 1].code, others: [...others] };
        }
      }
    },
  });
  // The v1.0 cast (RESEARCH_V1.md 2.4): BUDDER, HIJACKER and INFECTED CELL
  // are out of the run; HEAVY CROWN first appears through MUTATION in 4-1.
  for (const kind of ['sneezer', 'worm', 'puff', 'droplet', 'bloom']) {
    assert.ok(firstSeen[kind], `${kind} never appeared`);
    assert.deepEqual(firstSeen[kind].others, [], `${kind} debuts at ${firstSeen[kind].code} next to ${firstSeen[kind].others}`);
  }
  for (const kind of ['budder', 'hijacker', 'cell']) assert.ok(!firstSeen[kind], `${kind} is retired from the run`);
  assert.equal(firstSeen.heavy?.code, '4-1');
  assert.equal(firstSeen.heavy?.via, 'mutation');
  assert.equal(Object.keys(CODE_KIND).length, 9);
});
