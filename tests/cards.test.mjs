/** ADJUVANTS (RESEARCH_CARDS.md §8): card data, hitbox invariance, the legacy
 * regression, odds and pity, eligibility, determinism, kit math and caps,
 * one test per behaviour, the draft flow, expected potency, ceilings, save
 * and resume, medals and sequencing. Everything runs on the real model and
 * the real card module; fixtures only arrange a starting situation. The
 * slower whole-run bot suite (test 12) is `npm run test:balance`. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createState,
  newRun,
  update,
  restartGame,
  pickAdjuvant,
  resampleAdjuvants,
  discardAdjuvants,
  exportRun,
  resumeRun,
  refreshKit,
  stageDps,
  togglePause,
  entryPower,
  makeEnemy,
  useBomb,
  antibodyOffsets,
  LEVELS,
  STAGE_COUNT,
  RULES,
  getLevel,
  BOSSES,
} from '../model.mjs';
import * as C from '../cards.mjs';
import { COLLIDERS, NEEDLE, MARKER, GRAZE_RING, BODY_RADIUS, INJECT, JET, jetRect } from '../hitboxes.mjs';
import { createBoss, cardHp } from '../bosses.mjs';
import { campaign } from './helpers.mjs';
import { createDraftGate } from '../formulate.mjs';

const { CARD, ALL_CARDS, cardSet, kitOf, cardText, cardCost } = C;
const profile = () => LEVELS.map((l) => ({ stage: l.id, power: entryPower(l.id), boss: l.kind === 'boss' && l.id !== STAGE_COUNT }));
/** RESEARCH_V1's 12-stage run with the mRNA fallback order: the shipped
 * campaign's profile (asserted equal to profile() below). */
const PROFILE12 = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4].map((power, i) => ({ stage: i + 1, power, boss: [3, 6, 9].includes(i + 1) }));
/** The retired 18-stage campaign (bosses at 4, 9, 13, 18; midbosses at 3, 7,
 * 11, 16), kept as the fallback fixture of RESEARCH_CARDS §4.7. */
const PROFILE18 = [1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4].map((power, i) => ({ stage: i + 1, power, boss: [4, 9, 13].includes(i + 1) }));
const FIGHTS18 = [3, 4, 7, 9, 11, 13, 16, 18];
const pct = (x) => `${Math.round(Math.abs(x) * 100)}%`;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/** A run in progress at `stage` holding `deck`, on a quiet board (no script,
 * choir or clocks), so one behaviour can be observed alone. */
function armed(deck = [], { stage = 5, difficulty = 'normal', power = null, titer = 0, quietBoard = true, seed = 42 } = {}) {
  const s = createState({ seed, stage: 1, difficulty, drafts: true });
  s.unlockedStage = STAGE_COUNT;
  newRun(s, seed);
  s.run.deck = deck.map((id) => ({ id, at: 0 }));
  s.run.titer = titer;
  s.checkpoint = { ...s.checkpoint, stage, power: power ?? entryPower(stage), run: structuredClone(s.run) };
  restartGame(s);
  if (quietBoard) {
    Object.assign(s, { enemies: [], groups: [], enemyShots: [], emitters: [], boss: null, choirClock: 1e9, diveClock: 1e9, mutationClock: 1e9 });
    s.sector.step = 1e9;
    s.sector.hold = true;
  }
  s.ship.invulnerable = 0;
  return s;
}
const still = (x, z, extra = {}) => ({ id: 9000 + Math.floor(Math.random() * 1e6), x, z, vx: 0, vz: 0, family: 'aerosol', hit: 0.15, half: 0, vis: 0.15, src: 'TEST', age: 0, ...extra });
const virus = (s, x, z, hp = 50, kind = 'wild') => {
  const e = makeEnemy(s, kind, x, z, { mode: 'still' });
  Object.assign(e, { hp, maxHp: hp, mode: 'still', vx: 0, vz: 0 });
  s.enemies.push(e);
  return e;
};
const step = (s, seconds, input = {}, hz = 120) => {
  for (let t = 0; t < seconds - 1e-9; t += 1 / hz) update(s, 1 / hz, input);
};
/** Drive the draft phase: clear the current stage on a quiet board. */
function toDraft(s) {
  s.sector.hold = false;
  for (let i = 0; i < 600 && s.phase !== 'draft'; i++) update(s, 1 / 60, {});
  return s;
}

// ---- 1. Card data -----------------------------------------------------------------
test('1 card data: 30 cards split 10/9/6/5, card 27 by the INJECT flag, text from data', () => {
  for (const inject of [false, true]) {
    const set = cardSet(inject);
    assert.equal(set.length, 30);
    const count = (t) => set.filter((c) => c.tier === t).length;
    assert.deepEqual([count('common'), count('rare'), count('epic'), count('legendary')], [10, 9, 6, 5]);
    assert.equal(new Set(set.map((c) => c.id)).size, 30, 'unique ids');
    assert.deepEqual([...new Set(set.map((c) => c.n))].sort((a, b) => a - b), Array.from({ length: 30 }, (_, i) => i + 1));
    assert.ok(set.some((c) => c.id === (inject ? 'retractable-needle' : 'antigen-harvest')));
    const lines = Object.fromEntries(C.LINES.map((l) => [l, set.filter((c) => c.line === l).length]));
    assert.deepEqual(lines, inject ? { NEEDLE: 9, ANTIBODY: 5, DOSE: 6, SOAP: 6, GRAZE: 4 } : { NEEDLE: 8, ANTIBODY: 5, DOSE: 6, SOAP: 6, GRAZE: 5 });
    const legs = set.filter((c) => c.tier === 'legendary');
    assert.deepEqual(legs.map((c) => c.line).sort(), [...C.LINES].sort(), 'one legendary per line');
  }
  for (const c of ALL_CARDS) {
    assert.ok(c.name && c.tier && c.line && c.tags.length && c.max >= 1 && c.fx, c.id);
    for (let n = 1; n <= c.max; n++) {
      const t = cardText(c.id, n);
      assert.ok(t.length > 0 && t.length <= 90, `${c.id} text ${t.length} chars`);
    }
    if (c.tradeoff) assert.match(cardCost(c.id), /^COST: /, `${c.id} has a COST line`);
    assert.ok(cardCost(c.id).length <= 90);
  }
  // The text's numbers are the data's numbers.
  const f = (id) => CARD[id].fx;
  const expect = {
    concentrate: [pct(f('concentrate').needle)],
    'rapid-release': [pct(f('rapid-release').rate), String(C.CAPS.fireRate)],
    'steady-hand': [pct(f('steady-hand').focus)],
    'twin-barrel': [`+${f('twin-barrel').focusNeedles}`, `+${f('twin-barrel').sprayNeedles}`],
    'hollow-bore': [pct(f('hollow-bore').pierce)],
    'wide-bore': [pct(f('wide-bore').needle)],
    'split-tip': [`±${f('split-tip').splitAngle}°`],
    'jet-injector': [String(f('jet-injector').jetWidth), `${f('jet-injector').jet}×`],
    'igg-boost': [pct(f('igg-boost').ab)],
    'clonal-expansion': [pct(f('clonal-expansion').abAt4)],
    'affinity-maturation': [pct(f('affinity-maturation').perSample), pct(f('affinity-maturation').cap)],
    'opsonin-tag': [`${f('opsonin-tag').tagTime} s`, pct(f('opsonin-tag').tag)],
    'herd-immunity': [`${f('herd-immunity').aim} u`, `±${f('herd-immunity').arc}°`, pct(f('herd-immunity').abRate)],
    'extra-dose': [`+${f('extra-dose').vials}`],
    'silicone-plunger': [pct(f('silicone-plunger').speed)],
    'enteric-coating': [`${f('enteric-coating').reform} s`],
    'backup-aliquot': [`${f('backup-aliquot').catchTime} s`],
    'glass-syringe': [pct(f('glass-syringe').needle)],
    'lnp-shell': [String(f('lnp-shell').charges), pct(1 - f('lnp-shell').reformMul), `${f('lnp-shell').pop} u`],
    lather: [`+${f('lather').soapNow}`],
    surfactant: [pct(f('surfactant').soap), '5%'],
    'reflex-arc': ['0.18', '0.26'],
    epipen: [`${f('epipen').cost}+`],
    foam: [`${f('foam').radius} u`, `${f('foam').time} s`],
    autoclave: [`${f('autoclave').every} s`, `${f('autoclave').refund}+`],
    'close-call': ['80', '100'],
    'retractable-needle': [pct(f('retractable-needle').reload), '0.35'],
    'antigen-harvest': [`×${f('antigen-harvest').score}`, String(f('antigen-harvest').progress)],
    'live-culture': [pct(f('live-culture').on)],
    fever: [`${f('fever').every}th`, `${f('fever').time} s`, pct(f('fever').needle)],
    'innate-response': [`${f('innate-response').mult}×`, `${f('innate-response').range} u`, `${f('innate-response').cap}/s`],
  };
  for (const [id, parts] of Object.entries(expect)) for (const p of parts) assert.ok(cardText(id, 1).includes(p), `${id}: "${cardText(id, 1)}" shows ${p}`);
  assert.ok(cardText('enteric-coating', 2).includes('20 s'));
  assert.ok(cardText('surfactant', 2).includes('7%'));
  assert.ok(cardText('close-call', 2).includes('60') && cardText('close-call', 2).includes('80'));
  assert.ok(cardText('lather', 2).includes('6'));
  assert.ok(cardCost('wide-bore').includes(pct(f('wide-bore').speed)));
  assert.ok(cardCost('glass-syringe').includes(String(Math.abs(f('glass-syringe').vials))));
  assert.ok(cardCost('live-culture').includes(pct(f('live-culture').off)));
  for (const c of ALL_CARDS.filter((c) => c.tier === 'legendary')) {
    const s = C.createRun(1);
    s.deck = [];
    assert.equal(C.eligible(s, c.id, { power: 4 }), false, `${c.id} needs two ${c.line} picks`);
  }
});

// ---- 2. Hitbox invariance -----------------------------------------------------------
const COLLIDER_SNAPSHOT = JSON.stringify({ COLLIDERS, NEEDLE, MARKER, GRAZE_RING, BODY_RADIUS, INJECT, shipRadius: RULES.shipRadius, grazeRadius: RULES.grazeRadius });
/** hitboxes.mjs as the campaign squad left it before any adjuvant (189dfc7). */
const PRE_ADJUVANT = JSON.stringify({ COLLIDERS: { droplet: { r: 0.15, half: 0.12 }, aerosol: { r: 0.15, half: 0 }, spike: { r: 0.13, half: 0.16 }, rna: { r: 0.15, half: 0 }, virion: { r: 0.2, half: 0 }, glob: { r: 0.42, half: 0 } }, NEEDLE: { r: 0.06, length: 0.9 }, MARKER: { r: 0.2, y: 0.55, texEdge: 60, texHalf: 64 }, GRAZE_RING: { outer: 1, inner: 0.96, y: 0.55 }, BODY_RADIUS: 0.28, INJECT: { reach: 0.95, r: 0.05, reload: 0.5, reloadElite: 0.8, eliteDamage: 10, hitstop: 0.06 }, shipRadius: 0.2, grazeRadius: 1 });
test('2 hitbox invariance: no deck changes a collider; the jet is drawn at its collider width', () => {
  assert.equal(COLLIDER_SNAPSHOT, PRE_ADJUVANT, 'the pre-adjuvant collider set');
  const banned = /radius|reach|hitbox|collider|length|width/i;
  const rng = { rng: 12345 };
  const set = cardSet(false).concat(cardSet(true).filter((c) => c.inject));
  const decks = set.map((c) => Array.from({ length: c.max }, () => ({ id: c.id, at: 0 })));
  for (let i = 0; i < 1000; i++) {
    const deck = [];
    for (let k = 0; k < 11; k++) {
      const c = set[Math.floor(C.draftRandom(rng) * set.length)];
      if (C.stacksOf(deck, c.id) < c.max) deck.push({ id: c.id, at: 0 });
    }
    decks.push(deck);
  }
  for (const deck of decks) {
    const kit = kitOf(deck, { power: 1 + (deck.length % 4), titer: deck.length % 4 });
    for (const key of Object.keys(kit)) assert.ok(!banned.test(key), `kit field ${key} is not geometry`);
  }
  // In play, with every card at max stacks at once (the model clamps), the core,
  // ring and needles keep their colliders.
  const all = set.flatMap((c) => Array.from({ length: c.max }, () => c.id));
  const s = armed(all, { power: 4, titer: 3 });
  virus(s, 0, 2, 999);
  step(s, 2, { focus: true });
  assert.equal(s.ship.radius, RULES.shipRadius);
  assert.equal(RULES.grazeRadius, 1);
  for (const shot of s.shots) assert.ok(shot.radius === 0.12, 'needle radius unchanged');
  assert.equal(COLLIDER_SNAPSHOT, JSON.stringify({ COLLIDERS, NEEDLE, MARKER, GRAZE_RING, BODY_RADIUS, INJECT, shipRadius: RULES.shipRadius, grazeRadius: RULES.grazeRadius }));
  // The JET rectangle: 0.5 u wide from the muzzle to the back edge.
  const r = jetRect(1, 10);
  assert.equal(r.width, JET.width);
  assert.equal(r.width, CARD['jet-injector'].fx.jetWidth, 'drawn width = collider width = card text');
  assert.equal(r.fromZ, RULES.back);
  assert.ok(near(r.toZ, 10 - JET.muzzle));
});

// ---- 3. Legacy regression -----------------------------------------------------------
test('3 legacy: adjuvants off hashes identically to the pre-adjuvant build; the empty kit equals RULES', () => {
  // Recorded from the pre-adjuvant build (main 0d8b2c1, the 12-stage suite
  // with INJECT) with the same fields; re-recorded whenever the campaign
  // itself changes under this branch.
  // Re-recorded on the run-rule commit: the LAB REPORT gained name, site,
  // zoom, exposure, injections, verdict and assessment fields; with those
  // stripped the hashes are the 0d8b2c1 values (58331758f15594d2,
  // 2d83790fa00308d6, a4d78426dd201bf8), so play is unchanged.
  const BEFORE = { 42: '754cb9439ccea1b1', 1: '2dfce8ac012ce93c', 7: '7edf87b38a358937' };
  for (const seed of [42, 1, 7]) {
    const { s, frame } = campaign(seed);
    const pick = { frame, phase: s.phase, wave: s.wave, score: s.score, kills: s.kills, hits: s.hits, shotsFired: s.shotsFired, projectilesFired: s.projectilesFired, rngState: s.rngState, grazes: s.grazes, damageTaken: s.damageTaken, bombsUsed: s.bombsUsed, medals: s.medals, x: s.ship.x, z: s.ship.z };
    assert.equal(createHash('sha256').update(JSON.stringify(pick)).digest('hex').slice(0, 16), BEFORE[seed], `seed ${seed}`);
  }
  for (const difficulty of ['normal', 'easy'])
    for (const power of [1, 2, 3, 4]) {
      const k = kitOf([], { power, difficulty });
      assert.equal(k.active, false);
      assert.equal(1 / k.fireRate, RULES.fireInterval);
      assert.equal(1 / k.abRate, RULES.antibodyInterval);
      assert.equal(k.speed, RULES.shipSpeed);
      assert.equal(k.focusSpeed, RULES.focusSpeed);
      assert.equal(k.pointerSpeed, RULES.pointerSpeed);
      assert.equal(k.maxBombs, RULES.maxBombs);
      assert.equal(k.grazePerBomb, RULES.grazePerBomb);
      assert.equal(k.bombBossFraction, RULES.bombBossFraction);
      assert.equal(k.deathbomb, difficulty === 'easy' ? 0.35 : RULES.deathbomb);
      assert.equal(k.maxVials, difficulty === 'easy' ? 5 : RULES.maxHealth);
      assert.equal(k.bombsPerVial, difficulty === 'easy' ? 3 : RULES.bombsPerVial);
      assert.equal(C.needleMul(k), 1);
      assert.equal(C.abMul(k), 1);
      assert.equal(k.potency, 1);
      assert.equal(C.antibodiesOf(k), antibodyOffsets(power, false).length);
    }
  // The base numbers cards.mjs mirrors are core.mjs's.
  assert.equal(C.BASE.fireRate, 1 / RULES.fireInterval);
  assert.equal(C.BASE.shipSpeed, RULES.shipSpeed);
  assert.equal(C.BASE.deathbomb, RULES.deathbomb);
  assert.equal(C.BASE.grazePerBomb, RULES.grazePerBomb);
  assert.ok(near((C.BASE.sprayStep * Math.PI) / 180, RULES.sprayAngle));
});

// ---- 4. Odds -------------------------------------------------------------------------
test('4a odds: every row and the boss slot match the table within 0.5 points over 100k rolls', () => {
  const odds = C.ODDS[12];
  const sample = (weights) => {
    const run = { rng: 777 };
    const n = [0, 0, 0, 0],
      N = 100000;
    const total = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < N; i++) {
      let r = C.draftRandom(run) * total;
      for (let k = 0; k < 4; k++) if (weights[k] > 0 && (r -= weights[k]) < 0) {
        n[k]++;
        break;
      }
    }
    return n.map((x) => (x / N) * 100);
  };
  for (const row of odds.rows) sample(row).forEach((p, i) => assert.ok(Math.abs(p - row[i]) < 0.5, `${row}: ${p}`));
  for (const share of [0, 0.5, 1]) {
    const row = C.bossRow(odds, share);
    assert.deepEqual(row, [0, 0, 100 - (12 + 16 * share), 12 + 16 * share]);
    sample(row).forEach((p, i) => assert.ok(Math.abs(p - row[i]) < 0.5));
  }
  assert.deepEqual(C.bossRow(odds, 0.5), [0, 0, 80, 20]);
  assert.deepEqual(C.bossRow(C.ODDS[18], 0.5), [0, 0, 85, 15]);
});

test('4b pity: incubation rises by commons shown, resets on epic+, DISCARD adds 3; the move and the floor', () => {
  assert.deepEqual(C.withIncubation([60, 28, 10, 2], 6, 1), [51, 28, 16, 5], 'the brief\'s worked example');
  assert.deepEqual(C.withIncubation([70, 25, 5, 0], 4, 0), [64, 25, 11, 0], 'all to epic at titer 0');
  assert.equal(C.withIncubation([42, 32, 20, 6], 99, 3)[0], 15, 'common never below 15');
  const run = C.createRun(9);
  const ctx = { power: 2, stage: 1, stageCount: 12 };
  let floors = 0;
  for (let i = 0; i < 400; i++) {
    const k0 = run.incubation,
      armedFloor = run.floor;
    const offer = C.openDraft(run, ctx);
    const c = offer.tiers.filter((t) => t === 'common').length;
    if (offer.tiers.some((t) => t === 'epic' || t === 'legendary')) assert.equal(run.incubation, 0);
    else assert.equal(run.incubation, k0 + c);
    if (armedFloor) {
      floors++;
      assert.notEqual(offer.tiers[0], 'common', 'the floor removes Common from slot 1');
      assert.ok(!offer.tiers.every((t) => t === 'common'), 'two all-common offers in a row are impossible');
    }
    assert.equal(run.floor, offer.tiers.every((t) => t === 'common'));
    run.offer = null;
    if (i % 3 === 0) run.incubation = 0;
  }
  assert.ok(floors > 20, 'the floor was exercised');
  C.openDraft(run, ctx);
  const k = run.incubation;
  C.discard(run);
  assert.equal(run.incubation, k + 3);
});

test('4c composition: line diversity, at most one trade-off, at least one offense card', () => {
  const run = C.createRun(31);
  let diverse = 0;
  for (let i = 0; i < 3000; i++) {
    run.deck = [];
    run.titer = i % 4;
    const offer = C.openDraft(run, { power: 1 + (i % 4), stage: 1 + (i % 11), boosted: i % 5 === 0, share: (i % 3) / 2, stageCount: 12 });
    run.offer = null;
    const cards = offer.ids.map((id) => CARD[id]);
    assert.equal(cards.length, 3);
    assert.equal(new Set(offer.ids).size, 3);
    assert.ok(cards.filter((c) => c.tradeoff).length <= 1, 'at most one trade-off');
    assert.ok(cards.some((c) => c.line === 'NEEDLE' || c.line === 'ANTIBODY'), 'an offense card');
    if (new Set(cards.map((c) => c.line)).size === 3) diverse++;
    if (offer.boosted) assert.ok(['epic', 'legendary'].includes(offer.tiers[0]), 'the boss slot is Epic or better');
  }
  assert.ok(diverse / 3000 > 0.95, `three lines in ${diverse}/3000 offers`);
});

test('4d the simulated 12-stage run reproduces RESEARCH_CARDS §4.6, and the 18-stage fixture §4.7', () => {
  // §4.6 targets, per draft: mean C/R/E/L shown and P(legendary).
  const BRIEF = [
    [2.1, 0.75, 0.15, 0, 0],
    [1.79, 0.91, 0.3, 0, 0],
    [1.12, 0.55, 1.28, 0.05, 5.0],
    [1.79, 0.85, 0.34, 0.03, 2.6],
    [1.62, 0.92, 0.39, 0.07, 6.7],
    [0.94, 0.63, 1.18, 0.25, 24.7],
    [1.5, 0.94, 0.46, 0.1, 10.1],
    [1.4, 0.96, 0.51, 0.13, 12.5],
    [0.81, 0.65, 1.23, 0.31, 28.9],
    [1.27, 0.98, 0.58, 0.17, 16.2],
    [1.21, 0.99, 0.62, 0.18, 17.0],
  ];
  const N = 6000;
  const sums = BRIEF.map(() => [0, 0, 0, 0, 0]);
  let none = 0;
  for (let i = 0; i < N; i++) {
    const { shown } = C.simulateDraft(PROFILE12, { seed: 1 + i * 7919 });
    let any = false;
    shown.forEach((tiers, d) => {
      for (const t of tiers) sums[d][C.TIERS.indexOf(t)]++;
      if (tiers.includes('legendary')) {
        sums[d][4]++;
        any = true;
      }
    });
    if (!any) none++;
  }
  sums.forEach((row, d) => {
    for (let k = 0; k < 4; k++) assert.ok(Math.abs(row[k] / N - BRIEF[d][k]) <= 0.03 + 1e-9 || (d === 2 && k === 1), `draft ${d + 1} tier ${k}: ${(row[k] / N).toFixed(3)} vs ${BRIEF[d][k]}`);
    assert.ok(Math.abs((row[4] / N) * 100 - BRIEF[d][4]) <= 1.5, `draft ${d + 1} P(L) ${((row[4] / N) * 100).toFixed(1)} vs ${BRIEF[d][4]}`);
  });
  const pNone = (none / N) * 100;
  assert.ok(pNone >= 20 && pNone <= 27, `no legendary offered in ${pNone.toFixed(1)}% of runs`);
  // §4.7: the 18-stage campaign on the leaner table.
  let shown18 = 0,
    none18 = 0;
  const rarest = [0, 0, 0];
  assert.deepEqual(profile(), PROFILE12, 'the shipped campaign is the 12-stage run');
  for (let i = 0; i < 3000; i++) {
    const r = C.simulateDraft(PROFILE18, { seed: 1 + i * 7919 });
    const L = r.shown.flat().filter((t) => t === 'legendary').length;
    shown18 += L;
    if (!L) none18++;
    rarest[C.legendariesIn(C.simulateDraft(PROFILE18, { seed: 1 + i * 7919, policy: 'rarest' }).run.deck)]++;
  }
  assert.ok(Math.abs(shown18 / 3000 - 1.56) <= 0.08, `18-stage legendaries shown ${(shown18 / 3000).toFixed(2)}`);
  assert.ok(Math.abs((none18 / 3000) * 100 - 17.9) <= 2, `18-stage none ${((none18 / 3000) * 100).toFixed(1)}%`);
  assert.ok(Math.abs((rarest[2] / 3000) * 100 - 49) <= 4, `18-stage rarest two legendaries ${((rarest[2] / 3000) * 100).toFixed(1)}%`);
});

// ---- 5. Eligibility -----------------------------------------------------------------
test('5 eligibility: no dead or maxed offers; the tier steps down; no reachable empty offer', () => {
  const run = C.createRun(5);
  run.deck = [{ id: 'concentrate', at: 1 }, { id: 'concentrate', at: 2 }, { id: 'concentrate', at: 3 }];
  assert.equal(C.eligible(run, 'concentrate', { power: 2 }), false, 'maxed');
  run.deck = [];
  assert.equal(C.eligible(run, 'igg-boost', { power: 1 }), false, 'no antibodies at L1');
  assert.equal(C.eligible(run, 'clonal-expansion', { power: 1 }), true, 'CLONAL is the exception');
  run.deck = [{ id: 'clonal-expansion', at: 1 }];
  assert.equal(C.eligible(run, 'igg-boost', { power: 1 }), true, 'CLONAL makes antibody cards eligible at L1');
  run.deck = [];
  assert.equal(C.eligible(run, 'reflex-arc', { power: 2, difficulty: 'easy' }), false);
  assert.equal(C.eligible(run, 'epipen', { power: 2, difficulty: 'easy' }), false);
  assert.equal(C.eligible(run, 'silicone-plunger', { power: 2, input: 'touch' }), false);
  assert.equal(C.eligible(run, 'wide-bore', { power: 2, input: 'touch' }), false);
  assert.equal(C.eligible(run, 'silicone-plunger', { power: 2, input: 'keys' }), true);
  // At the potency limit damage-only cards stop; behaviour cards still come.
  run.deck = C.STRONGEST_BUILD.slice(0, 10).map((id) => ({ id, at: 1 }));
  run.titer = 0;
  assert.ok(kitOf(run.deck, { power: 2, titer: 0 }).atLimit);
  for (const id of ['concentrate', 'rapid-release', 'steady-hand', 'igg-boost', 'affinity-maturation', 'opsonin-tag']) assert.equal(C.eligible(run, id, { power: 2 }), false, id);
  for (const id of ['hollow-bore', 'split-tip']) assert.equal(C.eligible(run, id, { power: 2 }), true, id);
  // Legendaries: two line picks, at most two per run.
  run.deck = [{ id: 'lather', at: 1 }];
  assert.equal(C.eligible(run, 'autoclave', { power: 2 }), false);
  run.deck.push({ id: 'surfactant', at: 2 });
  assert.equal(C.eligible(run, 'autoclave', { power: 2 }), true);
  run.deck.push({ id: 'jet-injector', at: 3 }, { id: 'lnp-shell', at: 4 });
  assert.equal(C.eligible(run, 'autoclave', { power: 2 }), false, 'a third legendary');
  // Tier fallback: a legendary roll with no eligible legendary steps down.
  const fresh = C.createRun(77);
  for (let i = 0; i < 200; i++) {
    const o = C.openDraft(fresh, { power: 2, stage: 3, boosted: true, share: 1, stageCount: 12 });
    fresh.offer = null;
    assert.ok(!o.tiers.includes('legendary'), 'no legendary without line picks');
    assert.equal(o.tiers[0], 'epic', 'the boss slot falls back to Epic');
  }
  // Exhaustive-ish: random runs through every draft never produce an empty or dead offer.
  for (let i = 0; i < 400; i++) {
    for (const [policy, input, difficulty] of [['random', 'keys', 'normal'], ['rarest', 'touch', 'easy'], ['offense', 'keys', 'easy']]) {
      const prof = i % 2 ? PROFILE12 : PROFILE18;
      const r = C.createRun(1 + i * 31);
      r.input = input;
      for (let k = 0; k < prof.length - 1; k++) {
        if (prof[k].boss) C.bossCleared(r, (i % 3) / 2);
        const ctx = { power: prof[k + 1].power, difficulty, input, stage: k + 1, boosted: prof[k].boss, share: 0.5, stageCount: prof.length };
        const o = C.openDraft(r, ctx);
        assert.equal(o.ids.length, 3, 'never an empty or short offer');
        for (const id of o.ids) {
          const c = CARD[id];
          assert.ok(C.stacksOf(r.deck, id) < c.max, 'not maxed');
          if (c.needsAb) assert.ok(prof[k + 1].power >= 2 || C.stacksOf(r.deck, 'clonal-expansion'), 'antibodies exist');
          if (difficulty === 'easy') assert.ok(!c.notEasy);
          if (input === 'touch') assert.ok(!c.notTouch);
          if (c.tier === 'legendary') assert.ok(C.linePicks(r.deck, c.line) >= 2 && C.legendariesIn(r.deck) < 2);
        }
        const choice = C.choose(r, o, policy, { ...ctx, stage: k + 2 });
        C.pick(r, choice);
      }
      assert.ok(C.legendariesIn(r.deck) <= 2);
    }
  }
});

// ---- 6. Determinism -----------------------------------------------------------------
test('6 determinism: same seed and history give the same offers; the draft never touches the stage RNG', () => {
  const offers = (seed, choices) => {
    const r = C.createRun(seed);
    const out = [];
    PROFILE12.slice(0, -1).forEach((p, k) => {
      if (p.boss) C.bossCleared(r, 0.5);
      const o = C.openDraft(r, { power: PROFILE12[k + 1].power, stage: k + 1, boosted: p.boss, share: 0.5, stageCount: 12 });
      out.push(o.ids.join(','));
      if (k === 4 && r.tokens) out.push(C.resample(r, { power: PROFILE12[k + 1].power, stage: k + 1, stageCount: 12 }).ids.join(','));
      C.pick(r, choices[k % choices.length]);
    });
    return out;
  };
  assert.deepEqual(offers(123, [0, 1, 2]), offers(123, [0, 1, 2]));
  assert.notDeepEqual(offers(123, [0, 1, 2]), offers(124, [0, 1, 2]));
  // In the model: a draft and a pick never read or write s.rngState, and
  // stage traces with an empty deck equal those without drafts.
  const s = armed([], { stage: 1, quietBoard: true });
  const rng0 = s.rngState;
  toDraft(s);
  assert.equal(s.phase, 'draft');
  assert.equal(s.rngState, rng0, 'the quiet stage and the draft used no stage RNG');
  resampleAdjuvants(s);
  assert.equal(s.rngState, rng0);
  discardAdjuvants(s);
  assert.equal(s.rngState, rng0);
  // A continue and a save reload show the identical offer with the same tokens.
  const a = armed([], { stage: 2 });
  toDraft(a);
  const saved = exportRun(a);
  const b = createState({ drafts: true });
  assert.ok(resumeRun(b, JSON.parse(JSON.stringify(saved))));
  assert.equal(b.phase, 'draft');
  assert.deepEqual(b.run.offer.ids, a.run.offer.ids);
  assert.equal(b.run.tokens, a.run.tokens);
  // Empty-deck stage traces: the same stage with and without adjuvants (HP
  // scaling is 1.00 at stages 1-2) plays bit-identically.
  const plain = createState({ seed: 99, stage: 1 });
  newRun(plain, 99);
  const withDraft = createState({ seed: 99, stage: 1, drafts: true });
  newRun(withDraft, 99);
  for (let i = 0; i < 1500; i++) {
    update(plain, 1 / 60, { axisX: Math.sin(i / 40) });
    update(withDraft, 1 / 60, { axisX: Math.sin(i / 40) });
  }
  assert.equal(withDraft.rngState, plain.rngState);
  assert.equal(withDraft.score, plain.score);
});

// ---- 7. Kit math and caps -----------------------------------------------------------
test('7 kit math: each effect equals its text at every stack; caps hold for 10,000 random decks', () => {
  const k = (deck, ctx = {}) => kitOf(deck.map((id) => ({ id, at: 0 })), { power: 2, ...ctx });
  assert.ok(near(C.needleMul(k(['concentrate'])), 1.1));
  assert.ok(near(C.needleMul(k(['concentrate', 'concentrate', 'concentrate'])), 1.3));
  assert.ok(near(k(['rapid-release']).fireRate, 8.64));
  assert.ok(near(k(['rapid-release', 'rapid-release']).fireRate, 9.28));
  assert.ok(near(C.needleMul(k(['steady-hand', 'steady-hand']), { focus: true }), 1.24));
  assert.ok(near(C.needleMul(k(['steady-hand']), { focus: false }), 1));
  assert.equal(C.needlesPerVolley(k(['twin-barrel'], { power: 1 }), true), 4);
  assert.equal(C.needlesPerVolley(k(['twin-barrel'], { power: 4 }), true), 6);
  assert.equal(C.needlesPerVolley(k(['twin-barrel'], { power: 1 }), false), 5);
  assert.equal(C.needlesPerVolley(k(['twin-barrel'], { power: 3 }), false), 7);
  assert.ok(near(k(['wide-bore']).speed, 10.58) && k(['wide-bore']).focusSpeed === 5);
  assert.ok(near(C.needleMul(k(['wide-bore'])), 1.3));
  assert.ok(near(k(['silicone-plunger']).speed, 12.19) && near(k(['silicone-plunger', 'silicone-plunger']).speed, 12.88));
  assert.equal(k(['extra-dose', 'extra-dose']).maxVials, 5);
  assert.equal(k(['extra-dose', 'extra-dose'], { difficulty: 'easy' }).maxVials, 7);
  assert.equal(k(['glass-syringe']).maxVials, 2);
  assert.equal(k(['glass-syringe'], { difficulty: 'easy' }).maxVials, 4);
  assert.ok(near(C.abMul(k(['glass-syringe'])), 1.4));
  assert.equal(k(['enteric-coating']).coatMax, 1);
  assert.equal(k(['enteric-coating']).coatReform, 30);
  assert.equal(k(['enteric-coating', 'enteric-coating']).coatReform, 20);
  assert.equal(k(['lnp-shell']).coatMax, 2);
  assert.equal(k(['lnp-shell']).coatReform, 22.5);
  assert.equal(k(['lnp-shell', 'enteric-coating', 'enteric-coating']).coatReform, 20, 'the 20 s floor (tuned from 15 s)');
  assert.deepEqual([k(['lather']).bombsPerVial, k(['lather']).maxBombs], [3, 5]);
  assert.deepEqual([k(['lather', 'lather']).bombsPerVial, k(['lather', 'lather']).maxBombs], [3, 6]);
  assert.equal(k(['lather'], { difficulty: 'easy' }).bombsPerVial, 4);
  assert.deepEqual([k(['surfactant']).soapDamage, k(['surfactant']).bombBossFraction], [1.5, 0.05]);
  assert.ok(near(k(['surfactant', 'surfactant']).bombBossFraction, 0.07));
  assert.ok(near(k(['reflex-arc']).deathbomb, 0.26));
  assert.equal(k(['reflex-arc'], { difficulty: 'easy' }).deathbomb, 0.35);
  assert.equal(k(['close-call']).grazePerBomb, 80);
  assert.equal(k(['close-call', 'close-call']).grazePerBomb, 60);
  assert.equal(k(['herd-immunity'], { power: 4 }).abRate, 6);
  assert.equal(C.antibodiesOf(k(['clonal-expansion'], { power: 1 })), 2);
  assert.equal(C.antibodiesOf(k(['clonal-expansion'], { power: 2 })), 4);
  assert.equal(C.antibodiesOf(k(['clonal-expansion'], { power: 3 })), 4);
  assert.ok(near(C.abMul(k(['clonal-expansion'], { power: 4 })), 1.2));
  assert.ok(near(C.needleMul(k(['live-culture']), { ringBusy: true }), 1.25));
  assert.ok(near(C.needleMul(k(['live-culture']), { ringBusy: false }), 0.9));
  assert.ok(near(C.needleMul(k(['fever']), { fever: true }), 1.2));
  assert.equal(k(['retractable-needle']).injectReload, 0.7);
  assert.equal(k(['antigen-harvest']).antigenScore, 2);
  // Caps over 10,000 random decks.
  const set = cardSet(false);
  const rng = { rng: 4242 };
  for (let i = 0; i < 10000; i++) {
    const deck = [];
    for (let n = 0; n < 17; n++) {
      const c = set[Math.floor(C.draftRandom(rng) * set.length)];
      if (C.stacksOf(deck, c.id) < c.max) deck.push({ id: c.id, at: 0 });
    }
    const difficulty = i % 5 ? 'normal' : 'easy';
    const titer = i % 4;
    const kit = kitOf(deck, { power: 1 + (i % 4), difficulty, titer, stage: 1 + (i % 18) });
    assert.ok(kit.fireRate <= 10 + 1e-9);
    assert.ok(kit.speed >= 10.5 - 1e-9 && kit.speed <= 12.9 + 1e-9 && kit.focusSpeed === 5);
    assert.ok((RULES.moveMaxX - RULES.moveMinX) / kit.speed >= 1.2, 'crossing >= 1.2 s');
    const base = difficulty === 'easy' ? 5 : 3;
    assert.ok(kit.maxVials <= base + 2 && kit.maxVials >= 2);
    assert.ok(kit.maxBombs <= 6 && kit.bombsPerVial <= (difficulty === 'easy' ? 4 : 3));
    assert.ok(kit.deathbomb <= (difficulty === 'easy' ? 0.35 : 0.26) + 1e-9);
    assert.ok(C.antibodiesOf(kit) <= 4 && kit.abRate <= 6);
    assert.ok(C.needlesPerVolley(kit, true) <= 6 && C.needlesPerVolley(kit, false) <= 7);
    assert.ok(kit.abBonus <= 0.7 + 1e-9);
    for (const st of [{}, { focus: true, ringBusy: true, fever: true }]) assert.ok(C.needleMul(kit, st) / kit.potencyScale <= 1.7 + 1e-9);
    assert.ok(kit.coatMax <= 2 && (!kit.coatMax || kit.coatReform >= 20));
    assert.ok(kit.grazePerBomb >= 60);
    assert.ok(kit.potency <= C.limitOf(titer) + 1e-9, 'titer limit');
  }
  assert.deepEqual([...C.TITER_LIMIT], [1.5, 1.8, 2.0, 2.15], 'T3 tuned from x2.2 by measurement (BALANCE.md)');
  // Projectiles alive <= 120 in play, with a max-projectile deck.
  const s = armed(['twin-barrel', 'split-tip', 'rapid-release', 'rapid-release', 'clonal-expansion', 'herd-immunity', 'igg-boost', 'innate-response', 'live-culture', 'fever'], { power: 4, titer: 3 });
  for (let x = -8; x <= 8; x += 2) for (let z = -12; z <= -4; z += 2) virus(s, x, z, 1);
  let most = 0;
  for (let i = 0; i < 600; i++) {
    update(s, 1 / 120, {});
    most = Math.max(most, s.shots.length);
    if (i % 60 === 0) for (let x = -8; x <= 8; x += 2) virus(s, x, -10, 1);
  }
  assert.ok(most <= C.CAPS.projectiles, `${most} projectiles alive`);
});

// ---- 8. Behaviours ------------------------------------------------------------------
const needle = (s, x, z, extra = {}) => {
  const kit = s.kit;
  const dmg = C.needleMul(kit, { focus: false });
  const shot = { id: 70000 + s.shots.length, x, z, vx: 0, vz: -RULES.needleSpeed, radius: 0.12, damage: dmg, baseDamage: dmg, pierce: kit.pierce ? 1 : 0, hitIds: [], ...extra };
  s.shots.push(shot);
  return shot;
};
const noFire = (s) => {
  s.ship.fireCooldown = 1e9;
  s.ship.antibodyCooldown = 1e9;
};

test('8 HOLLOW BORE: 60% on the second virus, never the same virus twice', () => {
  const s = armed(['hollow-bore']);
  noFire(s);
  const a = virus(s, 0, 2, 50),
    b = virus(s, 0, -1, 50);
  const shot = needle(s, 0, 4);
  step(s, 0.3);
  assert.ok(near(a.hp, 50 - shot.baseDamage, 1e-6));
  assert.ok(near(b.hp, 50 - 0.6 * shot.baseDamage, 1e-6));
  assert.equal(s.shots.length, 0);
  // Without the card the needle stops at the first virus.
  const t = armed(['concentrate']);
  noFire(t);
  const c = virus(t, 0, 2, 50),
    d = virus(t, 0, -1, 50);
  needle(t, 0, 4);
  step(t, 0.3);
  assert.ok(c.hp < 50 && d.hp === 50);
});

test('8 SPLIT TIP: two needles at ±25° on a kill, no recursion, at most 24 alive', () => {
  const s = armed(['split-tip']);
  noFire(s);
  virus(s, 0, 2, 0.5);
  needle(s, 0, 2.6);
  update(s, 1 / 120, {});
  const split = s.shots.filter((p) => p.split);
  assert.equal(split.length, 2);
  const angles = split.map((p) => (Math.atan2(p.vx, -p.vz) * 180) / Math.PI).sort((a, b) => a - b);
  assert.ok(near(angles[0], -25, 1e-6) && near(angles[1], 25, 1e-6));
  // A split needle that kills does not split again.
  virus(s, split[0].x + split[0].vx / 120, split[0].z + split[0].vz / 120, 0.2);
  for (let i = 0; i < 10; i++) update(s, 1 / 120, {});
  assert.ok(s.shots.filter((p) => p.split).length <= 2);
  // Cap: a wall of 1-HP viruses never yields more than 24 split needles alive.
  const t = armed(['split-tip']);
  noFire(t);
  for (let x = -8; x <= 8; x += 0.8) for (let z = -12; z <= 0; z += 1.2) virus(t, x, z, 0.1);
  for (let x = -8; x <= 8; x += 0.5) needle(t, x, 4);
  let most = 0;
  for (let i = 0; i < 120; i++) {
    update(t, 1 / 120, {});
    most = Math.max(most, t.shots.filter((p) => p.split).length);
  }
  assert.ok(most <= 24 && most > 2, `${most} split needles alive`);
});

test('8 JET INJECTOR: rectangle collider, 1.25x focused DPS, sparks on closed buds, twin untouched, virions destroyed, antibodies still fire', () => {
  // L1 (no antibodies) so only the jet touches the target.
  const s = armed(['concentrate', 'concentrate', 'jet-injector'], { power: 1 });
  const r = virus(s, 0, -6, 1e6).radius;
  s.enemies[0].x = JET.width / 2 + r - 0.01; // just overlapping the stream's edge
  const inside = s.enemies[0],
    outside = virus(s, JET.width / 2 + r + 0.01, -2, 1e6);
  s.enemyShots.push(still(-0.1, -2, { shootable: true, family: 'virion', hit: 0.2 }));
  step(s, 1, { focus: true });
  const kit = s.kit;
  const expected = kit.fireRate * 3 * C.needleMul(kit, { focus: true }) * 1.25;
  assert.ok(Math.abs(1e6 - inside.hp - expected) / expected < 0.01, `jet DPS ${1e6 - inside.hp} vs ${expected}`);
  assert.equal(outside.hp, 1e6, 'a body just outside the 0.5 u stream is untouched');
  assert.equal(s.shots.length, 0, 'no focused needles while the jet runs');
  assert.equal(s.enemyShots.filter((b) => b.shootable).length, 0, 'virions in the stream are destroyed');
  const ab = armed(['concentrate', 'concentrate', 'jet-injector'], { power: 2 });
  step(ab, 0.5, { focus: true });
  assert.ok(ab.shots.length > 0 && ab.shots.every((p) => p.ab), 'antibodies still fire beside the jet');
  // A closed BLOOM bud sparks the jet away.
  const t = armed(['concentrate', 'concentrate', 'jet-injector'], { power: 2 });
  const bud = virus(t, 0, -6, 100, 'bloom');
  bud.bud = { state: 'closed', timer: 99 };
  t.events = [];
  let sparks = 0;
  for (let i = 0; i < 60; i++) {
    update(t, 1 / 60, { focus: true });
    sparks += t.events.filter((e) => e.type === 'spark').length;
  }
  assert.equal(bud.hp, 100);
  assert.ok(sparks > 0);
  // The intangible twin of MIRROR STRAIN is skipped, as needles pass it.
  const u = armed(['concentrate', 'concentrate', 'jet-injector'], { power: 3, stage: 9 });
  createBoss(u, 'betagamma', { startCard: 2, world: 2 });
  for (let i = 0; i < 400 && u.boss.state !== 'fight'; i++) update(u, 1 / 60, {});
  const twins = u.enemies.filter((e) => e.part === 'twin');
  const ghost = twins.find((e) => e.id !== u.boss.nucleus);
  for (const e of twins) e.x = e === ghost ? 0 : 6;
  const hp = u.boss.hp;
  for (let i = 0; i < 30; i++) {
    for (const e of twins) e.x = e === ghost ? u.ship.x : u.ship.x + 6;
    update(u, 1 / 60, { focus: true });
  }
  assert.equal(u.boss.hp, hp, 'the intangible twin takes nothing from the jet');
  // Unfocused, the syringe sprays as usual.
  const v = armed(['jet-injector', 'concentrate', 'concentrate']);
  step(v, 0.3, {});
  assert.ok(v.shots.length > 0 && !v.ship.jetOn);
});

test('8 OPSONIN TAG: antibody hits tag for 2 s; +15% from every source, bosses included', () => {
  const s = armed(['opsonin-tag'], { power: 2 });
  noFire(s);
  const e = virus(s, 0, 2, 100);
  needle(s, 0, 2.6, { ab: true, damage: 1, baseDamage: 1, pierce: 0 });
  update(s, 1 / 120, {});
  assert.ok(near(e.taggedUntil, s.waveElapsed + 2, 0.02));
  const before = e.hp;
  needle(s, 0, 2.6, { damage: 1, baseDamage: 1, pierce: 0 });
  update(s, 1 / 120, {});
  assert.ok(near(before - e.hp, 1.15, 1e-6), 'a needle deals x1.15');
  s.bursts.push({ id: 1, x: 0, z: 2, timer: 0, radius: 1 });
  const b2 = e.hp;
  update(s, 1 / 120, {});
  assert.ok(near(b2 - e.hp, 6 * 1.15 * (s.dpsRef / 24), 1e-6), 'a cell pop deals x1.15');
  step(s, 2.1);
  const b3 = e.hp;
  needle(s, 0, 2.6, { damage: 1, baseDamage: 1, pierce: 0 });
  update(s, 1 / 120, {});
  assert.ok(near(b3 - e.hp, 1, 1e-6), 'the tag expired after 2 s');
  // Bosses can be tagged.
  const t = armed(['opsonin-tag'], { power: 2, stage: 4 });
  createBoss(t, 'alpha', { world: 1 });
  for (let i = 0; i < 400 && t.boss.state !== 'fight'; i++) update(t, 1 / 60, {});
  const core = t.enemies.find((p) => p.kind === 'boss');
  noFire(t);
  t.shots.push({ id: 1, x: core.x, z: core.z + core.radius + 0.15, vx: 0, vz: -34, radius: 0.12, damage: 1, baseDamage: 1, ab: true, pierce: 0, hitIds: [] });
  update(t, 1 / 120, {});
  assert.ok(core.taggedUntil > t.waveElapsed);
  const hp = t.boss.hp;
  t.shots.push({ id: 2, x: core.x, z: core.z + core.radius + 0.15, vx: 0, vz: -34, radius: 0.12, damage: 1, baseDamage: 1, pierce: 0, hitIds: [] });
  update(t, 1 / 120, {});
  assert.ok(near(hp - t.boss.hp, 1.15, 1e-6));
});

test('8 HERD IMMUNITY: antibodies aim at the nearest virus within 9 u, ±60°, 6 needles/s each', () => {
  const s = armed(['clonal-expansion', 'igg-boost', 'herd-immunity'], { power: 2 });
  s.ship.fireCooldown = 1e9;
  virus(s, -6, s.ship.z - 3, 1e6); // nearest: far to the side -> clamped to -60 degrees
  let volleys = 0;
  for (let i = 0; i < 120; i++) {
    const n = s.shots.length;
    update(s, 1 / 120, {});
    if (s.shots.length > n) volleys++;
  }
  assert.ok(Math.abs(volleys - 6) <= 1, `${volleys} antibody volleys in 1 s`);
  for (const p of s.shots.filter((q) => q.ab)) {
    const a = (Math.atan2(p.vx, -p.vz) * 180) / Math.PI;
    assert.ok(a >= -60 - 1e-6 && a <= 0, `aimed at ${a.toFixed(1)}°, clamped to ±60°`);
  }
  // Nothing within 9 u: straight up.
  const t = armed(['clonal-expansion', 'igg-boost', 'herd-immunity'], { power: 2 });
  t.ship.fireCooldown = 1e9;
  virus(t, 0, -12, 1e6);
  step(t, 0.2);
  for (const p of t.shots.filter((q) => q.ab)) assert.ok(Math.abs(p.vx) < 2);
});

test('8 ENTERIC COATING: absorb, 1.0 s invulnerability, 30/20 s re-form, full at stage start and respawn, capture voided, medal counts it', () => {
  const s = armed(['enteric-coating']);
  assert.equal(s.ship.coat, 1, 'full at stage start');
  s.enemyShots.push(still(s.ship.x, s.ship.z));
  update(s, 1 / 120, {});
  assert.equal(s.health, 3, 'no vial lost');
  assert.equal(s.ship.coat, 0);
  assert.ok(near(s.ship.invulnerable, 1, 0.01));
  assert.equal(s.sector.absorbs, 1);
  step(s, 29.8);
  assert.equal(s.ship.coat, 0);
  step(s, 0.3);
  assert.equal(s.ship.coat, 1, 're-formed after 30 s');
  const t = armed(['enteric-coating', 'enteric-coating']);
  t.enemyShots.push(still(t.ship.x, t.ship.z));
  update(t, 1 / 120, {});
  step(t, 20.1);
  assert.equal(t.ship.coat, 1, 're-formed after 20 s with two copies');
  // Respawn refills it; a boss card's capture is voided by an absorb.
  const u = armed(['enteric-coating'], { stage: 4 });
  createBoss(u, 'alpha', { world: 1 });
  for (let i = 0; i < 400 && u.boss.state !== 'fight'; i++) update(u, 1 / 60, {});
  assert.equal(u.boss.capture, true);
  u.ship.invulnerable = 0;
  u.enemyShots.push(still(u.ship.x, u.ship.z));
  update(u, 1 / 120, {});
  assert.equal(u.boss.capture, false, 'an absorb voids the capture');
  // Medal: an absorbed stage is not gold.
  const m = armed(['enteric-coating'], { stage: 1 });
  m.enemyShots.push(still(m.ship.x, m.ship.z));
  update(m, 1 / 120, {});
  m.sector.hold = false;
  for (let i = 0; i < 200 && m.phase === 'playing'; i++) update(m, 1 / 60, {});
  assert.equal(m.medals[1].medal, 'silver', 'the absorb counts as a lost vial for the medal');
  // Respawn: full again after a vial loss.
  const r = armed(['enteric-coating']);
  r.ship.coat = 0;
  r.enemyShots.push(still(r.ship.x, r.ship.z));
  step(r, 0.5);
  assert.equal(r.health, 2);
  assert.equal(r.ship.coat, 1, 'full at respawn');
});

test('8 LNP SHELL: 2 charges, x0.75 re-form, a 3 u bubble turns bullets into tokens', () => {
  const s = armed(['lnp-shell']);
  assert.equal(s.ship.coat, 2);
  for (let i = 0; i < 6; i++) s.enemyShots.push(still(s.ship.x + 1 + i * 0.3, s.ship.z - 0.2));
  s.enemyShots.push(still(s.ship.x - 4, s.ship.z));
  s.enemyShots.push(still(s.ship.x, s.ship.z));
  update(s, 1 / 120, {});
  assert.equal(s.ship.coat, 1);
  assert.equal(s.health, 3);
  assert.equal(s.enemyShots.length, 1, 'bullets within 3 u cancelled; the one at 4 u stays');
  assert.ok(s.antigens.length >= 6);
  step(s, 22.6);
  assert.equal(s.ship.coat, 2, '30 s x 0.75 = 22.5 s');
  // A respawn restores one charge; the second keeps re-forming.
  const t = armed(['lnp-shell']);
  t.ship.coat = 0;
  t.enemyShots.push(still(t.ship.x, t.ship.z));
  step(t, 0.3);
  assert.equal(t.health, 2);
  assert.equal(t.ship.coat, 1);
});

test('8 BACKUP ALIQUOT: once per stage, 3 s, the vial restored, the medal still counting it', () => {
  const s = armed(['backup-aliquot'], { stage: 1 });
  s.enemyShots.push(still(s.ship.x, s.ship.z));
  step(s, 0.3);
  assert.equal(s.health, 2);
  const drop = s.pickups.find((p) => p.source === 'aliquot');
  assert.ok(drop && drop.life === 3);
  step(s, 2);
  assert.equal(s.health, 3, 'caught: the vial is back');
  assert.equal(s.sector.vialsLost, 1, 'the medal still counts it');
  s.ship.invulnerable = 0;
  s.enemyShots.push(still(s.ship.x, s.ship.z));
  step(s, 0.3);
  assert.equal(s.pickups.filter((p) => p.source === 'aliquot').length, 0, 'once per stage');
  // Uncaught: it expires after 3 s.
  const t = armed(['backup-aliquot']);
  t.enemyShots.push(still(t.ship.x, t.ship.z));
  step(t, 0.3);
  const p = t.pickups.find((q) => q.source === 'aliquot');
  p.x = 8;
  p.z = -2;
  for (let i = 0; i < 400; i++) {
    update(t, 1 / 120, { axisX: -1 });
    if (t.pickups.find((q) => q.source === 'aliquot')) p.z = -2;
  }
  assert.equal(t.pickups.filter((q) => q.source === 'aliquot').length, 0);
  assert.equal(t.health, 2);
});

test('8 GLASS SYRINGE: -1 max vial, never below 2', () => {
  assert.equal(kitOf([{ id: 'glass-syringe', at: 0 }], { power: 1 }).maxVials, 2);
  assert.equal(kitOf([{ id: 'glass-syringe', at: 0 }, { id: 'extra-dose', at: 0 }], { power: 1 }).maxVials, 3);
  const s = armed([], { stage: 1 });
  toDraft(s);
  s.run.offer.ids = ['glass-syringe', 'concentrate', 'lather'];
  pickAdjuvant(s, 0);
  assert.equal(s.health, 2, 'the cost applies at the pick');
  assert.equal(s.kit.maxVials, 2);
});

test('8 EPIPEN: needs >= 2 SOAP, spends 2, saves the vial', () => {
  const s = armed(['epipen']);
  assert.equal(s.ship.bombs, 2);
  s.enemyShots.push(still(s.ship.x, s.ship.z));
  update(s, 1 / 120, {});
  assert.equal(s.ship.bombs, 0);
  assert.equal(s.health, 3);
  assert.equal(s.deathbombs, 1, 'scored like a deathbomb');
  step(s, 2.1);
  s.ship.invulnerable = 0;
  s.enemyShots.push(still(s.ship.x, s.ship.z));
  step(s, 0.3);
  assert.equal(s.health, 2, 'with fewer than 2 SOAP the pen does nothing');
});

test('8 REFLEX ARC: the 0.26 s deathbomb window at 30/60/120/240 Hz', () => {
  for (const hz of [30, 60, 120, 240])
    for (const [delay, saved] of [
      [0.24, true],
      [0.29, false],
    ]) {
      const s = armed(['reflex-arc']);
      s.enemyShots.push(still(s.ship.x, s.ship.z));
      update(s, 1 / hz, {});
      assert.ok(s.ship.dying > 0);
      let t = 1 / hz;
      while (t < delay - 1e-9) {
        update(s, 1 / hz, {});
        t += 1 / hz;
      }
      update(s, 1 / hz, { bomb: true });
      update(s, 1 / hz, {});
      assert.equal(s.health === 3, saved, `${hz} Hz, press at ${delay} s`);
    }
  assert.ok(near(armed(['reflex-arc']).kit.deathbomb, 0.26));
});

test('8 FOAM: a 5 u disc for 2.5 s that turns bullets into tokens', () => {
  const s = armed(['foam']);
  useBomb(s);
  step(s, 0.8);
  assert.ok(s.foam && s.foam.r === 5);
  const x = s.foam.x,
    z = s.foam.z;
  s.enemyShots.push(still(x + 4.7, z), still(x + 5.4, z));
  update(s, 1 / 120, {});
  assert.equal(s.enemyShots.length, 1, 'inside 5 u cancelled, outside kept');
  step(s, 2.5);
  assert.equal(s.foam, null);
  s.enemyShots.push(still(x + 1, z));
  update(s, 1 / 120, {});
  assert.equal(s.enemyShots.length, 2, 'gone after 2.5 s');
});

test('8 AUTOCLAVE: +1 SOAP per 20 s of play only, to the cap; refund at >= 30 cleared', () => {
  const s = armed(['lather', 'lather', 'autoclave']);
  s.ship.bombs = 0;
  step(s, 20.05);
  assert.equal(s.ship.bombs, 1);
  s.ship.bombs = 6;
  step(s, 20.05);
  assert.equal(s.ship.bombs, 6, 'never over the cap');
  // Paused: no time of play.
  s.ship.bombs = 0;
  togglePause(s);
  for (let i = 0; i < 1500; i++) update(s, 1 / 60, {});
  togglePause(s);
  assert.equal(s.ship.bombs, 0);
  // Refund: a SOAP that clears 30+ bullets.
  const t = armed(['lather', 'lather', 'autoclave']);
  t.ship.bombs = 2;
  for (let i = 0; i < 35; i++) t.enemyShots.push(still(-6 + (i % 12), 4 + Math.floor(i / 12)));
  useBomb(t);
  step(t, 0.8);
  assert.equal(t.ship.bombs, 2, 'spent 1, refunded 1');
  const u = armed(['lather', 'lather', 'autoclave']);
  u.ship.bombs = 2;
  for (let i = 0; i < 10; i++) u.enemyShots.push(still(-5 + i, 6));
  useBomb(u);
  step(u, 0.8);
  assert.equal(u.ship.bombs, 1, 'no refund under 30');
});

test('8 CLOSE CALL: a SOAP every 80 / 60 grazes', () => {
  for (const [deck, n] of [
    [['close-call'], 80],
    [['close-call', 'close-call'], 60],
  ]) {
    const s = armed(deck);
    s.ship.bombs = 0;
    s.ship.invulnerable = 1e9;
    for (let i = 0; i < n - 1; i++) s.enemyShots.push(still(s.ship.x + 0.9, s.ship.z, { id: 100000 + i }));
    update(s, 1 / 120, {});
    assert.equal(s.ship.bombs, 0);
    s.enemyShots.push(still(s.ship.x - 0.9, s.ship.z, { id: 300000 }));
    update(s, 1 / 120, {});
    assert.equal(s.ship.bombs, 1, `${n} grazes`);
  }
});

test('8 ANTIGEN HARVEST: tokens score x2 and add 0.25 graze progress; the SOAP loop stays under 1', () => {
  const s = armed(['antigen-harvest']);
  const t = armed([]);
  for (const st of [s, t]) {
    for (let i = 0; i < 40; i++) st.enemyShots.push(still(-8 + i * 0.4, 0));
    useBomb(st);
    step(st, 2);
  }
  assert.ok(near(s.ship.grazeProgress, 10, 1e-9), '40 tokens x 0.25');
  assert.ok(s.score - t.score >= 40 * RULES.antigenScore * 0.99, 'double token score');
  assert.ok(10 / s.kit.grazePerBomb < 1, 'a SOAP pays back a tenth of a SOAP');
});

test('8 LIVE CULTURE: occupancy from the 1.0 u ring, +25% / -10%', () => {
  const s = armed(['live-culture']);
  s.ship.invulnerable = 1e9;
  update(s, 1 / 120, {});
  assert.equal(s.ship.ringBusy, false);
  s.enemyShots.push(still(s.ship.x + 0.9 + 0.14, s.ship.z));
  update(s, 1 / 120, {});
  assert.equal(s.ship.ringBusy, true, 'solid edge inside the 1.0 u ring');
  s.enemyShots = [still(s.ship.x + 1 + 0.16, s.ship.z)];
  update(s, 1 / 120, {});
  assert.equal(s.ship.ringBusy, false, 'solid edge just outside');
  assert.ok(near(C.needleMul(s.kit, { ringBusy: true }) / C.needleMul(s.kit, { ringBusy: false }), 1.25 / 0.9));
});

test('8 FEVER: the 40th graze starts 5 s of +20% and pierce', () => {
  const s = armed(['fever']);
  s.ship.invulnerable = 1e9;
  for (let i = 0; i < 39; i++) s.enemyShots.push(still(s.ship.x + 0.9, s.ship.z, { id: 500000 + i }));
  update(s, 1 / 120, {});
  assert.equal(s.ship.fever, 0);
  s.enemyShots.push(still(s.ship.x - 0.9, s.ship.z, { id: 600000 }));
  update(s, 1 / 120, {});
  assert.ok(s.ship.fever > 4.9);
  step(s, 5);
  assert.equal(s.ship.fever, 0);
});

test('8 INNATE RESPONSE: at most 10/s, 2x damage, ±60°, 12 u', () => {
  const s = armed(['innate-response']);
  noFire(s);
  s.ship.invulnerable = 1e9;
  virus(s, 0, s.ship.z - 8, 1e6);
  for (let i = 0; i < 60; i++) s.enemyShots.push(still(s.ship.x + 0.9 * Math.cos(i), s.ship.z + 0.9 * Math.sin(i), { id: 700000 + i }));
  update(s, 1 / 120, {});
  assert.equal(s.shots.filter((p) => p.innate).length, 1, 'one per 0.1 s');
  const shot = s.shots.find((p) => p.innate);
  assert.ok(near(shot.damage, 2 * C.needleMul(s.kit), 1e-9));
  // Out of range (12 u): no innate needle.
  const t = armed(['innate-response']);
  noFire(t);
  t.ship.invulnerable = 1e9;
  virus(t, 0, t.ship.z - 14, 1e6);
  t.enemyShots.push(still(t.ship.x + 0.9, t.ship.z));
  update(t, 1 / 120, {});
  assert.equal(t.shots.length, 0);
  // Rate: grazes every step for 1 s give <= 10 needles.
  const u = armed(['innate-response']);
  noFire(u);
  u.ship.invulnerable = 1e9;
  virus(u, -9, u.ship.z - 3, 1e6);
  let n = 0;
  for (let i = 0; i < 120; i++) {
    u.enemyShots.push(still(u.ship.x + 0.9, u.ship.z, { id: 800000 + i }));
    update(u, 1 / 120, {});
    n = u.shots.filter((p) => p.innate).length + n;
    for (const p of u.shots.filter((q) => q.innate)) {
      const a = (Math.atan2(p.vx, -p.vz) * 180) / Math.PI;
      assert.ok(a >= -60 - 1e-6 && a <= 60 + 1e-6);
      p.innate = false;
      p.dead = true;
    }
  }
  assert.ok(n <= 10 && n >= 9, `${n} innate needles in 1 s`);
});

test('8 AFFINITY MATURATION: +4% per stage cleared after it was taken', () => {
  const deck = [{ id: 'affinity-maturation', at: 3 }];
  assert.ok(near(C.abMul(kitOf(deck, { power: 2, stage: 4 })), 1));
  assert.ok(near(C.abMul(kitOf(deck, { power: 2, stage: 6 })), 1.08));
  assert.ok(near(C.abMul(kitOf(deck, { power: 2, stage: 30 })), 1.4), 'max +40%');
});

test('8 CLONAL EXPANSION: option counts at L1-L4 in play', () => {
  for (const [power, n] of [
    [1, 2],
    [2, 4],
    [3, 4],
    [4, 4],
  ]) {
    const s = armed(['clonal-expansion'], { power });
    s.ship.fireCooldown = 1e9;
    update(s, 1 / 120, {});
    assert.equal(s.shots.filter((p) => p.ab).length, n, `L${power}`);
  }
});

// ---- 9. Flow --------------------------------------------------------------------------
test('9 flow: a draft after every stage but the last, boosted after non-final bosses; nothing simulates in the draft', () => {
  const s = createState({ seed: 7, drafts: true });
  newRun(s, 7);
  const drafts = [];
  let frame = 0;
  const inputFor = (f) => ({ confirm: s.phase === 'transition' && f % 2 === 0 });
  for (; frame < 60 * 60 * 30 && s.phase !== 'won' && s.phase !== 'lost'; frame++) {
    if (s.phase === 'draft') {
      const before = JSON.stringify({ clock: s.clock, elapsed: s.elapsed, rng: s.rngState, wave: s.wave });
      update(s, 1, { bomb: true, axisX: 1 });
      assert.equal(JSON.stringify({ clock: s.clock, elapsed: s.elapsed, rng: s.rngState, wave: s.wave }), before, 'nothing simulates');
      assert.equal(s.bombQueued, false, 'a SOAP press on the draft is dropped');
      pickAdjuvant(s, 0);
      // The SOAP held through the pick never fires in the next stage.
      update(s, 1 / 60, { bomb: true });
      assert.equal(s.soapRing, null);
      continue;
    }
    // Clear each stage quickly: everything hostile dies (a QA fixture only).
    for (const e of s.enemies) if (e.kind !== 'boss') e.alive = false;
    if (s.boss && s.boss.state === 'fight') {
      const c = s.boss.cards[s.boss.card];
      s.boss.hp = c.floor + 0.5;
    }
    s.sector.step = Math.max(s.sector.step, (getLevel(s.wave).script || []).length);
    s.sector.flights = [];
    s.ship.invulnerable = 99;
    update(s, 1 / 60, inputFor(frame));
    for (const ev of s.events) if (ev.type === 'draft') drafts.push(ev);
    if (s.boss && s.boss.state === 'fight') {
      const p = s.enemies.find((e) => e.kind === 'boss' && e.alive && e.part !== 'node');
      if (p) s.shots.push({ id: 1e7 + frame, x: p.x, z: p.z + p.radius + 0.4, vx: 0, vz: -34, radius: 0.12, damage: 5 });
    }
  }
  assert.equal(s.phase, 'won');
  assert.equal(drafts.length, STAGE_COUNT - 1, `${drafts.length} drafts`);
  const bossStages = LEVELS.filter((l) => l.kind === 'boss' && l.id !== STAGE_COUNT).map((l) => l.id);
  assert.deepEqual(drafts.filter((d) => d.boss).map((d) => d.stage), bossStages);
  assert.ok(!drafts.some((d) => d.stage === STAGE_COUNT));
  for (const d of drafts) assert.equal(d.vesicleBonus, false);
  // Tokens: 1 at start, +1 per non-final boss (+1 fully sequenced), at most 3.
  const r = C.createRun(1);
  assert.equal(r.tokens, 1);
  C.bossCleared(r, 0.5);
  assert.equal(r.tokens, 2);
  C.bossCleared(r, 1);
  assert.equal(r.tokens, 3, 'capped at 3');
  r.tokens = 1;
  C.bossCleared(r, 1);
  assert.equal(r.tokens, 3, '+1 and +1 for a full sequence');
  // Pause works in the draft.
  const p = armed([], { stage: 1 });
  toDraft(p);
  togglePause(p);
  assert.ok(p.paused);
  assert.equal(pickAdjuvant(p, 0), null, 'no pick while paused');
  togglePause(p);
  assert.ok(pickAdjuvant(p, 0));
});

test('9 flow: a continue restores the deck, incubation, tokens and titer; a held key never picks (the 0.5 s gate)', () => {
  const s = armed(['concentrate', 'enteric-coating'], { stage: 4, quietBoard: false });
  s.run.incubation = 4;
  s.run.tokens = 2;
  s.run.titer = 1;
  s.checkpoint.run = structuredClone(s.run);
  const entry = JSON.stringify(s.checkpoint.run);
  s.run.deck.push({ id: 'lather', at: 4 });
  s.run.tokens = 0;
  s.phase = 'lost';
  restartGame(s);
  assert.equal(JSON.stringify(s.run), entry, 'the entry build comes back');
  assert.equal(s.ship.coat, 1);
  // The FORMULATE gate: 0.5 s lock and a fresh press.
  const gate = createDraftGate();
  gate.open(1000, ['Space']);
  assert.equal(gate.accept('Space', 1100, false), false, 'locked for 0.5 s');
  assert.equal(gate.accept('Space', 1600, true), false, 'a key repeat is not a fresh press');
  assert.equal(gate.accept('Space', 1600, false), false, 'held from the fight: must be released first');
  gate.release('Space');
  assert.equal(gate.accept('Space', 1700, false), true);
  const g2 = createDraftGate();
  g2.open(0, []);
  assert.equal(g2.accept('Enter', 499, false), false);
  assert.equal(g2.accept('Enter', 501, false), true);
});

// ---- 10. Expected potency -------------------------------------------------------------
test('10 expected potency: re-measured within 5%; boss cards end by damage at 75% of E; the defence median ends most cards', () => {
  for (const [count, prof] of [
    [STAGE_COUNT, profile()],
    [18, PROFILE18],
  ]) {
    const per = C.measurePotency(prof, { seeds: 500, from: 31337 });
    const table = C.EXPECTED_POTENCY[count];
    per.forEach((xs, i) => assert.ok(Math.abs(C.median(xs) / table[i] - 1) <= 0.05, `${count}-stage stage ${i + 1}: ${C.median(xs).toFixed(3)} vs ${table[i]}`));
  }
  // dpsRef follows E, never the deck.
  const a = armed([], { stage: 10 }),
    b = armed(C.STRONGEST_BUILD, { stage: 10, titer: 2 });
  assert.equal(a.dpsRef, b.dpsRef);
  assert.ok(near(stageDps(10, a), RULES.powerDps[entryPower(10) - 1] * C.expectedPotency(10, STAGE_COUNT)));
  // Every boss card's HP is reachable at 75% of the reference DPS (E x the
  // guaranteed power) within 80% of its timeout.
  const bossStages = LEVELS.filter((l) => l.kind === 'boss' || (l.script || []).some((st) => st.midboss));
  for (const l of bossStages) {
    const types = [l.boss, ...(l.script || []).filter((st) => st.midboss).map((st) => st.midboss)].filter(Boolean);
    for (const type of types) {
      const dps = stageDps(l.id, { drafts: true });
      for (const c of BOSSES[type].cards) {
        if (c.type === 'survival') continue;
        const hp = cardHp(c, 1, dps);
        const timeout = c.type === 'phase' ? RULES.phaseTimeout : RULES.cardTimeout;
        assert.ok(hp / (0.75 * dps) <= 0.8 * timeout + 1e-9, `${type} ${c.name}: ${(hp / (0.75 * dps)).toFixed(1)} s of ${timeout}`);
      }
    }
  }
  // The defence drafter's median: at least 80% of cards end by damage (kill
  // time within the timeout at the defence median's potency).
  const defense = C.measurePotency(profile(), { seeds: 300, policy: 'defense' }).map(C.median);
  assert.equal(profile().length, STAGE_COUNT);
  let ended = 0,
    total = 0;
  for (const l of bossStages) {
    const types = [l.boss, ...(l.script || []).filter((st) => st.midboss).map((st) => st.midboss)].filter(Boolean);
    for (const type of types)
      for (const c of BOSSES[type].cards) {
        if (c.type === 'survival') continue;
        const dps = stageDps(l.id, { drafts: true });
        const own = RULES.powerDps[entryPower(l.id) - 1] * defense[l.id - 1];
        const timeout = c.type === 'phase' ? RULES.phaseTimeout : RULES.cardTimeout;
        total++;
        if (cardHp(c, 1, dps) / own <= timeout) ended++;
      }
  }
  assert.ok(ended / total >= 0.8, `${ended}/${total}`);
});

// ---- 11. Ceilings and single-card dominance ----------------------------------------------
test('11 ceilings: tier budgets, greedy <= 1.5x random, STRONGEST_BUILD >= 40% of TTK, hits to game over, favour-one bands', () => {
  // Per-tier offense budgets for one copy at L2-L4 (titer 3, so the limit is
  // not what is measured).
  const budget = { common: [0.06, 0.15], rare: [0.15, 0.25], epic: [0.25, 0.35] };
  for (const power of [2, 3, 4]) {
    const base = kitOf([], { power, titer: 3 }).potency;
    for (const c of cardSet(false)) {
      if (!(c.line === 'NEEDLE' || c.line === 'ANTIBODY') || c.tier === 'legendary') continue;
      const gain = kitOf([{ id: c.id, at: 0 }], { power, titer: 3 }).potency / base - 1;
      const [, hi] = budget[c.tier];
      const cap = c.tradeoff ? hi * 1.3 : hi;
      assert.ok(gain <= cap + 1e-9, `${c.id} at L${power}: +${(gain * 100).toFixed(1)}% over the ${c.tier} budget`);
    }
  }
  // Greedy offense stays within 1.5x of the random median at every stage.
  for (const prof of [profile(), PROFILE18]) {
    const rnd = C.measurePotency(prof, { seeds: 400 }).map(C.median);
    const grd = C.measurePotency(prof, { seeds: 400, policy: 'offense' }).map(C.median);
    rnd.forEach((r, i) => assert.ok(grd[i] / r <= 1.5 + 1e-9, `stage ${i + 1}: greedy ${grd[i].toFixed(2)} / random ${r.toFixed(2)}`));
    const p90 = C.quantile(C.measurePotency(prof, { seeds: 400 }).at(-1), 0.9);
    assert.ok(p90 <= C.limitOf(3) + 1e-9);
  }
  // STRONGEST_BUILD: at the titer limit, a card ends at >= 40% of its TTK
  // (card HP = TTK x E x 0.7, so the fraction is 0.7 x E / limit).
  let worst = Infinity;
  for (const prof of [profile(), PROFILE18]) {
    const count = prof.length;
    prof.forEach((p, i) => {
      const titer = prof.slice(0, i).filter((q) => q.boss).length;
      const potency = Math.min(C.limitOf(titer), kitOf(C.STRONGEST_BUILD.map((id) => ({ id, at: 0 })), { power: p.power, titer }).rawPotency);
      const frac = (0.7 * C.expectedPotency(p.stage, count)) / potency;
      const level = LEVELS[i];
      const fights = count === STAGE_COUNT ? level.kind === 'boss' || (level.script || []).some((st) => st.midboss) : FIGHTS18.includes(p.stage);
      if (fights) worst = Math.min(worst, frac);
    });
  }
  assert.ok(worst >= 0.4, `STRONGEST_BUILD ends a card at ${(worst * 100).toFixed(1)}% of TTK`);
});

test('11 survivability: hits to game over measured on the model (Normal 3, Easy 20, the worst non-legendary deck <= 20, with a legendary <= 24)', () => {
  const measure = (deck, difficulty = 'normal') => {
    const s = armed(deck, { difficulty, stage: 5 });
    let hits = 0;
    for (let t = 0; t < 1200 && s.phase === 'playing'; t += 6) {
      s.ship.invulnerable = 0;
      s.ship.respawn = 0;
      s.enemyShots.push(still(s.ship.x, s.ship.z, { id: 1e6 + hits }));
      hits++;
      step(s, 6, {}, 60);
    }
    return hits;
  };
  assert.equal(measure([]), 3);
  assert.equal(measure([], 'easy'), 20);
  const worst = ['extra-dose', 'extra-dose', 'lather', 'lather', 'epipen', 'enteric-coating', 'enteric-coating', 'backup-aliquot'];
  const w = measure(worst);
  assert.ok(w <= 20, `worst non-legendary Normal deck: ${w} hits`);
  assert.ok(w >= 10, 'the defensive stack is worth a lot');
  assert.equal(w, C.hitsEstimate(kitOf(worst.map((id) => ({ id, at: 0 })), { power: 2 })), 'the estimate the defence bot ranks by matches the model');
  for (const legendary of ['lnp-shell', 'autoclave']) {
    const leg = measure([...worst, legendary]);
    assert.ok(leg <= 24, `with ${legendary}: ${leg} hits`);
  }
  // Every single defence card adds at most +3 hits on its own.
  for (const id of ['extra-dose', 'enteric-coating', 'backup-aliquot', 'epipen', 'lather']) assert.ok(measure([id]) - 3 <= 3, id);
});

// ---- 13. Save and resume --------------------------------------------------------------
test('13 save: a full round trip; a reload mid-draft restores the offer without refunding tokens; a corrupt save is refused', () => {
  const s = armed(['concentrate', 'lather', 'enteric-coating'], { stage: 6, titer: 1, quietBoard: false });
  s.score = 12345;
  s.checkpoint.score = 12345;
  const at = exportRun(s);
  const json = JSON.parse(JSON.stringify(at));
  const t = createState({ drafts: true });
  assert.ok(resumeRun(t, json));
  assert.equal(t.wave, 6);
  assert.equal(t.score, 12345);
  assert.deepEqual(t.run.deck, s.run.deck);
  assert.equal(t.run.titer, 1);
  assert.equal(t.ship.coat, 1);
  assert.equal(t.phase, 'playing');
  // Mid-draft: the same offer; a resample is saved, so a reload cannot reroll.
  const d = armed(['concentrate'], { stage: 2 });
  toDraft(d);
  d.run.tokens = 2;
  resampleAdjuvants(d);
  const saved = JSON.parse(JSON.stringify(exportRun(d)));
  const e = createState({ drafts: true });
  assert.ok(resumeRun(e, saved));
  assert.deepEqual(e.run.offer.ids, d.run.offer.ids);
  assert.equal(e.run.tokens, 1, 'the token spent stays spent');
  assert.ok(pickAdjuvant(e, 1));
  assert.equal(e.wave, 3);
  // Corrupt, foreign or missing saves are refused without throwing.
  const f = createState({ drafts: true });
  for (const bad of [null, undefined, 7, 'x', {}, { v: 2 }, { ...json, stage: 99 }, { ...json, run: { ...json.run, deck: [{ id: 'nope', at: 1 }] } }, { ...json, run: { ...json.run, tokens: 9 } }, { ...json, health: -1 }, { ...json, run: null }])
    assert.equal(resumeRun(f, bad), false);
  assert.equal(f.phase, 'title', 'a refused save leaves the state alone');
  // A new run starts empty.
  newRun(t, 5);
  assert.deepEqual(t.run.deck, []);
  assert.equal(t.run.tokens, 1);
  // Practice and tray starts past 1-1 have no run (STANDARD ISSUE), so nothing is saved.
  const p = createState({ drafts: true, stage: 1 });
  p.unlockedStage = STAGE_COUNT;
  p.run = null;
  assert.equal(exportRun(p), null);
});

// ---- 14. Medals and sequencing ----------------------------------------------------------
test('14 medals and sequencing: an absorb voids the capture; EPIPEN scores like a deathbomb; a caught aliquot still counts', () => {
  const s = armed(['epipen', 'lather'], { stage: 4 });
  s.ship.bombs = 3;
  createBoss(s, 'alpha', { world: 1 });
  for (let i = 0; i < 400 && s.boss.state !== 'fight'; i++) update(s, 1 / 60, {});
  s.ship.invulnerable = 0;
  s.enemyShots.push(still(s.ship.x, s.ship.z));
  update(s, 1 / 120, {});
  assert.equal(s.boss.capture, false, 'the pen\'s SOAP voids the capture');
  assert.equal(s.health, 3);
  assert.equal(s.deathbombs, 1);
  // A sequenced boss lifts the boosted draft's legendary weight and pays tokens.
  const r = armed([], { stage: LEVELS.find((l) => l.boss === 'alpha').id, quietBoard: false });
  r.run.tokens = 1;
  r.boss.results = r.boss.cards.map((c) => ({ neutralized: c.type !== 'phase' }));
  r.boss.state = 'defeated';
  for (let i = 0; i < 400 && r.phase !== 'draft'; i++) {
    for (const e of r.enemies) e.alive = false;
    update(r, 1 / 60, { confirm: i % 2 === 0 });
  }
  assert.equal(r.phase, 'draft');
  assert.equal(r.run.titer, 1);
  assert.equal(r.run.lastShare, 1);
  assert.equal(r.run.tokens, 3, '1 + 1 boss + 1 full sequence');
  assert.equal(r.run.offer.boosted, true);
  assert.equal(r.run.offer.share, 1);
});

// ---- 15. Audio ------------------------------------------------------------------------
// (tests/audio.test.mjs builds and stops every SFX_CATALOG entry, the new
// adjuvant sounds included; the per-tier distinctness and level checks for
// the reveal sounds live there.)
