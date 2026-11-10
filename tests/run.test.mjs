/** The run rule (RESEARCH_V1.md 2.1, test T12): 3 credits on Normal and
 * unlimited on Easy; a lost run spends one and continues from the stage's
 * entry snapshot; with none left the run ends at the FINAL REPORT; the 1CC
 * stamp needs a whole run on one credit; vials +1 after a boss only;
 * practice uses the reference syringe. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, update, restartGame, startPractice, selectStage, entryPower, creditsLeft, oneCredit, finalReport, setGameSpeed, LEVELS } from '../model.mjs';
import { running } from './helpers.mjs';
import { chooseInput } from './controller.mjs';

/** Lose every vial on the spot: a bullet on the core, past the deathbomb. */
function loseRun(s) {
  for (let i = 0; i < 20 && s.phase === 'playing'; i++) {
    s.ship.invulnerable = 0;
    s.ship.respawn = 0;
    s.enemyShots.push({ id: 9e6 + i, x: s.ship.x, z: s.ship.z, vx: 0, vz: 0, family: 'droplet', hit: 0.15, half: 0.12, src: 'T', age: 0 });
    update(s, 1 / 60);
    update(s, 0.3);
  }
}

test('T12: 3 credits on Normal; each lost run spends one and continues from the stage entry', () => {
  const s = running(42, 4);
  for (let f = 0; f < 60 * 10; f++) update(s, 1 / 60, chooseInput(s, f));
  const entry = { ...s.checkpoint };
  assert.equal(creditsLeft(s), 3);
  loseRun(s);
  assert.equal(s.phase, 'lost');
  assert.equal(s.creditsUsed, 1);
  assert.equal(s.events.find((e) => e.type === 'lost')?.credit ?? true, true);
  assert.ok(restartGame(s), 'CONTINUE');
  assert.equal(s.phase, 'playing');
  assert.equal(s.wave, 4);
  assert.equal(s.score, entry.score, 'the entry score');
  assert.equal(s.rngState, entry.rngState, 'the entry RNG');
  assert.equal(s.ship.power, entry.power, 'the entry build');
  assert.equal(s.health, 3);
  assert.equal(s.creditsUsed, 1, 'the continue itself is free: the loss paid');
  loseRun(s);
  restartGame(s);
  loseRun(s);
  restartGame(s);
  assert.equal(creditsLeft(s), 0);
  loseRun(s);
  assert.equal(s.runOver, true, 'no credit left: the run is over');
  assert.equal(restartGame(s), false);
  assert.equal(s.finalReport.contained, false);
  assert.equal(s.finalReport.creditsUsed, 3);
});

test('T12: a manual retry mid-stage spends a credit (never a free refill)', () => {
  const s = running(42, 2);
  s.health = 1;
  assert.ok(restartGame(s));
  assert.equal(s.health, 3);
  assert.equal(s.creditsUsed, 1);
});

test('T12: Easy has unlimited credits', () => {
  const s = running(42, 2, 'easy');
  for (let i = 0; i < 6; i++) {
    loseRun(s);
    assert.equal(s.runOver, false);
    assert.ok(restartGame(s));
  }
  assert.equal(creditsLeft(s), Infinity);
});

test('T12: the 1CC stamp needs the whole run from 1-1 on zero credits spent', () => {
  const s = createState({ seed: 3 });
  s.phase = 'playing';
  assert.equal(oneCredit(s), true);
  s.creditsUsed = 1;
  assert.equal(oneCredit(s), false);
  const t = createState({ seed: 3 });
  t.unlockedStage = 12;
  selectStage(t, 7);
  assert.equal(oneCredit(t), false, 'a run from the tray at 3-1 is not a 1CC');
  assert.equal(finalReport(createState({ seed: 3 }), true).oneCredit, true);
  // 20: OMICRON's 12 s R0 < 1 survival exam joined the 19 (revision six).
  assert.equal(finalReport(createState({ seed: 3 }), true).variantCards, 20);
});

test('T12: +1 vial after a boss and none after a sample (the boss FIELD NOTE waits for a press)', () => {
  const clear = (s) => {
    for (const e of s.enemies) e.alive = false;
    if (s.boss) s.boss.state = 'defeated';
    s.sector.step = 1e9;
    update(s, 0.3);
  };
  const sample = running(42, 7);
  sample.health = 1;
  clear(sample);
  update(sample, 1.5);
  update(sample, 1.5);
  assert.equal(sample.wave, 8);
  assert.equal(sample.health, 1);
  const boss = running(42, 9);
  boss.health = 1;
  clear(boss);
  update(boss, 1);
  assert.equal(boss.wave, 9, 'the FIELD NOTE waits');
  update(boss, 1 / 60, { confirm: true });
  update(boss, 1 / 60);
  update(boss, 1.5);
  update(boss, 1.5);
  assert.equal(boss.wave, 10);
  assert.equal(boss.health, 2);
});

test('T12: practice uses the reference syringe (the guaranteed power on arrival) and spends no credit', () => {
  for (const level of LEVELS) {
    const s = createState({ seed: 3 });
    assert.ok(startPractice(s, level.id));
    assert.equal(s.ship.power, entryPower(level.id));
    loseRun(s);
    assert.equal(s.creditsUsed, 0);
    assert.ok(restartGame(s));
  }
});

test('ASSIST game speed 70/80/90%: offered any time, recorded on the LAB REPORT as ASSISTED', () => {
  const s = running(42, 1);
  assert.equal(setGameSpeed(s, 0.5), false);
  assert.ok(setGameSpeed(s, 0.8));
  for (const e of s.enemies) e.alive = false;
  s.sector.step = 1e9;
  update(s, 0.3);
  const ev = s.medals[1];
  assert.equal(ev.assisted, true);
  assert.ok(ev.injections !== undefined && ev.exposure !== undefined && ev.verdict && ev.assessment);
  restartGame(s);
  assert.equal(s.gameSpeed, 0.8, 'the setting survives a continue');
});
