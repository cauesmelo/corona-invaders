/** FORMULATE: the adjuvant draft screen and the owned-adjuvant rack, as pure
 * HTML builders (no DOM access), plus the input gate the screen uses. The
 * look is the lab instrument's: three glass specimen slides under a lamp, a
 * tier band that never relies on colour alone (word + pips + frame style),
 * and NOW -> AFTER numbers from the kit diff (RESEARCH_CARDS §6.1).
 *
 * Palette (one meaning per colour): grey glass = common, cyan rim = rare,
 * cobalt double rim = epic, amber with a moving sweep = legendary. The only
 * pink is the COST line, because a cost is a risk.
 */
import { CARD, TIER_LABEL, LINES, cardText, cardCost, previewPick, stacksOf, limitOf, legendariesIn } from './cards.mjs';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const PIPS = { common: 1, rare: 2, epic: 3, legendary: 4 };

/** Line glyphs (24 px, stroked): needle, Y antibody, vial, bubble, ring. */
export const LINE_GLYPH = {
  NEEDLE: '<path d="M4 20 16 8M16 8l3-3M14 6l4 4M7 15l2 2"/>',
  ANTIBODY: '<path d="M12 21v-8M12 13 6 6M12 13l6-7M5 4l2 3M19 4l-2 3"/>',
  DOSE: '<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M8 12h8M10 3V1.5h4V3"/>',
  SOAP: '<circle cx="12" cy="13" r="7"/><circle cx="9.5" cy="10.5" r="1.6"/><circle cx="18" cy="5" r="2"/>',
  GRAZE: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 2.4"/><circle cx="12" cy="12" r="2"/>',
};
export function glyph(line, cls = 'glyph') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LINE_GLYPH[line] || LINE_GLYPH.NEEDLE}</svg>`;
}
/** Numbers in an effect sentence set in the seven-segment face. */
const numbers = (text) => esc(text).replace(/([+−-]?\d+(?:\.\d+)?(?:%|×| s| u|°)?)/g, '<b class="num">$1</b>');

/** One specimen slide. `ctx` is the kit context for the NOW -> AFTER line. */
export function slideHTML(id, slot, deck, ctx, { selected = false } = {}) {
  const c = CARD[id];
  const have = stacksOf(deck, id);
  const preview = previewPick(deck, id, ctx);
  const cost = cardCost(id);
  const pips = Array.from({ length: 4 }, (_, i) => `<i class="${i < PIPS[c.tier] ? 'on' : ''}"></i>`).join('');
  return `<button type="button" class="slide tier-${c.tier}${selected ? ' selected' : ''}" data-slot="${slot}" style="--i:${slot}" aria-label="${esc(`${c.name}, ${TIER_LABEL[c.tier].toLowerCase()}, ${c.line.toLowerCase()} line. ${cardText(id, have + 1)} ${cost}`)}">
  <span class="slide-glass" aria-hidden="true"></span>
  <span class="band"><span class="tier-word">${TIER_LABEL[c.tier]}</span><span class="pips" aria-hidden="true">${pips}</span><span class="key" aria-hidden="true">${slot + 1}</span></span>
  <span class="title">${glyph(c.line)}<strong>${esc(c.name)}</strong></span>
  <span class="tags">${esc(c.line)} · ${c.tags.map(esc).join(' · ')}</span>
  <span class="effect">${numbers(cardText(id, have + 1))}</span>
  ${cost ? `<span class="cost">${numbers(cost)}</span>` : ''}
  <span class="after">${preview.lines.map((l) => `<span>${esc(l)}</span>`).join('')}</span>
  ${preview.synergy ? `<span class="synergy">SYNERGY: ${esc(preview.synergy)}</span>` : ''}
  <span class="stack">${c.max > 1 ? `STACK ${have} → ${have + 1} / ${c.max}` : 'UNIQUE'}</span>
  <span class="inject-cta" aria-hidden="true">INJECT</span>
</button>`;
}

/** Header, three slides and the footer for an open offer. */
export function formulateHTML({ run, stageCode, boss, bossName, sequenced, cards, ctx, selected = -1, touch = false, confirmDiscard = false }) {
  const titer = Array.from({ length: 3 }, (_, i) => (i < run.titer ? '◆' : '◇')).join('');
  const head = boss ? `${esc(bossName || 'VARIANT')} SEQUENCED ${sequenced}` : `${esc(stageCode)} CLEARED · PICK 1 ADJUVANT`;
  const slides = run.offer.ids.map((id, i) => slideHTML(id, i, run.deck, ctx, { selected: i === selected })).join('');
  const key = (k) => (touch ? '' : `<kbd>${k}</kbd> `);
  return `<header class="f-head"><span class="f-title">FORMULATE</span><span class="f-sub">${head}</span><span class="f-titer" title="Titer: bosses defeated">TITER ${titer}</span></header>
<div class="slides" role="group" aria-label="Three adjuvants">${slides}</div>
<footer class="f-foot">
  <button type="button" class="f-btn inject" data-act="inject" ${selected < 0 ? 'disabled' : ''}>${key(touch ? '' : 'ENTER')}INJECT</button>
  <button type="button" class="f-btn" data-act="resample" ${run.tokens > 0 ? '' : 'disabled'}>${key('R')}RESAMPLE <b>×${run.tokens}</b></button>
  <button type="button" class="f-btn${confirmDiscard ? ' confirm' : ''}" data-act="discard">${key('S')}${confirmDiscard ? 'CONFIRM DISCARD' : 'DISCARD'} <b>+1 SOAP</b></button>
</footer>
<div class="f-rack">${rackHTML(run.deck, { limit: limitOf(run.titer), potency: cards?.potency })}</div>`;
}
/** The aria-live summary: "Three adjuvants: CONCENTRATE, common; ...". */
export function offerSummary(run) {
  return `Three adjuvants: ${run.offer.ids.map((id) => `${CARD[id].name}, ${CARD[id].tier}`).join('; ')}.`;
}

/** The owned formulation as vial chips grouped by line, with stack pips;
 * legendaries are larger amber chips on top. Up to 15 chips, then +n. */
export function rackHTML(deck, { limit = null, potency = null, max = 15, compact = false } = {}) {
  const seen = new Map();
  for (const d of deck) seen.set(d.id, (seen.get(d.id) || 0) + 1);
  const legends = [...seen.keys()].filter((id) => CARD[id].tier === 'legendary');
  const others = LINES.flatMap((line) => [...seen.keys()].filter((id) => CARD[id].line === line && CARD[id].tier !== 'legendary'));
  const chip = (id) => {
    const c = CARD[id],
      n = seen.get(id);
    return `<span class="chip tier-${c.tier} line-${c.line.toLowerCase()}" title="${esc(`${c.name}${n > 1 ? ` ×${n}` : ''}: ${cardText(id, n)}`)}"><i class="fill"></i>${glyph(c.line, 'chip-glyph')}${n > 1 ? `<em>${'•'.repeat(n)}</em>` : ''}</span>`;
  };
  const shown = others.slice(0, max);
  const more = others.length - shown.length;
  const legendHTML = legends.length ? `<span class="legends">${legends.map((id) => `<span class="chip legend" title="${esc(`${CARD[id].name}: ${cardText(id, 1)}`)}">${glyph(CARD[id].line, 'chip-glyph')}<b>${esc(CARD[id].name)}</b></span>`).join('')}</span>` : '';
  if (compact) return legendHTML;
  const readout = potency !== null && limit !== null ? `<span class="potency">POTENCY <b>×${potency.toFixed(2)}</b> / ${limit.toFixed(2)}${potency >= limit - 1e-9 ? ' MAX' : ''}</span>` : '';
  return `${legendHTML}<span class="chips">${shown.map(chip).join('')}${more > 0 ? `<span class="more">+${more}</span>` : ''}${deck.length ? '' : '<span class="empty">NO ADJUVANTS YET</span>'}</span>${readout}`;
}

/** The pause screen's full formulation, with text. */
export function formulationList(deck) {
  if (!deck.length) return '<p class="formulation empty">FORMULATION: STANDARD DOSE (NO ADJUVANTS)</p>';
  const seen = new Map();
  for (const d of deck) seen.set(d.id, (seen.get(d.id) || 0) + 1);
  const rows = LINES.flatMap((line) => [...seen.keys()].filter((id) => CARD[id].line === line)).map((id) => {
    const c = CARD[id],
      n = seen.get(id);
    return `<li class="tier-${c.tier}">${glyph(c.line)}<b>${esc(c.name)}${n > 1 ? ` ×${n}` : ''}</b><span>${esc(cardText(id, n))}${c.cost ? ` ${esc(cardCost(id))}` : ''}</span></li>`;
  });
  return `<ul class="formulation" aria-label="Formulation: ${deck.length} adjuvants, ${legendariesIn(deck)} legendary">${rows.join('')}</ul>`;
}

/** Input gate shared by every FORMULATE press (the loss/report screens'
 * rule): ignore input for 0.5 s after the screen opens, and keys already
 * held when it opened (Space or X from the fight) count only after a release;
 * key repeats never count. Times are ms. */
export const DRAFT_LOCK_MS = 500;
export function createDraftGate() {
  let openedAt = -Infinity;
  const held = new Set();
  return {
    open(now, heldKeys = []) {
      openedAt = now;
      held.clear();
      for (const k of heldKeys) held.add(k);
    },
    release(code) {
      held.delete(code);
    },
    locked: (now) => now - openedAt < DRAFT_LOCK_MS,
    accept(code, now, repeat) {
      if (repeat || now - openedAt < DRAFT_LOCK_MS) return false;
      if (held.has(code)) return false;
      return true;
    },
  };
}
