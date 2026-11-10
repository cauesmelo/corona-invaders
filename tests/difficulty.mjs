/** D1: the human-proxy difficulty harness (RESEARCH_DIFFICULTY.md §2, §8).
 *   npm run test:difficulty            (SEEDS=24, WORKERS=10, FORCED=1)
 * Whole Normal campaigns, drafts on, 3 credits, for the three proxies of
 * tests/humans.mjs with their own draft policies, plus Easy first-timer runs.
 * Prints the §2.2 sector table, the §2.3 stage table (vials lost per run
 * reaching the stage, all attempts), vials by source, run length, and each
 * target against its band; exits non-zero on a missed band. The proxies'
 * numbers are evidence of reachability and pressure, not of fun.
 *   FORCED=0 skips the F1 replay of every hit (faster while tuning).
 *   ONLY=casual,expert limits the proxies; EASY=0 skips the Easy runs.
 *   TWEAK='{"attention":16}' overrides profile fields (experiments only).
 *   DIFF=hard plays Hard instead of Normal (reported, never banded).
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { playHumanRun, PROFILES } from './humans.mjs';
import { LEVELS, WORLDS } from '../model.mjs';

/** §2.2 (Normal). [lo, hi]; null = not banded. */
export const SECTOR_BANDS = Object.freeze({
  firstTimer: { vials: [[1.5, 4.0], [2.0, 5.0], null, null], cleared: [[0.7, 1], [0.3, 0.6], [0.1, 0.35], null], full: [0.05, 0.2], continues: [2.5, 3.0], oneCredit: [0, 0.02], clean: [0, 0] },
  casual: { vials: [[0.2, 1.0], [1.6, 3.2], [2.5, 4.4], [3.4, 5.7]], cleared: [[0.98, 1], [0.9, 1], [0.75, 0.92], null], full: [0.55, 0.75], continues: [1.0, 2.0], oneCredit: [0.1, 0.25], clean: [0, 0.01] },
  expert: { vials: [[0, 0.3], [0.5, 1.3], [0.9, 2.0], [1.3, 2.7]], cleared: [[1, 1], [0.98, 1], [0.95, 1], null], full: [0.9, 1], continues: [0.2, 0.7], oneCredit: [0.45, 0.7], clean: [0, 0.08] },
});
/** §2.3 stage bands: vials lost per run reaching the stage, all attempts. */
export const STAGE_BANDS = Object.freeze({
  casual: [[0, 0.2], [0.1, 0.4], [0.2, 0.6], [0.3, 0.7], [0.5, 1.0], [0.8, 1.5], [0.6, 1.1], [0.8, 1.4], [1.1, 1.9], [0.9, 1.5], [1.1, 1.8], [1.4, 2.4]],
  expert: [[0, 0], [0, 0.1], [0, 0.2], [0.1, 0.3], [0.15, 0.4], [0.25, 0.6], [0.2, 0.5], [0.3, 0.6], [0.4, 0.9], [0.35, 0.7], [0.4, 0.8], [0.6, 1.2]],
});
export const RUN_MINUTES = Object.freeze([16, 20]); // casual play time
export const EASY_FULL = 0.85; // Easy first-timer full clear (<= 3 continues)

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sectorOf = (stage) => LEVELS[stage - 1].world;

/** Aggregate one proxy's runs into the §2.2 / §2.3 measures. */
export function summarize(runs) {
  const n = runs.length;
  const stage = LEVELS.map((l, i) => {
    const reach = runs.map((r) => r.stages.find((st) => st.stage === i + 1)).filter(Boolean);
    return {
      code: l.code,
      reached: reach.length,
      vials: mean(reach.map((st) => st.vialsLost)),
      hits: mean(reach.map((st) => st.coreHits / Math.max(1, st.attempts))),
      attempts: mean(reach.map((st) => st.attempts)),
      time: mean(reach.filter((st) => st.cleared).map((st) => st.time)),
      forced: reach.reduce((a, st) => a + st.forced, 0),
      forcedAt: reach.flatMap((st) => st.forcedAt || []),
      cards: reach.reduce((acc, st) => {
        for (const [k, c] of Object.entries(st.cards || {})) {
          const a = (acc[k] ||= { n: 0, cleared: 0, timeSum: 0, frac: 0, dealt: 0, ttk: c.ttk });
          a.dealt += c.dealt || 0;
          a.n += c.n;
          a.cleared += c.cleared;
          a.timeSum += c.timeSum;
          a.frac += c.frac;
        }
        return acc;
      }, {}),
      sources: reach.reduce((acc, st) => {
        for (const [k, v] of Object.entries(st.sources)) acc[k] = (acc[k] || 0) + v;
        return acc;
      }, {}),
    };
  });
  const sector = WORLDS.map((w) => {
    const ids = LEVELS.filter((l) => l.world === w.id).map((l) => l.id);
    const reach = runs.filter((r) => r.stages.some((st) => st.stage === ids[0]));
    const cleared = runs.filter((r) => r.stages.some((st) => st.stage === ids.at(-1) && st.cleared)).length;
    return { name: w.name, reached: reach.length, cleared: cleared / Math.max(1, n), vials: mean(reach.map((r) => r.stages.filter((st) => ids.includes(st.stage)).reduce((a, st) => a + st.vialsLost, 0))) };
  });
  return {
    n,
    stage,
    sector,
    full: runs.filter((r) => r.won).length / n,
    oneCredit: runs.filter((r) => r.oneCredit).length / n,
    continues: mean(runs.map((r) => r.continues)),
    clean: runs.filter((r) => r.won && r.vialsLost === 0).length / n,
    minutes: mean(runs.filter((r) => r.won).map((r) => r.minutes)),
    minutesAll: mean(runs.map((r) => r.minutes)),
    forced: stage.reduce((a, st) => a + st.forced, 0),
  };
}

/** Every target against its band: [{ proxy, what, value, band, ok }]. */
export function judge(summaries) {
  const out = [];
  const band = (proxy, what, value, b) => b && out.push({ proxy, what, value, band: b, ok: value >= b[0] - 1e-9 && value <= b[1] + 1e-9 });
  for (const [proxy, B] of Object.entries(SECTOR_BANDS)) {
    const S = summaries[proxy];
    if (!S) continue;
    S.sector.forEach((sec, i) => {
      band(proxy, `S${i + 1} vials`, sec.vials, sec.reached >= 3 ? B.vials[i] : null);
      band(proxy, `S${i + 1} cleared`, sec.cleared, B.cleared[i]);
    });
    band(proxy, 'full clear', S.full, B.full);
    band(proxy, 'continues', S.continues, B.continues);
    band(proxy, '1CC', S.oneCredit, B.oneCredit);
    band(proxy, 'no vial lost', S.clean, B.clean);
    out.push({ proxy, what: 'forced hits (F1)', value: S.forced, band: [0, 0], ok: S.forced === 0 });
    if (STAGE_BANDS[proxy]) S.stage.forEach((st, i) => band(proxy, `${st.code} vials`, st.vials, st.reached >= 3 ? STAGE_BANDS[proxy][i] : null));
    // Ordering rules on the means (§2.3): rising within each sector, bosses
    // rising, each opener between the previous sector's sample 2 and boss.
    if (STAGE_BANDS[proxy]) {
      const v = S.stage.map((st) => st.vials);
      const rising = WORLDS.every((w) => {
        const ids = LEVELS.filter((l) => l.world === w.id).map((l) => l.id - 1);
        return ids.every((id, k) => k === 0 || v[id] > v[ids[k - 1]]);
      });
      out.push({ proxy, what: 'rising within sectors', value: rising ? 1 : 0, band: [1, 1], ok: rising });
      const bosses = [2, 5, 8, 11].map((i) => v[i]);
      const bossOk = bosses.every((x, k) => k === 0 || x > bosses[k - 1]);
      out.push({ proxy, what: 'bosses rising', value: bossOk ? 1 : 0, band: [1, 1], ok: bossOk });
      const openers = [3, 6, 9].every((i) => v[i] > v[i - 2] && v[i] < v[i - 1]);
      out.push({ proxy, what: 'openers between', value: openers ? 1 : 0, band: [1, 1], ok: openers });
      const peak = v[11] >= Math.max(...v.slice(0, 11));
      out.push({ proxy, what: 'OMICRON the peak', value: peak ? 1 : 0, band: [1, 1], ok: peak });
    }
    if (proxy === 'firstTimer') {
      const v = S.sector.map((x) => x.vials);
      const ok = v[1] >= v[0] || S.sector[1].reached < 3;
      out.push({ proxy, what: 'S2 bites more than S1', value: ok ? 1 : 0, band: [1, 1], ok });
    }
  }
  if (summaries.casual) band('casual', 'play minutes (clears)', summaries.casual.minutes, RUN_MINUTES);
  if (summaries.easy) band('easy firstTimer', 'full clear <= 3 continues', summaries.easy.full3, [EASY_FULL, 1]);
  return out;
}

const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
export function report(summaries) {
  const lines = [];
  for (const [proxy, S] of Object.entries(summaries)) {
    if (proxy === 'easy') continue;
    lines.push(`${PROFILES[proxy]?.label ?? proxy} (${S.n} runs): full ${f(S.full * 100, 0)}% · 1CC ${f(S.oneCredit * 100, 0)}% · continues ${f(S.continues)} · clean ${f(S.clean * 100, 0)}% · play ${f(S.minutes, 1)} min (clears), ${f(S.minutesAll, 1)} all · forced ${S.forced}`);
    lines.push(`  sectors: ${S.sector.map((x) => `${x.name} cleared ${f(x.cleared * 100, 0)}% vials ${f(x.vials)} (n ${x.reached})`).join(' | ')}`);
    lines.push(`  stages:  ${S.stage.map((x) => `${x.code} ${f(x.vials)}`).join('  ')}`);
    lines.push(`  hits/attempt: ${S.stage.map((x) => `${x.code} ${f(x.hits)}`).join('  ')}`);
    lines.push(`  attempts: ${S.stage.map((x) => `${x.code} ${f(x.attempts)}`).join('  ')}`);
    lines.push(`  clear time (s): ${S.stage.map((x) => `${x.code} ${f(x.time, 0)}`).join('  ')}`);
    if (S.forced) lines.push(`  forced hits (F1) by stage: ${S.stage.filter((x) => x.forced).map((x) => `${x.code} ${x.forced} (${x.forcedAt.join(', ')})`).join('  ')}`);
    const src = S.stage.map((x) => `${x.code} ${Object.entries(x.sources).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(',')}`);
    if (process.env.CARDS === '1')
      for (const x of S.stage)
        for (const [k, c] of Object.entries(x.cards)) lines.push(`    card ${x.code} ${k.padEnd(16)} n ${c.n} cleared ${f((c.cleared / c.n) * 100, 0)}% time ${f(c.timeSum / c.n, 1)} s${c.ttk ? ` = ${f(c.frac / c.n)} TTK, dealt ${f((c.dealt / c.n) * 100, 0)}%` : ''}`);
    lines.push(`  vials by source: ${src.join('  ')}`);
  }
  if (summaries.easy) lines.push(`EASY first-timer (${summaries.easy.n} runs): full ${f(summaries.easy.full * 100, 0)}% · ≤3 continues ${f(summaries.easy.full3 * 100, 0)}% · continues ${f(summaries.easy.continues)} · hits/attempt from S2 ${f(summaries.easy.hitsS2)}`);
  return lines.join('\n');
}

if (!isMainThread) {
  for (const job of workerData.jobs) parentPort.postMessage({ job, run: playHumanRun(job) });
  parentPort.close();
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const SEEDS = Number(process.env.SEEDS || 24),
    WORKERS = Number(process.env.WORKERS || 10),
    forced = process.env.FORCED !== '0';
  const only = (process.env.ONLY || 'firstTimer,casual,expert').split(',');
  const seeds = Array.from({ length: SEEDS }, (_, i) => 5000 + i * 101);
  // TWEAK='{"attention":16}' overrides profile fields for an experiment (the
  // numbers are then not the bands').
  const tweak = process.env.TWEAK ? JSON.parse(process.env.TWEAK) : null;
  const difficulty = process.env.DIFF || 'normal'; // DIFF=hard measures Hard (the bands are Normal's)
  const jobs = only.flatMap((proxy) => seeds.map((seed) => ({ proxy, seed, forced, tweak, difficulty })));
  if (process.env.EASY !== '0') jobs.push(...seeds.slice(0, Math.min(SEEDS, 16)).map((seed) => ({ proxy: 'firstTimer', seed, difficulty: 'easy', forced: false, maxContinues: 12, tag: 'easy' })));
  const t0 = Date.now();
  const results = [];
  await Promise.all(
    Array.from({ length: WORKERS }, (_, w) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: jobs.filter((_, i) => i % WORKERS === w) } });
        worker.on('message', (m) => results.push(m));
        worker.on('error', reject);
        worker.on('exit', resolve);
      }),
    ),
  );
  const summaries = {};
  for (const proxy of only) summaries[proxy] = summarize(results.filter((m) => m.job.proxy === proxy && !m.job.tag).map((m) => m.run));
  const easy = results.filter((m) => m.job.tag === 'easy').map((m) => m.run);
  if (easy.length) {
    const S = summarize(easy);
    S.full3 = easy.filter((r) => r.won && r.continues <= 3).length / easy.length;
    S.hitsS2 = Math.min(...S.stage.slice(3).map((st) => st.hits));
    summaries.easy = S;
  }
  console.log(report(summaries));
  const verdicts = judge(summaries);
  for (const v of verdicts) console.log(`${v.ok ? 'PASS' : 'MISS'} ${v.proxy.padEnd(16)} ${v.what.padEnd(24)} ${f(v.value)} in [${v.band.map((x) => f(x)).join(', ')}]`);
  const miss = verdicts.filter((v) => !v.ok).length;
  console.log(`${verdicts.length - miss}/${verdicts.length} targets in band · ${((Date.now() - t0) / 1000).toFixed(0)} s · ${SEEDS} seeds · forced replay ${forced ? 'on' : 'off'}`);
  process.exitCode = miss ? 1 : 0;
}
