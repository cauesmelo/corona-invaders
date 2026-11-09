import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, LEVELS, createState, startGame, update, maybeDrop, restartGame } from '../model.mjs';
import { spawnCourier, PICKUP_KINDS } from '../enemies.mjs';
import { fixture } from './helpers.mjs';

const at = (s, e) => s.shots.push({ id: 5000 + s.shots.length, x: e.x, z: e.z, vx: 0, vz: 0, radius: 0.16 });
const living = (s, kind) => s.enemies.filter((e) => e.alive && (!kind || e.kind === kind));

test('splitter: two hits, then two daughters drift apart at 3 u/s for 0.6 s and hold', () => {
  const s = fixture(['X', '.', 'S'], { z: -4 });
  const splitter = s.enemies[0];
  assert.equal(splitter.hp, 2);
  at(s, splitter);
  update(s, 1 / 180);
  assert.equal(living(s, 'daughter').length, 0);
  at(s, splitter);
  update(s, 1 / 180);
  const daughters = living(s, 'daughter');
  assert.equal(daughters.length, 2);
  assert.deepEqual(daughters.map((d) => d.mode), ['drift', 'drift']);
  assert.ok(daughters.every((d) => d.radius < splitter.radius && d.hp === 1));
  // The splitter kill froze the model for its 30 ms hitstop first.
  assert.ok(Math.abs(s.hitstop - 0.03) < 1e-9);
  update(s, 0.64);
  const gap = Math.abs(daughters[0].x - daughters[1].x);
  assert.ok(Math.abs(gap - (0.7 + 2 * 3 * 0.6)) < 0.15, `gap ${gap}`);
  assert.deepEqual(daughters.map((d) => d.mode), ['formation', 'formation']);
  const before = daughters.map((d) => d.x);
  update(s, 0.2);
  assert.deepEqual(daughters.map((d) => +d.x.toFixed(6)), before.map((x) => +x.toFixed(6)), 'no snap after drifting');
});
test('armored splitters take three hits and still divide', () => {
  const s = fixture(['Y', 'S'], { z: -4 });
  const y = s.enemies[0];
  assert.equal(y.hp, 3);
  for (let i = 0; i < 3; i++) {
    at(s, y);
    update(s, 1 / 180);
  }
  assert.equal(y.alive, false);
  assert.equal(living(s, 'daughter').length, 2);
});
test('daughters never drop capsules: not by random roll, not by the x4 guarantee', () => {
  const s = fixture(['XXXXXXXXXX', 'XXXXXXXXXX'], { z: -6, spacing: 1.7 });
  for (const e of s.enemies) e.hp = 1;
  for (const e of [...s.enemies]) at(s, e);
  update(s, 1 / 180);
  update(s, 1); // past the hitstop and the 0.6 s drift
  const daughters = living(s, 'daughter');
  assert.equal(daughters.length, 40);
  s.pickups = [];
  s.sector.guaranteeUsed = false;
  s.chain = { count: 40, timer: 1.6, best: 40 };
  for (const d of daughters) {
    s.dropCooldown = 0;
    at(s, d);
  }
  update(s, 1 / 180);
  update(s, 0.2);
  assert.equal(living(s, 'daughter').length, 0);
  assert.equal(s.pickups.length, 0);
  assert.equal(s.sector.guaranteeUsed, false);
  for (let i = 0; i < 5000; i++) {
    s.dropCooldown = 0;
    assert.equal(maybeDrop(s, daughters[0]), false);
  }
});

function diverFixture(stage = 6) {
  const s = fixture(['V', '.', '.', 'S'], { stage, z: -8 });
  s.diveClock = 0;
  return s;
}
test('diver: a pink path is drawn 0.8 s before the dive, ending where the ship was', () => {
  const s = diverFixture();
  s.ship.x = 3;
  update(s, 1 / 180);
  const diver = s.enemies[0];
  assert.equal(diver.mode, 'telegraph');
  const path = s.telegraphs.find((t) => t.kind === 'path');
  assert.ok(path && path.danger);
  assert.equal(path.x, 3);
  update(s, 0.78);
  assert.equal(diver.mode, 'telegraph');
  update(s, 0.05);
  assert.equal(diver.mode, 'dive');
});
test('diver: dives along the line, fires once straight down it, then returns by the rail', () => {
  const s = diverFixture();
  s.ship.x = -2;
  const diver = s.enemies[0];
  let fired = [],
    reachedRail = false;
  update(s, 1 / 60, { targetX: 6 });
  const lineX = s.telegraphs.find((t) => t.kind === 'path').x;
  for (let i = 0; i < 60 * 10 && diver.mode !== "formation"; i++) {
    update(s, 1 / 60, { targetX: 6 });
    fired.push(...s.enemyShots.filter((b) => b.src === 'DIVER' && !fired.some((f) => f.id === b.id)));
    if (diver.mode === 'return') reachedRail ||= Math.abs(diver.x) > 8.5;
  }
  assert.ok(reachedRail, 'returns up a side rail, not back through the ship lane');
  assert.equal(fired.length, 1);
  assert.equal(fired[0].vx, 0);
  assert.ok(Math.abs(fired[0].x - lineX) < 0.01, 'the shot lands on the drawn line');
  assert.equal(diver.mode, 'formation');
  assert.equal(s.damageTaken, 0, 'leaving the line dodges the dive shot');
  assert.equal(s.telegraphs.length, 0);
});
test('diver: kills during a dive score double; contact costs a heart', () => {
  const s = diverFixture();
  const diver = s.enemies[0];
  for (let i = 0; i < 200 && diver.mode !== 'dive'; i++) update(s, 1 / 60);
  update(s, 0.3);
  at(s, diver);
  update(s, 1 / 180);
  assert.equal(diver.alive, false);
  assert.equal(s.score, 300, '150 x2');
  const t = diverFixture();
  const d = t.enemies[0];
  Object.assign(d, { mode: 'return', waypoints: [[0, 10.4]], x: 0, z: 10.4 });
  update(t, 1 / 180);
  assert.equal(t.health, 2);
  assert.match(t.lastCause.by, /DIVER contact/);
});
test('at most one diver dives at a time in world 2', () => {
  const s = fixture(['VVVVV', '.....', 'SSSSS'], { stage: 6, z: -8 });
  let maxActive = 0;
  for (let i = 0; i < 60 * 30; i++) {
    s.diveClock = Math.min(s.diveClock, 0.01);
    update(s, 1 / 60, { targetX: (i % 600) / 40 - 7 });
    const active = s.enemies.filter((e) => e.alive && e.kind === 'diver' && e.mode !== 'formation').length;
    maxActive = Math.max(maxActive, active);
  }
  assert.equal(maxActive, 1);
});

test('burster: one pop chains through adjacent pods (the 2-2 plus lattice)', () => {
  const s = fixture(['SSBSS', 'SBBBS', 'SSBSS'], { stage: 7, z: -8, spacing: 2.3 });
  const center = s.enemies.find((e) => e.row === 1 && e.col === 2);
  at(s, center);
  for (let i = 0; i < 60; i++) update(s, 1 / 60);
  const alive = living(s).map((e) => `${e.row}${e.col}`).sort();
  assert.deepEqual(alive, ['00', '04', '20', '24']);
  assert.equal(s.kills, 11);
  assert.ok(s.chain.count >= 11);
});
test('bursts never hurt the player, cancel bullets or erase membranes', () => {
  // A far spore keeps the sector open, so the clear does not wipe the bullets.
  const s = fixture(['BS'], { stage: 7, z: 7, spacing: 8 });
  s.enemies[0].baseX = 0;
  s.enemies[1].baseX = 5;
  // One burst whose radius covers the ship, a wall cell, a live bullet and a pod.
  s.membranes = [{ id: 'm', bunker: 0, x: 0.3, z: 8.8 }];
  s.enemyShots = [{ id: 77, x: 1, z: 9.5, vx: 0, vz: 0, radius: 0.19, src: 'TEST' }];
  s.ship.x = 0;
  s.ship.invulnerable = 0;
  s.bursts.push({ id: 1, x: 0, z: 9, timer: 0, radius: 2.2 });
  update(s, 1 / 180);
  update(s, 0.3);
  assert.equal(s.health, 3);
  assert.equal(s.damageTaken, 0);
  assert.equal(s.enemyShots.length, 1);
  assert.equal(s.membranes.length, 1);
  assert.equal(s.enemies[0].alive, false, 'the burst still pops the nearby burster');
});

test('capsid: closed until the fire clock picks it; warns 0.65 s, fires, then is open 1.5 s', () => {
  const s = fixture(['C'], { stage: 10, z: -6 });
  const c = s.enemies[0];
  at(s, c);
  update(s, 1 / 180);
  assert.equal(c.hp, 2, 'the closed plate blocks');
  assert.ok(s.events.some((e) => e.type === 'spark'));
  update(s, 3);
  assert.equal(c.plate.state, 'closed', 'no own cycle: it waits for the clock');
  s.enemyFireClock = 0;
  update(s, 1 / 180);
  assert.equal(c.plate.state, 'warning');
  assert.ok(c.charge > 0, 'pink warning shows before it fires');
  const shots = s.enemyShots.length;
  update(s, 0.66);
  assert.equal(c.plate.state, 'open');
  assert.equal(s.enemyShots.length, shots + 1);
  at(s, c);
  update(s, 1 / 180);
  assert.equal(c.hp, 1);
  update(s, 1.4);
  assert.equal(c.plate.state, 'open', 'still open after 1.4 s');
  update(s, 0.15);
  assert.equal(c.plate.state, 'closed');
});
test('capsids respect the world bullet budget like every other shooter', () => {
  const s = fixture(['CCCCCCC'], { stage: 10, z: -6, spacing: 2.4 });
  let most = 0;
  for (let i = 0; i < 60 * 20; i++) {
    update(s, 1 / 60, { targetX: Math.sin(i / 30) * 8 });
    most = Math.max(most, s.enemyShots.length);
  }
  assert.ok(most <= LEVELS[9].maxShots, `${most} capsid bullets alive at once`);
});
test('infector: a 1.5 s pink tether armors a spore unless the infector dies (+300 CURED)', () => {
  const s = fixture(['SI'], { stage: 8, z: -6 });
  const [spore, infector] = s.enemies;
  infector.tetherClock = 0;
  update(s, 1 / 180);
  assert.ok(s.telegraphs.some((t) => t.kind === 'tether' && t.targetId === spore.id && t.danger));
  update(s, 1.55);
  assert.equal(spore.kind, 'armored');
  assert.equal(spore.hp, 2);
  const t = fixture(['SIS'], { stage: 8, z: -6 });
  const [a, inf] = t.enemies;
  inf.tetherClock = 0;
  update(t, 0.5);
  const score = t.score;
  at(t, inf);
  update(t, 1 / 180);
  assert.equal(t.score - score, 200 + 300);
  assert.ok(t.events.some((e) => e.type === 'cured'));
  update(t, 2);
  assert.ok(t.enemies.filter((e) => e.kind === 'spore').length === 2 && a.kind === 'spore');
});

test('courier: crosses the back once at 4.5 u/s, never fires, and drops the kind showing', () => {
  const s = fixture(['S'], { stage: 2, z: -4 });
  const c = spawnCourier(s, 1);
  assert.equal(c.vx, 4.5);
  assert.ok(c.z < -10 && c.z > -11.5, 'behind the formation but in front of the back rim');
  const seen = new Set();
  for (let i = 0; i < 60 * 6 && c.alive; i++) {
    update(s, 1 / 60);
    seen.add(c.rouletteKind);
    assert.ok(!s.enemyShots.some((b) => b.src === 'COURIER'));
  }
  assert.equal(c.alive, false);
  assert.equal(c.escaped, true);
  assert.deepEqual([...seen].sort(), [...PICKUP_KINDS].sort(), 'roulette cycles every capsule kind');
  const t = fixture(['S'], { stage: 2, z: -4 });
  const k = spawnCourier(t, -1);
  update(t, 1.7);
  const showing = k.rouletteKind;
  for (let i = 0; i < 3; i++) {
    at(t, k);
    update(t, 1 / 180);
  }
  assert.equal(k.alive, false);
  const drop = t.pickups.find((p) => p.source === 'courier');
  assert.equal(drop.kind, showing === 'repair' && t.health >= 3 ? 'shield' : showing);
  assert.ok(Math.abs(t.hitstopTotal - 0.06) < 1e-6 || t.hitstop > 0, 'courier kill uses 60 ms hitstop');
});
test('the courier waits for a thinned formation, appears once, and never blocks a clear', () => {
  const s = startGame(createState({ seed: 3, stage: 2 }));
  let couriers = 0;
  for (let i = 0; i < 60 * 8; i++) {
    update(s, 1 / 60, { targetX: 9 });
    couriers += s.events.filter((e) => e.type === 'courier').length;
  }
  assert.equal(couriers, 0, 'a full formation leaves no sniping lane, so no courier yet');
  s.enemies.filter((e) => !e.courier).slice(0, 10).forEach((e) => (e.alive = false));
  for (let i = 0; i < 60 * 2; i++) {
    update(s, 1 / 60, { targetX: 9 });
    couriers += s.events.filter((e) => e.type === 'courier').length;
  }
  assert.equal(couriers, 1);
  assert.ok(s.enemies.some((e) => e.courier && e.alive));
  s.enemies.forEach((e) => !e.courier && (e.alive = false));
  s.sector.groupIndex = 99;
  update(s, 1 / 60);
  assert.equal(s.phase, 'transition', 'a living courier does not hold the sector open');
});

test('membranes: four 4x2 bunkers that stop enemy fire, let player doses through, rebuild each sector', () => {
  const s = startGame(createState({ seed: 4, stage: 1 }));
  assert.equal(s.membranes.length, 32);
  assert.deepEqual([...new Set(s.membranes.map((c) => c.bunker))], [-6, -2, 2, 6]);
  const cell = s.membranes[0];
  s.shots.push({ id: 1, x: cell.x, z: cell.z + 0.3, vx: 0, vz: -34, radius: 0.16 });
  update(s, 1 / 60);
  assert.equal(s.membranes.length, 32, 'player doses pass through their own wall');
  assert.equal(s.shots.length, 1);
  const other = s.membranes[5];
  s.enemyShots.push({ id: 2, x: other.x, z: other.z - 0.3, vx: 0, vz: 9, radius: 0.19, src: 'TEST' });
  update(s, 1 / 60);
  assert.equal(s.membranes.length, 31, 'enemy shots are absorbed and chip a cell');
  s.membranes = s.membranes.slice(9);
  s.health = 0;
  s.phase = 'lost';
  restartGame(s);
  assert.equal(s.membranes.length, 32);
  const mutation = startGame(createState({ seed: 4, stage: LEVELS.find((l) => l.code === '3-3').id }));
  assert.equal(mutation.membranes.length, 0);
});
test('CULTURE CHECK: fliers stay inside the rails, never fire, never hurt, and score a medal', () => {
  for (const f of LEVELS.find((l) => l.kind === 'bonus').flights)
    for (const [x, z] of f.path) assert.ok(Math.abs(x) <= 8.8 && z >= -12.6 && z <= 8, `path point ${x},${z}`);
  const bonus = LEVELS.find((l) => l.kind === 'bonus');
  const s = startGame(createState({ seed: 9, stage: bonus.id }));
  s.ship.invulnerable = 0;
  let paths = 0;
  for (let i = 0; i < 60 * 40 && s.phase === 'playing'; i++) {
    update(s, 1 / 60, { targetX: Math.sin(i / 40) * 8 });
    paths = Math.max(paths, s.telegraphs.filter((t) => t.kind === 'flight' && !t.danger).length);
    assert.equal(s.enemyShots.length, 0);
  }
  assert.ok(paths >= 1);
  assert.equal(s.damageTaken, 0);
  assert.equal(s.phase, 'transition');
  assert.equal(s.medals[bonus.id].bonusTotal, 40);
  assert.equal(s.medals[bonus.id].medal, 'bronze', 'no hits -> bronze, still a clear');
});
