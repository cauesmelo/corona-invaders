import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RULES,
  LEVELS,
  WORLDS,
  STAGE_COUNT,
  createState,
  startGame,
  newRun,
  restartGame,
  selectStage,
  openMenu,
  confirmReport,
  assistAvailable,
  shoot,
  activateShield,
  togglePause,
  update,
  maybeDrop,
  collectPickup,
  medalFor,
  chainMultiplier,
  random,
} from '../model.mjs';
import { running, fixture } from './helpers.mjs';
import { CODE_KIND } from '../levels.mjs';
import { chooseInput } from './controller.mjs';
import { controllerTimes } from './measure-par.mjs';

const enemyShot = (x, z = 10.1) => ({ id: 999, x, z, vx: 0, vz: 9, radius: 0.19, src: 'TEST' });
function clearSector(s) {
  s.enemies.forEach((e) => (e.alive = false));
  if (s.boss) s.boss.state = 'defeated';
  s.sector.groupIndex = 99;
  update(s, 0.01);
}
function playCampaign(seed, frames = 60 * 450) {
  const s = running(seed);
  const cleared = [];
  let frame = 0;
  for (; frame < frames && !['won', 'lost'].includes(s.phase); frame++) {
    update(s, 1 / 60, chooseInput(s, frame));
    for (const ev of s.events) if (ev.type === 'wave') cleared.push(ev);
  }
  return { s, cleared, frame };
}

test('campaign is 3 worlds x 4 sectors plus a CULTURE CHECK, with four bosses', () => {
  assert.equal(WORLDS.length, 3);
  assert.equal(STAGE_COUNT, 13);
  assert.equal(LEVELS.filter((l) => l.kind === 'sector').length, 8);
  assert.deepEqual(
    LEVELS.filter((l) => l.kind === 'boss').map((l) => [l.code, l.boss]),
    [
      ['1-4', 'delta'],
      ['2-4', 'mother'],
      ['3-2', 'echo'],
      ['3-4', 'omega'],
    ],
  );
  assert.equal(LEVELS.filter((l) => l.kind === 'bonus').length, 1);
  for (const w of WORLDS) assert.equal(LEVELS.filter((l) => l.world === w.id && l.kind !== 'bonus').length, 4);
  assert.deepEqual(
    LEVELS.filter((l) => l.worldEnd).map((l) => l.code),
    ['1-4', '2-4', '3-4'],
  );
});
test('each new archetype first appears alone (only with plain spores) before being combined', () => {
  const firstGroup = {};
  for (const level of LEVELS)
    for (const group of level.groups || [])
      for (const code of group.rows.join('')) {
        const kind = CODE_KIND[code];
        if (kind && !(kind in firstGroup)) firstGroup[kind] = group;
      }
  for (const kind of ['splitter', 'diver', 'burster', 'infector', 'capsid']) {
    const kinds = new Set([...firstGroup[kind].rows.join('')].map((c) => CODE_KIND[c]).filter(Boolean));
    kinds.delete('spore');
    assert.deepEqual([...kinds], [kind], `${kind} debuts with ${[...kinds]}`);
  }
  // Membranes exist in worlds 1-2 and are removed as the twist in 3-3.
  for (const l of LEVELS.filter((l) => l.world < 3 && l.kind !== 'bonus')) assert.equal(l.membranes, true, l.code);
  assert.equal(LEVELS.find((l) => l.code === '3-3').membranes, false);
});
test('difficulty rises by world: fire interval, shot speed and bullet budget', () => {
  const byWorld = (w) => LEVELS.filter((l) => l.world === w && l.kind === 'sector');
  for (const [w, [lo, hi], cap] of [
    [1, [1.45, 1.85], 6],
    [2, [1.15, 1.4], 9],
    [3, [1.0, 1.15], 12],
  ])
    for (const l of byWorld(w)) {
      assert.ok(l.fireInterval >= lo && l.fireInterval <= hi, `${l.code} fire ${l.fireInterval}`);
      assert.equal(l.maxShots, cap);
    }
  assert.ok(byWorld(1).every((l) => l.shotSpeed <= 9.5) && byWorld(3).every((l) => l.shotSpeed >= 10));
  // Bullet speed never drops from one stage to the next (bonus excluded).
  const speeds = LEVELS.filter((l) => l.kind !== 'bonus').map((l) => l.shotSpeed);
  speeds.slice(1).forEach((v, i) => assert.ok(v >= speeds[i], `speed ${speeds[i]} -> ${v}`));
});
test('combat and shots require an explicit start', () => {
  const s = createState();
  assert.equal(shoot(s), false);
  update(s, 1, { shoot: true });
  assert.equal(s.shots.length, 0);
  startGame(s);
  assert.equal(shoot(s), true);
  assert.ok(s.shots[0].vz < 0);
});
test('base fire is deliberately slow: about four triggers per second', () => {
  const s = running();
  update(s, 1, { shoot: true });
  assert.equal(RULES.shotCooldown, 0.26);
  assert.ok(s.shotsFired >= 3 && s.shotsFired <= 4, String(s.shotsFired));
});
test('ship clamps to the playfield and pointer steering is speed limited', () => {
  const s = running();
  update(s, 2, { axis: 1 });
  assert.equal(s.ship.x, RULES.halfWidth - 0.75);
  update(s, 0.01, { targetX: -8 });
  assert.ok(s.ship.x > 8.4);
});
test('a shot destroys a spore and scores through the chain multiplier', () => {
  // Two spores, so the kill does not also clear the sector (and add its bonus).
  const s = fixture(['SS'], { z: 4, spacing: 8 });
  s.enemies[0].x = s.enemies[0].baseX = 0;
  update(s, 0.15, { shoot: true });
  assert.equal(s.kills, 1);
  assert.equal(s.score, 100);
  assert.equal(s.chain.count, 1);
});
test('formation fire warns 0.65 s before firing and keeps the warned aim', () => {
  const s = running(42);
  s.membranes = [];
  update(s, 1.55);
  const e = s.enemies.find((e) => e.charge > 0);
  assert.ok(e, 'a warning starts once the fire clock expires');
  assert.equal(e.aimX, 0);
  const shots = s.enemyShots.length;
  update(s, 0.4, { axis: 1 });
  assert.equal(e.aimX, 0);
  assert.equal(s.enemyShots.length, shots);
  update(s, 0.3);
  assert.ok(s.enemyShots.length > shots);
});
test('only front-row enemies are chosen to fire', () => {
  const s = fixture(['SSS', 'SSS'], { z: -6 });
  s.enemyFireClock = 0;
  for (let i = 0; i < 40; i++) {
    s.enemies.forEach((e) => (e.charge = 0));
    s.enemyShots = [];
    s.enemyFireClock = 0;
    update(s, 1 / 180);
    const shooter = s.enemies.find((e) => e.charge > 0);
    assert.equal(shooter.row, 1);
  }
});
test('hit invulnerability prevents immediate chained heart losses', () => {
  const s = running();
  s.enemyShots = [enemyShot(0)];
  update(s, 0.04);
  assert.equal(s.health, 2);
  s.enemyShots = [enemyShot(0)];
  update(s, 0.04);
  assert.equal(s.health, 2);
  assert.equal(s.damageTaken, 1);
});
test('emergency shield blocks fire and respects its cooldown', () => {
  const s = running();
  assert.equal(activateShield(s), true);
  assert.equal(activateShield(s), false);
  s.enemyShots = [enemyShot(0, 9)];
  update(s, 0.04);
  assert.equal(s.health, 3);
  assert.equal(s.enemyShots.length, 0);
});
test('pause freezes combat, pickups and effect timers', () => {
  const s = running();
  shoot(s);
  s.pickups = [{ id: 99, kind: 'rapid', x: 0, z: 0, age: 0, phase: 0, radius: 0.48 }];
  s.ship.powerups.rapid = 4;
  togglePause(s);
  const before = structuredClone(s);
  update(s, 1, { axis: 1, shoot: true });
  assert.deepEqual(s.shots, before.shots);
  assert.deepEqual(s.enemies, before.enemies);
  assert.deepEqual(s.pickups, before.pickups);
  assert.deepEqual(s.ship, before.ship);
  assert.equal(s.elapsed, before.elapsed);
});

// ---- Dose Chain -------------------------------------------------------------
test('Dose Chain tiers are x2/x3/x4/x5/x6 at 5/10/16/24/32 kills and cap at x6', () => {
  assert.deepEqual(
    [0, 4, 5, 9, 10, 15, 16, 23, 24, 31, 32, 99].map(chainMultiplier),
    [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6],
  );
});
test('the chain window is 1.6 s, damage breaks it and the shield does not', () => {
  const s = fixture(['SSSSSS'], { z: -4 });
  for (const e of s.enemies.slice(0, 5)) {
    e.hp = 1;
    s.shots.push({ id: 900 + e.col, x: e.x, z: e.z, vx: 0, vz: 0, radius: 0.16 });
  }
  update(s, 1 / 180);
  assert.equal(s.chain.count, 5);
  assert.equal(chainMultiplier(s.chain.count), 2);
  activateShield(s);
  update(s, 0.5);
  assert.equal(s.chain.count, 5, 'shield keeps the chain');
  update(s, 1.2);
  assert.equal(s.chain.count, 0, 'window expires after 1.6 s without a kill');
  s.chain = { count: 7, timer: 1.6, best: 7 };
  s.ship.shield = 0;
  s.ship.invulnerable = 0;
  s.enemyShots = [enemyShot(s.ship.x)];
  update(s, 0.04);
  assert.equal(s.chain.count, 0, 'damage breaks the chain');
});
test('retry resets the chain and the membranes to their sector-entry values', () => {
  const s = running(42, 1);
  const entryMembranes = s.membranes.length;
  s.chain = { count: 20, timer: 1.6, best: 20 };
  s.membranes = s.membranes.slice(10);
  s.score += 5000;
  s.health = 0;
  s.phase = 'lost';
  restartGame(s);
  assert.equal(entryMembranes, 32);
  assert.equal(s.membranes.length, 32);
  assert.equal(s.chain.count, 0);
  assert.equal(s.score, s.checkpoint.score);
  assert.equal(s.health, 3);
});

// ---- Hitstop -----------------------------------------------------------------
test('hitstop pauses the whole model step, not just rendering', () => {
  const s = fixture(['A', 'S'], { z: -2 });
  const armored = s.enemies.find((e) => e.kind === 'armored');
  armored.hp = 1;
  s.shots.push({ id: 901, x: armored.x, z: armored.z, vx: 0, vz: -34, radius: 0.16 });
  s.shots.push({ id: 902, x: 4, z: 5, vx: 0, vz: -34, radius: 0.16 });
  update(s, 1 / 180);
  assert.equal(armored.alive, false);
  assert.ok(Math.abs(s.hitstop - 0.03) < 1e-9, 'armored kill requests 30 ms');
  const frozen = structuredClone({ shots: s.shots, enemies: s.enemies, ship: s.ship, elapsed: s.elapsed });
  update(s, 0.02, { axis: 1, shoot: true });
  assert.deepEqual({ shots: s.shots, enemies: s.enemies, ship: s.ship, elapsed: s.elapsed }, frozen);
  update(s, 0.05, { axis: 1 });
  assert.ok(s.ship.x > 0, 'simulation resumes after the freeze');
});
test('hitstop is capped at 120 ms per rolling second and popcorn kills never freeze', () => {
  const s = fixture(['AAAAAAAAAA', 'SSSSSSSSSS'], { z: -2, spacing: 1.7 });
  let frozen = 0;
  for (const e of s.enemies.filter((e) => e.kind === 'armored')) {
    e.hp = 1;
    s.shots.push({ id: 950 + e.col, x: e.x, z: e.z, vx: 0, vz: 0, radius: 0.16 });
    const before = s.hitstopTotal;
    update(s, 1 / 30);
    frozen += s.hitstopTotal - before;
  }
  assert.ok(frozen <= 0.12 + 1e-9, `froze ${frozen}`);
  const t = s.hitstopTotal;
  const spore = s.enemies.find((e) => e.kind === 'spore' && e.alive);
  s.shots.push({ id: 990, x: spore.x, z: spore.z, vx: 0, vz: 0, radius: 0.16 });
  update(s, 2);
  assert.equal(spore.alive, false);
  assert.ok(s.hitstopTotal - t < 1e-9, 'spore kill adds no hitstop');
});
test('a tap during hitstop is buffered and fires when the freeze ends', () => {
  const s = running();
  s.hitstop = 0.05;
  assert.equal(shoot(s), false);
  assert.equal(s.shotsFired, 0);
  update(s, 0.08);
  assert.equal(s.shotsFired, 1);
});

// ---- Drops and pickups ---------------------------------------------------------
test('random drops are rare (about 4% of eligible kills) and deterministic per seed', () => {
  const s = running(987654321);
  let drops = 0;
  for (let i = 0; i < 40000; i++) {
    s.dropCooldown = 0;
    if (maybeDrop(s, s.enemies[0])) drops++;
  }
  const rate = drops / 40000;
  assert.ok(rate > 0.033 && rate < 0.047, `rate ${rate}`);
  const a = running(42),
    b = running(42);
  for (let i = 0; i < 300; i++) {
    a.dropCooldown = b.dropCooldown = 0;
    maybeDrop(a, a.enemies[0]);
    maybeDrop(b, b.enemies[0]);
  }
  assert.deepEqual(a.pickups, b.pickups);
  assert.equal(random(a), random(b));
});
test('drop cooldown stops frequent drops and consumes no RNG', () => {
  let s;
  for (let seed = 1; ; seed++) {
    s = running(seed);
    if (maybeDrop(s, s.enemies[0])) break;
  }
  const rng = s.rngState;
  for (let i = 0; i < 50; i++) assert.equal(maybeDrop(s, s.enemies[0]), false);
  assert.equal(s.rngState, rng);
  assert.equal(s.dropCooldown, 10);
});
test('bosses, daughters and flagged minions never roll random drops', () => {
  const s = running(5);
  for (let i = 0; i < 2000; i++) {
    s.dropCooldown = 0;
    assert.equal(maybeDrop(s, { kind: 'boss', x: 0, z: 0 }), false);
    assert.equal(maybeDrop(s, { kind: 'daughter', noDrop: true, x: 0, z: 0 }), false);
  }
  assert.equal(s.pickups.length, 0);
});
test('reaching x4 chain guarantees exactly one capsule per sector', () => {
  const s = fixture(['SSSSSSSSSS', 'SSSSSSSSSS'], { z: -4, spacing: 1.6 });
  s.dropCooldown = 1e9; // isolate the guarantee from random drops
  for (const e of s.enemies) s.shots.push({ id: 700 + s.shots.length, x: e.x, z: e.z, vx: 0, vz: 0, radius: 0.16 });
  update(s, 1 / 180);
  assert.equal(s.chain.count, 20);
  const chainDrops = s.pickups.filter((p) => p.source === 'chain');
  assert.equal(chainDrops.length, 1);
});
test('capsules fall and must physically reach the ship', () => {
  const s = running();
  s.pickups = [{ id: 99, kind: 'rapid', x: 0, z: 0, age: 0, phase: 0, radius: 0.48 }];
  update(s, 1);
  assert.equal(s.pickupsCaught, 0);
  s.pickups[0].x = 0;
  s.pickups[0].z = 9.5;
  update(s, 0.3);
  assert.equal(s.pickupsCaught, 1);
  assert.ok(s.ship.powerups.rapid > 7);
});
test('rapid doubles trigger rate; spread fires three; repair heals or shields at full', () => {
  const base = running(),
    boost = running();
  collectPickup(boost, { kind: 'rapid', x: 0, z: 0 });
  update(base, 1, { shoot: true });
  update(boost, 1, { shoot: true });
  assert.ok(boost.shotsFired >= base.shotsFired * 1.8);
  const s = running();
  collectPickup(s, { kind: 'spread', x: 0, z: 0 });
  shoot(s);
  assert.equal(s.shots.length, 3);
  s.health = 1;
  collectPickup(s, { kind: 'repair', x: 0, z: 0 });
  assert.equal(s.health, 2);
  s.health = 3;
  collectPickup(s, { kind: 'repair', x: 0, z: 0 });
  assert.equal(s.ship.powerups.shield, 6);
});
test('capsule supply over full campaigns stays bounded: about 1-2 per sector, half earned', () => {
  for (const seed of [42, 1]) {
    const s = running(seed);
    const sources = { random: 0, courier: 0, chain: 0 };
    for (let f = 0; f < 60 * 480 && s.phase !== 'won' && s.phase !== 'lost'; f++) {
      update(s, 1 / 60, chooseInput(s, f));
      for (const ev of s.events) if (ev.type === 'drop') sources[ev.source]++;
    }
    assert.equal(s.phase, 'won');
    const total = sources.random + sources.courier + sources.chain;
    assert.equal(total, s.dropsSpawned);
    assert.ok(sources.random <= Math.ceil(s.elapsed / RULES.dropCooldown), JSON.stringify(sources));
    assert.ok(sources.chain <= STAGE_COUNT);
    assert.ok(total >= 6 && total <= STAGE_COUNT * 3, JSON.stringify(sources));
  }
});

// ---- Checkpoints, healing, medals --------------------------------------------
test('a sector clear restores one vial and creates a checkpoint', () => {
  const s = running();
  s.health = s.lives = 1;
  clearSector(s);
  assert.equal(s.phase, 'transition');
  update(s, 1.9);
  assert.equal(s.wave, 2);
  assert.equal(s.health, 2);
  assert.equal(s.checkpoint.stage, 2);
  assert.equal(s.unlockedStage, 2);
});
test('a world clear fully heals and the LAB REPORT waits for a fresh FIRE press', () => {
  const s = running(42, 4);
  s.health = s.lives = 1;
  clearSector(s);
  assert.equal(s.phase, 'transition');
  assert.equal(s.transitionHold, true);
  update(s, 5, { shoot: true });
  assert.equal(s.phase, 'transition', 'a held trigger does not skip the report');
  update(s, 0.1, { shoot: false });
  update(s, 0.1, { shoot: true });
  assert.equal(s.transitionHold, false);
  update(s, 1.9);
  assert.equal(getCode(s), 'B1');
  assert.equal(s.health, 3);
  const t = running(42, 4);
  clearSector(t);
  update(t, 1);
  assert.equal(confirmReport(t), true);
});
const getCode = (s) => LEVELS[s.wave - 1].code;
test('retry restores three vials, the entry score and the entry RNG stream', () => {
  const s = running(42);
  clearSector(s);
  update(s, 1.9);
  const score = s.score,
    rng = s.checkpoint.rngState;
  s.score += 999;
  s.health = s.lives = 0;
  s.phase = 'lost';
  restartGame(s);
  assert.equal(s.phase, 'playing');
  assert.equal(s.wave, 2);
  assert.equal(s.score, score);
  assert.equal(s.health, 3);
  assert.equal(s.rngState, rng);
});
test('after three failures an opt-in +1 vial assist is offered and marks the medal A', () => {
  const s = running(42);
  for (let i = 0; i < 3; i++) {
    assert.equal(assistAvailable(s), false);
    s.ship.invulnerable = 0;
    s.health = 1;
    s.enemyShots = [enemyShot(s.ship.x)];
    update(s, 0.05);
    assert.equal(s.phase, 'lost');
    if (i < 2) restartGame(s, { assist: true });
  }
  assert.equal(assistAvailable(s), true);
  restartGame(s, { assist: true });
  assert.equal(s.health, 4);
  assert.equal(s.sector.assisted, true);
  clearSector(s);
  assert.equal(s.medals[1].assisted, true);
  assert.equal(s.failures, 0, 'a clear resets the failure count; nothing is locked');
});
test('medals: bronze clear, silver at most one vial lost, gold no hit at or under par', () => {
  const l = LEVELS[0];
  assert.equal(medalFor(l, { time: l.par, heartsLost: 0 }), 'gold');
  assert.equal(medalFor(l, { time: l.par + 1, heartsLost: 0 }), 'silver');
  assert.equal(medalFor(l, { time: 1, heartsLost: 1 }), 'silver');
  assert.equal(medalFor(l, { time: 1, heartsLost: 2 }), 'bronze');
  const bonus = LEVELS.find((l) => l.kind === 'bonus');
  assert.equal(medalFor(bonus, { bonusRatio: 0.95 }), 'gold');
  assert.equal(medalFor(bonus, { bonusRatio: 0.75 }), 'silver');
  assert.equal(medalFor(bonus, { bonusRatio: 0.2 }), 'bronze');
});
test('par is 1.3 x the QA controller clear time (seed 42), so gold is reachable', () => {
  const { phase, times } = controllerTimes(42);
  assert.equal(phase, 'won');
  for (const level of LEVELS) {
    const expected = Math.ceil(1.3 * times[level.id]);
    assert.ok(Math.abs(level.par - expected) <= 1, `${level.code}: par ${level.par}, expected ${expected}`);
  }
});
test('new campaign uses the supplied seed and resets progress but keeps unlocks', () => {
  const s = running(1);
  clearSector(s);
  update(s, 1.9);
  newRun(s, 42);
  assert.equal(s.wave, 1);
  assert.equal(s.seed, 42);
  assert.equal(s.score, 0);
  assert.equal(s.unlockedStage, 2);
});
test('stage selection refuses locked or out-of-range stages', () => {
  const s = running();
  assert.equal(selectStage(s, 2), false);
  clearSector(s);
  assert.equal(selectStage(s, 2), true);
  assert.equal(selectStage(s, 1), true);
  assert.equal(selectStage(s, 14), false);
  assert.equal(selectStage(s, 0), false);
});
test('sector map preserves unlocks and the checkpoint and freezes combat', () => {
  const s = running(42);
  clearSector(s);
  update(s, 1.9);
  const checkpoint = structuredClone(s.checkpoint),
    enemies = structuredClone(s.enemies);
  openMenu(s);
  assert.equal(s.phase, 'title');
  assert.deepEqual(s.checkpoint, checkpoint);
  update(s, 1, { shoot: true, axis: 1 });
  assert.deepEqual(s.enemies, enemies);
  assert.equal(selectStage(s, 1), true);
  assert.equal(s.unlockedStage, 2);
});
test('breach line warns 3 u before the formation reaches the ship row; reaching it loses', () => {
  const s = fixture(['S'], { z: 5 });
  update(s, 1 / 180);
  assert.equal(s.breach, false);
  s.enemies[0].baseZ = 7;
  update(s, 1 / 180);
  assert.equal(s.breach, true);
  s.enemies[0].baseZ = 9.2;
  update(s, 1 / 180);
  assert.equal(s.phase, 'lost');
  assert.equal(s.lastCause.by, 'BREACH');
});
test('only the final 3-4 clear wins the campaign', () => {
  const s = running(42, 4);
  clearSector(s);
  assert.equal(s.phase, 'transition');
  const f = running(42, 13);
  clearSector(f);
  assert.equal(f.phase, 'won');
});

// ---- Full campaigns with ordinary inputs ------------------------------------
for (const seed of [42, 1, 7])
  test(`ordinary-input controller wins all 13 stages and four bosses, seed ${seed}`, () => {
    const { s, cleared, frame } = playCampaign(seed);
    assert.equal(s.phase, 'won', JSON.stringify(s.lastCause));
    assert.equal(s.wave, STAGE_COUNT);
    assert.deepEqual(
      cleared.map((c) => c.code),
      LEVELS.map((l) => l.code),
    );
    assert.ok(s.health > 0);
    assert.ok(frame < 60 * 450, `needed ${frame} frames`);
    assert.ok(s.elapsed < 450);
  });
