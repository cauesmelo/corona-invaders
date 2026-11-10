/** Adjuvant behaviours in play: the parts of RESEARCH_CARDS §3.3 that are not
 * plain stat modifiers (those live in cards.mjs `kitOf`). Kept out of
 * model.mjs so the model only carries short hook calls; functions that must
 * damage a virus receive the model's own `damageEnemy`, so every adjuvant
 * goes through the one damage rule.
 *
 * Nothing here changes a collider: the core stays RULES.shipRadius, the graze
 * ring RULES.grazeRadius and needles hitboxes.NEEDLE. The coating is an extra
 * hit charge on the existing core test, never a bubble around it, and the
 * jet's rectangle (hitboxes.JET) is the one new collider. Card effects use no
 * randomness (split angles and aim targets are deterministic), so they never
 * consume the stage's RNG stream.
 */
import { RULES, nextId, pushEvent } from './core.mjs';
import { cancelBullets } from './bullets.mjs';
import { bulletGap, pointSegDist2, jetRect, jetHits } from './hitboxes.mjs';
import { voidCapture, bossIntangible } from './bosses.mjs';
import { CARD, CAPS, needleMul } from './cards.mjs';

const DEG = Math.PI / 180;
const axisDist = (e, x, z) => Math.sqrt(pointSegDist2(x, z, e.x - (e.half || 0), e.z, e.x + (e.half || 0), e.z));
const tangible = (s, e) => e.alive && !e.harmless && e.kind !== 'vesicle' && !(e.kind === 'boss' && bossIntangible(s, e));

/** Heading (push convention: 0 = straight up the board, toward -z) to the
 * nearest tangible virus within `range`, clamped to +/-`arc` degrees so an
 * aimed needle never flies back toward the player. Null if none in range. */
export function aimUp(s, x, z, range, arc) {
  let best = null,
    bestD = range;
  for (const e of s.enemies) {
    if (!tangible(s, e)) continue;
    const d = Math.max(0, axisDist(e, x, z) - e.radius);
    if (d < bestD - 1e-9) [best, bestD] = [e, d];
  }
  if (!best) return null;
  const a = Math.atan2(best.x - x, -(best.z - z));
  return Math.max(-arc * DEG, Math.min(arc * DEG, a));
}

/** The player's projectiles alive (needles + split + innate) stay <= 120. */
export const roomFor = (s, n = 1) => s.shots.length + n <= CAPS.projectiles;

/** Per-substep timers: coating re-form, FEVER, AUTOCLAVE, FOAM, INNATE. */
export function tickKit(s, dt) {
  const ship = s.ship,
    kit = s.kit;
  if (kit.coatMax && ship.coat < kit.coatMax) {
    ship.coatTimer = (ship.coatTimer || kit.coatReform) - dt;
    if (ship.coatTimer <= 0) {
      ship.coat++;
      ship.coatTimer = ship.coat < kit.coatMax ? kit.coatReform : 0;
      pushEvent(s, 'coat-reform', { charges: ship.coat });
    }
  }
  if (ship.fever > 0) ship.fever = Math.max(0, ship.fever - dt);
  if (ship.innateCooldown > 0) ship.innateCooldown = Math.max(0, ship.innateCooldown - dt);
  if (kit.autoclave && s.phase === 'playing') {
    ship.autoclave = (ship.autoclave || 0) + dt;
    if (ship.autoclave >= CARD.autoclave.fx.every) {
      ship.autoclave -= CARD.autoclave.fx.every;
      if (ship.bombs < kit.maxBombs) {
        ship.bombs++;
        pushEvent(s, 'autoclave', { bombs: ship.bombs });
      }
    }
  }
  if (s.foam) {
    const f = s.foam;
    f.t -= dt;
    // Bullets whose solid enters the drawn foam disc become antigen tokens.
    cancelBullets(s, { reason: 'foam', filter: (b) => bulletGap(b, f.x, f.z) < f.r });
    if (f.t <= 0) s.foam = null;
  }
}

/** ENTERIC COATING / LNP SHELL: a hit reaching the core is absorbed if a
 * charge is left. 1.0 s of invulnerability, no vial lost; the absorb voids
 * the boss card's capture and counts as a lost vial for the stage medal.
 * LNP's bubble turns bullets within 3 u into antigen tokens. */
export function absorbHit(s, cause) {
  const ship = s.ship,
    kit = s.kit;
  if (!kit.coatMax || !(ship.coat > 0)) return false;
  if (ship.coat === kit.coatMax || !ship.coatTimer) ship.coatTimer = kit.coatReform;
  ship.coat--;
  ship.invulnerable = Math.max(ship.invulnerable, CARD['enteric-coating'].fx.invuln);
  s.sector.absorbs = (s.sector.absorbs || 0) + 1;
  voidCapture(s);
  let cleared = 0;
  if (kit.lnp) {
    const r = CARD['lnp-shell'].fx.pop;
    cleared = cancelBullets(s, { reason: 'lnp', filter: (b) => bulletGap(b, ship.x, ship.z) < r });
  }
  pushEvent(s, 'absorb', { x: ship.x, z: ship.z, left: ship.coat, by: cause?.by, lnp: kit.lnp, cleared });
  return true;
}

/** JET INJECTOR: in focus, a needle-free jet replaces the focused needles.
 * It applies 1.25x the focused needle DPS (every NEEDLE card included) to
 * every virus body that overlaps its rectangle, in 20 Hz ticks so it reads
 * like the needle stream (hits, flinches and sounds at needle cadence, not
 * 120 events/s). Closed BLOOM buds spark (damageEnemy's own rule), the
 * intangible twin and the shielded SPIKE CROWN core are skipped (as needles
 * pass through them), shootable virions in the stream are destroyed. */
export const JET_TICK = 1 / 20;
export function updateJet(s, dt, { damageEnemy, awardKill }) {
  const ship = s.ship,
    kit = s.kit;
  ship.jetOn = !!(kit.jet && ship.focus && s.phase === 'playing' && ship.respawn <= 0 && ship.dying <= 0);
  if (!ship.jetOn) {
    ship.jetClock = 0;
    return;
  }
  ship.jetClock = (ship.jetClock || 0) + dt;
  if (ship.jetClock < JET_TICK - 1e-9) return;
  const tick = ship.jetClock;
  ship.jetClock = 0;
  const rect = jetRect(ship.x, ship.z);
  const booster = ship.powerups.booster > 0 ? RULES.boosterMultiplier : 1;
  const perNeedle = needleMul(kit, { focus: true, ringBusy: ship.ringBusy, fever: ship.fever > 0 }) * booster;
  const dps = kit.fireRate * jetNeedles(kit) * perNeedle * CARD['jet-injector'].fx.jet;
  for (const e of s.enemies) {
    if (!tangible(s, e)) continue;
    if (!jetHits(rect, e.x, e.z, e.radius, e.half || 0)) continue;
    damageEnemy(s, e, dps * tick, 'jet');
  }
  for (const b of s.enemyShots) {
    if (!b.shootable || b.dead) continue;
    if (!jetHits(rect, b.x, b.z, b.hit ?? 0.2)) continue;
    b.dead = true;
    awardKill(s, 50);
    pushEvent(s, 'kill', { kind: 'virion-bullet', x: b.x, z: b.z, id: b.id });
  }
  pushEvent(s, 'jet', { x: ship.x, z: rect.toZ });
}
/** The focused needle count the jet replaces (and scales with). */
const jetNeedles = (kit) => Math.min(CAPS.focusNeedles, (kit.power >= 4 ? 5 : kit.power >= 3 ? 4 : 3) + (kit.twin ? 1 : 0));

/** SPLIT TIP: a needle that kills a virus splits into 2 needles at +/-25
 * degrees from its heading, at the needle's damage. Split needles never
 * split again; at most 24 are alive. */
export function splitNeedle(s, shot) {
  if (!s.kit.split || shot.split || shot.innate) return;
  if (s.shots.filter((p) => p.split && !p.dead).length + 2 > CAPS.splitAlive || !roomFor(s, 2)) return;
  const heading = Math.atan2(shot.vx, -shot.vz);
  const speed = Math.hypot(shot.vx, shot.vz);
  for (const side of [-1, 1]) {
    const a = heading + side * CARD['split-tip'].fx.splitAngle * DEG;
    s.shots.push({ id: nextId(s), x: shot.x, z: shot.z, vx: Math.sin(a) * speed, vz: -Math.cos(a) * speed, radius: 0.12, damage: shot.baseDamage ?? shot.damage, split: true, hitIds: [...(shot.hitIds || [])] });
  }
  s.projectilesFired += 2;
  pushEvent(s, 'split-needle', { x: shot.x, z: shot.z });
}

/** INNATE RESPONSE: each graze fires one needle from the tip at the nearest
 * tangible virus within 12 u (+/-60 degrees), for 2x needle damage, at most
 * 10 per second. */
export function innateShot(s) {
  const ship = s.ship,
    kit = s.kit;
  if (!kit.innate || ship.innateCooldown > 0 || !roomFor(s)) return false;
  const fx = CARD['innate-response'].fx;
  const a = aimUp(s, ship.x, ship.z - 0.9, fx.range, 60);
  if (a === null) return false;
  ship.innateCooldown = 1 / fx.cap;
  const booster = ship.powerups.booster > 0 ? RULES.boosterMultiplier : 1;
  const damage = fx.mult * needleMul(kit, { focus: ship.focus, ringBusy: ship.ringBusy, fever: ship.fever > 0 }) * booster;
  s.shots.push({ id: nextId(s), x: ship.x, z: ship.z - 0.9, vx: Math.sin(a) * RULES.needleSpeed, vz: -Math.cos(a) * RULES.needleSpeed, radius: 0.12, damage, innate: true });
  s.projectilesFired++;
  return true;
}

/** BACKUP ALIQUOT: once per sample, a lost vial drops where it was lost as a
 * catchable aliquot for 3 s. No RNG is used (spawnPickup's wobble phase would
 * read the stage stream). */
export function dropAliquot(s, x, z) {
  if (!s.kit.aliquot || s.sector.aliquotUsed) return false;
  s.sector.aliquotUsed = true;
  s.pickups.push({ id: nextId(s), kind: 'vial', x: Math.max(-8.6, Math.min(8.6, x)), z, age: 0, phase: 0, radius: 0.5, source: 'aliquot', life: CARD['backup-aliquot'].fx.catchTime });
  s.dropsSpawned++;
  pushEvent(s, 'drop', { kind: 'vial', x, z, source: 'aliquot' });
  return true;
}
