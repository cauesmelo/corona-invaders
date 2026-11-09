/** Shared simulation primitives for Corona Invaders. Pure JavaScript: no DOM and
 * no Three.js, so model tests and the renderer read the same rules.
 *
 * Units: positions are world units (u) on the X/Z combat plane. +Z points toward
 * the player; the ship row sits at z = 10.4. Times are seconds and speeds u/s.
 */
export const RULES = Object.freeze({
  halfWidth: 9.4,
  back: -13.4,
  front: 13.4,
  shipZ: 10.4,
  shipRadius: 0.48,
  // Keyboard strafe speed. Pointer steering is allowed 21 u/s because a pointer
  // target is already a deliberate destination rather than a held direction.
  shipSpeed: 15.5,
  pointerSpeed: 21,
  shotSpeed: 34,
  shotCooldown: 0.26,
  rapidCooldown: 0.13,
  hitInvulnerability: 1.55,
  shieldDuration: 0.7,
  shieldCooldown: 5,
  shieldRadius: 2.4,
  maxHealth: 3,
  // 4% eligible-kill chance plus a 10 s cooldown. The Courier and the x4 chain
  // guarantee are now the main sources, so random drops are a rare surprise.
  dropChance: 0.04,
  dropCooldown: 10,
  pickupSpeed: 3.5,
  powerupDuration: 8,
  shieldPickupDuration: 6,
  // Small attacks warn for 0.65 s; large ones (beams, rings, dives) for 0.8-1.0 s.
  warning: 0.65,
  chainWindow: 1.6,
  bossChainRefresh: 0.6,
  chainTiers: Object.freeze([5, 10, 16, 24, 32]),
  // Hitstop is capped at 120 ms in any rolling second so frequent kills never
  // make the simulation feel choppy. Boss deaths bypass it: the sector is over.
  hitstopCap: 0.12,
  transition: 1.8,
  breachMargin: 3,
  substep: 1 / 180,
  maxStep: 2,
  membraneZ: 7.2,
  diveZ: 8,
  diveSpeed: 9,
});

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
  s.events.push({ type, ...data });
}

/** Angle measured from +Z (straight at the ship row) toward +X. */
export const aimAngle = (fromX, fromZ, toX, toZ = RULES.shipZ) => Math.atan2(toX - fromX, toZ - fromZ);

/** Enemy bullet. `src` names the attacker for the cause-of-loss card; `boss`
 * bullets are exempt from the formation bullet budget because boss patterns are
 * authored walls whose gaps are the dodge. */
export function fireBullet(s, x, z, angle, speed, { radius = 0.19, src = 'VIRUS', boss = false } = {}) {
  s.enemyShots.push({
    id: nextId(s),
    x,
    z,
    vx: Math.sin(angle) * speed,
    vz: Math.cos(angle) * speed,
    radius,
    src,
    boss,
  });
}

export const formationShotCount = (s) => s.enemyShots.reduce((n, b) => n + (b.boss ? 0 : 1), 0);

export function addTelegraph(s, telegraph) {
  const t = { id: nextId(s), age: 0, ...telegraph };
  s.telegraphs.push(t);
  return t;
}

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
