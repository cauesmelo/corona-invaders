# Corona Invaders: difficulty, power progression and the 3D draft (brief)

Prepared 2026-11-10 by the lead game designer, who owns the difficulty curve, the power progression and the feel of the adjuvant draft. **This brief contains decisions only.** No code, test or asset in the repository was changed. Every measurement below was run on a scratch copy outside the repo, and the squad must re-measure it with the committed harness (§5). It targets the next CI revision after the v1.0 tag; the squad branches from the tagged v1.0 and leaves the release chores alone.

The owner's feedback (Portuguese, translated):

> The game already starts with the player firing super fast with 3 bullets? I think the start is already too frantic. The card design is too generic; remember I want this game pulled strongly toward 3D. The game is also too easy. What game design is this? Isn't any game designer working on a decent difficulty curve and game progression?

The answer is yes, from now on. This brief sets four things:

- a **challenge** target, not only a fairness floor;
- a start that is weak and a power curve that the player feels;
- a sawtooth curve that ends in a real exam;
- a draft that lives in the 3D scene.

Units follow `BALANCE.md`: world units (u) on the board, +Z toward the player, seconds and u/s. "Vials lost" is the mean number of vials a proxy loses in a stage or sector, summed over every attempt of every run that reached it.

## 0. The decisions in one page

1. **Diagnosis, confirmed by measurement (§1).**
   - Every difficulty target the earlier briefs set was a *ceiling*. There were hits ≤ x per stage, mean ≤ 1.2 hits per card and hits-to-game-over ≤ 24. No target ever said a player must *lose* something.
   - Every bot used for balancing is expert-grade. The autopilot has perfect information. The reactive bot has 150 ms lag, sees every bullet and presses SOAP on the first frame of a hit.
   - The start hands out 3 needles at 8 volleys/s, which is 24 needles/s and 12–15 needles on screen.
   - Enemy HP follows the median deck's potency, so a median adjuvant changes nothing the player can feel.
   - Result: our casual proxy one-credit-clears (1CC) **14/16** runs, and the expert proxy 16/16.
2. **Targets are bands for three human proxies** (first-timer, casual, expert). They set vials lost, continues, clear rates and 1CC rates per stage and per sector (§2).
   - The fairness floor stays strict: no forced hit, lead time, announced course changes, and perfect play always possible.
   - **"Never hit" is removed as a design target.**
3. **The start is weak and calm:** L1 is **one needle at 6 volleys/s** (6 needles/s, about 3 on screen), with no antibodies.
   - mRNA, the draft and INJECT mastery raise median focused DPS from **6 to about 54 (×9)** over the run. Today's growth is 24 → 42 (×1.75).
   - The fire-rate cap falls from 10 to **8 volleys/s**, so the owner's "lower firing rate" request holds even at the end (§3).
4. **Enemy toughness is decoupled from your deck.**
   - Popcorn HP follows an authored sector ladder (×1.0 / 1.4 / 1.9 / 2.4) that grows far slower than player power, so builds are felt.
   - Boss cards are priced at the *median* deck with a per-sector uptime factor.
   - Pressure (density, speed, aimed share) scales by stage only, never by deck.
   - The finale has a timer-only survival exam that no build can skip (§3.5, §4.4).
5. **The curve is a sawtooth with teeth in the samples too.**
   - Today, samples 2-1 to 4-1 all sit *below* 1-2 in near-core pressure (0.52–0.68 vs 0.76). The curve only rises at bosses.
   - New rule: every sector opener sits between the previous sector's second sample and its boss. Every boss tests its sector's idea, and OMICRON borrows all three twists (§4).
6. **The draft becomes diegetic 3D.**
   - Each adjuvant is a **vaccine cartridge**: a glass carpule lit by the game's own key, rim and fill lights. Its tier reads through material: clear glass, frosted, cobalt, then a gold crimp cap with glowing serum.
   - Picking one slides it into the syringe's barrel.
   - Text is one name line plus one stat line, printed on the cartridge label.
   - No DOM card panels. The draft is budgeted on SwiftShader at ≤ 20 ms median per frame (§6).
7. **The 30 cards are rewritten around verbs.**
   - Six lines, each with a build identity: Marksman, Medic, Escort, Dancer, Cleaner, Survivor.
   - Pure stat bumps fall from **15 to 4**. INJECT gets a whole line of 5 cards, EXPOSURE (graze) gets 5, and each sector rule gets one card (§7).
8. **Tests:** a human-proxy harness on the real model with per-stage and per-sector bands, plus a starting-weapon assertion, the fairness floor, a 3D-draft check with no DOM panels, and draft frame time (§8). **Risks and what the owner must judge by playing:** §9.

## 1. Diagnosis

### 1.1 How it was measured

- **Chrome, real keys.** `node serve.mjs --port 4434` with Playwright's Chrome channel (SwiftShader). The run started with Enter and moved with held arrow keys and Shift. State was sampled through `__game.getState()` and screenshots were taken.
- **Human-proxy lab.** A scratch copy of the model (outside the repo) ran whole Normal campaigns with drafts on (random drafter), 3 credits, SOAP on, and 12–16 seeds per proxy. The proxies extend `tests/reactive.mjs` with:
  - perception lag;
  - a decision period;
  - an attention cap (the nearest N bullets);
  - wrong-choice noise and lapses;
  - focus use;
  - a panic-SOAP probability;
  - a **deathbomb press that lands one human reaction time after the hit flash** (the shipped bot presses on the first frame);
  - learning on retry (noise and lapses × 0.7 and attention +2 per continue).

  Parameters are in §2.1. The proxies never INJECT, so the lab understates what a player who uses INJECT can do.
- **Levers.** Environment-driven patches in the lab changed the needle ladder, fire rate, popcorn HP per sector, boss HP per sector, bullet count and speed per sector, choir cadence and the stage bullet cap. They approximate this brief. They are not its implementation.

### 1.2 Findings

**F1. The start is frantic.**
- L1 fires 3 needles at 8 volleys/s (`core.mjs` `fireInterval 0.125`, `cards.mjs` `focusCount`/`sprayCount` = 3 at L1). That is 24 needles/s.
- In Chrome, blind left-right weaving killed **54 of the 60 homage minis in 5.8 s**, with 12–15 needles alive (screenshot `play-10`: most of the grid gone at 5.8 s).
- The casual proxy averages **12.6 needles alive** in 1-1 and kills 54 minis in 12.6 s (median of 6 seeds).
- The power ladder then only goes from 3 needles to 5. The start is already 57% of end-of-run guaranteed DPS (24 of 42), so there is little growth left to feel.

**F2. Only ceilings were ever set.**
- RESEARCH_V1 §2.3 sets "Hits ≤ 0.10 … 0.90" per stage and FAIR-150 rule 1, which `tests/suite.test.mjs` `HITS` enforces.
- `tests/curve.test.mjs` asserts mean ≤ 1.2 hits per card. RESEARCH_CARDS §5.4 caps hits-to-game-over.
- `KNOWN_GAPS` records stages that were *too hard* for the 150 ms bot as misses: 1-2 0.25, DELTA 1.00 and 4-1 0.88 hits.
- So every honest tuning pass pushed difficulty down, and nothing pushed it up.

**F3. The balancing players are experts.**
- `npm run test:balance` with SOAP reports every pairing 1CC 30/30. The bot deathbombs on the first dying frame, which no human can do: the window is 0.18 s, under typical simple visual reaction times of roughly 250–330 ms.
- Our proxies with human deathbomb timing measured this on today's build (16 seeds, Normal, drafts):

  | Proxy | Cleared S1 / S2 / S3 / all | 1CC | Credits used | Vials lost per stage (range) |
  | --- | --- | --- | --- | --- |
  | First-timer | 8 / 3 / 3 / 1 of 16 | 0 | 2.94 | 1-2: 5.6, 1-3: 5.8; later stages lower (survivors) |
  | Casual | 16 / 16 / 16 / 16 | **14/16** | 0.13 | 0.06–0.69 |
  | Expert | 16 / 16 / 16 / 16 | **16/16** | 0.00 | 0.00–0.38 |

  Without SOAP (12 seeds) the casual proxy still 1CCs 8/12 and the expert 11/12. Dodging alone is too easy; SOAP is not the main cause.

**F4. The curve rises at bosses only, and novices hit a wall at 1-2.**
- Today's near-core pressure (BALANCE.md) is:

  | | S1 | S2 | S3 | S4 |
  | --- | --- | --- | --- | --- |
  | Samples | 0.33, 0.76 | 0.52, 0.62 | 0.55, 0.66 | 0.68, 0.79 |
  | Boss | 0.78 | 1.09 | 1.18 | 1.57 |

  1-2 is harder than every later sample except 4-2.
- BIG SNEEZER, the 1-2 midboss, causes **37 of the first-timer's 53 hits** in that stage. ALPHA causes all 50 in 1-3.
- So the curve is flat for skilled players and front-loaded for novices.

**F5. The HP hook is a treadmill.**
- `levels.stageDps = powerDps × EXPECTED_POTENCY`, and popcorn HP, card HP and SOAP damage all follow it (`stageHp`).
- The median deck therefore keeps the authored time-to-kill exactly. A +10% common is literally invisible at the median, which is one reason the cards read as generic.

**F6. The cards are numbers.**
- 15 of the 30 adjuvants change only a number: CONCENTRATE, RAPID RELEASE, STEADY HAND, IgG BOOST, AFFINITY MATURATION, CLONAL EXPANSION, EXTRA DOSE, SILICONE PLUNGER, 18G WIDE BORE, GLASS SYRINGE, LATHER, SURFACTANT, REFLEX ARC, CLOSE CALL, RETRACTABLE NEEDLE.
- All 10 commons are in that list.
- One card touches INJECT (a reload number), none touch BREATH, CURRENT or MUTATION, and only STEADY HAND (a number) and JET touch focus.

**F7. The draft is the least 3D screen in the game.**
- `game.js` draws the board once, copies it to a JPEG and sets the WebGL canvas to `visibility: hidden` while three DOM panels sit on top. This was done for frame time: a re-rendered board cost SwiftShader 5–13 fps.
- The owner saw flat sci-fi panels because the 3D scene was literally switched off.

**F8. A weak start needs guard-rails.**
- In the lab, a single straight needle left the perfect-information autopilot **stalled at 1-1 in 3 of 8 runs** (32 minis alive for 40 minutes). It dodges first and aims second, and one needle misses an empty column forever.
- The casual proxy took 30–36 s to kill 54 minis.
- Every `until` step therefore needs a time cap, and the proxies must aim (§4.3, §8).

### 1.3 What the lab says the new direction does

Lab configurations (16 seeds; numbers approximate the decisions in §3–§4):

| Config | First-timer: S1 / S2 / all cleared | Casual: clear / 1CC / credits | Expert: clear / 1CC / credits | Casual play time |
| --- | --- | --- | --- | --- |
| Today | 8 / 3 / 1 | 16 / 14 / 0.13 | 16 / 16 / 0.00 | 18.2 min |
| E1: weak start + popcorn ladder only (12 seeds) | 0 full clears; mean stage reached 2.8 (an S1 wall) | 7–8 / 4 / 1.7 (of 12) | 11 / 7 / 0.8 (of 12) | — |
| **E3: + gentler S1, sector pressure ramp** | **14 / 5 / 1** | **11 / 4 / 1.44** | **15 / 10 / 0.56** | 24.8 min |
| E4: E3 + more S4 density, cheaper bosses | 13 / 3 / 0 | 10 / 6 / 1.63 | 13 / 8 / 1.00 | 24.2 min |

E3 lands inside most §2 bands. Four gaps remain:

- the first-timer loses 5.3 vials in S1 (band ≤ 4);
- OMICRON is not yet the exam: the casual proxy loses 0.18 vials and the expert 0.33;
- the casual proxy finds 4-2 (1.75) and B&G (2.13) harder than their neighbours;
- runs are **too long**: casual play rose from 18.2 to 24.8 min.

E4 shows that pushing density further drops the expert below 90% clears. The squad tunes from E3 toward the bands, mostly by shortening fights and raising density at the right places (§3.5, §4).

## 2. Human-calibrated difficulty targets

### 2.1 The three proxies

These are the lab's measured profiles. The squad commits them as `tests/humans.mjs` (§8).

| Parameter | First-timer | Casual | Expert | Why |
| --- | --- | --- | --- | --- |
| Perception lag | 300 ms (18 frames) | 220 ms (13) | 150 ms (9) | Simple visual reaction is roughly 250–330 ms in published samples. Experts anticipate, which is the old bot's 150 ms |
| Decision period | 200 ms | 150 ms | 100 ms | Committing to one direction per decision, as `reactive.mjs` does |
| Attention | nearest 6 bullets | nearest 10 | all in view | Multiple-object-tracking research puts capacity near 4 objects, up to about 8 at slow speeds. Experts filter bullets moving away (Sparen, *Danmaku and the Player*, "mental filtering") |
| Wrong-choice noise | 15% (picks a 2nd–4th best move) | 7% | 2% | Novices misread |
| Lapses (keep the last move) | 8% | 3% | 0% | Attention lapses |
| Focus | never | yes | yes | First-timers rarely hold Shift (the brief's profile) |
| Panic SOAP when a hit is predicted ≤ 0.16 s ahead | 30% | 50% | 75% | Novices forget the bomb |
| Deathbomb press after the hit | 380 ± 80 ms | 280 ± 60 ms | 190 ± 40 ms | Against the 0.18 s window. Only anticipation saves, so experts sometimes make it and others almost never do |
| INJECT per safe opportunity (not in the lab) | 5% | 25% | 60% | INJECT mastery is a skill axis (§8 defines "safe") |
| Draft policy | rarest-first | random | line synergy | Novices pick the shiny card; experts build |
| Learning on retry of the same stage | noise and lapses × 0.7, attention +2 | same | same | People learn a pattern by the second try |

**Calibration step (mandatory before bands are locked).**

1. The owner, and ideally two more people (one who never plays shmups, one who does), play three fresh Normal runs each on the new build.
2. The squad records per-stage vials lost and continues. The FINAL REPORT already shows them; add a "copy run log" button on the report.
3. The squad nudges only noise, lapses and attention until each person's numbers sit inside the matching proxy's spread.
4. If no proxy fits a person, record that rather than forcing it.

### 2.2 Sector targets on Normal (drafts on, 3 credits)

| Target | First-timer | Casual | Expert |
| --- | --- | --- | --- |
| S1 AIRWAY: vials lost | 1.5–4.0 | 0.2–1.0 | 0.0–0.3 |
| S1 cleared within the run | ≥ 70% | ≥ 98% | 100% |
| S2 LUNGS: vials lost | 2.0–5.0 (of runs that reach it) | 1.6–3.2 | 0.5–1.3 |
| S2 cleared | 30–60% | ≥ 90% | ≥ 98% |
| S3 BLOODSTREAM: vials lost | not banded (few reach it) | 2.5–4.4 | 0.9–2.0 |
| S3 cleared | 10–35% | 75–92% | ≥ 95% |
| S4 THE CELL: vials lost | — | 3.4–5.7 | 1.3–2.7 |
| Full clear (≤ 3 continues) | 5–20% | 55–75% | ≥ 90% |
| Mean continues used | 2.5–3.0 | 1.0–2.0 | 0.2–0.7 |
| **1CC** | ≤ 2% | 10–25% | **45–70%** |
| No vial lost in the whole run | 0% | ≤ 1% | ≤ 8% |

In words:

- A first-timer loses vials in AIRWAY and usually gets through it. LUNGS bites, and BLOODSTREAM and THE CELL are a real fight that needs continues.
- A casual player usually finishes with a continue or two.
- The 1CC stamp is an expert's achievement, and even experts miss it a third of the time.

### 2.3 Stage bands (vials lost per run reaching the stage, all attempts)

| Stage | Casual | Expert | Teeth of the sawtooth |
| --- | --- | --- | --- |
| 1-1 FIRST CONTACT | 0.0–0.2 | 0.0 | calm; learn the needle |
| 1-2 GESUNDHEIT (+ BIG SNEEZER) | 0.1–0.4 | 0.0–0.1 | first quiz |
| 1-3 ALPHA | 0.2–0.6 | 0.0–0.2 | first exam |
| 2-1 DEEP BREATH | 0.3–0.7 | 0.1–0.3 | above 1-2, below ALPHA |
| 2-2 GAS EXCHANGE (+ AEROSOL CLOUD) | 0.5–1.0 | 0.15–0.4 | |
| 2-3 BETA & GAMMA | 0.8–1.5 | 0.25–0.6 | |
| 3-1 CIRCULATION | 0.6–1.1 | 0.2–0.5 | above 2-2, below B&G |
| 3-2 SPLASHDOWN (+ LAMBDA) | 0.8–1.4 | 0.3–0.6 | |
| 3-3 DELTA | 1.1–1.9 | 0.4–0.9 | |
| 4-1 COPY ERROR | 0.9–1.5 | 0.35–0.7 | above 3-2, below DELTA |
| 4-2 FULL BLOOM (+ MOTHER CELL) | 1.1–1.8 | 0.4–0.8 | |
| 4-3 OMICRON PRIME | **1.4–2.4** | **0.6–1.2**, and ≥ 2.0 core hits per attempt | the exam: the highest of the run for both |

**Ordering rules (asserted on the means):** strictly rising within each sector, each opener between the previous sector's sample 2 and its boss, and bosses strictly rising. The first-timer is asserted per sector only.

### 2.4 The fairness floor (kept strict) and what is removed

Kept, and asserted on every proxy's hits:

- **F1 no forced hit.** For every hit any proxy takes, rewind 0.5 s and run the perfect-information autopilot without SOAP; it must avoid that hit. This is today's T4 rule 2, now applied to all three proxies.
- **F2 lead time.** From z ≥ 0, no bullet reaches the core under 0.6 s after it, or its telegraph, became visible.
- **F3 course changes are announced:** 0.3 s flash, at most once per second, never toward the core inside 2 u.
- **F4 speed bands:**
  - static ≤ 5.0 u/s;
  - aimed fans ≤ 7.0 u/s (7.5 in S4);
  - aimed singles and stacks of ≤ 3 up to the stage maximum;
  - effective speed ≤ 9.5 u/s on Normal.

  Sparen's density guide argues that fast bullets thin the field and slow ones let the eye focus on a small area, so the bands keep "dense means slow".
- **F5 perfect play is possible.** The autopilot clears every stage on every seed without SOAP, with ≤ 0.2 hits per stage. That requires it to aim (F8 in §1.2).
- **F6 nothing stalls.** Every stage ends within 1.5× its length band for every proxy. Every `until` step has a cap (§4.3).
- Unchanged: telegraph minimums, the 2.5 u spawn exclusion, gaps ≥ 0.5 u at 10 u, walls ≥ 2.0 u, at most two families on Normal, and never two aimed families at once.

**Removed as design targets.**

- RESEARCH_V1's per-stage "Hits ≤" ceilings for the 150 ms bot.
- FAIR-150 rule 1 (dodgeable with at most the row's hit ceiling).
- The curve test's "mean ≤ 1.2 hits per card".
- The hits-to-game-over *ceiling* as the only defensive check. It stays as the DOSE line's anti-Easy guard (§7.4).

Being hit is now expected; being *forced* to be hit is still a bug. The expert's per-card hits become a band: 0.05–0.6 per attempt on S1–S2 boss cards, 0.1–1.0 on S3–S4, worst seed ≤ 3.

### 2.5 Difficulty modes and where they live

| Mode | What it is | Where |
| --- | --- | --- |
| **NORMAL** (default) | The designed game: the §2.2 targets, 3 vials, 3 credits, power −1 level on death (strand catchable for 4 s) | Title difficulty toggle, pause, loss screen |
| **EASY** | Unchanged numbers: 5 vials, 3 SOAP, auto-SOAP on hit, ×0.6 bullets, ×0.85 speed, +0.15 s telegraphs, 2.8 u wall gaps, unlimited credits. **New:** death costs no power level. The weak start and the power curve stay, because growth is the feel, not a punishment | Title toggle; **EASY START** on a first visit; the loss screen offers it after 3 failures of one stage (today) **and after the second credit is spent in sector 1** (new) |
| **ASSIST: game speed** 100 / 90 / 80 / 70% | Orthogonal to the mode (dt scale on the fixed clock) | Pause menu and title options |
| **+1 VIAL** | After 3 failures of one stage | Loss screen (today) |
| Later, not this revision: **VIRULENT** | A Pact-style set of toggles unlocked by a Normal clear (§4.1) | Title, after a clear |

Stamps and reports:

- **1CC** is awarded on Normal at 100% speed only.
- At reduced speed the report shows **1CC · ASSISTED**, and +1 VIAL marks medal A (today).
- Easy shows **EASY CLEAR** and never a 1CC stamp.
- No hidden rank or adaptive difficulty. Garegga-style rank makes the 1CC opaque, and the point of this brief is a curve players can learn.

**Easy targets (lab E2, measured):** the first-timer proxy cleared 16/16 runs, all on one credit. That is right for Easy; keep it. Assert first-timer full clear ≥ 85% with ≤ 3 continues, and ≥ 1 core hit per stage from S2 on, so Easy still has tension.

## 3. Power progression: start weak, grow by mastery and choice

### 3.1 Starting stats (exact)

| Stat | Today | **New** | Reason |
| --- | --- | --- | --- |
| Cadence | 8 volleys/s (`fireInterval` 0.125) | **6 volleys/s (0.1667 s)** | The owner's lower-rate request and a calm start |
| L1 needles per volley | 3 (spray ±4.25°, or 3 parallel in focus) | **1** (straight ahead, focus or not) | Space Invaders' single shot, on theme. Aiming matters from the first second |
| Needles per second at start | 24 | **6** | |
| Needles alive in 1-1 (casual proxy, measured) | 12.6 mean, 15 max | **3.0 mean, 4 max** | |
| Antibody options | 2 at L2, 4 at L4, 4 needles/s each | **2 at L3, 4 at L4, 3 needles/s each** | The Y-shaped options become a mid-run milestone |
| Cadence cap with adjuvants | 10 volleys/s | **8 volleys/s** | Even a maxed build fires at today's base rate, never above |
| Needle damage, speed, collider | 1, 34 u/s, segment r 0.06 × 0.9 u | unchanged | |
| Movement | 11.5 u/s, focus 5.0 u/s, no inertia | unchanged | Movement audit holds |
| INJECT | tip r 0.05 at 0.95 u, reload 0.5 s (elites 0.8 s); popcorn cured, elites 10 × stageHp | unchanged base; it is the point-blank power axis (§3.3) | |
| Vials / SOAP | 3 / 2 at start, 2 per refill, cap 5, 100 grazes per SOAP, deathbomb 0.18 s | unchanged | If the expert's 1CC is still > 70% after the ladders, lever 1 is the Normal refill 2 → 1 (§3.6) |
| mRNA at start | L1 | L1 | |

### 3.2 The mRNA ladder (needles per volley, focus / spray, and antibodies)

| Level | Focus | Spray | Antibodies | Focused DPS, all hitting | Today |
| --- | --- | --- | --- | --- | --- |
| L1 | 1 | 1 | 0 | **6** | 24 |
| L2 | 2 (0.25 u apart) | 2 (±4.25°, which still lands on a boss 17.6 u away inside r ≥ 1.45) | 0 | **12** | 32 |
| L3 | 3 | 3 (0, ±4.25°) | 2 × 3/s | **24** | 40 |
| L4 | 4 | 5 (±8.5°) | 4 × 3/s | **36** | 56 |

- **When it arrives:** RESEARCH_CARDS §2.8's order holds, with the strands from the VESICLE and the midbosses.
  - L2 comes mid 1-2 (the VESICLE), so the first power step lands in the first quiz.
  - L3 comes after AEROSOL CLOUD (2-2).
  - L4 comes after LAMBDA (3-2).
- **Each step doubles the visible stream early**, the way Touhou fills power from 1.00 toward 4.00 and takes a level on death.
- **Death:** Normal −1 level with the 4 s catchable strand, as today; Easy loses none. Dropping from L2 to L1 halves DPS; that is the Touhou cost of a miss, and catching the strand undoes it.

### 3.3 INJECT as the mastery axis

INJECT already cures popcorn at once and deals 10 × stageHp to elites. With a 6 needles/s start, a cure is worth about 3 needles of a WILD TYPE at 1-1 and arrives in one touch. Point-blank play becomes the fastest way to kill, not a garnish. The proxies' INJECT rates (5 / 25 / 60% of safe chances) model this skill gap.

The INJECT line (§7) builds on it: cadence on cure, reload on telegraphs, antigen fired back, and a cure wave. No card changes the tip's reach or radius.

### 3.4 The expected power curve against enemy pressure, per stage

Planning values:

- Median potency is RESEARCH_CARDS' frozen 12-stage table. **It must be re-measured on the new card set and ladder** (§8 D4).
- WILD TYPE HP is base 3 × the sector factor.
- "Kill" is a focused WILD TYPE at the median.
- Card uptime u prices boss HP (§3.5).
- Pressure columns are the §4.2 ladder.

| Stage | Entry L | Median potency | Median focused DPS | WILD HP | WILD kill (s) | Card uptime u | Near-core pressure | Max aimed speed (u/s) | Aimed share |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1-1 | 1 | 1.00 | 6.0 | 3 | 0.50 | — | 0.30 | 5.0 | 55% |
| 1-2 | 1 → 2 | 1.00 | 6.0 → 12 | 3 | 0.50 → 0.25 | 0.45 (BIG SNEEZER) | 0.55 | 5.5 | 60% |
| 1-3 ALPHA | 2 | 1.056 | 12.7 | 3 | 0.24 | 0.45 | 0.75 | 6.5 | 35% |
| 2-1 | 2 | 1.094 | 13.1 | 4 | 0.31 | — | 0.65 | 6.0 (×1.3 exhale) | 50% |
| 2-2 | 2 → 3 | 1.15 | 13.8 → 27.6 | 4 | 0.29 → 0.15 | 0.60 | 0.85 | 6.5 | 45% |
| 2-3 B&G | 3 | 1.206 | 28.9 | 4 | 0.14 | 0.60 | 1.10 | 7.0 | 35% |
| 3-1 | 3 | 1.27 | 30.5 | 6 | 0.20 | — | 0.95 | 7.0 | 45% |
| 3-2 | 3 → 4 | 1.329 | 31.9 → 47.8 | 6 | 0.19 → 0.13 | 0.65 | 1.15 | 7.5 | 40% |
| 3-3 DELTA | 4 | 1.313 | 47.3 | 6 | 0.13 | 0.65 | 1.40 | 8.0 | 35% |
| 4-1 | 4 | 1.388 | 50.0 | 7 | 0.14 | — | 1.25 | 7.5 | 40% |
| 4-2 | 4 | 1.449 | 52.2 | 7 | 0.13 | 0.65 | 1.45 | 8.0 | 35% |
| 4-3 OMICRON | 4 | 1.511 | 54.4 | — | — | 0.65 | 1.75 | 8.5 | 25% |

What the player feels:

- Kill speed on popcorn improves **3.7×** across the run (0.50 → 0.13 s). Each new sector's first stage steps toughness up a little (0.24 → 0.31 at 2-1, 0.14 → 0.20 at 3-1), which is the power half of the sawtooth.
- Meanwhile pressure triples (near 0.30 → 1.75), so a strong syringe never makes the screen calm.

### 3.5 How card potency and enemy scaling interact

1. **Popcorn HP is authored, never deck-scaled.**
   - It is base HP × the sector factor: **1.0 / 1.4 / 1.9 / 2.4**, rounded and at least 1.
   - SOAP and burst damage follow the same factor.
   - This replaces `stageHp`'s use of `EXPECTED_POTENCY`. A median deck clears popcorn 1.2–1.5× faster than the reference syringe by S4, so adjuvants are visible.
2. **Boss and midboss card HP is TTK × median DPS(stage) × u(sector)**, with u = **0.45 / 0.60 / 0.65 / 0.65**.
   - The low S1 value prices novices' single-needle aim.
   - The lab used 0.35 / 0.60 / 0.70 / 0.80. ALPHA ended in 38 s, too short, and S4 fights pushed runs to 25 min, so these values move toward the middle.
   - The median deck ends cards at about 0.8–1.1 × TTK. A weak deck ends them by the timeout.
3. **The titer limits stay ×1.5 / 1.8 / 2.0 / 2.15** of the mRNA baseline.
   - The strongest legal build must still need **≥ 45% of TTK** on every card (today's floor is 40%).
   - So a great build is about twice as fast as the median, never instant.
4. **Card timeouts:** max(25, 1.6 × TTK) in S1–S2 and **max(25, 1.4 × TTK)** in S3–S4, so a weak build is not stuck in a long fight.
5. **Pressure never reads the deck.** Patterns, counts, speeds, telegraphs and the aimed share scale by stage only.
6. **Killing faster must not skip the danger.**
   - From S3 on, every sample beat is wait-based: a `wait(n)` before the next group, and `until('thin')` only with a cap. The density of a beat is reached even by a strong build.
   - OMICRON's exam is timer-only (§4.4).
   - A great build shortens exposure to stragglers, not to the pattern.
7. **Survivability stays bounded.** A full DOSE deck without legendaries must still give out before Easy does (hits-to-game-over ≤ Easy's 20, the existing rule). The ceiling is now a guard, not a target.
8. **Run length is a budget.**
   - Casual play is 16–20 min, or ≤ 25 min with drafts and reports (lab E3: 24.8 min of play, over budget).
   - Difficulty comes from density and speed, not from HP sponges. If a stage runs long, shorten its cards' TTK (S3–S4 × 0.85) before touching pressure.

### 3.6 Tuning levers, in the order to pull them

1. Per-stage density (count, choir cadence, bullet cap) toward the §4.2 ladder.
2. Card TTK and u for length.
3. Aimed speed within the F4 bands.
4. Only if the expert's 1CC stays > 70%: Normal SOAP refill 2 → 1 per vial.
5. Only if the casual's full clear stays > 75%: bosses 1 and 2 stop restoring a vial (keep the restore after DELTA).

Never change collision geometry, the core, the graze ring or movement to tune difficulty.

## 4. The difficulty curve and pacing across 12 stages

### 4.1 Principles and sources

- **Two loops of difficulty: the run, and a mastery layer on top.** Cave gates DoDonPachi's second loop behind a one-credit clear of the first plus a miss or score condition, and Ikeda conceived its true last boss as a test of the limits of dodging.
  - Our analogue: Normal is the first loop, the 1CC is its badge, and VIRULENT (later) is the second.
  - The first loop must be clearable, with continues, by ordinary players.
- **Slower, more numerous bullets are the satisfying difficulty.** Ikeda's Arcadia interview, as translated on shmups.system11, argues that dodging more, slower bullets feels more rewarding than raw speed. Sparen adds that more bullets does not by itself mean harder: structure and timing matter more than count.
  - So the ladders raise *near-core pressure and structure* first, aimed speed second and slowly, and keep static fields ≤ 5 u/s.
- **Touhou's structure.**
  - Six stages, each with a midboss and a boss.
  - Spell cards with a name, a timer and a capture bonus.
  - Power that fills from 1.00 and is lost on death.
  - The good ending needs a no-continue clear on Normal or harder.
  - Community advice tells newcomers to start on Normal and drop to Easy without shame (Maribel Hearn's FAQ).
  - ZUN's framing in Touhou Garakuta is plain: avoid the attacks and you may clear the stage.
  - We copy the structure: quiz midbosses, exam bosses, the 1CC as the real ending, and Easy as a respected door.
- **Slay the Spire's act scaling and Ascension.**
  - Each act's enemies, elites and bosses are their own ladder.
  - Ascension raises them as separate, named knobs: elite frequency, damage, HP, movesets, and only a 75% heal after bosses.
  - Mega Crit tuned with pick rates, winning-deck appearance and per-enemy damage taken, and slowed The Awakened One's scaling from data (Game Developer on their GDC 2019 talk).
  - We take three things: sector-scoped ladders, the boss as the act's exam, and measuring outcomes per enemy, not per run (§8 D1 reports vials by source).
- **Hades' Pact of Punishment: difficulty as named, stackable, opt-in knobs.**
  - Examples: +20% enemy damage per rank, +20% enemies per rank, +15% enemy HP per rank, one fewer boon choice per rank, and new boss techniques.
  - Each knob carries Heat, and Heat raises rewards.
  - God Mode is the other end: 20% damage resistance, +2% per death, up to 80%. Supergiant framed it as a way for players who are not gods to get through.
  - We keep Normal fixed and learnable. VIRULENT (later) is Pact-like, and Easy plus ASSIST is our God Mode.
- **Returnal's GDC talk:** a steep "zero to hero" curve, and the view that triumph needs moments near despair. The new start is the zero.
- **GDC talks on difficulty.**
  - John Austin (GDC 2024 IGS, *Challenging or Approachable? Pick Two*): challenge and approachability are not opposites.
  - Brett Moody (GDC 2026, *Flavors of Challenge*): difficulty is several separate ingredients, not one lever.
  - Matt MacLean (GDC 2024 IGS, *Making Accessible Games with Indie Resources*): failure should come from the player's choices, never from fighting the controls or the interface.
  - So we raise *dodging* challenge only, keep controls and readability fixed, and give novices separate doors (Easy, ASSIST).
- **Flow.** Jenova Chen's *Flow in Games* (CACM 50(4), 2007) places each player's flow zone at a different difficulty.
  - One curve cannot fit everyone, so we set bands per proxy and give players choice-driven adjustments: INJECT and graze are opt-in risk, and the mode is theirs.
  - A sawtooth of tension and rest keeps each band inside its zone.

### 4.2 The ladder (Normal, median deck, measured by `tests/suite-audit.mjs`)

| Stage | Length band (s) | Near | Peak alive | Spawn/s | Aimed / static / random | Static max | Aimed max | Quiet ≥ | Rest ≥ 2.5 s at least every |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1-1 | 70–85 | 0.30 | 16 | 1.0–2.0 | 55 / 45 / 0 | 4.5 | 5.0 | 45% | 20 s |
| 1-2 | 75–90 | 0.55 | 30 | 2.0–3.0 | 60 / 40 / 0 | 4.5 | 5.5 | 35% | 20 s |
| 1-3 ALPHA | 60–75 | 0.75 | 50 | 4.5–6.0 | 35 / 65 / 0 | 4.0 | 6.5 | 25% | card intros |
| 2-1 | 70–85 | 0.65 | 40 | 3.0–4.5 | 50 / 40 / 10 | 4.5 | 6.0* | 30% | 25 s |
| 2-2 | 75–90 | 0.85 | 55 | 4.0–5.5 | 45 / 40 / 15 | 4.5 | 6.5* | 25% | 25 s |
| 2-3 B&G | 85–100 | 1.10 | 75 | 5.5–7.0 | 35 / 55 / 10 | 4.2 | 7.0* | 18% | card intros |
| 3-1 | 75–90 | 0.95 | 65 | 5.0–6.5 | 45 / 45 / 10 | 5.0 | 7.0 | 25% | 30 s |
| 3-2 | 80–95 | 1.15 | 80 | 6.0–7.5 | 40 / 50 / 10 | 5.0 | 7.5 | 20% | 30 s |
| 3-3 DELTA | 95–115 | 1.40 | 100 | 7.0–9.0 | 35 / 60 / 5 | 4.0 | 8.0 | 15% | card intros |
| 4-1 | 80–95 | 1.25 | 90 | 7.0–8.5 | 40 / 50 / 10 | 5.0 | 7.5 | 20% | 35 s |
| 4-2 | 85–100 | 1.45 | 105 | 8.0–9.5 | 35 / 55 / 10 | 5.0 | 8.0 | 16% | 35 s |
| 4-3 OMICRON | 110–130 | 1.75 | 130 | 10–12 | 25 / 60 / 15 | 4.6 | 8.5 | 12% | card intros |

\* Base speed; BREATH's exhale multiplies it by 1.3. F4's 9.5 u/s effective cap applies.

- **Sawtooth rules (asserted):**
  - Near and peak rise strictly within a sector.
  - Each opener lies strictly between the previous sector's sample 2 and boss: 0.55 < 0.65 < 0.75; 0.85 < 0.95 < 1.10; 1.15 < 1.25 < 1.40.
  - Bosses rise strictly: 0.75 < 1.10 < 1.40 < 1.75.
  - Each measured value sits within ±15% of its row.
- **Total casual play:** 16–20 min.
- **Lab starting point for the levers (E3, per sector):**
  - bullet counts × 0.85 / 1.05 / 1.2 / 1.3;
  - aimed speed × 1.0 / 1.03 / 1.06 / 1.10 (static fields excluded);
  - choir interval × 1.2 / 1.0 / 0.85 / 0.8;
  - stage bullet cap × 1.0 / 1.1 / 1.2 / 1.3.

### 4.3 Rest beats and the calm start

- **1-1** keeps the 60-mini homage grid. With one needle it becomes a short Space Invaders lesson, about 12–16 s for a person who sweeps under the grid.
  - The first aimed cough is at 5.0 u/s (was 5.5). Choir cadence is × 1.2.
  - The grid **advances 0.3 u after 4 s without a kill** (Space Invaders' march) and its sway stays 0.5 u, so columns pass over a still player.
  - `until('thin', 24)` gets a **25 s cap**, after which the survivors retreat and count as escaped for R0.
  - **Every `until` step in the run gets a cap** (1.5 × its authored beat).
- **Rests:** ≥ 2.5 s with at most 3 bullets alive.
  - At least every 20 s in S1, 25 s in S2, 30 s in S3 and 35 s in S4. Late sectors hold tension longer.
  - The draft is the rest between stages. After a boss, the FIELD NOTE and the boosted draft are the long rest.
- **No lull without bullets over 6 s** outside intros and card holds (today's rule).

### 4.4 Every boss tests its sector's idea; the finale is the exam

| Boss | Tests | Decisions |
| --- | --- | --- |
| BIG SNEEZER (1-2 midboss, quiz) | The odd fan aims its centre at you: tap sideways | **Gentler:** ACHOO! 7-way over 56° (was 9 over 60°), tiers 4.0 / 4.8 (was 4 / 5), 2 reps 0.6 s apart, every 4.2 s (was 3.8), aimed cough 5.5 u/s every 3.2 s (was 6.5 / 2.8). Target: first-timer ≤ 1.2 vials per attempt (today it causes 70% of their 1-2 hits) |
| ALPHA (1-3, exam) | Lanes vs aimed, and spell cards | Cards unchanged; u 0.45; close the lull to ≤ 6 s |
| AEROSOL CLOUD (2-2 midboss, quiz) | BREATH: the mist sprays on the exhale | Unchanged |
| BETA & GAMMA (2-3, exam) | Commit on the inhale; only the glowing twin is hurt | The casual spike (lab 2.13 vials) is brought into 0.8–1.5: PING-PONG drips 6 → 5. Keep CROSS INFECTION's lattice as the test |
| LAMBDA (3-2 midboss, quiz) | Lanes and the jet locked where you stood | Unchanged |
| DELTA (3-3, exam) | CURRENT and halves: walls drift with the flow | The flow flips **at each card change** (2 s warning), so its four cards rehearse both directions |
| MOTHER CELL (4-2 midboss, quiz) | Replication: shoot the virions before they bud | Shorter cards (TTK 8 / 9 / 9), so 4-2 stays below OMICRON (lab inversion: 1.75 vs 0.18) |
| **OMICRON PRIME (4-3, the exam)** | Everything: each sector's idea once, then R0 | See the list below this table |

OMICRON decisions:

- **SNEEZE STORM runs under BREATH.** Its 6 s cycle and warning are borrowed from LUNGS.
- **QUARANTINE (survival, 15 s) runs under CURRENT.** The box drifts 0.6 u/s and flips once, with the warning.
- **CORONA FLARE's ring gaps mutate.** They flash for 0.3 s and shift once per ring, per F3.
- **R0 > 1 becomes a hybrid.** Its HP ends the *replication*. The last **12 s are a timer-only survival** under the final 3-stack coughs, so no build skips the exam.
- **Targets:**
  - casual 1.4–2.4 vials per run reaching it;
  - expert 0.6–1.2 vials and ≥ 2.0 core hits per attempt;
  - the highest of the run for both;
  - F1–F6 hold.

## 5. How the targets get met (squad order of work)

1. Commit the proxies and the difficulty harness (§8 D1) and reproduce §1.2's "today" row before changing anything.
2. Land the starting weapon and mRNA ladder (§3.1–3.2), the popcorn HP ladder and the boss pricing (§3.5). Re-measure EXPECTED_POTENCY on the new ladder.
3. Land the §4.3 guard-rails (caps, the grid advance) and make the autopilot aim, so F5 and F6 pass.
4. Retune densities toward §4.2, then the boss decisions of §4.4. Iterate on the harness until §2.2–§2.3 pass with the uncalibrated proxies.
5. Hand the build to the owner for the calibration session (§2.1). Refit the proxies, then re-tune to the bands.
6. The 3D draft (§6) and the new card set (§7) can proceed in parallel with steps 2–4. They share `cards.mjs` with the ladder, so one writer at a time.

## 6. The 3D draft: vaccine cartridges

### 6.1 Concept

The adjuvants are **vaccine cartridges**: glass carpules, the kind that load into pen injectors. They float into the lab view over the frozen specimen, turn slowly and catch the same light as the rest of the game. Picking one **loads it into the syringe**: the cartridge slides into the barrel, the plunger seats, and the serum's colour runs into the vaccine chamber. In the fiction you are formulating the next dose, and on screen it is the most 3D moment in the game. Inscryption shows the value of cards as physical objects: its designer chose a physical hand over an overlay, and that constraint shaped what information to show. Dead Space's GDC talk on putting the UI inside the world is the other reference.

### 6.2 Composition and camera

- **Getting there.** During the existing LAB REPORT (2.5 s, skippable after 0.5 s), the gameplay camera eases **0.8 s** from the board framing to a **lab view**: pitch 12° flatter, pulled back 15%, with the board's glass slab and rails reading as a 3D specimen slide. The cleared board is cheap to render live.
- **The frame.** When FORMULATE opens, that frame is rendered once into a render target. The draft scene uses it as `scene.background` (one textured quad, dimmed to 35% and desaturated 60%). The board scene is not re-rendered.
- **The draft camera.** A dedicated `PerspectiveCamera`, FOV 35°, at (0, 2.2, 9) looking at (0, 1.4, 0) (8° down), so caps and shoulders show their volume.
- **Landscape (960×640).** The syringe lies horizontally across the lower third at 3.2× scale, plunger drawn back. Three cartridges stand above it on an arc, about 34% of the viewport tall, slots 2.6 u apart, each tilted 12° toward the camera.
- **Portrait (390×844, 320×568).** A **carousel**: the selected cartridge front and centre at 1.0 scale, the other two at 0.7 behind, at ±35% of the width. The syringe sits below and the 72 px INJECT button stays in the thumb zone.
- **Minimum projected size:** a cartridge is ≥ 90 px tall at 960×640, and the front one is ≥ 64 px wide at 320×568.

### 6.3 Lighting

- Reuse the game's own rig so the cartridges belong to the world:
  - hemisphere `#e4f6ff` / `#15302e` 0.75;
  - key `#fff4e6` 2.6 from the upper front-left;
  - rim `#9fe8ff` 2.2 from behind.
- A **lamp sweep:** the key light's azimuth swings ±10° over 3 s, so highlights travel along the glass. This is specular motion with no extra light.
- Environment: a procedural 256×128 equirect (a gradient plus two bright "window" bars), PMREM-filtered **once at boot**, for clearcoat sheen and glass reflections.
- One `PointLight` (amber `#ffc35a`, intensity 2, distance 3) inside a **legendary** cartridge only, pulsing 0.6 → 1.0 at 1.2 Hz.
- No shadow maps.

### 6.4 Materials: tier by material, line by contents

Tier is never colour alone. It reads through glass, cap, engraved notches and motion.

| Tier | Glass | Cap | Serum | Notches on the cap |
| --- | --- | --- | --- | --- |
| COMMON | Clear borosilicate (the syringe's own glass: `MeshPhysicalMaterial` `#e9fbff`, opacity 0.30, roughness 0.04, clearcoat 1) | Matte aluminium crimp (metalness 0.8, roughness 0.45) | Line colour, emissive 0.25 | 1 |
| RARE | **Frosted** (roughness 0.5, opacity 0.55, fine noise bump) | Polished steel with a cyan anodised ring `#5fe3ff` | Emissive 0.45 | 2 |
| EPIC | **Cobalt** glass (`#3a5bff` tint, opacity 0.45, roughness 0.12), double printed band | Chrome | 24 suspended particles drifting at 0.02 u/s | 3 |
| LEGENDARY | Clear glass | **Gold** crimp with a crown-shaped flip-off seal (metalness 1, roughness 0.22, `#f2c14e`) | **Glowing** (emissive 1.1) with a slow internal swirl and the amber light | 4 |

What floats in the serum names the **line** (≤ 300 triangles each):

- NEEDLE: a tiny steel needle along the axis.
- INJECT: a white plunger-tip disc with a cross glint.
- ANTIBODY: the in-game Y option, scaled down.
- EXPOSURE: a dashed graze ring orbiting.
- SOAP: rising bubbles.
- DOSE: a sloshing meniscus.

The line glyph (today's SVG set, plus a new INJECT glyph) is printed on the label.

**Trade-off cards** carry a pink band at the shoulder. Pink is the danger colour, and a cost is a risk.

### 6.5 Text: minimal, readable, printed on the label

- Each cartridge carries a **flat label plate** on its face, a `CanvasTexture` of 512×160 drawn with the game's dot-matrix lettering.
  - **Line 1:** the NAME, at most 16 characters. Cap height ≥ 14 px at 960×640 and ≥ 11 px at 320 wide.
  - **Line 2:** one stat, at most 18 characters (§7.3).
  - Trade-offs add a third short pink **COST** line.
- The idle yaw is limited to ±18°, so the label always faces the camera.
- The **selected** cartridge adds one caption on the rack's front lip (≤ 60 characters, also in 3D). It holds the full effect sentence, or NOW → AFTER, or SYNERGY: whichever applies, in that priority.
- Screen readers keep the `aria-live` summary (`#formulate-live`, visually hidden) with the full text.
- The header becomes a line etched on the rack: stage cleared, titer pips and RESAMPLE ×n.

### 6.6 Animation timings

| Moment | Time | Motion |
| --- | --- | --- |
| Open | 0–250 ms | Backdrop dims and desaturates |
| | 0–350 ms | Syringe rises into the lower third (ease-out cubic); plunger draws back 0.3 u |
| Drop-in | starts at 150 / 270 / 390 ms, 450 ms each | Cartridges fall from above (ease-out-back, 6% overshoot) and land with a glass tink |
| Tier reveal | on landing | COMMON lands; RARE gets a cyan rim glint 120 ms later (300 ms long); EPIC particles wake 200 ms later; LEGENDARY spins 1.5 turns over 500 ms before landing, its light fading in over 300 ms (today's 0.5 s spin-up SFX) |
| Inputs | from 500 ms | Today's fresh-press gate |
| Idle | loop | Yaw ±18°, period 4 s, phase offset 1.3 s per slot; bob 0.03 u at 0.4 Hz; lamp sweep |
| Select | 160 ms | Lift 0.25 u toward the camera, scale 1.12; the others dim to 70%; the caption appears |
| Inject | 0–300 ms | The selected cartridge arcs into the barrel and seats |
| | 300–360 ms | A 60 ms hold with a click |
| | 360–700 ms | The serum colour runs into the vaccine chamber, which keeps the line colour for 1.5 s of play; the other cartridges fall out of frame (300 ms) |
| | 700–1100 ms | The camera returns to the play framing; play resumes at 1.1 s. Any press after 360 ms skips to resume |
| RESAMPLE | 250 + 600 ms | The rack turns 180° and three new cartridges drop in |
| DISCARD (+1 SOAP, press twice) | 400 ms | The cartridges tip into a sharps bin; a SOAP bubble rises to the HUD |

### 6.7 Input (one scheme, as today)

- **Keyboard:** ← / → or 1–3 select; Enter or Space injects; R resamples; S twice discards; Esc pauses.
- **Mouse:**
  - Hovering selects (raycast against an invisible capsule 1.25× the cartridge silhouette).
  - Clicking the selected cartridge, or double-clicking, injects.
  - Dragging a cartridge onto the syringe also injects. This is a delight, not a requirement.
- **Touch:**
  - Tap selects; tap again, or the 72 px INJECT button, injects.
  - In portrait, swipe left or right to turn the carousel.
  - Touch targets are ≥ 48×48 CSS px.
- RESAMPLE, DISCARD and INJECT may stay small DOM **buttons**; they are controls. Nothing that shows card content may be DOM, except the hidden live region.

### 6.8 Performance budget (SwiftShader, 960×640, DPR 1)

- **Frame time:**
  - median ≤ 20 ms (≥ 50 fps) and p95 ≤ 33 ms, idle and during the drop-in;
  - p95 ≤ 40 ms during the inject animation;
  - first-open hitch ≤ 150 ms.
- **Load condition:** measured on a machine with load average ≤ 4. Above that the check reports INCONCLUSIVE, never PASS. Earlier frame-time checks here failed at load 26–55.
- **Budget:**
  - ≤ 40 draw calls and ≤ 25,000 triangles (`renderer.info`);
  - per cartridge ≤ 3,000 triangles in ≤ 7 meshes (glass lathe 24 × 18, cap, stopper, serum, label, contents, tier ornament);
  - ≤ 1 point light, no shadows;
  - **no `transmission`** (it adds a transmission pass, too costly on SwiftShader). Glass is transparency, clearcoat and the environment map;
  - no post-processing;
  - pixel ratio min(DPR, 1.25) while the draft is open;
  - the board is the held background texture, never re-rendered;
  - a static backdrop allows a scissored redraw of the cartridge band only.
- **Prewarm:** cartridge geometries and materials are compiled at boot with today's hidden prewarm pass. The three label canvases are drawn at open (< 5 ms).
- **Automatic LITE fallback:** if the first 30 frames' median exceeds 28 ms, switch to `MeshStandardMaterial`, no particles and no point light. Report it in `__game.draft.scene().lite`.
- **Play frame time** must be unchanged or better: L1 draws about 3 needles instead of about 13.

## 7. The 30 adjuvants, rewritten around verbs

### 7.1 Rules

- Six lines of five cards, each with a build identity and a verb.
- Tier split stays **10 / 9 / 6 / 5**, with the odds, titer, pity, RESAMPLE and DISCARD of RESEARCH_CARDS §4 unchanged.
  - NEEDLE, ANTIBODY: C R R E L.
  - INJECT, EXPOSURE, SOAP: C C R E L.
  - DOSE: C C R R E. It has no legendary; it is the survivor's safety line.
- **At most 5 numbers-only cards** (flag `kind: 'stat'`). Every line has ≥ 3 cards that change a decision (`kind: 'verb'`).
- **One card per sector rule.** It has a general rule that works anywhere and pays more inside its sector, so it is never a dead pick.
- Unchanged constraints:
  - no collider, graze radius or reach changes;
  - patterns never change;
  - legendaries need 2 earlier picks in their line;
  - at most 2 legendaries per run;
  - no dead offers.
- New caps: **cadence ≤ 8 volleys/s**; damage buckets +70% (today's cap).
- Card text is generated from data (today's rule). The label stat line is data too.

### 7.2 Lines and identities

| Line | Identity | The player's verb | Capstone |
| --- | --- | --- | --- |
| NEEDLE | **Marksman:** hold focus, line up, pierce the stack | FOCUS | JET INJECTOR |
| INJECT | **Medic:** dive in on a telegraph, cure, back out | INJECT | MASS VACCINATION |
| ANTIBODY | **Escort:** your antibodies hunt while you dodge | positioning | HERD IMMUNITY |
| EXPOSURE | **Dancer:** live inside the graze ring | GRAZE | INNATE RESPONSE |
| SOAP | **Cleaner:** reset the screen on your terms | SOAP | AUTOCLAVE |
| DOSE | **Survivor:** take a hit and keep the run | — | BACKUP ALIQUOT (epic) |

### 7.3 The set

Kind: V = changes a decision, S = numbers only. "New" marks cards that did not exist.

| # | Name | Tier | Line | Effect (exact) | Label stat | Kind | Change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | STEADY HAND | C | NEEDLE | Hold focus 0.6 s: the stream locks to one line and needles deal +35% until you release | FOCUS 0.6 S → +35% | V | Reworked (was +12% focus damage) |
| 2 | TWIN BARREL | R | NEEDLE | +1 needle per volley (focus: parallel 0.25 u; spray: the next ±4.25° step) | +1 NEEDLE | V | Kept. The owner's double shot, now +100% at L1 and +25% at L4, under the titer limit |
| 3 | HOLLOW BORE | R | NEEDLE | Needles pass the first virus and hit a second for 60% | PIERCE · 60% | V | Kept |
| 4 | SPLIT TIP | E | NEEDLE | A needle that kills splits into 2 at ±25° (≤ 24 alive) | KILL → SPLIT ×2 | V | Kept |
| 5 | JET INJECTOR | L | NEEDLE | In focus a 0.5 u jet replaces the needles: hits all it touches at 1.25× DPS | FOCUS → JET | V | Kept |
| 6 | BOOSTER SHOT | C | INJECT | Each cure: cadence +2 volleys/s for 2.0 s (refreshes, never above 8/s) | CURE → +2/S · 2 S | V | New |
| 7 | RETRACTABLE NEEDLE | C | INJECT | INJECT reloads in 0.3 s (elites 0.5 s), was 0.5 / 0.8 s | RELOAD 0.3 S | S | Moved to INJECT |
| 8 | PROOFREADING | R | INJECT | Curing a virus during its telegraph (inhale, mutation flash, aim lock) reloads INJECT at once. In THE CELL every MUTATION flash is a telegraph | CURE A TELL → RELOAD | V | New (MUTATION card) |
| 9 | ANTIGEN MEMORY | E | INJECT | A cure's antigen tokens fly as needles (1 each, max 6, 1× damage) at the nearest virus within 10 u; they still score | ANTIGEN → NEEDLES | V | New |
| 10 | MASS VACCINATION | L | INJECT | 4 cures within 6 s release a 3 u cure wave: popcorn inside cured, bullets inside turned to antigen, boss parts −2% of the card (cooldown 6 s) | 4 CURES → WAVE | V | New |
| 11 | FC RECEPTOR | C | ANTIBODY | Antibodies aim at the last virus your needles hit (±30°, ≤ 12 u) | ANTIBODIES FOLLOW | V | New (replaces IgG BOOST) |
| 12 | CLONAL EXPANSION | R | ANTIBODY | +2 antibodies now (from L1); 4 from L3; at L4 +20% antibody damage | +2 ANTIBODIES | S | Reworked for the new ladder. The Escort's entry card |
| 13 | AFFINITY MATURATION | R | ANTIBODY | Antibodies +5% per sample cleared without losing a vial (max +40%) | +5% PER CLEAN SAMPLE | V | Reworked (was any sample) |
| 14 | OPSONIN TAG | E | ANTIBODY | Antibody hits tag a virus for 2 s: +15% damage from every source | TAG → +15% | V | Kept |
| 15 | HERD IMMUNITY | L | ANTIBODY | Antibodies home on the nearest virus within 9 u (±60°) and fire 50% faster | ANTIBODIES HUNT | V | Kept |
| 16 | HORMESIS | C | EXPOSURE | Each graze: needles +2% for 2 s, stacking to +20% | GRAZE → +2% (≤20%) | V | New. Hormesis is the low-dose effect |
| 17 | TIDAL VOLUME | C | EXPOSURE | Grazing a bullet moving faster than 6 u/s counts as 2 grazes. BREATH's exhale pushes most bullets over it | FAST GRAZE ×2 | V | New (BREATH card; replaces CLOSE CALL) |
| 18 | LIVE CULTURE | R | EXPOSURE | Needles +25% while a bullet is in the ring. COST: −10% while it is empty | RING BUSY → +25% | V | Kept (trade-off) |
| 19 | FEVER | E | EXPOSURE | Every 40th graze: 5 s FEVER, needles +20% and pierce one | 40 GRAZES → FEVER | V | Kept |
| 20 | INNATE RESPONSE | L | EXPOSURE | Each graze fires a 2× needle at the nearest virus within 12 u (≤ 10/s) | GRAZE → NEEDLE | V | Kept |
| 21 | LATHER | C | SOAP | +1 SOAP now; each vial refill gives 3 SOAP (was 2); second copy: cap 6 | +1 SOAP / REFILL | S | Kept |
| 22 | MICELLE | C | SOAP | Your SOAP pulls every antigen token into the syringe; each adds 1 graze toward the next SOAP | SOAP → +GRAZE | V | New (replaces SURFACTANT) |
| 23 | EPIPEN | R | SOAP | A hit with 2+ SOAP in stock spends 2 and saves the vial (not on Easy) | HIT → SPEND 2 SOAP | V | Kept |
| 24 | FOAM | E | SOAP | SOAP leaves a 5 u foam for 2.5 s that turns bullets into antigen | SOAP → FOAM 2.5 S | V | Kept |
| 25 | AUTOCLAVE | L | SOAP | +1 SOAP every 20 s of play; a SOAP that clears 30+ bullets refunds itself | +1 SOAP / 20 S | V | Kept |
| 26 | EXTRA DOSE | C | DOSE | +1 max vial, filled now (max 2 copies) | +1 VIAL | S | Kept |
| 27 | STREAMLINE | C | DOSE | Moving the same horizontal way for 0.4 s: +10% speed, +15% when moving with the CURRENT (focus unchanged, ≤ 12.9 u/s, not on touch) | KEEP MOVING → +10% | V | New (CURRENT card; replaces SILICONE PLUNGER) |
| 28 | ENTERIC COATING | R | DOSE | A coating absorbs one core hit and re-forms 30 s after it breaks; second copy: it holds 2 hits | COATING · 1 HIT | V | Kept; absorbs LNP SHELL's 2-hit role |
| 29 | GLASS SYRINGE | R | DOSE | Needles and antibodies +35%. COST: −1 max vial (never below 2) | +35% DAMAGE | S | Was epic +40%; now the rare trade-off |
| 30 | BACKUP ALIQUOT | E | DOSE | Once per sample a lost vial drops as an aliquot: catch it within 3 s to refill | CATCH YOUR LOST VIAL | V | Kept; the Survivor's capstone |

- **Cut:** CONCENTRATE, RAPID RELEASE (and with it every cadence card except BOOSTER SHOT's conditional one), 18G WIDE BORE, IgG BOOST, SURFACTANT, REFLEX ARC, CLOSE CALL, SILICONE PLUNGER, LNP SHELL (folded into ENTERIC ×2), and the ANTIGEN HARVEST fallback (INJECT ships).
- **Numbers-only cards:** 4 (RETRACTABLE NEEDLE, LATHER, EXTRA DOSE, GLASS SYRINGE) plus CLONAL EXPANSION, which counts as `stat` but visibly changes the syringe. That is 5, down from 15.
- **Synergies printed on the draft:**
  - STEADY HAND + JET;
  - HOLLOW BORE + FEVER;
  - SPLIT TIP + OPSONIN;
  - BOOSTER SHOT + PROOFREADING;
  - RETRACTABLE + MASS VACCINATION;
  - ANTIGEN MEMORY + MICELLE;
  - HORMESIS + LIVE CULTURE;
  - TIDAL VOLUME + FEVER;
  - FC RECEPTOR + OPSONIN;
  - CLONAL + HERD;
  - LATHER + EPIPEN;
  - MICELLE + AUTOCLAVE;
  - ENTERIC + BACKUP ALIQUOT.

### 7.4 Pricing and eligibility

- **Potency** (focused boss DPS, before the titer clamp) needs new conventions:
  - STEADY HAND: 60% lock uptime.
  - HORMESIS: 1.5 grazes/s.
  - BOOSTER SHOT and ANTIGEN MEMORY: 0.4 cures/s for a casual medic, priced on the spray/popcorn model (`sprayDpsOf`), since INJECT never reaches a boss body.
  - MASS VACCINATION: one wave per 15 s.

  The whole-run harness (§8 D1) judges these conventions, as `npm run test:balance` judges today's.
- **Antibody cards** need antibodies at the next stage's entry power (L3+) or CLONAL EXPANSION. The Escort build therefore starts with CLONAL or waits for 2-3, which is a real build decision.
- **Sector cards** are always eligible. In the draft *entering* their sector, slot 3's line-diversity rule yields once (50%) to offer that card if it is not owned.
- **The titer limits clamp early spikes:** TWIN BARREL and CLONAL at L1 each double raw DPS and are clamped to ×1.5. The rack's POTENCY readout shows the clamp, so a clamped pick never looks broken.
- **Survivability guard:** the worst all-DOSE Normal deck still has hits-to-game-over ≤ 20 (Easy's), measured with the coating, EPIPEN and ALIQUOT.

## 8. Tests the implementation squad must add

| ID | Test | Where | Asserts |
| --- | --- | --- | --- |
| D1 | **Human-proxy harness** | `tests/humans.mjs` (profiles of §2.1, inputs only, never edits state) and `tests/difficulty.mjs` (`npm run test:difficulty`, 24 seeds × 3 proxies, workers) | §2.2 sector bands and §2.3 stage bands on Normal with each proxy's draft policy; Easy first-timer full clear ≥ 85%; ordering rules; vials and hits **by source** per stage (StS-style per-enemy reporting); run play time 16–20 min for the casual. Prints a table to BALANCE.md. The proxies **aim** (lead the target, sweep under formations) and **INJECT** when a safe chance exists: a popcorn body within 3 u ahead, a loaded plunger, and no seen bullet crossing the tip's path in the next 0.4 s |
| D1s | Harness smoke | `tests/difficulty.test.mjs` (in `npm test`, ≤ 10 s) | The profiles' parameters are exactly §2.1's; one seed per proxy clears 1-1; the deathbomb press lands ≥ 150 ms after the hit for every proxy; no proxy reads RNG or future state |
| D2 | **Starting weapon** | `tests/syringe.test.mjs` | Empty kit at L1: 6 volleys/s, focus 1 / spray 1 needle, 0 antibodies. L2 2/2/0, L3 3/3/2 at 3/s, L4 4/5/4. Cadence cap 8 with any deck (BOOSTER SHOT included). In 1-1's first 20 s with the casual proxy: mean needles alive ≤ 4.5, max ≤ 6 |
| D3 | Power curve | `tests/cards.test.mjs` | Median focused DPS within ±10% of §3.4 per stage; end/start ratio ≥ 7; median WILD kill time falls ≥ 3× from 1-1 to 4-x; popcorn HP never reads the deck; strongest legal build ≥ 45% of TTK on every card; median deck ends cards at 0.8–1.1 × TTK |
| D4 | EXPECTED_POTENCY re-measured | `tests/cards.test.mjs` | The frozen table matches a 500-seed measurement on the new card set and ladder within 5% (today's test 10, re-baselined) |
| D5 | **Fairness floor** | `tests/suite.test.mjs` and `tests/curve.test.mjs` | F1 on every proxy's hits (0 forced); F2–F4; F5 autopilot clears all 12 stages on 8 seeds without SOAP, ≤ 0.2 hits per stage; F6 every stage ends within 1.5× its band for every proxy, and every `until` step has a cap. **Remove** the `HITS` ceilings and `mean ≤ 1.2`; replace them with the expert per-card band (§2.4) |
| D6 | Ladders | `tests/suite.test.mjs` T3 | §4.2: strict rise within a sector, each opener between the previous sample 2 and boss, bosses strictly rising, ±15% of each row, speed bands, quiet floors, rest cadence, lengths |
| D7 | **3D draft** | `tests/browser/draft-3d.mjs` and the root `common/tests/browser.mjs` Corona check | During phase `draft`: the `#game` canvas is visible; **no visible DOM element shows card content** (no `.slide`, no card name or effect in visible DOM; the only text outside the canvas is the hidden live region and the control buttons). `__game.draft.scene()` returns 3 cartridges whose ids and tiers equal `run.offer`, each with a screen rect ≥ 90 px tall at 960×640 and the front one ≥ 64 px wide at 320×568, rects not overlapping (landscape), and label text equal to name + stat. Picks work by keys 1–3 + Enter, by a mouse click at the rect centre, and by a touch tap + INJECT, and the deck gains the id. RESAMPLE and DISCARD work. Inject → play resumes in ≤ 1.2 s. Shading probe: inside each cartridge rect the brightest and darkest 5% of pixels differ by ≥ 60 levels (lit 3D, not a flat panel). Tier materials: frosted roughness ≥ 0.45, gold cap metalness 1 |
| D8 | **Draft frame time** | `tests/browser/draft-3d.mjs` | SwiftShader 960×640, DPR 1, load average ≤ 4 (else INCONCLUSIVE): idle median ≤ 20 ms and p95 ≤ 33 ms over 120 frames; drop-in p95 ≤ 33 ms; inject p95 ≤ 40 ms; first open ≤ 150 ms; `renderer.info` calls ≤ 40, triangles ≤ 25,000; LITE flag false on an idle machine. Play frame time at 1-1 not worse than v1.0 |
| D9 | Card set | `tests/cards.test.mjs` | 30 cards; tiers 10/9/6/5; six lines × 5; ≤ 5 `stat` cards; ≥ 3 `verb` cards per line; name ≤ 16 and stat ≤ 18 characters; sector cards' general rule works outside their sector; no card changes a collider (today's test 2); cadence never above 8 |
| D10 | Modes and stamps | `tests/run.test.mjs` | 1CC stamp only on Normal at 100% speed; ASSISTED and EASY CLEAR labels; Easy deaths cost no power; the sector-1 Easy offer after the second credit |

The proxies' numbers are evidence of reachability and pressure, not of fun. BALANCE.md must say so, as it does today.

## 9. Risks, and what the owner must judge by playing

### 9.1 Risks

1. **The proxies are not people.** The bands are only as good as the calibration session (§2.1). Until it runs, the first-timer's bands are provisional; the casual and expert bands are anchored on the owner finding today's build too easy, which matches the casual proxy's 14/16 1CC.
2. **A single-needle start may feel weak or slow.** In the lab, the casual proxy took 30–36 s to kill 54 minis, and the autopilot stalled in 3 of 8 runs.
   - Mitigations: the grid advance, the `until` caps, and the proxies aiming.
   - If 1-1 still drags, raise L1 to **7 volleys/s**, never back to 3 needles.
3. **Run length.** The weaker start lengthened lab runs from 18.2 to 24.8 min. Shorten card TTK first (§3.5 item 8); never pad difficulty with HP.
4. **The 1-2 novice wall** may survive the BIG SNEEZER retune. The new sector-1 Easy offer is the safety net.
5. **Harder Normal may turn away newcomers.** The EASY START banner on first visit and the loss-screen offers stay. Easy was measured at 16/16 clears for the first-timer proxy.
6. **Clamped early picks** (TWIN BARREL or CLONAL at L1 hit the ×1.5 limit) can feel like a nerf. Show the clamp on the POTENCY readout and in the cartridge caption.
7. **3D draft on weak GPUs:** fill-rate on SwiftShader and on phones, and label legibility on glass at 320 px. The LITE fallback and the size tests cover part of it; a real phone must be checked (the release plan's D1–D7 matrix).
8. **Frame-time evidence on this machine** has failed only under load (26–55). D8 refuses to pass a loaded run, and someone must run it idle.
9. **Scope collision:** `cards.mjs` holds both the ladder and the card set. One writer at a time per the workspace rule. Branch from the v1.0 tag; don't touch the release chores.

### 9.2 What the owner must judge by playing

1. Does 1-1 feel **calm but not boring** with one needle at 6/s? Is the homage grid a pleasure or a chore?
2. Do the power steps land? The second needle in 1-2, antibodies after 2-2 and the fourth needle after 3-2: does each feel like a level-up?
3. Does **LUNGS bite**, do BLOODSTREAM and THE CELL feel like a fight, and is **OMICRON a worthy exam**?
4. On a first run of the new build, the owner should lose about 3 or more vials and likely spend a continue. Too much, too little, or right?
5. Does the **3D draft** read at a glance (name and stat in under a second), and does it feel like part of the game's world, not a menu?
6. Do the Medic and Dancer cards **change how they play**: diving in to INJECT, staying in the ring?
7. Is the run length acceptable (target: about 20 minutes of play)?

## Sources

**Fetched and read this round (2026-11-10):**

- Sparen, Danmaku Design Guide A4: Bullet Density: https://sparen.github.io/ph3tutorials/ddsga4.html
- Sparen, A2: Danmaku and the Player (mental filtering): https://sparen.github.io/ph3tutorials/ddsga2.html
- Sparen, Danmaku Design index: https://sparen.github.io/ph3tutorials/danmakudesign.html
- Shmups wiki, DoDonPachi (second loop conditions, Hibachi): https://shmups.wiki/library/DoDonPachi
- Shmups wiki, Touhou (no-continue good ending, spell cards): https://shmups.wiki/library/Unknwn/Touhou
- ZUN and Hiroyuki, Touhou Garakuta: https://en.touhougarakuta.com/article/specialtaidan_zun_hiroyuki_5-en/
- Maribel Hearn, Touhou getting started (Normal first, Easy without shame): https://maribelhearn.com/faq/start
- Slay the Spire wiki, Ascension (the 20 levels): https://slaythespire.wiki.gg/wiki/Ascension
- Game Developer, how Slay the Spire's developers use data (GDC 2019): https://www.gamedeveloper.com/design/how-i-slay-the-spire-i-s-devs-use-data-to-balance-their-roguelike-deck-builder
- RPG Site, Hades Pact of Punishment conditions and Heat: https://www.rpgsite.net/feature/10287-hades-pact-of-punishment-heat-modifiers-and-how-to-maximize-your-rewards
- Can I Play That, Supergiant on Hades God Mode: https://caniplaythat.com/2021/08/11/hades-god-mode-explained-by-supergiant-games
- Game Developer, Returnal GDC 2022 (Krueger): https://www.gamedeveloper.com/marketing/a-third-person-action-roguelike-bullet-hell-arcade-thriller-the-making-of-returnal
- GDC Vault, Brett Moody, *Flavors of Challenge* (GDC 2026): https://gdcvault.com/play/1035713/Flavors-of-Challenge-The-8
- GDC Vault, Matt MacLean, *Making Accessible Games with Indie Resources* (GDC 2024): https://gdcvault.com/play/1034569/Independent-Games-Summit-Making-Accessible

**From search summaries (treat details as approximate):**

- John Austin, *Challenging or Approachable? Pick Two* (GDC 2024 IGS): https://www.gdcvault.com/play/1034563/Independent-Games-Summit-Challenging-or
- Ikeda interviews, DoDonPachi SaiDaiOuJou (Arcadia, translated): https://shmups.system11.org/viewtopic.php?p=884904 (the fetch was refused; quoted via the search summary). Time Extension, the DonPachi series: https://www.timeextension.com/features/cave-story-the-history-of-donpachi-the-shmup-series-that-changed-everything
- Hades God Mode numbers (20%, +2% per death, cap 80%): https://www.dexerto.com/gaming/how-to-make-hades-2-easier-god-mode-explained-2695050/, https://inverse.com/gaming/hades-god-mode-interview
- Kasavin on the Pact of Punishment and Slay the Spire's Ascension: https://www.tomsguide.com/features/hades-exclusive-interview-supergiant
- Touhou power (starts at 1.00, max 4.00, a death costs one level; Subterranean Animism): https://shmups.wiki/library/Mountain_of_Faith, https://touhou.fandom.com/wiki/Mountain_of_Faith/Gameplay
- Jenova Chen, "Flow in games (and everything else)", Communications of the ACM 50(4), 2007: https://api.crossref.org/works/10.1145%2F1232743.1232769, https://www.jenovachen.com/flowingames/thesis.htm
- Multiple object tracking capacity (about 4; up to about 8 at slow speeds): https://en.wikipedia.org/wiki/Multiple_object_tracking
- Reaction-time samples (median simple RT 332 ms, IQR 295–373, in one PMC study; online tests report about 250–270 ms): https://pmc.ncbi.nlm.nih.gov/articles/PMC4416091/table/Tab2, https://ibmathsresources.com/2015/03/20/reaction-times-how-fast-are-you
- Dino Ignacio, *Crafting Destruction: The Evolution of the Dead Space User Interface* (GDC 2013): https://gdcvault.com/play/1017723/Crafting-Destruction-The-Evolution-of
- Inscryption's physical card table: https://www.gamedeveloper.com/design/how-game-jam-sacrifices-became-inscryption
- Battle Garegga rank (why no hidden rank): https://shmups.wiki/library/Battle_Garegga/Advanced_Rank

**Local evidence:**

- `core.mjs`: `fireInterval`, `sprayAngle`, `DIFFICULTY`.
- `cards.mjs`: `BASE`, `CAPS`, `focusCount` / `sprayCount` / `abCount`, `EXPECTED_POTENCY`, the 30 definitions.
- `levels.mjs`: `stageDps`, `stageHp`, `POWER_STEPS`, the 1-1 script.
- `bosses.mjs`: BIG SNEEZER, ALPHA, DELTA, OMICRON, `timeoutFor`, `cardHp`.
- `model.mjs`: `autoFire`, `optionOffsets`.
- `game.js`: the FORMULATE hold that hides the canvas.
- `formulate.mjs`: the DOM slides.
- `tests/reactive.mjs`, `tests/run-bots.mjs`, `tests/balance.mjs`, `tests/suite.test.mjs` (`HITS`, `KNOWN_GAPS`), `tests/curve.test.mjs`.
- `BALANCE.md` (the v1.0 suite audit and the adjuvant whole runs), `RESEARCH_V1.md` §2.3, `RESEARCH_CARDS.md` §2.8 and §5.
- The scratch lab (proxies, lever patches and the Chrome playtest script), run outside the repository on 2026-11-10. Its numbers are quoted in §1 and must be reproduced by D1 before any tuning.
