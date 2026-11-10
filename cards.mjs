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
  fireRate: 6, // volleys/s (core.mjs fireInterval 1/6)
  abRate: 3, // needles/s per antibody (antibodyInterval 1/3)
  shipSpeed: 11.5,
  focusSpeed: 5,
  pointerSpeed: 11.5,
  deathbomb: 0.18,
  maxBombs: 5,
  grazePerBomb: 100,
  bombBossFraction: 0.03,
  injectReload: 0.5,
  injectReloadElite: 0.8,
  refill: 1, // SOAP per vial refill on Normal (core.mjs DIFFICULTY.normal.refill)
  refillEasy: 3,
  sprayStep: 4.25, // degrees between SPRAY needles (core.mjs sprayAngle)
});

/** Hard caps (RESEARCH_CARDS §5.2, RESEARCH_DIFFICULTY §7.1), applied in
 * kitOf and in play whatever the deck. */
export const CAPS = Object.freeze({
  needleBonus: 0.7, // all needle damage sources together, FEVER included
  abBonus: 0.7,
  // Volleys/s: even a maxed build (BOOSTER SHOT included) fires at the old
  // base rate, never above (the owner's lower-fire-rate request).
  fireRate: 8,
  focusNeedles: 6,
  sprayNeedles: 7,
  antibodies: 4,
  abRate: 6, // needles/s per antibody
  maxSpeed: 12.9, // crossing the 17.8 u box in >= 1.38 s, over the 1.2 s floor
  vialsOver: 2, // max vials <= base + 2
  minVials: 2,
  maxBombs: 6,
  deathbomb: 0.26,
  coatCharges: 2,
  minGrazePerBomb: 60,
  projectiles: 120, // player needles + split + innate + antigen alive at once
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
/** Six lines of five, each a build identity and a verb (RESEARCH_DIFFICULTY
 * §7.2): NEEDLE Marksman (focus), INJECT Medic (inject), ANTIBODY Escort
 * (positioning), EXPOSURE Dancer (graze), SOAP Cleaner (bomb), DOSE Survivor. */
export const LINES = Object.freeze(['NEEDLE', 'INJECT', 'ANTIBODY', 'EXPOSURE', 'SOAP', 'DOSE']);
export const LINE_IDENTITY = Object.freeze({ NEEDLE: 'MARKSMAN', INJECT: 'MEDIC', ANTIBODY: 'ESCORT', EXPOSURE: 'DANCER', SOAP: 'CLEANER', DOSE: 'SURVIVOR' });
const OFFENSE_LINES = ['NEEDLE', 'ANTIBODY'];
/** The sector rule each sector card answers (offered once on entering it). */
export const SECTOR_CARD = Object.freeze({ 2: 'tidal-volume', 3: 'streamline', 4: 'proofreading' });

const pct = (x) => `${Math.round(Math.abs(x) * 100)}%`;
const num = (x) => String(Math.round(x * 100) / 100);

/** The 30 adjuvants (RESEARCH_DIFFICULTY §7.3). Data shape, read by the 3D
 * draft: `id, name, label (<= 16, the cartridge's first line), tier, line,
 * tags, stat (<= 18, its second line), kind ('verb' changes a decision,
 * 'stat' numbers only), fx`, plus `costLabel` (the short pink third line) on
 * trade-offs and `sector` on the three sector cards. Flags:
 *   damageOnly  single-target damage only: not offered at the titer limit
 *   needsAb     needs antibodies at the next stage (or CLONAL EXPANSION)
 *   notEasy     auto-SOAP makes it nearly dead on Easy
 *   notTouch    touch maps the finger 1:1, so speed does nothing
 *   tradeoff    at most one per offer; has a COST line
 * `text(fx, next)` is the effect sentence for the copy `next` (1-based). */
const DEFS = [
  // NEEDLE · MARKSMAN: hold focus, line up, pierce the stack.
  { n: 1, id: 'steady-hand', name: 'STEADY HAND', tier: 'common', line: 'NEEDLE', tags: ['Focus'], kind: 'verb', max: 1, damageOnly: true, stat: 'FOCUS 0.6 S → +35%', fx: { hold: 0.6, bonus: 0.35, spacing: 0.08 }, text: (f) => `Hold focus ${f.hold} s: the stream locks to one line and needles deal +${pct(f.bonus)} until you release.` },
  { n: 2, id: 'twin-barrel', name: 'TWIN BARREL', tier: 'rare', line: 'NEEDLE', tags: ['Needle', 'Spread'], kind: 'verb', max: 1, stat: '+1 NEEDLE', fx: { needles: 1 }, text: (f) => `+${f.needles} needle per volley (focus: parallel ${0.25} u; spray: the next ±${BASE.sprayStep}° step).` },
  { n: 3, id: 'hollow-bore', name: 'HOLLOW BORE', tier: 'rare', line: 'NEEDLE', tags: ['Pierce'], kind: 'verb', max: 1, stat: 'PIERCE · 60%', fx: { pierce: 0.6 }, text: (f) => `Needles pass the first virus and hit a second for ${pct(f.pierce)}.` },
  { n: 4, id: 'split-tip', name: 'SPLIT TIP', tier: 'epic', line: 'NEEDLE', tags: ['Spread'], kind: 'verb', max: 1, stat: 'KILL → SPLIT ×2', fx: { splitAngle: 25 }, text: (f) => `A needle that kills splits into 2 at ±${f.splitAngle}° (at most ${CAPS.splitAlive} alive).` },
  { n: 5, id: 'jet-injector', name: 'JET INJECTOR', tier: 'legendary', line: 'NEEDLE', tags: ['Needle', 'Pierce', 'Focus'], kind: 'verb', max: 1, stat: 'FOCUS → JET', fx: { jet: 1.25, jetWidth: 0.5 }, text: (f) => `In focus a ${num(f.jetWidth)} u jet replaces the needles: hits all it touches at ${num(f.jet)}× DPS.` },
  // INJECT · MEDIC: dive in on a telegraph, cure, back out.
  { n: 6, id: 'booster-shot', name: 'BOOSTER SHOT', tier: 'common', line: 'INJECT', tags: ['Inject', 'Rate'], kind: 'verb', max: 1, stat: 'CURE → +2/S · 2 S', fx: { rate: 2, time: 2 }, text: (f) => `Each cure: +${f.rate} volleys/s for ${f.time} s (refreshes; never above ${CAPS.fireRate}/s).` },
  { n: 7, id: 'retractable-needle', name: 'RETRACTABLE NEEDLE', label: 'RETRACTABLE', tier: 'common', line: 'INJECT', tags: ['Inject'], kind: 'stat', max: 1, stat: 'RELOAD 0.3 S', fx: { reload: 0.3, reloadElite: 0.5 }, text: (f) => `INJECT reloads in ${f.reload} s (elites ${f.reloadElite} s), was ${BASE.injectReload} / ${BASE.injectReloadElite} s.` },
  { n: 8, id: 'proofreading', name: 'PROOFREADING', tier: 'rare', line: 'INJECT', tags: ['Inject', 'Mutation'], kind: 'verb', max: 1, sector: 4, stat: 'TELL CURE → RELOAD', fx: {}, text: () => 'Curing a virus during its telegraph (inhale, aim lock, MUTATION flash) reloads INJECT at once.' },
  { n: 9, id: 'antigen-memory', name: 'ANTIGEN MEMORY', tier: 'epic', line: 'INJECT', tags: ['Inject', 'Homing'], kind: 'verb', max: 1, stat: 'ANTIGEN → NEEDLES', fx: { max: 6, range: 10, mult: 1 }, text: (f) => `A cure's antigen (the body and its live bullets) fly as needles at the nearest virus within ${f.range} u (max ${f.max}); they still score.` },
  { n: 10, id: 'mass-vaccination', name: 'MASS VACCINATION', tier: 'legendary', line: 'INJECT', tags: ['Inject', 'Wave'], kind: 'verb', max: 1, stat: '4 CURES → WAVE', fx: { cures: 4, window: 6, radius: 3, boss: 0.02, cooldown: 6 }, text: (f) => `${f.cures} cures within ${f.window} s release a ${f.radius} u cure wave: popcorn cured, bullets to antigen, boss parts −${pct(f.boss)} of the card.` },
  // ANTIBODY · ESCORT: your antibodies hunt while you dodge.
  { n: 11, id: 'fc-receptor', name: 'FC RECEPTOR', tier: 'common', line: 'ANTIBODY', tags: ['Antibody', 'Homing'], kind: 'verb', max: 1, needsAb: true, stat: 'ANTIBODIES FOLLOW', fx: { arc: 30, range: 12 }, text: (f) => `Antibodies aim at the last virus your needles hit (±${f.arc}°, within ${f.range} u).` },
  { n: 12, id: 'clonal-expansion', name: 'CLONAL EXPANSION', tier: 'rare', line: 'ANTIBODY', tags: ['Antibody'], kind: 'stat', max: 1, stat: '+2 ANTIBODIES', fx: { now: 2, abAt4: 0.2 }, text: (f) => `+${f.now} antibodies now (from L1), 4 from L3. At L4: +${pct(f.abAt4)} antibody damage.` },
  { n: 13, id: 'affinity-maturation', name: 'AFFINITY MATURATION', label: 'AFFINITY', tier: 'rare', line: 'ANTIBODY', tags: ['Antibody', 'Scaling'], kind: 'verb', max: 1, needsAb: true, damageOnly: true, stat: '+5% / CLEAN SAMPLE', fx: { perSample: 0.05, cap: 0.4 }, text: (f) => `Antibodies +${pct(f.perSample)} per sample cleared without losing a vial from now on (max +${pct(f.cap)}).` },
  { n: 14, id: 'opsonin-tag', name: 'OPSONIN TAG', tier: 'epic', line: 'ANTIBODY', tags: ['Antibody'], kind: 'verb', max: 1, needsAb: true, damageOnly: true, stat: 'TAG → +15%', fx: { tag: 0.15, tagTime: 2 }, text: (f) => `Antibody hits tag a virus for ${f.tagTime} s: +${pct(f.tag)} damage from every source.` },
  { n: 15, id: 'herd-immunity', name: 'HERD IMMUNITY', tier: 'legendary', line: 'ANTIBODY', tags: ['Antibody', 'Homing'], kind: 'verb', max: 1, needsAb: true, stat: 'ANTIBODIES HUNT', fx: { aim: 9, arc: 60, abRate: 0.5 }, text: (f) => `Antibodies home on the nearest virus within ${f.aim} u (±${f.arc}°) and fire ${pct(f.abRate)} faster.` },
  // EXPOSURE · DANCER: live inside the graze ring.
  { n: 16, id: 'hormesis', name: 'HORMESIS', tier: 'common', line: 'EXPOSURE', tags: ['Graze', 'Needle'], kind: 'verb', max: 1, damageOnly: true, stat: 'GRAZE → +2% (≤20%)', fx: { per: 0.02, time: 2, cap: 0.2 }, text: (f) => `Each graze: needles +${pct(f.per)} for ${f.time} s, stacking to +${pct(f.cap)}.` },
  { n: 17, id: 'tidal-volume', name: 'TIDAL VOLUME', tier: 'common', line: 'EXPOSURE', tags: ['Graze', 'Breath'], kind: 'verb', max: 1, sector: 2, stat: 'FAST GRAZE ×2', fx: { speed: 6, count: 2 }, text: (f) => `Grazing a bullet moving faster than ${f.speed} u/s counts as ${f.count} grazes. BREATH's exhale pushes most bullets over it.` },
  { n: 18, id: 'live-culture', name: 'LIVE CULTURE', tier: 'rare', line: 'EXPOSURE', tags: ['Graze', 'Needle', 'Trade-off'], kind: 'verb', max: 1, tradeoff: true, stat: 'RING BUSY → +25%', costLabel: 'COST −10% EMPTY', fx: { on: 0.25, off: -0.1 }, text: (f) => `Needles +${pct(f.on)} while a bullet is inside your graze ring.`, cost: (f) => `COST: −${pct(f.off)} while it is empty.` },
  { n: 19, id: 'fever', name: 'FEVER', tier: 'epic', line: 'EXPOSURE', tags: ['Graze', 'Pierce'], kind: 'verb', max: 1, stat: '40 GRAZES → FEVER', fx: { every: 40, time: 5, needle: 0.2 }, text: (f) => `Every ${f.every}th graze: ${f.time} s of FEVER, needles +${pct(f.needle)} and pierce one.` },
  { n: 20, id: 'innate-response', name: 'INNATE RESPONSE', tier: 'legendary', line: 'EXPOSURE', tags: ['Graze', 'Homing'], kind: 'verb', max: 1, stat: 'GRAZE → NEEDLE', fx: { range: 12, mult: 2, cap: 10 }, text: (f) => `Each graze fires a ${f.mult}× needle at the nearest virus within ${f.range} u (max ${f.cap}/s).` },
  // SOAP · CLEANER: reset the screen on your terms.
  { n: 21, id: 'lather', name: 'LATHER', tier: 'common', line: 'SOAP', tags: ['SOAP'], kind: 'stat', max: 2, stat: '+1 SOAP / REFILL', fx: { soapNow: 1, refill: 1, cap: 1 }, text: (f, next) => (next >= 2 ? `+${f.soapNow} SOAP now, and the SOAP cap rises to ${BASE.maxBombs + f.cap}.` : `+${f.soapNow} SOAP now; each vial refill gives ${BASE.refill + f.refill} SOAP (was ${BASE.refill}).`) },
  { n: 22, id: 'micelle', name: 'MICELLE', tier: 'common', line: 'SOAP', tags: ['SOAP', 'Graze'], kind: 'verb', max: 1, stat: 'SOAP → +GRAZE', fx: { graze: 1, pull: 3 }, text: (f) => `Your SOAP pulls its antigen tokens into the syringe; each adds ${f.graze} graze toward the next SOAP.` },
  { n: 23, id: 'epipen', name: 'EPIPEN', tier: 'rare', line: 'SOAP', tags: ['SOAP', 'Shield'], kind: 'verb', max: 1, notEasy: true, stat: 'HIT → SPEND 2 SOAP', fx: { cost: 2 }, text: (f) => `A hit with ${f.cost}+ SOAP in stock spends ${f.cost} and saves the vial.` },
  { n: 24, id: 'foam', name: 'FOAM', tier: 'epic', line: 'SOAP', tags: ['SOAP'], kind: 'verb', max: 1, stat: 'SOAP → FOAM 2.5 S', fx: { radius: 5, time: 2.5 }, text: (f) => `SOAP leaves a ${f.radius} u foam for ${f.time} s that turns bullets into antigen.` },
  { n: 25, id: 'autoclave', name: 'AUTOCLAVE', tier: 'legendary', line: 'SOAP', tags: ['SOAP'], kind: 'verb', max: 1, stat: '+1 SOAP / 20 S', fx: { every: 20, refund: 30 }, text: (f) => `+1 SOAP every ${f.every} s of play; a SOAP that clears ${f.refund}+ bullets refunds itself.` },
  // DOSE · SURVIVOR: take a hit and keep the run.
  { n: 26, id: 'extra-dose', name: 'EXTRA DOSE', tier: 'common', line: 'DOSE', tags: ['Vial'], kind: 'stat', max: 2, stat: '+1 VIAL', fx: { vials: 1 }, text: (f) => `+${f.vials} max vial, filled now.` },
  { n: 27, id: 'streamline', name: 'STREAMLINE', tier: 'common', line: 'DOSE', tags: ['Motion', 'Current'], kind: 'verb', max: 1, notTouch: true, sector: 3, stat: 'KEEP MOVING → +10%', fx: { hold: 0.4, speed: 0.1, current: 0.15 }, text: (f) => `Moving the same way for ${f.hold} s: +${pct(f.speed)} speed, +${pct(f.current)} with the CURRENT (focus unchanged).` },
  { n: 28, id: 'enteric-coating', name: 'ENTERIC COATING', tier: 'rare', line: 'DOSE', tags: ['Shield'], kind: 'verb', max: 2, stat: 'COATING · 1 HIT', fx: { reform: 30, invuln: 1 }, text: (f, next) => (next >= 2 ? `The coating now holds 2 hits (re-forms ${f.reform} s after it breaks).` : `A coating absorbs one core hit and re-forms ${f.reform} s after it breaks.`) },
  { n: 29, id: 'glass-syringe', name: 'GLASS SYRINGE', tier: 'rare', line: 'DOSE', tags: ['Needle', 'Vial', 'Trade-off'], kind: 'stat', max: 1, tradeoff: true, stat: '+35% DAMAGE', costLabel: 'COST −1 VIAL', fx: { needle: 0.35, ab: 0.35, vials: -1 }, text: (f) => `Needles and antibodies +${pct(f.needle)}.`, cost: (f) => `COST: −${Math.abs(f.vials)} max vial (never below ${CAPS.minVials}).` },
  { n: 30, id: 'backup-aliquot', name: 'BACKUP ALIQUOT', tier: 'epic', line: 'DOSE', tags: ['Vial'], kind: 'verb', max: 1, stat: 'CATCH LOST VIAL', fx: { catchTime: 3 }, text: (f) => `Once per sample a lost vial drops as an aliquot: catch it within ${f.catchTime} s to refill.` },
];
for (const d of DEFS) {
  d.label ??= d.name;
  Object.freeze(d.fx);
  Object.freeze(d.tags);
  Object.freeze(d);
}
export const ALL_CARDS = Object.freeze(DEFS);
export const CARD = Object.freeze(Object.fromEntries(DEFS.map((d) => [d.id, d])));
/** The 30-card set. INJECT ships, so the ANTIGEN HARVEST fallback is gone;
 * the argument is kept for old callers. */
export const cardSet = () => ALL_CARDS;

/** Effect sentence and cost for the copy `next` (1-based) of a card. */
export function cardText(id, next = 1) {
  const c = CARD[id];
  return c ? c.text(c.fx, next) : '';
}
export const cardCost = (id) => (CARD[id]?.cost ? CARD[id].cost(CARD[id].fx) : '');

/** Synergies printed on the draft when a pick completes a pair (§7.3). */
export const SYNERGIES = Object.freeze([
  ['steady-hand', 'jet-injector'],
  ['hollow-bore', 'fever'],
  ['split-tip', 'opsonin-tag'],
  ['booster-shot', 'proofreading'],
  ['retractable-needle', 'mass-vaccination'],
  ['antigen-memory', 'micelle'],
  ['hormesis', 'live-culture'],
  ['tidal-volume', 'fever'],
  ['fc-receptor', 'opsonin-tag'],
  ['clonal-expansion', 'herd-immunity'],
  ['lather', 'epipen'],
  ['micelle', 'autoclave'],
  ['enteric-coating', 'backup-aliquot'],
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

/** The mRNA ladder (RESEARCH_DIFFICULTY 3.2): needles per volley in focus
 * and spray, and antibody options (model.optionOffsets), at L1-L4. Each step
 * doubles the visible stream early: 6 / 12 / 24 / 36 focused DPS. */
export const abCount = (power) => (power >= 4 ? 4 : power >= 3 ? 2 : 0);
export const focusCount = (power) => Math.max(1, Math.min(4, power | 0));
export const sprayCount = (power) => (power >= 4 ? 5 : Math.max(1, power | 0));

/** The syringe's modifier set for a deck.
 * ctx: { power (mRNA level now), difficulty ('normal' | 'easy' | 'hard'), titer,
 *        stage, clean (samples cleared without a lost vial since AFFINITY
 *        MATURATION was taken), scale (STANDARD ISSUE damage multiplier,
 *        practice only) }.
 * Every field the model reads for a player stat lives here; with an empty
 * deck and scale 1 every value equals core.mjs RULES (asserted by test).
 * Dynamic effects (STEADY HAND's lock, HORMESIS, BOOSTER SHOT, STREAMLINE)
 * are flags here and resolved in play (model.mjs, syringe-kit.mjs). */
export function kitOf(deck = [], { power = 1, difficulty = 'normal', titer = 0, stage = 1, clean = 0, scale = 1 } = {}) {
  const n = (id) => stacksOf(deck, id);
  const easy = difficulty === 'easy';
  const baseVials = easy ? 5 : 3;
  // HARD (core.mjs DIFFICULTY.hard): a lost vial refills no SOAP and the
  // deathbomb window is 0.12 s, shorter than any reaction.
  const hard = difficulty === 'hard';
  const baseRefill = easy ? BASE.refillEasy : hard ? 0 : BASE.refill;
  const retract = has(deck, 'retractable-needle');
  const k = {
    power,
    cards: deck.length,
    active: deck.length > 0 || scale !== 1,
    // Damage buckets (bonuses add; caps apply at use, since the lock, FEVER,
    // HORMESIS and the graze ring are dynamic).
    needleBonus: CARD['glass-syringe'].fx.needle * n('glass-syringe'),
    steady: has(deck, 'steady-hand'),
    hormesis: has(deck, 'hormesis'),
    liveCulture: has(deck, 'live-culture'),
    fever: has(deck, 'fever'),
    abBonus: CARD['glass-syringe'].fx.ab * n('glass-syringe'),
    potencyScale: 1, // the titer limit (set below)
    scale, // STANDARD ISSUE (practice) or 1
    fireRate: Math.min(CAPS.fireRate, BASE.fireRate),
    booster: has(deck, 'booster-shot'),
    twin: has(deck, 'twin-barrel'),
    pierce: has(deck, 'hollow-bore') ? CARD['hollow-bore'].fx.pierce : 0,
    split: has(deck, 'split-tip'),
    jet: has(deck, 'jet-injector'),
    clonal: has(deck, 'clonal-expansion'),
    fc: has(deck, 'fc-receptor'),
    tag: has(deck, 'opsonin-tag'),
    herd: has(deck, 'herd-immunity'),
    abRate: Math.min(CAPS.abRate, BASE.abRate * (has(deck, 'herd-immunity') ? 1 + CARD['herd-immunity'].fx.abRate : 1)),
    speed: BASE.shipSpeed,
    focusSpeed: BASE.focusSpeed,
    pointerSpeed: BASE.pointerSpeed,
    streamline: has(deck, 'streamline'),
    maxVials: 0,
    coatMax: 0,
    coatReform: 0,
    aliquot: has(deck, 'backup-aliquot'),
    bombsPerVial: baseRefill + (n('lather') >= 1 ? CARD.lather.fx.refill : 0),
    maxBombs: Math.min(CAPS.maxBombs, BASE.maxBombs + (n('lather') >= 2 ? CARD.lather.fx.cap : 0)),
    soapDamage: 1,
    bombBossFraction: BASE.bombBossFraction,
    deathbomb: easy ? 0.35 : hard ? 0.12 : BASE.deathbomb,
    epipen: !easy && has(deck, 'epipen'),
    foam: has(deck, 'foam'),
    autoclave: has(deck, 'autoclave'),
    micelle: has(deck, 'micelle'),
    grazePerBomb: BASE.grazePerBomb,
    innate: has(deck, 'innate-response'),
    tidal: has(deck, 'tidal-volume'),
    // INJECT reloads (s); RETRACTABLE NEEDLE 0.3 / 0.5.
    injectReload: retract ? CARD['retractable-needle'].fx.reload : BASE.injectReload,
    injectReloadElite: retract ? CARD['retractable-needle'].fx.reloadElite : BASE.injectReloadElite,
    proofreading: has(deck, 'proofreading'),
    antigenMemory: has(deck, 'antigen-memory'),
    massVax: has(deck, 'mass-vaccination'),
  };
  // CLONAL EXPANSION: 2 antibodies from L1, 4 from L3; +20% at L4.
  k.abPower = k.clonal ? (power >= 3 ? 4 : 3) : power;
  if (k.clonal && power >= 4) k.abBonus += CARD['clonal-expansion'].fx.abAt4;
  // AFFINITY MATURATION: +5% per clean sample since the pick (max +40%).
  if (has(deck, 'affinity-maturation')) k.abBonus += Math.min(CARD['affinity-maturation'].fx.cap, CARD['affinity-maturation'].fx.perSample * Math.max(0, clean));
  // Vials: base + EXTRA DOSE - GLASS, never below 2 and never over base + 2.
  k.maxVials = Math.max(CAPS.minVials, Math.min(baseVials + CAPS.vialsOver, baseVials + n('extra-dose') - n('glass-syringe')));
  // Coating: ENTERIC holds 1 hit, a second copy 2; it re-forms 30 s after it breaks.
  const enteric = n('enteric-coating');
  if (enteric) {
    k.coatMax = Math.min(CAPS.coatCharges, enteric);
    k.coatReform = CARD['enteric-coating'].fx.reform;
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
  // Spray potency: the same deck's unfocused formation DPS over the base
  // kit's, under the same titer scale (it is one damage multiplier in play).
  k.sprayPotency = (sprayDpsOf(k) / baseSprayDps(power)) * k.potencyScale;
  return Object.freeze(k);
}

/** Needle damage multiplier at a moment of play: focus with STEADY HAND's
 * lock, the graze ring (LIVE CULTURE), FEVER and HORMESIS stacks. */
export function needleMul(kit, { focus = false, locked = false, ringBusy = false, fever = false, hormesis = 0 } = {}) {
  let bonus = kit.needleBonus + (focus && locked && kit.steady ? CARD['steady-hand'].fx.bonus : 0) + (kit.hormesis ? Math.min(CARD.hormesis.fx.cap, hormesis) : 0);
  if (kit.liveCulture) bonus += ringBusy ? CARD['live-culture'].fx.on : CARD['live-culture'].fx.off;
  if (fever) bonus += CARD.fever.fx.needle;
  return (1 + Math.min(CAPS.needleBonus, bonus)) * kit.potencyScale * kit.scale;
}
export const abMul = (kit) => (1 + kit.abBonus) * kit.potencyScale * kit.scale;
export const needlesPerVolley = (kit, focus) => (focus ? Math.min(CAPS.focusNeedles, focusCount(kit.power) + (kit.twin ? 1 : 0)) : Math.min(CAPS.sprayNeedles, sprayCount(kit.power) + (kit.twin ? 1 : 0)));
export const antibodiesOf = (kit) => Math.min(CAPS.antibodies, abCount(kit.abPower));
/** Volleys/s now: BOOSTER SHOT adds +2 for 2 s after a cure, under the cap. */
export const fireRateNow = (kit, boosted = false) => Math.min(CAPS.fireRate, kit.fireRate + (boosted && kit.booster ? CARD['booster-shot'].fx.rate : 0));

/** Pricing conventions for the dynamic cards (RESEARCH_DIFFICULTY §7.4); the
 * whole-run harness (tests/difficulty.mjs) judges them. */
export const CONVENTIONS = Object.freeze({
  steadyUptime: 0.6, // STEADY HAND's lock held 60% of boss time
  grazesPerSecond: 1.5, // HORMESIS stacks: 1.5 x 2 s = 3 active
  curesPerSecond: 0.4, // a casual medic (BOOSTER SHOT, ANTIGEN MEMORY)
  antigenPerCure: 2, // the cured body plus about one live bullet
  waveEvery: 15, // MASS VACCINATION: one wave per 15 s
  waveHp: 9, // about 3 popcorn of 3 base HP per wave
  ringOccupancy: 0.5, // LIVE CULTURE
  feverUptime: 0.2,
  innateGrazes: 1, // INNATE RESPONSE: 1 graze/s
  cleanShare: 0.5, // AFFINITY MATURATION: half the samples clean
});
const C_ = CONVENTIONS;
const unitOf = (k, { focus }) => {
  const lc = k.liveCulture ? C_.ringOccupancy * CARD['live-culture'].fx.on + (1 - C_.ringOccupancy) * CARD['live-culture'].fx.off : 0;
  const fv = k.fever ? C_.feverUptime * CARD.fever.fx.needle : 0;
  const steady = focus && k.steady ? C_.steadyUptime * CARD['steady-hand'].fx.bonus : 0;
  const horm = k.hormesis ? Math.min(CARD.hormesis.fx.cap, C_.grazesPerSecond * CARD.hormesis.fx.time * CARD.hormesis.fx.per) : 0;
  return 1 + Math.min(CAPS.needleBonus, k.needleBonus + lc + fv + steady + horm);
};
/** Sustained single-target DPS of a focused syringe on a boss-sized target
 * with every needle hitting (§5.1), before the titer clamp. INJECT never
 * reaches a boss body, so the INJECT line is priced on the spray model only.
 * Multi-target value is not counted. */
function dpsOf(k) {
  const unit = unitOf(k, { focus: true });
  let needles = k.fireRate * needlesPerVolley(k, true) * unit;
  if (k.jet) needles *= CARD['jet-injector'].fx.jet;
  const abs = antibodiesOf(k) * k.abRate * (1 + k.abBonus);
  const innate = k.innate ? C_.innateGrazes * CARD['innate-response'].fx.mult * unit : 0;
  return (needles + abs + innate) * (k.tag && antibodiesOf(k) > 0 ? 1 + CARD['opsonin-tag'].fx.tag : 1);
}
const baseDps = (power) => BASE.fireRate * focusCount(power) + abCount(power) * BASE.abRate;
function rawPotency(k) {
  return dpsOf(k) / baseDps(k.power);
}

/** Formation conventions for the spray model (sprayDpsOf). A popcorn
 * formation is several rows deep, so a needle that passes through its first
 * virus finds a second one about half the time (FORMATION_DEPTH). A WILD TYPE
 * takes 3 needles at S1 (levels.mjs ARCHETYPES.wild.hp), so one needle in 3
 * kills (KILL_SHARE), and a split needle at +/-25 degrees in a formation
 * lands about half the time (SPLIT_LANDS). */
const FORMATION_DEPTH = 0.5;
const KILL_SHARE = 1 / 3;
const SPLIT_LANDS = 0.5;
/** Sustained DPS of an UNFOCUSED syringe into a popcorn formation, before the
 * titer clamp: every SPRAY needle finds a virus, STEADY HAND and the jet do
 * nothing (focus-only), HOLLOW BORE and FEVER's pierce reach a second row,
 * SPLIT TIP re-fires on kills, the INJECT line adds its cure conventions,
 * and antibodies and INNATE count as in dpsOf. Formation HP is authored, so
 * this figure only reports how much faster a deck clears popcorn. */
function sprayDpsOf(k) {
  const unit = unitOf(k, { focus: false });
  const pierce = 1 + FORMATION_DEPTH * (k.pierce + (k.fever ? 0.2 : 0));
  const split = k.split ? 1 + 2 * SPLIT_LANDS * KILL_SHARE : 1;
  const boostUptime = k.booster ? 1 - Math.exp(-C_.curesPerSecond * CARD['booster-shot'].fx.time) : 0;
  const rate = k.fireRate + boostUptime * (fireRateNow(k, true) - k.fireRate);
  const needles = rate * needlesPerVolley(k, false) * unit * pierce * split;
  const abs = antibodiesOf(k) * k.abRate * (1 + k.abBonus);
  const innate = k.innate ? C_.innateGrazes * CARD['innate-response'].fx.mult * unit : 0;
  const antigen = k.antigenMemory ? C_.curesPerSecond * Math.min(CARD['antigen-memory'].fx.max, C_.antigenPerCure) * unit : 0;
  const wave = k.massVax ? C_.waveHp / C_.waveEvery : 0;
  return (needles + abs + innate + antigen + wave) * (k.tag && antibodiesOf(k) > 0 ? 1 + CARD['opsonin-tag'].fx.tag : 1);
}
const baseSprayDps = (power) => BASE.fireRate * sprayCount(power) + abCount(power) * BASE.abRate;
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
  const deck = run.deck;
  if (stacksOf(deck, id) >= c.max) return false; // rule 1
  if (c.needsAb && !(abCount(ctx.power ?? 1) > 0 || has(deck, 'clonal-expansion'))) return false; // rule 2
  if (c.notEasy && ctx.difficulty === 'easy') return false; // rule 3
  if (c.notTouch && (ctx.input ?? run.input) === 'touch') return false; // rule 4
  if (c.damageOnly && kitOf(deck, kitCtx(run, ctx)).atLimit) return false; // rule 5
  if (c.tier === 'legendary' && (linePicks(deck, c.line) < 2 || legendariesIn(deck) >= 2)) return false; // rule 6
  // Rule 7: stat caps.
  if (id === 'extra-dose' || id === 'lather') {
    const now = kitOf(deck, kitCtx(run, ctx)),
      after = kitOf([...deck, { id, at: 0 }], kitCtx(run, ctx));
    if (id === 'extra-dose' && after.maxVials <= now.maxVials) return false;
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
  // Entering a sector with a rule, slot 3's line diversity yields once (50%)
  // to that sector's card if it is not owned (RESEARCH_DIFFICULTY §7.4). It
  // takes the last slot that is not the offer's only offense card.
  const sectorCard = SECTOR_CARD[ctx.enterSector];
  if (sectorCard && offer.length === 3 && !offer.includes(sectorCard) && pool.some((c) => c.id === sectorCard) && draftRandom(run) < 0.5) {
    const offense = (ids) => ids.some((o) => OFFENSE_LINES.includes(CARD[o].line));
    const slot = [2, 1, 0].find((i) => offense(offer.filter((_, j) => j !== i)));
    if (slot !== undefined) offer[slot] = sectorCard;
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
  // Focus with STEADY HAND's lock held: the number a marksman plays at.
  const nUnit = needleMul(now, { focus: true, locked: true }),
    aUnit = needleMul(after, { focus: true, locked: true });
  const aBusy = needleMul(after, { focus: true, locked: true, ringBusy: true });
  // LIVE CULTURE: both ring states, so the cost is never hidden.
  if (after.liveCulture && Math.abs(aBusy - aUnit) > 1e-6) lines.push(`NEEDLE DMG ${x2(nUnit)} → ${x2(aBusy)} RING · ${x2(aUnit)} EMPTY`);
  else if (Math.abs(aUnit - nUnit) > 1e-6) lines.push(`NEEDLE DMG ${x2(nUnit)} → ${x2(aUnit)}`);
  if (Math.abs(abMul(after) - abMul(now)) > 1e-6 && antibodiesOf(after) > 0) lines.push(`ANTIBODY DMG ${x2(abMul(now))} → ${x2(abMul(after))}`);
  if (after.fireRate !== now.fireRate) lines.push(`RATE ${num(now.fireRate)} → ${num(after.fireRate)}/S`);
  if (needlesPerVolley(after, true) !== needlesPerVolley(now, true)) lines.push(`NEEDLES ${needlesPerVolley(now, true)} → ${needlesPerVolley(after, true)}`);
  if (antibodiesOf(after) !== antibodiesOf(now)) lines.push(`ANTIBODIES ${antibodiesOf(now)} → ${antibodiesOf(after)}`);
  if (after.speed !== now.speed) lines.push(`SPEED ${num(now.speed)} → ${num(after.speed)} U/S`);
  if (after.maxVials !== now.maxVials) lines.push(`MAX VIALS ${now.maxVials} → ${after.maxVials}`);
  if (after.coatMax !== now.coatMax || after.coatReform !== now.coatReform) lines.push(`COATING ${now.coatMax} → ${after.coatMax}${after.coatReform ? ` · ${num(after.coatReform)} S` : ''}`);
  if (after.maxBombs !== now.maxBombs || after.bombsPerVial !== now.bombsPerVial) lines.push(`SOAP ${now.bombsPerVial}/${now.maxBombs} → ${after.bombsPerVial}/${after.maxBombs}`);
  if (after.injectReload !== now.injectReload) lines.push(`RELOAD ${num(now.injectReload)} → ${num(after.injectReload)} S`);
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
  const spray = [];
  const shown = [];
  const count = profile.length;
  for (let i = 0; i < count; i++) {
    const st = profile[i];
    const kit = kitOf(run.deck, { power: st.power, difficulty, titer: run.titer, stage: st.stage, clean: cleanOf(run.deck, st.stage) });
    potency.push(kit.potency);
    spray.push(kit.sprayPotency);
    if (st.stage === count) break;
    if (st.boss) bossCleared(run, share);
    const next = profile[i + 1];
    const ctx = { power: next.power, difficulty, stage: st.stage, boosted: !!st.boss, share, stageCount: count, enterSector: st.boss ? next.world ?? 0 : 0 };
    const offer = openDraft(run, ctx);
    shown.push([...offer.tiers]);
    const choice = choose(run, offer, policy, { ...ctx, power: next.power, stage: next.stage }, bot);
    if (choice < 0) discard(run);
    else pick(run, choice);
  }
  return { run, potency, spray, shown };
}
/** AFFINITY MATURATION's clean-sample count for pricing: CONVENTIONS.cleanShare
 * of the samples cleared since the pick (the model counts the real ones). */
const cleanOf = (deck, stage) => {
  const aff = deck.find((d) => d.id === 'affinity-maturation');
  return aff ? Math.floor(Math.max(0, stage - 1 - aff.at) * CONVENTIONS.cleanShare) : 0;
};
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
  const kctx = { power: ctx.power, difficulty: ctx.difficulty, titer: run.titer, stage: ctx.stage, clean: cleanOf(run.deck, ctx.stage) };
  const score = (id) => {
    const after = kitOf([...run.deck, { id, at: ctx.stage - 1 }], kctx);
    if (policy === 'offense') return after.potency * 100 + TIER_RANK[CARD[id].tier];
    if (policy === 'defense') return hitsEstimate(after, ctx.difficulty) * 100 + after.potency;
    if (policy === 'rarest') return TIER_RANK[CARD[id].tier] * 10 + coin();
    // Line synergy (the expert proxy, RESEARCH_DIFFICULTY §2.1): build one
    // line toward its capstone, then rarer, then more potent.
    if (policy === 'synergy') {
      const c = CARD[id];
      return linePicks(run.deck, c.line) * 4 + (synergyOf(run.deck, id) ? 3 : 0) + TIER_RANK[c.tier] + (after.potency - kitOf(run.deck, kctx).potency) * 10;
    }
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
/** Potency per stage of a drafting policy over many seeds (take the median
 * per stage). `field: 'spray'` measures the spray potency instead. */
export function measurePotency(profile, { seeds = 600, policy = 'random', from = 1, field = 'potency', ...opts } = {}) {
  const per = profile.map(() => []);
  for (let i = 0; i < seeds; i++) {
    const sim = simulateDraft(profile, { ...opts, seed: from + i * 7919, policy });
    sim[field].forEach((p, j) => per[j].push(p));
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
  // Re-measured 2026-11-10 on the revision-six card set and mRNA ladder
  // (RESEARCH_DIFFICULTY D4): 2000 seeds, entry powers 1 1 2 2 2 3 3 3 4 4 4 4.
  12: Object.freeze([1, 1, 1.21, 1.21, 1.27, 1.214, 1.25, 1.331, 1.257, 1.342, 1.375, 1.418]),
});
export const expectedPotency = (stage, stageCount) => {
  const table = EXPECTED_POTENCY[stageCount];
  return table ? table[Math.max(0, Math.min(table.length - 1, stage - 1))] : 1;
};

/** STRONGEST_BUILD (RESEARCH_CARDS §5.4) for RESEARCH_V1's T6: the 11-pick
 * offense deck. It sits at the titer limit at every stage, so the test uses
 * the limit as the upper bound. */
export const STRONGEST_BUILD = Object.freeze(['steady-hand', 'twin-barrel', 'hollow-bore', 'glass-syringe', 'hormesis', 'live-culture', 'clonal-expansion', 'opsonin-tag', 'fever', 'jet-injector', 'herd-immunity']);
