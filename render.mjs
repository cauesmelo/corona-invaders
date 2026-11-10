/** Three.js presentation: a syringe fighting coronaviruses on a lab board.
 * Reads model state, never writes it.
 *
 * Colour has one meaning each (RESEARCH_BULLET_HELL.md 4.2):
 *   greens = viruses only; grey-white = boss and cell bodies;
 *   pink-violet with white cores and dark outlines = enemy bullets and
 *   telegraphs only; ice-cyan / white = the player, needles, antibodies and
 *   soap; amber = supplies and medals.
 * Bullets are drawn last, above everything, with depth testing off, so no
 * mesh can ever hide one; player needles are drawn under them. Shapes come
 * from shapes.mjs (tests/theme.test.mjs checks that registry).
 * Personality (idle life, reactions, boss pits, the boss entrance and
 * defeat; personality.mjs) is 3D form, light and motion, never a drawn face,
 * and it never moves a body off its collider or
 * never draws one wider than it: motion is squash, stretch and tilt around
 * the board-plane centre, normalised to the collider footprint.
 * Juice (flash, punch, shake, debris) is visual only and obeys
 * prefers-reduced-motion and the Effects: Reduced setting. Shake happens only
 * on card breaks, SOAP and deaths, capped at 0.08 u.
 */
import * as THREE from './vendor/three.module.js';
import { cameraLayout, FRAMING_POINTS, pxPerUnit } from './camera.mjs';
import { RULES, getLevel, chainMultiplier, antibodyOffsets } from './model.mjs';
import { SHAPES, SYRINGE, PALETTE, shapeFor } from './shapes.mjs';
import { COLLIDERS, NEEDLE, MARKER, GRAZE_RING, INJECT, markerQuad, spriteLayout, bulletQuad, enemyScale, bodyRadiusOf, bulletAxis, needleSegment } from './hitboxes.mjs';
import { characterOf, bodyMotion, bossMenace, marchTempo, bossLine, talkTime, DEFEAT_FINAL, DEFEAT_POPS } from './personality.mjs';
import { INTRO as BOSS_INTRO } from './bosses.mjs';

export { PALETTE };
export const PICKUP_STYLE = Object.freeze({
  mrna: { name: 'mRNA', color: PALETTE.amber },
  booster: { name: 'BOOSTER', color: PALETTE.amber },
  mask: { name: 'MASK', color: PALETTE.amber },
  soap: { name: 'SOAP', color: PALETTE.amber },
  vial: { name: 'VIAL', color: PALETTE.amber },
});
/** Under-glass backdrops: midtones only, no pink, no bullet-sized bright dots. */
const THEMES = {
  1: { name: 'AIRWAY', background: '#0a1416', floor: '#3c5f60', rim: '#69c6c0', rail: '#8fd8d0', fog: '#0a1416' },
  2: { name: 'LUNGS', background: '#0b1018', floor: '#4a5a72', rim: '#8fb4e6', rail: '#a9c6ee', fog: '#0b1018' },
  3: { name: 'BLOODSTREAM', background: '#0c1012', floor: '#3e5d5c', rim: '#72d0c4', rail: '#9adcd2', fog: '#0c1012' },
  4: { name: 'LAB / PETRI', background: '#0e0d07', floor: '#5c5634', rim: '#d8cf9a', rail: '#e4dcae', fog: '#0e0d07' },
};
const BULLET_Y = RULES.bulletY;
// Exponential easing per frame; a QA render with dt = 0 snaps to the target.
const ease = (dt, rate) => (dt > 0 ? Math.min(1, dt * rate) : 1);
const FLOOR_Y = -0.05;

// ---- Geometry helpers -----------------------------------------------------------
function merge(parts) {
  let total = 0;
  const prepared = parts.map(([g, m]) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    if (m) n.applyMatrix4(m);
    total += n.attributes.position.count;
    return n;
  });
  const pos = new Float32Array(total * 3),
    nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of prepared) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}
const UP = new THREE.Vector3(0, 1, 0);
const M = (x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, q = null) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q || new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
function fib(n, count) {
  const y = 1 - (2 * (n + 0.5)) / count,
    r = Math.sqrt(1 - y * y),
    a = n * 2.39996;
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
}
/** Spike directions: `ring` of them in the board plane (the original sprite's
 * eight in-plane spikes, what the steep camera sees first), the rest spread
 * over the upper hemisphere so the crown reads in 3D. */
function crownDirections(count, ring) {
  const dirs = [];
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + Math.PI / ring;
    dirs.push(new THREE.Vector3(Math.cos(a), 0.12, Math.sin(a)).normalize());
  }
  const rest = count - ring;
  for (let i = 0; i < rest; i++) {
    const v = fib(i, rest * 2);
    dirs.push(new THREE.Vector3(v.x, Math.abs(v.y) * 0.9 + 0.25, v.z).normalize());
  }
  return dirs;
}
function spikeParts({ count, r, length, stem, cap, ring = 0, detail = 1 }) {
  const out = [];
  const cyl = new THREE.CylinderGeometry(stem * 0.8, stem, length, 6, 1, true);
  const ball = new THREE.IcosahedronGeometry(cap, detail);
  for (const v of crownDirections(count, ring)) {
    const q = new THREE.Quaternion().setFromUnitVectors(UP, v);
    const mid = v.clone().multiplyScalar(r + length / 2 - 0.04);
    const tip = v.clone().multiplyScalar(r + length);
    out.push({ stem: [cyl, M(mid.x, mid.y, mid.z, 1, 1, 1, q)], cap: [ball, M(tip.x, tip.y, tip.z)], dir: v });
  }
  return out;
}
/** CDC-style club spikes: a thin stem and a flared head. */
function clubGeometry({ count, r, length, head, jitter = 0, groups = 0, spread = 0.4 }, seed = 1) {
  const parts = [];
  const stem = new THREE.CylinderGeometry(head * 0.32, head * 0.38, 1, 6);
  const cap = new THREE.CylinderGeometry(head, head * 0.55, head * 1.1, 9);
  let n = seed * 9301 + 17;
  const rnd = () => ((n = (n * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    let v = fib(i, count);
    if (groups) {
      // Horn clusters: spikes bunched around `groups` in-plane directions
      // (the first points up-field), so the crown reads as a triangle etc.
      const g = i % groups;
      const a = -Math.PI / 2 + (g / groups) * Math.PI * 2 + (rnd() - 0.5) * spread * 2;
      const up = 0.15 + (rnd() - 0.3) * spread;
      v = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize();
    }
    const len = length * (1 + (rnd() - 0.5) * jitter * 2);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, v);
    const mid = v.clone().multiplyScalar(r + len / 2);
    parts.push([stem, M(mid.x, mid.y, mid.z, 1, len, 1, q)]);
    const tip = v.clone().multiplyScalar(r + len);
    parts.push([cap, M(tip.x, tip.y, tip.z, 1, 1, 1, q)]);
  }
  return merge(parts);
}
function helixGeometry({ length, r, turns, amp }) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const k = i / 24,
      a = k * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * amp, Math.sin(a) * amp, (k - 0.5) * length));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, r, 6, false);
}
function dropGeometry({ r, length }) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    // Round head at +z (forward), tapering to a point behind.
    const a = t * Math.PI;
    const rad = Math.sin(a) * r * (t < 0.5 ? 1 : 1 - (t - 0.5) * 0.9);
    pts.push(new THREE.Vector2(Math.max(0.001, rad), r - t * length));
  }
  return new THREE.LatheGeometry(pts, 16).rotateX(Math.PI / 2);
}

// ---- Canvas textures --------------------------------------------------------------
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glow = (() => {
  let t;
  return () =>
    (t ||= canvasTexture(64, 64, (g) => {
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, '#ffffffc0');
      r.addColorStop(0.3, '#ffffff40');
      r.addColorStop(1, '#ffffff00');
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
    }));
})();
function sprite(color, size, opacity = 0.6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  s.scale.set(size, size, 1);
  return s;
}
/** Bullet sprites, drawn flat on the bullet plane, "up" = direction of travel.
 * Value contrast first: white core, pink/violet body, near-black outline. */
const DANGER = { pink: PALETTE.danger, violet: PALETTE.dangerViolet, core: PALETTE.dangerCore, rim: PALETTE.dangerRim };
/** A bullet family's sprite, laid out by hitboxes.spriteLayout: the solid
 * capsule (dark rim included) is exactly the collider; a soft glow outside it
 * is light, not matter. Canvas "up" is the direction of travel. */
const FAMILY_STYLE = {
  droplet: { body: DANGER_PINK(), core: true },
  aerosol: { body: '#ff5fb4', core: true },
  spike: { body: '#ff3fb7', core: true, stripe: true },
  rna: { body: '#b45cff', core: true },
  virion: { body: '#ff4fa3', crown: true },
  glob: { body: '#c75fd8', core: true, gloss: true },
};
function DANGER_PINK() {
  return '#ff4fa3';
}
function familyTexture(family) {
  const L = spriteLayout(family),
    st = FAMILY_STYLE[family];
  return canvasTexture(L.width, L.height, (g, w, h) => {
    const cx = w / 2,
      cy = h / 2,
      R = L.r,
      H = L.halfPx;
    const capsule = (r) => {
      g.beginPath();
      g.arc(cx, cy - H, r, Math.PI, 0);
      g.lineTo(cx + r, cy + H);
      g.arc(cx, cy + H, r, 0, Math.PI);
      g.closePath();
    };
    // Glow: light around the solid, never mistaken for it (low alpha).
    for (let i = 4; i >= 1; i--) {
      g.globalAlpha = 0.07;
      g.fillStyle = st.body;
      capsule(R + (L.margin * i) / 4);
      g.fill();
    }
    g.globalAlpha = 1;
    if (st.crown) {
      // The sprite's 8 spikes: decorative, drawn thin outside the body.
      g.strokeStyle = st.body;
      g.lineWidth = 4;
      g.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        g.lineTo(cx + Math.cos(a) * (R + L.margin - 6), cy + Math.sin(a) * (R + L.margin - 6));
        g.stroke();
        g.beginPath();
        g.arc(cx + Math.cos(a) * (R + L.margin - 5), cy + Math.sin(a) * (R + L.margin - 5), 4, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Solid: dark rim, coloured body, white core toward the front.
    g.fillStyle = DANGER.rim;
    capsule(R);
    g.fill();
    g.fillStyle = st.body;
    capsule(R - 4.5);
    g.fill();
    if (st.stripe) {
      g.fillStyle = '#ffd6ef';
      g.fillRect(cx - 3, cy - H, 6, H * 2 + R * 0.6);
    }
    if (st.crown) {
      g.strokeStyle = PALETTE.virus;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(cx, cy, R * 0.62, 0, Math.PI * 2);
      g.stroke();
    }
    if (st.core) {
      g.fillStyle = DANGER.core;
      g.beginPath();
      g.arc(cx, cy - H - R * 0.12, R * 0.42, 0, Math.PI * 2);
      g.fill();
    }
    if (st.gloss) {
      g.fillStyle = '#ffffff66';
      g.beginPath();
      g.ellipse(cx - R * 0.3, cy - R * 0.32, R * 0.32, R * 0.22, -0.5, 0, Math.PI * 2);
      g.fill();
    }
  });
}
/** QA probe only: the solid region of a sprite (a bullet family's capsule,
 * or the core marker's disc) as plain white, laid out exactly like the real
 * texture, so the drawn solid can be measured without its glow or rim. */
function solidMask(kind) {
  if (kind === 'dot')
    return canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(w / 2, h / 2, MARKER.texEdge, 0, Math.PI * 2);
      g.fill();
    });
  const L = spriteLayout(kind);
  return canvasTexture(L.width, L.height, (g, w, h) => {
    const cx = w / 2,
      cy = h / 2;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(cx, cy - L.halfPx, L.r, Math.PI, 0);
    g.lineTo(cx + L.r, cy + L.halfPx);
    g.arc(cx, cy + L.halfPx, L.r, 0, Math.PI);
    g.closePath();
    g.fill();
  });
}
function bulletTexture(kind) {
  if (COLLIDERS[kind]) return familyTexture(kind);
  return canvasTexture(128, 128, (g, w, h) => {
    g.translate(w / 2, h / 2);
    const outline = (path, body, core) => {
      g.lineJoin = 'round';
      g.lineWidth = 14;
      g.strokeStyle = DANGER.rim;
      path();
      g.stroke();
      g.fillStyle = body;
      path();
      g.fill();
      if (core) {
        g.fillStyle = DANGER.core;
        core();
        g.fill();
      }
    };
    if (kind === 'droplet') {
      // Teardrop: head at the top of the texture (front), tail behind.
      const drop = () => {
        g.beginPath();
        g.moveTo(0, 56);
        g.bezierCurveTo(30, 18, 30, -48, 0, -48);
        g.bezierCurveTo(-30, -48, -30, 18, 0, 56);
      };
      outline(drop, DANGER.pink, () => {
        g.beginPath();
        g.ellipse(0, -24, 11, 13, 0, 0, Math.PI * 2);
      });
    } else if (kind === 'aerosol') {
      outline(() => {
        g.beginPath();
        g.arc(0, 0, 44, 0, Math.PI * 2);
      }, '#ff9fd0', () => {
        g.beginPath();
        g.arc(0, 0, 18, 0, Math.PI * 2);
      });
    } else if (kind === 'spike') {
      // A club / lollipop: head at the front, stem behind.
      outline(() => {
        g.beginPath();
        g.roundRect(-9, -10, 18, 66, 8);
        g.moveTo(34, -28);
        g.arc(0, -28, 34, 0, Math.PI * 2);
      }, '#ff3fb7', () => {
        g.beginPath();
        g.arc(0, -28, 14, 0, Math.PI * 2);
      });
    } else if (kind === 'rna') {
      outline(() => {
        g.beginPath();
        g.arc(0, 0, 42, 0, Math.PI * 2);
      }, DANGER.violet, () => {
        g.beginPath();
        g.arc(0, 0, 16, 0, Math.PI * 2);
      });
    } else if (kind === 'virion') {
      // The original 8-spike crown: pink body, green "you can shoot this" ring.
      g.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.strokeStyle = DANGER.rim;
        g.lineWidth = 16;
        g.beginPath();
        g.moveTo(Math.cos(a) * 24, Math.sin(a) * 24);
        g.lineTo(Math.cos(a) * 50, Math.sin(a) * 50);
        g.stroke();
        g.strokeStyle = DANGER.pink;
        g.lineWidth = 8;
        g.stroke();
        g.fillStyle = DANGER.pink;
        g.beginPath();
        g.arc(Math.cos(a) * 52, Math.sin(a) * 52, 8, 0, Math.PI * 2);
        g.fill();
      }
      outline(() => {
        g.beginPath();
        g.arc(0, 0, 30, 0, Math.PI * 2);
      }, DANGER.pink, () => {
        g.beginPath();
        g.arc(0, 0, 10, 0, Math.PI * 2);
      });
      g.strokeStyle = PALETTE.virus;
      g.lineWidth = 6;
      g.beginPath();
      g.arc(0, 0, 22, 0, Math.PI * 2);
      g.stroke();
    } else if (kind === 'glob') {
      outline(() => {
        g.beginPath();
        g.ellipse(0, 0, 54, 50, 0.3, 0, Math.PI * 2);
      }, '#c75fd8', () => {
        g.beginPath();
        g.ellipse(-12, -12, 16, 12, 0.5, 0, Math.PI * 2);
      });
    } else if (kind === 'strand') {
      g.fillStyle = '#d6b2ff';
      g.fillRect(-6, -64, 12, 128);
    } else if (kind === 'needle') {
      // A thin cyan-white needle: bright tip, fading tail.
      const r = g.createLinearGradient(0, -64, 0, 64);
      r.addColorStop(0, '#ffffff');
      r.addColorStop(0.35, '#bff6ff');
      r.addColorStop(1, '#7fe8ff00');
      g.fillStyle = r;
      // The solid streak spans 80 of 128 px across: exactly the needle collider.
      g.beginPath();
      g.moveTo(0, -64);
      g.lineTo(40, -40);
      g.lineTo(40, 64);
      g.lineTo(-40, 64);
      g.lineTo(-40, -40);
      g.closePath();
      g.fill();
    } else if (kind === 'dot') {
      // The collision core marker: its outer edge (MARKER.texEdge of 64 px)
      // is exactly the collider. A dark rim, then the bright vaccine-white centre.
      g.fillStyle = '#04161c';
      g.beginPath();
      g.arc(0, 0, MARKER.texEdge, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#7fe8ff';
      g.beginPath();
      g.arc(0, 0, 50, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(0, 0, 36, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'dot-focus') {
      // Focus: the same marker with a thin white edge ring drawn ON the
      // collider's edge, inside it (RESEARCH_V1.md 4.3).
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(0, 0, MARKER.texEdge, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#04161c';
      g.beginPath();
      g.arc(0, 0, MARKER.texEdge - 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#7fe8ff';
      g.beginPath();
      g.arc(0, 0, 48, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(0, 0, 34, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'antigen') {
      g.fillStyle = '#e9fdff';
      g.beginPath();
      g.moveTo(0, -50);
      g.lineTo(40, 0);
      g.lineTo(0, 50);
      g.lineTo(-40, 0);
      g.closePath();
      g.fill();
    }
  });
}
/** Supply icons (amber, round): mRNA helix, BOOSTER vial, MASK, SOAP bubble, VIAL. */
export function drawPickupIcon(g, kind, w, color = PALETTE.amber) {
  const c = w / 2,
    r = w * 0.3;
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = w * 0.09;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  if (kind === 'mrna') {
    for (let i = 0; i <= 20; i++) {
      const t = i / 20,
        y = c - r + t * r * 2;
      g.lineTo(c + Math.sin(t * Math.PI * 2) * r * 0.55, y);
    }
    g.stroke();
    g.beginPath();
    for (let i = 0; i <= 20; i++) {
      const t = i / 20,
        y = c - r + t * r * 2;
      g.lineTo(c - Math.sin(t * Math.PI * 2) * r * 0.55, y);
    }
    g.stroke();
  } else if (kind === 'booster') {
    g.roundRect(c - r * 0.42, c - r * 0.7, r * 0.84, r * 1.6, r * 0.25);
    g.stroke();
    g.fillRect(c - r * 0.3, c - r * 0.05, r * 0.6, r * 0.7);
    g.fillRect(c - r * 0.5, c - r * 0.98, r, r * 0.25);
  } else if (kind === 'mask') {
    g.moveTo(c - r, c - r * 0.3);
    g.quadraticCurveTo(c, c - r * 0.75, c + r, c - r * 0.3);
    g.lineTo(c + r * 0.8, c + r * 0.35);
    g.quadraticCurveTo(c, c + r * 0.9, c - r * 0.8, c + r * 0.35);
    g.closePath();
    g.stroke();
  } else if (kind === 'soap') {
    g.arc(c, c, r * 0.8, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(c - r * 0.25, c - r * 0.25, r * 0.2, 0, Math.PI * 2);
    g.fill();
  } else {
    g.moveTo(c, c - r);
    g.lineTo(c, c + r);
    g.moveTo(c - r, c);
    g.lineTo(c + r, c);
    g.stroke();
  }
  g.restore();
}
function pickupTexture(kind) {
  return canvasTexture(96, 96, (g, w) => {
    // Dark disc, amber ring and a thin white outline: readable on any backdrop.
    g.fillStyle = '#120b02';
    g.beginPath();
    g.arc(48, 48, 46, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.stroke();
    g.strokeStyle = PALETTE.amber;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(48, 48, 40, 0, Math.PI * 2);
    g.stroke();
    drawPickupIcon(g, kind, w);
  });
}
/** Omicron node icons: what each spike node fires. */
function nodeTexture(kind) {
  return canvasTexture(96, 96, (g) => {
    g.fillStyle = '#0d1410cc';
    g.beginPath();
    g.arc(48, 48, 42, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffd6ec';
    g.fillStyle = '#ffd6ec';
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath();
    if (kind === 'cough') {
      g.moveTo(48, 20);
      g.lineTo(48, 76);
      g.moveTo(48, 20);
      g.lineTo(30, 70);
      g.moveTo(48, 20);
      g.lineTo(66, 70);
    } else if (kind === 'ring') {
      g.arc(48, 48, 24, 0, Math.PI * 2);
    } else if (kind === 'bloom') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        g.moveTo(48, 48);
        g.quadraticCurveTo(48 + Math.cos(a + 0.9) * 30, 48 + Math.sin(a + 0.9) * 30, 48 + Math.cos(a) * 28, 48 + Math.sin(a) * 28);
      }
    } else {
      for (let i = 0; i < 4; i++) g.moveTo(48, 20 + i * 15), g.lineTo(48, 26 + i * 15);
    }
    g.stroke();
  });
}
function textTexture(text, color, w = 128, h = 64) {
  return canvasTexture(w, h, (g) => {
    g.font = 'bold 40px ui-monospace, Menlo, Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = '#03100bcc';
    g.strokeText(text, w / 2, h / 2 + 2);
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

/** Under-glass backdrops: the inside of a body or a lab dish, midtones only. */
function backdropTexture(world) {
  return canvasTexture(512, 768, (g, w, h) => {
    let n = 1234 + world * 77;
    const rnd = () => ((n = (n * 16807) % 2147483647) / 2147483647);
    if (world === 1) {
      // AIRWAY: slate-teal trachea, cartilage rings, cilia rows, mucus sheen.
      g.fillStyle = '#2c4a4d';
      g.fillRect(0, 0, w, h);
      for (let y = -20; y < h + 40; y += 64) {
        g.strokeStyle = '#3d6366';
        g.lineWidth = 26;
        g.beginPath();
        g.moveTo(-10, y + 20);
        g.bezierCurveTo(w * 0.3, y - 6, w * 0.7, y + 46, w + 10, y + 20);
        g.stroke();
        g.strokeStyle = '#4b7375';
        g.lineWidth = 3;
        g.stroke();
        g.strokeStyle = '#36585b';
        g.lineWidth = 2;
        for (let x = 6; x < w; x += 9) {
          g.beginPath();
          g.moveTo(x, y + 44);
          g.lineTo(x + 3, y + 54 + Math.sin(x * 0.2) * 3);
          g.stroke();
        }
      }
      const sheen = g.createRadialGradient(w * 0.3, h * 0.4, 20, w * 0.3, h * 0.4, w * 0.8);
      sheen.addColorStop(0, '#9fd6cf22');
      sheen.addColorStop(1, '#9fd6cf00');
      g.fillStyle = sheen;
      g.fillRect(0, 0, w, h);
    } else if (world === 2) {
      // LUNGS: cool blue-grey alveoli clusters, a microscope tint.
      g.fillStyle = '#34405a';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const cx = rnd() * w,
          cy = rnd() * h;
        for (let k = 0; k < 7; k++) {
          const x = cx + (rnd() - 0.5) * 70,
            y = cy + (rnd() - 0.5) * 70,
            r = 18 + rnd() * 20;
          g.fillStyle = '#3e4c6a';
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#56688c';
          g.lineWidth = 3;
          g.stroke();
        }
      }
    } else if (world === 3) {
      // BLOODSTREAM: teal glass over desaturated drifting red cells. The
      // cells are raised discs with a soft lit rim and a paler dimple (they
      // read as cells, not as dark holes).
      g.fillStyle = '#2f5153';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 30; i++) {
        const x = rnd() * w,
          y = rnd() * h,
          r = 22 + rnd() * 14;
        g.save();
        g.translate(x, y);
        g.rotate(rnd() * 3);
        g.scale(1, 0.72);
        const cell = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
        cell.addColorStop(0, '#9a7a78');
        cell.addColorStop(0.55, '#7f6061');
        cell.addColorStop(1, '#6a5052');
        g.fillStyle = cell;
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#8f7372';
        g.beginPath();
        g.arc(0, 0, r * 0.45, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    } else {
      // LAB / PETRI: a darker olive agar (the old bright amber hid the pale
      // aerosol dots and the amber supplies) with muted colonies.
      const grad = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.9);
      grad.addColorStop(0, '#4f4a2c');
      grad.addColorStop(1, '#2b2914');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 22; i++) {
        const x = rnd() * w,
          y = rnd() * h,
          r = 16 + rnd() * 34;
        g.fillStyle = '#5c5634';
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#3e3a20';
        g.lineWidth = 3;
        g.stroke();
      }
    }
  });
}

// ---- Shape builder -----------------------------------------------------------------
/** Merged geometry is shared per shape spec (60 identical coronas share one
 * buffer); only materials are per enemy, for hit flashes. Shared geometry is
 * flagged so disposal never frees it. */
const geoCache = new WeakMap();
function cachedGeo(spec, key, make) {
  let m = geoCache.get(spec);
  if (!m) geoCache.set(spec, (m = new Map()));
  if (!m.has(key)) {
    const g = make();
    g.userData.shared = true;
    m.set(key, g);
  }
  return m.get(key);
}
/** Scientific-render look for virus materials (revision five, "make it more
 * 3D, not cartoon"): a membrane of small rounded proteins as a procedural
 * bump (two octaves of a sine lattice on the object-space position, so it
 * works on merged geometry without UVs and turns with the body) and a
 * fresnel rim that lights the silhouette like an electron-microscopy
 * render. Every material shares one shader program (one cache key). */
function microscopy(m, color, { bump = 0.42, freq = 19, rim = 0.5, power = 2.6 } = {}) {
  const rimColor = new THREE.Color(color).lerp(new THREE.Color('#f2fff8'), 0.55).multiplyScalar(rim);
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uBump: { value: bump }, uFreq: { value: freq }, uRim: { value: rimColor }, uRimPower: { value: power } });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nuniform mat3 normalMatrix;\nuniform float uBump, uFreq, uRimPower;\nuniform vec3 uRim;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 q = vObjPos * uFreq;
          vec3 g = vec3(cos(q.x) * sin(q.y) * sin(q.z), sin(q.x) * cos(q.y) * sin(q.z), sin(q.x) * sin(q.y) * cos(q.z));
          vec3 q2 = q * 2.3 + 1.7;
          g += 0.45 * vec3(cos(q2.x) * sin(q2.y) * sin(q2.z), sin(q2.x) * cos(q2.y) * sin(q2.z), sin(q2.x) * sin(q2.y) * cos(q2.z));
          vec3 gv = normalMatrix * g;
          normal = normalize(normal - uBump * (gv - dot(gv, normal) * normal));
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += uRim * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), uRimPower);`,
      );
  };
  m.customProgramCacheKey = () => 'virus-microscopy';
  return m;
}
/** Build a group for a shapes.mjs spec. Returns handles the animator uses. */
function buildShape(spec, { seed = 1, tint = null } = {}) {
  const body = new THREE.Group();
  const mats = [];
  const handles = { body, mats, spikes: [], petals: [], pits: [], membrane: null, crown: null };
  const mat = (color, extra = {}, look = null) => {
    // Lit and glossy (revision-four depth): low emissive so key, rim and
    // specular shading read; just enough self-light to keep greens vivid.
    // Glossy, lit membranes (low self-light so the key, rim and specular
    // shading carry the form), with the microscopy bump and rim.
    const m = microscopy(new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.05, emissive: color, emissiveIntensity: 0.07, ...extra }), color, look || (extra.transparent ? { bump: 0.12, rim: 0.7 } : {}));
    m.userData.base = m.emissiveIntensity;
    m.userData.baseColor = new THREE.Color(m.emissive);
    m.userData.baseTransparent = m.transparent;
    m.userData.baseOpacity = m.opacity;
    mats.push(m);
    return m;
  };
  const mainColor = tint || spec.color;
  // The CDC-style boss sphere: a lit mid-grey membrane with larger protein
  // bumps (flat near-white read as plastic); spikes take real shading.
  const grey = mainColor === PALETTE.bossBody;
  const bodyMat = grey ? mat('#bfc5cf', { roughness: 0.46, emissiveIntensity: 0.03 }, { bump: 0.55, freq: 11, rim: 0.45 }) : mat(mainColor);
  const spikeMat = spec.spikes ? mat(spec.spikes, { emissiveIntensity: 0.1, roughness: 0.26 }) : bodyMat;
  const add = (geo, m, at = [0, 0, 0], scale = [1, 1, 1]) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(...at);
    mesh.scale.set(...scale);
    body.add(mesh);
    return mesh;
  };
  // Popcorn is drawn many times at once (the 60-corona grid): low-detail
  // spheres, and body + stems (+ tips) merged into one mesh per material so
  // each virus costs one or two draw calls.
  const small = !spec.spikes && (spec.parts[0]?.r ?? 1) < 0.9;
  // Bosses get smooth, dense membranes; popcorn stays light (60 at once on
  // software WebGL), its smooth-shaded spheres carry the bump and rim.
  const detail = small ? 1 : 3;
  const batches = new Map();
  const batch = (m, geo, matrix) => {
    if (!batches.has(m)) batches.set(m, []);
    batches.get(m).push([geo, matrix]);
  };
  for (const [partIndex, p] of spec.parts.entries()) {
    const at = p.at || [0, 0, 0],
      sc = p.scale || [1, 1, 1];
    if (p.type === 'sphere') {
      const m = p.color ? mat(p.color, { emissiveIntensity: 0.6 }) : p.role === 'inner' ? mat(PALETTE.virus, { emissiveIntensity: 0.35 }) : p.role === 'nucleus' ? mat('#b9c2d6') : bodyMat;
      if (p.role === 'cargo') handles.cargo = add(new THREE.IcosahedronGeometry(p.r, detail), m, at, sc);
      else if (p.bumps) {
        // A lumpy, mutated body: vertices pushed inward only, so the drawn
        // footprint never exceeds the collider circle.
        const g = cachedGeo(spec, `bumpy${partIndex}`, () => {
          const geo = new THREE.IcosahedronGeometry(p.r, 4);
          const pos = geo.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i),
              y = pos.getY(i),
              z = pos.getZ(i);
            const k = 1 - p.bumps * (0.5 + 0.5 * Math.sin(x * 7.1) * Math.sin(y * 5.3 + 1) * Math.sin(z * 6.7 + 2));
            pos.setXYZ(i, x * k, y * k, z * k);
          }
          geo.computeVertexNormals();
          return geo;
        });
        add(g, m, at, sc);
      } else batch(m, new THREE.IcosahedronGeometry(p.r, detail), M(...at, ...sc));
    } else if (p.type === 'warts') {
      const wart = new THREE.IcosahedronGeometry(p.size, 1);
      for (let i = 0; i < p.count; i++) {
        const v = fib(i, p.count).multiplyScalar(p.r);
        batch(spikeMat, wart, M(v.x, v.y, v.z));
      }
    } else if (p.type === 'crown') {
      const parts = spikeParts({ ...p, detail: small ? 0 : 1 });
      const tipMat = p.tips ? mat(p.tips, { emissiveIntensity: 0.35 }) : p.role === 'inner' ? mat(PALETTE.virus, { emissiveIntensity: 0.35 }) : bodyMat;
      const stemMat = p.role === 'inner' ? tipMat : bodyMat;
      if (p.separate) {
        // Its own merged mesh (stems + tips), so the inhale can bristle the
        // decorative spikes without scaling the body.
        const g = new THREE.Group();
        const place = M(...at, ...sc);
        g.add(new THREE.Mesh(cachedGeo(spec, `crownStem${partIndex}`, () => merge(parts.map((q) => [q.stem[0], place.clone().multiply(q.stem[1])]))), stemMat));
        g.add(new THREE.Mesh(cachedGeo(spec, `crownCap${partIndex}`, () => merge(parts.map((q) => [q.cap[0], place.clone().multiply(q.cap[1])]))), tipMat));
        body.add(g);
        handles.crown = g;
      } else if (p.breakable) {
        // HEAVY CROWN: each spike is its own mesh so lost HP visibly snaps it off.
        for (const s of parts) {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(merge([s.stem]), stemMat), new THREE.Mesh(merge([s.cap]), tipMat));
          g.scale.set(...sc);
          body.add(g);
          handles.spikes.push(g);
        }
      } else {
        const place = M(...at, ...sc);
        for (const s of parts) {
          batch(stemMat, s.stem[0], place.clone().multiply(s.stem[1]));
          batch(tipMat, s.cap[0], place.clone().multiply(s.cap[1]));
        }
      }
    } else if (p.type === 'clubs') {
      add(cachedGeo(spec, `clubs${partIndex}`, () => clubGeometry(p, seed)), spikeMat, at, sc);
    } else if (p.type === 'shell') {
      const m = mat(spec.color, { transparent: true, opacity: 0.45, roughness: 0.1, emissiveIntensity: 0.08, depthWrite: false });
      handles.membrane = add(new THREE.IcosahedronGeometry(p.r, 3), m, at, sc);
    } else if (p.type === 'tube') {
      const m = p.role === 'proboscis' || p.role === 'mucus' ? mat(p.role === 'mucus' ? '#9fe7c4' : '#8fe6a7', { transparent: true, opacity: p.role === 'mucus' ? 0.4 : 1 }) : bodyMat;
      const mesh = add(cachedGeo(spec, `tube${p.role || ''}`, () => helixGeometry(p)), m, at);
      if (!p.role) handles.helix = mesh;
    } else if (p.type === 'torus') {
      const m = p.role === 'seam' || p.role === 'halo' ? mat('#ffffff', { emissiveIntensity: 0.5, transparent: true, opacity: 0.7 }) : p.role === 'belt' ? spikeMat : bodyMat;
      const mesh = add(new THREE.TorusGeometry(p.r, p.tube, 6, 40), m, at);
      mesh.rotation.x = p.role === 'seam' ? 0 : Math.PI / 2;
      if (p.role === 'seam') mesh.rotation.y = Math.PI / 2;
      handles[p.role || 'ringMesh'] = mesh;
    } else if (p.type === 'virions') {
      const mini = merge([[new THREE.IcosahedronGeometry(1, 1), null], ...spikeParts({ count: 8, r: 1, length: 0.6, stem: 0.18, cap: 0.24, ring: 8 }).flatMap((s) => [s.stem, s.cap])]);
      const m = mat(PALETTE.virus, { emissiveIntensity: 0.3 });
      for (let i = 0; i < p.count; i++) {
        const a = (i / p.count) * Math.PI * 2;
        add(mini, m, [Math.cos(a) * p.r, 0.05, Math.sin(a) * p.r], [p.size, p.size, p.size]);
      }
    } else if (p.type === 'drop') {
      handles.membrane = add(dropGeometry(p), mat(spec.color, { transparent: true, opacity: 0.42, roughness: 0.08, emissiveIntensity: 0.1, depthWrite: false }), at);
    } else if (p.type === 'pits') {
      // Sockets sunk into the membrane, each with a glowing core: the boss's
      // "eyes", built as geometry (dark, matte, recessed) and lit from inside
      // in its variant colour. Kept well inside the body's footprint (tested).
      const tint = spec.spikes || PALETTE.virus;
      const socketMat = new THREE.MeshStandardMaterial({ color: '#06090b', roughness: 0.85, metalness: 0, emissive: '#000000' });
      mats.push(socketMat);
      Object.assign(socketMat.userData, { base: 0, baseColor: new THREE.Color('#000000'), baseTransparent: false, baseOpacity: 1, keep: true });
      const centre = new THREE.Vector3(...(p.at || [0, 0, 0]));
      const ball = new THREE.IcosahedronGeometry(1, 2);
      for (const [x, y, z, size] of p.points) {
        const dir = new THREE.Vector3(x, y, z).normalize();
        const pos = dir.clone().multiplyScalar(p.r);
        pos.y *= p.lift ?? 1;
        pos.add(centre);
        const sr = size * p.r;
        // An almond socket: long along the surface's horizontal tangent,
        // shallow along the normal, slanted inner-end-down by `slant`.
        const t1 = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
        const t2 = dir.clone().cross(t1).normalize();
        const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(t1, t2, dir));
        q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (x < 0 ? 1 : x > 0 ? -1 : 0) * (p.slant ?? 0.25)));
        const socket = new THREE.Mesh(ball, socketMat);
        socket.quaternion.copy(q);
        socket.scale.set(1.35 * sr, 0.62 * sr, 0.6 * sr);
        socket.position.copy(pos).addScaledVector(dir, -0.25 * sr);
        // The glowing slit sits in front of the socket floor.
        const coreMat = new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0 });
        Object.assign(coreMat.userData, { base: 1.6, baseColor: new THREE.Color(tint), baseTransparent: false, baseOpacity: 1, keep: true });
        mats.push(coreMat);
        const core = new THREE.Group();
        const slit = new THREE.Mesh(ball, coreMat);
        slit.scale.set(0.82, 0.3, 0.36);
        core.add(slit);
        core.quaternion.copy(q);
        const r0 = sr;
        core.scale.setScalar(r0);
        core.position.copy(pos).addScaledVector(dir, 0.18 * sr);
        const glowS = sprite(tint, sr * 3.2, 0.3);
        glowS.position.copy(pos).addScaledVector(dir, 0.3 * sr);
        body.add(socket, core, glowS);
        handles.pits.push({ socket, core, coreMat, glow: glowS, r0, sr });
      }
    } else if (p.type === 'petals') {
      for (let i = 0; i < p.count; i++) {
        const pivot = new THREE.Group();
        pivot.rotation.y = (i / p.count) * Math.PI * 2;
        const petal = new THREE.Group();
        petal.position.x = p.r * 0.6;
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), bodyMat);
        leaf.scale.set(p.width * 0.5, p.length * 0.5, p.width * 0.32);
        leaf.position.y = p.length * 0.42;
        const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), mat(PALETTE.virus, { emissiveIntensity: 0.5 }));
        tip.position.y = p.length * 0.88;
        petal.add(leaf, tip);
        pivot.add(petal);
        body.add(pivot);
        handles.petals.push(petal);
      }
    }
  }
  let bi = 0;
  for (const [m, list] of batches) body.add(new THREE.Mesh(cachedGeo(spec, `batch${bi++}`, () => merge(list)), m));
  return handles;
}

export function createRenderer({ canvas, stage, settings }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral tone mapping keeps the virus greens saturated (ACES washed them
  // towards white under the steep key light).
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a1416');
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
  const fx = { trauma: 0, flash: 0 };
  let layout = cameraLayout(1, 1),
    themeWorld = 0,
    visualTime = 0,
    lastChainTier = 1,
    stateRef = null,
    hitboxesOn = false;

  // ---- Lights and the lab board -----------------------------------------------
  // Key (warm, high front-left), rim (cool, behind) and a soft sky fill:
  // shaded volumes with specular highlights and a bright edge on every body.
  scene.add(new THREE.HemisphereLight('#e4f6ff', '#15302e', 0.75));
  const key = new THREE.DirectionalLight('#fff4e6', 2.6);
  key.position.set(-6, 22, 10);
  scene.add(key);
  const rimLight = new THREE.DirectionalLight('#9fe8ff', 2.2);
  rimLight.position.set(5, 9, -18);
  scene.add(rimLight);


  const shared = new THREE.BoxGeometry(1, 1, 1);
  const dark = new THREE.MeshStandardMaterial({ color: '#0c1518', roughness: 0.6, metalness: 0.3 });
  const table = new THREE.Mesh(shared, dark);
  table.scale.set(23, 1, 31);
  table.position.y = -1.9;
  // The well walls between the glass and the deep backdrop.
  for (const [x, z, w, d] of [[-9.55, 0, 0.3, 27], [9.55, 0, 0.3, 27], [0, -13.55, 19.4, 0.3], [0, 13.55, 19.4, 0.3]]) {
    const wall = new THREE.Mesh(shared, dark);
    wall.scale.set(w, 1.3, d);
    wall.position.set(x, FLOOR_Y - 0.62, z);
    scene.add(wall);
  }
  scene.add(table);
  // Depth layering: the tissue / agar lies 1.2 u deep, under a tinted glass
  // floor with a faint grid, so perspective gives the board real parallax.
  const backdropMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(18.8, 26.8), backdropMat);
  backdrop.rotation.x = -Math.PI / 2;
  backdrop.position.y = FLOOR_Y - 1.2;
  scene.add(backdrop);
  // Unlit: a full-screen lit transparent layer was the costliest thing on
  // software WebGL; the tint and grid carry the glass read on their own.
  const glassFloorMat = new THREE.MeshBasicMaterial({ color: '#9fd8d0', transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false });
  const glassFloor = new THREE.Mesh(new THREE.PlaneGeometry(18.8, 26.8), glassFloorMat);
  glassFloor.rotation.x = -Math.PI / 2;
  glassFloor.position.y = FLOOR_Y;
  scene.add(glassFloor);
  {
    const pts = [];
    for (let x = -8; x <= 8; x += 2) pts.push(x, FLOOR_Y + 0.004, -13.2, x, FLOOR_Y + 0.004, 13.2);
    for (let z = -12; z <= 12; z += 2) pts.push(-9.4, FLOOR_Y + 0.004, z, 9.4, FLOOR_Y + 0.004, z);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: '#cfe9e6', transparent: true, opacity: 0.08 })));
  }
  // Glass rails: round tubes at the board edges (lab glassware, not neon).
  const railMat = new THREE.MeshStandardMaterial({ color: '#8fd8d0', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.7, emissive: '#8fd8d0', emissiveIntensity: 0.35 });
  for (const x of [-9.65, 9.65]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 27.4, 12), railMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(x, 0.18, 0);
    scene.add(rail);
  }
  for (const z of [-13.65, 13.65]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 19.6, 12), railMat);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 0.18, z);
    scene.add(rail);
  }
  // CURRENT streaks (bloodstream): faint flow dashes that drift with the twist.
  const STREAKS = 40;
  const streakMat = new THREE.MeshBasicMaterial({ color: '#d8fff6', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const streaks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 0.06).rotateX(-Math.PI / 2), streakMat, STREAKS);
  streaks.frustumCulled = false;
  const streakState = Array.from({ length: STREAKS }, (_, i) => ({ x: ((i * 7.3) % 18) - 9, z: -12.5 + ((i * 3.7) % 25) }));
  scene.add(streaks);

  const backdrops = {};
  function applyTheme(world) {
    if (world === themeWorld) return;
    themeWorld = world;
    const t = THEMES[world] || THEMES[1];
    scene.background.set(t.background);
    railMat.color.set(t.rail);
    railMat.emissive.set(t.rail);
    glassFloorMat.color.set(t.rim);
    rimLight.color.set(t.rim);
    backdropMat.map = backdrops[world] ||= backdropTexture(world);
    backdropMat.map.wrapS = backdropMat.map.wrapT = THREE.RepeatWrapping;
    backdropMat.color.set('#ffffff');
    backdropMat.needsUpdate = true;
  }

  // ---- The syringe (the hero) ---------------------------------------------------
  // RESEARCH_V1.md 4: 1.64 u long, every point inside the 1.0 u graze ring,
  // the glowing dose (the 0.2 u core marker, drawn separately on top) at the
  // barrel centre. Built straight from shapes.SYRINGE (z0 -> z1 along the
  // axis, negative up-field), so the drawing is the spec the tests measure.
  const ship = new THREE.Group();
  const syringe = new THREE.Group();
  ship.add(syringe);
  // Tilted 10 degrees on the core (was 20): the camera still sees the side of
  // the barrel, and the needle tip lifts only 0.17 u off the board plane.
  syringe.rotation.x = SYRINGE.tilt;
  syringe.scale.setScalar(SYRINGE.scale);
  scene.add(ship);
  // Glass, vaccine, rubber, plastic and steel: lit, shaded and glossy. Every
  // body material is transparent so focus can ghost the body to 35%.
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#e9fbff', transparent: true, opacity: 0.42, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false, side: THREE.DoubleSide });
  const fluidMat = new THREE.MeshStandardMaterial({ color: PALETTE.vaccine, emissive: '#1fb8d8', emissiveIntensity: 0.9, roughness: 0.15, metalness: 0, transparent: true });
  const steel = new THREE.MeshStandardMaterial({ color: '#f1f6fa', roughness: 0.18, metalness: 0.9, emissive: '#6fcfe8', emissiveIntensity: 0.12, transparent: true });
  const plastic = new THREE.MeshPhysicalMaterial({ color: '#f4f8fa', roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.3, transparent: true });
  const rubber = new THREE.MeshStandardMaterial({ color: '#1d2a33', roughness: 0.75, metalness: 0, transparent: true });
  const hubMat = new THREE.MeshPhysicalMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.75, roughness: 0.2, clearcoat: 0.8 });
  const outlineMat = new THREE.MeshBasicMaterial({ color: '#03080b', side: THREE.BackSide, transparent: true });
  const markMat = new THREE.MeshBasicMaterial({ color: '#0e3640', transparent: true });
  const bodyMats = [glassMat, fluidMat, steel, plastic, rubber, hubMat, outlineMat, markMat];
  for (const m of bodyMats) m.userData.opacity = m.opacity;
  const along = (geo) => geo.rotateX(Math.PI / 2); // cylinders run along z
  const partOf = (role) => SYRINGE.parts.find((p) => p.role === role);
  const mid = (p) => (p.z0 + p.z1) / 2,
    len = (p) => p.z1 - p.z0;
  const plunger = new THREE.Group();
  let fluid = null,
    meniscus = null,
    stopper = null,
    tipGlint = null;
  const barrel = partOf('barrel'),
    fluidPart = partOf('fluid');
  for (const p of SYRINGE.parts) {
    if (p.role === 'barrel') {
      syringe.add(new THREE.Mesh(along(new THREE.CylinderGeometry(p.r, p.r, len(p), 24, 1, true)), glassMat));
      // Dark silhouette shell: keeps the glass readable on any backdrop.
      syringe.add(new THREE.Mesh(along(new THREE.CylinderGeometry(p.r * 1.08, p.r * 1.08, len(p) * 1.01, 18)), outlineMat));
      for (const z of [p.z0, p.z1]) {
        const lip = new THREE.Mesh(new THREE.TorusGeometry(p.r, 0.022, 6, 24), plastic);
        lip.position.z = z;
        syringe.add(lip);
      }
    } else if (p.role === 'fluid') {
      // The vaccine: its level is EXPOSURE toward the next SOAP (grazes /
      // 100), filling from the needle end; a domed meniscus caps it.
      fluid = new THREE.Mesh(along(new THREE.CylinderGeometry(p.r, p.r, 1, 20)), fluidMat);
      syringe.add(fluid);
      meniscus = new THREE.Mesh(new THREE.SphereGeometry(p.r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), fluidMat);
      meniscus.scale.set(1, 1, 0.3);
      syringe.add(meniscus);
      stopper = new THREE.Group();
      stopper.add(new THREE.Mesh(along(new THREE.CylinderGeometry(p.r, p.r, 0.08, 20)), rubber));
      syringe.add(stopper);
    } else if (p.role === 'hub') {
      const hub = new THREE.Mesh(along(new THREE.CylinderGeometry(p.r, p.r1, len(p), 8)), hubMat);
      hub.position.z = mid(p);
      syringe.add(hub);
    } else if (p.role === 'needle') {
      // Shaft + cone tip; the dark 0.06 u outline keeps it visible on light
      // backdrops. The white glint is INJECT's "loaded" light.
      const shaft = len(p) - 0.12;
      const needle = new THREE.Mesh(along(new THREE.CylinderGeometry(p.r, p.r, shaft, 10)), steel);
      needle.position.z = p.z1 - shaft / 2;
      const tip = new THREE.Mesh(along(new THREE.ConeGeometry(p.r, 0.12, 8)).rotateX(Math.PI), steel);
      tip.position.z = p.z0 + 0.06;
      const outline = new THREE.Mesh(along(new THREE.CylinderGeometry(p.outline, p.outline, len(p) - 0.04, 6)), outlineMat);
      outline.position.z = mid(p) + 0.02;
      syringe.add(needle, tip, outline);
      tipGlint = sprite('#ffffff', 0.32, 0.85);
      tipGlint.position.z = p.z0;
      syringe.add(tipGlint);
    } else if (p.role === 'plunger rod') {
      const rod = new THREE.Mesh(along(new THREE.CylinderGeometry(p.r, p.r, len(p), 10)), plastic);
      rod.position.z = mid(p);
      plunger.add(rod);
    } else if (p.type === 'disc') {
      const disc = new THREE.Mesh(along(new THREE.CylinderGeometry(p.r, p.r, len(p), 24)), plastic);
      disc.position.z = mid(p);
      plunger.add(disc);
    } else if (p.type === 'collar') {
      // Rounded torus around the barrel's back end: outer radius = p.r.
      const tube = len(p) / 2;
      const collar = new THREE.Mesh(new THREE.TorusGeometry(p.r - tube, tube, 10, 28), plastic);
      collar.position.z = mid(p);
      syringe.add(collar);
    } else if (p.type === 'marks') {
      for (let i = 0; i < p.count; i++) {
        const mark = new THREE.Mesh(new THREE.TorusGeometry(p.r, i % 2 ? 0.006 : 0.011, 4, 24, i % 2 ? Math.PI * 0.6 : Math.PI * 1.1), markMat);
        mark.rotation.z = Math.PI * 0.45;
        mark.position.z = p.z0 + (i * (p.z1 - p.z0)) / (p.count - 1);
        syringe.add(mark);
      }
    }
  }
  syringe.add(plunger);
  void barrel;
  let ghost = 1,
    coreHot = false,
    exposureLevel = 0;
  const shipLight = new THREE.PointLight(PALETTE.vaccine, 6, 5);
  scene.add(shipLight);
  // Antibody options: Y-shaped, cyan.
  const yGeo = merge([
    [new THREE.CapsuleGeometry(0.07, 0.34, 2, 6), M(0, 0, 0.16, 1, 1, 1, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2))],
    [new THREE.CapsuleGeometry(0.06, 0.28, 2, 6), M(-0.12, 0, -0.14, 1, 1, 1, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, -0.7)))],
    [new THREE.CapsuleGeometry(0.06, 0.28, 2, 6), M(0.12, 0, -0.14, 1, 1, 1, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0.7)))],
  ]);
  // 60% opacity: the antibodies never read as part of the body.
  const optionMat = new THREE.MeshStandardMaterial({ color: PALETTE.vaccine, emissive: PALETTE.vaccine, emissiveIntensity: 0.8, transparent: true, opacity: 0.6 });
  const options = Array.from({ length: 4 }, () => {
    const m = new THREE.Mesh(yGeo, optionMat);
    m.scale.setScalar(1.25);
    scene.add(m);
    return m;
  });

  // ---- Instanced bullets, needles, tokens and debris ------------------------------
  const FAM = ['droplet', 'aerosol', 'spike', 'rna', 'virion', 'glob'];
  const MAXB = RULES.maxBullets;
  const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  function pool(kind, count, order, extra = {}) {
    // Bullets are small on screen: bilinear sampling without mipmaps is
    // indistinguishable and much cheaper for software rasterizers.
    const map = bulletTexture(kind);
    map.generateMipmaps = false;
    map.minFilter = THREE.LinearFilter;
    const m = new THREE.InstancedMesh(
      flat,
      new THREE.MeshBasicMaterial({ map, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, ...extra }),
      count,
    );
    m.renderOrder = order;
    m.frustumCulled = false;
    m.count = 0;
    scene.add(m);
    return m;
  }
  const bullets = Object.fromEntries(FAM.map((f, i) => [f, pool(f, MAXB, 60 - i)]));
  const quads = Object.fromEntries(FAM.map((f) => [f, bulletQuad(f)]));
  // Big slow bullets underneath, small fast ones on top (Boghog): globs 55 ... droplets 60.
  bullets.glob.renderOrder = 54;
  bullets.virion.renderOrder = 55;
  bullets.aerosol.renderOrder = 61;
  for (const f of FAM) bullets[f].setColorAt(0, new THREE.Color('#ffffff'));
  const strands = pool('strand', MAXB, 53, { opacity: 0.65 });
  const needles = pool('needle', 220, 40, { opacity: 0.55 });
  const antigenPool = pool('antigen', 240, 45);
  const dot = pool('dot', 1, 80);
  dot.count = 1;
  const dotMaps = { plain: dot.material.map, focus: bulletTexture('dot-focus') };
  // Graze feedback while unfocused: a 0.2 s arc of the ring at the bullet's
  // bearing (the ring itself shows only in focus).
  const grazeArcs = Array.from({ length: 8 }, () => {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(GRAZE_RING.inner - 0.03, GRAZE_RING.outer, 12, 1, -0.35, 0.7).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: PALETTE.vaccine, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }),
    );
    m.renderOrder = 79;
    m.visible = false;
    m.userData.life = 0;
    scene.add(m);
    return m;
  });
  let grazeArcCursor = 0;
  const grazeRing = new THREE.Mesh(
    new THREE.RingGeometry(GRAZE_RING.inner, GRAZE_RING.outer, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: PALETTE.vaccine, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }),
  );
  grazeRing.renderOrder = 79;
  scene.add(grazeRing);
  const DEBRIS = 300;
  const debris = new THREE.InstancedMesh(shared, new THREE.MeshLambertMaterial(), DEBRIS);
  debris.frustumCulled = false;
  debris.count = 0;
  scene.add(debris);
  const debrisState = Array.from({ length: DEBRIS }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), s: 0.1 }));
  let debrisCursor = 0;
  const tmp = new THREE.Object3D(),
    tmpColor = new THREE.Color();
  debris.setColorAt(0, tmpColor.set('#ffffff'));

  // MASK: the drawn 120 degree frontal arc is exactly where it absorbs.
  const maskArc = new THREE.Mesh(
    new THREE.RingGeometry(RULES.maskRadius - 0.08, RULES.maskRadius, 32, 1, Math.PI / 2 - RULES.maskArc, RULES.maskArc * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: PALETTE.vaccine, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  maskArc.renderOrder = 78;
  maskArc.visible = false;
  scene.add(maskArc);

  // ---- Dev hitbox overlay (?hitboxes=1, or __game.hitboxes(true)) ----------------
  // Every collider as a line drawing on the board plane: red = hostile,
  // cyan = the syringe, amber = supplies, white = SOAP. Off for players.
  const HB_MAX = 60000;
  const hbPos = new Float32Array(HB_MAX * 3),
    hbCol = new Float32Array(HB_MAX * 3);
  const hbGeo = new THREE.BufferGeometry();
  hbGeo.setAttribute('position', new THREE.BufferAttribute(hbPos, 3));
  hbGeo.setAttribute('color', new THREE.BufferAttribute(hbCol, 3));
  const hbLines = new THREE.LineSegments(hbGeo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, toneMapped: false }));
  hbLines.renderOrder = 99;
  hbLines.frustumCulled = false;
  hbLines.visible = false;
  scene.add(hbLines);
  function syncHitboxes(s) {
    hbLines.visible = hitboxesOn;
    if (!hitboxesOn) return;
    let n = 0;
    const c = new THREE.Color();
    const seg = (ax, az, bx, bz, col) => {
      if (n + 2 > HB_MAX) return;
      c.set(col);
      hbPos.set([ax, BULLET_Y + 0.03, az, bx, BULLET_Y + 0.03, bz], n * 3);
      hbCol.set([c.r, c.g, c.b, c.r, c.g, c.b], n * 3);
      n += 2;
    };
    const arc = (x, z, r, a0, a1, col, steps = 16) => {
      for (let i = 0; i < steps; i++) {
        const p = a0 + ((a1 - a0) * i) / steps,
          q = a0 + ((a1 - a0) * (i + 1)) / steps;
        seg(x + Math.cos(p) * r, z + Math.sin(p) * r, x + Math.cos(q) * r, z + Math.sin(q) * r, col);
      }
    };
    const capsule = (ax, az, bx, bz, r, col) => {
      const dx = bx - ax,
        dz = bz - az,
        L = Math.hypot(dx, dz);
      if (L < 1e-6) return arc(ax, az, r, 0, Math.PI * 2, col, 20);
      const a = Math.atan2(dz, dx);
      const nx = (-dz / L) * r,
        nz = (dx / L) * r;
      seg(ax + nx, az + nz, bx + nx, bz + nz, col);
      seg(ax - nx, az - nz, bx - nx, bz - nz, col);
      arc(bx, bz, r, a - Math.PI / 2, a + Math.PI / 2, col, 10);
      arc(ax, az, r, a + Math.PI / 2, a + (3 * Math.PI) / 2, col, 10);
    };
    for (const e of s.enemies) if (e.alive) capsule(e.x - (e.half || 0), e.z, e.x + (e.half || 0), e.z, e.radius, e.harmless ? '#ffd0d0' : '#ff3030');
    for (const b of s.enemyShots) {
      const [ax, az, bx, bz] = bulletAxis(b);
      capsule(ax, az, bx, bz, b.hit, '#ff3030');
    }
    for (const sh of s.shots) {
      const [ax, az, bx, bz] = needleSegment(sh);
      capsule(ax, az, bx, bz, NEEDLE.r, '#00ffff');
    }
    for (const p of s.pickups) arc(p.x, p.z, p.radius, 0, Math.PI * 2, '#ffc65a', 20);
    for (const bm of s.beams) {
      const x0 = bm.x - bm.width / 2,
        x1 = bm.x + bm.width / 2;
      seg(x0, bm.fromZ, x0, 13.4, '#ff3030');
      seg(x1, bm.fromZ, x1, 13.4, '#ff3030');
      seg(x0, bm.fromZ, x1, bm.fromZ, '#ff3030');
    }
    if (s.soapRing) arc(s.soapRing.x, s.soapRing.z, s.soapRing.r, 0, Math.PI * 2, '#ffffff', 48);
    arc(s.ship.x, s.ship.z, s.ship.radius, 0, Math.PI * 2, '#00ffff', 20);
    arc(s.ship.x, s.ship.z, RULES.grazeRadius, 0, Math.PI * 2, '#00ffff', 40);
    hbGeo.setDrawRange(0, n);
    hbGeo.attributes.position.needsUpdate = true;
    hbGeo.attributes.color.needsUpdate = true;
  }

  // SOAP ring: a soap-film bubble (cyan rim, white sheen).
  // Clipped to the board so it never spills over the instrument panels.
  renderer.localClippingEnabled = true;
  const boardClip = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 9.4), new THREE.Plane(new THREE.Vector3(1, 0, 0), 9.4), new THREE.Plane(new THREE.Vector3(0, 0, -1), 13.4), new THREE.Plane(new THREE.Vector3(0, 0, 1), 13.4)];
  const soap = new THREE.Group();
  const soapRim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 96), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthTest: false, toneMapped: false, clippingPlanes: boardClip }));
  soapRim.rotation.x = Math.PI / 2;
  const soapRim2 = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.008, 6, 96), new THREE.MeshBasicMaterial({ color: PALETTE.vaccine, transparent: true, opacity: 0.8, depthTest: false, toneMapped: false, clippingPlanes: boardClip }));
  soapRim2.rotation.x = Math.PI / 2;
  const soapFilm = new THREE.Mesh(new THREE.RingGeometry(0.55, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: PALETTE.vaccine, transparent: true, opacity: 0.2, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, clippingPlanes: boardClip }));
  soap.add(soapRim, soapRim2, soapFilm);
  soap.renderOrder = 70;
  soap.visible = false;
  scene.add(soap);

  // ---- Contact shadows: a soft dark disc under every body (cheap AO) -------------
  const shadowTex = canvasTexture(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, '#000000aa');
    r.addColorStop(0.6, '#00000044');
    r.addColorStop(1, '#00000000');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });
  const SHADOWS = 160;
  const shadowPool = new THREE.InstancedMesh(flat, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }), SHADOWS);
  shadowPool.renderOrder = 4;
  shadowPool.frustumCulled = false;
  shadowPool.count = 0;
  scene.add(shadowPool);
  // Light comes from the front-left: shadows fall back and to the right.
  const SHADOW_DX = 0.18,
    SHADOW_DZ = -0.3;
  function syncShadows(s) {
    let n = 0;
    const put = (x, z, r, k = 1) => {
      if (n >= SHADOWS) return;
      tmp.position.set(x + SHADOW_DX * k, FLOOR_Y + 0.006, z + SHADOW_DZ * k);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(r * 2.4, 1, r * 2.1);
      tmp.updateMatrix();
      shadowPool.setMatrixAt(n++, tmp.matrix);
    };
    if (s.phase !== 'title') {
      for (const e of s.enemies) if (e.alive && e.z > -13.2) put(e.x, e.z, e.radius + (e.half || 0) * 0.6, e.kind === 'boss' ? 1.6 : 1);
      if (s.ship.respawn <= 0) put(s.ship.x, s.ship.z + 0.3, 0.55, 1);
      for (const p of s.pickups) put(p.x, p.z, p.radius * 0.8, 1);
    }
    shadowPool.count = n;
    shadowPool.instanceMatrix.needsUpdate = true;
  }

  // ---- Telegraph meshes ----------------------------------------------------------
  const teleMeshes = new Map();
  const ringGeo = new THREE.RingGeometry(1.15, 1.42, 36);
  const pinkRingGeo = new THREE.RingGeometry(1.22, 1.36, 36);
  const dangerMat = (opacity = 0.8) => new THREE.MeshBasicMaterial({ color: PALETTE.danger, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  /** Flat dashes on the glass. WebGL lines are 1 px; quads stay legible. */
  function dashed(points, color, dash = 0.45, width = 0.2, solid = false, y = FLOOR_Y + 0.06) {
    const pos = [];
    for (let i = 1; i < points.length; i++) {
      const [x0, z0] = points[i - 1],
        [x1, z1] = points[i];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 1e-4) continue;
      const ux = (x1 - x0) / len,
        uz = (z1 - z0) / len,
        nx = -uz * width * 0.5,
        nz = ux * width * 0.5;
      const step = solid ? len : dash * 1.7;
      for (let d = 0; d < len; d += step) {
        const e = Math.min(len, d + (solid ? len : dash));
        const ax = x0 + ux * d,
          az = z0 + uz * d,
          bx = x0 + ux * e,
          bz = z0 + uz * e;
        pos.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz, ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.renderOrder = 30;
    return m;
  }
  const disposeObj = (m) => {
    scene.remove(m);
    m.traverse((c) => {
      if (c.geometry && !c.geometry.userData.shared && c.geometry !== shared && c.geometry !== flat && c.geometry !== ringGeo && c.geometry !== pinkRingGeo) c.geometry.dispose();
      if (c.material && c.material.map !== glow()) c.material.dispose?.();
    });
  };

  // ---- Enemies --------------------------------------------------------------------
  const enemyMeshes = new Map(),
    pickupMeshes = new Map();
  const pickupTextures = Object.fromEntries(Object.keys(PICKUP_STYLE).map((k) => [k, pickupTexture(k)]));
  const nodeTextures = Object.fromEntries(['cough', 'ring', 'bloom', 'drip'].map((k) => [k, nodeTexture(k)]));
  function addEnemy(e) {
    const bossType = stateRef?.boss?.type;
    const spec = shapeFor(e, bossType);
    const group = new THREE.Group();
    const h = buildShape(spec, { seed: e.id.length + (e.col || 0) });
    // group (board position, collider scale) -> tilt (squash, stretch, tilt
    // around the centre) -> body (yaw: the crown's sway and twitch).
    const tilt = new THREE.Group();
    tilt.add(h.body);
    group.add(tilt);
    // Warning ring under an enemy about to fire: dark outline + bright pink.
    const warning = new THREE.Group();
    const o = new THREE.Mesh(ringGeo, dangerMat(0.8));
    o.material.color.set(PALETTE.dangerRim);
    const pinkRing = new THREE.Mesh(pinkRingGeo, dangerMat(1));
    pinkRing.position.z = 0.02;
    warning.add(o, pinkRing);
    warning.rotation.x = -Math.PI / 2;
    warning.visible = false;
    warning.renderOrder = 31;
    group.add(warning);
    // Visual size: the body slightly larger than the collision radius.
    // The body sphere is drawn at exactly the collider radius (hitboxes.mjs).
    const scale = enemyScale(e, spec);
    group.scale.setScalar(scale);
    const char = characterOf(e, bossType);
    const bodySphere = spec.parts.find((q) => q.type === 'sphere' && !q.role);
    const ud = {
      ...h,
      tilt,
      warning,
      pinkRing,
      scale,
      flash: 0,
      punch: 0,
      spec,
      kind: e.kind,
      char,
      // Vertical stretch of the drawn body (BETA 1.38, GAMMA 0.7).
      aspect: bodySphere?.scale?.[1] ?? 1,
      bodyR: bodyRadiusOf(spec),
      hurt: 0,
      recoil: 0,
      talk: 0,
      land: 0,
      boss: e.kind === 'boss',
    };
    if (e.kind === 'boss' && e.part === 'node') {
      ud.glyph = new THREE.Sprite(new THREE.SpriteMaterial({ map: nodeTextures[e.tag], transparent: true, depthWrite: false, toneMapped: false }));
      ud.glyph.position.set(0, 2.2, 0);
      ud.glyph.scale.set(1.5, 1.5, 1);
      group.add(ud.glyph);
    }
    if (e.kind === 'boss' && e.part !== 'node') {
      ud.halo = sprite('#ffffff', 5, 0);
      group.add(ud.halo);
      // A variant-coloured aura behind every boss: glow and depth.
      const aura = sprite(spec.spikes || spec.color, 4.2, 0.22);
      aura.position.y = -0.3;
      group.add(aura);
    }
    if (e.kind === 'vesicle') {
      ud.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: pickupTextures[e.carry || 'mrna'], transparent: true, depthWrite: false, toneMapped: false }));
      ud.icon.scale.set(0.9, 0.9, 1);
      ud.icon.position.y = 0.2;
      group.add(ud.icon);
    }
    group.userData = ud;
    scene.add(group);
    enemyMeshes.set(e.id, group);
    return group;
  }

  function addPickup(p) {
    const group = new THREE.Group();
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: pickupTextures[p.kind] || pickupTextures.mrna, transparent: true, depthWrite: false, toneMapped: false }));
    icon.scale.set(p.radius * 2, p.radius * 2, 1);
    group.add(icon, sprite(PALETTE.amber, 2.2, 0.35));
    group.userData = { icon };
    scene.add(group);
    pickupMeshes.set(p.id, group);
    return group;
  }

  function spawnDebris(x, z, color, count, power = 1) {
    if (!settings.effects()) return;
    for (let i = 0; i < count; i++) {
      const d = debrisState[debrisCursor],
        idx = debrisCursor;
      debrisCursor = (debrisCursor + 1) % DEBRIS;
      // Green voxel cubes (the sprite's pixels), dim and on the floor plane so
      // nothing in the debris can be mistaken for a bullet.
      d.life = 0.9;
      d.s = 0.12 + Math.random() * 0.1 * power;
      d.p.set(x + (Math.random() - 0.5) * 0.6, FLOOR_Y + d.s / 2, z + (Math.random() - 0.5) * 0.6);
      d.v.set((Math.random() - 0.5) * 6 * power, 2 + Math.random() * 2, (Math.random() - 0.5) * 6 * power);
      d.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      debris.setColorAt(idx, tmpColor.set(color).multiplyScalar(0.3));
    }
    if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
  }
  function updateDebris(dt) {
    let n = 0;
    for (let i = 0; i < DEBRIS; i++) {
      const d = debrisState[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      d.v.y -= 18 * dt;
      d.p.addScaledVector(d.v, dt);
      const floor = FLOOR_Y + d.s / 2;
      if (d.p.y < floor) {
        d.p.y = floor;
        d.v.y *= -0.25;
        d.v.x *= 0.6;
        d.v.z *= 0.6;
      }
      d.v.multiplyScalar(Math.max(0, 1 - dt * 3));
      tmp.position.copy(d.p);
      tmp.rotation.set(d.r.x * (4 - d.life), d.r.y * (4 - d.life), 0);
      tmp.scale.setScalar(Math.max(0.001, d.s * Math.min(1, d.life / 0.6)));
      tmp.updateMatrix();
      debris.setMatrixAt(i, tmp.matrix);
      n = i + 1;
    }
    for (let i = 0; i < n; i++)
      if (debrisState[i].life <= 0) {
        tmp.scale.setScalar(0.0001);
        tmp.updateMatrix();
        debris.setMatrixAt(i, tmp.matrix);
      }
    debris.count = n;
    debris.instanceMatrix.needsUpdate = true;
  }
  const bursts = [];
  function addBurst(x, z, color, size = 2.2) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, FLOOR_Y + 0.08, z);
    const flash = sprite(color, size * 1.6, 0.7);
    flash.position.set(x, 0.8, z);
    scene.add(mesh, flash);
    bursts.push({ mesh, flash, life: 0.45, size });
  }

  // ---- Events -> juice ------------------------------------------------------------
  /** The mesh of the boss part that speaks a line (a named twin, else the core). */
  function speakerMesh(s, line) {
    const parts = (s?.enemies || []).filter((e) => e.kind === 'boss' && e.alive && e.part !== 'node');
    const who = line.speaker ? parts.find((e) => e.tag === line.speaker) : parts[0];
    return who ? enemyMeshes.get(who.id) : null;
  }
  function onEvent(ev, s) {
    const motion = settings.effects();
    if (ev.type === 'hit' && ev.id) {
      const m = enemyMeshes.get(ev.id);
      if (m) {
        const ud = m.userData;
        // Auto-fire hits a boss 8+ times a second: its flash is short and soft
        // so the grey body and green spikes stay readable, and it flinches at
        // most once a second (a constant squint would hide its face).
        if (ev.kind === 'boss') {
          Object.assign(ud, { flash: 0.025, soft: true });
          if (!(ud.flinchAt > visualTime - 1)) {
            ud.flinchAt = visualTime;
            ud.hurt = 0.12;
          }
        } else Object.assign(ud, { flash: 0.06, soft: false, hurt: 0.14 });
      }
    } else if (ev.type === 'kill') {
      if (ev.kind === 'boss') fx.trauma += 0.3; // the defeat sequence carries the payoff
      else {
        spawnDebris(ev.x, ev.z, PALETTE.virus, ev.kind === 'boss-part' ? 18 : ev.kind === 'mini' ? 3 : 5, 1);
        if (ev.id) startPop(ev.id, ev.kind === 'boss-part' || ev.kind === 'heavy');
      }
      if (ev.kind === 'virion-bullet') addBurst(ev.x, ev.z, PALETTE.vaccine, 0.5);
    } else if (ev.type === 'boss-defeated') startDefeat(ev);
    else if (ev.type === 'sneeze' && ev.owner) {
      const m = enemyMeshes.get(ev.owner);
      if (m) m.userData.recoil = 0.25;
    } else if (ev.type === 'card-start' || (ev.type === 'damage' && s?.boss)) {
      const line = bossLine(ev, s);
      const m = line && speakerMesh(s, line);
      if (m) m.userData.talk = talkTime(line.text);
    } else if (ev.type === 'burst') addBurst(ev.x, ev.z, '#f0f4f8', ev.radius);
    if (ev.type === 'damage') {
      mood.gloat = 1.6; // every villain gloats
      fx.trauma += 0.5;
      fx.flash = 0.55;
      addBurst(ev.x, ev.z, PALETTE.danger, 3);
      addBurst(ev.x, ev.z, '#ffffff', 1.4);
      spawnDebris(ev.x, ev.z, PALETTE.vaccine, 14, 1.3);
    } else if (ev.type === 'hit-core') {
      addBurst(ev.x, ev.z, PALETTE.danger, 1.8);
    } else if (ev.type === 'respawn') addBurst(ev.x, Math.min(ev.z, 12.5), PALETTE.vaccine, 2);
    else if (ev.type === 'bomb') {
      if (ev.rescued) mood.shock = 0.9; // a deathbomb: villains are shocked
      fx.trauma += 0.45;
      fx.flash = Math.max(fx.flash, 0.25);
      addBurst(ev.x, ev.z, '#ffffff', 3.5);
      addBurst(ev.x, ev.z, PALETTE.vaccine, 6);
    }
    else if (ev.type === 'phase-break') fx.trauma += 0.5;
    else if (ev.type === 'spark') addBurst(ev.x, ev.z, PALETTE.vaccine, 0.5);
    else if (ev.type === 'split') addBurst(ev.x, ev.z, '#ffffff', 1.6);
    else if (ev.type === 'cured') addBurst(ev.x, ev.z, PALETTE.vaccine, 1.6);
    else if (ev.type === 'splash') addBurst(ev.x, ev.z, PALETTE.danger, 1.2);
    else if (ev.type === 'graze') {
      // The arc at the bullet's bearing (RingGeometry's arc is centred on +x;
      // after rotateX(-pi/2) a y rotation phi points it at (cos phi, -sin phi)).
      const a = grazeArcs[grazeArcCursor++ % grazeArcs.length];
      a.rotation.y = Math.atan2(-(ev.z - (s?.ship.z ?? 0)), ev.x - (s?.ship.x ?? 0));
      a.userData.life = 0.2;
      if (motion && Math.random() < 0.5) addBurst(ev.x, ev.z, '#e9fdff', 0.25);
    }
    fx.trauma = Math.min(1, fx.trauma);
  }

  // ---- Per-frame sync --------------------------------------------------------------
  function telegraphOwners(s) {
    const out = new Map();
    for (const em of s.emitters || []) if (em.state === 'tele' && em.ownerId) out.set(em.ownerId, em);
    return out;
  }
  // Shared moods: the player lost a vial (villains gloat) or deathbombed out
  // of a hit (villains are shocked). Seconds left; set by onEvent.
  const mood = { gloat: 0, shock: 0, march: 0, lastState: null };
  function syncEnemies(s, dt) {
    const live = new Set();
    const b = s.boss;
    const tele = telegraphOwners(s);
    const motion = settings.effects();
    const title = s.phase === 'title';
    const running = !s.paused && s.phase === 'playing';
    if (running) {
      mood.gloat = Math.max(0, mood.gloat - dt);
      mood.shock = Math.max(0, mood.shock - dt);
      // The march phase (in beats) at the bass bed's tempo, for the choir.
      mood.march += (dt * marchTempo(s)) / 60;
    }
    const gloat = Math.min(1, mood.gloat / 0.4),
      shock = Math.min(1, mood.shock / 0.3);
    const bossFrac = b && b.state !== 'defeated' ? Math.max(0, b.hp) / Math.max(1, b.maxHp) : 1;
    for (const e of s.enemies) {
      if (!e.alive || title) continue;
      live.add(e.id);
      let m = enemyMeshes.get(e.id);
      // A HIJACKER turns a WILD TYPE into a HEAVY CROWN in place: rebuild the
      // mesh, or the old body would be drawn smaller than its new collider.
      if (m && m.userData.kind !== e.kind) {
        disposeObj(m);
        enemyMeshes.delete(e.id);
        m = null;
      }
      m ||= addEnemy(e);
      const ud = m.userData;
      ud.id = e.id;
      ud.flash = Math.max(0, ud.flash - dt);
      ud.punch = Math.max(0, ud.punch - dt);
      ud.hurt = Math.max(0, ud.hurt - dt);
      ud.recoil = Math.max(0, ud.recoil - dt);
      ud.talk = Math.max(0, ud.talk - dt);
      ud.land = Math.max(0, ud.land - dt);
      const em = tele.get(e.id);
      // Centred on the board plane: no bob, so the drawn body sits on its
      // collider. Personality is squash, stretch and tilt around this point.
      m.position.set(e.x, BULLET_Y, e.z);
      m.scale.setScalar(ud.scale);
      const ctx = {
        t: visualTime,
        id: e.id,
        look: [s.ship.x - e.x, s.ship.z - e.z],
        hurt: ud.hurt / 0.14,
        tele: em ? { preset: em.preset, k: 1 - em.timer / em.tele } : null,
        gloat,
        shock,
        hp: e.kind === 'boss' ? (e.local ? Math.max(0, e.hp) / Math.max(1, e.maxHp) : bossFrac) : e.maxHp > 1 ? Math.max(0, e.hp) / e.maxHp : 1,
        mode: e.mode,
        mutating: e.mutating > 0,
        talk: ud.talk > 0 ? 1 : 0,
        recoil: ud.recoil / 0.25,
        beat: mood.march % 1,
        beatOdd: Math.floor(mood.march) % 2 === 1,
        land: ud.land / 0.35,
      };
      if (e.kind === 'boss' && b?.state === 'intro') ctx.intro = 1 - Math.max(0, b.timer) / BOSS_INTRO;
      if (ud.petals.length) ctx.bud = ud.petalOpen ?? 0;
      const mo = motion ? bodyMotion(ud.char, ctx, ud.aspect) : { sx: 1, sy: 1, sz: 1, pitch: 0, roll: 0, yaw: 0, crown: 1 };
      ud.tilt.scale.set(mo.sx, mo.sy, mo.sz);
      ud.tilt.rotation.set(mo.pitch, 0, mo.roll);
      if (ud.crown) ud.crown.scale.setScalar(mo.crown);
      // Crowns sway and twitch (bosses keep a slow look-around).
      ud.body.rotation.y = e.kind === 'worm' ? (e.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : e.kind === 'boss' ? (motion ? Math.sin(visualTime * 0.8) * 0.12 + mo.yaw * 0.5 : 0) : mo.yaw + (e.col || 0) * 0.7;
      if (e.kind === 'droplet' && (e.mode === 'dive' || e.mode === 'aim')) ud.body.rotation.y = Math.atan2(e.target[0] - e.x, e.target[1] - e.z);
      if (ud.helix && motion) ud.helix.rotation.z = visualTime * 6;
      const mutating = e.mutating > 0,
        mutated = e.tier > 0;
      for (const mat of ud.mats) {
        if (ud.flash > 0) {
          mat.emissive.set('#ffffff');
          mat.emissiveIntensity = ud.soft ? 0.45 : 1.6;
        } else if (mutating) {
          // MUTATION: the virus flashes and shifts hue before it upgrades.
          mat.emissive.setHSL((visualTime * 2.2) % 1, 0.9, 0.55);
          mat.emissiveIntensity = 0.9;
        } else {
          mat.emissive.copy(mat.userData.baseColor);
          if (mutated) mat.emissive.offsetHSL(0.12, 0, 0);
          mat.emissiveIntensity = em ? 0.55 + Math.sin(visualTime * 22) * 0.2 : mat.userData.base;
        }
      }
      const tethered = s.telegraphs.some((t) => t.kind === 'tether' && t.targetId === e.id);
      ud.warning.visible = !!em || tethered || (e.kind === 'droplet' && e.mode === 'puddle');
      if (ud.warning.visible) {
        ud.pinkRing.material.opacity = 0.7 + Math.sin(visualTime * 18) * 0.3;
        ud.warning.position.y = -BULLET_Y / ud.scale + 0.05;
      }
      if (ud.spikes.length) {
        // HEAVY CROWN: spikes snap off as HP drops (visible HP).
        const keep = Math.ceil((ud.spikes.length * Math.max(0, e.hp)) / e.maxHp);
        ud.spikes.forEach((sp, i) => (sp.visible = i < keep));
      }
      if (ud.petals.length && e.bud) {
        const open = e.bud.state === 'open' ? 1 : e.bud.state === 'opening' ? 1 - e.bud.timer / 0.8 : 0;
        ud.petalOpen = (ud.petalOpen ?? 0) + (open - (ud.petalOpen ?? 0)) * ease(dt, 10);
        // Closed: petals lean in and meet over the core. Open: they splay flat.
        for (const p of ud.petals) p.rotation.z = 0.45 - ud.petalOpen * 1.55;
      }
      if (ud.cargo && motion) ud.cargo.rotation.y = visualTime;
      if (e.kind === 'boss' && b) syncBossPart(s, b, e, ud, ctx);
    }
    for (const [id, m] of enemyMeshes)
      if (!live.has(id)) {
        disposeObj(m);
        enemyMeshes.delete(id);
      }
    // The boss landed: a squash as the entrance slide ends.
    const st = b ? b.state : null;
    if (mood.lastState === 'intro' && st && st !== 'intro') for (const m of enemyMeshes.values()) if (m.userData.boss) m.userData.land = 0.35;
    mood.lastState = st;
  }
  /** The glowing cores in a boss's pits follow its mood (bossMenace). */
  function glowPits(ud, menace, alpha = 1) {
    for (const p of ud.pits) {
      p.core.scale.setScalar(p.r0 * menace.size);
      p.coreMat.emissiveIntensity = 0.25 + 1.6 * menace.glow;
      p.glow.material.opacity = Math.min(0.75, 0.32 * menace.glow) * alpha;
    }
  }
  /** Boss-only visuals: seam, nucleus halo, ghosted dormant twin, node glyph, pits. */
  function syncBossPart(s, b, e, ud, ctx) {
    const card = b.cards[b.card];
    if (ud.seam) ud.seam.material.opacity = b.state === 'cardIntro' ? 0.5 + Math.sin(visualTime * 30) * 0.4 : 0.35;
    if (ud.halo) {
      const nucleus = card?.nucleus && e.id === b.nucleus;
      ud.halo.material.opacity = nucleus ? 0.55 + Math.sin(visualTime * 8) * 0.2 : 0;
    }
    // MIRROR STRAIN: the dormant twin is intangible, so it is drawn ghosted.
    const dormant = card?.nucleus && e.id !== b.nucleus;
    for (const mat of ud.mats) {
      mat.transparent = !!dormant || mat.userData.baseTransparent;
      mat.opacity = dormant ? 0.35 : mat.userData.baseOpacity;
    }
    if (ud.glyph) {
      const next = (s.emitters || []).some((x) => x.ownerId === e.id && x.state === 'tele');
      ud.glyph.scale.setScalar(1.5 + (next ? 0.4 + Math.sin(visualTime * 9) * 0.15 : 0));
    }
    if (ud.pits.length) glowPits(ud, settings.effects() ? bossMenace(ud.char, ctx) : { glow: 1, size: 1 }, dormant ? 0.35 : 1);
  }

  // ---- Kill pops and the boss defeat (visual only: no collider remains) -----------
  const pops = [],
    dying = [];
  function startPop(id, big) {
    const m = enemyMeshes.get(id);
    if (!m) return;
    enemyMeshes.delete(id);
    for (const mat of m.userData.mats) mat.transparent = true;
    pops.push({ m, life: big ? 0.16 : 0.11, max: big ? 0.16 : 0.11 });
  }
  function updatePops(dt) {
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.life -= dt;
      const ud = p.m.userData;
      if (p.life <= 0 || !settings.effects()) {
        disposeObj(p.m);
        pops.splice(i, 1);
        continue;
      }
      // The pop: the body inflates and fades in about 0.1 s, face shocked.
      const k = 1 - p.life / p.max;
      ud.tilt.scale.set(1 + 0.45 * k, 1 + 0.6 * k, 1 + 0.45 * k);
      for (const mat of ud.mats) {
        mat.opacity = (1 - k) * mat.userData.baseOpacity;
        mat.emissive.set('#ffffff');
        mat.emissiveIntensity = 1.2 * (1 - k);
      }
    }
  }
  function startDefeat(ev) {
    const mid = !!ev.mid;
    for (const [id, m] of enemyMeshes) {
      if (!m.userData.boss) continue;
      enemyMeshes.delete(id);
      dying.push({ m, t: 0, end: mid ? DEFEAT_FINAL.mid : DEFEAT_FINAL.main, pops: [...(mid ? DEFEAT_POPS.mid : DEFEAT_POPS.main)], mid, talk: 0 });
    }
    // The defeat line is babbled by the boss while it shivers.
    const line = bossLine(ev, stateRef);
    if (line) for (const d of dying) d.talk = talkTime(line.text);
  }
  function updateDying(s, dt) {
    if (s.paused) return; // in step with the (suspended) audio
    for (let i = dying.length - 1; i >= 0; i--) {
      const d = dying[i];
      d.t += dt;
      d.talk = Math.max(0, d.talk - dt);
      const ud = d.m.userData;
      const k = Math.min(1, d.t / d.end);
      // Small pops across the body, in time with the audio's escalating pops.
      while (d.pops.length && d.t >= d.pops[0]) {
        d.pops.shift();
        const r = ud.scale * ud.bodyR;
        const a = Math.random() * Math.PI * 2;
        const x = d.m.position.x + Math.cos(a) * r * 0.7,
          z = d.m.position.z + Math.sin(a) * r * 0.5;
        addBurst(x, z, '#f4f7ff', 1.2);
        spawnDebris(x, z, PALETTE.virus, 6, 1.1);
      }
      if (d.t >= d.end) {
        // The payoff: the boss bursts.
        const { x, z } = d.m.position;
        spawnDebris(x, z, '#cfd6e2', d.mid ? 34 : 60, 1.6);
        spawnDebris(x, z, PALETTE.virus, d.mid ? 16 : 30, 1.4);
        addBurst(x, z, '#f4f7ff', d.mid ? 4.5 : 7);
        addBurst(x, z, ud.spec.spikes || PALETTE.virus, d.mid ? 3 : 5);
        fx.trauma = Math.min(1, fx.trauma + (d.mid ? 0.5 : 0.85));
        fx.flash = Math.max(fx.flash, d.mid ? 0.2 : 0.35);
        disposeObj(d.m);
        dying.splice(i, 1);
        continue;
      }
      const mo = bodyMotion(ud.char, { t: visualTime, id: ud.id, dying: k }, ud.aspect);
      ud.tilt.scale.set(mo.sx * (1 + 0.12 * k), mo.sy, mo.sz * (1 + 0.12 * k));
      ud.tilt.rotation.set(mo.pitch, 0, mo.roll);
      ud.body.rotation.y += mo.yaw * dt * 20;
      for (const mat of ud.mats) {
        mat.emissive.set('#ffffff');
        mat.emissiveIntensity = 0.2 + 1.4 * k * k * (0.6 + 0.4 * Math.sin(visualTime * 40));
      }
      if (ud.pits.length) glowPits(ud, bossMenace(ud.char, { t: visualTime, id: ud.id, dying: k }));
    }
  }

  function placeBullet(mesh, n, x, z, heading, w, l, offset = 0) {
    tmp.position.set(x - Math.sin(heading) * offset, BULLET_Y, z - Math.cos(heading) * offset);
    tmp.rotation.set(0, heading + Math.PI, 0);
    tmp.scale.set(w, 1, l);
    tmp.updateMatrix();
    mesh.setMatrixAt(n, tmp.matrix);
  }
  function syncProjectiles(s) {
    const counts = Object.fromEntries(FAM.map((f) => [f, 0]));
    const strandMap = new Map();
    const white = tmpColor.set('#ffffff');
    for (const b of s.enemyShots) {
      const f = FAM.includes(b.family) ? b.family : 'droplet';
      const mesh = bullets[f];
      const n = counts[f]++;
      if (n >= MAXB) continue;
      const heading = Math.atan2(b.vx || 0, b.vz || 1e-6);
      // Quads from hitboxes.bulletQuad: the drawn solid is the collider.
      const q = quads[f];
      if (f === 'virion') placeBullet(mesh, n, b.x, b.z, (b.age || 0) * 1.6, q.w, q.l);
      else if (f === 'glob') {
        // The wobble is a slow shimmer of the glow only: the solid never changes size.
        placeBullet(mesh, n, b.x, b.z, settings.effects() ? Math.sin((b.age || 0) * 3 + b.id) * 0.3 : 0, q.w, q.l);
      } else placeBullet(mesh, n, b.x, b.z, COLLIDERS[f].half ? heading : 0, q.w, q.l);
      // REPLICATION: a bullet flashes white for 0.3 s before it splits.
      const flashing = b.splitAt && b.age > b.splitAt - 0.3 && Math.floor(visualTime * 20) % 2 === 0;
      mesh.setColorAt(n, flashing ? tmpColor.set('#9ffcff') : white.set('#ffffff'));
      if (b.strand) (strandMap.get(b.strand) || strandMap.set(b.strand, []).get(b.strand)).push(b);
    }
    for (const f of FAM) {
      bullets[f].count = Math.min(MAXB, counts[f]);
      bullets[f].instanceMatrix.needsUpdate = true;
      if (bullets[f].instanceColor) bullets[f].instanceColor.needsUpdate = true;
    }
    // The thin, harmless RNA thread between beads of one strand.
    let sn = 0;
    for (const list of strandMap.values()) {
      list.sort((a, b) => a.bead - b.bead);
      for (let i = 1; i < list.length && sn < MAXB; i++) {
        const a = list[i - 1],
          b = list[i];
        const dx = b.x - a.x,
          dz = b.z - a.z,
          len = Math.hypot(dx, dz);
        if (len > 2.5) continue;
        tmp.position.set((a.x + b.x) / 2, BULLET_Y - 0.01, (a.z + b.z) / 2);
        tmp.rotation.set(0, Math.atan2(dx, dz), 0);
        tmp.scale.set(0.09, 1, len);
        tmp.updateMatrix();
        strands.setMatrixAt(sn++, tmp.matrix);
      }
    }
    strands.count = sn;
    strands.instanceMatrix.needsUpdate = true;
    let nn = 0;
    for (const shot of s.shots) {
      if (nn >= 220) break;
      // Tip at the shot position, tail NEEDLE.length behind: the collider.
      const v = Math.hypot(shot.vx, shot.vz) || 1;
      tmp.position.set(shot.x - (shot.vx / v) * NEEDLE.length * 0.5, BULLET_Y - 0.02, shot.z - (shot.vz / v) * NEEDLE.length * 0.5);
      tmp.rotation.set(0, Math.atan2(shot.vx, shot.vz) + Math.PI, 0);
      tmp.scale.set((NEEDLE.r * 2) / 0.625, 1, NEEDLE.length);
      tmp.updateMatrix();
      needles.setMatrixAt(nn++, tmp.matrix);
    }
    needles.count = nn;
    needles.instanceMatrix.needsUpdate = true;
    let an = 0;
    for (const a of s.antigens || []) {
      if (an >= 240) break;
      tmp.position.set(a.x, BULLET_Y, a.z);
      tmp.rotation.set(0, visualTime * 4 + a.id, 0);
      tmp.scale.setScalar(0.28);
      tmp.updateMatrix();
      antigenPool.setMatrixAt(an++, tmp.matrix);
    }
    antigenPool.count = an;
    antigenPool.instanceMatrix.needsUpdate = true;
  }

  function syncPickups(s) {
    const live = new Set();
    for (const p of s.pickups) {
      live.add(p.id);
      const m = pickupMeshes.get(p.id) || addPickup(p);
      m.position.set(p.x, BULLET_Y, p.z);
      // A death's mRNA strand blinks for its last second.
      m.visible = !(p.life && p.life - p.age < 1 && Math.floor(visualTime * 10) % 2);
    }
    for (const [id, m] of pickupMeshes)
      if (!live.has(id)) {
        disposeObj(m);
        pickupMeshes.delete(id);
      }
  }

  function teleMesh(id, make) {
    let m = teleMeshes.get(id);
    if (!m) {
      m = make();
      scene.add(m);
      teleMeshes.set(id, m);
    }
    return m;
  }
  function syncTelegraphs(s) {
    const live = new Set();
    const pulse = 0.55 + Math.sin(visualTime * 14) * 0.25;
    for (const em of s.emitters || []) {
      if (em.state === 'done') continue;
      const k = em.state === 'tele' ? 1 - em.timer / em.tele : 1;
      if (em.preset === 'jet') {
        for (const [i, lane] of (em.lanes || []).entries()) {
          const id = `jet${em.id}-${i}`;
          live.add(id);
          const m = teleMesh(id, () => {
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), dangerMat(0.3));
            mesh.renderOrder = 29;
            return mesh;
          });
          const from = Math.min(lane.fromZ, 8),
            to = 13.2;
          m.scale.set(lane.width, 1, to - from);
          m.position.set(lane.x, FLOOR_Y + 0.05, (from + to) / 2);
          m.material.opacity = em.state === 'tele' ? 0.12 + k * 0.35 + Math.sin(visualTime * (10 + 20 * k)) * 0.06 : 0.6;
        }
      } else if (em.preset === 'wall' && em.state === 'tele') {
        // The wall line in pink with its gaps left clear and bracketed.
        const id = `wall${em.id}`;
        live.add(id);
        const m = teleMesh(id, () => {
          const g = new THREE.Group();
          const pts = [];
          let x = -9.2;
          const gaps = [...em.gapList].sort((a, b) => a.x - b.x);
          for (const gap of gaps) {
            pts.push([[x, em.z], [gap.x - gap.width / 2, em.z]]);
            x = gap.x + gap.width / 2;
          }
          pts.push([[x, em.z], [9.2, em.z]]);
          for (const seg of pts) g.add(dashed(seg, PALETTE.danger, 0.4, 0.28));
          for (const gap of gaps)
            for (const side of [-1, 1]) {
              const gx = gap.x + (side * gap.width) / 2;
              g.add(dashed([[gx, em.z - 0.6], [gx, em.z + 2.4]], '#ffffff', 0.3, 0.12, true));
            }
          return g;
        });
        m.traverse((c) => c.material && (c.material.opacity = 0.4 + k * 0.55));
      } else if (em.preset === 'sneeze' && em.state === 'tele') {
        // The inhale wedge: the fan's outline on the floor.
        const id = `wedge${em.id}`;
        live.add(id);
        const m = teleMesh(id, () => {
          const g = new THREE.Group();
          const half = ((em.p.spread * Math.PI) / 180) * 0.5;
          const len = 5;
          for (const a of [em.aim - half, em.aim + half]) g.add(dashed([[0, 0], [Math.sin(a) * len, Math.cos(a) * len]], PALETTE.danger, 0.3, 0.12));
          const arc = [];
          for (let i = 0; i <= 12; i++) {
            const a = em.aim - half + (i / 12) * half * 2;
            arc.push([Math.sin(a) * len, Math.cos(a) * len]);
          }
          g.add(dashed(arc, PALETTE.danger, 0.25, 0.1));
          return g;
        });
        m.position.set(em.x, 0, em.z);
        m.traverse((c) => c.material && (c.material.opacity = 0.3 + k * 0.6));
      } else if (em.preset === 'aerosol' && em.p.laneAngles?.length) {
        // SNEEZE STORM: the clear density lanes are marked (cyan = safe).
        const id = `lanes${em.id}`;
        live.add(id);
        const m = teleMesh(id, () => {
          const g = new THREE.Group();
          for (const a of em.p.laneAngles) g.add(dashed([[0, 1.5], [Math.sin(a) * 22, 1.5 + Math.cos(a) * 22]], PALETTE.vaccine, 0.6, 0.16));
          return g;
        });
        m.position.set(em.x, 0, em.z);
        m.traverse((c) => c.material && (c.material.opacity = 0.35));
      } else if (em.preset === 'quarantine' && em.state === 'tele' && em.box) {
        const id = `qbox${em.id}`;
        live.add(id);
        const m = teleMesh(id, () => {
          const q = em.box;
          const c = [[q.x - q.half, q.z - q.half], [q.x + q.half, q.z - q.half], [q.x + q.half, q.z + q.half], [q.x - q.half, q.z + q.half], [q.x - q.half, q.z - q.half]];
          return dashed(c, PALETTE.vaccine, 0.4, 0.14);
        });
        m.material.opacity = pulse;
      }
    }
    if (s.quarantine) {
      live.add('quarantine');
      const m = teleMesh('quarantine', () => {
        const g = new THREE.Group();
        const wall = new THREE.MeshBasicMaterial({ color: PALETTE.vaccine, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
        for (const [x, z, ry] of [[0, -1, 0], [0, 1, 0], [-1, 0, Math.PI / 2], [1, 0, Math.PI / 2]]) {
          const p = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.7), wall);
          p.position.set(x * 3.5, 0.35, z * 3.5);
          p.rotation.y = ry;
          g.add(p);
        }
        const q = s.quarantine;
        g.add(dashed([[-3.5, -3.5], [3.5, -3.5], [3.5, 3.5], [-3.5, 3.5], [-3.5, -3.5]], PALETTE.vaccine, 7, 0.12, true));
        g.position.set(q.x, 0, q.z);
        return g;
      });
      m.position.set(s.quarantine.x, 0, s.quarantine.z);
    }
    for (const t of s.telegraphs) {
      if (t.kind === 'path') {
        const owner = s.enemies.find((e) => e.id === t.ownerId);
        const id = `path${t.id}`;
        live.add(id);
        const old = teleMeshes.get(id);
        if (old) disposeObj(old);
        const m = dashed([[owner?.x ?? t.x, owner?.z ?? -8], [t.x, t.z]], PALETTE.danger);
        m.material.opacity = pulse;
        scene.add(m);
        teleMeshes.set(id, m);
      } else if (t.kind === 'tether') {
        const a = s.enemies.find((e) => e.id === t.ownerId),
          b = s.enemies.find((e) => e.id === t.targetId);
        const id = `tether${t.id}`;
        live.add(id);
        const old = teleMeshes.get(id);
        if (old) disposeObj(old);
        const m = dashed([[a?.x ?? 0, a?.z ?? 0], [b?.x ?? 0, b?.z ?? 0]], PALETTE.danger, 0.22, 0.24, false, BULLET_Y + 0.1);
        m.material.opacity = pulse;
        scene.add(m);
        teleMeshes.set(id, m);
      }
    }
    for (const beam of s.beams) {
      const id = `beam${beam.id}`;
      live.add(id);
      const m = teleMesh(id, () => {
        const mesh = new THREE.Mesh(shared, new THREE.MeshBasicMaterial({ color: '#ffd6ec', transparent: true, opacity: 0.8, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        mesh.renderOrder = 58;
        return mesh;
      });
      const from = beam.fromZ ?? -8;
      // Drawn exactly as wide as the beam's hit rectangle.
      m.scale.set(beam.width, 0.5, 13.4 - from);
      m.position.set(beam.x, BULLET_Y, (from + 13.4) / 2);
      m.material.opacity = 0.55 + Math.random() * 0.35;
    }
    for (const [id, m] of teleMeshes)
      if (!live.has(id)) {
        disposeObj(m);
        teleMeshes.delete(id);
      }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.life -= 1 / 60;
      const k = 1 - b.life / 0.45;
      b.mesh.scale.setScalar(0.3 + k * b.size);
      b.mesh.material.opacity = Math.max(0, 0.85 * (1 - k));
      b.flash.material.opacity = Math.max(0, 0.7 * (1 - k * 1.6));
      if (b.life <= 0) {
        scene.remove(b.mesh, b.flash);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
        b.flash.material.dispose();
        bursts.splice(i, 1);
      }
    }
  }

  function syncShip(s, dt) {
    const motion = settings.effects();
    const sh = s.ship;
    ship.position.set(sh.x, BULLET_Y, sh.z);
    // Respawn invulnerability flickers at 10 Hz (never hides the hitbox dot).
    ship.visible = sh.invulnerable <= 0 || !motion || Math.floor(visualTime * 20) % 2 === 0;
    // INJECT: the plunger is pushed in on a cure and draws back over the
    // reload; the tip glint is bright when loaded and dim while reloading.
    const reload = sh.injectReload || 0,
      reloadMax = sh.injectReloadMax || 0.5;
    plunger.position.z = -0.1 * Math.min(1, reload / reloadMax);
    if (tipGlint) tipGlint.material.opacity = reload > 0 ? 0.15 : 0.85 + (motion ? 0.15 * Math.sin(visualTime * 9) : 0);
    // EXPOSURE: the vaccine level is the graze progress toward the next SOAP
    // (RESEARCH_V1.md 3.7), filling from the needle end; the stopper rides it.
    const fill = Math.max(0, Math.min(1, (sh.grazeProgress || 0) / RULES.grazePerBomb));
    const front = fluidPart.z0,
      level = front + 0.02 + (fluidPart.z1 - front - 0.02) * fill;
    exposureLevel = fill;
    if (fluid) {
      fluid.scale.set(1, 1, Math.max(0.001, level - front));
      fluid.position.z = (front + level) / 2;
      meniscus.position.z = level;
      meniscus.visible = fluid.visible = fill > 0.001;
      stopper.position.z = Math.min(fluidPart.z1, level + 0.04);
    }
    // Focus ghosts the body to 35%, so bullets crossing it plainly hit
    // nothing; the core marker (drawn separately) never ghosts.
    ghost = sh.focus && s.phase === 'playing' ? 0.35 : 1;
    for (const m of bodyMats) m.opacity = m.userData.opacity * ghost;
    // The Dose Chain lives in the dose's glow.
    const tier = chainMultiplier(s.chain.count);
    fluidMat.emissiveIntensity = 0.9 + (tier - 1) * 0.2;
    // Hit (the 0.18 s deathbomb window): only the core flashes pink-white.
    coreHot = sh.dying > 0;
    dot.material.color.set(coreHot ? (Math.floor(visualTime * 30) % 2 ? '#ff4fa3' : '#ffffff') : '#ffffff');
    shipLight.position.set(sh.x, 1.2, sh.z);
    // The hitbox dot sits in the barrel, always drawn on top (depthTest off,
    // so it can lie exactly on the collision plane without z-fighting).
    // The marker is exactly the collision core (0.2 u, >= 6 px everywhere).
    tmp.position.set(sh.x, MARKER.y, sh.z);
    tmp.rotation.set(0, 0, 0);
    // The marker's outer edge spans texEdge/texHalf of the quad.
    tmp.scale.set(markerQuad(), 1, markerQuad());
    tmp.updateMatrix();
    dot.setMatrixAt(0, tmp.matrix);
    dot.instanceMatrix.needsUpdate = true;
    dot.visible = s.phase !== 'title';
    const map = sh.focus ? dotMaps.focus : dotMaps.plain;
    if (dot.material.map !== map) {
      dot.material.map = map;
      dot.material.needsUpdate = true;
    }
    for (const a of grazeArcs) {
      a.userData.life = Math.max(0, a.userData.life - dt);
      a.visible = a.userData.life > 0 && !sh.focus;
      a.material.opacity = 0.75 * (a.userData.life / 0.2);
      a.position.set(sh.x, GRAZE_RING.y, sh.z);
    }
    // Focus: a faint cyan 1.0 u graze ring. It appears at full strength on
    // the frame Shift goes down (feedback on the press, not 70 ms later) and
    // only fades out on release.
    grazeRing.position.set(sh.x, GRAZE_RING.y, sh.z);
    if (sh.focus) grazeRing.material.opacity = 0.38;
    else grazeRing.material.opacity += (0 - grazeRing.material.opacity) * ease(dt, 14);
    grazeRing.visible = s.phase !== 'title';
    const offs = antibodyOffsets(sh.power, sh.focus);
    options.forEach((o, i) => {
      const off = offs[i];
      o.visible = !!off && s.phase !== 'title' && ship.visible;
      if (!off) return;
      const bob = motion ? Math.sin(visualTime * 3 + i) * 0.08 : 0;
      o.position.set(sh.x + off[0], BULLET_Y + 0.1 + bob, sh.z + off[1]);
    });
    if (tier !== lastChainTier) lastChainTier = tier;
    maskArc.visible = sh.powerups.mask > 0 && s.phase === 'playing';
    maskArc.position.set(sh.x, BULLET_Y + 0.01, sh.z);
    const ring = s.soapRing;
    soap.visible = !!ring;
    if (ring) {
      soap.position.set(ring.x, BULLET_Y + 0.05, ring.z);
      soap.scale.setScalar(Math.max(0.1, ring.r));
      // The rim is drawn at exactly the cancel radius (tube thickness scales
      // down with the bubble so the edge stays crisp).
      soapRim.scale.set(1, 1, 1);
      soapRim.material.opacity = Math.max(0, 1 - ring.t * 0.9);
      soapRim2.material.opacity = Math.max(0, 0.85 - ring.t);
      soapFilm.material.opacity = Math.max(0, 0.26 - ring.t * 0.3);
    }
  }

  function syncTwist(s, dt) {
    const tw = s.twist || {};
    const motion = settings.effects();
    // BREATH: the alveoli swell on the inhale (a slow backdrop pulse).
    const breath = tw.kind === 'breath' ? (tw.stage === 'inhale' ? 1.04 : tw.stage === 'exhale' ? 0.97 : 1) : 1;
    backdrop.scale.x += (breath - backdrop.scale.x) * ease(dt, 3);
    backdrop.scale.y = backdrop.scale.x;
    const flowing = tw.kind === 'current' || tw.kind === 'rush';
    streakMat.opacity += ((flowing ? (tw.warn ? 0.25 + Math.sin(visualTime * 16) * 0.2 : 0.18) : 0) - streakMat.opacity) * ease(dt, 6);
    let n = 0;
    for (const st of streakState) {
      if (flowing && motion) {
        st.x += (tw.drift || 0) * 3 * dt;
        if (st.x > 9) st.x -= 18;
        if (st.x < -9) st.x += 18;
      }
      tmp.position.set(st.x, FLOOR_Y + 0.07, st.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      streaks.setMatrixAt(n++, tmp.matrix);
    }
    streaks.count = n;
    streaks.instanceMatrix.needsUpdate = true;
    if (backdropMat.map && motion) backdropMat.map.offset.x = flowing ? (backdropMat.map.offset.x + (tw.drift || 0) * 0.004 * dt) % 1 : backdropMat.map.offset.x;
  }

  // Title diorama: the syringe facing a row of the original green crowns.
  const titleGroup = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const h = buildShape(SHAPES.wild, { seed: i + 3 });
    h.body.position.set((i - 2) * 3.4, BULLET_Y, -10.4 + Math.abs(i - 2) * 0.6);
    h.body.scale.setScalar(1.2);
    titleGroup.add(h.body);
  }
  scene.add(titleGroup);

  function updateCamera(dt) {
    const motion = settings.effects();
    fx.trauma = Math.max(0, fx.trauma - dt * 2);
    // Shake only on card breaks, SOAP and deaths, at most 0.08 u.
    const shake = motion ? Math.min(0.08, fx.trauma * fx.trauma * 0.08) : 0;
    const [px, py, pz] = layout.position;
    camera.position.set(px + shake * Math.sin(visualTime * 47.3), py + shake * Math.sin(visualTime * 39.1 + 1.3), pz + shake * Math.sin(visualTime * 53.7 + 2.1));
    camera.lookAt(...layout.target);
  }

  let topPx;
  function resize() {
    const w = stage.clientWidth,
      h = stage.clientHeight;
    renderer.setSize(w, h, false);
    layout = cameraLayout(w, h, { topPx });
    camera.aspect = layout.aspect;
    camera.fov = layout.fov;
    camera.near = 1;
    camera.far = 400;
    camera.position.set(...layout.position);
    camera.lookAt(...layout.target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // Minimum on-screen sizes (visual only; hit radii never change): the
    // smallest bullet >= 7 px at the far edge (5 px on narrow screens).
    const far = pxPerUnit(layout, h, [0, BULLET_Y, -12.5]);
    void far;
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  applyTheme(1);
  // Compile every shader program the first play frame needs (bullets,
  // needles, the hitbox dot, warning rings, telegraph dashes, bursts, a boss
  // body) during boot, so starting a sample never stalls.
  {
    const warm = new THREE.Group();
    const sample = buildShape(SHAPES.alpha);
    warm.add(sample.body, new THREE.Mesh(ringGeo, dangerMat(0.8)), dashed([[0, 0], [1, 1]], PALETTE.danger), sprite('#ffffff', 1, 0.5));
    const burst = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 12), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    warm.add(burst);
    scene.add(warm);
    const hidden = [dot, grazeRing, soap, ...options].filter((o) => !o.visible);
    for (const o of hidden) o.visible = true;
    for (const m of Object.values(bullets)) m.count = 1;
    needles.count = antigenPool.count = strands.count = 1;
    try {
      renderer.compile(scene, camera);
    } catch {
      /* Compilation is an optimisation only. */
    }
    // Every virus and boss shape: geometry is built (and cached per spec)
    // and uploaded by one hidden draw under the table, so a stage or boss
    // start never builds meshes mid-play (playtest: 100-300 ms hitches).
    const zoo = new THREE.Group();
    for (const spec of Object.values(SHAPES)) zoo.add(buildShape(spec).body);
    zoo.position.y = -6;
    zoo.traverse((o) => (o.frustumCulled = false));
    scene.add(zoo);
    try {
      renderer.compile(scene, camera);
      renderer.render(scene, camera);
    } catch {
      /* Warm-up only. */
    }
    scene.remove(zoo);
    zoo.traverse((o) => o.material?.dispose?.());
    for (const o of hidden) o.visible = false;
    for (const m of [...Object.values(bullets), needles, antigenPool, strands]) m.count = 0;
    scene.remove(warm);
  }

  const raycaster = new THREE.Raycaster(),
    boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BULLET_Y),
    hitPoint = new THREE.Vector3(),
    ndc = new THREE.Vector2();
  const project = ([x, y, z]) => {
    const p = new THREE.Vector3(x, y, z).project(camera);
    return { ndcX: p.x, ndcY: p.y, pixelX: ((p.x + 1) * stage.clientWidth) / 2, pixelY: ((1 - p.y) * stage.clientHeight) / 2 };
  };
  /** QA: the drawn syringe measured from its real matrices (tip and thumb
   * rest projected to CSS px), its focus ghost, EXPOSURE level and glint. */
  function syringeInfo(s) {
    ship.position.set(s.ship.x, BULLET_Y, s.ship.z);
    ship.updateMatrixWorld(true);
    const at = (z) => {
      const v = new THREE.Vector3(0, 0, z).applyMatrix4(syringe.matrixWorld);
      return project([v.x, v.y, v.z]);
    };
    const tip = at(SYRINGE.tip),
      back = at(partOf('thumb rest').z1),
      collider = project([s.ship.x, BULLET_Y, s.ship.z - INJECT.reach]);
    return {
      lengthPx: Math.hypot(tip.pixelX - back.pixelX, tip.pixelY - back.pixelY),
      tip,
      tipCollider: collider,
      tipErrorPx: Math.hypot(tip.pixelX - collider.pixelX, tip.pixelY - collider.pixelY),
      ghost,
      bodyOpacity: plastic.opacity,
      exposure: exposureLevel,
      coreHot,
      glint: tipGlint ? tipGlint.material.opacity : 0,
      visible: ship.visible,
      markerVisible: dot.visible,
    };
  }
  return {
    renderer,
    camera,
    fx,
    /** Board point (x, z) on the bullet plane under a client point. */
    pick(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(boardPlane, hitPoint) ? { x: hitPoint.x, z: hitPoint.z } : null;
    },
    setHitboxes(on) {
      hitboxesOn = !!on;
    },
    /** QA measurement only: draw one layer alone on black ('marker' = the core
     * dot, 'bullets', 'graze' = the focus ring), so its pixels can be
     * measured against the projected collider (MOVEMENT_AUDIT.md). The next
     * normal render restores everything. Shake is skipped. */
    probe(s, layer) {
      const solid = layer.endsWith('-solid'),
        base = solid ? layer.slice(0, -6) : layer;
      const keep = { marker: [dot], bullets: Object.values(bullets), graze: [grazeRing] }[base];
      if (!keep) return false;
      this.render(s, 0);
      const vis = scene.children.map((c) => c.visible);
      const bg = scene.background;
      // '-solid': swap in white masks of the solid regions (same quads).
      const swaps = solid ? keep.map((m) => [m, m.material.map]) : [];
      for (const [m] of swaps) {
        const kind = m === dot ? 'dot' : FAM.find((f) => bullets[f] === m);
        const mask = solidMask(kind);
        mask.generateMipmaps = false;
        mask.minFilter = THREE.LinearFilter;
        m.material.map = mask;
        m.material.needsUpdate = true;
      }
      scene.children.forEach((c) => (c.visible = keep.includes(c)));
      scene.background = new THREE.Color('#000000');
      camera.position.set(...layout.position);
      camera.lookAt(...layout.target);
      renderer.render(scene, camera);
      for (const [m, map] of swaps) {
        m.material.map.dispose();
        m.material.map = map;
        m.material.needsUpdate = true;
      }
      scene.children.forEach((c, i) => (c.visible = vis[i]));
      scene.background = bg;
      return true;
    },
    get hitboxes() {
      return hitboxesOn;
    },
    setTopBand(px) {
      if (px === topPx) return;
      topPx = px;
      resize();
    },
    reset() {
      for (const [, m] of enemyMeshes) disposeObj(m);
      enemyMeshes.clear();
      for (const [, m] of pickupMeshes) disposeObj(m);
      pickupMeshes.clear();
      for (const [, m] of teleMeshes) disposeObj(m);
      teleMeshes.clear();
      for (const d of debrisState) d.life = 0;
      for (const p of pops.splice(0)) disposeObj(p.m);
      for (const d of dying.splice(0)) disposeObj(d.m);
      mood.gloat = mood.shock = 0;
    },
    /** Screen position (CSS px) of a board point, for speech bubbles. */
    screenOf(x, y, z) {
      return project([x, y, z]);
    },
    /** QA: personality never draws a body wider than its collider. For every
     * live enemy the drawn body sphere is measured from the real world
     * matrices (footprint half-extent along x and z) against e.radius, and
     * every face is checked to sit inside its anchor's silhouette on screen
     * (centre offset + feature reach <= silhouette radius, in px). */
    audit(s) {
      const out = { enemies: [], pits: [] };
      const m3 = new THREE.Matrix3();
      for (const e of s.enemies) {
        const m = enemyMeshes.get(e.id);
        if (!e.alive || !m) continue;
        const ud = m.userData;
        m3.setFromMatrix4(ud.tilt.matrixWorld);
        const el = m3.elements; // column-major
        const r = ud.bodyR,
          a = ud.aspect;
        // Rows x and z of A = M diag(r, r a, r).
        const ex = Math.hypot(el[0] * r, el[3] * r * a, el[6] * r),
          ez = Math.hypot(el[2] * r, el[5] * r * a, el[8] * r);
        out.enemies.push({ id: e.id, kind: e.kind, char: ud.char, collider: e.radius, drawn: Math.max(ex, ez), min: Math.min(ex, ez) });
      }
      // Pits: each socket's horizontal reach from the body centre (world).
      const wp = new THREE.Vector3(),
        cp = new THREE.Vector3();
      for (const e of s.enemies) {
        const m = enemyMeshes.get(e.id);
        if (!e.alive || !m || !m.userData.pits.length) continue;
        m.getWorldPosition(cp);
        for (const p of m.userData.pits) {
          p.socket.getWorldPosition(wp);
          // The socket's long semi-axis in world units (its matrix column 0).
          const r = new THREE.Vector3().setFromMatrixColumn(p.socket.matrixWorld, 0).length();
          out.pits.push({ id: e.id, char: m.userData.char, reach: Math.hypot(wp.x - cp.x, wp.z - cp.z) + r, collider: e.radius });
        }
      }
      return out;
    },
    events(list, s) {
      for (const ev of list) onEvent(ev, s);
    },
    render(s, dt) {
      stateRef = s;
      visualTime += dt;
      applyTheme(getLevel(s.wave).world);
      titleGroup.visible = s.phase === 'title';
      if (titleGroup.visible && settings.effects()) titleGroup.children.forEach((c, i) => (c.rotation.y = visualTime * 0.4 + i));
      syncEnemies(s, dt);
      updatePops(dt);
      updateDying(s, dt);
      syncProjectiles(s);
      syncPickups(s);
      syncTelegraphs(s);
      syncShip(s, dt);
      syncTwist(s, dt);
      syncHitboxes(s);
      syncShadows(s);
      updateDebris(dt);
      fx.flash = Math.max(0, fx.flash - dt * 2.5);
      updateCamera(dt);
      renderer.render(scene, camera);
      return settings.effects() ? fx.flash : 0;
    },
    info(s) {
      const saved = camera.position.clone();
      camera.position.set(...layout.position);
      camera.lookAt(...layout.target);
      camera.updateMatrixWorld();
      const corners = [[-9.4, BULLET_Y, -13.2], [9.4, BULLET_Y, -13.2], [-9.4, BULLET_Y, 12.9], [9.4, BULLET_Y, 12.9]].map(project);
      const h = stage.clientHeight;
      const out = {
        type: 'WebGLRenderer',
        webgl: true,
        triangles: renderer.info.render.triangles,
        calls: renderer.info.render.calls,
        viewport: { width: stage.clientWidth, height: h },
        shipProjection: project([s.ship.x, BULLET_Y, s.ship.z]),
        framingProjection: FRAMING_POINTS.map(project),
        fieldRect: {
          left: Math.min(...corners.map((c) => c.pixelX)),
          right: Math.max(...corners.map((c) => c.pixelX)),
          top: Math.min(...corners.map((c) => c.pixelY)),
          bottom: Math.max(...corners.map((c) => c.pixelY)),
        },
        pxPerUnit: { far: pxPerUnit(layout, h, [0, BULLET_Y, -12.5]), near: pxPerUnit(layout, h, [0, BULLET_Y, 12]) },
        hitboxPx: 2 * RULES.shipRadius * pxPerUnit(layout, h, [0, BULLET_Y, s.ship.z]),
        minBulletPx: 2 * Math.min(...Object.values(COLLIDERS).map((c) => c.r)) * pxPerUnit(layout, h, [0, BULLET_Y, -12.5]),
        camera: { fov: layout.fov, position: layout.position, target: layout.target },
        syringe: syringeInfo(s),
      };
      camera.position.copy(saved);
      camera.lookAt(...layout.target);
      camera.updateMatrixWorld();
      return out;
    },
  };
}
