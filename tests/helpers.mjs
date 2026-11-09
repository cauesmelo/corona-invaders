/** Shared test fixtures. Fixtures only arrange a starting situation; every
 * outcome is then produced by the real update() rules. */
import { createState, startGame } from '../model.mjs';
import { spawnGroup } from '../enemies.mjs';

export const running = (seed = 0x51a7c0de, stage = 1) => startGame(createState({ seed, stage }));

/** A quiet sector: one authored group, no sway/descent, no fire or dive clocks,
 * no walls and no courier, so one behavior can be observed alone. */
export function fixture(rows, { stage = 1, z = -4, spacing = 2.6, seed = 42 } = {}) {
  const s = running(seed, stage);
  Object.assign(s, { enemies: [], groups: [], membranes: [], enemyShots: [], enemyFireClock: 1e9, diveClock: 1e9 });
  s.sector.groupIndex = 99;
  s.sector.courierSpawned = true;
  spawnGroup(s, { rows, spacing, sway: 0, descent: 0, z }, 0, { enter: false });
  return s;
}
