/** Browser shell: input, lab-instrument screens, attract mode and persistence.
 * The rules live in model.mjs; the scene in render.mjs. This file never edits
 * model state except through the same actions a player has (and the explicit
 * QA fixture hook `__game.setState`, which normal play never calls).
 *
 * One control scheme (RESEARCH_BULLET_HELL.md 3.2):
 *   keyboard  arrows / WASD move in 2D, hold Shift to FOCUS, Space (or X) SOAP
 *   mouse     hold the left button over the board to steer (the syringe
 *             follows the cursor), right button = SOAP; Shift is focus
 *   touch     relative drag anywhere (1:1 on the board, capped at 30 u/s), the
 *             72 px SOAP button; touch needs no focus key
 *   fire is automatic during play; P / Esc pause, R retries the sample.
 */
import {
  RULES,
  STAGE_COUNT,
  LEVELS,
  WORLDS,
  BOSSES,
  createState,
  newRun,
  selectStage,
  startPractice,
  bossHome,
  openMenu,
  startGame,
  restartGame,
  confirmReport,
  assistAvailable,
  togglePause,
  setDifficulty,
  update,
  snapshot,
  bossStatus,
  getLevel,
  getWorld,
  chainMultiplier,
  useBomb,
  playBounds,
  pickAdjuvant,
  resampleAdjuvants,
  discardAdjuvants,
  exportRun,
  resumeRun,
  refreshKit,
  entryPower,
} from './model.mjs';
import { formulateHTML, offerSummary, rackHTML, formulationList, createDraftGate } from './formulate.mjs';
import { CARD, limitOf, legendariesIn } from './cards.mjs';
import { clamp } from './core.mjs';
import { normalizeBullet } from './bullets.mjs';
import { STEP, createClock, advanceClock, capturePositions, interpolatedView } from './clock.mjs';
import { chooseInput } from './autopilot.mjs';
import { createAudio } from './audio.mjs';
import { TOP_BAND } from './camera.mjs';
import { bossCard, bossLine, talkTime, DEFEAT_FINAL } from './personality.mjs';
import { matrix, segments, vial, medalRing, ICONS, controlsCard, controlsLine, fmtTime, pixelSprite, soapBubbles, helix, r0Dial, causeText } from './ui.mjs';

const $ = (sel) => document.querySelector(sel);
const KEYS = {
  unlocked: 'corona-invaders-v5-unlocked',
  medals: 'corona-invaders-v5-medals',
  scores: 'corona-invaders-v5-scores',
  effects: 'corona-invaders-v5-effects',
  seen: 'corona-invaders-v5-seen',
  cards: 'corona-invaders-v5-cards',
  practice: 'corona-invaders-v5-practice',
  sound: 'corona-invaders-v5-sound',
  difficulty: 'corona-invaders-v5-difficulty',
  // v6: the run in progress (build, credits, RNG, the open offer). The v5
  // keys (unlocks, medals, scores, cards seen) stay valid.
  run: 'corona-invaders-v6-run',
};
// Storage can be disabled (private mode, sandboxed iframes): play never depends on it.
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Progress still exists for this session. */
  }
}
function freshSeed() {
  const data = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(data);
  else data[0] = Math.floor(Math.random() * 0xffffffff);
  return data[0] || 1;
}

const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const touchQuery = matchMedia('(pointer: coarse)');
const store = {
  unlocked: Math.max(1, Math.min(STAGE_COUNT, Number(load(KEYS.unlocked, 1)) || 1)),
  medals: load(KEYS.medals, {}) || {},
  scores: Array.isArray(load(KEYS.scores, [])) ? load(KEYS.scores, []) : [],
  effects: load(KEYS.effects, reducedMotionQuery.matches ? 'reduced' : 'full') === 'reduced' ? 'reduced' : 'full',
  seen: new Set(load(KEYS.seen, [])),
  cards: load(KEYS.cards, {}) || {},
  practice: load(KEYS.practice, {}) || {},
  difficulty: load(KEYS.difficulty, 'normal') === 'easy' ? 'easy' : 'normal',
};
const settings = { effects: () => store.effects === 'full' && !reducedMotionQuery.matches };

const state = createState({ seed: freshSeed(), difficulty: store.difficulty, adjuvants: true });
state.unlockedStage = store.unlocked;
const cabinet = $('.cabinet'),
  stage = $('#stage'),
  canvas = $('#game'),
  overlay = $('#overlay'),
  playButton = $('#play-button');
const audio = createAudio();
// Sound is ON by default and the choice is remembered. Browsers only allow an
// AudioContext after a gesture, so the preference applies on the first press.
const soundPref = { on: load(KEYS.sound, true) !== false };
function applySoundPref() {
  if (soundPref.on && !audio.enabled) audio.setEnabled(true, { quiet: true });
}
for (const type of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(type, applySoundPref, { capture: true, passive: true });

// Keyboard state. `held` is every physically held key (keydown/keyup on the
// window, on every screen), so a direction or Shift held through a pause or a
// sample start keeps working. `locked` holds SOAP keys that were already down
// when play started or resumed: they count only after a release, so the Space
// that pressed PLAY (or its key repeat) never fires a SOAP (A3 in
// MOVEMENT_AUDIT.md). The mouse and touch pad must press again too.
const held = new Set(),
  locked = new Set();
const EDGE_KEYS = ['Space', 'KeyX'];
const active = (code) => held.has(code) && !locked.has(code);
let view = null,
  inputEnabled = true,
  pointer = null, // mouse: { x, z } board target
  mouseFocus = false,
  mouseBomb = false,
  drag = null, // touch: { id, px, pz (last finger board point), x, z (target) }
  bombPulse = 0,
  lastFrame = 0,
  runId = 1;
const ui = {
  screen: '',
  mapOpen: false,
  trayMode: 'campaign',
  controlsOpen: false,
  attract: 'title',
  attractTime: 0,
  idle: 0,
  lostTime: 0,
  demo: null,
  demoFrame: 0,
  cache: {},
  crackedUntil: 0,
  timers: {},
  layout: '',
  // FORMULATE: the focused slide, the two-step DISCARD, and the reveal.
  fSel: 0,
  fConfirm: false,
  fKey: '',
  fRevealed: true,
  fRevealTimers: [],
};
const draftGate = createDraftGate();

// ---- Small DOM helpers ---------------------------------------------------------
function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}
function setHTML(key, el, html) {
  if (ui.cache[key] === html) return;
  ui.cache[key] = html;
  el.innerHTML = html;
}
// The HUD runs every frame: write to the DOM only when a value changes (an
// unconditional style or attribute write repainted the boss bar each frame).
function setStyle(key, el, prop, value) {
  if (ui.cache[key] === value) return;
  ui.cache[key] = value;
  el.style[prop] = value;
}
function setAttr(key, el, name, value) {
  if (ui.cache[key] === value) return;
  ui.cache[key] = value;
  el.setAttribute(name, value);
}
function setClass(key, el, cls, on) {
  on = !!on;
  if (ui.cache[key] === on) return;
  ui.cache[key] = on;
  el.classList.toggle(cls, on);
}
function setHidden(key, el, hidden) {
  hidden = !!hidden;
  if (ui.cache[key] === hidden) return;
  ui.cache[key] = hidden;
  el.hidden = hidden;
}
/** One-line hints, each shown once per player (R0, CHAIN, focus). */
function hintOnce(key, text) {
  if (store.seen.has(key)) return;
  store.seen.add(key);
  save(KEYS.seen, [...store.seen]);
  flashElement('#hint', 3600, (el) => (el.textContent = text));
}
function flashElement(id, ms, apply) {
  const el = $(id);
  clearTimeout(ui.timers[id]);
  el.hidden = true;
  void el.offsetWidth;
  apply?.(el);
  el.hidden = false;
  ui.timers[id] = setTimeout(() => (el.hidden = true), ms);
}
const PICKUP = {
  mrna: ['mRNA', 'helix'],
  booster: ['BOOSTER', 'vial'],
  mask: ['MASK', 'mask'],
  soap: ['SOAP', 'bubble'],
  vial: ['VIAL', 'cross'],
};
function pickupIcon(kind) {
  const paths = {
    mrna: '<path d="M8 3c8 4 0 14 8 18M16 3C8 7 16 17 8 21"/>',
    booster: '<rect x="8" y="4" width="8" height="16" rx="2"/><path d="M10 13h4"/>',
    mask: '<path d="M3 9c6-4 12-4 18 0l-2 7c-5 3-9 3-14 0z"/>',
    soap: '<circle cx="12" cy="12" r="7"/><circle cx="9" cy="9" r="1.6"/>',
    vial: '<path d="M12 5v14M5 12h14"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind] || paths.mrna}</svg>`;
}

// ---- Persistence ---------------------------------------------------------------
const RANK = { bronze: 1, silver: 2, gold: 3 };
function recordSector(ev) {
  const prev = store.medals[ev.stage] || {};
  const better = (RANK[ev.medal] || 0) > (RANK[prev.medal] || 0) || (ev.medal === prev.medal && prev.assisted && !ev.assisted);
  store.medals[ev.stage] = {
    medal: better ? ev.medal : prev.medal,
    assisted: better ? !!ev.assisted : !!prev.assisted,
    best: Math.max(prev.best || 0, ev.sectorScore || 0),
    r0: Math.min(prev.r0 ?? 9, ev.r0 ?? 9),
  };
  save(KEYS.medals, store.medals);
}
const sessionId = freshSeed();
function recordScore() {
  if (state.score <= 0 || state.practice) return;
  const entry = store.scores.find((s) => s.run === runId && s.session === sessionId);
  const code = getLevel(state.wave).code;
  if (entry) {
    entry.score = Math.max(entry.score, state.score);
    entry.code = code;
  } else store.scores.push({ run: runId, session: sessionId, score: state.score, code });
  store.scores.sort((a, b) => b.score - a.score);
  store.scores = store.scores.slice(0, 5);
  save(KEYS.scores, store.scores);
}
function persistUnlock() {
  if (!state.practice && state.unlockedStage > store.unlocked) {
    store.unlocked = state.unlockedStage;
    save(KEYS.unlocked, store.unlocked);
  }
  state.unlockedStage = Math.max(state.unlockedStage, store.unlocked);
}
/** The run in progress, guarded and versioned (model.exportRun): written at
 * every stage entry and whenever the draft changes, so a reload can neither
 * reroll an offer nor refund a token. A missing or corrupt save hides
 * RESUME; with storage blocked the run still plays, it just can't resume. */
function saveRun() {
  const data = exportRun(state);
  if (data) save(KEYS.run, data);
}
function clearRun() {
  try {
    localStorage.removeItem(KEYS.run);
  } catch {
    /* Nothing stored. */
  }
}
function savedRun() {
  const data = load(KEYS.run, null);
  if (!data) return null;
  // Validate on a scratch state: a corrupt save hides RESUME and never throws.
  return resumeRun(createState({ adjuvants: true }), data) ? data : null;
}
function noteCard(s, ev) {
  if (!s.boss) return;
  const key = `${s.boss.type}:${ev.index}`;
  if (!store.cards[key]) {
    store.cards[key] = { seen: true, best: 0 };
    save(KEYS.cards, store.cards);
  }
}

// ---- Events: audio, renderer juice, HUD moments --------------------------------
function handleEvents(list, s, live) {
  if (!list.length) return;
  view?.events(list, s);
  for (const ev of list) {
    if (!live) continue; // the attract demo stays silent
    audio.event(ev, s);
    if (ev.type === 'wave') {
      recordSector(ev);
      persistUnlock();
      if (!ev.worldEnd && ev.stage !== STAGE_COUNT) showTally(ev);
    } else if (ev.type === 'wave-start') {
      saveRun();
      showIntro();
    } else if (ev.type === 'draft') {
      saveRun();
      openFormulate();
    } else if (ev.type === 'resample') {
      saveRun();
      openFormulate({ resampled: true });
    } else if (ev.type === 'won') clearRun();
    else if (ev.type === 'card-start') {
      noteCard(s, ev);
      flashElement('#callout', 1450, (el) => {
        el.innerHTML = `<small>${ev.cardType === 'phase' ? 'PHASE' : ev.cardType === 'survival' ? 'SURVIVE' : `MUTATION ${ev.index + 1}/${ev.count}`}</small>${ev.name}`;
        el.classList.toggle('is-card', ev.cardType !== 'phase');
      });
    } else if (ev.type === 'card-end') {
      if (ev.cardType !== 'phase' || ev.reason === 'timeout')
        flashElement('#card-result', 1600, (el) => {
          el.className = ev.neutralized ? 'good' : 'bad';
          el.innerHTML = ev.neutralized ? (ev.finale ? 'R0 &lt; 1 · CONTAINED' : `NEUTRALIZED <b>+${ev.bonus}</b>`) : ev.reason === 'timeout' ? 'TIME OUT' : 'FAILED';
        });
      if (ev.neutralized && s.boss) {
        const key = `${s.boss.type}:${ev.index}`;
        store.cards[key] = { seen: true, best: Math.max(store.cards[key]?.best || 0, ev.bonus), captured: (store.cards[key]?.captured || 0) + 1 };
        save(KEYS.cards, store.cards);
      }
      const track = $('#boss-track');
      track.classList.remove('shatter');
      void track.offsetWidth;
      track.classList.add('shatter');
    } else if (ev.type === 'escape') hintOnce('hint-r0', 'R0: THE SHARE OF VIRUSES THAT GOT AWAY. KEEP IT UNDER 1.');
    else if (ev.type === 'surge') flashElement('#callout', 1300, (el) => ((el.innerHTML = '<small>THE CHOIR SPEEDS UP</small>OUTBREAK SURGE'), el.classList.remove('is-card', 'long')));
    else if (ev.type === 'boss-enter' && !ev.mid) hintOnce('hint-focus', 'HOLD SHIFT: SLOWER MOVES, A STRONGER NEEDLE STREAM.');
    else if (ev.type === 'boss-intro') showBossCard(ev);
    // A boss defeat is the payoff: the LAB REPORT / victory overlay waits until
    // the final pop has landed (presentation only; the model's 0.6 s minimum
    // report hold is unchanged, and presses in between are dropped).
    else if (ev.type === 'boss-defeated' && !ev.mid) ui.reportAt = performance.now() + (DEFEAT_FINAL.main + 0.7) * 1000;
    if (ev.type === 'card-start' || ev.type === 'damage' || ev.type === 'boss-defeated') {
      const line = bossLine(ev, s);
      if (line) say(line, s, ev);
    }
    else if (ev.type === 'chain-tier') {
      if (ev.tier === 2) hintOnce('hint-chain', 'CHAIN: CURE AGAIN WITHIN 2 S TO MULTIPLY POINTS.');
      const chip = $('#chain');
      chip.classList.remove('bump');
      void chip.offsetWidth;
      chip.classList.add('bump');
    } else if (ev.type === 'damage') ui.crackedUntil = performance.now() + 650;
    else if (ev.type === 'extend') flashElement('#card-result', 1400, (el) => ((el.className = 'good'), (el.innerHTML = 'EXTEND · <b>+1 VIAL</b>')));
    else if (ev.type === 'practice-clear') {
      const r = ev;
      const key = r.card !== null && r.card !== undefined ? `card:${r.boss}:${r.card}` : `stage:${r.stage}`;
      const prev = store.practice[key] || {};
      store.practice[key] = { best: Math.max(prev.best || 0, r.score || 0), clears: (prev.clears || 0) + 1, neutralized: (prev.neutralized || 0) + (r.neutralized ? 1 : 0) };
      save(KEYS.practice, store.practice);
    } else if (ev.type === 'lost' || ev.type === 'won') recordScore();
  }
}

// ---- Villain personality: boss name cards and HUD taunts ---------------------
// Speech only appears when bullets were just cancelled (a card start, a lost
// vial, a defeat), and both panels are translucent (MOVEMENT_AUDIT.md E1).
let shownBoss = null;
/** A new boss object entered (a stage start from the tray clears the model's
 * own boss-enter event, so the frame loop watches the state instead). */
function noteBoss(s) {
  const b = s.boss;
  if (!b || b === shownBoss || s.phase !== 'playing' || b.state === 'defeated') return;
  shownBoss = b;
  handleEvents([{ type: 'boss-intro', boss: b.type, name: b.name, mid: b.mid }], s, true);
}
function showBossCard(ev) {
  const card = bossCard(ev.boss, ev.mid);
  if (!card) return;
  const hint = ui.bossHint;
  ui.bossHint = null;
  flashElement('#boss-card', hint ? 3200 : 2300, (el) => {
    el.classList.toggle('mid', !!ev.mid);
    el.style.setProperty('--card', BOSSES[ev.boss]?.color || '#12ce5d');
    el.classList.toggle('long', !!hint);
    el.innerHTML = `<small>${ev.mid ? 'MIDBOSS' : 'VARIANT BOSS'} · ${card.title}</small><strong>${card.name}</strong><em>${card.line}</em>${hint ? `<span class="hint">${hint}</span>` : ''}`;
  });
}
/** A boss line in the HUD, not a speech bubble (user: "not cartoon"): card
 * starts and gloats type into the VIRAL LOAD panel's taunt line, inside the
 * reserved top band; the defeat line uses the callout (the panel is gone by
 * then and every boss bullet was just cancelled). */
function say(line, s, ev) {
  const who = line.speaker === 'B' ? 'BETA' : line.speaker === 'G' ? 'GAMMA' : bossCard(s.boss?.type ?? ev.boss)?.name || '';
  if (ev.type === 'boss-defeated') {
    flashElement('#callout', 1800, (el) => {
      el.innerHTML = `<small>${who}</small>${line.text}`;
      el.classList.remove('is-card');
      el.classList.add('long');
    });
    return;
  }
  flashElement('#boss-taunt', (talkTime(line.text) + 1.6) * 1000, (el) => {
    el.className = line.mood;
    el.innerHTML = `<b>${who}</b><span>${line.text}</span>`;
  });
}

function showIntro() {
  const level = getLevel(state.wave);
  const icon = level.intro?.icon;
  const fresh = icon && !store.seen.has(level.code);
  if (level.kind === 'boss') {
    $('#intro-card').hidden = true;
    if (fresh) {
      // The first-visit hint rides on the boss's name card.
      store.seen.add(level.code);
      save(KEYS.seen, [...store.seen]);
      ui.bossHint = level.intro.text;
    }
    return;
  }
  setText($('#intro-code'), state.practice ? `PRACTICE ${level.code}` : level.code);
  setText($('#intro-name'), level.name);
  const line = $('#intro-new');
  line.hidden = !fresh;
  if (fresh) {
    line.innerHTML = `<b>NEW</b>${ICONS[icon] || ''}<span>${level.intro.text}</span>`;
    store.seen.add(level.code);
    save(KEYS.seen, [...store.seen]);
  }
  flashElement('#intro-card', fresh ? 2600 : 1450, (el) => el.classList.toggle('short', !fresh));
}
function showTally(ev) {
  const medal = ev.medal;
  const label = medal ? `★ ${medal.toUpperCase()}${ev.assisted ? ' A' : ''}` : '';
  const parts =
    ev.bonusTotal > 0
      ? [`CURED <b>${ev.bonusHits}/${ev.bonusTotal}</b>`, `BONUS <b>+${ev.bonus}</b>`]
      : [`CLEAR <b>+${ev.bonus}</b>`, `R0 <b>${ev.r0.toFixed(2)}</b>`, `GRAZE <b>${ev.grazes}</b>`];
  flashElement('#tally', 1800, (el) => {
    el.innerHTML = [...parts, `<span class="medal-label ${medal}">${label}</span>`].join('<span class="sep">·</span>');
  });
}

// ---- Screens -------------------------------------------------------------------
function currentScreen() {
  if (!inputEnabled) return '';
  if (ui.mapOpen) return 'map';
  const p = state.paused ? 'paused' : state.phase;
  if (p === 'title') return ui.controlsOpen ? 'controls' : ui.attract === 'title' ? 'title' : ui.attract;
  if (p === 'paused') return ui.controlsOpen ? 'controls' : 'pause';
  if (p === 'lost') return 'lost';
  if (p === 'draft') return 'formulate';
  const shown = !(performance.now() < (ui.reportAt || 0));
  if (p === 'won') return shown ? (state.practice ? 'practice' : 'won') : '';
  if (p === 'transition' && state.transitionHold) return shown ? 'report' : '';
  return '';
}
const ROWS = ['play-button', 'resume-button', 'assist-button', 'easy-button', 'retry-button', 'menu-button', 'difficulty-button', 'sound-button', 'effects-button', 'controls-button', 'back-button'];
const ATTRACT = ['title', 'demo', 'scores', 'attract-controls'];
function configure(screen) {
  const assist = assistAvailable(state);
  const visible =
    {
      title: ['play-button', ...(savedRun() ? ['resume-button'] : [])],
      demo: ['play-button'],
      scores: ['play-button'],
      'attract-controls': ['play-button'],
      pause: ['play-button', 'retry-button', 'menu-button', 'difficulty-button', 'sound-button', 'effects-button', 'controls-button'],
      controls: ['back-button'],
      lost: ['play-button', ...(assist ? ['assist-button', ...(state.difficulty === 'normal' ? ['easy-button'] : [])] : []), 'menu-button'],
      won: ['play-button', 'menu-button'],
      practice: ['play-button', 'menu-button'],
      report: ['play-button'],
    }[screen] || [];
  for (const id of ROWS) $('#' + id).hidden = !visible.includes(id);
  overlay.dataset.screen = screen;
  $('#card').hidden = screen === 'map';
  $('#map').hidden = screen !== 'map';
  $('#attract-tag').hidden = screen !== 'demo';
  const level = getLevel(state.wave);
  const heading = $('#overlay-heading'),
    body = $('#overlay-body'),
    tag = $('#card-tag');
  heading.classList.toggle('logo', screen === 'title' || screen === 'demo');
  playButton.classList.toggle('blink', ATTRACT.includes(screen));
  tag.textContent = '';
  body.innerHTML = '';
  const touch = touchQuery.matches;
  const press = touch ? 'TAP' : 'SPACE';
  if (ATTRACT.includes(screen)) {
    playButton.textContent = touch ? 'TAP TO START' : 'PRESS SPACE';
    // First visit: offer Easy beside the start (never blocking it).
    const firstVisit = load(KEYS.difficulty, null) === null;
    $('#easy-start').hidden = !(firstVisit && screen === 'title');
    $('#title-controls').innerHTML = controlsLine(touch);
    if (screen === 'title' || screen === 'demo')
      heading.innerHTML = `<span class="logo-row">${pixelSprite('corona', { cls: 'logo-virus' })}${matrix('CORONA')}${pixelSprite('corona', { cls: 'logo-virus' })}</span>${matrix('INVADERS')}<span class="logo-sub">${pixelSprite('syringe', { color: '#7fe8ff', cls: 'logo-syringe' })}<em>A VACCINE BULLET HELL</em></span>`;
    if (screen === 'scores') {
      heading.innerHTML = matrix('TOP CULTURES');
      body.innerHTML = store.scores.length
        ? `<div class="scores">${store.scores.map((s, i) => `<div><span>${i + 1}. ${s.code}</span>${segments(String(s.score).padStart(7, '0'))}</div>`).join('')}</div>`
        : '<div class="scores"><div><span>NO CULTURES YET</span></div></div>';
    }
    if (screen === 'attract-controls') {
      heading.innerHTML = matrix('CONTROLS');
      body.innerHTML = controlsCard(touch);
    }
    const best = store.scores[0]?.score || 0;
    $('#hiscore').innerHTML = best ? `HI ${segments(String(best).padStart(7, '0'))}` : '';
  } else if (screen === 'pause') {
    heading.innerHTML = matrix('ON HOLD');
    tag.textContent = `SPECIMEN ${level.code}${state.practice ? ' · PRACTICE' : ''}`;
    // The whole formulation, with text (RESEARCH_CARDS §6.2).
    body.innerHTML = state.run ? formulationList(state.run.deck) : state.kit?.scale > 1 ? `<p class="formulation empty">STANDARD ISSUE ×${state.kit.scale.toFixed(2)} (PRACTICE: NO ADJUVANTS)</p>` : '';
    playButton.textContent = 'RESUME';
    $('#retry-button').innerHTML = `RETRY SAMPLE <span class="hint">R</span>`;
    $('#menu-button').innerHTML = `SPECIMEN TRAY <span class="hint">MAP</span>`;
  } else if (screen === 'controls') {
    heading.innerHTML = matrix('CONTROLS');
    body.innerHTML = controlsCard(touch);
  } else if (screen === 'lost') {
    heading.innerHTML = matrix('CONTAINMENT') + matrix('LOST');
    tag.textContent = `SAMPLE ${level.code}${state.practice ? ' · PRACTICE' : ''}`;
    const cause = state.lastCause || { by: 'VIRUS', what: 'DROPLET', at: state.waveElapsed };
    body.innerHTML = `<div class="cause">${pixelSprite('corona', { color: '#ff4fa3' })}<strong>${causeText(cause)}</strong><span>${level.code} ${level.name} · ${fmtTime(cause.at ?? state.waveElapsed)}</span></div><div class="countdown-row"><span id="countdown-text">CONTINUE? 9</span><span>${press} TO RETRY</span></div><span class="countdown"><i></i></span>`;
    playButton.innerHTML = `RETRY SAMPLE <span class="hint">${press}</span>`;
    $('#assist-button').innerHTML = `+1 VIAL <span class="hint">MEDAL A</span>`;
    $('#easy-button').innerHTML = `SWITCH TO EASY <span class="hint">5 VIALS · AUTO-SOAP</span>`;
    $('#menu-button').innerHTML = `SPECIMEN TRAY <span class="hint">↓</span>`;
    ui.lostTime = 0;
    // Keys wait 1 s and a fresh press (a held SOAP key must not retry), and
    // after three losses on Normal, Easy becomes the default choice.
    ui.lockUntil = performance.now() + 1000;
    const easyFirst = assist && state.difficulty === 'normal';
    $('#easy-button').classList.toggle('primary', easyFirst);
    playButton.classList.toggle('primary', !easyFirst);
    playButton.classList.add('locked');
    setTimeout(() => playButton.classList.remove('locked'), 1000);
  } else if (screen === 'won') {
    heading.innerHTML = matrix('CONTAINED');
    tag.textContent = 'R0 < 1 · CAMPAIGN COMPLETE';
    const counts = { gold: 0, silver: 0, bronze: 0 };
    for (const r of Object.values(state.medals)) counts[r.medal]++;
    // FINAL REPORT: the build in line order, and PLACEBO GROUP for a run
    // that discarded every draft.
    const run = state.run;
    const placebo = run && run.drafts > 0 && run.discards === run.drafts;
    body.innerHTML = `<div class="report">${Object.entries(counts)
      .map(([m, n]) => `<div>${medalRing(m)}<span>${m.toUpperCase()}</span><b>${n}</b><span></span></div>`)
      .join('')}<div class="total"><span>SCORE</span>${segments(String(state.score).padStart(7, '0'))}</div></div>${run ? `${placebo ? '<p class="badge">PLACEBO GROUP · NO ADJUVANTS TAKEN</p>' : ''}${formulationList(run.deck)}` : ''}`;
    playButton.textContent = 'NEW CAMPAIGN';
    $('#menu-button').innerHTML = `SPECIMEN TRAY <span class="hint">MAP</span>`;
  } else if (screen === 'practice') {
    const r = state.practice?.result || {};
    heading.innerHTML = matrix(r.cardName ? (r.neutralized ? 'NEUTRALIZED' : 'CARD OVER') : 'CLEAR');
    tag.textContent = `PRACTICE ${r.code || level.code}${r.cardName ? ' · ' + r.cardName : ''}`;
    body.innerHTML = `<div class="report"><div><b>TIME</b><span>${fmtTime(r.time || 0)}</span><span></span><span></span></div><div><b>SCORE</b><span>${r.score || 0}</span><span></span><span></span></div></div>`;
    playButton.innerHTML = `AGAIN <span class="hint">${press} / R</span>`;
    $('#menu-button').innerHTML = `SPECIMEN TRAY <span class="hint">MAP</span>`;
  } else if (screen === 'report') {
    const world = WORLDS[level.world - 1];
    heading.innerHTML = matrix('LAB REPORT');
    tag.textContent = `WORLD ${world.id} · ${world.name}`;
    const rows = LEVELS.filter((l) => l.world === world.id && l.kind !== 'bonus')
      .map((l) => {
        const r = state.medals[l.id];
        return `<div><b>${l.code}</b><span>${l.name}</span><span>${r ? `R0 ${r.r0.toFixed(2)}` : '—'}</span>${medalRing(r?.medal, r?.assisted)}</div>`;
      })
      .join('');
    body.innerHTML = `<div class="report">${rows}<div class="total"><span>SCORE</span>${segments(String(state.score).padStart(7, '0'))}</div></div>`;
    playButton.innerHTML = `CONTINUE <span class="hint">${press}</span>`;
  } else if (screen === 'map') renderMap();
  syncSoundButtons();
  syncEffectsButton();
  syncDifficultyButtons();
  focusPrimary(screen);
}
function focusPrimary(screen) {
  if (!screen || screen === 'demo') return;
  if (screen !== 'lost') {
    playButton.classList.add('primary');
    $('#easy-button').classList.remove('primary');
  }
  const target = screen === 'lost' && $('#easy-button').classList.contains('primary') ? $('#easy-button') :
    screen === 'map'
      ? $(`#tray-rows [data-stage="${Math.min(state.wave, state.unlockedStage)}"]`) || $('#tray-rows button:not(:disabled)') || $('#map-back')
      : screen === 'controls'
        ? $('#back-button')
        : playButton;
  target?.focus({ preventScroll: true });
}
function syncSoundButtons() {
  const on = soundPref.on;
  $('#sound-button').setAttribute('aria-pressed', String(on));
  $('#sound-button').innerHTML = `SOUND <b>${on ? 'ON' : 'OFF'}</b>`;
  $('#title-sound').setAttribute('aria-pressed', String(on));
  $('#title-sound').setAttribute('aria-label', on ? 'Disable sound' : 'Enable sound');
}
function syncEffectsButton() {
  const forced = reducedMotionQuery.matches;
  $('#effects-button').innerHTML = `EFFECTS <b>${settings.effects() ? 'FULL' : 'REDUCED'}</b>${forced ? '<span class="hint">SYSTEM</span>' : ''}`;
}
function syncDifficultyButtons() {
  const d = store.difficulty.toUpperCase();
  $('#difficulty-button').innerHTML = `DIFFICULTY <b>${d}</b><span class="hint">NEXT START</span>`;
  setText($('#title-difficulty-label'), d);
  $('#title-difficulty').setAttribute('aria-label', `Difficulty: ${store.difficulty}`);
}
function bossCardList() {
  const out = [];
  for (const [type, def] of Object.entries(BOSSES)) {
    const home = bossHome(type);
    def.cards.forEach((c, i) => out.push({ type, home, index: i, card: c, name: def.name, key: `${type}:${i}` }));
  }
  return out.sort((a, b) => a.home - b.home || a.index - b.index);
}
function renderMap() {
  setHTML('map-heading', $('#map-heading'), matrix('SPECIMEN TRAY'));
  for (const tab of document.querySelectorAll('#tray-tabs [data-mode]')) tab.setAttribute('aria-selected', String(tab.dataset.mode === ui.trayMode));
  const mode = ui.trayMode;
  setText(
    $('#tray-note'),
    mode === 'campaign' ? 'START ANY UNLOCKED SAMPLE. MEDALS: GOLD = NO VIAL LOST AND R0 < 1.' : mode === 'practice' ? 'PRACTICE A CLEARED SAMPLE: 1 VIAL, R RESTARTS AT ONCE.' : 'REPLAY ANY MUTATION CARD YOU HAVE SEEN.',
  );
  let html = '';
  if (mode === 'lab') {
    const byBoss = new Map();
    for (const c of bossCardList()) (byBoss.get(c.type) || byBoss.set(c.type, []).get(c.type)).push(c);
    html = [...byBoss.values()]
      .map((list) => {
        const level = getLevel(list[0].home);
        const chips = list
          .map((c) => {
            const seen = store.cards[c.key];
            const best = store.practice[`card:${c.type}:${c.index}`];
            return `<button class="chip ${seen?.captured ? 'captured' : ''}" type="button" data-card="${c.key}" ${seen ? '' : 'disabled'} aria-label="${c.name} ${c.card.name}${seen ? '' : ' sealed'}"><b>${seen ? c.card.name : '⊘ ? ? ?'}</b><small>${c.card.type === 'phase' ? 'PHASE' : c.card.type === 'survival' ? 'SURVIVE' : 'MUTATION'}${best?.neutralized ? ` · ★${best.neutralized}` : ''}</small></button>`;
          })
          .join('');
        return `<div class="lab-row"><div class="tray-label"><span>${level.code} ${list[0].name}</span></div><div class="chips">${chips}</div></div>`;
      })
      .join('');
  } else {
    html = WORLDS.map((w) => {
      const levels = LEVELS.filter((l) => l.world === w.id);
      const dish = (l, mini = false) => {
        const m = store.medals[l.id] || {};
        const locked = mode === 'practice' ? !m.medal : l.id > state.unlockedStage;
        const best = m.best ? (m.best >= 10000 ? `${Math.floor(m.best / 1000)}K` : String(m.best)) : '';
        const attr = mode === 'practice' ? `data-practice="${l.id}"` : `data-stage="${l.id}"`;
        return `<button class="dish ${mini ? 'mini' : ''} ${m.medal || ''} ${l.id === state.wave && mode === 'campaign' ? 'current' : ''}" type="button" ${attr} ${
          locked ? `disabled aria-label="${l.code} sealed"` : `aria-label="${l.code} ${l.name}${m.medal ? ', ' + m.medal + ' medal' : ''}"`
        }>${locked ? '' : pixelSprite('corona', { cls: 'dish-virus' })}<b>${locked ? '⊘' : l.code}</b>${!mini && best ? `<small>${best}</small>` : ''}${locked ? '' : medalRing(m.medal, m.assisted)}</button>`;
      };
      const bonus = levels.filter((l) => l.kind === 'bonus');
      return `<div class="tray-world"><div class="tray-label"><span>W${w.id} ${w.name}${w.twist ? ` · ${w.twist.toUpperCase()}` : ''}</span>${bonus.map((l) => dish(l, true)).join('')}</div><div class="dishes">${levels
        .filter((l) => l.kind !== 'bonus')
        .map((l) => dish(l))
        .join('')}</div></div>`;
    }).join('');
  }
  $('#tray-rows').innerHTML = html;
  $('#tray-rows').dataset.mode = mode;
}

// ---- Per-frame HUD -------------------------------------------------------------
const TWIST_TEXT = {
  breath: { warn: 'BREATH · INHALE…', inhale: 'INHALE · BULLETS SLOW', exhale: 'EXHALE · BULLETS RUSH', calm: 'BREATH' },
  current: { warn: 'CURRENT FLIPS', flow: 'CURRENT' },
  rush: { warn: 'BLOOD RUSH FLIPS', flow: 'BLOOD RUSH' },
};
function syncHUD(s) {
  const phaseAttr = ui.screen === 'demo' ? 'demo' : s.paused ? 'paused' : s.phase;
  if (ui.cache.phaseAttr !== phaseAttr) cabinet.dataset.phase = ui.cache.phaseAttr = phaseAttr;
  setClass('held', stage, 'held', !!s.paused || (s.phase === 'transition' && s.transitionHold && !(performance.now() < (ui.reportAt || 0))));
  setHTML('score', $('#score'), segments(String(s.score).padStart(7, '0')));
  setAttr('scoreAria', $('#score'), 'aria-label', `Score ${s.score}`);
  const hi = Math.max(store.scores[0]?.score || 0, s.score);
  setHTML('hi', $('#hud-hi'), `HI ${segments(String(hi).padStart(7, '0'))}`);
  setHTML('graze', $('#graze'), segments(String(s.grazes).padStart(4, '0')));
  setAttr('grazeAria', $('#graze'), 'aria-label', `Graze ${s.grazes}`);
  const r0 = s.r0 || 0;
  setHTML('r0', $('#r0'), r0Dial(r0));
  setText($('#r0-value'), r0.toFixed(2));
  setClass('r0over', $('#r0-value'), 'over', r0 >= 1);
  const mult = chainMultiplier(s.chain.count);
  const chip = $('#chain');
  setHidden('chip', chip, mult < 2 || !['playing', 'transition'].includes(s.phase));
  setText(chip, `CHAIN ×${mult}`);
  const slots = Math.max(3, s.health);
  const cracked = performance.now() < ui.crackedUntil;
  const vials = Array.from({ length: slots }, (_, i) => vial(i < s.health ? 'full' : cracked && i === s.health ? 'cracked' : 'empty')).join('');
  setHTML('vials', $('#lives'), vials);
  setAttr('livesAria', $('#lives'), 'aria-label', `${s.health} doses`);
  setHTML('soap', $('#soap'), soapBubbles(s.ship.bombs, (s.ship.grazeProgress || 0) / RULES.grazePerBomb));
  setAttr('soapAria', $('#soap'), 'aria-label', `${s.ship.bombs} soap bursts`);
  setHTML('power', $('#power'), `${helix(s.ship.power)}<span>L${s.ship.power}</span>`);
  // The owned formulation: chips by line, legendaries on top, potency vs the
  // titer limit; portrait shows only the legendary chips.
  const deck = s.run?.deck ?? [];
  const rackKey = `${ui.layout}|${deck.map((d) => d.id).join(',')}|${s.kit?.potency?.toFixed(2)}|${s.run?.titer}|${s.kit?.scale}`;
  if (ui.cache.rackKey !== rackKey) {
    ui.cache.rackKey = rackKey;
    const rack = $('#rack');
    rack.innerHTML = s.run
      ? rackHTML(deck, { limit: limitOf(s.run.titer), potency: s.kit.potency, compact: ui.layout === 'strip' })
      : s.kit?.scale > 1
        ? `<span class="potency">STANDARD ISSUE <b>×${s.kit.scale.toFixed(2)}</b></span>`
        : '';
    rack.setAttribute('aria-label', s.run ? `Adjuvants: ${deck.length}, ${legendariesIn(deck)} legendary` : 'No adjuvants');
  }
  setClass('coatOn', $('#lives'), 'coated', (s.ship.coat || 0) > 0);
  setAttr('powerAria', $('#power'), 'aria-label', `Power ${s.ship.power} of 4`);
  const level = getLevel(s.wave);
  setText($('#sector-code'), s.practice ? `${level.code} P` : level.code);
  setText($('#sector-world'), getWorld(s.wave).name);
  setAttr('pauseAria', $('#pause-button'), 'aria-label', s.paused ? 'Resume game' : 'Pause game');
  setText($('#touch-bomb-count'), String(s.ship.bombs));
  setClass('bombEmpty', $('#touch-bomb'), 'empty', s.ship.bombs <= 0);
  // Twist indicator: BREATH / CURRENT with its 1-2 s warning.
  const tw = s.twist || {};
  const tt = TWIST_TEXT[tw.kind]?.[tw.stage];
  const twistTag = $('#twist-tag');
  setHidden('twist', twistTag, !tt || s.phase !== 'playing');
  if (tt) {
    setText(twistTag, (tw.kind === 'current' || tw.kind === 'rush' ? (tw.dir > 0 ? '→ ' : '← ') : '') + tt);
    setClass('twistWarn', twistTag, 'warn', !!tw.warn);
  }

  const boss = bossStatus(s),
    panel = $('#boss-status');
  // Toggled by opacity, not display: the bar stays rasterized, so showing it
  // never costs a first paint mid-play (a measured stall at boss starts).
  const bossOff = !boss || s.phase !== 'playing';
  setClass('bossPanel', panel, 'off', bossOff);
  setAttr('bossAria', panel, 'aria-hidden', String(bossOff));
  if (boss) {
    const percent = (boss.hp / boss.maxHp) * 100;
    setStyle('bossW', $('#boss-health'), 'width', `${percent}%`);
    setStyle('bossLag', $('#boss-lag'), 'transform', `scaleX(${(percent / 100).toFixed(4)})`);
    setText($('#boss-label'), boss.name);
    setText($('.boss-tag'), boss.mid ? 'MIDBOSS LOAD' : `${level.code} VIRAL LOAD`);
    setText($('#boss-numeric'), `${boss.hp} / ${boss.maxHp}`);
    // Pips: one diamond per card still to clear.
    setText($('#boss-pips'), Array.from({ length: boss.phases }, (_, i) => (i < boss.phase - 1 ? '◇' : '◆')).join(''));
    setText($('#boss-phase'), `PHASE ${boss.phase}/${boss.phases} · ${boss.attack}`);
    const kind = boss.cardType === 'phase' ? 'PHASE' : boss.cardType === 'survival' ? 'SURVIVE' : `MUTATION ${boss.cardIndex + 1}/${boss.phases}`;
    setText($('#card-kind'), kind);
    setText($('#card-name'), boss.attack + (boss.capture || boss.cardType === 'phase' ? '' : ' · NO BONUS'));
    setHTML('timer', $('#card-timer'), segments(String(Math.ceil(boss.timeLeft)).padStart(2, '0')));
    setClass('tapeCard', $('#card-tape'), 'is-card', boss.cardType !== 'phase');
    setHTML('notches', $('#boss-notches'), boss.notches.map((f) => `<i style="left:calc(${(f * 100).toFixed(2)}% - 1px)"></i>`).join(''));
    setHTML('parts', $('#boss-parts'), boss.parts.map((p) => `<span class="${p.alive ? '' : 'dead'}" title="${p.label}"><em>${p.label.toUpperCase()}</em><i style="width:${((p.hp / p.maxHp) * 100).toFixed(1)}%"></i></span>`).join(''));
    const track = $('#boss-track');
    setClass('trackExposed', track, 'exposed', boss.state === 'cardIntro');
    setAttr('trackNow', track, 'aria-valuenow', String(boss.hp));
    setAttr('trackMax', track, 'aria-valuemax', String(boss.maxHp));
    setAttr('trackLabel', track, 'aria-label', `${boss.name} viral load`);
    setAttr('trackText', track, 'aria-valuetext', `${boss.hp} of ${boss.maxHp}, card ${boss.phase} of ${boss.phases}: ${boss.attack}`);
  }
  const effects = Object.entries(s.ship.powerups).filter(([, t]) => t > 0);
  const powerups = $('#powerups');
  setHidden('powerups', powerups, effects.length === 0);
  setHTML('powerups', powerups, effects.map(([kind, t]) => `<span>${pickupIcon(kind)}${PICKUP[kind]?.[0] || kind.toUpperCase()} <b>${Math.ceil(t)}</b></span>`).join(''));
}

function syncLayout() {
  // Landscape: the board is a centred column and the instruments sit in the
  // side columns. Portrait / small: a top strip and a thumb zone below.
  const w = cabinet.clientWidth,
    h = cabinet.clientHeight;
  const layout = w / Math.max(1, h) >= 1.2 && w >= 720 ? 'side' : 'strip';
  if (layout !== ui.layout) {
    ui.layout = layout;
    cabinet.dataset.layout = layout;
    view?.setTopBand(layout === 'side' ? TOP_BAND.side : TOP_BAND.strip);
  }
  if (view && layout === 'side') {
    const r = view.info(state).fieldRect;
    cabinet.style.setProperty('--field-left', `${Math.round(r.left)}px`);
    cabinet.style.setProperty('--field-right', `${Math.round(stage.clientWidth - r.right)}px`);
    cabinet.style.setProperty('--field-width', `${Math.round(r.right - r.left)}px`);
  }
}

function syncUI() {
  persistUnlock();
  const screen = currentScreen();
  overlay.hidden = !screen || screen === 'formulate';
  const fEl = $('#formulate');
  if (fEl.hidden !== (screen !== 'formulate')) fEl.hidden = screen !== 'formulate';
  if (screen === 'formulate' && ui.fKey !== offerKey()) openFormulate();
  if (screen !== ui.screen) {
    // The report appears after the defeat payoff: a key still held from the
    // fight must be released before it can release the report.
    if (screen === 'report' && ui.reportAt) lockHeld();
    ui.screen = screen;
    if (screen && screen !== 'formulate') configure(screen);
    if (screen === 'formulate') $('#formulate-panel').querySelector(`.slide[data-slot="${ui.fSel}"]`)?.focus({ preventScroll: true });
  }
  syncHUD(ui.screen === 'demo' && ui.demo ? ui.demo : state);
}

// ---- Actions -------------------------------------------------------------------
function wake() {
  ui.idle = 0;
  if (ui.attract !== 'title') {
    leaveDemo();
    ui.attract = 'title';
  }
}
function focusGame() {
  canvas.focus({ preventScroll: true });
}
/** Blur or a hidden tab: keyups may never arrive, so forget everything. */
function releaseAll() {
  held.clear();
  locked.clear();
  lockHeld();
}
/** Play starts or resumes: held SOAP keys must be released first; held
 * movement and Shift stay live; pointer steering needs a fresh press. */
function lockHeld() {
  for (const k of EDGE_KEYS) if (held.has(k)) locked.add(k);
  pointer = null;
  mouseFocus = mouseBomb = false;
  drag = null;
  bombPulse = 0;
}
function resume() {
  togglePause(state);
  if (!state.paused) lockHeld();
}
function beginPlay(action) {
  wake();
  lockHeld();
  audio.resume();
  ui.mapOpen = ui.controlsOpen = false;
  action();
  if (state.phase === 'playing') showIntro();
  syncUI();
  focusGame();
}
function freshCampaign() {
  if (load(KEYS.difficulty, null) === null) save(KEYS.difficulty, store.difficulty);
  runId++;
  state.difficulty = store.difficulty;
  // A new run starts empty: the stored build is replaced at its first entry.
  clearRun();
  newRun(state, freshSeed());
}
function resumeSaved() {
  const data = savedRun();
  if (!data) return false;
  runId++;
  beginPlay(() => {
    resumeRun(state, data);
    persistUnlock();
  });
  return true;
}
function primaryAction() {
  if (!inputEnabled) return;
  const screen = currentScreen();
  if (screen === 'pause') {
    resume();
    syncUI();
    focusGame();
  } else if (screen === 'lost' || screen === 'practice') beginPlay(() => restartGame(state));
  else if (screen === 'won') beginPlay(freshCampaign);
  else if (screen === 'report') {
    confirmReport(state);
    syncUI();
    focusGame();
  } else if (ATTRACT.includes(screen)) beginPlay(freshCampaign);
}
function openMap() {
  wake();
  lockHeld();
  ui.mapReturn = null;
  if (state.phase !== 'title') {
    if (state.phase === 'lost') recordScore();
    // Remember what opened the tray so BACK returns there with progress intact.
    ui.mapReturn = snapshot(state);
    openMenu(state);
  }
  ui.controlsOpen = false;
  ui.mapOpen = true;
  ui.screen = '';
  syncUI();
}
function closeMap() {
  ui.mapOpen = false;
  if (ui.mapReturn) {
    Object.assign(state, ui.mapReturn);
    if (['playing', 'transition'].includes(state.phase)) state.paused = true;
    ui.mapReturn = null;
  }
  syncUI();
}
function retrySector() {
  beginPlay(() => restartGame(state));
}
function toggleSound() {
  soundPref.on = !soundPref.on;
  save(KEYS.sound, soundPref.on);
  audio.setEnabled(soundPref.on);
  syncSoundButtons();
}
function toggleDifficulty() {
  store.difficulty = store.difficulty === 'normal' ? 'easy' : 'normal';
  save(KEYS.difficulty, store.difficulty);
  if (state.phase === 'title' || state.paused) setDifficulty(state, store.difficulty);
  syncDifficultyButtons();
}

playButton.addEventListener('click', primaryAction);
$('#resume-button').addEventListener('click', resumeSaved);
$('#retry-button').addEventListener('click', retrySector);
$('#assist-button').addEventListener('click', () => beginPlay(() => restartGame(state, { assist: true })));
$('#easy-button').addEventListener('click', () => {
  store.difficulty = 'easy';
  save(KEYS.difficulty, 'easy');
  beginPlay(() => restartGame(state, { easy: true }));
});
$('#menu-button').addEventListener('click', openMap);
$('#map-button').addEventListener('click', openMap);
$('#map-back').addEventListener('click', closeMap);
$('#sound-button').addEventListener('click', toggleSound);
$('#title-sound').addEventListener('click', toggleSound);
$('#difficulty-button').addEventListener('click', toggleDifficulty);
$('#title-difficulty').addEventListener('click', toggleDifficulty);
$('#effects-button').addEventListener('click', () => {
  store.effects = store.effects === 'full' ? 'reduced' : 'full';
  save(KEYS.effects, store.effects);
  syncEffectsButton();
});
$('#controls-button').addEventListener('click', () => {
  ui.controlsOpen = true;
  syncUI();
});
$('#back-button').addEventListener('click', () => {
  ui.controlsOpen = false;
  syncUI();
});
$('#easy-start').addEventListener('click', () => {
  store.difficulty = 'easy';
  save(KEYS.difficulty, 'easy');
  syncDifficultyButtons();
  beginPlay(freshCampaign);
});
$('#tray-tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-mode]');
  if (!tab) return;
  ui.trayMode = tab.dataset.mode;
  renderMap();
});
$('#tray-rows').addEventListener('click', (event) => {
  const el = event.target.closest('[data-stage],[data-practice],[data-card]');
  if (!el || el.disabled) return;
  ui.mapReturn = null;
  state.difficulty = store.difficulty;
  if (el.dataset.stage)
    beginPlay(() => {
      runId++;
      selectStage(state, Number(el.dataset.stage));
    });
  else if (el.dataset.practice) beginPlay(() => startPractice(state, Number(el.dataset.practice)));
  else {
    const [type, index] = el.dataset.card.split(':');
    beginPlay(() => startPractice(state, bossHome(type), { boss: type, card: Number(index) }));
  }
});
$('#pause-button').addEventListener('click', () => {
  if (state.phase === 'title') return;
  if (state.paused) resume();
  else togglePause(state);
  audio.setSuspended(!!state.paused);
  ui.controlsOpen = false;
  syncUI();
  if (!state.paused) focusGame();
});

// ---- FORMULATE: the adjuvant draft between stages --------------------------------
// Nothing simulates while it is open (the model's 'draft' phase). One input
// scheme per device, as in play: keys (arrows / A-D / 1-3, Enter or Space to
// INJECT, R resample, S twice to discard), mouse (hover or click a slide, then
// INJECT or double-click) and touch (tap a slide, tap INJECT). Every press
// waits 0.5 s after the screen opens and must be fresh (formulate.mjs gate).
const fPanel = $('#formulate-panel');
const offerKey = () => (state.run?.offer ? `${state.wave}:${state.run.drafts}:${state.run.resamples}:${state.run.offer.ids.join(',')}` : '');
function draftKitCtx() {
  return { power: entryPower(Math.min(STAGE_COUNT, state.wave + 1)), difficulty: state.difficulty, titer: state.run.titer, stage: state.wave + 1 };
}
function openFormulate({ resampled = false } = {}) {
  const run = state.run;
  if (!run?.offer) return;
  for (const t of ui.fRevealTimers) clearTimeout(t);
  ui.fRevealTimers = [];
  ui.fKey = offerKey();
  ui.fSel = Math.min(ui.fSel, run.offer.ids.length - 1);
  if (!resampled) ui.fSel = 0;
  ui.fConfirm = false;
  const now = performance.now();
  draftGate.open(now, [...held].filter((k) => ['Space', 'KeyX', 'Enter', 'KeyR', 'KeyS'].includes(k)));
  renderFormulate();
  const offer = run.offer;
  const motion = settings.effects();
  fPanel.dataset.motion = motion ? 'full' : 'reduced';
  $('#formulate-live').textContent = offerSummary(run);
  if (!resampled) audio.event({ type: 'draft' }, state);
  // The reveal: slides rise 90 ms apart, then flip left to right; a
  // legendary glows 0.5 s before its flip (the centrifuge spin-up). Any press
  // after 0.4 s completes it. Reduced motion: instant, one sound per tier.
  ui.fRevealed = !motion;
  const flips = [];
  let t = 260;
  offer.tiers.forEach((tier, i) => {
    if (tier === 'legendary') t += 500;
    flips.push(t);
    t += 120;
  });
  const slides = [...fPanel.querySelectorAll('.slide')];
  offer.tiers.forEach((tier, i) => {
    const el = slides[i];
    if (!motion) {
      el.classList.add('shown', 'revealed');
      return;
    }
    el.classList.add('rising');
    ui.fRevealTimers.push(setTimeout(() => el.classList.add('shown'), i * 90));
    if (tier === 'legendary') {
      ui.fRevealTimers.push(
        setTimeout(() => {
          el.classList.add('charging');
          audio.event({ type: 'legendary-riser' }, state);
        }, flips[i] - 500),
      );
    }
    ui.fRevealTimers.push(
      setTimeout(() => {
        el.classList.add('revealed');
        el.classList.remove('charging');
        audio.event({ type: 'reveal', tier, slot: i }, state);
        if (tier === 'legendary') view?.flash?.('legendary');
      }, flips[i]),
    );
  });
  if (motion) ui.fRevealTimers.push(setTimeout(() => (ui.fRevealed = true), flips.at(-1) + 200));
  else for (const tier of [...new Set(offer.tiers)]) audio.event({ type: 'reveal', tier, slot: 1 }, state);
}
function skipReveal() {
  if (ui.fRevealed) return false;
  for (const tm of ui.fRevealTimers) clearTimeout(tm);
  ui.fRevealTimers = [];
  for (const el of fPanel.querySelectorAll('.slide')) {
    el.classList.add('shown', 'revealed');
    el.classList.remove('charging', 'rising');
  }
  ui.fRevealed = true;
  return true;
}
function renderFormulate() {
  const run = state.run;
  const level = getLevel(state.wave);
  const boss = level.kind === 'boss' && run.offer.boosted;
  const def = boss ? BOSSES[level.boss] : null;
  const capturable = def ? def.cards.filter((c) => c.type !== 'phase').length : 0;
  const sequenced = boss ? `${Math.round((run.lastShare ?? 0) * capturable)}/${capturable}` : '';
  fPanel.innerHTML = formulateHTML({
    run,
    stageCode: level.code,
    boss,
    bossName: def?.name,
    sequenced,
    cards: { potency: state.kit.potency },
    ctx: draftKitCtx(),
    selected: ui.fSel,
    touch: touchQuery.matches,
    confirmDiscard: ui.fConfirm,
  });
}
function selectSlide(i, { focus = true } = {}) {
  const n = state.run?.offer?.ids.length ?? 0;
  if (!n) return;
  ui.fSel = Math.max(0, Math.min(n - 1, i));
  for (const el of fPanel.querySelectorAll('.slide')) el.classList.toggle('selected', Number(el.dataset.slot) === ui.fSel);
  const inject = fPanel.querySelector('[data-act="inject"]');
  if (inject) inject.disabled = false;
  if (focus) fPanel.querySelector(`.slide[data-slot="${ui.fSel}"]`)?.focus({ preventScroll: true });
}
function setConfirm(on) {
  ui.fConfirm = on;
  const b = fPanel.querySelector('[data-act="discard"]');
  if (!b) return;
  b.classList.toggle('confirm', on);
  b.innerHTML = `${touchQuery.matches ? '' : '<kbd>S</kbd> '}${on ? 'CONFIRM DISCARD' : 'DISCARD'} <b>+1 SOAP</b>`;
}
/** After a pick or a discard: the model began the next stage; its events
 * (adjuvant / discard, wave-start) are handled here, outside update(). */
function leaveFormulate() {
  for (const t of ui.fRevealTimers) clearTimeout(t);
  ui.fRevealTimers = [];
  ui.fKey = '';
  handleEvents(state.events, state, true);
  state.events = [];
  lockHeld();
  syncUI();
  focusGame();
}
function doPick(i = ui.fSel) {
  if (!pickAdjuvant(state, i)) return false;
  leaveFormulate();
  return true;
}
function doResample() {
  if (!resampleAdjuvants(state)) return false;
  audio.event({ type: 'resample' }, state);
  const ev = state.events.find((e) => e.type === 'resample');
  state.events = [];
  if (ev) handleEvents([ev], state, false);
  saveRun();
  openFormulate({ resampled: true });
  return true;
}
function doDiscard() {
  if (!ui.fConfirm) return setConfirm(true);
  if (discardAdjuvants(state)) leaveFormulate();
}
function formulateKey(event) {
  const code = event.code;
  if ([...MOVE_KEYS, 'Space', 'Enter', 'KeyX', 'KeyR', 'KeyP', 'Escape', 'Digit1', 'Digit2', 'Digit3', 'ShiftLeft', 'ShiftRight'].includes(code)) event.preventDefault();
  if (code === 'Escape' || code === 'KeyP') {
    if (event.repeat) return;
    togglePause(state);
    syncUI();
    return;
  }
  const now = performance.now();
  if (!draftGate.accept(code, now, event.repeat)) return;
  // The reveal can be skipped after 0.4 s (the gate already waits 0.5 s);
  // the skipping press does nothing else.
  if (!ui.fRevealed && now - draftGate.openedAt >= 400 && skipReveal()) return;
  const n = state.run?.offer?.ids.length ?? 0;
  if (code === 'ArrowLeft' || code === 'KeyA') return selectSlide(ui.fSel - 1);
  if (code === 'ArrowRight' || code === 'KeyD') return selectSlide(ui.fSel + 1);
  if (['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].includes(code)) {
    const i = Number(code.at(-1)) - 1;
    if (i < n) selectSlide(i);
    return;
  }
  if (code === 'KeyR') return doResample();
  if (code === 'KeyS') return doDiscard();
  if (code === 'Enter' || code === 'Space') {
    if (ui.fConfirm) return doDiscard();
    return doPick(ui.fSel);
  }
  if (ui.fConfirm) setConfirm(false);
}
/** Mouse and touch: a click or tap selects a slide; INJECT (on the selected
 * slide or in the footer) or a double-click picks it. Presses obey the same
 * 0.5 s gate as keys. */
fPanel.addEventListener('pointerover', (event) => {
  if (event.pointerType !== 'mouse') return;
  const slide = event.target.closest('.slide');
  if (slide) selectSlide(Number(slide.dataset.slot), { focus: false });
});
fPanel.addEventListener('click', (event) => {
  const now = performance.now();
  if (draftGate.locked(now)) return;
  if (!ui.fRevealed && skipReveal()) return;
  const act = event.target.closest('[data-act]')?.dataset.act;
  if (act === 'inject') return doPick(ui.fSel);
  if (act === 'resample') return doResample();
  if (act === 'discard') return doDiscard();
  const slide = event.target.closest('.slide');
  if (!slide) return;
  const i = Number(slide.dataset.slot);
  if (ui.fConfirm) setConfirm(false);
  // The INJECT label shows on the selected slide; a click on it picks.
  if (i === ui.fSel && event.target.closest('.inject-cta') && slide.classList.contains('selected')) return doPick(i);
  // Keyboard activation of a focused slide (Enter/Space on the button) is
  // handled by the keydown gate; a pointer click only selects.
  if (event.detail === 0) return;
  selectSlide(i);
});
fPanel.addEventListener('dblclick', (event) => {
  if (draftGate.locked(performance.now())) return;
  const slide = event.target.closest('.slide');
  if (slide) doPick(Number(slide.dataset.slot));
});

// ---- Keyboard --------------------------------------------------------------------
const MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
function moveFocus(delta) {
  const items = ui.screen === 'map' ? [...document.querySelectorAll('#tray-tabs button, #tray-rows button:not(:disabled), #map-back')] : [...document.querySelectorAll('#actions .row:not([hidden])')];
  if (!items.length) return;
  const index = items.indexOf(document.activeElement);
  items[index < 0 ? 0 : (index + delta + items.length) % items.length].focus({ preventScroll: true });
}
window.addEventListener('keydown', (event) => {
  held.add(event.code);
  if (!inputEnabled) return;
  const code = event.code;
  const onButton = event.target instanceof HTMLButtonElement;
  const screen = ui.screen;
  if (screen === 'lost' && (code === 'Space' || code === 'Enter') && (event.repeat || performance.now() < (ui.lockUntil || 0))) {
    event.preventDefault(); // also blocks a focused button's native activation
    return;
  }
  const nativeActivate = onButton && (code === 'Space' || code === 'Enter');
  if (!nativeActivate && [...MOVE_KEYS, 'Space', 'KeyX', 'KeyP', 'KeyR', 'Escape', 'ShiftLeft', 'ShiftRight'].includes(code)) event.preventDefault();
  if (ui.attract !== 'title' && state.phase === 'title' && !['Space', 'Enter'].includes(code)) {
    wake();
    syncUI();
    return;
  }
  ui.idle = 0;
  if (screen === 'formulate') return formulateKey(event);
  if (screen && screen !== 'report') {
    if (code === 'Escape') {
      if (screen === 'map') closeMap();
      else if (screen === 'controls') {
        ui.controlsOpen = false;
        syncUI();
      } else if (screen === 'pause') {
        resume();
        syncUI();
        focusGame();
      }
      return;
    }
    if (screen === 'lost' && code === 'ArrowDown' && !onButton) return openMap();
    if (code === 'ArrowUp' || code === 'ArrowDown') return moveFocus(code === 'ArrowUp' ? -1 : 1);
    if (screen === 'map' && (code === 'ArrowLeft' || code === 'ArrowRight')) return moveFocus(code === 'ArrowLeft' ? -1 : 1);
    if (onButton && (code === 'Space' || code === 'Enter')) return;
    if (screen === 'lost' && (event.repeat || performance.now() < (ui.lockUntil || 0))) return;
    if (screen === 'lost' && (code === 'Space' || code === 'Enter') && $('#easy-button').classList.contains('primary')) return $('#easy-button').click();
    if ((code === 'Space' || code === 'Enter') && !['map', 'controls', 'pause'].includes(screen)) return primaryAction();
    if (code === 'KeyP' && screen === 'pause') {
      resume();
      syncUI();
      focusGame();
      return;
    }
    if (code === 'KeyR' && ['pause', 'lost', 'won', 'practice'].includes(screen)) return retrySector();
    return;
  }
  if (screen === 'report' && (code === 'Space' || code === 'Enter')) {
    if (!event.repeat) primaryAction();
    return;
  }
  if (onButton && ['Space', 'Enter'].includes(code)) return;
  if (MOVE_KEYS.includes(code)) pointer = null;
  if (event.repeat) return;
  // Latch a SOAP tap for a couple of frames: a press and release between two
  // slow frames must still count as one burst.
  if (code === 'Space' || code === 'KeyX') bombPulse = Math.max(bombPulse, 2);
  if (code === 'KeyP' || code === 'Escape') {
    togglePause(state);
    audio.setSuspended(!!state.paused);
    syncUI();
  }
  if (code === 'KeyR' && state.phase !== 'title') retrySector();
});
window.addEventListener('keyup', (event) => {
  held.delete(event.code);
  locked.delete(event.code);
  draftGate.release(event.code);
});
window.addEventListener('blur', () => {
  releaseAll();
  if (['playing', 'transition', 'draft'].includes(state.phase) && !state.paused) {
    state.paused = true;
    // A hidden or blurred tab may stop requestAnimationFrame first, so the
    // audio is suspended here directly as well as by the frame loop.
    audio.setSuspended(true);
    syncUI();
  }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  releaseAll();
  if (['playing', 'transition'].includes(state.phase)) {
    state.paused = true;
    audio.setSuspended(true);
  }
  syncUI();
});

// ---- Pointer: the mouse leads the syringe; touch drags it relatively -----------
const boardPoint = (event) => view?.pick(event.clientX, event.clientY);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
// The mouse steers only while the left button is held, and only from points on
// the board (never from the side panels): moving the mouse while playing on
// the keyboard must never hijack the syringe (playtest).
const onBoard = (p) => p && Math.abs(p.x) <= RULES.halfWidth && p.z >= RULES.back && p.z <= RULES.front;
canvas.addEventListener('pointermove', (event) => {
  if (!inputEnabled || event.pointerType !== 'mouse') return;
  ui.idle = 0;
  // A button released outside the page sends no pointerup here: trust the
  // live button mask, so a stuck "held" state can never steer the syringe
  // (or hold the SOAP edge down and swallow Space presses).
  if (mouseFocus && !(event.buttons & 1)) {
    mouseFocus = false;
    pointer = null;
  }
  if (mouseBomb && !(event.buttons & 2)) mouseBomb = false;
  if (!mouseFocus) return;
  const p = boardPoint(event);
  if (onBoard(p)) pointer = p;
});
canvas.addEventListener('pointerdown', (event) => {
  focusGame();
  wake();
  if (event.pointerType !== 'mouse') return padDown(event, canvas);
  if (event.button === 0) {
    const p = boardPoint(event);
    if (onBoard(p)) {
      pointer = p;
      mouseFocus = true; // here: "steering"
    }
  }
  if (event.button === 2) mouseBomb = true;
});
window.addEventListener('pointerup', (event) => {
  if (event.pointerType !== 'mouse') return;
  if (event.button === 0) {
    mouseFocus = false;
    pointer = null;
  }
  if (event.button === 2) mouseBomb = false;
});
const pad = $('#touch-fire');
function padDown(event, element) {
  event.preventDefault();
  if (!inputEnabled) return;
  try {
    element.setPointerCapture(event.pointerId);
  } catch {
    /* Synthetic pointers may not support capture. */
  }
  const p = boardPoint(event) || { x: 0, z: 0 };
  // Relative drag: finger travel maps 1:1 onto the board, so the finger never
  // has to cover the syringe.
  drag = { id: event.pointerId, px: p.x, pz: p.z, x: state.ship.x, z: state.ship.z };
  $('#pad-hint').classList.add('used');
}
/** The target moves with the finger and stops at the box edge: travel past
 * an edge is not banked, so coming back moves the syringe at once (an
 * absolute offset left a dead zone as wide as the overshoot). */
function dragMove(event) {
  const p = boardPoint(event);
  if (!p || !drag) return;
  const b = playBounds(state);
  drag.x = clamp(drag.x + p.x - drag.px, b.minX, b.maxX);
  drag.z = clamp(drag.z + p.z - drag.pz, b.minZ, b.maxZ);
  drag.px = p.x;
  drag.pz = p.z;
}
function padUp(event) {
  if (drag && drag.id !== event.pointerId) return;
  drag = null;
}
pad.addEventListener('pointerdown', (event) => padDown(event, pad));
pad.addEventListener('pointermove', (event) => drag && drag.id === event.pointerId && dragMove(event));
canvas.addEventListener('pointermove', (event) => event.pointerType !== 'mouse' && drag && drag.id === event.pointerId && dragMove(event));
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  pad.addEventListener(type, padUp);
  canvas.addEventListener(type, (event) => event.pointerType !== 'mouse' && padUp(event));
}
$('#touch-bomb').addEventListener('pointerdown', (event) => {
  event.preventDefault();
  bombPulse = 3;
});
$('#touch-bomb').addEventListener('click', (event) => {
  // Keyboard / assistive activation; pointer activation already happened.
  if (event.detail === 0) bombPulse = 3;
});
overlay.addEventListener('pointerdown', () => {
  if (ui.attract !== 'title') {
    wake();
    syncUI();
  }
  ui.idle = 0;
});

function currentInput() {
  const axisX = (active('ArrowRight') || active('KeyD') ? 1 : 0) - (active('ArrowLeft') || active('KeyA') ? 1 : 0);
  const axisZ = (active('ArrowDown') || active('KeyS') ? 1 : 0) - (active('ArrowUp') || active('KeyW') ? 1 : 0);
  const input = {
    axisX,
    axisZ,
    focus: active('ShiftLeft') || active('ShiftRight'),
    bomb: active('Space') || active('KeyX') || mouseBomb || bombPulse > 0,
  };
  // While the boss defeat plays out before the report, a SOAP press must not
  // release the (not yet visible) report.
  if (performance.now() < (ui.reportAt || 0) && state.phase !== 'playing') input.bomb = false;
  if (drag) {
    // During the respawn glide the finger's target follows the syringe, so
    // control resumes from where it appears, never by zipping back to where
    // it was hit; a QUARANTINE narrows the target with the syringe.
    const b = playBounds(state);
    if (state.ship.respawn > 0) [drag.x, drag.z] = [state.ship.x, state.ship.z];
    drag.x = clamp(drag.x, b.minX, b.maxX);
    drag.z = clamp(drag.z, b.minZ, b.maxZ);
  }
  if (!axisX && !axisZ) {
    if (drag) Object.assign(input, { targetX: drag.x, targetZ: drag.z, drag: true });
    else if (pointer) Object.assign(input, { targetX: pointer.x, targetZ: pointer.z });
  }
  return input;
}
/** A SOAP tap is latched for a couple of simulated frames: a press and
 * release between two steps must still count as one burst. The pulse only
 * runs down on frames that simulate (at 240 Hz every other frame does not). */
function spendPulse() {
  if (bombPulse > 0) bombPulse--;
}

// ---- Attract mode: logo -> live demo -> top scores -> controls -------------------
function leaveDemo() {
  if (ui.demo) {
    ui.demo = null;
    view?.reset();
  }
}
function tickAttract(dt) {
  if (state.phase !== 'title' || ui.mapOpen || ui.controlsOpen || !inputEnabled) {
    ui.idle = 0;
    if (ui.attract !== 'title') {
      leaveDemo();
      ui.attract = 'title';
    }
    return;
  }
  ui.idle += dt;
  ui.attractTime += dt;
  const next = (mode) => {
    ui.attract = mode;
    ui.attractTime = 0;
  };
  if (ui.attract === 'title' && ui.idle > 8) {
    const demo = createState({ seed: freshSeed(), stage: 1 });
    startGame(demo);
    ui.demo = demo;
    ui.demoFrame = 0;
    view?.reset();
    next('demo');
  } else if (ui.attract === 'demo' && (ui.attractTime > 22 || !ui.demo || ui.demo.phase !== 'playing')) {
    leaveDemo();
    next('scores');
  } else if (ui.attract === 'scores' && ui.attractTime > 5) next('attract-controls');
  else if (ui.attract === 'attract-controls' && ui.attractTime > 6) {
    next('title');
    ui.idle = 0;
  }
}

// ---- QA interface -------------------------------------------------------------
// Development inspection stays out of the product controls. Tests may inspect or
// set explicit edge-case fixtures; normal play never writes model state directly.
window.__game = {
  getState: () => snapshot(state),
  getAudio: () => ({ enabled: audio.enabled, context: audio.contextState }),
  start: () => beginPlay(() => startGame(state)),
  restart: () => {
    restartGame(state);
    syncUI();
  },
  menu: openMap,
  confirm: () => confirmReport(state),
  newRun: (seed = freshSeed()) => {
    runId++;
    newRun(state, seed);
    ui.mapOpen = false;
    syncUI();
    view?.render(state, 0);
  },
  checkpoint: (stage) => {
    const result = stage ? selectStage(state, stage) : restartGame(state);
    ui.mapOpen = false;
    syncUI();
    view?.render(state, 0);
    return result;
  },
  practice: (stage, card = null, boss = null) => {
    const result = startPractice(state, stage, { card, boss });
    ui.mapOpen = false;
    syncUI();
    view?.render(state, 0);
    return result;
  },
  bomb: () => useBomb(state),
  /** The run's draft state (QA): deck, pity, tokens, titer and the offer. */
  run: () => (state.run ? structuredClone({ ...state.run, kit: { potency: state.kit.potency, limit: state.kit.limit, atLimit: state.kit.atLimit } }) : null),
  /** FORMULATE actions, exactly as the screen calls them. */
  draft: { pick: (i) => doPick(i), resample: () => doResample(), discard: () => (doDiscard(), doDiscard()), skip: () => skipReveal(), screen: () => ({ selected: ui.fSel, revealed: ui.fRevealed, confirm: ui.fConfirm, key: ui.fKey }) },
  /** QA fixture only: hand the run a deck (normal play never calls this). */
  setDeck: (ids) => {
    if (!state.run) return false;
    state.run.deck = ids.filter((id) => CARD[id]).map((id) => ({ id, at: state.wave }));
    refreshKit(state);
    state.ship.coat = state.kit.coatMax;
    syncUI();
    view?.render(state, 0);
    return true;
  },
  saved: () => load(KEYS.run, null),
  /** Dev-only collider overlay (also ?hitboxes=1). Never shown to players by default. */
  hitboxes: (on = true) => {
    view?.setHitboxes(on);
    view?.render(state, 0);
    return !!view?.hitboxes;
  },
  /** QA: drawn body footprints vs colliders and faces vs silhouettes (render.mjs audit). */
  audit: () => view?.audit(state) ?? null,
  /** Dev-only: draw one layer alone ('marker', 'bullets', 'graze') for pixel measurement. */
  probe: (layer) => !!view?.probe(state, layer),
  setDifficulty: (d) => {
    store.difficulty = d === 'easy' ? 'easy' : 'normal';
    setDifficulty(state, store.difficulty);
    syncDifficultyButtons();
  },
  pause: () => {
    togglePause(state);
    syncUI();
  },
  step: (seconds = 1 / 60, input = {}, options = {}) => {
    update(state, seconds, input);
    if (options.render !== false) {
      handleEvents(state.events, state, true);
      syncUI();
      view?.render(state, 0);
    }
    return snapshot(state);
  },
  setState: (patch) => {
    for (const key of ['phase', 'paused', 'health', 'lives', 'score', 'wave', 'enemies', 'shots', 'enemyShots', 'ship', 'waveElapsed', 'transition', 'transitionHold', 'pickups', 'dropCooldown', 'rngState', 'unlockedStage', 'boss', 'chain', 'telegraphs', 'beams', 'failures', 'emitters', 'difficulty', 'run'])
      if (key in patch) {
        if (key === 'ship') Object.assign(state.ship, patch.ship);
        else if (key === 'boss' && state.boss && patch.boss) Object.assign(state.boss, structuredClone(patch.boss));
        else state[key] = structuredClone(patch[key]);
      }
    // Bare fixture bullets get a family and a source, so a hit always has a cause.
    if ('enemyShots' in patch) for (const b of state.enemyShots) normalizeBullet(b);
    if ('health' in patch) state.lives = state.health;
    if ('lives' in patch) state.health = state.lives;
    syncUI();
    view?.render(state, 0);
  },
  renderer: () =>
    view
      ? view.info(state)
      : { type: 'WebGLRenderer', webgl: false, triangles: 0, viewport: { width: stage.clientWidth, height: stage.clientHeight }, framingProjection: [] },
};

// ---- Boot ------------------------------------------------------------------------
async function boot() {
  const { createRenderer } = await import('./render.mjs');
  view = createRenderer({ canvas, stage, settings });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    state.paused = true;
    inputEnabled = false;
    $('#graphics-error h2').textContent = 'The graphics connection paused.';
    $('#graphics-error p').textContent = 'Reload this cabinet to restore its 3D scene.';
    $('#graphics-error').hidden = false;
    overlay.hidden = true;
  });
  if (new URLSearchParams(location.search).get('hitboxes') === '1') view.setHitboxes(true);
  new ResizeObserver(syncLayout).observe(cabinet);
  syncLayout();
  view.render(state, 0);
  syncUI();
  const clock = createClock();
  // QA: ?smooth=1 forces the interpolated view a 144 Hz display would get.
  const forceSmooth = new URLSearchParams(location.search).get('smooth') === '1';
  let prevPositions = null,
    prevOf = null;
  function frame(timestamp) {
    // The simulation runs whole 1/120 s steps on a fixed grid (clock.mjs):
    // stalls advance at most 50 ms; menu timers (idle, countdown) use real
    // elapsed time instead.
    const real = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 1) : 0;
    const dt = Math.min(real, 0.05);
    lastFrame = timestamp;
    tickAttract(real);
    advanceClock(clock, real);
    if (forceSmooth) clock.smooth = true;
    const demo = ui.attract === 'demo' && ui.demo;
    const shown = demo ? ui.demo : state;
    // One input record per rendered frame, applied to each of its steps; a
    // press is an edge on the first of them only (model.mjs).
    const input = demo ? null : currentInput();
    for (let i = 0; i < clock.steps; i++) {
      if (i === clock.steps - 1) {
        prevPositions = clock.smooth ? capturePositions(shown) : null;
        prevOf = shown;
      }
      if (demo) {
        // The autopilot decides once per 1/60 s, as in the tests.
        if ((ui.demoSteps = (ui.demoSteps || 0) + 1) % 2 === 1 || !ui.demoInput) ui.demoInput = chooseInput(ui.demo, ui.demoFrame++);
        update(ui.demo, STEP, ui.demoInput);
        handleEvents(ui.demo.events, ui.demo, false);
      } else {
        update(state, STEP, input);
        handleEvents(state.events, state, true);
      }
    }
    if (clock.steps && !demo) spendPulse();
    if (!demo) noteBoss(state);
    audio.setSuspended(!!shown.paused);
    audio.tick(shown, shown.phase === 'playing' && !shown.paused && ui.attract !== 'demo');
    if (ui.screen === 'lost') {
      const left = Math.max(0, Math.ceil(9 - ui.lostTime));
      const label = document.getElementById('countdown-text');
      if (label && label.textContent !== `CONTINUE? ${left}`) label.textContent = `CONTINUE? ${left}`;
      if ((ui.lostTime += real) > 9 && !state.practice) {
        // Countdown expired: back to attract mode. Unlocks and medals are kept.
        recordScore();
        openMenu(state);
        ui.attract = 'title';
        ui.idle = 0;
      }
    }
    const drawn = clock.smooth && prevOf === shown ? interpolatedView(shown, prevPositions, clock.alpha) : shown;
    // FORMULATE: nothing simulates, so the board is drawn once, copied into
    // the screen's backdrop and the WebGL canvas is hidden until the pick.
    // Redrawing a static scene under the glass slides every frame cost
    // SwiftShader 5-13 fps (vs 61 held), and merely skipping renders left a
    // non-preserved drawing buffer that captures showed as garbage.
    const hold = !demo && state.phase === 'draft' && !state.paused ? `${ui.fKey}|${stage.clientWidth}x${stage.clientHeight}` : '';
    if (!hold || hold !== ui.heldFrame) {
      const flash = view.render(drawn, dt);
      $('#damage-flash').style.opacity = String(flash);
      if (hold) {
        try {
          // Read in the same task as the render, before the buffer is presented.
          $('#formulate').style.setProperty('--board', `url(${canvas.toDataURL('image/jpeg', 0.85)})`);
          canvas.style.visibility = 'hidden';
        } catch {
          ui.heldFrame = '';
        }
      }
    }
    if (!hold && canvas.style.visibility) canvas.style.visibility = '';
    if (hold !== ui.heldFrame && !(hold && canvas.style.visibility !== 'hidden')) ui.heldFrame = hold;
    syncUI();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
syncUI();
boot().catch((error) => {
  inputEnabled = false;
  overlay.hidden = true;
  $('#graphics-error').hidden = false;
  window.__game.graphicsError = String(error);
});
