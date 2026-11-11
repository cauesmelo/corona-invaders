# Corona Invaders 3D on itch.io

## The build

This project exports on its own. Run `npm run build:itch` here and upload `dist/corona-invaders-itch.zip` as an HTML game on its own itch.io page. There is no shared launcher or server runtime in the ZIP.

- **Contents (v1.0, 2026-11-10):** 32 files, 2.70 MiB unpacked, 0.63 MiB zipped. That is the root `index.html`, the runtime modules (`.mjs` rewritten to `.js`), `style.css`, `embed.css`, `vendor/` (three.js r187 and `THREE-LICENSE.txt`), and the player docs only: `README.md` and `CHANGELOG.md` (`package-itch.mjs` `rootFile`). The design briefs, balance and audit notes stay in the repository. `soundboard.html`, tests, servers and build tools are left out.
- **No downloads at runtime:** all lettering is generated SVG and all audio is synthesized, so the game loads no font, image or audio file and nothing from a CDN. `dist/build-report.json` lists every file with its hash.
- **Standalone and embedded:** `index.html` is a plain green page with only the game centred. In an iframe or fullscreen, the same game fills the surface with its HUD and controls inside it. `index.html?embed=1` shows the embedded layout directly.
- **Requirements:** WebGL2, with a visible message when it is missing. No account, API key, backend or cross-origin isolation is needed. Sound starts on the player's first input.
- **Storage:** saves use game-prefixed, versioned keys (`corona-invaders-v6-*`, `save.mjs`). Every read and write is guarded, so with storage blocked (itch's third-party iframe storage, private windows) the game still boots, plays and keeps progress for the visit.

## Embed settings (`itch.json`, decided for v1.0)

| Setting | Value | Why |
| --- | --- | --- |
| Viewport | 960 × 640 | The game surface: the side-panel cabinet. The same game fills any size. |
| Fullscreen button | on | |
| Click to play | on | Audio starts on a user gesture anyway, and the first click focuses the canvas. |
| Orientation | portrait | Measured in an emulated phone (Chrome, touch, DPR 3). In portrait (390 × 844) the board gets 374 × 768 px and the syringe is 30.2 px long. In landscape (844 × 390) the side panels leave a board about 260 px wide, the syringe shrinks to 19.6 px, and the SOAP button overlaps the right panel. Screenshots are in `common/artifacts/ci-v1-release/phone-*.png`. |
| Mobile friendly | **off** | Touch worked end to end in the emulated phone: tap to start, drag anywhere to move (1:1), the SOAP button, pause and resume, and FORMULATE select plus INJECT, with no console errors at 390 × 844, 844 × 390 and 320 × 568. That is still emulation, not a phone. The owner decides after one physical-phone run; then flip `mobileFriendly` to true and keep portrait. |

Leave SharedArrayBuffer off. Test the uploaded draft (Restricted) before publishing. Rebuild the ZIP after every edit, because editing source does not update an uploaded archive.

## Page copy (DRAFT for the owner to approve)

Nothing here is uploaded. The owner edits and approves it.

- **Title:** Corona Invaders 3D
- **Short description (tagline):** A short vaccine syringe against the coronavirus, in a 3D bullet hell.
- **Genre:** Shooter
- **Tags (10):** bullet-hell, shoot-em-up, 3d, arcade, roguelite, deck-building, virus, browser, singleplayer, short
- **Pitch:**

  > Under the lab's microscope, one vaccine syringe goes in after the coronavirus. Fly it through four sectors of the body: the AIRWAY, the LUNGS (bullets slow on the inhale and rush on the exhale), the BLOODSTREAM (a current carries every shot) and THE CELL (viruses mutate as you watch). Face ALPHA, BETA & GAMMA, DELTA and OMICRON PRIME.
  >
  > Only the glowing dose in the barrel can be hit. Graze bullets to fill it toward your next SOAP, and touch a virus with the needle to cure it on the spot. After each stage, formulate your syringe: pick one of three ADJUVANTS, from a twin barrel to a coating that absorbs a hit. Three credits get you through the run. One credit earns the stamp.
  >
  > A 3D remake of Cauê Melo's original *Corona Invaders* (Canvas Retro Arcade, 2023). It runs in the browser, with no download.

- **Controls:**

  | | Keyboard | Mouse | Touch |
  | --- | --- | --- | --- |
  | Move | Arrows / WASD | Hold the left button and move | Drag anywhere |
  | Focus (slow, focused needles) | Hold Shift | | |
  | SOAP (bomb) | Space or X | Right button | SOAP button |
  | Fire | Automatic | Automatic | Automatic |
  | Pause / restart stage | P or Esc / R | Pause button | Pause button |
  | Briefing, epilogue, credits | Any key turns or skips a card; Esc skips the epilogue or the credits | Click | Tap |

- **Credits for the page:** original game by Cauê Melo (Canvas Retro Arcade, 2023, MIT), whose 16×16 corona and syringe sprites come back; three.js r187 (MIT); all sound synthesized with the Web Audio API; the four-note march nods to Space Invaders (Taito, 1978). The same lines roll in the game's own credits (the title's CREDITS button and the end of the run); they come from `credits.mjs`, where the owner can add a line. Recommended AI disclosure (release plan): Code, and Text & Dialog.
- **Cover candidate (630 × 500):** `common/artifacts/ci-v1-release/itch-cover-630x500.png`, the title card cropped from a real 960 × 640 frame. A 3D gameplay cover (a boss with its ring of bullets) would sell the 3D look better. Owner's choice.
- **Screenshot candidates (real 960 × 640 frames, Chrome + SwiftShader):**
  - `itch-title-960x640.png`: the title.
  - `itch-shot-1-airway-homage-grid.png`: 1-1, the original 4 × 15 grid of mini coronas.
  - `itch-shot-5-lungs-worms.png`: 2-2, RNA worms in the lungs.
  - `itch-shot-9-delta-lanes.png`: DELTA.
  - `itch-shot-12-omicron-prime.png`: OMICRON PRIME.

  The two boss frames still show the boss's CASE FILE card. Recapture them a few seconds later in the fight if the owner wants a clean board.

The full workspace has the deployment rationale in `../common/docs/V1_RELEASE_PLAN.md` and `../common/docs/ITCH_IO.md`, and shared continuity in `../common/SHARED_MEMORY.md`. Official upload reference: https://itch.io/docs/creators/html5
