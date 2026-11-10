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
  // Auto-fire: 6 volleys/s (RESEARCH_DIFFICULTY.md 3.1). The owner found the
  // old start (3 needles at 8/s, 24 needles/s, 12-15 on screen) frantic; one
  // needle at 6/s keeps about 3 on screen in 1-1 and makes aiming matter
  // from the first second. Adjuvants never push it above 8/s (cards.mjs).
  fireInterval: 1 / 6,
  needleSpeed: 34,
  // The mRNA ladder (cards.mjs focusCount / sprayCount / abCount): L1 one
  // straight needle, L2 two (focus 0.25 u apart; spray +/-4.25 degrees, which
  // still lands on a boss 17.6 u away: 1.31 u off the axis, inside r >= 1.45),
  // L3 three (0, +/-4.25) plus 2 antibodies, L4 four in focus and five in
  // spray (+/-8.5 degrees: 3.1 u of coverage at 10 u for popcorn) plus 4.
  sprayAngle: (4.25 * Math.PI) / 180,
  needleSpacing: 0.25,
  antibodyInterval: 1 / 3, // each antibody option fires 3 needles/s
  maxPower: 4,
  // SOAP burst (the bomb). Soap really breaks the lipid envelope of a
  // coronavirus, so the bomb is a soap bubble ring.
  // SOAP restored per lost vial and at stage start on Normal: 1 (was 2;
  // RESEARCH_DIFFICULTY 3.6 lever 4, pulled because the expert proxy
  // one-credit-cleared 83% of runs, band 45-70%). Easy refills 3.
  bombsPerVial: 1,
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
  // The LAB REPORT between stages: 2.5 s, skippable after 0.5 s.
  transition: 2.5,
  // 1/120 s substeps: the fastest enemy bullet (10 u/s) moves 0.083 u per
  // substep, well under the smallest bullet + core diameter (0.54 u), and a
  // needle (34 u/s) moves 0.28 u, under the smallest enemy radius.
  substep: 1 / 120,
  maxStep: 2,
  formationFrontZ: -4,
  // Focused DPS of the mRNA levels with every needle hitting: 6 / 12 / 24 /
  // 36 (one to four needles at 6/s, plus 2 or 4 antibodies at 3/s).
  powerDps: Object.freeze([6, 12, 24, 36]),
  // Enemy toughness is authored, never read from the deck (RESEARCH_DIFFICULTY
  // 3.5): popcorn HP (and SOAP / burst / INJECT damage defined against it) is
  // base HP x the sector factor. It grows 2.4x over the run while median
  // power grows about 9x, so a build is felt.
  popcornHp: Object.freeze([1, 1.4, 1.9, 2.4]),
  // Boss and midboss card HP = TTK x the median focused DPS at that point x
  // the sector's card uptime u (the share of time a real player's needles
  // land on a moving boss while dodging). The low S1 value prices a
  // novice's single-needle aim; the median deck ends cards at about TTK.
  // The brief's values, confirmed by the human proxies (tests/difficulty.mjs)
  // once the power steps reliably reach the player.
  cardUptime: Object.freeze([0.45, 0.6, 0.65, 0.65]),
  ttkScale: Object.freeze([1, 1, 0.85, 0.85]),
  phaseTimeout: 30,
  cardTimeout: 40,
  cardIntro: 1.5,
  bossMaxSpeed: 3,
});

/** Easy halves the pressure for newcomers (RESEARCH_BULLET_HELL.md 7.4). */
export const DIFFICULTY = Object.freeze({
  // `credits`: continues per run (RESEARCH_V1.md 2.1): 3 on Normal,
  // unlimited on Easy.
  normal: { count: 1, speed: 1, tele: 0, health: 3, bombs: 2, autoBomb: false, deathbomb: 0.18, hp: 1, overlap: 2, wallGap: 2, neutralized: 1, credits: 3 },
  easy: { count: 0.6, speed: 0.85, tele: 0.15, health: 5, bombs: 3, autoBomb: true, deathbomb: 0.35, hp: 0.85, overlap: 1, wallGap: 2.8, neutralized: 0.5, credits: Infinity },
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
