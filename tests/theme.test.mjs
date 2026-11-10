/** Theme guard: the user felt the previous revision drifted into generic
 * aircraft. Everything on the board must be a virus, a cell or the vaccine
 * syringe (RESEARCH_BULLET_HELL.md 1 and 4). These tests read the mesh
 * registry the renderer builds from (shapes.mjs) and the authored names. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHAPES, SYRINGE, PALETTE, shapeFor } from '../shapes.mjs';
import { ARCHETYPES } from '../levels.mjs';
import { BOSSES } from '../bosses.mjs';
import { FAMILIES } from '../bullets.mjs';
import { causeText } from '../ui.mjs';

const ORGANIC = new Set(['sphere', 'crown', 'clubs', 'shell', 'tube', 'torus', 'petals', 'drop', 'virions', 'eyes']);
const PLANE_WORDS = /wing|fin\b|tail|fuselage|cockpit|engine|thruster|rotor|propeller|nose ?cone|jet\b/i;

test('no plane-like geometry: every mesh part is organic (no boxes, cones, wings, fins or tails)', () => {
  for (const [name, spec] of Object.entries(SHAPES))
    for (const p of spec.parts) {
      assert.ok(ORGANIC.has(p.type), `${name}: part type ${p.type}`);
      assert.ok(!PLANE_WORDS.test(p.role || ''), `${name}: part role ${p.role}`);
    }
  // Thin flat parts must stay narrower than the body: no wing-like planes.
  for (const [name, spec] of Object.entries(SHAPES)) {
    const body = spec.parts.find((p) => p.type === 'sphere')?.r ?? 1;
    for (const p of spec.parts.filter((p) => p.type === 'petals')) assert.ok(p.width <= body * 1.1, `${name}: petal ${p.width}`);
  }
});

test('the corona silhouette is everywhere: every virus carries a crown of spikes', () => {
  const crowned = (spec) => spec.parts.some((p) => p.type === 'crown' || p.type === 'clubs' || p.type === 'virions' || p.type === 'petals');
  for (const kind of Object.keys(ARCHETYPES)) {
    const spec = shapeFor({ kind });
    assert.ok(spec, `${kind} has a mesh`);
    if (kind === 'worm' || kind === 'vesicle') continue; // RNA itself, a lipid bubble
    assert.ok(crowned(spec), `${kind} shows spikes or virions`);
  }
  for (const [type, def] of Object.entries(BOSSES)) assert.ok(crowned(SHAPES[type] || SHAPES.alpha) || def.body === 'twins', `${type}`);
  assert.ok(crowned(SHAPES.twinB) && crowned(SHAPES.twinG) && crowned(SHAPES.half) && crowned(SHAPES.node));
  // The original sprite's eight in-plane spikes are the WILD TYPE's ring.
  assert.equal(SHAPES.wild.parts.find((p) => p.type === 'crown').ring, 8);
});

test('only bosses have faces: popcorn stays faceless, true to the sprite', () => {
  for (const kind of Object.keys(ARCHETYPES)) assert.ok(!shapeFor({ kind }).parts.some((p) => p.type === 'eyes'), kind);
  for (const type of ['alpha', 'twinB', 'twinG', 'delta', 'omicron']) assert.ok(SHAPES[type].parts.some((p) => p.type === 'eyes'), type);
});

test('the syringe has no crossbars: nothing extends sideways beyond the barrel + 0.2 u, and the needle points up-field', () => {
  const limit = SYRINGE.barrelRadius + 0.2;
  for (const p of SYRINGE.parts) {
    const half = p.type === 'collar' ? p.rx : p.r ?? 0;
    assert.ok(half <= limit + 1e-9, `${p.role}: ${half} u sideways`);
    assert.ok(!PLANE_WORDS.test(p.role), p.role);
  }
  const needle = SYRINGE.parts.find((p) => p.role === 'needle'),
    barrel = SYRINGE.parts.find((p) => p.role === 'barrel');
  assert.ok(needle.z < barrel.z - barrel.length / 2, 'needle ahead (toward -z, up-field)');
});

test('names: viruses and WHO Greek-letter variants only; the previous aircraft names are gone', () => {
  const OLD = /\b(DART|DIVER|COURIER|SPORE|ARMORED|CAPSID|ECHO|OMEGA|SECTOR|SHIP|PLANE|FIGHTER|DRONE)\b/;
  for (const a of Object.values(ARCHETYPES)) assert.ok(!OLD.test(a.label), a.label);
  for (const b of Object.values(BOSSES)) {
    assert.ok(!OLD.test(b.name), b.name);
    for (const c of b.cards) assert.ok(!OLD.test(c.name), c.name);
  }
  const source = readFileSync(new URL('../render.mjs', import.meta.url), 'utf8');
  assert.ok(!/\bg\.(dart|diver|flier|courier)\b|\bwings?\b|fuselage/i.test(source), 'renderer has no aircraft builders');
});

test('one meaning per hue: green viruses, pink danger, cyan vaccine, amber supplies', () => {
  assert.equal(PALETTE.virus, '#12ce5d', 'the original sprite green');
  assert.equal(PALETTE.danger, '#ff4fa3');
  assert.equal(PALETTE.vaccine, '#7fe8ff');
  assert.equal(PALETTE.amber, '#ffc65a');
  assert.deepEqual(Object.keys(FAMILIES).sort(), ['aerosol', 'droplet', 'glob', 'rna', 'spike', 'virion']);
  for (const [name, f] of Object.entries(FAMILIES)) assert.ok(f.hit > 0 && f.half >= 0, `${name} has a collider`);
});

test('the loss card always names a cause (never "Hit by undefined shot")', () => {
  assert.equal(causeText({ by: undefined, what: undefined }), 'Hit by VIRUS droplet');
  assert.equal(causeText({ by: 'undefined' }), 'Hit by VIRUS droplet');
  assert.equal(causeText(null), 'Hit by VIRUS droplet');
  assert.equal(causeText({ by: 'ALPHA', what: 'SPIKE PROTEIN', pattern: 'SPIKE BLOOM' }), 'Hit by ALPHA spike protein · SPIKE BLOOM');
  assert.equal(causeText({ by: 'SNEEZER', what: 'CONTACT' }), 'Touched a SNEEZER');
  for (const c of [{}, { by: 'X', what: 'DROPLET', pattern: null }, { by: 'BETA & GAMMA', what: 'RNA STRAND', pattern: 'DOUBLE HELIX' }]) assert.ok(!/undefined|null/.test(causeText(c)));
});
