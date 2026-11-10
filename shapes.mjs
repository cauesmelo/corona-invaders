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
 *   eyes     {r, gap}                      two dot eyes (bosses only)
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
  // Puffy crown with soft spikes; it swells 1.25x while inhaling.
  sneezer: { color: '#3fdc7c', parts: [{ type: 'sphere', r: 0.72, scale: [1, 0.85, 1] }, crown({ count: 12, r: 0.72, length: 0.3, stem: 0.16, cap: 0.2, ring: 8 })] },
  // Two lobes with a budding seam.
  // Two lobes (a capsule collider: lobe radius, lobe centres at +/-0.25).
  budder: { color: '#2bd06a', parts: [{ type: 'sphere', r: 0.55, at: [-0.25, 0, 0] }, { type: 'sphere', r: 0.55, at: [0.25, 0, 0] }, crown({ count: 12, r: 0.58, length: 0.26, ring: 8, scale: [1.4, 1, 1] }), { type: 'torus', r: 0.55, tube: 0.04, role: 'seam' }] },
  // RNA helix ribbon tube; it wriggles as it weaves.
  // bodyRadius: the tube's half-width (helix amplitude + tube radius); the
  // collider is a capsule of that radius along the worm's length.
  worm: { color: '#5fe08a', bodyRadius: 0.38, bodyHalf: 0.9, parts: [{ type: 'tube', length: 1.8, r: 0.16, turns: 2.2, amp: 0.22 }, { type: 'sphere', r: 0.3, at: [0, 0, 0.9], role: 'head' }] },
  // A ring outline of tiny virions (outlined, never fog).
  puff: { color: '#46d88b', parts: [{ type: 'torus', r: 0.75, tube: 0.06 }, { type: 'virions', count: 8, r: 0.75, size: 0.2 }] },
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
  // Bosses: the grey-white CDC sphere with variant-green club spikes and eyes.
  alpha: { color: PALETTE.bossBody, spikes: PALETTE.alpha, parts: [{ type: 'sphere', r: 1 }, { type: 'clubs', count: 26, r: 1, length: 0.42, head: 0.15 }, { type: 'eyes', r: 0.13, gap: 0.42 }] },
  twinB: { color: PALETTE.bossBody, spikes: PALETTE.beta, parts: [{ type: 'sphere', r: 1 }, { type: 'clubs', count: 22, r: 1, length: 0.4, head: 0.15 }, { type: 'eyes', r: 0.13, gap: 0.4 }] },
  twinG: { color: PALETTE.bossBody, spikes: PALETTE.gamma, parts: [{ type: 'sphere', r: 1 }, { type: 'clubs', count: 22, r: 1, length: 0.4, head: 0.15 }, { type: 'eyes', r: 0.13, gap: 0.4 }] },
  delta: { color: PALETTE.bossBody, spikes: PALETTE.delta, parts: [{ type: 'sphere', r: 1 }, { type: 'clubs', count: 26, r: 1, length: 0.44, head: 0.16 }, { type: 'torus', r: 1.02, tube: 0.035, role: 'seam' }, { type: 'eyes', r: 0.13, gap: 0.42 }] },
  half: { color: PALETTE.bossBody, spikes: PALETTE.delta, parts: [{ type: 'sphere', r: 1 }, { type: 'clubs', count: 16, r: 1, length: 0.42, head: 0.15 }, { type: 'eyes', r: 0.12, gap: 0.3 }] },
  // Heavily mutated: more, longer and uneven spikes.
  omicron: { color: PALETTE.bossBody, spikes: PALETTE.omicron, parts: [{ type: 'sphere', r: 1 }, { type: 'clubs', count: 40, r: 1, length: 0.5, head: 0.16, jitter: 0.45 }, { type: 'eyes', r: 0.13, gap: 0.44 }] },
  node: { color: '#d9dde6', spikes: PALETTE.omicron, parts: [{ type: 'sphere', r: 0.5 }, { type: 'clubs', count: 10, r: 0.5, length: 0.5, head: 0.14 }] },
  bigsneezer: { color: '#3fdc7c', parts: [{ type: 'sphere', r: 0.85, scale: [1, 0.85, 1] }, crown({ count: 16, r: 0.85, length: 0.34, stem: 0.18, cap: 0.22, ring: 8 }), { type: 'eyes', r: 0.12, gap: 0.38 }] },
  aerosolcloud: { color: '#46d88b', parts: [{ type: 'torus', r: 0.9, tube: 0.07 }, { type: 'torus', r: 0.55, tube: 0.06 }, { type: 'virions', count: 12, r: 0.9, size: 0.24 }, { type: 'sphere', r: 0.42, role: 'core' }, { type: 'eyes', r: 0.11, gap: 0.3 }] },
  mother: { color: PALETTE.bossBody, parts: [{ type: 'shell', r: 1 }, { type: 'sphere', r: 0.42, role: 'nucleus' }, { type: 'virions', count: 7, r: 0.62, size: 0.18 }, { type: 'eyes', r: 0.12, gap: 0.4 }] },
  lambda: { color: PALETTE.bossBody, spikes: PALETTE.delta, parts: [{ type: 'sphere', r: 1 }, { type: 'clubs', count: 20, r: 1, length: 0.4, head: 0.15 }, { type: 'torus', r: 1.35, tube: 0.05, role: 'halo' }, { type: 'eyes', r: 0.13, gap: 0.4 }] },
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
    { type: 'cylinder', role: 'fluid', r: 0.23, length: 1.4, z: 0.05 },
    { type: 'cylinder', role: 'hub', r: 0.16, length: 0.3, z: -0.98 },
    { type: 'cylinder', role: 'needle', r: 0.035, length: 1.15, z: -1.7 },
    { type: 'cylinder', role: 'plunger rod', r: 0.09, length: 0.55, z: 1.1 },
    { type: 'disc', role: 'thumb rest', r: 0.3, z: 1.42 },
    { type: 'oval', role: 'finger flange', rx: 0.46, rz: 0.13, z: 0.86 },
    { type: 'marks', role: 'graduations', count: 5, r: 0.31 },
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
