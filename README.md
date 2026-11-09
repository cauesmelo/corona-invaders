# Corona Invaders 3D

An independent browser arcade campaign derived from the original Corona Invaders in Canvas Retro Arcade. You pilot a syringe in a real Three.js perspective cabinet, strafe, hold fire and spend one rechargeable shield. The campaign has three worlds of four sectors plus a CULTURE CHECK bonus stage (13 stages), nine enemy archetypes and four bosses built on mechanics rather than bullet count.

This revision follows the approved research brief in [RESEARCH.md](./RESEARCH.md), sections 5 to 11. The user asked for more maps, bosses and mechanics, and for a UI that is "unique, simple and user friendly" instead of generic. [LEVEL_DESIGN.md](./LEVEL_DESIGN.md) covers the sectors, archetypes and boss scripts. [BALANCE.md](./BALANCE.md) has the numbers and the evidence behind them.

## Run independently

```sh
npm run dev           # http://127.0.0.1:4175/
node serve.mjs --port 4200
```

You need Node 18 or later for the bundled static server; there is nothing to install. Three.js r187 and its license live in `vendor/`. Serve over HTTP, because browsers block module imports from `file:` URLs. All runtime paths are relative.

`npm run build:itch` writes `dist/corona-invaders-itch.zip` (24 files, about 0.5 MiB). The ZIP contains the runtime modules with their `.mjs` extensions rewritten to `.js`, plus `vendor/` and the Markdown docs. It leaves out tests, the dev server and the build scripts. `index.html` shows a plain green `#168546` page with only the game centered on it, at 960×640 at most. In an iframe or in fullscreen, the same game fills the available surface.

## Controls (one scheme)

| Action | Keyboard | Mouse | Touch |
| --- | --- | --- | --- |
| Strafe | ←/→ or A/D | Move over the table | Drag anywhere in the lower 60% of the stage (relative: the ship moves by your finger's travel, so your finger never covers it) |
| Fire | Hold Space (a tap fires at once) | Hold left button | Auto-fire while touching |
| Shield | Shift | — | The 72 px SHIELD button, with a cooldown ring |
| Pause | P / Esc | Pause button | Pause button |
| Retry sector | R | Pause → RETRY SECTOR | Same |

Menus work with ↑/↓ and Enter. On the game-over screen, FIRE retries and ↓ opens the sector map. Losing window focus or hiding the tab pauses the game and releases every held input.

## What is in the game

- **Campaign:** W1 BLOODSTREAM, W2 AIRWAY and W3 LAB / PETRI. Each world follows introduce → develop → twist → conclude. Every new archetype first appears in a group of its own, alongside only plain spores, before it is combined with others; a test enforces this. A CULTURE CHECK bonus stage comes after DELTA.
- **Archetypes:**
  - Spore, Armored, Dart
  - **Mitotic Splitter:** splits into two daughters, which never drop capsules
  - **Diver:** draws a pink dashed path 0.8 s before it dives, then fires once at the end of the line
  - **Burster:** pops in a chain explosion that damages enemies only
  - **Infector:** a pink tether turns a spore into an armored enemy; killing the Infector first gives +300 CURED
  - **Capsid:** a front plate turns shots into sparks. It opens only when the fire clock picks it: a 0.65 s warning, one shot, then 1.5 s open
  - **Courier:** a roulette capsule ship
- **Bosses:**
  - **DELTA** (1-4): fires a lane beam out of its own body and an AIMED DOUBLE along one line. It really splits into two mirrored halves with two sub-bars.
  - **MOTHER CELL** (2-4): sacs spawn Bursters and Divers. Its core then opens and closes, and at the end an orbiting ring of Bursters damages the core.
  - **ECHO** (3-2): a mirror strain that tracks you, then mirrors you, then becomes twins with one vulnerable nucleus. Its eye opens *before* it attacks, so the punish window is never under fire.
  - **OMEGA PRIME** (3-4): four orbiting nodes each own one attack, and you choose the order to destroy them. Each node's shape matches its attack (arrowhead, fan, pillar, egg), the same icon appears on its sub-bar, and the node attacking next pulses. It then fires a corona flare ring with two gaps, followed by a faster full moveset.
  - Every big attack goes telegraph → attack → punish window. Tests check that all of them can be dodged without the shield.
  - **One threat at a time:** escorts hold fire while a boss telegraph is up, and a beam or flare never starts while that boss's last bullets are still incoming.
  - **Beams:** the floor glow stays on while the beam burns, and a beam hits only when the ship's core dot is inside it.
- **Dose Chain:** each kill refreshes a 1.6 s window. Tiers give ×2 to ×6. The chain is shown three ways: the syringe barrel fills with fluid, a floating ×N appears by the ship, and there is a HUD chip. Damage breaks the chain; the shield does not.
- **Medals per sector:** Bronze for a clear, Silver for losing at most one vial, Gold for no hit within par. They are stored locally, and storage failures are tolerated.
- **Capsules:** the Courier is the main source: shoot it and it drops whatever capsule its icon shows at that moment. The first ×4 chain in a sector guarantees one capsule. Random drops are 4% of eligible kills with a 10 s cooldown. Each capsule has its own silhouette: chevron, trident, ring or cross. Active timers appear as rings at the ship's base and as HUD chips.
- **Membranes:** four bunkers of eight cell-wall cells. They stop enemy shots, which chip them, and enemies erase cells they touch. The player's own doses pass straight through, so taking cover never costs you. They are rebuilt each sector and removed as the twist in 3-3.
- **Checkpoints:** clearing a sector restores one vial. Clearing a world restores every vial and shows a LAB REPORT that waits for FIRE. A retry restarts the sector at its entry score with three vials, entry RNG, a fresh chain and fresh membranes. After three failures an opt-in +1 vial assist is offered; it marks that medal "A" and locks nothing.

## The UI: the cabinet as a lab instrument

Phosphor LED readouts, cyan system glass and black bezels. Each color has one meaning: phosphor is the player and score, cyan is shield and system, pink is danger only (enemy fire, telegraphs and damage), amber is armor and medals, and boss bodies are pale violet-white. All lettering and numbers are drawn locally, with no fonts fetched. Headings use a 5×7 dot-matrix SVG face, numbers use seven-segment SVG digits, and labels use the system monospace stack.

- **HUD strip** (44 px; 40 px on narrow screens; 50 px with 44 px buttons on touch): dose vials on the left; a hit cracks one and drains it over 300 ms. The HUD is hidden on the title and in the tray. The LED score and chain chip sit in the center. The sector code and world, and the pause button, are on the right.
- **VIRAL LOAD boss bar:** it sits in an 84 px top band that the camera keeps clear, so it never covers the arena. It is 56% of the stage width (up to 520 px) and 24 px tall, with the phase name inside the track; on narrow screens it is 18 px tall and full width. It has phase notches, ◆◇ pips, sub-bars for halves, sacs and nodes, an immediate fill, a delayed damage trail and ARIA progress values. At a phase break the bar shakes and the next phase's name shows for 1.2 s.
- **Sector intro tape:** a 1.4 s slide-in label in the top band, showing for example "1-3 SPLIT DECISION". The first time you meet a sector, it adds a "NEW" line with an icon and runs for 2.4 s. Boss sectors skip the tape: the bar's tag shows the code, and a first-time hint appears as a center callout while the boss slides in.
- **Sector clear tally strip:** for example "CLEAR +1000 · CHAIN ×5 · ★ SILVER". It appears inside the 1.8 s transition while play continues.
- **Screens:**

  | Screen | Content |
  | --- | --- |
  | Title | Dot-matrix logo, blinking PRESS FIRE (TAP TO START on touch), a one-line controls strip matched to the device, MAP and SOUND icons, local high score. No HUD and no formation behind the logo |
  | Attract | After 8 s idle: live DEMO (20 s, played by the autopilot on its own state), TOP CULTURES, CONTROLS card, then back to the logo |
  | SPECIMEN ON HOLD (pause) | Desaturated scene and rows: Resume, Retry, Sector map, Sound, Effects (Full/Reduced), Controls |
  | CONTAINMENT LOST | Cause card (for example "Hit by DIVER shot · 1-3 · 0:42") and a labelled countdown, "CONTINUE? 9 · FIRE TO RETRY", that returns to attract mode |
  | LAB REPORT | Shown at each world clear |
  | CONTAINED | Campaign victory |
  | SPECIMEN TRAY | Sector map: 3 rows × 4 petri dishes plus a bonus dish. Medals differ by shape: bronze coin with one pip, silver hexagon with two pips, gold star; a dashed ring means no medal yet. Locked dishes are sealed. BACK returns to whatever opened the tray, with progress intact |

  Each screen has one primary action.
- **Accessibility:** shape always backs up color. `prefers-reduced-motion` and Effects: Reduced turn off shake, flash, scale punch, knockback, debris flight and decorative bobbing. Minimum text size is 12 px at 960×640 and 10 px at 320 px wide; both are checked in a real browser.

**Removed per the brief:** the Arial headline, the ↗ buttons, "FREE PLAY", the hint footer, "CABINET ONLINE" and its status dot, the corner notes, the stacked secondary buttons, the 7 to 9 px labels, the purple playfield glow, the text SOUND toggle and the `<select>`.

## Juice

All of these are visual or audio only and live in `render.mjs` and `audio.mjs`, except hitstop.

- **Hits:** a 60 ms white flash, a 1.12→1.0 scale punch and a 0.15 u knockback.
- **Screen shake:** trauma² × 0.35 u, decaying at 1.5/s, plus a 0.04 u kick on each shot.
- **Debris:** a pool of 300 instanced voxel shards. They are dark, stay on the floor plane and are gone in 1.6 s, so they never read as spores or bullets.
- **Shot effects:** a 40 ms muzzle flash and a plunger kick.
- **Audio:** kill tones rise one semitone per chain tier. A 4-note formation bass pulse speeds up from 72 to 144 bpm as the sector empties.
- **Hitstop:** 30 ms on armored, splitter and capsid kills, 60 ms on a Courier kill, 120 ms on a phase break, none on popcorn kills, capped at 120 ms in any rolling second. Boss death adds 200 ms of hitstop and 0.8 s of half-speed slow motion. Hitstop pauses the model step itself (input, actors and collisions), not just rendering. A tap made during the freeze is buffered.

## Code map

| File | Responsibility |
| --- | --- |
| `core.mjs` | Rules constants (units: world u and seconds), seeded xorshift RNG, bullets, telegraphs, hitstop budget |
| `levels.mjs` | Worlds, archetype stats, the 13 authored stages, measured medal pars |
| `enemies.mjs` | Formations and archetype behaviors (dives, plates, tethers, Courier, bonus fliers) |
| `bosses.mjs` | Boss pools, phase floors, data-driven attack scripts, vulnerability, HUD data |
| `scoring.mjs` | Dose Chain rules |
| `model.mjs` | State, update loop, collisions, damage, drops, membranes, checkpoints, medals |
| `autopilot.mjs` | Ordinary-input player for the attract demo and QA (`tests/controller.mjs` re-exports it) |
| `render.mjs` | Three.js cabinet, per-world themes, archetype meshes, telegraph meshes, instanced projectiles and debris, juice |
| `audio.mjs` | Synthesized sound, on by default (enabled on the first gesture; the SOUND toggle is remembered); pause, blur or a hidden tab suspends all audio |
| `ui.mjs` | Dot-matrix, seven-segment, vial, medal and icon SVG generators |
| `game.js` | Input, screens, attract mode, local persistence, `window.__game` |
| `camera.mjs` | Fitted framing: searches pitch and FOV per viewport, keeps the 84 px top band clear, fits the envelope tightly and anchors portrait views to the top |

The simulation imports neither the DOM nor Three.js. It advances in substeps of at most 1/180 s, and one call advances at most 2 s.

## Validate

```sh
npm test            # 94 tests: model 39, archetypes 16, bosses 23, camera 11, curve 5
npm run build:itch
```

The tests cover:

- each archetype's behavior
- each boss's phases, telegraphs and punish windows
- a no-shield dodge analysis of every boss attack, from five start positions, with a 0.25 s reaction time at keyboard speed
- movement continuity across phase changes
- the chain tiers and reset on retry
- hitstop freezing the model, and its cap
- daughters never dropping capsules
- Bursters never hurting the player
- bounded capsule supply
- checkpoint, heal and assist rules
- medal pars
- full campaign wins by the ordinary-input controller for seeds 42, 1 and 7
- a difficulty-curve check with a deliberately imperfect reactive player (`tests/reactive.mjs`). It acts on a 150 ms-old view, steers at keyboard speed and does not lead targets. The test requires that it clear every sector within 3 tries and that the curve is not inverted

Results: see BALANCE.md.

## Browser QA interface

```js
__game.getState();               // snapshot; phase, elapsed, kills, hits, health, shotsFired, wave, dropsSpawned,
                                 // pickupsCaught, unlockedStage, seed, ship.shieldCooldown, boss, chain, membranes …
__game.newRun(42);               // reproducible campaign
__game.step(1 / 60, input, { render: false });
__game.step(0);                  // flush UI/scene
__game.checkpoint(4);            // start an unlocked stage (stage ids 1..13; 4 = DELTA)
__game.restart();                // retry the current checkpoint
__game.confirm();                // continue past a LAB REPORT (FIRE does the same)
__game.menu();                   // open the SPECIMEN TRAY
__game.renderer();               // triangles, calls, viewport, ship/framing projections
__game.setState(patch);          // explicit fixtures only; normal play never calls it. Also accepts `boss` (merged)
```

**Selectors that changed for the root suite:**

- `#stage-select` is gone. Each dish in the SPECIMEN TRAY is `[data-stage="N"]` and starts that sector directly. DELTA is now stage 4, so the old `selectOption("3")` becomes `[data-stage="4"]` with no extra `#play-button` click.
- `#play-button` is the single primary action on every screen: start, resume, retry, continue and new campaign.
- `#menu-button` opens the tray from pause, loss and victory.
- `#touch-fire` is the touch drag pad. It is visible while playing on coarse pointers, and tapping it fires.
- `#boss-numeric` now reads `"hp / max"`, without the "HP" suffix.

## Playtest fix round (revision 4)

An independent playtest (real input plus a lagging reactive script) found the curve inverted. Worlds 1 and 2 were easy; DELTA, CAPSID WALL, ECHO and OMEGA were walls. The fixes:

- Capsids fire on the formation clock and stay open 1.5 s.
- Echo opens its eye before attacking.
- Omega's crown has lighter, slower attacks.
- Delta's beam comes from its body, its double shot travels down one line, and escorts hold fire during big telegraphs.
- A boss's previous bullets clear before a beam or flare starts.
- Beam glows persist while live, and only the ship's core is hit.
- Armored pairs are tight instead of bracketing your position.
- Mother is a step harder than Delta.
- Membranes let player doses through.
- The UV lamp band is gone.
- Omega nodes have attack-shaped silhouettes and icons.
- The camera is fitted per viewport and larger.
- The tray's BACK bug is fixed.
- Plus clearer title, medals, countdown, touch targets, debris and warning rings, and no shadow-type deprecation warning.

Before/after numbers are in BALANCE.md. API, selectors and boss HP are unchanged.

## Not implemented (honest scope)

- **Vaccine Burst:** left out by instruction.
- **The "four touch buttons" alternative layout:** not built. Touch has one scheme: drag, auto-fire and a shield button.
- **OUTBREAK endless mode:** not built.
- **Only one CULTURE CHECK:** B1. There is no second bonus stage with a Capsid preview.
- **Untested environments:** Safari and Firefox, physical touch devices, real phone GPUs, subjective audio quality and real itch.io hosting.
- **Medal pars:** these come from the QA controller, not from human playtests.

## Provenance

The source reference is the user's original `src/js/coronaInvaders/`: a syringe ship, coronavirus enemies and three hearts. It is unchanged outside this folder. Everything in this folder was authored for the browser experiment: the geometry, textures, UI, simulation and tests. Three.js is retained under its license. No CDN, font, model or texture is downloaded at runtime.
