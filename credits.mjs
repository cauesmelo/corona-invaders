/** The beginning and the end of a run, as data: the new-run BRIEFING, the
 * EPILOGUE after OMICRON PRIME, and the CREDITS roll, plus the small pure
 * "reel" that plays any of them one card at a time. No DOM, no Three.js, no
 * clock: game.js feeds it real seconds and key presses, tests feed it numbers.
 *
 * To edit what a player reads, change the lists below (BRIEFING, `epilogue`,
 * CREDITS) and nothing else. Every credit line is checked against the repo by
 * tests/credits.test.mjs (the three.js revision against vendor/, the
 * original's licence and author against the refs the game derives from), so a
 * line cannot drift into something untrue unnoticed.
 *
 * Voice: the BRIEFING and EPILOGUE are the lab's (RESEARCH_V1.md 5.2): calm,
 * clinical, uppercase, no exclamation marks, no patients and no deaths. The
 * CREDITS keep proper names in sentence case.
 */

/** The release a player sees (title label, credits, package.json, CHANGELOG). */
export const VERSION = 'v1.0';

/** Seconds. `lockout`: after a card appears, a press is ignored for this long
 * so the key that opened the reel, a double press or a held key cannot spend
 * the card unread. The briefing has none: the held-key rule below already
 * keeps the START press from skipping it, and a player who presses a movement
 * key means to play. */
export const REEL = Object.freeze({
  lockout: 0.6,
  briefingLine: 0.55, // one briefing line is typed in every 0.55 s
  briefingDwell: 2.4, // then the card waits this long before play begins
  epilogue: 4.4,
  credits: 4.2,
});

/** The new-run briefing: who you are, where you are going, what counts as
 * winning. One card, five lines. The first three lines are FIELD NOTE 0
 * (levels.mjs `PROLOGUE`) cut at its sentences, so the briefing replaces the
 * old one-off callout instead of repeating it; tests/credits.test.mjs checks
 * they still match. */
export const BRIEFING = Object.freeze({
  id: 'briefing',
  heading: 'BRIEFING',
  tag: 'SPECIMEN 1-1 · AIRWAY',
  lines: Object.freeze([
    'SPECIMEN RECEIVED: AIRWAY.',
    'WILD-TYPE REPLICATION CONFIRMED.',
    'DISPATCH ONE SYRINGE. THAT IS YOU.',
    'ROUTE: AIRWAY, LUNGS, BLOODSTREAM, THE CELL.',
    'OBJECTIVE: CONTAIN IT. KEEP R0 BELOW 1.',
  ]),
  reveal: REEL.briefingLine,
});

/** The epilogue after the final boss: what the culture became and how the run
 * went, in the lab's voice. `report` is the model's `finalReport`; `note` is
 * the last sector's FIELD NOTE (levels.mjs WORLDS[3].note), whose sentences
 * open the epilogue so the story has one source. Pure and total: a missing
 * field only drops a line. */
export function epilogue(report = {}, note = 'OMICRON PRIME NEUTRALIZED. R0 < 1. SPECIMEN CONTAINED. REPORT FILED.') {
  // The note is four short sentences; the first two open the card, "REPORT
  // FILED." closes the epilogue, the rest sits between.
  const sentences = String(note).match(/[^.]+\./g)?.map((s) => s.trim()) ?? [String(note)];
  const closing = sentences.at(-1);
  // A readout this short ("R0 < 1.") joins the line before it instead of
  // standing alone on a card.
  const opening = [];
  for (const sentence of sentences.slice(0, -1)) {
    if (opening.length && sentence.length < 12) opening[opening.length - 1] += ` ${sentence}`;
    else opening.push(sentence);
  }
  const used = report.creditsUsed | 0;
  const cap = report.credits;
  const capText = cap === Infinity ? 'UNLIMITED' : cap;
  // One line about how it went. The stamp is the model's verdict; the rest is
  // plain counting. One dry aside at most (the 1CC lines).
  const stamp = report.stamp || '';
  let how;
  if (stamp === '1CC · ONE CREDIT CLEAR') how = 'ONE SYRINGE, ONE CREDIT. THE LAB WILL FRAME IT.';
  else if (stamp === '1CC · ASSISTED') how = 'ONE CREDIT, AT REDUCED SPEED. THE LAB NOTES BOTH.';
  else if (stamp === '1CC · HARD') how = 'HARD, WITH ONE CREDIT. THE LAB HAS NO NOTES.';
  else if (stamp === 'HARD CLEAR') how = `CONTAINED ON HARD USING ${used} OF ${capText} CREDITS.`;
  else if (stamp === 'EASY CLEAR') how = 'CONTAINED ON EASY. THE VIRUS DID NOT ASK.';
  else how = cap === undefined ? 'CONTAINED.' : `CONTAINED USING ${used} OF ${capText} CREDITS.`;
  const sequenced = Number.isFinite(report.sequenced) && Number.isFinite(report.variantCards) ? `SEQUENCED ${report.sequenced} OF ${report.variantCards} VARIANT CARDS.` : null;
  return Object.freeze([
    { id: 'note', heading: 'FIELD NOTE', tag: 'SECTOR 4 · THE CELL ×40 000', lines: opening, hold: REEL.epilogue },
    {
      id: 'culture',
      heading: 'CULTURE INERT',
      lines: ['ALPHA, BETA, GAMMA, DELTA, OMICRON: ALL CLOSED.', 'ONLY THE SPIKE IS LEFT, AND THE BODY HAS SEEN IT.', 'IT WILL KNOW IT NEXT TIME.'],
      hold: REEL.epilogue + 0.8,
    },
    { id: 'filed', heading: closing.replace(/\.$/, ''), lines: [how, ...(sequenced ? [sequenced] : [])], hold: REEL.epilogue },
  ]);
}

/** The credits, one card at a time. `heading` is set in the dot-matrix face;
 * `label` (when present) also puts the card in the compact static list the
 * title's attract loop shows. Sources (checked by tests/credits.test.mjs):
 *   original game, author, year, licence: refs/canvas-retro-arcade (LICENSE,
 *     package.json "author", git history, src/js/coronaInvaders, src/img);
 *   three.js revision and notice: vendor/three.core.js, vendor/THREE-LICENSE.txt;
 *   sound, shapes, lettering: no audio, image, model or font file ships (the
 *     itch ZIP lists only code, vendor/ and docs: dist/build-report.json);
 *   the march: the arcade game's four descending notes (public knowledge, as
 *     the README says). */
export const CREDITS = Object.freeze(
  [
    { id: 'title', logo: true, lines: ['A VACCINE BULLET HELL'] },
    {
      id: 'original',
      heading: 'ORIGINAL GAME',
      label: 'ORIGINAL GAME',
      lines: ['Original Corona Invaders by Cauê Melo.', 'Part of Canvas Retro Arcade, 2023, MIT licence.', 'The 16×16 corona and syringe sprites', 'come from that game.'],
    },
    {
      id: 'version',
      heading: 'THIS VERSION',
      label: 'THIS VERSION',
      lines: [`Corona Invaders 3D ${VERSION}.`, 'A bullet-hell remake for Cauê Melo,', 'developed with AI assistance (Claude Code).'],
    },
    { id: 'three', heading: '3D', label: '3D', lines: ['three.js r187 by the three.js authors,', 'MIT licence (vendor/THREE-LICENSE.txt).'] },
    {
      id: 'sound',
      heading: 'SOUND',
      label: 'SOUND',
      lines: ['Every sound and the music are synthesized live', 'with the Web Audio API: no recordings.', 'The four-note march is a nod to Space Invaders', '(Tomohiro Nishikado, Taito, 1978).'],
    },
    {
      id: 'lettering',
      heading: 'LETTERING',
      label: 'LETTERING',
      lines: ['The dot-matrix lettering, every 3D shape', 'and every texture are drawn in code.', 'The only typeface is the system monospace.'],
    },
    { id: 'thanks', heading: 'THANK YOU', lines: ['Thank you for playing.'] },
  ].map((card) => Object.freeze({ ...card, lines: Object.freeze(card.lines), hold: REEL.credits })),
);

/** The compact static credits (the title's attract loop): [label, text] rows
 * built from the same cards, so the two views can never disagree. */
export const creditsRows = () => CREDITS.filter((c) => c.label).map((c) => [c.label, c.lines.join(' ')]);

// ---- The reel: one card at a time, calm, never a choice --------------------------

/** Keys that never count as a press: modifier chords belong to the browser
 * (reload, fullscreen, tab switch), Tab belongs to focus. Shift counts: it is
 * a game key like the others. */
const INERT = /^(Meta|Control|Alt|OS|ContextMenu|CapsLock|NumLock|ScrollLock|Tab|F\d{1,2}|Fn|Lang\d|IntlBackslash)/;
export const inertKey = (code = '') => INERT.test(code);

/** A reel over `cards`. `kind`: 'briefing' | 'epilogue' | 'credits'. */
export function createReel(kind, cards, { lockout = REEL.lockout } = {}) {
  return { kind, cards, index: 0, t: 0, done: false, reason: null, lockout, shown: -1 };
}
/** How long a card stays when nobody presses: the line-by-line reveal plus its
 * dwell (the briefing), else its own `hold`. */
export function holdOf(card) {
  if (card.reveal) return card.lines.length * card.reveal + REEL.briefingDwell;
  return card.hold ?? REEL.credits;
}
/** Total unattended length in seconds (the pace a player who never presses sees). */
export const reelLength = (cards) => cards.reduce((sum, c) => sum + holdOf(c), 0);
export const currentCard = (reel) => reel.cards[Math.min(reel.index, reel.cards.length - 1)];

function finish(reel, reason) {
  reel.done = true;
  reel.reason = reason;
  return 'end';
}
/** Advance time. Returns true when the visible card changed or the reel ended. */
export function tickReel(reel, dt) {
  if (reel.done) return false;
  reel.t += Math.max(0, dt);
  if (reel.t < holdOf(currentCard(reel))) return false;
  if (reel.index + 1 >= reel.cards.length) {
    finish(reel, 'time');
    return true;
  }
  reel.index++;
  reel.t = 0;
  return true;
}
/** One key press (or a pointer press: `code: 'Pointer'`).
 *   `repeat`: the browser's auto-repeat, OR a key already physically down when
 *     the event arrived. Neither is ever a press, so a held SOAP key (Space)
 *     cannot skip anything, however long it is held;
 *   inside the card's lockout nothing counts;
 *   Escape ends the whole reel; the briefing is skipped by any key; every
 *     other key moves to the next card.
 * Returns 'ignored', 'next' (the next card is now showing) or 'end'. */
export function pressReel(reel, { code = '', repeat = false } = {}) {
  if (reel.done || repeat || inertKey(code) || reel.t < reel.lockout) return 'ignored';
  if (code === 'Escape' || reel.kind === 'briefing') return finish(reel, 'skip');
  if (reel.index + 1 >= reel.cards.length) return finish(reel, 'press');
  reel.index++;
  reel.t = 0;
  return 'next';
}
