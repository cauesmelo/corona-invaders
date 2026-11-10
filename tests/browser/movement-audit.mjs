/** Movement audit in a real browser (MOVEMENT_AUDIT.md). Not part of
 * `npm test` (it needs Chrome); run with the game served locally:
 *
 *   node serve.mjs --port 4402 &
 *   node tests/browser/movement-audit.mjs http://127.0.0.1:4402/
 *
 * Chrome via Playwright (channel 'chrome', SwiftShader WebGL). Playwright is
 * resolved from ../common (the workspace's shared QA tools) or
 * PLAYWRIGHT_FROM=/path/to/package.json.
 *
 * 1. Pixels: __game.probe(layer + '-solid') draws one layer alone on black
 *    with white masks of the solid regions, through the production quads, at
 *    device pixel ratio 2; lit pixels are compared with the collider
 *    projected through the live camera (core marker at four board positions,
 *    six bullet families at three depths, the graze ring), in 960x640,
 *    390x844 and 320x568 windows.
 * 2. Input: CDP-dispatched (trusted) keys, mouse and touch: latency in
 *    rendered frames, speeds, Space held through a start / retry / resume,
 *    a direction held through a pause, hover and lost-release mouse rules,
 *    touch drag past an edge.
 */
import { createRequire } from 'node:module';
const require = createRequire(process.env.PLAYWRIGHT_FROM || new URL('../../../common/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const BASE = process.argv[2] || 'http://127.0.0.1:4402/';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-webgl'] });

// ---- 1. Pixels -------------------------------------------------------------------
const VIEWPORTS = [[960, 640], [390, 844], [320, 568]];
const out = { marker: [], bullets: [], graze: [], stage: [], errors: [] };
const helpers = () => {
  window.__audit = {
    grab() {
      const gl = document.querySelector('#game');
      const c = document.createElement('canvas');
      c.width = gl.width;
      c.height = gl.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(gl, 0, 0);
      return g;
    },
    /** Projected centre and half-extents (CSS px) of radius r at (x, y, z). */
    proj(x, y, z, r) {
      const info = __game.renderer();
      const cam = info.camera,
        W = info.viewport.width,
        H = info.viewport.height;
      const P = (p) => {
        const pos = cam.position,
          f = cam.target.map((t, i) => t - pos[i]),
          n = Math.hypot(...f),
          fw = f.map((v) => v / n),
          up = [0, -fw[2], fw[1]];
        const v = [p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]];
        const depth = v[0] * fw[0] + v[1] * fw[1] + v[2] * fw[2],
          t = Math.tan((cam.fov * Math.PI) / 360),
          vy = v[0] * up[0] + v[1] * up[1] + v[2] * up[2];
        return [((v[0] / (depth * t * (W / H)) + 1) * W) / 2, ((1 - vy / (depth * t)) * H) / 2];
      };
      const c = P([x, y, z]),
        l = P([x - r, y, z]),
        rr = P([x + r, y, z]),
        tp = P([x, y, z - r]),
        bt = P([x, y, z + r]);
      return { cx: c[0], cy: c[1], hx: (rr[0] - l[0]) / 2, hy: (bt[1] - tp[1]) / 2 };
    },
    /** Channel-sum profile through (cx, cy) device px, horizontal or vertical. */
    profile(g, cx, cy, span, vertical) {
      const d = vertical ? g.getImageData(cx, cy - span, 1, 2 * span + 1).data : g.getImageData(cx - span, cy, 2 * span + 1, 1).data;
      return Array.from({ length: 2 * span + 1 }, (_, i) => d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]);
    },
    /** A white solid on black (probe '-solid'): lit pixel counts across the
     * centre row and column and the lit area, against the projected collider
     * (circle, or capsule along screen y with half-length ratio hr = half / r).
     * Device px are converted to CSS px. */
    solid(g, p, hr) {
      const k = devicePixelRatio,
        hy = p.hy * (1 + hr);
      const span = Math.ceil(Math.max(p.hx, hy) * k * 1.6) + 4;
      const x0 = Math.round(p.cx * k) - span,
        y0 = Math.round(p.cy * k) - span,
        n = 2 * span + 1;
      const d = g.getImageData(x0, y0, n, n).data;
      const lit = (i, j) => d[(j * n + i) * 4] + d[(j * n + i) * 4 + 1] + d[(j * n + i) * 4 + 2] > 382;
      let area = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (lit(i, j)) area++;
      const ci = Math.round(p.cx * k) - x0,
        cj = Math.round(p.cy * k) - y0;
      let row = 0,
        col = 0;
      for (let i = 0; i < n; i++) if (lit(i, cj)) row++;
      for (let j = 0; j < n; j++) if (lit(ci, j)) col++;
      const want = Math.PI * p.hx * p.hy * k * k + 2 * p.hx * 2 * p.hy * hr * k * k;
      return { collider: [2 * p.hx, 2 * hy], drawn: [row / k, col / k], areaRatio: area / want };
    },
    /** Outer edge distances (device px, both sides) of a solid whose outermost
     * band is a dark rim: walking out from the centre, the last rim pixel is
     * where the signal rises again above halfway from the rim to what lies
     * just outside (glow or black). With `onBlack`, the edge is where the rim
     * fades to black: halfway between the rim level and 0. */
    edges(vals, onBlack) {
      const mid = (vals.length - 1) / 2,
        res = [];
      for (const dir of [-1, 1]) {
        if (onBlack) {
          let i = mid;
          while (i + dir >= 0 && i + dir < vals.length && vals[i + dir] > 0) i += dir; // last lit pixel
          // rim level: the median of the 2 lit pixels before the edge
          const rim = Math.max(vals[i], vals[i - dir]);
          const half = rim / 2;
          let j = mid;
          while (vals[j + dir] >= half) j += dir;
          const a = vals[j],
            b = vals[j + dir];
          res.push(Math.abs(j + dir * ((a - half) / (a - b)) - mid) + 0.5);
        } else {
          let iMin = mid,
            vMin = Infinity;
          for (let i = mid; i >= 0 && i < vals.length; i += dir) if (vals[i] < vMin) [vMin, iMin] = [vals[i], i];
          let peak = 0;
          for (let i = iMin; i >= 0 && i < vals.length && Math.abs(i - iMin) < 6; i += dir) peak = Math.max(peak, vals[i]);
          const half = (vMin + peak) / 2;
          let i = iMin;
          while (vals[i + dir] < half) i += dir;
          const a = vals[i],
            b = vals[i + dir];
          res.push(Math.abs(i + dir * ((half - a) / (b - a)) - mid) + 0.5);
        }
      }
      return res;
    },
  };
};
for (const [w, h] of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => out.errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && out.errors.push(m.text()));
  await page.goto(BASE);
  await page.waitForFunction(() => window.__game && __game.renderer().webgl);
  await page.evaluate(helpers);
  out.stage.push({ viewport: `${w}x${h}`, stage: await page.evaluate(() => __game.renderer().viewport) });
  for (const [x, z] of [[0, 10.4], [-8.9, -3], [8.9, 12], [4, 2]]) {
    const r = await page.evaluate(([x, z]) => {
      __game.newRun(42);
      __game.checkpoint(1);
      __game.setState({ enemies: [], enemyShots: [], emitters: [], pickups: [], ship: { x, z, invulnerable: 0 } });
      __game.probe('marker-solid');
      const g = __audit.grab();
      return __audit.solid(g, __audit.proj(x, 0.55, z, 0.2), 0);
    }, [x, z]);
    out.marker.push({ viewport: `${w}x${h}`, x, z, ...r });
  }
  const fams = ['droplet', 'aerosol', 'spike', 'rna', 'virion', 'glob'];
  for (const z of [-10, 0, 9]) {
    const rows = await page.evaluate(([fams, z]) => {
      __game.setState({ ship: { x: 0, z: 11.5 }, enemyShots: fams.map((f, i) => ({ id: 100 + i, x: -6.5 + i * 2.6, z, vx: 0, vz: 0.001, family: f, src: 'T', age: 0 })) });
      __game.probe('bullets-solid');
      const st = __game.getState(),
        g = __audit.grab();
      return st.enemyShots.map((b) => ({ family: b.family, z: b.z, ...__audit.solid(g, __audit.proj(b.x, 0.55, b.z, b.hit), b.half / b.hit) }));
    }, [fams, z]);
    out.bullets.push({ viewport: `${w}x${h}`, rows });
  }
  // Graze ring: drawn while focused.
  const gr = await page.evaluate(() => {
    __game.setState({ enemyShots: [], ship: { x: 0, z: 8 } });
    __game.step(1 / 120, { focus: true }, { render: false });
    __game.probe('graze');
    const g = __audit.grab(),
      k = devicePixelRatio;
    const p = __audit.proj(0, 0.55, 8, 1);
    const cx = Math.round(p.cx * k),
      cy = Math.round(p.cy * k),
      span = Math.ceil(p.hx * k) + 6;
    const row = __audit.profile(g, cx, cy, span, false);
    // Outer edge: the outermost half-maximum crossing of the thin ring band.
    const max = Math.max(...row),
      half = max / 2;
    // Continuous coordinates: pixel i spans [i, i + 1], its centre is i + 0.5.
    let i = row.length - 1;
    while (row[i] < half) i--;
    const R = i + 0.5 + (row[i] - half) / (row[i] - (row[i + 1] ?? 0));
    let j = 0;
    while (row[j] < half) j++;
    const L = j + 0.5 - (row[j] - half) / (row[j] - (row[j - 1] ?? 0));
    return { collider: 2 * p.hx, drawn: (R - L) / k, peak: max };
  });
  out.graze.push({ viewport: `${w}x${h}`, ...gr });
  await page.close();
}

const f = (n) => n.toFixed(2);
for (const m of out.marker) console.log(`marker ${m.viewport} (${m.x}, ${m.z}) collider ${f(m.collider[0])} x ${f(m.collider[1])} px, drawn ${f(m.drawn[0])} x ${f(m.drawn[1])} px, area ratio ${f(m.areaRatio)}`);
for (const b of out.bullets) for (const r of b.rows) console.log(`bullet ${b.viewport} ${r.family.padEnd(8)} z ${String(r.z).padStart(3)}: collider ${f(r.collider[0])} x ${f(r.collider[1])} px, drawn ${f(r.drawn[0])} x ${f(r.drawn[1])} px, area ratio ${f(r.areaRatio)}`);
for (const g of out.graze) console.log(`graze ${g.viewport} collider ${f(g.collider)} drawn outer ${f(g.drawn)} (peak ${g.peak})`);

if (out.errors.length) console.log('pixel run errors', out.errors);

// ---- 2. Input --------------------------------------------------------------------
{
const out = {};
const errors = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(opts = {}) {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 }, ...opts });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE);
  await page.waitForFunction(() => window.__game && __game.renderer().webgl);
  // Per-frame log, registered after the game's own rAF so it reads the state
  // the game just simulated and drew; key events are stamped with the frame.
  await page.evaluate(() => {
    window.__log = [];
    window.__keys = [];
    const tick = () => {
      const s = __game.getState();
      __log.push({ t: performance.now(), x: s.ship.x, z: s.ship.z, clock: s.clock, bombs: s.bombsUsed, phase: s.phase, paused: s.paused, focus: s.ship.focus });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    for (const type of ['keydown', 'keyup']) window.addEventListener(type, (e) => __keys.push({ type, code: e.code, repeat: e.repeat, frame: __log.length, t: performance.now() }), true);
  });
  return page;
}
/** A quiet sample: stage 1 with nothing on the board, the syringe invulnerable. */
async function quietStage(page, ship = {}) {
  await page.evaluate((ship) => {
    __game.newRun(42);
    __game.checkpoint(1);
    __game.setState({ enemies: [], enemyShots: [], emitters: [], pickups: [], ship: { x: -6, z: 8, invulnerable: 1e9, ...ship } });
    document.querySelector('#game').focus();
  }, ship);
  await wait(200);
}
const logFrom = (page, n) => page.evaluate((n) => __log.slice(n), n);
const logLen = (page) => page.evaluate(() => __log.length);
const state = (page) => page.evaluate(() => __game.getState());

// ---- A1: real key -> state on the next rendered frame; speeds -------------------
{
  const page = await open();
  await quietStage(page);
  const n0 = (await logLen(page)) - 1; // include the last frame before the key
  await page.keyboard.down('ArrowRight');
  await wait(400);
  await page.keyboard.down('ShiftLeft');
  await wait(400);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('ArrowRight');
  await wait(600);
  const log = await logFrom(page, n0);
  const keys = await page.evaluate(() => __keys);
  const frameOf = (code, type) => keys.find((k) => k.code === code && k.type === type).frame - n0;
  const kd = frameOf('ArrowRight', 'keydown'),
    sd = frameOf('ShiftLeft', 'keydown'),
    ku = frameOf('ArrowRight', 'keyup');
  const moved = log.findIndex((r, i) => i >= kd && r.x > log[kd - 1].x);
  const speed = (a, b) => (log[b].x - log[a].x) / (log[b].clock - log[a].clock);
  // First frame at or after the keyup that no longer moved.
  const stopIdx = log.findIndex((r, i) => i >= ku && i > 0 && r.x === log[i - 1].x);
  const slowIdx = log.findIndex((r, i) => i >= sd && r.focus);
  out.a1raw = { kd, sd, ku, n: log.length, xs: log.map((r) => +r.x.toFixed(3)).join(' ') };
  // Frame pacing: simulated time per rendered frame.
  const dclock = log.slice(1).map((r, i) => +(r.clock - log[i].clock).toFixed(6));
  const realSpan = (log.at(-1).t - log[0].t) / 1000,
    simSpan = log.at(-1).clock - log[0].clock;
  out.a1 = {
    // Frame index k is the first frame drawn after an event stamped k.
    keyToMoveFrames: moved - kd + 1,
    fullSpeed: speed(kd + 1, sd - 1),
    focusSpeed: speed(sd + 1, ku - 1),
    shiftToFocusFrames: slowIdx - sd + 1,
    keyupToStopFrames: stopIdx - ku + 1,
    simPerFrame: [...new Set(dclock)].slice(0, 6),
    simVsReal: simSpan / realSpan,
  };
  await page.close();
}

// ---- A3: held Space across pause/resume, sample start, retry ---------------------
async function holdSpace(page, ms) {
  // Playwright marks repeated keydowns of a held key as repeat: true, like OS auto-repeat.
  await page.keyboard.down('Space');
  for (let t = 0; t < ms; t += 50) {
    await wait(50);
    await page.keyboard.down('Space');
  }
}
{
  // Resume with P while Space is held (with key repeat) from before the pause.
  const page = await open();
  await quietStage(page, { x: 0 });
  await page.keyboard.press('KeyP');
  await wait(200);
  const paused = (await state(page)).paused;
  await page.evaluate(() => document.querySelector('#game').focus());
  await page.keyboard.down('Space');
  await wait(300);
  await page.keyboard.press('KeyP');
  for (let t = 0; t < 900; t += 50) {
    await wait(50);
    await page.keyboard.down('Space');
  }
  const s1 = await state(page);
  await page.keyboard.up('Space');
  await wait(150);
  await page.keyboard.press('Space');
  await wait(200);
  const s2 = await state(page);
  out.pauseResume = { paused, resumed: !s1.paused, soapWhileHeld: s1.bombsUsed, soapAfterFreshPress: s2.bombsUsed };
  await page.close();
}
{
  // A direction held through a pause acts on the first frame after resume.
  const page = await open();
  await quietStage(page, { x: 0 });
  await page.keyboard.press('KeyP');
  await wait(200);
  await page.keyboard.down('ArrowLeft');
  await wait(300);
  const xp = (await state(page)).ship.x;
  const n0 = (await logLen(page)) - 1;
  await page.keyboard.press('KeyP');
  await wait(400);
  await page.keyboard.up('ArrowLeft');
  const log = await logFrom(page, n0);
  const keys = await page.evaluate(() => __keys);
  const resumeFrame = keys.filter((k) => k.code === 'KeyP' && k.type === 'keydown').at(-1).frame - n0;
  const movedAt = log.findIndex((r, i) => i >= resumeFrame && r.x < xp - 1e-9);
  out.heldThroughPause = { stillWhilePaused: log[resumeFrame - 1].x === xp, resumeToMoveFrames: movedAt < 0 ? null : movedAt - resumeFrame + 1, moved: xp - log.at(-1).x };
  await page.close();
}
{
  // Sample start: Space on the title starts play (canvas focused, so it is the
  // keydown path, not a button click) and stays held with key repeat.
  const page = await open();
  await page.evaluate(() => document.querySelector('#game').focus());
  await holdSpace(page, 1200);
  const s1 = await state(page);
  await page.keyboard.up('Space');
  await wait(100);
  out.titleStart = { phase: s1.phase, soapWhileHeld: s1.bombsUsed };
  // Loss screen: lose, wait out the 1 s lock, retry with a held Space.
  await page.evaluate(() => {
    const s = __game.getState();
    __game.setState({ health: 1, ship: { invulnerable: 0, respawn: 0, bombs: 0 }, enemyShots: [{ id: 1, x: s.ship.x, z: s.ship.z, vx: 0, vz: 0, family: 'aerosol' }] });
  });
  await page.waitForFunction(() => __game.getState().phase === 'lost');
  const lost = (await state(page)).phase;
  await page.evaluate(() => document.querySelector('#game').focus());
  await wait(1100);
  await holdSpace(page, 1000);
  const s2 = await state(page);
  await page.keyboard.up('Space');
  out.retry = { lost, phase: s2.phase, soapWhileHeld: s2.bombsUsed };
  await page.close();
}

// ---- Mouse: never takes over the keyboard ----------------------------------------
{
  const page = await open();
  await quietStage(page, { x: 0, z: 8 });
  const info = await page.evaluate(() => __game.renderer());
  const rect = await page.evaluate(() => document.querySelector('#game').getBoundingClientRect().toJSON());
  const fr = info.fieldRect;
  const at = (fx, fy) => [rect.left + fr.left + (fr.right - fr.left) * fx, rect.top + fr.top + (fr.bottom - fr.top) * fy];
  const x0 = (await state(page)).ship.x;
  // Hover-only sweeps over the board.
  for (let i = 0; i <= 20; i++) await page.mouse.move(...at(0.1 + 0.04 * i, 0.4 + 0.01 * i));
  await wait(300);
  const hover = (await state(page)).ship.x;
  // Keyboard while the mouse rests over the board.
  await page.keyboard.down('ArrowRight');
  await wait(300);
  await page.keyboard.up('ArrowRight');
  const keyX = (await state(page)).ship.x;
  // Held-button steering, then a release the page never hears (outside the
  // window): a later button-less move must not keep steering.
  const cdp = await page.context().newCDPSession(page);
  const [ax, ay] = at(0.15, 0.75);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: ax, y: ay, button: 'left', buttons: 1, clickCount: 1 });
  await wait(400);
  const steered = (await state(page)).ship;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ax + 5, y: ay, button: 'none', buttons: 0 });
  const [bx, by] = at(0.85, 0.75);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bx, y: by, button: 'none', buttons: 0 });
  await wait(400);
  const afterLost = (await state(page)).ship;
  // Same for the right button (SOAP): a lost release must not hold the SOAP edge.
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bx, y: by, button: 'right', buttons: 2, clickCount: 1 });
  await wait(100);
  const bombs1 = (await state(page)).bombsUsed;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bx - 3, y: by, button: 'none', buttons: 0 });
  await wait(1000);
  await page.keyboard.press('Space');
  await wait(150);
  const bombs2 = (await state(page)).bombsUsed;
  out.mouse = { hoverMoved: hover - x0, keyMoved: keyX - hover, steeredFrom: keyX, steeredTo: steered.x, afterLostRelease: afterLost.x, soapRight: bombs1, soapSpaceAfterLostRight: bombs2 };
  await page.close();
}

// ---- Touch: relative drag, no dead zone past an edge -----------------------------
{
  const page = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await quietStage(page, { x: 0, z: 8 });
  const info = await page.evaluate(() => __game.renderer());
  const rect = await page.evaluate(() => document.querySelector('#game').getBoundingClientRect().toJSON());
  const fr = info.fieldRect,
    pxu = (fr.right - fr.left) / 18.8;
  const cdp = await page.context().newCDPSession(page);
  const y = rect.top + fr.top + (fr.bottom - fr.top) * 0.7;
  let x = rect.left + (fr.left + fr.right) / 2;
  const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', x);
  // 14 u to the right (the box edge is 8.9 u away): 5 u of overshoot.
  for (let i = 1; i <= 14; i++) {
    x += pxu;
    await touch('touchMove', x);
    await wait(16);
  }
  await wait(300);
  const atEdge = (await state(page)).ship.x;
  // Back 2 u: the syringe must come back 2 u at once (no 5 u dead zone).
  for (let i = 1; i <= 4; i++) {
    x -= pxu / 2;
    await touch('touchMove', x);
    await wait(16);
  }
  await wait(300);
  const back = (await state(page)).ship.x;
  await touch('touchEnd', x);
  out.touch = { atEdge, afterBack2u: back, cameBack: atEdge - back };
  await page.close();
}
  delete out.a1raw;
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
}
await browser.close();
