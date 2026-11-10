/** Villain faces: one instanced, procedurally shaded decal per face (one draw
 * call for every face on the board). The fragment shader draws eyes with
 * lids, irises, pupils and highlights, brows, a mouth with teeth and tongue,
 * a hurt ">.<", "X X" for the dead and a panic sweat drop, all as signed
 * distances, so faces stay crisp at any size and animate continuously.
 *
 * Placement (placeFace): the decal centre is where the camera ray through a
 * point sin(FACE.tilt) silhouette radii below the body centre meets the
 * drawn body (an ellipsoid c + A u, A = the mesh's world matrix times its
 * radii), so viruses look down toward the syringe and every face sits at the
 * same spot of its silhouette for any squash, stretch or tilt. The decal is
 * tangent to the body there, so it never pokes into or out of it, and its
 * features stay inside the silhouette (personality.faceReach,
 * tested). Faces are drawn with depth testing (a body in front hides them)
 * but under every bullet, warning ring and telegraph (renderOrder 30).
 */
import * as THREE from './vendor/three.module.js';
import { FACE } from './personality.mjs';

const VERT = /* glsl */ `
attribute vec4 fA; attribute vec4 fB; attribute vec4 fC; attribute vec4 fD;
attribute vec4 fE; attribute vec4 fF; attribute vec4 fG; attribute vec4 fH;
varying vec2 vUv;
varying vec4 vA; varying vec4 vB; varying vec4 vC; varying vec4 vD;
varying vec4 vE; varying vec4 vF; varying vec4 vG; varying vec4 vH;
void main() {
  vUv = uv * 2.0 - 1.0;
  vA = fA; vB = fB; vC = fC; vD = fD; vE = fE; vF = fF; vG = fG; vH = fH;
  gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec4 vA; // open, brow, curve, mouth
varying vec4 vB; // lookX, lookY, squint, sweat
varying vec4 vC; // eye size, gap, tall, pupil
varying vec4 vD; // lid, teeth, mouth width, dead
varying vec4 vE; // smirk, brow style, lashes, mismatch
varying vec4 vF; // ink rgb, alpha
varying vec4 vG; // iris rgb, -
varying vec4 vH; // blink left, blink right, -, -
const float EYE_Y = ${FACE.eyeY.toFixed(3)};
const float MOUTH_Y = ${FACE.mouthY.toFixed(3)};
float AA;
float fillD(float d) { return clamp(0.5 - d / AA, 0.0, 1.0); }
float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
vec4 C = vec4(0.0); // premultiplied colour
void over(vec3 rgb, float a) { C = vec4(rgb * a, a) + C * (1.0 - a); }

void main() {
  vec2 p = vUv;
  AA = max(fwidth(p.x), fwidth(p.y)) * 0.85;
  float line = max(0.034, AA * 1.1);
  float open = vA.x, brow = vA.y, curve = vA.z, mouth = vA.w;
  vec2 look = vB.xy;
  float squint = vB.z, sweat = vB.w;
  float size = vC.x, gap = vC.y, tall = vC.z, pupil = vC.w;
  float lid = vD.x, teeth = vD.y, mw = vD.z, dead = vD.w;
  float smirk = vE.x, browStyle = vE.y, lashes = vE.z, mismatch = vE.w;
  vec3 ink = vF.rgb, iris = vG.rgb;
  vec3 white = vec3(0.97, 1.0, 0.98);
  float wide = max(open - 1.0, 0.0);
  float happy = clamp((curve - 0.55) * 1.6, 0.0, 0.8);

  // ---- Mouth --------------------------------------------------------------
  float x = p.x / mw;
  float xc = clamp(x, -1.0, 1.0);
  float up = MOUTH_Y + curve * 0.2 * xc * xc - curve * 0.07 + smirk * 0.1 * xc;
  float slope = (curve * 0.4 * xc + smirk * 0.1) / mw;
  float openAmt = max(mouth, teeth > 2.5 ? 0.2 : 0.0);
  float lo = up - openAmt * 0.36 * (1.0 - xc * xc * 0.85);
  // Interior distance (negative inside the open mouth).
  float dIn = max(max(p.y - up, lo - p.y), (abs(x) - 1.0) * mw);
  if (openAmt > 0.02) {
    float inside = fillD(dIn);
    vec3 cavity = vec3(0.13, 0.04, 0.06);
    over(cavity, inside);
    // A small muted tongue at the bottom.
    float tongue = fillD(length((p - vec2(0.0, lo + 0.05)) / vec2(mw * 0.55, 0.09)) - 1.0) * inside;
    over(vec3(0.36, 0.13, 0.16), tongue * step(0.12, openAmt));
    if (teeth > 0.5 && teeth < 1.5) over(white, fillD(max(dIn, up - 0.075 - p.y)) * inside);
    if (teeth > 1.5 && teeth < 2.5) {
      // Shark teeth: a zigzag hanging from the upper lip.
      float z = abs(fract(x * 3.0 + 0.5) * 2.0 - 1.0);
      over(white, fillD(max(dIn, up - 0.11 * (1.0 - z) - 0.015 - p.y)) * inside);
    }
    if (teeth > 2.5) {
      // Gritted teeth: a white block with ink gaps.
      float gaps = min(abs(x * mw), min(abs(x * mw - mw * 0.45), abs(x * mw + mw * 0.45)));
      float midLine = abs(p.y - (up + lo) * 0.5);
      over(white, inside * (1.0 - fillD(min(gaps, midLine) - line * 0.35)));
    }
    over(ink, fillD(abs(dIn) - line));
  } else {
    // Closed: one stroke along the lip curve, rounded ends.
    float d = length(vec2((x - xc) * mw, (p.y - up) / sqrt(1.0 + slope * slope)));
    over(ink, fillD(d - line));
  }

  // ---- Eyes ---------------------------------------------------------------
  for (int i = 0; i < 2; i++) {
    float s = i == 0 ? -1.0 : 1.0;
    float R = size * (s > 0.0 ? 1.0 + mismatch : 1.0 - mismatch * 0.5) * (1.0 + wide * 0.3);
    vec2 c = vec2(s * gap, EYE_Y + wide * 0.04);
    vec2 q = (p - c) / vec2(R, R * tall);
    float ry = R * tall;
    float dEye = (length(q) - 1.0) * min(R, ry);
    float blink = i == 0 ? vH.x : vH.y;
    float o = clamp(open, 0.0, 1.0) * (1.0 - blink);
    float k = clamp(-(lid + brow * 0.6), -0.9, 0.9);
    float yTop = mix(-0.08, 1.12, o) + k * 0.5 * (s * q.x);
    float yBot = -1.12 + happy * (1.3 - 0.6 * q.x * q.x);
    float dTop = (q.y - yTop) * ry, dBot = (yBot - q.y) * ry;
    float dVis = max(dEye, max(dTop, dBot));
    float eyeA = (1.0 - squint) * (1.0 - dead);
    // White, faintly shaded toward the bottom so it reads as a ball.
    over(white * (0.86 + 0.14 * clamp(q.y * 0.5 + 0.5, 0.0, 1.0)), fillD(dVis) * eyeA);
    // Iris, pupil and highlight (only where the eye is open).
    float pr = pupil * R * (1.0 - 0.45 * sweat);
    vec2 pc = c + vec2(look.x * 0.42 * R, look.y * 0.38 * ry) * (1.0 - pupil * 0.4);
    float vis = fillD(dVis) * eyeA;
    over(iris, fillD(length(p - pc) - pr) * vis);
    over(ink, fillD(length(p - pc) - pr * 0.56) * vis);
    over(white, fillD(length(p - pc - vec2(-0.32, 0.38) * pr) - pr * 0.26) * vis);
    // Outline and the upper lid line (a closed eye is just this line).
    over(ink, fillD(abs(dVis) - line * 0.8) * eyeA * step(0.02, o));
    over(ink, fillD(abs(dTop) - line * 1.1) * fillD(dEye - line) * eyeA);
    // Lashes: three strokes on the outer upper edge.
    if (lashes > 0.5) {
      for (int j = 0; j < 3; j++) {
        float a = 0.35 + float(j) * 0.38;
        vec2 e = c + vec2(s * cos(a) * R, sin(a) * ry);
        vec2 dir = normalize(vec2(s * cos(a), sin(a) * 1.3));
        over(ink, fillD(seg(p, e, e + dir * 0.11) - line * 0.6) * eyeA * step(0.3, o));
      }
    }
    // Hurt: ">.<" chevrons pointing at the nose.
    if (squint > 0.01) {
      vec2 v = c + vec2(-s * 0.45 * R, 0.0);
      float d = min(seg(p, c + vec2(s * 0.7 * R, 0.55 * R), v), seg(p, c + vec2(s * 0.7 * R, -0.55 * R), v));
      over(ink, fillD(d - line * 1.2) * squint * (1.0 - dead));
    }
    // Dead: "X".
    if (dead > 0.01) {
      float d = min(seg(p, c + vec2(-0.7, -0.7) * R, c + vec2(0.7, 0.7) * R), seg(p, c + vec2(-0.7, 0.7) * R, c + vec2(0.7, -0.7) * R));
      over(ink, fillD(d - line * 1.3) * dead);
    }
    // Brows: angry = inner ends down, worried = inner ends up.
    if (browStyle > 0.5 && browStyle < 2.5) {
      float bw = R * 1.0;
      float by = c.y + ry + 0.1 + wide * 0.14 + max(brow, 0.0) * 0.05 + (s > 0.0 ? max(smirk, 0.0) * 0.09 : 0.0);
      float tilt = brow * 0.34 * bw;
      vec2 a = vec2(c.x - s * bw * 0.85, by + tilt);
      vec2 b = vec2(c.x + s * bw * 0.9, by - tilt * 0.5);
      float th = browStyle > 1.5 ? 0.07 : 0.042;
      over(ink, fillD(seg(p, a, b) - max(th, line)));
    }
  }
  if (browStyle > 2.5) {
    // Unibrow (the brute): one heavy bar that dips in the middle when angry.
    float by = EYE_Y + size * tall + 0.11;
    float dip = -brow * 0.12;
    vec2 l = vec2(-gap - size, by + dip * 0.3), m = vec2(0.0, by - dip), r = vec2(gap + size, by + dip * 0.3);
    over(ink, fillD(min(seg(p, l, m), seg(p, m, r)) - 0.08));
  }

  // ---- Panic sweat drop ------------------------------------------------------
  if (sweat > 0.01) {
    vec2 q = p - vec2(0.66, 0.38);
    float d = length(q) - 0.085 + max(q.y, 0.0) * 0.6;
    over(ink, fillD(d - line * 0.7) * sweat);
    over(vec3(0.84, 0.95, 1.0), fillD(d + line * 0.2) * sweat);
  }

  float a = C.a * vF.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(C.rgb / max(C.a, 1e-4), a);
}`;

export const FACE_MAX = 220;
const NAMES = ['fA', 'fB', 'fC', 'fD', 'fE', 'fF', 'fG', 'fH'];

/** The face pool: an InstancedMesh with eight per-instance vec4 attributes. */
export function createFaces() {
  const geo = new THREE.PlaneGeometry(2, 2);
  const attrs = {};
  for (const n of NAMES) {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(FACE_MAX * 4), 4);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(n, a);
    attrs[n] = a;
  }
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, FACE_MAX);
  mesh.frustumCulled = false;
  mesh.renderOrder = 30;
  mesh.count = 0;
  return { mesh, attrs };
}

// The shader writes display (sRGB) values directly, so hex colours are
// parsed as-is (THREE.Color would convert them to linear first).
const hexCache = new Map();
const rgb = (hex) => {
  if (!hexCache.has(hex)) hexCache.set(hex, [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255));
  return hexCache.get(hex);
};
/** Write one face's mood and style (faceState output) into slot i. */
export function writeFace(pool, i, f, alpha = 1) {
  const st = f.style;
  const ink = rgb(st.ink),
    iris = rgb(st.iris);
  const set = (n, a, b, c, d) => pool.attrs[n].setXYZW(i, a, b, c, d);
  set('fA', f.open, f.brow, f.curve, f.mouth);
  set('fB', f.lookX, f.lookY, f.squint, f.sweat);
  set('fC', st.size, st.gap, st.tall, st.pupil);
  set('fD', st.lid, st.teeth, st.mouthW, f.dead);
  set('fE', f.smirk, st.brows, st.lashes, st.mismatch);
  set('fF', ink[0], ink[1], ink[2], f.alpha * alpha);
  set('fG', iris[0], iris[1], iris[2], 0);
  set('fH', f.blinkL, f.blinkR, 0, 0);
}
export function commitFaces(pool, count) {
  pool.mesh.count = count;
  pool.mesh.instanceMatrix.needsUpdate = true;
  for (const n of NAMES) pool.attrs[n].needsUpdate = true;
}

const v1 = new THREE.Vector3(),
  v2 = new THREE.Vector3(),
  n = new THREE.Vector3(),
  right = new THREE.Vector3(),
  upv = new THREE.Vector3(),
  camRight = new THREE.Vector3(),
  camUp = new THREE.Vector3(),
  m4 = new THREE.Matrix4(),
  A = new THREE.Matrix3(),
  Ai = new THREE.Matrix3(),
  D = new THREE.Matrix3();
/** Face placement on a drawn body. `node` is the Object3D whose world matrix
 * draws the anchor ellipsoid (radius r, vertical aspect a, centre `at` in
 * node space): world points c + A u for unit u, A = M diag(r, r a, r).
 *
 * The decal centre is where the camera ray through a point sin(tilt) anchor
 * radii below the body centre on screen meets the drawn surface, so on
 * screen every face sits the same fraction of its silhouette below centre
 * (looking at the syringe), for spheres, eggs and squat bodies alike, and
 * at any squash or tilt. The decal lies in the tangent plane there (normal
 * A^-T A^-1 (p - c)), so it never pokes into or out of the body.
 * Writes the decal matrix into slot i; returns { p, c, rWorld, silWorld }
 * (silWorld: the silhouette half-extent toward screen-up, for the audit). */
export function placeFace(pool, i, camera, node, { r, a = 1, at = null, scale = FACE.scale, roll = 0, sx = 1, sy = 1, tilt = FACE.tilt }) {
  const mw = node.matrixWorld;
  const c = v1.set(at?.[0] ?? 0, at?.[1] ?? 0, at?.[2] ?? 0).applyMatrix4(mw).clone();
  A.setFromMatrix4(mw).multiply(D.set(r, 0, 0, 0, r * a, 0, 0, 0, r));
  Ai.copy(A).invert();
  camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const rWorld = new THREE.Vector3().setFromMatrixColumn(mw, 0).length() * r;
  // Silhouette half-extent toward screen-up: sqrt(w^T A A^T w).
  const silWorld = v2.copy(camUp).applyMatrix3(D.copy(A).transpose()).length();
  // The ray from the camera through the target point, in unit-sphere space.
  const target = c.clone().addScaledVector(camUp, -Math.sin(tilt) * silWorld);
  const o = camera.position;
  const dir = target.sub(o).normalize();
  const o2 = v2.copy(o).sub(c).applyMatrix3(Ai);
  const d2 = dir.clone().applyMatrix3(Ai);
  const qa = d2.dot(d2),
    qb = 2 * o2.dot(d2),
    qc = o2.dot(o2) - 1;
  const disc = qb * qb - 4 * qa * qc;
  const t = disc > 0 ? (-qb - Math.sqrt(disc)) / (2 * qa) : o.distanceTo(c) - rWorld;
  const p = o.clone().addScaledVector(dir, t);
  // Normal: A^-T A^-1 (p - c).
  n.copy(p).sub(c).applyMatrix3(Ai).applyMatrix3(D.copy(Ai).transpose()).normalize();
  // Decal basis: screen-aligned right/up projected onto the tangent plane.
  right.copy(camRight).addScaledVector(n, -camRight.dot(n)).normalize();
  upv.crossVectors(n, right).normalize();
  if (roll) {
    const cr = Math.cos(roll),
      sr = Math.sin(roll);
    const rx = right.clone();
    right.multiplyScalar(cr).addScaledVector(upv, sr);
    upv.multiplyScalar(cr).addScaledVector(rx, -sr);
  }
  const S = scale * rWorld;
  right.multiplyScalar(S * sx);
  upv.multiplyScalar(S * sy);
  const pos = p.clone().addScaledVector(n, 0.012 * rWorld);
  m4.makeBasis(right, upv, n).setPosition(pos);
  pool.mesh.setMatrixAt(i, m4);
  return { p: pos, c, rWorld, silWorld: Math.min(rWorld, silWorld) };
}
