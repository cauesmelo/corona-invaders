/** Authored campaign: four worlds (the infection route, in four rooms) and 18
 * stages, plus archetype stats. Runtime, tests and documentation all read
 * these definitions.
 *
 * A stage is a script of steps run in order:
 *   { group }    spawn a formation grid (it enters from the back and never
 *                descends past z = -4; the instant "breach" loss is retired)
 *   { flight }   enemies flying a drawn Bezier path that cross and exit; an
 *                enemy that exits counts as escaped for the R0 meter
 *   { worms }    RNA WORMs weaving across the top, then exiting
 *   { puffs }    AEROSOL PUFFs drifting slowly across
 *   { vesicle }  a lipid bubble carrying a guaranteed mRNA supply
 *   { midboss }  a 1-3 card midboss (bosses.mjs)
 *   { wait }     seconds; { until: 'thin', left } / { until: 'clear' }
 * A stage clears when its script has ended and nothing hostile is left.
 *
 * Formation row codes (back row first):
 *   m mini WILD TYPE   W WILD TYPE   N SNEEZER   U BUDDER   D DROPLET
 *   H HIJACKER         C INFECTED CELL           K HEAVY CROWN   B BLOOM
 * Every archetype debuts while only plain WILD TYPEs are on the board
 * (tests/model.test.mjs checks this on real campaign runs).
 */
export const WORLDS = Object.freeze([
  { id: 1, name: 'AIRWAY', theme: 'airway', twist: null, boss: 'alpha' },
  { id: 2, name: 'LUNGS', theme: 'lungs', twist: 'breath', boss: 'betagamma' },
  { id: 3, name: 'BLOODSTREAM', theme: 'blood', twist: 'current', boss: 'delta' },
  { id: 4, name: 'LAB / PETRI', theme: 'lab', twist: 'mutation', boss: 'omicron' },
]);

/** Archetypes: one job, one bullet family, one personality telegraph each.
 * HP is on the bullet-hell scale (the player deals ~24 effective DPS).
 * `attack` is an emitter preset from patterns.mjs. */
export const ARCHETYPES = Object.freeze({
  mini: { label: 'WILD TYPE', hp: 1, radius: 0.42, score: 50, attack: { preset: 'cough', params: { n: 1, speed: 6 } } },
  wild: { label: 'WILD TYPE', hp: 3, radius: 0.6, score: 100, attack: { preset: 'cough', params: { n: 1, speed: 6.5 } }, byWorld: { 2: { n: 2, speed: 7 }, 3: { n: 2, spread: 14, speed: 7.5 }, 4: { n: 3, spread: 18, speed: 7.5 } } },
  // Inhales (swells 1.25x for 0.8 s: "ah... ah..."), then sneezes an odd fan.
  sneezer: { label: 'SNEEZER', hp: 10, radius: 0.8, score: 300, attack: { preset: 'sneeze', params: { n: 7, spread: 56, speeds: [4.5] } }, byWorld: { 2: { speeds: [4, 5.5] }, 3: { n: 9, speeds: [4, 5.5] }, 4: { n: 9, speeds: [4, 5.5, 7] } } },
  // Buds two shootable VIRION bullets when it dies.
  budder: { label: 'BUDDER', hp: 8, radius: 0.75, score: 250, attack: { preset: 'cough', params: { n: 1, speed: 6.5 } }, byWorld: { 3: { n: 2 }, 4: { n: 3, spread: 20 } } },
  // Weaves across the top leaving an RNA bead trail, then an RNA STRAND.
  worm: { label: 'RNA WORM', hp: 4, radius: 0.55, score: 150, attack: { preset: 'strand', params: { n: 9, speed: 4.8, interval: 0.13, amp: 0.9, wavelength: 5 } }, byWorld: { 3: { n: 10 }, 4: { n: 12, amp: 1.1 } } },
  // A ring of tiny virions that puffs slow mist.
  puff: { label: 'AEROSOL PUFF', hp: 10, radius: 0.9, score: 300, attack: { preset: 'aerosol', params: { rate: 5, cone: 100, speed: [2.5, 4], duration: 1.6 } }, byWorld: { 3: { rate: 6 }, 4: { rate: 7 } } },
  // Draws its dashed sneeze path for 0.8 s, dives, and splashes into a ring.
  droplet: { label: 'DROPLET', hp: 4, radius: 0.55, score: 200, attack: { preset: 'ring', params: { n: 6, speed: 3.6, family: 'droplet' } }, byWorld: { 4: { n: 8 } } },
  // Tethers a WILD TYPE for 1.5 s and turns it into a HEAVY CROWN.
  hijacker: { label: 'HIJACKER', hp: 6, radius: 0.55, score: 250, attack: null },
  // Pops with a 2.2 u radius that damages viruses only, and chains.
  cell: { label: 'INFECTED CELL', hp: 6, radius: 0.8, score: 150, attack: null },
  // Elite: fat spikes that break off as it loses HP. A stack of three spikes.
  heavy: { label: 'HEAVY CROWN', hp: 14, radius: 0.85, score: 500, attack: { preset: 'cough', params: { n: 3, speed: 8, family: 'spike' } }, byWorld: { 4: { speed: 8.5 } } },
  // Invulnerable while closed; opens for 1.5 s, firing a spike ring.
  bloom: { label: 'BLOOM', hp: 16, radius: 0.85, score: 450, attack: { preset: 'ring', params: { n: 14, speed: 3.8, family: 'spike' } } },
  // Drifts across the back carrying a supply; never fires.
  vesicle: { label: 'VESICLE', hp: 20, radius: 0.75, score: 800, attack: null },
  // CULTURE CHECK target: harmless, flies drawn paths.
  virion: { label: 'VIRION', hp: 1, radius: 0.5, score: 100, attack: null },
});
/** An archetype's attack in a given world: later worlds upgrade the same
 * shape (more bullets, a second speed tier) rather than adding new rules. */
export function attackFor(kind, world = 1) {
  const a = ARCHETYPES[kind];
  if (!a?.attack) return null;
  let params = { ...a.attack.params };
  for (let w = 2; w <= world; w++) if (a.byWorld?.[w]) params = { ...params, ...a.byWorld[w] };
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
// never dipping below z = -1 so flights stay out of the syringe's box.
const SWOOP = [[-8.2, -14.5], [-7, -1], [6, -2], [11, -9]];
const ARC = [[-11, -6], [-4, -1.5], [4, -1.5], [11, -6]];
const DROP = [[-3, -14.5], [-3, -3], [5, -4], [11.5, -10]];
const PATHS = Object.freeze({
  swoopL: bezier(SWOOP),
  swoopR: bezier(mirror(SWOOP)),
  arcL: bezier(ARC),
  arcR: bezier(mirror(ARC)),
  dropL: bezier(DROP),
  dropR: bezier(mirror(DROP)),
});

const grid = (rows, o = {}) => ({ group: { rows, spacing: 2.3, rowGap: 1.9, z: -11.2, sway: 1.1, frequency: 0.7, descent: 0.22, ...o } });
const fly = (path, kind = 'wild', count = 6, o = {}) => ({ flight: { path, kind, count, interval: 0.32, speed: 6.5, fire: { preset: 'cough', params: { n: 1, speed: 6.5 }, at: 0.42 }, ...o } });
const until = (what, left = 0) => ({ until: what, left });
const wait = (seconds) => ({ wait: seconds });

/** Per-world pressure. `choir`: seconds between formation volleys (slow when
 * the grid is full, fast when it thins) and how many front-row members fire
 * together. `maxBullets`: the stage cap for non-boss emitters (peak bullets on
 * screen, Normal; Easy is x0.6 through the per-emitter counts). */
const W1 = { world: 1, choir: { interval: [1.8, 1.2], size: [2, 3] }, maxBullets: 45 };
const W2 = { world: 2, choir: { interval: [1.45, 1], size: [3, 4] }, maxBullets: 70 };
const W3 = { world: 3, choir: { interval: [1.15, 0.8], size: [3, 5] }, maxBullets: 95 };
const W4 = { world: 4, choir: { interval: [1.05, 0.72], size: [4, 6] }, maxBullets: 120 };

export const LEVELS = Object.freeze(
  [
    {
      ...W1,
      code: '1-1',
      name: 'FIRST CONTACT',
      kind: 'sample',
      intro: { icon: 'wild', text: 'MOVE IN 2D. ONLY THE WHITE DOT CAN BE HIT.' },
      choir: { interval: [2, 1.4], size: [2, 3] },
      maxBullets: 30,
      script: [
        // Homage: the original game's 4 x 15 grid of 60 mini coronas.
        grid(Array(4).fill('mmmmmmmmmmmmmmm'), { spacing: 1.18, rowGap: 1.3, z: -12.6, sway: 0.5, frequency: 0.55, descent: 0.12 }),
        wait(9),
        fly('swoopL', 'wild', 5),
        until('thin', 16),
        grid(['W.W.W.W', '.W.W.W.']),
        wait(6),
        fly('swoopR', 'wild', 5),
        until('thin', 2),
        grid(['WWWWWWW', 'W.W.W.W']),
        wait(5),
        fly('arcL', 'wild', 6),
        until('clear'),
        fly('arcR', 'wild', 6),
        wait(1.6),
        fly('swoopL', 'wild', 6),
        until('clear'),
      ],
    },
    {
      ...W1,
      code: '1-2',
      name: 'GESUNDHEIT',
      kind: 'sample',
      intro: { icon: 'sneezer', text: 'SNEEZERS INHALE, THEN FAN. HOLD SHIFT TO FOCUS.' },
      script: [
        grid(['N...N', 'WWWWW'], { spacing: 2.6 }),
        wait(5),
        { vesicle: { dir: 1 } },
        until('thin', 2),
        fly('arcL', 'wild', 5),
        grid(['W.N.N.W', 'WWWWWWW']),
        wait(6),
        fly('swoopR', 'wild', 5),
        until('thin', 3),
        grid(['NWNWN', 'W.W.W']),
        wait(4),
        fly('arcR', 'wild', 6),
        until('clear'),
      ],
    },
    {
      ...W1,
      code: '1-3',
      name: 'BUDDING',
      kind: 'sample',
      intro: { icon: 'budder', text: 'BUDDERS RELEASE VIRIONS. SHOOT THEM TOO.' },
      script: [
        grid(['U.U.U', 'WWWWW'], { spacing: 2.6 }),
        wait(6),
        fly('swoopL', 'wild', 5),
        until('thin', 2),
        grid(['UW.WU', 'WWWWWW']),
        wait(5),
        fly('arcR', 'wild', 5),
        until('clear'),
        { midboss: 'bigsneezer' },
        until('clear'),
      ],
    },
    {
      ...W1,
      code: '1-4',
      name: 'ALPHA',
      kind: 'boss',
      boss: 'alpha',
      intro: { icon: 'boss', text: 'ITS EYES NARROW BEFORE EVERY CARD.' },
    },
    {
      ...W1,
      code: 'B1',
      name: 'CULTURE CHECK',
      kind: 'bonus',
      intro: { icon: 'bonus', text: 'HARMLESS VIRIONS. CURE THEM ALL.' },
      maxBullets: 0,
      // Every control point sits inside the rails, so harmless fliers never
      // leave the board while they can still be shot.
      script: [
        { flight: { path: bezier([[-8.6, -11], [-4, 5], [4, 5], [8.6, -11]]), kind: 'virion', count: 8, interval: 0.25, speed: 8, harmless: true } },
        wait(4.4),
        { flight: { path: bezier([[8.6, -11], [4, 5], [-4, 5], [-8.6, -11]]), kind: 'virion', count: 8, interval: 0.25, speed: 8, harmless: true } },
        wait(4.4),
        { flight: { path: bezier([[-8.6, -3], [-1, 7], [1, -12.5], [8.6, -3]]), kind: 'virion', count: 8, interval: 0.25, speed: 8, harmless: true } },
        wait(4.4),
        { flight: { path: bezier([[0, -12.5], [-8.6, 0], [8.6, 3], [0, -12.5]]), kind: 'virion', count: 8, interval: 0.25, speed: 8, harmless: true } },
        wait(4.4),
        { flight: { path: bezier([[-8.6, 1], [-3, -12], [3, -12], [8.6, 1]]), kind: 'virion', count: 4, interval: 0.25, speed: 8, harmless: true } },
        { flight: { path: bezier([[8.6, 1], [3, -12], [-3, -12], [-8.6, 1]]), kind: 'virion', count: 4, interval: 0.25, speed: 8, harmless: true } },
        until('clear'),
      ],
    },
    {
      ...W2,
      code: '2-1',
      name: 'GAS EXCHANGE',
      kind: 'sample',
      intro: { icon: 'worm', text: 'RNA WORMS WEAVE AND STREAM. KEEP MOVING.' },
      script: [
        grid(['WWWWWWW', 'W.W.W.W']),
        wait(3),
        { worms: { count: 2, z: -8.5, dir: 1 } },
        wait(6),
        { worms: { count: 2, z: -9.5, dir: -1 } },
        until('thin', 3),
        grid(['N.N.N', 'WWWWWW']),
        wait(4),
        { worms: { count: 3, z: -9, dir: 1 } },
        wait(5),
        fly('swoopL', 'wild', 6),
        until('thin', 2),
        grid(['UWNWU', 'WWWWWWW']),
        { worms: { count: 2, z: -8.5, dir: -1 } },
        until('clear'),
      ],
    },
    {
      ...W2,
      code: '2-2',
      name: 'AEROSOL',
      kind: 'sample',
      intro: { icon: 'puff', text: 'AEROSOL PUFFS DRIFT AND SPRAY MIST.' },
      script: [
        grid(['W.W.W.W', 'WWWWWWW']),
        wait(2),
        { puffs: [{ x: -11, z: -6.5, vx: 1.2 }, { x: 11, z: -8, vx: -1.2 }] },
        wait(7),
        fly('arcL', 'wild', 6),
        until('thin', 2),
        grid(['NWUWN', 'WWWWW'], { spacing: 2.6 }),
        { vesicle: { dir: -1 } },
        wait(5),
        { puffs: [{ x: 11, z: -7, vx: -1.1 }] },
        { worms: { count: 2, z: -9.5, dir: 1 } },
        until('clear'),
        { midboss: 'aerosolcloud' },
        until('clear'),
      ],
    },
    {
      ...W2,
      code: '2-3',
      name: 'DEEP BREATH',
      kind: 'sample',
      twist: 'breath',
      intro: { icon: 'breath', text: 'BREATH: BULLETS SLOW ON THE INHALE, RUSH ON THE EXHALE.' },
      script: [
        grid(['NUNUN', 'WWWWWW']),
        wait(4),
        { worms: { count: 2, z: -9, dir: -1 } },
        wait(5),
        { puffs: [{ x: 11, z: -7, vx: -1.1 }] },
        until('thin', 3),
        grid(['UWNWU', 'WNWNW', 'WWWWW']),
        wait(3),
        fly('swoopR', 'wild', 6),
        wait(5),
        fly('swoopL', 'wild', 6),
        { worms: { count: 2, z: -8.5, dir: 1 } },
        until('thin', 2),
        grid(['NNNNN', 'WWWWWWW']),
        until('clear'),
      ],
    },
    {
      ...W2,
      code: '2-4',
      name: 'BETA & GAMMA',
      kind: 'boss',
      boss: 'betagamma',
      twist: 'breath',
      intro: { icon: 'boss', text: 'TWINS SHARE ONE LOAD. HIT THE GLOWING NUCLEUS.' },
    },
    {
      ...W3,
      code: '3-1',
      name: 'CIRCULATION',
      kind: 'sample',
      twist: 'current',
      intro: { icon: 'droplet', text: 'CURRENT PUSHES BULLETS SIDEWAYS. DROPLETS DIVE.' },
      script: [
        grid(['D.D.D.D', 'WWWWWWW']),
        wait(5),
        fly('dropL', 'wild', 5),
        until('thin', 3),
        grid(['DNDND', 'WWWWW', 'W.W.W']),
        wait(4),
        fly('dropR', 'wild', 5),
        { worms: { count: 2, z: -9.5, dir: -1 } },
        wait(5),
        fly('swoopR', 'wild', 6),
        until('thin', 3),
        grid(['DUDUD', 'NWNWN']),
        wait(3),
        { puffs: [{ x: -11, z: -7, vx: 1.1 }] },
        fly('swoopL', 'wild', 6),
        wait(4),
        { worms: { count: 2, z: -9, dir: 1 } },
        until('thin', 2),
        grid(['NDNDN', 'WWWWWWW']),
        until('clear'),
      ],
    },
    {
      ...W3,
      code: '3-2',
      name: 'HIJACK',
      kind: 'sample',
      intro: { icon: 'hijacker', text: 'HIJACKERS ARMOR WILD TYPES. CUT THE TETHER.' },
      script: [
        grid(['W.H.W.H.W', 'WWWWWWWWW'], { spacing: 2 }),
        wait(6),
        fly('arcL', 'wild', 6),
        until('thin', 2),
        grid(['CWCWC', 'WCWCW'], { spacing: 2.4, rowGap: 1.7 }),
        wait(4),
        { worms: { count: 2, z: -9.5, dir: 1 } },
        until('thin', 2),
        grid(['HCDCH', 'WNWNW']),
        wait(4),
        fly('swoopR', 'wild', 6),
        until('thin', 2),
        grid(['NWNWN', 'WDWDW']),
        wait(3),
        fly('arcR', 'wild', 6),
        until('clear'),
        { midboss: 'mother' },
        until('clear'),
      ],
    },
    {
      ...W3,
      code: '3-3',
      name: 'VARIANT SURGE',
      kind: 'sample',
      twist: 'current',
      intro: { icon: 'heavy', text: 'HEAVY CROWNS: WATCH THE SPIKES BREAK.' },
      script: [
        grid(['K...K...K', 'WWWWWWWWW'], { spacing: 2 }),
        wait(5),
        fly('swoopL', 'wild', 6),
        wait(4),
        { worms: { count: 2, z: -9.5, dir: 1 } },
        until('thin', 3),
        grid(['KDKDK', 'NWNWN', 'WWWWW']),
        wait(3),
        { worms: { count: 2, z: -9.5, dir: -1 } },
        wait(4),
        fly('dropR', 'wild', 6),
        wait(4),
        fly('dropL', 'wild', 6),
        until('thin', 3),
        grid(['KNKNK', 'DWDWD']),
        { puffs: [{ x: 11, z: -7, vx: -1.1 }] },
        wait(5),
        fly('arcR', 'wild', 6),
        until('clear'),
      ],
    },
    {
      ...W3,
      code: '3-4',
      name: 'DELTA',
      kind: 'boss',
      boss: 'delta',
      twist: 'current',
      intro: { icon: 'boss', text: 'IT REALLY SPLITS. LANES GLOW BEFORE THEY FIRE.' },
    },
    {
      ...W3,
      code: 'B2',
      name: 'SWAB TEST',
      kind: 'bonus',
      intro: { icon: 'bloom', text: 'BLOOMS ARE HARMLESS HERE. SHOOT ONLY OPEN BUDS.' },
      maxBullets: 0,
      timeLimit: 32,
      script: [grid(['B.B.B.B', '.B.B.B.', 'B.B.B.B'], { spacing: 2.3, rowGap: 2.2, z: -11, sway: 0.6, descent: 0.1, harmless: true }), until('clear')],
    },
    {
      ...W4,
      code: '4-1',
      name: 'AGAR',
      kind: 'sample',
      intro: { icon: 'bloom', text: 'BLOOMS OPEN, FIRE A RING, THEN CLOSE. WAIT FOR IT.' },
      script: [
        grid(['B..B..B', 'WWWWWWW']),
        wait(5),
        fly('arcR', 'wild', 6),
        until('thin', 2),
        grid(['BKBKB', 'WNWNW', 'WWWWW']),
        wait(4),
        { worms: { count: 2, z: -9.5, dir: -1 } },
        wait(4),
        fly('swoopL', 'wild', 6),
        until('thin', 3),
        grid(['BNBNB', 'KWKWK']),
        { puffs: [{ x: -11, z: -7, vx: 1.1 }] },
        until('clear'),
      ],
    },
    {
      ...W4,
      code: '4-2',
      name: 'MUTATION',
      kind: 'sample',
      twist: 'mutation',
      intro: { icon: 'mutation', text: 'MUTATION: A FLASHING VIRUS UPGRADES ITS ATTACK.' },
      script: [
        grid(['WNWNW', 'UWUWU', 'WWWWW']),
        wait(5),
        fly('swoopR', 'wild', 6),
        until('thin', 3),
        grid(['KDKDK', 'CWCWC']),
        { worms: { count: 2, z: -9, dir: -1 } },
        wait(4),
        { puffs: [{ x: 11, z: -7, vx: -1.1 }] },
        until('clear'),
        { midboss: 'lambda' },
        until('clear'),
      ],
    },
    {
      ...W4,
      code: '4-3',
      name: 'OUTBREAK',
      kind: 'sample',
      twist: 'mutation',
      intro: { icon: 'r0', text: 'KEEP R0 BELOW 1: STOP THE FLIGHTS ESCAPING.' },
      script: [
        grid(['NKNKN', 'DWDWD', 'WWWWW']),
        wait(3),
        fly('swoopL', 'wild', 6),
        wait(3),
        fly('swoopR', 'wild', 6),
        until('thin', 4),
        { puffs: [{ x: -11, z: -7, vx: 1.2 }] },
        fly('dropR', 'wild', 6),
        wait(4),
        fly('dropL', 'wild', 6),
        until('thin', 2),
        grid(['UHUHU', 'WCWCW', 'WWWWW']),
        { worms: { count: 3, z: -9.5, dir: 1 } },
        fly('arcL', 'wild', 6),
        wait(4),
        fly('arcR', 'wild', 6),
        until('thin', 2),
        grid(['KBKBK', 'NWNWN']),
        until('clear'),
      ],
    },
    {
      ...W4,
      code: '4-4',
      name: 'OMICRON PRIME',
      kind: 'boss',
      boss: 'omicron',
      intro: { icon: 'boss', text: 'CHOOSE WHICH SPIKE NODE DIES FIRST.' },
    },
  ].map((level, index) =>
    Object.freeze({
      ...level,
      id: index + 1,
      twist: level.twist ?? null,
      worldEnd: level.kind === 'boss' && /-4$/.test(level.code),
    }),
  ),
);

export { PATHS };
export const STAGE_COUNT = LEVELS.length;
export function getLevel(stage) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, stage - 1))];
}
export const getWorld = (stage) => WORLDS[getLevel(stage).world - 1];
