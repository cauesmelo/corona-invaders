/** Fixed-step clock for the browser loop. Pure: no DOM, no Three.js.
 *
 * The simulation always advances in whole 1/120 s steps (RULES.substep), the
 * same grid every test, fairness table and controller campaign runs on. The
 * old loop split each rendered frame into equal substeps of at most 1/120 s,
 * so a 240 Hz display (1/240 s substeps) or a hitch (for example 37 ms = five
 * 7.4 ms substeps) ran a slightly different simulation: after 12 s of the
 * same inputs the syringe was up to 0.4 u and bullets up to 1.3 u elsewhere,
 * with a different score (MOVEMENT_AUDIT.md, A2). On the fixed grid the same
 * inputs give the same positions at 30, 60, 120 and 240 Hz and through hitches.
 *
 * Frame pacing:
 *   - A frame within 0.5 ms of a whole number of half steps counts as exactly
 *     that (vsync jitter never turns 2-2-2 into 1-3-2 at 60 Hz). 0.5 ms keeps
 *     75 Hz (0.83 ms from 1.5 steps) and other rates unsnapped.
 *   - A frame longer than 50 ms advances 50 ms: a stall slows the game down
 *     rather than jumping bullets forward through the syringe.
 *   - At rates the grid divides (30/60/120/240 Hz) the latest step is drawn,
 *     with no added latency. At other rates (144, 165 Hz...) steps fall
 *     unevenly between frames, so the view is interpolated between the last
 *     two steps (`smooth`): even motion for at most one step (8.3 ms) of
 *     display delay, with every entity delayed alike, so what is drawn stays
 *     geometrically consistent with what collides.
 */
import { RULES } from './core.mjs';

export const STEP = RULES.substep;
const SNAP = 0.0005;
const MAX_FRAME = 0.05;

export function createClock() {
  return { acc: 0, miss: 0, smooth: false, steps: 0, alpha: 0 };
}

/** Feed one rendered frame's real duration (s). Returns how many whole steps
 * to simulate now, whether to draw interpolated, and the blend factor. */
export function advanceClock(clock, realDt) {
  let dt = Math.min(Math.max(0, Number(realDt) || 0), MAX_FRAME);
  const half = STEP / 2,
    k = Math.round(dt / half);
  const snapped = k >= 1 && Math.abs(dt - k * half) < SNAP;
  if (snapped) dt = k * half;
  // Interpolate only when frames keep missing the grid (a display rate the
  // grid does not divide); a single hitch on a 60 Hz display does not switch.
  if (dt > 0) clock.miss = snapped ? Math.max(0, clock.miss - 1) : Math.min(30, clock.miss + 3);
  clock.smooth = clock.miss > 12;
  clock.acc += dt;
  const steps = Math.floor(clock.acc / STEP + 1e-6);
  clock.acc = Math.max(0, clock.acc - steps * STEP);
  clock.steps = steps;
  clock.alpha = Math.min(1, clock.acc / STEP);
  return clock;
}

/** Positions of every moving thing before a step, keyed by object identity
 * (the simulation mutates entities in place). */
export function capturePositions(s) {
  const map = new WeakMap();
  const put = (o) => o && map.set(o, [o.x, o.z]);
  put(s.ship);
  for (const list of [s.enemyShots, s.shots, s.enemies, s.pickups, s.antigens]) for (const o of list || []) put(o);
  return map;
}

/** A read-only view of `s` with positions blended from `prev` toward the
 * current step by `alpha`. Objects that did not exist before the step are
 * shown where they are. The simulation state itself is never touched. */
export function interpolatedView(s, prev, alpha) {
  if (!prev) return s;
  const blend = (o) => {
    const p = prev.get(o);
    if (!p || (p[0] === o.x && p[1] === o.z)) return o;
    return { ...o, x: p[0] + (o.x - p[0]) * alpha, z: p[1] + (o.z - p[1]) * alpha };
  };
  const view = { ...s, ship: blend(s.ship) };
  for (const key of ['enemyShots', 'shots', 'enemies', 'pickups', 'antigens']) if (s[key]) view[key] = s[key].map(blend);
  return view;
}
