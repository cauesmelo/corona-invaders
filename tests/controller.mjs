/** QA controller shared by model tests and the root browser suite. It is the
 * same ordinary-input autopilot that drives the attract demo: it reads public
 * state and returns movement/fire/shield only. It never edits health, actors,
 * projectiles, timers or stages. Kept as a re-export so the root suite can
 * still inline it with chooseInput.toString().
 */
export { chooseInput } from '../autopilot.mjs';
