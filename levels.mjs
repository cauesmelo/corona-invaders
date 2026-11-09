/** Authored campaign data: 3 worlds x 4 sectors plus one CULTURE CHECK bonus.
 * Runtime, tests and documentation all read these definitions.
 *
 * Formation rows are strings, back row first. Codes:
 *   S spore   A armored   D dart     X splitter   Y armored splitter
 *   V diver   B burster   I infector C capsid     . empty slot
 * A later group enters once earlier groups have `trigger` or fewer survivors.
 * Each world follows introduce -> develop -> twist -> conclude, and every new
 * archetype first appears in a group of its own before being combined.
 */
export const WORLDS = Object.freeze([
  { id: 1, name: 'BLOODSTREAM', theme: 'blood' },
  { id: 2, name: 'AIRWAY', theme: 'airway' },
  { id: 3, name: 'LAB / PETRI', theme: 'lab' },
]);

/** Per-archetype stats. Radius is the collision circle in u. A behavior is added
 * before HP: most enemies stay at 1-2 HP so new types read as new jobs. */
export const ARCHETYPES = Object.freeze({
  spore: { hp: 1, radius: 0.67, score: 100, fires: 'single', label: 'SPORE' },
  armored: { hp: 2, radius: 0.78, score: 175, fires: 'pair', hitstop: 0.03, label: 'ARMORED' },
  dart: { hp: 1, radius: 0.58, score: 125, fires: 'fast', label: 'DART' },
  splitter: { hp: 2, radius: 0.72, score: 150, fires: 'single', hitstop: 0.03, label: 'SPLITTER' },
  daughter: { hp: 1, radius: 0.45, score: 50, fires: 'single', label: 'DAUGHTER' },
  diver: { hp: 1, radius: 0.6, score: 150, fires: 'none', label: 'DIVER' },
  burster: { hp: 1, radius: 0.7, score: 100, fires: 'none', label: 'BURSTER' },
  infector: { hp: 1, radius: 0.5, score: 200, fires: 'none', label: 'INFECTOR' },
  capsid: { hp: 2, radius: 0.8, score: 250, fires: 'single', hitstop: 0.03, label: 'CAPSID' },
  courier: { hp: 3, radius: 0.7, score: 500, fires: 'none', hitstop: 0.06, label: 'COURIER' },
  flier: { hp: 1, radius: 0.55, score: 100, fires: 'none', label: 'CULTURE' },
});
export const CODE_KIND = Object.freeze({
  S: 'spore',
  A: 'armored',
  D: 'dart',
  X: 'splitter',
  Y: 'splitter',
  V: 'diver',
  B: 'burster',
  I: 'infector',
  C: 'capsid',
});

/** Sample a cubic Bezier into a polyline; bonus fliers move along it at 8 u/s. */
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

/** Par seconds per stage = ceil(1.3 x the QA controller's seed-42 clear time).
 * Regenerate with `node tests/measure-par.mjs` after changing a sector. */
const PAR = Object.freeze([14, 22, 35, 21, 29, 15, 24, 21, 45, 56, 45, 33, 45]);

const W1 = { maxShots: 6, membranes: true };
const W2 = { maxShots: 9, membranes: true };
const W3 = { maxShots: 12, membranes: true };

export const LEVELS = Object.freeze(
  [
    {
      ...W1,
      code: '1-1',
      world: 1,
      name: 'FIRST RESPONSE',
      kind: 'sector',
      intro: { icon: 'membrane', text: 'MEMBRANES STOP VIRUS FIRE' },
      fireInterval: 1.85,
      shotSpeed: 8.5,
      courierAt: null,
      groups: [
        { rows: ['SSSSS', 'SSSSS'], spacing: 2.6, sway: 1.3, frequency: 0.88, descent: 0.08 },
        { rows: ['S.S.S.S', '.S.S.S.'], spacing: 2.3, sway: 1.5, frequency: 1.0, descent: 0.1, trigger: 2 },
      ],
    },
    {
      ...W1,
      code: '1-2',
      world: 1,
      name: 'CROSS CONTAMINATION',
      kind: 'sector',
      intro: { icon: 'courier', text: 'COURIER: SHOOT IT FOR A CAPSULE' },
      fireInterval: 1.7,
      shotSpeed: 8.8,
      courierAt: 5,
      groups: [
        { rows: ['AAAAAA', 'SSSSSS', 'SSSSSS'], spacing: 2.6, sway: 1.5, frequency: 0.95, descent: 0.09, cross: true },
        { rows: ['SASAS'], spacing: 2.8, sway: 1.8, frequency: 1.1, descent: 0.1, trigger: 3 },
      ],
    },
    {
      ...W1,
      code: '1-3',
      world: 1,
      name: 'SPLIT DECISION',
      kind: 'sector',
      intro: { icon: 'splitter', text: 'SPLITTERS DIVIDE IN TWO' },
      fireInterval: 1.6,
      shotSpeed: 9,
      courierAt: 7,
      groups: [
        { rows: ['X.X.X.X'], spacing: 2.5, sway: 1.4, frequency: 0.9, descent: 0.08 },
        { rows: ['YXYXY', 'SSSSSS'], spacing: 2.7, sway: 1.4, frequency: 1.0, descent: 0.1, trigger: 1, cross: true },
      ],
    },
    {
      ...W1,
      code: '1-4',
      world: 1,
      name: 'DELTA',
      kind: 'boss',
      boss: 'delta',
      intro: { icon: 'boss', text: 'IT SPLITS. BEAMS GLOW FIRST.' },
      fireInterval: 1.6,
      shotSpeed: 9.5,
      courierAt: 12,
      escorts: { rows: ['S.S..S.S'], spacing: 2.3, sway: 1.2, frequency: 0.9, descent: 0, z: -2.9 },
    },
    {
      code: 'B1',
      world: 1,
      name: 'CULTURE CHECK',
      kind: 'bonus',
      intro: { icon: 'bonus', text: 'NO RETURN FIRE. HIT THEM ALL.' },
      // Every control point sits inside the rails (|x| <= 8.6): a cubic Bezier
      // stays inside its control hull, so fliers and paths never leave the arena.
      membranes: false,
      maxShots: 0,
      fireInterval: 99,
      shotSpeed: 0,
      courierAt: null,
      flights: [
        { at: 1.2, count: 8, path: bezier([[-8.6, -11], [-4, 5], [4, 5], [8.6, -11]]) },
        { at: 5.6, count: 8, path: bezier([[8.6, -11], [4, 5], [-4, 5], [-8.6, -11]]) },
        { at: 10, count: 8, path: bezier([[-8.6, -3], [-1, 7], [1, -12.5], [8.6, -3]]) },
        { at: 14.4, count: 8, path: bezier([[0, -12.5], [-8.6, 0], [8.6, 3], [0, -12.5]]) },
        { at: 18.8, count: 4, path: bezier([[-8.6, 1], [-3, -12], [3, -12], [8.6, 1]]) },
        { at: 18.8, count: 4, path: bezier([[8.6, 1], [3, -12], [-3, -12], [-8.6, 1]]) },
      ],
    },
    {
      ...W2,
      code: '2-1',
      world: 2,
      name: 'SPORE STORM',
      kind: 'sector',
      intro: { icon: 'diver', text: 'DIVERS: LEAVE THE PINK LINE' },
      fireInterval: 1.4,
      shotSpeed: 9.5,
      dartSpeed: 11,
      courierAt: 8,
      maxDivers: 1,
      groups: [
        { rows: ['VVVVV'], spacing: 3, sway: 1.2, frequency: 0.8, descent: 0.06 },
        {
          rows: ['SSSSSSS', 'DDDDDDD', 'V.V.V.V'],
          spacing: 2.25,
          sway: 1.2,
          frequency: 1.15,
          descent: 0.1,
          trigger: 0,
        },
      ],
    },
    {
      ...W2,
      code: '2-2',
      world: 2,
      name: 'CHAIN REACTION',
      kind: 'sector',
      intro: { icon: 'burster', text: 'BURSTERS POP THEIR NEIGHBORS' },
      fireInterval: 1.3,
      shotSpeed: 10,
      dartSpeed: 11,
      courierAt: 9,
      maxDivers: 1,
      groups: [
        { rows: ['SSBSS', 'SBBBS', 'SSBSS'], spacing: 2.3, rowGap: 2.05, sway: 1.1, frequency: 0.9, descent: 0.07 },
        {
          rows: ['ABSBA', 'SBABS', 'ABSBA', 'V...V'],
          spacing: 2.3,
          rowGap: 2.05,
          sway: 1.3,
          frequency: 1,
          descent: 0.09,
          trigger: 0,
        },
        // A sparse lattice: bursters sit apart, so chains need aimed setups.
        { rows: ['DSDSDSD', 'B.A.A.B', 'SVS.SVS'], spacing: 2.3, rowGap: 2.4, sway: 1.4, frequency: 1.1, descent: 0.1, trigger: 2 },
        // Develop: one pod buried in armor. A pop only cracks shells, so the
        // last wave must be finished by aim rather than one lucky chain.
        { rows: ['ADADA', 'S.B.S', 'ADADA'], spacing: 2.6, sway: 1.5, frequency: 1.2, descent: 0.1, trigger: 0, cross: true },
      ],
    },
    {
      ...W2,
      code: '2-3',
      world: 2,
      name: 'VECTOR FIELD',
      kind: 'sector',
      intro: { icon: 'infector', text: 'INFECTORS ARMOR SPORES. CUT THE TETHER.' },
      fireInterval: 1.2,
      shotSpeed: 10.2,
      dartSpeed: 11,
      courierAt: 8,
      maxDivers: 1,
      groups: [
        { rows: ['SSSSSS', 'SISSIS'], spacing: 2.6, sway: 1.3, frequency: 0.95, descent: 0.08 },
        {
          rows: ['AAIAA', 'DDDDD', 'SVSVS'],
          spacing: 2.6,
          sway: 1.5,
          frequency: 1.05,
          descent: 0.1,
          trigger: 2,
          cross: true,
        },
      ],
    },
    {
      ...W2,
      code: '2-4',
      world: 2,
      name: 'MOTHER CELL',
      kind: 'boss',
      boss: 'mother',
      intro: { icon: 'boss', text: 'BREAK THE SACS. HIT THE OPEN CORE.' },
      fireInterval: 1.5,
      shotSpeed: 10.5,
      dartSpeed: 11,
      courierAt: 14,
      maxDivers: 1,
      burstBossDamage: 4,
    },
    {
      ...W3,
      code: '3-1',
      world: 3,
      name: 'CAPSID WALL',
      kind: 'sector',
      intro: { icon: 'capsid', text: 'CAPSIDS: FIRE WHEN THE PLATE OPENS' },
      // Debut at the world-2 top speed: the new rule (timing) arrives before the
      // world-3 speed ramp, which starts after ECHO.
      fireInterval: 1.15,
      shotSpeed: 10.5,
      dartSpeed: 11,
      courierAt: 7,
      maxDivers: 2,
      groups: [
        { rows: ['CCCCC'], spacing: 3.2, sway: 1, frequency: 0.7, descent: 0.06 },
        { rows: ['SDSDSD', 'CXCCXC', 'V.VV.V'], spacing: 2.6, sway: 1.2, frequency: 0.95, descent: 0.08, trigger: 0 },
      ],
    },
    {
      ...W3,
      code: '3-2',
      world: 3,
      name: 'ECHO',
      kind: 'boss',
      boss: 'echo',
      intro: { icon: 'boss', text: 'IT MIRRORS YOU. SHOOT THE OPEN EYE.' },
      fireInterval: 99,
      shotSpeed: 10.5,
      dartSpeed: 12,
      courierAt: 10,
      maxDivers: 2,
    },
    {
      ...W3,
      code: '3-3',
      world: 3,
      name: 'MUTATION',
      kind: 'sector',
      membranes: false,
      intro: { icon: 'none', text: 'NO MEMBRANES THIS TIME' },
      fireInterval: 1.05,
      shotSpeed: 11,
      dartSpeed: 12,
      courierAt: 8,
      maxDivers: 2,
      groups: [
        { rows: ['XBXBX', 'DSDSD', 'V.I.V'], spacing: 2.6, sway: 1.3, frequency: 1, descent: 0.08 },
        { rows: ['CACAC', 'BXBXB', 'SVSVS'], spacing: 2.6, sway: 1.4, frequency: 1.05, descent: 0.09, trigger: 3 },
        { rows: ['IDDDI', 'YCYCY'], spacing: 2.9, sway: 1.6, frequency: 1.15, descent: 0.1, trigger: 2, cross: true },
      ],
    },
    {
      ...W3,
      code: '3-4',
      world: 3,
      name: 'OMEGA PRIME',
      kind: 'boss',
      boss: 'omega',
      intro: { icon: 'boss', text: 'CHOOSE WHICH NODE DIES FIRST' },
      fireInterval: 99,
      shotSpeed: 11.5,
      dartSpeed: 12,
      courierAt: 12,
      maxDivers: 2,
    },
  ].map((level, index) =>
    Object.freeze({
      ...level,
      id: index + 1,
      // Gold needs no hit and a clear time at or under par.
      par: PAR[index],
      worldEnd: level.kind === 'boss' && /-4$/.test(level.code),
    }),
  ),
);

export const STAGE_COUNT = LEVELS.length;
export function getLevel(stage) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, stage - 1))];
}
export const getWorld = (stage) => WORLDS[getLevel(stage).world - 1];
