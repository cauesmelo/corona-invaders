# Corona Invaders: design research brief

Prepared 2026-11-09 for the level designer and gameplay programmer. This brief contains research only; no game code was changed. It answers the latest feedback, "more maps, more bosses, more mechanics", and the complaint that the UI is generic and lifeless. Every recommendation keeps the real Three.js perspective cabinet and the single control scheme: strafe, fire, shield. All numbers are untested starting values.

## 0. Diagnosis of the current build

Based on `levels.mjs`, `model.mjs`, `game.js`, `style.css` and `artifacts/revision-3/corona-*.png`:

- **Enemies differ only in stats.** Spore, armored and dart enemies share one sway/descent formula and one global round-robin fire clock. Nothing about their behavior needs reading.
- **Bosses only add bullets.** Phases just widen the spread. "THE SPLITTER" never splits, and no boss has a weak point or a punish window.
- **Score and drops involve no decisions.** Points are flat (100/175/1500). Capsules come from an 8% roll with a cooldown, which produced 1–5 per run.
- **Hits are nearly silent and the palette collides.** A virus hit only plays a tone. Bosses are pink, the same color as enemy bullets, and a purple glow sits on the playfield.
- **The UI looks like a web page.** It has an Arial headline, "↗" buttons, a `<select>`, 7–9 px labels and a hint footer. At 320 px, "01 / 06" wraps.

## 1. Executive summary (ranked by fun per cost)

1. **Juice pass.** Hit flash, knockback, capped hitstop, trauma shake, voxel debris that stays on the floor, and chain-pitched audio. High fun, low cost.
2. **Dose Chain multiplier and sector medals.** Gives score real decisions and makes sector select a replay goal. High fun, low cost.
3. **"Cabinet-as-instrument" UI.** Vial hearts, LED score, a VIRAL LOAD boss bar with phase notches, an attract mode driven by the existing `tests/controller.mjs`, and a petri-dish sector map. High fun, medium cost.
4. **Bosses built on mechanics.** Delta really splits; Omega has weak-point nodes; every big attack follows telegraph → attack → punish window. High fun, medium cost.
5. **Three behavior archetypes first.** Diver (with a drawn dive path), Mitotic splitter and Burster (chain explosions). High fun, medium cost.
6. **Courier roulette ship.** Becomes the main capsule source; the random drop chance falls to 4%. Medium-high fun, low cost.
7. **Touch scheme.** Relative drag, auto-fire while touching, one shield button. High value on mobile, low cost.
8. **Membrane bunkers.** Space Invaders shields recast as cell walls. Medium fun, low cost.
9. **Campaign of 3 worlds × 4 sectors.** Adds bonus stages and per-world cabinet themes. Build it after items 1–6. High fun, high cost.
10. **Vaccine Burst.** A meter filled by kills and grazes, released on the existing Shift press. Medium fun, medium cost; add it only after the chain is tested.

## 2. Comparable games

| Game | What works | Complaints | Steal |
|---|---|---|---|
| [Space Invaders](https://en.wikipedia.org/wiki/Space_Invaders) | Formation and music speed up as invaders die; erodible bunkers; UFO | n/a | Tempo pulse, bunkers, mystery ship |
| [SI Extreme](https://en.wikipedia.org/wiki/Space_Invaders_Extreme) | Four same-color kills grant a power-up; UFO opens a timed bonus round, then Fever; border pulses to the beat | "Repetitive quickly" ([CinemaBlend](https://cinemablend.com/games/Review-Space-Invaders-Extreme-17581.html)) | Roulette UFO, beat-synced effects |
| [SI Infinity Gene](https://en.wikipedia.org/wiki/Space_Invaders_Infinity_Gene) | Starts as the 1978 game and gradually "evolves" its rules | White bullets on a white boss; the evolution tree disappointed ([Kotaku](https://kotaku.com/space-invaders-infinity-gene-review-to-infinity-and-be-5647628), [NoobFeed](https://www.noobfeed.com/reviews/space-invaders-infinity-gene)) | Worlds that mutate the rules; one color reserved for danger; no meta tree |
| [Galaga](https://en.wikipedia.org/wiki/Galaga) / [Legions DX](https://en.wikipedia.org/wiki/Galaga_Legions_DX) | Dives, two-hit bosses, capture risk, no-fire challenging stages; Legions draws neon path lines before waves and has chain-explosion ships | Legions relies on memorization, so it repeats | Divers with drawn paths, bonus stage, chain bursts |
| [Phoenix](https://en.wikipedia.org/wiki/Phoenix_(1980_video_game)) | Early boss: shoot a gap through a moving shield to reach the pilot | n/a | Armor you "dig" through |
| [Centipede](https://en.wikipedia.org/wiki/Centipede_(video_game)) | Each enemy owns one job (flea seeds, spider harasses, scorpion poisons) | n/a | One role per archetype |
| [Tempest](https://en.wikipedia.org/wiki/Tempest_(video_game)) | Readable 3D lanes; tankers split into flippers; pulsars electrify lanes; Superzapper | n/a | Splitting, lane beams, a per-level bomb |
| [Ikaruga](https://en.wikipedia.org/wiki/Ikaruga) | One rule (polarity) drives all stage design; three-color chains | Hard to approach | One rule per world |
| [Resogun](https://gamingbolt.com/resogun-dev-diary-from-voxel-murder-to-resolution-gunning-in-1080p) / [Nex Machina](https://www.engadget.com/2016-12-03-nex-machina-housemarque-resogun-sequel-interview-preview.html) | Voxel destruction balanced against "spectacle and readability"; multiplier capped at ×5; no congratulation pauses; one new challenge at a time | Effects can hide threats | Debris, capped multiplier, fast flow |
| [Geometry Wars 3](https://blog.playstation.com/?p=152477) | Each enemy has one purpose and is tested in isolation; behavior "clearly defined and strong" | Late-game chaos | The process; a docile-to-active telegraph |
| [Luftrausers](https://www.pcgamer.com/luftrausers-review/) | Kill chain (cap ×20) with a short expiry | Cap too high ([Steam](https://steamcommunity.com/app/233150/discussions/0/558754260531782967)) | Chain window, moderate cap |
| [Tetris Effect](https://wccftech.com/interview-tetsuya-mizuguchi-synesthesia-tetris-effect-rez-lumines/) / [Vampire Survivors](https://theconversation.com/vampire-survivors-how-developers-used-gambling-psychology-to-create-a-bafta-winning-game-203613) | Audio reacts to input; reward chimes | Vampire Survivors analyzed as gambling psychology | Input-reactive SFX; avoid loot spam |

## 3. Player feedback patterns

- **Readability matters most.** "Can't see what's going on" and "Is it on my level?" are listed shmup sins ([Nomad's Reviews](https://nomadsreviews.co.uk/post/design-sins-and-pet-peeves-in-shoot-em-ups)). Infinity Gene was criticized for white bullets. A perspective cabinet adds the risk of misjudging depth.
- **Bullet-sponge bosses** have "excessive health and repetitive patterns" ([Nomad](https://nomadsreviews.co.uk/post/design-sins-and-pet-peeves-in-shoot-em-ups), [Den of Geek](https://www.denofgeek.com/games/bullet-sponges-v)).
- **Losing power on death** ("Gradius syndrome") makes recovery feel hopeless ([shmups forum](https://shmups.system11.org/viewtopic.php?p=975086)). Restarting the whole level is also a "design sin". CI's timed buffs and sector checkpoints already avoid both; keep them.
- **Forced "scary" power-ups and missing auto-fire** draw complaints. CI's hold-to-fire and optional catches are correct.
- **Memorization breeds repetition** (Galaga Legions DX, SI Extreme).
- **Scoring cuts both ways.** Multipliers make combos "all the more intense to maintain", but players dislike fiddly systems ([shmup 101](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101)). Use one rule.
- **On mobile, the finger hides the ship.** Players prefer relative drag ([TouchArcade](https://toucharcade.com/community/threads/preferred-control-method-for-shmup-bullethell-free-flight-games.125655/)).

## 4. Principles → changes

| Principle | Source | CI change |
|---|---|---|
| Layered juice; bigger bullets, impact, knockback, permanence, hit pause | [Jonasson & Purho](https://roblog.co.uk/2024/03/juicy-games/); [Nijman](https://www.gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games) | §7 juice spec |
| Both attacker and target freeze on hit; capped | [Sakurai](https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/) | Pause the model step; no freeze on popcorn kills |
| Shake = trauma² | [Eiserloh, GDC](https://gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing) | Per-event trauma budget |
| Bright bullet core with a dark rim; midtone backgrounds; pinks for bullets; tiny centered hitbox | [Boghog](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101); [Touhou focus](https://shmups.wiki/library/Unknwn/Touhou) | Pink only for enemy fire and telegraphs; a ground shadow under every bullet; hitbox shown as a dot on the barrel |
| Density comes from structure; combine walls with aimed shots | [Sparen](https://sparen.github.io/ph3tutorials/ddsga4.html) | Gapped rings (macro-dodge) plus aimed triples |
| One role per enemy (pressure, area denial, elite); minimal HP | Boghog; Centipede | Archetype catalogue |
| Telegraph → react → punish; telegraph length scales with danger | [Salt & Steel design doc](https://salt-and-steel.pages.dev/docs/15/boss-design) (informal); [Choost](https://choostgames.com/blog/what-makes-a-good-boss-fight/) | 0.65 s small, 0.9–1.2 s large; 1–1.5 s vulnerable window |
| Boss beats: intro, baseline, escalation, midpoint, all-out, kill sequence, reward | [Boss Battle Design and Structure](https://www.gamedeveloper.com/design/boss-battle-design-and-structure) | §6 scripts |
| Boss length proportional to the stage; ending more intense than the start | [Boss design for shmups](https://www.gamedeveloper.com/design/video-game-boss-design-for-shmups) | HP formula |
| Introduce, develop, twist, conclude | [Kishōtenketsu](https://www.mcvuk.com/development/video-nintendos-level-design-secrets-in-four-steps) | World structure |
| Hidden rank is divisive | [Garegga rank](https://shmups.wiki/library/Battle_Garegga/Advanced_Rank) | No hidden rank; an opt-in assist |
| Signs and feedback; form follows function | [Hodent](https://www.creativebloq.com/features/how-neuroscience-and-ux-impacts-video-game-design) | §10 |
| Never rely on color alone; offer reduced motion | [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/?p=21) | Shape plus color; reduced motion gates all juice |

## 5. Enemy archetype catalogue

Introduce each new type alone before mixing it with others. Every type stays on the X/Z combat plane.

| Archetype | Role | Behavior and telegraph | HP / radius | First |
|---|---|---|---|---|
| Spore (existing) | Popcorn | Sway; aimed shot after a 0.65 s pink glow | 1 / 0.67 | 1-1 |
| Armored (existing) | Durable | Paired shots; shell visibly cracks at 1 HP | 2 / 0.78 | 1-2 |
| Dart (existing) | Speed | Weaves in Z; 11 u/s shots | 1 / 0.58 | 2-1 |
| **Mitotic splitter** | Area denial | A seam pulses before death, then it splits into 2 daughters drifting ±3 u/s for 0.6 s (from Tempest tankers) | 2 / 0.72; daughters 1 / 0.45, no drops | 1-3 |
| **Diver** | Pressure | Every 4–6 s, shows a pink dashed path for 0.8 s, then dives at 9 u/s to z≈7, fires once and loops back up a rail. Contact costs a heart. Dive kills score ×2. | 1 / 0.6 | B1 preview, 2-1 |
| **Burster pod** | Combo enabler | Glowing swollen core; on death, a 2.2 u burst deals 1 damage to enemies only, and bursts chain | 1 / 0.7 | 2-2 |
| **Infector** | Priority target | Tethers a spore with a pink beam for 1.5 s, converting it to armored; killing it mid-tether gives +300 CURED | 1 / 0.5 | 2-3 |
| **Capsid** | Timing | Its front plate blocks shots (with a cyan spark). Every 3 s the plate opens: 0.65 s warning, then it fires and stays vulnerable for 1.0 s. | 2 / 0.8 | 3-1 |
| **Courier** | Reward | Crosses the back row once per sector at 4.5 u/s and never fires. Its capsule icon cycles every 0.8 s; the kind showing when it dies is what drops. | 3 / 0.7 | 1-2 |

**Not now:**
- **Antibody ally** (a Gaplus-style capture) goes to the backlog.
- **Adaptive mutant** is rejected because its behavior would be opaque.

**Breach rule.** A pulsing "breach line" on the floor warns when the formation is within 3 u of the ship row, so the instant loss is never a surprise.

## 6. Boss designs

**Sizing HP.** Base DPS is about 3.85 shots/s × 70% accuracy ≈ 2.7 HP/s. HP ≈ 2.7 × target seconds × fraction of time the boss is vulnerable. Target 35–45 s for minibosses, about 60 s for world bosses and about 90 s for the finale. Experts should take about half the target and first-timers no more than 2.5×. A miniboss never outlasts the end boss.

- **DELTA / THE SPLITTER (1-4, 60 HP).**
  - **P1 Whole (32 HP):** aimed pairs. Every third volley is a lane beam that glows on the floor for 1.0 s, followed by a 1.2 s punish window.
  - **Split:** a glowing seam shows for 1.0 s. Both halves are then stunned for 1.2 s and take 2× damage.
  - **P2 Halves (14 HP each):** the halves mirror each other's X and fire 3-shot spreads. Killing one makes the survivor fire 30% faster.
  - **Boss bar:** splits into two sub-bars.
- **MOTHER CELL (2-4, 80 HP).**
  - **P1:** 3 sacs of 10 HP; each spawns a Burster or Diver every 6 s, so every sac you destroy removes one spawn stream.
  - **P2:** the 50 HP core opens 2 s and closes 3 s. A 0.8 s cyan glow announces each opening, followed by a 5-shot spread.
  - **P3 (<25%):** an orbiting ring of 6 Bursters; each one popped beside the core deals 4 damage, paying off the lesson of 2-2.
- **ECHO, the mirror strain (3-2 miniboss, 48 HP).**
  - **P1:** tracks your X with a 0.6 s lag. A mirror plate turns your shots into sparks; it is vulnerable for 1.2 s after each volley, while its eye is open.
  - **P2:** sits at X = −ship.x and freezes during a 0.9 s charge.
  - **P3:** two Echoes; only the one with the glowing nucleus takes damage, and the nucleus swaps after each volley.
  - This boss tests positioning, not reflexes.
- **OMEGA PRIME (3-4, 104 HP; currently 96).**
  - **P1 Crown:** 4 orbiting nodes of 8 HP, each owning one attack (aimed, spread, lane beam, spawner). Destroying a node removes its attack, so the player chooses the order.
  - **P2 Corona flare (72 HP core):** a ring telegraph glows for 1.0 s, then a bullet ring with 2 gaps fires, followed by aimed triples. The core is vulnerable for 1.5 s after each flare.
  - **P3 (<20%):** the full moveset at 1.25× speed.
  - **Death:** 200 ms hitstop, 0.5× slow motion for 0.8 s, then a voxel collapse.

**Rules for every boss:**
- Movement stays continuous across phases; keep the existing regression test.
- The boss bar shows a notch at each phase threshold.
- A phase break triggers 120 ms of hitstop and a one-line attack name.
- Every attack can be dodged without the shield.

## 7. New mechanics

1. **Dose Chain.**
   - **Window:** each kill refreshes a 1.6 s window. Boss hits refresh it by 0.6 s but do not count as kills.
   - **Tiers:** ×2 at 5 kills, ×3 at 10, ×4 at 16, ×5 at 24, ×6 at 32 (cap).
   - **Breaking:** damage resets the chain; using the shield does not.
   - **Display:** the syringe barrel fills with fluid, a small "×4" floats near the ship, and kill SFX rise one semitone per tier.
2. **Medals.** Bronze for a clear, Silver for at most 1 heart lost, Gold for no hit and beating par. Par = 1.3 × the QA controller's clear time.
3. **Membranes.** Four bunkers at z=7.2, x=±2 and ±6. Each is 4×2 cells of 1 HP and is chipped by both sides' shots. Enemies that touch them erase cells. They reset each sector. Worlds 1–2 have them; 3-3 removes them as its twist.
4. **Vaccine Burst (tier 2).**
   - **Filling the meter:** +4 per kill, +15 per Courier and +6 per graze. A graze is a bullet passing within 1.2 u of the ship without hitting; it counts once per bullet and shows a cyan spark.
   - **Release:** when the meter is full, the next Shift press shields and also sends out a ring at 28 u/s. The ring cancels bullets (+10 each), deals 1 damage to regular enemies and 6 to a boss.
   - **Retry:** the meter returns to its sector-entry value.
5. **Juice spec.** Everything here is visual or audio only, and reduced motion disables the motion parts.
   - **Hits:** 60 ms white flash, a 1.12→1.0 scale punch over 100 ms, and a −0.15 z knockback.
   - **Hitstop:** 0 ms on popcorn kills (repeated freezes feel choppy), 30 ms on armored or splitter kills, 60 ms on the Courier, 120 ms on a phase break. Cap it at 120 ms per rolling second.
   - **Trauma shake:** +0.15 armored kill, +0.3 damage taken, +0.5 phase break, +0.8 boss death. Offset = trauma² × 0.35 u, decaying 1.5/s, plus a 0.04 u kick against each shot.
   - **Debris:** 6–10 instanced voxel shards per kill fade over 4 s (pool of 300).
   - **Syringe:** 40 ms muzzle flash and a plunger kick.
   - **Formation pulse:** a 4-note bass loop that speeds up from 72 to 144 bpm as enemies die.
6. **Rejected:**
   - **Charge shot:** fights hold-to-fire.
   - **Overheat:** punishes the newly lowered fire rate.
   - **Hidden rank:** opaque.
   - **Time-as-health:** redundant.

## 8. Power-up review

- **Keep** the four timed effects, optional catching, no loss on death, and full-health repair turning into shield.
- **Change the drop sources:**
  - The Courier roulette becomes the main source.
  - Reaching ×4 chain guarantees one drop per sector.
  - The random drop chance falls from 8% to 4%, keeping the 10 s cooldown.
  - Target: about 2 capsules per sector, about half of them earned.
- **Give each capsule a distinct silhouette.** RAPID is a chevron, SPREAD a trident, SHIELD a ring and REPAIR a cross. Optional theme names: ADRENALINE, TRIPLE DOSE, BARRIER, BOOSTER.
- **Move timers to a ring at the ship's base.** Keep the HUD chip as an accessible mirror.
- **Make SPREAD feel bigger, not stronger.** Make it look wider and sound fuller instead of raising its damage ([Boghog](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101)).

## 9. Campaign and map plan

| World | 1 Introduce | 2 Develop | 3 Twist | 4 Conclude | Bonus |
|---|---|---|---|---|---|
| **W1 BLOODSTREAM** | 1-1 FIRST RESPONSE (S1): membranes | 1-2 CROSS CONTAMINATION (S2): armored, Courier | 1-3 SPLIT DECISION: splitters, armored splitters | 1-4 DELTA | CULTURE CHECK: no-fire Diver flights scored for a medal (Galaga) |
| **W2 AIRWAY** | 2-1 SPORE STORM (S4): Divers, darts | 2-2 CHAIN REACTION: Burster lattices | 2-3 VECTOR FIELD (S5): Infectors | 2-4 MOTHER CELL | CULTURE CHECK 2: Capsid preview |
| **W3 LAB / PETRI** | 3-1 CAPSID WALL: shield-bearers | 3-2 ECHO miniboss | 3-3 MUTATION: everything, no membranes | 3-4 OMEGA PRIME (S6) | Unlocks OUTBREAK endless (later) |

**Cabinet themes.** Change only the floor, the under-glass backdrop, the rail lights and the marquee text. Keep backdrops in midtones, with no pink and no bright dots the size of bullets.
- **W1:** teal floor, desaturated red cells drifting beneath the glass.
- **W2:** ribbed bronchial rings and slow bubbles.
- **W3:** amber agar glow and a sweeping UV lamp.

**Difficulty curve by world:**

| | W1 | W2 | W3 |
|---|---|---|---|
| Fire interval | 1.85→1.45 s | 1.4→1.15 s | 1.15→1.0 s |
| Enemy shot speed | 8.5–9.5 u/s | 9.5–10.5 u/s | 10.5–11.5 u/s (darts 12) |
| Enemy bullets alive at once | 6 | 9 | 12 |

Target 35–60 s per sector for a human player, with intensity varying inside each sector. Add a behavior before adding HP.

**Checkpoints.**
- Keep checkpoints at sector entry. A sector clear restores +1 heart and a world clear restores all hearts.
- Retry resets the chain, meter and membranes to their entry values.
- After 3 failures, offer an opt-in "+1 heart" assist. It marks the medal with an "A" and locks nothing.

## 10. UI/UX spec: the cabinet as a lab instrument

**Identity.** A 1980s arcade cabinet crossed with a lab analyzer: phosphor LED segments, cyan glass, black bezels.

**Color tokens.** Each color has one meaning:
- **Phosphor `#91ffce`:** player and score.
- **Cyan `#6fe8ff`:** shield and system.
- **Pink:** enemy fire, telegraphs and damage only.
- **Amber:** armor and medals.
- **Boss bodies:** pale violet-white.

**Type.**
- Numbers use a locally bundled seven-segment font, for example DSEG7 under the SIL OFL license; check the license and include it.
- Labels use one mono face.
- Minimum sizes: 12 px at 960×640, 10 px at 320.

| Screen | Spec |
|---|---|
| Attract/title | Idle 8 s, then loop: marquee logo → a 20 s live demo of 1-1 driven by `tests/controller.mjs` ("DEMO") → local top-5 high scores → icon controls card `[←][→] MOVE · [SPACE] FIRE · [SHIFT] SHIELD`. Title shows the logo, a blinking PRESS FIRE (TAP TO START on touch), and small SECTOR MAP and speaker icons. No paragraph text. |
| HUD | A 44 px strip. Left: 3 dose vials (a hit cracks and drains one over 300 ms; repair pours it back). Center: LED score and a "×4" chain chip. Right: "1-3 BLOODSTREAM" and pause. The shield cooldown is a cyan arc around the syringe; remaining enemies show as an "infection load" fill on the near rail. |
| Boss bar "VIRAL LOAD" | 56% of the stage width (max 520 px) × 24 px: phase notches, ◆◇◇ pips, node or sac pips, the existing lag trail, a small numeric readout and ARIA. At a phase break the segment shatters and the attack name shows for 1.2 s. |
| Sector intro | A 1.2 s slide label while the formation enters, e.g. "1-3 · SPLIT DECISION". On first meeting a new archetype, adds one line such as "NEW: splits in two" with an icon. Never covers the playfield. |
| Sector clear | One tally strip inside the existing 1.8 s transition: "CLEAR +1500 · CHAIN ×5 · ★ SILVER"; play continues automatically. A world clear shows a LAB REPORT card and waits for FIRE. |
| Pause | "SPECIMEN ON HOLD" over a desaturated scene. Vertical 44 px rows: Resume / Retry sector / Sector map / Sound / Effects (Full or Reduced) / Controls. Keyboard ↑↓ and Enter. |
| Game over | "CONTAINMENT LOST" with a cause-of-death card ("Hit by DIVER shot · 0:42"). A 9 s countdown: FIRE retries, ↓ opens the map. When it expires, return to attract mode; unlocks are kept. |
| Sector map | "SPECIMEN TRAY": 3 rows × 4 dishes plus a bonus slot. Each dish shows its code, medal ring and best score; locked dishes show a sealed lid. Replaces the `<select>`. Four 64 px dishes fit in 280 px. |
| Touch | Relative drag anywhere in the lower 60% (the ship is never under the finger), auto-fire while touching, and one 72 px SHIELD button with a cooldown ring and burst glow. The current four buttons become an option. |
| 320 portrait | A 40 px strip (vials, score, chain, pause) and an 18 px full-width boss bar. Nothing wraps. |

**Remove:**
- the Arial headline and the ↗ buttons
- "FREE PLAY · NO COINS REQUIRED"
- the hint footer
- "CABINET ONLINE" and its status dot
- the corner notes "STRAFE. FIRE. SURVIVE." and "VIRUSES REMAINING"
- the stacked secondary buttons
- 7–9 px labels
- the purple playfield glow
- the text SOUND toggle

## 11. Pitfalls

- **Scope.** Ship items 1–6 plus World 1, then get feedback before building more.
- **Determinism.** Splits, Couriers and spawns must use the seeded RNG so checkpoint replays stay identical. Add tests for:
  - chain reset on retry
  - daughters never dropping capsules
  - Bursters never hurting the player
  - every boss attack being dodgeable without the shield
- **Hitstop.** It must pause the model step as well as the render, or input and collisions desync.
- **Readability.** Pink stays exclusive to danger. Every projectile gets a ground shadow, and no prop sits in the combat plane.
- **Performance.** Use instanced shards and bullets and test on a real phone GPU. The juice pass must respect reduced motion and keep the WebGL fallback working.
- **Content.** No HP inflation and no unlock trees; Infinity Gene's evolution tree disappointed reviewers.
- **Constraints.** One control scheme, an independent game folder, itch.io iframe sizes, and no CDN or external fonts.

Several sources are fan wikis, forums or informal design docs, and are labeled where used. The GMTK boss video and the full Nijman talk could not be read as text, so no specific claim relies on them.
