import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RULES,
  LEVELS,
  BOSSES,
  SCRIPTS,
  createState,
  startGame,
  update,
  bossStatus,
  beginBossStep,
  enterBossPhase,
} from '../model.mjs';
import { damageBoss, bossPart } from '../bosses.mjs';

const STAGE = Object.fromEntries(LEVELS.filter((l) => l.kind === 'boss').map((l) => [l.boss, l.id]));
const parts = (s, part) => s.enemies.filter((e) => e.alive && e.kind === 'boss' && (!part || e.part === part));

/** Boss alone in its arena (no escorts, minions, walls, courier or clocks). */
function arena(type, phase = 0, seed = 7) {
  const s = startGame(createState({ seed, stage: STAGE[type] }));
  s.enemies = s.enemies.filter((e) => e.kind === 'boss');
  Object.assign(s, { membranes: [], enemyFireClock: 1e9, diveClock: 1e9 });
  s.sector.courierSpawned = true;
  update(s, 1.3); // finish the entry slide
  const b = s.boss;
  if (phase > 0) {
    b.hp = b.floors[phase - 1];
    enterBossPhase(s, phase);
  }
  for (const sac of parts(s, 'sac')) sac.spawnClock = 1e9;
  b.stepState = 'gap';
  b.timer = 1e9;
  s.ship.invulnerable = 0;
  return s;
}
const hold = (s) => {
  // Freeze the scheduler between steps so one attack is observed alone.
  if (s.boss.stepState === 'gap') s.boss.timer = 1e9;
};
function hit(s, part, times = 1) {
  for (let i = 0; i < times; i++) damageBoss(s, part, 1, 'shot');
}

test('four bosses with the specified viral loads and phase floors', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(BOSSES).map(([k, b]) => [k, [b.hp, ...b.floors]])),
    { delta: [60, 28, 0], mother: [80, 50, 20, 0], echo: [48, 32, 16, 0], omega: [104, 72, 20, 0] },
  );
});
test('boss bar data: real pool, phase notches at every threshold, sub-parts', () => {
  const s = arena('delta');
  let hud = bossStatus(s);
  assert.equal(hud.hp, 60);
  assert.deepEqual(hud.notches, [28 / 60]);
  assert.equal(hud.phases, 2);
  const m = arena('mother');
  hud = bossStatus(m);
  assert.deepEqual(hud.notches, [50 / 80, 20 / 80]);
  assert.equal(hud.parts.length, 3, 'three sac pips');
  const o = arena('omega');
  assert.deepEqual(bossStatus(o).parts.map((p) => p.label), ['aimed', 'spread', 'beam', 'spawn']);
});
test('every big attack telegraphs >= 0.8 s and has a >= 1.0 s punish window next to it; volleys warn 0.65 s', () => {
  for (const [type, phases] of Object.entries(SCRIPTS))
    for (const steps of phases)
      steps.forEach((step, i) => {
        if (step.attack === 'beam' || step.attack === 'ring' || step.glow) {
          assert.ok(step.tele >= 0.8, `${type} ${step.name} telegraph ${step.tele}`);
          // Either punished right after, or (Echo) the eye opened right before.
          const before = steps[(i - 1 + steps.length) % steps.length];
          const window = Math.max(step.punish ?? 0, before.attack === 'none' && before.open ? before.punish : 0);
          assert.ok(window >= 1, `${type} ${step.name} punish window ${window}`);
        } else if (step.attack === 'volley') assert.ok(step.tele >= 0.65, `${type} ${step.name}`);
      });
});
test("Echo opens its eye before it attacks: the punish window has no Echo bullets in flight", () => {
  const s = arena('echo');
  s.boss.timer = 0;
  for (let i = 0; i < 60 * 12; i++) {
    update(s, 1 / 60, { targetX: Math.sin(i / 40) * 6 });
    if (s.boss.open)
      assert.equal(s.enemyShots.filter((b) => b.boss && b.z < RULES.shipZ).length, 0, 'no incoming volley overlaps the open eye');
  }
});
test('Delta fires its lane beam from its own body and escorts hold fire during big telegraphs', () => {
  const s = startGame(createState({ seed: 3, stage: STAGE.delta }));
  update(s, 1.3);
  const whole = parts(s, 'whole')[0];
  const beamStep = s.boss.script.findIndex((st) => st.attack === 'beam');
  beginBossStep(s, beamStep);
  const lane = s.telegraphs.find((t) => t.kind === 'lane');
  assert.ok(Math.abs(lane.x - whole.x) < 1e-9 && Math.abs(lane.fromZ - whole.z) < 1e-9);
  const warnings = [];
  for (let i = 0; i < 60; i++) {
    update(s, 1 / 60);
    if (s.telegraphs.some((t) => t.kind === 'lane')) warnings.push(...s.events.filter((e) => e.type === 'warning'));
  }
  assert.equal(warnings.length, 0, 'no new escort warnings while the beam glows');
});

// ---- Delta ----------------------------------------------------------------------
test('Delta: damage stops at the split floor, a seam shows for 1.0 s, then two halves appear', () => {
  const s = arena('delta');
  const whole = parts(s, 'whole')[0];
  for (let i = 0; i < 80; i++) damageBoss(s, whole, 2, 'shot');
  assert.equal(s.boss.hp, 28, 'a phase can never be skipped');
  assert.equal(s.boss.state, 'transition');
  assert.ok(s.events.some((e) => e.type === 'phase-break' && e.name === 'HALVES'));
  assert.ok(Math.abs(s.hitstop - 0.12) < 1e-9, 'phase break: 120 ms hitstop');
  update(s, 0.12 + 0.9);
  assert.equal(parts(s, 'half').length, 0);
  update(s, 0.15);
  const halves = parts(s, 'half');
  assert.equal(halves.length, 2);
  assert.deepEqual(halves.map((h) => h.hp), [14, 14]);
  assert.equal(bossStatus(s).parts.length, 2, 'the bar splits into two sub-bars');
});
test('Delta: halves are stunned and take double damage, then mirror each other', () => {
  const s = arena('delta', 1);
  s.boss.timer = 0;
  update(s, 1 / 180);
  assert.equal(s.boss.attack, 'EXPOSED');
  const [l] = parts(s, 'half');
  const before = s.boss.hp;
  damageBoss(s, l, 1, 'shot');
  assert.equal(before - s.boss.hp, 2);
  update(s, 2);
  const [a, b] = parts(s, 'half');
  assert.ok(Math.abs(a.x + b.x) < 1e-6, `x_L = -x_R (${a.x}, ${b.x})`);
});
test('Delta: killing one half makes the survivor attack 30% faster', () => {
  const s = arena('delta', 1);
  const [l, r] = parts(s, 'half');
  s.boss.timer = 0;
  update(s, 1.7); // stun ends
  hit(s, l, 14);
  assert.equal(l.alive, false);
  update(s, 0.2); // past the part-kill hitstop
  const step = s.boss.script.findIndex((st) => st.requires === 'half:R');
  beginBossStep(s, step);
  update(s, 0.66);
  assert.ok(s.boss.stepState === 'gap');
  assert.ok(Math.abs(s.boss.timer - 0.55 * 0.7) < 0.02, `gap ${s.boss.timer}`);
  assert.ok(r.alive);
});

// ---- Mother Cell -------------------------------------------------------------------
test('Mother Cell: each sac spawns a burster or diver every 6 s; the closed core sparks', () => {
  const s = startGame(createState({ seed: 7, stage: STAGE.mother }));
  s.membranes = [];
  update(s, 1.3);
  const kinds = [];
  for (let i = 0; i < 60 * 13; i++) {
    s.ship.invulnerable = 1; // fixture: observe spawn cadence, not survival
    update(s, 1 / 60, { targetX: 8 });
    for (const e of s.events) if (e.type === 'spawn') kinds.push(e.kind);
  }
  assert.ok(kinds.length >= 5, String(kinds));
  assert.ok(kinds.includes('burster') && kinds.includes('diver'));
  const core = parts(s, 'core')[0];
  const hp = s.boss.hp;
  assert.equal(damageBoss(s, core, 1).blocked, true);
  assert.equal(s.boss.hp, hp);
});
test('Mother Cell: sacs gone -> the core glows cyan 0.8 s, fires a 5-shot spread, opens 2 s', () => {
  const s = arena('mother');
  for (const sac of parts(s, 'sac')) hit(s, sac, 10);
  assert.equal(s.boss.hp, 50);
  update(s, 1.3);
  assert.equal(s.boss.phase, 1);
  s.boss.timer = 0;
  update(s, 1 / 180);
  assert.ok(s.telegraphs.some((t) => t.kind === 'glow' && t.color === 'cyan'));
  const core = parts(s, 'core')[0];
  assert.equal(damageBoss(s, core, 1).blocked, true, 'closed during the glow');
  update(s, 0.82);
  assert.equal(s.enemyShots.filter((b) => b.boss).length, 5);
  assert.equal(s.boss.open, true);
  assert.equal(damageBoss(s, core, 1).blocked, false);
  update(s, 2.05);
  assert.equal(s.boss.open, false);
});
test('Mother Cell: below 25% an orbiting ring of six bursters; each pop by the core deals 4', () => {
  const s = arena('mother', 2);
  const ring = s.enemies.filter((e) => e.alive && e.mode === 'orbit');
  assert.equal(ring.length, 6);
  update(s, 0.5);
  const hp = s.boss.hp;
  const pod = ring[0];
  s.shots.push({ id: 1, x: pod.x, z: pod.z, vx: 0, vz: 0, radius: 0.16 });
  update(s, 1 / 180);
  update(s, 0.2);
  assert.equal(hp - s.boss.hp, 4);
});

// ---- Echo ------------------------------------------------------------------------
test('Echo: tracks the ship with lag; the mirror sparks shots except during the open eye', () => {
  const s = arena('echo');
  const echo = parts(s, 'echo')[0];
  s.ship.x = 6;
  update(s, 0.3);
  assert.ok(echo.x > 0.5 && echo.x < 6, 'lagging follow');
  update(s, 3);
  assert.ok(Math.abs(echo.x - 6) < 0.3);
  assert.equal(damageBoss(s, echo, 1).blocked, true);
  beginBossStep(s, 0);
  update(s, 0.67);
  assert.equal(s.boss.open, true);
  assert.equal(damageBoss(s, echo, 1).blocked, false);
  update(s, 1.25);
  assert.equal(s.boss.open, false);
});
test('Echo: mirror phase sits at -ship.x, freezes with its eye open, then beams its own column', () => {
  const s = arena('echo', 1);
  const echo = parts(s, 'echo')[0];
  s.ship.x = 5;
  update(s, 3);
  assert.ok(Math.abs(echo.x + 5) < 0.3, `mirrored at ${echo.x}`);
  beginBossStep(s, 0);
  update(s, 1 / 180);
  assert.equal(s.boss.open, true, 'the eye opens first, before any attack');
  const x = echo.x;
  s.ship.x = -2;
  update(s, 1.9);
  assert.equal(echo.x, x, 'frozen while open');
  beginBossStep(s, 1);
  assert.ok(s.telegraphs.some((t) => t.kind === 'lane' && Math.abs(t.x - x) < 1e-9));
  update(s, 0.95);
  assert.equal(echo.x, x, 'frozen while charging');
  update(s, 0.1);
  assert.equal(s.beams.length, 1);
});
test('Echo: twin phase — only the glowing nucleus takes damage and it swaps after each volley', () => {
  const s = arena('echo', 2);
  const [a, b] = parts(s, 'echo');
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-6, 'the twin buds from the original');
  assert.equal(s.boss.nucleus, a.id);
  assert.equal(damageBoss(s, b, 1).blocked, true);
  assert.equal(damageBoss(s, a, 1).blocked, false);
  beginBossStep(s, 0);
  update(s, 0.7);
  assert.equal(s.boss.nucleus, b.id);
});

// ---- Omega Prime -----------------------------------------------------------------
test('Omega: four orbiting nodes own one attack each; destroying a node removes its attack', () => {
  const s = arena('omega');
  const core = parts(s, 'core')[0];
  assert.equal(damageBoss(s, core, 1).blocked, true, 'core shielded by the crown');
  const beamNode = bossPart(s, 'node:beam');
  hit(s, beamNode, 8);
  assert.equal(beamNode.alive, false);
  s.boss.timer = 0;
  const names = [];
  for (let i = 0; i < 60 * 14; i++) {
    update(s, 1 / 60, { targetX: Math.sin(i / 50) * 7 });
    for (const e of s.events) if (e.type === 'boss-telegraph') names.push(e.name);
  }
  assert.ok(names.includes('NODE: AIMED') && names.includes('NODE: SPREAD') && names.includes('NODE: SPAWN'));
  assert.ok(!names.includes('NODE: BEAM'));
});
test('Omega: corona flare telegraphs 1.0 s, fires a ring with exactly two gaps, then exposes the core', () => {
  const s = arena('omega', 1);
  const core = parts(s, 'core')[0];
  beginBossStep(s, 0);
  const ring = s.telegraphs.find((t) => t.kind === 'ring');
  assert.ok(ring);
  assert.equal(damageBoss(s, core, 1).blocked, true, 'shielded while the flare charges');
  assert.equal(ring.angles.length, 17 - 4);
  const step = 0.09;
  const holes = ring.angles.slice(1).filter((a, i) => a - ring.angles[i] > step * 1.5);
  assert.equal(holes.length, 2);
  update(s, 1.01);
  assert.equal(s.enemyShots.filter((b) => b.boss).length, 13);
  assert.equal(s.boss.exposed, true);
  const hp = s.boss.hp;
  damageBoss(s, core, 1);
  assert.equal(hp - s.boss.hp, 2);
});
test('Omega: full bloom below 20% runs the whole moveset faster', () => {
  const s = arena('omega', 2);
  assert.equal(s.boss.speed, 1.2);
  assert.equal(s.boss.gapScale, 0.7);
  const attacks = new Set(s.boss.script.map((st) => st.attack));
  for (const a of ['ring', 'volley', 'beam', 'spawn']) assert.ok(attacks.has(a));
});

// ---- Continuity and fairness -----------------------------------------------------
test('phase changes never teleport a boss: per-substep motion stays bounded', () => {
  for (const type of Object.keys(BOSSES)) {
    const s = startGame(createState({ seed: 11, stage: STAGE[type] }));
    s.enemies = s.enemies.filter((e) => e.kind === 'boss');
    s.membranes = [];
    update(s, 2);
    const b = s.boss;
    let last = new Map(parts(s).map((p) => [p.id, [p.x, p.z]]));
    for (let phase = 1; phase < b.floors.length; phase++) {
      // Fixture: one point above the floor with the weak point open, then one
      // ordinary hit crosses the threshold through the real damage rule.
      b.hp = b.floors[phase - 1] + 1;
      b.open = true;
      b.stepState = 'gap';
      b.timer = 0.5;
      const part = parts(s).find((p) => !damageBossDry(s, p));
      assert.ok(part, `${type}: a vulnerable part exists`);
      damageBoss(s, part, 1, 'shot');
      assert.equal(b.state, 'transition');
      for (let i = 0; i < 180 * 2.5; i++) {
        update(s, 1 / 180, { targetX: 4 });
        for (const p of parts(s)) {
          const prev = last.get(p.id);
          if (prev) assert.ok(Math.hypot(p.x - prev[0], p.z - prev[1]) < 0.2, `${type} ${p.id} jumped`);
        }
        last = new Map(parts(s).map((p) => [p.id, [p.x, p.z]]));
      }
      assert.equal(b.phase, phase, `${type} reached phase ${phase + 1}`);
    }
  }
});
/** True when a hit would be blocked, without changing state. */
function damageBossDry(s, part) {
  const copy = structuredClone(s);
  const p = copy.enemies.find((e) => e.id === part.id);
  return damageBoss(copy, p, 1, 'burst').blocked;
}

/** No-shield dodge analysis. For every attack of every phase, from five start
 * positions, a keyboard-speed (15.5 u/s) player who reacts 0.25 s after the
 * telegraph appears and then commits to one destination must have at least one
 * destination that takes no damage. Shield input is never used. */
const DESTINATIONS = [null, ...Array.from({ length: 35 }, (_, i) => -8.5 + i * 0.5)];
function survives(base, destination) {
  const s = structuredClone(base);
  for (let t = 0; t < 4.5; t += 1 / 60) {
    let axis = 0;
    if (t >= 0.25 && destination !== null) {
      const d = destination - s.ship.x;
      axis = Math.abs(d) < 0.12 ? 0 : Math.sign(d);
    }
    update(s, 1 / 60, { axis, shield: false });
    hold(s);
    if (s.damageTaken) return false;
  }
  return true;
}
for (const type of Object.keys(BOSSES))
  test(`every ${BOSSES[type].name} attack is dodgeable without the shield`, () => {
    for (let phase = 0; phase < BOSSES[type].floors.length; phase++) {
      const probe = arena(type, phase);
      probe.boss.script.forEach((step, index) => {
        if (step.attack === 'none' || step.attack === 'spawn') return;
        for (const start of [-8, -4, 0, 4, 8]) {
          const s = arena(type, phase);
          s.ship.x = start;
          update(s, 0.6); // let tracking bosses settle relative to the ship
          s.boss.timer = 1e9;
          if (step.requires && !bossPart(s, step.requires)) return;
          beginBossStep(s, index);
          const ok = DESTINATIONS.some((d) => survives(s, d));
          assert.ok(ok, `${type} P${phase + 1} ${step.name} from x=${start}`);
        }
      });
    }
  });

test('boss bullets leave >= 1.25 s from a back-row boss to the ship row', () => {
  for (const level of LEVELS.filter((l) => l.kind === 'boss')) {
    const travel = (RULES.shipZ - -6) / (level.shotSpeed * 1.1);
    assert.ok(travel >= 1.25, `${level.code} ${travel}`);
  }
});
