/** Villain personality (personality.mjs) without touching precision, in a
 * 3D style: every collider is exactly what it was before the personality
 * pass, no animation draws a body wider than its collider or moves it off
 * its centre, no villain has a drawn face (user: "regular viruses don't need
 * faces ... more 3D, not cartoon"), boss pits sit well inside the body, and
 * the simulation never reads any of it. The browser side (real matrices,
 * pits, frame time) is checked by tests/browser/personality-audit.mjs and
 * the root QA. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULES, ARCHETYPES, BOSSES } from '../model.mjs';
import { COLLIDERS, NEEDLE, BODY_RADIUS, MARKER, GRAZE_RING, enemyScale, bodyRadiusOf } from '../hitboxes.mjs';
import { SHAPES, shapeFor } from '../shapes.mjs';
import { CHARACTERS, characterOf, bodyMotion, bossMenace, footprint, BOSS_SCRIPT, bossLine, bossCard, marchTempo, syllablesOf, talkTime } from '../personality.mjs';
import { cardArena } from './helpers.mjs';

// The collider contract, recorded before the personality pass (revision five,
// commit 061c348). Changing any of these numbers is a gameplay change.
const SNAPSHOT = {
  RULES: { shipRadius: 0.2, grazeRadius: 1, bombRadius: 15, maskRadius: 1.25, bulletY: 0.55 },
  COLLIDERS: { droplet: { r: 0.15, half: 0.12 }, aerosol: { r: 0.15, half: 0 }, spike: { r: 0.13, half: 0.16 }, rna: { r: 0.15, half: 0 }, virion: { r: 0.2, half: 0 }, glob: { r: 0.42, half: 0 } },
  NEEDLE: { r: 0.06, length: 0.9 },
  BODY_RADIUS: 0.4,
  MARKER: { r: 0.2, y: 0.55, texEdge: 60, texHalf: 64 },
  GRAZE_RING: { outer: 1, inner: 0.96, y: 0.55 },
  ARCH: { mini: [0.42, 0], wild: [0.6, 0], sneezer: [0.8, 0], budder: [0.62, 0.28], worm: [0.38, 0.9], puff: [0.9, 0], droplet: [0.55, 0], hijacker: [0.55, 0], cell: [0.8, 0], heavy: [0.85, 0], bloom: [0.85, 0], vesicle: [0.75, 0], virion: [0.5, 0] },
  BOSS: { alpha: 2, betagamma: 1.45, delta: 2, omicron: 2.2, bigsneezer: 1.7, aerosolcloud: 1.8, mother: 2, lambda: 1.6 },
};
const close = (a, b) => Math.abs(a - b) < 1e-12;

test('collider sizes are exactly as before the personality pass', () => {
  for (const [k, v] of Object.entries(SNAPSHOT.RULES)) assert.equal(RULES[k], v, `RULES.${k}`);
  assert.deepEqual(JSON.parse(JSON.stringify(COLLIDERS)), SNAPSHOT.COLLIDERS);
  assert.deepEqual({ ...NEEDLE }, SNAPSHOT.NEEDLE);
  assert.equal(BODY_RADIUS, SNAPSHOT.BODY_RADIUS);
  assert.deepEqual({ ...MARKER }, SNAPSHOT.MARKER);
  assert.deepEqual({ ...GRAZE_RING }, SNAPSHOT.GRAZE_RING);
  assert.deepEqual(Object.fromEntries(Object.entries(ARCHETYPES).map(([k, a]) => [k, [a.radius, a.half || 0]])), SNAPSHOT.ARCH);
  assert.deepEqual(Object.fromEntries(Object.entries(BOSSES).map(([k, b]) => [k, b.radius])), SNAPSHOT.BOSS);
  // Live boss parts in their arenas carry the same radii.
  for (const type of Object.keys(BOSSES)) {
    const s = cardArena(type, 0);
    for (const p of s.enemies.filter((e) => e.kind === 'boss')) assert.equal(p.radius, SNAPSHOT.BOSS[type], `${type} ${p.part}`);
  }
  // Drawn bodies still match: the body sphere at the collider radius.
  for (const kind of Object.keys(ARCHETYPES)) {
    const spec = shapeFor({ kind });
    assert.ok(close(bodyRadiusOf(spec) * enemyScale({ radius: ARCHETYPES[kind].radius }, spec), ARCHETYPES[kind].radius), kind);
  }
});

/** Every context a body can be in, sampled over time. */
function* scenarios() {
  const base = [{}, { hurt: 1 }, { hurt: 0.5 }, { gloat: 1 }, { shock: 1 }, { hp: 0.1 }, { hp: 0.1, hurt: 1 }, { recoil: 1 }, { land: 0.5 }, { beat: 0, beatOdd: true }, { beat: 0.5 }, { intro: 0.3 }, { talk: 1 }];
  for (const preset of ['cough', 'sneeze', 'ring', 'bloom', 'strand', 'aerosol', 'jet', 'wall'])
    for (const k of [0, 0.3, 0.6, 0.85, 1]) base.push({ tele: { preset, k } }, { tele: { preset, k }, hurt: 1 });
  for (const c of base) for (let t = 0; t < 12; t += 0.053) yield { ...c, t, id: 'e7' };
}
const aspectOf = (id) => {
  const spec = { beta: SHAPES.twinB, gamma: SHAPES.twinG, half: SHAPES.half }[id] || SHAPES[id] || SHAPES.wild;
  return spec.parts.find((p) => p.type === 'sphere' && !p.role)?.scale?.[1] ?? 1;
};

test('idle life and reactions never draw a body wider than its collider, and never move it', () => {
  const report = {};
  for (const id of Object.keys(CHARACTERS)) {
    const a = aspectOf(id);
    let max = 0,
      min = Infinity;
    for (const c of scenarios()) {
      const m = bodyMotion(id, c, a);
      assert.deepEqual(Object.keys(m).sort(), ['crown', 'pitch', 'roll', 'sx', 'sy', 'sz', 'yaw'], 'scale and rotation only: no offset');
      const f = footprint(m.sx, m.sy * a, m.sz, m.pitch, m.roll);
      max = Math.max(max, f);
      min = Math.min(min, Math.min(m.sx, m.sz));
    }
    assert.ok(max <= 1 + 1e-9, `${id}: drawn footprint ${max} of its collider`);
    assert.ok(min >= 0.88, `${id}: never shrinks below 88% (${min.toFixed(3)})`);
    report[id] = min;
  }
  // The rest pose is exactly the collider.
  for (const id of Object.keys(CHARACTERS)) {
    const m = bodyMotion(id, { t: 0, id: 'x' }, aspectOf(id));
    assert.ok(footprint(m.sx, m.sy * aspectOf(id), m.sz, m.pitch, m.roll) > 0.97, id);
  }
  // footprint() itself: a tilted tall egg grows on the board, a sphere never.
  assert.ok(footprint(1, 1.38, 1, 0.3, 0) > 1.03 && Math.abs(footprint(1, 1, 1, 0.3, 0.2) - 1) < 1e-12);
});

test('no villain has a drawn face; boss pits are sculpted sockets well inside the body footprint', () => {
  const render = readFileSync(new URL('../render.mjs', import.meta.url), 'utf8');
  assert.ok(!/faces\.mjs|faceState|drawFace/.test(render), 'no face decals in the renderer');
  for (const [name, spec] of Object.entries(SHAPES)) assert.ok(!spec.parts.some((p) => p.type === 'eyes'), `${name}: no eye meshes`);
  // Regular viruses carry no pits; every boss body and part does.
  for (const kind of Object.keys(ARCHETYPES)) assert.ok(!shapeFor({ kind }).parts.some((p) => p.type === 'pits'), kind);
  for (const key of ['alpha', 'twinB', 'twinG', 'delta', 'half', 'omicron', 'node', 'bigsneezer', 'aerosolcloud', 'mother', 'lambda']) {
    const spec = SHAPES[key];
    const pits = spec.parts.find((p) => p.type === 'pits');
    assert.ok(pits && pits.points.length >= 1, `${key} has pits`);
    const body = bodyRadiusOf(spec);
    for (const [x, y, z, size] of pits.points) {
      // Socket centre: the surface point along (x, y, z), sunk 0.25 socket
      // radii; its board-plane reach plus its long semi-axis (1.35 socket
      // radii) stays under 90% of the body.
      const n = Math.hypot(x, y, z),
        sr = size * pits.r;
      const horiz = (Math.hypot(x, z) / n) * (pits.r - 0.25 * sr) + Math.hypot(...(pits.at || [0, 0, 0]).filter((_, i) => i !== 1));
      assert.ok(horiz + 1.35 * sr <= 0.9 * body, `${key}: pit reaches ${((horiz + 1.35 * sr) / body).toFixed(2)} of the body`);
      assert.ok(size > 0 && size <= 0.2, `${key}: pit size ${size}`);
    }
  }
  // The pits' light carries the boss's mood.
  const rest = bossMenace('alpha', { t: 1, id: 'a' }),
    tele = bossMenace('alpha', { t: 1, id: 'a', tele: { preset: 'ring', k: 1 } }),
    hurt = bossMenace('alpha', { t: 1, id: 'a', hurt: 1 }),
    dead = bossMenace('alpha', { t: 1, id: 'a', dying: 1 }),
    intro = bossMenace('alpha', { t: 1, id: 'a', intro: 0.1 });
  assert.ok(tele.glow > rest.glow * 1.5 && tele.size > 1.2, 'pits flare before an attack');
  assert.ok(hurt.glow < rest.glow && intro.glow < 0.05 && dead.glow < 0.01, 'flicker on hits, dark on entry and defeat');
  for (const id of Object.keys(CHARACTERS).filter((k) => CHARACTERS[k].menace)) {
    for (let t = 0; t < 8; t += 0.11) {
      const m = bossMenace(id, { t, id: 'z', hp: 0.1, gloat: 0.5, talk: 1 });
      assert.ok(m.glow >= 0 && m.glow <= 2.2 && m.size >= 0.3 && m.size <= 1.35, id);
    }
  }
});
test('every villain has a distinct personality: role, line, motion; bosses add a voice and menace', () => {
  for (const kind of Object.keys(ARCHETYPES)) assert.ok(CHARACTERS[characterOf({ kind })], kind);
  for (const type of Object.keys(BOSSES)) {
    const s = cardArena(type, 0);
    for (const p of s.enemies.filter((e) => e.kind === 'boss')) assert.ok(CHARACTERS[characterOf(p, type)], `${type} ${p.part}`);
  }
  assert.equal(characterOf({ kind: 'boss', part: 'twin', tag: 'B' }, 'betagamma'), 'beta');
  assert.equal(characterOf({ kind: 'boss', part: 'twin', tag: 'G' }, 'betagamma'), 'gamma');
  assert.equal(characterOf({ kind: 'boss', part: 'node' }, 'omicron'), 'node');
  const sigs = new Set();
  for (const [id, ch] of Object.entries(CHARACTERS)) {
    assert.ok(ch.role && ch.line && ch.line.length <= 60, `${id}: role and a one-line personality`);
    assert.ok(!('face' in ch) && !('rest' in ch), `${id}: no face data`);
    const sig = JSON.stringify([ch.motion, ch.voice, ch.menace]);
    assert.ok(!sigs.has(sig), `${id} moves (and sounds) like another character`);
    sigs.add(sig);
    const boss = !!ch.menace;
    assert.equal(!!ch.voice, boss, `${id}: only bosses have voices`);
  }
  // The brute breathes slowly and deeply, the coward twitches fast, the sneak never tilts.
  assert.ok(CHARACTERS.heavy.motion.breathe < 1 && CHARACTERS.heavy.motion.amp >= 0.07);
  assert.ok(CHARACTERS.virion.motion.twitch >= 5 && CHARACTERS.worm.tilt === false);
});
test('reactions are 3D motion: anticipation, flinch, shiver, landing, death swell', () => {
  const rest = bodyMotion('wild', { t: 0.4, id: 'a' });
  const hurt = bodyMotion('wild', { t: 0.4, id: 'a', hurt: 1 });
  assert.ok(hurt.sy > rest.sy && hurt.sx < rest.sx, 'a hit flinches upward');
  const low = [0, 0.1, 0.2, 0.3].map((t) => bodyMotion('wild', { t, id: 'a', hp: 0.05 }).yaw);
  assert.ok(Math.max(...low) - Math.min(...low) > 0.05, 'nearly beaten: a shiver');
  const land = bodyMotion('alpha', { t: 0, id: 'b', land: 0.5 });
  assert.ok(land.sy < 0.9, 'a boss squashes as it lands');
  const dying = bodyMotion('alpha', { t: 0, id: 'b', dying: 1 });
  assert.ok(dying.sy > 1.2, 'a dying boss swells before it bursts (no collider remains)');
  // The sneeze no longer swells the body past its collider: it stretches up
  // and bristles the (decorative) crown instead.
  const m = bodyMotion('sneezer', { t: 0, id: 's', tele: { preset: 'sneeze', k: 1 } }, 0.85);
  assert.ok(m.sy > 1.2 && m.crown > 1.25 && m.sx <= 1);
});
test('boss scripts: a name card, one taunt per card, gloats and a defeat line, short and deterministic', () => {
  for (const [type, def] of Object.entries(BOSSES)) {
    const sc = BOSS_SCRIPT[type];
    assert.ok(sc, `${type} has a script`);
    assert.ok(sc.cards.length >= def.cards.length, `${type}: a taunt for each of ${def.cards.length} cards`);
    for (const line of [...sc.cards, ...sc.gloat, sc.defeat]) assert.ok(line.replace(/^[BG]:/, '').length <= 26, `${type}: "${line}" fits the bubble`);
    const card = bossCard(type, def.mid);
    assert.ok(card.name && card.title && card.line.length <= 44, `${type} name card`);
    // Every card start says its line, the same one every time.
    const s = cardArena(type, 0);
    for (let i = 0; i < def.cards.length; i++) {
      const a = bossLine({ type: 'card-start', index: i }, s),
        b = bossLine({ type: 'card-start', index: i }, s);
      assert.deepEqual(a, b);
      assert.ok(a.text.length && talkTime(a.text) <= 1.2, `${type} card ${i}`);
    }
    assert.equal(bossLine({ type: 'defeat-not-an-event' }, s), null);
    assert.equal(bossLine({ type: 'boss-defeated', boss: type }, s).mood, 'defeat');
  }
  const twins = cardArena('betagamma', 0);
  assert.deepEqual(['B', 'G'].map((k, i) => bossLine({ type: 'card-start', index: i }, twins).speaker), ['B', 'G'], 'the twins take turns');
  assert.equal(syllablesOf('TOO SLOW.'), 4);
});

test('personality stays out of the simulation: pure functions, unchanged inputs, no model imports', () => {
  const deepFreeze = (o) => (Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v)), Object.freeze(o));
  const e = deepFreeze({ id: 'f1', kind: 'wild', x: 1, z: -5, hp: 1, maxHp: 3, alive: true });
  const c = deepFreeze({ t: 2, id: e.id, look: [0, 9], hurt: 1, tele: { preset: 'cough', k: 0.5 }, hp: 0.3, gloat: 0.5 });
  for (const id of Object.keys(CHARACTERS)) {
    assert.deepEqual(bodyMotion(id, c, 1), bodyMotion(id, c, 1), `${id} deterministic`);
    bossMenace(id, c);
  }
  characterOf(e);
  const s = cardArena('alpha', 0);
  const before = JSON.stringify(s);
  marchTempo(s);
  bossLine({ type: 'card-start', index: 0 }, s);
  assert.equal(JSON.stringify(s), before, 'reading the state never changes it');
  for (const file of ['model.mjs', 'core.mjs', 'enemies.mjs', 'bosses.mjs', 'patterns.mjs', 'bullets.mjs', 'hitboxes.mjs', 'scoring.mjs', 'levels.mjs', 'clock.mjs']) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(!/personality\.mjs|audio\.mjs/.test(src), `${file} does not import presentation`);
  }
  // The renderer keeps every body on its collider centre: position comes only
  // from the simulation, personality acts on the tilt node.
  const render = readFileSync(new URL('../render.mjs', import.meta.url), 'utf8');
  assert.ok(/m\.position\.set\(e\.x, BULLET_Y, e\.z\);/.test(render));
  assert.ok(/ud\.tilt\.scale\.set\(mo\.sx, mo\.sy, mo\.sz\)/.test(render) && /m\.scale\.setScalar\(ud\.scale\)/.test(render));
});
