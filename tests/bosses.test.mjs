/** Variant bosses: the card system, captures, timeouts, speed caps and each
 * boss gimmick. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, update, bossStatus, LEVELS, entryPower } from '../model.mjs';
import { BOSSES, damageBoss, cardHp, bossVulnerable, bossIntangible } from '../bosses.mjs';
import { bossPower } from '../levels.mjs';
import { cardArena, toFight, HOME, quiet, running } from './helpers.mjs';

const parts = (s, part) => s.enemies.filter((e) => e.alive && e.kind === 'boss' && (!part || e.part === part));
function hitUntil(s, predicate, part = () => parts(s).find((p) => bossVulnerable(s, p))) {
  for (let i = 0; i < 4000 && !predicate(); i++) {
    const p = part();
    if (!p) return;
    damageBoss(s, p, 12, 'shot');
  }
}

test('WHO Greek-letter variants only: ALPHA, BETA & GAMMA, DELTA, OMICRON PRIME and LAMBDA', () => {
  const GREEK = /^(ALPHA|BETA|GAMMA|DELTA|EPSILON|ZETA|ETA|THETA|IOTA|KAPPA|LAMBDA|MU|OMICRON)\b/;
  const names = Object.values(BOSSES).filter((b) => /^[A-Z]+ ?(& [A-Z]+|PRIME)?$/.test(b.name) && !b.mid).map((b) => b.name);
  assert.deepEqual(names, ['ALPHA', 'BETA & GAMMA', 'DELTA', 'OMICRON PRIME']);
  assert.ok(GREEK.test(BOSSES.lambda.name));
  assert.deepEqual(LEVELS.filter((l) => l.kind === 'boss').map((l) => [l.code, l.boss]), [['1-3', 'alpha'], ['2-3', 'betagamma'], ['3-3', 'delta'], ['4-3', 'omicron']]);
});

test('card HP = TTK x the median DPS at the boss (6 / 12 / 24 / 36 by mRNA level) x the sector uptime; S3-S4 TTK x0.85; x0.85 Easy; timeouts max(25, 1.6 / 1.4 x TTK)', () => {
  assert.deepEqual(RULES.powerDps, [6, 12, 24, 36]);
  for (const [type, def] of Object.entries(BOSSES)) {
    const s = cardArena(type, 0);
    const b = s.boss;
    const level = LEVELS[HOME[type] - 1];
    const w = level.world;
    const dps = RULES.powerDps[bossPower(HOME[type]) - 1];
    assert.equal(s.dpsRef, dps);
    def.cards.forEach((c, i) => {
      const ttk = Math.round(c.ttk * RULES.ttkScale[w - 1] * 10) / 10;
      assert.equal(b.cards[i].hp, c.type === 'survival' ? 0 : Math.round(ttk * dps * RULES.cardUptime[w - 1]), `${type} ${c.name}`);
      assert.equal(b.cards[i].timeout, c.type === 'survival' ? c.duration : Math.max(25, Math.round((w >= 3 ? 1.4 : 1.6) * ttk)), `${type} ${c.name} timeout`);
    });
    assert.equal(b.maxHp, b.cards.reduce((n, c) => n + c.hp, 0));
    const e = cardArena(type, 0, { difficulty: 'easy' });
    assert.equal(e.boss.cards[0].hp, Math.round(b.cards[0].ttk * dps * RULES.cardUptime[w - 1] * 0.85));
  }
  assert.deepEqual(BOSSES.alpha.cards.map((c) => c.ttk), [18, 22, 22, 18]);
  // BIG SNEEZER comes after the 1-2 VESICLE: it is priced at L2.
  assert.equal(bossPower(HOME.bigsneezer), 2);
});

test('every card can end by damage: its HP at 75% of the reference DPS fits in 80% of its timeout', () => {
  // Playtest: OMICRON SPIKE CROWN (35 s TTK vs a 30 s timeout) was unclearable
  // and most cards ended on the timer. 75% models aim and movement losses.
  for (const [type, def] of Object.entries(BOSSES)) {
    const s = cardArena(type, 0);
    for (const c of s.boss.cards) {
      if (c.type === 'survival') continue;
      const seconds = c.hp / (0.75 * s.dpsRef);
      assert.ok(seconds <= 0.8 * c.timeout, `${type} ${c.name}: ${seconds.toFixed(1)} s at realistic DPS vs ${c.timeout} s timeout`);
    }
  }
});

test('the VIRAL LOAD pool: notches per card, the displayed phase follows the pool', () => {
  const s = cardArena('alpha', 0);
  s.boss.practiceCard = null;
  let hud = bossStatus(s);
  // ALPHA (1-3) is priced at L2: 12 DPS x u 0.42.
  const card = (ttk) => Math.round(ttk * 12 * RULES.cardUptime[0]);
  const pool = card(18) + card(22) + card(22) + card(18);
  assert.equal(hud.hp, pool, 'ALPHA: (18 + 22 + 22 + 18) s x 12 x u');
  assert.equal(hud.phases, 4);
  assert.deepEqual(hud.notches.map((n) => +n.toFixed(4)), [pool - card(18), card(22) + card(18), card(18)].map((n) => +(n / pool).toFixed(4)));
  s.boss.hp = card(22) + card(18) - 10; // a QA fixture may set the pool directly
  hud = bossStatus(s);
  assert.equal(hud.phase, 3);
  assert.equal(hud.attack, 'COUGH COUGH', 'the live card is unchanged until the boss acts');
  toFight(s);
  update(s, 1 / 60);
  assert.equal(s.boss.card, 1, 'the boss catches up to the pool, one card at a time');
});

test('a card start cancels bullets into antigen tokens and holds 1.5 s before any attack', () => {
  const s = cardArena('alpha', 0);
  s.ship.invulnerable = 1e9;
  toFight(s);
  for (let i = 0; i < 240; i++) update(s, 1 / 60);
  assert.ok(s.enemyShots.length > 0);
  const n = s.enemyShots.filter((b) => b.boss).length;
  s.boss.practiceCard = null;
  hitUntil(s, () => s.boss.card === 1);
  assert.equal(s.boss.state, 'cardIntro');
  assert.equal(s.enemyShots.filter((b) => b.boss).length, 0);
  assert.ok(s.antigens.length >= n);
  for (let t = 0; t < RULES.cardIntro - 0.05; t += 1 / 60) {
    update(s, 1 / 60);
    assert.equal(s.emitters.filter((e) => e.boss).length, 0, 'no telegraph during the name tape');
  }
});

test('NEUTRALIZED pays card index x 10,000 x world only without a hit or SOAP; a timeout pays nothing', () => {
  let s = cardArena('alpha', 1);
  s.ship.invulnerable = 1e9;
  toFight(s);
  const before = s.score;
  hitUntil(s, () => s.boss.state === 'defeated');
  const r = s.boss.results[0];
  assert.equal(r.neutralized, true);
  assert.equal(r.bonus, 2 * 10000 * 1);
  assert.ok(s.score - before >= r.bonus);
  // A SOAP voids the capture.
  s = cardArena('alpha', 1);
  toFight(s);
  update(s, 1 / 60, { bomb: true });
  hitUntil(s, () => s.boss.state === 'defeated');
  assert.equal(s.boss.results[0].neutralized, false);
  // Timeout: the boss moves on, no bonus.
  s = cardArena('alpha', 2);
  s.ship.invulnerable = 1e9;
  toFight(s);
  for (let t = 0; t < 41 && s.boss.state !== 'defeated'; t += 1 / 60) {
    update(s, 1 / 60);
    s.ship.invulnerable = 1e9;
    s.shots = []; // fixture: a player who never lands a needle
  }
  assert.equal(s.boss.results[0].reason, 'timeout');
  assert.equal(s.boss.results[0].bonus, 0);
});

test('SOAP on a boss removes 3% of the current card', () => {
  const s = cardArena('delta', 0);
  toFight(s);
  const hp = s.boss.hp;
  update(s, 1 / 60, { bomb: true });
  assert.equal(hp - s.boss.hp, Math.ceil(s.boss.cards[0].hp * 0.03));
  assert.equal(s.boss.capture, false);
});

test('bosses move at most 3 u/s during every card', () => {
  for (const [type, def] of Object.entries(BOSSES))
    def.cards.forEach((c, i) => {
      const s = cardArena(type, i, { x: -7 });
      s.ship.invulnerable = 1e9;
      toFight(s);
      let last = new Map(parts(s).map((p) => [p.id, [p.x, p.z]]));
      for (let f = 0; f < 60 * 8 && s.boss.state !== 'defeated'; f++) {
        // A player sweeping side to side drives tracking and mirroring cards.
        update(s, 1 / 60, { axisX: Math.sin(f / 40) > 0 ? 1 : -1 });
        s.ship.invulnerable = 1e9;
        for (const p of parts(s)) {
          const prev = last.get(p.id);
          const cap = p.part === 'node' ? RULES.bossMaxSpeed + 1.6 : RULES.bossMaxSpeed;
          if (prev && s.boss.state !== 'intro') assert.ok(Math.hypot(p.x - prev[0], p.z - prev[1]) <= (cap * 1) / 60 + 1e-6, `${type} ${c.name} ${p.part} moved too fast`);
        }
        last = new Map(parts(s).map((p) => [p.id, [p.x, p.z]]));
      }
    });
});

test('ALPHA: COUGH COUGH -> FIRST SNEEZE -> SPIKE BLOOM -> CORONA, its first sneeze inhales 1.0 s', () => {
  assert.deepEqual(BOSSES.alpha.cards.map((c) => c.name), ['COUGH COUGH', 'FIRST SNEEZE', 'SPIKE BLOOM', 'CORONA']);
  const s = cardArena('alpha', 1);
  s.ship.invulnerable = 1e9;
  toFight(s);
  for (let i = 0; i < 60 && !s.emitters.length; i++) update(s, 1 / 60);
  assert.equal(s.emitters[0].preset, 'sneeze');
  assert.ok(s.emitters[0].tele >= 1);
});

test('BETA & GAMMA share one pool; in MIRROR STRAIN only the glowing nucleus is hit and the other twin is intangible', () => {
  const s = cardArena('betagamma', 2);
  s.ship.invulnerable = 1e9;
  toFight(s);
  const [a, b] = parts(s, 'twin');
  assert.ok(a && b);
  const nucleus = parts(s).find((p) => p.id === s.boss.nucleus);
  const other = parts(s).find((p) => p.id !== s.boss.nucleus);
  assert.ok(bossIntangible(s, other) && !bossIntangible(s, nucleus));
  assert.equal(damageBoss(s, other, 5).blocked, true);
  const hp = s.boss.hp;
  damageBoss(s, nucleus, 5);
  assert.equal(s.boss.hp, hp - 5);
  assert.equal(a.hp, b.hp, 'one shared pool');
  const first = s.boss.nucleus;
  for (let t = 0; t < 5.2; t += 1 / 60) {
    update(s, 1 / 60);
    s.ship.invulnerable = 1e9;
  }
  assert.notEqual(s.boss.nucleus, first, 'the nucleus swaps every 5 s');
  // Mirror vs track: BETA sits at -x, GAMMA at +x (at different depths).
  for (let i = 0; i < 300; i++) update(s, 1 / 60, { targetX: 5, targetZ: 8 });
  const beta = parts(s).find((p) => p.tag === 'B'),
    gamma = parts(s).find((p) => p.tag === 'G');
  assert.ok(Math.abs(beta.x - -5) < 0.3 && Math.abs(gamma.x - 5) < 0.3);
  assert.ok(beta.z < gamma.z - 2);
  // Centred: BETA holds 4 u aside instead of stacking on GAMMA's column.
  for (let i = 0; i < 300; i++) update(s, 1 / 60, { targetX: 0.3, targetZ: 8 });
  assert.ok(Math.abs(beta.x - gamma.x) >= 4 - 1e-6);
});

test('DELTA really splits at HALVES: two halves on the same pool', () => {
  const s = cardArena('delta', 1);
  s.ship.invulnerable = 1e9;
  s.boss.practiceCard = null;
  toFight(s);
  assert.equal(parts(s, 'core').length, 1);
  hitUntil(s, () => s.boss.card === 2);
  assert.equal(parts(s, 'core').length, 0);
  assert.equal(parts(s, 'half').length, 2);
  toFight(s);
  const hp = s.boss.hp;
  damageBoss(s, parts(s, 'half')[1], 7);
  assert.equal(s.boss.hp, hp - 7);
});

test('BLOOD RUSH doubles the CURRENT to 1.6 u/s and flips it every 6 s after a 2 s warning', () => {
  const s = cardArena('delta', 3);
  s.ship.invulnerable = 1e9;
  toFight(s);
  update(s, 1 / 60);
  assert.equal(Math.abs(s.twist.drift), 1.6);
  const dir = s.twist.dir;
  let warned = false;
  for (let t = 0; t < 6.5; t += 1 / 60) {
    update(s, 1 / 60);
    s.ship.invulnerable = 1e9;
    if (s.twist.warn) warned = true;
    if (s.twist.dir !== dir) break;
  }
  assert.ok(warned);
  assert.equal(s.twist.dir, -dir);
});

test('OMICRON SPIKE CROWN: the core is shielded, four nodes each own one attack, killing a node removes it', () => {
  const s = cardArena('omicron', 0);
  s.ship.invulnerable = 1e9;
  s.boss.practiceCard = null;
  toFight(s);
  const nodes = parts(s, 'node');
  assert.deepEqual(nodes.map((n) => n.tag).sort(), ['bloom', 'cough', 'drip', 'ring']);
  assert.equal(damageBoss(s, parts(s, 'core')[0], 5).blocked, true);
  assert.ok(bossIntangible(s, parts(s, 'core')[0]), 'needles pass the shielded core to reach the nodes');
  const drip = nodes.find((n) => n.tag === 'drip');
  while (drip.alive) damageBoss(s, drip, 20);
  for (let t = 0; t < 12; t += 1 / 60) {
    update(s, 1 / 60);
    s.ship.invulnerable = 1e9;
    assert.ok(!s.emitters.some((em) => em.preset === 'drip' && em.boss), 'the dead node never attacks again');
  }
  hitUntil(s, () => s.boss.card === 1, () => parts(s, 'node')[0]);
  assert.equal(s.boss.card, 1);
  assert.equal(parts(s, 'node').length, 0);
});

test('OMICRON QUARANTINE: a 7x7 box confines the syringe for 15 s; surviving it unhit is NEUTRALIZED', () => {
  const s = cardArena('omicron', 3);
  s.ship.invulnerable = 1e9;
  toFight(s);
  update(s, 1.05); // the box outline telegraphs for 1.0 s first
  assert.ok(s.quarantine);
  assert.equal(s.quarantine.half * 2, 7);
  assert.equal(damageBoss(s, parts(s)[0], 50).blocked, true, 'damage is optional: the boss is untouchable');
  update(s, 1, { axisX: 1, axisZ: -1 });
  assert.ok(s.ship.x <= s.quarantine.x + 3.5 && s.ship.z >= s.quarantine.z - 3.5, 'soft walls hold');
  for (let t = 0; t < 15; t += 1 / 60) update(s, 1 / 60);
  assert.equal(s.boss.results[0].name, 'QUARANTINE');
  assert.equal(s.boss.results[0].neutralized, true, 'invulnerable here, so never hit');
  assert.equal(s.quarantine, null);
});

test('OMICRON finale R0 > 1: neutralizing it reports CONTAINED', () => {
  const s = cardArena('omicron', 5);
  s.ship.invulnerable = 1e9;
  toFight(s);
  let contained = null;
  for (let i = 0; i < 2000 && s.boss.state !== 'defeated'; i++) {
    damageBoss(s, parts(s)[0], 12);
    for (const ev of s.events) if (ev.type === 'boss-defeated') contained = ev.contained;
  }
  assert.equal(s.boss.results[0].neutralized, true);
  assert.equal(contained, true);
});

test('midbosses: BIG SNEEZER, AEROSOL CLOUD, MOTHER CELL and LAMBDA appear in samples and drop mRNA', () => {
  const where = Object.fromEntries(LEVELS.flatMap((l) => (l.script || []).filter((st) => st.midboss).map((st) => [st.midboss, l.code])));
  // v1.0 (RESEARCH_V1.md 2.4): BIG SNEEZER tests 1-2, LAMBDA moves before
  // DELTA, MOTHER CELL moves into the cell.
  assert.deepEqual(where, { bigsneezer: '1-2', aerosolcloud: '2-2', lambda: '3-2', mother: '4-2' });
  for (const type of Object.keys(where)) assert.ok(BOSSES[type].mid && BOSSES[type].cards.length <= 3);
  const s = running(1, HOME.bigsneezer);
  s.ship.invulnerable = 1e9;
  const mid = (st) => st.boss && st.boss.mid;
  for (let f = 0; f < 60 * 120 && !mid(s); f++) {
    update(s, 1 / 60, { targetX: 0, targetZ: 6 });
    s.ship.invulnerable = 1e9;
    // Fixture: the sample's popcorn is already cured; only the script runs.
    for (const e of s.enemies) if (e.alive && e.kind !== 'boss') e.alive = false;
  }
  assert.ok(mid(s), 'the midboss arrives');
  toFight(s);
  hitUntil(s, () => s.boss.state === 'defeated');
  update(s, 0.3); // past the 200 ms defeat hitstop
  assert.ok(s.pickups.some((p) => p.kind === 'mrna' && p.source === 'midboss'));
});

test('boss intro is invulnerable; sparks show a blocked needle', () => {
  const s = cardArena('alpha', 0);
  assert.equal(s.boss.state, 'intro');
  assert.equal(damageBoss(s, parts(s)[0], 1).blocked, true);
  assert.ok(s.events.some((e) => e.type === 'spark'));
  void quiet;
});
