# Corona Invaders campaign design

The canonical data lives in `levels.mjs`, the behaviors in `enemies.mjs` and the bosses in `bosses.mjs`. This document explains intent, and the tests read the real data rather than this file. Throughout the campaign the player keeps one control scheme: strafe, hold fire and shield. Difficulty comes from behavior first and numbers second.

## Structure

The campaign has three worlds, and each follows **introduce → develop → twist → conclude** (kishōtenketsu). A rule taught alone is then combined with others, inverted, and finally tested by a boss. A CULTURE CHECK bonus follows the first boss. In every sector, the next formation group enters once the current one is down to its `trigger` count of survivors, so intensity rises and falls inside a sector instead of arriving as one block.

| Stage | Code / name | Groups (back row first) | Lesson |
| --- | --- | --- | --- |
| 1 | **1-1 FIRST RESPONSE** | 10 spores, then 7 spores in a checkerboard (≤2 left) | Cadence, strafing, the pink warning, and membranes that stop enemy fire |
| 2 | **1-2 CROSS CONTAMINATION** | 6 armored over 12 spores in opposing rows, then 3 spores + 2 armored | Armor cracks at 1 HP; paired fire brackets the warned spot; first Courier |
| 3 | **1-3 SPLIT DECISION** | 4 splitters **alone**, then 3 armored splitters + 2 splitters + 6 spores | Splitting creates area denial; choosing what to split first |
| 4 | **1-4 DELTA** | Boss + 4 spore escorts | Lane beams and punish windows; a boss that really splits |
| 5 | **B1 CULTURE CHECK** | 6 harmless flights, 40 fliers on drawn cyan paths | No return fire; previews the drawn-path language before Divers |
| 6 | **2-1 SPORE STORM** | 5 divers **alone**, then 7 spores / 7 darts / 4 divers | Leave the pink line; faster darts |
| 7 | **2-2 CHAIN REACTION** | Plus-shaped burster lattice (5 pods in 15), then armor-and-burster lattices, then a pod buried in armor | One pop can clear eleven; armor survives a burst, so the last wave needs aim |
| 8 | **2-3 VECTOR FIELD** | 10 spores + 2 infectors, then armored/infector/darts/divers in cross rows | Priority target: cut the tether (+300 CURED) |
| 9 | **2-4 MOTHER CELL** | Boss only; its sacs spawn bursters and divers | Remove spawn streams; hit the open core; use the burster lessons |
| 10 | **3-1 CAPSID WALL** | 5 capsids **alone**, then spores/darts/capsids/splitters/divers | Timing: shoot when the plate opens |
| 11 | **3-2 ECHO** | Boss only | Positioning, not reflexes |
| 12 | **3-3 MUTATION** | Everything, in three groups; **no membranes** | Twist: the cover is gone |
| 13 | **3-4 OMEGA PRIME** | Boss only; nodes spawn divers | Choose which attack to delete first; flare gaps |

A test checks that Splitter, Diver, Burster, Infector and Capsid each debut in a group that contains only that type and plain spores. Membranes are present in every W1–W2 sector and absent in 3-3 and B1.

## Per-world cabinet themes

Only the floor tint, the under-glass backdrop, the rail lights and the marquee text change between worlds. Backdrops stay in midtones: they contain no pink and no bright marks the size of a bullet, and shapes are at least about 1.2 u across.

- **W1 BLOODSTREAM:** a teal glass floor over slowly drifting, desaturated red cells, with phosphor and teal rails.
- **W2 AIRWAY:** a slate floor with ribbed bronchial bands and large slow bubble rings, with ice-blue and bronze rails.
- **W3 LAB / PETRI:** an amber agar glow with soft colonies, with amber and violet rails. (The sweeping UV lamp band was removed: a moving bright band read as a lane telegraph. Nothing decorative may resemble a warning.)

The near rail is an infection-load gauge. It fills with the share of the sector's enemies still alive, or, in a boss sector, the share of the boss's viral load remaining. Pink appears in the scene only for enemy bullets, telegraphs, the breach line and the damage flash.

## Archetype catalogue

Each archetype has one job and one telegraph, and all of them stay on the X/Z combat plane. Silhouette distinguishes them before color does.

| Archetype | Silhouette | Behavior | HP / radius |
| --- | --- | --- | --- |
| Spore | Spiky sphere (chartreuse) | Sway. When chosen by the fire clock, it glows pink for 0.65 s, then fires one shot at the position it warned | 1 / 0.67 |
| Armored | Spiky core in amber plates | Fires a tight pair, a "fat" aimed shot about 1 u across. Like every aimed shot, a natural sidestep dodges it. Its plates crack visibly at 1 HP | 2 / 0.78 |
| Dart | Finned spindle (periwinkle) | Weaves in Z; fires faster shots (11–12 u/s) | 1 / 0.58 |
| Mitotic Splitter | Two lobes with a seam | The seam pulses at 1 HP. On death it splits into two daughters that drift apart at ±3 u/s for 0.6 s, then hold their new slots | 2 / 0.72 (armored: 3) |
| Daughter | Small spiky sphere | Fires single shots. **Never drops capsules** | 1 / 0.45 |
| Diver | Orange arrowhead | Draws a pink dashed line from itself to where the ship is, holds it for 0.8 s, then dives along it at 9 u/s to z = 8. It fires one shot straight down the line, then returns up the nearest side rail and rejoins. At most 1 dives at a time in W2 and 2 in W3. Kills during the dive score double; contact costs a vial | 1 / 0.6 |
| Burster | Translucent yellow pod with a hot core | On death, after 0.1 s, it bursts with a 2.2 u radius and deals 1 damage to **enemies only**, so bursts chain into neighboring pods. Bursts never touch the ship, bullets or membranes | 1 / 0.7 |
| Infector | Violet tetrahedron with tendrils | Every few seconds it holds a pink tether on the nearest spore for 1.5 s; the target also shows a pink ring. When the tether completes, the spore becomes armored. Killing the Infector mid-tether gives +300 CURED | 1 / 0.5 |
| Capsid | Steel icosahedron with an amber front plate | The closed plate turns shots into cyan sparks. A Capsid opens only when the formation fire clock picks it, so it shares the one-shooter rhythm and the bullet budget: a 0.65 s warning while the plate swings open (bright pink ring), then one shot, then 1.5 s open and vulnerable. It debuts in 3-1 at the world-2 top bullet speed (10.5) | 2 / 0.8 |
| Courier | White capsule with a cyan icon | Crosses behind the formation (z = −10.7, clear of the back rim) once per sector at 4.5 u/s and never fires. Its icon cycles through the four capsules every 0.8 s, and it drops the one showing when it dies (3 hits). It waits until 40% of the first group is gone, so a sniping lane exists. It never holds a sector open | 3 / 0.7 |
| Culture flier (B1) | Pale arrow with a cyan path | Follows authored Bezier paths at 8 u/s. Every control point is inside the rails, so paths never leave the arena. Harmless | 1 / 0.55 |

The formation fire clock only ever picks the front-most enemy in a column, so back rows never fire through their neighbors. Each world caps how many formation bullets can be alive at once: 6, 9 and 12.

**Breach rule:** a pulsing pink line appears on the floor when any formation enemy comes within 3 u of the loss line, which sits 1 u in front of the ship row. Losing to a breach is therefore never a surprise. The cause card then reads "Formation reached your row".

**Membranes:** four bunkers at z = 7.2, x = ±2 and ±6. Each is 4 × 2 cells of 1 HP, drawn as soft translucent cell walls. Enemy shots, contact and boss beams erase cells. **Player doses pass straight through**, so cover never punishes shooting.

## Boss scripts

Every boss has a single **viral load** pool, shown as the VIRAL LOAD bar. Parts with their own HP (halves, sacs and nodes) also drain the pool.

**Phase floors** stop damage at each threshold, so a phase can never be skipped. Crossing one causes the following:

- a 1.0–1.1 s transition
- 120 ms of hitstop
- a shake of the bar
- a one-line callout of the next phase

**Attacks** are data-driven steps of three stages: telegraph → fire → optional punish window.

- During a punish window the boss **stalls**, and its motion clock stops.
- An **exposed** boss takes double damage. An **open** weak point is the only time a shielded part can be hurt.

**One threat at a time:** escorts never start a new warning while a boss telegraph is up, and a beam or flare waits until that boss's previous bullets have passed the ship row.

**Beams:** the floor glow stays on, brighter, while a beam burns. A beam hits only when the ship's core dot is inside it.

Movement follows `b.moveT`, which pauses during stalls. A test samples every substep across all phase changes and fails if any part moves more than 0.2 u in one 1/180 s step.

### DELTA (1-4) — 60 HP, floors 28 | 0

- **P1 WHOLE:** an AIMED DOUBLE, twice. These are two shots down one line, so any sidestep dodges both. Then a LANE BEAM **out of Delta's own column**: a pink floor glow from the boss to the ship row for 1.1 s, a 0.35 s beam, then a 1.2 s punish window (stalled, exposed ×2). Escorts hold fire while the beam glows.
- **Split at 28:** a white seam glows for 1.0 s and the callout reads "HALVES". Two halves bud 1.6 u to either side of the body, each with half of the remaining pool (14/14). They glide over 1.2 s onto mirrored tracks, x_L = −x_R. While they glide they are STUNNED: 1.2 s exposed, with no attacks.
- **P2 HALVES:** the halves alternate SPLIT SPREAD triples, then fire a TWIN BEAM down both of their own lanes, followed by a punish window. The bar shows two sub-bars. Kill one half and the survivor attacks with 30% shorter gaps.

### MOTHER CELL (2-4) — 80 HP, floors 50 | 20 | 0

- **P1 SACS:** three 10 HP sacs. Each spawns a Burster or a Diver, alternating, every 6 s into a six-slot minion row. Destroying a sac removes its stream. The core is closed, so shots on it only spark, and it fires a CORE PULSE triple about every 2.4 s. It is tuned a step above Delta (curve test).
- **P2 OPEN CORE:** a cyan glow announces the opening for 0.8 s; the pink warning ring shows at the same time. A 5-shot spread fires as the core opens. It then stays open and vulnerable for 2 s, stalled. While closed it adds a CORE PULSE triple.
- **P3 BURSTER RING (below 25%):** six Bursters orbit the core on a 3.0 × 2.4 u ellipse. Every pop next to the core deals 4 damage to it, even while it is closed. Six pops cover the last 20 HP, which pays off the lesson of 2-2.

### ECHO (3-2) — 48 HP, floors 32 | 16 | 0

- **The eye opens first:** in every phase the vulnerable window comes *before* the attack, with no Echo bullets incoming (tested).
- **P1 TRACKING:** follows your x with a 0.6 s first-order lag, capped at 8 u/s. Its mirror plate turns shots into sparks. The eye opens for 1.5 s. Then the plate closes, a 0.65 s warning precedes an ECHO VOLLEY triple, and a 1.8 s pause follows, longer than the volley's flight.
- **P2 MIRROR:** moves to −ship.x, capped at 9 u/s. MIRROR HOLD freezes it with the eye open for 2.0 s. Then a 1.0 s pink lane glows **in its own column**, the MIRROR GLARE fires there, and a MIRROR VOLLEY follows as it starts moving again.
- **P3 TWIN NUCLEUS:** a twin buds from Echo's own position and mirrors you, while the original tracks you. Only the twin holding the glowing nucleus can be damaged. The holder fires a triple, the nucleus swaps, and 1.6 s pass before the next warning.

### OMEGA PRIME (3-4) — 104 HP, floors 72 | 20 | 0

- **P1 CROWN:** four 8 HP nodes orbit the core. Each owns one attack and has a matching silhouette, which is also the icon on its sub-bar. The node attacking next pulses pink on the field and on the bar. Attacks are spaced at least 1.0 s apart and P1 bullets move at 0.9× speed:
  - AIMED: triple
  - SPREAD: five shots
  - BEAM: lane beam with a punish window
  - SPAWN: a Diver

  Destroying a node removes its attack from the rotation, so **the player chooses the order**. A cyan hex shell shields the core in this phase.
- **P2 CORONA FLARE:** the core stalls and shows 17 pink rays clipped to the arena; the core is shielded while it charges. After 1.0 s a ring of bullets fires at 9.4 u/s with **two seeded two-bullet gaps**. Both gaps are kept within ±7.5 u at the ship row and at least five rays apart. The core is then exposed (×2 damage) for 1.5 s, followed by an aimed triple and a CORONA SPREAD. Membranes block ring bullets, so they also serve as cover.
- **P3 FULL BLOOM (below 20%):** the full moveset (flare, triple, lane beam, Diver spawn, spread) with bullets ×1.2 and gaps ×0.7. Telegraphs are not shortened.
- **Death:** 200 ms hitstop, 0.8 s half-speed slow motion and a 60-shard voxel collapse. Any remaining minions are cured; they still score but drop nothing.

**Fairness checks** (`tests/bosses.test.mjs`):

- Beams, rings and the Mother's opening telegraph for at least 0.8 s and are followed by at least 1.0 s of punish.
- Volleys warn for at least 0.65 s.
- For **every attack of every phase**, starting from x = −8, −4, 0, 4 and 8, a keyboard-speed player who reacts 0.25 s late has at least one destination that avoids all damage **without the shield**.

## Flow, checkpoints and recovery

- **Sector clear:** a tally strip (for example "CLEAR +1000 · CHAIN ×3 · ★ GOLD"), then a 1.8 s transition while capsules keep falling. The next sector starts with +1 vial, up to 3.
- **World clear (1-4, 2-4):** a LAB REPORT card listing each sector's score and medal. It waits for a *fresh* FIRE press, so a held trigger cannot skip it, and every vial is restored.
- **Retry:** restarts the current sector with three vials, the sector-entry score, the entry RNG stream, a fresh chain and fresh membranes. Completed sectors stay banked.
- **Assist:** after three failures on one checkpoint, an opt-in +1 VIAL ASSIST row appears on the CONTAINMENT LOST screen. It grants a fourth vial and marks that sector's medal "A". Nothing is locked.
- **Game over:** a 9 s countdown returns to attract mode, keeping unlocks and medals. The SPECIMEN TRAY starts any unlocked sector cleanly; play then continues through the campaign from there.

## Difficulty curve (reactive player)

`tests/curve.test.mjs` plays every sector with `tests/reactive.mjs`, a deliberately imperfect player: it acts on a 150 ms-old view sampled every 150 ms, steers at keyboard speed and never leads targets. It plays seeds 42, 1, 7, 3 and 5, with up to three tries per sector, and its timing phase shifts on each retry. The test asserts:

- every sector clears within three tries
- every W1 sector and the bonus clear on the first try
- the world means rise (W1 ≤ W2 ≤ W3)
- the hardest sector is in world 3
- MOTHER CELL is not easier than DELTA, and DELTA never costs a loss

Measured numbers before and after this round are in BALANCE.md.

## Validation

The ordinary-input controller (`autopilot.mjs`, re-exported as `tests/controller.mjs`) clears all 13 stages:

- in the model tests: seeds 42, 1 and 7
- in a scratch run: 20 seeds, with full health every time

It reads state and returns only `{targetX, shoot, shield}`. These runs show the content is reachable and the dodge analysis holds; they say nothing about how hard the campaign feels to a human. Timing details are in [BALANCE.md](./BALANCE.md).
