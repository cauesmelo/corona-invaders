# Corona Invaders: level design (revision five, bullet hell)

What is built, from `levels.mjs`, `enemies.mjs`, `patterns.mjs` and `bosses.mjs`. The design source is [RESEARCH_BULLET_HELL.md](./RESEARCH_BULLET_HELL.md); numbers and measurements are in [BALANCE.md](./BALANCE.md). Units are world units (u) on the X/Z board, +Z toward the player, seconds and u/s. The board is x ±9.4 by z −13.4..13.4; the syringe moves in x ±8.9, z −3..12; the formation never descends past z = −4.

## Structure: the infection route in four rooms

| World | Backdrop (midtone) | Twist | Stage cap (Normal peak bullets) | Boss |
| --- | --- | --- | --- | --- |
| W1 AIRWAY | Slate-teal trachea, cartilage rings, cilia rows, mucus sheen | — (learn the kit) | 30 in 1-1, 45 | ALPHA |
| W2 LUNGS | Blue-grey alveoli clusters | **BREATH** (2-3, 2-4): a 6 s cycle, 1 s warning, inhale ×0.6, exhale ×1.3 bullet time | 70 | BETA & GAMMA |
| W3 BLOODSTREAM | Teal glass over desaturated red cells, flow streaks | **CURRENT** (3-1, 3-3, 3-4): bullets drift 0.8 u/s with the flow, flipping every 30 s after a 2 s warning | 95 | DELTA |
| W4 LAB / PETRI | Amber agar with colonies | **MUTATION** (4-2, 4-3): every 3.2 s a formation virus flashes 0.8 s (hue shift), then fires one tier up | 120 | OMICRON PRIME |

A stage is a script: formation grids that enter from the back and stop at z = −4, Bezier flights that cross and exit (exits raise R0), RNA worms, aerosol puffs, a vesicle, a midboss, and `wait` / `until thin` / `until clear` steps. The formation fires as a **choir**: every 1.05–2.1 s (faster as it thins) 2–6 front-row members of one archetype fire together. From 1-2 to 4-3 each stage has a **surge** after its second grid: for 5/6/7/8 s (by world) the choir fires twice as often with one more singer, still under the stage cap, so the stage has a peak. 1-1 has a gentler choir (every 2.5 → 1.8 s, 1–2 singers). Every archetype debuts while only plain WILD TYPEs are on the board (checked on a real campaign run; the HIJACKER's conversion into a HEAVY CROWN in 3-2 is its own mechanic).

## The 18 samples

| # | Code | Name | Content | Teaches |
| --- | --- | --- | --- | --- |
| 1 | 1-1 | FIRST CONTACT | The original **4×15 grid of 60 mini coronas**, then WILD TYPE grids and five flights | 2D movement; only the glowing core can be hit |
| 2 | 1-2 | GESUNDHEIT | SNEEZERs with WILD TYPEs, the first VESICLE (guaranteed mRNA), mixed grids | Focus through an odd fan; Shift = a stronger needle |
| 3 | 1-3 | BUDDING | BUDDERs (dying budders release two shootable VIRIONs), then midboss **BIG SNEEZER** | Shooting bullets that can be shot |
| 4 | 1-4 | ALPHA | Boss | Cards, captures, timeouts |
| 5 | B1 | CULTURE CHECK | Harmless VIRION flights on drawn paths | Aim and score (medal by cure ratio) |
| 6 | 2-1 | GAS EXCHANGE | RNA WORMs weaving across the top (bead trail, RNA STRAND aimed at you) | Streaming and weaving |
| 7 | 2-2 | AEROSOL | AEROSOL PUFFs drifting and spraying mist, a vesicle, midboss **AEROSOL CLOUD** | Controlled micro-dodging |
| 8 | 2-3 | DEEP BREATH | Everything so far under BREATH | Reading the rhythm |
| 9 | 2-4 | BETA & GAMMA | Boss (BREATH) | Twin bosses, a moving nucleus |
| 10 | 3-1 | CIRCULATION | DROPLETs dive along a dashed path, land 4 u in front of you and pop into a ring 0.8 s later unless shot; CURRENT | Shooting divers before they splash (R0) |
| 11 | 3-2 | HIJACK | HIJACKERs tether WILD TYPEs for 1.5 s into HEAVY CROWNs (kill first: +300 CURED); INFECTED CELLs pop 2.2 u and chain (viruses only); midboss **MOTHER CELL** | Target priority |
| 12 | 3-3 | VARIANT SURGE | HEAVY CROWNs (spikes snap off as HP drops, spike stacks) under CURRENT, with dives and flights | Elites |
| 13 | 3-4 | DELTA | Boss (CURRENT) | Splits, lanes, drifting walls |
| 14 | B2 | SWAB TEST | 18 harmless BLOOMs that open and close; only open buds take damage; 32 s | Timing |
| 15 | 4-1 | AGAR | BLOOM fields (closed buds spark needles; they open 0.8 s, fire a spike ring, stay open 1.5 s) with HEAVY CROWNs | Waiting for the opening |
| 16 | 4-2 | MUTATION | Mixed grids under MUTATION, midboss **LAMBDA** | Reading upgrades |
| 17 | 4-3 | OUTBREAK | Dense mixed grids, six flights, worms and puffs; R0 is the goal | Everything, and R0 |
| 18 | 4-4 | OMICRON PRIME | Final boss | — |

## Archetypes (one job, one family, one telegraph)

| Archetype | Silhouette (`shapes.mjs`) | Attack (W1 → W4 upgrades) | HP* |
| --- | --- | --- | --- |
| WILD TYPE / mini | The original sprite in 3D: core + 8 in-plane ball-tipped spikes (+2 above) | COUGH: 1 droplet → 2 → 2-way 14° fan → 3-way 18° fan; spikes bristle 0.5 s first | 3 / 1 |
| SNEEZER | Puffy crown, soft spikes; rears up and bristles its crown while inhaling 0.8 s (the body stays at its collider) | SNEEZE odd fan: 7 at 56°, 1 tier → 2 tiers → 9 → 9 × 3 tiers | 10 |
| BUDDER | Two lobes and a seam (a capsule collider along the lobes) | COUGH; buds 2 shootable VIRIONs on death | 8 |
| RNA WORM | Helix tube that wriggles, crossing the top (a capsule collider along the tube) | RNA STRAND aimed at you; a 1.5 s bead trail | 4 |
| AEROSOL PUFF | A ring outline of tiny virions | AEROSOL spray, 5 → 7 bullets/s | 10 |
| DROPLET | Translucent teardrop with a virus inside | Dive, then a 6-ring splash (8 in W4) | 4 |
| HIJACKER | Crown with an RNA proboscis | Tether → HEAVY CROWN | 6 |
| INFECTED CELL | Pale host cell with virions inside | Pops 2.2 u (6 damage, viruses only), chains | 6 |
| HEAVY CROWN | Fat amber-tipped spikes that break off with HP | SPIKE stack ×3 | 14 |
| BLOOM | Spike petals closed into a bud | Opens, fires a 16-spike ring | 16 |
| VESICLE | Lipid bubble carrying an amber mRNA icon | Never fires | 20 |

*Base HP at power 1–2. HP, cell pops and SOAP damage scale with the power the campaign guarantees at that stage (×1.25 at power 3, ×1.75 at power 4), so time-to-kill holds as the syringe grows. Easy ×0.85.

## Bosses and mutation cards

Lit grey CDC-style spheres with variant-green club spikes and glowing pits sunk into the membrane (no drawn face). The pits flare before an attack, and the boss types a taunt into the HUD at each card start (README "Villains with personality, in 3D"). One VIRAL LOAD pool; card HP = round(TTK × the reference DPS there × 0.7), with 24 the DPS at ALPHA, so every card ends by damage well inside its timeout (tested). Normal phases time out at 30 s, cards at 40 s; survival cards last their duration. Each card start cancels bullets into antigen tokens and holds 1.5 s with the name tape. A card is **NEUTRALIZED** (index × 10,000 × world, ×0.5 on Easy) if it ends by damage with no hit and no SOAP. Bosses move at most 3 u/s during cards. Only a boss's body sphere takes needles; its spikes are decoration.

| Boss | Cards (type, TTK s) | Gimmick |
| --- | --- | --- |
| **ALPHA** (1-4, #12ce5d) | COUGH COUGH (phase 18: 3-way aimed fan every 1 s + 12-ring every 2.2 s) → FIRST SNEEZE (22: 1.0 s inhale with a wedge outline, 9 × 2 speeds, twice) → SPIKE BLOOM (22: 7-arm spiral, +11° per emit) → CORONA (18: alternating 20-rings + a cough) | Tutorial boss; eyes narrow before each attack |
| **BETA & GAMMA** (2-4, #1fc9a4 / #8fd23a) | PING-PONG (phase 18: alternating DRIP streams) → CROSS INFECTION (24: fixed fans from opposite corners form a lattice) → MIRROR STRAIN (24: BETA mirrors your x deep in the field and stays 4 u from GAMMA; GAMMA tracks you; BETA coughs and GAMMA fires rings; only the glowing nucleus takes damage, the dormant twin is intangible; the nucleus swaps every 5 s) → DOUBLE HELIX (20: the twins orbit, firing interleaved RNA strands) | Shared pool, twin-nucleus rule |
| **DELTA** (3-4, #c6e04a, Δ seam) | TRIANGULATE (phase 18: even fans from its three vertices in rotation) → LANE SNEEZE (22: a SNEEZE JET down its own column while it tracks you, plus fans) → HALVES (24: it **really splits** into two mirrored halves on one pool, alternating rings) → BLOOD RUSH (18: CURRENT doubles to 1.6 u/s and flips every 6 s; mucus walls with ≥ 2.4 u gaps every 4 s that drift, plus a single cough) → Δ CASCADE (20: REPLICATION triangles) | Split, lanes, drifting walls |
| **OMICRON PRIME** (4-4, #a8ff3c, 40 uneven spikes) | SPIKE CROWN (phase 20, was 35 against a 30 s timeout: four spike nodes orbiting at 0.3 rad/s, each owning one attack (cough, ring, bloom, drip) with its icon; kill them in your order; killing one removes its attack; the shielded core is intangible, so needles reach the nodes behind it) → SNEEZE STORM (25: a seeded aerosol storm with two marked safe lanes, plus 3-way coughs) → MUTATION SPIRAL (25: a counter-rotating double spiral that reverses every 2.4 s, plus coughs) → QUARANTINE (survive 15 s inside a 7×7 cyan box; the boss cannot be damaged) → CORONA FLARE (20: 24-rings with two 3-bullet gaps, plus coughs) → **R0 > 1** (25: REPLICATION 1→2→4 plus coughs; neutralized it reads "R0 < 1 · CONTAINED") | Its mutations are its phases |
| BIG SNEEZER (1-3 midboss) | ACHOO! (card 20: big sneezes, 9 × 2 speeds twice, plus coughs) | — |
| AEROSOL CLOUD (2-2 midboss) | MIST (22: aerosol sprays + slow rings) | — |
| MOTHER CELL (3-2 midboss) | BUDDING (phase 12: rings of shootable virions) → LYSIS (14: replication fans) → CELL BURST (14: alternating rings + virion rings) | — |
| LAMBDA (4-2 midboss) | TRACKING (phase 16: tracks you with even fans and slow rings; never an aimed stream from a tracker) → MIRROR (20: mirrors you 3 u aside; a lane jet locked where you stood when it started glowing; rings). Its damage spot is never inside its own beam | Echo's track and mirror |

Midbosses always drop an mRNA supply. Every card can be replayed alone from the MUTATION LAB once seen.

## Pattern presets and their fairness limits

| Preset | Family | Shape | Telegraph | Limits (Normal) |
| --- | --- | --- | --- | --- |
| COUGH | droplet | 1–3 on one line (speed stack) or a narrow aimed fan; aim locks at telegraph start | ≥ 0.5 s | n 1–3, 6–9 u/s, spread ≤ 30° |
| SNEEZE | droplet | Odd fan in speed tiers, repeated | ≥ 0.8 s | n 7–11 odd, 50–70°, 4–7 u/s, ≤ 3 reps |
| SNIFFLE | droplet | Even fan centred on you (sit in the gap) | ≥ 0.8 s | n 6–10 even, 40–60° |
| CORONA RING | spike/droplet/virion | Rings with alternating half-angle offset, optional 3-bullet gaps | ≥ 0.8 s | n 6–24, 2.5–5 u/s, 0.8–1.5 s apart |
| SPIKE BLOOM | spike | Spiral, rotation never a divisor of 360° | ≥ 0.8 s | n 6–12, every 0.2–0.4 s, 7–13° |
| DRIP | droplet | Aimed stream, re-aimed every bullet | ≥ 0.5 s | n 6–12, 0.08 s apart, 7–9 u/s |
| MUCUS WALL | glob | Full-width line with marked gaps | ≥ 1.0 s | 1–2 gaps ≥ 2.0 u (Easy 2.8), 3–4 u/s, solid elsewhere |
| AEROSOL | aerosol | Seeded cone, decelerating to 60% over 1 s, optional safe lanes | ≥ 0.8 s | ≤ 8 bullets/s, ≤ 120°, 2.5–4.5 u/s |
| SNEEZE JET | beam | Lane beam (glow, then 0.5 s live; the core counts if it overlaps the drawn width) | ≥ 1.0 s | width 1.6–2.4 u |
| RNA STRAND | rna | Bead chain on a sine | ≥ 0.8 s | amplitude ≤ 1.2 u, wavelength 4–6 u, 4–6 u/s |
| REPLICATION | droplet | Flashes 0.3 s, splits in two at ±25°, ≤ 3 generations | ≥ 0.8 s | 3–4 u/s |
| QUARANTINE BOX | — | 7×7 u soft-walled box | ≥ 1.0 s (outline) | set piece only |

Across all presets: fans and rings keep ≥ 0.5 u clear between neighbours 10 u from the source; at most two pattern families are live at once on Normal (one on Easy) and never two aimed families (COUGH, DRIP) together; no bullet spawns within 2.5 u of the core or at the bottom or side edges.
