/** Renderer-independent Corona Invaders: a syringe bullet hell against
 * coronavirus variants. Four worlds, 18 samples, four variant bosses and four
 * midbosses. All randomness is the explicit seeded stream in state; no DOM or
 * Three.js imports, so tests and the browser run exactly this code.
 *
 * Player kit (RESEARCH_BULLET_HELL.md 3 and 6): 2D movement in the lower 60%
 * of the board, FOCUS (slow, needle stream), a 0.16 u core hitbox, a 1.0 u
 * graze ring, auto-fire, the SOAP burst (bomb) with a 0.18 s deathbomb window,
 * mRNA power levels 1-4 with antibody options, in-place respawn.
 */
import { RULES as CORE_RULES, DIFFICULTY, diff, clamp, random, nextId, pushEvent, requestHitstop, aimAngle } from './core.mjs';
import { LEVELS, WORLDS, ARCHETYPES, STAGE_COUNT, getLevel, getWorld } from './levels.mjs';
import { FAMILIES, spawnBullet, updateBullets, cancelBullets, normalizeBullet } from './bullets.mjs';
import { updateEmitters, clearEmitters, PRESETS, LIMITS } from './patterns.mjs';
import {
  spawnGroup,
  updateEnemies,
  scheduleChoir,
  scheduleDives,
  scheduleMutation,
  spawnFlight,
  spawnWorm,
  spawnPuff,
  spawnVesicle,
  makeEnemy,
} from './enemies.mjs';
import { BOSSES, createBoss, updateBoss, damageBoss, bombBoss, bossStatus, voidCapture, bossVulnerable, bossIntangible } from './bosses.mjs';
import { awardKill, breakChain, tickChain, chainMultiplier, addScore, r0Of, r0Bonus } from './scoring.mjs';
import { sweptHit, bulletGap, needleSegment, pointSegDist2, segSegDist2, beamHits, NEEDLE, BODY_RADIUS, INJECT } from './hitboxes.mjs';

/** Enemy collider: a circle, or a capsule along x for elongated bodies
 * (RNA WORM, BUDDER). */
const enemyAxis = (e) => [e.x - (e.half || 0), e.z, e.x + (e.half || 0), e.z];
const enemyPointDist = (e, x, z) => Math.sqrt(pointSegDist2(x, z, ...enemyAxis(e)));

export const RULES = Object.freeze({ ...CORE_RULES, maxWaves: STAGE_COUNT });
export { random, chainMultiplier, bossStatus, BOSSES, PRESETS, LIMITS, FAMILIES, DIFFICULTY };
export { LEVELS, WORLDS, ARCHETYPES, STAGE_COUNT, getLevel, getWorld };

export const PICKUP_KINDS = Object.freeze(['mrna', 'booster', 'mask', 'soap', 'vial']);
const PLAYING = ['playing', 'transition'];

/** mRNA strands needed for power levels 1-4. The syringe reaches L2 in world 1,
 * L3 in world 2 and L4 in world 3 through guaranteed supplies alone. */
export const POWER_STEPS = Object.freeze([0, 1, 3, 5]);
export const powerOf = (mrna) => POWER_STEPS.filter((t) => mrna >= t).length;
function setPower(ship, level) {
  ship.power = Math.max(1, Math.min(RULES.maxPower, level));
  ship.mrna = POWER_STEPS[ship.power - 1];
}
function freshShip(s, power = 1) {
  return {
    mrna: POWER_STEPS[power - 1],
    x: 0,
    z: RULES.shipZ,
    radius: RULES.shipRadius,
    focus: false,
    speed: RULES.shipSpeed,
    fireCooldown: 0,
    antibodyCooldown: 0,
    invulnerable: 0,
    respawn: 0,
    dying: 0,
    bombs: diff(s).bombs,
    power,
    grazeProgress: 0,
    powerups: { booster: 0, mask: 0 },
  };
}

/** Builds the stage's actors. RNG-free: a checkpoint retry rebuilds the
 * sector first and only then restores the random stream. */
function setupSector(s, stage, { card = null } = {}) {
  const level = getLevel(stage);
  // Time-to-kill stays put as power grows: HP scales with the guaranteed DPS.
  s.dpsRef = RULES.powerDps[entryPower(stage) - 1];
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
    emitters: [],
    antigens: [],
    boss: null,
    quarantine: null,
    soapRing: null,
    twist: { kind: level.twist, scale: 1, drift: 0, dir: 1, warn: false, stage: 'calm' },
    twistOverride: null,
    bulletCap: level.maxBullets ?? 60,
    stageBullets: 0,
    choirClock: 1.6,
    diveClock: 3,
    mutationClock: 2.5,
    r0: 0,
  });
  s.chain = { count: 0, timer: 0, best: 0 };
  s.sector = {
    step: 0,
    waitT: null,
    flights: [],
    flightCount: 0,
    vialsLost: 0,
    chainBest: 1,
    spawned: 0,
    escaped: 0,
    bonusHits: 0,
    bonusTotal: 0,
    assisted: false,
    entryScore: s.score,
    entryPower: s.ship.power,
    grazes: 0,
    bombs: 0,
    seen: [],
  };
  if (level.kind === 'boss') {
    const b = createBoss(s, level.boss, { world: level.world, startCard: card ?? 0 });
    if (card !== null) b.practiceCard = card;
  }
}

export function createState({ seed = 0x51a7c0de, stage = 1, difficulty = 'normal' } = {}) {
  seed = seed >>> 0 || 0x51a7c0de;
  stage = clamp(Math.floor(stage) || 1, 1, STAGE_COUNT);
  const s = {
    phase: 'title',
    paused: false,
    difficulty: DIFFICULTY[difficulty] ? difficulty : 'normal',
    practice: null,
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
    bombsUsed: 0,
    grazes: 0,
    deathbombs: 0,
    transition: 0,
    transitionHold: false,
    holdTime: 0,
    pendingHeal: 'one',
    nextShotId: 0,
    dropCooldown: 0,
    dropsSpawned: 0,
    pickupsCaught: 0,
    pickups: [],
    hitstop: 0,
    hitstopLog: [],
    hitstopTotal: 0,
    slowmo: 0,
    bombQueued: false,
    prevBomb: false,
    prevConfirm: false,
    failures: 0,
    assist: false,
    lastCause: null,
    pendingCause: null,
    medals: {},
    extendsGiven: [],
    chain: { count: 0, timer: 0, best: 0 },
    events: [],
  };
  s.ship = freshShip(s);
  s.health = s.lives = diff(s).health;
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
    power: s.ship.power,
    extendsGiven: [...s.extendsGiven],
  };
}

export function startGame(s) {
  if (s.phase === 'title') selectStage(s, s.wave);
  s.paused = false;
  return s;
}
/** Specimen tray: freezes the run; unlocks and the checkpoint stay. */
export function openMenu(s) {
  s.phase = 'title';
  s.paused = false;
  return s;
}
export function newRun(s, seed = s.seed) {
  const { unlockedStage, difficulty } = s;
  Object.assign(s, createState({ seed, difficulty }), { phase: 'playing', unlockedStage });
  return s;
}
/** Retry the sample checkpoint: full vials, the entry score, power and RNG
 * stream, fresh actors. After three failures the loss screen offers either
 * +1 VIAL (medal marked A) or switching to Easy. */
export function restartGame(s, { assist = false, easy = false } = {}) {
  const checkpoint = { ...s.checkpoint },
    { seed, unlockedStage, failures, medals, practice } = s;
  const difficulty = easy && failures >= 3 ? 'easy' : s.difficulty;
  const useAssist = assist && failures >= 3;
  Object.assign(s, createState({ seed, stage: checkpoint.stage, difficulty }), {
    phase: 'playing',
    unlockedStage,
    failures,
    medals,
    score: checkpoint.score,
    kills: checkpoint.kills,
    hits: checkpoint.hits,
    shotsFired: checkpoint.shotsFired,
    projectilesFired: checkpoint.projectilesFired,
    extendsGiven: [...(checkpoint.extendsGiven || [])],
    checkpoint,
    assist: useAssist,
    practice: practice ? { ...practice, result: null } : null,
  });
  setPower(s.ship, checkpoint.power ?? 1);
  if (practice) setupPractice(s, practice);
  s.rngState = checkpoint.rngState;
  s.sector.entryScore = s.score;
  s.sector.entryPower = s.ship.power;
  s.sector.assisted = useAssist;
  s.health = s.lives = practice ? 1 : diff(s).health + (useAssist ? 1 : 0);
  return s;
}
export function selectStage(s, stage) {
  if (!Number.isInteger(stage) || stage < 1 || stage > s.unlockedStage || stage > STAGE_COUNT) return false;
  const { unlockedStage, medals, difficulty } = s;
  Object.assign(s, createState({ seed: s.seed, stage, difficulty }), { phase: 'playing', unlockedStage, medals });
  // A sample started from the tray begins with the power the campaign
  // guarantees on arrival, so it is never harder than playing through.
  setPower(s.ship, entryPower(stage));
  s.sector.entryPower = s.ship.power;
  s.checkpoint = makeCheckpoint(s);
  return true;
}
/** PRACTICE (any cleared sample) and the MUTATION LAB (any card already seen):
 * one vial, R restarts at once, nothing unlocks or changes medals. */
/** Guaranteed power on arrival: every VESICLE and midboss mRNA earlier in the
 * campaign, converted through POWER_STEPS. */
export function entryPower(stage) {
  let n = 0;
  for (const level of LEVELS.slice(0, stage - 1)) for (const st of level.script || []) if (st.vesicle || st.midboss) n++;
  return powerOf(n);
}
/** Home stage of a boss or midboss type. */
export function bossHome(type) {
  const level = LEVELS.find((l) => l.boss === type || (l.script || []).some((st) => st.midboss === type));
  return level ? level.id : null;
}
/** Card practice: a boss stage starts at that card; a midboss card is staged
 * alone in its sample (the script is skipped). */
function setupPractice(s, practice) {
  if (practice.card === null || practice.card === undefined) return;
  const level = getLevel(practice.stage);
  const type = practice.boss || level.boss;
  if (level.kind === 'boss' && type === level.boss) return setupSector(s, practice.stage, { card: practice.card });
  setupSector(s, practice.stage);
  s.sector.step = (level.script || []).length;
  const b = createBoss(s, type, { world: level.world, startCard: practice.card });
  b.practiceCard = practice.card;
}
export function startPractice(s, stage, { card = null, boss = null } = {}) {
  if (!Number.isInteger(stage) || stage < 1 || stage > STAGE_COUNT) return false;
  const level = getLevel(stage);
  const type = boss || level.boss;
  if (card !== null && (!type || !BOSSES[type]?.cards[card] || bossHome(type) !== stage)) return false;
  const { unlockedStage, medals, difficulty, seed } = s;
  Object.assign(s, createState({ seed, stage, difficulty }), { phase: 'playing', unlockedStage, medals });
  s.practice = { stage, card, boss: card !== null ? type : null, result: null };
  setPower(s.ship, entryPower(stage));
  s.sector.entryPower = s.ship.power;
  setupPractice(s, s.practice);
  s.health = s.lives = 1;
  s.checkpoint = makeCheckpoint(s);
  return true;
}
export function togglePause(s) {
  if (PLAYING.includes(s.phase)) s.paused = !s.paused;
}
export function setDifficulty(s, difficulty) {
  if (DIFFICULTY[difficulty]) s.difficulty = difficulty;
}
/** World-clear LAB REPORT waits for a deliberate press. */
export function confirmReport(s) {
  if (s.phase !== 'transition' || !s.transitionHold || s.holdTime < 0.6) return false;
  s.transitionHold = false;
  return true;
}
export const assistAvailable = (s) => s.failures >= 3 && !s.practice;

// ---- Player -------------------------------------------------------------------
const canAct = (s) => s.phase === 'playing' && !s.paused && s.ship.respawn <= 0;

/** SOAP burst: a bubble ring grows to 15 u in 0.6 s. Bullets it touches
 * become antigen tokens; enemies take 12 damage; a boss loses 3% of the card
 * and that card can no longer be NEUTRALIZED. 2.0 s of invulnerability. */
export function useBomb(s) {
  const ship = s.ship;
  if (!canAct(s) || ship.bombs <= 0 || s.soapRing) return false;
  ship.bombs--;
  s.bombsUsed++;
  s.sector.bombs++;
  const rescued = ship.dying > 0;
  if (rescued) {
    ship.dying = 0;
    s.pendingCause = null;
    s.deathbombs++;
  }
  ship.invulnerable = Math.max(ship.invulnerable, RULES.bombInvulnerability);
  s.soapRing = { x: ship.x, z: ship.z, r: 0, t: 0, hit: [] };
  s.beams = [];
  voidCapture(s);
  bombBoss(s);
  pushEvent(s, 'bomb', { x: ship.x, z: ship.z, rescued, left: ship.bombs });
  return true;
}

function hurt(s, cause) {
  const ship = s.ship;
  if (ship.invulnerable > 0 || ship.dying > 0 || ship.respawn > 0 || s.phase !== 'playing') return false;
  // Easy's auto-bomb spends one SOAP instead of a vial.
  if (diff(s).autoBomb && ship.bombs > 0 && !s.soapRing) {
    s.pendingCause = cause;
    ship.dying = 1e-6;
    useBomb(s);
    pushEvent(s, 'auto-bomb', { by: cause.by });
    return true;
  }
  ship.dying = diff(s).deathbomb;
  s.pendingCause = cause;
  pushEvent(s, 'hit-core', { x: ship.x, z: ship.z, by: cause.by });
  return true;
}

function causeOf(s, b) {
  const fam = FAMILIES[b.family]?.label ?? 'DROPLET';
  return { by: b.src || 'VIRUS', what: fam, pattern: b.pattern || null, at: s.waveElapsed, stage: s.wave, code: getLevel(s.wave).code };
}

/** The death itself, after the deathbomb window: lose a vial, power -1 (the
 * lost level drops as a catchable mRNA strand for 4 s), every bullet cancels,
 * 0.5 s glide-in, then 2.5 s of invulnerability. */
function die(s) {
  const ship = s.ship,
    cause = s.pendingCause || { by: 'VIRUS', what: 'DROPLET', at: s.waveElapsed, stage: s.wave, code: getLevel(s.wave).code };
  ship.dying = 0;
  s.pendingCause = null;
  s.health--;
  s.lives = s.health;
  s.damageTaken++;
  s.sector.vialsLost++;
  breakChain(s, 'damage');
  voidCapture(s);
  s.lastCause = cause;
  pushEvent(s, 'damage', { x: ship.x, z: ship.z, by: cause.by, health: s.health });
  cancelBullets(s, { reason: 'death', tokens: false });
  s.beams = [];
  if (ship.power > 1) {
    const lost = ship.power;
    setPower(ship, lost - 1);
    spawnPickup(s, 'mrna', ship.x, Math.min(ship.z - 1.5, 9), 'strand');
    Object.assign(s.pickups.at(-1), { life: RULES.strandTime, restore: POWER_STEPS[lost - 1] });
  }
  if (s.health <= 0) return lose(s, cause);
  ship.bombs = Math.max(ship.bombs, diff(s).bombs);
  ship.respawn = RULES.respawnTime;
  ship.respawnFrom = { x: ship.x, z: RULES.front - 0.2 };
  ship.respawnTo = { x: clamp(ship.x, -6, 6), z: RULES.shipZ };
  ship.x = ship.respawnFrom.x;
  ship.z = ship.respawnFrom.z;
  ship.invulnerable = RULES.respawnTime + RULES.hitInvulnerability;
  pushEvent(s, 'respawn', { x: ship.x, z: ship.z });
}
function lose(s, cause) {
  s.phase = 'lost';
  s.failures++;
  s.lastCause = cause;
  pushEvent(s, 'lost', { by: cause.by });
}

/** Where the core may be: the 2D box, narrowed by a QUARANTINE (its soft
 * walls keep the whole core inside). Keyboard, mouse and touch all clamp to
 * this one rectangle. */
export function playBounds(s) {
  const q = s.quarantine;
  if (!q) return { minX: RULES.moveMinX, maxX: RULES.moveMaxX, minZ: RULES.moveMinZ, maxZ: RULES.moveMaxZ };
  const r = RULES.shipRadius;
  return {
    minX: Math.max(RULES.moveMinX, q.x - q.half + r),
    maxX: Math.min(RULES.moveMaxX, q.x + q.half - r),
    minZ: Math.max(RULES.moveMinZ, q.z - q.half + r),
    maxZ: Math.min(RULES.moveMaxZ, q.z + q.half - r),
  };
}

function moveShip(s, input, dt) {
  const ship = s.ship;
  ship.px = ship.x;
  ship.pz = ship.z;
  for (const key of ['fireCooldown', 'antibodyCooldown', 'invulnerable']) ship[key] = Math.max(0, ship[key] - dt);
  for (const key of Object.keys(ship.powerups)) ship.powerups[key] = Math.max(0, ship.powerups[key] - dt);
  if (ship.respawn > 0) {
    ship.respawn = Math.max(0, ship.respawn - dt);
    const k = 1 - ship.respawn / RULES.respawnTime,
      e = 1 - (1 - k) ** 3;
    ship.x = ship.respawnFrom.x + (ship.respawnTo.x - ship.respawnFrom.x) * e;
    ship.z = ship.respawnFrom.z + (ship.respawnTo.z - ship.respawnFrom.z) * e;
    return;
  }
  const bounds = playBounds(s);
  const focus = !!input.focus;
  if (focus !== ship.focus) pushEvent(s, 'focus', { on: focus });
  ship.focus = focus;
  // Instant: the speed of the step is the speed of the held keys (core.mjs).
  ship.speed = focus ? RULES.focusSpeed : RULES.shipSpeed;
  let ax = input.axisX ?? input.axis ?? 0,
    az = input.axisZ ?? 0;
  ax = clamp(Number(ax) || 0, -1, 1);
  az = clamp(Number(az) || 0, -1, 1);
  const len = Math.hypot(ax, az);
  if (len > 1e-6) {
    // Diagonals are normalised: never faster than straight movement.
    const k = Math.min(1, len) / len;
    ship.x += ax * k * ship.speed * dt;
    ship.z += az * k * ship.speed * dt;
  } else if (Number.isFinite(input.targetX) || Number.isFinite(input.targetZ)) {
    // The target is clamped into the box first, so a cursor beyond an edge
    // still slides the syringe along that edge at full speed (it used to
    // spend most of its speed pushing into the edge).
    const tx = clamp(Number.isFinite(input.targetX) ? input.targetX : ship.x, bounds.minX, bounds.maxX),
      tz = clamp(Number.isFinite(input.targetZ) ? input.targetZ : ship.z, bounds.minZ, bounds.maxZ);
    const cap = (input.drag ? RULES.dragSpeed : ship.focus ? RULES.focusSpeed : RULES.pointerSpeed) * dt;
    const dx = tx - ship.x,
      dz = tz - ship.z,
      d = Math.hypot(dx, dz);
    if (d <= cap) [ship.x, ship.z] = [tx, tz];
    else {
      ship.x += (dx / d) * cap;
      ship.z += (dz / d) * cap;
    }
  }
  // Soft walls: the box (and a QUARANTINE) confines, it never damages.
  ship.x = clamp(ship.x, bounds.minX, bounds.maxX);
  ship.z = clamp(ship.z, bounds.minZ, bounds.maxZ);
}

/** Antibody option offsets (u from the core). They tuck in while focused. */
export function optionOffsets(power, focus) {
  if (power < 2) return [];
  // At least 0.3 u clear of the 0.28 u barrel; unfocused they sit outside the
  // 1.0 u graze ring, focused they tuck in (RESEARCH_V1.md 4.2).
  const near = focus ? [[-0.75, 0.35], [0.75, 0.35]] : [[-1.15, 0.45], [1.15, 0.45]];
  if (power < 4) return near;
  const far = focus ? [[-1.0, 0.9], [1.0, 0.9]] : [[-1.9, 1.2], [1.9, 1.2]];
  return [...near, ...far];
}

/** Auto-fire. SPRAY (unfocused): 3 needles at +/-9 degrees, 5 from power 3.
 * NEEDLE (focused): 3-5 parallel needles 0.25 u apart. 1 damage each. */
function autoFire(s) {
  const ship = s.ship;
  if (!canAct(s) || ship.dying > 0) return;
  const damage = ship.powerups.booster > 0 ? RULES.boosterMultiplier : 1;
  // Needles leave the drawn needle tip.
  const muzzle = ship.z - INJECT.reach;
  const push = (x, z, angle) =>
    s.shots.push({ id: nextId(s), x, z, vx: Math.sin(angle) * RULES.needleSpeed, vz: -Math.cos(angle) * RULES.needleSpeed, radius: 0.12, damage });
  if (ship.fireCooldown <= 0) {
    ship.fireCooldown += RULES.fireInterval;
    if (ship.fireCooldown <= 0) ship.fireCooldown = RULES.fireInterval;
    let n = 0;
    if (ship.focus) {
      const count = ship.power >= 4 ? 5 : ship.power >= 3 ? 4 : 3;
      for (let i = 0; i < count; i++) push(ship.x + (i - (count - 1) / 2) * RULES.needleSpacing, muzzle, 0);
      n = count;
    } else {
      const angles = ship.power >= 3 ? [-2, -1, 0, 1, 2] : [-1, 0, 1];
      for (const k of angles) push(ship.x, muzzle, k * RULES.sprayAngle);
      n = angles.length;
    }
    s.shotsFired++;
    s.projectilesFired += n;
    pushEvent(s, 'shot', { x: ship.x, z: muzzle, focus: ship.focus });
  }
  if (ship.power >= 2 && ship.antibodyCooldown <= 0) {
    ship.antibodyCooldown = RULES.antibodyInterval;
    // Focused antibodies converge on the needle line 9 u ahead (they sit
    // outside a 0.6 u target's reach at +/-0.75 u), so focus concentrates
    // every needle on one target; unfocused they splay slightly outward.
    for (const [ox, oz] of optionOffsets(ship.power, ship.focus)) push(ship.x + ox, ship.z + oz - 0.4, ship.focus ? -Math.atan2(ox, 9) : Math.sign(ox) * 0.05);
    s.projectilesFired += optionOffsets(ship.power, ship.focus).length;
  }
}

// ---- Supplies -------------------------------------------------------------------
function rollKind(s) {
  const roll = random(s);
  return roll < 0.4 ? 'booster' : roll < 0.75 ? 'mask' : 'soap';
}
export function spawnPickup(s, kind, x, z, source = 'random') {
  s.pickups.push({ id: nextId(s), kind, x: clamp(x, -8.6, 8.6), z, age: 0, phase: random(s) * Math.PI * 2, radius: 0.5, source });
  s.dropsSpawned++;
  pushEvent(s, 'drop', { kind, x, z, source });
}
/** Random drop: 3% of eligible kills, then a 12 s cooldown during which no
 * RNG is consumed. Bosses, bonus targets and flagged minions never roll. */
export function maybeDrop(s, enemy) {
  if (enemy.kind === 'boss' || enemy.noDrop || enemy.harmless || s.dropCooldown > 0) return false;
  if (random(s) >= RULES.dropChance) return false;
  spawnPickup(s, rollKind(s), enemy.x, enemy.z, 'random');
  s.dropCooldown = RULES.dropCooldown;
  return true;
}
export function collectPickup(s, pickup) {
  const ship = s.ship;
  if (pickup.kind === 'mrna') {
    const before = ship.power;
    ship.mrna = Math.max(ship.mrna + 1, pickup.restore ?? 0);
    ship.power = powerOf(ship.mrna);
    if (ship.power === before && before === RULES.maxPower) addScore(s, 1000);
    pushEvent(s, 'power', { power: ship.power, mrna: ship.mrna, up: ship.power > before });
  } else if (pickup.kind === 'booster') ship.powerups.booster = RULES.boosterTime;
  else if (pickup.kind === 'mask') ship.powerups.mask = RULES.maskTime;
  else if (pickup.kind === 'soap') ship.bombs = Math.min(RULES.maxBombs, ship.bombs + 1);
  else if (pickup.kind === 'vial') s.health = s.lives = s.health + 1;
  s.pickupsCaught++;
  addScore(s, 100);
  pickup.dead = true;
  pushEvent(s, 'pickup', { kind: pickup.kind, x: pickup.x, z: pickup.z });
}
function updatePickups(s, dt) {
  const ship = s.ship;
  for (const p of s.pickups) {
    p.age += dt;
    const dx = ship.x - p.x,
      dz = ship.z - p.z,
      d = Math.hypot(dx, dz);
    if (d < RULES.pickupMagnet && ship.respawn <= 0) {
      // Magnet: amber supplies home in once the syringe is within 3.5 u.
      const v = Math.min(d, 9 * dt);
      p.x += (dx / (d || 1)) * v;
      p.z += (dz / (d || 1)) * v;
    } else {
      p.z += RULES.pickupSpeed * dt;
      p.x = clamp(p.x + Math.sin(p.age * 2 + p.phase) * 0.4 * dt, -8.6, 8.6);
    }
    // Caught when the drawn supply touches the drawn syringe body.
    if (Math.hypot(ship.x - p.x, ship.z - p.z) < p.radius + BODY_RADIUS && ship.respawn <= 0 && s.phase === 'playing') collectPickup(s, p);
    if (p.age > (p.life ?? 14) || p.z > RULES.front) p.dead = true;
  }
  s.pickups = s.pickups.filter((p) => !p.dead);
}
function updateAntigens(s, dt) {
  const ship = s.ship;
  for (const a of s.antigens) {
    a.age += dt;
    const dx = ship.x - a.x,
      dz = ship.z - a.z,
      d = Math.hypot(dx, dz);
    const v = Math.min(d, (6 + a.age * 30) * dt);
    a.x += (dx / (d || 1)) * v;
    a.z += (dz / (d || 1)) * v;
    if (d < 0.6 || a.age > 1.4) {
      a.dead = true;
      addScore(s, RULES.antigenScore * chainMultiplier(s.chain.count));
    }
  }
  if (s.antigens.some((a) => a.dead)) {
    pushEvent(s, 'antigen', { count: s.antigens.filter((a) => a.dead).length });
    s.antigens = s.antigens.filter((a) => !a.dead);
  }
}

// ---- Enemies: damage and kills ---------------------------------------------------
function killEnemy(s, e, source) {
  e.alive = false;
  const a = ARCHETYPES[e.kind] || {};
  const { mult, points } = awardKill(s, a.score ?? 100);
  pushEvent(s, 'kill', { id: e.id, x: e.x, z: e.z, kind: e.kind, mult, points, source, tier: e.tier });
  if (e.kind === 'heavy' || e.kind === 'sneezer') requestHitstop(s, 0.03);
  if (e.kind === 'vesicle') requestHitstop(s, 0.06);
  s.telegraphs = s.telegraphs.filter((t) => t.ownerId !== e.id && t.targetId !== e.id);
  if (e.harmless && s.sector.bonusTotal) s.sector.bonusHits++;
  if (e.kind === 'budder' && !e.harmless)
    for (const side of [-1, 1])
      spawnBullet(s, { x: e.x + side * 0.3, z: e.z + 0.3, angle: side * 0.6, speed: 2.8, family: 'virion', src: 'BUDDER', pattern: 'BUDDING' });
  if (e.kind === 'cell') s.bursts.push({ id: nextId(s), x: e.x, z: e.z, timer: 0.1, radius: 2.2 });
  if (e.kind === 'hijacker' && e.tether) {
    addScore(s, 300);
    pushEvent(s, 'cured', { x: e.x, z: e.z, points: 300 });
  }
  if (e.kind === 'vesicle') return spawnPickup(s, e.carry || 'mrna', e.x, e.z + 0.5, 'vesicle');
  maybeDrop(s, e);
}

/** One damage rule for needles, SOAP and cell pops. */
function damageEnemy(s, e, amount, source) {
  if (e.kind === 'boss') {
    const r = damageBoss(s, e, amount, source);
    if (!r.blocked && source === 'shot') s.hits++;
    return r;
  }
  // A closed BLOOM bud sparks needles away (SOAP dissolves it regardless).
  if (e.kind === 'bloom' && e.bud?.state !== 'open' && source !== 'soap') {
    pushEvent(s, 'spark', { x: e.x, z: e.z + e.radius * 0.8, id: e.id });
    return { blocked: true };
  }
  e.hp -= amount;
  if (source === 'shot') s.hits++;
  pushEvent(s, 'hit', { x: e.x, z: e.z, kind: e.kind, id: e.id, hp: e.hp, source });
  if (e.hp <= 0) killEnemy(s, e, source);
  return { blocked: false };
}

/** Damage that is defined against base HP (cell pops, SOAP) scales with the
 * same ratio as enemy HP, so "kills popcorn" stays true in every world. */
const hpRatio = (s) => (s.dpsRef ?? RULES.referenceDps) / RULES.referenceDps;
function updateBursts(s, dt) {
  const ready = [];
  for (const b of s.bursts) if ((b.timer -= dt) <= 0) ready.push(b);
  if (!ready.length) return;
  s.bursts = s.bursts.filter((b) => b.timer > 0);
  for (const b of ready) {
    pushEvent(s, 'burst', { x: b.x, z: b.z, radius: b.radius });
    // Viruses only: no code path from a pop touches the syringe or bullets.
    for (const e of s.enemies) {
      if (!e.alive || e.harmless || e.kind === 'vesicle') continue;
      if (enemyPointDist(e, b.x, b.z) > b.radius + e.radius) continue;
      damageEnemy(s, e, 6 * hpRatio(s), 'burst');
    }
  }
}

function updateSoap(s, dt) {
  const ring = s.soapRing;
  if (!ring) return;
  ring.t += dt;
  ring.r = RULES.bombRadius * Math.min(1, ring.t / RULES.bombGrow);
  const r2 = ring.r * ring.r;
  void r2;
  // Exactly what the drawn bubble touches: bullet solids and enemy bodies.
  cancelBullets(s, { reason: 'soap', filter: (b) => bulletGap(b, ring.x, ring.z) < ring.r });
  for (const e of s.enemies) {
    if (!e.alive || e.kind === 'boss' || ring.hit.includes(e.id)) continue;
    if (enemyPointDist(e, ring.x, ring.z) > ring.r + e.radius) continue;
    ring.hit.push(e.id);
    damageEnemy(s, e, RULES.bombDamage * hpRatio(s), 'soap');
  }
  if (ring.t >= RULES.bombGrow + 0.15) s.soapRing = null;
}

function updateShots(s, dt) {
  const targets = s.enemies.filter((e) => e.alive && !(e.kind === 'boss' && bossIntangible(s, e)));
  const shootable = s.enemyShots.filter((b) => b.shootable && !b.dead);
  for (const shot of s.shots) {
    shot.x += shot.vx * dt;
    shot.z += shot.vz * dt;
    if (shot.z < RULES.back || Math.abs(shot.x) > RULES.halfWidth + 0.5) {
      shot.dead = true;
      continue;
    }
    // The needle is its drawn streak (tip = position, 0.9 u tail). The tail
    // is longer than a substep's travel (0.28 u), so the test is swept.
    const [ax, az, bx, bz] = needleSegment(shot);
    let done = false;
    for (const e of targets) {
      if (!e.alive) continue;
      const reach = e.radius + NEEDLE.r;
      const d2 = e.half ? segSegDist2(ax, az, bx, bz, ...enemyAxis(e)) : pointSegDist2(e.x, e.z, ax, az, bx, bz);
      if (d2 > reach * reach) continue;
      shot.dead = done = true;
      damageEnemy(s, e, shot.damage ?? 1, 'shot');
      break;
    }
    if (done) continue;
    for (const b of shootable) {
      if (b.dead || pointSegDist2(b.x, b.z, ax, az, bx, bz) > (b.hit + NEEDLE.r) ** 2) continue;
      shot.dead = true;
      b.dead = true;
      awardKill(s, 50);
      pushEvent(s, 'kill', { kind: 'virion-bullet', x: b.x, z: b.z, id: b.id });
      break;
    }
  }
  s.shots = s.shots.filter((b) => !b.dead);
}

/** Bullet vs core and graze. Grazing counts once per bullet; a bullet that
 * hits the core never also grazes. The MASK absorbs droplets, aerosol and
 * spikes in a 120 degree frontal arc (never globs or beams). */
function updateHazards(s) {
  const ship = s.ship;
  const live = ship.respawn <= 0 && ship.dying <= 0;
  const mask = ship.powerups.mask > 0;
  const r = ship.radius;
  const sx0 = ship.px ?? ship.x,
    sz0 = ship.pz ?? ship.z;
  for (const b of s.enemyShots) {
    if (b.dead) continue;
    if (b.life && b.age >= b.life) {
      b.dead = true;
      continue;
    }
    if (!live) continue;
    const dx = b.x - ship.x,
      dz = b.z - ship.z;
    const hit = b.hit ?? b.radius ?? 0.16;
    const far = hit + (b.half || 0) + RULES.grazeRadius + 1;
    if (dx * dx + dz * dz > far * far) continue;
    const gap = bulletGap(b, ship.x, ship.z);
    // MASK: the drawn 120 degree frontal arc absorbs droplets, aerosol and
    // spikes (never globs, RNA or beams).
    if (mask && (b.family === 'droplet' || b.family === 'aerosol' || b.family === 'spike') && gap < RULES.maskRadius && dz < 0 && Math.abs(Math.atan2(dx, -dz)) < RULES.maskArc) {
      b.dead = true;
      pushEvent(s, 'absorbed', { x: b.x, z: b.z });
      continue;
    }
    // Swept: the core's path and the bullet's path over this substep.
    if (sweptHit(b, sx0, sz0, ship.x, ship.z, r)) {
      if (ship.invulnerable > 0) continue;
      b.dead = true;
      hurt(s, causeOf(s, b));
      continue;
    }
    // Graze: the bullet's solid edge entered the drawn 1.0 u ring.
    if (!b.grazed && gap < RULES.grazeRadius) {
      b.grazed = true;
      s.grazes++;
      s.sector.grazes++;
      addScore(s, RULES.grazeScore);
      ship.grazeProgress++;
      if (ship.grazeProgress >= RULES.grazePerBomb) {
        ship.grazeProgress = 0;
        if (ship.bombs < RULES.maxBombs) {
          ship.bombs++;
          pushEvent(s, 'graze-soap', { bombs: ship.bombs });
        }
      }
      pushEvent(s, 'graze', { x: b.x, z: b.z });
    }
  }
  for (const beam of s.beams) {
    // The core hits exactly when its circle overlaps the drawn beam.
    if (live && beamHits(beam, ship.x, ship.z, r))
      hurt(s, { by: beam.src || 'VIRUS', what: 'SNEEZE JET', pattern: beam.pattern || 'SNEEZE JET', at: s.waveElapsed, stage: s.wave, code: getLevel(s.wave).code });
  }
  if (!live) return;
  for (const e of s.enemies) {
    if (!e.alive || e.harmless || e.kind === 'vesicle') continue;
    if (e.kind === 'boss' && bossIntangible(s, e)) continue;
    // Contact: the drawn body (spikes are decorative) against the core.
    if (enemyPointDist(e, ship.x, ship.z) < e.radius + r) hurt(s, { by: e.label || 'VIRUS', what: 'CONTACT', pattern: null, at: s.waveElapsed, stage: s.wave, code: getLevel(s.wave).code });
  }
}
function updateBeams(s, dt) {
  for (const beam of s.beams) beam.timer -= dt;
  s.beams = s.beams.filter((b) => b.timer > 0);
}
function updateTelegraphs(s, dt) {
  for (const t of s.telegraphs) t.age += dt;
  s.telegraphs = s.telegraphs.filter((t) => t.age < t.timer);
}

/** World twists. BREATH (lungs): a 6 s cycle, 1 s warning, inhale x0.6,
 * exhale x1.3. CURRENT (bloodstream): 0.8 u/s sideways drift that flips every
 * 30 s after a 2 s warning. DELTA's BLOOD RUSH doubles it and flips every 6 s. */
function updateTwist(s, level) {
  const kind = s.twistOverride?.kind === 'rush' ? 'rush' : level.twist;
  const tw = s.twist;
  const prev = tw.stage;
  tw.kind = kind;
  tw.scale = 1;
  tw.drift = 0;
  tw.warn = false;
  const t = s.waveElapsed;
  if (kind === 'breath') {
    const c = t % 6;
    tw.stage = c < 1 ? 'warn' : c < 2.5 ? 'inhale' : c < 4 ? 'exhale' : 'calm';
    tw.warn = c < 1;
    tw.scale = tw.stage === 'inhale' ? 0.6 : tw.stage === 'exhale' ? 1.3 : 1;
  } else if (kind === 'current' || kind === 'rush') {
    const period = kind === 'rush' ? 6 : 30,
      speed = kind === 'rush' ? 1.6 : 0.8;
    const n = Math.floor(t / period),
      c = t - n * period;
    tw.dir = n % 2 ? -1 : 1;
    tw.warn = c > period - 2;
    tw.stage = tw.warn ? 'warn' : 'flow';
    tw.drift = speed * tw.dir;
  } else tw.stage = 'calm';
  if (tw.stage !== prev) pushEvent(s, 'twist', { kind, stage: tw.stage, dir: tw.dir });
}

// ---- Stage scripts -------------------------------------------------------------
const hostile = (e) => e.alive && e.kind !== 'vesicle';
function scriptCondition(s, step) {
  if (step.until === 'clear')
    return !s.sector.flights.length && !s.enemies.some(hostile) && (!s.boss || s.boss.state === 'defeated');
  if (step.until === 'thin') return s.enemies.filter((e) => hostile(e) && e.group >= 0).length <= (step.left ?? 0);
  return true;
}
function noteSpawn(s, kind) {
  if (!s.sector.seen.includes(kind)) s.sector.seen.push(kind);
}
function runScript(s, level, dt) {
  const sec = s.sector;
  for (const f of sec.flights) {
    f.t += dt;
    while (f.spawned < f.def.count && f.t >= f.spawned * (f.def.interval ?? 0.3)) spawnFlight(s, f.def, f.spawned++);
  }
  sec.flights = sec.flights.filter((f) => f.spawned < f.def.count);
  const script = level.script || [];
  let waited = false;
  for (let guard = 0; guard < 20 && sec.step < script.length; guard++) {
    const st = script[sec.step];
    if (st.wait !== undefined) {
      if (sec.waitT === null) sec.waitT = st.wait;
      if (!waited) {
        sec.waitT -= dt;
        waited = true;
      }
      if (sec.waitT > 0) return;
      sec.waitT = null;
    } else if (st.until) {
      if (!scriptCondition(s, st)) return;
    } else if (st.group) {
      spawnGroup(s, st.group, s.groups.length);
      for (const code of st.group.rows.join('')) noteSpawn(s, code);
    } else if (st.flight) {
      sec.flights.push({ def: st.flight, spawned: 0, t: 0 });
      sec.flightCount++;
    } else if (st.worms) for (let i = 0; i < st.worms.count; i++) spawnWorm(s, st.worms, i);
    else if (st.puffs) for (const p of st.puffs) spawnPuff(s, p);
    else if (st.vesicle) spawnVesicle(s, st.vesicle);
    else if (st.midboss) createBoss(s, st.midboss, { world: level.world });
    else if (st.surge) {
      sec.surge = st.surge;
      pushEvent(s, 'surge', { seconds: st.surge });
    }
    sec.step++;
  }
}

export function medalFor(level, { vialsLost, r0 = 0, bonusRatio = 0 }) {
  if (level.kind === 'bonus') return bonusRatio >= 0.9 ? 'gold' : bonusRatio >= 0.7 ? 'silver' : 'bronze';
  if (vialsLost === 0 && r0 < 1) return 'gold';
  return vialsLost <= 1 ? 'silver' : 'bronze';
}
export function clearBonus(level, r0value = 0) {
  if (level.kind === 'bonus') return 1000;
  return 1000 * level.world + r0Bonus(r0value, level.world);
}

function sectorCleared(s, level) {
  // Test fixtures (an empty board observing one behaviour) hold the sample open.
  if (s.sector.hold) return false;
  if (level.kind === 'boss') return s.boss?.state === 'defeated';
  const script = level.script || [];
  if (level.timeLimit && s.waveElapsed >= level.timeLimit) {
    // SWAB TEST: unopened buds wither when time is up.
    for (const e of s.enemies) if (e.alive) e.alive = false;
    return true;
  }
  return s.sector.step >= script.length && !s.sector.flights.length && !s.enemies.some(hostile) && (!s.boss || s.boss.state === 'defeated');
}

function finishSector(s, level) {
  if (s.practice) {
    s.practice.result = {
      stage: s.wave,
      code: level.code,
      card: s.practice.card,
      boss: s.practice.boss,
      cardName: s.boss?.practiceDone?.name ?? null,
      neutralized: s.boss?.practiceDone?.neutralized ?? null,
      vialsLost: s.sector.vialsLost,
      time: s.waveElapsed,
      score: s.score - s.sector.entryScore,
    };
    Object.assign(s, { enemyShots: [], emitters: [], beams: [], telegraphs: [] });
    s.phase = 'won';
    pushEvent(s, 'practice-clear', s.practice.result);
    return;
  }
  const value = r0Of(s);
  const bonusRatio = s.sector.bonusTotal ? s.sector.bonusHits / s.sector.bonusTotal : 0;
  const medal = medalFor(level, { vialsLost: s.sector.vialsLost, r0: value, bonusRatio });
  let bonus = clearBonus(level, value);
  if (level.kind === 'bonus' && s.sector.bonusHits === s.sector.bonusTotal) bonus += 5000;
  addScore(s, bonus);
  const result = {
    stage: s.wave,
    code: level.code,
    medal,
    assisted: s.sector.assisted,
    time: s.waveElapsed,
    vialsLost: s.sector.vialsLost,
    heartsLost: s.sector.vialsLost,
    chain: s.sector.chainBest,
    r0: value,
    grazes: s.sector.grazes,
    bonus,
    sectorScore: s.score - s.sector.entryScore,
    bonusHits: s.sector.bonusHits,
    bonusTotal: s.sector.bonusTotal,
    cards: s.boss?.results ?? [],
    difficulty: s.difficulty,
  };
  s.medals[s.wave] = result;
  Object.assign(s, { shots: [], enemyShots: [], telegraphs: [], beams: [], bursts: [], emitters: [], quarantine: null, soapRing: null });
  s.enemies = [];
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
  s.transitionHold = !!level.worldEnd;
  s.holdTime = 0;
  s.pendingHeal = level.worldEnd ? 'full' : 'one';
  if (level.worldEnd) pushEvent(s, 'report', { world: level.world });
}

function beginNextSector(s) {
  const heal = s.pendingHeal;
  setupSector(s, s.wave + 1);
  s.phase = 'playing';
  const max = diff(s).health;
  s.health = heal === 'full' ? Math.max(s.health, max) : Math.max(s.health, Math.min(max, s.health + 1));
  s.lives = s.health;
  s.ship.invulnerable = 1.2;
  s.ship.bombs = Math.max(s.ship.bombs, diff(s).bombs);
  s.checkpoint = makeCheckpoint(s);
  pushEvent(s, 'wave-start', { wave: s.wave, code: getLevel(s.wave).code });
}

function substep(s, dt, input) {
  s.elapsed += dt;
  moveShip(s, input, dt);
  s.dropCooldown = Math.max(0, s.dropCooldown - dt);
  updatePickups(s, dt);
  updateAntigens(s, dt);
  if (s.phase === 'transition') {
    if (s.transitionHold) {
      s.holdTime += dt;
      if (s.confirmQueued && s.holdTime >= 0.6) s.transitionHold = false;
    } else if ((s.transition -= dt) <= 0) beginNextSector(s);
    s.confirmQueued = false;
    // Documented rule: a SOAP press between samples is ignored (it may have
    // been the press that released the LAB REPORT). It never carries into
    // the next sample, even when the transition ends inside this same call.
    s.bombQueued = false;
    return;
  }
  s.confirmQueued = false;
  const level = getLevel(s.wave);
  s.waveElapsed += dt;
  if (s.sector.surge > 0) s.sector.surge = Math.max(0, s.sector.surge - dt);
  tickChain(s, dt);
  if (s.bombQueued) {
    s.bombQueued = false;
    useBomb(s);
  }
  if (s.ship.dying > 0 && (s.ship.dying -= dt) <= 0) {
    die(s);
    if (s.phase !== 'playing') return;
  }
  autoFire(s);
  updateTwist(s, level);
  runScript(s, level, dt);
  updateEnemies(s, level, dt);
  updateBoss(s, level, dt);
  // Midbosses always leave an mRNA supply (a guaranteed power step).
  if (s.boss?.mid && s.boss.state === 'defeated' && !s.boss.dropped) {
    s.boss.dropped = true;
    const at = s.events.findLast?.((e) => e.type === 'boss-defeated') ?? null;
    spawnPickup(s, 'mrna', at?.x ?? 0, (at?.z ?? -8) + 1, 'midboss');
  }
  if (level.kind !== 'bonus') {
    scheduleChoir(s, level, dt);
    scheduleDives(s, level, dt);
    scheduleMutation(s, level, dt);
  }
  updateEmitters(s, dt);
  updateTelegraphs(s, dt);
  updateBullets(s, dt);
  updateShots(s, dt);
  updateBursts(s, dt);
  updateSoap(s, dt);
  updateHazards(s);
  updateBeams(s, dt);
  s.enemyShots = s.enemyShots.filter((b) => !b.dead);
  let stage = 0;
  for (const b of s.enemyShots) if (!b.boss) stage++;
  s.stageBullets = stage;
  s.r0 = r0Of(s);
  if (s.phase !== 'playing') return;
  if (s.hitstop <= 0 || s.boss?.state === 'defeated') if (sectorCleared(s, level)) finishSector(s, level);
}

/** Advance real time. Input fields: axisX/axisZ in [-1, 1] (keyboard; `axis` is
 * accepted as axisX), focus (held), bomb (edge: one SOAP per press),
 * targetX/targetZ (pointer destination, with `drag: true` for touch), confirm
 * (edge: LAB REPORT). Hitstop consumes real time without simulating;
 * boss-death slow motion runs the model at half speed. */
export function update(s, seconds, input = {}) {
  s.events = [];
  const bomb = !!input.bomb,
    confirm = !!(input.confirm || input.shoot);
  if (bomb && !s.prevBomb) s.bombQueued = true;
  if ((confirm && !s.prevConfirm) || (bomb && !s.prevBomb)) s.confirmQueued = true;
  s.prevBomb = bomb;
  s.prevConfirm = confirm;
  if (s.paused || !PLAYING.includes(s.phase)) {
    // A press on the pause or loss screen belongs to that screen: it is
    // dropped here instead of firing a SOAP on the first step after resume.
    // Holding the key through the resume never fires either (prevBomb).
    s.bombQueued = s.confirmQueued = false;
    return s;
  }
  // No time passed: keep any press queued for the next call.
  if (!Number.isFinite(seconds) || seconds <= 0) return s;
  for (const b of s.enemyShots) if (b.hit === undefined) normalizeBullet(b);
  const elapsed = Math.min(seconds, RULES.maxStep),
    count = Math.max(1, Math.ceil(elapsed / RULES.substep - 1e-9)),
    dt = elapsed / count;
  let ran = false;
  for (let n = 0; n < count; n++) {
    if (!PLAYING.includes(s.phase)) break;
    s.clock += dt;
    let simDt = dt;
    if (s.hitstop > 0) {
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
    ran = true;
  }
  // A press that could not act (no stock, mid-respawn) expires once a step
  // has run. While hitstop freezes every substep of a call, the press stays
  // queued, so a SOAP (or a deathbomb) pressed during a freeze still fires
  // on the first step after it (it used to be dropped).
  if (ran) s.bombQueued = false;
  return s;
}
export function snapshot(s) {
  return structuredClone(s);
}

export { bossVulnerable, optionOffsets as antibodyOffsets };
export const shipCanBomb = (s) => s.phase === 'playing' && s.ship.bombs > 0 && !s.soapRing && s.ship.respawn <= 0;
export { makeEnemy, aimAngle };
