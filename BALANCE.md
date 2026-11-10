# Corona Invaders: balance and evidence (revision five)

All numbers are from `core.mjs`, `patterns.mjs`, `levels.mjs` and `bosses.mjs`, and every measurement below was produced by `npm test` (or the same harness) on 2026-11-09. Tuning comes from the autopilot and a deliberately imperfect reactive player; no human playtest has confirmed it yet.

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

Movement audit (2026-11-10, `tests/browser/movement-audit.mjs`, results in MOVEMENT_AUDIT.md): the core marker, all six bullet families and the graze ring equal their projected colliders within one device pixel at 960×640, 390×844 and 320×568; real keys act on the next rendered frame; held keys, lost mouse releases and touch drag past an edge behave as documented. A scratch copy of the root browser suite (`ONLY="Corona Invaders"`, outside `common/`) passed 14/14 on the packaged ZIP after the audit.

Earlier art pass: real Chrome with SwiftShader WebGL at 960×640, 390×844 and 320×844 (throwaway Playwright scripts outside the repo): title, every world, all 25 boss and midboss cards, the hitbox overlay on four busy cards, the syringe (normal and hit flash), focus, SOAP, pause, game over, tray, MUTATION LAB and portrait views, with no console errors. A scratch copy of the root browser suite (`ONLY="Corona Invaders"`, run outside `common/` so it wrote no shared evidence) passed 14/14 on the packaged ZIP. Measured: core marker 9.0 px (960) / 7.3 px (390) / 6.0 px (320) across, the same as the collider; the board column is 428 px at 960×640.

Input and flow checks: moving the mouse with no button held left the syringe in place, and a held-button drag moved it. Space during the 1 s loss lock kept the loss screen; a fresh press after it retried. After three losses, Easy was the focused, highlighted button. The first visit showed the Easy start offer. At 390×844 and 320×844 the fullscreen button no longer overlaps pause, and the portrait cabinet is 828 px tall.

SwiftShader frame rates after the 3D art pass (lit meshes, rim light, contact shadows, layered board): title 60 fps, the 60-corona grid 55, a boss spiral 60, 4-3 OUTBREAK 60, and the 600-bullet fixture 43 (was 19; the brief's 55 fps software floor is still not met there). Real gameplay peaks near 140 bullets. Over 1.5 s after a start the median frame is 17 ms, but one long frame remains: 517 ms at the first 1-1 start, 317 ms at ALPHA, 283 ms at OMICRON and none at 4-3. That is after the boot prewarm (every shape compiled and rendered hidden), DOM writes only on change, and no width or display changes at boss entry. A CPU profile of those 1.5 s shows under 60 ms of script with the main thread otherwise idle, so the frame is lost in SwiftShader's GPU or compositor process. It has not been measured on a hardware GPU.
