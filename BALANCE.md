# Corona Invaders: balance and evidence (v1.0)

## v1.0 evidence (2026-11-10, the 12-stage suite)

Brief: `RESEARCH_V1.md`. Built on `main` from `189dfc7` (short syringe) to `50a40d3` (run rule). Every number below comes from `npm test` or `node tests/suite-audit.mjs` (the committed measurement: the 150 ms reactive player of `tests/reactive.mjs`, no SOAP, 99 vials so each stage runs to its end, the reference syringe at the stage's guaranteed power, 8 seeds 42/1/7/3/5/11/23/99). No human has played this suite yet; bots prove reachability and pressure, not fun.

### The kit changes

| Rule | v1.0 value | Why |
| --- | --- | --- |
| Syringe | 1.64 u long (was 5.1 u), 36.8 px at 960×640, tilt 10° (was 20°), every point inside the 1.0 u graze ring, core at the silhouette centroid (+0.016 u), muzzle at the drawn tip (z − 0.95), supply catcher = the 0.28 u barrel | The owner found the long syringe made the hitbox confusing |
| Spray | step 4.25° (was 4°): 3 needles ±4.25° at L1–2, 5 needles ±8.5° from L3 (3.1 u of coverage at 10 u) | Focus trade-off; the inner pair still lands on a boss at 17.6 u |
| Focused antibodies | ±0.75 u (was ±0.6), converging on the needle line 9 u ahead | Clear of the barrel; focus concentrates every needle |
| INJECT | tip collider r 0.05 at 0.95 u; popcorn cured at once (×2 score), elites 10 × stageHp; reload 0.5 / 0.8 s; 60 ms hitstop | The signature verb |
| Vials | +1 after a boss, none after a sample (was +1 per sample, full per world) | Defensive picks keep their value |
| Credits | 3 on Normal, unlimited on Easy; a continue restarts the stage from its entry | No permadeath; the 1CC stamp is the expert target |
| Card timeouts | max(25, round(1.6 × TTK)) (was 30 / 40) | A stalled card ends sooner |
| BLOOM | HP 7 (was 16), open 1.8 s (was 1.5), closed 2.6–3.4 s (was 3.4–4.6) | A 16 HP bud field stalled 4-2 for two minutes for the referee |
| HP hook | `levels.stageDps(stage)` = 24 / 24 / 30 / 42 by entry power; `stageHp(base, stage)` scales popcorn HP, card HP, SOAP and bursts | One function for the ADJUVANT draft to multiply |

### The suite audit (8 seeds)

| Stage | Time (s) | Peak | Mean alive | Spawn/s | Aimed / static / random | Speed median / max / static max / fan max / effective max | Quiet | Longest empty screen (s) | Longest stretch without a rest (s) | Near | Hits (mean / worst) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1-1 FIRST CONTACT | 64 | 14 | 4.2 | 0.9 | 25 / 75 / 0 | 4.5 / 5.5 / 4.5 / — / 5.5 | 38% | 4.2 | 23 | 0.33 | 0.00 / 0 |
| 1-2 GESUNDHEIT | 72 | 40 | 11.4 | 2.7 | 66 / 34 / 0 | 4.5 / 6.5 / 4.5 / 5.0 / 6.5 | 38% | 4.1 | 19 | 0.76 | 0.25 / 1 |
| 1-3 ALPHA | 60 | 59 | 20.1 | 7.0 | 33 / 67 / 0 | 4.0 / 7.5 / 4.0 / 6.5 / 7.5 | 27% | 2.3 | 15 | 0.78 | 0.13 / 1 |
| 2-1 DEEP BREATH | 70 | 29 | 7.5 | 1.6 | 34 / 62 / 4 | 4.5 / 6.5 / 4.5 / 5.5 / 8.5 | 32% | 5.3 | 20 | 0.52 | 0.25 / 1 |
| 2-2 GAS EXCHANGE | 72 | 42 | 12.7 | 3.6 | 27 / 62 / 11 | 3.5 / 6.5 / 4.5 / 5.5 / 8.5 | 33% | 3.4 | 27 | 0.62 | 0.25 / 1 |
| 2-3 BETA & GAMMA | 86 | 61 | 21.5 | 5.9 | 17 / 83 / 0 | 3.6 / 7.0 / 4.2 / 6.5 / 9.1 | 15% | 1.0 | 29 | 1.09 | 0.38 / 1 |
| 3-1 CIRCULATION | 66 | 38 | 10.6 | 2.9 | 63 / 36 / 1 | 5.8 / 7.5 / 5.0 / 5.5 / 8.3 | 31% | 4.2 | 20 | 0.55 | 0.13 / 1 |
| 3-2 SPLASHDOWN | 88 | 45 | 15.2 | 5.3 | 28 / 72 / 0 | 4.2 / 7.5 / 5.0 / 5.5 / 8.3 | 32% | 4.2 | 24 | 0.66 | 0.25 / 1 |
| 3-3 DELTA | 91 | 67 | 23.9 | 7.1 | 34 / 66 / 0 | 4.0 / 7.5 / 4.0 / 6.0 / 9.1 | 19% | 2.8 | 22 | 1.18 | 1.00 / 2 |
| 4-1 COPY ERROR | 71 | 42 | 8.5 | 2.4 | 49 / 51 / 0 | 5.1 / 8.0 / 5.0 / 7.0 / 8.0 | 29% | 5.1 | 26 | 0.68 | 0.88 / 2 |
| 4-2 FULL BLOOM | 87 | 95 | 19.4 | 6.1 | 54 / 46 / 0 | 4.7 / 8.0 / 5.0 / 7.0 / 8.0 | 30% | 4.7 | 34 | 0.79 | 0.50 / 1 |
| 4-3 OMICRON PRIME | 114 | 136 | 32.3 | 10.8 | 16 / 75 / 8 | 4.6 / 8.5 / 4.6 / 7.0 / 8.5 | 18% | 1.8 | 20 | 1.57 | 0.75 / 2 |

- **Clean run:** 15.7 min of play (brief band 14–18).
- **Ladders hold (T3):** near pressure and peaks rise strictly within every sector; each sector opens above the previous sector's opener and at most at the previous boss; the bosses rise strictly (near 0.78 < 1.09 < 1.18 < 1.57; peaks 59 < 61 < 67 < 136).
- **Speed bands hold:** static fields ≤ 5.0 u/s, aimed fans ≤ 7.0 u/s, nothing over 9.1 u/s effective (the exhale and the current included).
- **FAIR-150 (T4):** every stage cleared on every seed; worst seed ≤ 2 hits in sectors 1–2 and ≤ 2 in sectors 3–4; **0 forced hits** (for every reactive hit, the perfect-information autopilot replayed from a snapshot ≥ 0.5 s earlier, without SOAP, avoided it); **0 bullets** reach z ≥ 0 under 0.6 s after their telegraph started; the referee **never injected**. Every boss and midboss card still passes the per-card rule (`tests/curve.test.mjs`: mean ≤ 1.2 hits, worst ≤ 3, ≥ 3 of 5 starts with ≤ 1 hit), and every card ends by damage from at least 4 of 5 starts.
- **Phantom overlaps (T7):** bullets overlapping the drawn syringe without touching the core: **4.0 per minute** with the v1.0 silhouette against **20.9** for the 5.1 u syringe on the same runs (19 %; the brief asked for ≤ 30 %), at most 6.1 in any stage.
- **Drafts (T5):** a campaign emits exactly 11 `draft` events, boosted (`boss: true`) after stages 3, 6 and 9, none after 12.

**Misses against the brief, recorded and held by `KNOWN_GAPS` in `tests/suite.test.mjs` (they may improve, never regress):**

- Lengths: 1-1 64 s (band 65–75), 3-2 88 s (70–80), 4-2 87 s (70–80).
- Hit ceilings: 1-2 0.25 (≤ 0.20), DELTA 1.00 (≤ 0.70), 4-1 0.88 (≤ 0.65).
- Rests: the longest stretch without a 2.5 s rest exceeds 25 s in 2-2 (27), BETA & GAMMA (29), 4-1 (26) and 4-2 (34; MOTHER CELL's cards).
- Mix and quiet: BETA & GAMMA aimed 17 % (≥ 20 %) and quiet 15 % (≥ 20 %); OMICRON aimed 16 %; 1-1 quiet 38 % (≥ 40 %).
- The brief's absolute near and peak targets (±12 %) are not met: the shape (the sawtooth) holds, but sample pressure is lower than the table (for example 1-1 near 0.33 vs 0.25, 2-1 0.52 vs 0.50, 3-1 0.55 vs 0.75, 4-1 0.68 vs 1.00), and the bosses sit above it (ALPHA 0.78 vs 0.60). ALPHA is unchanged by design, so the table's absolute values were aspirational.

### Focus and skill (tests/syringe.test.mjs, tests/movement-audit.test.mjs)

- Focused / unfocused DPS on one 0.6 u target at 10 u: ×3.00 / ×4.03 / ×5.03 / ×7.05 at power 1–4 (brief: ≥ 1.5×).
- D1 (one 0.55 u target at 9 u): ×1.00 / ×1.34 / ×2.35 at power 1 / 2 / 4.
- D2 skill gradient: holding focus while lined up clears the four boss stages 16.2–17.0 % faster (seeds 42/1/7; target ≥ 15 %, was 14.7 %).

## Revision five (historical: the 18-stage campaign)

The sections below describe the 18-stage campaign before v1.0. The kit rows changed as listed above; the rest is kept as history.

## The kit

| Rule | Value | Why |
| --- | --- | --- |
| Core hitbox | 0.2 u radius, drawn as the glowing vaccine chamber at exactly that radius (9.0 px at 960×640, 7.3 px at 390, 6.0 px at 320) | The user found the old hitbox imprecise; the marker is the collider, never larger |
| Graze ring | 1.0 u; +10 points, +1 graze, once per bullet; a SOAP per 100 grazes | Rewards near misses without rewarding sitting in fire |
| Speed | 11.5 u/s; FOCUS 5.0 u/s (0.43×); no inertia and no blend (focus acts on the press step); diagonals normalised | Crosses the 17.8 u box in 1.55 s (a documented WARN: at 14 u/s the reactive player lost more vials in every world, see MOVEMENT_AUDIT.md); focus still escapes an aimed stream |
| Box | x ±8.9, z −3..12; the formation stops at z = −4 | Room for macro-dodges and point-blank |
| Auto-fire | 8 volleys/s, needles 34 u/s, 1 damage; SPRAY 3 (5 from L3) at ±4°; NEEDLE 3/3/4/5 parallel, 0.25 u apart; antibodies 4 needles/s each (2 from L2, 4 at L4), tucked to ±0.6–1.0 u in focus | Calm stream (the user asked for a lower fire rate earlier) |
| Power | L2 at 1 mRNA, L3 at 3, L4 at 5 | Guaranteed supplies give L2 in W1, L3 in W2, L4 in W3 |
| SOAP | 2 per vial (Easy 3), max 5; ring to 15 u in 0.6 s; 12 damage (scaled with HP); 3% of a boss card; 2.0 s invulnerability; voids the capture | Soap breaks the lipid envelope; panic button with a cost |
| Deathbomb | 0.18 s (Easy 0.35 s) | Forgives a late reaction |
| Death | −1 vial, −1 power (strand catchable for 4 s), all bullets cancelled, 0.5 s glide, 2.5 s invulnerability | Death-to-control ≈ 0.5 s |
| Spawn exclusion | No bullet within 2.5 u of the core | No point-blank surprise |
| Supplies | 3% of eligible kills, 12 s cooldown (booster ×1.5 for 8 s, mask 10 s 120° arc, soap +1); mRNA guaranteed from vesicles and midbosses; +1 vial at 250k and 750k | Rare random power-ups (user request) |
| Dose Chain | 2.0 s window, ×2..×6 at 5/10/16/24/32 kills | Kept from revision four |

## Hitboxes (hitboxes.mjs, tests/hitboxes.test.mjs)

One module defines every collider and how it is drawn, and the tests compare each against the renderer's sprite or mesh sizes.

| Thing | Collider | Drawn as |
| --- | --- | --- |
| Syringe | core circle r 0.2 | the chamber marker, outer edge = r; the rest of the syringe never collides |
| Droplet / spike protein | capsules r 0.15, half 0.12 / r 0.13, half 0.16, along the travel | the solid sprite body (rim included); the glow is outside it |
| Aerosol / RNA bead / virion / glob | circles r 0.15 / 0.15 / 0.2 / 0.42 | the solid sprite body |
| Enemies and bosses | body sphere (capsules for BUDDER 0.62 + 0.28 and RNA WORM 0.38 + 0.9) | the body mesh is scaled to the collider; spikes are decoration for needles, contact and SOAP alike |
| Needle | segment from the tip back 0.9 u, r 0.06 | the drawn needle, tip at the shot position |
| Lane beam | its rectangle, exact width | drawn at exactly that width |
| SOAP ring / supplies | the drawn ring radius / supply r + the 0.4 u barrel | ring clipped to the board; supply sprite 2r |

Collisions are swept over each 1/120 s substep in the bullet's frame, so a fast bullet cannot pass through the core between two substeps (tested with a bullet at 120 u/s; needles at 34 u/s are tested the same way against the smallest virus). The dev overlay (`?hitboxes=1` or `__game.hitboxes(true)`) draws every collider on the board plane. The smallest bullet solid measures 5.0 px at the far edge at 960×640, 4.5 px at 390 and 3.7 px at 320.

**Easy vs Normal:** bullets per emitter ×0.6 (fan parity kept), speed ×0.85, telegraphs +0.15 s, 5 vials and 3 SOAP per vial, auto-SOAP on hit, 0.35 s deathbomb, enemy HP ×0.85, one live pattern family instead of two, 2.8 u wall gaps, NEUTRALIZED ×0.5.

## Time-to-kill as power grows

Card HP = round(TTK × the effective DPS of the power the campaign guarantees there × 0.7): 24 at power 1–2, 30 at 3, 42 at 4. Popcorn HP, cell pops and SOAP damage scale by the same ratio (×1, ×1.25, ×1.75). Without the power scaling, measured world 3–4 bosses died in half their TTK and the curve flattened.

The ×0.7 card factor and the ±4° spray answer a playtest: cards ended on the timer, because at ±9° the side needles missed a boss at range. An outside test bot measured boss stages at 124–210 s before and 62–137 s after. A test now requires every card's HP, at 75% of the reference DPS, to fall within 80% of its timeout. SPIKE CROWN had a 35 s TTK against a 30 s phase timeout (it could never be cleared); it is now 20 s, and its shielded core is intangible so needles reach the nodes. Pools: ALPHA 1344, BIG SNEEZER 336, AEROSOL CLOUD 370, BETA & GAMMA 1806, MOTHER CELL 840, DELTA 2999, LAMBDA 1058, OMICRON PRIME 3381.

## Pressure by world

| | W1 | W2 | W3 | W4 |
| --- | --- | --- | --- | --- |
| Stage cap (Normal peak, non-boss) | 30 (1-1) / 45 | 70 | 95 | 120 |
| Choir interval (full → thin) / size | 1-1: 2.5 → 1.8 s / 1–2; then 1.8 → 1.2 s / 2–3 | 1.45 → 1.0 s / 3–4 | 1.15 → 0.8 s / 3–5 | 0.95 → 0.65 s / 4–6 |
| Mid-stage surge (choir twice as often, +1 singer) | 5 s | 6 s | 7 s | 8 s |
| Measured boss peak (card arena) | ALPHA 58 | BETA & GAMMA 40 | DELTA 31 | OMICRON 139 |

1-1 was softened (a slower, thinner choir) and every stage from 1-2 to 4-3 gets a surge after its second grid, so a stage has a peak instead of a flat line.

Measured live campaign peaks stay under the caps (tested): every sample ≤ its cap, bosses ≤ 90 / 120 / 150 / 200.

## Fairness evidence (tests/patterns.test.mjs)

- Every authored pattern use (archetypes in all four worlds, mutated W4 variants, flights, all 25 cards; 100+ uses) is inside its preset LIMITS, including family speed ranges, odd SNEEZEs, even SNIFFLEs and spiral rotations that never divide 360°.
- Every fan and ring emission keeps ≥ 0.5 u clear between neighbours 10 u from its source (40+ emissions measured on real emitters).
- MUCUS WALL: only the marked gaps are passable, each ≥ 2.0 u (≥ 2.8 u on Easy), centres within ±7.5 u.
- AEROSOL ≤ 8 bullets/s per emitter.
- Telegraph minimums: 0.5 s aimed, 0.8 s fans, 1.0 s walls, 1.5 s beams (a beam is instant once live, so its telegraph is the whole warning). From the formation front every bullet pattern needs at least 2.08 s from first sight to reach the core; in live play every near pass had at least 1.72 s.
- Every pattern preset at its harshest authored use, fired every 3 s for 16 s from five starts, is dodged by the 150 ms reactive player without SOAP (tests/movement-audit.test.mjs).
- On a live controller campaign (seed 1): never more than two live pattern families, never two aimed families together, no emitter below its telegraph minimum, every boss attack ≥ 1.5 s after a card start, no bullet appearing at the bottom or side edges.

## Dodgeability: every card, 150 ms reactive player, no SOAP

`tests/reactive.mjs` acts on a 150 ms-old view every 100 ms, extrapolates what it sees in straight lines (on-screen velocity; it does not know sines, splits or upcoming twist changes), commits to one keyboard direction per decision and prefers sidestepping out of a bullet's line. Each card was run alone from five starts (x = −6, −3, 0, 3, 6); the test requires mean ≤ 1.2 hits per run, worst ≤ 3, and ≥ 3 of 5 starts with at most one hit.

Remeasured on 2026-11-10 after the movement audit (instant focus, 1.5 s beams, MOVEMENT_AUDIT.md):

| Card | Hits (5 starts) | Card | Hits |
| --- | --- | --- | --- |
| ALPHA COUGH COUGH | 0 0 0 0 0 | DELTA TRIANGULATE | 0 0 0 0 0 |
| ALPHA FIRST SNEEZE | 0 0 0 0 0 | DELTA LANE SNEEZE | 0 0 0 0 0 |
| ALPHA SPIKE BLOOM | 0 0 0 0 0 | DELTA HALVES | 0 0 0 0 0 |
| ALPHA CORONA | 0 1 0 0 0 | DELTA BLOOD RUSH | 0 0 0 0 1 |
| B&G PING-PONG | 0 0 0 0 0 | DELTA Δ CASCADE | 0 0 0 0 0 |
| B&G CROSS INFECTION | 0 0 0 0 0 | OMICRON SPIKE CROWN | 0 0 0 0 0 |
| B&G MIRROR STRAIN | 0 0 0 0 0 | OMICRON SNEEZE STORM | 0 0 0 0 0 |
| B&G DOUBLE HELIX | 0 0 0 0 0 | OMICRON MUTATION SPIRAL | 0 1 0 0 0 |
| BIG SNEEZER ACHOO! | 0 0 0 0 0 | OMICRON QUARANTINE | 0 0 0 0 0 |
| AEROSOL CLOUD MIST | 0 0 0 0 0 | OMICRON CORONA FLARE | 0 0 0 0 0 |
| MOTHER BUDDING / LYSIS / CELL BURST | 0s / 0s / 0s | OMICRON R0 > 1 | 0 1 1 1 0 |
| LAMBDA TRACKING / MIRROR | 0 0 1 0 0 / 0s | | |

The same runs also test that every card ends by damage, not on the timer, from at least 4 of 5 starts. All of them do, from all five starts, except one BLOOD RUSH start that timed out. Hits are lower than in the previous table, as expected with cards about 30% shorter.

Two structural problems found this way were fixed rather than tuned around: MIRROR STRAIN let both twins stack on one column (the front twin sparked every needle, so the card could only time out), and LAMBDA paired a tracker with an aimed stream. LAMBDA MIRROR was then still the hardest card in playtest (2.5 hits per run for the outside bot): its jet ran down LAMBDA's own column, the only place to hit it. The jet now locks where the syringe stood at telegraph start and LAMBDA mirrors you 3 u aside, so its damage spot is never inside the beam (0 hits for that bot, 0 here).

## The difficulty curve (tests/curve.test.mjs)

Each sample was played from its tray entry by the reactive player on eight seeds (42, 1, 7, 3, 5, 11, 23, 99). "Lost" is vials lost per sample without SOAP; "near" is bullets within 3 u of the core per 0.1 s sample (the dodging load).

Remeasured on 2026-11-10 after the movement audit:

| Sample | Lost | Near | Sample | Lost | Near |
| --- | --- | --- | --- | --- | --- |
| 1-1 FIRST CONTACT | 0.00 | 0.22 | 3-1 CIRCULATION | 0.38 | 1.29 |
| 1-2 GESUNDHEIT | 0.13 | 0.38 | 3-2 HIJACK | 0.13 | 0.67 |
| 1-3 BUDDING | 0.38 | 0.80 | 3-3 VARIANT SURGE | 0.13 | 0.89 |
| 1-4 ALPHA | 0.13 | 0.81 | 3-4 DELTA | 0.25 | 0.80 |
| 2-1 GAS EXCHANGE | 0.00 | 0.60 | 4-1 AGAR | 0.63 | 1.03 |
| 2-2 AEROSOL | 0.13 | 0.57 | 4-2 MUTATION | 0.25 | 0.72 |
| 2-3 DEEP BREATH | 0.13 | 0.70 | 4-3 OUTBREAK | 1.38 | 1.53 |
| 2-4 BETA & GAMMA | 0.50 | 1.22 | 4-4 OMICRON PRIME | 0.50 | 1.55 |

| World mean | W1 | W2 | W3 | W4 |
| --- | --- | --- | --- | --- |
| Vials lost (no SOAP) | 0.16 | 0.19 | 0.22 | 0.69 |
| Bullets near the core | 0.55 | 0.77 | 0.91 | 1.21 |

Both rise strictly by world (tested, with W4 ≥ 1.8× W1). The vial margins between W1, W2 and W3 are now thin (0.16 / 0.19 / 0.22, from 0.03 / 0.25 / 0.56 before the audit): instant focus and longer beam warnings changed the reactive trajectories, and single-sample losses move by ±0.25 with small changes. Without SOAP the reactive player cleared every sample on the first try on all eight seeds, except 4-3 on seed 11 (one retry). With SOAP allowed, the same player clears every sample within three tries on every seed, and every world-1 sample and B1 on the first try. Single-sample vial losses are noisy (small changes move one sample by ±1), which is why the table uses eight seeds and the pressure metric; the W1→W2 and W2→W3 vial margins (0.03 each) are now the thinnest, while pressure rises clearly (0.55 → 0.77 → 0.91 → 1.21).

## Controller campaign (tests/model.test.mjs)

`autopilot.mjs` samples 9 directions × {normal, focus} over a 0.42 s look-ahead with the real bullet motion and bombs only for an unavoidable hit. It is self-contained (the root suite serializes it with `toString`) and returns ordinary inputs only.

| Seed | Result | Frames (1/60 s) | Vials lost | SOAP used | Grazes | Kills | Score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 42 | won, all 18 | 60,340 | 0 | 0 | 611 | 786 | 2,559,345 |
| 1 | won, all 18 | 59,315 | 0 | 1 | 622 | 776 | 2,420,900 |
| 7 | won, all 18 | 58,913 | 0 | 0 | 612 | 782 | 2,523,358 |

Remeasured after the movement audit (instant focus, 1.5 s beams). Frame budget for the root suite: `60 * 1800` (108,000), unchanged. Shorter boss cards cut the campaign from about 79k to 56–60k frames.

## Browser evidence

Sound and personality pass (2026-11-10): balance, patterns, speeds and colliders are unchanged (`tests/personality.test.mjs` snapshots every collider). The root browser suite (`cd common && ONLY="Corona Invaders" npm run test:browser`) passed 16/16 on the packaged ZIP, including two new checks. In one, faces and idle life never draw a body wider than its collider: the maximum drawn/collider ratio was 1.0000 over 4 s of the 1-1 choir, and the worst face was 0.33 px inside its silhouette over 10,345 face samples, with a 16.7 ms median frame. In the other, ALPHA enters with its name card and taunts. `tests/browser/personality-audit.mjs` and `tests/browser/audio-measure.mjs` have the frame-time and sound tables (README).

Movement audit (2026-11-10, `tests/browser/movement-audit.mjs`, results in MOVEMENT_AUDIT.md): the core marker, all six bullet families and the graze ring equal their projected colliders within one device pixel at 960×640, 390×844 and 320×568; real keys act on the next rendered frame; held keys, lost mouse releases and touch drag past an edge behave as documented. A scratch copy of the root browser suite (`ONLY="Corona Invaders"`, outside `common/`) passed 14/14 on the packaged ZIP after the audit.

Earlier art pass: real Chrome with SwiftShader WebGL at 960×640, 390×844 and 320×844 (throwaway Playwright scripts outside the repo): title, every world, all 25 boss and midboss cards, the hitbox overlay on four busy cards, the syringe (normal and hit flash), focus, SOAP, pause, game over, tray, MUTATION LAB and portrait views, with no console errors. A scratch copy of the root browser suite (`ONLY="Corona Invaders"`, run outside `common/` so it wrote no shared evidence) passed 14/14 on the packaged ZIP. Measured: core marker 9.0 px (960) / 7.3 px (390) / 6.0 px (320) across, the same as the collider; the board column is 428 px at 960×640.

Input and flow checks: moving the mouse with no button held left the syringe in place, and a held-button drag moved it. Space during the 1 s loss lock kept the loss screen; a fresh press after it retried. After three losses, Easy was the focused, highlighted button. The first visit showed the Easy start offer. At 390×844 and 320×844 the fullscreen button no longer overlaps pause, and the portrait cabinet is 828 px tall.

SwiftShader frame rates after the 3D art pass (lit meshes, rim light, contact shadows, layered board): title 60 fps, the 60-corona grid 55, a boss spiral 60, 4-3 OUTBREAK 60, and the 600-bullet fixture 43 (was 19; the brief's 55 fps software floor is still not met there). Real gameplay peaks near 140 bullets. Over 1.5 s after a start the median frame is 17 ms, but one long frame remains: 517 ms at the first 1-1 start, 317 ms at ALPHA, 283 ms at OMICRON and none at 4-3. That is after the boot prewarm (every shape compiled and rendered hidden), DOM writes only on change, and no width or display changes at boss entry. A CPU profile of those 1.5 s shows under 60 ms of script with the main thread otherwise idle, so the frame is lost in SwiftShader's GPU or compositor process. It has not been measured on a hardware GPU.

## Adjuvants: the v1.0 draft (2026-11-10, measured on the real 12-stage model)

Brief: [RESEARCH_CARDS.md](./RESEARCH_CARDS.md). Pure tests: `tests/cards.test.mjs` (37); whole runs: `npm run test:balance` (`tests/balance.mjs`, 30 seeds × 6 pairs, 6 workers, about 70 s). Measurements below come from `cards.mjs` and the shipped campaign, not from the brief's scratch model.

**Draft odds (6,000 simulated 12-stage runs, random drafter).** Every per-draft mean of §4.6 within ±0.03, every P(legendary) within ±1.5 points. No legendary offered in 23.2% of runs (brief 23.3%, band 20–27%). Legendaries picked 0/1/2: 61.6 / 32.7 / 5.7% (brief 63 / 32 / 5.5). Rarest-first drafter: 22.6 / 43.8 / 33.6% (brief 23 / 44 / 33). The 18-stage fallback fixture (§4.7): 1.58 legendaries shown per run, 17.9% offered none, rarest-first two legendaries in 47.6% (brief 49%).

**EXPECTED_POTENCY (frozen, 2,000 seeds; re-measured within 5% by test 10).** 12 stages: 1.00 1.00 1.056 1.094 1.15 1.206 1.27 1.329 1.313 1.388 1.449 1.511 (brief planning 1.00 1.00 1.04 1.09 1.13 1.19 1.25 1.30 1.29 1.36 1.43 1.49). Enemy and card HP follow it through `levels.stageDps(stage, s)` only when `s.drafts` is on.

**Tuning changed by measurement (the brief's number → shipped):**

| Rule | Brief | Shipped | Why (measured) |
| --- | --- | --- | --- |
| T3 potency limit | ×2.2 | **×2.15** | Greedy offense reached 1.503× the random median entering 4-2, over the 1.5× ceiling; now ≤ 1.5× at every stage |
| Coating on respawn | full | **one charge** (LNP's second re-forms) | LNP with the defensive stack measured 30 hits to game over (ceiling 24) |
| Coating re-form floor | 15 s | **20 s** | LNP × 0.75 on two ENTERIC copies then measured 25 hits; at 20 s, 19 |

**Ceilings (unit tests).** No deck exceeds its titer limit (10,000 random decks). Greedy offense ≤ 1.5× the random median at every stage. STRONGEST_BUILD ends a card at ≥ 0.7 × E ÷ limit of its TTK: **44.7%** at worst (2-2's midboss), against the 40% floor. Hits to game over (core hit every 6 s, no input, real model): Normal 3, Easy 20, the worst non-legendary Normal deck (EXTRA DOSE ×2, LATHER ×2, EPIPEN, ENTERIC ×2, BACKUP ALIQUOT) **18** (≤ 20), plus LNP 19, plus AUTOCLAVE 22 (≤ 24). **Known excess:** LNP and AUTOCLAVE together on that stack measure 29 in an endless stage. Single legendaries: LNP alone +4 hits, ENTERIC +3 (one per vial at 3 vials, over the rare budget of +2), EPIPEN +3.

**Whole runs (test 12, 30 seeds, Normal, 3 credits; the card squad's run, kept as recorded).** With SOAP the 150 ms reactive player deathbombs so well that every pair clears on one credit, so the no-SOAP pass is the informative one:

| Pair | 1CC (SOAP on) | 1CC (no SOAP) | Credits used (no SOAP) | Boss time (s) | Vials lost per 4-x stage | Legendaries 0/1/2 |
| --- | --- | --- | --- | --- | --- | --- |
| autopilot × random | 30/30 | 30/30 | 0.00 | 70.6 | 0.00 | 14/15/1 |
| reactive × random | 30/30 | 24/30 | 0.37 | 105.2 | 0.59 | 16/13/1 |
| reactive × greedy offense | 30/30 | 24/30 | 0.23 | 83.9 | 0.24 | 8/14/8 |
| reactive × greedy defense | 30/30 | 29/30 | 0.03 | 94.9 | 0.06 | 6/21/3 |
| reactive × placebo (discard all) | 30/30 | 9/30 | 1.43 | 128.5 | 1.34 | 30/0/0 |
| reactive × reference syringe (drafts off) | 30/30 | 10/30 | 0.93 | 106.6 | 1.17 | — |

- **Pass (both passes):** autopilot 1CC ≥ 96%; random finishes within 3 credits (29/30 without SOAP); offense 1CC ≥ random; offense boss time 79–80% of random (band 70–90%); placebo boss time 1.22× random (≥ 1.2×); placebo finishes 26/30 (≥ 80%); greedy offense never ends a card under **42%** of its TTK (measured, T6 floor 40%).
- **Miss (no-SOAP pass only):**
  - 2b: random decks 1CC 24/30 against the reference syringe's 10/30. The target is ±10 points.
  - 4a: defense decks lose 0.06 vials per sector-4 stage against 0.59. The target is ≥ 25% of random.
  - 4b: defense core hits per minute 0.35 against 0.39. The target is ≥ random.
- **Cause (as the card squad recorded it at 30 seeds):** potency measures focused single-target DPS on a boss, while this player sprays at popcorn.

### The spray-aware potency experiment and the real cause (2026-11-10, v1.0 finishing squad)

**Built and measured, then not shipped.** `cards.mjs` now computes `sprayPotency` for every kit: the deck's unfocused formation DPS over the base kit's, under the same titer scale. In this model TWIN BARREL adds 2 spray needles, HOLLOW BORE and FEVER reach a second row, SPLIT TIP re-fires on kills, and STEADY HAND and the jet count for nothing (`sprayDpsOf`; its conventions are a 0.5 formation depth, 1 kill per 3 needles and half the split needles landing). The random drafter's median spray potency runs above the focused table: 1.00 1.00 1.06 1.17 1.25 1.28 1.39 1.46 1.47 1.60 1.69 1.77, against 1.00 … 1.51.

Routing formation HP (popcorn, SOAP and cell-pop damage) through that table and re-running test 12 at the brief's 50 seeds gave:

| No-SOAP pass, 50 seeds | Focused HP (shipped) | Spray-priced formation HP (experiment) |
| --- | --- | --- |
| 2b random 1CC vs reference | 37 vs 16 (MISS) | 34 vs 16 (MISS) |
| 3a offense 1CC ≥ random | 41 vs 37 (PASS) | 38 vs 34 (PASS) |
| 4a defense vials per 4-x stage ≥ 25% of random | 0.04 vs 0.57 (MISS) | 0.09 vs 0.67 (MISS) |
| 4b defense hits/min ≥ random | 0.33 vs 0.38 (MISS) | 0.31 vs 0.42 (MISS) |
| 5b placebo finishes ≥ 80% | 44/50 (PASS) | **38/50 (MISS)** |
| SOAP pass: all ten targets | 10/10 PASS (4b 0.35 vs 0.35) | 9/10 (4b 0.31 vs 0.37 MISS) |

The spray price moved the three misses by less than their gaps and broke 5b, so HP stays on the focused `EXPECTED_POTENCY`. `sprayPotency` stays as a reported diagnostic (`spray@end` in the test-12 table). The 30-seed scratch runs agreed: 2b 24 → 22 vs 10, and 3a, 5a and 5b all failed.

**The real cause is survivability, not kill speed.** test 12 now counts how each core hit ends (`deaths`, and `saves` = coating absorbs + EPIPEN + auto-SOAP):

| Pair (no SOAP, 50 seeds) | Deaths per run | Saves per run | 1CC |
| --- | --- | --- | --- |
| reactive × reference syringe | 7.10 | 0 | 16/50 |
| reactive × random | 4.80 | 2.54 | 37/50 |
| reactive × greedy defense | 1.40 | 4.14 | 49/50 |
| reactive × greedy offense | 3.34 | 0.64 | 41/50 |
| reactive × placebo | 9.66 | 0 | 12/50 |

A 30-seed scratch breakdown agrees: random decks take more threats than the reference (8.96 against 7.10 per run) but convert 3.3 of them into saves. Two rules make defence nearly free for a player who is hit about every 2.5 minutes and never presses SOAP:

1. **The coating is full at every sample start.** Its re-form timer barely matters: setting it to 60 s, or off entirely, changed no 1CC count.
2. **EPIPEN spends a SOAP stock that this player never uses.**

Greedy offense still 1CCs more than random because it kills popcorn before it fires (4.74 threats per run).

No HP scaling can close 2b without failing 5b, because both act on the same stages. Closing 2b, 4a and 4b means pricing survivability: a coating that refills per boss rather than per sample, EPIPEN at 3 SOAP, or judging 2b on the SOAP pass. Each of those changes a card's identity or the brief's target, so it is left to the lead game designer's difficulty brief. The owner has since asked for a harder game with a real difficulty curve.

- **Not run:** targets 6 and 7 (the ladders and FAIR-150 with random decks and at the 10.58 / 12.88 u/s extremes), and the favour-one-card bands of §5.5.

## Readability: high-contrast bullets (v1.0, 2026-11-10)

The brief's SHOULD item asks for each bullet's core to stay readable over every sector backdrop and over enemies, with colliders at or under what is visible.

**Measured** on real frames: 960 × 640, Chrome with SwiftShader, every one of the 12 stages in practice. Backdrop pixels come from the bullet field with bullets and enemies cleared. Enemy pixels are the pixels that get brighter when the formation or boss is present. The table gives WCAG contrast, and a bullet counts as readable over a pixel if any of its layers reaches 3:1 against it.

- **Before:** the 4.5 sprite-px dark rim sat inside the collider. That is about 0.5 screen px, below what the eye resolves, so in practice the bullet was its body plus its white core.
  - Over the floors, the worst 1% of pixels was 2.25–2.97:1.
  - Over enemies it was 1.60–1.97:1. Over 3-2's viruses only 30% of enemy pixels reached 3:1 for an aerosol dot.
  - The cause: pink #ff4fa3 has a relative luminance of 0.30, and the lit green viruses (#12ce5d, 0.45) and the grey-white boss bodies (#e6e8ee) sit close to it. Pink against green is 1.45:1, white core against the boss body 1.11:1. Over an enemy, a bullet read by hue alone.
- **After:** a 9 sprite-px near-black outline (`hitboxes.BULLET_OUTLINE_PX`, about 0.9 screen px at the far edge) sits **outside** the solid, like the glow.
  - The coloured capsule now fills exactly the collider, so the visible solid is never smaller than what hits you. The QA solid mask, `drawnSolid` and the collider pins are unchanged.
  - The virion gained the white core the other families have.
  - Every family over every sampled backdrop and enemy pixel in all 12 stages now has a layer at 3:1 or more: the worst 1% is 4.28:1, and 100% of pixels pass in every row.
  - `tests/theme.test.mjs` asserts the palette side: the outline is at least 3:1 against every virus and boss colour (9.45–16.3:1 measured), the core is at least 3:1 against the brightest measured floor (4.28:1), and the outline sits inside the sprite margin.
- **Evidence:** `common/artifacts/ci-v1-release/contrast-before.txt`, `contrast-after.txt` and `bullets-after-*.png`.
- **Speed trails were not added.** Bullet direction already reads from the capsule's long axis and the leading core, and a trail would add area near the core that is not collider.
