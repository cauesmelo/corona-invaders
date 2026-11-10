/** Shared simulation primitives for Corona Invaders (bullet-hell revision).
 * Pure JavaScript: no DOM and no Three.js, so tests and the renderer read the
 * same rules.
 *
 * Units: positions are world units (u) on the X/Z combat plane. +Z points toward
 * the player. Times are seconds, speeds u/s. Angles are radians measured from +Z
 * (straight down the board, toward the player) turning toward +X.
 */
export const RULES = Object.freeze({
  halfWidth: 9.4,
  back: -13.4,
  front: 13.4,
  // The syringe moves in a 2D box covering ~60% of the board. The formation
  // never descends past z = -4, so the top of this box is point-blank range.
  moveMinX: -8.9,
  moveMaxX: 8.9,
  moveMinZ: -3,
  moveMaxZ: 12,
  shipZ: 10.4, // spawn / default row
  // Collision core: radius 0.2 u, drawn as the glowing vaccine chamber at the
  // barrel centre at exactly this radius (9 px across at 960, 6 px at 320; the
  // earlier 0.16 u core needed a larger-than-collider marker on phones).
  // Only this core can be hit; the rest of the syringe never collides.
  shipRadius: 0.2,
  // Graze ring: a bullet passing within 1.0 u of the core (edge to centre)
  // scores once per bullet.
  grazeRadius: 1,
  // 11.5 u/s crosses the 17.8 u box in 1.55 s, slower than the 0.8-1.3 s
  // rubric band, on purpose: at 14 u/s (1.27 s) the 150 ms reactive player
  // lost 2-4x more vials in every world (W1 0.16 -> 0.66, W4 0.69 -> 1.38 per
  // sample) because each committed correction overshot (MOVEMENT_AUDIT.md).
  // A 1 u sidestep still takes 87 ms.
  shipSpeed: 11.5,
  focusSpeed: 5, // 0.43x: fine micro-dodging, still escapes an aimed stream
  // No inertia and no speed blend: start, stop and the focus switch all take
  // effect on the step of the press. A 60 ms blend used to carry the syringe
  // 0.47 u (instead of 0.30 u) in the first 60 ms of focus, nearly one core
  // radius of overshoot exactly when the player slows down to thread a gap
  // (MOVEMENT_AUDIT.md), and made positions depend on the substep size.
  pointerSpeed: 11.5, // mouse: follow the cursor's board point at normal speed
  dragSpeed: 30, // touch: finger travel maps 1:1, capped at 30 u/s
  bulletY: 0.55, // every bullet, the hitbox dot and collision share one plane
  // Auto-fire: 8 volleys/s. Thin needles keep the stream calm (the user asked
  // for a lower fire rate earlier, so the player never floods the screen).
  fireInterval: 0.125,
  needleSpeed: 34,
  // SPRAY step: 4.25 degrees. Power 1-2 fire 3 needles (+/-4.25), power 3+
  // fire 5 (+/-8.5 degrees: 3.1 u of coverage at 10 u for clearing popcorn,
  // RESEARCH_V1.md 3.8). The +/-4.25 pair still lands on a boss 17.6 u away
  // (1.31 u off the axis, inside r >= 1.45); a +/-9 degree pair at power 1
  // missed bosses and cards ended on the timer (playtest).
  sprayAngle: (4.25 * Math.PI) / 180,
  needleSpacing: 0.25,
  antibodyInterval: 0.25, // each antibody option fires 4 needles/s
  maxPower: 4,
  // SOAP burst (the bomb). Soap really breaks the lipid envelope of a
  // coronavirus, so the bomb is a soap bubble ring.
  bombsPerVial: 2,
  maxBombs: 5,
  bombRadius: 15,
  bombGrow: 0.6,
  bombDamage: 12, // kills popcorn outright
  bombBossFraction: 0.03, // 3% of the current card's HP
  bombInvulnerability: 2,
  deathbomb: 0.18, // a SOAP press this soon after a hit cancels the death
  grazeScore: 10,
  grazePerBomb: 100,
  antigenScore: 20,
  hitInvulnerability: 2.5,
  respawnTime: 0.5, // glide-in from the bottom edge; death-to-control ~0.5 s
  spawnExclusion: 2.5, // no bullet spawns this close to the core
  maxBullets: 600,
  maxHealth: 3,
  // Supplies: 3% of eligible kills with a 12 s cooldown (the user asked for
  // rare random power-ups); mRNA is guaranteed from VESICLEs and midbosses.
  dropChance: 0.03,
  dropCooldown: 12,
  pickupSpeed: 2.6,
  pickupMagnet: 3.5,
  boosterTime: 8,
  boosterMultiplier: 1.5,
  maskTime: 10,
  maskArc: (60 * Math.PI) / 180, // half-angle of the 120 degree frontal arc
  maskRadius: 1.25,
  strandTime: 4, // the mRNA strand a death drops can be caught for 4 s
  chainWindow: 2,
  bossChainRefresh: 0.6,
  chainTiers: Object.freeze([5, 10, 16, 24, 32]),
  extends: Object.freeze([250000, 750000]),
  // Hitstop is capped at 120 ms in any rolling second.
  hitstopCap: 0.12,
  transition: 1.8,
  // 1/120 s substeps: the fastest enemy bullet (10 u/s) moves 0.083 u per
  // substep, well under the smallest bullet + core diameter (0.54 u), and a
  // needle (34 u/s) moves 0.28 u, under the smallest enemy radius.
  substep: 1 / 120,
  maxStep: 2,
  formationFrontZ: -4,
  // Bosses: card HP = TTK x the effective DPS of the power the campaign
  // guarantees at that point (24 at power 1-2, 30 at 3, 42 at 4; brief 6-7).
  referenceDps: 24,
  powerDps: Object.freeze([24, 24, 30, 42]),
  // Playtest: cards still ran 2-3.5 min per boss at realistic DPS. Card HP
  // is TTK x DPS x 0.7, so a real player ends cards before the timeout.
  cardHpScale: 0.7,
  phaseTimeout: 30,
  cardTimeout: 40,
  cardIntro: 1.5,
  bossMaxSpeed: 3,
});

/** Easy halves the pressure for newcomers (RESEARCH_BULLET_HELL.md 7.4). */
export const DIFFICULTY = Object.freeze({
  normal: { count: 1, speed: 1, tele: 0, health: 3, bombs: 2, autoBomb: false, deathbomb: 0.18, hp: 1, overlap: 2, wallGap: 2, neutralized: 1 },
  easy: { count: 0.6, speed: 0.85, tele: 0.15, health: 5, bombs: 3, autoBomb: true, deathbomb: 0.35, hp: 0.85, overlap: 1, wallGap: 2.8, neutralized: 0.5 },
});
export const diff = (s) => DIFFICULTY[s.difficulty] || DIFFICULTY.normal;

export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/** xorshift32 stored in state so checkpoint retries replay identical streams. */
export function random(s) {
  let n = s.rngState >>> 0;
  n ^= n << 13;
  n ^= n >>> 17;
  n ^= n << 5;
  s.rngState = n >>> 0;
  return s.rngState / 4294967296;
}

export const nextId = (s) => ++s.nextShotId;

export function pushEvent(s, type, data = {}) {
  // `type` is written last so a payload can never overwrite the event type.
  s.events.push({ ...data, type });
}

/** Angle measured from +Z toward +X. */
export const aimAngle = (fromX, fromZ, toX, toZ) => Math.atan2(toX - fromX, toZ - fromZ);

/** Hitstop pauses the whole model step (input, actors, collisions), not just
 * rendering, so input and collisions never desync from what was shown. */
export function requestHitstop(s, amount, bypass = false) {
  if (amount <= 0) return 0;
  s.hitstopLog = s.hitstopLog.filter((h) => s.clock - h.t < 1);
  const used = s.hitstopLog.reduce((n, h) => n + h.amount, 0);
  const grant = bypass ? amount : Math.min(amount, Math.max(0, RULES.hitstopCap - used));
  if (grant <= 0) return 0;
  if (!bypass) s.hitstopLog.push({ t: s.clock, amount: grant });
  s.hitstop = Math.max(s.hitstop, grant);
  return grant;
}

export function addTelegraph(s, telegraph) {
  const t = { id: nextId(s), age: 0, ...telegraph };
  s.telegraphs.push(t);
  return t;
}
