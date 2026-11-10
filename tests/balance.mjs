/** Test 12 of RESEARCH_CARDS.md (§5.6): whole runs of the 12-stage campaign
 * with credits, a drafting bot paired with a player, on the real model.
 *   npm run test:balance            (SEEDS=30 by default, WORKERS=6)
 * The suite is slower than `npm test`'s 30 s budget, so it is separate; its
 * results are recorded in BALANCE.md "Adjuvants". It exits non-zero on a
 * missed target. Targets 6 and 7 (the ladders and FAIR-150 with random decks
 * and at the speed extremes) are not part of this script. */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { playRun, LEGENDARY } from './run-bots.mjs';
import { BOSSES } from '../bosses.mjs';

if (!isMainThread) {
  for (const job of workerData.jobs) parentPort.postMessage(playRun(job));
  parentPort.close();
} else {
  const SEEDS = Number(process.env.SEEDS || 30),
    WORKERS = Number(process.env.WORKERS || 6);
  // NOSOAP=1: the reactive player never bombs. With SOAP it deathbombs so
  // well that every pair 1CCs and sector-4 vial losses are ~0, which makes
  // targets 2b and 4a uninformative; without it the comparisons have signal.
  const bombs = process.env.NOSOAP !== '1';
  const seeds = Array.from({ length: SEEDS }, (_, i) => 1000 + i * 37);
  const combos = [
    { player: 'autopilot', policy: 'random' },
    { player: 'reactive', policy: 'random' },
    { player: 'reactive', policy: 'offense' },
    { player: 'reactive', policy: 'defense' },
    { player: 'reactive', policy: 'placebo' },
    { player: 'reactive', policy: 'random', drafts: false },
  ];
  const jobs = combos.flatMap((c) => seeds.map((seed) => ({ ...c, seed, bombs })));
  const t0 = Date.now();
  const results = [];
  await Promise.all(
    Array.from({ length: WORKERS }, (_, w) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: jobs.filter((_, i) => i % WORKERS === w) } });
        worker.on('message', (r) => results.push(r));
        worker.on('error', reject);
        worker.on('exit', resolve);
      }),
    ),
  );
  const key = (r) => `${r.player}×${r.policy}`;
  const groups = new Map();
  for (const r of results) groups.set(key(r), [...(groups.get(key(r)) || []), r]);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const stat = (rs) => {
    const bossTime = mean(rs.flatMap((r) => r.stages.filter((s) => s.kind === 'boss' && s.time > 0).map((s) => s.time)));
    const s4 = rs.flatMap((r) => r.stages.filter((s) => s.stage >= 10));
    const cardTimes = rs.flatMap((r) => r.stages.flatMap((s) => (s.cards || []).filter((c) => c.reason === 'cleared' && c.time > 0).map((c) => ({ c, boss: s.boss }))));
    // Card kill time / its authored TTK (cards with TTK only).
    const ttkFrac = cardTimes
      .map(({ c, boss }) => {
        const def = BOSSES[boss]?.cards.find((d) => d.name === c.name);
        return def?.ttk ? c.time / def.ttk : null;
      })
      .filter((x) => x !== null);
    return {
      runs: rs.length,
      oneCredit: rs.filter((r) => r.oneCredit).length,
      finished: rs.filter((r) => r.won).length,
      credits: mean(rs.map((r) => r.creditsSpent)),
      minutes: mean(rs.map((r) => r.minutes)),
      bossTime,
      vialsS4: mean(s4.map((s) => s.vialsLost)),
      hitsPerMin: mean(rs.map((r) => r.hitsPerMinute)),
      legendaries: [0, 1, 2].map((n) => rs.filter((r) => r.legendaries === n).length),
      minTtk: ttkFrac.length ? Math.min(...ttkFrac) : null,
      p05Ttk: ttkFrac.length ? [...ttkFrac].sort((a, b) => a - b)[Math.floor(ttkFrac.length * 0.05)] : null,
      potencyEnd: mean(rs.map((r) => r.stages.at(-1)?.potency ?? 1)),
    };
  };
  const S = Object.fromEntries([...groups].map(([k, rs]) => [k, stat(rs)]));
  console.log(`Test 12: ${results.length} runs (${SEEDS} seeds x ${combos.length}, reactive SOAP ${bombs ? 'on' : 'off'}) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log('pair'.padEnd(22), 'runs 1CC finish credits min  bossT  vialsS4 hits/min  legendary0/1/2 minTTK p5TTK potency@4-3');
  for (const [k, v] of Object.entries(S))
    console.log(k.padEnd(22), String(v.runs).padStart(4), String(v.oneCredit).padStart(3), String(v.finished).padStart(6), v.credits.toFixed(2).padStart(7), v.minutes.toFixed(1).padStart(5), v.bossTime.toFixed(1).padStart(6), v.vialsS4.toFixed(2).padStart(8), v.hitsPerMin.toFixed(2).padStart(8), v.legendaries.join('/').padStart(14), (v.minTtk ?? 0).toFixed(2).padStart(6), (v.p05Ttk ?? 0).toFixed(2).padStart(5), v.potencyEnd.toFixed(2).padStart(8));
  const A = S['autopilot×random'],
    R = S['reactive×random'],
    O = S['reactive×offense'],
    D = S['reactive×defense'],
    P = S['reactive×placebo'],
    REF = S['reactive×reference'];
  const n = SEEDS;
  const checks = [
    ['1 autopilot x random 1CC >= 96%', A.oneCredit >= 0.96 * n, `${A.oneCredit}/${n}`],
    ['2a reactive x random finishes within 3 credits >= 90%', R.finished >= 0.9 * n, `${R.finished}/${n}`],
    ['2b reactive x random 1CC within 10 points of the reference syringe', Math.abs(R.oneCredit - REF.oneCredit) / n <= 0.1, `${R.oneCredit} vs ${REF.oneCredit} of ${n}`],
    ['3a reactive x offense 1CC >= random', O.oneCredit >= R.oneCredit, `${O.oneCredit} vs ${R.oneCredit}`],
    ['3b offense boss time 70-90% of random', O.bossTime / R.bossTime >= 0.7 && O.bossTime / R.bossTime <= 0.9, `${((O.bossTime / R.bossTime) * 100).toFixed(0)}%`],
    // With a ~0 baseline (< 0.05 vials per stage) the ratio says nothing:
    // it is reported, not judged (BALANCE.md).
    ['4a defense vials lost per sector-4 stage >= 25% of random', R.vialsS4 < 0.05 || D.vialsS4 >= 0.25 * R.vialsS4, `${D.vialsS4.toFixed(2)} vs ${R.vialsS4.toFixed(2)}${R.vialsS4 < 0.05 ? ' (baseline ~0: not judged)' : ''}`],
    ['4b defense core hits/min >= random', D.hitsPerMin >= R.hitsPerMin, `${D.hitsPerMin.toFixed(2)} vs ${R.hitsPerMin.toFixed(2)}`],
    ['5a placebo boss time >= 1.2x random', P.bossTime >= 1.2 * R.bossTime, `${(P.bossTime / R.bossTime).toFixed(2)}x`],
    ['5b placebo finishes within 3 credits >= 80%', P.finished >= 0.8 * n, `${P.finished}/${n}`],
    ['T6 no card under 40% of its TTK (greedy offense, measured)', (O.minTtk ?? 1) >= 0.4, (O.minTtk ?? 0).toFixed(2)],
  ];
  let miss = 0;
  for (const [name, ok, value] of checks) {
    console.log(`${ok ? 'PASS' : 'MISS'}  ${name}: ${value}`);
    if (!ok) miss++;
  }
  console.log('legendaries listed:', LEGENDARY.join(', '));
  process.exitCode = miss ? 1 : 0;
}
