/** Renderer-independent Corona Invaders campaign: 3 worlds x 4 sectors plus a
 * CULTURE CHECK bonus. All randomness is the explicit seeded stream in state.
 * No DOM or Three.js imports: tests and the browser run exactly this code.
 */
import { RULES as CORE_RULES, clamp, random, nextId, pushEvent, requestHitstop } from './core.mjs';
import { LEVELS, WORLDS, ARCHETYPES, STAGE_COUNT, getLevel, getWorld } from './levels.mjs';
import {
  PICKUP_KINDS,
  makeEnemy,
  spawnGroup,
  updateEnemies,
  scheduleFormationFire,
  scheduleDives,
  spawnCourier,
  spawnFlier,
  pathLength,
} from './enemies.mjs';
import { createBoss, updateBoss, damageBoss, bossStatus, beginBossStep, enterBossPhase, BOSSES, SCRIPTS } from './bosses.mjs';
import { awardKill, breakChain, tickChain, chainMultiplier } from './scoring.mjs';

export const RULES = Object.freeze({ ...CORE_RULES, maxWaves: STAGE_COUNT });
export { random, chainMultiplier, bossStatus, beginBossStep, enterBossPhase, BOSSES, SCRIPTS, PICKUP_KINDS };
export { LEVELS, WORLDS, ARCHETYPES, STAGE_COUNT, getLevel, getWorld };

const PLAYING = ['playing', 'transition'];
const CELL_HALF_W = 0.275,
  CELL_HALF_D = 0.21;

/** Four membrane bunkers (cell walls) at z = 7.2, x = +/-2 and +/-6, each 4 x 2
 * cells of 1 HP. Enemy shots, enemy contact and boss beams erase cells; the
 * player's own doses pass straight through. */
export function makeMembranes() {
  const cells = [];
  for (const bunker of [-6, -2, 2, 6])
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 4; c++)
        cells.push({
          id: `m${bunker}-${r}-${c}`,
          bunker,
          x: bunker + (c - 1.5) * 0.55,
          z: RULES.membraneZ + (r - 0.5) * 0.42,
        });
  return cells;
}

function membraneAt(s, x, z, r) {
  for (const cell of s.membranes)
    if (Math.abs(x - cell.x) < CELL_HALF_W + r && Math.abs(z - cell.z) < CELL_HALF_D + r) return cell;
  return null;
}
function eraseMembrane(s, cell, source) {
  s.membranes = s.membranes.filter((c) => c !== cell);
  pushEvent(s, 'membrane', { x: cell.x, z: cell.z, id: cell.id, source });
}

/** Builds the stage's actors. RNG-free by design: a checkpoint retry rebuilds
 * the sector first and only then restores the random stream. */
function setupSector(s, stage) {
  const level = getLevel(stage);
  Object.assign(s, {
    wave: stage,
    stageId: stage,
    waveElapsed: 0,
    enemies: [],
    groups: [],
    shots: [],
    enemyShots: [],
    telegraphs: [],
    beams: [],
    bursts: [],
    boss: null,
    breach: false,
    enemyFireClock: 1.5,
    diveClock: 3.5,
    levelShotSpeed: level.shotSpeed,
  });
  s.chain = { count: 0, timer: 0, best: 0 };
  s.membranes = level.membranes ? makeMembranes() : [];
  s.sector = {
    groupIndex: 0,
    heartsLost: 0,
    chainBest: 1,
    guaranteeUsed: false,
    courierSpawned: false,
    flightsSpawned: (level.flights || []).map(() => 0),
    flightsShown: (level.flights || []).map(() => false),
    bonusHits: 0,
    bonusTotal: (level.flights || []).reduce((n, f) => n + f.count, 0),
    assisted: false,
    entryScore: s.score,
  };
  if (level.kind === 'boss') {
    createBoss(s, level);
    if (level.escorts) spawnGroup(s, level.escorts, 0);
  } else if (level.kind === 'sector') spawnGroup(s, level.groups[0], 0);
}

export function createState({ seed = 0x51a7c0de, stage = 1 } = {}) {
  seed = seed >>> 0 || 0x51a7c0de;
  stage = clamp(Math.floor(stage) || 1, 1, STAGE_COUNT);
  const s = {
    phase: 'title',
    paused: false,
    score: 0,
    lives: 3,
    health: 3,
    wave: stage,
    stageId: stage,
    unlockedStage: stage,
    seed,
    rngState: seed,
    elapsed: 0,
    clock: 0,
    waveElapsed: 0,
    kills: 0,
    hits: 0,
    shotsFired: 0,
    projectilesFired: 0,
    damageTaken: 0,
    transition: 0,
    transitionHold: false,
    holdTime: 0,
    pendingHeal: 'one',
    nextShotId: 0,
    dropCooldown: 0,
    dropsSpawned: 0,
    pickupsCaught: 0,
    couriersKilled: 0,
    pickups: [],
    hitstop: 0,
    hitstopLog: [],
    hitstopTotal: 0,
    slowmo: 0,
    fireBuffered: false,
    prevShoot: false,
    failures: 0,
    assist: false,
    lastCause: null,
    medals: {},
    chain: { count: 0, timer: 0, best: 0 },
    ship: {
      x: 0,
      z: RULES.shipZ,
      radius: RULES.shipRadius,
      fireCooldown: 0,
      invulnerable: 0,
      shield: 0,
      shieldCooldown: 0,
      powerups: { rapid: 0, spread: 0, shield: 0 },
    },
    events: [],
  };
  setupSector(s, stage);
  s.checkpoint = makeCheckpoint(s);
  return s;
}
function makeCheckpoint(s) {
  return {
    stage: s.wave,
    score: s.score,
    kills: s.kills,
    hits: s.hits,
    shotsFired: s.shotsFired,
    projectilesFired: s.projectilesFired,
    rngState: s.rngState,
  };
}

export function startGame(s) {
  // A title/menu start is a clean sector entry, never a resume of cleared actors.
  if (s.phase === 'title') selectStage(s, s.wave);
  s.paused = false;
  return s;
}
/** Sector map: freezes the run, keeps unlocks/checkpoint until a dish is chosen. */
export function openMenu(s) {
  s.phase = 'title';
  s.paused = false;
  return s;
}
export function newRun(s, seed = s.seed) {
  const unlocked = s.unlockedStage;
  Object.assign(s, createState({ seed }), { phase: 'playing', unlockedStage: unlocked });
  return s;
}
/** Retry the sector checkpoint: three vials (four with the opt-in assist offered
 * after three failures), the entry score and RNG stream, a fresh chain and fresh
 * membranes. Completed-sector score stays safe. */
export function restartGame(s, { assist = false } = {}) {
  const checkpoint = { ...s.checkpoint },
    { seed, unlockedStage, failures, medals } = s;
  const useAssist = assist && failures >= 3;
  Object.assign(s, createState({ seed, stage: checkpoint.stage }), {
    phase: 'playing',
    unlockedStage,
    failures,
    medals,
    score: checkpoint.score,
    kills: checkpoint.kills,
    hits: checkpoint.hits,
    shotsFired: checkpoint.shotsFired,
    projectilesFired: checkpoint.projectilesFired,
    rngState: checkpoint.rngState,
    checkpoint,
    assist: useAssist,
  });
  s.sector.entryScore = s.score;
  s.sector.assisted = useAssist;
  s.health = s.lives = useAssist ? RULES.maxHealth + 1 : RULES.maxHealth;
  return s;
}
export function selectStage(s, stage) {
  if (!Number.isInteger(stage) || stage < 1 || stage > s.unlockedStage || stage > STAGE_COUNT) return false;
  const { unlockedStage, medals } = s;
  Object.assign(s, createState({ seed: s.seed, stage }), { phase: 'playing', unlockedStage, medals });
  return true;
}
export function togglePause(s) {
  if (PLAYING.includes(s.phase)) s.paused = !s.paused;
}
/** World-clear LAB REPORT waits for a deliberate FIRE press. */
export function confirmReport(s) {
  if (s.phase !== 'transition' || !s.transitionHold || s.holdTime < 0.6) return false;
  s.transitionHold = false;
  return true;
}
export const assistAvailable = (s) => s.failures >= 3;

export function shoot(s) {
  if (s.phase !== 'playing' || s.paused) return false;
  if (s.hitstop > 0) {
    // A tap during a freeze fires as soon as it ends instead of being lost.
    s.fireBuffered = true;
    return false;
  }
  if (s.ship.fireCooldown > 0) return false;
  const angles = s.ship.powerups.spread > 0 ? [-0.18, 0, 0.18] : [0];
  for (const angle of angles)
    s.shots.push({
      id: nextId(s),
      x: s.ship.x,
      z: RULES.shipZ - 1.4,
      vx: Math.sin(angle) * RULES.shotSpeed,
      vz: -Math.cos(angle) * RULES.shotSpeed,
      radius: 0.16,
    });
  s.ship.fireCooldown = s.ship.powerups.rapid > 0 ? RULES.rapidCooldown : RULES.shotCooldown;
  s.fireBuffered = false;
  s.shotsFired++;
  s.projectilesFired += angles.length;
  pushEvent(s, 'shot', { x: s.ship.x, z: RULES.shipZ - 1.4, spread: angles.length > 1 });
  return true;
}
export function activateShield(s) {
  if (s.phase !== 'playing' || s.paused || s.ship.shieldCooldown > 0) return false;
  s.ship.shield = RULES.shieldDuration;
  s.ship.shieldCooldown = RULES.shieldCooldown;
  pushEvent(s, 'shield', { x: s.ship.x, z: s.ship.z });
  return true;
}
const shielded = (s) => s.ship.shield > 0 || s.ship.powerups.shield > 0;

function lose(s, by) {
  s.phase = 'lost';
  s.failures++;
  s.lastCause = { by, at: s.waveElapsed, stage: s.wave, code: getLevel(s.wave).code };
  pushEvent(s, 'lost', { by });
}
function hurt(s, by) {
  if (s.ship.invulnerable > 0 || shielded(s)) return false;
  s.health--;
  s.lives = s.health;
  s.damageTaken++;
  s.sector.heartsLost++;
  s.ship.invulnerable = RULES.hitInvulnerability;
  breakChain(s, 'damage');
  s.lastCause = { by, at: s.waveElapsed, stage: s.wave, code: getLevel(s.wave).code };
  pushEvent(s, 'damage', { x: s.ship.x, z: s.ship.z, by, health: s.health });
  // Clear immediate close threats so one mistake never chains into two hearts.
  s.enemyShots = s.enemyShots.filter((b) => b.z < s.ship.z - 3);
  if (s.health <= 0) lose(s, by);
  return true;
}

function rollKind(s) {
  const roll = random(s);
  let kind = roll < 0.35 ? 'rapid' : roll < 0.6 ? 'spread' : roll < 0.85 ? 'shield' : 'repair';
  if (kind === 'repair' && s.health >= RULES.maxHealth) kind = 'shield';
  return kind;
}
export function spawnPickup(s, kind, x, z, source = 'random') {
  if (kind === 'repair' && s.health >= RULES.maxHealth) kind = 'shield';
  s.pickups.push({ id: nextId(s), kind, x: clamp(x, -8.6, 8.6), z, age: 0, phase: random(s) * Math.PI * 2, radius: 0.48, source });
  s.dropsSpawned++;
  pushEvent(s, 'drop', { kind, x, z, source });
}
/** Random drop: only eligible kills roll (never bosses, daughters, ring or bonus
 * minions), 4% chance, then a 10 s cooldown during which no RNG is consumed. */
export function maybeDrop(s, enemy) {
  if (enemy.kind === 'boss' || enemy.noDrop || enemy.kind === 'daughter' || s.dropCooldown > 0) return false;
  if (random(s) >= RULES.dropChance) return false;
  spawnPickup(s, rollKind(s), enemy.x, enemy.z, 'random');
  s.dropCooldown = RULES.dropCooldown;
  return true;
}
export function collectPickup(s, pickup) {
  if (pickup.kind === 'repair') {
    if (s.health < RULES.maxHealth) s.health++;
    else s.ship.powerups.shield = RULES.shieldPickupDuration;
    s.lives = s.health;
  } else
    s.ship.powerups[pickup.kind] = pickup.kind === 'shield' ? RULES.shieldPickupDuration : RULES.powerupDuration;
  s.pickupsCaught++;
  s.score += 75;
  pickup.dead = true;
  pushEvent(s, 'pickup', { kind: pickup.kind, x: pickup.x, z: pickup.z });
}
function updatePickups(s, dt) {
  for (const p of s.pickups) {
    p.age += dt;
    p.z += RULES.pickupSpeed * dt;
    p.x = clamp(p.x + Math.sin(p.age * 2 + p.phase) * 0.4 * dt, -8.6, 8.6);
    if (Math.abs(p.x - s.ship.x) < p.radius + s.ship.radius && Math.abs(p.z - s.ship.z) < 0.72) collectPickup(s, p);
    if (p.age > 12 || p.z > RULES.front) p.dead = true;
  }
  s.pickups = s.pickups.filter((p) => !p.dead);
}

function spawnDaughters(s, e) {
  for (const side of [-1, 1])
    s.enemies.push(
      makeEnemy(s, 'daughter', clamp(e.x + side * 0.35, -8.8, 8.8), e.z, {
        group: e.group,
        row: e.row,
        col: e.col,
        mode: 'drift',
        driftVx: 3 * side,
        noDrop: true,
        spawnAt: e.spawnAt,
        minion: e.minion,
      }),
    );
  pushEvent(s, 'split', { x: e.x, z: e.z, id: e.id });
}

function killEnemy(s, e, source) {
  e.alive = false;
  const a = ARCHETYPES[e.kind] || {};
  const double = e.kind === 'diver' && (e.mode === 'dive' || e.mode === 'return');
  const { mult, points } = awardKill(s, e.armoredShell ? 225 : a.score, { double });
  pushEvent(s, 'kill', { id: e.id, x: e.x, z: e.z, kind: e.kind, mult, points, source, double, armoredShell: !!e.armoredShell });
  requestHitstop(s, a.hitstop || 0);
  s.telegraphs = s.telegraphs.filter((t) => t.ownerId !== e.id && t.targetId !== e.id);
  if (e.kind === 'splitter') spawnDaughters(s, e);
  if (e.kind === 'burster') s.bursts.push({ id: nextId(s), x: e.x, z: e.z, timer: 0.1, radius: 2.2 });
  if (e.kind === 'infector' && e.tether) {
    s.score += 300;
    pushEvent(s, 'cured', { x: e.x, z: e.z, points: 300 });
  }
  if (e.kind === 'flier') s.sector.bonusHits++;
  if (e.kind === 'courier') {
    s.couriersKilled++;
    spawnPickup(s, e.rouletteKind, e.x, e.z, 'courier');
    return;
  }
  // The first x4 chain in a sector guarantees one capsule from an eligible kill.
  if (mult >= 4 && !s.sector.guaranteeUsed && !e.noDrop && e.kind !== 'daughter') {
    s.sector.guaranteeUsed = true;
    spawnPickup(s, rollKind(s), e.x, e.z, 'chain');
    return;
  }
  maybeDrop(s, e);
}

/** One damage rule for shots and bursts. Bursts never reach this for the ship. */
function damageEnemy(s, e, amount, source) {
  if (e.kind === 'boss') {
    const r = damageBoss(s, e, amount, source);
    if (!r.blocked && source === 'shot') s.hits++;
    return r;
  }
  if (e.kind === 'capsid' && source === 'shot' && e.plate?.state !== 'open') {
    pushEvent(s, 'spark', { x: e.x, z: e.z + e.radius * 0.85, id: e.id });
    return { blocked: true };
  }
  e.hp -= amount;
  if (source === 'shot') s.hits++;
  pushEvent(s, 'hit', { x: e.x, z: e.z, kind: e.kind, id: e.id, hp: e.hp, source });
  if (e.hp <= 0) killEnemy(s, e, source);
  return { blocked: false };
}

function updateBursts(s, level, dt) {
  const ready = [];
  for (const b of s.bursts) if ((b.timer -= dt) <= 0) ready.push(b);
  if (!ready.length) return;
  s.bursts = s.bursts.filter((b) => b.timer > 0);
  for (const b of ready) {
    pushEvent(s, 'burst', { x: b.x, z: b.z, radius: b.radius });
    // Enemies only: no code path from a burst touches the ship, bullets or walls.
    for (const e of s.enemies) {
      if (!e.alive || e.harmless) continue;
      if (Math.hypot(e.x - b.x, e.z - b.z) > b.radius + e.radius * 0.5) continue;
      damageEnemy(s, e, e.kind === 'boss' ? (level.burstBossDamage ?? 1) : 1, 'burst');
    }
  }
}

function updateTelegraphs(s, dt) {
  for (const t of s.telegraphs) t.age += dt;
  s.telegraphs = s.telegraphs.filter((t) => t.age < t.timer);
}
function updateBeams(s, dt) {
  for (const beam of s.beams) {
    beam.timer -= dt;
    // Beams burn through membranes in their lane.
    for (const cell of [...s.membranes]) if (Math.abs(cell.x - beam.x) < beam.width / 2) eraseMembrane(s, cell, 'beam');
    // Forgiving hitbox: only the ship's core (the dot on the barrel) counts, so
    // a beam hits exactly when that dot is inside the visible beam.
    if (Math.abs(s.ship.x - beam.x) < beam.width / 2) hurt(s, `${beam.src} beam`);
  }
  s.beams = s.beams.filter((b) => b.timer > 0);
}

function spawnSectorActors(s, level) {
  if (level.kind === 'sector') {
    const next = level.groups[s.sector.groupIndex + 1];
    if (next) {
      const alive = s.enemies.filter((e) => e.alive && !e.courier).length;
      if (alive <= (next.trigger ?? 0)) {
        s.sector.groupIndex++;
        spawnGroup(s, next, s.sector.groupIndex);
        pushEvent(s, 'group', { index: s.sector.groupIndex });
      }
    }
  }
  if (level.kind === 'bonus')
    level.flights.forEach((f, i) => {
      if (!s.sector.flightsShown[i] && s.waveElapsed >= f.at - 1) {
        s.sector.flightsShown[i] = true;
        s.telegraphs.push({
          id: nextId(s),
          kind: 'flight',
          flight: i,
          age: 0,
          timer: 1 + f.count * 0.25 + pathLength(f.path) / 8,
          danger: false,
        });
      }
      while (s.sector.flightsSpawned[i] < f.count && s.waveElapsed >= f.at + s.sector.flightsSpawned[i] * 0.25)
        spawnFlier(s, i, s.sector.flightsSpawned[i]++);
    });
  // The Courier crosses behind the formation, so in ordinary sectors it waits
  // until the first group has lost 40% of its members: a sniping lane exists.
  const thinned =
    level.kind !== 'sector' ||
    s.sector.groupIndex > 0 ||
    s.enemies.filter((e) => e.alive && !e.courier).length <= Math.ceil(s.enemies.filter((e) => !e.courier).length * 0.6);
  if (level.courierAt != null && !s.sector.courierSpawned && s.waveElapsed >= level.courierAt && thinned) {
    s.sector.courierSpawned = true;
    spawnCourier(s, s.wave % 2 ? 1 : -1);
  }
}

export function medalFor(level, { time, heartsLost, bonusRatio = 0 }) {
  if (level.kind === 'bonus') return bonusRatio >= 0.9 ? 'gold' : bonusRatio >= 0.7 ? 'silver' : 'bronze';
  if (heartsLost === 0 && time <= level.par) return 'gold';
  return heartsLost <= 1 ? 'silver' : 'bronze';
}
export const clearBonus = (level) => (level.kind === 'bonus' ? 1000 : (1000 + 500 * (level.world - 1)) * (level.kind === 'boss' ? 2 : 1));

function sectorCleared(s, level) {
  if (level.kind === 'boss') return s.boss?.state === 'defeated';
  if (level.kind === 'bonus')
    return (
      s.sector.flightsSpawned.every((n, i) => n >= level.flights[i].count) && !s.enemies.some((e) => e.alive && !e.courier)
    );
  return s.sector.groupIndex >= level.groups.length - 1 && !s.enemies.some((e) => e.alive && !e.courier);
}

function finishSector(s, level) {
  const bonusRatio = s.sector.bonusTotal ? s.sector.bonusHits / s.sector.bonusTotal : 0;
  const medal = medalFor(level, { time: s.waveElapsed, heartsLost: s.sector.heartsLost, bonusRatio });
  let bonus = clearBonus(level);
  if (level.kind === 'bonus' && s.sector.bonusHits === s.sector.bonusTotal) bonus += 5000;
  s.score += bonus;
  const result = {
    stage: s.wave,
    code: level.code,
    medal,
    assisted: s.sector.assisted,
    time: s.waveElapsed,
    heartsLost: s.sector.heartsLost,
    chain: s.sector.chainBest,
    bonus,
    sectorScore: s.score - s.sector.entryScore,
    bonusHits: s.sector.bonusHits,
    bonusTotal: s.sector.bonusTotal,
  };
  s.medals[s.wave] = result;
  Object.assign(s, { shots: [], enemyShots: [], telegraphs: [], beams: [], bursts: [], breach: false });
  s.enemies = s.enemies.filter((e) => !e.courier);
  s.failures = 0;
  s.assist = false;
  s.unlockedStage = Math.min(STAGE_COUNT, Math.max(s.unlockedStage, s.wave + 1));
  pushEvent(s, 'wave', { wave: s.wave, ...result, world: level.world, worldEnd: level.worldEnd });
  if (s.wave === STAGE_COUNT) {
    s.phase = 'won';
    pushEvent(s, 'won', { score: s.score });
    return;
  }
  s.phase = 'transition';
  s.transition = RULES.transition;
  // World clear: full heal and a LAB REPORT that waits for FIRE. Otherwise +1 vial.
  s.transitionHold = !!level.worldEnd;
  s.holdTime = 0;
  s.pendingHeal = level.worldEnd ? 'full' : 'one';
  if (level.worldEnd) pushEvent(s, 'report', { world: level.world });
}

function beginNextSector(s) {
  const heal = s.pendingHeal;
  setupSector(s, s.wave + 1);
  s.phase = 'playing';
  s.health =
    heal === 'full' ? Math.max(s.health, RULES.maxHealth) : Math.max(s.health, Math.min(RULES.maxHealth, s.health + 1));
  s.lives = s.health;
  s.ship.invulnerable = 1.4;
  s.checkpoint = makeCheckpoint(s);
  pushEvent(s, 'wave-start', { wave: s.wave, code: getLevel(s.wave).code });
}

function moveShip(s, input, dt) {
  const ship = s.ship;
  if (input.axis) ship.x += clamp(input.axis, -1, 1) * RULES.shipSpeed * dt;
  else if (Number.isFinite(input.targetX))
    ship.x += clamp(input.targetX - ship.x, -RULES.pointerSpeed * dt, RULES.pointerSpeed * dt);
  ship.x = clamp(ship.x, -RULES.halfWidth + 0.75, RULES.halfWidth - 0.75);
  for (const key of ['fireCooldown', 'invulnerable', 'shield', 'shieldCooldown']) ship[key] = Math.max(0, ship[key] - dt);
  for (const key of Object.keys(ship.powerups)) ship.powerups[key] = Math.max(0, ship.powerups[key] - dt);
}

function updateShots(s) {
  for (const shot of s.shots) {
    if (shot.dead) continue;
    if (shot.z < RULES.back || Math.abs(shot.x) > RULES.halfWidth + 0.5) {
      shot.dead = true;
      continue;
    }
    // Player doses pass through membranes: walls protect the player and never
    // punish shooting from cover (playtest feedback).
    for (const e of s.enemies) {
      if (!e.alive || (shot.x - e.x) ** 2 + (shot.z - e.z) ** 2 > (e.radius + shot.radius) ** 2) continue;
      shot.dead = true;
      damageEnemy(s, e, 1, 'shot');
      break;
    }
  }
}
function updateEnemyShots(s, dt) {
  const ship = s.ship;
  for (const shot of s.enemyShots) {
    if (shot.dead) continue;
    shot.x += shot.vx * dt;
    shot.z += shot.vz * dt;
    if (shot.z > RULES.front || shot.z < RULES.back - 2 || Math.abs(shot.x) > RULES.halfWidth + 0.5) {
      shot.dead = true;
      continue;
    }
    const cell = membraneAt(s, shot.x, shot.z, shot.radius);
    if (cell) {
      shot.dead = true;
      eraseMembrane(s, cell, 'enemy');
      continue;
    }
    const d2 = (shot.x - ship.x) ** 2 + (shot.z - ship.z) ** 2;
    if (shielded(s) && d2 < RULES.shieldRadius ** 2) {
      shot.dead = true;
      pushEvent(s, 'blocked', { x: shot.x, z: shot.z });
      continue;
    }
    if (d2 < (ship.radius + shot.radius) ** 2) {
      shot.dead = true;
      hurt(s, `${shot.src} shot`);
      if (s.phase === 'lost') return;
    }
  }
}

/** Contact, wall erosion and the breach rule. A floor "breach line" warns 3 u
 * before the formation reaches the ship row, so the instant loss is never a surprise. */
function contacts(s) {
  const ship = s.ship,
    loseZ = RULES.shipZ - 1;
  s.breach = false;
  for (const e of s.enemies) {
    if (!e.alive || e.kind === 'boss' || e.harmless || e.courier) continue;
    if (e.z + e.radius > RULES.membraneZ - CELL_HALF_D && s.membranes.length)
      for (const cell of [...s.membranes])
        if (Math.abs(e.x - cell.x) < CELL_HALF_W + e.radius && Math.abs(e.z - cell.z) < CELL_HALF_D + e.radius)
          eraseMembrane(s, cell, 'contact');
    if ((ship.x - e.x) ** 2 + (ship.z - e.z) ** 2 < (ship.radius + e.radius) ** 2) {
      if (hurt(s, `${ARCHETYPES[e.kind]?.label ?? 'VIRUS'} contact`) || s.ship.invulnerable > 0) {
        e.alive = false;
        pushEvent(s, 'crash', { x: e.x, z: e.z, kind: e.kind, id: e.id });
      }
      if (s.phase === 'lost') return;
    }
    if (e.mode === 'formation' || e.mode === 'enter') {
      if (e.z + e.radius > loseZ) {
        lose(s, 'BREACH');
        pushEvent(s, 'invasion');
        return;
      }
      if (e.z + e.radius > loseZ - RULES.breachMargin) s.breach = true;
    }
  }
}

function substep(s, dt, input) {
  s.elapsed += dt;
  moveShip(s, input, dt);
  s.dropCooldown = Math.max(0, s.dropCooldown - dt);
  updatePickups(s, dt);
  const shootInput = !!input.shoot;
  if (s.phase === 'transition') {
    if (s.transitionHold) {
      s.holdTime += dt;
      if ((input.confirm || (shootInput && !s.prevShoot)) && s.holdTime >= 0.6) s.transitionHold = false;
    } else if ((s.transition -= dt) <= 0) beginNextSector(s);
    s.prevShoot = shootInput;
    return;
  }
  s.prevShoot = shootInput;
  const level = getLevel(s.wave);
  s.waveElapsed += dt;
  tickChain(s, dt);
  if (shootInput || s.fireBuffered) shoot(s);
  if (input.shield) activateShield(s);
  spawnSectorActors(s, level);
  updateEnemies(s, level, dt);
  updateBoss(s, level, dt);
  if (level.kind !== 'bonus') {
    scheduleFormationFire(s, level, dt);
    scheduleDives(s, level, dt);
  }
  updateTelegraphs(s, dt);
  updateBeams(s, dt);
  if (s.phase !== 'playing') return;
  // Player shots move first so a dose fired this tick can still meet its target.
  for (const shot of s.shots) {
    shot.x += shot.vx * dt;
    shot.z += shot.vz * dt;
  }
  updateShots(s);
  updateBursts(s, level, dt);
  updateEnemyShots(s, dt);
  if (s.phase !== 'playing') return;
  contacts(s);
  if (s.phase !== 'playing') return;
  s.shots = s.shots.filter((b) => !b.dead);
  s.enemyShots = s.enemyShots.filter((b) => !b.dead);
  if (s.hitstop <= 0 || s.boss?.state === 'defeated') if (sectorCleared(s, level)) finishSector(s, level);
}

/** Advance real time. Hitstop consumes real time without simulating anything
 * (input included); boss-death slow motion runs the model at half speed. */
export function update(s, seconds, input = {}) {
  s.events = [];
  if (s.paused || !PLAYING.includes(s.phase) || !Number.isFinite(seconds) || seconds <= 0) return s;
  const elapsed = Math.min(seconds, RULES.maxStep),
    count = Math.max(1, Math.ceil(elapsed / RULES.substep - 1e-9)),
    dt = elapsed / count;
  for (let n = 0; n < count; n++) {
    if (!PLAYING.includes(s.phase)) break;
    s.clock += dt;
    let simDt = dt;
    if (s.hitstop > 0) {
      // Freeze exactly the granted time, then simulate the rest of this substep,
      // so the realized freeze never exceeds the 120 ms budget.
      const freeze = Math.min(s.hitstop, dt);
      s.hitstop = Math.max(0, s.hitstop - freeze);
      s.hitstopTotal += freeze;
      simDt = dt - freeze;
      if (simDt <= 1e-9) continue;
    }
    if (s.slowmo > 0) {
      s.slowmo = Math.max(0, s.slowmo - simDt);
      simDt *= 0.5;
    }
    substep(s, simDt, input);
  }
  return s;
}
export function snapshot(s) {
  return structuredClone(s);
}
