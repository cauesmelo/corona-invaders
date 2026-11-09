# Corona Invaders balance notes

Every number below comes from `core.mjs`, `levels.mjs` and `bosses.mjs`, and the evidence comes from actual runs. The research brief's figures were starting values; where the build differs, this file says so and gives the reason. Units: world units (u) on the X/Z combat plane, and seconds. The ship row is at z = 10.4. The formation back row starts at z = −9.2.

## Weapon and defense (unchanged from the approved campaign)

| | Value |
| --- | --- |
| Base trigger cooldown | 0.26 s (about 3.85 shots/s) |
| Rapid cooldown | 0.13 s for 8 s |
| Spread | 3 angles (−0.18, 0, +0.18 rad) for 8 s. It looks and sounds wider (an extra detuned voice) but each projectile does the same damage |
| Shot speed | 34 u/s |
| Ship speed | keyboard 15.5 u/s; pointer and touch 21 u/s |
| Vials | 3, plus a 4th with the opt-in assist |
| Hit protection | 1.55 s. Close bullets are cleared on a hit, so one mistake never costs two vials |
| Manual shield | 0.7 s, 5 s cooldown. It blocks bullets within 2.4 u. It does **not** break the chain |

## Dose Chain and score

- **Window:** every kill refreshes a 1.6 s window. A boss hit tops it up to at least 0.6 s but is not a kill.
- **Tiers:** ×2 at 5 kills, ×3 at 10, ×4 at 16, ×5 at 24, ×6 at 32, with ×6 as the cap. Damage resets the chain to 0.
- **Base kill scores:** spore 100, daughter 50, armored 175, dart 125, splitter 150 (armored splitter 225), diver 150 (×2 while diving), burster 100, infector 200, capsid 250, Courier 500, culture flier 100.
- **Infector cure bonus:** +300 if the Infector dies mid-tether. This bonus is not multiplied.
- **Boss points:** 10 per point of damage × the multiplier; 400 for a part kill (half, sac or node); 3000 for the boss kill.
- **Sector clear bonus:** 1000 + 500 × (world − 1), doubled for boss sectors. B1 gives 1000, or 6000 for a perfect 40/40.
- **Capsule pickup:** 75 points.

## Medals and par

- **Bronze:** clear the sector.
- **Silver:** lose at most one vial.
- **Gold:** lose no vial and clear at or under par.
- **CULTURE CHECK:** gold at ≥ 90% hits, silver at ≥ 70%.
- **Assisted clears:** marked "A".
- **Storage:** medals and best sector scores live in `localStorage`, read and written inside try/catch.

Par is `ceil(1.3 × the QA controller's clear time)` for seed 42, measured with `node tests/measure-par.mjs`. A test fails if a stored par drifts more than 1 s from that measurement.

| Stage | 1-1 | 1-2 | 1-3 | 1-4 | B1 | 2-1 | 2-2 | 2-3 | 2-4 | 3-1 | 3-2 | 3-3 | 3-4 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Controller s (seed 42) | 10.2 | 16.5 | 26.4 | 15.9 | 22.3 | 11.5 | 18.0 | 15.9 | 34.5 | 42.5 | 34.4 | 25.3 | 33.9 |
| Par s | 14 | 22 | 35 | 21 | 29 | 15 | 24 | 21 | 45 | 56 | 45 | 33 | 45 |

The controller aims perfectly, so these pars are tight for a human. They dropped this round because player doses now pass through membranes. Pars should be re-derived once real human play data exists.

## Capsules

| Source | Rule |
| --- | --- |
| Courier | Once per sector from 1-2 onward, including boss sectors. It flies at the back (z = −10.7, clear of the rim) at 4.5 u/s, and its roulette icon changes every 0.8 s; the kind showing on its third hit is what drops. In regular sectors it waits until 40% of the first group is dead, so a lane to it exists |
| Chain guarantee | The first ×4 chain in a sector drops one capsule from that kill (never from a daughter) |
| Random | 4% of eligible kills, followed by a 10 s cooldown during which no RNG is consumed. Bosses, daughters, ring Bursters and culture fliers are never eligible |

- **Kind distribution** for random and chain drops: rapid 35%, spread 25%, shield 25%, repair 15%. A repair rolled at full health becomes a shield.
- **Falling and catching:** capsules fall at 3.5 u/s with a gentle drift and must be physically caught. A missed capsule expires after 12 s or once it leaves the field.
- **Silhouettes:** RAPID is a chevron, SPREAD a trident, SHIELD a ring and REPAIR a cross, both in 3D and in the HUD chips. The ship shows one timer ring per active effect.
- **Measured supply over a full controller campaign** (13 stages):

  | Seed | Random | Courier | Chain | Total |
  | --- | --- | --- | --- | --- |
  | 42 | 5 | 4 | 7 | 16 |
  | 1 | 4 | 3 | 6 | 13 |
  | 7 | 5 | 3 | 6 | 14 |

  That is about 1.1 capsules per stage, with roughly two thirds earned rather than random. The controller treats the Courier as low priority and kills only 3 or 4 of the 11 that appear. A player who snipes Couriers gets nearer the brief's target of about 2 per sector. A test bounds the supply: random drops ≤ ceil(elapsed / 10), chain drops ≤ 13, and 6 ≤ total ≤ 39.

## Difficulty curve by world

| | W1 BLOODSTREAM | W2 AIRWAY | W3 LAB / PETRI |
| --- | --- | --- | --- |
| Formation fire interval | 1.85 → 1.6 s (escorts in 1-4 at 1.6 s) | 1.4 → 1.2 s | 1.15 → 1.05 s |
| Enemy shot speed (never decreases stage to stage) | 8.5–9.5 u/s | 9.5–10.5 u/s (darts 11) | 10.5 (3-1, 3-2) → 11 → 11.5 u/s (darts 11–12) |
| Formation bullets alive at once | 6 | 9 | 12 |
| Simultaneous dives | — | 1 | 2 |
| Membranes (block enemy fire only) | all | all | 3-1, 3-2, 3-4; removed in 3-3 |

- **Warnings:** every formation shot warns for 0.65 s, and its aim is locked at the start of the warning. Dives warn for 0.8 s, plus the 1.5–2 s the dive itself takes.
- **Boss bullet budget:** boss patterns do not count against the bullet budget. They are authored walls, and their gaps are the dodge.

## Bosses

| Boss | Viral load | Floors | Big attacks: telegraph → active → punish |
| --- | --- | --- | --- |
| DELTA (1-4) | 60 | 28 / 0 | Lane beam from Delta's column 1.1 → 0.35 → 1.2 s (×2 damage); twin beam 1.0 → 0.35 → 1.2 s; AIMED DOUBLE travels down one line |
| MOTHER CELL (2-4) | 80 (3 sacs × 10, core 50) | 50 / 20 / 0 | Opening: cyan glow 0.8 s → 5-spread → open 2.0 s; a pulse triple while closed |
| ECHO (3-2) | 48 | 32 / 16 / 0 | Eye open 1.5 s → 0.65 s warning → triple → 1.8 s; P2 hold open 2.0 s → glare 1.0 → 0.35 s → mirror triple |
| OMEGA PRIME (3-4) | 104 (4 nodes × 8, core 72) | 72 / 20 / 0 | Node beam 1.1 → 0.35 → 1.0 s (P1 bullets ×0.9, gaps ≥ 1.0 s); corona flare 1.0 s → 13-bullet ring at 9.4 u/s → exposed 1.5 s (×2); P3 ×1.2 speed, ×0.7 gaps |

- **Phase floors** cap damage, so each threshold forces its transition: 1.0–1.1 s, with 120 ms hitstop and a callout. Delta's halves start with 1.2 s of stun at ×2 damage, and the surviving half's attack gaps shrink by 30%. Mother's ring Bursters deal 4 each (`burstBossDamage`). Omega's last phase multiplies bullet speed by 1.1 and gaps by 0.8 but keeps the same telegraph lengths.
- **Vulnerability:**
  - Delta and Omega's nodes are always vulnerable.
  - Mother's core can be hit only while open, or by a burst in P3.
  - Echo can be hit only while its eye is open, or, in P3, only the twin holding the nucleus.
  - Omega's core is shielded in P1 and during each flare telegraph.
- **One threat at a time:** escorts hold fire during boss telegraphs; a beam or flare waits for that boss's previous bullets to pass. Beams hit only the ship's core and their glow stays on while they burn.
- **Controller boss clear times (seed 42):** Delta 16 s, Mother 35 s, Echo 34 s and Omega 34 s. The brief's human targets (miniboss 35–45 s, world boss about 60 s, finale about 90 s) assume about 70% accuracy and human reaction time, so a human should take roughly 1.5–2.5× as long.

## Hitstop and juice (visual and audio only, except hitstop)

| Event | Hitstop | Trauma |
| --- | --- | --- |
| Popcorn kill (spore, dart, daughter, diver, burster, infector) | 0 ms | — |
| Armored, splitter or capsid kill; boss part kill | 30 ms | +0.15 (part kill +0.3) |
| Courier kill | 60 ms | — |
| Phase break | 120 ms | +0.5 |
| Damage taken | — | +0.3, with a pink screen flash |
| Boss death | 200 ms (bypasses the cap), then 0.8 s at half speed | +0.8 |

- **Hitstop cap:** at most 120 ms in any rolling second of real time.
- **How the freeze works:** it freezes the model exactly (`hitstopTotal` counts it) and simulates whatever is left of that substep, so the realized freeze never exceeds the budget. A trigger pulled during a freeze is buffered.
- **Shake:** trauma² × 0.35 u, decaying at 1.5/s, plus a 0.04 u kick per shot.
- **Hit feedback:** a 60 ms white flash, a 1.12 → 1.0 scale punch over 100 ms and a 0.15 u knockback.
- **Debris:** a pool of 300 instanced shards, dimmed to 28% brightness and kept on the floor plane. Normal kills throw 6 to 9, part kills 18, a boss kill 60. They skid and fade within 1.6 s.
- **Formation pulse:** 4 notes at 72 bpm, rising to 144 bpm as the alive fraction (or the boss's load) falls to zero.

All motion juice is off under `prefers-reduced-motion` or Effects: Reduced. Hitstop is kept in both cases: it is a timing pause of at most 0.12 s, not motion, and keeping it means the simulation behaves the same whatever the display setting.

## Evidence (Node 22.14, this build)

**`npm test`: 94 of 94 tests pass.**

| Suite | Tests | Covers |
| --- | --- | --- |
| Model | 39 | Includes 3 full-campaign wins |
| Archetypes | 16 | Each archetype's behavior, the capsid bullet budget, bonus paths inside the rails |
| Bosses | 23 | The 4 no-shield dodge analyses, Echo's eye-before-attack, Delta's beam origin and escort hold |
| Camera | 11 | Framing at 7 sizes, landscape size, portrait anchoring |
| Curve | 5 | Reactive-player difficulty curve |

**Full campaigns with the ordinary-input controller** (no state editing):

| Seed | Result | Simulated time | Frames | Health left | Kills | Shield uses |
| --- | --- | --- | --- | --- | --- | --- |
| 42 | won | 329.9 s | 20,086 | 3 | 330 | 0 |
| 1 | won | 328.1 s | 19,970 | 3 | 330 | 0 |
| 7 | won | 313.5 s | 19,092 | 3 | 328 | 0 |

A further scratch sweep of 16 more seeds (2–6 and 8–18) also won every run, in 294.4–351.0 s with full health.

- **Frame budget:** the slowest run needed 21,341 frames (seed 5). The root playthrough's **60 × 450 = 27,000 frames** leaves margin.
- **What the zero damage means:** the controller sees exact bullet positions, so it measures reachability and fairness, not difficulty. Humans will take hits.

## Reactive-player curve: before and after the playtest fixes

Same harness for both builds (`tests/reactive.mjs`, seeds 42, 1, 7, 3 and 5, up to 3 tries per sector). "Before" is the previous delivered build. The tables show losses / hits per seed.

| Stage | 150 ms before | 150 ms after | 250 ms before | 250 ms after |
| --- | --- | --- | --- | --- |
| 1-1 … 1-3 | 0 / 0–0.2 | 0 / 0–0.2 | 0 / 0–0.8 | 0 / 0 |
| 1-4 DELTA | **2 / 1.80** | 0 / 0.60 | **1 / 0.80** | 0 / 0.20 |
| W2 sectors 2-1 … 2-3 | 0 / 0–0.2 | 0 / 0 | 0 / 0–0.2 | 0 / 0–0.2 |
| 2-4 MOTHER CELL | 0 / 0.00 | 0 / 0.80 | 0 / 0.20 | 0 / 1.00 |
| 3-1 CAPSID WALL | 0 / 1.00 | 0 / 0.60 | **1 / 1.80** | 0 / 0.40 |
| 3-2 ECHO | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| 3-3 MUTATION | 0 / 1.40 | 1 / 1.20 | **2 / 2.60** | 0 / 0.40 |
| 3-4 OMEGA PRIME | 0 / 0.20 | 0 / 0.40 | 0 / 0.60 | 0 / 0.00 |
| **Total losses** | **2** | **1** | **4** | **0** |

The playtester's in-browser script did much worse at ECHO, CAPSID WALL and OMEGA than this in-model player. Its real loop added reading, screenshot and key round-trip delays on top of the nominal 150 ms. The fixes target the causes it logged:

- capsid crossfire
- Echo punishing during its open window
- Omega P1 load
- Delta's beam and its sidestep-punishing pair

The in-model player still rates ECHO as easy, so a human pass is the next check.

## Known limits

- **Human tuning:** pars and boss lengths come from a bot. The 2-2 burster sector varies a lot from seed to seed (11–31 s for the controller) because chain luck matters.
- **Courier reachability:** the Courier is reachable only through gaps in the formation. Whether that feels rewarding or frustrating needs playtesting.
- **Not built:** Vaccine Burst (out of scope), a second CULTURE CHECK, OUTBREAK endless mode and the optional four-button touch layout.
