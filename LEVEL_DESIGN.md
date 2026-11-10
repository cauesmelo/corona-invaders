# Corona Invaders: level design (v1.0, the 12-stage suite)

The brief is `RESEARCH_V1.md` (decisions) and `RESEARCH_CARDS.md` §2.8 (its answers to the brief's assumptions). This file records what is built, in `levels.mjs`, `enemies.mjs`, `patterns.mjs` and `bosses.mjs`. Measured numbers are in `BALANCE.md`. The 18-stage revision-five suite is history (git before `6a9a672`).

**Status at the v1.0 release chores (2026-11-10):** no stage, pattern or HP value changed in this round. The audit misses held in `tests/suite.test.mjs` `KNOWN_GAPS` are unchanged: three stage lengths, three hit ceilings, four rest gaps, and the mix and quiet shares (BALANCE.md). They were set aside when the owner, after playing, called the start too frantic and the game too easy. A lead game designer's difficulty and progression brief replaces that tuning. Only the bullet sprites changed: a dark outline outside the solid, with colliders identical.

## Structure: a zoom into the body under the lab's microscope

The run is **4 sectors × 3 stages**: two samples (the second ends in a midboss), then a boss. Each sector is one magnification step deeper. Its twist runs on **every** stage of it, the boss included (MUTATION touches formation members only, so OMICRON is unaffected).

| Sector | Site, magnification | Twist | Boss | Backdrop (midtone, under the glass) | Music: one motif, four arrangements |
| --- | --- | --- | --- | --- | --- |
| 1 AIRWAY | Trachea ×40 | none: learn the kit | ALPHA | Cartilage rings, cilia carpet (a 0.5 Hz sway), mucus sheen | The original 4-note march, dry: bass and tick, 96 → 132 bpm as the grid empties |
| 2 LUNGS | Alveoli ×400 | BREATH: ×0.6 inhale, ×1.3 exhale, 6 s cycle, 1 s warning | BETA & GAMMA | Alveolar sacs that swell with the breath | Locked to the breath: 80 bpm, an 8-beat phrase per 6 s breath; a pad opens on the inhale, the bass thins on the exhale |
| 3 BLOODSTREAM | Capillary ×4 000 | CURRENT: 0.8 u/s drift, flips every 30 s after a 2 s warning | DELTA | Desaturated brick red cells flowing with the current, plasma streaks | A lub-dub heartbeat at 72 bpm with a hat; an arpeggio panned with the flow; a riser on the flip warning |
| 4 THE CELL | Cytoplasm ×40 000 | MUTATION: a flash means an upgrade | OMICRON PRIME | Sepia-umber ER folds, double-membrane replication bubbles, ribosome strands, a polymerase reading head that flickers while a virus mutates | A 16-step sequencer copying the march; while a virus flashes, one step slips a semitone out of key |

The camera never moves. A sector's first stage rolls the magnification counter up from the previous sector's (×40 → ×400) on its intro card, with a 0.8 s focus pull on the backdrop. Bosses keep the march that speeds up with the viral load.

## Run rule and flow

- TITLE → stage intro (`SPECIMEN 2-1 · DEEP BREATH · ALVEOLI`, the magnification, then a `PROTOCOL:` line) → the stage → LAB REPORT (2.5 s, skippable after 0.5 s) → the `draft` hook (the ADJUVANT draft fills it) → the next stage.
- After a boss: the FIELD NOTE with the SEQUENCED readout waits for a press, then the boosted draft. After 4-3: the FINAL REPORT.
- **Vials:** a boss clear restores 1; a sample clear restores none.
- **Credits:** 3 on Normal, unlimited on Easy. Losing the last vial spends one and CONTINUE restarts the stage from its entry snapshot (build, score, RNG). A manual restart mid-stage also spends one. With none left the run ends at the FINAL REPORT. Practice never spends credits.
- **1CC:** a run from 1-1 cleared with no credit spent gets the stamp on the FINAL REPORT.
- **ASSIST:** game speed 100 / 90 / 80 / 70 % in the pause menu, any time; the LAB REPORT says ASSISTED and nothing else marks the run.

## The 12 stages (four beats each: introduce, develop, twist, test)

Beats are separated by rests: `until('clear')`, then `until('calm')` (at most 3 bullets alive), then 2.5 s. A surge (the choir fires twice as often with one more singer) marks the twist or test peak. `introduces` in `levels.mjs` lists each stage's new ideas; `tests/suite.test.mjs` T2 checks them on a real campaign run.

| Stage | New idea | Introduce | Develop | Twist | Test |
| --- | --- | --- | --- | --- | --- |
| **1-1 FIRST CONTACT** | Two ends: only the glowing dose can be hit, the needle cures | The original 4 × 15 mini grid, 3 s of silence, then RAIN (straight-down lanes 1.18 u apart) | WILD TYPEs add aimed single coughs (aim locked at the telegraph); rain and cough alternate | Two slow LOW flights cross the top of the box within reach, no fire: `PROTOCOL: TOUCH A VIRUS WITH THE NEEDLE TO INJECT.` | A 7 + 7 grid with a flight and two reinforcement rows |
| **1-2 GESUNDHEIT** | The odd fan: tap sideways out of it | A lone SNEEZER (one 4.0 u/s tier, 1.0 s inhale) behind a raining WILD row | Two SNEEZERs (4.0 / 5.0), the first VESICLE | SNEEZERs over dense mini rain: focus inside a lane | Midboss **BIG SNEEZER** (ACHOO) |
| **1-3 ALPHA** | Named cards and NEUTRALIZE | COUGH COUGH → FIRST SNEEZE → SPIKE BLOOM → CORONA (unchanged; rings and spirals arrive after 1-1 taught static lanes) | | | |
| **2-1 DEEP BREATH** | BREATH; the AEROSOL PUFF, which mists only on the exhale | A known grid, slow coughs and rain, two breaths | A SNEEZER pair over rain: fans released on the inhale bunch, then rush | Two puffs drift in; random fire, used sparingly | Puffs, SNEEZERs and a grid, a surge on an exhale |
| **2-2 GAS EXCHANGE** | The RNA WORM's aimed strand: stream | One worm, then another, nothing else firing | Worms both ways over rain, two grids with a rest between | Strands timed to land on the exhale, with a SNEEZER | Midboss **AEROSOL CLOUD** (MIST) |
| **2-3 BETA & GAMMA** | The twin nucleus: only the glowing twin takes damage | PING-PONG → CROSS INFECTION → MIRROR STRAIN → DOUBLE HELIX (retuned, below) | | | |
| **3-1 CIRCULATION** | CURRENT (known enemies only) | Rain under the current: the lanes lean | Aimed coughs drift; the run's second VESICLE | The flow flips mid-surge at 30 s; a worm streams across it | A mixed grid (WILD, SNEEZER, a puff) with two flights |
| **3-2 SPLASHDOWN** | The DROPLET: a dashed path, a dive, a splash ring unless shot first | Single droplets with a 1.2 s path from a sparse grid | Dives under choir coughs (0.8 s path) | A splash upstream drifts onto you | Midboss **LAMBDA** (moved before DELTA: a safe preview of the lane jet) |
| **3-3 DELTA** | The split boss: lanes, halves, drifting walls | TRIANGULATE → LANE SNEEZE → HALVES → BLOOD RUSH → Δ CASCADE (retuned up) | | | |
| **4-1 COPY ERROR** | MUTATION as one rule: a flashing WILD TYPE becomes a HEAVY CROWN, anything else fires one tier up | One mutation at a time (1.2 s flash, every 4.5 s) on a raining grid; the HEAVY it makes fires slowly (6 u/s) | A mutation every 3.2 s (0.8 s flash) on a fuller grid; spike stacks at 8 u/s | A SNEEZER mutates into a 9-way, 3-tier fan (misdirection) | A dense mixed grid, two flights and a reinforcement |
| **4-2 FULL BLOOM** | The BLOOM: wait for the window, or INJECT the closed bud | One bloom alone (a 10-spike ring at 3.5 u/s), then a row | A bloom among SNEEZERs over a coughing grid | Blooms mutate and their rings upgrade; then a bloom row | Midboss **MOTHER CELL** (BUDDING → LYSIS → CELL BURST) |
| **4-3 OMICRON PRIME** | Its mutations are its phases | SPIKE CROWN → SNEEZE STORM → MUTATION SPIRAL → QUARANTINE → CORONA FLARE → R0 > 1 | | | |

### Revision seven: skill shows in patterns (2026-11-10; numbers in BALANCE.md "Where skill shows")

The proxies showed that density, speed and HP move the casual and the expert together, and that a curved aimed stream is what separates them (casual vials from RNA strands 3-6x the expert's, from lanes and jets 1-2x). So the stage scripts now spend their pressure where skill matters:

- **1-1 and 1-2 are a game, not a block of targets:** PEEL divers (above) on top of the rain and the aimed coughs. Speeds stay calm (5.5 u/s, a 1.2 s announced line).
- **Snake beats** in 3-1 (second grid of the develop beat, two worms in the twist), 3-2 (the twist beat, a worm, two dives in the air), 4-1 (the develop beat, two worms in the twist) and 4-2 (the twist beat). One or two singers per volley, never the whole choir.
- **Bosses:** DELTA runs the CURRENT on every card and flips it per card (TRIANGULATE and HALVES one way, LANE SNEEZE and Δ CASCADE the other, period 10-12 s with the 2 s warning), HALVES / TRIANGULATE / Δ CASCADE carry a snake, Δ CASCADE and OMICRON's R0 > 1 split less (the replicating bullets hurt the expert more than the casual: 19 vs 12 vials); MOTHER CELL's BUDDING and OMICRON's SNEEZE STORM and R0 > 1 carry a snake, and SNEEZE STORM's random mist is cut from 8 to 6 per second (random fire did not separate casual from expert: 11 vs 14 vials from the mist alone before the snake).
- **A wall's gap under a CURRENT** is launched where the known flow schedule brings it (`core.mjs flowAt`), and the gap list follows the flow with the bullets. BLOOD RUSH's 6 s flights at 1.6 u/s could carry a gap off the board; the F1 replay found it (1 forced hit in 192 runs).
- Sector openers 3-1, 3-2, 4-1, 4-2 carry +10% bullets per attack; 4-2's choir and MOTHER CELL are tighter (choir 0.72-0.5 s, cadence x0.8); ALPHA is unchanged except the COUGH COUGH fan (6.8 u/s, every 0.9 s): the S1 exam stays a lesson.

### Cut and moved (RESEARCH_V1.md 2.4)

- **Cut from the run:** 1-3 BUDDING, 3-2 HIJACK, 3-3 VARIANT SURGE, 4-3 OUTBREAK, B1 CULTURE CHECK and B2 SWAB TEST. BUDDER, HIJACKER and INFECTED CELL stay in `ARCHETYPES` (for v1.1 and their unit tests) but no stage spawns them.
- **Moved:** BIG SNEEZER to 1-2's test, AEROSOL CLOUD to 2-2's, LAMBDA to 3-2 (before DELTA), MOTHER CELL to 4-2 (inside the cell). DEEP BREATH became 2-1, GAS EXCHANGE 2-2, MUTATION 4-1 and AGAR's blooms 4-2.
- **mRNA ladder (kept, RESEARCH_CARDS A5):** VESICLEs in 1-2 and 3-1 and the four midbosses give L2 by 1-2, L3 by 2-2 and L4 by 3-2. Entry power per stage: 1 1 2 | 2 2 3 | 3 3 4 | 4 4 4.

## Script vocabulary

`grid`, `fly`, `worms` (`exhale: true` times strands to the rush), `puffs`, `vesicle`, `midboss`, `surge`, `wait`, `until: 'thin' | 'clear' | 'calm'`, plus:

- `verse`: what the formation choir sings. `'rain'` (a front-of-column WILD TYPE drops one droplet straight down, angle 0; a rain volley has twice as many singers, since a lane is one bullet), `'cough'` (aimed) or `'alternate'` (the default: volleys alternate). Rain and cough count as one pattern family in the overlap gate, so a singing choir never locks a bloom or a splash ring out.
- `tune`: per-archetype attack overrides for the following beats (an introduce beat's slower tier).
- `mutation: { flash, every }`, `dive: { telegraph, every, max }` (revision seven: `every: [lo, hi]` seconds and `max` droplets in the air at once; the default stays one at a time every 3.5-5 s), `choir: { interval, size }` and `hint` (a one-time PROTOCOL line).
- `divers: { every, max, tele, speed }` (revision seven, PEEL): every `every` seconds a front-most grid member leaves its slot on a straight line through the column the syringe stands in now, extended to the bottom edge. A dashed path is on screen from the first frame; the diver bristles in its slot for `tele` seconds (1.2) and then dives at `speed` (5.5 u/s). One sidestep of about 1.1 u clears it; the INJECT tip cures it on contact (popcorn), so standing still in the line is also an answer. Contact is a hit; a diver that gets through counts as escaped for R0. `{ divers: { off: true } }` stops it. Used in 1-1 (every 5-7 s, then 6-8 s) and the first beat of 1-2.
- `tune` may swap the preset: `tune({ wild: { preset: 'strand', n: 7, speed: 4.4, amp: 0.7, wavelength: 5, interval: 0.12, aimShip: true } })` is the RNA SNAKE (`SNAKE` in `levels.mjs`): WILD TYPEs sing a curved aimed bead stream for that beat. Paired with `choir({ size: [1, 2] })` and `verse('cough')` so one or two singers fire it, and reset with `tune({})` plus the stage's own `choir` afterwards.
- `grid({ x })` shifts a reinforcement half a column so bodies never stack.

## Archetypes in the v1.0 run (one job, one family, one telegraph)

| Archetype | Attack (sector 1 → 4 upgrades) | Base HP* | INJECT |
| --- | --- | --- | --- |
| WILD TYPE / mini | RAIN (4.5 / 4.5 / 5 / 5 u/s) and COUGH: a single at 5.5 → a 2-stack at 6.5 → a 2-stack at 7.5 → a 3-stack at 8 | 3 / 1 | cured |
| SNEEZER | Odd fan, 7 at 56°: tiers 4 / 5 (1.0 s inhale) → 4 / 5.5 → 9-way → 9-way × 3 tiers | 10 | cured |
| RNA WORM | Aimed RNA STRAND: 8 beads at 4.8 u/s, amplitude 0.8 → 10 → 12 (amplitude 1.1); a 1.5 s bead trail | 4 | cured |
| AEROSOL PUFF | AEROSOL, 5 → 6 bullets/s, on the exhale only in the lungs | 10 | cured |
| DROPLET | Dive, then a 6-ring splash (8 in sector 4) | 4 | cured, even in flight |
| HEAVY CROWN | SPIKE stack × 3 at 8 u/s; only made by MUTATION | 14 | 10 × stageHp |
| BLOOM | Opens 0.8 s, fires a 16-spike ring, open 1.8 s, closed 2.6-3.4 s | 7 | 10 × stageHp, closed or open |
| VESICLE | Never fires; carries an mRNA supply | 20 | 10 × stageHp |

*HP routes through `levels.stageHp(base, stage)`: base × `stageDps(stage)` / 24, where `stageDps` is the guaranteed DPS at entry (24 / 24 / 30 / 42 by power). The ADJUVANT draft multiplies `stageDps` by its expected potency. Easy ×0.85. BLOOM HP fell from 16 to 7 because the reactive referee can only hit an open bud; INJECT is the fast answer.

## Bosses and mutation cards

Card HP = round(TTK × `stageDps` × 0.7). **Timeouts are max(25, round(1.6 × TTK))**; survival cards keep their duration. v1.0 retunes (`bosses.mjs`):

- **BETA & GAMMA:** PING-PONG drips 8 → 6 at 7.0 u/s (9.1 on the exhale); CROSS INFECTION 9-way lattices every 3.4 s; MIRROR STRAIN 24-rings at 3.5 u/s every 1.2 s; DOUBLE HELIX slightly slower.
- **DELTA (up):** TRIANGULATE 5.5 u/s fans every 0.75 s plus a 16-ring; LANE SNEEZE 9-way fans; HALVES 24-rings every 0.8 s and coughs every 1.3 s; BLOOD RUSH TTK 9, walls every 3.5 s and 2-stack coughs; Δ CASCADE 4 seeds plus a cough.
- **OMICRON PRIME:** SPIKE CROWN blooms 2.4 → 2.0 s; its nodes orbit 1.7 u deep (was 2.2) so no body enters the needle's reach; aimed fans capped at 7 u/s, CORONA FLARE's cough is an 8.5 u/s stack.
- **Midbosses:** BIG SNEEZER tiers 4 / 5 and a slower cough; AEROSOL CLOUD's mist 7 → 5 bullets/s with a ring and a 3-stack cough (random ≤ 15 %); LAMBDA's MIRROR adds a 2-stack cough; MOTHER CELL is shorter (TTK 8 / 10 / 10) with faster coughs.

Entrance cards are lab case files (`personality.CASE_FILES`, e.g. `VARIANT ALPHA · FIRST OF ITS LINE · COUGHS IN THREES · TEMPERAMENT: POMPOUS`).

## INJECT (RESEARCH_V1.md 5.4)

The needle tip is a 0.05 u point collider 0.95 u ahead of the core (`hitboxes.INJECT`). When it enters a body with the plunger loaded: popcorn is cured at once (×2 score, +1 Dose Chain, its live bullets become antigen tokens, 60 ms hitstop); elites and any boss part in reach take 10 × stageHp. Reload 0.5 s, 0.8 s after an elite. A cure deflates to grey over 0.25 s. The tip never touches the player; core contact still costs a vial. The tip reaches z ≥ −4.0 at most, and no boss card brings a body there (T8 sweep).

## Pattern presets and their fairness limits

As in revision five, plus:

- **RAIN** (droplet): one bullet per singer, angle 0, 0.5 s telegraph, 4–5.5 u/s, grammar `static`.
- Every emitter carries a **grammar tag**: aimed, static (rain, rings, blooms, walls, fixed-angle fans, owner-lane jets) or random (aerosol). The suite audit sums bullets by tag.
- **REPLICATION** splits at most once per second (`splitEvery` ≥ 1.0) and never after the bullet has passed within 2 u of the core (FAIR-150 rule 4).
- Speed bands (tested on live runs): static fields ≤ 5 u/s, aimed fans ≤ 7 u/s, nothing over 9.5 u/s effective (exhale and current included).
