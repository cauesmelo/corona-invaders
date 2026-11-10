/** A hit taken inside the deathbomb window, with the boss falling in the same
 * instant, must not cost a vial after the clear (owner report: "CONTAINMENT
 * LOST" appeared right after beating the boss, because the pending death
 * survived the transition and fired at the start of the next stage). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { running } from './helpers.mjs';
import { update } from '../model.mjs';
import { damageBoss } from '../bosses.mjs';

function toBossFight(seed) {
  const s = running(seed, 3, 'normal');
  for (let i = 0; i < 3000 && !(s.boss && s.boss.state === 'fight'); i++) update(s, 1 / 60, {});
  assert.equal(s.boss?.state, 'fight', 'the boss reached its fight');
  return s;
}

test('a hit pending when the boss falls is forgiven: no vial lost at the next stage, no loss screen', () => {
  const s = toBossFight(42);
  s.health = s.lives = 1; // the last vial: the worst case
  s.ship.invulnerable = 0;
  // The ship is hit (death pending inside the 0.18 s window) ...
  s.ship.dying = 0.15;
  s.pendingCause = { by: 'ALPHA', what: 'DROPLET', at: s.waveElapsed, stage: s.wave, code: '1-3' };
  // ... and the boss falls on the same frame, through the real damage rules.
  for (let i = 0; i < 40 && s.phase === 'playing'; i++) {
    s.boss.hp = 0;
    for (const part of s.boss.parts ?? s.enemies) damageBoss(s, part, 1e6, 'shot');
    update(s, 1 / 60, {});
  }
  assert.equal(s.phase, 'transition', 'the boss clear started the transition');
  assert.equal(s.ship.dying, 0, 'the pending death was settled by the clear');
  // Through the report and into the next stage, then one more second there:
  // the old bug fired 0.15 s into stage 4. (No longer: an idle ship in a real
  // stage would eventually be hit, which is not what this test is about.)
  const phases = new Set();
  let into = -1;
  for (let i = 0; i < 60 * 40; i++) {
    update(s, 1 / 60, { confirm: i % 20 === 0 });
    phases.add(s.phase);
    if (s.wave >= 4 && s.phase === 'playing' && into < 0) into = i;
    if (into >= 0 && i - into >= 60) break;
  }
  assert.ok(into >= 0, 'the run moved on to the next stage');
  assert.ok(!phases.has('lost'), `no loss screen after a won fight (saw ${[...phases].join(', ')})`);
  assert.equal(s.health, 1, 'the last vial is still there');
});
