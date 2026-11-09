/** Three.js presentation of the cabinet. Reads model state, never writes it.
 *
 * Color has one meaning each (see RESEARCH.md section 10):
 *   phosphor = player and score, cyan = shield/system, pink = enemy fire,
 *   telegraphs and damage ONLY, amber = armor and medals, boss bodies are pale
 *   violet-white. Enemy archetypes differ by silhouette first, hue second.
 * Every projectile has a ground shadow so depth reads in perspective.
 * Juice (flash, punch, knockback, shake, debris) is visual only and is disabled
 * by prefers-reduced-motion or the Effects: Reduced setting.
 */
import * as THREE from './vendor/three.module.js';
import { cameraLayout, FRAMING_POINTS } from './camera.mjs';
import { RULES, getLevel, chainMultiplier } from './model.mjs';

export const PALETTE = Object.freeze({
  phosphor: '#91ffce',
  cyan: '#6fe8ff',
  pink: '#ff4fa3',
  pinkCore: '#ffe0f0',
  amber: '#ffb84d',
  boss: '#e9e2ff',
});
const KIND_COLOR = {
  spore: '#c9e46a',
  daughter: '#e4f294',
  splitter: '#a9dc52',
  armored: '#ffb84d',
  dart: '#9db6ff',
  diver: '#ff9a52',
  burster: '#ffd86b',
  infector: '#b58cff',
  capsid: '#a7bccb',
  courier: '#eefcff',
  flier: '#f2fbff',
};
export const PICKUP_STYLE = Object.freeze({
  rapid: { color: '#ffe27a', name: 'RAPID' },
  spread: { color: '#c3a6ff', name: 'SPREAD' },
  shield: { color: '#6fe8ff', name: 'SHIELD' },
  repair: { color: '#91ffce', name: 'REPAIR' },
});
const THEMES = {
  1: {
    marquee: 'BLOODSTREAM',
    background: '#06100f',
    floor: '#0f3a3a',
    grid: '#2f7b72',
    rails: ['#5fffd0', '#2fd3b0'],
    rim: '#45e8c0',
    fill: '#2f8f7c',
  },
  2: {
    marquee: 'AIRWAY',
    background: '#080b14',
    floor: '#1b2333',
    grid: '#4f6488',
    rails: ['#7fd8ff', '#d1a06a'],
    rim: '#77c8ff',
    fill: '#a07a52',
  },
  3: {
    marquee: 'LAB / PETRI',
    background: '#0e0a05',
    floor: '#33270f',
    grid: '#7c6630',
    rails: ['#ffcf73', '#a98bff'],
    rim: '#ffc46a',
    fill: '#8a6cff',
  },
};
const FLOOR_Y = -0.32;

function metal(color, emissive = 0x000000, intensity = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.34, metalness: 0.4, ...extra });
}
/** Merge non-indexed geometries so each enemy is one draw call. */
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
const M = (x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, q = null) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q || new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
const up = new THREE.Vector3(0, 1, 0);
function fib(n, count) {
  const y = 1 - (2 * (n + 0.5)) / count,
    r = Math.sqrt(1 - y * y),
    a = n * 2.39996;
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
}
function spiky(count, { spike = 0.52, cap = 0.16, detail = 1, core = 1, sx = 1 } = {}) {
  const parts = [[new THREE.IcosahedronGeometry(core, detail), M(0, 0, 0, sx, 1, 1)]];
  const cone = new THREE.ConeGeometry(0.15, spike, 5),
    ball = new THREE.IcosahedronGeometry(cap, 0);
  for (let n = 0; n < count; n++) {
    const v = fib(n, count);
    const q = new THREE.Quaternion().setFromUnitVectors(up, v);
    parts.push([cone, M(v.x * core * 1.02 * sx, v.y * core * 1.02, v.z * core * 1.02, 1, 1, 1, q)]);
    parts.push([ball, M(v.x * (core + spike * 0.55) * sx, v.y * (core + spike * 0.55), v.z * (core + spike * 0.55))]);
  }
  return merge(parts);
}
function buildGeometries() {
  const g = {};
  g.spore = spiky(14);
  g.daughter = spiky(8, { spike: 0.42 });
  g.splitter = merge([
    [spiky(9, { core: 0.82 }), M(-0.42, 0, 0)],
    [spiky(9, { core: 0.82 }), M(0.42, 0, 0)],
  ]);
  g.armoredCore = spiky(10, { spike: 0.45 });
  g.plates = new THREE.DodecahedronGeometry(1.18, 0);
  g.dart = merge([
    [new THREE.OctahedronGeometry(1, 0), M(0, 0, 0, 0.62, 0.62, 1.55)],
    [new THREE.BoxGeometry(1.7, 0.08, 0.35), M(0, 0, -0.5)],
    [new THREE.BoxGeometry(0.08, 0.9, 0.35), M(0, 0.2, -0.5)],
  ]);
  const fin = new THREE.BoxGeometry(0.08, 0.5, 0.7);
  g.diver = merge([
    [new THREE.ConeGeometry(0.75, 2, 6), M(0, 0, 0.1, 1, 1, 1, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2))],
    [fin, M(0.55, 0, -0.55, 1, 1, 1, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.9))],
    [fin, M(-0.55, 0, -0.55, 1, 1, 1, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.9))],
  ]);
  g.pod = new THREE.IcosahedronGeometry(1.12, 2);
  g.podCore = new THREE.IcosahedronGeometry(0.5, 1);
  const tendril = new THREE.CylinderGeometry(0.07, 0.02, 1.3, 4);
  g.infector = merge([
    [new THREE.TetrahedronGeometry(1, 0), null],
    ...[0, 1, 2].map((i) => {
      const a = (i * Math.PI * 2) / 3;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 1.2);
      return [tendril, M(Math.sin(a) * 0.7, -0.4, -Math.cos(a) * 0.7, 1, 1, 1, q)];
    }),
  ]);
  g.capsid = new THREE.IcosahedronGeometry(1, 0);
  g.plate = new THREE.BoxGeometry(1.5, 1.25, 0.22);
  g.courier = new THREE.CapsuleGeometry(0.55, 1.3, 4, 10);
  g.flier = merge([
    [new THREE.ConeGeometry(0.6, 1.4, 4), M(0, 0, 0, 1, 1, 1, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2))],
    [new THREE.BoxGeometry(1.6, 0.06, 0.4), M(0, 0, -0.3)],
  ]);
  g.bossBall = spiky(23, { spike: 0.5, cap: 0.13 });
  g.half = spiky(14, { core: 0.9, sx: 0.72 });
  g.sphere = new THREE.IcosahedronGeometry(1, 2);
  // Omega nodes: one silhouette per attack (matches the HUD sub-bar icons).
  const nodeCore = new THREE.OctahedronGeometry(0.62, 0);
  const forward = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  g.nodeAimed = merge([
    [nodeCore, null],
    [new THREE.ConeGeometry(0.42, 1.5, 6), M(0, 0, 0.75, 1, 1, 1, forward)],
  ]);
  g.nodeSpread = merge([
    [nodeCore, null],
    ...[-0.6, 0, 0.6].map((a) => {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a).multiply(forward);
      return [new THREE.ConeGeometry(0.26, 1.1, 5), M(Math.sin(a) * 0.7, 0, Math.cos(a) * 0.7, 1, 1, 1, q)];
    }),
  ]);
  g.nodeBeam = merge([
    [nodeCore, null],
    [new THREE.CylinderGeometry(0.34, 0.34, 2.4, 6), M(0, 0.2, 0)],
  ]);
  g.nodeSpawn = merge([
    [new THREE.IcosahedronGeometry(0.75, 1), M(0, 0, 0, 0.85, 1.15, 0.85)],
    [new THREE.TorusGeometry(0.95, 0.09, 6, 24), M(0, 0, 0, 1, 1, 1, forward)],
  ]);
  g.mirror = new THREE.CylinderGeometry(1, 1, 0.16, 28, 1, false, 0, Math.PI);
  g.torus = new THREE.TorusGeometry(1, 0.05, 6, 40);
  return g;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowMap = (() => {
  let t;
  return () =>
    (t ||= canvasTexture(64, 64, (g) => {
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, '#ffffffc0');
      r.addColorStop(0.25, '#ffffff50');
      r.addColorStop(1, '#ffffff00');
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
    }));
})();
function sprite(color, size, opacity = 0.6) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowMap(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  s.scale.set(size, size, 1);
  return s;
}
/** Capsule silhouettes drawn as icons: chevron, trident, ring, cross. Shape, not
 * color alone, tells them apart. */
export function drawPickupIcon(g, kind, w, color) {
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = w * 0.11;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const c = w / 2,
    r = w * 0.3;
  g.beginPath();
  if (kind === 'rapid') {
    for (const dy of [-0.16, 0.14]) {
      g.moveTo(c - r, c + r * 0.55 + dy * w);
      g.lineTo(c, c - r * 0.35 + dy * w);
      g.lineTo(c + r, c + r * 0.55 + dy * w);
    }
  } else if (kind === 'spread') {
    g.moveTo(c, c + r);
    g.lineTo(c, c - r);
    g.moveTo(c, c + r * 0.2);
    g.lineTo(c - r, c - r);
    g.moveTo(c, c + r * 0.2);
    g.lineTo(c + r, c - r);
  } else if (kind === 'shield') {
    g.arc(c, c, r, 0, Math.PI * 2);
  } else {
    g.moveTo(c, c - r);
    g.lineTo(c, c + r);
    g.moveTo(c - r, c);
    g.lineTo(c + r, c);
  }
  g.stroke();
}
/** Omega node icons, shared shape language with the HUD sub-bars:
 * aimed = arrowhead, spread = three-ray fan, beam = tall bar, spawn = egg + ring. */
export function drawNodeIcon(g, kind, w, color) {
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = w * 0.09;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const c = w / 2,
    r = w * 0.28;
  g.beginPath();
  if (kind === 'aimed') {
    g.moveTo(c, c + r);
    g.lineTo(c - r * 0.75, c - r * 0.6);
    g.lineTo(c + r * 0.75, c - r * 0.6);
    g.closePath();
    g.fill();
  } else if (kind === 'spread') {
    for (const a of [-0.55, 0, 0.55]) {
      g.moveTo(c, c - r * 0.7);
      g.lineTo(c + Math.sin(a) * r * 1.3, c - r * 0.7 + Math.cos(a) * r * 1.5);
    }
    g.stroke();
  } else if (kind === 'beam') {
    g.fillRect(c - r * 0.28, c - r, r * 0.56, r * 2);
  } else {
    g.ellipse(c, c, r * 0.62, r * 0.85, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(c - r, c);
    g.lineTo(c + r, c);
    g.stroke();
  }
}
function iconTexture(kind) {
  return canvasTexture(96, 96, (g, w) => {
    g.fillStyle = '#07141bcc';
    g.beginPath();
    g.arc(48, 48, 42, 0, Math.PI * 2);
    g.fill();
    drawPickupIcon(g, kind, w, PICKUP_STYLE[kind].color);
  });
}
function textTexture(text, color, w = 128, h = 64, font = 'bold 40px ui-monospace, Menlo, Consolas, monospace') {
  return canvasTexture(w, h, (g) => {
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = '#03100bcc';
    g.strokeText(text, w / 2, h / 2 + 2);
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

/** Under-glass backdrops: midtone only, no pink, no bullet-sized bright dots. */
function backdropTexture(world) {
  return canvasTexture(512, 512, (g, w, h) => {
    const rnd = (() => {
      let n = 1234 + world * 77;
      return () => ((n = (n * 16807) % 2147483647) / 2147483647);
    })();
    if (world === 1) {
      g.fillStyle = '#1b1416';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const x = rnd() * w,
          y = rnd() * h,
          r = 30 + rnd() * 26;
        for (const [ox, oy] of [
          [0, 0],
          [w, 0],
          [-w, 0],
          [0, h],
          [0, -h],
        ]) {
          const grad = g.createRadialGradient(x + ox, y + oy, r * 0.2, x + ox, y + oy, r);
          grad.addColorStop(0, '#3d2224');
          grad.addColorStop(0.55, '#5a2f31');
          grad.addColorStop(1, '#5a2f3100');
          g.fillStyle = grad;
          g.beginPath();
          g.ellipse(x + ox, y + oy, r, r * 0.8, rnd() * 3, 0, Math.PI * 2);
          g.fill();
        }
      }
    } else if (world === 2) {
      g.fillStyle = '#151a26';
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 64) {
        g.strokeStyle = '#2a3550';
        g.lineWidth = 18;
        g.beginPath();
        g.moveTo(0, y + 20);
        g.bezierCurveTo(w * 0.3, y + 4, w * 0.7, y + 36, w, y + 20);
        g.stroke();
        g.strokeStyle = '#33405f';
        g.lineWidth = 4;
        g.stroke();
      }
      g.lineWidth = 5;
      for (let i = 0; i < 9; i++) {
        g.strokeStyle = '#4a5878';
        g.beginPath();
        g.arc(rnd() * w, rnd() * h, 34 + rnd() * 30, 0, Math.PI * 2);
        g.stroke();
      }
    } else {
      const grad = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.75);
      grad.addColorStop(0, '#5a4318');
      grad.addColorStop(1, '#2a1e0b');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 16; i++) {
        const x = rnd() * w,
          y = rnd() * h,
          r = 34 + rnd() * 34;
        const c = g.createRadialGradient(x, y, 0, x, y, r);
        c.addColorStop(0, '#7a6030');
        c.addColorStop(1, '#7a603000');
        g.fillStyle = c;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

export function createRenderer({ canvas, stage, settings }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft was removed in r187
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#06100f');
  scene.fog = new THREE.Fog('#06100f', 44, 95);
  const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 140);
  const geo = buildGeometries();
  const fx = { trauma: 0, kick: 0, flash: 0 };
  let layout = cameraLayout(1, 1),
    themeWorld = 0,
    visualTime = 0,
    lastChainTier = 1,
    lastShipX = 0,
    stateRef = null;

  // --- Lighting and cabinet -------------------------------------------------
  scene.add(new THREE.AmbientLight('#b8d0ff', 1.15));
  const key = new THREE.DirectionalLight('#e4f0ff', 3);
  key.position.set(-7, 19, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -16, right: 16, top: 19, bottom: -19, near: 0.5, far: 50 });
  key.shadow.bias = -0.001;
  scene.add(key);
  const rim = new THREE.PointLight('#45e8c0', 70, 36);
  rim.position.set(-12, 4, 6);
  const fill = new THREE.PointLight('#2f8f7c', 45, 34);
  fill.position.set(12, 5, -6);
  scene.add(rim, fill);

  const shared = new THREE.BoxGeometry(1, 1, 1);
  function box(w, h, d, material, x, y, z, parent = scene) {
    const m = new THREE.Mesh(shared, material);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const dark = metal('#0e1a24'),
    edge = metal('#1a3140');
  box(21.2, 1, 29.5, dark, 0, -1.75, 0);
  for (const x of [-10, 10]) box(0.45, 1.9, 28.3, edge, x, -0.45, 0);
  box(20.5, 1.9, 0.5, edge, 0, -0.45, -14);
  box(20.5, 1.9, 0.5, edge, 0, -0.45, 14);
  // Under-glass backdrop plane and the translucent glass floor above it.
  const backdropMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(19.5, 27.6), backdropMat);
  backdrop.rotation.x = -Math.PI / 2;
  backdrop.position.y = -1.2;
  scene.add(backdrop);
  const glassMat = new THREE.MeshStandardMaterial({ color: '#0f3a3a', transparent: true, opacity: 0.55, roughness: 0.2, metalness: 0.2 });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(19.5, 26.8), glassMat);
  glass.rotation.x = -Math.PI / 2;
  glass.position.y = FLOOR_Y - 0.02;
  glass.receiveShadow = true;
  scene.add(glass);
  const gridPoints = [];
  for (let x = -8; x <= 8; x += 2) gridPoints.push(x, FLOOR_Y, -12.6, x, FLOOR_Y, 12.6);
  for (let z = -12; z <= 12; z += 2) gridPoints.push(-9.4, FLOOR_Y, z, 9.4, FLOOR_Y, z);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
  const gridMat = new THREE.LineBasicMaterial({ color: '#2f7b72', transparent: true, opacity: 0.3 });
  scene.add(new THREE.LineSegments(gridGeo, gridMat));
  // (The W3 UV lamp sweep was removed: a moving bright band on the floor read
  // as a lane-beam telegraph. Nothing decorative may resemble a warning.)
  const railMats = [metal('#5fffd0', '#5fffd0', 1.8), metal('#2fd3b0', '#2fd3b0', 1.6)];
  box(0.075, 0.09, 27, railMats[0], -9.65, 0.58, 0);
  box(0.075, 0.09, 27, railMats[1], 9.65, 0.58, 0);
  box(19.4, 0.09, 0.075, railMats[0], 0, 0.58, -13.45);
  // Infection load: the near rail fills with remaining-virus fraction.
  const loadMat = metal('#c9e46a', '#c9e46a', 0.9);
  const loadBar = box(19.2, 0.06, 0.16, loadMat, 0, 0.55, 13.2);
  box(19.4, 0.04, 0.22, metal('#16262d'), 0, 0.5, 13.2);
  box(17, 1.8, 0.7, dark, 0, 1.4, -15);
  const marqueeMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const marquee = new THREE.Mesh(new THREE.PlaneGeometry(15.5, 1.65), marqueeMat);
  marquee.position.set(0, 1.4, -14.62);
  scene.add(marquee);
  for (const x of [-10, 10]) {
    box(0.7, 0.7, 0.7, railMats[0], x, 0.1, -14);
    box(0.7, 0.7, 0.7, railMats[1], x, 0.1, 14);
    box(1.5, 1, 1.5, dark, x, -2.5, -12);
    box(1.5, 1, 1.5, dark, x, -2.5, 12);
  }
  const breachMat = new THREE.MeshBasicMaterial({ color: PALETTE.pink, transparent: true, opacity: 0, depthWrite: false });
  const breach = new THREE.Mesh(new THREE.PlaneGeometry(19, 0.16), breachMat);
  breach.rotation.x = -Math.PI / 2;
  breach.position.set(0, FLOOR_Y + 0.03, RULES.shipZ - 1);
  scene.add(breach);

  const backdrops = {},
    marquees = {};
  function applyTheme(world) {
    if (world === themeWorld) return;
    themeWorld = world;
    const t = THEMES[world] || THEMES[1];
    scene.background.set(t.background);
    scene.fog.color.set(t.background);
    glassMat.color.set(t.floor);
    gridMat.color.set(t.grid);
    railMats.forEach((m, i) => {
      m.color.set(t.rails[i]);
      m.emissive.set(t.rails[i]);
    });
    rim.color.set(t.rim);
    fill.color.set(t.fill);
    backdropMat.map = backdrops[world] ||= backdropTexture(world);
    backdropMat.map.wrapS = backdropMat.map.wrapT = THREE.RepeatWrapping;
    backdropMat.map.repeat.set(1.4, 2);
    backdropMat.color.set(world === 3 ? '#d8c8a8' : '#c8c8c8');
    backdropMat.needsUpdate = true;
    marqueeMat.map = marquees[world] ||= canvasTexture(1024, 128, (g) => {
      g.fillStyle = '#071217';
      g.fillRect(0, 0, 1024, 128);
      g.fillStyle = t.rails[0];
      g.font = 'bold 44px ui-monospace, Menlo, Consolas, monospace';
      g.textAlign = 'center';
      g.fillText(`CORONA INVADERS  ·  W${world} ${t.marquee}`, 512, 80);
    });
    marqueeMat.needsUpdate = true;
  }

  // --- Syringe ----------------------------------------------------------------
  const ship = new THREE.Group();
  scene.add(ship);
  const white = metal('#d7f1ee'),
    darkMetal = metal('#244252');
  const fluidMat = metal(PALETTE.phosphor, '#4dffa5', 0.85);
  function cyl(r, len, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  cyl(0.32, 1.65, new THREE.MeshStandardMaterial({ color: '#d3ffff', transparent: true, opacity: 0.42, roughness: 0.12, metalness: 0.1 }), 0, 0.61, -0.1, ship);
  const fluid = cyl(0.235, 1.33, fluidMat, 0, 0.61, -0.05, ship);
  cyl(0.19, 0.32, white, 0, 0.61, -1.02, ship);
  cyl(0.047, 0.73, white, 0, 0.61, -1.52, ship);
  const plunger = new THREE.Group();
  ship.add(plunger);
  cyl(0.11, 0.5, darkMetal, 0, 0.61, 0.95, plunger);
  box(0.7, 0.15, 0.22, white, 0, 0.61, 1.23, plunger);
  box(0.88, 0.13, 0.18, white, 0, 0.61, 0.67, ship);
  for (let i = 0; i < 4; i++) box(0.37, 0.035, 0.025, darkMetal, 0, 0.93, -0.55 + i * 0.25, ship);
  // Hitbox dot: the collision core is tiny and centered; show it on the barrel.
  const hitDot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  hitDot.position.set(0, 0.97, 0);
  ship.add(hitDot);
  const muzzle = sprite('#e6fff4', 1.4, 0);
  muzzle.position.set(0, 0.61, -1.95);
  ship.add(muzzle);
  const shipLight = new THREE.PointLight(PALETTE.phosphor, 10, 6);
  scene.add(shipLight);
  const shieldMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.25, 20, 12),
    new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.16, wireframe: true, depthWrite: false }),
  );
  shieldMesh.scale.set(1.3, 0.8, 1.3);
  scene.add(shieldMesh);
  // Floor rings at the ship base: shield cooldown (cyan) and capsule timers.
  const ringGroup = new THREE.Group();
  ringGroup.rotation.x = -Math.PI / 2;
  scene.add(ringGroup);
  const ringMesh = (inner, outer, color, opacity) => {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 48, 1, 0, Math.PI * 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
    );
    ringGroup.add(m);
    return m;
  };
  const shieldTrack = ringMesh(1.05, 1.16, '#20424a', 0.7);
  let shieldArc = ringMesh(1.05, 1.16, PALETTE.cyan, 0.85);
  const timerArcs = {};
  const chainSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  chainSprite.scale.set(1.6, 0.8, 1);
  scene.add(chainSprite);
  const chainTextures = {};
  function arc(mesh, inner, outer, fraction) {
    mesh.geometry.dispose();
    mesh.geometry = new THREE.RingGeometry(inner, outer, 48, 1, Math.PI / 2, Math.max(0.0001, fraction) * Math.PI * 2);
  }

  // --- Instanced projectiles, shadows, membranes and debris --------------------
  const MAX_BULLETS = 120;
  const bulletCore = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: PALETTE.pinkCore }), MAX_BULLETS);
  const bulletRim = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: '#c21d6e', side: THREE.BackSide }),
    MAX_BULLETS,
  );
  const shadowGeo = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
  const shadows = new THREE.InstancedMesh(shadowGeo, new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.45, depthWrite: false }), MAX_BULLETS * 2);
  const rods = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.075, 0.8, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#d9ffef' }), 90);
  // Membrane cells read as soft translucent cell walls, not bricks.
  const membranes = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1).scale(0.3, 0.24, 0.24),
    new THREE.MeshStandardMaterial({ color: '#7ff0d8', emissive: '#1f9e86', emissiveIntensity: 0.9, transparent: true, opacity: 0.62, roughness: 0.25, flatShading: false }),
    32,
  );
  const DEBRIS = 300;
  const debris = new THREE.InstancedMesh(shared, new THREE.MeshLambertMaterial(), DEBRIS);
  debris.castShadow = true;
  const debrisState = Array.from({ length: DEBRIS }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), s: 0.1 }));
  let debrisCursor = 0;
  for (const m of [bulletCore, bulletRim, shadows, rods, membranes, debris]) {
    m.count = 0;
    m.frustumCulled = false;
    scene.add(m);
  }
  const tmp = new THREE.Object3D(),
    tmpColor = new THREE.Color();
  debris.setColorAt(0, tmpColor.set('#ffffff'));

  // --- Telegraph meshes (pooled by telegraph id) -------------------------------
  const telegraphMeshes = new Map();
  const laneMat = () =>
    new THREE.MeshBasicMaterial({ color: PALETTE.pink, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const beamMeshes = new Map();
  const bursts = [];

  const enemyMeshes = new Map(),
    pickupMeshes = new Map();
  const iconTextures = Object.fromEntries(Object.keys(PICKUP_STYLE).map((k) => [k, iconTexture(k)]));
  const nodeTextures = Object.fromEntries(
    ['aimed', 'spread', 'beam', 'spawn'].map((k) =>
      [k, canvasTexture(96, 96, (g, w) => {
        g.fillStyle = '#0c0a1ccc';
        g.beginPath();
        g.arc(48, 48, 42, 0, Math.PI * 2);
        g.fill();
        drawNodeIcon(g, k, w, '#f1ecff');
      })],
    ),
  );

  function enemyMaterial(color, extra = {}) {
    return metal(color, color, 0.22, { flatShading: true, ...extra });
  }
  function addEnemy(e) {
    const group = new THREE.Group(),
      body = new THREE.Group();
    group.add(body);
    const ud = { body, flash: 0, punch: 0, knock: 0, mats: [] };
    const add = (geometry, material, parent = body) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      parent.add(mesh);
      if (material.emissive) {
        material.userData.base = material.emissiveIntensity;
        material.userData.baseColor = material.emissive.clone();
        ud.mats.push(material);
      }
      return mesh;
    };
    const kind = e.kind;
    let scale = e.radius;
    if (kind === 'boss') {
      const bodyMat = enemyMaterial(PALETTE.boss, { emissive: new THREE.Color('#9d8cff'), emissiveIntensity: 0.18 });
      if (e.part === 'whole') {
        add(geo.bossBall, bodyMat);
        ud.seam = add(geo.torus, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25 }));
        ud.seam.rotation.y = Math.PI / 2;
        ud.seam.scale.setScalar(1.08);
        scale = e.radius * 0.72;
      } else if (e.part === 'half') {
        add(geo.half, bodyMat);
        scale = e.radius * 0.8;
      } else if (e.part === 'core' && stateRef?.boss?.type === 'mother') {
        ud.nucleus = add(geo.sphere, enemyMaterial('#f3ecff', { emissive: new THREE.Color('#c9b8ff'), emissiveIntensity: 0.5 }));
        ud.nucleus.scale.setScalar(0.5);
        ud.shell = add(geo.sphere, new THREE.MeshStandardMaterial({ color: '#d9d0ff', transparent: true, opacity: 0.5, roughness: 0.15, metalness: 0.1, emissive: new THREE.Color('#6d5cc0'), emissiveIntensity: 0.25 }));
        scale = e.radius * 0.85;
      } else if (e.part === 'core') {
        add(geo.bossBall, bodyMat);
        ud.corona = add(geo.torus, new THREE.MeshBasicMaterial({ color: '#f5efff', transparent: true, opacity: 0.55 }));
        ud.corona.scale.setScalar(1.75);
        ud.corona.rotation.x = Math.PI / 2;
        ud.hex = add(new THREE.IcosahedronGeometry(1.75, 1), new THREE.MeshBasicMaterial({ color: PALETTE.cyan, wireframe: true, transparent: true, opacity: 0.35 }));
        scale = e.radius * 0.7;
      } else if (e.part === 'sac') {
        add(geo.sphere, enemyMaterial('#e3d8ff', { emissive: new THREE.Color('#8f7ad8'), emissiveIntensity: 0.25 }));
        scale = e.radius * 0.95;
      } else if (e.part === 'node') {
        const shape = { aimed: geo.nodeAimed, spread: geo.nodeSpread, beam: geo.nodeBeam, spawn: geo.nodeSpawn }[e.attackType];
        add(shape, enemyMaterial('#efe8ff', { emissive: new THREE.Color('#a493ff'), emissiveIntensity: 0.35 }));
        ud.glyph = new THREE.Sprite(new THREE.SpriteMaterial({ map: nodeTextures[e.attackType], transparent: true, depthWrite: false, toneMapped: false }));
        ud.glyph.position.y = 2.1;
        ud.glyph.scale.set(1.3, 1.3, 1);
        group.add(ud.glyph);
        scale = e.radius;
      } else if (e.part === 'echo') {
        ud.eye = add(geo.sphere, enemyMaterial('#f1ecff', { emissive: new THREE.Color('#c9b8ff'), emissiveIntensity: 0.6 }));
        ud.eye.scale.setScalar(0.62);
        const mirrorMat = new THREE.MeshStandardMaterial({ color: '#cfe4f4', metalness: 0.95, roughness: 0.08, emissive: new THREE.Color('#3b5870'), emissiveIntensity: 0.4 });
        ud.plateL = add(geo.mirror, mirrorMat);
        ud.plateR = add(geo.mirror, mirrorMat);
        for (const [p, rz] of [
          [ud.plateL, Math.PI / 2],
          [ud.plateR, -Math.PI / 2],
        ]) {
          p.rotation.set(Math.PI / 2, 0, rz);
          p.position.z = 0.7;
          p.scale.set(1.05, 1, 1.05);
        }
        for (const p of [ud.plateL, ud.plateR]) {
          const rimLine = new THREE.Mesh(geo.torus, new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.8 }));
          rimLine.scale.setScalar(1);
          rimLine.rotation.x = Math.PI / 2;
          p.add(rimLine);
        }
        ud.nucleusGlow = sprite('#f6f0ff', 3.2, 0);
        group.add(ud.nucleusGlow);
        scale = e.radius * 1.05;
      }
    } else {
      const color = KIND_COLOR[kind] || KIND_COLOR.spore;
      if (kind === 'armored' || e.armoredShell) {
        add(geo.armoredCore, enemyMaterial(e.armoredShell ? KIND_COLOR.splitter : KIND_COLOR.spore));
        ud.plates = add(geo.plates, enemyMaterial(PALETTE.amber, { transparent: true, opacity: 0.92 }));
        ud.cracks = new THREE.LineSegments(new THREE.EdgesGeometry(geo.plates), new THREE.LineBasicMaterial({ color: '#2b1606' }));
        ud.cracks.visible = false;
        body.add(ud.cracks);
      } else if (kind === 'splitter') {
        add(geo.splitter, enemyMaterial(color));
        ud.seam = add(geo.torus, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.2 }));
        ud.seam.rotation.y = Math.PI / 2;
        ud.seam.scale.setScalar(0.95);
      } else if (kind === 'burster') {
        ud.core = add(geo.podCore, metal('#fff4d0', '#ffd86b', 1.6));
        add(geo.pod, new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.5, roughness: 0.2, emissive: new THREE.Color(color), emissiveIntensity: 0.2 }));
      } else if (kind === 'capsid') {
        add(geo.capsid, enemyMaterial(color));
        ud.plate = add(geo.plate, enemyMaterial(PALETTE.amber));
        ud.plate.position.set(0, 0, 1.05);
      } else if (kind === 'courier') {
        const c = add(geo.courier, enemyMaterial(color, { emissive: new THREE.Color('#78dfff'), emissiveIntensity: 0.25 }));
        c.rotation.z = Math.PI / 2;
        ud.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTextures.rapid, transparent: true, depthWrite: false }));
        ud.icon.position.y = 1.9;
        ud.icon.scale.set(1.5, 1.5, 1);
        group.add(ud.icon);
      } else if (kind === 'flier') {
        add(geo.flier, enemyMaterial(color, { emissive: new THREE.Color('#9fe9ff'), emissiveIntensity: 0.9 }));
        group.add(sprite(PALETTE.cyan, 2.4, 0.35));
      } else add(geo[kind] || geo.spore, enemyMaterial(color));
    }
    // Warning ring: bright pink on a dark outline, not tone-mapped, so it stays
    // vivid on the amber W3 floor (playtest: it read as dark maroon).
    const warning = new THREE.Group();
    const ringMat = (color, opacity) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    warning.add(new THREE.Mesh(new THREE.RingGeometry(1.24, 1.66, 36), ringMat('#16030c', 0.8)));
    warning.add(new THREE.Mesh(new THREE.RingGeometry(1.33, 1.55, 36), ringMat('#ff5fb0', 1)));
    // Rings lie in the group's XY plane (rotated flat below), so lift along local
    // +Z and force draw order: dark outline first, bright pink on top.
    warning.children[1].position.z = 0.03;
    warning.children[0].renderOrder = 5;
    warning.children[1].renderOrder = 6;
    warning.rotation.x = -Math.PI / 2;
    warning.visible = false;
    group.add(warning);
    ud.warning = warning;
    // Visual size only (collision radii live in the model): a little larger than
    // the hitbox so silhouettes stay readable at 960x640.
    ud.scale = scale * (kind === 'boss' ? 1 : kind === 'flier' ? 1.05 : 0.84);
    group.scale.setScalar(ud.scale);
    group.userData = ud;
    scene.add(group);
    enemyMeshes.set(e.id, group);
    return group;
  }
  function dispose(group) {
    group.traverse((c) => {
      if (c.material) {
        c.material.map?.isCanvasTexture && !Object.values(iconTextures).includes(c.material.map) && c.material.map.dispose();
        c.material.dispose();
      }
      if (c.geometry && !Object.values(geo).includes(c.geometry) && c.geometry !== shared) c.geometry.dispose();
    });
    scene.remove(group);
  }

  function addPickup(p) {
    const group = new THREE.Group(),
      style = PICKUP_STYLE[p.kind];
    const mat = metal(style.color, style.color, 0.9);
    const icon = new THREE.Group();
    const bar = (w, x, z, ry) => {
      const m = new THREE.Mesh(shared, mat);
      m.scale.set(w, 0.16, 0.16);
      m.position.set(x, 0, z);
      m.rotation.y = ry;
      icon.add(m);
    };
    if (p.kind === 'rapid')
      for (const dz of [-0.18, 0.18]) {
        bar(0.62, -0.2, dz + 0.1, -0.75);
        bar(0.62, 0.2, dz + 0.1, 0.75);
      }
    else if (p.kind === 'spread') {
      bar(0.9, 0, 0, Math.PI / 2);
      bar(0.8, -0.24, -0.15, Math.PI / 2 - 0.6);
      bar(0.8, 0.24, -0.15, Math.PI / 2 + 0.6);
    } else if (p.kind === 'shield') icon.add(new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.08, 8, 24), mat));
    else {
      bar(0.8, 0, 0, 0);
      bar(0.8, 0, 0, Math.PI / 2);
    }
    group.add(icon);
    const glassBall = new THREE.Mesh(geo.sphere, new THREE.MeshStandardMaterial({ color: '#dffcff', transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false }));
    glassBall.scale.setScalar(0.62);
    group.add(glassBall);
    group.add(sprite(style.color, 2.2, 0.32));
    group.userData = { icon };
    scene.add(group);
    pickupMeshes.set(p.id, group);
    return group;
  }

  function spawnDebris(x, z, color, count, power = 1) {
    if (!settings.effects()) return;
    for (let i = 0; i < count; i++) {
      const d = debrisState[debrisCursor];
      const idx = debrisCursor;
      debrisCursor = (debrisCursor + 1) % DEBRIS;
      // Floor-plane only and short-lived: shards skid on the glass and fade in
      // 1.6 s, so they never hang in the enemy zone looking like small spores.
      d.life = 1.6;
      d.s = 0.1 + Math.random() * 0.12 * power;
      d.p.set(x + (Math.random() - 0.5) * 0.6, FLOOR_Y + d.s / 2, z + (Math.random() - 0.5) * 0.6);
      d.v.set((Math.random() - 0.5) * 6 * power, 0, (Math.random() - 0.5) * 6 * power);
      d.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      // Shards are dimmed to a midtone so they can never be mistaken for fire.
      debris.setColorAt(idx, tmpColor.set(color).multiplyScalar(0.28));
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
        // Shards settle on the glass and stay readable as permanence, not hazards.
        d.p.y = floor;
        d.v.y *= -0.25;
        d.v.x *= 0.6;
        d.v.z *= 0.6;
        d.r.multiplyScalar(0.6);
      }
      d.v.multiplyScalar(Math.max(0, 1 - dt * 3));
      const s = d.s * Math.min(1, d.life / 0.8);
      tmp.position.copy(d.p);
      tmp.rotation.set(d.r.x * (4 - d.life), d.r.y * (4 - d.life), 0);
      tmp.scale.setScalar(Math.max(0.001, s));
      tmp.updateMatrix();
      debris.setMatrixAt(i, tmp.matrix);
      n = i + 1;
    }
    // Inactive slots below n get zero scale so the instance range stays contiguous.
    for (let i = 0; i < n; i++)
      if (debrisState[i].life <= 0) {
        tmp.scale.setScalar(0.0001);
        tmp.updateMatrix();
        debris.setMatrixAt(i, tmp.matrix);
      }
    debris.count = n;
    debris.instanceMatrix.needsUpdate = true;
  }

  function addBurst(x, z, color, size = 2.2) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, FLOOR_Y + 0.05, z);
    const flash = sprite(color, size * 2, 0.8);
    flash.position.set(x, 1, z);
    scene.add(mesh, flash);
    bursts.push({ mesh, flash, life: 0.45, size });
  }

  // --- Events -> juice --------------------------------------------------------
  function onEvent(ev, s) {
    const motion = settings.effects();
    if (ev.type === 'shot') {
      muzzle.material.opacity = 0.9;
      muzzle.userData.t = 0.04;
      plunger.position.z = 0.14;
      if (motion) fx.kick = 0.04;
    } else if (ev.type === 'hit' && ev.id) {
      const m = enemyMeshes.get(ev.id);
      if (m) Object.assign(m.userData, { flash: 0.06, punch: 0.1, knock: 0.15 });
    } else if (ev.type === 'kill') {
      const big = ev.kind === 'boss';
      const color = big ? PALETTE.boss : KIND_COLOR[ev.kind] || (ev.kind === 'boss-part' ? PALETTE.boss : KIND_COLOR.spore);
      spawnDebris(ev.x, ev.z, color, big ? 60 : ev.kind === 'boss-part' ? 18 : 6 + Math.floor(Math.random() * 4), big ? 1.6 : 1);
      if (ev.kind === 'armored' || ev.kind === 'splitter' || ev.kind === 'capsid') fx.trauma += 0.15;
      if (ev.kind === 'boss-part') fx.trauma += 0.3;
      if (big) {
        fx.trauma += 0.8;
        addBurst(ev.x, ev.z, '#f4efff', 6);
      }
      if (ev.kind === 'courier') addBurst(ev.x, ev.z, PALETTE.cyan, 2);
    } else if (ev.type === 'burst') addBurst(ev.x, ev.z, '#ffd86b', ev.radius);
    else if (ev.type === 'damage') {
      fx.trauma += 0.3;
      fx.flash = 0.55;
    } else if (ev.type === 'phase-break') fx.trauma += 0.5;
    else if (ev.type === 'spark' || ev.type === 'blocked') addBurst(ev.x, ev.z, PALETTE.cyan, 0.6);
    else if (ev.type === 'membrane') spawnDebris(ev.x, ev.z, '#8fe6d2', 3, 0.5);
    else if (ev.type === 'split') addBurst(ev.x, ev.z, '#ffffff', 1.4);
    else if (ev.type === 'cured') addBurst(ev.x, ev.z, PALETTE.phosphor, 1.6);
    fx.trauma = Math.min(1, fx.trauma);
  }

  // --- Per-frame sync ---------------------------------------------------------
  function syncEnemies(s, dt) {
    const live = new Set();
    const b = s.boss;
    // Title screen: the formation stays hidden so viruses never overlap the logo.
    const title = s.phase === 'title';
    for (const e of s.enemies) {
      if (!e.alive || title) continue;
      live.add(e.id);
      const m = enemyMeshes.get(e.id) || addEnemy(e);
      const ud = m.userData,
        motion = settings.effects();
      ud.flash = Math.max(0, ud.flash - dt);
      ud.punch = Math.max(0, ud.punch - dt);
      ud.knock = Math.max(0, ud.knock - dt * 1.5);
      const bob = motion ? Math.sin(visualTime * 2 + e.row + e.col) * 0.1 : 0;
      m.position.set(e.x, 1 * ud.scale + bob, e.z - (motion ? ud.knock : 0));
      if (e.kind === 'diver' && e.mode !== 'formation' && (Math.abs(e.vx) + Math.abs(e.vz) > 0.5))
        ud.body.rotation.y = Math.atan2(e.vx, e.vz);
      else ud.body.rotation.y = motion ? Math.sin(visualTime * 0.7 + e.row) * 0.25 : 0;
      if (e.kind === 'flier') ud.body.rotation.y = Math.atan2(e.vx, e.vz);
      const punch = motion ? 1 + 0.12 * (ud.punch / 0.1) : 1;
      m.scale.setScalar(ud.scale * punch);
      const charging = e.charge > 0;
      // 60 ms white hit flash; a charging enemy glows (its pink ring is the warning).
      for (const mat of ud.mats) {
        mat.emissiveIntensity = ud.flash > 0 ? 2.4 : charging ? 0.9 + Math.sin(visualTime * 25) * 0.3 : mat.userData.base;
        if (ud.flash > 0) mat.emissive.set('#ffffff');
        else mat.emissive.copy(mat.userData.baseColor);
      }
      // A tethered spore shows the same pink ring: it is about to become armored.
      const tethered = s.telegraphs.some((t) => t.kind === 'tether' && t.targetId === e.id);
      ud.warning.visible = charging || tethered;
      if (ud.warning.visible) ud.warning.children[1].material.opacity = 0.75 + Math.sin(visualTime * 18) * 0.25;
      ud.warning.position.y = -1 + 0.05;
      if (ud.cracks) {
        ud.cracks.visible = e.hp < e.maxHp;
        ud.plates.material.opacity = e.hp < e.maxHp ? 0.45 : 0.92;
        ud.plates.scale.setScalar(e.hp < e.maxHp ? 0.94 : 1);
      }
      if (e.kind === 'splitter' && ud.seam) ud.seam.material.opacity = e.hp <= 1 ? 0.5 + Math.sin(visualTime * 14) * 0.4 : 0.15;
      if (ud.core && e.kind === 'burster') ud.core.scale.setScalar(1 + Math.sin(visualTime * 6 + e.col) * 0.12);
      if (ud.plate && e.plate) {
        const open = e.plate.state === 'open' ? 1 : e.plate.state === 'warning' ? 1 - e.plate.timer / RULES.warning : 0;
        ud.plate.position.x = open * 1.25;
        ud.plate.rotation.z = open * 0.9;
      }
      if (ud.icon && e.rouletteKind) ud.icon.material.map = iconTextures[e.rouletteKind];
      if (e.kind === 'boss' && b) {
        if (ud.seam) ud.seam.material.opacity = b.state === 'transition' ? 0.6 + Math.sin(visualTime * 30) * 0.4 : 0.18;
        if (ud.shell) {
          const open = b.open ? 1 : 0;
          ud.shell.material.opacity = 0.5 - open * 0.38;
          ud.nucleus.scale.setScalar(0.5 + open * 0.18 + Math.sin(visualTime * 3) * 0.03);
          ud.nucleus.material.emissiveIntensity = 0.5 + open * 1.4;
        }
        if (ud.hex) ud.hex.visible = b.phase === 0 || (b.script?.[b.step]?.shielded && b.stepState === 'tele');
        if (ud.corona) ud.corona.rotation.z = visualTime * 0.6;
        if (ud.plateL) {
          const vulnerable = b.phase === 2 ? e.id === b.nucleus : b.open;
          const k = vulnerable ? 1 : 0;
          ud.open = (ud.open ?? 0) + (k - (ud.open ?? 0)) * Math.min(1, dt * 10);
          ud.plateL.position.x = -ud.open * 0.95;
          ud.plateR.position.x = ud.open * 0.95;
          ud.eye.material.emissiveIntensity = 0.4 + ud.open * 1.6;
          ud.nucleusGlow.material.opacity = b.phase === 2 && e.id === b.nucleus ? 0.55 + Math.sin(visualTime * 8) * 0.2 : 0;
        }
        if (b.exposed) for (const mat of ud.mats) if (ud.flash <= 0) mat.emissiveIntensity = 0.7 + Math.sin(visualTime * 12) * 0.3;
        if (ud.glyph) {
          // The node whose attack comes next pulses (body and icon).
          const next = b.state === 'fight' && b.script?.[b.step]?.from === `node:${e.attackType}`;
          const k = next ? 1 + Math.sin(visualTime * 9) * 0.5 : 0;
          ud.glyph.scale.setScalar(1.3 + (next ? 0.35 + k * 0.15 : 0));
          ud.glyph.material.color.set(next ? '#ffd6ec' : '#ffffff');
          if (next && ud.flash <= 0) for (const mat of ud.mats) mat.emissiveIntensity = 0.8 + k * 0.6;
          m.scale.setScalar(ud.scale * punch * (next ? 1.12 : 1));
        }
      }
    }
    for (const [id, m] of enemyMeshes)
      if (!live.has(id)) {
        dispose(m);
        enemyMeshes.delete(id);
      }
  }

  function syncProjectiles(s) {
    let n = 0,
      sh = 0;
    for (const b of s.enemyShots) {
      if (n >= MAX_BULLETS) break;
      tmp.position.set(b.x, 0.8, b.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.setScalar(b.radius);
      tmp.updateMatrix();
      bulletCore.setMatrixAt(n, tmp.matrix);
      tmp.scale.setScalar(b.radius * 1.55);
      tmp.updateMatrix();
      bulletRim.setMatrixAt(n, tmp.matrix);
      tmp.position.set(b.x, FLOOR_Y + 0.02, b.z);
      tmp.scale.setScalar(b.radius * 1.5);
      tmp.updateMatrix();
      shadows.setMatrixAt(sh++, tmp.matrix);
      n++;
    }
    bulletCore.count = bulletRim.count = n;
    let r = 0;
    for (const shot of s.shots) {
      if (r >= 90) break;
      tmp.position.set(shot.x, 0.8, shot.z);
      tmp.rotation.set(0, Math.atan2(shot.vx, shot.vz), 0);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      rods.setMatrixAt(r++, tmp.matrix);
      tmp.position.set(shot.x, FLOOR_Y + 0.02, shot.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.setScalar(0.18);
      tmp.updateMatrix();
      if (sh < MAX_BULLETS * 2) shadows.setMatrixAt(sh++, tmp.matrix);
    }
    rods.count = r;
    for (const p of s.pickups) {
      tmp.position.set(p.x, FLOOR_Y + 0.02, p.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.setScalar(0.55);
      tmp.updateMatrix();
      if (sh < MAX_BULLETS * 2) shadows.setMatrixAt(sh++, tmp.matrix);
    }
    shadows.count = sh;
    let c = 0;
    for (const cell of s.membranes) {
      tmp.position.set(cell.x, 0.2, cell.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      membranes.setMatrixAt(c++, tmp.matrix);
    }
    membranes.count = c;
    for (const m of [bulletCore, bulletRim, shadows, rods, membranes]) m.instanceMatrix.needsUpdate = true;
  }

  function syncPickups(s) {
    const live = new Set();
    for (const p of s.pickups) {
      live.add(p.id);
      const m = pickupMeshes.get(p.id) || addPickup(p);
      m.position.set(p.x, 0.85, p.z);
      m.userData.icon.rotation.y = settings.effects() ? visualTime * 1.8 : 0;
    }
    for (const [id, m] of pickupMeshes)
      if (!live.has(id)) {
        dispose(m);
        pickupMeshes.delete(id);
      }
  }

  /** Telegraph path drawn as flat dashes on the glass. WebGL lines are always
   * 1 px, which disappears at 960 px; quads keep the warning legible. */
  function dashedLine(points, color, dash = 0.45, width = 0.2, solid = false) {
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
          bz = z0 + uz * e,
          y = FLOOR_Y + 0.06;
        pos.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz, ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  }
  function syncTelegraphs(s) {
    const live = new Set();
    const pulse = 0.55 + Math.sin(visualTime * 14) * 0.25;
    const level = getLevel(s.wave);
    for (const t of s.telegraphs) {
      live.add(t.id);
      let m = telegraphMeshes.get(t.id);
      const remaining = Number.isFinite(t.timer) ? Math.max(0, t.timer - t.age) : 1;
      if (t.kind === 'lane') {
        if (!m) {
          m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), laneMat());
          m.rotation.x = -Math.PI / 2;
          scene.add(m);
        }
        // Drawn from its source (boss or node) to the ship row.
        const from = Math.min(t.fromZ ?? -9, 8),
          to = 12.6;
        m.scale.set(t.width, to - from, 1);
        m.position.set(t.x, FLOOR_Y + 0.04, (from + to) / 2);
        // The glow brightens and pulses faster as the beam approaches, and stays
        // solid while the beam is live.
        m.material.opacity = t.firing
          ? 0.6
          : 0.18 + (1 - remaining / t.timer) * 0.35 + Math.sin(visualTime * (10 + 20 * (1 - remaining))) * 0.08;
      } else if (t.kind === 'path') {
        const owner = s.enemies.find((e) => e.id === t.ownerId);
        if (m) {
          scene.remove(m);
          m.geometry.dispose();
          m.material.dispose();
        }
        m = dashedLine(
          [
            [owner?.x ?? t.x, owner?.z ?? -8],
            [t.x, t.z],
            [t.x, RULES.shipZ + 0.6],
          ],
          PALETTE.pink,
        );
        m.material.opacity = pulse;
        scene.add(m);
      } else if (t.kind === 'flight' && !m) {
        m = dashedLine(level.flights?.[t.flight]?.path ?? [], PALETTE.cyan, 0.35, 0.14);
        m.material.opacity = 0.5;
        scene.add(m);
      } else if (t.kind === 'ring') {
        if (!m) {
          const pts = [];
          for (const a of t.angles) {
            // Stop each ray at the ship row or the side rail, whichever is first.
            let len = (RULES.shipZ + 1 - t.z) / Math.cos(a);
            if (Math.abs(Math.sin(a)) > 1e-4) len = Math.min(len, (9.3 - Math.sign(a) * t.x) / Math.abs(Math.sin(a)));
            pts.push([t.x, t.z], [t.x + Math.sin(a) * len, t.z + Math.cos(a) * len]);
          }
          m = new THREE.Group();
          for (let i = 0; i < pts.length; i += 2) m.add(dashedLine([pts[i], pts[i + 1]], PALETTE.pink, 0.5, 0.12, true));
          scene.add(m);
        }
        for (const c of m.children) c.material.opacity = 0.3 + (1 - remaining / t.timer) * 0.55;
      } else if (t.kind === 'tether') {
        const a = s.enemies.find((e) => e.id === t.ownerId),
          b = s.enemies.find((e) => e.id === t.targetId);
        if (m) {
          scene.remove(m);
          m.geometry.dispose();
          m.material.dispose();
        }
        m = dashedLine(
          [
            [a?.x ?? 0, a?.z ?? 0],
            [b?.x ?? 0, b?.z ?? 0],
          ],
          PALETTE.pink,
          0.26,
          0.32,
        );
        m.position.y = 0.95;
        m.material.opacity = pulse;
        scene.add(m);
      } else if (t.kind === 'glow') {
        const owner = s.enemies.find((e) => e.id === t.ownerId);
        if (!m) {
          m = sprite(PALETTE.cyan, 4, 0.5);
          scene.add(m);
        }
        if (owner) m.position.set(owner.x, 1.6, owner.z);
        m.scale.setScalar(3 + (1 - remaining / t.timer) * 3);
        m.material.opacity = 0.3 + (1 - remaining / t.timer) * 0.5;
      }
      if (m) telegraphMeshes.set(t.id, m);
    }
    for (const [id, m] of telegraphMeshes)
      if (!live.has(id)) {
        scene.remove(m);
        m.traverse((c) => {
          c.geometry?.dispose();
          c.material?.dispose();
        });
        telegraphMeshes.delete(id);
      }
    const beamLive = new Set();
    for (const beam of s.beams) {
      beamLive.add(beam.id);
      let m = beamMeshes.get(beam.id);
      if (!m) {
        m = new THREE.Mesh(shared, new THREE.MeshBasicMaterial({ color: '#ffd6ec', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
        scene.add(m);
        beamMeshes.set(beam.id, m);
        fx.trauma = Math.min(1, fx.trauma + 0.12);
      }
      m.scale.set(beam.width * 0.8, 2.2, 22);
      m.position.set(beam.x, 0.8, 2);
      m.material.opacity = 0.5 + Math.random() * 0.4;
    }
    for (const [id, m] of beamMeshes)
      if (!beamLive.has(id)) {
        scene.remove(m);
        m.material.dispose();
        beamMeshes.delete(id);
      }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.life -= 1 / 60;
      const k = 1 - b.life / 0.45;
      b.mesh.scale.setScalar(0.3 + k * b.size);
      b.mesh.material.opacity = Math.max(0, 0.85 * (1 - k));
      b.flash.material.opacity = Math.max(0, 0.8 * (1 - k * 1.6));
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
    ship.position.set(s.ship.x, 0, RULES.shipZ);
    ship.visible = s.ship.invulnerable <= 0 || !motion || Math.floor(visualTime * 9) % 2 === 0;
    const vx = dt > 0 ? (s.ship.x - lastShipX) / dt : 0;
    lastShipX = s.ship.x;
    ship.rotation.z = Math.max(-0.13, Math.min(0.13, -vx * 0.008));
    plunger.position.z = Math.max(0, plunger.position.z - dt * 1.4);
    muzzle.userData.t = (muzzle.userData.t ?? 0) - dt;
    if (muzzle.userData.t <= 0) muzzle.material.opacity = 0;
    // The barrel fills with fluid as the Dose Chain grows toward the x6 cap.
    const fill = 0.3 + 0.7 * Math.min(1, s.chain.count / 32);
    fluid.scale.y = fill;
    fluid.position.z = -0.05 + (1 - fill) * 0.66;
    const tier = chainMultiplier(s.chain.count);
    fluidMat.emissiveIntensity = 0.7 + (tier - 1) * 0.25;
    shipLight.position.set(s.ship.x, 0.7, RULES.shipZ);
    shieldMesh.position.copy(shipLight.position);
    const shielded = s.ship.shield > 0 || s.ship.powerups.shield > 0;
    shieldMesh.visible = shielded;
    shieldMesh.rotation.y = visualTime * 2;
    ringGroup.position.set(s.ship.x, FLOOR_Y + 0.05, RULES.shipZ);
    const ready = 1 - s.ship.shieldCooldown / RULES.shieldCooldown;
    arc(shieldArc, 1.05, 1.16, ready);
    shieldArc.material.opacity = ready >= 1 ? 0.95 : 0.55;
    shieldTrack.visible = ready < 1;
    let ringIndex = 0;
    for (const kind of ['rapid', 'spread', 'shield']) {
      const left = s.ship.powerups[kind];
      if (left > 0) {
        const inner = 1.25 + ringIndex * 0.16;
        timerArcs[kind] ||= ringMesh(inner, inner + 0.1, PICKUP_STYLE[kind].color, 0.9);
        arc(timerArcs[kind], inner, inner + 0.1, left / (kind === 'shield' ? RULES.shieldPickupDuration : RULES.powerupDuration));
        timerArcs[kind].visible = true;
        ringIndex++;
      } else if (timerArcs[kind]) timerArcs[kind].visible = false;
    }
    if (tier !== lastChainTier) {
      lastChainTier = tier;
      if (tier > 1) chainSprite.material.map = chainTextures[tier] ||= textTexture(`×${tier}`, PALETTE.phosphor);
      chainSprite.material.needsUpdate = true;
    }
    chainSprite.visible = tier > 1 && s.phase === 'playing';
    chainSprite.position.set(s.ship.x + 1.3, 1.6, RULES.shipZ - 0.6);
  }

  function updateCamera(dt) {
    const motion = settings.effects();
    fx.trauma = Math.max(0, fx.trauma - dt * 1.5);
    fx.kick = Math.max(0, fx.kick - dt * 0.8);
    const shake = motion ? fx.trauma * fx.trauma * 0.35 : 0;
    const [px, py, pz] = layout.position;
    camera.position.set(
      px + shake * Math.sin(visualTime * 47.3),
      py + shake * Math.sin(visualTime * 39.1 + 1.3),
      pz + shake * Math.sin(visualTime * 53.7 + 2.1) + (motion ? fx.kick : 0),
    );
    camera.lookAt(...layout.target);
  }

  function resize() {
    const w = stage.clientWidth,
      h = stage.clientHeight;
    renderer.setSize(w, h, false);
    layout = cameraLayout(w, h);
    camera.aspect = layout.aspect;
    camera.fov = layout.fov;
    camera.position.set(...layout.position);
    camera.lookAt(...layout.target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  applyTheme(1);

  const raycaster = new THREE.Raycaster(),
    tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.65),
    hitPoint = new THREE.Vector3(),
    ndc = new THREE.Vector2();
  return {
    renderer,
    camera,
    fx,
    /** World x on the table plane under a client point (pointer steering). */
    pick(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(tablePlane, hitPoint) ? hitPoint.x : NaN;
    },
    reset() {
      for (const [, m] of enemyMeshes) dispose(m);
      enemyMeshes.clear();
      for (const [, m] of pickupMeshes) dispose(m);
      pickupMeshes.clear();
      for (const [, m] of telegraphMeshes) scene.remove(m);
      telegraphMeshes.clear();
      for (const d of debrisState) d.life = 0;
    },
    events(list, s) {
      for (const ev of list) onEvent(ev, s);
    },
    render(s, dt) {
      stateRef = s;
      visualTime += dt;
      applyTheme(getLevel(s.wave).world);
      syncEnemies(s, dt);
      syncProjectiles(s);
      syncPickups(s);
      syncTelegraphs(s);
      syncShip(s, dt);
      updateDebris(dt);
      const alive = s.enemies.filter((e) => e.alive && !e.courier && !e.harmless).length,
        total = Math.max(1, s.enemies.filter((e) => !e.courier && !e.harmless).length);
      const load = s.boss ? s.boss.hp / s.boss.maxHp : alive / total;
      loadBar.scale.x = 19.2 * Math.max(0.001, load);
      loadBar.position.x = -9.6 + (19.2 * Math.max(0.001, load)) / 2;
      breachMat.opacity = s.breach ? 0.45 + Math.sin(visualTime * 10) * 0.35 : 0;
      const motion = settings.effects();
      if (backdropMat.map) backdropMat.map.offset.y = (visualTime * (themeWorld === 2 ? -0.006 : 0.004)) % 1;
      fx.flash = Math.max(0, fx.flash - dt * 2.5);
      updateCamera(dt);
      renderer.render(scene, camera);
      return motion ? fx.flash : 0;
    },
    info(s) {
      const project = ([x, y, z]) => {
        const p = new THREE.Vector3(x, y, z).project(camera);
        return { ndcX: p.x, ndcY: p.y, pixelX: ((p.x + 1) * stage.clientWidth) / 2, pixelY: ((1 - p.y) * stage.clientHeight) / 2 };
      };
      // Projection uses the unshaken layout so QA framing checks are stable.
      const saved = camera.position.clone();
      camera.position.set(...layout.position);
      camera.lookAt(...layout.target);
      camera.updateMatrixWorld();
      const out = {
        type: 'WebGLRenderer',
        webgl: true,
        triangles: renderer.info.render.triangles,
        calls: renderer.info.render.calls,
        viewport: { width: stage.clientWidth, height: stage.clientHeight },
        shipProjection: project([s.ship.x, 0.65, RULES.shipZ]),
        framingProjection: FRAMING_POINTS.map(project),
      };
      camera.position.copy(saved);
      camera.lookAt(...layout.target);
      camera.updateMatrixWorld();
      return out;
    },
  };
}
