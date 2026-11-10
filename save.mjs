/** Guarded, versioned saves (V1_RELEASE_PLAN.md S4). Pure: every function
 * takes a Storage-like object ({ getItem, setItem, removeItem }) so tests can
 * pass a fake or a throwing one; game.js passes window.localStorage.
 *
 * Rules:
 *   - every access is in try/catch: blocked or throwing storage never stops
 *     play (progress then lives for the session only);
 *   - keys are game-prefixed and versioned (the itch CDN origin is shared by
 *     many games): `corona-invaders-v6-*`;
 *   - every value is sanitised on load (wrong types, out-of-range stages and
 *     unknown medals fall back to defaults instead of failing);
 *   - older schemas migrate once, then `-v6-migrated` records it:
 *       v5 (the 18-stage campaign): stage-indexed unlocks and medals are
 *          mapped through V5_TO_V6 (cut stages map to nothing), card records
 *          keep their keys when the boss card still exists, the rest copies;
 *       v4 (revision four's 13-stage campaign, another level set): only
 *          sound, difficulty, effects and scores carry over.
 *   The ADJUVANT draft's run save (`-v6-run`) is owned by the card squad.
 */
import { STAGE_COUNT } from './levels.mjs';
import { BOSSES as BOSS_DEFS } from './bosses.mjs';

export const PREFIX = 'corona-invaders-v6-';
export const KEYS = Object.freeze({
  unlocked: `${PREFIX}unlocked`,
  medals: `${PREFIX}medals`,
  scores: `${PREFIX}scores`,
  effects: `${PREFIX}effects`,
  seen: `${PREFIX}seen`,
  cards: `${PREFIX}cards`,
  practice: `${PREFIX}practice`,
  sound: `${PREFIX}sound`,
  difficulty: `${PREFIX}difficulty`,
  speed: `${PREFIX}speed`,
  migrated: `${PREFIX}migrated`,
  // The run in progress (build, credits, RNG, the open offer): written by the
  // ADJUVANT draft's model.exportRun.
  run: `${PREFIX}run`,
});
const OLD = (v, name) => `corona-invaders-${v}-${name}`;
const NAMES = ['unlocked', 'medals', 'scores', 'effects', 'seen', 'cards', 'practice', 'sound', 'difficulty'];

/** The 18-stage campaign's stage index -> the v1.0 stage id (null: cut).
 * 1-1 -> 1-1, 1-2 -> 1-2, 1-4 ALPHA -> 1-3, 2-1 GAS EXCHANGE -> 2-2,
 * 2-2 AEROSOL and 2-3 DEEP BREATH -> 2-1, 2-4 -> 2-3, 3-1 -> 3-1,
 * 3-4 DELTA -> 3-3, 4-1 AGAR -> 4-2, 4-2 MUTATION -> 4-1, 4-4 -> 4-3. */
export const V5_TO_V6 = Object.freeze({ 1: 1, 2: 2, 3: null, 4: 3, 5: null, 6: 5, 7: 4, 8: 4, 9: 6, 10: 7, 11: null, 12: null, 13: 9, 14: null, 15: 11, 16: 10, 17: null, 18: 12 });
const MEDALS = ['bronze', 'silver', 'gold'];
const RANK = { bronze: 1, silver: 2, gold: 3 };

function read(storage, key) {
  try {
    const raw = storage?.getItem(key);
    return raw === null || raw === undefined ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}
export function write(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const clampStage = (n) => Math.max(1, Math.min(STAGE_COUNT, Math.floor(Number(n)) || 1));
function cleanMedal(m) {
  if (!m || typeof m !== 'object' || !MEDALS.includes(m.medal)) return null;
  return { medal: m.medal, assisted: !!m.assisted, best: Math.max(0, Number(m.best) || 0), r0: Number.isFinite(Number(m.r0)) ? Number(m.r0) : 9 };
}
function cleanMedals(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    const id = Number(k),
      m = cleanMedal(v);
    if (Number.isInteger(id) && id >= 1 && id <= STAGE_COUNT && m) out[id] = m;
  }
  return out;
}
const cleanScores = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((e) => e && Number.isFinite(Number(e.score)) && Number(e.score) > 0)
    .map((e) => ({ score: Math.floor(Number(e.score)), code: typeof e.code === 'string' ? e.code.slice(0, 4) : '', run: e.run, session: e.session }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
const cleanMap = (obj) => (obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {});
const better = (a, b) => (!a ? b : !b ? a : RANK[b.medal] > RANK[a.medal] ? b : a);

/** Map a v5 save onto v1.0 stage ids. */
export function migrateV5(old) {
  const unlockedOld = Math.max(1, Math.min(18, Math.floor(Number(old.unlocked)) || 1));
  let unlocked = 1;
  for (let i = 1; i <= unlockedOld; i++) if (V5_TO_V6[i]) unlocked = Math.max(unlocked, V5_TO_V6[i]);
  const medals = {};
  for (const [k, v] of Object.entries(cleanMap(old.medals))) {
    const id = V5_TO_V6[Number(k)],
      m = cleanMedal(v);
    if (id && m) medals[id] = better(medals[id], m);
  }
  // Card records `${boss}:${index}` survive when that card still exists.
  const cards = {};
  for (const [k, v] of Object.entries(cleanMap(old.cards))) {
    const [type, index] = k.split(':');
    if (BOSS_DEFS[type]?.cards[Number(index)]) cards[k] = v;
  }
  return { unlocked, medals, cards };
}

/** Load (and migrate once) every stored preference. Never throws. */
export function loadStore(storage, { reducedMotion = false } = {}) {
  const has = (k) => read(storage, k) !== undefined;
  const migrated = read(storage, KEYS.migrated);
  const fresh = !NAMES.some((n) => has(KEYS[n]));
  const from = [];
  if (fresh && !migrated) {
    const v5 = Object.fromEntries(NAMES.map((n) => [n, read(storage, OLD('v5', n))]));
    const v4 = Object.fromEntries(NAMES.map((n) => [n, read(storage, OLD('v4', n))]));
    const any = (o) => Object.values(o).some((x) => x !== undefined);
    if (any(v5)) {
      const m = migrateV5(v5);
      write(storage, KEYS.unlocked, m.unlocked);
      write(storage, KEYS.medals, m.medals);
      write(storage, KEYS.cards, m.cards);
      for (const n of ['scores', 'effects', 'sound', 'difficulty', 'seen']) if (v5[n] !== undefined) write(storage, KEYS[n], v5[n]);
      from.push('v5');
    }
    if (any(v4)) {
      for (const n of ['scores', 'effects', 'sound', 'difficulty']) if (v4[n] !== undefined && !has(KEYS[n])) write(storage, KEYS[n], v4[n]);
      from.push('v4');
    }
    if (from.length) write(storage, KEYS.migrated, { from, at: new Date().toISOString() });
  }
  const effects = read(storage, KEYS.effects);
  const speed = Number(read(storage, KEYS.speed));
  return {
    unlocked: clampStage(read(storage, KEYS.unlocked) ?? 1),
    medals: cleanMedals(read(storage, KEYS.medals)),
    scores: cleanScores(read(storage, KEYS.scores)),
    effects: effects === 'reduced' || (effects === undefined && reducedMotion) ? 'reduced' : 'full',
    seen: new Set((Array.isArray(read(storage, KEYS.seen)) ? read(storage, KEYS.seen) : []).filter((x) => typeof x === 'string')),
    cards: cleanMap(read(storage, KEYS.cards)),
    practice: cleanMap(read(storage, KEYS.practice)),
    sound: read(storage, KEYS.sound) !== false,
    difficulty: read(storage, KEYS.difficulty) === 'easy' ? 'easy' : 'normal',
    difficultyChosen: read(storage, KEYS.difficulty) !== undefined,
    speed: [1, 0.9, 0.8, 0.7].includes(speed) ? speed : 1,
    migratedFrom: from,
  };
}
