/** Fairness limits for every pattern preset (RESEARCH_BULLET_HELL.md 5.2):
 * telegraph minimums, parameter ranges, clear gaps, wall gaps, density, the
 * overlap gate and edge/spawn rules. Measured on real emitters and on a real
 * controller campaign, not on the data alone. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, update, RULES } from '../model.mjs';
import { LIMITS, PRESETS, startPattern, gateAllows, liveFamilies, upgradeParams } from '../patterns.mjs';
import { FAMILIES } from '../bullets.mjs';
import { ARCHETYPES, attackFor } from '../levels.mjs';
import { BOSSES } from '../bosses.mjs';
import { quiet, campaign } from './helpers.mjs';

/** Every authored pattern use: archetypes per world (and mutated), flights,
 * and every boss card. */
function uses() {
  const out = [];
  for (const kind of Object.keys(ARCHETYPES))
    for (let w = 1; w <= 4; w++) {
      const a = attackFor(kind, w);
      if (!a) continue;
      out.push({ where: `${kind} W${w}`, world: w, ...a });
      if (w === 4) out.push({ where: `${kind} W4 mutated`, world: w, preset: a.preset, params: upgradeParams(a.preset, { ...PRESETS[a.preset].defaults, ...a.params }, 1) });
    }
  for (const level of LEVELS)
    for (const st of level.script || []) if (st.flight?.fire) out.push({ where: `${level.code} flight`, world: level.world, ...st.flight.fire });
  for (const [type, def] of Object.entries(BOSSES))
    def.cards.forEach((c) => c.patterns.forEach((p) => out.push({ where: `${type} ${c.name}`, world: 4, preset: p.preset, params: p.params, boss: true })));
  return out;
}
const RANGE_KEYS = ['n', 'spread', 'interval', 'rotate', 'reps', 'repGap', 'rate', 'cone', 'width', 'gaps', 'gapWidth', 'amp', 'wavelength', 'maxGen', 'splitEvery', 'duration', 'half'];

test('every authored pattern parameter sits inside its preset LIMITS', () => {
  const all = uses();
  assert.ok(all.length > 60, `${all.length} uses`);
  for (const u of all) {
    const L = LIMITS[u.preset];
    assert.ok(L, `${u.where}: unknown preset ${u.preset}`);
    const p = { ...PRESETS[u.preset].defaults, ...u.params };
    for (const key of RANGE_KEYS) {
      if (!L[key] || p[key] === undefined) continue;
      const v = key === 'splitAngle' ? p[key] : p[key];
      assert.ok(v >= L[key][0] - 1e-9 && v <= L[key][1] + 1e-9, `${u.where}: ${key} ${v} outside ${L[key]}`);
    }
    const speeds = [].concat(p.speeds ?? p.speed);
    const family = FAMILIES[p.family || PRESETS[u.preset].family];
    for (const v of speeds) {
      if (L.speed) assert.ok(v >= L.speed[0] && v <= L.speed[1], `${u.where}: speed ${v} outside ${L.speed}`);
      if (family) assert.ok(v >= family.speed[0] && v <= family.speed[1], `${u.where}: ${p.family || PRESETS[u.preset].family} speed ${v} outside ${family.speed}`);
    }
    if (L.odd) assert.equal(p.n % 2, 1, `${u.where}: a SNEEZE is an odd fan (it traps; sidestep out)`);
    if (L.even) assert.equal(p.n % 2, 0, `${u.where}: a SNIFFLE is an even fan (the player sits in the gap)`);
    if (u.preset === 'bloom') assert.notEqual(360 % p.rotate, 0, `${u.where}: spiral rotation ${p.rotate} divides 360`);
  }
});

test('every preset has a telegraph minimum (0.5 s aimed, 0.8 s fans, 1.0 s walls, 1.5 s beams); Easy adds 0.15 s', () => {
  const minimum = { cough: 0.5, drip: 0.5, sneeze: 0.8, sniffle: 0.8, ring: 0.8, bloom: 0.8, aerosol: 0.8, strand: 0.8, replicate: 0.8, wall: 1, jet: 1.5, quarantine: 1 };
  assert.deepEqual(Object.keys(minimum).sort(), Object.keys(PRESETS).sort());
  for (const [preset, tele] of Object.entries(minimum)) {
    assert.equal(LIMITS[preset].tele, tele, preset);
    const s = quiet();
    const em = startPattern(s, preset, { x: 0, z: -8, force: true });
    assert.ok(em.tele >= tele, `${preset} ${em.tele}`);
    const e = quiet(1, { difficulty: 'easy' });
    assert.ok(startPattern(e, preset, { x: 0, z: -8, force: true }).tele >= tele + 0.15 - 1e-9, `${preset} easy`);
    // Nothing is fired before the telegraph ends.
    update(s, tele - 0.02);
    assert.equal(s.enemyShots.length + s.beams.length, 0, `${preset} fired early`);
  }
});

/** Run one use in isolation and return its bullets grouped by emission. */
function emissions(u, difficulty = 'normal') {
  const s = quiet(1, { difficulty });
  s.ship.x = 0;
  s.ship.z = 11.5;
  s.ship.invulnerable = 1e9;
  const em = startPattern(s, u.preset, { x: 0, z: -8, params: u.params, force: true });
  const seen = new Set(),
    groups = [];
  for (let i = 0; i < 120 * 12 && em.state !== 'done'; i++) {
    update(s, 1 / 120);
    const fresh = s.enemyShots.filter((b) => !seen.has(b.id) && !b.gen);
    for (const b of fresh) seen.add(b.id);
    if (fresh.length) groups.push(fresh.map((b) => ({ ...b })));
  }
  return { s, groups };
}
function minClearGap(bullets, wrap) {
  const bySpeed = new Map();
  for (const b of bullets) {
    const key = Math.round(Math.hypot(b.vx, b.vz) * 10);
    (bySpeed.get(key) || bySpeed.set(key, []).get(key)).push(b);
  }
  let worst = Infinity;
  for (const list of bySpeed.values()) {
    if (list.length < 2) continue;
    const a = list.map((b) => Math.atan2(b.vx, b.vz)).sort((x, y) => x - y);
    const gaps = a.slice(1).map((v, i) => v - a[i]);
    if (wrap) gaps.push(a[0] + Math.PI * 2 - a.at(-1));
    const d = Math.min(...gaps);
    worst = Math.min(worst, 2 * 10 * Math.sin(d / 2) - 2 * list[0].hit);
  }
  return worst;
}

test('fans and rings keep >= 0.5 u clear between neighbours 10 u from the source', () => {
  let checked = 0;
  for (const u of uses()) {
    if (!LIMITS[u.preset].minGap) continue;
    const { groups } = emissions(u);
    for (const g of groups) {
      if (g.length < 2) continue;
      const gap = minClearGap(g, u.preset === 'ring' || u.preset === 'bloom');
      assert.ok(gap >= LIMITS[u.preset].minGap, `${u.where} ${u.preset}: clear gap ${gap.toFixed(2)} u`);
      checked++;
    }
  }
  assert.ok(checked > 40, `${checked} emissions checked`);
});

test('MUCUS WALL keeps a gap >= 2.0 u (2.8 u on Easy) and is solid elsewhere', () => {
  for (const [difficulty, need] of [['normal', 2], ['easy', 2.8]])
    for (let seed = 0; seed < 6; seed++) {
      const s = quiet(13, { difficulty, seed: 100 + seed });
      s.ship.z = 11.8;
      const em = startPattern(s, 'wall', { x: 0, z: -11, params: { gaps: seed % 2 ? 2 : 1, gapWidth: 2.4, speed: 3.2 }, force: true });
      update(s, em.tele + 0.02);
      const xs = s.enemyShots.map((b) => b.x).sort((a, b) => a - b);
      const hit = s.enemyShots[0].hit;
      const clear = xs.slice(1).map((x, i) => x - xs[i] - 2 * hit);
      const big = clear.filter((c) => c > 2 * RULES.shipRadius);
      assert.equal(big.length, em.gapList.length, `${difficulty}: only the marked gaps are passable`);
      for (const c of big) assert.ok(c >= need - 1e-9, `${difficulty}: gap ${c.toFixed(2)} < ${need}`);
      for (const g of em.gapList) assert.ok(Math.abs(g.x) <= 7.5, 'gaps stay reachable, away from the rails');
    }
});

test('AEROSOL emitters stay at or under 8 bullets per second', () => {
  for (const u of uses().filter((u) => u.preset === 'aerosol')) {
    const { groups } = emissions(u);
    const n = groups.flat().length;
    const p = { ...PRESETS.aerosol.defaults, ...u.params };
    assert.ok(n / p.duration <= 8 + 0.5, `${u.where}: ${(n / p.duration).toFixed(1)} /s`);
  }
});

test('the overlap gate: 2 live families on Normal, 1 on Easy, never two aimed families', () => {
  const s = quiet();
  assert.ok(startPattern(s, 'cough', { x: 0, z: -8 }));
  assert.equal(gateAllows(s, 'drip'), false, 'two aimed families never overlap');
  assert.ok(gateAllows(s, 'cough'), 'the same family may join (a choir)');
  assert.ok(startPattern(s, 'ring', { x: 0, z: -8 }));
  assert.equal(gateAllows(s, 'sneeze'), false, 'a third family waits');
  const e = quiet(1, { difficulty: 'easy' });
  startPattern(e, 'ring', { x: 0, z: -8 });
  assert.equal(gateAllows(e, 'sneeze'), false, 'Easy: one family at a time');
});

// One instrumented controller campaign measures the live rules.
const stats = { families: 0, aimedPair: 0, edge: [], close: [], stagePeak: {}, bossPeak: {}, tele: [], cardLead: [] };
const AIMED = new Set(['cough', 'drip']);
let lastCard = null;
const seenBullets = new Set(),
  seenEmitters = new Set();
campaign(1, {
  observe(s) {
    const fam = liveFamilies(s);
    stats.families = Math.max(stats.families, fam.size);
    if ([...fam].filter((f) => AIMED.has(f)).length > 1) stats.aimedPair++;
    const level = LEVELS[s.wave - 1];
    for (const b of s.enemyShots) {
      if (seenBullets.has(b.id)) continue;
      seenBullets.add(b.id);
      if (b.gen) continue;
      if (Math.abs(b.x) > RULES.halfWidth - 0.1 || b.z > 10.5) stats.edge.push([level.code, b.x, b.z]);
    }
    const stageCount = s.enemyShots.filter((b) => !b.boss).length;
    const bossCount = s.enemyShots.length - stageCount;
    stats.stagePeak[level.code] = Math.max(stats.stagePeak[level.code] || 0, stageCount);
    if (s.boss && !s.boss.mid) stats.bossPeak[level.world] = Math.max(stats.bossPeak[level.world] || 0, bossCount);
    for (const em of s.emitters)
      if (!seenEmitters.has(em.id)) {
        seenEmitters.add(em.id);
        if (em.tele < LIMITS[em.preset].tele) stats.tele.push([level.code, em.preset, em.tele]);
        if (em.boss && lastCard && em.preset !== 'quarantine') stats.cardLead.push(s.elapsed - lastCard);
      }
    for (const ev of s.events) if (ev.type === 'card-start') lastCard = s.elapsed;
  },
});

test('live campaign: never more than 2 pattern families, never two aimed families together', () => {
  assert.ok(stats.families <= 2, `${stats.families} families`);
  assert.equal(stats.aimedPair, 0);
});
test('live campaign: no emitter shortens its telegraph; a card start holds >= 1.5 s', () => {
  assert.deepEqual(stats.tele, []);
  const leads = stats.cardLead.filter((x) => x < 3);
  assert.ok(leads.length > 10);
  assert.ok(Math.min(...leads) >= RULES.cardIntro - 1e-6, `first card pattern after ${Math.min(...leads)} s`);
});
test('live campaign: bullets never appear at the bottom or side edges', () => {
  assert.deepEqual(stats.edge, []);
});
test('live campaign: peak bullets stay under the per-world caps (stage 45/70/95/120, boss 90/120/150/200)', () => {
  for (const level of LEVELS.filter((l) => l.kind === 'sample'))
    assert.ok(stats.stagePeak[level.code] <= level.maxBullets, `${level.code} ${stats.stagePeak[level.code]} > ${level.maxBullets}`);
  const bossCap = { 1: 90, 2: 120, 3: 150, 4: 200 };
  for (const [w, cap] of Object.entries(bossCap)) assert.ok(stats.bossPeak[w] <= cap, `W${w} boss peak ${stats.bossPeak[w]}`);
});
