/** Camera framing, independent of WebGL so portrait regressions can be tested.
 *
 * Bullet-hell readability (RESEARCH_BULLET_HELL.md 3.3): a real perspective
 * camera, but steep and narrow so scale is nearly uniform across the board.
 * The search window is pitch 64-74 degrees and FOV 24-32 degrees, and the far /
 * near depth ratio (back rim vs front rim) is capped at 1.35, so a bullet at
 * the back is never drawn much smaller than one by the syringe. The camera is
 * fixed: no follow, no sway.
 *
 * For each viewport we fit the whole board (FRAMING_POINTS) inside a 6% safe
 * inset, keeping a top band free for the VIRAL LOAD bar. In landscape the board
 * becomes a centred column with the instrument HUD in the side columns; in
 * portrait it fills the width and is anchored under the HUD strip, leaving the
 * thumb zone below.
 */
export const FRAMING_POINTS = Object.freeze([
  // Board corners at the floor and at the bullet / enemy plane.
  ...[-9.4, 9.4].flatMap((x) => [0, 1.1].flatMap((y) => [-13.2, 12.9].map((z) => [x, y, z]))),
  // The syringe at the bottom of its box (barrel, plunger and thumb rest).
  [0, 1.2, 13.4],
]);
const SAFE = 0.935;
// Reserved for the VIRAL LOAD bar and its mutation card tape, so they never
// cover a boss: 80 px over the landscape column, 100 px under the portrait strip.
export const TOP_BAND = Object.freeze({ strip: 100, side: 80 });
const BACK = [0, 0.55, -12.5];
const FRONT = [0, 0.55, 12.4];
export const MAX_DEPTH_RATIO = 1.35;

function basis(position, target) {
  const f = target.map((t, i) => t - position[i]);
  const n = Math.hypot(...f);
  const fw = f.map((v) => v / n);
  const up = [0, -fw[2], fw[1]];
  return { fw, up };
}
/** Project a world point to NDC for a camera with no yaw/roll. */
export function projectPoint([x, y, z], layout) {
  const { position, target, fov, aspect } = layout;
  const { fw, up } = basis(position, target);
  const v = [x - position[0], y - position[1], z - position[2]];
  const depth = v[0] * fw[0] + v[1] * fw[1] + v[2] * fw[2];
  const t = Math.tan((fov * Math.PI) / 360);
  const vy = v[0] * up[0] + v[1] * up[1] + v[2] * up[2];
  return { x: v[0] / (depth * t * aspect), y: vy / (depth * t), depth };
}
function place(pitch, distance, tz) {
  const rad = (pitch * Math.PI) / 180;
  return { target: [0, 0, tz], position: [0, Math.sin(rad) * distance, tz + Math.cos(rad) * distance] };
}
function extent(layout) {
  let maxX = 0,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of FRAMING_POINTS) {
    const q = projectPoint(p, layout);
    if (q.depth <= 0.2) return null;
    maxX = Math.max(maxX, Math.abs(q.x));
    minY = Math.min(minY, q.y);
    maxY = Math.max(maxY, q.y);
  }
  return { maxX, minY, maxY };
}
function fit(aspect, pitch, fov, top, anchorTop) {
  let tz = 0,
    best = null;
  for (let pass = 0; pass < 6; pass++) {
    let lo = 8,
      hi = 260;
    for (let i = 0; i < 42; i++) {
      const mid = (lo + hi) / 2;
      const e = extent({ ...place(pitch, mid, tz), fov, aspect });
      const fits = e && e.maxX <= SAFE && e.maxY <= top && e.minY >= -SAFE;
      if (fits) hi = mid;
      else lo = mid;
    }
    best = { ...place(pitch, hi, tz), fov, aspect, distance: hi };
    const e = extent(best);
    const offset = anchorTop ? e.maxY - top : (e.maxY + e.minY - top + SAFE) / 2;
    if (Math.abs(offset) < 0.003) break;
    tz -= offset * hi * Math.tan((fov * Math.PI) / 360) * 0.9;
  }
  return best;
}
export const depthRatio = (layout) => projectPoint(BACK, layout).depth / projectPoint(FRONT, layout).depth;

const cache = new Map();
/** `topPx`: pixels reserved at the top (the boss bar); defaults by layout. */
export function cameraLayout(width, height, { topPx } = {}) {
  const aspect = Math.max(0.05, width / Math.max(1, height));
  const portrait = aspect < 0.9;
  const band = topPx ?? (portrait ? TOP_BAND.strip : TOP_BAND.side);
  const key = `${Math.round(width)}x${Math.round(height)}:${band}`;
  if (cache.has(key)) return structuredClone(cache.get(key));
  const top = Math.max(0.6, Math.min(SAFE, 1 - band / Math.max(1, height / 2)));
  let best = null;
  for (let pitch = 64; pitch <= 74; pitch += 1)
    for (const fov of [24, 26, 28, 30, 32]) {
      const layout = fit(aspect, pitch, fov, top, portrait);
      if (depthRatio(layout) > MAX_DEPTH_RATIO) continue;
      // Maximise the on-screen size of the back row (the smallest bullets).
      const back = projectPoint(BACK, layout);
      const score = 1 / (back.depth * Math.tan((fov * Math.PI) / 360));
      if (!best || score > best.score) best = { score, layout };
    }
  const { target, position, fov } = best.layout;
  const out = { aspect, fov, target: target.map((v) => +v.toFixed(4)), position: position.map((v) => +v.toFixed(4)), band };
  cache.set(key, out);
  return structuredClone(out);
}
/** Pixels per world unit at a board point (for minimum on-screen sizes). */
export function pxPerUnit(layout, height, point) {
  const q = projectPoint(point, layout);
  return height / 2 / (q.depth * Math.tan((layout.fov * Math.PI) / 360));
}
