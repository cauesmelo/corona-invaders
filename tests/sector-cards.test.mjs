/** The three sector cards (TIDAL VOLUME, STREAMLINE, PROOFREADING) are
 * offered when the run enters their sector: slot 3's line diversity yields
 * once, at 50%, if the card is not owned (RESEARCH_DIFFICULTY §7.4).
 *
 * The rule lives in cards.mjs compose() and reads `ctx.enterSector`. The
 * cards-level test below pins it. The second test drives the real model
 * (a boss cleared, the LAB REPORT confirmed, the draft opened) and is a
 * `todo` because model.mjs draftCtx() does not pass `enterSector`, so in the
 * game the rule never fires: measured 15 / 12 / 8% of the drafts after
 * ALPHA, BETA & GAMMA and DELTA carry the sector card (the base pool rate),
 * against 53% when the key is passed. One line in model.mjs draftCtx():
 *   enterSector: boss && s.wave < STAGE_COUNT ? getLevel(s.wave + 1).world : 0
 * Remove the `todo` once it lands. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, openDraft, SECTOR_CARD, CARD } from '../cards.mjs';
import { createState, update, entryPower } from '../model.mjs';

const SECTORS = [
  { stage: 3, world: 2 },
  { stage: 6, world: 3 },
  { stage: 9, world: 4 },
];

test('entering a sector, the sector card takes a slot about half the time, at most once, never when owned', () => {
  for (const { stage, world } of SECTORS) {
    const id = SECTOR_CARD[world];
    assert.ok(CARD[id].sector === world, `${id} is the sector ${world} card`);
    let shown = 0;
    const N = 400;
    for (let seed = 1; seed <= N; seed++) {
      const run = createRun(seed, { inject: true });
      const offer = openDraft(run, { power: entryPower(stage + 1), difficulty: 'normal', stage, boosted: true, share: 0.5, stageCount: 12, enterSector: world });
      assert.ok(offer.ids.filter((x) => x === id).length <= 1, 'never twice in one offer');
      if (offer.ids.includes(id)) shown++;
      // Owned: never offered again as the sector yield.
      const owner = createRun(seed, { inject: true });
      owner.deck.push({ id, at: 1 });
      const second = openDraft(owner, { power: entryPower(stage + 1), difficulty: 'normal', stage, boosted: true, share: 0.5, stageCount: 12, enterSector: world });
      assert.ok(!second.ids.includes(id) || CARD[id].max > 1, 'an owned sector card is not offered');
    }
    const rate = shown / N;
    assert.ok(rate > 0.4 && rate < 0.65, `${id}: ${(rate * 100).toFixed(0)}% of the drafts entering sector ${world}`);
  }
});

test('in the game, the draft after each sector boss offers the sector card about half the time', { todo: 'model.mjs draftCtx() must pass enterSector (measured 15 / 12 / 8%)' }, () => {
  for (const { stage, world } of SECTORS) {
    const id = SECTOR_CARD[world];
    let drafts = 0,
      shown = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const s = createState({ seed, stage, drafts: true });
      s.phase = 'playing';
      s.boss.state = 'defeated'; // the real finishSector, report hold and draft follow
      for (let i = 0; i < 24 && s.phase !== 'draft'; i++) update(s, 0.5, { confirm: s.transitionHold && i % 2 === 1 });
      if (s.phase !== 'draft') continue;
      drafts++;
      if (s.run.offer.ids.includes(id)) shown++;
    }
    assert.ok(drafts >= 90, `${drafts} drafts opened`);
    assert.ok(shown / drafts > 0.4, `${id}: ${shown}/${drafts} drafts after stage ${stage} carry it`);
  }
});
