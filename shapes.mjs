/** Mesh registry: every 3D silhouette on the board, described as data. The
 * renderer builds geometry from these specs, and tests/theme.test.mjs checks
 * them, so nothing reads as an aircraft again (no wings, fins, tails, boxes or
 * fuselages: the previous revision's Dart, Diver, flier and Courier did).
 *
 * Art direction (RESEARCH_BULLET_HELL.md 4): the user's original 16x16 green
 * corona sprite rebuilt in 3D (a fat core ringed by ball-tipped spikes), the
 * public CDC-style grey sphere for bosses with variant-green spikes, and
 * cartoon microbiology motion. Units: u, at the archetype's visual scale 1.
 *
 * Part types:
 *   sphere   {r, at, scale}                body, lobes, nuclei
 *   crown    {count, r, length, stem, cap, ring} ball-tipped spikes around a
 *            core; `ring` puts `ring` of them in the board plane (the sprite's
 *            8 in-plane spikes), the rest over the sphere
 *   clubs    {count, r, length, head}      CDC-style club spikes (bosses)
 *   shell    {r, scale}                    translucent membrane or bubble
 *   tube     {length, r, turns, amp}       RNA helix / proboscis
 *   torus    {r, tube}                     ring outlines
 *   petals   {count, r, length, width}     BLOOM spike petals (closed bud)
 *   drop     {r, length}                   teardrop body
 *   warts    {count, r, size}              surface lumps (OMICRON)
 *
 *   pits     {r, points: [[x, y, z, size]], lift, at, slant}  bosses only: almond sockets
 *            sunk into the membrane with a glowing core each (size = socket
 *            radius in body radii; `lift` follows a vertically stretched
 *            body). The glow follows the boss's mood (personality.bossMenace).
 *
 * No villain has a drawn face (user, revision five: "regular viruses don't
 * need faces ... make it more 3D, not cartoon"): character comes from form,
 * materials and motion, and a boss's menace from its pits.
 */
export const PALETTE = Object.freeze({
  virus: '#12ce5d', // the original sprite's green: viruses only
  alpha: '#12ce5d',
  beta: '#1fc9a4',
  gamma: '#8fd23a',
  delta: '#c6e04a',
  omicron: '#a8ff3c',
  bossBody: '#e6e8ee', // grey-white CDC sphere, also host cells
  danger: '#ff4fa3', // enemy bullets and telegraphs only
  dangerViolet: '#b45cff',
  dangerCore: '#fff0f7',
  dangerRim: '#16030c',
  vaccine: '#7fe8ff', // the player, needles, antibodies, soap rim
  amber: '#ffc65a', // supplies and medals
});

const crown = (o) => ({ type: 'crown', count: 10, r: 0.62, length: 0.42, stem: 0.11, cap: 0.15, ring: 8, ...o });

export const SHAPES = Object.freeze({
  // The sprite in 3D: a fat ring core with ball-tipped spikes.
  wild: { color: PALETTE.virus, parts: [{ type: 'sphere', r: 0.62 }, crown({})] },
  mini: { color: PALETTE.virus, parts: [{ type: 'sphere', r: 0.62 }, crown({ count: 8, ring: 8, length: 0.3, cap: 0.13 })] },
  // Puffy crown with soft spikes; it rears up and bristles while inhaling.
  // `separate`: the crown is its own mesh, so the inhale bristles the
  // (decorative) spikes while the body stays at its collider.
  sneezer: { color: '#3fdc7c', parts: [{ type: 'sphere', r: 0.72, scale: [1, 0.85, 1] }, crown({ count: 12, r: 0.72, length: 0.3, stem: 0.16, cap: 0.2, ring: 8, separate: true })] },
  // Two lobes with a budding seam.
  // Two lobes (a capsule collider: lobe radius, lobe centres at +/-0.25).
  budder: { color: '#2bd06a', parts: [{ type: 'sphere', r: 0.55, at: [-0.25, 0, 0] }, { type: 'sphere', r: 0.55, at: [0.25, 0, 0] }, crown({ count: 12, r: 0.58, length: 0.26, ring: 8, scale: [1.4, 1, 1] }), { type: 'torus', r: 0.55, tube: 0.04, role: 'seam' }] },
  // RNA helix ribbon tube; it wriggles as it weaves.
  // bodyRadius: the tube's half-width (helix amplitude + tube radius); the
  // collider is a capsule of that radius along the worm's length.
  worm: { color: '#5fe08a', bodyRadius: 0.38, bodyHalf: 0.9, parts: [{ type: 'tube', length: 1.8, r: 0.16, turns: 2.2, amp: 0.22 }, { type: 'sphere', r: 0.3, at: [0, 0, 0.9], role: 'head' }] },
  // A ring outline of tiny virions (outlined, never fog).
  // The small core carries its face (role 'core': the collider stays the ring).
  puff: { color: '#46d88b', parts: [{ type: 'torus', r: 0.75, tube: 0.06 }, { type: 'virions', count: 8, r: 0.75, size: 0.2 }, { type: 'sphere', r: 0.3, role: 'core' }] },
  // Teardrop with a virus visible inside.
  droplet: { color: '#9ff0ff', parts: [{ type: 'drop', r: 0.55, length: 1.1, role: 'membrane' }, { type: 'sphere', r: 0.24, role: 'inner' }, crown({ count: 8, r: 0.24, length: 0.14, stem: 0.05, cap: 0.07, ring: 8, role: 'inner' })] },
  // Crown with a long RNA proboscis.
  hijacker: { color: '#33d66f', parts: [{ type: 'sphere', r: 0.48 }, crown({ count: 9, r: 0.48, length: 0.32, ring: 8 }), { type: 'tube', length: 1.1, r: 0.07, turns: 1.5, amp: 0.08, at: [0, 0, 0.9], role: 'proboscis' }] },
  // Swollen pale host cell, virions visible inside.
  cell: { color: PALETTE.bossBody, parts: [{ type: 'shell', r: 0.82 }, { type: 'sphere', r: 0.28, role: 'nucleus', at: [0.1, 0, -0.1] }, { type: 'virions', count: 4, r: 0.38, size: 0.16 }] },
  // Fat amber-tipped spikes that break off as it loses HP.
  heavy: { color: PALETTE.virus, parts: [{ type: 'sphere', r: 0.72 }, crown({ count: 12, r: 0.72, length: 0.5, stem: 0.17, cap: 0.22, ring: 8, tips: PALETTE.amber, breakable: true })] },
  // Spike petals closed into a bud; they open to fire.
  bloom: { color: '#2fd77a', parts: [{ type: 'sphere', r: 0.42 }, { type: 'petals', count: 6, r: 0.4, length: 0.85, width: 0.42 }] },
  // Translucent lipid bubble with an amber supply inside.
  vesicle: { color: '#dff8ff', parts: [{ type: 'shell', r: 0.78 }, { type: 'sphere', r: 0.28, role: 'cargo', color: PALETTE.amber }] },
  // CULTURE CHECK target: a small crown ball trailing a mucus streak.
  virion: { color: '#6fe9a2', parts: [{ type: 'sphere', r: 0.42 }, crown({ count: 8, r: 0.42, length: 0.26, stem: 0.08, cap: 0.11, ring: 8 }), { type: 'tube', length: 0.9, r: 0.09, turns: 0, amp: 0, at: [0, 0, -0.7], role: 'mucus' }] },
  // Bosses: the grey-white CDC sphere with variant-green club spikes.
  alpha: { color: PALETTE.bossBody, spikes: PALETTE.alpha, parts: [{ type: 'sphere', r: 1 }, { type: 'clubs', count: 26, r: 1, length: 0.42, head: 0.15 }, { type: 'pits', slant: 0.25, r: 1, points: [[-0.36, 0.8, 0.56, 0.15], [0.36, 0.8, 0.56, 0.15]] }] },
  // BETA: a tall egg with long, thin spikes. (Stretch is vertical only, so
  // the footprint on the board stays the collider circle.)
  twinB: { color: PALETTE.bossBody, spikes: PALETTE.beta, parts: [{ type: 'sphere', r: 1, scale: [1, 1.38, 1] }, { type: 'clubs', count: 18, r: 1, length: 0.66, head: 0.11, scale: [1, 1.38, 1] }, { type: 'pits', slant: 0.08, r: 1, points: [[-0.28, 0.82, 0.55, 0.12], [0.28, 0.82, 0.55, 0.12]], lift: 1.38 }] },
  // GAMMA: squat, belted, with short fat clubs.
  twinG: { color: PALETTE.bossBody, spikes: PALETTE.gamma, parts: [{ type: 'sphere', r: 1, scale: [1, 0.7, 1] }, { type: 'clubs', count: 30, r: 1, length: 0.28, head: 0.2, scale: [1, 0.7, 1] }, { type: 'torus', r: 1.0, tube: 0.08, role: 'belt' }, { type: 'pits', slant: 0.45, r: 1, points: [[-0.44, 0.74, 0.55, 0.16], [0.44, 0.74, 0.55, 0.16]], lift: 0.7 }] },
  // DELTA: three horn clusters at 120 degrees give it a triangular crown.
  delta: { color: PALETTE.bossBody, spikes: PALETTE.delta, parts: [{ type: 'sphere', r: 1 }, { type: 'clubs', count: 14, r: 1, length: 0.36, head: 0.15 }, { type: 'clubs', count: 15, r: 1, length: 0.9, head: 0.17, groups: 3, spread: 0.42 }, { type: 'torus', r: 1.02, tube: 0.035, role: 'seam' }, { type: 'pits', slant: 0.5, r: 1, points: [[0, 0.86, 0.48, 0.13], [-0.4, 0.74, 0.5, 0.12], [0.4, 0.74, 0.5, 0.12]] }] },
  half: { color: PALETTE.bossBody, spikes: PALETTE.delta, parts: [{ type: 'sphere', r: 1 }, { type: 'clubs', count: 12, r: 1, length: 0.36, head: 0.15 }, { type: 'clubs', count: 8, r: 1, length: 0.85, head: 0.16, groups: 1, spread: 0.45 }, { type: 'torus', r: 1.02, tube: 0.035, role: 'seam' }, { type: 'pits', slant: 0.5, r: 1, points: [[0, 0.8, 0.56, 0.16]] }] },
  // Heavily mutated: more, longer and uneven spikes.
  // OMICRON PRIME: lumpy, warted, crowded with uneven mutated spikes.
  omicron: { color: PALETTE.bossBody, spikes: PALETTE.omicron, parts: [{ type: 'sphere', r: 1, bumps: 0.12 }, { type: 'clubs', count: 44, r: 0.96, length: 0.52, head: 0.16, jitter: 0.5 }, { type: 'warts', count: 18, r: 0.95, size: 0.13 }, { type: 'pits', slant: 0.4, r: 0.96, points: [[-0.38, 0.78, 0.55, 0.17], [0.34, 0.8, 0.55, 0.12], [0.06, 0.92, 0.34, 0.09], [-0.1, 0.62, 0.74, 0.08], [0.52, 0.62, 0.6, 0.07]] }] },
  node: { color: '#d9dde6', spikes: PALETTE.omicron, parts: [{ type: 'sphere', r: 0.5 }, { type: 'clubs', count: 10, r: 0.5, length: 0.5, head: 0.14 }, { type: 'pits', slant: 0.35, r: 0.5, points: [[0, 0.8, 0.6, 0.2]] }] },
  bigsneezer: { color: '#3fdc7c', parts: [{ type: 'sphere', r: 0.85, scale: [1, 0.85, 1] }, crown({ count: 16, r: 0.85, length: 0.34, stem: 0.18, cap: 0.22, ring: 8, separate: true }), { type: 'pits', slant: -0.2, r: 0.85, points: [[-0.36, 0.78, 0.55, 0.13], [0.36, 0.78, 0.55, 0.13]], lift: 0.85 }] },
  aerosolcloud: { color: '#46d88b', parts: [{ type: 'torus', r: 0.9, tube: 0.07 }, { type: 'torus', r: 0.55, tube: 0.06 }, { type: 'virions', count: 12, r: 0.9, size: 0.24 }, { type: 'sphere', r: 0.42, role: 'core' }, { type: 'pits', slant: 0, r: 0.42, points: [[0, 0.84, 0.54, 0.18]] }] },
  mother: { color: PALETTE.bossBody, parts: [{ type: 'shell', r: 1 }, { type: 'sphere', r: 0.42, role: 'nucleus' }, { type: 'virions', count: 7, r: 0.62, size: 0.18 }, { type: 'pits', slant: -0.12, r: 1, points: [[-0.3, 0.82, 0.52, 0.12], [0.3, 0.82, 0.52, 0.12]] }] },
  // LAMBDA: a crown with one long antenna cluster and a thin halo.
  lambda: { color: PALETTE.bossBody, spikes: PALETTE.delta, parts: [{ type: 'sphere', r: 1, scale: [1, 1.15, 1] }, { type: 'clubs', count: 18, r: 1, length: 0.38, head: 0.14 }, { type: 'clubs', count: 6, r: 1, length: 1, head: 0.15, groups: 1, spread: 0.3 }, { type: 'torus', r: 1.35, tube: 0.04, role: 'halo' }, { type: 'pits', slant: 0.3, r: 1, points: [[-0.32, 0.82, 0.55, 0.13], [0.32, 0.82, 0.55, 0.13]], lift: 1.15 }] },
});

/** The hero. The needle points up-field; nothing extends sideways beyond the
 * barrel width + 0.2 u (the previous crossbars read as wings from above). */
export const SYRINGE = Object.freeze({
  barrelRadius: 0.3,
  // Drawn scale of the parts below, and the collision core: a glowing vaccine
  // chamber at the barrel centre, marked at exactly the core radius (0.2 u).
  scale: 1.333,
  core: Object.freeze({ r: 0.2, z: 0 }),
  parts: [
    { type: 'cylinder', role: 'barrel', r: 0.3, length: 1.7, z: 0 },
    { type: 'cylinder', role: 'fluid', r: 0.255, length: 1.64, z: 0 },
    { type: 'sphere', role: 'vaccine chamber', r: 0.13, z: 0 },
    { type: 'cylinder', role: 'rubber stopper', r: 0.27, length: 0.16, z: 0.9 },
    { type: 'cylinder', role: 'hub', r: 0.16, length: 0.3, z: -0.98 },
    { type: 'cylinder', role: 'needle', r: 0.032, length: 1.1, z: -1.66 },
    { type: 'cylinder', role: 'plunger rod', r: 0.085, length: 0.6, z: 1.12 },
    { type: 'disc', role: 'thumb rest', r: 0.3, z: 1.44 },
    // Finger grips: a rounded, squashed collar ring around the barrel end,
    // never a flat crossbar (from above, crossbars read as wings).
    { type: 'collar', role: 'finger grip', rx: 0.48, rz: 0.12, z: 0.86 },
    { type: 'marks', role: 'graduations', count: 7, r: 0.31 },
  ],
});

/** Archetype -> mesh spec. Bosses and parts map by boss type and part. */
export function shapeFor(e, bossType) {
  if (e.kind !== 'boss') return SHAPES[e.kind] || SHAPES.wild;
  if (e.part === 'twin') return e.tag === 'B' ? SHAPES.twinB : SHAPES.twinG;
  if (e.part === 'half') return SHAPES.half;
  if (e.part === 'node') return SHAPES.node;
  return SHAPES[bossType] || SHAPES.alpha;
}
