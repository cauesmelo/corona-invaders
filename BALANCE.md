# Corona Invaders: balance and evidence (revision five)

All numbers are from `core.mjs`, `patterns.mjs`, `levels.mjs` and `bosses.mjs`, and every measurement below was produced by `npm test` (or the same harness) on 2026-11-09. Tuning comes from the autopilot and a deliberately imperfect reactive player; no human playtest has confirmed it yet.

## The kit

| Rule | Value | Why |
| --- | --- | --- |
| Core hitbox | 0.16 u radius, drawn ≥ 6.7 px at every width (white dot, dark rim) | Bullet-hell convention; hits are exactly what is drawn |
| Graze ring | 1.0 u; +10 points, +1 graze, once per bullet; a SOAP per 100 grazes | Rewards near misses without rewarding sitting in fire |
| Speed | 11.5 u/s; FOCUS 5.0 u/s (0.43×); linear 60 ms blend; diagonals normalised | Crosses the board in ~1.5 s; focus still escapes an aimed stream |
| Box | x ±8.9, z −3..12; the formation stops at z = −4 | Room for macro-dodges and point-blank |
| Auto-fire | 8 volleys/s, needles 34 u/s, 1 damage; SPRAY 3 (5 from L3) at ±9°; NEEDLE 3/3/4/5 parallel, 0.25 u apart; antibodies 4 needles/s each (2 from L2, 4 at L4), tucked to ±0.6–1.0 u in focus | Calm stream (the user asked for a lower fire rate earlier) |
| Power | L2 at 1 mRNA, L3 at 3, L4 at 5 | Guaranteed supplies give L2 in W1, L3 in W2, L4 in W3 |
| SOAP | 2 per vial (Easy 3), max 5; ring to 15 u in 0.6 s; 12 damage (scaled with HP); 3% of a boss card; 2.0 s invulnerability; voids the capture | Soap breaks the lipid envelope; panic button with a cost |
| Deathbomb | 0.18 s (Easy 0.35 s) | Forgives a late reaction |
| Death | −1 vial, −1 power (strand catchable for 4 s), all bullets cancelled, 0.5 s glide, 2.5 s invulnerability | Death-to-control ≈ 0.5 s |
| Spawn exclusion | No bullet within 2.5 u of the core | No point-blank surprise |
| Supplies | 3% of eligible kills, 12 s cooldown (booster ×1.5 for 8 s, mask 10 s 120° arc, soap +1); mRNA guaranteed from vesicles and midbosses; +1 vial at 250k and 750k | Rare random power-ups (user request) |
| Dose Chain | 2.0 s window, ×2..×6 at 5/10/16/24/32 kills | Kept from revision four |

**Easy vs Normal:** bullets per emitter ×0.6 (fan parity kept), speed ×0.85, telegraphs +0.15 s, 5 vials and 3 SOAP per vial, auto-SOAP on hit, 0.35 s deathbomb, enemy HP ×0.85, one live pattern family instead of two, 2.8 u wall gaps, NEUTRALIZED ×0.5.

## Time-to-kill as power grows

Card HP = TTK × the effective DPS of the power the campaign guarantees there: 24 at power 1–2, 30 at 3, 42 at 4. Popcorn HP, cell pops and SOAP damage scale by the same ratio (×1, ×1.25, ×1.75). Pools: ALPHA 1920, BIG SNEEZER 480, AEROSOL CLOUD 528, BETA & GAMMA 2580, MOTHER CELL 1200, DELTA 4536, LAMBDA 1512, OMICRON PRIME 5460. Without this, measured world 3–4 bosses died in half their TTK and the curve flattened.

## Pressure by world

| | W1 | W2 | W3 | W4 |
| --- | --- | --- | --- | --- |
| Stage cap (Normal peak, non-boss) | 30 (1-1) / 45 | 70 | 95 | 120 |
| Choir interval (full → thin) / size | 1.8 → 1.2 s / 2–3 | 1.45 → 1.0 s / 3–4 | 1.15 → 0.8 s / 3–5 | 1.05 → 0.72 s / 4–6 |
| Measured boss peak (card arena) | ALPHA 59 | BETA & GAMMA 44 | DELTA 31 | OMICRON 130 |

Measured live campaign peaks stay under the caps (tested): every sample ≤ its cap, bosses ≤ 90 / 120 / 150 / 200.

## Fairness evidence (tests/patterns.test.mjs)

- Every authored pattern use (archetypes in all four worlds, mutated W4 variants, flights, all 25 cards; 100+ uses) is inside its preset LIMITS, including family speed ranges, odd SNEEZEs, even SNIFFLEs and spiral rotations that never divide 360°.
- Every fan and ring emission keeps ≥ 0.5 u clear between neighbours 10 u from its source (40+ emissions measured on real emitters).
- MUCUS WALL: only the marked gaps are passable, each ≥ 2.0 u (≥ 2.8 u on Easy), centres within ±7.5 u.
- AEROSOL ≤ 8 bullets/s per emitter.
- On a live controller campaign (seed 1): never more than two live pattern families, never two aimed families together, no emitter below its telegraph minimum, every boss attack ≥ 1.5 s after a card start, no bullet appearing at the bottom or side edges.

## Dodgeability: every card, 150 ms reactive player, no SOAP

`tests/reactive.mjs` acts on a 150 ms-old view every 100 ms, extrapolates what it sees in straight lines (on-screen velocity; it does not know sines, splits or upcoming twist changes), commits to one keyboard direction per decision and prefers sidestepping out of a bullet's line. Each card was run alone from five starts (x = −6, −3, 0, 3, 6); the test requires mean ≤ 1.2 hits per run, worst ≤ 3, and ≥ 3 of 5 starts with at most one hit.

| Card | Hits (5 starts) | Card | Hits |
| --- | --- | --- | --- |
| ALPHA COUGH COUGH | 0 0 0 0 0 | DELTA TRIANGULATE | 0 0 0 0 0 |
| ALPHA FIRST SNEEZE | 0 0 0 0 1 | DELTA LANE SNEEZE | 2 1 0 1 1 |
| ALPHA SPIKE BLOOM | 0 1 0 0 0 | DELTA HALVES | 0 0 0 0 0 |
| ALPHA CORONA | 0 0 0 0 0 | DELTA BLOOD RUSH | 1 1 1 2 0 |
| B&G PING-PONG | 0 0 0 0 0 | DELTA Δ CASCADE | 0 0 0 0 0 |
| B&G CROSS INFECTION | 0 0 0 0 0 | OMICRON SPIKE CROWN | 0 0 1 0 0 |
| B&G MIRROR STRAIN | 0 0 1 0 1 | OMICRON SNEEZE STORM | 0 0 0 0 0 |
| B&G DOUBLE HELIX | 2 0 1 1 1 | OMICRON MUTATION SPIRAL | 0 0 0 1 0 |
| BIG SNEEZER ACHOO! | 0 0 1 0 0 | OMICRON QUARANTINE | 1 0 1 0 0 |
| AEROSOL CLOUD MIST | 1 0 0 0 0 | OMICRON CORONA FLARE | 0 0 1 1 2 |
| MOTHER BUDDING / LYSIS / CELL BURST | 0s / 0s / 1 1 1 0 0 | OMICRON R0 > 1 | 0 0 0 0 0 |
| LAMBDA TRACKING / MIRROR | 1 0 0 0 0 / 0s | | |

Two structural problems found this way were fixed rather than tuned around: MIRROR STRAIN let both twins stack on one column (the front twin sparked every needle, so the card could only time out), and LAMBDA paired a tracker with an aimed stream.

## The difficulty curve (tests/curve.test.mjs)

Each sample was played from its tray entry by the reactive player on eight seeds (42, 1, 7, 3, 5, 11, 23, 99). "Lost" is vials lost per sample without SOAP; "near" is bullets within 3 u of the core per 0.1 s sample (the dodging load).

| Sample | Lost | Near | Sample | Lost | Near |
| --- | --- | --- | --- | --- | --- |
| 1-1 FIRST CONTACT | 0.00 | 0.26 | 3-1 CIRCULATION | 1.25 | 1.03 |
| 1-2 GESUNDHEIT | 0.00 | 0.26 | 3-2 HIJACK | 0.50 | 0.73 |
| 1-3 BUDDING | 0.25 | 1.00 | 3-3 VARIANT SURGE | 1.13 | 0.95 |
| 1-4 ALPHA | 0.38 | 0.95 | 3-4 DELTA | 0.38 | 0.96 |
| 2-1 GAS EXCHANGE | 0.13 | 0.52 | 4-1 AGAR | 1.13 | 1.02 |
| 2-2 AEROSOL | 0.13 | 0.88 | 4-2 MUTATION | 0.25 | 0.79 |
| 2-3 DEEP BREATH | 0.38 | 0.71 | 4-3 OUTBREAK | 1.25 | 2.46 |
| 2-4 BETA & GAMMA | 0.75 | 1.44 | 4-4 OMICRON PRIME | 1.38 | 1.65 |

| World mean | W1 | W2 | W3 | W4 |
| --- | --- | --- | --- | --- |
| Vials lost (no SOAP) | 0.16 | 0.34 | 0.81 | 1.00 |
| Bullets near the core | 0.62 | 0.89 | 0.92 | 1.48 |

Both rise strictly by world (tested, with W4 ≥ 1.8× W1). With SOAP allowed, the same player clears every sample within three tries on every seed, and every world-1 sample and B1 on the first try. Single-sample vial losses are noisy (small changes move one sample by ±1), which is why the table uses eight seeds and the pressure metric; the W2→W3 pressure margin is the thinnest.

## Controller campaign (tests/model.test.mjs)

`autopilot.mjs` samples 9 directions × {normal, focus} over a 0.42 s look-ahead with the real bullet motion and bombs only for an unavoidable hit. It is self-contained (the root suite serializes it with `toString`) and returns ordinary inputs only.

| Seed | Result | Frames (1/60 s) | Vials lost | SOAP used | Grazes | Kills | Score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 42 | won, all 18 | 79,076 | 0 | 0 | 799 | 804 | 2,145,128 |
| 1 | won, all 18 | 78,416 | 0 | 0 | 794 | 803 | 2,001,113 |
| 7 | won, all 18 | 79,279 | 0 | 1 | 842 | 801 | 2,123,657 |

Frame budget for the root suite: `60 * 1800` (108,000).

## Browser evidence

Real Chrome with SwiftShader WebGL at 960×640, 390×844 and 320×844 (throwaway Playwright script outside the repo): title, every world, all 25 boss and midboss cards, focus hitbox, SOAP, pause, game over, tray, MUTATION LAB and portrait views, with no console errors; the packaged itch build ran in a sandboxed iframe with its fullscreen control, keyboard movement, focus, SOAP and pause (audio suspended). Measured: hitbox 7.3 px (960) / 6.9 px (390) / 6.7 px (320); smallest bullet ≥ 7 px at the far edge (5 px at 320); the board column is 428 px at 960×640. SwiftShader frame times: title 60 fps, the 60-corona grid 57 fps, boss cards 60 fps, 4-3 OUTBREAK about 50 fps; a 600-bullet fixture about 19 fps (the brief's 55 fps software floor is not met).
