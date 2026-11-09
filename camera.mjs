/** Camera framing, independent of WebGL so portrait regressions can be tested.
 *
 * For each viewport aspect we search camera pitch and field of view, then fit
 * the complete play envelope (FRAMING_POINTS) tightly inside a 6% safe inset on
 * both axes and center it vertically. The chosen layout maximizes the on-screen
 * size of back-row enemies, while limiting how much bigger the near row may get
 * (perspective ratio) so the far formation never shrinks to specks. Portrait
 * screens therefore pick a steeper, taller framing instead of letterboxing.
 */
export const FRAMING_POINTS = Object.freeze([
  // Ship travel envelope (full width, front of the cabinet).
  ...[-9.2, 9.2].flatMap((x) => [0.15, 1.25].flatMap((y) => [8.3, 12.4].map((z) => [x, y, z]))),
  // Back corners of the arena, and the top of a tall boss at the back.
  ...[-8.8, 8.8].flatMap((x) => [
    [x, 0, -12.8],
    [x, 3.8, -10.5],
  ]),
]);
const SAFE = 0.935;
// The top band of the stage (84 px) is reserved for the VIRAL LOAD bar and the
// sector intro tape, so neither ever covers the back row or a boss.
const TOP_BAND_PX = 84;
const BACK_ROW = [0, 0.8, -9.2];
const FRONT_ROW = [0, 0.8, 10.4];

function basis(position, target) {
  const f = target.map((t, i) => t - position[i]);
  const n = Math.hypot(...f);
  const fw = f.map((v) => v / n);
  // Right is world +x (no yaw); camera up = right x forward.
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
let TOP = SAFE;
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
/** Tight fit: shrink the distance until the envelope touches the safe inset,
 * recentering the target vertically between passes. In portrait the width is
 * the limit, so the spare height is moved below the ship (`anchorTop`), where
 * it becomes the thumb's drag zone instead of an empty band above the arena. */
function fit(aspect, pitch, fov, anchorTop = false) {
  let tz = 0,
    best = null;
  for (let pass = 0; pass < 6; pass++) {
    let lo = 8,
      hi = 140;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const e = extent({ ...place(pitch, mid, tz), fov, aspect });
      const fits = e && e.maxX <= SAFE && e.maxY <= TOP && e.minY >= -SAFE;
      if (fits) hi = mid;
      else lo = mid;
    }
    best = { ...place(pitch, hi, tz), fov, aspect, distance: hi };
    const e = extent(best);
    const offset = anchorTop ? e.maxY - TOP : (e.maxY + e.minY - TOP + SAFE) / 2;
    if (Math.abs(offset) < 0.004) break;
    // Moving the target toward +z (the ship) moves the picture up on screen.
    tz -= offset * hi * Math.tan((fov * Math.PI) / 360) * 0.9;
  }
  return best;
}
const cache = new Map();
export function cameraLayout(width, height) {
  const aspect = Math.max(0.05, width / Math.max(1, height));
  const key = `${Math.round(width)}x${Math.round(height)}`;
  TOP = Math.max(0.6, Math.min(SAFE, 1 - TOP_BAND_PX / Math.max(1, height / 2)));
  if (cache.has(key)) return structuredClone(cache.get(key));
  let best = null;
  const portrait = aspect < 0.9;
  for (let pitch = 44; pitch <= (portrait ? 78 : 74); pitch += 2)
    for (const fov of [30, 36, 42, 48]) {
      const layout = fit(aspect, pitch, fov, portrait);
      const back = projectPoint(BACK_ROW, layout),
        front = projectPoint(FRONT_ROW, layout);
      // Screen size of a 1 u object scales with 1 / (depth * tan(fov/2)).
      const t = Math.tan((fov * Math.PI) / 360);
      const backScale = 1 / (back.depth * t);
      const ratio = back.depth / front.depth;
      if (ratio > 1.9) continue;
      if (!best || backScale > best.score) best = { score: backScale, layout };
    }
  const { target, position, fov } = best.layout;
  const out = {
    aspect,
    fov,
    target: target.map((v) => +v.toFixed(4)),
    position: position.map((v) => +v.toFixed(4)),
  };
  cache.set(key, out);
  return structuredClone(out);
}
