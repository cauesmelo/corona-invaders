/** Boss encounters built on mechanics rather than bullet count.
 *
 * Every boss has one "viral load" pool (b.hp) shown in the HUD. Phase floors cap
 * damage so a phase can never be skipped by one burst of hits; crossing a floor
 * starts a 1.0-1.1 s transition with 120 ms hitstop and a one-line attack name.
 * Parts with local HP (Delta halves, Mother sacs, Omega nodes) also drain the
 * pool, so the bar always equals the sum the player still has to remove.
 *
 * Attacks run as data-driven steps: telegraph -> fire -> optional punish window.
 * Big attacks (beams, rings, the Mother's opening) always telegraph >= 0.8 s and
 * are followed by a >= 1.0 s punish window; small volleys warn for 0.65 s. All
 * of them are dodgeable without the shield (see tests/bosses.test.mjs).
 *
 * Movement advances only through b.moveT, which pauses during stalls. A stalled
 * boss therefore resumes from the same point: no phase change teleports it.
 */
import { RULES, clamp, random, nextId, pushEvent, aimAngle, fireBullet, addTelegraph, requestHitstop } from './core.mjs';
import { ARCHETYPES } from './levels.mjs';
import { makeEnemy } from './enemies.mjs';
import { awardKill, refreshChainFromBoss, chainMultiplier } from './scoring.mjs';

export const BOSSES = Object.freeze({
  delta: { name: 'DELTA', hp: 60, floors: [28, 0], phases: ['WHOLE', 'HALVES'] },
  mother: { name: 'MOTHER CELL', hp: 80, floors: [50, 20, 0], phases: ['SACS', 'OPEN CORE', 'BURSTER RING'] },
  echo: { name: 'ECHO', hp: 48, floors: [32, 16, 0], phases: ['TRACKING', 'MIRROR', 'TWIN NUCLEUS'] },
  omega: { name: 'OMEGA PRIME', hp: 104, floors: [72, 20, 0], phases: ['CROWN', 'CORONA FLARE', 'FULL BLOOM'] },
});
const INTRO = 1.2;
const AIM3 = Object.freeze([-0.14, 0, 0.14]);
const SPREAD5 = Object.freeze([-0.36, -0.18, 0, 0.18, 0.36]);
// Ring bullets are slower than volleys so the gaps can be reached (macro-dodge).
const RING_SPEED = 9.4;
const RING_ANGLES = Object.freeze(Array.from({ length: 17 }, (_, i) => -0.72 + i * 0.09));
// Six boss-minion slots on one row in front of the boss.
const MINION_X = Object.freeze([-6.5, -3.9, -1.3, 1.3, 3.9, 6.5]);
const MINION_Z = -3.2;

const beam = (name, extra) => ({
  name,
  attack: 'beam',
  at: 'ship',
  width: 2,
  tele: 1,
  active: 0.35,
  punish: 1.2,
  stall: true,
  expose: true,
  gap: 0.6,
  ...extra,
});
const volley = (name, from, offsets, extra) => ({ name, attack: 'volley', from, offsets, tele: 0.65, gap: 0.8, ...extra });

/** Step scripts per boss and phase. `requires` skips a step whose part is dead:
 * destroying an Omega node really removes its attack. */
export const SCRIPTS = Object.freeze({
  delta: [
    // AIMED DOUBLE: two shots down one line, so any sidestep dodges both. The
    // lane beam comes out of Delta itself: stand under it and you must move.
    [
      volley('AIMED DOUBLE', 'whole', [0, 0], { stagger: 1.3 }),
      volley('AIMED DOUBLE', 'whole', [0, 0], { stagger: 1.3 }),
      beam('LANE BEAM', { at: 'part', from: 'whole', tele: 1.1 }),
    ],
    [
      { name: 'STUNNED', attack: 'none', tele: 0, punish: 1.2, stall: true, expose: true, gap: 0.4, once: true },
      volley('SPLIT SPREAD', 'half:L', [-0.2, 0, 0.2], { gap: 0.55, requires: 'half:L' }),
      volley('SPLIT SPREAD', 'half:R', [-0.2, 0, 0.2], { gap: 0.55, requires: 'half:R' }),
      volley('SPLIT SPREAD', 'half:L', [-0.2, 0, 0.2], { gap: 0.55, requires: 'half:L' }),
      volley('SPLIT SPREAD', 'half:R', [-0.2, 0, 0.2], { gap: 0.55, requires: 'half:R' }),
      beam('TWIN BEAM', { at: 'parts', from: 'half', width: 1.8 }),
    ],
  ],
  // World-2 boss: a step up from Delta (ramp check in tests/curve.test.mjs).
  mother: [
    [volley('CORE PULSE', 'core', AIM3, { gap: 1.7 })],
    [
      volley('OPENING', 'core', SPREAD5, { tele: 0.8, glow: true, punish: 2, open: true, stall: true, gap: 0.6 }),
      volley('CORE PULSE', 'core', AIM3, { gap: 1.2 }),
    ],
    [
      volley('OPENING', 'core', SPREAD5, { tele: 0.8, glow: true, punish: 2, open: true, stall: true, gap: 0.9 }),
      volley('CORE PULSE', 'core', AIM3, { gap: 1.3 }),
    ],
  ],
  // Echo's eye opens BEFORE it attacks: the safe punish window comes while no
  // bullets are in the air, then the plate closes and the attack is warned.
  echo: [
    [
      { name: 'EYE OPEN', attack: 'none', tele: 0, punish: 1.5, open: true, gap: 0 },
      // 1.8 s gap > the volley's ~1.6 s flight to the ship row, so the next
      // open eye never overlaps incoming Echo fire.
      volley('ECHO VOLLEY', 'echo:A', [-0.12, 0, 0.12], { gap: 1.8 }),
    ],
    [
      { name: 'MIRROR HOLD', attack: 'none', tele: 0, punish: 2, open: true, stall: true, gap: 0 },
      beam('MIRROR GLARE', { at: 'part', from: 'echo:A', tele: 1, punish: 0, expose: false, gap: 0.6 }),
      volley('MIRROR VOLLEY', 'echo:A', AIM3, { gap: 1.8 }),
    ],
    [volley('TWIN VOLLEY', 'nucleus', [-0.12, 0, 0.12], { gap: 1.6, swap: true })],
  ],
  omega: [
    // Crown: one node attacks at a time with >= 1.0 s gaps (was 0.8; playtest:
    // P1 overlapped too much). The beam glows for 1.1 s from its node.
    [
      volley('NODE: AIMED', 'node:aimed', AIM3, { requires: 'node:aimed', gap: 1 }),
      volley('NODE: SPREAD', 'node:spread', SPREAD5, { requires: 'node:spread', gap: 1 }),
      beam('NODE: BEAM', { from: 'node:beam', requires: 'node:beam', tele: 1.1, punish: 1, expose: false, gap: 1.2 }),
      { name: 'NODE: SPAWN', attack: 'spawn', from: 'node:spawn', requires: 'node:spawn', minion: 'diver', tele: 0.65, gap: 1.2 },
    ],
    [
      { name: 'CORONA FLARE', attack: 'ring', from: 'core', tele: 1, stall: true, shielded: true, punish: 1.5, expose: true, gap: 0.4 },
      volley('AIMED TRIPLE', 'core', AIM3, { gap: 0.5 }),
      volley('CORONA SPREAD', 'core', SPREAD5, { gap: 0.9 }),
    ],
    [
      { name: 'CORONA FLARE', attack: 'ring', from: 'core', tele: 1, stall: true, shielded: true, punish: 1.2, expose: true, gap: 0.4 },
      volley('AIMED TRIPLE', 'core', AIM3, { gap: 0.5 }),
      beam('LANE BEAM', { punish: 1 }),
      { name: 'SPAWN', attack: 'spawn', from: 'core', minion: 'diver', tele: 0.65, gap: 0.5 },
      volley('SPREAD', 'core', SPREAD5, { gap: 0.8 }),
    ],
  ],
});

const living = (s) => s.enemies.filter((e) => e.alive && e.kind === 'boss');
export function bossPart(s, from) {
  const b = s.boss;
  if (!b || !from) return null;
  const parts = living(s);
  if (from === 'nucleus') return parts.find((p) => p.id === b.nucleus) || null;
  const [part, tag] = from.split(':');
  return parts.find((p) => p.part === part && (!tag || p.tag === tag)) || null;
}

function makePart(s, part, radius, extra = {}) {
  // The primary body keeps the stable id `s<stage>-boss`; extra parts get suffixes.
  const primary = part === 'whole' || part === 'core' || (part === 'echo' && extra.tag === 'A');
  const e = makeEnemy(s, 'spore', 0, -7, {
    id: primary ? `s${s.wave}-boss` : `s${s.wave}-boss-${part}-${extra.tag ?? extra.slot}`,
    group: -1,
    mode: 'boss',
    ...extra,
  });
  Object.assign(e, { kind: 'boss', part, radius, hp: extra.hp ?? s.boss.hp, maxHp: extra.maxHp ?? extra.hp ?? s.boss.maxHp });
  s.enemies.push(e);
  return e;
}

export function createBoss(s, level) {
  const def = BOSSES[level.boss];
  s.groups.push({ index: 99, sway: 1.1, frequency: 0.8, descent: 0, cross: false, spawnAt: 0 });
  const b = {
    type: level.boss,
    name: def.name,
    hp: def.hp,
    maxHp: def.hp,
    floors: def.floors,
    phase: 0,
    state: 'intro',
    timer: INTRO,
    moveT: 0,
    stall: false,
    exposed: false,
    open: false,
    step: 0,
    stepState: 'gap',
    script: SCRIPTS[level.boss][0],
    attack: def.phases[0],
    aimX: 0,
    pending: [],
    ring: null,
    speed: 1,
    gapScale: 1,
    nucleus: null,
    ringAngle: 0,
    minionGroup: s.groups.length - 1,
    usedOnce: [],
  };
  s.boss = b;
  if (b.type === 'delta') makePart(s, 'whole', 1.85, { hp: def.hp, maxHp: def.hp });
  if (b.type === 'mother') {
    makePart(s, 'core', 2.1, { hp: def.hp });
    [
      [-3.1, 1.3],
      [0, 2.6],
      [3.1, 1.3],
    ].forEach(([dx, dz], slot) =>
      makePart(s, 'sac', 0.95, { slot, dx, dz, hp: 10, maxHp: 10, local: true, spawnClock: 2 + slot * 2, spawned: 0 }),
    );
  }
  if (b.type === 'echo') b.nucleus = makePart(s, 'echo', 1.5, { tag: 'A', hp: def.hp }).id;
  if (b.type === 'omega') {
    b.speed = 0.9; // crown nodes fire slower bullets than the core phases
    makePart(s, 'core', 2, { hp: def.hp });
    ['aimed', 'spread', 'beam', 'spawn'].forEach((attackType, slot) =>
      makePart(s, 'node', 0.8, { slot, tag: attackType, attackType, hp: 8, maxHp: 8, local: true }),
    );
  }
  moveBoss(s, b, 0);
  return b;
}

const ease = (k) => 1 - (1 - k) ** 3;
const smooth = (k) => k * k * (3 - 2 * k);

function moveBoss(s, b, dt) {
  const t = b.moveT,
    lift = b.state === 'intro' ? (1 - ease(1 - Math.max(0, b.timer) / INTRO)) * 6 : 0;
  const parts = living(s),
    ship = s.ship.x;
  for (const p of parts) {
    p.ox = p.x;
    p.oz = p.z;
  }
  if (b.type === 'delta') {
    const whole = parts.find((p) => p.part === 'whole');
    if (whole) {
      whole.x = Math.sin(t * 0.62) * 5.5;
      whole.z = -7 + Math.sin(t * 0.42) * 0.6 - lift;
    }
    // Halves glide from the split point to mirrored tracks over 1.2 s: x_L = -x_R.
    const xr = 3.8 + Math.sin(t * 0.8) * 3.2,
      z = -7 + Math.sin(t * 0.5) * 0.5;
    for (const h of parts.filter((p) => p.part === 'half')) {
      h.blend = Math.min(1, h.blend + dt / 1.2);
      const k = smooth(h.blend);
      h.x = h.fromX + ((h.tag === 'L' ? -xr : xr) - h.fromX) * k;
      h.z = h.fromZ + (z - h.fromZ) * k;
    }
  } else if (b.type === 'mother') {
    const core = parts.find((p) => p.part === 'core');
    if (core) {
      core.x = Math.sin(t * 0.35) * 3.5;
      core.z = -7.4 + Math.sin(t * 0.3) * 0.4 - lift;
      for (const sac of parts.filter((p) => p.part === 'sac')) {
        sac.x = core.x + sac.dx;
        sac.z = core.z + sac.dz;
      }
      b.ringAngle += 0.55 * dt;
      for (const e of s.enemies)
        if (e.alive && e.mode === 'orbit') {
          const a = b.ringAngle + (e.slot * Math.PI) / 3,
            ox = e.x,
            oz = e.z;
          // Ellipse 3.0 x 2.4 u keeps every ring Burster within burst reach of the
          // core (2.2 + half the core radius), so each pop really damages it.
          e.x = core.x + Math.cos(a) * 3;
          e.z = core.z + Math.sin(a) * 2.4;
          e.vx = dt ? (e.x - ox) / dt : 0;
          e.vz = dt ? (e.z - oz) / dt : 0;
        }
    }
  } else if (b.type === 'echo') {
    // First-order lag (0.6 s time constant) toward the player's x, or its mirror.
    for (const p of parts) {
      const mirror = b.phase === 1 || (b.phase === 2 && p.tag === 'B');
      const target = clamp(mirror ? -ship : ship, -8.2, 8.2),
        cap = b.phase === 1 ? 9 : 8;
      if (!b.stall && dt > 0) p.x += clamp((target - p.x) / 0.6, -cap, cap) * dt;
      p.z = -6.5 + Math.sin(t * 0.5) * 0.3 - lift;
    }
  } else if (b.type === 'omega') {
    const core = parts.find((p) => p.part === 'core');
    if (core) {
      core.x = Math.sin(t * 0.5) * 4.2;
      core.z = -7.8 + Math.sin(t * 0.4) * 0.5 - lift;
      for (const n of parts.filter((p) => p.part === 'node')) {
        const a = (n.slot * Math.PI) / 2 + t * 0.45;
        n.x = core.x + Math.cos(a) * 3;
        n.z = core.z + Math.sin(a) * 2.1;
      }
    }
  }
  for (const p of parts) {
    p.vx = dt ? (p.x - p.ox) / dt : 0;
    p.vz = dt ? (p.z - p.oz) / dt : 0;
  }
}

function stepAvailable(s, b, step) {
  if (step.once && b.usedOnce.includes(step.name)) return false;
  if (step.requires && !bossPart(s, step.requires)) return false;
  if (step.at === 'parts' && !living(s).some((p) => p.part === step.from)) return false;
  return true;
}

/** Begin a scripted step: capture aim, create telegraphs. Also used by tests to
 * isolate one attack for the dodge analysis. */
export function beginBossStep(s, index) {
  const b = s.boss,
    step = b.script[index];
  b.step = index;
  b.stepState = 'tele';
  b.timer = step.tele;
  b.stall = !!step.stall;
  b.attack = step.name;
  b.aimX = clamp(s.ship.x, -8.6, 8.6);
  b.pending = [];
  if (step.once) b.usedOnce.push(step.name);
  const src = bossPart(s, step.from);
  if (src && step.attack !== 'none') src.charge = step.tele;
  if (step.attack === 'beam') {
    const lanes =
      step.at === 'parts'
        ? living(s)
            .filter((p) => p.part === step.from)
            .map((p) => p.x)
        : step.at === 'part'
          ? [src?.x ?? b.aimX]
          : [b.aimX];
    // Lane positions live on the boss; the telegraph is only the visible glow,
    // so expiry order between the two timers can never cancel a warned beam.
    // fromZ: the glow is drawn from its source (the boss or node) to the ship row.
    const fromZ = src ? src.z : -9;
    b.lanes = lanes.map((x) => ({ x: clamp(x, -8.8, 8.8), width: step.width, fromZ }));
    for (const lane of b.lanes)
      b.pending.push(
        addTelegraph(s, { kind: 'lane', ...lane, timer: step.tele + 0.05, danger: true, boss: true, src: b.name }).id,
      );
  } else if (step.attack === 'ring' && src) {
    b.ring = { angles: ringAngles(s, src) };
    b.pending.push(
      addTelegraph(s, { kind: 'ring', ownerId: src.id, x: src.x, z: src.z, angles: b.ring.angles, timer: step.tele + 0.05, danger: true, boss: true }).id,
    );
  }
  if (step.glow && src)
    addTelegraph(s, { kind: 'glow', ownerId: src.id, color: 'cyan', timer: step.tele, boss: true, danger: false });
  pushEvent(s, 'boss-telegraph', { name: step.name, attack: step.attack, x: src?.x ?? b.aimX, z: src?.z ?? -7 });
}

/** Corona flare: 17 bullets fan across the whole width with two 2-bullet gaps.
 * Gap centers are seeded and kept inside +/-7.5 u at the ship row, at least five
 * bullets apart, so both gaps are reachable from anywhere during 1.0 s + travel. */
function ringAngles(s, src) {
  const depth = RULES.shipZ - src.z;
  const valid = [];
  for (let i = 0; i < RING_ANGLES.length - 1; i++) {
    const x = src.x + Math.tan((RING_ANGLES[i] + RING_ANGLES[i + 1]) / 2) * depth;
    if (Math.abs(x) <= 7.5) valid.push(i);
  }
  const g1 = valid[Math.floor(random(s) * valid.length)];
  const far = valid.filter((i) => Math.abs(i - g1) >= 5);
  const g2 = far.length ? far[Math.floor(random(s) * far.length)] : null;
  const gaps = new Set([g1, g1 + 1, ...(g2 === null ? [] : [g2, g2 + 1])]);
  return RING_ANGLES.filter((_, i) => !gaps.has(i));
}

function spawnMinion(s, b, kind, src) {
  const minions = s.enemies.filter((e) => e.alive && e.minion && e.mode !== 'orbit');
  if (!src || minions.length >= (b.type === 'mother' ? 6 : 2)) return null;
  const used = new Set(minions.map((e) => e.col));
  // Rotate the preferred slot each spawn so minions spread across the row.
  b.spawnRotation = ((b.spawnRotation ?? 0) + 1) % 6;
  const order = [2, 3, 1, 4, 0, 5].map((i) => (i + b.spawnRotation) % 6);
  const col = order.find((i) => !used.has(i));
  if (col === undefined) return null;
  const e = makeEnemy(s, kind, src.x, src.z, {
    group: b.minionGroup,
    row: 0,
    col,
    baseX: MINION_X[col],
    baseZ: MINION_Z,
    mode: 'rejoin',
    minion: true,
  });
  s.enemies.push(e);
  pushEvent(s, 'spawn', { x: src.x, z: src.z, kind });
  return e;
}

function fireStep(s, b, step) {
  const src = bossPart(s, step.from);
  if (step.attack === 'volley' && src) {
    const angle = aimAngle(src.x, src.z, b.aimX);
    step.offsets.forEach((o, i) => {
      // `stagger` places later bullets further back along the same line.
      const back = (step.stagger ?? 0) * i,
        a = angle + o;
      fireBullet(s, src.x - Math.sin(a) * back, src.z + src.radius * 0.8 - Math.cos(a) * back, a, s.levelShotSpeed * b.speed, {
        radius: 0.23,
        src: b.name,
        boss: true,
      });
    });
    pushEvent(s, 'enemy-shot', { x: src.x, z: src.z, kind: 'boss' });
  } else if (step.attack === 'beam') {
    for (const lane of b.lanes ?? []) s.beams.push({ id: nextId(s), ...lane, timer: step.active, src: b.name });
    // The floor glow stays on (brighter) while the beam is live, so nobody steps
    // back into a lane that just stopped "warning" but is still burning.
    for (const t of s.telegraphs)
      if (b.pending.includes(t.id)) {
        t.firing = true;
        t.timer = t.age + step.active + 0.02;
      }
    pushEvent(s, 'beam', { lanes: b.lanes?.map((l) => l.x) ?? [] });
    b.lanes = [];
  } else if (step.attack === 'ring' && src) {
    for (const a of b.ring.angles)
      fireBullet(s, src.x, src.z + src.radius * 0.8, a, RING_SPEED * b.speed, { radius: 0.24, src: b.name, boss: true });
    s.telegraphs = s.telegraphs.filter((t) => !b.pending.includes(t.id));
    pushEvent(s, 'ring', { x: src.x, z: src.z });
  } else if (step.attack === 'spawn') spawnMinion(s, b, step.minion, src);
  if (step.swap) {
    const other = living(s).find((p) => p.part === 'echo' && p.id !== b.nucleus);
    if (other) {
      b.nucleus = other.id;
      pushEvent(s, 'nucleus-swap', { x: other.x, z: other.z, id: other.id });
    }
  }
  b.pending = [];
}

function endStep(s, b) {
  const step = b.script[b.step];
  b.exposed = b.open = b.stall = false;
  b.stepState = 'gap';
  b.timer = (step?.gap ?? 0.5) * b.gapScale * (b.type === 'delta' && living(s).filter((p) => p.part === 'half').length === 1 ? 0.7 : 1);
  b.attack = BOSSES[b.type].phases[b.phase];
  for (let i = 1; i <= b.script.length; i++) {
    const next = (b.step + i) % b.script.length;
    if (stepAvailable(s, b, b.script[next])) {
      b.step = next;
      return;
    }
  }
}

function runScript(s, b, dt) {
  b.timer -= dt;
  for (let guard = 0; guard < 5 && b.timer <= 0 && b.state === 'fight'; guard++) {
    const step = b.script[b.step];
    if (b.stepState === 'gap') {
      if (!stepAvailable(s, b, step)) endStep(s, b);
      // One threat at a time: a beam or flare waits until this boss's previous
      // bullets have passed the ship row, so lanes never combine with crossfire.
      else if ((step.attack === 'beam' || step.attack === 'ring') && s.enemyShots.some((x) => x.boss && x.z < RULES.shipZ + 0.7))
        b.timer = 0.1;
      else beginBossStep(s, b.step);
    } else if (b.stepState === 'tele') {
      fireStep(s, b, step);
      b.stepState = 'active';
      b.timer = step.active || 0;
    } else if (b.stepState === 'active') {
      if (step.punish) {
        b.stepState = 'punish';
        b.timer = step.punish;
        b.exposed = !!step.expose;
        b.open = !!step.open;
        b.attack = step.open ? 'OPEN' : 'EXPOSED';
        pushEvent(s, 'punish', { name: step.name, exposed: b.exposed, open: b.open });
      } else endStep(s, b);
    } else endStep(s, b);
  }
}

/** Phase entry. Called after the transition, or directly by tests that need a
 * specific phase. Spawned parts start where the previous part was. */
export function enterBossPhase(s, phase) {
  const b = s.boss,
    parts = living(s);
  b.phase = phase;
  if (b.type === 'delta' && phase === 1) {
    const whole = parts.find((p) => p.part === 'whole');
    const x = whole?.x ?? 0,
      z = whole?.z ?? -7;
    if (whole) whole.alive = false;
    pushEvent(s, 'split', { x, z });
    for (const tag of ['L', 'R']) {
      const hp = tag === 'L' ? Math.ceil(b.hp / 2) : Math.floor(b.hp / 2);
      const fromX = x + (tag === 'L' ? -1.6 : 1.6);
      makePart(s, 'half', 1.3, { tag, hp, maxHp: 14, local: true, fromX, fromZ: z, blend: 0, x: fromX, z });
    }
  }
  if (b.type === 'mother') {
    for (const sac of parts.filter((p) => p.part === 'sac')) sac.alive = false;
    if (phase === 2) {
      // Six orbiting Bursters; a pop beside the core deals 4 (burstBossDamage).
      for (let slot = 0; slot < 6; slot++) {
        const e = makeEnemy(s, 'burster', 0, -7, { mode: 'orbit', slot, minion: true, noDrop: true });
        e.id = `s${s.wave}-ring-${slot}`;
        s.enemies.push(e);
      }
    }
  }
  if (b.type === 'echo' && phase === 2) {
    const a = parts.find((p) => p.tag === 'A');
    makePart(s, 'echo', 1.5, { tag: 'B', x: a?.x ?? 0, z: a?.z ?? -6.5 });
    b.nucleus = a?.id ?? null;
  }
  if (b.type === 'omega') {
    for (const n of parts.filter((p) => p.part === 'node')) n.alive = false;
    b.speed = phase === 2 ? 1.2 : 1;
    if (phase === 2) b.gapScale = 0.7;
  }
  b.script = SCRIPTS[b.type][phase];
  b.step = 0;
  b.stepState = 'gap';
  b.timer = 0.5;
  b.state = 'fight';
  b.stall = b.exposed = b.open = false;
  b.attack = BOSSES[b.type].phases[phase];
  moveBoss(s, b, 0);
}

function startTransition(s, b) {
  b.state = 'transition';
  b.timer = b.type === 'delta' ? 1 : 1.1;
  b.stall = true;
  b.exposed = b.open = false;
  b.attack = BOSSES[b.type].phases[b.phase + 1];
  s.telegraphs = s.telegraphs.filter((t) => !t.boss);
  b.pending = [];
  for (const p of living(s)) p.charge = 0;
  requestHitstop(s, 0.12);
  pushEvent(s, 'phase-break', { name: b.attack, phase: b.phase + 2, boss: b.name });
}

function defeat(s, b, part) {
  b.state = 'defeated';
  b.hp = 0;
  b.attack = '';
  const x = part?.x ?? 0,
    z = part?.z ?? -7;
  for (const p of living(s)) p.alive = false;
  const { mult, points } = awardKill(s, 3000);
  pushEvent(s, 'kill', { kind: 'boss', boss: b.type, x, z, id: part?.id, mult, points, final: true });
  // Remaining minions are cured with the boss (scored, never dropping capsules).
  for (const e of s.enemies)
    if (e.alive && !e.courier) {
      e.alive = false;
      const r = awardKill(s, ARCHETYPES[e.kind]?.score ?? 100);
      pushEvent(s, 'kill', { kind: e.kind, x: e.x, z: e.z, id: e.id, mult: r.mult, points: r.points, source: 'cure' });
    }
  s.telegraphs = s.telegraphs.filter((t) => !t.danger);
  s.beams = [];
  s.bursts = [];
  requestHitstop(s, 0.2, true);
  s.slowmo = 0.8;
  pushEvent(s, 'boss-defeated', { name: b.name, x, z });
}

function isVulnerable(s, b, p, source) {
  if (b.state === 'transition' || b.state === 'defeated') return false;
  if (b.type === 'mother') {
    if (p.part === 'sac') return b.phase === 0;
    return b.phase > 0 && (b.open || (source === 'burst' && b.phase === 2));
  }
  if (b.type === 'echo') return b.phase === 2 ? p.id === b.nucleus : b.open;
  if (b.type === 'omega') {
    if (p.part === 'node') return true;
    if (b.phase === 0) return false;
    return !(b.script[b.step]?.shielded && b.stepState === 'tele');
  }
  return true;
}

/** Apply damage to a boss part. Returns {blocked} so shots on a closed plate
 * become cyan sparks rather than silent misses. */
export function damageBoss(s, part, amount, source = 'shot') {
  const b = s.boss;
  if (!b || !part.alive || !isVulnerable(s, b, part, source)) {
    pushEvent(s, 'spark', { x: part.x, z: part.z + part.radius * 0.85, id: part.id });
    return { blocked: true, damage: 0 };
  }
  const floor = b.floors[b.phase] ?? 0;
  let damage = Math.min(amount * (b.exposed ? 2 : 1), b.hp - floor);
  if (part.local) damage = Math.min(damage, part.hp);
  if (damage <= 0) {
    pushEvent(s, 'spark', { x: part.x, z: part.z + part.radius * 0.85, id: part.id });
    return { blocked: true, damage: 0 };
  }
  b.hp -= damage;
  if (part.local) part.hp -= damage;
  for (const p of living(s)) if (!p.local) p.hp = b.hp;
  refreshChainFromBoss(s);
  s.score += 10 * damage * chainMultiplier(s.chain.count);
  pushEvent(s, 'hit', { kind: 'boss', part: part.part, id: part.id, x: part.x, z: part.z, damage, exposed: b.exposed });
  if (part.local && part.hp <= 0 && b.hp > 0) {
    part.alive = false;
    const r = awardKill(s, 400);
    pushEvent(s, 'kill', { kind: 'boss-part', part: part.part, tag: part.tag, id: part.id, x: part.x, z: part.z, ...r });
    requestHitstop(s, 0.03);
  }
  if (b.hp <= 0) defeat(s, b, part);
  else if (b.phase < b.floors.length - 1 && b.hp <= floor) startTransition(s, b);
  return { blocked: false, damage };
}

export function updateBoss(s, level, dt) {
  const b = s.boss;
  if (!b || b.state === 'defeated') return;
  for (const p of living(s)) if (p.charge > 0) p.charge = Math.max(0, p.charge - dt);
  if (b.state === 'intro') {
    b.timer -= dt;
    moveBoss(s, b, dt);
    if (b.timer <= 0) {
      b.state = 'fight';
      b.stepState = 'gap';
      b.timer = 0.4;
    }
    return;
  }
  if (!b.stall) b.moveT += dt;
  moveBoss(s, b, dt);
  if (b.type === 'mother' && b.phase === 0)
    for (const sac of living(s).filter((p) => p.part === 'sac'))
      if ((sac.spawnClock -= dt) <= 0) {
        sac.spawnClock = 6;
        // Each sac alternates Burster/Diver: destroying a sac removes a stream.
        spawnMinion(s, b, (sac.spawned++ + sac.slot) % 2 ? 'diver' : 'burster', sac);
      }
  if (b.state === 'transition') {
    if ((b.timer -= dt) <= 0) enterBossPhase(s, b.phase + 1);
    return;
  }
  runScript(s, b, dt);
}

/** HUD data: the real pool, phase notches, sub-parts and the current attack. */
export function bossStatus(s) {
  const b = s.boss;
  if (!b || b.state === 'defeated') return null;
  const parts = s.enemies.filter((e) => e.kind === 'boss' && e.local && (e.alive || e.part !== 'whole'));
  return {
    id: b.type,
    name: b.name,
    hp: b.hp,
    maxHp: b.maxHp,
    // The displayed phase is the notch the pool has crossed. It equals the live
    // phase except during a transition, where it already shows the incoming one.
    phase: 1 + b.floors.slice(0, -1).filter((f) => b.hp <= f).length,
    phases: b.floors.length,
    phaseName: BOSSES[b.type].phases[b.phase],
    attack: b.attack || BOSSES[b.type].phases[b.phase],
    notches: b.floors.slice(0, -1).map((f) => f / b.maxHp),
    parts: parts.map((p) => ({ id: p.id, label: p.tag ?? p.part, part: p.part, hp: Math.max(0, p.hp), maxHp: p.maxHp, alive: p.alive })),
    exposed: b.exposed,
    open: b.open,
    state: b.state,
    stepState: b.stepState,
    nucleus: b.nucleus,
    // Which part attacks next (Omega's sub-bars and nodes highlight it).
    next: b.state === 'fight' ? (bossPart(s, b.script[b.step]?.from)?.id ?? null) : null,
  };
}
