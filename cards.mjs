/** ADJUVANTS: the between-stage draft that modifies the syringe (v1.0).
 * RESEARCH_CARDS.md is the brief; this module is its pure implementation:
 * the 30 cards, the modifier set they produce (`kitOf`), potency and the
 * titer limit, and the seeded offer generator with pity, the floor, the boss
 * slot and the eligibility rules. No DOM, no Three.js and no model import, so
 * the model, the UI, the bots and the tests all read exactly this code.
 *
 * In the game the cards are called ADJUVANTS and the screen FORMULATE: a
 * "card" already means a boss's mutation card.
 *
 * Units follow core.mjs: world units (u), seconds, u/s. Every effect is data
 * (`fx`), and every card's text is generated from that data, so the numbers a
 * player reads can never drift from the effect.
 *
 * Collision geometry is constant: nothing here can express a hitbox, a graze
 * radius or a needle reach (tests/cards.test.mjs asserts it for every deck).
 */

// ---- Base numbers this module needs (mirrors core.mjs RULES; asserted equal by test) ----
export const BASE = Object.freeze({
  fireRate: 8, // volleys/s (core.mjs fireInterval 0.125)
  abRate: 4, // needles/s per antibody (antibodyInterval 0.25)
  shipSpeed: 11.5,
  focusSpeed: 5,
  pointerSpeed: 11.5,
  deathbomb: 0.18,
  maxBombs: 5,
  grazePerBomb: 100,
  bombBossFraction: 0.03,
  injectReload: 0.5,
  injectReloadElite: 0.8,
  sprayStep: 4.25, // degrees between SPRAY needles (core.mjs sprayAngle)
});

/** Hard caps (RESEARCH_CARDS §5.2), applied in kitOf whatever the deck. */
export const CAPS = Object.freeze({
  needleBonus: 0.7, // all needle damage sources together, FEVER included
  abBonus: 0.7,
  fireRate: 10, // volleys/s: the calm-stream request
  focusNeedles: 6,
  sprayNeedles: 7,
  antibodies: 4,
  abRate: 6, // needles/s per antibody
  minSpeed: 10.5,
  maxSpeed: 12.9, // crossing the 17.8 u box in >= 1.38 s, over the 1.2 s floor
  vialsOver: 2, // max vials <= base + 2
  minVials: 2,
  maxBombs: 6,
  deathbomb: 0.26,
  coatCharges: 2,
  // The brief's floor was 15 s; LNP x0.75 on two ENTERIC copies reached it
  // and measured 25 hits to game over with the defensive stack (ceiling 24),
  // so the floor is 20 s (19 hits). BALANCE.md "Adjuvants".
  minReform: 20,
  minGrazePerBomb: 60,
  projectiles: 120, // player needles + split + innate alive at once
  splitAlive: 24,
});

/** Titer potency limit: bosses literally unlock stronger formulations. */
// T3 was x2.2 in the brief; the real model measured greedy offense at 1.503x
// the random median entering 4-2 (12-stage run), over the 1.5x ceiling, so
// T3 is x2.15 (BALANCE.md "Adjuvants").
export const TITER_LIMIT = Object.freeze([1.5, 1.8, 2.0, 2.15]);
export const limitOf = (titer) => TITER_LIMIT[Math.max(0, Math.min(3, titer | 0))];

export const TIERS = Object.freeze(['common', 'rare', 'epic', 'legendary']);
export const TIER_LABEL = Object.freeze({ common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY' });
export const LINES = Object.freeze(['NEEDLE', 'ANTIBODY', 'DOSE', 'SOAP', 'GRAZE']);
const OFFENSE_LINES = ['NEEDLE', 'ANTIBODY'];

const pct = (x) => `${Math.round(Math.abs(x) * 100)}%`;
const num = (x) => String(Math.round(x * 100) / 100);

/** The 30 adjuvants. `n` is the brief's number; card 27 resolves by whether
 * INJECT ships (RETRACTABLE NEEDLE) or not (ANTIGEN HARVEST). Flags:
 *   damageOnly  single-target damage/rate only: not offered at the limit
 *   needsAb     needs antibodies at the next stage (or CLONAL EXPANSION)
 *   notEasy     auto-SOAP makes it nearly dead on Easy
 *   notTouch    touch maps the finger 1:1, so speed does nothing
 *   tradeoff    at most one per offer; has a COST line
 * `text(fx, next)` is the effect sentence for the copy `next` (1-based). */
const DEFS = [
  // NEEDLE: the main stream
  { n: 1, id: 'concentrate', name: 'CONCENTRATE', tier: 'common', line: 'NEEDLE', tags: ['Needle'], max: 3, damageOnly: true, fx: { needle: 0.1 }, text: (f) => `Needles deal +${pct(f.needle)} damage.` },
  { n: 2, id: 'rapid-release', name: 'RAPID RELEASE', tier: 'common', line: 'NEEDLE', tags: ['Needle'], max: 2, damageOnly: true, fx: { rate: 0.08 }, text: (f) => `Fire rate +${pct(f.rate)} per copy (never above ${CAPS.fireRate} volleys/s).` },
  { n: 3, id: 'steady-hand', name: 'STEADY HAND', tier: 'common', line: 'NEEDLE', tags: ['Focus'], max: 2, damageOnly: true, fx: { focus: 0.12 }, text: (f) => `While focused, needles deal +${pct(f.focus)} more damage.` },
  { n: 4, id: 'twin-barrel', name: 'TWIN BARREL', tier: 'rare', line: 'NEEDLE', tags: ['Needle', 'Spread'], max: 1, fx: { focusNeedles: 1, sprayNeedles: 2 }, text: (f) => `+${f.focusNeedles} parallel needle in focus; SPRAY gains +${f.sprayNeedles} needles at ±${BASE.sprayStep}°.` },
  { n: 5, id: 'hollow-bore', name: 'HOLLOW BORE', tier: 'rare', line: 'NEEDLE', tags: ['Pierce'], max: 1, fx: { pierce: 0.6 }, text: (f) => `Needles pass through the first virus and hit a second for ${pct(f.pierce)} damage.` },
  { n: 6, id: 'wide-bore', name: '18G WIDE BORE', tier: 'rare', line: 'NEEDLE', tags: ['Needle', 'Trade-off'], max: 1, tradeoff: true, notTouch: true, fx: { needle: 0.3, speed: -0.08 }, text: (f) => `Needles deal +${pct(f.needle)} damage.`, cost: (f) => `COST: the syringe moves ${pct(f.speed)} slower (focus unchanged).` },
  { n: 7, id: 'split-tip', name: 'SPLIT TIP', tier: 'epic', line: 'NEEDLE', tags: ['Spread'], max: 1, fx: { splitAngle: 25 }, text: (f) => `A needle that kills a virus splits into 2 needles at ±${f.splitAngle}°.` },
  { n: 8, id: 'jet-injector', name: 'JET INJECTOR', tier: 'legendary', line: 'NEEDLE', tags: ['Needle', 'Pierce', 'Focus'], max: 1, fx: { jet: 1.25, jetWidth: 0.5 }, text: (f) => `In focus a ${num(f.jetWidth)} u jet replaces the needles: hits all it touches, ${num(f.jet)}× DPS.` },
  // ANTIBODY: the Y-shaped options
  { n: 9, id: 'igg-boost', name: 'IgG BOOST', tier: 'common', line: 'ANTIBODY', tags: ['Antibody'], max: 3, needsAb: true, damageOnly: true, fx: { ab: 0.15 }, text: (f) => `Antibody needles deal +${pct(f.ab)} damage.` },
  { n: 10, id: 'clonal-expansion', name: 'CLONAL EXPANSION', tier: 'rare', line: 'ANTIBODY', tags: ['Antibody'], max: 1, fx: { early: 1, abAt4: 0.2 }, text: (f) => `Antibodies arrive one mRNA level early (2 at L1, 4 at L2). At L4: +${pct(f.abAt4)} damage.` },
  { n: 11, id: 'affinity-maturation', name: 'AFFINITY MATURATION', tier: 'rare', line: 'ANTIBODY', tags: ['Antibody', 'Scaling'], max: 1, needsAb: true, damageOnly: true, fx: { perSample: 0.04, cap: 0.4 }, text: (f) => `Antibody needles gain +${pct(f.perSample)} per sample cleared from now on (max +${pct(f.cap)}).` },
  { n: 12, id: 'opsonin-tag', name: 'OPSONIN TAG', tier: 'epic', line: 'ANTIBODY', tags: ['Antibody'], max: 1, needsAb: true, damageOnly: true, fx: { tag: 0.15, tagTime: 2 }, text: (f) => `Antibody hits tag a virus for ${f.tagTime} s: it takes +${pct(f.tag)} from every source.` },
  { n: 13, id: 'herd-immunity', name: 'HERD IMMUNITY', tier: 'legendary', line: 'ANTIBODY', tags: ['Antibody', 'Homing'], max: 1, needsAb: true, fx: { aim: 9, arc: 60, abRate: 0.5 }, text: (f) => `Antibodies aim at the nearest virus within ${f.aim} u (±${f.arc}°) and fire ${pct(f.abRate)} faster.` },
  // DOSE: vials, coating, motion
  { n: 14, id: 'extra-dose', name: 'EXTRA DOSE', tier: 'common', line: 'DOSE', tags: ['Vial'], max: 2, fx: { vials: 1 }, text: (f) => `+${f.vials} max vial, and one vial filled now.` },
  { n: 15, id: 'silicone-plunger', name: 'SILICONE PLUNGER', tier: 'common', line: 'DOSE', tags: ['Motion'], max: 2, notTouch: true, fx: { speed: 0.06 }, text: (f) => `The syringe moves +${pct(f.speed)} faster per copy; focus speed unchanged.` },
  { n: 16, id: 'enteric-coating', name: 'ENTERIC COATING', tier: 'rare', line: 'DOSE', tags: ['Shield'], max: 2, fx: { reform: 30, reform2: 20, invuln: 1 }, text: (f, next) => (next >= 2 ? `The coating now re-forms in ${f.reform2} s instead of ${f.reform} s after it breaks.` : `A coating absorbs one core hit, then re-forms ${f.reform} s after it breaks.`) },
  { n: 17, id: 'backup-aliquot', name: 'BACKUP ALIQUOT', tier: 'epic', line: 'DOSE', tags: ['Vial'], max: 1, fx: { catchTime: 3 }, text: (f) => `Once per sample a lost vial drops as an aliquot: catch it in ${f.catchTime} s to refill.` },
  { n: 18, id: 'glass-syringe', name: 'GLASS SYRINGE', tier: 'epic', line: 'DOSE', tags: ['Needle', 'Vial', 'Trade-off'], max: 1, tradeoff: true, fx: { needle: 0.4, ab: 0.4, vials: -1 }, text: (f) => `Needles and antibodies deal +${pct(f.needle)} damage.`, cost: (f) => `COST: −${Math.abs(f.vials)} max vial (never below ${CAPS.minVials}).` },
  { n: 19, id: 'lnp-shell', name: 'LNP SHELL', tier: 'legendary', line: 'DOSE', tags: ['Shield', 'SOAP'], max: 1, fx: { charges: 2, reformMul: 0.75, pop: 3 }, text: (f) => `The coating holds ${f.charges} hits, re-forms ${pct(1 - f.reformMul)} faster; each absorb clears ${f.pop} u.` },
  // SOAP: the bomb
  { n: 20, id: 'lather', name: 'LATHER', tier: 'common', line: 'SOAP', tags: ['SOAP'], max: 2, fx: { soapNow: 1, refill: 1, cap: 1 }, text: (f, next) => (next >= 2 ? `+${f.soapNow} SOAP now, and the SOAP stock cap rises by ${f.cap} (to ${BASE.maxBombs + f.cap}).` : `+${f.soapNow} SOAP now, and every vial refill gives ${f.refill} more SOAP.`) },
  { n: 21, id: 'surfactant', name: 'SURFACTANT', tier: 'common', line: 'SOAP', tags: ['SOAP'], max: 2, fx: { soap: 0.5, bite: 0.02 }, text: (f, next) => `SOAP deals +${pct(f.soap)} to viruses and bites ${pct(BASE.bombBossFraction + f.bite * next)} of a boss card.` },
  { n: 22, id: 'reflex-arc', name: 'REFLEX ARC', tier: 'rare', line: 'SOAP', tags: ['SOAP'], max: 1, notEasy: true, fx: { window: 0.08 }, text: (f) => `The deathbomb window grows from ${BASE.deathbomb} s to ${num(BASE.deathbomb + f.window)} s.` },
  { n: 23, id: 'epipen', name: 'EPIPEN', tier: 'rare', line: 'SOAP', tags: ['SOAP', 'Shield'], max: 1, notEasy: true, fx: { cost: 2 }, text: (f) => `A hit with ${f.cost}+ SOAP in stock makes the pen spend ${f.cost} and save the vial.` },
  { n: 24, id: 'foam', name: 'FOAM', tier: 'epic', line: 'SOAP', tags: ['SOAP'], max: 1, fx: { radius: 5, time: 2.5 }, text: (f) => `Your SOAP leaves a ${f.radius} u foam for ${f.time} s that turns bullets into antigen.` },
  { n: 25, id: 'autoclave', name: 'AUTOCLAVE', tier: 'legendary', line: 'SOAP', tags: ['SOAP'], max: 1, fx: { every: 20, refund: 30 }, text: (f) => `+1 SOAP every ${f.every} s of play; a SOAP that clears ${f.refund}+ bullets refunds itself.` },
  // GRAZE: dancing with the virus
  { n: 26, id: 'close-call', name: 'CLOSE CALL', tier: 'common', line: 'GRAZE', tags: ['Graze', 'SOAP'], max: 2, fx: { grazes: 20 }, text: (f, next) => `A SOAP every ${BASE.grazePerBomb - f.grazes * next} grazes instead of ${BASE.grazePerBomb - f.grazes * (next - 1)}.` },
  { n: 27, id: 'retractable-needle', name: 'RETRACTABLE NEEDLE', tier: 'common', line: 'NEEDLE', tags: ['Needle', 'Inject'], max: 1, inject: true, fx: { reload: 0.3 }, text: (f) => `INJECT reloads ${pct(f.reload)} faster (${BASE.injectReload} s → ${num(BASE.injectReload * (1 - f.reload))} s).` },
  { n: 27, id: 'antigen-harvest', name: 'ANTIGEN HARVEST', tier: 'common', line: 'GRAZE', tags: ['Graze', 'SOAP'], max: 1, inject: false, fx: { score: 2, progress: 0.25 }, text: (f) => `Antigen tokens score ×${f.score}, and each adds ${f.progress} graze toward the next SOAP.` },
  { n: 28, id: 'live-culture', name: 'LIVE CULTURE', tier: 'rare', line: 'GRAZE', tags: ['Graze', 'Needle', 'Trade-off'], max: 1, tradeoff: true, fx: { on: 0.25, off: -0.1 }, text: (f) => `Needles deal +${pct(f.on)} while a bullet is inside your graze ring.`, cost: (f) => `COST: −${pct(f.off)} needle damage while the ring is empty.` },
  { n: 29, id: 'fever', name: 'FEVER', tier: 'epic', line: 'GRAZE', tags: ['Graze', 'Pierce'], max: 1, fx: { every: 40, time: 5, needle: 0.2 }, text: (f) => `Every ${f.every}th graze starts ${f.time} s of FEVER: needles +${pct(f.needle)} and pierce one virus.` },
  { n: 30, id: 'innate-response', name: 'INNATE RESPONSE', tier: 'legendary', line: 'GRAZE', tags: ['Graze', 'Homing'], max: 1, fx: { range: 12, mult: 2, cap: 10 }, text: (f) => `Each graze fires a ${f.mult}× needle at the nearest virus within ${f.range} u (max ${f.cap}/s).` },
];
for (const d of DEFS) {
  Object.freeze(d.fx);
  Object.freeze(d.tags);
  Object.freeze(d);
}
/** Every definition, both variants of card 27 included. */
export const ALL_CARDS = Object.freeze(DEFS);
export const CARD = Object.freeze(Object.fromEntries(DEFS.map((d) => [d.id, d])));
/** The 30-card set of a build: card 27 resolves by the INJECT flag. */
export const cardSet = (inject = false) => Object.freeze(DEFS.filter((d) => d.inject === undefined || d.inject === !!inject));

/** Effect sentence and cost for the copy `next` (1-based) of a card. */
export function cardText(id, next = 1) {
  const c = CARD[id];
  return c ? c.text(c.fx, next) : '';
}
export const cardCost = (id) => (CARD[id]?.cost ? CARD[id].cost(CARD[id].fx) : '');

/** Synergies printed on the draft screen when a pick completes a pair (§3.4). */
export const SYNERGIES = Object.freeze([
  ['opsonin-tag', 'jet-injector'],
  ['opsonin-tag', 'split-tip'],
  ['clonal-expansion', 'igg-boost'],
  ['clonal-expansion', 'affinity-maturation'],
  ['clonal-expansion', 'herd-immunity'],
  ['steady-hand', 'jet-injector'],
  ['hollow-bore', 'fever'],
  ['lather', 'epipen'],
  ['close-call', 'autoclave'],
  ['lather', 'autoclave'],
  ['retractable-needle', 'live-culture'],
  ['live-culture', 'innate-response'],
  ['enteric-coating', 'lnp-shell'],
  ['glass-syringe', 'backup-aliquot'],
]);
export function synergyOf(deck, id) {
  const owned = new Set(deck.map((d) => d.id));
  const pair = SYNERGIES.find(([a, b]) => (a === id && owned.has(b)) || (b === id && owned.has(a)));
  return pair ? pair.map((p) => CARD[p].name).join(' + ') : null;
}

// ---- The modifier set -----------------------------------------------------------
export const stacksOf = (deck, id) => deck.reduce((n, d) => n + (d.id === id ? 1 : 0), 0);
const has = (deck, id) => deck.some((d) => d.id === id);
export const legendariesIn = (deck) => deck.filter((d) => CARD[d.id]?.tier === 'legendary').length;
export const linePicks = (deck, line) => deck.filter((d) => CARD[d.id]?.line === line).length;

/** Antibody options at a power level: 0, 2 or 4 (model.optionOffsets). */
const abCount = (power) => (power >= 4 ? 4 : power >= 2 ? 2 : 0);
const focusCount = (power) => (power >= 4 ? 5 : power >= 3 ? 4 : 3);
const sprayCount = (power) => (power >= 3 ? 5 : 3);

/** The syringe's modifier set for a deck.
 * ctx: { power (mRNA level now), difficulty ('normal' | 'easy'), titer,
 *        stage (the stage being played, for AFFINITY), scale (STANDARD ISSUE
 *        damage multiplier, practice only) }.
 * Every field the model reads for a player stat lives here; with an empty
 * deck and scale 1 every value equals core.mjs RULES (asserted by test). */
export function kitOf(deck = [], { power = 1, difficulty = 'normal', titer = 0, stage = 1, scale = 1 } = {}) {
  const n = (id) => stacksOf(deck, id);
  const easy = difficulty === 'easy';
  const baseVials = easy ? 5 : 3;
  const baseRefill = easy ? 3 : 2;
  const k = {
    power,
    cards: deck.length,
    active: deck.length > 0 || scale !== 1,
    // Damage buckets (bonuses add; caps apply at use, since FEVER, focus and
    // the graze ring are dynamic).
    needleBonus: 0.1 * n('concentrate') + 0.3 * n('wide-bore') + 0.4 * n('glass-syringe'),
    focusBonus: 0.12 * n('steady-hand'),
    liveCulture: has(deck, 'live-culture'),
    fever: has(deck, 'fever'),
    abBonus: 0.15 * n('igg-boost') + 0.4 * n('glass-syringe'),
    potencyScale: 1, // the titer limit (set below)
    scale, // STANDARD ISSUE (practice) or 1
    fireRate: Math.min(CAPS.fireRate, BASE.fireRate * (1 + 0.08 * n('rapid-release'))),
    twin: has(deck, 'twin-barrel'),
    pierce: has(deck, 'hollow-bore') ? CARD['hollow-bore'].fx.pierce : 0,
    split: has(deck, 'split-tip'),
    jet: has(deck, 'jet-injector'),
    clonal: has(deck, 'clonal-expansion'),
    tag: has(deck, 'opsonin-tag'),
    herd: has(deck, 'herd-immunity'),
    abRate: Math.min(CAPS.abRate, BASE.abRate * (has(deck, 'herd-immunity') ? 1.5 : 1)),
    speed: 0,
    focusSpeed: BASE.focusSpeed,
    pointerSpeed: 0,
    maxVials: 0,
    coatMax: 0,
    coatReform: 0,
    lnp: has(deck, 'lnp-shell'),
    aliquot: has(deck, 'backup-aliquot'),
    bombsPerVial: baseRefill + (n('lather') >= 1 ? 1 : 0),
    maxBombs: Math.min(CAPS.maxBombs, BASE.maxBombs + (n('lather') >= 2 ? 1 : 0)),
    soapDamage: 1 + 0.5 * n('surfactant'),
    bombBossFraction: BASE.bombBossFraction + 0.02 * n('surfactant'),
    deathbomb: easy ? 0.35 : Math.min(CAPS.deathbomb, BASE.deathbomb + (has(deck, 'reflex-arc') ? 0.08 : 0)),
    epipen: !easy && has(deck, 'epipen'),
    foam: has(deck, 'foam'),
    autoclave: has(deck, 'autoclave'),
    grazePerBomb: Math.max(CAPS.minGrazePerBomb, BASE.grazePerBomb - 20 * n('close-call')),
    innate: has(deck, 'innate-response'),
    injectReload: 1 - (has(deck, 'retractable-needle') ? 0.3 : 0),
    antigenScore: has(deck, 'antigen-harvest') ? 2 : 1,
    antigenProgress: has(deck, 'antigen-harvest') ? 0.25 : 0,
  };
  // CLONAL EXPANSION: options one level early, or +20% at L4.
  k.abPower = k.clonal ? Math.min(4, power + 2) : power;
  if (k.clonal && power >= 4) k.abBonus += CARD['clonal-expansion'].fx.abAt4;
  // AFFINITY MATURATION: +4% per sample cleared after the pick (deck entry
  // `at` is the stage that was cleared when it was taken).
  const aff = deck.find((d) => d.id === 'affinity-maturation');
  if (aff) k.abBonus += Math.min(0.4, 0.04 * Math.max(0, stage - 1 - aff.at));
  // Speed: +6% per SILICONE copy, -8% for 18G, clamped; focus fixed at 5.0.
  const speedMul = 1 + 0.06 * n('silicone-plunger') - 0.08 * n('wide-bore');
  k.speed = Math.min(CAPS.maxSpeed, Math.max(CAPS.minSpeed, BASE.shipSpeed * speedMul));
  if (speedMul === 1) k.speed = BASE.shipSpeed;
  k.pointerSpeed = speedMul === 1 ? BASE.pointerSpeed : Math.min(CAPS.maxSpeed, Math.max(CAPS.minSpeed, BASE.pointerSpeed * speedMul));
  // Vials: base + EXTRA DOSE - GLASS, never below 2 and never over base + 2.
  k.maxVials = Math.max(CAPS.minVials, Math.min(baseVials + CAPS.vialsOver, baseVials + n('extra-dose') - n('glass-syringe')));
  // Coating: ENTERIC (1 charge, 30 s / 20 s), LNP (2 charges, x0.75, brings one).
  const enteric = n('enteric-coating');
  if (enteric || k.lnp) {
    k.coatMax = k.lnp ? CAPS.coatCharges : 1;
    k.coatReform = Math.max(CAPS.minReform, (enteric >= 2 ? 20 : 30) * (k.lnp ? 0.75 : 1));
  }
  k.abBonus = Math.min(CAPS.abBonus, k.abBonus);
  // Titer limit: one scale on needle and antibody damage (§5.2).
  const raw = rawPotency(k);
  const limit = limitOf(titer);
  k.rawPotency = raw;
  k.limit = limit;
  if (raw > limit) k.potencyScale = limit / raw;
  k.potency = raw * k.potencyScale;
  k.atLimit = raw >= limit - 1e-9;
  return Object.freeze(k);
}

/** Needle damage multiplier at a moment of play (focus, ring busy, FEVER). */
export function needleMul(kit, { focus = false, ringBusy = false, fever = false } = {}) {
  let bonus = kit.needleBonus + (focus ? kit.focusBonus : 0);
  if (kit.liveCulture) bonus += ringBusy ? CARD['live-culture'].fx.on : CARD['live-culture'].fx.off;
  if (fever) bonus += CARD.fever.fx.needle;
  return (1 + Math.min(CAPS.needleBonus, bonus)) * kit.potencyScale * kit.scale;
}
export const abMul = (kit) => (1 + kit.abBonus) * kit.potencyScale * kit.scale;
export const needlesPerVolley = (kit, focus) =>
  focus ? Math.min(CAPS.focusNeedles, focusCount(kit.power) + (kit.twin ? 1 : 0)) : Math.min(CAPS.sprayNeedles, sprayCount(kit.power) + (kit.twin ? 2 : 0));
export const antibodiesOf = (kit) => Math.min(CAPS.antibodies, abCount(kit.abPower));

/** Sustained single-target DPS of a focused syringe on a boss-sized target
 * with every needle hitting (§5.1), before the titer clamp. Conventions:
 * LIVE CULTURE at 50% ring occupancy, FEVER at 20% uptime, OPSONIN at full
 * uptime, INNATE at 1 graze/s. Multi-target value is not counted. */
function dpsOf(k) {
  const lc = k.liveCulture ? 0.5 * CARD['live-culture'].fx.on + 0.5 * CARD['live-culture'].fx.off : 0;
  const fv = k.fever ? 0.2 * CARD.fever.fx.needle : 0;
  const unit = 1 + Math.min(CAPS.needleBonus, k.needleBonus + k.focusBonus + lc + fv);
  let needles = k.fireRate * needlesPerVolley(k, true) * unit;
  if (k.jet) needles *= CARD['jet-injector'].fx.jet;
  const abs = antibodiesOf(k) * k.abRate * (1 + k.abBonus);
  const innate = k.innate ? 1 * CARD['innate-response'].fx.mult * unit : 0;
  return (needles + abs + innate) * (k.tag && antibodiesOf(k) > 0 ? 1 + CARD['opsonin-tag'].fx.tag : 1);
}
const baseDps = (power) => BASE.fireRate * focusCount(power) + abCount(power) * BASE.abRate;
function rawPotency(k) {
  return dpsOf(k) / baseDps(k.power);
}
/** Effective potency of a deck (after the titer limit). */
export const potencyOf = (deck, ctx) => kitOf(deck, ctx).potency;

/** Hits to game over in one stage (§5.1): core hits every 6 s from a full
 * start with no player input. An analytic estimate the GREEDY-DEFENSE bot
 * ranks by; tests/cards.test.mjs measures the real model against it. */
export function hitsEstimate(kit, difficulty = 'normal') {
  const easy = difficulty === 'easy';
  let vials = kit.maxVials,
    bombs = kit.bombsPerVial,
    coat = kit.coatMax,
    coatAt = Infinity,
    aliquot = kit.aliquot,
    hits = 0;
  for (let t = 0; hits < 200; t += 6) {
    hits++;
    if (coat < kit.coatMax && t >= coatAt) {
      coat++;
      coatAt = coat < kit.coatMax ? t + kit.coatReform : Infinity;
    }
    if (coat > 0) {
      if (coat === kit.coatMax) coatAt = t + kit.coatReform;
      coat--;
      continue;
    }
    if (easy && bombs > 0) {
      bombs--;
      continue;
    }
    if (kit.epipen && bombs >= 2) {
      bombs -= 2;
      continue;
    }
    vials--;
    if (aliquot && vials > 0) {
      aliquot = false;
      vials++;
    }
    if (vials <= 0) return hits;
    bombs = Math.max(bombs, kit.bombsPerVial);
    // A respawn restores one charge; a second one keeps re-forming.
    if (kit.coatMax && coat < 1) {
      coat = 1;
      coatAt = coat < kit.coatMax ? t + kit.coatReform : Infinity;
    }
  }
  return hits;
}

// ---- Odds -------------------------------------------------------------------------
/** Per-slot tier weights by titer, and the boss slot's legendary weight.
 * The 12-stage table ships with RESEARCH_V1's run; the leaner one is the
 * 18-stage fallback (§4.7). */
export const ODDS = Object.freeze({
  12: Object.freeze({ rows: [[70, 25, 5, 0], [60, 28, 10, 2], [50, 31, 15, 4], [42, 32, 20, 6]], boss: [12, 16] }),
  18: Object.freeze({ rows: [[70, 25, 5, 0], [60, 28, 11, 1], [50, 31, 16, 3], [42, 32, 22, 4]], boss: [8, 14] }),
});
export const oddsFor = (stageCount) => (stageCount <= 12 ? ODDS[12] : ODDS[18]);
/** Boss-slot weights: Legendary = a + b x the share of that boss's cards
 * NEUTRALIZED; Epic takes the rest. */
export const bossRow = (odds, share = 0.5) => {
  const L = odds.boss[0] + odds.boss[1] * Math.max(0, Math.min(1, share));
  return [0, 0, 100 - L, L];
};
/** Incubation (pity): 1.5 x k points leave Common, two thirds to Epic and
 * one third to Legendary (all to Epic at titer 0); Common stays >= 15. */
export function withIncubation(row, k, titer) {
  const w = [...row];
  const moved = Math.max(0, Math.min(1.5 * k, w[0] - 15));
  if (moved <= 0) return w;
  w[0] -= moved;
  if (titer <= 0) w[2] += moved;
  else {
    w[2] += (moved * 2) / 3;
    w[3] += moved / 3;
  }
  return w;
}

/** The draft's own xorshift32: never reads or writes the stage stream. */
export function draftRandom(run) {
  let n = run.rng >>> 0;
  n ^= n << 13;
  n ^= n >>> 17;
  n ^= n << 5;
  run.rng = n >>> 0;
  return run.rng / 4294967296;
}
function roll(run, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = draftRandom(run) * total;
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) continue;
    if ((r -= weights[i]) < 0) return i;
  }
  return weights.findLastIndex((w) => w > 0);
}
const pickOne = (run, list) => list[Math.min(list.length - 1, Math.floor(draftRandom(run) * list.length))];

// ---- Runs and drafts ----------------------------------------------------------------
export const RUN_VERSION = 1;
export const MAX_TOKENS = 3;
/** A fresh run: empty deck, 1 RESAMPLE token, titer 0. */
export function createRun(seed, { inject = false } = {}) {
  return {
    v: RUN_VERSION,
    seed: seed >>> 0,
    rng: ((seed >>> 0) ^ 0x9e3779b9) >>> 0 || 0x9e3779b9,
    inject: !!inject,
    deck: [],
    incubation: 0,
    floor: false,
    tokens: 1,
    titer: 0,
    sequenced: [], // per non-final boss: share of its cards NEUTRALIZED
    offer: null,
    discards: 0,
    drafts: 0,
    resamples: 0,
    input: 'keys',
  };
}

/** Is a card offerable now? ctx: { power (guaranteed entry power of the next
 * stage), difficulty, input ('keys' | 'touch'), stage, titer }. */
export function eligible(run, id, ctx = {}) {
  const c = CARD[id];
  if (!c) return false;
  if (c.inject !== undefined && c.inject !== !!run.inject) return false; // rule 8
  const deck = run.deck;
  if (stacksOf(deck, id) >= c.max) return false; // rule 1
  if (c.needsAb && !(abCount(ctx.power ?? 1) > 0 || has(deck, 'clonal-expansion'))) return false; // rule 2
  if (c.notEasy && ctx.difficulty === 'easy') return false; // rule 3
  if (c.notTouch && (ctx.input ?? run.input) === 'touch') return false; // rule 4
  if (c.damageOnly && kitOf(deck, kitCtx(run, ctx)).atLimit) return false; // rule 5
  if (c.tier === 'legendary' && (linePicks(deck, c.line) < 2 || legendariesIn(deck) >= 2)) return false; // rule 6
  // Rule 7: stat caps.
  if (id === 'extra-dose' || id === 'silicone-plunger' || id === 'lather') {
    const now = kitOf(deck, kitCtx(run, ctx)),
      after = kitOf([...deck, { id, at: 0 }], kitCtx(run, ctx));
    if (id === 'extra-dose' && after.maxVials <= now.maxVials) return false;
    if (id === 'silicone-plunger' && after.speed <= now.speed) return false;
    if (id === 'lather' && after.bombsPerVial <= now.bombsPerVial && after.maxBombs <= now.maxBombs) return false;
  }
  return true;
}
const kitCtx = (run, ctx) => ({ power: ctx.power ?? 1, difficulty: ctx.difficulty ?? 'normal', titer: run.titer, stage: ctx.stage ?? 1 });

/** Roll one offer (§4.2) without changing pity: returns { ids, tiers }. */
function compose(run, ctx, { boosted, share }) {
  const odds = oddsFor(ctx.stageCount ?? 12);
  const set = cardSet(run.inject);
  const pool = set.filter((c) => eligible(run, c.id, ctx));
  const row = odds.rows[Math.min(3, run.titer)];
  const offer = [];
  const tierIndex = (t) => TIERS.indexOf(t);
  const choose = (tier, exclude, { offenseOnly = false } = {}) => {
    for (let t = tier; t >= 0; t--) {
      let list = pool.filter((c) => tierIndex(c.tier) === t && !exclude.includes(c.id));
      if (offer.some((o) => o && CARD[o].tradeoff)) list = list.filter((c) => !c.tradeoff);
      if (offenseOnly) list = list.filter((c) => OFFENSE_LINES.includes(c.line));
      if (!list.length) continue;
      const used = new Set(offer.filter(Boolean).map((o) => CARD[o].line));
      const lines = [...new Set(list.map((c) => c.line))];
      const fresh = lines.filter((l) => !used.has(l));
      const line = pickOne(run, fresh.length ? fresh : lines);
      return pickOne(run, list.filter((c) => c.line === line)).id;
    }
    return null;
  };
  for (let slot = 0; slot < 3; slot++) {
    let weights = boosted && slot === 0 ? bossRow(odds, share) : withIncubation(row, run.incubation, run.titer);
    if (slot === 0 && run.floor) weights = [0, ...weights.slice(1)];
    if (weights.every((w) => w <= 0)) weights = [0, 1, 0, 0];
    const tier = roll(run, weights);
    const id = choose(tier, offer);
    if (id) offer.push(id);
  }
  // At least one offense card, so a player can always add potency.
  if (offer.length && !offer.some((o) => OFFENSE_LINES.includes(CARD[o].line))) {
    const last = offer.length - 1;
    const keep = offer.slice(0, last);
    const tier = tierIndex(CARD[offer[last]].tier);
    const saved = offer.splice(last, 1)[0];
    const id = choose(tier, [...keep, saved], { offenseOnly: true });
    offer.push(id || saved);
  }
  return { ids: offer, tiers: offer.map((o) => CARD[o].tier) };
}
/** Pity bookkeeping from the tiers an offer showed (§4.3). */
function notePity(run, tiers) {
  if (tiers.some((t) => t === 'epic' || t === 'legendary')) run.incubation = 0;
  else run.incubation += tiers.filter((t) => t === 'common').length;
  run.floor = tiers.length > 0 && tiers.every((t) => t === 'common');
}

/** Open the draft after a cleared stage. ctx also carries `stage` (the stage
 * just cleared), `boosted` (after a non-final boss), `share` (sequencing) and
 * `stageCount`. The offer is a pure function of the run seed and history. */
export function openDraft(run, ctx) {
  const boosted = !!ctx.boosted;
  const share = ctx.share ?? 0.5;
  const { ids, tiers } = compose(run, ctx, { boosted, share });
  notePity(run, tiers);
  run.offer = { ids, tiers, stage: ctx.stage ?? 0, boosted, share, resampled: 0 };
  run.drafts++;
  return run.offer;
}
/** RESAMPLE: one token redraws all three slots under the same rules (a
 * boosted draft keeps its boss slot and sequencing odds). */
export function resample(run, ctx) {
  if (!run.offer || run.tokens <= 0) return null;
  run.tokens--;
  run.resamples++;
  const { boosted, share, stage, resampled } = run.offer;
  const { ids, tiers } = compose(run, { ...ctx, stage }, { boosted, share });
  notePity(run, tiers);
  run.offer = { ids, tiers, stage, boosted, share, resampled: resampled + 1 };
  return run.offer;
}
/** INJECT the chosen adjuvant into the deck. Returns the card, or null. */
export function pick(run, index) {
  const id = run.offer?.ids[index];
  if (!id) return null;
  run.deck.push({ id, at: run.offer.stage });
  run.offer = null;
  return CARD[id];
}
/** DISCARD: none of the three; +1 SOAP (the caller applies it) and +3
 * incubation, as if three commons had been shown. */
export function discard(run) {
  if (!run.offer) return false;
  run.offer = null;
  run.discards++;
  run.incubation += 3;
  return true;
}
/** A non-final boss was defeated: the titer rises (permanent odds shift),
 * +1 RESAMPLE token, and one more for a fully sequenced boss (cap 3). */
export function bossCleared(run, share = 0) {
  run.titer = Math.min(3, run.titer + 1);
  run.sequenced.push(share);
  run.tokens = Math.min(MAX_TOKENS, run.tokens + 1 + (share >= 1 ? 1 : 0));
}

/** Validates a stored run (guarded, versioned storage). Returns a clean copy
 * or null; never throws. */
export function reviveRun(data) {
  try {
    if (!data || data.v !== RUN_VERSION || !Array.isArray(data.deck)) return null;
    const run = createRun(data.seed >>> 0, { inject: !!data.inject });
    const ok = (x, lo, hi) => Number.isFinite(x) && x >= lo && x <= hi;
    if (!ok(data.rng, 1, 0xffffffff) || !ok(data.tokens, 0, MAX_TOKENS) || !ok(data.titer, 0, 3) || !ok(data.incubation, 0, 999)) return null;
    for (const d of data.deck) if (!CARD[d?.id] || !ok(d.at, 0, 99)) return null;
    run.deck = data.deck.map((d) => ({ id: d.id, at: d.at }));
    if (run.deck.some((d, i) => stacksOf(run.deck.slice(0, i + 1), d.id) > CARD[d.id].max)) return null;
    Object.assign(run, {
      rng: data.rng >>> 0,
      tokens: data.tokens,
      titer: data.titer,
      incubation: data.incubation,
      floor: !!data.floor,
      sequenced: Array.isArray(data.sequenced) ? data.sequenced.filter((x) => ok(x, 0, 1)) : [],
      discards: ok(data.discards, 0, 99) ? data.discards : 0,
      drafts: ok(data.drafts, 0, 99) ? data.drafts : 0,
      resamples: ok(data.resamples, 0, 99) ? data.resamples : 0,
      input: data.input === 'touch' ? 'touch' : 'keys',
    });
    if (data.offer) {
      const o = data.offer;
      if (!Array.isArray(o.ids) || o.ids.length > 3 || o.ids.some((id) => !CARD[id])) return null;
      run.offer = { ids: [...o.ids], tiers: o.ids.map((id) => CARD[id].tier), stage: o.stage | 0, boosted: !!o.boosted, share: ok(o.share, 0, 1) ? o.share : 0.5, resampled: o.resampled | 0 };
    }
    return run;
  } catch {
    return null;
  }
}

// ---- The draft screen's numbers --------------------------------------------------
const x2 = (v) => `×${v.toFixed(2)}`;
/** NOW -> AFTER lines from the kit diff (the cure for Soy-Milk traps). */
export function previewPick(deck, id, ctx) {
  const now = kitOf(deck, ctx),
    after = kitOf([...deck, { id, at: (ctx.stage ?? 1) - 1 }], ctx);
  const lines = [];
  const nUnit = needleMul(now, { focus: true }),
    aUnit = needleMul(after, { focus: true });
  if (Math.abs(aUnit - nUnit) > 1e-6) lines.push(`NEEDLE DMG ${x2(nUnit)} → ${x2(aUnit)}`);
  if (Math.abs(abMul(after) - abMul(now)) > 1e-6 && antibodiesOf(after) > 0) lines.push(`ANTIBODY DMG ${x2(abMul(now))} → ${x2(abMul(after))}`);
  if (after.fireRate !== now.fireRate) lines.push(`RATE ${num(now.fireRate)} → ${num(after.fireRate)}/S`);
  if (needlesPerVolley(after, true) !== needlesPerVolley(now, true)) lines.push(`NEEDLES ${needlesPerVolley(now, true)} → ${needlesPerVolley(after, true)}`);
  if (antibodiesOf(after) !== antibodiesOf(now)) lines.push(`ANTIBODIES ${antibodiesOf(now)} → ${antibodiesOf(after)}`);
  if (after.speed !== now.speed) lines.push(`SPEED ${num(now.speed)} → ${num(after.speed)} U/S`);
  if (after.maxVials !== now.maxVials) lines.push(`MAX VIALS ${now.maxVials} → ${after.maxVials}`);
  if (after.coatMax !== now.coatMax || after.coatReform !== now.coatReform) lines.push(`COATING ${now.coatMax} → ${after.coatMax}${after.coatReform ? ` · ${num(after.coatReform)} S` : ''}`);
  if (after.maxBombs !== now.maxBombs || after.bombsPerVial !== now.bombsPerVial) lines.push(`SOAP ${now.bombsPerVial}/${now.maxBombs} → ${after.bombsPerVial}/${after.maxBombs}`);
  if (after.grazePerBomb !== now.grazePerBomb) lines.push(`GRAZES/SOAP ${now.grazePerBomb} → ${after.grazePerBomb}`);
  if (after.deathbomb !== now.deathbomb) lines.push(`DEATHBOMB ${num(now.deathbomb)} → ${num(after.deathbomb)} S`);
  lines.push(`POTENCY ${x2(now.potency)} → ${x2(after.potency)}${after.atLimit ? ' MAX' : ''}`);
  return { lines, now, after, synergy: synergyOf(deck, id) };
}

// ---- Expected potency and the reference syringe ------------------------------------
/** The campaign's stage profile the draft simulation needs: for each stage
 * its guaranteed entry power and whether it is a (non-final) boss. */
export function simulateDraft(profile, { seed = 1, policy = 'random', difficulty = 'normal', share = 0.5, inject = false } = {}) {
  const run = createRun(seed, { inject });
  const bot = { rng: (seed ^ 0x2545f491) >>> 0 || 1 };
  const potency = [];
  const shown = [];
  const count = profile.length;
  for (let i = 0; i < count; i++) {
    const st = profile[i];
    potency.push(kitOf(run.deck, { power: st.power, difficulty, titer: run.titer, stage: st.stage }).potency);
    if (st.stage === count) break;
    if (st.boss) bossCleared(run, share);
    const next = profile[i + 1];
    const ctx = { power: next.power, difficulty, stage: st.stage, boosted: !!st.boss, share, stageCount: count };
    const offer = openDraft(run, ctx);
    shown.push([...offer.tiers]);
    const choice = choose(run, offer, policy, { ...ctx, power: next.power, stage: next.stage }, bot);
    if (choice < 0) discard(run);
    else pick(run, choice);
  }
  return { run, potency, shown };
}
const TIER_RANK = { common: 0, rare: 1, epic: 2, legendary: 3 };
/** Drafting policies (RESEARCH_CARDS §5.6). Returns a slot index, or -1 for
 * DISCARD. `favour` (an id) always takes that card when offered. */
export function choose(run, offer, policy, ctx, rng = { rng: (run.seed ^ 0x2545f491) >>> 0 || 1 }) {
  // The bot's own coin (never the run's draft stream, so a bot's choice
  // moves the offers only through the pick itself, as a human's would).
  const coin = () => draftRandom(rng);
  const ids = offer.ids;
  if (!ids.length || policy === 'placebo') return -1;
  if (policy?.favour) {
    const i = ids.indexOf(policy.favour);
    if (i >= 0) return i;
    policy = 'random';
  }
  if (policy === 'random') return Math.floor(coin() * ids.length);
  const kctx = { power: ctx.power, difficulty: ctx.difficulty, titer: run.titer, stage: ctx.stage };
  const score = (id) => {
    const after = kitOf([...run.deck, { id, at: ctx.stage - 1 }], kctx);
    if (policy === 'offense') return after.potency * 100 + TIER_RANK[CARD[id].tier];
    if (policy === 'defense') return hitsEstimate(after, ctx.difficulty) * 100 + after.potency;
    if (policy === 'rarest') return TIER_RANK[CARD[id].tier] * 10 + coin();
    return 0;
  };
  let best = 0,
    bestScore = -Infinity;
  ids.forEach((id, i) => {
    const v = score(id);
    if (v > bestScore + 1e-9) [best, bestScore] = [i, v];
  });
  return best;
}
export const median = (xs) => {
  const a = [...xs].sort((p, q) => p - q);
  return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : 0;
};
export const quantile = (xs, q) => {
  const a = [...xs].sort((p, q2) => p - q2);
  return a.length ? a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))] : 0;
};
/** Median potency per stage of a drafting policy over many seeds. */
export function measurePotency(profile, { seeds = 600, policy = 'random', from = 1, ...opts } = {}) {
  const per = profile.map(() => []);
  for (let i = 0; i < seeds; i++) {
    const { potency } = simulateDraft(profile, { ...opts, seed: from + i * 7919, policy });
    potency.forEach((p, j) => per[j].push(p));
  }
  return per;
}

/** EXPECTED_POTENCY: the random drafter's median potency at each stage entry,
 * measured by `measurePotency` over 2000 seeds on this card set and the
 * campaign's own entry powers (2026-11-10), then frozen; test 10 re-measures
 * it over 500 seeds and fails on a drift over 5%. Keyed by the campaign's
 * stage count: 18 is today's campaign (entry powers 1 1 2 2 2 2 2 3 3 3 3 4
 * ...), 12 is RESEARCH_V1's run with the mRNA fallback order (1 1 2 2 2 3 3
 * 3 4 4 4 4). Enemy HP follows it, never the player's own deck. The dips (18:
 * stage 12, 12: stage 9) are real: the mRNA step to L4 raises the baseline
 * that potency is divided by. */
export const EXPECTED_POTENCY = Object.freeze({
  18: Object.freeze([1, 1, 1.056, 1.09, 1.15, 1.221, 1.285, 1.316, 1.364, 1.44, 1.518, 1.469, 1.531, 1.611, 1.676, 1.741, 1.797, 1.867]),
  12: Object.freeze([1, 1, 1.056, 1.094, 1.15, 1.206, 1.27, 1.329, 1.313, 1.388, 1.449, 1.511]),
});
export const expectedPotency = (stage, stageCount) => {
  const table = EXPECTED_POTENCY[stageCount];
  return table ? table[Math.max(0, Math.min(table.length - 1, stage - 1))] : 1;
};

/** STRONGEST_BUILD (RESEARCH_CARDS §5.4) for RESEARCH_V1's T6: the 11-pick
 * offense deck. It sits at the titer limit at every stage, so the test uses
 * the limit as the upper bound. */
export const STRONGEST_BUILD = Object.freeze(['concentrate', 'concentrate', 'concentrate', 'steady-hand', 'steady-hand', 'rapid-release', 'rapid-release', 'twin-barrel', 'wide-bore', 'glass-syringe', 'jet-injector']);
