/** QA controller shared by model tests and the root browser suite. It is the
 * same ordinary-input autopilot that drives the attract demo: it reads public
 * state and returns {axisX, axisZ, focus, bomb, confirm} only. It never edits
 * health, actors, bullets, timers or stages. Kept as a re-export so the root
 * suite can still inline it with chooseInput.toString().
 */
export { chooseInput } from '../autopilot.mjs';
