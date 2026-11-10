# Corona Invaders 3D

A bullet hell of a vaccine syringe fighting coronaviruses, in a real Three.js perspective scene. It is derived from the original Corona Invaders in Canvas Retro Arcade: the green 16×16 corona sprite, the syringe and the 4×15 grid all come back, now as a 3D board you move across freely while every virus fires its own kind of bullet.

This is revision five. The user felt revision four had drifted into generic aircraft and lane strafing ("it lost its personality"), and asked for **a bullet hell of a syringe fighting coronaviruses**. The approved design is [RESEARCH_BULLET_HELL.md](./RESEARCH_BULLET_HELL.md). [LEVEL_DESIGN.md](./LEVEL_DESIGN.md) lists the worlds, samples, archetypes and every boss card; [BALANCE.md](./BALANCE.md) has the numbers and the measured evidence.

## Run independently

```sh
npm run dev           # http://127.0.0.1:4175/
node serve.mjs --port 4200
npm test              # 144 tests
# dev tools (Chrome via ../common's Playwright):
#   soundboard.html                        audition and measure every SFX (npm run dev, then /soundboard.html)
#   node tests/browser/audio-measure.mjs [--before <git ref>]
#   node tests/browser/personality-audit.mjs [--root <other checkout>]
npm run build:itch    # dist/corona-invaders-itch.zip
```

Node 18 or later; nothing to install. Three.js r187 and its license live in `vendor/`. Serve over HTTP (module imports are blocked from `file:`). `index.html` is a plain green `#168546` page with only the game centred, at most 960×640; in an iframe or fullscreen the same game fills the surface. The itch ZIP holds 33 files (about 0.61 MiB; `soundboard.html` stays out): runtime modules (`.mjs` rewritten to `.js`), `vendor/` and the Markdown docs. No font, image, model or sound is downloaded at runtime.

## Controls (one scheme)

| Action | Keyboard | Mouse | Touch |
| --- | --- | --- | --- |
| Move (2D, lower 60% of the board) | Arrows / WASD | Hold the left button over the board: the syringe follows the cursor. Moving the mouse without a button, or over the side panels, does nothing, so a resting hand never fights the keyboard | Drag anywhere: finger travel maps 1:1 onto the board (capped at 30 u/s), so the finger never covers the syringe |
| FOCUS (slow 5.0 u/s, parallel NEEDLE stream with more damage on target, graze ring shown) | Hold Shift | — (Shift only) | Not needed (drag is already precise) |
| SOAP burst (bomb; also within 0.18 s after a hit) | Space or X | Right button | 72 px SOAP button with its stock |
| Fire | Automatic | Automatic | Automatic |
| Pause / retry the sample | P or Esc / R | Pause button | Pause button |

The title shows the line **ARROWS MOVE · SHIFT FOCUS · SPACE SOAP · AUTO-FIRE**. Menus work with ↑/↓ and Enter/Space. Blur, a hidden tab or pause suspends the game and the whole AudioContext.

## What is in the game

- **The kit.** A 0.2 u core hitbox, drawn as the glowing vaccine chamber in the middle of the barrel at exactly the collider radius (9.0 px at 960×640, 6.0 px at 320 wide); a 1.0 u graze ring (+10 and +1 graze per bullet, a SOAP every 100); normal speed 11.5 u/s and focus 5.0 u/s, with no inertia (start, stop and the focus switch act on the step of the press) and normalised diagonals; auto-fire at 8 volleys/s (SPRAY 3–5 needles at ±4°, or NEEDLE 3–5 parallel needles in focus); mRNA power L1–L4 with Y-shaped antibody options; SOAP: 2 per vial (Easy 3), up to 5, a soap bubble to 15 u in 0.6 s that turns bullets into antigen tokens and deals 12 damage (3% of a boss card); death: −1 vial, −1 power level dropped as a catchable mRNA strand for 4 s, every bullet cancelled, 0.5 s glide-in, 2.5 s invulnerability.
- **Six bullet families**, shape first: sneeze droplets (teardrops), aerosol mist (decelerating dots), spike proteins (lollipops), RNA beads on a sine with their thread, shootable virions (the original 8-spike crown with a green ring) and mucus globs. Pink-violet with white cores and dark rims, drawn above everything.
- **Hitboxes are what you see** (`hitboxes.mjs`, one module shared by the simulation and the renderer). The player is only the glowing core. An enemy is its body sphere (or capsule for the BUDDER and RNA WORM); spikes are decoration for every interaction. A bullet is its solid body, dark rim included; the glow outside is light, not matter. Droplets and spike proteins are capsules along their travel. Collisions are swept over each 1/120 s substep, so nothing tunnels. Needles are thin segments, lane beams are their drawn rectangle, the SOAP ring is its drawn radius and supplies are caught by the barrel. `?hitboxes=1` or `__game.hitboxes(true)` draws every collider as an outline.
- **Twelve pattern presets** (COUGH, SNEEZE, SNIFFLE, CORONA RING, SPIKE BLOOM, DRIP, MUCUS WALL, AEROSOL, SNEEZE JET, RNA STRAND, REPLICATION, QUARANTINE BOX) with tested fairness limits.
- **Coronavirus-only roster:** WILD TYPE (and the 60 mini coronas), SNEEZER, BUDDER, RNA WORM, AEROSOL PUFF, DROPLET, HIJACKER, INFECTED CELL, HEAVY CROWN, BLOOM, VESICLE and the CULTURE CHECK virions. Nothing is shaped like a plane; a test checks the mesh registry.
- **Campaign: 18 samples in four worlds** (AIRWAY, LUNGS with BREATH, BLOODSTREAM with CURRENT, LAB / PETRI with MUTATION), including two bonus samples, four midbosses and four variant bosses: **ALPHA, BETA & GAMMA, DELTA, OMICRON PRIME**, 25 named cards in all. WHO Greek letters only.
- **R0 meter** (3 × escaped ÷ spawned escapable viruses) with a clear bonus for R0 below 1; medals (gold = no vial lost and R0 < 1). R0, the Dose Chain and the Shift stronger-needle rule are each explained once in a short hint the first time they matter.
- **Specimen tray** with three tabs: SAMPLES (any unlocked sample), PRACTICE (any cleared sample, one vial, R restarts at once) and MUTATION LAB (any card already seen, ends when the card ends).
- **Easy / Normal** (title and pause): Easy has 5 vials, 3 SOAP, auto-SOAP on hit (so its 0.35 s deathbomb matters only with an empty stock), ×0.6 bullets, ×0.85 speed, +0.15 s telegraphs and 2.8 u wall gaps. The title offers **EASY START** on a first visit. After three failures the loss screen offers **+1 VIAL** (medal marked A) or **SWITCH TO EASY**, with Easy as the focused default. The loss screen ignores keys for 1 s and then needs a fresh press, so a held Space cannot retry by accident (clicks work at once).
- **Checkpoints:** a sample clear restores one vial; a world clear restores all and shows a LAB REPORT that waits for a press. A retry restores the sample's entry score, power and RNG stream.

## The UI: a lab instrument, tied to the theme

Landscape puts the board in a centred column (about 430 px at 960×640) with two instrument panels: **DOSES** (vaccine vials), **SOAP** (bubbles and the graze ring toward the next one), **mRNA** (a four-rung helix), supply timers; and **SCORE / HI**, **GRAZE**, an analog **R0** dial with its red zone above 1, the Dose Chain and the sample code. Portrait uses a top strip (vials · score · SOAP, then graze, R0 and the code) and a thumb zone with the SOAP button under the board. The **VIRAL LOAD** bar (virus green) sits in a reserved top band with card notches, ◆ pips and a mutation card tape (`MUTATION 2/4 · FIRST SNEEZE` and a seven-segment timer); card ends show NEUTRALIZED +bonus, TIME OUT or FAILED. Colour rules: green = viruses, pink = danger only, cyan = the vaccine side, amber = supplies and medals. Lettering is generated SVG (dot-matrix, seven-segment) and the title uses the original pixel corona and syringe.

## Sound: synthesized, layered, juicy (revision five)

The user found the SFX "really lame, with no juice". Every sound is still synthesized at run time (`audio.mjs`, Web Audio, no files), now designed with game-feel rules (sources in RESEARCH_BULLET_HELL.md §12):

- **Layers.** Important sounds are a transient (a 1–10 ms click or noise tick), a pitched body and a tail; impacts add a short low thump. A kill is a click, a bubble "pop" (a fast downward sine sweep), a thump scaled by the virus's size (mini, popcorn, big) and a sparkle tail; big viruses add a wet squelch.
- **Variation.** Pitch (25–90 cents), filter bands and noise offsets change on every play, so a repeat never sounds identical.
- **Hierarchy.** Auto-fire plays 8 times a second all game, so it is the quietest and softest sound: a low-passed "tff" with a 4 ms attack at −35 dBFS (−49 LUFS-M over 2 s), shifting band and pitch every volley. Hits are short ticks that rise as a virus nears death, and boss hits are a dull two-partial "tink" at most twice per 75 ms. The excitement is in kills, grazes, SOAP and boss moments.
- **Rising streaks.** Kills inside a Dose Chain climb a pentatonic scale over two octaves, chain tiers add an arpeggio, and consecutive grazes (within 0.45 s) climb one semitone each. The graze is its own bright "tsk".
- **Big moments.** SOAP is a stereo whoosh, a sub boom and a dozen bubble pops (a deathbomb adds a relieved chime). A core hit is a glassy crack that says "SOAP now"; a lost vial is a crunch, a descending tritone and a heavy thud. Boss entrances swell into an impact as the boss lands, phase changes hit a brassy minor stab with a timpani, a NEUTRALIZED card plays a fanfare, and a boss death is the payoff: escalating pops across its body, then a huge boom and a major fanfare with a room tail exactly when the body bursts (`DEFEAT_FINAL`).
- **Space and mix.** Sounds pan by world x (±0.7). Big events duck the bass march 8–24 dB for a moment. A voice cap (56, low-priority sounds dropped first) and per-sound rate limits keep floods clean. The master runs through a compressor (−14 dB threshold, 6:1, 3 ms attack) and a soft clipper whose ceiling is 0.98 (−0.18 dBFS).
- **Voices.** Every virus type has a tiny formant voice (a sawtooth through three vowel band-passes, with growl, vibrato or breath per character): the grunt's "hup", the choir's "bip", the sneezer's "ah... ah..." into "CHOO", the droplet's "wheee" dive, the schemer's "heh heh", the brute's growl, the diva's sung "la". Bosses babble their taunt lines (syllables per word, vowels taken from the text, "?" and "!" rise, "..." falls) while their mouths flap.
- **The march.** The original 4-note bass now plays an octave up (82–110 Hz reads on laptop speakers; the old 20–27 Hz sub only ate headroom) with a soft off-beat tick, still speeding from 72 to 144 bpm as a sample empties.
- **A click bug fixed.** Every envelope now zeroes its gain's intrinsic value: before, a source that started a fraction of a sample early passed one sample at gain 1 (measured single-sample spikes up to −13 dBFS). The old engine also started 28 of its 40 sounds with an instant (0 ms) onset.
- Audio is still on by default, starts on the first gesture, and pause, blur or a hidden tab suspends the whole context.

**Before / after** (`node tests/browser/audio-measure.mjs --before 061c348`: OfflineAudioContext at 48 kHz through each engine's real chain, after 1.5 s of unmeasured silence so Chrome's compressor has settled; peak dBFS / max momentary loudness LUFS-M (BS.1770 K-weighting, 400 ms) / attack ms / length ms):

| Sound | Before | After |
| --- | --- | --- |
| Needle volley (auto-fire) | −45.8 / −67.2 / 0 / 12 | −35.3 / −55.3 / 3 / 32 |
| Two seconds of auto-fire | −45.8 / −61.2 / — / 1886 | −33.0 / −49.1 / — / 1907 |
| Needle hits a virus | −43.3 / −62.0 / 0 / 14 | −29.7 / −52.3 / 0 / 22 |
| Pop: WILD TYPE | −35.3 / −53.3 / 2 / 61 | −11.2 / −31.4 / 1 / 326 |
| Pop: HEAVY CROWN | −35.3 / −53.3 / 2 / 61 | −10.2 / −28.8 / 1 / 399 |
| Dose Chain of 10 kills | −35.2 / −48.5 / — / 1505 | −9.8 / −25.2 / — / 1793 |
| Graze tick | −41.2 / −59.7 / 0 / 12 | −21.6 / −44.4 / 1 / 19 |
| SOAP burst | −27.5 / −38.9 / 0 / 348 | −5.3 / −17.1 / 8 / 1362 |
| Core hit (SOAP window) | −35.3 / −49.4 / 0 / 43 | −10.8 / −31.9 / 0 / 100 |
| Vial lost | −26.4 / −41.5 / 6 / 236 | −4.6 / −20.0 / 4 / 1257 |
| Supply: mRNA | −29.0 / −42.6 / 0 / 182 | −19.0 / −30.2 / 138 / 744 |
| SNEEZE "CHOO" | −27.4 / −44.3 / 0 / 138 | −16.5 / −31.3 / 4 / 461 |
| Card declared + taunt | −35.3 / −44.7 / 0 / 197 | −17.9 / −31.9 / 428 / 794 |
| Phase-change stinger | silent | −8.1 / −21.2 / 3 / 1288 |
| Boss entrance | silent | −7.9 / −21.2 / 1333 / 2620 |
| Boss defeated (payoff)* | silent | −3.8 / −14.9 / 1004 / 2655 |
| Bass march, 72 bpm (2 s) | −28.1 / −47.8 / 0 / 1772 | −17.5 / −33.5 / 18 / 2100 |

\* The old engine played a boss death as one 0.9 s sawtooth on the `kill` event and ignored `boss-defeated`. Before, 12 of the 55 catalogued events were silent (respawn, power-up, cough wind-up, droplet dive and splash, boss and midboss entrances, phase change, card time-out, boss and midboss defeats, campaign won); now none are, and every peak sits between −35.3 and −3.8 dBFS. **Busy mix** (4 s of auto-fire, 25 hits/s, a chain of kills, grazes, a SOAP, a lost vial and a card fanfare over the march): before −24.1 dBFS peak / −37.0 LUFS-M, after −4.4 dBFS / −16.9 LUFS-M with **0 samples at or above 0.99**. The full 79-row table (every voice too) prints from the script; `soundboard.html` auditions every entry of `SFX_CATALOG` and measures it in the browser.

## Villains with personality (revision five)

The user: "the theme is great but it reads generic; the villains could have a bit more personality". Every virus now has a character (`personality.mjs`): a role and a one-line personality, a face, idle motion, reactions and a voice. Faces are decals (`faces.mjs`): one instanced mesh for every face on the board (one draw call) with a signed-distance shader that draws eyes with lids, coloured irises, pupils and highlights, brows (normal, thick or a unibrow), a mouth with teeth (white, shark or gritted) and a small tongue, a hurt `>.<`, `X X` for the dead and a panic sweat drop. Pupils follow the syringe.

| Character | Personality | Face, motion, voice |
| --- | --- | --- |
| WILD TYPE | The grunt: cheeky, eager, not very bright | Round eyes, toothy grin; bobs and twitches; "hup" |
| mini corona | The choir: sixty tiny fans in rows | Big dot eyes and a singing "o"; head-bobs and sways on the march beat; "bip" |
| SNEEZER | The drama queen, always about to sneeze | Droopy watery eyes, worried brows; sniffles; "ah... ah..." (eyes squeeze, mouth opens, it rears up and its spikes bristle), then "CHOO" and a recoil |
| BUDDER | The show-off splitter | Wide-set eyes across both lobes, a big grin, a smirk and a wink; "ta-da" |
| RNA WORM | The sneak | Slit eyes on its head that always look away from you, a sly smirk; a hiss |
| AEROSOL PUFF | The airhead | Dreamy half-lids, a blowing "o", wandering eyes; a giggle |
| DROPLET | The daredevil | Hard brows, locked-on stare; screams with its mouth wide the whole dive ("wheee") |
| HIJACKER | The schemer | Shifty side-glances, one raised brow, a crooked smirk; "heh heh" when it tethers |
| INFECTED CELL | The victim | Queasy, wobbly, worried; "urp" |
| HEAVY CROWN | The brute | Unibrow scowl, beady eyes, gritted teeth, slow deep breaths; a growl |
| BLOOM | The diva | Lashes and haughty half-lids; its face appears only when the bud opens ("ta-da"); a sung "la" |
| VIRION | The coward | Wide eyes, sweat, wobbly mouth; "eek" |
| VESICLE | The courier | No face on purpose: the supply icon it carries is what you must read; a "bloop" |
| ALPHA | The original: pompous, proud and still coughing | Heavy brows, arrogant half-lids, a smug smirk |
| BETA & GAMMA | The bickering twins: one viral load, two egos | BETA bored and snooty; GAMMA squat, furious, yelling; they take turns talking |
| DELTA | The speedster: impatient, aggressive, splits in two | Sharp slanted eyes, a shark grin, constant jitter; its halves are just as impatient |
| OMICRON PRIME | The mutant king: never the same virus twice | Mismatched eyes, a manic grin, wandering stare; its spike nodes are scowling bodyguards |
| BIG SNEEZER / AEROSOL CLOUD / MOTHER CELL / LAMBDA | The allergy / the space cadet / the overbearing mother / the copycat | Midboss faces in the same style; LAMBDA's eyes mirror yours |

- **Idle life:** breathing (vertical swell), crown sway and spike twitches, blinks every 2.6–5.2 s on a per-virus phase, the choir's head-bob on the march.
- **Reactions:** a `>.<` flinch on every hit (bosses at most once a second, so their faces stay readable under auto-fire), panic below 35% HP (wide eyes, small pupils, sweat, a shiver), every villain smug and laughing for 1.6 s when the player loses a vial, shocked when the player deathbombs out of a hit, attack wind-ups per pattern (a puffed "o" before a cough, a grin before a ring), a 0.1 s inflate-and-pop on every kill.
- **Bosses:** a name card on entrance (role and a one-line personality, tinted with the variant's colour, with the first-visit hint underneath), eyes that open from shut as it slides in and a squash when it lands, a taunt in a speech bubble at every card start, a gloat when you lose a vial, and a defeat: a panicked wail with its last line, `X X` eyes, a swelling white shiver with small pops in time with the audio, then the burst. The LAB REPORT and victory screens wait 1.7 s for that payoff (presentation only: the model's 0.6 s minimum report hold is unchanged, presses during the delay are dropped and a key held from the fight must be released first).
- **Readability rules (tested):** speech appears only when bullets were just cancelled (a card start, a lost vial, a defeat), in translucent panels like the callout. Faces render under every bullet, warning ring and telegraph. Colours keep their meanings: irises are virus greens, ink is dark, there is no pink.

**Hitboxes are exactly as they were.** `tests/personality.test.mjs` snapshots every collider (core, graze ring, six bullet families, needles, SOAP, mask, the 13 archetypes and 8 bosses) against the values before this pass. Bodies never translate: personality is squash, stretch and tilt around the board-plane centre on a separate node, normalised so the drawn footprint never exceeds the collider (`bodyMotion`, tested over about 21,000 sampled states per character). Previously the sneeze inhale drew the SNEEZER 25% wider than its collider and the hit punch 14% wider; now the inhale stretches upward and bristles the decorative crown, and a hit shrinks the footprint by at most 8% for 0.14 s. A HIJACKER-converted HEAVY CROWN is rebuilt (it used to keep its smaller WILD TYPE mesh, drawn at 0.6 u over a 0.85 u collider). Faces sit inside every silhouette: the decal is placed by casting the view ray onto the drawn ellipsoid, and its worst-case reach is checked for pitches 64–74°. In Chrome, `__game.audit()` measures every body from the real world matrices and every face on screen: over the audit scenes the drawn footprint stays at 91.6–100.0% of the collider and the worst face is 0.29 px inside its silhouette; the `?hitboxes=1` outlines still trace the body spheres.

**Frame time** (`tests/browser/personality-audit.mjs`, SwiftShader, 960×640, 5 s per scene, before = commit 061c348 / after): title 53.6 / 51.3 fps; 1-1 choir 58.8 / 57.6 fps (median 16.7 ms both); 1-3 with BIG SNEEZER 60 / 60; ALPHA 60 / 60; BETA & GAMMA 60 / 60; OMICRON SPIKE CROWN 46.4 / 51.4 fps; 4-3 busy stage 53.4 / 56.0 fps. Medians are 16.7 ms everywhere; the faces cost one draw call. Separate runs vary by about ±5 fps in the busy scenes (one after-run measured 43 fps in 4-3), so the change is within noise.

## Code map

| File | Responsibility |
| --- | --- |
| `core.mjs` | Rules (units: u, s, u/s), difficulty table, seeded RNG, events, hitstop |
| `clock.mjs` | The browser's fixed 1/120 s step clock: frame snapping, the 50 ms stall cap, interpolation only at refresh rates the grid does not divide |
| `bullets.mjs` | The six families, spawning (2.5 u exclusion, no edge spawns, caps), motion (twists, sine, split), cancels into antigen tokens |
| `patterns.mjs` | The twelve emitter presets, LIMITS, Easy scaling, mutation upgrades, the overlap gate |
| `levels.mjs` | Worlds, archetypes (with per-world attack upgrades) and the 18 authored stage scripts |
| `enemies.mjs` | Formation (never below z = −4), choir fire, divers, flights, worms, puffs, hijack tethers, blooms, vesicles, mutation |
| `bosses.mjs` | Boss and midboss cards, the VIRAL LOAD pool, timeouts, captures, gimmicks, HUD data |
| `scoring.mjs` | Dose Chain, extends, R0 |
| `model.mjs` | State, the kit, supplies, stage scripts, twists, checkpoints, practice, medals, `update()` |
| `autopilot.mjs` | Ordinary-input 2D look-ahead player (attract demo and QA) |
| `shapes.mjs` | The mesh registry (every silhouette as data) and palette |
| `hitboxes.mjs` | Every collider and how it is drawn: bullet capsules, sprite layouts, swept tests, needle segments, beams, enemy body scale |
| `render.mjs` | Three.js scene, layered board, world backdrops, lit meshes from `shapes.mjs`, the detailed syringe, instanced bullet families, contact shadows, telegraphs, juice, the hitbox overlay, boot prewarm |
| `camera.mjs` | Fitted steep camera (pitch 64–74°, FOV 24–32°, depth ratio ≤ 1.35), reserved top band |
| `personality.mjs` | Villain characters: roles, one-liners, face styles and moods (`faceState`), idle life and reactions (`bodyMotion`, footprint-normalised), boss name cards and lines, the march tempo, face reach |
| `faces.mjs` | The instanced face decals: the signed-distance face shader and ray placement on the drawn body |
| `audio.mjs` | Synthesized SFX and voices, the master compressor and clipper, ducking, the march; `SFX_CATALOG` fixtures |
| `ui.mjs`, `game.js` | SVG instruments; input, screens, tray, persistence, the boss name card and speech bubble, and `window.__game` |
| `soundboard.html` | Dev tool: audition and measure every SFX and voice (not in the itch ZIP) |

The simulation imports neither the DOM nor Three.js. It advances in substeps of at most 1/120 s; one call advances at most 2 s.

## Validate

`npm test` runs 144 tests in about 28 s: player kit 15, pattern fairness 10, bosses 17, archetypes 14, campaign/model 20, difficulty curve 7, camera 11, theme 8, hitboxes 7, movement audit 18, audio 10, personality 7. They cover every collider against its drawn sprite or mesh (bullets per family, enemy and boss bodies, the syringe core), capsule and swept collisions with no tunnelling, exact edges for needles, beams, contact, supplies and SOAP, every boss card's TTK under 80% of its timeout at 75% of the reference DPS, the reactive player ending cards by damage, hitbox vs graze radii, focus speed, SOAP and deathbomb, death and respawn, spawn exclusion, every authored parameter inside its preset LIMITS, clear gaps, wall gaps, aerosol density, the overlap gate measured on a live campaign, telegraph minimums, card HP/timeouts/captures, boss speed caps, every gimmick, every card (LAMBDA MIRROR included) dodgeable by a 150 ms reactive player without SOAP, the rising world curve, determinism, checkpoints, practice, supplies, R0, medals, extends, the controller winning the campaign for seeds 42, 1 and 7, and the no-aircraft mesh registry with distinct boss silhouettes. The audio tests run the engine on a recording fake AudioContext (every catalogued sound builds and stops its graph, the limited master, auto-fire 15+ dB under a kill with a 4 ms attack, variation, rising streaks, panning, ducking, the voice cap, pause, a distinct voice per character, babbled lines). The personality tests cover the collider snapshot, footprints, faces inside silhouettes, distinct characters, reactions, boss scripts and that the simulation never imports presentation. Results are in BALANCE.md.

The movement audit (`tests/movement-audit.test.mjs`, results and reasons in [MOVEMENT_AUDIT.md](./MOVEMENT_AUDIT.md)) measures the shared movement rubric: input acting on the step of the press, identical simulations at 30/60/120/240 Hz and through hitches, presses across pause, hitstop, sample ends and retries, crossing times, edges, the marker and graze ring against the projected colliders, tunnelling at 2.3× the fastest bullet, the deathbomb window in real time, threat lead times, every pattern preset dodged by the 150 ms reactive player, and the focus technique and skill gradient. `node tests/browser/movement-audit.mjs http://127.0.0.1:4402/` (with `node serve.mjs --port 4402`) repeats the pixel and input checks in Chrome.

## Browser QA interface and what changed for the root suite

```js
__game.newRun(42);                     // reproducible campaign
__game.step(1 / 60, input, { render: false });
__game.checkpoint(4);                  // start an unlocked sample (1..18; 4 = ALPHA)
__game.practice(18, 2, 'omicron');     // MUTATION LAB card (stage, card, boss type)
__game.restart(); __game.bomb(); __game.setDifficulty('easy'); __game.renderer();
__game.hitboxes(true);                 // dev overlay: every collider outlined (also ?hitboxes=1)
__game.probe('marker-solid');          // QA: draw one layer alone on black ('marker' | 'bullets' | 'graze', '-solid' = white solid masks)
__game.setState(patch);                // fixtures only; also boss (merged), enemyShots (normalised), emitters
__game.audit();                        // QA: { enemies: [{ collider, drawn, min }], faces: [{ offset, reach, silhouette }] } from the live scene
```

- **Personality (revision five):** `#boss-card` (name card, shown on a boss entrance) and `#boss-say` (speech bubble; classes `taunt`, `gloat`, `defeat`). A boss entrance is detected by the frame loop (a tray start clears the model's own `boss-enter`) and dispatched as a presentation-only `boss-intro` event to the UI, renderer and audio. The LAB REPORT and won screens appear 1.7 s after a main boss defeat; tests that drive `__game.step` directly are unaffected.

- **Input contract:** `{ axisX, axisZ, focus, bomb, targetX, targetZ, drag, confirm }`. `axisX/axisZ` are in [−1, 1] (+z is toward the player); `axis` is still accepted as `axisX`. `bomb` is edge-triggered (one SOAP per press). `targetX/targetZ` steer toward a board point (`drag: true` for touch speed). `confirm` (or the legacy `shoot` edge) releases the LAB REPORT. Fire is automatic, so `shoot` no longer fires.
- **Shield → SOAP:** `ship.shield`/`ship.shieldCooldown` are gone. Use `ship.bombs` (stock), `bombsUsed` and `soapRing`; Shift now holds focus (`ship.focus`).
- **Hits take the deathbomb window:** a hit sets `ship.dying` for 0.18 s before the vial is lost, so the last-vial fixture needs `step(0.25)` (not `0.03`) to reach `phase: 'lost'`. Its cause card reads "Hit by VIRUS droplet" for a bare fixture bullet.
- **Campaign:** 18 stages (was 13); `wave` and `unlockedStage` reach 18. The controller needs about 59–60k frames (seeds 42/1/7: 60,340 / 59,315 / 58,913); the budget stays `60 * 1800`.
- **Boss HUD:** stage 4 is now ALPHA (pool 1344: card HP = round(TTK × 24 × 0.7), so 302 + 370 + 370 + 302). `#boss-status` is shown and hidden with an `off` class (opacity, plus `aria-hidden`) instead of the `hidden` attribute, which avoids a style and layout pass at boss entry. Playwright's `isVisible()` treats opacity 0 as visible, so to assert that no boss is shown, check for the `off` class or `aria-hidden="true"`. `#boss-numeric` reads `hp / max` of the whole pool; `#boss-phase` reads `PHASE k/n · CARD NAME`, with k the card the pool has reached (so `setState({ boss: { hp: 23 } })` on ALPHA shows `PHASE 4/4 · COUGH COUGH` until the boss acts). `#boss-track` carries aria-valuenow/max.
- **Supplies:** kinds are `mrna`, `booster`, `mask`, `soap`, `vial`. A collected `booster` sets `ship.powerups.booster = 8` and `#powerups` reads BOOSTER (the old `rapid` kind no longer exists).
- **Selectors kept:** `#game`, `#play-button`, `#pause-button`, `#menu-button`, `[data-stage="N"]`, `#boss-status`, `#boss-label`, `#boss-numeric`, `#boss-phase`, `#boss-health`, `#boss-track`, `#boss-lag`, `#powerups`, `#touch-fire` (now the full-stage relative drag pad), `#graphics-error`, `#title-sound`, `#sound-button`. New: `#touch-bomb`, `#card-tape`, `#card-result`, `#r0`, `#graze`, `#soap`, `#power`, `#twist-tag`, `[data-practice]`, `[data-card]`, `#tray-tabs`, `#difficulty-button`, `#easy-button`, `#easy-start` (first-visit title offer), `#hint` (one-time R0 / CHAIN / Shift hints).
- **Hitboxes:** `RULES.shipRadius` is 0.2 u (was 0.16) and is exactly the drawn chamber marker; bullets carry `hit` (radius) and `half` (capsule half-length), and a fixture bullet given only `radius` is a circle. Collisions are swept from `px/pz` (the previous substep position) for bullets and the ship.
- **Mouse:** steering needs a held left button over the board; the mouse no longer holds focus (Shift only). Steering and the right-button SOAP follow the live button mask, so a release outside the page ends them. The loss screen ignores keyboard input for 1 s and key repeats; `#play-button` clicks are not locked.
- **Held keys:** Space or X already down when play starts, a retry begins or a pause ends must be released before it fires a SOAP; arrows, WASD and Shift held through a pause act at once. A SOAP press on the pause or loss screen or between samples is dropped; one made during hitstop fires when the freeze ends.
- **Fixed step:** the browser loop advances whole 1/120 s steps (`clock.mjs`). `__game.step(seconds)` is unchanged: it advances exactly `seconds`. `?smooth=1` forces the interpolated view used at 144/165 Hz.
- **Beams:** a SNEEZE JET lane telegraphs for 1.5 s (was 1.0 s).

## Known limits (honest scope)

- Tuning comes from the autopilot and the 150 ms reactive player, not from human playtests. Easy is implemented and unit-tested but not curve-measured.
- Faces, idle life and the new audio were measured on SwiftShader only (above). The SFX were designed and verified numerically (levels, onsets, clipping, variation), not yet auditioned by a human listener: `soundboard.html` is there for that. SwiftShader (software WebGL, 960×640) after the 3D art pass: title 60 fps, the 1-1 grid 55, a boss spiral 60, 4-3 OUTBREAK 60, the 600-bullet stress fixture 43 (was 19). Real gameplay peaks near 140 bullets. Starts are prewarmed (every shape compiled and rendered hidden at boot) and frame medians stay at 17 ms, but one 280–520 ms frame remains at the first sample start and at ALPHA/OMICRON entry on SwiftShader. A CPU profile shows the page's main thread idle during it (under 60 ms of script in 1.5 s), so it is in the software GPU or compositor process; it was not measured on a hardware GPU. Not checked on real phone GPUs, Safari, Firefox or physical touch devices.
- Card practice exists for boss and midboss cards; best captures are stored locally per card. Hard mode is not built.

## Provenance

The source reference is the user's original `src/js/coronaInvaders/` (a syringe, coronaviruses, three hearts); the two 16×16 sprites are transcribed into `ui.mjs` as SVG pixels. Everything in this folder was authored for the browser experiment: geometry, textures, UI, simulation and tests. Three.js is retained under its license.
