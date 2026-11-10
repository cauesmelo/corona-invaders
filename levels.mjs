/** The v1.0 run (RESEARCH_V1.md 2): 4 sectors x 3 stages, a zoom into the
 * body under the lab's microscope. Each sector is two samples (the second
 * ends in a midboss) and a boss; its twist runs on every stage of it. Each
 * stage introduces exactly one idea in four beats: introduce safely,
 * develop, twist, test, separated by rests of 2-3 s with at most 3 bullets
 * alive. Runtime, tests (tests/suite.test.mjs, tests/suite-audit.mjs) and the
 * documentation all read these definitions.
 *
 * A stage is a script of steps run in order:
 *   { group }    a formation grid (enters from the back, never descends
 *                past z = -4)
 *   { flight }   enemies flying a drawn Bezier path that cross and exit; an
 *                enemy that exits counts as escaped for the R0 meter
 *   { worms }    RNA WORMs weaving across the top, then exiting
 *   { puffs }    AEROSOL PUFFs drifting slowly across
 *   { vesicle }  a lipid bubble carrying a guaranteed mRNA supply
 *   { midboss }  a 1-3 card midboss (bosses.mjs)
 *   { surge }    for a few seconds the choir fires twice as often
 *   { verse }    what the formation choir sings: 'rain' (straight-down
 *                droplets: static lanes), 'cough' (aimed) or 'alternate'
 *   { tune }     per-archetype attack overrides for the following beats
 *   { mutation } MUTATION timing ({ flash, every }) for the following beats
 *   { hint }     a one-time PROTOCOL line (UI)
 *   { wait }     seconds; { until: 'thin', left } / { until: 'clear' }
 * A stage clears when its script has ended and nothing hostile is left.
 *
 * Formation row codes (back row first):
 *   m mini WILD TYPE   W WILD TYPE   N SNEEZER   D DROPLET   K HEAVY CROWN
 *   B BLOOM            (retired from the run, kept for v1.1 and tests:
 *   U BUDDER, H HIJACKER, C INFECTED CELL)
 */
import { RULES } from './core.mjs';
import { expectedPotency } from './cards.mjs';

/** Sectors, one magnification step deeper each (RESEARCH_V1.md 5.1). `note`
 * is the FIELD NOTE shown after the sector's boss; `music` the arrangement
 * of the original march; `zoom` the microscope magnification. */
export const PROLOGUE = 'SPECIMEN RECEIVED: AIRWAY. WILD-TYPE REPLICATION CONFIRMED. DISPATCH ONE SYRINGE.';
export const WORLDS = Object.freeze(
  [
    { id: 1, name: 'AIRWAY', site: 'TRACHEA', zoom: 40, theme: 'airway', backdrop: 'trachea', music: 'airway', twist: null, boss: 'alpha', note: 'ALPHA NEUTRALIZED. DESCENDANTS DETECTED DEEPER: ALVEOLAR TISSUE. EXPECT TWINS.', assessment: 'AIRWAY LINING CLEARED.' },
    { id: 2, name: 'LUNGS', site: 'ALVEOLI', zoom: 400, theme: 'lungs', backdrop: 'alveoli', music: 'lungs', twist: 'breath', boss: 'betagamma', note: 'VIRAL LOAD IN CIRCULATION. VARIANT DELTA IS TRAVELLING WITH THE FLOW.', assessment: 'BREATHING TISSUE STABILISED.' },
    { id: 3, name: 'BLOODSTREAM', site: 'CAPILLARY', zoom: 4000, theme: 'blood', backdrop: 'capillary', music: 'blood', twist: 'current', boss: 'delta', note: 'SOURCE LOCATED: A REPLICATION FACTORY INSIDE ONE CELL. COPY ERRORS RISING.', assessment: 'CIRCULATION FILTERED.' },
    { id: 4, name: 'THE CELL', site: 'CYTOPLASM', zoom: 40000, theme: 'cell', backdrop: 'cytoplasm', music: 'cell', twist: 'mutation', boss: 'omicron', note: 'OMICRON PRIME NEUTRALIZED. R0 < 1. SPECIMEN CONTAINED. REPORT FILED.', assessment: 'REPLICATION HALTED.' },
  ].map((w) => Object.freeze(w)),
);
export const SECTORS = WORLDS;

/** Archetypes: one job, one bullet family, one personality telegraph each.
 * HP is on the bullet-hell scale (the reference syringe deals ~24 effective
 * DPS) and scales through stageHp. `attack` is an emitter preset from
 * patterns.mjs; `byWorld` upgrades it per sector (more bullets, a second
 * speed tier, never a new rule). Speeds follow RESEARCH_V1.md 2.3: static
 * fields <= 5 u/s, aimed fans <= 7, aimed singles and stacks up to the
 * sector's maximum. */
export const ARCHETYPES = Object.freeze({
  mini: { label: 'WILD TYPE', hp: 1, radius: 0.42, score: 50, attack: { preset: 'cough', params: { n: 1, speed: 5.5 } } },
  // The choir's grunt. Sector 3-4 coughs are stacks (one line, 2-3 speeds).
  wild: { label: 'WILD TYPE', hp: 3, radius: 0.6, score: 100, attack: { preset: 'cough', params: { n: 1, speed: 5.5 } }, byWorld: { 2: { n: 2, speed: 6.5 }, 3: { n: 2, speed: 7.5 }, 4: { n: 3, speed: 8 } } },
  // Inhales (the crown bristles for 0.8-1.0 s), then sneezes an odd fan whose
  // centre points at you: tap sideways out of it.
  // Sector 1's fan tops out at 4.6 u/s: novices (the first-timer proxy never
  // holds focus) lost most of their 1-2 vials to faster second tiers.
  sneezer: { label: 'SNEEZER', hp: 10, radius: 0.8, score: 300, attack: { preset: 'sneeze', params: { n: 7, spread: 56, speeds: [4, 4.6], tele: 1 } }, byWorld: { 2: { speeds: [4, 5.5], tele: 0.8 }, 3: { n: 9, speeds: [4, 5.5] }, 4: { n: 9, speeds: [4, 5.5, 7] } } },
  // Retired from the v1.0 run (its virions live on in MOTHER CELL's BUDDING).
  budder: { label: 'BUDDER', hp: 8, radius: 0.62, half: 0.28, score: 250, attack: { preset: 'cough', params: { n: 1, speed: 6.5 } }, byWorld: { 3: { n: 2 }, 4: { n: 3, spread: 20 } } },
  // Weaves across the top leaving an RNA bead trail, then an aimed RNA STRAND
  // (you stream: move steadily and turn at the edge). Debuts in sector 2.
  // A helix tube crossing sideways: a capsule along x (radius 0.38, half 0.9).
  worm: { label: 'RNA WORM', hp: 4, radius: 0.38, half: 0.9, score: 150, attack: { preset: 'strand', params: { n: 8, speed: 4.8, interval: 0.13, amp: 0.8, wavelength: 5 } }, byWorld: { 3: { n: 10 }, 4: { n: 12, amp: 1.1 } } },
  // A ring of tiny virions that mists slow random droplets (on the exhale
  // only, in the lungs).
  puff: { label: 'AEROSOL PUFF', hp: 10, radius: 0.9, score: 300, attack: { preset: 'aerosol', params: { rate: 5, cone: 100, speed: [2.5, 4], duration: 1.5 } }, byWorld: { 3: { rate: 6 }, 4: { rate: 6 } } },
  // Draws its dashed path for 0.8 s, dives, and splashes into a ring.
  droplet: { label: 'DROPLET', hp: 4, radius: 0.55, score: 200, attack: { preset: 'ring', params: { n: 6, speed: 3.6, family: 'droplet' } }, byWorld: { 4: { n: 8 } } },
  // Retired from the v1.0 run: its "kill the converter first" lesson is
  // MUTATION's flash. Kept for v1.1 (RESEARCH_V1.md 6).
  hijacker: { label: 'HIJACKER', hp: 6, radius: 0.55, score: 250, attack: null },
  // Retired from the v1.0 run (waits for v1.1).
  cell: { label: 'INFECTED CELL', hp: 6, radius: 0.8, score: 150, attack: null },
  // Elite, and MUTATION's product: fat spikes that break off as it loses HP.
  heavy: { label: 'HEAVY CROWN', hp: 14, radius: 0.85, score: 500, attack: { preset: 'cough', params: { n: 3, speed: 8, family: 'spike' } } },
  // Invulnerable while closed (INJECT pierces it); opens for 1.5 s, firing a ring.
  // HP 7 (was 16): the reactive referee only hits it while open, so a 16 HP
  // bud field stalled 4-2 for two minutes; INJECT is the fast answer.
  bloom: { label: 'BLOOM', hp: 7, radius: 0.85, score: 450, attack: { preset: 'ring', params: { n: 16, speed: 4.1, family: 'spike' } } },
  // Drifts across the back carrying a supply; never fires. HP 12 (was 20):
  // one needle at 6/s pops it in 2 s of hits as it crosses.
  vesicle: { label: 'VESICLE', hp: 12, radius: 0.75, score: 800, attack: null },
  // Harmless practice target (score-attack extras, v1.1).
  virion: { label: 'VIRION', hp: 1, radius: 0.5, score: 100, attack: null },
});
/** INJECT classes (RESEARCH_V1.md 5.4): popcorn is cured on touch whatever
 * its HP; elites take 10 x stageHp; everything else (bosses) is elite too. */
export const ELITES = Object.freeze(new Set(['heavy', 'bloom', 'vesicle']));
/** An archetype's attack in a sector: later sectors upgrade the same shape;
 * `tune` (a script step) adjusts it for the following beats. */
export function attackFor(kind, world = 1, tune = null) {
  const a = ARCHETYPES[kind];
  if (!a?.attack) return null;
  let params = { ...a.attack.params };
  for (let w = 2; w <= world; w++) if (a.byWorld?.[w]) params = { ...params, ...a.byWorld[w] };
  if (tune?.[kind]) params = { ...params, ...tune[kind] };
  return { preset: a.attack.preset, params };
}
export const CODE_KIND = Object.freeze({ m: 'mini', W: 'wild', N: 'sneezer', U: 'budder', D: 'droplet', H: 'hijacker', C: 'cell', K: 'heavy', B: 'bloom' });

/** Sample a cubic Bezier into a polyline. */
function bezier([p0, p1, p2, p3], steps = 28) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return Object.freeze(out.map((p) => Object.freeze(p)));
}
const mirror = (pts) => pts.map(([x, z]) => [-x, z]);
// Hostile flight paths enter from behind the back rim and exit at a side,
// never dipping below z = -1 (the top of the syringe's box is z = -3).
const SWOOP = [[-8.2, -14.5], [-7, -1], [6, -2], [11, -9]];
const ARC = [[-11, -6], [-4, -1.5], [4, -1.5], [11, -6]];
const DROP = [[-3, -14.5], [-3, -3], [5, -4], [11.5, -10]];
// LOW: a slow pass across the top of the box (z about -1.9 at its lowest),
// inside the needle's reach from the top rows: 1-1's INJECT beat.
const LOW = [[-11, -5.5], [-5, -0.6], [5, -0.6], [11, -5.5]];
const PATHS = Object.freeze({
  swoopL: bezier(SWOOP),
  swoopR: bezier(mirror(SWOOP)),
  arcL: bezier(ARC),
  arcR: bezier(mirror(ARC)),
  dropL: bezier(DROP),
  dropR: bezier(mirror(DROP)),
  lowL: bezier(LOW),
  lowR: bezier(mirror(LOW)),
});

const grid = (rows, o = {}) => ({ group: { rows, spacing: 2.3, rowGap: 1.9, z: -11.2, sway: 1.1, frequency: 0.7, descent: 0.22, ...o } });
const fly = (path, kind = 'wild', count = 6, o = {}) => ({ flight: { path, kind, count, interval: 0.32, speed: 6.5, fire: { preset: 'cough', params: { n: 1, speed: 5.5 }, at: 0.42 }, ...o } });
const until = (what, left = 0) => ({ until: what, left });
// A surge gives a beat its peak: for a few seconds the choir fires ~2x as
// often with one more singer (still inside the stage bullet cap).
const surge = (seconds) => ({ surge: seconds });
const wait = (seconds) => ({ wait: seconds });
const verse = (kind) => ({ verse: kind });
const tune = (o) => ({ tune: o });
const hint = (id) => ({ hint: id });
// A rest between beats: the board empties, the last bullets leave, then
// 2.5 s with at most 3 alive (RESEARCH_V1.md 2.2: rests of 2-3 s).
const rest = (seconds = 2.5) => [until('clear'), until('calm'), wait(seconds)];

/** Per-sector pressure. `choir`: seconds between formation volleys (slow when
 * the grid is full, fast when it thins) and how many front members sing
 * together. `maxBullets`: the stage cap for non-boss emitters. `rain`: the
 * straight-down verse's speed (static lanes, <= 5 u/s). */
const S1 = { world: 1, choir: { interval: [1.8, 1.2], size: [2, 3] }, maxBullets: 40, rain: 4.5 };
const S2 = { world: 2, choir: { interval: [1.45, 1], size: [3, 4] }, maxBullets: 60, rain: 4.5 };
const S3 = { world: 3, choir: { interval: [1.15, 0.8], size: [3, 5] }, maxBullets: 85, rain: 5 };
const S4 = { world: 4, choir: { interval: [0.95, 0.65], size: [4, 6] }, maxBullets: 110, rain: 5 };

/** `introduces`: the archetypes, twists and boss-only ideas first seen in
 * this stage (tests/suite.test.mjs T2). `intro`: the lab voice (<= 60
 * characters, no exclamation marks). `protocol`: the stage's instruction. */
export const LEVELS = Object.freeze(
  [
    {
      ...S1,
      code: '1-1',
      name: 'FIRST CONTACT',
      kind: 'sample',
      introduces: ['mini', 'wild', 'rain', 'inject'],
      intro: { icon: 'wild', text: 'ONLY THE GLOWING DOSE CAN BE HIT. THE NEEDLE CURES.' },
      protocol: 'READ THE LANES. SIDESTEP THE AIMED COUGHS.',
      // The calm start (RESEARCH_DIFFICULTY 4.3): choir cadence x1.2, the
      // first aimed coughs at 5.0 u/s, and the grid marches 0.3 u after 4 s
      // without a kill.
      choir: { interval: [2.28, 1.56], size: [1, 1] },
      march: 4,
      maxBullets: 25,
      silence: 3,
      script: [
        tune({ mini: { speed: 5 }, wild: { speed: 5 } }),
        // Introduce (0-15 s): the original game's 4 x 15 grid of 60 mini
        // coronas, 3 s of silence, then RAIN: straight-down droplets, static
        // lanes 1.18 u apart that the formation's sway slides sideways.
        verse('rain'),
        grid(Array(4).fill('mmmmmmmmmmmmmmm'), { spacing: 1.18, rowGap: 1.3, z: -12.6, sway: 0.5, frequency: 0.55, descent: 0.12 }),
        wait(8),
        // One needle at 6/s sweeps the grid in about 12-16 s; after 25 s
        // the survivors retreat (a cap, never a wall).
        { ...until('thin', 24), cap: 25 },
        // Develop (about 17-35 s): WILD TYPEs add aimed single coughs (the aim
        // locks at the telegraph); the rain continues, about half and half.
        verse('alternate'),
        grid(['W.W.W.W'], { z: -7.4 }),
        wait(5),
        grid(['.W.W.W.', 'W.W.W.W'], { z: -12.4, x: 0 }),
        wait(5),
        until('thin', 4),
        ...rest(),
        // Twist (about 37-52 s): two slow, low flights cross the top of the
        // box within the needle's reach. Touch one with the needle: INJECT.
        hint('inject'),
        verse('rain'),
        grid(['m.m.m.m.m.m.m.m'], { spacing: 1.18, z: -10.5 }),
        fly('lowL', 'wild', 2, { speed: 3.4, interval: 1, fire: null }),
        wait(6),
        fly('lowR', 'wild', 2, { speed: 3.4, interval: 1, fire: null }),
        wait(6),
        verse('alternate'),
        ...rest(),
        // Test (about 54-75 s): a 7 + 7 WILD TYPE grid with up to three
        // singers, plus a flight; a second grid joins half a column over.
        grid(['WWWWWWW', 'WWWWWWW']),
        wait(6),
        fly('arcL', 'wild', 4),
        wait(4),
        grid(['W.W.W.W.W'], { z: -12.8, spacing: 2, x: 0 }),
        surge(4),
        until('thin', 2),
        fly('arcR', 'wild', 4),
        until('clear'),
      ],
    },
    {
      ...S1,
      code: '1-2',
      name: 'GESUNDHEIT',
      kind: 'sample',
      introduces: ['sneezer', 'vesicle', 'bigsneezer'],
      intro: { icon: 'sneezer', text: 'THE ODD FAN AIMS ITS CENTRE AT YOU. TAP SIDEWAYS.' },
      protocol: 'HOLD SHIFT TO FOCUS INSIDE A LANE.',
      maxBullets: 42,
      // The first quiz, gentler for novices (RESEARCH_DIFFICULTY 4.2-4.4):
      // choir cadence x1.2 and bullet counts x0.85.
      choir: { interval: [2.16, 1.5], size: [1, 2] },
      pressure: { count: 0.85 },
      script: [
        // Introduce: a lone SNEEZER behind a thin WILD TYPE row (raining, a
        // known idea); one slow tier.
        tune({ sneezer: { speeds: [4] } }),
        verse('rain'),
        grid(['...N...', 'W.W.W.W'], { spacing: 2.3 }),
        wait(6),
        grid(['.W.W.W.'], { z: -12.6 }),
        until('clear'),
        wait(2),
        // Develop: two SNEEZERs alternate, tiers 4.0 / 5.0, over the WILD
        // TYPEs' rain; the first VESICLE.
        tune({}),
        grid(['.N...N.', 'WWWWWWW']),
        { vesicle: { dir: 1 } },
        wait(7),
        grid(['W.W.W.W'], { z: -12.8 }),
        until('thin', 1),
        ...rest(),
        // Twist: SNEEZERs over mini RAIN; the fan's centre lands between
        // lanes, so you focus inside a lane. Lanes 2.36 u apart (was 1.18:
        // the first-timer proxy, who never holds focus, lost 41 vials here).
        grid(['N.....N', 'm.m.m.m.m.m.m'], { spacing: 1.18, rowGap: 1.6 }),
        wait(5),
        surge(3),
        grid(['...N...', 'm.m.m.m.m.m.m'], { spacing: 1.18, rowGap: 1.4, z: -12.8 }),
        wait(5),
        verse('alternate'),
        ...rest(),
        // Test: the midboss BIG SNEEZER (ACHOO).
        { midboss: 'bigsneezer' },
        until('clear'),
      ],
    },
    {
      ...S1,
      code: '1-3',
      name: 'ALPHA',
      kind: 'boss',
      boss: 'alpha',
      introduces: ['alpha'],
      pressure: { count: 0.85 },
      heal: false,
      intro: { icon: 'boss', text: 'NAMED CARDS. NEUTRALIZE EACH BEFORE ITS TIMER.' },
      protocol: 'NO HIT AND NO SOAP SEQUENCES A CARD.',
    },
    {
      ...S2,
      code: '2-1',
      name: 'DEEP BREATH',
      kind: 'sample',
      introduces: ['breath', 'puff'],
      intro: { icon: 'breath', text: 'BULLETS SLOW ON THE INHALE AND RUSH ON THE EXHALE.' },
      protocol: 'COMMIT ON THE INHALE.',
      maxBullets: 52,
      // The LUNGS opener sits between 1-2 and ALPHA: a slower choir and aimed
      // coughs x0.92 (6.0 u/s before the exhale's x1.3).
      choir: { interval: [2.0, 1.45], size: [2, 3] },
      pressure: { aimed: 0.92 },
      script: [
        // Introduce: a known grid, slow aimed coughs and rain, two full breaths.
        tune({ wild: { n: 1, speed: 5.5 } }),
        grid(['W.W.W.W', '.W.W.W.']),
        wait(6),
        grid(['WWWWWWW'], { z: -12.8 }),
        until('thin', 2),
        ...rest(),
        // Develop: a SNEEZER pair over rain; fans released on the inhale
        // bunch, then rush.
        tune({}),
        verse('rain'),
        grid(['.N...N.', 'WWWWWWW']),
        wait(7),
        grid(['W.W.N.W.W'], { z: -12.8, spacing: 2 }),
        until('thin', 1),
        ...rest(),
        // Twist: puffs drift in and mist only on the exhale (random fire,
        // used sparingly).
        grid(['W.W.W.W', '.W.W.W.']),
        { puffs: [{ x: -11, z: -6.5, vx: 1.1 }, { x: 11, z: -8, vx: -1.1 }] },
        wait(8),
        ...rest(),
        // Test: puffs, SNEEZERs and a grid, with a surge on one exhale.
        verse('alternate'),
        grid(['N.W.W.N', 'WWWWWWW']),
        { puffs: [{ x: -11, z: -7, vx: 1 }] },
        wait(6.5),
        surge(4),
        grid(['W.W.W.W'], { z: -12.8 }),
        until('clear'),
      ],
    },
    {
      ...S2,
      code: '2-2',
      name: 'GAS EXCHANGE',
      kind: 'sample',
      introduces: ['worm', 'aerosolcloud'],
      intro: { icon: 'worm', text: 'RNA WORMS LAY AIMED STRANDS. STREAM, DO NOT STOP.' },
      protocol: 'MOVE STEADILY. TURN AT THE EDGE.',
      choir: { interval: [1.25, 0.9], size: [3, 5] },
      script: [
        // Introduce: one worm crossing the top, thread drawn; nothing else fires.
        { worms: { count: 1, z: -8.5, dir: 1 } },
        wait(4.5),
        { worms: { count: 1, z: -9.5, dir: -1 } },
        until('clear'),
        wait(2),
        // Develop: two worms crossing in opposite directions, plus rain.
        verse('rain'),
        grid(['W.W.W.W', '.W.W.W.']),
        { worms: { count: 1, z: -8.5, dir: 1 } },
        wait(3),
        { worms: { count: 1, z: -9.5, dir: -1 } },
        wait(4),
        grid(['WWWWWWW'], { z: -12.8 }),
        { worms: { count: 1, z: -9, dir: 1 } },
        ...rest(),
        grid(['W.W.N.W.W'], { z: -12.8, spacing: 2 }),
        { worms: { count: 1, z: -8.5, dir: -1 } },
        verse('alternate'),
        ...rest(),
        // Twist: strands launched on the exhale, with a SNEEZER.
        grid(['...N...', 'WWWWWWW']),
        { worms: { count: 2, z: -9, dir: 1, exhale: true } },
        wait(6),
        { worms: { count: 2, z: -8.5, dir: -1, exhale: true } },
        ...rest(),
        // Test: the midboss AEROSOL CLOUD (MIST) recalls 2-1's mist.
        { midboss: 'aerosolcloud' },
        until('clear'),
      ],
    },
    {
      ...S2,
      code: '2-3',
      name: 'BETA & GAMMA',
      kind: 'boss',
      boss: 'betagamma',
      introduces: ['betagamma'],
      heal: false,
      pressure: { every: 0.8 },
      intro: { icon: 'boss', text: 'TWINS SHARE ONE LOAD. ONLY THE GLOWING TWIN TAKES DAMAGE.' },
      protocol: 'HIT THE GLOWING NUCLEUS.',
    },
    {
      ...S3,
      code: '3-1',
      name: 'CIRCULATION',
      kind: 'sample',
      introduces: ['current'],
      intro: { icon: 'current', text: 'CURRENT CARRIES EVERY BULLET. IT FLIPS ON A WARNING.' },
      protocol: 'DODGE DOWNSTREAM.',
      maxBullets: 95,
      // The opener sits below B&G and DELTA (RESEARCH_DIFFICULTY 4.2): a
      // slightly slower choir than the rest of the sector while the flow is new.
      choir: { interval: [1.0, 0.75], size: [3, 5] },
      script: [
        // Introduce: rain under the current; the lanes lean and stay readable.
        verse('rain'),
        grid(['W.W.W.W', '.W.W.W.']),
        wait(6),
        grid(['WWWWWWW'], { z: -12.8 }),
        until('thin', 2),
        ...rest(),
        // Develop: aimed coughs drift; the second VESICLE of the run.
        verse('alternate'),
        grid(['W.N.N.W', 'WWWWWWW']),
        { vesicle: { dir: -1 } },
        wait(7),
        grid(['.W.W.W.W.', 'W.W.W.W.W'], { z: -12.8, spacing: 2 }),
        until('thin', 2),
        ...rest(),
        // Twist: the flow flips mid-surge (at 30 s), and a worm streams across it.
        grid(['.N.N.N.', 'WWWWWWW']),
        wait(4),
        surge(6),
        { worms: { count: 1, z: -9, dir: 1 } },
        wait(4),
        grid(['W.W.W.W'], { z: -12.8 }),
        ...rest(),
        // Test: a mixed grid (WILD, SNEEZER, puffs) with flights.
        grid(['N.W.W.N', 'WWWWWWW']),
        { puffs: [{ x: 11, z: -7, vx: -1 }] },
        wait(4),
        fly('swoopL', 'wild', 4),
        wait(4),
        fly('swoopR', 'wild', 4),
        until('clear'),
      ],
    },
    {
      ...S3,
      code: '3-2',
      name: 'SPLASHDOWN',
      kind: 'sample',
      introduces: ['droplet', 'lambda'],
      // LAMBDA's quiz cadence x0.7.
      pressure: { every: 0.7 },
      intro: { icon: 'droplet', text: 'DROPLETS DIVE AND SPLASH INTO A RING. SHOOT FIRST.' },
      protocol: 'A DASHED PATH MEANS A DIVE.',
      maxBullets: 95,
      choir: { interval: [0.75, 0.52], size: [4, 6] },
      script: [
        // Introduce: single droplets from a sparse grid, long telegraph.
        { dive: { telegraph: 1.2 } },
        grid(['D.W.W.D', '.W.W.W.']),
        wait(6),
        grid(['W.W.W.W'], { z: -12.8 }),
        until('clear'),
        wait(2),
        // Develop: droplet dives under choir coughs.
        { dive: { telegraph: 0.8 } },
        grid(['D.D.D.D', 'WWWWWWW']),
        until('thin', 3),
        ...rest(),
        // Twist: a droplet lands upstream; its splash ring drifts onto you.
        grid(['D.N.N.D', 'WWWWWWW']),
        wait(4),
        surge(5),
        ...rest(),
        // Test: the midboss LAMBDA, moved before DELTA (a safe preview of
        // DELTA's LANE SNEEZE).
        { midboss: 'lambda' },
        until('clear'),
      ],
    },
    {
      ...S3,
      code: '3-3',
      name: 'DELTA',
      kind: 'boss',
      boss: 'delta',
      introduces: ['delta'],
      // The BLOODSTREAM exam: boss cadence x0.85; the lane jets and BLOOD
      // RUSH's walls keep their authored cadence. x0.55-0.65 measured forced
      // hits (F1) on the casual and expert proxies.
      pressure: { every: 0.85 },
      intro: { icon: 'boss', text: 'IT SPLITS. LANES GLOW BEFORE THEY FIRE.' },
      protocol: 'READ THE LANE, THEN THE HALVES.',
    },
    {
      ...S4,
      code: '4-1',
      name: 'COPY ERROR',
      kind: 'sample',
      introduces: ['mutation', 'heavy'],
      intro: { icon: 'mutation', text: 'A FLASH MEANS AN UPGRADE. CURE IT FIRST.' },
      protocol: 'A FLASHING WILD TYPE BECOMES A HEAVY CROWN.',
      maxBullets: 115,
      choir: { interval: [0.85, 0.6], size: [4, 6] },
      script: [
        // Introduce: one mutation at a time (1.2 s flash) on a sparse grid;
        // the HEAVY CROWN it produces fires slowly.
        { mutation: { flash: 1.2, every: 4.5 } },
        tune({ heavy: { speed: 6 } }),
        verse('rain'),
        grid(['W.W.W.W', '.W.W.W.']),
        wait(6),
        grid(['W.W.W.W'], { z: -12.8 }),
        until('clear'),
        wait(2),
        // Develop: a mutation every 3.2 s on a fuller grid; spike stacks at 8.
        { mutation: { flash: 0.8, every: 3.2 } },
        tune({}),
        grid(['WWWWWWW', 'W.W.W.W']),
        until('thin', 2),
        ...rest(),
        grid(['.W.W.W.', 'W.W.W.W'], { z: -12.8 }),
        until('thin', 1),
        ...rest(),
        // Twist: a SNEEZER mutates into a 9-way, 3-tier fan (misdirection),
        // over rain.
        verse('rain'),
        grid(['N.....N', 'WWWWWWW']),
        wait(5),
        surge(4),
        ...rest(),
        // Test: a dense mixed grid with flights.
        grid(['N.W.W.N', 'WWWWWWW']),
        wait(5),
        fly('swoopR', 'wild', 5),
        wait(4),
        fly('swoopL', 'wild', 5),
        until('thin', 3),
        grid(['W.N.N.W', 'WWWWWWW'], { z: -12.8 }),
        until('clear'),
      ],
    },
    {
      ...S4,
      code: '4-2',
      name: 'FULL BLOOM',
      kind: 'sample',
      introduces: ['bloom', 'mother'],
      intro: { icon: 'bloom', text: 'BLOOMS OPEN, FIRE A RING, CLOSE. WAIT, OR INJECT.' },
      protocol: 'THE NEEDLE PIERCES A CLOSED BUD.',
      maxBullets: 125,
      choir: { interval: [0.8, 0.55], size: [4, 6] },
      // MOTHER CELL's quiz cadence x0.9.
      pressure: { every: 0.9 },
      script: [
        // Introduce: one bloom alone, a small slow ring (B2's safe intro).
        tune({ bloom: { n: 10, speed: 3.5 } }),
        grid(['...B...'], { z: -9 }),
        wait(5),
        grid(['W.W.W.W'], { z: -12.8 }),
        until('clear'),
        wait(2),
        // Develop: a bloom field with a coughing grid (the rings are static).
        tune({}),
        verse('cough'),
        grid(['N..B..N', 'WWWWWWW']),
        wait(6),
        until('thin', 1),
        ...rest(),
        // Twist: blooms mutate, and their rings upgrade.
        grid(['B.....B', 'WWWWWWW', 'W.N.N.W']),
        wait(5),
        surge(4),
        ...rest(),
        // Test: the midboss MOTHER CELL: BUDDING, LYSIS, CELL BURST.
        verse('alternate'),
        { midboss: 'mother' },
        until('clear'),
      ],
    },
    {
      ...S4,
      code: '4-3',
      name: 'OMICRON PRIME',
      kind: 'boss',
      boss: 'omicron',
      introduces: ['omicron'],
      // The run's exam: boss cadence x0.55.
      pressure: { every: 0.55 },
      intro: { icon: 'boss', text: 'ITS MUTATIONS ARE ITS PHASES. CHOOSE A NODE.' },
      protocol: 'R0 BELOW 1 CONTAINS THE SPECIMEN.',
    },
  ].map((level, index) => {
    const world = WORLDS[level.world - 1];
    return Object.freeze({
      ...level,
      id: index + 1,
      // The twist runs on every stage of its sector, bosses included.
      twist: world.twist,
      worldEnd: level.kind === 'boss',
    });
  }),
);

export { PATHS };
export const STAGE_COUNT = LEVELS.length;
export function getLevel(stage) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, stage - 1))];
}
export const getWorld = (stage) => WORLDS[getLevel(stage).world - 1];

/** mRNA strands needed for power levels 1-4 (RESEARCH_CARDS.md 2.8, A5 kept):
 * L2 by 1-2, L3 by 2-2, L4 by 3-2, from the midbosses and VESICLEs. */
export const POWER_STEPS = Object.freeze([0, 1, 3, 5]);
export const powerOf = (mrna) => POWER_STEPS.filter((t) => mrna >= t).length;
/** Guaranteed power on arrival: every VESICLE and midboss mRNA earlier in
 * the run, converted through POWER_STEPS. */
export function entryPower(stage) {
  let n = 0;
  for (const level of LEVELS.slice(0, stage - 1)) for (const st of level.script || []) if (st.vesicle || st.midboss) n++;
  return powerOf(n);
}
/** Guaranteed power when a stage's boss or midboss arrives: the entry power
 * plus this stage's own VESICLEs (they all come before its midboss), so BIG
 * SNEEZER is priced at L2, the level the 1-2 VESICLE hands out. */
export function bossPower(stage) {
  const own = (getLevel(stage).script || []).filter((st) => st.vesicle).length;
  let n = own;
  for (const level of LEVELS.slice(0, stage - 1)) for (const st of level.script || []) if (st.vesicle || st.midboss) n++;
  return powerOf(n);
}
/** The median focused DPS a stage's boss cards are priced against
 * (RESEARCH_DIFFICULTY 3.5): the guaranteed mRNA power's DPS x, with the
 * ADJUVANT draft on (`s.drafts`), the random drafter's median potency at that
 * stage (cards.mjs EXPECTED_POTENCY, measured). It never reads the player's
 * own deck. */
export function stageDps(stage, s = null) {
  return RULES.powerDps[bossPower(stage) - 1] * (s?.drafts ? expectedPotency(stage, STAGE_COUNT) : 1);
}
/** Boss and midboss card DPS: the median DPS x the sector's card uptime u. */
export const cardDps = (stage, s = null) => stageDps(stage, s) * RULES.cardUptime[getLevel(stage).world - 1];
/** Popcorn toughness is authored, never deck-scaled (RESEARCH_DIFFICULTY
 * 3.5): base HP (or base damage defined against HP: SOAP, cell pops, INJECT
 * on elites) x the sector factor 1.0 / 1.4 / 1.9 / 2.4. Callers round and
 * floor at 1. Patterns never scale with the player either. */
export const stageHp = (base, stage) => base * RULES.popcornHp[getLevel(stage).world - 1];
/** The campaign as the draft simulation sees it (cards.mjs simulateDraft):
 * each stage's guaranteed entry power, whether it is a non-final boss, and
 * its sector. */
export const draftProfile = () => LEVELS.map((l) => ({ stage: l.id, power: entryPower(l.id), boss: l.kind === 'boss' && l.id !== STAGE_COUNT, world: l.world }));
