# Corona Invaders 3D

A bullet hell of a vaccine syringe fighting coronaviruses, in a real Three.js perspective scene. It is derived from the original Corona Invaders in Canvas Retro Arcade: the green 16×16 corona sprite, the syringe and the 4×15 grid all come back, now as a 3D board you move across freely while every virus fires its own kind of bullet.

This is revision five. The user felt revision four had drifted into generic aircraft and lane strafing ("it lost its personality"), and asked for **a bullet hell of a syringe fighting coronaviruses**. The approved design is [RESEARCH_BULLET_HELL.md](./RESEARCH_BULLET_HELL.md). [LEVEL_DESIGN.md](./LEVEL_DESIGN.md) lists the worlds, samples, archetypes and every boss card; [BALANCE.md](./BALANCE.md) has the numbers and the measured evidence.

## Run independently

```sh
npm run dev           # http://127.0.0.1:4175/
node serve.mjs --port 4200
npm test              # 99 tests
npm run build:itch    # dist/corona-invaders-itch.zip
```

Node 18 or later; nothing to install. Three.js r187 and its license live in `vendor/`. Serve over HTTP (module imports are blocked from `file:`). `index.html` is a plain green `#168546` page with only the game centred, at most 960×640; in an iframe or fullscreen the same game fills the surface. The itch ZIP holds 28 files (about 0.55 MiB): runtime modules (`.mjs` rewritten to `.js`), `vendor/` and the Markdown docs. No font, image, model or sound is downloaded at runtime.

## Controls (one scheme)

| Action | Keyboard | Mouse | Touch |
| --- | --- | --- | --- |
| Move (2D, lower 60% of the board) | Arrows / WASD | The syringe follows the cursor | Drag anywhere: finger travel maps 1:1 onto the board (capped at 30 u/s), so the finger never covers the syringe |
| FOCUS (slow 5.0 u/s, parallel NEEDLE stream, graze ring shown) | Hold Shift | Hold left button | Not needed (drag is already precise) |
| SOAP burst (bomb; also within 0.18 s after a hit) | Space or X | Right button | 72 px SOAP button with its stock |
| Fire | Automatic | Automatic | Automatic |
| Pause / retry the sample | P or Esc / R | Pause button | Pause button |

The title shows the line **ARROWS MOVE · SHIFT FOCUS · SPACE SOAP · AUTO-FIRE**. Menus work with ↑/↓ and Enter/Space. Blur, a hidden tab or pause suspends the game and the whole AudioContext.

## What is in the game

- **The kit.** A 0.16 u core hitbox (the white dot in the barrel, always drawn, at least 6 px); a 1.0 u graze ring (+10 and +1 graze per bullet, a SOAP every 100); normal speed 11.5 u/s and focus 5.0 u/s with a 60 ms blend and normalised diagonals; auto-fire at 8 volleys/s (SPRAY 3–5 needles at ±9°, or NEEDLE 3–5 parallel needles in focus); mRNA power L1–L4 with Y-shaped antibody options; SOAP: 2 per vial (Easy 3), up to 5, a soap bubble to 15 u in 0.6 s that turns bullets into antigen tokens and deals 12 damage (3% of a boss card); death: −1 vial, −1 power level dropped as a catchable mRNA strand for 4 s, every bullet cancelled, 0.5 s glide-in, 2.5 s invulnerability.
- **Six bullet families**, shape first: sneeze droplets (teardrops), aerosol mist (decelerating dots), spike proteins (lollipops), RNA beads on a sine with their thread, shootable virions (the original 8-spike crown with a green ring) and mucus globs. Pink-violet with white cores and dark rims, drawn above everything.
- **Twelve pattern presets** (COUGH, SNEEZE, SNIFFLE, CORONA RING, SPIKE BLOOM, DRIP, MUCUS WALL, AEROSOL, SNEEZE JET, RNA STRAND, REPLICATION, QUARANTINE BOX) with tested fairness limits.
- **Coronavirus-only roster:** WILD TYPE (and the 60 mini coronas), SNEEZER, BUDDER, RNA WORM, AEROSOL PUFF, DROPLET, HIJACKER, INFECTED CELL, HEAVY CROWN, BLOOM, VESICLE and the CULTURE CHECK virions. Nothing is shaped like a plane; a test checks the mesh registry.
- **Campaign: 18 samples in four worlds** (AIRWAY, LUNGS with BREATH, BLOODSTREAM with CURRENT, LAB / PETRI with MUTATION), including two bonus samples, four midbosses and four variant bosses: **ALPHA, BETA & GAMMA, DELTA, OMICRON PRIME**, 25 named cards in all. WHO Greek letters only.
- **R0 meter** (3 × escaped ÷ spawned escapable viruses) with a clear bonus for R0 below 1; medals (gold = no vial lost and R0 < 1).
- **Specimen tray** with three tabs: SAMPLES (any unlocked sample), PRACTICE (any cleared sample, one vial, R restarts at once) and MUTATION LAB (any card already seen, ends when the card ends).
- **Easy / Normal** (title and pause): Easy has 5 vials, 3 SOAP, auto-SOAP on hit, a 0.35 s deathbomb, ×0.6 bullets, ×0.85 speed, +0.15 s telegraphs and 2.8 u wall gaps. After three failures the loss screen offers **+1 VIAL** (medal marked A) or **SWITCH TO EASY**.
- **Checkpoints:** a sample clear restores one vial; a world clear restores all and shows a LAB REPORT that waits for a press. A retry restores the sample's entry score, power and RNG stream.

## The UI: a lab instrument, tied to the theme

Landscape puts the board in a centred column (about 430 px at 960×640) with two instrument panels: **DOSES** (vaccine vials), **SOAP** (bubbles and the graze ring toward the next one), **mRNA** (a four-rung helix), supply timers; and **SCORE / HI**, **GRAZE**, an analog **R0** dial with its red zone above 1, the Dose Chain and the sample code. Portrait uses a top strip (vials · score · SOAP, then graze, R0 and the code) and a thumb zone with the SOAP button under the board. The **VIRAL LOAD** bar (virus green) sits in a reserved top band with card notches, ◆ pips and a mutation card tape (`MUTATION 2/4 · FIRST SNEEZE` and a seven-segment timer); card ends show NEUTRALIZED +bonus, TIME OUT or FAILED. Colour rules: green = viruses, pink = danger only, cyan = the vaccine side, amber = supplies and medals. Lettering is generated SVG (dot-matrix, seven-segment) and the title uses the original pixel corona and syringe.

## Code map

| File | Responsibility |
| --- | --- |
| `core.mjs` | Rules (units: u, s, u/s), difficulty table, seeded RNG, events, hitstop |
| `bullets.mjs` | The six families, spawning (2.5 u exclusion, no edge spawns, caps), motion (twists, sine, split), cancels into antigen tokens |
| `patterns.mjs` | The twelve emitter presets, LIMITS, Easy scaling, mutation upgrades, the overlap gate |
| `levels.mjs` | Worlds, archetypes (with per-world attack upgrades) and the 18 authored stage scripts |
| `enemies.mjs` | Formation (never below z = −4), choir fire, divers, flights, worms, puffs, hijack tethers, blooms, vesicles, mutation |
| `bosses.mjs` | Boss and midboss cards, the VIRAL LOAD pool, timeouts, captures, gimmicks, HUD data |
| `scoring.mjs` | Dose Chain, extends, R0 |
| `model.mjs` | State, the kit, supplies, stage scripts, twists, checkpoints, practice, medals, `update()` |
| `autopilot.mjs` | Ordinary-input 2D look-ahead player (attract demo and QA) |
| `shapes.mjs` | The mesh registry (every silhouette as data) and palette |
| `render.mjs` | Three.js scene, world backdrops, meshes from `shapes.mjs`, instanced bullet families, telegraphs, juice |
| `camera.mjs` | Fitted steep camera (pitch 64–74°, FOV 24–32°, depth ratio ≤ 1.35), reserved top band |
| `ui.mjs`, `game.js`, `audio.mjs` | SVG instruments; input, screens, tray, persistence and `window.__game`; synthesized audio |

The simulation imports neither the DOM nor Three.js. It advances in substeps of at most 1/120 s; one call advances at most 2 s.

## Validate

`npm test` runs 99 tests in about 25 s: player kit 15, pattern fairness 10, bosses 16, archetypes 14, campaign/model 20, difficulty curve 6, camera 11, theme 7. They cover hitbox vs graze radii, focus speed, SOAP and deathbomb, death and respawn, spawn exclusion, every authored parameter inside its preset LIMITS, clear gaps, wall gaps, aerosol density, the overlap gate measured on a live campaign, telegraph minimums, card HP/timeouts/captures, boss speed caps, every gimmick, every card dodgeable by a 150 ms reactive player without SOAP, the rising world curve, determinism, checkpoints, practice, supplies, R0, medals, extends, the controller winning the campaign for seeds 42, 1 and 7, and the no-aircraft mesh registry. Results are in BALANCE.md.

## Browser QA interface and what changed for the root suite

```js
__game.newRun(42);                     // reproducible campaign
__game.step(1 / 60, input, { render: false });
__game.checkpoint(4);                  // start an unlocked sample (1..18; 4 = ALPHA)
__game.practice(18, 2, 'omicron');     // MUTATION LAB card (stage, card, boss type)
__game.restart(); __game.bomb(); __game.setDifficulty('easy'); __game.renderer();
__game.setState(patch);                // fixtures only; also boss (merged), enemyShots (normalised), emitters
```

- **Input contract:** `{ axisX, axisZ, focus, bomb, targetX, targetZ, drag, confirm }`. `axisX/axisZ` are in [−1, 1] (+z is toward the player); `axis` is still accepted as `axisX`. `bomb` is edge-triggered (one SOAP per press). `targetX/targetZ` steer toward a board point (`drag: true` for touch speed). `confirm` (or the legacy `shoot` edge) releases the LAB REPORT. Fire is automatic, so `shoot` no longer fires.
- **Shield → SOAP:** `ship.shield`/`ship.shieldCooldown` are gone. Use `ship.bombs` (stock), `bombsUsed` and `soapRing`; Shift now holds focus (`ship.focus`).
- **Hits take the deathbomb window:** a hit sets `ship.dying` for 0.18 s before the vial is lost, so the last-vial fixture needs `step(0.25)` (not `0.03`) to reach `phase: 'lost'`. Its cause card reads "Hit by VIRUS droplet" for a bare fixture bullet.
- **Campaign:** 18 stages (was 13); `wave` and `unlockedStage` reach 18. The controller needs about 78–80k frames; use a budget of `60 * 1800`.
- **Boss HUD:** stage 4 is now ALPHA (pool 1920 = (18+22+22+18) s × 24). `#boss-numeric` reads `hp / max` of the whole pool; `#boss-phase` reads `PHASE k/n · CARD NAME`, with k the card the pool has reached (so `setState({ boss: { hp: 23 } })` on ALPHA shows `PHASE 4/4 · COUGH COUGH` until the boss acts). `#boss-track` carries aria-valuenow/max.
- **Supplies:** kinds are `mrna`, `booster`, `mask`, `soap`, `vial`. A collected `booster` sets `ship.powerups.booster = 8` and `#powerups` reads BOOSTER (the old `rapid` kind no longer exists).
- **Selectors kept:** `#game`, `#play-button`, `#pause-button`, `#menu-button`, `[data-stage="N"]`, `#boss-status`, `#boss-label`, `#boss-numeric`, `#boss-phase`, `#boss-health`, `#boss-track`, `#boss-lag`, `#powerups`, `#touch-fire` (now the full-stage relative drag pad), `#graphics-error`, `#title-sound`, `#sound-button`. New: `#touch-bomb`, `#card-tape`, `#card-result`, `#r0`, `#graze`, `#soap`, `#power`, `#twist-tag`, `[data-practice]`, `[data-card]`, `#tray-tabs`, `#difficulty-button`, `#easy-button`.

## Known limits (honest scope)

- Tuning comes from the autopilot and the 150 ms reactive player, not from human playtests. Easy is implemented and unit-tested but not curve-measured.
- SwiftShader (software WebGL) runs normal scenes at about 47–60 fps, but the 600-bullet stress fixture at about 19 fps and the first half-second after starting a sample is slow there. Real gameplay peaks near 130 bullets. Not checked on real phone GPUs, Safari, Firefox or physical touch devices.
- Card practice exists for boss and midboss cards; best captures are stored locally per card. Hard mode is not built.

## Provenance

The source reference is the user's original `src/js/coronaInvaders/` (a syringe, coronaviruses, three hearts); the two 16×16 sprites are transcribed into `ui.mjs` as SVG pixels. Everything in this folder was authored for the browser experiment: geometry, textures, UI, simulation and tests. Three.js is retained under its license.
