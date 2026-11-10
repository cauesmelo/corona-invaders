# Corona Invaders: movement and collision audit

Yardstick: `common/docs/MOVEMENT_CRITERIA.md`, sections A, C, D, E and F (Corona Invaders). Section B covers platformers and does not apply: the syringe has no gravity, jump or air control. Audited on 2026-11-10 against `main` at 2425425 ("before") and after the fixes listed below.

Evidence comes from three places:

- **`tests/movement-audit.test.mjs`**, part of `npm test`. It uses the pure model with ordinary inputs; fixtures only place things.
- **`tests/browser/movement-audit.mjs`**, run against `node serve.mjs --port 4402`. It drives real Chrome (Playwright `channel: 'chrome'`, SwiftShader WebGL) with CDP-dispatched (trusted) keys, mouse and touch. It also measures pixels through `__game.probe(layer + '-solid')`, which draws one layer alone on black, with white masks of the solid regions, through the production quads, at device pixel ratio 2.
- **The same browser script run against the pre-audit build** (2425425, served from a scratch copy), which gives the "before" browser numbers.

Statuses follow the rubric. **PASS** means inside the target. **WARN** means within 25 % of the target, or a reasoned exception. **FAIL** means anything else.

## Scorecard

| # | Criterion | Before | After | Target | Status (before → after) | Evidence |
|---|---|---|---|---|---|---|
| A1 | Input → state, model | Move, stop and reversal act on the step of the press. Focus ramped over 60 ms: the first 60 ms of focus covered 0.47 u instead of 0.30 u | Every action acts on the press step: move, stop, reverse, focus, pointer, drag, SOAP | Same step | WARN → **PASS** | `A1: keyboard move, stop and focus…` |
| A1 | Input → screen, browser | 1 frame for key → move, Shift → focus and keyup → stop. Measured focus speed 5.08 u/s (the ramp) | 1 / 1 / 1 frame; 11.500 u/s and 5.000 u/s | ≤ 1 rendered frame | PASS → **PASS** | browser `a1` |
| A2 | Frame-rate independence | Bit-identical at 30/60/120 Hz only. At 240 Hz the syringe was 0.06–0.33 u off and bullets up to 1.27 u off, with a different score (2010 vs 2810). With hitches: 0.40 u | Bit-identical traces, bullets and scores at 30/60/120/240 Hz, through 0–100 ms hitches and through off-grid hitches | ±0.01 u, same outcome | FAIL → **PASS** | `A2: …30/60/120/240 Hz…`, `A2: arbitrary (off-grid) hitches…`, `A2 pacing` |
| A3 | Lost / phantom inputs | Seven defects (listed under Fixes) | None found; every edge case is honoured or follows a documented rule | Honoured or a documented rule; no double fires | FAIL → **PASS** | `A3: …` (3 tests); browser `pauseResume`, `heldThroughPause`, `titleStart`, `retry`, `mouse`, `touch` |
| A4 | Determinism | Identical hashes | Identical hashes | Bit-identical | PASS → **PASS** | `A4: same seed and inputs…` |
| F | Board crossing, full speed | 1.55 s (17.8 u at 11.5 u/s) | 1.55 s | 0.8–1.3 s | WARN → **WARN** (kept, see below) | `F speeds…` |
| F | Crossing in focus; focus ratio | 3.56 s; 0.43 | 3.56 s; 0.43 | Ratio 35–50 % | PASS → **PASS** | `F speeds…` |
| — | Acceleration / deceleration | Instant start and stop; 60 ms focus ramp | Instant everywhere | Best for precise dodging | WARN → **PASS** | `A1…` |
| — | Diagonals | Normalised; partial axes keep their magnitude | Same | Never faster than straight | PASS → **PASS** | `F speeds…` |
| — | Edge clamping | Keyboard, mouse and touch stopped at the same edges. A cursor beyond an edge slid along it at 6.7 u/s instead of 11.5 u/s. Touch drag banked travel past an edge (a 2 u move back did nothing after a 5 u overshoot) | One rectangle (`playBounds`, which includes QUARANTINE) for every input. Out-of-box targets are clamped first, so the syringe slides at full speed. Drag comes back 2.04 u at once | Consistent | FAIL → **PASS** | `edge clamping…`; browser `touch` |
| C1/F | Drawn core marker vs collider | Drawn on a plane 0.02 u above the collider (0.20 px centre offset, size within 0.003 px) | Same plane. In Chrome, the marker equals the collider within one device pixel in all 12 cases. Lit area / projected area 0.95–1.04 | Exactly equal | PASS → **PASS** | `C1/F hitbox…`; browser `marker` |
| C2/F | Bullet solid vs collider (6 families × 3 depths × 3 windows) | (sizes fixed by `hitboxes.mjs`; no pixel test existed) | Width and length equal the projected capsule within one device pixel. Area ratio 0.92–1.09 (3–6 px sprites, so pixel quantisation) | Collider at or under the visible core | — → **PASS** | `tests/hitboxes.test.mjs`; browser `bullets` |
| C3 | Tunnelling | Swept test (one case at 120 u/s) | 2,400 random swept cases at 25 u/s (2.3× the fastest bullet, exhale included) with the core moving at the 30 u/s touch cap: 0 missed, 0 false hits | None | PASS → **PASS** | `C3 swept collision…` |
| C4 | Contact rules | Bullet solids, beams and enemy bodies kill. Spikes are decoration. QUARANTINE walls only confine | Same | Consistent and visible | PASS → **PASS** | `tests/hitboxes.test.mjs` |
| F | Graze ring drawn vs radius | Outer edge = 1.0 u. It faded in over ~70 ms (8 % opacity on the press frame) | Outer edge 44.00 / 36.50 / 26.25 px drawn vs 44.02 / 36.49 / 26.30 px projected. Full strength on the press frame | Drawn, equal | WARN → **PASS** | `E/F graze…`; browser `graze` |
| F | Deathbomb window | 0.18 s, but a press during hitstop was dropped | 0.18 s of real time at 30/60/120/240 Hz: exactly the presses that start inside the window save | Documented | WARN → **PASS** | `F deathbomb…`, `A3: …hitstop…` |
| F | Fairness, 150 ms reactive player, no SOAP | 25 cards (`curve.test.mjs`) | Plus every preset at its harshest authored use, 5 starts, 16 s each: 11 presets take 0 hits. QUARANTINE 0 1 1 0 1. RNA STRAND 0 when the player reads the drawn thread (naive player 2 2 1 1 0) | Dodgeable | PASS → **PASS** | `F fairness…` |
| F | Mouse / touch never take over | Hover never steered. A button released outside the page kept steering (the syringe followed a hovering cursor) and held the SOAP edge down, which swallowed Space | Hover 0 u; keys always win; a lost release stops steering and Space still fires | Never unintentionally | FAIL → **PASS** | browser `mouse` |
| D1 | Optional techniques | Focus NEEDLE stream, graze → SOAP, deathbomb, catch-back of the dropped mRNA strand | Focus deals ×1.00 / ×1.34 / ×2.01 damage on one target at power 1 / 2 / 4 | ≥ 2 that change outcomes | PASS → **PASS** | `D1…`; `tests/player.test.mjs` |
| D2 | Skill gradient | not measured | Holding focus while lined up clears the four boss samples 14.7 % faster (1059 s → 903 s, seeds 42/1/7). The baseline still clears all 12 | ≥ 15 % | — → **WARN** | `D2…` |
| D3 | Recovery | Deathbomb, 4 s strand catch-back, 0.5 s glide plus 2.5 s invulnerability, SOAP refilled to 2 | Same | Readable recovery | PASS → **PASS** | `tests/player.test.mjs` |
| E1 | Feedback; juice never hides | SOAP: ring and sound on the frame. Focus: a slow ring fade and no sound. The landscape hint (90 % opaque) sat over the board just above the syringe, and surge and card callouts were 86–92 % opaque over the board | Focus: ring and a soft tick on the press frame. The hint moved into the left panel foot (portrait already used the thumb zone). Callouts are 45 % translucent. The marker and bullets draw above every effect (render order 54–80 vs 0) | Same frame; never hidden | FAIL → **PASS** | `A1…` (focus event); screenshots in the browser script |
| E2 | Resources on the character | Focus: ring, tucked antibodies, parallel needles. Power: antibody count. Invulnerability: flicker. SOAP stock: HUD and touch button only | Same | On the character | WARN → **WARN** (reasoned) | — |
| E3 | Threat lead | Lane beams 1.0 s (a beam is instant once live). Bullets ≥ 2.08 s | Beams 1.5 s. Bullets ≥ 2.08 s from the formation front. Live play (reactive player, 18 samples × 2 seeds): every near pass ≥ 1.72 s, p5 2.15 s | ≥ 1.5 s | FAIL → **PASS** | `E3…`, `tests/patterns.test.mjs` |

**Totals (24 rows).** Before: 10 PASS, 6 WARN, 6 FAIL, 2 not measured. After: 21 PASS, 3 WARN, 0 FAIL.

## Fixes

1. **Instant focus** (`core.mjs`, `model.mjs`). The 60 ms speed blend is gone. Pressing Shift mid-dodge used to carry the syringe 0.47 u in the first 60 ms instead of 0.30 u, nearly one core radius of overshoot exactly when the player slows down to thread a gap. The blend also made positions depend on the substep size.
2. **Fixed 1/120 s grid in the browser** (`clock.mjs`, `game.js`). Each frame used to be split into equal substeps of at most 1/120 s, so a 240 Hz display or a hitch ran a different simulation. Now the browser runs exactly the tested simulation at every refresh rate:
   - The clock releases only whole steps.
   - Frames within 0.5 ms of a whole number of half steps are snapped, so 60 Hz jitter never stutters 1-3-2.
   - At rates the grid divides (30/60/120/240 Hz), the latest step is drawn with no added delay.
   - At other rates (144, 165 Hz) every entity is interpolated between the last two steps. That costs at most 8.3 ms of display delay, with everything delayed alike.
   - `?smooth=1` forces the interpolated path for QA.
3. **SOAP presses never leak** (`model.mjs`):
   - A press on the pause or loss screen is dropped instead of firing on resume.
   - A press during hitstop is buffered until the freeze ends, which also keeps deathbombs working through a card-break freeze.
   - A press between samples never fires in the next sample, even when the transition ends inside the same call.
4. **Held-key rules** (`game.js`):
   - Held keys are tracked on every screen.
   - Space and X that are already down when play starts, a retry begins or a pause ends must be released first. In the browser, the old build fired a SOAP through key repeat in all three cases.
   - Arrows, WASD and Shift held through a pause act on the first frame after it. The old build ignored them until OS key repeat.
5. **Pointer rules** (`game.js`):
   - Steering and the right-button SOAP follow the live `buttons` mask, so a release outside the page cannot leave the syringe following the cursor or swallow Space.
   - Touch drag moves its target incrementally and clamps it to the playable rectangle, so travel past an edge is never banked.
   - During the respawn glide the drag target follows the syringe, so control never zips back to where the hit happened.
6. **Edge slide** (`model.mjs` `playBounds`). Mouse and drag targets are clamped into the box (or the QUARANTINE) before the move, so a cursor beyond an edge slides the syringe at full speed.
7. **Beam telegraph 1.5 s** (`patterns.mjs` LIMITS). It was the only threat shown less than 1.5 s ahead.
8. **Readability** (`render.mjs`, `style.css`, `audio.mjs`):
   - The core marker and graze ring now take their geometry from `hitboxes.mjs` (`MARKER`, `GRAZE_RING`) and lie on the collision plane.
   - The focus ring appears on the press frame, with a soft tick.
   - Text overlays no longer cover live bullets near the syringe.
9. **Measurement hook** (`render.mjs`, `game.js`). `__game.probe('marker' | 'bullets' | 'graze' [+ '-solid'])` is QA-only, like `hitboxes(true)`.

## Remaining WARNs and why they ship

- **Crossing time 1.55 s (target 0.8–1.3 s).** Tried at 14 u/s (1.27 s), with every other rule as shipped, the 150 ms reactive player lost 2–4× more vials in every world: per sample, W1 went from 0.16 to 0.66, W2 0.19 → 0.50, W3 0.22 → 0.91 and W4 0.69 → 1.38. Each committed 100 ms correction overshot by 1.4 u instead of 1.15 u, and the world curve test broke (W2 measured easier than W1). The box is wide (17.8 u, 60 % of a tall board), so a full crossing is long while the dodges themselves are short: a 1 u sidestep takes 87 ms. The speed stays 11.5 u/s. The audit test fails if it drifts beyond the 25 % WARN margin (1.625 s).
- **D2 skill gradient 14.7 % (target 15 %).** The expert model is crude: it holds focus only while it is not moving. A human expert also positions under weak points and grazes. Reaching 15 % would mean buffing focus damage, which is a balance change outside this audit.
- **E2 SOAP stock on the syringe.** Focus, power and invulnerability already read on the character. The stock lives in the SOAP meter (side panel or top strip) and on the 72 px touch button, the genre convention. Bubble pips next to the 0.2 u core would compete with the bullets the player is reading there.

## Other findings

- **Easy's 0.35 s deathbomb is effectively unreachable.** Easy auto-SOAPs any hit while stock remains, so the window only opens with an empty stock. A SOAP can then arrive only through the graze bonus. This is harmless, since Easy players are protected anyway, but the README number describes a window players will rarely see.
- **The world curve's vial margins are now thin.** Instant focus and the longer beam warning changed the reactive player's trajectories. World means of vials lost per sample went from 0.03 / 0.25 / 0.56 / 0.84 to 0.16 / 0.19 / 0.22 / 0.69. The curve test still passes (both vials and pressure rise W1 < W2 < W3 < W4, and W4 ≥ 1.8× W1), but the W1 → W2 → W3 vial steps are only 0.03 each. Pressure near the core rises clearly (0.55 → 0.77 → 0.91 → 1.21). BALANCE.md has the refreshed tables.
- **SwiftShader limits the browser timing data.** Headless SwiftShader rendered 0.46–0.56 s of simulation per real second, because frames over 50 ms advance only 50 ms by design. The browser timings are therefore counted in frames, not milliseconds. Frame pacing at real refresh rates is covered by the `A2 pacing` test, not by the browser.
- **Re-checked after the sound and personality pass (2026-11-10).** The scorecard is unchanged: 21 PASS / 3 WARN / 0 FAIL. `tests/movement-audit.test.mjs` passes 18/18 and the browser audit still measures the core marker and every bullet family within a pixel of the projected colliders, with 1-frame key, focus and stop latency. Personality moves no collider (README "Villains with personality"). One new input rule follows A3: the LAB REPORT now appears 1.7 s after a main boss defeat; SOAP presses during that delay are dropped and a key held from the fight must be released before it can release the report.
- **No hardware checks yet.** Nothing here was checked on a hardware GPU, a high-refresh display, Safari, Firefox or a physical touch device.

## Reproduce

```sh
npm test                                   # includes tests/movement-audit.test.mjs
node serve.mjs --port 4402 &
node tests/browser/movement-audit.mjs http://127.0.0.1:4402/
```
