/** Formation and archetype behaviors. Pure: positions, timers and telegraphs only.
 * Damage, kills and scoring live in model.mjs so every damage source (shots,
 * bursts, boss parts) follows one rule set.
 *
 * Each archetype owns one job (Centipede-style) and one readable telegraph:
 *   spore/armored/dart/daughter: aimed fire after a 0.65 s pink glow
 *   diver:    0.8 s pink dashed line, then a dive along it and one shot at its end
 *   capsid:   chosen by the fire clock like any shooter: its plate swings open
 *             during the 0.65 s warning, it fires, then stays open 1.5 s
 *   infector: 1.5 s pink tether that armors a spore unless the infector dies
 *   courier:  crosses the back once, never fires; its capsule icon cycles
 */
import { RULES, clamp, random, nextId, pushEvent, aimAngle, fireBullet, formationShotCount, addTelegraph } from './core.mjs';
import { ARCHETYPES, CODE_KIND } from './levels.mjs';

export const PICKUP_KINDS = Object.freeze(['rapid', 'spread', 'shield', 'repair']);
const ENTER_TIME = 1.2;
const DIVE_TELEGRAPH = 0.8;
const ROULETTE_PERIOD = 0.8;
const FLIER_SPEED = 8;

export function makeEnemy(s, kind, x, z, extra = {}) {
  const a = ARCHETYPES[kind];
  return {
    id: `s${s.wave}-${kind}-${nextId(s)}`,
    kind,
    x,
    z,
    baseX: x,
    baseZ: z,
    radius: a.radius,
    hp: a.hp,
    maxHp: a.hp,
    alive: true,
    row: 0,
    col: 0,
    group: -1,
    mode: 'formation',
    modeTime: 0,
    charge: 0,
    aimX: 0,
    vx: 0,
    vz: 0,
    spawnAt: s.waveElapsed,
    ...extra,
  };
}

/** Group definitions become live formation records. No RNG is used here, so a
 * checkpoint retry rebuilds identical formations before restoring the stream. */
export function spawnGroup(s, def, index, { enter = true } = {}) {
  const group = {
    index,
    sway: def.sway ?? 1.2,
    frequency: def.frequency ?? 0.95,
    descent: def.descent ?? 0.1,
    cross: !!def.cross,
    spawnAt: s.waveElapsed,
  };
  s.groups.push(group);
  const gi = s.groups.length - 1,
    rowGap = def.rowGap ?? 2.05,
    z0 = def.z ?? -9.2;
  def.rows.forEach((line, row) => {
    const cols = line.length;
    [...line].forEach((code, col) => {
      const kind = CODE_KIND[code];
      if (!kind) return;
      const x = (col - (cols - 1) / 2) * (def.spacing ?? 2.6),
        z = z0 + row * rowGap;
      const e = makeEnemy(s, kind, x, z, {
        id: `s${s.wave}-g${index}-${row}-${col}`,
        group: gi,
        row,
        col,
        mode: enter ? 'enter' : 'formation',
      });
      if (code === 'Y') Object.assign(e, { armoredShell: true, hp: 3, maxHp: 3, radius: 0.78 });
      // Capsids open only when the fire clock picks them, so the bullet budget
      // and the one-shooter-at-a-time rhythm apply to them like everyone else.
      if (kind === 'capsid') e.plate = { state: 'closed', timer: 0 };
      if (kind === 'infector') e.tetherClock = 2.2 + col * 0.45;
      s.enemies.push(e);
    });
  });
  return gi;
}

/** Live formation slot: shared sway plus slow descent since the group spawned.
 * Opposing ("cross") rows sway in the opposite direction to change firing lanes. */
export function slotPosition(s, e) {
  const g = s.groups[e.group];
  if (!g) return [e.baseX, e.baseZ];
  const t = s.waveElapsed,
    dir = g.cross && e.row % 2 ? -1 : 1;
  const x = e.baseX + Math.sin(t * g.frequency * dir + e.row * 0.35) * g.sway;
  const weave = e.kind === 'dart' ? Math.sin(t * 1.8 + e.col) ** 2 * 0.7 : 0;
  return [clamp(x, -8.8, 8.8), e.baseZ + (t - g.spawnAt) * g.descent + weave];
}
/** Invert slotPosition so a drifting daughter or returning diver re-enters the
 * formation exactly where it is, with no visible snap. */
function adoptSlot(s, e) {
  const g = s.groups[e.group];
  if (!g) return;
  const t = s.waveElapsed,
    dir = g.cross && e.row % 2 ? -1 : 1;
  e.baseX = e.x - Math.sin(t * g.frequency * dir + e.row * 0.35) * g.sway;
  e.baseZ = e.z - (t - g.spawnAt) * g.descent;
}

const pathLengths = new WeakMap();
function pathAt(path, distance) {
  let lengths = pathLengths.get(path);
  if (!lengths) {
    lengths = [0];
    for (let i = 1; i < path.length; i++)
      lengths.push(lengths[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    pathLengths.set(path, lengths);
  }
  const total = lengths.at(-1);
  if (distance >= total) return { done: true, x: path.at(-1)[0], z: path.at(-1)[1], total };
  let i = 1;
  while (lengths[i] < distance) i++;
  const k = (distance - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1);
  return {
    done: false,
    x: path[i - 1][0] + (path[i][0] - path[i - 1][0]) * k,
    z: path[i - 1][1] + (path[i][1] - path[i - 1][1]) * k,
    total,
  };
}
export const pathLength = (path) => pathAt(path, Infinity).total;

function moveToward(e, tx, tz, speed, dt) {
  const dx = tx - e.x,
    dz = tz - e.z,
    d = Math.hypot(dx, dz),
    step = speed * dt;
  if (d <= step || d < 1e-6) {
    e.x = tx;
    e.z = tz;
    return true;
  }
  e.x += (dx / d) * step;
  e.z += (dz / d) * step;
  return false;
}

export const firesOnClock = (e) =>
  ['single', 'pair', 'fast'].includes(ARCHETYPES[e.kind]?.fires) && e.kind !== 'boss';
const isFormation = (e) => e.alive && e.mode === 'formation' && e.group >= 0;

function formationFire(s, e, level) {
  const speed = e.kind === 'dart' ? (level.dartSpeed ?? level.shotSpeed + 1.5) : level.shotSpeed;
  const angle = aimAngle(e.x, e.z, e.aimX);
  // Armor fires a tight pair: a "fat" aimed shot about 1 u across at the ship
  // row. Like every aimed shot it is dodged by the natural sidestep; it never
  // brackets the warned spot (playtest: bracketing punished the sidestep).
  const offsets = e.kind === 'armored' || e.armoredShell ? [-0.035, 0.035] : [0];
  for (const o of offsets)
    fireBullet(s, e.x, e.z + e.radius + 0.2, angle + o, speed, { src: ARCHETYPES[e.kind].label });
  pushEvent(s, 'enemy-shot', { x: e.x, z: e.z, kind: e.kind });
}

/** Global formation fire clock. Only the front-most enemy of each column may be
 * chosen, so armored back rows never fire "through" their neighbors, and the
 * world's bullet budget caps how many formation shots exist at once. */
export function scheduleFormationFire(s, level, dt) {
  s.enemyFireClock -= dt;
  if (s.enemyFireClock > 0) return;
  // Escorts hold fire while a boss's big attack is telegraphed, so the player
  // only has to read one warning at a time.
  if (s.telegraphs.some((t) => t.boss && t.danger)) {
    s.enemyFireClock = 0.3;
    return;
  }
  s.enemyFireClock = level.fireInterval;
  const pending = s.enemies.reduce((n, e) => n + (e.alive && e.charge > 0 && e.kind !== 'boss' ? 1 : 0), 0);
  if (formationShotCount(s) + pending >= level.maxShots) return;
  const front = new Map();
  for (const e of s.enemies) {
    if (!isFormation(e) || !firesOnClock(e)) continue;
    const key = `${e.group}:${e.col}`,
      other = front.get(key);
    if (!other || e.z > other.z) front.set(key, e);
  }
  // A capsid that is already warning or open is never re-picked mid-cycle.
  const eligible = [...front.values()].filter((e) => e.charge <= 0 && (!e.plate || e.plate.state === 'closed'));
  if (!eligible.length) return;
  const shooter = eligible[Math.floor(random(s) * eligible.length)];
  shooter.charge = RULES.warning;
  shooter.aimX = s.ship.x;
  if (shooter.plate) shooter.plate = { state: 'warning', timer: RULES.warning };
  pushEvent(s, 'warning', { x: shooter.x, z: shooter.z, id: shooter.id });
}

/** Divers take turns: at most `maxDivers` in a dive at once, a new dive every
 * 4-6 s. The dive target is the ship's x when the line is drawn; moving off the
 * line during the 0.8 s telegraph plus the dive itself always dodges. */
export function scheduleDives(s, level, dt) {
  s.diveClock -= dt;
  if (s.diveClock > 0) return;
  s.diveClock = 4 + random(s) * 2;
  const divers = s.enemies.filter((e) => e.alive && e.kind === 'diver');
  const active = divers.filter((e) => e.mode !== 'formation' && e.mode !== 'enter').length;
  if (active >= (level.maxDivers || 1)) return;
  const ready = divers.filter(isFormation);
  if (!ready.length) return;
  const e = ready[Math.floor(random(s) * ready.length)];
  e.mode = 'telegraph';
  e.modeTime = 0;
  e.target = clamp(s.ship.x, -8.4, 8.4);
  addTelegraph(s, { kind: 'path', ownerId: e.id, x: e.target, z: RULES.diveZ, danger: true, timer: Infinity });
  pushEvent(s, 'dive-telegraph', { x: e.x, z: e.z, target: e.target });
}

const removeOwned = (s, id) => {
  s.telegraphs = s.telegraphs.filter((t) => t.ownerId !== id);
};

function updateDiver(s, e, level, dt) {
  const speed = RULES.diveSpeed;
  if (e.mode === 'telegraph') {
    [e.x, e.z] = slotPosition(s, e);
    if ((e.modeTime += dt) >= DIVE_TELEGRAPH) {
      e.mode = 'dive';
      e.modeTime = 0;
    }
  } else if (e.mode === 'dive') {
    if (moveToward(e, e.target, RULES.diveZ, speed, dt)) {
      // One straight shot continues the drawn line to the ship row.
      fireBullet(s, e.x, e.z + e.radius + 0.2, 0, level.shotSpeed, { src: 'DIVER' });
      pushEvent(s, 'enemy-shot', { x: e.x, z: e.z, kind: 'diver' });
      removeOwned(s, e.id);
      const rail = e.x < 0 ? -8.6 : 8.6;
      e.waypoints = [
        [rail, RULES.diveZ],
        [rail, -11],
      ];
      e.mode = 'return';
    }
  } else if (e.mode === 'return') {
    const [tx, tz] = e.waypoints[0];
    if (moveToward(e, tx, tz, speed, dt)) e.waypoints.shift();
    if (!e.waypoints.length) e.mode = 'rejoin';
  }
}

/** Plate: closed until chosen -> 0.65 s warning (plate swings open, pink ring)
 * -> one shot -> open and vulnerable for 1.5 s -> closed. */
export const CAPSID_OPEN = 1.5;
function updateCapsid(s, e, level, dt) {
  const p = e.plate;
  if (p.state === 'closed') return;
  p.timer -= dt;
  if (e.charge > 0) e.charge = Math.max(0, e.charge - dt);
  if (p.timer > 0) return;
  if (p.state === 'warning') {
    formationFire(s, e, level);
    p.state = 'open';
    p.timer = CAPSID_OPEN;
    e.charge = 0;
  } else p.state = 'closed';
}

function updateInfector(s, e, dt) {
  if (e.tether) {
    const target = s.enemies.find((t) => t.id === e.tether.targetId);
    e.tether.timer -= dt;
    if (!target || !target.alive) {
      e.tether = null;
      e.tetherClock = 2;
      removeOwned(s, e.id);
    } else if (e.tether.timer <= 0) {
      Object.assign(target, { kind: 'armored', hp: 2, maxHp: 2, radius: ARCHETYPES.armored.radius });
      pushEvent(s, 'infected', { x: target.x, z: target.z, id: target.id });
      e.tether = null;
      e.tetherClock = 4.5;
      removeOwned(s, e.id);
    }
    return;
  }
  if ((e.tetherClock -= dt) > 0) return;
  const claimed = new Set(s.enemies.filter((o) => o.tether).map((o) => o.tether.targetId));
  let best = null,
    bestD = 7;
  for (const t of s.enemies) {
    if (!t.alive || t.kind !== 'spore' || t.mode !== 'formation' || claimed.has(t.id)) continue;
    const d = Math.hypot(t.x - e.x, t.z - e.z);
    if (d < bestD) [best, bestD] = [t, d];
  }
  if (!best) {
    e.tetherClock = 1.5;
    return;
  }
  e.tether = { targetId: best.id, timer: 1.5 };
  addTelegraph(s, { kind: 'tether', ownerId: e.id, targetId: best.id, danger: true, timer: Infinity });
  pushEvent(s, 'tether', { x: e.x, z: e.z, id: e.id, target: best.id });
}

export function spawnCourier(s, direction) {
  // z = -10.7: in front of the back rim so the whole capsule and its icon are
  // visible, still behind the formation's back row (z = -9.2).
  const e = makeEnemy(s, 'courier', direction > 0 ? -10.4 : 10.4, -10.7, {
    courier: true,
    vx: 4.5 * direction,
    age: 0,
    roulette: Math.floor(random(s) * PICKUP_KINDS.length),
  });
  e.rouletteKind = PICKUP_KINDS[e.roulette];
  s.enemies.push(e);
  pushEvent(s, 'courier', { x: e.x, z: e.z });
  return e;
}

export function spawnFlier(s, flight, index) {
  const e = makeEnemy(s, 'flier', 0, 0, { flight, dist: 0, mode: 'flight', noDrop: true, harmless: true });
  e.id = `s${s.wave}-f${flight}-${index}`;
  s.enemies.push(e);
  return e;
}

/** Advances every non-boss actor. Boss parts and orbiting boss minions are
 * positioned by bosses.mjs; this function skips them. */
export function updateEnemies(s, level, dt) {
  for (const e of s.enemies) {
    if (!e.alive || e.kind === 'boss' || e.mode === 'orbit') continue;
    const ox = e.x,
      oz = e.z;
    if (e.kind === 'courier') {
      e.age += dt;
      e.x += e.vx * dt;
      e.rouletteKind = PICKUP_KINDS[(e.roulette + Math.floor(e.age / ROULETTE_PERIOD)) % PICKUP_KINDS.length];
      if (Math.abs(e.x) > 11.2) {
        e.alive = false;
        e.escaped = true;
        pushEvent(s, 'courier-escape', { x: e.x, z: e.z });
      }
      continue;
    } else if (e.mode === 'flight') {
      e.dist += FLIER_SPEED * dt;
      const p = pathAt(level.flights[e.flight].path, e.dist);
      e.x = p.x;
      e.z = p.z;
      if (p.done) {
        e.alive = false;
        e.escaped = true;
      }
    } else if (e.mode === 'enter') {
      e.modeTime += dt;
      const k = Math.min(1, e.modeTime / ENTER_TIME),
        ease = 1 - (1 - k) ** 3;
      const [x, z] = slotPosition(s, e);
      e.x = x;
      e.z = z - (1 - ease) * 7;
      if (k >= 1) e.mode = 'formation';
    } else if (e.mode === 'drift') {
      // Daughters drift apart at +/-3 u/s for 0.6 s, then hold their new slot.
      const g = s.groups[e.group];
      e.modeTime += dt;
      e.x = clamp(e.x + e.driftVx * dt, -8.8, 8.8);
      e.z += (g?.descent ?? 0) * dt;
      if (e.modeTime >= 0.6) {
        e.mode = 'formation';
        adoptSlot(s, e);
      }
    } else if (e.mode === 'rejoin') {
      // Returning divers and freshly spawned boss minions home in on their slot.
      const [tx, tz] = slotPosition(s, e);
      if (moveToward(e, tx, tz, RULES.diveSpeed, dt)) {
        e.mode = 'formation';
        adoptSlot(s, e);
      }
    } else if (e.kind === 'diver' && e.mode !== 'formation') {
      updateDiver(s, e, level, dt);
    } else if (e.mode === 'formation') {
      [e.x, e.z] = slotPosition(s, e);
    }
    e.vx = (e.x - ox) / dt;
    e.vz = (e.z - oz) / dt;
    if (e.mode !== 'formation') continue;
    if (e.kind === 'capsid') updateCapsid(s, e, level, dt);
    else if (e.kind === 'infector') updateInfector(s, e, dt);
    else if (e.charge > 0 && (e.charge -= dt) <= 0) formationFire(s, e, level);
  }
}
