/** The beginning and the end (credits.mjs): the new-run briefing, the epilogue
 * after OMICRON PRIME and the credits roll are data in one module, played by
 * one pure reel. These tests pin the voice of the lab's text, the truth of
 * every credit line against the repository, and the reel's rules: one card at
 * a time, a lockout, and a held key never skips anything. The real-browser
 * counterpart (real key events, the whole ending, the title's CREDITS button)
 * is tests/browser/ending.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRIEFING, CREDITS, REEL, VERSION, creditsRows, createReel, currentCard, epilogue, holdOf, inertKey, pressReel, reelLength, tickReel } from '../credits.mjs';
import { creditsCard } from '../ui.mjs';
import { PROLOGUE, WORLDS } from '../levels.mjs';
import { stampOf } from '../runlog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(path.join(root, name), 'utf8');
/** The lab's voice (RESEARCH_V1.md 5.2, tests/voice.test.mjs): uppercase, calm, no patients, no deaths. */
const labVoice = (text, where) => {
  assert.equal(text, text.toUpperCase(), `${where}: uppercase`);
  assert.ok(!text.includes('!'), `${where}: no exclamation mark`);
  assert.ok(!/\b(PATIENT|DIE|DIED|DEAD|DEATH|KILL|KILLED)\b/.test(text), `${where}: no patients and no deaths`);
  assert.ok(text.length <= 60, `${where}: at most 60 characters (${text.length})`);
};

// ---- The briefing ----------------------------------------------------------------

test('the briefing is one card of 3 to 5 lab-voice lines: who you are, the route, the goal', () => {
  assert.ok(BRIEFING.lines.length >= 3 && BRIEFING.lines.length <= 5, `${BRIEFING.lines.length} lines`);
  for (const [i, line] of BRIEFING.lines.entries()) {
    labVoice(line, `briefing line ${i + 1}`);
    assert.ok(line.length <= 50, `briefing line ${i + 1} would wrap on the card`);
  }
  const text = BRIEFING.lines.join(' ');
  assert.match(text, /SYRINGE/, 'tells the player who they are');
  for (const sector of WORLDS) assert.ok(text.includes(sector.name), `the route names ${sector.name}`);
  assert.match(text, /R0/, 'names the goal in the HUD\'s own word');
  // FIELD NOTE 0 is cut at its sentences: the briefing replaces the old callout, it does not contradict it.
  const prologue = BRIEFING.lines.slice(0, 3).join(' ').replace(/ THAT IS YOU\./, '');
  assert.equal(prologue, PROLOGUE);
});

test('the briefing has no lockout (the held-key rule guards it instead) and lasts about five seconds unattended', () => {
  const reel = createReel('briefing', [BRIEFING], { lockout: 0 });
  assert.equal(holdOf(BRIEFING), BRIEFING.lines.length * REEL.briefingLine + REEL.briefingDwell);
  assert.ok(holdOf(BRIEFING) >= 4 && holdOf(BRIEFING) <= 7, `${holdOf(BRIEFING)} s`);
  assert.equal(pressReel(reel, { code: 'ArrowRight' }), 'end', 'any key skips, even at once');
  assert.equal(reel.reason, 'skip');
});

// ---- The epilogue ----------------------------------------------------------------

const REPORTS = {
  oneCredit: { stamp: stampOf({ contained: true, oneCredit: true, difficulty: 'normal', assisted: false }), creditsUsed: 0, credits: 3, sequenced: 14, variantCards: 20 },
  assisted: { stamp: stampOf({ contained: true, oneCredit: true, difficulty: 'normal', assisted: true }), creditsUsed: 0, credits: 3, sequenced: 9, variantCards: 20 },
  normalTwo: { stamp: stampOf({ contained: true, oneCredit: false, difficulty: 'normal', assisted: false }), creditsUsed: 2, credits: 3, sequenced: 5, variantCards: 20 },
  easy: { stamp: stampOf({ contained: true, oneCredit: false, difficulty: 'easy', assisted: false }), creditsUsed: 7, credits: Infinity, sequenced: 12, variantCards: 20 },
  hardOne: { stamp: stampOf({ contained: true, oneCredit: true, difficulty: 'hard', assisted: false }), creditsUsed: 0, credits: 2, sequenced: 16, variantCards: 20 },
  hardTwo: { stamp: stampOf({ contained: true, oneCredit: false, difficulty: 'hard', assisted: false }), creditsUsed: 2, credits: 2, sequenced: 3, variantCards: 20 },
};

test('the epilogue is three lab-voice cards built from the last FIELD NOTE and the run\'s own result', () => {
  for (const [name, report] of Object.entries(REPORTS)) {
    const cards = epilogue(report, WORLDS[3].note);
    assert.equal(cards.length, 3, name);
    for (const card of cards) {
      assert.ok(card.heading && card.lines.length >= 1 && card.hold > 0, `${name} ${card.id}`);
      labVoice(card.heading, `${name} ${card.id} heading`);
      for (const [i, line] of card.lines.entries()) {
        labVoice(line, `${name} ${card.id} line ${i + 1}`);
        assert.ok(line.length <= 50, `${name} ${card.id}: "${line}" would wrap on the card (${line.length})`);
      }
    }
    const text = cards.flatMap((c) => c.lines).join(' ');
    assert.ok(!/undefined|NaN|null/.test(text), `${name}: ${text}`);
    // One source for the story: every sentence of the sector's FIELD NOTE appears, in order, and the last closes the epilogue.
    const sentences = WORLDS[3].note.match(/[^.]+\./g).map((x) => x.trim());
    const shown = [...cards[0].lines, cards[2].heading + '.'].join(' ');
    for (const sentence of sentences) assert.ok(shown.includes(sentence), `${name}: "${sentence}"`);
    assert.match(cards[2].lines.at(-1), /SEQUENCED \d+ OF 20 VARIANT CARDS\./);
  }
});

test('the epilogue says each way of winning in its own words and never miscounts the credits', () => {
  const how = (report) => epilogue(report, WORLDS[3].note)[2].lines[0];
  assert.match(how(REPORTS.oneCredit), /ONE SYRINGE, ONE CREDIT/);
  assert.match(how(REPORTS.assisted), /REDUCED SPEED/);
  assert.match(how(REPORTS.hardOne), /HARD, WITH ONE CREDIT/);
  assert.match(how(REPORTS.hardTwo), /HARD USING 2 OF 2 CREDITS/);
  assert.match(how(REPORTS.easy), /CONTAINED ON EASY/);
  assert.doesNotMatch(how(REPORTS.easy), /UNLIMITED|INFINITY|∞/, 'Easy has no credit count to boast about');
  assert.match(how(REPORTS.normalTwo), /CONTAINED USING 2 OF 3 CREDITS/);
  // A report the model never filled still reads: a fixture or an older state.
  assert.equal(epilogue({}, WORLDS[3].note).length, 3);
  assert.equal(epilogue(undefined).length, 3);
  assert.match(how({}), /^CONTAINED\.$/);
});

test('the culture card names every variant the run fought', () => {
  const lines = epilogue(REPORTS.oneCredit, WORLDS[3].note)[1].lines.join(' ');
  for (const variant of ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'OMICRON']) assert.ok(lines.includes(variant), variant);
});

// ---- The credits: every line is true --------------------------------------------

const creditsText = CREDITS.flatMap((c) => c.lines).join(' ');

test('credits: the original game, its author, year and licence match the project this game derives from', (t) => {
  assert.match(creditsText, /Original Corona Invaders by Cauê Melo/);
  assert.match(creditsText, /Canvas Retro Arcade, 2023, MIT licence/);
  const refs = path.join(root, '..', 'refs', 'canvas-retro-arcade');
  if (!existsSync(path.join(refs, 'LICENSE'))) return t.skip('refs/ is only in the workspace, not in this repository on its own');
  const licence = readFileSync(path.join(refs, 'LICENSE'), 'utf8');
  assert.match(licence, /^MIT License/m);
  assert.match(licence, /Copyright \(c\) 2023 Cauê Melo/);
  const pkg = JSON.parse(readFileSync(path.join(refs, 'package.json'), 'utf8'));
  assert.match(pkg.author, /Cauê Melo/);
  // The sprites the credits name are in that game: a 16x16 corona and the syringe, as images.
  for (const name of ['corona.png', 'syringe.png']) assert.ok(existsSync(path.join(refs, 'src', 'img', name)), name);
  assert.match(readFileSync(path.join(refs, 'src', 'js', 'coronaInvaders', 'corona.js'), 'utf8'), /this\.width = 16;\s*this\.height = 16;/);
});

test('credits: the three.js line names the vendored revision and its licence file says MIT', () => {
  const revision = /const REVISION = '(\d+)'/.exec(read('vendor/three.core.js'))?.[1];
  assert.ok(revision, 'vendor/three.core.js declares its revision');
  assert.ok(creditsText.includes(`three.js r${revision} `), `credits say r${revision}`);
  assert.match(read('vendor/THREE-LICENSE.txt'), /The MIT License/);
  assert.match(read('vendor/THREE-LICENSE.txt'), /three\.js authors/);
  assert.ok(creditsText.includes('MIT licence (vendor/THREE-LICENSE.txt)'));
});

test('credits: "no recordings, no fonts, nothing but code" is true of every file the game ships', () => {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (['node_modules', 'dist', '.git', 'tests'].includes(name)) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(mp3|wav|ogg|m4a|flac|png|jpe?g|gif|webp|svg|woff2?|ttf|otf|glb|gltf|obj|fbx|ktx2?|hdr)$/i.test(name)) found.push(path.relative(root, full));
    }
  };
  walk(root);
  assert.deepEqual(found, [], 'no audio, image, font or model file in the game');
  for (const css of ['style.css', 'embed.css']) assert.doesNotMatch(read(css), /@font-face|url\(/, `${css} loads nothing`);
  // The only external-looking thing is the inline data: favicon in index.html; no fetch of media anywhere.
  assert.doesNotMatch(read('index.html'), /<(img|audio|video|source)\b/);
  for (const file of ['game.js', 'render.mjs', 'audio.mjs', 'draft3d.mjs', 'ui.mjs']) assert.doesNotMatch(read(file), /\b(TextureLoader|GLTFLoader|FontLoader|decodeAudioData|new Audio\()/, file);
  assert.match(read('audio.mjs'), /createOscillator/, 'sound is made by oscillators');
});

test('credits: the version is the release, and the lines belong to this game alone', () => {
  assert.ok(creditsText.includes(`Corona Invaders 3D ${VERSION}.`));
  assert.equal(VERSION, `v${JSON.parse(read('package.json')).version.split('.').slice(0, 2).join('.')}`);
  // Solarum's team and soundtrack artists did not make this game (refs/canvas-retro-arcade names only Cauê Melo).
  for (const name of ['Daniel', 'Calônico', 'raenkumi', 'Lucas', 'Santos', 'LSdS', 'Rafael', 'Lima', 'Kimoh', 'Amanda', 'meromei', 'Bruno', 'Mareto', 'Maré', 'Solarum']) assert.ok(!creditsText.includes(name), name);
  assert.match(creditsText, /Space Invaders/);
  assert.match(creditsText, /Tomohiro Nishikado, Taito, 1978/);
  assert.match(creditsText, /developed with AI assistance \(Claude Code\)/);
});

test('credits: seven calm cards, each with a heading or the logo, ending on a thank you', () => {
  assert.equal(CREDITS.length, 7);
  assert.equal(new Set(CREDITS.map((c) => c.id)).size, CREDITS.length, 'unique ids');
  for (const card of CREDITS) {
    assert.ok(card.logo || card.heading, card.id);
    assert.ok(card.lines.length >= 1 && card.lines.length <= 4, `${card.id}: ${card.lines.length} lines`);
    assert.ok(card.hold >= 3.5 && card.hold <= 6, `${card.id} holds ${card.hold} s`);
    // The card is about 52 monospace characters wide: a longer line wraps and strands a word.
    for (const line of card.lines) assert.ok(line.length <= 50, `${card.id}: "${line}" (${line.length})`);
  }
  assert.ok(CREDITS[0].logo);
  assert.match(CREDITS.at(-1).lines[0], /Thank you for playing/);
  const total = reelLength(CREDITS);
  assert.ok(total >= 20 && total <= 40, `the roll lasts ${total.toFixed(1)} s unattended`);
});

test('the title\'s compact credits (attract loop) are the same cards as the roll', () => {
  const rows = creditsRows();
  assert.ok(rows.length >= 4);
  const html = creditsCard().replace(/<[^>]+>/g, ' ');
  for (const card of CREDITS.filter((c) => c.label)) {
    assert.ok(rows.some(([label, text]) => label === card.label && text === card.lines.join(' ')), card.id);
    assert.ok(html.includes(card.label) && html.includes(card.lines[0]), card.id);
  }
});

// ---- The reel ----------------------------------------------------------------------

const tick = (reel, seconds, step = 1 / 60) => {
  let turned = 0;
  for (let t = 0; t < seconds - 1e-9 && !reel.done; t += step) if (tickReel(reel, step)) turned++;
  return turned;
};

test('a reel left alone plays every card for its hold time, then ends on time', () => {
  const reel = createReel('credits', CREDITS);
  const seen = [currentCard(reel).id];
  while (!reel.done) {
    if (tickReel(reel, 1 / 60) && !reel.done) seen.push(currentCard(reel).id);
  }
  assert.deepEqual(seen, CREDITS.map((c) => c.id), 'every card, once, in order');
  assert.equal(reel.reason, 'time');
  assert.ok(Math.abs(reel.t - 0) < 5, 'the last card was shown for its own hold');
});

test('a press inside the lockout is ignored; after it, a press turns exactly one card', () => {
  const reel = createReel('epilogue', epilogue(REPORTS.oneCredit, WORLDS[3].note));
  assert.equal(pressReel(reel, { code: 'Space' }), 'ignored', 'at t = 0 (the key that opened the reel)');
  tick(reel, REEL.lockout - 0.05);
  assert.equal(pressReel(reel, { code: 'Space' }), 'ignored', 'just inside the lockout');
  tick(reel, 0.1);
  assert.equal(pressReel(reel, { code: 'Space' }), 'next');
  assert.equal(reel.index, 1);
  assert.equal(pressReel(reel, { code: 'Space' }), 'ignored', 'the new card has its own lockout: no double press');
  assert.equal(reel.index, 1);
});

test('a held key never skips: auto-repeat presses are ignored for the whole reel, at any speed', () => {
  for (const kind of ['epilogue', 'credits']) {
    const cards = kind === 'credits' ? CREDITS : epilogue(REPORTS.oneCredit, WORLDS[3].note);
    const reel = createReel(kind, cards);
    let presses = 0;
    // Space held down: the OS repeats it ~30 times a second, for as long as the reel plays.
    while (!reel.done) {
      tickReel(reel, 1 / 30);
      assert.equal(pressReel(reel, { code: 'Space', repeat: true }), 'ignored');
      presses++;
    }
    assert.equal(reel.reason, 'time', `${kind}: only the clock ended it`);
    assert.ok(presses > 300, `${kind}: ${presses} repeats were sent`);
  }
});

test('Escape ends the whole reel; the briefing ends on any key; inert keys are never presses', () => {
  const reel = createReel('credits', CREDITS);
  tick(reel, REEL.lockout + 0.1);
  assert.equal(pressReel(reel, { code: 'Escape' }), 'end');
  assert.equal(reel.reason, 'skip');
  assert.equal(pressReel(reel, { code: 'Space' }), 'ignored', 'a finished reel takes no more presses');
  const again = createReel('credits', CREDITS);
  tick(again, REEL.lockout + 0.1);
  for (const code of ['MetaLeft', 'ControlRight', 'AltLeft', 'F11', 'Tab', 'CapsLock']) {
    assert.ok(inertKey(code), code);
    assert.equal(pressReel(again, { code }), 'ignored', code);
  }
  for (const code of ['ShiftLeft', 'Space', 'Enter', 'ArrowDown', 'KeyX', 'Pointer']) assert.ok(!inertKey(code), code);
  assert.equal(pressReel(again, { code: 'ShiftLeft' }), 'next', 'Shift is a game key like any other');
});

test('the last card ends the reel on a press, and a stalled frame never spends more than one card', () => {
  const reel = createReel('credits', CREDITS);
  for (let i = 0; i < CREDITS.length - 1; i++) {
    tick(reel, REEL.lockout + 0.05);
    assert.equal(pressReel(reel, { code: 'Enter' }), 'next');
  }
  assert.equal(reel.index, CREDITS.length - 1);
  tick(reel, REEL.lockout + 0.05);
  assert.equal(pressReel(reel, { code: 'Enter' }), 'end');
  assert.equal(reel.reason, 'press');
  const stalled = createReel('credits', CREDITS);
  tickReel(stalled, 600);
  assert.equal(stalled.index, 1, 'ten minutes in one frame still turns one card');
  assert.equal(stalled.done, false);
});
