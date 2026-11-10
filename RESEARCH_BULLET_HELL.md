# Corona Invaders as a syringe bullet hell: research brief (revision five)

Prepared 2026-11-09 by the game-design researcher and art director for the dev squad. This is research only; no game code was changed. All tuning numbers are starting values to be confirmed in human play. Units follow `BALANCE.md`: world units (u) on the X/Z combat plane, seconds and u/s. The arena is `halfWidth` 9.4 and z from −13.4 to 13.4, with +Z pointing toward the player.

**The user's feedback (translated):** "You drifted from the CORONA(virus) theme. You put in some airplanes, and the game lost its personality and became very generic." They want it pulled back toward Corona Invaders and made into **a bullet hell of a syringe fighting coronaviruses**.

## 0. Verdict and the five decisions

The build is a competent Space Invaders lane shooter wearing a lab skin. Three things make it generic:

- **Silhouettes.** Several enemies are literally aircraft.
- **Bullets.** Every attacker fires the same pink ball.
- **Structure.** One shooter fires at a time, at most 6–12 bullets are alive, and you strafe on one axis. That is not a bullet hell.

Ranked by impact per cost:

1. **Make it a bullet hell.** 2D movement on the board, a FOCUS mode, a tiny visible core hitbox, graze, a bomb, and many slow, readable bullets.
2. **Do a theme pass.** Every silhouette, bullet, name and backdrop becomes a virus or immune element, and every aircraft shape is removed (§1, §4).
3. **Give bullets personality.** Six bullet families, each expressing its shooter: sneeze droplets, aerosol mist, spike proteins, RNA beads, virions and mucus globs. A data-driven emitter fires them (§5).
4. **Build variant bosses.** ALPHA, BETA & GAMMA, DELTA and OMICRON PRIME, each with named **mutation cards**, our spell cards (§7).
5. **Welcome newcomers.** An Easy mode, practice for every stage and card, a camera tuned for readability, and fast restarts (§3, §8).

## 1. What reads as an airplane or generic sci-fi today

| Element | Where | Why it reads generic | Fix |
| --- | --- | --- | --- |
| **Dart** | `render.mjs` `g.dart` | Long octahedron, a 1.7 u wing box and a vertical tail fin: fuselage, wings and tail. **The clearest airplane.** | RNA WORM: a wriggling helix ribbon |
| **Diver** | `g.diver` | Cone with two swept fins, so a jet or arrowhead | DROPLET: a teardrop with a virus visible inside |
| **Culture flier** (B1) | `g.flier` | Cone with a flat wing, so a paper plane | VIRION: a small crown ball trailing a mucus streak |
| **Courier** | `g.courier`, "roulette capsule ship" | White capsule flying a horizontal pass, so a blimp or UFO | VESICLE: a translucent lipid bubble carrying the pickup |
| **Syringe** | flange box 0.88 u wide, thumb-rest box 0.7 u | From a 55° view, two crossbars on a long body look like wings and a tailplane (title and combat screenshots) | Redesign it (§4.1) |
| **Capsid** | steel icosahedron with a box plate | An armored drone. Coronaviruses are enveloped, not icosahedral | BLOOM: spike "petals" close into a bud |
| **Infector** | tetrahedron with 3 legs | An alien probe or lander | HIJACKER: a crowned virus with a pink RNA tether |
| **Omega nodes** | octahedron plus cone, cylinder or torus | Sci-fi turrets | Spike-protein nodes in four spike shapes |
| **Shield** | cyan wireframe sphere | A sci-fi force field | Soap bubble (the bomb) |
| **Bullets** | one instanced pink icosahedron | No identity per attacker | Six families (§5.1) |
| **Pickups** | RAPID chevron, SPREAD trident | Military insignia | Vaccine-kit items (§6) |
| **Names** | OMEGA PRIME, ECHO, COURIER, DART, SECTOR | Space opera | Variant and biology names (§4.4) |

**Keep, because these already read as the game:**

- the spore (a spiky sphere with ball-capped spikes, which echoes the original sprite)
- the Splitter's two lobes (budding)
- MOTHER CELL
- the VIRAL LOAD bar, the vials, the petri SPECIMEN TRAY and CONTAINMENT LOST
- the rule that pink means danger
- the Dose Chain and the capped hitstop

**Bug spotted:** `artifacts/revision-4/corona-failure.png` shows the cause card "Hit by undefined shot" (3-4). It may come from a test fixture, but every bullet must carry a family and source label (§10).

**Original identity** (`refs/canvas-retro-arcade/src/img`):

- `corona.png` is a 16×16 monochrome `#12ce5d` virus: a ring core with 8 ball-tipped spikes.
- `syringe.png` is the same green.
- Lives were 3 hearts, and the formation was a 4×15 grid (60 coronas).

That single-color pixel crown is the personality to recover.

## 2. What the bullet-hell canon teaches

| Principle | Source | CI rule |
| --- | --- | --- |
| The hitbox is far smaller than the sprite, centered, and shown in focus | [Touhou overview](https://shmups.wiki/library/Unknwn/Touhou), [1-pixel collision box](https://significant-bits.com/the-1-pixel-collision-box), [Boghog 101](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101) | Core hitbox 0.16 u (today 0.48), drawn as a white dot that is always on top |
| Focus slows you and concentrates fire. Boghog suggests about ⅔ speed as a middle ground; Touhou characters' focus is often much slower | Boghog; Touhou | Focus at 0.45× speed, and the needle stream narrows |
| Constant speed, normalized diagonals, no inertia | Boghog | Instant velocity, with a 60 ms blend between speeds only |
| Value contrast: a bright core with a dark rim, midtone backgrounds. Use reds, pinks and purples for bullets; yellow and orange clash with items and explosions | Boghog | Pink-to-violet bullets with white cores and black outlines; amber for pickups only |
| Draw enemy bullets above everything; small, fast bullets above large, slow ones; stretch fast bullets along their travel | Boghog | Bullet pass last, `depthTest` off, per-family sort |
| Pattern types: aimed bullets force movement, static ones restrict it, random ones are used sparingly, and mixes combine them. An odd fan traps the player and an even fan spares them. Stacks, micro- vs macro-dodging, spatial vs temporal density, negative space | Boghog; Sparen [A3](https://sparen.github.io/ph3tutorials/ddsga3.html), [A4](https://sparen.github.io/ph3tutorials/ddsga4.html) | 12 pattern families (§5.2), at most 2 overlapping on Normal |
| Think in lanes (5–7); avoid blocking large chunks of the screen and spawning enemies at the borders | Boghog | Wall gaps of at least 2.0 u; emitters stay inside \|x\| ≤ 7.5 |
| After a hit, cancel bullets and give a couple of seconds of invulnerability; allow a short bomb buffer (deathbomb) | Boghog; Touhou | Full-screen cancel, 2.5 s invulnerability, a 0.18 s deathbomb window |
| Graze counts once per bullet; lasers graze continuously | Touhou | Graze ring of 1.0 u; beams tick every 0.1 s |
| A bomb or barrier converts bullets into score items | [ESP Ra.De.](https://shmups.wiki/library/ESP_Ra.De.), [Jamestown Vaunt](https://shmups.wiki/library/Jamestown), [Danmaku Unlimited 3 Spirit mode](https://shmups.wiki/library/Danmaku_Unlimited_3) | The SOAP burst turns droplets into antigen tokens |
| Named spell cards: a background change, a capture bonus and a timeout | Touhou | **Mutation cards** |
| Practice for every encountered card | [Imperishable Night](https://en.wikipedia.org/wiki/Imperishable_Night) | MUTATION LAB in the tray |
| Theme saturation: every enemy belongs to one family | [Mushihimesama](https://en.wikipedia.org/wiki/Mushihimesama) (all insects), [Enter the Gungeon](https://en.wikipedia.org/wiki/Enter_the_Gungeon) (bullet-shaped enemies) | Everything on the board is a virus, a cell or an immune agent |
| Each enemy has its own attacks, and combined groups make distinct encounters | [Undertale battle deep dive](https://www.gamedeveloper.com/design/game-design-deep-dive-i-undertale-i-s-action-based-rpg-battles) | Each archetype owns one bullet family and one personality telegraph |
| One color means harm | [Just Shapes & Beats preview](https://shacknews.com/article/104019/just-shapes--beats-hands-on-at-gdc-2018) | Pink is danger, now including the bullet shapes |
| Draw entry paths before waves arrive, to stay fair to newcomers | [Galaga Legions](https://en.wikipedia.org/wiki/Galaga_Legions) | Keep the dashed path language for DROPLET dives and flights |
| Every enemy needs a role; balance spectacle against readability | [Nex Machina](https://www.gamedeveloper.com/design/how-housemarque-designed-the-vibrant-bullet-hell-scape-of-i-nex-machina-i-), [Engadget](https://www.engadget.com/2016-12-03-nex-machina-housemarque-resogun-sequel-interview-preview.html) | Debris stays dim and on the floor; no effect looks like a bullet |
| Design sins: "Is it on my level?" depth confusion, busy backgrounds, sponge bosses, losing all power on death, restarting from the beginning, no auto-fire | [Nomad's design sins](https://nomadsreviews.co.uk/post/design-sins-and-pet-peeves-in-shoot-em-ups) | One bullet plane; midtone backdrops; boss length set by time-to-kill; −1 power on death; in-place respawn; auto-fire |
| A novice mode for newcomers | Mushihimesama (Novice in its ports) | Easy (§7.4) |

### Comparable games: lessons to steal and to avoid

| Game | Steal | Avoid |
| --- | --- | --- |
| Touhou | Focus with a visible core, graze, named cards, card timeouts, practice | Rank-locked endings, density walls on Normal |
| DoDonPachi | Chain gauge, point-blank reward ([DaiOuJou](https://shmups.wiki/library/DoDonPachi_3)) | Chain rules a newcomer can't see |
| ESP Ra.De., Jamestown, Danmaku Unlimited, Crimzon Clover ([wiki](https://shmups.wiki/library/Crimzon_Clover)) | Cancelled bullets become score | Several meters at once |
| Ikaruga ([polarity](https://en.wikipedia.org/wiki/Ikaruga)), Radiant Silvergun ([sword](https://shmups.wiki/library/Radiant_Silvergun)) | One rule drives everything; absorbing pink bullets fills a gauge | Puzzle depth and input load |
| Enter the Gungeon | The enemies **are** the theme; a blank clears every bullet | Pure memorization |
| Tyrian ([Wikipedia](https://en.wikipedia.org/wiki/Tyrian_(video_game))), Galaga Legions, Geometry Wars | Readable power steps, drawn paths, one job per enemy | A shop economy; late chaos |
| Bullet heaven ([PC Gamer](https://pcgamer.com/gaming-industry/its-official-steam-decrees-bullet-heaven-the-name-of-the-vampire-survivors-genre)) | — | Don't flood the screen with *player* fire. The user earlier asked for a lower fire rate, so our stream stays calm |
| Undertale, Just Shapes & Beats | Bullets with character; a rhythmic "breathing" twist | Shapes the player cannot hit back |

## 3. Movement, controls and camera

### 3.1 Movement model (pure simulation in `model.mjs`)

| Parameter | Value | Reason |
| --- | --- | --- |
| Movement area | x ∈ [−8.9, 8.9], z ∈ [−3.0, 12.0] (about 60% of the field) | Room for macro-dodges; the player can get point-blank on the formation, which never descends past z = −4 |
| Normal speed | 11.5 u/s, diagonals normalized | Crosses the field in about 1.5 s |
| Focus speed | 5.0 u/s (0.45×) with a 60 ms blend | Fine enough to micro-dodge, but focus can still escape an aimed stream |
| Core hitbox | radius **0.16 u** at the barrel centre | About 6–7 px at 960×640 |
| Graze ring | 1.0 u around the core | Counted once per bullet |
| Enemy-body contact | Uses the core hitbox against the body radius | Bodies are big, so contact stays readable |
| Spawn exclusion | No bullet may spawn within 2.5 u of the core | Prevents point-blank surprise deaths |
| Respawn | 0.5 s glide in from (0, 12); 2.5 s invulnerability, flickering at 10 Hz | Death costs only seconds |

### 3.2 One control scheme

**Fire is automatic during play.** That removes one input and answers the "no auto-fire" sin. The stream is deliberately calm (§6) to honor the user's earlier lower-fire-rate request.

| Action | Keyboard | Touch | Mouse (secondary) |
| --- | --- | --- | --- |
| Move | Arrows / WASD | **Relative drag anywhere**: finger travel maps 1:1 onto the board plane (projected), capped at 30 u/s, so the finger never covers the ship | Ship follows the cursor's plane point at up to normal speed |
| Focus | Hold **Shift** | None needed. Touch drag is already precise and the hitbox is always shown. Fire switches to NEEDLE automatically while a boss is present | Hold the left button |
| Soap burst (bomb) | **Space** (X also works for Touhou players) | 72 px SOAP button with a stock count | Right button |
| Pause / retry | P or Esc / R | Pause button | — |

Today Shift is the shield and Space is fire. The title strip, controls card and first-sector callout must announce the new map: **"ARROWS MOVE · SHIFT FOCUS · SPACE SOAP · AUTO-FIRE"**.

### 3.3 Camera: keep real perspective, make it read like a flat danmaku plane

The project constraint is an actual WebGL perspective scene. The bullet hell needs scale to be uniform across the field.

- **Search window in `camera.mjs`:** change pitch from 44–74° to **64–74°** and FOV from 30–48° to **24–32°**. Tighten the far/near depth ratio cap from 1.9 to **≤ 1.35**. The camera stays fixed: no follow and no sway.
- **One plane:** every bullet, the hitbox dot and the collision math share y = 0.55 u. Contact shadows stay subtle, because steep pitch removes most "is it on my level?" doubt.
- **Minimum on-screen sizes, asserted in browser QA:**
  - hitbox dot ≥ 6 px
  - smallest bullet ≥ 7 px at the far edge at 960×640, and ≥ 5 px at 320 wide
  - Visual radii may scale up on small screens; hit radii never do.
- **Landscape at 960×640:** the field becomes a centered column about 470–520 px wide. The side columns hold the instrument HUD, like Touhou's side panel (§9). The top band keeps the VIRAL LOAD bar.
- **Portrait:** the field fills the width; HUD strip on top, thumb zone below (as today).

## 4. Theme bible

### 4.1 Art direction: three references

1. **The user's original sprite.** Build the WILD TYPE mesh on its silhouette: a fat core with about 10 thick spikes, each topped by a ball, which is the 8-spike crown in 3D. Kill debris becomes green voxel cubes taken from the sprite's 112 pixels. 1-1 opens with the original **4×15 grid** of 60 mini coronas as a homage.
2. **The public coronavirus portrait.** Eckert and Higgins' widely circulated, public-domain CDC illustration made the grey sphere with crown spikes the public's picture of the virus ([UGA](https://news.uga.edu/alissa-eckert-and-dan-higgins-visualizing-a-virus), [Wallpaper](https://www.wallpaper.com/design/design-emergency-alissa-eckert-designs-covid-19-illustration)). Boss bodies use that grey-white sphere, but with **variant-green spikes, not red**, because red and pink are reserved for danger.
3. **Cartoon immunology:** [Dr. Mario](https://en.wikipedia.org/wiki/Dr._Mario)'s dancing viruses and [Cells at Work!](https://en.wikipedia.org/wiki/Cells_at_Work!)'s body-as-world. The personality comes from motion:
   - squash and stretch when a virus inhales to sneeze
   - spikes bristle before a shot
   - jelly wobble on hit
   - **Bosses only** get two simple dot eyes. They narrow to telegraph an attack and change at each mutation. Popcorn stays faceless, true to the sprite. *(Superseded 2026-11-10: every villain now has a face; see §12.)*

**Syringe redesign (the hero):**

- Point the needle up-field and tilt the body 20° so the camera sees its profile: a clear barrel with cyan vaccine fluid, graduation marks and a long bright needle.
- The finger flange becomes a small rounded oval and the thumb rest a round disc. Nothing may extend sideways beyond the barrel width + 0.2 u.
- The hitbox dot sits in the barrel.
- Two Y-shaped **antibody** options orbit it (§6).

### 4.2 Palette: one meaning per hue

| Hue | Meaning |
| --- | --- |
| Greens `#12ce5d` family (Alpha `#12ce5d`, Beta/Gamma `#1fc9a4`/`#8fd23a`, Delta `#c6e04a`, Omicron `#a8ff3c`) | **Viruses only** |
| Grey-white `#e6e8ee` | Boss and cell bodies |
| Pink `#ff4fa3` to violet `#b45cff`, with white cores and `#16030c` outlines | **Enemy bullets and telegraphs only** |
| Ice-cyan `#7fe8ff` / white | Player, needles, antibodies, soap rim |
| Amber/gold `#ffc65a` | Pickups and medals |

- The player's fluid moves from phosphor green to cyan, so nothing the player owns is green.
- The off-field LED score may keep its phosphor green: it belongs to the instrument, not the board.

### 4.3 Taste rules (non-negotiable)

- **Variant names use WHO Greek letters only.** They were introduced in 2021 to replace stigmatizing place-based names ([Al Jazeera](https://www.aljazeera.com/amp/news/2021/5/31/who-renames-covid-19-variants-with-greek-letters-to-avoid-stigma)). Never use places, flags or nationalities.
- No sick people, deaths, coffins, hospital beds, ventilators or politics (anti-vax jokes, lockdown debates). The world is the inside of a body and a lab dish.
- The science stays roughly true and pro-health:
  - you fire antibodies and mRNA
  - soap really does break the coronavirus's lipid envelope and uproot its spikes ([WEF chemist explainer](https://weforum.org/agenda/2020/03/coronavirus-soap-covid-19-virus-hygiene), [Engineering.com](https://www.engineering.com/story/a-history-of-violencehow-soap-attacks-a-coronavirus))
  - so the bomb is SOAP
- The tone is slapstick microbiology, not gore. Medical illustrators argue over "beauty shot" versus "gross" ([BMJ blog](https://blogs.bmj.com/covid-19/2020/04/22/make-covid-19-visuals-gross/)); we pick neither, and go cute-menacing.
- **Distribution caveat:** in 2020 Apple rejected coronavirus *apps* from non-health organizations ([CNBC](https://www.cnbc.com/2020/03/05/apple-rejects-coronavirus-apps-that-arent-from-health-organizations.html)). itch.io is fine. Re-check this before any app-store port.

### 4.4 Naming glossary

| Old | New |
| --- | --- |
| Spore | **WILD TYPE** |
| Armored | **HEAVY CROWN** |
| Dart | **RNA WORM** |
| Splitter | **BUDDER** |
| Daughter / culture flier | **VIRION** |
| Diver | **DROPLET** |
| Burster | **INFECTED CELL** |
| Infector | **HIJACKER** |
| Capsid | **BLOOM** |
| Courier | **VESICLE** |
| DELTA 1-4 | **ALPHA** at 1-4 (DELTA moves to 3-4) |
| ECHO | Its P3 twin mechanic goes to **BETA & GAMMA** (2-4); its P1/P2 become midboss **LAMBDA** (4-2) |
| OMEGA PRIME | **OMICRON PRIME** |
| Sector | **SAMPLE** |
| Shield | **SOAP** |
| Capsules | **SUPPLIES** |
| Boss spell | **MUTATION** card (a captured card is **NEUTRALIZED**) |

## 5. Bullets, patterns and enemies

### 5.1 Bullet families

**Shape before color.** Hit radius is about 62% of the visual radius, which favors the player.

| Family | Shape | Visual / hit radius (u) | Speed (u/s) | Color | Used by |
| --- | --- | --- | --- | --- | --- |
| **DROPLET** | Teardrop stretched 2.2× along its velocity | 0.26 / 0.16 | 4–9 | Pink core | WILD TYPE coughs, SNEEZER |
| **AEROSOL** | Small round dot that decelerates to 60% over 1 s | 0.17 / 0.11 | 2.5–4.5 | Pale pink | AEROSOL PUFF, storms |
| **SPIKE** | Club or "lollipop" (stem plus head), oriented along its velocity; hit on the head | 0.24 / 0.15 | 7–10 | Magenta | HEAVY CROWN, BLOOM, OMICRON |
| **RNA BEAD** | Beads joined by a thin harmless strand, travelling on a sine | 0.20 / 0.13 | 4–6 | Violet | RNA WORM, BETA & GAMMA |
| **VIRION** | Tiny 8-spike crown (the original sprite), slowly spinning; **shootable** (1 HP), with a green crown ring meaning "you can shoot this" | 0.32 / 0.20 | 2.5–4 | Pink body, green ring | BUDDER, MOTHER CELL |
| **GLOB** | Big wobbling mucus ball | 0.60 / 0.45 | 2–3.5 | Violet-pink | Walls, DELTA |
| **SNEEZE JET** | Lane beam, wedge-shaped at the mouth | width 1.6–2.4 | — | Pink | Bosses (today's lane beam) |

Player needles are thin, cyan-white, about 55% opaque and drawn *under* enemy bullets.

### 5.2 Pattern families

Each family below is an emitter preset. Numbers are for Normal.

| # | Family | Spec | Teaches |
| --- | --- | --- | --- |
| 1 | COUGH (aimed stack) | 1–3 droplets on one line, aim locked at telegraph start, 6–9 u/s | Tap-dodge (≥ 0.6 u sidestep) |
| 2 | SNEEZE (odd fan, stacked) | n = 7–11 over 50–70°, 2–3 speed tiers (4/5.5/7) | Sidestep out of a trap |
| 3 | SNIFFLE (even fan) | n = 6–10; the player sits in the central gap | Hold still in focus |
| 4 | CORONA RING | 12–24 bullets, 3.5–5 u/s, every 0.8–1.5 s, alternating half-angle offset | Micro-dodge between rings |
| 5 | SPIKE BLOOM (spiral) | 6–12 per emit, every 0.2–0.4 s, rotating 7–13° per emit (never a divisor of 360) | Circle and drift |
| 6 | DRIP (aimed stream) | 6–12 bullets 0.08 s apart, each re-aimed, 7–9 u/s | Streaming: move steadily, turn at the edge |
| 7 | MUCUS WALL | A full-width line of globs or mist with 1–2 gaps ≥ 2.0 u (Easy 2.8), 3–4 u/s; the gap is marked on the floor 0.8 s ahead | Macro-dodge to the gap |
| 8 | AEROSOL SPRAY | Seeded random angles in a 120° cone, 2.5–4.5 u/s, ≤ 8 bullets/s per emitter | Controlled micro-dodging |
| 9 | SNEEZE JET | Lane beam: telegraph 1.0 s, live 0.5 s, then a punish window | Read the lane |
| 10 | RNA STRAND | Bead chains on a sine: amplitude 1.2 u, wavelength 4 u, 5 u/s | Weave |
| 11 | REPLICATION | A bullet flashes for 0.3 s, then splits in two at ±25°; at most 3 generations; 3–4 u/s | Anticipation |
| 12 | QUARANTINE BOX | Set piece: a cyan 7×7 u frame confines the ship (soft walls, no damage) while bullets enter it, as in Undertale's bullet box | Confined micro-dodge |

**Fairness invariants (tested):**

- Telegraphs last at least:
  - 0.5 s for a small aimed shot (an enemy glow)
  - 0.8 s for fans and sneezes (the inhale)
  - 1.0 s for walls and beams
  - 1.5 s at a card start, which also cancels bullets and slides in the name tape
- At most 2 families overlap on Normal and 1 on Easy, and never two aimed families together.
- Bosses move at most 3 u/s during a card.
- Bullets never enter from the bottom or side edges.

### 5.3 Enemy roster

Each enemy has one job, one bullet family and one personality telegraph. HP is on the new scale (§6: about 24 effective DPS).

| Enemy | Silhouette | Role and behavior | Pattern | HP | Debut |
| --- | --- | --- | --- | --- | --- |
| WILD TYPE | The original crown in 3D, green | Popcorn in formation; spikes bristle 0.5 s before firing | COUGH ×1–3 | 3 (mini 1) | 1-1 |
| **SNEEZER** (new signature) | Puffy crown with soft spikes | Inhales, swelling 1.25× with an "ah… ah…" cue for 0.8 s, then sneezes ("CHOO") | SNEEZE | 10 | 1-2 |
| BUDDER | Two-lobed crown with a seam | On death, buds 2 VIRION bullets that drift and can be shot | — / VIRION | 8 | 1-3 |
| RNA WORM | Helix ribbon tube | Weaves fast across the top, leaving a bead trail that hangs for 1.5 s | RNA STRAND, DRIP | 4 | 2-1 |
| AEROSOL PUFF (new) | Ring outline of tiny virions (outlined, never fog) | Drifts slowly and puffs mist | AEROSOL SPRAY | 10 | 2-2 |
| DROPLET | Teardrop with a virus inside | Draws its dashed sneeze path for 0.8 s, dives, and splashes into a 6-ring (Normal) at the end | CORONA RING (small) | 4 | 3-1 |
| HIJACKER | Crown with a long RNA proboscis | Tethers a WILD TYPE for 1.5 s, turning it into a HEAVY CROWN; kill it first for CURED +300 | — | 6 | 3-2 |
| INFECTED CELL | Swollen pale host cell with virions visible inside | Pops with a 2.2 u radius that damages **viruses only** and chains | — | 6 | 3-2 |
| HEAVY CROWN | Fat amber-tipped spikes **that break off as it loses HP** (visible HP) | Elite | SPIKE stack ×3 | 14 | 3-3 |
| BLOOM | Spike petals closed into a bud | Invulnerable while closed; opens for 1.5 s, firing, while vulnerable | SPIKE BLOOM ring | 16 | 4-1 |
| VESICLE | Lipid bubble with a pickup inside | Drifts across the back; never fires | — | 20 | 1-2 |

**Stage skeleton (keeps the "Invaders" identity):**

- A formation grid enters and **never descends past z = −4** (it stays at z ≤ −4). The instant breach loss is retired, because a bullet hell should not be lost to a clock.
- It fires as a **choir**: every 1.2–2.0 s, 2–4 front-row members fire their family together, synced to the existing 4-note pulse, which speeds up as the grid thins.
- Between grids, path flights cross and exit, and midbosses arrive.
- **Membranes are retired.** Static bunkers fight 2D dodging.

## 6. The player's kit

| System | Spec |
| --- | --- |
| **Fire** | Automatic, 8 volleys/s. **SPRAY** (unfocused): 3 needles at ±9°, or 5 at power 3+. **NEEDLE** (focus): 3–5 parallel needles 0.22–0.28 u apart. 1 damage each, 34 u/s |
| **Power (mRNA)** | Levels 1–4. Level 2 adds 2 Y-shaped **antibodies** and level 4 adds 4 in total. Each fires 4 needles/s; in focus they tuck in to ±0.6 u. Reference DPS at level 2, focused: 32 (about 24 effective). A death costs 1 level and drops a catchable mRNA strand for 4 s, so there is no Gradius syndrome |
| **SOAP burst** | Stock of 2 per vial (refilled to 2 on respawn), capped at 5. A bubble ring grows to 15 u in 0.6 s. Bullets it touches become **antigen** tokens (+20 × chain each, auto-collected). It deals 12 damage to enemies, which kills popcorn, and 3% of a boss card's HP. It voids that card's capture and gives 2.0 s of invulnerability. The **deathbomb** window is 0.18 s |
| **Graze** | +10 points and +1 to the graze counter. Every 100 grazes gives +1 SOAP |
| **Dose Chain** (kept) | Window 1.6 → 2.0 s; tiers ×2–×6; damage resets it; SOAP does not |
| **Supplies** (round amber items, 3.5 u magnet) | **mRNA** (+1 power; guaranteed from VESICLEs and midbosses). **BOOSTER** vial (8 s at ×1.5 damage). **MASK** (10 s frontal 120° arc that absorbs droplet, aerosol and spike bullets, but not beams or globs). **SOAP** (+1). **VIAL** (+1 life; from score extends at 250k and 750k only). Random drops (booster, mask, soap) on 3% of eligible kills with a 12 s cooldown, keeping the user's "rare random" request |
| **Hit** | Lose a vial, cancel all bullets, 0.5 s respawn, 2.5 s invulnerability |

## 7. Campaign

### 7.1 Worlds: the infection route in four rooms

| World | Backdrop (midtone, no pink, no bullet-sized marks) | World twist | Boss |
| --- | --- | --- | --- |
| W1 AIRWAY | Slate-teal trachea with slow cilia rows and a mucus sheen | — (learn the kit) | ALPHA |
| W2 LUNGS | Alveoli as cool blue-grey glass grape clusters, in a microscope or CT tint | **BREATH:** every 6 s the alveoli swell (1 s warning plus an audio inhale). Bullets slow to ×0.6 on the inhale and speed to ×1.3 on the exhale. This is the rhythm twist | BETA & GAMMA |
| W3 BLOODSTREAM | Today's teal glass over drifting desaturated red cells | **CURRENT:** bullets drift sideways at 0.8 u/s in the direction the cells flow. It flips at 30 s with a 2 s warning | DELTA |
| W4 LAB / PETRI | Amber agar with colonies and a syringe rack on the rim | **MUTATION:** enemies flash and shift hue, then upgrade their pattern one tier (for example COUGH ×1 → ×3) | OMICRON PRIME |

### 7.2 Stages

18 stages, each 60–90 s of non-boss play; boss stages run 90–150 s.

| Stage | Name | Content |
| --- | --- | --- |
| 1-1 | FIRST CONTACT | The original 4×15 mini grid, then WILD TYPE coughs. Teaches 2D movement. Peak about 25 bullets |
| 1-2 | GESUNDHEIT | SNEEZER alone, then mixed; first VESICLE. Teaches focus |
| 1-3 | BUDDING | BUDDER and shootable virions; midboss **BIG SNEEZER** (one card, "ACHOO!") |
| 1-4 | ALPHA | Boss |
| B1 | CULTURE CHECK | Harmless VIRION flights on drawn paths (kept) |
| 2-1 | GAS EXCHANGE | RNA WORM debut. Teaches streaming |
| 2-2 | AEROSOL | AEROSOL PUFF debut; midboss **AEROSOL CLOUD** |
| 2-3 | DEEP BREATH | BREATH twist with everything so far |
| 2-4 | BETA & GAMMA | Boss |
| 3-1 | CIRCULATION | CURRENT twist; DROPLET debut |
| 3-2 | HIJACK | HIJACKER and INFECTED CELL chains; midboss **MOTHER CELL** (BUDDING → LYSIS → CELL BURST) |
| 3-3 | VARIANT SURGE | HEAVY CROWN debut, with CURRENT |
| 3-4 | DELTA | Boss |
| B2 | SWAB TEST | Harmless BLOOM preview: shoot only open buds |
| 4-1 | AGAR | BLOOM fields |
| 4-2 | MUTATION | MUTATION twist; midboss **LAMBDA** (reuses ECHO's track and mirror code) |
| 4-3 | OUTBREAK | Dense mix with many exiting flights; R0 is the goal (§8) |
| 4-4 | OMICRON PRIME | Final boss |

Every archetype still debuts in a group of its own with plain WILD TYPE, as today's test already enforces.

### 7.3 Bosses and mutation cards

TTK is the target time-to-kill on Normal at 24 effective DPS, so **card HP = TTK × 24**. Each card has a timeout; when it runs out, the boss moves on and no NEUTRALIZED bonus is given. Normal phases time out at 30 s and cards at 40 s.

| Boss | Gimmick | Phases → cards (TTK in s) |
| --- | --- | --- |
| **ALPHA** (W1) | The tutorial boss: eyes narrow before each card | **COUGH COUGH** (normal phase, 18): a 3-way aimed fan at ±14°, 7 u/s, every 0.8 s, plus a 12-ring at 3.5 u/s every 2 s → **FIRST SNEEZE** (22): 1.0 s inhale with a wedge outline on the floor, a 60° odd fan of 9 × 3 speeds, 4 per cycle, 1.6 s rest → **SPIKE BLOOM** (22): 10 spikes every 0.3 s, +11° per emit, 4.2 u/s → **CORONA** (18): alternating offset 20-rings every 1.1 s plus a COUGH every 2.2 s |
| **BETA & GAMMA** (W2) | Twins share one pool; ECHO's twin-nucleus rule | **PING-PONG** (18): alternating DRIP streams → **CROSS INFECTION** (24): fans from opposite corners form a lattice of diamond gaps ≥ 1.6 u → **MIRROR STRAIN** (24): one twin mirrors your x, the other tracks it, and only the glowing nucleus takes damage → **DOUBLE HELIX** (20): the twins orbit each other, firing two interleaved RNA STRANDs |
| **DELTA** (W3) | A Δ seam. It really splits (today's code) | **TRIANGULATE** (18) → **LANE SNEEZE** (22): today's lane beam from its own column plus fans → split: **HALVES** (24) → **BLOOD RUSH** (24): the CURRENT doubles and alternates, with GLOB walls whose gaps drift → **Δ CASCADE** (20): REPLICATION triangles |
| **OMICRON PRIME** (W4, finale) | Its "mutations" are its phases; heavily mutated spike crown | **SPIKE CROWN** (35): four spike nodes, destroyed in the player's chosen order (today's Omega rule) → **SNEEZE STORM** (25): a seeded AEROSOL storm with density lanes marked → **MUTATION SPIRAL** (25): a double spiral that reverses every 2.4 s, with a 0.5 s eye and hue telegraph → **QUARANTINE** (survive 15 s; damage is optional) → **CORONA FLARE** (20): today's two-gap ring → last card **R0 > 1** (25): REPLICATION 1→2→4, slow. When neutralized: "R0 < 1 · CONTAINED" |

Midbosses use 1–2 cards at a TTK of 20–40 s.

**Kept from today:** telegraph → attack → punish, phase floors, the 120 ms phase-break hitstop, and the bullet cancel.

### 7.4 Difficulty and density

| | Easy | Normal |
| --- | --- | --- |
| Bullet count per emitter | ×0.6 | ×1 |
| Bullet speed | ×0.85 | ×1 |
| Telegraphs | +0.15 s | Base |
| Vials / SOAP per vial | 5 / 3 | 3 / 2 |
| Auto-bomb on hit | On (uses 1 SOAP) | Off (option) |
| Deathbomb window | 0.35 s | 0.18 s |
| Enemy HP | ×0.85 | ×1 |
| Overlapping families | 1 | 2 |
| NEUTRALIZED bonus | ×0.5 | ×1 |

Peak bullets on screen (Normal, stage / boss). Easy is ×0.6.

| | W1 | W2 | W3 | W4 |
| --- | --- | --- | --- | --- |
| Peak bullets (stage / boss) | 45 / 90 | 70 / 120 | 95 / 150 | 120 / 200 |
| Speed range | 3.5–7 | 3–8 | 3–9 | 3–10 |

Hard is deliberately not built yet.

## 8. Score, R0, medals, continues and practice

- **Score:**
  - kill base × chain
  - graze +10
  - antigen tokens +20 × chain
  - NEUTRALIZED: card index × 10,000 × world
  - sample clear: 1000 × world, plus the R0 bonus
- **R0 meter:**
  - R0 = 3 × (escaped viruses ÷ spawned viruses)
  - Only flights and divers can escape; the formation never does.
  - It is shown as an analog dial from 0 to 3 with a red zone above 1.
  - **R0 bonus** = (1 − min(R0, 1)) × 5000 × world.
  - It replaces the bot-derived par as the skill goal, and quietly teaches that R0 below 1 means an outbreak shrinks.
- **Medals:** Gold = no vial lost and R0 < 1. Silver = at most 1 vial lost. Bronze = a clear. The "A" assist marker stays.
- **Lives and continues:**
  - A death respawns you in place, so death to play takes about 0.5 s.
  - Game over → CONTAINMENT LOST → one press restarts the sample at its entry state, in about 2 s or less (today's checkpoint system).
  - After 3 failures, offer **+1 VIAL** *or* **"switch this sample to Easy"**.
- **Practice:** the SPECIMEN TRAY gains PRACTICE for any cleared sample and a **MUTATION LAB** for any card already seen. Practice has 1 life, R restarts in ≤ 0.5 s, and best captures are shown.

## 9. UI/UX: keep the lab instrument and tie it to the theme

The cabinet-as-lab-instrument fits; it needs side panels and themed readouts.

| Zone | Content |
| --- | --- |
| Left panel (landscape) | **DOSES:** vials with cyan fluid. **SOAP:** bubble icons plus a thin progress ring toward the next graze SOAP. **mRNA:** a 4-segment helix plus antibody icons |
| Right panel | LED **SCORE** and **HI**. **GRAZE** as a small LED. **R0** dial. **CHAIN ×N** |
| Top band | **VIRAL LOAD** bar (kept) with ◆ pips for remaining cards. A card tape such as "MUTATION 2/4 · SNEEZE STORM" with a 7-segment timer. **NEUTRALIZED +30000** or **FAILED** when the card ends |
| On the board | In focus: a white core dot with a dark rim, a faint cyan 1.0 u graze ring, and graze sparks. On touch the dot is always visible. Chain ×N floats by the syringe |
| Portrait | A 44 px strip: vials · score · SOAP. A mini R0 and graze line below it. The SOAP button sits bottom-right |

**Screen-shake rule:** shake only on phase breaks, bombs and deaths, never while a pattern is live, with an offset of at most 0.08 u. A shaking board breaks dodging.

**Index page:** plain green, with only the centered game. No change.

## 10. Implementation notes and tests

**Model:**

- `ship.z`, plus input `{axisX, axisZ, focus, bomb, dragDX, dragDZ}`.
- `RULES.shipRadius` → 0.16; add `grazeRadius` 1.0.
- An emitter module turns pattern presets into bullets `{x, z, vx, vz, ax, az, family, vis, hit, src, grazed, cancelable, shootable, splitAt}`, using the seeded RNG.
- Raise the bullet cap from 120 to 600.

**Render:**

- One `InstancedMesh` per family: camera-facing quads with canvas-drawn shapes.
- `renderOrder` last, `depthTest: false`, `toneMapped: false`.
- Velocity-aligned stretch for DROPLET and SPIKE.

**Autopilot:** the 1D controller cannot dodge danmaku. Write a 2D sampler:

- each 1/30 s, test 9 directions × {normal, focus} over a 0.35 s look-ahead
- pick the lowest-risk move
- use the 150 ms-lag reactive variant for the curve test

**Tests:**

- Every card is dodgeable without SOAP by a focus-speed player reacting 0.25 s late, from 5 starts.
- Gap widths ≥ 2.0 u on Normal and 2.8 u on Easy.
- Spawn exclusion.
- Peak bullet counts per difficulty.
- Telegraph minimums.
- Graze counted once per bullet.
- Deathbomb window.
- Power −1 on death.
- R0 math.
- Card timeouts.
- Every bullet carries a family and source label (fixes the "undefined shot" card).
- Browser tests at 960×640 and 320 px: a WebGL screenshot of every family, hitbox ≥ 6 px, and 600 bullets at ≥ 55 fps on SwiftShader as the regression floor.

**Milestones:**

- **M1:** movement, focus, hitbox, graze, SOAP, emitter, bullet renderer, camera, the full retheme of all meshes and names, W1 with ALPHA, and Easy/Normal. Then a playtest.
- **M2:** W2 and W3 with their twists and bosses.
- **M3:** W4, OMICRON, B2, practice and the MUTATION LAB.

## 11. Risks and open questions

- **Scope:** 18 stages is the target, but M1 must feel like a bullet hell before M2 starts.
- **Perspective and readability:** if the ratio-1.35 camera still distorts, increase pitch before reaching for an orthographic camera. The perspective scene is a project constraint.
- **BREATH and CURRENT twists:** these change bullet motion globally. Prototype both behind flags and keep them only if the reactive bot and a human can read them.
- **Fire-rate perception:** 8 volleys/s with thin needles should feel calm. Check it against the user's earlier lower-fire-rate request.
- **Faces on bosses:** recommended for personality. Popcorn stays faceless to honor the sprite. *(Superseded 2026-11-10 by the user's feedback; see §12.)*

## 12. Juicy SFX and villain personality (added 2026-11-10)

**The user's feedback (translated):** "About Corona Invaders: the gameplay is cool, the SFX are really lame and need to improve; the sounds lack juice. The villains could have a bit more personality. The theme is great, but it is very generic and needs a bit more personality." Gameplay, patterns, speeds, campaign and every collider stay as they are.

### 12.1 What was wrong with the sound (measured)

`tests/browser/audio-measure.mjs` rendered the previous `audio.mjs` (commit 061c348) offline on 55 game events:

- **Too quiet and flat.** Peaks sat between −46 and −26 dBFS, so a popcorn kill (−35 dBFS) was barely louder than a needle hit (−43 dBFS). There was no hierarchy.
- **One layer each.** Every sound was one oscillator with a pitch slide: no transient, no low end and no tail. Repeats were identical apart from the chain-tier pitch.
- **Clicks.** 28 of 40 single sounds started at full gain in 0 ms. Gains also held their default value of 1 before the first envelope event, which let single-sample spikes through (one measured at −13 dBFS).
- **Gaps.** 12 events made no sound at all: respawn, power-up, cough wind-up, droplet dive and splash, boss entrances, phase change, card time-out, boss and midboss defeats, campaign won.
- **No space or mix.** There was no stereo, no ducking, no voice cap and no limiter.

### 12.2 Game-feel audio principles and what we built

| Principle | Source | In the game |
| --- | --- | --- |
| Feedback should be layered and exaggerated, and every action needs a response, weight on impacts and a pause on big events | Jan Willem Nijman (Vlambeer), *The Art of Screenshake*, INDIGO Classes 2013 ([summary](https://www.gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games)); Jonasson & Purho, *Juice It or Lose It* ([GDC Vault](https://gdcvault.com/play/1016487/contactUs)) | Kills are a click, a bubble pop, a size-scaled thump and a sparkle. Boss deaths escalate into a boom timed with the visual burst. Big events duck the bed |
| Effects are stacks of many short layers that players can pick apart (Turner says he wants players to "figure out the layers") | Joonas Turner on Nuclear Throne's SFX ([his Steam forum post](https://steamcommunity.com/app/242680/discussions/0/615086038680148561), [Cliqist interview](https://cliqist.com/2018/02/08/eurogame-roadtrip-interview-nuclear-throne-sound-maestro-joonas-turner/), [GDC Europe 2015 primer](https://gamedeveloper.com/audio/video-how-great-sound-design-can-make-your-game-feel-better)) | 1–10 ms transients, pitched bodies of 30–90 ms, and tails only where size matters |
| A clear mix with an importance system: the sounds that matter to play win; the constant ones stay low | Lawlor & Neumann, *Overwatch: The Elusive Goal, Play by Sound*, GDC 2016 ([GDC Vault](https://gdcvault.com/play/1023010/contactUs), [PC Gamer](https://pcgamer.com/how-overwatch-uses-sound-to-pinpoint-threats-you-cant-see)) | Auto-fire is the quietest and softest sound: −35 dBFS with a 4 ms attack. A voice cap drops low-priority sounds first, and the core-hit crack cuts through everything |
| Audio as varied and unpredictable as the runs themselves; a gun game fires constantly, so repetition is the enemy | Enter the Gungeon's audio, Doseone with sound designer Erica Hampson ([Kotaku](https://kotaku.com/enter-the-gungeons-composer-talks-rap-video-game-music-1832497420)) | Pitch, band and noise offsets change on every play |
| Danmaku convention: the graze is its own scoring tick, and the hit is unmistakable, with a short deathbomb window | Touhou graze and deathbomb ([Embodiment of Scarlet Devil](https://en.wikipedia.org/wiki/Embodiment_of_Scarlet_Devil)) | A distinct high "tsk" that climbs a semitone per consecutive graze. A glassy crack on the hit says "SOAP now", then the vial-lost sting |
| Speech-like babble gives characters voices without words | Animal Crossing's Animalese ([Nookipedia](https://nookipedia.com/wiki/Animalese)) | Formant syllables per character. Bosses babble their lines with vowels taken from the text |
| Loudness, not peak, is what the ear compares | ITU-R BS.1770 ([ITU](https://www.itu.int/rec/R-REC-BS.1770)) | Measured as K-weighted momentary loudness (LUFS-M) alongside sample peak |

### 12.3 Villain personality: principles and constraints

| Principle | Source | In the game |
| --- | --- | --- |
| Squash and stretch, anticipation, secondary action and appeal make a drawing a character | Thomas & Johnston's twelve principles ([overview](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)) | Bodies breathe, rear up before an attack, flinch on hits and pop on death. Crowns sway and twitch as secondary action. Every virus gets a readable face |
| Boss mechanics come first and the animation serves them; motion stays consistent so players can react | Studio MDHR on Cuphead bosses ([Game Developer](https://gamedeveloper.com/business/road-to-the-igf-studio-mdhr-s-i-cuphead-i-), [Game Informer](https://gameinformer.com/feature/2022/12/27/how-studio-mdhr-builds-a-cuphead-boss)) | No pattern, speed or timing changed. Expressions follow the telegraphs that already exist (eyes narrow, an "o" before a cough, the sneeze inhale) |
| A boss is introduced by name and shows character between attacks | Spell-card declarations (§2); [Undertale battle deep dive](https://www.gamedeveloper.com/design/game-design-deep-dive-i-undertale-i-s-action-based-rpg-battles) | A name card with a one-line personality. Each card start brings a taunt bubble, which is safe because the card start cancels every bullet; gloats and a defeat line follow |
| Each enemy needs a distinct identity from silhouette, colour, motion and sound together | §5.3 (one job, one family, one telegraph) | A personality per type (table in the README): the grunt, the choir, the drama queen, the show-off, the sneak, the airhead, the daredevil, the schemer, the victim, the brute, the diva, the coward, the courier, plus a personality for each boss |

**Bullet-hell constraints (all tested):**

- **Colliders.** No collider changes: a snapshot test covers them.
- **Footprint.** No body is drawn wider than its collider. Motion is squash, stretch and tilt around the board-plane centre, normalised to the collider footprint. The old sneeze swell (1.25×) and hit punch (1.14×) were removed for this reason.
- **Faces.** Faces sit inside their silhouettes, below every bullet, in virus greens and dark ink only.
- **Text.** Speech appears only right after bullets were cancelled.

This revises the earlier "popcorn stays faceless" call (§4.1, §11): the user asked for personality, and a face is the cheapest strong carrier of it. The VESICLE stays faceless so its supply icon reads first.

### 12.4 Results

- **README "Sound"** has the before/after table: peak, LUFS-M, attack and length.
- **Busy mix.** It peaked at −24.1 dBFS before and −4.4 dBFS after, with 0 samples at or above 0.99.
- **README "Villains with personality"** has the footprint, face and frame-time numbers. The drawn footprint stays at 91.6–100.0% of the collider, the worst face is 0.29 px inside its silhouette, and SwiftShader frame medians are 16.7 ms before and after.

### 12.5 Second round: away from cartoon (2026-11-10, later the same day)

**The user's feedback (translated):** "Regular viruses don't need little faces. For the bosses it's okay as long as they have some personality. And make it more 3D: you're pulling the style toward cartoon again. I don't want a cartoon style, I want 3D."

**What changed:**

- **Faces.** The face decals, speech bubbles, popcorn voice blips and boss babble are gone.
- **Regular viruses** keep only 3D form and motion.
- **Bosses** carry menace as geometry: slanted almond sockets sunk into the membrane, with glowing slit cores whose light follows the mood. This keeps the "eyes narrow before an attack" telegraph as light instead of drawn lids. Bosses growl their lines, and the lines type into the HUD.
- **Materials** move toward an electron-microscopy render: a membrane bump, a fresnel rim, glossier surfaces and a lit grey boss sphere.

**What did not change:** the steep camera (pitch 64–74°, which keeps bullets readable; revision three's low angle had more depth but distorted the play field, §3.3), the palette meanings, the colliders and the gameplay.

**Rule kept:** detail is spent where it can be afforded. Denser popcorn geometry halved the 60-virus choir's frame rate on SwiftShader, so only bosses got it.

## Sources

Read directly: [Boghog's bullet hell 101](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101) · [Sparen DDSG A3](https://sparen.github.io/ph3tutorials/ddsga3.html) · [Sparen DDSG A4](https://sparen.github.io/ph3tutorials/ddsga4.html) · [shmups.wiki Touhou](https://shmups.wiki/library/Unknwn/Touhou) · [The 1-pixel collision box](https://significant-bits.com/the-1-pixel-collision-box) · [Nomad's design sins](https://nomadsreviews.co.uk/post/design-sins-and-pet-peeves-in-shoot-em-ups) · [Undertale battle deep dive](https://www.gamedeveloper.com/design/game-design-deep-dive-i-undertale-i-s-action-based-rpg-battles) · [Nex Machina design](https://www.gamedeveloper.com/design/how-housemarque-designed-the-vibrant-bullet-hell-scape-of-i-nex-machina-i-) · Wikipedia: [Ikaruga](https://en.wikipedia.org/wiki/Ikaruga), [Mushihimesama](https://en.wikipedia.org/wiki/Mushihimesama), [Enter the Gungeon](https://en.wikipedia.org/wiki/Enter_the_Gungeon) · [BMJ blog on COVID visuals](https://blogs.bmj.com/covid-19/2020/04/22/make-covid-19-visuals-gross/).

Search summaries (fan wikis, reviews and press; treat details as approximate): [Jamestown](https://shmups.wiki/library/Jamestown) · [Crimzon Clover](https://shmups.wiki/library/Crimzon_Clover) · [Danmaku Unlimited 3](https://shmups.wiki/library/Danmaku_Unlimited_3) · [DoDonPachi DaiOuJou](https://shmups.wiki/library/DoDonPachi_3) · [ESP Ra.De.](https://shmups.wiki/library/ESP_Ra.De.) · [Radiant Silvergun](https://shmups.wiki/library/Radiant_Silvergun) · [Galaga Legions](https://en.wikipedia.org/wiki/Galaga_Legions) · [Imperishable Night](https://en.wikipedia.org/wiki/Imperishable_Night) · [Tyrian](https://en.wikipedia.org/wiki/Tyrian_(video_game)) · [Just Shapes & Beats at GDC](https://shacknews.com/article/104019/just-shapes--beats-hands-on-at-gdc-2018) · [Bullet heaven tag](https://pcgamer.com/gaming-industry/its-official-steam-decrees-bullet-heaven-the-name-of-the-vampire-survivors-genre) · [Nex Machina, Engadget](https://www.engadget.com/2016-12-03-nex-machina-housemarque-resogun-sequel-interview-preview.html) · [CDC illustration, UGA](https://news.uga.edu/alissa-eckert-and-dan-higgins-visualizing-a-virus) · [Wallpaper](https://www.wallpaper.com/design/design-emergency-alissa-eckert-designs-covid-19-illustration) · [WHO Greek letters](https://www.aljazeera.com/amp/news/2021/5/31/who-renames-covid-19-variants-with-greek-letters-to-avoid-stigma) · [Soap and envelopes (WEF)](https://weforum.org/agenda/2020/03/coronavirus-soap-covid-19-virus-hygiene) · [Engineering.com](https://www.engineering.com/story/a-history-of-violencehow-soap-attacks-a-coronavirus) · [Apple COVID app rule (CNBC)](https://www.cnbc.com/2020/03/05/apple-rejects-coronavirus-apps-that-arent-from-health-organizations.html).

§12 sources (2026-11-10, from search summaries; treat details as approximate): Nijman's *Art of Screenshake* ([Game Developer](https://www.gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games)) · *Juice It or Lose It* ([GDC Vault](https://gdcvault.com/play/1016487/contactUs)) · Joonas Turner ([Cliqist](https://cliqist.com/2018/02/08/eurogame-roadtrip-interview-nuclear-throne-sound-maestro-joonas-turner/), [Game Developer](https://www.gamedeveloper.com/business/meet-joonas-turner-vlambeer-s-sound-guy), [GDC Europe 2015](https://gamedeveloper.com/audio/video-how-great-sound-design-can-make-your-game-feel-better)) · Overwatch *Play by Sound* ([GDC Vault](https://gdcvault.com/play/1023010/contactUs), [PC Gamer](https://pcgamer.com/how-overwatch-uses-sound-to-pinpoint-threats-you-cant-see)) · Enter the Gungeon audio ([Kotaku](https://kotaku.com/enter-the-gungeons-composer-talks-rap-video-game-music-1832497420)) · [Embodiment of Scarlet Devil](https://en.wikipedia.org/wiki/Embodiment_of_Scarlet_Devil) · [Animalese](https://nookipedia.com/wiki/Animalese) · [ITU-R BS.1770](https://www.itu.int/rec/R-REC-BS.1770) · [Twelve principles of animation](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation) · Cuphead bosses ([Game Developer](https://gamedeveloper.com/business/road-to-the-igf-studio-mdhr-s-i-cuphead-i-), [Game Informer](https://gameinformer.com/feature/2022/12/27/how-studio-mdhr-builds-a-cuphead-boss)).

General references, not re-read this round: [Dr. Mario](https://en.wikipedia.org/wiki/Dr._Mario) and [Cells at Work!](https://en.wikipedia.org/wiki/Cells_at_Work!).

Local evidence:

- `render.mjs` mesh builders and `PALETTE`
- `core.mjs` `RULES`
- `enemies.mjs` fire clock
- `levels.mjs`
- `camera.mjs`
- `common/artifacts/revision-4/corona-*.png`
- the original sprites in `refs/canvas-retro-arcade/src/img/`
