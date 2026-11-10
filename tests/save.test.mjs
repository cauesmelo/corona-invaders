/** Guarded, versioned saves (V1_RELEASE_PLAN.md S4): blocked or corrupt
 * storage never stops play, values are sanitised, and the owner's older
 * saves migrate once (fixtures for v5 and v4). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, loadStore, migrateV5, V5_TO_V6, write } from '../save.mjs';
import { LEVELS } from '../levels.mjs';

const memory = (init = {}) => {
  // Values are stored as the game writes them (JSON); { raw } plants a corrupt string.
  const m = new Map(Object.entries(init).map(([k, v]) => [k, v && v.raw !== undefined ? v.raw : JSON.stringify(v)]));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
};
const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };

test('keys are game-prefixed and versioned (-v6-)', () => {
  for (const k of Object.values(KEYS)) assert.ok(k.startsWith('corona-invaders-v6-'), k);
});

test('blocked storage: defaults, no throw; writes report failure', () => {
  const s = loadStore(throwing);
  assert.equal(s.unlocked, 1);
  assert.deepEqual(s.medals, {});
  assert.equal(s.sound, true, 'sound on by default');
  assert.equal(write(throwing, KEYS.unlocked, 3), false);
  assert.equal(loadStore(null).difficulty, 'normal');
});

test('corrupt and out-of-range values are sanitised', () => {
  const st = memory({ [KEYS.unlocked]: 99, [KEYS.medals]: { 3: { medal: 'gold', r0: 0.2 }, 40: { medal: 'gold' }, 2: { medal: 'platinum' } }, [KEYS.scores]: { raw: 'not json{' }, [KEYS.difficulty]: 'nightmare', [KEYS.speed]: 0.5 });
  const s = loadStore(st);
  assert.equal(s.unlocked, 12);
  assert.deepEqual(Object.keys(s.medals), ['3']);
  assert.deepEqual(s.scores, []);
  assert.equal(s.difficulty, 'normal');
  assert.equal(s.speed, 1);
});

test('v5 (18-stage campaign) migrates once onto the 12-stage ids', () => {
  const st = memory({
    'corona-invaders-v5-unlocked': 13,
    'corona-invaders-v5-medals': { 4: { medal: 'gold', r0: 0.3, best: 9000 }, 7: { medal: 'bronze' }, 8: { medal: 'silver' }, 3: { medal: 'gold' } },
    'corona-invaders-v5-cards': { 'alpha:1': { seen: true, best: 20000 }, 'alpha:9': { seen: true } },
    'corona-invaders-v5-sound': false,
    'corona-invaders-v5-difficulty': 'easy',
    'corona-invaders-v5-scores': [{ score: 120000, code: '3-4' }],
  });
  const s = loadStore(st);
  // Old 13 (DELTA) maps to 3-3.
  assert.equal(s.unlocked, 9);
  assert.equal(LEVELS[s.unlocked - 1].code, '3-3');
  assert.equal(s.medals[3].medal, 'gold', 'ALPHA 1-4 -> 1-3');
  assert.equal(s.medals[4].medal, 'silver', '2-2 AEROSOL (bronze) and 2-3 DEEP BREATH (silver) both -> 2-1: best kept');
  assert.equal(Object.keys(s.medals).length, 2, 'the cut 1-3 BUDDING maps to nothing');
  assert.deepEqual(Object.keys(s.cards), ['alpha:1'], 'only cards that still exist');
  assert.equal(s.sound, false);
  assert.equal(s.difficulty, 'easy');
  assert.equal(s.scores[0].score, 120000);
  assert.deepEqual(s.migratedFrom, ['v5']);
  assert.ok(st.map.has(KEYS.migrated));
  // Once: a later v5 write is not re-imported.
  st.setItem('corona-invaders-v5-unlocked', '18');
  st.map.delete(KEYS.unlocked);
  assert.equal(loadStore(st).unlocked, 1, 'the migration marker blocks a second import');
});

test('v4 (revision four, another level set) carries only sound, difficulty, effects and scores', () => {
  const st = memory({ 'corona-invaders-v4-unlocked': 13, 'corona-invaders-v4-medals': { 1: { medal: 'gold' } }, 'corona-invaders-v4-sound': false, 'corona-invaders-v4-scores': [{ score: 5000, code: '2-1' }] });
  const s = loadStore(st);
  assert.equal(s.unlocked, 1);
  assert.deepEqual(s.medals, {});
  assert.equal(s.sound, false);
  assert.equal(s.scores.length, 1);
  assert.deepEqual(s.migratedFrom, ['v4']);
});

test('the v5 map covers every old stage and lands inside the run', () => {
  assert.equal(Object.keys(V5_TO_V6).length, 18);
  for (const v of Object.values(V5_TO_V6)) assert.ok(v === null || (v >= 1 && v <= 12));
  assert.deepEqual(migrateV5({ unlocked: 1 }).unlocked, 1);
});
