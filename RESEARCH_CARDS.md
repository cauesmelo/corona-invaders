# Corona Invaders: the adjuvant draft (upgrade cards), design brief for v1.0

Prepared 2026-11-10 by the systems designer (progression, economy, roguelike drafting). This is a design brief: no code, test or asset was changed. Every number is a starting value for the implementation squad, and the measured tables below come from a throwaway simulation of these rules (described in §4.6), not from the game. Units follow [BALANCE.md](./BALANCE.md): world units (u), seconds, u/s.

**The studio owner's idea (translated):**

- After each stage, draw 3 cards; the player picks 1, and it modifies the syringe.
- Aim for "about 30" cards.
- Example effects: damage, fire rate, double shot, speed, more hearts, a recharging shield.
- Four tiers (common, rare, epic, legendary), each with its own odds.
- Beating a boss raises the odds of better cards.

**Coordination with [RESEARCH_V1.md](./RESEARCH_V1.md).** The level designer's brief (commit `11a67cf`) landed while this one was written. It restructures the run into 12 stages (4 sectors × 3, bosses at stages 3, 6, 9 and 12) with 3 credits on Normal, and states assumptions A1–A8 for this brief. §2.8 accepts or overrides each one. All numbers here are given for that 12-stage run, with today's 18-stage campaign as the fallback (§4.7) if RESEARCH_V1 is not adopted.

## 0. Verdict: the twelve decisions

1. **The owner's core loop ships as asked.** After every stage except the last, 3 cards are drawn and 1 is picked: 11 drafts in RESEARCH_V1's run. Every example effect is in the set: damage, cadence, double shot, speed, more vials and a recharging shield.
2. **They are called ADJUVANTS in the game, not "cards".** In Corona Invaders a "card" already means a boss's mutation card (VIRAL LOAD, "MUTATION 2/4", NEUTRALIZED, RESEARCH_V1's "x/19 cards"). An adjuvant is the real substance added to a vaccine to strengthen the immune response, so the name is both clear and on theme. The draft screen is called FORMULATE. This document says "adjuvant" or "card" interchangeably.
3. **The campaign is the run.** There is no separate "Outbreak run" mode. A run is RESEARCH_V1's 12-stage campaign, with credits, continues from stage entry and the 1CC stamp; adjuvants are drafted between its stages (§2.1).
4. **Adjuvants are never lost on death.** A continue restores the build the stage was entered with (A2). A new run starts empty, and there is no meta-power between runs.
5. **30 adjuvants:** 10 common, 9 rare, 6 epic and 5 legendary, in five lines (NEEDLE, ANTIBODY, DOSE, SOAP, GRAZE). Each tier is fixed per card: an adjuvant's name always means the same effect (§3.1).
6. **Odds:** per-slot tier weights by **titer** (non-final bosses defeated), plus a boss bonus that is both temporary and permanent:
   - Each boss permanently shifts the table toward rarer cards.
   - The first slot of the boosted draft after a boss is always Epic or better. Its Legendary chance rises with SEQUENCING (RESEARCH_V1 A6): 12% + 16% × the share of that boss's cards you NEUTRALIZED.
   - A hidden **incubation** counter (Slay the Spire–style pity) and a floor rule stop long common streaks (§4).
7. **No dead picks:** a card that would do nothing (maxed, no antibodies yet, built into Easy, speed on touch, damage over the cap) is never offered.
8. **Legendaries complete a line.** Each requires two earlier picks from its line, and a run holds at most two.
9. **The mRNA power ladder stays** (overriding A5, using RESEARCH_V1's own fallback order: L2 by 1-2, L3 by 2-2, L4 by 3-2). Enemy HP scales with the **expected potency** at each stage. That potency is measured from a random-drafting bot and frozen as a table, and it replaces A4's provisional E(n). It never scales with *your* deck. The median deck keeps the tested time-to-kill (TTK), so picks can be big enough to feel without flattening the curve.
10. **Hard guard-rails:**
    - A potency limit that rises with titer: ×1.5 / ×1.8 / ×2.0 / ×2.2.
    - Per-stat caps.
    - A survivability ceiling: no Normal deck without legendaries is tougher than Easy.
    - Patterns never scale with adjuvants.
11. **No adjuvant touches collision geometry.** The core radius (0.2 u), the graze ring (1.0 u), bullet solids, needle segments and INJECT's tip collider are constant. The shield is an extra hit charge on the existing core test, not a bubble, and nothing that looks like a hitbox is drawn around the core (A7).
12. **v1.0 ships all 30 cards**, one draft screen for keyboard, mouse and touch, a HUD rack, syringe accessories for the shield and legendaries, and per-tier reveal sounds. Codex, daily seed, banish and meta-unlocks come later (§7).

Where the owner's idea was adjusted and why:

- **The "double shot" is +1 needle, not a doubled volley.** The user asked earlier for a calmer, lower fire rate (README, `core.mjs` `fireInterval`). A doubled volley would double the needles on screen.
- **Speed is capped at 12.9 u/s.** At 14 u/s the 150 ms reactive player lost 2–4× more vials (MOVEMENT_AUDIT.md), so more speed is double-edged here. At the cap the box crossing is still 1.38 s, over RESEARCH_V1's 1.2 s floor (A7).
- **The shield is a charge on the core, not a bubble around it.** The user demanded that the drawn marker equal the collider.
- **"Better odds after a boss" happens twice.** Once in the boosted draft and once in the titer. The boss slot alone would make only one draft per sector feel better; the titer alone would be invisible.

## 1. Research: how successful drafts work

### 1.1 Game by game

| Game | What it does (verified numbers) | What we take | What we avoid |
| --- | --- | --- | --- |
| **Slay the Spire** | 3 cards per reward, rarity rolled per card. Normal fights: 60% common / 37% uncommon / 3% rare. Elites: 50 / 40 / 10. Boss rewards are always rare. Pity: the rare chance starts 5 points low, rises 1 point per common rolled, and resets when a rare appears. Shops read this offset but never change it. You may skip a reward (the Singing Bowl relic turns a skip into +2 max HP). The team balanced cards with per-run metrics ([wiki.gg](https://slaythespire.wiki.gg/wiki/Cards), [Fandom](https://slay-the-spire.fandom.com/wiki/Card_Rewards), [GDC 2019](https://gdconf.com/news/learn-slay-spires-successful-metrics-driven-approach-game-balancing-gdc-2019), [Game Developer](https://www.gamedeveloper.com/design/how-i-slay-the-spire-i-s-devs-use-data-to-balance-their-roguelike-deck-builder)) | Per-slot rarity rolls, a pity counter fed by commons, the boss draft as the guaranteed big moment, skip with compensation, metrics-driven tuning (§5.6) | Fifteen-plus card rewards with a 3% rare: fine for a deck-builder, too stingy for 17 picks that each must matter |
| **Hades** | Four rarities (Common, Rare, Epic, Heroic) that scale the *same* boon's numbers. A Duo needs boons from two specific gods; a Legendary needs specific boons of its god ([Fextralife](https://hades.wiki.fextralife.com/Boons)). Mirror talents add +1% Epic chance per rank (20 ranks) or +1% Legendary/Duo per rank (10 ranks) ([SegmentNext](https://segmentnext.com/hades-mirror-of-night-upgrades-guide)). With no prerequisite met, a god's Legendary chance is zero ([Steam](https://steamcommunity.com/app/1145360/discussions/0/2965016712304165250)) | **Legendary prerequisites** (two picks in the line): legendaries complete a build and are never dead. Small, additive rarity shifts | Magnitude tiers (the same boon at four strengths): see §3.1 |
| **Vampire Survivors** | 3 level-up choices, a 4th via Luck (+10% per rank, max +30%). Reroll, Skip (take experience instead) and Banish are limited, upgradable resources ([gamerjournalist](https://gamerjournalist.com/what-does-luck-do-in-vampire-survivors-answered), [Prima](https://primagames.com/?p=67903), [wiki](https://vampire.survivors.wiki/w/Preserve)) | Rerolls as a scarce, earned token, and skip compensation | Run-ending "nothing can touch me" power. Players report late runs that are too easy; see §1.2 |
| **Brotato** | 4 upgrades per level-up. Tiers I–IV scale one stat: Max HP +3/+6/+9/+12, Damage +5/+8/+12/+16, Attack Speed +5/+10/+15/+20. Levels 5, 10, 15, 20 and 25 guarantee a tier ([Upgrades](https://brotato.wiki.spellsandguns.com/Upgrades)). Shop tier odds rise per wave with caps: T2 +6% a wave up to 60%, T3 +2% up to 25%, T4 +0.23% from wave 8 up to 8%, all × (1 + Luck). The reroll price climbs within a shop ([Shop](https://brotato.wiki.spellsandguns.com/Shop)) | Odds that rise through the run toward caps, and a deterministic milestone floor (our boss slot) | Pure stat tiers: they read as sludge without the item layer Brotato has on top |
| **Balatro** | Joker weights 70% common / 25% uncommon / 5% rare. Legendaries have no shop weight and come only through the Soul spectral card. Rerolls cost $5, +$1 per reroll in the same shop ([summary](https://saschb2b.github.io/game-mechanics/games/balatro/jokers), secondary source) | Legendary as a special event, not a slot filler; rerolls that get dearer | A real currency: our score is not spent (it buys vials at 250k and 750k) |
| **Enter the Gungeon** | Chest quality D/C/B/A/S shifts by floor: 35/32/20/9/4% on floor 1, 0/10/42.5/35/12.5% on floor 5. A synergy chest (about 5%) favours items that complete a synergy ([Chests](https://enterthegungeon.wiki.gg/wiki/Chests), [Quality](https://enterthegungeon.wiki.gg/wiki/Quality)) | Odds by depth (our titer), and named synergies shown to the player | Hidden synergies a player can't read |
| **Nuclear Throne** | 4 mutations per level, about 8 per run (a 9th via a crown), ultras at level 10. Every mutation changes play: Rhino Skin +4 max HP; Trigger Fingers (kills cut reload by 40%); Strong Spirit blocks one lethal hit and recharges at full HP on a later level; Patience defers the choice ([guide](https://idntg.pages.dev/mutations)) | Every pick noticeable. A protection that re-forms on a slow condition, not a short timer (our coating). Deferral as a skip option | Character-specific ultras: CI has one syringe |
| **Binding of Isaac** | Soy Milk: damage ×0.2 against a large fire-rate gain. The wiki's own analysis finds it a DPS loss at already-fast tear rates ([wiki.gg](https://bindingofisaacrebirth.wiki.gg/wiki/Soy_Milk), [talk](https://bindingofisaacrebirth.wiki.gg/wiki/Talk:Soy_Milk)) | Trade-offs need a visible before → after number, or they become traps | Multipliers so extreme that interactions invert the card |
| **Risk of Rain 2** | Small chest about 79.2% common / 19.8% uncommon / 0.99% legendary; a large chest 80% uncommon / 20% legendary ([Large Chest](https://riskofrain2.wiki.gg/wiki/Large_Chest)). Effects that could break are stacked hyperbolically (for example 1 − 1/(1 + 0.15n)) ([Item Stacking](https://riskofrain2.wiki.gg/wiki/Item_Stacking)) | Caps and diminishing stacks on anything that protects | Unbounded linear stacking |
| **Halls of Torment** | Could not verify its level-up rarity rules (the wiki refused access). A player post documents trait tiers unlocking at levels 0, 5, 15, 30 and 50 ([Steam](https://steamcommunity.com/app/2218750/discussions/0/5590708606436450449)) | Nothing claimed | — |
| **Steredenn** (roguelite shmup) | Beating a boss offers perks, stat buffs and modifiers, including a shield that recharges while you hold your fire. The reviewer's complaint is perks that don't suit your weapon. No permanent upgrades ([Pocket Gamer, 2017](https://www.pocketgamer.com/steredenn/review/), [shmups.wiki](https://www.shmups.wiki/library/Steredenn)) | A recharging shield is a proven shmup pick. Upgrades between stages, not mid-fight | Off-build offers: our line diversity and eligibility rules |
| **Nova Drift** (shmup) | Level-up mods in a branching web, with rerolls and banish. "Wild" mods are a gamble that can rewrite a build ([itch.io](https://pixeljam.itch.io/nova-drift), [devlog](https://pixeljam.itch.io/nova-drift/devlog/84291/the-virulence-update-is-live)) | Prerequisites that open later options | A 200-mod web: too much for a 20-minute browser run |
| **Rogue Star Rescue** | A bullet-hell plus tower-defense roguelite with 200+ guns and items ([itch.io](https://chuteapps.itch.io/rogue-star-rescue)) | Confirms the bullet-hell + roguelite market | Volume over clarity |
| **Jamestown+, Danmaku Unlimited 3** | Not draft games (correcting the brief's list). Jamestown's full Gauntlet run is an optional mode ([Wikipedia](https://en.wikipedia.org/wiki/Jamestown:_Legend_of_the_Lost_Colony)). DU3's scoring is graze-driven, with a Trance state earned by playing at the knife's edge ([shmups.wiki](https://shmups.wiki/library/Danmaku_Unlimited_3), [TouchArcade](https://toucharcade.com/2017/09/14/danmaku-unlimited-3-review/)) | The GRAZE line's FEVER is our Trance: grazing earns a short powered state | — |

### 1.2 What players say makes picks meaningful, bloated or broken

- **Stat sludge.** Players keep asking for skills that change play rather than "+10% damage" ([Roguepoint board](https://roguepoint.featurebase.app/p/skills-feel-bland-and-do-not-change-gameplay-drastically-enough), [Wayline](https://wayline.io/blog/roguelike-itemization-balancing-randomness-player-agency)). Elise Avery (The Escapist, 2022) argues that a difference in scale only matters if it changes how you play, and that scaling enemies to the player makes gains feel null, as in Oblivion ([The Escapist](https://www.escapistmagazine.com/roguelites-items-power-scale-game-development-vampire-survivors/)). **Our answer:**
  - Every common is a noticeable step in its domain (+6–15%, one vial or one SOAP).
  - 14 of the 30 cards add a behavior (pierce, split, jet, tag, aim, coating, lipid burst, aliquot, auto-SOAP, foam, regen, ring-dependent damage, fever, graze needles).
  - HP scales with the stage's *expected* potency, never with the player's deck.
- **Big swings are safe in short runs.** Tom Francis's analysis of Slay the Spire makes this point ([summary](https://pixelpoppers.com/link/a25cb9/what-works-and-why-juicy-maths-in-slay-the-spire/)). A run lasts about 18–20 minutes, so rares and legendaries can be large.
- **Runaway power kills the decisions.** William Hughes (A.V. Club, 2026) argues that when one combo always wins, "the decision-making fundamental to the artform is rendered vestigial at best" ([A.V. Club](https://www.avclub.com/game-theory-vampire-crawlers)). Vampire Survivors players report late runs that feel too easy ([Steam](https://steamcommunity.com/app/1794680/discussions/0/3194745954518386236)). **Our answer:** the titer potency limit, the survivability ceiling and fixed patterns (§5).
- **Droughts and streaks feel unfair.** Dota 2's pseudo-random distribution raises a proc's chance after every miss and resets it on a hit. A 25% effect starts near 8.5% and is guaranteed by about the 12th attempt ([Diplograph](https://diplograph.net/notes/games/randomness/dota-2-prd), [Liquipedia](https://liquipedia.net/dota2/Random_Distribution)). Slay the Spire does the same for rares. **Our answer:** incubation plus the floor rule (§4.3).
- **Dead picks.** Steredenn's reviewer disliked perks that don't suit the weapon (above). **Our answer:** the eligibility rules (§4.4).

## 2. The structure

### 2.1 Run model: the campaign is the run

**Options considered:**

- **A separate "Outbreak run" mode beside an adjuvant-free campaign.** Two modes to balance, two meanings of "clear", and half the players never meet the drafts.
- **Full permadeath.** It throws away up to 18 minutes and contradicts the fast-retry UX. RESEARCH_V1 §2.1 rejects it for the same reason.
- **Merge:** the campaign *is* the run.

**Decision: merge,** which is also RESEARCH_V1's run. The campaign already behaves like a run: every stage has a checkpoint with power, score and RNG, and the run ends in a final boss.

- **Length.** RESEARCH_V1 budgets its 12 stages at about 15.6 min of play and about 18 min with 11 drafts of about 10 s and the reports. Two retried stages add about 2.5 min, inside the 15–25 min target.
- **One mode keeps conceptual integrity:** "play Corona Invaders" means one thing.

| Title choice | What it does |
| --- | --- |
| **NEW RUN** (Easy / Normal) | Starts at 1-1 with no adjuvants, a fresh run seed, 1 RESAMPLE token, titer 0, and 3 credits on Normal (unlimited on Easy) |
| **RESUME RUN** | Shown only when a saved run exists. Continues from its last stage entry |
| **SPECIMEN TRAY** | PRACTICE and MUTATION LAB on the reference syringe (§2.6), with no drafts |

**The FINAL REPORT** (RESEARCH_V1 §5.3) shows:

- the build: every adjuvant with its stacks, in line order;
- the score, the 1CC stamp and the credits used;
- the variants sequenced;
- one badge of ours, **PLACEBO GROUP**, for a run that discarded every draft.

The 1CC stamp (cleared on one credit) is the expert target and the source of tension in place of permadeath.

### 2.2 When drafts happen

- **After every cleared stage except the last:** 11 drafts in RESEARCH_V1's run (A1). The model emits `draft { stage, boss, sequenced, vesicleBonus }`; `vesicleBonus` is always `false` (§2.8).
- **The flow:**
  - A stage ends with its LAB REPORT (2.5 s, skippable), then the **FORMULATE** screen (no timer), then the next stage.
  - After a non-final boss: FIELD NOTE, the SEQUENCED readout, then a **boosted draft** (stages 3, 6 and 9), then the next sector.
  - The final boss (4-3) ends the run with the FINAL REPORT; there is no draft.
- **The board is already empty when the draft opens.** `finishSector` clears it, and nothing simulates during a draft. The model gets a new phase, `'draft'`. It is not in `PLAYING`, so `update()` returns early as on pause. The UI resolves it with `pickAdjuvant(s, i)`, `resample(s)` and `discard(s)`, which then call `beginNextSector`.
- **Input rules match the existing loss and report screens.** The screen ignores input for 0.5 s and needs a fresh press. Space or X held from the fight must be released first. A SOAP press on the draft screen is dropped and never carries into the next stage.
- **Midbosses add no draft.** They guarantee the mRNA steps (§2.8, A5).

### 2.3 Deaths, credits, continues and saves

- **Death inside a stage works as today:** −1 vial, −1 mRNA level as a catchable strand, bullets cancelled, a 0.5 s glide and 2.5 s of invulnerability. Adjuvants are untouched; losing a build on death would create the death spiral the mRNA catch-back was designed to avoid.
  - The ENTERIC COATING re-forms on respawn and at every stage start.
- **Vials (RESEARCH_V1):** a boss clear restores 1 vial; sample clears restore none. That is what makes EXTRA DOSE and the coating worth a pick.
- **Losing the last vial spends a credit** (A2, RESEARCH_V1 §2.1). The stage restarts from its entry snapshot.
  - The snapshot holds the build, score and RNG. It now also holds the deck (id, stacks and the stage each card was taken at), incubation, the floor flag, RESAMPLE tokens, titer, the legendary count and the draft RNG state.
  - With no credit left, the run ends at the FINAL REPORT; the deck is gone with it.
  - Easy has unlimited credits.
- **Switching to Easy mid-run keeps the deck.** REFLEX ARC and EPIPEN stay but are never offered on Easy, which has auto-SOAP built in.
- **Saving.**
  - Key: `corona-invaders-v6-run`, holding `{ v: 1, seed, difficulty, stage, credits, score, kills, hits, shotsFired, projectilesFired, power, extendsGiven, deck, incubation, lastAllCommon, tokens, titer, sequenced, draftRng, offer, discards }`.
  - It is written at every stage entry (after the pick) and after every resample, so reloading cannot reroll an offer or refund a token.
  - A missing or corrupt save hides RESUME. With storage blocked the run still plays, as today's rule says, but cannot be resumed.
  - Existing `v5` keys (unlocks, medals, scores, cards seen) stay valid.
- **Determinism.**
  - Draft RNG is its own xorshift stream, seeded from the run seed (`seed ^ 0x9e3779b9`). It never reads or writes `s.rngState`, so every stage replays exactly as it would without drafts.
  - Offer *n* depends only on the run seed and the draft history (picks, resamples, discards and sequencing results).
  - Card effects use no randomness: split angles and aim targets are deterministic.

### 2.4 Rerolls: RESAMPLE tokens

- **Earning and spending.**
  - A run starts with 1 token.
  - Each non-final boss defeated gives +1.
  - A **fully sequenced** boss (every one of its cards NEUTRALIZED) gives one more. This replaces the bonus-stage source, since RESEARCH_V1 cuts the bonus stages.
  - At most 3 are held.
  - One token redraws all three slots under the same rules. A boosted draft keeps its boss slot and its sequencing odds.
- **Incubation counts every offer shown,** so resamples feed the pity counter.
- **Why a scarce earned token rather than a price:** Vampire Survivors and Nova Drift make rerolls a limited resource, and Brotato and Balatro make them dearer as you go. CI has no spendable currency: score is not spent, it buys extends at 250k and 750k.

### 2.5 Skip: DISCARD

The player may take none of the three. **Compensation:** +1 SOAP (up to the stock cap) and +3 incubation, as if three commons had been shown. A second press confirms it.

**Why skip exists at all,** given there are no dead picks:

- It lets a player refuse trade-offs.
- It enables the PLACEBO challenge.
- It is the genre convention (Slay the Spire's skip, Nuclear Throne's Patience, Vampire Survivors' skip, Balatro's skip tags).

The compensation is small on purpose, so skipping never beats a pick.

### 2.6 Practice: the reference syringe (STANDARD ISSUE)

PRACTICE and the MUTATION LAB start a stage or card out of sequence, with no deck (A8: builds are a run thing). Enemy HP scales with expected potency (§5.3), so a deckless start would be harder than playing through.

**STANDARD ISSUE fixes it.** It is RESEARCH_V1's reference syringe (A3): the base kit at the stage's guaranteed mRNA level, with needles and antibodies dealing ×`EXPECTED_POTENCY[stage]` (shown as `STANDARD ISSUE ×1.30`), and no defensive or mobility adjuvant. TTK then equals the median run.

**Fairness is authored against it.** FAIR-150 passes with it, and no stage or card may need an adjuvant to pass.

### 2.7 Easy and medals

- **Easy keeps its kit.** 5 vials, 3 SOAP, auto-SOAP, ×0.85 HP, unlimited credits and the rest. Adjuvants apply on top, and EXTRA DOSE raises Easy's 5 vials to at most 7.
- **An absorb (ENTERIC COATING or LNP SHELL) voids the card capture and counts as a lost vial for the stage medal.** Medals and SEQUENCING measure the player, and the coating is passive insurance.
- **An EPIPEN save counts like a deathbomb** (a SOAP was used, so the capture is voided and the vial is kept). This matches how Easy's auto-SOAP is scored today.
- **A BACKUP ALIQUOT catch-back still counts the vial as lost.**

### 2.8 RESEARCH_V1's assumptions: accepted or overridden

| Item | Verdict | Detail |
| --- | --- | --- |
| **A1** Cadence: drafts after stages 1–11, boosted after 3, 6, 9; the `draft` event | **Accept** | `vesicleBonus` is declined and always `false`. The VESICLE keeps carrying mRNA (A5 below), and a 4th option would change the three-slide layout and dilute the boosted draft's moment |
| **A2** Builds permanent; a continue restores the entry build | **Accept** | §2.3 |
| **A3** Fairness against a card-free reference syringe | **Accept** | The reference syringe is STANDARD ISSUE (§2.6). FAIR-150 is also run at the two speed extremes adjuvants allow (§5.6, item 7) |
| **A4** HP follows an expected-DPS curve, not the build | **Accept the principle; replace E(n)** | `dpsRef = powerDps[entryPower − 1] × EXPECTED_POTENCY[stage]` (§5.3), because the mRNA ladder stays. The provisional E(n) (ALPHA 26.9, B&G 31.2, DELTA 35.5, OMICRON 39.8) becomes 25.0 / 35.7 / 54.2 / 62.6. The strongest legal build for T6 is `STRONGEST_BUILD` (§5.4). At the titer limit it ends a card at 0.7 × E ÷ limit of its TTK: at least 44% (2-2's midboss), against T6's 40% floor. The margin is thin, so test 11 asserts it |
| **A5** Retire the mRNA ladder; the draft replaces it | **Override: keep mRNA** | Use RESEARCH_V1's own fallback order: L2 by 1-2, L3 by 2-2, L4 by 3-2, from the midbosses and vesicles. Reasons below the table |
| **A6** SEQUENCING raises the boosted draft's odds | **Accept** | Boss-slot Legendary weight = 12 + 16 × (cards NEUTRALIZED ÷ that boss's cards); Epic takes the rest (§4.1). A fully sequenced boss also gives a RESAMPLE token |
| **A7** Card hooks are parameters | **Accept, with two refusals** | INJECT reload: card 27 (RETRACTABLE NEEDLE). SOAP stock, vials and speed: yes (speed ≤ 12.9 u/s, so the crossing is ≥ 1.38 s, over the 1.2 s floor). **Refused:** a graze-radius card, even for scoring, because the ring is drawn, defines LIVE CULTURE and FEVER, and a wider ring rewards grazing from farther away. **Refused:** a needle-reach card, because a longer drawn needle brings back the overlaps RESEARCH_V1 §4 removed |
| **A8** Practice uses the reference syringe | **Accept** | §2.6 |
| Credits (3 on Normal, unlimited on Easy), continue from stage entry, the 1CC stamp | **Accept** | Replaces this brief's earlier unlimited-retry idea and its ONE DOSE badge |
| Vials: +1 after a boss, none after samples | **Accept** | Gives defensive cards their value. The hits-to-game-over ceiling (§5.4) is per stage and unchanged |
| Bonus stages cut | **Accept** | The bonus-stage RESAMPLE source moves to full sequencing |
| Card timeouts `max(25, 1.6 × TTK)` | **Accept** | It widens the margin for defensive decks (§5.3) |
| A 1.64 u syringe, the core at its centroid, INJECT's tip glint | **Accept** | Accessories sit on the collar, thumb rest, hub and antibodies, never around the core; the tip glint stays INJECT's alone (§6.2) |

**Why the mRNA ladder stays (A5):**

1. **It is the genre's own power level, and it is visible on the syringe.** Needles grow from 3 to 5, and the Y-shaped antibodies arrive at L2 and L4. The ANTIBODY line builds on those antibodies; under A5 the most iconic part of the syringe would exist only for players who drafted it.
2. **It gives death a recoverable cost** (−1 level and the 4 s catchable strand) without ever taking an adjuvant away.
3. **Guaranteed and chosen power stay bounded separately.** Potency, its titer limit and `EXPECTED_POTENCY` are all relative to the mRNA level.
4. **Nothing in RESEARCH_V1 §2.2 changes.** RESEARCH_V1 already wrote this fallback, including the new mRNA order.

## 3. The card set

### 3.1 Count, tier split and model

**30 adjuvants: 10 common, 9 rare, 6 epic, 5 legendary.**

- **Why 30 (the owner's number holds up):**
  - Steredenn: Binary Stars ships about 30 upgrades for a run of similar length, and Nuclear Throne makes about 8 picks a run from 4 offers each. Our pool matches Steredenn's, and our 11 picks a run are close to Nuclear Throne's 8.
  - A run shows 33 cards (11 × 3): about 15.5 commons, 9 rares, 7 epics and 1.3 legendaries (§4.6). Each common is seen about 1.5 times a run, each epic about once, and each legendary in about a quarter of runs. A run therefore uses about a third of the set, and two runs rarely look alike.
  - Fewer than about 24 cards and runs repeat. More than about 36 and legendaries would rarely be seen, and the set couldn't be implemented, tested and given readable text for v1.0.
- **Five lines of 4–9 cards,** each with one legendary capstone: NEEDLE 9, ANTIBODY 5, DOSE 6, SOAP 6, GRAZE 4 (NEEDLE 8 and GRAZE 5 if INJECT is cut; see card 27). NEEDLE is the largest because shooting is the core fantasy.
- **Tiers are fixed per card, not magnitudes of one card** (the Hades/Brotato model):
  1. A name always means one effect, so players learn 30 cards instead of 120 variants.
  2. Rarity buys *kind* (behaviors at Epic and Legendary), not just bigger numbers, which is the cure for stat sludge.
  3. The balance surface is 30 entries.
  4. "Better cards" in the owner's sense are rarer cards that do more.
- **Three explicit trade-offs:** 18G WIDE BORE, GLASS SYRINGE and LIVE CULTURE. SILICONE PLUNGER is double-edged by measurement: more speed means more overshoot.

### 3.2 Rules every card obeys

- **Collision geometry is constant.** `ship.radius === RULES.shipRadius` (0.2 u), graze ring 1.0 u, needle segment r 0.06 and 0.9 u long. Bullet solids, enemy bodies and `hitboxes.mjs` stay untouched. INJECT's tip collider (RESEARCH_V1 §3.10) is never changed by a card. The one new collider is JET INJECTOR's rectangle, added to `hitboxes.mjs` and drawn at exactly its width, like lane beams. Bans:
  - No card changes the graze radius, even for scoring only (§2.8, A7). A wider ring would reward grazing from farther away.
  - No card changes the needle's reach. A longer drawn needle would bring back the phantom overlaps that RESEARCH_V1 §4 cut by 81%.
  - No card shrinks the hitbox, and nothing ring-shaped is drawn around the core.
- **Cards never change enemy patterns,** bullet speeds, caps, telegraphs or the formation.
- **One new pure module, `adjuvants.mjs`,** holds the card data, `kitOf(deck, ctx)` (the modifier set) and `rollOffer(run, ctx)`. The model reads `s.kit.*` wherever it reads `RULES.*` for a player stat today. It recomputes `s.kit` only when the deck, the mRNA power or difficulty changes.
- **The legacy flag `createState({ adjuvants: false })`** keeps every one of today's 144 tests bit-identical: no drafts, no `E` scaling, `s.kit` equal to the base rules.
- **Card text is generated from the data,** so the numbers can't drift from the effect.

### 3.3 The 30 adjuvants

Abbreviations:

- **Tier:** C common, R rare, E epic, L legendary.
- **Max:** the most copies a run can hold.
- **Prereq L:** a legendary needs 2 earlier picks from its line (copies count).
- All damage bonuses in the same bucket add together, then the caps in §5.2 apply.

#### NEEDLE line: the main stream (tags Needle, Spread, Pierce, Focus)

| # | Name | Tier | Exact effect | Max | Tags | Hook |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **CONCENTRATE** | C | Needles deal +10% damage | 3 | Needle | `autoFire` damage: `kit.needleDamage` |
| 2 | **RAPID RELEASE** | C | Fire rate +8% per copy (8 → 8.64 → 9.28 volleys/s; never above 10) | 2 | Needle | `kit.fireInterval` replaces `RULES.fireInterval` |
| 3 | **STEADY HAND** | C | While focused, needles deal +12% more | 2 | Focus | `autoFire` damage when `ship.focus` |
| 4 | **TWIN BARREL** (the double shot) | R | +1 parallel needle in focus (3→4 … 5→6, 0.25 u apart). SPRAY gets +2 needles at the next ±4° step (3→5, 5→7) | 1 | Needle, Spread | `autoFire` counts and angles |
| 5 | **HOLLOW BORE** | R | Needles pass through the first virus and hit a second one at 60% damage (never the same virus twice) | 1 | Pierce | `updateShots`: `shot.pierce`, `shot.hitIds` |
| 6 | **18G WIDE BORE** | R, trade-off | Needles deal +30% damage. Cost: the syringe is 8% slower (11.5 → 10.58 u/s; focus stays 5.0). Not offered on touch, where speed is drag-mapped | 1 | Needle, Trade-off | `kit.needleDamage`, `kit.speedMul` in `moveShip` |
| 7 | **SPLIT TIP** | E | A needle that kills a virus splits into 2 needles at ±25° from its heading (your needle damage, no further split, at most 24 alive). The virus's REPLICATION, turned against it | 1 | Spread | `killEnemy` source `shot` → push 2 `split` shots |
| 8 | **JET INJECTOR** | L (prereq 2 NEEDLE) | In focus, a needle-free jet (a real vaccine device) replaces the focused needles. It is a 0.5 u-wide cyan stream from the tip to the back edge that hits every virus whose body overlaps it, for 1.25× your focused needle DPS (every NEEDLE card applies). It destroys shootable virions; closed BLOOM buds and an intangible twin spark. SPRAY is unchanged and antibodies still fire | 1 | Needle, Pierce, Focus | New `updateJet(s, dt)`; rectangle in `hitboxes.mjs`; drawn under bullets at ≤ 45% opacity |

#### ANTIBODY line: the Y-shaped options (tag Antibody)

| # | Name | Tier | Exact effect | Max | Tags | Hook |
| --- | --- | --- | --- | --- | --- | --- |
| 9 | **IgG BOOST** | C | Antibody needles deal +15% damage. Needs antibodies | 3 | Antibody | `autoFire` antibody push |
| 10 | **CLONAL EXPANSION** | R | Antibodies arrive one mRNA level early: 2 at L1, 4 at L2–L3. At L4, antibody needles deal +20% instead. Makes antibody cards eligible at L1 | 1 | Antibody | `optionOffsets(min(4, power + 2), focus)` |
| 11 | **AFFINITY MATURATION** | R | Antibody needles gain +4% damage for every sample cleared after you take it (max +40%), so taking it early pays. Needs antibodies | 1 | Antibody, Scaling | deck entry `at`; `kitOf` reads samples cleared |
| 12 | **OPSONIN TAG** | E | An antibody needle tags the virus for 2 s; tagged viruses take +15% damage from every source (needles, jet, SOAP, cell pops). Bosses can be tagged. Needs antibodies | 1 | Antibody | `damageEnemy` / `damageBoss` multiplier; `e.taggedUntil` |
| 13 | **HERD IMMUNITY** | L (prereq 2 ANTIBODY) | Each antibody aims, when it fires, at the nearest tangible virus within 9 u, clamped to ±60° of straight up the board so it never fires back toward you. Antibodies fire 50% faster (4 → 6 needles/s each) | 1 | Antibody, Homing | `autoFire` antibody angle via `aimAngle`; `kit.abInterval` |

#### DOSE line: vials, coating, motion (tags Vial, Shield, Motion)

| # | Name | Tier | Exact effect | Max | Tags | Hook |
| --- | --- | --- | --- | --- | --- | --- |
| 14 | **EXTRA DOSE** | C | +1 max vial, and one vial filled now (Normal 3 → 5, Easy 5 → 7 at two copies) | 2 | Vial | `kit.maxVials` replaces `diff(s).health` in `beginNextSector`, `restartGame` and `die` |
| 15 | **SILICONE PLUNGER** | C | Speed +6% per copy (12.19 → 12.88 u/s); focus stays 5.0 u/s. Not offered on touch | 2 | Motion | `kit.speedMul` in `moveShip` (keys and pointer) |
| 16 | **ENTERIC COATING** (the recharging shield) | R | A coating, drawn as a cyan glaze on the finger collar and thumb rest (never around the core), absorbs one core hit: the bullet is destroyed, 1.0 s of invulnerability, no vial lost. It re-forms 30 s after it breaks (20 s with two copies), and is full at every sample start and respawn. An absorb voids the card capture and counts as a lost vial for the medal | 2 | Shield | `hurt()` before the deathbomb branch; `ship.coat`, `ship.coatTimer`; event `absorb` |
| 17 | **BACKUP ALIQUOT** | E | Once per sample, a lost vial drops as a catchable aliquot for 3 s; catch it to get the vial back. The medal still counts the loss. Mirrors the mRNA strand catch-back | 1 | Vial | `die()` → `spawnPickup(s, 'vial', …)`, `life 3`, `source 'aliquot'` |
| 18 | **GLASS SYRINGE** | E, trade-off | Needles and antibodies deal +40% damage. Cost: −1 max vial (Normal 3 → 2, Easy 5 → 4; never below 2) | 1 | Needle, Vial, Trade-off | `kit.needleDamage`, `kit.abDamage`, `kit.maxVials` |
| 19 | **LNP SHELL** | L (prereq 2 DOSE) | The lipid nanoparticle that carries mRNA vaccines. The coating holds 2 hits and re-forms 25% faster. Every absorb pops a 3 u bubble that turns nearby bullets into antigen tokens. Brings a coating if you have none | 1 | Shield, SOAP | `hurt()` absorb → `cancelBullets` within 3 u |

#### SOAP line: the bomb (tag SOAP)

| # | Name | Tier | Exact effect | Max | Tags | Hook |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | **LATHER** | C | First copy: +1 SOAP now, and the refill per vial is 3 instead of 2 (Easy 4 instead of 3). Second copy: +1 SOAP now and a stock cap of 6 instead of 5 | 2 | SOAP | `kit.bombsPerVial`, `kit.maxBombs` |
| 21 | **SURFACTANT** | C | SOAP deals +50% damage to viruses, and bites 5% of a boss card instead of 3% (7% with two copies) | 2 | SOAP | `updateSoap` damage; `bombBoss` fraction |
| 22 | **REFLEX ARC** | R | The deathbomb window is 0.26 s instead of 0.18 s. Not offered on Easy | 1 | SOAP | `hurt()`: `ship.dying = diff(s).deathbomb + kit.deathbombBonus` |
| 23 | **EPIPEN** | R | When a hit reaches your core and you hold at least 2 SOAP, the pen spends 2 and fires a SOAP for you, saving the vial. Not offered on Easy | 1 | SOAP, Shield | `hurt()`, Easy's auto-SOAP path plus one extra SOAP spent |
| 24 | **FOAM** | E | Your SOAP leaves foam for 2.5 s: a 5 u disc around where it burst that turns enemy bullets entering it into antigen tokens. Drawn under bullets | 1 | SOAP | `updateSoap` end → `s.foam`; cancel in the bullet pass |
| 25 | **AUTOCLAVE** | L (prereq 2 SOAP) | SOAP regenerates: +1 every 20 s of play (up to your stock cap; paused outside play). A SOAP that clears 30 or more bullets refunds itself. SOAP still voids captures, so this build trades NEUTRALIZED bonuses for safety | 1 | SOAP | Timer in `substep`; `ring.cleared` counted in `updateSoap` |

#### GRAZE line: dancing with the virus (tag Graze)

| # | Name | Tier | Exact effect | Max | Tags | Hook |
| --- | --- | --- | --- | --- | --- | --- |
| 26 | **CLOSE CALL** | C | A SOAP every 80 grazes instead of 100 (60 with two copies) | 2 | Graze, SOAP | `kit.grazePerBomb` in `updateHazards` |
| 28 | **LIVE CULTURE** | R, trade-off | While any bullet's solid is inside your 1.0 u graze ring, needles deal +25%; otherwise −10%. While the bonus is on, the thumb rest glows; in focus the ring itself brightens, at the same drawn radius | 1 | Graze, Needle, Trade-off | `updateHazards` sets `ship.ringBusy` from the existing `gap < grazeRadius` test |
| 29 | **FEVER** | E | Every 40th graze starts 5 s of FEVER: needles deal +20% and pierce one virus. With HOLLOW BORE, the second hit deals 100% instead of 60% | 1 | Graze, Pierce | Graze counter; `ship.fever` timer |
| 30 | **INNATE RESPONSE** | L (prereq 2 GRAZE) | Each graze fires a needle from the tip at the nearest tangible virus within 12 u (±60°), for 2 × your needle damage, at most 10 per second | 1 | Graze, Homing | `updateHazards` graze branch; `ship.innateCooldown` 0.1 s |

#### Card 27: the INJECT slot

RESEARCH_V1 makes INJECT (touch a virus with the needle tip to cure it) the signature mechanic and a v1.0 MUST. Card 27 therefore depends on it:

| # | Name | Tier | Exact effect | Max | Tags | Hook |
| --- | --- | --- | --- | --- | --- | --- |
| 27 | **RETRACTABLE NEEDLE** (if INJECT ships; real safety syringes retract) | C | INJECT reloads 30% faster (0.5 → 0.35 s, and 0.8 → 0.56 s after an elite). NEEDLE line | 1 | Needle, Inject | The INJECT reload timer (RESEARCH_V1 §3.10) |
| 27′ | **ANTIGEN HARVEST** (if INJECT is cut) | C | Antigen tokens score double. Each collected token adds 0.25 graze progress (a 40-bullet SOAP gives 10, which keeps the SOAP → token → SOAP loop well under 1). GRAZE line | 1 | Graze, SOAP | `updateAntigens` |

**Tier check:**

| Tier | Count | Cards |
| --- | --- | --- |
| C | 10 | CONCENTRATE, RAPID RELEASE, STEADY HAND, IgG BOOST, EXTRA DOSE, SILICONE PLUNGER, LATHER, SURFACTANT, CLOSE CALL, RETRACTABLE NEEDLE (or ANTIGEN HARVEST) |
| R | 9 | TWIN BARREL, HOLLOW BORE, 18G WIDE BORE, CLONAL EXPANSION, AFFINITY MATURATION, ENTERIC COATING, REFLEX ARC, EPIPEN, LIVE CULTURE |
| E | 6 | SPLIT TIP, OPSONIN TAG, BACKUP ALIQUOT, GLASS SYRINGE, FOAM, FEVER |
| L | 5 | JET INJECTOR, HERD IMMUNITY, LNP SHELL, AUTOCLAVE, INNATE RESPONSE |

### 3.4 Synergies the player can read

Tags are printed on every card. When a pick completes a pair below, the draft screen names it ("SYNERGY: OPSONIN TAG + JET INJECTOR"), as Enter the Gungeon names its synergies.

| Pair | Why it works |
| --- | --- |
| OPSONIN TAG + JET or SPLIT TIP | Tagged viruses take +15% from everything |
| CLONAL EXPANSION + IgG BOOST / AFFINITY / HERD IMMUNITY | Antibodies early, then stronger |
| STEADY HAND + JET INJECTOR | Focus damage feeds the jet |
| HOLLOW BORE + FEVER | 100% second hit |
| LATHER + EPIPEN | More saves |
| CLOSE CALL + LATHER + AUTOCLAVE | The SOAP economy |
| RETRACTABLE NEEDLE + LIVE CULTURE | Point-blank play: INJECT lives where the bullets are |
| LIVE CULTURE + INNATE RESPONSE | The graze build |
| ENTERIC COATING + LNP SHELL | The shield build |
| GLASS SYRINGE + BACKUP ALIQUOT | The cannon with a safety net |

## 4. Odds

### 4.1 Base tier weights, titer and the boss bonus

Each of the three slots rolls its tier independently from the row of the current titer. The weights are per slot and sum to 100. This is the shipping table for RESEARCH_V1's 12-stage run; §4.7 gives the 18-stage fallback.

| Row | When | Common | Rare | Epic | Legendary |
| --- | --- | --- | --- | --- | --- |
| **T0** | Sector 1 (before ALPHA) | 70 | 25 | 5 | 0 |
| **T1** | After ALPHA | 60 | 28 | 10 | 2 |
| **T2** | After BETA & GAMMA | 50 | 31 | 15 | 4 |
| **T3** | After DELTA (and any later sector) | 42 | 32 | 20 | 6 |
| **BOSS slot** | Slot 1 of the boosted draft after a non-final boss | 0 | 0 | 100 − L | **L = 12 + 16 × s** (s = share of that boss's cards NEUTRALIZED; 20 at half) |

- **Sector 1 is mostly commons on purpose.** It teaches the kit, and commons are the simple, readable stat cards. Legendaries can't appear there anyway: they need two line picks first.
- **The boss bonus is both temporary and permanent.**
  - **Temporary:** the boosted draft's first slot rolls on the BOSS row. It is always Epic or better, with Legendary 12% if no card was captured, 20% at half and 28% at a full sequence (A6). The other two slots roll on the new titer row. A resample keeps the boss slot.
  - **Permanent for the run:** each boss moves 8–10 points out of Common:
    - T0 → T1: Rare +3, Epic +5, Legendary +2.
    - T1 → T2: Rare +3, Epic +5, Legendary +2.
    - T2 → T3: Rare +1, Epic +5, Legendary +2.
- **Why both:** the boss slot gives the moment (a guaranteed epic right after the fight, as Slay the Spire's boss rewards are always rare), and SEQUENCING ties it to the capture skill. The titer gives the sense of a stronger run, as Gungeon's floors and Brotato's waves do.
- **The legendary weights were set by measurement** (§4.6):
  - **Targets:**
    - About 1 run in 5 is offered no legendary.
    - A player who always takes the rarest card ends with about one legendary, and with two in about a third of runs.
  - **The leaner table failed the 12-stage run.** It is the 18-stage fallback (§4.7), and on 11 drafts it offered no legendary in 35% of runs.

### 4.2 How an offer is composed

```
for slot in 1..3:
  weights = BOSS row if (boosted draft and slot 1) else row[titer]
  apply incubation (4.3); if slot 1 and the floor is armed, remove Common
  tier = weighted roll(weights)                     # draft RNG stream
  repeat until a card is found, stepping the tier down (L→E→R→C):
    pool = eligible cards of tier not already in this offer   # 4.4
    if the offer already holds a trade-off: drop trade-offs from pool
    prefer lines not yet used in this offer; pick a line uniformly,
    then a card uniformly within it
if no NEEDLE or ANTIBODY card is in the offer and one is eligible:
  replace slot 3 with an offense card of the same tier (or lower)
update incubation and the floor flag from the tiers shown
```

- **Line diversity.** The three cards come from three different lines whenever possible, so each draft is a choice of direction, like Hades' god doors.
- **At most one trade-off per offer.**
- **At least one offense card,** so a player can always add potency. The median-deck HP scaling assumes that.

### 4.3 Pity: incubation and the floor

- **Incubation `k`.**
  - `k` rises by the number of Commons shown in an offer (resamples included; DISCARD adds 3).
  - It resets to 0 when an offer shows any Epic or Legendary. A Rare neither raises nor resets it.
  - Before each roll, `moved = min(1.5 × k, Common − 15)` points leave Common: two thirds go to Epic, one third to Legendary. At titer 0, all of it goes to Epic.
  - Example: at T1 with k = 6, the row becomes 51 / 28 / 16 / 5.
  - In the 12-stage simulation `k` never exceeded 5 for a random drafter or 9 for a rarest-first drafter. Boosted drafts reset it often.
- **The floor.** If an offer showed only Commons, slot 1 of the next offer (resample or draft) rolls with Common removed. Two all-common offers in a row are impossible.
- Like Slay the Spire's rare offset and Dota's pseudo-random distribution, both rules are invisible in play. They are exposed as `__game.run()` for QA and documented here.

### 4.4 Duplicate and exclusion rules (no dead picks, no maxed cards)

A card is eligible only if all of these hold:

1. You hold fewer copies than its max, and it isn't already in this offer.
2. ANTIBODY cards other than CLONAL EXPANSION need antibodies at the next stage: its guaranteed entry power ≥ 2 (`entryPower`), or CLONAL EXPANSION owned. In the 12-stage run only the draft after 1-1 excludes them.
3. REFLEX ARC and EPIPEN are not offered on Easy, where auto-SOAP makes them nearly dead.
4. SILICONE PLUNGER and 18G WIDE BORE are not offered when the run is being played by touch (the last stage's movement came from a drag). Touch maps the finger 1:1 at up to 30 u/s, so a speed bonus does nothing and a speed cost costs nothing.
5. **At the potency limit** (§5.2), cards whose only effect is single-target damage or rate are not offered: CONCENTRATE, RAPID RELEASE, STEADY HAND, IgG BOOST, AFFINITY MATURATION, OPSONIN TAG. Cards with another effect (pierce, split, jet, aim) still are.
6. A legendary needs 2 earlier picks from its line, and you hold fewer than 2 legendaries.
7. EXTRA DOSE, LATHER and the speed cards also stop at their stat caps.
8. RETRACTABLE NEEDLE exists only in builds where INJECT ships (card 27).

If a rolled tier has no eligible card, the slot steps down one tier. If nothing at all is eligible, the offer shows fewer cards and DISCARD gives +1 SOAP as usual. A test proves this can't happen in the shipped set.

### 4.5 Expected tier distribution before pity (closed form, per draft)

| Row | Mean C / R / E / L per offer | P(≥1 Epic+) | P(≥1 Legendary) | P(all Common) |
| --- | --- | --- | --- | --- |
| T0 | 2.10 / 0.75 / 0.15 / 0.00 | 14.3% | 0% | 34.3% |
| T1 | 1.80 / 0.84 / 0.30 / 0.06 | 31.9% | 5.9% | 21.6% |
| T2 | 1.50 / 0.93 / 0.45 / 0.12 | 46.9% | 11.5% | 12.5% |
| T3 | 1.26 / 0.96 / 0.60 / 0.18 | 59.5% | 16.9% | 7.4% |
| Boosted draft at T1 / T2 / T3, half sequenced (L = 20) | Slot 1 is E 0.80 / L 0.20, plus two slots of the row | 100% | 23.2% / 26.3% / 29.3% | 0% |
| Same, nothing captured / fully sequenced | L = 12 / 28 | 100% | 15.5–22.2% / 30.9–36.4% (T1–T3) | 0% |

These are the odds of a *roll*. A rolled Legendary whose line prerequisite isn't met falls to Epic, which is why the early measured rows in §4.6 sit lower.

### 4.6 Worked example: every draft of RESEARCH_V1's run (measured)

A throwaway Node simulation (20,000 seeded runs, outside the repo) implements §4.1–4.4 on the real card list, with card 27 as RETRACTABLE NEEDLE. It uses RESEARCH_V1's 12 stages with the mRNA fallback order (entry power 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4), Normal, keyboard input, no resamples, and boss slots at half sequenced (L = 20). It picks uniformly at random. Pity, the floor and the prerequisites are what move the means away from §4.5.

| Draft | After | Row | Mean C / R / E / L shown | P(Epic+) | P(Legendary) | P(all Common) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1-1 FIRST CONTACT | T0 | 2.10 / 0.75 / 0.15 / 0.00 | 14.3% | 0% | 34.3% |
| 2 | 1-2 GESUNDHEIT | T0 | 1.79 / 0.91 / 0.30 / 0.00 | 27.0% | 0% | 20.5% |
| 3 | **1-3 ALPHA** | boosted, T1 | 1.12 / 0.55 / 1.28 / 0.05 | 100% | 5.0% | 0% |
| 4 | 2-1 DEEP BREATH | T1 | 1.79 / 0.85 / 0.34 / 0.03 | 32.0% | 2.6% | 21.3% |
| 5 | 2-2 GAS EXCHANGE | T1 | 1.62 / 0.92 / 0.39 / 0.07 | 38.8% | 6.7% | 16.0% |
| 6 | **2-3 BETA & GAMMA** | boosted, T2 | 0.94 / 0.63 / 1.18 / 0.25 | 100% | 24.7% | 0% |
| 7 | 3-1 CIRCULATION | T2 | 1.50 / 0.94 / 0.46 / 0.10 | 46.3% | 10.1% | 12.5% |
| 8 | 3-2 SPLASHDOWN | T2 | 1.40 / 0.96 / 0.51 / 0.13 | 51.0% | 12.5% | 10.2% |
| 9 | **3-3 DELTA** | boosted, T3 | 0.81 / 0.65 / 1.23 / 0.31 | 100% | 28.9% | 0% |
| 10 | 4-1 COPY ERROR | T3 | 1.27 / 0.98 / 0.58 / 0.17 | 58.4% | 16.2% | 7.4% |
| 11 | 4-2 FULL BLOOM | T3 | 1.21 / 0.99 / 0.62 / 0.18 | 60.5% | 17.0% | 6.9% |
| — | 4-3 OMICRON PRIME | final | no draft | | | |

- **Per run (random drafter):**
  - Cards shown: 15.5 common, 9.1 rare, 7.0 epic, 1.3 legendary.
  - No legendary offered in 23.3% of runs.
  - 0.43 legendaries picked (0 / 1 / 2 in 63 / 32 / 5.5% of runs), 2.3 epics picked and 4.7 offense picks out of 11.
- **Rarest-first drafter** (always takes the highest tier):
  - 1.14 legendaries shown and 1.10 picked (0 / 1 / 2 in 23 / 44 / 33% of runs).
  - 5.0 epics picked, so by sector 4 such a player owns most epics. Their weight then steps down to rares, which is visible in that player's late rows.
- **The first legendary realistically arrives in sector 2.** At ALPHA's boosted draft only about a fifth of runs have two picks in one line, so a legendary shows in 5%. Otherwise the boss slot falls back to Epic, which is the intended "first epic" moment.

The implementation's odds test (§8, test 4) must reproduce this table within ±0.03 per mean and ±1.5 points per probability.

### 4.7 The 18-stage fallback (if RESEARCH_V1 is not adopted)

Today's campaign has 17 drafts, with boosted drafts after 1-4, 2-4 and 3-4. Odds tuned for 11 drafts would hand out too many legendaries over 17, so the leaner table applies:

| Row | Weights |
| --- | --- |
| T1 | 60 / 28 / 11 / 1 |
| T2 | 50 / 31 / 16 / 3 |
| T3 | 42 / 32 / 22 / 4 |
| Boss slot | L = 8 + 14 × s (15 at half) |

Measured the same way (20,000 runs):

| Drafter | Legendaries shown per run | No legendary offered | Legendaries picked | Picked 0 / 1 / 2 |
| --- | --- | --- | --- | --- |
| Random | 1.56 | 17.9% | 0.52 | — |
| Rarest-first | — | — | 1.33 | 16 / 35 / 49% |

**For comparison:** the heavier 12-stage table over 17 drafts let a rarest-first player hold two legendaries in 66% of runs.

## 5. Balance guard-rails

### 5.1 Potency: the yardstick

**Potency** is the sustained single-target damage per second of a focused syringe on a boss-sized target with every needle hitting, divided by the same syringe's DPS with no adjuvants at the same mRNA level. It includes the main stream and antibodies. Conventions:

- LIVE CULTURE at 50% ring occupancy.
- FEVER at 20% uptime.
- OPSONIN TAG at full uptime on a boss.
- INNATE RESPONSE at 1 graze/s.

Multi-target value (pierce, split, jet width, aim, INJECT) is deliberately not counted. That is how those cards beat popcorn without moving boss TTK.

**Survivability** is measured as **hits to game over**: core hits injected every 6 s into one stage, from a full start, with no player input. Normal with no adjuvants takes 3 hits to game over; Easy takes 20 (5 vials × [3 auto-SOAPs + 1]).

### 5.2 Power budget, caps and the titer limit

**Budget per single copy, at mRNA L2–L4** (enforced per card by test 11):

| Tier | Offense budget | Defense budget | Or a behavior |
| --- | --- | --- | --- |
| Common | +8–12% potency | +1 hit to game over per stage, or one SOAP-economy step | — |
| Rare | +15–25% | +2 hits | A new behavior worth ≤ +15% potency |
| Epic | +25–35% | +2–3 hits | A behavior (split, tag, foam, aliquot, fever) |
| Legendary | ≤ +45% within its line's build | ≤ +4 hits per stage | Transforms how the build plays; always under the titer limit |
| Trade-off | Gain up to 1.3× its tier budget | — | Its cost is at least 30% of the gain, on another axis (speed, vials, off-ring damage) |

**Hard caps** (in `kitOf`, whatever the deck):

| Stat | Cap | Why |
| --- | --- | --- |
| Needle damage bonus (all sources, FEVER included) | +70% | Keeps CONCENTRATE ×3 + GLASS + 18G inside the titer limit |
| Fire rate | 10 volleys/s (+25%) | The calm-stream request |
| Needles per volley | focus 6, spray 7 | Readability |
| Antibody damage bonus | +70% | — |
| Antibodies | 4, firing at most 6 needles/s each | Readability |
| Speed | 10.5–12.9 u/s; focus fixed at 5.0 u/s | At 14 u/s the reactive player lost 2–4× more vials (MOVEMENT_AUDIT.md); 12.9 u/s keeps RESEARCH_V1's 1.2 s crossing floor |
| Max vials | base + 2 (Normal 5, Easy 7), never below 2 | — |
| SOAP stock | 6; refill per vial base + 1 | — |
| Deathbomb window | 0.26 s (Normal); Easy stays 0.35 s | — |
| Coating | ≤ 2 charges, re-form ≥ 15 s | — |
| Grazes per SOAP | ≥ 60 | — |
| Player projectiles alive | ≤ 120 (needles + split + innate) | Readability and frame time |

**Titer potency limit.** Potency may not exceed ×1.5 at T0, ×1.8 at T1, ×2.0 at T2 and ×2.2 at T3. `kitOf` applies it as one scale on needle and antibody damage. The HUD shows `POTENCY ×1.80 MAX`, and §4.4 rule 5 stops offering damage-only cards at the limit.

**Why a rising limit.** In the first model, with a flat ×2.4 clamp and richer card numbers, a greedy offense deck reached the clamp by stage 10 of 18, at 1.59× the random median. The clamp, not the cards, decided the late game. Tied to titer, greedy offense stays within 1.5× of the median (§5.4), and bosses literally unlock stronger formulations.

### 5.3 How enemy HP and pattern intensity scale

- **HP: expected potency, not your potency.**
  - `setupSector` uses `s.dpsRef = RULES.powerDps[entryPower − 1] × EXPECTED_POTENCY[stage]`.
  - `EXPECTED_POTENCY` is the median potency of the random drafter at each stage entry. It is measured over at least 500 seeds and frozen in `adjuvants.mjs`; test 10 re-measures it and fails on a drift over 5%.
  - It feeds every path `dpsRef` already feeds: popcorn HP, boss and midboss card HP, cell pops and SOAP damage (via `hpRatio`).
  - The median deck therefore reproduces the TTKs and choir lifetimes RESEARCH_V1 authors against, so its ladders hold for the typical player.
  - It depends on the stage, never on the deck, so it is not the Oblivion-style rubber band players dislike. A strong deck kills faster, a defensive deck slower.
- **Planning estimate for RESEARCH_V1's run** (from the throwaway potency model with the card numbers above; replace it with the real measurement):

  | Stage | 1-1 | 1-2 | **1-3** | 2-1 | 2-2 | **2-3** | 3-1 | 3-2 | **3-3** | 4-1 | 4-2 | **4-3** |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | Entry mRNA level | 1 | 1 | 2 | 2 | 2 | 3 | 3 | 3 | 4 | 4 | 4 | 4 |
  | `EXPECTED_POTENCY` | 1.00 | 1.00 | 1.04 | 1.09 | 1.13 | 1.19 | 1.25 | 1.30 | 1.29 | 1.36 | 1.43 | 1.49 |
  | `dpsRef` (effective DPS) | 24.0 | 24.0 | 25.0 | 26.2 | 27.1 | 35.7 | 37.5 | 39.0 | 54.2 | 57.1 | 60.1 | 62.6 |

  The dip at 3-3 is real: mRNA L4 raises the baseline that potency is divided by. For today's 18-stage campaign the same model gives 1.00 1.00 1.06 1.09 1.15 1.20 1.26 1.30 1.35 1.44 1.49 1.46 1.51 1.59 1.65 1.72 1.80 1.86.
- **Patterns never scale with adjuvants.** Bullet caps, choir intervals, surges, speeds, telegraphs, twists, RESEARCH_V1's ladders and boss cards stay exactly as authored. The late game stays tense because RESEARCH_V1's pressure sawtooth rises by sector, whatever the deck.
  - Shields cannot prevent core hits, only absorb them, and absorbs cost medals and sequencing.
  - AUTOCLAVE and EPIPEN builds spend SOAP, which voids captures.
- **Timeouts stay safe for defensive decks.** The defense drafter in §5.4 sits at 0.82–1.00× of E, so its kill time is at most 1.22× the median's. With HP at TTK × E × 0.7, it ends a card at about 0.86 × TTK, well inside RESEARCH_V1's `max(25, 1.6 × TTK)` timeouts.

### 5.4 Ceilings at the end of a run

Estimated with the same model (5,000 runs per policy, RESEARCH_V1's run):

| Stage | Random median (p10–p90) | Greedy offense median | Defense-first median | Greedy / random |
| --- | --- | --- | --- | --- |
| 1-3 ALPHA | 1.04 (1.00–1.25) | 1.23 | 1.00 | 1.18 |
| 2-3 BETA & GAMMA | 1.19 (1.03–1.48) | 1.58 | 1.05 | 1.33 |
| 3-3 DELTA | 1.29 (1.10–1.65) | 1.83 | 1.08 | 1.42 |
| 4-3 OMICRON PRIME | 1.49 (1.20–1.90) | 2.20 (limit) | 1.43 | 1.48 |
| Worst stage | — | — | — | 1.48 (4-2, 4-3) |

In the 18-stage fallback the worst ratio is 1.41, at 2-2.

- **`STRONGEST_BUILD`** (for RESEARCH_V1's T6) is the 11-pick offense deck:
  - CONCENTRATE ×3, STEADY HAND ×2, RAPID RELEASE ×2, TWIN BARREL, 18G WIDE BORE, GLASS SYRINGE, JET INJECTOR.
  - Assembled, its raw potency is about ×2.5 at L4 and ×2.8 at L2, so it sits at the titer limit at every stage. The test uses the limit as the upper bound.
  - Card HP is TTK × E × 0.7, so at the limit a card ends at 0.7 × E ÷ limit of its TTK. That is at least 44%, at 2-2's midboss (bosses 45–49%), against T6's 40% floor.
- **DPS ceilings (tests 4, 10 and 11):**
  - No deck exceeds ×2.2.
  - Greedy offense stays ≤ 1.5× the random median at every stage.
  - The random drafter's p90 at the last stage stays ≤ ×2.2.
- **Survivability ceilings (test 11):**
  - The most defensive Normal deck without legendaries takes ≤ 20 hits to game over in a stage, Easy's own figure, because Easy is the designed floor of challenge.
  - With LNP SHELL or AUTOCLAVE: ≤ 24.
  - The planning count for the worst legal non-legendary deck is about 17–20, from the EXTRA DOSE ×2, LATHER ×2, EPIPEN, ENTERIC ×2 and BACKUP ALIQUOT stack. If it measures above 20, EPIPEN costs 3 SOAP instead of 2.

### 5.5 Single cards must not break the curve

For each of the 30 cards, the **favour-one bot** drafts at random but always takes that card when it is offered. Compared with the random drafter on the same 200 seeds:

- **Offense cards:** potency at each stage ≤ 1.15× the median, and boss TTK ≥ 75% of the median.
- **Defense cards:** ≤ +3 hits to game over.
- **Every card:** the run's 1CC rate moves by ≤ 10 points. No card is picked by the greedy bot in fewer than 2% of the offers where it appears. Such a card is a trap and must be buffed or reworded.

This is Slay the Spire's metrics habit, at bot scale: a pick-rate and win-rate table per card, printed by `node tests/adjuvant-report.mjs`.

### 5.6 Simulation test plan: the bots

| Bot (drafting) | Rule |
| --- | --- |
| RANDOM | Uniform pick of the three |
| GREEDY-OFFENSE | Largest potency gain (ties: higher tier) |
| GREEDY-DEFENSE | Largest hits-to-game-over gain, then potency |
| RAREST | Highest tier, ties at random |
| PLACEBO | Discards every draft |

Each drafting bot is paired with two players:

- the **autopilot** (strong, `autopilot.mjs`, which must read `s.kit` speeds);
- the **150 ms reactive player** (weak, `tests/reactive.mjs`, RESEARCH_V1's FAIR-150 referee; SOAP allowed in run tests, never in the dodge suites).

Targets on Normal with 3 credits, over 50 seeds:

1. **Autopilot × RANDOM:** 1CC on at least 48/50 seeds. Today the autopilot wins seeds 42, 1 and 7 with 0 vials lost.
2. **Reactive × RANDOM:** finishes the run within its 3 credits on at least 45/50 seeds. Its 1CC rate is within ±10 points of the same player on the reference syringe with no drafts. This is the promise of the expected-potency scaling: the median deck plays like the authored game.
3. **Reactive × GREEDY-OFFENSE:** 1CC rate ≥ RANDOM's, and boss-stage time 70–90% of RANDOM's (faster, not trivial).
4. **Reactive × GREEDY-DEFENSE:** vials lost per sector-4 stage ≥ 25% of RANDOM's. Core hits per minute are not lower than RANDOM's: longer kills mean longer exposure.
5. **Reactive × PLACEBO:** boss-stage time ≥ 1.2× RANDOM's, still finishing within 3 credits on at least 40/50 seeds (the challenge badge is harder, not impossible).
6. **RESEARCH_V1's ladders and FAIR-150** (its T3 and T4) also pass with RANDOM decks, not only the reference syringe.
7. **FAIR-150 passes at the speed extremes** adjuvants allow: 10.58 u/s (18G) and 12.88 u/s (SILICONE ×2).

## 6. UI/UX

### 6.1 The FORMULATE screen

The look stays the lab instrument (README "The UI" and RESEARCH_V1 §5.2's calm lab-report voice), not cartoon:

- **The board dims to 35%.** The 3D camera eases toward the real syringe mesh, which turns slowly (8°/s) under the key and rim lights. Nothing simulates.
- **Header:** `FORMULATE · 2-2 CLEARED · PICK 1 ADJUVANT`, the titer as ◆◆◇, and `RESAMPLE ×2`. After a boss it reads `FORMULATE · DELTA SEQUENCED 3/5`.
- **Three specimen slides,** landscape about 240 × 300 px each. Each shows:
  - the tier band: the word (COMMON / RARE / EPIC / LEGENDARY) plus 1–4 pips;
  - the name in the dot-matrix lettering and the line glyph (needle, Y, vial, bubble, ring) with its tags;
  - one effect sentence of at most 90 characters, with the number set in the seven-segment face;
  - the stack (`1 → 2 / 3`);
  - a **NOW → AFTER** line computed from the kit diff (for example `NEEDLE DMG ×1.10 → ×1.20 · POTENCY ×1.32 → ×1.41`), the cure for Soy-Milk traps;
  - for trade-offs, a **COST** line;
  - a "SYNERGY:" line when the pick completes a pair from §3.4.
- **Footer:** `[ENTER] INJECT · [R] RESAMPLE (2) · [S] DISCARD (+1 SOAP)`, above the player's own formulation rack. The pick verb is INJECT, the run's own verb.
- **Portrait (390 × 844, 320 wide):** three full-width rows of about 110 px. A tap expands a row. The INJECT button (72 px) sits where the SOAP button lives, in the thumb zone.
- **Tier frames stay inside the palette** (green = viruses, pink = danger, cyan = vaccine, amber = supplies and medals):

  | Tier | Frame |
  | --- | --- |
  | Common | Frosted grey glass |
  | Rare | Cyan rim |
  | Epic | Cobalt double rim |
  | Legendary | Amber, with a moving light sweep |

  No green, pink or violet frames. The COST line uses the danger pink, the only pink off the board, because a cost is a risk.

**Input** (one scheme per device, matching the game's):

| Device | Focus | Pick | Resample / discard |
| --- | --- | --- | --- |
| Keyboard | ←/→, A/D or 1/2/3 | Enter or Space (fresh press, after the 0.5 s lock) | R / S, then a second S or Enter to confirm |
| Mouse | Hover | Click shows INJECT on that slide; click INJECT (or double-click) | Footer buttons |
| Touch | Tap | Tap INJECT | Footer buttons, two taps |

Esc or P pauses. No gamepad in v1.0.

**Accessibility:**

- A tier is never shown by colour alone: there is always the word, the pips and the frame style.
- Text is at least 14 px at 960 × 640 and 13 px at 320.
- The screen is `role="dialog"` with an `aria-live` summary ("Three adjuvants: CONCENTRATE, common; ENTERIC COATING, rare; FOAM, epic").
- `prefers-reduced-motion` gives an instant reveal with no flips or camera move.
- Sounds are never needed to understand the screen.

### 6.2 Owned upgrades in the HUD and on the syringe

- **HUD (landscape):** an **ADJUVANTS** rack in the left panel under mRNA.
  - Vial-shaped chips (12 × 18 px), grouped by line, with stack pips; up to 15, then `+n`.
  - Legendaries are larger amber chips on top. A `POTENCY ×1.46 / 1.80` readout sits under the rack.
  - While paused, hovering a chip shows its text. The pause screen lists the whole formulation with text.
- **HUD (portrait):** only the 0–2 legendary chips in the top strip; the full list lives in pause and on the draft screen.
- **On the 3D syringe** (RESEARCH_V1 §4: 1.64 u long, the core at its centroid). It stays short and readable:
  - at most 3 accessories at once;
  - nothing ring-shaped around the core and nothing on the barrel, which is the glass capsule around the dose;
  - the tip glint belongs to INJECT alone;
  - the chamber marker unchanged and drawn above everything.

  | Card | Accessory |
  | --- | --- |
  | ENTERIC / LNP | A cyan glaze on the finger collar and thumb rest (+0.31 to +0.69 u, behind the core). It cracks with a glass sound on an absorb, then refills from the collar outward as its re-form timer; LNP is double. The shield's state is on the character, which answers part of the movement audit's E2 WARN |
  | TWIN BARREL | A second needle beside the first, from the hub (−0.52 u) forward |
  | JET INJECTOR | The hub glows cyan in focus; the tip itself is unchanged, so INJECT still reads |
  | HERD IMMUNITY | Brighter cyan Y tips on the antibodies (still at 60% opacity) |
  | AUTOCLAVE | A thin steam curl on the thumb rest |
  | LIVE CULTURE | The thumb rest glows while a bullet is inside the ring |

  Every other adjuvant lives in the HUD only.

### 6.3 Juice for the reveal

| Moment | Picture | Sound (synthesized in `audio.mjs`, new `SFX_CATALOG` entries) |
| --- | --- | --- |
| Draft opens | Three frosted slides rise from the tray, 90 ms apart | `draft-open`: a soft glass tray slide |
| Common flip | Flip 120 ms, left to right | `reveal-common`: dry glass tick, peak about −24 dBFS |
| Rare flip | Cyan rim catches the light | `reveal-rare`: two-note glass chime (a fifth), about −18 dBFS |
| Epic flip | Cobalt double rim, a short shimmer | `reveal-epic`: rising triad with a soft whoosh, about −12 dBFS |
| Legendary | The slide glows amber 0.5 s *before* it flips (a centrifuge spin-up). It lands with an amber sweep, a 0.08 s freeze and a rim-light flash on the 3D syringe. No camera shake (the shake rule). Skippable after 0.4 s; at most 1.2 s | `legendary-riser`, then `reveal-legendary`: low boom plus a major fanfare tail from the NEUTRALIZED family, peak ≤ −6 dBFS (under the boss defeat at −3.8) |
| Resample | Slides tumble back into the tray | `resample`: a cascade of glass clinks |
| Inject (pick) | The plunger of the 3D syringe presses once; the slide's glyph flies into the HUD rack | `inject`: pneumatic hiss and a liquid gloop |
| Discard | The slides slide away; +1 SOAP bubble pops in the panel | `discard` |
| In play: absorb / re-form | Glaze cracks / refills | `absorb` (glassy crack, distinct from the core-hit crack), `coat-reform` |

The hierarchy matches the audio rules in README "Sound": the reveal is louder than auto-fire and quieter than a boss death.

## 7. v1.0 scope, later, and risks

**In v1.0:**

- `adjuvants.mjs`: 30 cards (card 27 per INJECT), odds, titer, the boss slot with SEQUENCING, incubation, floor, eligibility, `kitOf` with caps and the titer limit, `EXPECTED_POTENCY` measured, and `STRONGEST_BUILD`.
- The draft phase and its `draft` event, RESAMPLE and DISCARD, run save and resume (credits included), the PLACEBO badge, and the reference syringe in practice.
- The FORMULATE screen (keyboard, mouse, touch, portrait), the HUD rack and potency readout, the pause list, and syringe accessories (coating, twin barrel, the legendaries).
- The SFX entries.
- Every test in §8, the bot report, and updates to README, BALANCE, LEVEL_DESIGN and the root browser QA.

**Cut order if v1.0 runs late.** Cut in this order, keeping all four tiers populated, all five legendaries and the shield:

1. FOAM
2. card 27
3. FEVER
4. SPLIT TIP

That leaves 26 cards: 9 common, 9 rare, 3 epic, 5 legendary. The odds table stays and test 4's expected table is recomputed.

**SEQUENCING odds are a RESEARCH_V1 SHOULD.** If they slip, the boss slot uses a fixed L = 20.

**Later (v1.1+):**

- A codex of adjuvants seen.
- A daily seeded run (the draft stream is already deterministic).
- Banish, Hard mode, and "duo" adjuvants that need two lines.
- A gamepad.
- Unlock pacing (meta-progression that unlocks content, never power), including RESEARCH_V1's draft-unlocked variants.
- 3D-rendered slides.
- A statistics screen fed by the bot report's format.

**Risks:**

| Risk | Mitigation |
| --- | --- |
| Scope: 14 behavior hooks | Stat cards first (16 of 30 are pure `kitOf` modifiers); behaviors behind one test each; the cut order above |
| The two briefs drifting apart | §2.8 is the contract; any change to A1–A8 updates both docs and the matching tests |
| Determinism and test drift | Separate draft RNG; `adjuvants: false` keeps all 144 existing tests bit-identical; empty-deck traces checked |
| Balance drift as cards or stages change | `EXPECTED_POTENCY` re-measured by test; the favour-one bot; the bot report on every balance commit |
| The thin T6 margin (44% against 40%) | Test 11 asserts it; if a retune breaks it, lower the T1 limit to ×1.7 |
| Readability (more needles, the jet) | Caps of 120 projectiles, 7 spray needles and 4 antibodies; the jet under bullets at ≤ 45% opacity; bullets are already drawn last with depth testing off |
| Frame time on SwiftShader | SPLIT ≤ 24 needles; the jet is one quad; root QA measures frame time with a max-projectile deck |
| Hitbox integrity | Test 2 plus the existing personality collider snapshot and the browser marker probe with the glaze and jet drawn |
| The word "card" colliding with boss cards | UI says ADJUVANT and FORMULATE everywhere |
| Touch players seeing speed cards | Input-mode filter (§4.4 rule 4) |
| Cognitive load in a bullet hell | Picks only between stages, text ≤ 90 characters, NOW → AFTER numbers, no timer |
| Old saves | New `v6-run` key; `v5` unlocks, medals and scores untouched |

## 8. Tests the implementation squad must add

All are pure-model tests in `npm test` unless marked *browser*. They are listed in build order and complement RESEARCH_V1 §7 (T5, T6 and T12 share fixtures with tests 9–11).

1. **Card data.** Exactly 30 cards, split 10/9/6/5, with card 27 resolved by the INJECT build flag. Unique ids. Every card has a name, tier, line, tags, max, hook and generated text of at most 90 characters, and the text's numbers equal the data. Five legendaries, one per line, each with a prerequisite.
2. **Hitbox invariance.** For every card at max stacks and 1,000 random decks: `ship.radius === RULES.shipRadius`, the graze radius is 1.0, INJECT's tip collider is unchanged, the `hitboxes.mjs` exports equal the pre-adjuvant build, and the personality collider snapshot is unchanged. The JET rectangle's drawn width equals its collider.
3. **Legacy regression.** With `adjuvants: false`, the controller campaign for seeds 42, 1 and 7 hashes identically to the build without adjuvants. The empty-deck kit equals `RULES`.
4. **Odds.**
   - Over 100k rolls, each row and the boss slot (s = 0, 0.5, 1) match §4.1 within ±0.5 points.
   - Incubation rises by Commons shown, resets on Epic or Legendary shown, and DISCARD adds 3. The move is 1.5k, split two thirds / one third, with Common never below 15. The floor removes Common from slot 1 after an all-common offer.
   - Line diversity holds, with at most one trade-off and at least one offense card.
   - The simulated 12-stage run reproduces §4.6 (means ±0.03, probabilities ±1.5 points; P(no legendary) 20–27% for the random drafter). The 18-stage fixture reproduces §4.7.
5. **Eligibility (no dead picks).** Never offered: maxed cards, antibody cards without antibodies (except CLONAL), REFLEX ARC or EPIPEN on Easy, the speed cards on touch, damage-only cards at the potency limit, a legendary without two line picks, or a third legendary. The tier fallback steps down. No reachable state produces an empty offer (exhaustive over the run with random decks).
6. **Determinism.**
   - The same seed and history give the same offers. A continue and a save reload show the identical offer with the same tokens.
   - The draft RNG never changes `s.rngState`: stage traces are equal with and without drafts when the deck stays empty.
7. **Kit math and caps.** Each card's effect equals its text at every stack. The caps in §5.2 hold for 10,000 random decks: 10 volleys/s, speed 10.5–12.9 with focus 5.0 (crossing ≥ 1.2 s), vials base + 2 and never below 2, SOAP 6, deathbomb 0.26, 4 antibodies at ≤ 6/s, damage buckets ≤ +70%, 120 projectiles, coating ≤ 2 charges and ≥ 15 s. The titer limit clamps potency to 1.5 / 1.8 / 2.0 / 2.2.
8. **Behaviors, one test each:**

   | Card | Behavior to prove |
   | --- | --- |
   | HOLLOW BORE | 60% on the second target, never the same virus twice |
   | SPLIT TIP | Two needles at ±25°, no recursion, ≤ 24 alive |
   | JET INJECTOR | Rectangle collider, damage per second, sparks on closed BLOOM buds, an intangible twin untouched, virions destroyed, antibodies still firing, INJECT unaffected |
   | OPSONIN TAG | 2 s, +15% from every source, bosses included |
   | HERD IMMUNITY | Nearest target within 9 u, ±60°, 6/s |
   | ENTERIC COATING | Absorb, 1.0 s invulnerability, 30/20 s re-form, full at stage start and respawn, capture voided, medal counts it |
   | LNP SHELL | 2 charges, ×0.75 re-form, 3 u cancel into tokens |
   | BACKUP ALIQUOT | Once per stage, 3 s, the vial restored, the medal still counting it |
   | GLASS SYRINGE | −1 vial, never below 2 |
   | EPIPEN | Needs ≥ 2 SOAP, spends 2, saves the vial |
   | REFLEX ARC | The 0.26 s window at 30/60/120/240 Hz |
   | FOAM | 5 u, 2.5 s, tokens |
   | AUTOCLAVE | +1 per 20 s of play only, to the cap; refund at ≥ 30 cleared |
   | CLOSE CALL | 80/60 grazes |
   | RETRACTABLE NEEDLE or ANTIGEN HARVEST | 0.35/0.56 s reload; or ×2 score, 0.25 progress and no loop |
   | LIVE CULTURE | Occupancy from the 1.0 u ring, +25/−10% |
   | FEVER | 40th graze, 5 s |
   | INNATE RESPONSE | ≤ 10/s, 2×, ±60°, 12 u |
   | AFFINITY MATURATION | +4% per stage after it was taken |
   | CLONAL EXPANSION | Option counts at L1–L4 |
9. **Flow.**
   - Exactly 11 `draft` events, with `boss: true` after stages 3, 6 and 9 and none after 12 (RESEARCH_V1 T5), each following its LAB REPORT.
   - Nothing simulates in the `'draft'` phase. The 0.5 s lock and fresh-press rule hold, a held Space never picks, and a SOAP press in the draft never fires in the next stage.
   - Pause works in the draft.
   - A continue restores the deck, incubation, tokens and titer and spends one credit (T12). With no credit left, the run ends at the FINAL REPORT.
   - Tokens: 1 at start, +1 per non-final boss, +1 per fully sequenced boss, at most 3.
10. **Expected potency.**
    - The random drafter over 500 seeds reproduces `EXPECTED_POTENCY` within ±5% per stage.
    - With `dpsRef = powerDps × EXPECTED_POTENCY`, every boss card ends by damage at 75% of the reference within 80% of its timeout (RESEARCH_V1 T6's first clause).
    - At the defense drafter's median potency, at least 80% of cards end by damage.
11. **Ceilings and single-card dominance.**
    - Per-tier budgets (§5.2) at L2–L4.
    - Greedy offense ≤ 1.5× the random median at every stage.
    - `STRONGEST_BUILD` never ends a card under 40% of its TTK (T6's second clause; planned minimum 44%).
    - Hits to game over: the most defensive non-legendary Normal deck ≤ 20 (Easy), ≤ 24 with a legendary.
    - The favour-one bot bands in §5.5 for each of the 30 cards.
12. **Bot runs.** Targets 1–7 of §5.6 (a slower suite: run it as `npm run test:balance` if it exceeds the 30 s budget of `npm test`, and record its results in BALANCE.md).
13. **Save and resume.** A round trip of the full run state, credits included. A reload mid-draft restores the same offer without refunding tokens. A corrupt or missing save hides RESUME without throwing. Blocked storage still plays.
14. **Medals and sequencing.** An absorb voids the capture (it can't sequence that card) and costs gold. An EPIPEN save is scored like a deathbomb. A BACKUP ALIQUOT catch still counts the vial as lost.
15. **Audio.** Every new `SFX_CATALOG` entry builds and stops its graph. The legendary reveal peaks ≤ −6 dBFS. The four tier sounds are distinct (spectral centroid and length), and the reveal stays quieter than `DEFEAT_FINAL`.
16. *Browser (root QA, packaged ZIP, Chrome):*
    - FORMULATE shows three slides with tier words and NOW → AFTER lines.
    - Picks work by keyboard, mouse (focus then INJECT) and touch tap-tap at 390 × 844. RESAMPLE and DISCARD work.
    - The HUD rack and pause list are shown. The legendary flourish plays and can be skipped.
    - The collar glaze and jet are drawn while `probe('marker-solid')` still measures the chamber marker equal to the collider within 1 px, and the INJECT tip within 1 px of its collider.
    - Frame time with a max-projectile deck on the 1-1 choir and on OMICRON stays at or above today's SwiftShader figures (README).
    - No console errors.

## Sources

**Inside the repo:**

- RESEARCH_V1.md (§2.1 run structure and A1–A8, §3.10 INJECT, §4 the syringe, §7 tests)
- README.md
- BALANCE.md
- LEVEL_DESIGN.md
- MOVEMENT_AUDIT.md (speed, focus, the E2 WARN)
- RESEARCH_BULLET_HELL.md (§6 kit, §7.4 difficulty, §8 medals)
- `core.mjs`, `model.mjs`, `bosses.mjs`, `enemies.mjs`, `scoring.mjs` (every hook named above)

**External (fetched or searched 2026-11-10):**

- Slay the Spire card rewards and rarity offset: https://slaythespire.wiki.gg/wiki/Cards, https://slay-the-spire.fandom.com/wiki/Card_Rewards
- Slay the Spire metrics-driven balance (GDC 2019): https://gdconf.com/news/learn-slay-spires-successful-metrics-driven-approach-game-balancing-gdc-2019, https://www.gamedeveloper.com/design/how-i-slay-the-spire-i-s-devs-use-data-to-balance-their-roguelike-deck-builder
- Hades boons, rarities and prerequisites: https://hades.wiki.fextralife.com/Boons
- Hades Mirror of Night (God's Pride, God's Legacy): https://segmentnext.com/hades-mirror-of-night-upgrades-guide
- Hades legendary prerequisites (Steam): https://steamcommunity.com/app/1145360/discussions/0/2965016712304165250
- Vampire Survivors Luck, reroll, skip, banish: https://gamerjournalist.com/what-does-luck-do-in-vampire-survivors-answered, https://primagames.com/?p=67903, https://vampire.survivors.wiki/w/Preserve
- Vampire Survivors late-run difficulty (Steam): https://steamcommunity.com/app/1794680/discussions/0/3194745954518386236
- Brotato upgrades and shop tiers: https://brotato.wiki.spellsandguns.com/Upgrades, https://brotato.wiki.spellsandguns.com/Shop
- Balatro joker weights and rerolls (secondary source): https://saschb2b.github.io/game-mechanics/games/balatro/jokers
- Enter the Gungeon chests and quality: https://enterthegungeon.wiki.gg/wiki/Chests, https://enterthegungeon.wiki.gg/wiki/Quality
- Nuclear Throne mutations: https://idntg.pages.dev/mutations
- Binding of Isaac, Soy Milk: https://bindingofisaacrebirth.wiki.gg/wiki/Soy_Milk, https://bindingofisaacrebirth.wiki.gg/wiki/Talk:Soy_Milk
- Risk of Rain 2 chests and stacking: https://riskofrain2.wiki.gg/wiki/Large_Chest, https://riskofrain2.wiki.gg/wiki/Item_Stacking
- Halls of Torment traits (Steam): https://steamcommunity.com/app/2218750/discussions/0/5590708606436450449
- Steredenn: https://www.pocketgamer.com/steredenn/review/, https://www.shmups.wiki/library/Steredenn
- Nova Drift: https://pixeljam.itch.io/nova-drift, https://pixeljam.itch.io/nova-drift/devlog/84291/the-virulence-update-is-live
- Rogue Star Rescue: https://chuteapps.itch.io/rogue-star-rescue
- Jamestown: https://en.wikipedia.org/wiki/Jamestown:_Legend_of_the_Lost_Colony
- Danmaku Unlimited 3: https://shmups.wiki/library/Danmaku_Unlimited_3, https://toucharcade.com/2017/09/14/danmaku-unlimited-3-review/
- Player feedback on bland upgrades: https://roguepoint.featurebase.app/p/skills-feel-bland-and-do-not-change-gameplay-drastically-enough, https://wayline.io/blog/roguelike-itemization-balancing-randomness-player-agency
- Elise Avery, "Roguelites Have Learned the Right (and Wrong) Ways to Scale Player Powers", The Escapist, 2022: https://www.escapistmagazine.com/roguelites-items-power-scale-game-development-vampire-survivors/
- William Hughes, A.V. Club, 2026: https://www.avclub.com/game-theory-vampire-crawlers
- Tom Francis on Slay the Spire's maths (summary): https://pixelpoppers.com/link/a25cb9/what-works-and-why-juicy-maths-in-slay-the-spire/
- Dota 2 pseudo-random distribution: https://diplograph.net/notes/games/randomness/dota-2-prd, https://liquipedia.net/dota2/Random_Distribution
