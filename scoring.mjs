/** Dose Chain: one scoring rule. Each kill refreshes a 1.6 s window; tiers at
 * 5/10/16/24/32 kills give x2..x6 (capped, after Resogun/Luftrausers feedback
 * that very high caps feel arbitrary). Taking damage breaks the chain; using the
 * shield does not. Boss hits keep the window alive (0.6 s) but are not kills.
 */
import { RULES, pushEvent } from './core.mjs';

export function chainMultiplier(count) {
  let m = 1;
  for (const tier of RULES.chainTiers) if (count >= tier) m++;
  return m;
}

export function addChainKill(s) {
  const before = chainMultiplier(s.chain.count);
  s.chain.count++;
  s.chain.timer = RULES.chainWindow;
  const after = chainMultiplier(s.chain.count);
  s.chain.best = Math.max(s.chain.best, s.chain.count);
  if (s.sector) s.sector.chainBest = Math.max(s.sector.chainBest, after);
  if (after > before) pushEvent(s, 'chain-tier', { tier: after, count: s.chain.count });
  return after;
}

export function breakChain(s, reason) {
  if (s.chain.count >= RULES.chainTiers[0]) pushEvent(s, 'chain-break', { reason, count: s.chain.count });
  s.chain.count = 0;
  s.chain.timer = 0;
}

export function refreshChainFromBoss(s) {
  if (s.chain.count > 0) s.chain.timer = Math.max(s.chain.timer, RULES.bossChainRefresh);
}

export function tickChain(s, dt) {
  if (s.chain.count <= 0) return;
  s.chain.timer -= dt;
  if (s.chain.timer <= 0) breakChain(s, 'timeout');
}

/** Score a kill through the chain. Dive kills (a diver shot mid-dive or on its
 * way back) are worth double, rewarding a risky read of the drawn line. */
export function awardKill(s, base, { double = false } = {}) {
  const mult = addChainKill(s);
  const points = base * mult * (double ? 2 : 1);
  s.score += points;
  s.kills++;
  return { mult, points };
}
