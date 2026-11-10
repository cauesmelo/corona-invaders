/** The run log (runlog.mjs): the owner's calibration kit. Its numbers must be
 * the model's own: it is checked against counters taken independently from the
 * event stream of real human-proxy campaigns. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, newRun, setDifficulty, update, restartGame, pickAdjuvant, discardAdjuvants, resampleAdjuvants, startPractice, finalReport, exportRun, resumeRun, entryPower, getLevel, STAGE_COUNT } from '../model.mjs';
import { runLogText, summarizeRunLog, newRunLog, reviveRunLog, stampOf, sourceOf } from '../runlog.mjs';
import { choose } from '../cards.mjs';
import { createHuman, PROFILES } from './humans.mjs';

/** A whole campaign for one proxy, with counters kept apart from the log: vials
 * from `damage` events per stage, continues from the restarts this loop made. */
function campaign({ proxy = 'firstTimer', seed = 5000, difficulty = 'normal', upTo = STAGE_COUNT, resample = false } = {}) {
  const s = createState({ seed, difficulty, drafts: true });
  newRun(s, seed);
  const profile = PROFILES[proxy];
  const bot = { rng: (seed * 40503 + 7) >>> 0 || 1 };
  const truth = { vials: {}, continues: 0, attempts: {} };
  let human = null,
    cur = 0,
    tries = 0;
  const fresh = () => {
    cur = s.wave;
    tries = (truth.attempts[cur] = (truth.attempts[cur] || 0) + 1);
    human = createHuman(profile, { seed: seed * 131 + s.wave * 17 + tries, retries: tries - 1 });
  };
  fresh();
  for (let frame = 0; frame < 60 * 60 * 40; frame++) {
    if (s.phase === 'won') break;
    if (s.phase === 'lost') {
      if (s.runOver) break;
      truth.continues++;
      restartGame(s);
      fresh();
      continue;
    }
    if (s.phase === 'draft' && s.run) {
      if (resample && s.run.tokens > 0 && !truth.resampled) {
        truth.resampled = true;
        resampleAdjuvants(s);
      }
      const i = choose(s.run, s.run.offer, profile.draft, { power: entryPower(s.wave + 1), difficulty: s.difficulty, stage: s.wave + 1 }, bot);
      if (i < 0) discardAdjuvants(s);
      else pickAdjuvant(s, i);
      if (s.wave > upTo) break;
      continue;
    }
    if (s.phase === 'playing' && s.wave !== cur) fresh();
    const wave = s.wave;
    update(s, 1 / 60, human(s, frame));
    for (const ev of s.events) if (ev.type === 'damage') truth.vials[wave] = (truth.vials[wave] || 0) + 1;
    if (s.events.some((ev) => ev.type === 'wave' && ev.stage >= upTo)) break;
  }
  return { s, truth };
}

test('the log equals the model: vials per stage, continues, hit sources and picks (a first-timer run to the end of its credits)', () => {
  const { s, truth } = campaign({ proxy: 'firstTimer', seed: 5101 });
  assert.ok(truth.continues >= 1, 'the proxy continued at least once, so the log crosses a restart');
  const sum = summarizeRunLog(s);
  for (const st of sum.stages) {
    assert.equal(st.vials, truth.vials[st.stage] || 0, `${st.code} vials lost`);
    assert.equal(st.attempts, truth.attempts[st.stage], `${st.code} attempts`);
    // Every vial lost names its source, and the named hits add up.
    assert.equal(st.hits.reduce((n, [, c]) => n + c, 0), st.vials, `${st.code} hit sources add up to the vials`);
  }
  assert.equal(s.creditsUsed, truth.continues, 'every continue spent one credit; the loss that ends the run spends none');
  assert.equal(sum.stages.reduce((n, st) => n + st.continues, 0), truth.continues);
  assert.equal(sum.vials, Object.values(truth.vials).reduce((a, b) => a + b, 0));
  // The vials of a stage are the model's own sector counters (the cleared attempt's).
  for (const [stage, r] of Object.entries(s.medals)) {
    const st = sum.stages.find((x) => x.stage === Number(stage));
    assert.ok(st.vials >= r.vialsLost, `${r.code} the cleared attempt's ${r.vialsLost} vials are inside the stage total ${st.vials}`);
  }
  assert.equal(sum.picks.length, s.run.drafts, 'one pick or discard per draft');
  assert.deepEqual(sum.picks.map((p) => p.id).filter(Boolean), s.run.deck.map((d) => d.id));
});

test('runLogText: deterministic, ASCII, at most 30 lines, one line per stage reached, names what hit the player', () => {
  const { s } = campaign({ proxy: 'firstTimer', seed: 5101 });
  const a = runLogText(s, { build: 'v1.0' }),
    b = runLogText(s, { build: 'v1.0' });
  assert.equal(a, b);
  assert.match(a, /^[\x0a\x20-\x7e]+$/, 'ASCII only');
  const lines = a.split('\n');
  assert.ok(lines.length <= 30, `${lines.length} lines`);
  assert.match(lines[0], /^CORONA INVADERS v1\.0 \| NORMAL \| seed \d+ \| (RUN OVER at \d-\d|CONTAINED)/);
  const sum = summarizeRunLog(s);
  const stageLines = lines.filter((l) => /^\d-\d /.test(l));
  assert.equal(stageLines.length, sum.stages.length);
  for (const st of sum.stages) {
    const line = stageLines.find((l) => l.startsWith(st.code));
    assert.ok(line.includes(`lost ${st.vials}`), line);
    if (st.continues) assert.ok(line.includes(`${st.continues} continue`), line);
    if (st.vials) assert.ok(!line.endsWith('hit: -'), line);
  }
  assert.ok(lines.some((l) => l.startsWith('drafts:')));
  assert.ok(lines.some((l) => l.startsWith('worst:')));
});

test('a clean expert opening logs zero losses and the picks that followed', () => {
  const { s } = campaign({ proxy: 'expert', seed: 5000, upTo: 2 });
  const text = runLogText(s);
  assert.match(text, /\n1-1 FIRST CONTACT\s+lost 0\s+\d+s\s+hit: -/);
  assert.match(text, /drafts: 1-1 [A-Z ]+/);
  assert.ok(!/NOT CLEARED/.test(text.split('\n').filter((l) => /^1-1/.test(l))[0]));
});

test('a RESAMPLE rides with the pick it preceded, and a DISCARD is logged as one', () => {
  const { s } = campaign({ proxy: 'expert', seed: 5000, upTo: 3, resample: true });
  const picks = summarizeRunLog(s).picks;
  assert.ok(picks.some((p) => p.rs === 1), JSON.stringify(picks));
  const t = createState({ seed: 3, drafts: true });
  newRun(t, 3);
  t.phase = 'draft';
  t.draft = { stage: 1 };
  t.run.offer = null;
  assert.equal(discardAdjuvants(t), false, 'no offer, nothing logged');
  assert.equal(t.runLog.picks.length, 0);
});

test('the log survives continues and manual restarts, and a new run starts it fresh; practice is never logged', () => {
  const s = createState({ seed: 7, drafts: true });
  newRun(s, 7);
  update(s, 1);
  s.creditsUsed = 0;
  restartGame(s); // a manual restart mid-stage spends a credit
  restartGame(s);
  const stages = summarizeRunLog(s).stages;
  assert.equal(stages.length, 1);
  assert.equal(stages[0].attempts, 3);
  assert.equal(stages[0].continues, 2);
  assert.equal(s.runLog.attempts.filter((a) => a.outcome === 'restart').length, 2);
  newRun(s, 8);
  assert.equal(s.runLog.attempts.length, 1);
  assert.equal(s.runLog.attempts[0].outcome, 'open');
  assert.equal(s.runLog.picks.length, 0);
  s.unlockedStage = 12;
  assert.equal(startPractice(s, 1), true);
  assert.equal(s.runLog, null);
  assert.equal(runLogText(s).startsWith('CORONA INVADERS'), true, 'text of a practice state does not throw');
});

test('a mid-run save carries the log; a corrupt or foreign log is rejected without throwing', () => {
  const { s } = campaign({ proxy: 'firstTimer', seed: 5102, upTo: 3 });
  s.paused = false;
  let saved = exportRun(s);
  if (!saved) {
    // Out of credits: a lost state with no run to store.
    assert.equal(s.runOver, true);
    return;
  }
  const before = summarizeRunLog(s);
  const t = createState({ seed: 1, drafts: true });
  assert.equal(resumeRun(t, JSON.parse(JSON.stringify(saved))), true);
  const after = summarizeRunLog(t);
  assert.equal(after.vials, before.vials, 'the vials lost before the save are kept');
  assert.deepEqual(after.picks, before.picks);
  // The stage restarts from its entry: the resumed attempt is a new one.
  const stage = t.runLog.attempts.at(-1);
  assert.equal(stage.outcome, 'open');
  assert.equal(stage.vials, 0);
  for (const bad of [null, 'x', { v: 99 }, { v: 1, attempts: 'no', picks: [] }, { v: 1, attempts: [{ stage: 99, hits: [{ src: 5 }] }], picks: [{ name: 1 }] }]) {
    const log = reviveRunLog(bad);
    assert.deepEqual(Object.keys(log).sort(), ['attempts', 'modes', 'picks', 'resamples', 'v']);
    assert.ok(log.attempts.length === 0 || log.attempts.every((a) => a.stage >= 1 && a.stage <= STAGE_COUNT));
  }
  saved = { ...saved, log: { v: 1, attempts: Array.from({ length: 500 }, () => ({ stage: 2, vials: 1e9, hits: Array(500).fill({ src: 'X'.repeat(500), at: 1 }) })), picks: Array(500).fill({ after: '1-1', name: 'Y'.repeat(500) }) } };
  const u = createState({ seed: 1, drafts: true });
  assert.equal(resumeRun(u, saved), true);
  assert.ok(u.runLog.attempts.length <= 61 && u.runLog.picks.length <= 24);
  assert.ok(u.runLog.attempts.every((a) => a.hits.length <= 24 && a.vials <= 99));
  assert.ok(runLogText(u).split('\n').length <= 30);
});

test('the report stamp: a plain 1CC only on Normal at full speed; Easy and Hard say what they are', () => {
  assert.equal(stampOf({ contained: true, oneCredit: true, difficulty: 'normal', assisted: false }), '1CC · ONE CREDIT CLEAR');
  assert.equal(stampOf({ contained: true, oneCredit: true, difficulty: 'normal', assisted: true }), '1CC · ASSISTED');
  assert.equal(stampOf({ contained: true, oneCredit: false, difficulty: 'normal', assisted: false }), null);
  assert.equal(stampOf({ contained: true, oneCredit: true, difficulty: 'easy', assisted: false }), 'EASY CLEAR');
  assert.equal(stampOf({ contained: true, oneCredit: false, difficulty: 'easy', assisted: false }), 'EASY CLEAR');
  assert.equal(stampOf({ contained: true, oneCredit: true, difficulty: 'hard', assisted: false }), '1CC · HARD');
  assert.equal(stampOf({ contained: true, oneCredit: false, difficulty: 'hard', assisted: false }), 'HARD CLEAR');
  assert.equal(stampOf({ contained: false, oneCredit: false, difficulty: 'hard', assisted: false }), null);
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const r = finalReport(createState({ seed: 3, difficulty }), true);
    assert.equal(r.stamp, stampOf({ contained: true, oneCredit: true, difficulty, assisted: false }));
  }
});

test('sourceOf names the boss card while a boss is up and the virus plus its verse otherwise', () => {
  const s = createState({ seed: 1 });
  assert.equal(sourceOf(s, { by: 'WILD TYPE', pattern: 'RAIN' }), 'WILD TYPE RAIN');
  assert.equal(sourceOf(s, { by: 'WILD TYPE', pattern: null }), 'WILD TYPE');
  assert.equal(sourceOf(s, { by: 'AEROSOL PUFF', pattern: 'AEROSOL PUFF' }), 'AEROSOL PUFF');
  s.boss = { state: 'card', card: 0, cards: [{ name: 'Δ CASCADE' }] };
  assert.equal(sourceOf(s, { by: 'DELTA', pattern: 'REPLICATION' }), 'D CASCADE', 'non-ASCII is mapped for the paste');
  assert.equal(newRunLog().attempts.length, 0);
  assert.equal(getLevel(1).code, '1-1');
});

test('a run that dipped into Easy cannot end with a Hard stamp', () => {
  const s = createState({ seed: 4, difficulty: 'easy', drafts: true });
  newRun(s, 4);
  setDifficulty(s, 'hard'); // the pause row, mid-run
  s.runLog.modes.push('hard');
  assert.equal(finalReport(s, true).stamp, 'EASY CLEAR');
  const h = createState({ seed: 4, difficulty: 'hard', drafts: true });
  assert.equal(finalReport(h, true).stamp, '1CC · HARD');
  assert.match(runLogText(s), /\| EASY>HARD \|/);
});
