/** Prints medal pars: ceil(1.3 x the QA controller's seed-42 clear time) per
 * stage. Paste the array into PAR in levels.mjs after changing a sector.
 *   node tests/measure-par.mjs
 */
import { createState, startGame, update, LEVELS } from '../model.mjs';
import { chooseInput } from './controller.mjs';

export function controllerTimes(seed = 42) {
  const s = startGame(createState({ seed }));
  const times = {};
  for (let frame = 0; frame < 60 * 600 && !['won', 'lost'].includes(s.phase); frame++) {
    update(s, 1 / 60, chooseInput(s, frame));
    for (const ev of s.events) if (ev.type === 'wave') times[ev.stage] = ev.time;
  }
  return { phase: s.phase, times };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const { phase, times } = controllerTimes(42);
  console.log(phase);
  console.log(JSON.stringify(LEVELS.map((l) => Math.ceil(1.3 * times[l.id]))));
}
