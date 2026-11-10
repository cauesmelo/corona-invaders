/** The 3D draft's pure parts (draft3d.mjs): label text, lettering coverage,
 * tier materials, timings, label legibility by projection, and the scene's
 * draw-call / triangle budget counted from the real scene graph (no GPU).
 * The browser half (WebGL, input, pixels, frame time) is
 * tests/browser/draft-3d.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { ALL_CARDS, CARD } from '../cards.mjs';
import { FONT } from '../ui.mjs';
import { controlsHTML, cartridgeChip, LINE_GLYPH } from '../formulate.mjs';
import {
  CARTRIDGE,
  CARTRIDGE_LENGTH,
  TIER_LOOK,
  TIMING,
  LABEL_BANDS,
  LINE_SERUM,
  LINE_CONTENTS,
  DRAFT_PITCH,
  labelOf,
  labelLayout,
  captionOf,
  deriveStat,
  revealSchedule,
  revealEnd,
  contentLayout,
  fitCamera,
  createDraft3D,
  easeOutBack,
} from '../draft3d.mjs';

const lines = [...new Set(ALL_CARDS.map((c) => c.line))];

test('D7 labels: every card prints a name and one stat line; trade-offs add a short COST', () => {
  for (const c of ALL_CARDS) {
    const l = labelOf(c.id);
    assert.ok(l.name.length > 0 && l.name.length <= 20, `${c.id} name`);
    assert.ok(l.stat.length > 0 && l.stat.length <= 18, `${c.id} stat "${l.stat}"`);
    if (c.stat) assert.equal(l.stat, c.stat.toUpperCase(), `${c.id}: the card's own stat line is printed as authored`);
    if (c.tradeoff) assert.match(l.cost, /^COST /, `${c.id}: a trade-off carries a COST line`);
    else assert.equal(l.cost, '', `${c.id}: no COST without a trade-off`);
    assert.equal(l.tier, c.tier);
  }
});

test('D7 lettering: every character a label, caption or header can print has a dot-matrix glyph', () => {
  // The label face is ui.mjs FONT plus draft3d's extra symbols; an unknown
  // character would silently print as a blank.
  const known = (ch) => ch === ' ' || FONT[ch] || FONT[ch.toUpperCase()] || '+%×→←():,;≤≥±°\'=◆◇−–#*…'.includes(ch);
  const texts = [];
  for (const c of ALL_CARDS) {
    const l = labelOf(c.id);
    texts.push(l.name, l.stat, l.cost, ...captionOf(c.id, [], { power: 1, difficulty: 'normal', titer: 0, stage: 2 }).lines.map((x) => x.text));
  }
  texts.push('1-1 CLEARED · PICK ONE', 'TITER ◆◇◇', 'COMMON', 'RARE', 'EPIC', 'LEGENDARY');
  const missing = new Set();
  for (const t of texts) for (const ch of t) if (!known(ch)) missing.add(ch);
  assert.deepEqual([...missing], [], `glyphs missing: ${[...missing].join(' ')}`);
});

test('D7 captions: at most three rows of at most 44 characters; a trade-off or synergy gets its own row', () => {
  const ctx = { power: 2, difficulty: 'normal', titer: 1, stage: 4 };
  for (const c of ALL_CARDS) {
    const cap = captionOf(c.id, [], ctx);
    assert.ok(cap.lines.length >= 1 && cap.lines.length <= 3, `${c.id}: ${cap.lines.length} rows`);
    for (const l of cap.lines) assert.ok(l.text.length <= 44, `${c.id}: "${l.text}"`);
    if (c.cost) assert.ok(cap.lines.some((l) => l.tone === 'pink' || l.tone === 'cyan'), `${c.id}: the COST row`);
    assert.ok(cap.full.includes(c.name), 'the screen-reader text names the card');
  }
});

test('deriveStat (until a card carries its own stat): the number with its words, <= 18 characters', () => {
  assert.equal(deriveStat('Needles deal +10% damage.'), 'NEEDLES +10%');
  assert.equal(deriveStat('Fire rate +8% per copy (never above 10 volleys/s).'), 'FIRE RATE +8%');
  assert.equal(deriveStat('In focus a 0.5 u jet replaces the needles: hits all.'), 'FOCUS 0.5 U');
  assert.ok(deriveStat('While focused, needles deal +12% more damage.').startsWith('+12%'));
  for (const c of ALL_CARDS) assert.ok(deriveStat(c.text(c.fx, 1)).length <= 18);
});

test('D7 tier materials: clear, frosted, cobalt and a gold crown cap are distinct; tier is never colour alone', () => {
  const { common, rare, epic, legendary } = TIER_LOOK;
  assert.ok(common.glass.roughness <= 0.1 && common.glass.opacity <= 0.35 && !common.glass.frosted, 'clear borosilicate');
  assert.ok(rare.glass.frosted && rare.glass.roughness >= 0.45 && rare.glass.opacity >= 0.5, 'frosted');
  assert.equal(epic.glass.color, '#3a5bff', 'cobalt');
  assert.equal(legendary.cap.metalness, 1, 'gold cap metalness 1');
  assert.equal(legendary.cap.color, '#f2c14e');
  assert.ok(legendary.cap.crown && legendary.serum >= 1, 'crown seal and glowing serum');
  // Non-colour cues: grooves on the cap 1-4, and an ornament per tier.
  assert.deepEqual([common, rare, epic, legendary].map((t) => t.notches), [1, 2, 3, 4]);
  assert.deepEqual([common, rare, epic, legendary].map((t) => t.ornament), [null, 'ring', 'particles', 'swirl']);
  const sig = (t) => `${t.glass.color}|${t.glass.roughness}|${t.glass.opacity}|${t.cap.color}|${t.cap.metalness}|${t.cap.roughness}`;
  assert.equal(new Set([common, rare, epic, legendary].map(sig)).size, 4);
  // The serum serum emissive rises with the tier (the legendary glows).
  assert.ok(common.serum < rare.serum && epic.serum < legendary.serum);
});

test('every line has a serum colour, contents and a printed glyph; no line uses virus green or danger pink', () => {
  for (const line of lines) {
    assert.ok(LINE_SERUM[line], `${line} serum`);
    assert.ok(LINE_CONTENTS[line], `${line} contents`);
    assert.ok(LINE_GLYPH[line], `${line} glyph`);
  }
  const hues = new Set(lines.map((l) => LINE_SERUM[l]));
  for (const bad of ['#12ce5d', '#ff4fa3']) assert.ok(!hues.has(bad));
});

test('D8 timings: drop-in 150/270/390 ms, a legendary holds 500 ms and shifts the rest; inputs from 500 ms; play resumes <= 1.1 s', () => {
  assert.deepEqual(revealSchedule(['common', 'rare', 'epic']).map((s) => s.start), [150, 270, 390]);
  assert.deepEqual(revealSchedule(['common', 'rare', 'epic']).map((s) => s.land), [600, 720, 840]);
  const l = revealSchedule(['legendary', 'common', 'rare']);
  assert.deepEqual(l.map((s) => s.start), [150, 770, 890]);
  assert.equal(l[0].land, 150 + 500 + 450);
  assert.ok(revealEnd(['epic', 'rare', 'legendary']) <= 1600);
  assert.equal(TIMING.inputs, 500);
  assert.ok(TIMING.inject.resume <= 1100 && TIMING.inject.click === 360);
  assert.ok(TIMING.discard + TIMING.discardReturn <= 800);
  // easeOutBack overshoots by 6% (the brief's drop-in).
  let peak = 0;
  for (let t = 0; t <= 1; t += 0.001) peak = Math.max(peak, easeOutBack(t));
  assert.ok(Math.abs(peak - 1.06) < 0.005, `overshoot ${peak}`);
});

/** Projected cap height (px) of a label band for an unselected cartridge on
 * a pinhole camera fitted like the real one (orthographic in depth at the
 * content plane; the browser test measures the real projection). */
const capPx = (band, pxPerU) => {
  const R = CARTRIDGE.radius + CARTRIDGE.label.lift;
  return pxPerU * R * (Math.sin(band[1] - DRAFT_PITCH) - Math.sin(band[0] - DRAFT_PITCH));
};
test('D7 legibility by geometry: name cap >= 14 px at 960x640 and >= 11 px at 320x568 (the safe rects the shell measures)', () => {
  // Safe rects measured in Chrome (game.js syncDraftRect): between the side
  // panels at 960x640, the full width on phones, above the control bar.
  const cases = [
    { size: '960x640', safe: { w: 468, h: 519 }, preset: 'wide', name: 14 },
    { size: '390x844', safe: { w: 366, h: 640 }, preset: 'tall', name: 11 },
    { size: '320x568', safe: { w: 296, h: 400 }, preset: 'tall', name: 11 },
  ];
  for (const c of cases) {
    const content = contentLayout(c.preset, c.safe.w / c.safe.h);
    const { pxPerU } = fitCamera(c.safe, content);
    const name = capPx(LABEL_BANDS.name, pxPerU),
      stat = capPx(LABEL_BANDS.stat, pxPerU);
    assert.ok(name >= c.name, `${c.size}: name cap ${name.toFixed(1)} px`);
    assert.ok(stat >= c.name - 3, `${c.size}: stat cap ${stat.toFixed(1)} px`);
    // The whole cartridge fits the content width.
    assert.ok(CARTRIDGE_LENGTH * 1.12 <= content.width, `${c.size}: the selected cartridge fits`);
  }
});

test('D7 label layout: the longest name fits the label (condensed, never clipped); bands never overlap', () => {
  const longest = [...ALL_CARDS].sort((a, b) => b.name.length - a.name.length)[0];
  const lay = labelLayout(labelOf(longest.id));
  assert.ok(lay.name.x0 + lay.name.width <= lay.len + 1e-9, 'the name fits');
  assert.ok(lay.stat.x0 + lay.stat.width <= lay.len + 1e-9, 'the stat fits');
  const B = LABEL_BANDS;
  assert.ok(B.foot[1] < B.stat[0] && B.stat[1] < B.name[0] && B.name[1] < B.stripeTop[0]);
  assert.ok(B.stripeBottom[1] < B.foot[0]);
  assert.ok(B.stripeTop[1] <= CARTRIDGE.label.a1 && B.stripeBottom[0] >= CARTRIDGE.label.a0);
});

// ---- The scene graph, built without a GPU -------------------------------------------
function buildForCount() {
  const fakeCanvas = (w, h) => ({ width: w, height: h, getContext: () => null });
  const renderer = { getPixelRatio: () => 1, setPixelRatio() {}, getDrawingBufferSize: (v) => v.set(960, 640), info: { render: { calls: 0, triangles: 0 } }, render() {}, compile() {}, copyFramebufferToTexture() {}, getContext: () => null };
  const stage = { clientWidth: 960, clientHeight: 640 };
  const draft = createDraft3D(THREE, { renderer, stage, makeCanvas: fakeCanvas, settings: { effects: () => true } });
  draft.setSafeRect({ x: 230, y: 12, w: 468, h: 519 }, 'wide');
  return draft;
}
const pick = (tier, line) => ALL_CARDS.find((c) => c.tier === tier && c.line === line) || ALL_CARDS.find((c) => c.tier === tier);
function count(scene) {
  let calls = 0,
    triangles = 0;
  const per = new Map();
  scene.traverseVisible((o) => {
    if (!o.isMesh && !o.isPoints) return;
    const g = o.geometry;
    const n = g.index ? g.index.count : g.attributes.position.count;
    const inst = o.isInstancedMesh ? o.count : 1;
    calls += 1;
    triangles += o.isPoints ? 0 : (n / 3) * inst;
    let p = o.parent;
    while (p && !p.userData.slot && p.parent) p = p.parent;
    void p;
  });
  return { calls, triangles, per };
}
test('D8 budget (structural): <= 40 draw calls and <= 25,000 triangles in the worst offer; one point light, no shadows', () => {
  const draft = buildForCount();
  // Worst case: a legendary SOAP (six bubbles, the swirl), an epic with motes
  // and a rare with its ring.
  const ids = [pick('legendary', 'SOAP').id, pick('epic', 'GRAZE')?.id || pick('epic', 'EXPOSURE').id, pick('rare', 'DOSE').id];
  draft.open({ ids, tiers: ids.map((id) => CARD[id].tier), header: { left: 'X', right: 'Y' }, caption: [] });
  draft.frame(16, { boardDrawn: true });
  draft.frame(2000);
  const { calls, triangles } = count(draft.scene);
  assert.ok(calls <= 40, `${calls} draw calls`);
  assert.ok(triangles <= 25000, `${triangles} triangles`);
  let points = 0,
    shadows = 0;
  draft.scene.traverse((o) => {
    if (o.isPointLight) points++;
    if (o.castShadow) shadows++;
  });
  assert.equal(points, 1);
  assert.equal(shadows, 0);
  // No material uses transmission (a costly extra pass on SwiftShader).
  draft.scene.traverse((o) => o.material && assert.ok(!(o.material.transmission > 0)));
});

test('D8 budget per cartridge: <= 7 visible meshes and <= 3,000 triangles', () => {
  const draft = buildForCount();
  for (const tier of ['common', 'rare', 'epic', 'legendary'])
    for (const line of lines) {
      const c = ALL_CARDS.find((x) => x.tier === tier && x.line === line);
      if (!c) continue;
      draft.open({ ids: [c.id, c.id, c.id], tiers: [tier, tier, tier], header: { left: '', right: '' }, caption: [] });
      draft.frame(3000);
      const spin = draft.parts().slots[0].glass.parent;
      let meshes = 0,
        tris = 0;
      spin.traverseVisible((o) => {
        if (!o.isMesh && !o.isPoints) return;
        meshes++;
        const g = o.geometry;
        tris += o.isPoints ? 0 : ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
      });
      assert.ok(meshes <= 7, `${tier} ${line}: ${meshes} meshes`);
      assert.ok(tris <= 3000, `${tier} ${line}: ${tris} triangles`);
    }
});

test('the DOM side holds no card content: the control bar and the rack cartridges', () => {
  const html = controlsHTML({ tokens: 2, confirm: false, touch: false });
  for (const c of ALL_CARDS) assert.ok(!html.includes(c.name));
  assert.match(html, /data-act="resample"/);
  assert.match(html, /data-act="inject"/);
  assert.match(html, /data-act="discard"/);
  assert.match(controlsHTML({ tokens: 0 }), /data-act="resample" disabled/);
  assert.match(controlsHTML({ confirm: true }), /CONFIRM/);
  assert.doesNotMatch(controlsHTML({ touch: true }), /<kbd>/);
  // Rack chips speak the material language: one class per tier, the cap's
  // grooves count the tier, the legendary has the crown.
  const grooves = (t) => (cartridgeChip(t, 'NEEDLE').match(/<path d="M3\.2/g) || []).length;
  assert.deepEqual(['common', 'rare', 'epic', 'legendary'].map(grooves), [1, 2, 3, 4]);
  assert.match(cartridgeChip('rare', 'SOAP'), /class="frost"/);
  assert.match(cartridgeChip('epic', 'SOAP'), /class="cobalt"/);
  assert.match(cartridgeChip('legendary', 'SOAP'), /class="crown"/);
});
