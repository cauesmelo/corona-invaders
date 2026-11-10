/** Camera: real perspective, tuned to read like a flat danmaku plane
 * (RESEARCH_BULLET_HELL.md 3.3). */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { cameraLayout, FRAMING_POINTS, projectPoint, depthRatio, pxPerUnit, MAX_DEPTH_RATIO, TOP_BAND } from '../camera.mjs';

const VIEWPORTS = [
  [320, 844],
  [390, 844],
  [390, 794],
  [960, 640],
  [960, 596],
  [640, 360],
  [1280, 720],
];
const pitchOf = (l) => (Math.atan2(l.position[1], l.position[2] - l.target[2]) * 180) / Math.PI;

for (const [width, height] of VIEWPORTS)
  test(`the whole board fits a real perspective projection at ${width}x${height}`, () => {
    const layout = cameraLayout(width, height);
    const camera = new THREE.PerspectiveCamera(layout.fov, layout.aspect, 0.1, 400);
    camera.position.set(...layout.position);
    camera.lookAt(...layout.target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    for (const point of FRAMING_POINTS) {
      const p = new THREE.Vector3(...point).project(camera);
      assert.ok(Math.abs(p.x) <= 0.940001, `horizontal clipping: ${point} -> ${p.x}`);
      assert.ok(Math.abs(p.y) <= 0.940001, `vertical clipping: ${point} -> ${p.y}`);
      assert.ok(p.z > -1 && p.z < 1);
    }
  });

test('steep and narrow: pitch 64-74 degrees, FOV 24-32 degrees, far/near depth ratio <= 1.35, fixed camera', () => {
  for (const [w, h] of VIEWPORTS) {
    const l = cameraLayout(w, h);
    assert.ok(pitchOf(l) >= 64 - 1e-4 && pitchOf(l) <= 74 + 1e-4, `${w}x${h} pitch ${pitchOf(l)}`);
    assert.ok(l.fov >= 24 && l.fov <= 32, `${w}x${h} fov ${l.fov}`);
    assert.ok(depthRatio(l) <= MAX_DEPTH_RATIO, `${w}x${h} ratio ${depthRatio(l)}`);
    assert.equal(l.position[0], 0, 'no yaw, no follow');
  }
});

test('landscape 960x640: the board is a centred column 430-520 px wide, leaving the side columns for the HUD', () => {
  const l = cameraLayout(960, 640);
  const left = projectPoint([-9.4, 0.55, 12.9], l).x,
    right = projectPoint([9.4, 0.55, 12.9], l).x;
  const px = ((right - left) / 2) * 960;
  assert.ok(px >= 430 && px <= 520, `${px.toFixed(0)} px`);
  assert.ok(Math.abs(left + right) < 1e-6, 'centred');
  assert.ok(((1 + left) / 2) * 960 >= 200, 'side columns at least 200 px');
  const ys = FRAMING_POINTS.map((p) => projectPoint(p, l).y);
  assert.ok(Math.max(...ys) <= 1 - TOP_BAND.side / 320 + 1e-6, 'the VIRAL LOAD band stays clear');
});

test('minimum on-screen sizes: the 0.16 u core reads >= 6 px and scaling the smallest bullet stays modest', () => {
  const far960 = pxPerUnit(cameraLayout(960, 640), 640, [0, 0.55, -12.5]);
  const near960 = pxPerUnit(cameraLayout(960, 640), 640, [0, 0.55, 10]);
  assert.ok(2 * 0.16 * near960 >= 6, `core ${(2 * 0.16 * near960).toFixed(1)} px`);
  // The renderer raises visual radii (never hit radii) to >= 7 px at the far
  // edge (5 px at 320 wide); that must stay a small adjustment.
  assert.ok(7 / (2 * far960) <= 0.17 * 1.15, `aerosol scaled by ${(7 / (2 * far960) / 0.17).toFixed(2)}`);
  const far320 = pxPerUnit(cameraLayout(320, 844), 844, [0, 0.55, -12.5]);
  assert.ok(5 / (2 * far320) <= 0.17 * 1.1, `320 px: aerosol scaled by ${(5 / (2 * far320) / 0.17).toFixed(2)}`);
});

test('portrait: the board fills the width under the HUD strip and leaves a thumb zone below', () => {
  for (const [w, h] of [
    [390, 844],
    [320, 844],
  ]) {
    const l = cameraLayout(w, h);
    const ys = FRAMING_POINTS.map((p) => projectPoint(p, l).y);
    const band = 1 - TOP_BAND.strip / (h / 2);
    assert.ok(Math.max(...ys) > band - 0.02 && Math.max(...ys) <= band + 1e-6, `${w}x${h}: starts right under the band`);
    const xs = FRAMING_POINTS.map((p) => Math.abs(projectPoint(p, l).x));
    assert.ok(Math.max(...xs) > 0.92, 'fills the width');
    assert.ok((Math.min(...ys) + 1) / 2 >= 0.25, `${w}x${h}: thumb zone ${(((Math.min(...ys) + 1) / 2) * 100).toFixed(0)}%`);
  }
});
