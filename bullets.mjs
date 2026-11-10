/** Enemy bullet families. Shape before colour: every family has its own
 * silhouette in render.mjs, and every bullet carries a family and a source
 * label, so the CONTAINMENT LOST card can always name what hit the player.
 *
 * The hit radius is the drawn solid body, dark rim included (hitboxes.mjs);
 * only the soft glow outside it is larger than the collider.
 */
import { RULES, clamp, nextId, pushEvent } from './core.mjs';
import { COLLIDERS } from './hitboxes.mjs';

/** `hit` is the collider radius (the drawn solid body); `half` the capsule
 * half-length along travel for elongated families (hitboxes.mjs). The glow
 * around a bullet is light, not matter. */
const fam = (label, family, speed) => ({ label, hit: COLLIDERS[family].r, half: COLLIDERS[family].half, vis: COLLIDERS[family].r, speed });
export const FAMILIES = Object.freeze({
  // Sneeze droplets: a capsule along the travel (an elongated drop).
  droplet: fam('DROPLET', 'droplet', [3, 9]),
  // Aerosol mist: a round dot that decelerates to 60% over 1 s.
  aerosol: fam('AEROSOL', 'aerosol', [2.5, 4.5]),
  // Spike protein: an elongated club along the travel (capsule).
  spike: fam('SPIKE PROTEIN', 'spike', [3.5, 10]),
  // RNA beads joined by a thin harmless thread, travelling on a sine.
  rna: fam('RNA STRAND', 'rna', [4, 6]),
  // Tiny 8-spike crown (the original sprite). Shootable: 1 HP. The body is
  // the collider; its spikes are decorative, like every virus's.
  virion: fam('VIRION', 'virion', [2.5, 4]),
  // Big wobbling mucus ball, used for walls.
  glob: fam('MUCUS GLOB', 'glob', [2, 4]),
});
export const FAMILY_NAMES = Object.freeze(Object.keys(FAMILIES));

/** Spawn one enemy bullet. Returns null (and spawns nothing) when the spawn
 * point is inside the 2.5 u exclusion circle around the core, outside the
 * board, or the global 600-bullet cap is reached. */
export function spawnBullet(s, { x, z, angle, speed, family = 'droplet', src, ax = 0, az = 0, ...extra }) {
  const f = FAMILIES[family] || FAMILIES.droplet;
  if (s.enemyShots.length >= RULES.maxBullets) return null;
  // Per-world stage cap (peak bullets on screen: 45/70/95/120 on Normal). Boss
  // and midboss patterns are authored walls and use their own peaks.
  if (!extra.boss && s.bulletCap !== undefined && s.stageBullets >= s.bulletCap) return null;
  // Bullets never appear at the bottom or side edges.
  if (Math.abs(x) > RULES.halfWidth - 0.2 || z > RULES.moveMaxZ - 2 || z < RULES.back) return null;
  const ship = s.ship;
  if ((x - ship.x) ** 2 + (z - ship.z) ** 2 < RULES.spawnExclusion ** 2) return null;
  const b = {
    id: nextId(s),
    x,
    z,
    vx: Math.sin(angle) * speed,
    vz: Math.cos(angle) * speed,
    ax,
    az,
    family: FAMILIES[family] ? family : 'droplet',
    vis: f.vis,
    hit: f.hit,
    half: f.half,
    px: x,
    pz: z,
    src: src || 'VIRUS',
    age: 0,
    grazed: false,
    cancelable: true,
    shootable: family === 'virion',
    hp: family === 'virion' ? 1 : 0,
    ...extra,
  };
  // Decelerating mist keeps its launch speed so the slowdown is exact.
  if (family === 'aerosol' && !b.decel) b.decel = { v0: speed, ux: Math.sin(angle), uz: Math.cos(angle) };
  // Sine travel (RNA strands): the bead rides a base point; the lateral offset
  // is a function of distance travelled so the whole chain draws one wave.
  if (b.sine) {
    b.bx = x;
    b.bz = z;
    b.dist = 0;
    b.sine = { ...b.sine, px: Math.cos(angle), pz: -Math.sin(angle) };
  }
  s.enemyShots.push(b);
  if (!b.boss) s.stageBullets = (s.stageBullets || 0) + 1;
  return b;
}

/** Normalise a fixture bullet (QA fixtures may only give x/z/vx/vz/radius). */
export function normalizeBullet(b) {
  if (!FAMILIES[b.family]) b.family = 'droplet';
  const f = FAMILIES[b.family];
  if (!(b.hit > 0)) b.hit = b.radius > 0 ? b.radius : f.hit;
  // A bare fixture bullet given only a radius is a circle of that radius.
  b.half ??= b.radius > 0 ? 0 : f.half;
  if (!(b.vis > 0)) b.vis = b.hit;
  b.px ??= b.x;
  b.pz ??= b.z;
  if (!b.src) b.src = 'VIRUS';
  b.age ??= 0;
  b.vx ??= 0;
  b.vz ??= 0;
  b.ax ??= 0;
  b.az ??= 0;
  b.cancelable ??= true;
  return b;
}

/** World twist factors for bullet motion. BREATH (lungs) scales time; CURRENT
 * (bloodstream) adds a sideways drift. Both are global, telegraphed and never
 * push bullets in from an edge (drift only carries them out). */
export function bulletFlow(s) {
  return { scale: s.twist?.scale ?? 1, drift: s.twist?.drift ?? 0 };
}

/** Advance bullets one substep. Replicating bullets split here (the 0.3 s
 * flash before the split is drawn from `age` vs `splitAt`). */
export function updateBullets(s, dt) {
  const { scale, drift } = bulletFlow(s);
  const step = dt * scale;
  const born = [];
  // A wall's gap list (shared by every bullet of the wall; the floor marker,
  // the bots and the proxies read it) follows the CURRENT with the bullets,
  // so it always names where the gap really is.
  const gapLists = new Set();
  for (const b of s.enemyShots) {
    if (b.dead) continue;
    if (b.gaps && drift && !gapLists.has(b.gaps)) {
      gapLists.add(b.gaps);
      for (const g of b.gaps) g.x += drift * step;
    }
    // Previous position: collisions are swept over the substep.
    b.px = b.x;
    b.pz = b.z;
    b.age += step;
    if (b.decel) {
      const k = 1 - 0.4 * Math.min(1, b.age);
      b.vx = b.decel.ux * b.decel.v0 * k;
      b.vz = b.decel.uz * b.decel.v0 * k;
    } else if (b.ax || b.az) {
      b.vx += b.ax * step;
      b.vz += b.az * step;
    }
    if (b.sine) {
      b.bx += (b.vx + drift) * step;
      b.bz += b.vz * step;
      b.dist += Math.hypot(b.vx, b.vz) * step;
      const off = b.sine.amp * Math.sin((b.dist / b.sine.wavelength) * Math.PI * 2 + (b.sine.phase || 0));
      b.x = b.bx + b.sine.px * off;
      b.z = b.bz + b.sine.pz * off;
    } else {
      b.x += (b.vx + drift) * step;
      b.z += b.vz * step;
    }
    // FAIR-150 rule 4: a replicating bullet that has passed within 2 u of the
    // core never changes course again (a split could turn a child onto it).
    if (b.splitAt && s.ship && (b.x - s.ship.x) ** 2 + (b.z - s.ship.z) ** 2 < 4) b.splitAt = 0;
    if (b.splitAt && b.age >= b.splitAt) {
      b.dead = true;
      const speed = Math.hypot(b.vx, b.vz);
      const heading = Math.atan2(b.vx, b.vz);
      const gen = (b.gen || 0) + 1;
      for (const side of [-1, 1])
        born.push({
          x: b.x,
          z: b.z,
          angle: heading + side * b.splitAngle,
          speed,
          family: b.family,
          src: b.src,
          gen,
          splitAngle: b.splitAngle,
          splitAt: gen < (b.maxGen || 1) ? b.splitEvery : 0,
          splitEvery: b.splitEvery,
          maxGen: b.maxGen,
          boss: b.boss,
          owner: b.owner,
        });
      pushEvent(s, 'replicate', { x: b.x, z: b.z, gen });
      continue;
    }
    if (b.z > RULES.front + 0.5 || b.z < RULES.back - 1.5 || Math.abs(b.x) > RULES.halfWidth + 0.6) b.dead = true;
  }
  for (const spec of born) {
    // Children may spawn near the ship: the parent flashed for 0.3 s first, so
    // the exclusion circle is not applied to splits (they are never a surprise).
    const f = FAMILIES[spec.family];
    if (s.enemyShots.length >= RULES.maxBullets) break;
    s.enemyShots.push({
      id: nextId(s),
      x: spec.x,
      z: spec.z,
      vx: Math.sin(spec.angle) * spec.speed,
      vz: Math.cos(spec.angle) * spec.speed,
      ax: 0,
      az: 0,
      family: spec.family,
      vis: f.vis,
      hit: f.hit,
      half: f.half,
      px: spec.x,
      pz: spec.z,
      src: spec.src,
      age: 0,
      grazed: false,
      cancelable: true,
      shootable: spec.family === 'virion',
      hp: spec.family === 'virion' ? 1 : 0,
      gen: spec.gen,
      splitAt: spec.splitAt,
      splitEvery: spec.splitEvery,
      splitAngle: spec.splitAngle,
      maxGen: spec.maxGen,
      boss: spec.boss,
      owner: spec.owner,
    });
  }
}

/** Cancel bullets (SOAP, card start, a death). Cancelled bullets become
 * antigen tokens that fly to the syringe and score +20 x chain each. */
export function cancelBullets(s, { reason, filter = () => true, tokens = true } = {}) {
  let n = 0;
  const keep = [];
  for (const b of s.enemyShots) {
    if (b.dead) continue;
    if (b.cancelable !== false && filter(b)) {
      n++;
      // The reason travels with the token (MICELLE pays for the SOAP's own).
      if (tokens && s.antigens.length < 240) s.antigens.push({ id: nextId(s), x: b.x, z: b.z, age: 0, reason });
    } else keep.push(b);
  }
  s.enemyShots = keep;
  if (n) pushEvent(s, 'cancel', { count: n, reason });
  return n;
}

export const bulletRadius = (b) => clamp(b.hit ?? b.radius ?? 0.16, 0.02, 2);
