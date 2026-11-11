# Changelog

Player-facing changes in Corona Invaders 3D. Versions follow `package.json`; the title screen shows the release as `v1.0`.

## [Unreleased]

### A beginning and an end

- **A briefing opens every new run:** five lines in the lab's voice say who you are (the syringe), where you are going (AIRWAY, LUNGS, BLOODSTREAM, THE CELL) and what counts as winning (R0 below 1). Any key or click skips it; it never returns within the run.
- **An epilogue, then the credits:** beating OMICRON PRIME now plays three short cards about what the culture became and how your run went, then the FINAL REPORT. Its CREDITS button rolls seven calm cards and ends on the title. The title's CREDITS button plays the same roll.
- **The FINAL REPORT waits for a fresh press**, so a SOAP key held through the boss cannot skip it. R no longer restarts OMICRON under a won run. NEW RUN is one row down for a repeat win.

## [1.0.0] - 2026-11-10

The first release of Corona Invaders 3D: a 3D bullet hell in the browser, built on Cauê Melo's original *Corona Invaders* from Canvas Retro Arcade (2023). You fly a short vaccine syringe against coronaviruses. The original's green pixel corona, its syringe and its 4 × 15 grid all come back on a real 3D board.

### Compared with the original game

- **A bullet hell, not a shooter.** You move freely over the lower board. Only the glowing dose in the middle of the barrel can be hit (0.2 u, drawn at exactly its collider). Bullets that brush past the 1.0 u ring around it are grazes: they score and fill the barrel toward your next SOAP.
- **Six bullet families you can read by shape:** sneeze droplets, aerosol mist, spike proteins, RNA beads on a thread, shootable virions and mucus globs.
- **Auto-fire, FOCUS and INJECT.** The syringe fires on its own. Hold Shift to slow down and pull the spray into a focused needle stream. Touch a virus with the needle tip to cure it at once.
- **SOAP** is the bomb. It clears bullets into antigen tokens, and it still saves you if you press it just after a hit.

### The v1.0 campaign

- **Twelve stages in four sectors**, each deeper into the body: AIRWAY, LUNGS (the bullets slow on the inhale and rush on the exhale), BLOODSTREAM (a current carries every bullet) and THE CELL (flashing viruses mutate into HEAVY CROWNs). Each sector has its own backdrop, motion and arrangement of the march.
- **Four midbosses and four variant bosses:** ALPHA, BETA & GAMMA, DELTA and OMICRON PRIME, each a sequence of named cards with a timer and a viral-load bar.
- **ADJUVANTS:** after every stage but the last, pick one of three cards that change your syringe. There are 30 cards in four tiers, and beating a boss improves the odds. Your build lasts for the run.
- **Credits, not permadeath:** 3 credits on Normal (unlimited on Easy). A continue restarts the stage you lost with the build you entered it with. Clearing the run on one credit earns the 1CC stamp.
- **Reports in a calm lab voice:** a LAB REPORT after each sample, a FIELD NOTE after each boss, and a FINAL REPORT at the end.
- **Easy and Normal**, plus an ASSIST game speed from 70 to 100 %. After three losses the game offers +1 vial or Easy.
- **Specimen tray:** replay any unlocked stage, practise a cleared one, or replay a boss card in the MUTATION LAB.

### New in 1.0

- **The short syringe:** the whole syringe now sits inside its graze ring, so what you see is what can be hit.
- **High-contrast bullets:** every bullet now wears a thin dark outline just outside its hitbox, so it stands out over lit viruses and the pale boss bodies as well as over each sector's floor. The coloured part is still exactly what hits you.
- **Credits** on the title screen and in the attract loop, and **`v1.0`** under the title.
- **Saves:** progress and settings live in versioned, game-prefixed keys. Progress from earlier builds carries over once. If your browser blocks storage (some itch.io embeds, private windows), the game still plays and keeps your progress for the visit.
- **A smaller download:** the itch.io build carries only the game, three.js and its licence, this changelog and the README. All sound is synthesized, so there are no audio, image or font files.
