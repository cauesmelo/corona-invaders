/** Browser shell: input, lab-instrument screens, attract mode and persistence.
 * The rules live in model.mjs; the scene in render.mjs. This file never edits
 * model state except through the same actions a player has (and the explicit
 * QA fixture hook `__game.setState`, which normal play never calls).
 */
import {
  RULES,
  STAGE_COUNT,
  createState,
  newRun,
  selectStage,
  openMenu,
  startGame,
  restartGame,
  confirmReport,
  assistAvailable,
  shoot,
  activateShield,
  togglePause,
  update,
  snapshot,
  bossStatus,
  getLevel,
  getWorld,
  WORLDS,
  LEVELS,
  chainMultiplier,
} from './model.mjs';
import { chooseInput } from './autopilot.mjs';
import { createAudio } from './audio.mjs';
import { matrix, segments, vial, medalRing, nodeIcon, ICONS, controlsCard, fmtTime, KEYCAP } from './ui.mjs';

const $ = (sel) => document.querySelector(sel);
const KEYS = {
  unlocked: 'corona-invaders-v4-unlocked',
  medals: 'corona-invaders-v4-medals',
  scores: 'corona-invaders-v4-scores',
  effects: 'corona-invaders-v4-effects',
  seen: 'corona-invaders-v4-seen',
  sound: 'corona-invaders-v4-sound',
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
};
const settings = { effects: () => store.effects === 'full' && !reducedMotionQuery.matches };

const state = createState({ seed: freshSeed() });
state.unlockedStage = store.unlocked;
const cabinet = $('.cabinet'),
  stage = $('#stage'),
  canvas = $('#game'),
  overlay = $('#overlay'),
  playButton = $('#play-button');
const audio = createAudio();
// Sound is ON by default (user request, rev 4) and the choice is remembered.
// Browsers only allow an AudioContext after a user gesture, so the preference
// is applied on the first key/pointer/button press rather than at load.
const soundPref = { on: load(KEYS.sound, true) !== false };
function applySoundPref() {
  if (soundPref.on && !audio.enabled) audio.setEnabled(true, { quiet: true });
}
for (const type of ['pointerdown', 'keydown', 'touchstart'])
  window.addEventListener(type, applySoundPref, { capture: true, passive: true });
const keys = new Set();
let view = null,
  inputEnabled = true,
  pointerTarget,
  pointerFiring = false,
  drag = null,
  lastFrame = 0,
  runId = 1;
const ui = {
  screen: '',
  mapOpen: false,
  controlsOpen: false,
  assist: false,
  attract: 'title',
  attractTime: 0,
  idle: 0,
  lostTime: 0,
  demo: null,
  demoFrame: 0,
  cache: {},
  crackedUntil: 0,
  lastHealth: 3,
  bossPhase: 0,
  timers: {},
};

// ---- Small DOM helpers ---------------------------------------------------------
function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}
function setHTML(key, el, html) {
  if (ui.cache[key] === html) return;
  ui.cache[key] = html;
  el.innerHTML = html;
}
function flashElement(id, ms, apply) {
  const el = $(id);
  clearTimeout(ui.timers[id]);
  el.hidden = true;
  void el.offsetWidth; // restart CSS animation
  apply?.(el);
  el.hidden = false;
  ui.timers[id] = setTimeout(() => (el.hidden = true), ms);
}
function pickupIcon(kind, color) {
  const paths = {
    rapid: '<path d="M5 15l7-6 7 6M5 20l7-6 7 6"/>',
    spread: '<path d="M12 21V5M12 13L6 4M12 13l6-9"/>',
    shield: '<circle cx="12" cy="12" r="7"/>',
    repair: '<path d="M12 5v14M5 12h14"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind]}</svg>`;
}
const PICKUP = {
  rapid: ['RAPID', '#ffe27a'],
  spread: ['SPREAD', '#c3a6ff'],
  shield: ['SHIELD', '#6fe8ff'],
  repair: ['REPAIR', '#91ffce'],
};

// ---- Persistence of progress, medals and high scores ----------------------------
const RANK = { bronze: 1, silver: 2, gold: 3 };
function recordSector(ev) {
  const prev = store.medals[ev.stage] || {};
  const better = (RANK[ev.medal] || 0) > (RANK[prev.medal] || 0) || (ev.medal === prev.medal && prev.assisted && !ev.assisted);
  store.medals[ev.stage] = {
    medal: better ? ev.medal : prev.medal,
    assisted: better ? !!ev.assisted : !!prev.assisted,
    best: Math.max(prev.best || 0, ev.sectorScore || 0),
  };
  save(KEYS.medals, store.medals);
}
function recordScore() {
  if (state.score <= 0) return;
  const entry = store.scores.find((s) => s.run === runId && s.session === sessionId);
  if (entry) {
    entry.score = Math.max(entry.score, state.score);
    entry.code = getLevel(state.wave).code;
  } else store.scores.push({ run: runId, session: sessionId, score: state.score, code: getLevel(state.wave).code });
  store.scores.sort((a, b) => b.score - a.score);
  store.scores = store.scores.slice(0, 5);
  save(KEYS.scores, store.scores);
}
const sessionId = freshSeed();
function persistUnlock() {
  if (state.unlockedStage > store.unlocked) {
    store.unlocked = state.unlockedStage;
    save(KEYS.unlocked, store.unlocked);
  }
  state.unlockedStage = Math.max(state.unlockedStage, store.unlocked);
}

// ---- Event handling: audio, renderer juice, HUD moments ------------------------
function handleEvents(list, s, live) {
  if (!list.length) return;
  view?.events(list, s);
  for (const ev of list) {
    // The attract demo stays silent; only the player's run makes sound.
    if (!live) continue;
    audio.event(ev, s);
    if (ev.type === 'wave') {
      recordSector(ev);
      persistUnlock();
      if (!ev.worldEnd && ev.stage !== STAGE_COUNT) showTally(ev);
    } else if (ev.type === 'wave-start') showIntro();
    else if (ev.type === 'phase-break') {
      flashElement('#callout', 1250, (el) => {
        el.textContent = ev.name;
        el.classList.remove('long');
      });
      const track = $('#boss-track');
      track.classList.remove('shatter');
      void track.offsetWidth;
      track.classList.add('shatter');
    } else if (ev.type === 'chain-tier') {
      const chip = $('#chain');
      chip.classList.remove('bump');
      void chip.offsetWidth;
      chip.classList.add('bump');
    } else if (ev.type === 'damage') ui.crackedUntil = performance.now() + 650;
    else if (ev.type === 'lost' || ev.type === 'won') recordScore();
  }
}

function showIntro() {
  const level = getLevel(state.wave);
  const icon = level.intro?.icon;
  const fresh = icon && !store.seen.has(level.code);
  if (level.kind === 'boss') {
    // Boss sectors: the VIRAL LOAD bar owns the top band (its tag shows the
    // sector code), so a first-time hint appears as a callout while the boss
    // slides in and nothing is attacking yet.
    $('#intro-card').hidden = true;
    if (fresh) {
      store.seen.add(level.code);
      save(KEYS.seen, [...store.seen]);
      flashElement('#callout', 2200, (el) => {
        el.textContent = level.intro.text;
        el.classList.add('long');
      });
    }
    return;
  }
  setText($('#intro-code'), level.code);
  setText($('#intro-name'), level.name);
  const line = $('#intro-new');
  line.hidden = !fresh;
  if (fresh) {
    line.innerHTML = `<b>NEW</b>${ICONS[icon] || ''}<span>${level.intro.text}</span>`;
    store.seen.add(level.code);
    save(KEYS.seen, [...store.seen]);
  }
  flashElement('#intro-card', fresh ? 2450 : 1450, (el) => el.classList.toggle('short', !fresh));
}
function showTally(ev) {
  const medal = ev.medal;
  const label = medal ? `★ ${medal.toUpperCase()}${ev.assisted ? ' A' : ''}` : '';
  const parts =
    ev.bonusTotal > 0
      ? [`HITS <b>${ev.bonusHits}/${ev.bonusTotal}</b>`, `BONUS <b>+${ev.bonus}</b>`]
      : [`CLEAR <b>+${ev.bonus}</b>`, `CHAIN <b>×${ev.chain}</b>`];
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
  if (p === 'won') return 'won';
  if (p === 'transition' && state.transitionHold) return 'report';
  return '';
}
const ROWS = ['play-button', 'assist-button', 'retry-button', 'menu-button', 'sound-button', 'effects-button', 'controls-button', 'back-button'];
function configure(screen) {
  const visible = {
    title: ['play-button'],
    demo: ['play-button'],
    scores: ['play-button'],
    'attract-controls': ['play-button'],
    pause: ['play-button', 'retry-button', 'menu-button', 'sound-button', 'effects-button', 'controls-button'],
    controls: ['back-button'],
    lost: ['play-button', 'menu-button', ...(assistAvailable(state) ? ['assist-button'] : [])],
    won: ['play-button', 'menu-button'],
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
  heading.classList.toggle('logo', screen === 'title');
  playButton.classList.toggle('blink', ['title', 'demo', 'scores', 'attract-controls'].includes(screen));
  tag.textContent = '';
  body.innerHTML = '';
  const touch = touchQuery.matches;
  if (['title', 'demo', 'scores', 'attract-controls'].includes(screen)) {
    playButton.textContent = touch ? 'TAP TO START' : 'PRESS FIRE';
    // Device-matched one-line controls under the primary action (first 30 s).
    $('#title-controls').innerHTML = touch
      ? '<span>DRAG <b>MOVE</b></span><span>HOLD <b>FIRE</b></span><span>◎ <b>SHIELD</b></span>'
      : `<span>${KEYCAP('←')}${KEYCAP('→')}<b>MOVE</b></span><span>${KEYCAP('SPACE', true)}<b>FIRE</b></span><span>${KEYCAP('SHIFT', true)}<b>SHIELD</b></span>`;
    if (screen === 'title' || screen === 'demo') heading.innerHTML = matrix('CORONA') + matrix('INVADERS');
    if (screen === 'scores') {
      heading.innerHTML = matrix('TOP CULTURES');
      body.innerHTML = store.scores.length
        ? `<div class="scores">${store.scores
            .map((s, i) => `<div><span>${i + 1}. ${s.code}</span>${segments(String(s.score).padStart(6, '0'))}</div>`)
            .join('')}</div>`
        : '<div class="scores"><div><span>NO CULTURES YET</span></div></div>';
    }
    if (screen === 'attract-controls') {
      heading.innerHTML = matrix('CONTROLS');
      body.innerHTML = controlsCard(touch);
    }
    const best = store.scores[0]?.score || 0;
    $('#hiscore').innerHTML = best ? `HI ${segments(String(best).padStart(6, '0'))}` : '';
  } else if (screen === 'pause') {
    heading.innerHTML = matrix('ON HOLD');
    tag.textContent = `SPECIMEN ${level.code}`;
    playButton.textContent = 'RESUME';
    $('#retry-button').innerHTML = `RETRY SECTOR <span class="hint">R</span>`;
    $('#menu-button').innerHTML = `SECTOR MAP <span class="hint">TRAY</span>`;
  } else if (screen === 'controls') {
    heading.innerHTML = matrix('CONTROLS');
    body.innerHTML = controlsCard(touch);
  } else if (screen === 'lost') {
    heading.innerHTML = matrix('CONTAINMENT') + matrix('LOST');
    tag.textContent = `SECTOR ${level.code}`;
    const cause = state.lastCause || { by: 'VIRUS', at: state.waveElapsed };
    const by = /breach/i.test(cause.by) ? 'Formation reached your row' : `Hit by ${cause.by}`;
    body.innerHTML = `<div class="cause">${ICONS.boss}<strong>${by}</strong><span>${level.code} ${level.name} · ${fmtTime(cause.at)}</span></div><div class="countdown-row"><span id="countdown-text">CONTINUE? 9</span><span>${touch ? 'TAP' : 'FIRE'} TO RETRY</span></div><span class="countdown"><i></i></span>`;
    playButton.innerHTML = `RETRY SECTOR <span class="hint">${touch ? 'TAP' : 'FIRE'}</span>`;
    $('#menu-button').innerHTML = `SECTOR MAP <span class="hint">↓</span>`;
    syncAssistButton();
    ui.lostTime = 0;
  } else if (screen === 'won') {
    heading.innerHTML = matrix('CONTAINED');
    tag.textContent = 'CAMPAIGN COMPLETE';
    const counts = { gold: 0, silver: 0, bronze: 0 };
    for (const r of Object.values(state.medals)) counts[r.medal]++;
    body.innerHTML = `<div class="report">${Object.entries(counts)
      .map(([m, n]) => `<div>${medalRing(m)}<span>${m.toUpperCase()}</span><b>${n}</b><span></span></div>`)
      .join('')}<div class="total"><span>SCORE</span>${segments(String(state.score).padStart(6, '0'))}</div></div>`;
    playButton.textContent = 'NEW CAMPAIGN';
    $('#menu-button').innerHTML = `SECTOR MAP <span class="hint">TRAY</span>`;
  } else if (screen === 'report') {
    const world = WORLDS[level.world - 1];
    heading.innerHTML = matrix('LAB REPORT');
    tag.textContent = `WORLD ${world.id} · ${world.name}`;
    const rows = LEVELS.filter((l) => l.world === world.id && l.kind !== 'bonus')
      .map((l) => {
        const r = state.medals[l.id];
        return `<div><b>${l.code}</b><span>${l.name}</span><span>${r ? r.sectorScore : '—'}</span>${medalRing(r?.medal, r?.assisted)}</div>`;
      })
      .join('');
    body.innerHTML = `<div class="report">${rows}<div class="total"><span>SCORE</span>${segments(String(state.score).padStart(6, '0'))}</div></div>`;
    playButton.innerHTML = `CONTINUE <span class="hint">${touch ? 'TAP' : 'FIRE'}</span>`;
  } else if (screen === 'map') renderMap();
  syncSoundButtons();
  syncEffectsButton();
  focusPrimary(screen);
}
function focusPrimary(screen) {
  if (!screen || screen === 'demo') return;
  // Focus at once so Enter/Space act on the new screen's primary action even on
  // a slow frame; the hidden previous control would otherwise drop focus to body.
  const target =
    screen === 'map'
      ? $(`#tray-rows [data-stage="${Math.min(state.wave, state.unlockedStage)}"]`) || $('#map-back')
      : screen === 'controls'
        ? $('#back-button')
        : playButton;
  target?.focus({ preventScroll: true });
}
function syncAssistButton() {
  const b = $('#assist-button');
  b.setAttribute('aria-pressed', String(ui.assist));
  b.innerHTML = `+1 VIAL ASSIST <span class="hint">${ui.assist ? 'ON · MEDAL A' : 'OFF'}</span>`;
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
function renderMap() {
  setHTML('map-heading', $('#map-heading'), matrix('SPECIMEN TRAY'));
  const rows = WORLDS.map((w) => {
    const levels = LEVELS.filter((l) => l.world === w.id);
    const dish = (l, mini = false) => {
      const locked = l.id > state.unlockedStage;
      const m = store.medals[l.id] || {};
      const best = m.best ? (m.best >= 10000 ? `${Math.floor(m.best / 1000)}K` : String(m.best)) : '';
      return `<button class="dish ${mini ? 'mini' : ''} ${m.medal || ''} ${l.id === state.wave ? 'current' : ''}" type="button" data-stage="${l.id}" ${
        locked ? 'disabled aria-label="' + l.code + ' sealed"' : `aria-label="${l.code} ${l.name}${m.medal ? ', ' + m.medal + ' medal' : ''}"`
      }><b>${locked ? '⊘' : l.code}</b>${!mini && best ? `<small>${best}</small>` : ''}${locked ? '' : medalRing(m.medal, m.assisted)}</button>`;
    };
    const bonus = levels.filter((l) => l.kind === 'bonus');
    return `<div class="tray-world"><div class="tray-label"><span>W${w.id} ${w.name}</span>${bonus.map((l) => dish(l, true)).join('')}</div><div class="dishes">${levels
      .filter((l) => l.kind !== 'bonus')
      .map((l) => dish(l))
      .join('')}</div></div>`;
  }).join('');
  $('#tray-rows').innerHTML = rows;
}

// ---- Per-frame HUD -------------------------------------------------------------
function syncHUD(s) {
  cabinet.dataset.phase = ui.screen === 'demo' ? 'demo' : s.paused ? 'paused' : s.phase;
  stage.classList.toggle('held', !!s.paused || (s.phase === 'transition' && s.transitionHold));
  const scoreText = String(s.score).padStart(6, '0');
  setHTML('score', $('#score'), segments(scoreText));
  $('#score').setAttribute('aria-label', `Score ${s.score}`);
  const mult = chainMultiplier(s.chain.count);
  const chip = $('#chain');
  chip.hidden = mult < 2 || !['playing', 'transition'].includes(s.phase);
  setText(chip, `×${mult}`);
  const slots = Math.max(RULES.maxHealth, s.health);
  const cracked = performance.now() < ui.crackedUntil;
  const vials = Array.from({ length: slots }, (_, i) =>
    vial(i < s.health ? (i >= RULES.maxHealth ? 'assist' : 'full') : cracked && i === s.health ? 'cracked' : 'empty'),
  ).join('');
  setHTML('vials', $('#lives'), vials);
  $('#lives').setAttribute('aria-label', `${s.health} of ${slots} doses`);
  const level = getLevel(s.wave);
  setText($('#sector-code'), level.code);
  setText($('#sector-world'), getWorld(s.wave).name);
  $('#pause-button').setAttribute('aria-label', s.paused ? 'Resume game' : 'Pause game');

  const boss = bossStatus(s),
    panel = $('#boss-status');
  panel.hidden = !boss || s.phase !== 'playing';
  if (boss) {
    const percent = (boss.hp / boss.maxHp) * 100;
    $('#boss-health').style.width = `${percent}%`;
    $('#boss-lag').style.width = `${percent}%`;
    setText($('#boss-label'), boss.name);
    setText($('.boss-tag'), `${getLevel(s.wave).code} VIRAL LOAD`);
    setText($('#boss-numeric'), `${boss.hp} / ${boss.maxHp}`);
    setText($('#boss-pips'), Array.from({ length: boss.phases }, (_, i) => (i < boss.phase ? '◆' : '◇')).join(''));
    setText($('#boss-phase'), `PHASE ${boss.phase} · ${boss.attack}`);
    setHTML('notches', $('#boss-notches'), boss.notches.map((f) => `<i style="left:calc(${(f * 100).toFixed(2)}% - 1px)"></i>`).join(''));
    setHTML(
      'parts',
      $('#boss-parts'),
      boss.parts
        .map((p) => {
          // Omega nodes carry the same attack icon as their 3D silhouette; the
          // part that attacks next is highlighted.
          const icon = p.part === 'node' ? nodeIcon(p.label) : '';
          const cls = [p.alive ? '' : 'dead', icon ? 'icon' : '', p.id === boss.next ? 'next' : ''].join(' ');
          return `<span class="${cls}" title="${p.label}">${icon}<i style="width:${((p.hp / p.maxHp) * 100).toFixed(1)}%"></i></span>`;
        })
        .join(''),
    );
    const track = $('#boss-track');
    track.classList.toggle('exposed', boss.exposed || boss.open);
    track.setAttribute('aria-valuenow', String(boss.hp));
    track.setAttribute('aria-valuemax', String(boss.maxHp));
    track.setAttribute('aria-label', `${boss.name} viral load`);
    track.setAttribute('aria-valuetext', `${boss.hp} of ${boss.maxHp}, phase ${boss.phase} of ${boss.phases}`);
  }
  const effects = Object.entries(s.ship.powerups).filter(([, t]) => t > 0);
  const powerups = $('#powerups');
  powerups.hidden = effects.length === 0;
  setHTML(
    'powerups',
    powerups,
    effects
      .map(([kind, t]) => `<span style="--pickup:${PICKUP[kind][1]}">${pickupIcon(kind, PICKUP[kind][1])}${PICKUP[kind][0]} <b>${Math.ceil(t)}</b></span>`)
      .join(''),
  );
  const shieldBtn = $('#touch-shield');
  const ready = 1 - s.ship.shieldCooldown / RULES.shieldCooldown;
  shieldBtn.style.setProperty('--ready', ready.toFixed(3));
  shieldBtn.classList.toggle('ready', ready >= 1);
  setText(shieldBtn.firstElementChild, ready >= 1 ? 'SHIELD' : `${Math.ceil(s.ship.shieldCooldown)}`);
}

function syncUI() {
  persistUnlock();
  const screen = currentScreen();
  overlay.hidden = !screen;
  if (screen !== ui.screen) {
    ui.screen = screen;
    if (screen) configure(screen);
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
function beginPlay(action) {
  wake();
  keys.clear();
  pointerTarget = undefined;
  audio.resume();
  ui.mapOpen = ui.controlsOpen = false;
  action();
  if (state.phase === 'playing') showIntro();
  syncUI();
  focusGame();
}
function primaryAction() {
  if (!inputEnabled) return;
  const screen = currentScreen();
  if (screen === 'pause') {
    togglePause(state);
    syncUI();
    focusGame();
  } else if (screen === 'lost') beginPlay(() => restartGame(state, { assist: ui.assist }));
  else if (screen === 'won')
    beginPlay(() => {
      runId++;
      newRun(state, freshSeed());
    });
  else if (screen === 'report') {
    confirmReport(state);
    syncUI();
    focusGame();
  } else if (['title', 'demo', 'scores', 'attract-controls'].includes(screen))
    beginPlay(() => {
      runId++;
      newRun(state, freshSeed());
    });
}
function openMap() {
  wake();
  keys.clear();
  ui.mapReturn = null;
  if (state.phase !== 'title') {
    if (state.phase === 'lost') recordScore();
    // Remember exactly what opened the tray (pause, loss or victory) so BACK
    // returns there with progress intact instead of dropping to the title.
    ui.mapReturn = snapshot(state);
    openMenu(state);
  }
  ui.controlsOpen = false;
  ui.mapOpen = true;
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
  beginPlay(() => restartGame(state, { assist: ui.assist && assistAvailable(state) }));
}
function toggleSound() {
  soundPref.on = !soundPref.on;
  save(KEYS.sound, soundPref.on);
  audio.setEnabled(soundPref.on);
  syncSoundButtons();
}

playButton.addEventListener('click', primaryAction);
$('#retry-button').addEventListener('click', retrySector);
$('#menu-button').addEventListener('click', openMap);
$('#map-button').addEventListener('click', openMap);
$('#map-back').addEventListener('click', closeMap);
$('#sound-button').addEventListener('click', toggleSound);
$('#title-sound').addEventListener('click', toggleSound);
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
$('#assist-button').addEventListener('click', () => {
  ui.assist = !ui.assist;
  ui.lostTime = 0;
  syncAssistButton();
});
$('#tray-rows').addEventListener('click', (event) => {
  const dish = event.target.closest('[data-stage]');
  if (!dish || dish.disabled) return;
  const target = Number(dish.dataset.stage);
  ui.mapReturn = null;
  beginPlay(() => {
    runId++;
    selectStage(state, target);
  });
});
$('#pause-button').addEventListener('click', () => {
  if (state.phase === 'title') return;
  togglePause(state);
  ui.controlsOpen = false;
  syncUI();
  if (!state.paused) focusGame();
});

// ---- Keyboard --------------------------------------------------------------------
function moveFocus(delta) {
  const screen = ui.screen;
  const items =
    screen === 'map'
      ? [...document.querySelectorAll('#tray-rows .dish:not(:disabled), #map-back')]
      : [...document.querySelectorAll('#actions .row:not([hidden])')];
  if (!items.length) return;
  const index = items.indexOf(document.activeElement);
  const next = index < 0 ? 0 : (index + delta + items.length) % items.length;
  items[next].focus({ preventScroll: true });
}
window.addEventListener('keydown', (event) => {
  if (!inputEnabled) return;
  const code = event.code;
  const onButton = event.target instanceof HTMLButtonElement;
  const screen = ui.screen;
  // Space/Enter on a focused button must keep their native click activation;
  // cancelling that keydown would silently break keyboard menus.
  const nativeActivate = onButton && (code === 'Space' || code === 'Enter');
  if (!nativeActivate && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyP', 'KeyR', 'Escape', 'ShiftLeft', 'ShiftRight'].includes(code))
    event.preventDefault();
  if (ui.attract !== 'title' && state.phase === 'title' && !['Space', 'Enter'].includes(code)) {
    wake();
    syncUI();
    return;
  }
  ui.idle = 0;
  if (screen && screen !== 'report') {
    if (code === 'Escape') {
      if (screen === 'map') closeMap();
      else if (screen === 'controls') {
        ui.controlsOpen = false;
        syncUI();
      } else if (screen === 'pause') {
        togglePause(state);
        syncUI();
        focusGame();
      }
      return;
    }
    if (screen === 'lost' && code === 'ArrowDown') return openMap();
    if (code === 'ArrowUp' || code === 'ArrowDown') return moveFocus(code === 'ArrowUp' ? -1 : 1);
    if (screen === 'map' && (code === 'ArrowLeft' || code === 'ArrowRight')) return moveFocus(code === 'ArrowLeft' ? -1 : 1);
    if (onButton && (code === 'Space' || code === 'Enter')) return; // native click
    if ((code === 'Space' || code === 'Enter') && screen !== 'map' && screen !== 'controls' && screen !== 'pause') return primaryAction();
    if (code === 'KeyP' && screen === 'pause') {
      togglePause(state);
      syncUI();
      focusGame();
      return;
    }
    if (code === 'KeyR' && ['pause', 'lost', 'won'].includes(screen)) return retrySector();
    return;
  }
  if (screen === 'report' && (code === 'Space' || code === 'Enter')) {
    if (!event.repeat) primaryAction();
    return;
  }
  if (onButton && ['Space', 'Enter'].includes(code)) return;
  keys.add(code);
  if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(code)) pointerTarget = undefined;
  if (event.repeat) return;
  if (code === 'Space' && shoot(state)) handleEvents(state.events.splice(-1), state, true);
  if ((code === 'ShiftLeft' || code === 'ShiftRight') && activateShield(state)) handleEvents(state.events.splice(-1), state, true);
  if (code === 'KeyP' || code === 'Escape') {
    togglePause(state);
    syncUI();
  }
  if (code === 'KeyR' && state.phase !== 'title') retrySector();
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
function releaseAll() {
  keys.clear();
  pointerFiring = false;
  drag = null;
  pointerTarget = undefined;
}
window.addEventListener('blur', () => {
  releaseAll();
  if (['playing', 'transition'].includes(state.phase) && !state.paused) {
    state.paused = true;
    // The frame loop also suspends audio while paused, but a hidden/blurred
    // tab may stop calling requestAnimationFrame first, so suspend directly.
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

// ---- Pointer: mouse steers absolutely; touch uses a relative drag pad -------------
// Relative drag keeps the syringe out from under the finger: the pad covers the
// lower 60% of the stage and moves the ship by the finger's travel (x1.25).
function worldX(event) {
  return view?.pick(event.clientX, event.clientY);
}
canvas.addEventListener('pointermove', (event) => {
  if (!inputEnabled) return;
  ui.idle = 0;
  if (event.pointerType === 'mouse') {
    const x = worldX(event);
    if (Number.isFinite(x)) pointerTarget = x;
  } else if (drag && drag.id === event.pointerId) dragMove(event);
});
canvas.addEventListener('pointerdown', (event) => {
  focusGame();
  wake();
  if (event.pointerType !== 'mouse') return padDown(event, canvas);
  if (event.button === 0 && state.phase === 'playing') {
    pointerFiring = true;
    if (shoot(state)) handleEvents(state.events.splice(-1), state, true);
  }
});
window.addEventListener('pointerup', (event) => {
  if (event.pointerType === 'mouse') pointerFiring = false;
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
  const x = worldX(event);
  drag = { id: event.pointerId, start: Number.isFinite(x) ? x : 0, ship: state.ship.x };
  pointerFiring = true;
  $('#pad-hint').classList.add('used');
  if (shoot(state)) handleEvents(state.events.splice(-1), state, true);
}
function dragMove(event) {
  const x = worldX(event);
  if (!Number.isFinite(x)) return;
  pointerTarget = Math.max(-8.7, Math.min(8.7, drag.ship + (x - drag.start) * 1.25));
}
function padUp(event) {
  if (drag && drag.id !== event.pointerId) return;
  drag = null;
  pointerFiring = false;
  pointerTarget = undefined;
}
pad.addEventListener('pointerdown', (event) => padDown(event, pad));
pad.addEventListener('pointermove', (event) => drag && drag.id === event.pointerId && dragMove(event));
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  pad.addEventListener(type, padUp);
  canvas.addEventListener(type, (event) => event.pointerType !== 'mouse' && padUp(event));
}
$('#touch-shield').addEventListener('pointerdown', (event) => {
  event.preventDefault();
  if (activateShield(state)) handleEvents(state.events.splice(-1), state, true);
});
$('#touch-shield').addEventListener('click', (event) => {
  // Keyboard/assistive activation; pointer activation already happened above.
  if (event.detail === 0 && activateShield(state)) handleEvents(state.events.splice(-1), state, true);
});
overlay.addEventListener('pointerdown', () => {
  if (ui.attract !== 'title') {
    wake();
    syncUI();
  }
  ui.idle = 0;
});

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
  } else if (ui.attract === 'demo' && (ui.attractTime > 20 || !ui.demo || ui.demo.phase !== 'playing')) {
    leaveDemo();
    next('scores');
  } else if (ui.attract === 'scores' && ui.attractTime > 5) next('attract-controls');
  else if (ui.attract === 'attract-controls' && ui.attractTime > 5) {
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
  shoot: () => shoot(state),
  shield: () => activateShield(state),
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
    for (const key of [
      'phase',
      'paused',
      'health',
      'lives',
      'score',
      'wave',
      'enemies',
      'shots',
      'enemyShots',
      'ship',
      'waveElapsed',
      'enemyFireClock',
      'transition',
      'transitionHold',
      'pickups',
      'dropCooldown',
      'rngState',
      'unlockedStage',
      'boss',
      'membranes',
      'chain',
      'telegraphs',
      'beams',
      'failures',
    ])
      if (key in patch) {
        if (key === 'ship') Object.assign(state.ship, patch.ship);
        else if (key === 'boss' && state.boss && patch.boss) Object.assign(state.boss, structuredClone(patch.boss));
        else state[key] = structuredClone(patch[key]);
      }
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
  view.render(state, 0);
  syncUI();
  function frame(timestamp) {
    // Simulation steps are capped at 50 ms so a stalled frame never jumps play
    // forward; menu timers (idle, countdown) use real elapsed time instead.
    const real = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 1) : 0;
    const dt = Math.min(real, 0.05);
    lastFrame = timestamp;
    tickAttract(real);
    let shown = state;
    if (ui.attract === 'demo' && ui.demo) {
      update(ui.demo, dt, chooseInput(ui.demo, ui.demoFrame++));
      handleEvents(ui.demo.events, ui.demo, false);
      shown = ui.demo;
    } else {
      const axis = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      update(state, dt, {
        axis,
        targetX: pointerTarget,
        shoot: keys.has('Space') || pointerFiring,
        shield: keys.has('ShiftLeft') || keys.has('ShiftRight'),
      });
      handleEvents(state.events, state, true);
    }
    audio.setSuspended(!!shown.paused);
    audio.tick(shown, shown.phase === 'playing' && !shown.paused && ui.attract !== 'demo');
    if (ui.screen === 'lost') {
      const left = Math.max(0, Math.ceil(9 - ui.lostTime));
      const label = document.getElementById('countdown-text');
      if (label && label.textContent !== `CONTINUE? ${left}`) label.textContent = `CONTINUE? ${left}`;
    }
    if (ui.screen === 'lost' && (ui.lostTime += real) > 9) {
      // Countdown expired: back to attract mode. Unlocks and medals are kept.
      recordScore();
      openMenu(state);
      ui.attract = 'title';
      ui.idle = 0;
    }
    const flash = view.render(shown, dt);
    $('#damage-flash').style.opacity = String(flash);
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
