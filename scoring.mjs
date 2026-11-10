/** Scoring rules: the Dose Chain, graze, antigen tokens, R0 and extends.
 *
 * Dose Chain: each kill refreshes a 2.0 s window; tiers at 5/10/16/24/32 kills
 * give x2..x6. Taking damage breaks the chain; SOAP does not.
 * R0 = 3 x (escaped viruses / spawned escapable viruses). Only flights, worms
 * and divers can escape; the formation never does. R0 below 1 means the
 * outbreak shrinks, which the clear bonus rewards.
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

/** Score a kill through the chain. */
export function awardKill(s, base) {
  const mult = addChainKill(s);
  const points = base * mult;
  addScore(s, points);
  s.kills++;
  return { mult, points };
}

/** Every point goes through here so score extends (+1 vial at 250k and 750k)
 * are never missed. */
export function addScore(s, points) {
  const before = s.score;
  s.score += points;
  for (const at of RULES.extends)
    if (before < at && s.score >= at && !s.extendsGiven.includes(at)) {
      s.extendsGiven.push(at);
      s.health = s.lives = s.health + 1;
      pushEvent(s, 'extend', { at, health: s.health });
    }
}

export const r0 = (spawned, escaped) => (spawned > 0 ? (3 * escaped) / spawned : 0);
export const r0Of = (s) => r0(s.sector?.spawned ?? 0, s.sector?.escaped ?? 0);
/** Clear bonus for a sample: 1000 x world, plus (1 - min(R0, 1)) x 5000 x world. */
export const r0Bonus = (value, world) => Math.round((1 - Math.min(value, 1)) * 5000 * world);
