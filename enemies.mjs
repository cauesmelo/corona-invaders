/** Enemy behaviours. Pure: positions, timers, emitters and telegraphs only.
 * Damage, kills and scoring live in model.mjs so every damage source (needles,
 * SOAP, cell pops) follows one rule set.
 *
 * Each archetype owns one job, one bullet family and one personality
 * telegraph (RESEARCH_BULLET_HELL.md 5.3):
 *   WILD TYPE  spikes bristle 0.5 s, then a COUGH stack
 *   SNEEZER    inhales (swells 1.25x) for 0.8 s, then an odd SNEEZE fan
 *   DROPLET    dashed pink path for 0.8 s, dive, lands as a puddle that pops
 *              into a ring 0.8 s later (shoot it first)
 *   HIJACKER   1.5 s pink tether turns a WILD TYPE into a HEAVY CROWN
 *   BLOOM      closed bud (shots spark), opens 0.8 s, fires a ring, 1.5 s open
 *   RNA WORM / AEROSOL PUFF / VESICLE / flights: see their update functions.
 * The formation fires as a "choir": every 1.1-2.1 s, 2-4 front-row members of
 * one archetype fire their family together.
 */
import { RULES, clamp, random, nextId, pushEvent, addTelegraph } from './core.mjs';
import { ARCHETYPES, CODE_KIND, PATHS, attackFor } from './levels.mjs';
import { startPattern, emitterBusy, gateAllows } from './patterns.mjs';
import { spawnBullet } from './bullets.mjs';

const ENTER_TIME = 1.4;
const DIVE_TELEGRAPH = 0.8;
const DIVE_SPEED = 9;
const PUDDLE_TIME = 1.6; // max wait for the gate before a puddle evaporates

export function makeEnemy(s, kind, x, z, extra = {}) {
  const a = ARCHETYPES[kind];
  const hpScale = (s.difficulty === 'easy' ? 0.85 : 1) * ((s.dpsRef ?? RULES.referenceDps) / RULES.referenceDps);
  const hp = Math.max(1, Math.round(a.hp * hpScale));
  return {
    id: `s${s.wave}-${kind}-${nextId(s)}`,
    kind,
    label: a.label,
    x,
    z,
    baseX: x,
    baseZ: z,
    radius: a.radius,
    hp,
    maxHp: hp,
    alive: true,
    row: 0,
    col: 0,
    group: -1,
    mode: 'formation',
    modeTime: 0,
    charge: 0,
    vx: 0,
    vz: 0,
    tier: 0,
    spawnAt: s.waveElapsed,
    ...extra,
  };
}

/** Group definitions become live formation records. RNG-free, so a
 * checkpoint retry rebuilds identical formations. */
export function spawnGroup(s, def, index, { enter = true } = {}) {
  const rows = def.rows;
  const rowGap = def.rowGap ?? 1.9,
    z0 = def.z ?? -11;
  // The formation's front row never descends past z = -4.
  const frontZ = z0 + (rows.length - 1) * rowGap;
  const group = {
    index,
    sway: def.sway ?? 1.1,
    frequency: def.frequency ?? 0.7,
    descent: def.descent ?? 0.2,
    maxDrop: Math.max(0, RULES.formationFrontZ - frontZ),
    spawnAt: s.waveElapsed,
  };
  s.groups.push(group);
  const gi = s.groups.length - 1;
  rows.forEach((line, row) => {
    const cols = line.length;
    [...line].forEach((code, col) => {
      const kind = CODE_KIND[code];
      if (!kind) return;
      const x = (col - (cols - 1) / 2) * (def.spacing ?? 2.3),
        z = z0 + row * rowGap;
      const e = makeEnemy(s, kind, x, z, {
        id: `s${s.wave}-g${index}-${row}-${col}`,
        group: gi,
        row,
        col,
        mode: enter ? 'enter' : 'formation',
        harmless: !!def.harmless,
      });
      if (kind === 'bloom') e.bud = { state: 'closed', timer: 1.5 + ((col * 0.9 + row * 1.7) % 3.2) };
      if (kind === 'hijacker') e.tetherClock = 2.4 + col * 0.4;
      s.enemies.push(e);
      pushEvent(s, 'spawn', { kind, id: e.id, x, z });
    });
  });
  return gi;
}

/** Live formation slot: shared sway plus a slow descent that stops when the
 * front row reaches z = -4. */
export function slotPosition(s, e) {
  const g = s.groups[e.group];
  if (!g) return [e.baseX, e.baseZ];
  const t = s.waveElapsed - g.spawnAt;
  const x = e.baseX + Math.sin(t * g.frequency + e.row * 0.35) * g.sway;
  return [clamp(x, -8.9, 8.9), e.baseZ + Math.min(g.maxDrop, t * g.descent)];
}
function adoptSlot(s, e) {
  const g = s.groups[e.group];
  if (!g) return;
  const t = s.waveElapsed - g.spawnAt;
  e.baseX = e.x - Math.sin(t * g.frequency + e.row * 0.35) * g.sway;
  e.baseZ = e.z - Math.min(g.maxDrop, t * g.descent);
}

const pathLengths = new WeakMap();
export function pathAt(path, distance) {
  let lengths = pathLengths.get(path);
  if (!lengths) {
    lengths = [0];
    for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    pathLengths.set(path, lengths);
  }
  const total = lengths.at(-1);
  if (distance >= total) return { done: true, x: path.at(-1)[0], z: path.at(-1)[1], total, k: 1 };
  let i = 1;
  while (lengths[i] < distance) i++;
  const k = (distance - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1);
  return { done: false, x: path[i - 1][0] + (path[i][0] - path[i - 1][0]) * k, z: path[i - 1][1] + (path[i][1] - path[i - 1][1]) * k, total, k: distance / total };
}
export const pathLength = (path) => pathAt(path, Infinity).total;
export const resolvePath = (path) => (typeof path === 'string' ? PATHS[path] : path);

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

/** Non-boss enemy bullets currently alive (the stage budget). */
export const stageBullets = (s) => s.enemyShots.reduce((n, b) => n + (b.boss ? 0 : 1), 0);
const budgetOk = (s, level, extra = 0) => stageBullets(s) + extra <= (level.maxBullets ?? 60);

/** Start an archetype's attack through the overlap gate and the bullet budget. */
function attack(s, e, level, override) {
  const a = override || attackFor(e.kind, level.world);
  if (!a || e.harmless) return null;
  if (!budgetOk(s, level, 6)) return null;
  return startPattern(s, a.preset, { ownerId: e.id, params: a.params, src: e.label, tier: e.tier, spawnRadius: e.radius * 0.8 });
}

const CHOIR_KINDS = new Set(['mini', 'wild', 'sneezer', 'budder', 'heavy']);
const isFormation = (e) => e.alive && e.mode === 'formation' && e.group >= 0;

/** The formation choir: every interval, 2-4 front-row members of one archetype
 * fire together. Only the front-most enemy of each column may be chosen. */
export function scheduleChoir(s, level, dt) {
  if (!level.choir) return;
  s.choirClock -= dt;
  if (s.choirClock > 0) return;
  const members = s.enemies.filter((e) => isFormation(e) && !e.harmless);
  const total = Math.max(1, s.enemies.filter((e) => e.group >= 0 && e.mode !== 'flight').length);
  const k = 1 - members.length / total;
  const [slow, fast] = level.choir.interval;
  const surging = s.sector.surge > 0;
  s.choirClock = (slow + (fast - slow) * k) * (surging ? 0.5 : 1);
  if (!budgetOk(s, level, 8)) {
    s.choirClock = 0.35;
    return;
  }
  const front = new Map();
  for (const e of members) {
    if (!CHOIR_KINDS.has(e.kind) || e.mutating > 0) continue;
    const key = `${e.group}:${Math.round(e.baseX * 2)}`,
      other = front.get(key);
    if (!other || e.z > other.z) front.set(key, e);
  }
  const ready = [...front.values()].filter((e) => !emitterBusy(s, e.id));
  if (!ready.length) return;
  const kinds = [...new Set(ready.map((e) => e.kind))].sort();
  const kind = kinds[Math.floor(random(s) * kinds.length)];
  if (!gateAllows(s, attackFor(kind, level.world).preset)) {
    s.choirClock = 0.3;
    return;
  }
  const pool = ready.filter((e) => e.kind === kind);
  const [lo, hi] = level.choir.size;
  // Big shooters (sneezer, heavy) sing alone or in pairs (alone in world 1):
  // their fans are wide.
  const cap = kind === 'sneezer' || kind === 'heavy' ? (level.world === 1 ? 1 : 2) : hi;
  let count = Math.min(pool.length, cap + (surging ? 1 : 0), lo + Math.floor(random(s) * (hi - lo + 1)) + (surging ? 1 : 0));
  while (count-- > 0 && pool.length) {
    const e = pool.splice(Math.floor(random(s) * pool.length), 1)[0];
    attack(s, e, level);
  }
}

/** Droplets take turns diving: one at a time in a stage, every 3.5-5 s. */
export function scheduleDives(s, level, dt) {
  s.diveClock -= dt;
  if (s.diveClock > 0) return;
  s.diveClock = 3.5 + random(s) * 1.5;
  const droplets = s.enemies.filter((e) => e.alive && e.kind === 'droplet' && !e.harmless);
  if (droplets.some((e) => e.mode === 'aim' || e.mode === 'dive' || e.mode === 'puddle')) return;
  const ready = droplets.filter(isFormation);
  if (!ready.length) return;
  const e = ready[Math.floor(random(s) * ready.length)];
  e.mode = 'aim';
  e.modeTime = 0;
  // The dive lands 4 u in front of where the syringe was: never on it.
  e.target = [clamp(s.ship.x, -7.8, 7.8), clamp(s.ship.z - 4.5, -2.5, 6.5)];
  e.escapable = true;
  s.sector.spawned++;
  addTelegraph(s, { kind: 'path', ownerId: e.id, x: e.target[0], z: e.target[1], danger: true, timer: Infinity });
  pushEvent(s, 'dive-telegraph', { x: e.x, z: e.z, target: e.target });
}

const removeOwned = (s, id) => {
  s.telegraphs = s.telegraphs.filter((t) => t.ownerId !== id && t.targetId !== id);
};

function escape(s, e) {
  e.alive = false;
  e.escaped = true;
  if (e.escapable) {
    s.sector.escaped++;
    pushEvent(s, 'escape', { x: e.x, z: e.z, kind: e.kind, id: e.id });
  }
  removeOwned(s, e.id);
}

function updateDroplet(s, e, level, dt) {
  e.modeTime += dt;
  if (e.mode === 'aim') {
    [e.x, e.z] = slotPosition(s, e);
    if (e.modeTime >= DIVE_TELEGRAPH) {
      e.mode = 'dive';
      e.modeTime = 0;
    }
  } else if (e.mode === 'dive') {
    if (moveToward(e, e.target[0], e.target[1], DIVE_SPEED, dt)) {
      e.mode = 'puddle';
      e.modeTime = 0;
      removeOwned(s, e.id);
      pushEvent(s, 'land', { x: e.x, z: e.z, id: e.id });
    }
  } else if (e.mode === 'puddle') {
    // The landed droplet wobbles (ring telegraph) and can still be shot.
    if (!e.splash) {
      e.splash = startPattern(s, 'ring', { ownerId: e.id, params: attackFor('droplet', level.world).params, src: e.label, tier: e.tier, spawnRadius: 0.3 });
      if (!e.splash && e.modeTime > PUDDLE_TIME) escape(s, e);
    } else if (e.splash.state !== 'tele') {
      // It splashed: the infection spread (counts toward R0).
      escape(s, e);
      pushEvent(s, 'splash', { x: e.x, z: e.z });
    }
  }
}

function updateHijacker(s, e, dt) {
  if (e.tether) {
    const target = s.enemies.find((t) => t.id === e.tether.targetId);
    e.tether.timer -= dt;
    if (!target || !target.alive) {
      e.tether = null;
      e.tetherClock = 2;
      removeOwned(s, e.id);
    } else if (e.tether.timer <= 0) {
      const a = ARCHETYPES.heavy;
      Object.assign(target, { kind: 'heavy', label: a.label, hp: a.hp, maxHp: a.hp, radius: a.radius, converted: true });
      pushEvent(s, 'infected', { x: target.x, z: target.z, id: target.id });
      e.tether = null;
      e.tetherClock = 5;
      removeOwned(s, e.id);
    }
    return;
  }
  if ((e.tetherClock -= dt) > 0) return;
  const claimed = new Set(s.enemies.filter((o) => o.tether).map((o) => o.tether.targetId));
  let best = null,
    bestD = 7;
  for (const t of s.enemies) {
    if (!t.alive || t.kind !== 'wild' || t.mode !== 'formation' || claimed.has(t.id)) continue;
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

/** Bloom: closed -> opening (0.8 s ring telegraph) -> open 1.5 s -> closed. */
export const BLOOM_OPEN = 1.5;
function updateBloom(s, e, level, dt) {
  const b = e.bud;
  b.timer -= dt;
  if (b.state === 'closed' && b.timer <= 0) {
    if (e.harmless) {
      b.state = 'opening';
      b.timer = 0.8;
    } else if (budgetOk(s, level, 14) && gateAllows(s, 'ring')) {
      const em = attack(s, e, level);
      b.state = 'opening';
      b.timer = em ? em.tele : 0.8;
    } else b.timer = 0.4;
  } else if (b.state === 'opening' && b.timer <= 0) {
    b.state = 'open';
    b.timer = BLOOM_OPEN;
    pushEvent(s, 'bloom-open', { id: e.id, x: e.x, z: e.z });
  } else if (b.state === 'open' && b.timer <= 0) {
    b.state = 'closed';
    b.timer = e.harmless ? 1.6 + ((e.col * 0.7) % 1.2) : 3.4 + random(s) * 1.2;
  }
}

export function spawnFlight(s, def, index) {
  const path = resolvePath(def.path);
  const p = pathAt(path, 0);
  const e = makeEnemy(s, def.kind || 'wild', p.x, p.z, {
    mode: 'flight',
    flightPath: def.path,
    dist: 0,
    speed: def.speed ?? 6.5,
    fire: def.fire && !def.harmless ? { ...def.fire, done: false } : null,
    harmless: !!def.harmless,
    noDrop: !!def.harmless,
    escapable: !def.harmless,
  });
  e.id = `s${s.wave}-f${s.sector.flightCount}-${index}`;
  if (e.escapable) s.sector.spawned++;
  if (def.harmless) s.sector.bonusTotal++;
  s.enemies.push(e);
  pushEvent(s, 'spawn', { kind: e.kind, id: e.id, x: e.x, z: e.z, flight: true });
  return e;
}

export function spawnWorm(s, def, i) {
  const dir = def.dir ?? 1;
  const e = makeEnemy(s, 'worm', -dir * (10.8 + i * 2.6), def.z ?? -9, {
    mode: 'worm',
    dir,
    z0: def.z ?? -9,
    phase: i * 1.3,
    trailClock: 0.4,
    attackClock: 1.4 + i * 0.8,
    escapable: true,
  });
  s.sector.spawned++;
  s.enemies.push(e);
  pushEvent(s, 'spawn', { kind: 'worm', id: e.id, x: e.x, z: e.z });
  return e;
}

export function spawnPuff(s, def) {
  const e = makeEnemy(s, 'puff', def.x, def.z, { mode: 'drift', vx: def.vx ?? 1.2, z0: def.z, attackClock: 1.6, age: 0 });
  s.enemies.push(e);
  pushEvent(s, 'spawn', { kind: 'puff', id: e.id, x: e.x, z: e.z });
  return e;
}

export function spawnVesicle(s, def) {
  const dir = def.dir ?? 1;
  const e = makeEnemy(s, 'vesicle', -dir * 10.8, -11.6, { mode: 'drift', vx: 2.1 * dir, z0: -11.6, age: 0, carry: def.carry || 'mrna', noDrop: true });
  s.enemies.push(e);
  pushEvent(s, 'vesicle', { x: e.x, z: e.z });
  return e;
}

/** MUTATION twist (world 4): every 3.2 s one plain formation member flashes
 * for 0.8 s (hue shift), then upgrades its pattern one tier. */
export function scheduleMutation(s, level, dt) {
  if (level.twist !== 'mutation') return;
  s.mutationClock -= dt;
  if (s.mutationClock > 0) return;
  s.mutationClock = 3.2;
  const pool = s.enemies.filter((e) => isFormation(e) && !e.tier && !e.mutating && ARCHETYPES[e.kind].attack && !e.harmless);
  if (!pool.length) return;
  const e = pool[Math.floor(random(s) * pool.length)];
  e.mutating = 0.8;
  pushEvent(s, 'mutating', { id: e.id, x: e.x, z: e.z });
}

/** Advances every non-boss actor. Boss parts are positioned by bosses.mjs. */
export function updateEnemies(s, level, dt) {
  for (const e of s.enemies) {
    if (!e.alive || e.kind === 'boss' || e.mode === 'minion') continue;
    const ox = e.x,
      oz = e.z;
    if (e.mutating > 0 && (e.mutating -= dt) <= 0) {
      e.mutating = 0;
      e.tier = 1;
      pushEvent(s, 'mutated', { id: e.id, x: e.x, z: e.z });
    }
    if (e.mode === 'flight') {
      e.dist += e.speed * dt;
      const p = pathAt(resolvePath(e.flightPath), e.dist);
      e.x = p.x;
      e.z = p.z;
      if (e.fire && !e.fire.done && p.k >= e.fire.at && Math.abs(e.x) < 8 && e.z > -12) {
        e.fire.done = true;
        attack(s, e, level, { preset: e.fire.preset, params: e.fire.params });
      }
      if (p.done) escape(s, e);
    } else if (e.mode === 'worm') {
      e.modeTime += dt;
      e.x += 4.2 * e.dir * dt;
      e.z = e.z0 + Math.sin(e.modeTime * 2.4 + e.phase) * 1.2;
      // The bead trail hangs behind the worm for 1.5 s (a slow harmless-looking
      // drift that still hurts): it fences the top of the board, never the box.
      if ((e.trailClock -= dt) <= 0 && Math.abs(e.x) < 8.6) {
        e.trailClock = 0.3;
        spawnBullet(s, { x: e.x, z: e.z + 0.3, angle: 0, speed: 0.6, family: 'rna', src: e.label, pattern: 'BEAD TRAIL', life: 1.5, owner: e.id });
      }
      if ((e.attackClock -= dt) <= 0 && Math.abs(e.x) < 7.5) {
        e.attackClock = attack(s, e, level, { preset: 'strand', params: { ...attackFor('worm', level.world).params, aimShip: true } }) ? 3.6 : 0.4;
      }
      if (Math.abs(e.x) > 11.5 && Math.sign(e.x) === e.dir) escape(s, e);
    } else if (e.mode === 'drift') {
      e.age += dt;
      e.x += e.vx * dt;
      e.z = e.z0 + Math.sin(e.age * 0.9) * 0.5;
      if (e.kind === 'puff' && (e.attackClock -= dt) <= 0 && Math.abs(e.x) < 7.5)
        e.attackClock = attack(s, e, level, { preset: 'aerosol', params: { ...attackFor('puff', level.world).params, aimShip: true } }) ? 2.8 : 0.4;
      if (Math.abs(e.x) > 11.5 && Math.sign(e.x) === Math.sign(e.vx)) {
        e.alive = false;
        e.escaped = true;
      }
    } else if (e.mode === 'enter') {
      e.modeTime += dt;
      const k = Math.min(1, e.modeTime / ENTER_TIME),
        ease = 1 - (1 - k) ** 3;
      const [x, z] = slotPosition(s, e);
      e.x = x;
      e.z = z - (1 - ease) * 8;
      if (k >= 1) e.mode = 'formation';
    } else if (e.kind === 'droplet' && e.mode !== 'formation') {
      updateDroplet(s, e, level, dt);
    } else if (e.mode === 'formation') {
      [e.x, e.z] = slotPosition(s, e);
      if (e.kind === 'hijacker') updateHijacker(s, e, dt);
      else if (e.kind === 'bloom') updateBloom(s, e, level, dt);
    }
    if (e.mode !== 'drift') e.vx = (e.x - ox) / dt;
    e.vz = (e.z - oz) / dt;
  }
}

export { adoptSlot };
