# Corona Invaders v1.0: campaign, technique and personality brief

Prepared 2026-11-10 by the lead game designer and level designer for the dev squad. This brief contains decisions only; no code, test or asset was changed. It answers the owner's latest feedback (Portuguese, translated):

> "For Corona Invaders: review every level and develop a level suite that makes sense. Study bullet-hell game design techniques so they can be implemented. I don't like how long the player's syringe is; the hitbox gets confusing. Give the game more personality."

The owner also proposed a **roguelike card draft**: after each stage, draw 3 cards and keep 1, each a syringe modification. Another designer writes that system in parallel (`RESEARCH_CARDS.md`). This brief leaves room for it and talks to it only through the stated assumptions in §2.1. It designs no cards.

Standing constraints, all kept:

- the gameplay is good;
- the look is 3D, not cartoon: regular viruses have no faces, and bosses carry personality through 3D form and glow;
- every hitbox is very precise, so the drawn marker is the collider;
- the theme is a syringe against the coronavirus;
- a real WebGL perspective scene with one control scheme;
- the game runs alone from this folder and ships as an itch.io HTML ZIP.

Units follow `BALANCE.md`: world units (u) on the X/Z board, +Z toward the player, seconds and u/s. At 960×640 the board column draws about 22.5 px per u (the 0.4 u core is 9.0 px across).

## 0. The decisions in one page

1. **The run is 12 stages: 4 sectors × 3 stages** (two samples, then a boss), down from 18. A clean run on the reference player is about 15.6 min of play, or about 18 min with drafts and reports, so a web session lands at 15–25 min (§2.1). A draft follows stages 1–11, and the drafts after the three non-final bosses are boosted.
2. **Each stage introduces exactly one idea**, in four beats: introduce safely, develop, twist, test. Every sector's twist now runs through the whole sector, not just its last two stages. Six stages, three archetypes (HIJACKER, INFECTED CELL, popcorn BUDDER) and both bonus stages are cut or folded in (§2.4).
3. **Measurable ladders replace "it feels harder".** Peak and mean bullets, spawn rate, speed bands, the aimed/static/random mix, quiet time and near-core pressure all follow a sawtooth that rises within each sector, and the bosses rise strictly. The ladders are enforced by tests, together with the **FAIR-150** rule: the 150 ms reactive player dodges every stage and card without SOAP, and every hit it takes must be avoidable (§2.3).
4. **The syringe gets shorter: 1.64 u, down from 5.1 u** (about 37 px instead of 108 px at 960×640). The whole syringe now sits inside its 1.0 u graze ring, and the core is at the silhouette's centroid. Measured on today's campaign, bullets that visibly cross the drawn syringe without touching the core drop from **28.2 to 5.3 per minute (−81%)** (§4).
5. **The signature mechanic is INJECT.** Touching a virus with the needle tip cures it at once and cancels its bullets. A syringe's own verb becomes the genre's point-blank risk/reward, and the needle gets a job: the needle cures, and the glowing dose is what can be hurt (§3.10, §5.4).
6. **Personality is a zoom into the body under a lab instrument**: AIRWAY ×40 → LUNGS ×400 → BLOODSTREAM ×4 000 → THE CELL ×40 000. Each sector has its own 3D backdrop, light, motion and arrangement of the original march. Two voices carry the text: a calm lab-report voice for the UI and the viruses' growled taunts. Short FIELD NOTES sit between sectors (§5).

## 1. Audit of the current campaign (18 stages)

### 1.1 How it was measured

I measured with a scratch script outside the repository, on `main` at `9045f8f`. The script ran the real `update()` with `tests/reactive.mjs` (150 ms perception lag, 100 ms decisions, no SOAP, 99 vials so every stage runs to the end) on seeds 42, 1 and 7, plus `autopilot.mjs` on seed 42.

- "Aimed" is the share of spawned bullets whose emitter aimed at the syringe. The aimed presets are COUGH, DRIP, SNIFFLE, an unangled SNEEZE, REPLICATION, and STRAND or AEROSOL with `aimShip`.
- "Quiet" is the share of play time with at most 3 bullets alive.
- "Lull" is the longest stretch with no bullet spawned.
- "Lost" and "near" are BALANCE.md's 8-seed table: vials lost per sample, and bullets within 3 u of the core per 0.1 s sample.

The squad should commit this audit as `tests/suite-audit.mjs` (§7), so these numbers can be re-measured.

| Stage | Reactive / auto (s) | Peak | Mean alive | Spawn/s | Aimed | Speed v50 / v90 / max | Quiet | Lull (s) | Lost | Near |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1-1 FIRST CONTACT | 40 / 87 | 9 | 2.8 | 0.8 | 100% | 6.5 / 6.5 / 6.5 | 71% | 6.6 (quiet 11.6) | 0.00 | 0.22 |
| 1-2 GESUNDHEIT | 23 / 30 | 17 | 6.4 | 1.7 | 100% | 6.5 / 6.5 / 6.5 | 30% | 2.8 | 0.13 | 0.38 |
| 1-3 BUDDING | 32 / 32 | 44 | 15.1 | 4.2 | 100% | 5.5 / 6.5 / 6.5 | 35% | 5.6 | 0.38 | 0.80 |
| 1-4 ALPHA | 60 / 57 | 59 | 20.3 | 7.0 | 33% | 4.0 / 5.5 / 7.5 | 26% | 9.3 | 0.13 | 0.81 |
| B1 CULTURE CHECK | 20 / 20 | 0 | 0 | 0 | — | — | 100% | — | — | — |
| 2-1 GAS EXCHANGE | 28 / 29 | 70 | 24.3 | 5.7 | 100% | 6.1 / 7.0 / 7.0 | 8% | 4.5 | 0.00 | 0.60 |
| 2-2 AEROSOL | 38 / 40 | 56 | 22.5 | 5.4 | 56% | 4.5 / 7.0 / 7.0 | 14% | 5.3 | 0.13 | 0.57 |
| 2-3 DEEP BREATH | 26 / 28 | 62 | 22.2 | 4.7 | 100% | 5.9 / 7.0 / 7.0 | 10% | 6.0 | 0.13 | 0.70 |
| 2-4 BETA & GAMMA | 82 / 69 | 40 | 16.0 | 4.4 | 28% | 4.2 / 7.5 / 7.5 | 17% | 4.1 | 0.50 | 1.22 |
| 3-1 CIRCULATION | 33 / 34 | 85 | 26.7 | 7.1 | 99% | 6.8 / 7.5 / 7.5 | 11% | 4.1 | 0.38 | 1.29 |
| 3-2 HIJACK | 58 / 65 | 82 | 17.7 | 5.5 | 67% | 4.3 / 7.5 / 8.0 | 19% | 4.9 | 0.13 | 0.67 |
| 3-3 VARIANT SURGE | 32 / 36 | 88 | 20.9 | 5.8 | 100% | 6.7 / 7.5 / 8.0 | 17% | 6.6 | 0.13 | 0.89 |
| 3-4 DELTA | 106 / 94 | 33 | 14.1 | 3.6 | 41% | 4.0 / 6.0 / 7.0 | 17% | 5.7 | 0.25 | 0.80 |
| B2 SWAB TEST | 32 / 23 | 0 | 0 | 0 | — | — | 100% | — | — | — |
| 4-1 AGAR | 58 / 53 | 81 | 33.7 | 11.9 | 25% | 4.1 / 8.0 / 8.5 | 7% | 6.3 | 0.63 | 1.03 |
| 4-2 MUTATION | 61 / 60 | 37 | 18.2 | 6.2 | 35% | 4.2 / 7.6 / 8.5 | 16% | 5.2 | 0.25 | 0.72 |
| 4-3 OUTBREAK | 41 / 38 | 120 | 29.9 | 10.2 | 73% | 5.5 / 8.0 / 8.5 | 17% | 6.6 | 1.38 | 1.53 |
| 4-4 OMICRON PRIME | 112 / 108 | 139 | 32.1 | 10.8 | 16% | 4.6 / 7.2 / 8.0 | 17% | 4.6 | 0.50 | 1.55 |

The reactive player's 18 stages add up to 882 s (14.7 min) of pure play. 52 s of that is bonus stages with no bullets.

### 1.2 Per stage: what it teaches, and what is wrong

- **1-1 FIRST CONTACT** teaches 2D movement and the core.
  - It is the right lesson, but thin. Every bullet is an aimed 6.5 u/s cough, so the only verb is "sidestep". 71% of the stage is near-empty, with an 11.6 s quiet stretch.
  - The 60-mini homage grid takes the autopilot 87 s to clear while firing 0.8 bullets/s, so the pacing sags.
  - **Rework.**
- **1-2 GESUNDHEIT** teaches the SNEEZER and focus.
  - Its lesson barely happens: the reactive player clears it in 23 s, and only 12% of its bullets are sneezes.
  - The first VESICLE is here.
  - **Rework:** lengthen it and fold BIG SNEEZER in as its test.
- **1-3 BUDDING** teaches BUDDER virions, then midboss BIG SNEEZER.
  - The midboss is 79% of its bullets, so the BUDDER lesson drowns.
  - Lost 0.38 against ALPHA's 0.13: **the midboss stage is harder than the boss.**
  - **Cut.** BUDDER's virions live on in MOTHER CELL, and BIG SNEEZER moves to 1-2.
- **1-4 ALPHA** teaches cards, captures and timeouts.
  - It is also the first time any static pattern (ring, spiral) appears, so the exam teaches.
  - It has a 9.3 s gap with no bullets, around card intros.
  - **Keep as 1-3.** Teach static lanes earlier, in 1-1.
- **B1 CULTURE CHECK** is harmless aim practice: 20 s with no bullets, and auto-fire already aims.
  - **Cut from the run.** The draft is the new post-boss reward.
- **2-1 GAS EXCHANGE** teaches the RNA WORM.
  - The worm fires only 10% of the stage's bullets; the rest are choir coughs. Its peak also jumps from world 1's 45 cap to 70.
  - **Rework as 2-2**, with the worm as the main source.
- **2-2 AEROSOL** teaches the PUFF, then midboss AEROSOL CLOUD: two new ideas.
  - **Split:** the puff becomes the carrier of 2-1's BREATH, and the cloud becomes 2-2's test.
- **2-3 DEEP BREATH** teaches BREATH.
  - The twist arrives in the world's third stage and gets one stage before the boss. It is also 100% aimed, so the rhythm is the only thing to read.
  - **Move it to the sector start**, so the whole sector breathes.
- **2-4 BETA & GAMMA** is a twin boss.
  - Its peak is 40, lower than ALPHA's 59, yet lost 0.50 and near 1.22 make it **harder than DELTA** and every world-3 sample except 3-1.
  - **Keep and retune.**
- **3-1 CIRCULATION** teaches CURRENT and the DROPLET: two ideas.
  - It is 99% aimed, and its near 1.29 is **higher than its own boss** (DELTA 0.80).
  - **Split.**
- **3-2 HIJACK** introduces HIJACKER, INFECTED CELL and midboss MOTHER CELL: three ideas.
  - HEAVY CROWN shows up here through hijacks before its own debut in 3-3, so the teaching order is inverted.
  - **Cut.** MOTHER CELL moves to 4-2.
- **3-3 VARIANT SURGE** teaches the HEAVY CROWN.
  - It is 100% aimed and reuses 3-1's CURRENT and mix, so it is redundant.
  - **Cut.** HEAVY CROWN returns as MUTATION's product (4-1).
- **3-4 DELTA** is the split boss.
  - Its peak of 33 is the lowest of all bosses, and near 0.80 is below its own world's first sample.
  - **Keep as 3-3 and raise its density.**
- **B2 SWAB TEST** is harmless BLOOM timing: a valid safe intro, but flat as a 32 s stage of its own.
  - **Cut.** Its idea becomes 4-2's first beat.
- **4-1 AGAR** teaches the BLOOM. It is a good static-heavy stage (75% rings).
  - **Keep as 4-2**, with MOTHER CELL as its test.
- **4-2 MUTATION** teaches MUTATION, then midboss LAMBDA.
  - Its peak of 37 is a dip after 4-1's 81.
  - LAMBDA teaches lane jets *after* DELTA has already tested them.
  - **Split:** MUTATION becomes 4-1, and LAMBDA moves before DELTA (3-2).
- **4-3 OUTBREAK** is "everything" with R0 as the goal.
  - Lost 1.38 is **2.8× the final boss's**: a wall before the finale.
  - Its R0 goal duplicates the global R0 medal.
  - **Cut.**
- **4-4 OMICRON PRIME** is the finale.
  - It is easier than 4-1 and 4-3 by vials.
  - **Keep as 4-3, and make it the hardest stage.**

### 1.3 Cross-cutting findings

- **Popcorn stages are aimed-only.** Seven of the 12 non-boss stages that fire bullets are 99–100% aimed: choir coughs and sneezes. Static patterns live only in bosses, DROPLET splashes and BLOOM rings. In stages, the player streams and sidesteps and nothing else.
- **Stages are short and spiky.** Samples run 23–61 s for the reactive player, against the 60–90 s the earlier brief targeted. A 23 s stage has no room for introduce → develop → twist → test.
- **The curve has five inversions:**
  - 1-3 is harder than 1-4;
  - 2-4 is harder than 3-4;
  - 3-1 is harder than 3-4;
  - 4-3 is harder than 4-4;
  - boss peaks fall 59 → 40 → 33 before jumping to 139.
- **Twists arrive late and leave early:** BREATH covers 2 of 18 stages, CURRENT 3 and MUTATION 2.
- **One-idea violations** in 2-2, 3-1, 3-2 and 4-2, and **order bugs** (HEAVY before its debut, LAMBDA after DELTA).
- **Speed is flat rather than laddered:** v90 6.5 → 8.0 and the maximum 6.5 → 8.5 across the whole game. That is fine for readability, but it gives no rule a player could learn (§2.3).
- **Run maths with a draft:** 18 stages, 17 drafts at about 10 s and LAB REPORTs come to 22 min for a bot that never dies. A human who times out cards and retries would need 25–30 min, which is over the web-session target.

## 2. The v1.0 level suite

### 2.1 Run structure (and the assumptions shared with RESEARCH_CARDS.md)

**Count.** 4 sectors × 3 stages = **12 stages**. Each sector is two samples, the second ending in a midboss, then a boss. Bosses come at stages 3, 6, 9 and 12.

**Run length.**

| Item | Amount | Time |
| --- | --- | --- |
| Samples, reference player | 8 × 65–80 s | ~580 s |
| Bosses | 67 + 82 + 97 + 112 s | ~360 s |
| Drafts | 11 × ~10 s | ~110 s |
| LAB REPORTs | 12 × ~3 s, skippable | ~36 s |
| Sector and stage intros | — | ~25 s |

That is **about 18 min clean**. Two retried stages add about 2.5 min.

- Four sectors × four stages would be 16 stages and about 22 min clean, which pushes retries past 25.
- Six stages would make sectors too thin to teach a twist.
- Comparable roguelike bullet hells cadence their picks per level or room: Nuclear Throne offers a choice of four random mutations each level-up ([Wikipedia](https://en.wikipedia.org/wiki/Nuclear_Throne)), and Returnal pairs permadeath stakes with a "steep zero to hero" curve ([GDC 2022, Krueger](https://www.gamedeveloper.com/marketing/a-third-person-action-roguelike-bullet-hell-arcade-thriller-the-making-of-returnal)). Eleven picks over 18 minutes gives one pick about every 90 s.

**Flow.**

1. TITLE (Easy / Normal).
2. SECTOR INTRO (1.2 s), then STAGE INTRO (0.6 s); any press skips them.
3. The stage.
4. LAB REPORT (§5.3).
5. DRAFT (pick 1 of 3), then the next stage.
6. After a boss: FIELD NOTE (§5.3), the SEQUENCED readout and a **boosted** DRAFT, then the next sector.
7. After stage 12: FINAL REPORT.

**Vials, credits and continues.** These are my decision; the owner's permadeath idea is weighed here.

- Normal starts with 3 vials (Easy 5). **A boss clear restores 1 vial; sample clears restore none.** Today a sample restores one vial and a world clear restores all, which would make defensive cards (hearts, shield) close to worthless.
- **Credits:**
  - A run has 3 credits on Normal; Easy is unlimited.
  - Losing the last vial spends a credit and restarts *the current stage* from its entry snapshot: build, score and RNG, as the existing checkpoint does.
  - With no credits left, the run ends with the FINAL REPORT.
- **No full permadeath.** Losing at stage 11 would throw away 18 minutes, and "restarting from the beginning" is a listed shmup sin ([Nomad](https://nomadsreviews.co.uk/post/design-sins-and-pet-peeves-in-shoot-em-ups)). Credits keep the stakes: the score, the **1CC stamp** (cleared on one credit, the genre's own badge of mastery) and a finite run.

**Assumptions RESEARCH_CARDS.md can accept or override.** If it overrides one, the matching test in §7 changes with it.

- **A1. Cadence.** A draft follows each cleared stage 1–11 and none follows stage 12. Boosted drafts come after stages 3, 6 and 9. The model emits `draft { stage, boss: bool, sequenced, vesicleBonus }`.
- **A2. Builds are permanent for the run.** A continue restores the build the stage was entered with.
- **A3. Fairness is authored against a card-free syringe.**
  - The **reference syringe** is the base kit with damage scaled to E(n) (A4), and no defensive or mobility cards.
  - Every stage and card must pass FAIR-150 (§2.3) with it.
  - Cards only add margin; no test may need a card to pass.
- **A4. HP follows an expected DPS curve, not the actual build.**
  - The curve is E(n) = 24 × (1 + 0.06 n) effective DPS, where n is the number of drafts before the stage (n = stage − 1).
  - That gives ALPHA 26.9, BETA & GAMMA 31.2, DELTA 35.5 and OMICRON 39.8. Today's guaranteed power ladder runs 24 / 30 / 42 / 42.
  - Popcorn HP, card HP (TTK × E(n) × 0.7) and SOAP damage scale by E(n)/24, so a good draft *feels* strong.
  - RESEARCH_CARDS owns the cards. If its simulation gives a different mean curve, replace E(n) and re-run T6.
  - Floors and ceilings:
    - The reference syringe at 75% of E(n) ends every card by damage within 80% of its timeout (the existing rule).
    - The strongest legal build (RESEARCH_CARDS supplies it) never ends a card in under 40% of its TTK.
- **A5. The in-stage mRNA ladder (L1–L4) is retired as the run's power curve; the draft replaces it.**
  - Rare random supplies stay in-stage and temporary: BOOSTER, MASK and SOAP, from the owner's earlier "rare random power-ups" request.
  - The VESICLE and the midbosses no longer guarantee mRNA. Curing a VESICLE sets `vesicleBonus` (proposed: a 4th option at the next draft).
  - If RESEARCH_CARDS keeps mRNA instead, E(n) must include it and the guaranteed mRNA moves to the new order: L2 by 1-2, L3 by 2-2, L4 by 3-2.
- **A6. SEQUENCING.**
  - A boss card ended by damage with no hit and no SOAP is NEUTRALIZED (the capture). Each capture counts as one "sequenced" card.
  - The boosted draft's rarity odds rise with `sequenced / cards`. The odds table belongs to RESEARCH_CARDS.
- **A7. Card hooks are parameters, not rules.** Needle reach and INJECT reload (§3.10), SOAP stock, graze radius *for scoring only* (never the core), speed (capped so the crossing never drops under 1.2 s), vials.
  - **No card may change the core radius or draw anything that looks like a hitbox.**
- **A8. Practice uses the reference syringe.** Builds are a run thing, so practice measures skill, not luck.

### 2.2 The suite

Sectors zoom into the body under the lab's microscope (§5.1). Every stage follows four beats: **introduce safely** (the new idea alone, slow, long telegraph), **develop** (more of it, or mixed with one known idea), **twist** (an unexpected recombination), and **test** (the stage's peak, or its midboss). This is kishōtenketsu as Nintendo uses it for level design ([Hayashida via Game Developer](https://www.gamedeveloper.com/design/the-secret-to-i-mario-i-level-design), [GMTK summary](https://www.mcvuk.com/development/video-nintendos-level-design-secrets-in-four-steps)). Beats are 12–20 s long and separated by **rests of 2–3 s** with at most 3 bullets alive. A **surge** (the existing step) marks the twist or test peak.

Script vocabulary is today's: `grid`, `fly`, `worms`, `puffs`, `vesicle`, `midboss`, `surge`, `wait` and `until`. Two new terms appear:

- **RAIN** (§3.3): the choir's straight-down verse.
- **The twist runs on every stage of its sector**, bosses included. MUTATION affects formation members only, so OMICRON is unaffected.

#### Sector 1 · AIRWAY ×40 (trachea; no twist; learn the kit)

**1-1 FIRST CONTACT** (target 65–75 s)

- **New idea:** your syringe has two ends. Only the glowing dose can be hit, and the needle cures.
  - **Introduce (0–15 s):** the original 4×15 mini grid enters, with 3 s of silence. Then RAIN: one or two front minis drop single droplets straight down at 4.5 u/s, which makes static lanes 1.18 u apart. The hint shows once, the first time a bullet crosses the glass without a hit: `PROTOCOL: ONLY THE GLOWING DOSE CAN BE HIT.`
  - **Develop (17–35 s):** a WILD TYPE grid (2 rows) adds aimed single coughs at 5.5 u/s, with the aim locked at telegraph start, while the rain continues. The mix is about 50/50.
  - **Twist (37–52 s):** after a 3 s rest, two slow low `swoop` flights cross the top of the box within reach. Touching one with the needle cures it (INJECT, §3.10). Hint: `PROTOCOL: TOUCH A VIRUS WITH THE NEEDLE TO INJECT.`
  - **Test (54–75 s):** a 7+7 WILD TYPE grid with up to three singers, plus one flight, until clear.
- **Boss:** none.

**1-2 GESUNDHEIT** (70–80 s)

- **New idea:** the odd fan. A SNEEZER inhales (1.0 s, wedge outline) and sneezes a fan whose centre points at you, so you tap sideways out of it ([dodging strategy](https://shmups.wiki/library/Dodging_strategy)). FOCUS helps.
  - **Introduce:** a lone SNEEZER behind a thin WILD TYPE row: n 7 over 56°, one tier at 4.0 u/s, 1.0 s inhale. The `HOLD SHIFT` hint shows the first time a bullet passes within 1 u of an unfocused core.
  - **Develop:** two SNEEZERs alternate, tiers 4.0 / 5.0. The first VESICLE drifts across the back.
  - **Twist:** SNEEZERs over RAIN. The fan's centre lands between rain lanes, so you focus inside a lane.
  - **Test:** the midboss **BIG SNEEZER** (ACHOO!, unchanged).

**1-3 ALPHA** (boss, 60–75 s)

- **New idea:** mutation cards (spell cards): a name, a timer and NEUTRALIZE (capture). Rings and spirals arrive as boss patterns, after 1-1 has already taught static lanes.
- **Cards:** COUGH COUGH → FIRST SNEEZE → SPIKE BLOOM → CORONA, all unchanged. Close the 9.3 s lull to at most 6 s.
- A boosted draft follows.

#### Sector 2 · LUNGS ×400 (alveoli; BREATH on every stage)

**2-1 DEEP BREATH** (65–75 s)

- **New idea:** BREATH. Bullets slow to ×0.6 on the inhale and rush at ×1.3 on the exhale (6 s cycle, 1 s warning). The AEROSOL PUFF is its creature: **puffs spray only on the exhale**.
  - **Introduce:** a known WILD TYPE grid with slow aimed coughs and rain for two full breaths, with no puffs. The alveoli backdrop swells with the cycle (§5.1).
  - **Develop:** a SNEEZER pair. Fans released on the inhale bunch up and then rush, so you learn to commit during the inhale.
  - **Twist:** two puffs drift in and mist only on the exhale (random cone, at most 6 bullets/s). Random fire is introduced, used sparingly ([Boghog](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101)).
  - **Test:** puffs, SNEEZERs and a grid, with a surge on one exhale.

**2-2 GAS EXCHANGE** (70–80 s)

- **New idea:** the RNA WORM's sine strand, aimed at you. You **stream**: move steadily and turn at the edge.
  - **Introduce:** one worm crossing the top: strand n 8, 4.8 u/s, amplitude 0.8, with the thread drawn. Nothing else fires.
  - **Develop:** two worms crossing in opposite directions, plus rain.
  - **Twist:** strands launched on the exhale (×1.3), with a SNEEZER.
  - **Test:** the midboss **AEROSOL CLOUD** (MIST), which recalls 2-1's mist under BREATH.

**2-3 BETA & GAMMA** (boss, 75–90 s)

- **New idea:** the twin nucleus: only the glowing twin takes damage.
- **Cards:** PING-PONG → CROSS INFECTION → MIRROR STRAIN → DOUBLE HELIX.
- **Retune** so that it sits between ALPHA and DELTA (§2.3 ladder):
  - PING-PONG's drips go from 8 to 6 bullets and from 7.5 to 7.0 u/s, so the opening streams are lighter and stay under 9.5 u/s on the exhale;
  - CROSS INFECTION's lattice gets denser (n 7 → 9), which raises the static share;
  - target peak 80.

#### Sector 3 · BLOODSTREAM ×4 000 (capillary; CURRENT on every stage)

**3-1 CIRCULATION** (65–75 s)

- **New idea:** CURRENT. Bullets drift with the flow at 0.8 u/s, flipping every 30 s with a 2 s warning. Only known enemies appear.
  - **Introduce:** rain under the current. The lanes lean diagonally and stay readable.
  - **Develop:** aimed coughs drift, so you dodge downstream.
  - **Twist:** the flow flips mid-surge, and a worm streams across it.
  - **Test:** a mixed grid (WILD, SNEEZER, puffs) with flights.

**3-2 SPLASHDOWN** (70–80 s)

- **New idea:** the DROPLET. It shows a dashed path for 0.8 s (+0.4 s in the introduce beat), dives, lands 4 u ahead of you and splashes into a ring 0.8 s later unless shot or injected. This teaches priority, and a static ring around you.
  - **Introduce:** single droplets from a sparse grid, nothing else.
  - **Develop:** droplet dives under choir coughs.
  - **Twist:** a droplet lands upstream, and its splash ring drifts onto you with the current.
  - **Test:** the midboss **LAMBDA**, moved from 4-2. TRACKING, then MIRROR with its lane jet locked where you stood. It is the safe preview of DELTA's LANE SNEEZE.

**3-3 DELTA** (boss, 90–105 s)

- **New idea:** the split boss: lanes, halves, drifting walls.
- **Cards:** TRIANGULATE → LANE SNEEZE → HALVES → BLOOD RUSH → Δ CASCADE.
- **Retune upward**, from a peak of 33 to a target of 100:
  - HALVES' rings go from n 14 every 1.3 s to n 18 every 1.1 s;
  - BLOOD RUSH's walls come every 3 s instead of 4;
  - Δ CASCADE gets 4 seeds instead of 3.

#### Sector 4 · THE CELL ×40 000 (a replication factory; MUTATION on every stage)

**4-1 COPY ERROR** (65–75 s)

- **New idea:** MUTATION as one rule: **a flash means an upgrade**. Every 3.2 s a formation virus flashes for 0.8 s (1.2 s in the introduce beat), then mutates unless it is cured first:
  - a WILD TYPE becomes a **HEAVY CROWN** (the elite, with a spike stack and spikes that break off);
  - anything else fires one tier up (today's rule).

  This folds the cut HIJACKER's "kill the converter first" lesson and the HEAVY CROWN's debut into the twist itself.
  - **Introduce:** one mutation at a time on a sparse WILD TYPE grid. The HEAVY CROWN it produces fires slowly.
  - **Develop:** a mutation every 3.2 s on a fuller grid, with HEAVY spike stacks at 8 u/s.
  - **Twist:** a SNEEZER mutates into a 9-way, 3-tier fan, so the upgrade itself reads as a misdirection.
  - **Test:** a dense mixed grid with flights.

**4-2 FULL BLOOM** (70–80 s)

- **New idea:** the BLOOM. It is invulnerable while closed, opens for 0.8 s, fires a 16-spike ring and stays open 1.5 s. You wait for the window, or INJECT a closed bud (§3.10).
  - **Introduce:** B2's safe intro as a beat: one bloom whose ring is n 10 at 3.5 u/s, and nothing else.
  - **Develop:** a bloom field with a grid.
  - **Twist:** blooms mutate, and their rings upgrade.
  - **Test:** the midboss **MOTHER CELL**, moved from 3-2 to the cell. BUDDING (shootable virions, BUDDER's lesson) → LYSIS (replication) → CELL BURST. It previews OMICRON's R0 > 1.

**4-3 OMICRON PRIME** (final boss, 105–120 s)

- **New idea:** its mutations are its phases.
- **Cards:** SPIKE CROWN → SNEEZE STORM → MUTATION SPIRAL → QUARANTINE → CORONA FLARE → R0 > 1.
- **Retune** so it is the run's hardest stage and its peak drops from 139 to at most 130: shorten SPIKE CROWN's bloom from 2.4 s to 2.0 s.

### 2.3 The difficulty curve: measurable ladders and FAIR-150

All values are for Normal, measured on the reference player and reference syringe over 8 seeds without SOAP; Easy scales them through its existing factors. "Mix" is the share of spawned bullets that are aimed / static / random.

| Stage | Length (s) | Peak | Mean alive | Spawn/s | Speed median / max | Mix | Quiet ≥ | Near (ladder) | Hits ≤ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1-1 | 65–75 | 25 | 4–7 | 1.5–2.5 | 5.0 / 6.0 | 55 / 45 / 0 | 40% | 0.25 | 0.10 |
| 1-2 | 70–80 | 40 | 7–11 | 2.5–4 | 5.0 / 6.5 | 60 / 40 / 0 | 30% | 0.40 | 0.20 |
| 1-3 ALPHA | 60–75 | 60 | 15–21 | 5–7 | 4.5 / 7.5 | 35 / 65 / 0 | 25% | 0.60 | 0.30 |
| 2-1 | 65–75 | 50 | 12–16 | 4–5.5 | 5.0 / 7.0* | 50 / 35 / 15 | 25% | 0.50 | 0.30 |
| 2-2 | 70–80 | 60 | 15–19 | 5–6.5 | 5.0 / 7.0* | 50 / 35 / 15 | 22% | 0.65 | 0.40 |
| 2-3 B&G | 75–90 | 80 | 16–22 | 5–7 | 4.5 / 7.0* | 35 / 55 / 10 | 20% | 0.85 | 0.50 |
| 3-1 | 65–75 | 70 | 17–21 | 5.5–7 | 5.5 / 7.5 | 45 / 45 / 10 | 20% | 0.75 | 0.45 |
| 3-2 | 70–80 | 80 | 19–24 | 6.5–8 | 5.5 / 8.0 | 45 / 45 / 10 | 18% | 0.90 | 0.55 |
| 3-3 DELTA | 90–105 | 100 | 22–28 | 7–9 | 5.0 / 8.0 | 35 / 60 / 5 | 17% | 1.10 | 0.70 |
| 4-1 | 65–75 | 90 | 22–27 | 8–9.5 | 6.0 / 8.5 | 45 / 45 / 10 | 15% | 1.00 | 0.65 |
| 4-2 | 70–80 | 100 | 25–30 | 9–10.5 | 5.5 / 8.5 | 35 / 55 / 10 | 15% | 1.15 | 0.80 |
| 4-3 OMICRON | 105–120 | 130 | 28–34 | 10–12 | 5.0 / 9.0 | 25 / 60 / 15 | 15% | 1.40 | 0.90 |

\* Base speed. BREATH's exhale multiplies it by 1.3; the FAIR rules below use the effective speed.

**Ladder rules (tested, §7 T3):**

- **Sawtooth on near-core pressure:**
  - it rises strictly within each sector;
  - each sector's first stage is above the previous sector's first stage and at most the previous sector's boss;
  - bosses rise strictly (0.60 < 0.85 < 1.10 < 1.40).
  - Each measured value must sit within ±12% of its row. Near pressure is the primary ladder because single-sample vial losses are noisy (BALANCE.md).
- **Peak bullets follow the same sawtooth.** Hits are ceilings only.
- **Speed bands by grammar:**
  - static fields (rain, ring, bloom, wall, aerosol) stay at or below 5 u/s;
  - aimed fans at or below 7 u/s;
  - only aimed singles, stacks (3 bullets or fewer) and re-aimed streams (DRIP) may reach the stage's maximum;
  - nothing exceeds 9.5 u/s effective on Normal (sector 2's base maximum of 7.0 × 1.3 on the exhale is 9.1).

  This follows the genre's rule that dense means slow and fast means sparse ([Boghog](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101); [Sparen A4](https://sparen.github.io/ph3tutorials/ddsga4.html)).
- **Mix:**
  - The aimed share falls from 55–60% to 25% while the static share rises: the player moves from *reacting* to *reading a field and reacting inside it*. Aimed shots stop camping in a static field's safe spot ([dodging strategy](https://shmups.wiki/library/Dodging_strategy)).
  - Every stage after 1-1's introduce beat has at least 20% aimed and at least 30% static.
  - The random share stays at or below 15%.
- **Rhythm:**
  - quiet time at or above the table's floor;
  - a rest of at least 2.5 s at least every 25 s;
  - no lull without bullets longer than 6 s outside intros and card holds (today's lulls reach 9.3 s).

**FAIR-150 (the fairness rule).** For every stage and every boss and midboss card, with the reference syringe and no SOAP:

1. **Dodgeable.** `tests/reactive.mjs` (150 ms perception lag, 100 ms decisions, straight-line extrapolation, one committed direction) takes at most the row's hit ceiling on average over 8 seeds. Its worst seed takes at most 2 hits in sectors 1–2 and at most 3 in sectors 3–4. Every card keeps the existing rule: mean at most 1.2 hits, worst at most 3, and at least 3 of 5 starts with at most 1 hit.
2. **No forced hit.** For every hit the reactive player takes, rewind to the snapshot 0.5 s earlier and run the perfect-information autopilot. It must avoid that hit, or the situation was a trap and the pattern is unfair.
3. **Lead time.** From any core position in the lower 80% of the box (z ≥ 0), no bullet can reach the core sooner than 0.6 s after it, or its telegraph, became visible. The 0.6 s is a 150 ms lag, a 100 ms decision and a 0.35 u sidestep at focus speed (70 ms), doubled. Point-blank play above z = 0 is an opt-in risk zone covered by rules 1–2 only. The existing rules stay: E3 (at least 1.5 s from the formation front), the 2.5 u spawn exclusion, telegraph minimums, gaps of at least 0.5 u at 10 u, walls of at least 2.0 u, at most two families on Normal, and never two aimed families together.
4. **Course changes are announced.** A bullet may change course (split, turn, accelerate) only after a visible 0.3 s flash, at most once per second, and never toward the core once it has passed within 2 u.

### 2.4 Existing content: keep, rework, cut

| Content | Decision | Where it goes |
| --- | --- | --- |
| 1-1 FIRST CONTACT, 60-mini homage | Rework | 1-1: rain, the INJECT beat, 70 s |
| 1-2 GESUNDHEIT, SNEEZER, VESICLE | Rework | 1-2, plus BIG SNEEZER as its test |
| 1-3 BUDDING, popcorn BUDDER | Cut | Virions live on in MOTHER CELL's BUDDING; BIG SNEEZER moves to 1-2 |
| ALPHA | Keep | 1-3 |
| B1 CULTURE CHECK | Cut from the run | Later: a score-attack extra (§6) |
| 2-1 GAS EXCHANGE, RNA WORM | Rework | 2-2 |
| 2-2 AEROSOL: PUFF / AEROSOL CLOUD | Split | Puff to 2-1 (fires on the exhale); cloud to 2-2's test |
| 2-3 DEEP BREATH | Rework | 2-1; BREATH covers all of sector 2 |
| BETA & GAMMA | Keep, retune | 2-3 |
| 3-1 CIRCULATION | Split | CURRENT alone in 3-1; DROPLET to 3-2 |
| 3-2 HIJACK: HIJACKER, INFECTED CELL | Cut | HIJACKER's lesson is folded into MUTATION; INFECTED CELL waits for v1.1 |
| MOTHER CELL | Move | 4-2's test (inside the cell, budding and lysis) |
| 3-3 VARIANT SURGE, HEAVY CROWN | Cut stage | HEAVY CROWN is MUTATION's product in 4-1 and is reused after |
| DELTA | Keep, retune up | 3-3 |
| B2 SWAB TEST | Cut | Becomes 4-2's introduce beat |
| 4-1 AGAR, BLOOM | Keep | 4-2 |
| 4-2 MUTATION | Rework | 4-1, with WILD TYPE → HEAVY CROWN |
| LAMBDA | Move | 3-2's test, before DELTA |
| 4-3 OUTBREAK | Cut | R0 stays a medal goal on every stage |
| OMICRON PRIME | Keep, retune | 4-3 |
| Worlds AIRWAY / LUNGS / BLOODSTREAM | Keep, as sectors | 1–3 |
| LAB / PETRI world | Rework | THE CELL (§5.1); the lab becomes the frame, not a place |
| 12 presets, 6 bullet families, SOAP, graze, Dose Chain, R0, Easy, MUTATION LAB | Keep | Retuned per §3 |
| mRNA L1–L4 guaranteed ladder | Retire (A5) | The draft is the power curve |

Archetypes in v1.0: WILD TYPE (with mini), SNEEZER, AEROSOL PUFF, RNA WORM, DROPLET, HEAVY CROWN, BLOOM and VESICLE. That is eight, each debuting alone (the existing debut test, re-baselined).

## 3. Bullet-hell techniques to implement

Each technique states the decision, the reason and the source. "Read" marks pages read in full this round; the others come from search summaries.

1. **Pattern grammar tags.**
   - Every preset declares `grammar: 'aimed' | 'static' | 'random'`, and a mixed emitter declares the share of each. The stage audit sums bullets by tag (§2.3 mix).
   - *Why:* angles are fixed, random or aimed, and their value lies in combining them ([Sparen A2](https://sparen.github.io/ph3tutorials/ddsga2.html)). Aimed fire forces movement and static fire shapes it ([Boghog](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101), read).
   - Today the stages are aimed-only (§1.3).
2. **Streaming vs tapping, authored on purpose.**
   - DRIP, the strand and the aimed choir are *streaming* patterns: they are dodgeable by steady movement.
   - COUGH stacks and odd fans are *tapping* patterns: one short move perpendicular to the shot.
   - Even fans (SNIFFLE) reward *staying still*.
   - Each stage's develop beat names which one it trains, and its intro text says it in the lab voice.
   - *Why:* these are the three core dodging techniques. Even patterns "punish macro movements", and the axiom is to evade perpendicular to the bullet ([Shmups wiki dodging strategy](https://shmups.wiki/library/Dodging_strategy), read).
3. **Lanes: RAIN, the Invaders verse.**
   - The choir gets a second verse: front-of-column members drop single droplets *straight down* (angle 0; CURRENT drifts them). That makes static lanes the formation's sway slides sideways.
   - Choir volleys alternate RAIN and the aimed COUGH.
   - RAIN gets its own `LIMITS` row: n 1 per singer, 4–5.5 u/s, 0.5 s telegraph. Today's COUGH floor of 5 u/s is too fast for 1-1's 4.5 u/s lanes.
   - *Why:* Space Invaders' own bombs fall straight down ([Wikipedia](https://en.wikipedia.org/wiki/Space_Invaders)). Lanes are the cheapest readable static field, and they return the "Invaders" identity to popcorn stages.
4. **Safe-spot design and anti-camping.**
   - Every static field has a findable gap at the player's row: rings use alternating half-angle offsets; CORONA FLARE's gaps point into the lower half; wall gaps are marked 1.0 s ahead; the storm's lanes are marked.
   - No safe spot may stay safe longer than 4 s without an aimed element joining it.
   - *Why:* static patterns are solved by memorised safe spots, and aimed shots added to walls keep players "on their toes" ([dodging strategy](https://shmups.wiki/library/Dodging_strategy)); fewer bullets need not mean easier ([Sparen A4](https://sparen.github.io/ph3tutorials/ddsga4.html)).
5. **Misdirection, only in sector 4.**
   - The flash = upgrade rule, REPLICATION splits and far rings that mostly miss teach the player to filter out bullets that are not headed at them.
   - All of it is bounded by FAIR-150 rule 4.
   - *Why:* danmaku relies on "mental filtering" of bullets designed not to hit you ([Sparen A2](https://sparen.github.io/ph3tutorials/ddsga2.html)). Misdirection is the late-game grammar, never an early one.
6. **Pattern rhythm and rests.**
   - Beats of 12–20 s, rests of 2–3 s, a surge at the twist or test, a midboss as the sample's landmark.
   - SHOULD: quantise choir volleys to the march beat, so bullets land on the music.
   - *Why:* constant intensity wears players out, and set pieces work as landmarks ([Boghog](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101)). Space Invaders' march already ties tempo to threat.
7. **The graze economy: EXPOSURE.**
   - Graze stays 1.0 u and counts once per bullet: +10 points, and +1 SOAP per 100 grazes. It is renamed **EXPOSURE** (controlled exposure is what a vaccine is).
   - **The barrel's fluid level shows exposure toward the next SOAP**, and the Dose Chain moves to the fluid's glow. This answers the movement audit's E2 WARN: the SOAP resource is now on the character.
   - *Why:* graze once per bullet and continuously on lasers is Touhou's rule ([Shmups wiki Touhou](https://shmups.wiki/library/Unknwn/Touhou), read). Graze that powers the ship is Psyvariar's whole design ([Wikipedia](https://en.wikipedia.org/wiki/Psyvariar)).
8. **A real focus trade-off.**
   - Unfocused SPRAY widens so it covers at least 3 u at 10 u range (about ±8.5°, five needles), for clearing popcorn.
   - Focused NEEDLE delivers at least 1.5× the unfocused DPS on one 0.6 u target at 10 u, for bosses.
   - Card HP is set against *focused* E(n). This lifts D2 (skill gradient, 14.7% today) past 15%.
   - *Risk:* the ±9° playtest found side needles missing bosses. That was with HP built on unfocused DPS; the test bots must focus on bosses, as players do.
   - *Why:* focus gives "slow movement and concentrated fire" in Touhou ([Shmups wiki](https://shmups.wiki/library/Unknwn/Touhou)). DoDonPachi's laser is the strongest weapon and slows the ship, while its shot covers wider ([Shmups wiki DoDonPachi](https://shmups.wiki/library/DoDonPachi), read). About ⅔ speed is the common middle ground, though Touhou goes lower ([Boghog](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101)).
9. **Bombs and the deathbomb: keep SOAP.**
   - SOAP keeps 2 per vial, its cancel into antigen tokens, the 0.18 s deathbomb (about 11 frames) and Easy's auto-SOAP.
   - The core flashes pink-white during the deathbomb window, so "SOAP now" reads on the character.
   - *Why:* cancel bullets on death, then give invincibility; a bomb within "a couple or a few frames" of death saves ([Boghog](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101)). DoDonPachi's bomb turns bullets into score items ([Shmups wiki](https://shmups.wiki/library/DoDonPachi)).
10. **Point-blank: INJECT, the signature (§5.4).**
    - The needle tip cures what it touches, cancels that virus's live bullets into antigen tokens, scores ×2 and pushes the Dose Chain.
    - *Why:* low shot limits and proximity damage reward close, aggressive play ([Boghog](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101)). DoDonPachi's laser aura hits harder at close range and some kills cancel bullets ([Shmups wiki](https://shmups.wiki/library/DoDonPachi)). Radiant Silvergun's close-range sword absorbs pink bullets ([Shmups wiki](https://shmups.wiki/library/Radiant_Silvergun)).
    - For a syringe, contact *is* the theme.
11. **Rank: none, by design.**
    - There is no hidden dynamic difficulty. The draft already changes the player's power, and difficulty is authored (§2.3) plus a mode (#16).
    - *Why:* Battle Garegga's hidden rank is the genre's most polarising system ("I have to die on purpose?!"), and its feedback is slow and invisible ([shmups.wiki](https://shmups.wiki/library/Battle_Garegga/Advanced_Rank), community discussion on [shmups.system11](https://shmups.system11.org/viewtopic.php?p=1209400)).
    - A *visible*, opt-in risk selector is a v1.1 idea (§6).
12. **Item collection lines: none.**
    - Antigen tokens auto-collect, and the rare supplies keep their 3.5 u magnet.
    - *Why:* Touhou's point-of-collection line rewards moving up-screen ([Shmups wiki](https://shmups.wiki/library/Unknwn/Touhou)). In v1.0, INJECT is the forward-play incentive, and a second positional goal would compete with it. Boghog warns that incentives must align with the core rules.
13. **Boss cards and timeouts.**
    - Keep the named cards, the 1.5 s cancel-and-hold at each card start, the visible timer and NEUTRALIZE (capture = no hit, no SOAP, ended by damage).
    - Change card timeouts from a fixed 40 s to `max(25, round(1.6 × TTK))` s, so a stalled card ends sooner and the worst-case boss length is bounded (ALPHA, for example, at most 128 s plus intros).
    - Captures feed SEQUENCING (A6).
    - *Why:* named attacks gave bullets meaning: ZUN says that once patterns were named, "the bullets started to gain meaning", like fighting-game special moves ([Touhou Garakuta interview](https://en.touhougarakuta.com/article/specialtaidan_zun_hiroyuki_5-en/), read). Touhou's capture bonus requires no hit and no bomb inside the timer, and a timeout only moves the boss on ([Shmups wiki](https://shmups.wiki/library/Unknwn/Touhou)).
14. **Readability.**
    - Keep the existing rules: pink-violet bullets with white cores and dark rims; midtone backdrops; bullets drawn last with depth testing off, small over large; player needles thin, cyan, 55% opaque and *under* enemy bullets; pink, green, cyan and amber each with one meaning.
    - Add:
      - **Shape encodes speed:** round families are slow and elongated ones fast, plus a speed trail on every bullet over 5 u/s (length = speed × 0.06 s, at most 25% alpha, never solid: light, not matter).
      - **Backdrop motion never resembles bullets:** cilia, red cells and ER folds stay under 35% luminance contrast, red cells are desaturated brick and never pink, and nothing is bullet-sized and bright.
      - In focus, **the syringe body ghosts to 35%** (§4).
    - *Why:* value contrast, sprites stretched to their speed, enemy bullets on top ([Boghog](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101)). One colour means harm ([RESEARCH_BULLET_HELL.md §2](./RESEARCH_BULLET_HELL.md)).
15. **Attract mode and practice.**
    - After 20 s idle on the title, the autopilot plays a random reached stage with a `DEMO` tag.
    - The tray keeps SAMPLES (any reached stage, reference syringe), PRACTICE (one vial, R restarts at once) and the MUTATION LAB (any seen card).
    - *Why:* Imperishable Night made per-card spell practice the norm ([Wikipedia](https://en.wikipedia.org/wiki/Imperishable_Night)). Practice on the reference syringe isolates skill from the draft (A8).
16. **Accessibility and difficulty modes.**
    - Keep Easy and Normal, the always-visible core, shape-first bullets, reduced motion, pause anywhere, auto-fire, one-button SOAP and touch drag.
    - Add **ASSIST: game speed 70 / 80 / 90%**, a dt scale on the fixed clock, explained once, changeable at any time and not stigmatised (the LAB REPORT says `ASSISTED`; there is no tray badge).
    - Add a **high-contrast bullets** option (white rims, no glow).
    - Hard mode waits for v1.1.
    - *Why:* Celeste's Assist Mode offers game speed in 10% steps. Its creator dropped the save-file assist icon as exclusionary and argued that such options should be explained up front and stay out of the way ([Vice](https://www.vice.com/en/article/d3w887/celeste-difficulty-assist-mode)). Never rely on colour alone ([Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/)).

## 4. The syringe: shorter, honest, readable

### 4.1 What is wrong today

The parts, at `SYRINGE.scale` 1.333 and tilted 20°, run from the needle tip to the thumb rest over **5.1 u**: 4.78 u on the board, or about **108 px at 960×640**.

- The core sits at the barrel centre, with the needle reaching **2.94 u ahead** of it and the thumb rest 1.8 u behind.
- The finger collar is 1.28 u wide.
- The tilt also lifts the needle tip 1.07 u off the collision plane, so parallax draws it about 0.4 u (around 9 px) further up-field than its plane position.

The syringe is 12.75 core-diameters long and covers about a third of the movement box's height. Measured with the reactive player over all 16 non-bonus stages (seeds 42, 1, 7), **a bullet visibly overlaps the drawn syringe without touching the core 28.2 times per minute**, up to 52.9 in 3-1. Each of those is a moment where the screen says "hit" and the game says "no": that is the owner's "the hitbox gets confusing".

### 4.2 Decision: proportions

Positions are along the syringe's axis, from the core at 0 (negative is up-field). The parts are drawn at scale 1.0; the 1.333 factor is folded in.

| Part | From → to (u) | Radius / half-width (u) |
| --- | --- | --- |
| Needle tip (cone) and shaft | −0.95 → −0.52 | 0.03, with a 0.06 dark outline |
| Hub | −0.52 → −0.40 | 0.13 tapering to 0.07 |
| Barrel (glass, cyan dose, graduations) | −0.40 → +0.40 | 0.28 |
| Vaccine chamber = the core | centred at 0 | 0.20, the collider |
| Finger collar (rounded torus, never a crossbar) | +0.31 → +0.41 | 0.42 |
| Plunger rod | +0.40 → +0.62 | 0.07 |
| Thumb rest | +0.64 → +0.69 | 0.26 |

Derived figures:

- **Total length 1.64 u** (about 37 px at 960×640, 25 px at 320 wide), width 0.84 u at the collar (19 px), barrel 0.56 u (12.6 px).
- The core fills 71% of the barrel width, so the syringe reads as a glass capsule around its glowing dose.
- Its area-weighted silhouette centroid is +0.02 u (0.5 px) from the core: the hitbox is where the eye puts "me".
- **Every point of the syringe lies inside the 1.0 u graze ring.** The farthest point is the needle tip, at 0.95 u. This gives the rule the game teaches: *the body is the graze zone, and the glow is the hitbox.*
- **The tilt drops from 20° to 10°**, pivoting on the core, so the tip lifts 0.17 u and parallax moves it under 2 px.
- **The muzzle moves to the drawn tip** (z − 0.95 today; was z − 0.9).
- The supply catch radius (`BODY_RADIUS`) becomes the barrel's 0.28 u, plus the unchanged 3.5 u magnet.
- Antibody options keep at least 0.3 u clear of the barrel edge: unfocused at ±1.15 u (outside the ring), focused at ±0.75 u, drawn at 60% opacity so they never read as body.

The phantom-overlap measurement on the same runs with this silhouette gives **5.3 per minute (−81%)**, and at most 10.7 per minute in any stage.

### 4.3 Decision: the marker, focus and the graze ring

- **Always visible, always the collider.** The core is drawn as the glowing vaccine chamber: a white-cyan disc whose outer edge is exactly r = 0.2 u. Its 1 px dark rim lies *inside* the radius. It sits on the collision plane, drawn on top of everything, as today (`MARKER`, tested within 1 device pixel).
  - Touhou shows its hitbox only in focus, as a white dot, since Perfect Cherry Blossom ([Wikipedia, EoSD](https://en.wikipedia.org/wiki/Embodiment_of_Scarlet_Devil); [Shmups wiki](https://shmups.wiki/library/Unknwn/Touhou)).
  - Ours stays on in both modes, because Easy and touch players rarely focus and the owner asked for clarity.
- **Unfocused:**
  - the body is opaque glass and plastic;
  - the graze ring is hidden;
  - a graze draws a 0.2 s arc of the ring at the bullet's bearing as feedback.
- **Focused (Shift):**
  - the body **ghosts to 35% opacity**, so bullets crossing it are plainly not hitting anything;
  - a 1 px white edge ring is drawn *on* the core's edge, inside the collider;
  - the 1.0 u graze ring appears at full strength on the press frame (today's behaviour), and the antibodies tuck in.
- **Hit (0.18 s deathbomb window):** the core alone flashes pink-white.
- **Respawn invulnerability:** the body flickers and the core never does.
- **INJECT ready:** the needle tip carries a small white glint. It dims during the reload.
- **Why this reads better:**
  - The genre's player is a small sprite around a tiny, centred, visible core: Touhou's hitbox is about 5×5 px ([Shmups wiki](https://shmups.wiki/library/Unknwn/Touhou)); DoDonPachi's is 6×7 px ([Shmups wiki](https://shmups.wiki/library/DoDonPachi)); Cave's hitboxes are often about 20% of the diameter ([Time Extension](https://www.timeextension.com/features/cave-story-the-history-of-donpachi-the-shmup-series-that-changed-everything)); Boghog says "perfectly centred" ([Boghog](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101)).
  - Our core stays a generous 9 px. The fix is the sprite, not the hitbox: a syringe 4.5× the core's length, entirely inside its graze ring, means a bullet over the body is almost always also inside the ring. It then reads as *grazing*, which is true and rewarding, instead of as a missed hit.
- **Collisions stay honest:** the marker equals the collider, the needle never hurts the player, and only the needle tip has a positive collider (INJECT). That collider is drawn as the glinting tip, at exactly its radius.

## 5. Personality for the whole game

### 5.1 Sector identity: a zoom into the body

The lab is the **frame**: the specimen tray, the LAB REPORT, sample codes and the instrument HUD. The body is the **world**. Each sector is one magnification step deeper: tissue, then cells, then the inside of one cell. Everything stays 3D, lit and microscope-like: geometry, light and motion, with no faces, no speech bubbles and no drawn mouths.

| Sector | Site, magnification | 3D backdrop (midtone, under the glass board) | Light | Motion (the twist made visible) | Music: one motif, four arrangements |
| --- | --- | --- | --- | --- | --- |
| 1 AIRWAY | Trachea ×40 | Cartilage rings receding, cilia carpets, mucus sheen | Cool slate-teal key, soft rim | Cilia beat in a travelling wave up-field (0.5 Hz) | The original 4-note march, dry: bass and tick, a cilia shaker on the off-beat; 96 → 132 bpm as the grid empties |
| 2 LUNGS | Alveoli ×400 | Glass grape clusters of alveolar sacs | Blue-grey, brightening on the inhale | **The sacs inflate with BREATH**: the backdrop is the twist's telegraph | Tempo locked to the breath: 80 bpm, an 8-beat phrase per 6 s breath; a pad opens on the inhale and the bass thins on the exhale |
| 3 BLOODSTREAM | Capillary ×4 000 | Vessel wall; biconcave red cells (desaturated brick); plasma streaks | Warm teal over maroon | Cells flow with the CURRENT and visibly reverse on the flip | A heartbeat kick pair (lub-dub) at 72 bpm with a 144 bpm hat; an arpeggio panned with the flow; a 2-bar riser on the 2 s flip warning |
| 4 THE CELL | Cytoplasm ×40 000 | ER membrane folds, double-membrane replication bubbles, ribosome beads on strands, a polymerase "reading head" | Desaturated sepia-umber, never green or amber-saturated | The reading head flickers when MUTATION fires | A 16-step sequencer "copying" the march; each mutation flash knocks one step out of key until the mutant dies or completes |

The camera stays fixed: no follow, no sway (the steep 64–74° camera is a readability decision). The zoom is a pre-play overlay only: a microscope reticle, a magnification counter rolling up (×40 → ×400) and a 0.8 s focus pull on the backdrop layer, with no bullets on screen. The Space Invaders march still speeds up as the formation empties. All audio stays synthesized (`audio.mjs`): no files.

### 5.2 The UI voice: two voices

- **The lab (the UI):** calm, clinical, deadpan.
  - Uppercase dot-matrix and seven-segment lettering, as today.
  - Nouns from the bench: SPECIMEN, SITE, PROTOCOL, EXPOSURE, DOSE, VIRAL LOAD, R0, CONTAINED.
  - Instructions are `PROTOCOL:` lines, at most 60 characters.
  - No exclamation marks, and at most one dry aside per screen.
- **The virus (bosses only):** its card names (FIRST SNEEZE, R0 > 1) and growled taunts typed into the VIRAL LOAD panel in the variant's green, as built.
- The contrast between a calm instrument and a theatrical villain *is* the personality, and it costs no cartoon.

| Moment | Example text |
| --- | --- |
| Stage intro | `SPECIMEN 2-1 · DEEP BREATH · ALVEOLI ×400` / `PROTOCOL: COMMIT ON THE INHALE.` |
| One-time hint | `PROTOCOL: ONLY THE GLOWING DOSE CAN BE HIT.` |
| Vial lost | `DOSE LOST · SOAP WINDOW MISSED` |
| Credit spent | `CONTAINMENT LOST · HIT BY SNEEZER DROPLET · 2-1 +31 S` |
| Card captured / timed out | `NEUTRALIZED · SEQUENCED 3/4` / `TIME OUT · NOT SEQUENCED` |
| Boss case file (entrance card) | `VARIANT ALPHA · FIRST OF ITS LINE · COUGHS IN THREES · TEMPERAMENT: POMPOUS` |

### 5.3 Results and story beats

- **LAB REPORT** (after each stage, 2.5 s, skippable, before the draft): specimen code and name, result, EXPOSURE (grazes), INJECTIONS, R0 with a verdict (`CONTAINED` below 1), doses lost, time, medal, and a one-line assessment, for example `BREATHING TISSUE STABILISED.`
- **FIELD NOTES** (after the prologue and each boss, two lines, at most 3 s). They are the whole story, told in the lab's voice. There are no patients and no deaths, only the body as a place (the taste rules of RESEARCH_BULLET_HELL §4.3).
  - **0:** `SPECIMEN RECEIVED: AIRWAY. WILD-TYPE REPLICATION CONFIRMED. DISPATCH ONE SYRINGE.`
  - **1:** `ALPHA NEUTRALIZED. DESCENDANTS DETECTED DEEPER: ALVEOLAR TISSUE. EXPECT TWINS.`
  - **2:** `VIRAL LOAD IN CIRCULATION. VARIANT DELTA IS TRAVELLING WITH THE FLOW.`
  - **3:** `SOURCE LOCATED: A REPLICATION FACTORY INSIDE ONE CELL. COPY ERRORS RISING.`
  - **End:** `OMICRON PRIME NEUTRALIZED. R0 < 1. SPECIMEN CONTAINED. REPORT FILED.`
- **FINAL REPORT:** score, the 1CC stamp, credits used, variants sequenced (x/19 cards), the build (from RESEARCH_CARDS), and `NEW RUN` / `PRACTICE`.
- **Boss intros:** the existing name card becomes the case file above. The pits' glow rises on entry as built.

### 5.4 The signature mechanic: INJECT

**Rule.** When the needle-tip point (0.95 u ahead of the core, collider r 0.05) enters an enemy's body collider and the plunger is loaded:

- **Popcorn** is **cured instantly**, whatever its HP: WILD TYPE, mini, SNEEZER, PUFF, a worm, or a droplet in flight.
- **Elites** take 10 damage, scaled by E(n)/24: a HEAVY CROWN, a BLOOM (even closed, since the needle pierces the bud) or a VESICLE (its supply pops out).
- **Bosses and midbosses** are meant to be out of reach: they sit at z −7.2 with r ≥ 1.45 (front edge at z −5.75 or deeper), while the tip can reach z −3.95 at most. Moving cards (mirror, corners, orbit, halves) must be checked by T8's sweep. If any card brings a body within reach, that body takes elite damage, never an instant cure.

**Effects:**

- the victim's live bullets (matched by `owner`) are cancelled into antigen tokens;
- the kill scores ×2 and adds +1 to the Dose Chain;
- 60 ms of hitstop, inside the 120 ms cap;
- the plunger pushes in; a short "pssht" plays over a low thump;
- the cured virus **deflates to grey and fades over 0.25 s** instead of popping, so a cure reads differently from a kill.

**Reload:** 0.5 s for popcorn and 0.8 s after an elite, shown as the plunger drawing back and the tip's glint dimming. Nothing moves the syringe: there is no recoil, so inputs still act on the step they happen.

**Why it is the signature:**

- It is the one thing a syringe does.
- It turns the long-standing "the top of the box is point-blank range" into a choice: reaching the front row means standing at the top of the box, closest to every emitter.
- It cancels bullets at the source, DoDonPachi-style, and it gives the needle a job, which makes the core's role clearer.

**Fairness:**

- The tip touches a body when the core is still 0.75 u from it (65 ms at full speed), and popcorn is gone on the touch step.
- Contact rules are unchanged: the core against a body still costs a vial.
- The reactive referee never injects, so FAIR-150 holds without it.

**Taught in 1-1's twist beat.** Card hooks: reach and reload (A7).

The supporting meta-motif is **SEQUENCING** (A6): capturing a variant's cards sequences it, and a better-sequenced variant gives a better boosted draft. That is literally how a vaccine gets designed, and it rewards the genre's capture skill.

## 6. v1.0 scope cut

**MUST (v1.0 ships with these):**

1. The 12-stage suite (§2.2), with cuts and moves (§2.4), twists on every stage of their sector, RAIN, MUTATION → HEAVY CROWN, and LAMBDA and MOTHER CELL relocated.
2. The run: drafts after stages 1–11 and boosted after 3, 6 and 9; the `draft` event (A1); credits, continues from stage entry and the 1CC stamp; a vial after each boss; and the E(n) HP tables (A4). The squad builds the hooks; the cards themselves come from RESEARCH_CARDS.
3. The short syringe, the marker, focus ghosting, the graze arcs and the EXPOSURE barrel (§4, §3.7).
4. INJECT (§5.4).
5. Grammar tags, the suite audit, the ladders and FAIR-150 (§2.3); boss retunes (B&G, DELTA, OMICRON); card timeouts at 1.6 × TTK.
6. The focus trade-off retune (§3.8).
7. Personality: the THE CELL backdrop (replacing LAB / PETRI), sector intros with magnification, four music arrangements, the lab-voice text pass, LAB REPORT, FIELD NOTES and boss case files.
8. Docs (README, LEVEL_DESIGN, BALANCE, MOVEMENT_AUDIT re-run) and the itch.io ZIP with the root browser QA updated for 12 stages.

**SHOULD (in v1.0 if time allows):** SEQUENCING odds (needs RESEARCH_CARDS' table), the ASSIST game-speed option, high-contrast bullets, attract mode on the new stages, speed trails, and choir volleys quantised to the beat.

**LATER (v1.1 and beyond):**

- Hard mode;
- a visible opt-in risk selector ("VIRULENCE", in the manner of a heat system);
- a daily seed;
- INFECTED CELL and HIJACKER returning as draft-unlocked variants;
- B1 and B2 as score-attack extras;
- remappable keys;
- an endless "R0" mode.

**Risks:**

- **INJECT** may trivialise popcorn or bait deaths. Measure injections per stage and vials lost within 1 s of an injection, and tune the reload and reach.
- **Card power creep** could flatten the ladders. Mitigation: HP follows E(n), plus T6's 40% floor, and RESEARCH_CARDS supplies its strongest build for the test.
- **The cuts** remove tuned content. Every curve test must be re-baselined; the 18-stage numbers in BALANCE.md become history.
- **Whole-sector twists** change boss balance. B&G under BREATH is already the measured outlier (lost 0.50), so retune it before the twist spreads.
- **The 18-minute estimate** comes from bots. Humans are slower; check it in the owner's playtest.
- **The new backdrops and music** must hold the SwiftShader floors (§7 T15). Popcorn geometry stays light.
- **RESEARCH_CARDS may reject A4/A5.** Then E(n) and the mRNA fallback apply, and nothing in §2.2 changes.

## 7. Implementation tests the squad must add

All tests are in `npm test` unless marked *browser*. Today's suites that assume 18 stages (`model`, `curve`, `patterns`, `bosses`, `helpers.HOME`, root QA's stage list) move to the 12-stage order.

| ID | Decision | Test |
| --- | --- | --- |
| T1 | Suite structure | `STAGE_COUNT === 12`. Codes are exactly 1-1 … 4-3; kinds follow [sample, sample, boss] in each sector; bosses alpha, betagamma, delta, omicron at 3/6/9/12; midbosses bigsneezer@1-2, aerosolcloud@2-2, lambda@3-2, mother@4-2; no `bonus` stage in the run; every stage of sector 2/3/4 has twist breath/current/mutation |
| T2 | One new idea per stage | Each level declares `introduces`. On real campaign runs, the archetypes, twists and boss-only families seen first in stage n are exactly `introduces` (plus the stage's own midboss or boss). Every archetype debuts with only WILD TYPE (the existing debut test, re-baselined); HEAVY CROWN first appears through MUTATION in 4-1 |
| T3 | Ladders | `tests/suite-audit.mjs` (the measurement of §1.1, committed) on 8 seeds: near pressure follows the §2.3 sawtooth within ±12%; peaks follow the sawtooth; bosses rise strictly; speeds by grammar (fields ≤ 5, aimed fans ≤ 7, nothing > 9.5 effective); mix bands (aimed ≥ 20%, static ≥ 30% after 1-1's intro, random ≤ 15%); quiet floors; a rest ≥ 2.5 s every 25 s; no lull > 6 s outside intros and card holds |
| T4 | FAIR-150 | Per stage and card: the reactive mean is under the ceiling, plus the worst-seed limit; **no forced hit**: for every hit, the autopilot from the 0.5 s-earlier snapshot avoids it; a lead of ≥ 0.6 s from z ≥ 0; course changes flash 0.3 s first and never turn toward the core within 2 u; the existing gap, wall, overlap, telegraph and exclusion tests stay |
| T5 | Run length | A reference-player clean run is 14–18 min of play; per-stage lengths in band; exactly 11 `draft` events with `boss: true` after 3, 6 and 9; none after stage 12 |
| T6 | HP vs E(n) | Card HP = round(TTK × E(n) × 0.7); every card ends by damage at 75% of E(n) within 80% of its `max(25, 1.6 × TTK)` timeout; with RESEARCH_CARDS' strongest build no card ends under 40% of TTK; popcorn HP scales by E(n)/24 |
| T7 | Syringe | `SYRINGE` total length ≤ 1.7 u; every part's farthest point < `grazeRadius`; core within 0.05 u of the area-weighted silhouette centroid; tilt ≤ 10°; muzzle at the drawn tip; `BODY_RADIUS` = barrel radius; phantom overlaps/min on the audit runs ≤ 30% of the 28.2 baseline (silhouette table from `shapes.mjs`); *browser*: marker = collider within 1 device pixel (existing), syringe length ≤ 40 px at 960×640, body opacity 0.35 ± 0.02 in focus, the core never flickers during invulnerability |
| T8 | INJECT | The tip point equals the drawn tip (*browser*, within 1 px); a touch cures popcorn on the same step; elites take 10 × E(n)/24; a geometry sweep over every card's boss and midboss positions finds no body within reach, and any reachable body takes elite damage only, never an instant cure; reload 0.5 s / 0.8 s; owned bullets become tokens; the tip never damages the player and core-body contact still does; bit-identical at 30/60/120/240 Hz; the reactive referee never injects |
| T9 | MUTATION | A flash lasts 0.8 s (1.2 s in the intro beat); a WILD TYPE becomes a HEAVY CROWN with the HEAVY collider (snapshot); others upgrade one tier inside LIMITS; a mutating virus cured during its flash never fires |
| T10 | RAIN | Rain verse angle 0, so the drift comes only from CURRENT; tagged static; volleys alternate rain and cough; lane clearance ≥ grid spacing − 2 × hit radius |
| T11 | Focus trade-off | Unfocused coverage ≥ 3 u at 10 u; focused single-target DPS ≥ 1.5× unfocused; D2 ≥ 15% (movement audit) |
| T12 | Run, credits, vials | A continue restores the stage's entry build, score and RNG; credits 3 on Normal, unlimited on Easy; 1CC only with zero credits spent; +1 vial after a boss and none after samples; practice uses the reference syringe |
| T13 | EXPOSURE on the syringe | The fluid level equals `grazeProgress / 100` (*browser*, measured from the meniscus); the SOAP grant at 100; graze arcs drawn at the bullet's bearing |
| T14 | Personality | Every stage has an intro of ≤ 60 characters in the lab voice (no `!` outside card names and taunts); each sector has a magnification, a backdrop id, a music preset and a FIELD NOTE; sector 2's music phrase equals the BREATH period (6 s); the march tempo rises as the formation empties; LAB REPORT fields present; the text-over-bullets rule holds (existing) |
| T15 | Performance (*browser*, SwiftShader 960×640) | The 1-1 grid, each sector's backdrop at its peak scene and OMICRON SPIKE CROWN keep a median frame ≤ 17 ms (today's floor) |

## Sources

Read in full this round:

- [Boghog's bullet hell shmup 101](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101)
- [Shmups wiki: Dodging strategy](https://shmups.wiki/library/Dodging_strategy)
- [Sparen's Danmaku Design index](https://sparen.github.io/ph3tutorials/danmakudesign.html)
- [Shmups wiki: Touhou](https://shmups.wiki/library/Unknwn/Touhou)
- [Shmups wiki: DoDonPachi](https://shmups.wiki/library/DoDonPachi)
- [ZUN and Hiroyuki, Touhou Garakuta](https://en.touhougarakuta.com/article/specialtaidan_zun_hiroyuki_5-en/)
- [Returnal GDC 2022 recap (Krueger)](https://www.gamedeveloper.com/marketing/a-third-person-action-roguelike-bullet-hell-arcade-thriller-the-making-of-returnal)

From search summaries (treat details as approximate):

- Danmaku design: [Sparen A2](https://sparen.github.io/ph3tutorials/ddsga2.html), [A3](https://sparen.github.io/ph3tutorials/ddsga3.html), [A4](https://sparen.github.io/ph3tutorials/ddsga4.html)
- Cave and Ikeda: [Time Extension, the DonPachi series](https://www.timeextension.com/features/cave-story-the-history-of-donpachi-the-shmup-series-that-changed-everything)
- Touhou: [Embodiment of Scarlet Devil](https://en.wikipedia.org/wiki/Embodiment_of_Scarlet_Devil), [Imperishable Night](https://en.wikipedia.org/wiki/Imperishable_Night)
- Other shmups: [Radiant Silvergun](https://shmups.wiki/library/Radiant_Silvergun), [Ikaruga](https://en.wikipedia.org/wiki/Ikaruga), [Psyvariar](https://en.wikipedia.org/wiki/Psyvariar), [Space Invaders](https://en.wikipedia.org/wiki/Space_Invaders)
- Rank: [Battle Garegga rank](https://shmups.wiki/library/Battle_Garegga/Advanced_Rank), [shmups.system11 Garegga thread](https://shmups.system11.org/viewtopic.php?p=1209400)
- Roguelikes: [Nuclear Throne](https://en.wikipedia.org/wiki/Nuclear_Throne), [Enter the Gungeon, AV Club on Crooks' "expressive patterns"](https://www.avclub.com/what-other-games-can-learn-from-the-bullet-hell-ge)
- Level design: [Hayashida's kishōtenketsu (Game Developer)](https://www.gamedeveloper.com/design/the-secret-to-i-mario-i-level-design), [GMTK summary (MCV)](https://www.mcvuk.com/development/video-nintendos-level-design-secrets-in-four-steps)
- Accessibility: [Celeste Assist Mode (Vice)](https://www.vice.com/en/article/d3w887/celeste-difficulty-assist-mode), [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/)
- Design sins: [Nomad's design sins](https://nomadsreviews.co.uk/post/design-sins-and-pet-peeves-in-shoot-em-ups)

Local evidence:

- `levels.mjs`, `patterns.mjs`, `bosses.mjs`, `core.mjs`, `hitboxes.mjs`, `shapes.mjs` (`SYRINGE`) and `render.mjs` (syringe build, tilt), at `9045f8f`;
- `BALANCE.md` (8-seed curve), `MOVEMENT_AUDIT.md` (E2, D2 and crossing WARNs), `RESEARCH_BULLET_HELL.md`;
- the scratch measurements of §1.1 and §4.1 (reactive player and autopilot, run outside the repository; to be committed by the squad as `tests/suite-audit.mjs`).
