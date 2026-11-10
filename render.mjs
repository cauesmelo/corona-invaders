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
 * Juice (flash, punch, shake, debris) is visual only and obeys
 * prefers-reduced-motion and the Effects: Reduced setting. Shake happens only
 * on card breaks, SOAP and deaths, capped at 0.08 u.
 */
import * as THREE from './vendor/three.module.js';
import { cameraLayout, FRAMING_POINTS, pxPerUnit } from './camera.mjs';
import { RULES, getLevel, chainMultiplier, antibodyOffsets } from './model.mjs';
import { SHAPES, SYRINGE, PALETTE, shapeFor } from './shapes.mjs';

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
  4: { name: 'LAB / PETRI', background: '#120d06', floor: '#7d6532', rim: '#e8c27a', rail: '#f0d49a', fog: '#120d06' },
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
function spikeParts({ count, r, length, stem, cap, ring = 0 }) {
  const out = [];
  const cyl = new THREE.CylinderGeometry(stem * 0.8, stem, length, 6);
  const ball = new THREE.IcosahedronGeometry(cap, 1);
  for (const v of crownDirections(count, ring)) {
    const q = new THREE.Quaternion().setFromUnitVectors(UP, v);
    const mid = v.clone().multiplyScalar(r + length / 2 - 0.04);
    const tip = v.clone().multiplyScalar(r + length);
    out.push({ stem: [cyl, M(mid.x, mid.y, mid.z, 1, 1, 1, q)], cap: [ball, M(tip.x, tip.y, tip.z)], dir: v });
  }
  return out;
}
/** CDC-style club spikes: a thin stem and a flared head. */
function clubGeometry({ count, r, length, head, jitter = 0 }, seed = 1) {
  const parts = [];
  const stem = new THREE.CylinderGeometry(head * 0.32, head * 0.38, 1, 5);
  const cap = new THREE.CylinderGeometry(head, head * 0.55, head * 1.1, 7);
  let n = seed * 9301;
  const rnd = () => ((n = (n * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const v = fib(i, count);
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
function bulletTexture(kind) {
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
      g.beginPath();
      g.moveTo(0, -64);
      g.lineTo(40, -30);
      g.lineTo(26, 64);
      g.lineTo(-26, 64);
      g.lineTo(-40, -30);
      g.closePath();
      g.fill();
    } else if (kind === 'dot') {
      // The hitbox: a white core dot with a dark rim.
      g.fillStyle = '#071318';
      g.beginPath();
      g.arc(0, 0, 60, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(0, 0, 42, 0, Math.PI * 2);
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
    g.fillStyle = '#1c1204';
    g.beginPath();
    g.arc(48, 48, 44, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = PALETTE.amber;
    g.lineWidth = 5;
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
      // BLOODSTREAM: teal glass over desaturated drifting red cells.
      g.fillStyle = '#29484a';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 34; i++) {
        const x = rnd() * w,
          y = rnd() * h,
          r = 22 + rnd() * 14;
        g.save();
        g.translate(x, y);
        g.rotate(rnd() * 3);
        g.scale(1, 0.72);
        g.fillStyle = '#5b4446';
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#4b3a3c';
        g.beginPath();
        g.arc(0, 0, r * 0.5, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      g.fillStyle = '#2f6b6a44';
      g.fillRect(0, 0, w, h);
    } else {
      // LAB / PETRI: amber agar with colonies.
      const grad = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.9);
      grad.addColorStop(0, '#7a5f2a');
      grad.addColorStop(1, '#4a3816');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 22; i++) {
        const x = rnd() * w,
          y = rnd() * h,
          r = 16 + rnd() * 34;
        g.fillStyle = '#8a6e36';
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#6a5226';
        g.lineWidth = 3;
        g.stroke();
      }
    }
  });
}

// ---- Shape builder -----------------------------------------------------------------
/** Build a group for a shapes.mjs spec. Returns handles the animator uses. */
function buildShape(spec, { seed = 1, tint = null } = {}) {
  const body = new THREE.Group();
  const mats = [];
  const handles = { body, mats, spikes: [], eyes: [], petals: [], membrane: null };
  const mat = (color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.02, emissive: color, emissiveIntensity: 0.28, ...extra });
    m.userData.base = m.emissiveIntensity;
    m.userData.baseColor = new THREE.Color(m.emissive);
    m.userData.baseTransparent = m.transparent;
    m.userData.baseOpacity = m.opacity;
    mats.push(m);
    return m;
  };
  const mainColor = tint || spec.color;
  const bodyMat = mat(mainColor);
  const spikeMat = spec.spikes ? mat(spec.spikes, { emissiveIntensity: 0.3 }) : bodyMat;
  const add = (geo, m, at = [0, 0, 0], scale = [1, 1, 1]) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(...at);
    mesh.scale.set(...scale);
    body.add(mesh);
    return mesh;
  };
  for (const p of spec.parts) {
    const at = p.at || [0, 0, 0],
      sc = p.scale || [1, 1, 1];
    if (p.type === 'sphere') {
      const m = p.color ? mat(p.color, { emissiveIntensity: 0.6 }) : p.role === 'inner' ? mat(PALETTE.virus, { emissiveIntensity: 0.35 }) : p.role === 'nucleus' ? mat('#b9c2d6') : bodyMat;
      const mesh = add(new THREE.IcosahedronGeometry(p.r, 2), m, at, sc);
      if (p.role === 'cargo') handles.cargo = mesh;
    } else if (p.type === 'crown') {
      const parts = spikeParts(p);
      const tipMat = p.tips ? mat(p.tips, { emissiveIntensity: 0.35 }) : p.role === 'inner' ? mat(PALETTE.virus, { emissiveIntensity: 0.35 }) : bodyMat;
      const stemMat = p.role === 'inner' ? tipMat : bodyMat;
      if (p.breakable) {
        // HEAVY CROWN: each spike is its own mesh so lost HP visibly snaps it off.
        for (const s of parts) {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(merge([s.stem]), stemMat), new THREE.Mesh(merge([s.cap]), tipMat));
          g.scale.set(...sc);
          body.add(g);
          handles.spikes.push(g);
        }
      } else {
        add(merge(parts.map((s) => s.stem)), stemMat, at, sc);
        add(merge(parts.map((s) => s.cap)), tipMat, at, sc);
      }
    } else if (p.type === 'clubs') {
      add(clubGeometry(p, seed), spikeMat, at, sc);
    } else if (p.type === 'shell') {
      const m = mat(spec.color, { transparent: true, opacity: 0.45, roughness: 0.1, emissiveIntensity: 0.08, depthWrite: false });
      handles.membrane = add(new THREE.IcosahedronGeometry(p.r, 3), m, at, sc);
    } else if (p.type === 'tube') {
      const m = p.role === 'proboscis' || p.role === 'mucus' ? mat(p.role === 'mucus' ? '#9fe7c4' : '#8fe6a7', { transparent: true, opacity: p.role === 'mucus' ? 0.4 : 1 }) : bodyMat;
      const mesh = add(helixGeometry(p), m, at);
      if (!p.role) handles.helix = mesh;
    } else if (p.type === 'torus') {
      const m = p.role === 'seam' || p.role === 'halo' ? mat('#ffffff', { emissiveIntensity: 0.5, transparent: true, opacity: 0.7 }) : bodyMat;
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
    } else if (p.type === 'eyes') {
      // Two dot eyes on the camera-facing upper front of the sphere. They
      // narrow to telegraph an attack (bosses only; popcorn stays faceless).
      const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
      const black = new THREE.MeshBasicMaterial({ color: '#0b0f12' });
      for (const side of [-1, 1]) {
        const eye = new THREE.Group();
        const dir = new THREE.Vector3(side * p.gap, 0.78, 0.62).normalize();
        eye.position.copy(dir.clone().multiplyScalar(1.01));
        eye.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        const ball = new THREE.Mesh(new THREE.CircleGeometry(p.r * 1.35, 18), white);
        const pupil = new THREE.Mesh(new THREE.CircleGeometry(p.r, 18), black);
        pupil.position.z = 0.01;
        eye.add(ball, pupil);
        body.add(eye);
        handles.eyes.push(eye);
      }
    }
  }
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
    minVis = 0;

  // ---- Lights and the lab board -----------------------------------------------
  scene.add(new THREE.HemisphereLight('#dff4ff', '#1b2a2a', 1.1));
  const key = new THREE.DirectionalLight('#ffffff', 1.7);
  key.position.set(-6, 22, 10);
  scene.add(key);
  const rimLight = new THREE.DirectionalLight('#9fe8ff', 0.8);
  rimLight.position.set(8, 6, -14);
  scene.add(rimLight);

  const shared = new THREE.BoxGeometry(1, 1, 1);
  const dark = new THREE.MeshStandardMaterial({ color: '#0c1518', roughness: 0.6, metalness: 0.3 });
  const table = new THREE.Mesh(shared, dark);
  table.scale.set(23, 1, 31);
  table.position.y = -0.62;
  scene.add(table);
  const backdropMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(18.8, 26.8), backdropMat);
  backdrop.rotation.x = -Math.PI / 2;
  backdrop.position.y = FLOOR_Y - 0.02;
  scene.add(backdrop);
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
    rimLight.color.set(t.rim);
    backdropMat.map = backdrops[world] ||= backdropTexture(world);
    backdropMat.map.wrapS = backdropMat.map.wrapT = THREE.RepeatWrapping;
    backdropMat.color.set('#ffffff');
    backdropMat.needsUpdate = true;
  }

  // ---- The syringe (the hero) ---------------------------------------------------
  const ship = new THREE.Group();
  const syringe = new THREE.Group();
  ship.add(syringe);
  // Tilted 20 degrees so the steep camera sees the barrel's side profile.
  syringe.rotation.x = 0.35;
  // Drawn 1.35x larger than its parts list so the hero reads at 960x640;
  // only the 0.16 u core dot can be hit.
  syringe.scale.setScalar(1.35);
  scene.add(ship);
  const glassMat = new THREE.MeshStandardMaterial({ color: '#e8fbff', emissive: '#9fe9ff', emissiveIntensity: 0.25, transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.1, depthWrite: false });
  const fluidMat = new THREE.MeshStandardMaterial({ color: PALETTE.vaccine, emissive: PALETTE.vaccine, emissiveIntensity: 1.1, roughness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: '#f4fbff', emissive: '#bff4ff', emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.6 });
  const whitePlastic = new THREE.MeshStandardMaterial({ color: '#f2f7f8', roughness: 0.5 });
  const plunger = new THREE.Group();
  let fluid = null;
  for (const p of SYRINGE.parts) {
    if (p.type === 'cylinder') {
      const m = p.role === 'barrel' ? glassMat : p.role === 'fluid' ? fluidMat : p.role === 'needle' ? steel : whitePlastic;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * (p.role === 'needle' ? 0.35 : 1), p.length, 16), m);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.z = p.z;
      (p.role === 'plunger rod' ? plunger : syringe).add(mesh);
      if (p.role === 'fluid') fluid = mesh;
    } else if (p.type === 'disc') {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 0.08, 20), whitePlastic);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.z = p.z;
      plunger.add(mesh);
    } else if (p.type === 'oval') {
      // A small rounded oval, never a crossbar.
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.07, 24), whitePlastic);
      mesh.rotation.x = Math.PI / 2;
      mesh.scale.set(p.rx, 1, p.rz);
      mesh.position.z = p.z;
      syringe.add(mesh);
    } else if (p.type === 'marks') {
      for (let i = 0; i < p.count; i++) {
        const mark = new THREE.Mesh(new THREE.TorusGeometry(p.r, 0.012, 4, 24), new THREE.MeshBasicMaterial({ color: '#12343c' }));
        mark.position.z = -0.6 + i * 0.28;
        syringe.add(mark);
      }
    }
  }
  syringe.add(plunger);
  const shipLight = new THREE.PointLight(PALETTE.vaccine, 6, 5);
  scene.add(shipLight);
  // Antibody options: Y-shaped, cyan.
  const yGeo = merge([
    [new THREE.CapsuleGeometry(0.07, 0.34, 2, 6), M(0, 0, 0.16, 1, 1, 1, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2))],
    [new THREE.CapsuleGeometry(0.06, 0.28, 2, 6), M(-0.12, 0, -0.14, 1, 1, 1, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, -0.7)))],
    [new THREE.CapsuleGeometry(0.06, 0.28, 2, 6), M(0.12, 0, -0.14, 1, 1, 1, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0.7)))],
  ]);
  const optionMat = new THREE.MeshStandardMaterial({ color: PALETTE.vaccine, emissive: PALETTE.vaccine, emissiveIntensity: 0.8 });
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
    const m = new THREE.InstancedMesh(
      flat,
      new THREE.MeshBasicMaterial({ map: bulletTexture(kind), transparent: true, depthTest: false, depthWrite: false, toneMapped: false, ...extra }),
      count,
    );
    m.renderOrder = order;
    m.frustumCulled = false;
    m.count = 0;
    scene.add(m);
    return m;
  }
  const bullets = Object.fromEntries(FAM.map((f, i) => [f, pool(f, MAXB, 60 - i)]));
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
  const grazeRing = new THREE.Mesh(
    new THREE.RingGeometry(RULES.grazeRadius - 0.04, RULES.grazeRadius, 48).rotateX(-Math.PI / 2),
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

  // SOAP ring: a soap-film bubble (cyan rim, white sheen).
  const soap = new THREE.Group();
  const soapRim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 64), new THREE.MeshBasicMaterial({ color: '#e9fdff', transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }));
  soapRim.rotation.x = Math.PI / 2;
  const soapFilm = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: PALETTE.vaccine, transparent: true, opacity: 0.14, depthTest: false, depthWrite: false, toneMapped: false }));
  soap.add(soapRim, soapFilm);
  soap.renderOrder = 70;
  soap.visible = false;
  scene.add(soap);

  // ---- Telegraph meshes ----------------------------------------------------------
  const teleMeshes = new Map();
  const ringGeo = new THREE.RingGeometry(1.15, 1.42, 36);
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
      if (c.geometry && c.geometry !== shared && c.geometry !== flat && c.geometry !== ringGeo) c.geometry.dispose();
      if (c.material && c.material.map !== glow()) c.material.dispose?.();
    });
  };

  // ---- Enemies --------------------------------------------------------------------
  const enemyMeshes = new Map(),
    pickupMeshes = new Map();
  const pickupTextures = Object.fromEntries(Object.keys(PICKUP_STYLE).map((k) => [k, pickupTexture(k)]));
  const nodeTextures = Object.fromEntries(['cough', 'ring', 'bloom', 'drip'].map((k) => [k, nodeTexture(k)]));
  function addEnemy(e) {
    const spec = shapeFor(e, stateRef?.boss?.type);
    const group = new THREE.Group();
    const h = buildShape(spec, { seed: e.id.length + (e.col || 0) });
    group.add(h.body);
    // Warning ring under an enemy about to fire: dark outline + bright pink.
    const warning = new THREE.Group();
    const o = new THREE.Mesh(ringGeo, dangerMat(0.8));
    o.material.color.set(PALETTE.dangerRim);
    const pinkRing = new THREE.Mesh(new THREE.RingGeometry(1.22, 1.36, 36), dangerMat(1));
    pinkRing.position.z = 0.02;
    warning.add(o, pinkRing);
    warning.rotation.x = -Math.PI / 2;
    warning.visible = false;
    warning.renderOrder = 31;
    group.add(warning);
    // Visual size: the body slightly larger than the collision radius.
    const bodyR = spec.parts.find((p) => p.type === 'sphere' || p.type === 'shell' || p.type === 'drop' || p.type === 'torus')?.r ?? 0.6;
    const scale = (e.radius / bodyR) * (e.kind === 'boss' ? 0.95 : e.kind === 'mini' ? 0.92 : 0.95);
    group.scale.setScalar(scale);
    const ud = { ...h, warning, pinkRing, scale, flash: 0, punch: 0, spec };
    if (e.kind === 'boss' && e.part === 'node') {
      ud.glyph = new THREE.Sprite(new THREE.SpriteMaterial({ map: nodeTextures[e.tag], transparent: true, depthWrite: false, toneMapped: false }));
      ud.glyph.position.set(0, 2.2, 0);
      ud.glyph.scale.set(1.5, 1.5, 1);
      group.add(ud.glyph);
    }
    if (e.kind === 'boss' && e.part !== 'node') {
      ud.halo = sprite('#ffffff', 5, 0);
      group.add(ud.halo);
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
    icon.scale.set(1.05, 1.05, 1);
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
  function onEvent(ev) {
    const motion = settings.effects();
    if (ev.type === 'shot') plunger.position.z = 0.08;
    else if (ev.type === 'hit' && ev.id) {
      const m = enemyMeshes.get(ev.id);
      if (m) Object.assign(m.userData, { flash: 0.06, punch: 0.1 });
    } else if (ev.type === 'kill') {
      const big = ev.kind === 'boss';
      spawnDebris(ev.x, ev.z, big ? '#cfd6e2' : PALETTE.virus, big ? 60 : ev.kind === 'boss-part' ? 18 : ev.kind === 'mini' ? 3 : 5, big ? 1.6 : 1);
      if (big) {
        fx.trauma += 0.8;
        addBurst(ev.x, ev.z, '#f4f7ff', 6);
      }
      if (ev.kind === 'virion-bullet') addBurst(ev.x, ev.z, PALETTE.vaccine, 0.5);
    } else if (ev.type === 'burst') addBurst(ev.x, ev.z, '#f0f4f8', ev.radius);
    else if (ev.type === 'damage') {
      fx.trauma += 0.5;
      fx.flash = 0.55;
    } else if (ev.type === 'bomb') fx.trauma += 0.45;
    else if (ev.type === 'phase-break') fx.trauma += 0.5;
    else if (ev.type === 'spark') addBurst(ev.x, ev.z, PALETTE.vaccine, 0.5);
    else if (ev.type === 'split') addBurst(ev.x, ev.z, '#ffffff', 1.6);
    else if (ev.type === 'cured') addBurst(ev.x, ev.z, PALETTE.vaccine, 1.6);
    else if (ev.type === 'splash') addBurst(ev.x, ev.z, PALETTE.danger, 1.2);
    else if (ev.type === 'graze' && motion && Math.random() < 0.5) addBurst(ev.x, ev.z, '#e9fdff', 0.25);
    fx.trauma = Math.min(1, fx.trauma);
  }

  // ---- Per-frame sync --------------------------------------------------------------
  function telegraphOwners(s) {
    const out = new Map();
    for (const em of s.emitters || []) if (em.state === 'tele' && em.ownerId) out.set(em.ownerId, em);
    return out;
  }
  function syncEnemies(s, dt) {
    const live = new Set();
    const b = s.boss;
    const tele = telegraphOwners(s);
    const motion = settings.effects();
    const title = s.phase === 'title';
    for (const e of s.enemies) {
      if (!e.alive || title) continue;
      live.add(e.id);
      const m = enemyMeshes.get(e.id) || addEnemy(e);
      const ud = m.userData;
      ud.flash = Math.max(0, ud.flash - dt);
      ud.punch = Math.max(0, ud.punch - dt);
      const em = tele.get(e.id);
      const bob = motion && e.kind !== 'boss' ? Math.sin(visualTime * 2 + (e.row || 0) + (e.col || 0)) * 0.06 : 0;
      m.position.set(e.x, BULLET_Y + bob, e.z);
      // Personality: spikes bristle before a cough, a sneezer swells 1.25x
      // while inhaling ("ah... ah..."), everything wobbles when hit.
      let sx = 1,
        sy = 1;
      if (em) {
        const k = 1 - em.timer / em.tele;
        if (em.preset === 'sneeze') sx = sy = 1 + 0.25 * Math.min(1, k * 1.2);
        else sx = sy = 1 + 0.1 * Math.sin(k * Math.PI);
      }
      if (motion && ud.punch > 0) {
        const w = ud.punch / 0.1;
        sx *= 1 + 0.14 * w;
        sy *= 1 - 0.1 * w;
      }
      m.scale.set(ud.scale * sx, ud.scale * sy, ud.scale * sx);
      // Bosses keep their eyes on the camera; popcorn crowns spin slowly.
      ud.body.rotation.y = e.kind === 'worm' ? (e.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : e.kind === 'boss' ? (motion ? Math.sin(visualTime * 0.8) * 0.12 : 0) : motion ? visualTime * 0.5 + (e.col || 0) : 0;
      if (e.kind === 'droplet' && (e.mode === 'dive' || e.mode === 'aim')) ud.body.rotation.y = Math.atan2(e.target[0] - e.x, e.target[1] - e.z);
      if (ud.helix && motion) ud.helix.rotation.z = visualTime * 6;
      const mutating = e.mutating > 0,
        mutated = e.tier > 0;
      for (const mat of ud.mats) {
        if (ud.flash > 0) {
          mat.emissive.set('#ffffff');
          mat.emissiveIntensity = 1.6;
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
      if (e.kind === 'boss' && b) syncBossPart(s, b, e, ud, em, dt);
    }
    for (const [id, m] of enemyMeshes)
      if (!live.has(id)) {
        disposeObj(m);
        enemyMeshes.delete(id);
      }
  }
  function syncBossPart(s, b, e, ud, em, dt) {
    const card = b.cards[b.card];
    // Eyes narrow to telegraph an attack and close during a card break.
    const anyTele = (s.emitters || []).some((x) => x.boss && x.state === 'tele');
    const narrow = b.state === 'cardIntro' ? 0.15 : anyTele ? 0.35 : 1;
    for (const eye of ud.eyes) eye.scale.y += (narrow - eye.scale.y) * ease(dt, 12);
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
    void em;
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
      const vis = Math.max(b.vis ?? 0.26, minVis);
      const heading = Math.atan2(b.vx || 0, b.vz || 1e-6);
      if (f === 'droplet') placeBullet(mesh, n, b.x, b.z, heading, vis * 1.7, vis * 3.6, vis * 0.85);
      else if (f === 'spike') placeBullet(mesh, n, b.x, b.z, heading, vis * 2.2, vis * 3.2, vis * 0.7);
      else if (f === 'virion') placeBullet(mesh, n, b.x, b.z, (b.age || 0) * 1.6, vis * 2.4, vis * 2.4);
      else if (f === 'glob') {
        const wob = settings.effects() ? 1 + Math.sin((b.age || 0) * 7 + b.id) * 0.06 : 1;
        placeBullet(mesh, n, b.x, b.z, 0, vis * 2.2 * wob, vis * 2.2 / wob);
      } else placeBullet(mesh, n, b.x, b.z, 0, vis * 2.4, vis * 2.4);
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
      tmp.position.set(shot.x, BULLET_Y - 0.02, shot.z + 0.35);
      tmp.rotation.set(0, Math.atan2(shot.vx, shot.vz), 0);
      tmp.scale.set(0.2, 1, 0.95);
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
      m.position.set(p.x, 0.9, p.z);
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
      m.scale.set(beam.width * 0.85, 0.5, 13.4 - from);
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
    plunger.position.z = Math.max(0, plunger.position.z - dt * 1.2);
    // The barrel fills with cyan vaccine as the Dose Chain grows.
    const fill = 0.35 + 0.65 * Math.min(1, s.chain.count / 32);
    if (fluid) {
      fluid.scale.y = fill;
      fluid.position.z = 0.05 + (1 - fill) * 0.7;
    }
    const tier = chainMultiplier(s.chain.count);
    fluidMat.emissiveIntensity = 0.6 + (tier - 1) * 0.2;
    shipLight.position.set(sh.x, 1.2, sh.z);
    // The hitbox dot sits in the barrel, always drawn on top.
    const dotR = Math.max(RULES.shipRadius, minVis * 0.9) * (sh.focus ? 1.15 : 1);
    tmp.position.set(sh.x, BULLET_Y + 0.02, sh.z);
    tmp.rotation.set(0, 0, 0);
    // The white disc in the dot texture spans 0.656 of the quad, so this makes
    // the white dot exactly the collision core (or its minimum visible size).
    tmp.scale.set(dotR * 3.05, 1, dotR * 3.05);
    tmp.updateMatrix();
    dot.setMatrixAt(0, tmp.matrix);
    dot.instanceMatrix.needsUpdate = true;
    dot.visible = s.phase !== 'title';
    // Focus: a faint cyan 1.0 u graze ring.
    grazeRing.position.set(sh.x, BULLET_Y, sh.z);
    grazeRing.material.opacity += ((sh.focus ? 0.38 : 0) - grazeRing.material.opacity) * ease(dt, 14);
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
    const ring = s.soapRing;
    soap.visible = !!ring;
    if (ring) {
      soap.position.set(ring.x, BULLET_Y + 0.05, ring.z);
      soap.scale.setScalar(Math.max(0.1, ring.r));
      soapRim.material.opacity = Math.max(0, 0.9 - ring.t);
      soapFilm.material.opacity = Math.max(0, 0.18 - ring.t * 0.2);
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
    const need = w < 480 ? 5 : 7;
    minVis = need / 2 / far;
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  applyTheme(1);

  const raycaster = new THREE.Raycaster(),
    boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BULLET_Y),
    hitPoint = new THREE.Vector3(),
    ndc = new THREE.Vector2();
  const project = ([x, y, z]) => {
    const p = new THREE.Vector3(x, y, z).project(camera);
    return { ndcX: p.x, ndcY: p.y, pixelX: ((p.x + 1) * stage.clientWidth) / 2, pixelY: ((1 - p.y) * stage.clientHeight) / 2 };
  };
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
    },
    events(list) {
      for (const ev of list) onEvent(ev);
    },
    render(s, dt) {
      stateRef = s;
      visualTime += dt;
      applyTheme(getLevel(s.wave).world);
      titleGroup.visible = s.phase === 'title';
      if (titleGroup.visible && settings.effects()) titleGroup.children.forEach((c, i) => (c.rotation.y = visualTime * 0.4 + i));
      syncEnemies(s, dt);
      syncProjectiles(s);
      syncPickups(s);
      syncTelegraphs(s);
      syncShip(s, dt);
      syncTwist(s, dt);
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
        hitboxPx: 2 * Math.max(RULES.shipRadius, minVis * 0.9) * pxPerUnit(layout, h, [0, BULLET_Y, s.ship.z]),
        minBulletPx: 2 * Math.max(0.17, minVis) * pxPerUnit(layout, h, [0, BULLET_Y, -12.5]),
        camera: { fov: layout.fov, position: layout.position, target: layout.target },
      };
      camera.position.copy(saved);
      camera.lookAt(...layout.target);
      camera.updateMatrixWorld();
      return out;
    },
  };
}
