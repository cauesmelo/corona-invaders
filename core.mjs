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
  // barrel centre at exactly this radius (>= 6 px even at 320 px wide; the
  // earlier 0.16 u core needed a larger-than-collider marker on phones).
  // Only this core can be hit; the rest of the syringe never collides.
  shipRadius: 0.2,
  // Graze ring: a bullet passing within 1.0 u of the core (edge to centre)
  // scores once per bullet.
  grazeRadius: 1,
  shipSpeed: 11.5, // crosses the board in about 1.5 s
  focusSpeed: 5, // 0.45x: fine micro-dodging, still escapes an aimed stream
  speedBlend: 0.06, // 60 ms blend between speeds; no inertia otherwise
  pointerSpeed: 11.5, // mouse: follow the cursor's board point at normal speed
  dragSpeed: 30, // touch: finger travel maps 1:1, capped at 30 u/s
  bulletY: 0.55, // every bullet, the hitbox dot and collision share one plane
  // Auto-fire: 8 volleys/s. Thin needles keep the stream calm (the user asked
  // for a lower fire rate earlier, so the player never floods the screen).
  fireInterval: 0.125,
  needleSpeed: 34,
  // SPRAY spread: +/-4 degrees. At +/-9 the side needles missed a boss at
  // range, halving unfocused damage, and cards ended on the timer (playtest).
  sprayAngle: (4 * Math.PI) / 180,
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
