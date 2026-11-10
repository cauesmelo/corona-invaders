/** Movement and collision audit (common/docs/MOVEMENT_CRITERIA.md, sections
 * A, C, D, E and F-Corona Invaders). Every number in MOVEMENT_AUDIT.md comes
 * from these tests or from the browser script it names. Inputs are ordinary
 * {axisX, axisZ, focus, bomb, targetX, targetZ, drag} records; fixtures only
 * place things, the real update() decides every outcome.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RULES, update, togglePause, restartGame, LEVELS, BOSSES } from '../model.mjs';
import { requestHitstop } from '../core.mjs';
import { COLLIDERS, MARKER, GRAZE_RING, markerQuad, sweptHit, bulletGap } from '../hitboxes.mjs';
import { cameraLayout, projectPoint } from '../camera.mjs';
import { PRESETS, startPattern, upgradeParams } from '../patterns.mjs';
import { ARCHETYPES, attackFor } from '../levels.mjs';
import { createReactive } from './reactive.mjs';
import { quiet, running, bullet, cardArena } from './helpers.mjs';
import { STEP as CLOCK_STEP, createClock, advanceClock, capturePositions, interpolatedView } from '../clock.mjs';

const STEP = 1 / 120;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ---- A1 responsiveness ------------------------------------------------------------
test('A1: keyboard move, stop and focus act on the step of the press, with no ramp', () => {
  let s = quiet();
  const x0 = s.ship.x;
  update(s, STEP, { axisX: 1 });
  assert.ok(near(s.ship.x - x0, RULES.shipSpeed * STEP), 'full speed on the first step');
  const x1 = s.ship.x;
  update(s, STEP, {});
  assert.equal(s.ship.x, x1, 'release stops on the same step (no slide)');
  update(s, STEP, { axisX: -1 });
  assert.ok(near(s.ship.x - x1, -RULES.shipSpeed * STEP), 'reversal is instant');
  // Focus from full speed: the very first focused step is already slow.
  s = quiet();
  s.ship.x = -5;
  update(s, 0.1, { axisX: 1 });
  const xa = s.ship.x;
  update(s, STEP, { axisX: 1, focus: true });
  assert.ok(near(s.ship.x - xa, RULES.focusSpeed * STEP), `focus step ${s.ship.x - xa}`);
  assert.equal(s.ship.focus, true);
  assert.ok(s.events.some((e) => e.type === 'focus' && e.on), 'focus engage is an event (ring + tick)');
  update(s, 0.06, { axisX: 1, focus: true });
  assert.ok(near(s.ship.x - xa, RULES.focusSpeed * (STEP + 0.06), 1e-9), 'the first 60 ms of focus travel exactly focus speed (0.30 u, was 0.47 u with the blend)');
  // Pointer, drag and SOAP also act on the step of the press.
  s = quiet();
  const p0 = { x: s.ship.x, z: s.ship.z };
  update(s, STEP, { targetX: p0.x + 3, targetZ: p0.z });
  assert.ok(near(s.ship.x - p0.x, RULES.pointerSpeed * STEP));
  update(s, STEP, { targetX: s.ship.x - 3, targetZ: p0.z, drag: true });
  assert.ok(near(s.ship.x - (p0.x + RULES.pointerSpeed * STEP), -RULES.dragSpeed * STEP));
  const stock = s.ship.bombs;
  update(s, STEP, { bomb: true });
  assert.equal(s.ship.bombs, stock - 1, 'SOAP on the step of the press');
  assert.ok(s.soapRing);
});

// ---- Speeds, diagonals and the box -----------------------------------------------
test('F speeds: board crossing at full and focus speed, focus ratio, normalised diagonals', (t) => {
  const width = RULES.moveMaxX - RULES.moveMinX,
    depth = RULES.moveMaxZ - RULES.moveMinZ;
  const measure = (input) => {
    const s = quiet();
    Object.assign(s.ship, { x: RULES.moveMinX, z: 6 });
    let t = 0;
    while (s.ship.x < RULES.moveMaxX && t < 10) {
      update(s, STEP, input);
      t += STEP;
    }
    return t;
  };
  const full = measure({ axisX: 1 }),
    focus = measure({ axisX: 1, focus: true });
  assert.ok(near(full, width / RULES.shipSpeed, STEP + 1e-9), `full ${full}`);
  assert.ok(near(focus, width / RULES.focusSpeed, STEP + 1e-9), `focus ${focus}`);
  // Targets (criteria F): 0.8-1.3 s at full speed, focus 35-50 % of full.
  const ratio = RULES.focusSpeed / RULES.shipSpeed;
  t.diagnostic(`crossing ${full.toFixed(3)} s full, ${focus.toFixed(3)} s focus, ratio ${ratio.toFixed(3)}, depth ${(depth / RULES.shipSpeed).toFixed(3)} s`);
  assert.ok(ratio >= 0.35 && ratio <= 0.5, `focus ratio ${ratio}`);
  // Every one of the 8 directions moves exactly the same distance per step.
  for (const [ax, az] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
    const s = quiet();
    Object.assign(s.ship, { x: 0, z: 5 });
    update(s, 0.2, { axisX: ax, axisZ: az });
    assert.ok(near(Math.hypot(s.ship.x, s.ship.z - 5), RULES.shipSpeed * 0.2, 1e-9), `${ax},${az}`);
  }
  // Partial analogue axes keep their magnitude (never faster than 1).
  const s = quiet();
  Object.assign(s.ship, { x: 0, z: 5 });
  update(s, 0.2, { axisX: 0.5 });
  assert.ok(near(s.ship.x, RULES.shipSpeed * 0.1, 1e-9));
});

test('edge clamping: keyboard, mouse and touch stop at the same box edges, and wall-sliding keeps the straight component', () => {
  const box = (input) => {
    const s = quiet();
    update(s, 3, input);
    return [s.ship.x, s.ship.z];
  };
  for (const [ax, az] of [[1, -1], [-1, 1], [1, 1], [-1, -1]]) {
    const key = box({ axisX: ax, axisZ: az });
    const far = { targetX: ax * 50, targetZ: az * 50 };
    const mouse = box(far),
      touch = box({ ...far, drag: true });
    const want = [ax > 0 ? RULES.moveMaxX : RULES.moveMinX, az > 0 ? RULES.moveMaxZ : RULES.moveMinZ];
    for (const got of [key, mouse, touch]) assert.deepEqual(got, want);
  }
  // Pressing diagonally into the right wall slides along it at the diagonal's
  // straight component, the same speed it had before reaching the wall.
  const s = quiet();
  Object.assign(s.ship, { x: RULES.moveMaxX, z: 8 });
  update(s, 0.1, { axisX: 1, axisZ: -1 });
  assert.equal(s.ship.x, RULES.moveMaxX);
  assert.ok(near(8 - s.ship.z, RULES.shipSpeed * Math.SQRT1_2 * 0.1, 1e-9));
});

// ---- A2 frame-rate independence --------------------------------------------------
/** The browser loop (game.js): one input record per rendered frame, applied to
 * each whole 1/120 s step the clock releases during that frame. */
function playFrames(make, frames, inputAt) {
  const s = make(),
    clock = createClock(),
    trace = [];
  let t = 0,
    steps = 0;
  for (const dt of frames) {
    const input = inputAt(t);
    advanceClock(clock, dt);
    for (let i = 0; i < clock.steps; i++) {
      update(s, CLOCK_STEP, input);
      if (++steps % 30 === 0) trace.push([steps, s.ship.x, s.ship.z, s.enemyShots.length, s.score, s.damageTaken]);
    }
    t += dt;
  }
  return { s, trace, steps };
}
// Inputs change every 0.4 s and focus every 0.7 s: boundaries every frame
// rate shares (multiples of 1/30 s), so every rate sees the same inputs.
const scripted = (t) => {
  const k = Math.floor(t / 0.4 + 1e-6) % 4,
    f = Math.floor(t / 0.7 + 1e-6) % 2;
  return { axisX: [1, 0, -1, 0][k], axisZ: [0, -1, 0, 1][k], focus: f === 1 };
};
function frameRuns(make, seconds = 12) {
  const runs = {};
  for (const hz of [30, 60, 120, 240]) runs[`${hz} Hz`] = playFrames(make, Array(seconds * hz).fill(1 / hz), scripted);
  // Hitches: frames of 0-100 ms (random multiples of 1/240 s) that never
  // straddle an input change, so the inputs per step stay the same.
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const frames = [];
  for (let tick = 0, total = seconds * 240; tick < total; ) {
    let n = rnd() < 0.25 ? 1 + Math.floor(rnd() * 24) : 4;
    const edge = Math.min(Math.ceil((tick + 1) / 8) * 8, total); // next 1/30 s boundary
    n = Math.min(n, edge - tick);
    frames.push(n / 240);
    tick += n;
  }
  runs.hitches = playFrames(make, frames, scripted);
  return runs;
}
test('A2: the same inputs give the same positions and outcome at 30/60/120/240 Hz and through 0-100 ms hitches', (t) => {
  const makers = {
    'ALPHA card': () => cardArena('alpha', 0, { x: 0 }),
    '2-2 stage': () => running(42, 6),
  };
  for (const [name, make] of Object.entries(makers)) {
    const runs = frameRuns(make);
    const ref = runs['60 Hz'];
    for (const [label, r] of Object.entries(runs)) {
      let dmax = 0;
      for (const [i, row] of r.trace.entries()) dmax = Math.max(dmax, Math.hypot(row[1] - ref.trace[i][1], row[2] - ref.trace[i][2]));
      t.diagnostic(`${name} ${label}: ${r.steps} steps, max syringe deviation ${dmax} u, score ${r.s.score}, hits ${r.s.damageTaken}`);
      assert.equal(r.steps, ref.steps, label);
      assert.deepEqual(r.trace, ref.trace, `${name} ${label}: identical trace`);
      assert.deepEqual(
        r.s.enemyShots.map((b) => [b.x, b.z]),
        ref.s.enemyShots.map((b) => [b.x, b.z]),
        `${name} ${label}: identical bullets`,
      );
    }
  }
});
test('A2: arbitrary (off-grid) hitches never change the simulation, only when it is shown', () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const input = () => ({ axisX: 1, axisZ: -1, focus: true });
  const ref = playFrames(() => running(1, 10), Array(60 * 10).fill(1 / 60), input);
  const frames = [];
  // Frames over 50 ms advance only 50 ms, so play a little longer.
  for (let t = 0; t < 12; ) {
    const dt = rnd() < 0.2 ? rnd() * 0.1 : 1 / 60 + (rnd() - 0.5) * 0.004;
    frames.push(dt);
    t += dt;
  }
  const r = playFrames(() => running(1, 10), frames, input);
  const n = Math.min(r.trace.length, ref.trace.length);
  assert.ok(n >= 38, `${n} rows`);
  assert.deepEqual(r.trace.slice(0, n), ref.trace.slice(0, n));
});
test('A2 pacing: 60 Hz with vsync jitter runs 2 steps a frame and draws the latest step; 144 Hz interpolates', () => {
  let c = createClock(),
    seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const counts = [];
  for (let i = 0; i < 600; i++) counts.push(advanceClock(c, 1 / 60 + (rnd() - 0.5) * 0.0008).steps);
  assert.ok(counts.every((n) => n === 2), 'no 1-3 step stutter from jitter');
  assert.equal(c.smooth, false, 'no interpolation delay at 60 Hz');
  advanceClock(c, 0.037); // one hitch
  for (let i = 0; i < 3; i++) advanceClock(c, 1 / 60);
  assert.equal(c.smooth, false, 'a single hitch does not switch modes');
  for (const hz of [30, 120, 240]) {
    c = createClock();
    let steps = 0;
    for (let i = 0; i < hz; i++) steps += advanceClock(c, 1 / hz).steps;
    assert.equal(steps, 120, `${hz} Hz: 120 steps per second`);
    assert.equal(c.smooth, false, `${hz} Hz draws the latest step`);
  }
  c = createClock();
  let steps = 0;
  for (let i = 0; i < 144; i++) steps += advanceClock(c, 1 / 144).steps;
  assert.ok(Math.abs(steps - 120) <= 1);
  assert.equal(c.smooth, true, '144 Hz interpolates between steps');
  // A 1 s stall advances only 50 ms.
  c = createClock();
  assert.equal(advanceClock(c, 1).steps, 6);
  // The interpolated view blends positions and never touches the state.
  const s = quiet();
  s.enemyShots.push({ ...bullet(0, 0), vz: 6 });
  const prev = capturePositions(s);
  update(s, CLOCK_STEP, { axisX: 1 });
  const before = JSON.stringify(s);
  const v = interpolatedView(s, prev, 0.25);
  assert.equal(JSON.stringify(s), before);
  assert.ok(near(v.ship.x, s.ship.px + (s.ship.x - s.ship.px) * 0.25, 1e-12));
  assert.ok(near(v.enemyShots[0].z, 0.25 * 6 * CLOCK_STEP, 1e-12));
});

// ---- A3 lost and phantom inputs ----------------------------------------------------
test('A3: a SOAP press on the pause screen never fires after resume; a held key never re-fires', () => {
  const s = quiet();
  const stock = s.ship.bombs;
  togglePause(s);
  update(s, 1 / 60, { bomb: true });
  update(s, 1 / 60, {});
  togglePause(s);
  update(s, 1 / 60, {});
  assert.equal(s.bombsUsed, 0, 'the press belonged to the pause screen');
  // Held from before the pause through the resume: one press, one SOAP.
  update(s, 1 / 60, { bomb: true });
  togglePause(s);
  update(s, 1 / 60, { bomb: true });
  togglePause(s);
  for (let i = 0; i < 30; i++) update(s, 1 / 60, { bomb: true });
  assert.equal(s.bombsUsed, 1);
  assert.equal(s.ship.bombs, stock - 1);
});

test('A3: a SOAP pressed during hitstop still fires (and still deathbombs) when the freeze ends', () => {
  let s = quiet();
  requestHitstop(s, 0.05);
  update(s, 1 / 60, { bomb: true });
  assert.equal(s.bombsUsed, 0, 'frozen: nothing simulated yet');
  for (let i = 0; i < 4; i++) update(s, 1 / 60, { bomb: true });
  assert.equal(s.bombsUsed, 1, 'buffered through the freeze, fired once');
  // Hit, then a boss-break hitstop freezes the deathbomb window; the press
  // made inside the freeze rescues the vial.
  s = quiet();
  s.enemyShots.push(bullet(s.ship.x + 0.05, s.ship.z));
  update(s, STEP);
  assert.ok(s.ship.dying > 0);
  requestHitstop(s, 0.12, true);
  update(s, 1 / 60, { bomb: true });
  for (let i = 0; i < 12; i++) update(s, 1 / 60, {});
  assert.equal(s.deathbombs, 1);
  assert.equal(s.health, 3);
});

test('A3: presses between samples never leak into the next one; a retry starts clean', () => {
  // A press on the very call in which the transition ends.
  const s = quiet();
  s.phase = 'transition';
  s.transition = 1 / 120;
  s.transitionHold = false;
  update(s, 1 / 30, { bomb: true });
  assert.equal(s.phase, 'playing');
  assert.equal(s.bombsUsed, 0, 'the press stayed with the transition');
  // Loss screen: a press there is dropped, and the retry begins with no queue.
  const t = quiet();
  t.health = 1;
  t.ship.bombs = 0;
  t.enemyShots.push(bullet(t.ship.x, t.ship.z));
  update(t, 0.25);
  assert.equal(t.phase, 'lost');
  update(t, 1 / 60, { bomb: true });
  restartGame(t);
  update(t, 1 / 60, {});
  assert.equal(t.bombsUsed, 0);
  // Respawn rule: SOAP is refused during the 0.5 s glide (the syringe is
  // invulnerable) and the press expires instead of firing later.
  const r = quiet();
  r.ship.bombs = 2;
  r.enemyShots.push(bullet(r.ship.x, r.ship.z));
  update(r, 0.25);
  assert.ok(r.ship.respawn > 0);
  update(r, 1 / 60, { bomb: true });
  for (let i = 0; i < 40; i++) update(r, 1 / 60, {});
  assert.equal(r.bombsUsed, 0);
  // Movement keys are level-sensitive: held through the glide, they act on
  // the first controllable step.
  const m = quiet();
  m.enemyShots.push(bullet(m.ship.x, m.ship.z));
  update(m, 0.25);
  let steps = 0;
  while (m.ship.respawn > 0) {
    update(m, STEP, { axisX: 1 });
    steps++;
  }
  const x = m.ship.x;
  update(m, STEP, { axisX: 1 });
  assert.ok(near(m.ship.x - x, RULES.shipSpeed * STEP), `control returns after ${steps} steps`);
});

// ---- A4 determinism ----------------------------------------------------------------
const hashOf = (s) => createHash('sha256').update(JSON.stringify({ ship: s.ship, shots: s.enemyShots, enemies: s.enemies, score: s.score, rng: s.rngState })).digest('hex');
test('A4: same seed and inputs give a bit-identical state', () => {
  const run = () => {
    const s = running(7, 6);
    for (let f = 0; f < 60 * 20; f++) update(s, 1 / 60, { axisX: Math.sin(f / 40) > 0 ? 1 : -1, axisZ: f % 200 < 100 ? -1 : 1, focus: f % 90 < 30, bomb: f === 600 });
    return hashOf(s);
  };
  assert.equal(run(), run());
});

// ---- C hitbox fidelity -------------------------------------------------------------
/** Pixel radius (x and screen-y) of a circle of radius r on the plane y at
 * board point (x, z), projected through the real camera fit. */
function projectedRadius(layout, width, height, x, y, z, r) {
  const px = (p) => {
    const q = projectPoint(p, layout);
    return [((q.x + 1) * width) / 2, ((1 - q.y) * height) / 2];
  };
  const [l] = px([x - r, y, z]),
    [rr] = px([x + r, y, z]);
  const [, top] = px([x, y, z - r]),
    [, bot] = px([x, y, z + r]);
  return { w: (rr - l) / 2, h: (bot - top) / 2 };
}
// The game stage (canvas) inside 960x640, 390x844 and 320x568 windows, as
// measured in Chrome (`__game.renderer().viewport`).
const VIEWPORTS = [[928, 608], [374, 768], [304, 492]];
const POSITIONS = [[0, RULES.shipZ], [RULES.moveMinX, RULES.moveMinZ], [RULES.moveMaxX, RULES.moveMaxZ], [4, 2]];
export function markerTable() {
  const rows = [];
  for (const [w, h] of VIEWPORTS) {
    const layout = cameraLayout(w, h);
    for (const [x, z] of POSITIONS) {
      const drawn = projectedRadius(layout, w, h, x, MARKER.y, z, (markerQuad() / 2) * (MARKER.texEdge / MARKER.texHalf));
      const collider = projectedRadius(layout, w, h, x, RULES.bulletY, z, RULES.shipRadius);
      rows.push({ viewport: `${w}x${h}`, x, z, drawnW: drawn.w, drawnH: drawn.h, colliderW: collider.w, colliderH: collider.h });
    }
  }
  return rows;
}
test('C1/F hitbox: the drawn core marker projects to exactly the collision radius at every position and viewport', (t) => {
  assert.equal(MARKER.r, RULES.shipRadius);
  assert.equal(MARKER.y, RULES.bulletY, 'the marker lies on the collision plane');
  for (const r of markerTable()) {
    t.diagnostic(`${r.viewport} (${r.x}, ${r.z}): marker ${(2 * r.drawnW).toFixed(3)} x ${(2 * r.drawnH).toFixed(3)} px, collider ${(2 * r.colliderW).toFixed(3)} x ${(2 * r.colliderH).toFixed(3)} px`);
    assert.ok(near(r.drawnW, r.colliderW, 1e-9) && near(r.drawnH, r.colliderH, 1e-9), JSON.stringify(r));
    // Smallest case: a 320x568 window, top corner of the box (5.0 px wide).
    assert.ok(2 * r.colliderW >= 4.9, `${r.viewport}: marker ${2 * r.colliderW} px is still visible`);
  }
});

test('E/F graze: the drawn ring outer edge is the graze radius; a bullet grazes exactly when its solid crosses it', () => {
  assert.equal(GRAZE_RING.outer, RULES.grazeRadius);
  assert.equal(GRAZE_RING.y, RULES.bulletY);
  for (const [d, grazed] of [[-0.005, 1], [0.005, 0]]) {
    const s = quiet();
    s.enemyShots.push(bullet(s.ship.x + RULES.grazeRadius + 0.15 + d, s.ship.z));
    update(s, STEP);
    assert.equal(s.grazes, grazed, `edge ${d}`);
  }
});

/** Ground truth for one substep: the minimum distance between the core's path
 * and the bullet capsule's path, sampled finely (both move linearly). */
function truthHit(b, c0, c1, coreR) {
  for (let i = 0; i <= 400; i++) {
    const k = i / 400;
    const bx = b.px + (b.x - b.px) * k,
      bz = b.pz + (b.z - b.pz) * k;
    const cx = c0[0] + (c1[0] - c0[0]) * k,
      cz = c0[1] + (c1[1] - c0[1]) * k;
    if (bulletGap({ ...b, x: bx, z: bz }, cx, cz) < coreR - 1e-6) return true;
  }
  return false;
}
test('C3 swept collision: no tunnelling at twice the fastest bullet, with the core moving at touch-drag speed', () => {
  // Fastest authored bullet: 8.5 u/s (x1.3 in an exhale = 11.05). Test 25 u/s.
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let misses = 0,
    ghost = 0,
    cases = 0;
  for (const family of Object.keys(COLLIDERS)) {
    const c = COLLIDERS[family];
    for (let i = 0; i < 400; i++) {
      const speed = 25 * STEP,
        a = rnd() * Math.PI * 2;
      const vx = Math.sin(a) * speed,
        vz = Math.cos(a) * speed;
      const b = { family, hit: c.r, half: c.half, vx: vx / STEP, vz: vz / STEP, px: (rnd() - 0.5) * 1.6, pz: (rnd() - 0.5) * 1.6 };
      b.x = b.px + vx;
      b.z = b.pz + vz;
      const ca = rnd() * Math.PI * 2,
        cs = RULES.dragSpeed * STEP;
      const c0 = [0, 0],
        c1 = [Math.cos(ca) * cs, Math.sin(ca) * cs];
      const want = truthHit(b, c0, c1, RULES.shipRadius),
        got = sweptHit(b, c0[0], c0[1], c1[0], c1[1]);
      cases++;
      if (want && !got) misses++;
      if (got && !want) ghost++;
    }
  }
  assert.equal(misses, 0, 'tunnelled');
  // The swept test compares the paths over the whole substep, so it can
  // report a touch that two linear motions only reach at different instants
  // (conservative, within one substep of travel). Keep that rare.
  assert.ok(ghost / cases < 0.03, `${ghost}/${cases} conservative hits`);
  // And through the real update(): a 25 u/s aerosol aimed through the core.
  for (let off = -0.3; off <= 0.3; off += 0.05) {
    const s = quiet();
    s.enemyShots.push({ ...bullet(s.ship.x + off, s.ship.z - 0.2), vz: 25 });
    update(s, STEP);
    assert.equal(s.ship.dying > 0, Math.abs(off) < 0.35, `offset ${off}`);
  }
});

// ---- Deathbomb -----------------------------------------------------------------------
/** For each frame after a hit: the real time from the hit to that frame's
 * start, and whether a SOAP pressed on that frame saves the vial. */
function deathbombFrames(hz) {
  const out = [];
  for (let k = 1; k < Math.ceil(0.4 * hz); k++) {
    const s = quiet();
    s.enemyShots.push(bullet(s.ship.x + 0.05, s.ship.z));
    update(s, 1 / hz); // the hit lands inside this frame
    const sinceHit = RULES.deathbomb - s.ship.dying; // already elapsed at its end
    for (let i = 1; i < k; i++) update(s, 1 / hz, {});
    update(s, 1 / hz, { bomb: true });
    out.push({ at: sinceHit + (k - 1) / hz, saved: s.deathbombs === 1 && s.health === 3 });
  }
  return out;
}
test('F deathbomb: a 0.18 s window of real time at 30, 60, 120 and 240 Hz', (t) => {
  for (const hz of [30, 60, 120, 240]) {
    const frames = deathbombFrames(hz);
    const last = Math.max(...frames.filter((f) => f.saved).map((f) => f.at));
    t.diagnostic(`${hz} Hz: the last saving press starts ${(last * 1000).toFixed(1)} ms after the hit`);
    // Exactly the presses that start inside the 0.18 s window save.
    for (const f of frames) assert.equal(f.saved, f.at < RULES.deathbomb - 1e-9, `${hz} Hz press at ${f.at}`);
    assert.ok(last > RULES.deathbomb - 1 / hz - 1e-9);
  }
});

// ---- F fairness: every pattern, 150 ms reactive player, no SOAP ----------------------
function authoredUses() {
  const out = [];
  for (const kind of Object.keys(ARCHETYPES))
    for (let w = 1; w <= 4; w++) {
      const a = attackFor(kind, w);
      if (!a) continue;
      out.push({ where: `${kind} W${w}`, ...a });
      if (w === 4) out.push({ where: `${kind} W4 mutated`, preset: a.preset, params: upgradeParams(a.preset, { ...PRESETS[a.preset].defaults, ...a.params }, 1) });
    }
  for (const level of LEVELS) for (const st of level.script || []) if (st.flight?.fire) out.push({ where: `${level.code} flight`, ...st.flight.fire });
  for (const [type, def] of Object.entries(BOSSES))
    def.cards.forEach((c) => {
      c.patterns.forEach((p) => out.push({ where: `${type} ${c.name}`, preset: p.preset, params: p.params, boss: true }));
      // A QUARANTINE card raises the box itself and fires its own patterns inside.
      if (c.quarantine) out.push({ where: `${type} ${c.name}`, preset: 'quarantine', params: { duration: c.duration }, boss: true, inside: c.patterns });
    });
  return out;
}
/** The harshest authored use of each preset (count x speed x repeats). */
export function harshest() {
  const best = {};
  for (const u of authoredUses()) {
    const p = { ...PRESETS[u.preset].defaults, ...u.params };
    const score = (p.n ?? p.rate ?? 1) * Math.max(...[].concat(p.speeds ?? p.speed ?? 1)) * (p.reps ?? 1);
    if (!best[u.preset] || score > best[u.preset].score) best[u.preset] = { ...u, score };
  }
  return best;
}
export function dodgeRuns(u, { threads = false } = {}) {
  return [-6, -3, 0, 3, 6].map((x) => {
    const s = quiet(1, { seed: 5 + x });
    s.health = s.lives = 99;
    s.ship.x = x;
    s.ship.bombs = 0;
    const player = createReactive({ phase: x + 6, bombs: false, threads });
    // The pattern fires every 3 s for 16 s from three sources at the top, so
    // aimed shots arrive from different angles.
    for (let f = 0; f < 60 * 16; f++) {
      if (f % 180 === 0) startPattern(s, u.preset, { x: [-4, 0, 4][(f / 180) % 3], z: -7, params: u.params, force: true, boss: u.boss, src: 'AUDIT' });
      // Inside a QUARANTINE box: the card's own patterns, from the box's top edge.
      if (u.inside && f % 180 === 60) for (const p of u.inside) startPattern(s, p.preset, { x: s.quarantine?.x ?? 0, z: (s.quarantine ? s.quarantine.z - s.quarantine.half - 3 : -7), params: p.params, force: true, boss: true, src: 'AUDIT' });
      update(s, 1 / 60, player(s, f));
    }
    return { hits: s.damageTaken, bombs: s.bombsUsed };
  });
}
test('F fairness: a 150 ms reactive player dodges every pattern preset (harshest authored use) without SOAP', (t) => {
  const best = harshest();
  assert.deepEqual(Object.keys(best).sort(), Object.keys(PRESETS).sort(), 'every preset has an authored use');
  for (const [preset, u] of Object.entries(best)) {
    // RNA strands travel on a sine; the drawn RNA thread between the beads
    // shows that path, so the player model reads it (`threads`).
    const runs = dodgeRuns(u, { threads: preset === 'strand' });
    const hits = runs.map((r) => r.hits),
      mean = hits.reduce((a, b) => a + b, 0) / hits.length;
    t.diagnostic(`${preset.padEnd(10)} ${u.where.padEnd(28)} hits ${hits.join(' ')}`);
    assert.ok(runs.every((r) => r.bombs === 0));
    // The card standard (tests/curve.test.mjs): mean <= 1.2, worst <= 3,
    // most starts take at most one hit.
    assert.ok(mean <= 1.2 && Math.max(...hits) <= 3 && hits.filter((h) => h <= 1).length >= 3, `${preset}: ${hits.join(' ')}`);
  }
});
