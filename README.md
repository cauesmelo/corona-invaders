# Corona Invaders 3D

A bullet hell of a vaccine syringe fighting coronaviruses, in a real Three.js perspective scene. It is derived from the original Corona Invaders in Canvas Retro Arcade: the green 16×16 corona sprite, the syringe and the 4×15 grid all come back, now as a 3D board you move across freely while every virus fires its own kind of bullet.

This is the **v1.0 campaign** (2026-11-10). The owner asked to review every level and build a suite that makes sense, to study bullet-hell technique, to shorten the syringe whose length made the hitbox confusing, and to give the game more personality. The decisions are [RESEARCH_V1.md](./RESEARCH_V1.md); the ADJUVANT card draft between stages is [RESEARCH_CARDS.md](./RESEARCH_CARDS.md) (built by a parallel squad). [LEVEL_DESIGN.md](./LEVEL_DESIGN.md) lists the sectors, the 12 stages, archetypes and every boss card; [BALANCE.md](./BALANCE.md) has the numbers and the measured evidence. Revision five's bullet-hell base is [RESEARCH_BULLET_HELL.md](./RESEARCH_BULLET_HELL.md).

## v1.0 in short

- **The short syringe:** 1.64 u (was 5.1 u), 37 px at 960×640, tilted 10°, wholly inside its 1.0 u graze ring, the 0.2 u glowing dose (the collider) at its centre. Focus ghosts the body to 35 % and draws a white edge inside the marker; unfocused grazes flash a 0.2 s arc of the ring; in the deathbomb window only the core flashes. The vaccine level in the barrel is **EXPOSURE**: grazes toward the next SOAP. Bullets over the body without a hit fell from 20.9 to 4.0 per minute on the same runs.
- **INJECT:** touching a virus with the needle tip cures it at once (×2 score, its bullets become antigen tokens); elites take 10 × stage HP. Reload 0.5 / 0.8 s, shown by the plunger and the tip glint. A cure deflates to grey.
- **The 12-stage suite:** AIRWAY ×40 → LUNGS ×400 (BREATH) → BLOODSTREAM ×4 000 (CURRENT) → THE CELL ×40 000 (MUTATION), two samples and a boss each, one new idea per stage in four beats. The choir sings RAIN (straight-down lanes) as well as aimed coughs; MUTATION turns a WILD TYPE into a HEAVY CROWN. Each sector has its own backdrop, light motion and arrangement of the original march.
- **The run:** 3 credits on Normal (unlimited on Easy); a continue restarts the stage from its entry; a boss restores one vial, a sample none; the 1CC stamp, LAB REPORTs, FIELD NOTES and the FINAL REPORT in a calm lab voice; ASSIST game speed 70–100 %.
- **Saves:** guarded, sanitised `corona-invaders-v6-*` keys (`save.mjs`), with a one-time migration from the owner's v5 (18-stage) and v4 saves.
- **Release 1.0.0:** `v1.0` under the title (DOM text), a CREDITS screen (title icon and the attract loop) for the original game by Cauê Melo, three.js (MIT), the synthesized sound and the march's nod to Space Invaders, [CHANGELOG.md](./CHANGELOG.md), and the itch.io decisions and page draft in [ITCH_IO.md](./ITCH_IO.md). The `v1.0.0` tag waits for the owner.
- **High-contrast bullets:** a near-black outline just outside each bullet's solid. The coloured capsule is still exactly the collider, and every sampled backdrop and enemy pixel now has a bullet layer at 3:1 or more (BALANCE.md "Readability").

## Run independently

```sh
npm run dev           # http://127.0.0.1:4175/
node serve.mjs --port 4200
npm test              # 240 tests
# dev tools (Chrome via ../common's Playwright):
#   soundboard.html                        audition and measure every SFX (npm run dev, then /soundboard.html)
#   node tests/browser/audio-measure.mjs [--before <git ref>]
#   node tests/browser/personality-audit.mjs [--root <other checkout>]
#   node tests/browser/draft-3d.mjs http://127.0.0.1:4436/ [--shots DIR] [--json FILE]   the 3D draft (D7/D8)
npm run build:itch    # dist/corona-invaders-itch.zip
```

Node 18 or later; nothing to install. Three.js r187 and its license live in `vendor/`. Serve over HTTP (module imports are blocked from `file:`). `index.html` is a plain green `#168546` page with only the game centred, at most 960×640; in an iframe or fullscreen the same game fills the surface. The itch ZIP holds 33 files (0.66 MiB; `soundboard.html` stays out): runtime modules (`.mjs` rewritten to `.js`), `vendor/` with three.js's licence, and the player docs only (README and CHANGELOG). No font, image, model or sound is downloaded at runtime.

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
- **Six bullet families**, shape first: sneeze droplets (teardrops), aerosol mist (decelerating dots), spike proteins (lollipops), RNA beads on a sine with their thread, shootable virions (the original 8-spike crown with a green ring) and mucus globs. Pink-violet with white cores, wrapped in a near-black outline just outside the solid, and drawn above everything.
- **Hitboxes are what you see** (`hitboxes.mjs`, one module shared by the simulation and the renderer). The player is only the glowing core. An enemy is its body sphere (or capsule for the BUDDER and RNA WORM); spikes are decoration for every interaction. A bullet is its solid body, dark rim included; the glow outside is light, not matter. Droplets and spike proteins are capsules along their travel. Collisions are swept over each 1/120 s substep, so nothing tunnels. Needles are thin segments, lane beams are their drawn rectangle, the SOAP ring is its drawn radius and supplies are caught by the barrel. `?hitboxes=1` or `__game.hitboxes(true)` draws every collider as an outline.
- **Twelve pattern presets** (COUGH, SNEEZE, SNIFFLE, CORONA RING, SPIKE BLOOM, DRIP, MUCUS WALL, AEROSOL, SNEEZE JET, RNA STRAND, REPLICATION, QUARANTINE BOX) with tested fairness limits.
- **Coronavirus-only roster in the run:** WILD TYPE (and the 60 mini coronas), SNEEZER, RNA WORM, AEROSOL PUFF, DROPLET, HEAVY CROWN (made by MUTATION), BLOOM and VESICLE. BUDDER, HIJACKER and INFECTED CELL are retired from the run (kept in code for v1.1). Nothing is shaped like a plane; a test checks the mesh registry.
- **Campaign: 12 stages in four sectors** (AIRWAY; LUNGS with BREATH; BLOODSTREAM with CURRENT; THE CELL with MUTATION), four midbosses and four variant bosses: **ALPHA, BETA & GAMMA, DELTA, OMICRON PRIME**, 25 named cards in all (19 on the variant bosses). WHO Greek letters only.
- **R0 meter** (3 × escaped ÷ spawned escapable viruses) with a clear bonus for R0 below 1; medals (gold = no vial lost and R0 < 1). R0, the Dose Chain and the Shift stronger-needle rule are each explained once in a short hint the first time they matter.
- **Specimen tray** with three tabs: SAMPLES (any unlocked sample), PRACTICE (any cleared sample, one vial, R restarts at once) and MUTATION LAB (any card already seen, ends when the card ends).
- **Easy / Normal** (title and pause): Easy has 5 vials, 3 SOAP, auto-SOAP on hit (so its 0.35 s deathbomb matters only with an empty stock), ×0.6 bullets, ×0.85 speed, +0.15 s telegraphs and 2.8 u wall gaps. The title offers **EASY START** on a first visit. After three failures the loss screen offers **+1 VIAL** (medal marked A) or **SWITCH TO EASY**, with Easy as the focused default. The loss screen ignores keys for 1 s and then needs a fresh press, so a held Space cannot retry by accident (clicks work at once).
- **Checkpoints and credits:** a boss clear restores one vial and shows the FIELD NOTE, which waits for a press; a sample clear restores none and shows a 2.5 s LAB REPORT. Losing the last vial spends a credit; CONTINUE restores the stage's entry score, power, build and RNG stream.

## Adjuvants: the draft between stages (v1.0, RESEARCH_CARDS.md)

The owner asked for a roguelike pick after every stage: three cards, keep one, each a modification of the syringe, about 30 of them in four tiers, with better odds after a boss. In the game they are **ADJUVANTS** (the substance added to a vaccine to strengthen it; "card" already means a boss card) and the screen is **FORMULATE**.

- **The run is the campaign.** A draft follows stages 1–11 (none after 4-3), boosted after ALPHA, BETA & GAMMA and DELTA. Builds survive deaths and continues (a continue restores the build the stage was entered with); a new run starts empty; there is no meta-power.
- **30 adjuvants** (`cards.mjs`): 10 common, 9 rare, 6 epic, 5 legendary in five lines (NEEDLE, ANTIBODY, DOSE, SOAP, GRAZE). The owner's examples are all there: CONCENTRATE (damage), RAPID RELEASE (cadence), TWIN BARREL (the double shot: +1 needle), SILICONE PLUNGER (speed), EXTRA DOSE (more vials), ENTERIC COATING (the shield that re-forms). Card 27 is RETRACTABLE NEEDLE because INJECT ships. Legendaries (JET INJECTOR, HERD IMMUNITY, LNP SHELL, AUTOCLAVE, INNATE RESPONSE) need two earlier picks in their line, and a run holds at most two. Every card's text is generated from its data.
- **Odds:** per-slot tier weights by **titer** (non-final bosses beaten: 70/25/5/0 → 60/28/10/2 → 50/31/15/4 → 42/32/20/6), and the boosted draft's first slot is always Epic or better with Legendary 12% + 16% × the share of that boss's cards NEUTRALIZED. Hidden pity (incubation) and a floor make two all-common offers in a row impossible. No dead offers: maxed cards, antibody cards without antibodies, REFLEX ARC / EPIPEN on Easy and speed cards for touch players are never shown. One trade-off at most, one offense card at least, three lines when possible. **RESAMPLE** tokens (1 at start, +1 per non-final boss, +1 more for a full sequence, at most 3) and **DISCARD** (+1 SOAP).
- **Guard-rails:** a potency limit that rises with titer (×1.5 / 1.8 / 2.0 / 2.15), per-stat caps (+70% damage, 10 volleys/s, 10.5–12.9 u/s, focus fixed at 5.0, vials base + 2, 6 SOAP, 4 antibodies), and enemy HP that follows the **expected** potency of a random drafter at each stage (`levels.stageDps`), never your own deck. Patterns never scale. **No adjuvant changes a collider**: the coating is an extra hit charge on the same 0.2 u core test, and JET INJECTOR's stream is the one new rectangle, drawn at exactly its 0.5 u width.
- **FORMULATE is a 3D scene (`draft3d.mjs`, 2026-11-10; RESEARCH_DIFFICULTY §6).** The owner found the flat slides generic and wants the game strongly 3D, so each offered adjuvant is a **vaccine cartridge**: a horizontal glass carpule that floats into the lab view over the frozen board (dimmed to 35%, desaturated 60%), turns slowly (yaw ±18°, a 0.03 u bob) and catches the board's own key, rim and fill lights while the key's azimuth sweeps ±10°. Picking one **loads it into the syringe**: it arcs into the barrel and seats with a click, the plunger pushes home and its serum colour runs into the barrel and the dose, the other two slide out, and the syringe flies down to where the board syringe stands as the veil lifts.
  - **Tier is material, not colour alone:** clear borosilicate (common), frosted glass with a noise bump (rare, plus a cyan anodised ring), cobalt glass with suspended motes (epic), and a gold crimp cap with a crown flip-off seal over glowing serum with a slow swirl and an amber lamp (legendary). The cap carries 1–4 turned grooves, and the label prints the tier word and ◆ pips. The **line** reads through the serum colour and what floats in it: a needle, a plunger tip, a Y antibody, a dashed graze ring, rising bubbles, or a sloshing dose (DOSE fills only 68% of the bore).
  - **Text is on the cartridge:** the paper label prints the NAME and one stat line (the card's own `stat`, and a trade-off's `costLabel` in pink) in the game's 5×7 dot-matrix face. The cartridges lie horizontally so a 16-character name gets a straight run at a ≥ 14 px cap height (≥ 11 px at 320×568); an upright carpule would bend it round its girth. The rack's top rail is etched with the stage cleared and the titer; its front rail holds the selected cartridge's effect sentence plus SYNERGY or COST. Nothing that shows card content is DOM: only the RESAMPLE / INJECT / DISCARD keys (machined, ≥ 48 px, a 72 px INJECT on phones) and the hidden `#formulate-live` region with the full text.
  - **Input (one scheme):** ←/→/↑/↓ or 1–3 select, Enter/Space injects, R resamples, S twice discards, Esc pauses; the mouse hovers to select and clicks the selected cartridge (or double-clicks) to inject; touch taps to select and taps again or INJECT. Every press waits 0.5 s and must be fresh; the first press during the reveal only completes it. A pick is applied to the model at once and play is held for its animation (≤ 1.0 s; any press after 0.36 s skips it).
  - **Reveal:** cartridges drop at 150 / 270 / 390 ms with a 6% overshoot and their tier sound on landing; rare glints cyan, epic motes wake, and a legendary falls in front while rolling 1.5 turns about its axis to the 0.5 s centrifuge riser, then settles label-forward with a gold bloom and a warm flash. RESAMPLE spins the three away and drops new ones; DISCARD tips them behind the syringe and a SOAP bubble rises. Reduced motion places everything at once and resumes play immediately.
  - **Performance:** the board is drawn once and copied with `copyFramebufferToTexture` (no render target, so no second set of board shader programs); every draft program, geometry and the PMREM environment are built at boot. 32 draw calls and about 7.3k triangles per frame, one point light, no shadows, no transmission, pixel ratio ≤ 1.25. Glass is `MeshStandardMaterial` and only reflective parts sample the environment (an interleaved A/B on SwiftShader measured about 23% and 20% less GPU time). If the first 30 frames' median exceeds 28 ms a LITE mode drops the reflections, motes, swirl and lamp (`__game.draft.scene().lite`).
- **HUD and saves:** the ADJUVANTS rack (small cartridges in the draft's materials, grouped by line with stack dots and cap grooves for the tier, legendaries on top with a gold cap and their name, POTENCY ×n / limit) under mRNA; pause and the final report list the formulation (PLACEBO GROUP for a run that discarded every draft). The run is saved under `corona-invaders-v6-run` (versioned, validated; a corrupt save hides RESUME RUN) at every stage entry, draft and resample. Practice and tray starts past 1-1 use STANDARD ISSUE, the reference syringe at the stage's expected potency.

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
- **Voices (bosses only).** Each boss has a formant voice (a sawtooth through three vowel band-passes with growl and breath) and growls its taunt, gloat and defeat lines as a low two-part call over a sub rumble. Regular viruses make organic sounds instead (a spike bristle before a shot, breaths into the sneeze, a wet dive whoosh, a petal shimmer). An earlier version of this pass gave every popcorn type a cartoon voice blip and had bosses babble; both were removed with the faces (see Villains).
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

## Villains with personality, in 3D (revision five)

Two rounds of feedback. First: "the theme is great but it reads generic; the villains need more personality". Then, after a pass with drawn faces: "regular viruses don't need little faces; bosses are fine as long as they have personality; make it more 3D, you are pulling the style toward cartoon again". So no villain has a drawn face, and there are no speech bubbles. Character comes from form, light and motion (`personality.mjs`):

| Character | Personality | How it shows |
| --- | --- | --- |
| WILD TYPE / mini choir | The grunt / sixty tiny fans | Bouncy breathing and spike twitches; the choir bobs and sways on the march beat |
| SNEEZER | The drama queen | Sniffles; on the wind-up it rears up and its separate crown bristles, then a recoil on the sneeze |
| BUDDER, RNA WORM, AEROSOL PUFF, DROPLET, HIJACKER, INFECTED CELL, HEAVY CROWN, BLOOM, VIRION, VESICLE | Show-off, sneak, airhead, daredevil, schemer, victim, brute, diva, coward, courier | Each has its own breathing rate and depth, sway, twitch and tilt rules (the brute breathes slowly and deeply, the coward twitches fast, the sneak never tilts, the victim wobbles) |
| ALPHA | The original: pompous, proud and still coughing | Two heavy-lidded glowing pits, a slow steady glow |
| BETA & GAMMA | The bickering twins | BETA: close-set, almost level pits, a dim bored glow; GAMMA: wide, angry-slanted pits with a hot, jittery glow |
| DELTA | The impatient speedster | Three pits in a triangle with a fast, jittery glow; its halves keep one each |
| OMICRON PRIME | The mutant king | Five mismatched pits; its spike nodes have one each |
| Midbosses | The allergy, the space cadet, the mother, the copycat | Droopy, dim, soft or mirrored pits |

- **Every virus:** breathing (a vertical swell), crown sway and spike twitches, anticipation before an attack, a flinch on every hit, a shiver below 35% HP, a smug bounce when the player loses a vial, and a 0.1 s inflate-and-pop on every kill.
- **Boss pits** (`shapes.mjs` `pits`): almond-shaped dark sockets sunk into the membrane, slanted per boss, each with a glowing slit core in the variant's green and a soft halo. The glow carries the mood (`bossMenace`): it rises from dark during the entrance, flares before every attack (the old "eyes narrow" cue, now light), pulses while taunting, flickers on hits and when nearly beaten, glares when the player loses a vial, and dies out during the defeat.
- **Bosses also have** a name card on entrance (role and one-liner, in the variant's colour), a squash as they land, taunts typed into the VIRAL LOAD panel at each card start and on a lost vial (inside the reserved top band, never over the board; it briefly covers the card tape row while the card name shows in the callout), the defeat line in the callout, and the defeat: a white shiver with small pops in time with the audio, then the burst. The LAB REPORT and victory screens wait 1.7 s for that payoff (UI only; presses during the delay are dropped, and a key held from the fight must be released first).
- **Materials, the "more 3D" pass:** every virus material gets an object-space membrane bump (two octaves of rounded proteins, so it works on merged geometry without UVs and turns with the body) and a fresnel rim, which lights the silhouette like a microscopy render. Membranes are glossier, and self-light is lower so the key, rim and specular light carry the form. Boss spheres are a lit mid-grey (not flat white) with larger proteins and denser geometry, and their club spikes take real shading. Popcorn keeps its light geometry so 60 viruses stay fast. Bullets are still drawn last with depth testing off, so they stay crisp over everything.
- **Sound to match:** regular viruses have no voices. Their wind-ups are a dry spike bristle and a membrane flex, the sneezer breathes in twice before its wet "CHOO", the droplet dives with a rising whoosh, and blooms unfurl with a glassy shimmer. Bosses growl each line as a low two-part formant call over a sub rumble, rising for a taunt and falling for a defeat, never babbling.

**Hitboxes are exactly as they were.** `tests/personality.test.mjs` snapshots every collider against its value before the personality work and checks that motion never draws a footprint wider than its collider (about 21,000 sampled states per character). It also checks that no shape has eyes, that regular viruses have no pits, and that every pit's reach (centre plus long semi-axis) stays under 90% of the body. In Chrome, `__game.audit()` measures the real matrices: drawn footprints stay at 91.4–100.0% of the collider, and boss pits reach at most 82–88% of it. The `?hitboxes=1` outlines still trace the body spheres.

**Frame time** (`tests/browser/personality-audit.mjs`, SwiftShader, 960×640, 5 s per scene, after this pass): title 52.2 fps, 1-1 choir 58.6, 1-3 60, ALPHA 57.6, BETA & GAMMA 60, OMICRON SPIKE CROWN 49.8, 4-3 54.4. Every median frame is 16.7 ms. The same scenes before any personality work (commit 061c348) ran at 53.6 / 58.8 / 60 / 60 / 60 / 46.4 / 53.4 fps. A trial with denser popcorn geometry dropped the choir to 38 fps, so popcorn keeps its old density.

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
| `model.mjs` | State, the kit, supplies, stage scripts, twists, checkpoints, practice, medals, the draft actions and run save/resume, `update()` |
| `cards.mjs` | The 30 adjuvants (data and generated text), `kitOf` with caps and the titer limit, potency, the seeded offer generator (odds, boss slot, pity, floor, eligibility), RESAMPLE/DISCARD, `EXPECTED_POTENCY`, the drafting bots |
| `syringe-kit.mjs` | Adjuvant behaviours in play: coating absorbs, the jet, split needles, innate needles, the aliquot, foam, autoclave |
| `draft3d.mjs` | FORMULATE in 3D: the cartridge scene on the game's renderer (lights, PMREM environment, tier materials, labels, rails, the draft syringe), its animations, hit-testing and QA view; pure label, layout and timing data for tests |
| `formulate.mjs` | The draft's DOM controls (RESAMPLE / INJECT / DISCARD), the owned-adjuvant rack's cartridge chips, the pause list and the 0.5 s fresh-press gate |
| `render-kit.mjs` | The jet stream, the coating glaze, the twin needle and the foam disc |
| `autopilot.mjs` | Ordinary-input 2D look-ahead player (attract demo and QA) |
| `shapes.mjs` | The mesh registry (every silhouette as data) and palette |
| `hitboxes.mjs` | Every collider and how it is drawn: bullet capsules, sprite layouts, swept tests, needle segments, beams, enemy body scale |
| `render.mjs` | Three.js scene, layered board, world backdrops, lit meshes from `shapes.mjs`, the detailed syringe, instanced bullet families, contact shadows, telegraphs, juice, the hitbox overlay, boot prewarm |
| `camera.mjs` | Fitted steep camera (pitch 64–74°, FOV 24–32°, depth ratio ≤ 1.35), reserved top band |
| `personality.mjs` | Villain characters: roles, one-liners, idle life and reactions (`bodyMotion`, footprint-normalised), the boss pits' mood (`bossMenace`), boss name cards and lines, the march tempo |
| `audio.mjs` | Synthesized SFX and voices, the master compressor and clipper, ducking, the march; `SFX_CATALOG` fixtures |
| `ui.mjs`, `game.js` | SVG instruments; input, screens, tray, persistence, the boss name card and HUD taunt line, and `window.__game` |
| `soundboard.html` | Dev tool: audition and measure every SFX and boss voice (not in the itch ZIP) |

The simulation imports neither the DOM nor Three.js. It advances in substeps of at most 1/120 s; one call advances at most 2 s.

## Validate

The 3D draft (2026-11-10) adds `tests/draft3d.test.mjs` to `npm test` (12 tests: every card's label name, stat and COST; every printable character has a dot-matrix glyph; captions fit the rail; the four tier looks are distinct and tier never rests on colour alone; the reveal and inject timings; label cap heights by projection at 960×640, 390×844 and 320×568; and the draw-call, triangle, light and per-cartridge budget counted from the real scene graph without a GPU). The browser half is `node tests/browser/draft-3d.mjs <url>` (RESEARCH_DIFFICULTY §8 D7/D8: no DOM card content, cartridges = the offer, legible labels, tier materials and a shading probe on real pixels, keyboard / mouse / touch picks, RESAMPLE, DISCARD, reduced motion, pause / resize / blur, and frame time, which it reports INCONCLUSIVE above load 4), and the root suite's Corona FORMULATE check now drives the 3D draft.

`npm test` also runs `tests/cards.test.mjs` (the adjuvant draft, RESEARCH_CARDS §8 tests 1–11, 13 and 14) and the adjuvant sound test; `npm run test:balance` runs test 12, whole runs of bots on the real model (see BALANCE.md "Adjuvants").

`npm test` runs 240 tests (2026-11-10, v1.0 release: 234 with the ADJUVANT draft, plus `tests/release.test.mjs` (the version, credits and itch decisions), the spray-potency diagnostic and two bullet-contrast tests). The v1.0 campaign adds `tests/suite.test.mjs` (T1–T5 and T7 on the 8-seed `tests/suite-audit.mjs`: structure, one new idea per stage on a real run, the near and peak sawtooth, speed and mix bands, rhythm, FAIR-150 with no forced hit and a 0.6 s lead, run length and the 11 drafts, phantom overlaps; misses held in `KNOWN_GAPS`), `tests/syringe.test.mjs` (T7, T11), `tests/inject.test.mjs` (T8, including a sweep of every boss card and 30/60/120/240 Hz identity), `tests/run.test.mjs` (T12 credits, continues, 1CC, vials, practice, ASSIST), `tests/save.test.mjs` (guarded saves and the v5/v4 migrations) and `tests/voice.test.mjs` (T14). `node tests/suite-audit.mjs [seeds]` prints the audit table. Revision five's suites, re-baselined to 12 stages: player kit 15, pattern fairness 10, bosses 17, archetypes 14, campaign/model 20, difficulty curve 7, camera 11, theme 8, hitboxes 7, movement audit 18, audio 10, personality 7. They cover every collider against its drawn sprite or mesh (bullets per family, enemy and boss bodies, the syringe core), capsule and swept collisions with no tunnelling, exact edges for needles, beams, contact, supplies and SOAP, every boss card's TTK under 80% of its timeout at 75% of the reference DPS, the reactive player ending cards by damage, hitbox vs graze radii, focus speed, SOAP and deathbomb, death and respawn, spawn exclusion, every authored parameter inside its preset LIMITS, clear gaps, wall gaps, aerosol density, the overlap gate measured on a live campaign, telegraph minimums, card HP/timeouts/captures, boss speed caps, every gimmick, every card (LAMBDA MIRROR included) dodgeable by a 150 ms reactive player without SOAP, the rising world curve, determinism, checkpoints, practice, supplies, R0, medals, extends, the controller winning the campaign for seeds 42, 1 and 7, and the no-aircraft mesh registry with distinct boss silhouettes. The audio tests run the engine on a recording fake AudioContext (every catalogued sound builds and stops its graph, the limited master, auto-fire 15+ dB under a kill with a 4 ms attack, variation, rising streaks, panning, ducking, the voice cap, pause, a distinct growl per boss, no voiced sound from regular viruses, boss lines growled rather than babbled). The personality tests cover the collider snapshot, footprints, no drawn faces, boss pits inside the body, the pits' moods, distinct characters, 3D reactions, boss scripts, and that the simulation never imports presentation. Results are in BALANCE.md.

The movement audit (`tests/movement-audit.test.mjs`, results and reasons in [MOVEMENT_AUDIT.md](./MOVEMENT_AUDIT.md)) measures the shared movement rubric: input acting on the step of the press, identical simulations at 30/60/120/240 Hz and through hitches, presses across pause, hitstop, sample ends and retries, crossing times, edges, the marker and graze ring against the projected colliders, tunnelling at 2.3× the fastest bullet, the deathbomb window in real time, threat lead times, every pattern preset dodged by the 150 ms reactive player, and the focus technique and skill gradient. `node tests/browser/movement-audit.mjs http://127.0.0.1:4402/` (with `node serve.mjs --port 4402`) repeats the pixel and input checks in Chrome.

## Browser QA interface and what changed for the root suite

```js
__game.newRun(42);                     // reproducible campaign
__game.step(1 / 60, input, { render: false });
__game.levels();                       // the run's stage list [{ id, code, kind, boss, world, music, zoom }]
__game.checkpoint(3);                  // start an unlocked stage (1..12; 3 = ALPHA)
__game.practice(12, 2, 'omicron');     // MUTATION LAB card (stage, card, boss type)
__game.speed(0.8);                     // ASSIST game speed (1, 0.9, 0.8, 0.7)
__game.draft.pick(0);                  // resolve an open ADJUVANT draft at once (phase 'draft'; no animation)
__game.draft.scene();                  // the 3D draft: cartridges (id, tier, label, screen rect, label cap px, materials), lite, calls
__game.draft.probe();                  // render now and measure each cartridge's pixels (shading probe, mean colour)
__game.draft.bench(40); __game.draft.benchBoard(40);   // GPU ms per frame (render + a 1-pixel read), draft vs board
__game.draft.lite(false);              // LITE on/off by hand (stops the automatic switch)
__game.restart(); __game.bomb(); __game.setDifficulty('easy'); __game.renderer();
__game.hitboxes(true);                 // dev overlay: every collider outlined (also ?hitboxes=1)
__game.probe('marker-solid');          // QA: draw one layer alone on black ('marker' | 'bullets' | 'graze', '-solid' = white solid masks)
__game.setState(patch);                // fixtures only; also boss (merged), enemyShots (normalised), emitters
__game.audit();                        // QA: { enemies: [{ collider, drawn, min }], pits: [{ reach, collider }] } from the live scene
```

- **Personality (revision five):** `#boss-card` (name card, shown on a boss entrance) and `#boss-taunt` (the taunt line inside `#card-tape`; classes `taunt`, `gloat`). There is no speech bubble. A boss entrance is detected by the frame loop (a tray start clears the model's own `boss-enter`) and dispatched as a presentation-only `boss-intro` event to the UI, renderer and audio. The LAB REPORT and won screens appear 1.7 s after a main boss defeat; tests that drive `__game.step` directly are unaffected.

- **Input contract:** `{ axisX, axisZ, focus, bomb, targetX, targetZ, drag, confirm }`. `axisX/axisZ` are in [−1, 1] (+z is toward the player); `axis` is still accepted as `axisX`. `bomb` is edge-triggered (one SOAP per press). `targetX/targetZ` steer toward a board point (`drag: true` for touch speed). `confirm` (or the legacy `shoot` edge) releases the LAB REPORT. Fire is automatic, so `shoot` no longer fires.
- **Shield → SOAP:** `ship.shield`/`ship.shieldCooldown` are gone. Use `ship.bombs` (stock), `bombsUsed` and `soapRing`; Shift now holds focus (`ship.focus`).
- **Hits take the deathbomb window:** a hit sets `ship.dying` for 0.18 s before the vial is lost, so the last-vial fixture needs `step(0.25)` (not `0.03`) to reach `phase: 'lost'`. Its cause card reads "Hit by VIRUS droplet" for a bare fixture bullet.
- **Campaign (v1.0):** 12 stages, read from `__game.levels()`; `wave` and `unlockedStage` reach 12. The browser game runs with drafts on, so a playthrough resolves each `phase: 'draft'` with `__game.draft.pick(0)`. `renderer().syringe` reports the drawn syringe (`lengthPx`, `tipErrorPx` of the INJECT collider, `bodyOpacity`, `ghost`, `exposure`, `glint`, `markerVisible`).
- **Credits:** `R` / RESTART STAGE spends a credit mid-stage; with none left it is refused and the loss screen is the FINAL REPORT (`state.runOver`, `state.finalReport`). A last-vial fixture should start from `newRun()` so no adjuvant absorbs the hit.
- **Boss HUD:** stage 4 is now ALPHA (pool 1344: card HP = round(TTK × 24 × 0.7), so 302 + 370 + 370 + 302). `#boss-status` is shown and hidden with an `off` class (opacity, plus `aria-hidden`) instead of the `hidden` attribute, which avoids a style and layout pass at boss entry. Playwright's `isVisible()` treats opacity 0 as visible, so to assert that no boss is shown, check for the `off` class or `aria-hidden="true"`. `#boss-numeric` reads `hp / max` of the whole pool; `#boss-phase` reads `PHASE k/n · CARD NAME`, with k the card the pool has reached (so `setState({ boss: { hp: 23 } })` on ALPHA shows `PHASE 4/4 · COUGH COUGH` until the boss acts). `#boss-track` carries aria-valuenow/max.
- **Supplies:** kinds are `mrna`, `booster`, `mask`, `soap`, `vial`. A collected `booster` sets `ship.powerups.booster = 8` and `#powerups` reads BOOSTER (the old `rapid` kind no longer exists).
- **Selectors kept:** `#game`, `#play-button`, `#pause-button`, `#menu-button`, `[data-stage="N"]`, `#boss-status`, `#boss-label`, `#boss-numeric`, `#boss-phase`, `#boss-health`, `#boss-track`, `#boss-lag`, `#powerups`, `#touch-fire` (now the full-stage relative drag pad), `#graphics-error`, `#title-sound`, `#sound-button`. New: `#touch-bomb`, `#card-tape`, `#card-result`, `#r0`, `#graze`, `#soap`, `#power`, `#twist-tag`, `[data-practice]`, `[data-card]`, `#tray-tabs`, `#difficulty-button`, `#easy-button`, `#easy-start` (first-visit title offer), `#hint` (one-time R0 / CHAIN / Shift hints).
- **Hitboxes:** `RULES.shipRadius` is 0.2 u (was 0.16) and is exactly the drawn chamber marker; bullets carry `hit` (radius) and `half` (capsule half-length), and a fixture bullet given only `radius` is a circle. Collisions are swept from `px/pz` (the previous substep position) for bullets and the ship.
- **Mouse:** steering needs a held left button over the board; the mouse no longer holds focus (Shift only). Steering and the right-button SOAP follow the live button mask, so a release outside the page ends them. The loss screen ignores keyboard input for 1 s and key repeats; `#play-button` clicks are not locked.
- **Held keys:** Space or X already down when play starts, a retry begins or a pause ends must be released before it fires a SOAP; arrows, WASD and Shift held through a pause act at once. A SOAP press on the pause or loss screen or between samples is dropped; one made during hitstop fires when the freeze ends.
- **Fixed step:** the browser loop advances whole 1/120 s steps (`clock.mjs`). `__game.step(seconds)` is unchanged: it advances exactly `seconds`. `?smooth=1` forces the interpolated view used at 144/165 Hz.
- **Beams:** a SNEEZE JET lane telegraphs for 1.5 s (was 1.0 s).

## Known limits (honest scope)

- **3D draft (2026-11-10):** its frame time has not been judged on an idle machine. Every run of the session was at load 27–60 on 14 cores, where `tests/browser/draft-3d.mjs` reports D8 INCONCLUSIVE. At load about 30 it measured a draft rAF median of 16.7 ms and p95 33.4 ms (with LITE switched on by the 28 ms rule), against a board at 1-1 of 50.1 / 199.9 ms in the same window. The first open took 50 ms, and the inject p95 was 33.4 ms. GPU time at full quality (a render plus a pixel read) was 26.0 ms for the draft vs 15.3 ms for the board. The budget of 32 calls and 7.3k triangles holds. A physical phone is still owed. Deviations from RESEARCH_DIFFICULTY §6, with reasons:
  - horizontal stacked cartridges rather than upright ones on an arc;
  - no portrait carousel (all three fit);
  - a size test of ≥ 300×72 px plus label cap heights, rather than ≥ 90 px tall;
  - standard glass rather than clearcoat;
  - a 1.0 s inject rather than 1.1 s.

  Not built: the LAB REPORT camera ease into a lab view (the draft opens over the held board), and dragging a cartridge onto the syringe.

- Tuning comes from the autopilot and the 150 ms reactive player, not from human playtests. Easy is implemented and unit-tested but not curve-measured.
- Faces, idle life and the new audio were measured on SwiftShader only (above). The SFX were designed and verified numerically (levels, onsets, clipping, variation), not yet auditioned by a human listener: `soundboard.html` is there for that. SwiftShader (software WebGL, 960×640) after the 3D art pass: title 60 fps, the 1-1 grid 55, a boss spiral 60, 4-3 OUTBREAK 60, the 600-bullet stress fixture 43 (was 19). Real gameplay peaks near 140 bullets. Starts are prewarmed (every shape compiled and rendered hidden at boot) and frame medians stay at 17 ms, but one 280–520 ms frame remains at the first sample start and at ALPHA/OMICRON entry on SwiftShader. A CPU profile shows the page's main thread idle during it (under 60 ms of script in 1.5 s), so it is in the software GPU or compositor process; it was not measured on a hardware GPU. Not checked on real phone GPUs, Safari, Firefox or physical touch devices.
- Card practice exists for boss and midboss cards; best captures are stored locally per card. Hard mode is not built.
- **v1.0 suite gaps (measured, see BALANCE.md):** three stage lengths, three hit ceilings, four rest gaps and BETA & GAMMA's mix and quiet share miss the brief's table; the brief's absolute near and peak targets are not met although the sawtooth shape holds. The new sector music arrangements and the INJECT sound were built and smoke-tested in the browser but have not been audited numerically (`tests/browser/audio-measure.mjs`) or by ear. High-contrast bullets are built. Speed trails were not added, because the capsule's long axis and leading core already show direction. Attract mode still demos 1-1. Choir volleys quantised to the beat are not built. The `KNOWN_GAPS` tuning and the no-SOAP card-balance misses (2b, 4a, 4b) were set aside on 2026-11-10 for the lead game designer's difficulty and progression brief. Frame times on SwiftShader are load-sensitive: under a load average near 40 the same scene measured 16.7–50 ms on both the v1.0 and the pre-v1.0 build.

## Provenance

The source reference is the user's original `src/js/coronaInvaders/` (a syringe, coronaviruses, three hearts); the two 16×16 sprites are transcribed into `ui.mjs` as SVG pixels. Everything in this folder was authored for the browser experiment: geometry, textures, UI, simulation and tests. Three.js is retained under its license.
