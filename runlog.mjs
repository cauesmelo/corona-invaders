/** The run log: the owner's calibration kit. A pure record of what one run
 * cost, per stage and per attempt, so the owner can paste a short text into
 * chat and the designer can tune against a real person instead of a proxy
 * (RESEARCH_DIFFICULTY.md 2.1, "Calibration step").
 *
 * It only observes: the model calls these hooks at the moments a vial is lost,
 * a stage ends, a continue starts and a draft resolves; nothing here changes
 * a rule, reads the RNG or touches the DOM. The log lives in `s.runLog`, is
 * carried across continues like `creditsUsed`, is reset by a new run and is
 * stored with the run save (bounded and sanitised on load).
 *
 * Counters have one source each, so the text can never disagree with the
 * model: `vials` is counted where `s.sector.vialsLost` is, `saves` where a SOAP
 * deathbomb, EPIPEN, the coating or Easy's auto-SOAP kept a vial.
 */
import { diff } from './core.mjs';
import { LEVELS, STAGE_COUNT, getLevel } from './levels.mjs';
import { CARD } from './cards.mjs';

export const RUNLOG_VERSION = 1;
/** Bounds for a stored log (a corrupt or hand-edited save can never grow it). */
const MAX_ATTEMPTS = 60;
const MAX_HITS = 24;
const MAX_PICKS = 24;
const MAX_TEXT = 40;

const MODES = ['easy', 'normal', 'hard'];
/** `modes`: the difficulties the run was played on, in order (a loss screen can
 * switch Normal to Easy mid-run; the header must not claim one mode). */
export const newRunLog = () => ({ v: RUNLOG_VERSION, attempts: [], picks: [], resamples: 0, modes: [] });

const live = (s) => !!s.runLog && !s.practice;
const last = (s) => s.runLog.attempts.at(-1);

/** A new attempt at the stage the state is on (a stage entry or a continue). */
export function openAttempt(s) {
  if (!live(s)) return;
  const stage = s.wave;
  const modes = s.runLog.modes;
  if (modes.at(-1) !== s.difficulty) modes.push(s.difficulty);
  const n = s.runLog.attempts.filter((a) => a.stage === stage).length;
  s.runLog.attempts.push({ stage, code: getLevel(stage).code, n, outcome: 'open', vials: 0, saves: 0, time: 0, hits: [] });
  if (s.runLog.attempts.length > MAX_ATTEMPTS) s.runLog.attempts.shift();
}
/** The attempt ends: 'cleared', 'lost' (out of vials) or 'restart' (a manual
 * restart mid-stage). Its time is the stage clock when it stopped. */
export function closeAttempt(s, outcome) {
  if (!live(s)) return;
  const a = last(s);
  if (!a || a.outcome !== 'open') return;
  a.outcome = outcome;
  a.time = Math.round(s.waveElapsed * 10) / 10;
}
const ascii = (text) =>
  String(text ?? '')
    .replace(/Δ/g, 'D')
    .replace(/[·•]/g, '-')
    .replace(/→/g, '>')
    .replace(/∞/g, 'inf')
    .replace(/[^\x20-\x7e]/g, '')
    .slice(0, MAX_TEXT);

/** What hit the player, as a person would name it: the boss's card while a
 * boss is up, otherwise the virus and what it was singing (WILD TYPE RAIN). */
export function sourceOf(s, cause) {
  const b = s.boss;
  if (b && b.state !== 'defeated') {
    const c = b.cards?.[b.card];
    if (c?.name) return ascii(c.name);
  }
  const by = cause?.by || 'VIRUS';
  const pattern = cause?.pattern;
  return ascii(pattern && pattern !== by ? `${by} ${pattern}` : by);
}
/** A vial was lost (called by die(), once per vial). */
export function logHit(s, cause) {
  if (!live(s)) return;
  const a = last(s);
  if (!a) return;
  a.vials++;
  if (a.hits.length < MAX_HITS) a.hits.push({ src: sourceOf(s, cause), at: Math.round(s.waveElapsed * 10) / 10 });
}
/** A hit that cost no vial: read from the update's events so the model's
 * rescue paths need no hook of their own. */
export function logSaves(s) {
  if (!live(s) || !s.events.length) return;
  const a = last(s);
  if (!a) return;
  for (const ev of s.events) if (ev.type === 'epipen' || ev.type === 'absorb' || ev.type === 'auto-bomb' || (ev.type === 'bomb' && ev.rescued)) a.saves++;
}
/** The draft after the stage just cleared resolved. `card` is null for a
 * DISCARD. RESAMPLEs since the last resolution are attached to it. */
export function logDraft(s, card) {
  if (!live(s)) return;
  const log = s.runLog;
  log.picks.push({ after: getLevel(s.wave).code, id: card?.id ?? null, name: card ? ascii(CARD[card.id]?.name ?? card.id) : 'DISCARD', rs: log.resamples });
  if (log.picks.length > MAX_PICKS) log.picks.shift();
  log.resamples = 0;
}
export function logResample(s) {
  if (live(s)) s.runLog.resamples = Math.min(9, (s.runLog.resamples | 0) + 1);
}

// ---- Summary ---------------------------------------------------------------------
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
function rank(counts) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
/** The log as numbers: one record per stage reached (attempts folded), the
 * picks, the ranked hit sources and the run's totals. */
export function summarizeRunLog(s) {
  const log = s.runLog || newRunLog();
  const byStage = new Map();
  for (const a of log.attempts) {
    const st = byStage.get(a.stage) || { stage: a.stage, code: a.code, name: LEVELS[a.stage - 1]?.name ?? '', attempts: 0, cleared: false, vials: 0, saves: 0, time: 0, hits: new Map(), restarts: 0 };
    st.attempts++;
    st.cleared ||= a.outcome === 'cleared';
    st.vials += a.vials;
    st.saves += a.saves;
    st.time += a.time || (a.outcome === 'open' ? s.waveElapsed : 0);
    if (a.outcome === 'restart') st.restarts++;
    for (const h of a.hits) st.hits.set(h.src, (st.hits.get(h.src) || 0) + 1);
    byStage.set(a.stage, st);
  }
  const stages = [...byStage.values()].map((st) => ({ ...st, continues: st.attempts - 1, hits: rank(st.hits), time: Math.round(st.time) }));
  const all = new Map();
  for (const st of stages) for (const [k, v] of st.hits) all.set(k, (all.get(k) || 0) + v);
  const open = log.attempts.at(-1);
  return {
    stages,
    picks: log.picks,
    sources: rank(all),
    vials: stages.reduce((n, st) => n + st.vials, 0),
    saves: stages.reduce((n, st) => n + st.saves, 0),
    time: stages.reduce((n, st) => n + st.time, 0),
    reached: open ? open.code : getLevel(s.wave).code,
  };
}

/** The stamp the FINAL REPORT prints (RESEARCH_DIFFICULTY 2.5, D10): a plain
 * 1CC only on Normal at 100% speed; a slowed run says ASSISTED; Easy never
 * stamps a 1CC. Null for a run that was not contained. */
export function stampOf({ contained, oneCredit, difficulty, assisted }) {
  if (!contained) return null;
  if (difficulty === 'easy') return 'EASY CLEAR';
  if (difficulty === 'hard') return oneCredit ? '1CC · HARD' : 'HARD CLEAR';
  if (oneCredit) return assisted ? '1CC · ASSISTED' : '1CC · ONE CREDIT CLEAR';
  return null;
}

const pad = (text, n) => String(text).padEnd(n);
const hitText = (hits, max = 3) => {
  if (!hits.length) return '-';
  const shown = hits.slice(0, max).map(([k, v]) => (v > 1 ? `${k} x${v}` : k));
  return shown.join(', ') + (hits.length > max ? `, +${hits.length - max}` : '');
};
/** Greedy word wrap on '; ' separated items so a long pick list stays inside
 * a chat message's width. */
function wrap(prefix, items, width = 78) {
  const lines = [];
  let line = prefix;
  items.forEach((item, i) => {
    const piece = item + (i < items.length - 1 ? ';' : '');
    if (line.length + piece.length + 1 > width && line.trim() !== prefix.trim()) {
      lines.push(line);
      line = ' '.repeat(prefix.length);
    }
    line += (line.endsWith(' ') ? '' : ' ') + piece;
  });
  lines.push(line);
  return lines;
}

/** The short plain-text summary the owner pastes into chat: ASCII, at most 30
 * lines, deterministic. `build` is the version string the game shows. */
export function runLogText(s, { build = '' } = {}) {
  const sum = summarizeRunLog(s);
  const mode = (s.runLog?.modes?.length ? s.runLog.modes : [s.difficulty || 'normal']).join('>').toUpperCase();
  const won = s.phase === 'won' && !s.practice;
  const result = won ? 'CONTAINED' : s.runOver ? `RUN OVER at ${sum.reached}` : `IN PROGRESS at ${sum.reached}`;
  const cap = diff(s).credits;
  const credits = `${s.creditsUsed}/${cap === Infinity ? 'inf' : cap}`;
  const stamp = s.finalReport?.stamp ? ` | ${ascii(s.finalReport.stamp)}` : '';
  const out = [
    `CORONA INVADERS${build ? ' ' + ascii(build) : ''} | ${mode} | seed ${s.seed >>> 0} | ${result}${stamp}`,
    `score ${s.score | 0} | play ${clock(sum.time)} | credits used ${credits} | vials lost ${sum.vials} | hits saved ${sum.saves}`,
  ];
  for (const st of sum.stages) {
    const cont = st.continues ? `  ${st.continues} continue${st.continues > 1 ? 's' : ''}` : '';
    const open = st.cleared ? '' : '  NOT CLEARED';
    out.push(`${st.code} ${pad(st.name, 14)} lost ${st.vials}  ${st.time}s${cont}${open}  hit: ${hitText(st.hits)}`);
  }
  const worst = sum.sources.length ? [`worst: ${hitText(sum.sources, 5)}`] : [];
  // At most 30 lines: a long run drops its oldest draft lines first.
  const picks = sum.picks.length ? wrap('drafts:', sum.picks.map((p) => `${p.after} ${p.name}${p.rs ? ` (rs${p.rs})` : ''}`)) : [];
  out.push(...picks.slice(Math.max(0, picks.length - Math.max(0, 30 - out.length - worst.length))), ...worst);
  return out.join('\n');
}

// ---- Persistence ------------------------------------------------------------------
export const exportRunLog = (s) => (live(s) ? structuredClone(s.runLog) : null);
/** A stored log, rebuilt field by field. Anything malformed becomes an empty
 * log; it never throws and never exceeds the bounds above. */
export function reviveRunLog(raw) {
  const out = newRunLog();
  try {
    if (!raw || raw.v !== RUNLOG_VERSION || !Array.isArray(raw.attempts) || !Array.isArray(raw.picks)) return out;
    const num = (x, hi) => (Number.isFinite(x) ? Math.max(0, Math.min(hi, x)) : 0);
    for (const a of raw.attempts.slice(-MAX_ATTEMPTS)) {
      const stage = a?.stage;
      if (!Number.isInteger(stage) || stage < 1 || stage > STAGE_COUNT) continue;
      const hits = (Array.isArray(a.hits) ? a.hits : []).slice(0, MAX_HITS).filter((h) => h && typeof h.src === 'string').map((h) => ({ src: ascii(h.src), at: num(h.at, 9999) }));
      out.attempts.push({ stage, code: getLevel(stage).code, n: num(a.n, 99) | 0, outcome: ['open', 'cleared', 'lost', 'restart'].includes(a.outcome) ? a.outcome : 'lost', vials: num(a.vials, 99) | 0, saves: num(a.saves, 999) | 0, time: num(a.time, 9999), hits });
    }
    for (const p of raw.picks.slice(-MAX_PICKS)) {
      if (!p || typeof p.name !== 'string' || typeof p.after !== 'string') continue;
      out.picks.push({ after: ascii(p.after).slice(0, 4), id: typeof p.id === 'string' ? p.id.slice(0, 40) : null, name: ascii(p.name), rs: num(p.rs, 9) | 0 });
    }
    out.resamples = num(raw.resamples, 9) | 0;
    out.modes = (Array.isArray(raw.modes) ? raw.modes : []).filter((m) => MODES.includes(m)).slice(-4);
  } catch {
    return newRunLog();
  }
  return out;
}
