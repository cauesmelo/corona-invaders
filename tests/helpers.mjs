/** Shared test fixtures. Fixtures only arrange a starting situation; every
 * outcome is then produced by the real update() rules. */
import { createState, selectStage, update, LEVELS, bossHome } from '../model.mjs';
import { createBoss, BOSSES } from '../bosses.mjs';
import { spawnGroup } from '../enemies.mjs';
import { chooseInput } from './controller.mjs';

/** A sample started from the tray (all stages unlocked). */
export function running(seed = 42, stage = 1, difficulty = 'normal') {
  const s = createState({ seed, stage, difficulty });
  s.unlockedStage = LEVELS.length;
  selectStage(s, stage);
  return s;
}
/** A quiet board: the stage script, choir, dives and mutation clocks are
 * stopped and nothing is on it, so one behaviour can be observed alone. */
export function quiet(stage = 1, { seed = 42, difficulty = 'normal' } = {}) {
  const s = running(seed, stage, difficulty);
  Object.assign(s, { enemies: [], groups: [], enemyShots: [], emitters: [], boss: null, choirClock: 1e9, diveClock: 1e9, mutationClock: 1e9 });
  s.sector.step = 1e9;
  s.sector.hold = true;
  s.ship.invulnerable = 0;
  return s;
}
export function group(s, rows, opts = {}) {
  spawnGroup(s, { rows, spacing: 2.6, rowGap: 1.9, z: -8, sway: 0, descent: 0, ...opts }, s.groups.length, { enter: false });
  return s.enemies.filter((e) => e.alive);
}
/** Stage that hosts each boss type (bosses and midbosses). */
export const HOME = Object.freeze(Object.fromEntries(Object.keys(BOSSES).map((type) => [type, bossHome(type)])));
/** One boss card alone in its arena (the MUTATION LAB rule: it ends when the
 * card ends). Many vials, so a whole card can be measured. */
export function cardArena(type, card = 0, { seed = 7, x = 0, difficulty = 'normal', health = 99 } = {}) {
  const s = quiet(HOME[type], { seed, difficulty });
  const level = LEVELS[HOME[type] - 1];
  const b = createBoss(s, type, { startCard: card, world: level.world });
  b.practiceCard = card;
  s.sector.hold = false;
  s.health = s.lives = health;
  s.ship.x = x;
  return s;
}
/** Run until the boss reaches the fight state of its first card. */
export function toFight(s, input = {}) {
  for (let i = 0; i < 600 && s.boss.state !== 'fight'; i++) update(s, 1 / 60, input);
  return s;
}
export const cardsOf = (type) => BOSSES[type].cards;
/** A still circle bullet (r 0.15) for placing at exact distances. */
export const bullet = (x, z, extra = {}) => ({ id: 9000 + Math.floor(Math.random() * 1e6), x, z, vx: 0, vz: 0, family: 'aerosol', hit: 0.15, half: 0, vis: 0.15, src: 'TEST', age: 0, ...extra });

/** Root-suite frame budget for one controller campaign (30 min of play). */
export const FRAME_BUDGET = 60 * 1800;
/** Full controller campaign, instrumented. Cached per seed. */
const cache = new Map();
export function campaign(seed = 42, { observe } = {}) {
  if (!observe && cache.has(seed)) return cache.get(seed);
  const s = running(seed, 1);
  s.ship.power = 1;
  const cleared = [];
  let frame = 0;
  const inputs = new Set();
  for (; frame < FRAME_BUDGET && !['won', 'lost'].includes(s.phase); frame++) {
    const input = chooseInput(s, frame);
    for (const k of Object.keys(input)) inputs.add(k);
    update(s, 1 / 60, input);
    observe?.(s, frame);
    for (const ev of s.events) if (ev.type === 'wave') cleared.push(ev);
  }
  const out = { s, cleared, frame, inputs: [...inputs] };
  if (!observe) cache.set(seed, out);
  return out;
}
