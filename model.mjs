/** Renderer-independent Corona Invaders: a syringe bullet hell against
 * coronavirus variants. The v1.0 run: 4 sectors x 3 stages (two samples and
 * a boss each), four variant bosses and four midbosses. All randomness is the explicit seeded stream in state; no DOM or
 * Three.js imports, so tests and the browser run exactly this code.
 *
 * Player kit (RESEARCH_BULLET_HELL.md 3 and 6): 2D movement in the lower 60%
 * of the board, FOCUS (slow, needle stream), a 0.16 u core hitbox, a 1.0 u
 * graze ring, auto-fire, the SOAP burst (bomb) with a 0.18 s deathbomb window,
 * mRNA power levels 1-4 with antibody options, in-place respawn.
 */
import { RULES as CORE_RULES, DIFFICULTY, diff, clamp, random, nextId, pushEvent, requestHitstop, aimAngle } from './core.mjs';
import { LEVELS, WORLDS, ARCHETYPES, STAGE_COUNT, getLevel, getWorld, POWER_STEPS, powerOf, entryPower, stageDps, stageHp, PROLOGUE, ELITES } from './levels.mjs';
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
import { sweptHit, bulletGap, needleSegment, pointSegDist2, segSegDist2, beamHits, NEEDLE, BODY_RADIUS, INJECT, needleTip } from './hitboxes.mjs';
// Adjuvants (RESEARCH_CARDS.md): the pure draft and modifier set, and the
// behaviours that need the board. With `drafts: false` (the default for
// fixtures) s.kit equals the base rules and every hook below is inert.
import { kitOf, createRun, openDraft, pick, resample, discard, bossCleared, reviveRun, expectedPotency, needleMul, abMul, needlesPerVolley, CARD } from './cards.mjs';
import { tickKit, absorbHit, updateJet, splitNeedle, innateShot, dropAliquot, aimUp, roomFor } from './syringe-kit.mjs';

/** Enemy collider: a circle, or a capsule along x for elongated bodies
 * (RNA WORM, BUDDER). */
const enemyAxis = (e) => [e.x - (e.half || 0), e.z, e.x + (e.half || 0), e.z];
const enemyPointDist = (e, x, z) => Math.sqrt(pointSegDist2(x, z, ...enemyAxis(e)));

export const RULES = Object.freeze({ ...CORE_RULES, maxWaves: STAGE_COUNT });
export { random, chainMultiplier, bossStatus, BOSSES, PRESETS, LIMITS, FAMILIES, DIFFICULTY };
export { LEVELS, WORLDS, ARCHETYPES, STAGE_COUNT, getLevel, getWorld, POWER_STEPS, powerOf, entryPower, stageDps, stageHp, PROLOGUE };

export const PICKUP_KINDS = Object.freeze(['mrna', 'booster', 'mask', 'soap', 'vial']);
const PLAYING = ['playing', 'transition'];

function setPower(ship, level) {
  ship.power = Math.max(1, Math.min(RULES.maxPower, level));
  ship.mrna = POWER_STEPS[ship.power - 1];
}
/** The syringe's modifier set: recomputed when the deck, the mRNA power, the
 * stage or the difficulty changes (autoFire re-checks the power each volley).
 * STANDARD ISSUE (practice and tray starts with drafts on) is the reference
 * syringe: no deck, damage x the stage's expected potency (RESEARCH_CARDS 2.6). */
export function refreshKit(s) {
  const scale = s.drafts && !s.run ? expectedPotency(s.wave, STAGE_COUNT) : 1;
  s.kit = kitOf(s.run?.deck ?? [], { power: s.ship?.power ?? 1, difficulty: s.difficulty, titer: s.run?.titer ?? 0, stage: s.wave, scale });
  return s.kit;
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
    // INJECT: the plunger is loaded when injectReload is 0.
    injectReload: 0,
    injectReloadMax: INJECT.reload,
    // Adjuvant state (inert on the base kit).
    coat: 0,
    coatTimer: 0,
    fever: 0,
    feverCount: 0,
    innateCooldown: 0,
    ringBusy: false,
    jetOn: false,
  };
}

/** Builds the stage's actors. RNG-free: a checkpoint retry rebuilds the
 * sector first and only then restores the random stream. */
function setupSector(s, stage, { card = null } = {}) {
  const level = getLevel(stage);
  // Time-to-kill stays put as power grows: HP scales with the expected DPS
  // (levels.stageDps, the draft's hook).
  s.dpsRef = stageDps(stage, s);
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
    // 1-1 opens with 3 s of silence (RESEARCH_V1.md 2.2).
    choirClock: level.silence ?? 1.6,
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
    // Script state for the running beat (levels.mjs vocabulary).
    verse: 'alternate',
    verseFlip: false,
    tune: null,
    mutation: null,
    dive: null,
    choir: null,
    injections: 0,
    absorbs: 0,
    aliquotUsed: false,
    touch: 0,
    keys: 0,
  };
  s.foam = null;
  refreshKit(s);
  // The coating is full at every sample start (and respawn).
  s.ship.coat = s.kit.coatMax;
  s.ship.coatTimer = 0;
  if (level.kind === 'boss') {
    const b = createBoss(s, level.boss, { world: level.world, startCard: card ?? 0 });
    if (card !== null) b.practiceCard = card;
  }
}

export function createState({ seed = 0x51a7c0de, stage = 1, difficulty = 'normal', drafts = false } = {}) {
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
    injections: 0,
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
    // The run rule (RESEARCH_V1.md 2.1): credits spent on lost runs, the
    // stage the run started at (a 1CC needs 1-1) and the game-speed assist.
    creditsUsed: 0,
    runStart: stage,
    runOver: false,
    gameSpeed: 1,
    speedAssisted: false,
    lastCause: null,
    pendingCause: null,
    medals: {},
    extendsGiven: [],
    chain: { count: 0, timer: 0, best: 0 },
    // Draft hook: off until the ADJUVANT draft fills it (enterDraft).
    drafts: !!drafts,
    draft: null,
    vialBonus: 0,
    events: [],
    // The adjuvant run (cards.mjs): deck, pity, tokens, titer, offer.
    run: drafts ? createRun(seed, { inject: true }) : null,
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
    // The build the stage was entered with: a continue restores it.
    run: s.run ? structuredClone(s.run) : null,
    health: s.health,
    bombs: s.ship?.bombs,
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
  const { unlockedStage, difficulty, gameSpeed } = s;
  Object.assign(s, createState({ seed, difficulty, drafts: s.drafts }), { phase: 'playing', unlockedStage, gameSpeed, speedAssisted: gameSpeed < 1 });
  return s;
}
/** Credits left in the run (Infinity on Easy). */
export const creditsLeft = (s) => diff(s).credits - s.creditsUsed;
/** A one-credit clear: the whole run from 1-1, no credit spent, no
 * practice (RESEARCH_V1.md 2.1, test T12). */
export const oneCredit = (s) => s.runStart === 1 && s.creditsUsed === 0 && !s.practice;
/** ASSIST: game speed 70 / 80 / 90 / 100%, a dt scale applied by the
 * browser's fixed clock (game.js). The model only records that a stage was
 * played assisted (the LAB REPORT says ASSISTED; nothing else changes). */
export const GAME_SPEEDS = Object.freeze([1, 0.9, 0.8, 0.7]);
export function setGameSpeed(s, speed) {
  if (!GAME_SPEEDS.includes(speed)) return false;
  s.gameSpeed = speed;
  if (speed < 1) {
    s.speedAssisted = true;
    if (s.sector) s.sector.speedAssisted = true;
  }
  return true;
}
/** CONTINUE: restart the current stage from its entry snapshot (score,
 * power, RNG, extends; the card draft adds its build). After a lost run the
 * credit is already spent; a manual retry mid-stage spends one (Normal), so a
 * retry is never a free refill. With no credit left the run is over (only
 * NEW RUN or practice). Practice retries are always free. After three
 * failures the loss screen offers +1 VIAL (medal A) or switching to Easy. */
export function restartGame(s, { assist = false, easy = false } = {}) {
  if (!s.practice) {
    if (s.runOver) return false;
    if (s.phase !== 'lost') {
      if (creditsLeft(s) <= 0) return false;
      s.creditsUsed++;
    }
  }
  const checkpoint = { ...s.checkpoint },
    { seed, unlockedStage, failures, medals, practice, creditsUsed, runStart, gameSpeed, speedAssisted } = s;
  const difficulty = easy && failures >= 3 ? 'easy' : s.difficulty;
  const useAssist = assist && failures >= 3;
  Object.assign(s, createState({ seed, stage: checkpoint.stage, difficulty, drafts: s.drafts }), {
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
    creditsUsed,
    runStart,
    gameSpeed,
    speedAssisted,
  });
  setPower(s.ship, checkpoint.power ?? 1);
  // Adjuvants are never lost on death: the entry build comes back.
  s.run = checkpoint.run ? structuredClone(checkpoint.run) : null;
  refreshKit(s);
  s.ship.coat = s.kit.coatMax;
  s.ship.bombs = Math.max(s.ship.bombs, s.kit.bombsPerVial);
  if (practice) setupPractice(s, practice);
  s.rngState = checkpoint.rngState;
  s.sector.entryScore = s.score;
  s.sector.entryPower = s.ship.power;
  s.sector.assisted = useAssist;
  s.sector.speedAssisted = gameSpeed < 1;
  s.health = s.lives = practice ? 1 : s.kit.maxVials + (useAssist ? 1 : 0);
  return s;
}
export function selectStage(s, stage) {
  if (!Number.isInteger(stage) || stage < 1 || stage > s.unlockedStage || stage > STAGE_COUNT) return false;
  const { unlockedStage, medals, difficulty, gameSpeed } = s;
  // A run from the tray starts fresh at that stage (it can only be a 1CC
  // from 1-1).
  Object.assign(s, createState({ seed: s.seed, stage, difficulty, drafts: s.drafts }), { phase: 'playing', unlockedStage, medals, gameSpeed, speedAssisted: gameSpeed < 1 });
  // A sample started from the tray begins with the power the campaign
  // guarantees on arrival, so it is never harder than playing through.
  // With drafts on, a start past 1-1 has no run (builds are a run thing): it
  // plays on STANDARD ISSUE, the reference syringe.
  if (s.drafts && stage > 1) s.run = null;
  setPower(s.ship, entryPower(stage));
  refreshKit(s);
  s.sector.entryPower = s.ship.power;
  s.checkpoint = makeCheckpoint(s);
  return true;
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
  const { unlockedStage, medals, difficulty, seed, gameSpeed } = s;
  Object.assign(s, createState({ seed, stage, difficulty, drafts: s.drafts }), { phase: 'playing', unlockedStage, medals, gameSpeed });
  s.practice = { stage, card, boss: card !== null ? type : null, result: null };
  s.run = null; // practice measures skill on STANDARD ISSUE (A8)
  setPower(s.ship, entryPower(stage));
  refreshKit(s);
  s.sector.entryPower = s.ship.power;
  setupPractice(s, s.practice);
  s.health = s.lives = 1;
  s.checkpoint = makeCheckpoint(s);
  return true;
}
export function togglePause(s) {
  if (PLAYING.includes(s.phase) || s.phase === 'draft') s.paused = !s.paused;
}
export function setDifficulty(s, difficulty) {
  if (DIFFICULTY[difficulty]) s.difficulty = difficulty;
  if (s.ship) refreshKit(s);
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
  // ENTERIC COATING / LNP SHELL: an extra hit charge on this same core test.
  if (absorbHit(s, cause)) return true;
  // Easy's auto-bomb spends one SOAP instead of a vial.
  if (diff(s).autoBomb && ship.bombs > 0 && !s.soapRing) {
    s.pendingCause = cause;
    ship.dying = 1e-6;
    useBomb(s);
    pushEvent(s, 'auto-bomb', { by: cause.by });
    return true;
  }
  // EPIPEN: with 2+ SOAP the pen spends 2 and fires one for you (scored like
  // a deathbomb: the capture is voided and the vial kept).
  const pen = CARD.epipen.fx.cost;
  if (s.kit.epipen && ship.bombs >= pen && !s.soapRing) {
    ship.bombs -= pen - 1;
    s.pendingCause = cause;
    ship.dying = 1e-6;
    useBomb(s);
    pushEvent(s, 'epipen', { by: cause.by, left: ship.bombs });
    return true;
  }
  // REFLEX ARC widens the deathbomb window (kit.deathbomb = diff on a base kit).
  ship.dying = s.kit.deathbomb;
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
  dropAliquot(s, ship.x, ship.z);
  ship.bombs = Math.max(ship.bombs, s.kit.bombsPerVial);
  // A respawn restores one coating charge (ENTERIC's only one; LNP's second
  // re-forms on its timer): two full LNP charges per vial measured 30 hits
  // to game over with the defensive stack, over the 24 ceiling (BALANCE.md).
  if (s.kit.coatMax && ship.coat < 1) {
    ship.coat = 1;
    ship.coatTimer = ship.coat < s.kit.coatMax ? s.kit.coatReform : 0;
  }
  ship.respawn = RULES.respawnTime;
  ship.respawnFrom = { x: ship.x, z: RULES.front - 0.2 };
  ship.respawnTo = { x: clamp(ship.x, -6, 6), z: RULES.shipZ };
  ship.x = ship.respawnFrom.x;
  ship.z = ship.respawnFrom.z;
  ship.invulnerable = RULES.respawnTime + RULES.hitInvulnerability;
  pushEvent(s, 'respawn', { x: ship.x, z: ship.z });
}
/** The last vial is gone. In a run this spends a credit and offers a
 * CONTINUE from the stage's entry; with none left the run is over and the
 * FINAL REPORT follows. Practice just ends. */
function lose(s, cause) {
  s.phase = 'lost';
  s.failures++;
  s.lastCause = cause;
  let credit = false;
  if (!s.practice) {
    if (creditsLeft(s) > 0) {
      s.creditsUsed++;
      credit = true;
    } else {
      s.runOver = true;
      s.finalReport = finalReport(s, false);
    }
  }
  pushEvent(s, 'lost', { by: cause.by, credit, creditsLeft: creditsLeft(s), runOver: s.runOver, code: getLevel(s.wave).code, at: s.waveElapsed });
}
/** FINAL REPORT (RESEARCH_V1.md 5.3): score, the 1CC stamp, credits used,
 * variants sequenced (NEUTRALIZED cards of the four variant bosses, x/19),
 * medals and whether the specimen was contained. The draft adds the build. */
export function finalReport(s, contained) {
  const variantCards = LEVELS.filter((l) => l.kind === 'boss').reduce((n, l) => n + BOSSES[l.boss].cards.length, 0);
  const sequenced = LEVELS.filter((l) => l.kind === 'boss').reduce((n, l) => n + (s.medals[l.id]?.cards || []).filter((c) => c.neutralized).length, 0);
  const medals = { gold: 0, silver: 0, bronze: 0 };
  for (const r of Object.values(s.medals)) if (medals[r.medal] !== undefined) medals[r.medal]++;
  return {
    contained,
    score: s.score,
    oneCredit: contained && oneCredit(s),
    creditsUsed: s.creditsUsed,
    credits: diff(s).credits,
    sequenced,
    variantCards,
    medals,
    reached: getLevel(s.wave).code,
    assisted: s.speedAssisted || Object.values(s.medals).some((r) => r.assisted),
    difficulty: s.difficulty,
    injections: s.injections,
    grazes: s.grazes,
  };
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
  for (const key of ['fireCooldown', 'antibodyCooldown', 'invulnerable', 'injectReload']) ship[key] = Math.max(0, (ship[key] || 0) - dt);
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
  // Adjuvants scale the normal speed only (10.5-12.9 u/s); focus stays 5.0.
  ship.speed = focus ? s.kit.focusSpeed : s.kit.speed;
  let ax = input.axisX ?? input.axis ?? 0,
    az = input.axisZ ?? 0;
  ax = clamp(Number(ax) || 0, -1, 1);
  az = clamp(Number(az) || 0, -1, 1);
  const len = Math.hypot(ax, az);
  // Which device moved the syringe this sample (the draft hides speed cards
  // from touch players: a 1:1 drag makes speed meaningless).
  if (input.drag) s.sector.touch++;
  else if (len > 1e-6 || Number.isFinite(input.targetX)) s.sector.keys++;
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
    const cap = (input.drag ? RULES.dragSpeed : ship.focus ? s.kit.focusSpeed : s.kit.pointerSpeed) * dt;
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
  if (s.kit.power !== ship.power) refreshKit(s);
  const kit = s.kit;
  const booster = ship.powerups.booster > 0 ? RULES.boosterMultiplier : 1;
  // Needle damage: 1 x booster on the base kit; adjuvants add their buckets
  // (capped at +70%), then the titer limit (cards.mjs needleMul).
  const damage = kit.active ? booster * needleMul(kit, { focus: ship.focus, ringBusy: ship.ringBusy, fever: ship.fever > 0 }) : booster;
  // Needles leave the drawn needle tip.
  const muzzle = ship.z - INJECT.reach;
  const pierce = kit.pierce || ship.fever > 0 ? 1 : 0;
  const push = (x, z, angle, dmg = damage, extra = null) => {
    if (kit.active && !roomFor(s)) return false;
    const shot = { id: nextId(s), x, z, vx: Math.sin(angle) * RULES.needleSpeed, vz: -Math.cos(angle) * RULES.needleSpeed, radius: 0.12, damage: dmg };
    if (kit.active) Object.assign(shot, { baseDamage: dmg, pierce, hitIds: [] }, extra);
    s.shots.push(shot);
    return true;
  };
  if (ship.fireCooldown <= 0) {
    const interval = 1 / kit.fireRate;
    ship.fireCooldown += interval;
    if (ship.fireCooldown <= 0) ship.fireCooldown = interval;
    let n = 0;
    if (ship.focus && kit.jet) {
      // JET INJECTOR: the focused needles become the jet (updateJet).
    } else if (ship.focus) {
      const count = needlesPerVolley(kit, true);
      for (let i = 0; i < count; i++) push(ship.x + (i - (count - 1) / 2) * RULES.needleSpacing, muzzle, 0);
      n = count;
    } else {
      // SPRAY at RULES.sprayAngle steps; TWIN BARREL adds the next step (3->5, 5->7).
      const count = needlesPerVolley(kit, false),
        half = (count - 1) / 2;
      for (let k = -half; k <= half; k++) push(ship.x, muzzle, k * RULES.sprayAngle);
      n = count;
    }
    s.shotsFired++;
    s.projectilesFired += n;
    pushEvent(s, 'shot', { x: ship.x, z: muzzle, focus: ship.focus, jet: ship.focus && kit.jet });
  }
  const abPower = kit.abPower ?? ship.power;
  if (abPower >= 2 && ship.antibodyCooldown <= 0) {
    ship.antibodyCooldown = 1 / kit.abRate;
    const offsets = optionOffsets(abPower, ship.focus);
    const abDamage = kit.active ? booster * abMul(kit) : damage;
    const herd = CARD['herd-immunity'].fx;
    for (const [ox, oz] of offsets) {
      const x = ship.x + ox,
        z = ship.z + oz - 0.4;
      // Focused antibodies converge on the needle line 9 u ahead (they sit
      // outside a 0.6 u target's reach at +/-0.75 u), so focus concentrates
      // every needle on one target; unfocused they splay slightly outward.
      // HERD IMMUNITY instead aims each at the nearest virus within 9 u,
      // clamped to +/-60 degrees of straight up the board.
      const aimed = kit.herd ? aimUp(s, x, z, herd.aim, herd.arc) : null;
      push(x, z, aimed ?? (ship.focus ? -Math.atan2(ox, 9) : Math.sign(ox) * 0.05), abDamage, kit.active ? { ab: true, pierce: 0 } : null);
    }
    s.projectilesFired += offsets.length;
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
    if (ship.power !== before) refreshKit(s);
    if (ship.power === before && before === RULES.maxPower) addScore(s, 1000);
    pushEvent(s, 'power', { power: ship.power, mrna: ship.mrna, up: ship.power > before });
  } else if (pickup.kind === 'booster') ship.powerups.booster = RULES.boosterTime;
  else if (pickup.kind === 'mask') ship.powerups.mask = RULES.maskTime;
  else if (pickup.kind === 'soap') ship.bombs = Math.min(s.kit.maxBombs, ship.bombs + 1);
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
      addScore(s, RULES.antigenScore * s.kit.antigenScore * chainMultiplier(s.chain.count));
      // ANTIGEN HARVEST (when INJECT is cut): each token is 0.25 graze.
      if (s.kit.antigenProgress) grazeTowardSoap(s, s.kit.antigenProgress);
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
  // A cure by INJECT scores x2 (RESEARCH_V1.md 5.4).
  const { mult, points } = awardKill(s, (a.score ?? 100) * (source === 'inject' ? 2 : 1));
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
  // OPSONIN TAG: a tagged virus (bosses included) takes +15% from every source.
  if (e.taggedUntil > s.waveElapsed) amount *= 1 + CARD['opsonin-tag'].fx.tag;
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

// ---- INJECT (RESEARCH_V1.md 5.4) -------------------------------------------------
/** The signature verb: when the needle-tip point (hitboxes.INJECT, 0.95 u
 * ahead of the core, r 0.05) enters a virus body while the plunger is loaded:
 *   - popcorn (WILD TYPE, mini, SNEEZER, PUFF, worm, droplet in flight) is
 *     cured at once, whatever its HP;
 *   - elites (HEAVY CROWN, BLOOM even closed, VESICLE) and any boss part in
 *     reach take 10 x stageHp damage, never an instant cure;
 *   - the victim's live bullets become antigen tokens; a cure scores x2 and
 *     pushes the Dose Chain; 60 ms of hitstop (inside the 120 ms cap);
 *   - reload 0.5 s (0.8 s after an elite). Nothing moves the syringe.
 * The tip only touches viruses: no code path from it reaches the core, and
 * the core against a body still costs a vial (updateHazards). The tip enters
 * a body while the core is still >= 0.75 u from it, and the cure lands on the
 * touch step, before contact is tested. */
function updateInject(s) {
  const ship = s.ship;
  if (ship.injectReload > 0 || !canAct(s) || ship.dying > 0) return;
  const [tx, tz] = needleTip(ship);
  let target = null,
    best = 0;
  for (const e of s.enemies) {
    if (!e.alive || e.harmless) continue;
    if (e.kind === 'boss' && bossIntangible(s, e)) continue;
    const gap = enemyPointDist(e, tx, tz) - e.radius - INJECT.r;
    if (gap < best) [best, target] = [gap, e];
  }
  if (target) inject(s, target);
}
function inject(s, e) {
  const ship = s.ship;
  const elite = e.kind === 'boss' || ELITES.has(e.kind);
  // RETRACTABLE NEEDLE reloads 30% faster (kit.injectReload 0.7; 1 otherwise).
  ship.injectReload = ship.injectReloadMax = (elite ? INJECT.reloadElite : INJECT.reload) * s.kit.injectReload;
  s.injections++;
  s.sector.injections++;
  requestHitstop(s, INJECT.hitstop);
  const x = e.x,
    z = e.z,
    kind = e.kind;
  // Bullets the victim already fired are cancelled at the source.
  const cancelled = cancelBullets(s, { reason: 'inject', filter: (b) => b.owner === e.id });
  if (!elite) killEnemy(s, e, 'inject');
  else {
    const amount = INJECT.eliteDamage * hpRatio(s);
    if (e.kind === 'boss') damageBoss(s, e, amount, 'inject');
    else {
      // The needle pierces a closed BLOOM bud.
      e.hp -= amount;
      pushEvent(s, 'hit', { x, z, kind, id: e.id, hp: e.hp, source: 'inject' });
      if (e.hp <= 0) killEnemy(s, e, 'inject');
    }
  }
  pushEvent(s, 'inject', { x, z, kind, id: e.id, elite, cured: !e.alive, cancelled });
}

/** Damage that is defined against base HP (cell pops, SOAP) scales with the
 * same ratio as enemy HP, so "kills popcorn" stays true in every world. */
const hpRatio = (s) => stageHp(1, s.wave ?? 1, s);
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
  ring.cleared = (ring.cleared || 0) + cancelBullets(s, { reason: 'soap', filter: (b) => bulletGap(b, ring.x, ring.z) < ring.r });
  for (const e of s.enemies) {
    if (!e.alive || e.kind === 'boss' || ring.hit.includes(e.id)) continue;
    if (enemyPointDist(e, ring.x, ring.z) > ring.r + e.radius) continue;
    ring.hit.push(e.id);
    damageEnemy(s, e, RULES.bombDamage * hpRatio(s) * s.kit.soapDamage, 'soap');
  }
  // AUTOCLAVE: a SOAP that clears 30+ bullets refunds itself (once).
  if (s.kit.autoclave && !ring.refunded && ring.cleared >= CARD.autoclave.fx.refund) {
    ring.refunded = true;
    s.ship.bombs = Math.min(s.kit.maxBombs, s.ship.bombs + 1);
    pushEvent(s, 'autoclave', { bombs: s.ship.bombs, refund: true });
  }
  if (ring.t >= RULES.bombGrow + 0.15) {
    s.soapRing = null;
    // FOAM: a 5 u disc where the SOAP burst, for 2.5 s (syringe-kit tickKit).
    if (s.kit.foam) s.foam = { x: ring.x, z: ring.z, r: CARD.foam.fx.radius, t: CARD.foam.fx.time, max: CARD.foam.fx.time };
  }
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
      if (shot.hitIds?.includes(e.id)) continue; // a pierce never hits the same virus twice
      const reach = e.radius + NEEDLE.r;
      const d2 = e.half ? segSegDist2(ax, az, bx, bz, ...enemyAxis(e)) : pointSegDist2(e.x, e.z, ax, az, bx, bz);
      if (d2 > reach * reach) continue;
      done = true;
      const r = damageEnemy(s, e, shot.damage ?? 1, 'shot');
      if (shot.hitIds) {
        // OPSONIN TAG: antibody needles tag what they hit for 2 s.
        if (shot.ab && s.kit.tag && !r?.blocked) e.taggedUntil = s.waveElapsed + CARD['opsonin-tag'].fx.tagTime;
        if (!e.alive) splitNeedle(s, shot);
        // HOLLOW BORE / FEVER: through the first virus, 60% on a second
        // (100% with both). A spark (closed bud) stops the needle.
        if (shot.pierce > 0 && !r?.blocked) {
          shot.pierce--;
          shot.hitIds.push(e.id);
          shot.damage = (shot.baseDamage ?? shot.damage) * (s.kit.pierce && s.ship.fever > 0 ? 1 : CARD['hollow-bore'].fx.pierce);
          continue;
        }
      }
      shot.dead = true;
      break;
    }
    if (shot.dead) continue;
    if (done && !shot.hitIds) continue;
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
/** Graze progress toward the next SOAP (CLOSE CALL lowers the threshold;
 * the stock cap is the kit's). */
function grazeTowardSoap(s, amount) {
  const ship = s.ship;
  ship.grazeProgress += amount;
  if (ship.grazeProgress >= s.kit.grazePerBomb) {
    ship.grazeProgress = 0;
    if (ship.bombs < s.kit.maxBombs) {
      ship.bombs++;
      pushEvent(s, 'graze-soap', { bombs: ship.bombs });
    }
  }
}
function updateHazards(s) {
  const ship = s.ship;
  const live = ship.respawn <= 0 && ship.dying <= 0;
  // LIVE CULTURE reads whether any bullet solid is inside the drawn 1.0 u
  // ring this step (the same gap test as grazing, nothing wider).
  ship.ringBusy = false;
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
    if (gap < RULES.grazeRadius) ship.ringBusy = true;
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
      grazeTowardSoap(s, 1);
      pushEvent(s, 'graze', { x: b.x, z: b.z });
      // FEVER: every 40th graze, 5 s of +20% and pierce.
      if (s.kit.fever && ++ship.feverCount >= CARD.fever.fx.every) {
        ship.feverCount = 0;
        ship.fever = CARD.fever.fx.time;
        pushEvent(s, 'fever', { x: ship.x, z: ship.z });
      }
      // INNATE RESPONSE: each graze fires an aimed needle (<= 10/s).
      if (s.kit.innate) innateShot(s);
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
  // A rest starts once at most 3 bullets are still alive.
  if (step.until === 'calm') return s.enemyShots.length <= 3;
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
      // A new grid sings soon after it settles (1.4 s entry), so a rest never
      // becomes a 6 s lull.
      s.choirClock = Math.min(s.choirClock, 1.6);
      for (const code of st.group.rows.join('')) noteSpawn(s, code);
    } else if (st.flight) {
      sec.flights.push({ def: st.flight, spawned: 0, t: 0 });
      sec.flightCount++;
    } else if (st.worms) for (let i = 0; i < st.worms.count; i++) spawnWorm(s, st.worms, i);
    else if (st.puffs) for (const p of st.puffs) spawnPuff(s, p);
    else if (st.vesicle) spawnVesicle(s, st.vesicle);
    else if (st.midboss) createBoss(s, st.midboss, { world: level.world });
    else if (st.verse) sec.verse = st.verse;
    else if (st.tune) sec.tune = Object.keys(st.tune).length ? st.tune : null;
    else if (st.mutation) sec.mutation = st.mutation;
    else if (st.dive) sec.dive = st.dive;
    else if (st.choir) sec.choir = st.choir;
    else if (st.hint) pushEvent(s, 'hint', { id: st.hint });
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
  // An absorb (ENTERIC / LNP) counts as a lost vial for the medal.
  const medal = medalFor(level, { vialsLost: s.sector.vialsLost + (s.sector.absorbs || 0), r0: value, bonusRatio });
  let bonus = clearBonus(level, value);
  if (level.kind === 'bonus' && s.sector.bonusHits === s.sector.bonusTotal) bonus += 5000;
  addScore(s, bonus);
  // The LAB REPORT (RESEARCH_V1.md 5.3): specimen, result, EXPOSURE
  // (grazes), INJECTIONS, R0 with its verdict, doses lost, time, medal and a
  // one-line assessment in the lab voice.
  const world = WORLDS[level.world - 1];
  const result = {
    stage: s.wave,
    code: level.code,
    name: level.name,
    site: world.site,
    zoom: world.zoom,
    medal,
    assisted: s.sector.assisted || !!s.sector.speedAssisted || s.gameSpeed < 1,
    injections: s.sector.injections,
    exposure: s.sector.grazes,
    verdict: value < 1 ? 'CONTAINED' : 'SPREADING',
    assessment: level.kind === 'boss' ? world.assessment : s.sector.vialsLost === 0 ? 'SAMPLE STERILE. NO DOSE LOST.' : `SAMPLE CLEARED. ${s.sector.vialsLost} DOSE${s.sector.vialsLost > 1 ? 'S' : ''} LOST.`,
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
  // SEQUENCING: a non-final boss raises the titer and pays RESAMPLE tokens;
  // the share of its cards NEUTRALIZED lifts the boosted draft's odds.
  if (s.run && level.kind === 'boss' && s.wave !== STAGE_COUNT && s.boss) {
    const capturable = s.boss.cards.filter((c) => c.type !== 'phase').length;
    const share = capturable ? s.boss.results.filter((r) => r.neutralized).length / capturable : 0;
    bossCleared(s.run, share);
    s.run.lastShare = share;
  }
  Object.assign(s, { shots: [], enemyShots: [], telegraphs: [], beams: [], bursts: [], emitters: [], quarantine: null, soapRing: null, foam: null });
  s.enemies = [];
  s.failures = 0;
  s.assist = false;
  s.unlockedStage = Math.min(STAGE_COUNT, Math.max(s.unlockedStage, s.wave + 1));
  pushEvent(s, 'wave', { wave: s.wave, ...result, world: level.world, worldEnd: level.worldEnd });
  if (s.wave === STAGE_COUNT) {
    s.phase = 'won';
    s.finalReport = finalReport(s, true);
    pushEvent(s, 'won', { score: s.score, ...s.finalReport });
    return;
  }
  // LAB REPORT (2.5 s, skippable) after a sample; after a boss the FIELD
  // NOTE waits for a deliberate press. Vials (RESEARCH_V1.md 2.1): a boss
  // clear restores 1, a sample clear none (so defensive picks matter).
  s.phase = 'transition';
  s.transition = RULES.transition;
  s.transitionHold = !!level.worldEnd;
  s.holdTime = 0;
  s.pendingHeal = level.kind === 'boss' ? 'boss' : 'none';
  if (level.worldEnd) pushEvent(s, 'report', { world: level.world, note: WORLDS[level.world - 1].note });
}

/** The draft hook (RESEARCH_V1.md A1, RESEARCH_CARDS.md 2.2): after every
 * cleared stage but the last, the model emits
 * `draft { stage, boss, sequenced, cards, vesicleBonus }`. With `s.drafts`
 * off (until the ADJUVANT draft lands) it continues at once. With it on, the
 * phase becomes 'draft': update() returns early as on pause (presses are
 * dropped) until the UI resolves it with endDraft(s). */
function enterDraft(s) {
  const level = getLevel(s.wave);
  const cards = s.medals[s.wave]?.cards ?? [];
  const draft = { stage: s.wave, code: level.code, boss: level.kind === 'boss', sequenced: cards.filter((c) => c.neutralized).length, cards: cards.length, vesicleBonus: false };
  s.draft = draft;
  // The ADJUVANT offer (cards.mjs): rolled on the run's own stream.
  if (s.drafts && s.run) {
    s.run.input = s.sector.touch > s.sector.keys ? 'touch' : 'keys';
    const offer = openDraft(s.run, draftCtx(s));
    Object.assign(draft, { ids: [...offer.ids], tiers: [...offer.tiers], share: offer.share });
  }
  pushEvent(s, 'draft', draft);
  if (!s.drafts || !s.run) return endDraft(s);
  s.phase = 'draft';
}
export function endDraft(s) {
  if (!s.draft) return false;
  s.draft = null;
  beginNextSector(s);
  return true;
}

// ---- FORMULATE: the adjuvant draft in the hook above (RESEARCH_CARDS §2.2) --
/** Draft context: the next stage's guaranteed power decides antibody
 * eligibility; touch players never see speed cards. */
function draftCtx(s) {
  const level = getLevel(s.wave);
  return {
    power: entryPower(Math.min(STAGE_COUNT, s.wave + 1)),
    difficulty: s.difficulty,
    input: s.run.input,
    stage: s.wave,
    boosted: level.kind === 'boss' && s.wave < STAGE_COUNT,
    share: s.run.lastShare ?? 0.5,
    stageCount: STAGE_COUNT,
  };
}
/** INJECT the adjuvant in slot `index` and begin the next stage. */
export function pickAdjuvant(s, index) {
  if (s.phase !== 'draft' || s.paused || !s.run?.offer) return null;
  const card = pick(s.run, index);
  if (!card) return null;
  refreshKit(s);
  // One-off effects at the moment of the pick.
  if (card.id === 'extra-dose') s.health = Math.min(s.kit.maxVials + (s.vialBonus || 0), s.health + 1);
  if (card.id === 'glass-syringe') s.health = Math.min(s.kit.maxVials + (s.vialBonus || 0), s.health);
  if (card.id === 'lather') s.ship.bombs = Math.min(s.kit.maxBombs, s.ship.bombs + CARD.lather.fx.soapNow);
  s.lives = s.health;
  pushEvent(s, 'adjuvant', { id: card.id, tier: card.tier, stacks: s.run.deck.filter((d) => d.id === card.id).length });
  endDraft(s);
  return card;
}
/** RESAMPLE: spend a token to redraw the offer (same rules). */
export function resampleAdjuvants(s) {
  if (s.phase !== 'draft' || s.paused || !s.run?.offer || s.run.tokens <= 0) return null;
  const offer = resample(s.run, draftCtx(s));
  pushEvent(s, 'resample', { ids: [...offer.ids], tiers: [...offer.tiers], tokens: s.run.tokens });
  return offer;
}
/** DISCARD: take none; +1 SOAP (up to the cap) and +3 incubation. */
export function discardAdjuvants(s) {
  if (s.phase !== 'draft' || s.paused || !s.run || !discard(s.run)) return false;
  s.ship.bombs = Math.min(s.kit.maxBombs, s.ship.bombs + 1);
  pushEvent(s, 'discard', { bombs: s.ship.bombs });
  endDraft(s);
  return true;
}
/** The run as stored (guarded, versioned): at stage entry it is the entry
 * snapshot; mid-draft it holds the open offer, so a reload can neither
 * reroll it nor refund a token. Null outside a run. */
export const RUN_SAVE_VERSION = 1;
export function exportRun(s) {
  if (!s.run || s.practice || !['playing', 'transition', 'draft', 'lost'].includes(s.phase)) return null;
  const draft = s.phase === 'draft';
  const c = s.checkpoint;
  return {
    v: RUN_SAVE_VERSION,
    seed: s.seed,
    difficulty: s.difficulty,
    phase: draft ? 'draft' : 'playing',
    stage: draft ? s.wave : c.stage,
    score: draft ? s.score : c.score,
    kills: draft ? s.kills : c.kills,
    hits: draft ? s.hits : c.hits,
    shotsFired: draft ? s.shotsFired : c.shotsFired,
    projectilesFired: draft ? s.projectilesFired : c.projectilesFired,
    rngState: draft ? s.rngState : c.rngState,
    power: draft ? s.ship.power : c.power,
    health: draft ? s.health : c.health,
    bombs: draft ? s.ship.bombs : c.bombs,
    pendingHeal: s.pendingHeal,
    vialBonus: s.vialBonus || 0,
    extendsGiven: [...(draft ? s.extendsGiven : c.extendsGiven || [])],
    medals: structuredClone(s.medals || {}),
    run: structuredClone(draft ? s.run : c.run),
    // The run rule: credits spent so far and where the run began (a 1CC
    // needs 1-1 and none spent).
    creditsUsed: s.creditsUsed | 0,
    runStart: s.runStart ?? 1,
  };
}
/** RESUME RUN from a stored run. Returns false (and leaves `s` alone) for a
 * missing, foreign or corrupt save; never throws. */
export function resumeRun(s, data) {
  try {
    if (!data || data.v !== RUN_SAVE_VERSION || !Number.isInteger(data.stage) || data.stage < 1 || data.stage > STAGE_COUNT) return false;
    const run = reviveRun(data.run);
    if (!run) return false;
    const num = (x, lo, hi) => Number.isFinite(x) && x >= lo && x <= hi;
    if (!num(data.score, 0, 1e9) || !num(data.power, 1, RULES.maxPower) || !num(data.health, 1, 99) || !num(data.rngState, 1, 0xffffffff)) return false;
    if (data.phase === 'draft' && (!run.offer || data.stage >= STAGE_COUNT)) return false;
    const { unlockedStage } = s;
    const difficulty = DIFFICULTY[data.difficulty] ? data.difficulty : 'normal';
    Object.assign(s, createState({ seed: data.seed >>> 0, stage: data.stage, difficulty, drafts: true }), { unlockedStage: Math.max(unlockedStage || 1, data.stage) });
    Object.assign(s, {
      score: data.score,
      creditsUsed: Math.max(0, Math.min(99, data.creditsUsed | 0)),
      runStart: Number.isInteger(data.runStart) && data.runStart >= 1 && data.runStart <= data.stage ? data.runStart : data.stage,
      kills: data.kills | 0,
      hits: data.hits | 0,
      shotsFired: data.shotsFired | 0,
      projectilesFired: data.projectilesFired | 0,
      extendsGiven: Array.isArray(data.extendsGiven) ? data.extendsGiven.filter((x) => RULES.extends.includes(x)) : [],
      medals: data.medals && typeof data.medals === 'object' ? data.medals : {},
      run,
      pendingHeal: ['boss', 'full', 'none', 'one'].includes(data.pendingHeal) ? data.pendingHeal : 'none',
      vialBonus: num(data.vialBonus, 0, 9) ? data.vialBonus : 0,
    });
    setPower(s.ship, data.power);
    refreshKit(s);
    s.health = s.lives = Math.min(data.health, s.kit.maxVials + 2 + s.vialBonus);
    s.ship.bombs = num(data.bombs, 0, s.kit.maxBombs) ? data.bombs : s.kit.bombsPerVial;
    s.ship.coat = s.kit.coatMax;
    s.rngState = data.rngState >>> 0;
    s.sector.entryScore = s.score;
    s.sector.entryPower = s.ship.power;
    if (data.phase === 'draft') {
      // The stage was cleared: an empty board under the open offer.
      const level = getLevel(s.wave);
      Object.assign(s, { enemies: [], boss: null, emitters: [], enemyShots: [] });
      s.draft = { stage: s.wave, code: level.code, boss: level.kind === 'boss', sequenced: 0, cards: 0, vesicleBonus: false, ids: [...run.offer.ids], tiers: [...run.offer.tiers] };
      s.phase = 'draft';
    } else {
      s.phase = 'playing';
      s.checkpoint = makeCheckpoint(s);
    }
    return true;
  } catch {
    return false;
  }
}

function beginNextSector(s) {
  const heal = s.pendingHeal;
  setupSector(s, s.wave + 1);
  s.phase = 'playing';
  // EXTRA DOSE / GLASS SYRINGE move the cap (kit.maxVials = diff on a base kit).
  const max = s.kit.maxVials + (s.vialBonus || 0);
  if (heal === 'boss') s.health = Math.max(s.health, Math.min(max, s.health + 1));
  else if (heal === 'full') s.health = Math.max(s.health, max);
  s.lives = s.health;
  s.ship.invulnerable = 1.2;
  s.ship.bombs = Math.max(s.ship.bombs, s.kit.bombsPerVial);
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
    s.holdTime += dt;
    if (s.transitionHold) {
      if (s.confirmQueued && s.holdTime >= 0.6) s.transitionHold = false;
    } else if (s.confirmQueued && s.holdTime >= 0.5) s.transition = 0;
    if (!s.transitionHold && (s.transition -= dt) <= 0) {
      s.confirmQueued = false;
      s.bombQueued = false;
      enterDraft(s);
      return;
    }
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
  if (s.kit.active) {
    tickKit(s, dt);
    updateJet(s, dt, { damageEnemy, awardKill });
  }
  updateBursts(s, dt);
  updateSoap(s, dt);
  updateInject(s);
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
