/** FORMULATE: the DOM side of the adjuvant draft, as pure HTML builders (no
 * DOM access), plus the input gate the screen uses. The draft itself is 3D
 * (draft3d.mjs: vaccine cartridges in the lab view); what stays DOM is only
 * the control bar (RESAMPLE / INJECT / DISCARD, keyboard, mouse and touch
 * controls), the owned-adjuvant rack in the HUD and the pause list.
 *
 * The rack speaks the cartridges' material language (RESEARCH_DIFFICULTY
 * §6.4): each owned adjuvant is a small cartridge, clear glass (common),
 * frosted (rare), cobalt (epic) or a gold crown cap with glowing serum
 * (legendary), with the tier's cap grooves; the serum is the line colour.
 * The only pink is a trade-off's COST, because a cost is a risk.
 */
import { CARD, LINES, cardText, cardCost, legendariesIn } from './cards.mjs';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const PIPS = { common: 1, rare: 2, epic: 3, legendary: 4 };

/** Line glyphs (24 px, stroked): needle, Y antibody, vial, bubble, ring. */
export const LINE_GLYPH = {
  NEEDLE: '<path d="M4 20 16 8M16 8l3-3M14 6l4 4M7 15l2 2"/>',
  ANTIBODY: '<path d="M12 21v-8M12 13 6 6M12 13l6-7M5 4l2 3M19 4l-2 3"/>',
  DOSE: '<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M8 12h8M10 3V1.5h4V3"/>',
  SOAP: '<circle cx="12" cy="13" r="7"/><circle cx="9.5" cy="10.5" r="1.6"/><circle cx="18" cy="5" r="2"/>',
  GRAZE: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 2.4"/><circle cx="12" cy="12" r="2"/>',
  // INJECT: a thumb rest pressing a plunger into a barrel.
  INJECT: '<path d="M7 3h10M12 3v7M8 10h8v8l-4 4-4-4z"/>',
};
LINE_GLYPH.EXPOSURE = LINE_GLYPH.GRAZE; // the difficulty brief's name for GRAZE
export function glyph(line, cls = 'glyph') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LINE_GLYPH[line] || LINE_GLYPH.NEEDLE}</svg>`;
}
/** The control bar: RESAMPLE, INJECT (the primary, the 72 px thumb button on
 * phones) and DISCARD. Controls, not card content (§6.7), styled as the
 * instrument's machined keys. Keycaps are hidden on touch. */
export function controlsHTML({ tokens = 0, confirm = false, touch = false } = {}) {
  const key = (k) => (touch ? '' : `<kbd>${k}</kbd>`);
  return `<button type="button" class="f-key" data-act="resample" ${tokens > 0 ? '' : 'disabled'} aria-label="Resample the offer, ${tokens} left">${key('R')}<span>RESAMPLE</span><b>×${tokens}</b></button>
<button type="button" class="f-key inject" data-act="inject" aria-label="Inject the selected adjuvant">${key('ENTER')}<span>INJECT</span></button>
<button type="button" class="f-key${confirm ? ' confirm' : ''}" data-act="discard" aria-label="${confirm ? 'Confirm discard: take none, plus one soap' : 'Discard all three, plus one soap'}">${key('S')}<span>${confirm ? 'CONFIRM' : 'DISCARD'}</span><b>+1 SOAP</b></button>`;
}
/** The aria-live summary: "Three adjuvants: CONCENTRATE, common; ...". */
export function offerSummary(run) {
  return `Three adjuvants: ${run.offer.ids.map((id) => `${CARD[id].name}, ${CARD[id].tier}`).join('; ')}.`;
}

/** Serum colours by line (draft3d.mjs LINE_SERUM, kept here so the HUD does
 * not import the 3D module). */
const SERUM = { NEEDLE: '#59dcff', INJECT: '#eef6ff', ANTIBODY: '#6f8dff', EXPOSURE: '#c7a6ff', GRAZE: '#c7a6ff', SOAP: '#bff6ff', DOSE: '#ffc46b' };
const CAP = { common: '#aeb8bd', rare: '#e6edf1', epic: '#ffffff', legendary: '#f2c14e' };
/** One owned adjuvant as a small upright cartridge (12 x 26 px): the cap with
 * the tier's 1-4 grooves, the glass (clear, frosted, cobalt), the serum. */
export function cartridgeChip(tier, line) {
  const t = PIPS[tier] ? tier : 'common';
  const serum = SERUM[line] || SERUM.NEEDLE;
  const notches = Array.from({ length: PIPS[t] }, (_, i) => `<path d="M3.2 ${(1.6 + i * 0.95).toFixed(2)}h5.6"/>`).join('');
  const crown = t === 'legendary' ? '<path class="crown" d="M3.4 0.9l1.1-0.9 1.5 0.9 1.5-0.9 1.1 0.9z"/>' : '';
  const veil = { common: '', rare: '<rect class="frost" x="1.5" y="6" width="9" height="19" rx="2"/>', epic: '<rect class="cobalt" x="1.5" y="6" width="9" height="19" rx="2"/>', legendary: '' }[t];
  return `<svg class="cart tier-${t}" viewBox="0 0 12 26" aria-hidden="true"><rect class="serum" x="2.6" y="8.6" width="6.8" height="15.4" rx="1.4" fill="${serum}"/>${veil}<rect class="glass" x="1.5" y="6" width="9" height="19" rx="2"/><rect class="sheen" x="2.5" y="7" width="1.1" height="16.5" rx="0.5"/><rect class="neck" x="4" y="4.6" width="4" height="1.6"/><rect class="capbody" x="3" y="0.8" width="6" height="4" rx="1" fill="${CAP[t]}"/><g class="notch">${notches}</g>${crown}</svg>`;
}

/** The owned formulation as cartridge chips grouped by line, with stack pips;
 * legendaries are larger gold-capped chips on top. Up to 15 chips, then +n. */
export function rackHTML(deck, { limit = null, potency = null, max = 15, compact = false } = {}) {
  const seen = new Map();
  for (const d of deck) seen.set(d.id, (seen.get(d.id) || 0) + 1);
  const legends = [...seen.keys()].filter((id) => CARD[id].tier === 'legendary');
  const others = LINES.flatMap((line) => [...seen.keys()].filter((id) => CARD[id].line === line && CARD[id].tier !== 'legendary'));
  const chip = (id) => {
    const c = CARD[id],
      n = seen.get(id);
    return `<span class="chip tier-${c.tier} line-${c.line.toLowerCase()}" title="${esc(`${c.name}${n > 1 ? ` ×${n}` : ''}: ${cardText(id, n)}`)}">${cartridgeChip(c.tier, c.line)}${n > 1 ? `<em>${'•'.repeat(n)}</em>` : ''}</span>`;
  };
  const shown = others.slice(0, max);
  const more = others.length - shown.length;
  const legendHTML = legends.length ? `<span class="legends">${legends.map((id) => `<span class="chip legend" title="${esc(`${CARD[id].name}: ${cardText(id, 1)}`)}">${cartridgeChip('legendary', CARD[id].line)}<b>${esc(CARD[id].name)}</b></span>`).join('')}</span>` : '';
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
    get openedAt() {
      return openedAt;
    },
    accept(code, now, repeat) {
      if (repeat || now - openedAt < DRAFT_LOCK_MS) return false;
      if (held.has(code)) return false;
      return true;
    },
  };
}
