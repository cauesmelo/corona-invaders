/** Campaign structure, determinism, checkpoints, practice, supplies, R0,
 * medals and the ordinary-input controller campaign. */
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
  startPractice,
  openMenu,
  confirmReport,
  assistAvailable,
  update,
  maybeDrop,
  collectPickup,
  medalFor,
  clearBonus,
  chainMultiplier,
} from '../model.mjs';
import { r0, r0Bonus } from '../scoring.mjs';
import { running, quiet, campaign, FRAME_BUDGET } from './helpers.mjs';
import { chooseInput } from './controller.mjs';

function clearSector(s) {
  for (const e of s.enemies) e.alive = false;
  if (s.boss) s.boss.state = 'defeated';
  s.sector.step = 1e9;
  s.sector.flights = [];
  update(s, 0.3);
}

test('the v1.0 run: 4 sectors x 3 stages (two samples, then a boss), no bonus stage', () => {
  assert.deepEqual(WORLDS.map((w) => w.name), ['AIRWAY', 'LUNGS', 'BLOODSTREAM', 'THE CELL']);
  assert.deepEqual(WORLDS.map((w) => w.twist), [null, 'breath', 'current', 'mutation']);
  assert.equal(STAGE_COUNT, 12);
  assert.deepEqual(LEVELS.map((l) => l.code), ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3']);
  assert.equal(LEVELS.filter((l) => l.kind === 'bonus').length, 0);
  assert.deepEqual(LEVELS.filter((l) => l.worldEnd).map((l) => l.code), ['1-3', '2-3', '3-3', '4-3']);
  // The first sample is the original game's 4 x 15 grid of 60 coronas.
  const first = LEVELS[0].script.find((st) => st.group).group.rows;
  assert.equal(first.length, 4);
  assert.ok(first.every((r) => r.length === 15));
});

test('every stage of a sector carries its twist: BREATH in 2-x, CURRENT in 3-x, MUTATION in 4-x', () => {
  const by = (twist) => LEVELS.filter((l) => l.twist === twist).map((l) => l.code);
  assert.deepEqual(by('breath'), ['2-1', '2-2', '2-3']);
  assert.deepEqual(by('current'), ['3-1', '3-2', '3-3']);
  assert.deepEqual(by('mutation'), ['4-1', '4-2', '4-3']);
});

test('the pressure rises by sector: choir interval, choir size and the stage bullet cap', () => {
  const samples = (w) => LEVELS.filter((l) => l.world === w && l.kind === 'sample');
  for (let w = 2; w <= 4; w++) {
    const prev = samples(w - 1).at(-1),
      cur = samples(w)[0];
    assert.ok(cur.maxBullets > prev.maxBullets, `S${w} cap`);
    assert.ok((cur.choir.interval[0] + cur.choir.interval[1]) / 2 <= 1.3 + 1e-9 || w === 2, `S${w} interval`);
    assert.ok(samples(w).at(-1).maxBullets > samples(w - 1).at(-1).maxBullets, `S${w} last cap`);
  }
});

test('seeded determinism: same seed and inputs give identical runs; another seed differs', () => {
  const play = (seed) => {
    const s = running(seed, 4);
    for (let f = 0; f < 60 * 20; f++) update(s, 1 / 60, chooseInput(s, f));
    return JSON.stringify({ score: s.score, rng: s.rngState, bullets: s.enemyShots.map((b) => [b.x.toFixed(6), b.z.toFixed(6)]), ship: [s.ship.x, s.ship.z] });
  };
  assert.equal(play(42), play(42));
  assert.notEqual(play(42), play(43));
});

test('vials: a sample clear restores none, a boss clear restores one; the boss FIELD NOTE waits for a press', () => {
  let s = running(42, 1);
  s.health = 1;
  clearSector(s);
  assert.equal(s.phase, 'transition');
  update(s, 1.5);
  update(s, 1.5);
  assert.equal(s.wave, 2);
  assert.equal(s.health, 1, 'no vial after a sample');
  assert.equal(s.checkpoint.stage, 2);
  // ALPHA and BETA & GAMMA restore none (RESEARCH_DIFFICULTY 3.6 lever 5);
  // DELTA (and every later boss) restores one.
  for (const [stage, gain] of [[3, 0], [6, 0], [9, 1]]) {
    s = running(42, stage);
    s.health = 1;
    clearSector(s);
    assert.equal(s.transitionHold, true);
    update(s, 5);
    assert.equal(s.wave, stage, 'the FIELD NOTE waits');
    update(s, 1 / 60, { confirm: true });
    update(s, 1 / 60);
    update(s, 1.5);
    update(s, 1.5);
    assert.equal(s.wave, stage + 1);
    assert.equal(s.health, 1 + gain, `${gain} vial after boss ${stage}`);
  }
  assert.equal(confirmReport(s), false);
  // Never above the difficulty's maximum.
  s = running(42, 3);
  clearSector(s);
  update(s, 1 / 60, { confirm: true });
  update(s, 1 / 60);
  update(s, 1.5);
  update(s, 1.5);
  assert.equal(s.health, 3);
});

test('the LAB REPORT after a sample is skippable after 0.5 s', () => {
  const s = running(42, 1);
  clearSector(s);
  update(s, 0.6);
  update(s, 1 / 60, { confirm: true });
  update(s, 1 / 60);
  assert.equal(s.wave, 2);
  assert.equal(s.phase, 'playing');
});

test('retry restores full vials, the entry score, power and RNG stream', () => {
  const s = running(42, 4);
  const entry = { score: s.score, rng: s.rngState, power: s.ship.power };
  for (let f = 0; f < 60 * 8; f++) update(s, 1 / 60, chooseInput(s, f));
  s.health = 1;
  s.ship.power = 1;
  restartGame(s);
  assert.equal(s.phase, 'playing');
  assert.equal(s.health, 3);
  assert.equal(s.score, entry.score);
  assert.equal(s.rngState, entry.rng);
  assert.equal(s.ship.power, entry.power);
  assert.equal(s.wave, 4);
});

test('after three failures the loss screen offers +1 VIAL (medal A) or switching to Easy', () => {
  const s = running(42, 2);
  s.failures = 2;
  assert.equal(assistAvailable(s), false);
  s.failures = 3;
  assert.equal(assistAvailable(s), true);
  restartGame(s, { assist: true });
  assert.equal(s.health, 4);
  assert.equal(s.sector.assisted, true);
  s.failures = 3;
  restartGame(s, { easy: true });
  assert.equal(s.difficulty, 'easy');
  assert.equal(s.health, 5);
});

test('practice: one vial, nothing unlocks, a MUTATION LAB card ends the run when the card ends', () => {
  let s = createState({ seed: 3 });
  s.unlockedStage = 6;
  assert.ok(startPractice(s, 2));
  assert.equal(s.health, 1);
  assert.ok(s.practice);
  clearSector(s);
  assert.equal(s.phase, 'won');
  assert.equal(s.unlockedStage, 6, 'practice never unlocks');
  assert.equal(s.practice.result.code, '1-2');
  s = createState({ seed: 3 });
  assert.ok(startPractice(s, 3, { card: 2 }));
  assert.equal(s.boss.card, 2);
  assert.equal(s.boss.hp, s.boss.cards[1].floor, 'the pool starts at that card');
  assert.equal(startPractice(s, 2, { card: 0 }), false, 'cards exist only on boss stages');
  s = createState({ seed: 3 });
  startPractice(s, 3, { card: 1 });
  s.ship.invulnerable = 1e9;
  for (let i = 0; i < 600 && s.boss.state !== 'fight'; i++) update(s, 1 / 60);
  s.boss.hp = s.boss.cards[1].floor + 1;
  update(s, 1 / 60);
  // One needle at L2 pair: stand under the swaying boss (ordinary input).
  const under = () => ({ targetX: s.enemies.find((e) => e.kind === 'boss' && e.alive)?.x ?? 0 });
  for (let i = 0; i < 600 && s.phase === 'playing'; i++) update(s, 1 / 60, under());
  assert.equal(s.phase, 'won');
  assert.equal(s.practice.result.card, 1);
  // Retry inside practice keeps the practice setup.
  restartGame(s);
  assert.ok(s.practice && s.boss.card === 1 && s.health === 1);
});

test('stage selection refuses locked or out-of-range stages; the tray freezes the run', () => {
  const s = createState({ seed: 3 });
  assert.equal(selectStage(s, 2), false);
  s.unlockedStage = 4;
  assert.equal(selectStage(s, 3), true);
  assert.ok(s.boss && s.boss.name === 'ALPHA');
  assert.equal(selectStage(s, 13), false);
  openMenu(s);
  const t = s.elapsed;
  update(s, 1);
  assert.equal(s.elapsed, t);
  newRun(s, 99);
  assert.equal(s.seed, 99);
  assert.equal(s.unlockedStage, 4, 'a new campaign keeps unlocks');
});

test('random supplies: 3% of eligible kills, then a 12 s cooldown that consumes no RNG; deterministic per seed', () => {
  const rolls = (seed) => {
    const s = quiet(1, { seed });
    let drops = 0;
    for (let i = 0; i < 4000; i++) {
      s.dropCooldown = 0;
      if (maybeDrop(s, { kind: 'wild', x: 0, z: 0 })) drops++;
    }
    return drops;
  };
  const n = rolls(5);
  assert.ok(n > 80 && n < 170, `${n} of 4000`);
  assert.equal(rolls(5), n);
  const s = quiet(1);
  s.dropCooldown = 5;
  const rng = s.rngState;
  assert.equal(maybeDrop(s, { kind: 'wild', x: 0, z: 0 }), false);
  assert.equal(s.rngState, rng);
  assert.equal(maybeDrop(s, { kind: 'boss', x: 0, z: 0 }), false);
  assert.equal(maybeDrop(s, { kind: 'virion', harmless: true, x: 0, z: 0 }), false);
});

test('supplies: BOOSTER x1.5 for 8 s, MASK 10 s, SOAP +1 (cap 5), VIAL +1; supplies must be caught', () => {
  const s = quiet(1);
  collectPickup(s, { kind: 'booster', x: 0, z: 0 });
  assert.equal(s.ship.powerups.booster, 8);
  update(s, 1 / 120);
  assert.ok(s.shots.every((n) => n.damage === 1.5));
  collectPickup(s, { kind: 'mask', x: 0, z: 0 });
  assert.equal(s.ship.powerups.mask, 10);
  s.ship.bombs = 5;
  collectPickup(s, { kind: 'soap', x: 0, z: 0 });
  assert.equal(s.ship.bombs, 5);
  collectPickup(s, { kind: 'vial', x: 0, z: 0 });
  assert.equal(s.health, 4);
  s.pickups.push({ id: 1, kind: 'booster', x: 7, z: 0, age: 0, phase: 0, radius: 0.5 });
  update(s, 0.5);
  assert.equal(s.pickups.length, 1, 'out of magnet reach: it falls, it is not collected');
});

test('R0 = 3 x escaped / spawned; the clear bonus adds (1 - min(R0, 1)) x 5000 x world', () => {
  assert.equal(r0(0, 0), 0);
  assert.equal(r0(10, 2), 0.6);
  assert.equal(r0(6, 6), 3);
  assert.equal(r0Bonus(0, 2), 10000);
  assert.equal(r0Bonus(0.6, 1), 2000);
  assert.equal(r0Bonus(2.5, 4), 0);
  const level = LEVELS.find((l) => l.code === '3-1');
  assert.equal(clearBonus(level, 0.5), 3000 + 7500);
});

test('medals: gold = no vial lost and R0 < 1, silver = at most one vial lost, bronze = a clear', () => {
  const l = LEVELS[1];
  assert.equal(medalFor(l, { vialsLost: 0, r0: 0.4 }), 'gold');
  assert.equal(medalFor(l, { vialsLost: 0, r0: 1.2 }), 'silver');
  assert.equal(medalFor(l, { vialsLost: 1, r0: 0 }), 'silver');
  assert.equal(medalFor(l, { vialsLost: 2, r0: 0 }), 'bronze');
  assert.equal(medalFor(LEVELS[4], { vialsLost: 0, bonusRatio: 0.95 }), 'gold');
});

test('Dose Chain tiers x2..x6 at 5/10/16/24/32 kills in a 2.0 s window', () => {
  assert.deepEqual([0, 5, 10, 16, 24, 32, 99].map(chainMultiplier), [1, 2, 3, 4, 5, 6, 6]);
  assert.equal(RULES.chainWindow, 2);
});

test('score extends: +1 vial at 250,000 and 750,000', () => {
  const s = quiet(1);
  s.score = 249990;
  s.ship.x = 0;
  s.enemyShots.push({ id: 1, x: 0.6, z: s.ship.z, vx: 0, vz: 0, family: 'droplet', hit: 0.16, vis: 0.26, src: 'T', age: 0 });
  update(s, 1 / 120);
  assert.equal(s.health, 4);
  assert.deepEqual(s.extendsGiven, [250000]);
});

test('only the final 4-3 clear wins the run', () => {
  const s = running(42, 11);
  clearSector(s);
  assert.equal(s.phase, 'transition');
  const f = running(42, 12);
  clearSector(f);
  assert.equal(f.phase, 'won');
});

for (const seed of [42, 1, 7])
  test(`the ordinary-input controller wins the whole campaign for seed ${seed} within ${FRAME_BUDGET} frames`, () => {
    const { s, cleared, frame, inputs } = campaign(seed);
    assert.equal(s.phase, 'won', `stopped at ${LEVELS[s.wave - 1].code}`);
    assert.equal(s.wave, 12);
    assert.equal(s.unlockedStage, 12);
    assert.equal(cleared.length, 12);
    assert.ok(frame < FRAME_BUDGET);
    assert.ok(s.kills > 300 && s.hits > s.kills, `${s.kills} kills, ${s.hits} hits`);
    for (const k of inputs) assert.ok(['axisX', 'axisZ', 'focus', 'bomb', 'confirm'].includes(k), `non-player input ${k}`);
    assert.ok(cleared.every((c) => c.medal), 'every sample awards a medal');
  });

test('chooseInput is self-contained (the root suite serializes it with toString)', () => {
  const copy = new Function(`return (${chooseInput.toString()})`)();
  const s = running(42, 1);
  assert.deepEqual(copy(s, 3), chooseInput(s, 3));
  assert.ok(!/import|require\(/.test(chooseInput.toString()));
  void startGame;
});
