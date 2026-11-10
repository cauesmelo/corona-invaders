/** Whole-run bots for the adjuvant draft (RESEARCH_CARDS §5.6): a player
 * (the strong autopilot or the 150 ms reactive human) paired with a drafting
 * policy (random, offense, defense, rarest, placebo, or { favour: id }).
 * Both only send ordinary inputs and call the same draft actions the
 * FORMULATE screen calls; nothing edits state.
 *
 * Credits follow RESEARCH_V1 §2.1: a lost run spends a credit and restarts the
 * stage from its entry snapshot (build included); with `credits` spent, the
 * next loss ends the run. 1CC = cleared without spending one.
 */
import { createState, newRun, update, restartGame, pickAdjuvant, discardAdjuvants, getLevel, STAGE_COUNT, entryPower } from '../model.mjs';
import { choose, CARD } from '../cards.mjs';
import { chooseInput } from '../autopilot.mjs';
import { createReactive } from './reactive.mjs';

export const LEGENDARY = Object.freeze(Object.values(CARD).filter((c) => c.tier === 'legendary').map((c) => c.id));

export function playRun({ seed = 42, player = 'autopilot', policy = 'random', difficulty = 'normal', credits = 3, frameBudget = 60 * 60 * 40, bombs = true, drafts = true } = {}) {
  // drafts: false is the authored game (no adjuvants, no expected-potency HP).
  const s = createState({ seed, difficulty, drafts });
  newRun(s, seed);
  const reactive = player === 'reactive' ? createReactive({ bombs }) : null;
  const input = (frame) => (reactive ? reactive(s, frame) : chooseInput(s, frame));
  const bot = { rng: (seed * 2654435761) >>> 0 || 1 };
  const stages = {};
  let spent = 0,
    frame = 0,
    stageStart = 0,
    coreHits = 0,
    playFrames = 0;
  // How each core hit ended: a lost vial, or saved by a coating charge, the
  // EPIPEN or Easy's auto-SOAP (BALANCE.md "Adjuvants": the no-SOAP misses
  // come from these saves, not from kill speed).
  const outcome = { deaths: 0, absorbs: 0, epipens: 0, autoBombs: 0 };
  const entry = (st) => (stages[st] ||= { stage: st, kind: getLevel(st).kind, attempts: 0, time: 0, vialsLost: 0, absorbs: 0, potency: 0 });
  entry(1).attempts = 1;
  entry(1).potency = s.kit.potency;
  for (; frame < frameBudget; frame++) {
    if (s.phase === 'won') break;
    if (s.phase === 'lost') {
      entry(s.wave).vialsLost += s.sector.vialsLost;
      if (spent >= credits) break;
      spent++;
      restartGame(s);
      entry(s.wave).attempts++;
      stageStart = frame;
      continue;
    }
    if (s.phase === 'draft' && s.run) {
      const offer = s.run.offer;
      const ctx = { power: entryPower(s.wave + 1), difficulty: s.difficulty, stage: s.wave + 1 };
      const i = choose(s.run, offer, policy, ctx, bot);
      if (i < 0) discardAdjuvants(s);
      else pickAdjuvant(s, i);
      const st = entry(s.wave);
      st.attempts++;
      st.potency = s.kit.potency;
      stageStart = frame;
      continue;
    }
    const before = s.wave;
    update(s, 1 / 60, input(frame));
    if (s.phase === 'playing') playFrames++;
    for (const ev of s.events) {
      if (ev.type === 'hit-core' || ev.type === 'absorb' || ev.type === 'auto-bomb' || ev.type === 'epipen') coreHits++;
      if (ev.type === 'damage') outcome.deaths++;
      else if (ev.type === 'absorb') outcome.absorbs++;
      else if (ev.type === 'epipen') outcome.epipens++;
      else if (ev.type === 'auto-bomb') outcome.autoBombs++;
      if (ev.type === 'wave') {
        const st = entry(ev.stage);
        st.time = ev.time;
        st.vialsLost += ev.vialsLost;
        st.medal = ev.medal;
        st.cards = ev.cards;
        st.boss = getLevel(ev.stage).boss || null;
      }
    }
    if (s.wave !== before) stageStart = frame;
  }
  void stageStart;
  const deck = s.run ? s.run.deck.map((d) => d.id) : [];
  return {
    seed,
    player,
    policy: !drafts ? 'reference' : typeof policy === 'string' ? policy : `favour:${policy.favour}`,
    won: s.phase === 'won',
    oneCredit: s.phase === 'won' && spent === 0,
    creditsSpent: spent,
    reached: s.wave,
    frames: frame,
    minutes: playFrames / 3600,
    coreHits,
    hitsPerMinute: coreHits / Math.max(1e-9, playFrames / 3600),
    deck,
    legendaries: deck.filter((id) => LEGENDARY.includes(id)).length,
    outcome,
    // The build's unfocused formation potency at the end (cards.mjs sprayDpsOf).
    sprayPotency: s.kit?.sprayPotency ?? 1,
    discards: s.run?.discards ?? 0,
    stages: Object.values(stages).sort((a, b) => a.stage - b.stage),
    stageCount: STAGE_COUNT,
  };
}
