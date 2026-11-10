/** Colliders, and exactly how each one is drawn. Pure (no DOM, no Three.js):
 * the simulation collides with these shapes and the renderer sizes every
 * sprite and mesh from the same numbers, so what you see is what hits
 * (user feedback: "the hitbox of everything needs to be very precise").
 * tests/hitboxes.test.mjs checks every entity type against its drawing.
 *
 * All colliders live on the board plane (y = RULES.bulletY); every visual is
 * centred on that plane too (no floating offset that perspective could turn
 * into a mismatch).
 *
 * Rules:
 *   - Player: one core circle, drawn as the glowing vaccine chamber marker of
 *     exactly that radius. The rest of the syringe never collides.
 *   - Enemies: the body sphere. Spikes are decorative for every interaction
 *     (needles, contact, SOAP), consistently; the body is drawn at exactly the
 *     collider radius.
 *   - Bullets: the solid body (dark rim included) is the collider; the soft
 *     glow outside it is light, not matter. Elongated families (droplet,
 *     spike) are capsules along their travel and use segment tests.
 *   - Collisions are swept: a bullet and the syringe are tested along their
 *     relative motion during the substep, so nothing can tunnel.
 */
import { RULES } from './core.mjs';

/** Bullet colliders: radius r (u) and capsule half-length (u) along the
 * velocity (0 = circle). */
export const COLLIDERS = Object.freeze({
  droplet: Object.freeze({ r: 0.15, half: 0.12 }),
  aerosol: Object.freeze({ r: 0.15, half: 0 }),
  spike: Object.freeze({ r: 0.13, half: 0.16 }),
  rna: Object.freeze({ r: 0.15, half: 0 }),
  virion: Object.freeze({ r: 0.2, half: 0 }),
  glob: Object.freeze({ r: 0.42, half: 0 }),
});
/** A needle is a thin segment: its tip is the shot position, its tail trails
 * NEEDLE.length behind along the travel. */
export const NEEDLE = Object.freeze({ r: 0.06, length: 0.9 });
/** The syringe body that catches supplies (the drawn barrel's half-width). */
export const BODY_RADIUS = 0.4;
/** The core marker: a flat disc on the collision plane itself (not lifted
 * above it, so perspective cannot enlarge or shift it), whose outer edge is
 * the collider. The 128 px texture draws that edge at radius `texEdge` of a
 * `texHalf` half-width, so the quad spans 2 r texHalf / texEdge u. */
export const MARKER = Object.freeze({ r: RULES.shipRadius, y: RULES.bulletY, texEdge: 60, texHalf: 64 });
export const markerQuad = () => (2 * MARKER.r * MARKER.texHalf) / MARKER.texEdge;
/** The graze ring as drawn: a thin band whose outer edge is the graze radius,
 * on the collision plane. A bullet grazes when its solid edge crosses that
 * outer edge (model.mjs updateHazards). */
export const GRAZE_RING = Object.freeze({ outer: RULES.grazeRadius, inner: RULES.grazeRadius - 0.04, y: RULES.bulletY });

/** Sprite layout for a bullet family: the canvas is drawn at K px per u with
 * the solid capsule of radius R_PX px, plus a glow margin. The quad is sized
 * so the solid region is exactly the collider. */
export const R_PX = 24;
export function spriteLayout(family) {
  const c = COLLIDERS[family] || COLLIDERS.droplet;
  const k = R_PX / c.r; // px per u
  const margin = family === 'virion' ? 22 : 14; // glow / decorative crown, px
  const halfPx = c.half * k;
  const width = 2 * (R_PX + margin),
    height = 2 * (R_PX + halfPx + margin);
  return { k, r: R_PX, halfPx, margin, width: Math.round(width), height: Math.round(height) };
}
/** Quad size (u) for a family: solid width = 2r, solid length = 2(r + half). */
export function bulletQuad(family) {
  const L = spriteLayout(family);
  return { w: L.width / L.k, l: L.height / L.k };
}
/** Drawn solid extents of a bullet, recovered from its quad and layout. */
export function drawnSolid(family) {
  const L = spriteLayout(family),
    q = bulletQuad(family);
  const r = (L.r / L.width) * q.w;
  const half = (L.halfPx / L.height) * q.l;
  return { r, half };
}

export const colliderOf = (b) => {
  const c = COLLIDERS[b.family];
  return { r: b.hit ?? c?.r ?? 0.15, half: b.half ?? c?.half ?? 0 };
};
/** Capsule axis endpoints of a bullet (centre +/- half along its travel). */
export function bulletAxis(b, x = b.x, z = b.z) {
  const half = b.half ?? 0;
  if (!half) return [x, z, x, z];
  const v = Math.hypot(b.vx || 0, b.vz || 0);
  const ux = v > 1e-6 ? b.vx / v : 0,
    uz = v > 1e-6 ? b.vz / v : 1;
  return [x - ux * half, z - uz * half, x + ux * half, z + uz * half];
}

/** Squared distance from point P to segment AB. */
export function pointSegDist2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax,
    dz = bz - az,
    l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + dx * t - px,
    ez = az + dz * t - pz;
  return ex * ex + ez * ez;
}
/** Squared distance between segments P0P1 and Q0Q1 (2D). */
export function segSegDist2(p0x, p0z, p1x, p1z, q0x, q0z, q1x, q1z) {
  // Proper intersection: distance 0.
  const d1x = p1x - p0x,
    d1z = p1z - p0z,
    d2x = q1x - q0x,
    d2z = q1z - q0z;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) > 1e-12) {
    const t = ((q0x - p0x) * d2z - (q0z - p0z) * d2x) / den,
      u = ((q0x - p0x) * d1z - (q0z - p0z) * d1x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    pointSegDist2(p0x, p0z, q0x, q0z, q1x, q1z),
    pointSegDist2(p1x, p1z, q0x, q0z, q1x, q1z),
    pointSegDist2(q0x, q0z, p0x, p0z, p1x, p1z),
    pointSegDist2(q1x, q1z, p0x, p0z, p1x, p1z),
  );
}
/** Swept bullet-vs-core test over one substep. In the bullet's frame the core
 * travels from (core0 - bullet0) to (core1 - bullet1); it hits if that path
 * comes within r + coreRadius of the bullet's capsule axis. */
export function sweptHit(b, core0x, core0z, core1x, core1z, coreR = RULES.shipRadius) {
  const { r } = colliderOf(b);
  const b0x = b.px ?? b.x,
    b0z = b.pz ?? b.z;
  const [ax, az, bx, bz] = bulletAxis(b, 0, 0);
  const d2 = segSegDist2(core0x - b0x, core0z - b0z, core1x - b.x, core1z - b.z, ax, az, bx, bz);
  return d2 < (r + coreR) ** 2;
}
/** Distance from a point to a bullet's solid edge (negative = inside). */
export function bulletGap(b, x, z) {
  const { r } = colliderOf(b);
  const [ax, az, bx, bz] = bulletAxis(b);
  return Math.sqrt(pointSegDist2(x, z, ax, az, bx, bz)) - r;
}
/** Needle segment (tail -> tip). */
export function needleSegment(n) {
  const v = Math.hypot(n.vx, n.vz) || 1;
  return [n.x - (n.vx / v) * NEEDLE.length, n.z - (n.vz / v) * NEEDLE.length, n.x, n.z];
}
export function needleHitsCircle(n, cx, cz, r) {
  const [ax, az, bx, bz] = needleSegment(n);
  return pointSegDist2(cx, cz, ax, az, bx, bz) < (r + NEEDLE.r) ** 2;
}
/** A lane beam occupies x in [x - w/2, x + w/2] from fromZ to the front rim;
 * the core hits when its circle overlaps that rectangle. */
export function beamHits(beam, x, z, coreR = RULES.shipRadius) {
  return Math.abs(x - beam.x) < beam.width / 2 + coreR && z + coreR > beam.fromZ;
}

/** Visual body scale for an enemy mesh spec so its body sphere is drawn at
 * exactly the collider radius. */
export function bodyRadiusOf(spec) {
  if (spec.bodyRadius) return spec.bodyRadius;
  const p = spec.parts.find((q) => q.type === 'sphere' && !q.role) || spec.parts.find((q) => q.type === 'shell' || q.type === 'drop' || q.type === 'sphere' || q.type === 'torus');
  return p?.r ?? 0.6;
}
export const enemyScale = (e, spec) => e.radius / bodyRadiusOf(spec);

/** JET INJECTOR (adjuvant 8, RESEARCH_CARDS §3.2): the one collider an
 * adjuvant adds. A 0.5 u-wide stream from the muzzle straight up the board
 * to the back edge, drawn at exactly this width (like a lane beam). It is a
 * player weapon: it never touches the syringe's own core or graze tests. */
export const JET = Object.freeze({ width: 0.5, muzzle: 0.9 });
export const jetRect = (x, z) => ({ x, width: JET.width, fromZ: RULES.back, toZ: z - JET.muzzle });
/** A body (circle, or a capsule of half-length `half` along x) overlaps the
 * jet rectangle. */
export function jetHits(rect, cx, cz, r, half = 0) {
  return Math.abs(cx - rect.x) < rect.width / 2 + r + half && cz - r < rect.toZ && cz + r > rect.fromZ;
}
