import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { cameraLayout, FRAMING_POINTS, projectPoint } from '../camera.mjs';

for (const [width, height] of [
  [320, 844],
  [390, 804],
  [960, 596],
  [320, 726],
  [390, 726],
  [390, 500],
  [640, 360],
  [960, 521],
  [1280, 601],
]) {
  test(`ship travel envelope fits real perspective projection at ${width}x${height}`, () => {
    const layout = cameraLayout(width, height);
    const camera = new THREE.PerspectiveCamera(layout.fov, layout.aspect, 0.1, 120);
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
}
// Playtest: the old fixed camera used ~51% of the 960x640 stage width at the near
// edge and 17 px per unit for the back row. The fitted camera (which also keeps
// an 84 px top band free for the boss bar) must stay clearly larger.
const sizeAt = (layout, height, point) => {
  const q = projectPoint(point, layout);
  return height / 2 / (q.depth * Math.tan((layout.fov * Math.PI) / 360));
};
test('landscape framing is tight: wide field, back-row enemies at least 21 px per unit', () => {
  const layout = cameraLayout(960, 596);
  const back = sizeAt(layout, 596, [0, 0.8, -9.2]);
  assert.ok(back >= 21, `back row ${back.toFixed(1)} px/u`);
  const left = projectPoint([-9.4, 0, 12.4], layout).x,
    right = projectPoint([9.4, 0, 12.4], layout).x;
  assert.ok((right - left) / 2 >= 0.58, 'near edge spans at least 58% of the width');
  const ys = FRAMING_POINTS.map((p) => projectPoint(p, layout).y);
  const band = 1 - 84 / (596 / 2);
  assert.ok(Math.max(...ys) <= band + 1e-6, 'the top band stays free for the boss bar');
  assert.ok(Math.max(...ys) > band - 0.02 && Math.min(...ys) < -0.9, 'uses the rest of the height');
});
test('portrait framing anchors the arena to the top and keeps perspective moderate', () => {
  for (const [w, h] of [
    [390, 804],
    [320, 844],
  ]) {
    const layout = cameraLayout(w, h);
    const ys = FRAMING_POINTS.map((p) => projectPoint(p, layout).y);
    const band = 1 - 84 / (h / 2);
    assert.ok(Math.max(...ys) > band - 0.02 && Math.max(...ys) <= band + 1e-6, `${w}x${h}: arena starts right under the HUD band`);
    const near = sizeAt(layout, h, [0, 0.8, 10.4]),
      far = sizeAt(layout, h, [0, 0.8, -9.2]);
    assert.ok(near / far < 1.9, 'the far formation never shrinks to specks');
  }
});
