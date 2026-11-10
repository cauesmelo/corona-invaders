/** HARD (core.mjs DIFFICULTY.hard): a real step up from Normal on the same
 * patterns and the same fairness floor. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, DIFFICULTY, LIMITS, update, selectStage } from '../model.mjs';
import { startPattern } from '../patterns.mjs';
import { makeEnemy } from '../enemies.mjs';
import { kitOf } from '../cards.mjs';

test('Hard is a table of pressure and a thinner safety net, never a lower fairness floor', () => {
  const n = DIFFICULTY.normal,
    h = DIFFICULTY.hard;
  assert.ok(h.count > n.count && h.speed > n.speed && h.hp > n.hp && h.pace < n.pace, 'more, faster, tougher, more often');
  assert.ok(h.bombs < n.bombs && h.refill < n.refill && h.deathbomb < n.deathbomb && h.credits < n.credits, 'less safety net');
  assert.ok(!h.autoBomb && h.tele >= 0 && h.wallGap >= 2 && h.overlap === n.overlap, 'no auto-SOAP, telegraphs and wall gaps never shrink');
  const s = createState({ seed: 5, difficulty: 'hard', drafts: true });
  assert.equal(s.health, 3);
  assert.equal(s.ship.bombs, 1);
  assert.equal(s.kit.deathbomb, 0.12);
  assert.equal(s.kit.bombsPerVial, 0, 'a lost vial refills no SOAP');
  assert.equal(kitOf([], { difficulty: 'hard' }).bombsPerVial, 0);
  assert.equal(kitOf([], { difficulty: 'normal' }).bombsPerVial, 1);
});

test('Hard attacks carry 20% more bullets, 6% faster, and keep their telegraph minimum', () => {
  const make = (difficulty) => {
    const s = createState({ seed: 9, difficulty });
    const e = makeEnemy(s, 'wild', 0, -8);
    s.enemies.push(e);
    return { s, em: startPattern(s, 'sneeze', { ownerId: e.id, params: { n: 9, spread: 56, speeds: [4, 4.6] }, x: 0, z: -8 }) };
  };
  const n = make('normal'),
    h = make('hard');
  assert.ok(h.em.n >= n.em.n && h.em.n % 2 === 1, 'a fan stays odd');
  assert.ok(Math.abs(h.em.speedScale / n.em.speedScale - 1.06) < 1e-9);
  assert.ok(h.em.tele >= LIMITS.sneeze.tele && h.em.tele === n.em.tele);
});

test('Hard enemies are 15% tougher and the choir sings 15% sooner', () => {
  const sN = createState({ seed: 3, difficulty: 'normal' }),
    sH = createState({ seed: 3, difficulty: 'hard' });
  const eN = makeEnemy(sN, 'sneezer', 0, -8),
    eH = makeEnemy(sH, 'sneezer', 0, -8);
  assert.equal(eH.hp, Math.round(eN.hp * 1.15));
  const clocks = [sN, sH].map((s) => {
    s.unlockedStage = 12;
    selectStage(s, 4);
    s.choirClock = 0;
    s.groups = [];
    s.enemies = [];
    update(s, 1 / 60);
    return s.choirClock;
  });
  // No formation is up yet, so the clock is the bare interval at its fast end.
  assert.ok(Math.abs(clocks[1] / clocks[0] - 0.85) < 0.02, `choir clock ${clocks.join(' vs ')}`);
});
