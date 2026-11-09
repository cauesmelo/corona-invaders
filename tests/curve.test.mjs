/** Difficulty curve measured with a deliberately imperfect "reactive human"
 * (tests/reactive.mjs: 150 ms perception lag, 150 ms sampling, keyboard speed,
 * no target lead), not the perfect autopilot. Playtest feedback was an inverted
 * curve: W1/W2 easy, a wall at DELTA and in world 3. These bounds keep it fixed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, createState, startGame, restartGame, update } from '../model.mjs';
import { createReactive } from './reactive.mjs';

const SEEDS = [42, 1, 7, 3, 5];
const ATTEMPTS = 3;
function playSector(stage, seed) {
  const s = startGame(createState({ seed, stage }));
  let losses = 0,
    hits = 0;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt) restartGame(s);
    const player = createReactive({ phase: attempt * 4 });
    for (let f = 0; f < 60 * 150; f++) {
      const before = s.damageTaken;
      update(s, 1 / 60, player(s, f));
      hits += s.damageTaken - before;
      if (s.phase === 'transition' || s.phase === 'won') return { cleared: true, losses, hits };
      if (s.phase === 'lost') break;
    }
    losses++;
  }
  return { cleared: false, losses, hits };
}

const results = LEVELS.map((level) => {
  const runs = SEEDS.map((seed) => playSector(level.id, seed));
  return {
    level,
    runs,
    hits: runs.reduce((n, r) => n + r.hits, 0) / SEEDS.length,
    losses: runs.reduce((n, r) => n + r.losses, 0),
  };
});
const byCode = Object.fromEntries(results.map((r) => [r.level.code, r]));
const worldMean = (w) => {
  const rows = results.filter((r) => r.level.world === w && r.level.kind !== 'bonus');
  return rows.reduce((n, r) => n + r.hits, 0) / rows.length;
};

test('reactive-player curve table (diagnostic)', (t) => {
  for (const r of results)
    t.diagnostic(
      `${r.level.code.padEnd(4)} ${r.level.name.padEnd(20)} hits/seed ${r.hits.toFixed(2)} losses ${r.losses} ` +
        r.runs.map((x) => `${x.cleared ? 'C' : 'X'}${x.losses}`).join(' '),
    );
  t.diagnostic(`world means W1 ${worldMean(1).toFixed(2)} W2 ${worldMean(2).toFixed(2)} W3 ${worldMean(3).toFixed(2)}`);
});
test('no wall: a 150 ms-lag reactive player clears every sector within three tries', () => {
  for (const r of results)
    for (const [i, run] of r.runs.entries())
      assert.ok(run.cleared, `${r.level.code} not cleared in ${ATTEMPTS} tries (seed ${SEEDS[i]})`);
});
test('world 1 is learnable: every W1 sector and the bonus clear on the first try', () => {
  for (const r of results.filter((r) => r.level.world === 1)) assert.equal(r.losses, 0, r.level.code);
});
test('the curve is not inverted: world means rise and the hardest sector is in world 3', () => {
  assert.ok(worldMean(2) >= worldMean(1) - 0.1, `W2 ${worldMean(2)} vs W1 ${worldMean(1)}`);
  assert.ok(worldMean(3) >= worldMean(2), `W3 ${worldMean(3)} vs W2 ${worldMean(2)}`);
  const hardest = results.reduce((a, b) => (b.hits > a.hits ? b : a));
  assert.equal(hardest.level.world, 3, `hardest is ${hardest.level.code}`);
});
test('bosses ramp: MOTHER CELL is not easier than DELTA, and DELTA is not a wall', () => {
  assert.ok(byCode['2-4'].hits >= byCode['1-4'].hits, `2-4 ${byCode['2-4'].hits} vs 1-4 ${byCode['1-4'].hits}`);
  assert.equal(byCode['1-4'].losses, 0);
  assert.ok(byCode['1-4'].hits <= 1, `DELTA averages ${byCode['1-4'].hits} hits`);
});
